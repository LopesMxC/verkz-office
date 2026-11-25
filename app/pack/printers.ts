import { BLACK, box, c, cyl, DARK, grp, STEEL, g$, CHROME, reg, WHITE, cylZ, ball, GREY, LGREY, glass, cylX, cone } from "./lib";
import * as THREE from "three";

const CAT = "Impressoras e equipamentos";
type X = Partial<import("./lib").PackDef>;
function mk(id: string, label: string, w: number, d: number, build: () => THREE.Object3D, x: X = {}) {
  reg({ id: "pk_off_" + id, cat: CAT, label, w, d, blocks: false, idle: true, build, ...x });
}
const named = <T extends THREE.Object3D>(o: T, n: string) => ((o.name = n), o);
const paperSheet = (y: number, z: number, w = 0.2) => named(box(w, 0.004, 0.24, c("#fbfaf6"), 0, y, z), "paper");

/** Imprime: a folha sai pela bandeja em ciclos enquanto está em uso; a luz pisca. */
const printTick = (axis: "z" | "y" = "z") => (g: THREE.Object3D, t: number, on: boolean) => {
  const p = g.getObjectByName("paper");
  const l = g.getObjectByName("led") as THREE.Mesh | undefined;
  if (p) {
    const base = (p.userData.base ??= p.position.clone()) as THREE.Vector3;
    const k = on ? (t * 0.8) % 1 : 0;
    p.visible = on || p.userData.always === true;
    if (axis === "z") p.position.z = base.z + k * 0.18;
    else p.position.y = base.y + k * 0.14;
  }
  if (l) l.visible = on ? Math.floor(t * 4) % 2 === 0 : true;
};
const led = (x: number, y: number, z: number, hex = "#c8f501") => named(box(0.015, 0.012, 0.008, g$(hex), x, y, z), "led");

// laser de mesa (4)
for (const [k, body, acc] of [["branca", "#f2f0ea", "#8e93a3"], ["cinza", "#b9bcc8", "#5d6273"], ["preta", "#2a2d38", "#8e93a3"], ["lima", "#f2f0ea", "#c8f501"]] as const)
  mk("laser_" + k, "Impressora laser " + k, 0.5, 0.45, () => grp(box(0.42, 0.18, 0.36, c(body), 0, 0), box(0.4, 0.03, 0.3, c(acc), 0, 0.18, 0.02), box(0.3, 0.012, 0.05, BLACK, 0, 0.1, 0.18), box(0.24, 0.1, 0.04, c(acc), 0, 0.2, -0.12).rotateX(-0.5), led(0.15, 0.17, 0.18), box(0.08, 0.04, 0.012, DARK, -0.12, 0.13, 0.181), paperSheet(0.2, -0.12), paperSheet(0.115, 0.28)), { tabletop: true, use: "print", tick: printTick() });
// jato de tinta (3)
for (const [k, body] of [["branca", "#f2f0ea"], ["preta", "#2a2d38"], ["azul", "#6aa7e0"]] as const)
  mk("jato_" + k, "Impressora jato de tinta " + k, 0.46, 0.4, () => grp(box(0.4, 0.12, 0.3, c(body), 0, 0), box(0.34, 0.012, 0.2, c("#b9bcc8"), 0, 0.12, 0.02), box(0.1, 0.03, 0.01, screenMat1(), 0.1, 0.07, 0.151), paperSheet(0.13, -0.1), paperSheet(0.02, 0.22), led(-0.15, 0.1, 0.151)), { tabletop: true, use: "print", tick: printTick() });
function screenMat1() { return g$("#2d6a4f"); }
// multifuncional com scanner (4)
for (const [k, body, lid] of [["branca", "#f2f0ea", "#dcd8cf"], ["cinza", "#b9bcc8", "#8e93a3"], ["preta", "#2a2d38", "#5d6273"], ["ciano", "#f2f0ea", "#4fb7d9"]] as const)
  mk("multi_" + k, "Multifuncional " + k, 0.55, 0.5, () => {
    const l = named(box(0.44, 0.03, 0.34, c(lid), 0, 0), "lid");
    l.position.set(0, 0.3, -0.02);
    return grp(box(0.46, 0.28, 0.4, c(body), 0, 0), l, box(0.2, 0.08, 0.02, g$("#2d6a4f"), 0.1, 0.18, 0.205).rotateX(-0.3), box(0.3, 0.012, 0.05, BLACK, -0.05, 0.1, 0.2), led(-0.19, 0.25, 0.205), paperSheet(0.2, 0.26), box(0.4, 0.012, 0.3, c("#8fd3f2"), 0, 0.28, -0.02));
  }, { tabletop: true, use: "print", tick: (g, t, on) => { printTick()(g, t, on); const l = g.getObjectByName("lid"); if (l) l.rotation.x = on ? -0.08 + Math.sin(t * 2) * 0.0 : 0; } });
// copiadora grande (4)
for (const [k, body, trim] of [["branca", "#f2f0ea", "#8e93a3"], ["cinza", "#b9bcc8", "#5d6273"], ["grafite", "#5d6273", "#c8f501"], ["azul", "#dcd8cf", "#3b6fc0"]] as const)
  mk("copiadora_" + k, "Copiadora " + k, 0.9, 0.75, () => {
    const scan = named(box(0.7, 0.01, 0.04, g$("#8fd3f2"), 0, 0.98, 0), "scan");
    return grp(box(0.8, 0.9, 0.65, c(body), 0, 0), box(0.82, 0.04, 0.67, c(trim), 0, 0.9), box(0.74, 0.04, 0.55, c("#dcd8cf"), 0, 0.94, 0), scan, box(0.24, 0.12, 0.03, g$("#2d6a4f"), 0.2, 0.76, 0.33).rotateX(-0.3), box(0.7, 0.01, 0.01, c(trim), 0, 0.3, 0.33), box(0.7, 0.01, 0.01, c(trim), 0, 0.5, 0.33), led(-0.34, 0.8, 0.33), paperSheet(0.62, 0.4, 0.3), box(0.5, 0.2, 0.04, c("#f2f0ea"), -0.1, 0.55, 0.33).translateX(0));
  }, { blocks: true, use: "print", tick: (g, t, on) => { printTick()(g, t, on); const s = g.getObjectByName("scan"); if (s) s.position.z = on ? Math.sin(t * 3) * 0.2 : 0; } });
// plotter (2)
for (const [k, body] of [["branco", "#f2f0ea"], ["grafite", "#5d6273"]] as const)
  mk("plotter_" + k, "Plotter de impressão " + k, 1.4, 0.7, () => grp(box(1.2, 0.12, 0.3, c(body), 0, 0.82), box(0.06, 0.82, 0.06, STEEL, -0.5, 0, 0), box(0.06, 0.82, 0.06, STEEL, 0.5, 0, 0), box(1.0, 0.04, 0.04, STEEL, 0, 0.3, 0), box(1.1, 0.01, 0.34, c("#fbfaf6"), 0, 0.5, 0.2).rotateX(0.5), named(box(1.0, 0.004, 0.4, c("#fbfaf6"), 0, 0.2, 0.32), "paper"), led(0.55, 0.9, 0.16)), { blocks: true, use: "print", tick: printTick("y") });
// impressora 3D (4)
const frame3d = (hex: string) => { const g = grp(); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.03, 0.4, 0.03, c(hex), sx * 0.17, 0.04, sz * 0.17)); g.add(box(0.38, 0.04, 0.38, c(hex), 0, 0), box(0.38, 0.03, 0.38, c(hex), 0, 0.42)); return g; };
for (const [k, hex, fil] of [["cartesiana laranja", "#2a2d38", "#e0874a"], ["cartesiana lima", "#f2f0ea", "#c8f501"], ["fechada", "#1d2029", "#4fb7d9"], ["cinza", "#5d6273", "#ff4fa3"]] as const)
  mk("p3d_" + k.replace(" ", "_"), "Impressora 3D " + k, 0.5, 0.5, () => {
    const head = named(grp(box(0.08, 0.06, 0.08, c("#8e93a3"), 0, 0), cone(0.015, 0.03, c(fil))), "head");
    head.position.set(0, 0.28, 0);
    const piece = box(0.1, 0.06, 0.1, c(fil), 0, 0.06);
    const g = grp(frame3d(hex), box(0.34, 0.012, 0.34, c("#3a4a6a"), 0, 0.06), piece, head, box(0.34, 0.02, 0.03, STEEL, 0, 0.32, 0), cyl(0.07, 0.07, 0.05, c(fil), 0.26, 0.2, 0, 12), led(-0.17, 0.1, 0.19));
    if (k === "fechada") g.add(box(0.36, 0.4, 0.01, glass, 0, 0.05, 0.19));
    return g;
  }, { tabletop: true, use: "scan", tick: (g, t, on) => { const h = g.getObjectByName("head"); if (h) { h.position.x = on ? Math.sin(t * 3) * 0.1 : 0; h.position.z = on ? Math.cos(t * 2.3) * 0.08 : 0; } } });
// triturador (3)
for (const [k, body] of [["preto", "#2a2d38"], ["inox", "#b9bcc8"], ["vermelho", "#d9534f"]] as const)
  mk("tritur_" + k, "Triturador de papel " + k, 0.4, 0.3, () => grp(box(0.3, 0.45, 0.2, c(body), 0, 0), box(0.34, 0.06, 0.24, c("#1d2029"), 0, 0.45), box(0.24, 0.01, 0.02, BLACK, 0, 0.51), named(box(0.18, 0.004, 0.14, c("#fbfaf6"), 0, 0.5, 0), "paper"), led(0.1, 0.4, 0.101)), { blocks: true, use: "shred", tick: (g, t, on) => { const p = g.getObjectByName("paper"); if (p) { p.visible = on; p.position.y = 0.5 - ((t * 0.9) % 1) * 0.12; } } });
// scanner de mesa (2)
for (const [k, body] of [["branco", "#f2f0ea"], ["preto", "#2a2d38"]] as const)
  mk("scanner_" + k, "Scanner de mesa " + k, 0.5, 0.36, () => grp(box(0.42, 0.04, 0.3, c(body), 0, 0), box(0.4, 0.01, 0.28, c("#8fd3f2"), 0, 0.04), box(0.1, 0.012, 0.02, g$("#c8f501"), 0.12, 0.05, 0.14)), { tabletop: true, use: "scan" });
// etiquetas (2), plastificadora (1), fax (1), térmica (1)
for (const [k, body] of [["azul", "#3b6fc0"], ["lima", "#c8f501"]] as const)
  mk("etiqueta_" + k, "Impressora de etiquetas " + k, 0.3, 0.25, () => grp(box(0.2, 0.12, 0.2, c("#2a2d38"), 0, 0), box(0.16, 0.04, 0.1, c(body), 0, 0.12, -0.03), named(box(0.08, 0.004, 0.1, c("#fbfaf6"), 0, 0.1, 0.12), "paper"), led(0.07, 0.1, 0.101)), { tabletop: true, use: "print", tick: printTick() });
mk("plastificadora", "Plastificadora", 0.45, 0.2, () => grp(box(0.4, 0.07, 0.16, c("#3d4460"), 0, 0), box(0.34, 0.012, 0.03, BLACK, 0, 0.07), led(0.17, 0.05, 0.081, "#ff7a3b")), { tabletop: true });
mk("fax", "Fax", 0.4, 0.35, () => grp(box(0.34, 0.1, 0.28, c("#dcd8cf"), 0, 0), box(0.2, 0.04, 0.14, c("#b9bcc8"), 0, 0.1, -0.05).rotateX(-0.4), box(0.12, 0.01, 0.07, BLACK, 0.08, 0.1, 0.07), box(0.16, 0.012, 0.012, g$("#2d6a4f"), -0.06, 0.11, 0.07), cylX(0.015, 0.2, c("#2a2d38"), -0.02, 0.15, -0.14), named(box(0.14, 0.004, 0.14, c("#fbfaf6"), 0, 0.08, 0.15), "paper")), { tabletop: true, use: "print", tick: printTick() });
mk("termica", "Impressora térmica de recibos", 0.2, 0.2, () => grp(box(0.14, 0.1, 0.16, c("#2a2d38"), 0, 0), named(box(0.06, 0.004, 0.14, c("#fbfaf6"), 0, 0.11, 0.02), "paper"), cylX(0.03, 0.08, c("#fbfaf6"), 0, 0.12, -0.04), led(0.05, 0.09, 0.081)), { tabletop: true, use: "print", tick: printTick("y") });
mk("carrinho_papel", "Carrinho de papel e suprimentos", 0.6, 0.45, () => { const g = grp(box(0.5, 0.03, 0.36, c("#b9bcc8"), 0, 0.12), box(0.5, 0.03, 0.36, c("#b9bcc8"), 0, 0.55), box(0.03, 0.5, 0.03, STEEL, -0.23, 0.1, -0.15), box(0.03, 0.5, 0.03, STEEL, 0.23, 0.1, -0.15), box(0.03, 0.5, 0.03, STEEL, -0.23, 0.1, 0.15), box(0.03, 0.5, 0.03, STEEL, 0.23, 0.1, 0.15)); for (let i = 0; i < 4; i++) g.add(box(0.24, 0.05, 0.3, c("#fbfaf6"), -0.1, 0.15 + i * 0.05, 0), box(0.2, 0.2, 0.28, c(i % 2 ? "#e0874a" : "#3b6fc0"), 0.1, 0.58, 0)); for (const x of [-0.22, 0.22]) for (const z of [-0.15, 0.15]) g.add(cyl(0.03, 0.03, 0.05, BLACK, x, 0.0, z, 8)); return g; }, { blocks: true, idle: false });
void WHITE; void GREY; void LGREY; void CHROME; void DARK; void ball; void cylZ; void STEEL; void BLACK;
