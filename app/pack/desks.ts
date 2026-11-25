import { BLACK, box, c, cyl, DARK, glass, grp, NEON, REG, reg, STEEL, WOODS, COLORS, g$, WHITE, CHROME, cap, GREY } from "./lib";
import * as THREE from "three";

const CAT = "Mesas de escritório";
const H = 0.74;

function top(w: number, d: number, m: THREE.Material, h = H, t = 0.05, x = 0, z = 0) {
  return box(w, t, d, m, x, h - t, z);
}
function panelLegs(w: number, d: number, m: THREE.Material, h = H) {
  return grp(box(0.05, h - 0.05, d - 0.1, m, -w / 2 + 0.05, 0), box(0.05, h - 0.05, d - 0.1, m, w / 2 - 0.05, 0), box(w - 0.2, 0.36, 0.03, m, 0, h - 0.43, -d / 2 + 0.08));
}
function steelLegs(w: number, d: number, h = H) {
  const g = grp();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.05, h - 0.05, 0.05, STEEL, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06)));
  g.add(box(w - 0.12, 0.04, 0.04, STEEL, 0, h - 0.12, -d / 2 + 0.06), box(0.04, 0.04, d - 0.12, STEEL, -w / 2 + 0.06, h - 0.12, 0), box(0.04, 0.04, d - 0.12, STEEL, w / 2 - 0.06, h - 0.12, 0));
  return g;
}
function trestle(w: number, d: number, m: THREE.Material, h = H) {
  const g = grp();
  for (const sx of [-1, 1]) {
    g.add(box(0.06, h - 0.05, 0.06, m, sx * (w / 2 - 0.2), 0, d / 2 - 0.15), box(0.06, h - 0.05, 0.06, m, sx * (w / 2 - 0.2), 0, -d / 2 + 0.15), box(0.06, 0.06, d - 0.2, m, sx * (w / 2 - 0.2), 0.04, 0));
  }
  g.add(box(w - 0.5, 0.05, 0.05, m, 0, 0.35, 0));
  return g;
}
function drawers(w: number, h: number, d: number, body: THREE.Material, n: number, x: number, z = 0) {
  const g = grp(box(w, h, d, body, x, 0, z));
  const hh = (h - 0.06) / n;
  for (let i = 0; i < n; i++) {
    g.add(box(w - 0.06, hh - 0.03, 0.02, c("#ffffff").clone(), x, 0.04 + i * hh + 0.015, z + d / 2 + 0.005));
    g.add(box(0.14, 0.025, 0.025, CHROME, x, 0.04 + i * hh + hh / 2 - 0.02, z + d / 2 + 0.025));
  }
  return g;
}
function mk(id: string, label: string, w: number, d: number, build: () => THREE.Object3D) {
  reg({ id: "pk_desk_" + id, cat: CAT, label, w, d, blocks: true, build });
}

// 1) reta com laterais em painel (4)
for (const [k, hex] of [["carvalho", WOODS.carvalho], ["branco", WOODS.branco], ["nogueira", WOODS.nogueira], ["grafite", COLORS.grafite]] as const) {
  mk("painel_" + k, "Mesa reta painel " + k, 1.6, 0.8, () => {
    const m = c(hex);
    return grp(top(1.6, 0.8, m), panelLegs(1.6, 0.8, c(k === "grafite" ? "#2a2d38" : "#8e93a3")));
  });
}
// 2) pés de aço (4)
for (const [k, hex] of [["carvalho", WOODS.carvalho], ["bordo", WOODS.bordo], ["ebano", WOODS.ebano], ["cinza", WOODS.cinza]] as const)
  mk("aco_" + k, "Mesa pés de aço " + k, 1.4, 0.7, () => grp(top(1.4, 0.7, c(hex), H, 0.04), steelLegs(1.4, 0.7)));
// 3) cavalete (3)
for (const [k, hex] of [["bambu", WOODS.bambu], ["nogueira", WOODS.nogueira], ["branco", WOODS.branco]] as const)
  mk("cavalete_" + k, "Mesa cavalete " + k, 1.8, 0.8, () => grp(top(1.8, 0.8, c(hex), H, 0.06), trestle(1.8, 0.8, c(k === "branco" ? "#b9bcc8" : "#5a3d26"))));
// 4) com gaveteiro (4)
for (const [k, hex, sd] of [["carvalho", WOODS.carvalho, "#8a5a36"], ["branco", WOODS.branco, "#b9bcc8"], ["cerejeira", WOODS.cerejeira, "#6e3a1f"], ["cinza", WOODS.cinza, "#5d6273"]] as const)
  mk("gaveteiro_" + k, "Mesa com gaveteiro " + k, 1.6, 0.8, () => {
    const body = c(sd);
    return grp(top(1.6, 0.8, c(hex)), box(0.05, H - 0.05, 0.7, body, -0.75, 0), drawers(0.42, H - 0.05, 0.7, body, 3, 0.55), box(1.1, 0.4, 0.03, body, -0.12, H - 0.45, -0.34));
  });
// 5) em L (4)
for (const [k, hex] of [["carvalho", WOODS.carvalho], ["branco", WOODS.branco], ["nogueira", WOODS.nogueira], ["grafite", COLORS.grafite]] as const)
  mk("L_" + k, "Mesa em L " + k, 1.8, 1.6, () => {
    const m = c(hex);
    const leg = c("#8e93a3");
    return grp(top(1.8, 0.7, m, H, 0.05, 0, -0.45), top(0.7, 0.9, m, H, 0.05, -0.55, 0.35), steelLegs(1.8, 0.7).translateZ(-0.45), box(0.05, H - 0.05, 0.05, leg, -0.85, 0, 0.75), box(0.05, H - 0.05, 0.05, leg, -0.25, 0, 0.75));
  });
// 6) em U / canto (2)
for (const [k, hex] of [["carvalho", WOODS.carvalho], ["branco", WOODS.branco]] as const)
  mk("U_" + k, "Mesa em U " + k, 2.0, 1.8, () => {
    const m = c(hex);
    return grp(top(2.0, 0.6, m, H, 0.05, 0, -0.6), top(0.6, 1.2, m, H, 0.05, -0.7, 0.3), top(0.6, 1.2, m, H, 0.05, 0.7, 0.3), box(0.05, H - 0.05, 0.05, STEEL, -0.95, 0, 0.85), box(0.05, H - 0.05, 0.05, STEEL, 0.95, 0, 0.85), box(1.9, 0.3, 0.03, c("#8e93a3"), 0, H - 0.4, -0.88));
  });
// 7) elevável (3) com controle
for (const [k, hex, hh] of [["baixa", WOODS.branco, 0.74], ["alta", WOODS.carvalho, 1.1], ["meia", WOODS.bambu, 0.95]] as const)
  mk("eleva_" + k, "Mesa elevável " + k, 1.4, 0.7, () => {
    const g = grp(top(1.4, 0.7, c(hex), hh, 0.04));
    for (const sx of [-1, 1]) {
      g.add(box(0.07, hh - 0.04, 0.07, STEEL, sx * 0.6, 0, 0), box(0.05, 0.05, 0.6, STEEL, sx * 0.6, 0, 0), box(0.1, 0.1, 0.1, DARK, sx * 0.6, hh - 0.2, 0));
    }
    g.add(box(0.14, 0.04, 0.06, BLACK, 0.5, hh - 0.08, 0.3), box(0.02, 0.01, 0.02, NEON, 0.52, hh - 0.04, 0.3));
    return g;
  });
// 8) bancadas (2 e 4 postos)
for (const [k, n, hex] of [["2_branca", 2, WOODS.branco], ["2_carvalho", 2, WOODS.carvalho], ["4_branca", 4, WOODS.branco], ["4_carvalho", 4, WOODS.carvalho]] as const)
  mk("bancada" + k, `Bancada ${n} postos ${k.split("_")[1]}`, n === 2 ? 3.2 : 3.2, n === 2 ? 0.8 : 1.6, () => {
    const m = c(hex);
    const g = grp();
    if (n === 2) {
      g.add(top(3.2, 0.8, m, H, 0.05));
      g.add(box(0.05, H - 0.05, 0.7, STEEL, -1.55, 0), box(0.05, H - 0.05, 0.7, STEEL, 1.55, 0), box(0.05, H - 0.05, 0.7, STEEL, 0, 0));
      g.add(box(0.04, 0.35, 0.7, c("#5ec8ff").clone(), 0, H, 0));
    } else {
      g.add(top(3.2, 1.6, m, H, 0.05));
      g.add(box(0.05, H - 0.05, 1.5, STEEL, -1.55, 0), box(0.05, H - 0.05, 1.5, STEEL, 1.55, 0), box(0.05, H - 0.05, 1.5, STEEL, 0, 0));
      g.add(box(3.1, 0.35, 0.04, c("#c8f501"), 0, H, 0), box(0.04, 0.35, 1.5, c("#c8f501"), 0, H, 0));
    }
    return g;
  });
// 9) diretor (3)
for (const [k, hex, side] of [["nogueira", WOODS.nogueira, "#4a2f1c"], ["ebano", WOODS.ebano, "#1d1410"], ["branco", WOODS.branco, "#b9bcc8"]] as const)
  mk("diretor_" + k, "Mesa de diretoria " + k, 2.0, 1.0, () => {
    const body = c(side);
    return grp(top(2.0, 1.0, c(hex), H, 0.07), drawers(0.55, H - 0.07, 0.9, body, 3, -0.7), drawers(0.55, H - 0.07, 0.9, body, 3, 0.7), box(0.8, H - 0.3, 0.04, body, 0, 0.1, -0.42), box(0.5, 0.005, 0.3, c("#2a2d38"), 0, H + 0.002, 0.1));
  });
// 10) gamer (3)
for (const [k, hex] of [["lima", "#c8f501"], ["ciano", "#4fb7d9"], ["rosa", "#ff4fa3"]] as const)
  mk("gamer_" + k, "Mesa gamer " + k, 1.6, 0.8, () => {
    const g = grp(top(1.6, 0.8, c("#1d2029"), H, 0.04));
    for (const sx of [-1, 1]) g.add(box(0.06, H - 0.04, 0.7, c("#2a2d38"), sx * 0.74, 0), box(0.06, 0.04, 0.8, g$(hex), sx * 0.74, 0));
    g.add(box(1.5, 0.015, 0.02, g$(hex), 0, H - 0.04, 0.39), box(0.5, 0.004, 0.3, c("#2a2d38"), 0, H + 0.001, 0.12), cyl(0.04, 0.04, 0.08, c("#2a2d38"), 0.7, H, -0.3));
    return g;
  });
// 11) prancheta (2)
for (const [k, hex] of [["clara", WOODS.bordo], ["escura", WOODS.nogueira]] as const)
  mk("prancheta_" + k, "Mesa prancheta " + k, 1.2, 0.9, () => {
    const t = box(1.2, 0.04, 0.8, c(hex), 0, 0.94, 0);
    t.rotation.x = -0.35;
    t.position.y = 0.95;
    return grp(t, steelLegs(1.1, 0.7, 0.9), box(1.0, 0.02, 0.05, STEEL, 0, 0.88, 0.32), box(0.4, 0.02, 0.3, c("#f2f0ea"), 0, 1.0, 0.02).rotateX(-0.35));
  });
// 12) escrivaninha (2)
for (const [k, hex] of [["branca", WOODS.branco], ["bambu", WOODS.bambu]] as const)
  mk("escriv_" + k, "Escrivaninha " + k, 1.1, 0.55, () => grp(top(1.1, 0.55, c(hex), 0.72, 0.03), box(0.04, 0.69, 0.04, c("#c9ced8"), -0.5, 0, -0.22), box(0.04, 0.69, 0.04, c("#c9ced8"), 0.5, 0, -0.22), box(0.04, 0.69, 0.04, c("#c9ced8"), -0.5, 0, 0.22), box(0.04, 0.69, 0.04, c("#c9ced8"), 0.5, 0, 0.22), box(0.9, 0.12, 0.45, c(hex), 0, 0.57, 0)));
// 13) mesas de canto / apoio (2 + 1)
for (const [k, hex] of [["redonda", "#e6c08a"], ["quadrada", "#f2f0ea"]] as const)
  mk("apoio_" + k, "Mesa de apoio " + k, 0.6, 0.6, () => {
    const g = grp();
    if (k === "redonda") g.add(cyl(0.3, 0.3, 0.04, c(hex), 0, 0.5, 0, 16), cyl(0.04, 0.04, 0.5, STEEL, 0, 0, 0, 6), cyl(0.2, 0.2, 0.03, STEEL, 0, 0, 0, 12));
    else g.add(top(0.55, 0.55, c(hex), 0.5, 0.04), box(0.04, 0.46, 0.04, STEEL, -0.24, 0, -0.24), box(0.04, 0.46, 0.04, STEEL, 0.24, 0, -0.24), box(0.04, 0.46, 0.04, STEEL, -0.24, 0, 0.24), box(0.04, 0.46, 0.04, STEEL, 0.24, 0, 0.24));
    return g;
  });
// 14) cart de computador (1) + dobrável (1)
mk("carrinho_pc", "Carrinho de computador", 0.8, 0.6, () => grp(top(0.8, 0.6, c(WOODS.branco), 0.75, 0.04), box(0.04, 0.6, 0.5, STEEL, -0.36, 0.1), box(0.04, 0.6, 0.5, STEEL, 0.36, 0.1), box(0.7, 0.03, 0.5, c(WOODS.cinza), 0, 0.3, 0), ...[-0.34, 0.34].flatMap((x) => [-0.24, 0.24].map((z) => cyl(0.03, 0.03, 0.06, BLACK, x, 0, z, 8)))));
mk("dobravel", "Mesa dobrável", 1.5, 0.7, () => grp(top(1.5, 0.7, c(WOODS.cinza), 0.74, 0.03), box(0.04, 0.72, 0.04, STEEL, -0.7, 0, -0.3), box(0.04, 0.72, 0.04, STEEL, 0.7, 0, -0.3), box(0.04, 0.72, 0.04, STEEL, -0.7, 0, 0.3), box(0.04, 0.72, 0.04, STEEL, 0.7, 0, 0.3), box(1.4, 0.03, 0.03, STEEL, 0, 0.1, 0)));
void glass; void cap; void WHITE; void REG;
