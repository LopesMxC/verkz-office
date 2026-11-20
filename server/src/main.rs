//! VERKZ Office — servidor de presença.
//!
//! Responsável por: autenticação simples do time (chave do escritório),
//! posições dos avatares, chat (geral e por sala), status, layout do
//! escritório (salvo em disco) e emissão de tokens do LiveKit para
//! áudio/vídeo/tela. A mídia em si trafega pelo LiveKit (SFU).

use std::{
    collections::HashMap,
    net::SocketAddr,
    path::PathBuf,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::{mpsc, Mutex, RwLock};
use tracing::{info, warn};

#[derive(Clone)]
struct Config {
    office_key: String,
    livekit_url: String,
    livekit_api_key: String,
    livekit_api_secret: String,
    livekit_room: String,
    data_dir: PathBuf,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
struct Peer {
    id: String,
    name: String,
    color: String,
    x: f32,
    z: f32,
    dir: f32,
    moving: bool,
    status: String,
    zone: Option<String>,
    /// Aparência do personagem (cabelo, roupa, acessórios...), definida no app.
    look: Value,
}

struct Conn {
    peer: Peer,
    tx: mpsc::UnboundedSender<String>,
}

struct AppState {
    cfg: Config,
    conns: Mutex<HashMap<String, Conn>>,
    layout: RwLock<Value>,
    history: Mutex<Vec<Value>>,
}

type Shared = Arc<AppState>;

/// Mensagens que o app envia.
#[derive(Deserialize, Debug)]
#[serde(tag = "t", rename_all = "snake_case")]
enum ClientMsg {
    Join { key: String, name: String, #[serde(default)] color: String, #[serde(default)] look: Value },
    Look { look: Value },
    Move { x: f32, z: f32, dir: f32, moving: bool, zone: Option<String> },
    Chat { text: String, zone: Option<String> },
    Status { text: String },
    LayoutSave { layout: Value },
    Wave { to: String },
    Ping,
}

#[derive(Serialize)]
struct VideoGrant {
    room: String,
    #[serde(rename = "roomJoin")]
    room_join: bool,
    #[serde(rename = "canPublish")]
    can_publish: bool,
    #[serde(rename = "canSubscribe")]
    can_subscribe: bool,
    #[serde(rename = "canPublishData")]
    can_publish_data: bool,
}

#[derive(Serialize)]
struct LkClaims {
    iss: String,
    sub: String,
    name: String,
    nbf: u64,
    exp: u64,
    video: VideoGrant,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
}

fn livekit_token(cfg: &Config, identity: &str, name: &str) -> String {
    let t = now();
    let claims = LkClaims {
        iss: cfg.livekit_api_key.clone(),
        sub: identity.to_string(),
        name: name.to_string(),
        nbf: t.saturating_sub(10),
        exp: t + 60 * 60 * 12,
        video: VideoGrant {
            room: cfg.livekit_room.clone(),
            room_join: true,
            can_publish: true,
            can_subscribe: true,
            can_publish_data: true,
        },
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(cfg.livekit_api_secret.as_bytes()).expect("segredo LiveKit inválido"),
    )
    .expect("falha ao assinar token LiveKit")
}

fn default_layout() -> Value {
    serde_json::from_str(include_str!("default_layout.json")).unwrap()
}

impl AppState {
    async fn broadcast(&self, msg: &Value, except: Option<&str>) {
        let s = msg.to_string();
        for (id, c) in self.conns.lock().await.iter() {
            if Some(id.as_str()) != except {
                let _ = c.tx.send(s.clone());
            }
        }
    }

    async fn send_to(&self, id: &str, msg: &Value) {
        if let Some(c) = self.conns.lock().await.get(id) {
            let _ = c.tx.send(msg.to_string());
        }
    }

    async fn save_layout(&self, layout: Value) {
        *self.layout.write().await = layout.clone();
        let path = self.cfg.data_dir.join("layout.json");
        if let Err(e) = tokio::fs::write(&path, serde_json::to_vec_pretty(&layout).unwrap()).await {
            warn!("não consegui salvar o layout em {path:?}: {e}");
        }
    }
}

async fn ws_handler(ws: WebSocketUpgrade, State(st): State<Shared>) -> impl IntoResponse {
    ws.max_message_size(2 * 1024 * 1024)
        .on_upgrade(move |socket| handle_socket(socket, st))
}

async fn handle_socket(socket: WebSocket, st: Shared) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    let writer = tokio::spawn(async move {
        while let Some(m) = rx.recv().await {
            if sink.send(Message::Text(m.into())).await.is_err() {
                break;
            }
        }
    });

    let mut my_id: Option<String> = None;

    while let Some(Ok(msg)) = stream.next().await {
        let text = match msg {
            Message::Text(t) => t.to_string(),
            Message::Close(_) => break,
            _ => continue,
        };
        let parsed: ClientMsg = match serde_json::from_str(&text) {
            Ok(m) => m,
            Err(_) => continue,
        };

        match (parsed, &my_id) {
            (ClientMsg::Join { key, name, color, look }, None) => {
                if key != st.cfg.office_key {
                    let _ = tx.send(json!({"t":"error","msg":"Chave do escritório inválida"}).to_string());
                    break;
                }
                let id = uuid::Uuid::new_v4().to_string();
                let name: String = name.trim().chars().take(32).collect();
                let peer = Peer {
                    id: id.clone(),
                    name: if name.is_empty() { "Sem nome".into() } else { name },
                    color,
                    x: 0.0,
                    z: 4.0,
                    dir: 0.0,
                    moving: false,
                    status: String::new(),
                    zone: None,
                    look,
                };
                let peers: Vec<Peer> = st.conns.lock().await.values().map(|c| c.peer.clone()).collect();
                let welcome = json!({
                    "t": "welcome",
                    "id": id,
                    "me": peer,
                    "peers": peers,
                    "layout": *st.layout.read().await,
                    "history": *st.history.lock().await,
                    "livekit": {
                        "url": st.cfg.livekit_url,
                        "token": livekit_token(&st.cfg, &id, &peer.name),
                    }
                });
                let _ = tx.send(welcome.to_string());
                st.broadcast(&json!({"t":"peer_join","peer":peer}), None).await;
                st.conns.lock().await.insert(id.clone(), Conn { peer, tx: tx.clone() });
                info!("entrou: {id}");
                my_id = Some(id);
            }
            (_, None) => break, // precisa entrar primeiro
            (ClientMsg::Join { .. }, Some(_)) => {}
            (ClientMsg::Move { x, z, dir, moving, zone }, Some(id)) => {
                if let Some(c) = st.conns.lock().await.get_mut(id) {
                    c.peer.x = x;
                    c.peer.z = z;
                    c.peer.dir = dir;
                    c.peer.moving = moving;
                    c.peer.zone = zone.clone();
                }
                st.broadcast(
                    &json!({"t":"peer_move","id":id,"x":x,"z":z,"dir":dir,"moving":moving,"zone":zone}),
                    Some(id),
                )
                .await;
            }
            (ClientMsg::Chat { text, zone }, Some(id)) => {
                let text: String = text.trim().chars().take(2000).collect();
                if text.is_empty() {
                    continue;
                }
                let name = st.conns.lock().await.get(id).map(|c| c.peer.name.clone()).unwrap_or_default();
                let msg = json!({"t":"chat","from":id,"name":name,"text":text,"zone":zone,"ts":now()});
                match &zone {
                    // Chat de sala: só quem está na mesma sala recebe.
                    Some(z) => {
                        let targets: Vec<String> = st
                            .conns
                            .lock()
                            .await
                            .values()
                            .filter(|c| c.peer.zone.as_deref() == Some(z.as_str()) || &c.peer.id == id)
                            .map(|c| c.peer.id.clone())
                            .collect();
                        for t in targets {
                            st.send_to(&t, &msg).await;
                        }
                    }
                    None => {
                        let mut h = st.history.lock().await;
                        h.push(msg.clone());
                        let len = h.len();
                        if len > 100 {
                            h.drain(0..len - 100);
                        }
                        drop(h);
                        st.broadcast(&msg, None).await;
                    }
                }
            }
            (ClientMsg::Status { text }, Some(id)) => {
                let text: String = text.chars().take(80).collect();
                if let Some(c) = st.conns.lock().await.get_mut(id) {
                    c.peer.status = text.clone();
                }
                st.broadcast(&json!({"t":"status","id":id,"text":text}), None).await;
            }
            (ClientMsg::Look { look }, Some(id)) => {
                if let Some(c) = st.conns.lock().await.get_mut(id) {
                    c.peer.look = look.clone();
                }
                st.broadcast(&json!({"t":"look","id":id,"look":look}), None).await;
            }
            (ClientMsg::LayoutSave { layout }, Some(id)) => {
                st.save_layout(layout.clone()).await;
                st.broadcast(&json!({"t":"layout","layout":layout,"by":id}), None).await;
            }
            (ClientMsg::Wave { to }, Some(id)) => {
                let name = st.conns.lock().await.get(id).map(|c| c.peer.name.clone()).unwrap_or_default();
                st.send_to(&to, &json!({"t":"wave","from":id,"name":name})).await;
            }
            (ClientMsg::Ping, Some(_)) => {
                let _ = tx.send(json!({"t":"pong"}).to_string());
            }
        }
    }

    if let Some(id) = my_id {
        st.conns.lock().await.remove(&id);
        st.broadcast(&json!({"t":"peer_leave","id":id}), None).await;
        info!("saiu: {id}");
    }
    writer.abort();
}

fn env(k: &str, default: &str) -> String {
    std::env::var(k).unwrap_or_else(|_| default.to_string())
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter(
        tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
    ).init();

    let cfg = Config {
        office_key: env("OFFICE_KEY", "verkz"),
        livekit_url: env("LIVEKIT_URL", "ws://localhost:7880"),
        livekit_api_key: env("LIVEKIT_API_KEY", "devkey"),
        livekit_api_secret: env("LIVEKIT_API_SECRET", "secret"),
        livekit_room: env("LIVEKIT_ROOM", "verkz-office"),
        data_dir: PathBuf::from(env("DATA_DIR", "./data")),
    };
    tokio::fs::create_dir_all(&cfg.data_dir).await.ok();

    let layout = match tokio::fs::read(cfg.data_dir.join("layout.json")).await {
        Ok(b) => serde_json::from_slice(&b).unwrap_or_else(|_| default_layout()),
        Err(_) => default_layout(),
    };

    let state = Arc::new(AppState {
        cfg,
        conns: Mutex::new(HashMap::new()),
        layout: RwLock::new(layout),
        history: Mutex::new(Vec::new()),
    });

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/health", get(|| async { "ok" }))
        .layer(tower_http::cors::CorsLayer::permissive())
        .with_state(state);

    let addr: SocketAddr = env("BIND", "0.0.0.0:8080").parse().unwrap();
    info!("VERKZ Office ouvindo em {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
