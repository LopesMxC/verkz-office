import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { LOGO_PATH, LOGO_SVG, NEON } from "./logo";

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
const M = {
  wall: new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.9, flatShading: true }),
  dark: new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.7, flatShading: true }),
  mid: new THREE.MeshStandardMaterial({ color: 0x34343a, roughness: 0.6, flatShading: true }),
  light: new THREE.MeshStandardMaterial({ color: 0x5a5a62, roughness: 0.5, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: 0x3b2f27, roughness: 0.65, flatShading: true }),
  fabric: new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 1, flatShading: true }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x3f6b2a, roughness: 0.8, flatShading: true }),
  pot: new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.4, flatShading: true }),
  screen: new THREE.MeshStandardMaterial({ color: 0x0b0b0b, emissive: 0x9fc200, emissiveIntensity: 0.25, roughness: 0.2 }),
  neon: new THREE.MeshStandardMaterial({ color: NEON, emissive: NEON, emissiveIntensity: 2.2 }),
  neonSoft: new THREE.MeshStandardMaterial({ color: NEON, emissive: NEON, emissiveIntensity: 0.9 }),
  cap: new THREE.MeshStandardMaterial({ color: 0x2e2e33, roughness: 0.8, flatShading: true }),
  rug: new THREE.MeshStandardMaterial({ color: 0x202018, roughness: 1, flatShading: true }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fb0b8, transparent: true, opacity: 0.25, roughness: 0.1 }),
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
  c.width = c.height = 512;
  const ctx = c.getContext("2d")!;
  const img = new Image();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  img.onload = () => {
    ctx.clearRect(0, 0, 512, 512);
    ctx.globalAlpha = 0.09; // bem discreta no piso
    ctx.drawImage(img, 56, 96, 400, 283);
    tex.needsUpdate = true;
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(LOGO_SVG);
  floorLogoTex = tex;
  return tex;
}

function chair() {
  return group(
    cyl(0.04, 0.04, 0.4, M.light, 0, 0, 0, 8),
    box(0.5, 0.08, 0.5, M.fabric, 0, 0.4, 0),
    box(0.5, 0.5, 0.08, M.fabric, 0, 0.48, -0.22),
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
    build: () => group(box(1, 1.25, 1, M.wall), box(1.001, 0.04, 1.001, M.cap, 0, 1.25, 0), box(0.12, 0.045, 0.12, M.neonSoft, 0, 1.25, 0)),
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
        box(0.06, 0.72, 0.9, M.dark, -0.95, 0, 0),
        box(0.06, 0.72, 0.9, M.dark, 0.95, 0, 0),
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
        box(3.4, 0.72, 0.3, M.dark, 0, 0, 0),
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
    build: () => group(box(1.4, 0.06, 0.8, M.wood, 0, 0.36, 0), box(1.2, 0.36, 0.6, M.dark)),
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
        box(1.3, 0.12, 0.7, M.mid, -0.66, 0.42, 0.08),
        box(1.3, 0.12, 0.7, M.mid, 0.66, 0.42, 0.08),
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
      const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), M.leaf);
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
      const r = box(4, 0.02, 3, M.rug);
      r.castShadow = false;
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(4.05, 3.05), new THREE.MeshBasicMaterial({ color: NEON, transparent: true, opacity: 0.12 }));
      edge.rotation.x = -Math.PI / 2;
      edge.position.y = 0.005;
      return group(edge, r);
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
    build: () => group(box(2, 1.1, 0.06, new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.3, flatShading: true }), 0, 0.9, 0), box(2.05, 0.05, 0.12, M.mid, 0, 0.88, 0.04)),
  },
  bookshelf: {
    label: "Estante",
    w: 2,
    d: 0.5,
    blocks: true,
    build: () => {
      const g = group(box(2, 2, 0.5, M.dark));
      const cols = [M.light, M.mid, M.neonSoft, M.wood];
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
    build: () => group(box(3, 0.9, 0.8, M.dark), box(3.05, 0.05, 0.85, M.light, 0, 0.9, 0), box(3, 0.03, 0.02, M.neonSoft, 0, 0.4, 0.41)),
  },
  coffee: {
    label: "Café",
    w: 2,
    d: 0.8,
    blocks: true,
    build: () =>
      group(
        box(2, 0.9, 0.8, M.dark),
        box(2.05, 0.05, 0.85, M.light, 0, 0.9, 0),
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
    build: () => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: floorLogoTexture(), transparent: true, depthWrite: false }));
      p.rotation.x = -Math.PI / 2;
      p.position.y = 0.03;
      return p;
    },
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
