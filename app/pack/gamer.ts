import * as THREE from "three";
import { box, c, cyl, cylZ, grp, g$ } from "./lib";
import { anim, fan, LEDS, led, ledBox, mk, Scr, screenMesh } from "./x";
import { curved } from "./ultra";
import { toon } from "../src/toon";

const CAT = "PCs gamer funcionais";
type Parts = { fans: THREE.Object3D[]; leds: THREE.MeshBasicMaterial[] };
const glassM = () => toon("#9fd8ef", { transparent: true, opacity: 0.28 });
/** Gabinetes: cada um é uma função (cor do LED, partes animadas) -> grupo. */
const CASES: [string, number, number, (h: string, p: Parts) => THREE.Object3D][] = [
  ["Torre vidro", 0.26, 0.5, (h, p) => {
    const b = c("#1d2029");
    const g = grp(box(0.22, 0.46, 0.46, b, 0, 0), box(0.215, 0.4, 0.004, glassM(), 0, 0.03, 0.233), ledBox(0.2, 0.012, 0.01, h, 0, 0.4, 0.236, p.leds), box(0.16, 0.05, 0.3, c("#2f3240"), 0, 0.1, 0.0));
    for (let i = 0; i < 3; i++) g.add(fan(0.05, h, 0, 0.1 + i * 0.13, 0.236, p.fans, p.leds));
    g.add(ledBox(0.01, 0.04, 0.2, h, 0.111, 0.1, 0, p.leds));
    return g;
  }],
  ["Torre mesh", 0.26, 0.5, (h, p) => {
    const g = grp(box(0.22, 0.46, 0.46, c("#2a2d38"), 0, 0), box(0.18, 0.4, 0.006, c("#1d2029"), 0, 0.03, 0.233));
    for (let i = 0; i < 8; i++) g.add(box(0.18, 0.004, 0.008, c("#3d4460"), 0, 0.06 + i * 0.047, 0.236));
    g.add(ledBox(0.012, 0.4, 0.01, h, -0.1, 0.03, 0.238, p.leds), fan(0.07, h, 0, 0.22, 0.24, p.fans, p.leds));
    return g;
  }],
  ["Cubo ITX", 0.34, 0.34, (h, p) => {
    const g = grp(box(0.3, 0.3, 0.3, c("#2a2d38"), 0, 0), box(0.12, 0.014, 0.014, c("#8e93a3"), 0, 0.31, 0), ledBox(0.26, 0.012, 0.01, h, 0, 0.02, 0.152, p.leds));
    g.add(fan(0.095, h, 0, 0.15, 0.152, p.fans, p.leds));
    return g;
  }],
  ["Aquário", 0.42, 0.34, (h, p) => {
    const g = grp(box(0.38, 0.44, 0.3, c("#1d2029"), 0, 0), box(0.36, 0.4, 0.004, glassM(), 0, 0.02, 0.153), box(0.004, 0.4, 0.28, glassM(), 0.191, 0.02, 0));
    for (let i = 0; i < 2; i++) g.add(fan(0.06, h, -0.1 + i * 0.2, 0.1 + i * 0.14, 0.155, p.fans, p.leds));
    g.add(ledBox(0.02, 0.3, 0.012, h, 0.15, 0.06, 0.152, p.leds), box(0.2, 0.06, 0.2, c("#3d4460"), -0.04, 0.02, 0));
    return g;
  }],
  ["Torre alta", 0.28, 0.54, (h, p) => {
    const g = grp(box(0.24, 0.66, 0.5, c("#1d2029"), 0, 0), box(0.2, 0.6, 0.004, glassM(), 0, 0.03, 0.253), ledBox(0.22, 0.012, 0.01, h, 0, 0.58, 0.256, p.leds));
    for (let i = 0; i < 4; i++) g.add(fan(0.05, h, 0, 0.1 + i * 0.14, 0.256, p.fans, p.leds));
    return g;
  }],
  ["Retrô bege", 0.26, 0.5, (h, p) => {
    const g = grp(box(0.22, 0.44, 0.44, c("#d9d2bd"), 0, 0), box(0.16, 0.02, 0.01, c("#8e8a7a"), 0, 0.3, 0.226), box(0.16, 0.02, 0.01, c("#8e8a7a"), 0, 0.26, 0.226), box(0.06, 0.03, 0.01, c("#b5ad94"), -0.05, 0.1, 0.226), ledBox(0.014, 0.014, 0.01, h, 0.06, 0.1, 0.228, p.leds), ledBox(0.03, 0.02, 0.01, h, 0.06, 0.06, 0.228, p.leds));
    return g;
  }],
  ["Sakura branca", 0.26, 0.5, (h, p) => {
    const g = grp(box(0.22, 0.46, 0.46, c("#f2f0ea"), 0, 0), box(0.215, 0.4, 0.004, glassM(), 0, 0.03, 0.233), ledBox(0.2, 0.012, 0.01, h, 0, 0.4, 0.236, p.leds));
    for (let i = 0; i < 3; i++) g.add(fan(0.05, h, 0, 0.1 + i * 0.13, 0.236, p.fans, p.leds));
    for (const [x, y] of [[-0.06, 0.1], [0.05, 0.2], [-0.03, 0.3]]) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), c("#ffc2d4")).translateX(x).translateY(y).translateZ(0.24));
    return g;
  }],
  ["Bancada aberta", 0.4, 0.4, (h, p) => {
    const g = grp(box(0.36, 0.012, 0.36, c("#2a2d38"), 0, 0), box(0.012, 0.4, 0.012, c("#8e93a3"), -0.17, 0, -0.17), box(0.012, 0.4, 0.012, c("#8e93a3"), 0.17, 0, -0.17), box(0.34, 0.012, 0.012, c("#8e93a3"), 0, 0.4, -0.17));
    g.add(box(0.2, 0.04, 0.22, c("#2f3240"), 0, 0.15, 0), box(0.28, 0.1, 0.03, c("#1d2029"), 0, 0.012, 0.12), ledBox(0.26, 0.01, 0.012, h, 0, 0.02, 0.14, p.leds));
    for (let i = 0; i < 2; i++) g.add(fan(0.065, h, -0.07 + i * 0.14, 0.26, -0.12, p.fans, p.leds));
    return g;
  }],
];
for (const [cn, w, d, fn] of CASES)
  for (const [ln, lh] of LEDS)
    for (let v = 0; v < 2; v++)
      mk("pcg", CAT, `${cn}_${ln}_${v}`.replace(/[^a-z0-9_]/gi, "").toLowerCase() + `_${CASES.findIndex((x) => x[0] === cn)}`, `PC gamer ${cn} LED ${ln}${v ? " + placa vertical" : ""}`, w, d, () => {
        const p: Parts = { fans: [], leds: [] };
        const g = fn(lh, p) as THREE.Group;
        if (v) { const gpu = ledBox(0.02, 0.26, 0.012, lh, 0.085, 0.07, 0.13, p.leds); g.add(box(0.03, 0.26, 0.16, c("#2f3240"), 0.075, 0.07, 0.1), gpu); }
        return anim(g, { fans: p.fans, leds: p.leds });
      }, { tabletop: true, use: "screen" });
// setups completos: ultrawide curvo + torre + teclado RGB + tapete
CASES.forEach(([cn, , , fn], ci) => {
  for (const [ln, lh] of LEDS.slice(0, 6)) {
    mk("pcg", CAT, `setup_${ci}_${ln}`, `Setup gamer ${cn} LED ${ln}`, 1.5, 0.5, () => {
      const p: Parts = { fans: [], leds: [] };
      const scr: Scr[] = [];
      const g = grp(box(1.05, 0.004, 0.42, c("#1d2029"), -0.15, 0, 0.1), ledBox(1.05, 0.006, 0.006, lh, -0.15, 0, 0.31, p.leds));
      const body = c("#1d2029");
      g.add(grp(box(0.3, 0.012, 0.2, body, 0, 0), box(0.05, 0.2, 0.03, body, 0, 0.012, -0.04)).translateX(-0.15).translateZ(-0.06), curved(0.92, 0.38, 1.8, body, ["video", "map", "cam"], lh, "#ffffff", scr, 0.22).translateX(-0.15).translateZ(-0.06));
      g.add(box(0.36, 0.02, 0.12, c("#1d2029"), -0.2, 0.004, 0.22), box(0.32, 0.006, 0.09, g$(lh), -0.2, 0.024, 0.22), box(0.05, 0.025, 0.08, c("#1d2029"), 0.12, 0.004, 0.22));
      const t = fn(lh, p);
      t.position.set(0.58, 0, 0);
      t.scale.setScalar(0.75);
      g.add(t);
      return anim(g, { fans: p.fans, leds: p.leds, scr });
    }, { tabletop: true, use: "screen" });
  }
});
// notebooks gamer (10 modelos x 6 LEDs)
const NB: [string, string][] = [["Predador", "#1d2029"], ["Legião", "#2a2d38"], ["Nitro", "#3d4460"], ["Blade", "#101215"], ["Zephyr", "#f2f0ea"], ["Strix", "#24325a"], ["Titan", "#4a4f5e"], ["Katana", "#5a1d24"], ["Vector", "#2f4a3a"], ["Stealth", "#8e93a3"]];
for (const [nn, nh] of NB)
  for (const [ln, lh] of LEDS.slice(0, 6)) {
    mk("pcg", CAT, `nb_${nn.toLowerCase()}_${ln}`, `Notebook gamer ${nn} LED ${ln}`, 0.42, 0.32, () => {
      const scr: Scr[] = [];
      const leds: THREE.MeshBasicMaterial[] = [];
      const b = c(nh);
      const lid = grp(box(0.38, 0.25, 0.015, b, 0, 0), screenMeshLocal(scr, lh));
      lid.position.set(0, 0.015, -0.14);
      lid.rotation.x = -0.2;
      const g = grp(box(0.38, 0.018, 0.28, b, 0, 0), box(0.3, 0.004, 0.1, c("#101215"), 0, 0.018, 0.02), ledBox(0.3, 0.004, 0.006, lh, 0, 0.019, -0.1, leds), ledBox(0.36, 0.006, 0.006, lh, 0, 0.004, 0.14, leds), lid);
      return anim(g, { scr, leds });
    }, { tabletop: true, use: "screen" });
  }
function screenMeshLocal(scr: Scr[], a: string) {
  return screenMesh(0.35, 0.22, ["video", "map", "code"], a, "#ffffff", 0, 0.015, 0.009, scr);
}
// consoles e portáteis (12)
const CON: [string, number, number, string, string][] = [["Console horizontal preto", 0.38, 0.26, "#1d2029", "#5ec8ff"], ["Console horizontal branco", 0.38, 0.26, "#f2f0ea", "#c8f501"], ["Console vertical branco", 0.14, 0.3, "#f2f0ea", "#5ec8ff"], ["Console vertical preto", 0.14, 0.3, "#1d2029", "#ff4fa3"], ["Console cubo roxo", 0.26, 0.26, "#8a6cc9", "#ffd23c"], ["Console retrô cinza", 0.34, 0.26, "#b9bcc8", "#d9534f"], ["Console retrô preto", 0.34, 0.26, "#2a2d38", "#d9534f"], ["Mini PC console lima", 0.24, 0.24, "#1d2029", "#c8f501"]];
for (const [cn, w, d, bh, lh] of CON)
  mk("pcg", CAT, `console_${cn.toLowerCase().replace(/[^a-z]/g, "")}`, cn, w, d, () => {
    const leds: THREE.MeshBasicMaterial[] = [];
    const vertical = cn.includes("vertical");
    const g = vertical ? grp(box(0.1, 0.28, 0.2, c(bh), 0, 0), ledBox(0.01, 0.2, 0.01, lh, 0.052, 0.04, 0.05, leds)) : grp(box(w - 0.04, 0.07, d - 0.04, c(bh), 0, 0), ledBox(w - 0.1, 0.008, 0.006, lh, 0, 0.03, (d - 0.04) / 2 + 0.002, leds), box(0.1, 0.004, 0.1, c("#2f3240"), 0, 0.07, 0));
    return anim(g, { leds });
  }, { tabletop: true });
for (const [cn, hh] of [["verde", "#4fae4a"], ["vermelho", "#d9534f"], ["azul", "#3b6fc0"], ["preto", "#1d2029"]] as const)
  mk("pcg", CAT, `handheld_${cn}`, `Portátil gamer ${cn}`, 0.3, 0.14, () => {
    const scr: Scr[] = [];
    const g = grp(box(0.3, 0.03, 0.13, c(hh), 0, 0), box(0.04, 0.045, 0.13, c("#1d2029"), -0.17, 0, 0), box(0.04, 0.045, 0.13, c("#1d2029"), 0.17, 0, 0), screenMesh(0.2, 0.011, ["video", "map", "cam"], "#5ec8ff", "#c8f501", 0, 0.03, 0, scr));
    return anim(g, { scr });
  }, { tabletop: true, use: "screen" });
void cyl; void cylZ; void led;
