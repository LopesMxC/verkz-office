import { BLACK, box, c, cyl, DARK, grp, STEEL, g$, CHROME, reg, WHITE, cylZ, ball, glass, GREY, cone } from "./lib";
import * as THREE from "three";

const CAT = "Câmeras";
type X = Partial<import("./lib").PackDef>;
function mk(id: string, label: string, w: number, d: number, build: () => THREE.Object3D, x: X = {}) {
  reg({ id: "pk_cam_" + id, cat: CAT, label, w, d, blocks: false, build, ...x });
}
const lens = (r: number, z: number, y = 0, x = 0) => grp(cylZ(r, 0.03, BLACK, x, y, z), cylZ(r * 0.6, 0.032, c("#3a4a6a"), x, y, z + 0.003), ball(r * 0.18, g$("#8fd3f2"), x - r * 0.2, y + r * 0.2, z + 0.018));
/** Balança a câmera de lado a lado (varredura). */
const sweep = (name: string, amp = 0.6, speed = 0.6) => (g: THREE.Object3D, t: number, on: boolean) => {
  const p = g.getObjectByName(name);
  if (p) p.rotation.y = Math.sin(t * speed) * amp * (on ? 1.4 : 1);
  const led = g.getObjectByName("led") as THREE.Mesh | undefined;
  if (led) led.visible = Math.floor(t * 1.5) % 2 === 0;
};
const led = (x: number, y: number, z: number) => { const l = box(0.02, 0.02, 0.01, g$("#ff3b3b"), x, y, z); l.name = "led"; return l; };

// dome de teto (3)
for (const [k, body] of [["branca", "#f2f0ea"], ["preta", "#2a2d38"], ["fumê", "#3d4460"]] as const)
  mk("dome_" + k, "Câmera dome " + k, 0.3, 0.3, () => {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), k === "fumê" ? c("#262a36") : glass);
    dome.rotation.x = Math.PI;
    dome.position.y = -0.03;
    const head = grp(cyl(0.05, 0.05, 0.06, BLACK, 0, -0.14, 0, 8), cylZ(0.035, 0.05, c("#3a4a6a"), 0, -0.11, 0.05));
    head.name = "head";
    return grp(cyl(0.14, 0.14, 0.03, c(body), 0, -0.01, 0, 14), dome, head, led(0.08, -0.02, 0.1));
  }, { mount: "ceiling", idle: true, tick: sweep("head", 0.9, 0.5) });
// bullet de parede (3)
for (const [k, body, len] of [["curta", "#f2f0ea", 0.2], ["longa", "#dcd8cf", 0.3], ["preta", "#2a2d38", 0.24]] as const)
  mk("bullet_" + k, "Câmera bullet " + k, 0.3, 0.4, () => {
    const b = grp(cylZ(0.05, len, c(body), 0, 0, len / 2 - 0.02), box(0.14, 0.012, len * 0.9, c(body), 0, 0.045, len / 2 - 0.02), lens(0.04, len - 0.01), led(0.03, 0.05, 0.05));
    b.name = "head";
    return grp(box(0.1, 0.1, 0.03, STEEL, 0, -0.05, -0.02), box(0.04, 0.12, 0.04, STEEL, 0, -0.1, 0.0), b);
  }, { mount: "wall", idle: true, tick: sweep("head", 0.35, 0.35) });
// PTZ (2)
for (const [k, body] of [["branca", "#f2f0ea"], ["preta", "#2a2d38"]] as const)
  mk("ptz_" + k, "Câmera PTZ " + k, 0.3, 0.3, () => {
    const h = grp(ball(0.11, c(body), 0, 0, 0), lens(0.06, 0.1), led(-0.08, 0.1, 0.05));
    h.name = "head";
    return grp(cyl(0.12, 0.12, 0.04, c(body), 0, -0.03, 0, 14), box(0.04, 0.2, 0.04, c(body), 0, -0.2, -0.06), h.translateY(-0.2));
  }, { mount: "wall", idle: true, tick: sweep("head", 1.1, 0.7) });
// cubo/wifi (2) e 360 (1)
for (const [k, body] of [["branco", "#f2f0ea"], ["preto", "#1d2029"]] as const)
  mk("cubo_" + k, "Câmera wi-fi cubo " + k, 0.15, 0.15, () => grp(box(0.1, 0.1, 0.1, c(body), 0, 0), cylZ(0.035, 0.02, BLACK, 0, 0.05, 0.055), box(0.01, 0.01, 0.01, g$("#c8f501"), 0.035, 0.09, 0.052), cyl(0.05, 0.05, 0.015, STEEL, 0, 0)), { tabletop: true });
mk("360", "Câmera 360 de teto", 0.3, 0.3, () => grp(cyl(0.13, 0.13, 0.03, WHITE, 0, -0.01, 0, 16), ball(0.09, c("#262a36"), 0, -0.07), box(0.02, 0.02, 0.01, g$("#ff3b3b"), 0.1, -0.02, 0.06)), { mount: "ceiling" });
// campainha (2)
for (const [k, body, ring] of [["preta", "#2a2d38", "#5ec8ff"], ["branca", "#f2f0ea", "#c8f501"]] as const)
  mk("campainha_" + k, "Campainha com câmera " + k, 0.12, 0.1, () => grp(box(0.07, 0.16, 0.03, c(body), 0, 0), cylZ(0.015, 0.01, BLACK, 0, 0.12, 0.018), cylZ(0.02, 0.01, g$(ring), 0, 0.04, 0.018)), { mount: "wall" });
// webcam (3)
for (const [k, body] of [["preta", "#1d2029"], ["branca", "#f2f0ea"], ["prata", "#c9ced8"]] as const)
  mk("webcam_" + k, "Webcam " + k, 0.14, 0.1, () => grp(box(0.1, 0.035, 0.03, c(body), 0, 0.02), cylZ(0.014, 0.01, c("#3a4a6a"), 0, 0.037, 0.02), box(0.06, 0.02, 0.05, c(body), 0, 0), box(0.003, 0.003, 0.003, g$("#c8f501"), 0.03, 0.045, 0.016)), { tabletop: true });
// barra de reunião (2)
for (const [k, body] of [["preta", "#2a2d38"], ["grafite", "#5d6273"]] as const)
  mk("barra_" + k, "Câmera de sala de reunião " + k, 0.6, 0.15, () => grp(box(0.55, 0.07, 0.07, c(body), 0, 0), cylZ(0.03, 0.01, c("#3a4a6a"), 0, 0.04, 0.036), cylZ(0.03, 0.01, c("#3a4a6a"), 0.1, 0.04, 0.036), box(0.18, 0.012, 0.012, DARK, -0.17, 0.04, 0.036), box(0.02, 0.008, 0.008, g$("#c8f501"), 0.22, 0.05, 0.036)), { tabletop: true });
// DSLR em tripé (3)
const tripod = (h: number) => {
  const g = grp(cyl(0.02, 0.02, h, STEEL, 0, 0, 0, 6));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = box(0.025, h * 0.95, 0.025, STEEL, Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2);
    leg.rotation.set(Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2);
    g.add(leg);
  }
  return g;
};
for (const [k, body, len, h] of [["preta", "#1d2029", 0.1, 1.2], ["alta", "#2a2d38", 0.16, 1.5], ["prata", "#b9bcc8", 0.12, 1.0]] as const)
  mk("dslr_" + k, "Câmera DSLR no tripé " + k, 0.5, 0.5, () => grp(tripod(h), box(0.1, 0.05, 0.05, STEEL, 0, h), box(0.14, 0.09, 0.07, c(body), 0, h + 0.05), cylZ(0.04, len, BLACK, 0, h + 0.09, 0.07 + len / 2), cylZ(0.03, len + 0.01, c("#3a4a6a"), 0, h + 0.09, 0.07 + len / 2), box(0.04, 0.03, 0.04, c(body), 0.03, h + 0.14, 0)));
// cine + monitor (1), gimbal (1)
mk("cine", "Câmera de cinema com monitor", 0.6, 0.6, () => grp(tripod(1.3), box(0.2, 0.12, 0.14, c("#2a2d38"), 0, 1.33), cylZ(0.07, 0.18, BLACK, 0, 1.4, 0.16), cylZ(0.05, 0.2, c("#3a4a6a"), 0, 1.4, 0.16), box(0.14, 0.1, 0.01, screenMat2(), 0.14, 1.45, 0.0), box(0.012, 0.012, 0.012, g$("#ff3b3b"), -0.08, 1.46, 0.07)));
mk("gimbal", "Gimbal com câmera", 0.2, 0.2, () => grp(cyl(0.025, 0.025, 0.25, c("#2a2d38"), 0, 0, 0, 8), box(0.16, 0.03, 0.03, c("#2a2d38"), 0, 0.24), box(0.07, 0.06, 0.05, BLACK, 0, 0.26), cylZ(0.025, 0.02, c("#3a4a6a"), 0, 0.29, 0.03)), { tabletop: true });
function screenMat2() { return g$("#2d6a4f"); }
// ring light (2) e softbox (2), refletor (1)
for (const [k, h] of [["baixo", 1.0], ["alto", 1.6]] as const)
  mk("ring_" + k, "Ring light " + k, 0.6, 0.6, () => { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 6, 20), g$("#fff4d6")); ring.position.set(0, h + 0.2, 0); return grp(tripod(h), cyl(0.02, 0.02, 0.18, STEEL, 0, h, 0, 6), ring, box(0.08, 0.05, 0.03, DARK, 0, h + 0.19, -0.02)); });
for (const [k, hex] of [["branco", "#f2f0ea"], ["laranja", "#e0874a"]] as const)
  mk("softbox_" + k, "Softbox de estúdio " + k, 0.8, 0.8, () => grp(tripod(1.6), box(0.6, 0.6, 0.08, c("#1d2029"), 0, 1.6), box(0.54, 0.54, 0.01, g$(k === "branco" ? "#fffbe8" : "#ffe0b8"), 0, 1.63, 0.045), box(0.1, 0.04, 0.06, STEEL, 0, 1.58, -0.06)));
mk("refletor", "Refletor de fundo", 0.7, 0.4, () => grp(tripod(1.3), box(0.5, 0.35, 0.04, c("#e8e6df"), 0, 1.3), box(0.5, 0.05, 0.05, DARK, 0, 1.28)));
// poste de segurança + câmera de estacionamento (2)
mk("poste", "Câmera em poste", 0.3, 0.3, () => { const h = grp(box(0.12, 0.1, 0.34, c("#dcd8cf"), 0, 0), lens(0.04, 0.18), led(0.04, 0.1, 0.1)); h.name = "head"; h.position.set(0, 2.9, 0.1); return grp(cyl(0.04, 0.05, 2.9, c("#8e93a3"), 0, 0, 0, 8), cyl(0.1, 0.1, 0.05, STEEL, 0, 0, 0, 8), h); }, { idle: true, tick: sweep("head", 0.8, 0.4), blocks: true } as X);
mk("alarme_cam", "Câmera com sirene", 0.25, 0.3, () => grp(box(0.16, 0.1, 0.12, c("#dcd8cf"), 0, 0), lens(0.03, 0.07), box(0.1, 0.06, 0.1, g$("#ff7a3b"), 0, 0.11), box(0.12, 0.2, 0.03, STEEL, 0, -0.2, -0.03)), { mount: "wall" });
void CHROME; void WHITE; void GREY; void cone; void DARK;
