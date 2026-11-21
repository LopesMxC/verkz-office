import { geo, disposeTree } from "./geo";
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPixelatedPass } from "three/addons/postprocessing/RenderPixelatedPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildItem, buildWall, DEFS, doorJamb, levelView, MOUNT_Y, WALL_MOUNT, footprint, Item, Layout, WALL_CUT, WALL_H, WALL_T, WALL_TYPES, wallRects, wallSegment, WallLinks, Zone } from "./furniture";

/** Largura do vão das portas duplas (as duas folhas juntas), em metros. */
const DOOR_W = 1.3;
import { LOGO_PATH, NEON } from "./logo";
import { icon } from "./icons";
import { pixelTexture, rng, toon } from "./toon";
import { buildCharacter, Character, Look, normalizeLook } from "./avatar";
import { Environment, Holiday } from "./env";
import { foliageMaterials } from "./models";

/** Emotes: nome → emoji e animação. */
export const EMOTES: [string, string, string][] = [
  ["acenar", "👋", "Acenar"],
  ["joinha", "👍", "Joinha"],
  ["palmas", "👏", "Palmas"],
  ["rir", "😂", "Rir"],
  ["coracao", "❤️", "Coração"],
  ["danca", "💃", "Dançar"],
  ["pular", "🎉", "Comemorar"],
  ["pensar", "🤔", "Pensar"],
  ["cafe", "☕", "Pausa"],
  ["fogo", "🔥", "Mandou bem"],
];

/** Itens que o personagem pode segurar (cozinha). */
export const HOLD_ITEMS: Record<string, { label: string; emoji: string; status: string }> = {
  cafe: { label: "Café", emoji: "☕", status: "Tomando um café" },
  agua: { label: "Água", emoji: "🥤", status: "Pausa para a água" },
  lanche: { label: "Lanche", emoji: "🥪", status: "Fazendo um lanche" },
  refri: { label: "Refrigerante", emoji: "🥫", status: "Pausa" },
  marmita: { label: "Marmita", emoji: "🍱", status: "Almoçando" },
};

function holdMesh(kind: string): THREE.Object3D {
  const g = new THREE.Group();
  const m = (c: string) => toon(c);
  const b = (w: number, h: number, d: number, c: string, y = 0) => {
    const x = new THREE.Mesh(geo.box(w, h, d), m(c));
    x.position.y = y;
    g.add(x);
    return x;
  };
  // `fill`: como o conteúdo diminui (o personagem vai bebendo/comendo até acabar)
  if (kind === "cafe") {
    const cup = b(0.1, 0.11, 0.1, "#f2f0ea");
    (cup.material as THREE.MeshToonMaterial).transparent = true;
    (cup.material as THREE.MeshToonMaterial).opacity = 0.92;
    const coffee = b(0.08, 0.01, 0.08, "#5a3a22", 0.055);
    b(0.03, 0.06, 0.02, "#f2f0ea").position.set(0.065, 0, 0);
    g.userData.fill = (lv: number) => (coffee.position.y = -0.045 + 0.1 * lv);
  } else if (kind === "agua") {
    const cup = b(0.08, 0.14, 0.08, "#e8f6fc");
    (cup.material as THREE.MeshToonMaterial).transparent = true;
    (cup.material as THREE.MeshToonMaterial).opacity = 0.35;
    const water = b(0.07, 0.13, 0.07, "#59b8e0");
    g.userData.fill = (lv: number) => {
      water.scale.y = Math.max(0.02, lv);
      water.position.y = -0.065 + 0.065 * lv;
    };
  } else if (kind === "lanche") {
    const parts = [b(0.14, 0.03, 0.1, "#e6c08a"), b(0.14, 0.02, 0.1, "#7fcf5a", 0.025), b(0.14, 0.03, 0.1, "#e6c08a", 0.05)];
    // mordidas: o sanduíche vai encurtando
    g.userData.fill = (lv: number) => parts.forEach((p) => ((p.scale.x = Math.max(0.15, lv)), (p.position.x = -0.07 * (1 - lv))));
  } else if (kind === "refri") {
    b(0.07, 0.13, 0.07, "#d9534f");
    b(0.05, 0.01, 0.05, "#c9c9c9", 0.065);
  } else if (kind === "marmita") {
    b(0.18, 0.06, 0.14, "#dcd8cf");
    const food = b(0.16, 0.02, 0.12, "#c98a55", 0.035);
    g.userData.fill = (lv: number) => {
      food.scale.y = Math.max(0.05, lv);
      food.position.y = 0.025 + 0.01 * lv;
    };
  }
  return g;
}

export interface PeerInfo {
  id: string;
  name: string;
  color: string;
  x: number;
  z: number;
  dir: number;
  moving: boolean;
  status: string;
  zone: string | null;
  look?: any;
  extra?: any;
}

/** Tamanho do personagem (1 = modelo base). */
export const AVATAR_SCALE = 0.82;
/** Altura do assento das cadeiras (m). */
const SEAT_Y = 0.46;
/** Móveis em que dá para sentar e a distância do clique até eles. */
export type GraphicStyle = "padrao" | "realista" | "desenho" | "retro";

export const SEATS: Record<string, number> = { chair: 0.55, office_chair: 0.55, wood_chair: 0.55, exec_chair: 0.55, stool: 0.5, armchair: 0.8, armchair_plain: 0.8, chair_c: 0.55, chair_b_wood: 0.55, stool_wood: 0.5, k_chair_a: 0.55, k_chair_b: 0.55 };

export class Avatar {
  root = new THREE.Group();
  body = new THREE.Group();
  char!: Character;
  label: HTMLDivElement;
  bubble: HTMLDivElement;
  statusEl: HTMLDivElement;
  nameEl: HTMLDivElement;
  recEl: HTMLDivElement;
  recording = false;
  ring: THREE.Mesh;
  target = new THREE.Vector3();
  targetDir = 0;
  moving = false;
  phase = Math.random() * 10;
  speaking = false;
  /** Falando (animação de conversa), mesmo que eu não esteja ouvindo. */
  talking = false;
  running = false;
  look: Look;
  extra: any = {};
  emoteEl: HTMLDivElement;
  activityEl: HTMLDivElement;
  private emote: { name: string; until: number } | null = null;
  private talkPhase = Math.random() * 10;
  private holdObj: THREE.Object3D | null = null;
  holding: string | null = null;
  private holiday: Holiday | null = null;
  /** Para sons de passo dos outros: posição anterior e ritmo. */
  /** Sentado numa cadeira (o meu vem do mundo, o dos outros vem da rede em extra.sit). */
  sitting = false;
  private hipY = -1;
  /** true no quadro em que um pé toca o chão (para o som do passo). */
  footfall = false;
  private lastFoot = 0;
  private lastTarget = new THREE.Vector3();
  private lastTargetAt = 0;
  private netSpeed = 0;

  constructor(public info: PeerInfo, private isMe: boolean) {
    this.look = normalizeLook(info.look, info.color);
    this.root.add(this.body);
    // escala real em relação aos móveis: ~1,45 m (cabeça grande de jogo, mas cabe na cadeira e na mesa)
    this.body.scale.setScalar(AVATAR_SCALE);
    this.setLook(this.look);

    // sombra redonda no chão (estilo jogo 2D)
    this.ring = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.scale.set(1, 0.7, 1);
    this.ring.position.y = 0.015;
    this.root.add(this.ring);

    this.label = document.createElement("div");
    this.label.className = "nameplate" + (isMe ? " me" : "");
    this.bubble = document.createElement("div");
    this.bubble.className = "bubble hidden";
    this.nameEl = document.createElement("div");
    this.nameEl.className = "plate";
    this.nameEl.innerHTML = `<span class="mic">${icon("mic", 12, 2.4)}</span><span class="nm"></span>`;
    this.nameEl.querySelector(".nm")!.textContent = info.name;
    this.statusEl = document.createElement("div");
    this.statusEl.className = "status";
    this.recEl = document.createElement("div");
    this.recEl.className = "rec-badge";
    this.recEl.textContent = "Gravando";
    this.emoteEl = document.createElement("div");
    this.emoteEl.className = "emote-pop hidden";
    this.activityEl = document.createElement("div");
    this.activityEl.className = "activity-tag hidden";
    this.label.append(this.emoteEl, this.bubble, this.nameEl, this.statusEl, this.activityEl, this.recEl);
    const lbl = new CSS2DObject(this.label);
    lbl.position.set(0, 1.38, 0);
    lbl.center.set(0.5, 1);
    this.root.add(lbl);

    this.setStatus(info.status);
    this.root.position.set(info.x, 0, info.z);
    this.target.copy(this.root.position);
    this.lastTarget.copy(this.target);
    this.root.userData.peerId = info.id;
    if (info.extra) this.applyExtra(info.extra);
  }

  /** Estado extra vindo da rede (atividade, item na mão, câmera...). */
  applyExtra(patch: any) {
    for (const [k, v] of Object.entries(patch ?? {})) {
      if (v === null) delete this.extra[k];
      else this.extra[k] = v;
    }
    this.setHold(this.extra.hold ?? null);
    const act = this.extra.activity;
    this.activityEl.classList.toggle("hidden", !act?.app);
    if (act?.app) this.activityEl.textContent = act.app;
    this.label.classList.toggle("cam-on", !!this.extra.cam);
    if (!this.isMe) this.sitting = !!this.extra.sit;
  }

  setHoliday(h: Holiday | null) {
    this.holiday = h;
    this.setLook(this.look);
  }

  setHold(kind: string | null) {
    if (kind === this.holding) return;
    this.holding = kind;
    this.holdObj?.removeFromParent();
    this.holdObj = null;
    if (kind && HOLD_ITEMS[kind]) {
      this.holdObj = holdMesh(kind);
      this.char.hand.add(this.holdObj);
    }
  }

  /** Quanto ainda tem na mão (1 = cheio), pelo horário em que acaba (vale para todos verem). */
  private updateHoldLevel() {
    const fill = this.holdObj?.userData.fill as ((lv: number) => void) | undefined;
    const end = Number(this.extra.holdEnd);
    const dur = Number(this.extra.holdDur);
    if (!fill || !end || !dur) return;
    fill(THREE.MathUtils.clamp((end - Date.now()) / dur, 0, 1));
  }

  playEmote(name: string) {
    const e = EMOTES.find((x) => x[0] === name);
    if (!e) return;
    this.emote = { name, until: performance.now() + 2600 };
    this.emoteEl.textContent = e[1];
    this.emoteEl.classList.remove("hidden");
    this.emoteEl.classList.remove("pop");
    void this.emoteEl.offsetWidth;
    this.emoteEl.classList.add("pop");
  }

  setLook(look: any) {
    this.look = normalizeLook(look, this.info.color);
    this.info.look = this.look;
    if (this.char) this.body.remove(this.char.root);
    // skin da data especial (gorro de Natal, chapéu de bruxa...) por cima do visual escolhido
    const shown = { ...this.look };
    if (this.holiday && this.look.eventSkin !== false) {
      if (this.holiday.head) shown.head = this.holiday.head;
      if (this.holiday.face) shown.face = this.holiday.face;
    }
    this.char = buildCharacter(shown);
    this.hipY = -1;
    this.body.add(this.char.root);
    if (this.holding) {
      const h = this.holding;
      this.holding = null;
      this.setHold(h);
    }
  }

  setStatus(s: string) {
    this.info.status = s;
    this.statusEl.textContent = s;
    this.statusEl.style.display = s ? "" : "none";
  }

  setRecording(v: boolean) {
    this.recording = v;
    this.label.classList.toggle("recording", v);
  }

  setMuted(v: boolean) {
    this.label.classList.toggle("muted", v);
    this.nameEl.querySelector(".mic")!.innerHTML = icon(v ? "mic-off" : "mic", 12, 2.4);
  }

  setSpeaking(v: boolean) {
    if (v === this.speaking) return;
    this.speaking = v;
    this.label.classList.toggle("speaking", v);
  }

  update(dt: number, interpolate: boolean) {
    if (interpolate) {
      this.root.position.lerp(this.target, Math.min(1, dt * 12));
      let d = this.targetDir - this.body.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.body.rotation.y += d * Math.min(1, dt * 12);
    }
    if (interpolate) {
      // estima se a pessoa está correndo pela velocidade
      const now = performance.now();
      if (!this.target.equals(this.lastTarget)) {
        const dtt = (now - this.lastTargetAt) / 1000;
        if (dtt > 0.02 && dtt < 1) {
          // média suavizada + histerese: um pacote atrasado não troca andar/correr
          const v = this.target.distanceTo(this.lastTarget) / dtt;
          this.netSpeed += (Math.min(v, 12) - this.netSpeed) * 0.35;
          if (!this.running && this.netSpeed > 6.0) this.running = true;
          else if (this.running && this.netSpeed < 5.0) this.running = false;
        }
        this.lastTarget.copy(this.target);
        this.lastTargetAt = now;
      }
      if (!this.moving) {
        this.running = false;
        this.netSpeed = 0;
      }
    }
    const c = this.char;
    const pace = this.running ? 17 : 11;
    this.phase += dt * (this.moving ? pace : 2);
    // o pé toca o chão quando a perna chega no ponto mais aberto do passo (4 quadros por passo)
    this.footfall = false;
    if (this.moving) {
      const foot = Math.floor((this.phase - Math.PI / 2 + 0.72) / Math.PI);
      if (foot !== this.lastFoot) {
        this.footfall = true;
        this.lastFoot = foot;
      }
    } else this.lastFoot = Math.floor((this.phase - Math.PI / 2 + 0.72) / Math.PI);
    const stepped = this.moving ? Math.round(Math.sin(this.phase) * 2) / 2 : 0;
    this.body.position.y = this.moving ? Math.abs(stepped) * (this.running ? 0.09 : 0.05) : 0;
    const sw = stepped * (this.running ? 0.9 : 0.6);
    c.legL.rotation.set(sw, 0, 0);
    c.legR.rotation.set(-sw, 0, 0);
    c.armL.rotation.set(-sw * 0.8, 0, 0);
    c.armR.rotation.set(sw * 0.8, 0, 0);
    c.head.rotation.set(0, 0, 0);
    c.root.rotation.set(this.running && this.moving ? 0.12 : 0, 0, 0);
    if (this.sitting && !this.moving) {
      // altura do quadril em pé (medida uma vez por visual) para encaixar no assento
      if (this.hipY < 0) {
        const by = this.body.position.y;
        this.body.position.y = 0;
        this.root.updateMatrixWorld(true);
        const v = new THREE.Vector3();
        c.legL.getWorldPosition(v);
        this.hipY = v.y - this.root.position.y;
        this.body.position.y = by;
      }
      this.body.position.y = SEAT_Y - this.hipY + 0.04;
      c.legL.rotation.set(-1.5, 0, 0);
      c.legR.rotation.set(-1.5, 0, 0);
      c.armL.rotation.set(-0.45, 0, 0);
      c.armR.rotation.set(-0.45, 0, 0);
      c.root.rotation.set(0, 0, 0);
    }
    const mouth = c.head.getObjectByName("mouth");
    // a boca é um voxel em que o tamanho fica na escala: anima em cima da altura original
    if (mouth && mouth.userData.h === undefined) mouth.userData.h = mouth.scale.y;
    const mouthH = (mouth?.userData.h as number) ?? 0.025;
    if (mouth) mouth.scale.y = mouthH;

    const now = performance.now();
    const t = now / 1000;
    if (this.emote && now > this.emote.until) {
      this.emote = null;
      this.emoteEl.classList.add("hidden");
    }
    if (this.emote) {
      const k = this.emote.name;
      if (k === "acenar") {
        c.armR.rotation.set(0, 0, 2.6 + Math.sin(t * 14) * 0.35);
      } else if (k === "joinha" || k === "fogo") {
        c.armR.rotation.set(-1.4, 0, 0);
      } else if (k === "palmas") {
        const s = Math.abs(Math.sin(t * 12)) * 0.5;
        c.armL.rotation.set(-1.3, 0, -0.5 + s);
        c.armR.rotation.set(-1.3, 0, 0.5 - s);
      } else if (k === "rir") {
        c.head.rotation.set(-0.25 + Math.sin(t * 18) * 0.08, 0, 0);
        this.body.position.y = Math.abs(Math.sin(t * 18)) * 0.03;
        if (mouth) mouth.scale.y = mouthH * 3;
      } else if (k === "coracao") {
        c.armL.rotation.set(-2.4, 0, -0.4);
        c.armR.rotation.set(-2.4, 0, 0.4);
      } else if (k === "danca") {
        c.root.rotation.y = Math.sin(t * 8) * 0.5;
        c.armL.rotation.set(0, 0, -2.2 + Math.sin(t * 8) * 0.6);
        c.armR.rotation.set(0, 0, 2.2 + Math.sin(t * 8) * 0.6);
        this.body.position.y = Math.abs(Math.sin(t * 8)) * 0.08;
      } else if (k === "pular") {
        this.body.position.y = Math.abs(Math.sin(t * 7)) * 0.35;
        c.armL.rotation.set(0, 0, -2.8);
        c.armR.rotation.set(0, 0, 2.8);
      } else if (k === "pensar") {
        c.armR.rotation.set(-2.0, 0, 0.6);
        c.head.rotation.set(0, 0, 0.18);
      } else if (k === "cafe") {
        c.armR.rotation.set(-1.9, 0, 0.2);
      }
    } else if (this.talking && !this.moving) {
      // gestos de conversa: mãos, cabeça e boca em movimento
      this.talkPhase += dt;
      const p = this.talkPhase;
      c.armR.rotation.set(-0.5 - Math.max(0, Math.sin(p * 3.1)) * 0.7, 0, 0.15 + Math.sin(p * 1.7) * 0.2);
      c.armL.rotation.set(-0.2 - Math.max(0, Math.sin(p * 2.3 + 1.5)) * 0.5, 0, -0.1 - Math.sin(p * 1.3) * 0.15);
      c.head.rotation.set(Math.sin(p * 4.2) * 0.08, Math.sin(p * 0.9) * 0.18, Math.sin(p * 1.6) * 0.05);
      if (mouth) mouth.scale.y = mouthH * (1 + Math.abs(Math.sin(p * 13)) * 2.4);
    } else if (this.holding && !this.moving) {
      this.updateHoldLevel();
      // gole de vez em quando
      const sip = Math.sin(t * 0.7 + this.phase) > 0.93;
      c.armR.rotation.set(sip ? -2.1 : -0.9, 0, 0.1);
    } else if (!this.moving) {
      // respiração parada
      c.head.rotation.set(Math.sin(t * 1.3 + this.phase) * 0.02, 0, 0);
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof CSS2DObject) o.element.remove();
    });
    this.root.removeFromParent();
    this.label.remove();
  }
}

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export class World {
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  labels: CSS2DRenderer;
  composer: EffectComposer;
  pixelPass: RenderPixelatedPass;
  /** Tamanho do "pixel" na tela. 3 = pixel art bem visível e leve. */
  pixelSize = 1;
  /** O andar que estou vendo (os itens e salas dele). */
  layout!: Layout;
  /** Layout completo, com todos os andares (é o que vai para o servidor). */
  fullLayout!: Layout;
  /** Andar onde eu estou (0 = térreo). Só esse andar é desenhado. */
  level = 0;
  itemGroup = new THREE.Group();
  zoneGroup = new THREE.Group();
  floor!: THREE.Mesh;
  grass?: THREE.Mesh;
  blockers: Rect[] = [];
  me!: Avatar;
  others = new Map<string, Avatar>();
  zoom = 1.3;
  camTarget = new THREE.Vector3();
  /** Quanto a pessoa arrastou o mapa para longe do personagem (zera ao andar). */
  panOffset = new THREE.Vector3();
  keys = new Set<string>();
  path: THREE.Vector3[] = [];
  onMove?: (x: number, z: number, dir: number, moving: boolean, zone: Zone | null) => void;
  onZoneChange?: (z: Zone | null) => void;
  onFrame?: () => void;
  onFloorClick?: (p: THREE.Vector3, ev: MouseEvent) => boolean; // true = consumido (editor)
  /** Botão direito / clique em um personagem. */
  onAvatarMenu?: (id: string, x: number, y: number, isMe: boolean) => void;
  onAvatarClick?: (id: string, x: number, y: number) => void;
  /** Clique em item interativo (cozinha, painéis) fora do modo edição. */
  onItemClick?: (item: Item, x: number, y: number) => boolean;
  onStep?: (run: boolean, vol: number) => void;
  editing = false;
  /** No editor: pode arrastar o mapa agora? (não pode enquanto desenha sala ou parede) */
  canPanEdit?: () => boolean;
  env!: Environment;
  holiday: Holiday | null = null;
  decorGroup = new THREE.Group();
  hemi!: THREE.HemisphereLight;
  sun!: THREE.DirectionalLight;
  /** Velocidades (m/s). */
  walkSpeed = 4.2;
  runSpeed = 7.4;
  running = false;
  private stuck = 0;
  janitor?: Janitor;
  /** Visão do prédio inteiro (zoom out) para escolher a sala. */
  overview = false;
  onOverviewChange?: (on: boolean) => void;
  private savedZoom = 1.3;
  /** Caminho longo pedido pelo mapa: vai correndo. */
  private runPath = false;
  /** Onde o último clique mandou andar (para sentar ao chegar numa cadeira). */
  private walkGoal: THREE.Vector3 | null = null;
  /** Sentei / levantei (para avisar os outros). */
  onSit?: (on: boolean) => void;
  /** Alguém entrou na sala onde eu estou. */
  onEnterMyRoom?: (id: string) => void;
  private wallLinks = new Map<string, WallLinks>();
  private doors: { pivots: THREE.Object3D[]; sign: number[]; x: number; z: number; zone: string; open: number; sounding?: boolean }[] = [];
  /** Uma porta começou a abrir (distância até mim, para o som). */
  onDoorOpen?: (dist: number) => void;
  /** Uma porta terminou de fechar (distância até mim, para o som). */
  onDoorClose?: (dist: number) => void;
  /** Trechos de parede que estreitam o vão das portas (colisão). */
  private doorBlockers: { x0: number; x1: number; z0: number; z1: number }[] = [];
  private doorGroup = new THREE.Group();
  currentZone: Zone | null = null;
  inputEnabled = true;
  /** Joystick de toque (celular): x = direita da tela, y = para cima da tela, de -1 a 1. */
  stick = { x: 0, y: 0 };
  private lastSent = 0;
  private lastState = "";
  private ray = new THREE.Raycaster();
  private clock = new THREE.Clock();

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: false });
    // resolução cheia (HD / retina): a cara de pixel art vem dos modelos e texturas, não de baixar a resolução
    // nitidez boa sem gastar memória de vídeo à toa (2x em tela 4K passa de 100 MB só em buffers)
    // no celular a tela tem 2-3x de densidade: 1x fica borrado, então usa até 2x (tela pequena, custo baixo)
    const coarse = matchMedia("(pointer: coarse)").matches;
    this.renderer.setPixelRatio(coarse ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping; // cores exatas da paleta (pixel art)
    this.renderer.toneMappingExposure = 1.05;
    host.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "labels";
    host.appendChild(this.labels.domElement);

    // fundo escuro até o escritório carregar (antes ficava tudo verde enquanto carregava)
    this.scene.background = new THREE.Color(0x0d0d0d);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8070, 1.45);
    this.hemi = hemi;
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.35);
    this.sun = sun;
    sun.position.set(-10, 26, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = 34;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 80 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);

    this.scene.add(this.itemGroup, this.zoneGroup, this.decorGroup, this.doorGroup);
    this.env = new Environment(
      this.scene,
      hemi,
      sun,
      () => this.layout?.size ?? { w: 32, d: 22 },
      () => this.grass,
      () => foliageMaterials,
    );

    // buffers de 8 bits por canal (o padrão é 16 bits, o dobro de memória de vídeo, sem ganho visual aqui)
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType }));
    // passe de contorno em resolução cheia (pixelSize 1): linhas finas, sem pixelar a imagem
    this.pixelPass = new RenderPixelatedPass(1, this.scene, this.camera, { normalEdgeStrength: 0.08, depthEdgeStrength: 0.35 });
    this.composer.addPass(this.pixelPass);
    this.composer.addPass(new OutputPass());

    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.bindInput();
  }

  resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.labels.setSize(w, h);
    this.updateFrustum();
  }

  private updateFrustum() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const half = 9 / this.zoom;
    const aspect = w / Math.max(1, h);
    Object.assign(this.camera, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
    this.camera.updateProjectionMatrix();
  }

  // ---------- layout
  setLayout(full: Layout) {
    this.fullLayout = full;
    // o andar pode ter sido apagado: volta para o térreo
    if (this.level && !full.levels?.some((L) => L.id === this.level)) this.level = 0;
    const layout = levelView(full, this.level);
    this.layout = layout;
    (this.scene.background as THREE.Color).set(this.level ? 0xa9d6ee : 0x8fcf72);
    // CSS2DObject só tira o elemento do DOM quando ele mesmo é removido; aqui eles são netos.
    this.zoneGroup.traverse((o) => {
      if (o instanceof CSS2DObject) o.element.remove();
    });
    disposeTree(this.itemGroup);
    disposeTree(this.zoneGroup);
    this.itemGroup.clear();
    this.zoneGroup.clear();
    if (this.floor) {
      this.floor.removeFromParent();
      this.floor.geometry.dispose();
      const fm = this.floor.material as THREE.MeshToonMaterial;
      fm.map?.dispose();
    }

    const { w, d } = layout.size;
    const floorTex = this.makeFloorTexture(layout);
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 1, d + 1),
      toon("#ffffff", { map: floorTex }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0.002;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    if (!this.grass) {
      // gramado em volta do prédio
      const tex = pixelTexture(32, 32, (g) => {
        const r = rng(5);
        g.fillStyle = "#8fcf72";
        g.fillRect(0, 0, 32, 32);
        for (let i = 0; i < 70; i++) {
          g.fillStyle = r() > 0.5 ? "#9ad87c" : "#82c266";
          const x = Math.floor(r() * 32);
          const y = Math.floor(r() * 32);
          g.fillRect(x, y, 1, 2);
        }
        for (let i = 0; i < 6; i++) {
          g.fillStyle = "#b5e59a";
          g.fillRect(Math.floor(r() * 30), Math.floor(r() * 30), 2, 1);
        }
      }, [60, 60]);
      this.grass = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), toon("#ffffff", { map: tex }));
      this.grass.rotation.x = -Math.PI / 2;
      this.grass.receiveShadow = true;
      this.scene.add(this.grass);
    }

    this.blockers = [];
    this.computeWallLinks();
    for (const it of layout.items) this.addItemMesh(it);
    for (const z of layout.zones) this.addZoneMesh(z);
    this.buildDoors();
    if (!this.janitor) this.janitor = new Janitor(this);
    // o faxineiro fica no térreo
    if (!this.level) this.janitor.plan();
    this.janitor.avatar.root.visible = !this.level;
    // andar de cima: sem gramado em volta (só céu), para ficar claro que é outro andar
    if (this.grass) this.grass.visible = !this.level;
    this.currentZone = null;
    this.placeDecor();
    // estava sentado e a cadeira mudou de lugar ou saiu: levanta
    if (this.me?.sitting) {
      const p = this.me.root.position;
      const seat = this.seatNear(p);
      if (!seat || Math.hypot(seat.x - p.x, seat.z - p.z) > 0.3) this.standUp();
    }
    this.unstick();
  }

  /** Mudou o escritório e fiquei dentro de parede ou móvel: vou para o lugar livre mais perto. */
  private unstick() {
    const p = this.me?.root.position;
    if (!p || !this.blocked(p.x, p.z)) return;
    for (let r = 0.5; r < 8; r += 0.5)
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const x = p.x + Math.cos(a) * r;
        const z = p.z + Math.sin(a) * r;
        if (!this.blocked(x, z)) {
          p.set(x, 0, z);
          this.path = [];
          return;
        }
      }
  }

  setHoliday(h: Holiday | null) {
    this.holiday = h;
    this.me?.setHoliday(h);
    for (const a of this.others.values()) a.setHoliday(h);
    this.placeDecor();
  }

  /** Enfeites da data especial: perto da entrada, sem atrapalhar a passagem. */
  private placeDecor() {
    this.decorGroup.clear();
    if (!this.holiday || !this.layout) return;
    const { w, d } = this.layout.size;
    const sp = this.layout.spawn ?? { x: 0, z: d / 2 - 3 };
    const spots: [number, number][] = [[sp.x - 3.2, sp.z - 1.2], [sp.x + 3.2, sp.z - 1.2], [sp.x - 4.4, sp.z + 0.4], [sp.x + 4.4, sp.z + 0.4], [sp.x - 2.4, sp.z + 0.8], [sp.x + 2.4, sp.z + 0.8]];
    let i = 0;
    for (const type of this.holiday.decor) {
      if (type === "xmas_lights") {
        // pisca-pisca em cima das paredes de fora
        const cols = [0xff5a65, 0xffd35c, 0x5ec8ff, 0xc8f501];
        const geo = new THREE.SphereGeometry(0.07, 6, 5);
        let k = 0;
        for (let x = -w / 2; x <= w / 2; x += 0.7)
          for (const z of [-d / 2, d / 2]) {
            const b = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cols[k++ % 4] }));
            b.position.set(x, 1.36, z);
            b.userData.blink = k;
            this.decorGroup.add(b);
          }
        continue;
      }
      if (type === "flags") {
        const o = buildItem({ id: "decor" + i, type, x: sp.x, z: sp.z - 3, rot: 0 });
        this.decorGroup.add(o);
        continue;
      }
      const [x, z] = type === "neon_sale" ? [sp.x + 3.5, sp.z - 2.2] : spots[i++ % spots.length];
      if (this.blocked(x, z, 0.3) && type !== "gift" && type !== "egg") continue;
      this.decorGroup.add(buildItem({ id: "decor" + i, type, x, z, rot: 0 }));
    }
  }

  /**
   * Piso pintado pixel a pixel (32 px por metro):
   * madeira clara no salão, carpete nas salas privadas, cerâmica xadrez nas áreas abertas.
   */
  private makeFloorTexture(layout: Layout) {
    const { w, d } = layout.size;
    const px = 32;
    const W = (w + 1) * px;
    const H = (d + 1) * px;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    const r = rng(42);
    // tábuas de madeira clara (salão)
    g.fillStyle = "#e9cfa6";
    g.fillRect(0, 0, W, H);
    const plank = 8; // 4 tábuas por metro
    for (let j = 0, row = 0; j < H; j += plank, row++) {
      let i = -((row * 37) % 96);
      while (i < W) {
        const len = 64 + Math.floor(r() * 64);
        const tone = ["#ead3ad", "#e5c99e", "#eed8b5", "#e2c597"][Math.floor(r() * 4)];
        g.fillStyle = tone;
        g.fillRect(Math.max(0, i), j, len, plank - 1);
        g.fillStyle = "#d4b585";
        g.fillRect(Math.max(0, i), j + plank - 1, len, 1);
        if (i + len < W) g.fillRect(i + len - 1, j, 1, plank - 1);
        // veios
        g.fillStyle = "#dcbf92";
        for (let k = 0; k < 2; k++) g.fillRect(Math.max(0, i) + Math.floor(r() * len), j + 2 + Math.floor(r() * 3), 3 + Math.floor(r() * 5), 1);
        i += len;
      }
    }
    /** Aplica uma cor por cima do desenho do piso, mantendo os detalhes (tábuas, rejunte, trama). */
    const recolor = (x: number, y: number, ww: number, hh: number, hex?: string) => {
      if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return;
      const col = new THREE.Color(hex);
      const hsl = { h: 0, s: 0, l: 0 };
      col.getHSL(hsl);
      g.save();
      g.globalCompositeOperation = "color";
      g.fillStyle = hex;
      g.fillRect(x, y, ww, hh);
      // cor escura: escurece também (o modo "color" sozinho só troca o tom)
      if (hsl.l < 0.5) {
        g.globalCompositeOperation = "multiply";
        const v = Math.round(255 * Math.max(0.25, hsl.l * 1.6));
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x, y, ww, hh);
      } else if (hsl.l > 0.75) {
        g.globalCompositeOperation = "screen";
        const v = Math.round(255 * (hsl.l - 0.6));
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x, y, ww, hh);
      }
      g.restore();
    };
    recolor(0, 0, W, H, layout.floorColor);
    const toPx = (x: number, z: number) => [Math.round((x + (w + 1) / 2) * px), Math.round((z + (d + 1) / 2) * px)];
    for (const zn of layout.zones) {
      const [x0, y0] = toPx(zn.x - zn.w / 2, zn.z - zn.d / 2);
      const zw = Math.round(zn.w * px);
      const zh = Math.round(zn.d * px);
      const floor = zn.floor ?? (zn.private ? "carpete-azul" : "ceramica");
      const CARPET: Record<string, [string, string, string, string]> = {
        "carpete-azul": ["#7d86c2", "#8790cb", "#737cb8", "#6870ab"],
        "carpete-verde": ["#7fae8c", "#8aba96", "#74a282", "#679676"],
        "carpete-lilas": ["#a790cf", "#b19bd8", "#9c85c4", "#8f78b8"],
        "carpete-grafite": ["#5d606c", "#666976", "#555863", "#4a4d57"],
      };
      if (CARPET[floor]) {
        const [base, hi, lo, edge] = CARPET[floor];
        g.fillStyle = base;
        g.fillRect(x0, y0, zw, zh);
        for (let y = 0; y < zh; y += 16)
          for (let x = 0; x < zw; x += 16) {
            const ox = (y / 16) % 2 ? 8 : 0;
            g.fillStyle = hi;
            g.fillRect(x0 + x + ox + 6, y0 + y + 4, 4, 1);
            g.fillRect(x0 + x + ox + 5, y0 + y + 5, 6, 1);
            g.fillRect(x0 + x + ox + 6, y0 + y + 6, 4, 1);
            g.fillStyle = lo;
            g.fillRect(x0 + x + ox + 7, y0 + y + 12, 2, 1);
          }
        g.fillStyle = edge;
        g.fillRect(x0, y0, zw, 2);
        g.fillRect(x0, y0 + zh - 2, zw, 2);
        g.fillRect(x0, y0, 2, zh);
        g.fillRect(x0 + zw - 2, y0, 2, zh);
      } else if (floor === "madeira" || floor === "madeira-escura") {
        const dark = floor === "madeira-escura";
        for (let y = 0, row = 0; y < zh; y += 8, row++) {
          let x = -((row * 29) % 80);
          while (x < zw) {
            const len = 48 + Math.floor(r() * 48);
            g.fillStyle = (dark ? ["#6e4a32", "#76503a", "#664430", "#7a553c"] : ["#b98557", "#c08d5e", "#b07c4f", "#c4935f"])[Math.floor(r() * 4)];
            g.fillRect(x0 + Math.max(0, x), y0 + y, Math.min(len, zw - Math.max(0, x)), 7);
            g.fillStyle = dark ? "#4f3424" : "#9c6c43";
            g.fillRect(x0 + Math.max(0, x), y0 + y + 7, Math.min(len, zw - Math.max(0, x)), 1);
            x += len;
            if (x < zw) g.fillRect(x0 + x - 1, y0 + y, 1, 7);
          }
        }
      } else if (floor === "porcelanato") {
        // placas grandes claras (1 m) com rejunte fino
        g.fillStyle = "#e4e2dc";
        g.fillRect(x0, y0, zw, zh);
        for (let y = 0; y < zh; y += 32)
          for (let x = 0; x < zw; x += 32) {
            g.fillStyle = (x / 32 + y / 32) % 2 ? "#e8e6e1" : "#dedcd5";
            g.fillRect(x0 + x, y0 + y, Math.min(31, zw - x), Math.min(31, zh - y));
            g.fillStyle = "#f2f1ed";
            g.fillRect(x0 + x + 4, y0 + y + 4, 6, 1);
          }
      } else if (floor === "concreto") {
        g.fillStyle = "#a9a8a4";
        g.fillRect(x0, y0, zw, zh);
        for (let k = 0; k < (zw * zh) / 40; k++) {
          g.fillStyle = r() > 0.5 ? "#b2b1ad" : "#9f9e9a";
          g.fillRect(x0 + Math.floor(r() * zw), y0 + Math.floor(r() * zh), 2, 1);
        }
        g.fillStyle = "#93928e";
        for (let y = 64; y < zh; y += 64) g.fillRect(x0, y0 + y, zw, 1);
        for (let x = 64; x < zw; x += 64) g.fillRect(x0 + x, y0, 1, zh);
      } else {
        // cerâmica xadrez cinza
        for (let y = 0; y < zh; y += 16)
          for (let x = 0; x < zw; x += 16) {
            g.fillStyle = (x / 16 + y / 16) % 2 ? "#c3c6cf" : "#b5b8c2";
            g.fillRect(x0 + x, y0 + y, Math.min(16, zw - x), Math.min(16, zh - y));
            g.fillStyle = "#cfd2da";
            g.fillRect(x0 + x + 2, y0 + y + 2, 3, 1);
          }
      }
      // área aberta sem cor própria segue a cor do piso do salão
      recolor(x0, y0, zw, zh, zn.floorColor ?? (zn.private ? undefined : layout.floorColor));
    }
    // logo da VERKZ pintada no piso (discreta)
    const logo = new Path2D(LOGO_PATH);
    for (const it of layout.items.filter((i) => i.type === "floor_logo")) {
      const [cx, cy] = toPx(it.x, it.z);
      const size = 4 * px;
      g.save();
      g.translate(cx, cy);
      g.scale(size / 560, size / 560);
      g.translate(-547, -547);
      g.globalAlpha = 0.22;
      g.fillStyle = "#8a9a1e";
      g.fill(logo, "evenodd");
      g.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 8;
    return t;
  }

  private wallKey(x: number, z: number) {
    return `${Math.round(x)},${Math.round(z)}`;
  }

  /** Quais paredes encostam em quais (para desenhar paredes finas ligadas). */
  private computeWallLinks() {
    const set = new Set(this.layout.items.filter((i) => WALL_TYPES.has(i.type)).map((i) => this.wallKey(i.x, i.z)));
    this.wallLinks.clear();
    for (const it of this.layout.items) {
      if (!WALL_TYPES.has(it.type)) continue;
      const x = Math.round(it.x);
      const z = Math.round(it.z);
      this.wallLinks.set(it.id, { xp: set.has(`${x + 1},${z}`), xn: set.has(`${x - 1},${z}`), zp: set.has(`${x},${z + 1}`), zn: set.has(`${x},${z - 1}`) });
    }
  }

  /** Paredes do fundo (norte e oeste do prédio) ficam inteiras; as outras são cortadas para não tapar a vista. */
  private wallIsTall(it: Item) {
    const { w, d } = this.layout.size;
    return Math.round(it.z) === -Math.round(d / 2) || Math.round(it.x) === -Math.round(w / 2);
  }

  /** O item de pendurar está encostado numa parede inteira (do fundo)? */
  isMounted(it: Item) {
    if (!this.layout) return false;
    const W = this.layout.size.w / 2;
    const D = this.layout.size.d / 2;
    const r = ((it.rot % 360) + 360) % 360;
    return (r === 0 && it.z <= -D + 0.6) || (r === 270 && it.x <= -W + 0.6);
  }

  /** Pedestal simples para quadro solto no meio da sala. */
  private frameStand(w: number) {
    const g = new THREE.Group();
    const mat = new THREE.MeshToonMaterial({ color: 0x3a3a40 });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(geo.box(0.05, MOUNT_Y + 0.1, 0.05), mat);
      post.position.set(sx * Math.min(0.45, w * 0.3), (MOUNT_Y + 0.1) / 2, -0.06);
      const foot = new THREE.Mesh(geo.box(0.08, 0.04, 0.4), mat);
      foot.position.set(sx * Math.min(0.45, w * 0.3), 0.02, -0.06);
      post.castShadow = true;
      g.add(post, foot);
    }
    return g;
  }

  /** Levanta o personagem (ao abrir o editor ou se a cadeira dele saiu do lugar). */
  standUp() {
    if (!this.me?.sitting) return;
    this.me.sitting = false;
    this.onSit?.(false);
  }

  addItemMesh(it: Item) {
    if (WALL_TYPES.has(it.type)) {
      const nb = this.wallLinks.get(it.id) ?? { xp: false, xn: false, zp: false, zn: false };
      const obj = buildWall(it, nb, this.wallIsTall(it));
      this.itemGroup.add(obj);
      this.blockers.push(...wallRects(it, nb));
      return obj;
    }
    const obj = buildItem(it);
    // quadro de pendurar longe de uma parede inteira: ganha um pedestal (não fica flutuando)
    if (WALL_MOUNT.has(it.type) && !this.isMounted(it)) obj.add(this.frameStand(DEFS[it.type]?.w ?? 1));
    this.itemGroup.add(obj);
    const def = DEFS[it.type];
    if (def?.blocks) {
      const f = footprint(it);
      this.blockers.push({ x0: it.x - f.w / 2, x1: it.x + f.w / 2, z0: it.z - f.d / 2, z1: it.z + f.d / 2 });
    }
    return obj;
  }

  rebuildBlockers() {
    this.blockers = [];
    this.computeWallLinks();
    for (const it of this.layout.items) {
      if (WALL_TYPES.has(it.type)) {
        this.blockers.push(...wallRects(it, this.wallLinks.get(it.id)!));
        continue;
      }
      if (!DEFS[it.type]?.blocks) continue;
      const f = footprint(it);
      this.blockers.push({ x0: it.x - f.w / 2, x1: it.x + f.w / 2, z0: it.z - f.d / 2, z1: it.z + f.d / 2 });
    }
  }

  /**
   * Portas das salas privadas: cada vão na linha de parede da sala vira uma porta dupla de 1,3 m;
   * o que sobra do vão é fechado com parede.
   * Abrem com animação quando alguém chega perto e fecham depois.
   */
  private buildDoors() {
    this.doorGroup.clear();
    this.doors = [];
    this.doorBlockers = [];
    const walls = new Set(this.layout.items.filter((i) => WALL_TYPES.has(i.type)).map((i) => this.wallKey(i.x, i.z)));
    const has = (x: number, z: number) => walls.has(`${x},${z}`);
    const { d } = this.layout.size;
    const wood = new THREE.MeshToonMaterial({ color: 0x9a6b45 });
    const woodDark = new THREE.MeshToonMaterial({ color: 0x6f4a2e });
    const metal = new THREE.MeshToonMaterial({ color: 0xd9d4c8 });
    const seen = new Set<string>(); // um vão entre duas salas vira uma porta só
    for (const zn of this.layout.zones) {
      if (!zn.private) continue;
      const x0 = Math.round(zn.x - zn.w / 2 - 0.5);
      const x1 = Math.round(zn.x + zn.w / 2 + 0.5);
      const z0 = Math.round(zn.z - zn.d / 2 - 0.5);
      const z1 = Math.round(zn.z + zn.d / 2 + 0.5);
      // as paredes podem estar na borda de fora da sala (salas originais) ou na de dentro (salas criadas no editor)
      type Line = { alongX: boolean; fixed: number; from: number; to: number };
      // cada lado da sala tem duas linhas possíveis (borda de fora ou de dentro); vale a que tem mais parede.
      // Sem isso, numa sala estreita (ex.: Ouvidoria, 3 m) a linha de dentro "via" as paredes laterais
      // como um vão de 3 m e criava portas falsas atravessando a sala.
      const count = (ln: Line) => {
        let n = 0;
        for (let k = ln.from; k <= ln.to; k++) if (ln.alongX ? has(k, ln.fixed) : has(ln.fixed, k)) n++;
        return n;
      };
      const pick = (outer: Line, inner: Line) => (count(inner) > count(outer) ? inner : outer);
      const lines: Line[] = [
        pick({ alongX: true, fixed: z0, from: x0, to: x1 }, { alongX: true, fixed: z0 + 1, from: x0, to: x1 }),
        pick({ alongX: true, fixed: z1, from: x0, to: x1 }, { alongX: true, fixed: z1 - 1, from: x0, to: x1 }),
        pick({ alongX: false, fixed: x0, from: z0, to: z1 }, { alongX: false, fixed: x0 + 1, from: z0, to: z1 }),
        pick({ alongX: false, fixed: x1, from: z0, to: z1 }, { alongX: false, fixed: x1 - 1, from: z0, to: z1 }),
      ];
      for (const ln of lines) {
        const at = (k: number) => (ln.alongX ? has(k, ln.fixed) : has(ln.fixed, k));
        let k = ln.from;
        while (k <= ln.to) {
          if (at(k)) {
            k++;
            continue;
          }
          let e = k;
          while (e + 1 <= ln.to && !at(e + 1)) e++;
          // vão de verdade: parede dos dois lados, até 3 m
          if (k > ln.from && e < ln.to && at(k - 1) && at(e + 1) && e - k + 1 <= 3 && !seen.has(`${ln.alongX ? (k + e) / 2 : ln.fixed},${ln.alongX ? ln.fixed : (k + e) / 2}`)) {
            seen.add(`${ln.alongX ? (k + e) / 2 : ln.fixed},${ln.alongX ? ln.fixed : (k + e) / 2}`);
            // o vão vai da face de um pilar até a do outro (as paredes vizinhas terminam no pilar)
            const width = e - k + 1 + 1 - WALL_T;
            const cx = ln.alongX ? (k + e) / 2 : ln.fixed;
            const cz = ln.alongX ? ln.fixed : (k + e) / 2;
            const tall = ln.alongX ? ln.fixed === -Math.round(d / 2) : ln.fixed === -Math.round(this.layout.size.w / 2);
            const h = tall ? 2.15 : WALL_CUT + 0.35;
            // porta dupla de tamanho fixo; o resto do vão vira parede (mesmo acabamento)
            const open = Math.min(width, DOOR_W);
            const fill = (width - open) / 2;
            const frame = new THREE.Group();
            frame.position.set(cx, 0, cz);
            if (!ln.alongX) frame.rotation.y = Math.PI / 2;
            this.doorGroup.add(frame);
            const wallH = tall ? WALL_H : WALL_CUT;
            for (const s of [-1, 1]) {
              if (fill > 0.02) {
                const seg = wallSegment(fill + 0.02, wallH);
                seg.position.x = s * (open / 2 + fill / 2);
                frame.add(seg);
                // colisão do trecho de parede
                const a = open / 2;
                const b = width / 2 + 0.02;
                const t = (WALL_T + 0.06) / 2;
                const lo = s < 0 ? -b : a;
                const hi = s < 0 ? -a : b;
                this.doorBlockers.push(
                  ln.alongX ? { x0: cx + lo, x1: cx + hi, z0: cz - t, z1: cz + t } : { x0: cx - t, x1: cx + t, z0: cz + lo, z1: cz + hi },
                );
              }
              const jamb = doorJamb(tall ? h : Math.max(h, wallH));
              jamb.position.x = s * (open / 2 + 0.03);
              frame.add(jamb);
            }
            // verga em cima da porta (só nas paredes inteiras)
            if (tall) frame.add(wallSegment(open + 0.12, WALL_H - h, h, false));
            const leafW = open / 2 - 0.01;
            const door = { pivots: [] as THREE.Object3D[], sign: [] as number[], x: cx, z: cz, zone: zn.id, open: 0, sounding: false };
            for (const side of [-1, 1]) {
              const pivot = new THREE.Group();
              pivot.position.set(side * (open / 2), 0, 0);
              const leaf = new THREE.Group();
              const panel = new THREE.Mesh(geo.box(leafW, h, 0.06), wood);
              panel.position.set(0, h / 2, 0);
              panel.castShadow = true;
              // duas almofadas (detalhe de porta de madeira)
              const insetTop = new THREE.Mesh(geo.box(leafW * 0.62, h * 0.32, 0.075), woodDark);
              insetTop.position.set(0, h * 0.7, 0);
              const insetLow = new THREE.Mesh(geo.box(leafW * 0.62, h * 0.24, 0.075), woodDark);
              insetLow.position.set(0, h * 0.28, 0);
              const handle = new THREE.Mesh(geo.box(0.05, 0.16, 0.12), metal);
              handle.position.set(-side * (leafW / 2 - 0.08), Math.min(1.0, h * 0.55), 0);
              leaf.add(panel, insetTop, insetLow, handle);
              // a folha vai da dobradiça para o meio do vão
              leaf.position.set(-side * (leafW / 2), 0, 0);
              pivot.add(leaf);
              frame.add(pivot);
              door.pivots.push(pivot);
              door.sign.push(side);
            }
            this.doors.push(door);
          }
          k = e + 1;
        }
      }
    }
  }

  /** Porta abre quando alguém está a menos de 1,6 m dela; fecha sozinha depois. */
  private updateDoors(dt: number) {
    if (!this.doors.length) return;
    const people = [this.me, ...[...this.others.values()].filter((a) => this.sameLevel(a)), this.level ? undefined : this.janitor?.avatar].filter(Boolean).map((a) => a!.root.position);
    for (const dr of this.doors) {
      const near = people.some((p) => Math.hypot(p.x - dr.x, p.z - dr.z) < 1.6);
      const target = near ? 1 : 0;
      // começou a abrir: som (mais baixo/longe não toca)
      if (target === 1 && dr.open < 0.05 && !dr.sounding) {
        dr.sounding = true;
        const me = this.me?.root.position;
        this.onDoorOpen?.(me ? Math.hypot(me.x - dr.x, me.z - dr.z) : 99);
      }
      // terminou de fechar: batida da porta
      if (target === 0 && dr.sounding && dr.open < 0.12) {
        dr.sounding = false;
        const me = this.me?.root.position;
        this.onDoorClose?.(me ? Math.hypot(me.x - dr.x, me.z - dr.z) : 99);
      }
      dr.open += (target - dr.open) * Math.min(1, dt * 6);
      const ang = dr.open * 1.75;
      dr.pivots.forEach((pv, i) => {
        const base = pv.userData.base ?? (pv.userData.base = pv.rotation.y);
        pv.rotation.y = base + dr.sign[i] * ang;
      });
    }
  }

  addZoneMesh(z: Zone) {
    const g = new THREE.Group();
    g.userData.zoneId = z.id;
    const tag = document.createElement("div");
    tag.className = "zone-tag" + (z.private ? " private" : "");
    tag.innerHTML = (z.private ? icon("lock", 11, 2.4) : "") + "<span></span>";
    tag.querySelector("span")!.textContent = z.name;
    const lbl = new CSS2DObject(tag);
    lbl.position.set(-z.w / 2 + 0.3, 0.05, -z.d / 2 + 0.4);
    lbl.center.set(0, 0);
    g.add(lbl);
    g.position.set(z.x, 0, z.z);
    this.zoneGroup.add(g);
  }

  zoneAt(x: number, z: number): Zone | null {
    if (!this.layout) return null;
    // a menor zona que contém o ponto vence (salas dentro de áreas)
    let best: Zone | null = null;
    for (const zn of this.layout.zones) {
      if (Math.abs(x - zn.x) <= zn.w / 2 && Math.abs(z - zn.z) <= zn.d / 2) {
        if (!best || zn.w * zn.d < best.w * best.d) best = zn;
      }
    }
    return best;
  }

  // ---------- avatares
  spawnMe(info: PeerInfo) {
    this.me?.dispose();
    this.me = new Avatar(info, true);
    if (this.holiday) this.me.setHoliday(this.holiday);
    this.scene.add(this.me.root);
    this.camTarget.copy(this.me.root.position);
  }

  /** A pessoa está no mesmo andar que eu? */
  sameLevel(a: Avatar) {
    return (Number(a.extra?.level) || 0) === this.level;
  }

  /** Mostra só quem está no meu andar. */
  refreshLevelVisibility() {
    for (const a of this.others.values()) a.root.visible = this.sameLevel(a);
  }

  /** Muda de andar: desenha o andar novo e põe o personagem em (x, z). */
  setLevel(lv: number, x: number, z: number) {
    this.level = lv;
    this.standUp();
    this.path = [];
    this.setLayout(this.fullLayout);
    this.me.root.position.set(x, 0, z);
    this.camTarget.copy(this.me.root.position);
    this.panOffset.set(0, 0, 0);
    this.unstick();
    this.refreshLevelVisibility();
    this.applyStyle();
  }

  addPeer(info: PeerInfo) {
    this.removePeer(info.id);
    const a = new Avatar(info, false);
    if (this.holiday) a.setHoliday(this.holiday);
    a.targetDir = info.dir;
    a.body.rotation.y = info.dir;
    this.others.set(info.id, a);
    this.scene.add(a.root);
    a.root.visible = this.sameLevel(a);
    this.applyStyle();
    return a;
  }

  removePeer(id: string) {
    const a = this.others.get(id);
    if (a) {
      a.dispose();
      this.others.delete(id);
    }
  }

  movePeer(id: string, x: number, z: number, dir: number, moving: boolean, zone: string | null) {
    const a = this.others.get(id);
    if (!a) return;
    a.target.set(x, 0, z);
    a.targetDir = dir;
    a.moving = moving;
    a.info.x = x;
    a.info.z = z;
    // entrou na sala onde eu estou (não vale o corredor/escritório aberto)
    if (zone && zone !== a.info.zone && zone === this.currentZone?.id && this.currentZone?.private) this.onEnterMyRoom?.(id);
    a.info.zone = zone;
  }

  // ---------- colisão e caminho
  blocked(x: number, z: number, r = 0.28) {
    const { w, d } = this.layout.size;
    if (Math.abs(x) > w / 2 + 0.5 - r || Math.abs(z) > d / 2 + 0.5 - r) return true;
    for (const b of this.blockers) {
      if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return true;
    }
    for (const b of this.doorBlockers) {
      if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return true;
    }
    return false;
  }

  /** A* simples numa grade de 0,5 m. */
  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const step = 0.5;
    const { w, d } = this.layout.size;
    const nx = Math.round((w + 1) / step);
    const nz = Math.round((d + 1) / step);
    const ox = -(w + 1) / 2;
    const oz = -(d + 1) / 2;
    const toCell = (x: number, z: number) => [Math.floor((x - ox) / step), Math.floor((z - oz) / step)];
    const center = (i: number, j: number) => [ox + (i + 0.5) * step, oz + (j + 0.5) * step];
    const [si, sj] = toCell(from.x, from.z);
    let [ti, tj] = toCell(to.x, to.z);
    const free = (i: number, j: number) => {
      if (i < 0 || j < 0 || i >= nx || j >= nz) return false;
      const [x, z] = center(i, j);
      // mesma folga do movimento: se o caminho passa, o personagem passa
      return !this.blocked(x, z, 0.3);
    };
    if (!free(ti, tj)) {
      // procura a célula livre mais próxima do destino
      let found = false;
      for (let r = 1; r < 6 && !found; r++)
        for (let di = -r; di <= r && !found; di++)
          for (let dj = -r; dj <= r && !found; dj++)
            if (free(ti + di, tj + dj)) {
              ti += di;
              tj += dj;
              found = true;
            }
      if (!found) return [];
    }
    const key = (i: number, j: number) => j * nx + i;
    const g = new Map<number, number>([[key(si, sj), 0]]);
    const came = new Map<number, number>();
    const open: [number, number, number][] = [[si, sj, 0]];
    const h = (i: number, j: number) => Math.hypot(i - ti, j - tj);
    const closed = new Set<number>();
    let iter = 0;
    while (open.length && iter++ < 20000) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (open[k][2] < open[bi][2]) bi = k;
      const [ci, cj] = open.splice(bi, 1)[0];
      const ck = key(ci, cj);
      if (ci === ti && cj === tj) {
        const out: THREE.Vector3[] = [];
        let k: number | undefined = ck;
        while (k !== undefined && k !== key(si, sj)) {
          const i = k % nx;
          const j = Math.floor(k / nx);
          const [x, z] = center(i, j);
          out.unshift(new THREE.Vector3(x, 0, z));
          k = came.get(k);
        }
        if (out.length && !this.blocked(to.x, to.z)) out[out.length - 1].set(to.x, 0, to.z);
        return this.smoothPath(from, out);
      }
      if (closed.has(ck)) continue;
      closed.add(ck);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = ci + di;
        const nj = cj + dj;
        if (!free(ni, nj)) continue;
        if (di && dj && (!free(ci + di, cj) || !free(ci, cj + dj))) continue;
        const nk = key(ni, nj);
        const cost = g.get(ck)! + (di && dj ? 1.414 : 1);
        if (cost < (g.get(nk) ?? Infinity)) {
          g.set(nk, cost);
          came.set(nk, ck);
          open.push([ni, nj, cost + h(ni, nj)]);
        }
      }
    }
    return [];
  }

  /** Linha reta livre entre dois pontos (amostra a cada 0,15 m). */
  private clearLine(a: THREE.Vector3, b: THREE.Vector3) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(d / 0.15);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (this.blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  /** Tira os zigue-zagues da grade: vai direto ao ponto mais distante que dá para ver. */
  private smoothPath(from: THREE.Vector3, pts: THREE.Vector3[]) {
    const out: THREE.Vector3[] = [];
    let cur = from.clone();
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.clearLine(cur, pts[j])) j--;
      out.push(pts[j]);
      cur = pts[j];
      i = j + 1;
    }
    return out;
  }

  /** Coloca o meu personagem sentado nessa cadeira (ao entrar no escritório). */
  sitAt(seat: Item) {
    this.me.root.position.set(seat.x, 0, seat.z);
    this.me.targetDir = -(seat.rot * Math.PI) / 180;
    this.me.body.rotation.y = this.me.targetDir;
    this.me.sitting = true;
    this.path = [];
    this.onSit?.(true);
  }

  /** O caminho atual vai correndo (atalhos como "minha sala"). */
  runToTarget() {
    this.runPath = this.path.length > 0;
  }

  /** Zoom em que o prédio inteiro cabe na tela. */
  fitZoom() {
    if (!this.layout) return 0.5;
    const { w, d } = this.layout.size;
    const aspect = this.host.clientWidth / Math.max(1, this.host.clientHeight);
    const halfW = (w + d) / (2 * Math.SQRT2) + 1.5;
    const halfH = ((w + d) / (2 * Math.SQRT2)) * 0.6 + 2.5;
    return Math.max(0.2, 9 / Math.max(halfH, halfW / aspect));
  }

  /** Liga/desliga a visão do prédio inteiro. */
  setOverview(on: boolean, setZoom = true) {
    if (on === this.overview) return;
    this.overview = on;
    if (on) {
      if (setZoom) this.savedZoom = this.zoom;
      else this.savedZoom = Math.max(this.savedZoom, 1.3);
      if (setZoom) this.zoom = this.fitZoom();
    } else if (setZoom) this.zoom = this.savedZoom;
    this.updateFrustum();
    this.onOverviewChange?.(on);
  }

  /** Cadeira (ou banqueta, poltrona) perto do ponto clicado. */
  seatNear(p: THREE.Vector3): Item | null {
    let best: Item | null = null;
    let bd = Infinity;
    for (const it of this.layout.items) {
      const r = SEATS[it.type];
      if (!r) continue;
      const dd = Math.hypot(it.x - p.x, it.z - p.z);
      if (dd < r && dd < bd) {
        bd = dd;
        best = it;
      }
    }
    return best;
  }

  /** Leva a câmera até um ponto (sem mexer o personagem). */
  focusOn(x: number, z: number) {
    const base = this.overview ? new THREE.Vector3() : this.me?.root.position.clone() ?? new THREE.Vector3();
    this.panOffset.set(x - base.x, 0, z - base.z);
  }

  /** Arrasta o mapa: move a câmera na hora, sem sair muito do prédio. */
  panBy(dx: number, dz: number) {
    const { w, d } = this.layout.size;
    const base = this.overview ? new THREE.Vector3() : this.me?.root.position.clone() ?? new THREE.Vector3();
    const lim = (v: number, half: number) => THREE.MathUtils.clamp(v, -half - 2, half + 2);
    const tx = lim(this.camTarget.x + dx, w / 2);
    const tz = lim(this.camTarget.z + dz, d / 2);
    this.panOffset.set(tx - base.x, 0, tz - base.z);
    this.camTarget.set(tx, this.camTarget.y, tz);
  }

  walkTo(x: number, z: number) {
    const goal = new THREE.Vector3(x, 0, z);
    const seat = this.seatNear(goal);
    // clicou numa cadeira: anda até ela (ela não bloqueia a passagem)
    const dest = seat ? new THREE.Vector3(seat.x, 0, seat.z) : goal;
    this.path = this.findPath(this.me.root.position, dest);
    if (!this.path.length && seat && this.me.root.position.distanceTo(dest) < 1.2) this.path = [dest];
    this.walkGoal = seat ? dest : null;
    this.stuck = 0;
  }

  // ---------- entrada
  private bindInput() {
    const typing = () => {
      const a = document.activeElement;
      return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || (a as HTMLElement)?.isContentEditable;
    };
    window.addEventListener("keydown", (e) => {
      if (typing() || !this.inputEnabled) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        this.keys.add(k);
        this.path = [];
        this.panOffset.set(0, 0, 0); // andando pelo teclado, a câmera volta a seguir
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.running = false;
    });
    const shift = (e: KeyboardEvent) => (this.running = e.shiftKey);
    window.addEventListener("keydown", shift);
    window.addEventListener("keyup", shift);

    const el = this.labels.domElement;
    el.addEventListener("wheel", (e) => {
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY > 0 ? 0.9 : 1.1), this.fitZoom(), 3.2);
      // afastou até o prédio inteiro caber: vira a visão de mapa (e volta ao aproximar)
      if (!this.overview && this.zoom <= this.fitZoom() * 1.02) this.setOverview(true, false);
      else if (this.overview && this.zoom > this.fitZoom() * 1.3) this.setOverview(false, false);
      this.updateFrustum();
      e.preventDefault();
    }, { passive: false });

    // ---- mouse: arrastar com o botão esquerdo move o mapa; dois cliques levam o personagem até o lugar
    let lastPointer = "mouse";
    let drag: { id: number; x: number; y: number; lx: number; ly: number; moved: boolean } | null = null;
    let dragged = false;
    el.addEventListener("pointerdown", (e) => {
      lastPointer = e.pointerType || "mouse";
      if (e.pointerType === "touch" || e.button !== 0 || (e.target as HTMLElement) !== el) return;
      if (this.editing && !this.canPanEdit?.()) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
      dragged = false;
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        el.setPointerCapture?.(e.pointerId);
        el.classList.add("panning");
      }
      // o ponto do chão que estava sob o mouse continua sob o mouse (as duas leituras com a mesma câmera)
      const a = this.pickFloor({ clientX: drag.lx, clientY: drag.ly } as MouseEvent);
      const b = this.pickFloor(e);
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      if (a && b) this.panBy(a.x - b.x, a.z - b.z);
    });
    const endDrag = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) dragged = true;
      drag = null;
      el.classList.remove("panning");
    };
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);

    /** Leva o personagem até o ponto (cadeira, lugar do chão ou, no mapa, volta a câmera e vai correndo). */
    const goTo = (e: MouseEvent, p: THREE.Vector3) => {
      if (!this.inputEnabled) return;
      this.panOffset.set(0, 0, 0); // a câmera volta a seguir o personagem
      const obj = this.pickItem(e);
      const it = obj && this.layout.items.find((i) => i.id === obj.userData.itemId);
      // clicou em cima da cadeira (o ponto do chão fica atrás dela na visão diagonal): vai direto sentar
      if (it && SEATS[it.type]) {
        if (this.overview) this.setOverview(false);
        this.walkTo(it.x, it.z);
        return;
      }
      if (this.overview) {
        this.setOverview(false);
        this.walkTo(p.x, p.z);
        this.runPath = this.path.length > 0;
        return;
      }
      this.walkTo(p.x, p.z);
    };

    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement) !== el) return; // cliques em nameplates etc.
      if (dragged) {
        dragged = false; // soltou depois de arrastar o mapa: não é clique
        return;
      }
      const p = this.pickFloor(e);
      if (!p) return;
      if (this.onFloorClick?.(p, e)) return;
      if (!this.editing) {
        const av = this.pickAvatar(e);
        if (av && av !== this.me?.info.id) {
          this.onAvatarClick?.(av, e.clientX, e.clientY);
          return;
        }
        const obj = this.pickItem(e);
        const it = obj && this.layout.items.find((i) => i.id === obj.userData.itemId);
        if (it && DEFS[it.type]?.interactive && this.onItemClick?.(it, e.clientX, e.clientY)) return;
      }
      // no toque, um toque já leva até o lugar; no mouse é com dois cliques (abaixo)
      if (lastPointer === "touch" && !this.editing) goTo(e, p);
    });
    el.addEventListener("dblclick", (e) => {
      if ((e.target as HTMLElement) !== el || this.editing || lastPointer === "touch") return;
      const p = this.pickFloor(e);
      if (!p) return;
      const av = this.pickAvatar(e);
      if (av && av !== this.me?.info.id) return; // dois cliques numa pessoa: o menu dela já abriu
      e.preventDefault();
      goTo(e, p);
    });
    // ---- toque: pinça para zoom e toque longo numa pessoa para abrir o menu
    const touches = new Map<number, { x: number; y: number }>();
    let pinch0 = 0;
    let zoom0 = 1;
    let longTimer = 0;
    let longStart: { x: number; y: number } | null = null;
    let suppressClick = false;
    const cancelLong = () => {
      clearTimeout(longTimer);
      longStart = null;
    };
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        cancelLong();
        const [a, b] = [...touches.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
        zoom0 = this.zoom;
        return;
      }
      if (this.editing || (e.target as HTMLElement) !== el) return;
      longStart = { x: e.clientX, y: e.clientY };
      const ev = e;
      longTimer = window.setTimeout(() => {
        if (!longStart) return;
        const av = this.pickAvatar(ev);
        if (av) {
          suppressClick = true;
          navigator.vibrate?.(15);
          this.onAvatarMenu?.(av, ev.clientX, ev.clientY, av === this.me?.info.id);
        }
        longStart = null;
      }, 480);
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "touch" || !touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (longStart && Math.hypot(e.clientX - longStart.x, e.clientY - longStart.y) > 10) cancelLong();
      if (touches.size === 2 && pinch0 > 0) {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoom = THREE.MathUtils.clamp(zoom0 * (d / pinch0), this.fitZoom(), 3.2);
        if (!this.overview && this.zoom <= this.fitZoom() * 1.02) this.setOverview(true, false);
        else if (this.overview && this.zoom > this.fitZoom() * 1.3) this.setOverview(false, false);
        this.updateFrustum();
        suppressClick = true;
      }
    });
    const up = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch0 = 0;
      cancelLong();
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    // o clique que vem depois de um toque longo ou de uma pinça não deve mover o personagem
    el.addEventListener(
      "click",
      (e) => {
        if (suppressClick) {
          suppressClick = false;
          e.stopImmediatePropagation();
        }
      },
      true,
    );

    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (this.editing) return;
      // no celular o menu sai pelo toque longo (acima); o "contextmenu" do Android duplicaria
      if ((e as PointerEvent).pointerType === "touch" || matchMedia("(pointer: coarse)").matches) return;
      const av = this.pickAvatar(e);
      if (av) this.onAvatarMenu?.(av, e.clientX, e.clientY, av === this.me?.info.id);
    });
  }

  pickFloor(e: MouseEvent): THREE.Vector3 | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
  }

  /** Personagem sob o mouse (pelo corpo ou bem perto dele no chão). */
  pickAvatar(e: MouseEvent): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const roots = [...this.others.values()].filter((a) => a.root.visible).map((a) => a.root);
    if (this.me) roots.push(this.me.root);
    const hits = this.ray.intersectObjects(roots, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.peerId) o = o.parent;
      if (o) return o.userData.peerId;
    }
    // folga: clique no chão bem perto do personagem
    const p = this.pickFloor(e);
    if (!p) return null;
    let best: string | null = null;
    let bd = 0.6;
    for (const a of [...this.others.values(), ...(this.me ? [this.me] : [])]) {
      const d = Math.hypot(a.root.position.x - p.x, a.root.position.z - p.z);
      if (d < bd) {
        bd = d;
        best = a.info.id;
      }
    }
    return best;
  }

  pickItem(e: MouseEvent): THREE.Object3D | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects(this.itemGroup.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.parent !== this.itemGroup) o = o.parent;
      if (o?.userData.itemId && o.userData.itemId) {
        const it = this.layout.items.find((i) => i.id === o!.userData.itemId);
        if (it && it.type !== "floor_logo") return o;
      }
    }
    return null;
  }

  /** Durante a viagem de elevador: 0 = portas fechadas, 1 = abertas; null = automático. */
  elevatorForce: number | null = null;

  /** Primeiro quadro desenhado com o escritório carregado. */
  onReady?: () => void;
  private readyFired = false;
  private readyFrames = 0;
  private outline = true;
  private maxFps = 0;
  private lastFrame = 0;

  /**
   * Qualidade gráfica: "leve" (sem sombras nem contorno, 30 fps), "equilibrada" (padrão) ou
   * "bonita" (resolução da tela, sombras mais definidas).
   */
  quality: "leve" | "equilibrada" | "bonita" = "equilibrada";
  /** Estilo visual: padrão (traço fino), realista (luz e materiais físicos), desenho (traço grosso), retrô (pixelado). */
  style: GraphicStyle = "padrao";
  private realMats = new WeakMap<THREE.Material, THREE.Material>();
  private envMap: THREE.Texture | null = null;
  private lastStyleScan = 0;

  setQuality(q: "leve" | "equilibrada" | "bonita") {
    this.quality = q;
    this.configureRender();
  }

  setStyle(st: GraphicStyle) {
    this.style = st;
    this.configureRender();
    this.applyStyle();
  }

  /** Junta qualidade + estilo nas opções do renderizador. */
  private configureRender() {
    const q = this.quality;
    const st = this.style;
    const coarse = matchMedia("(pointer: coarse)").matches;
    const dpr = window.devicePixelRatio || 1;
    const ratio = q === "bonita" ? Math.min(dpr, 2) : q === "leve" ? (coarse ? Math.min(dpr, 1.5) : Math.min(1, dpr)) : coarse ? Math.min(dpr, 2) : 1;
    this.renderer.setPixelRatio(ratio);
    this.outline = q !== "leve" && st !== "realista";
    if (st === "retro") this.outline = true; // o retrô precisa do passe (é ele que pixela)
    this.maxFps = q === "leve" ? 30 : 0;
    this.sun.castShadow = q !== "leve";
    const size = q === "bonita" || st === "realista" ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      (this.sun.shadow as any).map = null;
    }
    this.renderer.shadowMap.type = q === "bonita" || st === "realista" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
    // contorno e pixel
    this.pixelPass.setPixelSize(st === "retro" ? 3 : 1);
    (this.pixelPass as any).normalEdgeStrength = st === "desenho" ? 0.7 : st === "retro" ? 0.3 : 0.08;
    (this.pixelPass as any).depthEdgeStrength = st === "desenho" ? 1.0 : st === "retro" ? 0.4 : 0.35;
    // luz física no realista
    if (st === "realista") {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.78;
      if (!this.envMap) {
        const pm = new THREE.PMREMGenerator(this.renderer);
        this.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
        pm.dispose();
      }
      this.scene.environment = this.envMap;
      (this.scene as any).environmentIntensity = 0.22;
    } else {
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.scene.environment = null;
    }
    this.resize();
  }

  /** Troca os materiais em tons (toon) por materiais físicos no estilo realista, e volta. */
  applyStyle() {
    const real = this.style === "realista";
    const conv = (m: THREE.Material): THREE.Material => {
      if (!(m as any).isMeshToonMaterial) return m;
      let r = this.realMats.get(m);
      if (!r) {
        const t = m as THREE.MeshToonMaterial;
        const std = new THREE.MeshStandardMaterial({
          color: t.color,
          map: t.map,
          transparent: t.transparent,
          opacity: t.opacity,
          vertexColors: t.vertexColors,
          emissive: t.emissive,
          emissiveMap: t.emissiveMap,
          emissiveIntensity: t.emissiveIntensity,
          side: t.side,
          roughness: 0.78,
          metalness: 0.02,
        });
        r = std;
        this.realMats.set(m, r);
      }
      return r;
    };
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      if (real) {
        if (!mesh.userData.toonMat) mesh.userData.toonMat = mesh.material;
        const src = mesh.userData.toonMat as THREE.Material | THREE.Material[];
        mesh.material = Array.isArray(src) ? src.map(conv) : conv(src);
      } else if (mesh.userData.toonMat) {
        mesh.material = mesh.userData.toonMat;
        delete mesh.userData.toonMat;
      }
    });
  }

  // ---------- loop
  start() {
    const tick = () => {
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, this.clock.getDelta());
      this.step(dt);
      const tt = this.clock.elapsedTime;
      this.env.update(dt, tt);
      for (const b of this.decorGroup.children)
        if (b.userData.blink) ((b as THREE.Mesh).material as THREE.MeshBasicMaterial).visible = Math.floor(tt * 2 + b.userData.blink) % 3 !== 0;
      // qualidade "leve": no máximo 30 quadros por segundo
      const now = performance.now();
      // estilo realista: converte o que apareceu de novo (móveis, pessoas, efeitos)
      if (this.style === "realista" && now - this.lastStyleScan > 1000) {
        this.lastStyleScan = now;
        this.applyStyle();
      }
      if (this.maxFps && now - this.lastFrame < 1000 / this.maxFps - 2) return;
      this.lastFrame = now;
      if (this.outline) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
      // primeiro quadro com o escritório e o personagem: pode tirar a tela de carregamento
      if (!this.readyFired && this.me && this.layout && ++this.readyFrames > 2) {
        this.readyFired = true;
        this.onReady?.();
      }
    };
    tick();
  }

  private step(dt: number) {
    if (!this.me) return;
    const pos = this.me.root.position;
    let vx = 0;
    let vz = 0;
    const k = this.keys;
    // W/S andam para cima/baixo da TELA, A/D para os lados (a câmera é diagonal)
    let kUp = 0;
    let kRight = 0;
    if (k.has("w") || k.has("arrowup")) kUp += 1;
    if (k.has("s") || k.has("arrowdown")) kUp -= 1;
    if (k.has("a") || k.has("arrowleft")) kRight -= 1;
    if (k.has("d") || k.has("arrowright")) kRight += 1;
    // joystick de toque (analógico): soma com o teclado
    kUp += this.stick.y;
    kRight += this.stick.x;
    vx = kRight - kUp;
    vz = -kRight - kUp;

    const keyMove = vx !== 0 || vz !== 0;
    if (keyMove) {
      this.path = [];
      this.walkGoal = null;
      if (this.overview) this.setOverview(false);
    }
    if (!this.path.length) this.runPath = false;
    const hadPath = this.path.length > 0;
    if ((keyMove || hadPath) && this.me.sitting) {
      this.me.sitting = false;
      this.onSit?.(false);
    }
    const stickRun = Math.hypot(this.stick.x, this.stick.y) > 0.92; // empurrou até a borda: corre
    const run = ((this.running || stickRun) && (keyMove || this.path.length > 0)) || (this.runPath && this.path.length > 0);
    const speed = run ? this.runSpeed : this.walkSpeed;
    let moving = false;
    if (keyMove) {
      const len = Math.hypot(vx, vz);
      vx = (vx / len) * speed * dt;
      vz = (vz / len) * speed * dt;
      const ox = pos.x;
      const oz = pos.z;
      if (!this.blocked(pos.x + vx, pos.z)) pos.x += vx;
      if (!this.blocked(pos.x, pos.z + vz)) pos.z += vz;
      this.me.targetDir = Math.atan2(vx, vz);
      // encostado na parede segurando a tecla: não fica "andando no lugar"
      moving = Math.hypot(pos.x - ox, pos.z - oz) > speed * dt * 0.2;
    } else if (this.path.length) {
      // segue o caminho gastando a distância do quadro inteira, sem parar em cada ponto
      let budget = speed * dt;
      const sx = pos.x;
      const sz = pos.z;
      while (budget > 1e-4 && this.path.length) {
        const next = this.path[0];
        const dx = next.x - pos.x;
        const dz = next.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1e-4) {
          this.path.shift();
          continue;
        }
        const k = Math.min(1, budget / dist);
        const nx = pos.x + dx * k;
        const nz = pos.z + dz * k;
        let ok = false;
        if (!this.blocked(nx, nz)) {
          pos.x = nx;
          pos.z = nz;
          ok = true;
        } else if (!this.blocked(nx, pos.z)) {
          pos.x = nx;
          ok = true;
        } else if (!this.blocked(pos.x, nz)) {
          pos.z = nz;
          ok = true;
        }
        this.me.targetDir = Math.atan2(dx, dz);
        if (!ok) break;
        budget -= dist * k;
        if (k >= 1) this.path.shift();
      }
      const moved = Math.hypot(pos.x - sx, pos.z - sz);
      moving = moved > 1e-4;
      // preso (alguém mudou um móvel no caminho, por exemplo): desiste em vez de ficar tremendo
      this.stuck = moved < speed * dt * 0.2 ? this.stuck + dt : 0;
      if (this.stuck > 0.35) {
        this.path = [];
        this.stuck = 0;
      }
    }
    let d = this.me.targetDir - this.me.body.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.me.body.rotation.y += d * Math.min(1, dt * 14);
    // chegou onde clicou: se foi numa cadeira, senta virado para a frente dela
    if (hadPath && !this.path.length && this.walkGoal) {
      const seat = this.seatNear(this.walkGoal);
      if (seat && Math.hypot(seat.x - pos.x, seat.z - pos.z) < 1.2) {
        pos.set(seat.x, 0, seat.z);
        this.me.targetDir = -(seat.rot * Math.PI) / 180;
        this.me.body.rotation.y = this.me.targetDir;
        this.me.sitting = true;
        this.onSit?.(true);
        moving = true; // manda a posição final para os outros
      }
      this.walkGoal = null;
    }
    this.me.moving = moving && !this.me.sitting;
    this.me.running = run && moving;
    this.me.update(dt, false);
    // passos: tocam quando o pé encosta no chão na animação (os meus e os de quem anda por perto)
    if (this.me.footfall) this.onStep?.(this.me.running, 1);
    for (const a of this.others.values()) {
      if (!a.root.visible) continue; // outro andar
      a.update(dt, true);
      if (a.footfall) {
        const dist = Math.hypot(a.root.position.x - pos.x, a.root.position.z - pos.z);
        const vol = Math.max(0, 1 - dist / 7) * 0.6;
        if (vol > 0) this.onStep?.(a.running, vol);
      }
    }

    const zone = this.zoneAt(pos.x, pos.z);
    if (zone?.id !== this.currentZone?.id) {
      this.currentZone = zone;
      this.onZoneChange?.(zone);
    }

    // câmera segue com suavidade
    // (somado ao deslocamento de quando a pessoa arrasta o mapa)
    const base = this.overview ? new THREE.Vector3(0, 0, 0) : pos.clone();
    this.camTarget.lerp(base.add(this.panOffset), Math.min(1, dt * 4));
    // vista isométrica (diagonal, de cima), como em jogos de escritório/The Sims
    this.camera.position.set(this.camTarget.x + 24, 24, this.camTarget.z + 24);
    this.camera.lookAt(this.camTarget);
    // encaixa a câmera na grade de pixels para o pixel art não "tremer"
    this.camera.updateMatrixWorld();
    const unit = (this.camera.top - this.camera.bottom) / (this.host.clientHeight / this.pixelSize);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const pr = this.camera.position.dot(right);
    const pu = this.camera.position.dot(up);
    this.camera.position.addScaledVector(right, Math.round(pr / unit) * unit - pr);
    this.camera.position.addScaledVector(up, Math.round(pu / unit) * unit - pu);

    const now = performance.now();
    const state = `${pos.x.toFixed(2)},${pos.z.toFixed(2)},${this.me.targetDir.toFixed(2)},${moving},${zone?.id}`;
    if (state !== this.lastState && now - this.lastSent > 66) {
      this.lastSent = now;
      this.lastState = state;
      this.onMove?.(pos.x, pos.z, this.me.targetDir, moving, zone);
    }
    if (!this.level) this.janitor?.update(dt);
    // itens animados (Cleiton mexe as antenas e dá uma tremidinha de vez em quando)
    const tt = performance.now() / 1000;
    for (const o of this.itemGroup.children) {
      const an = o.userData.anim;
      if (an?.kind === "elevator") {
        // portas abrem com alguém perto (ou durante a viagem, comandado por elevatorDoors)
        const near = this.me && Math.hypot(this.me.root.position.x - o.position.x, this.me.root.position.z - o.position.z) < 2.4;
        const want = this.elevatorForce ?? (near ? 1 : 0);
        an.open += (want - an.open) * Math.min(1, dt * 4);
        an.left.position.x = -0.31 - an.open * 0.56;
        an.right.position.x = 0.31 + an.open * 0.56;
        (an.lamp.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(tt * 3) > 0 || !this.elevatorForce ? 0xc8f501 : 0x3d4a00);
        continue;
      }
      if (an?.kind !== "cleiton") continue;
      an.antL.rotation.x = Math.sin(tt * 5.3) * 0.25;
      an.antR.rotation.x = Math.sin(tt * 4.7 + 1) * 0.25;
      const twitch = Math.sin(tt * 0.9) > 0.97 ? Math.sin(tt * 60) * 0.04 : 0;
      an.bug.rotation.y = twitch + Math.sin(tt * 0.6) * 0.15;
    }
    this.updateDoors(dt);
    this.onFrame?.();
  }
}

// ------------------------------------------------------------------ faxineiro (NPC)
/**
 * Faxineiro que anda pelo escritório e para para limpar. A rota é a mesma para todos:
 * a posição sai do relógio (Date.now), então todo mundo vê ele no mesmo lugar sem precisar do servidor.
 */
export class Janitor {
  avatar: Avatar;
  private pts: THREE.Vector3[] = [];
  private stops: { at: number; until: number; idx: number }[] = [];
  private cycle = 1;
  private mop: THREE.Group;
  private sign: THREE.Group;
  private lastPos = new THREE.Vector3();
  static readonly SPEED = 1.25; // m/s, andar tranquilo
  static readonly CLEAN_SECS = 7;

  constructor(private world: World) {
    this.avatar = new Avatar(
      {
        id: "npc-faxina",
        name: "Seu Zé · limpeza",
        color: "#3b6fc0",
        x: 0,
        z: 0,
        dir: 0,
        moving: false,
        status: "",
        zone: null,
        look: { body: "m", skin: "#c68a5e", hair: "curto", hairColor: "#3a2a1e", top: "camiseta", topColor: "#3b6fc0", bottom: "calca", bottomColor: "#2c3e66", shoes: "#2a2a2a", head: "bone", headColor: "#3b6fc0", face: "nenhum", neck: "nenhum", beard: "bigode", ears: "nenhum" },
      },
      false,
    );
    this.avatar.label.classList.add("npc");
    // esfregão na mão
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.15, 0.05), new THREE.MeshToonMaterial({ color: 0xb98a55 }));
    stick.position.y = -0.3;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.2), new THREE.MeshToonMaterial({ color: 0xe9e4d6 }));
    head.position.y = -0.86;
    this.mop = new THREE.Group();
    this.mop.add(stick, head);
    this.avatar.char.hand.add(this.mop);
    // plaquinha de "piso molhado"
    const yel = new THREE.MeshToonMaterial({ color: 0xf2c14e });
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.03), yel);
    a.position.set(0, 0.24, 0.08);
    a.rotation.x = -0.3;
    const b = a.clone();
    b.position.z = -0.08;
    b.rotation.x = 0.3;
    this.sign = new THREE.Group();
    this.sign.add(a, b);
    this.sign.visible = false;
    world.scene.add(this.avatar.root, this.sign);
  }

  /** Monta a rota passando pelas áreas do escritório (refaz quando o mapa muda). */
  plan() {
    const L = this.world.layout;
    if (!L) return;
    const wanted: THREE.Vector3[] = [];
    const { w, d } = L.size;
    // corredor central e salas (centro de cada uma, um pouco para dentro da porta)
    wanted.push(new THREE.Vector3(-w / 2 + 3, 0, -0.5), new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(w / 2 - 3, 0, -0.5));
    for (const z of L.zones) wanted.push(new THREE.Vector3(z.x, 0, z.z));
    // ordena em volta do centro, para fazer uma volta só
    wanted.sort((p, q) => Math.atan2(p.z, p.x) - Math.atan2(q.z, q.x));
    const free = (p: THREE.Vector3) => {
      for (let r = 0; r < 3; r += 0.5)
        for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
          const q = new THREE.Vector3(p.x + dx, 0, p.z + dz);
          if (!this.world.blocked(q.x, q.z, 0.35)) return q;
        }
      return null;
    };
    const stopsAt = wanted.map(free).filter((p): p is THREE.Vector3 => !!p);
    this.pts = [];
    this.stops = [];
    let tdist = 0;
    for (let i = 0; i < stopsAt.length; i++) {
      const from = stopsAt[i];
      const to = stopsAt[(i + 1) % stopsAt.length];
      const seg = this.world.findPath(from, to);
      if (!seg.length) continue;
      if (!this.pts.length) this.pts.push(from.clone());
      // parada para limpar no começo do trecho
      this.stops.push({ at: tdist, until: tdist + Janitor.CLEAN_SECS, idx: this.pts.length - 1 });
      tdist += Janitor.CLEAN_SECS;
      let prev = this.pts[this.pts.length - 1];
      for (const p of seg) {
        tdist += prev.distanceTo(p) / Janitor.SPEED;
        this.pts.push(p.clone());
        prev = p;
      }
    }
    this.cycle = Math.max(1, tdist);
  }

  /** Posição na rota para o instante `t` (segundos). */
  update(dt: number) {
    const av = this.avatar;
    if (this.pts.length < 2) {
      av.root.visible = false;
      return;
    }
    av.root.visible = true;
    let t = (Date.now() / 1000) % this.cycle;
    let cleaning = false;
    let pos = this.pts[0].clone();
    // anda pelos trechos descontando as paradas
    let cursor = 0;
    let i = 0;
    for (const st of this.stops) {
      if (t < st.at) break;
      if (t < st.until) {
        cleaning = true;
        pos = this.pts[st.idx].clone();
        i = -1;
        break;
      }
      cursor = st.until;
      i = st.idx;
    }
    if (!cleaning) {
      let left = (t - cursor) * Janitor.SPEED;
      pos = this.pts[i].clone();
      for (let k = i; k < this.pts.length - 1 && left > 0; k++) {
        const a = this.pts[k];
        const b = this.pts[k + 1];
        const seg = a.distanceTo(b);
        if (left <= seg) {
          pos = a.clone().lerp(b, left / seg);
          left = 0;
        } else {
          left -= seg;
          pos = b.clone();
        }
      }
    }
    const moved = pos.distanceTo(this.lastPos);
    if (moved > 1e-3 && moved < 1) av.targetDir = Math.atan2(pos.x - this.lastPos.x, pos.z - this.lastPos.z);
    else if (moved >= 1) av.body.rotation.y = av.targetDir;
    this.lastPos.copy(pos);
    av.root.position.copy(pos);
    av.moving = !cleaning && moved > 1e-4;
    let d = av.targetDir - av.body.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    av.body.rotation.y += d * Math.min(1, dt * 8);
    av.update(dt, false);
    // esfregando: braço vai e volta, plaquinha no chão ao lado
    if (cleaning) {
      const s = Math.sin(performance.now() / 180);
      av.char.armR.rotation.set(-0.5 + s * 0.35, 0, 0);
      av.char.armL.rotation.set(-0.6 + s * 0.35, 0, 0);
      this.sign.visible = true;
      this.sign.position.set(pos.x + 0.7, 0, pos.z + 0.4);
    } else {
      av.char.armR.rotation.x = Math.max(av.char.armR.rotation.x, -0.2);
      this.sign.visible = false;
    }
  }

  dispose() {
    this.avatar.dispose();
    this.sign.removeFromParent();
  }
}
