import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPixelatedPass } from "three/addons/postprocessing/RenderPixelatedPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildItem, DEFS, footprint, Item, Layout, Zone } from "./furniture";
import { NEON } from "./logo";
import { buildCharacter, Character, Look, lookColor, normalizeLook } from "./avatar";

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
}

export class Avatar {
  root = new THREE.Group();
  body = new THREE.Group();
  char!: Character;
  label: HTMLDivElement;
  bubble: HTMLDivElement;
  statusEl: HTMLDivElement;
  nameEl: HTMLDivElement;
  ring: THREE.Mesh;
  target = new THREE.Vector3();
  targetDir = 0;
  moving = false;
  phase = Math.random() * 10;
  speaking = false;
  look: Look;

  constructor(public info: PeerInfo, private isMe: boolean) {
    this.look = normalizeLook(info.look, info.color);
    this.root.add(this.body);
    this.setLook(this.look);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.48, 4, 1),
      new THREE.MeshBasicMaterial({ color: isMe ? NEON : lookColor(this.look), transparent: true, opacity: isMe ? 0.95 : 0.5, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.rotation.z = Math.PI / 4;
    this.ring.position.y = 0.02;
    this.root.add(this.ring);

    this.label = document.createElement("div");
    this.label.className = "nameplate" + (isMe ? " me" : "");
    this.bubble = document.createElement("div");
    this.bubble.className = "bubble hidden";
    this.nameEl = document.createElement("div");
    this.nameEl.className = "name";
    this.nameEl.textContent = info.name;
    this.statusEl = document.createElement("div");
    this.statusEl.className = "status";
    this.label.append(this.bubble, this.nameEl, this.statusEl);
    const lbl = new CSS2DObject(this.label);
    lbl.position.set(0, 1.75, 0);
    lbl.center.set(0.5, 1);
    this.root.add(lbl);

    this.setStatus(info.status);
    this.root.position.set(info.x, 0, info.z);
    this.target.copy(this.root.position);
  }

  setLook(look: any) {
    this.look = normalizeLook(look, this.info.color);
    this.info.look = this.look;
    if (this.char) this.body.remove(this.char.root);
    this.char = buildCharacter(this.look);
    this.body.add(this.char.root);
    if (this.ring && !this.isMe) (this.ring.material as THREE.MeshBasicMaterial).color.set(lookColor(this.look));
  }

  setStatus(s: string) {
    this.info.status = s;
    this.statusEl.textContent = s;
    this.statusEl.style.display = s ? "" : "none";
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
    this.phase += dt * (this.moving ? 11 : 2);
    // animação "em degraus" (estilo sprite): 4 quadros por passo
    const stepped = this.moving ? Math.round(Math.sin(this.phase) * 2) / 2 : 0;
    this.body.position.y = this.moving ? Math.abs(stepped) * 0.05 : 0;
    const sw = stepped * 0.6;
    this.char.legL.rotation.x = sw;
    this.char.legR.rotation.x = -sw;
    this.char.armL.rotation.x = -sw * 0.8;
    this.char.armR.rotation.x = sw * 0.8;
    if (this.speaking) {
      const s = 1 + (Math.sin(performance.now() / 120) > 0 ? 0.22 : 0);
      this.ring.scale.set(s, s, s);
    } else this.ring.scale.set(1, 1, 1);
  }

  dispose() {
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
  pixelSize = 3;
  layout!: Layout;
  itemGroup = new THREE.Group();
  zoneGroup = new THREE.Group();
  floor!: THREE.Mesh;
  blockers: Rect[] = [];
  me!: Avatar;
  others = new Map<string, Avatar>();
  zoom = 1;
  camTarget = new THREE.Vector3();
  keys = new Set<string>();
  path: THREE.Vector3[] = [];
  onMove?: (x: number, z: number, dir: number, moving: boolean, zone: Zone | null) => void;
  onZoneChange?: (z: Zone | null) => void;
  onFrame?: () => void;
  onFloorClick?: (p: THREE.Vector3, ev: MouseEvent) => boolean; // true = consumido (editor)
  currentZone: Zone | null = null;
  inputEnabled = true;
  private lastSent = 0;
  private lastState = "";
  private ray = new THREE.Raycaster();
  private clock = new THREE.Clock();

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1); // pixel art: resolução baixa de propósito
    this.renderer.domElement.style.imageRendering = "pixelated";
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap; // sombras duras, cara de pixel art
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "labels";
    host.appendChild(this.labels.domElement);

    this.scene.background = new THREE.Color(0x0d0d0d);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

    const hemi = new THREE.HemisphereLight(0xf2f6e6, 0x101010, 1.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(14, 26, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = 22;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 80 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    const fill = new THREE.PointLight(NEON, 6, 30, 1.6);
    fill.position.set(0, 6, -8);
    this.scene.add(fill);

    this.scene.add(this.itemGroup, this.zoneGroup);

    this.composer = new EffectComposer(this.renderer);
    this.pixelPass = new RenderPixelatedPass(this.pixelSize, this.scene, this.camera, { normalEdgeStrength: 0.35, depthEdgeStrength: 0.6 });
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
    this.composer.setSize(w, h);
    this.labels.setSize(w, h);
    this.updateFrustum();
  }

  private updateFrustum() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    // zoom em degraus inteiros de pixel para manter os pixels quadrados
    const half = 9 / this.zoom;
    const aspect = w / Math.max(1, h);
    Object.assign(this.camera, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
    this.camera.updateProjectionMatrix();
  }

  // ---------- layout
  setLayout(layout: Layout) {
    this.layout = layout;
    this.itemGroup.clear();
    this.zoneGroup.clear();
    if (this.floor) this.floor.removeFromParent();

    const { w, d } = layout.size;
    const floorTex = this.makeFloorTexture(w, d);
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 1, d + 1),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85, metalness: 0.05 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    this.blockers = [];
    for (const it of layout.items) this.addItemMesh(it);
    for (const z of layout.zones) this.addZoneMesh(z);
    this.currentZone = null;
  }

  private makeFloorTexture(w: number, d: number) {
    const px = 16;
    const c = document.createElement("canvas");
    c.width = (w + 1) * px;
    c.height = (d + 1) * px;
    const g = c.getContext("2d")!;
    g.fillStyle = "#161618";
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i <= w + 1; i++) {
      for (let j = 0; j <= d + 1; j++) {
        if ((i + j) % 2 === 0) {
          g.fillStyle = "#19191b";
          g.fillRect(i * px, j * px, px, px);
        }
      }
    }
    g.strokeStyle = "rgba(200,245,1,0.05)";
    g.lineWidth = 1;
    for (let i = 0; i <= w + 1; i++) {
      g.beginPath();
      g.moveTo(i * px + 0.5, 0);
      g.lineTo(i * px + 0.5, c.height);
      g.stroke();
    }
    for (let j = 0; j <= d + 1; j++) {
      g.beginPath();
      g.moveTo(0, j * px + 0.5);
      g.lineTo(c.width, j * px + 0.5);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
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
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(z.w, z.d),
      new THREE.MeshBasicMaterial({ color: z.private ? NEON : 0xffffff, transparent: true, opacity: z.private ? 0.045 : 0.025, depthWrite: false }),
    );
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.008;
    g.add(fill);
    const pts = [
      new THREE.Vector3(-z.w / 2, 0.015, -z.d / 2),
      new THREE.Vector3(z.w / 2, 0.015, -z.d / 2),
      new THREE.Vector3(z.w / 2, 0.015, z.d / 2),
      new THREE.Vector3(-z.w / 2, 0.015, z.d / 2),
      new THREE.Vector3(-z.w / 2, 0.015, -z.d / 2),
    ];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: NEON, dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: z.private ? 0.55 : 0.2 }),
    );
    line.computeLineDistances();
    g.add(line);
    const tag = document.createElement("div");
    tag.className = "zone-tag" + (z.private ? " private" : "");
    tag.innerHTML = (z.private ? '<span class="lock"></span>' : "") + z.name;
    const lbl = new CSS2DObject(tag);
    lbl.position.set(-z.w / 2 + 0.2, 0.05, -z.d / 2 + 0.3);
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
    this.scene.add(this.me.root);
    this.camTarget.copy(this.me.root.position);
  }

  addPeer(info: PeerInfo) {
    this.removePeer(info.id);
    const a = new Avatar(info, false);
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

    const el = this.labels.domElement;
    el.addEventListener("wheel", (e) => {
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.45, 2.6);
      this.updateFrustum();
      e.preventDefault();
    }, { passive: false });

    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement) !== el) return; // cliques em nameplates etc.
      const p = this.pickFloor(e);
      if (!p) return;
      if (this.onFloorClick?.(p, e)) return;
      if (this.inputEnabled) this.walkTo(p.x, p.z);
    });
  }

  pickFloor(e: MouseEvent): THREE.Vector3 | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
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
    // eixo isométrico: "cima" anda para o fundo da tela
    if (k.has("w") || k.has("arrowup")) { vx -= 1; vz -= 1; }
    if (k.has("s") || k.has("arrowdown")) { vx += 1; vz += 1; }
    if (k.has("a") || k.has("arrowleft")) { vx -= 1; vz += 1; }
    if (k.has("d") || k.has("arrowright")) { vx += 1; vz -= 1; }

    if (!vx && !vz && this.path.length) {
      const next = this.path[0];
      const dx = next.x - pos.x;
      const dz = next.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.08) this.path.shift();
      else { vx = dx / dist; vz = dz / dist; }
    }

    const speed = 4.2;
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
    this.me.update(dt, false);
    for (const a of this.others.values()) a.update(dt, true);

    const zone = this.zoneAt(pos.x, pos.z);
    if (zone?.id !== this.currentZone?.id) {
      this.currentZone = zone;
      this.onZoneChange?.(zone);
    }

    // câmera isométrica segue com suavidade
    this.camTarget.lerp(pos, Math.min(1, dt * 4));
    this.camera.position.set(this.camTarget.x + 20, 22, this.camTarget.z + 20);
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
