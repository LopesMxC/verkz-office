//! Gravações de reunião: recebe o arquivo em partes, guarda por 15 dias,
//! extrai o áudio (ffmpeg) e pede ao Gemini a transcrição e o resumo.
//!
//! Arquivos em DATA_DIR/rec/<id>/: media.<ext>, meta.json e notes.json.

use std::{path::PathBuf, time::Duration};

use axum::{
    body::{Body, Bytes},
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::io::AsyncWriteExt;
use tracing::{info, warn};

use crate::{now, Shared};

/// Por quanto tempo uma gravação fica no servidor.
pub const KEEP_SECS: u64 = 15 * 24 * 3600;
const GEMINI: &str = "https://generativelanguage.googleapis.com";

#[derive(Deserialize)]
pub struct KeyQuery {
    key: Option<String>,
}

#[derive(Deserialize)]
pub struct StartBody {
    #[serde(default)]
    title: String,
    #[serde(default)]
    by: String,
}

#[derive(Deserialize)]
pub struct FinishBody {
    #[serde(default)]
    mime: String,
    #[serde(default)]
    duration: f64,
    /// Quem estava falando em cada momento: [{"t": segundos, "names": [...]}]
    #[serde(default)]
    timeline: Value,
    #[serde(default)]
    participants: Vec<String>,
}

fn authorized(st: &Shared, h: &HeaderMap, q: &KeyQuery) -> bool {
    let k = h
        .get("x-office-key")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
        .or_else(|| q.key.clone())
        .unwrap_or_default();
    !k.is_empty() && k == st.cfg.office_key
}

fn rec_root(st: &Shared) -> PathBuf {
    st.cfg.data_dir.join("rec")
}

/// Só aceita ids no formato uuid (evita caminhos estranhos).
fn rec_dir(st: &Shared, id: &str) -> Option<PathBuf> {
    uuid::Uuid::parse_str(id).ok()?;
    Some(rec_root(st).join(id))
}

async fn read_meta(dir: &std::path::Path) -> Option<Value> {
    let b = tokio::fs::read(dir.join("meta.json")).await.ok()?;
    serde_json::from_slice(&b).ok()
}

async fn write_meta(dir: &std::path::Path, meta: &Value) {
    if let Err(e) = tokio::fs::write(dir.join("meta.json"), serde_json::to_vec_pretty(meta).unwrap()).await {
        warn!("não consegui salvar meta da gravação {dir:?}: {e}");
    }
}

async fn set_status(st: &Shared, dir: &std::path::Path, status: &str, error: Option<String>) {
    if let Some(mut m) = read_meta(dir).await {
        m["status"] = json!(status);
        m["error"] = json!(error);
        write_meta(dir, &m).await;
    }
    st.broadcast(&json!({"t":"rec_update"}), None).await;
}

fn err(code: StatusCode, msg: &str) -> Response {
    (code, Json(json!({"error": msg}))).into_response()
}

// ------------------------------------------------------------------ rotas

pub async fn start(State(st): State<Shared>, h: HeaderMap, Query(q): Query<KeyQuery>, Json(b): Json<StartBody>) -> Response {
    if !authorized(&st, &h, &q) {
        return err(StatusCode::UNAUTHORIZED, "chave inválida");
    }
    let id = uuid::Uuid::new_v4().to_string();
    let dir = rec_root(&st).join(&id);
    if tokio::fs::create_dir_all(&dir).await.is_err() {
        return err(StatusCode::INTERNAL_SERVER_ERROR, "sem espaço para gravar");
    }
    let started = now();
    let title: String = b.title.trim().chars().take(80).collect();
    let meta = json!({
        "id": id,
        "title": if title.is_empty() { "Reunião".to_string() } else { title },
        "by": b.by.trim().chars().take(32).collect::<String>(),
        "started": started,
        "expires": started + KEEP_SECS,
        "status": "gravando",
        "mime": "",
        "size": 0,
        "duration": 0,
        "participants": [],
        "error": null,
    });
    write_meta(&dir, &meta).await;
    info!("gravação iniciada: {id}");
    Json(json!({"id": id})).into_response()
}

pub async fn chunk(State(st): State<Shared>, Path(id): Path<String>, h: HeaderMap, Query(q): Query<KeyQuery>, body: Bytes) -> Response {
    if !authorized(&st, &h, &q) {
        return err(StatusCode::UNAUTHORIZED, "chave inválida");
    }
    let Some(dir) = rec_dir(&st, &id) else { return err(StatusCode::BAD_REQUEST, "id inválido") };
    match read_meta(&dir).await {
        Some(m) if m["status"] == "gravando" => {}
        Some(_) => return err(StatusCode::CONFLICT, "gravação já encerrada"),
        None => return err(StatusCode::NOT_FOUND, "gravação não encontrada"),
    }
    let f = tokio::fs::OpenOptions::new().create(true).append(true).open(dir.join("media.part")).await;
    match f {
        Ok(mut f) => {
            if f.write_all(&body).await.is_err() {
                return err(StatusCode::INTERNAL_SERVER_ERROR, "falha ao gravar");
            }
            StatusCode::NO_CONTENT.into_response()
        }
        Err(_) => err(StatusCode::INTERNAL_SERVER_ERROR, "falha ao gravar"),
    }
}

pub async fn finish(State(st): State<Shared>, Path(id): Path<String>, h: HeaderMap, Query(q): Query<KeyQuery>, Json(b): Json<FinishBody>) -> Response {
    if !authorized(&st, &h, &q) {
        return err(StatusCode::UNAUTHORIZED, "chave inválida");
    }
    let Some(dir) = rec_dir(&st, &id) else { return err(StatusCode::BAD_REQUEST, "id inválido") };
    let Some(mut meta) = read_meta(&dir).await else { return err(StatusCode::NOT_FOUND, "gravação não encontrada") };
    if meta["status"] != "gravando" {
        return err(StatusCode::CONFLICT, "gravação já encerrada");
    }
    let ext = if b.mime.contains("mp4") { "mp4" } else { "webm" };
    let media = dir.join(format!("media.{ext}"));
    if tokio::fs::rename(dir.join("media.part"), &media).await.is_err() {
        // nada chegou: apaga a gravação vazia
        let _ = tokio::fs::remove_dir_all(&dir).await;
        st.broadcast(&json!({"t":"rec_update"}), None).await;
        return err(StatusCode::BAD_REQUEST, "a gravação ficou vazia");
    }
    let size = tokio::fs::metadata(&media).await.map(|m| m.len()).unwrap_or(0);
    meta["status"] = json!("processando");
    meta["mime"] = json!(if ext == "mp4" { "video/mp4" } else { "video/webm" });
    meta["ext"] = json!(ext);
    meta["size"] = json!(size);
    meta["duration"] = json!(b.duration.max(0.0).round());
    meta["participants"] = json!(b.participants.iter().take(50).collect::<Vec<_>>());
    write_meta(&dir, &meta).await;
    let _ = tokio::fs::write(dir.join("timeline.json"), b.timeline.to_string()).await;
    st.broadcast(&json!({"t":"rec_update"}), None).await;
    tokio::spawn(process(st.clone(), dir));
    Json(json!({"ok": true})).into_response()
}

pub async fn retry(State(st): State<Shared>, Path(id): Path<String>, h: HeaderMap, Query(q): Query<KeyQuery>) -> Response {
    if !authorized(&st, &h, &q) {
        return err(StatusCode::UNAUTHORIZED, "chave inválida");
    }
    let Some(dir) = rec_dir(&st, &id) else { return err(StatusCode::BAD_REQUEST, "id inválido") };
    match read_meta(&dir).await {
        Some(m) if m["status"] == "erro" || m["status"] == "pronto" => {
            set_status(&st, &dir, "processando", None).await;
            tokio::spawn(process(st.clone(), dir));
            Json(json!({"ok": true})).into_response()
        }
        Some(_) => err(StatusCode::CONFLICT, "a gravação ainda está em andamento"),
        None => err(StatusCode::NOT_FOUND, "gravação não encontrada"),
    }
}

pub async fn list(State(st): State<Shared>, h: HeaderMap, Query(q): Query<KeyQuery>) -> Response {
    if !authorized(&st, &h, &q) {
        return err(StatusCode::UNAUTHORIZED, "chave inválida");
    }
    let mut out = Vec::new();
    if let Ok(mut rd) = tokio::fs::read_dir(rec_root(&st)).await {
        while let Ok(Some(e)) = rd.next_entry().await {
            if let Some(m) = read_meta(&e.path()).await {
                out.push(m);
            }
        }
    }
    out.sort_by(|a, b| b["started"].as_u64().cmp(&a["started"].as_u64()));
    Json(json!({"recordings": out, "keep_days": KEEP_SECS / 86400, "ai": !st.cfg.gemini_key.is_empty()})).into_response()
}

pub async fn file(State(st): State<Shared>, Path(id): Path<String>, h: HeaderMap, Query(q): Query<KeyQuery>) -> Response {
    if !authorized(&st, &h, &q) {
        return err(StatusCode::UNAUTHORIZED, "chave inválida");
    }
    let Some(dir) = rec_dir(&st, &id) else { return err(StatusCode::BAD_REQUEST, "id inválido") };
    let Some(meta) = read_meta(&dir).await else { return err(StatusCode::NOT_FOUND, "gravação não encontrada") };
    let ext = meta["ext"].as_str().unwrap_or("webm").to_string();
    let f = match tokio::fs::File::open(dir.join(format!("media.{ext}"))).await {
        Ok(f) => f,
        Err(_) => return err(StatusCode::NOT_FOUND, "arquivo ainda não está pronto"),
    };
    let len = f.metadata().await.map(|m| m.len()).unwrap_or(0);
    let when = chrono_like(meta["started"].as_u64().unwrap_or(0));
    let name = format!("reuniao-{when}.{ext}");
    let stream = tokio_util::io::ReaderStream::new(f);
    Response::builder()
        .header(header::CONTENT_TYPE, meta["mime"].as_str().unwrap_or("video/webm"))
        .header(header::CONTENT_LENGTH, len)
        .header(header::CONTENT_DISPOSITION, format!("attachment; filename=\"{name}\""))
        .body(Body::from_stream(stream))
        .unwrap()
}

pub async fn notes(State(st): State<Shared>, Path(id): Path<String>, h: HeaderMap, Query(q): Query<KeyQuery>) -> Response {
    if !authorized(&st, &h, &q) {
        return err(StatusCode::UNAUTHORIZED, "chave inválida");
    }
    let Some(dir) = rec_dir(&st, &id) else { return err(StatusCode::BAD_REQUEST, "id inválido") };
    match tokio::fs::read(dir.join("notes.json")).await {
        Ok(b) => ([(header::CONTENT_TYPE, "application/json")], b).into_response(),
        Err(_) => err(StatusCode::NOT_FOUND, "transcrição ainda não está pronta"),
    }
}

/// Data no nome do arquivo (UTC-4, horário de Campo Grande), sem depender de outra biblioteca.
fn chrono_like(ts: u64) -> String {
    let t = ts.saturating_sub(4 * 3600);
    let days = (t / 86400) as i64;
    let secs = t % 86400;
    // algoritmo de datas civis (Howard Hinnant)
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y:04}-{m:02}-{d:02}-{:02}h{:02}", secs / 3600, (secs % 3600) / 60)
}

// ------------------------------------------------------------------ limpeza

/// Apaga gravações com mais de 15 dias. Roda ao iniciar e a cada hora.
pub async fn cleanup_loop(st: Shared) {
    loop {
        if let Ok(mut rd) = tokio::fs::read_dir(rec_root(&st)).await {
            while let Ok(Some(e)) = rd.next_entry().await {
                let p = e.path();
                let started = read_meta(&p).await.and_then(|m| m["started"].as_u64()).unwrap_or(0);
                if started == 0 || now() > started + KEEP_SECS {
                    if tokio::fs::remove_dir_all(&p).await.is_ok() {
                        info!("gravação expirada apagada: {p:?}");
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(3600)).await;
    }
}

// ------------------------------------------------------------------ transcrição

async fn process(st: Shared, dir: PathBuf) {
    fix_container(&st, &dir).await;
    match transcribe(&st, &dir).await {
        Ok(()) => set_status(&st, &dir, "pronto", None).await,
        Err(e) => {
            warn!("transcrição falhou em {dir:?}: {e}");
            set_status(&st, &dir, "erro", Some(e)).await;
        }
    }
    let _ = tokio::fs::remove_file(dir.join("audio.ogg")).await;
}

/// O navegador grava o vídeo sem a duração no arquivo (o player não deixa avançar).
/// Uma cópia rápida com o ffmpeg, sem recodificar, corrige isso.
async fn fix_container(st: &Shared, dir: &std::path::Path) {
    let Some(mut meta) = read_meta(dir).await else { return };
    if meta["fixed"] == true {
        return;
    }
    let ext = meta["ext"].as_str().unwrap_or("webm").to_string();
    let media = dir.join(format!("media.{ext}"));
    let tmp = dir.join(format!("fixed.{ext}"));
    let ok = tokio::process::Command::new("ffmpeg")
        .args(["-y", "-loglevel", "error", "-i"])
        .arg(&media)
        .args(["-c", "copy"])
        .arg(&tmp)
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false);
    if ok && tokio::fs::rename(&tmp, &media).await.is_ok() {
        meta["fixed"] = json!(true);
        meta["size"] = json!(tokio::fs::metadata(&media).await.map(|m| m.len()).unwrap_or(0));
        write_meta(dir, &meta).await;
        st.broadcast(&json!({"t":"rec_update"}), None).await;
    } else {
        let _ = tokio::fs::remove_file(&tmp).await;
    }
}

async fn transcribe(st: &Shared, dir: &std::path::Path) -> Result<(), String> {
    let key = st.cfg.gemini_key.clone();
    if key.is_empty() {
        return Err("A chave do Gemini não está configurada no servidor (GEMINI_API_KEY).".into());
    }
    let meta = read_meta(dir).await.ok_or("meta.json sumiu")?;
    let ext = meta["ext"].as_str().unwrap_or("webm");
    let media = dir.join(format!("media.{ext}"));
    let audio = dir.join("audio.ogg");

    // 1) só o áudio, mono e leve (uns 11 MB por hora)
    let out = tokio::process::Command::new("ffmpeg")
        .args(["-y", "-loglevel", "error", "-i"])
        .arg(&media)
        .args(["-vn", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "24k"])
        .arg(&audio)
        .output()
        .await
        .map_err(|e| format!("ffmpeg indisponível: {e}"))?;
    if !out.status.success() {
        return Err(format!("não consegui extrair o áudio: {}", String::from_utf8_lossy(&out.stderr).chars().take(300).collect::<String>()));
    }
    let bytes = tokio::fs::read(&audio).await.map_err(|e| e.to_string())?;
    if bytes.len() < 2000 {
        return Err("A gravação não tem áudio.".into());
    }

    let http = reqwest::Client::builder().timeout(Duration::from_secs(600)).build().map_err(|e| e.to_string())?;

    // 2) envia o áudio para o Gemini (Files API, envio em uma etapa)
    let started = http
        .post(format!("{GEMINI}/upload/v1beta/files"))
        .header("x-goog-api-key", &key)
        .header("X-Goog-Upload-Protocol", "resumable")
        .header("X-Goog-Upload-Command", "start")
        .header("X-Goog-Upload-Header-Content-Length", bytes.len().to_string())
        .header("X-Goog-Upload-Header-Content-Type", "audio/ogg")
        .json(&json!({"file": {"display_name": format!("verkz-office-{}", meta["id"].as_str().unwrap_or(""))}}))
        .send()
        .await
        .map_err(|e| format!("Gemini fora do ar: {e}"))?;
    if !started.status().is_success() {
        return Err(gemini_error(started).await);
    }
    let upload_url = started
        .headers()
        .get("x-goog-upload-url")
        .and_then(|v| v.to_str().ok())
        .ok_or("o Gemini não devolveu o endereço de envio")?
        .to_string();
    let up = http
        .post(upload_url)
        .header("X-Goog-Upload-Offset", "0")
        .header("X-Goog-Upload-Command", "upload, finalize")
        .body(bytes)
        .send()
        .await
        .map_err(|e| format!("falha ao enviar o áudio: {e}"))?;
    if !up.status().is_success() {
        return Err(gemini_error(up).await);
    }
    let file: Value = up.json().await.map_err(|e| e.to_string())?;
    let name = file["file"]["name"].as_str().ok_or("resposta sem nome de arquivo")?.to_string();
    let uri = file["file"]["uri"].as_str().ok_or("resposta sem uri")?.to_string();

    // 3) espera o arquivo ficar pronto do lado do Google
    for _ in 0..90 {
        let f: Value = http
            .get(format!("{GEMINI}/v1beta/{name}"))
            .header("x-goog-api-key", &key)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        match f["state"].as_str() {
            Some("ACTIVE") => break,
            Some("FAILED") => return Err("o Gemini não conseguiu ler o áudio".into()),
            _ => tokio::time::sleep(Duration::from_secs(2)).await,
        }
    }

    // 4) transcrição + resumo em JSON
    let timeline = tokio::fs::read_to_string(dir.join("timeline.json")).await.unwrap_or_default();
    let participants = meta["participants"].as_array().map(|a| a.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>().join(", ")).unwrap_or_default();
    let prompt = format!(
        "Você recebe o áudio de uma reunião interna da VERKZ (agência de marketing), em português do Brasil.\n\
         Participantes: {participants}.\n\
         Linha do tempo de quem estava falando (segundos desde o início, nomes), registrada pelo app: {timeline}\n\n\
         Faça:\n\
         1. A transcrição completa e fiel, em ordem, separada por falas. Em cada fala use o tempo (MM:SS) e o nome de quem falou, \
         usando a linha do tempo para descobrir os nomes. Se não der para saber, use \"Participante\".\n\
         2. Um resumo curto e objetivo (até 8 linhas).\n\
         3. As decisões tomadas.\n\
         4. As tarefas combinadas, com responsável e prazo quando forem ditos.\n\
         Não invente nada que não foi dito. Responda só no formato JSON pedido."
    );
    let schema = json!({
        "type": "OBJECT",
        "properties": {
            "resumo": {"type": "STRING"},
            "decisoes": {"type": "ARRAY", "items": {"type": "STRING"}},
            "tarefas": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
                "tarefa": {"type": "STRING"}, "responsavel": {"type": "STRING"}, "prazo": {"type": "STRING"}
            }, "required": ["tarefa"]}},
            "transcricao": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
                "tempo": {"type": "STRING"}, "quem": {"type": "STRING"}, "fala": {"type": "STRING"}
            }, "required": ["tempo", "quem", "fala"]}}
        },
        "required": ["resumo", "decisoes", "tarefas", "transcricao"]
    });
    let body = json!({
        "contents": [{"parts": [
            {"file_data": {"mime_type": "audio/ogg", "file_uri": uri}},
            {"text": prompt}
        ]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": schema}
    });
    let resp = http
        .post(format!("{GEMINI}/v1beta/models/{}:generateContent", st.cfg.gemini_model))
        .header("x-goog-api-key", &key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Gemini fora do ar: {e}"))?;
    let ok = resp.status().is_success();
    let result = if ok { Ok(resp.json::<Value>().await.map_err(|e| e.to_string())?) } else { Err(gemini_error(resp).await) };

    // o arquivo no Google não é mais necessário
    let _ = http.delete(format!("{GEMINI}/v1beta/{name}")).header("x-goog-api-key", &key).send().await;

    let result = result?;
    let text: String = result["candidates"][0]["content"]["parts"]
        .as_array()
        .map(|ps| ps.iter().filter_map(|p| p["text"].as_str()).collect())
        .unwrap_or_default();
    let notes: Value = serde_json::from_str(&text).map_err(|_| {
        let why = result["candidates"][0]["finishReason"].as_str().unwrap_or("resposta vazia");
        format!("o Gemini não devolveu a transcrição ({why})")
    })?;
    tokio::fs::write(dir.join("notes.json"), serde_json::to_vec_pretty(&notes).unwrap())
        .await
        .map_err(|e| e.to_string())?;
    info!("transcrição pronta: {dir:?}");
    Ok(())
}

async fn gemini_error(r: reqwest::Response) -> String {
    let code = r.status();
    let v: Value = r.json().await.unwrap_or(Value::Null);
    let msg = v["error"]["message"].as_str().unwrap_or("erro desconhecido");
    format!("Gemini respondeu {code}: {}", msg.chars().take(300).collect::<String>())
}
