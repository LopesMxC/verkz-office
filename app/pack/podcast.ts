import * as THREE from "three";
import { ball, box, c, COLORS, cone, cyl, cylX, cylZ, g$, glass, grp, reg, WOODS, screenMat, BLACK, CHROME, STEEL, DARK, GREY, WHITE, PackDef } from "./lib";

const CAT = "Podcast e estúdio";
const mk = (id: string, label: string, w: number, d: number, build: () => THREE.Object3D, x: Partial<PackDef> = {}) => reg({ id: "pk_pod_" + id, cat: CAT, label, w, d, blocks: false, build, ...x });
/** Barra entre dois pontos (braços articulados, pernas de tripé). */
function bar(a: [number, number, number], b: [number, number, number], th: number, m: THREE.Material) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const o = new THREE.Mesh(new THREE.BoxGeometry(th, len, th), m);
  o.position.copy(va).add(vb).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  o.castShadow = true;
  return o;
}
const COL = ["preto", "branco", "lima", "grafite"] as const;

// ---------- microfones
function micHead(kind: "condensador" | "dinamico" | "aranha", hex: string) {
  const g = grp();
  if (kind === "dinamico") { g.add(cyl(0.03, 0.03, 0.2, c(hex), 0, 0, 0, 12), ball(0.034, c("#2a2d38"), 0, 0.21), cyl(0.036, 0.036, 0.03, c(CHROME ? "#c9ced8" : hex), 0, 0.1, 0, 12)); }
  else if (kind === "condensador") { g.add(cyl(0.035, 0.035, 0.16, c(hex), 0, 0, 0, 14), ball(0.038, c("#6b7080"), 0, 0.17), cyl(0.036, 0.036, 0.02, c("#e0b04a"), 0, 0.08, 0, 14)); }
  else { g.add(cyl(0.03, 0.03, 0.15, c(hex), 0, 0.02, 0, 12), ball(0.033, c("#6b7080"), 0, 0.18)); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(bar([Math.sin(a) * 0.055, 0.0, Math.cos(a) * 0.055], [Math.sin(a) * 0.055, 0.2, Math.cos(a) * 0.055], 0.004, c("#2a2d38"))); } g.add(cyl(0.057, 0.057, 0.004, c("#2a2d38"), 0, 0, 0, 12), cyl(0.057, 0.057, 0.004, c("#2a2d38"), 0, 0.2, 0, 12)); }
  return g;
}
const popFilter = () => grp(cylZ(0.07, 0.006, c("#1d2029"), 0, 0, 0, 20), cylZ(0.065, 0.007, glass, 0, 0, 0, 20));
function boomArm(hex: string, head: "condensador" | "dinamico" | "aranha", pop: boolean) {
  const m = c(hex);
  const g = grp(box(0.1, 0.03, 0.08, c("#2a2d38"), 0, 0), box(0.03, 0.22, 0.03, m, 0, 0.03));
  g.add(bar([0, 0.25, 0], [0.0, 0.42, 0.28], 0.022, m), ball(0.02, c("#2a2d38"), 0, 0.25, 0), ball(0.02, c("#2a2d38"), 0, 0.42, 0.28), bar([0, 0.42, 0.28], [0, 0.34, 0.42], 0.018, m));
  const h = micHead(head, "#2a2d38"); h.position.set(0, 0.2, 0.42); h.rotation.x = Math.PI / 2 - 0.5; h.position.y = 0.32; g.add(h);
  if (pop) { const p = popFilter(); p.position.set(0, 0.36, 0.5); g.add(p); }
  return g;
}
for (const k of COL) for (const [hk, hl] of [["condensador", "condensador"], ["dinamico", "dinâmico"], ["aranha", "com aranha"]] as const)
  mk(`braco_${hk}_${k}`, `Microfone ${hl} com braço ${k}`, 0.3, 0.6, () => boomArm(COLORS[k], hk, hk !== "dinamico"), { tabletop: true });
for (const k of ["preto", "branco"] as const)
  mk(`braco_longo_${k}`, `Braço de microfone longo ${k}`, 0.3, 0.9, () => { const m = c(COLORS[k]); const g = grp(box(0.1, 0.03, 0.08, c("#2a2d38"), 0, 0), box(0.03, 0.3, 0.03, m, 0, 0.03), bar([0, 0.33, 0], [0, 0.55, 0.4], 0.022, m), bar([0, 0.55, 0.4], [0, 0.4, 0.7], 0.02, m), ball(0.022, c("#2a2d38"), 0, 0.55, 0.4)); const h = micHead("dinamico", "#2a2d38"); h.position.set(0, 0.36, 0.72); h.rotation.x = Math.PI / 2 - 0.6; g.add(h); return g; }, { tabletop: true });
mk("tripe_mesa", "Microfone em tripé de mesa", 0.3, 0.3, () => { const g = grp(cyl(0.012, 0.012, 0.16, c("#2a2d38"), 0, 0.02, 0, 6)); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; g.add(bar([0, 0.06, 0], [Math.sin(a) * 0.1, 0.0, Math.cos(a) * 0.1], 0.012, c("#2a2d38"))); } const h = micHead("condensador", "#c9ced8"); h.position.y = 0.18; g.add(h); return g; }, { tabletop: true });
mk("lapela", "Kit de microfones de lapela", 0.3, 0.2, () => grp(box(0.26, 0.03, 0.14, c("#2a2d38"), 0, 0), box(0.1, 0.012, 0.05, c("#f2f0ea"), -0.06, 0.03, 0), box(0.04, 0.02, 0.025, c("#2a2d38"), 0.07, 0.03, -0.03), box(0.04, 0.02, 0.025, c("#2a2d38"), 0.07, 0.03, 0.03), ball(0.008, g$("#c8f501"), -0.06, 0.05, 0.03)), { tabletop: true });
mk("pop_avulso", "Filtro pop avulso", 0.2, 0.2, () => grp(cyl(0.01, 0.01, 0.3, c("#2a2d38"), 0, 0, 0, 6), box(0.1, 0.02, 0.06, c("#2a2d38"), 0, 0), popFilter().translateY(0.34)), { tabletop: true });
mk("boom_chao", "Microfone em pedestal com boom", 0.7, 0.7, () => { const g = grp(cyl(0.2, 0.22, 0.03, c("#2a2d38"), 0, 0), cyl(0.014, 0.014, 1.5, c("#2a2d38"), 0, 0.03, 0, 8), bar([0, 1.5, 0], [0, 1.58, 0.45], 0.02, c("#2a2d38")), cyl(0.04, 0.04, 0.05, c("#2a2d38"), 0, 1.5, 0, 8)); const h = micHead("dinamico", "#2a2d38"); h.position.set(0, 1.48, 0.46); h.rotation.x = Math.PI / 2 + 0.2; g.add(h); const p = popFilter(); p.position.set(0, 1.55, 0.54); g.add(p); return g; }, { blocks: true });
mk("boom_teto", "Boom de microfone no teto", 0.2, 0.9, () => { const g = grp(cyl(0.05, 0.05, 0.03, c("#2a2d38"), 0, -0.03, 0, 10), cyl(0.012, 0.012, 0.6, c("#2a2d38"), 0, -0.6, 0, 6), bar([0, -0.6, 0], [0, -0.7, 0.6], 0.02, c("#2a2d38"))); const h = micHead("dinamico", "#2a2d38"); h.position.set(0, -0.78, 0.6); h.rotation.x = Math.PI / 2 + 0.2; g.add(h); return g; }, { mount: "ceiling" });

// ---------- câmeras e tripés
function tripod(h: number, spread: number, hex = "#2a2d38") {
  const g = grp(cyl(0.025, 0.025, 0.08, c(hex), 0, h - 0.08, 0, 8));
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5; g.add(bar([Math.sin(a) * 0.02, h - 0.1, Math.cos(a) * 0.02], [Math.sin(a) * spread, 0, Math.cos(a) * spread], 0.025, c(hex))); }
  g.add(cyl(0.04, 0.04, 0.025, c("#5d6273"), 0, h - 0.04, 0, 8));
  return g;
}
const lens = (r: number, len: number) => grp(cylZ(r, len, c("#1d2029"), 0, 0, len / 2, 14), cylZ(r * 0.7, 0.01, g$("#5ec8ff"), 0, 0, len + 0.005, 14), cylZ(r * 1.05, 0.02, c("#5d6273"), 0, 0, len * 0.5, 14));
function dslr(hex: string) { const g = grp(box(0.16, 0.1, 0.08, c(hex), 0, 0), box(0.06, 0.03, 0.05, c(hex), 0, 0.1, 0), cyl(0.01, 0.01, 0.02, g$("#d9534f"), 0.06, 0.1, 0, 6)); const l = lens(0.04, 0.12); l.position.set(0, 0.05, 0.04); g.add(l); g.add(box(0.07, 0.05, 0.005, c("#2a2d38"), -0.03, 0.03, -0.042)); return g; }
const camTop = (h: number, hex: string, cam: THREE.Object3D, spread = 0.45, head = true) => { const g = tripod(h, spread); cam.position.y = h; g.add(cam); void head; return g; };
for (const [k, h] of [["baixo", 0.9], ["médio", 1.3], ["alto", 1.7]] as const)
  mk(`cam_tripe_${k}`, `Câmera DSLR em tripé ${k}`, 0.9, 0.9, () => camTop(h, "#2a2d38", dslr("#2a2d38")), { blocks: false, idle: true, tick: (g, t) => { const cam = g.children[g.children.length - 1]; cam.rotation.y = Math.sin(t * 0.3) * 0.12; } });
for (const [k, hex] of [["preta", "#2a2d38"], ["prata", "#c9ced8"]] as const)
  mk(`cam_cinema_${k}`, `Câmera de cinema em tripé ${k}`, 1.0, 1.0, () => { const cam = grp(box(0.2, 0.16, 0.3, c(hex), 0, 0), box(0.12, 0.08, 0.12, c("#2a2d38"), 0, 0.16, -0.05), box(0.02, 0.02, 0.22, c("#2a2d38"), 0.09, 0.24, 0)); const l = lens(0.07, 0.22); l.position.set(0, 0.08, 0.15); cam.add(l, box(0.22, 0.025, 0.04, c("#2a2d38"), 0, 0.17, 0.2), box(0.16, 0.12, 0.02, screenMat("chart"), -0.11, 0.06, -0.05).rotateY(0.1)); return camTop(1.5, hex, cam, 0.5); }, { blocks: false });
mk("cam_video_ombro", "Filmadora de ombro em tripé", 0.9, 0.9, () => { const cam = grp(box(0.12, 0.14, 0.34, c("#2a2d38"), 0, 0), cylZ(0.05, 0.2, c("#1d2029"), 0, 0.07, 0.25, 14), box(0.1, 0.02, 0.2, c("#2a2d38"), 0, 0.14, 0), cylZ(0.03, 0.12, c("#1d2029"), 0, 0.12, -0.15, 10)); return camTop(1.4, "#2a2d38", cam); });
for (const k of ["preta", "branca"] as const)
  mk(`cam_webcam_${k}`, `Webcam em mini tripé ${k}`, 0.3, 0.3, () => { const g = grp(); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; g.add(bar([0, 0.1, 0], [Math.sin(a) * 0.09, 0, Math.cos(a) * 0.09], 0.012, c("#2a2d38"))); } g.add(box(0.1, 0.035, 0.035, c(COLORS[k]), 0, 0.1, 0), cylZ(0.014, 0.01, c("#1d2029"), 0, 0.118, 0.02, 10), ball(0.004, g$("#c8f501"), 0.03, 0.125, 0.02)); return g; }, { tabletop: true });
mk("celular_tripe", "Celular em tripé com anel de luz", 0.3, 0.3, () => { const g = grp(); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; g.add(bar([0, 0.2, 0], [Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12], 0.012, c("#2a2d38"))); } g.add(box(0.07, 0.14, 0.01, c("#1d2029"), 0, 0.2, 0), box(0.06, 0.12, 0.004, screenMat("chart"), 0, 0.21, 0.006)); const ring = cylZ(0.1, 0.01, g$("#fff8e0"), 0, 0.3, -0.02, 20); g.add(ring, cylZ(0.065, 0.012, c("#2a2d38"), 0, 0.3, -0.021, 20)); return g; }, { tabletop: true });
mk("gimbal", "Estabilizador (gimbal) com câmera", 0.3, 0.3, () => grp(cyl(0.025, 0.03, 0.2, c("#2a2d38"), 0, 0, 0, 10), box(0.2, 0.03, 0.03, c("#2a2d38"), 0, 0.2), box(0.1, 0.07, 0.07, c("#1d2029"), 0, 0.23), cylZ(0.02, 0.05, c("#5d6273"), 0, 0.26, 0.05, 8)), { tabletop: true });
mk("teleprompter", "Teleprompter em tripé", 0.9, 0.9, () => { const cam = grp(box(0.5, 0.4, 0.04, c("#1d2029"), 0, 0), box(0.44, 0.34, 0.01, glass, 0, 0.03, 0.025), box(0.3, 0.2, 0.18, c("#2a2d38"), 0, 0.1, -0.1), cylZ(0.03, 0.06, c("#2a2d38"), 0, 0.2, 0.0, 10)); return camTop(1.45, "#2a2d38", cam, 0.5); });

// ---------- iluminação de estúdio
for (const [k, hex] of [["branco", "#fff8e0"], ["quente", "#ffd27a"], ["lima", "#c8f501"]] as const)
  mk(`ring_${k}`, `Ring light em tripé ${k}`, 0.7, 0.7, () => { const g = tripod(1.5, 0.35); g.add(cylZ(0.24, 0.025, c("#2a2d38"), 0, 1.65, 0, 24), cylZ(0.22, 0.03, g$(hex), 0, 1.65, 0.01, 24), cylZ(0.12, 0.032, c("#1d2029"), 0, 1.65, 0.012, 20)); return g; }, { idle: true });
for (const [k, hex] of [["branco", "#f2f0ea"], ["preto", "#2a2d38"]] as const)
  mk(`softbox_${k}`, `Softbox em tripé ${k}`, 0.8, 0.8, () => { const g = tripod(1.6, 0.4); g.add(box(0.55, 0.55, 0.3, c(hex), 0, 1.5, 0.05), box(0.5, 0.5, 0.01, g$("#fff8e0"), 0, 1.52, 0.2), box(0.06, 0.06, 0.1, c("#2a2d38"), 0, 1.45, -0.12)); return g; });
for (const [k, hex] of [["azul", "#5ec8ff"], ["rosa", "#ff4fa3"], ["lima", "#c8f501"]] as const)
  mk(`painel_led_${k}`, `Painel de luz LED ${k}`, 0.8, 0.5, () => { const g = tripod(1.4, 0.35); g.add(box(0.5, 0.3, 0.04, c("#1d2029"), 0, 1.4), box(0.46, 0.26, 0.01, g$(hex), 0, 1.42, 0.025)); return g; });
mk("luz_fundo", "Tubo de luz RGB de fundo", 0.2, 0.2, () => grp(cyl(0.12, 0.13, 0.03, c("#2a2d38"), 0, 0, 0, 12), cyl(0.025, 0.025, 1.0, g$("#ff4fa3"), 0, 0.03, 0, 10), cyl(0.027, 0.027, 0.02, c("#2a2d38"), 0, 1.03, 0, 10)), { idle: true });
// ---------- no ar, acústica, fundo
for (const [k, hex] of [["vermelho", "#ff3b4a"], ["lima", "#c8f501"], ["ciano", "#5ec8ff"]] as const)
  mk(`noar_${k}`, `Letreiro NO AR ${k}`, 0.6, 0.1, () => { const g = grp(box(0.6, 0.22, 0.04, c("#1d2029"), 0, 0), box(0.54, 0.16, 0.01, g$(hex), 0, 0.03, 0.025)); [-0.18, -0.06, 0.06, 0.18].forEach((x, i) => g.add(box(0.07, 0.1, 0.012, c("#1d2029"), x, 0.06, 0.032), box(0.03, 0.03, 0.012, c("#1d2029"), x, 0.09 - (i % 2) * 0.03, 0.034))); g.name = "noar"; return g; }, { mount: "wall", idle: true, tick: (g, t) => { const m = g.getObjectByName("noar"); if (m) m.visible = Math.sin(t * 2.2) > -0.6; } });
for (const [k, hex] of [["grafite", "#3d4460"], ["preto", "#2a2d38"], ["cinza", "#8e93a3"], ["lima", "#c8f501"]] as const)
  mk(`espuma_${k}`, `Painel de espuma acústica ${k}`, 1.0, 0.1, () => { const g = grp(box(1.0, 1.0, 0.03, c(hex), 0, 0)); for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) g.add(cone(0.08, 0.1, c(hex), -0.42 + i * 0.168, 0.08 + j * 0.168, 0.03, 4).rotateX(Math.PI / 2)); return g; }, { mount: "wall" });
for (const [k, hex] of [["bege", "#d9c9a3"], ["verde", "#6f8f72"], ["azul", "#3b6fc0"], ["rosa", "#e58aa8"]] as const)
  mk(`painel_ac_${k}`, `Painel acústico ripado ${k}`, 1.2, 0.1, () => { const g = grp(box(1.2, 0.7, 0.03, c(hex), 0, 0)); for (let i = 0; i < 12; i++) g.add(box(0.05, 0.66, 0.03, c(WOODS.carvalho), -0.55 + i * 0.1, 0.02, 0.025)); return g; }, { mount: "wall" });
mk("biombo_ac", "Biombo acústico", 1.6, 0.3, () => grp(...[-0.5, 0, 0.5].map((x, i) => box(0.5, 1.7, 0.06, c(["#3d4460", "#4a5270", "#3d4460"][i]), x, 0, i === 1 ? 0.1 : 0).rotateY(i === 1 ? 0 : (i - 1) * 0.35)), box(1.5, 0.04, 0.2, c("#2a2d38"), 0, 0)), { blocks: true });
mk("cortina_fundo", "Cortina de fundo de estúdio", 2.4, 0.2, () => { const g = grp(box(2.4, 0.04, 0.04, c("#2a2d38"), 0, 2.2)); for (let i = 0; i < 12; i++) g.add(box(0.2, 2.1, 0.04, c(i % 2 ? "#2b3350" : "#323a5c"), -1.1 + i * 0.2, 0.1, 0.02 * (i % 2))); return g; }, { blocks: false });
mk("fundo_logo", "Fundo de estúdio com logotipo", 2.4, 0.2, () => grp(box(2.4, 1.6, 0.05, c("#1d2029"), 0, 0), box(0.9, 0.12, 0.02, g$("#c8f501"), -0.3, 0.9, 0.03), box(0.5, 0.06, 0.02, c("#8e93a3"), -0.5, 0.7, 0.03), box(0.5, 0.5, 0.02, c("#2b3350"), 0.8, 0.5, 0.03)), { blocks: false });
mk("tapete_estudio", "Tapete de estúdio", 2.4, 1.6, () => grp(box(2.4, 0.02, 1.6, c("#2b3350"), 0, 0), box(2.2, 0.022, 1.4, c("#323a5c"), 0, 0)), { blocks: false });

// ---------- mesas e conjuntos de podcast
function micAt(x: number, z: number, rot: number, hex = "#2a2d38") { const g = boomArm(hex, "dinamico", true); g.position.set(x, 0.75, z); g.rotation.y = rot; return g; }
mk("mesa_redonda", "Mesa de podcast redonda (4 vozes)", 2.0, 2.0, () => { const g = grp(cyl(0.9, 0.9, 0.05, c("#2a2d38"), 0, 0.72, 0, 32), cyl(0.12, 0.3, 0.72, c("#1d2029"), 0, 0, 0, 12), cyl(0.5, 0.5, 0.004, c("#c8f501"), 0, 0.77, 0, 32)); for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; g.add(micAt(Math.sin(a) * 0.55, Math.cos(a) * 0.55, a + Math.PI)); } return g; }, { blocks: true });
mk("mesa_retangular", "Mesa de podcast retangular (2 vozes)", 1.8, 0.9, () => { const g = grp(box(1.8, 0.05, 0.9, c(WOODS.nogueira), 0, 0.72), box(0.06, 0.72, 0.8, c("#2a2d38"), -0.8, 0), box(0.06, 0.72, 0.8, c("#2a2d38"), 0.8, 0), box(1.0, 0.004, 0.5, c("#2a2d38"), 0, 0.77)); g.add(micAt(-0.5, -0.2, Math.PI), micAt(0.5, 0.2, 0)); return g; }, { blocks: true });
mk("mesa_solo", "Bancada de podcast solo", 1.4, 0.8, () => { const g = grp(box(1.4, 0.05, 0.8, c(WOODS.carvalho), 0, 0.72), box(0.05, 0.72, 0.7, c("#2a2d38"), -0.65, 0), box(0.05, 0.72, 0.7, c("#2a2d38"), 0.65, 0)); g.add(micAt(0, -0.2, Math.PI), box(0.3, 0.05, 0.2, c("#2a2d38"), 0.4, 0.77, 0), box(0.28, 0.01, 0.18, c("#1d2029"), 0.4, 0.82, 0)); return g; }, { blocks: true });
mk("mesa_sofa", "Sofá de entrevista duplo", 1.8, 0.9, () => grp(box(1.8, 0.4, 0.8, c("#3d4460"), 0, 0), box(1.8, 0.5, 0.2, c("#3d4460"), 0, 0.4, -0.3), box(0.2, 0.25, 0.8, c("#323a5c"), -0.8, 0.4, 0), box(0.2, 0.25, 0.8, c("#323a5c"), 0.8, 0.4, 0), box(0.8, 0.1, 0.55, c("#4a5270"), -0.42, 0.4, 0.05), box(0.8, 0.1, 0.55, c("#4a5270"), 0.42, 0.4, 0.05)), { blocks: true });
mk("cadeira_pod", "Cadeira de estúdio com apoio", 0.6, 0.6, () => grp(cyl(0.25, 0.25, 0.06, c("#2a2d38"), 0, 0.5, 0, 14), cyl(0.03, 0.03, 0.5, c("#5d6273"), 0, 0, 0, 8), cyl(0.2, 0.22, 0.03, c("#5d6273"), 0, 0, 0, 12), box(0.4, 0.3, 0.05, c("#2a2d38"), 0, 0.6, -0.22)), { blocks: false });
mk("banqueta_pod", "Banqueta alta de entrevista", 0.5, 0.5, () => grp(cyl(0.2, 0.2, 0.06, c("#e0874a"), 0, 0.68, 0, 14), cyl(0.02, 0.02, 0.68, c("#2a2d38"), 0, 0, 0, 8), cyl(0.2, 0.22, 0.02, c("#2a2d38"), 0, 0, 0, 12), cyl(0.12, 0.12, 0.01, c("#2a2d38"), 0, 0.3, 0, 12)), { blocks: false });
// ---------- equipamento de som
for (const [k, n] of [["4", 4], ["8", 8]] as const)
  mk(`mesa_pod_${k}`, `Mesa de mixagem de podcast ${k} canais`, 0.5, 0.4, () => { const g = grp(box(0.1 + n * 0.05, 0.05, 0.3, c("#2a2d38"), 0, 0)); for (let i = 0; i < n; i++) { g.add(box(0.02, 0.012, 0.1, c("#c9ced8"), -0.05 * (n - 1) / 2 + i * 0.05, 0.05, 0.03), ball(0.011, c(["#d9534f", "#3b6fc0", "#f2c14e", "#4fae4a"][i % 4]), -0.05 * (n - 1) / 2 + i * 0.05, 0.062, -0.08)); } g.add(box(0.12, 0.004, 0.08, screenMat("chart"), 0.05 * n / 2 - 0.01, 0.05, -0.06)); return g; }, { tabletop: true, idle: true });
mk("interface_audio", "Interface de áudio", 0.3, 0.2, () => grp(box(0.2, 0.05, 0.13, c("#c0392b"), 0, 0), ball(0.015, c("#1d2029"), -0.05, 0.05, 0.03), ball(0.015, c("#1d2029"), 0.0, 0.05, 0.03), ball(0.008, g$("#c8f501"), 0.06, 0.05, -0.04)), { tabletop: true });
for (const k of COL) mk(`fone_${k}`, `Fone de estúdio ${k}`, 0.3, 0.3, () => grp(cyl(0.05, 0.06, 0.02, c("#2a2d38"), 0, 0, 0, 12), cyl(0.012, 0.012, 0.2, c("#2a2d38"), 0, 0.02, 0, 6), cylX(0.05, 0.14, c(COLORS[k]), 0, 0.2, 0, 14), cylX(0.025, 0.03, c("#2a2d38"), -0.08, 0.2, 0, 10), cylX(0.025, 0.03, c("#2a2d38"), 0.08, 0.2, 0, 10)), { tabletop: true });
mk("monitor_retorno", "Monitor de retorno de palco", 0.5, 0.4, () => grp(box(0.45, 0.2, 0.3, c("#2a2d38"), 0, 0).rotateX(0), box(0.35, 0.06, 0.02, c("#1d2029"), 0, 0.1, 0.16), cylZ(0.05, 0.01, c("#1d2029"), 0, 0.1, 0.153, 12)), { tabletop: true });
mk("rack_pod", "Rack de áudio com sinal", 0.6, 0.5, () => { const g = grp(box(0.55, 1.0, 0.45, c("#2a2d38"), 0, 0)); for (let i = 0; i < 5; i++) g.add(box(0.5, 0.1, 0.02, c("#4a5270"), 0, 0.1 + i * 0.17, 0.235), ball(0.008, g$(["#c8f501", "#ff4fa3", "#5ec8ff"][i % 3]), 0.2, 0.15 + i * 0.17, 0.25)); return g; }, { blocks: true, idle: true });
mk("case_estudio", "Case de transporte de equipamentos", 0.8, 0.5, () => grp(box(0.8, 0.45, 0.5, c("#2a2d38"), 0, 0), box(0.82, 0.03, 0.52, c("#c9ced8"), 0, 0.2), box(0.1, 0.06, 0.02, c("#c9ced8"), 0, 0.32, 0.26), box(0.1, 0.12, 0.03, c("#5d6273"), -0.3, 0.02, 0.26), box(0.1, 0.12, 0.03, c("#5d6273"), 0.3, 0.02, 0.26)));
mk("pedal_pod", "Controle de pedal e botões de cena", 0.3, 0.2, () => grp(box(0.3, 0.04, 0.14, c("#2a2d38"), 0, 0), ...[0, 1, 2, 3].map((i) => box(0.05, 0.015, 0.04, c(["#d9534f", "#c8f501", "#5ec8ff", "#f2c14e"][i]), -0.105 + i * 0.07, 0.04, 0))), { tabletop: true });
mk("sino_pod", "Ampulheta de tempo de fala", 0.2, 0.2, () => grp(cyl(0.05, 0.05, 0.01, c("#2a2d38"), 0, 0, 0, 10), cyl(0.04, 0.005, 0.07, glass, 0, 0.01, 0, 10), cyl(0.005, 0.04, 0.07, glass, 0, 0.08, 0, 10), cyl(0.05, 0.05, 0.01, c("#2a2d38"), 0, 0.15, 0, 10), cyl(0.02, 0.005, 0.03, c("#e0b04a"), 0, 0.01, 0, 8)), { tabletop: true });
mk("planta_pod", "Vaso de planta de fundo", 0.5, 0.5, () => grp(cyl(0.2, 0.15, 0.4, c("#eceae4"), 0, 0, 0, 12), ...[0, 1, 2, 3, 4].map((i) => ball(0.17, c(["#2f8a3e", "#3f9a4a", "#4fae4a"][i % 3]), Math.cos(i * 1.3) * 0.15, 0.6 + (i % 3) * 0.15, Math.sin(i * 1.3) * 0.15))), { blocks: false });
void BLACK; void STEEL; void DARK; void GREY; void WHITE;
