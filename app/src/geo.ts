import * as THREE from "three";

/**
 * Geometrias compartilhadas: centenas de móveis usam as mesmas peças (caixas e cilindros
 * do mesmo tamanho). Uma cópia só de cada forma economiza memória do app e da placa de vídeo.
 * Essas geometrias nunca são descartadas (são poucas e reaproveitadas).
 */
const cache = new Map<string, THREE.BufferGeometry>();
const r = (n: number) => Math.round(n * 1000) / 1000;

function get(key: string, make: () => THREE.BufferGeometry) {
  let g = cache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    cache.set(key, g);
  }
  return g;
}

export const geo = {
  box: (w: number, h: number, d: number) => get(`b${r(w)},${r(h)},${r(d)}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt: number, rb: number, h: number, seg = 8) => get(`c${r(rt)},${r(rb)},${r(h)},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)),
  ico: (rad: number, detail = 0) => get(`i${r(rad)},${detail}`, () => new THREE.IcosahedronGeometry(rad, detail)),
  sphere: (rad: number, ws = 10, hs = 8) => get(`s${r(rad)},${ws},${hs}`, () => new THREE.SphereGeometry(rad, ws, hs)),
  cone: (rad: number, h: number, seg = 8) => get(`k${r(rad)},${r(h)},${seg}`, () => new THREE.ConeGeometry(rad, h, seg)),
};

/** Libera o que não é compartilhado (texturas de painéis, paredes sob medida) de um grupo que vai sair de cena. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.geometry && !m.geometry.userData.shared && !m.geometry.userData.model) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (mat instanceof THREE.MeshBasicMaterial && !mat.userData.shared) {
        mat.map?.dispose();
        mat.dispose();
      }
    }
  });
}
