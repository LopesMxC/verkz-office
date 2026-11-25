import { BLACK, box, c, cyl, DARK, grp, STEEL, g$, CHROME, reg, WHITE, ball, GREY, WOODS, glass, cone } from "./lib";
import * as THREE from "three";

const CAT = "Sofás e lounge";
function mk(id: string, label: string, w: number, d: number, build: () => THREE.Object3D, blocks = true) {
  reg({ id: "pk_lng_" + id, cat: CAT, label, w, d, blocks, build });
}
const FAB: [string, string][] = [["cinza", "#8e93a3"], ["azul", "#3b6fc0"], ["verde", "#4fae4a"], ["mostarda", "#e0b04a"], ["terracota", "#c76a3d"]];
function sofa(seats: number, hex: string, leg: string, rounded = false) {
  const w = seats * 0.7 + 0.3;
  const m = c(hex);
  const dk = c(hex).clone();
  const g = grp(box(w, 0.22, 0.85, m, 0, 0.12), box(w, 0.5, 0.2, m, 0, 0.3, -0.325), box(0.15, 0.3, 0.85, dk, -w / 2 + 0.075, 0.3), box(0.15, 0.3, 0.85, dk, w / 2 - 0.075, 0.3));
  for (let i = 0; i < seats; i++) {
    const x = (i - (seats - 1) / 2) * 0.7;
    g.add(box(0.64, 0.13, 0.6, c(hex), x, 0.34, 0.08), box(0.6, 0.38, 0.14, c(hex), x, 0.46, -0.18).rotateX(-0.12));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.05, 0.12, 0.05, c(leg), sx * (w / 2 - 0.1), 0, sz * 0.35));
  if (rounded) g.add(ball(0.0, m));
  return g;
}
for (const [k, hex] of FAB) mk("sofa2_" + k, "Sofá 2 lugares " + k, 1.7, 0.9, () => sofa(2, hex, WOODS.nogueira));
for (const [k, hex] of FAB.slice(0, 4)) mk("sofa3_" + k, "Sofá 3 lugares " + k, 2.4, 0.9, () => sofa(3, hex, "#2a2d38"));
for (const [k, hex] of [["cinza", "#8e93a3"], ["grafite", "#3d4460"], ["bege", "#d9c9a8"]] as const)
  mk("canto_" + k, "Sofá de canto " + k, 2.4, 2.0, () => grp(sofa(3, hex, "#2a2d38"), box(0.85, 0.22, 1.15, c(hex), 1.15, 0.12, 0.95), box(0.78, 0.13, 1.05, c(hex), 1.15, 0.34, 1.0), box(0.15, 0.3, 1.15, c(hex), 1.5, 0.3, 0.95)).translateX(-0.15));
for (const [k, hex] of [["azul", "#3b6fc0"], ["verde", "#4fae4a"], ["rosa", "#e58aa8"], ["mostarda", "#e0b04a"]] as const)
  mk("poltrona_" + k, "Poltrona " + k, 0.9, 0.9, () => grp(box(0.8, 0.2, 0.8, c(hex), 0, 0.14), box(0.8, 0.5, 0.18, c(hex), 0, 0.3, -0.31), box(0.14, 0.3, 0.8, c(hex), -0.33, 0.3), box(0.14, 0.3, 0.8, c(hex), 0.33, 0.3), box(0.5, 0.12, 0.5, c(hex), 0, 0.34, 0.06), box(0.05, 0.14, 0.05, c(WOODS.nogueira), -0.32, 0, 0.32), box(0.05, 0.14, 0.05, c(WOODS.nogueira), 0.32, 0, 0.32), box(0.05, 0.14, 0.05, c(WOODS.nogueira), -0.32, 0, -0.32), box(0.05, 0.14, 0.05, c(WOODS.nogueira), 0.32, 0, -0.32)));
for (const [k, hex] of [["cinza", "#8e93a3"], ["lima", "#c8f501"]] as const)
  mk("namorados_" + k, "Namoradeira " + k, 1.4, 0.8, () => { const g = sofa(2, hex, "#2a2d38"); g.scale.set(0.82, 1.0, 0.9); return g; });
for (const [k, hex] of [["azul", "#3b6fc0"], ["laranja", "#e0874a"], ["cinza", "#8e93a3"], ["rosa", "#e58aa8"]] as const)
  mk("pufe_" + k, "Pufe " + k, 0.5, 0.5, () => grp(cyl(0.22, 0.24, 0.34, c(hex), 0, 0.02, 0, 14), cyl(0.24, 0.24, 0.02, c(hex), 0, 0.36, 0, 14)), false);
for (const [k, hex] of [["couro", "#6a3d22"], ["cinza", "#8e93a3"]] as const)
  mk("banco_" + k, "Banco estofado " + k, 1.2, 0.5, () => grp(box(1.1, 0.12, 0.42, c(hex), 0, 0.3), box(0.05, 0.3, 0.05, STEEL, -0.5, 0, 0), box(0.05, 0.3, 0.05, STEEL, 0.5, 0, 0)), false);
for (const [k, hex] of [["verde", "#4fae4a"], ["laranja", "#e0874a"], ["lima", "#c8f501"]] as const)
  mk("puff_" + k, "Puff pera " + k, 0.9, 0.9, () => { const o = ball(0.4, c(hex), 0, 0.3); o.scale.set(1, 0.8, 1); return grp(o, ball(0.22, c(hex), 0, 0.6, -0.15), box(0.1, 0.02, 0.1, c("#2a2d38"), 0.2, 0.53, 0.05)); }, false);
for (const [k, hex] of [["cabine azul", "#3b6fc0"], ["cabine lima", "#c8f501"]] as const)
  mk("cabine_" + k.split(" ")[1], "Cabine de privacidade " + k, 1.6, 1.4, () => { const g = grp(box(1.5, 0.08, 1.3, c("#2a2d38"), 0, 0), box(1.5, 1.6, 0.1, c(hex), 0, 0.08, -0.6), box(0.1, 1.6, 1.2, c(hex), -0.7, 0.08, 0.05), box(0.1, 1.6, 1.2, c(hex), 0.7, 0.08, 0.05), box(1.4, 0.1, 1.2, c(hex), 0, 1.68, 0.05), box(1.2, 0.2, 0.7, c("#f2f0ea"), 0, 0.28, -0.2), box(1.2, 0.5, 0.15, c("#f2f0ea"), 0, 0.3, -0.52)); g.add(box(0.5, 0.04, 0.3, c(WOODS.carvalho), 0, 0.62, 0.15), g$("#fffbe8") && box(0.3, 0.02, 0.3, g$("#fffbe8"), 0, 1.65, 0.05)); return g; });
mk("chaise", "Chaise longue", 1.8, 0.8, () => grp(box(1.7, 0.2, 0.7, c("#d9c9a8"), 0, 0.12), box(0.45, 0.35, 0.7, c("#d9c9a8"), -0.6, 0.3), box(0.5, 0.12, 0.5, c("#f2f0ea"), -0.55, 0.52), box(0.05, 0.12, 0.05, c(WOODS.nogueira), -0.8, 0, 0.3), box(0.05, 0.12, 0.05, c(WOODS.nogueira), 0.8, 0, 0.3), box(0.05, 0.12, 0.05, c(WOODS.nogueira), -0.8, 0, -0.3), box(0.05, 0.12, 0.05, c(WOODS.nogueira), 0.8, 0, -0.3)));
mk("rede", "Rede de descanso", 1.8, 1.0, () => { const g = grp(); for (const sx of [-1, 1]) g.add(box(0.06, 1.2, 0.06, c(WOODS.nogueira), sx * 0.85, 0, 0)); const s = box(1.5, 0.05, 0.5, c("#e8d9a0"), 0, 0.5, 0); s.rotation.z = 0.0; g.add(s, box(1.6, 0.04, 0.04, c(WOODS.nogueira), 0, 1.2)); return g; });
mk("biombo", "Biombo", 1.4, 0.15, () => grp(box(0.45, 1.6, 0.04, c("#e0b04a"), -0.46, 0.1), box(0.45, 1.6, 0.04, c("#f2f0ea"), 0, 0.1), box(0.45, 1.6, 0.04, c("#3b6fc0"), 0.46, 0.1)), true);
void BLACK; void DARK; void CHROME; void WHITE; void GREY; void glass; void cone;
