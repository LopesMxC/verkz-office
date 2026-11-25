import { BLACK, box, c, cyl, DARK, grp, STEEL, g$, CHROME, reg, WHITE, cylZ, ball, GREY, WOODS, cylX } from "./lib";
import * as THREE from "three";

const CAT = "Som e áudio";
type X = Partial<import("./lib").PackDef>;
function mk(id: string, label: string, w: number, d: number, build: () => THREE.Object3D, x: X = {}) {
  reg({ id: "pk_snd_" + id, cat: CAT, label, w, d, blocks: true, idle: true, use: "lamp", build, ...x });
}
/** O cone do alto-falante pulsa no ritmo quando está tocando. */
const pulse = (g: THREE.Object3D, t: number, on: boolean) => {
  g.traverse((o) => {
    if (o.name === "cone") { const s = on ? 1 + Math.abs(Math.sin(t * 9 + o.id)) * 0.12 : 1; o.scale.set(s, s, 1); }
    if (o.name === "led") (o as THREE.Mesh).visible = on ? Math.floor(t * 3) % 2 === 0 : true;
  });
};
const sp = (r: number, x: number, y: number, z: number, hex = "#5d6273") => { const g = grp(cylZ(r, 0.02, c("#1d2029"), x, y, z), cylZ(r * 0.55, 0.03, c(hex), x, y, z + 0.006), ball(r * 0.15, c("#1d2029"), x, y, z + 0.025)); g.name = "cone"; g.position.set(0, 0, 0); (g.children as THREE.Object3D[]).forEach((k) => (k.position.x += 0)); return g; };
const LED = (x: number, y: number, z: number, hex = "#c8f501") => { const l = box(0.012, 0.012, 0.006, g$(hex), x, y, z); l.name = "led"; return l; };

// bookshelf (4)
for (const [k, hex] of [["nogueira", WOODS.nogueira], ["carvalho", WOODS.carvalho], ["preta", "#2a2d38"], ["branca", "#f2f0ea"]] as const)
  mk("book_" + k, "Caixa de som prateleira " + k, 0.3, 0.3, () => grp(box(0.22, 0.34, 0.24, c(hex), 0, 0), sp(0.07, 0, 0.25, 0.121), sp(0.045, 0, 0.1, 0.121), box(0.2, 0.02, 0.01, GREY, 0, 0.32, 0.121)), { blocks: false, tabletop: true, tick: pulse });
// torre (4)
for (const [k, hex] of [["nogueira", WOODS.nogueira], ["preta", "#1d2029"], ["branca", "#f2f0ea"], ["cerejeira", WOODS.cerejeira]] as const)
  mk("torre_" + k, "Caixa de som torre " + k, 0.4, 0.4, () => grp(box(0.28, 1.0, 0.3, c(hex), 0, 0.04), box(0.32, 0.04, 0.34, c("#2a2d38"), 0, 0), sp(0.07, 0, 0.9, 0.151), sp(0.1, 0, 0.62, 0.151), sp(0.1, 0, 0.32, 0.151)), { tick: pulse });
// soundbar (3)
for (const [k, hex] of [["preta", "#1d2029"], ["prata", "#b9bcc8"], ["branca", "#f2f0ea"]] as const)
  mk("sbar_" + k, "Soundbar " + k, 0.9, 0.2, () => grp(box(0.84, 0.07, 0.1, c(hex), 0, 0), box(0.76, 0.035, 0.005, c("#2a2d38"), 0, 0.018, 0.051), LED(0.38, 0.05, 0.052), box(0.06, 0.02, 0.03, STEEL, -0.36, 0, 0.0)), { blocks: false, tabletop: true, tick: pulse });
// bluetooth cilindro (4)
for (const [k, hex] of [["preto", "#1d2029"], ["lima", "#c8f501"], ["azul", "#3b6fc0"], ["laranja", "#e0874a"]] as const)
  mk("bt_" + k, "Caixa bluetooth " + k, 0.2, 0.2, () => grp(cyl(0.07, 0.07, 0.18, c(hex), 0, 0, 0, 14), cyl(0.072, 0.072, 0.15, c("#2a2d38"), 0, 0.015, 0, 14), box(0.04, 0.008, 0.008, WHITE, 0, 0.19, 0.0), LED(0.05, 0.17, 0.05)), { blocks: false, tabletop: true, tick: pulse });
// teto (2)
for (const [k, hex] of [["branca", "#f2f0ea"], ["preta", "#2a2d38"]] as const)
  mk("teto_" + k, "Caixa de som de teto " + k, 0.3, 0.3, () => grp(cyl(0.13, 0.13, 0.02, c(hex), 0, -0.01, 0, 18), cyl(0.1, 0.1, 0.022, c("#1d2029"), 0, -0.011, 0, 18)), { mount: "ceiling", blocks: false, tick: pulse });
// subwoofer (2)
for (const [k, hex] of [["preto", "#1d2029"], ["madeira", WOODS.nogueira]] as const)
  mk("sub_" + k, "Subwoofer " + k, 0.5, 0.5, () => grp(box(0.4, 0.4, 0.4, c(hex), 0, 0), sp(0.15, 0, 0.2, 0.201, "#3d4460"), LED(0.16, 0.34, 0.202)), { tick: pulse });
// smart (3)
mk("smart_disco", "Smart speaker disco", 0.2, 0.2, () => grp(cyl(0.1, 0.1, 0.1, c("#3d4460"), 0, 0, 0, 16), cyl(0.1, 0.1, 0.01, g$("#5ec8ff"), 0, 0.1, 0, 16)), { blocks: false, tabletop: true, tick: pulse });
mk("smart_cubo", "Smart speaker cubo", 0.2, 0.2, () => grp(box(0.14, 0.14, 0.14, c("#dcd8cf"), 0, 0), box(0.1, 0.01, 0.1, g$("#c8f501"), 0, 0.14, 0)), { blocks: false, tabletop: true, tick: pulse });
mk("smart_esfera", "Smart speaker esfera", 0.2, 0.2, () => grp(ball(0.1, c("#f2f0ea"), 0, 0.1), cyl(0.05, 0.06, 0.02, STEEL, 0, 0, 0, 10), ball(0.02, g$("#ff4fa3"), 0, 0.2)), { blocks: false, tabletop: true, tick: pulse });
// monitores de estúdio (2)
for (const [k, hex] of [["preto", "#1d2029"], ["azul", "#3b6fc0"]] as const)
  mk("estudio_" + k, "Monitor de estúdio " + k, 0.3, 0.3, () => grp(box(0.2, 0.3, 0.22, c(hex), 0, 0), sp(0.08, 0, 0.1, 0.111, "#8e93a3"), sp(0.035, 0, 0.24, 0.111, "#8e93a3"), box(0.12, 0.04, 0.12, STEEL, 0, -0.03, 0)), { blocks: false, tabletop: true, tick: pulse });
// microfone podcast (3), pedestal (2)
for (const [k, hex] of [["preto", "#1d2029"], ["prata", "#c9ced8"], ["lima", "#c8f501"]] as const)
  mk("pod_" + k, "Microfone de podcast " + k, 0.4, 0.3, () => grp(box(0.2, 0.012, 0.16, STEEL, 0, 0), cyl(0.012, 0.012, 0.3, STEEL, 0, 0.01, -0.04, 6), box(0.012, 0.012, 0.2, STEEL, 0, 0.31, 0.04), cyl(0.035, 0.035, 0.12, c(hex), 0, 0.2, 0.14, 12), ball(0.036, c("#3a3a44"), 0, 0.33, 0.14), cyl(0.05, 0.05, 0.004, c("#2a2d38"), 0, 0.28, 0.18, 14).rotateX(Math.PI / 2)), { blocks: false, tabletop: true, idle: false });
for (const [k, h] of [["baixo", 1.0], ["alto", 1.6]] as const)
  mk("pedestal_" + k, "Microfone em pedestal " + k, 0.5, 0.5, () => { const g = grp(cyl(0.18, 0.2, 0.025, BLACK, 0, 0, 0, 12), cyl(0.015, 0.015, h, BLACK, 0, 0.02, 0, 6), box(0.012, 0.012, 0.16, BLACK, 0, h, 0.08), cyl(0.025, 0.02, 0.1, c("#3a3a44"), 0, h - 0.04, 0.16, 10)); return g; }, { idle: false });
// mesa de som (2)
for (const [k, hex] of [["pequena", "#2a2d38"], ["grande", "#1d2029"]] as const)
  mk("mixer_" + k, "Mesa de som " + k, k === "grande" ? 0.8 : 0.5, 0.4, () => { const n = k === "grande" ? 10 : 5; const w = n * 0.07 + 0.08; const g = grp(box(w, 0.06, 0.36, c(hex), 0, 0)); for (let i = 0; i < n; i++) { const x = -w / 2 + 0.07 + i * 0.07; g.add(box(0.012, 0.004, 0.14, g$("#5d6273"), x, 0.06, 0.06), box(0.028, 0.01, 0.02, c(i % 3 ? "#e0874a" : "#c8f501"), x, 0.062, 0.02 + (i % 4) * 0.03), cyl(0.012, 0.012, 0.015, c("#c9ced8"), x, 0.06, -0.1, 8)); } return g; }, { blocks: false, tabletop: true, idle: false });
// toca-discos (3)
for (const [k, hex] of [["madeira", WOODS.nogueira], ["branco", "#f2f0ea"], ["preto", "#1d2029"]] as const)
  mk("vinil_" + k, "Toca-discos " + k, 0.5, 0.4, () => { const rec = new THREE.Group(); rec.name = "disc"; rec.add(cyl(0.13, 0.13, 0.008, BLACK, 0, 0, 0, 20), cyl(0.04, 0.04, 0.01, c("#e0874a"), 0, 0, 0, 12)); rec.position.set(-0.05, 0.085, 0); const arm = box(0.012, 0.012, 0.18, STEEL, 0.16, 0.1, 0); arm.rotation.y = 0.3; return grp(box(0.44, 0.07, 0.34, c(hex), 0, 0), cyl(0.15, 0.15, 0.01, c("#3a3a44"), -0.05, 0.07, 0, 20), rec, cyl(0.02, 0.02, 0.03, STEEL, 0.16, 0.07, 0.05, 8), arm); }, { blocks: false, tabletop: true, tick: (g, t, on) => { const d = g.getObjectByName("disc"); if (d && on) d.rotation.y = t * 3; } });
// fone + suporte (3)
for (const [k, hex] of [["preto", "#1d2029"], ["branco", "#f2f0ea"], ["lima", "#c8f501"]] as const)
  mk("fone_" + k, "Fone no suporte " + k, 0.2, 0.2, () => grp(box(0.12, 0.012, 0.1, STEEL, 0, 0), cyl(0.012, 0.012, 0.24, STEEL, 0, 0.01, 0, 6), box(0.16, 0.014, 0.03, c(hex), 0, 0.26), box(0.03, 0.1, 0.03, c(hex), -0.075, 0.18), box(0.03, 0.1, 0.03, c(hex), 0.075, 0.18), cyl(0.04, 0.04, 0.03, c("#2a2d38"), -0.085, 0.16, 0, 10).rotateZ(Math.PI / 2), cyl(0.04, 0.04, 0.03, c("#2a2d38"), 0.085, 0.16, 0, 10).rotateZ(Math.PI / 2)), { blocks: false, tabletop: true, idle: false });
// rádios extras (3), jukebox (2), boombox (1)
for (const [k, hex, grill] of [["verde", "#6aa07a", "#e8d9a0"], ["vermelho", "#c0463e", "#f2f0ea"], ["creme", "#e8d9a0", "#5d6273"]] as const)
  mk("radio_" + k, "Rádio retrô " + k, 0.5, 0.25, () => grp(box(0.42, 0.24, 0.16, c(hex), 0, 0), box(0.18, 0.16, 0.01, c(grill), -0.08, 0.04, 0.081), box(0.12, 0.05, 0.01, c("#f2c14e"), 0.1, 0.14, 0.081), cylZ(0.025, 0.015, STEEL, 0.1, 0.06, 0.085, 8), cylZ(0.025, 0.015, STEEL, 0.16, 0.06, 0.085, 8), box(0.01, 0.25, 0.01, STEEL, 0.17, 0.24, -0.05)), { blocks: false, tabletop: true, tick: pulse });
for (const [k, hex, neon] of [["vermelha", "#a8322d", "#ff4fa3"], ["azul", "#2e5fa8", "#5ec8ff"]] as const)
  mk("jukebox_" + k, "Jukebox " + k, 0.8, 0.5, () => { const g = grp(box(0.7, 0.9, 0.4, c(hex), 0, 0), box(0.5, 0.45, 0.02, c("#1d2029"), 0, 0.35, 0.201), box(0.08, 0.4, 0.015, g$(neon), -0.3, 0.38, 0.205), box(0.08, 0.4, 0.015, g$(neon), 0.3, 0.38, 0.205), box(0.5, 0.06, 0.015, g$("#ffd35c"), 0, 0.85, 0.205), box(0.3, 0.2, 0.012, c("#f2f0ea"), 0, 0.52, 0.211)); const top = cyl(0.35, 0.35, 0.4, c(hex), 0, 0.9, 0, 14); top.rotation.x = Math.PI / 2; top.scale.set(1, 1, 1); g.add(box(0.7, 0.25, 0.4, c(hex), 0, 0.9)); return g; }, { tick: pulse });
mk("boombox", "Boombox", 0.5, 0.2, () => grp(box(0.46, 0.22, 0.14, c("#2a2d38"), 0, 0), sp(0.06, -0.14, 0.11, 0.071, "#8e93a3"), sp(0.06, 0.14, 0.11, 0.071, "#8e93a3"), box(0.12, 0.05, 0.01, c("#e8e6df"), 0, 0.14, 0.071), box(0.3, 0.02, 0.02, STEEL, 0, 0.22, 0)), { blocks: false, tabletop: true, tick: pulse });
void CHROME; void DARK; void cylX;
