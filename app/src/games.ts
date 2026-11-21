/**
 * Jogos das mesas do escritório (pingue-pongue e sinuca), um contra o outro.
 *
 * Quem convida é o "anfitrião": roda a física e manda o estado para o convidado ~20x por segundo
 * (mensagens diretas pelo servidor, `{t:"to"}`). O convidado só manda o que faz (raquete, tacada).
 * Também dá para treinar sozinho (no pingue-pongue o outro lado é o computador).
 */

export type GameKind = "pong" | "pool";
export type Role = "host" | "guest" | "solo";

export interface GameOpts {
  kind: GameKind;
  role: Role;
  me: string;
  other: string;
  /** manda uma mensagem do jogo para o outro jogador */
  send: (msg: any) => void;
  onClose: () => void;
  /** sons curtos (batida, caçapa, ponto) */
  sfx?: (k: "hit" | "pocket" | "point" | "win") => void;
  /** Sinuca: pose do jogador para a cena 3D (taco, mira) e bolas para a mesa 3D. */
  onPose?: (p: PoolPose) => void;
  onTable?: (t: PoolTable) => void;
}

const W = 640;
const H = 360;

export class GameSession {
  el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private raf = 0;
  private last = performance.now();
  private sendAcc = 0;
  private over = false;
  private names: [string, string];
  private status: HTMLDivElement;
  private game: Pong | Pool;

  constructor(private o: GameOpts) {
    // jogador 0 = anfitrião (ou eu, sozinho); jogador 1 = convidado (ou computador)
    this.names = o.role === "guest" ? [o.other, o.me] : [o.me, o.role === "solo" ? (o.kind === "pong" ? "Computador" : "Treino") : o.other];
    this.el = document.createElement("div");
    this.el.className = "modal-bg game-bg" + (o.kind === "pool" ? " pool" : "");
    this.el.innerHTML = `<div class="panel modal game-modal">
      <div class="panel-head"><div class="t-m">${o.kind === "pong" ? "Pingue-pongue" : "Sinuca"}</div><button class="x-btn" data-x aria-label="Sair">✕</button></div>
      <div class="game-score"></div>
      <canvas width="${W}" height="${H}"></canvas>
      <div class="note game-help"></div>
    </div>`;
    this.cv = this.el.querySelector("canvas")!;
    this.g = this.cv.getContext("2d")!;
    this.status = this.el.querySelector(".game-score")!;
    this.el.querySelector("[data-x]")!.addEventListener("click", () => this.quit());
    const mine = o.role === "guest" ? 1 : 0;
    this.game = o.kind === "pong" ? new Pong(o.role, mine) : new Pool(o.role, mine);
    if (this.game instanceof Pool) {
      this.game.onTable = (t) => this.o.onTable?.(t);
      if (o.role === "host") this.o.send(this.game.hello());
      this.o.onTable?.({ balls: this.game.sim.pack() });
    }
    // canvas nítido em telas de alta densidade (a lógica continua em W x H)
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = W * dpr;
    this.cv.height = H * dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    (this.el.querySelector(".game-help") as HTMLElement).textContent =
      o.kind === "pong"
        ? "Mexa o mouse (ou ↑ ↓) para mover a sua raquete. Quem fizer 7 pontos primeiro ganha."
        : "Mire com o mouse. Clique, puxe para trás para dar força e solte. ← → ajustam a mira (Shift = fino), espaço também taca. Bola na mão: arraste a branca.";
    this.bindInput();
    document.body.appendChild(this.el);
    this.loop();
  }

  private bindInput() {
    const pos = (e: PointerEvent) => {
      const r = this.cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    this.cv.addEventListener("pointermove", (e) => this.game.pointer(pos(e), "move"));
    this.cv.addEventListener("pointerdown", (e) => {
      this.cv.setPointerCapture(e.pointerId);
      this.game.pointer(pos(e), "down");
    });
    this.cv.addEventListener("pointerup", (e) => {
      this.game.pointer(pos(e), "up");
    });
    this.keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") this.quit();
      if (this.game instanceof Pool) {
        if (this.game.keyEx(e)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        this.game.key(e.key === "ArrowUp" ? -1 : 1, e.type === "keydown");
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", this.keys, true);
    window.addEventListener("keyup", this.keys, true);
  }
  private keys!: (e: KeyboardEvent) => void;

  /** Mensagem do outro jogador. */
  onMsg(m: any) {
    if (m.t === "quit") {
      this.finish(`${this.o.other} saiu do jogo`);
      return;
    }
    if (m.t === "end") {
      this.finish(m.text);
      return;
    }
    this.game.remote(m);
  }

  private loop = () => {
    const now = performance.now();
    // a sinuca segue o relógio de verdade (mesmo com poucos quadros por segundo)
    const dt = Math.min(this.o.kind === "pool" ? 0.25 : 0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.over) {
      const ev = this.game.step(dt);
      if (ev) this.o.sfx?.(ev);
      if (this.game instanceof Pool) {
        // sinuca: só manda o que acontece (mira, tacada, estado final)
        for (const m of this.game.drain()) if (this.o.role !== "solo") this.o.send(m);
        this.o.onPose?.(this.game.pose());
      }
      // pingue-pongue: anfitrião manda o estado; convidado manda a raquete
      this.sendAcc += dt;
      if (this.sendAcc > 0.05 && this.o.role !== "solo" && !(this.game instanceof Pool)) {
        this.sendAcc = 0;
        const m = this.o.role === "host" ? this.game.snapshot() : this.game.input();
        if (m) this.o.send(m);
      }
      const win = this.game.winner();
      if (win !== null && this.o.role !== "guest") {
        const text =
          this.game instanceof Pool
            ? this.o.role === "solo"
              ? this.game.scoreText()
              : `${this.names[win]} venceu: ${this.game.scoreText()}`
            : `${this.names[win]} venceu! ${this.game.scoreText()}`;
        if (this.o.role === "host") {
          this.o.send(this.game.snapshot());
          this.o.send({ t: "end", text });
        }
        this.finish(text);
      }
    }
    this.game.draw(this.g);
    this.status.innerHTML = this.game.header(this.names);
    this.raf = requestAnimationFrame(this.loop);
  };

  private finish(text: string) {
    if (this.over) return;
    this.over = true;
    this.o.sfx?.("win");
    const box = document.createElement("div");
    box.className = "game-over";
    box.innerHTML = `<div class="t-m"></div><button class="btn primary sm">Fechar</button>`;
    box.querySelector(".t-m")!.textContent = text;
    box.querySelector("button")!.addEventListener("click", () => this.close());
    this.el.querySelector(".game-modal")!.appendChild(box);
  }

  quit() {
    if (!this.over && this.o.role !== "solo") this.o.send({ t: "quit" });
    this.close();
  }

  close() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.keys, true);
    window.removeEventListener("keyup", this.keys, true);
    this.el.remove();
    this.o.onClose();
  }
}

interface Game {
  step(dt: number): "hit" | "pocket" | "point" | null;
  draw(g: CanvasRenderingContext2D): void;
  pointer(p: { x: number; y: number }, kind: "move" | "down" | "up"): any;
  key(dir: number, down: boolean): void;
  snapshot(): any;
  input(): any;
  remote(m: any): void;
  winner(): number | null;
  scoreText(): string;
  header(names: [string, string]): string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// ===================================================================== pingue-pongue
class Pong implements Game {
  private ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  private pad = [H / 2, H / 2];
  private score = [0, 0];
  private serveIn = 1.2;
  private keyDir = 0;
  private target: number | null = null;
  private readonly PH = 70;
  private readonly TO = 7;

  constructor(private role: Role, private mine: number) {}

  private serve(toward: number) {
    const a = (Math.random() * 0.8 - 0.4);
    const sp = 300;
    this.ball = { x: W / 2, y: H / 2, vx: Math.cos(a) * sp * (toward ? 1 : -1), vy: Math.sin(a) * sp };
  }

  step(dt: number) {
    // minha raquete
    if (this.keyDir) this.target = Math.max(this.PH / 2, Math.min(H - this.PH / 2, (this.target ?? this.pad[this.mine]) + this.keyDir * 420 * dt));
    if (this.target !== null) this.pad[this.mine] += (this.target - this.pad[this.mine]) * Math.min(1, dt * 18);
    if (this.role === "guest") {
      // o convidado só aproxima a bola do último estado (fica suave)
      this.ball.x += this.ball.vx * dt;
      this.ball.y += this.ball.vy * dt;
      return null;
    }
    // computador (treino)
    if (this.role === "solo") {
      const t = this.ball.vx > 0 ? this.ball.y : H / 2;
      this.pad[1] += Math.max(-260 * dt, Math.min(260 * dt, t - this.pad[1]));
    }
    if (this.serveIn > 0) {
      this.serveIn -= dt;
      if (this.serveIn <= 0) this.serve(Math.random() < 0.5 ? 0 : 1);
      return null;
    }
    const b = this.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let ev: "hit" | "point" | null = null;
    if (b.y < 8 || b.y > H - 8) {
      b.vy *= -1;
      b.y = Math.max(8, Math.min(H - 8, b.y));
    }
    for (const side of [0, 1]) {
      const px = side ? W - 28 : 28;
      const py = this.pad[side];
      const toward = side ? b.vx > 0 : b.vx < 0;
      if (toward && Math.abs(b.x - px) < 12 && Math.abs(b.y - py) < this.PH / 2 + 8) {
        const off = (b.y - py) / (this.PH / 2);
        const sp = Math.min(760, Math.hypot(b.vx, b.vy) * 1.06);
        const ang = off * 0.9;
        b.vx = Math.cos(ang) * sp * (side ? -1 : 1);
        b.vy = Math.sin(ang) * sp;
        b.x = px + (side ? -12 : 12);
        ev = "hit";
      }
    }
    if (b.x < -10 || b.x > W + 10) {
      const scorer = b.x < 0 ? 1 : 0;
      this.score[scorer]++;
      this.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
      this.serveIn = 1;
      ev = "point";
    }
    return ev;
  }

  draw(g: CanvasRenderingContext2D) {
    g.fillStyle = "#1f4f8f";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,.85)";
    g.lineWidth = 3;
    g.strokeRect(4, 4, W - 8, H - 8);
    g.setLineDash([8, 10]);
    g.beginPath();
    g.moveTo(W / 2, 6);
    g.lineTo(W / 2, H - 6);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = "rgba(255,255,255,.12)";
    g.font = "bold 72px Montserrat, sans-serif";
    g.textAlign = "center";
    g.fillText(String(this.score[0]), W / 4, H / 2 + 26);
    g.fillText(String(this.score[1]), (3 * W) / 4, H / 2 + 26);
    for (const side of [0, 1]) {
      g.fillStyle = side === this.mine && this.role !== "solo" ? "#C8F501" : side === this.mine ? "#C8F501" : "#f2f0ea";
      g.fillRect(side ? W - 34 : 22, this.pad[side] - this.PH / 2, 12, this.PH);
    }
    g.fillStyle = "#ffb13b";
    g.beginPath();
    g.arc(this.ball.x, this.ball.y, 7, 0, Math.PI * 2);
    g.fill();
  }

  pointer(p: { x: number; y: number }) {
    this.target = Math.max(this.PH / 2, Math.min(H - this.PH / 2, p.y));
    return null;
  }
  key(dir: number, down: boolean) {
    this.keyDir = down ? dir : 0;
  }
  snapshot() {
    return { t: "st", b: [this.ball.x, this.ball.y, this.ball.vx, this.ball.vy].map(Math.round), p0: Math.round(this.pad[0]), s: this.score };
  }
  input() {
    return { t: "in", y: Math.round(this.pad[1]) };
  }
  remote(m: any) {
    if (m.t === "in" && this.role === "host") this.pad[1] = Number(m.y) || this.pad[1];
    if (m.t === "st" && this.role === "guest") {
      const [x, y, vx, vy] = m.b;
      this.ball = { x, y, vx, vy };
      this.pad[0] = m.p0;
      this.score = m.s;
    }
  }
  winner() {
    if (this.score[0] >= this.TO) return 0;
    if (this.score[1] >= this.TO) return 1;
    return null;
  }
  scoreText() {
    return `${this.score[0]} x ${this.score[1]}`;
  }
  header(n: [string, string]) {
    return `<span>${esc(n[0])}</span><b>${this.score[0]} x ${this.score[1]}</b><span>${esc(n[1])}</span>`;
  }
}

// ===================================================================== sinuca
/**
 * Sinuca (bola 8, com lisas e listradas).
 *
 * A física é determinística (passo fixo de 1/240 s, só + − × ÷ e raiz): os dois jogadores e quem
 * está assistindo rodam a MESMA simulação a partir do mesmo estado e da mesma velocidade inicial,
 * então as bolas andam lisas para todo mundo, sem depender de 20 pacotes por segundo.
 * O anfitrião é o juiz: depois que tudo para, ele aplica as regras e manda o estado oficial.
 */
export const POOL_W = W;
export const POOL_H = H;
/** Borda interna das tabelas (canvas). */
export const PM = 30;
export const PR = 8.5;
const CG = 20; // vão das caçapas de canto, medido ao longo da tabela
const SG = 14; // meio vão da caçapa do meio
const POCKETS: [number, number, number][] = [
  [PM - 3, PM - 3, 15],
  [W / 2, PM - 7, 13],
  [W - PM + 3, PM - 3, 15],
  [PM - 3, H - PM + 3, 15],
  [W / 2, H - PM + 7, 13],
  [W - PM + 3, H - PM + 3, 15],
];
/** Pontas das tabelas junto às caçapas (a bola bate nelas como numa quina). */
const JAWS: [number, number][] = [
  [PM, PM + CG], [PM + CG, PM], [W - PM - CG, PM], [W - PM, PM + CG],
  [PM, H - PM - CG], [PM + CG, H - PM], [W - PM - CG, H - PM], [W - PM, H - PM - CG],
  [W / 2 - SG, PM], [W / 2 + SG, PM], [W / 2 - SG, H - PM], [W / 2 + SG, H - PM],
];
const STEP = 1 / 240;
const ROLL = 62; // atrito de rolamento (px/s²)
const DAMP = 0.85; // perda proporcional à velocidade (1/s)
const RAIL_E = 0.74;
const BALL_E = 0.95;
export const MAX_SPEED = 1150;
const HEAD_X = W * 0.25; // linha de saída (cozinha)

export interface PBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  n: number; // 0 = branca, 8 = bola 8, 1–7 lisas, 9–15 listradas
  in: boolean;
}

export interface ShotResult {
  firstHit: number | null;
  pocketed: number[];
  cueIn: boolean;
}

/** Física pura da mesa (sem desenho). Usada no jogo e nas bolas 3D da mesa. */
export class PoolSim {
  balls: PBall[] = [];
  moving = false;
  private acc = 0;
  res: ShotResult = { firstHit: null, pocketed: [], cueIn: false };

  constructor() {
    this.rack();
  }

  rack() {
    const order = [[1], [9, 2], [10, 8, 3], [11, 7, 14, 4], [5, 13, 15, 6, 12]];
    this.balls = [{ x: HEAD_X, y: H / 2, vx: 0, vy: 0, n: 0, in: false }];
    const dx = PR * 2 * 0.8661 + 0.15;
    const dy = PR * 2 + 0.15;
    order.forEach((row, c) =>
      row.forEach((n, r) => this.balls.push({ x: W * 0.7 + c * dx, y: H / 2 + (r - (row.length - 1) / 2) * dy, vx: 0, vy: 0, n, in: false })),
    );
    this.balls.sort((a, b) => a.n - b.n);
    this.moving = false;
  }

  /** Estado compacto: [x, y] por bola (null = encaçapada), na ordem do número. */
  pack(): ([number, number] | null)[] {
    return this.balls.map((b) => (b.in ? null : [b.x, b.y]));
  }
  load(p: ([number, number] | null)[]) {
    p.forEach((v, i) => {
      const b = this.balls[i];
      if (!b) return;
      b.vx = b.vy = 0;
      if (!v) b.in = true;
      else (b.in = false), (b.x = v[0]), (b.y = v[1]);
    });
    this.moving = false;
    this.acc = 0;
  }

  /** Taca a branca (velocidade já em px/s, arredondada por quem tacou). */
  shoot(vx: number, vy: number) {
    const cue = this.balls[0];
    cue.vx = vx;
    cue.vy = vy;
    this.moving = true;
    this.acc = 0;
    this.res = { firstHit: null, pocketed: [], cueIn: false };
  }

  /** Avança o tempo; devolve sons do quadro. */
  step(dt: number): { hit: number; rail: number; pocket: number } {
    const ev = { hit: 0, rail: 0, pocket: 0 };
    if (!this.moving) return ev;
    this.acc += Math.min(dt, 0.25);
    let n = 0;
    while (this.acc >= STEP && this.moving && n < 64) {
      this.acc -= STEP;
      n++;
      this.sub(ev);
    }
    return ev;
  }

  /** Roda a tacada inteira de uma vez (para quem acabou de chegar ou para conferir). */
  finish() {
    let n = 0;
    while (this.moving && n++ < 240 * 40) this.sub({ hit: 0, rail: 0, pocket: 0 });
  }

  private sub(ev: { hit: number; rail: number; pocket: number }) {
    const h = STEP;
    const bs = this.balls;
    for (const b of bs) {
      if (b.in || (b.vx === 0 && b.vy === 0)) continue;
      b.x += b.vx * h;
      b.y += b.vy * h;
      const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const ns = sp - (ROLL + DAMP * sp) * h;
      if (ns < 3) b.vx = b.vy = 0;
      else {
        b.vx *= ns / sp;
        b.vy *= ns / sp;
      }
      // caçapas
      for (const [px, py, pr] of POCKETS) {
        const dx = b.x - px;
        const dy = b.y - py;
        if (dx * dx + dy * dy < pr * pr) {
          this.pocket(b);
          ev.pocket = Math.max(ev.pocket, 1);
          break;
        }
      }
      if (b.in) continue;
      // tabelas (com vão nas caçapas)
      const midGap = b.x > W / 2 - SG && b.x < W / 2 + SG;
      if (b.x - PR < PM && b.y > PM + CG && b.y < H - PM - CG) {
        b.x = PM + PR;
        if (b.vx < 0) (ev.rail = Math.max(ev.rail, -b.vx / MAX_SPEED)), (b.vx = -b.vx * RAIL_E), (b.vy *= 0.97);
      } else if (b.x + PR > W - PM && b.y > PM + CG && b.y < H - PM - CG) {
        b.x = W - PM - PR;
        if (b.vx > 0) (ev.rail = Math.max(ev.rail, b.vx / MAX_SPEED)), (b.vx = -b.vx * RAIL_E), (b.vy *= 0.97);
      }
      if (b.y - PR < PM && b.x > PM + CG && b.x < W - PM - CG && !midGap) {
        b.y = PM + PR;
        if (b.vy < 0) (ev.rail = Math.max(ev.rail, -b.vy / MAX_SPEED)), (b.vy = -b.vy * RAIL_E), (b.vx *= 0.97);
      } else if (b.y + PR > H - PM && b.x > PM + CG && b.x < W - PM - CG && !midGap) {
        b.y = H - PM - PR;
        if (b.vy > 0) (ev.rail = Math.max(ev.rail, b.vy / MAX_SPEED)), (b.vy = -b.vy * RAIL_E), (b.vx *= 0.97);
      }
      // quinas das caçapas
      for (const [jx, jy] of JAWS) {
        const dx = b.x - jx;
        const dy = b.y - jy;
        const d2 = dx * dx + dy * dy;
        if (d2 < PR * PR && d2 > 1e-9) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          b.x = jx + nx * PR;
          b.y = jy + ny * PR;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            b.vx -= (1 + 0.6) * vn * nx;
            b.vy -= (1 + 0.6) * vn * ny;
          }
        }
      }
      // escapou pela boca da caçapa: caiu
      if (b.x < PM - 16 || b.x > W - PM + 16 || b.y < PM - 16 || b.y > H - PM + 16) {
        this.pocket(b);
        ev.pocket = 1;
      }
    }
    // choques entre bolas (mesma massa)
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (a.in) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        if (b.in) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * PR * PR || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const ov = (2 * PR - d) / 2;
        a.x -= nx * ov;
        a.y -= ny * ov;
        b.x += nx * ov;
        b.y += ny * ov;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          const k = ((1 + BALL_E) / 2) * rel;
          a.vx -= k * nx;
          a.vy -= k * ny;
          b.vx += k * nx;
          b.vy += k * ny;
          ev.hit = Math.max(ev.hit, rel / MAX_SPEED);
          if (this.res.firstHit === null) {
            if (a.n === 0) this.res.firstHit = b.n;
            else if (b.n === 0) this.res.firstHit = a.n;
          }
        }
      }
    }
    if (bs.every((b) => b.in || (b.vx === 0 && b.vy === 0))) this.moving = false;
  }

  private pocket(b: PBall) {
    b.in = true;
    b.vx = b.vy = 0;
    if (b.n === 0) this.res.cueIn = true;
    else this.res.pocketed.push(b.n);
  }

  /** Lugar livre para a branca (não encosta em nenhuma bola). */
  free(x: number, y: number) {
    if (x < PM + PR || x > W - PM - PR || y < PM + PR || y > H - PM - PR) return false;
    return this.balls.every((b) => b.n === 0 || b.in || (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) > 4 * PR * PR + 1);
  }

  /** Recoloca uma bola o mais perto possível de (x, y). */
  spot(n: number, x: number, y: number) {
    const b = this.balls[n];
    for (let r = 0; r < 200; r += 2) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const tx = x + (r ? Math.cos(a) * r : 0);
        const ty = y + (r ? Math.sin(a) * r : 0);
        if (this.freeFor(n, tx, ty)) {
          Object.assign(b, { x: tx, y: ty, vx: 0, vy: 0, in: false });
          return;
        }
      }
    }
  }
  private freeFor(n: number, x: number, y: number) {
    if (x < PM + PR || x > W - PM - PR || y < PM + PR || y > H - PM - PR) return false;
    return this.balls.every((b) => b.n === n || b.in || (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) > 4 * PR * PR + 1);
  }
}

const BALL_COLORS = ["#f6f3ea", "#f2c230", "#2f62c4", "#d23a2e", "#7a4fc0", "#ef7d22", "#1f9a52", "#8b2a22", "#121212"];
const ballColor = (n: number) => BALL_COLORS[n > 8 ? n - 8 : n];
const isSolid = (n: number) => n >= 1 && n <= 7;
const isStripe = (n: number) => n >= 9 && n <= 15;
type Group = "lisas" | "listradas" | null;
const inGroup = (n: number, g: Group) => (g === "lisas" ? isSolid(n) : g === "listradas" ? isStripe(n) : false);

/** O que o jogo conta para a cena 3D (posição do jogador e o taco). */
export interface PoolPose {
  /** É a minha vez e estou mirando. */
  myTurn: boolean;
  /** Ângulo da tacada no canvas (rad) e força (0..1). */
  aim: number;
  pow: number;
  /** Momento da última tacada (Date.now) para a animação do taco. */
  shotAt: number;
  /** Onde está a branca (canvas). */
  cue: [number, number];
}

/** O que os outros precisam para ver as bolas na mesa 3D. */
export interface PoolTable {
  balls: ([number, number] | null)[];
  shot?: { id: number; b: ([number, number] | null)[]; vx: number; vy: number };
}

class Pool implements Game {
  sim = new PoolSim();
  private turn = 0;
  private groups: [Group, Group] = [null, null];
  /** 0 = não, 1 = só na cozinha (saída), 2 = em qualquer lugar. */
  private inHand = 1;
  private isBreak = true;
  private msg = "Saída: posicione a branca na faixa da esquerda se quiser e taque.";
  private win: number | null = null;
  private winText = "";
  private shots = 0;
  private shotId = 0;
  private waiting = false; // convidado esperando o anfitrião confirmar a tacada
  // mira
  private aimA = 0;
  private pow = 0;
  private charging = false;
  private chargeFrom: { x: number; y: number } | null = null;
  private placing = false;
  private hover: { x: number; y: number } | null = null;
  private lastShotAt = 0;
  /** mira do outro jogador (para ver o taco dele) */
  private otherAim: { a: number; p: number; at: number } | null = null;
  private aimSentAt = 0;
  private aimSent = "";
  private pend: any[] = [];
  /** Avisos para a sessão (pose 3D, bolas da mesa). */
  onTable?: (t: PoolTable) => void;
  private evSfx: "hit" | "pocket" | null = null;

  constructor(private role: Role, private mine: number) {
    this.aimA = 0;
  }

  private myTurn() {
    return this.role === "solo" || this.turn === this.mine;
  }
  private cue() {
    return this.sim.balls[0];
  }

  pose(): PoolPose {
    const c = this.cue();
    return { myTurn: this.myTurn() && !this.sim.moving && this.win === null, aim: this.aimA, pow: this.pow, shotAt: this.lastShotAt, cue: [c.x, c.y] };
  }

  /** Mensagens que a sessão deve mandar (o jogo junta aqui e a sessão envia). */
  drain() {
    const p = this.pend;
    this.pend = [];
    return p;
  }

  // ---------------------------------------------------------------- tacada
  private fire() {
    const sp = Math.max(0.04, Math.min(1, this.pow));
    const v = sp * sp * 0.35 + sp * 0.65; // mais controle nas tacadas fracas
    const vx = Math.round(Math.cos(this.aimA) * v * MAX_SPEED * 1000) / 1000;
    const vy = Math.round(Math.sin(this.aimA) * v * MAX_SPEED * 1000) / 1000;
    const c = this.cue();
    const cue: [number, number] = [c.x, c.y];
    this.pow = 0;
    this.charging = false;
    if (this.role === "guest") {
      this.waiting = true;
      this.pend.push({ t: "shot", vx, vy, cue });
      return;
    }
    this.start(vx, vy, cue);
  }

  /** Começa a tacada (anfitrião/sozinho na hora; convidado quando chega o "go"). */
  private start(vx: number, vy: number, cue: [number, number], state?: ([number, number] | null)[]) {
    if (state) this.sim.load(state);
    const c = this.cue();
    c.in = false;
    c.x = cue[0];
    c.y = cue[1];
    const before = this.sim.pack();
    this.shotId++;
    if (this.role === "host") this.pend.push({ t: "go", vx, vy, cue, b: before, id: this.shotId });
    this.sim.shoot(vx, vy);
    this.lastShotAt = Date.now();
    this.inHand = 0;
    this.placing = false;
    this.msg = "";
    this.waiting = false;
    if (this.role !== "guest") this.onTable?.({ balls: before, shot: { id: this.shotId, b: before, vx, vy } });
  }

  // ---------------------------------------------------------------- regras (anfitrião e treino)
  private resolve() {
    const r = this.sim.res;
    const me = this.turn;
    const other = 1 - me;
    const solo = this.role === "solo";
    const brk = this.isBreak;
    this.isBreak = false;
    this.shots++;
    const g = this.groups[me];
    const remainingMine = (gg: Group) => this.sim.balls.filter((b) => !b.in && inGroup(b.n, gg)).length;
    const eight = r.pocketed.includes(8);

    if (solo) {
      if (r.cueIn) {
        this.inHand = 2;
        this.sim.spot(0, HEAD_X, H / 2);
        this.msg = "Branca na caçapa: coloque onde quiser.";
      } else this.msg = r.pocketed.length ? `Encaçapou ${r.pocketed.length > 1 ? r.pocketed.length + " bolas" : "a " + r.pocketed[0]}!` : "";
      if (eight && this.sim.balls.some((b) => b.n !== 0 && b.n !== 8 && !b.in)) {
        this.sim.spot(8, W * 0.7, H / 2);
        this.msg = "A 8 é a última: voltou para a mesa.";
      }
      if (this.sim.balls.every((b) => b.n === 0 || b.in)) {
        this.win = 0;
        this.winText = `Mesa limpa em ${this.shots} tacadas!`;
      }
      return;
    }

    // bola 8
    if (eight) {
      if (brk) {
        this.sim.spot(8, W * 0.7, H / 2);
      } else {
        const cleared = g !== null && remainingMine(g) === 0;
        const legal = cleared && !r.cueIn && r.firstHit === 8;
        this.win = legal ? me : other;
        this.winText = legal ? "encaçapou a 8" : r.cueIn ? "a branca caiu junto com a 8" : !cleared ? "a 8 caiu antes da hora" : "não bateu primeiro na 8";
        return;
      }
    }

    // falta?
    let foul = "";
    if (r.cueIn) foul = "Branca na caçapa";
    else if (r.firstHit === null) foul = "Não acertou nenhuma bola";
    else if (g && !(inGroup(r.firstHit, g) || (r.firstHit === 8 && remainingMine(g) === 0))) foul = `Bateu primeiro na bola errada (${r.firstHit})`;
    else if (!g && r.firstHit === 8 && !brk) foul = "Bateu primeiro na 8";

    // define lisas/listradas na primeira bola encaçapada sem falta
    if (!foul && !g) {
      const first = r.pocketed.find((n) => n !== 8);
      if (first !== undefined) {
        const mineG: Group = isSolid(first) ? "lisas" : "listradas";
        this.groups[me] = mineG;
        this.groups[other] = mineG === "lisas" ? "listradas" : "lisas";
      }
    }
    const g2 = this.groups[me];
    const madeOwn = r.pocketed.some((n) => n !== 8 && (g2 ? inGroup(n, g2) : true));

    if (foul) {
      this.turn = other;
      this.inHand = 2;
      if (r.cueIn) this.sim.spot(0, HEAD_X, H / 2);
      this.msg = `${foul}. Bola na mão para o adversário.`;
    } else if (madeOwn) {
      this.msg = g === null && g2 ? `Encaçapou! Você ficou com as ${g2}. Joga de novo.` : "Encaçapou! Joga de novo.";
    } else {
      this.turn = other;
      this.msg = brk ? "Saída feita. Vez do adversário." : "";
    }
  }

  // ---------------------------------------------------------------- loop
  step(dt: number) {
    const was = this.sim.moving;
    const ev = this.sim.step(dt);
    let sfx: "hit" | "pocket" | null = null;
    if (ev.pocket) sfx = "pocket";
    else if (ev.hit > 0.03 || ev.rail > 0.08) sfx = "hit";
    if (was && !this.sim.moving) {
      if (this.role !== "guest") {
        this.resolve();
        if (this.role === "host") this.pend.push(this.snapshot());
        this.onTable?.({ balls: this.sim.pack() });
      }
    }
    // mira compartilhada (o outro vê o meu taco)
    if (this.role !== "solo" && this.myTurn() && !this.sim.moving) {
      const now = performance.now();
      const key = `${this.aimA.toFixed(3)}|${this.pow.toFixed(2)}`;
      if (key !== this.aimSent && now - this.aimSentAt > 70) {
        this.aimSent = key;
        this.aimSentAt = now;
        const c = this.cue();
        this.pend.push({ t: "aim", a: Math.round(this.aimA * 1000) / 1000, p: Math.round(this.pow * 100) / 100, c: [Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10] });
      }
    }
    return sfx;
  }

  // ---------------------------------------------------------------- entrada
  pointer(p: { x: number; y: number }, kind: "move" | "down" | "up") {
    this.hover = p;
    const can = this.myTurn() && !this.sim.moving && !this.waiting && this.win === null;
    if (!can) return null;
    const c = this.cue();
    const canPlace = this.inHand > 0;
    if (kind === "down") {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      // bola na mão: clicar na branca arrasta ela
      if (canPlace && dx * dx + dy * dy < (PR + 6) * (PR + 6)) {
        this.placing = true;
        return null;
      }
      this.charging = true;
      this.chargeFrom = { ...p };
      this.pow = 0;
      return null;
    }
    if (kind === "move") {
      if (this.placing) {
        const x = Math.max(PM + PR, Math.min((this.inHand === 1 ? HEAD_X : W - PM - PR), p.x));
        const y = Math.max(PM + PR, Math.min(H - PM - PR, p.y));
        if (this.sim.free(x, y)) (c.x = x), (c.y = y);
        return null;
      }
      if (this.charging && this.chargeFrom) {
        // puxa para trás (para longe da direção da mira) para dar força
        const back = -((p.x - this.chargeFrom.x) * Math.cos(this.aimA) + (p.y - this.chargeFrom.y) * Math.sin(this.aimA));
        this.pow = Math.max(0, Math.min(1, back / 150));
        return null;
      }
      this.aimA = Math.atan2(p.y - c.y, p.x - c.x);
      return null;
    }
    // up
    if (this.placing) {
      this.placing = false;
      return null;
    }
    if (this.charging) {
      this.charging = false;
      if (this.pow < 0.04) {
        this.pow = 0;
        return null;
      }
      this.fire();
    }
    return null;
  }

  key(dir: number, down: boolean) {
    if (!down || !this.myTurn() || this.sim.moving) return;
    this.aimA += dir * 0.004;
  }
  /** Teclas extras da sinuca: ← → giram a mira, espaço carrega e solta. */
  keyEx(e: KeyboardEvent): boolean {
    if (!this.myTurn() || this.sim.moving || this.waiting || this.win !== null) return false;
    const fine = e.shiftKey ? 0.002 : 0.012;
    if (e.type === "keydown" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      this.aimA += e.key === "ArrowLeft" ? -fine : fine;
      return true;
    }
    if (e.key === " ") {
      if (e.type === "keydown") {
        this.charging = true;
        this.chargeFrom = null;
        this.pow = Math.min(1, this.pow + 0.035);
      } else if (this.charging) {
        this.charging = false;
        if (this.pow >= 0.04) this.fire();
      }
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- rede
  snapshot() {
    return { t: "st", b: this.sim.pack(), turn: this.turn, g: this.groups, h: this.inHand, msg: this.msg, brk: this.isBreak, win: this.win, wt: this.winText, shots: this.shots };
  }
  input() {
    return null;
  }
  remote(m: any) {
    if (m.t === "aim") {
      this.otherAim = { a: Number(m.a) || 0, p: Number(m.p) || 0, at: performance.now() };
      if (Array.isArray(m.c) && !this.sim.moving && this.inHand) {
        const c = this.cue();
        c.x = Number(m.c[0]) || c.x;
        c.y = Number(m.c[1]) || c.y;
      }
      return;
    }
    if (this.role === "host" && m.t === "shot") {
      if (this.turn !== 1 || this.sim.moving || this.win !== null) return;
      const cue = Array.isArray(m.cue) ? ([Number(m.cue[0]), Number(m.cue[1])] as [number, number]) : ([this.cue().x, this.cue().y] as [number, number]);
      // posição da branca só pode mudar com bola na mão
      const c = this.cue();
      const ok = this.inHand > 0 && this.sim.free(cue[0], cue[1]) && (this.inHand === 2 || cue[0] <= HEAD_X + 0.01);
      const vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, Number(m.vx) || 0));
      const vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, Number(m.vy) || 0));
      this.start(vx, vy, ok ? cue : [c.x, c.y]);
      this.otherAim = null;
      this.lastShotAt = Date.now();
      return;
    }
    if (this.role === "guest" && m.t === "go") {
      this.start(Number(m.vx), Number(m.vy), m.cue, m.b);
      this.otherAim = null;
      return;
    }
    if (this.role === "guest" && m.t === "st") {
      // estado oficial depois da tacada (corrige qualquer diferença mínima)
      if (this.sim.moving) this.sim.finish();
      this.sim.load(m.b);
      this.turn = m.turn;
      this.groups = m.g;
      this.inHand = m.h;
      this.msg = m.msg;
      this.isBreak = m.brk;
      this.win = m.win;
      this.winText = m.wt ?? "";
      this.shots = m.shots ?? 0;
      this.waiting = false;
    }
  }
  /** Estado completo para quem acabou de entrar no jogo (convidado). */
  hello() {
    return this.snapshot();
  }
  winner() {
    if (this.sim.moving) return null;
    return this.win;
  }
  scoreText() {
    return this.winText;
  }
  takeSfx() {
    const s = this.evSfx;
    this.evSfx = null;
    return s;
  }
  header(n: [string, string]) {
    const left = (i: number) => {
      const g = this.groups[i];
      if (!g) return "";
      const rest = this.sim.balls.filter((b) => !b.in && inGroup(b.n, g)).length;
      return `<small>${g} · ${rest ? rest + " na mesa" : "falta a 8"}</small>`;
    };
    if (this.role === "solo") {
      const inn = this.sim.balls.filter((b) => b.n && b.in).length;
      return `<span>Treino</span><b>${inn}/15</b><span>${this.shots} tacadas</span>`;
    }
    const t = (i: number) => (this.turn === i && this.win === null ? ' class="turn"' : "");
    return `<span${t(0)}>${esc(n[0])}${left(0)}</span><b>${this.turn === this.mine ? "Sua vez" : "Vez do outro"}</b><span${t(1)}>${esc(n[1])}${left(1)}</span>`;
  }

  // ---------------------------------------------------------------- desenho
  draw(g: CanvasRenderingContext2D) {
    drawTable(g);
    const now = performance.now();
    const balls = this.sim.balls;
    // sombra + bolas
    for (const b of balls) if (!b.in) drawBall(g, b.x, b.y, b.n);
    const c = this.cue();
    const mineNow = this.myTurn() && !this.sim.moving && !this.waiting && this.win === null && !c.in;
    // bola na mão: realce
    if (mineNow && this.inHand) {
      g.strokeStyle = "rgba(200,245,1,.9)";
      g.lineWidth = 2;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.arc(c.x, c.y, PR + 5, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      if (this.inHand === 1) {
        g.strokeStyle = "rgba(255,255,255,.25)";
        g.beginPath();
        g.moveTo(HEAD_X, PM);
        g.lineTo(HEAD_X, H - PM);
        g.stroke();
      }
    }
    if (mineNow && !this.placing) {
      this.drawGuide(g, c, this.aimA);
      drawCue(g, c.x, c.y, this.aimA, this.pow, 1);
      // força
      if (this.charging || this.pow > 0) drawPower(g, this.pow);
    } else if (!this.sim.moving && this.otherAim && now - this.otherAim.at < 4000 && !c.in && this.win === null) {
      drawCue(g, c.x, c.y, this.otherAim.a, this.otherAim.p, 0.55);
    } else if (this.sim.moving && Date.now() - this.lastShotAt < 260) {
      // taco voltando depois de bater
      const k = (Date.now() - this.lastShotAt) / 260;
      const a = this.aimA;
      drawCue(g, c.x - Math.cos(a) * 30 * k, c.y - Math.sin(a) * 30 * k, a, 0, 1 - k);
    }
    if (this.waiting) msgBar(g, "Tacando...");
    else if (this.msg && !this.sim.moving) msgBar(g, this.msg);
    else if (!this.sim.moving && this.win === null && this.role !== "solo") msgBar(g, this.myTurn() ? (this.inHand ? "Sua vez: arraste a branca, mire e puxe para trás" : "Sua vez: mire com o mouse, clique e puxe para trás") : "Vez do adversário");
  }

  /** Linha de mira até a primeira bola/tabela, com a bola fantasma e para onde a bola vai. */
  private drawGuide(g: CanvasRenderingContext2D, c: PBall, a: number) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = Infinity;
    let hit: PBall | null = null;
    for (const b of this.sim.balls) {
      if (b.in || b.n === 0) continue;
      // interseção do raio com o círculo de raio 2R em volta da bola
      const fx = c.x - b.x;
      const fy = c.y - b.y;
      const B = fx * dx + fy * dy;
      const C = fx * fx + fy * fy - 4 * PR * PR;
      const disc = B * B - C;
      if (disc < 0) continue;
      const t = -B - Math.sqrt(disc);
      if (t > 0 && t < best) (best = t), (hit = b);
    }
    // tabela
    const tx = dx > 0 ? (W - PM - PR - c.x) / dx : dx < 0 ? (PM + PR - c.x) / dx : Infinity;
    const ty = dy > 0 ? (H - PM - PR - c.y) / dy : dy < 0 ? (PM + PR - c.y) / dy : Infinity;
    const wall = Math.min(tx, ty);
    const t = Math.min(best, wall);
    const ex = c.x + dx * t;
    const ey = c.y + dy * t;
    g.strokeStyle = "rgba(255,255,255,.6)";
    g.lineWidth = 1.2;
    g.setLineDash([5, 5]);
    g.beginPath();
    g.moveTo(c.x, c.y);
    g.lineTo(ex, ey);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = "rgba(255,255,255,.75)";
    g.beginPath();
    g.arc(ex, ey, PR, 0, Math.PI * 2);
    g.stroke();
    if (hit && best <= wall) {
      // direção da bola acertada (linha dos centros)
      const nx = (hit.x - ex) / (2 * PR);
      const ny = (hit.y - ey) / (2 * PR);
      g.strokeStyle = "rgba(200,245,1,.85)";
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(hit.x, hit.y);
      g.lineTo(hit.x + nx * 70, hit.y + ny * 70);
      g.stroke();
      // e para onde a branca desvia (perpendicular)
      const dot = dx * nx + dy * ny;
      const px = dx - dot * nx;
      const py = dy - dot * ny;
      const pl = Math.sqrt(px * px + py * py);
      if (pl > 0.05) {
        g.strokeStyle = "rgba(255,255,255,.35)";
        g.beginPath();
        g.moveTo(ex, ey);
        g.lineTo(ex + (px / pl) * 40 * pl, ey + (py / pl) * 40 * pl);
        g.stroke();
      }
    }
  }
}

function drawTable(g: CanvasRenderingContext2D) {
  // madeira
  const wood = g.createLinearGradient(0, 0, 0, H);
  wood.addColorStop(0, "#6b4024");
  wood.addColorStop(1, "#4a2a16");
  g.fillStyle = wood;
  roundRect(g, 0, 0, W, H, 18);
  g.fill();
  // tabelas (borracha)
  g.fillStyle = "#1b6b40";
  g.fillRect(PM - 12, PM - 12, W - 2 * (PM - 12), H - 2 * (PM - 12));
  // pano
  const felt = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.6);
  felt.addColorStop(0, "#2a9a5c");
  felt.addColorStop(1, "#1d7c47");
  g.fillStyle = felt;
  g.fillRect(PM, PM, W - 2 * PM, H - 2 * PM);
  // diamantes
  g.fillStyle = "#e8dcc0";
  for (let i = 1; i < 8; i++) {
    if (i === 4) continue;
    const x = PM + ((W - 2 * PM) * i) / 8;
    g.fillRect(x - 1.5, 10, 3, 3);
    g.fillRect(x - 1.5, H - 13, 3, 3);
  }
  for (let i = 1; i < 4; i++) {
    const y = PM + ((H - 2 * PM) * i) / 4;
    g.fillRect(10, y - 1.5, 3, 3);
    g.fillRect(W - 13, y - 1.5, 3, 3);
  }
  // marca da saída e ponto do triângulo
  g.strokeStyle = "rgba(255,255,255,.12)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(HEAD_X, PM);
  g.lineTo(HEAD_X, H - PM);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,.25)";
  g.beginPath();
  g.arc(W * 0.7, H / 2, 1.6, 0, Math.PI * 2);
  g.fill();
  // caçapas
  for (const [px, py, pr] of POCKETS) {
    g.fillStyle = "#0a0a0a";
    g.beginPath();
    g.arc(px, py, pr + 1, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#2b1a0e";
    g.lineWidth = 3;
    g.stroke();
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawBall(g: CanvasRenderingContext2D, x: number, y: number, n: number) {
  g.fillStyle = "rgba(0,0,0,.28)";
  g.beginPath();
  g.ellipse(x + 2, y + 3, PR, PR * 0.9, 0, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(x, y, PR, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = isStripe(n) ? "#f6f3ea" : ballColor(n);
  g.fillRect(x - PR, y - PR, PR * 2, PR * 2);
  if (isStripe(n)) {
    g.fillStyle = ballColor(n);
    g.fillRect(x - PR, y - PR * 0.55, PR * 2, PR * 1.1);
  }
  // sombreado
  const sh = g.createRadialGradient(x - PR * 0.35, y - PR * 0.4, 1, x, y, PR * 1.1);
  sh.addColorStop(0, "rgba(255,255,255,.55)");
  sh.addColorStop(0.35, "rgba(255,255,255,0)");
  sh.addColorStop(1, "rgba(0,0,0,.35)");
  g.fillStyle = sh;
  g.fillRect(x - PR, y - PR, PR * 2, PR * 2);
  g.restore();
  if (n) {
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(x, y, PR * 0.46, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#111";
    g.font = "700 6px Montserrat, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(n), x, y + 0.3);
    g.textBaseline = "alphabetic";
  }
}

function drawCue(g: CanvasRenderingContext2D, cx: number, cy: number, a: number, pow: number, alpha: number) {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const gap = PR + 4 + pow * 46;
  const len = 250;
  g.save();
  g.globalAlpha = alpha;
  g.lineCap = "round";
  // sombra
  g.strokeStyle = "rgba(0,0,0,.3)";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(cx - ca * gap + 3, cy - sa * gap + 4);
  g.lineTo(cx - ca * (gap + len) + 3, cy - sa * (gap + len) + 4);
  g.stroke();
  // madeira clara -> escura
  const grad = g.createLinearGradient(cx - ca * gap, cy - sa * gap, cx - ca * (gap + len), cy - sa * (gap + len));
  grad.addColorStop(0, "#f1e2c2");
  grad.addColorStop(0.03, "#2a6fb0");
  grad.addColorStop(0.05, "#e9cf98");
  grad.addColorStop(0.62, "#c99556");
  grad.addColorStop(0.66, "#1a1a1a");
  grad.addColorStop(1, "#3a2414");
  g.strokeStyle = grad;
  g.lineWidth = 4.5;
  g.beginPath();
  g.moveTo(cx - ca * gap, cy - sa * gap);
  g.lineTo(cx - ca * (gap + len), cy - sa * (gap + len));
  g.stroke();
  g.restore();
}

function drawPower(g: CanvasRenderingContext2D, p: number) {
  const x = W - 16;
  const y0 = PM + 10;
  const h = H - 2 * PM - 20;
  g.fillStyle = "rgba(0,0,0,.45)";
  roundRect(g, x - 4, y0, 8, h, 4);
  g.fill();
  const col = p < 0.5 ? "#C8F501" : p < 0.8 ? "#f2c230" : "#e0502e";
  g.fillStyle = col;
  roundRect(g, x - 4, y0 + h * (1 - p), 8, h * p, 4);
  g.fill();
}

function msgBar(g: CanvasRenderingContext2D, text: string) {
  g.font = "600 11px Montserrat, sans-serif";
  const w = Math.min(W - 40, g.measureText(text).width + 24);
  g.fillStyle = "rgba(13,13,13,.62)";
  roundRect(g, W / 2 - w / 2, H - PM + 6, w, 18, 9);
  g.fill();
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.fillText(text, W / 2, H - PM + 19);
}
