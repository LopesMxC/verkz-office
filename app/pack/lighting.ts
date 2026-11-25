import * as THREE from "three";
import { ball, box, c, COLORS, cone, cyl, g$, glow, grp, reg, STEEL, WOODS, BLACK, CHROME, WHITE, cap, scl } from "./lib";

const CAT = "Iluminação";
const L = (hex: string) => g$(hex);
const cols = ["branco", "preto", "lima", "laranja", "azul", "vermelho"] as const;

// luminárias de mesa (articulada, flexível, arco, vintage) x 6 cores
for (const col of cols) {
  const hex = COLORS[col];
  reg({ id: "pk_lgt_artic_" + col, cat: CAT, label: "Luminária articulada " + col, w: 0.3, d: 0.3, blocks: false, tabletop: true, use: "lamp", idle: true,
    build: () => { const g = grp(cyl(0.09, 0.1, 0.03, c(hex), 0, 0), cyl(0.012, 0.012, 0.32, c(hex), 0, 0.03, 0, 6), box(0.012, 0.012, 0.3, c(hex), 0, 0.34, 0.12), cone(0.07, 0.1, c(hex), 0, 0.3, 0.26, 10), ball(0.03, L("#fff3c4"), 0, 0.28, 0.26)); g.getObjectByName; return g; },
    tick: (g, t, on) => { void g; void t; void on; } });
  reg({ id: "pk_lgt_arco_" + col, cat: CAT, label: "Luminária de arco " + col, w: 0.5, d: 0.3, blocks: false, tabletop: true,
    build: () => grp(box(0.2, 0.02, 0.14, c(hex), 0, 0), cyl(0.01, 0.01, 0.4, c(hex), -0.08, 0.02, 0, 6), box(0.2, 0.01, 0.01, c(hex), 0, 0.42), cyl(0.06, 0.06, 0.03, c(hex), 0.1, 0.4, 0, 12), ball(0.03, L("#fff3c4"), 0.1, 0.38, 0)) });
}
// abajures (6)
for (const [col, shade] of [["branco", "#f2e8c9"], ["preto", "#e8d9b0"], ["lima", "#f2f0ea"], ["laranja", "#f2e8c9"], ["azul", "#f2f0ea"], ["vermelho", "#f2e8c9"]] as const)
  reg({ id: "pk_lgt_abajur_" + col, cat: CAT, label: "Abajur " + col, w: 0.3, d: 0.3, blocks: false, tabletop: true,
    build: () => grp(cyl(0.08, 0.1, 0.03, c(COLORS[col]), 0, 0), cyl(0.02, 0.02, 0.2, c(COLORS[col]), 0, 0.03, 0, 8), cyl(0.09, 0.14, 0.16, c(shade), 0, 0.2, 0, 12), ball(0.04, L("#fff3c4"), 0, 0.28)) });
// pé alto (6): arco, torre, tripé, industrial, bola, tubular
const floor: [string, number, (h: string) => THREE.Object3D][] = [
  ["arco", 0.9, (h) => grp(cyl(0.2, 0.22, 0.04, c("#2a2d38"), 0, 0), cyl(0.015, 0.015, 1.8, c(h), 0, 0.04, 0, 6), box(0.015, 0.015, 0.8, c(h), 0, 1.84, 0.4), cone(0.14, 0.2, c(h), 0, 1.66, 0.8, 12), ball(0.05, L("#fff3c4"), 0, 1.64, 0.8))],
  ["torre", 0.4, (h) => grp(cyl(0.17, 0.19, 0.04, c("#2a2d38"), 0, 0), cyl(0.02, 0.02, 1.5, c(h), 0, 0.04, 0, 6), cyl(0.14, 0.14, 0.4, c("#f2e8c9"), 0, 1.4, 0, 12), ball(0.05, L("#fff3c4"), 0, 1.6))],
  ["tripé", 0.6, (h) => { const g = grp(cyl(0.13, 0.13, 0.4, c("#f2e8c9"), 0, 1.35, 0, 12), ball(0.05, L("#fff3c4"), 0, 1.55)); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const l = box(0.025, 1.4, 0.025, c(WOODS.nogueira), Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15); l.rotation.set(Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12); g.add(l); } void h; return g; }],
  ["industrial", 0.5, (h) => grp(cyl(0.18, 0.2, 0.05, c("#2a2d38"), 0, 0), cyl(0.02, 0.02, 1.3, c(h), 0, 0.05, 0, 6), cone(0.18, 0.22, c(h), 0, 1.3, 0, 12), ball(0.05, L("#fff3c4"), 0, 1.3))],
  ["bola", 0.5, (h) => grp(cyl(0.16, 0.18, 0.04, c(h), 0, 0), cyl(0.015, 0.015, 1.2, c(h), 0, 0.04, 0, 6), ball(0.2, g$("#fff8e0"), 0, 1.4))],
  ["tubular", 0.3, (h) => grp(cyl(0.14, 0.15, 0.03, c("#2a2d38"), 0, 0), cyl(0.025, 0.025, 1.7, g$(h === "#2a2d38" ? "#fff3c4" : h), 0, 0.03, 0, 8))],
];
for (const [k, w, f] of floor) for (const col of ["preto", "branco", "lima"] as const)
  reg({ id: `pk_lgt_pe_${k}_${col}`, cat: CAT, label: `Luminária de pé ${k} ${col}`, w, d: w, blocks: true, build: () => f(COLORS[col]) });
// pendentes (teto) 8
const pend: [string, (h: string) => THREE.Object3D][] = [
  ["cone", (h) => grp(cyl(0.01, 0.01, 0.8, c("#2a2d38"), 0, -0.8, 0, 4), cone(0.25, 0.2, c(h), 0, -1.0, 0, 16), ball(0.06, L("#fff3c4"), 0, -1.02))],
  ["globo", (h) => grp(cyl(0.01, 0.01, 0.8, c("#2a2d38"), 0, -0.8, 0, 4), ball(0.22, c(h), 0, -1.1), scl(ball(0.22, glow("#fff8e0"), 0, -1.1), 0.8, 0.8, 0.8))],
  ["cúpula", (h) => grp(cyl(0.01, 0.01, 0.8, c("#2a2d38"), 0, -0.8, 0, 4), cyl(0.12, 0.3, 0.2, c(h), 0, -1.0, 0, 16), ball(0.06, L("#fff3c4"), 0, -1.03))],
  ["cilindro", (h) => grp(cyl(0.01, 0.01, 0.7, c("#2a2d38"), 0, -0.7, 0, 4), cyl(0.12, 0.12, 0.3, c(h), 0, -1.0, 0, 16), cyl(0.1, 0.1, 0.01, g$("#fff3c4"), 0, -1.0, 0, 16))],
  ["linear", (h) => grp(cyl(0.008, 0.008, 0.6, c("#2a2d38"), -0.5, -0.6, 0, 4), cyl(0.008, 0.008, 0.6, c("#2a2d38"), 0.5, -0.6, 0, 4), box(1.4, 0.06, 0.1, c(h), 0, -0.66), box(1.3, 0.01, 0.07, g$("#fff8e0"), 0, -0.665))],
  ["trio", (h) => grp(...[-0.35, 0, 0.35].map((x, i) => grp(cyl(0.008, 0.008, 0.6 + i * 0.15, c("#2a2d38"), x, -0.6 - i * 0.15, 0, 4), ball(0.1, c(h), x, -1.0 - i * 0.2), ball(0.04, L("#fff3c4"), x, -1.03 - i * 0.2))))],
  ["painel", (h) => grp(box(0.6, 0.04, 0.6, c(h), 0, -0.04), box(0.54, 0.01, 0.54, g$("#fff8e0"), 0, -0.045))],
  ["spot", (h) => grp(cyl(0.07, 0.07, 0.08, c(h), 0, -0.08, 0, 12), cyl(0.05, 0.05, 0.01, g$("#fff8e0"), 0, -0.125, 0, 12))],
];
for (const [k, f] of pend) for (const col of ["preto", "branco", "laranja"] as const)
  reg({ id: `pk_lgt_pend_${k}_${col}`, cat: CAT, label: `Pendente ${k} ${col}`, w: k === "linear" ? 1.4 : 0.6, d: 0.6, blocks: false, mount: "ceiling", build: () => f(COLORS[col]) });
// arandelas de parede (4) e neon (4)
for (const col of ["preto", "branco", "lima", "laranja"] as const)
  reg({ id: "pk_lgt_arand_" + col, cat: CAT, label: "Arandela " + col, w: 0.25, d: 0.2, blocks: false, mount: "wall",
    build: () => grp(box(0.08, 0.2, 0.03, c(COLORS[col]), 0, -0.1), cyl(0.07, 0.07, 0.12, c(COLORS[col]), 0, -0.1, 0.09, 10).rotateX(Math.PI / 2), box(0.1, 0.02, 0.06, g$("#fff3c4"), 0, 0.02, 0.07)) });
const neon: [string, string, string][] = [["lima", "#c8f501", "bolha"], ["rosa", "#ff4fa3", "bolha"], ["ciano", "#5ec8ff", "barra"], ["laranja", "#ff8a3b", "barra"]];
for (const [k, hex, shape] of neon)
  reg({ id: "pk_lgt_neon_" + k, cat: CAT, label: "Letreiro neon " + k, w: 0.8, d: 0.1, blocks: false, mount: "wall", idle: true,
    build: () => { const g = grp(box(0.8, 0.4, 0.02, c("#1d2029"), 0, 0)); const m = g$(hex); if (shape === "bolha") { g.add(box(0.6, 0.03, 0.02, m, 0, 0.1, 0.02), box(0.03, 0.2, 0.02, m, -0.3, 0, 0.02), box(0.03, 0.2, 0.02, m, 0.3, 0, 0.02), box(0.6, 0.03, 0.02, m, 0, -0.1, 0.02)); } else { g.add(box(0.6, 0.04, 0.02, m, 0, 0.08, 0.02), box(0.4, 0.04, 0.02, m, -0.1, -0.02, 0.02), box(0.2, 0.04, 0.02, m, -0.2, -0.12, 0.02)); } g.name = "neon"; return g; },
    tick: (g, t) => { const m = g.getObjectByName("neon"); if (m) m.visible = !(Math.sin(t * 3.1) > 0.97); } });
// fita LED, spot de trilho, refletor
for (const [k, hex] of [["lima", "#c8f501"], ["rosa", "#ff4fa3"], ["azul", "#5ec8ff"], ["quente", "#ffd27a"]] as const)
  reg({ id: "pk_lgt_fita_" + k, cat: CAT, label: "Fita LED " + k, w: 1.2, d: 0.1, blocks: false, mount: "wall", build: () => grp(box(1.2, 0.03, 0.02, c("#2a2d38"), 0, 0), box(1.16, 0.015, 0.012, g$(hex), 0, 0.007, 0.012)) });
for (const col of ["preto", "branco"] as const)
  reg({ id: "pk_lgt_trilho_" + col, cat: CAT, label: "Trilho com spots " + col, w: 1.4, d: 0.2, blocks: false, mount: "ceiling",
    build: () => grp(box(1.4, 0.03, 0.04, c(COLORS[col]), 0, -0.03), ...[-0.45, 0, 0.45].map((x) => grp(cyl(0.01, 0.01, 0.1, c(COLORS[col]), x, -0.13, 0, 4), cyl(0.04, 0.05, 0.1, c(COLORS[col]), x, -0.22, 0.03, 8).rotateX(0.5), ball(0.02, L("#fff8e0"), x, -0.26, 0.06)))) });
void STEEL; void BLACK; void CHROME; void WHITE; void cap; void cyl;
