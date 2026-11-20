import "./style.css";
import { World, PeerInfo } from "./world";
import { Net } from "./net";
import { Media } from "./media";
import { Editor } from "./editor";
import { CharacterPreview, openCreator } from "./creator";
import { Look, lookColor, normalizeLook, randomLook } from "./avatar";
import { icon } from "./icons";
import { logoEl } from "./logo";
import { AgendaItem, DEFAULT_SHORTCUTS, integrations, isNative, NowPlaying, openTarget, Shortcut } from "./integrations";
import type { Layout, Zone } from "./furniture";
import { loadModels } from "./models";

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
    server: p.server ?? (import.meta.env.VITE_OFFICE_SERVER || "ws://localhost:8080/ws"),
    key: p.key ?? "",
    look: normalizeLook(p.look ?? randomLook()),
    shareMusic: p.shareMusic ?? true,
    shareMeeting: p.shareMeeting ?? true,
    manualStatus: p.manualStatus ?? "",
    shortcuts: p.shortcuts ?? DEFAULT_SHORTCUTS,
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
let actx: AudioContext | null = null;
function blip(kind: "msg" | "wave" | "join" = "msg") {
  try {
    actx ??= new AudioContext();
    const notes = kind === "wave" ? [660, 880, 990] : kind === "join" ? [523, 784] : [880, 1175];
    notes.forEach((f, i) => {
      const o = actx!.createOscillator();
      const g = actx!.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = actx!.currentTime + i * 0.08;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(actx!.destination);
      o.start(t);
      o.stop(t + 0.13);
    });
  } catch {
    /* sem áudio */
  }
}

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
let rightPanel: "chat" | "apps" | null = null;
let leftOpen = true;
let agenda: AgendaItem[] = [];
let mailUnread: number | null = null;
let nowPlaying: NowPlaying | null = null;
let integ = { google: false, spotify: false, google_configured: false, spotify_configured: false };
let addingShortcut = false;
let started = false;

function start() {
  if (!started) {
    started = true;
    world = new World($("#stage"));
    media = new Media(world);
    media.onError = (m) => toast(m, true);
    media.onStateChanged = renderDock;
    media.onScreensChanged = renderScreens;
    editor = new Editor(world, hud, (layout) => net.send({ t: "layout_save", layout }), toast);
    editor.onClose = () => {
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
  }

  net = new Net(prefs.server, () => ({ t: "join", key: prefs.key, name: prefs.name, color: lookColor(prefs.look), look: prefs.look }));
  net.on("error", (m) => {
    net.close();
    showLogin(m.msg);
  });
  net.on("welcome", async (m) => {
    await modelsReady;
    myId = m.id;
    for (const id of [...world.others.keys()]) world.removePeer(id);
    world.setLayout(m.layout as Layout);
    // nasce perto da entrada, com um pequeno desvio para não ficar em cima de ninguém
    const sp = m.layout.spawn ?? { x: 0, z: 8 };
    const me: PeerInfo = { ...m.me, x: sp.x + (Math.random() * 4 - 2), z: sp.z + (Math.random() * 2 - 1), look: prefs.look };
    world.spawnMe(me);
    for (const p of m.peers) world.addPeer(p);
    chatLog.length = 0;
    chatLog.push(...m.history);
    lastStatus = null;
    renderChat();
    renderPeople();
    pushStatus();
    media.connect(m.livekit.url, m.livekit.token);
    setConn(true);
  });
  net.on("close", () => setConn(false));
  net.on("peer_join", (m) => {
    if (m.peer.id === myId) return;
    world.addPeer(m.peer);
    blip("join");
    renderPeople();
  });
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
    if (!editor.active) world.setLayout(m.layout);
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
    <span class="chip" title="${connected ? "Conectado" : "Reconectando..."}"><span class="dot ${connected ? "ok" : "bad"}"></span>${online} online</span>`;
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
    const a = row && world.others.get(row.dataset.id!);
    if (a) world.walkTo(a.root.position.x + 0.8, a.root.position.z + 0.8);
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
    `<span class="divider"></span>`,
    b("people", "users", "Pessoas", leftOpen && !editor?.active ? "active" : ""),
    b("chat", "chat", "Chat (Enter)", rightPanel === "chat" ? "active" : "", unread ? `<span class="badge">${unread > 9 ? "9+" : unread}</span>` : ""),
    b("apps", "calendar", "Agenda e apps", rightPanel === "apps" ? "active" : "", mailUnread ? `<span class="badge">${mailUnread > 99 ? "99+" : mailUnread}</span>` : ""),
    `<span class="divider"></span>`,
    b("char", "shirt", "Personagem"),
    b("edit", "pencil", "Editar escritório", editor?.active ? "active" : ""),
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
      renderLeft();
      break;
    case "exit":
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

  el.innerHTML = `
    <div class="panel-head"><div class="t-m">Agenda e apps</div><button class="x-btn" data-close>${icon("x", 18)}</button></div>
    <div class="scroll" style="display:flex;flex-direction:column;gap:16px">
      <div class="section">
        <div class="section-head"><span class="label">Hoje</span>${integ.google && mailUnread != null ? `<button class="mail-link" data-open="https://mail.google.com">${icon("mail", 14)} ${mailUnread} não lidos</button>` : ""}</div>
        ${agendaHtml}
      </div>
      ${native ? `<div class="section"><span class="label">Música</span>${musicHtml}</div>` : ""}
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
  el.querySelector("#creds")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    run(
      () => integrations.setCreds({ google_client_id: String(f.get("gid")).trim(), google_client_secret: String(f.get("gsec")).trim(), spotify_client_id: String(f.get("sid")).trim() }),
      "Chaves salvas",
    );
  });
}

// ------------------------------------------------------------ início
if (prefs.name && prefs.key && new URLSearchParams(location.search).has("auto")) start();
else showLogin();
