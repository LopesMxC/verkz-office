// Ponte com o lado nativo (Rust/Tauri). No navegador (modo de teste) tudo fica desligado.
import { invoke } from "@tauri-apps/api/core";
import { openUrl, openPath } from "@tauri-apps/plugin-opener";

export const isNative = typeof (window as any).__TAURI_INTERNALS__ !== "undefined";

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isNative) throw new Error("Disponível só no app instalado");
  return invoke<T>(cmd, args);
}

export interface AgendaItem {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  meet: string | null;
  link: string;
}

export interface NowPlaying {
  title: string;
  artist: string;
  playing: boolean;
  url: string;
  cover?: string;
}

export const integrations = {
  status: () => call<{ google: boolean; spotify: boolean; google_configured: boolean; spotify_configured: boolean }>("integrations_status"),
  setCreds: (creds: { google_client_id: string; google_client_secret: string; spotify_client_id: string }) =>
    call<void>("integrations_set_creds", { creds }),
  disconnect: (provider: "google" | "spotify") => call<void>("integrations_disconnect", { provider }),
  googleConnect: () => call<void>("google_connect"),
  agenda: () => call<AgendaItem[]>("google_agenda"),
  gmailUnread: () => call<number>("gmail_unread"),
  spotifyConnect: () => call<void>("spotify_connect"),
  spotifyNow: () => call<NowPlaying | null>("spotify_now"),
  spotifyControl: (action: "play" | "pause" | "next" | "previous") => call<void>("spotify_control", { action }),
};

/** Abre link ou programa. No navegador, cai para window.open. */
export async function openTarget(target: string) {
  const isUrl = /^[a-z][a-z0-9+.-]*:/i.test(target);
  if (!isNative) {
    if (isUrl) window.open(target, "_blank");
    return;
  }
  if (isUrl) await openUrl(target);
  else await openPath(target);
}

export interface Shortcut {
  name: string;
  target: string;
}

export const DEFAULT_SHORTCUTS: Shortcut[] = [
  { name: "Gmail", target: "https://mail.google.com" },
  { name: "Agenda", target: "https://calendar.google.com" },
  { name: "Novo Meet", target: "https://meet.google.com/new" },
  { name: "Drive", target: "https://drive.google.com" },
  { name: "Spotify", target: "https://open.spotify.com" },
  { name: "YouTube Music", target: "https://music.youtube.com" },
  { name: "Verkz System", target: "https://verkzsystem.tech" },
];

// ------------------------------------------------------------------ HTTP (APIs dos painéis)
/** GET de JSON. No app instalado passa pelo Rust (sem problema de CORS). */
export async function httpJson<T = unknown>(url: string): Promise<T> {
  if (isNative) {
    const text = await invoke<string>("http_get", { url });
    return JSON.parse(text) as T;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

// ------------------------------------------------------------------ atividade (app em primeiro plano)
export interface ActiveApp {
  app: string;
  title: string;
}
export const activeApp = () => call<ActiveApp | null>("active_app");

// ------------------------------------------------------------------ YouTube Music
export interface YtmState {
  title: string;
  artist: string;
  cover?: string;
  playing: boolean;
}
export const ytm = {
  open: (show = true) => call<void>("ytm_open", { show }),
  close: () => call<void>("ytm_close"),
  control: (action: "play" | "pause" | "toggle" | "next" | "previous") => call<void>("ytm_control", { action }),
  /** Recebe o que está tocando (a janela do YouTube Music manda a cada poucos segundos). */
  async listen(cb: (s: YtmState | null) => void) {
    if (!isNative) return;
    const { listen } = await import("@tauri-apps/api/event");
    await listen<YtmState | null>("ytm-state", (e) => cb(e.payload));
  },
};

// ------------------------------------------------------------------ atualizações automáticas
export interface UpdateInfo {
  version: string;
  notes?: string;
  install: (onProgress?: (pct: number) => void) => Promise<void>;
}
export async function appVersion() {
  if (!isNative) return "web";
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}
export async function checkUpdate(): Promise<UpdateInfo | null> {
  if (!isNative) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  const u = await check();
  if (!u) return null;
  return {
    version: u.version,
    notes: u.body ?? undefined,
    install: async (onProgress) => {
      let total = 0;
      let got = 0;
      await u.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? 0;
        if (ev.event === "Progress") {
          got += ev.data.chunkLength;
          if (total) onProgress?.(Math.round((got / total) * 100));
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    },
  };
}
