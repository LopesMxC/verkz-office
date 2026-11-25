import { geo, disposeTree } from "./geo";
import { REG as PACK } from "../pack";
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPixelatedPass } from "three/addons/postprocessing/RenderPixelatedPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { setOfficeStyle, officeStyle, buildItem, buildWall, SCREEN_MATS, DEFS, doorJamb, levelView, MOUNT_Y, WALL_MOUNT, footprint, Item, Layout, WALL_CUT, WALL_H, WALL_T, WALL_TYPES, wallRects, wallSegment, WallLinks, Zone } from "./furniture";

/** Largura do vão das portas duplas (as duas folhas juntas), em metros. */
const DOOR_W = 1.3;
import { LOGO_PATH, NEON } from "./logo";
import { icon } from "./icons";
import { pixelTexture, rng, toon } from "./toon";
import { buildCharacter, Character, Look, normalizeLook } from "./avatar";
import { Environment, Holiday } from "./env";
import { foliageMaterials } from "./models";
import { PoolSim, POOL_W, POOL_H, PM, PR } from "./games";

/** Emotes: nome → ícone (traço, sem emoji) e animação. */
export const EMOTES: [string, string, string, string][] = [
  // id, ícone, nome, cor do selo
  ["acenar", "hand", "Acenar", "#C8F501"],
  ["joinha", "thumbs-up", "Joinha", "#5ec8ff"],
  ["palmas", "sparkles", "Palmas", "#ffd35c"],
  ["rir", "laugh", "Rir", "#ffd35c"],
  ["coracao", "heart", "Coração", "#ff7aa8"],
  ["danca", "music", "Dançar", "#8a6cc9"],
  ["pular", "party-popper", "Comemorar", "#C8F501"],
  ["pensar", "lightbulb", "Pensar", "#ffd35c"],
  ["cafe", "coffee", "Pausa", "#d9a46c"],
  ["fogo", "flame", "Mandou bem", "#ff8a3d"],
  ["surpresa", "zap", "Surpresa", "#5ec8ff"],
  ["triste", "frown", "Triste", "#8f9bb3"],
  ["dormir", "moon", "Dormir", "#a48ce0"],
  ["sim", "check", "Concordo", "#27ae60"],
  ["nao", "x", "Discordo", "#ff5a65"],
];
/** Duração de cada emote (s). */
const EMOTE_DUR: Record<string, number> = { danca: 4.2, pular: 2.8, pensar: 3.2, dormir: 3.6, triste: 3.2, rir: 2.8, cafe: 3.2 };
const FX_MATS = new Map<string, THREE.MeshBasicMaterial>();
function fxMat(c: string) {
  let m = FX_MATS.get(c);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
    m.userData.shared = true;
    FX_MATS.set(c, m);
  }
  return m;
}

/** Itens que o personagem pode segurar (cozinha). */
export const HOLD_ITEMS: Record<string, { label: string; ic: string; status: string }> = {
  cafe: { label: "Café", ic: "coffee", status: "Tomando um café" },
  agua: { label: "Água", ic: "glass-water", status: "Pausa para a água" },
  lanche: { label: "Lanche", ic: "sandwich", status: "Fazendo um lanche" },
  refri: { label: "Refrigerante", ic: "cup-soda", status: "Pausa" },
  marmita: { label: "Marmita", ic: "utensils", status: "Almoçando" },
};

// ------------------------------------------------------------------ status e apps: ícone e animação
export type StatusKind = "disponivel" | "ocupado" | "reuniao" | "foco" | "ausente" | "musica" | "pausa" | "outro";
export const STATUS_KINDS: Record<StatusKind, { ic: string; label: string }> = {
  disponivel: { ic: "check", label: "Disponível" },
  ocupado: { ic: "zap", label: "Ocupado" },
  reuniao: { ic: "users", label: "Em reunião" },
  foco: { ic: "target", label: "Foco" },
  ausente: { ic: "moon", label: "Ausente" },
  musica: { ic: "music", label: "Ouvindo música" },
  pausa: { ic: "coffee", label: "Pausa" },
  outro: { ic: "circle-dot", label: "Status" },
};
/** Tipo do status pelo texto (o status é livre; palavras comuns viram uma animação). */
export function statusKind(s: string): StatusKind {
  const t = s.toLowerCase();
  if (/reuni|call|meet|chamada|apresenta/.test(t)) return "reuniao";
  if (/ocupad|n[aã]o perturbe|dnd|urgente|correria/.test(t)) return "ocupado";
  if (/foc|concentr|estudando|programando|codando/.test(t)) return "foco";
  if (/ausente|volto|fora|saindo|afk|almo[cç]o|dormindo/.test(t)) return "ausente";
  if (/ouvindo|m[uú]sica|playlist/.test(t)) return "musica";
  if (/caf[eé]|[aá]gua|lanche|almo[cç]ando|marmita|pausa|intervalo|refri/.test(t)) return "pausa";
  if (/dispon[ií]vel|livre|online|on|pode chamar/.test(t)) return "disponivel";
  return "outro";
}

export type AppKind = "code" | "web" | "design" | "music" | "chat" | "sheet" | "game" | "video" | "work";
export const APP_KINDS: Record<AppKind, { ic: string }> = {
  code: { ic: "code" },
  web: { ic: "globe" },
  design: { ic: "palette" },
  music: { ic: "music" },
  chat: { ic: "message-circle" },
  sheet: { ic: "table" },
  game: { ic: "gamepad" },
  video: { ic: "video" },
  work: { ic: "briefcase" },
};
/** Tipo do app (programa em uso) para o ícone animado e a tela do computador. */
export function appKind(app = "", title = ""): AppKind {
  const a = `${app} ${title}`.toLowerCase();
  if (/visual studio|vs ?code|\bcode\b|cursor|intellij|pycharm|webstorm|android studio|xcode|terminal|powershell|cmd\.exe|git|sublime|notepad\+\+|neovim|vim|godot|unity|unreal|roblox studio/.test(a)) return "code";
  if (/figma|photoshop|illustrator|canva|blender|krita|gimp|inkscape|affinity|lightroom|sketch|xd\b/.test(a)) return "design";
  if (/premiere|after effects|davinci|resolve|capcut|vegas|obs|youtube(?! music)|netflix|twitch|prime video/.test(a)) return "video";
  if (/spotify|youtube music|deezer|music|tidal|soundcloud|apple music/.test(a)) return "music";
  if (/whatsapp|teams|slack|discord|zoom|telegram|outlook|gmail|meet|skype|messenger/.test(a)) return "chat";
  if (/excel|sheets|planilha|word|docs|notion|powerpoint|slides|onenote|obsidian|trello|clickup|monday|pdf|acrobat/.test(a)) return "sheet";
  if (/steam|epic|valorant|league|minecraft|fortnite|counter-strike|cs2|riot|battle\.net|xbox|roblox(?! studio)|jogo|game/.test(a)) return "game";
  if (/chrome|edge|firefox|opera|brave|safari|vivaldi|navegador|arc\b/.test(a)) return "web";
  return "work";
}

/** Telas animadas (canvas pequeno, cara de pixel art), uma por tipo de app. Só redesenha as que estão em uso. */
export class ScreenFx {
  private cache = new Map<AppKind | "standby", { mat: THREE.MeshBasicMaterial; tex: THREE.CanvasTexture; g: CanvasRenderingContext2D; used: number }>();
  private t = 0;
  get(kind: AppKind) {
    let c = this.cache.get(kind);
    if (!c) {
      const cv = document.createElement("canvas");
      cv.width = 48;
      cv.height = 28;
      const g = cv.getContext("2d")!;
      const tex = new THREE.CanvasTexture(cv);
      tex.magFilter = THREE.NearestFilter;
      // de perto fica pixelado; de longe suaviza (com "nearest" a tela cintilava a cada quadro)
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.anisotropy = 4;
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      mat.userData.shared = true;
      c = { mat, tex, g, used: 0 };
      this.cache.set(kind, c);
      this.draw(kind, c.g);
      tex.needsUpdate = true;
    }
    c.used = performance.now();
    return c.mat;
  }
  /** Avança as animações (chamado ~8 vezes por segundo). */
  tick() {
    this.t++;
    const now = performance.now();
    for (const [k, c] of this.cache) {
      if (k === "standby" || now - c.used > 1500) continue;
      this.draw(k as AppKind, c.g);
      c.tex.needsUpdate = true;
    }
  }
  private draw(kind: AppKind, g: CanvasRenderingContext2D) {
    const t = this.t;
    const W = 48;
    const H = 28;
    const bg = (c: string) => {
      g.fillStyle = c;
      g.fillRect(0, 0, W, H);
    };
    const r = (x: number, y: number, w: number, h: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(x, y, w, h);
    };
    const rnd = (n: number) => {
      const x = Math.sin(n * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    switch (kind) {
      case "code": {
        // linhas de código subindo e o cursor piscando
        bg("#14181f");
        r(0, 0, 8, H, "#1c2230");
        const colors = ["#c678dd", "#61afef", "#98c379", "#e5c07b", "#e06c75", "#56b6c2"];
        for (let i = 0; i < 9; i++) {
          const line = i + Math.floor(t / 3);
          const y = 1 + i * 3;
          r(2, y, 3, 1, "#4b5263");
          const ind = (rnd(line) * 4) | 0;
          let x = 10 + ind * 3;
          const parts = 1 + ((rnd(line + 7) * 3) | 0);
          for (let p = 0; p < parts; p++) {
            const w = 3 + ((rnd(line * 3 + p) * 9) | 0);
            r(x, y, Math.min(w, W - x - 1), 1, colors[(line + p) % colors.length]);
            x += w + 2;
            if (x > W - 4) break;
          }
        }
        if ((t >> 2) % 2) r(10 + ((rnd(Math.floor(t / 3) + 8) * 20) | 0), 25, 1, 2, "#C8F501");
        break;
      }
      case "web": {
        // navegador: barra de abas e uma página rolando
        bg("#f4f1ea");
        r(0, 0, W, 4, "#d9d4c8");
        r(2, 1, 12, 3, "#f4f1ea");
        r(15, 1, 10, 3, "#c9c3b5");
        r(4, 5, 40, 2, "#e4e0d6");
        const off = t % 30;
        for (let i = 0; i < 8; i++) {
          const y = 9 + i * 6 - off / 2;
          if (y < 8 || y > H - 2) continue;
          if (i % 3 === 0) r(4, y, 16, 4, ["#5ec8ff", "#ffb35c", "#8a6cc9"][i % 3]);
          r(22, y, 22, 1, "#9aa0ab");
          r(22, y + 2, 16, 1, "#c9c3b5");
        }
        break;
      }
      case "design": {
        // quadro de design: formas aparecendo e o cursor andando
        bg("#2a2d34");
        r(0, 0, 6, H, "#1f2127");
        r(W - 8, 0, 8, H, "#1f2127");
        const s = t % 24;
        r(10, 6, Math.min(12, s), 8, "#C8F501");
        if (s > 8) r(24, 10, 10, Math.min(10, s - 8), "#ff7aa8");
        if (s > 14) {
          g.fillStyle = "#5ec8ff";
          g.beginPath();
          g.arc(20, 21, Math.min(4, (s - 14) / 2), 0, Math.PI * 2);
          g.fill();
        }
        const cx = 10 + ((Math.sin(t / 4) + 1) * 13) | 0;
        const cy = 8 + ((Math.cos(t / 5) + 1) * 7) | 0;
        r(cx, cy, 1, 3, "#ffffff");
        r(cx, cy, 3, 1, "#ffffff");
        break;
      }
      case "music": {
        // equalizador
        bg("#121212");
        for (let i = 0; i < 11; i++) {
          const h = 3 + ((Math.abs(Math.sin(t / 2 + i * 1.7)) * 16) | 0);
          r(3 + i * 4, H - 5 - h, 3, h, i % 3 ? "#1ed760" : "#C8F501");
        }
        r(3, H - 3, 42, 1, "#3a3a3a");
        r(3, H - 3, (t * 2) % 42, 1, "#ffffff");
        break;
      }
      case "chat": {
        // conversa: balões chegando
        bg("#e9e4da");
        const n = (t >> 3) % 6;
        for (let i = 0; i < 5; i++) {
          const k = i + n;
          const mine = rnd(k) > 0.5;
          const w = 10 + ((rnd(k + 3) * 14) | 0);
          const y = 2 + i * 5;
          r(mine ? W - w - 3 : 3, y, w, 4, mine ? "#c8f5a0" : "#ffffff");
        }
        if ((t >> 1) % 3 === 0) r(5, 25, 1, 1, "#888");
        break;
      }
      case "sheet": {
        // planilha: células sendo preenchidas e um gráfico
        bg("#ffffff");
        for (let y = 0; y < H; y += 3) r(0, y, W, 1, "#e3e3e3");
        for (let x = 0; x < W; x += 8) r(x, 0, 1, H, "#e3e3e3");
        const fill = t % 40;
        for (let i = 0; i < Math.min(fill, 30); i++) r(1 + (i % 3) * 8, 1 + Math.floor(i / 3) * 3, 6, 1, i % 3 === 2 ? "#27ae60" : "#5d606c");
        for (let i = 0; i < 4; i++) r(30 + i * 4, H - 2 - ((rnd(i) * 12) | 0) - 3, 3, ((rnd(i) * 12) | 0) + 3, "#3b6fc0");
        break;
      }
      case "game": {
        // jogo: chão rolando e um bonequinho pulando
        bg("#5ec8ff");
        r(0, 20, W, 8, "#27ae60");
        for (let i = 0; i < 6; i++) r(((i * 11 - t) % 60 + 60) % 60 - 6, 20, 4, 2, "#1e8449");
        const jy = Math.abs(Math.sin(t / 3)) * 7;
        r(14, 15 - jy, 4, 5, "#e74c3c");
        r(((40 - t) % 52 + 52) % 52, 17, 4, 3, "#6e4a32");
        break;
      }
      case "video": {
        // edição de vídeo: timeline correndo
        bg("#1d1f24");
        r(4, 2, 40, 14, "#3b4252");
        r(4 + ((t * 2) % 40), 2, 1, 22, "#ff5a65");
        r(4, 18, 40, 2, "#8a6cc9");
        r(4, 21, 28, 2, "#5ec8ff");
        r(10, 24, 30, 2, "#ffb35c");
        break;
      }
      default: {
        // trabalho genérico: janelas e uma barra de progresso
        bg("#1d2433");
        r(3, 3, 26, 14, "#5ec8ff");
        r(31, 3, 14, 6, "#C8F501");
        r(31, 11, 14, 6, "#ffd35c");
        r(3, 21, 42, 2, "#2c3e5a");
        r(3, 21, (t % 42) + 1, 2, "#C8F501");
      }
    }
  }
}

/** Taco de sinuca (no espaço do corpo, que já tem a escala do personagem). */
function cueMesh(): THREE.Object3D {
  const g = new THREE.Group();
  const len = 1.75;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.024, len, 8), toon("#d7a868"));
  shaft.rotation.x = Math.PI / 2; // ponta fina para a frente (+z)
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.027, 0.5, 8), toon("#2b1a10"));
  butt.rotation.x = Math.PI / 2;
  butt.position.z = -len / 2 + 0.25;
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.03, 8), toon("#2a6fb0"));
  tip.rotation.x = Math.PI / 2;
  tip.position.z = len / 2;
  g.add(shaft, butt, tip);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

/** Bolas 3D da mesa de sinuca (mesma física do jogo, rodando aqui para quem assiste). */
interface PoolView {
  sim: PoolSim;
  obj: THREE.Object3D;
  group: THREE.Group;
  balls: THREE.Object3D[];
  shot: number;
}
const _q = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const POOL_COLORS = ["#f6f3ea", "#f2c230", "#2f62c4", "#d23a2e", "#7a4fc0", "#ef7d22", "#1f9a52", "#8b2a22", "#121212"];
const POOL_SCALE = 2.0 / (POOL_W - 2 * PM); // canvas -> metros (área de jogo de 2 m)
const POOL_BALL_Y = 0.8 + PR * (2.0 / (POOL_W - 2 * PM));

function poolBall(n: number): THREE.Object3D {
  const r = PR * POOL_SCALE;
  const stripe = n >= 9;
  const col = POOL_COLORS[stripe ? n - 8 : n];
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), toon(stripe ? "#f6f3ea" : col));
  m.castShadow = true;
  if (!stripe) return m;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, r * 1.0, 12, 1, true), toon(col));
  m.add(band);
  return m;
}

function holdMesh(kind: string): THREE.Object3D {
  const g = new THREE.Group();
  const m = (c: string) => toon(c);
  const b = (w: number, h: number, d: number, c: string, y = 0) => {
    const x = new THREE.Mesh(geo.box(w, h, d), m(c));
    x.position.y = y;
    g.add(x);
    return x;
  };
  // `fill`: como o conteúdo diminui (o personagem vai bebendo/comendo até acabar)
  if (kind === "cafe") {
    const cup = b(0.1, 0.11, 0.1, "#f2f0ea");
    (cup.material as THREE.MeshToonMaterial).transparent = true;
    (cup.material as THREE.MeshToonMaterial).opacity = 0.92;
    const coffee = b(0.08, 0.01, 0.08, "#5a3a22", 0.055);
    b(0.03, 0.06, 0.02, "#f2f0ea").position.set(0.065, 0, 0);
    g.userData.fill = (lv: number) => (coffee.position.y = -0.045 + 0.1 * lv);
  } else if (kind === "agua") {
    const cup = b(0.08, 0.14, 0.08, "#e8f6fc");
    (cup.material as THREE.MeshToonMaterial).transparent = true;
    (cup.material as THREE.MeshToonMaterial).opacity = 0.35;
    const water = b(0.07, 0.13, 0.07, "#59b8e0");
    g.userData.fill = (lv: number) => {
      water.scale.y = Math.max(0.02, lv);
      water.position.y = -0.065 + 0.065 * lv;
    };
  } else if (kind === "lanche") {
    const parts = [b(0.14, 0.03, 0.1, "#e6c08a"), b(0.14, 0.02, 0.1, "#7fcf5a", 0.025), b(0.14, 0.03, 0.1, "#e6c08a", 0.05)];
    // mordidas: o sanduíche vai encurtando
    g.userData.fill = (lv: number) => parts.forEach((p) => ((p.scale.x = Math.max(0.15, lv)), (p.position.x = -0.07 * (1 - lv))));
  } else if (kind === "refri") {
    b(0.07, 0.13, 0.07, "#d9534f");
    b(0.05, 0.01, 0.05, "#c9c9c9", 0.065);
  } else if (kind === "marmita") {
    b(0.18, 0.06, 0.14, "#dcd8cf");
    const food = b(0.16, 0.02, 0.12, "#c98a55", 0.035);
    g.userData.fill = (lv: number) => {
      food.scale.y = Math.max(0.05, lv);
      food.position.y = 0.025 + 0.01 * lv;
    };
  }
  return g;
}

export interface PeerInfo {
  id: string;
  name: string;
  color: string;
  x: number;
  z: number;
  dir: number;
  moving: boolean;
  status: string;
  zone: string | null;
  look?: any;
  extra?: any;
}

/** Tamanho do personagem (1 = modelo base). */
export const AVATAR_SCALE = 0.82;
/** Altura do assento das cadeiras (m). */
const SEAT_Y = 0.46;
/** Móveis em que dá para sentar e a distância do clique até eles. */
export type GraphicStyle = "padrao" | "realista" | "desenho" | "retro";

export type ViewMode = "iso" | "aerea" | "2d";
export interface GfxOptions {
  /** Sombras dos móveis e das pessoas. */
  shadows: boolean;
  /** Contorno (linhas nas bordas). */
  outline: boolean;
  /** Limite de quadros por segundo (0 = sem limite). */
  fps: number;
  /** Resolução da cena (0 = automática; 0.5 a 1 = parte da nitidez da tela). */
  scale: number;
}

/** Destino de um clique no mapa: ponto do chão ou uma cadeira para sentar. */
export type WalkPlan = { x: number; z: number; seat: Item | null };

export const SEATS: Record<string, number> = { chair: 0.55, office_chair: 0.55, wood_chair: 0.55, exec_chair: 0.55, stool: 0.5, armchair: 0.8, armchair_plain: 0.8, chair_c: 0.55, chair_b_wood: 0.55, stool_wood: 0.5, k_chair_a: 0.55, k_chair_b: 0.55, p_gamer_chair: 0.55, p_bench: 0.8 };

/** Altura do assento por móvel (m); quem não está aqui usa SEAT_Y. */
export const SEAT_H: Record<string, number> = {};
// cadeiras, bancos, sofás e poltronas do pacote novo: todos dá para sentar
for (const p of PACK) {
  const chair = p.cat === "Cadeiras e bancos";
  const lounge = (p.cat === "Sofás e lounge" && /^pk_lng_(sofa|canto|poltrona|namorados|banco|chaise|pufe|puff)/.test(p.id)) || /mesa_sofa/.test(p.id);
  if (!chair && !lounge) continue;
  const big = (p.w ?? 0) >= 1;
  SEATS[p.id] = big ? 1 : 0.6;
  if (/bar_|prancheta/.test(p.id)) SEAT_H[p.id] = 0.78;
  else if (lounge) SEAT_H[p.id] = 0.42;
}

// sofás e poltronas do catálogo antigo
for (const k of ["sofa", "sofa_plain", "p_sofa_l", "p_lounge"]) {
  SEATS[k] = 1;
  SEAT_H[k] = 0.42;
}

export class Avatar {
  root = new THREE.Group();
  body = new THREE.Group();
  char!: Character;
  label: HTMLDivElement;
  bubble: HTMLDivElement;
  statusEl: HTMLDivElement;
  nameEl: HTMLDivElement;
  recEl: HTMLDivElement;
  recording = false;
  ring: THREE.Mesh;
  target = new THREE.Vector3();
  targetDir = 0;
  moving = false;
  phase = Math.random() * 10;
  speaking = false;
  /** Falando (animação de conversa), mesmo que eu não esteja ouvindo. */
  talking = false;
  running = false;
  look: Look;
  extra: any = {};
  emoteEl: HTMLDivElement;
  activityEl: HTMLDivElement;
  private emote: { name: string; until: number; start: number; dur: number; nextFx: number; n: number } | null = null;
  /** Partículas dos emotes: ícones de traço (DOM) e cubinhos (confete, vapor, chamas, gotas). */
  private fx: { o: THREE.Object3D; v: THREE.Vector3; age: number; life: number; g: number; spin: number; el?: HTMLElement }[] = [];
  private talkPhase = Math.random() * 10;
  /** Jogando sinuca (extra.pool): mirando ou esperando a vez, força e hora da última tacada. */
  pool: { aim: boolean; pow: number; shotAt: number } | null = null;
  private cueObj: THREE.Object3D | null = null;
  private poolAmt = 0;
  /** Intensidade dos gestos de conversa (0..1): sobe rápido e desce devagar quando a fala acaba. */
  private talkAmt = 0;
  private holdObj: THREE.Object3D | null = null;
  holding: string | null = null;
  private holiday: Holiday | null = null;
  /** Para sons de passo dos outros: posição anterior e ritmo. */
  /** Sentado numa cadeira (o meu vem do mundo, o dos outros vem da rede em extra.sit). */
  sitting = false;
  /** Altura do assento em que estou/está sentado (m). */
  seatY = SEAT_Y;
  /** 0 = em pé, 1 = sentado: anda aos poucos para o gesto de sentar/levantar ser animado. */
  sitT = 0;
  private hipY = -1;
  /** true no quadro em que um pé toca o chão (para o som do passo). */
  footfall = false;
  private lastFoot = 0;
  private lastTarget = new THREE.Vector3();
  private lastTargetAt = 0;
  private netSpeed = 0;

  constructor(public info: PeerInfo, private isMe: boolean) {
    this.look = normalizeLook(info.look, info.color);
    this.root.add(this.body);
    // escala real em relação aos móveis: ~1,45 m (cabeça grande de jogo, mas cabe na cadeira e na mesa)
    this.body.scale.setScalar(AVATAR_SCALE);
    this.setLook(this.look);

    // sombra redonda no chão (estilo jogo 2D)
    this.ring = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.scale.set(1, 0.7, 1);
    this.ring.position.y = 0.015;
    this.root.add(this.ring);

    this.label = document.createElement("div");
    this.label.className = "nameplate" + (isMe ? " me" : "");
    this.bubble = document.createElement("div");
    this.bubble.className = "bubble hidden";
    this.nameEl = document.createElement("div");
    this.nameEl.className = "plate";
    this.nameEl.innerHTML = `<span class="mic">${icon("mic", 12, 2.4)}</span><span class="nm"></span>`;
    this.nameEl.querySelector(".nm")!.textContent = info.name;
    this.statusEl = document.createElement("div");
    this.statusEl.className = "status";
    this.recEl = document.createElement("div");
    this.recEl.className = "rec-badge";
    this.recEl.textContent = "Gravando";
    this.emoteEl = document.createElement("div");
    this.emoteEl.className = "emote-pop hidden";
    this.activityEl = document.createElement("div");
    this.activityEl.className = "activity-tag hidden";
    this.label.append(this.emoteEl, this.bubble, this.nameEl, this.statusEl, this.activityEl, this.recEl);
    const lbl = new CSS2DObject(this.label);
    lbl.position.set(0, 1.38, 0);
    lbl.center.set(0.5, 1);
    this.root.add(lbl);

    this.setStatus(info.status);
    this.root.position.set(info.x, 0, info.z);
    this.target.copy(this.root.position);
    this.lastTarget.copy(this.target);
    this.root.userData.peerId = info.id;
    if (info.extra) this.applyExtra(info.extra);
  }

  /** Estado extra vindo da rede (atividade, item na mão, câmera...). */
  applyExtra(patch: any) {
    for (const [k, v] of Object.entries(patch ?? {})) {
      if (v === null) delete this.extra[k];
      else this.extra[k] = v;
    }
    this.setHold(this.extra.hold ?? null);
    const act = this.extra.activity;
    this.activityEl.classList.toggle("hidden", !act?.app);
    if (act?.app) {
      const kind = appKind(act.app, act.title);
      const txt = activityText(act);
      if (this.activityEl.dataset.k !== kind + txt) {
        this.activityEl.dataset.k = kind + txt;
        this.activityEl.className = `activity-tag ak-${kind}`;
        this.activityEl.innerHTML = `<i class="ak">${icon(APP_KINDS[kind].ic, 11, 2.4)}</i><span></span>`;
        this.activityEl.querySelector("span")!.textContent = txt;
      }
    }
    this.label.classList.toggle("cam-on", !!this.extra.cam);
    if (!this.isMe) {
      this.sitting = !!this.extra.sit;
      this.seatY = typeof this.extra.sit === "number" && this.extra.sit > 0.2 ? this.extra.sit : SEAT_Y;
    }
    this.setPool(this.extra.pool ?? null);
  }

  /** Taco na mão enquanto joga sinuca. */
  setPool(p: { aim: boolean; pow: number; shotAt: number } | null) {
    this.pool = p ? { aim: !!p.aim, pow: Number(p.pow) || 0, shotAt: Number(p.shotAt) || 0 } : null;
    if (this.pool && !this.cueObj) {
      this.cueObj = cueMesh();
      this.body.add(this.cueObj);
    } else if (!this.pool && this.cueObj) {
      this.cueObj.removeFromParent();
      this.cueObj = null;
      this.poolAmt = 0;
    }
    if (this.holdObj) this.holdObj.visible = !this.pool;
  }

  /**
   * Pose de sinuca: mirando, o personagem se debruça na mesa com a mão de apoio na frente e
   * o taco puxa para trás conforme a força; na tacada o taco vai à frente e volta.
   * Esperando a vez, fica em pé com o taco apoiado no chão.
   */
  private poolPose(c: Character, _t: number) {
    const p = this.pool!;
    const cue = this.cueObj!;
    this.poolAmt += ((p.aim ? 1 : 0) - this.poolAmt) * 0.12;
    const k = this.poolAmt;
    // tacada: vai rápido à frente (0,1 s), segura e volta devagar
    const since = (Date.now() - p.shotAt) / 1000;
    let stroke = 0;
    if (since >= 0 && since < 0.9) stroke = since < 0.1 ? since / 0.1 : Math.max(0, 1 - (since - 0.1) / 0.8);
    const pull = p.aim ? p.pow : 0;
    const off = -0.32 * pull + 0.38 * stroke;
    // em pé (k=0) -> debruçado (k=1)
    c.root.rotation.set(0.42 * k, 0, 0);
    c.legL.rotation.set(0.25 * k, 0, 0);
    c.legR.rotation.set(-0.3 * k, 0, 0);
    c.armL.rotation.set(-1.45 * k - 0.1, 0, 0.3 * k);
    c.armR.rotation.set((-0.35 + off * 1.4) * k + -0.6 * (1 - k), 0, -0.12 * k);
    c.head.rotation.set(-0.25 * k, 0, 0);
    // taco: deitado e apontando para a frente (k=1) ou em pé ao lado do corpo (k=0)
    cue.position.set(0.12 * k + 0.32 * (1 - k), 0.98 * k + 0.95 * (1 - k), (0.1 + off) * k + 0.08 * (1 - k));
    cue.rotation.set(0.1 * k + -1.38 * (1 - k), 0, 0);
  }

  setHoliday(h: Holiday | null) {
    this.holiday = h;
    this.setLook(this.look);
  }

  setHold(kind: string | null) {
    if (kind === this.holding) return;
    this.holding = kind;
    this.holdObj?.removeFromParent();
    this.holdObj = null;
    if (kind && HOLD_ITEMS[kind]) {
      this.holdObj = holdMesh(kind);
      this.char.hand.add(this.holdObj);
    }
  }

  /** Quanto ainda tem na mão (1 = cheio), pelo horário em que acaba (vale para todos verem). */
  private updateHoldLevel() {
    const fill = this.holdObj?.userData.fill as ((lv: number) => void) | undefined;
    const end = Number(this.extra.holdEnd);
    const dur = Number(this.extra.holdDur);
    if (!fill || !end || !dur) return;
    fill(THREE.MathUtils.clamp((end - Date.now()) / dur, 0, 1));
  }

  playEmote(name: string) {
    const e = EMOTES.find((x) => x[0] === name);
    if (!e) return;
    const dur = EMOTE_DUR[name] ?? 2.6;
    const now = performance.now();
    this.emote = { name, start: now, dur, until: now + dur * 1000, nextFx: 0, n: 0 };
    this.emoteEl.innerHTML = icon(e[1], 24, 2.2);
    this.emoteEl.style.setProperty("--emo", e[3]);
    this.emoteEl.style.animationDuration = `${dur}s`;
    this.emoteEl.classList.remove("hidden");
    this.emoteEl.classList.remove("pop");
    void this.emoteEl.offsetWidth;
    this.emoteEl.classList.add("pop");
  }

  /** Partículas de cada emote, soltas no tempo certo. */
  private emoteFx(k: string, tt: number) {
    const em = this.emote!;
    if (tt < em.nextFx) return;
    const every = (s: number) => {
      em.nextFx = tt + s;
    };
    const once = (at: number, f: () => void) => {
      if (tt < at) {
        em.nextFx = at;
        return;
      }
      f();
      em.nextFx = 999;
    };
    switch (k) {
      case "acenar":
        return once(0.3, () => this.emitIcon("sparkles", "#C8F501", 2));
      case "joinha":
        return once(0.35, () => {
          this.emitIcon("sparkles", "#5ec8ff", 2);
          this.emitCubes(10, ["#5ec8ff", "#C8F501", "#ffffff"], 2.2);
        });
      case "palmas":
        this.emitIcon("sparkles", "#ffd35c", 1);
        return every(0.35);
      case "rir":
        this.emitIcon("laugh", "#ffd35c", 1);
        return every(0.6);
      case "coracao":
        this.emitIcon("heart", "#ff7aa8", 1, true);
        return every(0.3);
      case "danca":
        this.emitIcon("music", Math.random() > 0.5 ? "#a48ce0" : "#C8F501", 1);
        return every(0.42);
      case "pular":
        this.emitCubes(26, ["#C8F501", "#ff7aa8", "#5ec8ff", "#ffd35c", "#ffffff"], 3.2);
        return every(1.35);
      case "pensar":
        return once(1.7, () => {
          this.emitIcon("lightbulb", "#ffd35c", 1, true, 1.2);
          this.emitCubes(8, ["#ffd35c", "#ffffff"], 1.6);
        });
      case "cafe":
        this.emitSteam(["#ffffff", "#e8e2d6"], 0.35);
        return every(0.25);
      case "fogo":
        this.emitSteam(["#ff8a3d", "#ffd35c", "#ff5a65"], 0.9, true);
        if (tt < 0.15) this.emitIcon("flame", "#ff8a3d", 1, true);
        return every(0.12);
      case "surpresa":
        return once(0.1, () => {
          this.emitIcon("zap", "#5ec8ff", 1, true, 0.9);
          this.emitCubes(10, ["#5ec8ff", "#ffffff"], 2.4);
        });
      case "triste":
        this.emitDrop();
        return every(0.28 + Math.random() * 0.2);
      case "dormir":
        this.emitText("z", "#a48ce0");
        return every(0.75);
      case "sim":
        return once(0.3, () => this.emitIcon("check", "#27ae60", 1, true));
      case "nao":
        return once(0.3, () => this.emitIcon("x", "#ff5a65", 1, true));
    }
  }

  private addFx(o: THREE.Object3D, v: THREE.Vector3, life: number, g = 0, spin = 0, el?: HTMLElement) {
    this.root.add(o);
    this.fx.push({ o, v, age: 0, life, g, spin, el });
    // limite para não pesar com muita gente usando emote ao mesmo tempo
    while (this.fx.length > 60) this.killFx(this.fx.shift()!);
  }
  private killFx(p: { o: THREE.Object3D; el?: HTMLElement }) {
    p.o.removeFromParent();
    p.el?.remove();
  }
  /** Ícone de traço subindo e sumindo (corações, notas, ideia...). */
  private emitIcon(ic: string, color: string, n = 1, big = false, life = 1.5) {
    for (let i = 0; i < n; i++) {
      const el = document.createElement("div");
      el.className = "emote-fx" + (big ? " big" : "");
      el.style.color = color;
      el.innerHTML = `<i>${icon(ic, big ? 22 : 15, 2.4)}</i>`;
      const o = new CSS2DObject(el);
      o.position.set((Math.random() - 0.5) * 0.7, 1.75 + Math.random() * 0.2, (Math.random() - 0.5) * 0.3);
      this.addFx(o, new THREE.Vector3((Math.random() - 0.5) * 0.35, big ? 0.55 : 0.85 + Math.random() * 0.35, 0), life, 0, 0, el);
    }
  }
  private emitText(txt: string, color: string) {
    const el = document.createElement("div");
    el.className = "emote-fx zz";
    el.style.color = color;
    el.innerHTML = "<i></i>";
    el.firstElementChild!.textContent = txt;
    const o = new CSS2DObject(el);
    o.position.set(0.2, 1.7, 0);
    this.addFx(o, new THREE.Vector3(0.25, 0.5, 0), 2.2, 0, 0, el);
  }
  /** Confete em cubinhos (voxel, como o resto do mundo). */
  private emitCubes(n: number, colors: string[], speed: number) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo.box(0.06, 0.06, 0.06), fxMat(colors[i % colors.length]));
      m.position.set((Math.random() - 0.5) * 0.3, 1.6, (Math.random() - 0.5) * 0.3);
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * speed * 0.35, speed * (0.6 + Math.random() * 0.5), Math.sin(a) * speed * 0.35);
      this.addFx(m, v, 1.4 + Math.random() * 0.4, -7, (Math.random() - 0.5) * 14);
    }
  }
  /** Vapor (café) ou chamas (mandou bem): sobe devagar e some. */
  private emitSteam(colors: string[], speed: number, fromHand = false) {
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(geo.box(0.05, 0.05, 0.05), fxMat(colors[Math.floor(Math.random() * colors.length)]));
      m.position.set(0.25 + (Math.random() - 0.5) * 0.1, fromHand ? 1.75 : 1.25, 0.15 + (Math.random() - 0.5) * 0.1);
      this.addFx(m, new THREE.Vector3((Math.random() - 0.5) * 0.15, speed * (0.7 + Math.random() * 0.5), 0), 0.9, 0, 3);
    }
  }
  /** Gota de chuva da nuvem de tristeza. */
  private emitDrop() {
    const m = new THREE.Mesh(geo.box(0.035, 0.08, 0.035), fxMat("#5ec8ff"));
    m.position.set((Math.random() - 0.5) * 0.5, 2.15, (Math.random() - 0.5) * 0.3);
    this.addFx(m, new THREE.Vector3(0, -0.6, 0), 0.75, -4);
  }
  private updateFx(dt: number) {
    if (!this.fx.length) return;
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const p = this.fx[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.killFx(p);
        this.fx.splice(i, 1);
        continue;
      }
      p.v.y += p.g * dt;
      p.o.position.addScaledVector(p.v, dt);
      if (p.spin) p.o.rotation.y += p.spin * dt;
      const k = p.age / p.life;
      const fade = 1 - k * k;
      if (p.el) {
        p.el.style.opacity = String(fade);
        p.el.style.setProperty("--s", String(0.6 + Math.min(1, p.age * 6) * 0.5));
      } else p.o.scale.setScalar(Math.max(0.2, fade));
    }
  }

  setLook(look: any) {
    this.look = normalizeLook(look, this.info.color);
    this.info.look = this.look;
    if (this.char) this.body.remove(this.char.root);
    // skin da data especial (gorro de Natal, chapéu de bruxa...) por cima do visual escolhido
    const shown = { ...this.look };
    if (this.holiday && this.look.eventSkin !== false) {
      if (this.holiday.head) shown.head = this.holiday.head;
      if (this.holiday.face) shown.face = this.holiday.face;
    }
    this.char = buildCharacter(shown);
    this.hipY = -1;
    this.body.add(this.char.root);
    if (this.holding) {
      const h = this.holding;
      this.holding = null;
      this.setHold(h);
    }
  }

  setStatus(s: string) {
    this.info.status = s;
    const kind = statusKind(s);
    this.statusEl.className = `status st-${kind}`;
    this.statusEl.innerHTML = `<i class="sk">${icon(STATUS_KINDS[kind].ic, 11, 2.4)}</i><span></span>`;
    this.statusEl.querySelector("span")!.textContent = s;
    this.statusEl.style.display = s ? "" : "none";
  }

  setRecording(v: boolean) {
    this.recording = v;
    this.label.classList.toggle("recording", v);
  }

  setMuted(v: boolean) {
    this.label.classList.toggle("muted", v);
    this.nameEl.querySelector(".mic")!.innerHTML = icon(v ? "mic-off" : "mic", 12, 2.4);
  }

  setSpeaking(v: boolean) {
    if (v === this.speaking) return;
    this.speaking = v;
    this.label.classList.toggle("speaking", v);
  }

  update(dt: number, interpolate: boolean) {
    if (interpolate) {
      this.root.position.lerp(this.target, Math.min(1, dt * 12));
      let d = this.targetDir - this.body.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.body.rotation.y += d * Math.min(1, dt * 12);
    }
    if (interpolate) {
      // estima se a pessoa está correndo pela velocidade
      const now = performance.now();
      if (!this.target.equals(this.lastTarget)) {
        const dtt = (now - this.lastTargetAt) / 1000;
        if (dtt > 0.02 && dtt < 1) {
          // média suavizada + histerese: um pacote atrasado não troca andar/correr
          const v = this.target.distanceTo(this.lastTarget) / dtt;
          this.netSpeed += (Math.min(v, 12) - this.netSpeed) * 0.35;
          if (!this.running && this.netSpeed > 6.0) this.running = true;
          else if (this.running && this.netSpeed < 5.0) this.running = false;
        }
        this.lastTarget.copy(this.target);
        this.lastTargetAt = now;
      }
      if (!this.moving) {
        this.running = false;
        this.netSpeed = 0;
      }
    }
    const c = this.char;
    const pace = this.running ? 17 : 11;
    this.phase += dt * (this.moving ? pace : 2);
    // o pé toca o chão quando a perna chega no ponto mais aberto do passo (4 quadros por passo)
    this.footfall = false;
    if (this.moving) {
      const foot = Math.floor((this.phase - Math.PI / 2 + 0.72) / Math.PI);
      if (foot !== this.lastFoot) {
        this.footfall = true;
        this.lastFoot = foot;
      }
    } else this.lastFoot = Math.floor((this.phase - Math.PI / 2 + 0.72) / Math.PI);
    const stepped = this.moving ? Math.round(Math.sin(this.phase) * 2) / 2 : 0;
    this.body.position.y = this.moving ? Math.abs(stepped) * (this.running ? 0.09 : 0.05) : 0;
    const sw = stepped * (this.running ? 0.9 : 0.6);
    c.legL.rotation.set(sw, 0, 0);
    c.legR.rotation.set(-sw, 0, 0);
    c.armL.rotation.set(-sw * 0.8, 0, 0);
    c.armR.rotation.set(sw * 0.8, 0, 0);
    c.head.rotation.set(0, 0, 0);
    c.root.rotation.set(this.running && this.moving ? 0.12 : 0, 0, 0);
    // sentar/levantar animado: o corpo desce dobrando as pernas em ~0,3 s (e o contrário ao levantar)
    const wantSit = this.sitting && !this.moving ? 1 : 0;
    this.sitT += (wantSit - this.sitT) * Math.min(1, dt * (wantSit ? 9 : 12));
    if (Math.abs(this.sitT - wantSit) < 0.01) this.sitT = wantSit;
    if (this.sitT > 0) {
      const k = this.sitT;
      const e = k * k * (3 - 2 * k); // suaviza começo e fim
      // altura do quadril em pé (medida uma vez por visual) para encaixar no assento
      if (this.hipY < 0) {
        const by = this.body.position.y;
        this.body.position.y = 0;
        this.root.updateMatrixWorld(true);
        const v = new THREE.Vector3();
        c.legL.getWorldPosition(v);
        this.hipY = v.y - this.root.position.y;
        this.body.position.y = by;
      }
      const standY = this.body.position.y;
      const sitY = this.seatY - this.hipY + 0.04;
      // no meio do gesto o corpo dobra um pouco para a frente (como quem senta de verdade)
      const lean = Math.sin(e * Math.PI) * 0.22;
      this.body.position.y = standY + (sitY - standY) * e;
      c.legL.rotation.set(c.legL.rotation.x + (-1.5 - c.legL.rotation.x) * e, 0, 0);
      c.legR.rotation.set(c.legR.rotation.x + (-1.5 - c.legR.rotation.x) * e, 0, 0);
      c.armL.rotation.set(c.armL.rotation.x + (-0.45 - c.armL.rotation.x) * e, 0, 0);
      c.armR.rotation.set(c.armR.rotation.x + (-0.45 - c.armR.rotation.x) * e, 0, 0);
      c.root.rotation.set(lean, 0, 0);
    }
    // fala: liga em ~0,15 s e apaga em ~0,8 s
    this.talkAmt += ((this.talking ? 1 : 0) - this.talkAmt) * Math.min(1, dt * (this.talking ? 7 : 2.2));
    const mouth = c.head.getObjectByName("mouth");
    // a boca é um voxel em que o tamanho fica na escala: anima em cima da altura original
    if (mouth && mouth.userData.h === undefined) mouth.userData.h = mouth.scale.y;
    const mouthH = (mouth?.userData.h as number) ?? 0.025;
    if (mouth) mouth.scale.y = mouthH;

    const now = performance.now();
    const t = now / 1000;
    if (this.emote && now > this.emote.until) {
      this.emote = null;
      this.emoteEl.classList.add("hidden");
    }
    this.updateFx(dt);
    if (this.emote) {
      const k = this.emote.name;
      const tt = (now - this.emote.start) / 1000;
      const dur = this.emote.dur;
      const ss = (x: number) => {
        const v = THREE.MathUtils.clamp(x, 0, 1);
        return v * v * (3 - 2 * v);
      };
      // entra e sai suave (sem "pular" de pose)
      const e = ss(tt / 0.25) * ss((dur - tt) / 0.35);
      const P = (o: THREE.Object3D, x: number, y: number, z: number) => o.rotation.set(o.rotation.x + (x - o.rotation.x) * e, o.rotation.y + (y - o.rotation.y) * e, o.rotation.z + (z - o.rotation.z) * e);
      const seated = this.sitT > 0.5;
      const lift = (y: number) => {
        if (!seated) this.body.position.y += y * e;
      };
      const legs = (l: number, r: number) => {
        if (seated) return;
        P(c.legL, l, 0, 0);
        P(c.legR, r, 0, 0);
      };
      this.emoteFx(k, tt);
      if (k === "acenar") {
        P(c.armR, 0, 0, 2.5 + Math.sin(t * 12) * 0.38);
        P(c.armL, 0, 0, -0.15);
        P(c.head, 0, 0.15, -0.12);
        P(c.root, 0, 0, Math.sin(t * 6) * 0.06);
      } else if (k === "joinha") {
        const pump = tt < 0.6 ? Math.sin((tt / 0.6) * Math.PI) * 0.5 : 0;
        P(c.armR, -1.5 - pump, 0, 0.15);
        P(c.armL, -0.2, 0, -0.1);
        P(c.head, Math.sin(t * 8) * 0.1, 0, 0.08);
        lift(tt < 0.4 ? Math.sin((tt / 0.4) * Math.PI) * 0.12 : 0);
      } else if (k === "palmas") {
        const s = Math.abs(Math.sin(t * 11));
        P(c.armL, -1.35, 0, -0.6 + s * 0.5);
        P(c.armR, -1.35, 0, 0.6 - s * 0.5);
        P(c.head, -0.12, 0, 0);
        lift(s * 0.04);
      } else if (k === "rir") {
        const sh = Math.sin(t * 17);
        P(c.root, -0.2 + sh * 0.04, 0, 0);
        P(c.head, -0.32 + sh * 0.06, 0, Math.sin(t * 5) * 0.1);
        P(c.armL, -0.7, 0, -0.45 + sh * 0.08);
        P(c.armR, -0.7, 0, 0.45 - sh * 0.08);
        lift(Math.abs(sh) * 0.04);
        if (mouth) mouth.scale.y = mouthH * (1 + 2.5 * e);
      } else if (k === "coracao") {
        P(c.armL, -2.65, 0, -0.55);
        P(c.armR, -2.65, 0, 0.55);
        P(c.root, 0, 0, Math.sin(t * 3) * 0.07);
        P(c.head, -0.1, 0, Math.sin(t * 3) * 0.12);
      } else if (k === "danca") {
        const bt = t * 7;
        legs(Math.sin(bt) * 0.55, -Math.sin(bt) * 0.55);
        P(c.armL, -1.2 + Math.sin(bt) * 0.9, 0, -0.35);
        P(c.armR, -1.2 - Math.sin(bt) * 0.9, 0, 0.35);
        P(c.head, Math.sin(bt * 2) * 0.08, 0, Math.sin(bt) * 0.15);
        // giro no meio da dança
        const spin = tt > 1.8 && tt < 2.5 ? ss((tt - 1.8) / 0.7) * Math.PI * 2 : 0;
        P(c.root, 0, Math.sin(bt / 2) * 0.5 + spin, Math.sin(bt) * 0.08);
        lift(Math.abs(Math.sin(bt)) * 0.09);
      } else if (k === "pular") {
        const ph = (tt % 0.9) / 0.9;
        const air = 4 * ph * (1 - ph);
        lift(air * 0.6);
        legs(-0.7 * air, -0.7 * air);
        P(c.armL, 0, 0, -2.8 + air * 0.3);
        P(c.armR, 0, 0, 2.8 - air * 0.3);
        P(c.head, -0.2, 0, 0);
      } else if (k === "pensar") {
        const idea = tt > 1.7;
        P(c.armR, idea ? -2.9 : -2.15, 0, idea ? 0.15 : 0.7);
        P(c.armL, idea ? -0.2 : -0.95, 0, idea ? -0.1 : 0.75);
        P(c.head, idea ? -0.2 : 0.1, idea ? 0 : Math.sin(t * 1.5) * 0.25, idea ? 0 : 0.2);
        if (idea) lift(Math.max(0, Math.sin((tt - 1.7) * 6)) * 0.08);
      } else if (k === "cafe") {
        const sip = Math.max(0, Math.sin(tt * 2.2 - 1));
        P(c.armR, -1.5 - sip * 0.9, 0, 0.25);
        P(c.armL, -0.5, 0, -0.1);
        P(c.head, -sip * 0.3, 0, 0);
      } else if (k === "fogo") {
        const up = Math.sin(t * 10) > 0;
        P(c.armR, up ? -3.0 : -2.3, 0, 0.1);
        P(c.armL, -0.4, 0, -0.25);
        P(c.head, -0.15, 0, 0);
        lift(up ? 0.06 : 0);
      } else if (k === "surpresa") {
        const jump = tt < 0.5 ? Math.sin((tt / 0.5) * Math.PI) : 0;
        lift(jump * 0.3);
        P(c.root, -0.25, 0, 0);
        P(c.armL, -0.3, 0, -2.3);
        P(c.armR, -0.3, 0, 2.3);
        P(c.head, -0.28, 0, 0);
        if (mouth) mouth.scale.y = mouthH * (1 + 2.5 * e);
      } else if (k === "triste") {
        P(c.head, 0.5, 0, Math.sin(t * 1.2) * 0.08);
        P(c.root, 0.16, 0, 0);
        P(c.armL, 0.12, 0, -0.04);
        P(c.armR, 0.12, 0, 0.04);
        lift(-0.03);
      } else if (k === "dormir") {
        P(c.head, 0.55 + Math.sin(t * 1.6) * 0.08, 0, 0.25);
        P(c.root, 0.08, 0, 0.05);
        P(c.armL, 0.05, 0, -0.02);
        P(c.armR, 0.05, 0, 0.02);
        lift(Math.sin(t * 1.6) * 0.015);
      } else if (k === "sim") {
        P(c.head, Math.sin(t * 9) * 0.28, 0, 0);
        P(c.armR, -0.4, 0, 0.1);
      } else if (k === "nao") {
        P(c.head, 0, Math.sin(t * 9) * 0.5, 0);
        P(c.armL, -1.25, 0, -0.75);
        P(c.armR, -1.25, 0, 0.75);
      }
    } else if (this.pool && this.cueObj && !this.moving) {
      this.poolPose(c, t);
    } else if (this.talkAmt > 0.02 && !this.moving) {
      // gestos de conversa: mãos, cabeça e boca em movimento. Quando a fala acaba, os gestos
      // diminuem e desaceleram até parar (sem "congelar" no meio do movimento).
      const k = this.talkAmt;
      this.talkPhase += dt * (0.45 + 0.55 * k);
      const p = this.talkPhase;
      const e = k * k * (3 - 2 * k);
      const ar = c.armR.rotation;
      const al = c.armL.rotation;
      ar.set(ar.x + (-0.5 - Math.max(0, Math.sin(p * 3.1)) * 0.7 - ar.x) * e, 0, (0.15 + Math.sin(p * 1.7) * 0.2) * e);
      al.set(al.x + (-0.2 - Math.max(0, Math.sin(p * 2.3 + 1.5)) * 0.5 - al.x) * e, 0, (-0.1 - Math.sin(p * 1.3) * 0.15) * e);
      c.head.rotation.set(Math.sin(p * 4.2) * 0.08 * e, Math.sin(p * 0.9) * 0.18 * e, Math.sin(p * 1.6) * 0.05 * e);
      if (mouth) mouth.scale.y = mouthH * (1 + Math.abs(Math.sin(p * 13)) * 2.4 * (this.talking ? 1 : e * 0.5));
    } else if (this.holding && !this.moving) {
      this.updateHoldLevel();
      // gole de vez em quando
      const sip = Math.sin(t * 0.7 + this.phase) > 0.93;
      c.armR.rotation.set(sip ? -2.1 : -0.9, 0, 0.1);
    } else if (!this.moving) {
      // respiração parada
      c.head.rotation.set(Math.sin(t * 1.3 + this.phase) * 0.02, 0, 0);
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof CSS2DObject) o.element.remove();
    });
    this.root.removeFromParent();
    this.label.remove();
  }
}

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export class World {
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  labels: CSS2DRenderer;
  composer: EffectComposer;
  pixelPass: RenderPixelatedPass;
  /** Tamanho do "pixel" na tela. 3 = pixel art bem visível e leve. */
  pixelSize = 1;
  /** O andar que estou vendo (os itens e salas dele). */
  layout!: Layout;
  /** Layout completo, com todos os andares (é o que vai para o servidor). */
  fullLayout!: Layout;
  /** Andar onde eu estou (0 = térreo). Só esse andar é desenhado. */
  level = 0;
  itemGroup = new THREE.Group();
  zoneGroup = new THREE.Group();
  floor!: THREE.Mesh;
  grass?: THREE.Mesh;
  blockers: Rect[] = [];
  me!: Avatar;
  others = new Map<string, Avatar>();
  zoom = 1.3;
  camTarget = new THREE.Vector3();
  /** Quanto a pessoa arrastou o mapa para longe do personagem (zera ao andar). */
  panOffset = new THREE.Vector3();
  /** A câmera volta sozinha para o personagem depois de arrastar o mapa (ou assim que ele anda). */
  followCam = true;
  private panAt = 0;
  /** Centraliza a câmera no personagem agora. */
  recenter() {
    this.panOffset.set(0, 0, 0);
    this.panAt = 0;
  }
  keys = new Set<string>();
  path: THREE.Vector3[] = [];
  onMove?: (x: number, z: number, dir: number, moving: boolean, zone: Zone | null) => void;
  onZoneChange?: (z: Zone | null) => void;
  onFrame?: () => void;
  onFloorClick?: (p: THREE.Vector3, ev: MouseEvent) => boolean; // true = consumido (editor)
  /** Pede confirmação antes de andar até onde a pessoa clicou (o menu "Ir até lá?" fica na interface). */
  onWalkRequest?: (plan: WalkPlan, x: number, y: number) => void;
  /** Botão direito / clique em um personagem. */
  onAvatarMenu?: (id: string, x: number, y: number, isMe: boolean) => void;
  onAvatarClick?: (id: string, x: number, y: number) => void;
  /** Clique em item interativo (cozinha, painéis) fora do modo edição. */
  onItemClick?: (item: Item, x: number, y: number) => boolean;
  onStep?: (run: boolean, vol: number) => void;
  editing = false;
  /** No editor: pode arrastar o mapa agora? (não pode enquanto desenha sala ou parede) */
  canPanEdit?: () => boolean;
  env!: Environment;
  holiday: Holiday | null = null;
  decorGroup = new THREE.Group();
  hemi!: THREE.HemisphereLight;
  sun!: THREE.DirectionalLight;
  /** Velocidades (m/s). */
  walkSpeed = 4.2;
  runSpeed = 7.4;
  running = false;
  private stuck = 0;
  janitor?: Janitor;
  /** Visão do prédio inteiro (zoom out) para escolher a sala. */
  overview = false;
  /**
   * Visão: isométrica (3D diagonal), aérea (3D de cima, norte para cima) ou 2D (plano de cima,
   * cores chapadas sem luz nem sombra, com contorno, como um mapa desenhado).
   */
  view: ViewMode = "iso";
  onViewChange?: (v: ViewMode) => void;
  /** Visões vistas de cima (aérea e 2D): mesmo jeito de andar, de enquadrar e de ouvir. */
  get topDown() {
    return this.view !== "iso";
  }
  /** Opções gráficas finas (além da qualidade e do estilo). */
  gfx: GfxOptions = { shadows: true, outline: true, fps: 0, scale: 0 };
  onOverviewChange?: (on: boolean) => void;
  private savedZoom = 1.3;
  /** Caminho longo pedido pelo mapa: vai correndo. */
  private runPath = false;
  /** Onde o último clique mandou andar (para sentar ao chegar numa cadeira). */
  private walkGoal: THREE.Vector3 | null = null;
  /** Cadeira em que estou sentado (o personagem desliza até o centro dela). */
  private seatId: string | null = null;
  /** Sentei andando pelo teclado: ignora a tecla ainda apertada até soltar (senão levantava na hora). */
  private seatHold = false;
  /** Cadeira de que acabei de levantar: não senta de novo nela até sair de perto. */
  private leftSeat: string | null = null;
  /** Sentei / levantei (para avisar os outros). */
  onSit?: (on: boolean, y?: number) => void;
  /** Alguém entrou na sala onde eu estou. */
  onEnterMyRoom?: (id: string) => void;
  private wallLinks = new Map<string, WallLinks>();
  private doors: { pivots: THREE.Object3D[]; sign: number[]; x: number; z: number; zone: string; open: number; sounding?: boolean; npc?: boolean; rect?: { x0: number; x1: number; z0: number; z1: number }; lockMark?: THREE.Object3D }[] = [];
  /** Salas com a porta trancada (reunião importante) e as que eu posso abrir mesmo assim. */
  /** Telas dos computadores: animam quando alguém senta na mesa. */
  private screenFx = new ScreenFx();
  private screens: { mesh: THREE.Mesh; orig: THREE.Material; dim: THREE.Material; x: number; z: number; kind?: AppKind | null; pend?: AppKind | null; since?: number }[] = [];
  private screenScan = 0;
  private screenTick = 0;
  private screenItems = -1;
  private dimMats = new Map<THREE.Material, THREE.Material>();
  lockedZones = new Set<string>();
  /** Seu Zé tem a chave: ao montar a rota dele, porta trancada não conta como parede. */
  ignoreLocks = false;
  lockPass = new Set<string>();
  private doorLocked(zone: string) {
    return this.lockedZones.has(zone) && !this.lockPass.has(zone);
  }
  /** Porta trancada perto de mim (para "bater na porta"). */
  lockedDoorNear(r = 2.4): string | null {
    const me = this.me?.root.position;
    if (!me) return null;
    for (const dr of this.doors) if (this.doorLocked(dr.zone) && Math.hypot(me.x - dr.x, me.z - dr.z) < r) return dr.zone;
    return null;
  }
  /** Uma porta começou a abrir (distância até mim, para o som). */
  onDoorOpen?: (dist: number, npc: boolean) => void;
  /** Uma porta terminou de fechar (distância até mim, para o som). */
  onDoorClose?: (dist: number, npc: boolean) => void;
  /** Trechos de parede que estreitam o vão das portas (colisão). */
  private doorBlockers: { x0: number; x1: number; z0: number; z1: number }[] = [];
  private doorGroup = new THREE.Group();
  currentZone: Zone | null = null;
  inputEnabled = true;
  /** Joystick de toque (celular): x = direita da tela, y = para cima da tela, de -1 a 1. */
  stick = { x: 0, y: 0 };
  private lastSent = 0;
  private lastState = "";
  private ray = new THREE.Raycaster();
  private clock = new THREE.Clock();

  constructor(readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "default", stencil: false });
    // resolução cheia (HD / retina): a cara de pixel art vem dos modelos e texturas, não de baixar a resolução
    // nitidez boa sem gastar memória de vídeo à toa (2x em tela 4K passa de 100 MB só em buffers)
    // no celular a tela tem 2-3x de densidade: 1x fica borrado, então usa até 2x (tela pequena, custo baixo)
    const coarse = matchMedia("(pointer: coarse)").matches;
    this.renderer.setPixelRatio(coarse ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping; // cores exatas da paleta (pixel art)
    this.renderer.toneMappingExposure = 1.05;
    host.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "labels";
    host.appendChild(this.labels.domElement);

    // fundo escuro até o escritório carregar (antes ficava tudo verde enquanto carregava)
    this.scene.background = new THREE.Color(0x0d0d0d);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8070, 1.45);
    this.hemi = hemi;
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.35);
    this.sun = sun;
    sun.position.set(-10, 26, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = 34;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 80 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);

    this.scene.add(this.itemGroup, this.zoneGroup, this.decorGroup, this.doorGroup);
    this.env = new Environment(
      this.scene,
      hemi,
      sun,
      () => this.layout?.size ?? { w: 32, d: 22 },
      () => this.grass,
      () => foliageMaterials,
    );

    // buffers de 8 bits por canal (o padrão é 16 bits, o dobro de memória de vídeo, sem ganho visual aqui)
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType }));
    // passe de contorno em resolução cheia (pixelSize 1): linhas finas, sem pixelar a imagem
    this.pixelPass = new RenderPixelatedPass(1, this.scene, this.camera, { normalEdgeStrength: 0.08, depthEdgeStrength: 0.35 });
    this.composer.addPass(this.pixelPass);
    this.composer.addPass(new OutputPass());

    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.bindInput();
  }

  resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.labels.setSize(w, h);
    this.updateFrustum();
  }

  private updateFrustum() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const half = 9 / this.zoom;
    const aspect = w / Math.max(1, h);
    Object.assign(this.camera, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
    this.camera.updateProjectionMatrix();
  }

  // ---------- layout
  setLayout(full: Layout) {
    this.fullLayout = full;
    // o andar pode ter sido apagado: volta para o térreo
    if (this.level && !full.levels?.some((L) => L.id === this.level)) this.level = 0;
    const layout = levelView(full, this.level);
    this.layout = layout;
    (this.scene.background as THREE.Color).set(this.level ? 0xa9d6ee : 0x8fcf72);
    // CSS2DObject só tira o elemento do DOM quando ele mesmo é removido; aqui eles são netos.
    this.zoneGroup.traverse((o) => {
      if (o instanceof CSS2DObject) o.element.remove();
    });
    disposeTree(this.itemGroup);
    disposeTree(this.zoneGroup);
    this.itemGroup.clear();
    this.zoneGroup.clear();
    if (this.floor) {
      this.floor.removeFromParent();
      this.floor.geometry.dispose();
      const fm = this.floor.material as THREE.MeshToonMaterial;
      fm.map?.dispose();
    }

    setOfficeStyle(layout.style);
    const { w, d } = layout.size;
    const floorTex = this.makeFloorTexture(layout);
    // o piso termina no eixo das paredes externas (sem faixa sobrando do lado de fora)
    floorTex.repeat.set(w / (w + 1), d / (d + 1));
    floorTex.offset.set(0.5 / (w + 1), 0.5 / (d + 1));
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      toon("#ffffff", { map: floorTex }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0.002;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    if (!this.grass) {
      // gramado em volta do prédio
      const tex = pixelTexture(32, 32, (g) => {
        const r = rng(5);
        g.fillStyle = "#8fcf72";
        g.fillRect(0, 0, 32, 32);
        for (let i = 0; i < 70; i++) {
          g.fillStyle = r() > 0.5 ? "#9ad87c" : "#82c266";
          const x = Math.floor(r() * 32);
          const y = Math.floor(r() * 32);
          g.fillRect(x, y, 1, 2);
        }
        for (let i = 0; i < 6; i++) {
          g.fillStyle = "#b5e59a";
          g.fillRect(Math.floor(r() * 30), Math.floor(r() * 30), 2, 1);
        }
      }, [60, 60]);
      this.grass = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), toon("#ffffff", { map: tex }));
      this.grass.rotation.x = -Math.PI / 2;
      this.grass.receiveShadow = true;
      this.scene.add(this.grass);
    }

    this.blockers = [];
    this.computeWallLinks();
    for (const it of layout.items) this.addItemMesh(it);
    for (const z of layout.zones) this.addZoneMesh(z);
    this.buildDoors();
    if (!this.janitor) this.janitor = new Janitor(this);
    // o faxineiro fica no térreo
    if (!this.level) this.janitor.plan();
    this.janitor.avatar.root.visible = !this.level;
    // andar de cima: sem gramado em volta (só céu), para ficar claro que é outro andar
    if (this.grass) this.grass.visible = !this.level;
    this.currentZone = null;
    this.placeDecor();
    // estava sentado e a cadeira mudou de lugar ou saiu: levanta
    if (this.me?.sitting) {
      const p = this.me.root.position;
      const seat = this.seatNear(p);
      if (!seat || Math.hypot(seat.x - p.x, seat.z - p.z) > 0.3) this.standUp();
    }
    this.unstick();
  }

  /** Mudou o escritório e fiquei dentro de parede ou móvel: vou para o lugar livre mais perto. */
  private unstick() {
    const p = this.me?.root.position;
    if (!p || !this.blocked(p.x, p.z)) return;
    for (let r = 0.5; r < 8; r += 0.5)
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const x = p.x + Math.cos(a) * r;
        const z = p.z + Math.sin(a) * r;
        if (!this.blocked(x, z)) {
          p.set(x, 0, z);
          this.path = [];
          return;
        }
      }
  }

  setHoliday(h: Holiday | null) {
    this.holiday = h;
    this.me?.setHoliday(h);
    for (const a of this.others.values()) a.setHoliday(h);
    this.placeDecor();
  }

  /** Enfeites da data especial: perto da entrada, sem atrapalhar a passagem. */
  private placeDecor() {
    this.decorGroup.clear();
    if (!this.holiday || !this.layout) return;
    const { w, d } = this.layout.size;
    const sp = this.layout.spawn ?? { x: 0, z: d / 2 - 3 };
    const spots: [number, number][] = [[sp.x - 3.2, sp.z - 1.2], [sp.x + 3.2, sp.z - 1.2], [sp.x - 4.4, sp.z + 0.4], [sp.x + 4.4, sp.z + 0.4], [sp.x - 2.4, sp.z + 0.8], [sp.x + 2.4, sp.z + 0.8]];
    let i = 0;
    for (const type of this.holiday.decor) {
      if (type === "xmas_lights") {
        // pisca-pisca em cima das paredes de fora
        const cols = [0xff5a65, 0xffd35c, 0x5ec8ff, 0xc8f501];
        const geo = new THREE.SphereGeometry(0.07, 6, 5);
        let k = 0;
        for (let x = -w / 2; x <= w / 2; x += 0.7)
          for (const z of [-d / 2, d / 2]) {
            const b = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cols[k++ % 4] }));
            b.position.set(x, 1.36, z);
            b.userData.blink = k;
            this.decorGroup.add(b);
          }
        continue;
      }
      if (type === "flags") {
        const o = buildItem({ id: "decor" + i, type, x: sp.x, z: sp.z - 3, rot: 0 });
        this.decorGroup.add(o);
        continue;
      }
      const [x, z] = type === "neon_sale" ? [sp.x + 3.5, sp.z - 2.2] : spots[i++ % spots.length];
      if (this.blocked(x, z, 0.3) && type !== "gift" && type !== "egg") continue;
      this.decorGroup.add(buildItem({ id: "decor" + i, type, x, z, rot: 0 }));
    }
  }

  /**
   * Piso pintado pixel a pixel (32 px por metro):
   * madeira clara no salão, carpete nas salas privadas, cerâmica xadrez nas áreas abertas.
   */
  private makeFloorTexture(layout: Layout) {
    const { w, d } = layout.size;
    const px = 32;
    const W = (w + 1) * px;
    const H = (d + 1) * px;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    const r = rng(42);
    // tábuas de madeira clara (salão)
    g.fillStyle = "#e9cfa6";
    g.fillRect(0, 0, W, H);
    const plank = 8; // 4 tábuas por metro
    for (let j = 0, row = 0; j < H; j += plank, row++) {
      let i = -((row * 37) % 96);
      while (i < W) {
        const len = 64 + Math.floor(r() * 64);
        const tone = ["#ead3ad", "#e5c99e", "#eed8b5", "#e2c597"][Math.floor(r() * 4)];
        g.fillStyle = tone;
        g.fillRect(Math.max(0, i), j, len, plank - 1);
        g.fillStyle = "#d4b585";
        g.fillRect(Math.max(0, i), j + plank - 1, len, 1);
        if (i + len < W) g.fillRect(i + len - 1, j, 1, plank - 1);
        // veios
        g.fillStyle = "#dcbf92";
        for (let k = 0; k < 2; k++) g.fillRect(Math.max(0, i) + Math.floor(r() * len), j + 2 + Math.floor(r() * 3), 3 + Math.floor(r() * 5), 1);
        i += len;
      }
    }
    /** Aplica uma cor por cima do desenho do piso, mantendo os detalhes (tábuas, rejunte, trama). */
    const recolor = (x: number, y: number, ww: number, hh: number, hex?: string) => {
      if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return;
      const col = new THREE.Color(hex);
      const hsl = { h: 0, s: 0, l: 0 };
      col.getHSL(hsl);
      g.save();
      g.globalCompositeOperation = "color";
      g.fillStyle = hex;
      g.fillRect(x, y, ww, hh);
      // cor escura: escurece também (o modo "color" sozinho só troca o tom)
      if (hsl.l < 0.5) {
        g.globalCompositeOperation = "multiply";
        const v = Math.round(255 * Math.max(0.25, hsl.l * 1.6));
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x, y, ww, hh);
      } else if (hsl.l > 0.75) {
        g.globalCompositeOperation = "screen";
        const v = Math.round(255 * (hsl.l - 0.6));
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x, y, ww, hh);
      }
      g.restore();
    };
    const toPx = (x: number, z: number) => [Math.round((x + (w + 1) / 2) * px), Math.round((z + (d + 1) / 2) * px)];
      const paint = (floor: string, x0: number, y0: number, zw: number, zh: number) => {
      const CARPET: Record<string, [string, string, string, string]> = {
        "carpete-azul": ["#7d86c2", "#8790cb", "#737cb8", "#6870ab"],
        "carpete-verde": ["#7fae8c", "#8aba96", "#74a282", "#679676"],
        "carpete-lilas": ["#a790cf", "#b19bd8", "#9c85c4", "#8f78b8"],
        "carpete-grafite": ["#5d606c", "#666976", "#555863", "#4a4d57"],
      };
      if (CARPET[floor]) {
        const [base, hi, lo, edge] = CARPET[floor];
        g.fillStyle = base;
        g.fillRect(x0, y0, zw, zh);
        for (let y = 0; y < zh; y += 16)
          for (let x = 0; x < zw; x += 16) {
            const ox = (y / 16) % 2 ? 8 : 0;
            g.fillStyle = hi;
            g.fillRect(x0 + x + ox + 6, y0 + y + 4, 4, 1);
            g.fillRect(x0 + x + ox + 5, y0 + y + 5, 6, 1);
            g.fillRect(x0 + x + ox + 6, y0 + y + 6, 4, 1);
            g.fillStyle = lo;
            g.fillRect(x0 + x + ox + 7, y0 + y + 12, 2, 1);
          }
        g.fillStyle = edge;
        g.fillRect(x0, y0, zw, 2);
        g.fillRect(x0, y0 + zh - 2, zw, 2);
        g.fillRect(x0, y0, 2, zh);
        g.fillRect(x0 + zw - 2, y0, 2, zh);
      } else if (floor === "madeira" || floor === "madeira-escura") {
        const dark = floor === "madeira-escura";
        for (let y = 0, row = 0; y < zh; y += 8, row++) {
          let x = -((row * 29) % 80);
          while (x < zw) {
            const len = 48 + Math.floor(r() * 48);
            g.fillStyle = (dark ? ["#6e4a32", "#76503a", "#664430", "#7a553c"] : ["#b98557", "#c08d5e", "#b07c4f", "#c4935f"])[Math.floor(r() * 4)];
            g.fillRect(x0 + Math.max(0, x), y0 + y, Math.min(len, zw - Math.max(0, x)), 7);
            g.fillStyle = dark ? "#4f3424" : "#9c6c43";
            g.fillRect(x0 + Math.max(0, x), y0 + y + 7, Math.min(len, zw - Math.max(0, x)), 1);
            x += len;
            if (x < zw) g.fillRect(x0 + x - 1, y0 + y, 1, 7);
          }
        }
      } else if (floor === "porcelanato") {
        // placas grandes claras (1 m) com rejunte fino
        g.fillStyle = "#e4e2dc";
        g.fillRect(x0, y0, zw, zh);
        for (let y = 0; y < zh; y += 32)
          for (let x = 0; x < zw; x += 32) {
            g.fillStyle = (x / 32 + y / 32) % 2 ? "#e8e6e1" : "#dedcd5";
            g.fillRect(x0 + x, y0 + y, Math.min(31, zw - x), Math.min(31, zh - y));
            g.fillStyle = "#f2f1ed";
            g.fillRect(x0 + x + 4, y0 + y + 4, 6, 1);
          }
      } else if (floor === "concreto") {
        g.fillStyle = "#a9a8a4";
        g.fillRect(x0, y0, zw, zh);
        for (let k = 0; k < (zw * zh) / 40; k++) {
          g.fillStyle = r() > 0.5 ? "#b2b1ad" : "#9f9e9a";
          g.fillRect(x0 + Math.floor(r() * zw), y0 + Math.floor(r() * zh), 2, 1);
        }
        g.fillStyle = "#93928e";
        for (let y = 64; y < zh; y += 64) g.fillRect(x0, y0 + y, zw, 1);
        for (let x = 64; x < zw; x += 64) g.fillRect(x0 + x, y0, 1, zh);
      } else if (floor === "madeira-clara") {
        for (let y = 0, row = 0; y < zh; y += 8, row++) {
          let x = -((row * 31) % 80);
          while (x < zw) {
            const len = 56 + Math.floor(r() * 40);
            g.fillStyle = ["#e9cfa6", "#e3c698", "#edd5b0", "#dfc193"][Math.floor(r() * 4)];
            g.fillRect(x0 + Math.max(0, x), y0 + y, Math.min(len, zw - Math.max(0, x)), 7);
            g.fillStyle = "#c9a876";
            g.fillRect(x0 + Math.max(0, x), y0 + y + 7, Math.min(len, zw - Math.max(0, x)), 1);
            x += len;
            if (x < zw) g.fillRect(x0 + x - 1, y0 + y, 1, 7);
          }
        }
      } else if (floor === "espinha") {
        // espinha de peixe: tacos de 16 x 4 px alternando a direção
        g.fillStyle = "#8a6038";
        g.fillRect(x0, y0, zw, zh);
        const tones = ["#b98557", "#c08d5e", "#a97a4d", "#c4935f"];
        for (let by = 0; by < zh; by += 16)
          for (let bx = 0; bx < zw; bx += 16) {
            const flip = ((bx + by) / 16) % 2 === 0;
            for (let k = 0; k < 4; k++) {
              g.fillStyle = tones[Math.floor(r() * 4)];
              if (flip) g.fillRect(x0 + bx, y0 + by + k * 4, Math.min(16, zw - bx), Math.min(3, zh - by - k * 4));
              else g.fillRect(x0 + bx + k * 4, y0 + by, Math.min(3, zw - bx - k * 4), Math.min(16, zh - by));
            }
          }
      } else if (floor === "xadrez") {
        for (let y = 0; y < zh; y += 32)
          for (let x = 0; x < zw; x += 32) {
            g.fillStyle = (x / 32 + y / 32) % 2 ? "#23252c" : "#f1efe8";
            g.fillRect(x0 + x, y0 + y, Math.min(32, zw - x), Math.min(32, zh - y));
          }
      } else if (floor === "marmore") {
        g.fillStyle = "#ebe9e4";
        g.fillRect(x0, y0, zw, zh);
        for (let k = 0; k < (zw * zh) / 220; k++) {
          g.fillStyle = r() > 0.5 ? "#d7d4cd" : "#c9c6bf";
          const vx = x0 + Math.floor(r() * zw);
          const vy = y0 + Math.floor(r() * zh);
          for (let s = 0; s < 6 + Math.floor(r() * 8); s++) g.fillRect(vx + s, vy + Math.floor(s * 0.6), 1, 1);
        }
        g.fillStyle = "#cfccc4";
        for (let y = 0; y < zh; y += 32) g.fillRect(x0, y0 + y, zw, 1);
        for (let x = 0; x < zw; x += 32) g.fillRect(x0 + x, y0, 1, zh);
      } else if (floor === "ardosia") {
        g.fillStyle = "#3b3f48";
        g.fillRect(x0, y0, zw, zh);
        for (let y = 0; y < zh; y += 32)
          for (let x = 0; x < zw; x += 32) {
            g.fillStyle = ["#444852", "#3d414a", "#484c57"][Math.floor(r() * 3)];
            g.fillRect(x0 + x + 1, y0 + y + 1, Math.min(30, zw - x), Math.min(30, zh - y));
            g.fillStyle = "#555a66";
            g.fillRect(x0 + x + 3, y0 + y + 3, 5, 1);
          }
      } else {
        // cerâmica xadrez cinza
        for (let y = 0; y < zh; y += 16)
          for (let x = 0; x < zw; x += 16) {
            g.fillStyle = (x / 16 + y / 16) % 2 ? "#c3c6cf" : "#b5b8c2";
            g.fillRect(x0 + x, y0 + y, Math.min(16, zw - x), Math.min(16, zh - y));
            g.fillStyle = "#cfd2da";
            g.fillRect(x0 + x + 2, y0 + y + 2, 3, 1);
          }
      }
      };
    if (layout.style?.floor) paint(layout.style.floor, 0, 0, W, H);
    recolor(0, 0, W, H, layout.floorColor);
    for (const zn of layout.zones) {
      const [x0, y0] = toPx(zn.x - zn.w / 2, zn.z - zn.d / 2);
      const zw = Math.round(zn.w * px);
      const zh = Math.round(zn.d * px);
      paint(zn.floor ?? (zn.private ? "carpete-azul" : "ceramica"), x0, y0, zw, zh);
      // área aberta sem cor própria segue a cor do piso do salão
      recolor(x0, y0, zw, zh, zn.floorColor ?? (zn.private ? undefined : layout.floorColor));
    }
    // logo da VERKZ pintada no piso (discreta)
    const logo = new Path2D(LOGO_PATH);
    for (const it of layout.items.filter((i) => i.type === "floor_logo")) {
      const [cx, cy] = toPx(it.x, it.z);
      const size = 4 * px;
      g.save();
      g.translate(cx, cy);
      g.scale(size / 560, size / 560);
      g.translate(-547, -547);
      g.globalAlpha = 0.22;
      g.fillStyle = "#8a9a1e";
      g.fill(logo, "evenodd");
      g.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 8;
    return t;
  }

  private wallKey(x: number, z: number) {
    return `${Math.round(x)},${Math.round(z)}`;
  }

  /** Quais paredes encostam em quais (para desenhar paredes finas ligadas). */
  private computeWallLinks() {
    const set = new Set(this.layout.items.filter((i) => WALL_TYPES.has(i.type)).map((i) => this.wallKey(i.x, i.z)));
    this.wallLinks.clear();
    for (const it of this.layout.items) {
      if (!WALL_TYPES.has(it.type)) continue;
      const x = Math.round(it.x);
      const z = Math.round(it.z);
      this.wallLinks.set(it.id, { xp: set.has(`${x + 1},${z}`), xn: set.has(`${x - 1},${z}`), zp: set.has(`${x},${z + 1}`), zn: set.has(`${x},${z - 1}`) });
    }
  }

  /** Paredes do fundo (norte e oeste do prédio) ficam inteiras; as outras são cortadas para não tapar a vista. */
  private wallIsTall(it: Item) {
    const { w, d } = this.layout.size;
    return Math.round(it.z) === -Math.round(d / 2) || Math.round(it.x) === -Math.round(w / 2);
  }

  /** O item de pendurar está encostado numa parede inteira (do fundo)? */
  isMounted(it: Item) {
    if (!this.layout) return false;
    const W = this.layout.size.w / 2;
    const D = this.layout.size.d / 2;
    const r = ((it.rot % 360) + 360) % 360;
    return (r === 0 && it.z <= -D + 0.6) || (r === 270 && it.x <= -W + 0.6);
  }

  /** Pedestal simples para quadro solto no meio da sala. */
  private frameStand(w: number) {
    const g = new THREE.Group();
    const mat = new THREE.MeshToonMaterial({ color: 0x3a3a40 });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(geo.box(0.05, MOUNT_Y + 0.1, 0.05), mat);
      post.position.set(sx * Math.min(0.45, w * 0.3), (MOUNT_Y + 0.1) / 2, -0.06);
      const foot = new THREE.Mesh(geo.box(0.08, 0.04, 0.4), mat);
      foot.position.set(sx * Math.min(0.45, w * 0.3), 0.02, -0.06);
      post.castShadow = true;
      g.add(post, foot);
    }
    return g;
  }

  /** Levanta o personagem (ao abrir o editor ou se a cadeira dele saiu do lugar). */
  standUp() {
    if (!this.me?.sitting) return;
    this.me.sitting = false;
    this.leftSeat = this.seatId;
    this.seatId = null;
    this.onSit?.(false);
  }

  addItemMesh(it: Item) {
    if (WALL_TYPES.has(it.type)) {
      const nb = this.wallLinks.get(it.id) ?? { xp: false, xn: false, zp: false, zn: false };
      const obj = buildWall(it, nb, this.wallIsTall(it));
      this.itemGroup.add(obj);
      this.blockers.push(...wallRects(it, nb));
      return obj;
    }
    const obj = buildItem(it);
    // quadro de pendurar longe de uma parede inteira: ganha um pedestal (não fica flutuando)
    if (WALL_MOUNT.has(it.type) && !this.isMounted(it)) obj.add(this.frameStand(DEFS[it.type]?.w ?? 1));
    this.itemGroup.add(obj);
    const def = DEFS[it.type];
    if (def?.blocks) {
      const f = footprint(it);
      this.blockers.push({ x0: it.x - f.w / 2, x1: it.x + f.w / 2, z0: it.z - f.d / 2, z1: it.z + f.d / 2 });
    }
    return obj;
  }

  rebuildBlockers() {
    this.blockers = [];
    this.computeWallLinks();
    for (const it of this.layout.items) {
      if (WALL_TYPES.has(it.type)) {
        this.blockers.push(...wallRects(it, this.wallLinks.get(it.id)!));
        continue;
      }
      if (!DEFS[it.type]?.blocks) continue;
      const f = footprint(it);
      this.blockers.push({ x0: it.x - f.w / 2, x1: it.x + f.w / 2, z0: it.z - f.d / 2, z1: it.z + f.d / 2 });
    }
  }

  /**
   * Portas das salas privadas: cada vão na linha de parede da sala vira uma porta dupla de 1,3 m;
   * o que sobra do vão é fechado com parede.
   * Abrem com animação quando alguém chega perto e fecham depois.
   */
  private buildDoors() {
    this.doorGroup.clear();
    this.doors = [];
    this.doorBlockers = [];
    const walls = new Set(this.layout.items.filter((i) => WALL_TYPES.has(i.type)).map((i) => this.wallKey(i.x, i.z)));
    const has = (x: number, z: number) => walls.has(`${x},${z}`);
    const { d } = this.layout.size;
    const DOORS: Record<string, { panel: number; inset: number; glass?: boolean }> = {
      madeira: { panel: 0x9a6b45, inset: 0x6f4a2e },
      branca: { panel: 0xf1eee6, inset: 0xdad6cb },
      escura: { panel: 0x2e3139, inset: 0x1f2128 },
      verde: { panel: 0xc8f501, inset: 0x9fc400 },
      vidro: { panel: 0xa9dcf2, inset: 0x2e3139, glass: true },
    };
    const metal = new THREE.MeshToonMaterial({ color: 0xd9d4c8 });
    const seen = new Set<string>(); // um vão entre duas salas vira uma porta só
    for (const zn of this.layout.zones) {
      if (!zn.private) continue;
      const x0 = Math.round(zn.x - zn.w / 2 - 0.5);
      const x1 = Math.round(zn.x + zn.w / 2 + 0.5);
      const z0 = Math.round(zn.z - zn.d / 2 - 0.5);
      const z1 = Math.round(zn.z + zn.d / 2 + 0.5);
      // as paredes podem estar na borda de fora da sala (salas originais) ou na de dentro (salas criadas no editor)
      type Line = { alongX: boolean; fixed: number; from: number; to: number };
      // cada lado da sala tem duas linhas possíveis (borda de fora ou de dentro); vale a que tem mais parede.
      // Sem isso, numa sala estreita (ex.: Ouvidoria, 3 m) a linha de dentro "via" as paredes laterais
      // como um vão de 3 m e criava portas falsas atravessando a sala.
      const count = (ln: Line) => {
        let n = 0;
        for (let k = ln.from; k <= ln.to; k++) if (ln.alongX ? has(k, ln.fixed) : has(ln.fixed, k)) n++;
        return n;
      };
      const pick = (outer: Line, inner: Line) => (count(inner) > count(outer) ? inner : outer);
      const lines: Line[] = [
        pick({ alongX: true, fixed: z0, from: x0, to: x1 }, { alongX: true, fixed: z0 + 1, from: x0, to: x1 }),
        pick({ alongX: true, fixed: z1, from: x0, to: x1 }, { alongX: true, fixed: z1 - 1, from: x0, to: x1 }),
        pick({ alongX: false, fixed: x0, from: z0, to: z1 }, { alongX: false, fixed: x0 + 1, from: z0, to: z1 }),
        pick({ alongX: false, fixed: x1, from: z0, to: z1 }, { alongX: false, fixed: x1 - 1, from: z0, to: z1 }),
      ];
      for (const ln of lines) {
        const at = (k: number) => (ln.alongX ? has(k, ln.fixed) : has(ln.fixed, k));
        let k = ln.from;
        while (k <= ln.to) {
          if (at(k)) {
            k++;
            continue;
          }
          let e = k;
          while (e + 1 <= ln.to && !at(e + 1)) e++;
          // vão de verdade: parede dos dois lados, até 3 m
          if (k > ln.from && e < ln.to && at(k - 1) && at(e + 1) && e - k + 1 <= 3 && !seen.has(`${ln.alongX ? (k + e) / 2 : ln.fixed},${ln.alongX ? ln.fixed : (k + e) / 2}`)) {
            seen.add(`${ln.alongX ? (k + e) / 2 : ln.fixed},${ln.alongX ? ln.fixed : (k + e) / 2}`);
            // o vão vai da face de um pilar até a do outro (as paredes vizinhas terminam no pilar)
            const width = e - k + 1 + 1 - WALL_T;
            const cx = ln.alongX ? (k + e) / 2 : ln.fixed;
            const cz = ln.alongX ? ln.fixed : (k + e) / 2;
            const tall = ln.alongX ? ln.fixed === -Math.round(d / 2) : ln.fixed === -Math.round(this.layout.size.w / 2);
            const h = tall ? 2.15 : WALL_CUT + 0.35;
            // porta dupla de tamanho fixo; o resto do vão vira parede (mesmo acabamento)
            const open = Math.min(width, DOOR_W);
            const fill = (width - open) / 2;
            const frame = new THREE.Group();
            frame.position.set(cx, 0, cz);
            if (!ln.alongX) frame.rotation.y = Math.PI / 2;
            this.doorGroup.add(frame);
            const wallH = tall ? WALL_H : WALL_CUT;
            for (const s of [-1, 1]) {
              if (fill > 0.02) {
                const seg = wallSegment(fill + 0.02, wallH);
                seg.position.x = s * (open / 2 + fill / 2);
                frame.add(seg);
                // colisão do trecho de parede
                const a = open / 2;
                const b = width / 2 + 0.02;
                const t = (WALL_T + 0.06) / 2;
                const lo = s < 0 ? -b : a;
                const hi = s < 0 ? -a : b;
                this.doorBlockers.push(
                  ln.alongX ? { x0: cx + lo, x1: cx + hi, z0: cz - t, z1: cz + t } : { x0: cx - t, x1: cx + t, z0: cz + lo, z1: cz + hi },
                );
              }
              const jamb = doorJamb(tall ? h : Math.max(h, wallH));
              jamb.position.x = s * (open / 2 + 0.03);
              frame.add(jamb);
            }
            // verga em cima da porta (só nas paredes inteiras)
            if (tall) frame.add(wallSegment(open + 0.12, WALL_H - h, h, false));
            const leafW = open / 2 - 0.01;
            const tt = (WALL_T + 0.06) / 2;
            const ds = DOORS[zn.door ?? officeStyle().door ?? "madeira"] ?? DOORS.madeira;
            const wood = ds.glass ? new THREE.MeshToonMaterial({ color: ds.panel, transparent: true, opacity: 0.45 }) : new THREE.MeshToonMaterial({ color: ds.panel });
            const woodDark = new THREE.MeshToonMaterial({ color: ds.inset });
            // cadeado vermelho dos dois lados (aparece com a porta trancada)
            const lockMark = new THREE.Group();
            const lockRed = new THREE.MeshToonMaterial({ color: 0xc0392b });
            for (const fz of [-1, 1]) {
              const body = new THREE.Mesh(geo.box(0.16, 0.13, 0.04), lockRed);
              body.position.set(0, Math.min(1.25, h * 0.62), fz * 0.07);
              const shackle = new THREE.Mesh(geo.box(0.1, 0.08, 0.03), metal);
              shackle.position.set(0, Math.min(1.25, h * 0.62) + 0.1, fz * 0.07);
              lockMark.add(body, shackle);
            }
            lockMark.visible = false;
            frame.add(lockMark);
            const door = {
              pivots: [] as THREE.Object3D[],
              sign: [] as number[],
              x: cx,
              z: cz,
              zone: zn.id,
              open: 0,
              sounding: false,
              lockMark,
              rect: ln.alongX ? { x0: cx - open / 2, x1: cx + open / 2, z0: cz - tt, z1: cz + tt } : { x0: cx - tt, x1: cx + tt, z0: cz - open / 2, z1: cz + open / 2 },
            };
            for (const side of [-1, 1]) {
              const pivot = new THREE.Group();
              pivot.position.set(side * (open / 2), 0, 0);
              const leaf = new THREE.Group();
              const panel = new THREE.Mesh(geo.box(leafW, h, 0.06), wood);
              panel.position.set(0, h / 2, 0);
              panel.castShadow = true;
              // duas almofadas (detalhe de porta de madeira)
              // vidro: no lugar das almofadas, uma barra no meio e um rodapé escuros; as outras: almofadas
              const insetTop = new THREE.Mesh(ds.glass ? geo.box(leafW, 0.06, 0.075) : geo.box(leafW * 0.62, h * 0.32, 0.075), woodDark);
              insetTop.position.set(0, ds.glass ? h * 0.55 : h * 0.7, 0);
              const insetLow = new THREE.Mesh(ds.glass ? geo.box(leafW, h * 0.2, 0.075) : geo.box(leafW * 0.62, h * 0.24, 0.075), woodDark);
              insetLow.position.set(0, ds.glass ? h * 0.1 : h * 0.28, 0);
              const handle = new THREE.Mesh(geo.box(0.05, 0.16, 0.12), metal);
              handle.position.set(-side * (leafW / 2 - 0.08), Math.min(1.0, h * 0.55), 0);
              leaf.add(panel, insetTop, insetLow, handle);
              // a folha vai da dobradiça para o meio do vão
              leaf.position.set(-side * (leafW / 2), 0, 0);
              pivot.add(leaf);
              frame.add(pivot);
              door.pivots.push(pivot);
              door.sign.push(side);
            }
            this.doors.push(door);
          }
          k = e + 1;
        }
      }
    }
  }

  /** Acha as telas dos computadores (de novo quando os móveis mudam). */
  private scanScreens() {
    for (const sc of this.screens) if (sc.mesh.material !== sc.orig) sc.mesh.material = sc.orig;
    this.screens = [];
    const set = new Set(SCREEN_MATS);
    const v = new THREE.Vector3();
    this.itemGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material) || !set.has(m.material)) return;
      let dim = this.dimMats.get(m.material);
      if (!dim) {
        // tela em espera: a mesma imagem bem apagada
        const src = m.material as THREE.MeshToonMaterial;
        const d = src.clone();
        d.color = new THREE.Color(0.32, 0.34, 0.4);
        d.userData.shared = true;
        dim = d;
        this.dimMats.set(m.material, d);
      }
      m.getWorldPosition(v);
      this.screens.push({ mesh: m, orig: m.material, dim, x: v.x, z: v.z });
    });
  }

  /** Alguém sentado perto da tela: ela liga e mostra o app que a pessoa usa; sem ninguém, fica em espera. */
  /** Animação dos itens do pacote novo (câmera varre, impressora imprime, LED pisca...). */
  /** Itens ligados à força (caixa de som tocando): item id -> true. Definido pelo app a cada passada do rádio. */
  playingItems: Set<string> = new Set();
  private updatePack() {
    const nowMs = performance.now();
    const t = nowMs / 1000;
    for (const o of this.itemGroup.children) {
      const u = o.userData;
      if (u.ptick && o.children[0]) u.ptick(o.children[0], t, nowMs < u.pon || this.playingItems.has(u.itemId));
    }
  }

  private updateScreens() {
    const now = performance.now();
    if (now - this.screenTick < 125) return;
    this.screenTick = now;
    const n = this.itemGroup.children.length;
    if (n !== this.screenItems || now - this.screenScan > 5000) {
      this.screenItems = n;
      this.screenScan = now;
      this.scanScreens();
    }
    if (!this.screens.length) return;
    const seated: { x: number; z: number; kind: AppKind }[] = [];
    for (const a of [this.me, ...this.others.values()]) {
      if (!a || !a.sitting || (a !== this.me && !this.sameLevel(a))) continue;
      const act = a.extra?.activity;
      seated.push({ x: a.root.position.x, z: a.root.position.z, kind: act?.app ? appKind(act.app, act.title) : "work" });
    }
    for (const sc of this.screens) {
      let seen: AppKind | null = null;
      let best = 1.15; // só a tela de quem está sentado ali (antes pegava as mesas vizinhas)
      for (const p of seated) {
        const dd = Math.hypot(p.x - sc.x, p.z - sc.z);
        if (dd < best) {
          best = dd;
          seen = p.kind;
        }
      }
      // o app só troca depois de 2,5 s estável: o título da janela muda toda hora e a tela ficava piscando
      if (sc.kind === undefined || seen === null || sc.kind === null) {
        sc.kind = seen;
        sc.pend = seen;
      } else if (seen !== sc.kind) {
        if (sc.pend !== seen) {
          sc.pend = seen;
          sc.since = now;
        } else if (now - (sc.since ?? now) > 2500) sc.kind = seen;
      } else sc.pend = seen;
      const want = sc.kind ? this.screenFx.get(sc.kind) : sc.dim;
      if (sc.mesh.material !== want) sc.mesh.material = want;
    }
    this.screenFx.tick();
  }

  /** Porta abre quando alguém está a menos de 1,6 m dela; fecha sozinha depois. */
  private updateDoors(dt: number) {
    if (!this.doors.length) return;
    const people = [this.me, ...[...this.others.values()].filter((a) => this.sameLevel(a))].filter(Boolean).map((a) => a!.root.position);
    const ze = !this.level && this.janitor?.avatar.root.visible ? this.janitor.avatar.root.position : null;
    for (const dr of this.doors) {
      const locked = this.lockedZones.has(dr.zone);
      if (dr.lockMark) dr.lockMark.visible = locked;
      // trancada: só abre para quem está do lado de dentro (ou tem passe)
      const human = people.some((p) => Math.hypot(p.x - dr.x, p.z - dr.z) < 1.6 && (!locked || this.zoneAt(p.x, p.z)?.id === dr.zone || (p === this.me?.root.position && !this.doorLocked(dr.zone))));
      const near = human || (!!ze && Math.hypot(ze.x - dr.x, ze.z - dr.z) < 1.6); // o Seu Zé abre até porta trancada
      // porta aberta só pelo Seu Zé: som bem baixinho (ele passa o dia abrindo porta)
      if (near && dr.open < 0.05 && !dr.sounding) dr.npc = !human;
      const target = near ? 1 : 0;
      // começou a abrir: som (mais baixo/longe não toca)
      if (target === 1 && dr.open < 0.05 && !dr.sounding) {
        dr.sounding = true;
        const me = this.me?.root.position;
        this.onDoorOpen?.(me ? Math.hypot(me.x - dr.x, me.z - dr.z) : 99, !!dr.npc);
      }
      // terminou de fechar: batida da porta
      if (target === 0 && dr.sounding && dr.open < 0.12) {
        dr.sounding = false;
        const me = this.me?.root.position;
        this.onDoorClose?.(me ? Math.hypot(me.x - dr.x, me.z - dr.z) : 99, !!dr.npc);
      }
      dr.open += (target - dr.open) * Math.min(1, dt * 6);
      const ang = dr.open * 1.75;
      dr.pivots.forEach((pv, i) => {
        const base = pv.userData.base ?? (pv.userData.base = pv.rotation.y);
        pv.rotation.y = base + dr.sign[i] * ang;
      });
    }
  }

  addZoneMesh(z: Zone) {
    const g = new THREE.Group();
    g.userData.zoneId = z.id;
    const tag = document.createElement("div");
    tag.className = "zone-tag" + (z.private ? " private" : "");
    tag.innerHTML = (z.private ? icon("lock", 11, 2.4) : "") + "<span></span>";
    tag.querySelector("span")!.textContent = z.role ? `${z.name} · ${z.role}` : z.name;
    const lbl = new CSS2DObject(tag);
    lbl.position.set(-z.w / 2 + 0.3, 0.05, -z.d / 2 + 0.4);
    lbl.center.set(0, 0);
    g.add(lbl);
    g.position.set(z.x, 0, z.z);
    this.zoneGroup.add(g);
  }

  zoneAt(x: number, z: number): Zone | null {
    if (!this.layout) return null;
    // a menor zona que contém o ponto vence (salas dentro de áreas)
    let best: Zone | null = null;
    for (const zn of this.layout.zones) {
      if (Math.abs(x - zn.x) <= zn.w / 2 && Math.abs(z - zn.z) <= zn.d / 2) {
        if (!best || zn.w * zn.d < best.w * best.d) best = zn;
      }
    }
    return best;
  }

  // ---------- avatares
  spawnMe(info: PeerInfo) {
    this.me?.dispose();
    this.me = new Avatar(info, true);
    if (this.holiday) this.me.setHoliday(this.holiday);
    this.scene.add(this.me.root);
    this.camTarget.copy(this.me.root.position);
  }

  /** A pessoa está no mesmo andar que eu? */
  sameLevel(a: Avatar) {
    return (Number(a.extra?.level) || 0) === this.level;
  }

  /** Mostra só quem está no meu andar. */
  refreshLevelVisibility() {
    for (const a of this.others.values()) a.root.visible = this.sameLevel(a);
  }

  /** Muda de andar: desenha o andar novo e põe o personagem em (x, z). */
  setLevel(lv: number, x: number, z: number) {
    this.level = lv;
    this.standUp();
    this.path = [];
    this.setLayout(this.fullLayout);
    this.me.root.position.set(x, 0, z);
    this.camTarget.copy(this.me.root.position);
    this.panOffset.set(0, 0, 0);
    this.unstick();
    this.refreshLevelVisibility();
    this.applyStyle();
  }

  addPeer(info: PeerInfo) {
    this.removePeer(info.id);
    const a = new Avatar(info, false);
    if (this.holiday) a.setHoliday(this.holiday);
    a.targetDir = info.dir;
    a.body.rotation.y = info.dir;
    this.others.set(info.id, a);
    this.scene.add(a.root);
    a.root.visible = this.sameLevel(a);
    this.applyStyle();
    return a;
  }

  removePeer(id: string) {
    const a = this.others.get(id);
    if (a) {
      a.dispose();
      this.others.delete(id);
    }
  }

  movePeer(id: string, x: number, z: number, dir: number, moving: boolean, zone: string | null) {
    const a = this.others.get(id);
    if (!a) return;
    a.target.set(x, 0, z);
    a.targetDir = dir;
    a.moving = moving;
    a.info.x = x;
    a.info.z = z;
    // entrou na sala onde eu estou (não vale o corredor/escritório aberto)
    if (zone && zone !== a.info.zone && zone === this.currentZone?.id && this.currentZone?.private) this.onEnterMyRoom?.(id);
    a.info.zone = zone;
  }

  // ---------- colisão e caminho
  blocked(x: number, z: number, r = 0.28) {
    const { w, d } = this.layout.size;
    if (Math.abs(x) > w / 2 + 0.5 - r || Math.abs(z) > d / 2 + 0.5 - r) return true;
    for (const b of this.blockers) {
      if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return true;
    }
    for (const b of this.doorBlockers) {
      if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return true;
    }
    if (this.lockedZones.size && !this.ignoreLocks)
      for (const dr of this.doors) {
        const b = dr.rect;
        if (b && this.doorLocked(dr.zone) && x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return true;
      }
    return false;
  }

  /** A* simples numa grade de 0,5 m. */
  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const step = 0.5;
    const { w, d } = this.layout.size;
    const nx = Math.round((w + 1) / step);
    const nz = Math.round((d + 1) / step);
    const ox = -(w + 1) / 2;
    const oz = -(d + 1) / 2;
    const toCell = (x: number, z: number) => [Math.floor((x - ox) / step), Math.floor((z - oz) / step)];
    const center = (i: number, j: number) => [ox + (i + 0.5) * step, oz + (j + 0.5) * step];
    const [si, sj] = toCell(from.x, from.z);
    let [ti, tj] = toCell(to.x, to.z);
    const free = (i: number, j: number) => {
      if (i < 0 || j < 0 || i >= nx || j >= nz) return false;
      const [x, z] = center(i, j);
      // mesma folga do movimento: se o caminho passa, o personagem passa
      return !this.blocked(x, z, 0.3);
    };
    if (!free(ti, tj)) {
      // procura a célula livre mais próxima do destino
      let found = false;
      for (let r = 1; r < 6 && !found; r++)
        for (let di = -r; di <= r && !found; di++)
          for (let dj = -r; dj <= r && !found; dj++)
            if (free(ti + di, tj + dj)) {
              ti += di;
              tj += dj;
              found = true;
            }
      if (!found) return [];
    }
    const key = (i: number, j: number) => j * nx + i;
    const g = new Map<number, number>([[key(si, sj), 0]]);
    const came = new Map<number, number>();
    const open: [number, number, number][] = [[si, sj, 0]];
    const h = (i: number, j: number) => Math.hypot(i - ti, j - tj);
    const closed = new Set<number>();
    let iter = 0;
    while (open.length && iter++ < 20000) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (open[k][2] < open[bi][2]) bi = k;
      const [ci, cj] = open.splice(bi, 1)[0];
      const ck = key(ci, cj);
      if (ci === ti && cj === tj) {
        const out: THREE.Vector3[] = [];
        let k: number | undefined = ck;
        while (k !== undefined && k !== key(si, sj)) {
          const i = k % nx;
          const j = Math.floor(k / nx);
          const [x, z] = center(i, j);
          out.unshift(new THREE.Vector3(x, 0, z));
          k = came.get(k);
        }
        if (out.length && !this.blocked(to.x, to.z)) out[out.length - 1].set(to.x, 0, to.z);
        return this.smoothPath(from, out);
      }
      if (closed.has(ck)) continue;
      closed.add(ck);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = ci + di;
        const nj = cj + dj;
        if (!free(ni, nj)) continue;
        if (di && dj && (!free(ci + di, cj) || !free(ci, cj + dj))) continue;
        const nk = key(ni, nj);
        const cost = g.get(ck)! + (di && dj ? 1.414 : 1);
        if (cost < (g.get(nk) ?? Infinity)) {
          g.set(nk, cost);
          came.set(nk, ck);
          open.push([ni, nj, cost + h(ni, nj)]);
        }
      }
    }
    return [];
  }

  /** Linha reta livre entre dois pontos (amostra a cada 0,15 m). */
  private clearLine(a: THREE.Vector3, b: THREE.Vector3) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(d / 0.15);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (this.blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  /** Tira os zigue-zagues da grade: vai direto ao ponto mais distante que dá para ver. */
  private smoothPath(from: THREE.Vector3, pts: THREE.Vector3[]) {
    const out: THREE.Vector3[] = [];
    let cur = from.clone();
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.clearLine(cur, pts[j])) j--;
      out.push(pts[j]);
      cur = pts[j];
      i = j + 1;
    }
    return out;
  }

  /** Raio da "hitbox" do assento: andar até aqui dentro senta sozinho. */
  private static SIT_HIT = 0.32;

  /** Assento cuja hitbox contém o ponto. */
  private seatAt(x: number, z: number): Item | null {
    let best: Item | null = null;
    let bd = World.SIT_HIT;
    for (const it of this.layout.items) {
      if (!SEATS[it.type]) continue;
      const dd = Math.hypot(it.x - x, it.z - z);
      if (dd < bd) {
        bd = dd;
        best = it;
      }
    }
    return best;
  }

  /** Senta nessa cadeira com animação: desliza até o centro e vira para a frente dela. */
  private sitOn(seat: Item, fromKeys: boolean) {
    this.me.sitting = true;
    this.me.targetDir = -(seat.rot * Math.PI) / 180;
    this.seatId = seat.id;
    this.me.seatY = SEAT_H[seat.type] ?? SEAT_Y;
    this.seatHold = fromKeys;
    this.leftSeat = null;
    this.path = [];
    this.walkGoal = null;
    this.onSit?.(true, this.me.seatY);
  }

  /** Anda até o destino confirmado (cadeira: senta ao chegar; no mapa geral: volta a câmera e vai correndo). */
  walkPlan(plan: WalkPlan) {
    this.panOffset.set(0, 0, 0); // a câmera volta a seguir o personagem
    const wasOverview = this.overview;
    if (wasOverview) this.setOverview(false);
    if (plan.seat) this.walkTo(plan.seat.x, plan.seat.z);
    else this.walkTo(plan.x, plan.z);
    if (wasOverview) this.runPath = this.path.length > 0;
  }

  /** Volta para onde eu estava antes de a conexão cair (sem levar para a entrada ou para a sala do cargo). */
  restoreMe(p: { x: number; z: number; dir: number; sitting: boolean; level: number }) {
    if (p.level !== this.level) this.setLevel(p.level, p.x, p.z);
    const seat = p.sitting ? this.seatNear(new THREE.Vector3(p.x, 0, p.z)) : null;
    if (seat) this.sitAt(seat);
    else {
      this.me.root.position.set(p.x, 0, p.z);
      this.me.targetDir = p.dir;
      this.me.body.rotation.y = p.dir;
      this.unstick();
    }
    this.path = [];
    this.walkGoal = null;
    this.camTarget.copy(this.me.root.position);
    this.lastState = ""; // manda a posição de novo para o servidor (sessão nova não sabe onde estou)
  }

  /** Coloca o meu personagem sentado nessa cadeira (ao entrar no escritório). */
  sitAt(seat: Item) {
    this.me.root.position.set(seat.x, 0, seat.z);
    this.me.targetDir = -(seat.rot * Math.PI) / 180;
    this.me.body.rotation.y = this.me.targetDir;
    this.me.sitting = true;
    this.me.sitT = 1;
    this.seatId = seat.id;
    this.me.seatY = SEAT_H[seat.type] ?? SEAT_Y;
    this.path = [];
    this.onSit?.(true, this.me.seatY);
  }

  /** O caminho atual vai correndo (atalhos como "minha sala"). */
  runToTarget() {
    this.runPath = this.path.length > 0;
  }

  /** Zoom em que o prédio inteiro cabe na tela. */
  fitZoom() {
    if (!this.layout) return 0.5;
    const { w, d } = this.layout.size;
    const aspect = this.host.clientWidth / Math.max(1, this.host.clientHeight);
    const halfW = this.topDown ? w / 2 + 1.5 : (w + d) / (2 * Math.SQRT2) + 1.5;
    const halfH = this.topDown ? d / 2 + 2 : ((w + d) / (2 * Math.SQRT2)) * 0.6 + 2.5;
    return Math.max(0.2, 9 / Math.max(halfH, halfW / aspect));
  }

  /** Troca entre a visão isométrica e a aérea. */
  setView(v: ViewMode) {
    if (v === this.view) return;
    const flatChanged = (v === "2d") !== (this.view === "2d");
    this.view = v;
    this.camera.up.set(0, v === "aerea" ? 0 : 1, v === "aerea" ? -1 : 0);
    if (flatChanged) {
      this.configureRender();
      this.applyStyle();
    }
    if (this.overview) {
      this.zoom = this.fitZoom();
      this.updateFrustum();
    }
    this.onViewChange?.(v);
  }

  /** Direção "direita da tela" no chão (para o som vir do lado certo). */
  get screenRight(): { x: number; z: number } {
    return this.topDown ? { x: 1, z: 0 } : { x: Math.SQRT1_2, z: -Math.SQRT1_2 };
  }

  /** Liga/desliga a visão do prédio inteiro. */
  setOverview(on: boolean, setZoom = true) {
    if (on === this.overview) return;
    this.overview = on;
    if (on) {
      if (setZoom) this.savedZoom = this.zoom;
      else this.savedZoom = Math.max(this.savedZoom, 1.3);
      if (setZoom) this.zoom = this.fitZoom();
    } else if (setZoom) this.zoom = this.savedZoom;
    this.updateFrustum();
    this.onOverviewChange?.(on);
  }

  /** Cadeira (ou banqueta, poltrona) perto do ponto clicado. */
  seatNear(p: THREE.Vector3): Item | null {
    let best: Item | null = null;
    let bd = Infinity;
    for (const it of this.layout.items) {
      const r = SEATS[it.type];
      if (!r) continue;
      const dd = Math.hypot(it.x - p.x, it.z - p.z);
      if (dd < r && dd < bd) {
        bd = dd;
        best = it;
      }
    }
    return best;
  }

  private editSaved: { view: ViewMode; overview: boolean } | null = null;
  private spaceDown = false;

  /** Editor aberto: câmera aérea do prédio inteiro, livre (botão do meio arrasta). Ao fechar, volta como estava. */
  setEditCam(on: boolean) {
    if (on) {
      if (this.editSaved) return;
      this.editSaved = { view: this.view, overview: this.overview };
      this.setView("aerea");
      this.setOverview(true);
      this.panOffset.set(0, 0, 0);
      this.camTarget.set(0, 0, 0);
    } else {
      const s = this.editSaved;
      if (!s) return;
      this.editSaved = null;
      this.panOffset.set(0, 0, 0);
      if (!s.overview) this.setOverview(false);
      this.setView(s.view);
    }
    this.editing = on;
    this.updateFrustum();
  }

  /** Leva a câmera até um ponto (sem mexer o personagem). */
  focusOn(x: number, z: number) {
    const base = this.overview ? new THREE.Vector3() : this.me?.root.position.clone() ?? new THREE.Vector3();
    this.panOffset.set(x - base.x, 0, z - base.z);
    this.panAt = performance.now() + 4000; // ver a pessoa/sala com calma antes de voltar
  }

  /** Arrasta o mapa: move a câmera na hora, sem sair muito do prédio. */
  panBy(dx: number, dz: number) {
    const { w, d } = this.layout.size;
    const base = this.overview ? new THREE.Vector3() : this.me?.root.position.clone() ?? new THREE.Vector3();
    const m = this.editSaved ? 10 : 2;
    const lim = (v: number, half: number) => THREE.MathUtils.clamp(v, -half - m, half + m);
    const tx = lim(this.camTarget.x + dx, w / 2);
    const tz = lim(this.camTarget.z + dz, d / 2);
    this.panOffset.set(tx - base.x, 0, tz - base.z);
    this.camTarget.set(tx, this.camTarget.y, tz);
    this.panAt = performance.now();
  }

  walkTo(x: number, z: number) {
    const goal = new THREE.Vector3(x, 0, z);
    const seat = this.seatNear(goal);
    // clicou numa cadeira: anda até ela (ela não bloqueia a passagem)
    const dest = seat ? new THREE.Vector3(seat.x, 0, seat.z) : goal;
    this.path = this.findPath(this.me.root.position, dest);
    if (!this.path.length && seat && this.me.root.position.distanceTo(dest) < 1.2) this.path = [dest];
    this.walkGoal = seat ? dest : null;
    this.stuck = 0;
  }

  // ---------- entrada
  private bindInput() {
    const typing = () => {
      const a = document.activeElement;
      return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || (a as HTMLElement)?.isContentEditable;
    };
    window.addEventListener("keydown", (e) => {
      if (typing() || !this.inputEnabled) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        this.keys.add(k);
        this.path = [];
        this.panOffset.set(0, 0, 0); // andando pelo teclado, a câmera volta a seguir
        e.preventDefault();
      }
    });
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !typing()) this.spaceDown = true;
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") this.spaceDown = false;
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.running = false;
    });
    const shift = (e: KeyboardEvent) => (this.running = e.shiftKey);
    window.addEventListener("keydown", shift);
    window.addEventListener("keyup", shift);

    const el = this.labels.domElement;
    el.addEventListener("wheel", (e) => {
      const edit = !!this.editSaved;
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY > 0 ? 0.9 : 1.1), this.fitZoom() * (edit ? 0.6 : 1), 3.2);
      if (edit) {
        this.updateFrustum();
        e.preventDefault();
        return;
      }
      // afastou até o prédio inteiro caber: vira a visão de mapa (e volta ao aproximar)
      if (!this.overview && this.zoom <= this.fitZoom() * 1.02) this.setOverview(true, false);
      else if (this.overview && this.zoom > this.fitZoom() * 1.3) this.setOverview(false, false);
      this.updateFrustum();
      e.preventDefault();
    }, { passive: false });

    // ---- mouse: arrastar com o botão esquerdo move o mapa; dois cliques levam o personagem até o lugar
    let lastPointer = "mouse";
    let drag: { id: number; x: number; y: number; lx: number; ly: number; moved: boolean } | null = null;
    let dragged = false;
    el.addEventListener("pointerdown", (e) => {
      lastPointer = e.pointerType || "mouse";
      if (e.pointerType === "touch" || (e.target as HTMLElement) !== el) return;
      const free = !!this.editSaved && (e.button === 1 || (e.button === 0 && this.spaceDown));
      if (free) e.preventDefault(); // botão do meio: sem o "rolar automático" do navegador
      else if (e.button !== 0 || (this.editing && !this.canPanEdit?.())) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
      dragged = false;
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        el.setPointerCapture?.(e.pointerId);
        el.classList.add("panning");
      }
      // o ponto do chão que estava sob o mouse continua sob o mouse (as duas leituras com a mesma câmera)
      const a = this.pickFloor({ clientX: drag.lx, clientY: drag.ly } as MouseEvent);
      const b = this.pickFloor(e);
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      if (a && b) this.panBy(a.x - b.x, a.z - b.z);
    });
    const endDrag = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) dragged = true;
      drag = null;
      el.classList.remove("panning");
    };
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);

    /**
     * Clique no mapa: não anda direto, pede confirmação ("Ir até lá?"). Vários cliques só mudam o
     * destino da mesma pergunta. Sem quem pergunte (onWalkRequest), anda direto.
     */
    const goTo = (e: MouseEvent, p: THREE.Vector3) => {
      if (!this.inputEnabled) return;
      const obj = this.pickItem(e);
      const it = obj && this.layout.items.find((i) => i.id === obj.userData.itemId);
      // clicou em cima da cadeira (o ponto do chão fica atrás dela na visão diagonal): o destino é sentar
      const plan: WalkPlan = { x: p.x, z: p.z, seat: it && SEATS[it.type] ? it : this.seatNear(p) };
      if (this.onWalkRequest) this.onWalkRequest(plan, e.clientX, e.clientY);
      else this.walkPlan(plan);
    };

    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement) !== el) return; // cliques em nameplates etc.
      if (dragged) {
        dragged = false; // soltou depois de arrastar o mapa: não é clique
        return;
      }
      const p = this.pickFloor(e);
      if (!p) return;
      if (this.onFloorClick?.(p, e)) return;
      if (!this.editing) {
        const av = this.pickAvatar(e);
        if (av && av !== this.me?.info.id) {
          this.onAvatarClick?.(av, e.clientX, e.clientY);
          return;
        }
        const obj = this.pickItem(e);
        const it = obj && this.layout.items.find((i) => i.id === obj.userData.itemId);
        if (it && obj && obj.userData.puse) obj.userData.pon = performance.now() + 4000;
        if (it && DEFS[it.type]?.interactive && this.onItemClick?.(it, e.clientX, e.clientY)) return;
      }
      // qualquer clique no chão ou numa cadeira abre a confirmação de ir até lá
      if (!this.editing) goTo(e, p);
    });
    el.addEventListener("dblclick", (e) => {
      // o clique simples já abriu a confirmação; dois cliques não fazem nada a mais
      if ((e.target as HTMLElement) === el) e.preventDefault();
    });
    // ---- toque: pinça para zoom e toque longo numa pessoa para abrir o menu
    const touches = new Map<number, { x: number; y: number }>();
    let pinch0 = 0;
    let zoom0 = 1;
    let longTimer = 0;
    let longStart: { x: number; y: number } | null = null;
    let suppressClick = false;
    const cancelLong = () => {
      clearTimeout(longTimer);
      longStart = null;
    };
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        cancelLong();
        const [a, b] = [...touches.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
        zoom0 = this.zoom;
        return;
      }
      if (this.editing || (e.target as HTMLElement) !== el) return;
      longStart = { x: e.clientX, y: e.clientY };
      const ev = e;
      longTimer = window.setTimeout(() => {
        if (!longStart) return;
        const av = this.pickAvatar(ev);
        if (av) {
          suppressClick = true;
          navigator.vibrate?.(15);
          this.onAvatarMenu?.(av, ev.clientX, ev.clientY, av === this.me?.info.id);
        }
        longStart = null;
      }, 480);
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "touch" || !touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (longStart && Math.hypot(e.clientX - longStart.x, e.clientY - longStart.y) > 10) cancelLong();
      if (touches.size === 2 && pinch0 > 0) {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoom = THREE.MathUtils.clamp(zoom0 * (d / pinch0), this.fitZoom(), 3.2);
        if (!this.overview && this.zoom <= this.fitZoom() * 1.02) this.setOverview(true, false);
        else if (this.overview && this.zoom > this.fitZoom() * 1.3) this.setOverview(false, false);
        this.updateFrustum();
        suppressClick = true;
      }
    });
    const up = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch0 = 0;
      cancelLong();
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    // o clique que vem depois de um toque longo ou de uma pinça não deve mover o personagem
    el.addEventListener(
      "click",
      (e) => {
        if (suppressClick) {
          suppressClick = false;
          e.stopImmediatePropagation();
        }
      },
      true,
    );

    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (this.editing) return;
      // no celular o menu sai pelo toque longo (acima); o "contextmenu" do Android duplicaria
      if ((e as PointerEvent).pointerType === "touch" || matchMedia("(pointer: coarse)").matches) return;
      const av = this.pickAvatar(e);
      if (av) this.onAvatarMenu?.(av, e.clientX, e.clientY, av === this.me?.info.id);
    });
  }

  pickFloor(e: MouseEvent): THREE.Vector3 | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
  }

  /** Personagem sob o mouse (pelo corpo ou bem perto dele no chão). */
  pickAvatar(e: MouseEvent): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const roots = [...this.others.values()].filter((a) => a.root.visible).map((a) => a.root);
    if (this.me) roots.push(this.me.root);
    const hits = this.ray.intersectObjects(roots, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.peerId) o = o.parent;
      if (o) return o.userData.peerId;
    }
    // folga: clique no chão bem perto do personagem
    const p = this.pickFloor(e);
    if (!p) return null;
    let best: string | null = null;
    let bd = 0.6;
    for (const a of [...this.others.values(), ...(this.me ? [this.me] : [])]) {
      const d = Math.hypot(a.root.position.x - p.x, a.root.position.z - p.z);
      if (d < bd) {
        bd = d;
        best = a.info.id;
      }
    }
    return best;
  }

  pickItem(e: MouseEvent): THREE.Object3D | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects(this.itemGroup.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.parent !== this.itemGroup) o = o.parent;
      if (o?.userData.itemId && o.userData.itemId) {
        const it = this.layout.items.find((i) => i.id === o!.userData.itemId);
        if (it && it.type !== "floor_logo") return o;
      }
    }
    return null;
  }

  /** Durante a viagem de elevador: 0 = portas fechadas, 1 = abertas; null = automático. */
  elevatorForce: number | null = null;

  /** Primeiro quadro desenhado com o escritório carregado. */
  onReady?: () => void;
  private readyFired = false;
  private readyFrames = 0;
  private outline = true;
  private maxFps = 0;
  /** Limite extra quando o app está em segundo plano ou coberto (0 = sem limite). */
  backgroundFps = 0;
  private lastFrame = 0;

  /**
   * Qualidade gráfica: "leve" (sem sombras nem contorno, 30 fps), "equilibrada" (padrão) ou
   * "bonita" (resolução da tela, sombras mais definidas).
   */
  quality: "leve" | "equilibrada" | "bonita" = "equilibrada";
  /** Estilo visual: padrão (traço fino), realista (luz e materiais físicos), desenho (traço grosso), retrô (pixelado). */
  style: GraphicStyle = "padrao";
  private realMats = new WeakMap<THREE.Material, THREE.Material>();
  private flatMats = new WeakMap<THREE.Material, THREE.Material>();
  private envMap: THREE.Texture | null = null;
  private lastStyleScan = 0;

  setQuality(q: "leve" | "equilibrada" | "bonita") {
    this.quality = q;
    this.configureRender();
  }

  /** Ajusta as opções gráficas finas (sombras, contorno, limite de quadros, resolução). */
  setGfx(o: Partial<GfxOptions>) {
    this.gfx = { ...this.gfx, ...o };
    this.configureRender();
  }

  setStyle(st: GraphicStyle) {
    this.style = st;
    this.configureRender();
    this.applyStyle();
  }

  /** Junta qualidade + estilo nas opções do renderizador. */
  private configureRender() {
    const q = this.quality;
    const st = this.style;
    const coarse = matchMedia("(pointer: coarse)").matches;
    const dpr = window.devicePixelRatio || 1;
    const g = this.gfx;
    const flat = this.view === "2d";
    let ratio = q === "bonita" ? Math.min(dpr, 2) : q === "leve" ? (coarse ? Math.min(dpr, 1.5) : Math.min(1, dpr)) : coarse ? Math.min(dpr, 2) : 1;
    // resolução escolhida à mão (porcentagem da nitidez da tela)
    if (g.scale > 0) ratio = Math.max(0.35, Math.min(dpr, 2) * g.scale);
    this.renderer.setPixelRatio(ratio);
    this.outline = (q !== "leve" && st !== "realista" && g.outline) || (flat && g.outline);
    if (st === "retro") this.outline = true; // o retrô precisa do passe (é ele que pixela)
    const caps = [q === "leve" ? 30 : 0, g.fps].filter((x) => x > 0);
    this.maxFps = caps.length ? Math.min(...caps) : 0;
    this.sun.castShadow = q !== "leve" && g.shadows && !flat;
    const size = q === "bonita" || st === "realista" ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      (this.sun.shadow as any).map = null;
    }
    this.renderer.shadowMap.type = q === "bonita" || st === "realista" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
    // contorno e pixel
    this.pixelPass.setPixelSize(st === "retro" ? 3 : 1);
    (this.pixelPass as any).normalEdgeStrength = flat ? 0.45 : st === "desenho" ? 0.7 : st === "retro" ? 0.3 : 0.08;
    (this.pixelPass as any).depthEdgeStrength = flat ? 0.9 : st === "desenho" ? 1.0 : st === "retro" ? 0.4 : 0.35;
    // luz física no realista (no 2D não tem luz)
    if (st === "realista" && !flat) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.78;
      if (!this.envMap) {
        const pm = new THREE.PMREMGenerator(this.renderer);
        this.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
        pm.dispose();
      }
      this.scene.environment = this.envMap;
      (this.scene as any).environmentIntensity = 0.22;
    } else {
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.scene.environment = null;
    }
    this.resize();
  }

  /** Troca os materiais em tons (toon) por materiais físicos no estilo realista, e volta. */
  applyStyle() {
    const flat = this.view === "2d";
    const real = this.style === "realista" && !flat;
    // 2D: material sem luz (cor chapada da paleta, como um desenho plano)
    const flatConv = (m: THREE.Material): THREE.Material => {
      if (!(m as any).isMeshToonMaterial && !(m as any).isMeshStandardMaterial && !(m as any).isMeshLambertMaterial) return m;
      let r = this.flatMats.get(m);
      if (!r) {
        const t = m as THREE.MeshToonMaterial;
        r = new THREE.MeshBasicMaterial({ color: t.color, map: t.map, transparent: t.transparent, opacity: t.opacity, vertexColors: t.vertexColors, side: t.side });
        this.flatMats.set(m, r);
      }
      return r;
    };
    const conv = (m: THREE.Material): THREE.Material => {
      if (flat) return flatConv(m);
      if (!(m as any).isMeshToonMaterial) return m;
      let r = this.realMats.get(m);
      if (!r) {
        const t = m as THREE.MeshToonMaterial;
        const std = new THREE.MeshStandardMaterial({
          color: t.color,
          map: t.map,
          transparent: t.transparent,
          opacity: t.opacity,
          vertexColors: t.vertexColors,
          emissive: t.emissive,
          emissiveMap: t.emissiveMap,
          emissiveIntensity: t.emissiveIntensity,
          side: t.side,
          roughness: 0.78,
          metalness: 0.02,
        });
        r = std;
        this.realMats.set(m, r);
      }
      return r;
    };
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      if (real || flat) {
        if (!mesh.userData.toonMat) mesh.userData.toonMat = mesh.material;
        const src = mesh.userData.toonMat as THREE.Material | THREE.Material[];
        mesh.material = Array.isArray(src) ? src.map(conv) : conv(src);
      } else if (mesh.userData.toonMat) {
        mesh.material = mesh.userData.toonMat;
        delete mesh.userData.toonMat;
      }
    });
  }

  // ---------- sinuca: bolas de verdade na mesa 3D
  private poolViews = new Map<string, PoolView>();
  private poolClock = performance.now();

  /**
   * Quem é o anfitrião de um jogo publica em extra.poolTable as bolas paradas e, a cada tacada,
   * o estado inicial + a velocidade. Cada um roda a mesma física aqui e vê as bolas rolando.
   */
  private updatePool(_dt: number) {
    // relógio próprio: as bolas andam no tempo real mesmo se o quadro demorar
    const nowMs = performance.now();
    const dt = Math.min(0.25, (nowMs - this.poolClock) / 1000);
    this.poolClock = nowMs;
    const states = new Map<string, any>();
    const all = this.me ? [this.me, ...this.others.values()] : [...this.others.values()];
    for (const a of all) {
      const t = a.extra?.poolTable;
      if (t?.item && (a === this.me || a.root.visible)) states.set(t.item, t);
    }
    for (const [id, v] of this.poolViews) {
      if (states.has(id) && v.obj.parent) continue;
      v.group.removeFromParent();
      disposeTree(v.group);
      const deco = v.obj.getObjectByName("pool-deco");
      if (deco) deco.visible = true;
      this.poolViews.delete(id);
    }
    for (const [id, t] of states) {
      let v = this.poolViews.get(id);
      if (!v) {
        const obj = this.itemGroup.children.find((o) => o.userData.itemId === id);
        if (!obj) continue;
        const group = new THREE.Group();
        const balls: THREE.Object3D[] = [];
        for (let n = 0; n < 16; n++) {
          const b = poolBall(n);
          balls.push(b);
          group.add(b);
        }
        obj.add(group);
        const deco = obj.getObjectByName("pool-deco");
        if (deco) deco.visible = false;
        v = { sim: new PoolSim(), obj, group, balls, shot: t.shot?.id ?? -1 };
        if (Array.isArray(t.balls)) v.sim.load(t.balls);
        this.poolViews.set(id, v);
      }
      if (t.shot && t.shot.id !== v.shot && Array.isArray(t.shot.b)) {
        v.shot = t.shot.id;
        v.sim.load(t.shot.b);
        v.sim.shoot(Number(t.shot.vx) || 0, Number(t.shot.vy) || 0);
      } else if (!v.sim.moving && Array.isArray(t.balls)) v.sim.load(t.balls);
      v.sim.step(dt);
      v.sim.balls.forEach((b, i) => {
        const m = v!.balls[i];
        if (!m) return;
        m.visible = !b.in;
        if (b.in) return;
        const nx = (b.x - POOL_W / 2) * POOL_SCALE;
        const nz = (b.y - POOL_H / 2) * POOL_SCALE;
        // rola de verdade: gira em volta do eixo perpendicular ao movimento
        const dx = nx - m.position.x;
        const dz = nz - m.position.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > 1e-5 && d < 0.2) m.quaternion.premultiply(_q.setFromAxisAngle(_ax.set(dz / d, 0, -dx / d), d / (PR * POOL_SCALE)));
        m.position.set(nx, POOL_BALL_Y, nz);
      });
    }
  }

  /** Centro da mesa e conversão do canvas da sinuca para o mundo (para posicionar os jogadores). */
  poolToWorld(it: Item, cx: number, cy: number) {
    const lx = (cx - POOL_W / 2) * POOL_SCALE;
    const lz = (cy - POOL_H / 2) * POOL_SCALE;
    const th = -(it.rot * Math.PI) / 180;
    return { x: it.x + lx * Math.cos(th) + lz * Math.sin(th), z: it.z - lx * Math.sin(th) + lz * Math.cos(th) };
  }

  /** Vira o meu personagem para um ponto (sem andar). */
  faceTo(x: number, z: number) {
    if (!this.me) return;
    const p = this.me.root.position;
    if (Math.abs(x - p.x) + Math.abs(z - p.z) < 1e-3) return;
    this.me.targetDir = Math.atan2(x - p.x, z - p.z);
  }

  /** Está andando por um caminho (clique ou walkTo)? */
  get walking() {
    return this.path.length > 0;
  }

  // ---------- loop
  start() {
    const tick = () => {
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, this.clock.getDelta());
      this.step(dt);
      const tt = this.clock.elapsedTime;
      this.env.update(dt, tt);
      for (const b of this.decorGroup.children)
        if (b.userData.blink) ((b as THREE.Mesh).material as THREE.MeshBasicMaterial).visible = Math.floor(tt * 2 + b.userData.blink) % 3 !== 0;
      // qualidade "leve": no máximo 30 quadros por segundo
      const now = performance.now();
      // estilo realista: converte o que apareceu de novo (móveis, pessoas, efeitos)
      if ((this.style === "realista" || this.view === "2d") && now - this.lastStyleScan > 1000) {
        this.lastStyleScan = now;
        this.applyStyle();
      }
      // limite de quadros: qualidade "leve" (30), janela sem foco (20) ou cena coberta pela tela cheia (12)
      const caps = [this.maxFps, this.backgroundFps].filter((x) => x > 0);
      const cap = caps.length ? Math.min(...caps) : 0;
      if (cap && now - this.lastFrame < 1000 / cap - 2) return;
      this.lastFrame = now;
      if (this.outline) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
      // primeiro quadro com o escritório e o personagem: pode tirar a tela de carregamento
      if (!this.readyFired && this.me && this.layout && ++this.readyFrames > 2) {
        this.readyFired = true;
        this.onReady?.();
      }
    };
    tick();
  }

  private step(dt: number) {
    if (!this.me) return;
    const pos = this.me.root.position;
    let vx = 0;
    let vz = 0;
    const k = this.keys;
    // W/S andam para cima/baixo da TELA, A/D para os lados (a câmera é diagonal)
    let kUp = 0;
    let kRight = 0;
    if (k.has("w") || k.has("arrowup")) kUp += 1;
    if (k.has("s") || k.has("arrowdown")) kUp -= 1;
    if (k.has("a") || k.has("arrowleft")) kRight -= 1;
    if (k.has("d") || k.has("arrowright")) kRight += 1;
    // joystick de toque (analógico): soma com o teclado
    kUp += this.stick.y;
    kRight += this.stick.x;
    if (this.topDown) {
      // de cima: W sobe (norte), D vai para a direita
      vx = kRight;
      vz = -kUp;
    } else {
      vx = kRight - kUp;
      vz = -kRight - kUp;
    }

    let keyMove = vx !== 0 || vz !== 0;
    // acabou de sentar andando: a tecla que ainda está apertada não levanta (só uma nova)
    if (this.seatHold) {
      if (keyMove && this.me.sitting) {
        vx = vz = 0;
        keyMove = false;
      } else this.seatHold = false;
    }
    if (keyMove) {
      this.path = [];
      this.walkGoal = null;
      if (this.overview) this.setOverview(false);
    }
    if (!this.path.length) this.runPath = false;
    const hadPath = this.path.length > 0;
    if ((keyMove || hadPath) && this.me.sitting) {
      this.me.sitting = false;
      this.leftSeat = this.seatId;
      this.seatId = null;
      this.onSit?.(false);
    }
    const stickRun = Math.hypot(this.stick.x, this.stick.y) > 0.92; // empurrou até a borda: corre
    const run = ((this.running || stickRun) && (keyMove || this.path.length > 0)) || (this.runPath && this.path.length > 0);
    const speed = run ? this.runSpeed : this.walkSpeed;
    let moving = false;
    if (keyMove) {
      const len = Math.hypot(vx, vz);
      vx = (vx / len) * speed * dt;
      vz = (vz / len) * speed * dt;
      const ox = pos.x;
      const oz = pos.z;
      if (!this.blocked(pos.x + vx, pos.z)) pos.x += vx;
      if (!this.blocked(pos.x, pos.z + vz)) pos.z += vz;
      this.me.targetDir = Math.atan2(vx, vz);
      // encostado na parede segurando a tecla: não fica "andando no lugar"
      moving = Math.hypot(pos.x - ox, pos.z - oz) > speed * dt * 0.2;
    } else if (this.path.length) {
      // segue o caminho gastando a distância do quadro inteira, sem parar em cada ponto
      let budget = speed * dt;
      const sx = pos.x;
      const sz = pos.z;
      while (budget > 1e-4 && this.path.length) {
        const next = this.path[0];
        const dx = next.x - pos.x;
        const dz = next.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1e-4) {
          this.path.shift();
          continue;
        }
        const k = Math.min(1, budget / dist);
        const nx = pos.x + dx * k;
        const nz = pos.z + dz * k;
        let ok = false;
        if (!this.blocked(nx, nz)) {
          pos.x = nx;
          pos.z = nz;
          ok = true;
        } else if (!this.blocked(nx, pos.z)) {
          pos.x = nx;
          ok = true;
        } else if (!this.blocked(pos.x, nz)) {
          pos.z = nz;
          ok = true;
        }
        this.me.targetDir = Math.atan2(dx, dz);
        if (!ok) break;
        budget -= dist * k;
        if (k >= 1) this.path.shift();
      }
      const moved = Math.hypot(pos.x - sx, pos.z - sz);
      moving = moved > 1e-4;
      // preso (alguém mudou um móvel no caminho, por exemplo): desiste em vez de ficar tremendo
      this.stuck = moved < speed * dt * 0.2 ? this.stuck + dt : 0;
      if (this.stuck > 0.35) {
        this.path = [];
        this.stuck = 0;
      }
    }
    let d = this.me.targetDir - this.me.body.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.me.body.rotation.y += d * Math.min(1, dt * 14);
    // chegou onde clicou: se foi numa cadeira, senta virado para a frente dela
    if (hadPath && !this.path.length && this.walkGoal) {
      const seat = this.seatNear(this.walkGoal);
      if (seat && Math.hypot(seat.x - pos.x, seat.z - pos.z) < 1.2) this.sitOn(seat, false);
      this.walkGoal = null;
    }
    // hitbox do assento: andando pelo teclado (ou joystick) até em cima da cadeira, senta sozinho
    if (this.leftSeat) {
      const ls = this.layout.items.find((i) => i.id === this.leftSeat);
      if (!ls || Math.hypot(ls.x - pos.x, ls.z - pos.z) > World.SIT_HIT + 0.35) this.leftSeat = null;
    }
    if (keyMove && moving && !this.me.sitting && !this.editing) {
      const seat = this.seatAt(pos.x, pos.z);
      if (seat && seat.id !== this.leftSeat) this.sitOn(seat, true);
    }
    // sentado: desliza até o centro do assento (parte da animação de sentar)
    if (this.me.sitting && this.seatId) {
      const seat = this.layout.items.find((i) => i.id === this.seatId);
      if (seat) {
        const dx = seat.x - pos.x;
        const dz = seat.z - pos.z;
        if (Math.hypot(dx, dz) > 0.003) {
          const k = Math.min(1, dt * 10);
          pos.x += dx * k;
          pos.z += dz * k;
        } else pos.set(seat.x, 0, seat.z);
      }
    }
    this.me.moving = moving && !this.me.sitting;
    this.me.running = run && moving;
    this.me.update(dt, false);
    // passos: tocam quando o pé encosta no chão na animação (os meus e os de quem anda por perto)
    if (this.me.footfall) this.onStep?.(this.me.running, 1);
    for (const a of this.others.values()) {
      if (!a.root.visible) continue; // outro andar
      a.update(dt, true);
      if (a.footfall) {
        const dist = Math.hypot(a.root.position.x - pos.x, a.root.position.z - pos.z);
        const vol = Math.max(0, 1 - dist / 7) * 0.6;
        if (vol > 0) this.onStep?.(a.running, vol);
      }
    }

    const zone = this.zoneAt(pos.x, pos.z);
    if (zone?.id !== this.currentZone?.id) {
      this.currentZone = zone;
      this.onZoneChange?.(zone);
    }

    // câmera segue com suavidade
    // (somado ao deslocamento de quando a pessoa arrasta o mapa)
    const base = this.overview ? new THREE.Vector3(0, 0, 0) : pos.clone();
    // segue o personagem: depois de arrastar o mapa, volta sozinha (2,5 s parado ou na hora que ele anda)
    if (this.followCam && !this.overview && this.panOffset.lengthSq() > 0 && (moving || performance.now() - this.panAt > 2500)) {
      this.panOffset.multiplyScalar(Math.max(0, 1 - dt * (moving ? 4 : 2.5)));
      if (this.panOffset.lengthSq() < 0.0004) this.panOffset.set(0, 0, 0);
    }
    this.camTarget.lerp(base.add(this.panOffset), Math.min(1, dt * (moving ? 6 : 4)));
    // vista isométrica (diagonal, como The Sims) ou aérea (direto de cima)
    if (this.view === "aerea") this.camera.position.set(this.camTarget.x, 40, this.camTarget.z);
    // 2D: quase de cima, com uma leve inclinação para ainda ver o rosto das pessoas
    else if (this.view === "2d") this.camera.position.set(this.camTarget.x, 40, this.camTarget.z + 9);
    else this.camera.position.set(this.camTarget.x + 24, 24, this.camTarget.z + 24);
    this.camera.lookAt(this.camTarget);
    // encaixa a câmera na grade de pixels para o pixel art não "tremer"
    this.camera.updateMatrixWorld();
    const unit = (this.camera.top - this.camera.bottom) / (this.host.clientHeight / this.pixelSize);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const pr = this.camera.position.dot(right);
    const pu = this.camera.position.dot(up);
    this.camera.position.addScaledVector(right, Math.round(pr / unit) * unit - pr);
    this.camera.position.addScaledVector(up, Math.round(pu / unit) * unit - pu);

    const now = performance.now();
    const state = `${pos.x.toFixed(2)},${pos.z.toFixed(2)},${this.me.targetDir.toFixed(2)},${moving},${zone?.id}`;
    if (state !== this.lastState && now - this.lastSent > 66) {
      this.lastSent = now;
      this.lastState = state;
      this.onMove?.(pos.x, pos.z, this.me.targetDir, moving, zone);
    }
    if (!this.level) this.janitor?.update(dt);
    // itens animados (Cleiton mexe as antenas e dá uma tremidinha de vez em quando)
    const tt = performance.now() / 1000;
    for (const o of this.itemGroup.children) {
      const an = o.userData.anim;
      if (an?.kind === "elevator") {
        // portas abrem com alguém perto (ou durante a viagem, comandado por elevatorDoors)
        const near = this.me && Math.hypot(this.me.root.position.x - o.position.x, this.me.root.position.z - o.position.z) < 2.4;
        const want = this.elevatorForce ?? (near ? 1 : 0);
        an.open += (want - an.open) * Math.min(1, dt * 4);
        an.left.position.x = -0.31 - an.open * 0.56;
        an.right.position.x = 0.31 + an.open * 0.56;
        (an.lamp.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(tt * 3) > 0 || !this.elevatorForce ? 0xc8f501 : 0x3d4a00);
        continue;
      }
      if (an?.kind !== "cleiton") continue;
      an.antL.rotation.x = Math.sin(tt * 5.3) * 0.25;
      an.antR.rotation.x = Math.sin(tt * 4.7 + 1) * 0.25;
      const twitch = Math.sin(tt * 0.9) > 0.97 ? Math.sin(tt * 60) * 0.04 : 0;
      an.bug.rotation.y = twitch + Math.sin(tt * 0.6) * 0.15;
    }
    this.updateDoors(dt);
    this.updateScreens();
    this.updatePack();
    this.updatePool(dt);
    this.onFrame?.();
  }
}

// ------------------------------------------------------------------ faxineiro (NPC)
/**
 * Faxineiro que anda pelo escritório e para para limpar. A rota é a mesma para todos:
 * a posição sai do relógio (Date.now), então todo mundo vê ele no mesmo lugar sem precisar do servidor.
 */
export class Janitor {
  avatar: Avatar;
  private pts: THREE.Vector3[] = [];
  private stops: { at: number; until: number; idx: number; dir: number }[] = [];
  private cycle = 1;
  private lastPos = new THREE.Vector3();
  // carrinho de limpeza e o que tem nele
  private cart: THREE.Group;
  private cartMop: THREE.Group;
  private cartSign: THREE.Group;
  private cartSpray: THREE.Group;
  private cartCloth: THREE.Mesh;
  // o que vai na mão
  private handMop: THREE.Group;
  private handSpray: THREE.Group;
  private handCloth: THREE.Mesh;
  // no chão
  private sign: THREE.Group;
  private wet: THREE.Mesh;
  private wetMat: THREE.MeshBasicMaterial;
  private mist: THREE.Mesh[] = [];
  private wetUntil = 0;
  static readonly SPEED = 1.15; // m/s, empurrando o carrinho
  static readonly CLEAN_SECS = 12;

  constructor(private world: World) {
    this.avatar = new Avatar(
      {
        id: "npc-faxina",
        name: "Seu Zé · limpeza",
        color: "#3b6fc0",
        x: 0,
        z: 0,
        dir: 0,
        moving: false,
        status: "",
        zone: null,
        look: { body: "m", skin: "#c68a5e", hair: "curto", hairColor: "#3a2a1e", top: "camiseta", topColor: "#3b6fc0", bottom: "calca", bottomColor: "#2c3e66", shoes: "#2a2a2a", head: "bone", headColor: "#3b6fc0", face: "nenhum", neck: "nenhum", beard: "bigode", ears: "nenhum" },
      },
      false,
    );
    this.avatar.label.classList.add("npc");
    const mat = (c: number, o: Partial<THREE.MeshToonMaterialParameters> = {}) => new THREE.MeshToonMaterial({ color: c, ...o });
    const bx = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      return b;
    };
    const wood = mat(0xb98a55);
    const cloth = mat(0xe9e4d6);
    const yel = mat(0xf2c14e);
    const steel = mat(0x8a96a3);
    const blue = mat(0x5ec8ff);
    const lime = mat(0xc8f501);

    // rodo/esfregão: cabo + cabeça com franjas
    const mkMop = () => {
      const g = new THREE.Group();
      g.add(bx(0.045, 1.2, 0.045, wood, 0, 0, 0));
      g.add(bx(0.4, 0.06, 0.14, steel, 0, -0.6, 0));
      for (let i = -3; i <= 3; i++) g.add(bx(0.045, 0.09, 0.12, cloth, i * 0.055, -0.67, 0));
      return g;
    };
    // borrifador: frasco azul com gatilho branco
    const mkSpray = () => {
      const g = new THREE.Group();
      g.add(bx(0.09, 0.18, 0.07, blue, 0, 0, 0));
      g.add(bx(0.05, 0.06, 0.05, cloth, 0, 0.12, 0));
      g.add(bx(0.03, 0.03, 0.08, cloth, 0, 0.15, 0.05));
      return g;
    };
    // plaquinha "piso molhado" (aberta em A)
    const mkSign = (open: boolean) => {
      const g = new THREE.Group();
      const a = bx(0.3, 0.5, 0.03, yel, 0, 0.24, open ? 0.08 : 0.015);
      a.rotation.x = open ? -0.3 : 0;
      const b = a.clone();
      b.position.z = open ? -0.08 : -0.015;
      b.rotation.x = open ? 0.3 : 0;
      // faixa preta com o "!" desenhado em blocos
      const ink = mat(0x2a2a2a);
      g.add(a, b, bx(0.04, 0.14, 0.01, ink, 0, 0.3, open ? 0.105 : 0.035), bx(0.04, 0.035, 0.01, ink, 0, 0.18, open ? 0.115 : 0.035));
      return g;
    };

    // ---- carrinho (frente = +z) ----
    this.cart = new THREE.Group();
    const c = this.cart;
    c.add(bx(0.62, 0.05, 0.9, steel, 0, 0.16, 0)); // prateleira de baixo
    c.add(bx(0.62, 0.04, 0.5, steel, 0, 0.62, -0.18)); // prateleira de cima
    for (const [x, z] of [[-0.29, -0.42], [0.29, -0.42], [-0.29, 0.06], [0.29, 0.06]]) c.add(bx(0.04, 0.62, 0.04, steel, x, 0.33, z));
    c.add(bx(0.04, 0.55, 0.04, steel, -0.25, 0.9, -0.45), bx(0.04, 0.55, 0.04, steel, 0.25, 0.9, -0.45), bx(0.54, 0.05, 0.05, steel, 0, 1.16, -0.45)); // alça
    for (const [x, z] of [[-0.28, -0.38], [0.28, -0.38], [-0.28, 0.38], [0.28, 0.38]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10), mat(0x1f1f1f));
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.07, z);
      c.add(w);
    }
    // balde amarelo com espremedor azul, na frente
    c.add(bx(0.44, 0.3, 0.36, yel, 0, 0.34, 0.24), bx(0.4, 0.03, 0.32, mat(0x3b8fd0, { transparent: true, opacity: 0.85 }), 0, 0.47, 0.24), bx(0.46, 0.08, 0.1, mat(0x3b6fc0), 0, 0.52, 0.1));
    // saco de lixo
    c.add(bx(0.34, 0.32, 0.3, mat(0x2a2a2a), 0, 0.36, -0.22));
    // frascos na prateleira de cima
    c.add(bx(0.08, 0.16, 0.08, mat(0xff7aa8), -0.2, 0.72, -0.05), bx(0.1, 0.2, 0.08, mat(0xffffff), -0.06, 0.74, -0.32));
    this.cartMop = mkMop();
    this.cartMop.position.set(0.08, 1.06, 0.24);
    this.cartMop.rotation.z = 0.12;
    this.cartSpray = mkSpray();
    this.cartSpray.position.set(0.12, 0.73, -0.1);
    this.cartCloth = bx(0.18, 0.04, 0.14, lime, 0.12, 0.66, -0.3);
    this.cartSign = mkSign(false);
    this.cartSign.position.set(0.33, 0.12, -0.2);
    this.cartSign.rotation.y = Math.PI / 2;
    c.add(this.cartMop, this.cartSpray, this.cartCloth, this.cartSign);

    // ---- itens na mão (mão direita) ----
    this.handMop = mkMop();
    this.handMop.position.y = -0.15;
    this.handSpray = mkSpray();
    this.handSpray.position.set(0, -0.08, 0.06);
    this.handCloth = bx(0.16, 0.04, 0.12, lime, 0, -0.06, 0.04);
    const hand = this.avatar.char.hand;
    hand.add(this.handMop, this.handSpray, this.handCloth);

    // ---- no chão: plaquinha aberta, mancha molhada e névoa do borrifador ----
    this.sign = mkSign(true);
    this.sign.visible = false;
    this.wetMat = new THREE.MeshBasicMaterial({ color: 0x5aa9e6, transparent: true, opacity: 0, depthWrite: false });
    this.wet = new THREE.Mesh(new THREE.CircleGeometry(1, 28), this.wetMat);
    this.wet.rotation.x = -Math.PI / 2;
    this.wet.visible = false;
    const mistMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), mistMat);
      m.visible = false;
      this.mist.push(m);
    }
    world.scene.add(this.avatar.root, this.cart, this.sign, this.wet, ...this.mist);
  }

  /** Monta a rota passando pelas áreas do escritório (refaz quando o mapa muda). */
  plan() {
    const L = this.world.layout;
    if (!L) return;
    const wanted: THREE.Vector3[] = [];
    const { w, d } = L.size;
    void d;
    // corredor central e salas (centro de cada uma, um pouco para dentro da porta)
    wanted.push(new THREE.Vector3(-w / 2 + 3, 0, -0.5), new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(w / 2 - 3, 0, -0.5));
    for (const z of L.zones) wanted.push(new THREE.Vector3(z.x, 0, z.z));
    // ordena em volta do centro, para fazer uma volta só
    wanted.sort((p, q) => Math.atan2(p.z, p.x) - Math.atan2(q.z, q.x));
    // precisa de espaço para ele e o carrinho ao lado
    const free = (p: THREE.Vector3) => {
      for (let r = 0; r < 3; r += 0.5)
        for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
          const q = new THREE.Vector3(p.x + dx, 0, p.z + dz);
          if (!this.world.blocked(q.x, q.z, 0.6)) return q;
        }
      return null;
    };
    let tdist = 0;
    this.world.ignoreLocks = true;
    try {
      const stopsAt = wanted.map(free).filter((p): p is THREE.Vector3 => !!p);
      this.pts = [];
      this.stops = [];
      for (let i = 0; i < stopsAt.length; i++) {
        const from = stopsAt[i];
        const to = stopsAt[(i + 1) % stopsAt.length];
        const seg = this.world.findPath(from, to);
        if (!seg.length) continue;
        if (!this.pts.length) this.pts.push(from.clone());
        // direção em que ele chegou (o carrinho para do lado, virado para lá)
        const last = this.pts[this.pts.length - 1];
        const prev = this.pts.length > 1 ? this.pts[this.pts.length - 2] : null;
        const dir = prev ? Math.atan2(last.x - prev.x, last.z - prev.z) : Math.atan2(seg[0].x - last.x, seg[0].z - last.z);
        this.stops.push({ at: tdist, until: tdist + Janitor.CLEAN_SECS, idx: this.pts.length - 1, dir });
        tdist += Janitor.CLEAN_SECS;
        let p0 = last;
        for (const p of seg) {
          tdist += p0.distanceTo(p) / Janitor.SPEED;
          this.pts.push(p.clone());
          p0 = p;
        }
      }
    } finally {
      this.world.ignoreLocks = false;
    }
    this.cycle = Math.max(1, tdist);
  }

  /** Posição na rota para o instante `t` (segundos): igual para todo mundo, sai do relógio. */
  update(dt: number) {
    const av = this.avatar;
    if (this.pts.length < 2) {
      av.root.visible = this.cart.visible = false;
      return;
    }
    av.root.visible = this.cart.visible = true;
    const t = (Date.now() / 1000) % this.cycle;
    let stop: { at: number; until: number; idx: number; dir: number } | null = null;
    let pos = this.pts[0].clone();
    let cursor = 0;
    let i = 0;
    for (const st of this.stops) {
      if (t < st.at) break;
      if (t < st.until) {
        stop = st;
        pos = this.pts[st.idx].clone();
        break;
      }
      cursor = st.until;
      i = st.idx;
    }
    if (!stop) {
      let left = (t - cursor) * Janitor.SPEED;
      pos = this.pts[i].clone();
      for (let k = i; k < this.pts.length - 1 && left > 0; k++) {
        const a = this.pts[k];
        const b = this.pts[k + 1];
        const seg = a.distanceTo(b);
        if (left <= seg) {
          pos = a.clone().lerp(b, left / seg);
          left = 0;
        } else {
          left -= seg;
          pos = b.clone();
        }
      }
    }
    const moved = pos.distanceTo(this.lastPos);
    if (!stop && moved > 1e-3 && moved < 1) av.targetDir = Math.atan2(pos.x - this.lastPos.x, pos.z - this.lastPos.z);
    else if (moved >= 1) av.body.rotation.y = av.targetDir;
    this.lastPos.copy(pos);
    av.root.position.copy(pos);
    av.moving = !stop && moved > 1e-4;
    const ce = stop ? t - stop.at : -1;
    if (stop) av.targetDir = this.faceFor(stop.dir, ce);
    let d = av.targetDir - av.body.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    av.body.rotation.y += d * Math.min(1, dt * (stop ? 7 : 8));
    av.update(dt, false);
    if (stop) this.clean(stop, pos, ce);
    else this.push(pos);
    this.updateWet(pos, ce, stop);
  }

  /** Para onde ele olha em cada etapa da limpeza (carrinho fica do lado direito). */
  private faceFor(dir: number, ce: number) {
    const toCart = dir - Math.PI / 2;
    if (ce < 0.8) return dir;
    if (ce < 3.0) return ce < 1.6 ? toCart : ce < 2.0 ? dir + 0.5 : toCart; // pega a placa, põe no chão, volta ao balde
    if (ce < 7.5) return dir;
    if (ce < 8.6) return toCart;
    if (ce < 10.0) return dir - 0.2; // borrifa e passa o pano na frente
    if (ce < 11.0) return ce < 10.5 ? dir + 0.5 : toCart;
    return dir;
  }

  /** Andando: carrinho na frente, duas mãos na alça. */
  private push(pos: THREE.Vector3) {
    const av = this.avatar;
    const c = av.char;
    const yaw = av.body.rotation.y;
    this.cart.position.set(pos.x + Math.sin(yaw) * 0.85, 0, pos.z + Math.cos(yaw) * 0.85);
    this.cart.rotation.y = yaw;
    c.armR.rotation.set(-1.15, 0, 0.12);
    c.armL.rotation.set(-1.15, 0, -0.12);
    c.root.rotation.x = 0.08; // corpo um pouco à frente, fazendo força
    this.show({ cartMop: true, cartSign: true, cartSpray: true, cartCloth: true });
    this.sign.visible = false;
    for (const m of this.mist) m.visible = false;
  }

  private show(o: { handMop?: boolean; handSpray?: boolean; handCloth?: boolean; cartMop?: boolean; cartSign?: boolean; cartSpray?: boolean; cartCloth?: boolean }) {
    this.handMop.visible = !!o.handMop;
    this.handSpray.visible = !!o.handSpray;
    this.handCloth.visible = !!o.handCloth;
    this.cartMop.visible = !!o.cartMop;
    this.cartSign.visible = !!o.cartSign;
    this.cartSpray.visible = !!o.cartSpray;
    this.cartCloth.visible = !!o.cartCloth;
  }

  /** As etapas da parada (12 s): estaciona, placa, rodo, borrifador e pano, recolhe e segue. */
  private clean(st: { dir: number }, pos: THREE.Vector3, ce: number) {
    const c = this.avatar.char;
    const dir = st.dir;
    const right = new THREE.Vector3(-Math.cos(dir), 0, Math.sin(dir)); // lado direito dele
    const fwd = new THREE.Vector3(Math.sin(dir), 0, Math.cos(dir));
    // carrinho estacionado do lado direito dele
    const park = Math.min(1, ce / 0.8);
    const cartA = new THREE.Vector3(pos.x + fwd.x * 0.85, 0, pos.z + fwd.z * 0.85);
    const cartB = new THREE.Vector3(pos.x + right.x * 0.9 + fwd.x * 0.2, 0, pos.z + right.z * 0.9 + fwd.z * 0.2);
    this.cart.position.lerpVectors(cartA, cartB, park * park * (3 - 2 * park));
    this.cart.rotation.y = dir;
    const ease = (x: number) => {
      const v = Math.min(1, Math.max(0, x));
      return v * v * (3 - 2 * v);
    };
    const reach = (k: number, low = false) => {
      // braço direito vai até o carrinho (ou até o chão) e volta
      c.armR.rotation.set(low ? -0.4 - k * 0.5 : -0.4 - k * 0.9, 0, 0.1 + k * 0.25);
      c.root.rotation.x = k * (low ? 0.35 : 0.15);
    };
    const signSpot = new THREE.Vector3(pos.x + fwd.x * 0.6 - right.x * 0.7, 0, pos.z + fwd.z * 0.6 - right.z * 0.7);
    this.sign.position.copy(signSpot);
    this.sign.rotation.y = dir;
    for (const m of this.mist) m.visible = false;
    this.handMop.position.y = -0.15;
    c.armL.rotation.set(-0.15, 0, -0.1);
    c.root.rotation.x = 0;

    if (ce < 0.8) {
      // estacionando
      c.armR.rotation.set(-1.15, 0, 0.12);
      c.armL.rotation.set(-1.15, 0, -0.12);
      this.show({ cartMop: true, cartSign: true, cartSpray: true, cartCloth: true });
      this.sign.visible = false;
    } else if (ce < 2.0) {
      // pega a plaquinha no carrinho (0,8–1,4) e coloca no chão (1,6–2,0)
      const inHand = ce > 1.15 && ce < 1.8;
      reach(ce < 1.6 ? Math.sin(((ce - 0.8) / 0.8) * Math.PI) : Math.sin(((ce - 1.6) / 0.4) * Math.PI), ce >= 1.6);
      this.show({ cartMop: true, cartSign: ce < 1.15, cartSpray: true, cartCloth: true });
      this.sign.visible = ce >= 1.8;
      if (inHand) {
        // placa dobrada na mão
        this.sign.visible = true;
        const hp = new THREE.Vector3();
        c.hand.getWorldPosition(hp);
        this.sign.position.set(hp.x, Math.max(0, hp.y - 0.5), hp.z);
      }
    } else if (ce < 3.0) {
      // tira o rodo do balde (2,0–2,5) e torce no espremedor (2,5–3,0)
      const k = ease((ce - 2.0) / 0.5);
      const wring = ce > 2.5 ? Math.abs(Math.sin((ce - 2.5) * 12)) * 0.25 : 0;
      c.armR.rotation.set(-1.0 - k * 0.3 + wring, 0, 0.2);
      c.armL.rotation.set(-0.9 + wring, 0, -0.1);
      this.show({ handMop: ce > 2.3, cartMop: ce <= 2.3, cartSpray: true, cartCloth: true });
      this.handMop.rotation.set(0.15, 0, 0);
      this.sign.visible = true;
    } else if (ce < 7.5) {
      // passa o rodo em "8": inclina, gira o tronco, empurra e puxa, arrasta os pés
      const u = ce - 3.0;
      const sweep = Math.sin(u * 2.4);
      const push = Math.sin(u * 4.8);
      const yaw = sweep * 0.45;
      this.avatar.body.rotation.y = dir + yaw;
      c.root.rotation.x = 0.22 + push * 0.04;
      c.root.rotation.z = -sweep * 0.06;
      c.armR.rotation.set(-0.85 + push * 0.22, 0, 0.05 - sweep * 0.2);
      c.armL.rotation.set(-1.0 + push * 0.22, 0, -0.35 - sweep * 0.15);
      c.legL.rotation.x = Math.sin(u * 2.4) * 0.18;
      c.legR.rotation.x = -Math.sin(u * 2.4) * 0.18;
      // cabeça do rodo encostada no chão e acompanhando a varrida
      this.handMop.rotation.set(0.55 + push * 0.12, 0, sweep * 0.35);
      this.handMop.position.y = 0.12; // escorrega no punho para a cabeça encostar no chão
      this.show({ handMop: true, cartSpray: true, cartCloth: true });
      this.sign.visible = true;
    } else if (ce < 8.6) {
      // mergulha o rodo no balde (sobe e desce) e larga lá
      const dip = Math.abs(Math.sin((ce - 7.5) * 7)) * 0.3;
      c.armR.rotation.set(-1.1 + dip, 0, 0.25);
      c.armL.rotation.set(-0.9 + dip, 0, -0.05);
      this.handMop.rotation.set(0.1, 0, 0);
      this.show({ handMop: ce < 8.3, cartMop: ce >= 8.3, cartSpray: ce < 8.45, handSpray: ce >= 8.45, cartCloth: true });
      this.sign.visible = true;
    } else if (ce < 10.0) {
      // borrifa (8,6–9,2) e passa o pano em círculos (9,2–10,0)
      if (ce < 9.2) {
        const squeeze = Math.sin((ce - 8.6) * 18) > 0.3;
        c.armR.rotation.set(-1.35, 0, 0.05);
        c.armL.rotation.set(-0.2, 0, -0.1);
        this.show({ handSpray: true, cartMop: true, cartCloth: true });
        // névoa saindo da mão para a frente
        const hp = new THREE.Vector3();
        c.hand.getWorldPosition(hp);
        const yaw = this.avatar.body.rotation.y;
        const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        this.mist.forEach((m, k) => {
          const life = ((ce - 8.6) * 2.2 + k / this.mist.length) % 1;
          m.visible = squeeze || life < 0.6;
          m.position.set(hp.x + f.x * (0.15 + life * 0.7) + Math.sin(k * 7.1) * 0.08 * life, hp.y + 0.05 + Math.cos(k * 3.3) * 0.08 * life, hp.z + f.z * (0.15 + life * 0.7));
          m.scale.setScalar(0.5 + life * 1.6);
        });
      } else {
        const a = (ce - 9.2) * 9;
        c.armR.rotation.set(-1.1 + Math.sin(a) * 0.18, 0, 0.12 + Math.cos(a) * 0.18);
        c.armL.rotation.set(-0.2, 0, -0.1);
        c.root.rotation.x = 0.12;
        this.show({ handCloth: true, cartMop: true, cartSpray: true });
      }
      this.sign.visible = true;
    } else if (ce < 11.0) {
      // guarda o pano, pega a plaquinha do chão (10,0–10,5) e põe no carrinho (10,5–11,0)
      const low = ce < 10.5;
      reach(low ? Math.sin(((ce - 10.0) / 0.5) * Math.PI) : Math.sin(((ce - 10.5) / 0.5) * Math.PI), low);
      this.show({ cartMop: true, cartSpray: true, cartCloth: true, cartSign: ce >= 10.8 });
      this.sign.visible = ce < 10.8;
      if (ce > 10.3 && ce < 10.8) {
        const hp = new THREE.Vector3();
        c.hand.getWorldPosition(hp);
        this.sign.position.set(hp.x, Math.max(0, hp.y - 0.5), hp.z);
      }
    } else {
      // mãos na alça, pronto para seguir
      const k = ease((ce - 11.0) / 0.6);
      c.armR.rotation.set(-0.4 - k * 0.75, 0, 0.12);
      c.armL.rotation.set(-0.4 - k * 0.75, 0, -0.12);
      this.show({ cartMop: true, cartSign: true, cartSpray: true, cartCloth: true });
      this.sign.visible = false;
    }
  }

  /** Mancha molhada: cresce enquanto ele passa o rodo e some devagar depois que ele sai. */
  private updateWet(pos: THREE.Vector3, ce: number, stop: { dir: number } | null) {
    const now = performance.now();
    if (stop && ce >= 3.0) {
      const fwd = new THREE.Vector3(Math.sin(stop.dir), 0, Math.cos(stop.dir));
      const grow = Math.min(1, (ce - 3.0) / 4.5);
      this.wet.position.set(pos.x + fwd.x * 0.75, 0.012, pos.z + fwd.z * 0.75);
      this.wet.scale.set(0.35 + grow * 0.65, 0.3 + grow * 0.45, 1);
      this.wet.rotation.z = -stop.dir;
      this.wetMat.opacity = 0.42;
      this.wet.visible = true;
      this.wetUntil = now + 6000;
    } else if (this.wet.visible) {
      const left = (this.wetUntil - now) / 6000;
      if (left <= 0) this.wet.visible = false;
      else this.wetMat.opacity = 0.42 * left;
    }
  }

  dispose() {
    this.avatar.dispose();
    this.cart.removeFromParent();
    this.sign.removeFromParent();
    this.wet.removeFromParent();
    for (const m of this.mist) m.removeFromParent();
  }
}

/** Navegadores: no lugar do nome do programa, mostra a aba aberta (vem do título da janela). */
const BROWSERS: [RegExp, string][] = [
  [/chrome/i, "Chrome"],
  [/edge/i, "Edge"],
  [/firefox/i, "Firefox"],
  [/opera/i, "Opera"],
  [/brave/i, "Brave"],
  [/vivaldi/i, "Vivaldi"],
  [/arc/i, "Arc"],
  [/safari/i, "Safari"],
];

/** Título da aba sem o nome do navegador e do perfil ("Gmail - Google Chrome" → "Gmail"). */
export function browserTab(app: string, title: string): { browser: string; tab: string } | null {
  const b = BROWSERS.find(([re]) => re.test(app));
  if (!b || !title) return null;
  let t = title.trim();
  // tira " - Google Chrome", " — Mozilla Firefox", " - Microsoft Edge", " - Pessoal - Microsoft​ Edge"...
  t = t.replace(/\s+[-–—]\s+(google chrome|mozilla firefox|firefox|microsoft\S*\s*edge|opera|brave|vivaldi|arc|safari)\s*$/i, "");
  t = t.replace(/\s+[-–—]\s+(perfil|profile|pessoal|trabalho|work|pessoa \d+|person \d+)[^-–—]*$/i, "");
  t = t.replace(/\s+e mais \d+ páginas?$/i, "");
  if (!t || /^(nova guia|new tab|nova aba)$/i.test(t)) return { browser: b[1], tab: "Nova aba" };
  return { browser: b[1], tab: t.length > 60 ? t.slice(0, 57) + "…" : t };
}

/** Texto da atividade: navegador mostra a aba; outros programas, o nome. */
export function activityText(act: { app?: string; title?: string }) {
  const bt = browserTab(act.app ?? "", act.title ?? "");
  return bt ? `${bt.browser} · ${bt.tab}` : act.app ?? "";
}
