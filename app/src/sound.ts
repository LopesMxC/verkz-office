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
}

export const soundPrefs: SoundPrefs = { master: 0.8, steps: true, approach: true, notify: true, soundpad: 0.8 };

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

/** Porta abrindo: rangido curto de madeira + trinco. */
export function doorSound() {
  const { ctx, out } = audio();
  const t = ctx.currentTime;
  noise(out, t, 0.05, 0.09, "bandpass", 2600, 3); // trinco
  tone(out, t + 0.05, 180, 0.35, "sawtooth", 0.025, 240); // rangido
  noise(out, t + 0.05, 0.4, 0.04, "lowpass", 600, 1);
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
  emoji: string;
  /** Sons do usuário: áudio guardado no aparelho. */
  custom?: boolean;
}

export const PAD_SOUNDS: PadSound[] = [
  { id: "aplausos", name: "Aplausos", emoji: "👏" },
  { id: "buzina", name: "Buzina", emoji: "📯" },
  { id: "badumtss", name: "Ba-dum-tss", emoji: "🥁" },
  { id: "tada", name: "Tcharam", emoji: "🎉" },
  { id: "vitoria", name: "Vitória", emoji: "🏆" },
  { id: "errou", name: "Errou", emoji: "🎺" },
  { id: "suspense", name: "Suspense", emoji: "🥁" },
  { id: "sino", name: "Sino", emoji: "🔔" },
  { id: "moeda", name: "Venda!", emoji: "💰" },
  { id: "grilo", name: "Grilos", emoji: "🦗" },
  { id: "sirene", name: "Sirene", emoji: "🚨" },
  { id: "pop", name: "Pop", emoji: "🫧" },
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

// sons do usuário (guardados no IndexedDB)
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
        out.push({ id: String(c.key), name: c.value.name, emoji: "🎵", custom: true });
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
  if (id.startsWith("custom-")) {
    const s = ctx.createBufferSource();
    s.buffer = await customBuffer(id);
    s.connect(bus);
    s.start();
    return s.buffer.duration;
  }
  synth(id, bus);
  return 2;
}
