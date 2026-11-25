import * as THREE from "three";
import { box, c, cyl, grp } from "./lib";
import { anim, APPS, BODIES, LEDS, ledBox, mk, Scr, screenMesh } from "./x";

const CAT = "Monitores ultrawide";
/** Tela curva: faixa de painéis em arco (R em metros; 0 = plana). Devolve o grupo e a lista de telas. */
export function curved(w: number, h: number, R: number, body: THREE.Material, kinds: string[], a: string, b: string, scr: Scr[], y0 = 0.1) {
  const g = new THREE.Group();
  const seg = R ? 11 : 1;
  const sw = w / seg;
  for (let i = 0; i < seg; i++) {
    const u = ((i + 0.5) / seg - 0.5) * w;
    const ang = R ? u / R : 0;
    const x = R ? R * Math.sin(ang) : u;
    const z = R ? R * (1 - Math.cos(ang)) : 0;
    const part = new THREE.Group();
    part.add(box(sw * 1.04, h, 0.035, body, 0, 0, 0));
    part.add(screenMesh(sw * 0.98 - 0.012, h - 0.024, kinds, a, b, 0, 0.012, 0.019, scr, [i, seg]));
    part.position.set(x, y0, z);
    part.rotation.y = -ang;
    g.add(part);
  }
  return g;
}
function stand(body: THREE.Material, w: number, R: number) {
  const z = R ? -0.01 : -0.03;
  return grp(box(w * 0.34, 0.012, 0.2, body, 0, 0, 0.0), box(0.05, 0.2, 0.03, body, 0, 0.012, z));
}
const SIZES: [string, number, number][] = [["29", 0.78, 0.33], ["34", 0.92, 0.38], ["38", 1.02, 0.41], ["49 super", 1.3, 0.4]];
const CURVES: [string, number][] = [["plano", 0], ["curvo 1800R", 1.8], ["curvo 1000R", 1.0]];
for (const [sn, w, h] of SIZES)
  for (const [cn, R] of CURVES)
    for (const [bn, bh] of BODIES)
      for (let v = 0; v < 2; v++) {
        mk("ultra", CAT, `${sn.replace(" ", "")}_${cn.replace(" ", "")}_${bn}_${v}`, `Ultrawide ${sn}" ${cn} ${bn}${v ? " (jogo)" : ""}`, w + 0.1, 0.3, () => {
          const scr: Scr[] = [];
          const body = c(bh);
          const kinds = v ? ["video", "map", "cam"] : ["code", "chart", "doc"];
          const g = grp(stand(body, w, R), curved(w, h, R, body, kinds, "#5ec8ff", "#c8f501", scr, 0.2));
          return anim(g, { scr });
        }, { use: "screen", tabletop: true });
      }
// versões gamer com barra de LED (rainbow ao usar)
for (const [sn, w, h] of SIZES)
  for (const [cn, R] of CURVES.slice(1))
    for (const [ln, lh] of LEDS) {
      mk("ultra", CAT, `gamer_${sn.replace(" ", "")}_${cn.replace(" ", "")}_${ln}`, `Ultrawide gamer ${sn}" ${cn} LED ${ln}`, w + 0.1, 0.3, () => {
        const scr: Scr[] = [];
        const leds: THREE.MeshBasicMaterial[] = [];
        const body = c("#1d2029");
        const g = grp(stand(body, w, R), curved(w, h, R, body, ["video", "map", "chart"], lh, "#ffffff", scr, 0.2));
        g.add(ledBox(w * 0.9, 0.012, 0.012, lh, 0, 0.2 - h / 2 - 0.02, R ? R * (1 - Math.cos(w * 0.45 / R)) : 0, leds));
        g.add(ledBox(0.05, 0.05, 0.012, lh, 0, 0.2 - h / 2 - 0.04, -0.045, leds));
        return anim(g, { scr, leds });
      }, { use: "screen", tabletop: true });
    }
// braços duplos de ultrawide
for (const [bn, bh] of BODIES.slice(0, 4))
  for (const [cn, R] of CURVES.slice(1)) {
    mk("ultra", CAT, `duplo_${cn.replace(" ", "")}_${bn}`, `Dois ultrawide 34" ${cn} ${bn}`, 1.9, 0.3, () => {
      const scr: Scr[] = [];
      const body = c(bh);
      const g = grp(box(0.06, 0.46, 0.05, c("#5d6273"), 0, 0, -0.06), box(0.28, 0.012, 0.16, c("#5d6273"), 0, 0, -0.04));
      for (const s of [-1, 1]) {
        const m = curved(0.92, 0.38, R, body, s < 0 ? ["code", "chart"] : ["video", "dash"], "#5ec8ff", "#c8f501", scr, 0.3);
        m.position.x = s * 0.49;
        m.rotation.y = -s * 0.18;
        g.add(m);
      }
      return anim(g, { scr });
    }, { use: "screen", tabletop: true });
  }
void cyl; void APPS; void box;
