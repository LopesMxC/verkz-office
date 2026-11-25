import * as THREE from "three";
import { toon } from "./toon";

// =====================================================================
// Clima, estações e datas especiais do lado de fora do escritório.
// Configuração global fica em layout.env (salva para todos pelo gestor).
// =====================================================================

export type Weather = "sol" | "nublado" | "chuva" | "tempestade" | "neve";
export type Season = "primavera" | "verao" | "outono" | "inverno";

export interface EnvConfig {
  /** "auto"/vazio = rotativo (muda sozinho, igual para todos); "real" = clima da cidade. */
  weather?: "auto" | "real" | Weather;
  season?: "auto" | Season;
  holiday?: "auto" | "nenhum" | string;
  /** Liga o ciclo de dia e noite pelo horário real. */
  daynight?: boolean;
  /** Cidade para o clima automático. */
  lat?: number;
  lon?: number;
  city?: string;
}

export const WEATHERS: [Weather, string][] = [
  ["sol", "Sol"],
  ["nublado", "Nublado"],
  ["chuva", "Chuva"],
  ["tempestade", "Tempestade"],
  ["neve", "Neve"],
];
export const SEASONS: [Season, string][] = [
  ["primavera", "Primavera"],
  ["verao", "Verão"],
  ["outono", "Outono"],
  ["inverno", "Inverno"],
];

/** Estação pelo calendário do hemisfério sul. */
export function seasonByDate(d = new Date()): Season {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const md = m * 100 + day;
  if (md >= 922 && md < 1221) return "primavera";
  if (md >= 1221 || md < 320) return "verao";
  if (md >= 320 && md < 621) return "outono";
  return "inverno";
}

/** Clima rotativo: troca a cada 25 min, sorteado pelo relógio (todo mundo vê o mesmo).
 *  Mais sol e nublado do que chuva; nunca chove dois blocos seguidos; neve só no inverno e rara. */
export function rotatingWeather(now = Date.now(), season: Season = seasonByDate()): Weather {
  const BLOCK = 25 * 60 * 1000;
  const pick = (b: number): Weather => {
    let h = (b * 2654435761) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    const r = (h % 1000) / 1000;
    if (season === "inverno" && r > 0.95) return "neve";
    if (r < 0.45) return "sol";
    if (r < 0.75) return "nublado";
    if (r < 0.92) return "chuva";
    return "tempestade";
  };
  const b = Math.floor(now / BLOCK);
  const w = pick(b);
  const wet = (x: Weather) => x === "chuva" || x === "tempestade";
  if (wet(w) && wet(pick(b - 1))) return "nublado";
  return w;
}

/** Converte o código WMO do Open-Meteo no nosso clima. */
export function weatherFromCode(code: number): Weather {
  if (code >= 95) return "tempestade";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "neve";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "chuva";
  if (code >= 2) return "nublado";
  return "sol";
}

// ------------------------------------------------------------------ datas especiais
export interface Holiday {
  id: string;
  name: string;
  /** Acessório de cabeça/rosto aplicado em quem deixou "skin do evento" ligada. */
  head?: string;
  face?: string;
  /** Enfeites colocados perto da entrada. */
  decor: string[];
  confetti?: boolean;
}

export const HOLIDAYS: Record<string, Holiday> = {
  natal: { id: "natal", name: "Natal", head: "papai_noel", decor: ["xmas_tree", "gift", "gift", "gift", "xmas_lights"] },
  ano_novo: { id: "ano_novo", name: "Ano Novo", head: "festa", decor: ["balloons", "balloons"], confetti: true },
  carnaval: { id: "carnaval", name: "Carnaval", face: "mascara", decor: ["balloons", "flags"], confetti: true },
  pascoa: { id: "pascoa", name: "Páscoa", head: "coelho", decor: ["egg", "egg", "egg", "egg"] },
  festa_junina: { id: "festa_junina", name: "Festa Junina", head: "palha", decor: ["flags", "bonfire"] },
  halloween: { id: "halloween", name: "Halloween", head: "bruxa", decor: ["pumpkin", "pumpkin", "pumpkin"] },
  aniversario_verkz: { id: "aniversario_verkz", name: "Aniversário da VERKZ", head: "festa", decor: ["balloons", "balloons", "balloons"], confetti: true },
  black_friday: { id: "black_friday", name: "Black Friday", decor: ["neon_sale"] },
};

function easter(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

export function holidayByDate(d = new Date()): Holiday | null {
  const y = d.getFullYear();
  const day0 = new Date(y, d.getMonth(), d.getDate()).getTime();
  const between = (a: Date, b: Date) => day0 >= a.getTime() && day0 <= b.getTime();
  const DAY = 86400000;
  const m = d.getMonth() + 1;
  const dd = d.getDate();
  if (m === 4 && (dd === 22 || dd === 21)) return HOLIDAYS.aniversario_verkz;
  if ((m === 12 && dd >= 27) || (m === 1 && dd <= 2)) return HOLIDAYS.ano_novo;
  if (m === 12) return HOLIDAYS.natal;
  const e = easter(y);
  const carn = new Date(e.getTime() - 47 * DAY);
  if (between(new Date(carn.getTime() - 3 * DAY), new Date(carn.getTime() + 1 * DAY))) return HOLIDAYS.carnaval;
  if (between(new Date(e.getTime() - 3 * DAY), new Date(e.getTime() + 1 * DAY))) return HOLIDAYS.pascoa;
  if (m === 6) return HOLIDAYS.festa_junina;
  if (m === 10 && dd >= 25) return HOLIDAYS.halloween;
  // Black Friday: última sexta de novembro, a semana inteira
  if (m === 11) {
    const last = new Date(y, 11, 0);
    const bf = new Date(y, 10, last.getDate() - ((last.getDay() + 2) % 7));
    if (between(new Date(bf.getTime() - 6 * DAY), bf)) return HOLIDAYS.black_friday;
  }
  return null;
}

export function resolveHoliday(cfg: EnvConfig): Holiday | null {
  const h = cfg.holiday ?? "auto";
  if (h === "nenhum") return null;
  if (h === "auto") return holidayByDate();
  return HOLIDAYS[h] ?? null;
}

// ------------------------------------------------------------------ efeitos na cena
const SEASON_TINT: Record<Season, THREE.Color> = {
  primavera: new THREE.Color(1.0, 1.0, 1.0),
  verao: new THREE.Color(1.05, 1.05, 0.9),
  outono: new THREE.Color(1.6, 0.85, 0.35),
  inverno: new THREE.Color(0.85, 0.95, 0.95),
};

interface Particles {
  mesh: THREE.InstancedMesh;
  pos: Float32Array;
  vel: Float32Array;
  spin: Float32Array;
  kind: string;
}

export class Environment {
  weather: Weather = "sol";
  season: Season = seasonByDate();
  holiday: Holiday | null = null;
  night = 0; // 0 dia, 1 noite
  private particles: Particles | null = null;
  private confetti: Particles | null = null;
  private flash = 0;
  private grassBase?: THREE.Color;
  private hemiBase = 0;
  private sunBase = 0;
  enabled = true;

  constructor(
    private scene: THREE.Scene,
    private hemi: THREE.HemisphereLight,
    private sun: THREE.DirectionalLight,
    private bounds: () => { w: number; d: number },
    private grass: () => THREE.Mesh | undefined,
    private foliage: () => THREE.Material[],
  ) {
    this.hemiBase = hemi.intensity;
    this.sunBase = sun.intensity;
  }

  set(weather: Weather, season: Season, holiday: Holiday | null, night: number) {
    const changed = weather !== this.weather || !this.particles;
    this.weather = weather;
    this.season = season;
    this.holiday = holiday;
    this.night = night;
    this.applySeason();
    if (changed) this.buildParticles();
    this.buildConfetti();
    this.applyLight();
  }

  private applySeason() {
    const tint = SEASON_TINT[this.season];
    const snowy = this.weather === "neve";
    for (const m of this.foliage()) {
      const mm = m as THREE.MeshToonMaterial;
      if (!mm.userData.base) mm.userData.base = mm.color.clone();
      const base = mm.userData.base as THREE.Color;
      const c = base.clone().multiply(tint);
      if (snowy) c.lerp(new THREE.Color(0xf2f6f8), 0.55);
      if (this.season === "primavera" && mm.userData.blossom) c.set(0xf5a8c8);
      mm.color.copy(c);
    }
    const g = this.grass();
    if (g) {
      const mat = g.material as THREE.MeshToonMaterial;
      if (!this.grassBase) this.grassBase = mat.color.clone();
      const c = this.grassBase.clone();
      if (this.season === "outono") c.multiply(new THREE.Color(1.15, 0.95, 0.7));
      if (this.season === "inverno") c.multiply(new THREE.Color(0.92, 0.97, 0.95));
      if (snowy) c.lerp(new THREE.Color(0xffffff), 0.75);
      mat.color.copy(c);
    }
  }

  private applyLight() {
    const cloudy = this.weather === "sol" ? 1 : this.weather === "nublado" ? 0.82 : this.weather === "neve" ? 0.9 : 0.68;
    const dayK = 1 - this.night * 0.55;
    this.hemi.intensity = this.hemiBase * cloudy * dayK;
    this.sun.intensity = this.sunBase * (this.weather === "sol" ? 1 : 0.55) * (1 - this.night * 0.8);
    const sky = new THREE.Color(0xfff1dc).lerp(new THREE.Color(0x8fa3d9), this.night);
    this.sun.color.copy(sky);
    this.hemi.color.copy(new THREE.Color(0xffffff).lerp(new THREE.Color(0x9fb0e0), this.night));
  }

  private outsideSpawn(i: number, p: Particles, top: boolean) {
    const { w, d } = this.bounds();
    const W = w / 2 + 1;
    const D = d / 2 + 1;
    let x = 0;
    let z = 0;
    for (let k = 0; k < 8; k++) {
      x = (Math.random() * 2 - 1) * (W + 18);
      z = (Math.random() * 2 - 1) * (D + 16);
      if (Math.abs(x) > W || Math.abs(z) > D) break; // só fora do prédio
    }
    p.pos[i * 3] = x;
    p.pos[i * 3 + 1] = top ? 10 + Math.random() * 4 : Math.random() * 12;
    p.pos[i * 3 + 2] = z;
  }

  private buildParticles() {
    if (this.particles) {
      this.scene.remove(this.particles.mesh);
      this.particles.mesh.geometry.dispose();
      this.particles = null;
    }
    const kind =
      this.weather === "chuva" || this.weather === "tempestade"
        ? "rain"
        : this.weather === "neve"
          ? "snow"
          : this.season === "outono"
            ? "leaf"
            : this.season === "primavera"
              ? "petal"
              : "";
    if (!kind || !this.enabled) return;
    const n = kind === "rain" ? (this.weather === "tempestade" ? 1400 : 900) : kind === "snow" ? 700 : 140;
    const geo =
      kind === "rain" ? new THREE.BoxGeometry(0.03, 0.55, 0.03) : kind === "snow" ? new THREE.BoxGeometry(0.09, 0.09, 0.09) : new THREE.BoxGeometry(0.16, 0.03, 0.11);
    const mat =
      kind === "rain"
        ? new THREE.MeshBasicMaterial({ color: 0x9cc6e8, transparent: true, opacity: 0.6 })
        : kind === "snow"
          ? new THREE.MeshBasicMaterial({ color: 0xffffff })
          : toon(kind === "leaf" ? "#d9822b" : "#f5a8c8");
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    const p: Particles = { mesh, pos: new Float32Array(n * 3), vel: new Float32Array(n), spin: new Float32Array(n), kind };
    for (let i = 0; i < n; i++) {
      this.outsideSpawn(i, p, false);
      p.vel[i] = kind === "rain" ? 14 + Math.random() * 6 : kind === "snow" ? 0.8 + Math.random() * 0.7 : 0.6 + Math.random() * 0.6;
      p.spin[i] = Math.random() * Math.PI * 2;
    }
    this.particles = p;
    this.scene.add(mesh);
  }

  private buildConfetti() {
    const want = !!this.holiday?.confetti && this.enabled;
    if (!want && this.confetti) {
      this.scene.remove(this.confetti.mesh);
      this.confetti = null;
    }
    if (!want || this.confetti) return;
    const n = 220;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.02, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    const cols = [0xc8f501, 0xff5aa5, 0x5ec8ff, 0xffd35c, 0x8a6cc9];
    for (let i = 0; i < n; i++) mesh.setColorAt(i, new THREE.Color(cols[i % cols.length]));
    mesh.frustumCulled = false;
    const p: Particles = { mesh, pos: new Float32Array(n * 3), vel: new Float32Array(n), spin: new Float32Array(n), kind: "confetti" };
    const { w, d } = this.bounds();
    for (let i = 0; i < n; i++) {
      p.pos[i * 3] = (Math.random() - 0.5) * w;
      p.pos[i * 3 + 1] = Math.random() * 6;
      p.pos[i * 3 + 2] = (Math.random() - 0.5) * d;
      p.vel[i] = 0.4 + Math.random() * 0.5;
      p.spin[i] = Math.random() * 6;
    }
    this.confetti = p;
    this.scene.add(mesh);
  }

  private dummy = new THREE.Object3D();

  update(dt: number, t: number) {
    const p = this.particles;
    if (p) {
      const n = p.vel.length;
      const wind = p.kind === "rain" ? 1.2 : p.kind === "snow" ? 0.4 : 1.0;
      for (let i = 0; i < n; i++) {
        const j = i * 3;
        p.pos[j + 1] -= p.vel[i] * dt;
        if (p.kind !== "rain") {
          p.pos[j] += Math.sin(t * 0.8 + p.spin[i]) * dt * wind;
          p.pos[j + 2] += Math.cos(t * 0.6 + p.spin[i]) * dt * 0.4;
        } else p.pos[j] += wind * dt;
        if (p.pos[j + 1] < 0) this.outsideSpawn(i, p, true);
        this.dummy.position.set(p.pos[j], p.pos[j + 1], p.pos[j + 2]);
        this.dummy.rotation.set(p.kind === "rain" ? 0.08 : t * 2 + p.spin[i], p.spin[i], p.kind === "rain" ? 0 : t + p.spin[i]);
        this.dummy.updateMatrix();
        p.mesh.setMatrixAt(i, this.dummy.matrix);
      }
      p.mesh.instanceMatrix.needsUpdate = true;
    }
    const c = this.confetti;
    if (c) {
      const { w, d } = this.bounds();
      for (let i = 0; i < c.vel.length; i++) {
        const j = i * 3;
        c.pos[j + 1] -= c.vel[i] * dt;
        c.pos[j] += Math.sin(t * 2 + c.spin[i]) * dt * 0.5;
        if (c.pos[j + 1] < 0.02) {
          c.pos[j] = (Math.random() - 0.5) * w;
          c.pos[j + 1] = 5 + Math.random() * 2;
          c.pos[j + 2] = (Math.random() - 0.5) * d;
        }
        this.dummy.position.set(c.pos[j], c.pos[j + 1], c.pos[j + 2]);
        this.dummy.rotation.set(t * 3 + c.spin[i], c.spin[i], t * 2);
        this.dummy.updateMatrix();
        c.mesh.setMatrixAt(i, this.dummy.matrix);
      }
      c.mesh.instanceMatrix.needsUpdate = true;
    }
    // relâmpagos na tempestade
    if (this.weather === "tempestade") {
      if (this.flash <= 0 && Math.random() < dt * 0.08) this.flash = 0.25;
      if (this.flash > 0) {
        this.flash -= dt;
        this.hemi.intensity = this.hemiBase * (this.flash > 0.12 || (this.flash < 0.08 && this.flash > 0.04) ? 2.2 : 0.6);
        if (this.flash <= 0) this.applyLight();
      }
    }
  }
}
