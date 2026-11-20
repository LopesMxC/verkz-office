import * as THREE from "three";
import { buildItem, DEFS, Item, Layout, PALETTE, Zone } from "./furniture";
import type { World } from "./world";
import { icon } from "./icons";

/**
 * Modo edição do escritório: colocar, girar e remover móveis; criar e apagar salas.
 * Mudanças valem para todo mundo só ao clicar em "Salvar".
 */
export class Editor {
  active = false;
  private panel: HTMLDivElement;
  private draft!: Layout;
  private original!: string;
  private tool: string | null = null; // tipo de móvel, "zone" ou null (selecionar)
  private rot = 0;
  private ghost: THREE.Object3D | null = null;
  private selected: Item | null = null;
  private selBox = new THREE.BoxHelper(new THREE.Object3D(), 0xc8f501);
  private zoneStart: THREE.Vector3 | null = null;
  private zonePreview: THREE.Mesh;

  constructor(private world: World, private hud: HTMLElement, private onSave: (l: Layout) => void, private toast: (m: string) => void) {
    this.panel = document.createElement("div");
    this.panel.className = "px-box side left editor hidden";
    hud.appendChild(this.panel);
    this.zonePreview = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xc8f501, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    this.zonePreview.rotation.x = -Math.PI / 2;
    this.zonePreview.position.y = 0.03;

    const el = world.labels.domElement;
    el.addEventListener("mousemove", (e) => this.onMouseMove(e));
    el.addEventListener("mousedown", (e) => this.onMouseDown(e));
    el.addEventListener("mouseup", (e) => this.onMouseUp(e));
    window.addEventListener("keydown", (e) => {
      if (!this.active || (document.activeElement instanceof HTMLInputElement)) return;
      if (e.key === "r" || e.key === "R") this.rotate();
      if (e.key === "Delete" || e.key === "Backspace") this.removeSelected();
      if (e.key === "Escape") this.setTool(null);
    });
  }

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
    this.selBox.removeFromParent();
    this.zonePreview.removeFromParent();
    this.selected = null;
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

  private setTool(t: string | null) {
    this.tool = t;
    this.clearGhost();
    this.zonePreview.removeFromParent();
    if (t && t !== "zone") {
      this.ghost = buildItem({ id: "ghost", type: t, x: 0, z: 0, rot: this.rot });
      this.ghost.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.material = (m.material as THREE.Material).clone();
          (m.material as THREE.Material).transparent = true;
          (m.material as THREE.Material).opacity = 0.55;
          m.castShadow = false;
        }
      });
      this.world.scene.add(this.ghost);
      this.selected = null;
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

  private removeSelected() {
    if (!this.selected) return;
    this.draft.items = this.draft.items.filter((i) => i !== this.selected);
    this.selected = null;
    this.apply();
    this.renderPanel();
  }

  private highlight() {
    this.selBox.removeFromParent();
    if (!this.selected) return;
    const obj = this.world.itemGroup.children.find((o) => o.userData.itemId === this.selected!.id);
    if (obj) {
      this.selBox.setFromObject(obj);
      this.world.scene.add(this.selBox);
    }
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.active) return;
    const p = this.world.pickFloor(e);
    if (!p) return;
    if (this.ghost) {
      const s = this.snap(p);
      this.ghost.position.set(s.x, 0, s.z);
    }
    if (this.tool === "zone" && this.zoneStart) {
      const s = this.snap(p);
      const w = Math.max(1, Math.abs(s.x - this.zoneStart.x));
      const d = Math.max(1, Math.abs(s.z - this.zoneStart.z));
      this.zonePreview.scale.set(w, d, 1);
      this.zonePreview.position.set((s.x + this.zoneStart.x) / 2, 0.03, (s.z + this.zoneStart.z) / 2);
    }
  }

  private onMouseDown(e: MouseEvent) {
    if (!this.active || this.tool !== "zone" || e.button !== 0) return;
    const p = this.world.pickFloor(e);
    if (!p) return;
    const s = this.snap(p);
    this.zoneStart = new THREE.Vector3(s.x, 0, s.z);
    this.zonePreview.scale.set(1, 1, 1);
    this.zonePreview.position.set(s.x, 0.03, s.z);
    this.world.scene.add(this.zonePreview);
  }

  private onMouseUp(e: MouseEvent) {
    if (!this.active || this.tool !== "zone" || !this.zoneStart) return;
    const p = this.world.pickFloor(e);
    const start = this.zoneStart;
    this.zoneStart = null;
    this.zonePreview.removeFromParent();
    if (!p) return;
    const s = this.snap(p);
    const w = Math.abs(s.x - start.x);
    const d = Math.abs(s.z - start.z);
    if (w < 2 || d < 2) {
      this.toast("Arraste para desenhar uma sala de pelo menos 2x2");
      return;
    }
    const zone: Zone = {
      id: "z-" + Math.random().toString(36).slice(2, 8),
      name: "Nova sala",
      x: (s.x + start.x) / 2,
      z: (s.z + start.z) / 2,
      w,
      d,
      private: true,
    };
    this.draft.zones.push(zone);
    this.apply();
    this.setTool(null);
  }

  private onClick(p: THREE.Vector3, e: MouseEvent): boolean {
    if (!this.active) return false;
    if (this.tool === "zone") return true;
    if (this.tool) {
      const s = this.snap(p);
      this.draft.items.push({ id: "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: this.tool, x: s.x, z: s.z, rot: this.rot });
      this.apply();
      if (!e.shiftKey) this.setTool(null); // Shift mantém a ferramenta para colocar vários
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
      // com algo selecionado, clicar no piso move o item para lá
      const s = this.snap(p);
      this.selected.x = s.x;
      this.selected.z = s.z;
      this.apply();
      return true;
    }
    return false; // deixa andar
  }

  private renderPanel() {
    const sel = this.selected;
    const types = PALETTE.filter((t) => t !== "floor_logo");
    this.panel.innerHTML = `
      <div class="hd"><h3>Editar escritório</h3></div>
      <div class="bd">
        ${sel ? `
          <div class="section-t">Selecionado</div>
          <div style="margin-bottom:8px">${DEFS[sel.type]?.label ?? sel.type}</div>
          <div class="row">
            <button class="px-btn" data-a="rot">Girar <span class="kbd">R</span></button>
            <button class="px-btn off" data-a="del">Remover</button>
            <button class="px-btn ghost" data-a="unsel">Soltar</button>
          </div>
          <p class="note">Clique no piso para mover o item até lá.</p>` : ""}
        <div class="section-t">Móveis</div>
        <div class="palette">
          ${types.map((t) => `<button class="px-btn ${this.tool === t ? "sel" : ""}" data-t="${t}">${DEFS[t].label}</button>`).join("")}
        </div>
        <p class="note">Escolha um móvel e clique no piso. <span class="kbd">R</span> gira,
        <span class="kbd">Shift</span>+clique coloca vários, <span class="kbd">Esc</span> cancela.</p>
        <div class="section-t">Salas</div>
        <button class="px-btn ${this.tool === "zone" ? "sel on" : ""}" data-t="zone">Desenhar sala</button>
        <div style="margin-top:8px">
          ${this.draft.zones
            .map(
              (z) => `<div class="event" data-z="${z.id}">
                <input class="px-input" data-zname value="${z.name.replace(/"/g, "&quot;")}" style="padding:5px 7px;margin-bottom:6px">
                <label class="check"><input type="checkbox" data-zpriv ${z.private ? "checked" : ""}> Privada (só quem está dentro se ouve)</label>
                <button class="px-btn off" data-zdel style="padding:5px 8px">Apagar sala</button>
              </div>`,
            )
            .join("")}
        </div>
      </div>
      <div class="chat-in">
        <button class="px-btn" data-a="cancel">Cancelar</button>
        <span style="flex:1"></span>
        <button class="px-btn primary" data-a="save">Salvar</button>
      </div>`;

    this.panel.querySelectorAll<HTMLElement>("[data-t]").forEach((b) =>
      b.addEventListener("click", () => this.setTool(this.tool === b.dataset.t ? null : b.dataset.t!)),
    );
    const act = (a: string, f: () => void) => this.panel.querySelector(`[data-a="${a}"]`)?.addEventListener("click", f);
    act("rot", () => this.rotate());
    act("del", () => this.removeSelected());
    act("unsel", () => {
      this.selected = null;
      this.highlight();
      this.renderPanel();
    });
    act("cancel", () => this.cancel());
    act("save", () => this.save());
    this.panel.querySelectorAll<HTMLElement>("[data-z]").forEach((row) => {
      const z = this.draft.zones.find((q) => q.id === row.dataset.z)!;
      row.querySelector<HTMLInputElement>("[data-zname]")!.addEventListener("change", (e) => {
        z.name = (e.target as HTMLInputElement).value.trim().slice(0, 30) || "Sala";
        this.apply();
      });
      row.querySelector<HTMLInputElement>("[data-zpriv]")!.addEventListener("change", (e) => {
        z.private = (e.target as HTMLInputElement).checked;
        this.apply();
      });
      row.querySelector("[data-zdel]")!.addEventListener("click", () => {
        this.draft.zones = this.draft.zones.filter((q) => q !== z);
        this.apply();
        this.renderPanel();
      });
    });
    void icon;
  }
}
