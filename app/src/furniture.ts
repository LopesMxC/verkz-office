import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { LOGO_PATH, NEON } from "./logo";
import { pixelTexture, rng, toon } from "./toon";
import { model } from "./models";
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
}

export interface Zone {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  private: boolean;
  /** Piso da sala: carpete-azul, carpete-verde, carpete-lilas, carpete-grafite, madeira, ceramica. */
  floor?: string;
}

export interface Layout {
  version: number;
  size: { w: number; d: number };
  spawn: { x: number; z: number };
  items: Item[];
  zones: Zone[];
  /** Clima, estação e datas especiais (configurado pela gestão). */
  env?: import("./env").EnvConfig;
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
const screenTex = (a: string, b: string) =>
  pixelTexture(12, 8, (g) => {
    g.fillStyle = "#1d2433";
    g.fillRect(0, 0, 12, 8);
    g.fillStyle = a;
    g.fillRect(1, 1, 10, 3);
    g.fillStyle = b;
    g.fillRect(1, 5, 4, 2);
    g.fillRect(6, 5, 5, 1);
  });

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
  neon: new THREE.MeshBasicMaterial({ color: NEON, toneMapped: false }),
  neonToon: toon(NEON),
  red: toon("#d9534f"),
  blue: toon("#3b6fc0"),
  yellow: toon("#f2c14e"),
  purple: toon("#8a6cc9"),
};

function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function blob(r: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
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
    build: () => {
      const felt = toon("#2f8a5a");
      return group(
        box(0.14, 0.62, 0.14, M.woodDark, -1.05, 0, -0.55),
        box(0.14, 0.62, 0.14, M.woodDark, 1.05, 0, -0.55),
        box(0.14, 0.62, 0.14, M.woodDark, -1.05, 0, 0.55),
        box(0.14, 0.62, 0.14, M.woodDark, 1.05, 0, 0.55),
        box(2.4, 0.14, 1.4, M.woodDark, 0, 0.62, 0),
        box(2.16, 0.04, 1.16, felt, 0, 0.76, 0),
        blob(0.05, M.white, 0.5, 0.82, 0),
        blob(0.05, M.red, -0.4, 0.82, 0.1),
        blob(0.05, M.yellow, -0.48, 0.82, -0.05),
        blob(0.05, M.blue, -0.32, 0.82, -0.08),
        box(1.4, 0.03, 0.03, M.beige, 0.1, 0.84, 0.3),
      );
    },
  },
  ping_pong: {
    label: "Mesa de pingue-pongue",
    w: 2.6,
    d: 1.5,
    blocks: true,
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
      const r = new THREE.Mesh(new THREE.BoxGeometry(4, 0.03, 3), [M.white, M.white, top, M.white, M.white, M.white]);
      r.position.y = 0.015;
      r.receiveShadow = true;
      return r;
    })(),
  },
  rug_oval: { label: "Tapete oval", w: 3, d: 2, blocks: false, build: () => model("rug_oval", 3, 2) ?? new THREE.Group() },
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
        const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), M.leafDark);
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
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), c);
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
          const fl = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 3), cols[(i + line) % cols.length]);
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
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), M.orange);
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
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), cols[Math.floor(Math.random() * cols.length)]);
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
    build: () => model(Math.random() > 0.5 ? "tree_oak" : "tree_fat", 1.8, 1.8, { fit: "width" }) ?? group(cyl(0.16, 0.22, 1.1, M.trunk, 0, 0, 0, 6), blob(0.85, M.leaf, 0, 1.55, 0)),
  },
  pine: {
    label: "Pinheiro",
    w: 1.2,
    d: 1.2,
    blocks: true,
    outdoor: true,
    build: () => model(Math.random() > 0.5 ? "tree_pine" : "tree_pine_tall", 1.5, 1.5, { fit: "width" }) ?? group(cyl(0.12, 0.16, 0.8, M.trunk), blob(0.7, M.leafDark, 0, 1.4, 0)),
  },
  bush: {
    label: "Arbusto",
    w: 1,
    d: 1,
    blocks: true,
    outdoor: true,
    build: () => model(Math.random() > 0.5 ? "bush" : "bush_large", 1.1, 1.1, { fit: "width" }) ?? group(blob(0.42, M.leafDark, 0, 0.32, 0), blob(0.34, M.leaf, 0.25, 0.4, 0.1)),
  },
  flower: { label: "Flores", w: 0.5, d: 0.5, blocks: false, outdoor: true, build: () => model("flower", 0.5, 0.5, { fit: "width" }) ?? new THREE.Group() },
  rock: { label: "Pedra", w: 0.7, d: 0.7, blocks: true, outdoor: true, build: () => model("rock", 0.7, 0.7) ?? blob(0.3, M.grey, 0, 0.2, 0) },
  stump: { label: "Toco", w: 0.6, d: 0.6, blocks: true, outdoor: true, build: () => model("stump", 0.6, 0.6) ?? cyl(0.25, 0.3, 0.3, M.trunk) },
};

/** Tipos que aparecem na paleta do editor. */
export const PALETTE = Object.keys(DEFS).filter((k) => !DEFS[k].decor);

export function footprint(it: Item) {
  const d = DEFS[it.type];
  if (!d) return { w: 1, d: 1 };
  const r = ((it.rot % 360) + 360) % 360;
  return r === 90 || r === 270 ? { w: d.d, d: d.w } : { w: d.w, d: d.d };
}

export function buildItem(it: Item): THREE.Object3D {
  const def = DEFS[it.type];
  const obj = def ? def.build(it) : box(1, 1, 1, M.grey);
  obj.position.set(it.x, 0, it.z);
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
  const mats = [wallMats.side, wallMats.side, wallMats.cap, wallMats.base, wallMats.face, wallMats.face];
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
      piece(w, 0.9, d, cx, 0, cz);
      piece(w, H - 2.15, d, cx, 2.15, cz);
    } else piece(w, H, d, cx, 0, cz);
    // rodapé escuro
    piece(a.dx ? len : T + 0.02, 0.1, a.dz ? len : T + 0.02, cx, 0, cz, wallMats.base);
  }
  if (isWindow) {
    const span = 1 - T * 0.2;
    const sx = alongX ? span : T * 0.5;
    const sz = alongX ? T * 0.5 : span;
    // vidro
    const glass = new THREE.Mesh(new THREE.BoxGeometry(alongX ? span : 0.04, 1.25, alongX ? 0.04 : span), wallMats.glass);
    glass.position.set(0, 0.9 + 0.625, 0);
    g.add(glass);
    // moldura e divisória
    const fr = (w: number, h: number, d: number, x: number, y: number, z: number) => piece(w, h, d, x, y, z, wallMats.frame);
    fr(sx, 0.06, sz, 0, 0.88, 0); // peitoril
    fr(sx, 0.06, sz, 0, 2.1, 0);
    fr(alongX ? 0.05 : T * 0.55, 1.25, alongX ? T * 0.55 : 0.05, 0, 0.92, 0); // divisória do meio
    piece(alongX ? span : T + 0.12, 0.05, alongX ? T + 0.12 : span, 0, 0.86, 0, wallMats.sill);
  }
  g.position.set(it.x, 0, it.z);
  g.userData.itemId = it.id;
  return g;
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
