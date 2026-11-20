import * as THREE from "three";
import { toon } from "./toon";

/** Aparência do personagem. Tudo em voxels para casar com o pixel art. */
export interface Look {
  /** Corpo: "m" (masculino) ou "f" (feminino). */
  body: string;
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
  beard: string;
  ears: string;
  eyes: string;
  /** Usa automaticamente o acessório da data especial (Natal, Halloween...). */
  eventSkin: boolean;
}

export const OPTIONS = {
  body: [
    ["m", "Masculino"],
    ["f", "Feminino"],
  ],
  hair: [
    ["curto", "Curto"],
    ["degrade", "Degradê"],
    ["moicano", "Moicano"],
    ["afro", "Black power"],
    ["longo", "Longo"],
    ["coque", "Coque"],
    ["trancas", "Tranças"],
    ["rabo", "Rabo de cavalo"],
    ["cacheado", "Cacheado"],
    ["franja", "Franja"],
    ["chanel", "Chanel"],
    ["maria", "Maria-chiquinha"],
    ["topete", "Topete"],
    ["careca", "Careca"],
  ],
  top: [
    ["camiseta", "Camiseta"],
    ["oversized", "Oversized"],
    ["moletom", "Moletom"],
    ["jaqueta", "Jaqueta"],
    ["regata", "Regata"],
    ["camisa", "Camisa"],
    ["polo", "Polo"],
    ["terno", "Terno"],
    ["cropped", "Cropped"],
    ["vestido", "Vestido"],
    ["colete", "Colete"],
  ],
  bottom: [
    ["calca", "Calça"],
    ["cargo", "Cargo"],
    ["bermuda", "Bermuda"],
    ["saia", "Saia"],
    ["short", "Short"],
    ["legging", "Legging"],
  ],
  head: [
    ["nenhum", "Nada"],
    ["bone", "Boné"],
    ["bone_tras", "Boné p/ trás"],
    ["gorro", "Gorro"],
    ["fone", "Headphone"],
    ["bandana", "Bandana"],
    ["chapeu", "Chapéu"],
    ["tiara", "Tiara"],
    ["papai_noel", "Gorro de Natal"],
    ["bruxa", "Chapéu de bruxa"],
    ["palha", "Chapéu de palha"],
    ["coelho", "Orelhas de coelho"],
    ["festa", "Chapéu de festa"],
  ],
  face: [
    ["nenhum", "Nada"],
    ["oculos", "Óculos"],
    ["oculos_sol", "Óculos escuros"],
    ["oculos_redondo", "Óculos redondos"],
    ["mascara", "Máscara de carnaval"],
  ],
  neck: [
    ["nenhum", "Nada"],
    ["corrente", "Corrente"],
    ["gravata", "Gravata"],
    ["cachecol", "Cachecol"],
    ["colar", "Colar de pérolas"],
  ],
  beard: [
    ["nenhum", "Nada"],
    ["barba", "Barba"],
    ["cavanhaque", "Cavanhaque"],
    ["bigode", "Bigode"],
    ["rala", "Barba rala"],
  ],
  ears: [
    ["nenhum", "Nada"],
    ["brinco", "Brincos"],
    ["argola", "Argolas"],
    ["piercing", "Piercing"],
  ],
  eyes: [
    ["normal", "Normal"],
    ["cilios", "Com cílios"],
    ["feliz", "Felizes"],
    ["serio", "Sérios"],
  ],
} as const;

export const PALETTES = {
  skin: ["#f6d7b8", "#eac09a", "#d39a6a", "#b0764a", "#8a5532", "#5e3a22"],
  hair: ["#141414", "#3b2416", "#6b4226", "#c79a4a", "#e8e0d0", "#b23a2e", "#C8F501", "#5b6cff"],
  cloth: ["#0D0D0D", "#f2f2f2", "#C8F501", "#2b2b30", "#5c6470", "#1f3a5f", "#7a1f2b", "#3e5b2f", "#c47a2c", "#d9c8a8", "#6b3fa0", "#e2577a"],
};

export function randomLook(): Look {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
  const body = pick(["m", "f"]);
  return {
    body,
    beard: body === "m" ? pick(["nenhum", "nenhum", "barba", "rala", "cavanhaque"]) : "nenhum",
    ears: body === "f" ? pick(["brinco", "argola", "nenhum"]) : pick(["nenhum", "nenhum", "piercing"]),
    eyes: body === "f" ? "cilios" : "normal",
    eventSkin: true,
    skin: pick(PALETTES.skin),
    hair: body === "f" ? pick(["longo", "rabo", "cacheado", "chanel", "coque", "trancas", "maria"]) : pick(["curto", "degrade", "moicano", "afro", "topete", "cacheado", "careca"]),
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
    body: "m",
    beard: "nenhum",
    ears: "nenhum",
    eyes: "normal",
    eventSkin: true,
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
/**
 * Peças da cabeça (cabelo, boné, óculos) costumam encostar face com face e piscam ("z-fighting").
 * Cada peça nova ganha um fio de tamanho diferente (0,8 mm em ciclo), o que separa as faces sem mudar o visual.
 */
let voxSeq = 0;
function vox(parent: THREE.Object3D, color: string, w: number, h: number, d: number, x: number, y: number, z: number, glow = false) {
  const m = new THREE.Mesh(boxGeo, mat(color, glow));
  const e = parent.name === "head" ? ((voxSeq++ % 7) + 1) * 0.0016 : 0;
  m.scale.set(w + e, h + e, d + e);
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
  head: THREE.Group;
  torso: THREE.Object3D;
  /** Ponto na mão direita para segurar objetos (xícara, copo...). */
  hand: THREE.Group;
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
  const fem = L.body === "f";
  const dress = L.top === "vestido";
  const shortLegs = L.bottom === "bermuda" || L.bottom === "saia" || L.bottom === "short" || dress;

  // ---- pernas
  const mkLeg = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.52, 0);
    const bottomLen = dress ? 0 : L.bottom === "short" ? 0.12 : shortLegs ? 0.22 : 0.44;
    const legColor = L.bottom === "legging" ? shade(L.bottomColor, 0.9) : L.bottomColor;
    const lw = L.bottom === "legging" || fem ? 0.15 : 0.17;
    if (bottomLen) vox(g, legColor, lw, bottomLen, 0.17, 0, -bottomLen / 2, 0);
    if (shortLegs) vox(g, L.skin, 0.13, 0.44 - bottomLen, 0.14, 0, -bottomLen - (0.44 - bottomLen) / 2, 0);
    if (L.bottom === "cargo") vox(g, shade(L.bottomColor, 0.8), 0.04, 0.12, 0.12, x > 0 ? 0.1 : -0.1, -0.24, 0.01);
    vox(g, L.shoes, 0.19, 0.09, 0.26, 0, -0.475, 0.035);
    vox(g, shade(L.shoes, 0.7), 0.2, 0.025, 0.27, 0, -0.515, 0.035);
    root.add(g);
    return g;
  };
  const legL = mkLeg(-0.1);
  const legR = mkLeg(0.1);
  if (L.bottom === "saia" && !dress) vox(root, L.bottomColor, 0.46, 0.24, 0.3, 0, 0.44, 0);
  if (dress) {
    vox(root, L.topColor, 0.5, 0.3, 0.32, 0, 0.42, 0);
    vox(root, shade(L.topColor, 0.85), 0.54, 0.05, 0.34, 0, 0.29, 0);
  }

  // ---- tronco
  const wide = L.top === "oversized" || L.top === "moletom" || L.top === "jaqueta" || L.top === "terno";
  const tw = (wide ? 0.5 : 0.44) - (fem ? 0.04 : 0);
  const torso = vox(root, L.topColor, tw, 0.5, 0.26, 0, 0.78, 0, neon);
  if (L.top === "cropped") {
    torso.scale.y = 0.3;
    torso.position.y = 0.92;
    vox(root, L.skin, tw - 0.04, 0.2, 0.24, 0, 0.68, 0);
    vox(root, L.bottomColor, tw - 0.02, 0.1, 0.25, 0, 0.53, 0);
  }
  if (fem && L.top !== "cropped") vox(root, shade(L.topColor, 0.92), tw - 0.08, 0.1, 0.03, 0, 0.88, 0.13);
  if (L.top === "polo") {
    vox(root, shade(L.topColor, 0.85), 0.24, 0.06, 0.03, 0, 1.0, 0.13);
    vox(root, "#f2f2f2", 0.03, 0.12, 0.02, 0, 0.93, 0.137);
  }
  if (L.top === "terno") {
    vox(root, "#f2f2f2", 0.14, 0.42, 0.02, 0, 0.8, 0.135);
    vox(root, shade(L.topColor, 0.8), 0.04, 0.42, 0.025, -0.08, 0.8, 0.137);
    vox(root, shade(L.topColor, 0.8), 0.04, 0.42, 0.025, 0.08, 0.8, 0.137);
  }
  if (L.top === "colete") {
    vox(root, "#e9e9e9", tw + 0.005, 0.5, 0.255, 0, 0.78, 0);
    vox(root, L.topColor, 0.14, 0.46, 0.27, -tw / 2 + 0.07, 0.78, 0);
    vox(root, L.topColor, 0.14, 0.46, 0.27, tw / 2 - 0.07, 0.78, 0);
  }
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
  if (L.neck === "gravata") {
    vox(root, "#f2f2f2", 0.16, 0.06, 0.02, 0, 1.0, 0.135);
    vox(root, L.headColor === "#0D0D0D" ? "#7a1f2b" : L.headColor, 0.06, 0.3, 0.02, 0, 0.84, 0.14);
  }
  if (L.neck === "cachecol") {
    vox(root, L.headColor, tw - 0.06, 0.08, 0.3, 0, 1.0, 0);
    vox(root, L.headColor, 0.08, 0.2, 0.03, 0.08, 0.9, 0.15);
  }
  if (L.neck === "colar") for (let i = -3; i <= 3; i++) vox(root, "#f4f1e8", 0.03, 0.03, 0.02, i * 0.03, 0.97 - Math.abs(i) * -0.004 - (3 - Math.abs(i)) * 0.012, 0.137);
  if (L.neck === "corrente") {
    vox(root, "#d9b44a", 0.2, 0.025, 0.02, 0, 0.98, 0.136, false);
    vox(root, "#d9b44a", 0.05, 0.06, 0.02, 0, 0.94, 0.137, false);
  }

  // ---- braços
  const sleeve = L.top === "regata" || L.top === "vestido" || L.top === "colete" ? 0 : ["camiseta", "oversized", "polo", "cropped"].includes(L.top) ? 0.18 : 0.4;
  const mkArm = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 1.0, 0);
    const len = 0.46;
    if (sleeve > 0) vox(g, L.topColor, 0.13, sleeve, 0.16, 0, -sleeve / 2, 0, neon);
    vox(g, L.skin, fem ? 0.1 : 0.11, len - sleeve, 0.13, 0, -sleeve - (len - sleeve) / 2, 0);
    root.add(g);
    return g;
  };
  const armL = mkArm(-(tw / 2 + 0.07));
  const armR = mkArm(tw / 2 + 0.07);
  const hand = new THREE.Group();
  hand.position.set(0, -0.46, 0.06);
  armR.add(hand);

  // ---- cabeça
  const head = new THREE.Group();
  head.name = "head";
  head.position.set(0, 1.25, 0);
  root.add(head);
  vox(head, L.skin, 0.42, 0.4, 0.4, 0, 0, 0);
  const eyeH = L.eyes === "feliz" ? 0.035 : L.eyes === "serio" ? 0.05 : 0.09;
  vox(head, "#141414", 0.07, eyeH, 0.02, -0.09, 0.0, 0.205);
  vox(head, "#141414", 0.07, eyeH, 0.02, 0.09, 0.0, 0.205);
  if (L.eyes !== "feliz") {
    vox(head, "#ffffff", 0.025, 0.03, 0.02, -0.075, 0.02 - (0.09 - eyeH) / 3, 0.212);
    vox(head, "#ffffff", 0.025, 0.03, 0.02, 0.105, 0.02 - (0.09 - eyeH) / 3, 0.212);
  }
  if (L.eyes === "cilios" || (fem && L.eyes === "normal")) {
    vox(head, "#141414", 0.03, 0.02, 0.02, -0.135, 0.05, 0.206);
    vox(head, "#141414", 0.03, 0.02, 0.02, 0.135, 0.05, 0.206);
  }
  if (L.eyes === "serio") {
    vox(head, shade(L.hairColor, 1), 0.09, 0.02, 0.02, -0.09, 0.07, 0.206);
    vox(head, shade(L.hairColor, 1), 0.09, 0.02, 0.02, 0.09, 0.07, 0.206);
  }
  vox(head, shade(L.skin, 0.85), 0.06, 0.04, 0.03, 0, -0.07, 0.205);
  const mouth = vox(head, fem ? "#b5485a" : shade(L.skin, 0.6), 0.1, 0.025, 0.02, 0, -0.12, 0.205);
  mouth.name = "mouth";
  if (fem) {
    vox(head, "#f0a3a3", 0.05, 0.03, 0.02, -0.15, -0.06, 0.204);
    vox(head, "#f0a3a3", 0.05, 0.03, 0.02, 0.15, -0.06, 0.204);
  }
  vox(head, L.skin, 0.06, 0.1, 0.08, -0.22, 0, 0);
  vox(head, L.skin, 0.06, 0.1, 0.08, 0.22, 0, 0);

  const hc = L.hairColor;
  if (L.beard === "barba") {
    vox(head, hc, 0.42, 0.14, 0.06, 0, -0.14, 0.18);
    vox(head, hc, 0.06, 0.2, 0.3, -0.2, -0.06, 0.05);
    vox(head, hc, 0.06, 0.2, 0.3, 0.2, -0.06, 0.05);
    vox(head, hc, 0.16, 0.03, 0.02, 0, -0.09, 0.212);
  } else if (L.beard === "cavanhaque") {
    vox(head, hc, 0.12, 0.1, 0.04, 0, -0.16, 0.19);
    vox(head, hc, 0.16, 0.03, 0.02, 0, -0.09, 0.212);
  } else if (L.beard === "bigode") {
    vox(head, hc, 0.18, 0.035, 0.03, 0, -0.09, 0.212);
  } else if (L.beard === "rala") {
    vox(head, shade(L.skin, 0.72), 0.4, 0.12, 0.03, 0, -0.14, 0.196);
  }
  if (L.ears === "brinco") {
    vox(head, "#e8c75a", 0.03, 0.05, 0.03, -0.25, -0.07, 0.02);
    vox(head, "#e8c75a", 0.03, 0.05, 0.03, 0.25, -0.07, 0.02);
  } else if (L.ears === "argola") {
    vox(head, "#e8c75a", 0.02, 0.1, 0.07, -0.255, -0.1, 0.02);
    vox(head, "#e8c75a", 0.02, 0.1, 0.07, 0.255, -0.1, 0.02);
  } else if (L.ears === "piercing") {
    vox(head, "#d8d8d8", 0.025, 0.025, 0.025, -0.25, 0.03, 0.02);
  }
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
    case "rabo":
      vox(head, hc, 0.44, 0.1, 0.42, 0, 0.21, -0.01);
      vox(head, hc, 0.44, 0.22, 0.08, 0, 0.1, -0.18);
      vox(head, hc, 0.12, 0.12, 0.1, 0, 0.18, -0.26);
      vox(head, hc, 0.1, 0.36, 0.08, 0, -0.04, -0.3);
      break;
    case "cacheado":
      for (const [x, y, z, s] of [[-0.16, 0.22, 0.04, 0.16], [0, 0.26, 0.06, 0.18], [0.16, 0.22, 0.04, 0.16], [-0.18, 0.2, -0.14, 0.18], [0.18, 0.2, -0.14, 0.18], [0, 0.24, -0.14, 0.2], [-0.23, 0.04, -0.06, 0.14], [0.23, 0.04, -0.06, 0.14], [0, 0.06, -0.22, 0.2]] as const)
        vox(head, hc, s, s, s, x, y, z);
      break;
    case "franja":
      vox(head, hc, 0.46, 0.12, 0.44, 0, 0.21, -0.01);
      vox(head, hc, 0.44, 0.1, 0.06, 0, 0.12, 0.19);
      vox(head, hc, 0.46, 0.4, 0.1, 0, 0.02, -0.19);
      vox(head, hc, 0.05, 0.36, 0.3, -0.225, 0.03, -0.04);
      vox(head, hc, 0.05, 0.36, 0.3, 0.225, 0.03, -0.04);
      break;
    case "chanel":
      vox(head, hc, 0.48, 0.12, 0.46, 0, 0.21, -0.01);
      vox(head, hc, 0.48, 0.32, 0.12, 0, 0.04, -0.19);
      vox(head, hc, 0.06, 0.3, 0.38, -0.24, 0.04, -0.02);
      vox(head, hc, 0.06, 0.3, 0.38, 0.24, 0.04, -0.02);
      vox(head, hc, 0.2, 0.08, 0.06, -0.11, 0.17, 0.19);
      break;
    case "maria":
      vox(head, hc, 0.44, 0.1, 0.42, 0, 0.21, -0.01);
      vox(head, hc, 0.44, 0.22, 0.08, 0, 0.1, -0.18);
      vox(head, hc, 0.1, 0.3, 0.1, -0.28, 0.0, -0.08);
      vox(head, hc, 0.1, 0.3, 0.1, 0.28, 0.0, -0.08);
      break;
    case "topete":
      vox(head, hc, 0.43, 0.08, 0.41, 0, 0.21, 0);
      if (!capOn) vox(head, hc, 0.3, 0.12, 0.22, 0, 0.29, 0.08);
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
  } else if (L.head === "chapeu") {
    vox(head, ac, 0.62, 0.03, 0.6, 0, 0.21, 0);
    vox(head, ac, 0.4, 0.18, 0.38, 0, 0.31, 0);
    vox(head, shade(ac, 0.6), 0.41, 0.04, 0.39, 0, 0.25, 0);
  } else if (L.head === "tiara") {
    vox(head, ac, 0.46, 0.04, 0.06, 0, 0.23, 0.08);
  } else if (L.head === "papai_noel") {
    vox(head, "#d93a3a", 0.46, 0.16, 0.44, 0, 0.27, 0);
    vox(head, "#d93a3a", 0.3, 0.14, 0.3, 0.04, 0.4, -0.04);
    vox(head, "#d93a3a", 0.16, 0.12, 0.16, 0.12, 0.5, -0.1);
    vox(head, "#ffffff", 0.48, 0.08, 0.46, 0, 0.19, 0);
    vox(head, "#ffffff", 0.1, 0.1, 0.1, 0.2, 0.5, -0.16);
  } else if (L.head === "bruxa") {
    vox(head, "#2a1f3d", 0.66, 0.03, 0.64, 0, 0.21, 0);
    vox(head, "#2a1f3d", 0.34, 0.16, 0.32, 0, 0.3, 0);
    vox(head, "#2a1f3d", 0.22, 0.16, 0.2, 0.03, 0.44, -0.02);
    vox(head, "#2a1f3d", 0.1, 0.14, 0.1, 0.07, 0.57, -0.05);
    vox(head, "#e98a2b", 0.35, 0.04, 0.33, 0, 0.24, 0);
  } else if (L.head === "palha") {
    vox(head, "#e6c46a", 0.66, 0.03, 0.64, 0, 0.21, 0);
    vox(head, "#e6c46a", 0.36, 0.16, 0.34, 0, 0.3, 0);
    vox(head, "#d9534f", 0.37, 0.04, 0.35, 0, 0.25, 0);
  } else if (L.head === "coelho") {
    vox(head, "#f4f1ea", 0.08, 0.32, 0.05, -0.1, 0.38, 0);
    vox(head, "#f4f1ea", 0.08, 0.32, 0.05, 0.1, 0.38, 0);
    vox(head, "#f2a3b8", 0.04, 0.24, 0.02, -0.1, 0.38, 0.03);
    vox(head, "#f2a3b8", 0.04, 0.24, 0.02, 0.1, 0.38, 0.03);
    vox(head, "#f4f1ea", 0.46, 0.04, 0.1, 0, 0.23, 0);
  } else if (L.head === "festa") {
    vox(head, "#C8F501", 0.24, 0.12, 0.24, 0.06, 0.29, 0);
    vox(head, "#C8F501", 0.15, 0.12, 0.15, 0.08, 0.4, 0);
    vox(head, "#C8F501", 0.07, 0.1, 0.07, 0.09, 0.5, 0);
    vox(head, "#ff5aa5", 0.08, 0.08, 0.08, 0.09, 0.58, 0);
  } else if (L.head === "bandana") {
    vox(head, ac, 0.44, 0.08, 0.42, 0, 0.14, 0);
    vox(head, ac, 0.06, 0.12, 0.06, 0.05, 0.1, -0.24);
  }

  // ---- rosto
  if (L.face === "oculos_redondo") {
    vox(head, "#8a6a3a", 0.11, 0.11, 0.02, -0.09, 0.0, 0.214);
    vox(head, "#8a6a3a", 0.11, 0.11, 0.02, 0.09, 0.0, 0.214);
    vox(head, "#cfe9ff", 0.07, 0.07, 0.02, -0.09, 0.0, 0.222);
    vox(head, "#cfe9ff", 0.07, 0.07, 0.02, 0.09, 0.0, 0.222);
  } else if (L.face === "mascara") {
    vox(head, "#8a3ad9", 0.42, 0.11, 0.02, 0, 0.01, 0.214);
    vox(head, "#ffd35c", 0.06, 0.12, 0.02, -0.22, 0.06, 0.214);
    vox(head, "#ffd35c", 0.06, 0.12, 0.02, 0.22, 0.06, 0.214);
  }
  if (L.face === "oculos" || L.face === "oculos_sol") {
    const lens = L.face === "oculos_sol" ? "#0a0a0a" : "#9fd6ff";
    vox(head, "#111111", 0.4, 0.03, 0.02, 0, 0.04, 0.215);
    vox(head, "#111111", 0.12, 0.1, 0.02, -0.09, 0.0, 0.214);
    vox(head, "#111111", 0.12, 0.1, 0.02, 0.09, 0.0, 0.214);
    vox(head, lens, 0.09, 0.07, 0.02, -0.09, 0.0, 0.222);
    vox(head, lens, 0.09, 0.07, 0.02, 0.09, 0.0, 0.222);
  }

  // proporção "chibi" (cabeça grande, corpo curto), como personagens de jogo 2D
  for (const ch of [...root.children]) {
    if (ch === legL || ch === legR || ch === armL || ch === armR || ch === head) continue;
    ch.position.y = 0.32 + (ch.position.y - 0.52) * 0.72;
    ch.scale.y *= 0.72;
  }
  for (const leg of [legL, legR]) {
    leg.scale.y = 0.62;
    leg.position.y = 0.32;
  }
  for (const arm of [armL, armR]) {
    arm.scale.y = 0.72;
    arm.position.y = 0.32 + (1.0 - 0.52) * 0.72;
  }
  head.position.y = 0.97;
  head.scale.setScalar(1.22);

  return { root, head, torso, hand, legL, legR, armL, armR };
}

/** Cor principal do look (usada no anel e na lista de pessoas). */
export function lookColor(l: Look) {
  return l.topColor === "#0D0D0D" ? "#C8F501" : l.topColor;
}
