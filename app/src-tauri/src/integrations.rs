//! Integrações nativas: Google (Agenda + Meet + contagem do Gmail) e Spotify.
//! OAuth com PKCE e redirecionamento local (127.0.0.1), tokens salvos na
//! pasta de dados do app. Nada passa pelo servidor do escritório.

use std::{path::PathBuf, time::Duration};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;

const REDIRECT_PORT: u16 = 43821;
const REDIRECT: &str = "http://127.0.0.1:43821/callback";

const GOOGLE_SCOPES: &str = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.labels";
const SPOTIFY_SCOPES: &str = "user-read-currently-playing user-read-playback-state user-modify-playback-state";

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct Tokens {
    access: String,
    refresh: Option<String>,
    expires_at: i64,
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct Creds {
    pub google_client_id: String,
    pub google_client_secret: String,
    pub spotify_client_id: String,
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct Store {
    google: Option<Tokens>,
    spotify: Option<Tokens>,
    creds: Creds,
}

pub struct State {
    store: Mutex<Store>,
    path: PathBuf,
    http: reqwest::Client,
}

impl State {
    pub fn load(app: &AppHandle) -> Self {
        let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("integrations.json");
        let mut store: Store = std::fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        // Credenciais embutidas no build (GitHub Secrets) valem quando o usuário não definiu outras.
        if store.creds.google_client_id.is_empty() {
            store.creds.google_client_id = option_env!("VERKZ_GOOGLE_CLIENT_ID").unwrap_or("").into();
            store.creds.google_client_secret = option_env!("VERKZ_GOOGLE_CLIENT_SECRET").unwrap_or("").into();
        }
        if store.creds.spotify_client_id.is_empty() {
            store.creds.spotify_client_id = option_env!("VERKZ_SPOTIFY_CLIENT_ID").unwrap_or("").into();
        }
        State {
            store: Mutex::new(store),
            path,
            http: reqwest::Client::builder().timeout(Duration::from_secs(15)).build().unwrap(),
        }
    }

    async fn save(&self) {
        let s = self.store.lock().await.clone();
        let _ = tokio::fs::write(&self.path, serde_json::to_vec_pretty(&s).unwrap()).await;
    }
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

fn pkce() -> (String, String) {
    let verifier: String = rand::thread_rng().sample_iter(&Alphanumeric).take(64).map(char::from).collect();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

/// Abre o navegador e espera o redirecionamento com ?code=...
async fn wait_for_code(app: &AppHandle, auth_url: String, state: &str) -> Result<String, String> {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", REDIRECT_PORT))
        .await
        .map_err(|e| format!("Porta {REDIRECT_PORT} ocupada: {e}"))?;
    tauri_plugin_opener::open_url(auth_url, None::<&str>).map_err(|e| e.to_string())?;
    let _ = app;

    let fut = async {
        loop {
            let (mut sock, _) = listener.accept().await.map_err(|e| e.to_string())?;
            let mut buf = vec![0u8; 8192];
            let n = sock.read(&mut buf).await.map_err(|e| e.to_string())?;
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let path = req.split_whitespace().nth(1).unwrap_or("/").to_string();
            if !path.starts_with("/callback") {
                let _ = sock.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n").await;
                continue;
            }
            let u = url::Url::parse(&format!("http://127.0.0.1{path}")).map_err(|e| e.to_string())?;
            let q: std::collections::HashMap<_, _> = u.query_pairs().into_owned().collect();
            let ok = q.get("state").map(|s| s == state).unwrap_or(false) && q.contains_key("code");
            let body = if ok {
                "<h2>Conectado.</h2><p>Pode fechar esta aba e voltar ao VERKZ Office.</p>"
            } else {
                "<h2>Não foi possível conectar.</h2><p>Volte ao VERKZ Office e tente de novo.</p>"
            };
            let html = format!(
                "<!doctype html><meta charset=utf-8><body style=\"background:#0D0D0D;color:#C8F501;font-family:monospace;display:grid;place-items:center;height:100vh;margin:0;text-align:center\"><div>{body}</div>"
            );
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                html.len(),
                html
            );
            let _ = sock.write_all(resp.as_bytes()).await;
            return if ok {
                Ok(q["code"].clone())
            } else {
                Err(q.get("error").cloned().unwrap_or_else(|| "autorização negada".into()))
            };
        }
    };
    tokio::time::timeout(Duration::from_secs(240), fut)
        .await
        .map_err(|_| "Tempo esgotado esperando a autorização".to_string())?
}

fn parse_tokens(v: &Value, old_refresh: Option<String>) -> Result<Tokens, String> {
    let access = v["access_token"].as_str().ok_or_else(|| format!("resposta inesperada: {v}"))?.to_string();
    Ok(Tokens {
        access,
        refresh: v["refresh_token"].as_str().map(String::from).or(old_refresh),
        expires_at: now() + v["expires_in"].as_i64().unwrap_or(3600) - 60,
    })
}

// ------------------------------------------------------------------ comandos

#[tauri::command]
pub async fn integrations_status(st: tauri::State<'_, State>) -> Result<Value, String> {
    let s = st.store.lock().await;
    Ok(json!({
        "google": s.google.is_some(),
        "spotify": s.spotify.is_some(),
        "google_configured": !s.creds.google_client_id.is_empty(),
        "spotify_configured": !s.creds.spotify_client_id.is_empty(),
    }))
}

#[tauri::command]
pub async fn integrations_set_creds(st: tauri::State<'_, State>, creds: Creds) -> Result<(), String> {
    {
        let mut s = st.store.lock().await;
        if !creds.google_client_id.is_empty() {
            s.creds.google_client_id = creds.google_client_id;
            s.creds.google_client_secret = creds.google_client_secret;
        }
        if !creds.spotify_client_id.is_empty() {
            s.creds.spotify_client_id = creds.spotify_client_id;
        }
    }
    st.save().await;
    Ok(())
}

#[tauri::command]
pub async fn integrations_disconnect(st: tauri::State<'_, State>, provider: String) -> Result<(), String> {
    {
        let mut s = st.store.lock().await;
        match provider.as_str() {
            "google" => s.google = None,
            "spotify" => s.spotify = None,
            _ => {}
        }
    }
    st.save().await;
    Ok(())
}

#[tauri::command]
pub async fn google_connect(app: AppHandle, st: tauri::State<'_, State>) -> Result<(), String> {
    let creds = st.store.lock().await.creds.clone();
    if creds.google_client_id.is_empty() {
        return Err("Configure o Client ID do Google nas configurações.".into());
    }
    let (verifier, challenge) = pkce();
    let state: String = rand::thread_rng().sample_iter(&Alphanumeric).take(16).map(char::from).collect();
    let mut u = url::Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap();
    u.query_pairs_mut()
        .append_pair("client_id", &creds.google_client_id)
        .append_pair("redirect_uri", REDIRECT)
        .append_pair("response_type", "code")
        .append_pair("scope", GOOGLE_SCOPES)
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent")
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &state);
    let code = wait_for_code(&app, u.to_string(), &state).await?;
    let v: Value = st
        .http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", &creds.google_client_id),
            ("client_secret", &creds.google_client_secret),
            ("redirect_uri", REDIRECT),
            ("grant_type", "authorization_code"),
            ("code_verifier", &verifier),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let t = parse_tokens(&v, None)?;
    st.store.lock().await.google = Some(t);
    st.save().await;
    Ok(())
}

#[tauri::command]
pub async fn spotify_connect(app: AppHandle, st: tauri::State<'_, State>) -> Result<(), String> {
    let creds = st.store.lock().await.creds.clone();
    if creds.spotify_client_id.is_empty() {
        return Err("Configure o Client ID do Spotify nas configurações.".into());
    }
    let (verifier, challenge) = pkce();
    let state: String = rand::thread_rng().sample_iter(&Alphanumeric).take(16).map(char::from).collect();
    let mut u = url::Url::parse("https://accounts.spotify.com/authorize").unwrap();
    u.query_pairs_mut()
        .append_pair("client_id", &creds.spotify_client_id)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", REDIRECT)
        .append_pair("scope", SPOTIFY_SCOPES)
        .append_pair("code_challenge_method", "S256")
        .append_pair("code_challenge", &challenge)
        .append_pair("state", &state);
    let code = wait_for_code(&app, u.to_string(), &state).await?;
    let v: Value = st
        .http
        .post("https://accounts.spotify.com/api/token")
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", REDIRECT),
            ("client_id", &creds.spotify_client_id),
            ("code_verifier", &verifier),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let t = parse_tokens(&v, None)?;
    st.store.lock().await.spotify = Some(t);
    st.save().await;
    Ok(())
}

/// Devolve um access token válido, renovando se precisar.
async fn access(st: &State, provider: &str) -> Result<String, String> {
    let (tok, creds) = {
        let s = st.store.lock().await;
        let t = if provider == "google" { s.google.clone() } else { s.spotify.clone() };
        (t.ok_or_else(|| format!("{provider} não conectado"))?, s.creds.clone())
    };
    if tok.expires_at > now() {
        return Ok(tok.access);
    }
    let refresh = tok.refresh.clone().ok_or("sessão expirada, conecte de novo")?;
    let resp = if provider == "google" {
        st.http
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh.as_str()),
                ("client_id", &creds.google_client_id),
                ("client_secret", &creds.google_client_secret),
            ])
            .send()
            .await
    } else {
        st.http
            .post("https://accounts.spotify.com/api/token")
            .form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh.as_str()),
                ("client_id", &creds.spotify_client_id),
            ])
            .send()
            .await
    }
    .map_err(|e| e.to_string())?;
    let v: Value = resp.json().await.map_err(|e| e.to_string())?;
    let t = parse_tokens(&v, Some(refresh))?;
    {
        let mut s = st.store.lock().await;
        if provider == "google" { s.google = Some(t.clone()) } else { s.spotify = Some(t.clone()) }
    }
    st.save().await;
    Ok(t.access)
}

#[tauri::command]
pub async fn google_agenda(st: tauri::State<'_, State>) -> Result<Value, String> {
    let token = access(&st, "google").await?;
    let now = chrono::Utc::now();
    let max = now + chrono::Duration::hours(24);
    let v: Value = st
        .http
        .get("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        .bearer_auth(token)
        .query(&[
            ("timeMin", now.to_rfc3339()),
            ("timeMax", max.to_rfc3339()),
            ("singleEvents", "true".into()),
            ("orderBy", "startTime".into()),
            ("maxResults", "12".into()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let items = v["items"].as_array().cloned().unwrap_or_default();
    let out: Vec<Value> = items
        .iter()
        .map(|e| {
            let meet = e["hangoutLink"].as_str().map(String::from).or_else(|| {
                e["conferenceData"]["entryPoints"]
                    .as_array()
                    .and_then(|a| a.iter().find(|p| p["entryPointType"] == "video"))
                    .and_then(|p| p["uri"].as_str().map(String::from))
            });
            json!({
                "title": e["summary"].as_str().unwrap_or("(sem título)"),
                "start": e["start"]["dateTime"].as_str().or(e["start"]["date"].as_str()),
                "end": e["end"]["dateTime"].as_str().or(e["end"]["date"].as_str()),
                "allDay": e["start"]["date"].is_string(),
                "meet": meet,
                "link": e["htmlLink"],
            })
        })
        .collect();
    Ok(json!(out))
}

#[tauri::command]
pub async fn gmail_unread(st: tauri::State<'_, State>) -> Result<i64, String> {
    let token = access(&st, "google").await?;
    let v: Value = st
        .http
        .get("https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX")
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(v["messagesUnread"].as_i64().unwrap_or(0))
}

#[tauri::command]
pub async fn spotify_now(st: tauri::State<'_, State>) -> Result<Value, String> {
    let token = access(&st, "spotify").await?;
    let r = st
        .http
        .get("https://api.spotify.com/v1/me/player/currently-playing")
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if r.status().as_u16() == 204 {
        return Ok(Value::Null);
    }
    let v: Value = r.json().await.map_err(|e| e.to_string())?;
    if v["item"].is_null() {
        return Ok(Value::Null);
    }
    let artists: Vec<&str> = v["item"]["artists"]
        .as_array()
        .map(|a| a.iter().filter_map(|x| x["name"].as_str()).collect())
        .unwrap_or_default();
    Ok(json!({
        "title": v["item"]["name"],
        "artist": artists.join(", "),
        "playing": v["is_playing"],
        "url": v["item"]["external_urls"]["spotify"],
        "cover": v["item"]["album"]["images"].get(2).or(v["item"]["album"]["images"].get(0)).map(|i| i["url"].clone()),
    }))
}

#[tauri::command]
pub async fn spotify_control(st: tauri::State<'_, State>, action: String) -> Result<(), String> {
    let token = access(&st, "spotify").await?;
    let base = "https://api.spotify.com/v1/me/player";
    let req = match action.as_str() {
        "play" => st.http.put(format!("{base}/play")),
        "pause" => st.http.put(format!("{base}/pause")),
        "next" => st.http.post(format!("{base}/next")),
        "previous" => st.http.post(format!("{base}/previous")),
        _ => return Err("ação inválida".into()),
    };
    let r = req.bearer_auth(token).header("Content-Length", "0").send().await.map_err(|e| e.to_string())?;
    if r.status().as_u16() == 403 {
        return Err("Controlar o player exige Spotify Premium.".into());
    }
    if r.status().as_u16() == 404 {
        return Err("Abra o Spotify em algum dispositivo primeiro.".into());
    }
    Ok(())
}
