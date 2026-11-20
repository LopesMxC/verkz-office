import {
  LocalTrackPublication,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
} from "livekit-client";
import type { World } from "./world";

/** Distâncias (em metros do escritório). */
const FULL = 2.2; // volume cheio até aqui
const SILENT = 6.5; // silêncio a partir daqui
const SUB_IN = 7.5; // assina as faixas ao entrar neste raio
const SUB_OUT = 9.5; // cancela ao sair deste raio (histerese)

export interface ScreenTile {
  key: string;
  name: string;
  el: HTMLVideoElement;
  local: boolean;
}

export class Media {
  room = new Room({
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
    publishDefaults: { simulcast: true, videoCodec: "vp8" },
  });
  micOn = false;
  camOn = false;
  screenOn = false;
  connected = false;
  private audioHost = document.createElement("div");
  private timer?: number;
  screens = new Map<string, ScreenTile>();
  onScreensChanged?: () => void;
  onStateChanged?: () => void;
  onError?: (msg: string) => void;
  /** Ganho que estou aplicando a cada pessoa (0..1), útil para a lista. */
  levels = new Map<string, number>();

  constructor(private world: World) {
    this.audioHost.style.display = "none";
    document.body.appendChild(this.audioHost);
    const r = this.room;

    r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.dataset.pid = p.identity;
        this.audioHost.appendChild(el);
        this.applyVolume(p);
      } else if (pub.source === Track.Source.Camera) {
        const av = this.world.others.get(p.identity);
        if (av) {
          const v = document.createElement("video");
          v.muted = true;
          v.playsInline = true;
          track.attach(v);
          av.bubble.replaceChildren(v);
          av.bubble.classList.remove("hidden");
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
      if (pub.source === Track.Source.Camera) this.clearBubble(p.identity);
      if (pub.source === Track.Source.ScreenShare && this.screens.delete(pub.trackSid)) this.onScreensChanged?.();
    });

    r.on(RoomEvent.TrackUnpublished, (pub: RemoteTrackPublication, p: RemoteParticipant) => {
      if (pub.source === Track.Source.Camera) this.clearBubble(p.identity);
      if (this.screens.delete(pub.trackSid)) this.onScreensChanged?.();
    });

    r.on(RoomEvent.TrackMuted, (pub, p) => this.markMuted(p, pub.source));
    r.on(RoomEvent.TrackUnmuted, (pub, p) => this.markMuted(p, pub.source));

    r.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const ids = new Set(speakers.map((s) => s.identity));
      for (const [id, av] of this.world.others) av.setSpeaking(ids.has(id) && (this.levels.get(id) ?? 0) > 0);
      this.world.me?.setSpeaking(ids.has(r.localParticipant.identity));
    });

    r.on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
      if (pub.source === Track.Source.Camera && pub.track) {
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.classList.add("mirror");
        pub.track.attach(v);
        this.world.me.bubble.replaceChildren(v);
        this.world.me.bubble.classList.remove("hidden");
      }
      if (pub.source === Track.Source.ScreenShare && pub.track) {
        const v = document.createElement("video");
        v.muted = true;
        pub.track.attach(v);
        this.screens.set("local", { key: "local", name: "Sua tela", el: v, local: true });
        this.onScreensChanged?.();
      }
    });

    r.on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
      if (pub.source === Track.Source.Camera) {
        this.world.me.bubble.replaceChildren();
        this.world.me.bubble.classList.add("hidden");
      }
      if (pub.source === Track.Source.ScreenShare) {
        this.screenOn = false;
        this.screens.delete("local");
        this.onScreensChanged?.();
        this.onStateChanged?.();
      }
    });

    r.on(RoomEvent.Disconnected, () => {
      this.connected = false;
      this.onStateChanged?.();
    });
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
    av?.label.classList.toggle("muted", !p.isMicrophoneEnabled);
  }

  async connect(url: string, token: string) {
    if (this.connected) await this.room.disconnect();
    try {
      await this.room.connect(url, token, { autoSubscribe: false });
      this.connected = true;
      await this.room.startAudio();
      await this.setMic(true);
    } catch (e: any) {
      this.onError?.("Não consegui conectar ao áudio/vídeo: " + (e?.message ?? e));
    }
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.updateProximity(), 200);
    this.onStateChanged?.();
  }

  async disconnect() {
    clearInterval(this.timer);
    await this.room.disconnect();
  }

  async setMic(on: boolean) {
    try {
      await this.room.localParticipant.setMicrophoneEnabled(on);
      this.micOn = on;
      this.world.me?.label.classList.toggle("muted", !on);
    } catch (e: any) {
      this.onError?.("Microfone indisponível: " + (e?.message ?? e));
    }
    this.onStateChanged?.();
  }

  async setCam(on: boolean) {
    try {
      await this.room.localParticipant.setCameraEnabled(on);
      this.camOn = on;
    } catch (e: any) {
      this.onError?.("Câmera indisponível: " + (e?.message ?? e));
    }
    this.onStateChanged?.();
  }

  async setScreen(on: boolean) {
    try {
      await this.room.localParticipant.setScreenShareEnabled(on, { audio: true, selfBrowserSurface: "exclude" });
      this.screenOn = on;
    } catch (e: any) {
      this.screenOn = false;
      if (e?.name !== "NotAllowedError") this.onError?.("Não consegui compartilhar a tela: " + (e?.message ?? e));
    }
    this.onStateChanged?.();
  }

  /** Volume que eu devo ouvir de outra pessoa, considerando salas privadas. */
  gainFor(id: string): { gain: number; dist: number } {
    const me = this.world.me;
    const av = this.world.others.get(id);
    if (!me || !av) return { gain: 0, dist: Infinity };
    const dist = Math.hypot(av.root.position.x - me.root.position.x, av.root.position.z - me.root.position.z);
    const myZone = this.world.currentZone;
    const theirZone = av.info.zone ? this.world.layout.zones.find((z) => z.id === av.info.zone) ?? null : null;
    const myPrivate = myZone?.private ? myZone.id : null;
    const theirPrivate = theirZone?.private ? theirZone.id : null;
    if (myPrivate || theirPrivate) {
      // Dentro de sala privada: todo mundo da sala se ouve com volume cheio, ninguém de fora ouve.
      return { gain: myPrivate && myPrivate === theirPrivate ? 1 : 0, dist };
    }
    if (dist <= FULL) return { gain: 1, dist };
    if (dist >= SILENT) return { gain: 0, dist };
    const t = 1 - (dist - FULL) / (SILENT - FULL);
    return { gain: t * t, dist };
  }

  private applyVolume(p: RemoteParticipant) {
    const g = this.levels.get(p.identity) ?? 0;
    p.setVolume(g, Track.Source.Microphone);
    p.setVolume(g, Track.Source.ScreenShareAudio);
  }

  private updateProximity() {
    for (const p of this.room.remoteParticipants.values()) {
      const { gain, dist } = this.gainFor(p.identity);
      this.levels.set(p.identity, gain);
      this.applyVolume(p);
      const audible = gain > 0;
      for (const pub of p.trackPublications.values()) {
        let want: boolean;
        if (pub.source === Track.Source.Microphone) {
          want = audible || (pub.isSubscribed ? dist < SUB_OUT && this.sameRoomRule(p.identity) : dist < SUB_IN && this.sameRoomRule(p.identity));
        } else {
          want = audible;
        }
        if (pub.isSubscribed !== want) pub.setSubscribed(want);
      }
    }
  }

  /** Pré-assina o microfone só quando a regra de sala permitiria ouvir. */
  private sameRoomRule(id: string) {
    const av = this.world.others.get(id);
    const my = this.world.currentZone;
    const theirs = av?.info.zone ? this.world.layout.zones.find((z) => z.id === av.info.zone) : undefined;
    if (my?.private || theirs?.private) return my?.id === theirs?.id;
    return true;
  }
}
