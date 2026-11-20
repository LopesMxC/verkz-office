import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { LOGO_PATH, LOGO_SVG, NEON } from "./logo";
import { pixelTexture, rng, toon } from "./toon";

export interface Item {
  id: string;
  type: string;
  x: number;
  z: number;
  rot: number;
}

export interface Zone {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  private: boolean;
}

export interface Layout {
  version: number;
  size: { w: number; d: number };
  spawn: { x: number; z: number };
  items: Item[];
  zones: Zone[];
}

interface Def {
  label: string;
  w: number;
  d: number;
  blocks: boolean;
  build: () => THREE.Object3D;
}

// ---------- materiais compartilhados (leve: poucos materiais reaproveitados)
// Paleta pensada para pixel art: tons médios legíveis sobre o piso escuro, neon só nos detalhes.
const woodTex = pixelTexture(16, 16, (g) => {
  const r = rng(7);
  g.fillStyle = "#7a5638";
  g.fillRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y += 4) {
    g.fillStyle = "#6a4a30";
    g.fillRect(0, y + 3, 16, 1);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = r() > 0.5 ? "#86603f" : "#704e33";
      g.fillRect(Math.floor(r() * 14), y + 1, 2 + Math.floor(r() * 3), 1);
    }
  }
});
const wallTex = pixelTexture(16, 16, (g) => {
  g.fillStyle = "#2c2c33";
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = "#34343c";
  g.fillRect(0, 0, 16, 7);
  g.fillStyle = "#24242a";
  g.fillRect(0, 7, 16, 1);
  g.fillRect(0, 15, 16, 1);
  g.fillStyle = "#3a3a43";
  g.fillRect(0, 0, 16, 1);
});
const fabricTex = pixelTexture(8, 8, (g) => {
  g.fillStyle = "#3d4f63";
  g.fillRect(0, 0, 8, 8);
  g.fillStyle = "#435770";
  for (let i = 0; i < 8; i += 2) g.fillRect(i, (i * 3) % 8, 1, 1);
});
const M = {
  wall: toon("#ffffff", { map: wallTex }),
  cap: toon("#45454f"),
  dark: toon("#2a2a31"),
  mid: toon("#4a4a55"),
  light: toon("#8a8a96"),
  white: toon("#e8e6df"),
  wood: toon("#ffffff", { map: woodTex }),
  woodDark: toon("#5a3f2a"),
  fabric: toon("#ffffff", { map: fabricTex }),
  fabricDark: toon("#334355"),
  chair: toon("#2f3644"),
  leaf: toon("#5c9e3f"),
  leafLight: toon("#7cc04f"),
  pot: toon("#c9c2b4"),
  screen: toon("#1d2a12", { emissive: 0.35 }),
  neon: new THREE.MeshBasicMaterial({ color: NEON, toneMapped: false }),
  neonSoft: toon(NEON, { emissive: 0.6 }),
  rug: toon("#26301a"),
  glass: toon("#9fd0e0", { transparent: true, opacity: 0.3 }),
  board: toon("#f1f0ea"),
  book1: toon("#c0533b"),
  book2: toon("#3b6fc0"),
  book3: toon("#e0b23c"),
};

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
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

function group(...children: THREE.Object3D[]) {
  const g = new THREE.Group();
  children.forEach((c) => g.add(c));
  return g;
}

let logoShapes: THREE.Shape[] | null = null;
function getLogoShapes() {
  if (!logoShapes) {
    const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${LOGO_PATH}"/></svg>`);
    logoShapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
  }
  return logoShapes;
}

function logoMesh(size: number, depth: number, mat: THREE.Material) {
  const geo = new THREE.ExtrudeGeometry(getLogoShapes(), { depth, bevelEnabled: false, curveSegments: 6 });
  geo.center();
  const s = size / 550;
  geo.scale(s, -s, s); // SVG tem Y para baixo
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

let floorLogoTex: THREE.Texture | null = null;
function floorLogoTexture() {
  if (floorLogoTex) return floorLogoTex;
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const ctx = c.getContext("2d")!;
  const img = new Image();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  img.onload = () => {
    ctx.clearRect(0, 0, 96, 96);
    ctx.globalAlpha = 1; // bem discreta no piso
    ctx.drawImage(img, 12, 20, 72, 51);
    tex.needsUpdate = true;
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(LOGO_SVG);
  floorLogoTex = tex;
  return tex;
}

function chair() {
  return group(
    cyl(0.04, 0.04, 0.4, M.mid, 0, 0, 0, 6),
    box(0.44, 0.04, 0.44, M.mid, 0, 0.02, 0),
    box(0.5, 0.09, 0.5, M.chair, 0, 0.4, 0),
    box(0.5, 0.5, 0.08, M.chair, 0, 0.48, -0.22),
  );
}

function monitor(x: number, z: number) {
  return group(box(0.06, 0.25, 0.06, M.mid, x, 0.76, z), box(0.7, 0.42, 0.04, M.screen, x, 0.95, z));
}

export const DEFS: Record<string, Def> = {
  wall: {
    label: "Parede",
    w: 1,
    d: 1,
    blocks: true,
    build: () => group(box(1, 1.25, 1, M.wall), box(1.001, 0.06, 1.001, M.cap, 0, 1.25, 0)),
  },
  glass_wall: {
    label: "Vidro",
    w: 1,
    d: 0.2,
    blocks: true,
    build: () => group(box(1, 1.3, 0.08, M.glass), box(1, 0.05, 0.12, M.neonSoft, 0, 1.3, 0)),
  },
  desk: {
    label: "Mesa de trabalho",
    w: 2,
    d: 1,
    blocks: true,
    build: () =>
      group(
        box(2, 0.06, 1, M.wood, 0, 0.72, 0),
        box(0.08, 0.72, 0.9, M.woodDark, -0.94, 0, 0),
        box(0.08, 0.72, 0.9, M.woodDark, 0.94, 0, 0),
        monitor(-0.45, -0.25),
        monitor(0.45, 0.25),
        box(0.45, 0.02, 0.15, M.mid, -0.45, 0.78, 0.1),
        box(0.45, 0.02, 0.15, M.mid, 0.45, 0.78, -0.1),
      ),
  },
  chair: { label: "Cadeira", w: 0.6, d: 0.6, blocks: false, build: chair },
  table: {
    label: "Mesa de reunião",
    w: 4,
    d: 1.6,
    blocks: true,
    build: () =>
      group(
        box(4, 0.08, 1.6, M.wood, 0, 0.72, 0),
        box(3.4, 0.72, 0.3, M.woodDark, 0, 0, 0),
        box(3.6, 0.01, 0.05, M.neonSoft, 0, 0.8, 0),
      ),
  },
  table_round: {
    label: "Mesa redonda",
    w: 1.2,
    d: 1.2,
    blocks: true,
    build: () => group(cyl(0.6, 0.6, 0.05, M.wood, 0, 0.72, 0, 10), cyl(0.06, 0.06, 0.72, M.mid), cyl(0.3, 0.3, 0.03, M.mid)),
  },
  coffee_table: {
    label: "Mesa de centro",
    w: 1.4,
    d: 0.8,
    blocks: true,
    build: () => group(box(1.4, 0.06, 0.8, M.wood, 0, 0.36, 0), box(1.2, 0.36, 0.6, M.woodDark)),
  },
  sofa: {
    label: "Sofá",
    w: 3,
    d: 1,
    blocks: true,
    build: () =>
      group(
        box(3, 0.42, 1, M.fabric),
        box(3, 0.6, 0.25, M.fabric, 0, 0.3, -0.38),
        box(0.25, 0.3, 1, M.fabric, -1.38, 0.42, 0),
        box(0.25, 0.3, 1, M.fabric, 1.38, 0.42, 0),
        box(1.3, 0.12, 0.7, M.fabricDark, -0.66, 0.42, 0.08),
        box(1.3, 0.12, 0.7, M.fabricDark, 0.66, 0.42, 0.08),
      ),
  },
  plant: {
    label: "Planta",
    w: 0.7,
    d: 0.7,
    blocks: true,
    build: () => {
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), M.leaf);
      leaves.position.y = 0.95;
      leaves.castShadow = true;
      const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), M.leafLight);
      top.position.set(0.1, 1.3, 0.05);
      top.castShadow = true;
      return group(cyl(0.25, 0.2, 0.55, M.pot), leaves, top);
    },
  },
  rug: {
    label: "Tapete",
    w: 4,
    d: 3,
    blocks: false,
    build: () => {
      const tex = pixelTexture(32, 24, (g) => {
        g.fillStyle = "#2b3320";
        g.fillRect(0, 0, 32, 24);
        g.fillStyle = "#3a4628";
        g.fillRect(2, 2, 28, 20);
        g.fillStyle = "#2b3320";
        g.fillRect(4, 4, 24, 16);
        g.fillStyle = "#C8F501";
        for (let i = 6; i < 26; i += 4) g.fillRect(i, 11, 2, 2);
      });
      const r = new THREE.Mesh(new THREE.BoxGeometry(4, 0.03, 3), [M.rug, M.rug, toon("#ffffff", { map: tex }), M.rug, M.rug, M.rug]);
      r.position.y = 0.015;
      r.receiveShadow = true;
      return r;
    },
  },
  lamp: {
    label: "Luminária",
    w: 0.5,
    d: 0.5,
    blocks: true,
    build: () => group(cyl(0.2, 0.25, 0.04, M.mid), cyl(0.02, 0.02, 1.5, M.mid), cyl(0.18, 0.28, 0.3, M.neonSoft, 0, 1.45, 0)),
  },
  tv: {
    label: "TV / Tela",
    w: 3,
    d: 0.3,
    blocks: true,
    build: () => group(box(3, 1.4, 0.1, M.dark, 0, 0.9, 0), box(2.85, 1.25, 0.02, M.screen, 0, 0.975, 0.06)),
  },
  whiteboard: {
    label: "Quadro",
    w: 2,
    d: 0.3,
    blocks: true,
    build: () => group(box(2, 1.1, 0.06, M.board, 0, 0.9, 0), box(2.05, 0.05, 0.12, M.mid, 0, 0.88, 0.04)),
  },
  bookshelf: {
    label: "Estante",
    w: 2,
    d: 0.5,
    blocks: true,
    build: () => {
      const g = group(box(2, 2, 0.5, M.woodDark));
      const cols = [M.book1, M.book2, M.book3, M.white, M.neonSoft];
      for (let s = 0; s < 3; s++) {
        g.add(box(1.9, 0.03, 0.45, M.mid, 0, 0.55 + s * 0.55, 0.02));
        for (let b = 0; b < 7; b++) {
          if ((b + s) % 4 === 3) continue;
          g.add(box(0.12, 0.38, 0.32, cols[(b * 3 + s) % cols.length], -0.8 + b * 0.24, 0.58 + s * 0.55, 0.05));
        }
      }
      return g;
    },
  },
  counter: {
    label: "Balcão",
    w: 3,
    d: 0.8,
    blocks: true,
    build: () => group(box(3, 0.9, 0.8, M.dark), box(3.05, 0.06, 0.85, M.white, 0, 0.9, 0), box(3, 0.03, 0.02, M.neonSoft, 0, 0.4, 0.41)),
  },
  coffee: {
    label: "Café",
    w: 2,
    d: 0.8,
    blocks: true,
    build: () =>
      group(
        box(2, 0.9, 0.8, M.dark),
        box(2.05, 0.06, 0.85, M.white, 0, 0.9, 0),
        box(0.5, 0.55, 0.45, M.mid, -0.5, 0.95, -0.1),
        box(0.12, 0.05, 0.12, M.neon, -0.5, 1.35, 0.13),
        cyl(0.05, 0.04, 0.1, M.light, 0.3, 0.95, 0.1, 8),
        cyl(0.05, 0.04, 0.1, M.light, 0.5, 0.95, 0.05, 8),
      ),
  },
  speaker: {
    label: "Caixa de som",
    w: 0.6,
    d: 0.6,
    blocks: true,
    build: () => group(box(0.55, 1.1, 0.5, M.dark), cyl(0.18, 0.18, 0.02, M.neonSoft, 0, 0.7, 0.26, 20).rotateX(Math.PI / 2)),
  },
  neon_logo: {
    label: "Logo neon",
    w: 3,
    d: 0.4,
    blocks: true,
    build: () => {
      const l = logoMesh(2.2, 0.08, M.neon);
      l.position.set(0, 1.3, 0.05);
      return group(box(3, 2.4, 0.15, M.wall, 0, 0, -0.05), l);
    },
  },
  floor_logo: {
    label: "Logo no piso",
    w: 6,
    d: 6,
    blocks: false,
    // desenhada direto na textura do piso (World.makeFloorTexture); aqui só um marcador invisível
    build: () => new THREE.Group(),
  },
};

/** Tipos que aparecem na paleta do editor. */
export const PALETTE = Object.keys(DEFS);

export function footprint(it: Item) {
  const d = DEFS[it.type];
  if (!d) return { w: 1, d: 1 };
  const r = ((it.rot % 360) + 360) % 360;
  return r === 90 || r === 270 ? { w: d.d, d: d.w } : { w: d.w, d: d.d };
}

export function buildItem(it: Item): THREE.Object3D {
  const def = DEFS[it.type];
  const obj = def ? def.build() : box(1, 1, 1, M.mid);
  obj.position.set(it.x, 0, it.z);
  obj.rotation.y = -(it.rot * Math.PI) / 180;
  obj.userData.itemId = it.id;
  return obj;
}
