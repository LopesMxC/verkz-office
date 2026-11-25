import { BLACK, box, c, cyl, DARK, grp, STEEL, g$, CHROME, reg, WHITE, cylZ, GREY, WOODS, glass, ball, cone, artMat, COLORS } from "./lib";
import * as THREE from "three";

const CAT = "Decoração e plantas";
type X = Partial<import("./lib").PackDef>;
function mk(id: string, label: string, w: number, d: number, build: () => THREE.Object3D, x: X = {}) {
  reg({ id: "pk_dec_" + id, cat: CAT, label, w, d, blocks: false, build, ...x });
}
const G = ["#4fae4a", "#7fcf5a", "#2f8a3e", "#3f9a4a", "#5fbf6a"];
const pot = (hex: string, r = 0.2, h = 0.34, shape: "cone" | "cyl" | "square" = "cone") => shape === "square" ? grp(box(r * 2, h, r * 2, c(hex), 0, 0), box(r * 1.8, 0.03, r * 1.8, c("#6a4a2a"), 0, h - 0.02)) : grp(cyl(r, r * 0.75, h, c(hex), 0, 0, 0, 10), cyl(r * 0.92, r * 0.92, 0.03, c("#6a4a2a"), 0, h - 0.02, 0, 10));
const leaf = (len: number, wd: number, hex: string, ry: number, rx: number, y: number) => { const l = box(wd, 0.012, len, c(hex), 0, 0, len / 2); const p = grp(l); p.position.y = y; p.rotation.set(rx, ry, 0); return p; };
const POTS = [["terracota", "#c76a3d"], ["branco", "#eceae4"], ["grafite", "#3d4460"], ["mostarda", "#e0b04a"], ["verde-sálvia", "#8fa88c"]] as const;
const P = (i: number) => POTS[i % POTS.length];
function tuft(n: number, len: number, wd: number, y: number, hexes: string[], rx = -0.9) { const g = grp(); for (let i = 0; i < n; i++) g.add(leaf(len, wd, hexes[i % hexes.length], (i / n) * Math.PI * 2, rx + (i % 3) * 0.15, y)); return g; }

const plants: [string, string, number, () => THREE.Object3D][] = [
  ["Samambaia", "fern", 0.6, () => grp(pot(P(0)[1]), tuft(14, 0.5, 0.08, 0.34, G, -0.7))],
  ["Costela-de-adão", "monstera", 0.8, () => grp(pot(P(1)[1], 0.24, 0.4), tuft(9, 0.5, 0.34, 0.6, ["#2f8a3e", "#3f9a4a"], -0.6), cyl(0.02, 0.02, 0.3, c("#3f7a3a"), 0, 0.4, 0, 6))],
  ["Figueira lira", "lyrata", 0.7, () => grp(pot(P(2)[1], 0.24, 0.4), cyl(0.03, 0.035, 1.0, c("#8a6a4a"), 0, 0.4, 0, 6), ...[0, 1, 2, 3, 4, 5].map((i) => ball(0.16, c(G[i % 3]), Math.cos(i * 1.2) * 0.2, 0.9 + i * 0.13, Math.sin(i * 1.2) * 0.2)))],
  ["Seringueira", "rubber", 0.6, () => grp(pot(P(3)[1], 0.2, 0.34), cyl(0.03, 0.035, 0.9, c("#6a4a2a"), 0, 0.34, 0, 6), ...[0, 1, 2, 3, 4].map((i) => ball(0.14, c("#2f6a3a"), Math.cos(i * 1.4) * 0.16, 0.8 + i * 0.12, Math.sin(i * 1.4) * 0.16)))],
  ["Espada-de-são-jorge", "snake", 0.5, () => { const g = grp(pot(P(1)[1], 0.18, 0.3, "square")); for (let i = 0; i < 7; i++) g.add(box(0.05, 0.5 + (i % 3) * 0.15, 0.02, c(i % 2 ? "#3f9a4a" : "#2f6a3a"), Math.cos(i * 0.9) * 0.08, 0.3, Math.sin(i * 0.9) * 0.06)); return g; }],
  ["Zamioculca", "zz", 0.6, () => grp(pot(P(2)[1], 0.2, 0.3), tuft(9, 0.45, 0.1, 0.5, ["#2f8a3e", "#3f9a4a"], -1.1), cyl(0.02, 0.02, 0.3, c("#3f7a3a"), 0, 0.3, 0, 6))],
  ["Palmeira areca", "areca", 0.9, () => grp(pot(P(0)[1], 0.26, 0.4), tuft(12, 0.9, 0.08, 0.9, G, -0.4), cyl(0.04, 0.04, 0.5, c("#6a8a3a"), 0, 0.4, 0, 6))],
  ["Palmeira kentia", "kentia", 0.9, () => grp(pot(P(1)[1], 0.26, 0.4), cyl(0.035, 0.04, 1.3, c("#8a7a4a"), 0, 0.4, 0, 6), tuft(8, 0.7, 0.1, 1.7, G, -0.35))],
  ["Bambu-da-sorte", "lucky", 0.4, () => { const g = grp(cyl(0.12, 0.12, 0.2, glass, 0, 0, 0, 10)); for (let i = 0; i < 4; i++) g.add(cyl(0.015, 0.015, 0.4 + i * 0.1, c("#6fbf5a"), -0.04 + i * 0.03, 0.05, (i % 2) * 0.04, 6), ball(0.04, c("#4fae4a"), -0.04 + i * 0.03, 0.5 + i * 0.1, 0)); return g; }],
  ["Oliveira", "olive", 0.9, () => grp(pot(P(0)[1], 0.28, 0.45), cyl(0.04, 0.05, 1.0, c("#7a6a4a"), 0, 0.45, 0, 6), ...[0, 1, 2, 3, 4, 5].map((i) => ball(0.2, c(i % 2 ? "#7a9a6a" : "#8fb07a"), Math.cos(i * 1.1) * 0.22, 1.35 + (i % 3) * 0.12, Math.sin(i * 1.1) * 0.22)))],
  ["Bonsai", "bonsai", 0.4, () => grp(box(0.3, 0.06, 0.2, c("#3d4460"), 0, 0), cyl(0.02, 0.03, 0.2, c("#6a4a2a"), 0, 0.06, 0, 6), ball(0.1, c("#2f8a3e"), -0.04, 0.28), ball(0.08, c("#4fae4a"), 0.07, 0.24), ball(0.07, c("#3f9a4a"), 0, 0.34))],
  ["Orquídea", "orquidea", 0.35, () => grp(pot("#eceae4", 0.1, 0.16), tuft(3, 0.22, 0.07, 0.14, ["#2f8a3e"], -0.8), cyl(0.008, 0.008, 0.4, c("#6a8a3a"), 0, 0.14, 0, 5), ...[0, 1, 2, 3, 4].map((i) => ball(0.035, c(["#ff7aa8", "#f2f0ea", "#c78aff"][0]), 0.02 * (i % 2), 0.28 + i * 0.07, 0.02)))],
  ["Suculentas", "suculenta", 0.4, () => grp(box(0.34, 0.1, 0.2, c("#3d4460"), 0, 0), ...[0, 1, 2, 3].map((i) => tuft(8, 0.08, 0.05, 0.14, [["#8fbf7a", "#6fa88c", "#a0c88a", "#7fb0a0"][i]], -0.5).translateX(-0.12 + i * 0.08).translateZ((i % 2) * 0.03)))],
  ["Babosa", "aloe", 0.5, () => grp(pot(P(0)[1], 0.16, 0.26), ...[0, 1, 2, 3, 4, 5].map((i) => { const b = box(0.06, 0.34, 0.03, c("#7fb07a"), 0, 0.24, 0); b.rotation.set(0, i, 0.3); b.position.set(Math.cos(i) * 0.06, 0.3, Math.sin(i) * 0.06); return b; }))],
  ["Cacto coluna", "cacto_col", 0.5, () => grp(pot(P(0)[1], 0.16, 0.24), cyl(0.07, 0.07, 0.7, c("#4f9a4a"), 0, 0.24, 0, 8), cyl(0.04, 0.04, 0.2, c("#4f9a4a"), 0.11, 0.5, 0, 6), cyl(0.04, 0.04, 0.2, c("#4f9a4a"), -0.1, 0.6, 0, 6))],
  ["Cacto bola", "cacto_bola", 0.4, () => grp(pot(P(3)[1], 0.12, 0.18), ball(0.12, c("#4f9a4a"), 0, 0.3), ball(0.025, c("#ff7aa8"), 0, 0.43))],
  ["Jiboia suspensa", "jiboia", 0.5, () => { const g = grp(pot(P(1)[1], 0.15, 0.2), tuft(8, 0.15, 0.1, 0.2, G, -0.4)); for (let i = 0; i < 4; i++) g.add(box(0.015, 0.5 + i * 0.12, 0.015, c("#3f9a4a"), Math.cos(i * 1.6) * 0.12, -0.3 - i * 0.12, Math.sin(i * 1.6) * 0.12)); return g.translateY(0.7); }],
  ["Lavanda", "lavanda", 0.4, () => grp(pot(P(2)[1], 0.14, 0.2), ...[0, 1, 2, 3, 4, 5].map((i) => grp(cyl(0.006, 0.006, 0.25, c("#6a9a5a"), 0, 0.2, 0, 4), box(0.03, 0.1, 0.03, c("#a78bd9"), 0, 0.42, 0)).translateX(Math.cos(i * 1.1) * 0.07).translateZ(Math.sin(i * 1.1) * 0.07)))],
  ["Lírio-da-paz", "lirio", 0.55, () => grp(pot(P(1)[1], 0.17, 0.26), tuft(10, 0.4, 0.1, 0.26, ["#2f8a3e", "#3f9a4a"], -0.8), ...[0, 1].map((i) => grp(cyl(0.006, 0.006, 0.3, c("#3f9a4a"), -0.05 + i * 0.1, 0.3, 0, 4), box(0.07, 0.12, 0.015, c("#f2f0ea"), -0.05 + i * 0.1, 0.6, 0))))],
  ["Topiaria bola", "topiaria", 0.6, () => grp(pot(P(2)[1], 0.2, 0.36, "square"), cyl(0.025, 0.025, 0.7, c("#6a4a2a"), 0, 0.36, 0, 6), ball(0.26, c("#3f9a4a"), 0, 1.15))],
];
for (const [name, id, w, b] of plants) mk("planta_" + id, name, w, w, b, { blocks: id !== "orquidea" && id !== "bonsai" && id !== "suculenta" && id !== "lucky" && id !== "cacto_bola" && id !== "lavanda" ? true : false, ...(["orquidea", "bonsai", "suculenta", "lucky", "cacto_bola"].includes(id) ? { tabletop: true } : {}) } as X);

// quadros de parede com arte pixel (10): molduras diferentes
const frames: [string, number, number, number, string][] = [
  ["Quadro paisagem preto", 0, 0.8, 0.6, "#2a2d38"], ["Quadro paisagem madeira", 1, 0.8, 0.6, WOODS.nogueira], ["Quadro vertical branco", 2, 0.5, 0.7, "#f2f0ea"], ["Quadro quadrado lima", 3, 0.6, 0.6, "#c8f501"],
  ["Quadro grande preto", 4, 1.2, 0.8, "#2a2d38"], ["Quadro abstrato madeira", 6, 0.7, 0.9, WOODS.carvalho], ["Quadro abstrato branco", 7, 0.9, 0.6, "#f2f0ea"], ["Quadro abstrato grafite", 8, 0.6, 0.8, "#5d6273"], ["Quadro paisagem dourado", 5, 0.8, 0.6, "#e0b04a"], ["Quadro tríptico", 9, 0.4, 0.6, "#2a2d38"],
];
frames.forEach(([name, art, w, h, hex], i) => mk("quadro_" + i, name, w + 0.1, 0.1, () => { const g = grp(box(w, h, 0.04, c(hex), 0, 0), box(w - 0.1, h - 0.1, 0.006, artMat(art), 0, 0.05, 0.022)); if (name.includes("tríptico")) { g.add(box(w, h, 0.04, c(hex), 0.5, 0), box(w - 0.1, h - 0.1, 0.006, artMat(art + 1), 0.5, 0.05, 0.022), box(w, h, 0.04, c(hex), -0.5, 0), box(w - 0.1, h - 0.1, 0.006, artMat(art + 2), -0.5, 0.05, 0.022)); } return g; }, { mount: "wall" }));
// relógios de parede (3): ponteiros andam
function clockFace(hex: string, r: number, face: string, square = false) {
  const g = grp(square ? box(r * 2, r * 2, 0.04, c(hex), 0, -r) : cyl(r, r, 0.04, c(hex), 0, 0, 0, 24).rotateX(Math.PI / 2), square ? box(r * 1.8, r * 1.8, 0.008, c(face), 0, -r * 0.9, 0.022) : cyl(r * 0.9, r * 0.9, 0.008, c(face), 0, 0, 0.022, 24).rotateX(Math.PI / 2));
  const hand = (len: number, th: number, name: string) => { const p = new THREE.Group(); p.name = name; const b = box(th, len, 0.01, c("#1d2029"), 0, 0, 0.03); p.add(b); p.position.set(0, square ? -r : 0, 0); return p; };
  g.add(hand(r * 0.55, 0.02, "hh"), hand(r * 0.8, 0.012, "mh"));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.add(box(0.012, 0.03, 0.006, c("#2a2d38"), Math.sin(a) * r * 0.78, (square ? -r : 0) + Math.cos(a) * r * 0.78 - 0.015, 0.03)); }
  return g;
}
const clockTick = (g: THREE.Object3D, t: number) => { const d = new Date(); const s = d.getSeconds() + d.getMilliseconds() / 1000; const m = d.getMinutes() + s / 60; const h = (d.getHours() % 12) + m / 60; const hh = g.getObjectByName("hh"); const mh = g.getObjectByName("mh"); if (hh) hh.rotation.z = -(h / 12) * Math.PI * 2; if (mh) mh.rotation.z = -(m / 60) * Math.PI * 2; void t; };
mk("relogio_redondo", "Relógio redondo preto", 0.5, 0.1, () => clockFace("#2a2d38", 0.25, "#f2f0ea"), { mount: "wall", idle: true, tick: clockTick });
mk("relogio_madeira", "Relógio de madeira", 0.5, 0.1, () => clockFace(WOODS.nogueira, 0.25, "#e6d9b8"), { mount: "wall", idle: true, tick: clockTick });
mk("relogio_quadrado", "Relógio quadrado lima", 0.5, 0.1, () => clockFace("#c8f501", 0.25, "#1d2029", true), { mount: "wall", idle: true, tick: clockTick });
// globos (2), troféus (3), vasos (3), livros (2)
for (const [k, hex] of [["clássico", "#4a7fb0"], ["escuro", "#2a2d38"]] as const)
  mk("globo_" + k, "Globo " + k, 0.3, 0.3, () => grp(cyl(0.1, 0.12, 0.03, c("#3a2a22"), 0, 0, 0, 10), cyl(0.012, 0.012, 0.16, c("#b08a3a"), 0, 0.03, 0, 6), ball(0.12, c(hex), 0, 0.28), box(0.02, 0.2, 0.2, c("#b08a3a"), 0, 0.28)), { tabletop: true });
for (const [k, hex] of [["ouro", "#f2c14e"], ["prata", "#c9ced8"], ["bronze", "#c07a3a"]] as const)
  mk("trofeu_" + k, "Troféu " + k, 0.25, 0.25, () => grp(box(0.14, 0.04, 0.14, c("#3a2a22"), 0, 0), cyl(0.012, 0.012, 0.1, c(hex), 0, 0.04, 0, 6), cyl(0.07, 0.03, 0.1, c(hex), 0, 0.14, 0, 10), box(0.03, 0.06, 0.012, c(hex), 0.08, 0.16, 0), box(0.03, 0.06, 0.012, c(hex), -0.08, 0.16, 0)), { tabletop: true });
for (const [k, hex, shape] of [["azul", "#3b6fc0", 0], ["branco", "#eceae4", 1], ["laranja", "#e0874a", 2]] as const)
  mk("vaso_" + k, "Vaso decorativo " + k, 0.3, 0.3, () => grp(shape === 0 ? cyl(0.1, 0.1, 0.4, c(hex), 0, 0, 0, 12) : shape === 1 ? ball(0.16, c(hex), 0, 0.2) : cyl(0.12, 0.06, 0.34, c(hex), 0, 0, 0, 12), ...[0, 1, 2].map((i) => box(0.01, 0.3, 0.01, c("#6a8a3a"), -0.03 + i * 0.03, shape === 1 ? 0.32 : 0.36, 0).rotateZ((i - 1) * 0.25))));
for (const [k, n] of [["pilha", 4], ["pilha alta", 7]] as const)
  mk("livros_" + k.replace(" ", "_"), "Pilha de livros " + k, 0.3, 0.25, () => { const g = grp(); for (let i = 0; i < n; i++) g.add(box(0.24 - (i % 3) * 0.02, 0.04, 0.17, c(["#d9534f", "#3b6fc0", "#f2c14e", "#4fae4a", "#8a6cc9", "#e0874a", "#f2f0ea"][i % 7]), (i % 2) * 0.01, i * 0.042)); return g; }, { tabletop: true });
// esculturas (3), espelhos (2), pôsteres (3)
mk("escultura_bola", "Escultura esferas", 0.4, 0.4, () => grp(cyl(0.15, 0.15, 0.3, c("#f2f0ea"), 0, 0, 0, 12), ball(0.14, c("#c8f501"), 0, 0.42), ball(0.09, c("#ff4fa3"), 0.1, 0.6), ball(0.06, c("#5ec8ff"), -0.08, 0.7)), { blocks: true });
mk("escultura_abstrata", "Escultura abstrata", 0.4, 0.4, () => grp(box(0.3, 0.3, 0.3, c("#2a2d38"), 0, 0), box(0.14, 0.4, 0.14, c("#e0874a"), 0, 0.3).rotateY(0.6), box(0.1, 0.1, 0.35, c("#c8f501"), 0, 0.55).rotateY(-0.5)), { blocks: true });
mk("escultura_gato", "Estátua de gato", 0.3, 0.3, () => grp(box(0.16, 0.2, 0.12, c("#2a2d38"), 0, 0), ball(0.08, c("#2a2d38"), 0, 0.26), cone(0.025, 0.05, c("#2a2d38"), -0.045, 0.31, 0, 4), cone(0.025, 0.05, c("#2a2d38"), 0.045, 0.31, 0, 4), box(0.03, 0.2, 0.03, c("#2a2d38"), 0.1, 0.02, -0.06).rotateZ(0.3), ball(0.012, g$("#c8f501"), -0.03, 0.27, 0.07), ball(0.012, g$("#c8f501"), 0.03, 0.27, 0.07)), { tabletop: true });
for (const [k, hex, round] of [["redondo", "#c9ced8", true], ["alto", "#8e93a3", false]] as const)
  mk("espelho_" + k, "Espelho " + k, 0.8, 0.1, () => round ? grp(cyl(0.4, 0.4, 0.04, c(WOODS.nogueira), 0, 0, 0, 24).rotateX(Math.PI / 2), cyl(0.37, 0.37, 0.01, c("#bfe0ee"), 0, 0, 0.022, 24).rotateX(Math.PI / 2)) : grp(box(0.6, 1.6, 0.04, c("#2a2d38"), 0, 0), box(0.54, 1.54, 0.01, c("#bfe0ee"), 0, 0.03, 0.022)), { mount: "wall" });
for (const [i, hex] of ["#c8f501", "#ff7aa8", "#5ec8ff"].entries())
  mk("poster_" + i, "Pôster " + ["lima", "rosa", "ciano"][i], 0.5, 0.05, () => grp(box(0.5, 0.7, 0.01, c("#f2f0ea"), 0, 0), box(0.4, 0.4, 0.012, c(hex), 0, 0.22), box(0.3, 0.03, 0.012, c("#2a2d38"), 0, 0.1), box(0.2, 0.02, 0.012, c("#8e93a3"), 0, 0.05), box(0.51, 0.015, 0.015, c("#2a2d38"), 0, 0.7), box(0.51, 0.015, 0.015, c("#2a2d38"), 0, -0.01)), { mount: "wall" });
// tapetes (4)
for (const [k, shape, hex, hex2] of [["redondo cinza", "r", "#8e93a3", "#c9ced8"], ["listrado", "s", "#e0b04a", "#3d4460"], ["geométrico", "g", "#3b6fc0", "#c8f501"], ["retangular lima", "x", "#2a2d38", "#c8f501"]] as const)
  mk("tapete_" + k.split(" ")[0], "Tapete " + k, shape === "r" ? 2.0 : 2.4, shape === "r" ? 2.0 : 1.6, () => { if (shape === "r") return grp(cyl(1.0, 1.0, 0.02, c(hex), 0, 0, 0, 32), cyl(0.7, 0.7, 0.022, c(hex2), 0, 0, 0, 32), cyl(0.4, 0.4, 0.024, c(hex), 0, 0, 0, 32)); const g = grp(box(2.4, 0.02, 1.6, c(hex), 0, 0)); for (let i = 0; i < 6; i++) g.add(shape === "s" ? box(2.4, 0.022, 0.12, c(hex2), 0, 0, -0.7 + i * 0.28) : shape === "g" ? box(0.4, 0.022, 0.4, c(hex2), -1 + (i % 3) * 1.0, 0, -0.4 + Math.floor(i / 3) * 0.8) : box(2.2, 0.022, 0.03, c(hex2), 0, 0, -0.7 + i * 0.28)); return g; }, { });
// aquário
mk("aquario", "Aquário com peixes", 1.0, 0.5, () => { const fish = (hex: string, n: string) => { const f = grp(box(0.07, 0.04, 0.03, c(hex), 0, 0), box(0.03, 0.05, 0.01, c(hex), -0.05, 0)); f.name = n; return f; }; const g = grp(box(0.9, 0.5, 0.4, c("#2a2d38"), 0, 0), box(0.86, 0.4, 0.36, glass, 0, 0.55), box(0.86, 0.05, 0.36, c("#e6d9b8"), 0, 0.55), fish("#ff7a3b", "f0"), fish("#5ec8ff", "f1"), fish("#c8f501", "f2"), cone(0.05, 0.2, c("#2f8a3e"), -0.3, 0.6, 0, 5), cone(0.04, 0.16, c("#3f9a4a"), 0.3, 0.6, 0.05, 5)); return g; }, { idle: true, blocks: true, tick: (g, t) => { g.children.forEach((k) => { if (k.name.startsWith("f")) { const i = +k.name[1]; k.position.set(Math.sin(t * (0.5 + i * 0.2) + i * 2) * 0.32, 0.75 + i * 0.07, 0.05 + Math.cos(t * 0.5 + i) * 0.1); k.rotation.y = Math.cos(t * (0.5 + i * 0.2) + i * 2) > 0 ? 0 : Math.PI; } }); } });
void BLACK; void DARK; void STEEL; void CHROME; void WHITE; void GREY; void COLORS; void cylZ;
