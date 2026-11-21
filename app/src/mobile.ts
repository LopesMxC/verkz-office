// Versão de celular (navegador): detecção, joystick de toque, áudio liberado no 1º toque e PWA.
import type { World } from "./world";

/** Tela de toque (celular/tablet). */
export const isTouch = matchMedia("(pointer: coarse)").matches;
/** Tela pequena: layout de celular (dock compacto, painéis como folhas de baixo). */
export const isPhone = () => matchMedia("(max-width: 760px), (max-height: 500px) and (pointer: coarse)").matches;
export const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
/** Compartilhar tela só existe no navegador de computador. */
export const canShareScreen = !!navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices && !isTouch;

/** Joystick na tela: arrastar o polegar anda; até a borda, corre. */
export class Joystick {
  el: HTMLDivElement;
  private knob: HTMLDivElement;
  private id: number | null = null;
  private cx = 0;
  private cy = 0;
  private readonly R = 46;

  constructor(host: HTMLElement, private world: World) {
    this.el = document.createElement("div");
    this.el.className = "joystick";
    this.el.innerHTML = `<div class="joy-knob"></div>`;
    this.knob = this.el.firstElementChild as HTMLDivElement;
    host.appendChild(this.el);
    this.el.addEventListener("pointerdown", (e) => {
      if (this.id !== null) return;
      this.id = e.pointerId;
      this.el.setPointerCapture(e.pointerId);
      const r = this.el.getBoundingClientRect();
      this.cx = r.left + r.width / 2;
      this.cy = r.top + r.height / 2;
      this.el.classList.add("on");
      this.move(e);
      e.preventDefault();
    });
    this.el.addEventListener("pointermove", (e) => e.pointerId === this.id && this.move(e));
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.id) return;
      this.id = null;
      this.el.classList.remove("on");
      this.knob.style.transform = "";
      this.world.stick.x = 0;
      this.world.stick.y = 0;
    };
    this.el.addEventListener("pointerup", end);
    this.el.addEventListener("pointercancel", end);
  }

  private move(e: PointerEvent) {
    let dx = e.clientX - this.cx;
    let dy = e.clientY - this.cy;
    const d = Math.hypot(dx, dy);
    if (d > this.R) {
      dx = (dx / d) * this.R;
      dy = (dy / d) * this.R;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / this.R;
    const ny = -dy / this.R;
    const dead = Math.hypot(nx, ny) < 0.18;
    this.world.stick.x = dead ? 0 : nx;
    this.world.stick.y = dead ? 0 : ny;
  }

  show(v: boolean) {
    this.el.classList.toggle("hidden", !v);
  }
}

/** iPhone e Android só tocam áudio depois de um toque na tela: libera tudo no primeiro toque. */
export function unlockAudioOnTouch(unlock: () => Promise<boolean> | boolean) {
  const handler = async () => {
    let ok = false;
    try {
      ok = !!(await unlock());
    } catch {
      /* tenta no próximo toque */
    }
    if (ok) {
      document.removeEventListener("pointerdown", handler, true);
      document.removeEventListener("keydown", handler, true);
    }
  };
  document.addEventListener("pointerdown", handler, true);
  document.addEventListener("keydown", handler, true);
}

/** Registra o service worker (permite "Instalar app" / "Adicionar à tela inicial"). */
export function registerPWA() {
  if (!("serviceWorker" in navigator) || location.protocol !== "https:") return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

/** Pede para a tela não apagar enquanto o escritório está aberto (Android/iOS 16.4+). */
export async function keepScreenOn() {
  try {
    const wl = await (navigator as any).wakeLock?.request("screen");
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && wl?.released) keepScreenOn();
    }, { once: true });
  } catch {
    /* sem suporte: ok */
  }
}
