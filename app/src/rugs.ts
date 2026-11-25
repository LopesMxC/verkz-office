import * as THREE from "three";
import { toon } from "./toon";

/**
 * Tapetes procedurais: 25 desenhos x 50 paletas = 1250 estilos (e 3 formatos).
 * O estilo é só dois números (desenho e paleta) guardados em `item.cfg.rs = { p, c, f }`.
 */
export const RUG_PATTERN_NAMES = [
  "Liso com borda", "Listras", "Listras em pé", "Xadrez", "Losangos", "Bolinhas", "Zigue-zague", "Quadrados aninhados", "Borda dupla",
  "Diagonais", "Cruzes", "Ondas", "Tijolos", "Estrelas", "Faixa central", "Grade", "Triângulos", "Kilim", "Pontilhado",
  "Degradê em faixas", "Mosaico", "Flores", "Listra no meio", "Molduras", "Pixel art",
];
export const RUG_PATTERNS = RUG_PATTERN_NAMES.length;

type Pal = [string, string, string];

/** Paletas à mão (marca, neutras, clássicas) e o resto gerado por matiz. */
const HAND: Pal[] = [
  ["#0D0D0D", "#C8F501", "#2a2d35"], ["#f4f1ea", "#0D0D0D", "#9aa0ab"], ["#e9e4f5", "#b9b0de", "#C8F501"], ["#2b3350", "#323a5c", "#C8F501"],
  ["#d9c7a3", "#8a6a3b", "#f4efe4"], ["#7d86c2", "#e9e4f5", "#2c3e8f"], ["#a33b3b", "#f2c14e", "#2a2d35"], ["#3a5a40", "#dad7cd", "#a3b18a"],
  ["#1f2937", "#9ca3af", "#f3f4f6"], ["#f7e7ce", "#c0392b", "#27ae60"],
];
const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(h) % 360},${Math.round(s)}%,${Math.round(l)}%)`;
const PALS: Pal[] = (() => {
  const out: Pal[] = [...HAND];
  for (let i = 0; out.length < 50; i++) {
    const h = (i * 47 + 13) % 360;
    const kind = i % 4;
    if (kind === 0) out.push([hsl(h, 35, 88), hsl(h, 55, 52), hsl(h + 30, 60, 38)]); // claro com tom forte
    else if (kind === 1) out.push([hsl(h, 45, 26), hsl(h + 180, 55, 62), hsl(h, 30, 14)]); // escuro com contraste
    else if (kind === 2) out.push([hsl(h, 60, 62), hsl(h + 40, 70, 82), hsl(h - 40, 50, 36)]); // vivo
    else out.push([hsl(h, 12, 82), hsl(h, 20, 58), hsl(h + 20, 30, 34)]); // suave
  }
  return out;
})();
export const RUG_PALETTES = PALS.length;
export const RUG_STYLES = RUG_PATTERNS * RUG_PALETTES;
export const rugPalette = (c: number): Pal => PALS[((c % PALS.length) + PALS.length) % PALS.length];

export interface RugStyle {
  /** desenho 0..24 */
  p: number;
  /** paleta 0..49 */
  c: number;
  /** formato: "r" retangular, "o" oval, "c" redondo */
  f?: string;
}

function draw(g: CanvasRenderingContext2D, W: number, H: number, pat: number, pal: Pal) {
  const [bg, a, b] = pal;
  const R = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  R(0, 0, W, H, bg);
  const bord = (n: number, c: string) => {
    R(0, 0, W, n, c);
    R(0, H - n, W, n, c);
    R(0, 0, n, H, c);
    R(W - n, 0, n, H, c);
  };
  const cx = W / 2, cy = H / 2;
  switch (((pat % RUG_PATTERNS) + RUG_PATTERNS) % RUG_PATTERNS) {
    case 0:
      bord(2, a);
      R(4, 4, W - 8, H - 8, bg);
      break;
    case 1:
      for (let y = 2; y < H; y += 6) R(0, y, W, 3, a);
      bord(1, b);
      break;
    case 2:
      for (let x = 2; x < W; x += 6) R(x, 0, 3, H, a);
      bord(1, b);
      break;
    case 3:
      for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) if (((x + y) / 4) % 2 === 0) R(x, y, 4, 4, a);
      bord(2, b);
      break;
    case 4:
      for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) {
        const ox = (y / 8) % 2 ? 4 : 0;
        for (let k = 0; k < 4; k++) {
          R(x + ox + 4 - k - 1, y + k, 2 * k + 2, 1, a);
          R(x + ox + 4 - k - 1, y + 7 - k, 2 * k + 2, 1, a);
        }
      }
      bord(2, b);
      break;
    case 5:
      for (let y = 3; y < H; y += 6) for (let x = 3 + ((y / 6) % 2) * 3; x < W; x += 6) R(x, y, 2, 2, a);
      bord(1, b);
      break;
    case 6:
      for (let y = 3; y < H - 3; y += 6) for (let x = 0; x < W; x++) R(x, y + (Math.floor(x / 3) % 2 ? 2 : 0), 1, 2, a);
      bord(2, b);
      break;
    case 7:
      for (let k = 0; Math.min(cx, cy) - k * 3 > 1; k++) R(k * 3, k * 3, W - k * 6, H - k * 6, k % 2 ? bg : k % 4 === 0 ? a : b);
      break;
    case 8:
      bord(2, a);
      R(4, 4, W - 8, H - 8, bg);
      bord(1, b);
      R(5, 5, W - 10, 1, b); R(5, H - 6, W - 10, 1, b); R(5, 5, 1, H - 10, b); R(W - 6, 5, 1, H - 10, b);
      break;
    case 9:
      for (let i = -H; i < W; i += 6) for (let y = 0; y < H; y++) R(i + y, y, 2, 1, a);
      bord(2, b);
      break;
    case 10:
      for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) { R(x - 1, y, 3, 1, a); R(x, y - 1, 1, 3, a); }
      bord(2, b);
      break;
    case 11:
      for (let y = 3; y < H; y += 6) for (let x = 0; x < W; x++) R(x, y + Math.round(Math.sin(x / 2.2) * 1.4), 1, 2, a);
      bord(1, b);
      break;
    case 12:
      for (let y = 0, r = 0; y < H; y += 4, r++) {
        R(0, y + 3, W, 1, a);
        for (let x = (r % 2) * 4; x < W; x += 8) R(x, y, 1, 4, a);
      }
      bord(2, b);
      break;
    case 13:
      for (let y = 6; y < H; y += 12) for (let x = 6 + ((y / 12) % 2) * 6; x < W; x += 12) { R(x - 1, y, 3, 1, a); R(x, y - 1, 1, 3, a); R(x, y, 1, 1, b); }
      bord(2, a);
      break;
    case 14:
      R(0, cy - 4, W, 8, a);
      R(0, cy - 5, W, 1, b); R(0, cy + 4, W, 1, b);
      bord(1, a);
      break;
    case 15:
      for (let x = 0; x < W; x += 6) R(x, 0, 1, H, a);
      for (let y = 0; y < H; y += 6) R(0, y, W, 1, a);
      bord(2, b);
      break;
    case 16:
      for (let y = 2; y < H - 4; y += 4) for (let x = 2; x < W - 4; x += 4) for (let k = 0; k < 2; k++) R(x + k, y + k, 4 - 2 * k, 1, (x / 4 + y / 4) % 2 ? a : b);
      bord(2, a);
      break;
    case 17: {
      bord(3, a);
      R(3, 3, W - 6, 1, b); R(3, H - 4, W - 6, 1, b);
      // losango central em anéis
      const rad = Math.min(cx, cy) - 5;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dd = Math.abs(x - cx) * (rad / Math.max(rad, cx - 5)) + Math.abs(y - cy);
        if (dd < rad) R(x, y, 1, 1, Math.floor(dd / 3) % 2 ? b : a);
      }
      break;
    }
    case 18:
      for (let y = 2; y < H; y += 3) for (let x = 2 + ((y / 3) % 2) * 2; x < W; x += 4) R(x, y, 1, 1, a);
      bord(1, b);
      break;
    case 19: {
      const n = 6;
      for (let i = 0; i < n; i++) R(0, Math.floor((i * H) / n), W, Math.ceil(H / n), i % 2 ? a : i % 3 === 0 ? b : bg);
      bord(1, b);
      break;
    }
    case 20:
      for (let y = 0; y < H; y += 6) for (let x = 0; x < W; x += 6) R(x + 1, y + 1, 4, 4, (x / 6 + y / 6) % 3 === 0 ? a : (x / 6 + y / 6) % 3 === 1 ? b : bg);
      break;
    case 21:
      for (let y = 5; y < H; y += 10) for (let x = 5 + ((y / 10) % 2) * 5; x < W; x += 10) {
        R(x, y, 1, 1, b);
        R(x - 1, y, 1, 1, a); R(x + 1, y, 1, 1, a); R(x, y - 1, 1, 1, a); R(x, y + 1, 1, 1, a);
      }
      bord(2, a);
      break;
    case 22:
      R(cx - 1, 0, 3, H, a);
      bord(1, b);
      break;
    case 23:
      bord(2, a);
      R(4, 4, W - 8, H - 8, bg);
      bord(1, b);
      R(6, 6, W - 12, H - 12, b);
      R(8, 8, W - 16, H - 16, bg);
      break;
    default: {
      // pixel art: coração no meio
      const hx = cx - 4, hy = cy - 3;
      const rows = ["01100110", "11111111", "11111111", "01111110", "00111100", "00011000"];
      rows.forEach((row, j) => [...row].forEach((v, i) => v === "1" && R(hx + i, hy + j, 1, 1, a)));
      bord(2, b);
    }
  }
}

const texCache = new Map<string, THREE.CanvasTexture>();

/** Textura do tapete (16 px por metro, nítida). Oval e redondo ficam transparentes nos cantos. */
export function rugTexture(w: number, d: number, s: RugStyle): THREE.CanvasTexture {
  const f = s.f ?? "r";
  const key = `${w}x${d}|${s.p}|${s.c}|${f}`;
  let t = texCache.get(key);
  if (t) return t;
  const W = Math.max(8, Math.round(w * 16));
  const H = Math.max(8, Math.round(d * 16));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  if (f !== "r") {
    g.beginPath();
    g.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, Math.PI * 2);
    g.clip();
  }
  draw(g, W, H, s.p, rugPalette(s.c));
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  texCache.set(key, t);
  return t;
}

/** O tapete em 3D: uma chapa fina com o desenho em cima. */
export function buildRug(w: number, d: number, s: RugStyle): THREE.Object3D {
  const f = s.f ?? "r";
  const mat = toon("#ffffff", { map: rugTexture(w, d, s) });
  let m: THREE.Mesh;
  if (f === "r") {
    const edge = toon("#d8d4c8");
    m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), [edge, edge, mat, edge, edge, edge]);
    m.position.y = 0.015;
  } else {
    const am = mat.clone();
    am.transparent = true;
    am.alphaTest = 0.5;
    m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), am);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.025;
  }
  m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** Miniatura de um desenho/paleta (para a lista do editor). */
const prevCache = new Map<string, string>();
export function rugPreview(p: number, c: number, f = "r"): string {
  const key = `${p}|${c}|${f}`;
  let u = prevCache.get(key);
  if (!u) {
    const cv = document.createElement("canvas");
    cv.width = 48;
    cv.height = 32;
    const g = cv.getContext("2d")!;
    if (f !== "r") {
      g.beginPath();
      g.ellipse(24, 16, 24, 16, 0, 0, Math.PI * 2);
      g.clip();
    }
    draw(g, 48, 32, p, rugPalette(c));
    u = cv.toDataURL();
    prevCache.set(key, u);
  }
  return u;
}
