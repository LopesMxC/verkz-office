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
    /* nada */
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
    /* nada */
  }
};

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const hud = $("#hud");
const overlay = $("#overlay");

// ------------------------------------------------------------ som 8-bit
let actx: AudioContext | null = null;
function blip(kind: "msg" | "wave" | "join" = "msg") {
  try {
    actx ??= new AudioContext();
    const notes = kind === "wave" ? [660, 880, 990] : kind === "join" ? [523, 784] : [880, 1175];
    notes.forEach((f, i) => {
      const o = actx!.createOscillator();
      const g = actx!.createGain();
      o.type = "square";
      o.frequency.value = f;
      g.gain.value = 0.035;
      o.connect(g).connect(actx!.destination);
      const t = actx!.currentTime + i * 0.07;
      o.start(t);
      o.stop(t + 0.06);
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
  t.className = "px-box toast" + (err ? " err" : "");
  t.textContent = msg;
  toasts.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

// ------------------------------------------------------------ tela de entrada
function showLogin(error = "") {
  overlay.innerHTML = `
    <div class="screen-center">
      <form class="px-box login">
        <div class="head">${logoEl(40)}<h1>Office</h1></div>
        <div class="preview-row">
          <canvas class="mini"></canvas>
          <button type="button" class="px-btn" data-edit>${icon("user", 18)} Personagem</button>
        </div>
        <label class="field"><span>Seu nome</span><input class="px-input" name="name" maxlength="32" required value="${esc(prefs.name)}"></label>
        <label class="field"><span>Chave do escritório</span><input class="px-input" name="key" type="password" required value="${esc(prefs.key)}"></label>
        <details ${prefs.server.includes("localhost") ? "open" : ""}><summary>Servidor</summary>
          <label class="field" style="margin-top:8px"><span>Endereço</span><input class="px-input" name="server" value="${esc(prefs.server)}"></label>
        </details>
        <div class="err">${esc(error)}</div>
        <button class="px-btn primary" style="width:100%;justify-content:center;margin-top:6px">Entrar</button>
      </form>
    </div>`;
  const mini = $<HTMLCanvasElement>("canvas.mini", overlay);
  let pv = new CharacterPreview(mini, prefs.look, 3);
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
  void pv;
}

// ------------------------------------------------------------ app
let world: World;
let net: Net;
let media: Media;
let editor: Editor;
let myId = "";
let chatTab: "geral" | "sala" = "geral";
let unread = 0;
const chatLog: any[] = [];
let rightPanel: "chat" | "apps" | null = null;
let leftOpen = true;
let agenda: AgendaItem[] = [];
let mailUnread: number | null = null;
let nowPlaying: NowPlaying | null = null;
let integ = { google: false, spotify: false, google_configured: false, spotify_configured: false };
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
  net.on("welcome", (m) => {
    myId = m.id;
    for (const id of [...world.others.keys()]) world.removePeer(id);
    world.setLayout(m.layout as Layout);
    // nasce perto da entrada, com um pequeno desvio para não ficar em cima de ninguém
    const me: PeerInfo = { ...m.me, x: (m.layout.spawn?.x ?? 0) + (Math.random() * 4 - 2), z: (m.layout.spawn?.z ?? 8) + (Math.random() * 2 - 1), look: prefs.look };
    world.spawnMe(me);
    for (const p of m.peers) world.addPeer(p);
    chatLog.length = 0;
    chatLog.push(...m.history);
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
  const d = $(".topbar .dot");
  if (d) d.className = "dot" + (ok ? " ok" : "");
}

function onZoneChange(z: Zone | null) {
  const pill = $(".topbar .zone-pill");
  pill.className = "pill zone-pill" + (z ? " zone" : "") + (z?.private ? " private" : "");
  pill.textContent = z ? z.name : "Área aberta";
  if (!z && chatTab === "sala") chatTab = "geral";
  renderChat();
}

// ------------------------------------------------------------ HUD
function buildHud() {
  const top = document.createElement("div");
  top.className = "px-box topbar";
  top.innerHTML = `${logoEl(22)}<span class="t">Office</span><span class="dot"></span><span class="pill zone-pill">Área aberta</span><span class="pill online">0 online</span>`;
  hud.appendChild(top);

  const left = document.createElement("div");
  left.className = "px-box side left";
  left.innerHTML = `
    <div class="hd"><h3>Pessoas</h3></div>
    <div style="padding:10px 12px 0"><input class="px-input" id="my-status" placeholder="Seu status (ex.: focado)" maxlength="60" value="${esc(prefs.manualStatus)}"></div>
    <div class="bd" id="people"></div>`;
  hud.appendChild(left);
  $<HTMLInputElement>("#my-status").addEventListener("change", (e) => {
    prefs.manualStatus = (e.target as HTMLInputElement).value.trim();
    savePrefs();
    pushStatus();
  });

  const right = document.createElement("div");
  right.className = "px-box side right hidden";
  right.id = "right";
  hud.appendChild(right);

  const screens = document.createElement("div");
  screens.className = "screens";
  screens.id = "screens";
  hud.appendChild(screens);

  const dock = document.createElement("div");
  dock.className = "px-box dock";
  dock.id = "dock";
  hud.appendChild(dock);
  renderDock();
}

function renderDock() {
  const dock = $("#dock");
  if (!dock) return;
  const b = (id: string, ic: string, tip: string, cls = "", extra = "") =>
    `<button class="px-btn tip ${cls}" data-id="${id}" data-tip="${tip}">${ic}${extra}</button>`;
  dock.innerHTML = [
    b("mic", icon(media.micOn ? "mic" : "mic-off", 20), media.micOn ? "Desligar microfone (M)" : "Ligar microfone (M)", media.micOn ? "on" : "off"),
    b("cam", icon(media.camOn ? "video" : "video-off", 20), media.camOn ? "Desligar câmera" : "Ligar câmera", media.camOn ? "on" : ""),
    b("screen", icon("screen", 22), media.screenOn ? "Parar de compartilhar" : "Compartilhar tela", media.screenOn ? "on" : ""),
    `<span class="sep"></span>`,
    b("people", icon("people", 22), "Pessoas", leftOpen ? "on" : ""),
    b("chat", icon("chat", 22), "Chat (Enter)", rightPanel === "chat" ? "on" : "", unread ? `<span class="badge">${unread > 9 ? "9+" : unread}</span>` : ""),
    b("apps", icon("calendar", 22), "Agenda, música e atalhos", rightPanel === "apps" ? "on" : "", mailUnread ? `<span class="badge">${mailUnread > 99 ? "99+" : mailUnread}</span>` : ""),
    `<span class="sep"></span>`,
    b("char", icon("user", 22), "Personagem"),
    b("edit", icon("edit", 22), "Editar escritório", editor?.active ? "on" : ""),
    b("exit", icon("exit", 22), "Sair"),
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
      leftOpen = !leftOpen;
      $(".side.left").classList.toggle("hidden", !leftOpen || editor.active);
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
      $(".side.left").classList.toggle("hidden", !leftOpen || editor.active);
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
  const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
  if (typing || !started || overlay.innerHTML) return;
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
  if (p === "chat") {
    unread = 0;
    renderChat();
  }
  if (p === "apps") {
    renderApps();
    refreshIntegrations();
  }
}

// ------------------------------------------------------------ pessoas
function renderPeople() {
  const list = $("#people");
  if (!list || !world?.me) return;
  $(".topbar .online").textContent = `${world.others.size + 1} online`;
  const zones = world.layout?.zones ?? [];
  const zname = (id: string | null) => zones.find((z) => z.id === id)?.name ?? "Área aberta";
  const rows = [...world.others.values()]
    .sort((a, b) => (media.levels.get(b.info.id) ?? 0) - (media.levels.get(a.info.id) ?? 0) || a.info.name.localeCompare(b.info.name))
    .map((a) => {
      const lvl = media.levels.get(a.info.id) ?? 0;
      return `<div class="person" data-id="${a.info.id}">
        <span class="sq" style="background:${lookColor(a.look)}"></span>
        <div class="meta"><div class="nm">${esc(a.info.name)}</div><div class="st">${esc(a.info.status || zname(a.info.zone))}</div></div>
        <span class="lvl" title="Volume"><i style="height:${Math.round(lvl * 100)}%"></i></span>
        <button class="px-btn wave" data-wave="${a.info.id}" title="Acenar">${icon("wave", 14)}</button>
      </div>`;
    });
  list.innerHTML =
    `<div class="person" style="cursor:default"><span class="sq" style="background:${lookColor(prefs.look)}"></span><div class="meta"><div class="nm" style="color:var(--neon)">${esc(prefs.name)} (você)</div><div class="st">${esc(world.me.info.status || zname(world.currentZone?.id ?? null))}</div></div></div>` +
    (rows.length ? `<div class="section-t">No escritório</div>` + rows.join("") : `<p class="note">Ninguém mais por aqui agora.</p>`) +
    `<p class="note" style="margin-top:14px">Clique em alguém para ir até a pessoa.</p>`;
  list.querySelectorAll<HTMLElement>(".person[data-id]").forEach((el) =>
    el.addEventListener("click", (e) => {
      const w = (e.target as HTMLElement).closest("[data-wave]") as HTMLElement | null;
      if (w) {
        net.send({ t: "wave", to: w.dataset.wave });
        toast("Aceno enviado");
        e.stopPropagation();
        return;
      }
      const a = world.others.get(el.dataset.id!);
      if (a) world.walkTo(a.root.position.x + 1, a.root.position.z + 1);
    }),
  );
}

// ------------------------------------------------------------ chat
function renderChat() {
  if (rightPanel !== "chat") return;
  const el = $("#right");
  const zone = world.currentZone;
  const msgs = chatLog.filter((m) => (chatTab === "geral" ? !m.zone : m.zone === zone?.id));
  const hm = (ts: number) => new Date(ts * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const keep = $<HTMLInputElement>("#chat-text")?.value ?? "";
  const hadFocus = document.activeElement?.id === "chat-text";
  el.innerHTML = `
    <div class="hd"><h3>Chat</h3><button class="px-btn ghost" data-close>${icon("close", 14)}</button></div>
    <div class="tabs">
      <button class="px-btn ${chatTab === "geral" ? "sel" : ""}" data-tab="geral">Geral</button>
      <button class="px-btn ${chatTab === "sala" ? "sel" : ""}" data-tab="sala" ${zone ? "" : "disabled"}>${zone ? esc(zone.name) : "Sala"}</button>
    </div>
    <div class="chat-list">${msgs.length ? msgs.map((m) => `<div class="msg"><span class="who">${esc(m.name)}</span><span class="when">${hm(m.ts)}</span><div class="tx">${esc(m.text)}</div></div>`).join("") : `<div class="chat-empty">${chatTab === "geral" ? "Nenhuma mensagem ainda." : "Mensagens daqui só aparecem para quem está nesta sala."}</div>`}</div>
    <form class="chat-in"><input id="chat-text" class="px-input" placeholder="Mensagem" autocomplete="off" maxlength="2000"><button class="px-btn primary">Enviar</button></form>`;
  const list = $(".chat-list", el);
  list.scrollTop = list.scrollHeight;
  const input = $<HTMLInputElement>("#chat-text");
  input.value = keep;
  if (hadFocus) input.focus();
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") input.blur();
    e.stopPropagation();
  });
  $("[data-close]", el).addEventListener("click", () => {
    openRight(null);
    renderDock();
  });
  el.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      chatTab = b.dataset.tab as any;
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
    b.className = "px-box screen-thumb";
    b.appendChild(s.el);
    s.el.play().catch(() => {});
    const cap = document.createElement("span");
    cap.className = "cap";
    cap.textContent = s.name;
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
  full.innerHTML = `<div class="bar"><span>${esc(s.name)}</span><button class="px-btn">${icon("close", 14)} Fechar</button></div>`;
  full.appendChild(s.el);
  document.body.appendChild(full);
  const close = () => {
    full.remove();
    renderScreens();
  };
  $("button", full).addEventListener("click", close);
  const stop = setInterval(() => {
    if (!media.screens.has(key)) {
      clearInterval(stop);
      close();
    }
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
    } catch (e: any) {
      console.warn(e);
    }
  }
  if (integ.spotify) {
    try {
      nowPlaying = await integrations.spotifyNow();
    } catch (e: any) {
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
        /* nada */
      }
    }
  }, 15_000);
}

function ongoingMeeting(): AgendaItem | undefined {
  const now = Date.now();
  return agenda.find((e) => !e.allDay && new Date(e.start).getTime() <= now && new Date(e.end).getTime() > now);
}

let lastStatus = "";
function pushStatus() {
  let s = prefs.manualStatus;
  const meet = ongoingMeeting();
  if (prefs.shareMeeting && meet) s = `Em reunião até ${new Date(meet.end).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  else if (prefs.shareMusic && nowPlaying?.playing && !s) s = `Ouvindo: ${nowPlaying.title} - ${nowPlaying.artist}`;
  if (s === lastStatus || !net) return;
  lastStatus = s;
  net.send({ t: "status", text: s });
  world.me?.setStatus(s);
}

function renderApps() {
  const el = $("#right");
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const now = Date.now();
  const native = isNative;
  const googleBlock = !native
    ? `<p class="note">Agenda, Gmail e Spotify funcionam no app instalado.</p>`
    : !integ.google
      ? `<button class="px-btn" data-g="connect">${icon("calendar", 16)} Conectar Google</button><p class="note">Mostra a agenda do dia, entra no Meet com um clique e conta os e-mails não lidos.</p>`
      : `<div class="row" style="justify-content:space-between;margin-bottom:8px">
           <button class="px-btn" data-open="https://mail.google.com">Gmail${mailUnread != null ? ` · ${mailUnread} não lidos` : ""}</button>
           <button class="px-btn ghost" data-g="disconnect" style="font-size:12px">Desconectar</button>
         </div>
         ${agenda.length ? agenda
           .map((e) => {
             const on = !e.allDay && new Date(e.start).getTime() <= now && new Date(e.end).getTime() > now;
             return `<div class="event ${on ? "now" : ""}">
               <div class="tm">${e.allDay ? "Dia todo" : `${fmt(e.start)} - ${fmt(e.end)}`}${on ? " · agora" : ""}</div>
               <div class="ti">${esc(e.title)}</div>
               <div class="row">${e.meet ? `<button class="px-btn primary" data-open="${esc(e.meet)}" style="padding:6px 9px">Entrar no Meet</button>` : ""}
               <button class="px-btn ghost" data-open="${esc(e.link)}" style="padding:6px 9px">Abrir</button></div>
             </div>`;
           })
           .join("") : `<p class="note">Nada na agenda nas próximas 24 h.</p>`}`;

  const spotifyBlock = !native
    ? ""
    : !integ.spotify
      ? `<button class="px-btn" data-s="connect">${icon("music", 16)} Conectar Spotify</button>`
      : `${nowPlaying
          ? `<div class="np">${nowPlaying.cover ? `<img src="${esc(nowPlaying.cover)}">` : ""}<div><div class="ti">${esc(nowPlaying.title)}</div><div class="ar">${esc(nowPlaying.artist)}</div></div></div>`
          : `<p class="note">Nada tocando agora.</p>`}
         <div class="row" style="margin-top:8px">
           <button class="px-btn" data-sc="previous">${icon("left", 14)}</button>
           <button class="px-btn" data-sc="${nowPlaying?.playing ? "pause" : "play"}">${icon(nowPlaying?.playing ? "pause" : "play", 14)}</button>
           <button class="px-btn" data-sc="next">${icon("right", 14)}</button>
           <span style="flex:1"></span>
           <button class="px-btn ghost" data-s="disconnect" style="font-size:12px">Desconectar</button>
         </div>`;

  el.innerHTML = `
    <div class="hd"><h3>Agenda e apps</h3><button class="px-btn ghost" data-close>${icon("close", 14)}</button></div>
    <div class="bd">
      <div class="section-t">Google Agenda</div>${googleBlock}
      ${native ? `<div class="section-t">Música</div>${spotifyBlock}` : ""}
      ${native ? `
      <label class="check"><input type="checkbox" data-pref="shareMeeting" ${prefs.shareMeeting ? "checked" : ""}> Mostrar "Em reunião" quando houver evento</label>
      <label class="check"><input type="checkbox" data-pref="shareMusic" ${prefs.shareMusic ? "checked" : ""}> Mostrar a música que estou ouvindo</label>` : ""}
      <div class="section-t">Atalhos</div>
      ${prefs.shortcuts
        .map((s, i) => `<div class="shortcut"><button class="px-btn" data-open="${esc(s.target)}">${icon("apps", 14)} ${esc(s.name)}</button><button class="px-btn ghost" data-rm="${i}">${icon("close", 12)}</button></div>`)
        .join("")}
      <form class="row" id="add-sc" style="margin-top:6px">
        <input class="px-input" name="n" placeholder="Nome" style="flex:1;min-width:80px">
        <input class="px-input" name="t" placeholder="Link ou caminho do programa" style="flex:2;min-width:120px">
        <button class="px-btn">Adicionar</button>
      </form>
      ${native ? `<details style="margin-top:16px"><summary class="note">Chaves das integrações</summary>
        <p class="note">Só precisa preencher se o app não veio com elas. Redirect: http://127.0.0.1:43821/callback</p>
        <form id="creds">
          <label class="field"><span>Google Client ID</span><input class="px-input" name="gid"></label>
          <label class="field"><span>Google Client Secret</span><input class="px-input" name="gsec" type="password"></label>
          <label class="field"><span>Spotify Client ID</span><input class="px-input" name="sid"></label>
          <button class="px-btn">Salvar chaves</button>
        </form></details>` : ""}
    </div>`;

  $("[data-close]", el).addEventListener("click", () => {
    openRight(null);
    renderDock();
  });
  el.querySelectorAll<HTMLElement>("[data-open]").forEach((b) => b.addEventListener("click", () => openTarget(b.dataset.open!).catch((e) => toast(String(e), true))));
  el.querySelectorAll<HTMLElement>("[data-rm]").forEach((b) =>
    b.addEventListener("click", () => {
      prefs.shortcuts.splice(Number(b.dataset.rm), 1);
      savePrefs();
      renderApps();
    }),
  );
  $("#add-sc", el).addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    const n = String(f.get("n")).trim();
    const t = String(f.get("t")).trim();
    if (!n || !t) return;
    prefs.shortcuts.push({ name: n, target: t });
    savePrefs();
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
    } catch (e: any) {
      toast(String(e), true);
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
  el.querySelector('[data-s="disconnect"]')?.addEventListener("click", () => run(() => integrations.disconnect("spotify")));
  el.querySelectorAll<HTMLElement>("[data-sc]").forEach((b) => b.addEventListener("click", () => run(() => integrations.spotifyControl(b.dataset.sc as any))));
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
