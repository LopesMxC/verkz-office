/**
 * Sons do escritório, todos sintetizados (sem arquivos): passos, corrida, aproximação,
 * notificações e os efeitos do soundpad. O soundpad também sai por `soundpadStream`,
 * que é publicado como faixa de áudio para quem está perto ouvir.
 */

export interface SoundPrefs {
  master: number; // 0..1
  steps: boolean;
  approach: boolean;
  notify: boolean;
  soundpad: number; // volume do soundpad para mim, 0..1
  radio: number; // volume do rádio do escritório (YouTube), 0..1
}

export const soundPrefs: SoundPrefs = { master: 0.8, steps: true, approach: true, notify: true, soundpad: 0.8, radio: 0.6 };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let padOut: MediaStreamAudioDestinationNode | null = null;
let padLocal: GainNode | null = null;

export function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  master!.gain.value = soundPrefs.master;
  return { ctx, out: master! };
}

/** Destino do soundpad: o que tocar aqui vai para a faixa publicada. */
export function soundpadStream(): MediaStream {
  const { ctx } = audio();
  if (!padOut) {
    padOut = ctx.createMediaStreamDestination();
    padLocal = ctx.createGain();
    padLocal.connect(master!);
  }
  return padOut.stream;
}

const noiseCache = new Map<number, AudioBuffer>();
function noiseBuffer(c: AudioContext, secs: number) {
  const key = Math.round(secs * 1000);
  const hit = noiseCache.get(key);
  if (hit) return hit;
  const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * secs)), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  if (noiseCache.size < 40) noiseCache.set(key, b);
  return b;
}

type Out = AudioNode;

function tone(out: Out, t: number, freq: number, dur: number, type: OscillatorType = "sine", vol = 0.2, slideTo?: number) {
  const c = out.context as AudioContext;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(out: Out, t: number, dur: number, vol = 0.2, filter: BiquadFilterType = "bandpass", freq = 1500, q = 1) {
  const c = out.context as AudioContext;
  const s = c.createBufferSource();
  s.buffer = noiseBuffer(c, dur);
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out);
  s.start(t);
}

// ------------------------------------------------------------------ passos e avisos
let stepAlt = false;
/** Um passo. `vol` já considera a distância (0..1). */
export function footstep(run: boolean, vol = 1) {
  if (!soundPrefs.steps || vol <= 0.02) return;
  const { ctx, out } = audio();
  const t = ctx.currentTime;
  stepAlt = !stepAlt;
  const base = run ? 0.16 : 0.1;
  noise(out, t, run ? 0.07 : 0.06, base * vol, "lowpass", stepAlt ? 900 : 750, 0.7);
  tone(out, t, stepAlt ? 95 : 85, 0.05, "sine", base * 0.8 * vol);
}

/** Clique de confirmação ao ligar/desligar microfone, câmera ou tela (sobe = ligou, desce = desligou). */
export function toggleSound(on: boolean) {
  if (!soundPrefs.notify) return;
  const { ctx, out } = audio();
  const t = ctx.currentTime;
  if (on) {
    tone(out, t, 620, 0.07, "triangle", 0.09);
    tone(out, t + 0.06, 930, 0.1, "triangle", 0.09);
  } else {
    tone(out, t, 700, 0.07, "triangle", 0.08);
    tone(out, t + 0.06, 440, 0.11, "triangle", 0.08);
  }
}

// ------------------------------------------------------------------ portas (sons gravados, CC0)
/** Gravações reais de porta (public/sounds, Kenney RPG Audio, CC0). Duas de cada para não ficar repetitivo. */
const DOOR_FILES = {
  open: ["sounds/porta-abrir-1.mp3", "sounds/porta-abrir-2.mp3"],
  close: ["sounds/porta-fechar-1.mp3", "sounds/porta-fechar-2.mp3"],
};
const sampleCache = new Map<string, Promise<AudioBuffer | null>>();
function sample(url: string): Promise<AudioBuffer | null> {
  let p = sampleCache.get(url);
  if (!p) {
    p = fetch("./" + url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b) => audio().ctx.decodeAudioData(b))
      .catch((e) => {
        console.warn("som de porta:", url, e);
        sampleCache.delete(url); // tenta de novo na próxima
        return null;
      });
    sampleCache.set(url, p);
  }
  return p;
}
/** Baixa os sons de porta antes da primeira vez (chamado ao entrar no escritório). */
export function preloadDoorSounds() {
  [...DOOR_FILES.open, ...DOOR_FILES.close].forEach((u) => sample(u));
}

/** Porta abrindo (`open`) ou fechando. `vol` já considera a distância (0..1). */
export async function doorSound(kind: "open" | "close" = "open", vol = 1) {
  if (vol <= 0.02) return;
  const list = DOOR_FILES[kind];
  const buf = await sample(list[Math.floor(Math.random() * list.length)]);
  const { ctx, out } = audio();
  if (!buf) {
    // sem o arquivo (offline): trinco sintetizado, bem curto
    noise(out, ctx.currentTime, 0.05, 0.09 * vol, "bandpass", 2600, 3);
    return;
  }
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.playbackRate.value = 0.95 + Math.random() * 0.1; // leve variação natural
  const g = ctx.createGain();
  g.gain.value = (kind === "open" ? 0.5 : 0.42) * vol;
  s.connect(g).connect(out);
  s.start();
}

/** Alguém entrou na sala onde estou: "ding-dong" de porta. */
export function doorChime() {
  if (!soundPrefs.notify) return;
  const { ctx, out } = audio();
  const t = ctx.currentTime;
  tone(out, t, 784, 0.5, "sine", 0.09);
  tone(out, t + 0.32, 622, 0.7, "sine", 0.08);
}

export function approachChime() {
  if (!soundPrefs.approach) return;
  const { ctx, out } = audio();
  const t = ctx.currentTime;
  tone(out, t, 660, 0.18, "sine", 0.07);
  tone(out, t + 0.09, 990, 0.25, "sine", 0.06);
}

export function notify(kind: "msg" | "wave" | "join" | "call" | "emote" | "error") {
  if (!soundPrefs.notify) return;
  const { ctx, out } = audio();
  const t = ctx.currentTime;
  const seq: Record<string, number[]> = { msg: [880, 1175], wave: [660, 880, 990], join: [523, 784], call: [784, 988, 1175, 988, 1175], emote: [1046], error: [330, 262] };
  seq[kind].forEach((f, i) => tone(out, t + i * 0.09, f, 0.14, kind === "error" ? "triangle" : "sine", 0.08));
}

export function kitchenSound(kind: "pour" | "beep" | "open") {
  const { ctx, out } = audio();
  const t = ctx.currentTime;
  if (kind === "pour") noise(out, t, 1.6, 0.06, "bandpass", 2400, 2);
  if (kind === "beep") [0, 0.25, 0.5].forEach((d) => tone(out, t + d, 1760, 0.15, "square", 0.04));
  if (kind === "open") noise(out, t, 0.25, 0.08, "lowpass", 500, 1);
}

// ------------------------------------------------------------------ soundpad
export interface PadSound {
  id: string;
  name: string;
  /** ícone de traço (icons.ts) */
  ic: string;
  /** Sons do usuário: áudio guardado no aparelho. */
  custom?: boolean;
}

export const PAD_SOUNDS: PadSound[] = [
  { id: "aplausos", name: "Aplausos", ic: "sparkles" },
  { id: "buzina", name: "Buzina", ic: "megaphone" },
  { id: "badumtss", name: "Ba-dum-tss", ic: "drum" },
  { id: "tada", name: "Tcharam", ic: "party-popper" },
  { id: "vitoria", name: "Vitória", ic: "trophy" },
  { id: "errou", name: "Errou", ic: "frown" },
  { id: "suspense", name: "Suspense", ic: "drum" },
  { id: "sino", name: "Sino", ic: "bell" },
  { id: "moeda", name: "Venda!", ic: "coins" },
  { id: "grilo", name: "Grilos", ic: "bug" },
  { id: "sirene", name: "Sirene", ic: "siren" },
  { id: "pop", name: "Pop", ic: "circle-dot" },
];

function synth(id: string, out: Out) {
  const c = out.context as AudioContext;
  const t = c.currentTime + 0.02;
  switch (id) {
    case "aplausos":
      for (let i = 0; i < 70; i++) noise(out, t + Math.random() * 2.2, 0.05, 0.12 + Math.random() * 0.1, "bandpass", 1200 + Math.random() * 1800, 1.2);
      break;
    case "buzina":
      for (let r = 0; r < 3; r++) for (const f of [466, 587, 698]) tone(out, t + r * 0.32, f, r === 2 ? 0.7 : 0.25, "sawtooth", 0.06);
      break;
    case "badumtss":
      tone(out, t, 160, 0.12, "sine", 0.4, 60);
      tone(out, t + 0.18, 160, 0.12, "sine", 0.4, 60);
      noise(out, t + 0.36, 0.9, 0.25, "highpass", 6000, 0.7);
      break;
    case "tada":
      [523, 659, 784, 1046].forEach((f, i) => tone(out, t + i * 0.08, f, i === 3 ? 0.9 : 0.25, "triangle", 0.12));
      break;
    case "vitoria":
      [[523, 0], [523, 0.15], [523, 0.3], [698, 0.45], [880, 0.75], [784, 0.95], [1046, 1.15]].forEach(([f, d]) => tone(out, t + d, f, d === 1.15 ? 0.8 : 0.18, "square", 0.06));
      break;
    case "errou":
      [392, 370, 349, 311].forEach((f, i) => tone(out, t + i * 0.42, f, i === 3 ? 1.1 : 0.38, "sawtooth", 0.07, i === 3 ? 280 : undefined));
      break;
    case "suspense":
      for (let i = 0; i < 28; i++) tone(out, t + i * 0.055, 140, 0.05, "sine", 0.15 + i * 0.008, 70);
      tone(out, t + 1.6, 120, 0.3, "sine", 0.5, 50);
      noise(out, t + 1.6, 1.0, 0.25, "highpass", 5000, 0.7);
      break;
    case "sino":
      tone(out, t, 1318, 1.6, "sine", 0.18);
      tone(out, t, 2637, 1.2, "sine", 0.05);
      break;
    case "moeda":
      tone(out, t, 988, 0.08, "square", 0.08);
      tone(out, t + 0.08, 1319, 0.5, "square", 0.08);
      break;
    case "grilo":
      for (let i = 0; i < 6; i++) for (let k = 0; k < 3; k++) tone(out, t + i * 0.45 + k * 0.05, 4200, 0.035, "sine", 0.05);
      break;
    case "sirene":
      for (let i = 0; i < 3; i++) tone(out, t + i * 0.6, 700, 0.3, "sawtooth", 0.06, 1100), tone(out, t + i * 0.6 + 0.3, 1100, 0.3, "sawtooth", 0.06, 700);
      break;
    case "pop":
      tone(out, t, 400, 0.08, "sine", 0.35, 1200);
      break;
  }
}

// ------------------------------------------------------------------ soundpad compartilhado
/** Som que alguém do escritório subiu (fica no servidor, todo mundo vê). */
export interface SharedSound {
  id: string;
  name: string;
  by: string;
  at: number;
  dur: number;
}
/** Lista do escritório, tempo máximo (s) e onde buscar o áudio. */
export const sharedPad = { list: [] as SharedSound[], max: 10, base: "", key: "" };

/**
 * Prepara o som para subir: decodifica, corta no tempo máximo (com fade de 0,15 s no fim),
 * mistura em mono e reamostra em 22,05 kHz. Sai um WAV pequeno (10 s ≈ 440 KB).
 */
export async function prepareClip(data: ArrayBuffer, maxSec: number): Promise<{ wav: Blob; dur: number; cut: boolean }> {
  const { ctx } = audio();
  let src: AudioBuffer;
  try {
    src = await ctx.decodeAudioData(data.slice(0));
  } catch {
    throw new Error("Não consegui ler esse áudio (use mp3, wav, ogg ou m4a)");
  }
  // pula o silêncio do começo (muito áudio baixado vem com meio segundo mudo)
  const ch0 = src.getChannelData(0);
  let start = 0;
  while (start < ch0.length && Math.abs(ch0[start]) < 0.01) start++;
  const startSec = start >= ch0.length ? 0 : Math.max(0, start / src.sampleRate - 0.02);
  const avail = src.duration - startSec;
  const dur = Math.min(avail, maxSec);
  const cut = avail > maxSec + 0.05;
  const rate = 22050;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(dur * rate)), rate);
  const node = off.createBufferSource();
  node.buffer = src;
  const g = off.createGain();
  if (cut) {
    g.gain.setValueAtTime(1, Math.max(0, dur - 0.15));
    g.gain.linearRampToValueAtTime(0, dur);
  }
  node.connect(g).connect(off.destination);
  node.start(0, startSec, dur);
  const out = await off.startRendering();
  return { wav: toWav(out.getChannelData(0), rate), dur: out.duration, cut };
}

function toWav(pcm: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const w = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return new Blob([buf], { type: "audio/wav" });
}

async function sharedBuffer(id: string) {
  const k = "s:" + id;
  if (decoded.has(k)) return decoded.get(k)!;
  const r = await fetch(`${sharedPad.base}/api/sounds/${encodeURIComponent(id)}?key=${encodeURIComponent(sharedPad.key)}`);
  if (!r.ok) throw new Error("Esse som não está mais no escritório");
  const buf = await audio().ctx.decodeAudioData(await r.arrayBuffer());
  decoded.set(k, buf);
  return buf;
}

/** Áudio de um som que só existia neste aparelho (para subir para o escritório). */
export async function localRaw(id: string): Promise<{ name: string; data: ArrayBuffer } | null> {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const r = db.transaction("sons").objectStore("sons").get(id);
      r.onsuccess = () => res(r.result ?? null);
      r.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

// sons antigos do usuário (guardados só no aparelho; sobem para o escritório na primeira vez)
const DB = "verkz-office-sounds";
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("sons");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function listCustom(): Promise<PadSound[]> {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const out: PadSound[] = [];
      const cur = db.transaction("sons").objectStore("sons").openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return res(out);
        out.push({ id: String(c.key), name: c.value.name, ic: "music", custom: true });
        c.continue();
      };
      cur.onerror = () => res(out);
    });
  } catch {
    return [];
  }
}
export async function addCustom(file: File) {
  if (file.size > 3_000_000) throw new Error("O som precisa ter no máximo 3 MB");
  const db = await idb();
  const id = "custom-" + Date.now().toString(36);
  const data = await file.arrayBuffer();
  await new Promise((res, rej) => {
    const tx = db.transaction("sons", "readwrite");
    tx.objectStore("sons").put({ name: file.name.replace(/\.[^.]+$/, "").slice(0, 24), data }, id);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}
export async function removeCustom(id: string) {
  const db = await idb();
  db.transaction("sons", "readwrite").objectStore("sons").delete(id);
}
const decoded = new Map<string, AudioBuffer>();
async function customBuffer(id: string) {
  if (decoded.has(id)) return decoded.get(id)!;
  const db = await idb();
  const v: any = await new Promise((res) => {
    const r = db.transaction("sons").objectStore("sons").get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  });
  if (!v) throw new Error("Som não encontrado");
  const buf = await audio().ctx.decodeAudioData(v.data.slice(0));
  decoded.set(id, buf);
  return buf;
}

/** Toca um som do soundpad para mim e na faixa publicada (quem está perto ouve). */
export async function playPad(id: string) {
  soundpadStream();
  const { ctx } = audio();
  padLocal!.gain.value = soundPrefs.soundpad;
  // uma entrada só: vai para a faixa publicada e, com volume próprio, para os meus fones
  const bus = ctx.createGain();
  bus.connect(padOut!);
  bus.connect(padLocal!);
  if (id.startsWith("s:") || id.startsWith("custom-")) {
    const s = ctx.createBufferSource();
    s.buffer = id.startsWith("s:") ? await sharedBuffer(id.slice(2)) : await customBuffer(id);
    s.connect(bus);
    // nunca passa do tempo máximo do escritório
    const len = Math.min(s.buffer.duration, sharedPad.max);
    s.start();
    s.stop(ctx.currentTime + len);
    return len;
  }
  synth(id, bus);
  return 2;
}

// ------------------------------------------------------------------ elevador
/** "Plim" do elevador chegando. */
export function elevatorDing() {
  const { ctx, out } = audio();
  const t = ctx.currentTime;
  tone(out, t, 1318, 0.9, "sine", 0.12);
  tone(out, t, 2637, 0.6, "sine", 0.03);
}

/**
 * Musiquinha de elevador (bossa tranquila, composta aqui): piano elétrico suave, baixo e um shaker.
 * Toca em loop até `stop()`, que abaixa o volume devagar.
 */
export function elevatorMusic(): { stop: () => void } {
  const { ctx, out } = audio();
  const bus = ctx.createGain();
  bus.gain.value = 0.0001;
  bus.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.6);
  bus.connect(out);
  const beat = 60 / 112; // 112 bpm
  // Cmaj7 - Am7 - Dm7 - G7 (2 tempos cada), com melodia simples por cima
  const chords = [
    [261.6, 329.6, 392.0, 493.9],
    [220.0, 261.6, 329.6, 392.0],
    [293.7, 349.2, 440.0, 523.3],
    [196.0, 246.9, 293.7, 349.2],
  ];
  const bass = [130.8, 110.0, 146.8, 98.0];
  const melody = [659.3, 587.3, 523.3, 493.9, 523.3, 587.3, 659.3, 783.99, 698.5, 659.3, 587.3, 523.3, 493.9, 523.3, 587.3, 0];
  const ep = (t: number, f: number, dur: number, vol: number) => {
    // "piano elétrico": seno + harmônico suave com ataque rápido
    tone(bus, t, f, dur, "sine", vol);
    tone(bus, t, f * 2, dur * 0.5, "sine", vol * 0.18);
  };
  let next = ctx.currentTime + 0.05;
  let bar = 0;
  let stopped = false;
  const schedule = () => {
    if (stopped) return;
    while (next < ctx.currentTime + 1.2) {
      const i = bar % 4;
      const t0 = next;
      // acordes em ritmo de bossa (antecipado)
      for (const [off, len] of [[0, 0.9], [1.5, 0.4], [2.5, 0.9]] as const) chords[i].forEach((f) => ep(t0 + off * beat, f, len * beat * 1.4, 0.022));
      // baixo: tônica e quinta
      tone(bus, t0, bass[i], beat * 1.3, "triangle", 0.07);
      tone(bus, t0 + 2 * beat, bass[i] * 1.5, beat * 1.2, "triangle", 0.055);
      // melodia (2 notas por compasso)
      for (let k = 0; k < 4; k++) {
        const f = melody[(bar * 4 + k) % melody.length];
        if (f) ep(t0 + k * beat, f, beat * 0.9, 0.03);
      }
      // shaker
      for (let k = 0; k < 8; k++) noise(bus, t0 + k * beat * 0.5, 0.04, k % 2 ? 0.012 : 0.02, "highpass", 7000, 0.8);
      next += 4 * beat;
      bar++;
    }
  };
  schedule();
  const iv = setInterval(schedule, 300);
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(iv);
      const t = ctx.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t);
      bus.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      setTimeout(() => bus.disconnect(), 1500);
    },
  };
}
