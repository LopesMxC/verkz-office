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
    (canvas as any).__preview = this; // acesso em testes/capturas
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.scene.background = new THREE.Color(0x0f0f11);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.4));
    const d = new THREE.DirectionalLight(0xffffff, 1.8);
    d.position.set(3, 5, 4);
    this.scene.add(d);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.75, 8), new THREE.MeshBasicMaterial({ color: 0xc8f501, transparent: true, opacity: 0.1 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor, this.holder);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPixelatedPass(1, this.scene, this.camera, { normalEdgeStrength: 0.1, depthEdgeStrength: 0.4 }));
    void pixel;
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
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const half = 1.0;
    const a = w / h;
    Object.assign(this.camera, { left: -half * a, right: half * a, top: half, bottom: -half });
    this.camera.position.set(0, 2.2, 6);
    this.camera.lookAt(0, 0.68, 0);
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

type Cat = "corpo" | "cabelo" | "roupa" | "acessorios";

/** Abre o criador de personagem. Resolve com o look salvo (ou null se cancelou). */
export function openCreator(host: HTMLElement, start: Look): Promise<Look | null> {
  return new Promise((resolve) => {
    let look: Look = { ...start };
    let cat: Cat = "roupa";
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `
      <div class="panel creator">
        <div class="pv">
          <div class="label">Prévia</div>
          <canvas></canvas>
          <div class="turn">
            <button class="round-btn" data-rot="-1" aria-label="Girar para a esquerda">${icon("chevron-left", 18)}</button>
            <button class="round-btn" data-rot="1" aria-label="Girar para a direita">${icon("chevron-right", 18)}</button>
          </div>
        </div>
        <div class="opts">
          <div class="panel-head"><div class="t-l">Seu personagem</div><button class="x-btn" data-act="cancel">${icon("x", 20)}</button></div>
          <div class="pills"></div>
          <div class="scroll"></div>
          <div class="actions">
            <button class="btn ghost" data-act="random">${icon("shuffle", 16)} Aleatório</button>
            <span class="grow"></span>
            <button class="btn secondary" data-act="cancel">Cancelar</button>
            <button class="btn primary" data-act="save">Salvar personagem</button>
          </div>
        </div>
      </div>`;
    host.appendChild(bg);
    const canvas = bg.querySelector("canvas")!;
    const pv = new CharacterPreview(canvas, look, 4);
    requestAnimationFrame(() => pv.resize());
    const pills = bg.querySelector(".pills")!;
    const body = bg.querySelector(".opts .scroll")!;

    const cards = (key: keyof typeof OPTIONS, title: string) => {
      const opts = OPTIONS[key] as readonly (readonly [string, string])[];
      return `<div class="label">${title}</div><div class="cards">${opts
        .map(([v, l]) => `<button class="card-opt ${(look as any)[key] === v ? "sel" : ""}" data-key="${key}" data-v="${v}">${l}</button>`)
        .join("")}</div>`;
    };
    const swatches = (key: keyof Look, title: string, colors: string[]) =>
      `<div class="label">${title}</div><div class="swatches">${colors
        .map((c) => `<button class="sw ${(look as any)[key] === c ? "sel" : ""}" data-key="${key}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`)
        .join("")}</div>`;

    const render = () => {
      pills.innerHTML = (
        [
          ["corpo", "Corpo"],
          ["cabelo", "Cabelo"],
          ["roupa", "Roupa"],
          ["acessorios", "Acessórios"],
        ] as const
      )
        .map(([k, l]) => `<button class="${cat === k ? "sel" : ""}" data-cat="${k}">${l}</button>`)
        .join("");
      const sections: Record<Cat, string> = {
        corpo:
          cards("body", "Corpo") +
          swatches("skin", "Tom de pele", PALETTES.skin) +
          cards("eyes", "Olhos") +
          `<label class="toggle-row" style="margin-top:14px"><span>Skin das datas especiais<br><span class="t-s c2">Gorro no Natal, bruxa no Halloween...</span></span><span class="switch"><input type="checkbox" data-skin ${look.eventSkin !== false ? "checked" : ""}><span></span></span></label>`,
        cabelo: cards("hair", "Corte") + swatches("hairColor", "Cor do cabelo", PALETTES.hair) + cards("beard", "Barba e bigode"),
        roupa:
          cards("top", "Parte de cima") +
          swatches("topColor", "Cor", PALETTES.cloth) +
          cards("bottom", "Parte de baixo") +
          swatches("bottomColor", "Cor", PALETTES.cloth) +
          swatches("shoes", "Tênis", PALETTES.cloth),
        acessorios:
          cards("head", "Na cabeça") +
          (look.head !== "nenhum" ? swatches("headColor", "Cor do acessório", PALETTES.cloth) : "") +
          cards("face", "Rosto") +
          cards("ears", "Orelhas") +
          cards("neck", "Pescoço"),
      };
      body.innerHTML = sections[cat];
      pv.setLook(look);
    };
    render();

    pills.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("[data-cat]") as HTMLElement | null;
      if (b) {
        cat = b.dataset.cat as Cat;
        render();
      }
    });
    body.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.matches("[data-skin]")) {
        look.eventSkin = t.checked;
        pv.setLook(look);
      }
    });
    body.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const sw = t.closest(".sw") as HTMLElement | null;
      if (sw) {
        (look as any)[sw.dataset.key!] = sw.dataset.c;
        render();
        return;
      }
      const card = t.closest(".card-opt") as HTMLElement | null;
      if (card) {
        (look as any)[card.dataset.key!] = card.dataset.v;
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
    bg.querySelectorAll('[data-act="cancel"]').forEach((b) => b.addEventListener("click", () => close(null)));
    bg.querySelector('[data-act="save"]')!.addEventListener("click", () => close(look));
    bg.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close(null);
    });
  });
}
