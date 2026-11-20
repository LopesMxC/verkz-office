import "./style.css";
import { World, PeerInfo, EMOTES, HOLD_ITEMS } from "./world";
import { Net } from "./net";
import { Media, MediaPrefs, RANGES } from "./media";
import { Editor } from "./editor";
import { CharacterPreview, openCreator } from "./creator";
import { Look, lookColor, normalizeLook, randomLook } from "./avatar";
import { icon } from "./icons";
import { logoEl } from "./logo";
import { AgendaItem, DEFAULT_SHORTCUTS, integrations, isNative, NowPlaying, openTarget, Shortcut, activeApp, ytm, YtmState, appVersion, checkUpdate, UpdateInfo } from "./integrations";
import type { Item, Layout, Zone } from "./furniture";
import { DEFS } from "./furniture";
import { soundPrefs, SoundPrefs, notify, approachChime, footstep, kitchenSound, PAD_SOUNDS, listCustom, addCustom, removeCustom, playPad, PadSound } from "./sound";
import { EnvConfig, WEATHERS, SEASONS, HOLIDAYS, seasonByDate, weatherFromCode, resolveHoliday, Weather, Season } from "./env";
import { DEFAULT_GOAL, DEFAULT_CUSTOM, GoalCfg, CustomCfg, financeData, weatherData, customValue, weatherText, fmtBRL, fmtNum, refreshWidgets } from "./widgets";
import { loadModels } from "./models";
import { Recorder } from "./recorder";

// começa a baixar os modelos 3D já na tela de entrada
const modelsReady = loadModels();

// ------------------------------------------------------------ preferências locais
interface Prefs {
  name: string;
  server: string;
  key: string;
  look: Look;
  shareMusic: boolean;
  shareMeeting: boolean;
  manualStatus: string;
  shortcuts: Shortcut[];
  adminKey: string;
  shareActivity: boolean;
  shareAgendaTitles: boolean;
  weatherFx: boolean;
  media: MediaPrefs;
  sound: SoundPrefs;
}
const PREFS_KEY = "verkz-office:prefs";
function loadPrefs(): Prefs {
  let p: Partial<Prefs> = {};
  try {
    p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
  } catch {
    /* sem preferências salvas */
  }
  return {
    name: p.name ?? "",
    server: p.server ?? (import.meta.env.VITE_OFFICE_SERVER || "wss://office.verkzsystem.tech/ws"),
    key: p.key ?? "",
    look: normalizeLook(p.look ?? randomLook()),
    shareMusic: p.shareMusic ?? true,
    shareMeeting: p.shareMeeting ?? true,
    manualStatus: p.manualStatus ?? "",
    shortcuts: p.shortcuts ?? DEFAULT_SHORTCUTS,
    adminKey: p.adminKey ?? "",
    shareActivity: p.shareActivity ?? true,
    shareAgendaTitles: p.shareAgendaTitles ?? false,
    weatherFx: p.weatherFx ?? true,
    media: { noiseSuppression: true, micOnJoin: true, mirror: true, camQuality: "360", range: "medio", ...(p.media ?? {}) },
    sound: { ...soundPrefs, ...(p.sound ?? {}) },
  };
}
const prefs = loadPrefs();
const savePrefs = () => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* armazenamento indisponível */
  }
};

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const hud = $("#hud");
const overlay = $("#overlay");
const hm = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

// ------------------------------------------------------------ sons curtos
function blip(kind: "msg" | "wave" | "join" | "call" | "emote" | "error" = "msg") {
  notify(kind);
}
Object.assign(soundPrefs, prefs.sound);

// sem o menu do navegador (Salvar imagem como / Copiar imagem) — só em campos de texto
document.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement;
  if (t.closest("input, textarea, [contenteditable]")) return;
  e.preventDefault();
});

// ------------------------------------------------------------ avisos
const toasts = document.createElement("div");
toasts.className = "toasts";
hud.appendChild(toasts);
function toast(msg: string, err = false) {
  const t = document.createElement("div");
  t.className = "panel toast" + (err ? " err" : "");
  t.textContent = msg;
  toasts.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

// ------------------------------------------------------------ tela de entrada
function showLogin(error = "") {
  let serverOpen = prefs.server.includes("localhost") || !!error;
  overlay.innerHTML = `
    <div class="login-bg"></div>
    <div class="login-wrap">
      <form class="panel login">
        <div class="brand">${logoEl(40)}<div><div class="t-l">Office</div><div class="t-s c2">Escritório virtual da VERKZ</div></div></div>
        <div class="char-row">
          <canvas></canvas>
          <div class="grow"><div class="t-m">Seu personagem</div><div class="t-s c2">Roupa, cabelo e acessórios</div></div>
          <button type="button" class="btn secondary" data-edit>Editar</button>
        </div>
        <label class="field"><span class="label">Seu nome</span><input class="input" name="name" maxlength="32" required value="${esc(prefs.name)}" autocomplete="name"></label>
        <label class="field"><span class="label">Chave do escritório</span><input class="input" name="key" type="password" required value="${esc(prefs.key)}"></label>
        <div>
          <button type="button" class="server-toggle ${serverOpen ? "open" : ""}" data-server>${icon("chevron-right", 14)} Servidor: ${esc(prefs.server.replace(/^wss?:\/\//, "").replace(/\/ws$/, ""))}</button>
          <label class="field ${serverOpen ? "" : "hidden"}" style="margin-top:10px" data-server-field><input class="input" name="server" value="${esc(prefs.server)}"></label>
        </div>
        <div class="err">${esc(error)}</div>
        <button class="btn primary block">Entrar no escritório</button>
      </form>
    </div>`;
  const pv = new CharacterPreview($<HTMLCanvasElement>(".char-row canvas", overlay), prefs.look, 2);
  $("[data-server]", overlay).addEventListener("click", (e) => {
    serverOpen = !serverOpen;
    (e.currentTarget as HTMLElement).classList.toggle("open", serverOpen);
    $("[data-server-field]", overlay).classList.toggle("hidden", !serverOpen);
  });
  $("[data-edit]", overlay).addEventListener("click", async () => {
    const l = await openCreator(document.body, prefs.look);
    if (l) {
      prefs.look = l;
      savePrefs();
      pv.setLook(l);
    }
  });
  $("form", overlay).addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    prefs.name = String(f.get("name")).trim();
    prefs.key = String(f.get("key"));
    prefs.server = String(f.get("server")).trim();
    savePrefs();
    pv.dispose();
    overlay.innerHTML = "";
    start();
  });
}

// ------------------------------------------------------------ estado do app
let world: World;
let net: Net;
let media: Media;
let editor: Editor;
let myId = "";
let connected = false;
let chatTab: "geral" | "sala" = "geral";
let unread = 0;
const chatLog: any[] = [];
let rightPanel: "chat" | "apps" | "meetings" | "team" | null = null;
let recorder: Recorder;
let recStarting = false;
let leftOpen = true;
let agenda: AgendaItem[] = [];
let mailUnread: number | null = null;
let nowPlaying: NowPlaying | null = null;
let integ = { google: false, spotify: false, google_configured: false, spotify_configured: false };
let addingShortcut = false;
let started = false;
let isAdmin = false;
let ytmState: YtmState | null = null;
let pendingUpdate: UpdateInfo | null = null;

/** Endereço http(s) do servidor, a partir do endereço do WebSocket. */
const httpBase = () => prefs.server.replace(/^ws/, "http").replace(/\/ws\/?$/, "");
/** Chamada à API do servidor com a chave do escritório. */
const api = (path: string, init: RequestInit = {}) =>
  fetch(httpBase() + path, { ...init, headers: { ...(init.headers as Record<string, string>), "x-office-key": prefs.key } });

function start() {
  if (!started) {
    started = true;
    world = new World($("#stage"));
    media = new Media(world);
    media.prefs = prefs.media;
    media.onApproach = () => {
      if (soundPrefs.approach) approachChime();
    };
    media.onLocalState = (patch) => sendState(patch);
    world.onStep = (run, vol) => {
      if (soundPrefs.steps) footstep(run, vol);
    };
    world.onAvatarMenu = (id, x, y, isMe) => openAvatarMenu(id, x, y, isMe);
    world.onAvatarClick = (id, x, y) => openPersonCard(id, x, y);
    world.onItemClick = (it, x, y) => onItemClick(it, x, y);
    media.onError = (m) => toast(m, true);
    media.onStateChanged = renderDock;
    media.onScreensChanged = renderScreens;
    recorder = new Recorder(media, api, () => prefs.name);
    recorder.onError = (m) => toast(m, true);
    recorder.onChange = () => {
      world.me?.setRecording(recorder.active);
      renderDock();
      renderTop();
    };
    editor = new Editor(world, hud, (layout) => net.send({ t: "layout_save", layout }), toast);
    editor.onClose = () => {
      world.editing = false;
      renderLeft();
      renderDock();
    };
    buildHud();
    world.onMove = (x, z, dir, moving, zone) => net.send({ t: "move", x, z, dir, moving, zone: zone?.id ?? null });
    world.onZoneChange = onZoneChange;
    world.start();
    // ?debug expõe o mundo no console (útil para testes e capturas)
    if (new URLSearchParams(location.search).has("debug")) (window as any).__office = { world, media };
    setInterval(renderPeople, 1000);
    startIntegrations();
    startActivity();
    startUpdates();
    ytm.listen((st) => {
      ytmState = st;
      pushStatus();
      if (rightPanel === "apps") renderApps();
    }).catch(() => {});
    setInterval(applyEnv, 10 * 60_000);
  }

  net = new Net(prefs.server, () => ({ t: "join", key: prefs.key, name: prefs.name, color: lookColor(prefs.look), look: prefs.look, admin_key: prefs.adminKey }));
  net.on("error", (m) => {
    net.close();
    showLogin(m.msg);
  });
  net.on("welcome", async (m) => {
    await modelsReady;
    myId = m.id;
    isAdmin = !!m.admin;
    for (const id of [...world.others.keys()]) world.removePeer(id);
    world.setLayout(m.layout as Layout);
    // nasce perto da entrada, com um pequeno desvio para não ficar em cima de ninguém
    const sp = m.layout.spawn ?? { x: 0, z: 8 };
    const me: PeerInfo = { ...m.me, x: sp.x + (Math.random() * 4 - 2), z: sp.z + (Math.random() * 2 - 1), look: prefs.look };
    world.spawnMe(me);
    applyEnv();
    lastActivity = "";
    if (world.me.holding) sendState({ hold: world.me.holding });
    for (const p of m.peers) {
      world.addPeer(p);
      if (p.recording) world.others.get(p.id)?.setRecording(true);
    }
    if (recorder.active) {
      world.me.setRecording(true);
      net.send({ t: "rec", on: true });
    }
    chatLog.length = 0;
    chatLog.push(...m.history);
    lastStatus = null;
    renderChat();
    renderPeople();
    pushStatus();
    media.connect(m.livekit.url, m.livekit.token);
    setConn(true);
    renderDock();
  });
  net.on("close", () => setConn(false));
  net.on("peer_join", (m) => {
    if (m.peer.id === myId) return;
    world.addPeer(m.peer);
    if (m.peer.recording) world.others.get(m.peer.id)?.setRecording(true);
    blip("join");
    renderPeople();
  });
  net.on("state", (m) => {
    if (m.id === myId) return;
    world.others.get(m.id)?.applyExtra(m.patch);
    if (rightPanel === "team") renderTeam();
  });
  net.on("fx", (m) => {
    const a = m.from === myId ? null : world.others.get(m.from);
    if (a && m.data?.emote) {
      a.playEmote(m.data.emote);
      const pos = a.root.position;
      if (world.me && pos.distanceTo(world.me.root.position) < 8) notify("emote");
    }
  });
  net.on("from", (m) => onDirect(m.from, m.name, m.msg));
  net.on("peer_leave", (m) => {
    world.removePeer(m.id);
    renderPeople();
  });
  net.on("peer_move", (m) => world.movePeer(m.id, m.x, m.z, m.dir, m.moving, m.zone));
  net.on("status", (m) => {
    if (m.id === myId) world.me?.setStatus(m.text);
    else world.others.get(m.id)?.setStatus(m.text);
  });
  net.on("look", (m) => {
    if (m.id !== myId) world.others.get(m.id)?.setLook(m.look);
  });
  net.on("layout", (m) => {
    if (!editor.active) {
      world.setLayout(m.layout);
      applyEnv();
    }
    if (m.by !== myId) toast("O escritório foi atualizado");
  });
  net.on("chat", (m) => {
    chatLog.push(m);
    if (chatLog.length > 300) chatLog.shift();
    if (m.from !== myId) {
      if (rightPanel !== "chat") {
        unread++;
        renderDock();
      }
      blip("msg");
    }
    renderChat();
  });
  net.on("rec", (m) => {
    if (m.id === myId) return;
    const a = world.others.get(m.id);
    a?.setRecording(m.on);
    if (m.on && a) toast(`${a.info.name} começou a gravar`);
    renderTop();
  });
  net.on("rec_update", () => {
    if (rightPanel === "meetings") renderMeetings();
  });
  net.on("wave", (m) => {
    blip("wave");
    toast(`${m.name} acenou para você`);
  });
  net.connect();
}

function setConn(ok: boolean) {
  connected = ok;
  renderTop();
}

function onZoneChange(_z: Zone | null) {
  if (!world.currentZone && chatTab === "sala") chatTab = "geral";
  renderTop();
  renderChat();
}

// ------------------------------------------------------------ HUD
function buildHud() {
  for (const [cls, id] of [
    ["panel topbar", "top"],
    ["panel side left", "left"],
    ["panel side right hidden", "right"],
    ["screens", "screens"],
    ["panel dock", "dock"],
  ]) {
    const el = document.createElement("div");
    el.className = cls;
    el.id = id;
    hud.appendChild(el);
  }
  renderTop();
  renderLeft();
  renderDock();
}

function renderTop() {
  const el = $("#top");
  if (!el) return;
  const z = world?.currentZone;
  const online = (world?.others.size ?? 0) + 1;
  el.innerHTML = `${logoEl(26)}<span class="t-m">Office</span><span class="divider"></span>
    <span class="chip accent">${z?.private ? icon("lock", 13) : '<span class="dot"></span>'}${esc(z ? z.name : "Área aberta")}</span>
    <span class="chip" title="${connected ? "Conectado" : "Reconectando..."}"><span class="dot ${connected ? "ok" : "bad"}"></span>${online} online</span>
    ${recordingNames().length ? `<span class="chip rec" title="Gravando: ${esc(recordingNames().join(", "))}"><span class="dot"></span>Gravando</span>` : ""}`;
}

/** Quem está gravando agora (inclui você). */
function recordingNames() {
  if (!world) return [];
  const n = [...world.others.values()].filter((a) => a.recording).map((a) => a.info.name);
  if (recorder?.active) n.unshift("você");
  return n;
}

function renderLeft() {
  const el = $("#left");
  if (!el) return;
  el.classList.toggle("hidden", !leftOpen || editor?.active);
  if (el.dataset.built) return;
  el.dataset.built = "1";
  el.innerHTML = `
    <div class="panel-head"><div class="t-m">Pessoas</div><button class="x-btn" data-close>${icon("x", 18)}</button></div>
    <label class="status-input"><span class="dot"></span><input id="my-status" placeholder="Seu status (ex.: focado)" maxlength="60" value="${esc(prefs.manualStatus)}"></label>
    <div class="scroll"><div class="people-list" id="people"></div></div>`;
  $("[data-close]", el).addEventListener("click", () => {
    leftOpen = false;
    renderLeft();
    renderDock();
  });
  $<HTMLInputElement>("#my-status").addEventListener("change", (e) => {
    prefs.manualStatus = (e.target as HTMLInputElement).value.trim();
    savePrefs();
    pushStatus();
  });
  $("#people").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const w = t.closest("[data-wave]") as HTMLElement | null;
    if (w) {
      net.send({ t: "wave", to: w.dataset.wave });
      toast("Aceno enviado");
      return;
    }
    const row = t.closest(".person[data-id]") as HTMLElement | null;
    if (row) openPersonCard(row.dataset.id!, e.clientX, e.clientY);
  });
  $("#people").addEventListener("contextmenu", (e) => {
    const row = (e.target as HTMLElement).closest(".person[data-id]") as HTMLElement | null;
    if (row) openAvatarMenu(row.dataset.id!, e.clientX, e.clientY, false);
  });
}

function renderDock() {
  const dock = $("#dock");
  if (!dock) return;
  const b = (id: string, ic: string, tip: string, cls = "", extra = "") =>
    `<button class="icon-btn ${cls}" data-id="${id}" data-tip="${tip}" aria-label="${tip}">${icon(ic, 20)}${extra}</button>`;
  dock.innerHTML = [
    b("mic", media?.micOn ? "mic" : "mic-off", media?.micOn ? "Desligar microfone (M)" : "Ligar microfone (M)", media?.micOn ? "" : "off"),
    b("cam", media?.camOn ? "video" : "video-off", media?.camOn ? "Desligar câmera" : "Ligar câmera", media?.camOn ? "active" : "off"),
    b("screen", "screen", media?.screenOn ? "Parar de compartilhar" : "Compartilhar tela", media?.screenOn ? "active" : ""),
    b("rec", "record", recorder?.active ? "Parar gravação" : "Gravar reunião", recorder?.active ? "rec-on" : ""),
    `<span class="divider"></span>`,
    b("emote", "smile", "Emotes (E)", popover === "emote" ? "active" : ""),
    b("pad", "volume", "Soundpad", popover === "pad" ? "active" : ""),
    b("people", "users", "Pessoas", leftOpen && !editor?.active ? "active" : ""),
    b("chat", "chat", "Chat (Enter)", rightPanel === "chat" ? "active" : "", unread ? `<span class="badge">${unread > 9 ? "9+" : unread}</span>` : ""),
    b("meetings", "file-text", "Reuniões gravadas", rightPanel === "meetings" ? "active" : ""),
    b("apps", "calendar", "Agenda e apps", rightPanel === "apps" ? "active" : "", mailUnread ? `<span class="badge">${mailUnread > 99 ? "99+" : mailUnread}</span>` : ""),
    `<span class="divider"></span>`,
    b("char", "shirt", "Personagem"),
    b("edit", "pencil", "Editar escritório", editor?.active ? "active" : ""),
    isAdmin ? b("team", "activity", "Atividade da equipe", rightPanel === "team" ? "active" : "") : "",
    b("settings", "settings", "Configurações"),
    `<span class="divider"></span>`,
    b("exit", "log-out", "Sair"),
  ].join("");
  dock.querySelectorAll<HTMLElement>("[data-id]").forEach((el) => el.addEventListener("click", () => dockAction(el.dataset.id!)));
}

async function dockAction(id: string) {
  switch (id) {
    case "mic":
      await media.setMic(!media.micOn);
      break;
    case "cam":
      await media.setCam(!media.camOn);
      break;
    case "screen":
      await media.setScreen(!media.screenOn);
      break;
    case "rec":
      await toggleRecording();
      break;
    case "meetings":
      openRight(rightPanel === "meetings" ? null : "meetings");
      break;
    case "people":
      if (editor.active) editor.cancel();
      leftOpen = !leftOpen;
      renderLeft();
      break;
    case "chat":
      openRight(rightPanel === "chat" ? null : "chat");
      break;
    case "apps":
      openRight(rightPanel === "apps" ? null : "apps");
      break;
    case "char": {
      const l = await openCreator(document.body, prefs.look);
      if (l) {
        prefs.look = l;
        savePrefs();
        world.me.setLook(l);
        net.send({ t: "look", look: l });
      }
      break;
    }
    case "edit":
      editor.toggle();
      world.editing = editor.active;
      renderLeft();
      break;
    case "emote":
    case "pad":
      togglePopover(id);
      break;
    case "team":
      openRight(rightPanel === "team" ? null : "team");
      break;
    case "settings":
      openSettings();
      break;
    case "exit":
      if (recorder.active) await toggleRecording();
      net.close();
      await media.disconnect();
      for (const pid of [...world.others.keys()]) world.removePeer(pid);
      showLogin();
      break;
  }
  renderDock();
}

window.addEventListener("keydown", (e) => {
  const a = document.activeElement;
  const typing = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement;
  if (typing || !started || overlay.innerHTML || document.querySelector(".modal-bg")) return;
  if (e.key === "m" || e.key === "M") dockAction("mic");
  if (e.key === "e" || e.key === "E") togglePopover("emote");
  if (e.key === "Escape") closeFloating();
  if (!e.ctrlKey && !e.altKey && /^[0-9]$/.test(e.key)) {
    const i = e.key === "0" ? 9 : Number(e.key) - 1;
    if (EMOTES[i]) doEmote(EMOTES[i][0]);
  }
  if (e.key === "Enter") {
    openRight("chat");
    renderDock();
    setTimeout(() => $<HTMLInputElement>("#chat-text")?.focus(), 0);
    e.preventDefault();
  }
});

function openRight(p: typeof rightPanel) {
  rightPanel = p;
  const el = $("#right");
  el.classList.toggle("hidden", !p);
  el.classList.toggle("wide", p === "apps");
  if (p === "chat") {
    unread = 0;
    renderChat();
  }
  if (p === "apps") {
    renderApps();
    refreshIntegrations();
  }
  if (p === "meetings") renderMeetings();
  if (p === "team") renderTeam();
}

const closeRight = () => {
  openRight(null);
  renderDock();
};

// ------------------------------------------------------------ pessoas
function renderPeople() {
  const list = $("#people");
  if (!list || !world?.me) return;
  renderTop();
  const zones = world.layout?.zones ?? [];
  const zname = (id: string | null) => zones.find((z) => z.id === id)?.name ?? "Área aberta";
  const level = (id: string) => {
    const g = media.levels.get(id) ?? 0;
    return g > 0.66 ? 3 : g > 0.33 ? 2 : g > 0 ? 1 : 0;
  };
  const row = (a: (typeof world.others extends Map<string, infer V> ? V : never)) => {
    const l = level(a.info.id);
    const col = lookColor(a.look);
    return `<div class="person ${a.speaking && l ? "talking" : ""}" data-id="${a.info.id}">
      <span class="avatar" style="background:${col}">${esc(initials(a.info.name))}</span>
      <div class="meta"><div class="nm">${esc(a.info.name)}</div><div class="st">${esc(a.speaking && l ? "Falando" : a.info.status || zname(a.info.zone))}</div></div>
      ${l ? `<span class="bars" data-l="${l}" title="Você ouve esta pessoa"><i></i><i></i><i></i></span>` : ""}
      <button class="wave" data-wave="${a.info.id}" title="Acenar">${icon("hand", 18)}</button>
    </div>`;
  };
  const all = [...world.others.values()].sort((a, b) => a.info.name.localeCompare(b.info.name));
  const near = all.filter((a) => level(a.info.id) > 0);
  const rest = all.filter((a) => level(a.info.id) === 0);
  list.innerHTML = !all.length
    ? `<div class="empty">Ninguém mais por aqui agora.</div>`
    : (near.length ? `<div class="label">Perto de você</div>${near.map(row).join("")}` : "") +
      (rest.length ? `<div class="label">No escritório</div>${rest.map(row).join("")}` : "");
}

// ------------------------------------------------------------ chat
function renderChat() {
  if (rightPanel !== "chat") return;
  const el = $("#right");
  const zone = world.currentZone;
  const msgs = chatLog.filter((m) => (chatTab === "geral" ? !m.zone : m.zone === zone?.id));
  const keep = $<HTMLInputElement>("#chat-text")?.value ?? "";
  const hadFocus = document.activeElement?.id === "chat-text";
  el.innerHTML = `
    <div class="panel-head"><div class="t-m">Chat</div><button class="x-btn" data-close>${icon("x", 18)}</button></div>
    <div class="seg">
      <button class="${chatTab === "geral" ? "sel" : ""}" data-tab="geral">Geral</button>
      <button class="${chatTab === "sala" ? "sel" : ""}" data-tab="sala" ${zone ? "" : "disabled"}>${zone ? esc(zone.name) : "Sala"}</button>
    </div>
    <div class="scroll"><div class="messages">${
      msgs.length
        ? msgs.map((m) => `<div class="msg"><span class="who">${esc(m.name)}</span><span class="when">${hm(new Date(m.ts * 1000))}</span><div class="tx">${esc(m.text)}</div></div>`).join("")
        : `<div class="empty">${chatTab === "geral" ? "Nenhuma mensagem ainda." : "Mensagens daqui só aparecem para quem está nesta sala."}</div>`
    }</div></div>
    <form class="composer"><input id="chat-text" placeholder="${chatTab === "geral" ? "Mensagem para todos" : "Mensagem para a sala"}" autocomplete="off" maxlength="2000"><button class="send" aria-label="Enviar">${icon("send", 16)}</button></form>`;
  const sc = $(".scroll", el);
  sc.scrollTop = sc.scrollHeight;
  const input = $<HTMLInputElement>("#chat-text");
  input.value = keep;
  if (hadFocus) input.focus();
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") input.blur();
    e.stopPropagation();
  });
  $("[data-close]", el).addEventListener("click", closeRight);
  el.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      chatTab = b.dataset.tab as "geral" | "sala";
      renderChat();
    }),
  );
  $("form", el).addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    net.send({ t: "chat", text, zone: chatTab === "sala" ? world.currentZone?.id ?? null : null });
    input.value = "";
    input.focus();
  });
}

// ------------------------------------------------------------ telas compartilhadas
function renderScreens() {
  const el = $("#screens");
  if (!el) return;
  el.innerHTML = "";
  for (const s of media.screens.values()) {
    const b = document.createElement("button");
    b.className = "panel screen-card";
    b.appendChild(s.el);
    s.el.play().catch(() => {});
    const cap = document.createElement("div");
    cap.className = "cap";
    cap.innerHTML = `<span></span>${icon("maximize", 15)}`;
    cap.querySelector("span")!.textContent = s.local ? "Sua tela" : `Tela de ${s.name}`;
    b.appendChild(cap);
    b.addEventListener("click", () => openScreen(s.key));
    el.appendChild(b);
  }
}

function openScreen(key: string) {
  const s = media.screens.get(key);
  if (!s) return;
  const full = document.createElement("div");
  full.className = "screen-full";
  full.innerHTML = `<div class="bar"><span class="t-m"></span><button class="btn secondary sm">${icon("x", 15)} Fechar</button></div>`;
  $(".t-m", full).textContent = s.local ? "Sua tela" : `Tela de ${s.name}`;
  full.appendChild(s.el);
  document.body.appendChild(full);
  const close = () => {
    clearInterval(watch);
    full.remove();
    renderScreens();
  };
  $("button", full).addEventListener("click", close);
  const watch = setInterval(() => {
    if (!media.screens.has(key)) close();
  }, 500);
}

// ------------------------------------------------------------ gravação de reuniões
async function toggleRecording() {
  if (recStarting) return;
  if (recorder.active) {
    net.send({ t: "rec", on: false });
    toast("Enviando a gravação...");
    try {
      await recorder.stop();
      toast("Gravação salva. A transcrição e o resumo ficam prontos em alguns minutos.");
    } catch (e: any) {
      toast("A gravação não foi finalizada: " + (e?.message ?? e), true);
    }
    if (rightPanel === "meetings") renderMeetings();
    return;
  }
  const z = world.currentZone;
  const title = `${z ? z.name : "Reunião"} · ${new Date().toLocaleDateString("pt-BR")} ${hm(new Date())}`;
  recStarting = true;
  try {
    await recorder.start(title);
    net.send({ t: "rec", on: true });
    toast("Gravando. Todos veem o aviso de gravação acima do seu personagem.");
  } catch (e: any) {
    toast("Não consegui começar a gravar: " + (e?.message ?? e), true);
  }
  recStarting = false;
}

const fmtDur = (s: number) => {
  const m = Math.round((s || 0) / 60);
  return m < 1 ? "menos de 1 min" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const fmtSize = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
const STATUS: Record<string, string> = { gravando: "Gravando", processando: "Transcrevendo...", pronto: "Pronto", erro: "Sem transcrição" };

async function renderMeetings() {
  if (rightPanel !== "meetings") return;
  const el = $("#right");
  const head = `<div class="panel-head"><div class="t-m">Reuniões gravadas</div><button class="x-btn" data-close>${icon("x", 18)}</button></div>`;
  if (!el.querySelector("[data-meetings]")) {
    el.innerHTML = `${head}<div class="scroll" data-meetings><div class="empty">Carregando...</div></div>`;
    $("[data-close]", el).addEventListener("click", closeRight);
  }
  let data: any;
  try {
    const r = await api("/api/rec");
    if (!r.ok) throw new Error(`servidor respondeu ${r.status}`);
    data = await r.json();
  } catch (e: any) {
    if (rightPanel === "meetings") $("[data-meetings]", el).innerHTML = `<div class="empty">Não consegui carregar as gravações (${esc(e?.message ?? e)}).</div>`;
    return;
  }
  if (rightPanel !== "meetings") return;
  const list = data.recordings as any[];
  const now = Date.now() / 1000;
  $("[data-meetings]", el).innerHTML =
    `<div class="note" style="margin-bottom:12px">Para gravar, clique no botão vermelho de gravação no dock. Cada gravação fica aqui por ${data.keep_days} dias e depois é apagada sozinha.${
      data.ai ? "" : " <b>A transcrição está desligada:</b> falta a chave do Gemini no servidor."
    }</div>` +
    (list.length
      ? `<div style="display:flex;flex-direction:column;gap:10px">${list
          .map((m) => {
            const left = Math.max(0, Math.ceil((m.expires - now) / 86400));
            const st = m.status as string;
            return `<div class="meeting">
              <div class="t-m">${esc(m.title)}</div>
              <div class="tm"><span>${new Date(m.started * 1000).toLocaleDateString("pt-BR")} ${hm(new Date(m.started * 1000))}</span><span>${fmtDur(m.duration)}</span>${
                m.by ? `<span>por ${esc(m.by)}</span>` : ""
              }<span class="chip ${st === "pronto" ? "accent" : st === "erro" ? "warn" : ""}">${STATUS[st] ?? esc(st)}</span></div>
              ${st === "erro" && m.error ? `<div class="err-msg">${esc(m.error)}</div>` : ""}
              <div class="row">
                ${st === "pronto" ? `<button class="btn primary sm" data-notes="${m.id}">${icon("file-text", 15)} Resumo e transcrição</button>` : ""}
                ${st !== "gravando" ? `<button class="btn secondary sm" data-dl="${m.id}">${icon("download", 15)} Baixar vídeo${m.size ? ` (${fmtSize(m.size)})` : ""}</button>` : ""}
                ${st === "erro" ? `<button class="btn ghost sm" data-retry="${m.id}">Tentar de novo</button>` : ""}
              </div>
              <div class="note">Apagada em ${left} ${left === 1 ? "dia" : "dias"}</div>
            </div>`;
          })
          .join("")}</div>`
      : `<div class="empty">Nenhuma reunião gravada nos últimos ${data.keep_days} dias.</div>`);
  el.querySelectorAll<HTMLElement>("[data-dl]").forEach((b) =>
    b.addEventListener("click", () =>
      openTarget(`${httpBase()}/api/rec/${b.dataset.dl}/file?key=${encodeURIComponent(prefs.key)}`).catch((err) => toast(String(err), true)),
    ),
  );
  el.querySelectorAll<HTMLElement>("[data-notes]").forEach((b) => b.addEventListener("click", () => openNotes(b.dataset.notes!, list.find((m) => m.id === b.dataset.notes))));
  el.querySelectorAll<HTMLElement>("[data-retry]").forEach((b) =>
    b.addEventListener("click", async () => {
      const r = await api(`/api/rec/${b.dataset.retry}/retry`, { method: "POST" });
      if (!r.ok) toast((await r.json().catch(() => ({}))).error ?? "Não deu para tentar de novo", true);
      renderMeetings();
    }),
  );
}

async function openNotes(id: string, meta: any) {
  let n: any;
  try {
    const r = await api(`/api/rec/${id}/notes`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `servidor respondeu ${r.status}`);
    n = await r.json();
  } catch (e: any) {
    toast(String(e?.message ?? e), true);
    return;
  }
  const lines = (a: any[]) => (a?.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<div class="note">Nada registrado.</div>`);
  const tasks = (n.tarefas ?? []).map((t: any) => [t.tarefa, t.responsavel && `responsável: ${t.responsavel}`, t.prazo && `prazo: ${t.prazo}`].filter(Boolean).join(" · "));
  const text = [
    meta?.title ?? "Reunião",
    "",
    "RESUMO",
    n.resumo ?? "",
    "",
    "DECISÕES",
    ...(n.decisoes ?? []).map((d: string) => `- ${d}`),
    "",
    "TAREFAS",
    ...tasks.map((t: string) => `- ${t}`),
    "",
    "TRANSCRIÇÃO",
    ...(n.transcricao ?? []).map((f: any) => `[${f.tempo}] ${f.quem}: ${f.fala}`),
  ].join("\n");
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="panel notes">
      <div class="panel-head"><div class="t-m"></div><button class="x-btn" data-close>${icon("x", 18)}</button></div>
      <div class="scroll">
        <div class="section"><span class="label">Resumo</span><p>${esc(n.resumo ?? "")}</p></div>
        <div class="section"><span class="label">Decisões</span>${lines(n.decisoes)}</div>
        <div class="section"><span class="label">Tarefas</span>${lines(tasks)}</div>
        <div class="section"><span class="label">Transcrição</span>${
          (n.transcricao ?? []).map((f: any) => `<div class="fala"><span class="t">${esc(f.tempo)}</span><span><b>${esc(f.quem)}:</b> ${esc(f.fala)}</span></div>`).join("") ||
          `<div class="note">Sem falas.</div>`
        }</div>
      </div>
      <div class="foot"><button class="btn secondary sm" data-copy>${icon("copy", 15)} Copiar tudo</button><button class="btn primary sm" data-close2>Fechar</button></div>
    </div>`;
  $(".t-m", bg).textContent = meta?.title ?? "Reunião";
  const close = () => bg.remove();
  $("[data-close]", bg).addEventListener("click", close);
  $("[data-close2]", bg).addEventListener("click", close);
  bg.addEventListener("click", (e) => e.target === bg && close());
  $("[data-copy]", bg).addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copiado");
    } catch {
      toast("Não consegui copiar", true);
    }
  });
  document.body.appendChild(bg);
}

// ------------------------------------------------------------ integrações
async function refreshIntegrations() {
  if (!isNative) return;
  try {
    integ = await integrations.status();
  } catch {
    return;
  }
  if (integ.google) {
    try {
      agenda = await integrations.agenda();
      mailUnread = await integrations.gmailUnread();
    } catch (e) {
      console.warn(e);
    }
  }
  if (integ.spotify) {
    try {
      nowPlaying = await integrations.spotifyNow();
    } catch (e) {
      console.warn(e);
    }
  }
  pushStatus();
  if (rightPanel === "apps") renderApps();
  renderDock();
}

function startIntegrations() {
  refreshIntegrations();
  setInterval(refreshIntegrations, 60_000);
  setInterval(async () => {
    if (isNative && integ.spotify) {
      try {
        nowPlaying = await integrations.spotifyNow();
        pushStatus();
        if (rightPanel === "apps") renderApps();
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    }
  }, 15_000);
}

function ongoingMeeting(): AgendaItem | undefined {
  const now = Date.now();
  return agenda.find((e) => !e.allDay && new Date(e.start).getTime() <= now && new Date(e.end).getTime() > now);
}

let lastStatus: string | null = null;
function pushStatus() {
  let s = prefs.manualStatus;
  const meet = ongoingMeeting();
  if (prefs.shareMeeting && meet) s = `Em reunião até ${hm(new Date(meet.end))}`;
  else if (prefs.shareMusic && nowPlaying?.playing && !s) s = `Ouvindo: ${nowPlaying.title} - ${nowPlaying.artist}`;
  else if (prefs.shareMusic && ytmState?.playing && !s) s = `Ouvindo: ${ytmState.title} - ${ytmState.artist}`;
  if (!s && holdStatus) s = holdStatus;
  if (s === lastStatus || !net) return;
  lastStatus = s;
  net.send({ t: "status", text: s });
  world.me?.setStatus(s);
}

const SHORTCUT_ICON: Record<string, string> = { gmail: "mail", agenda: "calendar", meet: "video", drive: "apps", spotify: "music", "youtube music": "music" };
const shortcutIcon = (n: string) => {
  const k = n.toLowerCase();
  for (const [key, ic] of Object.entries(SHORTCUT_ICON)) if (k.includes(key)) return ic;
  return "external";
};

function renderApps() {
  const el = $("#right");
  const now = Date.now();
  const native = isNative;

  const agendaHtml = !native
    ? `<div class="note">Agenda, Gmail e Spotify funcionam no app instalado.</div>`
    : !integ.google
      ? `<div class="connect">${icon("calendar", 20)}<div class="meta"><div class="t-m">Google Agenda</div><div class="note">Reuniões do dia, Meet com um clique e e-mails não lidos.</div></div><button class="btn primary sm" data-g="connect">Conectar</button></div>`
      : (agenda.length
          ? agenda
              .slice(0, 4)
              .map((e) => {
                const on = !e.allDay && new Date(e.start).getTime() <= now && new Date(e.end).getTime() > now;
                return `<div class="event ${on ? "now" : ""}">
                  <div class="tm">${e.allDay ? "Dia todo" : `${hm(new Date(e.start))} – ${hm(new Date(e.end))}`}${on ? '<span class="chip accent"><span class="dot"></span>Agora</span>' : ""}</div>
                  <div class="t-m">${esc(e.title)}</div>
                  <div class="row">${e.meet ? `<button class="btn ${on ? "primary" : "secondary"} sm" data-open="${esc(e.meet)}">Entrar no Meet</button>` : ""}<button class="btn ghost sm" data-open="${esc(e.link)}">Abrir</button></div>
                </div>`;
              })
              .join("")
          : `<div class="note">Nada na agenda nas próximas 24 h.</div>`) +
        `<button class="btn ghost sm" data-g="disconnect" style="align-self:flex-start">Desconectar Google</button>`;

  const musicHtml = !native
    ? ""
    : !integ.spotify
      ? `<div class="connect">${icon("music", 20)}<div class="meta"><div class="t-m">Spotify</div><div class="note">Mostra o que está tocando e controla o player.</div></div><button class="btn secondary sm" data-s="connect">Conectar</button></div>`
      : `<div class="np">${nowPlaying?.cover ? `<img src="${esc(nowPlaying.cover)}" alt="">` : '<span class="cover"></span>'}
           <div class="meta"><div class="t-m">${esc(nowPlaying?.title ?? "Nada tocando")}</div><div class="t-s c2">${esc(nowPlaying?.artist ?? "Abra o Spotify em algum aparelho")}</div></div>
           <button class="round" data-sc="previous" aria-label="Anterior">${icon("prev", 15)}</button>
           <button class="round primary" data-sc="${nowPlaying?.playing ? "pause" : "play"}" aria-label="Tocar ou pausar">${icon(nowPlaying?.playing ? "pause" : "play", 15)}</button>
           <button class="round" data-sc="next" aria-label="Próxima">${icon("next", 15)}</button>
         </div>`;

  const ytmHtml = !native
    ? ""
    : !ytmState
      ? `<div class="connect">${icon("music", 20)}<div class="meta"><div class="t-m">YouTube Music</div><div class="note">Toca dentro do app. Entre com sua conta Google na primeira vez.</div></div><button class="btn secondary sm" data-y="open">Abrir</button></div>`
      : `<div class="np">${ytmState.cover ? `<img src="${esc(ytmState.cover)}" alt="">` : '<span class="cover"></span>'}
           <div class="meta"><div class="t-m">${esc(ytmState.title || "YouTube Music")}</div><div class="t-s c2">${esc(ytmState.artist || "Escolha uma música")}</div></div>
           <button class="round" data-yc="previous" aria-label="Anterior">${icon("prev", 15)}</button>
           <button class="round primary" data-yc="toggle" aria-label="Tocar ou pausar">${icon(ytmState.playing ? "pause" : "play", 15)}</button>
           <button class="round" data-yc="next" aria-label="Próxima">${icon("next", 15)}</button>
         </div><button class="btn ghost sm" data-y="open" style="align-self:flex-start">Mostrar janela do YouTube Music</button>`;

  el.innerHTML = `
    <div class="panel-head"><div class="t-m">Agenda e apps</div><button class="x-btn" data-close>${icon("x", 18)}</button></div>
    <div class="scroll" style="display:flex;flex-direction:column;gap:16px">
      <div class="section">
        <div class="section-head"><span class="label">Hoje</span>${integ.google && mailUnread != null ? `<button class="mail-link" data-open="https://mail.google.com">${icon("mail", 14)} ${mailUnread} não lidos</button>` : ""}</div>
        ${agendaHtml}
      </div>
      ${native ? `<div class="section"><span class="label">Música</span>${musicHtml}${ytmHtml}</div>` : ""}
      ${native ? `<div class="section">
        <label class="toggle-row"><span>Mostrar “Em reunião” no meu status</span><span class="switch"><input type="checkbox" data-pref="shareMeeting" ${prefs.shareMeeting ? "checked" : ""}><span></span></span></label>
        <label class="toggle-row"><span>Mostrar a música que estou ouvindo</span><span class="switch"><input type="checkbox" data-pref="shareMusic" ${prefs.shareMusic ? "checked" : ""}><span></span></span></label>
      </div>` : ""}
      <div class="section">
        <span class="label">Atalhos</span>
        <div class="shortcuts">
          ${prefs.shortcuts.map((s, i) => `<button class="shortcut" data-open="${esc(s.target)}" title="${esc(s.target)}">${icon(shortcutIcon(s.name), 16)}<span>${esc(s.name)}</span><span class="rm" data-rm="${i}" title="Remover">${icon("x", 12)}</span></button>`).join("")}
          <button class="shortcut add" data-add>${icon("plus", 16)}<span>Adicionar</span></button>
        </div>
        ${addingShortcut ? `<form class="inline-form" id="add-sc">
          <input class="input" name="n" placeholder="Nome (ex.: Canva)" required>
          <input class="input" name="t" placeholder="Link ou caminho do programa" required>
          <div class="row" style="display:flex;gap:8px"><button type="button" class="btn ghost sm" data-cancel-add>Cancelar</button><button class="btn primary sm">Adicionar atalho</button></div>
        </form>` : ""}
      </div>
      ${native ? `<details class="keys"><summary>Chaves das integrações</summary>
        <form id="creds" class="inline-form" style="margin-top:10px">
          <div class="note">Só precisa preencher se o app não veio com elas. Redirect: http://127.0.0.1:43821/callback</div>
          <input class="input" name="gid" placeholder="Google Client ID">
          <input class="input" name="gsec" type="password" placeholder="Google Client Secret">
          <input class="input" name="sid" placeholder="Spotify Client ID">
          <button class="btn secondary sm">Salvar chaves</button>
        </form></details>` : ""}
    </div>`;

  $("[data-close]", el).addEventListener("click", closeRight);
  el.querySelectorAll<HTMLElement>("[data-open]").forEach((b) =>
    b.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-rm]")) return;
      openTarget(b.dataset.open!).catch((err) => toast(String(err), true));
    }),
  );
  el.querySelectorAll<HTMLElement>("[data-rm]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      prefs.shortcuts.splice(Number(b.dataset.rm), 1);
      savePrefs();
      renderApps();
    }),
  );
  el.querySelector("[data-add]")?.addEventListener("click", () => {
    addingShortcut = true;
    renderApps();
    $<HTMLInputElement>('#add-sc input[name="n"]')?.focus();
  });
  el.querySelector("[data-cancel-add]")?.addEventListener("click", () => {
    addingShortcut = false;
    renderApps();
  });
  el.querySelector("#add-sc")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    const n = String(f.get("n")).trim();
    const t = String(f.get("t")).trim();
    if (!n || !t) return;
    prefs.shortcuts.push({ name: n, target: t });
    savePrefs();
    addingShortcut = false;
    renderApps();
  });
  el.querySelectorAll<HTMLInputElement>("[data-pref]").forEach((c) =>
    c.addEventListener("change", () => {
      (prefs as any)[c.dataset.pref!] = c.checked;
      savePrefs();
      pushStatus();
    }),
  );
  const run = async (f: () => Promise<unknown>, okMsg?: string) => {
    try {
      await f();
      if (okMsg) toast(okMsg);
    } catch (err) {
      toast(String(err), true);
    }
    refreshIntegrations();
  };
  el.querySelector('[data-g="connect"]')?.addEventListener("click", () => {
    toast("Abrindo o navegador para autorizar o Google...");
    run(integrations.googleConnect, "Google conectado");
  });
  el.querySelector('[data-g="disconnect"]')?.addEventListener("click", () => run(() => integrations.disconnect("google")));
  el.querySelector('[data-s="connect"]')?.addEventListener("click", () => {
    toast("Abrindo o navegador para autorizar o Spotify...");
    run(integrations.spotifyConnect, "Spotify conectado");
  });
  el.querySelectorAll<HTMLElement>("[data-sc]").forEach((b) => b.addEventListener("click", () => run(() => integrations.spotifyControl(b.dataset.sc as "play" | "pause" | "next" | "previous"))));
  el.querySelectorAll<HTMLElement>('[data-y="open"]').forEach((b) => b.addEventListener("click", () => ytm.open(true).catch((err) => toast(String(err), true))));
  el.querySelectorAll<HTMLElement>("[data-yc]").forEach((b) => b.addEventListener("click", () => ytm.control(b.dataset.yc as "toggle" | "next" | "previous").catch((err) => toast(String(err), true))));
  el.querySelector("#creds")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    run(
      () => integrations.setCreds({ google_client_id: String(f.get("gid")).trim(), google_client_secret: String(f.get("gsec")).trim(), spotify_client_id: String(f.get("sid")).trim() }),
      "Chaves salvas",
    );
  });
}

// ------------------------------------------------------------ estado extra (rede)
function sendState(patch: Record<string, unknown>) {
  world.me?.applyExtra(patch);
  net?.send({ t: "state", patch });
}

/** Fecha menus, cartões e popovers flutuantes. */
function closeFloating() {
  document.querySelectorAll(".ctx-menu, .person-card").forEach((el) => el.remove());
  if (popover) togglePopover(popover);
}
document.addEventListener("pointerdown", (e) => {
  const t = e.target as HTMLElement;
  if (!t.closest(".ctx-menu, .person-card")) document.querySelectorAll(".ctx-menu, .person-card").forEach((el) => el.remove());
});

function floatAt(el: HTMLElement, x: number, y: number) {
  document.querySelectorAll(".ctx-menu, .person-card").forEach((o) => o.remove());
  el.style.left = "0px";
  el.style.top = "0px";
  hud.appendChild(el);
  const r = el.getBoundingClientRect();
  el.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + "px";
  el.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + "px";
}

function menu(x: number, y: number, title: string, items: [string, string, () => void][]) {
  const el = document.createElement("div");
  el.className = "panel ctx-menu";
  el.innerHTML = `<div class="ctx-title">${esc(title)}</div>` + items.map(([ic, label], i) => `<button data-i="${i}">${icon(ic, 16)}<span>${esc(label)}</span></button>`).join("");
  el.querySelectorAll<HTMLElement>("[data-i]").forEach((b) =>
    b.addEventListener("click", () => {
      el.remove();
      items[Number(b.dataset.i)][2]();
    }),
  );
  floatAt(el, x, y);
}

// ------------------------------------------------------------ pessoas: menu e cartão
function goTo(id: string) {
  const a = world.others.get(id);
  if (a) world.walkTo(a.root.position.x + 0.8, a.root.position.z + 0.8);
}

function callPerson(id: string) {
  const z = world.currentZone;
  net.send({ t: "to", to: id, msg: { kind: "call", zone: z?.name ?? "Área aberta", x: world.me.root.position.x, z: world.me.root.position.z } });
  toast(`Chamando ${world.others.get(id)?.info.name ?? "a pessoa"}...`);
}

const agendaWait = new Map<string, (items: any[] | null) => void>();
function requestAgenda(id: string): Promise<any[] | null> {
  return new Promise((res) => {
    agendaWait.set(id, res);
    net.send({ t: "to", to: id, msg: { kind: "agenda_req" } });
    setTimeout(() => {
      if (agendaWait.get(id) === res) {
        agendaWait.delete(id);
        res(null);
      }
    }, 6000);
  });
}

async function showAgenda(id: string) {
  const a = world.others.get(id);
  if (!a) return;
  const bg = modal(`Agenda de ${a.info.name}`, `<div class="note">Buscando...</div>`);
  const items = await requestAgenda(id);
  const body = $(".modal-body", bg);
  if (!body) return;
  if (items === null) body.innerHTML = `<div class="note">A pessoa não respondeu (o app dela pode estar sem a agenda conectada).</div>`;
  else if (!items.length) body.innerHTML = `<div class="note">Agenda livre nas próximas 24 h.</div>`;
  else
    body.innerHTML = items
      .map((e) => `<div class="event"><div class="tm">${e.allDay ? "Dia todo" : `${hm(new Date(e.start))} – ${hm(new Date(e.end))}`}</div><div class="t-m">${esc(e.title)}</div></div>`)
      .join("");
}

function openAvatarMenu(id: string, x: number, y: number, isMe: boolean) {
  if (isMe) {
    menu(x, y, "Você", [
      ["smile", "Emotes", () => togglePopover("emote")],
      ...(world.me.holding ? ([["x", `Largar ${HOLD_ITEMS[world.me.holding]?.label ?? "item"}`, () => setHolding(null)]] as [string, string, () => void][]) : []),
      ["shirt", "Personagem", () => dockAction("char")],
      ["settings", "Configurações", openSettings],
    ]);
    return;
  }
  const a = world.others.get(id);
  if (!a) return;
  const items: [string, string, () => void][] = [
    ["users", "Chamar para cá", () => callPerson(id)],
    ["chevron-right", "Ir até a pessoa", () => goTo(id)],
    ["calendar", "Ver agenda", () => showAgenda(id)],
    [
      "hand",
      "Acenar",
      () => {
        net.send({ t: "wave", to: id });
        toast("Aceno enviado");
      },
    ],
    ["activity", "Ver atividade", () => openPersonCard(id, x, y)],
  ];
  menu(x, y, a.info.name, items);
}

const since = (t?: number) => {
  if (!t) return "";
  const m = Math.max(0, Math.round((Date.now() / 1000 - t) / 60));
  return m < 1 ? "agora" : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h ${m % 60} min`;
};

function openPersonCard(id: string, x: number, y: number) {
  const a = id === myId ? world.me : world.others.get(id);
  if (!a) return;
  const act = a.extra.activity;
  const zones = world.layout?.zones ?? [];
  const zn = zones.find((z) => z.id === a.info.zone)?.name ?? "Área aberta";
  const hold = a.extra.hold && HOLD_ITEMS[a.extra.hold];
  const el = document.createElement("div");
  el.className = "panel person-card";
  el.innerHTML = `
    <div class="pc-head"><span class="avatar" style="background:${lookColor(a.look)}">${esc(initials(a.info.name))}</span>
      <div class="meta"><div class="t-m">${esc(a.info.name)}${id === myId ? " (você)" : ""}</div><div class="t-s c2">${esc(a.info.status || zn)}</div></div></div>
    <div class="pc-row"><span class="label">Onde</span><span>${esc(zn)}</span></div>
    <div class="pc-row"><span class="label">Atividade</span><span>${act?.app ? `${esc(act.app)}${act.title ? `<br><span class="t-s c2">${esc(act.title)}</span>` : ""}<br><span class="t-s c3">${since(act.since)}${act.share === false && isAdmin ? " · visível só para a gestão" : ""}</span>` : '<span class="c3">Não compartilhada</span>'}</span></div>
    ${hold ? `<div class="pc-row"><span class="label">Agora</span><span>${hold.emoji} ${esc(hold.status)}</span></div>` : ""}
    ${a.extra.cam ? `<div class="pc-row"><span class="label">Câmera</span><span>Ligada</span></div>` : ""}
    ${id !== myId ? `<div class="pc-actions"><button class="btn primary sm" data-a="call">Chamar</button><button class="btn secondary sm" data-a="go">Ir até</button><button class="btn ghost sm" data-a="agenda">Agenda</button></div>` : ""}`;
  el.querySelector('[data-a="call"]')?.addEventListener("click", () => (el.remove(), callPerson(id)));
  el.querySelector('[data-a="go"]')?.addEventListener("click", () => (el.remove(), goTo(id)));
  el.querySelector('[data-a="agenda"]')?.addEventListener("click", () => (el.remove(), showAgenda(id)));
  floatAt(el, x + 12, y - 20);
}

/** Mensagens diretas (chamar, agenda...). */
function onDirect(from: string, name: string, msg: any) {
  if (!msg?.kind) return;
  if (msg.kind === "call") {
    notify("call");
    const bg = modal(
      "Chamado",
      `<div class="call-box"><div class="t-m">${esc(name)} está chamando você</div><div class="note">Para: ${esc(msg.zone)}</div></div>`,
      [
        ["Agora não", "ghost", () => net.send({ t: "to", to: from, msg: { kind: "call_reply", ok: false } })],
        [
          "Ir agora",
          "primary",
          () => {
            const a = world.others.get(from);
            const x = a ? a.root.position.x : msg.x;
            const z = a ? a.root.position.z : msg.z;
            world.walkTo(x + 0.9, z + 0.9);
            net.send({ t: "to", to: from, msg: { kind: "call_reply", ok: true } });
          },
        ],
      ],
    );
    setTimeout(() => bg.remove(), 45_000);
  } else if (msg.kind === "call_reply") {
    toast(msg.ok ? `${name} está vindo` : `${name} não pode agora`);
  } else if (msg.kind === "agenda_req") {
    const items = (integ.google ? agenda : []).slice(0, 8).map((e) => ({ start: e.start, end: e.end, allDay: e.allDay, title: prefs.shareAgendaTitles ? e.title : "Ocupado" }));
    net.send({ t: "to", to: from, msg: { kind: "agenda", items, connected: integ.google } });
  } else if (msg.kind === "agenda") {
    const cb = agendaWait.get(from);
    agendaWait.delete(from);
    cb?.(msg.connected === false ? null : msg.items ?? []);
  }
}

// ------------------------------------------------------------ modais genéricos
function modal(title: string, body: string, actions: [string, string, () => void | boolean][] = [], wide = false) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="panel modal ${wide ? "wide" : ""}"><div class="panel-head"><div class="t-m">${esc(title)}</div><button class="x-btn" data-x>${icon("x", 18)}</button></div>
    <div class="modal-body">${body}</div>
    ${actions.length ? `<div class="modal-actions">${actions.map(([l, k], i) => `<button class="btn ${k} sm" data-ma="${i}">${esc(l)}</button>`).join("")}</div>` : ""}</div>`;
  const close = () => bg.remove();
  bg.addEventListener("pointerdown", (e) => e.target === bg && close());
  $("[data-x]", bg).addEventListener("click", close);
  bg.querySelectorAll<HTMLElement>("[data-ma]").forEach((b) =>
    b.addEventListener("click", () => {
      if (actions[Number(b.dataset.ma)][2]() !== false) close();
    }),
  );
  document.body.appendChild(bg);
  return bg;
}

// ------------------------------------------------------------ emotes e soundpad
let popover: "emote" | "pad" | null = null;
function togglePopover(id: string) {
  document.querySelector(".popover")?.remove();
  popover = popover === id ? null : (id as typeof popover);
  renderDock();
  if (!popover) return;
  const el = document.createElement("div");
  el.className = "panel popover";
  hud.appendChild(el);
  if (popover === "emote") {
    el.innerHTML = `<div class="label">Emotes · teclas 1–0</div><div class="emote-grid">${EMOTES.map(([id, emo, label], i) => `<button data-e="${id}" title="${esc(label)} (${(i + 1) % 10})"><span>${emo}</span><small>${esc(label)}</small></button>`).join("")}</div>`;
    el.querySelectorAll<HTMLElement>("[data-e]").forEach((b) => b.addEventListener("click", () => doEmote(b.dataset.e!)));
  } else renderPad(el);
}

let lastEmote = 0;
function doEmote(id: string) {
  if (!world?.me || performance.now() - lastEmote < 600) return;
  lastEmote = performance.now();
  world.me.playEmote(id);
  net.send({ t: "fx", data: { emote: id } });
}

async function renderPad(el: HTMLElement) {
  const custom = await listCustom();
  const btn = (s: PadSound, rm = false) => `<button class="pad" data-p="${esc(s.id)}"><span>${s.emoji ?? "🔊"}</span><small>${esc(s.name)}</small>${rm ? `<i data-rm="${esc(s.id)}" title="Remover">×</i>` : ""}</button>`;
  el.innerHTML = `<div class="section-head"><span class="label">Soundpad</span><span class="t-s c3">Quem está perto ouve</span></div>
    <div class="pad-grid">${PAD_SOUNDS.map((s) => btn(s)).join("")}${custom.map((s) => btn(s, true)).join("")}
      <label class="pad add" title="Adicionar som (mp3/wav até 3 MB)">${icon("plus", 18)}<small>Adicionar</small><input type="file" accept="audio/*" hidden></label></div>
    <label class="slider-row"><span class="t-s">Volume</span><input type="range" min="0" max="1" step="0.05" value="${soundPrefs.soundpad}"></label>`;
  el.querySelectorAll<HTMLElement>("[data-p]").forEach((b) =>
    b.addEventListener("click", async (e) => {
      const rm = (e.target as HTMLElement).closest("[data-rm]") as HTMLElement | null;
      if (rm) {
        await removeCustom(rm.dataset.rm!);
        renderPad(el);
        return;
      }
      try {
        await media.ensureSoundpad();
      } catch {
        /* sem sala de áudio: toca só local */
      }
      playPad(b.dataset.p!);
    }),
  );
  el.querySelector<HTMLInputElement>('input[type="file"]')?.addEventListener("change", async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      await addCustom(f);
      renderPad(el);
    } catch (err) {
      toast(String((err as Error).message ?? err), true);
    }
  });
  el.querySelector<HTMLInputElement>('input[type="range"]')?.addEventListener("input", (e) => {
    soundPrefs.soundpad = Number((e.target as HTMLInputElement).value);
    prefs.sound = { ...soundPrefs };
    savePrefs();
  });
}

// ------------------------------------------------------------ cozinha e itens interativos
let holdStatus = "";
let holdTimer = 0;
function setHolding(kind: string | null, minutes = 4) {
  clearTimeout(holdTimer);
  holdStatus = kind ? HOLD_ITEMS[kind]?.status ?? "" : "";
  sendState({ hold: kind });
  lastStatus = null;
  pushStatus();
  if (kind) holdTimer = window.setTimeout(() => setHolding(null), minutes * 60_000);
}

/** Anda até o item e só então executa a ação. */
function nearItem(it: Item, then: () => void) {
  const me = world.me.root.position;
  const d = Math.hypot(me.x - it.x, me.z - it.z);
  if (d < 2.2) return then();
  world.walkTo(it.x + 1.1, it.z + 1.1);
  const t0 = Date.now();
  const iv = setInterval(() => {
    const p = world.me.root.position;
    if (Math.hypot(p.x - it.x, p.z - it.z) < 2.2) {
      clearInterval(iv);
      then();
    } else if (Date.now() - t0 > 12_000) clearInterval(iv);
  }, 200);
}

function onItemClick(it: Item, x: number, y: number): boolean {
  const take = (kind: string, sound: "pour" | "open" = "pour") => () =>
    nearItem(it, () => {
      kitchenSound(sound);
      setHolding(kind);
      toast(`${HOLD_ITEMS[kind].emoji} ${HOLD_ITEMS[kind].label} na mão`);
    });
  switch (it.type) {
    case "coffee":
      menu(x, y, "Café", [["plus", "Pegar um café", take("cafe")]]);
      return true;
    case "water":
      menu(x, y, "Bebedouro", [["plus", "Pegar água", take("agua")]]);
      return true;
    case "fridge":
      menu(x, y, "Geladeira", [
        ["plus", "Pegar um lanche", take("lanche", "open")],
        ["plus", "Pegar um refrigerante", take("refri", "open")],
      ]);
      return true;
    case "microwave":
      menu(x, y, "Micro-ondas", [
        [
          "plus",
          "Esquentar a marmita",
          () =>
            nearItem(it, () => {
              toast("Esquentando... 5 s");
              kitchenSound("beep");
              setTimeout(() => {
                kitchenSound("beep");
                setHolding("marmita", 20);
                toast("🍱 Marmita pronta. Bom almoço!");
              }, 5000);
            }),
        ],
      ]);
      return true;
    case "fin_panel":
      openFinance();
      return true;
    case "weather_panel":
      openWeather(it);
      return true;
    case "goal_panel":
      openGoal(it);
      return true;
    case "api_panel":
      openApiPanel(it);
      return true;
  }
  return false;
}

/** Salva a configuração de um item no layout do escritório (vale para todos). */
function saveItemCfg(it: Item, cfg: any) {
  const layout: Layout = JSON.parse(JSON.stringify(world.layout));
  const found = layout.items.find((i) => i.id === it.id);
  if (!found) return;
  found.cfg = cfg;
  net.send({ t: "layout_save", layout });
  toast("Painel atualizado");
}

async function openFinance() {
  const bg = modal("Painel financeiro", `<div class="note">Carregando cotações...</div>`, [], true);
  const d = await financeData(true);
  const body = $(".modal-body", bg);
  if (!body) return;
  if (!d) {
    body.innerHTML = `<div class="note">Não deu para buscar as cotações agora. Tente de novo em alguns minutos.</div>`;
    return;
  }
  body.innerHTML = `<div class="fin-grid">${d.quotes
    .map((q) => `<div class="fin-card"><div class="label">${esc(q.name)}</div><div class="t-l">${fmtBRL(q.bid)}</div><div class="t-s ${q.pct >= 0 ? "up" : "down"}">${q.pct >= 0 ? "▲" : "▼"} ${Math.abs(q.pct).toFixed(2)}% hoje</div></div>`)
    .join("")}
    ${d.selic != null ? `<div class="fin-card"><div class="label">Selic (meta)</div><div class="t-l">${d.selic.toLocaleString("pt-BR")}% a.a.</div><div class="t-s c3">Banco Central</div></div>` : ""}
    ${d.ipca != null ? `<div class="fin-card"><div class="label">IPCA 12 meses</div><div class="t-l">${d.ipca.toLocaleString("pt-BR")}%</div><div class="t-s c3">Banco Central</div></div>` : ""}
    </div><div class="note">Atualizado às ${hm(d.updated)} · AwesomeAPI e Banco Central (SGS)</div>`;
}

async function openWeather(it: Item) {
  const env = world.layout?.env ?? {};
  const bg = modal("Clima", `<div class="note">Carregando...</div>`);
  const w = await weatherData(env.lat, env.lon, env.city);
  const body = $(".modal-body", bg);
  if (!body) return;
  body.innerHTML = w
    ? `<div class="t-l">${Math.round(w.temp)}°C · ${esc(weatherText(w.code))}</div><div class="note">${esc(w.city)} · mín ${Math.round(w.min)}° / máx ${Math.round(w.max)}°</div>`
    : `<div class="note">Sem dados do clima agora.</div>`;
  void it;
}

function openGoal(it: Item) {
  const c: GoalCfg = { ...DEFAULT_GOAL, ...(it.cfg ?? {}) };
  const pct = c.target ? Math.min(100, Math.round((c.current / c.target) * 100)) : 0;
  modal(
    c.title,
    `<div class="goal-view"><div class="t-l">${fmtNum(c.current, c.unit)} <span class="c3 t-m">de ${fmtNum(c.target, c.unit)}</span></div>
      <div class="goal-bar"><i style="width:${pct}%"></i></div><div class="t-s c2">${pct}% da meta${c.deadline ? ` · até ${esc(new Date(c.deadline + "T12:00").toLocaleDateString("pt-BR"))}` : ""}</div></div>
    <form class="inline-form" id="goal-form">
      <label class="field"><span class="label">Título</span><input class="input" name="title" value="${esc(c.title)}" maxlength="40"></label>
      <div class="row2"><label class="field"><span class="label">Atual</span><input class="input" name="current" type="number" step="any" value="${c.current}"></label>
      <label class="field"><span class="label">Meta</span><input class="input" name="target" type="number" step="any" value="${c.target}"></label></div>
      <div class="row2"><label class="field"><span class="label">Unidade</span><select class="input" name="unit">${["R$", "un", "%", "vendas", "leads", "clientes"].map((u) => `<option ${u === c.unit ? "selected" : ""}>${u}</option>`).join("")}</select></label>
      <label class="field"><span class="label">Prazo</span><input class="input" name="deadline" type="date" value="${esc(c.deadline ?? "")}"></label></div>
    </form>`,
    [
      ["Cancelar", "ghost", () => {}],
      [
        "Salvar meta",
        "primary",
        () => {
          const f = new FormData($<HTMLFormElement>("#goal-form"));
          saveItemCfg(it, {
            title: String(f.get("title") || "Meta"),
            current: Number(f.get("current")) || 0,
            target: Number(f.get("target")) || 0,
            unit: String(f.get("unit")),
            deadline: String(f.get("deadline") || "") || undefined,
          });
        },
      ],
    ],
  );
}

function openApiPanel(it: Item) {
  const c: CustomCfg = { ...DEFAULT_CUSTOM, ...(it.cfg ?? {}) };
  const bg = modal(
    "Painel de API",
    `<div class="t-l" id="api-val">...</div>
    <form class="inline-form" id="api-form">
      <label class="field"><span class="label">Título</span><input class="input" name="title" value="${esc(c.title)}" maxlength="40"></label>
      <label class="field"><span class="label">URL (https, resposta JSON)</span><input class="input" name="url" value="${esc(c.url)}"></label>
      <label class="field"><span class="label">Caminho do valor (ex.: USDBRL.bid ou data.0.valor)</span><input class="input" name="path" value="${esc(c.path)}"></label>
      <div class="row2"><label class="field"><span class="label">Prefixo</span><input class="input" name="prefix" value="${esc(c.prefix ?? "")}"></label>
      <label class="field"><span class="label">Sufixo</span><input class="input" name="suffix" value="${esc(c.suffix ?? "")}"></label></div>
      <div class="note">Exemplos: dólar (AwesomeAPI), Selic (api.bcb.gov.br), um endpoint do Verkz System que devolva JSON.</div>
    </form>`,
    [
      ["Testar", "secondary", () => (test(), false)],
      [
        "Salvar",
        "primary",
        () => {
          const f = new FormData($<HTMLFormElement>("#api-form"));
          const url = String(f.get("url")).trim();
          if (!/^https:\/\//.test(url)) {
            toast("A URL precisa começar com https://", true);
            return false;
          }
          saveItemCfg(it, { title: String(f.get("title")), url, path: String(f.get("path")).trim(), prefix: String(f.get("prefix")), suffix: String(f.get("suffix")) });
        },
      ],
    ],
  );
  const test = async () => {
    const f = new FormData($<HTMLFormElement>("#api-form", bg));
    const v = await customValue({ title: "", url: String(f.get("url")), path: String(f.get("path")), prefix: String(f.get("prefix")), suffix: String(f.get("suffix")) }, true).catch((e) => `Erro: ${e}`);
    $("#api-val", bg).textContent = String(v ?? "Sem valor nesse caminho");
  };
  test();
}

// ------------------------------------------------------------ clima, estações e datas especiais
async function applyEnv() {
  if (!world?.env || !world.layout) return;
  const cfg: EnvConfig = world.layout.env ?? {};
  world.env.enabled = prefs.weatherFx;
  let weather: Weather = "sol";
  if (cfg.weather && cfg.weather !== "auto") weather = cfg.weather;
  else {
    const w = await weatherData(cfg.lat, cfg.lon, cfg.city).catch(() => null);
    if (w) weather = weatherFromCode(w.code);
  }
  const season: Season = cfg.season && cfg.season !== "auto" ? cfg.season : seasonByDate();
  const holiday = resolveHoliday(cfg);
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  const night = cfg.daynight ? (h >= 19 || h < 5 ? 1 : h >= 18 ? h - 18 : h < 6 ? 6 - h : 0) : 0;
  world.env.set(weather, season, holiday, night);
  if (world.holiday?.id !== holiday?.id) world.setHoliday(holiday);
}

// ------------------------------------------------------------ atividade (app em uso)
let lastActivity = "";
let activitySince = 0;
function startActivity() {
  if (!isNative) return;
  setInterval(async () => {
    if (!connected || !world?.me) return;
    let a = null;
    try {
      a = await activeApp();
    } catch {
      return;
    }
    const app = a?.app ?? "";
    const title = (a?.title ?? "").slice(0, 120);
    const key = `${app}|${title}|${prefs.shareActivity}`;
    if (key === lastActivity) return;
    if (!lastActivity.startsWith(app + "|")) activitySince = Math.floor(Date.now() / 1000);
    lastActivity = key;
    sendState({ activity: app ? { app, title, share: prefs.shareActivity, since: activitySince } : null });
  }, 5000);
}

function renderTeam() {
  if (rightPanel !== "team") return;
  const el = $("#right");
  const all = [...world.others.values()].sort((a, b) => a.info.name.localeCompare(b.info.name));
  el.innerHTML = `<div class="panel-head"><div class="t-m">Atividade da equipe</div><button class="x-btn" data-close>${icon("x", 18)}</button></div>
    <div class="note">Visível só para a gestão. Mostra o app em primeiro plano de cada pessoa.</div>
    <div class="scroll"><div class="team-list">${
      all.length
        ? all
            .map((a) => {
              const act = a.extra.activity;
              return `<div class="team-row" data-id="${a.info.id}"><span class="avatar" style="background:${lookColor(a.look)}">${esc(initials(a.info.name))}</span>
              <div class="meta"><div class="nm">${esc(a.info.name)}</div><div class="st">${act?.app ? `<b>${esc(act.app)}</b>${act.title ? ` — ${esc(act.title)}` : ""}` : "Sem dados (app web ou versão antiga)"}</div><div class="t-s c3">${act?.app ? since(act.since) : ""}${act && act.share === false ? " · compartilhamento desligado" : ""}</div></div></div>`;
            })
            .join("")
        : `<div class="empty">Ninguém mais online.</div>`
    }</div></div>`;
  $("[data-close]", el).addEventListener("click", closeRight);
  el.querySelectorAll<HTMLElement>(".team-row").forEach((r) => r.addEventListener("click", (e) => openPersonCard(r.dataset.id!, e.clientX, e.clientY)));
}
setInterval(() => rightPanel === "team" && renderTeam(), 15_000);

// ------------------------------------------------------------ atualizações automáticas
function startUpdates() {
  if (!isNative) return;
  const run = async () => {
    try {
      const u = await checkUpdate();
      if (u && !pendingUpdate) {
        pendingUpdate = u;
        showUpdateBanner();
      }
    } catch (e) {
      console.warn("update:", e);
    }
  };
  setTimeout(run, 8000);
  setInterval(run, 6 * 3600_000);
}

function showUpdateBanner() {
  if (!pendingUpdate || document.querySelector(".update-banner")) return;
  const el = document.createElement("div");
  el.className = "panel update-banner";
  el.innerHTML = `${icon("download", 18)}<div class="meta"><div class="t-m">Nova versão ${esc(pendingUpdate.version)}</div><div class="t-s c2">${esc(pendingUpdate.notes ?? "Melhorias e correções")}</div></div>
    <button class="btn ghost sm" data-later>Depois</button><button class="btn primary sm" data-now>Atualizar</button>`;
  $("[data-later]", el).addEventListener("click", () => el.remove());
  $("[data-now]", el).addEventListener("click", async () => {
    const b = $<HTMLButtonElement>("[data-now]", el);
    b.disabled = true;
    try {
      if (recorder?.active) await toggleRecording();
      await pendingUpdate!.install((p) => (b.textContent = `${p}%`));
    } catch (e) {
      toast(`Falha ao atualizar: ${e}`, true);
      b.disabled = false;
      b.textContent = "Tentar de novo";
    }
  });
  hud.appendChild(el);
}

// ------------------------------------------------------------ configurações
async function openSettings() {
  const dev = await media.listDevices();
  const ver = await appVersion().catch(() => "web");
  const mp = prefs.media;
  const opt = (list: MediaDeviceInfo[], sel?: string) =>
    `<option value="">Padrão do sistema</option>` + list.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => `<option value="${esc(d.deviceId)}" ${d.deviceId === sel ? "selected" : ""}>${esc(d.label || `Dispositivo ${i + 1}`)}</option>`).join("");
  const sw = (name: string, label: string, on: boolean, note = "") =>
    `<label class="toggle-row"><span>${label}${note ? `<br><span class="t-s c3">${note}</span>` : ""}</span><span class="switch"><input type="checkbox" name="${name}" ${on ? "checked" : ""}><span></span></span></label>`;
  const env: EnvConfig = world.layout?.env ?? {};
  const tabs = ["Áudio e vídeo", "Sons", "Privacidade", "Aparência", ...(isAdmin ? ["Escritório"] : []), "Sobre"];
  const bg = modal(
    "Configurações",
    `<div class="tabs">${tabs.map((t, i) => `<button type="button" data-tab="${i}" class="${i ? "" : "on"}">${t}</button>`).join("")}</div>
    <form id="settings" class="settings">
      <section data-sec="0">
        <label class="field"><span class="label">Microfone</span><select class="input" name="micId">${opt(dev.mics, mp.micId)}</select></label>
        <label class="field"><span class="label">Câmera</span><select class="input" name="camId">${opt(dev.cams, mp.camId)}</select></label>
        <label class="field"><span class="label">Saída de som</span><select class="input" name="speakerId">${opt(dev.speakers, mp.speakerId)}</select></label>
        <div class="row2"><label class="field"><span class="label">Qualidade da câmera</span><select class="input" name="camQuality"><option value="360" ${mp.camQuality === "360" ? "selected" : ""}>Leve (360p)</option><option value="720" ${mp.camQuality === "720" ? "selected" : ""}>HD (720p)</option></select></label>
        <label class="field"><span class="label">Alcance da voz</span><select class="input" name="range">${Object.keys(RANGES).map((k) => `<option value="${k}" ${k === mp.range ? "selected" : ""}>${{ curto: "Curto", medio: "Médio", longo: "Longo" }[k as keyof typeof RANGES]}</option>`).join("")}</select></label></div>
        ${sw("noiseSuppression", "Redução de ruído", mp.noiseSuppression)}
        ${sw("micOnJoin", "Microfone ligado ao entrar", mp.micOnJoin)}
        ${sw("mirror", "Espelhar minha câmera", mp.mirror)}
      </section>
      <section data-sec="1" hidden>
        <label class="slider-row"><span>Volume geral</span><input type="range" name="master" min="0" max="1" step="0.05" value="${soundPrefs.master}"></label>
        <label class="slider-row"><span>Volume do soundpad</span><input type="range" name="soundpad" min="0" max="1" step="0.05" value="${soundPrefs.soundpad}"></label>
        ${sw("steps", "Som de passos e corrida", soundPrefs.steps)}
        ${sw("approach", "Som quando alguém se aproxima", soundPrefs.approach)}
        ${sw("notify", "Sons de mensagem, aceno e chamado", soundPrefs.notify)}
      </section>
      <section data-sec="2" hidden>
        ${sw("shareActivity", "Mostrar o app que estou usando", prefs.shareActivity, "A gestão sempre vê o app em uso, para acompanhamento da equipe.")}
        ${sw("shareAgendaTitles", "Mostrar os títulos da minha agenda", prefs.shareAgendaTitles, "Desligado, os outros só veem “Ocupado” nos horários.")}
        ${sw("shareMeeting", "Mostrar “Em reunião” no meu status", prefs.shareMeeting)}
        ${sw("shareMusic", "Mostrar a música que estou ouvindo", prefs.shareMusic)}
      </section>
      <section data-sec="3" hidden>
        ${sw("weatherFx", "Efeitos de clima (chuva, neve, folhas)", prefs.weatherFx, "Desligue em computadores mais fracos.")}
        ${sw("eventSkin", "Usar a skin das datas especiais", prefs.look.eventSkin !== false, "Gorro no Natal, chapéu de bruxa no Halloween...")}
      </section>
      ${
        isAdmin
          ? `<section data-sec="4" hidden>
        <div class="note">Vale para todo o escritório.</div>
        <div class="row2"><label class="field"><span class="label">Clima</span><select class="input" name="env_weather"><option value="auto">Automático (clima real)</option>${WEATHERS.map(([k, l]) => `<option value="${k}" ${env.weather === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="field"><span class="label">Estação</span><select class="input" name="env_season"><option value="auto">Pela data</option>${SEASONS.map(([k, l]) => `<option value="${k}" ${env.season === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
        <label class="field"><span class="label">Data especial</span><select class="input" name="env_holiday"><option value="auto">Automática pelo calendário</option><option value="nenhum" ${env.holiday === "nenhum" ? "selected" : ""}>Nenhuma</option>${Object.values(HOLIDAYS).map((h) => `<option value="${h.id}" ${env.holiday === h.id ? "selected" : ""}>${esc(h.name)}</option>`).join("")}</select></label>
        <div class="row2"><label class="field"><span class="label">Cidade do clima</span><input class="input" name="env_city" value="${esc(env.city ?? "Campo Grande")}"></label>
        <label class="field"><span class="label">Lat, Lon</span><input class="input" name="env_ll" value="${env.lat ?? -20.4697}, ${env.lon ?? -54.6201}"></label></div>
        ${sw("env_daynight", "Dia e noite pelo horário real", !!env.daynight)}
      </section>`
          : ""
      }
      <section data-sec="${tabs.length - 1}" hidden>
        <div class="pc-row"><span class="label">Versão</span><span>${esc(String(ver))}</span></div>
        ${isNative ? `<button type="button" class="btn secondary sm" data-check>Procurar atualização</button>` : ""}
        <label class="field"><span class="label">Chave de gestão</span><input class="input" name="adminKey" type="password" value="${esc(prefs.adminKey)}" placeholder="Só para a gestão"></label>
        <div class="note">${isAdmin ? "Você está conectado como gestão." : "Com a chave de gestão você vê a atividade da equipe e configura o escritório. Vale ao entrar de novo."}</div>
      </section>
    </form>`,
    [
      ["Cancelar", "ghost", () => {}],
      ["Salvar", "primary", () => saveSettings(bg)],
    ],
    true,
  );
  bg.querySelectorAll<HTMLElement>("[data-tab]").forEach((t) =>
    t.addEventListener("click", () => {
      bg.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === t));
      bg.querySelectorAll<HTMLElement>("[data-sec]").forEach((s) => (s.hidden = s.dataset.sec !== t.dataset.tab));
    }),
  );
  bg.querySelector("[data-check]")?.addEventListener("click", async () => {
    try {
      const u = await checkUpdate();
      if (!u) return toast("Você já está na versão mais recente");
      pendingUpdate = u;
      showUpdateBanner();
    } catch (e) {
      toast(`Não consegui verificar: ${e}`, true);
    }
  });
}

function saveSettings(bg: HTMLElement) {
  const f = $<HTMLFormElement>("#settings", bg);
  const v = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "";
  const c = (n: string) => !!(f.elements.namedItem(n) as HTMLInputElement | null)?.checked;
  const mp = prefs.media;
  const devChanged = mp.micId !== (v("micId") || undefined) || mp.camId !== (v("camId") || undefined) || mp.speakerId !== (v("speakerId") || undefined);
  Object.assign(mp, {
    micId: v("micId") || undefined,
    camId: v("camId") || undefined,
    speakerId: v("speakerId") || undefined,
    camQuality: v("camQuality") as "360" | "720",
    range: v("range") as keyof typeof RANGES,
    noiseSuppression: c("noiseSuppression"),
    micOnJoin: c("micOnJoin"),
    mirror: c("mirror"),
  });
  media.prefs = mp;
  if (devChanged) media.applyDevices();
  Object.assign(soundPrefs, { master: Number(v("master")), soundpad: Number(v("soundpad")), steps: c("steps"), approach: c("approach"), notify: c("notify") });
  prefs.sound = { ...soundPrefs };
  const shareChanged = prefs.shareActivity !== c("shareActivity");
  prefs.shareActivity = c("shareActivity");
  prefs.shareAgendaTitles = c("shareAgendaTitles");
  prefs.shareMeeting = c("shareMeeting");
  prefs.shareMusic = c("shareMusic");
  prefs.weatherFx = c("weatherFx");
  if (prefs.look.eventSkin !== c("eventSkin")) {
    prefs.look = { ...prefs.look, eventSkin: c("eventSkin") };
    world.me.setLook(prefs.look);
    net.send({ t: "look", look: prefs.look });
  }
  const newAdmin = v("adminKey").trim();
  const adminChanged = newAdmin !== prefs.adminKey;
  prefs.adminKey = newAdmin;
  savePrefs();
  if (shareChanged) lastActivity = "";
  if (isAdmin && f.elements.namedItem("env_weather")) {
    const [lat, lon] = v("env_ll").split(",").map((x) => Number(x.trim()));
    const envCfg: EnvConfig = {
      weather: v("env_weather") as EnvConfig["weather"],
      season: v("env_season") as EnvConfig["season"],
      holiday: v("env_holiday"),
      daynight: c("env_daynight"),
      city: v("env_city").trim() || undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
      lon: Number.isFinite(lon) ? lon : undefined,
    };
    if (JSON.stringify(envCfg) !== JSON.stringify(world.layout.env ?? {})) {
      const layout: Layout = { ...JSON.parse(JSON.stringify(world.layout)), env: envCfg };
      net.send({ t: "layout_save", layout });
    }
  }
  applyEnv();
  pushStatus();
  toast(adminChanged ? "Salvo. A chave de gestão vale na próxima entrada." : "Configurações salvas");
  if (adminChanged) {
    net.close();
    setTimeout(() => start(), 300);
  }
}
void refreshWidgets;

// ------------------------------------------------------------ início
if (prefs.name && prefs.key && new URLSearchParams(location.search).has("auto")) start();
else showLogin();
