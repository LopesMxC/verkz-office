import { BLACK, box, c, cyl, DARK, grp, STEEL, WOODS, COLORS, g$, CHROME, reg, WHITE, screenMat, LGREY, GREY, cylZ, ball } from "./lib";
import * as THREE from "three";

const CAT = "Computadores e notebooks";
function mk(id: string, label: string, w: number, d: number, build: () => THREE.Object3D, extra: Partial<import("./lib").PackDef> = {}) {
  reg({ id: "pk_pc_" + id, cat: CAT, label, w, d, blocks: false, tabletop: true, build, ...extra });
}
const KINDS = ["code", "chart", "chat", "video", "doc", "dash", "map"];
function monitorBody(w: number, h: number, body: THREE.Material, kind: string, curve = false) {
  const g = grp(box(w, h, 0.04, body, 0, 0.2));
  const scr = box(w - 0.04, h - 0.04, 0.006, screenMat(kind), 0, 0.22, 0.021);
  g.add(scr);
  if (curve) {
    g.children[0].rotation.y = 0;
    g.add(box(w * 0.3, h * 0.9, 0.04, body, -w * 0.52, 0.22, 0.03).rotateY(0.35), box(w * 0.3, h * 0.9, 0.04, body, w * 0.52, 0.22, 0.03).rotateY(-0.35));
  }
  return g;
}
function stand(body: THREE.Material, w = 0.22) {
  return grp(box(w, 0.015, 0.16, body, 0, 0), box(0.045, 0.2, 0.03, body, 0, 0.01, -0.02));
}
// monitores planos: 4 tamanhos x 2 cores
for (const [sz, w, h] of [["22", 0.5, 0.3], ["24", 0.56, 0.33], ["27", 0.64, 0.38], ["32", 0.76, 0.44]] as const)
  for (const [i, cn, hex] of [[0, "preto", "#1d2029"], [1, "branco", "#e8e6df"]] as const) {
    const kind = KINDS[(+sz + i) % KINDS.length];
    mk(`mon${sz}_${cn}`, `Monitor ${sz}" ${cn}`, w, 0.2, () => {
      const b = c(hex);
      const g = grp(stand(b, 0.2 + w * 0.1), monitorBody(w, h, b, kind));
      g.children[1].position.y = 0.0;
      return g;
    }, { use: "screen", idle: true });
  }
// ultrawide (2), curvo (1)
for (const [cn, hex] of [["preto", "#1d2029"], ["prata", "#b9bcc8"]] as const)
  mk(`ultra_${cn}`, `Monitor ultrawide ${cn}`, 0.9, 0.22, () => { const b = c(hex); return grp(stand(b, 0.3), monitorBody(0.88, 0.32, b, "chart")); }, { use: "screen" });
mk("curvo", "Monitor curvo gamer", 0.9, 0.3, () => { const b = c("#1d2029"); return grp(stand(b, 0.3), monitorBody(0.7, 0.34, b, "video", true), box(0.7, 0.01, 0.01, g$("#c8f501"), 0, 0.36, -0.02)); }, { use: "screen" });
// braço duplo / triplo
for (const [n, id, name] of [[2, "duplo_a", "Duplo monitor com braço A"], [2, "duplo_b", "Duplo monitor com braço B"], [3, "triplo", "Triplo monitor com braço"]] as const) {
  const hex = n === 3 ? "#1d2029" : id === "duplo_a" ? "#2a2d38" : "#b9bcc8";
  mk(id, name, n * 0.55, 0.2, () => {
    const b = c(hex);
    const g = grp(box(0.05, 0.4, 0.05, STEEL, 0, 0, -0.04), box(0.2, 0.012, 0.12, STEEL, 0, 0, -0.02));
    for (let i = 0; i < n; i++) {
      const m = monitorBody(0.5, 0.3, b, KINDS[(i + n) % KINDS.length]);
      m.position.set((i - (n - 1) / 2) * 0.52, 0.18, 0);
      m.rotation.y = -(i - (n - 1) / 2) * 0.28;
      g.add(m);
    }
    return g;
  }, { use: "screen" });
}
// torres (4), mini (2), tudo-em-um (4)
for (const [cn, hex, led] of [["preta", "#1d2029", "#5ec8ff"], ["branca", "#e8e6df", "#c8f501"], ["gamer lima", "#1d2029", "#c8f501"], ["gamer ciano", "#2a2d38", "#4fb7d9"]] as const)
  mk(`torre_${cn.replace(" ", "_")}`, `Computador torre ${cn}`, 0.25, 0.5, () => {
    const b = c(hex);
    return grp(box(0.22, 0.46, 0.46, b, 0, 0), box(0.2, 0.015, 0.01, g$(led), 0, 0.38, 0.235), box(0.012, 0.3, 0.01, g$(led), -0.09, 0.08, 0.235), cylZ(0.015, 0.01, g$(led), 0.06, 0.34, 0.235), box(0.02, 0.02, 0.01, STEEL, 0.07, 0.05, 0.235));
  }, { idle: true });
for (const [cn, hex] of [["preto", "#1d2029"], ["prata", "#b9bcc8"]] as const)
  mk(`mini_${cn}`, `Mini PC ${cn}`, 0.2, 0.2, () => grp(box(0.17, 0.04, 0.17, c(hex), 0, 0), box(0.02, 0.005, 0.005, g$("#c8f501"), 0.05, 0.03, 0.086)));
for (const [cn, hex] of [["prata", "#c9ced8"], ["branco", "#f2f0ea"], ["azul", "#6aa7e0"], ["rosa", "#f0a5bd"]] as const)
  mk(`aio_${cn}`, `Tudo em um ${cn}`, 0.6, 0.22, () => { const b = c(hex); return grp(box(0.2, 0.015, 0.16, b, 0, 0), box(0.04, 0.2, 0.03, b, 0, 0.01, -0.02), box(0.58, 0.34, 0.035, b, 0, 0.2), box(0.54, 0.29, 0.006, screenMat("dash", "#ff7aa8", "#ffd35c"), 0, 0.225, 0.019), box(0.58, 0.04, 0.036, b, 0, 0.2)); }, { use: "screen" });
// notebooks abertos (6) e fechados (2)
for (const [cn, hex, kind] of [["grafite", "#5d6273", "code"], ["prata", "#c9ced8", "doc"], ["branco", "#f2f0ea", "chat"], ["azul", "#3b6fc0", "dash"], ["rosa", "#e58aa8", "video"], ["gamer", "#1d2029", "chart"]] as const)
  mk(`note_${cn}`, `Notebook ${cn}`, 0.38, 0.3, () => {
    const b = c(hex);
    const lid = grp(box(0.36, 0.24, 0.015, b, 0, 0), box(0.33, 0.21, 0.005, screenMat(kind), 0, 0.015, 0.009));
    lid.position.set(0, 0.015, -0.13);
    lid.rotation.x = -0.18;
    const g = grp(box(0.36, 0.015, 0.26, b, 0, 0), box(0.3, 0.004, 0.09, BLACK, 0, 0.015, 0.02), box(0.1, 0.003, 0.05, GREY, 0, 0.015, 0.1), lid);
    if (cn === "gamer") g.add(box(0.3, 0.004, 0.005, g$("#c8f501"), 0, 0.016, -0.1));
    return g;
  }, { use: "screen" });
for (const [cn, hex] of [["fechado prata", "#c9ced8"], ["fechado preto", "#2a2d38"]] as const)
  mk(`notef_${cn.split(" ")[1]}`, `Notebook ${cn}`, 0.36, 0.26, () => grp(box(0.34, 0.02, 0.24, c(hex), 0, 0), box(0.05, 0.002, 0.05, WHITE, 0, 0.021, 0)));
// tablets (3) + celular (1)
for (const [cn, hex] of [["preto", "#1d2029"], ["prata", "#c9ced8"], ["dourado", "#e0c999"]] as const)
  mk(`tablet_${cn}`, `Tablet com suporte ${cn}`, 0.26, 0.2, () => { const b = c(hex); const t = grp(box(0.24, 0.17, 0.012, b, 0, 0), box(0.22, 0.15, 0.004, screenMat("video", "#ff7aa8", "#ffd35c"), 0, 0.01, 0.007)); t.position.set(0, 0.04, -0.02); t.rotation.x = -0.35; return grp(box(0.16, 0.012, 0.1, STEEL, 0, 0, 0), t); }, { use: "screen" });
mk("celular", "Celular no suporte", 0.12, 0.1, () => { const p = grp(box(0.07, 0.14, 0.008, BLACK, 0, 0), box(0.062, 0.125, 0.003, screenMat("chat"), 0, 0.007, 0.005)); p.position.set(0, 0.03, 0); p.rotation.x = -0.4; return grp(box(0.08, 0.012, 0.07, STEEL, 0, 0), p); });
// teclado + mouse (4), mecânico RGB (2)
for (const [cn, hex] of [["preto", "#2a2d38"], ["branco", "#e8e6df"], ["cinza", "#8e93a3"], ["azul", "#3b6fc0"]] as const)
  mk(`kb_${cn}`, `Teclado e mouse ${cn}`, 0.5, 0.18, () => { const b = c(hex); return grp(box(0.34, 0.015, 0.12, b, -0.06, 0), box(0.3, 0.008, 0.08, DARK, -0.06, 0.015, 0), box(0.05, 0.02, 0.08, b, 0.2, 0), ball(0.01, WHITE, 0.2, 0.022, -0.02)); });
for (const [cn, hex] of [["lima", "#c8f501"], ["rosa", "#ff4fa3"]] as const)
  mk(`kbrgb_${cn}`, `Teclado mecânico ${cn}`, 0.5, 0.18, () => grp(box(0.38, 0.02, 0.14, c("#1d2029"), -0.04, 0), box(0.34, 0.006, 0.1, g$(hex), -0.04, 0.02, 0), box(0.05, 0.025, 0.08, c("#1d2029"), 0.22, 0), box(0.2, 0.004, 0.16, c("#2a2d38"), 0.22, 0)));
// suportes (4)
for (const [cn, hex] of [["notebook alumínio", "#c9ced8"], ["notebook madeira", WOODS.bambu], ["elevação de monitor", WOODS.carvalho], ["dock USB", "#2a2d38"]] as const)
  mk(`sup_${cn.split(" ")[0]}_${cn.split(" ")[1]}`, `Suporte ${cn}`, 0.4, 0.25, () => {
    const b = c(hex);
    if (cn === "dock USB") return grp(box(0.2, 0.04, 0.08, b, 0, 0), box(0.18, 0.004, 0.004, g$("#c8f501"), 0, 0.03, 0.04));
    if (cn.startsWith("elev")) return grp(box(0.5, 0.012, 0.24, b, 0, 0.1), box(0.04, 0.1, 0.22, b, -0.22, 0), box(0.04, 0.1, 0.22, b, 0.22, 0));
    const t = box(0.3, 0.012, 0.22, b, 0, 0.05); t.rotation.x = 0.28;
    return grp(t, box(0.3, 0.02, 0.03, b, 0, 0, 0.1), box(0.3, 0.05, 0.02, b, 0, 0, -0.08));
  });
// mesa digitalizadora (2)
for (const [cn, hex] of [["pequena", "#2a2d38"], ["com tela", "#1d2029"]] as const)
  mk(`mesadig_${cn.replace(" ", "_")}`, `Mesa digitalizadora ${cn}`, 0.4, 0.28, () => { const g = grp(box(0.36, 0.012, 0.24, c(hex), 0, 0)); if (cn === "com tela") g.add(box(0.32, 0.004, 0.18, screenMat("map"), 0, 0.012, 0)); else g.add(box(0.3, 0.004, 0.18, GREY, 0, 0.012, 0)); g.add(box(0.14, 0.005, 0.005, WHITE, 0.2, 0.014, 0.12)); return g; });
void DARK; void STEEL; void LGREY; void CHROME; void COLORS; void cyl;
