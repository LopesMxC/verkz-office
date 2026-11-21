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
        DefaultBodyLimit, State,
    },
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::{mpsc, Mutex, RwLock};
use tracing::{info, warn};

mod rec;

#[derive(Clone)]
struct Config {
    office_key: String,
    /// Chave do gestor (CEO): quem entra com ela vê a atividade de todos.
    admin_key: String,
    livekit_url: String,
    livekit_api_key: String,
    livekit_api_secret: String,
    livekit_room: String,
    data_dir: PathBuf,
    gemini_key: String,
    gemini_model: String,
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
    /// Está gravando a reunião agora (todos veem o aviso).
    #[serde(default)]
    recording: bool,
    /// Estado extra compartilhado (atividade, item na mão, câmera, etc.). Mesclado por `state`.
    #[serde(default)]
    extra: Value,
}

struct Conn {
    peer: Peer,
    admin: bool,
    tx: mpsc::UnboundedSender<String>,
}

pub(crate) struct AppState {
    cfg: Config,
    conns: Mutex<HashMap<String, Conn>>,
    layout: RwLock<Value>,
    history: Mutex<Vec<Value>>,
}

pub(crate) type Shared = Arc<AppState>;

/// Mensagens que o app envia.
#[derive(Deserialize, Debug)]
#[serde(tag = "t", rename_all = "snake_case")]
enum ClientMsg {
    Join { key: String, name: String, #[serde(default)] color: String, #[serde(default)] look: Value, #[serde(default)] admin_key: String },
    Look { look: Value },
    Move { x: f32, z: f32, dir: f32, moving: bool, zone: Option<String> },
    Chat { text: String, zone: Option<String> },
    Status { text: String },
    LayoutSave { layout: Value },
    Wave { to: String },
    Rec { on: bool },
    /// Mescla campos no estado extra do peer e avisa todo mundo.
    State { patch: Value },
    /// Mensagem direta para outra pessoa (chamar, pedir agenda, responder...).
    To { to: String, msg: Value },
    /// Efeito para todos (emote etc.).
    Fx { data: Value },
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

/// O que um participante pode ver de outro (sem a atividade privada, se não for gestor).
fn peer_view(p: &Peer, admin: bool) -> Peer {
    let mut v = p.clone();
    if !admin {
        if let Some(act) = v.extra.get("activity").cloned() {
            let shared = act.get("share").and_then(|x| x.as_bool()).unwrap_or(false);
            v.extra["activity"] = if shared { json!({"app": act.get("app"), "share": true, "since": act.get("since")}) } else { Value::Null };
        }
    }
    v
}

pub(crate) fn now() -> u64 {
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
    pub(crate) async fn broadcast(&self, msg: &Value, except: Option<&str>) {
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
            (ClientMsg::Join { key, name, color, look, admin_key }, None) => {
                let is_admin = !st.cfg.admin_key.is_empty() && admin_key == st.cfg.admin_key;
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
                    recording: false,
                    extra: json!({}),
                };
                let peers: Vec<Peer> = st.conns.lock().await.values().map(|c| peer_view(&c.peer, is_admin)).collect();
                let welcome = json!({
                    "t": "welcome",
                    "id": id,
                    "me": peer,
                    "peers": peers,
                    "layout": *st.layout.read().await,
                    "history": *st.history.lock().await,
                    "admin": is_admin,
                    "livekit": {
                        "url": st.cfg.livekit_url,
                        "token": livekit_token(&st.cfg, &id, &peer.name),
                    }
                });
                let _ = tx.send(welcome.to_string());
                st.broadcast(&json!({"t":"peer_join","peer":peer}), None).await;
                st.conns.lock().await.insert(id.clone(), Conn { peer, admin: is_admin, tx: tx.clone() });
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
                // quem não é da gestão só pode mudar os móveis da sala do seu cargo
                let (admin, role) = st.conns.lock().await.get(id).map(|c| (c.admin, c.peer.extra["role"].as_str().unwrap_or("").to_string())).unwrap_or_default();
                if !admin {
                    let old = st.layout.read().await.clone();
                    if let Err(motivo) = check_room_edit(&old, &layout, &role) {
                        // recusa sem derrubar a conexão e devolve o mapa como está
                        let _ = tx.send(json!({"t":"notice","msg": motivo, "layout": old}).to_string());
                        continue;
                    }
                }
                st.save_layout(layout.clone()).await;
                st.broadcast(&json!({"t":"layout","layout":layout,"by":id}), None).await;
            }
            (ClientMsg::Wave { to }, Some(id)) => {
                let name = st.conns.lock().await.get(id).map(|c| c.peer.name.clone()).unwrap_or_default();
                st.send_to(&to, &json!({"t":"wave","from":id,"name":name})).await;
            }
            (ClientMsg::Rec { on }, Some(id)) => {
                if let Some(c) = st.conns.lock().await.get_mut(id) {
                    c.peer.recording = on;
                }
                st.broadcast(&json!({"t":"rec","id":id,"on":on}), None).await;
            }
            (ClientMsg::State { patch }, Some(id)) => {
                if !patch.is_object() || patch.to_string().len() > 8192 {
                    continue;
                }
                if let Some(c) = st.conns.lock().await.get_mut(id) {
                    if !c.peer.extra.is_object() {
                        c.peer.extra = json!({});
                    }
                    let obj = c.peer.extra.as_object_mut().unwrap();
                    for (k, v) in patch.as_object().unwrap() {
                        if v.is_null() {
                            obj.remove(k);
                        } else {
                            obj.insert(k.clone(), v.clone());
                        }
                    }
                }
                // atividade: o gestor sempre vê (app + janela); os outros só o nome do app, e só se a pessoa compartilhar
                if let Some(act) = patch.get("activity") {
                    let shared = act.get("share").and_then(|v| v.as_bool()).unwrap_or(false);
                    let mut public = patch.clone();
                    if act.is_null() || !shared {
                        public["activity"] = Value::Null;
                    } else {
                        public["activity"] = json!({"app": act.get("app"), "share": true, "since": act.get("since")});
                    }
                    let conns = st.conns.lock().await;
                    for (cid, c) in conns.iter() {
                        if cid == id {
                            continue;
                        }
                        let p = if c.admin { &patch } else { &public };
                        let _ = c.tx.send(json!({"t":"state","id":id,"patch":p}).to_string());
                    }
                } else {
                    st.broadcast(&json!({"t":"state","id":id,"patch":patch}), Some(id)).await;
                }
            }
            (ClientMsg::To { to, msg }, Some(id)) => {
                if msg.to_string().len() > 65536 {
                    continue;
                }
                let name = st.conns.lock().await.get(id).map(|c| c.peer.name.clone()).unwrap_or_default();
                st.send_to(&to, &json!({"t":"from","from":id,"name":name,"msg":msg})).await;
            }
            (ClientMsg::Fx { data }, Some(id)) => {
                if data.to_string().len() > 4096 {
                    continue;
                }
                st.broadcast(&json!({"t":"fx","from":id,"data":data}), Some(id)).await;
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

/// Proxy de leitura para os painéis da versão de navegador (o navegador bloqueia por CORS).
/// Só repassa GET para uma lista fechada de sites, para não virar um proxy aberto.
async fn proxy_fetch(axum::extract::Query(q): axum::extract::Query<HashMap<String, String>>) -> axum::response::Response {
    use axum::http::{header, StatusCode};
    use axum::response::IntoResponse;
    let Some(url) = q.get("url") else { return (StatusCode::BAD_REQUEST, "url").into_response() };
    let Ok(parsed) = reqwest::Url::parse(url) else { return (StatusCode::BAD_REQUEST, "url").into_response() };
    let host = parsed.host_str().unwrap_or("").to_string();
    let extra = env("PROXY_HOSTS", "");
    let allowed = ["economia.awesomeapi.com.br", "api.bcb.gov.br", "api.open-meteo.com", "verkzsystem.tech"]
        .iter()
        .map(|s| s.to_string())
        .chain(extra.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
        .any(|h| host == h || host.ends_with(&format!(".{h}")));
    if parsed.scheme() != "https" || !allowed {
        return (StatusCode::FORBIDDEN, "site não liberado").into_response();
    }
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10)).build().unwrap();
    match client.get(parsed).send().await {
        Ok(r) => {
            let status = StatusCode::from_u16(r.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
            match r.bytes().await {
                Ok(b) if b.len() <= 2 * 1024 * 1024 => (status, [(header::CONTENT_TYPE, "application/json")], b).into_response(),
                _ => (StatusCode::BAD_GATEWAY, "resposta inválida").into_response(),
            }
        }
        Err(_) => (StatusCode::BAD_GATEWAY, "falhou").into_response(),
    }
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
        admin_key: env("ADMIN_KEY", ""),
        livekit_url: env("LIVEKIT_URL", "ws://localhost:7880"),
        livekit_api_key: env("LIVEKIT_API_KEY", "devkey"),
        livekit_api_secret: env("LIVEKIT_API_SECRET", "secret"),
        livekit_room: env("LIVEKIT_ROOM", "verkz-office"),
        data_dir: PathBuf::from(env("DATA_DIR", "./data")),
        gemini_key: env("GEMINI_API_KEY", "").trim().to_string(),
        gemini_model: env("GEMINI_MODEL", "gemini-flash-latest"),
    };
    tokio::fs::create_dir_all(&cfg.data_dir).await.ok();

    let mut layout: Value = match tokio::fs::read(cfg.data_dir.join("layout.json")).await {
        Ok(b) => serde_json::from_slice(&b).unwrap_or_else(|_| default_layout()),
        Err(_) => default_layout(),
    };
    // mapa novo (versão maior que a salva): troca pelo novo e guarda o antigo como backup
    let def = default_layout();
    let ver = |v: &Value| v["version"].as_u64().unwrap_or(0);
    if ver(&layout) < ver(&def) {
        let old = cfg.data_dir.join("layout.json");
        if old.exists() {
            let bak = cfg.data_dir.join(format!("layout.v{}.backup.json", ver(&layout)));
            tokio::fs::copy(&old, &bak).await.ok();
            info!("mapa atualizado para a versão {}; o antigo ficou em {}", ver(&def), bak.display());
        }
        layout = def;
        tokio::fs::write(&old, serde_json::to_vec(&layout).unwrap()).await.ok();
    }

    let state = Arc::new(AppState {
        cfg,
        conns: Mutex::new(HashMap::new()),
        layout: RwLock::new(layout),
        history: Mutex::new(Vec::new()),
    });

    tokio::spawn(rec::cleanup_loop(state.clone()));

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/api/rec", get(rec::list))
        .route("/api/rec/start", post(rec::start))
        .route("/api/rec/{id}/chunk", post(rec::chunk).layer(DefaultBodyLimit::max(64 * 1024 * 1024)))
        .route("/api/rec/{id}/finish", post(rec::finish))
        .route("/api/rec/{id}/retry", post(rec::retry))
        .route("/api/rec/{id}/file", get(rec::file))
        .route("/api/rec/{id}/notes", get(rec::notes))
        .route("/health", get(|| async { "ok" }))
        .route("/api/fetch", get(proxy_fetch))
        .layer(tower_http::cors::CorsLayer::permissive())
        .with_state(state);
    // versão de navegador: os arquivos do app ficam em WEB_DIR e qualquer outra rota cai no index.html
    let web_dir = PathBuf::from(env("WEB_DIR", "/web"));
    let app = if web_dir.join("index.html").exists() {
        info!("versão de navegador servida de {}", web_dir.display());
        let index = web_dir.join("index.html");
        app.fallback_service(tower_http::services::ServeDir::new(&web_dir).fallback(tower_http::services::ServeFile::new(index)))
    } else {
        app
    };

    let addr: SocketAddr = env("BIND", "0.0.0.0:8080").parse().unwrap();
    info!("VERKZ Office ouvindo em {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}


/// Confere se uma edição feita por quem não é da gestão mexeu só nos móveis das salas do seu cargo.
fn check_room_edit(old: &Value, new: &Value, role: &str) -> Result<(), String> {
    if role.is_empty() {
        return Err("Escolha seu cargo para editar a sua sala.".into());
    }
    if old["size"] != new["size"] || old["zones"] != new["zones"] || old["spawn"] != new["spawn"] || old["env"] != new["env"] {
        return Err("Só a gestão pode mudar salas, prédio e clima.".into());
    }
    let rooms: Vec<(f64, f64, f64, f64)> = old["zones"]
        .as_array()
        .map(|zs| {
            zs.iter()
                .filter(|z| z["role"].as_str() == Some(role))
                .map(|z| (z["x"].as_f64().unwrap_or(0.0), z["z"].as_f64().unwrap_or(0.0), z["w"].as_f64().unwrap_or(0.0) / 2.0 + 0.01, z["d"].as_f64().unwrap_or(0.0) / 2.0 + 0.01))
                .collect()
        })
        .unwrap_or_default();
    if rooms.is_empty() {
        return Err("Ainda não há sala para o seu cargo.".into());
    }
    let inside = |it: &Value| {
        let x = it["x"].as_f64().unwrap_or(1e9);
        let z = it["z"].as_f64().unwrap_or(1e9);
        rooms.iter().any(|(cx, cz, hw, hd)| (x - cx).abs() <= *hw && (z - cz).abs() <= *hd)
    };
    let is_wall = |it: &Value| matches!(it["type"].as_str(), Some("wall") | Some("window_wall") | Some("glass_wall"));
    let index = |v: &Value| -> std::collections::HashMap<String, Value> {
        v["items"].as_array().map(|a| a.iter().map(|i| (i["id"].as_str().unwrap_or("").to_string(), i.clone())).collect()).unwrap_or_default()
    };
    let (a, b) = (index(old), index(new));
    for (id, it) in &a {
        match b.get(id) {
            Some(n) if n == it => {}
            // mudou ou saiu: precisa ser um móvel que estava (e continua) dentro da sala
            Some(n) => {
                if is_wall(it) || is_wall(n) || !inside(it) || !inside(n) {
                    return Err("Você só pode mexer nos móveis da sua sala.".into());
                }
            }
            None => {
                if is_wall(it) || !inside(it) {
                    return Err("Você só pode tirar móveis da sua sala.".into());
                }
            }
        }
    }
    for (id, n) in &b {
        if !a.contains_key(id) && (is_wall(n) || !inside(n)) {
            return Err("Coloque os móveis dentro da sua sala.".into());
        }
    }
    if b.len() > a.len() + 60 {
        return Err("Móveis demais de uma vez.".into());
    }
    Ok(())
}
