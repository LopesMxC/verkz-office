//! Soundpad compartilhado: os sons que alguém sobe ficam no servidor e aparecem para todo mundo.
//!
//! O app já manda o áudio pronto (WAV mono, cortado no tempo máximo do escritório), então aqui
//! só guarda o arquivo, mantém a lista (`sounds/index.json`) e avisa todo mundo pelo WebSocket.
//! Sem limite de quantidade; cada som até 10 s (quem adiciona escolhe 5–10 s) e 2 MB.
//! Remove quem subiu (mesmo aparelho) ou a gestão.

use std::path::PathBuf;

use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::{info, warn};

use crate::{now, Shared};

/// Quem adiciona escolhe o tempo (5 a 10 s); o servidor só garante o teto.
pub const MAX_SECS: f32 = 10.0;

/// Cada som até 2 MB (10 s de WAV mono 22 kHz dá ~450 KB).
pub const MAX_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
pub struct Sound {
    pub id: String,
    pub name: String,
    /// nome de quem subiu
    pub by: String,
    /// aparelho de quem subiu (só o servidor vê; serve para deixar remover)
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub device: String,
    pub at: u64,
    /// duração em segundos
    pub dur: f32,
}

#[derive(Deserialize, Default)]
pub struct SoundQuery {
    #[serde(default)]
    key: Option<String>,
    #[serde(default)]
    name: String,
    #[serde(default)]
    by: String,
    #[serde(default)]
    device: String,
    #[serde(default)]
    dur: f32,
}

fn header_or(h: &HeaderMap, name: &str, q: Option<&String>) -> String {
    h.get(name).and_then(|v| v.to_str().ok()).map(str::to_string).or_else(|| q.cloned()).unwrap_or_default()
}

fn authorized(st: &Shared, h: &HeaderMap, q: &SoundQuery) -> bool {
    let k = header_or(h, "x-office-key", q.key.as_ref());
    !k.is_empty() && k == st.cfg.office_key
}

fn is_admin(st: &Shared, h: &HeaderMap) -> bool {
    let k = header_or(h, "x-admin-key", None);
    !k.is_empty() && !st.cfg.admin_key.is_empty() && k == st.cfg.admin_key
}

fn root(st: &Shared) -> PathBuf {
    st.cfg.data_dir.join("sounds")
}

fn err(code: StatusCode, msg: &str) -> Response {
    (code, Json(json!({ "error": msg }))).into_response()
}

/// Lista salva (mais novo por último).
pub async fn load(st: &Shared) -> Vec<Sound> {
    match tokio::fs::read(root(st).join("index.json")).await {
        Ok(b) => serde_json::from_slice(&b).unwrap_or_default(),
        Err(_) => vec![],
    }
}

async fn save(st: &Shared, list: &[Sound]) {
    let path = root(st).join("index.json");
    if let Err(e) = tokio::fs::write(&path, serde_json::to_vec_pretty(list).unwrap()).await {
        warn!("não consegui salvar {path:?}: {e}");
    }
}

/// O que vai para os apps: a lista (sem o aparelho de ninguém) e o tempo máximo.
pub async fn view(st: &Shared) -> serde_json::Value {
    let list: Vec<Sound> = load(st).await.into_iter().map(|mut s| {
        s.device.clear();
        s
    }).collect();
    json!({ "t": "sounds", "list": list, "max": MAX_SECS })
}

/// POST /api/sounds?name=&by=&device=&dur= (corpo: o áudio já pronto)
pub async fn add(State(st): State<Shared>, h: HeaderMap, Query(q): Query<SoundQuery>, body: Bytes) -> Response {
    if !authorized(&st, &h, &q) {
        return err(StatusCode::UNAUTHORIZED, "chave inválida");
    }
    if body.is_empty() || body.len() > MAX_BYTES {
        return err(StatusCode::PAYLOAD_TOO_LARGE, "o som precisa ter até 2 MB");
    }
    let _guard = st.sounds_lock.lock().await;
    if tokio::fs::create_dir_all(root(&st)).await.is_err() {
        return err(StatusCode::INTERNAL_SERVER_ERROR, "sem espaço para guardar o som");
    }
    let id = uuid::Uuid::new_v4().to_string();
    if let Err(e) = tokio::fs::write(root(&st).join(format!("{id}.audio")), &body).await {
        warn!("som {id}: {e}");
        return err(StatusCode::INTERNAL_SERVER_ERROR, "não consegui guardar o som");
    }
    let name: String = q.name.trim().chars().take(24).collect();
    let s = Sound {
        id: id.clone(),
        name: if name.is_empty() { "Som".into() } else { name },
        by: q.by.trim().chars().take(32).collect(),
        device: q.device.trim().chars().take(64).collect(),
        at: now(),
        dur: q.dur.clamp(0.0, MAX_SECS),
    };
    let mut list = load(&st).await;
    list.push(s);
    save(&st, &list).await;
    drop(_guard);
    info!("soundpad: som novo {id}");
    let v = view(&st).await;
    st.broadcast(&v, None).await;
    Json(json!({ "id": id })).into_response()
}

/// GET /api/sounds/{id}?key=
pub async fn file(State(st): State<Shared>, Path(id): Path<String>, h: HeaderMap, Query(q): Query<SoundQuery>) -> Response {
    if !authorized(&st, &h, &q) {
        return err(StatusCode::UNAUTHORIZED, "chave inválida");
    }
    if uuid::Uuid::parse_str(&id).is_err() {
        return err(StatusCode::NOT_FOUND, "som não encontrado");
    }
    match tokio::fs::read(root(&st).join(format!("{id}.audio"))).await {
        Ok(b) => ([(header::CONTENT_TYPE, "audio/wav"), (header::CACHE_CONTROL, "private, max-age=604800, immutable")], b).into_response(),
        Err(_) => err(StatusCode::NOT_FOUND, "som não encontrado"),
    }
}

/// DELETE /api/sounds/{id}?device= — quem subiu (mesmo aparelho) ou a gestão (x-admin-key).
pub async fn remove(State(st): State<Shared>, Path(id): Path<String>, h: HeaderMap, Query(q): Query<SoundQuery>) -> Response {
    if !authorized(&st, &h, &q) {
        return err(StatusCode::UNAUTHORIZED, "chave inválida");
    }
    let admin = is_admin(&st, &h);
    let _guard = st.sounds_lock.lock().await;
    let mut list = load(&st).await;
    let Some(pos) = list.iter().position(|s| s.id == id) else {
        return err(StatusCode::NOT_FOUND, "som não encontrado");
    };
    let mine = !q.device.is_empty() && list[pos].device == q.device;
    if !admin && !mine {
        return err(StatusCode::FORBIDDEN, "só quem adicionou ou a gestão pode remover");
    }
    list.remove(pos);
    save(&st, &list).await;
    let _ = tokio::fs::remove_file(root(&st).join(format!("{id}.audio"))).await;
    drop(_guard);
    info!("soundpad: som removido {id}");
    let v = view(&st).await;
    st.broadcast(&v, None).await;
    StatusCode::NO_CONTENT.into_response()
}
