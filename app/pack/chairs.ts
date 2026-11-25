import { BLACK, box, c, cyl, DARK, grp, STEEL, WOODS, COLORS, g$, CHROME, ball, REG, reg, WHITE } from "./lib";
import * as THREE from "three";

const CAT = "Cadeiras e bancos";
function star(m: THREE.Material, r = 0.28) {
  const g = grp(cyl(0.035, 0.035, 0.3, m, 0, 0.06, 0, 6));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = box(r, 0.03, 0.05, m, Math.cos(a) * r * 0.5, 0.04, Math.sin(a) * r * 0.5);
    arm.rotation.y = -a;
    g.add(arm, cyl(0.035, 0.035, 0.04, BLACK, Math.cos(a) * r, 0, Math.sin(a) * r, 6));
  }
  return g;
}
function mk(id: string, label: string, build: () => THREE.Object3D, w = 0.6, d = 0.6) {
  reg({ id: "pk_chair_" + id, cat: CAT, label, w, d, blocks: false, build });
}
const six = ["azul", "verde", "laranja", "vermelho", "roxo", "ciano"] as const;
// mesh (6)
for (const k of six)
  mk("mesh_" + k, "Cadeira giratória " + k, () => {
    const m = c(COLORS[k]);
    return grp(star(STEEL), box(0.46, 0.08, 0.44, m, 0, 0.42, 0.02), box(0.42, 0.52, 0.05, m, 0, 0.5, -0.22), box(0.05, 0.2, 0.3, DARK, -0.27, 0.5, 0), box(0.05, 0.2, 0.3, DARK, 0.27, 0.5, 0), box(0.1, 0.16, 0.04, DARK, 0, 0.45, -0.2));
  });
// executiva couro (4)
for (const [k, hex] of [["preta", "#2a2d38"], ["marrom", "#6a3d22"], ["branca", "#e8e4da"], ["vinho", "#7a2430"]] as const)
  mk("exec_" + k, "Cadeira executiva " + k, () => {
    const m = c(hex);
    return grp(star(CHROME), box(0.54, 0.1, 0.5, m, 0, 0.42, 0.02), box(0.52, 0.78, 0.12, m, 0, 0.5, -0.24), box(0.2, 0.14, 0.12, m, 0, 1.2, -0.24), box(0.07, 0.07, 0.34, DARK, -0.31, 0.62, 0), box(0.07, 0.07, 0.34, DARK, 0.31, 0.62, 0), box(0.04, 0.2, 0.04, DARK, -0.31, 0.46, 0), box(0.04, 0.2, 0.04, DARK, 0.31, 0.46, 0));
  });
// gamer (6)
for (const [k, hex] of [["lima", "#c8f501"], ["ciano", "#4fb7d9"], ["rosa", "#ff4fa3"], ["vermelha", "#d9534f"], ["laranja", "#e0874a"], ["branca", "#f2f0ea"]] as const)
  mk("gamer_" + k, "Cadeira gamer " + k, () => {
    const m = c("#2a2d38");
    const a = c(hex);
    return grp(star(DARK, 0.32), box(0.5, 0.1, 0.5, m, 0, 0.4, 0.02), box(0.1, 0.1, 0.46, a, -0.26, 0.4, 0.02), box(0.1, 0.1, 0.46, a, 0.26, 0.4, 0.02), box(0.5, 0.82, 0.1, m, 0, 0.5, -0.24), box(0.18, 0.5, 0.11, a, 0, 0.6, -0.235), box(0.3, 0.14, 0.1, m, 0, 1.32, -0.24), box(0.05, 0.05, 0.3, DARK, -0.32, 0.62, 0), box(0.05, 0.05, 0.3, DARK, 0.32, 0.62, 0));
  });
// visitante 4 pés (4)
for (const k of ["carvalho", "nogueira", "bordo", "ebano"] as const)
  mk("visita_" + k, "Cadeira visitante " + k, () => {
    const m = c(WOODS[k]);
    const g = grp(box(0.46, 0.05, 0.44, c("#8e93a3"), 0, 0.42, 0.02), box(0.46, 0.34, 0.04, c("#8e93a3"), 0, 0.5, -0.22));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.04, 0.42, 0.04, m, sx * 0.2, 0, sz * 0.2));
    return g;
  });
// ripada / café (3)
for (const [k, hex] of [["clara", WOODS.bordo], ["escura", WOODS.nogueira], ["branca", "#ece8de"]] as const)
  mk("cafe_" + k, "Cadeira de café " + k, () => {
    const m = c(hex);
    const g = grp(box(0.44, 0.05, 0.42, m, 0, 0.44, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.04, 0.44, 0.04, m, sx * 0.18, 0, sz * 0.17));
    for (let i = 0; i < 4; i++) g.add(box(0.44, 0.05, 0.03, m, 0, 0.55 + i * 0.1, -0.21));
    return g;
  });
// banquetas baixas (3)
for (const [k, hex] of [["azul", "#3b6fc0"], ["lima", "#c8f501"], ["rosa", "#e58aa8"]] as const)
  mk("banco_" + k, "Banqueta " + k, () => grp(cyl(0.2, 0.2, 0.06, c(hex), 0, 0.4, 0, 14), cyl(0.04, 0.04, 0.4, STEEL, 0, 0, 0, 6), cyl(0.16, 0.16, 0.03, STEEL, 0, 0, 0, 10)), 0.5, 0.5);
// altos de bar (2)
for (const [k, hex] of [["couro", "#6a3d22"], ["preto", "#2a2d38"]] as const)
  mk("bar_" + k, "Banco alto " + k, () => {
    const g = grp(cyl(0.2, 0.2, 0.07, c(hex), 0, 0.72, 0, 14), box(0.34, 0.03, 0.03, STEEL, 0, 0.3, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.03, 0.72, 0.03, STEEL, sx * 0.14, 0, sz * 0.14));
    g.add(cyl(0.16, 0.16, 0.02, STEEL, 0, 0.28, 0, 10));
    return g;
  }, 0.5, 0.5);
mk("prancheta", "Banco de prancheta", () => grp(star(STEEL, 0.26), cyl(0.04, 0.04, 0.5, STEEL, 0, 0.2, 0, 6), cyl(0.2, 0.2, 0.06, c("#2a2d38"), 0, 0.7, 0, 14), cyl(0.2, 0.01, 0.02, STEEL, 0, 0.3, 0, 12), box(0.3, 0.03, 0.3, DARK, 0, 0.5, 0.1).rotateX(0)));
mk("ajoelhar", "Cadeira ergonômica ajoelhar", () => grp(box(0.4, 0.06, 0.3, c("#c98a55"), 0, 0.5, 0), box(0.3, 0.08, 0.2, c("#2a2d38"), 0, 0.28, 0.2).rotateX(0.2), box(0.04, 0.3, 0.04, STEEL, -0.14, 0.1, 0.1), box(0.04, 0.3, 0.04, STEEL, 0.14, 0.1, 0.1), box(0.5, 0.03, 0.04, STEEL, 0, 0.02, 0.1)));
// bola (2)
for (const [k, hex] of [["verde", "#4fae4a"], ["azul", "#3b6fc0"]] as const)
  mk("bola_" + k, "Cadeira bola " + k, () => grp(ball(0.26, c(hex), 0, 0.3), cyl(0.2, 0.2, 0.03, STEEL, 0, 0, 0, 10)), 0.6, 0.6);
// cantilever Breuer (3)
for (const [k, hex] of [["preta", "#2a2d38"], ["branca", "#f2f0ea"], ["laranja", "#e0874a"]] as const)
  mk("canti_" + k, "Cadeira cantilever " + k, () => {
    const m = c(hex);
    const g = grp(box(0.44, 0.04, 0.42, m, 0, 0.44, 0.02), box(0.44, 0.34, 0.03, m, 0, 0.5, -0.2));
    for (const sx of [-1, 1]) {
      g.add(box(0.025, 0.025, 0.5, CHROME, sx * 0.21, 0.4, 0), box(0.025, 0.4, 0.025, CHROME, sx * 0.21, 0, 0.23), box(0.025, 0.025, 0.5, CHROME, sx * 0.21, 0, 0.0), box(0.025, 0.4, 0.025, CHROME, sx * 0.21, 0.04, -0.2));
    }
    return g;
  });
// concha Eames (3)
for (const [k, hex] of [["branca", "#f2f0ea"], ["amarela", "#f2c14e"], ["azul", "#3b6fc0"]] as const)
  mk("concha_" + k, "Cadeira concha " + k, () => {
    const m = c(hex);
    const g = grp(box(0.5, 0.06, 0.46, m, 0, 0.42, 0.02), box(0.5, 0.36, 0.05, m, 0, 0.45, -0.22).rotateX(0.0), box(0.06, 0.08, 0.4, m, -0.27, 0.46, 0), box(0.06, 0.08, 0.4, m, 0.27, 0.46, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.03, 0.42, 0.03, c("#c98a55"), sx * 0.2, 0, sz * 0.18));
    return g;
  });
// banco 2 lugares (2)
for (const [k, hex] of [["azul", "#3b6fc0"], ["cinza", "#8e93a3"]] as const)
  mk("banco2_" + k, "Banco 2 lugares " + k, () => grp(box(1.1, 0.12, 0.45, c(hex), 0, 0.42, 0), box(1.1, 0.34, 0.08, c(hex), 0, 0.5, -0.2), box(0.05, 0.42, 0.4, STEEL, -0.5, 0, 0), box(0.05, 0.42, 0.4, STEEL, 0.5, 0, 0)), 1.2, 0.5);
void WHITE; void REG; void g$; void DARK;
