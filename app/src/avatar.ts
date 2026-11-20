import * as THREE from "three";
import { toon } from "./toon";

/** Aparência do personagem. Tudo em voxels para casar com o pixel art. */
export interface Look {
  skin: string;
  hair: string;
  hairColor: string;
  top: string;
  topColor: string;
  bottom: string;
  bottomColor: string;
  shoes: string;
  head: string;
  headColor: string;
  face: string;
  neck: string;
}

export const OPTIONS = {
  hair: [
    ["curto", "Curto"],
    ["degrade", "Degradê"],
    ["moicano", "Moicano"],
    ["afro", "Black power"],
    ["longo", "Longo"],
    ["coque", "Coque"],
    ["trancas", "Tranças"],
    ["careca", "Careca"],
  ],
  top: [
    ["camiseta", "Camiseta"],
    ["oversized", "Oversized"],
    ["moletom", "Moletom"],
    ["jaqueta", "Jaqueta"],
    ["regata", "Regata"],
    ["camisa", "Camisa"],
  ],
  bottom: [
    ["calca", "Calça"],
    ["cargo", "Cargo"],
    ["bermuda", "Bermuda"],
    ["saia", "Saia"],
  ],
  head: [
    ["nenhum", "Nada"],
    ["bone", "Boné"],
    ["bone_tras", "Boné p/ trás"],
    ["gorro", "Gorro"],
    ["fone", "Headphone"],
    ["bandana", "Bandana"],
  ],
  face: [
    ["nenhum", "Nada"],
    ["oculos", "Óculos"],
    ["oculos_sol", "Óculos escuros"],
  ],
  neck: [
    ["nenhum", "Nada"],
    ["corrente", "Corrente"],
  ],
} as const;

export const PALETTES = {
  skin: ["#f6d7b8", "#eac09a", "#d39a6a", "#b0764a", "#8a5532", "#5e3a22"],
  hair: ["#141414", "#3b2416", "#6b4226", "#c79a4a", "#e8e0d0", "#b23a2e", "#C8F501", "#5b6cff"],
  cloth: ["#0D0D0D", "#f2f2f2", "#C8F501", "#2b2b30", "#5c6470", "#1f3a5f", "#7a1f2b", "#3e5b2f", "#c47a2c", "#d9c8a8", "#6b3fa0", "#e2577a"],
};

export function randomLook(): Look {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
  return {
    skin: pick(PALETTES.skin),
    hair: pick(OPTIONS.hair)[0],
    hairColor: pick(PALETTES.hair.slice(0, 5)),
    top: pick(OPTIONS.top)[0],
    topColor: pick(PALETTES.cloth),
    bottom: pick(["calca", "cargo", "bermuda"]),
    bottomColor: pick(["#0D0D0D", "#2b2b30", "#1f3a5f", "#d9c8a8", "#5c6470"]),
    shoes: pick(["#f2f2f2", "#0D0D0D", "#C8F501"]),
    head: pick(["nenhum", "nenhum", "bone", "bone_tras", "gorro"]),
    headColor: pick(PALETTES.cloth),
    face: pick(["nenhum", "nenhum", "oculos", "oculos_sol"]),
    neck: pick(["nenhum", "corrente"]),
  };
}

/** Garante que um look vindo da rede tem todos os campos. */
export function normalizeLook(l: any, fallbackColor = "#C8F501"): Look {
  const base: Look = {
    skin: PALETTES.skin[1],
    hair: "curto",
    hairColor: "#141414",
    top: "camiseta",
    topColor: fallbackColor,
    bottom: "calca",
    bottomColor: "#0D0D0D",
    shoes: "#f2f2f2",
    head: "nenhum",
    headColor: "#0D0D0D",
    face: "nenhum",
    neck: "nenhum",
  };
  return { ...base, ...(l && typeof l === "object" ? l : {}) };
}

function mat(color: string, emissive = false) {
  return toon(color, emissive ? { emissive: 0.5 } : {});
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
function vox(parent: THREE.Object3D, color: string, w: number, h: number, d: number, x: number, y: number, z: number, glow = false) {
  const m = new THREE.Mesh(boxGeo, mat(color, glow));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function shade(hex: string, f: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return "#" + c.getHexString();
}

export interface Character {
  root: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
}

/**
 * Personagem voxel (~1,5 m). Frente = +Z.
 * Pernas e braços ficam em pivôs (quadril/ombro) para a animação de andar.
 */
export function buildCharacter(look: Look): Character {
  const root = new THREE.Group();
  const L = look;
  const neon = L.topColor.toUpperCase() === "#C8F501";
  const shortLegs = L.bottom === "bermuda" || L.bottom === "saia";

  // ---- pernas
  const mkLeg = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.52, 0);
    const bottomLen = shortLegs ? 0.22 : 0.44;
    vox(g, L.bottomColor, 0.17, bottomLen, 0.18, 0, -bottomLen / 2, 0);
    if (shortLegs) vox(g, L.skin, 0.13, 0.22, 0.14, 0, -0.33, 0);
    if (L.bottom === "cargo") vox(g, shade(L.bottomColor, 0.8), 0.04, 0.12, 0.12, x > 0 ? 0.1 : -0.1, -0.24, 0.01);
    vox(g, L.shoes, 0.19, 0.09, 0.26, 0, -0.475, 0.035);
    vox(g, shade(L.shoes, 0.7), 0.2, 0.025, 0.27, 0, -0.515, 0.035);
    root.add(g);
    return g;
  };
  const legL = mkLeg(-0.1);
  const legR = mkLeg(0.1);
  if (L.bottom === "saia") vox(root, L.bottomColor, 0.46, 0.24, 0.3, 0, 0.44, 0);

  // ---- tronco
  const wide = L.top === "oversized" || L.top === "moletom" || L.top === "jaqueta";
  const tw = wide ? 0.5 : 0.44;
  vox(root, L.topColor, tw, 0.5, 0.26, 0, 0.78, 0, neon);
  if (L.top === "jaqueta") {
    vox(root, "#e9e9e9", 0.1, 0.46, 0.02, 0, 0.78, 0.135); // camiseta por dentro
    vox(root, shade(L.topColor, 0.75), 0.03, 0.46, 0.02, -0.065, 0.78, 0.136);
    vox(root, shade(L.topColor, 0.75), 0.03, 0.46, 0.02, 0.065, 0.78, 0.136);
  }
  if (L.top === "moletom") {
    vox(root, shade(L.topColor, 0.85), 0.42, 0.18, 0.12, 0, 1.06, -0.16); // capuz
    vox(root, shade(L.topColor, 0.8), 0.28, 0.14, 0.02, 0, 0.66, 0.135); // bolso
  }
  if (L.top === "camisa") {
    vox(root, "#f2f2f2", 0.16, 0.06, 0.02, 0, 1.0, 0.135);
    for (let i = 0; i < 3; i++) vox(root, shade(L.topColor, 0.6), 0.03, 0.03, 0.02, 0, 0.92 - i * 0.12, 0.136);
  }
  if (L.top === "regata") vox(root, L.skin, 0.2, 0.08, 0.02, 0, 1.0, 0.132);
  // logo VERKZ na camiseta preta (detalhe de marca)
  if (L.topColor === "#0D0D0D" && (L.top === "camiseta" || L.top === "oversized")) vox(root, "#C8F501", 0.1, 0.07, 0.02, 0, 0.88, 0.135, true);
  if (L.neck === "corrente") {
    vox(root, "#d9b44a", 0.2, 0.025, 0.02, 0, 0.98, 0.136, false);
    vox(root, "#d9b44a", 0.05, 0.06, 0.02, 0, 0.94, 0.137, false);
  }

  // ---- braços
  const sleeve = L.top === "regata" ? 0 : L.top === "camiseta" || L.top === "oversized" ? 0.18 : 0.4;
  const mkArm = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 1.0, 0);
    const len = 0.46;
    if (sleeve > 0) vox(g, L.topColor, 0.13, sleeve, 0.16, 0, -sleeve / 2, 0, neon);
    vox(g, L.skin, 0.11, len - sleeve, 0.13, 0, -sleeve - (len - sleeve) / 2, 0);
    root.add(g);
    return g;
  };
  const armL = mkArm(-(tw / 2 + 0.07));
  const armR = mkArm(tw / 2 + 0.07);

  // ---- cabeça
  const head = new THREE.Group();
  head.position.set(0, 1.25, 0);
  root.add(head);
  vox(head, L.skin, 0.42, 0.4, 0.4, 0, 0, 0);
  vox(head, "#141414", 0.07, 0.09, 0.02, -0.09, 0.0, 0.205);
  vox(head, "#141414", 0.07, 0.09, 0.02, 0.09, 0.0, 0.205);
  vox(head, "#ffffff", 0.025, 0.03, 0.02, -0.075, 0.02, 0.212);
  vox(head, "#ffffff", 0.025, 0.03, 0.02, 0.105, 0.02, 0.212);
  vox(head, shade(L.skin, 0.85), 0.06, 0.04, 0.03, 0, -0.07, 0.205);
  vox(head, L.skin, 0.06, 0.1, 0.08, -0.22, 0, 0);
  vox(head, L.skin, 0.06, 0.1, 0.08, 0.22, 0, 0);

  const hc = L.hairColor;
  const capOn = L.head === "bone" || L.head === "bone_tras" || L.head === "gorro";
  switch (L.hair) {
    case "curto":
      vox(head, hc, 0.44, 0.1, 0.42, 0, 0.21, -0.01);
      vox(head, hc, 0.44, 0.22, 0.08, 0, 0.1, -0.18);
      vox(head, hc, 0.04, 0.16, 0.3, -0.21, 0.1, -0.04);
      vox(head, hc, 0.04, 0.16, 0.3, 0.21, 0.1, -0.04);
      break;
    case "degrade":
      vox(head, hc, 0.43, 0.08, 0.41, 0, 0.21, 0);
      vox(head, shade(hc, 1.15), 0.44, 0.1, 0.08, 0, 0.15, -0.17);
      break;
    case "moicano":
      if (!capOn) vox(head, hc, 0.1, 0.16, 0.42, 0, 0.27, -0.01);
      break;
    case "afro":
      vox(head, hc, 0.56, 0.32, 0.52, 0, 0.24, -0.04);
      vox(head, hc, 0.06, 0.2, 0.36, -0.24, 0.06, -0.06);
      vox(head, hc, 0.06, 0.2, 0.36, 0.24, 0.06, -0.06);
      break;
    case "longo":
      vox(head, hc, 0.46, 0.12, 0.44, 0, 0.21, -0.01);
      vox(head, hc, 0.46, 0.58, 0.1, 0, -0.06, -0.19);
      vox(head, hc, 0.05, 0.5, 0.3, -0.225, -0.02, -0.04);
      vox(head, hc, 0.05, 0.5, 0.3, 0.225, -0.02, -0.04);
      vox(head, hc, 0.44, 0.08, 0.06, 0, 0.17, 0.19);
      break;
    case "coque":
      vox(head, hc, 0.44, 0.1, 0.42, 0, 0.21, -0.01);
      vox(head, hc, 0.44, 0.22, 0.08, 0, 0.1, -0.18);
      if (!capOn) vox(head, hc, 0.18, 0.16, 0.16, 0, 0.32, -0.06);
      break;
    case "trancas":
      vox(head, hc, 0.44, 0.1, 0.42, 0, 0.21, -0.01);
      for (let i = -2; i <= 2; i++) vox(head, hc, 0.06, 0.5, 0.06, i * 0.09, -0.08, -0.2);
      break;
    case "careca":
    default:
      break;
  }

  // ---- acessórios de cabeça
  const ac = L.headColor;
  if (L.head === "bone" || L.head === "bone_tras") {
    vox(head, ac, 0.45, 0.14, 0.43, 0, 0.24, 0);
    const back = L.head === "bone_tras";
    vox(head, shade(ac, 0.8), 0.4, 0.035, 0.2, 0, 0.18, back ? -0.3 : 0.3);
    vox(head, "#C8F501", 0.08, 0.05, 0.02, 0, 0.25, back ? -0.216 : 0.216, true);
  } else if (L.head === "gorro") {
    vox(head, ac, 0.46, 0.2, 0.44, 0, 0.26, 0);
    vox(head, shade(ac, 0.75), 0.47, 0.06, 0.45, 0, 0.17, 0);
  } else if (L.head === "fone") {
    vox(head, "#1a1a1a", 0.5, 0.05, 0.08, 0, 0.27, 0);
    vox(head, "#1a1a1a", 0.04, 0.2, 0.08, -0.25, 0.16, 0);
    vox(head, "#1a1a1a", 0.04, 0.2, 0.08, 0.25, 0.16, 0);
    vox(head, ac, 0.08, 0.16, 0.16, -0.25, 0.0, 0, ac === "#C8F501");
    vox(head, ac, 0.08, 0.16, 0.16, 0.25, 0.0, 0, ac === "#C8F501");
  } else if (L.head === "bandana") {
    vox(head, ac, 0.44, 0.08, 0.42, 0, 0.14, 0);
    vox(head, ac, 0.06, 0.12, 0.06, 0.05, 0.1, -0.24);
  }

  // ---- rosto
  if (L.face === "oculos" || L.face === "oculos_sol") {
    const lens = L.face === "oculos_sol" ? "#0a0a0a" : "#9fd6ff";
    vox(head, "#111111", 0.4, 0.03, 0.02, 0, 0.04, 0.215);
    vox(head, "#111111", 0.12, 0.1, 0.02, -0.09, 0.0, 0.214);
    vox(head, "#111111", 0.12, 0.1, 0.02, 0.09, 0.0, 0.214);
    vox(head, lens, 0.09, 0.07, 0.02, -0.09, 0.0, 0.222);
    vox(head, lens, 0.09, 0.07, 0.02, 0.09, 0.0, 0.222);
  }

  return { root, legL, legR, armL, armR };
}

/** Cor principal do look (usada no anel e na lista de pessoas). */
export function lookColor(l: Look) {
  return l.topColor === "#0D0D0D" ? "#C8F501" : l.topColor;
}
