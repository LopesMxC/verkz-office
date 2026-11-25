import { BLACK, box, c, cyl, DARK, grp, STEEL, g$, CHROME, reg, WHITE, ball, GREY, WOODS, COLORS, glass, cap } from "./lib";
import * as THREE from "three";

const CAT = "Armazenamento e estantes";
type X = Partial<import("./lib").PackDef>;
function mk(id: string, label: string, w: number, d: number, build: () => THREE.Object3D, x: X = {}) {
  reg({ id: "pk_sto_" + id, cat: CAT, label, w, d, blocks: true, build, ...x });
}
const BOOKC = ["#d9534f", "#3b6fc0", "#f2c14e", "#4fae4a", "#8a6cc9", "#e0874a", "#f2f0ea", "#4fb7d9"];
function books(w: number, y: number, z: number, seed: number, h = 0.26) {
  const g = grp();
  let x = -w / 2 + 0.03;
  let i = seed;
  while (x < w / 2 - 0.05) {
    const bw = 0.03 + ((i * 7) % 4) * 0.01;
    const bh = h - 0.05 + ((i * 5) % 4) * 0.02;
    g.add(box(bw, bh, 0.18, c(BOOKC[i % BOOKC.length]), x + bw / 2, y, z));
    x += bw + 0.004;
    i += 3;
  }
  return g;
}
function shelfUnit(w: number, h: number, d: number, n: number, hex: string, full: boolean, seed = 1) {
  const m = c(hex);
  const g = grp(box(0.03, h, d, m, -w / 2 + 0.015, 0), box(0.03, h, d, m, w / 2 - 0.015, 0), box(w, h, 0.01, c("#8a6a4a"), 0, 0, -d / 2 + 0.005));
  for (let i = 0; i <= n; i++) {
    const y = (i * (h - 0.03)) / n;
    g.add(box(w, 0.03, d, m, 0, y));
    if (full && i < n && (i + seed) % 3 !== 0) g.add(books(w - 0.06, y + 0.03, 0, i + seed, Math.min(0.3, (h - 0.03) / n - 0.06)));
  }
  return g;
}
// estantes (6): 3 alturas x madeira/branca/preta
for (const [k, w, h, n, hex] of [["baixa carvalho", 1.0, 0.9, 3, WOODS.carvalho], ["media nogueira", 1.0, 1.5, 4, WOODS.nogueira], ["alta branca", 1.0, 2.0, 5, "#f2f0ea"], ["larga preta", 1.6, 1.2, 3, "#2a2d38"], ["estreita bambu", 0.6, 1.8, 5, WOODS.bambu], ["larga cinza", 1.6, 1.8, 4, WOODS.cinza]] as const)
  mk("estante_" + k.replace(" ", "_"), "Estante " + k, w, 0.4, () => shelfUnit(w, h, 0.34, n, hex, true, n), {});
// arquivos (6): 2/3/4 gavetas x aço/branco
for (const [n, hex, nm] of [[2, "#8e93a3", "cinza"], [3, "#8e93a3", "cinza"], [4, "#8e93a3", "cinza"], [2, "#f2f0ea", "branco"], [3, "#2a2d38", "preto"], [4, "#c9ced8", "prata"]] as const)
  mk(`arq${n}_${nm}`, `Arquivo ${n} gavetas ${nm}`, 0.5, 0.6, () => { const h = n * 0.34; const g = grp(box(0.44, h, 0.55, c(hex), 0, 0)); for (let i = 0; i < n; i++) g.add(box(0.4, 0.3, 0.015, c(hex), 0, 0.02 + i * 0.34, 0.28), box(0.12, 0.025, 0.02, CHROME, 0, 0.26 + i * 0.34, 0.295), box(0.1, 0.04, 0.005, WHITE, 0, 0.14 + i * 0.34, 0.288)); return g; });
// arquivo lateral (3)
for (const [k, hex] of [["cinza", "#8e93a3"], ["branco", "#f2f0ea"], ["grafite", "#3d4460"]] as const)
  mk("lateral_" + k, "Arquivo lateral " + k, 1.0, 0.45, () => { const g = grp(box(0.9, 0.9, 0.4, c(hex), 0, 0)); for (let i = 0; i < 3; i++) g.add(box(0.86, 0.26, 0.012, c(hex), 0, 0.02 + i * 0.29, 0.205), box(0.3, 0.02, 0.02, CHROME, 0, 0.22 + i * 0.29, 0.22)); return g; });
// armários (lockers) (4)
for (const [k, hex, n] of [["azul 3", "#3b6fc0", 3], ["cinza 4", "#8e93a3", 4], ["lima 2", "#c8f501", 2], ["laranja 3", "#e0874a", 3]] as const)
  mk("locker_" + k.replace(" ", "_"), "Armário de lockers " + k, n * 0.35 + 0.1, 0.5, () => { const g = grp(); for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 0.35; g.add(box(0.34, 1.7, 0.45, c(hex), x, 0.08), box(0.3, 0.7, 0.01, c("#2a2d38"), x, 0.9, 0.23), box(0.3, 0.02, 0.01, c("#2a2d38"), x, 1.5, 0.23), box(0.02, 0.1, 0.02, CHROME, x + 0.1, 1.1, 0.24)); } g.add(box(n * 0.35, 0.08, 0.45, DARK, 0, 0)); return g; });
// prateleiras de parede (3) e cubos (2)
for (const [k, hex, n] of [["simples", WOODS.carvalho, 1], ["dupla", WOODS.nogueira, 2], ["flutuante preta", "#2a2d38", 3]] as const)
  mk("pparede_" + k.replace(" ", "_"), "Prateleira de parede " + k, 1.0, 0.3, () => { const g = grp(); for (let i = 0; i < n; i++) g.add(box(0.9, 0.04, 0.25, c(hex), 0, i * 0.35), box(0.04, 0.12, 0.02, STEEL, -0.35, i * 0.35 - 0.1, -0.1), box(0.04, 0.12, 0.02, STEEL, 0.35, i * 0.35 - 0.1, -0.1), books(0.7, i * 0.35 + 0.04, 0, i + 2, 0.22)); return g; }, { mount: "wall", blocks: false });
for (const [k, n, hex] of [["2x2", 2, WOODS.branco], ["3x3", 3, WOODS.carvalho]] as const)
  mk("cubos_" + k, "Estante de cubos " + k, n * 0.36, 0.4, () => { const g = grp(); const s = 0.36; for (let r = 0; r <= n; r++) g.add(box(n * s, 0.025, 0.34, c(hex), 0, r * s)); for (let q = 0; q <= n; q++) g.add(box(0.025, n * s, 0.34, c(hex), -n * s / 2 + q * s, 0)); for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) if ((r + q) % 2 === 0) g.add(box(0.26, 0.26, 0.26, c(BOOKC[(r * 3 + q) % 8]), -n * s / 2 + q * s + s / 2, r * s + 0.03)); return g; });
// credenzas (3)
for (const [k, hex, leg] of [["nogueira", WOODS.nogueira, "#c9ced8"], ["branca", "#f2f0ea", WOODS.carvalho], ["preta", "#2a2d38", "#c8f501"]] as const)
  mk("credenza_" + k, "Credenza " + k, 1.6, 0.45, () => grp(box(1.5, 0.5, 0.4, c(hex), 0, 0.15), box(0.5, 0.44, 0.01, c(hex).clone(), -0.5, 0.18, 0.206), box(0.5, 0.44, 0.01, c(hex), 0, 0.18, 0.206), box(0.5, 0.44, 0.01, c(hex), 0.5, 0.18, 0.206), box(0.025, 0.12, 0.025, c(leg), -0.7, 0, 0.15), box(0.025, 0.12, 0.025, c(leg), 0.7, 0, 0.15), box(0.025, 0.12, 0.025, c(leg), -0.7, 0, -0.15), box(0.025, 0.12, 0.025, c(leg), 0.7, 0, -0.15), box(0.03, 0.08, 0.02, CHROME, -0.28, 0.42, 0.22), box(0.03, 0.08, 0.02, CHROME, 0.22, 0.42, 0.22)));
// cabide (2), gaveteiro móvel (3), carrinhos (3), vitrine (2), roupeiro (1)
for (const [k, hex] of [["madeira", WOODS.carvalho], ["metal", "#2a2d38"]] as const)
  mk("cabideiro_" + k, "Cabideiro " + k, 0.5, 0.5, () => { const g = grp(cyl(0.2, 0.22, 0.03, c(hex), 0, 0, 0, 12), cyl(0.025, 0.025, 1.7, c(hex), 0, 0.03, 0, 6)); for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const h = box(0.18, 0.025, 0.025, c(hex), Math.cos(a) * 0.09, 1.7, Math.sin(a) * 0.09); h.rotation.y = -a; g.add(h, ball(0.02, c(hex), Math.cos(a) * 0.18, 1.72, Math.sin(a) * 0.18)); } g.add(box(0.2, 0.3, 0.08, c("#3b6fc0"), 0.12, 1.3, 0.12)); return g; }, { blocks: false });
for (const [k, hex] of [["branco", "#f2f0ea"], ["grafite", "#5d6273"], ["azul", "#3b6fc0"]] as const)
  mk("gmovel_" + k, "Gaveteiro móvel " + k, 0.45, 0.55, () => { const g = grp(box(0.4, 0.55, 0.5, c(hex), 0, 0.05)); for (let i = 0; i < 3; i++) g.add(box(0.36, 0.15, 0.012, c(hex), 0, 0.08 + i * 0.17, 0.256), box(0.1, 0.02, 0.02, CHROME, 0, 0.18 + i * 0.17, 0.27)); for (const x of [-0.16, 0.16]) for (const z of [-0.2, 0.2]) g.add(cyl(0.025, 0.025, 0.05, BLACK, x, 0, z, 8)); return g; }, { blocks: false });
for (const [k, hex] of [["aço 3 níveis", "#c9ced8"], ["bambu", WOODS.bambu], ["cor lima", "#c8f501"]] as const)
  mk("carrinho_" + k.split(" ")[0], "Carrinho utilitário " + k, 0.5, 0.4, () => { const g = grp(); for (let i = 0; i < 3; i++) g.add(box(0.44, 0.025, 0.34, c(hex), 0, 0.1 + i * 0.3)); for (const x of [-0.2, 0.2]) for (const z of [-0.15, 0.15]) g.add(box(0.02, 0.7, 0.02, STEEL, x, 0.05, z), cyl(0.03, 0.03, 0.04, BLACK, x, 0, z, 8)); g.add(box(0.12, 0.12, 0.12, c("#e0874a"), -0.1, 0.13, 0), books(0.3, 0.43, 0, 3, 0.2)); return g; }, { blocks: false });
for (const [k, hex] of [["vidro madeira", WOODS.nogueira], ["vidro preta", "#2a2d38"]] as const)
  mk("vitrine_" + k.split(" ")[1], "Vitrine " + k, 0.8, 0.4, () => { const g = grp(box(0.7, 1.7, 0.34, c(hex), 0, 0), box(0.62, 1.6, 0.01, glass, 0, 0.05, 0.176)); for (let i = 0; i < 4; i++) g.add(box(0.62, 0.015, 0.3, glass, 0, 0.3 + i * 0.4)); g.add(box(0.1, 0.1, 0.1, c("#f2c14e"), -0.15, 0.32), ball(0.06, c("#d9534f"), 0.12, 0.38), box(0.14, 0.08, 0.1, c("#4fb7d9"), 0, 0.72)); return g; });
mk("roupeiro", "Roupeiro", 1.0, 0.55, () => grp(box(0.9, 1.9, 0.5, c(WOODS.branco), 0, 0), box(0.43, 1.8, 0.01, c("#e8e6df"), -0.22, 0.05, 0.255), box(0.43, 1.8, 0.01, c("#e8e6df"), 0.22, 0.05, 0.255), box(0.02, 0.2, 0.02, CHROME, -0.05, 0.9, 0.27), box(0.02, 0.2, 0.02, CHROME, 0.05, 0.9, 0.27)));
void g$; void GREY; void COLORS; void cap; void ball;
