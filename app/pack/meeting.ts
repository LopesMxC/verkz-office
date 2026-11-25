import { BLACK, box, c, cyl, DARK, grp, STEEL, g$, CHROME, reg, WHITE, cylZ, GREY, WOODS, screenMat, ball } from "./lib";
import * as THREE from "three";

const CAT = "Reunião e apresentação";
type X = Partial<import("./lib").PackDef>;
function mk(id: string, label: string, w: number, d: number, build: () => THREE.Object3D, x: X = {}) {
  reg({ id: "pk_mtg_" + id, cat: CAT, label, w, d, blocks: true, build, ...x });
}
// mesas de reunião retas (4)
for (const [k, hex, base] of [["carvalho", WOODS.carvalho, "#5d6273"], ["nogueira", WOODS.nogueira, "#2a2d38"], ["branca", WOODS.branco, "#8e93a3"], ["ebano", WOODS.ebano, "#c9ced8"]] as const)
  mk("reta_" + k, "Mesa de reunião " + k, 3.2, 1.2, () => { const g = grp(box(3.2, 0.06, 1.2, c(hex), 0, 0.72)); for (const sx of [-1, 1]) g.add(box(0.8, 0.04, 0.9, c(base), sx * 1.1, 0), box(0.08, 0.7, 0.9, c(base), sx * 1.1, 0.02)); g.add(box(0.12, 0.02, 0.12, c("#2a2d38"), 0, 0.78, 0), box(0.04, 0.012, 0.04, g$("#c8f501"), 0, 0.8, 0)); return g; });
// ovais (2), redondas (3)
for (const [k, hex] of [["clara", WOODS.bordo], ["escura", WOODS.nogueira]] as const)
  mk("oval_" + k, "Mesa de reunião oval " + k, 3.0, 1.4, () => { const t = cyl(0.5, 0.5, 0.06, c(hex), 0, 0.72, 0, 24); t.scale.set(3.0, 1, 1.35); return grp(t, cyl(0.08, 0.1, 0.7, c("#5d6273"), -0.7, 0.02, 0, 8), cyl(0.08, 0.1, 0.7, c("#5d6273"), 0.7, 0.02, 0, 8), box(1.0, 0.05, 0.4, c("#5d6273"), 0, 0.02)); });
for (const [k, r, hex] of [["80", 0.8, WOODS.carvalho], ["110", 1.1, WOODS.branco], ["140", 1.4, WOODS.nogueira]] as const)
  mk("redonda_" + k, "Mesa redonda " + k + " cm", r * 2, r * 2, () => grp(cyl(r, r, 0.05, c(hex), 0, 0.72, 0, 24), cyl(0.06, 0.06, 0.7, STEEL, 0, 0.02, 0, 8), cyl(0.3, 0.32, 0.03, STEEL, 0, 0, 0, 14)));
// quadros brancos (3 pedestal, 2 parede)
for (const [k, hex, w] of [["pequeno", "#c9ced8", 0.9], ["grande", "#8e93a3", 1.5], ["giratório", "#2a2d38", 1.2]] as const)
  mk("board_" + k, "Quadro branco com pedestal " + k, w + 0.2, 0.5, () => { const bd = grp(box(w, 0.9, 0.04, c("#fbfaf6"), 0, 0), box(w + 0.04, 0.03, 0.05, c(hex), 0, 0), box(w + 0.04, 0.03, 0.05, c(hex), 0, 0.87), box(0.03, 0.9, 0.05, c(hex), -w / 2, 0), box(0.03, 0.9, 0.05, c(hex), w / 2, 0), box(w * 0.5, 0.012, 0.01, g$("#3b6fc0"), 0, 0.55, 0.025), box(w * 0.3, 0.012, 0.01, g$("#d9534f"), -0.1, 0.4, 0.025), box(0.3, 0.02, 0.05, c(hex), 0, -0.01, 0.04)); bd.position.y = 0.7; const g = grp(bd, box(0.04, 0.7, 0.04, STEEL, -w / 2 + 0.05, 0.02), box(0.04, 0.7, 0.04, STEEL, w / 2 - 0.05, 0.02), box(0.06, 0.03, 0.4, STEEL, -w / 2 + 0.05, 0), box(0.06, 0.03, 0.4, STEEL, w / 2 - 0.05, 0)); return g; });
for (const [k, w] of [["1,2 m", 1.2], ["2,0 m", 2.0]] as const)
  mk("wboard_" + k.split(",")[0], "Lousa branca de parede " + k, w + 0.1, 0.1, () => grp(box(w, 0.9, 0.03, c("#fbfaf6"), 0, 0), box(w + 0.06, 0.03, 0.04, c("#8e93a3"), 0, 0), box(w + 0.06, 0.03, 0.04, c("#8e93a3"), 0, 0.87), box(w * 0.4, 0.015, 0.01, g$("#3b6fc0"), -0.1, 0.6, 0.02), box(w * 0.25, 0.015, 0.01, g$("#4fae4a"), 0.1, 0.45, 0.02), box(w * 0.5, 0.04, 0.05, c("#8e93a3"), 0, -0.03, 0.03)), { mount: "wall", blocks: false });
// flipchart (2)
for (const [k, hex] of [["clássico", "#c9ced8"], ["preto", "#2a2d38"]] as const)
  mk("flip_" + k, "Flipchart " + k, 0.8, 0.6, () => { const g = grp(); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = box(0.025, 1.0, 0.025, c(hex), sx * 0.25, 0, sz * 0.2); l.rotation.set(sz * 0.08, 0, -sx * 0.08); g.add(l); } g.add(box(0.7, 0.95, 0.03, c("#fbfaf6"), 0, 0.75, -0.04), box(0.76, 0.04, 0.05, c(hex), 0, 1.68, -0.04), box(0.44, 0.015, 0.01, g$("#d9534f"), 0, 1.3, -0.02)); return g; });
// projetor de teto (2), telas de projeção (2)
for (const [k, hex] of [["branco", "#f2f0ea"], ["preto", "#2a2d38"]] as const)
  mk("proj_" + k, "Projetor de teto " + k, 0.4, 0.4, () => grp(cyl(0.02, 0.02, 0.3, STEEL, 0, -0.3, 0, 6), box(0.34, 0.1, 0.28, c(hex), 0, -0.4), cylZ(0.05, 0.04, BLACK, 0, -0.35, 0.15), cylZ(0.035, 0.045, c("#3a4a6a"), 0, -0.35, 0.15)), { mount: "ceiling", blocks: false });
for (const [k, w] of [["manual 2 m", 2.0], ["tripé 1,5 m", 1.5]] as const)
  mk("tela_" + k.split(" ")[0], "Tela de projeção " + k, w + 0.1, 0.4, () => { const g = grp(box(w, 1.2, 0.02, c("#f8f7f2"), 0, k.startsWith("tripé") ? 0.8 : 0.4), box(w + 0.06, 0.06, 0.05, c("#2a2d38"), 0, k.startsWith("tripé") ? 2.0 : 1.6), box(w * 0.7, 0.4, 0.01, screenMat("chart"), 0, k.startsWith("tripé") ? 1.0 : 0.6, 0.012)); if (k.startsWith("tripé")) g.add(box(0.03, 0.8, 0.03, STEEL, 0, 0, -0.04), box(0.6, 0.03, 0.03, STEEL, 0, 0, -0.04)); return g; }, { blocks: false });
// púlpito (2), carrinho de TV (2)
for (const [k, hex] of [["madeira", WOODS.nogueira], ["acrílico", "#9fd8ef"]] as const)
  mk("pulpito_" + k, "Púlpito " + k, 0.7, 0.5, () => grp(box(0.55, 1.0, 0.4, k === "acrílico" ? c(hex).clone() : c(hex), 0, 0), box(0.6, 0.04, 0.45, c(WOODS.bordo), 0, 1.0).rotateX(-0.1), cylZ(0.015, 0.1, c("#2a2d38"), 0, 1.1, 0.0)));
for (const [k, hex] of [["50\"", 0.9], ["65\"", 1.2]] as const)
  mk("tvcart_" + k.slice(0, 2), "Carrinho com TV " + k, (hex as number) + 0.2, 0.6, () => { const w = hex as number; return grp(box(w, 0.55, 0.05, c("#1d2029"), 0, 0.85), box(w - 0.06, 0.5, 0.006, screenMat("video", "#5ec8ff", "#c8f501"), 0, 0.875, 0.028), box(0.06, 0.9, 0.06, STEEL, 0, 0.05, -0.04), box(0.6, 0.04, 0.5, STEEL, 0, 0.04), ...[-0.25, 0.25].flatMap((x) => [-0.2, 0.2].map((z) => cyl(0.03, 0.03, 0.05, BLACK, x, 0, z, 8)))); });
void DARK; void CHROME; void WHITE; void GREY; void ball;
