/**
 * Fundo da câmera: desfocar ou trocar o fundo por uma imagem (fundos prontos ou foto do computador).
 * Usa o @livekit/track-processors (MediaPipe, recorte da pessoa). O módulo só é carregado quando
 * alguém liga um fundo, para não pesar no app de quem não usa.
 */
import type { LocalVideoTrack } from "livekit-client";
import { LOGO_PATH, NEON, INK } from "./logo";

export type CamBg = { kind: "none" | "blur" | "image"; img?: string };

/** Fundos prontos, desenhados em canvas (sem arquivo de imagem). */
export const CAM_BG_PRESETS: { id: string; name: string }[] = [
  { id: "verkz", name: "VERKZ" },
  { id: "grafite", name: "Grafite" },
  { id: "escritorio", name: "Escritório" },
  { id: "verde", name: "Verde" },
  { id: "por-do-sol", name: "Pôr do sol" },
  { id: "oceano", name: "Oceano" },
];

const cache = new Map<string, string>();

/** Imagem (data URL, 1280x720) de um fundo pronto. */
export function presetImage(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 1280;
  c.height = 720;
  const g = c.getContext("2d")!;
  const lin = (stops: [number, string][], x1 = 0, y1 = 0, x2 = 1280, y2 = 720) => {
    const gr = g.createLinearGradient(x1, y1, x2, y2);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr;
    g.fillRect(0, 0, 1280, 720);
  };
  const glow = (x: number, y: number, r: number, col: string) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 1280, 720);
  };
  switch (id) {
    case "verkz": {
      lin([[0, "#151515"], [1, INK]]);
      glow(1040, 160, 520, "rgba(200,245,1,.18)");
      // logo oficial no canto (Path2D do SVG)
      g.save();
      g.translate(920, 70);
      g.scale(0.5, 0.5);
      g.translate(-260, -340);
      g.fillStyle = NEON;
      g.globalAlpha = 0.9;
      g.fill(new Path2D(LOGO_PATH), "evenodd");
      g.restore();
      break;
    }
    case "grafite":
      lin([[0, "#2b2d31"], [1, "#16171a"]]);
      glow(300, 200, 600, "rgba(255,255,255,.06)");
      break;
    case "escritorio": {
      lin([[0, "#e9e2d6"], [1, "#cfc4b2"]], 0, 0, 0, 720);
      // parede com janelas e prateleira, bem suave (parece desfocado atrás da pessoa)
      g.fillStyle = "rgba(255,255,255,.55)";
      for (const x of [90, 330]) g.fillRect(x, 90, 200, 300);
      g.fillStyle = "#b49a78";
      g.fillRect(820, 300, 380, 18);
      const cols = ["#6b8f71", "#c26a4a", "#3f5d7d", "#d8b54a", "#7d5a8c"];
      for (let i = 0; i < 9; i++) {
        g.fillStyle = cols[i % cols.length];
        g.fillRect(840 + i * 36, 210 + (i % 3) * 10, 28, 90 - (i % 3) * 10);
      }
      g.fillStyle = "#5f8f5a";
      g.beginPath();
      g.arc(1150, 560, 90, 0, Math.PI * 2);
      g.fill();
      g.filter = "blur(6px)";
      g.drawImage(c, 0, 0);
      g.filter = "none";
      break;
    }
    case "verde":
      lin([[0, "#1f3b2a"], [1, "#0e1a13"]]);
      glow(1000, 600, 600, "rgba(120,200,120,.18)");
      break;
    case "por-do-sol":
      lin([[0, "#ff9a62"], [0.55, "#e2557a"], [1, "#3b2a6b"]], 0, 0, 0, 720);
      glow(640, 520, 360, "rgba(255,220,150,.45)");
      break;
    case "oceano":
      lin([[0, "#7fd1e8"], [0.5, "#2f8fb5"], [1, "#0d3d5c"]], 0, 0, 0, 720);
      break;
  }
  const url = c.toDataURL("image/jpeg", 0.86);
  cache.set(id, url);
  return url;
}

/** Imagem escolhida no computador, reduzida para 1280x720 (cabe nas preferências). */
export async function fileToBg(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = 1280;
  c.height = 720;
  const g = c.getContext("2d")!;
  const s = Math.max(1280 / bmp.width, 720 / bmp.height);
  const w = bmp.width * s;
  const h = bmp.height * s;
  g.drawImage(bmp, (1280 - w) / 2, (720 - h) / 2, w, h);
  bmp.close();
  return c.toDataURL("image/jpeg", 0.8);
}

/** "preset:verkz" ou data URL → caminho da imagem. */
export function bgImagePath(img?: string) {
  if (!img) return presetImage("verkz");
  return img.startsWith("preset:") ? presetImage(img.slice(7)) : img;
}

let mod: typeof import("@livekit/track-processors") | null = null;
let proc: any = null;
let procTrack: LocalVideoTrack | null = null;

export async function camBgSupported() {
  try {
    mod ??= await import("@livekit/track-processors");
    return mod.supportsBackgroundProcessors();
  } catch {
    return false;
  }
}

/** Aplica o fundo na faixa da câmera (cria o processador uma vez por faixa e troca o modo depois). */
export async function applyCamBg(track: LocalVideoTrack | undefined, bg: CamBg) {
  if (!track) return;
  if (bg.kind === "none") {
    if (procTrack === track && track.getProcessor()) await track.stopProcessor();
    proc = null;
    procTrack = null;
    return;
  }
  mod ??= await import("@livekit/track-processors");
  if (!mod.supportsBackgroundProcessors()) throw new Error("Este computador não suporta fundo de câmera.");
  const opts = bg.kind === "blur" ? { mode: "background-blur" as const, blurRadius: 14 } : { mode: "virtual-background" as const, imagePath: bgImagePath(bg.img) };
  if (proc && procTrack === track && track.getProcessor()) {
    await proc.switchTo(opts);
    return;
  }
  proc = mod.BackgroundProcessor(opts);
  procTrack = track;
  await track.setProcessor(proc);
}
