import * as THREE from "three";
import { httpJson } from "./integrations";

// =====================================================================
// Itens com dados ao vivo: painel financeiro, painel de meta, clima,
// relógio e painel personalizado (qualquer API JSON).
// Cada item desenha numa textura de canvas que é atualizada sozinha.
// =====================================================================

export interface GoalCfg {
  title: string;
  current: number;
  target: number;
  unit: string; // R$, %, un, vendas, leads, clientes...
  deadline?: string; // AAAA-MM-DD
}
export interface CustomCfg {
  title: string;
  url: string;
  path: string;
  prefix?: string;
  suffix?: string;
  refresh?: number; // minutos
}

export const DEFAULT_GOAL: GoalCfg = { title: "Meta do mês", current: 0, target: 100000, unit: "R$" };
export const DEFAULT_CUSTOM: CustomCfg = { title: "Dólar (exemplo)", url: "https://economia.awesomeapi.com.br/json/last/USD-BRL", path: "USDBRL.bid", prefix: "R$ " };

const W = 512;
const H = 320;
const NEON = "#C8F501";

function canvas() {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { c, g: c.getContext("2d")!, tex };
}

function frame(g: CanvasRenderingContext2D, title: string) {
  g.fillStyle = "#0f1115";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#1a1d24";
  g.fillRect(0, 0, W, 56);
  g.fillStyle = NEON;
  g.fillRect(0, 54, W, 3);
  g.font = "700 28px Montserrat, sans-serif";
  g.fillStyle = "#f4f4ef";
  g.textBaseline = "middle";
  g.fillText(title, 22, 29);
}

export const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v >= 1000 ? 0 : 2 });
export const fmtNum = (v: number, unit: string) =>
  unit === "R$" ? fmtBRL(v) : unit === "%" ? `${v.toLocaleString("pt-BR")}%` : unit && unit !== "un" ? `${v.toLocaleString("pt-BR")} ${unit}` : v.toLocaleString("pt-BR");

// ------------------------------------------------------------------ dados
export interface FinanceData {
  updated: Date;
  quotes: { code: string; name: string; bid: number; pct: number }[];
  selic?: number;
  ipca?: number;
}

let finCache: { at: number; data: FinanceData | null; p?: Promise<FinanceData | null> } = { at: 0, data: null };

export async function financeData(force = false): Promise<FinanceData | null> {
  if (!force && finCache.data && Date.now() - finCache.at < 5 * 60_000) return finCache.data;
  if (finCache.p) return finCache.p;
  finCache.p = (async () => {
    try {
      const q: any = await httpJson("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL,GBP-BRL");
      const names: Record<string, string> = { USDBRL: "Dólar", EURBRL: "Euro", BTCBRL: "Bitcoin", GBPBRL: "Libra" };
      const quotes = Object.entries(q).map(([k, v]: [string, any]) => ({ code: k.replace("BRL", ""), name: names[k] ?? k, bid: Number(v.bid), pct: Number(v.pctChange) }));
      let selic: number | undefined;
      let ipca: number | undefined;
      try {
        const s: any = await httpJson("https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json");
        selic = Number(String(s[0].valor).replace(",", "."));
        const i: any = await httpJson("https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json");
        ipca = Number(String(i[0].valor).replace(",", "."));
      } catch {
        /* Banco Central fora do ar: segue só com as cotações */
      }
      const data: FinanceData = { updated: new Date(), quotes, selic, ipca };
      finCache = { at: Date.now(), data };
      return data;
    } catch (e) {
      console.warn("financeiro:", e);
      finCache.p = undefined;
      return finCache.data;
    }
  })();
  const r = await finCache.p;
  finCache.p = undefined;
  return r;
}

export interface WeatherData {
  temp: number;
  code: number;
  isDay: boolean;
  max: number;
  min: number;
  city: string;
}
let wCache: { at: number; key: string; data: WeatherData | null } = { at: 0, key: "", data: null };
export async function weatherData(lat = -20.4697, lon = -54.6201, city = "Campo Grande"): Promise<WeatherData | null> {
  const key = `${lat},${lon}`;
  if (wCache.data && wCache.key === key && Date.now() - wCache.at < 15 * 60_000) return wCache.data;
  try {
    const r: any = await httpJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`,
    );
    const data = { temp: r.current.temperature_2m, code: r.current.weather_code, isDay: !!r.current.is_day, max: r.daily.temperature_2m_max[0], min: r.daily.temperature_2m_min[0], city };
    wCache = { at: Date.now(), key, data };
    return data;
  } catch (e) {
    console.warn("clima:", e);
    return wCache.data;
  }
}

export function pathGet(obj: any, path: string) {
  return path
    .split(".")
    .filter(Boolean)
    .reduce((o, k) => (o == null ? undefined : Array.isArray(o) && /^\d+$/.test(k) ? o[Number(k)] : o[k]), obj);
}

const customCache = new Map<string, { at: number; value: string }>();
export async function customValue(cfg: CustomCfg, force = false) {
  const key = cfg.url + "#" + cfg.path;
  const c = customCache.get(key);
  if (!force && c && Date.now() - c.at < (cfg.refresh ?? 5) * 60_000) return c.value;
  try {
    const data = await httpJson(cfg.url);
    let v = pathGet(data, cfg.path);
    if (typeof v === "number" || (typeof v === "string" && /^-?\d+([.,]\d+)?$/.test(v))) {
      const n = Number(String(v).replace(",", "."));
      v = n.toLocaleString("pt-BR", { maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 });
    } else if (typeof v === "object") v = JSON.stringify(v).slice(0, 40);
    const value = `${cfg.prefix ?? ""}${v ?? "—"}${cfg.suffix ?? ""}`;
    customCache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    console.warn("painel personalizado:", e);
    return c?.value ?? "sem conexão";
  }
}

// ------------------------------------------------------------------ desenho
const WCODE: [number, string][] = [
  [0, "Céu limpo"], [2, "Parcialmente nublado"], [3, "Nublado"], [45, "Neblina"], [51, "Garoa"], [61, "Chuva"], [80, "Pancadas de chuva"], [95, "Tempestade"],
];
export const weatherText = (code: number) => [...WCODE].reverse().find(([c]) => code >= c)?.[1] ?? "—";

function drawFinance(g: CanvasRenderingContext2D, d: FinanceData | null) {
  frame(g, "Painel financeiro");
  if (!d) {
    g.font = "500 24px Montserrat, sans-serif";
    g.fillStyle = "#a1a19a";
    g.fillText("Carregando cotações...", 22, 160);
    return;
  }
  g.font = "600 22px Montserrat, sans-serif";
  d.quotes.slice(0, 4).forEach((q, i) => {
    const y = 92 + i * 46;
    g.fillStyle = "#a1a19a";
    g.fillText(q.name, 22, y);
    g.fillStyle = "#f4f4ef";
    g.font = "700 26px Montserrat, sans-serif";
    const val = q.code === "BTC" ? fmtBRL(q.bid) : q.bid.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
    g.fillText(val, 150, y);
    g.font = "600 22px Montserrat, sans-serif";
    g.fillStyle = q.pct >= 0 ? NEON : "#ff5a65";
    g.fillText(`${q.pct >= 0 ? "▲" : "▼"} ${Math.abs(q.pct).toFixed(2)}%`, 390, y);
  });
  g.fillStyle = "#1a1d24";
  g.fillRect(0, 272, W, 48);
  g.font = "600 20px Montserrat, sans-serif";
  g.fillStyle = "#f4f4ef";
  const econ = [d.selic != null ? `Selic ${d.selic.toFixed(2)}%` : "", d.ipca != null ? `IPCA 12m ${d.ipca.toFixed(2)}%` : ""].filter(Boolean).join("   ·   ");
  g.fillText(econ || "Economia: sem dados agora", 22, 296);
}

function drawGoal(g: CanvasRenderingContext2D, cfg: GoalCfg) {
  frame(g, cfg.title || "Meta");
  const pct = cfg.target > 0 ? Math.max(0, Math.min(1, cfg.current / cfg.target)) : 0;
  g.font = "700 44px Montserrat, sans-serif";
  g.fillStyle = "#f4f4ef";
  g.fillText(fmtNum(cfg.current, cfg.unit), 22, 112);
  g.font = "500 22px Montserrat, sans-serif";
  g.fillStyle = "#a1a19a";
  g.fillText(`de ${fmtNum(cfg.target, cfg.unit)}`, 22, 154);
  g.fillStyle = "#262a33";
  g.fillRect(22, 186, W - 44, 34);
  g.fillStyle = pct >= 1 ? "#5ee08a" : NEON;
  g.fillRect(22, 186, (W - 44) * pct, 34);
  g.font = "800 26px Montserrat, sans-serif";
  g.fillStyle = "#f4f4ef";
  g.textAlign = "right";
  g.fillText(`${Math.round(pct * 100)}%`, W - 22, 112);
  g.textAlign = "left";
  if (cfg.deadline) {
    const days = Math.ceil((new Date(cfg.deadline + "T23:59:59").getTime() - Date.now()) / 86400000);
    g.font = "600 22px Montserrat, sans-serif";
    g.fillStyle = days < 0 ? "#ff5a65" : "#a1a19a";
    g.fillText(days < 0 ? "Prazo encerrado" : days === 0 ? "Último dia!" : `Faltam ${days} dias`, 22, 270);
    if (pct < 1 && days > 0) {
      const perDay = (cfg.target - cfg.current) / days;
      g.textAlign = "right";
      g.fillText(`${fmtNum(Math.ceil(perDay), cfg.unit)}/dia`, W - 22, 270);
      g.textAlign = "left";
    }
  }
  if (pct >= 1) {
    g.font = "800 24px Montserrat, sans-serif";
    g.fillStyle = "#5ee08a";
    g.fillText("Meta batida!", 22, 270);
  }
}

function drawWeather(g: CanvasRenderingContext2D, d: WeatherData | null) {
  frame(g, d ? `Clima · ${d.city}` : "Clima");
  if (!d) return;
  g.font = "800 84px Montserrat, sans-serif";
  g.fillStyle = "#f4f4ef";
  g.fillText(`${Math.round(d.temp)}°`, 22, 150);
  g.font = "600 26px Montserrat, sans-serif";
  g.fillStyle = NEON;
  g.fillText(weatherText(d.code), 22, 230);
  g.fillStyle = "#a1a19a";
  g.font = "500 22px Montserrat, sans-serif";
  g.fillText(`Máx ${Math.round(d.max)}°  ·  Mín ${Math.round(d.min)}°`, 22, 272);
}

function drawClock(g: CanvasRenderingContext2D) {
  frame(g, "Horário");
  const now = new Date();
  const zones: [string, string][] = [["Campo Grande", "America/Campo_Grande"], ["São Paulo", "America/Sao_Paulo"], ["Nova York", "America/New_York"], ["Lisboa", "Europe/Lisbon"]];
  zones.forEach(([n, tz], i) => {
    const y = 100 + i * 52;
    g.font = "600 24px Montserrat, sans-serif";
    g.fillStyle = "#a1a19a";
    g.fillText(n, 22, y);
    g.font = "800 34px Montserrat, sans-serif";
    g.fillStyle = i === 0 ? NEON : "#f4f4ef";
    g.textAlign = "right";
    g.fillText(now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: tz }), W - 22, y);
    g.textAlign = "left";
  });
}

function drawCustom(g: CanvasRenderingContext2D, cfg: CustomCfg, value: string) {
  frame(g, cfg.title || "Painel");
  g.font = "800 64px Montserrat, sans-serif";
  g.fillStyle = "#f4f4ef";
  let size = 64;
  while (g.measureText(value).width > W - 44 && size > 22) {
    size -= 4;
    g.font = `800 ${size}px Montserrat, sans-serif`;
  }
  g.fillText(value, 22, 170);
  g.font = "500 18px Montserrat, sans-serif";
  g.fillStyle = "#6b6b66";
  g.fillText("Atualizado " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), 22, 290);
}

// ------------------------------------------------------------------ texturas vivas
interface Live {
  kind: string;
  cfg: any;
  draw: (force?: boolean) => Promise<void>;
  tex: THREE.CanvasTexture;
}
const live = new Map<string, Live>();
let ticking = false;

function ensureTicker() {
  if (ticking) return;
  ticking = true;
  setInterval(() => {
    for (const l of live.values()) l.draw().catch(() => {});
  }, 60_000);
}

/** Textura viva para o item `id` do tipo `kind`. Reaproveita se já existir. */
export function widgetTexture(id: string, kind: string, cfg: any): THREE.CanvasTexture {
  const key = id + ":" + kind;
  const old = live.get(key);
  if (old && JSON.stringify(old.cfg) === JSON.stringify(cfg)) return old.tex;
  const { g, tex } = old ? { g: (old.tex.image as HTMLCanvasElement).getContext("2d")!, tex: old.tex } : canvas();
  const l: Live = {
    kind,
    cfg,
    tex,
    draw: async (force) => {
      if (kind === "fin_panel") drawFinance(g, await financeData(force));
      else if (kind === "goal_panel") drawGoal(g, { ...DEFAULT_GOAL, ...cfg });
      else if (kind === "weather_panel") drawWeather(g, await weatherData(cfg?.lat, cfg?.lon, cfg?.city));
      else if (kind === "clock_panel") drawClock(g);
      else if (kind === "api_panel") {
        const c = { ...DEFAULT_CUSTOM, ...cfg };
        drawCustom(g, c, await customValue(c, force));
      }
      tex.needsUpdate = true;
    },
  };
  live.set(key, l);
  // desenha algo já, e os dados quando chegarem
  if (kind === "goal_panel" || kind === "clock_panel") l.draw();
  else {
    frame(g, "Carregando...");
    tex.needsUpdate = true;
    l.draw().catch(() => {});
  }
  ensureTicker();
  return tex;
}

export function refreshWidgets() {
  for (const l of live.values()) l.draw(true).catch(() => {});
}
