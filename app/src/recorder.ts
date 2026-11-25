import { Participant, RoomEvent, Track } from "livekit-client";
import type { Media } from "./media";

/** Chama a API do servidor (já com a chave do escritório). */
export type Api = (path: string, init?: RequestInit) => Promise<Response>;

/**
 * Grava a reunião do ponto de vista de quem clicou em "Gravar":
 * o áudio que essa pessoa ouve (respeitando salas privadas e distância),
 * a própria voz, a tela compartilhada (se houver) e as câmeras de quem está presente. O arquivo vai para o
 * servidor em partes a cada 10 s, então quase nada se perde se o app fechar.
 */
export class Recorder {
  active = false;
  startedAt = 0;
  onChange?: () => void;
  onError?: (msg: string) => void;

  private id = "";
  private mime = "";
  private rec?: MediaRecorder;
  private ctx?: AudioContext;
  private dest?: MediaStreamAudioDestinationNode;
  private canvas = document.createElement("canvas");
  private sources = new Map<string, { node: MediaStreamAudioSourceNode; gain: GainNode; pid: string | null }>();
  private timers: number[] = [];
  private queue: Promise<void> = Promise.resolve();
  private uploadFailed = false;
  private timeline: { t: number; names: string[] }[] = [];
  private participants = new Set<string>();
  private lastSpeakers = "";
  private title = "";

  constructor(private media: Media, private api: Api, private myName: () => string) {
    this.canvas.width = 1280;
    this.canvas.height = 720;
  }

  async start(title: string) {
    if (this.active) return;
    if (typeof MediaRecorder === "undefined") throw new Error("Este computador não permite gravar pelo app.");
    const r = await this.api("/api/rec/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, by: this.myName() }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `servidor respondeu ${r.status}`);
    this.id = (await r.json()).id;
    this.title = title;
    this.timeline = [];
    this.participants = new Set([this.myName()]);
    this.lastSpeakers = "";
    this.uploadFailed = false;
    this.queue = Promise.resolve();

    this.ctx = new AudioContext();
    this.dest = this.ctx.createMediaStreamDestination();
    // silêncio sempre ligado: sem nenhuma fonte de áudio o navegador para de gerar o arquivo
    const silence = this.ctx.createConstantSource();
    silence.offset.value = 0;
    silence.connect(this.dest);
    silence.start();
    this.syncAudio();

    const video = this.canvas.captureStream(8);
    const stream = new MediaStream([...video.getVideoTracks(), ...this.dest.stream.getAudioTracks()]);
    const types = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4"];
    this.mime = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    this.rec = new MediaRecorder(stream, { mimeType: this.mime || undefined, videoBitsPerSecond: 1_100_000, audioBitsPerSecond: 64_000 });
    this.mime = this.rec.mimeType || this.mime || "video/webm";
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.enqueue(e.data);
    };

    this.startedAt = Date.now();
    this.active = true;
    this.draw();
    this.timers.push(window.setInterval(() => this.syncAudio(), 400), window.setInterval(() => this.draw(), 125));
    this.media.room.on(RoomEvent.ActiveSpeakersChanged, this.onSpeakers);
    this.rec.start(10_000);
    this.onChange?.();
  }

  /** Para, envia o que falta e pede a transcrição. */
  async stop() {
    if (!this.active || !this.rec) return;
    this.active = false;
    const rec = this.rec;
    await new Promise<void>((res) => {
      rec.onstop = () => res();
      rec.stop();
    });
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.media.room.off(RoomEvent.ActiveSpeakersChanged, this.onSpeakers);
    for (const s of this.sources.values()) s.node.disconnect();
    this.sources.clear();
    this.ctx?.close().catch(() => {});
    this.ctx = undefined;
    this.onChange?.();

    await this.queue;
    if (this.uploadFailed) throw new Error("Parte da gravação não chegou ao servidor. Verifique a internet.");
    const r = await this.api(`/api/rec/${this.id}/finish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mime: this.mime,
        duration: (Date.now() - this.startedAt) / 1000,
        timeline: this.timeline,
        participants: [...this.participants],
      }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `servidor respondeu ${r.status}`);
  }

  /** Envia as partes em ordem, com até 3 tentativas cada. */
  private enqueue(blob: Blob) {
    this.queue = this.queue.then(async () => {
      for (let i = 0; i < 3; i++) {
        try {
          const r = await this.api(`/api/rec/${this.id}/chunk`, { method: "POST", body: blob });
          if (r.ok) return;
        } catch {
          /* tenta de novo */
        }
        await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
      }
      this.uploadFailed = true;
      this.onError?.("Uma parte da gravação não foi enviada. Confira a internet.");
    });
  }

  /** Mantém na mixagem exatamente o que esta pessoa ouve agora. */
  private syncAudio() {
    if (!this.ctx || !this.dest) return;
    const room = this.media.room;
    const want = new Map<string, { track: MediaStreamTrack; pid: string | null }>();
    for (const pub of room.localParticipant.trackPublications.values()) {
      const t = pub.track?.mediaStreamTrack;
      if (pub.kind === Track.Kind.Audio && t) want.set(t.id, { track: t, pid: null });
    }
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        const t = pub.track?.mediaStreamTrack;
        if (pub.kind === Track.Kind.Audio && pub.isSubscribed && t) want.set(t.id, { track: t, pid: p.identity });
      }
    }
    for (const [id, s] of this.sources) {
      if (!want.has(id)) {
        s.node.disconnect();
        this.sources.delete(id);
      }
    }
    for (const [id, w] of want) {
      let s = this.sources.get(id);
      if (!s) {
        const node = this.ctx.createMediaStreamSource(new MediaStream([w.track]));
        const gain = this.ctx.createGain();
        node.connect(gain).connect(this.dest);
        s = { node, gain, pid: w.pid };
        this.sources.set(id, s);
      }
      const g = s.pid ? this.media.levels.get(s.pid) ?? 0 : 1;
      s.gain.gain.value = g;
      if (s.pid && g > 0) {
        const name = room.remoteParticipants.get(s.pid)?.name;
        if (name) this.participants.add(name);
      }
    }
  }

  private onSpeakers = (speakers: Participant[]) => {
    if (!this.active) return;
    const names = speakers
      .filter((p) => p.isLocal || (this.media.levels.get(p.identity) ?? 0) > 0)
      .map((p) => (p.isLocal ? this.myName() : p.name || "Alguém"));
    const key = names.join("|");
    if (key === this.lastSpeakers) return;
    this.lastSpeakers = key;
    this.timeline.push({ t: Math.round((Date.now() - this.startedAt) / 1000), names });
  };

  /** Quadro do vídeo: a tela compartilhada, ou um cartão simples com quem está na reunião. */
  private draw() {
    const c = this.canvas.getContext("2d");
    if (!c) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.fillStyle = "#0D0D0D";
    c.fillRect(0, 0, W, H);
    const screens = [...this.media.screens.values()];
    const s = screens.find((x) => !x.local) ?? screens[0];
    const v = s?.el;
    const people = this.media.recCams().map((p) => ({ ...p, name: p.me ? this.myName() : p.name }));
    for (const p of people) this.participants.add(p.name);
    const hasScreen = !!(v && v.videoWidth);
    // tela compartilhada: ocupa a esquerda e as câmeras ficam numa coluna à direita; sem tela, grade só de câmeras
    const tiles = (x0: number, y0: number, w: number, h: number, cols: number, rows: number) => {
      const gap = 10;
      const tw = (w - gap * (cols - 1)) / cols;
      const th = (h - gap * (rows - 1)) / rows;
      people.forEach((p, i) => {
        if (i >= cols * rows) return;
        const x = x0 + (i % cols) * (tw + gap);
        const y = y0 + Math.floor(i / cols) * (th + gap);
        c.fillStyle = "#1d2029";
        c.fillRect(x, y, tw, th);
        const ev = p.el;
        if (ev && ev.videoWidth && ev.readyState >= 2) {
          const k = Math.max(tw / ev.videoWidth, th / ev.videoHeight);
          const sw = tw / k;
          const sh = th / k;
          c.drawImage(ev, (ev.videoWidth - sw) / 2, (ev.videoHeight - sh) / 2, sw, sh, x, y, tw, th);
        } else {
          c.fillStyle = "#2c3140";
          c.beginPath();
          c.arc(x + tw / 2, y + th / 2 - 8, Math.min(tw, th) * 0.22, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#C8F501";
          c.textAlign = "center";
          c.font = `700 ${Math.round(Math.min(tw, th) * 0.2)}px Montserrat, sans-serif`;
          c.fillText(p.name.trim().slice(0, 1).toUpperCase() || "?", x + tw / 2, y + th / 2 + Math.min(tw, th) * 0.04);
        }
        c.fillStyle = "rgba(13,13,13,.7)";
        c.fillRect(x, y + th - 30, Math.min(tw, 14 + p.name.length * 12), 30);
        c.fillStyle = "#FFFFFF";
        c.textAlign = "left";
        c.font = "600 16px Montserrat, sans-serif";
        c.fillText(p.name.slice(0, 24), x + 8, y + th - 9);
      });
    };
    if (hasScreen) {
      const sideW = people.length ? 300 : 0;
      const aw = W - sideW - (sideW ? 10 : 0);
      const k = Math.min(aw / v.videoWidth, H / v.videoHeight);
      const w = v.videoWidth * k;
      const h = v.videoHeight * k;
      c.drawImage(v, (aw - w) / 2, (H - h) / 2, w, h);
      if (people.length) tiles(W - sideW, 0, sideW, H, 1, Math.min(people.length, 5));
    } else if (people.length > 1 || people[0]?.el) {
      const n = Math.min(people.length, 12);
      const cols = Math.ceil(Math.sqrt(n * (W / H) * 0.75));
      tiles(20, 70, W - 40, H - 90, cols, Math.ceil(n / cols));
      c.textAlign = "center";
      c.fillStyle = "#C8F501";
      c.font = "700 24px Montserrat, sans-serif";
      c.fillText(this.title || "Reunião", W / 2, 46);
    } else {
      c.textAlign = "center";
      c.fillStyle = "#C8F501";
      c.font = "700 44px Montserrat, sans-serif";
      c.fillText(this.title || "Reunião", W / 2, H / 2 - 40);
      c.fillStyle = "#B8B8B8";
      c.font = "500 26px Montserrat, sans-serif";
      c.fillText([...this.participants].slice(0, 8).join(" · "), W / 2, H / 2 + 20);
    }
    const secs = Math.floor((Date.now() - this.startedAt) / 1000);
    const mm = String(Math.floor(secs / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    c.textAlign = "left";
    c.fillStyle = "rgba(13,13,13,.7)";
    c.fillRect(20, 20, 150, 40);
    c.fillStyle = "#ff5a65";
    c.beginPath();
    c.arc(42, 40, 8, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#FFFFFF";
    c.font = "600 20px Montserrat, sans-serif";
    c.fillText(`REC ${mm}:${ss}`, 58, 47);
  }
}
