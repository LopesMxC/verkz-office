import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPixelatedPass } from "three/addons/postprocessing/RenderPixelatedPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildItem, DEFS, footprint, Item, Layout, Zone } from "./furniture";
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
    const x = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(c));
    x.position.y = y;
    g.add(x);
    return x;
  };
  if (kind === "cafe") {
    b(0.1, 0.11, 0.1, "#f2f0ea");
    b(0.08, 0.01, 0.08, "#5a3a22", 0.055);
    b(0.03, 0.06, 0.02, "#f2f0ea").position.set(0.065, 0, 0);
  } else if (kind === "agua") {
    const c = b(0.08, 0.14, 0.08, "#9fd8ef");
    (c.material as THREE.MeshToonMaterial).transparent = true;
  } else if (kind === "lanche") {
    b(0.14, 0.03, 0.1, "#e6c08a");
    b(0.14, 0.02, 0.1, "#7fcf5a", 0.025);
    b(0.14, 0.03, 0.1, "#e6c08a", 0.05);
  } else if (kind === "refri") {
    b(0.07, 0.13, 0.07, "#d9534f");
  } else if (kind === "marmita") {
    b(0.18, 0.06, 0.14, "#dcd8cf");
    b(0.16, 0.02, 0.12, "#c98a55", 0.035);
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
  stepAcc = 0;
  private lastTarget = new THREE.Vector3();
  private lastTargetAt = 0;

  constructor(public info: PeerInfo, private isMe: boolean) {
    this.look = normalizeLook(info.look, info.color);
    this.root.add(this.body);
    this.body.scale.setScalar(1.25); // personagem um pouco maior, legível de longe
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
    lbl.position.set(0, 1.95, 0);
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
        if (dtt > 0.02 && dtt < 1) this.running = this.target.distanceTo(this.lastTarget) / dtt > 5.6;
        this.lastTarget.copy(this.target);
        this.lastTargetAt = now;
      }
      if (!this.moving) this.running = false;
    }
    const c = this.char;
    const pace = this.running ? 17 : 11;
    this.phase += dt * (this.moving ? pace : 2);
    const stepped = this.moving ? Math.round(Math.sin(this.phase) * 2) / 2 : 0;
    this.body.position.y = this.moving ? Math.abs(stepped) * (this.running ? 0.09 : 0.05) : 0;
    const sw = stepped * (this.running ? 0.9 : 0.6);
    c.legL.rotation.set(sw, 0, 0);
    c.legR.rotation.set(-sw, 0, 0);
    c.armL.rotation.set(-sw * 0.8, 0, 0);
    c.armR.rotation.set(sw * 0.8, 0, 0);
    c.head.rotation.set(0, 0, 0);
    c.root.rotation.set(this.running && this.moving ? 0.12 : 0, 0, 0);
    const mouth = c.head.getObjectByName("mouth");
    if (mouth) mouth.scale.y = 1;

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
        if (mouth) mouth.scale.y = 3;
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
      if (mouth) mouth.scale.y = 1 + Math.abs(Math.sin(p * 13)) * 2.4;
    } else if (this.holding && !this.moving) {
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
  layout!: Layout;
  itemGroup = new THREE.Group();
  zoneGroup = new THREE.Group();
  floor!: THREE.Mesh;
  grass?: THREE.Mesh;
  blockers: Rect[] = [];
  me!: Avatar;
  others = new Map<string, Avatar>();
  zoom = 1.3;
  camTarget = new THREE.Vector3();
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
  env!: Environment;
  holiday: Holiday | null = null;
  decorGroup = new THREE.Group();
  hemi!: THREE.HemisphereLight;
  sun!: THREE.DirectionalLight;
  /** Velocidades (m/s). */
  walkSpeed = 4.2;
  runSpeed = 7.4;
  running = false;
  private stepAcc = 0;
  currentZone: Zone | null = null;
  inputEnabled = true;
  private lastSent = 0;
  private lastState = "";
  private ray = new THREE.Raycaster();
  private clock = new THREE.Clock();

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    // resolução cheia (HD / retina): a cara de pixel art vem dos modelos e texturas, não de baixar a resolução
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping; // cores exatas da paleta (pixel art)
    this.renderer.toneMappingExposure = 1.05;
    host.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "labels";
    host.appendChild(this.labels.domElement);

    this.scene.background = new THREE.Color(0x8fcf72);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8070, 1.45);
    this.hemi = hemi;
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.35);
    this.sun = sun;
    sun.position.set(-10, 26, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const s = 34;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 80 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);

    this.scene.add(this.itemGroup, this.zoneGroup, this.decorGroup);
    this.env = new Environment(
      this.scene,
      hemi,
      sun,
      () => this.layout?.size ?? { w: 32, d: 22 },
      () => this.grass,
      () => foliageMaterials,
    );

    this.composer = new EffectComposer(this.renderer);
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
  setLayout(layout: Layout) {
    this.layout = layout;
    // CSS2DObject só tira o elemento do DOM quando ele mesmo é removido; aqui eles são netos.
    this.zoneGroup.traverse((o) => {
      if (o instanceof CSS2DObject) o.element.remove();
    });
    this.itemGroup.clear();
    this.zoneGroup.clear();
    if (this.floor) this.floor.removeFromParent();

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
    for (const it of layout.items) this.addItemMesh(it);
    for (const z of layout.zones) this.addZoneMesh(z);
    this.currentZone = null;
    this.placeDecor();
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
      } else if (floor === "madeira") {
        for (let y = 0, row = 0; y < zh; y += 8, row++) {
          let x = -((row * 29) % 80);
          while (x < zw) {
            const len = 48 + Math.floor(r() * 48);
            g.fillStyle = ["#b98557", "#c08d5e", "#b07c4f", "#c4935f"][Math.floor(r() * 4)];
            g.fillRect(x0 + Math.max(0, x), y0 + y, Math.min(len, zw - Math.max(0, x)), 7);
            g.fillStyle = "#9c6c43";
            g.fillRect(x0 + Math.max(0, x), y0 + y + 7, Math.min(len, zw - Math.max(0, x)), 1);
            x += len;
            if (x < zw) g.fillRect(x0 + x - 1, y0 + y, 1, 7);
          }
        }
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

  addItemMesh(it: Item) {
    const obj = buildItem(it);
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
    for (const it of this.layout.items) {
      if (!DEFS[it.type]?.blocks) continue;
      const f = footprint(it);
      this.blockers.push({ x0: it.x - f.w / 2, x1: it.x + f.w / 2, z0: it.z - f.d / 2, z1: it.z + f.d / 2 });
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

  addPeer(info: PeerInfo) {
    this.removePeer(info.id);
    const a = new Avatar(info, false);
    if (this.holiday) a.setHoliday(this.holiday);
    a.targetDir = info.dir;
    a.body.rotation.y = info.dir;
    this.others.set(info.id, a);
    this.scene.add(a.root);
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
    a.info.zone = zone;
  }

  // ---------- colisão e caminho
  blocked(x: number, z: number, r = 0.28) {
    const { w, d } = this.layout.size;
    if (Math.abs(x) > w / 2 + 0.5 - r || Math.abs(z) > d / 2 + 0.5 - r) return true;
    for (const b of this.blockers) {
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
      return !this.blocked(x, z, 0.22);
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
        if (out.length) out[out.length - 1].set(to.x, 0, to.z);
        if (out.length && this.blocked(to.x, to.z)) out.pop();
        return out;
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

  walkTo(x: number, z: number) {
    this.path = this.findPath(this.me.root.position, new THREE.Vector3(x, 0, z));
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
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
    const shift = (e: KeyboardEvent) => (this.running = e.shiftKey);
    window.addEventListener("keydown", shift);
    window.addEventListener("keyup", shift);

    const el = this.labels.domElement;
    el.addEventListener("wheel", (e) => {
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.8, 3.2);
      this.updateFrustum();
      e.preventDefault();
    }, { passive: false });

    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement) !== el) return; // cliques em nameplates etc.
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
      if (this.inputEnabled) this.walkTo(p.x, p.z);
    });
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (this.editing) return;
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
    const roots = [...this.others.values()].map((a) => a.root);
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
      this.composer.render();
      this.labels.render(this.scene, this.camera);
    };
    tick();
  }

  private step(dt: number) {
    if (!this.me) return;
    const pos = this.me.root.position;
    let vx = 0;
    let vz = 0;
    const k = this.keys;
    // W/S andam para cima/baixo da tela, A/D para os lados
    if (k.has("w") || k.has("arrowup")) vz -= 1;
    if (k.has("s") || k.has("arrowdown")) vz += 1;
    if (k.has("a") || k.has("arrowleft")) vx -= 1;
    if (k.has("d") || k.has("arrowright")) vx += 1;

    if (!vx && !vz && this.path.length) {
      const next = this.path[0];
      const dx = next.x - pos.x;
      const dz = next.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.08) this.path.shift();
      else { vx = dx / dist; vz = dz / dist; }
    }

    const run = this.running && (vx !== 0 || vz !== 0 || this.path.length > 0);
    const speed = run ? this.runSpeed : this.walkSpeed;
    const len = Math.hypot(vx, vz);
    const moving = len > 0;
    if (moving) {
      vx = (vx / len) * speed * dt;
      vz = (vz / len) * speed * dt;
      if (!this.blocked(pos.x + vx, pos.z)) pos.x += vx;
      if (!this.blocked(pos.x, pos.z + vz)) pos.z += vz;
      this.me.targetDir = Math.atan2(vx, vz);
    }
    let d = this.me.targetDir - this.me.body.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.me.body.rotation.y += d * Math.min(1, dt * 14);
    this.me.moving = moving;
    this.me.running = run && moving;
    this.me.update(dt, false);
    // passos: os meus e os de quem anda por perto (mais baixo com a distância)
    if (moving) {
      this.stepAcc += dt * (run ? 3.4 : 2.2);
      if (this.stepAcc >= 1) {
        this.stepAcc = 0;
        this.onStep?.(run, 1);
      }
    } else this.stepAcc = 0.6;
    for (const a of this.others.values()) {
      a.update(dt, true);
      if (a.moving) {
        a.stepAcc += dt * (a.running ? 3.4 : 2.2);
        if (a.stepAcc >= 1) {
          a.stepAcc = 0;
          const dist = Math.hypot(a.root.position.x - pos.x, a.root.position.z - pos.z);
          const vol = Math.max(0, 1 - dist / 7) * 0.6;
          if (vol > 0) this.onStep?.(a.running, vol);
        }
      }
    }

    const zone = this.zoneAt(pos.x, pos.z);
    if (zone?.id !== this.currentZone?.id) {
      this.currentZone = zone;
      this.onZoneChange?.(zone);
    }

    // câmera segue com suavidade
    this.camTarget.lerp(pos, Math.min(1, dt * 4));
    // vista de cima, levemente inclinada (frente dos móveis aparece, como num jogo 2D)
    this.camera.position.set(this.camTarget.x, 26, this.camTarget.z + 24);
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
    this.onFrame?.();
  }
}
