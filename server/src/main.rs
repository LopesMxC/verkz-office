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
mod sounds;

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
    /// Sidecar de transcrição (NVIDIA Parakeet). Vazio = só Gemini.
    asr_url: String,
    /// Client ID do app do Spotify (developer.spotify.com): vai para o app, cada pessoa só clica em "Conectar".
    spotify_client_id: String,
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
    /// Identificador do aparelho (gerado pelo app): é o que o bloqueio da gestão usa.
    device: String,
    tx: mpsc::UnboundedSender<String>,
}

pub(crate) struct AppState {
    cfg: Config,
    conns: Mutex<HashMap<String, Conn>>,
    layout: RwLock<Value>,
    history: Mutex<Vec<Value>>,
    /// Gestão de entrada: bloqueados e "aprovar cada entrada" (salvo em gestao.json).
    gestao: Mutex<Gestao>,
    /// Pedidos de entrada esperando a gestão (sala de espera).
    pending: Mutex<HashMap<String, tokio::sync::oneshot::Sender<bool>>>,
    /// Uma escrita por vez na lista do soundpad compartilhado.
    sounds_lock: Mutex<()>,
    /// Quem foi tirado há pouco (aparelho ou nome em minúsculas -> até quando): impede voltar sozinho por reconexão automática.
    kicked: Mutex<HashMap<String, u64>>,
}

#[derive(Clone, Serialize, Deserialize, Default)]
struct Gestao {
    #[serde(default)]
    bans: Vec<Ban>,
    #[serde(default)]
    approval: bool,
}

#[derive(Clone, Serialize, Deserialize)]
struct Ban {
    #[serde(default)]
    device: String,
    name: String,
    at: u64,
}

/// Mensagem interna para o escritor do WebSocket fechar a conexão (expulsar).
const CLOSE_SIGNAL: &str = "\u{0}close";

pub(crate) type Shared = Arc<AppState>;

/// Mensagens que o app envia.
#[derive(Deserialize, Debug)]
#[serde(tag = "t", rename_all = "snake_case")]
enum ClientMsg {
    Join { key: String, name: String, #[serde(default)] color: String, #[serde(default)] look: Value, #[serde(default)] admin_key: String, #[serde(default)] device: String },
    /// Gestão: tira a pessoa do escritório (e, com `ban`, bloqueia a entrada dela).
    Kick { id: String, #[serde(default)] ban: bool },
    /// Gestão: responde a um pedido de entrada (sala de espera).
    Admit { rid: String, ok: bool },
    /// Gestão: lista de bloqueados e se a entrada precisa de aprovação.
    Bans,
    Unban { #[serde(default)] device: String, #[serde(default)] name: String },
    Gate { approval: bool },
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

/// Derruba o participante da sala de áudio/vídeo (LiveKit), para quem foi tirado não continuar na chamada.
async fn livekit_remove(cfg: &Config, identity: &str) {
    let t = now();
    let claims = serde_json::json!({
        "iss": cfg.livekit_api_key, "sub": "verkz-office-server", "nbf": t.saturating_sub(10), "exp": t + 60,
        "video": {"room": cfg.livekit_room, "roomAdmin": true}
    });
    let Ok(key) = EncodingKey::from_secret(cfg.livekit_api_secret.as_bytes()) else { return };
    let Ok(tok) = encode(&Header::default(), &claims, &key) else { return };
    let base = cfg.livekit_url.replacen("wss://", "https://", 1).replacen("ws://", "http://", 1);
    let url = format!("{}/twirp/livekit.RoomService/RemoveParticipant", base.trim_end_matches('/'));
    let res = reqwest::Client::new()
        .post(url)
        .bearer_auth(tok)
        .timeout(std::time::Duration::from_secs(5))
        .json(&serde_json::json!({"room": cfg.livekit_room, "identity": identity}))
        .send()
        .await;
    match res {
        Ok(r) => info!("livekit: removeu {identity} ({})", r.status()),
        Err(e) => info!("livekit: não consegui remover {identity}: {e}"),
    }
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

    async fn save_gestao(&self) {
        let g = self.gestao.lock().await.clone();
        let path = self.cfg.data_dir.join("gestao.json");
        if let Err(e) = tokio::fs::write(&path, serde_json::to_vec_pretty(&g).unwrap()).await {
            warn!("não consegui salvar {path:?}: {e}");
        }
    }

    async fn gestao_view(&self) -> Value {
        let g = self.gestao.lock().await;
        json!({"t":"bans","list":g.bans,"approval":g.approval})
    }

    async fn is_admin(&self, id: &str) -> bool {
        self.conns.lock().await.get(id).map(|c| c.admin).unwrap_or_default()
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

    let closed = Arc::new(tokio::sync::Notify::new());
    let closed_w = closed.clone();
    let mut writer = tokio::spawn(async move {
        while let Some(m) = rx.recv().await {
            if m == CLOSE_SIGNAL {
                let _ = sink.send(Message::Close(None)).await;
                closed_w.notify_one();
                break;
            }
            if sink.send(Message::Text(m.into())).await.is_err() {
                break;
            }
        }
    });

    let mut my_id: Option<String> = None;

    loop {
        // expulso: o escritor avisa e a conexão encerra aqui mesmo, sem esperar o aparelho responder
        let next = tokio::select! { n = stream.next() => n, _ = closed.notified() => None };
        let Some(Ok(msg)) = next else { break };
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
            (ClientMsg::Join { key, name, color, look, admin_key, device }, None) => {
                let is_admin = !st.cfg.admin_key.is_empty() && admin_key == st.cfg.admin_key;
                // sem espaço sobrando (copiar e colar a chave)
                if key.trim() != st.cfg.office_key.trim() {
                    let _ = tx.send(json!({"t":"error","msg":"Chave do escritório inválida"}).to_string());
                    break;
                }
                let name: String = name.trim().chars().take(32).collect();
                let device: String = device.trim().chars().take(64).collect();
                // acabou de ser tirado pela gestão: espera um pouco antes de poder voltar
                if !is_admin {
                    let lname = name.to_lowercase();
                    let mut k = st.kicked.lock().await;
                    k.retain(|_, until| *until > now());
                    if (!device.is_empty() && k.contains_key(&device)) || k.contains_key(&lname) {
                        drop(k);
                        let _ = tx.send(json!({"t":"error","msg":"A gestão tirou você do escritório. Tente entrar de novo em instantes."}).to_string());
                        break;
                    }
                }
                // bloqueado pela gestão (pelo aparelho ou pelo nome)
                if !is_admin {
                    let lname = name.to_lowercase();
                    let banned = st.gestao.lock().await.bans.iter().any(|b| (!device.is_empty() && b.device == device) || (!lname.is_empty() && b.name.to_lowercase() == lname));
                    if banned {
                        let _ = tx.send(json!({"t":"error","msg":"A gestão bloqueou sua entrada neste escritório."}).to_string());
                        break;
                    }
                }
                // sala de espera: com "aprovar cada entrada" ligado, alguém da gestão libera (sem gestão online, entra direto)
                if !is_admin && st.gestao.lock().await.approval {
                    let admins: Vec<mpsc::UnboundedSender<String>> = st.conns.lock().await.values().filter(|c| c.admin).map(|c| c.tx.clone()).collect();
                    if !admins.is_empty() {
                        let rid = uuid::Uuid::new_v4().to_string();
                        let (otx, mut orx) = tokio::sync::oneshot::channel::<bool>();
                        st.pending.lock().await.insert(rid.clone(), otx);
                        let shown = if name.is_empty() { "Alguém".to_string() } else { name.clone() };
                        let knock = json!({"t":"knock_office","rid":rid,"name":shown}).to_string();
                        for a in &admins {
                            let _ = a.send(knock.clone());
                        }
                        // avisa de tempos em tempos (o app derruba conexão muda depois de 50 s)
                        let mut tick = tokio::time::interval(std::time::Duration::from_secs(15));
                        let limit = tokio::time::sleep(std::time::Duration::from_secs(180));
                        tokio::pin!(limit);
                        let ok = loop {
                            tokio::select! {
                                r = &mut orx => break r.unwrap_or(false),
                                _ = tick.tick() => { let _ = tx.send(json!({"t":"waiting"}).to_string()); }
                                _ = &mut limit => break false,
                            }
                        };
                        st.pending.lock().await.remove(&rid);
                        for a in &admins {
                            let _ = a.send(json!({"t":"knock_done","rid":rid}).to_string());
                        }
                        if !ok {
                            let _ = tx.send(json!({"t":"error","msg":"A gestão não liberou sua entrada agora. Tente de novo daqui a pouco."}).to_string());
                            break;
                        }
                    }
                }
                let id = uuid::Uuid::new_v4().to_string();
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
                    "integrations": { "spotify_client_id": st.cfg.spotify_client_id },
                    "sounds": sounds::view(&st).await,
                    "livekit": {
                        "url": st.cfg.livekit_url,
                        "token": livekit_token(&st.cfg, &id, &peer.name),
                    }
                });
                let _ = tx.send(welcome.to_string());
                st.broadcast(&json!({"t":"peer_join","peer":peer}), None).await;
                st.conns.lock().await.insert(id.clone(), Conn { peer, admin: is_admin, device, tx: tx.clone() });
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
                // quem não é da gestão só mexe nos móveis (prédio, salas e paredes são da gestão)
                let admin = st.conns.lock().await.get(id).map(|c| c.admin).unwrap_or_default();
                if !admin {
                    let old = st.layout.read().await.clone();
                    if let Err(motivo) = check_furniture_edit(&old, &layout) {
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
            (ClientMsg::Kick { id: target, ban }, Some(id)) => {
                if !st.is_admin(id).await || &target == id {
                    continue;
                }
                let mut banned = None;
                let mut gone = None;
                if let Some(c) = st.conns.lock().await.get(&target) {
                    gone = Some((c.device.clone(), c.peer.name.to_lowercase()));
                    if ban {
                        banned = Some(Ban { device: c.device.clone(), name: c.peer.name.clone(), at: now() });
                    }
                    let msg = if ban { "A gestão tirou você do escritório e bloqueou sua entrada." } else { "A gestão tirou você do escritório." };
                    let _ = c.tx.send(json!({"t":"kicked","msg":msg}).to_string());
                    let _ = c.tx.send(CLOSE_SIGNAL.to_string());
                }
                // sai já da lista de presença (não espera o aparelho fechar) e da chamada de áudio/vídeo
                if st.conns.lock().await.remove(&target).is_some() {
                    st.broadcast(&json!({"t":"peer_leave","id":target}), None).await;
                }
                if let Some((dev, lname)) = gone {
                    let until = now() + 60;
                    let mut k = st.kicked.lock().await;
                    if !dev.is_empty() { k.insert(dev, until); }
                    k.insert(lname, until);
                }
                livekit_remove(&st.cfg, &target).await;
                if let Some(b) = banned {
                    st.gestao.lock().await.bans.push(b);
                    st.save_gestao().await;
                }
                info!("gestão {id} tirou {target} (bloqueio: {ban})");
                let v = st.gestao_view().await;
                let _ = tx.send(v.to_string());
            }
            (ClientMsg::Admit { rid, ok }, Some(id)) => {
                if st.is_admin(id).await {
                    if let Some(s) = st.pending.lock().await.remove(&rid) {
                        let _ = s.send(ok);
                    }
                }
            }
            (ClientMsg::Bans, Some(id)) => {
                if st.is_admin(id).await {
                    let v = st.gestao_view().await;
                    let _ = tx.send(v.to_string());
                }
            }
            (ClientMsg::Unban { device, name }, Some(id)) => {
                if st.is_admin(id).await {
                    st.gestao.lock().await.bans.retain(|b| !(b.device == device && b.name == name));
                    st.save_gestao().await;
                    let v = st.gestao_view().await;
                    let _ = tx.send(v.to_string());
                }
            }
            (ClientMsg::Gate { approval }, Some(id)) => {
                if st.is_admin(id).await {
                    st.gestao.lock().await.approval = approval;
                    st.save_gestao().await;
                    let v = st.gestao_view().await;
                    let _ = tx.send(v.to_string());
                }
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
    // deixa sair o que ainda estava na fila (ex.: "Chave do escritório inválida") antes de fechar;
    // antes o abort() cortava a mensagem e o app ficava reconectando sem mostrar o erro
    drop(tx);
    if tokio::time::timeout(std::time::Duration::from_secs(2), &mut writer).await.is_err() {
        writer.abort();
    }
}

/// "0.4" / "v3.1" / "0.4.0" → (0, 4, 0). Aceita o que for digitado no painel de versões.
fn parse_ver(v: &str) -> Option<(u64, u64, u64)> {
    let v = v.trim().trim_start_matches(['v', 'V']);
    let core = v.split(['-', '+', ' ']).next()?;
    let mut it = core.split('.').map(|p| p.trim().parse::<u64>());
    let a = it.next()?.ok()?;
    let b = it.next().unwrap_or(Ok(0)).ok()?;
    let c = it.next().unwrap_or(Ok(0)).ok()?;
    Some((a, b, c))
}

/// Versão real do instalador: vem do comentário assinado ("version:0.4.0"), depois do nome do arquivo.
fn real_version(rel: &serde_json::Value) -> Option<(u64, u64, u64)> {
    use base64::Engine;
    if let Some(sig) = rel.get("signature").and_then(|s| s.as_str()) {
        if let Ok(raw) = base64::engine::general_purpose::STANDARD.decode(sig.trim()) {
            let txt = String::from_utf8_lossy(&raw);
            if let Some(i) = txt.find("version:") {
                let rest: String = txt[i + 8..].chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
                if let Some(v) = parse_ver(&rest) {
                    return Some(v);
                }
            }
        }
    }
    if let Some(url) = rel.get("url").and_then(|s| s.as_str()) {
        let name = url.rsplit('/').next().unwrap_or("");
        for part in name.split(['_', '-']) {
            if part.matches('.').count() == 2 {
                if let Some(v) = parse_ver(part) {
                    return Some(v);
                }
            }
        }
    }
    None
}

/// Atualização do app: lê o painel de versões (verkzsystem.tech) e devolve no formato que o
/// atualizador entende, com a versão tirada do próprio instalador. Assim, o que for digitado no
/// painel ("3.1", "v2") não quebra a atualização. Sem versão nova: 204.
async fn update_proxy(axum::extract::Path((target, arch, current)): axum::extract::Path<(String, String, String)>) -> axum::response::Response {
    use axum::http::StatusCode;
    use axum::response::IntoResponse;
    let ok = |s: &str| !s.is_empty() && s.len() < 40 && s.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c));
    if !ok(&target) || !ok(&arch) || !ok(&current) {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let base = env("UPDATE_BASE", "https://verkzsystem.tech/apps/verkz-office");
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10)).build().unwrap();
    let url = format!("{base}/{target}/{arch}/{current}");
    let Ok(r) = client.get(&url).send().await else { return StatusCode::BAD_GATEWAY.into_response() };
    if r.status() == reqwest::StatusCode::NO_CONTENT {
        return StatusCode::NO_CONTENT.into_response();
    }
    let Ok(mut rel) = r.json::<serde_json::Value>().await else { return StatusCode::NO_CONTENT.into_response() };
    // formato latest.json (com "platforms"): pega a plataforma pedida
    if let Some(p) = rel.get("platforms").and_then(|p| p.get(format!("{target}-{arch}"))).cloned() {
        let mut flat = p;
        for k in ["notes", "pub_date"] {
            if let Some(v) = rel.get(k) {
                flat[k] = v.clone();
            }
        }
        rel = flat;
    } else if rel.get("platforms").is_some() {
        return StatusCode::NO_CONTENT.into_response();
    }
    if rel.get("url").and_then(|u| u.as_str()).is_none() || rel.get("signature").and_then(|u| u.as_str()).is_none() {
        return StatusCode::NO_CONTENT.into_response();
    }
    let real = real_version(&rel).or_else(|| rel.get("version").and_then(|v| v.as_str()).and_then(parse_ver));
    let cur = parse_ver(&current);
    match (real, cur) {
        (Some(new), Some(cur)) if new > cur => {
            rel["version"] = serde_json::Value::String(format!("{}.{}.{}", new.0, new.1, new.2));
            if rel.get("notes").map(|n| n.as_str().unwrap_or("").is_empty()).unwrap_or(true) {
                rel["notes"] = serde_json::Value::String(format!("VERKZ Office {}.{}.{}", new.0, new.1, new.2));
            }
            axum::Json(rel).into_response()
        }
        _ => StatusCode::NO_CONTENT.into_response(),
    }
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
        spotify_client_id: env("SPOTIFY_CLIENT_ID", ""),
        livekit_url: env("LIVEKIT_URL", "ws://localhost:7880"),
        livekit_api_key: env("LIVEKIT_API_KEY", "devkey"),
        livekit_api_secret: env("LIVEKIT_API_SECRET", "secret"),
        livekit_room: env("LIVEKIT_ROOM", "verkz-office"),
        data_dir: PathBuf::from(env("DATA_DIR", "./data")),
        gemini_key: env("GEMINI_API_KEY", "").trim().to_string(),
        gemini_model: env("GEMINI_MODEL", "gemini-flash-latest"),
        asr_url: env("ASR_URL", "").trim().trim_end_matches('/').to_string(),
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

    let gestao: Gestao = match tokio::fs::read(cfg.data_dir.join("gestao.json")).await {
        Ok(b) => serde_json::from_slice(&b).unwrap_or_default(),
        Err(_) => Gestao::default(),
    };
    let state = Arc::new(AppState {
        gestao: Mutex::new(gestao),
        pending: Mutex::new(HashMap::new()),
        sounds_lock: Mutex::new(()),
        kicked: Mutex::new(HashMap::new()),
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
        .route("/api/sounds", post(sounds::add).layer(DefaultBodyLimit::max(sounds::MAX_BYTES + 1024)))
        .route("/api/sounds/{id}", get(sounds::file).delete(sounds::remove))
        .route("/health", get(|| async { "ok" }))
        .route("/api/fetch", get(proxy_fetch))
        .route("/api/update/{target}/{arch}/{current}", get(update_proxy))
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

    // o navegador sempre confere se a página mudou (os arquivos têm hash no nome, então a conferência é barata)
    let app = app.layer(axum::middleware::map_response(|mut r: axum::response::Response| async move {
        r.headers_mut().insert(axum::http::header::CACHE_CONTROL, axum::http::HeaderValue::from_static("no-cache"));
        r
    }));

    let addr: SocketAddr = env("BIND", "0.0.0.0:8080").parse().unwrap();
    info!("VERKZ Office ouvindo em {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}


/// Confere se uma edição feita por quem não é da gestão mexeu só nos móveis.
/// Prédio (tamanho, andares, piso, clima), salas e paredes (e o elevador) são só da gestão.
fn is_wall_swap(a: &Value, b: &Value) -> bool {
    let wall = |v: &Value| matches!(v["type"].as_str(), Some("wall") | Some("window_wall"));
    wall(a) && wall(b) && a["x"] == b["x"] && a["z"] == b["z"] && a["rot"] == b["rot"]
}

fn check_furniture_edit(old: &Value, new: &Value) -> Result<(), String> {
    if old["size"] != new["size"] || old["zones"] != new["zones"] || old["spawn"] != new["spawn"] || old["env"] != new["env"] {
        return Err("Só a gestão pode mudar o prédio e as salas.".into());
    }
    if old["levels"] != new["levels"] || old["floorColor"] != new["floorColor"] {
        return Err("Só a gestão pode mudar os andares e o piso do salão.".into());
    }
    let locked = |it: &Value| matches!(it["type"].as_str(), Some("wall") | Some("window_wall") | Some("glass_wall") | Some("elevator"));
    let index = |v: &Value| -> std::collections::HashMap<String, Value> {
        v["items"].as_array().map(|a| a.iter().map(|i| (i["id"].as_str().unwrap_or("").to_string(), i.clone())).collect()).unwrap_or_default()
    };
    let (a, b) = (index(old), index(new));
    for (id, it) in &a {
        match b.get(id) {
            Some(n) if n == it => {}
            // trocar janela por parede lisa (e voltar) é liberado: o lugar e o giro não mudam
            Some(n) if is_wall_swap(it, n) => {}
            Some(n) if locked(it) || locked(n) => return Err("Só a gestão pode mexer em paredes.".into()),
            None if locked(it) => return Err("Só a gestão pode apagar paredes.".into()),
            _ => {}
        }
    }
    for (id, n) in &b {
        if !a.contains_key(id) && locked(n) {
            return Err("Só a gestão pode adicionar paredes.".into());
        }
    }
    if b.len() > a.len() + 60 {
        return Err("Móveis demais de uma vez.".into());
    }
    Ok(())
}
