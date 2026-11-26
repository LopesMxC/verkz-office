import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { rugPreview, RUG_PATTERNS, RUG_PALETTES, RUG_STYLES, RUG_PATTERN_NAMES, rugPalette } from "./rugs";
import { buildItem, DEFS, RUG_RE, PLANT_VARIANTS, imageToDataUrl, Item, Layout, levelIds, levelName, levelView, mergeLevel, PALETTE, perimeterWalls, PHOTO_TYPES, ROLES, WALL_MOUNT, Zone, WINDOW_STYLES, DOOR_STYLES, OfficeStyle } from "./furniture";
import type { World } from "./world";
import { icon } from "./icons";
import { ensureThumbs } from "./thumbs";
import { REG as PACK } from "../pack";
import { openImageBank } from "../pack/imagebank";
import { openImageEditor } from "./imgedit";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const isWall = (t: string) => t === "wall" || t === "window_wall";
/** O que só a gestão pode pôr, mexer ou tirar. */
const LOCKED = new Set(["wall", "window_wall", "glass_wall", "elevator"]);

/** Tamanhos das salas prontas (largura x profundidade, em metros). */
const ROOM_SIZES: Record<string, [number, number]> = {
  pequena: [5, 5],
  media: [7, 6],
  grande: [9, 7],
  auditorio: [12, 9],
};

export const FLOORS: [string, string, string][] = [
  ["carpete-azul", "Carpete azul", "#7d86c2"],
  ["carpete-verde", "Carpete verde", "#7fae8c"],
  ["carpete-lilas", "Carpete lilás", "#a790cf"],
  ["carpete-grafite", "Carpete grafite", "#5d606c"],
  ["madeira", "Madeira", "#b98557"],
  ["madeira-escura", "Madeira escura", "#6e4a32"],
  ["ceramica", "Cerâmica", "#bcbfc8"],
  ["porcelanato", "Porcelanato", "#e4e2dc"],
  ["concreto", "Concreto", "#a9a8a4"],
  ["madeira-clara", "Madeira clara", "#e3c698"],
  ["espinha", "Espinha de peixe", "#a97a4d"],
  ["xadrez", "Xadrez", "#23252c"],
  ["marmore", "Mármore", "#ebe9e4"],
  ["ardosia", "Ardósia", "#3b3f48"],
];

/** Molduras de janela prontas. */
const FRAME_COLORS = ["#f7f5f0", "#2e3139", "#0D0D0D", "#9a6b45", "#C8F501", "#c0392b"];

/** Cores prontas para móveis, tapetes e pisos (e o seletor livre ao lado). */
const COLORS = ["#C8F501", "#0D0D0D", "#f4f1ea", "#9aa0ab", "#5d606c", "#c0392b", "#e67e22", "#f2c14e", "#27ae60", "#16a085", "#3b6fc0", "#2c3e8f", "#8a6cc9", "#d65db1", "#b98557", "#6e4a32"];

/** Categorias da paleta de móveis. */
const CATEGORIES: [string, string, RegExp][] = [
  ["todos", "Todos", /.*/],
  ["escritorio", "Escritório", /^(elevator|desk|office_chair|exec_chair|conf_table|whiteboard|tv|cabinet|bookshelf|.*_panel|speaker|neon_logo|floor_logo|cabinet_plain|shelf_.*|p_(standing_desk|desk_l|printer|locker|filing|safe|trash|recycle|corkboard|kanban|projector|phone_booth))$/],
  ["assentos", "Assentos", /^(chair.*|wood_chair|stool.*|sofa.*|armchair.*|beanbag|k_chair_.|pillow_.|p_(gamer_chair|bench|sofa_l|hammock|lounge))$/],
  ["mesas", "Mesas", /^(table.*|coffee_table|k_table.*|k_round.*|conf_table|desk|p_(bar_table|side_table|desk_l|standing_desk))$/],
  ["cozinha", "Cozinha", /^(k_.*|fridge|microwave|coffee|water|counter|p_(vending|espresso|fruit_bowl|water_jug))$/],
  ["tapetes", "Tapetes", /^rug.*$/],
  ["plantas", "Plantas", /^(plant.*|bamboo|cactus.*|p_(monstera|succulents|fern|planter_long|olive))$/],
  ["decor", "Decoração", /^(frame.*|photo_.*|photo_frame|lamp.*|books|book_single|k_pillar|clock_panel|neon_.*|cabinet_small.*|p_(aquarium|globe|trophy|trophy_cup|neon_ring|clock_wall|mirror|floor_lamp|vase|books|bookcase_full|coat_rack|fireplace))$/],
  ["lazer", "Lazer e descanso", /^(radio|speaker|p_(radio_small|radio_retro|radio_console|boombox|speaker_.*|tv_vintage|jukebox|turntable|gramophone|soundbar|studio_monitors)|pool_table|ping_pong|arcade|bed.*|beanbag|tv|p_(foosball|dartboard|videogame|guitar|keyboard|basket|hammock|lounge))$/],
  ["banheiro", "Banheiro", /^(toilet|sink|stall|k_towelrail|p_(towel|hamper|mirror))$/],
];

// categorias do pacote novo (uma por categoria do pacote)
{
  const by = new Map<string, string[]>();
  for (const p of PACK) (by.get(p.cat) ?? by.set(p.cat, []).get(p.cat)!).push(p.id);
  for (const [name, ids] of by) CATEGORIES.push(["pk:" + name, name, new RegExp("^(" + ids.join("|") + ")$")]);
}

const catCounts = new Map<string, number>();
/** Quantos móveis a categoria tem (para mostrar no seletor). */
function catCount(c: [string, string, RegExp]) {
  let n = catCounts.get(c[0]);
  if (n === undefined) {
    n = PALETTE.filter((t) => t !== "floor_logo" && !isWall(t) && c[2].test(t) && !(c[0] === "todos" && t.startsWith("pk_"))).length;
    catCounts.set(c[0], n);
  }
  return n;
}

type Tool = null | "zone" | "wall" | "erase" | string; // string = tipo de móvel

/**
 * Editor do escritório.
 *  - Móveis: colocar, mover, girar, duplicar e remover.
 *  - Salas: desenhar (com paredes automáticas), renomear, privada ou aberta, piso, tamanho, posição, paredes.
 *  - Salas: também salas prontas (acha espaço livre sozinho e, se faltar, amplia o prédio).
 *  - Prédio: tamanho do escritório, ampliar um lado só, desenhar e apagar paredes.
 * As mudanças só valem para todo mundo ao clicar em "Salvar para todos".
 */
export class Editor {
  active = false;
  /**
   * Quem não é da gestão personaliza o escritório inteiro, mas só os móveis.
   * Prédio, salas (criar/apagar/mudar), paredes e elevador ficam com a gestão.
   * false = pode editar tudo (gestão).
   */
  limit = false;
  onClose?: () => void;
  private panel: HTMLDivElement;
  /** O andar que está sendo editado (itens e salas dele). No térreo é o próprio `full`. */
  private draft!: Layout;
  /** Layout completo, com todos os andares (é o que vai para o servidor). */
  private full!: Layout;
  /** Andar em edição. */
  private lv = 0;
  private original!: string;
  private tab: "moveis" | "salas" | "predio" = "moveis";
  private filter = "";
  private tool: Tool = null;
  /** Fora da gestão: clicar numa janela do escritório a troca por parede lisa (para pendurar quadro). */
  private winMode = false;
  private withWalls = true;
  private quickSize = "media";
  private category = "todos";
  private quickPriv = true;
  private rot = 0;
  /** Posição livre: sem grade, sem ímã nas paredes e com giro em qualquer ângulo (fica salvo neste aparelho). */
  private free = (() => {
    try {
      return localStorage.getItem("verkz-editor-free") === "1";
    } catch {
      return false;
    }
  })();
  private ghost: THREE.Object3D | null = null;
  private selected: Item | null = null;
  private selZone: string | null = null;
  private selBox = new THREE.BoxHelper(new THREE.Object3D(), 0xc8f501);
  private zoneOutline: THREE.LineLoop;
  private quick: CSS2DObject;
  private dragStart: THREE.Vector3 | null = null;
  private preview: THREE.Mesh;
  /** Sala sendo arrastada para outro lugar. */
  private zdrag: { z: Zone; sx: number; sz: number; dx: number; dz: number; moved: boolean; ok: boolean } | null = null;
  private zdragDone = false;

  constructor(private world: World, hud: HTMLElement, private onSave: (l: Layout) => void, private toast: (m: string) => void) {
    this.panel = document.createElement("div");
    this.panel.className = "panel editor hidden";
    hud.appendChild(this.panel);

    this.preview = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xc8f501, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    this.preview.rotation.x = -Math.PI / 2;
    this.preview.position.y = 0.04;

    this.zoneOutline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0, -0.5), new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(-0.5, 0, 0.5)]),
      new THREE.LineBasicMaterial({ color: 0xc8f501 }),
    );
    this.zoneOutline.position.y = 0.05;

    // barrinha flutuante sobre o móvel selecionado
    const q = document.createElement("div");
    q.className = "panel quick";
    q.innerHTML = `<button data-q="rot" title="Girar (R)">${icon("rotate", 16)}</button><button data-q="dup" title="Duplicar (D)">${icon("copy", 16)}</button><button class="del" data-q="del" title="Remover (Delete)">${icon("trash", 16)}</button>`;
    q.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("[data-q]") as HTMLElement | null;
      if (b?.dataset.q === "rot") this.rotate();
      if (b?.dataset.q === "dup") this.duplicate();
      if (b?.dataset.q === "del") this.removeSelected();
      e.stopPropagation();
    });
    this.quick = new CSS2DObject(q);
    this.quick.center.set(0.5, 1);

    const el = world.labels.domElement;
    el.addEventListener("mousemove", (e) => this.onMouseMove(e));
    el.addEventListener("mousedown", (e) => this.onMouseDown(e));
    el.addEventListener("mouseup", (e) => this.onMouseUp(e));
    el.addEventListener("mouseleave", () => {
      if (this.zdrag) {
        this.zdrag = null;
        this.preview.removeFromParent();
      }
    });
    window.addEventListener("keydown", (e) => {
      const ae = document.activeElement;
      if (!this.active) return;
      const pg = e.key === "PageUp" || e.key === "PageDown";
      const grow = ["+", "=", "-", "_"].includes(e.key);
      // campos de texto seguram as teclas (menos PageUp/PageDown em caixas de uma linha); lista de categorias só deixa altura e tamanho
      if (ae instanceof HTMLTextAreaElement || (ae instanceof HTMLInputElement && !["range", "checkbox", "color", "button"].includes(ae.type) && !pg)) return;
      if (ae instanceof HTMLSelectElement && !pg && !grow) return;
      if (ae instanceof HTMLInputElement && ae.type === "range" && e.key.startsWith("Arrow")) ae.blur(); // setas movem o móvel, não o controle
      const stp = e.shiftKey ? 0.1 : 0.02;
      if (pg && !LOCKED.has(this.selected?.type ?? "")) {
        // PageUp/PageDown sobem e descem o móvel selecionado (2 cm; Shift 10 cm) ou o que vai ser colocado
        e.preventDefault();
        if (this.selected && !this.tool) {
          this.selected.y = Math.max(-0.8, Math.min(3, Math.round(((this.selected.y ?? 0) + (e.key === "PageUp" ? stp : -stp)) * 100) / 100));
          this.apply();
          this.renderPanel();
        } else if (this.tool && !["zone", "wall", "erase"].includes(this.tool)) {
          this.placeY = Math.max(-0.8, Math.min(3, Math.round((this.placeY + (e.key === "PageUp" ? stp : -stp)) * 100) / 100));
          if (this.ghost) this.ghost.position.y = this.placeY;
          this.toast(`Altura ${Math.round(this.placeY * 100)} cm`);
        }
        return;
      }
      if (grow && !(ae instanceof HTMLInputElement && !["range", "checkbox", "color", "button"].includes(ae.type))) {
        // + e - aumentam e diminuem o móvel (5%; Shift 25%)
        const f = (e.key === "+" || e.key === "=" ? 1 : -1) * (e.shiftKey ? 0.25 : 0.05);
        if (this.selected && !this.tool && !LOCKED.has(this.selected.type)) {
          this.selected.s = Math.max(0.2, Math.min(4, Math.round(((this.selected.s ?? 1) + f) * 100) / 100));
          if (this.selected.s === 1) delete this.selected.s;
          this.apply();
          this.renderPanel();
          e.preventDefault();
        } else if (this.tool && !["zone", "wall", "erase"].includes(this.tool)) {
          this.placeS = Math.max(0.2, Math.min(4, Math.round((this.placeS + f) * 100) / 100));
          if (this.ghost) this.ghost.scale.setScalar(this.placeS);
          this.toast(`Tamanho ${Math.round(this.placeS * 100)}%`);
          e.preventDefault();
        }
        return;
      }
      if (e.key === "r" || e.key === "R") this.rotate(e.shiftKey ? 90 : undefined);
      if (this.selected && !this.tool && !LOCKED.has(this.selected.type) && e.key.startsWith("Arrow")) {
        // setas empurram o móvel selecionado (livre: 10 cm, Shift 2 cm; com grade: meio metro)
        const st = this.free ? (e.shiftKey ? 0.02 : 0.1) : 0.5;
        const dx = e.key === "ArrowRight" ? st : e.key === "ArrowLeft" ? -st : 0;
        const dz = e.key === "ArrowDown" ? st : e.key === "ArrowUp" ? -st : 0;
        const nx = Math.round((this.selected.x + dx) * 100) / 100, nz = Math.round((this.selected.z + dz) * 100) / 100;
        e.preventDefault();
        if (this.allowed(nx, nz)) {
          this.selected.x = nx;
          this.selected.z = nz;
          this.apply();
        }
      }
      if ((e.key === "d" || e.key === "D") && this.selected) this.duplicate();
      if (e.key === "Delete" || e.key === "Backspace") this.removeSelected();
      if (e.key === "Escape") {
        this.selected = null;
        this.highlight();
        this.setTool(null);
      }
    });
  }

  // ------------------------------------------------------------------ ciclo
  toggle() {
    this.active ? this.cancel() : this.open();
  }

  /** Abre (ou mantém aberto) numa aba específica. */
  showTab(tab: "moveis" | "salas" | "predio") {
    if (!this.active) this.open();
    if (this.limit) return;
    this.tab = tab;
    this.setTool(null);
  }

  open() {
    this.active = true;
    this.winMode = false;
    // editando, o personagem fica em pé (sentado ele "flutuaria" se a cadeira mudasse de lugar)
    this.world.standUp();
    this.lv = this.world.level;
    this.full = JSON.parse(JSON.stringify(this.world.fullLayout));
    this.draft = levelView(this.full, this.lv);
    this.original = JSON.stringify(this.world.fullLayout);
    this.world.onFloorClick = (p, e) => this.onClick(p, e);
    // arrastar o mapa vale no editor, menos quando o arraste desenha sala ou parede
    // (na aba Salas o arraste com o botão esquerdo muda a sala de lugar; o mapa anda com o botão do meio)
    this.world.canPanEdit = (e) => this.tool !== "zone" && this.tool !== "wall" && !(this.tab === "salas" && !this.limit) && !this.itemUnder(e);
    this.world.setEditCam(true);
    this.panel.classList.remove("hidden");
    this.setTool(null);
    this.toast("Visão aérea: segure o botão do meio do mouse para mover a câmera. Na aba Salas, arraste uma sala para mudar de lugar.");
  }

  private close() {
    this.active = false;
    this.world.onFloorClick = undefined;
    this.world.canPanEdit = undefined;
    this.zdrag = null;
    this.world.setEditCam(false);
    this.panel.classList.add("hidden");
    this.clearGhost();
    this.selected = null;
    this.selZone = null;
    this.highlight();
    this.preview.removeFromParent();
    this.onClose?.();
  }

  cancel() {
    this.world.setLayout(JSON.parse(this.original));
    this.close();
  }

  save() {
    this.full = mergeLevel(this.full, this.lv, this.draft);
    this.onSave(this.full);
    this.world.setLayout(this.full);
    this.close();
    this.toast("Escritório salvo para todo mundo");
  }

  private apply() {
    this.full = mergeLevel(this.full, this.lv, this.draft);
    this.world.setLayout(this.full);
    this.highlight();
  }

  // ------------------------------------------------------------------ andares
  /** Cria o próximo andar: paredes de fora com janelas e os elevadores no mesmo lugar dos do térreo. */
  private addLevel() {
    this.full = mergeLevel(this.full, this.lv, this.draft);
    const ids = levelIds(this.full);
    const next = Math.max(...ids) + 1;
    if (next > 4) {
      this.toast("O prédio já tem 5 andares");
      return;
    }
    const ground = this.full.items;
    let elevators = ground.filter((i) => i.type === "elevator");
    if (!elevators.length) {
      // sem elevador no térreo: põe um perto da entrada
      const spot = this.elevatorSpot(ground);
      if (!spot) {
        this.toast("Não achei espaço para o elevador no térreo. Abra um espaço de 2 x 2 m perto da entrada.");
        return;
      }
      const el: Item = { id: uid("e"), type: "elevator", x: spot.x, z: spot.z, rot: 0 };
      ground.push(el);
      elevators = [el];
    }
    const { w, d } = this.full.size;
    const items: Item[] = [...perimeterWalls(w, d, false, () => uid("w")), ...elevators.map((e) => ({ ...e, id: uid("e") }))];
    this.full.levels = [...(this.full.levels ?? []), { id: next, name: levelName(next), items, zones: [] }];
    this.draft = levelView(this.full, this.lv);
    this.world.setLayout(this.full);
    this.renderPanel();
    this.toast(`${levelName(next)} criado. Use o elevador para subir e montar as salas.`);
  }

  /** Apaga o andar de cima (só o último, para não deixar andar "flutuando"). */
  private removeTopLevel() {
    this.full = mergeLevel(this.full, this.lv, this.draft);
    const ids = levelIds(this.full);
    const top = Math.max(...ids);
    if (!top) return;
    if (!confirm(`Apagar o ${levelName(top)} com tudo o que tem nele?`)) return;
    this.full.levels = (this.full.levels ?? []).filter((L) => L.id !== top);
    if (this.lv === top) {
      this.lv = 0;
      this.world.level = 0;
    }
    this.draft = levelView(this.full, this.lv);
    this.world.setLayout(this.full);
    this.renderPanel();
    this.toast(`${levelName(top)} apagado`);
  }

  /** Lugar livre de 2 x 2 m no térreo, perto da entrada (embaixo, no meio), para o elevador. */
  private elevatorSpot(items: Item[]): { x: number; z: number } | null {
    const { W, D } = this.half();
    const zones = this.full.zones;
    // nada de móvel (nem tapete) embaixo, e fora das salas fechadas
    const free = (x: number, z: number) =>
      !items.some((it) => !DEFS[it.type]?.outdoor && Math.abs(it.x - x) < 1.8 && Math.abs(it.z - z) < 1.6) &&
      !zones.some((zn) => zn.private && Math.abs(x - zn.x) < zn.w / 2 + 1.2 && Math.abs(z - zn.z) < zn.d / 2 + 1);
    const inZone = (x: number, z: number) => zones.some((zn) => Math.abs(x - zn.x) < zn.w / 2 + 1.2 && Math.abs(z - zn.z) < zn.d / 2 + 1);
    let best: { x: number; z: number } | null = null;
    let bd = Infinity;
    for (let x = -W + 2; x <= W - 2; x++)
      for (let z = -D + 2; z <= D - 2; z++) {
        if (Math.abs(x) < 3 && z > D - 4) continue; // não tapa a porta
        if (!free(x, z)) continue;
        // prefere o corredor (fora de qualquer sala) e perto da entrada
        const dd = Math.hypot(x - 4, z - (D - 3)) + (inZone(x, z) ? 30 : 0);
        if (dd < bd) (bd = dd), (best = { x, z });
      }
    return best;
  }

  /** Elevador novo: aparece também nos outros andares, no mesmo lugar. */
  private syncElevator(it: Item) {
    if (it.type !== "elevator") return;
    this.full = mergeLevel(this.full, this.lv, this.draft);
    const lists = [this.full.items, ...(this.full.levels ?? []).map((L) => L.items)];
    for (const list of lists) {
      if (list === this.draft.items) continue;
      if (list.some((o) => o.type === "elevator" && Math.hypot(o.x - it.x, o.z - it.z) < 1)) continue;
      list.push({ ...it, id: uid("e") });
    }
  }

  // ------------------------------------------------------------------ ferramentas
  /** Móvel (não parede) sob o mouse, quando dá para arrastá-lo: sem ferramenta de colocar/apagar ativa. */
  private itemUnder(e: MouseEvent): Item | null {
    if (!this.active || this.tool || (this.tab === "salas" && !this.limit) || e.shiftKey) return null;
    const o = this.world.pickItem(e);
    const it = o ? this.draft.items.find((i) => i.id === o.userData.itemId) : null;
    return it && !LOCKED.has(it.type) ? it : null;
  }
  /** Imagem original de cada quadro nesta sessão (para editar de novo sem perder qualidade). */
  private origImg = new Map<string, string>();
  private idrag: { it: Item; ox: number; oz: number; sx: number; sz: number; moved: boolean; obj: THREE.Object3D } | null = null;

  /** Altura e tamanho do móvel que vai ser colocado (PageUp/PageDown, + e -). */
  private placeY = 0;
  private placeS = 1;

  private setTool(t: Tool) {
    if (t !== this.tool) {
      this.placeY = 0;
      this.placeS = 1;
    }
    this.tool = t;
    this.clearGhost();
    this.preview.removeFromParent();
    this.dragStart = null;
    if (t && !["zone", "wall", "erase"].includes(t)) {
      this.ghost = buildItem({ id: "ghost", type: t, x: 0, z: 0, rot: this.rot });
      this.ghost.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const src = Array.isArray(m.material) ? m.material[0] : m.material;
          const mat = src.clone();
          mat.transparent = true;
          mat.opacity = 0.55;
          m.material = mat;
          m.castShadow = false;
        }
      });
      this.ghost.visible = false;
      this.world.scene.add(this.ghost);
      this.selected = null;
      this.highlight();
    }
    this.renderPanel();
  }

  private clearGhost() {
    this.ghost?.removeFromParent();
    this.ghost = null;
  }

  private snap(p: THREE.Vector3) {
    if (this.free) return { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 };
    return { x: Math.round(p.x * 2) / 2, z: Math.round(p.z * 2) / 2 };
  }

  private rotate(step = this.free ? 15 : 90) {
    if (this.selected) {
      this.selected.rot = (Math.round(this.selected.rot) + step) % 360;
      this.apply();
      this.renderPanel();
    } else {
      this.rot = (this.rot + step) % 360;
      if (this.ghost) this.ghost.rotation.y = -(this.rot * Math.PI) / 180;
    }
  }

  private duplicate() {
    if (!this.selected) return;
    const copy: Item = { ...this.selected, id: uid("i"), x: this.selected.x + 1, room: undefined };
    if (!this.allowed(copy.x, copy.z)) copy.x = this.selected.x - 1;
    if (!this.allowed(copy.x, copy.z)) return this.toast("Não cabe mais nada desse lado da sala");
    this.draft.items.push(copy);
    this.selected = copy;
    this.apply();
    this.renderPanel();
  }

  private removeSelected() {
    if (!this.selected) return;
    this.draft.items = this.draft.items.filter((i) => i !== this.selected);
    this.selected = null;
    this.apply();
    this.renderPanel();
  }

  private highlight() {
    this.selBox.removeFromParent();
    this.quick.removeFromParent();
    this.zoneOutline.removeFromParent();
    if (this.selected) {
      const obj = this.world.itemGroup.children.find((o) => o.userData.itemId === this.selected!.id);
      if (obj) {
        this.selBox.setFromObject(obj);
        this.world.scene.add(this.selBox);
        const box = new THREE.Box3().setFromObject(obj);
        this.quick.position.set((box.min.x + box.max.x) / 2, box.max.y + 0.35, (box.min.z + box.max.z) / 2);
        this.world.scene.add(this.quick);
      }
    }
    const z = this.selZone && this.draft?.zones.find((x) => x.id === this.selZone);
    if (z) {
      this.zoneOutline.scale.set(z.w, 1, z.d);
      this.zoneOutline.position.set(z.x, 0.05, z.z);
      this.world.scene.add(this.zoneOutline);
    }
  }

  // ------------------------------------------------------------------ paredes
  private half() {
    return { W: this.draft.size.w / 2, D: this.draft.size.d / 2 };
  }

  private onPerimeter(x: number, z: number) {
    const { W, D } = this.half();
    return Math.abs(Math.abs(x) - W) < 0.01 || Math.abs(Math.abs(z) - D) < 0.01;
  }

  private wallAt(x: number, z: number) {
    return this.draft.items.find((i) => isWall(i.type) && Math.abs(i.x - x) < 0.01 && Math.abs(i.z - z) < 0.01);
  }

  /** Células (centros inteiros) da borda interna de uma sala. */
  private roomCells(z: Zone) {
    const i0 = Math.ceil(z.x - z.w / 2 + 0.5 - 0.01);
    const i1 = Math.floor(z.x + z.w / 2 - 0.5 + 0.01);
    const j0 = Math.ceil(z.z - z.d / 2 + 0.5 - 0.01);
    const j1 = Math.floor(z.z + z.d / 2 - 0.5 + 0.01);
    return { i0, i1, j0, j1 };
  }

  private removeRoomWalls(z: Zone) {
    const gone = new Set(this.roomWalls(z));
    this.draft.items = this.draft.items.filter((it) => !gone.has(it));
  }

  /** Paredes que cercam a sala (as dela e as soltas na borda). */
  private roomWalls(z: Zone) {
    const { i0, i1, j0, j1 } = this.roomCells(z);
    const near = (it: Item) => {
      if (it.room === z.id) return true;
      if (!isWall(it.type) || this.onPerimeter(it.x, it.z)) return false;
      const inX = it.x >= i0 - 1.01 && it.x <= i1 + 1.01;
      const inZ = it.z >= j0 - 1.01 && it.z <= j1 + 1.01;
      const onCol = (Math.abs(it.x - i0) < 1.01 || Math.abs(it.x - i1) < 1.01) && inZ;
      const onRow = (Math.abs(it.z - j0) < 1.01 || Math.abs(it.z - j1) < 1.01) && inX;
      return !this.insideStrict(it, i0, i1, j0, j1) && (onCol || onRow);
    };
    return this.draft.items.filter(near);
  }

  private insideStrict(it: Item, i0: number, i1: number, j0: number, j1: number) {
    return it.x > i0 + 0.01 && it.x < i1 - 0.01 && it.z > j0 + 0.01 && it.z < j1 - 0.01;
  }

  private hasRoomWalls(z: Zone) {
    if (this.draft.items.some((i) => i.room === z.id)) return true;
    const { i0, i1, j0, j1 } = this.roomCells(z);
    return this.draft.items.some(
      (it) =>
        isWall(it.type) &&
        !this.onPerimeter(it.x, it.z) &&
        ((Math.abs(it.x - i0) < 1.01 || Math.abs(it.x - i1) < 1.01 || Math.abs(it.z - j0) < 1.01 || Math.abs(it.z - j1) < 1.01) &&
          it.x >= i0 - 1.01 && it.x <= i1 + 1.01 && it.z >= j0 - 1.01 && it.z <= j1 + 1.01) &&
        !this.insideStrict(it, i0, i1, j0, j1),
    );
  }

  /** Paredes na borda da sala, com uma porta de 2 células no lado mais perto do centro do prédio. */
  private addRoomWalls(z: Zone) {
    const { i0, i1, j0, j1 } = this.roomCells(z);
    if (i1 - i0 < 2 || j1 - j0 < 2) {
      this.toast("A sala precisa ter pelo menos 3 x 3 para ganhar paredes");
      return;
    }
    const sides = [
      { name: "n", mid: [(i0 + i1) / 2, j0] },
      { name: "s", mid: [(i0 + i1) / 2, j1] },
      { name: "o", mid: [i0, (j0 + j1) / 2] },
      { name: "l", mid: [i1, (j0 + j1) / 2] },
    ].filter((s) => !this.onPerimeter(s.mid[0], s.mid[1]));
    sides.sort((a, b) => Math.hypot(a.mid[0], a.mid[1]) - Math.hypot(b.mid[0], b.mid[1]));
    const door = sides[0];
    const isDoor = (x: number, zz: number) => {
      if (!door) return false;
      if (door.name === "n" || door.name === "s") {
        const m = Math.floor((i0 + i1) / 2);
        return zz === door.mid[1] && (x === m || x === m + 1);
      }
      const m = Math.floor((j0 + j1) / 2);
      return x === door.mid[0] && (zz === m || zz === m + 1);
    };
    const put = (x: number, zz: number) => {
      if (this.onPerimeter(x, zz) || this.wallAt(x, zz) || isDoor(x, zz)) return;
      this.draft.items.push({ id: uid("w"), type: "wall", x, z: zz, rot: 0, room: z.id });
    };
    for (let x = i0; x <= i1; x++) {
      put(x, j0);
      put(x, j1);
    }
    for (let zz = j0 + 1; zz < j1; zz++) {
      put(i0, zz);
      put(i1, zz);
    }
  }

  /** Muda o tamanho do prédio e refaz as paredes de fora (com janelas e a entrada no meio de baixo). */
  private resizeOffice(dw: number, dd: number) {
    const w = Math.max(12, Math.min(80, this.draft.size.w + dw));
    const d = Math.max(10, Math.min(60, this.draft.size.d + dd));
    if (w === this.draft.size.w && d === this.draft.size.d) return;
    this.draft.items = this.draft.items.filter((it) => !(isWall(it.type) && this.onPerimeter(it.x, it.z)));
    // andares de cima: refaz as paredes de fora no tamanho novo
    for (const L of this.draft.levels ?? []) L.items = L.items.filter((it) => !(isWall(it.type) && this.onPerimeter(it.x, it.z)));
    this.draft.size = { w, d };
    for (const L of this.draft.levels ?? []) L.items.push(...perimeterWalls(w, d, false, () => uid("w")));
    const W = w / 2;
    const D = d / 2;
    // tira árvores e plantas de fora que ficariam dentro do prédio
    this.draft.items = this.draft.items.filter((it) => !(DEFS[it.type]?.outdoor && Math.abs(it.x) < W + 1.5 && Math.abs(it.z) < D + 1.5));
    const add = (type: string, x: number, z: number) => this.draft.items.push({ id: uid("w"), type, x, z, rot: 0 });
    for (let x = -W; x <= W; x++) {
      add(x % 4 === 2 && Math.abs(x) < W - 1 ? "window_wall" : "wall", x, -D);
      if (Math.abs(x) > 2) add(x % 5 === 0 && Math.abs(x) > 4 && Math.abs(x) < W - 1 ? "window_wall" : "wall", x, D);
    }
    for (let z = -D + 1; z < D; z++) {
      add(z % 4 === 0 ? "window_wall" : "wall", -W, z);
      add(z % 4 === 0 ? "window_wall" : "wall", W, z);
    }
    this.draft.spawn = { x: 0, z: D - 3 };
    this.apply();
    this.renderPanel();
  }

  /**
   * Aumenta (n > 0) ou diminui (n < 0) o prédio só de um lado, em passos de 2 m.
   * O que já existe fica no lugar em relação ao lado oposto.
   */
  private growSide(side: "l" | "r" | "b" | "f", n: number) {
    const alongX = side === "l" || side === "r";
    const cur = alongX ? this.draft.size.w : this.draft.size.d;
    const next = cur + n;
    const [min, max] = alongX ? [12, 80] : [10, 60];
    if (next < min || next > max) {
      this.toast(n > 0 ? `O prédio já está no tamanho máximo (${max} m)` : `O prédio já está no tamanho mínimo (${min} m)`);
      return false;
    }
    const { W, D } = this.half();
    // diminuir: a faixa que some precisa estar vazia
    if (n < 0) {
      const cut = -n;
      const inStrip = (x: number, z: number) =>
        side === "r" ? x > W - cut - 0.5 : side === "l" ? x < -W + cut + 0.5 : side === "f" ? z > D - cut - 0.5 : z < -D + cut + 0.5;
      const busy =
        this.draft.items.some((it) => !DEFS[it.type]?.outdoor && !(isWall(it.type) && this.onPerimeter(it.x, it.z)) && inStrip(it.x, it.z)) ||
        this.draft.zones.some((z) =>
          side === "r" ? z.x + z.w / 2 > W - cut : side === "l" ? z.x - z.w / 2 < -W + cut : side === "f" ? z.z + z.d / 2 > D - cut : z.z - z.d / 2 < -D + cut,
        );
      if (busy) {
        this.toast("Tem sala ou móvel nesse lado. Tire antes de diminuir.");
        return false;
      }
    }
    // desloca tudo (menos as paredes de fora, que são refeitas) meio passo para o lado oposto
    const sign = side === "r" || side === "f" ? -1 : 1;
    const dx = alongX ? (sign * n) / 2 : 0;
    const dz = alongX ? 0 : (sign * n) / 2;
    const perimeter = new Set(this.draft.items.filter((it) => isWall(it.type) && this.onPerimeter(it.x, it.z)));
    for (const it of this.draft.items) {
      if (perimeter.has(it) || DEFS[it.type]?.outdoor) continue;
      it.x += dx;
      it.z += dz;
    }
    for (const z of this.draft.zones) {
      z.x += dx;
      z.z += dz;
    }
    // os andares de cima andam junto (o elevador continua alinhado)
    for (const L of this.draft.levels ?? []) {
      for (const it of L.items) {
        if (isWall(it.type) && this.onPerimeter(it.x, it.z)) continue;
        it.x += dx;
        it.z += dz;
      }
      for (const z of L.zones) {
        z.x += dx;
        z.z += dz;
      }
    }
    // o meu personagem acompanha o prédio (continua na mesma sala)
    this.world.me?.root.position.add(new THREE.Vector3(dx, 0, dz));
    this.resizeOffice(alongX ? n : 0, alongX ? 0 : n);
    return true;
  }

  /** Lugar livre para uma sala w x d (bordas em meio metro, como as salas desenhadas). */
  private freeSpot(w: number, d: number): { x: number; z: number } | null {
    const { W, D } = this.half();
    const blocks = this.draft.items.filter((it) => (DEFS[it.type]?.blocks || isWall(it.type)) && !this.onPerimeter(it.x, it.z) && !DEFS[it.type]?.outdoor);
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (let ex = -W + 0.5; ex + w <= W - 0.5 + 0.01; ex++) {
      for (let ez = -D + 0.5; ez + d <= D - 0.5 + 0.01; ez++) {
        const x0 = ex, x1 = ex + w, z0 = ez, z1 = ez + d;
        // não encosta em outra sala (1 m de folga para as paredes não grudarem)
        if (this.draft.zones.some((z) => x0 < z.x + z.w / 2 + 1 && x1 > z.x - z.w / 2 - 1 && z0 < z.z + z.d / 2 + 1 && z1 > z.z - z.d / 2 - 1)) continue;
        if (blocks.some((it) => it.x > x0 - 0.5 && it.x < x1 + 0.5 && it.z > z0 - 0.5 && it.z < z1 + 0.5)) continue;
        // não tapa a entrada do prédio (embaixo, no meio)
        if (z1 > D - 2.5 && x0 < 3 && x1 > -3) continue;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const dist = Math.hypot(cx, cz);
        if (dist < bestD) {
          bestD = dist;
          best = { x: cx, z: cz };
        }
      }
    }
    return best;
  }

  /** Sala pronta (com paredes e porta). Se não houver espaço, aumenta o prédio para a direita. */
  private addQuickRoom(size: string, name: string, priv: boolean) {
    const [w, d] = ROOM_SIZES[size] ?? ROOM_SIZES.media;
    let spot = this.freeSpot(w, d);
    let grew = 0;
    while (!spot && grew < 4 && !this.lv) {
      // abre espaço: amplia o lado direito na largura da sala (+ corredor)
      const need = Math.ceil((w + 2) / 2) * 2;
      if (!this.growSide("r", need)) break;
      grew++;
      spot = this.freeSpot(w, d);
    }
    if (!spot) {
      this.toast("Não achei espaço para a sala. Aumente o prédio ou desenhe a sala no piso.");
      return;
    }
    const zone: Zone = {
      id: uid("z-"),
      name: name.trim().slice(0, 30) || `Sala ${this.draft.zones.length + 1}`,
      x: spot.x,
      z: spot.z,
      w,
      d,
      private: priv,
      floor: priv ? "carpete-azul" : "madeira",
    };
    this.draft.zones.push(zone);
    this.addRoomWalls(zone);
    this.selZone = zone.id;
    this.apply();
    this.renderPanel();
    this.world.focusOn(zone.x, zone.z);
    this.toast(grew ? `Prédio ampliado e ${zone.name} criada` : `${zone.name} criada`);
  }

  /** Quadro de pendurar perto de uma parede inteira (fundo do prédio): encosta nela, virado para dentro. */
  private wallSnap(it: Item) {
    if (this.free || !WALL_MOUNT.has(it.type)) return;
    const { W, D } = this.half();
    if (it.z < -D + 1.6) {
      it.z = -D + 0.15;
      it.rot = 0;
    } else if (it.x < -W + 1.6) {
      it.x = -W + 0.15;
      it.rot = 270;
    }
  }

  // ------------------------------------------------------------------ mover sala
  /** Tudo que anda junto com a sala: paredes dela e móveis dentro (não o elevador nem as paredes de fora). */
  private roomItems(z: Zone) {
    const x0 = z.x - z.w / 2 - 0.01, x1 = z.x + z.w / 2 + 0.01, z0 = z.z - z.d / 2 - 0.01, z1 = z.z + z.d / 2 + 0.01;
    return this.draft.items.filter((it) => {
      if (it.type === "elevator" || DEFS[it.type]?.outdoor || this.onPerimeter(it.x, it.z)) return false;
      if (it.room) return it.room === z.id;
      return it.x >= x0 && it.x <= x1 && it.z >= z0 && it.z <= z1;
    });
  }

  /** Dá para pôr a sala deslocada (dx, dz)? Dentro do prédio, sem bater em outra sala nem em móvel de fora. */
  private canMoveRoom(z: Zone, dx: number, dz: number) {
    const { W, D } = this.half();
    const x0 = z.x + dx - z.w / 2, x1 = z.x + dx + z.w / 2, z0 = z.z + dz - z.d / 2, z1 = z.z + dz + z.d / 2;
    if (x0 < -W + 0.5 || x1 > W - 0.5 || z0 < -D + 0.5 || z1 > D - 0.5) return false;
    if (this.draft.zones.some((o) => o !== z && x0 < o.x + o.w / 2 && x1 > o.x - o.w / 2 && z0 < o.z + o.d / 2 && z1 > o.z - o.d / 2)) return false;
    const mine = new Set(this.roomItems(z));
    return !this.draft.items.some(
      (it) => !mine.has(it) && (DEFS[it.type]?.blocks || isWall(it.type)) && !DEFS[it.type]?.outdoor && !this.onPerimeter(it.x, it.z) && it.x > x0 - 0.01 && it.x < x1 + 0.01 && it.z > z0 - 0.01 && it.z < z1 + 0.01,
    );
  }

  private commitRoomMove(z: Zone, dx: number, dz: number) {
    for (const it of this.roomItems(z)) {
      it.x += dx;
      it.z += dz;
    }
    z.x += dx;
    z.z += dz;
    this.apply();
    this.renderPanel();
  }

  // ------------------------------------------------------------------ mouse
  private onMouseMove(e: MouseEvent) {
    if (!this.active) return;
    const p = this.world.pickFloor(e);
    if (!p) return;
    if (this.idrag) {
      const d = this.idrag;
      const s = this.snap(new THREE.Vector3(p.x + d.ox, 0, p.z + d.oz));
      if (!d.moved && Math.hypot(s.x - d.sx, s.z - d.sz) > 0.12) d.moved = true;
      if (d.moved && this.allowed(s.x, s.z)) {
        d.obj.position.x = s.x;
        d.obj.position.z = s.z;
        d.it.x = s.x;
        d.it.z = s.z;
        this.highlight();
      }
      return;
    }
    if (this.zdrag) {
      const d = this.zdrag;
      d.dx = Math.round(p.x - d.sx);
      d.dz = Math.round(p.z - d.sz);
      if (!d.moved && (d.dx || d.dz)) d.moved = true;
      if (d.moved) {
        d.ok = this.canMoveRoom(d.z, d.dx, d.dz);
        (this.preview.material as THREE.MeshBasicMaterial).color.set(d.ok ? 0xc8f501 : 0xff5252);
        this.preview.scale.set(d.z.w, d.z.d, 1);
        this.preview.position.set(d.z.x + d.dx, 0.06, d.z.z + d.dz);
        this.world.scene.add(this.preview);
      }
      return;
    }
    if (this.ghost) {
      const s = this.snap(p);
      // prévia já encostada na parede, como vai ficar
      const tmp: Item = { id: "ghost", type: String(this.tool), x: s.x, z: s.z, rot: this.rot };
      this.wallSnap(tmp);
      this.ghost.visible = true;
      this.ghost.position.set(tmp.x, this.placeY, tmp.z);
      this.ghost.scale.setScalar(this.placeS);
      this.ghost.rotation.y = -(tmp.rot * Math.PI) / 180;
    }
    if (this.dragStart && this.tool === "zone") {
      const s = this.snap(p);
      const w = Math.max(1, Math.abs(s.x - this.dragStart.x));
      const d = Math.max(1, Math.abs(s.z - this.dragStart.z));
      this.preview.scale.set(w, d, 1);
      this.preview.position.set((s.x + this.dragStart.x) / 2, 0.04, (s.z + this.dragStart.z) / 2);
    }
    if (this.dragStart && this.tool === "wall") {
      const { a, b, horizontal } = this.wallLine(this.dragStart, p);
      const len = Math.abs(b - a) + 1;
      if (horizontal) {
        this.preview.scale.set(len, 1, 1);
        this.preview.position.set((a + b) / 2, 0.04, Math.round(this.dragStart.z));
      } else {
        this.preview.scale.set(1, len, 1);
        this.preview.position.set(Math.round(this.dragStart.x), 0.04, (a + b) / 2);
      }
    }
  }

  private wallLine(start: THREE.Vector3, p: THREE.Vector3) {
    const sx = Math.round(start.x);
    const sz = Math.round(start.z);
    const ex = Math.round(p.x);
    const ez = Math.round(p.z);
    const horizontal = Math.abs(ex - sx) >= Math.abs(ez - sz);
    return horizontal ? { a: Math.min(sx, ex), b: Math.max(sx, ex), horizontal } : { a: Math.min(sz, ez), b: Math.max(sz, ez), horizontal };
  }

  private onMouseDown(e: MouseEvent) {
    this.zdragDone = false;
    if (e.button === 0) {
      const it = this.itemUnder(e);
      const p = it ? this.world.pickFloor(e) : null;
      const obj = it ? this.world.pickItem(e) : null;
      if (it && p && obj) {
        // arrastar o móvel: pega pelo ponto em que clicou
        this.idrag = { it, ox: it.x - p.x, oz: it.z - p.z, sx: it.x, sz: it.z, moved: false, obj };
        if (this.selected !== it) {
          this.selected = it;
          this.highlight();
          this.renderPanel();
        }
        return;
      }
    }
    if (this.active && !this.limit && !this.tool && this.tab === "salas" && e.button === 0) {
      const p = this.world.pickFloor(e);
      const z = p && this.draft.zones.filter((zn) => Math.abs(p.x - zn.x) <= zn.w / 2 && Math.abs(p.z - zn.z) <= zn.d / 2).sort((a, b) => a.w * a.d - b.w * b.d)[0];
      if (p && z) {
        this.zdrag = { z, sx: p.x, sz: p.z, dx: 0, dz: 0, moved: false, ok: true };
        return;
      }
    }
    if (!this.active || (this.tool !== "zone" && this.tool !== "wall") || e.button !== 0) return;
    const p = this.world.pickFloor(e);
    if (!p) return;
    const s = this.tool === "wall" ? { x: Math.round(p.x), z: Math.round(p.z) } : this.snap(p);
    this.dragStart = new THREE.Vector3(s.x, 0, s.z);
    this.preview.scale.set(1, 1, 1);
    this.preview.position.set(s.x, 0.04, s.z);
    this.world.scene.add(this.preview);
  }

  private onMouseUp(e: MouseEvent) {
    if (this.idrag) {
      const d = this.idrag;
      this.idrag = null;
      if (d.moved) {
        this.wallSnap(d.it);
        this.syncElevator(d.it);
        this.zdragDone = true; // o clique que vem junto com o soltar não deve selecionar outra coisa
        this.apply();
        this.renderPanel();
      }
      return;
    }
    if (this.zdrag) {
      const d = this.zdrag;
      this.zdrag = null;
      this.preview.removeFromParent();
      (this.preview.material as THREE.MeshBasicMaterial).color.set(0xc8f501);
      if (d.moved) {
        this.zdragDone = true; // o clique que vem junto com o soltar não deve selecionar outra coisa
        this.selZone = d.z.id;
        if (d.ok && (d.dx || d.dz)) {
          this.commitRoomMove(d.z, d.dx, d.dz);
          this.toast(`${d.z.name} movida`);
        } else if (!d.ok) this.toast("Não cabe aí: tem outra sala ou móvel no caminho");
        this.highlight();
      }
      return;
    }
    if (!this.active || !this.dragStart) return;
    const start = this.dragStart;
    this.dragStart = null;
    this.preview.removeFromParent();
    const p = this.world.pickFloor(e);
    if (!p) return;
    if (this.tool === "wall") {
      const { a, b, horizontal } = this.wallLine(start, p);
      for (let v = a; v <= b; v++) {
        const x = horizontal ? v : Math.round(start.x);
        const z = horizontal ? Math.round(start.z) : v;
        if (!this.wallAt(x, z)) this.draft.items.push({ id: uid("w"), type: "wall", x, z, rot: 0 });
      }
      this.apply();
      return;
    }
    if (this.tool === "zone") {
      const s = this.snap(p);
      const w = Math.abs(s.x - start.x);
      const d = Math.abs(s.z - start.z);
      if (w < 2 || d < 2) {
        this.toast("Arraste no piso para desenhar uma sala de pelo menos 2 x 2");
        return;
      }
      const zone: Zone = { id: uid("z-"), name: `Sala ${this.draft.zones.length + 1}`, x: (s.x + start.x) / 2, z: (s.z + start.z) / 2, w, d, private: true, floor: "carpete-azul" };
      this.draft.zones.push(zone);
      if (this.withWalls) this.addRoomWalls(zone);
      this.selZone = zone.id;
      this.apply();
      this.setTool(null);
    }
  }

  /** O ponto está dentro do prédio? (móveis podem ir para qualquer lugar do escritório) */
  allowed(x: number, z: number) {
    const { w, d } = this.draft.size;
    return Math.abs(x) <= w / 2 && Math.abs(z) <= d / 2;
  }

  private onClick(p: THREE.Vector3, e: MouseEvent): boolean {
    if (!this.active) return false;
    if (this.zdragDone) {
      this.zdragDone = false;
      return true;
    }
    if (this.limit && this.winMode) {
      const o = this.world.pickItem(e);
      const w = o ? this.draft.items.find((i) => i.id === o.userData.itemId) : null;
      if (w?.type === "window_wall") {
        w.type = "wall";
        this.apply();
        this.toast("Janela removida: agora dá para pendurar quadros");
      } else this.toast("Clique em uma janela para removê-la");
      return true;
    }
    if (this.limit) {
      // fora da gestão: só móveis (paredes, salas, prédio e elevador ficam com a gestão)
      const obj0 = this.world.pickItem(e);
      const it0 = obj0 ? this.draft.items.find((i) => i.id === obj0.userData.itemId) : null;
      if (it0 && LOCKED.has(it0.type)) {
        // pendurar um quadro (ou mover o que está selecionado) numa parede é só móvel: a parede em si não muda
        const placing = !!this.tool && this.tool !== "erase";
        const moving = !this.tool && !!this.selected && !LOCKED.has(this.selected.type);
        if (!placing && !moving) {
          this.toast("Paredes, salas e prédio só a gestão muda");
          return true;
        }
        if (moving && this.selected) {
          const s1 = this.snap(p);
          if (this.allowed(s1.x, s1.z)) {
            this.selected.x = s1.x;
            this.selected.z = s1.z;
            this.wallSnap(this.selected);
            this.apply();
          }
          return true;
        }
      }
      if ((this.tool && this.tool !== "erase") || (this.selected && !it0)) {
        const s0 = this.snap(p);
        if (!this.allowed(s0.x, s0.z)) {
          this.toast("Coloque dentro do escritório");
          return true;
        }
      }
    }
    if (this.tool === "zone" || this.tool === "wall") return true;
    if (this.tool === "erase") {
      const obj = this.world.pickItem(e);
      if (obj) {
        this.draft.items = this.draft.items.filter((i) => i.id !== obj.userData.itemId);
        this.apply();
      }
      return true;
    }
    if (this.tool) {
      const s = this.snap(p);
      const it: Item = { id: uid("i"), type: this.tool, x: s.x, z: s.z, rot: this.rot };
      if (this.placeY) it.y = this.placeY;
      if (this.placeS !== 1) it.s = this.placeS;
      this.wallSnap(it);
      this.draft.items.push(it);
      this.syncElevator(it);
      this.apply();
      if (!e.shiftKey) {
        this.setTool(null); // Shift mantém o móvel para colocar vários
        // o móvel recém-colocado já fica selecionado: altura, ângulo e cor podem ser mexidos na hora e depois
        if (!LOCKED.has(it.type)) {
          this.selected = it;
          this.highlight();
          this.renderPanel();
        }
      }
      return true;
    }
    if (this.tab === "salas") {
      const z = this.draft.zones
        .filter((zn) => Math.abs(p.x - zn.x) <= zn.w / 2 && Math.abs(p.z - zn.z) <= zn.d / 2)
        .sort((a, b) => a.w * a.d - b.w * b.d)[0];
      this.selZone = z?.id ?? null;
      this.highlight();
      this.renderPanel();
      return true;
    }
    const obj = this.world.pickItem(e);
    if (obj) {
      this.selected = this.draft.items.find((i) => i.id === obj.userData.itemId) ?? null;
      this.highlight();
      this.renderPanel();
      return true;
    }
    if (this.selected) {
      // com algo selecionado, clicar no piso leva o móvel até lá
      const s = this.snap(p);
      this.selected.x = s.x;
      this.selected.z = s.z;
      this.wallSnap(this.selected);
      this.apply();
      return true;
    }
    return false; // deixa andar
  }

  // ------------------------------------------------------------------ painel
  private zoneChange(z: Zone, f: () => void) {
    const walls = this.hasRoomWalls(z);
    if (walls) this.removeRoomWalls(z);
    f();
    if (walls) this.addRoomWalls(z);
    this.apply();
    this.renderPanel();
  }

  private renderPanel() {
    const cat = CATEGORIES.find((c) => c[0] === this.category) ?? CATEGORIES[0];
    const types = PALETTE.filter((t) => t !== "floor_logo" && !isWall(t) && !(this.limit && LOCKED.has(t)) && DEFS[t].label.toLowerCase().includes(this.filter.toLowerCase()) && (this.filter ? true : cat[2].test(t) && !(cat[0] === "todos" && t.startsWith("pk_"))));
    const thumbs = ensureThumbs(types);
    const colorRow = (attr: string, cur?: string) =>
      `<div class="colors">${COLORS.map((c) => `<button class="floor-sw ${cur?.toLowerCase() === c.toLowerCase() ? "sel" : ""}" data-${attr}="${c}" title="${c}" style="background:${c}"></button>`).join("")}
        <label class="floor-sw pick" title="Outra cor"><input type="color" data-${attr}-pick value="${cur ?? "#C8F501"}">${icon("plus", 13)}</label>
        <button class="floor-sw none ${cur ? "" : "sel"}" data-${attr}="" title="Cor original">${icon("x", 13)}</button></div>`;
    const sel = this.selected;
    const rs = sel?.cfg?.rs as { p: number; c: number; f?: string } | undefined;
    const rugCur = { p: rs?.p ?? 17, c: rs?.c ?? 0, f: rs?.f ?? (sel && /oval/.test(sel.type) ? "o" : sel && /round/.test(sel.type) ? "c" : "r") };
    const plant = sel && PLANT_VARIANTS[sel.type] ? (sel.cfg?.tr ?? {}) : null;
    const rugPanel = sel && RUG_RE.test(sel.type) ? `
          <div class="label">Formato</div>
          <div class="levels">${[["r", "Retangular"], ["o", "Oval"], ["c", "Redondo"]].map(([k, l]) => `<button class="chip ${rugCur.f === k ? "accent" : ""}" data-rf="${k}">${l}</button>`).join("")}</div>
          <div class="label">Desenho (${RUG_PATTERNS})</div>
          <div class="rug-grid">${Array.from({ length: RUG_PATTERNS }, (_, i) => `<button class="rug-sw ${rs && rugCur.p === i ? "sel" : ""}" data-rp="${i}" title="${RUG_PATTERN_NAMES[i]}"><img src="${rugPreview(i, rugCur.c, rugCur.f)}" alt=""></button>`).join("")}</div>
          <div class="label">Paleta (${RUG_PALETTES})</div>
          <div class="rug-grid pal">${Array.from({ length: RUG_PALETTES }, (_, i) => { const [a, b, c] = rugPalette(i); return `<button class="rug-sw ${rs && rugCur.c === i ? "sel" : ""}" data-rc="${i}" title="Paleta ${i + 1}" style="background:linear-gradient(90deg, ${a} 34%, ${b} 34% 67%, ${c} 67%)"></button>`; }).join("")}</div>
          <button class="btn secondary sm block" data-rrand>${icon("rotate", 15)} Estilo aleatório</button>
          <div class="note">${RUG_STYLES} estilos de tapete. ${rs ? `Desenho ${rugCur.p + 1}, paleta ${rugCur.c + 1}.` : "Escolha um desenho para trocar o tapete original."}</div>` : "";
    const plantPanel = plant && sel ? `
          <div class="label">Modelo</div>
          <div class="levels">${PLANT_VARIANTS[sel.type].map(([k, l]) => `<button class="chip ${plant.v === k ? "accent" : ""}" data-pv="${k}">${l}</button>`).join("")}</div>
          <div class="label">Tamanho</div>
          <div class="levels">${[[0.7, "Pequeno"], [1, "Normal"], [1.3, "Grande"], [1.7, "Enorme"]].map(([k, l]) => `<button class="chip ${(plant.s ?? 1) === k ? "accent" : ""}" data-ps="${k}">${l}</button>`).join("")}</div>
          <div class="label">Cor das folhas</div>
          ${colorRow("pleaf", plant.l)}
          <div class="label">Cor do tronco</div>
          ${colorRow("ptrunk", plant.t)}` : "";

    const moveis = `
      ${sel ? `<div class="sel-card">
          <div class="panel-head"><div class="t-m">${esc(DEFS[sel.type]?.label ?? sel.type)}</div><span class="chip accent">Selecionado</span></div>
          <div class="note">Clique no piso para levar o item até lá.</div>
          ${PHOTO_TYPES.has(sel.type) ? `<button class="btn secondary sm block" data-photo>${icon("image", 15)} ${sel.cfg?.img ? "Trocar a imagem" : "Escolher imagem do computador"}</button><button class="btn secondary sm block" data-photobank>${icon("search", 15)} Banco de imagens</button>${sel.cfg?.img ? `<button class="btn secondary sm block" data-photoedit>${icon("pencil", 15)} Editar a imagem</button>` : ""}${sel.cfg?.credit ? `<div class="hint">Foto: ${esc(sel.cfg.credit)}</div>` : ""}` : rugPanel ? rugPanel : plantPanel ? plantPanel : `<div class="label">Cor</div>
          ${colorRow("icolor", sel.color)}`}
          <label class="field"><span class="label">Altura extra: <b data-h-v>${Math.round((sel.y ?? 0) * 100)} cm</b></span><input type="range" min="-80" max="300" step="1" value="${Math.round((sel.y ?? 0) * 100)}" data-height></label>
          <label class="field"><span class="label">Tamanho: <b data-s-v>${Math.round((sel.s ?? 1) * 100)}%</b></span><input type="range" min="20" max="400" step="5" value="${Math.round((sel.s ?? 1) * 100)}" data-size></label>
          ${RUG_RE.test(sel.type) ? `<label class="field"><span class="label">Largura do tapete: <b data-sx-v>${Math.round((sel.sx ?? 1) * 100)}%</b></span><input type="range" min="20" max="400" step="5" value="${Math.round((sel.sx ?? 1) * 100)}" data-sx></label>
          <label class="field"><span class="label">Profundidade do tapete: <b data-sz-v>${Math.round((sel.sz ?? 1) * 100)}%</b></span><input type="range" min="20" max="400" step="5" value="${Math.round((sel.sz ?? 1) * 100)}" data-sz></label>` : ""}
          <label class="field"><span class="label">Ângulo: <b data-angle-v>${Math.round(sel.rot)}°</b></span><input type="range" min="0" max="359" step="1" value="${Math.round(sel.rot)}" data-angle></label>
          <div class="editor-actions">
            <button class="btn secondary sm" data-a="rot">${icon("rotate", 15)} Girar</button>
            <button class="btn secondary sm" data-a="dup">${icon("copy", 15)} Duplicar</button>
            <button class="btn danger sm" data-a="del">${icon("trash", 15)}</button>
          </div>
        </div>` : ""}
      ${this.limit ? `<button class="btn ${this.winMode ? "primary" : "secondary"} sm block" data-a="winmode">${icon("eraser", 15)} Remover janela do escritório</button>${this.winMode ? `<div class="note">Clique em uma janela para trocá-la por parede lisa.</div>` : ""}` : ""}
      <label class="toggle-row"><span>Posição livre<br><span class="t-s c3">Sem grade nem ímã; gira em qualquer ângulo. Setas empurram o móvel.</span></span><span class="switch"><input type="checkbox" data-free ${this.free ? "checked" : ""}><span></span></span></label>
      <label class="search">${icon("search", 16)}<input placeholder="Buscar móvel" value="${esc(this.filter)}" data-search></label>
      <label class="field cat-field"><span class="label">Categoria</span><select class="input" data-catsel>
        ${(() => {
          const opt = (c: [string, string, RegExp]) => `<option value="${c[0]}" ${this.category === c[0] ? "selected" : ""}>${esc(c[1])} (${catCount(c)})</option>`;
          const basic = CATEGORIES.filter((c) => !c[0].startsWith("pk:")), more = CATEGORIES.filter((c) => c[0].startsWith("pk:"));
          return `<optgroup label="Principais">${basic.map(opt).join("")}</optgroup><optgroup label="Coleções">${more.map(opt).join("")}</optgroup>`;
        })()}
      </select></label>
      <div class="tiles">
        ${types.map((t) => `<button class="tile ${this.tool === t ? "sel" : ""}" data-t="${t}"><img src="${thumbs[t]}" alt=""><span>${DEFS[t].label}</span></button>`).join("") || `<div class="empty">Nada encontrado.</div>`}
      </div>
      <div class="keys-hint"><kbd>R</kbd> gira <kbd>D</kbd> duplica <kbd>Shift</kbd> coloca vários <kbd>Esc</kbd> cancela</div>`;

    const stepper = (label: string, value: string, key: string) =>
      `<div class="stepper"><span class="c2">${label}</span><div class="stepper-ctl"><button data-step="${key}" data-d="-1" aria-label="Diminuir">${icon("minus", 14)}</button><span>${value}</span><button data-step="${key}" data-d="1" aria-label="Aumentar">${icon("plus", 14)}</button></div></div>`;

    const quickRoom = `
      <div class="room open">
        <div class="t-m">Adicionar sala pronta</div>
        <input class="input" data-qname placeholder="Nome da sala (ex.: Sala de Treinamento)" maxlength="30">
        <label class="field"><span class="label">Tamanho</span><select class="input" data-qsize>
          ${[["pequena", "Pequena (5 x 5 m)"], ["media", "Média (7 x 6 m)"], ["grande", "Grande (9 x 7 m)"], ["auditorio", "Auditório (12 x 9 m)"]].map(([k, l]) => `<option value="${k}" ${this.quickSize === k ? "selected" : ""}>${l}</option>`).join("")}
        </select></label>
        <label class="toggle-row"><span>Privada (só quem está dentro ouve)</span><span class="switch"><input type="checkbox" data-qpriv ${this.quickPriv ? "checked" : ""}><span></span></span></label>
        <button class="btn primary sm block" data-qadd>${icon("plus", 15)} Adicionar sala</button>
        <div class="note">Vai para o primeiro espaço livre, com paredes e porta. Sem espaço, o prédio cresce para a direita.</div>
      </div>`;

    const salas = `
      ${quickRoom}
      <div class="label">Ou desenhe no piso</div>
      <button class="btn ${this.tool === "zone" ? "primary" : "secondary"} block" data-t="zone">${icon("room", 16)} ${this.tool === "zone" ? "Arraste no piso para desenhar" : "Nova sala"}</button>
      <label class="toggle-row"><span>Criar com paredes e porta</span><span class="switch"><input type="checkbox" data-withwalls ${this.withWalls ? "checked" : ""}><span></span></span></label>
      <div class="note">Clique numa sala no piso para editar. Arraste a sala para mudar de lugar (paredes e móveis vão junto). Botão do meio do mouse move a câmera, a roda dá zoom.</div>
      ${this.draft.zones
        .map((z) => {
          const open = z.id === this.selZone;
          const floor = z.floor ?? (z.private ? "carpete-azul" : "ceramica");
          return `<div class="room ${open ? "open" : ""}" data-z="${z.id}">
            <div class="room-name">${z.private ? icon("lock", 14).replace('class="ico"', 'class="ico lock"') : ""}<input data-zname value="${esc(z.name)}" maxlength="30"><button class="icon-plain plain-edit" data-zopen title="Editar">${icon(open ? "chevron-up" : "chevron-down", 16)}</button></div>
            ${open ? `
              <div class="toggle-row"><span class="c2">Privada: só quem está dentro ouve</span><span class="switch"><input type="checkbox" data-zpriv ${z.private ? "checked" : ""}><span></span></span></div>
              <div class="label">Cor das paredes da sala</div>
              ${colorRow("zwall", this.roomWalls(z).find((i) => i.color)?.color)}
              <div class="label">Porta da sala</div>
              <div class="levels"><button class="chip ${z.door ? "" : "accent"}" data-zdoor="">Padrão</button>${DOOR_STYLES.map(([k, l]) => `<button class="chip ${z.door === k ? "accent" : ""}" data-zdoor="${k}">${l}</button>`).join("")}</div>
              <div class="label">Cargo da sala</div>
              <select class="input" data-zrole>
                <option value="">Sem cargo (sala livre)</option>
                ${[...ROLES, ...(z.role && !ROLES.includes(z.role) ? [z.role] : [])].map((r) => `<option ${z.role === r ? "selected" : ""}>${esc(r)}</option>`).join("")}
              </select>
              <div class="note">Quem tem esse cargo nasce nessa sala e o botão "Ir para a minha sala" leva até ela. Mais de uma sala pode ter o mesmo cargo.</div>
              <div class="label">Piso</div>
              <div class="floors">${FLOORS.map(([k, l, c]) => `<button class="floor-sw ${floor === k ? "sel" : ""}" data-floor="${k}" title="${l}" style="background:${c}"></button>`).join("")}</div>
              <div class="label">Cor do piso</div>
              ${colorRow("zcolor", z.floorColor)}
              ${stepper("Largura", `${z.w} m`, "w")}
              ${stepper("Profundidade", `${z.d} m`, "d")}
              <div class="stepper"><span class="c2">Mover</span><div class="arrows">
                <button data-move="x" data-d="-1">${icon("chevron-left", 15)}</button><button data-move="z" data-d="-1">${icon("chevron-up", 15)}</button><button data-move="z" data-d="1">${icon("chevron-down", 15)}</button><button data-move="x" data-d="1">${icon("chevron-right", 15)}</button>
              </div></div>
              <div class="editor-actions">
                ${this.hasRoomWalls(z) ? `<button class="btn secondary sm" data-walls="off">${icon("wall", 15)} Tirar paredes</button>` : `<button class="btn secondary sm" data-walls="on">${icon("wall", 15)} Pôr paredes</button>`}
                <button class="btn danger sm" data-zdel>${icon("trash", 15)} Apagar</button>
              </div>` : ""}
          </div>`;
        })
        .join("")}`;

    const levels = levelIds(this.full ?? this.draft);
    const top = Math.max(...levels);
    const andares = `
      <div class="room open">
        <div class="t-m">Andares</div>
        <div class="note">Você está editando: <b>${levelName(this.lv)}</b>. Para editar outro andar, saia do editor, vá pelo elevador e abra o editor de novo.</div>
        <div class="levels">${levels.map((l) => `<span class="chip ${l === this.lv ? "accent" : ""}">${levelName(l)}</span>`).join("")}</div>
        <div class="editor-actions">
          <button class="btn secondary sm" data-level="add">${icon("plus", 15)} Adicionar andar</button>
          ${top ? `<button class="btn danger sm" data-level="del">${icon("trash", 15)} Apagar o ${levelName(top)}</button>` : ""}
        </div>
        <div class="note">Cada andar novo já vem com paredes, janelas e o elevador no mesmo lugar do térreo. Elevador colocado em qualquer andar aparece em todos.</div>
      </div>`;
    const st: OfficeStyle = this.full?.style ?? this.draft.style ?? {};
    const chips = (attr: string, list: [string, string][], cur: string | undefined, def: string) =>
      `<div class="levels">${list.map(([k, l]) => `<button class="chip ${(cur ?? def) === k ? "accent" : ""}" data-${attr}="${k}">${l}</button>`).join("")}</div>`;
    const estilo = `
      <div class="room open">
        <div class="t-m">Estilo do escritório</div>
        <div class="label">Cor das paredes</div>
        ${colorRow("swall", st.wall)}
        <div class="label">Piso do salão</div>
        <div class="floors">${FLOORS.map(([k, l, c]) => `<button class="floor-sw ${st.floor === k ? "sel" : ""}" data-sfloor="${k}" title="${l}" style="background:${c}"></button>`).join("")}<button class="floor-sw none ${st.floor ? "" : "sel"}" data-sfloor="" title="Madeira original">${icon("x", 13)}</button></div>
        <div class="label">Janelas</div>
        ${chips("swin", WINDOW_STYLES, st.window, "classica")}
        <div class="label">Moldura das janelas</div>
        <div class="colors">${FRAME_COLORS.map((c) => `<button class="floor-sw ${st.frame?.toLowerCase() === c.toLowerCase() ? "sel" : ""}" data-sframe="${c}" title="${c}" style="background:${c}"></button>`).join("")}<button class="floor-sw none ${st.frame ? "" : "sel"}" data-sframe="" title="Original">${icon("x", 13)}</button></div>
        <div class="label">Portas</div>
        ${chips("sdoor", DOOR_STYLES, st.door, "madeira")}
        <div class="note">Vale para o prédio todo e para todos os andares. Cada sala pode ter cor de parede e porta próprias (aba Salas).</div>
      </div>`;
    const predio = `
      ${estilo}
      ${andares}
      ${this.lv ? `<div class="note">O tamanho do prédio é o mesmo em todos os andares. Para mudar, edite no térreo.</div>` : `
      <div class="room open">
        <div class="t-m">Tamanho do escritório</div>
        ${stepper("Largura", `${this.draft.size.w} m`, "ow")}
        ${stepper("Profundidade", `${this.draft.size.d} m`, "od")}
        <div class="note">As paredes de fora são refeitas com janelas e a entrada embaixo, no meio.</div>
      </div>
      <div class="room open">
        <div class="t-m">Ampliar só um lado</div>
        ${[["l", "Esquerda"], ["r", "Direita"], ["b", "Fundo"], ["f", "Frente"]].map(([k, l]) => `<div class="stepper"><span class="c2">${l}</span><div class="stepper-ctl"><button data-side="${k}" data-d="-2" aria-label="Diminuir">${icon("minus", 14)}</button><span>2 m</span><button data-side="${k}" data-d="2" aria-label="Aumentar">${icon("plus", 14)}</button></div></div>`).join("")}
        <div class="note">As salas e os móveis ficam onde estão; o espaço novo aparece só no lado escolhido.</div>
      </div>`}
      <button class="btn secondary sm block" data-tab="salas">${icon("room", 15)} Adicionar salas</button>
      <div class="room open">
        <div class="t-m">Piso do salão e áreas abertas</div>
        ${colorRow("hcolor", this.draft.floorColor)}
        <div class="note">Vale para o corredor e as áreas abertas sem cor própria. O desenho do piso continua aparecendo.</div>
      </div>
      <div class="label">Paredes</div>
      <div class="editor-actions">
        <button class="btn ${this.tool === "wall" ? "primary" : "secondary"} sm" data-t="wall">${icon("wall", 15)} Desenhar</button>
        <button class="btn ${this.tool === "erase" ? "primary" : "secondary"} sm" data-t="erase">${icon("eraser", 15)} Apagar itens</button>
      </div>
      <div class="note">${this.tool === "wall" ? "Arraste no piso em linha reta para criar uma parede." : this.tool === "erase" ? "Clique em qualquer parede ou móvel para apagar." : "Desenhe paredes livres ou apague o que não quiser."}</div>
      <div class="label">Parede e janela</div>
      <div class="tiles">
        ${["wall", "window_wall", "glass_wall"].map((t) => `<button class="tile ${this.tool === t ? "sel" : ""}" data-t="${t}"><img src="${thumbs[t]}" alt=""><span>${DEFS[t].label}</span></button>`).join("")}
      </div>`;

    const keepFocus = document.activeElement instanceof HTMLInputElement && document.activeElement.hasAttribute("data-search");
    if (this.limit) this.tab = "moveis";
    this.panel.innerHTML = `
      <div class="panel-head"><div class="t-m">Editar escritório</div><button class="x-btn" data-a="cancel">${icon("x", 18)}</button></div>
      ${
        this.limit
          ? `<div class="note" style="margin:0 0 4px">Mude os móveis do escritório do seu jeito. Prédio, salas e paredes ficam com a gestão.</div>`
          : `<div class="seg">
        <button class="${this.tab === "moveis" ? "sel" : ""}" data-tab="moveis">Móveis</button>
        <button class="${this.tab === "salas" ? "sel" : ""}" data-tab="salas">Salas</button>
        <button class="${this.tab === "predio" ? "sel" : ""}" data-tab="predio">Prédio</button>
      </div>`
      }
      <div class="scroll">${this.tab === "moveis" ? moveis : this.tab === "salas" ? salas : predio}</div>
      <div class="editor-actions">
        <button class="btn secondary" data-a="cancel">Cancelar</button>
        <button class="btn primary" data-a="save">Salvar para todos</button>
      </div>`;

    const q = <T extends HTMLElement>(s: string) => this.panel.querySelectorAll<T>(s);
    q("[data-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        this.tab = b.dataset.tab as typeof this.tab;
        this.selected = null;
        this.setTool(null);
        this.highlight();
      }),
    );
    q("[data-t]").forEach((b) => b.addEventListener("click", () => (this.winMode = false, this.setTool(this.tool === b.dataset.t ? null : b.dataset.t!))));
    q("[data-a]").forEach((b) =>
      b.addEventListener("click", () => {
        const a = b.dataset.a;
        if (a === "winmode") {
          this.winMode = !this.winMode;
          if (this.winMode) this.setTool(null);
          this.renderPanel();
        }
        if (a === "rot") this.rotate();
        if (a === "dup") this.duplicate();
        if (a === "del") this.removeSelected();
        if (a === "cancel") this.cancel();
        if (a === "save") this.save();
      }),
    );
    const search = this.panel.querySelector<HTMLInputElement>("[data-search]");
    if (search) {
      search.addEventListener("input", () => {
        this.filter = search.value;
        this.renderPanel();
      });
      if (keepFocus) {
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
      }
    }
    this.panel.querySelector<HTMLInputElement>("[data-withwalls]")?.addEventListener("change", (e) => {
      this.withWalls = (e.target as HTMLInputElement).checked;
    });
    // tamanho do prédio
    q("[data-step='ow'], [data-step='od']").forEach((b) =>
      b.addEventListener("click", () => {
        const d = Number(b.dataset.d) * 2;
        if (b.dataset.step === "ow") this.resizeOffice(d, 0);
        else this.resizeOffice(0, d);
      }),
    );
    q("[data-side]").forEach((b) =>
      b.addEventListener("click", () => {
        if (this.growSide(b.dataset.side as "l" | "r" | "b" | "f", Number(b.dataset.d))) {
          this.apply();
          this.renderPanel();
        }
      }),
    );
    q("[data-level]").forEach((b) => b.addEventListener("click", () => (b.dataset.level === "add" ? this.addLevel() : this.removeTopLevel())));
    this.panel.querySelector<HTMLInputElement>("[data-free]")?.addEventListener("change", (e) => {
      this.free = (e.target as HTMLInputElement).checked;
      try {
        localStorage.setItem("verkz-editor-free", this.free ? "1" : "0");
      } catch { /* sem armazenamento */ }
      this.toast(this.free ? "Posição livre ligada" : "Grade ligada");
    });
    const hgt = this.panel.querySelector<HTMLInputElement>("[data-height]");
    hgt?.addEventListener("input", () => {
      if (!this.selected) return;
      this.selected.y = Number(hgt.value) / 100;
      const v = this.panel.querySelector("[data-h-v]");
      if (v) v.textContent = `${hgt.value} cm`;
      this.apply();
    });
    const sizeWire = (attr: string, key: "s" | "sx" | "sz") => {
      const el = this.panel.querySelector<HTMLInputElement>(`[data-${attr}]`);
      el?.addEventListener("input", () => {
        if (!this.selected) return;
        const v = Number(el.value) / 100;
        if (v === 1) delete this.selected[key];
        else this.selected[key] = v;
        const l = this.panel.querySelector(`[data-${attr}-v]`);
        if (l) l.textContent = `${el.value}%`;
        this.apply();
      });
    };
    sizeWire("size", "s");
    sizeWire("sx", "sx");
    sizeWire("sz", "sz");
    const angle = this.panel.querySelector<HTMLInputElement>("[data-angle]");
    angle?.addEventListener("input", () => {
      if (!this.selected) return;
      this.selected.rot = Number(angle.value);
      const v = this.panel.querySelector("[data-angle-v]");
      if (v) v.textContent = `${angle.value}°`;
      this.apply();
    });
    this.panel.querySelector<HTMLSelectElement>("[data-catsel]")?.addEventListener("change", (e) => {
      this.category = (e.target as HTMLSelectElement).value;
      this.renderPanel();
    });
    const colorWire = (attr: string, set: (c: string | undefined, live?: boolean) => void) => {
      q(`[data-${attr}]`).forEach((b) => b.addEventListener("click", () => set(b.dataset[attr] || undefined)));
      const pick = this.panel.querySelector<HTMLInputElement>(`[data-${attr}-pick]`);
      pick?.addEventListener("change", () => set(pick.value));
    };
    colorWire("icolor", (c, live) => {
      if (!this.selected) return;
      if (c) this.selected.color = c;
      else delete this.selected.color;
      this.apply();
      if (!live) this.renderPanel();
    });
    colorWire("hcolor", (c, live) => {
      if (c) this.draft.floorColor = c;
      else delete this.draft.floorColor;
      this.apply();
      if (!live) this.renderPanel();
    });
    const patchRug = (patch: Partial<{ p: number; c: number; f: string }>) => {
      const it = this.selected;
      if (!it) return;
      const cur = (it.cfg?.rs as { p: number; c: number; f?: string } | undefined) ?? { p: 17, c: 0 };
      it.cfg = { ...(it.cfg ?? {}), rs: { ...cur, ...patch } };
      delete it.color;
      this.apply();
      this.renderPanel();
    };
    q("[data-rp]").forEach((b) => b.addEventListener("click", () => patchRug({ p: Number(b.dataset.rp) })));
    q("[data-rc]").forEach((b) => b.addEventListener("click", () => patchRug({ c: Number(b.dataset.rc) })));
    q("[data-rf]").forEach((b) => b.addEventListener("click", () => patchRug({ f: b.dataset.rf })));
    this.panel.querySelector("[data-rrand]")?.addEventListener("click", () => patchRug({ p: Math.floor(Math.random() * RUG_PATTERNS), c: Math.floor(Math.random() * RUG_PALETTES) }));
    const patchPlant = (patch: Record<string, unknown>) => {
      const it = this.selected;
      if (!it) return;
      const tr = { ...(it.cfg?.tr ?? {}), ...patch };
      for (const k of Object.keys(tr)) if (tr[k] === undefined) delete tr[k];
      it.cfg = { ...(it.cfg ?? {}), tr };
      this.apply();
      this.renderPanel();
    };
    q("[data-pv]").forEach((b) => b.addEventListener("click", () => patchPlant({ v: b.dataset.pv })));
    q("[data-ps]").forEach((b) => b.addEventListener("click", () => patchPlant({ s: Number(b.dataset.ps) })));
    colorWire("pleaf", (c) => patchPlant({ l: c }));
    colorWire("ptrunk", (c) => patchPlant({ t: c }));
    const setStyle = (f: (s: OfficeStyle) => void) => {
      const s: OfficeStyle = { ...(this.full.style ?? {}) };
      f(s);
      for (const k of Object.keys(s) as (keyof OfficeStyle)[]) if (!s[k]) delete s[k];
      const next = Object.keys(s).length ? s : undefined;
      this.full.style = next;
      this.draft.style = next;
      this.apply();
      this.renderPanel();
    };
    colorWire("swall", (c) => setStyle((s) => (s.wall = c)));
    q("[data-sfloor]").forEach((b) => b.addEventListener("click", () => setStyle((s) => (s.floor = b.dataset.sfloor || undefined))));
    q("[data-swin]").forEach((b) => b.addEventListener("click", () => setStyle((s) => (s.window = b.dataset.swin === "classica" ? undefined : b.dataset.swin))));
    q("[data-sframe]").forEach((b) => b.addEventListener("click", () => setStyle((s) => (s.frame = b.dataset.sframe || undefined))));
    q("[data-sdoor]").forEach((b) => b.addEventListener("click", () => setStyle((s) => (s.door = b.dataset.sdoor === "madeira" ? undefined : b.dataset.sdoor))));
    colorWire("zwall", (c) => {
      const z = this.draft.zones.find((x) => x.id === this.selZone);
      if (!z) return;
      for (const it of this.roomWalls(z)) {
        if (!isWall(it.type)) continue;
        if (c) it.color = c;
        else delete it.color;
      }
      this.apply();
      this.renderPanel();
    });
    q("[data-zdoor]").forEach((b) =>
      b.addEventListener("click", () => {
        const z = this.draft.zones.find((x) => x.id === this.selZone);
        if (!z) return;
        z.door = b.dataset.zdoor || undefined;
        if (!z.door) delete z.door;
        this.apply();
        this.renderPanel();
      }),
    );
    const photoMax = (it: Item) => (it.type === "photo_desk" ? 320 : 560);
    /** Abre o editor de imagem e põe o resultado no quadro. */
    const editInto = async (it: Item, src: string, credit?: string) => {
      this.origImg.set(it.id, src);
      try {
        const r = await openImageEditor(src, { max: photoMax(it) });
        if (!r || !this.draft.items.includes(it)) return;
        it.cfg = { ...(it.cfg ?? {}), img: r.img, aspect: r.aspect, credit };
        this.apply();
        this.renderPanel();
      } catch (e) {
        this.toast(String((e as Error).message ?? e));
      }
    };
    this.panel.querySelector("[data-photobank]")?.addEventListener("click", async () => {
      const it = this.selected;
      if (!it) return;
      const pick = await openImageBank({ max: 900 });
      if (!pick || this.selected !== it) return;
      await editInto(it, pick.dataUrl, pick.credit);
    });
    this.panel.querySelector("[data-photoedit]")?.addEventListener("click", () => {
      const it = this.selected;
      if (!it?.cfg?.img) return;
      void editInto(it, this.origImg.get(it.id) ?? it.cfg.img, it.cfg.credit);
    });
    this.panel.querySelector("[data-photo]")?.addEventListener("click", () => {
      const it = this.selected;
      if (!it) return;
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "image/*";
      inp.onchange = async () => {
        const f = inp.files?.[0];
        if (!f) return;
        if (!f.type.startsWith("image/")) {
          this.toast("Escolha um arquivo de imagem (JPG, PNG, WebP)");
          return;
        }
        // reduz a foto grande antes de editar (o editor faz o corte e o resultado final pequeno)
        try {
          const { img } = await imageToDataUrl(f, 1400, 0.9, 600_000);
          await editInto(it, img, undefined);
        } catch (e) {
          this.toast(String((e as Error).message ?? e));
        }
      };
      inp.click();
    });
    // sala pronta
    this.panel.querySelector<HTMLSelectElement>("[data-qsize]")?.addEventListener("change", (e) => (this.quickSize = (e.target as HTMLSelectElement).value));
    this.panel.querySelector<HTMLInputElement>("[data-qpriv]")?.addEventListener("change", (e) => (this.quickPriv = (e.target as HTMLInputElement).checked));
    this.panel.querySelector("[data-qadd]")?.addEventListener("click", () => {
      const name = this.panel.querySelector<HTMLInputElement>("[data-qname]")?.value ?? "";
      this.addQuickRoom(this.quickSize, name, this.quickPriv);
    });
    // salas
    q("[data-z]").forEach((row) => {
      const z = this.draft.zones.find((x) => x.id === row.dataset.z)!;
      row.querySelector<HTMLInputElement>("[data-zname]")!.addEventListener("change", (e) => {
        z.name = (e.target as HTMLInputElement).value.trim().slice(0, 30) || "Sala";
        this.apply();
      });
      row.querySelector("[data-zopen]")!.addEventListener("click", () => {
        this.selZone = this.selZone === z.id ? null : z.id;
        this.highlight();
        this.renderPanel();
      });
      row.querySelector<HTMLSelectElement>("[data-zrole]")?.addEventListener("change", (e) => {
        z.role = (e.target as HTMLSelectElement).value || undefined;
        this.apply();
        this.renderPanel();
      });
      row.querySelector<HTMLInputElement>("[data-zpriv]")?.addEventListener("change", (e) => {
        z.private = (e.target as HTMLInputElement).checked;
        this.apply();
        this.renderPanel();
      });
      row.querySelectorAll<HTMLElement>("[data-zcolor]").forEach((b) =>
        b.addEventListener("click", () => {
          if (b.dataset.zcolor) z.floorColor = b.dataset.zcolor;
          else delete z.floorColor;
          this.apply();
          this.renderPanel();
        }),
      );
      const zpick = row.querySelector<HTMLInputElement>("[data-zcolor-pick]");
      zpick?.addEventListener("change", () => {
        z.floorColor = zpick.value;
        this.apply();
        this.renderPanel();
      });
      row.querySelectorAll<HTMLElement>("[data-floor]").forEach((b) =>
        b.addEventListener("click", () => {
          z.floor = b.dataset.floor;
          this.apply();
          this.renderPanel();
        }),
      );
      row.querySelectorAll<HTMLElement>("[data-step]").forEach((b) =>
        b.addEventListener("click", () => {
          const d = Number(b.dataset.d);
          this.zoneChange(z, () => {
            if (b.dataset.step === "w") z.w = Math.max(2, Math.min(40, z.w + d));
            if (b.dataset.step === "d") z.d = Math.max(2, Math.min(40, z.d + d));
          });
        }),
      );
      row.querySelectorAll<HTMLElement>("[data-move]").forEach((b) =>
        b.addEventListener("click", () => {
          const d = Number(b.dataset.d);
          this.zoneChange(z, () => {
            if (b.dataset.move === "x") z.x += d;
            else z.z += d;
          });
        }),
      );
      row.querySelector("[data-walls]")?.addEventListener("click", (e) => {
        if ((e.currentTarget as HTMLElement).dataset.walls === "on") this.addRoomWalls(z);
        else this.removeRoomWalls(z);
        this.apply();
        this.renderPanel();
      });
      row.querySelector("[data-zdel]")?.addEventListener("click", () => {
        this.removeRoomWalls(z);
        this.draft.zones = this.draft.zones.filter((x) => x !== z);
        this.selZone = null;
        this.apply();
        this.renderPanel();
      });
    });
  }
}
