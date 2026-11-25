import {
  ConnectionState,
  DisconnectReason,
  LocalAudioTrack,
  LocalTrackPublication,
  LocalVideoTrack,
  Participant,
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  createLocalScreenTracks,
} from "livekit-client";
import type { World } from "./world";
import { applyCamBg, type CamBg } from "./cambg";
import { soundpadStream } from "./sound";

/** Alcance da voz: volume cheio até `full`, silêncio a partir de `silent` (metros). */
export const RANGES = {
  curto: { full: 1.6, silent: 4.5 },
  medio: { full: 2.2, silent: 6.5 },
  longo: { full: 3.2, silent: 9.5 },
};

export interface MediaPrefs {
  micId?: string;
  camId?: string;
  speakerId?: string;
  noiseSuppression: boolean;
  micOnJoin: boolean;
  mirror: boolean;
  camQuality: "360" | "720";
  range: keyof typeof RANGES;
  /** Áudio 3D (voz vem do lado de quem fala e abafa de longe). Desligado: volume só pela distância. */
  spatial: boolean;
}

export interface ScreenTile {
  key: string;
  name: string;
  el: HTMLVideoElement;
  local: boolean;
}

/** Explica o erro do WebRTC em português, com o que fazer. */
export function explainMediaError(e: any, what: "microfone" | "câmera" | "tela"): string {
  const name = e?.name ?? "";
  const msg = String(e?.message ?? e ?? "");
  if (name === "NotFoundError" || /Requested device not found|not found/i.test(msg)) return `Nenhum(a) ${what} encontrado(a) neste computador.`;
  if (name === "NotAllowedError" || /Permission|denied/i.test(msg))
    return `O acesso ao ${what} foi negado. Libere nas configurações de privacidade do sistema e tente de novo.`;
  if (name === "NotReadableError" || /in use|Could not start/i.test(msg)) return `O ${what} está sendo usado por outro programa. Feche o outro app e tente de novo.`;
  if (/engine not connected|pc connection|could not establish|timeout/i.test(msg))
    return `Sem conexão de áudio/vídeo com o servidor agora. O app vai tentar de novo sozinho.`;
  return `Não deu para usar o(a) ${what}: ${msg}`;
}

/** Contexto de áudio compartilhado: no modo 3D toda voz passa por ele para ganhar posição. */
const audioCtx = new AudioContext({ latencyHint: "interactive" });

/**
 * Uma voz remota. O elemento <audio> sempre existe (o WebRTC só entrega o som com ele tocando).
 * - modo 3D: o elemento fica mudo e o som passa por filtro (abafamento) + pan (lado) + ganho próprio;
 * - modo normal: o próprio elemento toca, com o volume pela distância (o cancelamento de eco do
 *   sistema funciona melhor assim, bom para quem usa caixa de som em vez de fone).
 * O volume nunca pula: sobe e desce em rampa, então andar perto do limite não "corta" a voz.
 */
interface Voice {
  pid: string;
  track: RemoteAudioTrack;
  el: HTMLMediaElement;
  chain?: { src: MediaStreamAudioSourceNode; filter: BiquadFilterNode; pan: StereoPannerNode; gain: GainNode };
  /** Volume atual (0..1) e último alvo mandado para o ganho do WebAudio. */
  vol: number;
  sent: number;
}

/** Quanto tempo a "fala" continua depois do último sinal de voz (evita a animação parar seca). */
const TALK_HANG_MS = 900;

export class Media {
  room = new Room({
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
    publishDefaults: { simulcast: true, videoCodec: "vp8" },
    reconnectPolicy: { nextRetryDelayInMs: (ctx) => (ctx.retryCount > 30 ? null : Math.min(8000, 500 * 2 ** ctx.retryCount)) },
  });
  micOn = false;
  camOn = false;
  screenOn = false;
  connected = false;
  prefs: MediaPrefs = { noiseSuppression: true, micOnJoin: true, mirror: true, camQuality: "360", range: "medio", spatial: true };
  private audioHost = document.createElement("div");
  private timer?: number;
  private url = "";
  private token = "";
  private retry?: number;
  private retries = 0;
  /** A rota UDP direta caiu nesta sessão: conecta só pelo relay TURN (443). */
  private forceRelay = false;
  private screenTracks: (LocalVideoTrack | LocalAudioTrack)[] = [];
  private padPub?: LocalTrackPublication;
  screens = new Map<string, ScreenTile>();
  onScreensChanged?: () => void;
  onStateChanged?: () => void;
  onError?: (msg: string) => void;
  /** Liguei/desliguei microfone, câmera ou tela (para o som de confirmação). */
  onToggle?: (what: "mic" | "cam" | "screen", on: boolean) => void;
  /** Alguém ficou audível (para o som de aproximação). */
  onApproach?: (id: string) => void;
  /** Mudanças no meu estado que os outros precisam saber (câmera ligada etc.). */
  onLocalState?: (patch: Record<string, unknown>) => void;
  /** Volume individual de cada pessoa (0 a 2; 1 = normal). */
  userVolume?: (id: string) => number;
  /** Ganho que estou aplicando a cada pessoa (0..1), útil para a lista. */
  levels = new Map<string, number>();
  private voices = new Map<string, Voice>();
  private acTimer?: number;
  /** Quem eu estou ouvindo agora e quando parei de ouvir cada um (som de aproximação sem repetir). */
  private hearing = new Set<string>();
  private lostAt = new Map<string, number>();
  /** Quando mudou a assinatura de cada faixa (não fica assinando e cancelando ao andar no limite). */
  private subAt = new Map<string, number>();
  /** Falando agora (pelo servidor) e o último instante em que cada um falou. */
  private speakingNow = new Set<string>();
  private lastSpoke = new Map<string, number>();

  constructor(private world: World) {
    this.audioHost.style.display = "none";
    document.body.appendChild(this.audioHost);
    const r = this.room;

    r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.dataset.pid = p.identity;
        if (this.prefs.speakerId) (el as any).setSinkId?.(this.prefs.speakerId).catch(() => {});
        this.audioHost.appendChild(el);
        this.addVoice(track as RemoteAudioTrack, pub.trackSid, p.identity, el);
      } else if (pub.source === Track.Source.Camera) {
        const av = this.world.others.get(p.identity);
        if (av) this.putVideo(av.bubble, track as RemoteVideoTrack, p.name || av.info.name);
      } else if (pub.source === Track.Source.ScreenShare) {
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        track.attach(v);
        this.screens.set(pub.trackSid, { key: pub.trackSid, name: p.name || "Alguém", el: v, local: false });
        this.onScreensChanged?.();
      }
    });

    r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
      this.removeVoice(pub.trackSid);
      track.detach().forEach((el) => el.remove());
      if (pub.source === Track.Source.Camera) this.camPlaceholder(p);
      if (pub.source === Track.Source.ScreenShare && this.screens.delete(pub.trackSid)) this.onScreensChanged?.();
    });

    r.on(RoomEvent.TrackPublished, (pub, p) => {
      if (pub.source === Track.Source.Camera) this.camPlaceholder(p);
    });
    r.on(RoomEvent.TrackUnpublished, (pub: RemoteTrackPublication, p: RemoteParticipant) => {
      if (pub.source === Track.Source.Camera) this.clearBubble(p.identity);
      if (this.screens.delete(pub.trackSid)) this.onScreensChanged?.();
    });

    r.on(RoomEvent.TrackMuted, (pub, p) => {
      this.markMuted(p, pub.source);
      if (pub.source === Track.Source.Camera && !p.isLocal) this.clearBubble(p.identity);
    });
    r.on(RoomEvent.TrackUnmuted, (pub, p) => {
      this.markMuted(p, pub.source);
      if (pub.source === Track.Source.Camera && !p.isLocal) this.camPlaceholder(p as RemoteParticipant);
    });

    r.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const now = performance.now();
      // quem parou de falar agora: marca o instante (a fala "esfria" devagar em updateTalking)
      for (const id of this.speakingNow) this.lastSpoke.set(id, now);
      this.speakingNow = new Set(speakers.map((s) => s.identity));
      for (const id of this.speakingNow) this.lastSpoke.set(id, now);
      this.updateTalking();
    });

    r.on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
      if (pub.source === Track.Source.Camera && pub.track) this.showLocalCam(pub.track as LocalVideoTrack);
    });
    r.on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
      if (pub.source === Track.Source.Camera) this.hideLocalCam();
    });

    r.on(RoomEvent.ParticipantDisconnected, (p) => this.clearBubble(p.identity));
    r.on(RoomEvent.Reconnected, () => {
      this.connected = true;
      this.onStateChanged?.();
    });
    r.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      this.connected = false;
      this.padPub = undefined;
      // Caiu sem ninguém pedir: a rota UDP direta (porta 7882) se perdeu. Daqui em diante usa só o
      // relay TURN pela porta 443 (TCP/TLS), que atravessa roteador/VPN/2 links de internet.
      if (this.url && reason !== DisconnectReason.CLIENT_INITIATED) {
        if (!this.forceRelay) console.warn("livekit: conexão direta caiu, passando a usar o relay (443)");
        this.forceRelay = true;
        this.retries = 0;
      }
      this.onStateChanged?.();
      this.scheduleRetry(true);
    });
    r.on(RoomEvent.ConnectionStateChanged, (s) => {
      this.connected = s === ConnectionState.Connected;
      this.onStateChanged?.();
    });
    navigator.mediaDevices?.addEventListener?.("devicechange", () => this.onStateChanged?.());
  }

  // ------------------------------------------------------------------ bolha da câmera
  private showLocalCam(track: LocalVideoTrack) {
    const me = this.world.me;
    if (!me) return;
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    if (this.prefs.mirror) v.classList.add("mirror");
    (v as any)._lkTrack = track;
    this.camWarned = false;
    track.attach(v);
    me.bubble.replaceChildren(v);
    me.bubble.classList.remove("hidden", "placeholder");
  }
  private camWarned = false;
  /** Minha câmera ligada sem mandar imagem (presa em outro programa): avisa uma vez. */
  private checkLocalCam(now: number) {
    const v = this.world.me?.bubble.querySelector("video") as HTMLVideoElement | null;
    if (!this.camOn || !v) return;
    const since = ((v as any)._since ??= now);
    if (v.videoWidth > 0) return;
    if (!this.camWarned && now - since > 6000) {
      this.camWarned = true;
      this.onError?.("Sua câmera não está mandando imagem. Ela pode estar em uso por outro programa (Meet, Zoom, Teams). Feche o outro programa e ligue a câmera de novo.");
    }
  }
  private hideLocalCam() {
    this.world.me?.bubble.replaceChildren();
    this.world.me?.bubble.classList.add("hidden");
  }

  /** Câmera ligada mas longe (sem assinar o vídeo): bloco com as iniciais. */
  private camPlaceholder(p: RemoteParticipant) {
    const pub = p.getTrackPublication(Track.Source.Camera);
    const av = this.world.others.get(p.identity);
    if (!av || !pub || pub.isMuted) return;
    if (pub.isSubscribed && pub.videoTrack && av.bubble.querySelector("video")) return;
    this.dropVideos(av.bubble);
    const name = (p.name || av.info.name || "?").trim();
    av.bubble.innerHTML = `<div class="cam-ph"><span>${initialsOf(name)}</span><small>Câmera ligada</small></div>`;
    av.bubble.classList.remove("hidden", "nofeed");
    av.bubble.classList.add("placeholder");
  }

  /** Solta os <video> de um bloco (o adaptiveStream deixa de contar com eles). */
  private dropVideos(box: HTMLElement) {
    for (const v of box.querySelectorAll("video")) {
      const t = (v as any)._lkTrack as RemoteVideoTrack | LocalVideoTrack | undefined;
      t?.detach(v);
      v.srcObject = null;
      v.remove();
    }
  }

  /** Põe o vídeo da faixa no bloco (com as iniciais por baixo, para quando a imagem não chega). */
  private putVideo(box: HTMLElement, track: RemoteVideoTrack, name: string) {
    this.dropVideos(box);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    (v as any)._lkTrack = track;
    (v as any)._since = performance.now();
    track.attach(v);
    box.innerHTML = `<div class="cam-ph nofeed-ph"><span>${initialsOf(name)}</span><small>Sem imagem</small></div>`;
    box.prepend(v);
    box.classList.remove("hidden", "placeholder", "nofeed");
  }

  /**
   * Confere a bolha da câmera de cada pessoa a cada passo, sem depender da ordem dos eventos do
   * LiveKit. Corrige: (1) ao voltar para perto, a faixa reassinada não aparecia e a bolha ficava
   * em "Câmera ligada"; (2) vídeo assinado sem quadros (bloco preto): tenta religar e, se não vier
   * imagem, mostra as iniciais com "Sem imagem".
   */
  private syncCam(p: RemoteParticipant) {
    const av = this.world.others.get(p.identity);
    if (!av) return;
    const pub = p.getTrackPublication(Track.Source.Camera) as RemoteTrackPublication | undefined;
    if (!pub || pub.isMuted) {
      if (!av.bubble.classList.contains("hidden")) {
        this.dropVideos(av.bubble);
        this.clearBubble(p.identity);
      }
      return;
    }
    const track = pub.isSubscribed ? (pub.videoTrack as RemoteVideoTrack | undefined) : undefined;
    if (!track) return this.camPlaceholder(p);
    const v = av.bubble.querySelector("video") as HTMLVideoElement | null;
    if (!v || (v as any)._lkTrack !== track || !track.attachedElements.includes(v)) return this.putVideo(av.bubble, track, p.name || av.info.name);
    const noFeed = v.videoWidth === 0 || v.readyState < 2;
    const age = performance.now() - (v as any)._since;
    av.bubble.classList.toggle("nofeed", noFeed && age > 2500);
    // 5 s sem imagem: religa o vídeo (o adaptiveStream às vezes fica pausado depois de reassinar)
    if (noFeed && age > 5000 && !(v as any)._retried) {
      (v as any)._retried = true;
      track.detach(v);
      track.attach(v);
      v.play().catch(() => {});
    }
  }

  /** Faixa de câmera para os blocos do modo reunião ("me" = a minha). */
  camTrack(id: string): RemoteVideoTrack | LocalVideoTrack | undefined {
    if (id === "me") {
      const pub = this.room.localParticipant.getTrackPublication(Track.Source.Camera);
      return this.camOn && pub && !pub.isMuted ? (pub.videoTrack as LocalVideoTrack | undefined) : undefined;
    }
    const pub = this.room.remoteParticipants.get(id)?.getTrackPublication(Track.Source.Camera) as RemoteTrackPublication | undefined;
    return pub && !pub.isMuted && pub.isSubscribed ? (pub.videoTrack as RemoteVideoTrack | undefined) : undefined;
  }

  /** Quem está presente para a gravação (eu + quem eu ouço ou está na minha sala) e o vídeo da câmera de cada um. */
  recCams(): { name: string; el: HTMLVideoElement | null; me: boolean }[] {
    const out: { name: string; el: HTMLVideoElement | null; me: boolean }[] = [];
    const mine = this.camOn ? (this.world.me?.bubble.querySelector("video") as HTMLVideoElement | null) : null;
    out.push({ name: "", el: mine, me: true });
    for (const [id, av] of this.world.others) {
      const p = this.room.remoteParticipants.get(id);
      if (!p) continue;
      if (!((this.levels.get(id) ?? 0) > 0 || this.sameRoom(id))) continue;
      const el = this.hasCam(id) ? (av.bubble.querySelector("video") as HTMLVideoElement | null) : null;
      out.push({ name: p.name || av.info.name || "Alguém", el, me: false });
    }
    return out;
  }

  /** Câmera ligada (mesmo que ainda não assinada). */
  hasCam(id: string) {
    const pub = this.room.remoteParticipants.get(id)?.getTrackPublication(Track.Source.Camera);
    return !!pub && !pub.isMuted;
  }

  /** Está na mesma sala que eu (sala de verdade, não um salão aberto grande). */
  sameRoom(id: string) {
    const av = this.world.others.get(id);
    const my = this.world.currentZone;
    if (!av || !my || av.info.zone !== my.id || !this.world.sameLevel(av)) return false;
    return my.private || isRoomSized(my);
  }

  private clearBubble(id: string) {
    const av = this.world.others.get(id);
    if (av) {
      this.dropVideos(av.bubble);
      av.bubble.replaceChildren();
      av.bubble.classList.add("hidden");
      av.bubble.classList.remove("nofeed", "placeholder");
    }
  }

  private markMuted(p: Participant, source: Track.Source) {
    if (source !== Track.Source.Microphone) return;
    const av = p.isLocal ? this.world.me : this.world.others.get(p.identity);
    av?.setMuted(!p.isMicrophoneEnabled);
  }

  // ------------------------------------------------------------------ conexão
  async connect(url: string, token: string) {
    this.url = url;
    this.token = token;
    this.retries = 0;
    clearTimeout(this.retry);
    if (this.room.state !== ConnectionState.Disconnected) await this.room.disconnect();
    await this.tryConnect(true);
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.updateProximity(), 200);
    clearInterval(this.acTimer);
    this.acTimer = window.setInterval(() => {
      this.updateAcoustics();
      this.updateTalking();
    }, 50);
  }

  private async tryConnect(first: boolean) {
    try {
      // Duas falhas seguidas pela rota direta também mudam para o relay.
      if (!first && this.retries >= 2) this.forceRelay = true;
      await this.room.connect(this.url, this.token, {
        autoSubscribe: false,
        peerConnectionTimeout: 20000,
        ...(this.forceRelay ? { rtcConfig: { iceTransportPolicy: "relay" as RTCIceTransportPolicy } } : {}),
      });
      this.connected = true;
      this.retries = 0;
      await this.room.startAudio().catch(() => {});
      if (this.prefs.speakerId) await this.setSpeaker(this.prefs.speakerId);
      if ((first && this.prefs.micOnJoin) || this.micOn) await this.setMic(true);
      if (this.camOn) await this.setCam(true);
      this.onStateChanged?.();
    } catch (e: any) {
      this.connected = false;
      if (first) this.onError?.("Sem conexão de áudio/vídeo agora. Tentando de novo em segundo plano...");
      console.warn("livekit:", e);
      this.scheduleRetry();
    }
  }

  private scheduleRetry(now = false) {
    if (!this.url || this.retries > 40) return;
    clearTimeout(this.retry);
    const wait = now && this.retries === 0 ? 300 : Math.min(15000, 1500 * 2 ** Math.min(this.retries, 4));
    this.retries++;
    this.retry = window.setTimeout(() => {
      if (this.room.state === ConnectionState.Disconnected) this.tryConnect(false);
    }, wait);
  }

  async disconnect() {
    clearInterval(this.timer);
    clearInterval(this.acTimer);
    clearTimeout(this.retry);
    this.url = "";
    await this.stopScreen();
    await this.room.disconnect();
  }

  private needConnection(what: "microfone" | "câmera" | "tela") {
    if (this.room.state === ConnectionState.Connected) return true;
    // Guarda o pedido: quando a conexão voltar, tryConnect liga o microfone/câmera sozinho.
    if (what === "microfone") this.micOn = true;
    if (what === "câmera") this.camOn = true;
    this.onError?.(
      what === "tela"
        ? "Reconectando o áudio/vídeo. Tente compartilhar a tela em alguns segundos."
        : `Reconectando o áudio/vídeo. O(a) ${what} liga sozinho(a) assim que voltar.`,
    );
    if (this.room.state === ConnectionState.Disconnected) {
      this.retries = 0;
      this.scheduleRetry(true);
    }
    return false;
  }

  // ------------------------------------------------------------------ microfone, câmera, dispositivos
  async setMic(on: boolean) {
    if (!on && this.room.state !== ConnectionState.Connected) {
      this.micOn = false;
      this.world.me?.setMuted(true);
      return this.onStateChanged?.();
    }
    if (on && !this.needConnection("microfone")) return this.onStateChanged?.();
    try {
      await this.room.localParticipant.setMicrophoneEnabled(on, {
        deviceId: this.prefs.micId,
        noiseSuppression: this.prefs.noiseSuppression,
        echoCancellation: true,
        autoGainControl: true,
      });
      this.micOn = on;
      this.world.me?.setMuted(!on);
      this.onToggle?.("mic", on);
    } catch (e: any) {
      this.micOn = false;
      this.onError?.(explainMediaError(e, "microfone"));
    }
    this.onStateChanged?.();
  }

  async setCam(on: boolean) {
    if (!on && this.room.state !== ConnectionState.Connected) {
      this.camOn = false;
      this.hideLocalCam();
      return this.onStateChanged?.();
    }
    if (on && !this.needConnection("câmera")) return this.onStateChanged?.();
    try {
      const res = this.prefs.camQuality === "720" ? VideoPresets.h720.resolution : VideoPresets.h360.resolution;
      await this.room.localParticipant.setCameraEnabled(on, { deviceId: this.prefs.camId, resolution: res });
      this.camOn = on;
      // desligar só "silencia" a faixa (não despublica): tira o bloco da cabeça na hora
      const pub = this.room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (on && pub?.track) this.showLocalCam(pub.track as LocalVideoTrack);
      else this.hideLocalCam();
      this.onToggle?.("cam", on);
      if (on && this.camBg.kind !== "none") this.setCamBg(this.camBg);
    } catch (e: any) {
      this.camOn = false;
      this.onError?.(explainMediaError(e, "câmera"));
    }
    this.onLocalState?.({ cam: this.camOn || null });
    this.onStateChanged?.();
  }

  /** Fundo da minha câmera (desfocar ou imagem). Vale na hora e nas próximas vezes que ligar. */
  camBg: CamBg = { kind: "none" };
  async setCamBg(bg: CamBg) {
    this.camBg = bg;
    const pub = this.room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (!this.camOn || !pub?.track) return;
    try {
      await applyCamBg(pub.track as LocalVideoTrack, bg);
      // a bolha passa a mostrar a imagem já com o fundo
      this.showLocalCam(pub.track as LocalVideoTrack);
    } catch (e: any) {
      this.onError?.("Não consegui aplicar o fundo da câmera: " + (e?.message ?? e));
    }
  }

  async listDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return {
        mics: all.filter((d) => d.kind === "audioinput"),
        cams: all.filter((d) => d.kind === "videoinput"),
        speakers: all.filter((d) => d.kind === "audiooutput"),
      };
    } catch {
      return { mics: [], cams: [], speakers: [] };
    }
  }

  async applyDevices() {
    if (this.room.state !== ConnectionState.Connected) return;
    if (this.micOn) await this.room.switchActiveDevice("audioinput", this.prefs.micId ?? "default").catch(() => {});
    if (this.camOn) await this.room.switchActiveDevice("videoinput", this.prefs.camId ?? "default").catch(() => {});
    if (this.prefs.speakerId) await this.setSpeaker(this.prefs.speakerId);
  }

  /** Saída de som: vale para as vozes no modo normal (elementos) e no 3D (contexto de áudio). */
  private async setSpeaker(id: string) {
    await this.room.switchActiveDevice("audiooutput", id).catch(() => {});
    this.audioHost.querySelectorAll("audio").forEach((a: any) => a.setSinkId?.(id).catch(() => {}));
    await (audioCtx as any).setSinkId?.(id).catch(() => {});
  }

  /** Liga/desliga o áudio 3D na hora, sem reconectar. */
  setSpatial(on: boolean) {
    this.prefs.spatial = on;
    for (const v of this.voices.values()) this.wireVoice(v);
  }

  // ------------------------------------------------------------------ tela
  /** Captura a tela, mostra a prévia na hora e então transmite. */
  async setScreen(on: boolean) {
    if (!on) return this.stopScreen();
    if (!navigator.mediaDevices?.getDisplayMedia) {
      this.onError?.("Este sistema não permite compartilhar a tela pelo app. Atualize o Windows/macOS e tente de novo.");
      return;
    }
    try {
      const tracks = await createLocalScreenTracks({ audio: true, resolution: { width: 1920, height: 1080, frameRate: 15 }, selfBrowserSurface: "exclude" } as any);
      this.screenTracks = tracks as (LocalVideoTrack | LocalAudioTrack)[];
      const video = tracks.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
      if (!video) throw new Error("Nenhuma imagem da tela foi capturada");
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      video.attach(v);
      this.screens.set("local", { key: "local", name: "Sua tela", el: v, local: true });
      this.screenOn = true;
      this.onToggle?.("screen", true);
      this.onScreensChanged?.();
      this.onStateChanged?.();
      // quando a pessoa clica em "Parar de compartilhar" do sistema
      video.mediaStreamTrack.addEventListener("ended", () => this.stopScreen());
      if (this.room.state === ConnectionState.Connected) {
        for (const t of tracks) await this.room.localParticipant.publishTrack(t, { source: t.kind === Track.Kind.Video ? Track.Source.ScreenShare : Track.Source.ScreenShareAudio });
      } else {
        this.onError?.("Sua tela está na prévia, mas ainda não conectou para transmitir. Assim que conectar, compartilhe de novo.");
      }
    } catch (e: any) {
      if (e?.name === "NotAllowedError" && /denied by system|Permission denied by system/i.test(e?.message ?? "")) {
        this.onError?.("O sistema bloqueou a gravação de tela. No Mac: Ajustes > Privacidade > Gravação de tela > ative o VERKZ Office.");
      } else if (e?.name !== "NotAllowedError" && e?.name !== "AbortError") {
        this.onError?.(explainMediaError(e, "tela"));
      }
      await this.stopScreen();
    }
  }

  async stopScreen() {
    for (const t of this.screenTracks) {
      try {
        await this.room.localParticipant.unpublishTrack(t, true);
      } catch {
        t.stop();
      }
      t.stop();
    }
    const was = this.screenOn;
    this.screenTracks = [];
    this.screenOn = false;
    if (was) this.onToggle?.("screen", false);
    if (this.screens.delete("local")) this.onScreensChanged?.();
    this.onStateChanged?.();
  }

  // ------------------------------------------------------------------ soundpad
  /** Publica a faixa do soundpad (uma vez) para quem está perto ouvir. */
  async ensureSoundpad() {
    if (this.padPub || this.room.state !== ConnectionState.Connected) return;
    const track = soundpadStream().getAudioTracks()[0];
    if (!track) return;
    try {
      this.padPub = await this.room.localParticipant.publishTrack(track, { name: "soundpad", source: Track.Source.Unknown, dtx: false, red: false });
    } catch (e) {
      console.warn("soundpad:", e);
    }
  }

  // ------------------------------------------------------------------ proximidade
  /**
   * Volume que eu devo ouvir de outra pessoa (0..1), considerando andar e salas privadas.
   * A curva é contínua até o limite do alcance (sem degrau), para a voz sumir aos poucos.
   */
  gainFor(id: string): { gain: number; dist: number } {
    const me = this.world.me;
    const av = this.world.others.get(id);
    if (!me || !av) return { gain: 0, dist: Infinity };
    // outro andar: não ouve
    if (!this.world.sameLevel(av)) return { gain: 0, dist: Infinity };
    const { full, silent } = RANGES[this.prefs.range] ?? RANGES.medio;
    const rel = this.relative(id)!;
    const dist = rel.dist;
    const myZone = this.world.currentZone;
    const theirZone = av.info.zone ? this.world.layout.zones.find((z) => z.id === av.info.zone) ?? null : null;
    const myPrivate = myZone?.private ? myZone.id : null;
    const theirPrivate = theirZone?.private ? theirZone.id : null;
    if (myPrivate || theirPrivate) {
      // Dentro de sala privada: todo mundo da sala se ouve com volume cheio, ninguém de fora ouve.
      return { gain: myPrivate && myPrivate === theirPrivate ? 1 : 0, dist };
    }
    // mesma sala aberta (cozinha, biblioteca...): todo mundo da sala na mesma conversa
    if (myZone && theirZone && myZone.id === theirZone.id && isRoomSized(myZone)) return { gain: 1, dist };
    return { gain: falloff(dist, full, silent), dist };
  }

  /**
   * Posição de quem fala em relação a mim. Usa a posição suavizada do boneco (a mesma que aparece
   * na tela), para a voz acompanhar o movimento sem saltos; com a janela escondida, a da rede.
   */
  private relative(id: string) {
    const me = this.world.me;
    const av = this.world.others.get(id);
    if (!me || !av) return null;
    const src = document.hidden ? av.target : av.root.position;
    const dx = src.x - me.root.position.x;
    const dz = src.z - me.root.position.z;
    return { dx, dz, dist: Math.sqrt(dx * dx + dz * dz) };
  }

  // ------------------------------------------------------------------ vozes
  private addVoice(track: RemoteAudioTrack, sid: string, pid: string, el: HTMLMediaElement) {
    this.removeVoice(sid);
    const start = this.levels.get(pid) ?? 0;
    const v: Voice = { pid, track, el, vol: start, sent: -1 };
    this.voices.set(sid, v);
    this.wireVoice(v);
  }

  private removeVoice(sid: string) {
    const v = this.voices.get(sid);
    if (!v) return;
    this.unwire(v);
    this.voices.delete(sid);
  }

  private unwire(v: Voice) {
    if (!v.chain) return;
    const { src, filter, pan, gain } = v.chain;
    for (const n of [src, filter, pan, gain]) {
      try {
        n.disconnect();
      } catch {
        /* já desligado */
      }
    }
    v.chain = undefined;
  }

  /** Monta o caminho do som da voz conforme o modo (3D ou normal). */
  private wireVoice(v: Voice) {
    this.unwire(v);
    v.sent = -1;
    if (this.prefs.spatial) {
      try {
        if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
        const src = audioCtx.createMediaStreamSource(new MediaStream([v.track.mediaStreamTrack]));
        const filter = audioCtx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 18000;
        filter.Q.value = 0.5;
        const pan = audioCtx.createStereoPanner();
        const gain = audioCtx.createGain();
        gain.gain.value = v.vol;
        src.connect(filter).connect(pan).connect(gain).connect(audioCtx.destination);
        v.chain = { src, filter, pan, gain };
        v.el.muted = true;
        v.el.volume = 0;
        return;
      } catch (e) {
        console.warn("áudio 3D indisponível, usando o normal:", e);
      }
    }
    v.el.muted = false;
    v.el.volume = clamp01(v.vol);
  }

  /** Volume, abafamento e lado de cada voz, 20x por segundo, sempre em rampa. */
  private updateAcoustics() {
    if (!this.voices.size) return;
    if (this.prefs.spatial && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    const { full, silent } = RANGES[this.prefs.range] ?? RANGES.medio;
    const now = audioCtx.currentTime;
    for (const v of this.voices.values()) {
      const rel = this.relative(v.pid);
      // volume da distância x volume que eu escolhi para essa pessoa (botão direito > Volume)
      const want = (this.levels.get(v.pid) ?? 0) * Math.max(0, Math.min(2, this.userVolume?.(v.pid) ?? 1));
      // sobe rápido (não perde o começo da frase) e desce devagar (some sem corte)
      v.vol += (want - v.vol) * (want > v.vol ? 0.45 : 0.18);
      if (Math.abs(want - v.vol) < 0.002) v.vol = want;
      if (v.chain) {
        let cutoff = 18000;
        let pan = 0;
        if (rel && want > 0 && !this.inSamePrivate(v.pid)) {
          // de longe a voz perde os agudos, como num ambiente de verdade
          const far = clamp01((rel.dist - full) / (silent - full));
          cutoff = 18000 * (1 - far) * (1 - far) + 1800;
          // lado na tela (vale para a visão isométrica e para a aérea)
          const r = this.world.screenRight;
          const side = rel.dx * r.x + rel.dz * r.z;
          pan = Math.max(-0.7, Math.min(0.7, side / (rel.dist + 1.5)));
        }
        if (Math.abs(v.vol - v.sent) > 0.002) {
          v.chain.gain.gain.setTargetAtTime(v.vol, now, 0.06);
          v.sent = v.vol;
        }
        v.chain.filter.frequency.setTargetAtTime(cutoff, now, 0.12);
        v.chain.pan.pan.setTargetAtTime(pan, now, 0.12);
      } else {
        const vol = clamp01(v.vol);
        if (Math.abs(v.el.volume - vol) > 0.004) v.el.volume = vol;
      }
    }
  }

  /**
   * Quem está falando: liga na hora e desliga devagar (TALK_HANG_MS depois do último sinal),
   * para os gestos e o brilho em volta do nome terminarem suaves, sem piscar entre as palavras.
   */
  private updateTalking() {
    const now = performance.now();
    const talking = (id: string) => this.speakingNow.has(id) || now - (this.lastSpoke.get(id) ?? -1e9) < TALK_HANG_MS;
    for (const [id, av] of this.world.others) {
      const t = talking(id);
      av.talking = t;
      av.setSpeaking(t && (this.levels.get(id) ?? 0) > 0.01);
    }
    const me = this.world.me;
    if (me) {
      const t = this.micOn && talking(this.room.localParticipant.identity);
      me.talking = t;
      me.setSpeaking(t);
    }
  }

  /** Está falando agora (com a folga do fim de fala). Usado nos blocos da tela compartilhada. */
  isTalking(id: string) {
    const now = performance.now();
    return this.speakingNow.has(id) || now - (this.lastSpoke.get(id) ?? -1e9) < TALK_HANG_MS;
  }

  private inSamePrivate(id: string) {
    const my = this.world.currentZone;
    const av = this.world.others.get(id);
    return !!(my?.private && av?.info.zone === my.id);
  }

  private updateProximity() {
    const { silent } = RANGES[this.prefs.range] ?? RANGES.medio;
    const now = performance.now();
    this.checkLocalCam(now);
    for (const p of this.room.remoteParticipants.values()) {
      const id = p.identity;
      const { gain, dist } = this.gainFor(id);
      this.levels.set(id, gain);
      // som de aproximação: só quando alguém fica audível depois de um tempo longe (não repete no limite)
      if (gain > 0.04 && !this.hearing.has(id)) {
        this.hearing.add(id);
        if (now - (this.lostAt.get(id) ?? -1e9) > 8000) this.onApproach?.(id);
      } else if (gain === 0 && this.hearing.has(id)) {
        this.hearing.delete(id);
        this.lostAt.set(id, now);
      }
      const roomOk = this.sameRoomRule(id);
      for (const pub of p.trackPublications.values()) {
        let want: boolean;
        if (pub.kind === Track.Kind.Audio) {
          // assina antes de ficar audível e só larga bem depois (histerese larga): andar perto do
          // limite não fica ligando e desligando a voz
          want = gain > 0 || (roomOk && dist < (pub.isSubscribed ? silent + 6 : silent + 2));
        } else if (pub.source === Track.Source.Camera) {
          // a câmera aparece em bloco para quem está por perto (um pouco além do alcance da voz)
          // na mesma sala a câmera fica sempre ligada, mesmo do canto mais longe
          want = this.sameRoom(id) || gain > 0 || (roomOk && dist < (pub.isSubscribed ? silent + 4 : silent + 2.5));
        } else {
          want = gain > 0 || (pub.isSubscribed && roomOk && dist < silent + 3);
        }
        if (pub.isSubscribed !== want) {
          // depois de mudar, segura uns segundos antes de desfazer (só vale para soltar)
          const key = pub.trackSid;
          const last = this.subAt.get(key) ?? -1e9;
          if (want || now - last > 6000) {
            pub.setSubscribed(want);
            this.subAt.set(key, now);
          }
        }
      }
      this.syncCam(p);
    }
  }

  /** A regra de salas permite ouvir esta pessoa (mesmo andar e sem sala privada no meio)? */
  canHear(id: string) {
    const av = this.world.others.get(id);
    return !!av && this.world.sameLevel(av) && this.sameRoomRule(id);
  }

  /** Pré-assina só quando a regra de sala permitiria ouvir. */
  private sameRoomRule(id: string) {
    const av = this.world.others.get(id);
    const my = this.world.currentZone;
    const theirs = av?.info.zone ? this.world.layout.zones.find((z) => z.id === av.info.zone) : undefined;
    if (my?.private || theirs?.private) return my?.id === theirs?.id;
    return true;
  }
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Queda natural da voz: cheia até `full`, cai como num ambiente real e chega a zero
 * exatamente em `silent`, com a ponta arredondada (sem degrau no limite).
 */
export function falloff(dist: number, full: number, silent: number) {
  if (dist <= full) return 1;
  if (dist >= silent) return 0;
  const t = (dist - full) / (silent - full); // 0..1
  const inv = full / (full + (dist - full) * 1.1); // perde volume com a distância
  const edge = 1 - t * t * (3 - 2 * t); // suaviza a chegada no zero
  return Math.min(1, inv * 0.35 + 0.65) * edge;
}

/** Sala "de verdade" (não o salão aberto grande): quem está dentro conversa como numa call. */
export function isRoomSized(z: { w: number; d: number }) {
  return Math.max(z.w, z.d) <= 12;
}

export function initialsOf(name: string) {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? "").join("") || "?";
}
