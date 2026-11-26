// Editor de imagem para quadros: enquadrar (proporção, zoom, posição), girar e ajustar brilho/contraste
// antes de colocar a imagem no quadro. Devolve um JPEG pequeno (o escritório inteiro vai numa mensagem só).
import { icon } from "./icons";

export interface EditedImage {
  img: string;
  aspect: number;
}

const RATIOS: [string, number | null][] = [
  ["Original", null],
  ["1:1", 1],
  ["4:3", 4 / 3],
  ["3:4", 3 / 4],
  ["16:9", 16 / 9],
  ["9:16", 9 / 16],
];

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("Não consegui abrir essa imagem"));
    im.src = src;
  });
}

export async function openImageEditor(src: string, opts: { max?: number } = {}): Promise<EditedImage | null> {
  const im = await load(src);
  const max = opts.max ?? 560;
  const st = { ratio: 0, zoom: 1, px: 0, py: 0, rot: 0, bright: 100, contrast: 100 };
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal wide imged">
    <div class="panel-head"><div class="t-m">Editar imagem do quadro</div></div>
    <div class="modal-body">
      <div class="imged-stage"><canvas data-prev></canvas></div>
      <div class="levels">${RATIOS.map(([l], i) => `<button class="chip ${i === 0 ? "accent" : ""}" data-r="${i}">${l}</button>`).join("")}</div>
      <label class="field"><span class="label">Zoom: <b data-v="zoom">100%</b></span><input type="range" min="100" max="400" step="5" value="100" data-k="zoom"></label>
      <label class="field"><span class="label">Posição horizontal: <b data-v="px">0</b></span><input type="range" min="-100" max="100" step="1" value="0" data-k="px"></label>
      <label class="field"><span class="label">Posição vertical: <b data-v="py">0</b></span><input type="range" min="-100" max="100" step="1" value="0" data-k="py"></label>
      <label class="field"><span class="label">Brilho: <b data-v="bright">100%</b></span><input type="range" min="50" max="150" step="1" value="100" data-k="bright"></label>
      <label class="field"><span class="label">Contraste: <b data-v="contrast">100%</b></span><input type="range" min="50" max="150" step="1" value="100" data-k="contrast"></label>
      <div class="editor-actions"><button class="btn secondary sm" data-rot>${icon("rotate", 15)} Girar 90°</button><button class="btn secondary sm" data-reset>Restaurar</button></div>
    </div>
    <div class="modal-actions"><button class="btn secondary" data-cancel>Cancelar</button><button class="btn primary" data-ok>Usar no quadro</button></div>
  </div>`;
  document.body.appendChild(bg);
  const $ = <T extends HTMLElement>(s: string) => bg.querySelector<T>(s)!;
  const prev = $<HTMLCanvasElement>("[data-prev]");

  const ratioValue = () => {
    const r = RATIOS[st.ratio][1];
    if (r) return r;
    return st.rot % 180 ? im.naturalHeight / im.naturalWidth : im.naturalWidth / im.naturalHeight;
  };
  const dims = (m: number) => {
    const a = ratioValue();
    return a >= 1 ? { w: m, h: Math.max(1, Math.round(m / a)) } : { w: Math.max(1, Math.round(m * a)), h: m };
  };
  const draw = (c: HTMLCanvasElement, W: number, H: number) => {
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, W, H);
    const iw = st.rot % 180 ? im.naturalHeight : im.naturalWidth;
    const ih = st.rot % 180 ? im.naturalWidth : im.naturalHeight;
    const k = Math.max(W / iw, H / ih) * st.zoom; // cobre o quadro inteiro
    const ox = ((iw * k - W) / 2) * (st.px / 100);
    const oy = ((ih * k - H) / 2) * (st.py / 100);
    g.filter = `brightness(${st.bright}%) contrast(${st.contrast}%)`;
    g.save();
    g.translate(W / 2 - ox, H / 2 - oy);
    g.rotate((st.rot * Math.PI) / 180);
    g.scale(k, k);
    g.drawImage(im, -im.naturalWidth / 2, -im.naturalHeight / 2);
    g.restore();
  };
  const redraw = () => {
    const { w, h } = dims(440);
    // a prévia nunca passa de 440 x 280
    const f = Math.min(1, 280 / h);
    draw(prev, Math.round(w * f), Math.round(h * f));
  };
  redraw();

  const close = (v: EditedImage | null, res: (v: EditedImage | null) => void) => {
    bg.remove();
    document.removeEventListener("keydown", onKey, true);
    res(v);
  };
  let onKey: (e: KeyboardEvent) => void = () => {};
  return new Promise((res) => {
    onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(null, res);
      }
    };
    document.addEventListener("keydown", onKey, true);
    bg.querySelectorAll<HTMLInputElement>("[data-k]").forEach((inp) =>
      inp.addEventListener("input", () => {
        const k = inp.dataset.k as "zoom" | "px" | "py" | "bright" | "contrast";
        st[k] = Number(inp.value) / (k === "zoom" ? 100 : 1);
        const v = bg.querySelector(`[data-v="${k}"]`);
        if (v) v.textContent = k === "zoom" ? `${inp.value}%` : k === "px" || k === "py" ? inp.value : `${inp.value}%`;
        redraw();
      }),
    );
    bg.querySelectorAll<HTMLElement>("[data-r]").forEach((b) =>
      b.addEventListener("click", () => {
        st.ratio = Number(b.dataset.r);
        bg.querySelectorAll("[data-r]").forEach((x) => x.classList.toggle("accent", x === b));
        redraw();
      }),
    );
    $("[data-rot]").addEventListener("click", () => {
      st.rot = (st.rot + 90) % 360;
      redraw();
    });
    $("[data-reset]").addEventListener("click", () => {
      Object.assign(st, { ratio: 0, zoom: 1, px: 0, py: 0, rot: 0, bright: 100, contrast: 100 });
      bg.querySelectorAll<HTMLInputElement>("[data-k]").forEach((i) => {
        const k = i.dataset.k!;
        i.value = k === "zoom" ? "100" : k === "bright" || k === "contrast" ? "100" : "0";
        const v = bg.querySelector(`[data-v="${k}"]`);
        if (v) v.textContent = k === "px" || k === "py" ? "0" : `${i.value}%`;
      });
      bg.querySelectorAll("[data-r]").forEach((x, i) => x.classList.toggle("accent", i === 0));
      redraw();
    });
    $("[data-cancel]").addEventListener("click", () => close(null, res));
    bg.addEventListener("mousedown", (e) => {
      if (e.target === bg) close(null, res);
    });
    $("[data-ok]").addEventListener("click", () => {
      const { w, h } = dims(max);
      const c = document.createElement("canvas");
      draw(c, w, h);
      let q = 0.82;
      let out = c.toDataURL("image/jpeg", q);
      while (out.length > 70_000 && q > 0.4) out = c.toDataURL("image/jpeg", (q -= 0.12));
      close({ img: out, aspect: w / h }, res);
    });
  });
}
