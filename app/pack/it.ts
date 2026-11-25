import { BLACK, box, c, cyl, DARK, grp, STEEL, g$, CHROME, reg, WHITE, cylZ, ball, GREY, glass, cone } from "./lib";
import * as THREE from "three";

const CAT = "TI, rede e segurança";
type X = Partial<import("./lib").PackDef>;
function mk(id: string, label: string, w: number, d: number, build: () => THREE.Object3D, x: X = {}) {
  reg({ id: "pk_it_" + id, cat: CAT, label, w, d, blocks: true, build, ...x });
}
/** LEDs piscando (rack, switch, roteador). */
const blink = (g: THREE.Object3D, t: number) => {
  let i = 0;
  g.traverse((o) => {
    if (o.name === "led") { o.visible = Math.sin(t * (3 + (i % 5)) + i * 1.7) > -0.3; i++; }
  });
};
const L = (x: number, y: number, z: number, hex: string) => { const l = box(0.014, 0.01, 0.008, g$(hex), x, y, z); l.name = "led"; return l; };
function rack(units: number, body: string, glassDoor: boolean, accent: string) {
  const h = units * 0.045 + 0.1;
  const g = grp(box(0.62, h, 0.8, c(body), 0, 0), box(0.54, h - 0.06, 0.02, c("#1d2029"), 0, 0.03, 0.39));
  for (let i = 0; i < units; i++) {
    const y = 0.05 + i * 0.045;
    if (i % 3 === 2) g.add(box(0.5, 0.036, 0.02, c("#3d4460"), 0, y, 0.4));
    else g.add(box(0.5, 0.036, 0.02, c("#5d6273"), 0, y, 0.4), L(-0.2, y + 0.014, 0.412, i % 2 ? "#c8f501" : accent), L(-0.17, y + 0.014, 0.412, "#ffb23b"), box(0.16, 0.01, 0.005, DARK, 0.12, y + 0.014, 0.412));
  }
  if (glassDoor) g.add(box(0.56, h - 0.04, 0.012, glass, 0, 0.02, 0.43));
  return g;
}
// racks (4) + armário de rede (2)
for (const [k, u, body, acc, gl] of [["12U preto", 12, "#2a2d38", "#5ec8ff", true], ["24U preto", 24, "#2a2d38", "#5ec8ff", true], ["24U cinza", 24, "#8e93a3", "#c8f501", false], ["42U alto", 42, "#1d2029", "#4fb7d9", true]] as const)
  mk("rack_" + k.replace(" ", "_"), "Rack de servidor " + k, 0.7, 0.9, () => rack(u, body, gl, acc), { idle: true, tick: blink });
for (const [k, body] of [["parede", "#dcd8cf"], ["chão", "#5d6273"]] as const)
  mk("armario_" + k, "Armário de rede " + k, 0.6, 0.5, () => { const g = grp(box(0.5, k === "parede" ? 0.6 : 1.0, 0.3, c(body), 0, 0), box(0.46, k === "parede" ? 0.56 : 0.96, 0.01, glass, 0, 0.02, 0.155)); for (let i = 0; i < 4; i++) g.add(box(0.4, 0.04, 0.02, c("#2a2d38"), 0, 0.08 + i * 0.1, 0.12), L(-0.16, 0.1 + i * 0.1, 0.132, "#c8f501")); return g; }, { idle: true, tick: blink });
// roteadores (3)
for (const [k, hex, ant] of [["preto 4 antenas", "#1d2029", 4], ["branco 2 antenas", "#f2f0ea", 2], ["mesh", "#e8e6df", 0]] as const)
  mk("router_" + k.split(" ")[0] + (ant || ""), "Roteador " + k, 0.3, 0.25, () => {
    const g = grp(ant ? box(0.26, 0.04, 0.18, c(hex), 0, 0) : cyl(0.08, 0.1, 0.18, c(hex), 0, 0, 0, 14), L(-0.07, 0.03, 0.09, "#c8f501"), L(0.0, 0.03, 0.09, "#5ec8ff"), L(0.07, 0.03, 0.09, "#ffb23b"));
    for (let i = 0; i < ant; i++) { const a = box(0.015, 0.22, 0.015, c(hex), -0.1 + (i * 0.2) / Math.max(1, ant - 1), 0.04, -0.08); a.rotation.z = (i - 1.5) * 0.12; g.add(a); }
    return g;
  }, { blocks: false, tabletop: true, idle: true, tick: blink });
// switches (2)
for (const [k, hex] of [["8 portas", "#5d6273"], ["24 portas", "#2a2d38"]] as const)
  mk("switch_" + k.split(" ")[0], "Switch de rede " + k, 0.5, 0.25, () => { const n = k.startsWith("8") ? 8 : 12; const g = grp(box(0.4, 0.05, 0.2, c(hex), 0, 0)); for (let i = 0; i < n; i++) g.add(box(0.025, 0.02, 0.01, BLACK, -0.17 + (i * 0.34) / (n - 1), 0.02, 0.101), L(-0.17 + (i * 0.34) / (n - 1), 0.04, 0.103, i % 2 ? "#c8f501" : "#ffb23b")); return g; }, { blocks: false, tabletop: true, idle: true, tick: blink });
// nobreak (2)
for (const [k, hex] of [["pequeno", "#2a2d38"], ["torre", "#1d2029"]] as const)
  mk("nobreak_" + k, "Nobreak " + k, 0.3, 0.4, () => grp(box(0.2, k === "torre" ? 0.5 : 0.18, 0.34, c(hex), 0, 0), box(0.1, 0.03, 0.01, g$("#2d6a4f"), 0, 0.1, 0.171), L(0.07, 0.04, 0.171, "#c8f501")), { idle: true, tick: blink });
// access point (2)
for (const [k, hex] of [["redondo", "#f2f0ea"], ["quadrado", "#dcd8cf"]] as const)
  mk("ap_" + k, "Access point " + k, 0.3, 0.3, () => grp(k === "redondo" ? cyl(0.1, 0.1, 0.03, c(hex), 0, -0.03, 0, 16) : box(0.2, 0.03, 0.2, c(hex), 0, -0.03), L(0, -0.04, 0.0, "#5ec8ff")), { mount: "ceiling", blocks: false, idle: true, tick: blink });
// extintores (2), alarme (1), detector de fumaça (1)
for (const [k, hex] of [["vermelho", "#d9534f"], ["CO2 preto", "#2a2d38"]] as const)
  mk("extintor_" + k.split(" ")[0], "Extintor " + k, 0.25, 0.25, () => grp(cyl(0.07, 0.07, 0.4, c(hex), 0, 0, 0, 10), cyl(0.03, 0.03, 0.06, c("#2a2d38"), 0, 0.4, 0, 8), box(0.1, 0.02, 0.03, c("#2a2d38"), 0.03, 0.46), box(0.05, 0.08, 0.005, WHITE, 0, 0.15, 0.071)), { blocks: false });
mk("alarme", "Central de alarme", 0.3, 0.1, () => grp(box(0.22, 0.28, 0.04, c("#f2f0ea"), 0, 0), box(0.14, 0.06, 0.005, g$("#2d6a4f"), 0, 0.2, 0.021), ...[0, 1, 2].flatMap((r) => [0, 1, 2].map((q) => box(0.03, 0.03, 0.006, GREY, -0.05 + q * 0.05, 0.02 + r * 0.04, 0.021))), L(0.08, 0.26, 0.022, "#c8f501")), { mount: "wall", blocks: false, idle: true, tick: blink });
mk("fumaca", "Detector de fumaça", 0.2, 0.2, () => grp(cyl(0.07, 0.07, 0.03, WHITE, 0, -0.03, 0, 14), L(0.04, -0.035, 0.0, "#ff3b3b")), { mount: "ceiling", blocks: false, idle: true, tick: blink });
// leitor de crachá (2), catraca (2), cofre (1)
for (const [k, hex] of [["parede", "#2a2d38"], ["poste", "#5d6273"]] as const)
  mk("leitor_" + k, "Leitor de crachá " + k, 0.3, 0.2, () => { const g = grp(box(0.1, 0.18, 0.03, c(hex), 0, 0), box(0.07, 0.07, 0.005, g$("#2d6a4f"), 0, 0.1, 0.017), L(0, 0.03, 0.017, "#c8f501")); return k === "poste" ? grp(cyl(0.03, 0.04, 0.9, c(hex), 0, 0, 0, 8), g.translateY(0.9)) : g; }, k === "parede" ? { mount: "wall", blocks: false, idle: true, tick: blink } : { idle: true, tick: blink });
for (const [k, hex] of [["inox", "#b9bcc8"], ["preta", "#2a2d38"]] as const)
  mk("catraca_" + k, "Catraca de acesso " + k, 0.9, 0.4, () => { const arm = (y: number) => { const a = box(0.4, 0.03, 0.03, c("#e8e6df"), -0.1, y, 0); a.rotation.y = 0.0; return a; }; return grp(box(0.2, 1.0, 0.3, c(hex), -0.3, 0), box(0.04, 0.02, 0.2, g$("#2d6a4f"), -0.3, 1.0), box(0.2, 1.0, 0.3, c(hex), 0.3, 0), arm(0.8), arm(0.7), L(-0.2, 0.9, 0.12, "#c8f501")); }, { idle: true, tick: blink });
mk("cofre", "Cofre digital", 0.5, 0.5, () => grp(box(0.44, 0.4, 0.4, c("#3d4460"), 0, 0), box(0.34, 0.3, 0.02, c("#2a2d38"), 0, 0.05, 0.201), ball(0.04, c("#c9ced8"), 0.05, 0.2, 0.22), box(0.1, 0.05, 0.01, g$("#2d6a4f"), -0.1, 0.3, 0.205)), { tabletop: true });
void CHROME; void cylZ; void cone; void STEEL;
