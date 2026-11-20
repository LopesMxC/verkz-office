//! Recursos nativos extras: app em uso (atividade), HTTP para os painéis com API
//! e a janela do YouTube Music (tocar e controlar a música sem sair do escritório).

use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

// ------------------------------------------------------------------ atividade

#[derive(Serialize, Clone)]
pub struct ActiveApp {
    app: String,
    title: String,
}

/// Nome amigável a partir do executável.
#[allow(dead_code)]
fn friendly(exe: &str) -> String {
    let base = exe.rsplit(['\\', '/']).next().unwrap_or(exe);
    let lower = base.to_lowercase();
    let stem = lower.trim_end_matches(".exe");
    let known: &[(&str, &str)] = &[
        ("chrome", "Google Chrome"),
        ("msedge", "Microsoft Edge"),
        ("firefox", "Firefox"),
        ("brave", "Brave"),
        ("opera", "Opera"),
        ("code", "VS Code"),
        ("cursor", "Cursor"),
        ("excel", "Excel"),
        ("winword", "Word"),
        ("powerpnt", "PowerPoint"),
        ("outlook", "Outlook"),
        ("olk", "Outlook"),
        ("teams", "Microsoft Teams"),
        ("ms-teams", "Microsoft Teams"),
        ("slack", "Slack"),
        ("discord", "Discord"),
        ("whatsapp", "WhatsApp"),
        ("whatsapp.root", "WhatsApp"),
        ("telegram", "Telegram"),
        ("spotify", "Spotify"),
        ("figma", "Figma"),
        ("photoshop", "Photoshop"),
        ("illustrator", "Illustrator"),
        ("afterfx", "After Effects"),
        ("adobe premiere pro", "Premiere Pro"),
        ("resolve", "DaVinci Resolve"),
        ("capcut", "CapCut"),
        ("canva", "Canva"),
        ("notion", "Notion"),
        ("claude", "Claude"),
        ("explorer", "Explorador de Arquivos"),
        ("verkz-office", "VERKZ Office"),
        ("verkz office", "VERKZ Office"),
        ("finder", "Finder"),
        ("safari", "Safari"),
        ("zoom", "Zoom"),
        ("obs64", "OBS"),
        ("obs", "OBS"),
        ("anydesk", "AnyDesk"),
    ];
    for (k, v) in known {
        if stem == *k {
            return v.to_string();
        }
    }
    let mut s = stem.replace(['_', '-'], " ");
    if let Some(f) = s.get(0..1) {
        s = f.to_uppercase() + &s[1..];
    }
    s
}

#[cfg(target_os = "windows")]
fn foreground() -> Option<ActiveApp> {
    use windows_sys::Win32::Foundation::{CloseHandle, MAX_PATH};
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId};
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let mut title = [0u16; 512];
        let n = GetWindowTextW(hwnd, title.as_mut_ptr(), title.len() as i32);
        let title = String::from_utf16_lossy(&title[..n.max(0) as usize]);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return Some(ActiveApp { app: "Desconhecido".into(), title });
        }
        let mut buf = [0u16; MAX_PATH as usize * 2];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut len);
        CloseHandle(h);
        let exe = if ok != 0 { String::from_utf16_lossy(&buf[..len as usize]) } else { String::new() };
        Some(ActiveApp { app: friendly(&exe), title })
    }
}

#[cfg(target_os = "macos")]
fn foreground() -> Option<ActiveApp> {
    // lsappinfo não pede permissão de acessibilidade
    let front = std::process::Command::new("lsappinfo").arg("front").output().ok()?;
    let asn = String::from_utf8_lossy(&front.stdout).trim().to_string();
    if asn.is_empty() {
        return None;
    }
    let info = std::process::Command::new("lsappinfo").args(["info", "-only", "name", &asn]).output().ok()?;
    let txt = String::from_utf8_lossy(&info.stdout);
    let name = txt.split('=').nth(1).map(|s| s.trim().trim_matches('"').to_string()).unwrap_or_default();
    if name.is_empty() {
        return None;
    }
    Some(ActiveApp { app: friendly(&name), title: String::new() })
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn foreground() -> Option<ActiveApp> {
    None
}

#[tauri::command]
pub async fn active_app() -> Option<ActiveApp> {
    tauri::async_runtime::spawn_blocking(foreground).await.ok().flatten()
}

// ------------------------------------------------------------------ HTTP dos painéis

#[tauri::command]
pub async fn http_get(url: String) -> Result<String, String> {
    let u = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if u.scheme() != "https" {
        return Err("Só endereços https".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("VERKZ-Office/1.0")
        .build()
        .map_err(|e| e.to_string())?;
    let r = client.get(u).send().await.map_err(|e| e.to_string())?;
    if !r.status().is_success() {
        return Err(format!("HTTP {}", r.status().as_u16()));
    }
    let bytes = r.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > 2_000_000 {
        return Err("Resposta grande demais".into());
    }
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

// ------------------------------------------------------------------ YouTube Music

/// Roda dentro da janela do YouTube Music: manda o que está tocando para o app.
const YTM_SCRIPT: &str = r#"
(function () {
  if (window.__verkzYtm) return;
  window.__verkzYtm = true;
  let last = "";
  function send() {
    try {
      const md = navigator.mediaSession && navigator.mediaSession.metadata;
      const video = document.querySelector("video");
      const state = md ? {
        title: md.title || "",
        artist: md.artist || "",
        cover: (md.artwork && md.artwork.length) ? md.artwork[md.artwork.length - 1].src : "",
        playing: !!(video && !video.paused)
      } : null;
      const s = JSON.stringify(state);
      if (s !== last && window.__TAURI_INTERNALS__) {
        last = s;
        window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "ytm-state", payload: state });
      }
    } catch (e) {}
  }
  setInterval(send, 1500);
})();
"#;

fn ytm_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window("ytmusic") {
        return Ok(w);
    }
    let url = "https://music.youtube.com".parse().map_err(|e: url::ParseError| e.to_string())?;
    let w = WebviewWindowBuilder::new(app, "ytmusic", WebviewUrl::External(url))
        .title("YouTube Music — VERKZ Office")
        .inner_size(1100.0, 760.0)
        .visible(false)
        .initialization_script(YTM_SCRIPT)
        .build()
        .map_err(|e| e.to_string())?;
    // fechar a janela só esconde: a música continua tocando
    let w2 = w.clone();
    w.on_window_event(move |ev| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = ev {
            api.prevent_close();
            let _ = w2.hide();
        }
    });
    Ok(w)
}

#[tauri::command]
pub async fn ytm_open(app: AppHandle, show: bool) -> Result<(), String> {
    let w = ytm_window(&app)?;
    if show {
        w.show().map_err(|e| e.to_string())?;
        let _ = w.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub async fn ytm_control(app: AppHandle, action: String) -> Result<(), String> {
    let w = app.get_webview_window("ytmusic").ok_or("Abra o YouTube Music primeiro")?;
    let js = match action.as_str() {
        "toggle" | "play" | "pause" => {
            r#"(document.querySelector('#play-pause-button') || document.querySelector('ytmusic-player-bar tp-yt-paper-icon-button.play-pause-button'))?.click()"#
        }
        "next" => r#"document.querySelector('.next-button')?.click()"#,
        "previous" => r#"document.querySelector('.previous-button')?.click()"#,
        _ => return Err("ação inválida".into()),
    };
    w.eval(js).map_err(|e| e.to_string())
}

/// Quando a janela principal fecha, fecha tudo (inclusive o YouTube Music escondido).
pub fn on_main_close(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("ytmusic") {
        let _ = w.destroy();
    }
    app.exit(0);
}

#[allow(dead_code)]
pub fn emit_ytm(app: &AppHandle) {
    let _ = app.emit("ytm-state", serde_json::Value::Null);
}
