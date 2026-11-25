import * as THREE from "three";
import { box, c, cylZ, grp, WHITE } from "./lib";
import { anim, mk, Scr, screenMesh, slug } from "./x";

const CAT = "MacBooks e Apple-style";
const COLS: [string, string][] = [["prata", "#d7d9dd"], ["cinza-espacial", "#6d7078"], ["meia-noite", "#2b3340"], ["estelar", "#ece3d3"], ["azul-ceu", "#a9c2da"]];
const MODELS: [string, number, number][] = [["Air 13", 0.34, 0.235], ["Air 15", 0.39, 0.27], ["Pro 14", 0.36, 0.25], ["Pro 16", 0.41, 0.28]];
const SETS: [string, string[]][] = [["código", ["code", "chat", "doc"]], ["vídeo", ["video", "cam", "map"]], ["documentos", ["doc", "dash", "chart"]]];
for (const [mn, w, d] of MODELS)
  for (const [cn, ch] of COLS) {
    for (const [sn, kinds] of SETS)
      mk("mac", CAT, `${mn.replace(" ", "")}_${cn}_${slug(sn).slice(0, 3)}`, `MacBook ${mn} ${cn} aberto (${sn})`, w + 0.04, d + 0.06, () => {
        const scr: Scr[] = [];
        const b = c(ch);
        const lid = grp(box(w, d * 0.93, 0.012, b, 0, 0), screenMesh(w - 0.025, d * 0.93 - 0.025, kinds, "#5ec8ff", "#c8f501", 0, 0.012, 0.007, scr), box(0.05, 0.008, 0.004, c("#101215"), 0, d * 0.93 - 0.018, 0.0085));
        lid.position.set(0, 0.012, -d / 2 + 0.01);
        lid.rotation.x = -0.2;
        const g = grp(box(w, 0.012, d, b, 0, 0), box(w * 0.82, 0.003, d * 0.28, c("#15181e"), 0, 0.012, -d * 0.08), box(w * 0.28, 0.003, d * 0.28, c("#c9ccd2"), 0, 0.012, d * 0.3), lid);
        return anim(g, { scr });
      }, { tabletop: true, use: "screen" });
    mk("mac", CAT, `${mn.replace(" ", "")}_${cn}_fechado`, `MacBook ${mn} ${cn} fechado`, w + 0.02, d + 0.02, () => grp(box(w, 0.016, d, c(ch), 0, 0), box(0.04, 0.003, 0.04, c("#f2f0ea"), 0, 0.016, 0)), { tabletop: true, idle: false, tick: undefined });
  }
// iMac 24 (7 cores), Mac mini / Studio, Studio Display, Pro Display
const IMAC: [string, string][] = [["azul", "#7aa7e0"], ["verde", "#8fd1a4"], ["rosa", "#f0a5bd"], ["prata", "#d7d9dd"], ["amarelo", "#f2d26b"], ["laranja", "#f0a068"], ["roxo", "#b49be0"]];
for (const [cn, ch] of IMAC)
  mk("mac", CAT, `imac_${cn}`, `iMac 24" ${cn}`, 0.6, 0.22, () => {
    const scr: Scr[] = [];
    const b = c(ch);
    const g = grp(box(0.22, 0.012, 0.16, b, 0, 0), box(0.04, 0.2, 0.02, b, 0, 0.012, -0.02), box(0.58, 0.36, 0.02, b, 0, 0.18), box(0.54, 0.29, 0.006, c("#101215"), 0, 0.215, 0.012), screenMesh(0.52, 0.27, ["dash", "video", "code"], "#ff7aa8", "#ffd35c", 0, 0.225, 0.016, scr), box(0.58, 0.07, 0.021, b, 0, 0.18));
    return anim(g, { scr });
  }, { tabletop: true, use: "screen" });
for (const [mn, w, h, d] of [["Mac mini", 0.2, 0.04, 0.2], ["Mac Studio", 0.2, 0.1, 0.2]] as const)
  for (const [cn, ch] of COLS.slice(0, 4))
    mk("mac", CAT, `${mn.replace(" ", "")}_${cn}`, `${mn} ${cn}`, w + 0.02, d + 0.02, () => grp(box(w, h, d, c(ch), 0, 0), box(0.02, 0.004, 0.004, c("#8fe9a4"), 0.07, h * 0.4, d / 2 + 0.001)), { tabletop: true, idle: false, tick: undefined });
for (const [nn, w, h, ch] of [["Studio Display", 0.64, 0.38, "#c9ced8"], ["Pro Display XDR", 0.8, 0.45, "#e8e6df"], ["Display 5K grafite", 0.7, 0.4, "#2f3240"]] as const)
  for (const v of [0, 1])
    mk("mac", CAT, `disp_${nn.replace(/ /g, "").toLowerCase()}_${v}`, `${nn}${v ? " (vídeo)" : ""}`, w + 0.04, 0.22, () => {
      const scr: Scr[] = [];
      const b = c(ch);
      const g = grp(box(0.22, 0.012, 0.18, b, 0, 0), box(0.06, 0.22, 0.02, b, 0, 0.012, -0.03), box(w, h, 0.022, b, 0, 0.22), screenMesh(w - 0.03, h - 0.03, v ? ["video", "cam", "map"] : ["doc", "dash", "chart"], "#5ec8ff", "#c8f501", 0, 0.23, 0.012, scr));
      return anim(g, { scr });
    }, { tabletop: true, use: "screen" });
for (const [cn, ch] of COLS)
  mk("mac", CAT, `ipad_${cn}`, `Tablet pro ${cn} com teclado`, 0.3, 0.24, () => {
    const scr: Scr[] = [];
    const t = grp(box(0.28, 0.2, 0.008, c(ch), 0, 0), screenMesh(0.26, 0.18, ["video", "doc", "code"], "#ff7aa8", "#ffd35c", 0, 0.01, 0.005, scr));
    t.position.set(0, 0.03, -0.05);
    t.rotation.x = -0.4;
    return anim(grp(box(0.28, 0.012, 0.18, c("#2a2d38"), 0, 0, 0.02), t), { scr });
  }, { tabletop: true, use: "screen" });
void WHITE; void cylZ; void THREE;
