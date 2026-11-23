import "./style.css";
import { World, PeerInfo, EMOTES, HOLD_ITEMS, SEATS, GraphicStyle, ViewMode, GfxOptions } from "./world";
import { Net } from "./net";
import { Media, MediaPrefs, RANGES } from "./media";
import { Editor } from "./editor";
import { CharacterPreview, openCreator } from "./creator";
import { Look, lookColor, normalizeLook, randomLook } from "./avatar";
import { icon } from "./icons";
import { sealEl } from "./logo";
import { AgendaItem, DEFAULT_SHORTCUTS, integrations, isNative, isHostedWeb, NowPlaying, openTarget, Shortcut, activeApp, ytm, YtmState, appVersion, checkUpdate, UpdateInfo } from "./integrations";
import type { Item, Layout, Zone } from "./furniture";
import { DEFS, PHOTO_TYPES, imageToDataUrl, findItemAnyLevel, levelIds, levelName, levelView } from "./furniture";
import { soundPrefs, SoundPrefs, notify, approachChime, doorChime, toggleSound, doorSound, preloadDoorSounds, elevatorDing, elevatorMusic, footstep, kitchenSound, PAD_SOUNDS, listCustom, addCustom, removeCustom, playPad, PadSound } from "./sound";
import { GameSession, GameKind, PoolPose, PoolTable, POOL_W, POOL_H, PM } from "./games";
import { CAM_BG_PRESETS, presetImage, fileToBg, camBgSupported, type CamBg } from "./cambg";
import { RadioPlayer, RadioSource, RadioState, parseRadioLink } from "./radio";
import { EnvConfig, WEATHERS, SEASONS, HOLIDAYS, seasonByDate, weatherFromCode, resolveHoliday, Weather, Season } from "./env";
import { DEFAULT_GOAL, DEFAULT_CUSTOM, GoalCfg, CustomCfg, financeData, weatherData, customValue, weatherText, fmtBRL, fmtNum, refreshWidgets } from "./widgets";
import { loadModels, modelProgress } from "./models";
import { Recorder } from "./recorder";
import { isPhone, isTouch, canShareScreen, Joystick, unlockAudioOnTouch, registerPWA, keepScreenOn } from "./mobile";
import { audio } from "./sound";

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
  /** Mostrar o nome das salas no mapa. */
  zoneTags: boolean;
  media: MediaPrefs;
  sound: SoundPrefs;
  role: string;
  /** Procura atualização sozinho ao longo do dia (app instalado). */
  autoUpdate: boolean;
  /** Qualidade gráfica do mundo 3D. */
  quality: "leve" | "equilibrada" | "bonita";
  /** Estilo visual do mundo. */
  style: GraphicStyle;
  /** Visão: isométrica 3D, aérea 3D ou 2D. */
  view: ViewMode;
  /** Opções gráficas finas: sombras, contorno, limite de quadros, resolução. */
  gfx: GfxOptions;
  /** Modo de call: escritório (mundo 3D) ou reunião (blocos em mosaico, como no Meet). */
  callMode: CallMode;
  /** Volume individual por pessoa (pelo nome; 0 a 200%). */
  volumes: Record<string, number>;
  /** Fundo da minha câmera. */
  camBg: CamBg;
}
type CallMode = "escritorio" | "reuniao";

/** Cargos da equipe: cada um tem a sua sala no mapa (zona com `role`). */
const ROLES = ["SDR", "Closer", "Editor", "Gestor", "Head", "CEO"];
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
    server: isHostedWeb ? `wss://${location.host}/ws` : p.server ?? (import.meta.env.VITE_OFFICE_SERVER || "wss://office.verkzsystem.tech/ws"),
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
    zoneTags: p.zoneTags ?? true,
    media: { noiseSuppression: true, micOnJoin: true, mirror: true, camQuality: "360", range: "medio", spatial: true, ...(p.media ?? {}) },
    sound: { ...soundPrefs, ...(p.sound ?? {}) },
    role: p.role ?? "",
    autoUpdate: p.autoUpdate ?? true,
    quality: p.quality === "leve" || p.quality === "bonita" ? p.quality : "equilibrada",
    style: (["padrao", "realista", "desenho", "retro"] as const).includes(p.style as any) ? (p.style as GraphicStyle) : "padrao",
    view: p.view === "aerea" || p.view === "2d" ? p.view : "iso",
    gfx: { shadows: true, outline: true, fps: 0, scale: 0, ...(p.gfx ?? {}) },
    callMode: p.callMode === "reuniao" ? "reuniao" : "escritorio",
    volumes: p.volumes && typeof p.volumes === "object" ? p.volumes : {},
    camBg: p.camBg?.kind === "blur" || p.camBg?.kind === "image" ? p.camBg : { kind: "none" },
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
        <div class="brand">${sealEl(48)}<div><div class="t-l">Office</div><div class="t-s c2">Escritório virtual da VERKZ</div></div></div>
        <div class="char-row">
          <canvas></canvas>
          <div class="grow"><div class="t-m">Seu personagem</div><div class="t-s c2">Roupa, cabelo e acessórios</div></div>
          <button type="button" class="btn secondary" data-edit>Editar</button>
        </div>
        <label class="field"><span class="label">Seu nome</span><input class="input" name="name" maxlength="32" required value="${esc(prefs.name)}" autocomplete="name"></label>
        <label class="field"><span class="label">Seu cargo</span><select class="input" name="role" required>
          <option value="" disabled ${prefs.role ? "" : "selected"}>Escolha o seu cargo</option>
          ${ROLES.map((r) => `<option ${prefs.role === r ? "selected" : ""}>${r}</option>`).join("")}</select></label>
        <label class="field"><span class="label">Chave do escritório</span><input class="input" name="key" type="password" required autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" value="${esc(prefs.key)}"></label>
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
    // sem espaço sobrando (copiar e colar) — o celular também não põe maiúscula sozinho no campo
    prefs.key = String(f.get("key") ?? "").trim();
    prefs.role = String(f.get("role") ?? "");
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
let radio: RadioPlayer | null = null;
let editor: Editor;
let myId = "";
let connected = false;
let chatTab: "geral" | "sala" = "geral";
let unread = 0;
const chatLog: any[] = [];
let rightPanel: "chat" | "apps" | "meetings" | "team" | null = null;
let recorder: Recorder;
let recStarting = false;
let leftOpen = !isPhone();
let joystick: Joystick | null = null;
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
    world.gfx = { ...prefs.gfx };
    world.setQuality(prefs.quality);
    world.setStyle(prefs.style);
    if (import.meta.env.DEV) (window as any).__verkz = { world, prefs, get media() { return media; }, get editor() { return editor; } };
    showEnterCover();
    world.onReady = () => hideEnterCover();
    media = new Media(world);
    media.prefs = prefs.media;
    media.userVolume = personVolume;
    media.camBg = prefs.camBg;
    media.onApproach = () => {
      if (soundPrefs.approach) approachChime();
    };
    media.onLocalState = (patch) => sendState(patch);
    world.onSit = (on) => sendState({ sit: on || null });
    media.onToggle = (_w, on) => toggleSound(on);
    // som real de porta, mais baixo conforme a distância
    const doorVol = (dist: number) => Math.max(0, 1 - dist / 9);
    // portas que o Seu Zé abre: bem mais baixinho (e ele não bate a porta)
    world.onDoorOpen = (dist, npc) => doorSound("open", doorVol(dist) * (npc ? 0.15 : 1));
    world.onDoorClose = (dist, npc) => {
      if (!npc) doorSound("close", doorVol(dist));
    };
    preloadDoorSounds();
    startRadio();
    world.onOverviewChange = () => renderDock();
    world.setView(prefs.view);
    document.body.classList.toggle("hide-zone-tags", !prefs.zoneTags);
    mountViewSwitch();
    if (prefs.callMode === "reuniao") openMeeting();
    world.onEnterMyRoom = () => doorChime();
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
    // clique no mapa: pergunta antes de ir (vários cliques só trocam o destino da mesma pergunta)
    world.onWalkRequest = (plan, x, y) =>
      menu(x + 16, y + 16, plan.seat ? "Sentar nesta cadeira?" : "Ir até lá?", [
        ["map", plan.seat ? "Sim, sentar" : "Sim, ir até lá", () => world.walkPlan(plan)],
        ["x", "Cancelar", () => {}],
      ]);
    editor = new Editor(world, hud, (layout) => net.send({ t: "layout_save", layout }), toast);
    editor.onClose = () => {
      world.editing = false;
      renderLeft();
      renderDock();
    };
    buildHud();
    if (isTouch) {
      joystick = new Joystick(hud, world);
      document.body.classList.add("touch");
    }
    // celular: o áudio da chamada só toca depois de um toque na tela
    unlockAudioOnTouch(async () => {
      try {
        await audio().ctx.resume();
      } catch {
        /* sem WebAudio */
      }
      if (!media.room) return false;
      await media.room.startAudio().catch(() => {});
      return media.room.canPlaybackAudio;
    });
    if (isTouch) keepScreenOn();
    window.addEventListener("resize", () => renderDock());
    // economia: sem foco a cena roda a 20 quadros; com uma tela compartilhada em tela cheia, a 12
    const fpsCap = () => (world.backgroundFps = document.body.classList.contains("meet-mode") ? 2 : document.body.classList.contains("screen-mode") ? 12 : document.hasFocus() ? 0 : 20);
    window.addEventListener("focus", fpsCap);
    window.addEventListener("blur", fpsCap);
    new MutationObserver(fpsCap).observe(document.body, { attributes: true, attributeFilter: ["class"] });
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

  net = new Net(prefs.server, () => ({ t: "join", key: prefs.key.trim(), name: prefs.name, color: lookColor(prefs.look), look: prefs.look, admin_key: prefs.adminKey.trim() }));
  net.on("error", (m) => {
    net.close();
    showLogin(m.msg);
  });
  net.on("notice", (m) => {
    toast(m.msg, true);
    if (m.layout) world.setLayout(m.layout as Layout);
  });
  net.on("welcome", async (m) => {
    // não deixa a entrada travada se algum modelo 3D demorar (ele aparece em caixa simples)
    await Promise.race([modelsReady, new Promise((r) => setTimeout(r, 15_000))]);
    myId = m.id;
    isAdmin = !!m.admin;
    // Spotify: o ID do app vem do servidor (a gestão configura uma vez); cada pessoa só clica em "Conectar"
    const spId = String(m.integrations?.spotify_client_id ?? "").trim();
    if (isNative && spId && !integ.spotify_configured)
      integrations
        .setCreds({ google_client_id: "", google_client_secret: "", spotify_client_id: spId })
        .then(refreshIntegrations)
        .catch(() => {});
    // reconexão (internet oscilou, servidor reiniciou): guarda onde eu estava para não "teleportar"
    const prev = world.me ? { x: world.me.root.position.x, z: world.me.root.position.z, dir: world.me.targetDir, sitting: world.me.sitting, level: world.level } : null;
    for (const id of [...world.others.keys()]) world.removePeer(id);
    world.setLayout(m.layout as Layout);
    // nasce perto da entrada, com um pequeno desvio para não ficar em cima de ninguém
    const sp = m.layout.spawn ?? { x: 0, z: 8 };
    const me: PeerInfo = { ...m.me, x: sp.x + (Math.random() * 4 - 2), z: sp.z + (Math.random() * 2 - 1), look: prefs.look };
    world.spawnMe(me);
    // nasce sentado numa cadeira livre da sala do seu cargo
    for (const p of m.peers) world.addPeer(p);
    if (prev) world.restoreMe(prev);
    else goToRoleRoom(true);
    sendState({ role: prefs.role || null, level: world.level || null });
    world.refreshLevelVisibility();
    applyEnv();
    lastActivity = "";
    // voltou a conexão: o que ainda não acabou continua na mão; o que acabou some
    if (world.me.holding && holdEnd > Date.now()) sendState({ hold: world.me.holding, holdEnd, holdDur: (HOLD_MINUTES[world.me.holding] ?? 3) * 60_000 });
    else if (world.me.holding) setHolding(null);
    for (const p of m.peers) {
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
    if (m.patch && "level" in m.patch) world.refreshLevelVisibility();
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
  el.innerHTML = `${sealEl(30)}<span class="t-m">Office</span><span class="divider"></span>
    <span class="chip accent">${z?.private ? icon("lock", 13) : '<span class="dot"></span>'}${esc(z ? z.name : "Área aberta")}</span>
    ${world?.fullLayout?.levels?.length ? `<span class="chip">${esc(levelName(world.level))}</span>` : ""}
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
  if (isPhone()) {
    // celular: só o essencial no dock; o resto fica no "Mais"
    const anyOpen = popover === "more" || (leftOpen && !editor?.active) || ["meetings", "apps", "team"].includes(rightPanel ?? "");
    document.body.classList.toggle("sheet-open", !!popover || (leftOpen && !editor?.active) || !!rightPanel || !!editor?.active);
    setDock(dock, [
      b("mic", media?.micOn ? "mic" : "mic-off", media?.micOn ? "Desligar microfone" : "Ligar microfone", media?.micOn ? "" : "off"),
      b("cam", media?.camOn ? "video" : "video-off", media?.camOn ? "Desligar câmera" : "Ligar câmera", media?.camOn ? "active" : "off"),
      b("emote", "smile", "Emotes", popover === "emote" ? "active" : ""),
      b("chat", "chat", "Chat", rightPanel === "chat" ? "active" : "", unread ? `<span class="badge">${unread > 9 ? "9+" : unread}</span>` : ""),
      b("map", "map", "Mapa", world?.overview ? "active" : ""),
      b("more", "menu", "Mais", anyOpen ? "active" : ""),
    ].join(""));
    return;
  }
  const caret = (id: string, tip: string) =>
    `<button class="icon-btn caret ${popover === id ? "active" : ""}" data-id="${id}" data-tip="${tip}" aria-label="${tip}">${icon("chevron-up", 14, 2.4)}</button>`;
  setDock(dock, [
    `<span class="split">${b("mic", media?.micOn ? "mic" : "mic-off", media?.micOn ? "Desligar microfone (M)" : "Ligar microfone (M)", media?.micOn ? "" : "off")}${caret("dev-mic", "Microfone e som")}</span>`,
    `<span class="split">${b("cam", media?.camOn ? "video" : "video-off", media?.camOn ? "Desligar câmera" : "Ligar câmera", media?.camOn ? "active" : "off")}${caret("dev-cam", "Câmera e fundo")}</span>`,
    canShareScreen ? b("screen", "screen", media?.screenOn ? "Parar de compartilhar" : "Compartilhar tela", media?.screenOn ? "active" : "") : "",
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
    prefs.role ? b("home", "home", `Ir para a minha sala (${prefs.role})`) : "",
    b("map", "map", "Ver o escritório todo (Tab)", world?.overview ? "active" : ""),
    b("edit", "pencil", "Editar escritório", editor?.active ? "active" : ""),
    isAdmin ? b("team", "activity", "Atividade da equipe", rightPanel === "team" ? "active" : "") : "",
    b("settings", "settings", "Configurações"),
    `<span class="divider"></span>`,
    b("exit", "log-out", "Sair"),
  ].join(""));
}

/**
 * Só troca o dock quando algo mudou, com um clique só para todos os botões. Antes ele era refeito a
 * cada mudança do áudio/vídeo (várias por segundo enquanto o LiveKit reconecta) e o clique se perdia.
 */
function setDock(dock: HTMLElement, html: string) {
  if (!dock.dataset.bound) {
    dock.dataset.bound = "1";
    dock.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-id]");
      if (el && dock.contains(el)) dockAction(el.dataset.id!);
    });
  }
  if (dock.dataset.html === html) return;
  dock.dataset.html = html;
  dock.innerHTML = html;
}

async function dockAction(id: string) {
  // celular: painéis viram folhas de baixo; abrir um fecha o "Mais" e o outro lado
  if (isPhone() && id !== "more" && popover === "more") togglePopover("more");
  if (isPhone() && id === "people" && rightPanel) openRight(null);
  if (isPhone() && ["chat", "meetings", "apps", "team"].includes(id) && leftOpen) {
    leftOpen = false;
    renderLeft();
  }
  switch (id) {
    case "more":
      togglePopover("more");
      return;
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
    case "map":
      world.setOverview(!world.overview);
      break;
    case "home":
      if (world.level && !roleSeat()) {
        toast("A sala do seu cargo fica no térreo. Desça pelo elevador.");
        break;
      }
      goToRoleRoom(false);
      break;
    case "edit":
      if (!editor.active) {
        // todo mundo personaliza os móveis; prédio, salas e paredes só a gestão
        editor.limit = !isAdmin;
      }
      editor.toggle();
      world.editing = editor.active;
      renderLeft();
      break;
    case "emote":
    case "pad":
    case "dev-mic":
    case "dev-cam":
      togglePopover(id);
      break;
    case "team":
      openRight(rightPanel === "team" ? null : "team");
      break;
    case "settings":
      openSettings();
      break;
    case "exit":
      closeMeeting();
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
  if (e.key === "Tab") {
    e.preventDefault();
    dockAction("map");
  }
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
let peopleSig = "";
function renderPeople() {
  const list = $("#people");
  if (!list || !world?.me) return;
  renderTop();
  // painel fechado: não refaz a lista à toa (roda a cada segundo)
  if (!leftOpen || editor?.active) return;
  // salas de todos os andares (a pessoa pode estar em outro andar)
  const full = world.fullLayout;
  const zones = full ? [...full.zones, ...(full.levels ?? []).flatMap((L) => L.zones)] : world.layout?.zones ?? [];
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
      <div class="meta"><div class="nm">${esc(a.info.name)}</div><div class="st">${esc(a.speaking && l ? "Falando" : a.info.status || zname(a.info.zone) + (full?.levels?.length && (Number(a.extra?.level) || 0) !== world.level ? ` · ${levelName(Number(a.extra?.level) || 0)}` : ""))}</div></div>
      ${l ? `<span class="bars" data-l="${l}" title="Você ouve esta pessoa"><i></i><i></i><i></i></span>` : ""}
      <button class="wave" data-wave="${a.info.id}" title="Acenar">${icon("hand", 18)}</button>
    </div>`;
  };
  const all = [...world.others.values()].sort((a, b) => a.info.name.localeCompare(b.info.name));
  const near = all.filter((a) => level(a.info.id) > 0);
  const rest = all.filter((a) => level(a.info.id) === 0);
  const html = !all.length
    ? `<div class="empty">Ninguém mais por aqui agora.</div>`
    : (near.length ? `<div class="label">Perto de você</div>${near.map(row).join("")}` : "") +
      (rest.length ? `<div class="label">No escritório</div>${rest.map(row).join("")}` : "");
  // só mexe no DOM quando algo mudou (não perde o hover nem pisca)
  if (html === peopleSig) return;
  peopleSig = html;
  list.innerHTML = html;
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
  // com uma tela aberta em tela cheia, o vídeo está lá (não tira de lá)
  if (document.body.classList.contains("screen-mode")) return;
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
  document.querySelector(".screen-full")?.remove();
  const full = document.createElement("div");
  full.className = "screen-full";
  full.innerHTML = `<div class="bar"><span class="t-m"></span><span class="chip" data-count></span><button class="btn secondary sm" data-close>${icon("x", 15)} Fechar</button></div>
    <div class="screen-body"><div class="screen-main"></div><div class="screen-people"></div></div>`;
  $(".t-m", full).textContent = s.local ? "Sua tela" : `Tela de ${s.name}`;
  $(".screen-main", full).appendChild(s.el);
  s.el.play().catch(() => {});
  // dentro do HUD e antes do dock: o dock (microfone, câmera, chat...) continua por cima
  hud.insertBefore(full, $("#dock"));
  document.body.classList.add("screen-mode");
  const people = $(".screen-people", full);
  const count = $("[data-count]", full);
  const tiles = new Map<string, HTMLElement>();
  /** Bloco de uma pessoa: câmera (se ligada) ou iniciais; borda verde enquanto fala. */
  const tile = (id: string, name: string, color: string, ini: string) => {
    let el = tiles.get(id);
    if (!el) {
      el = document.createElement("div");
      el.className = "sp-tile";
      el.dataset.id = id;
      el.innerHTML = `<div class="av"></div><div class="nm"><i class="off hidden">${icon("mic-off", 13, 2.4)}</i><span></span></div><div class="far hidden">longe</div>`;
      $(".av", el).textContent = ini;
      $(".av", el).setAttribute("style", `background:${color}`);
      $(".nm span", el).textContent = name;
      tiles.set(id, el);
    }
    return el;
  };
  const camOf = (bubble: HTMLElement) => (bubble.classList.contains("hidden") ? null : (bubble.querySelector("video") as HTMLVideoElement | null));
  const update = () => {
    if (!world?.me) return;
    const list: { id: string; name: string; ini: string; color: string; talking: boolean; muted: boolean; cam: HTMLVideoElement | null; far: boolean; mirror: boolean }[] = [];
    const me = world.me;
    list.push({ id: "me", name: `${prefs.name} (você)`, ini: initials(prefs.name), color: lookColor(prefs.look), talking: media.micOn && media.isTalking(media.room.localParticipant.identity), muted: !media.micOn, cam: camOf(me.bubble), far: false, mirror: prefs.media.mirror });
    for (const [id, a] of world.others) {
      const g = media.levels.get(id) ?? 0;
      // borda verde para quem fala (menos quem está numa sala privada em que eu não estou)
      list.push({ id, name: a.info.name, ini: initials(a.info.name), color: lookColor(a.look), talking: media.isTalking(id) && media.canHear(id), muted: a.label.classList.contains("muted"), cam: camOf(a.bubble), far: g === 0, mirror: false });
    }
    // quem eu ouço primeiro; depois por nome (ordem estável, sem pular de lugar a cada fala)
    const mine = list.shift()!;
    list.sort((a, b) => Number(a.far) - Number(b.far) || a.name.localeCompare(b.name));
    list.unshift(mine);
    count.innerHTML = `<span class="dot ok"></span>${list.length} no escritório`;
    const keep = new Set<string>();
    list.forEach((p, i) => {
      keep.add(p.id);
      const el = tile(p.id, p.name, p.color, p.ini);
      el.classList.toggle("talking", p.talking);
      $(".off", el).classList.toggle("hidden", !p.muted);
      $(".far", el).classList.toggle("hidden", !p.far);
      const v = el.querySelector("video");
      const src = p.cam?.srcObject ?? null;
      if (src && (!v || v.srcObject !== src)) {
        v?.remove();
        const nv = document.createElement("video");
        nv.muted = true;
        nv.playsInline = true;
        nv.autoplay = true;
        nv.srcObject = src;
        if (p.mirror) nv.classList.add("mirror");
        el.prepend(nv);
        nv.play().catch(() => {});
      } else if (!src && v) v.remove();
      if (people.children[i] !== el) people.insertBefore(el, people.children[i] ?? null);
    });
    for (const [id, el] of tiles)
      if (!keep.has(id)) {
        el.remove();
        tiles.delete(id);
      }
  };
  update();
  const close = () => {
    clearInterval(watch);
    full.remove();
    document.body.classList.remove("screen-mode");
    renderScreens();
  };
  $("[data-close]", full).addEventListener("click", close);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && document.body.contains(full)) {
      close();
      window.removeEventListener("keydown", onKey);
    }
  };
  window.addEventListener("keydown", onKey);
  const watch = setInterval(() => {
    if (!media.screens.has(key)) return close();
    update();
  }, 200);
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
         </div><div style="display:flex;gap:8px"><button class="btn ghost sm" data-y="open">Mostrar janela do YouTube Music</button><button class="btn ghost sm" data-y="close" title="Fecha o YouTube Music e libera memória">Fechar</button></div>`;

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
      ${native && isAdmin ? `<details class="keys"><summary>Chaves das integrações</summary>
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
    if (!integ.spotify_configured) return toast("O Spotify ainda não foi ativado no servidor do escritório. Peça para a gestão ativar.", true);
    toast("Abrindo o navegador para você entrar na sua conta do Spotify...");
    run(integrations.spotifyConnect, "Spotify conectado");
  });
  el.querySelectorAll<HTMLElement>("[data-sc]").forEach((b) => b.addEventListener("click", () => run(() => integrations.spotifyControl(b.dataset.sc as "play" | "pause" | "next" | "previous"))));
  el.querySelectorAll<HTMLElement>('[data-y="open"]').forEach((b) => b.addEventListener("click", () => ytm.open(true).catch((err) => toast(String(err), true))));
  el.querySelector('[data-y="close"]')?.addEventListener("click", () => ytm.close().catch((err) => toast(String(err), true)));
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

function menu(x: number, y: number, title: string, items: [string, string, () => void][], top?: (el: HTMLElement) => void) {
  const el = document.createElement("div");
  el.className = "panel ctx-menu";
  el.innerHTML = `<div class="ctx-title">${esc(title)}</div><div data-top></div>` + items.map(([ic, label], i) => `<button data-i="${i}">${icon(ic, 16)}<span>${esc(label)}</span></button>`).join("");
  el.querySelectorAll<HTMLElement>("[data-i]").forEach((b) =>
    b.addEventListener("click", () => {
      el.remove();
      items[Number(b.dataset.i)][2]();
    }),
  );
  if (top) top($("[data-top]", el));
  floatAt(el, x, y);
}

/** Volume que eu escolhi para uma pessoa (1 = normal). Guardado pelo nome (o id muda a cada entrada). */
function personVolume(id: string) {
  const a = world?.others.get(id);
  const v = a ? prefs.volumes[a.info.name] : undefined;
  return typeof v === "number" ? v : 1;
}

/** Controle de volume dentro do menu da pessoa (botão direito). */
function volumeControl(id: string, box: HTMLElement) {
  const a = world.others.get(id);
  if (!a) return;
  const pct = Math.round(personVolume(id) * 100);
  box.className = "ctx-vol";
  box.innerHTML = `<div class="ctx-vol-head">${icon(pct === 0 ? "mic-off" : "volume", 16)}<span>Volume</span><b>${pct}%</b></div>
    <input type="range" min="0" max="200" step="5" value="${pct}" aria-label="Volume de ${esc(a.info.name)}">`;
  const r = $<HTMLInputElement>("input", box);
  const lbl = $("b", box);
  r.addEventListener("input", () => {
    const v = Number(r.value);
    lbl.textContent = `${v}%`;
    if (v === 100) delete prefs.volumes[a.info.name];
    else prefs.volumes[a.info.name] = v / 100;
    savePrefs();
  });
  // o menu fecha ao clicar fora; arrastar o controle não pode fechar
  box.addEventListener("pointerdown", (e) => e.stopPropagation());
  box.addEventListener("click", (e) => e.stopPropagation());
}

// ------------------------------------------------------------ pessoas: menu e cartão
function goTo(id: string) {
  const a = world.others.get(id);
  if (!a) return;
  if (!world.sameLevel(a)) {
    toast(`${a.info.name} está no ${levelName(Number(a.extra?.level) || 0)}. Vá pelo elevador.`);
    return;
  }
  world.walkTo(a.root.position.x + 0.8, a.root.position.z + 0.8);
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
  menu(x, y, a.info.name, items, (box) => volumeControl(id, box));
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
  const full = world.fullLayout;
  const zones = full ? [...full.zones, ...(full.levels ?? []).flatMap((L) => L.zones)] : world.layout?.zones ?? [];
  const lvA = Number(a.extra?.level) || 0;
  const zn = (zones.find((z) => z.id === a.info.zone)?.name ?? "Área aberta") + (full?.levels?.length ? ` · ${levelName(lvA)}` : "");
  const hold = a.extra.hold && HOLD_ITEMS[a.extra.hold];
  const el = document.createElement("div");
  el.className = "panel person-card";
  el.innerHTML = `
    <div class="pc-head"><span class="avatar" style="background:${lookColor(a.look)}">${esc(initials(a.info.name))}</span>
      <div class="meta"><div class="t-m">${esc(a.info.name)}${id === myId ? " (você)" : ""}</div><div class="t-s c2">${esc(a.info.status || zn)}</div></div></div>
    ${a.extra.role ? `<div class="pc-row"><span class="label">Cargo</span><span>${esc(a.extra.role)}</span></div>` : ""}
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
  } else if (msg.kind === "game_inv") {
    onGameInvite(from, name, msg);
  } else if (msg.kind === "game_reply") {
    const p = pendingGames.get(msg.gid);
    pendingGames.delete(msg.gid);
    if (!p) return;
    if (!msg.ok) toast(`${name} não pode jogar agora`);
    else openGame(p.kind, "host", from, name, msg.gid, p.item);
  } else if (msg.kind === "game") {
    games.get(msg.gid)?.onMsg(msg.m);
  } else if (msg.kind === "radio_stop") {
    const mine = world.me?.extra?.radio as RadioState | undefined;
    // só vale se quem pediu está perto da caixa de som (ninguém desliga do outro lado do escritório)
    const it = world.layout?.items.find((i) => i.id === msg.item);
    const who = world.others.get(from);
    const close = !!(it && who && Math.hypot(who.target.x - it.x, who.target.z - it.z) < RADIO_REACH + 1);
    if (mine && mine.item === msg.item && close) {
      sendState({ radio: null });
      toast(`${name} desligou o rádio`);
    }
  } else if (msg.kind === "radio_vol") {
    // alguém perto da caixa mudou o volume para todos (o estado do rádio fica com quem ligou)
    const mine = world.me?.extra?.radio as RadioState | undefined;
    const it = world.layout?.items.find((i) => i.id === msg.item);
    const who = world.others.get(from);
    const close = !!(it && who && Math.hypot(who.target.x - it.x, who.target.z - it.z) < RADIO_REACH + 1);
    const v = Number(msg.vol);
    if (mine && mine.item === msg.item && close && v >= 0 && v <= 1) sendState({ radio: { ...mine, vol: v } });
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
let popover: "emote" | "pad" | "more" | "dev-mic" | "dev-cam" | null = null;
function togglePopover(id: string) {
  document.querySelector(".popover")?.remove();
  popover = popover === id ? null : (id as typeof popover);
  renderDock();
  if (!popover) return;
  const el = document.createElement("div");
  el.className = "panel popover";
  hud.appendChild(el);
  if (popover === "more") {
    renderMore(el);
    return;
  }
  if (popover === "dev-mic" || popover === "dev-cam") {
    el.classList.add("dev-pop", popover);
    renderDevPop(el, popover);
    return;
  }
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
  // se o banco local demorar (aba antiga segurando o IndexedDB), abre com os sons prontos mesmo
  const custom = await Promise.race([listCustom(), new Promise<PadSound[]>((r) => setTimeout(() => r([]), 1500))]);
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
  if (radio) radio.master = soundPrefs.radio;
    savePrefs();
  });
}

// ------------------------------------------------------------ cozinha e itens interativos
let holdStatus = "";
let holdTimer = 0;
/** Quanto tempo cada coisa dura na mão até acabar (minutos). */
const HOLD_MINUTES: Record<string, number> = { cafe: 3, agua: 2, refri: 3, lanche: 4, marmita: 12 };
let holdEnd = 0;
function setHolding(kind: string | null, minutes?: number) {
  clearTimeout(holdTimer);
  holdStatus = kind ? HOLD_ITEMS[kind]?.status ?? "" : "";
  const dur = (minutes ?? HOLD_MINUTES[kind ?? ""] ?? 3) * 60_000;
  holdEnd = kind ? Date.now() + dur : 0;
  sendState(kind ? { hold: kind, holdEnd, holdDur: dur } : { hold: null, holdEnd: null, holdDur: null });
  lastStatus = null;
  pushStatus();
  if (kind) holdTimer = window.setTimeout(checkHoldEnd, dur + 200);
}
/** Acabou o que estava na mão? (também roda de tempos em tempos: o timer atrasa com a janela em segundo plano) */
function checkHoldEnd() {
  const kind = world?.me?.holding;
  if (!kind || !holdEnd || Date.now() < holdEnd) return;
  const it = HOLD_ITEMS[kind];
  setHolding(null);
  if (it) toast(`${it.emoji} ${kind === "lanche" || kind === "marmita" ? `${it.label} acabou` : `Acabou ${kind === "agua" ? "a água" : kind === "cafe" ? "o café" : "o refrigerante"}`}`);
}
setInterval(checkHoldEnd, 5000);

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
      // parou de andar (desistiu, foi para outro lado pelo teclado): cancela, senão a ação disparava depois sozinha
    } else if (Date.now() - t0 > 12_000 || (!world.walking && Date.now() - t0 > 800)) clearInterval(iv);
  }, 200);
}

/** Itens que a pessoa usa (rádio, café, jogos, painéis...): só funcionam no mesmo cômodo. */
// o painel financeiro fica de fora: é o único que abre de qualquer lugar
const ROOM_ITEMS = new Set([
  "cleiton", "coffee", "water", "fridge", "microwave", "elevator", "pool_table", "ping_pong", "speaker", "radio",
  "p_radio_small", "p_boombox", "p_speaker_tower", "p_speaker_portable", "p_speaker_stage",
  "photo_wall", "photo_big", "photo_easel", "photo_desk", "weather_panel", "goal_panel", "api_panel", "p_vending",
]);
/** Distância máxima para usar um item quando os dois estão na área aberta (sem sala). */
const OPEN_REACH = 6;

/** Estou no mesmo cômodo do item? (mesma sala; na área aberta, até OPEN_REACH metros) */
function sameRoomAs(it: Item) {
  const iz = world.zoneAt(it.x, it.z);
  const mz = world.zoneAt(world.me.root.position.x, world.me.root.position.z);
  if (iz || mz) return iz?.id === mz?.id;
  const p = world.me.root.position;
  return Math.hypot(p.x - it.x, p.z - it.z) <= OPEN_REACH;
}

function onItemClick(it: Item, x: number, y: number): boolean {
  if (!ROOM_ITEMS.has(it.type) || sameRoomAs(it)) return useItem(it, x, y);
  // de outro cômodo: só dá para ir até lá (chegando, o menu abre)
  const z = world.zoneAt(it.x, it.z);
  const label = DEFS[it.type]?.label ?? "Item";
  menu(x, y, `${label} · ${z ? `fica em ${z.name}` : "longe de você"}`, [
    [
      "map",
      z ? `Ir até ${z.name}` : "Ir até lá",
      () =>
        goToItem(it, () => {
          const r = world.host.getBoundingClientRect();
          useItem(it, r.left + r.width / 2, r.top + r.height / 2 - 40);
        }),
    ],
  ]);
  return true;
}

/** Anda até o item e espera chegar no cômodo dele. */
function goToItem(it: Item, then: () => void) {
  world.walkTo(it.x + 1.1, it.z + 1.1);
  const t0 = Date.now();
  const iv = setInterval(() => {
    const p = world.me.root.position;
    if (sameRoomAs(it) && Math.hypot(p.x - it.x, p.z - it.z) < 2.6) {
      clearInterval(iv);
      then();
    } else if (Date.now() - t0 > 20_000 || (!world.walking && Date.now() - t0 > 1000)) {
      clearInterval(iv);
      if (sameRoomAs(it)) then();
      else toast("Não deu para chegar até lá", true);
    }
  }, 200);
}

function useItem(it: Item, x: number, y: number): boolean {
  const take = (kind: string, sound: "pour" | "open" = "pour") => () =>
    nearItem(it, () => {
      kitchenSound(sound);
      setHolding(kind);
      toast(`${HOLD_ITEMS[kind].emoji} ${HOLD_ITEMS[kind].label} na mão`);
    });
  switch (it.type) {
    case "cleiton": {
      const falas = [
        "Cleiton anotou sua reclamação. Prazo de resposta: 15 dias úteis.",
        "Cleiton: \"Protocolo nº " + Math.floor(100000 + Math.random() * 899999) + ". Aguarde na linha.\"",
        "Cleiton mexeu as antenas. Isso quer dizer sim. Ou não.",
        "Ouvidoria fechada para o almoço do Cleiton. Volte em 5 minutos.",
        "Cleiton encaminhou sua demanda para o setor responsável (ele mesmo).",
        "Cleiton: \"Sua opinião é muito importante para nós.\"",
      ];
      menu(x, y, "Ouvidoria · Cleiton", [
        ["chat", "Fazer uma reclamação", () => nearItem(it, () => { notify("emote"); toast("🪳 Cleiton: \"Você tem 2 direitos: direito nenhum e nenhum direito.\""); })],
        ["chat", "Pedir um protocolo", () => nearItem(it, () => { notify("emote"); toast("🪳 " + falas[Math.floor(Math.random() * falas.length)]); })],
        ["plus", "Fazer um elogio", () => nearItem(it, () => { notify("emote"); toast("🪳 Cleiton ficou vermelho. Obrigado pelo elogio!"); })],
      ]);
      return true;
    }
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
    case "p_vending":
      menu(x, y, "Máquina de lanches", [
        ["plus", "Comprar um lanche", take("lanche", "open")],
        ["plus", "Comprar um refrigerante", take("refri", "open")],
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
                setHolding("marmita");
                toast("🍱 Marmita pronta. Bom almoço!");
              }, 5000);
            }),
        ],
      ]);
      return true;
    case "elevator":
      openElevatorMenu(it, x, y);
      return true;
    case "pool_table":
    case "ping_pong":
      openGameMenu(it, x, y);
      return true;
    case "speaker":
    case "radio":
    case "p_radio_small":
    case "p_boombox":
    case "p_speaker_tower":
    case "p_speaker_portable":
    case "p_speaker_stage":
      openRadioMenu(it, x, y);
      return true;
    case "photo_wall":
    case "photo_big":
    case "photo_easel":
    case "photo_desk":
      menu(x, y, DEFS[it.type].label, [
        ["image", "Trocar a imagem", () => pickPhoto(it)],
        ...(it.cfg?.img ? ([["eye", "Ver a imagem", () => viewPhoto(it)]] as [string, string, () => void][]) : []),
        ["square", "Moldura preta", () => saveItemCfg(it, { ...(it.cfg ?? {}), frame: "preto" }, "Moldura trocada")],
        ["square", "Moldura branca", () => saveItemCfg(it, { ...(it.cfg ?? {}), frame: "branco" }, "Moldura trocada")],
        ["square", "Moldura de madeira", () => saveItemCfg(it, { ...(it.cfg ?? {}), frame: "madeira" }, "Moldura trocada")],
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
function saveItemCfg(it: Item, cfg: any, okMsg = "Painel atualizado") {
  const layout: Layout = JSON.parse(JSON.stringify(world.fullLayout));
  const found = findItemAnyLevel(layout, it.id);
  if (!found) return;
  found.cfg = cfg;
  if (JSON.stringify(layout).length > 1_900_000) {
    toast("O escritório já tem imagens demais. Troque ou apague algum quadro antes.", true);
    return;
  }
  net.send({ t: "layout_save", layout });
  toast(okMsg);
}

/** Escolhe uma imagem do computador para o quadro (fica salva no escritório, todos veem). */
function pickPhoto(it: Item) {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "image/*";
  inp.onchange = async () => {
    const f = inp.files?.[0];
    if (!f) return;
    try {
      const { img, aspect } = await imageToDataUrl(f, it.type === "photo_desk" ? 320 : 560);
      saveItemCfg(it, { ...(it.cfg ?? {}), img, aspect }, "Imagem do quadro trocada");
    } catch (e) {
      toast(String((e as Error).message ?? e), true);
    }
  };
  inp.click();
}

function viewPhoto(it: Item) {
  const full = document.createElement("div");
  full.className = "modal-bg";
  full.innerHTML = `<img class="photo-full" alt="">`;
  ($("img", full) as HTMLImageElement).src = it.cfg.img;
  full.addEventListener("click", () => full.remove());
  document.body.appendChild(full);
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
  if (!isNative) {
    // navegador: avisa que a pessoa está no celular (a gestão vê na Atividade da equipe)
    if (isTouch)
      setInterval(() => {
        if (!connected || !world?.me) return;
        const key = `celular|${prefs.shareActivity}`;
        if (key === lastActivity) return;
        lastActivity = key;
        activitySince = Math.floor(Date.now() / 1000);
        sendState({ activity: { app: "No celular", title: "", share: prefs.shareActivity, since: activitySince } });
      }, 5000);
    return;
  }
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
/** Procura atualização ao abrir, a cada 30 min e quando o computador volta (foco, internet, acordou). */
let lastUpdateCheck = 0;
let bannerDismissedAt = 0;
function startUpdates() {
  if (!isNative) return;
  const run = async (force = false) => {
    if (!prefs.autoUpdate && !force) return;
    // no máximo uma verificação a cada 10 min (foco e rede disparam muitas vezes)
    if (!force && Date.now() - lastUpdateCheck < 10 * 60_000) return;
    lastUpdateCheck = Date.now();
    try {
      const u = await checkUpdate();
      if (!u) return;
      const newer = !pendingUpdate || u.version !== pendingUpdate.version;
      pendingUpdate = u;
      // versão nova aparece na hora; a mesma que a pessoa adiou volta depois de 2 h
      if (newer || Date.now() - bannerDismissedAt > 2 * 3600_000) {
        document.querySelector(".update-banner")?.remove();
        showUpdateBanner();
      }
    } catch (e) {
      console.warn("update:", e);
    }
  };
  setTimeout(() => run(true), 8000);
  setInterval(() => run(), 30 * 60_000 + 1000);
  window.addEventListener("focus", () => run());
  window.addEventListener("online", () => run());
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && run());
}

function showUpdateBanner() {
  if (!pendingUpdate || document.querySelector(".update-banner")) return;
  const el = document.createElement("div");
  el.className = "panel update-banner";
  el.innerHTML = `${icon("download", 18)}<div class="meta"><div class="t-m">Nova versão ${esc(pendingUpdate.version)}</div><div class="t-s c2">${esc(pendingUpdate.notes ?? "Melhorias e correções")}</div></div>
    <button class="btn ghost sm" data-later>Depois</button><button class="btn primary sm" data-now>Atualizar</button>`;
  $("[data-later]", el).addEventListener("click", () => {
    bannerDismissedAt = Date.now();
    el.remove();
  });
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

// ------------------------------------------------------------ tela de entrada (carregando)
let coverTimer = 0;
function showEnterCover() {
  if (document.querySelector(".enter-cover")) return;
  const el = document.createElement("div");
  el.className = "enter-cover";
  el.innerHTML = `<div class="enter-box"><div class="enter-logo"></div><div class="t-m">Entrando no escritório</div><div class="enter-bar"><span></span></div><div class="t-s c3" data-step>Carregando os móveis...</div></div>`;
  $(".enter-logo", el).innerHTML = sealEl(44);
  document.body.appendChild(el);
  const t0 = Date.now();
  coverTimer = window.setInterval(() => {
    const pct = Math.round((modelProgress.done / Math.max(1, modelProgress.total)) * 85) + (world?.layout ? 10 : 0);
    ($(".enter-bar span", el) as HTMLElement).style.width = `${Math.min(100, pct)}%`;
    $("[data-step]", el).textContent = modelProgress.done < modelProgress.total ? "Carregando os móveis..." : world?.layout ? "Arrumando as salas..." : "Conectando ao servidor...";
    if (Date.now() - t0 > 25_000 && !el.querySelector("[data-retry]")) {
      const b = document.createElement("button");
      b.className = "btn secondary sm";
      b.dataset.retry = "1";
      b.textContent = "Está demorando. Recarregar";
      b.addEventListener("click", () => location.reload());
      $(".enter-box", el).appendChild(b);
    }
  }, 200);
}
function hideEnterCover() {
  clearInterval(coverTimer);
  const el = document.querySelector<HTMLElement>(".enter-cover");
  if (!el) return;
  el.classList.add("out");
  setTimeout(() => el.remove(), 400);
}

// ------------------------------------------------------------ elevador (andares)
let riding = false;

function openElevatorMenu(it: Item, x: number, y: number) {
  const ids = levelIds(world.fullLayout);
  const items: [string, string, () => void][] = ids
    .filter((l) => l !== world.level)
    .map((l) => [l > world.level ? "chevron-up" : "chevron-down", `Ir para o ${levelName(l)}`, () => rideElevator(it, l)]);
  if (!items.length) {
    if (isAdmin) items.push(["plus", "Criar o 2º andar", () => {
      if (!editor.active) dockAction("edit");
      editor.showTab("predio");
    }]);
    else items.push(["x", "Ainda não há outros andares", () => {}]);
  }
  menu(x, y, `Elevador · você está no ${levelName(world.level)}`, items);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rideElevator(it: Item, target: number) {
  if (riding) return;
  nearItem(it, async () => {
    if (riding) return;
    riding = true;
    world.inputEnabled = false;
    world.standUp();
    const music = soundPrefs.notify ? elevatorMusic() : null;
    try {
      elevatorDing();
      world.elevatorForce = 1;
      await wait(700);
      world.elevatorForce = 0; // portas fechando
      await wait(900);
      // dentro do elevador: tela com o visor contando os andares
      const from = world.level;
      const cab = document.createElement("div");
      cab.className = "elevator-ride";
      cab.innerHTML = `<div class="el-box"><div class="el-display"><span class="el-arrow">${target > from ? "▲" : "▼"}</span><span class="el-floor">${levelName(from)}</span></div><div class="t-s c3">Subindo...</div></div>`;
      if (target < from) $(".t-s", cab).textContent = "Descendo...";
      document.body.appendChild(cab);
      requestAnimationFrame(() => cab.classList.add("in"));
      const step = target > from ? 1 : -1;
      for (let l = from; l !== target; l += step) {
        await wait(1100);
        $(".el-floor", cab).textContent = levelName(l + step);
      }
      await wait(500);
      // chega: muda o andar e sai na frente do elevador do andar de destino
      const there = levelView(world.fullLayout, target).items.filter((i) => i.type === "elevator");
      const twin = there.sort((a, b) => Math.hypot(a.x - it.x, a.z - it.z) - Math.hypot(b.x - it.x, b.z - it.z))[0] ?? it;
      const ang = -(twin.rot * Math.PI) / 180;
      world.setLevel(target, twin.x + Math.sin(ang) * 1.3, twin.z + Math.cos(ang) * 1.3);
      world.me.targetDir = ang;
      world.me.body.rotation.y = ang;
      sendState({ level: target || null });
      world.elevatorForce = 0;
      cab.classList.remove("in");
      await wait(350);
      cab.remove();
      elevatorDing();
      world.elevatorForce = 1;
      toast(`Você está no ${levelName(target)}`);
      renderTop();
      await wait(1200);
    } finally {
      world.elevatorForce = null;
      music?.stop();
      world.inputEnabled = true;
      riding = false;
    }
  });
}

// ------------------------------------------------------------ jogos (sinuca e pingue-pongue)
const games = new Map<string, GameSession>();
const pendingGames = new Map<string, { kind: GameKind; to: string; item?: string }>();
const GAME_NAMES: Record<GameKind, string> = { pong: "pingue-pongue", pool: "sinuca" };

function openGameMenu(it: Item, x: number, y: number) {
  const kind: GameKind = it.type === "ping_pong" ? "pong" : "pool";
  const me = world.me.root.position;
  // quem está mais perto aparece primeiro
  const people = [...world.others.entries()]
    .map(([id, a]) => ({ id, name: a.info.name, d: Math.hypot(a.root.position.x - me.x, a.root.position.z - me.z) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
  const items: [string, string, () => void][] = people.map((p) => ["gamepad", `Desafiar ${p.name}`, () => inviteGame(kind, p.id, p.name, it.id)]);
  items.push(["play", kind === "pong" ? "Treinar contra o computador" : "Treinar sozinho", () => (kind === "pool" ? openGame(kind, "solo", "", "", "solo", it.id) : nearItem(it, () => openGame(kind, "solo", "", "")))]);
  menu(x, y, kind === "pong" ? "Pingue-pongue" : "Sinuca", items);
}

function inviteGame(kind: GameKind, to: string, name: string, item?: string) {
  const gid = Math.random().toString(36).slice(2, 10);
  pendingGames.set(gid, { kind, to, item });
  net.send({ t: "to", to, msg: { kind: "game_inv", game: kind, gid, item } });
  toast(`Convite de ${GAME_NAMES[kind]} enviado para ${name}`);
  setTimeout(() => {
    if (pendingGames.delete(gid)) toast(`${name} não respondeu o convite`);
  }, 40_000);
}

function onGameInvite(from: string, name: string, msg: any) {
  const kind: GameKind = msg.game === "pong" ? "pong" : "pool";
  notify("call");
  const bg = modal(
    "Convite para jogar",
    `<div class="call-box"><div class="t-m">${esc(name)} chamou você para ${GAME_NAMES[kind]}</div></div>`,
    [
      ["Agora não", "ghost", () => net.send({ t: "to", to: from, msg: { kind: "game_reply", gid: msg.gid, ok: false } })],
      [
        "Jogar",
        "primary",
        () => {
          net.send({ t: "to", to: from, msg: { kind: "game_reply", gid: msg.gid, ok: true } });
          openGame(kind, "guest", from, name, msg.gid, typeof msg.item === "string" ? msg.item : undefined);
        },
      ],
    ],
  );
  setTimeout(() => bg.remove(), 35_000);
}

function openGame(kind: GameKind, role: "host" | "guest" | "solo", other: string, otherName: string, gid = "solo", itemId?: string) {
  games.get(gid)?.close();
  const table = kind === "pool" && itemId ? findItemAnyLevel(world.fullLayout ?? world.layout, itemId) ?? world.layout.items.find((i) => i.id === itemId) : undefined;
  const poolCtl = table ? startPoolScene(table, role) : null;
  const prevStatus = holdStatus;
  holdStatus = role === "solo" ? `Treinando ${GAME_NAMES[kind]}` : `Jogando ${GAME_NAMES[kind]} com ${otherName}`;
  lastStatus = null;
  pushStatus();
  const s = new GameSession({
    kind,
    role,
    me: prefs.name,
    other: otherName,
    send: (m) => net.send({ t: "to", to: other, msg: { kind: "game", gid, m } }),
    sfx: (k) => {
      if (k === "pocket") kitchenSound("open");
      else if (k === "point" || k === "win") notify(k === "win" ? "wave" : "emote");
      else footstep(false, 0.5);
    },
    onPose: poolCtl ? (p) => poolCtl.pose(p) : undefined,
    onTable: poolCtl && role !== "guest" ? (t) => poolCtl.table(t) : undefined,
    onClose: () => {
      poolCtl?.stop();
      games.delete(gid);
      holdStatus = world.me?.holding ? HOLD_ITEMS[world.me.holding]?.status ?? prevStatus : "";
      lastStatus = null;
      pushStatus();
    },
  });
  games.set(gid, s);
}

/**
 * Sinuca na cena 3D: cada jogador anda até a mesa, se posiciona atrás da branca quando é a vez
 * dele (do lado de onde vai tacar) e espera num canto quando é a vez do outro. A pose (debruçado,
 * taco puxando e batendo) vai para todo mundo em extra.pool; as bolas, em extra.poolTable.
 */
function startPoolScene(it: Item, role: "host" | "guest" | "solo") {
  const th = -(it.rot * Math.PI) / 180;
  const toWorld = (lx: number, lz: number) => ({ x: it.x + lx * Math.cos(th) + lz * Math.sin(th), z: it.z - lx * Math.sin(th) + lz * Math.cos(th) });
  // canvas da sinuca -> metros no espaço da mesa (área de jogo de 2 m por ~1 m)
  const S = 2.0 / (POOL_W - 2 * PM);
  const local = (cx: number, cy: number) => ({ x: (cx - POOL_W / 2) * S, z: (cy - POOL_H / 2) * S });
  const HX = 1.2 + 0.45; // meia mesa + folga para o corpo
  const HZ = 0.7 + 0.45;
  world.standUp();
  // vai para o lado dele da mesa já de cara
  const waitSpot = () => toWorld(role === "guest" ? HX : -HX, role === "guest" ? -0.55 : 0.55);
  let spot = waitSpot();
  world.walkTo(spot.x, spot.z);
  let last: PoolPose | null = null;
  let lastAim = 0;
  let aimChangedAt = 0;
  let placedAim: number | null = null;
  let wasTurn: boolean | null = null;
  let sentKey = "";
  let sentAt = 0;
  const shooterSpot = (p: PoolPose) => {
    const c = local(p.cue[0], p.cue[1]);
    const dx = Math.cos(p.aim);
    const dz = Math.sin(p.aim);
    let t = 0.9;
    let x = c.x - dx * t;
    let z = c.z - dz * t;
    while (Math.abs(x) < HX && Math.abs(z) < HZ && t < 4) {
      t += 0.05;
      x = c.x - dx * t;
      z = c.z - dz * t;
    }
    return toWorld(x, z);
  };
  const iv = setInterval(() => {
    if (!last || !world.me) return;
    const p = last;
    const now = performance.now();
    if (Math.abs(p.aim - lastAim) > 0.002) {
      lastAim = p.aim;
      aimChangedAt = now;
    }
    // reposiciona: no começo da vez, e quando a mira mudou bastante e o mouse parou
    let want: { x: number; z: number } | null = null;
    if (p.myTurn !== wasTurn) {
      wasTurn = p.myTurn;
      want = p.myTurn ? shooterSpot(p) : waitSpot();
      placedAim = p.myTurn ? p.aim : null;
    } else if (p.myTurn && p.pow === 0 && now - aimChangedAt > 450 && placedAim !== null) {
      let d = p.aim - placedAim;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) > 0.6) {
        want = shooterSpot(p);
        placedAim = p.aim;
      }
    }
    if (want && Math.hypot(want.x - spot.x, want.z - spot.z) > 0.3) {
      spot = want;
      world.walkTo(spot.x, spot.z);
    }
    const walking = world.walking;
    if (!walking) {
      const c = local(p.cue[0], p.cue[1]);
      const look = p.myTurn ? toWorld(c.x, c.z) : { x: it.x, z: it.z };
      world.faceTo(look.x, look.z);
    }
    const aim = p.myTurn && !walking;
    const key = `${aim}|${aim ? Math.round(p.pow * 10) : 0}|${p.shotAt}`;
    if (key !== sentKey && now - sentAt > 120) {
      sentKey = key;
      sentAt = now;
      sendState({ pool: { aim, pow: aim ? Math.round(p.pow * 10) / 10 : 0, shotAt: p.shotAt } });
    }
  }, 100);
  return {
    pose(p: PoolPose) {
      last = p;
    },
    table(t: PoolTable) {
      sendState({ poolTable: { item: it.id, ...t } });
    },
    stop() {
      clearInterval(iv);
      sendState({ pool: null, poolTable: null });
    },
  };
}

/** Botão flutuante: escolhe entre a visão isométrica e a aérea (fica salvo). */
function mountViewSwitch() {
  document.querySelector(".view-switch")?.remove();
  const el = document.createElement("div");
  el.className = "view-switch panel";
  el.innerHTML = `<button data-m="escritorio" title="Modo escritório: o mapa (G)">${icon("building", 17)}<span>Escritório</span></button><button data-m="reuniao" title="Modo reunião: blocos em mosaico (G)">${icon("users", 17)}<span>Reunião</span></button><i class="vs-sep"></i><button data-v="iso" title="Visão isométrica 3D (V)">${icon("cube", 17)}<span>Isométrica</span></button><button data-v="aerea" title="Visão aérea 3D (V)">${icon("plan", 17)}<span>Aérea</span></button><button data-v="2d" title="Visão 2D, plana (V)">${icon("square", 17)}<span>2D</span></button>`;
  const sync = () => {
    el.querySelectorAll<HTMLElement>("[data-v]").forEach((b) => b.classList.toggle("on", b.dataset.v === world.view));
    el.querySelectorAll<HTMLElement>("[data-m]").forEach((b) => b.classList.toggle("on", b.dataset.m === prefs.callMode));
    el.classList.toggle("meeting", prefs.callMode === "reuniao");
  };
  el.addEventListener("click", (e) => {
    const m = (e.target as HTMLElement).closest<HTMLElement>("[data-m]");
    if (m) return setCallMode(m.dataset.m as CallMode);
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-v]");
    if (!b) return;
    setView(b.dataset.v as ViewMode);
  });
  world.onViewChange = sync;
  syncViewSwitch = sync;
  sync();
  hud.appendChild(el);
}
let syncViewSwitch = () => {};
function setView(v: ViewMode) {
  world.setView(v);
  prefs.view = v;
  savePrefs();
}
window.addEventListener("keydown", (e) => {
  // V troca a visão (fora de campos de texto)
  if (e.key.toLowerCase() !== "v" || e.ctrlKey || e.metaKey || e.altKey || !world?.me) return;
  const t = e.target as HTMLElement;
  if (t.closest("input, textarea, select, [contenteditable]")) return;
  if (document.body.classList.contains("meet-mode")) return;
  setView(world.view === "iso" ? "aerea" : world.view === "aerea" ? "2d" : "iso");
});
window.addEventListener("keydown", (e) => {
  // G alterna entre o modo escritório e o modo reunião
  if (e.key.toLowerCase() !== "g" || e.ctrlKey || e.metaKey || e.altKey || !world?.me) return;
  const t = e.target as HTMLElement;
  if (t.closest("input, textarea, select, [contenteditable]") || overlay.innerHTML || document.querySelector(".modal-bg")) return;
  if (editor?.active) return; // editando o escritório: G não esconde o mapa
  setCallMode(prefs.callMode === "reuniao" ? "escritorio" : "reuniao");
});
// no modo reunião o mapa fica atrás dos blocos: as setas e WASD não andam com o personagem
window.addEventListener(
  "keydown",
  (e) => {
    if (!document.body.classList.contains("meet-mode")) return;
    const t = e.target as HTMLElement;
    if (t.closest?.("input, textarea, select, [contenteditable]")) return;
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(e.key.toLowerCase())) e.stopImmediatePropagation();
  },
  true,
);

// botão direito numa pessoa da lista ou num bloco do modo reunião: mesmo menu do personagem (com o volume)
document.addEventListener("contextmenu", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>(".person[data-id], .mt-tile[data-pid]");
  const id = t?.dataset.id ?? t?.dataset.pid;
  if (!id || id === "me" || !world?.others.has(id)) return;
  e.preventDefault();
  openAvatarMenu(id, e.clientX, e.clientY, false);
});

// ------------------------------------------------------------ menu de funções (Configurações > Funções)
type Func = { id: string; ic: string; name: string; desc: string; key?: string; run?: () => void };
const FUNCS: { group: string; items: Func[] }[] = [
  {
    group: "Conversa",
    items: [
      { id: "mic", ic: "mic", name: "Microfone", desc: "Liga e desliga o seu microfone.", key: "M", run: () => dockAction("mic") },
      { id: "cam", ic: "video", name: "Câmera", desc: "Liga e desliga a câmera (aparece acima do personagem e nos blocos).", run: () => dockAction("cam") },
      { id: "screen", ic: "screen", name: "Compartilhar tela", desc: "Mostra a sua tela para quem está na conversa.", run: () => dockAction("screen") },
      { id: "meet", ic: "users", name: "Modo reunião", desc: "Troca o mapa por blocos em mosaico com quem está na sua call.", key: "G", run: () => setCallMode(prefs.callMode === "reuniao" ? "escritorio" : "reuniao") },
      { id: "vol", ic: "volume", name: "Volume de cada pessoa", desc: "Botão direito na pessoa (no mapa, na lista ou no bloco) e ajuste de 0 a 200%." },
      { id: "bg", ic: "image", name: "Fundo da câmera", desc: "Desfocar ou trocar o fundo. Fica em Áudio e vídeo.", run: async () => {
          await openSettings();
          document.querySelector("[data-bgs]")?.scrollIntoView({ block: "center" });
        } },
      { id: "rec", ic: "record", name: "Gravar reunião", desc: "Grava o que você ouve e gera resumo, decisões e tarefas.", run: () => dockAction("rec") },
      { id: "meetings", ic: "download", name: "Reuniões gravadas", desc: "Vídeos, resumos e transcrições dos últimos 15 dias.", run: () => dockAction("meetings") },
      { id: "chat", ic: "chat", name: "Chat", desc: "Mensagens para todos ou só para a sala.", key: "Enter", run: () => dockAction("chat") },
    ],
  },
  {
    group: "Escritório",
    items: [
      { id: "walk", ic: "map", name: "Andar e correr", desc: "WASD ou setas; segure Shift para correr. Dois cliques no piso levam o personagem." },
      { id: "map", ic: "map", name: "Mapa inteiro", desc: "Mostra o escritório todo de cima.", key: "Tab", run: () => dockAction("map") },
      { id: "home", ic: "home", name: "Ir para a minha sala", desc: "Leva você até a sala do seu cargo.", run: () => dockAction("home") },
      { id: "view", ic: "cube", name: "Visão", desc: "Isométrica, aérea ou 2D.", key: "V", run: () => setView(world.view === "iso" ? "aerea" : world.view === "aerea" ? "2d" : "iso") },
      { id: "people", ic: "users", name: "Pessoas", desc: "Quem está online, onde está e o seu status.", run: () => dockAction("people") },
      { id: "edit", ic: "pencil", name: "Editar escritório", desc: "Móveis para todos; salas, paredes e prédio só a gestão.", run: () => dockAction("edit") },
      { id: "person", ic: "hand", name: "Chamar, ir até, acenar", desc: "Clique ou botão direito numa pessoa." },
    ],
  },
  {
    group: "Diversão",
    items: [
      { id: "emote", ic: "smile", name: "Emotes", desc: "Acenar, joinha, palmas, dançar... Teclas 1 a 0 usam direto.", key: "E", run: () => togglePopover("emote") },
      { id: "pad", ic: "volume", name: "Soundpad", desc: "Sons para quem está perto. Dá para subir os seus (até 3 MB).", run: () => togglePopover("pad") },
      { id: "radio", ic: "radio", name: "Rádio / caixa de som", desc: "Clique na caixa e cole um link do YouTube, YouTube Music ou Spotify." },
      { id: "games", ic: "gamepad", name: "Sinuca e pingue-pongue", desc: "Clique na mesa para jogar ou convidar alguém." },
      { id: "kitchen", ic: "home", name: "Cozinha", desc: "Café, água, geladeira e micro-ondas: clique para pegar." },
    ],
  },
  {
    group: "Você",
    items: [
      { id: "char", ic: "shirt", name: "Personagem", desc: "Pele, cabelo, roupa, acessórios.", run: () => dockAction("char") },
      { id: "apps", ic: "calendar", name: "Agenda e apps", desc: "Reuniões do dia, e-mails, Spotify e atalhos.", run: () => dockAction("apps") },
    ],
  },
];
function funcsHtml() {
  return FUNCS.map(
    (g) => `<div class="label">${esc(g.group)}</div><div class="fn-list">${g.items
      .map(
        (f) => `<div class="fn-row">${icon(f.ic, 18)}<div class="fn-txt"><b>${esc(f.name)}</b><small>${esc(f.desc)}</small></div>${f.key ? `<kbd>${esc(f.key)}</kbd>` : ""}${
          f.run ? `<button type="button" class="btn secondary sm" data-fn="${f.id}">Usar</button>` : ""
        }</div>`,
      )
      .join("")}</div>`,
  ).join("");
}

// ------------------------------------------------------------ setinha do microfone/câmera no dock
/** Menu rápido ao lado do botão: escolher o aparelho e os ajustes principais sem abrir as Configurações. */
async function renderDevPop(el: HTMLElement, kind: "dev-mic" | "dev-cam") {
  const mp = prefs.media;
  const devs = await media.listDevices();
  if (!document.body.contains(el)) return;
  const list = (title: string, items: MediaDeviceInfo[], cur: string | undefined, key: string, fallback: string) =>
    `<div class="label">${title}</div><div class="dev-list">${
      items.length
        ? items
            .map((d, i) => {
              const on = (cur ?? "default") === d.deviceId || (!cur && i === 0);
              return `<button type="button" class="dev-item ${on ? "on" : ""}" data-k="${key}" data-v="${esc(d.deviceId)}"><span>${esc(d.label || `${fallback} ${i + 1}`)}</span>${on ? icon("check", 15, 2.4) : ""}</button>`;
            })
            .join("")
        : `<div class="note">Nenhum aparelho encontrado.</div>`
    }</div>`;
  const sw = (k: string, label: string, on: boolean) =>
    `<label class="dev-sw"><span>${label}</span><input type="checkbox" data-sw="${k}" ${on ? "checked" : ""}></label>`;
  if (kind === "dev-mic") {
    el.innerHTML = `${list("Microfone", devs.mics, mp.micId, "micId", "Microfone")}${list("Saída de som", devs.speakers, mp.speakerId, "speakerId", "Alto-falante")}
      <div class="dev-sws">${sw("noiseSuppression", "Redução de ruído", mp.noiseSuppression)}${sw("spatial", "Áudio 3D", mp.spatial)}</div>
      <button type="button" class="btn ghost sm" data-more>${icon("settings", 15)} Mais ajustes</button>`;
  } else {
    const bg = prefs.camBg;
    const bgKey = bg.kind === "image" ? (bg.img?.startsWith("preset:") ? bg.img : "custom") : bg.kind;
    const bgs: [string, string, CamBg][] = [
      ["none", "Sem fundo", { kind: "none" }],
      ["blur", "Desfocar", { kind: "blur" }],
      ["preset:verkz", "VERKZ", { kind: "image", img: "preset:verkz" }],
      ["preset:escritorio", "Escritório", { kind: "image", img: "preset:escritorio" }],
    ];
    el.innerHTML = `${list("Câmera", devs.cams, mp.camId, "camId", "Câmera")}
      <div class="label">Qualidade</div><div class="dev-seg">${(["360", "720"] as const).map((q) => `<button type="button" class="${mp.camQuality === q ? "on" : ""}" data-q="${q}">${q === "360" ? "Leve (360p)" : "HD (720p)"}</button>`).join("")}</div>
      <div class="label">Fundo</div><div class="dev-seg">${bgs.map(([k, n]) => `<button type="button" class="${bgKey === k ? "on" : ""}" data-bg="${k}">${n}</button>`).join("")}</div>
      <div class="dev-sws">${sw("mirror", "Espelhar minha câmera", mp.mirror)}</div>
      <button type="button" class="btn ghost sm" data-more>${icon("settings", 15)} Mais fundos e ajustes</button>`;
    el.querySelectorAll<HTMLElement>("[data-q]").forEach((b) =>
      b.addEventListener("click", async () => {
        mp.camQuality = b.dataset.q as "360" | "720";
        savePrefs();
        // aplica religando a câmera (a resolução só muda ao abrir de novo)
        if (media.camOn) {
          await media.setCam(false);
          await media.setCam(true);
        }
        renderDevPop(el, kind);
      }),
    );
    el.querySelectorAll<HTMLElement>("[data-bg]").forEach((b) =>
      b.addEventListener("click", async () => {
        const pick = bgs.find(([k]) => k === b.dataset.bg)![2];
        prefs.camBg = pick;
        savePrefs();
        if (pick.kind !== "none" && !(await camBgSupported())) toast("Este computador não suporta fundo de câmera.", true);
        else await media.setCamBg(pick);
        renderDevPop(el, kind);
      }),
    );
  }
  el.querySelectorAll<HTMLElement>("[data-k]").forEach((b) =>
    b.addEventListener("click", async () => {
      (mp as any)[b.dataset.k!] = b.dataset.v;
      savePrefs();
      await media.applyDevices();
      renderDevPop(el, kind);
    }),
  );
  el.querySelectorAll<HTMLInputElement>("[data-sw]").forEach((c) =>
    c.addEventListener("change", async () => {
      const k = c.dataset.sw!;
      (mp as any)[k] = c.checked;
      savePrefs();
      if (k === "spatial") media.setSpatial(c.checked);
      if (k === "noiseSuppression" && media.micOn) {
        await media.setMic(false);
        await media.setMic(true);
      }
      if (k === "mirror") world.me?.bubble.querySelector("video")?.classList.toggle("mirror", c.checked);
    }),
  );
  el.querySelector("[data-more]")?.addEventListener("click", () => {
    togglePopover(kind);
    openSettings();
  });
}

// ------------------------------------------------------------ fundo da câmera
/** Opções de fundo (nenhum, desfocar, prontos, foto do computador). Aplica na hora, sem precisar salvar. */
async function mountBgPicker(box: HTMLElement) {
  const cur = () => prefs.camBg;
  const key = (b: CamBg) => (b.kind === "image" ? (b.img?.startsWith("preset:") ? b.img : "custom") : b.kind);
  const opts: { k: string; name: string; thumb: string; bg: CamBg }[] = [
    { k: "none", name: "Nenhum", thumb: "", bg: { kind: "none" } },
    { k: "blur", name: "Desfocar", thumb: "", bg: { kind: "blur" } },
    ...CAM_BG_PRESETS.map((p) => ({ k: "preset:" + p.id, name: p.name, thumb: presetImage(p.id), bg: { kind: "image" as const, img: "preset:" + p.id } })),
  ];
  const custom = cur().kind === "image" && cur().img && !cur().img!.startsWith("preset:") ? cur().img! : "";
  if (custom) opts.push({ k: "custom", name: "Sua imagem", thumb: custom, bg: { kind: "image", img: custom } });
  box.innerHTML =
    opts
      .map(
        (o) =>
          `<button type="button" class="bg-opt ${key(cur()) === o.k ? "on" : ""}" data-k="${esc(o.k)}" title="${esc(o.name)}" ${o.thumb ? `style="background-image:url('${o.thumb}')"` : ""}>${
            o.k === "none" ? icon("x", 18) : o.k === "blur" ? icon("eye", 18) : ""
          }<small>${esc(o.name)}</small></button>`,
      )
      .join("") + `<label class="bg-opt add" title="Usar uma imagem do computador">${icon("plus", 18)}<small>Enviar imagem</small><input type="file" accept="image/*" hidden></label>`;
  const choose = async (b: CamBg) => {
    prefs.camBg = b;
    savePrefs();
    box.querySelectorAll(".bg-opt").forEach((x) => x.classList.toggle("on", (x as HTMLElement).dataset.k === key(b)));
    if (b.kind !== "none" && !(await camBgSupported())) return toast("Este computador não suporta fundo de câmera.", true);
    await media.setCamBg(b);
    if (b.kind !== "none" && !media.camOn) toast("Fundo escolhido. Ele aparece quando você ligar a câmera.");
  };
  box.querySelectorAll<HTMLElement>("[data-k]").forEach((el) => el.addEventListener("click", () => choose(opts.find((o) => o.k === el.dataset.k)!.bg)));
  $<HTMLInputElement>("input[type=file]", box).addEventListener("change", async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const img = await fileToBg(f);
      await choose({ kind: "image", img });
      mountBgPicker(box);
    } catch {
      toast("Não consegui abrir essa imagem.", true);
    }
  });
}

// ------------------------------------------------------------ modo reunião (blocos em mosaico)
function setCallMode(m: CallMode) {
  if (prefs.callMode !== m) {
    prefs.callMode = m;
    savePrefs();
  }
  if (m === "reuniao") openMeeting();
  else closeMeeting();
  syncViewSwitch();
}

type VidEl = HTMLVideoElement & { _lkTrack?: any; _since?: number };
let meet: { el: HTMLElement; grid: HTMLElement; timer: number; tiles: Map<string, HTMLElement>; seen: Map<string, number> } | null = null;

function openMeeting() {
  if (meet) return;
  // ainda entrando no escritório: abre assim que o personagem existir
  if (!world?.me) {
    setTimeout(() => prefs.callMode === "reuniao" && openMeeting(), 500);
    return;
  }
  const el = document.createElement("div");
  el.className = "meet-full";
  el.innerHTML = `<div class="meet-bar"><span class="chip accent" data-room></span><span class="chip" data-count></span></div>
    <div class="meet-grid"></div>`;
  hud.insertBefore(el, $("#dock"));
  document.body.classList.add("meet-mode");
  meet = { el, grid: $(".meet-grid", el), timer: window.setInterval(updateMeeting, 250), tiles: new Map(), seen: new Map() };
  updateMeeting();
}

function closeMeeting() {
  if (!meet) return;
  clearInterval(meet.timer);
  for (const t of meet.tiles.values()) dropTileVideo(t);
  meet.el.remove();
  meet = null;
  document.body.classList.remove("meet-mode");
}

function dropTileVideo(tile: HTMLElement) {
  const v = tile.querySelector("video") as VidEl | null;
  if (!v) return;
  v._lkTrack?.detach(v);
  v.srcObject = null;
  v.remove();
}

function updateMeeting() {
  if (!meet || !world?.me) return;
  const now = performance.now();
  const me = media.room.localParticipant.identity;
  type P = { id: string; name: string; ini: string; color: string; talking: boolean; muted: boolean; mirror: boolean };
  const list: P[] = [
    { id: "me", name: `${prefs.name} (você)`, ini: initials(prefs.name), color: lookColor(prefs.look), talking: media.micOn && media.isTalking(me), muted: !media.micOn, mirror: prefs.media.mirror },
  ];
  const others: P[] = [];
  for (const [id, a] of world.others) {
    // na call = quem eu ouço; segura 3 s depois de sair, para o bloco não piscar na borda do alcance
    if ((media.levels.get(id) ?? 0) > 0.01 && media.canHear(id)) meet.seen.set(id, now);
    if (now - (meet.seen.get(id) ?? -1e9) > 3000) continue;
    others.push({ id, name: a.info.name, ini: initials(a.info.name), color: lookColor(a.look), talking: media.isTalking(id) && media.canHear(id), muted: a.label.classList.contains("muted"), mirror: false });
  }
  others.sort((a, b) => a.name.localeCompare(b.name));
  list.push(...others);
  const z = world.currentZone;
  $("[data-room]", meet.el).innerHTML = `${z?.private ? icon("lock", 13) : '<span class="dot"></span>'}${esc(z ? z.name : "Área aberta")}`;
  $("[data-count]", meet.el).textContent = list.length === 1 ? "Só você na call" : `${list.length} na call`;

  // tamanho dos blocos: o maior 16:9 que cabe (como no Meet), última linha centralizada
  const g = meet.grid;
  const W = g.clientWidth, H = g.clientHeight, gap = 12, n = list.length;
  let tw = 0;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    tw = Math.max(tw, Math.min((W - (cols - 1) * gap) / cols, ((H - (rows - 1) * gap) / rows) * (16 / 9)));
  }
  g.style.setProperty("--tw", `${Math.max(120, Math.floor(tw))}px`);

  const keep = new Set<string>();
  list.forEach((p, i) => {
    keep.add(p.id);
    let el = meet!.tiles.get(p.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "mt-tile";
      el.dataset.pid = p.id;
      el.innerHTML = `<div class="av"></div><small class="nofeed-t">Sem imagem</small><div class="nm"><i class="off hidden">${icon("mic-off", 13, 2.4)}</i><span></span></div>`;
      $(".av", el).textContent = p.ini;
      $(".av", el).setAttribute("style", `background:${p.color}`);
      $(".nm span", el).textContent = p.name;
      meet!.tiles.set(p.id, el);
    }
    el.classList.toggle("talking", p.talking);
    $(".off", el).classList.toggle("hidden", !p.muted);
    // câmera: a mesma faixa da bolha, presa a um <video> próprio (o LiveKit manda a qualidade do bloco grande)
    const track = media.camTrack(p.id === "me" ? "me" : p.id);
    let v = el.querySelector("video") as VidEl | null;
    if (track && (!v || v._lkTrack !== track)) {
      dropTileVideo(el);
      v = document.createElement("video") as VidEl;
      v.muted = true;
      v.playsInline = true;
      v._lkTrack = track;
      v._since = now;
      if (p.mirror) v.classList.add("mirror");
      track.attach(v);
      el.prepend(v);
    } else if (!track && v) {
      dropTileVideo(el);
      v = null;
    }
    const camWanted = p.id === "me" ? media.camOn : media.hasCam(p.id);
    const noFeed = !!v && (v.videoWidth === 0 || v.readyState < 2) && now - (v._since ?? now) > 2500;
    el.classList.toggle("cam", !!v && !noFeed);
    el.classList.toggle("nofeed", camWanted && noFeed);
    if (g.children[i] !== el) g.insertBefore(el, g.children[i] ?? null);
  });
  for (const [id, el] of meet.tiles)
    if (!keep.has(id)) {
      dropTileVideo(el);
      el.remove();
      meet.tiles.delete(id);
    }
}

// ------------------------------------------------------------ rádio (YouTube na sala)
/** Todos os rádios ligados agora (o mais novo vale, se dois ligaram a mesma caixa). */
function radioSources(): RadioSource[] {
  const byItem = new Map<string, RadioSource>();
  const add = (owner: string, ownerName: string, r: RadioState | undefined) => {
    if (!r?.item || (!r.vid && !r.list && !r.sp)) return;
    const cur = byItem.get(r.item);
    if (!cur || r.at > cur.at) byItem.set(r.item, { ...r, owner, ownerName });
  };
  if (world.me) add(myId, prefs.name, world.me.extra?.radio);
  for (const [id, a] of world.others) add(id, a.info.name, a.extra?.radio);
  return [...byItem.values()];
}

/** Quanto do rádio eu ouço: mesma sala = tudo; corredor aberto = cai com a distância; outra sala fechada = nada. */
function radioAudible(s: RadioSource): number {
  const it = world.layout?.items.find((i) => i.id === s.item);
  if (!it || !world.me) return 0;
  const me = world.me.root.position;
  const d = Math.hypot(me.x - it.x, me.z - it.z);
  const rz = world.zoneAt(it.x, it.z);
  const mz = world.currentZone;
  const box = Math.max(0, Math.min(1, s.vol ?? 1)); // volume da caixa (vale para todos)
  if (rz && mz && rz.id === mz.id) return Math.max(0.75, 1 - d / 40) * box;
  if (rz?.private || mz?.private) return 0;
  return d < 9 ? (1 - d / 9) * box : 0;
}

/** Controles de volume no menu da caixa: "para todos" (volume da caixa) e "só para mim". */
function radioVolumeControl(it: Item, on: RadioSource, box: HTMLElement) {
  const pct = (v: number) => Math.round(v * 100);
  box.className = "ctx-vol";
  box.innerHTML = `<div class="ctx-vol-head">${icon("volume", 16)}<span>Volume da caixa (todos)</span><b data-a>${pct(on.vol ?? 1)}%</b></div>
    <input type="range" min="0" max="100" step="5" value="${pct(on.vol ?? 1)}" data-all aria-label="Volume da caixa para todos">
    <div class="ctx-vol-head">${icon("users", 16)}<span>Só para mim</span><b data-m>${pct(soundPrefs.radio ?? 0.6)}%</b></div>
    <input type="range" min="0" max="100" step="5" value="${pct(soundPrefs.radio ?? 0.6)}" data-me aria-label="Volume do rádio só para mim">`;
  let sendT = 0;
  $<HTMLInputElement>("[data-all]", box).addEventListener("input", (e) => {
    const v = Number((e.target as HTMLInputElement).value) / 100;
    $("[data-a]", box).textContent = `${pct(v)}%`;
    clearTimeout(sendT);
    // espera parar de arrastar para não mandar 20 mensagens por segundo
    sendT = window.setTimeout(() => {
      if (on.owner === myId) {
        const mine = world.me.extra?.radio as RadioState | undefined;
        if (mine) sendState({ radio: { ...mine, vol: v } });
      } else atRadio(it, () => net.send({ t: "to", to: on.owner, msg: { kind: "radio_vol", item: it.id, vol: v } }));
    }, 250);
  });
  $<HTMLInputElement>("[data-me]", box).addEventListener("input", (e) => {
    const v = Number((e.target as HTMLInputElement).value) / 100;
    $("[data-m]", box).textContent = `${pct(v)}%`;
    soundPrefs.radio = v;
    prefs.sound = { ...soundPrefs };
    if (radio) radio.master = v;
    savePrefs();
  });
}

let radioPill: HTMLDivElement | null = null;
function startRadio() {
  if (radio) return;
  radio = new RadioPlayer();
  radio.master = soundPrefs.radio ?? 0.6;
  radio.onError = (msg) => toast(msg, true);
  radio.onNow = (now) => {
    radioPill?.remove();
    radioPill = null;
    if (!now) return;
    radioPill = document.createElement("div");
    radioPill.className = "panel radio-pill";
    radioPill.innerHTML = `${now.cover ? `<img class="cover" alt="">` : `<span class="cover ph">${icon("radio", 16)}</span>`}<span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><div class="meta"><div class="t-s c3">Rádio · ligado por ${esc(now.owner)}</div><div class="t-m"></div></div><input type="range" class="pill-vol" min="0" max="100" step="5" value="${Math.round((soundPrefs.radio ?? 0.6) * 100)}" title="Volume do rádio para mim" aria-label="Volume do rádio para mim"><button class="round" data-mute title="Silenciar para mim">${icon(radio!.muted ? "mic-off" : "volume", 15)}</button>`;
    $(".t-m", radioPill).textContent = now.title;
    if (now.cover) radioPill.querySelector<HTMLImageElement>("img.cover")!.src = now.cover;
    radioPill.classList.toggle("muted", radio!.muted);
    $<HTMLInputElement>(".pill-vol", radioPill).addEventListener("input", (e) => {
      const v = Number((e.target as HTMLInputElement).value) / 100;
      soundPrefs.radio = v;
      prefs.sound = { ...soundPrefs };
      radio!.master = v;
      savePrefs();
    });
    $("[data-mute]", radioPill).addEventListener("click", () => {
      radio!.muted = !radio!.muted;
      $("[data-mute]", radioPill!).innerHTML = icon(radio!.muted ? "mic-off" : "volume", 15);
      radioPill!.classList.toggle("muted", radio!.muted);
      toast(radio!.muted ? "Rádio silenciado para você" : "Rádio com som de novo");
    });
    hud.appendChild(radioPill);
  };
  setInterval(() => {
    if (!world?.me || !radio) return;
    const srcs = radioSources();
    // alguém ligou outra música na mesma caixa que eu: a minha sai
    const mine = world.me.extra?.radio as RadioState | undefined;
    if (mine && srcs.some((s) => s.item === mine.item && s.owner !== myId)) sendState({ radio: null });
    radio.update(srcs, radioAudible);
  }, 500);
}

/** Distância máxima (m) para mexer numa caixa de som / rádio. */
const RADIO_REACH = 2.6;

/** Só controla a caixa de som de perto: longe, o personagem anda até ela e aí faz. */
function atRadio(it: Item, then: () => void) {
  const me = world.me.root.position;
  if (Math.hypot(me.x - it.x, me.z - it.z) <= RADIO_REACH) return then();
  toast("Indo até a caixa de som...");
  world.walkTo(it.x + 1.1, it.z + 1.1);
  const t0 = Date.now();
  const iv = setInterval(() => {
    const p = world.me.root.position;
    if (Math.hypot(p.x - it.x, p.z - it.z) <= RADIO_REACH) {
      clearInterval(iv);
      then();
    } else if (Date.now() - t0 > 12_000 || (!world.walking && Date.now() - t0 > 800)) {
      clearInterval(iv);
      toast("Chegue perto da caixa de som para controlar", true);
    }
  }, 200);
}

function openRadioMenu(it: Item, x: number, y: number) {
  const on = radioSources().find((s) => s.item === it.id);
  const me = world.me.root.position;
  const far = Math.hypot(me.x - it.x, me.z - it.z) > RADIO_REACH;
  const items: [string, string, () => void][] = [["link", on ? "Trocar a música" : "Tocar link do YouTube", () => atRadio(it, () => askRadioLink(it))]];
  if (on) {
    items.push([
      "stop",
      "Desligar o rádio",
      () =>
        atRadio(it, () => {
          if (on.owner === myId) sendState({ radio: null });
          else net.send({ t: "to", to: on.owner, msg: { kind: "radio_stop", item: it.id } });
          toast("Rádio desligado");
        }),
    ]);
    if (radio) items.push([radio.muted ? "volume" : "mic-off", radio.muted ? "Ouvir de novo" : "Silenciar só para mim", () => (radio!.muted = !radio!.muted)]);
  }
  menu(x, y, (DEFS[it.type]?.label ?? "Rádio") + (far ? " · vá até ela para mexer" : ""), items, on ? (box) => radioVolumeControl(it, on, box) : undefined);
}

function askRadioLink(it: Item) {
  const bg = modal(
    "Tocar no rádio",
    `<label class="field"><span class="label">Link do YouTube ou do Spotify</span><input class="input" name="yt" placeholder="Música, álbum ou playlist" autocomplete="off"></label>
     <div class="note">Quem estiver nesta sala ouve junto. Vale YouTube, YouTube Music e Spotify (música, álbum ou playlist). No Spotify, quem não estiver logado nele ouve só 30 s de cada música. Para parar, clique no rádio de novo.</div>`,
    [
      ["Cancelar", "ghost", () => {}],
      [
        "Tocar",
        "primary",
        () => {
          const url = $<HTMLInputElement>('input[name="yt"]', bg).value;
          const yt = parseRadioLink(url);
          if (!yt) {
            toast("Cole um link do YouTube, YouTube Music ou Spotify (música, álbum ou playlist)", true);
            return false;
          }
          atRadio(it, () => {
            const r: RadioState = { item: it.id, url: url.trim().slice(0, 300), ...yt, at: Date.now() };
            sendState({ radio: r });
            toast("📻 Tocando no rádio da sala");
          });
        },
      ],
    ],
  );
  setTimeout(() => $<HTMLInputElement>('input[name="yt"]', bg).focus(), 50);
}

// ------------------------------------------------------------ apps vinculados (configurações)
/** Apps que entram como atalho no painel "Agenda e apps" (abrem no navegador ou no app instalado). */
const LINKABLE_APPS: { name: string; target: string; desc: string }[] = [
  { name: "Outlook", target: "https://outlook.office.com/mail/", desc: "E-mail e agenda da Microsoft" },
  { name: "Teams", target: "https://teams.microsoft.com", desc: "Chamadas e chat da Microsoft" },
  { name: "WhatsApp", target: "https://web.whatsapp.com", desc: "WhatsApp Web" },
  { name: "Slack", target: "https://app.slack.com", desc: "Mensagens da equipe" },
  { name: "Notion", target: "https://www.notion.so", desc: "Documentos e wikis" },
  { name: "Trello", target: "https://trello.com", desc: "Quadros de tarefas" },
  { name: "ClickUp", target: "https://app.clickup.com", desc: "Tarefas e projetos" },
  { name: "Monday", target: "https://monday.com", desc: "Gestão de projetos" },
  { name: "Pipedrive", target: "https://app.pipedrive.com", desc: "CRM de vendas" },
  { name: "Kommo", target: "https://www.kommo.com", desc: "CRM e atendimento" },
  { name: "Canva", target: "https://www.canva.com", desc: "Artes e criativos" },
  { name: "Figma", target: "https://www.figma.com/files", desc: "Design e protótipos" },
  { name: "Planilhas", target: "https://docs.google.com/spreadsheets", desc: "Google Planilhas" },
  { name: "Meta Business", target: "https://business.facebook.com", desc: "Anúncios e páginas" },
  { name: "Instagram", target: "https://www.instagram.com", desc: "Direct e publicações" },
];

function renderLinkedApps(sec: HTMLElement) {
  const linked = (target: string) => prefs.shortcuts.some((s) => s.target === target);
  const status = (on: boolean) => `<span class="chip ${on ? "accent" : ""}">${on ? '<span class="dot"></span>Conectado' : "Desconectado"}</span>`;
  const native = isNative;
  const row = (ico: string, name: string, desc: string, right: string) =>
    `<div class="connect">${icon(ico, 20)}<div class="meta"><div class="t-m">${name}</div><div class="note">${desc}</div></div>${right}</div>`;
  sec.innerHTML = `
    <div class="label">Contas</div>
    ${!native ? `<div class="note">Google e Spotify conectam no app instalado. No navegador, use os atalhos abaixo.</div>` : ""}
    ${row("calendar", "Google (Agenda, Gmail e Meet)", "Reuniões do dia, entrar no Meet com um clique e e-mails não lidos.",
      native ? `${status(integ.google)}<button type="button" class="btn ${integ.google ? "ghost" : "primary"} sm" data-link="${integ.google ? "google-off" : "google"}">${integ.google ? "Desconectar" : "Conectar"}</button>` : "")}
    ${row("music", "Spotify", "Mostra o que está tocando e controla o player.",
      native ? `${status(integ.spotify)}<button type="button" class="btn ${integ.spotify ? "ghost" : "secondary"} sm" data-link="${integ.spotify ? "spotify-off" : "spotify"}">${integ.spotify ? "Desconectar" : "Conectar"}</button>` : "")}
    ${native ? row("music", "YouTube Music", "Toca dentro do app (entre com a conta Google na primeira vez).", `<button type="button" class="btn secondary sm" data-link="ytm">Abrir</button>`) : ""}
    <div class="label" style="margin-top:6px">Atalhos de apps</div>
    <div class="note">Vinculado, o app aparece em “Agenda e apps” e abre com um clique.</div>
    <div class="linked-apps">
      ${LINKABLE_APPS.map((a) => `<label class="toggle-row la-row"><span class="la">${icon(shortcutIcon(a.name), 16)}<span><span class="t-m">${esc(a.name)}</span><span class="t-s c3">${esc(a.desc)}</span></span></span><span class="switch"><input type="checkbox" data-app="${esc(a.target)}" ${linked(a.target) ? "checked" : ""}><span></span></span></label>`).join("")}
    </div>
    <form class="inline-form" data-own>
      <div class="label">Outro app</div>
      <div class="row2"><input class="input" name="n" placeholder="Nome (ex.: Hostinger)" required><input class="input" name="t" placeholder="Link ou caminho do programa" required></div>
      <button class="btn secondary sm">Vincular</button>
    </form>`;
  const again = () => {
    refreshIntegrations().finally(() => renderLinkedApps(sec));
  };
  const run = async (f: () => Promise<unknown>, okMsg?: string) => {
    try {
      await f();
      if (okMsg) toast(okMsg);
    } catch (err) {
      toast(String(err), true);
    }
    again();
  };
  sec.querySelectorAll<HTMLElement>("[data-link]").forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.link;
      if (k === "google") {
        toast("Abrindo o navegador para autorizar o Google...");
        run(integrations.googleConnect, "Google conectado");
      } else if (k === "google-off") run(() => integrations.disconnect("google"), "Google desconectado");
      else if (k === "spotify") {
        if (!integ.spotify_configured) return toast("O Spotify ainda não foi ativado no servidor do escritório. Peça para a gestão ativar.", true);
        toast("Abrindo o navegador para você entrar na sua conta do Spotify...");
        run(integrations.spotifyConnect, "Spotify conectado");
      } else if (k === "spotify-off") run(() => integrations.disconnect("spotify"), "Spotify desconectado");
      else if (k === "ytm") ytm.open(true).catch((err) => toast(String(err), true));
    }),
  );
  sec.querySelectorAll<HTMLInputElement>("[data-app]").forEach((c) =>
    c.addEventListener("change", () => {
      const app = LINKABLE_APPS.find((a) => a.target === c.dataset.app)!;
      if (c.checked) {
        if (!linked(app.target)) prefs.shortcuts.push({ name: app.name, target: app.target });
      } else prefs.shortcuts = prefs.shortcuts.filter((s) => s.target !== app.target);
      savePrefs();
      if (rightPanel === "apps") renderApps();
      toast(c.checked ? `${app.name} vinculado` : `${app.name} removido`);
    }),
  );
  sec.querySelector<HTMLFormElement>("[data-own]")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    const n = String(f.get("n")).trim();
    const t = String(f.get("t")).trim();
    if (!n || !t) return;
    prefs.shortcuts.push({ name: n.slice(0, 24), target: t });
    savePrefs();
    if (rightPanel === "apps") renderApps();
    toast(`${n} vinculado`);
    (e.target as HTMLFormElement).reset();
  });
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
  const tabs = ["Áudio e vídeo", "Sons", "Privacidade", "Aparência", ...(isAdmin ? ["Escritório"] : []), "Funções", "Apps", "Sobre"];
  const bg = modal(
    "Configurações",
    `<div class="settings-wrap"><div class="tabs vtabs">${tabs.map((t, i) => `<button type="button" data-tab="${i}" class="${i ? "" : "on"}">${t}</button>`).join("")}</div>
    <form id="settings" class="settings">
      <section data-sec="0">
        <label class="field"><span class="label">Microfone</span><select class="input" name="micId">${opt(dev.mics, mp.micId)}</select></label>
        <label class="field"><span class="label">Câmera</span><select class="input" name="camId">${opt(dev.cams, mp.camId)}</select></label>
        <label class="field"><span class="label">Saída de som</span><select class="input" name="speakerId">${opt(dev.speakers, mp.speakerId)}</select></label>
        <div class="row2"><label class="field"><span class="label">Qualidade da câmera</span><select class="input" name="camQuality"><option value="360" ${mp.camQuality === "360" ? "selected" : ""}>Leve (360p)</option><option value="720" ${mp.camQuality === "720" ? "selected" : ""}>HD (720p)</option></select></label>
        <label class="field"><span class="label">Alcance da voz</span><select class="input" name="range">${Object.keys(RANGES).map((k) => `<option value="${k}" ${k === mp.range ? "selected" : ""}>${{ curto: "Curto", medio: "Médio", longo: "Longo" }[k as keyof typeof RANGES]}</option>`).join("")}</select></label></div>
        ${sw("spatial", "Áudio 3D", mp.spatial !== false, "A voz vem do lado de quem fala e abafa de longe. Desligue se ouvir eco usando caixa de som.")}
        ${sw("noiseSuppression", "Redução de ruído", mp.noiseSuppression)}
        ${sw("micOnJoin", "Microfone ligado ao entrar", mp.micOnJoin)}
        ${sw("mirror", "Espelhar minha câmera", mp.mirror)}
        <div class="field"><span class="label">Fundo da câmera</span><div class="bg-grid" data-bgs></div></div>
      </section>
      <section data-sec="1" hidden>
        <label class="slider-row"><span>Volume geral</span><input type="range" name="master" min="0" max="1" step="0.05" value="${soundPrefs.master}"></label>
        <label class="slider-row"><span>Volume do soundpad</span><input type="range" name="soundpad" min="0" max="1" step="0.05" value="${soundPrefs.soundpad}"></label>
        <label class="slider-row"><span>Volume do rádio</span><input type="range" name="radio" min="0" max="1" step="0.05" value="${soundPrefs.radio ?? 0.6}"></label>
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
        <div class="label">Visual</div>
        <label class="field"><span class="label">Modo de call</span><select class="input" name="callMode">
          <option value="escritorio" ${prefs.callMode === "escritorio" ? "selected" : ""}>Escritório (o mapa, com as bolhas de câmera)</option>
          <option value="reuniao" ${prefs.callMode === "reuniao" ? "selected" : ""}>Reunião (blocos em mosaico, como no Meet)</option>
        </select></label>
        <label class="field"><span class="label">Visão</span><select class="input" name="view">
          <option value="iso" ${prefs.view === "iso" ? "selected" : ""}>3D isométrica (diagonal, padrão)</option>
          <option value="aerea" ${prefs.view === "aerea" ? "selected" : ""}>3D aérea (de cima, com luz e sombra)</option>
          <option value="2d" ${prefs.view === "2d" ? "selected" : ""}>2D (plano de cima, cores chapadas, mais leve)</option>
        </select></label>
        <label class="field"><span class="label">Estilo visual</span><select class="input" name="style">
          <option value="padrao" ${prefs.style === "padrao" ? "selected" : ""}>Padrão (traço fino, cores chapadas)</option>
          <option value="realista" ${prefs.style === "realista" ? "selected" : ""}>Realista (luz e sombras suaves, reflexos)</option>
          <option value="desenho" ${prefs.style === "desenho" ? "selected" : ""}>Desenho (contorno forte, estilo cartoon)</option>
          <option value="retro" ${prefs.style === "retro" ? "selected" : ""}>Retrô (pixelado, estilo videogame antigo)</option>
        </select></label>
        <label class="field"><span class="label">Qualidade gráfica</span><select class="input" name="quality">
          <option value="leve" ${prefs.quality === "leve" ? "selected" : ""}>Leve (computador mais fraco, sem sombras)</option>
          <option value="equilibrada" ${prefs.quality === "equilibrada" ? "selected" : ""}>Equilibrada (recomendada)</option>
          <option value="bonita" ${prefs.quality === "bonita" ? "selected" : ""}>Bonita (mais nítida, usa mais a placa de vídeo)</option>
        </select></label>
        <div class="label" style="margin-top:8px">Gráficos</div>
        <div class="row2"><label class="field"><span class="label">Limite de quadros</span><select class="input" name="gfx_fps">
          ${[[0, "Sem limite (o máximo da tela)"], [60, "60 por segundo"], [30, "30 por segundo (economiza bateria)"]].map(([k, l]) => `<option value="${k}" ${prefs.gfx.fps === k ? "selected" : ""}>${l}</option>`).join("")}
        </select></label>
        <label class="field"><span class="label">Resolução</span><select class="input" name="gfx_scale">
          ${[[0, "Automática (pela qualidade)"], [1, "100% (mais nítida)"], [0.75, "75%"], [0.5, "50% (mais leve)"]].map(([k, l]) => `<option value="${k}" ${prefs.gfx.scale === k ? "selected" : ""}>${l}</option>`).join("")}
        </select></label></div>
        ${sw("gfx_shadows", "Sombras", prefs.gfx.shadows, "Sombra dos móveis e das pessoas (no 2D não tem sombra).")}
        ${sw("gfx_outline", "Contorno nas bordas", prefs.gfx.outline, "As linhas que desenham as bordas. Desligar deixa mais leve.")}
        ${sw("zoneTags", "Mostrar o nome das salas no mapa", prefs.zoneTags)}
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
        <div class="label">Prédio</div>
        <div class="editor-actions"><button type="button" class="btn secondary sm" data-build="predio">${icon("wall", 15)} Aumentar o prédio</button><button type="button" class="btn secondary sm" data-build="salas">${icon("room", 15)} Adicionar salas</button></div>
      </section>`
          : ""
      }
      <section data-sec="${tabs.length - 3}" hidden data-funcs>${funcsHtml()}</section>
      <section data-sec="${tabs.length - 2}" hidden data-linked></section>
      <section data-sec="${tabs.length - 1}" hidden>
        <div class="pc-row"><span class="label">Versão</span><span>${esc(String(ver))}</span></div>
        ${isNative ? `${sw("autoUpdate", "Procurar atualizações automaticamente", prefs.autoUpdate, "Verifica ao abrir, a cada 30 minutos e quando o computador volta do descanso.")}
        <button type="button" class="btn secondary sm" data-check>Procurar atualização agora</button>` : ""}
        <label class="field"><span class="label">Chave de gestão</span><input class="input" name="adminKey" type="password" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" value="${esc(prefs.adminKey)}" placeholder="Só para a gestão"></label>
        <div class="note">${isAdmin ? "Você está conectado como gestão." : "Com a chave de gestão você vê a atividade da equipe e configura o escritório. Vale ao entrar de novo."}</div>
      </section>
    </form></div>`,
    [
      ["Cancelar", "ghost", () => {}],
      ["Salvar", "primary", () => saveSettings(bg)],
    ],
    true,
  );
  bg.querySelector(".modal")?.classList.add("settings-modal");
  mountBgPicker($("[data-bgs]", bg));
  bg.querySelectorAll<HTMLElement>("[data-fn]").forEach((b) =>
    b.addEventListener("click", () => {
      const f = FUNCS.flatMap((g) => g.items).find((x) => x.id === b.dataset.fn);
      if (!f?.run) return;
      bg.remove();
      f.run();
    }),
  );
  bg.querySelectorAll<HTMLElement>("[data-tab]").forEach((t) =>
    t.addEventListener("click", () => {
      bg.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === t));
      bg.querySelectorAll<HTMLElement>("[data-sec]").forEach((s) => (s.hidden = s.dataset.sec !== t.dataset.tab));
      $("#settings", bg).scrollTop = 0;
    }),
  );
  bg.querySelectorAll<HTMLElement>("[data-build]").forEach((b) =>
    b.addEventListener("click", () => {
      bg.remove();
      if (!editor.active) dockAction("edit");
      editor.showTab(b.dataset.build as "predio" | "salas");
    }),
  );
  renderLinkedApps($("[data-linked]", bg));
  bg.querySelector("[data-check]")?.addEventListener("click", async () => {
    try {
      const u = await checkUpdate();
      if (!u) return toast("Você já está na versão mais recente");
      pendingUpdate = u;
      showUpdateBanner();
    } catch (e) {
      const msg = String(e);
      toast(
        /version number|semver/i.test(msg)
          ? "O servidor de atualização publicou uma versão com número inválido. Avise quem publicou (use o formato 0.4.1)."
          : /fetch|network|connect|timed? ?out/i.test(msg)
            ? "Sem conexão com o servidor de atualização agora. Tente de novo em instantes."
            : `Não consegui verificar a atualização: ${msg}`,
        true,
      );
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
  const spatial = c("spatial");
  media.prefs = mp;
  if (spatial !== media.prefs.spatial || spatial !== !!mp.spatial) media.setSpatial(spatial);
  mp.spatial = spatial;
  if (devChanged) media.applyDevices();
  Object.assign(soundPrefs, { master: Number(v("master")), soundpad: Number(v("soundpad")), radio: Number(v("radio")), steps: c("steps"), approach: c("approach"), notify: c("notify") });
  prefs.sound = { ...soundPrefs };
  const shareChanged = prefs.shareActivity !== c("shareActivity");
  prefs.shareActivity = c("shareActivity");
  prefs.shareAgendaTitles = c("shareAgendaTitles");
  prefs.shareMeeting = c("shareMeeting");
  prefs.shareMusic = c("shareMusic");
  prefs.weatherFx = c("weatherFx");
  prefs.zoneTags = c("zoneTags");
  document.body.classList.toggle("hide-zone-tags", !prefs.zoneTags);
  const st = v("style") as GraphicStyle;
  if (st && st !== prefs.style) {
    prefs.style = st;
    world.setStyle(st);
  }
  const q = v("quality") as Prefs["quality"];
  if (q && q !== prefs.quality) {
    prefs.quality = q;
    world.setQuality(q);
  }
  const gfx: GfxOptions = { shadows: c("gfx_shadows"), outline: c("gfx_outline"), fps: Number(v("gfx_fps")) || 0, scale: Number(v("gfx_scale")) || 0 };
  if (JSON.stringify(gfx) !== JSON.stringify(prefs.gfx)) {
    prefs.gfx = gfx;
    world.setGfx(gfx);
  }
  const vw = v("view") as ViewMode;
  if (vw && vw !== prefs.view) setView(vw);
  const cm = v("callMode") as CallMode;
  if (cm && cm !== prefs.callMode) setCallMode(cm);
  if (f.elements.namedItem("autoUpdate")) prefs.autoUpdate = c("autoUpdate");
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
    if (JSON.stringify(envCfg) !== JSON.stringify(world.fullLayout.env ?? {})) {
      const layout: Layout = { ...JSON.parse(JSON.stringify(world.fullLayout)), env: envCfg };
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


// ------------------------------------------------------------ sala do cargo
/** Sala do meu cargo e uma cadeira livre nela. */
function roleSeat() {
  // um cargo pode ter mais de uma sala (ex.: duas salas de gestão): vale a primeira com mesa livre
  const zones = world.layout?.zones.filter((z) => z.role && z.role === prefs.role) ?? [];
  if (!zones.length) return null;
  const taken = (x: number, z: number) => [...world.others.values()].some((a) => Math.hypot(a.target.x - x, a.target.z - z) < 0.5);
  // a cadeira atrás da mesa (giratória) primeiro, depois qualquer uma; sala mais vazia antes
  // ordem: cadeira executiva (atrás da mesa), giratória, qualquer outra
  for (const pref of ["exec_chair", "office_chair", ""])
    for (const zn of zones) {
      const inside = (x: number, z: number) => Math.abs(x - zn.x) <= zn.w / 2 && Math.abs(z - zn.z) <= zn.d / 2;
      const seat = world.layout.items.find((i) => SEATS[i.type] && (!pref || i.type === pref) && inside(i.x, i.z) && !taken(i.x, i.z));
      if (seat) return { zone: zn, seat };
    }
  return { zone: zones[0], seat: null };
}

/** Vai para a sala do cargo: ao entrar, já nasce sentado; pelo botão, vai andando. */
function goToRoleRoom(spawn: boolean) {
  const r = roleSeat();
  if (!r) {
    if (!spawn) toast(prefs.role ? `Ainda não há sala para ${prefs.role} no mapa` : "Escolha seu cargo na tela de entrada", true);
    return;
  }
  if (spawn) {
    if (r.seat) world.sitAt(r.seat);
    else world.me.root.position.set(r.zone.x, 0, r.zone.z);
    world.camTarget.copy(world.me.root.position);
  } else {
    if (r.seat) world.walkTo(r.seat.x, r.seat.z);
    else world.walkTo(r.zone.x, r.zone.z);
    world.runToTarget();
  }
}

// ------------------------------------------------------------ celular: menu "Mais"
function renderMore(el: HTMLElement) {
  el.classList.add("more-sheet");
  const item = (id: string, ic: string, label: string, on = false, extra = "") =>
    `<button class="more-item ${on ? "on" : ""}" data-m="${id}">${icon(ic, 22)}<span>${label}</span>${extra}</button>`;
  el.innerHTML = `<div class="label">Mais opções</div><div class="more-grid">${[
    item("people", "users", "Pessoas", leftOpen),
    item("pad", "volume", "Soundpad"),
    item("apps", "calendar", "Agenda", rightPanel === "apps", mailUnread ? `<i class="dot-badge"></i>` : ""),
    item("meetings", "file-text", "Reuniões", rightPanel === "meetings"),
    item("char", "shirt", "Personagem"),
    prefs.role ? item("home", "home", "Minha sala") : "",
    typeof MediaRecorder !== "undefined" ? item("rec", "record", recorder?.active ? "Parar gravação" : "Gravar", !!recorder?.active) : "",
    isAdmin ? item("team", "activity", "Equipe", rightPanel === "team") : "",
    item("settings", "settings", "Configurações"),
    item("exit", "log-out", "Sair"),
  ].join("")}</div>`;
  el.querySelectorAll<HTMLElement>("[data-m]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.m!;
      togglePopover("more");
      dockAction(id);
    }),
  );
}
registerPWA();
