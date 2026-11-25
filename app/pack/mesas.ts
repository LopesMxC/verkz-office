// Mesas de trabalho (pacote 3): 24 modelos × 12 acabamentos = 288 mesas. Todas bloqueiam a passagem; o tampo fica a 0,75 m
// (itens "de mesa" assentam em cima). Frente (onde senta) = +z; divisórias, estantes e painéis ficam em -z.
import * as THREE from "three";
import { box, c, cyl, glass, g$, grp, reg, WOODS } from "./lib";

const CAT = "Mesas de trabalho";
const H = 0.75;
type M = THREE.Material;
const FAB = "#8e93a3";

/** Acabamentos: [id, nome, tampo, estrutura]. */
const FIN: [string, string, string | "glass", string][] = [
  ["carvalho", "carvalho", WOODS.carvalho, "#2a2d38"], ["nogueira", "nogueira", WOODS.nogueira, "#1d2029"], ["branco", "branca", "#f2f0ea", "#dcd8cf"],
  ["grafite", "grafite", "#3d4460", "#b9bcc8"], ["bambu", "bambu", WOODS.bambu, "#8a6a3a"], ["ebano", "ébano", WOODS.ebano, "#c9a24a"],
  ["cinza", "cinza", WOODS.cinza, "#2a2d38"], ["vidro", "de vidro", "glass", "#c9ced8"], ["concreto", "concreto", "#9a9a96", "#2a2d38"],
  ["lima", "lima", "#c8f501", "#1d2029"], ["marinho", "azul-marinho", "#24325a", "#f2f0ea"], ["cerejeira", "cerejeira", WOODS.cerejeira, "#b9bcc8"],
];

const slab = (w: number, d: number, m: M, x = 0, z = 0, t = 0.04, y = H) => box(w, t, d, m, x, y - t, z);
const post = (m: M, x: number, z: number, h = H - 0.04, s = 0.05) => box(s, h, s, m, x, 0, z);
function steel(w: number, d: number, F: M, x = 0, z = 0) {
  const g = grp();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(post(F, x + sx * (w / 2 - 0.06), z + sz * (d / 2 - 0.06)));
  g.add(box(w - 0.12, 0.03, 0.03, F, x, H - 0.12, z - d / 2 + 0.06), box(0.03, 0.03, d - 0.12, F, x - w / 2 + 0.06, H - 0.12, z), box(0.03, 0.03, d - 0.12, F, x + w / 2 - 0.06, H - 0.12, z));
  return g;
}
const panels = (w: number, d: number, F: M) => grp(box(0.04, H - 0.04, d - 0.1, F, -w / 2 + 0.05, 0), box(0.04, H - 0.04, d - 0.1, F, w / 2 - 0.05, 0), box(w - 0.14, 0.34, 0.025, F, 0, H - 0.4, -d / 2 + 0.09));
function drawers(w: number, d: number, body: M, F: M, n: number, x: number, z = 0) {
  const h = H - 0.04, hh = (h - 0.06) / n, g = grp(box(w, h, d, body, x, 0, z));
  for (let i = 0; i < n; i++) g.add(box(w - 0.05, hh - 0.025, 0.015, F, x, 0.04 + i * hh + 0.012, z + d / 2 + 0.004), box(0.12, 0.02, 0.02, c("#c9ced8"), x, 0.04 + i * hh + hh / 2 - 0.01, z + d / 2 + 0.02));
  return g;
}
const tilt = <T extends THREE.Object3D>(o: T, rz = 0, rx = 0) => { o.rotation.z = rz; o.rotation.x = rx; return o; };

type Build = (T: M, F: M) => THREE.Object3D;
const TYPES: [string, string, number, number, Build][] = [
  ["compacta", "Mesa compacta", 1.2, 0.6, (T, F) => grp(slab(1.2, 0.6, T), steel(1.2, 0.6, F))],
  ["reta", "Mesa reta com painéis", 1.6, 0.8, (T, F) => grp(slab(1.6, 0.8, T), panels(1.6, 0.8, F))],
  ["diretor", "Mesa de diretor", 2.0, 0.9, (T, F) => grp(slab(2.0, 0.9, T, 0, 0, 0.05), panels(2.0, 0.9, F), box(1.7, 0.4, 0.03, F, 0, H - 0.46, 0.4))],
  ["pesA", "Mesa pés em A", 1.6, 0.75, (T, F) => {
    const g = grp(slab(1.6, 0.75, T));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = box(0.05, H - 0.04, 0.05, F, sx * 0.72, 0, sz * 0.3); l.rotation.z = -sx * 0.16; l.position.x = sx * 0.72; g.add(l); }
    return g;
  }],
  ["estante", "Mesa com estante", 1.6, 0.8, (T, F) => grp(slab(1.6, 0.8, T), panels(1.6, 0.8, F), box(0.03, 0.5, 0.26, F, -0.78, H, -0.27), box(0.03, 0.5, 0.26, F, 0.78, H, -0.27), box(1.56, 0.03, 0.26, F, 0, H + 0.24, -0.27), box(1.56, 0.03, 0.26, F, 0, H + 0.5, -0.27))],
  ["divisoria", "Mesa com divisória", 1.6, 0.8, (T, F) => grp(slab(1.6, 0.8, T), steel(1.6, 0.8, F), box(1.6, 0.42, 0.04, c(FAB), 0, H, -0.38), box(0.04, 0.42, 0.5, c(FAB), -0.78, H, -0.12))],
  ["L_dir", "Mesa em L (retorno à direita)", 1.8, 1.6, (T, F) => grp(slab(1.8, 0.8, T, 0, -0.4), slab(0.7, 0.8, T, 0.55, 0.4), steel(1.8, 0.8, F, 0, -0.4), post(F, 0.84, 0.74), post(F, 0.26, 0.74), post(F, 0.84, 0.06), post(F, 0.26, 0.06))],
  ["L_esq", "Mesa em L (retorno à esquerda)", 1.8, 1.6, (T, F) => grp(slab(1.8, 0.8, T, 0, -0.4), slab(0.7, 0.8, T, -0.55, 0.4), steel(1.8, 0.8, F, 0, -0.4), post(F, -0.84, 0.74), post(F, -0.26, 0.74), post(F, -0.84, 0.06), post(F, -0.26, 0.06))],
  ["U", "Mesa em U", 2.0, 1.8, (T, F) => {
    const g = grp(slab(2.0, 0.7, T, 0, -0.55), slab(0.6, 1.1, T, -0.7, 0.35), slab(0.6, 1.1, T, 0.7, 0.35), steel(2.0, 0.7, F, 0, -0.55));
    for (const sx of [-1, 1]) g.add(post(F, sx * 0.94, 0.84), post(F, sx * 0.46, 0.84));
    return g;
  }],
  ["arredondada", "Mesa de cantos arredondados", 1.6, 0.8, (T, F) => grp(slab(1.6, 0.7, T, 0, -0.05), cyl(0.15, 0.15, 0.04, T, -0.65, H - 0.04, 0.25, 14), cyl(0.15, 0.15, 0.04, T, 0.65, H - 0.04, 0.25, 14), slab(1.3, 0.1, T, 0, 0.3), panels(1.6, 0.8, F))],
  ["redonda", "Mesa redonda de apoio", 1.2, 1.2, (T, F) => grp(cyl(0.6, 0.6, 0.04, T, 0, H - 0.04, 0, 28), cyl(0.06, 0.06, H - 0.07, F, 0, 0.03, 0, 10), cyl(0.3, 0.32, 0.03, F, 0, 0, 0, 20))],
  ["dupla", "Bancada dupla (2 postos)", 1.6, 1.6, (T, F) => grp(slab(1.6, 0.78, T, 0, -0.41), slab(1.6, 0.78, T, 0, 0.41), box(1.6, 0.34, 0.03, c(FAB), 0, H, 0), steel(1.6, 1.6, F))],
  ["quatro", "Bancada de 4 postos", 3.2, 1.6, (T, F) => grp(slab(3.2, 0.78, T, 0, -0.41), slab(3.2, 0.78, T, 0, 0.41), box(3.2, 0.34, 0.03, c(FAB), 0, H, 0), box(0.03, 0.34, 1.5, c(FAB), 0, H, 0), steel(3.2, 1.6, F), post(F, 0, 0.74), post(F, 0, -0.74))],
  ["seis", "Bancada de 6 postos", 4.8, 1.6, (T, F) => grp(slab(4.8, 0.78, T, 0, -0.41), slab(4.8, 0.78, T, 0, 0.41), box(4.8, 0.34, 0.03, c(FAB), 0, H, 0), box(0.03, 0.34, 1.5, c(FAB), -0.8, H, 0), box(0.03, 0.34, 1.5, c(FAB), 0.8, H, 0), steel(4.8, 1.6, F), post(F, -1.6, 0), post(F, 1.6, 0), post(F, 0, 0.74), post(F, 0, -0.74))],
  ["eleva", "Mesa elevável", 1.6, 0.8, (T, F) => {
    const g = grp(slab(1.6, 0.8, T), box(1.4, 0.04, 0.04, F, 0, H - 0.1, -0.2), box(0.12, 0.03, 0.05, c("#1d2029"), 0.62, H - 0.04, 0.34), box(0.02, 0.005, 0.02, g$("#c8f501"), 0.64, H - 0.01, 0.34));
    for (const sx of [-1, 1]) g.add(cyl(0.045, 0.045, 0.4, F, sx * 0.68, 0.03, 0, 8), cyl(0.035, 0.035, 0.32, c("#c9ced8"), sx * 0.68, 0.4, 0, 8), box(0.07, 0.04, 0.7, F, sx * 0.68, 0, 0));
    return g;
  }],
  ["gaveteiro", "Mesa com gaveteiro", 1.6, 0.8, (T, F) => grp(slab(1.6, 0.8, T), box(0.05, H - 0.04, 0.7, F, -0.75, 0), drawers(0.45, 0.7, F, T, 3, 0.55), box(1.1, 0.36, 0.025, F, -0.12, H - 0.4, -0.35))],
  ["exec2", "Mesa executiva com 2 gaveteiros", 1.8, 0.85, (T, F) => grp(slab(1.8, 0.85, T, 0, 0, 0.05), drawers(0.5, 0.7, F, T, 3, -0.62), drawers(0.5, 0.7, F, T, 3, 0.62), box(0.7, 0.4, 0.025, F, 0, H - 0.45, -0.34))],
  ["frontal", "Mesa com painel frontal", 1.8, 0.9, (T, F) => grp(slab(1.8, 0.9, T, 0, 0, 0.05), panels(1.8, 0.9, F), box(1.7, 0.6, 0.03, F, 0, H - 0.64, 0.4))],
  ["gamer", "Mesa gamer com LED", 1.6, 0.8, (T, F) => grp(slab(1.6, 0.8, c("#1d2029")), box(1.6, 0.02, 0.02, g$("#c8f501"), 0, H - 0.04, 0.4), box(0.02, 0.02, 0.8, g$("#c8f501"), -0.8, H - 0.04, 0), box(0.02, 0.02, 0.8, g$("#c8f501"), 0.8, H - 0.04, 0), box(0.05, H - 0.04, 0.7, F, -0.7, 0), box(0.05, H - 0.04, 0.7, F, 0.7, 0), box(1.4, 0.05, 0.3, c("#2f3240"), 0, 0.12, -0.2))],
  ["recepcao", "Balcão de recepção", 2.4, 0.9, (T, F) => grp(box(2.4, 1.1, 0.4, F, 0, 0, 0.25), box(2.5, 0.05, 0.5, T, 0, 1.1, 0.25), slab(2.2, 0.5, T, 0, -0.2), box(0.04, H - 0.04, 0.5, F, -1.05, 0, -0.2), box(0.04, H - 0.04, 0.5, F, 1.05, 0, -0.2), box(2.3, 0.02, 0.03, g$("#c8f501"), 0, 0.5, 0.46))],
  ["dobravel", "Mesa dobrável", 1.4, 0.7, (T, F) => {
    const g = grp(slab(1.4, 0.7, T, 0, 0, 0.035));
    for (const sx of [-1, 1]) for (const r of [-0.35, 0.35]) { const l = box(0.04, H, 0.04, F, 0, 0, 0); l.rotation.x = r; l.position.set(sx * 0.6, 0, 0); g.add(l); }
    return g;
  }],
  ["rodas", "Mesa com rodas", 1.4, 0.7, (T, F) => {
    const g = grp(slab(1.4, 0.7, T), drawers(0.4, 0.6, F, T, 2, 0.45), box(0.04, H - 0.1, 0.6, F, -0.65, 0.06));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.03, 0.03, 0.05, c("#1d2029"), sx * 0.62, 0, sz * 0.28, 8));
    return g;
  }],
  ["classica", "Escrivaninha clássica", 1.3, 0.65, (T, F) => {
    const g = grp(slab(1.3, 0.65, T, 0, 0, 0.05), box(0.5, 0.1, 0.55, F, 0, H - 0.15, 0.02), box(0.1, 0.02, 0.03, c("#c9a24a"), 0, H - 0.1, 0.3));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.035, 0.03, H - 0.05, F, sx * 0.58, 0, sz * 0.26, 8), cyl(0.05, 0.05, 0.05, F, sx * 0.58, H * 0.5, sz * 0.26, 8));
    return g;
  }],
  ["tecnica", "Bancada técnica", 1.8, 0.7, (T, F) => grp(slab(1.8, 0.7, T), steel(1.8, 0.7, F), box(1.8, 0.9, 0.03, c("#c9a24a"), 0, H, -0.33), box(1.6, 0.03, 0.4, F, 0, 0.25, 0), ...[-0.6, -0.2, 0.2, 0.6].map((x) => box(0.08, 0.14, 0.02, c("#1d2029"), x, H + 0.5, -0.3)))],
];

for (const [fid, fname, topHex, frameHex] of FIN)
  for (const [tid, label, w, d, build] of TYPES)
    reg({ id: `pk_mesa_${tid}_${fid}`, cat: CAT, label: `${label} ${fname}`, w, d, blocks: true, build: () => build(topHex === "glass" ? glass : c(topHex), c(frameHex)) });
