import { REG as PACK } from "../pack";
import { geo } from "./geo";
import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { LOGO_PATH, NEON } from "./logo";
import { pixelTexture, rng, toon } from "./toon";
import { model } from "./models";
import { buildRug, type RugStyle } from "./rugs";
import { widgetTexture } from "./widgets";

export interface Item {
  id: string;
  type: string;
  x: number;
  z: number;
  rot: number;
  /** Configuração do item (painel de meta, painel personalizado...). */
  cfg?: any;
  /** Sala dona da parede (paredes geradas automaticamente). */
  room?: string;
  /** Cor escolhida no editor (#rrggbb). */
  color?: string;
  /** Altura extra em metros (escolhida no editor): sobe ou desce o móvel em relação à posição normal. */
  y?: number;
}

/** Cargos da equipe: cada um pode ter a sua sala no mapa (zona com `role`). */
export const ROLES = ["SDR", "Closer", "Editor", "Gestor", "Head", "CEO"];

export interface Zone {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  private: boolean;
  /** Piso da sala: carpete-azul, carpete-verde, carpete-lilas, carpete-grafite, madeira, madeira-escura, ceramica, porcelanato, concreto. */
  floor?: string;
  /** Cor do piso escolhida no editor (#rrggbb), aplicada por cima do desenho do piso. */
  floorColor?: string;
  /** Cargo dono da sala (quem tem esse cargo nasce aqui). */
  role?: string;
  /** Estilo das portas desta sala (senão vale o do escritório). */
  door?: string;
}

/** Estilo geral do escritório (configurado no editor, aba Prédio). */
export interface OfficeStyle {
  /** Cor das paredes (#rrggbb). */
  wall?: string;
  /** Estilo das janelas: classica, ampla, grade, faixa. */
  window?: string;
  /** Cor da moldura das janelas (#rrggbb). */
  frame?: string;
  /** Estilo das portas: madeira, vidro, escura, branca, verde. */
  door?: string;
  /** Piso do salão (fora das salas): uma das chaves de piso. */
  floor?: string;
}

export const WINDOW_STYLES: [string, string][] = [
  ["classica", "Clássica"],
  ["ampla", "Ampla"],
  ["grade", "Grade"],
  ["faixa", "Faixa alta"],
];
export const DOOR_STYLES: [string, string][] = [
  ["madeira", "Madeira"],
  ["branca", "Branca"],
  ["escura", "Grafite"],
  ["verde", "Verde VERKZ"],
  ["vidro", "Vidro"],
];

let curStyle: OfficeStyle = {};
/** O mundo avisa o estilo do layout antes de montar paredes e portas. */
export function setOfficeStyle(s?: OfficeStyle) {
  curStyle = s ?? {};
}
export function officeStyle() {
  return curStyle;
}

export interface Layout {
  version: number;
  size: { w: number; d: number };
  spawn: { x: number; z: number };
  items: Item[];
  zones: Zone[];
  /** Clima, estação e datas especiais (configurado pela gestão). */
  env?: import("./env").EnvConfig;
  /** Cor do piso do salão (fora das salas), #rrggbb. */
  floorColor?: string;
  /** Andares de cima (o térreo são `items` e `zones`). Mesmo tamanho de prédio. */
  levels?: Level[];
  /** Estilo geral: cor das paredes, janelas, portas e piso do salão. */
  style?: OfficeStyle;
}

export interface Level {
  /** 1 = 2º andar, 2 = 3º andar... */
  id: number;
  name: string;
  items: Item[];
  zones: Zone[];
  floorColor?: string;
}

/** Nome do andar para a interface. */
export function levelName(lv: number) {
  return lv === 0 ? "Térreo" : `${lv + 1}º andar`;
}

/** Andares existentes, do térreo para cima. */
export function levelIds(l: Layout): number[] {
  return [0, ...(l.levels ?? []).map((x) => x.id).sort((a, b) => a - b)];
}

/**
 * O que existe num andar, no formato de um Layout (o que o mundo e o editor usam).
 * No térreo é o próprio layout; nos outros, os itens e salas daquele andar.
 */
export function levelView(full: Layout, lv: number): Layout {
  if (!lv) return full;
  const L = full.levels?.find((x) => x.id === lv);
  if (!L) return full;
  return { ...full, items: L.items, zones: L.zones, floorColor: L.floorColor };
}

/** Devolve o layout completo com o andar `lv` trocado pelo que está em `view`. */
export function mergeLevel(full: Layout, lv: number, view: Layout): Layout {
  if (!lv) return view === full ? full : { ...view, levels: full.levels };
  return {
    ...full,
    levels: (full.levels ?? []).map((L) => (L.id === lv ? { ...L, items: view.items, zones: view.zones, floorColor: view.floorColor } : L)),
  };
}

/** Acha um item em qualquer andar do layout completo. */
export function findItemAnyLevel(full: Layout, id: string): Item | undefined {
  return full.items.find((i) => i.id === id) ?? full.levels?.flatMap((L) => L.items).find((i) => i.id === id);
}

/** Paredes de fora do prédio (janelas e, no térreo, a entrada embaixo no meio). */
export function perimeterWalls(w: number, d: number, entrance: boolean, uid: () => string): Item[] {
  const W = w / 2;
  const D = d / 2;
  const out: Item[] = [];
  const add = (type: string, x: number, z: number) => out.push({ id: uid(), type, x, z, rot: 0 });
  for (let x = -W; x <= W; x++) {
    add(x % 4 === 2 && Math.abs(x) < W - 1 ? "window_wall" : "wall", x, -D);
    if (!entrance || Math.abs(x) > 2) add(x % 5 === 0 && Math.abs(x) > 4 && Math.abs(x) < W - 1 ? "window_wall" : "wall", x, D);
  }
  for (let z = -D + 1; z < D; z++) {
    add(z % 4 === 0 ? "window_wall" : "wall", -W, z);
    add(z % 4 === 0 ? "window_wall" : "wall", W, z);
  }
  return out;
}

interface Def {
  label: string;
  w: number;
  d: number;
  blocks: boolean;
  /** Fica fora do prédio (árvores etc.): não aparece na paleta do editor por padrão. */
  outdoor?: boolean;
  /** Clicável fora do modo edição (cozinha, painéis). */
  interactive?: boolean;
  /** Item de enfeite de data especial (não aparece na paleta). */
  decor?: boolean;
  build: (it?: Item) => THREE.Object3D;
}

// =====================================================================
// Paleta clara e quente (estilo "escritório de jogo" em pixel art), com
// detalhes da VERKZ: grafite no topo das paredes e o verde neon nos acentos.
// =====================================================================
const plaster = pixelTexture(16, 20, (g) => {
  g.fillStyle = "#e3ddd1";
  g.fillRect(0, 0, 16, 20);
  g.fillStyle = "#d8d1c3";
  for (let y = 2; y < 16; y += 4) g.fillRect(0, y, 16, 1);
  g.fillStyle = "#9c9488";
  g.fillRect(0, 16, 16, 4); // rodapé
  g.fillStyle = "#b3ab9e";
  g.fillRect(0, 16, 16, 1);
});
const windowTex = pixelTexture(16, 20, (g) => {
  g.fillStyle = "#e3ddd1";
  g.fillRect(0, 0, 16, 20);
  g.fillStyle = "#3b3b44";
  g.fillRect(1, 2, 14, 12);
  g.fillStyle = "#8fd3f2";
  g.fillRect(2, 3, 12, 10);
  g.fillStyle = "#c4ecfb";
  g.fillRect(3, 4, 3, 2);
  g.fillRect(9, 8, 2, 1);
  g.fillStyle = "#3b3b44";
  g.fillRect(7, 3, 2, 10);
  g.fillStyle = "#9c9488";
  g.fillRect(0, 16, 16, 4);
});
const woodTex = pixelTexture(16, 16, (g) => {
  const r = rng(7);
  g.fillStyle = "#c98a55";
  g.fillRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y += 4) {
    g.fillStyle = "#b47646";
    g.fillRect(0, y + 3, 16, 1);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = r() > 0.5 ? "#d49a66" : "#bf7f4c";
      g.fillRect(Math.floor(r() * 14), y + 1, 2 + Math.floor(r() * 3), 1);
    }
  }
});
const cushionTex = pixelTexture(8, 8, (g) => {
  g.fillStyle = "#e6c08a";
  g.fillRect(0, 0, 8, 8);
  g.fillStyle = "#d9b07a";
  g.fillRect(0, 7, 8, 1);
  g.fillRect(7, 0, 1, 8);
});
const screenTex = (a: string, b: string) => {
  const t = pixelTexture(12, 8, (g) => {
    g.fillStyle = "#1d2433";
    g.fillRect(0, 0, 12, 8);
    g.fillStyle = a;
    g.fillRect(1, 1, 10, 3);
    g.fillStyle = b;
    g.fillRect(1, 5, 4, 2);
    g.fillRect(6, 5, 5, 1);
  });
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
};

const M = {
  wall: toon("#ffffff", { map: plaster }),
  window: toon("#ffffff", { map: windowTex }),
  cap: toon("#8a8698"),
  white: toon("#f2f0ea"),
  offwhite: toon("#dcd8cf"),
  grey: toon("#8e93a3"),
  steel: toon("#5d6273"),
  dark: toon("#2f3240"),
  navy: toon("#3d4460"),
  wood: toon("#ffffff", { map: woodTex }),
  woodDark: toon("#8a5a36"),
  orange: toon("#e0874a"),
  orangeDark: toon("#b9693a"),
  cushion: toon("#ffffff", { map: cushionTex }),
  beige: toon("#e6c08a"),
  leaf: toon("#4fae4a"),
  leafLight: toon("#7fcf5a"),
  leafDark: toon("#2f8a3e"),
  trunk: toon("#8a5a36"),
  pot: toon("#c76a3d"),
  potWhite: toon("#eceae4"),
  glass: toon("#9fd8ef", { transparent: true, opacity: 0.45 }),
  water: toon("#5ec2f0"),
  board: toon("#fbfaf6"),
  screenA: toon("#ffffff", { map: screenTex("#5ec8ff", "#C8F501") }),
  screenB: toon("#ffffff", { map: screenTex("#ff7aa8", "#ffd35c") }),
  screenC: toon("#ffffff", { map: screenTex("#C8F501", "#5ec8ff") }),
  neon: Object.assign(new THREE.MeshBasicMaterial({ color: NEON, toneMapped: false }), { userData: { shared: true } }),
  neonToon: toon(NEON),
  red: toon("#d9534f"),
  blue: toon("#3b6fc0"),
  yellow: toon("#f2c14e"),
  purple: toon("#8a6cc9"),
};

function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo.box(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(geo.cyl(rt, rb, h, seg), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function blob(r: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo.ico(r, 0), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function group(...children: THREE.Object3D[]) {
  const g = new THREE.Group();
  children.forEach((c) => g.add(c));
  return g;
}

let logoShapes: THREE.Shape[] | null = null;
function logoMesh(size: number, depth: number, mat: THREE.Material) {
  logoShapes ??= new SVGLoader()
    .parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${LOGO_PATH}"/></svg>`)
    .paths.flatMap((p) => SVGLoader.createShapes(p));
  const geo = new THREE.ExtrudeGeometry(logoShapes, { depth, bevelEnabled: false, curveSegments: 6 });
  geo.center();
  const s = size / 550;
  geo.scale(s, -s, s); // SVG tem Y para baixo
  return new THREE.Mesh(geo, mat);
}

function officeChair() {
  return group(
    box(0.44, 0.04, 0.44, M.steel, 0, 0.02, 0),
    cyl(0.04, 0.04, 0.34, M.steel, 0, 0.04, 0, 6),
    box(0.5, 0.1, 0.48, M.navy, 0, 0.38, 0),
    box(0.5, 0.5, 0.1, M.navy, 0, 0.44, -0.22),
    box(0.06, 0.18, 0.36, M.dark, -0.27, 0.48, 0),
    box(0.06, 0.18, 0.36, M.dark, 0.27, 0.48, 0),
  );
}

function woodChair() {
  return group(
    box(0.06, 0.4, 0.06, M.orangeDark, -0.2, 0, -0.2),
    box(0.06, 0.4, 0.06, M.orangeDark, 0.2, 0, -0.2),
    box(0.06, 0.4, 0.06, M.orangeDark, -0.2, 0, 0.2),
    box(0.06, 0.4, 0.06, M.orangeDark, 0.2, 0, 0.2),
    box(0.5, 0.08, 0.5, M.orange, 0, 0.4, 0),
    box(0.5, 0.45, 0.08, M.orange, 0, 0.48, -0.22),
  );
}

function monitor(x: number, z: number, mat: THREE.Material) {
  return group(
    box(0.2, 0.03, 0.14, M.dark, x, 0.76, z),
    box(0.05, 0.16, 0.05, M.dark, x, 0.77, z),
    box(0.62, 0.38, 0.05, M.dark, x, 0.9, z),
    box(0.56, 0.32, 0.01, mat, x, 0.93, z + 0.026),
  );
}

function plantPot(potMat: THREE.Material, scale = 1) {
  const g = group(
    cyl(0.22, 0.17, 0.4, potMat, 0, 0, 0, 8),
    cyl(0.2, 0.2, 0.03, M.trunk, 0, 0.38, 0, 8),
    blob(0.32, M.leaf, 0, 0.72, 0),
    blob(0.22, M.leafLight, 0.12, 0.95, 0.06),
    blob(0.2, M.leafDark, -0.16, 0.86, -0.08),
  );
  g.scale.setScalar(scale);
  return g;
}

/** Tela em um pedestal, com a textura viva do painel. */
function screenPanel(tex: THREE.Texture) {
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.set(0, 1.25, 0.07);
  face.rotation.x = -0.12;
  const frameBox = box(1.72, 1.1, 0.1, M.dark, 0, 0.7, 0);
  frameBox.rotation.x = -0.12;
  return group(box(0.5, 0.06, 0.34, M.dark), box(0.08, 0.72, 0.08, M.steel), frameBox, face);
}

/** Materiais das telas de computador (o mundo troca por telas animadas quando alguém senta na mesa). */
export const SCREEN_MATS: THREE.Material[] = [M.screenA, M.screenB, M.screenC];

/** Tapetes: qualquer um pode ter o desenho trocado (item.cfg.rs = { p, c, f }). */
export const RUG_RE = /^(rug|pk_tapete)/;
const rugDef = (label: string, w: number, d: number, f: string): Def => ({
  label,
  w,
  d,
  blocks: false,
  build: (it) => buildRug(w, d, { p: it?.cfg?.rs?.p ?? 17, c: it?.cfg?.rs?.c ?? 0, f: it?.cfg?.rs?.f ?? f }),
});

/** Plantas do jardim: modelo, tamanho e cores podem ser trocados (item.cfg.tr = { v, s, l, t }). */
export const PLANT_VARIANTS: Record<string, [string, string][]> = {
  tree: [["tree_oak", "Carvalho"], ["tree_fat", "Copa larga"], ["tree_pine", "Pinheiro"], ["tree_pine_tall", "Pinheiro alto"], ["round", "Redonda"]],
  pine: [["tree_pine", "Pinheiro"], ["tree_pine_tall", "Pinheiro alto"], ["tree_oak", "Carvalho"], ["tree_fat", "Copa larga"], ["round", "Redonda"]],
  bush: [["bush", "Arbusto"], ["bush_large", "Arbusto grande"], ["round", "Redondo"]],
};
const hashStr = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Pinta só a folhagem (verdes) e o tronco (marrons) de um modelo de planta. */
function tintPlant(obj: THREE.Object3D, leaf?: string, trunk?: string) {
  if (!leaf && !trunk) return;
  const L = leaf ? new THREE.Color(leaf) : null;
  const T = trunk ? new THREE.Color(trunk) : null;
  const lh = { h: 0, s: 0, l: 0 };
  const th = { h: 0, s: 0, l: 0 };
  L?.getHSL(lh);
  T?.getHSL(th);
  const done = new Map<THREE.Material, THREE.Material>();
  const fix = (mat: THREE.Material) => {
    const hit = done.get(mat);
    if (hit) return hit;
    const src = mat as THREE.MeshToonMaterial;
    if (!src.color) return mat;
    const o = { h: 0, s: 0, l: 0 };
    src.color.getHSL(o);
    const green = o.h > 0.15 && o.h < 0.5 && o.s > 0.12;
    const target = green ? L : T;
    const t = green ? lh : th;
    if (!target) return mat;
    const c = src.clone();
    c.color.setHSL(t.h, t.s, THREE.MathUtils.clamp(o.l * 0.5 + t.l * 0.5, 0.04, 0.96));
    done.set(mat, c);
    return c;
  };
  obj.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(fix) : fix(mesh.material);
  });
}

function plantBuild(kind: "tree" | "pine" | "bush", size: number, it: Item | undefined, fallback: () => THREE.Object3D): THREE.Object3D {
  const vars = PLANT_VARIANTS[kind];
  const tr = it?.cfg?.tr ?? {};
  // sem escolha: o modelo vem do id do item (sempre o mesmo, não sorteia a cada recarga)
  const key: string = tr.v ?? vars[it ? hashStr(it.id) % Math.min(2, vars.length) : 0][0];
  const fb = key === "round" ? fallback() : null;
  const o = fb ?? model(key, size, size, { fit: "width" }) ?? fallback();
  const g = new THREE.Group();
  g.add(o);
  tintPlant(o, tr.l, tr.t);
  const sc = Number(tr.s) > 0 ? Math.max(0.5, Math.min(2, Number(tr.s))) : 1;
  g.scale.setScalar(sc);
  return g;
}

export const DEFS: Record<string, Def> = {
  wall: {
    label: "Parede",
    w: 1,
    d: 1,
    blocks: true,
    build: () => box(1, 1.3, 1, [M.wall, M.wall, M.cap, M.wall, M.wall, M.wall]),
  },
  window_wall: {
    label: "Parede com janela",
    w: 1,
    d: 1,
    blocks: true,
    build: () => box(1, 1.3, 1, [M.wall, M.wall, M.cap, M.wall, M.window, M.window]),
  },
  glass_wall: {
    label: "Divisória de vidro",
    w: 1,
    d: 0.2,
    blocks: true,
    build: () => group(box(1, 1.2, 0.08, M.glass), box(1, 0.06, 0.12, M.cap, 0, 1.2, 0), box(1, 0.06, 0.12, M.cap)),
  },
  desk: {
    label: "Mesa de trabalho",
    w: 2,
    d: 1,
    blocks: true,
    build: () => {
      const screens = [M.screenA, M.screenB, M.screenC];
      const pick = screens[Math.floor(Math.random() * screens.length)];
      return group(
        box(2, 0.06, 1, M.white, 0, 0.7, 0),
        box(0.06, 0.7, 0.9, M.grey, -0.95, 0, 0),
        box(0.06, 0.7, 0.9, M.grey, 0.95, 0, 0),
        box(1.84, 0.4, 0.04, M.offwhite, 0, 0.3, -0.42),
        monitor(-0.35, -0.22, pick),
        monitor(0.38, -0.25, screens[(screens.indexOf(pick) + 1) % 3]),
        box(0.5, 0.03, 0.16, M.dark, -0.3, 0.76, 0.18),
        box(0.08, 0.03, 0.1, M.dark, 0.1, 0.76, 0.2),
        cyl(0.05, 0.04, 0.1, M.orange, 0.7, 0.76, 0.2, 6),
      );
    },
  },
  chair: { label: "Cadeira", w: 0.6, d: 0.6, blocks: false, build: () => model("chair_blue", 0.6, 0.6, { height: 1 }) ?? officeChair() },
  office_chair: { label: "Cadeira giratória", w: 0.6, d: 0.6, blocks: false, build: officeChair },
  wood_chair: { label: "Cadeira de madeira", w: 0.6, d: 0.6, blocks: false, build: () => model("chair_wood", 0.6, 0.6, { height: 1 }) ?? woodChair() },
  stool: { label: "Banqueta", w: 0.5, d: 0.5, blocks: false, build: () => model("stool", 0.5, 0.5) ?? woodChair() },
  table: {
    label: "Mesa de reunião",
    w: 4,
    d: 1.6,
    blocks: true,
    build: () =>
      model("table_long", 4, 1.6) ??
      group(
        box(4, 0.1, 1.6, M.wood, 0, 0.66, 0),
        box(0.1, 0.66, 0.1, M.woodDark, -1.8, 0, -0.65),
        box(0.1, 0.66, 0.1, M.woodDark, 1.8, 0, -0.65),
        box(0.1, 0.66, 0.1, M.woodDark, -1.8, 0, 0.65),
        box(0.1, 0.66, 0.1, M.woodDark, 1.8, 0, 0.65),
        box(0.36, 0.02, 0.26, M.dark, -0.9, 0.76, 0.1),
        box(0.34, 0.2, 0.02, M.screenA, -0.9, 0.78, -0.02),
        cyl(0.06, 0.05, 0.12, M.white, 0.8, 0.76, 0.2, 6),
      ),
  },
  table_round: {
    label: "Mesa redonda",
    w: 1.2,
    d: 1.2,
    blocks: true,
    build: () => group(cyl(0.6, 0.6, 0.06, M.white, 0, 0.66, 0, 12), cyl(0.06, 0.06, 0.66, M.grey), cyl(0.3, 0.3, 0.04, M.grey), cyl(0.06, 0.05, 0.12, M.orange, 0.15, 0.72, 0.1, 6)),
  },
  coffee_table: {
    label: "Mesa de centro",
    w: 1.4,
    d: 0.8,
    blocks: true,
    build: () => model("table_low", 1.4, 0.8) ?? group(box(1.4, 0.08, 0.8, M.wood, 0, 0.32, 0), box(1.2, 0.32, 0.6, M.woodDark), box(0.3, 0.04, 0.22, M.blue, -0.3, 0.4, 0), box(0.24, 0.06, 0.18, M.yellow, 0.3, 0.4, 0.05)),
  },
  toilet: {
    label: "Vaso sanitário",
    w: 0.5,
    d: 0.7,
    blocks: true,
    build: () =>
      group(
        box(0.42, 0.4, 0.5, M.white, 0, 0, 0.06),
        box(0.46, 0.06, 0.56, M.offwhite, 0, 0.4, 0.06),
        box(0.46, 0.42, 0.18, M.white, 0, 0.3, -0.24),
        box(0.1, 0.04, 0.06, M.steel, 0.12, 0.72, -0.24),
      ),
  },
  sink: {
    label: "Pia do banheiro",
    w: 0.8,
    d: 0.5,
    blocks: true,
    build: () =>
      group(
        box(0.8, 0.82, 0.48, M.offwhite),
        box(0.56, 0.05, 0.34, M.white, 0, 0.82, 0.02),
        box(0.06, 0.18, 0.06, M.steel, 0, 0.84, -0.17),
        box(0.06, 0.04, 0.14, M.steel, 0, 0.98, -0.12),
        box(0.7, 0.6, 0.04, M.glass, 0, 1.1, -0.24),
      ),
  },
  stall: {
    label: "Divisória de banheiro",
    w: 1,
    d: 0.1,
    blocks: true,
    build: () => group(box(1, 1.7, 0.06, M.steel, 0, 0.15, 0), box(0.06, 0.15, 0.06, M.dark, -0.45), box(0.06, 0.15, 0.06, M.dark, 0.45)),
  },
  beanbag: {
    label: "Puff",
    w: 0.9,
    d: 0.9,
    blocks: false,
    build: () => {
      const b = blob(0.45, M.purple, 0, 0.3, 0);
      b.scale.set(1, 0.65, 1);
      const t = blob(0.3, M.purple, 0, 0.5, -0.18);
      t.scale.set(1.2, 0.8, 0.7);
      return group(b, t);
    },
  },
  pool_table: {
    label: "Mesa de sinuca",
    w: 2.4,
    d: 1.4,
    blocks: true,
    interactive: true,
    build: () => {
      const felt = toon("#2f8a5a");
      return group(
        box(0.14, 0.62, 0.14, M.woodDark, -1.05, 0, -0.55),
        box(0.14, 0.62, 0.14, M.woodDark, 1.05, 0, -0.55),
        box(0.14, 0.62, 0.14, M.woodDark, -1.05, 0, 0.55),
        box(0.14, 0.62, 0.14, M.woodDark, 1.05, 0, 0.55),
        box(2.4, 0.14, 1.4, M.woodDark, 0, 0.62, 0),
        box(2.16, 0.04, 1.16, felt, 0, 0.76, 0),
        // bolas paradas de enfeite (somem quando tem jogo: aí entram as bolas de verdade)
        Object.assign(
          group(
            blob(0.05, M.white, 0.5, 0.82, 0),
            blob(0.05, M.red, -0.4, 0.82, 0.1),
            blob(0.05, M.yellow, -0.48, 0.82, -0.05),
            blob(0.05, M.blue, -0.32, 0.82, -0.08),
            box(1.4, 0.03, 0.03, M.beige, 0.1, 0.84, 0.3),
          ),
          { name: "pool-deco" },
        ),
      );
    },
  },
  ping_pong: {
    label: "Mesa de pingue-pongue",
    w: 2.6,
    d: 1.5,
    blocks: true,
    interactive: true,
    build: () => {
      const top = toon("#2e5fa8");
      return group(
        box(0.1, 0.7, 0.1, M.dark, -1.1, 0, -0.6),
        box(0.1, 0.7, 0.1, M.dark, 1.1, 0, -0.6),
        box(0.1, 0.7, 0.1, M.dark, -1.1, 0, 0.6),
        box(0.1, 0.7, 0.1, M.dark, 1.1, 0, 0.6),
        box(2.6, 0.06, 1.5, top, 0, 0.7, 0),
        box(2.6, 0.065, 0.02, M.white, 0, 0.7, 0),
        box(0.02, 0.065, 1.5, M.white, 0, 0.7, 0),
        box(0.02, 0.16, 1.6, M.white, 0, 0.76, 0),
      );
    },
  },
  arcade: {
    label: "Fliperama",
    w: 0.8,
    d: 0.8,
    blocks: true,
    build: () => {
      const screen = new THREE.MeshBasicMaterial({ color: 0x5ec8ff });
      const scr = box(0.56, 0.42, 0.04, screen, 0, 1.1, 0.26);
      scr.rotation.x = -0.2;
      return group(box(0.72, 1.7, 0.7, M.purple), box(0.74, 0.12, 0.3, M.dark, 0, 0.88, 0.3), scr, box(0.72, 0.16, 0.66, M.neonToon, 0, 1.6, 0.02), blob(0.04, M.red, -0.15, 1.02, 0.36), blob(0.04, M.yellow, 0.05, 1.02, 0.36));
    },
  },
  bed: {
    label: "Cama de descanso",
    w: 1.2,
    d: 2.1,
    blocks: true,
    build: () =>
      group(
        box(1.2, 0.3, 2.1, M.woodDark),
        box(1.12, 0.18, 2.0, M.white, 0, 0.3, 0),
        box(0.9, 0.12, 0.4, M.offwhite, 0, 0.48, -0.75),
        box(1.14, 0.08, 1.2, M.blue, 0, 0.48, 0.38),
        box(1.2, 0.7, 0.1, M.woodDark, 0, 0, -1.02),
      ),
  },
  conf_table: {
    label: "Mesa de reunião executiva",
    w: 4,
    d: 1.6,
    blocks: true,
    build: () => {
      const top = toon("#4a3326");
      const edge = toon("#2a1d16");
      const base = toon("#23252c");
      const chrome = toon("#b9bcc4");
      return group(
        box(1.0, 0.68, 0.5, base, -1.1, 0, 0),
        box(1.0, 0.68, 0.5, base, 1.1, 0, 0),
        box(1.2, 0.04, 0.6, chrome, -1.1, 0, 0),
        box(1.2, 0.04, 0.6, chrome, 1.1, 0, 0),
        box(4, 0.06, 1.6, edge, 0, 0.68, 0),
        box(3.92, 0.02, 1.52, top, 0, 0.74, 0),
        // caixa de tomadas e telefone de conferência no centro
        box(0.5, 0.02, 0.16, chrome, 0, 0.76, 0),
        box(0.26, 0.04, 0.26, base, 0.9, 0.76, 0.1),
      );
    },
  },
  exec_chair: {
    label: "Cadeira executiva",
    w: 0.6,
    d: 0.6,
    blocks: false,
    build: () => {
      const leather = toon("#1f2128");
      const seam = toon("#30333d");
      const chrome = toon("#b9bcc4");
      const base = group(
        box(0.06, 0.34, 0.06, chrome, 0, 0.06, 0),
        box(0.56, 0.04, 0.07, chrome, 0, 0.04, 0),
        box(0.07, 0.04, 0.56, chrome, 0, 0.04, 0),
      );
      return group(
        base,
        box(0.54, 0.1, 0.52, leather, 0, 0.4, 0.02),
        box(0.48, 0.03, 0.44, seam, 0, 0.5, 0.04),
        box(0.52, 0.72, 0.1, leather, 0, 0.5, -0.24),
        box(0.4, 0.5, 0.02, seam, 0, 0.62, -0.185),
        box(0.06, 0.04, 0.36, chrome, -0.29, 0.62, 0.0),
        box(0.06, 0.04, 0.36, chrome, 0.29, 0.62, 0.0),
        box(0.04, 0.16, 0.04, chrome, -0.29, 0.48, 0.1),
        box(0.04, 0.16, 0.04, chrome, 0.29, 0.48, 0.1),
      );
    },
  },
  cleiton: {
    label: "Cleiton (Ouvidoria)",
    w: 0.8,
    d: 0.8,
    blocks: true,
    interactive: true,
    build: () => cleiton(),
  },
  ouvidoria_sign: {
    label: "Placa da Ouvidoria",
    w: 1.2,
    d: 0.1,
    blocks: false,
    build: () => {
      const tex = (() => {
        const c = document.createElement("canvas");
        c.width = 256;
        c.height = 96;
        const g = c.getContext("2d")!;
        g.fillStyle = "#1d2433";
        g.fillRect(0, 0, 256, 96);
        g.strokeStyle = "#C8F501";
        g.lineWidth = 6;
        g.strokeRect(5, 5, 246, 86);
        g.fillStyle = "#C8F501";
        g.font = "bold 40px sans-serif";
        g.textAlign = "center";
        g.fillText("OUVIDORIA", 128, 50);
        g.fillStyle = "#f2f0ea";
        g.font = "20px sans-serif";
        g.fillText("atendente: Cleiton", 128, 80);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })();
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), new THREE.MeshBasicMaterial({ map: tex }));
      face.position.set(0, 1.75, 0.04);
      return group(box(0.05, 1.52, 0.05, M.steel, -0.5, 0, -0.03), box(0.05, 1.52, 0.05, M.steel, 0.5, 0, -0.03), box(1.16, 0.46, 0.04, M.dark, 0, 1.52, 0), face);
    },
  },
  sofa: {
    label: "Sofá",
    w: 3,
    d: 1,
    blocks: true,
    build: () =>
      model("couch", 3, 1) ??
      group(
        box(3, 0.4, 1, M.beige),
        box(3, 0.62, 0.26, M.beige, 0, 0.3, -0.37),
        box(0.26, 0.28, 1, M.beige, -1.37, 0.4, 0),
        box(0.26, 0.28, 1, M.beige, 1.37, 0.4, 0),
        box(1.22, 0.12, 0.7, M.cushion, -0.62, 0.4, 0.08),
        box(1.22, 0.12, 0.7, M.cushion, 0.62, 0.4, 0.08),
        box(0.36, 0.3, 0.12, M.neonToon, -1.0, 0.52, -0.2),
      ),
  },
  armchair: {
    label: "Poltrona",
    w: 1,
    d: 1,
    blocks: true,
    build: () => model("armchair", 1, 1) ?? group(box(0.9, 0.38, 0.86, M.orange), box(0.9, 0.62, 0.22, M.orange, 0, 0.3, -0.32), box(0.18, 0.24, 0.86, M.orangeDark, -0.36, 0.38, 0), box(0.18, 0.24, 0.86, M.orangeDark, 0.36, 0.38, 0)),
  },
  plant: { label: "Planta", w: 0.7, d: 0.7, blocks: true, build: () => plantPot(M.pot) },
  plant_big: {
    label: "Planta grande",
    w: 1,
    d: 1,
    blocks: true,
    build: () => {
      const g = plantPot(M.potWhite, 1.4);
      g.add(blob(0.26, M.leafLight, -0.1, 1.55, 0.1), blob(0.2, M.leaf, 0.2, 1.4, -0.12));
      return g;
    },
  },
  bamboo: {
    label: "Bambu",
    w: 1.2,
    d: 0.6,
    blocks: true,
    build: () => {
      const g = group(box(1.2, 0.36, 0.6, M.dark));
      const r = rng(3);
      for (let i = 0; i < 9; i++) {
        const h = 1.1 + r() * 0.6;
        g.add(box(0.06, h, 0.06, i % 2 ? M.leafLight : M.leaf, -0.5 + (i % 5) * 0.25, 0.36, -0.15 + Math.floor(i / 5) * 0.3));
        g.add(blob(0.12, M.leafLight, -0.5 + (i % 5) * 0.25, 0.36 + h, -0.15 + Math.floor(i / 5) * 0.3));
      }
      return g;
    },
  },
  rug: {
    label: "Tapete",
    w: 4,
    d: 3,
    blocks: false,
    build: () => model("rug_stripes", 4, 3) ?? (() => {
      const tex = pixelTexture(32, 24, (g) => {
        g.fillStyle = "#e9e4f5";
        g.fillRect(0, 0, 32, 24);
        g.fillStyle = "#b9b0de";
        g.fillRect(1, 1, 30, 22);
        g.fillStyle = "#e9e4f5";
        g.fillRect(3, 3, 26, 18);
        g.fillStyle = "#b9b0de";
        for (let x = 6; x < 27; x += 5) for (let y = 6; y < 19; y += 5) g.fillRect(x, y, 2, 2);
        g.fillStyle = "#C8F501";
        g.fillRect(15, 11, 2, 2);
      });
      const top = toon("#ffffff", { map: tex });
      const r = new THREE.Mesh(geo.box(4, 0.03, 3), [M.white, M.white, top, M.white, M.white, M.white]);
      r.position.y = 0.015;
      r.receiveShadow = true;
      return r;
    })(),
  },
  rug_oval: { label: "Tapete oval", w: 3, d: 2, blocks: false, build: () => model("rug_oval", 3, 2) ?? new THREE.Group() },
  rugc_s: rugDef("Tapete estilo (pequeno)", 2, 1.4, "r"),
  rugc_m: rugDef("Tapete estilo (médio)", 3, 2, "r"),
  rugc_l: rugDef("Tapete estilo (grande)", 4, 3, "r"),
  rugc_xl: rugDef("Tapete estilo (extra grande)", 6, 4, "r"),
  rugc_xxl: rugDef("Tapete estilo (sala inteira)", 7.4, 12.4, "r"),
  rugc_runner: rugDef("Tapete estilo (passadeira)", 4, 1.2, "r"),
  rugc_oval: rugDef("Tapete estilo (oval)", 3.2, 2.2, "o"),
  rugc_round: rugDef("Tapete estilo (redondo)", 2.4, 2.4, "c"),
  lamp: {
    label: "Luminária",
    w: 0.5,
    d: 0.5,
    blocks: true,
    build: () => model("lamp_standing", 0.5, 0.5, { height: 1.7 }) ?? group(cyl(0.2, 0.24, 0.04, M.dark), cyl(0.02, 0.02, 1.4, M.dark), cyl(0.16, 0.28, 0.3, M.yellow, 0, 1.35, 0)),
  },
  tv: {
    label: "TV / Tela",
    w: 3,
    d: 0.3,
    blocks: true,
    build: () => group(box(3, 1.4, 0.1, M.dark, 0, 0.5, 0), box(2.85, 1.25, 0.02, M.screenA, 0, 0.575, 0.06), box(0.8, 0.5, 0.2, M.dark)),
  },
  whiteboard: {
    label: "Quadro",
    w: 2,
    d: 0.3,
    blocks: true,
    build: () =>
      group(
        box(2, 1.1, 0.06, M.board, 0, 0.6, 0),
        box(2.06, 0.05, 0.14, M.grey, 0, 0.58, 0.04),
        box(0.6, 0.04, 0.01, M.blue, -0.4, 1.3, 0.035),
        box(0.4, 0.04, 0.01, M.red, -0.5, 1.2, 0.035),
        box(0.5, 0.3, 0.01, M.yellow, 0.4, 1.15, 0.035),
      ),
  },
  bookshelf: {
    label: "Estante",
    w: 2,
    d: 0.5,
    blocks: true,
    build: () => model("shelf_decorated", 2, 0.5) ?? (() => {
      const g = group(box(2, 1.8, 0.5, M.woodDark));
      const cols = [M.red, M.blue, M.yellow, M.white, M.purple, M.neonToon, M.leaf];
      const r = rng(11);
      for (let s = 0; s < 3; s++) {
        g.add(box(1.88, 0.04, 0.06, M.wood, 0, 0.42 + s * 0.5, 0.24));
        let x = -0.86;
        while (x < 0.82) {
          const w = 0.1 + r() * 0.06;
          if (r() > 0.12) g.add(box(w, 0.34 + r() * 0.08, 0.06, cols[Math.floor(r() * cols.length)], x + w / 2, 0.46 + s * 0.5, 0.23));
          x += w + 0.015;
        }
      }
      return g;
    })(),
  },
  cabinet: { label: "Gaveteiro", w: 1.2, d: 0.5, blocks: true, build: () => model("cabinet", 1.2, 0.5) ?? box(1.2, 0.8, 0.5, M.woodDark) },
  cactus: { label: "Cacto", w: 0.6, d: 0.6, blocks: true, build: () => model("cactus", 0.6, 0.6) ?? plantPot(M.pot) },
  cactus_small: { label: "Cacto pequeno", w: 0.3, d: 0.3, blocks: false, build: () => model("cactus_small", 0.3, 0.3) ?? plantPot(M.pot, 0.4) },
  counter: {
    label: "Balcão",
    w: 3,
    d: 0.8,
    blocks: true,
    build: () => group(box(3, 0.88, 0.8, M.offwhite), box(3.05, 0.06, 0.85, M.white, 0, 0.88, 0), box(0.5, 0.3, 0.4, M.steel, -0.8, 0.94, -0.1), cyl(0.12, 0.1, 0.12, M.water, 0.6, 0.94, 0.1, 8)),
  },
  coffee: {
    interactive: true,
    label: "Café",
    w: 2,
    d: 0.8,
    blocks: true,
    build: () =>
      group(
        box(2, 0.88, 0.8, M.offwhite),
        box(2.05, 0.06, 0.85, M.white, 0, 0.88, 0),
        box(0.5, 0.56, 0.45, M.dark, -0.5, 0.94, -0.1),
        box(0.12, 0.06, 0.06, M.neon, -0.5, 1.36, 0.13),
        cyl(0.05, 0.04, 0.1, M.white, 0.3, 0.94, 0.1, 6),
        cyl(0.05, 0.04, 0.1, M.orange, 0.5, 0.94, 0.05, 6),
      ),
  },
  water: {
    interactive: true,
    label: "Bebedouro",
    w: 0.6,
    d: 0.6,
    blocks: true,
    build: () => group(box(0.5, 0.9, 0.5, M.white), box(0.4, 0.04, 0.2, M.grey, 0, 0.6, 0.22), cyl(0.2, 0.2, 0.5, M.water, 0, 0.9, 0, 10)),
  },
  speaker: {
    label: "Caixa de som",
    w: 0.6,
    d: 0.6,
    blocks: true,
    interactive: true,
    build: () => group(box(0.55, 1.1, 0.5, M.dark), cyl(0.18, 0.18, 0.02, M.steel, 0, 0.7, 0.26, 12).rotateX(Math.PI / 2), cyl(0.09, 0.09, 0.02, M.steel, 0, 0.32, 0.26, 10).rotateX(Math.PI / 2)),
  },
  neon_logo: {
    label: "Logo neon",
    w: 3,
    d: 0.4,
    blocks: true,
    build: () => {
      const l = logoMesh(1.8, 0.08, M.neon);
      l.position.set(0, 0.95, 0.05);
      return group(box(2.4, 1.6, 0.12, M.dark, 0, 0.15, -0.05), l);
    },
  },
  floor_logo: {
    label: "Logo no piso",
    w: 6,
    d: 6,
    blocks: false,
    // desenhada direto na textura do piso (World.makeFloorTexture); aqui só um marcador
    build: () => new THREE.Group(),
  },
  fridge: {
    label: "Geladeira",
    w: 0.9,
    d: 0.8,
    blocks: true,
    interactive: true,
    build: () =>
      group(
        box(0.9, 1.9, 0.75, M.white),
        box(0.88, 0.02, 0.02, M.grey, 0, 1.25, 0.38),
        box(0.05, 0.4, 0.05, M.grey, 0.36, 1.4, 0.39),
        box(0.05, 0.6, 0.05, M.grey, 0.36, 0.5, 0.39),
        box(0.16, 0.12, 0.01, M.neonToon, -0.2, 1.6, 0.38),
      ),
  },
  microwave: {
    label: "Micro-ondas",
    w: 0.8,
    d: 0.6,
    blocks: true,
    interactive: true,
    build: () =>
      group(
        box(0.8, 0.88, 0.6, M.offwhite),
        box(0.82, 0.05, 0.62, M.white, 0, 0.88, 0),
        box(0.58, 0.34, 0.42, M.dark, -0.05, 0.93, 0),
        box(0.36, 0.24, 0.01, M.screenA, -0.1, 0.98, 0.215),
        box(0.08, 0.26, 0.01, M.steel, 0.2, 0.97, 0.215),
      ),
  },
  fin_panel: {
    label: "Painel financeiro",
    w: 1.8,
    d: 0.4,
    blocks: true,
    interactive: true,
    build: (it) => screenPanel(widgetTexture(it?.id ?? "x", "fin_panel", it?.cfg ?? {})),
  },
  goal_panel: {
    label: "Painel de meta",
    w: 1.8,
    d: 0.4,
    blocks: true,
    interactive: true,
    build: (it) => screenPanel(widgetTexture(it?.id ?? "x", "goal_panel", it?.cfg ?? {})),
  },
  weather_panel: {
    label: "Painel de clima",
    w: 1.8,
    d: 0.4,
    blocks: true,
    interactive: true,
    build: (it) => screenPanel(widgetTexture(it?.id ?? "x", "weather_panel", it?.cfg ?? {})),
  },
  clock_panel: {
    label: "Relógio mundial",
    w: 1.8,
    d: 0.4,
    blocks: true,
    interactive: true,
    build: (it) => screenPanel(widgetTexture(it?.id ?? "x", "clock_panel", it?.cfg ?? {})),
  },
  api_panel: {
    label: "Painel de API",
    w: 1.8,
    d: 0.4,
    blocks: true,
    interactive: true,
    build: (it) => screenPanel(widgetTexture(it?.id ?? "x", "api_panel", it?.cfg ?? {})),
  },
  // ---------- enfeites de datas especiais
  xmas_tree: {
    label: "Árvore de Natal",
    w: 1.4,
    d: 1.4,
    blocks: true,
    decor: true,
    build: () => {
      const g = group(cyl(0.12, 0.14, 0.4, M.trunk), box(0.5, 0.25, 0.5, M.red));
      const cones: [number, number, number][] = [[0.75, 0.7, 0.4], [0.58, 0.6, 0.95], [0.4, 0.5, 1.4]];
      for (const [r, h, y] of cones) {
        const c = new THREE.Mesh(geo.cone(r, h, 8), M.leafDark);
        c.position.y = y + h / 2;
        c.castShadow = true;
        g.add(c);
      }
      const balls = [M.red, M.yellow, M.blue, M.neonToon];
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4;
        const y = 0.55 + (i / 14) * 1.25;
        const r = 0.72 - (y - 0.4) * 0.38;
        g.add(blob(0.05, balls[i % 4], Math.cos(a) * r, y, Math.sin(a) * r));
      }
      const star = blob(0.12, new THREE.MeshBasicMaterial({ color: 0xffd35c }), 0, 2.0, 0);
      g.add(star);
      return g;
    },
  },
  gift: {
    label: "Presente",
    w: 0.5,
    d: 0.5,
    blocks: false,
    decor: true,
    build: () => {
      const cols = [M.red, M.blue, M.neonToon, M.purple, M.yellow];
      const c = cols[Math.floor(Math.random() * cols.length)];
      const s = 0.3 + Math.random() * 0.15;
      return group(box(s, s, s, c), box(s + 0.01, s + 0.01, 0.06, M.white), box(0.06, s + 0.01, s + 0.01, M.white));
    },
  },
  xmas_lights: { label: "Pisca-pisca", w: 0.1, d: 0.1, blocks: false, decor: true, build: () => new THREE.Group() },
  balloons: {
    label: "Balões",
    w: 0.6,
    d: 0.6,
    blocks: false,
    decor: true,
    build: () => {
      const g = group(box(0.16, 0.06, 0.16, M.dark));
      const cols = [M.neonToon, M.white, M.dark, M.neonToon];
      cols.forEach((c, i) => {
        const x = (i % 2 ? 0.18 : -0.18) * (i > 1 ? 0.6 : 1);
        const y = 1.5 + (i % 2) * 0.25 + (i > 1 ? 0.4 : 0);
        g.add(box(0.01, y - 0.05, 0.01, M.grey, x * 0.5, 0.05, 0));
        const b = new THREE.Mesh(geo.sphere(0.2), c);
        b.scale.y = 1.2;
        b.position.set(x, y + 0.2, 0);
        b.castShadow = true;
        g.add(b);
      });
      return g;
    },
  },
  flags: {
    label: "Bandeirinhas",
    w: 0.2,
    d: 0.2,
    blocks: false,
    decor: true,
    build: () => {
      const g = new THREE.Group();
      const cols = [M.red, M.yellow, M.blue, M.leaf, M.purple, M.orange];
      for (let line = 0; line < 2; line++)
        for (let i = 0; i < 18; i++) {
          const x = -6 + i * 0.7;
          const y = 2.6 - Math.sin((i / 17) * Math.PI) * 0.5;
          const fl = new THREE.Mesh(geo.cone(0.16, 0.3, 3), cols[(i + line) % cols.length]);
          fl.rotation.x = Math.PI;
          fl.position.set(x, y, line * 2.5 - 1.2);
          g.add(fl);
        }
      return g;
    },
  },
  bonfire: {
    label: "Fogueira",
    w: 1,
    d: 1,
    blocks: true,
    decor: true,
    build: () => {
      const g = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const l = cyl(0.06, 0.06, 0.8, M.trunk);
        l.rotation.z = Math.PI / 2;
        l.rotation.y = (i / 5) * Math.PI;
        l.position.y = 0.08;
        g.add(l);
      }
      g.add(blob(0.28, new THREE.MeshBasicMaterial({ color: 0xff8a2b }), 0, 0.35, 0), blob(0.18, new THREE.MeshBasicMaterial({ color: 0xffd35c }), 0, 0.55, 0));
      return g;
    },
  },
  pumpkin: {
    label: "Abóbora",
    w: 0.6,
    d: 0.6,
    blocks: true,
    decor: true,
    build: () => {
      const p = new THREE.Mesh(geo.sphere(0.3), M.orange);
      p.scale.y = 0.75;
      p.position.y = 0.22;
      p.castShadow = true;
      return group(p, box(0.06, 0.12, 0.06, M.leafDark, 0, 0.42, 0), box(0.08, 0.06, 0.02, M.dark, -0.1, 0.27, 0.28), box(0.08, 0.06, 0.02, M.dark, 0.1, 0.27, 0.28), box(0.18, 0.04, 0.02, M.dark, 0, 0.15, 0.29));
    },
  },
  egg: {
    label: "Ovo de Páscoa",
    w: 0.4,
    d: 0.4,
    blocks: false,
    decor: true,
    build: () => {
      const cols = [M.purple, M.yellow, M.blue, M.red, M.neonToon];
      const e = new THREE.Mesh(geo.sphere(0.16), cols[Math.floor(Math.random() * cols.length)]);
      e.scale.y = 1.3;
      e.position.y = 0.2;
      e.castShadow = true;
      return group(e, box(0.33, 0.04, 0.04, M.white, 0, 0.2, 0));
    },
  },
  neon_sale: {
    label: "Placa Black Friday",
    w: 2,
    d: 0.3,
    blocks: true,
    decor: true,
    build: () => {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 192;
      const g = c.getContext("2d")!;
      g.fillStyle = "#0d0d0d";
      g.fillRect(0, 0, 512, 192);
      g.font = "800 76px Montserrat, sans-serif";
      g.fillStyle = "#C8F501";
      g.textAlign = "center";
      g.fillText("BLACK", 256, 90);
      g.fillText("FRIDAY", 256, 168);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.72), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
      face.position.set(0, 1.3, 0.07);
      return group(box(2, 0.8, 0.12, M.dark, 0, 0.9, 0), box(0.08, 0.9, 0.08, M.dark, -0.7, 0, 0), box(0.08, 0.9, 0.08, M.dark, 0.7, 0, 0), face);
    },
  },
  tree: {
    label: "Árvore",
    w: 1.6,
    d: 1.6,
    blocks: true,
    outdoor: true,
    build: (it) => plantBuild("tree", 1.8, it, () => group(cyl(0.16, 0.22, 1.1, M.trunk, 0, 0, 0, 6), blob(0.85, M.leaf, 0, 1.55, 0))),
  },
  pine: {
    label: "Pinheiro",
    w: 1.2,
    d: 1.2,
    blocks: true,
    outdoor: true,
    build: (it) => plantBuild("pine", 1.5, it, () => group(cyl(0.12, 0.16, 0.8, M.trunk), blob(0.7, M.leafDark, 0, 1.4, 0))),
  },
  bush: {
    label: "Arbusto",
    w: 1,
    d: 1,
    blocks: true,
    outdoor: true,
    build: (it) => plantBuild("bush", 1.1, it, () => group(blob(0.42, M.leafDark, 0, 0.32, 0), blob(0.34, M.leaf, 0.25, 0.4, 0.1))),
  },
  flower: { label: "Flores", w: 0.5, d: 0.5, blocks: false, outdoor: true, build: () => model("flower", 0.5, 0.5, { fit: "width" }) ?? new THREE.Group() },
  rock: { label: "Pedra", w: 0.7, d: 0.7, blocks: true, outdoor: true, build: () => model("rock", 0.7, 0.7) ?? blob(0.3, M.grey, 0, 0.2, 0) },
  stump: { label: "Toco", w: 0.6, d: 0.6, blocks: true, outdoor: true, build: () => model("stump", 0.6, 0.6) ?? cyl(0.25, 0.3, 0.3, M.trunk) },
};

/** Tipos que aparecem na paleta do editor. */

// ---------------------------------------------------------------------------- mais mobília (modelos CC0)
/** Móvel simples feito de um modelo (com caixa de reserva se o modelo não carregar). */
function m(label: string, key: string, w: number, d: number, blocks: boolean, h = 0.8, opts: { height?: number } = {}, fallback?: THREE.Material): Def {
  return { label, w, d, blocks, build: () => model(key, w, d, opts) ?? (blocks ? box(w, h, d, fallback ?? M.woodDark) : new THREE.Group()) };
}
/** Sobe um quadro para a altura de pendurar. */
function hung(o: THREE.Object3D | null) {
  const g = new THREE.Group();
  if (o) {
    o.position.y += 1.15;
    g.add(o);
  } else g.add(box(1, 0.7, 0.05, M.dark, 0, 1.15, 0));
  return g;
}
const EXTRA_DEFS: Record<string, Def> = {
  // assentos
  armchair_plain: m("Poltrona simples", "armchair_plain", 1, 1, true, 0.7),
  sofa_plain: m("Sofá simples", "couch_plain", 2.4, 1.1, true, 0.7),
  chair_c: m("Cadeira estofada", "chair_c", 0.6, 0.6, false, 0.9, { height: 1 }),
  chair_b_wood: m("Cadeira de madeira 2", "chair_b_wood", 0.6, 0.6, false, 0.9, { height: 1 }),
  stool_wood: m("Banqueta de madeira", "stool_wood", 0.5, 0.5, false, 0.5),
  k_chair_a: m("Cadeira de refeitório", "k_chair_a", 0.55, 0.55, false, 0.9, { height: 0.95 }),
  k_chair_b: m("Cadeira de refeitório 2", "k_chair_b", 0.55, 0.55, false, 0.9, { height: 0.95 }),
  pillow_a: m("Almofada", "pillow_a", 0.6, 0.45, false, 0.2),
  pillow_b: m("Almofada listrada", "pillow_b", 0.6, 0.45, false, 0.2),
  // mesas
  k_table: m("Mesa de cozinha", "k_table", 1.2, 1.2, true, 0.75),
  k_table_dec: m("Mesa posta", "k_table_dec", 1.8, 1.2, true, 0.75),
  k_round: m("Mesa redonda grande", "k_round", 1.8, 1.8, true, 0.75),
  k_round_dec: m("Mesa redonda posta", "k_round_dec", 1.8, 1.8, true, 0.75),
  k_round_small: m("Mesa redonda pequena", "k_round_small", 0.9, 0.9, true, 0.75),
  // armários e estantes
  cabinet_plain: m("Gaveteiro liso", "cabinet_plain", 1.2, 0.6, true),
  cabinet_small: m("Criado-mudo", "cabinet_small", 0.6, 0.6, true, 0.6),
  cabinet_small_dec: m("Criado-mudo com abajur", "cabinet_small_dec", 0.6, 0.6, true, 0.6),
  shelf_small: m("Prateleira pequena", "shelf_small", 0.9, 0.45, true, 0.4),
  shelf_long: m("Prateleira comprida", "shelf_long", 1.8, 0.45, true, 0.4),
  shelf_small_dec: m("Prateleira com livros", "shelf_small_dec", 0.9, 0.5, true, 0.9),
  book_single: m("Livro", "book_single", 0.2, 0.3, false, 0.1),
  // quarto e descanso
  bed_double: m("Cama de casal", "bed_double_a", 2, 2, true, 0.6, {}, M.beige),
  bed_double_b: m("Cama de casal 2", "bed_double_b", 2, 2, true, 0.6, {}, M.beige),
  bed_single: m("Cama de solteiro", "bed_single", 1, 2, true, 0.6, {}, M.beige),
  // cozinha
  k_fridge: m("Geladeira duplex", "k_fridge", 1, 1.1, true, 1.8, {}, M.white),
  k_fridge_dec: m("Geladeira com ímãs", "k_fridge_dec", 1, 1.1, true, 1.8, {}, M.white),
  k_oven: m("Forno", "k_oven", 1, 1.1, true, 1, {}, M.grey),
  k_stove: m("Fogão", "k_stove", 1, 1.1, true, 0.9, {}, M.grey),
  k_counter: m("Bancada", "k_counter", 1, 1, true, 0.9),
  k_counter_dec: m("Bancada com utensílios", "k_counter_dec", 1, 1.1, true, 0.9),
  k_sink: m("Pia de cozinha", "k_sink", 1, 1, true, 0.9),
  k_cabinet: m("Armário de parede", "k_cabinet", 1, 0.5, true, 1),
  k_shelf_paper: m("Prateleira de cozinha", "k_shelf_paper", 1, 0.35, true, 0.8),
  k_dishrack: m("Escorredor de pratos", "k_dishrack", 0.6, 0.6, false, 0.5),
  k_jar: m("Pote", "k_jar", 0.3, 0.3, false, 0.4),
  k_towelrail: m("Porta-toalhas", "k_towelrail", 0.8, 0.25, false, 0.3),
  k_crate: m("Caixote", "k_crate", 0.8, 0.8, true, 0.35),
  k_crate_tomato: m("Caixote de tomates", "k_crate_tomato", 0.8, 0.8, true, 0.4),
  // decoração
  frame_wide: { label: "Quadro largo", w: 1.6, d: 0.2, blocks: false, build: () => hung(model("frame_wide", 1.6, 0.2)) },
  frame_medium: { label: "Quadro médio", w: 0.6, d: 0.2, blocks: false, build: () => hung(model("frame_medium", 0.6, 0.2)) },
  frame_standing: m("Porta-retrato", "frame_standing", 0.3, 0.2, false, 0.35),
  cactus_b: m("Cacto 2", "cactus_b", 0.6, 0.6, true, 0.6, {}, M.pot),
  cactus_small_b: m("Cacto pequeno 2", "cactus_small_b", 0.4, 0.4, false, 0.4, {}, M.pot),
  k_pillar: m("Pilar", "k_pillar", 0.5, 0.5, true, 2.7, { height: 2.7 }, M.white),
  // tapetes
  rug_oval_b: m("Tapete oval 2", "rug_oval_b", 3, 2, false),
  rug_rect: m("Tapete liso", "rug_rect", 3, 2, false),
  rug_rect_b: m("Tapete liso 2", "rug_rect_b", 3, 2, false),
  rug_stripes_b: m("Tapete listrado 2", "rug_stripes_b", 3, 2, false),
};
Object.assign(DEFS, EXTRA_DEFS);
// elevador: liga os andares (clique nele para subir ou descer). As portas abrem quando alguém chega perto.
DEFS.elevator = {
  label: "Elevador",
  w: 2,
  d: 1.4,
  blocks: true,
  interactive: true,
  build: () => {
    const steel = toon("#b9bec7");
    const steelDark = toon("#7d838e");
    const doorMat = toon("#d5d9e0");
    const g = new THREE.Group();
    // caixa (fundo e laterais) e moldura
    g.add(box(2, 2.6, 0.2, steelDark, 0, 0, -0.6), box(0.2, 2.6, 1.4, steelDark, -0.9, 0, 0), box(0.2, 2.6, 1.4, steelDark, 0.9, 0, 0));
    g.add(box(2, 0.4, 1.4, steelDark, 0, 2.6, 0));
    g.add(box(0.12, 2.3, 0.08, steel, -0.68, 0, 0.66), box(0.12, 2.3, 0.08, steel, 0.68, 0, 0.66), box(1.5, 0.14, 0.08, steel, 0, 2.3, 0.66));
    // piso da cabine e corrimão
    g.add(box(1.6, 0.04, 1.2, toon("#5d606c"), 0, 0, 0), box(1.3, 0.05, 0.05, steel, 0, 0.95, -0.45));
    // portas de correr
    const left = box(0.62, 2.28, 0.05, doorMat, -0.31, 0, 0.62);
    const right = box(0.62, 2.28, 0.05, doorMat, 0.31, 0, 0.62);
    // visor do andar (verde neon) e seta
    const display = box(0.5, 0.16, 0.04, toon("#0D0D0D"), 0, 2.42, 0.71);
    const lamp = new THREE.Mesh(geo.box(0.36, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0xc8f501 }));
    lamp.position.set(0, 2.5, 0.735);
    const btn = box(0.08, 0.16, 0.04, steel, 0.83, 1.05, 0.7);
    g.add(left, right, display, lamp, btn);
    g.userData.anim = { kind: "elevator", left, right, lamp, open: 0 };
    return g;
  },
};
// rádio retrô: toca links do YouTube para a sala (clique nele)
DEFS.radio = {
  label: "Rádio",
  w: 0.7,
  d: 0.4,
  blocks: true,
  interactive: true,
  build: () => {
    const body = box(0.62, 0.36, 0.3, M.wood, 0, 0.42, 0);
    const grill = box(0.26, 0.24, 0.02, M.dark, -0.13, 0.48, 0.15);
    const dial = box(0.18, 0.08, 0.02, M.yellow, 0.16, 0.6, 0.15);
    const knob1 = cyl(0.035, 0.035, 0.03, M.steel, 0.1, 0.48, 0.16, 8).rotateX(Math.PI / 2);
    const knob2 = cyl(0.035, 0.035, 0.03, M.steel, 0.22, 0.48, 0.16, 8).rotateX(Math.PI / 2);
    const ant = box(0.015, 0.4, 0.015, M.steel, 0.24, 0.78, -0.05);
    ant.rotation.z = -0.35;
    const stand = box(0.5, 0.42, 0.26, M.woodDark, 0, 0, 0);
    return group(stand, body, grill, dial, knob1, knob2, ant);
  },
};

// ---------------------------------------------------------------------------- quadros com imagem do computador
const photoCache = new Map<string, THREE.Texture>();
/** Textura da imagem guardada no item (data URL); placeholder enquanto não há imagem. */
function photoTexture(src?: string): THREE.Texture {
  if (src && photoCache.has(src)) return photoCache.get(src)!;
  if (!src) {
    return pixelTexture(32, 24, (g) => {
      g.fillStyle = "#e9e6df";
      g.fillRect(0, 0, 32, 24);
      g.fillStyle = "#c9c4ba";
      g.fillRect(4, 14, 10, 6);
      g.fillRect(12, 9, 12, 11);
      g.fillStyle = "#f2c14e";
      g.fillRect(22, 4, 4, 4);
    });
  }
  const img = new Image();
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  img.onload = () => (tex.needsUpdate = true);
  img.src = src;
  if (photoCache.size > 60) photoCache.clear();
  photoCache.set(src, tex);
  return tex;
}
/**
 * Quadro com foto. `kind`: "wall" (pendurado, encoste numa parede do fundo), "easel" (cavalete) ou "desk" (porta-retrato).
 * O tamanho segue a proporção da imagem, dentro do espaço do item.
 */
function photoFrame(it: Item | undefined, kind: "wall" | "easel" | "desk", maxW: number, maxH: number) {
  const cfg = it?.cfg ?? {};
  const aspect = Number(cfg.aspect) > 0 ? Number(cfg.aspect) : 4 / 3;
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  const g = new THREE.Group();
  const y = kind === "wall" ? 1.15 : kind === "easel" ? 0.75 : 0.05;
  const border = kind === "desk" ? 0.03 : 0.06;
  const frameMat = cfg.frame === "branco" ? M.white : cfg.frame === "madeira" ? M.wood : M.dark;
  const back = box(w + border * 2, h + border * 2, 0.05, frameMat, 0, y, 0);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: photoTexture(cfg.img), toneMapped: false }));
  pic.position.set(0, y + border + h / 2, 0.03);
  g.add(back, pic);
  if (kind === "easel") {
    const legs = [box(0.05, 1.5, 0.05, M.wood, -w / 3, 0, 0.12), box(0.05, 1.5, 0.05, M.wood, w / 3, 0, 0.12), box(0.05, 1.6, 0.05, M.wood, 0, 0, -0.25)];
    legs[0].rotation.x = legs[1].rotation.x = -0.12;
    legs[2].rotation.x = 0.2;
    g.add(...legs, box(w + 0.1, 0.05, 0.1, M.wood, 0, y - 0.05, 0.05));
  }
  if (kind === "desk") {
    const leg = box(0.03, h * 0.8, 0.03, frameMat, 0, 0, -0.08);
    leg.rotation.x = 0.35;
    g.add(leg);
    g.rotation.x = -0.12;
  }
  return g;
}
Object.assign(DEFS, {
  photo_wall: { label: "Quadro com foto (parede)", w: 1.4, d: 0.2, blocks: false, interactive: true, build: (it?: Item) => photoFrame(it, "wall", 1.3, 1.1) },
  photo_big: { label: "Quadro grande com foto", w: 2.2, d: 0.2, blocks: false, interactive: true, build: (it?: Item) => photoFrame(it, "wall", 2.1, 1.3) },
  photo_easel: { label: "Quadro no cavalete", w: 1.1, d: 0.6, blocks: true, interactive: true, build: (it?: Item) => photoFrame(it, "easel", 1, 0.9) },
  photo_desk: { label: "Porta-retrato com foto", w: 0.35, d: 0.2, blocks: false, interactive: true, build: (it?: Item) => photoFrame(it, "desk", 0.3, 0.25) },
} as Record<string, Def>);
export const PHOTO_TYPES = new Set(["photo_wall", "photo_big", "photo_easel", "photo_desk"]);
/** Itens de pendurar: encostam sozinhos nas paredes inteiras (fundo); longe delas ganham um pedestal. */
export const WALL_MOUNT = new Set(["photo_wall", "photo_big", "frame_wide", "frame_medium"]);
/** Altura da base dos itens de pendurar (m). */
export const MOUNT_Y = 1.15;
const PACK_TABLE_Y = 0.76;
const PACK_CEIL_Y = 2.45;

/** Reduz a imagem escolhida para guardar no escritório (lado maior até `max` px, JPEG). */
export async function imageToDataUrl(file: File, max = 480): Promise<{ img: string; aspect: number }> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem (JPG, PNG, WebP)");
  const url = URL.createObjectURL(file);
  try {
    const im = new Image();
    await new Promise((res, rej) => {
      im.onload = res;
      im.onerror = () => rej(new Error("Não consegui abrir essa imagem"));
      im.src = url;
    });
    const s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(im.naturalWidth * s));
    c.height = Math.max(1, Math.round(im.naturalHeight * s));
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(im, 0, 0, c.width, c.height);
    let q = 0.82;
    let out = c.toDataURL("image/jpeg", q);
    // mantém cada imagem pequena (o escritório inteiro vai numa mensagem só)
    while (out.length > 70_000 && q > 0.4) out = c.toDataURL("image/jpeg", (q -= 0.12));
    return { img: out, aspect: im.naturalWidth / im.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const PALETTE = Object.keys(DEFS).filter((k) => !DEFS[k].decor);

export function footprint(it: Item) {
  const d = DEFS[it.type];
  if (!d) return { w: 1, d: 1 };
  const r = ((it.rot % 360) + 360) % 360;
  if (r === 0 || r === 180) return { w: d.w, d: d.d };
  if (r === 90 || r === 270) return { w: d.d, d: d.w };
  // ângulo livre: caixa que envolve o móvel girado
  const a = (r * Math.PI) / 180, co = Math.abs(Math.cos(a)), si = Math.abs(Math.sin(a));
  return { w: d.w * co + d.d * si, d: d.w * si + d.d * co };
}

const grayCache = new WeakMap<THREE.Texture, THREE.Texture>();
/** Cópia em tons de cinza (clareados) de uma textura, para tingir com qualquer cor. */
function grayTexture(t: THREE.Texture): THREE.Texture {
  const hit = grayCache.get(t);
  if (hit) return hit;
  const img = t.image as HTMLImageElement | ImageBitmap | HTMLCanvasElement | undefined;
  if (!img || !(img as any).width) return t;
  const c = document.createElement("canvas");
  c.width = (img as any).width;
  c.height = (img as any).height;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img as CanvasImageSource, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const l = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    const v = Math.min(255, 70 + l * 0.85);
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
  }
  g.putImageData(d, 0, 0);
  const out = new THREE.CanvasTexture(c);
  out.flipY = t.flipY;
  out.colorSpace = t.colorSpace;
  out.magFilter = t.magFilter;
  out.minFilter = t.minFilter;
  out.generateMipmaps = t.generateMipmaps;
  out.wrapS = t.wrapS;
  out.wrapT = t.wrapT;
  grayCache.set(t, out);
  return out;
}

/**
 * Pinta um móvel com a cor escolhida. Cada material ganha o tom e a saturação da cor, mantendo
 * a sua própria claridade (os detalhes e sombras do modelo continuam aparecendo).
 * Materiais com textura (modelos KayKit) são multiplicados pela cor clareada.
 */
export function tintObject(obj: THREE.Object3D, hex: string) {
  const tint = new THREE.Color(hex);
  const th = { h: 0, s: 0, l: 0 };
  tint.getHSL(th);
  const done = new Map<THREE.Material, THREE.Material>();
  const recolor = (mat: THREE.Material) => {
    const hit = done.get(mat);
    if (hit) return hit;
    const src = mat as THREE.MeshToonMaterial;
    // pula telas, neon (emissivo) e vidro
    const emissive = (src as any).emissive as THREE.Color | undefined;
    if (!src.color || (src as any).isMeshBasicMaterial || (emissive && emissive.getHex() !== 0) || (src.transparent && src.opacity < 0.9)) {
      done.set(mat, mat);
      return mat;
    }
    const c = src.clone();
    if (src.map) {
      // textura em tons de cinza x cor escolhida: o tom fica certo (sem misturar com a cor original)
      c.map = grayTexture(src.map);
      c.color.copy(tint).lerp(new THREE.Color(1, 1, 1), 0.12);
    } else {
      const o = { h: 0, s: 0, l: 0 };
      src.color.getHSL(o);
      // claridade: metade do original, metade da cor escolhida (dá para escurecer e clarear)
      c.color.setHSL(th.h, th.s, THREE.MathUtils.clamp(o.l * 0.5 + th.l * 0.5, 0.04, 0.96));
    }
    done.set(mat, c);
    return c;
  };
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(recolor) : recolor(mesh.material);
  });
}

export function buildItem(it: Item): THREE.Object3D {
  const def = DEFS[it.type];
  let obj = def ? def.build(it) : box(1, 1, 1, M.grey);
  // tapete com desenho escolhido no editor
  if (def && RUG_RE.test(it.type) && it.cfg?.rs && !it.type.startsWith("rugc_")) {
    const f0 = it.cfg.rs.f ?? (/oval/.test(it.type) ? "o" : /redond|round/.test(it.type) ? "c" : "r");
    obj = buildRug(def.w, def.d, { ...(it.cfg.rs as RugStyle), f: f0 });
  }
  if (it.color && /^#[0-9a-f]{6}$/i.test(it.color) && !WALL_TYPES.has(it.type)) tintObject(obj, it.color);
  obj.position.set(it.x, WALL_TYPES.has(it.type) ? 0 : Number(it.y) || 0, it.z);
  obj.rotation.y = -(it.rot * Math.PI) / 180;
  obj.userData.itemId = it.id;
  return obj;
}

// ------------------------------------------------------------------ paredes (visão isométrica)
/** Altura das paredes do fundo (inteiras) e das cortadas (frente e internas, para não tapar a vista). */
export const WALL_H = 2.7;
export const WALL_CUT = 0.55;
export const WALL_T = 0.22;
export const WALL_TYPES = new Set(["wall", "window_wall"]);

const wallMats = {
  face: toon("#efe9de"),
  side: toon("#ddd5c6"),
  base: toon("#8f8676"),
  cap: toon("#5e5a6b"),
  frame: toon("#f7f5f0"),
  sill: toon("#cfc8ba"),
  glass: toon("#a9dcf2", { transparent: true, opacity: 0.55 }),
};

const wallCache = new Map<string, typeof wallMats>();
const HEX = /^#[0-9a-f]{6}$/i;
/** Acabamento das paredes na cor pedida (e moldura de janela), com cache. */
function wallMatsFor(color?: string, frame?: string) {
  const c = color && HEX.test(color) ? color : "";
  const fr = frame && HEX.test(frame) ? frame : "";
  if (!c && !fr) return wallMats;
  const key = c + "|" + fr;
  let m = wallCache.get(key);
  if (!m) {
    m = { ...wallMats };
    if (c) {
      const col = new THREE.Color(c);
      m.face = toon(col);
      m.side = toon(col.clone().multiplyScalar(0.92));
    }
    if (fr) m.frame = toon(fr);
    wallCache.set(key, m);
  }
  return m;
}

/** Vizinhos de uma parede (há parede encostada em cada lado?). */
export interface WallLinks {
  xp: boolean;
  xn: boolean;
  zp: boolean;
  zn: boolean;
}

/**
 * Parede fina ligada às vizinhas (cantos e "T" se encaixam sozinhos).
 * `tall`: parede inteira com janela de verdade; senão, mureta cortada (estilo The Sims).
 */
export function buildWall(it: Item, nb: WallLinks, tall: boolean): THREE.Object3D {
  const g = new THREE.Group();
  const H = tall ? WALL_H : WALL_CUT;
  const T = WALL_T;
  const isWindow = tall && it.type === "window_wall";
  // braços: do centro até a borda da célula na direção de cada vizinha
  const arms: { dx: number; dz: number }[] = [];
  if (nb.xp) arms.push({ dx: 1, dz: 0 });
  if (nb.xn) arms.push({ dx: -1, dz: 0 });
  if (nb.zp) arms.push({ dx: 0, dz: 1 });
  if (nb.zn) arms.push({ dx: 0, dz: -1 });
  if (!arms.length) arms.push({ dx: 1, dz: 0 }, { dx: -1, dz: 0 });
  const alongX = nb.xp || nb.xn || !(nb.zp || nb.zn);
  const wm = wallMatsFor(it.color ?? curStyle.wall, curStyle.frame);
  const mats = [wm.side, wm.side, wm.cap, wm.base, wm.face, wm.face];
  // estilo da janela: altura do parapeito e da verga, divisórias
  // parede de vidro (cfg.glass): vidro de quase o pé-direito inteiro, sem divisórias (sala de reunião)
  const win = it.cfg?.glass
    ? [0.12, 2.6, 0, false]
    : ({ classica: [0.9, 2.15, 1, false], ampla: [0.6, 2.35, 0, false], grade: [0.9, 2.15, 3, true], faixa: [1.55, 2.25, 2, false] }[curStyle.window ?? "classica"] ?? [0.9, 2.15, 1, false]);
  const [sill, top, mullV, mullH] = win as [number, number, number, boolean];
  const piece = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material | THREE.Material[] = mats) => {
    const b = box(w, h, d, m, x, y, z);
    g.add(b);
    return b;
  };
  // pilar central
  piece(T, H, T, 0, 0, 0);
  for (const a of arms) {
    const len = 0.5 - T / 2;
    const cx = a.dx * (T / 2 + len / 2);
    const cz = a.dz * (T / 2 + len / 2);
    const w = a.dx ? len : T;
    const d = a.dz ? len : T;
    if (isWindow && (alongX ? a.dx : a.dz)) {
      // janela: parapeito, vidro com moldura, verga
      piece(w, sill, d, cx, 0, cz);
      piece(w, H - top, d, cx, top, cz);
    } else piece(w, H, d, cx, 0, cz);
    // rodapé escuro
    piece(a.dx ? len : T + 0.02, 0.1, a.dz ? len : T + 0.02, cx, 0, cz, wallMats.base);
  }
  if (isWindow) {
    const span = 1 - T * 0.2;
    const sx = alongX ? span : T * 0.5;
    const sz = alongX ? T * 0.5 : span;
    // vidro
    const gh = top - sill;
    const glass = new THREE.Mesh(geo.box(alongX ? span : 0.04, gh, alongX ? 0.04 : span), wm.glass);
    glass.position.set(0, sill + gh / 2, 0);
    g.add(glass);
    // moldura e divisórias
    const fr = (w: number, h: number, d: number, x: number, y: number, z: number) => piece(w, h, d, x, y, z, wm.frame);
    fr(sx, 0.06, sz, 0, sill - 0.02, 0); // peitoril
    fr(sx, 0.06, sz, 0, top - 0.05, 0);
    // divisórias verticais (1 = uma no meio; 0 = vidro inteiro)
    for (let k = 1; k <= mullV; k++) {
      const off = (k / (mullV + 1) - 0.5) * span;
      fr(alongX ? 0.05 : T * 0.55, gh - 0.05, alongX ? T * 0.55 : 0.05, alongX ? off : 0, sill + 0.02, alongX ? 0 : off);
    }
    if (mullH) fr(sx, 0.045, sz, 0, sill + gh / 2, 0);
    piece(alongX ? span : T + 0.12, 0.05, alongX ? T + 0.12 : span, 0, sill - 0.04, 0, wm.sill);
  }
  g.position.set(it.x, 0, it.z);
  g.userData.itemId = it.id;
  return g;
}

/**
 * Trecho de parede solto (mesmo acabamento das paredes), usado para estreitar o vão das portas.
 * Comprimento `len` no eixo X (gire o grupo para o eixo Z), base em y = `y0`.
 */
export function wallSegment(len: number, h: number, y0 = 0, baseboard = true): THREE.Group {
  const g = new THREE.Group();
  const wm = wallMatsFor(curStyle.wall, curStyle.frame);
  const mats = [wm.side, wm.side, wm.cap, wm.base, wm.face, wm.face];
  g.add(box(len, h, WALL_T, mats, 0, y0, 0));
  if (baseboard && y0 === 0) g.add(box(len, 0.1, WALL_T + 0.02, wallMats.base, 0, 0, 0));
  return g;
}

/** Batente da porta (moldura clara em volta do vão). */
export function doorJamb(h: number): THREE.Mesh {
  return box(0.06, h, WALL_T + 0.04, wallMatsFor(undefined, curStyle.frame).frame, 0, 0, 0);
}

/** Retângulos de colisão de uma parede fina (pilar + braços), em coordenadas do mundo. */
export function wallRects(it: Item, nb: WallLinks) {
  const T = WALL_T + 0.06;
  const r = [{ x0: it.x - T / 2, x1: it.x + T / 2, z0: it.z - T / 2, z1: it.z + T / 2 }];
  if (nb.xp) r.push({ x0: it.x, x1: it.x + 0.5, z0: it.z - T / 2, z1: it.z + T / 2 });
  if (nb.xn) r.push({ x0: it.x - 0.5, x1: it.x, z0: it.z - T / 2, z1: it.z + T / 2 });
  if (nb.zp) r.push({ x0: it.x - T / 2, x1: it.x + T / 2, z0: it.z, z1: it.z + 0.5 });
  if (nb.zn) r.push({ x0: it.x - T / 2, x1: it.x + T / 2, z0: it.z - 0.5, z1: it.z });
  if (!nb.xp && !nb.xn && !nb.zp && !nb.zn) r.push({ x0: it.x - 0.5, x1: it.x + 0.5, z0: it.z - T / 2, z1: it.z + T / 2 });
  return r;
}


// ------------------------------------------------------------------ Cleiton, a barata da Ouvidoria (meme da VERKZ)
/** Barata de voxel sentada no balcão da Ouvidoria. As antenas e o corpo mexem (world anima `userData.anim`). */
function cleiton(): THREE.Object3D {
  const brown = toon("#6b3a1f");
  const dark = toon("#3d2010");
  const shine = toon("#9a5a2e");
  const g = new THREE.Group();
  // balcão de atendimento
  g.add(box(0.8, 0.75, 0.5, M.wood, 0, 0, -0.1), box(0.84, 0.05, 0.56, M.woodDark, 0, 0.75, -0.1));
  // carimbo e papéis
  g.add(box(0.22, 0.02, 0.3, M.white, -0.2, 0.8, -0.1), box(0.06, 0.08, 0.06, M.red, 0.22, 0.8, -0.05));
  // a barata
  const bug = new THREE.Group();
  bug.position.set(0, 0.84, 0.1);
  bug.scale.setScalar(1.6);
  const body = box(0.34, 0.12, 0.5, brown, 0, 0.02, 0);
  const wings = box(0.3, 0.04, 0.42, shine, 0, 0.14, -0.03);
  const head = box(0.2, 0.12, 0.14, dark, 0, 0.04, 0.3);
  const eyeL = box(0.04, 0.04, 0.02, M.white, -0.06, 0.1, 0.37);
  const eyeR = box(0.04, 0.04, 0.02, M.white, 0.06, 0.1, 0.37);
  bug.add(body, wings, head, eyeL, eyeR);
  for (const side of [-1, 1])
    for (const z of [-0.14, 0.02, 0.18]) {
      const leg = box(0.16, 0.025, 0.03, dark, side * 0.24, 0, z);
      leg.rotation.z = side * -0.5;
      bug.add(leg);
    }
  const antL = new THREE.Group();
  const antR = new THREE.Group();
  antL.position.set(-0.05, 0.12, 0.36);
  antR.position.set(0.05, 0.12, 0.36);
  for (const [a, s] of [[antL, -1], [antR, 1]] as const) {
    const st = box(0.02, 0.02, 0.4, dark, 0, 0, 0.2);
    st.position.set(s * 0.06, 0.08, 0.18);
    st.rotation.x = -0.5;
    st.rotation.y = s * 0.35;
    a.add(st);
  }
  bug.add(antL, antR);
  // gravatinha (é atendente, né)
  bug.add(box(0.05, 0.03, 0.06, M.red, 0, 0.03, 0.4));
  g.add(bug);
  g.userData.anim = { kind: "cleiton", bug, antL, antR };
  return g;
}

// =====================================================================
// v0.6.1: mais móveis e enfeites (feitos aqui mesmo, sem arquivo de modelo)
// =====================================================================
const P = {
  black: toon("#1d1f27"),
  metal: toon("#b9bdc8"),
  gold: toon("#e2b13c"),
  green: toon("#3c8c5a"),
  teal: toon("#2bb3a3"),
  pink: toon("#f08bb0"),
  cream: toon("#f3ead7"),
  leather: toon("#7a4a2c"),
  fabric: toon("#5a6b8f"),
  felt: toon("#2f7d4f"),
  sand: toon("#e9d7a8"),
  note1: toon("#ffe66b"),
  note2: toon("#ff9fc4"),
  note3: toon("#8fd8ff"),
  note4: toon("#b8f08a"),
  cork: toon("#c89a5f"),
  glow: Object.assign(new THREE.MeshBasicMaterial({ color: 0xff4fa3, toneMapped: false }), { userData: { shared: true } }),
};

/** Post-its espalhados numa superfície vertical (x de -w/2 a w/2, y de y0 a y0+h). */
function notes(w: number, h: number, y0: number, z: number, n: number, seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  const mats = [P.note1, P.note2, P.note3, P.note4];
  for (let i = 0; i < n; i++) g.add(box(0.12, 0.12, 0.01, mats[i % 4], -w / 2 + 0.1 + r() * (w - 0.2), y0 + 0.04 + r() * (h - 0.2), z));
  return g;
}

function bookRow(w: number, y: number, z: number, seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  const cols = [M.red, M.blue, M.yellow, M.purple, P.green, P.teal, M.orange];
  let x = -w / 2 + 0.03;
  while (x < w / 2 - 0.08) {
    const bw = 0.04 + r() * 0.04;
    const bh = 0.18 + r() * 0.1;
    g.add(box(bw, bh, 0.18, cols[Math.floor(r() * cols.length)], x + bw / 2, y, z));
    x += bw + 0.005;
  }
  return g;
}

/** Móvel aberto na frente (+z): laterais, fundo, topo e base (para ver o que tem dentro). */
function openCase(w: number, h: number, d: number, mat: THREE.Material, back: THREE.Material) {
  const t = 0.05;
  return group(
    box(t, h, d, mat, -w / 2 + t / 2, 0, 0),
    box(t, h, d, mat, w / 2 - t / 2, 0, 0),
    box(w, t, d, mat, 0, h - t, 0),
    box(w, 0.08, d, mat, 0, 0, 0),
    box(w - 2 * t, h - 0.1, 0.02, back, 0, 0.05, -d / 2 + 0.02),
  );
}

function leafy(r: number, x: number, y: number, z: number) {
  return group(blob(r, M.leaf, x, y, z), blob(r * 0.7, M.leafLight, x + r * 0.4, y + r * 0.3, z - r * 0.2), blob(r * 0.7, M.leafDark, x - r * 0.4, y + r * 0.1, z + r * 0.3));
}

const NEW_DEFS: Record<string, Def> = {
  // ---------- escritório
  p_standing_desk: {
    label: "Mesa de pé (regulável)",
    w: 1.4,
    d: 0.7,
    blocks: true,
    build: () =>
      group(
        box(0.08, 1.0, 0.5, P.black, -0.6, 0, 0),
        box(0.08, 1.0, 0.5, P.black, 0.6, 0, 0),
        box(1.4, 0.04, 0.7, M.wood, 0, 1.0, 0),
        box(0.2, 0.03, 0.14, M.dark, 0, 1.04, -0.15),
        box(0.05, 0.16, 0.05, M.dark, 0, 1.05, -0.15),
        box(0.62, 0.38, 0.05, M.dark, 0, 1.18, -0.15),
        box(0.56, 0.32, 0.01, M.screenC, 0, 1.21, -0.124),
        box(0.42, 0.02, 0.14, M.dark, 0, 1.04, 0.15),
      ),
  },
  p_desk_l: {
    label: "Mesa em L",
    w: 1.8,
    d: 1.6,
    blocks: true,
    build: () =>
      group(
        box(1.8, 0.05, 0.7, M.wood, 0, 0.72, -0.45),
        box(0.7, 0.05, 0.9, M.wood, 0.55, 0.72, 0.35),
        box(0.05, 0.72, 0.6, M.offwhite, -0.85, 0, -0.45),
        box(0.05, 0.72, 0.6, M.offwhite, 0.85, 0, 0.35),
        box(0.5, 0.6, 0.6, M.offwhite, 0.55, 0, 0.45),
        monitor(-0.35, -0.6, M.screenA),
        monitor(0.3, -0.6, M.screenB),
      ),
  },
  p_printer: {
    label: "Impressora",
    w: 0.6,
    d: 0.5,
    blocks: true,
    build: () =>
      group(
        box(0.6, 0.55, 0.5, M.offwhite, 0, 0, 0),
        box(0.56, 0.22, 0.45, M.white, 0, 0.55, 0),
        box(0.3, 0.02, 0.22, M.white, 0, 0.77, 0.05),
        box(0.12, 0.04, 0.02, P.teal, 0.18, 0.66, 0.23),
        box(0.4, 0.03, 0.1, M.dark, 0, 0.6, 0.24),
      ),
  },
  p_locker: {
    label: "Armário de armários (lockers)",
    w: 1.2,
    d: 0.5,
    blocks: true,
    build: () => {
      const g = group(box(1.2, 1.8, 0.5, M.steel, 0, 0, 0));
      for (let i = 0; i < 3; i++) {
        const x = -0.4 + i * 0.4;
        g.add(box(0.36, 1.7, 0.01, M.grey, x, 0.05, 0.255));
        for (let k = 0; k < 4; k++) g.add(box(0.2, 0.015, 0.01, M.dark, x, 1.45 + k * 0.05, 0.262));
        g.add(box(0.03, 0.1, 0.02, M.dark, x + 0.13, 0.85, 0.265));
      }
      return g;
    },
  },
  p_filing: {
    label: "Arquivo de pastas",
    w: 0.5,
    d: 0.6,
    blocks: true,
    build: () => {
      const g = group(box(0.5, 1.3, 0.6, M.grey, 0, 0, 0));
      for (let i = 0; i < 4; i++) g.add(box(0.44, 0.28, 0.01, M.offwhite, 0, 0.05 + i * 0.31, 0.305), box(0.14, 0.03, 0.02, M.dark, 0, 0.27 + i * 0.31, 0.315));
      return g;
    },
  },
  p_safe: {
    label: "Cofre",
    w: 0.6,
    d: 0.6,
    blocks: true,
    build: () =>
      group(
        box(0.6, 0.7, 0.6, P.black, 0, 0, 0),
        box(0.5, 0.6, 0.01, M.dark, 0, 0.05, 0.305),
        cyl(0.07, 0.07, 0.03, P.gold, 0, 0.35, 0.31),
        box(0.03, 0.14, 0.03, P.metal, 0.17, 0.28, 0.32),
      ),
  },
  p_trash: {
    label: "Lixeira",
    w: 0.35,
    d: 0.35,
    blocks: false,
    build: () => group(cyl(0.16, 0.13, 0.42, M.steel, 0, 0, 0, 10), cyl(0.17, 0.17, 0.03, M.dark, 0, 0.42, 0, 10)),
  },
  p_recycle: {
    label: "Lixeiras de reciclagem",
    w: 1.2,
    d: 0.4,
    blocks: true,
    build: () =>
      group(
        ...[M.blue, M.red, P.green, M.yellow].map((mat, i) => group(box(0.26, 0.6, 0.36, mat, -0.42 + i * 0.28, 0, 0), box(0.28, 0.04, 0.38, M.dark, -0.42 + i * 0.28, 0.6, 0))),
      ),
  },
  p_corkboard: {
    label: "Mural de recados",
    w: 1.2,
    d: 0.1,
    blocks: false,
    build: () => hung(group(box(1.2, 0.8, 0.04, M.woodDark, 0, -0.4, 0), box(1.1, 0.7, 0.02, P.cork, 0, -0.35, 0.02), notes(1.1, 0.7, -0.35, 0.035, 9, 7))),
  },
  p_kanban: {
    label: "Quadro de tarefas (post-its)",
    w: 1.8,
    d: 0.6,
    blocks: true,
    build: () =>
      group(
        box(0.05, 1.7, 0.05, M.steel, -0.85, 0, 0),
        box(0.05, 1.7, 0.05, M.steel, 0.85, 0, 0),
        box(0.5, 0.04, 0.05, M.steel, -0.85, 0, 0),
        box(0.5, 0.04, 0.05, M.steel, 0.85, 0, 0),
        box(1.7, 1.0, 0.04, M.board, 0, 0.6, 0),
        box(0.01, 0.9, 0.045, M.grey, -0.28, 0.65, 0),
        box(0.01, 0.9, 0.045, M.grey, 0.28, 0.65, 0),
        notes(0.5, 0.9, 0.62, 0.025, 4, 11).translateX(-0.57),
        notes(0.5, 0.9, 0.62, 0.025, 3, 12),
        notes(0.5, 0.9, 0.62, 0.025, 5, 13).translateX(0.57),
      ),
  },
  p_projector: {
    label: "Tela de projeção",
    w: 2.2,
    d: 0.5,
    blocks: true,
    build: () =>
      group(
        box(0.06, 2.0, 0.06, M.dark, -1.05, 0, 0),
        box(0.06, 2.0, 0.06, M.dark, 1.05, 0, 0),
        box(0.4, 0.04, 0.4, M.dark, -1.05, 0, 0),
        box(0.4, 0.04, 0.4, M.dark, 1.05, 0, 0),
        box(2.1, 0.1, 0.12, M.dark, 0, 1.95, 0),
        box(2.0, 1.2, 0.02, M.white, 0, 0.75, 0),
        box(2.0, 0.05, 0.03, M.dark, 0, 0.72, 0),
      ),
  },
  p_phone_booth: {
    label: "Cabine de ligação",
    w: 1.2,
    d: 1.2,
    blocks: true,
    build: () =>
      group(
        box(1.2, 0.08, 1.2, M.dark, 0, 0, 0),
        box(1.2, 0.1, 1.2, M.dark, 0, 2.1, 0),
        box(0.06, 2.1, 0.06, M.dark, -0.57, 0, -0.57),
        box(0.06, 2.1, 0.06, M.dark, 0.57, 0, -0.57),
        box(0.06, 2.1, 0.06, M.dark, -0.57, 0, 0.57),
        box(0.06, 2.1, 0.06, M.dark, 0.57, 0, 0.57),
        box(1.1, 2.0, 0.04, P.fabric, 0, 0.08, -0.56),
        box(0.04, 2.0, 1.1, M.glass, -0.57, 0.08, 0),
        box(0.04, 2.0, 1.1, M.glass, 0.57, 0.08, 0),
        box(1.1, 2.0, 0.04, M.glass, 0, 0.08, 0.57),
        box(0.7, 0.04, 0.35, M.wood, 0, 0.9, -0.35),
        box(0.4, 0.06, 0.4, P.fabric, 0, 0.45, 0.1),
        cyl(0.04, 0.04, 0.4, M.steel, 0, 0.05, 0.1, 6),
        box(0.4, 0.04, 0.06, M.neonToon, 0, 2.18, 0.58),
      ),
  },

  // ---------- assentos
  p_gamer_chair: {
    label: "Cadeira gamer",
    w: 0.7,
    d: 0.7,
    blocks: false,
    build: () =>
      group(
        box(0.5, 0.04, 0.5, M.dark, 0, 0.02, 0),
        cyl(0.04, 0.04, 0.34, M.steel, 0, 0.04, 0, 6),
        box(0.54, 0.1, 0.5, P.black, 0, 0.38, 0),
        box(0.54, 0.9, 0.12, P.black, 0, 0.44, -0.24),
        box(0.06, 0.8, 0.13, M.neonToon, -0.2, 0.5, -0.24),
        box(0.06, 0.8, 0.13, M.neonToon, 0.2, 0.5, -0.24),
        box(0.3, 0.14, 0.08, M.neonToon, 0, 1.12, -0.2),
        box(0.06, 0.2, 0.38, M.dark, -0.29, 0.48, 0),
        box(0.06, 0.2, 0.38, M.dark, 0.29, 0.48, 0),
      ),
  },
  p_bench: {
    label: "Banco de madeira",
    w: 1.6,
    d: 0.5,
    blocks: false,
    build: () =>
      group(
        box(1.6, 0.08, 0.45, M.wood, 0, 0.4, 0),
        box(0.08, 0.4, 0.4, M.woodDark, -0.7, 0, 0),
        box(0.08, 0.4, 0.4, M.woodDark, 0.7, 0, 0),
      ),
  },
  p_sofa_l: {
    label: "Sofá em L",
    w: 2.4,
    d: 1.8,
    blocks: true,
    build: () =>
      group(
        box(2.4, 0.4, 0.9, P.fabric, 0, 0, -0.45),
        box(0.9, 0.4, 0.9, P.fabric, 0.75, 0, 0.45),
        box(2.4, 0.45, 0.2, P.fabric, 0, 0.4, -0.8),
        box(0.2, 0.3, 1.8, P.fabric, 1.1, 0.4, 0),
        box(0.2, 0.3, 0.9, P.fabric, -1.1, 0.4, -0.45),
        box(0.45, 0.1, 0.65, M.cushion, -0.7, 0.4, -0.38),
        box(0.45, 0.1, 0.65, M.cushion, -0.2, 0.4, -0.38),
        box(0.45, 0.1, 0.65, M.cushion, 0.35, 0.4, -0.38),
        box(0.65, 0.1, 0.75, M.cushion, 0.72, 0.4, 0.42),
        box(0.3, 0.3, 0.1, M.yellow, -0.75, 0.5, -0.62),
        box(0.3, 0.3, 0.1, M.red, 0.6, 0.5, -0.62),
      ),
  },
  p_hammock: {
    label: "Rede",
    w: 2.4,
    d: 0.9,
    blocks: true,
    build: () => {
      const g = group(
        box(0.1, 1.5, 0.1, M.woodDark, -1.15, 0, 0),
        box(0.1, 1.5, 0.1, M.woodDark, 1.15, 0, 0),
        box(0.6, 0.06, 0.5, M.woodDark, -1.15, 0, 0),
        box(0.6, 0.06, 0.5, M.woodDark, 1.15, 0, 0),
      );
      // pano da rede em gomos caindo para o meio
      const cols = [M.red, M.yellow, P.green, M.blue];
      for (let i = 0; i < 9; i++) {
        const t = (i - 4) / 4;
        g.add(box(0.22, 0.04, 0.7, cols[i % 4], t * 0.9, 0.55 + t * t * 0.5, 0));
      }
      g.add(box(0.3, 0.02, 0.02, M.beige, -1.0, 1.05, 0), box(0.3, 0.02, 0.02, M.beige, 1.0, 1.05, 0));
      return g;
    },
  },
  p_lounge: {
    label: "Espreguiçadeira",
    w: 0.7,
    d: 1.7,
    blocks: true,
    build: () => {
      const back = box(0.6, 0.06, 0.7, P.cream, 0, 0, 0);
      back.rotation.x = -0.9;
      back.position.set(0, 0.6, -0.55);
      return group(box(0.6, 0.08, 1.1, P.cream, 0, 0.3, 0.25), back, box(0.05, 0.3, 1.5, M.woodDark, -0.28, 0, 0), box(0.05, 0.3, 1.5, M.woodDark, 0.28, 0, 0));
    },
  },

  // ---------- mesas
  p_bar_table: {
    label: "Mesa alta (bistrô)",
    w: 0.7,
    d: 0.7,
    blocks: true,
    build: () => group(cyl(0.3, 0.3, 0.04, M.dark, 0, 0, 0, 12), cyl(0.04, 0.04, 1.0, M.steel, 0, 0.04, 0, 6), cyl(0.35, 0.35, 0.05, M.wood, 0, 1.04, 0, 14)),
  },
  p_side_table: {
    label: "Mesa de canto",
    w: 0.5,
    d: 0.5,
    blocks: true,
    build: () => group(cyl(0.22, 0.22, 0.04, M.wood, 0, 0.5, 0, 12), cyl(0.03, 0.03, 0.5, M.dark, 0, 0, 0, 6), cyl(0.15, 0.15, 0.03, M.dark, 0, 0, 0, 10), cyl(0.06, 0.05, 0.12, P.teal, 0.05, 0.54, 0, 8)),
  },

  // ---------- lazer
  p_foosball: {
    label: "Pebolim",
    w: 1.4,
    d: 0.8,
    blocks: true,
    build: () => {
      const g = group(
        box(0.08, 0.7, 0.08, M.woodDark, -0.55, 0, -0.28),
        box(0.08, 0.7, 0.08, M.woodDark, 0.55, 0, -0.28),
        box(0.08, 0.7, 0.08, M.woodDark, -0.55, 0, 0.28),
        box(0.08, 0.7, 0.08, M.woodDark, 0.55, 0, 0.28),
        box(1.3, 0.25, 0.7, M.woodDark, 0, 0.7, 0),
        box(1.2, 0.02, 0.6, P.felt, 0, 0.88, 0),
      );
      for (let i = 0; i < 6; i++) {
        const x = -0.5 + i * 0.2;
        g.add(cyl(0.012, 0.012, 1.1, P.metal, x, 0.92 - 0.55, 0, 6).rotateX(Math.PI / 2));
        const mat = i % 2 ? M.red : M.blue;
        for (let k = 0; k < 3; k++) g.add(box(0.04, 0.1, 0.05, mat, x, 0.86, -0.2 + k * 0.2));
      }
      return g;
    },
  },
  p_dartboard: {
    label: "Alvo de dardos",
    w: 0.6,
    d: 0.1,
    blocks: false,
    build: () => {
      const g = new THREE.Group();
      [[0.3, P.black], [0.25, M.red], [0.19, P.cream], [0.13, P.green], [0.07, P.cream], [0.03, M.red]].forEach(([r, mat], i) => {
        const c = cyl(r as number, r as number, 0.03, mat as THREE.Material, 0, 0, 0.01 * i, 20);
        c.rotation.x = Math.PI / 2;
        c.position.set(0, -0.3, 0.01 * i);
        g.add(c);
      });
      return hung(g);
    },
  },
  p_videogame: {
    label: "Videogame com TV",
    w: 1.6,
    d: 0.6,
    blocks: true,
    build: () =>
      group(
        box(1.6, 0.45, 0.5, M.woodDark, 0, 0, 0),
        box(1.3, 0.75, 0.06, P.black, 0, 0.55, -0.1),
        box(1.22, 0.67, 0.01, M.screenB, 0, 0.59, -0.065),
        box(0.06, 0.12, 0.06, P.black, 0, 0.45, -0.1),
        box(0.35, 0.06, 0.25, M.white, -0.4, 0.45, 0.05),
        box(0.14, 0.03, 0.09, M.dark, 0.25, 0.45, 0.12),
        box(0.14, 0.03, 0.09, M.dark, 0.45, 0.45, 0.12),
      ),
  },
  p_guitar: {
    label: "Violão no suporte",
    w: 0.5,
    d: 0.4,
    blocks: false,
    build: () => {
      const body = group(blob(0.2, M.orange, 0, 0.3, 0), blob(0.15, M.orange, 0, 0.55, 0), cyl(0.05, 0.05, 0.02, M.dark, 0, 0.44, 0.13, 10).rotateX(Math.PI / 2), box(0.06, 0.6, 0.04, M.woodDark, 0, 0.62, 0.02), box(0.1, 0.14, 0.04, M.woodDark, 0, 1.2, 0.02));
      body.scale.z = 0.5;
      body.rotation.x = -0.25;
      return group(box(0.3, 0.04, 0.3, M.dark, 0, 0, 0), body);
    },
  },
  p_keyboard: {
    label: "Teclado musical",
    w: 1.3,
    d: 0.5,
    blocks: true,
    build: () => {
      const g = group(box(0.05, 0.75, 0.05, M.dark, -0.5, 0, 0).rotateZ(0.35), box(0.05, 0.75, 0.05, M.dark, 0.5, 0, 0).rotateZ(-0.35), box(1.2, 0.08, 0.35, P.black, 0, 0.75, 0), box(1.1, 0.02, 0.15, M.white, 0, 0.83, 0.07));
      for (let i = 0; i < 14; i++) if (i % 7 !== 2 && i % 7 !== 6) g.add(box(0.03, 0.025, 0.08, P.black, -0.5 + i * 0.075 + 0.04, 0.85, 0.03));
      return g;
    },
  },
  p_basket: {
    label: "Cesta de basquete",
    w: 0.9,
    d: 0.6,
    blocks: true,
    build: () => {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.015, 6, 16), M.orange);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.set(0, 2.0, 0.2);
      return group(box(0.6, 0.15, 0.5, M.dark, 0, 0, -0.1), cyl(0.04, 0.04, 2.2, M.steel, 0, 0.1, -0.2, 6), box(0.9, 0.6, 0.04, M.white, 0, 1.9, -0.05), box(0.3, 0.22, 0.045, M.red, 0, 2.0, -0.04), hoop, blob(0.11, M.orange, 0.25, 0.25, 0.2));
    },
  },

  // ---------- decoração
  p_aquarium: {
    label: "Aquário",
    w: 1.2,
    d: 0.5,
    blocks: true,
    build: () => {
      const g = group(
        box(1.2, 0.7, 0.45, M.woodDark, 0, 0, 0),
        box(1.2, 0.05, 0.45, M.dark, 0, 0.7, 0),
        box(1.16, 0.08, 0.41, P.sand, 0, 0.75, 0),
        box(1.16, 0.5, 0.41, M.water, 0, 0.83, 0),
        box(1.2, 0.04, 0.45, M.dark, 0, 1.33, 0),
        blob(0.06, M.grey, -0.3, 0.86, 0),
        leafy(0.07, 0.35, 0.95, -0.05),
      );
      const fish = [M.orange, M.yellow, M.red].map((mat, i) => box(0.09, 0.05, 0.03, mat, -0.25 + i * 0.25, 1.0 + (i % 2) * 0.12, 0.21));
      g.add(...fish);
      return g;
    },
  },
  p_globe: {
    label: "Globo terrestre",
    w: 0.4,
    d: 0.4,
    blocks: false,
    build: () => group(cyl(0.12, 0.15, 0.05, M.woodDark, 0, 0, 0, 10), cyl(0.02, 0.02, 0.15, P.gold, 0, 0.05, 0, 6), blob(0.18, M.blue, 0, 0.38, 0), blob(0.1, P.green, 0.08, 0.42, 0.08), blob(0.07, P.green, -0.1, 0.33, 0.07)),
  },
  p_trophy: {
    label: "Estante de troféus",
    w: 1.2,
    d: 0.4,
    blocks: true,
    build: () => {
      const g = openCase(1.2, 1.6, 0.4, M.woodDark, P.black);
      for (let s = 0; s < 3; s++) {
        g.add(box(1.1, 0.03, 0.36, M.wood, 0, 0.3 + s * 0.45, 0));
        for (let i = 0; i < 3; i++) {
          const x = -0.35 + i * 0.35;
          const y = 0.33 + s * 0.45;
          const mat = (s + i) % 3 === 0 ? P.metal : P.gold;
          g.add(box(0.12, 0.05, 0.12, P.black, x, y, 0), cyl(0.03, 0.03, 0.1, mat, x, y + 0.05, 0, 6), cyl(0.08, 0.04, 0.12, mat, x, y + 0.15, 0, 8));
        }
      }
      return g;
    },
  },
  p_neon_ring: {
    label: "Neon redondo",
    w: 0.9,
    d: 0.1,
    blocks: false,
    build: () => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 6, 32), P.glow);
      ring.position.set(0, -0.35, 0.02);
      const inner = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 28), M.neon);
      inner.position.set(0, -0.35, 0.02);
      return hung(group(ring, inner));
    },
  },
  p_clock_wall: {
    label: "Relógio de parede",
    w: 0.5,
    d: 0.1,
    blocks: false,
    build: () => {
      const face = cyl(0.24, 0.24, 0.04, P.cream, 0, 0, 0, 20);
      face.rotation.x = Math.PI / 2;
      face.position.set(0, -0.25, 0);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 6, 24), P.black);
      rim.position.set(0, -0.25, 0.01);
      return hung(group(face, rim, box(0.02, 0.14, 0.01, P.black, 0, -0.26, 0.03), box(0.1, 0.02, 0.01, P.black, 0.05, -0.25, 0.03), box(0.03, 0.03, 0.01, M.red, 0, -0.25, 0.035)));
    },
  },
  p_mirror: {
    label: "Espelho",
    w: 0.7,
    d: 0.1,
    blocks: false,
    build: () => hung(group(box(0.7, 1.1, 0.03, P.gold, 0, -0.6, 0), box(0.6, 1.0, 0.01, toon("#cfe6f2"), 0, -0.55, 0.02))),
  },
  p_floor_lamp: {
    label: "Luminária de arco",
    w: 1.2,
    d: 0.5,
    blocks: false,
    build: () => {
      const arm = box(0.04, 0.04, 1.1, P.metal, 0, 0, 0);
      arm.rotation.y = Math.PI / 2;
      arm.rotation.z = -0.25;
      arm.position.set(0.05, 1.72, 0);
      return group(
        cyl(0.18, 0.2, 0.06, P.black, -0.45, 0, 0, 12),
        cyl(0.025, 0.025, 1.75, P.metal, -0.45, 0.05, 0, 6),
        arm,
        cyl(0.025, 0.025, 0.12, P.metal, 0.55, 1.55, 0, 6),
        cyl(0.08, 0.22, 0.22, P.cream, 0.55, 1.35, 0, 12),
        blob(0.06, M.yellow, 0.55, 1.38, 0),
      );
    },
  },
  p_vase: {
    label: "Vaso decorativo",
    w: 0.4,
    d: 0.4,
    blocks: false,
    build: () => group(cyl(0.12, 0.16, 0.35, P.teal, 0, 0, 0, 10), cyl(0.16, 0.1, 0.25, P.teal, 0, 0.35, 0, 10), cyl(0.07, 0.1, 0.1, P.teal, 0, 0.6, 0, 10), box(0.02, 0.5, 0.02, M.trunk, 0.02, 0.65, 0), blob(0.07, P.pink, 0.02, 1.15, 0), blob(0.06, P.pink, -0.08, 1.05, 0.04)),
  },
  p_books: {
    label: "Pilha de livros",
    w: 0.4,
    d: 0.3,
    blocks: false,
    build: () => group(box(0.36, 0.06, 0.26, M.red, 0, 0, 0), box(0.32, 0.05, 0.24, M.blue, 0.01, 0.06, 0), box(0.34, 0.07, 0.25, P.green, -0.01, 0.11, 0), box(0.3, 0.05, 0.22, M.yellow, 0, 0.18, 0), blob(0.04, M.white, 0.05, 0.27, 0)),
  },
  p_bookcase_full: {
    label: "Estante cheia de livros",
    w: 1.4,
    d: 0.4,
    blocks: true,
    build: () => {
      const g = openCase(1.4, 2.0, 0.4, M.woodDark, M.woodDark);
      for (let s = 0; s < 4; s++) g.add(box(1.3, 0.03, 0.36, M.wood, 0, 0.08 + s * 0.48, 0), bookRow(1.3, 0.11 + s * 0.48, 0, 20 + s));
      return g;
    },
  },
  p_coat_rack: {
    label: "Cabideiro",
    w: 0.5,
    d: 0.5,
    blocks: false,
    build: () =>
      group(
        cyl(0.2, 0.22, 0.05, M.woodDark, 0, 0, 0, 10),
        cyl(0.03, 0.03, 1.7, M.woodDark, 0, 0.05, 0, 6),
        box(0.35, 0.03, 0.03, M.woodDark, 0, 1.6, 0),
        box(0.03, 0.03, 0.35, M.woodDark, 0, 1.6, 0),
        box(0.3, 0.6, 0.12, M.navy, 0.12, 1.0, 0.04),
        blob(0.11, M.red, -0.13, 1.66, 0),
      ),
  },
  p_fireplace: {
    label: "Lareira elétrica",
    w: 1.4,
    d: 0.4,
    blocks: true,
    build: () =>
      group(
        box(1.4, 1.0, 0.4, M.white, 0, 0, 0),
        box(1.5, 0.06, 0.45, M.woodDark, 0, 1.0, 0),
        box(0.9, 0.5, 0.02, P.black, 0, 0.2, 0.2),
        blob(0.12, M.orange, -0.15, 0.32, 0.18),
        blob(0.15, M.yellow, 0.05, 0.3, 0.18),
        blob(0.1, M.red, 0.22, 0.3, 0.18),
        box(0.6, 0.06, 0.1, M.trunk, 0, 0.22, 0.18),
      ),
  },
  p_trophy_cup: {
    label: "Troféu de vendas",
    w: 0.4,
    d: 0.4,
    blocks: false,
    build: () => group(box(0.25, 0.1, 0.25, P.black, 0, 0, 0), cyl(0.04, 0.04, 0.15, P.gold, 0, 0.1, 0, 6), cyl(0.14, 0.06, 0.22, P.gold, 0, 0.25, 0, 10), box(0.3, 0.03, 0.03, P.gold, 0, 0.42, 0)),
  },

  // ---------- plantas
  p_monstera: {
    label: "Costela-de-adão",
    w: 0.8,
    d: 0.8,
    blocks: true,
    build: () => {
      const g = group(cyl(0.22, 0.18, 0.45, M.potWhite, 0, 0, 0, 10));
      const r = rng(31);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const leaf = box(0.32, 0.02, 0.22, i % 2 ? M.leafDark : M.leaf, Math.cos(a) * 0.22, 0.75 + r() * 0.35, Math.sin(a) * 0.22);
        leaf.rotation.set(0.4 * Math.sin(a), -a, 0.4 * Math.cos(a));
        g.add(leaf, box(0.015, 0.4 + r() * 0.3, 0.015, M.leafDark, Math.cos(a) * 0.1, 0.42, Math.sin(a) * 0.1));
      }
      return g;
    },
  },
  p_succulents: {
    label: "Suculentas",
    w: 0.5,
    d: 0.3,
    blocks: false,
    build: () => group(box(0.46, 0.1, 0.22, M.pot, 0, 0, 0), blob(0.06, M.leafLight, -0.14, 0.13, 0), blob(0.07, P.teal, 0, 0.14, 0), blob(0.05, M.leaf, 0.14, 0.13, 0), blob(0.03, P.pink, 0.01, 0.2, 0)),
  },
  p_fern: {
    label: "Samambaia no suporte",
    w: 0.6,
    d: 0.6,
    blocks: true,
    build: () => group(box(0.05, 0.8, 0.05, P.black, 0, 0, 0), box(0.35, 0.03, 0.35, P.black, 0, 0.8, 0), cyl(0.18, 0.14, 0.22, M.pot, 0, 0.83, 0, 10), leafy(0.24, 0, 1.1, 0), blob(0.16, M.leafDark, 0.15, 0.95, 0.1), blob(0.16, M.leaf, -0.16, 0.92, -0.08)),
  },
  p_planter_long: {
    label: "Floreira comprida",
    w: 1.6,
    d: 0.4,
    blocks: true,
    build: () => group(box(1.6, 0.45, 0.4, M.offwhite, 0, 0, 0), box(1.5, 0.04, 0.3, M.trunk, 0, 0.43, 0), leafy(0.18, -0.55, 0.6, 0), leafy(0.2, 0, 0.62, 0), leafy(0.18, 0.55, 0.6, 0), blob(0.05, M.red, -0.3, 0.7, 0.1), blob(0.05, M.yellow, 0.3, 0.72, 0.1)),
  },
  p_olive: {
    label: "Oliveira no vaso",
    w: 0.8,
    d: 0.8,
    blocks: true,
    build: () => group(cyl(0.26, 0.2, 0.45, P.black, 0, 0, 0, 10), cyl(0.04, 0.05, 1.0, M.trunk, 0, 0.45, 0, 6), blob(0.32, toon("#8fae72"), 0, 1.6, 0), blob(0.22, toon("#a5c287"), 0.2, 1.75, 0.1), blob(0.22, toon("#7a9a5f"), -0.2, 1.5, -0.1)),
  },

  // ---------- cozinha
  // ---------- som (todas tocam o rádio da sala: clique e cole um link do YouTube ou do Spotify)
  p_radio_small: {
    label: "Rádio pequeno",
    w: 0.5,
    d: 0.4,
    blocks: false,
    interactive: true,
    build: () => {
      // rádio retrô de madeira em cima de um banquinho
      const cone = cyl(0.08, 0.08, 0.02, M.steel, -0.09, 0.66, 0.085, 12).rotateX(Math.PI / 2);
      return group(
        cyl(0.16, 0.18, 0.56, P.black, 0, 0, 0, 10),
        box(0.44, 0.26, 0.17, M.woodDark, 0, 0.56, 0),
        box(0.42, 0.02, 0.16, P.cream, 0, 0.81, 0),
        cone,
        box(0.13, 0.08, 0.02, P.cream, 0.1, 0.7, 0.085),
        box(0.01, 0.07, 0.022, M.red, 0.1, 0.705, 0.087),
        cyl(0.025, 0.025, 0.03, P.gold, 0.08, 0.6, 0.09, 8).rotateX(Math.PI / 2),
        cyl(0.025, 0.025, 0.03, P.gold, 0.15, 0.6, 0.09, 8).rotateX(Math.PI / 2),
        cyl(0.008, 0.008, 0.3, P.metal, 0.17, 0.82, -0.04, 4),
      );
    },
  },
  p_boombox: {
    label: "Rádio boombox",
    w: 0.7,
    d: 0.35,
    blocks: false,
    interactive: true,
    build: () =>
      group(
        box(0.64, 0.34, 0.2, M.dark, 0, 0, 0),
        cyl(0.1, 0.1, 0.02, M.steel, -0.19, 0.07, 0.1, 12).rotateX(Math.PI / 2),
        cyl(0.1, 0.1, 0.02, M.steel, 0.19, 0.07, 0.1, 12).rotateX(Math.PI / 2),
        box(0.16, 0.1, 0.02, M.neonToon, 0, 0.18, 0.1),
        box(0.16, 0.05, 0.02, P.metal, 0, 0.06, 0.1),
        box(0.04, 0.12, 0.04, P.metal, -0.24, 0.34, 0),
        box(0.04, 0.12, 0.04, P.metal, 0.24, 0.34, 0),
        box(0.52, 0.03, 0.04, P.metal, 0, 0.45, 0),
      ),
  },
  p_speaker_tower: {
    label: "Caixa de som torre",
    w: 0.45,
    d: 0.45,
    blocks: true,
    interactive: true,
    build: () =>
      group(
        box(0.38, 1.25, 0.36, P.black, 0, 0, 0),
        cyl(0.05, 0.05, 0.02, M.steel, 0, 1.08, 0.18, 10).rotateX(Math.PI / 2),
        cyl(0.12, 0.12, 0.02, M.steel, 0, 0.8, 0.18, 12).rotateX(Math.PI / 2),
        cyl(0.12, 0.12, 0.02, M.steel, 0, 0.45, 0.18, 12).rotateX(Math.PI / 2),
        box(0.4, 0.04, 0.38, M.dark, 0, 0, 0),
        box(0.04, 0.02, 0.02, M.neonToon, 0.13, 0.12, 0.185),
      ),
  },
  p_speaker_portable: {
    label: "Caixa de som portátil",
    w: 0.5,
    d: 0.4,
    blocks: false,
    interactive: true,
    build: () => {
      // caixinha bluetooth deitada, num banquinho
      const body = cyl(0.11, 0.11, 0.42, M.blue, 0, 0, 0, 12);
      body.rotateZ(Math.PI / 2);
      body.position.set(0, 0.68, 0);
      const capL = cyl(0.115, 0.115, 0.03, P.black, 0, 0, 0, 12);
      capL.rotateZ(Math.PI / 2);
      capL.position.set(-0.22, 0.68, 0);
      const capR = capL.clone();
      capR.position.x = 0.22;
      return group(cyl(0.16, 0.18, 0.56, P.black, 0, 0, 0, 10), body, capL, capR, box(0.1, 0.02, 0.04, M.neonToon, 0, 0.79, 0));
    },
  },
  p_speaker_stage: {
    label: "Caixa de som de palco",
    w: 0.8,
    d: 0.7,
    blocks: true,
    interactive: true,
    build: () =>
      group(
        // tripé
        cyl(0.02, 0.02, 0.9, P.metal, 0, 0, 0, 6),
        box(0.7, 0.02, 0.04, P.metal, 0, 0.02, 0),
        box(0.04, 0.02, 0.6, P.metal, 0, 0.02, 0),
        // caixa
        box(0.55, 0.8, 0.42, P.black, 0, 0.9, 0),
        cyl(0.19, 0.19, 0.02, M.steel, 0, 1.15, 0.21, 14).rotateX(Math.PI / 2),
        cyl(0.07, 0.07, 0.02, M.steel, 0, 1.5, 0.21, 10).rotateX(Math.PI / 2),
        box(0.5, 0.03, 0.02, M.neonToon, 0, 0.93, 0.215),
      ),
  },
  // Kenney Furniture Kit (CC0): modelos prontos de som. Sem o modelo, cai num desenho simples.
  p_radio_retro: {
    label: "Rádio retrô de mesa",
    w: 0.55,
    d: 0.4,
    blocks: false,
    interactive: true,
    build: () => {
      const r = model("kf_radio", 0.46, 0.2, { height: 0.34 });
      const stand = cyl(0.16, 0.18, 0.56, M.woodDark, 0, 0, 0, 10);
      if (!r) return group(stand, box(0.46, 0.3, 0.18, M.woodDark, 0, 0.56, 0), box(0.3, 0.16, 0.02, P.cream, 0, 0.63, 0.09));
      r.position.y = 0.56;
      return group(stand, r);
    },
  },
  p_speaker_pair: {
    label: "Par de caixas de som",
    w: 1.1,
    d: 0.4,
    blocks: true,
    interactive: true,
    build: () => {
      const mk = (x: number) => {
        const m = model("kf_speaker", 0.3, 0.3, { height: 1.15 }) ?? group(box(0.28, 1.1, 0.28, M.woodDark), cyl(0.09, 0.09, 0.02, M.steel, 0, 0.75, 0.14, 12).rotateX(Math.PI / 2));
        m.position.x = x;
        return m;
      };
      return group(mk(-0.38), mk(0.38));
    },
  },
  p_speaker_shelf: {
    label: "Caixinhas de estante",
    w: 0.9,
    d: 0.4,
    blocks: false,
    interactive: true,
    build: () => {
      const mk = (x: number) => {
        const m = model("kf_speaker_small", 0.26, 0.24, { height: 0.5 }) ?? group(box(0.24, 0.46, 0.22, M.woodDark), cyl(0.07, 0.07, 0.02, M.steel, 0, 0.28, 0.11, 10).rotateX(Math.PI / 2));
        m.position.set(x, 0.62, 0);
        return m;
      };
      return group(box(0.86, 0.06, 0.38, M.wood, 0, 0.56, 0), box(0.06, 0.56, 0.34, M.woodDark, -0.38, 0, 0), box(0.06, 0.56, 0.34, M.woodDark, 0.38, 0, 0), mk(-0.24), mk(0.24));
    },
  },
  p_tv_vintage: {
    label: "TV antiga com som",
    w: 0.8,
    d: 0.6,
    blocks: true,
    interactive: true,
    build: () => {
      const tv = model("kf_tv_vintage", 0.7, 0.5, { height: 0.55 });
      const base = box(0.76, 0.5, 0.56, M.woodDark, 0, 0, 0);
      if (!tv) return group(base, box(0.66, 0.5, 0.46, M.wood, 0, 0.5, 0), box(0.46, 0.34, 0.02, M.glass, -0.06, 0.58, 0.24));
      tv.position.y = 0.5;
      const ant = model("kf_tv_antenna", 0.36, 0.14, { height: 0.2 });
      if (ant) ant.position.set(0, 1.0, -0.05);
      return ant ? group(base, tv, ant) : group(base, tv);
    },
  },
  p_jukebox: {
    label: "Jukebox",
    w: 0.9,
    d: 0.6,
    blocks: true,
    interactive: true,
    build: () => {
      // corpo de madeira, arco em cima com faixa de luz e vitrine dos discos
      const arch = cyl(0.42, 0.42, 0.5, M.woodDark, 0, 1.25, 0, 16);
      arch.rotateX(Math.PI / 2);
      arch.scale.set(1, 1, 1);
      const glow = cyl(0.36, 0.36, 0.52, M.neonToon, 0, 1.25, 0, 16);
      glow.rotateX(Math.PI / 2);
      glow.scale.set(1, 0.98, 1);
      return group(
        box(0.84, 1.25, 0.5, M.woodDark, 0, 0, 0),
        arch,
        glow,
        box(0.6, 0.36, 0.02, M.glass, 0, 0.88, 0.26),
        box(0.5, 0.08, 0.02, P.gold, 0, 0.66, 0.26),
        box(0.66, 0.42, 0.02, P.black, 0, 0.15, 0.26),
        box(0.06, 1.2, 0.06, M.orange, -0.4, 0.02, 0.24),
        box(0.06, 1.2, 0.06, M.orange, 0.4, 0.02, 0.24),
        box(0.12, 0.05, 0.03, M.red, -0.2, 0.55, 0.26),
        box(0.12, 0.05, 0.03, M.yellow, 0, 0.55, 0.26),
        box(0.12, 0.05, 0.03, P.green, 0.2, 0.55, 0.26),
      );
    },
  },
  p_turntable: {
    label: "Toca-discos (DJ)",
    w: 1.2,
    d: 0.6,
    blocks: true,
    interactive: true,
    build: () => {
      const deck = (x: number) =>
        group(
          box(0.42, 0.06, 0.42, P.metal, x, 0.92, 0),
          cyl(0.17, 0.17, 0.015, P.black, x, 0.98, 0, 20),
          cyl(0.05, 0.05, 0.02, M.red, x, 0.985, 0, 10),
          box(0.02, 0.02, 0.22, P.metal, x + 0.16, 1.0, 0.02),
        );
      return group(
        box(1.16, 0.9, 0.56, P.black, 0, 0, 0),
        box(1.1, 0.04, 0.02, M.neonToon, 0, 0.6, 0.285),
        deck(-0.34),
        deck(0.34),
        box(0.18, 0.05, 0.3, M.dark, 0, 0.93, 0),
        cyl(0.012, 0.012, 0.03, P.cream, -0.04, 0.97, 0.05, 6),
        cyl(0.012, 0.012, 0.03, P.cream, 0.04, 0.97, 0.05, 6),
      );
    },
  },
  p_gramophone: {
    label: "Gramofone",
    w: 0.6,
    d: 0.6,
    blocks: false,
    interactive: true,
    build: () => {
      // caixa de madeira, disco e a corneta dourada
      const horn = cyl(0.24, 0.02, 0.5, P.gold, 0, 0, 0, 14);
      horn.rotateZ(-Math.PI / 3.2);
      horn.position.set(0.12, 1.05, -0.02);
      const neck = cyl(0.025, 0.025, 0.28, P.gold, -0.08, 0.72, -0.02, 6);
      neck.rotateZ(-0.5);
      return group(
        cyl(0.16, 0.2, 0.5, M.woodDark, 0, 0, 0, 10),
        box(0.42, 0.18, 0.42, M.wood, 0, 0.5, 0),
        cyl(0.17, 0.17, 0.012, P.black, 0, 0.68, 0, 18),
        neck,
        horn,
        cyl(0.03, 0.03, 0.05, P.gold, 0.21, 0.56, 0, 6).rotateZ(Math.PI / 2),
      );
    },
  },
  p_radio_console: {
    label: "Rádio vitrola de chão",
    w: 1.3,
    d: 0.5,
    blocks: true,
    interactive: true,
    build: () =>
      group(
        // móvel de pés palito com tela de tecido e dial
        box(0.04, 0.22, 0.04, M.woodDark, -0.58, 0, -0.18),
        box(0.04, 0.22, 0.04, M.woodDark, 0.58, 0, -0.18),
        box(0.04, 0.22, 0.04, M.woodDark, -0.58, 0, 0.18),
        box(0.04, 0.22, 0.04, M.woodDark, 0.58, 0, 0.18),
        box(1.26, 0.52, 0.46, M.wood, 0, 0.22, 0),
        box(0.5, 0.4, 0.02, P.fabric, -0.32, 0.28, 0.235),
        box(0.5, 0.4, 0.02, P.fabric, 0.32, 0.28, 0.235),
        box(0.12, 0.4, 0.02, M.woodDark, 0, 0.28, 0.236),
        box(0.4, 0.06, 0.02, P.cream, 0.32, 0.66, 0.235),
        box(0.01, 0.05, 0.022, M.red, 0.38, 0.665, 0.237),
        box(1.2, 0.03, 0.42, M.woodDark, 0, 0.74, 0),
      ),
  },
  p_soundbar: {
    label: "Soundbar com subwoofer",
    w: 1.3,
    d: 0.5,
    blocks: false,
    interactive: true,
    build: () =>
      group(
        // rack baixo com a barra de som e o subwoofer ao lado
        box(1.0, 0.4, 0.42, M.woodDark, -0.14, 0, 0),
        box(0.9, 0.08, 0.1, P.black, -0.14, 0.4, 0.08),
        box(0.86, 0.04, 0.02, M.steel, -0.14, 0.42, 0.135),
        box(0.06, 0.012, 0.02, M.neonToon, 0.24, 0.47, 0.13),
        box(0.28, 0.42, 0.34, P.black, 0.5, 0, 0),
        cyl(0.1, 0.1, 0.02, M.steel, 0.5, 0.22, 0.17, 14).rotateX(Math.PI / 2),
      ),
  },
  p_studio_monitors: {
    label: "Monitores de estúdio",
    w: 1.4,
    d: 0.7,
    blocks: true,
    interactive: true,
    build: () => {
      const mon = (x: number) =>
        group(
          box(0.26, 0.4, 0.28, P.black, x, 0.78, 0),
          cyl(0.09, 0.09, 0.02, M.yellow, x, 0.9, 0.14, 14).rotateX(Math.PI / 2),
          cyl(0.035, 0.035, 0.02, M.steel, x, 1.08, 0.14, 10).rotateX(Math.PI / 2),
        );
      return group(
        // mesinha de som com mesa de mixagem
        box(1.36, 0.05, 0.66, M.wood, 0, 0.73, 0),
        box(0.05, 0.73, 0.05, P.metal, -0.62, 0, -0.28),
        box(0.05, 0.73, 0.05, P.metal, 0.62, 0, -0.28),
        box(0.05, 0.73, 0.05, P.metal, -0.62, 0, 0.28),
        box(0.05, 0.73, 0.05, P.metal, 0.62, 0, 0.28),
        mon(-0.5),
        mon(0.5),
        box(0.5, 0.06, 0.3, M.dark, 0, 0.78, 0.1),
        box(0.42, 0.012, 0.02, M.neonToon, 0, 0.815, 0.0),
      );
    },
  },
  p_vending: {
    label: "Máquina de lanches",
    w: 0.9,
    d: 0.8,
    blocks: true,
    interactive: true,
    build: () => {
      const g = group(box(0.9, 1.9, 0.75, M.red, 0, 0, 0), box(0.6, 1.4, 0.02, M.glass, -0.08, 0.35, 0.38), box(0.18, 0.9, 0.03, P.black, 0.32, 0.8, 0.38), box(0.12, 0.08, 0.03, M.neonToon, 0.32, 1.5, 0.39), box(0.55, 0.15, 0.04, P.black, -0.08, 0.12, 0.38));
      const cols = [M.yellow, M.blue, P.green, M.orange, P.pink];
      for (let s = 0; s < 4; s++) for (let i = 0; i < 4; i++) g.add(box(0.1, 0.16, 0.1, cols[(s + i) % 5], -0.3 + i * 0.145, 0.45 + s * 0.32, 0.25));
      return g;
    },
  },
  p_espresso: {
    label: "Máquina de expresso",
    w: 0.5,
    d: 0.4,
    blocks: false,
    build: () => group(box(0.45, 0.4, 0.35, P.metal, 0, 0, 0), box(0.45, 0.06, 0.35, P.black, 0, 0.4, 0), box(0.12, 0.08, 0.1, P.black, 0, 0.22, 0.18), cyl(0.04, 0.035, 0.07, P.cream, 0, 0.04, 0.12, 8), cyl(0.05, 0.05, 0.03, P.black, 0.15, 0.46, 0, 8)),
  },
  p_fruit_bowl: {
    label: "Fruteira",
    w: 0.4,
    d: 0.4,
    blocks: false,
    build: () => group(cyl(0.18, 0.1, 0.08, M.woodDark, 0, 0, 0, 12), blob(0.06, M.red, -0.06, 0.1, 0), blob(0.06, M.yellow, 0.06, 0.1, 0.02), blob(0.055, P.green, 0, 0.12, -0.06), blob(0.05, M.orange, 0.02, 0.17, 0.03)),
  },
  p_water_jug: {
    label: "Garrafão de água",
    w: 0.4,
    d: 0.4,
    blocks: false,
    build: () => group(cyl(0.16, 0.16, 0.45, toon("#9fd8ef", { transparent: true, opacity: 0.6 }), 0, 0, 0, 12), cyl(0.06, 0.16, 0.1, toon("#9fd8ef", { transparent: true, opacity: 0.6 }), 0, 0.45, 0, 12), cyl(0.05, 0.05, 0.05, M.blue, 0, 0.55, 0, 8)),
  },

  // ---------- banheiro
  p_towel: {
    label: "Toalheiro com toalha",
    w: 0.6,
    d: 0.1,
    blocks: false,
    build: () => hung(group(box(0.55, 0.03, 0.06, P.metal, 0, -0.1, 0.03), box(0.45, 0.5, 0.03, P.teal, 0, -0.55, 0.05))),
  },
  p_hamper: {
    label: "Cesto de roupa",
    w: 0.45,
    d: 0.45,
    blocks: false,
    build: () => group(cyl(0.2, 0.17, 0.5, P.cork, 0, 0, 0, 10), cyl(0.21, 0.21, 0.04, M.woodDark, 0, 0.5, 0, 10)),
  },
};
Object.assign(DEFS, NEW_DEFS);
/** Caixas de som, rádios, jukebox e toca-discos do pacote novo: todos tocam música (YouTube/Spotify), como o rádio. */
const SPEAKER_PACK = /^pk_snd_(book|torre|sbar|bt|teto|sub|smart|estudio|vinil|radio|jukebox|boombox)/;
export const isSpeakerType = (t: string) => SPEAKER_PACK.test(t);
// ---------- pacote novo (pk_*): mesas, câmeras, computadores, impressoras, som, podcast, decoração...
for (const p of PACK) {
  DEFS[p.id] = {
    label: p.label,
    interactive: SPEAKER_PACK.test(p.id) || undefined,
    w: p.w,
    d: p.d,
    blocks: p.blocks,
    build: () => {
      const g = new THREE.Group();
      const o = p.build();
      o.position.y += p.tabletop ? PACK_TABLE_Y : p.mount === "wall" ? MOUNT_Y : p.mount === "ceiling" ? PACK_CEIL_Y : 0;
      g.add(o);
      if (p.tick || p.use) Object.assign(g.userData, { ptick: p.tick, puse: p.use, pon: 0 });
      return g;
    },
  };
  if (p.mount === "wall") WALL_MOUNT.add(p.id);
  PALETTE.push(p.id);
}
for (const k of ["p_corkboard", "p_dartboard", "p_neon_ring", "p_clock_wall", "p_mirror", "p_towel"]) WALL_MOUNT.add(k);
