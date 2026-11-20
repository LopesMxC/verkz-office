import * as THREE from "three";

/**
 * Materiais "toon" com 3 tons fixos: é o que dá cara de pixel art ao 3D
 * (luz em degraus, sem degradê suave).
 */
let gradient: THREE.DataTexture | null = null;
function gradientMap() {
  if (!gradient) {
    const tones = new Uint8Array([110, 175, 235, 255]);
    gradient = new THREE.DataTexture(tones, tones.length, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

export function toon(color: THREE.ColorRepresentation, opts: { emissive?: number; map?: THREE.Texture; transparent?: boolean; opacity?: number } = {}) {
  const key = `${new THREE.Color(color).getHexString()}|${opts.emissive ?? 0}|${opts.map?.uuid ?? ""}|${opts.opacity ?? 1}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), map: opts.map ?? null });
    if (opts.emissive) {
      m.emissive = new THREE.Color(color);
      m.emissiveIntensity = opts.emissive;
    }
    if (opts.transparent) {
      m.transparent = true;
      m.opacity = opts.opacity ?? 0.5;
    }
    cache.set(key, m);
  }
  return m;
}

/** Textura pintada pixel a pixel num canvas (filtro "nearest" para ficar nítida). */
export function pixelTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  paint(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Ruído determinístico (mesma textura sempre). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
