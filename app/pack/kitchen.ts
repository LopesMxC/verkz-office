import { BLACK, box, c, cyl, DARK, grp, STEEL, g$, CHROME, reg, WHITE, cylZ, GREY, WOODS, glass, ball, cone } from "./lib";
import * as THREE from "three";

const CAT = "Copa e cozinha";
type X = Partial<import("./lib").PackDef>;
function mk(id: string, label: string, w: number, d: number, build: () => THREE.Object3D, x: X = {}) {
  reg({ id: "pk_kit_" + id, cat: CAT, label, w, d, blocks: true, build, ...x });
}
const nm = (o: THREE.Object3D, n: string) => ((o.name = n), o);
const LED = (x: number, y: number, z: number, hex = "#c8f501") => nm(box(0.015, 0.012, 0.008, g$(hex), x, y, z), "led");
const brew = (g: THREE.Object3D, t: number, on: boolean) => { const s = g.getObjectByName("stream"); if (s) s.visible = on && Math.floor(t * 6) % 2 === 0; const l = g.getObjectByName("led") as THREE.Mesh | undefined; if (l) l.visible = on ? Math.floor(t * 3) % 2 === 0 : true; };
// cafeteira (4)
for (const [k, hex, acc] of [["preta", "#2a2d38", "#c8f501"], ["inox", "#c9ced8", "#d9534f"], ["branca", "#f2f0ea", "#4fb7d9"], ["vermelha", "#c0463e", "#f2f0ea"]] as const)
  mk("cafeteira_" + k, "Cafeteira " + k, 0.3, 0.3, () => grp(box(0.22, 0.04, 0.26, c(hex), 0, 0), box(0.06, 0.34, 0.24, c(hex), -0.08, 0.04, -0.01), box(0.22, 0.06, 0.26, c(hex), 0, 0.34).translateX(0), cyl(0.065, 0.065, 0.14, glass, 0.03, 0.05, 0.03, 10), cyl(0.06, 0.06, 0.07, c("#5a3a22"), 0.03, 0.05, 0.03, 10), nm(box(0.012, 0.15, 0.012, g$("#7a4a2a"), 0.03, 0.2, 0.03), "stream"), LED(0.07, 0.3, 0.131, acc)), { blocks: false, tabletop: true, idle: true, use: "coffee", tick: brew });
// espresso (2)
for (const [k, hex] of [["inox", "#c9ced8"], ["preta", "#1d2029"]] as const)
  mk("espresso_" + k, "Máquina de espresso " + k, 0.5, 0.4, () => grp(box(0.42, 0.34, 0.32, c(hex), 0, 0), box(0.38, 0.03, 0.28, c("#2a2d38"), 0, 0.34), box(0.3, 0.02, 0.2, c("#3a3a44"), 0, 0.04, 0.05), cyl(0.03, 0.03, 0.18, c("#2a2d38"), 0.0, 0.1, 0.17, 8), nm(box(0.012, 0.1, 0.012, g$("#7a4a2a"), 0, 0.06, 0.17), "stream"), LED(0.15, 0.28, 0.161), cylZ(0.03, 0.02, c("#2a2d38"), -0.12, 0.26, 0.17), cylZ(0.03, 0.02, c("#8e93a3"), 0.0, 0.26, 0.17)), { blocks: false, tabletop: true, idle: true, use: "coffee", tick: brew });
// geladeiras (3), frigobar (2)
for (const [k, hex, h] of [["branca", "#f2f0ea", 1.8], ["inox", "#c9ced8", 1.8], ["duplex preta", "#2a2d38", 1.9]] as const)
  mk("geladeira_" + k.split(" ")[0], "Geladeira " + k, 0.8, 0.75, () => grp(box(0.7, h, 0.65, c(hex), 0, 0), box(0.68, 0.01, 0.01, DARK, 0, h * 0.62, 0.331), box(0.03, 0.5, 0.03, CHROME, -0.28, h * 0.66, 0.35), box(0.03, 0.4, 0.03, CHROME, -0.28, h * 0.3, 0.35)));
for (const [k, hex] of [["retrô vermelho", "#d9534f"], ["retrô menta", "#8fd3c4"]] as const)
  mk("frigobar_" + k.split(" ")[1], "Frigobar " + k, 0.6, 0.6, () => grp(box(0.5, 0.9, 0.5, c(hex), 0, 0), box(0.02, 0.5, 0.03, CHROME, 0.2, 0.2, 0.26), box(0.5, 0.01, 0.01, DARK, 0, 0.28, 0.251), box(0.1, 0.04, 0.01, WHITE, -0.12, 0.8, 0.251)));
// vending (3)
for (const [k, hex, glowc] of [["snacks", "#3b6fc0", "#ffd35c"], ["bebidas", "#d9534f", "#8fd3f2"], ["café", "#4a2f1c", "#e0874a"]] as const)
  mk("vending_" + k.split("ç")[0], "Máquina de " + k, 0.9, 0.8, () => { const g = grp(box(0.9, 1.8, 0.75, c(hex), 0, 0), box(0.6, 1.2, 0.02, glass, -0.1, 0.4, 0.38)); for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) g.add(box(0.14, 0.2, 0.1, c(["#d9534f", "#f2c14e", "#4fae4a", "#4fb7d9"][(r + q) % 4]), -0.28 + q * 0.18, 0.5 + r * 0.28, 0.3)); g.add(box(0.18, 0.5, 0.02, c("#2a2d38"), 0.33, 0.9, 0.38), box(0.12, 0.06, 0.01, g$(glowc), 0.33, 1.2, 0.395), box(0.5, 0.12, 0.02, c("#1d2029"), -0.1, 0.1, 0.38), box(0.88, 0.1, 0.02, g$(glowc), 0, 1.7, 0.38)); return g; }, { use: "vend", idle: true });
// bebedouro (3)
for (const [k, hex] of [["galão", "#f2f0ea"], ["coluna inox", "#c9ced8"], ["mesa", "#4fb7d9"]] as const)
  mk("agua_" + k.split(" ")[0], "Bebedouro " + k, 0.5, 0.45, () => { if (k === "mesa") return grp(box(0.3, 0.4, 0.3, c(hex), 0, 0), cyl(0.12, 0.12, 0.3, c("#9fd8ef"), 0, 0.4, 0, 12), box(0.06, 0.02, 0.06, c("#2a2d38"), 0, 0.2, 0.16)); return grp(box(0.36, 1.0, 0.36, c(hex), 0, 0), k === "galão" ? cyl(0.15, 0.15, 0.4, c("#9fd8ef"), 0, 1.0, 0, 12) : box(0.3, 0.02, 0.3, CHROME, 0, 1.0), box(0.2, 0.04, 0.02, c("#5ec8ff"), -0.0, 0.8, 0.19), box(0.2, 0.04, 0.02, c("#d9534f"), 0, 0.72, 0.19), box(0.2, 0.02, 0.1, GREY, 0, 0.6, 0.18)); }, { blocks: false });
// microondas (2), chaleira (1), torradeira (1)
for (const [k, hex] of [["inox", "#c9ced8"], ["preto", "#2a2d38"]] as const)
  mk("micro_" + k, "Micro-ondas " + k, 0.55, 0.4, () => grp(box(0.46, 0.28, 0.34, c(hex), 0, 0), box(0.3, 0.2, 0.01, c("#1d2029"), -0.05, 0.04, 0.171), box(0.1, 0.2, 0.01, c("#3a3a44"), 0.16, 0.04, 0.171), box(0.06, 0.03, 0.01, g$("#c8f501"), 0.16, 0.2, 0.176), LED(0.16, 0.12, 0.178, "#ffb23b")), { blocks: false, tabletop: true });
mk("chaleira", "Chaleira elétrica", 0.25, 0.25, () => grp(cyl(0.08, 0.09, 0.18, c("#c9ced8"), 0, 0.02, 0, 12), cone(0.08, 0.06, c("#c9ced8"), 0, 0.2, 0, 12), box(0.02, 0.14, 0.04, c("#2a2d38"), 0.1, 0.06), cyl(0.1, 0.1, 0.02, c("#2a2d38"), 0, 0, 0, 12)), { blocks: false, tabletop: true });
mk("torradeira", "Torradeira", 0.3, 0.2, () => grp(box(0.26, 0.17, 0.16, c("#e0874a"), 0, 0), box(0.2, 0.01, 0.03, BLACK, 0, 0.17, 0.03), box(0.035, 0.04, 0.02, c("#2a2d38"), 0.12, 0.08, 0.09)), { blocks: false, tabletop: true });
// pias (2), balcões (2)
for (const [k, hex] of [["inox", "#c9ced8"], ["granito", "#3d4460"]] as const)
  mk("pia_" + k, "Pia com balcão " + k, 1.2, 0.6, () => grp(box(1.2, 0.85, 0.6, c("#f2f0ea"), 0, 0), box(1.24, 0.04, 0.64, c(hex), 0, 0.85), box(0.5, 0.02, 0.36, c("#1d2029"), -0.2, 0.89), box(0.03, 0.22, 0.03, CHROME, -0.2, 0.89, -0.2), box(0.03, 0.03, 0.14, CHROME, -0.2, 1.08, -0.14), box(0.5, 0.7, 0.01, c("#e8e6df"), -0.3, 0.05, 0.305), box(0.5, 0.7, 0.01, c("#e8e6df"), 0.3, 0.05, 0.305)));
for (const [k, hex, len] of [["ilha", WOODS.branco, 1.8], ["bancada", WOODS.carvalho, 2.4]] as const)
  mk("balcao_" + k, "Balcão " + k, len, 0.8, () => grp(box(len, 0.88, 0.7, c("#e8e6df"), 0, 0), box(len + 0.06, 0.05, 0.8, c(hex), 0, 0.88), ...(k === "ilha" ? [box(len, 0.02, 0.3, c(hex), 0, 0.8, 0.45), box(0.04, 0.4, 0.04, STEEL, -len / 2 + 0.1, 0.4, 0.5), box(0.04, 0.4, 0.04, STEEL, len / 2 - 0.1, 0.4, 0.5)] : [box(0.5, 0.7, 0.01, c("#dcd8cf"), -len / 4, 0.05, 0.355), box(0.5, 0.7, 0.01, c("#dcd8cf"), len / 4, 0.05, 0.355)])));
// lixeiras (3), escorredor (1)
for (const [k, hex] of [["inox", "#c9ced8"], ["verde reciclável", "#4fae4a"], ["azul reciclável", "#3b6fc0"]] as const)
  mk("lixo_" + k.split(" ")[0] + (k.includes("verde") ? "v" : k.includes("azul") ? "a" : ""), "Lixeira " + k, 0.35, 0.35, () => grp(cyl(0.14, 0.12, 0.5, c(hex), 0, 0, 0, 12), cyl(0.15, 0.15, 0.03, c("#2a2d38"), 0, 0.5, 0, 12), box(0.14, 0.02, 0.04, BLACK, 0, 0.53)), { blocks: false });
mk("escorredor", "Escorredor de louça", 0.5, 0.35, () => { const g = grp(box(0.44, 0.03, 0.3, c("#c9ced8"), 0, 0)); for (let i = 0; i < 6; i++) g.add(cyl(0.07, 0.07, 0.01, WHITE, -0.17 + i * 0.07, 0.1 + (i % 2) * 0.02, 0, 10).rotateZ(Math.PI / 2)); g.add(cyl(0.04, 0.035, 0.08, c("#d9534f"), 0.15, 0.03, 0.08, 8)); return g; }, { blocks: false, tabletop: true });
void STEEL; void ball;
