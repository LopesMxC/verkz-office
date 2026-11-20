import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { buildItem, DEFS, Item, Layout, PALETTE, Zone } from "./furniture";
import type { World } from "./world";
import { icon } from "./icons";
import { furnitureThumbs } from "./thumbs";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const isWall = (t: string) => t === "wall" || t === "window_wall";

export const FLOORS: [string, string, string][] = [
  ["carpete-azul", "Carpete azul", "#7d86c2"],
  ["carpete-verde", "Carpete verde", "#7fae8c"],
  ["carpete-lilas", "Carpete lilás", "#a790cf"],
  ["carpete-grafite", "Carpete grafite", "#5d606c"],
  ["madeira", "Madeira", "#b98557"],
  ["ceramica", "Cerâmica", "#bcbfc8"],
];

type Tool = null | "zone" | "wall" | "erase" | string; // string = tipo de móvel

/**
 * Editor do escritório.
 *  - Móveis: colocar, mover, girar, duplicar e remover.
 *  - Salas: desenhar (com paredes automáticas), renomear, privada ou aberta, piso, tamanho, posição, paredes.
 *  - Prédio: tamanho do escritório, desenhar e apagar paredes.
 * As mudanças só valem para todo mundo ao clicar em "Salvar para todos".
 */
export class Editor {
  active = false;
  onClose?: () => void;
  private panel: HTMLDivElement;
  private draft!: Layout;
  private original!: string;
  private tab: "moveis" | "salas" | "predio" = "moveis";
  private filter = "";
  private tool: Tool = null;
  private withWalls = true;
  private rot = 0;
  private ghost: THREE.Object3D | null = null;
  private selected: Item | null = null;
  private selZone: string | null = null;
  private selBox = new THREE.BoxHelper(new THREE.Object3D(), 0xc8f501);
  private zoneOutline: THREE.LineLoop;
  private quick: CSS2DObject;
  private dragStart: THREE.Vector3 | null = null;
  private preview: THREE.Mesh;

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
    window.addEventListener("keydown", (e) => {
      if (!this.active || document.activeElement instanceof HTMLInputElement) return;
      if (e.key === "r" || e.key === "R") this.rotate();
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

  open() {
    this.active = true;
    this.draft = JSON.parse(JSON.stringify(this.world.layout));
    this.original = JSON.stringify(this.world.layout);
    this.world.onFloorClick = (p, e) => this.onClick(p, e);
    this.panel.classList.remove("hidden");
    this.setTool(null);
  }

  private close() {
    this.active = false;
    this.world.onFloorClick = undefined;
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
    this.onSave(this.draft);
    this.world.setLayout(this.draft);
    this.close();
    this.toast("Escritório salvo para todo mundo");
  }

  private apply() {
    this.world.setLayout(this.draft);
    this.highlight();
  }

  // ------------------------------------------------------------------ ferramentas
  private setTool(t: Tool) {
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
    return { x: Math.round(p.x * 2) / 2, z: Math.round(p.z * 2) / 2 };
  }

  private rotate() {
    if (this.selected) {
      this.selected.rot = (this.selected.rot + 90) % 360;
      this.apply();
    } else {
      this.rot = (this.rot + 90) % 360;
      if (this.ghost) this.ghost.rotation.y = -(this.rot * Math.PI) / 180;
    }
  }

  private duplicate() {
    if (!this.selected) return;
    const copy: Item = { ...this.selected, id: uid("i"), x: this.selected.x + 1, room: undefined };
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
    this.draft.items = this.draft.items.filter((it) => !near(it));
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
    this.draft.size = { w, d };
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

  // ------------------------------------------------------------------ mouse
  private onMouseMove(e: MouseEvent) {
    if (!this.active) return;
    const p = this.world.pickFloor(e);
    if (!p) return;
    if (this.ghost) {
      const s = this.snap(p);
      this.ghost.visible = true;
      this.ghost.position.set(s.x, 0, s.z);
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

  private onClick(p: THREE.Vector3, e: MouseEvent): boolean {
    if (!this.active) return false;
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
      this.draft.items.push({ id: uid("i"), type: this.tool, x: s.x, z: s.z, rot: this.rot });
      this.apply();
      if (!e.shiftKey) this.setTool(null); // Shift mantém o móvel para colocar vários
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
    const thumbs = furnitureThumbs();
    const types = PALETTE.filter((t) => t !== "floor_logo" && !isWall(t) && DEFS[t].label.toLowerCase().includes(this.filter.toLowerCase()));
    const sel = this.selected;

    const moveis = `
      ${sel ? `<div class="sel-card">
          <div class="panel-head"><div class="t-m">${esc(DEFS[sel.type]?.label ?? sel.type)}</div><span class="chip accent">Selecionado</span></div>
          <div class="note">Clique no piso para levar o item até lá.</div>
          <div class="editor-actions">
            <button class="btn secondary sm" data-a="rot">${icon("rotate", 15)} Girar</button>
            <button class="btn secondary sm" data-a="dup">${icon("copy", 15)} Duplicar</button>
            <button class="btn danger sm" data-a="del">${icon("trash", 15)}</button>
          </div>
        </div>` : ""}
      <label class="search">${icon("search", 16)}<input placeholder="Buscar móvel" value="${esc(this.filter)}" data-search></label>
      <div class="tiles">
        ${types.map((t) => `<button class="tile ${this.tool === t ? "sel" : ""}" data-t="${t}"><img src="${thumbs[t]}" alt=""><span>${DEFS[t].label}</span></button>`).join("") || `<div class="empty">Nada encontrado.</div>`}
      </div>
      <div class="keys-hint"><kbd>R</kbd> gira <kbd>D</kbd> duplica <kbd>Shift</kbd> coloca vários <kbd>Esc</kbd> cancela</div>`;

    const stepper = (label: string, value: string, key: string) =>
      `<div class="stepper"><span class="c2">${label}</span><div class="stepper-ctl"><button data-step="${key}" data-d="-1" aria-label="Diminuir">${icon("minus", 14)}</button><span>${value}</span><button data-step="${key}" data-d="1" aria-label="Aumentar">${icon("plus", 14)}</button></div></div>`;

    const salas = `
      <button class="btn ${this.tool === "zone" ? "primary" : "secondary"} block" data-t="zone">${icon("room", 16)} ${this.tool === "zone" ? "Arraste no piso para desenhar" : "Nova sala"}</button>
      <label class="toggle-row"><span>Criar com paredes e porta</span><span class="switch"><input type="checkbox" data-withwalls ${this.withWalls ? "checked" : ""}><span></span></span></label>
      <div class="note">Clique numa sala no piso para editar.</div>
      ${this.draft.zones
        .map((z) => {
          const open = z.id === this.selZone;
          const floor = z.floor ?? (z.private ? "carpete-azul" : "ceramica");
          return `<div class="room ${open ? "open" : ""}" data-z="${z.id}">
            <div class="room-name">${z.private ? icon("lock", 14).replace('class="ico"', 'class="ico lock"') : ""}<input data-zname value="${esc(z.name)}" maxlength="30"><button class="icon-plain plain-edit" data-zopen title="Editar">${icon(open ? "chevron-up" : "chevron-down", 16)}</button></div>
            ${open ? `
              <div class="toggle-row"><span class="c2">Privada: só quem está dentro ouve</span><span class="switch"><input type="checkbox" data-zpriv ${z.private ? "checked" : ""}><span></span></span></div>
              <div class="label">Piso</div>
              <div class="floors">${FLOORS.map(([k, l, c]) => `<button class="floor-sw ${floor === k ? "sel" : ""}" data-floor="${k}" title="${l}" style="background:${c}"></button>`).join("")}</div>
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

    const predio = `
      <div class="room open">
        <div class="t-m">Tamanho do escritório</div>
        ${stepper("Largura", `${this.draft.size.w} m`, "ow")}
        ${stepper("Profundidade", `${this.draft.size.d} m`, "od")}
        <div class="note">As paredes de fora são refeitas com janelas e a entrada embaixo, no meio.</div>
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
    this.panel.innerHTML = `
      <div class="panel-head"><div class="t-m">Editar escritório</div><button class="x-btn" data-a="cancel">${icon("x", 18)}</button></div>
      <div class="seg">
        <button class="${this.tab === "moveis" ? "sel" : ""}" data-tab="moveis">Móveis</button>
        <button class="${this.tab === "salas" ? "sel" : ""}" data-tab="salas">Salas</button>
        <button class="${this.tab === "predio" ? "sel" : ""}" data-tab="predio">Prédio</button>
      </div>
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
    q("[data-t]").forEach((b) => b.addEventListener("click", () => this.setTool(this.tool === b.dataset.t ? null : b.dataset.t!)));
    q("[data-a]").forEach((b) =>
      b.addEventListener("click", () => {
        const a = b.dataset.a;
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
      row.querySelector<HTMLInputElement>("[data-zpriv]")?.addEventListener("change", (e) => {
        z.private = (e.target as HTMLInputElement).checked;
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
