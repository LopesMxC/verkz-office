import {
  ConnectionState,
  LocalAudioTrack,
  LocalTrackPublication,
  LocalVideoTrack,
  Participant,
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  createLocalScreenTracks,
} from "livekit-client";
import type { World } from "./world";
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

/** Contexto de áudio compartilhado: toda voz passa por ele para ganhar posição (acústica). */
const audioCtx = new AudioContext({ latencyHint: "interactive" });

/** Cadeia acústica de uma faixa remota: abafamento pela distância e lado esquerdo/direito. */
interface Acoustic {
  pid: string;
  track: RemoteAudioTrack;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
}

export class Media {
  room = new Room({
    webAudioMix: { audioContext: audioCtx },
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
  prefs: MediaPrefs = { noiseSuppression: true, micOnJoin: true, mirror: true, camQuality: "360", range: "medio" };
  private audioHost = document.createElement("div");
  private timer?: number;
  private url = "";
  private token = "";
  private retry?: number;
  private retries = 0;
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
  /** Ganho que estou aplicando a cada pessoa (0..1), útil para a lista. */
  levels = new Map<string, number>();
  private acoustics = new Map<string, Acoustic>();
  private acTimer?: number;

  constructor(private world: World) {
    this.audioHost.style.display = "none";
    document.body.appendChild(this.audioHost);
    const r = this.room;

    r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.dataset.pid = p.identity;
        this.audioHost.appendChild(el);
        this.setupAcoustic(track as RemoteAudioTrack, pub.trackSid, p.identity);
        this.applyVolume(p);
      } else if (pub.source === Track.Source.Camera) {
        const av = this.world.others.get(p.identity);
        if (av) {
          const v = document.createElement("video");
          v.muted = true;
          v.playsInline = true;
          track.attach(v);
          av.bubble.replaceChildren(v);
          av.bubble.classList.remove("hidden", "placeholder");
        }
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
      track.detach().forEach((el) => el.remove());
      this.acoustics.delete(pub.trackSid);
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
      const ids = new Set(speakers.map((s) => s.identity));
      for (const [id, av] of this.world.others) {
        av.talking = ids.has(id);
        av.setSpeaking(ids.has(id) && (this.levels.get(id) ?? 0) > 0);
      }
      if (this.world.me) {
        this.world.me.talking = ids.has(r.localParticipant.identity);
        this.world.me.setSpeaking(this.world.me.talking);
      }
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
    r.on(RoomEvent.Disconnected, () => {
      this.connected = false;
      this.padPub = undefined;
      this.onStateChanged?.();
      this.scheduleRetry();
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
    track.attach(v);
    me.bubble.replaceChildren(v);
    me.bubble.classList.remove("hidden", "placeholder");
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
    if (pub.isSubscribed && av.bubble.querySelector("video")) return;
    const name = (p.name || av.info.name || "?").trim();
    const ini = name.split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? "").join("");
    av.bubble.innerHTML = `<div class="cam-ph"><span>${ini}</span><small>Câmera ligada</small></div>`;
    av.bubble.classList.remove("hidden");
    av.bubble.classList.add("placeholder");
  }

  private clearBubble(id: string) {
    const av = this.world.others.get(id);
    if (av) {
      av.bubble.replaceChildren();
      av.bubble.classList.add("hidden");
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
    this.acTimer = window.setInterval(() => this.updateAcoustics(), 50);
  }

  private async tryConnect(first: boolean) {
    try {
      await this.room.connect(this.url, this.token, { autoSubscribe: false, peerConnectionTimeout: 20000 });
      this.connected = true;
      this.retries = 0;
      await this.room.startAudio().catch(() => {});
      if (this.prefs.speakerId) await this.room.switchActiveDevice("audiooutput", this.prefs.speakerId).catch(() => {});
      if (first ? this.prefs.micOnJoin : this.micOn) await this.setMic(true);
      if (!first && this.camOn) await this.setCam(true);
      this.onStateChanged?.();
    } catch (e: any) {
      this.connected = false;
      if (first) this.onError?.("Sem conexão de áudio/vídeo agora. Tentando de novo em segundo plano...");
      console.warn("livekit:", e);
      this.scheduleRetry();
    }
  }

  private scheduleRetry() {
    if (!this.url || this.retries > 40) return;
    clearTimeout(this.retry);
    const wait = Math.min(15000, 1500 * 2 ** Math.min(this.retries, 4));
    this.retries++;
    this.retry = window.setTimeout(() => {
      if (this.room.state === ConnectionState.Disconnected) this.tryConnect(false);
    }, wait);
  }

  async disconnect() {
    clearInterval(this.timer);
    clearTimeout(this.retry);
    this.url = "";
    await this.stopScreen();
    await this.room.disconnect();
  }

  private needConnection(what: "microfone" | "câmera" | "tela") {
    if (this.room.state === ConnectionState.Connected) return true;
    this.onError?.(`Ainda conectando o áudio/vídeo. Tente o(a) ${what} em alguns segundos.`);
    this.scheduleRetry();
    return false;
  }

  // ------------------------------------------------------------------ microfone, câmera, dispositivos
  async setMic(on: boolean) {
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
    } catch (e: any) {
      this.camOn = false;
      this.onError?.(explainMediaError(e, "câmera"));
    }
    this.onLocalState?.({ cam: this.camOn || null });
    this.onStateChanged?.();
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
    if (this.prefs.speakerId) {
      await this.room.switchActiveDevice("audiooutput", this.prefs.speakerId).catch(() => {});
      this.audioHost.querySelectorAll("audio").forEach((a: any) => a.setSinkId?.(this.prefs.speakerId).catch(() => {}));
    }
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
  /** Volume que eu devo ouvir de outra pessoa, considerando salas privadas. */
  gainFor(id: string): { gain: number; dist: number } {
    const me = this.world.me;
    const av = this.world.others.get(id);
    if (!me || !av) return { gain: 0, dist: Infinity };
    // outro andar: não ouve
    if (!this.world.sameLevel(av)) return { gain: 0, dist: Infinity };
    const { full, silent } = RANGES[this.prefs.range] ?? RANGES.medio;
    // usa a posição-alvo (vinda da rede), que vale mesmo com a janela em segundo plano
    const dist = Math.hypot(av.target.x - me.root.position.x, av.target.z - me.root.position.z);
    const myZone = this.world.currentZone;
    const theirZone = av.info.zone ? this.world.layout.zones.find((z) => z.id === av.info.zone) ?? null : null;
    const myPrivate = myZone?.private ? myZone.id : null;
    const theirPrivate = theirZone?.private ? theirZone.id : null;
    if (myPrivate || theirPrivate) {
      // Dentro de sala privada: todo mundo da sala se ouve com volume cheio, ninguém de fora ouve.
      return { gain: myPrivate && myPrivate === theirPrivate ? 1 : 0, dist };
    }
    if (dist <= full) return { gain: 1, dist };
    if (dist >= silent) return { gain: 0, dist };
    const t = 1 - (dist - full) / (silent - full);
    return { gain: t * t, dist };
  }

  private applyVolume(p: RemoteParticipant) {
    // com a acústica ativa o volume é ajustado continuamente em updateAcoustics
    for (const pub of p.audioTrackPublications.values()) {
      if (pub.trackSid && this.acoustics.has(pub.trackSid)) continue;
      (pub.track as RemoteAudioTrack | undefined)?.setVolume(this.levels.get(p.identity) ?? 0);
    }
  }

  // ------------------------------------------------------------------ acústica
  private setupAcoustic(track: RemoteAudioTrack, sid: string, pid: string) {
    try {
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      const filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 18000;
      filter.Q.value = 0.5;
      const pan = audioCtx.createStereoPanner();
      track.setWebAudioPlugins([filter, pan]);
      this.acoustics.set(sid, { pid, track, filter, pan });
    } catch (e) {
      console.warn("acústica indisponível:", e);
    }
  }

  /**
   * Posição de quem fala em relação a mim, usando a posição suavizada do boneco
   * (quando a janela está visível) para a voz acompanhar o movimento sem degraus.
   */
  private relative(id: string) {
    const me = this.world.me;
    const av = this.world.others.get(id);
    if (!me || !av) return null;
    const src = document.hidden ? av.target : av.root.position;
    const dx = src.x - me.root.position.x;
    const dz = src.z - me.root.position.z;
    return { dx, dz, dist: Math.hypot(dx, dz) };
  }

  /** Volume, abafamento e lado de cada voz, atualizados 20x por segundo. */
  private updateAcoustics() {
    if (!this.acoustics.size) return;
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    const { full, silent } = RANGES[this.prefs.range] ?? RANGES.medio;
    const now = audioCtx.currentTime;
    for (const ac of this.acoustics.values()) {
      const rel = this.relative(ac.pid);
      const allowed = this.levels.get(ac.pid) ?? 0; // regra de sala/alcance (0 = não pode ouvir)
      let gain = 0;
      let cutoff = 18000;
      let pan = 0;
      if (rel && allowed > 0) {
        const privateRoom = allowed === 1 && rel.dist > full && this.inSamePrivate(ac.pid);
        if (privateRoom) {
          gain = 1;
        } else {
          // queda natural: forte perto, cai aos poucos e some no limite do alcance
          const d = Math.max(rel.dist, 0.8);
          const inv = Math.min(1, Math.pow(full / d, 1.25));
          const edge = Math.min(1, Math.max(0, (silent - rel.dist) / (silent * 0.35)));
          gain = inv * edge * edge * (3 - 2 * edge);
          // de longe a voz perde os agudos, como num ambiente de verdade
          const far = Math.min(1, Math.max(0, (rel.dist - full) / (silent - full)));
          cutoff = 18000 * Math.pow(1 - far, 2) + 1800;
        }
        // lado na tela (câmera isométrica): direita da tela = (+x, -z)
        const side = (rel.dx - rel.dz) / Math.SQRT2;
        pan = Math.max(-0.75, Math.min(0.75, side / (rel.dist + 1.2)));
      }
      ac.track.setVolume(gain);
      ac.filter.frequency.setTargetAtTime(cutoff, now, 0.08);
      ac.pan.pan.setTargetAtTime(pan, now, 0.08);
    }
  }

  private inSamePrivate(id: string) {
    const my = this.world.currentZone;
    const av = this.world.others.get(id);
    return !!(my?.private && av?.info.zone === my.id);
  }

  private updateProximity() {
    const { silent } = RANGES[this.prefs.range] ?? RANGES.medio;
    for (const p of this.room.remoteParticipants.values()) {
      const { gain, dist } = this.gainFor(p.identity);
      const before = this.levels.get(p.identity) ?? 0;
      this.levels.set(p.identity, gain);
      if (before === 0 && gain > 0) this.onApproach?.(p.identity);
      this.applyVolume(p);
      const audible = gain > 0;
      const roomOk = this.sameRoomRule(p.identity);
      for (const pub of p.trackPublications.values()) {
        let want: boolean;
        if (pub.kind === Track.Kind.Audio) {
          // pré-assina o áudio um pouco antes de ficar audível (sem corte ao chegar perto)
          want = audible || (roomOk && dist < (pub.isSubscribed ? silent + 3 : silent + 1));
        } else if (pub.source === Track.Source.Camera) {
          // a câmera aparece em bloco para quem está por perto (um pouco além do alcance da voz)
          want = roomOk && dist < silent + 3;
        } else {
          want = audible;
        }
        if (pub.isSubscribed !== want) pub.setSubscribed(want);
        if (pub.source === Track.Source.Camera && !want && !pub.isMuted) this.camPlaceholder(p);
      }
    }
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
