import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPixelatedPass } from "three/addons/postprocessing/RenderPixelatedPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildCharacter, Look, OPTIONS, PALETTES, randomLook } from "./avatar";
import { icon } from "./icons";

/** Miniatura 3D pixelada de um personagem (girando). */
export class CharacterPreview {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  composer: EffectComposer;
  holder = new THREE.Group();
  angle = 0.6;
  spin = true;
  private raf = 0;

  constructor(public canvas: HTMLCanvasElement, look: Look, private pixel = 4) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.renderer.setPixelRatio(1);
    this.scene.background = new THREE.Color(0x0d0d0d);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.4));
    const d = new THREE.DirectionalLight(0xffffff, 1.8);
    d.position.set(3, 5, 4);
    this.scene.add(d);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.75, 8), new THREE.MeshBasicMaterial({ color: 0xc8f501, transparent: true, opacity: 0.1 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor, this.holder);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPixelatedPass(pixel, this.scene, this.camera, { normalEdgeStrength: 0.4, depthEdgeStrength: 0.6 }));
    this.composer.addPass(new OutputPass());
    this.setLook(look);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.spin) this.angle += 0.012;
      this.holder.rotation.y = Math.round(this.angle / (Math.PI / 8)) * (Math.PI / 8); // gira em "quadros"
      this.composer.render();
    };
    loop();
  }

  resize() {
    const w = this.canvas.clientWidth || 96;
    const h = this.canvas.clientHeight || 96;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    const half = 1.15;
    const a = w / h;
    Object.assign(this.camera, { left: -half * a, right: half * a, top: half, bottom: -half });
    this.camera.position.set(0, 2.2, 6);
    this.camera.lookAt(0, 0.78, 0);
    this.camera.updateProjectionMatrix();
  }

  setLook(look: Look) {
    this.holder.clear();
    this.holder.add(buildCharacter(look).root);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}

const LABELS: Record<string, string> = {
  hair: "Cabelo",
  top: "Roupa",
  bottom: "Parte de baixo",
  head: "Na cabeça",
  face: "Rosto",
  neck: "Pescoço",
};

/** Abre o criador de personagem. Resolve com o look salvo (ou null se cancelou). */
export function openCreator(host: HTMLElement, start: Look): Promise<Look | null> {
  return new Promise((resolve) => {
    let look: Look = { ...start };
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `
      <div class="px-box creator">
        <div class="pv"><canvas></canvas>
          <div class="turn">
            <button class="px-btn" data-rot="-1">${icon("left", 18)}</button>
            <button class="px-btn" data-rot="1">${icon("right", 18)}</button>
          </div>
        </div>
        <div class="opts"><h2>Seu personagem</h2><div class="list"></div></div>
        <div class="actions">
          <button class="px-btn" data-act="random">Aleatório</button>
          <span style="flex:1"></span>
          <button class="px-btn" data-act="cancel">Cancelar</button>
          <button class="px-btn primary" data-act="save">Salvar</button>
        </div>
      </div>`;
    host.appendChild(bg);
    const canvas = bg.querySelector("canvas")!;
    const pv = new CharacterPreview(canvas, look, 5);
    requestAnimationFrame(() => pv.resize());
    const list = bg.querySelector(".list")!;

    const stepper = (key: keyof typeof OPTIONS) => {
      const opts = OPTIONS[key] as readonly (readonly [string, string])[];
      const idx = Math.max(0, opts.findIndex((o) => o[0] === (look as any)[key]));
      return `<div class="opt"><div class="t">${LABELS[key]}</div>
        <div class="stepper" data-key="${key}">
          <button class="px-btn" data-d="-1">${icon("left", 14)}</button>
          <div class="v">${opts[idx][1]}</div>
          <button class="px-btn" data-d="1">${icon("right", 14)}</button>
        </div>`;
    };
    const swatches = (key: keyof Look, title: string, colors: string[]) =>
      `<div class="opt"><div class="t">${title}</div><div class="swatches" data-key="${key}">${colors
        .map((c) => `<div class="sw ${(look as any)[key] === c ? "sel" : ""}" data-c="${c}" style="background:${c}"></div>`)
        .join("")}</div></div>`;

    const render = () => {
      list.innerHTML = [
        swatches("skin", "Pele", PALETTES.skin),
        stepper("hair") + "</div>",
        swatches("hairColor", "Cor do cabelo", PALETTES.hair),
        stepper("top") + "</div>",
        swatches("topColor", "Cor da roupa", PALETTES.cloth),
        stepper("bottom") + "</div>",
        swatches("bottomColor", "Cor de baixo", PALETTES.cloth),
        swatches("shoes", "Tênis", PALETTES.cloth),
        stepper("head") + "</div>",
        look.head !== "nenhum" ? swatches("headColor", "Cor do acessório", PALETTES.cloth) : "",
        stepper("face") + "</div>",
        stepper("neck") + "</div>",
      ].join("");
      pv.setLook(look);
    };
    render();

    list.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const sw = t.closest(".sw") as HTMLElement | null;
      if (sw) {
        const key = (sw.parentElement as HTMLElement).dataset.key!;
        (look as any)[key] = sw.dataset.c;
        render();
        return;
      }
      const b = t.closest("button[data-d]") as HTMLElement | null;
      if (b) {
        const key = (b.parentElement as HTMLElement).dataset.key as keyof typeof OPTIONS;
        const opts = OPTIONS[key] as readonly (readonly [string, string])[];
        const i = opts.findIndex((o) => o[0] === (look as any)[key]);
        const n = (i + Number(b.dataset.d) + opts.length) % opts.length;
        (look as any)[key] = opts[n][0];
        render();
      }
    });

    bg.querySelectorAll<HTMLElement>("[data-rot]").forEach((b) =>
      b.addEventListener("click", () => {
        pv.spin = false;
        pv.angle += Number(b.dataset.rot) * (Math.PI / 4);
      }),
    );

    const close = (v: Look | null) => {
      pv.dispose();
      bg.remove();
      resolve(v);
    };
    bg.querySelector('[data-act="random"]')!.addEventListener("click", () => {
      look = randomLook();
      render();
    });
    bg.querySelector('[data-act="cancel"]')!.addEventListener("click", () => close(null));
    bg.querySelector('[data-act="save"]')!.addEventListener("click", () => close(look));
  });
}
