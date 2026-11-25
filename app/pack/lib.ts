// Pacote de assets (PRÉVIA). Isolado: nada aqui é importado pelo app até a aprovação.
import * as THREE from "three";
import { geo } from "../src/geo";
import { pixelTexture, rng, toon } from "../src/toon";

export interface PackDef {
  id: string;
  cat: string;
  label: string;
  w: number;
  d: number;
  blocks: boolean;
  /** Tem animação ociosa (câmera varre, LED pisca, ventilador gira...). */
  idle?: boolean;
  /** Tem uso (clicar): imprimir, copiar, triturar, café... */
  /** Pequeno: fica em cima da mesa (a prévia mostra numa base). */
  tabletop?: boolean;
  /** Preso na parede ou no teto (a origem do modelo é o ponto de fixação). */
  mount?: "wall" | "ceiling";
  use?: "print" | "scan" | "shred" | "coffee" | "vend" | "lamp" | "screen";
  build: () => THREE.Object3D;
  /** Animação por tempo; `on` = em uso. */
  tick?: (g: THREE.Object3D, t: number, on: boolean) => void;
}

export const c = (hex: string) => toon(hex);
export const glow = (hex: string) => Object.assign(new THREE.MeshBasicMaterial({ color: hex, toneMapped: false }), { userData: { shared: true } });
const glowCache = new Map<string, THREE.MeshBasicMaterial>();
export const g$ = (hex: string) => {
  let m = glowCache.get(hex);
  if (!m) glowCache.set(hex, (m = glow(hex)));
  return m;
};
export const glass = toon("#9fd8ef", { transparent: true, opacity: 0.45 });

export function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo.box(w, h, d), m);
  o.position.set(x, y + h / 2, z);
  o.castShadow = o.receiveShadow = true;
  return o;
}
export function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 10) {
  const o = new THREE.Mesh(geo.cyl(rt, rb, h, seg), m);
  o.position.set(x, y + h / 2, z);
  o.castShadow = o.receiveShadow = true;
  return o;
}
export function ball(r: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo.sphere(r, 10, 8), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}
export function cone(r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 8) {
  const o = new THREE.Mesh(geo.cone(r, h, seg), m);
  o.position.set(x, y + h / 2, z);
  o.castShadow = true;
  return o;
}
export function grp(...k: THREE.Object3D[]) {
  const g = new THREE.Group();
  k.forEach((x) => g.add(x));
  return g;
}
/** Cilindro deitado no eixo X (rodas, rolos). */
export function cylX(r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 10) {
  const o = cyl(r, r, len, m, 0, 0, 0, seg);
  o.rotation.z = Math.PI / 2;
  o.position.set(x, y, z);
  return o;
}
/** Cilindro deitado no eixo Z (lentes, alto-falantes de frente). */
export function cylZ(r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12) {
  const o = cyl(r, r, len, m, 0, 0, 0, seg);
  o.rotation.x = Math.PI / 2;
  o.position.set(x, y, z);
  return o;
}

// ---------------------------------------------------------------- paletas
export const WOODS: Record<string, string> = {
  carvalho: "#c98a55",
  nogueira: "#7a4e2d",
  cerejeira: "#a4552f",
  bordo: "#e0b67e",
  ebano: "#3a2a22",
  cinza: "#9a958c",
  branco: "#f2f0ea",
  bambu: "#d9b86a",
};
export const COLORS: Record<string, string> = {
  grafite: "#3d4460",
  preto: "#2a2d38",
  branco: "#f2f0ea",
  azul: "#3b6fc0",
  verde: "#4fae4a",
  lima: "#c8f501",
  laranja: "#e0874a",
  vermelho: "#d9534f",
  roxo: "#8a6cc9",
  rosa: "#e58aa8",
  amarelo: "#f2c14e",
  ciano: "#4fb7d9",
};
export const NAME: Record<string, string> = Object.assign({}, ...[WOODS, COLORS].map((o) => o));

export const STEEL = c("#5d6273");
export const DARK = c("#2f3240");
export const BLACK = c("#1d2029");
export const WHITE = c("#f2f0ea");
export const OFFW = c("#dcd8cf");
export const GREY = c("#8e93a3");
export const LGREY = c("#b9bcc8");
export const CHROME = c("#c9ced8");
export const NEON = g$("#c8f501");

// ---------------------------------------------------------------- texturas de tela e arte
const screenCache = new Map<string, THREE.MeshBasicMaterial>();
/** Tela acesa com um "app" desenhado em pixels. kind: code, chart, chat, video, doc, map, cam, dash. */
export function screenMat(kind: string, a = "#5ec8ff", b = "#c8f501") {
  const key = kind + a + b;
  let m = screenCache.get(key);
  if (m) return m;
  const tex = pixelTexture(16, 10, (g) => {
    g.fillStyle = "#161b27";
    g.fillRect(0, 0, 16, 10);
    const r = rng(kind.length * 31 + a.charCodeAt(1));
    if (kind === "code") {
      for (let y = 1; y < 9; y++) {
        g.fillStyle = r() > 0.5 ? a : b;
        g.fillRect(1 + Math.floor(r() * 3), y, 3 + Math.floor(r() * 9), 1);
      }
    } else if (kind === "chart") {
      g.fillStyle = a;
      for (let i = 0; i < 6; i++) g.fillRect(2 + i * 2, 8 - (1 + Math.floor(r() * 6)), 1, 1 + Math.floor(r() * 6));
      g.fillStyle = b;
      g.fillRect(1, 1, 5, 1);
    } else if (kind === "chat") {
      for (let y = 1; y < 9; y += 2) {
        g.fillStyle = y % 4 === 1 ? a : b;
        g.fillRect(y % 4 === 1 ? 1 : 6, y, 8, 1);
      }
    } else if (kind === "video") {
      g.fillStyle = a;
      g.fillRect(1, 1, 14, 8);
      g.fillStyle = "#161b27";
      g.fillRect(2, 2, 12, 6);
      g.fillStyle = b;
      g.fillRect(7, 4, 2, 2);
    } else if (kind === "doc") {
      g.fillStyle = "#e8e6df";
      g.fillRect(3, 1, 10, 8);
      g.fillStyle = a;
      for (let y = 2; y < 8; y += 2) g.fillRect(4, y, 8, 1);
    } else if (kind === "map") {
      g.fillStyle = a;
      g.fillRect(0, 4, 16, 1);
      g.fillRect(7, 0, 1, 10);
      g.fillStyle = b;
      g.fillRect(3, 6, 3, 2);
      g.fillRect(10, 2, 4, 2);
    } else if (kind === "cam") {
      g.fillStyle = "#26302a";
      g.fillRect(0, 0, 16, 10);
      g.fillStyle = a;
      g.fillRect(2, 2, 5, 3);
      g.fillRect(9, 5, 5, 4);
      g.fillStyle = b;
      g.fillRect(1, 1, 2, 1);
    } else {
      g.fillStyle = a;
      g.fillRect(1, 1, 6, 4);
      g.fillStyle = b;
      g.fillRect(9, 1, 6, 4);
      g.fillStyle = "#e8e6df";
      g.fillRect(1, 6, 14, 3);
    }
  });
  m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  m.userData.shared = true;
  screenCache.set(key, m);
  return m;
}
const artCache = new Map<number, THREE.MeshBasicMaterial>();
/** Quadros em pixel art (12 estilos). */
export function artMat(n: number) {
  n = ((n % 12) + 12) % 12;
  let m = artCache.get(n);
  if (m) return m;
  const pal = [["#5ec8ff", "#c8f501", "#2f3240"], ["#ff7aa8", "#ffd35c", "#3d4460"], ["#e0874a", "#f2f0ea", "#2a2d38"], ["#4fae4a", "#e6c08a", "#1d3a2a"], ["#8a6cc9", "#f2c14e", "#2a2540"], ["#d9534f", "#f2f0ea", "#2a2d38"]][n % 6];
  const tex = pixelTexture(12, 12, (g) => {
    const r = rng(n * 977 + 5);
    g.fillStyle = pal[2];
    g.fillRect(0, 0, 12, 12);
    if (n < 6) {
      // paisagem: sol, montanhas
      g.fillStyle = pal[1];
      g.fillRect(8, 2, 2, 2);
      g.fillStyle = pal[0];
      for (let x = 0; x < 12; x++) g.fillRect(x, 12 - (3 + Math.floor(Math.abs(Math.sin(x * 0.7 + n)) * 5)), 1, 12);
    } else {
      // abstrato: blocos
      for (let i = 0; i < 9; i++) {
        g.fillStyle = r() > 0.5 ? pal[0] : pal[1];
        g.fillRect(Math.floor(r() * 9), Math.floor(r() * 9), 2 + Math.floor(r() * 3), 2 + Math.floor(r() * 3));
      }
    }
  });
  m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  m.userData.shared = true;
  artCache.set(n, m);
  return m;
}

// ---------------------------------------------------------------- registro
export const REG: PackDef[] = [];
export function reg(d: PackDef) {
  if (REG.some((x) => x.id === d.id)) throw new Error("id repetido: " + d.id);
  REG.push(d);
}
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export function scl<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T { o.scale.set(x, y, z); return o; }
