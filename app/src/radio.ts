/**
 * Rádio do escritório: alguém cola um link do YouTube (música ou playlist) numa caixa de som ou rádio,
 * e quem está na mesma sala ouve junto. Quem fica perto no corredor ouve mais baixo.
 *
 * O estado fica no "extra" de quem ligou (`extra.radio`), então quem entra depois também ouve,
 * já no ponto certo da música. Quando essa pessoa sai do escritório, o rádio para.
 */
export interface RadioState {
  /** id do item (caixa de som / rádio) */
  item: string;
  url: string;
  vid?: string;
  list?: string;
  /** quando começou (ms, relógio de quem ligou) */
  at: number;
}

/** Lê links do YouTube: watch?v=, youtu.be/, shorts/, music.youtube.com e playlists (list=). */
export function parseYouTube(url: string): { vid?: string; list?: string } | null {
  const u = url.trim();
  if (!u) return null;
  try {
    const p = new URL(/^https?:\/\//i.test(u) ? u : "https://" + u);
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/i.test(p.hostname)) return null;
    let vid = p.searchParams.get("v") ?? undefined;
    const list = p.searchParams.get("list") ?? undefined;
    if (!vid && /youtu\.be$/i.test(p.hostname)) vid = p.pathname.slice(1).split("/")[0] || undefined;
    if (!vid) {
      const m = p.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{6,})/);
      if (m) vid = m[1];
    }
    if (vid && !/^[\w-]{6,20}$/.test(vid)) vid = undefined;
    if (list && !/^[\w-]{6,64}$/.test(list)) return vid ? { vid } : null;
    if (!vid && !list) return null;
    return { vid, list };
  } catch {
    return null;
  }
}

let apiReady: Promise<any> | null = null;
function loadApi(): Promise<any> {
  if (apiReady) return apiReady;
  apiReady = new Promise((res, rej) => {
    const w = window as any;
    if (w.YT?.Player) return res(w.YT);
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      res(w.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => {
      apiReady = null;
      rej(new Error("Sem conexão com o YouTube"));
    };
    document.head.appendChild(s);
  });
  return apiReady;
}

export interface RadioSource extends RadioState {
  /** quem ligou */
  owner: string;
  ownerName: string;
}

/**
 * Toca (ou não) o rádio que estiver valendo para mim. `audible` devolve o volume (0..1) de cada
 * rádio pela posição: mesma sala = 1, perto no corredor = menos, longe = 0.
 */
export class RadioPlayer {
  private host: HTMLDivElement;
  private player: any = null;
  private key = "";
  private vol = 0;
  private wantVol = 0;
  private timer = 0;
  private hasSource = false;
  /** volume geral do rádio nas configurações (0..1) */
  master = 0.6;
  muted = false;
  onError?: (msg: string) => void;
  /** Mudou o que está tocando para mim (para a interface mostrar). */
  onNow?: (now: { title: string; owner: string; key: string } | null) => void;
  current: RadioSource | null = null;

  constructor() {
    this.host = document.createElement("div");
    // fora da tela, mas existente (o YouTube não toca em iframe escondido com display:none)
    this.host.style.cssText = "position:fixed;left:-400px;top:0;width:320px;height:180px;opacity:0;pointer-events:none;";
    document.body.appendChild(this.host);
    this.timer = window.setInterval(() => this.fade(), 120);
  }

  /** Escolhe o rádio mais alto entre os audíveis e toca/para conforme a posição. */
  update(sources: RadioSource[], audible: (s: RadioSource) => number) {
    let best: RadioSource | null = null;
    let bestV = 0;
    for (const s of sources) {
      const v = audible(s);
      if (v > bestV + 0.01) {
        bestV = v;
        best = s;
      }
    }
    this.hasSource = !!best;
    this.wantVol = this.muted ? 0 : bestV * this.master;
    const key = best ? `${best.item}|${best.vid ?? ""}|${best.list ?? ""}|${best.at}` : "";
    if (key === this.key) return;
    // trocou de rádio (ou saiu de perto): só troca se o novo for audível
    if (!best) {
      // deixa o volume cair; para quando chegar a zero (fade)
      return;
    }
    this.key = key;
    this.current = best;
    this.start(best).catch((e) => this.onError?.(String(e?.message ?? e)));
  }

  private async start(s: RadioSource) {
    const YT = await loadApi();
    const key = this.key;
    const offset = Math.max(0, (Date.now() - s.at) / 1000);
    const vars: any = { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0, origin: location.origin };
    if (s.list) {
      vars.listType = "playlist";
      vars.list = s.list;
    }
    const onReady = (e: any) => {
      if (key !== this.key) return;
      const p = e.target;
      p.setVolume(Math.round(this.vol * 100));
      if (!s.list && s.vid) {
        // música única: todo mundo no mesmo ponto (repete quando acaba)
        const dur = p.getDuration?.() || 0;
        p.seekTo(dur > 0 ? offset % dur : offset, true);
      }
      p.playVideo();
      this.announce();
    };
    const onState = (e: any) => {
      if (e.data === YT.PlayerState.ENDED && !s.list) e.target.seekTo(0, true), e.target.playVideo();
      if (e.data === YT.PlayerState.PLAYING) this.announce();
    };
    const onErr = (e: any) => {
      const c = e?.data;
      this.onError?.(
        c === 101 || c === 150 || c === 152
          ? "O dono desse vídeo não deixa tocar fora do YouTube. Tente outro link."
          : c === 100
            ? "Vídeo não encontrado ou privado."
            : c === 153
              ? "O YouTube recusou tocar aqui. Tente outra música."
              : "Não consegui tocar esse link.",
      );
    };
    this.destroy();
    const el = document.createElement("div");
    this.host.appendChild(el);
    this.player = new YT.Player(el, {
      host: "https://www.youtube.com",
      width: 320,
      height: 180,
      videoId: s.vid,
      playerVars: vars,
      events: { onReady, onStateChange: onState, onError: onErr },
    });
  }

  private announce() {
    const s = this.current;
    if (!s || !this.player?.getVideoData) return;
    const title = this.player.getVideoData()?.title || "YouTube";
    this.onNow?.({ title, owner: s.ownerName, key: this.key });
  }

  private fade() {
    this.vol += (this.wantVol - this.vol) * 0.25;
    if (Math.abs(this.vol - this.wantVol) < 0.01) this.vol = this.wantVol;
    try {
      this.player?.setVolume?.(Math.round(this.vol * 100));
    } catch {
      /* player ainda carregando */
    }
    // saiu de perto: quando o som some, desliga o player (libera memória). Silenciado mas por perto: continua.
    if (this.player && this.wantVol === 0 && this.vol === 0 && (!this.muted || !this.hasSource)) this.stopLocal();
  }

  stopLocal() {
    this.destroy();
    this.key = "";
    this.current = null;
    this.onNow?.(null);
  }

  private destroy() {
    try {
      this.player?.destroy?.();
    } catch {
      /* já foi */
    }
    this.player = null;
    this.host.innerHTML = "";
  }

  dispose() {
    clearInterval(this.timer);
    this.destroy();
    this.host.remove();
  }
}
