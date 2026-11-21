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
    this.el.className = "modal-bg game-bg";
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
    (this.el.querySelector(".game-help") as HTMLElement).textContent =
      o.kind === "pong"
        ? "Mexa o mouse (ou ↑ ↓) para mover a sua raquete. Quem fizer 7 pontos primeiro ganha."
        : "Clique e arraste a partir da bola branca, puxando para trás, e solte para tacar. Encaçapou, joga de novo.";
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
      const shot = this.game.pointer(pos(e), "up");
      if (shot && this.o.role === "guest") this.o.send({ t: "shot", ...shot });
    });
    this.keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") this.quit();
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
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.over) {
      const ev = this.game.step(dt);
      if (ev) this.o.sfx?.(ev);
      // anfitrião manda o estado; convidado manda a raquete
      this.sendAcc += dt;
      if (this.sendAcc > 0.05 && this.o.role !== "solo") {
        this.sendAcc = 0;
        const m = this.o.role === "host" ? this.game.snapshot() : this.game.input();
        if (m) this.o.send(m);
      }
      const win = this.game.winner();
      if (win !== null && this.o.role !== "guest") {
        const text = `${this.names[win]} venceu! ${this.game.scoreText()}`;
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
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  n: number; // 0 = branca
  in: boolean;
}
const R = 9;
const M = 26; // borda (tabelas)
const POCKETS = [
  [M - 4, M - 4],
  [W / 2, M - 8],
  [W - M + 4, M - 4],
  [M - 4, H - M + 4],
  [W / 2, H - M + 8],
  [W - M + 4, H - M + 4],
];
const COLORS = ["#f7f5ef", "#f2c14e", "#3b6fc0", "#c0392b", "#8a6cc9", "#e67e22", "#27ae60", "#7b2d26", "#111111", "#f2c14e"];

class Pool implements Game {
  private balls: Ball[] = [];
  private turn = 0;
  private score = [0, 0];
  private moving = false;
  private shotBy = 0;
  private pocketedThisShot = 0;
  private cueIn = false;
  private aim: { x: number; y: number } | null = null;
  private dragging = false;
  private msg = "";

  constructor(private role: Role, private mine: number) {
    this.rack();
  }

  private rack() {
    this.balls = [{ x: W * 0.25, y: H / 2, vx: 0, vy: 0, n: 0, in: false }];
    let n = 1;
    for (let col = 0; col < 4; col++)
      for (let r = 0; r <= col; r++) {
        if (n > 9) break;
        this.balls.push({ x: W * 0.68 + col * R * 1.8, y: H / 2 + (r - col / 2) * R * 2.05, vx: 0, vy: 0, n: n++, in: false });
      }
  }

  private myTurn() {
    return this.role === "solo" || this.turn === this.mine;
  }

  private shoot(a: number, p: number) {
    const cue = this.balls[0];
    const sp = Math.max(0, Math.min(1, p)) * 980;
    cue.vx = Math.cos(a) * sp;
    cue.vy = Math.sin(a) * sp;
    this.moving = true;
    this.shotBy = this.turn;
    this.pocketedThisShot = 0;
    this.cueIn = false;
  }

  step(dt: number) {
    if (this.role === "guest") return null;
    if (!this.moving) return null;
    let ev: "hit" | "pocket" | null = null;
    // sub-passos para as bolas não atravessarem umas às outras
    const sub = 4;
    const h = dt / sub;
    for (let k = 0; k < sub; k++) {
      for (const b of this.balls) {
        if (b.in) continue;
        b.x += b.vx * h;
        b.y += b.vy * h;
        const f = Math.pow(0.55, h); // atrito do pano
        b.vx *= f;
        b.vy *= f;
        if (Math.hypot(b.vx, b.vy) < 6) b.vx = b.vy = 0;
        // caçapas
        for (const [px, py] of POCKETS) {
          if (Math.hypot(b.x - px, b.y - py) < 17) {
            b.in = true;
            b.vx = b.vy = 0;
            if (b.n === 0) this.cueIn = true;
            else {
              this.pocketedThisShot++;
              this.score[this.shotBy]++;
            }
            ev = "pocket";
          }
        }
        if (b.in) continue;
        // tabelas
        if (b.x < M + R) (b.x = M + R), (b.vx = Math.abs(b.vx) * 0.8);
        if (b.x > W - M - R) (b.x = W - M - R), (b.vx = -Math.abs(b.vx) * 0.8);
        if (b.y < M + R) (b.y = M + R), (b.vy = Math.abs(b.vy) * 0.8);
        if (b.y > H - M - R) (b.y = H - M - R), (b.vy = -Math.abs(b.vy) * 0.8);
      }
      // colisões entre bolas (mesma massa, choque elástico)
      for (let i = 0; i < this.balls.length; i++)
        for (let j = i + 1; j < this.balls.length; j++) {
          const a = this.balls[i];
          const b = this.balls[j];
          if (a.in || b.in) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d > 0 && d < R * 2) {
            const nx = dx / d;
            const ny = dy / d;
            const overlap = R * 2 - d;
            a.x -= (nx * overlap) / 2;
            a.y -= (ny * overlap) / 2;
            b.x += (nx * overlap) / 2;
            b.y += (ny * overlap) / 2;
            const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
            if (rel > 0) {
              a.vx -= rel * nx * 0.96;
              a.vy -= rel * ny * 0.96;
              b.vx += rel * nx * 0.96;
              b.vy += rel * ny * 0.96;
              if (rel > 60 && !ev) ev = "hit";
            }
          }
        }
    }
    if (this.balls.every((b) => b.in || (b.vx === 0 && b.vy === 0))) {
      this.moving = false;
      // fim da tacada: encaçapou (sem a branca) joga de novo; senão passa a vez
      if (this.cueIn) {
        const cue = this.balls[0];
        Object.assign(cue, { x: W * 0.25, y: H / 2, vx: 0, vy: 0, in: false });
        this.msg = "Bola branca na caçapa: passa a vez";
        if (this.role !== "solo") this.turn = 1 - this.turn;
      } else if (this.pocketedThisShot > 0) this.msg = "Encaçapou! Joga de novo";
      else {
        this.msg = "";
        if (this.role !== "solo") this.turn = 1 - this.turn;
      }
    }
    return ev;
  }

  draw(g: CanvasRenderingContext2D) {
    g.fillStyle = "#5a3820";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#1f7a4a";
    g.fillRect(M - 8, M - 8, W - 2 * (M - 8), H - 2 * (M - 8));
    g.fillStyle = "#23894f";
    g.fillRect(M, M, W - 2 * M, H - 2 * M);
    g.fillStyle = "#0c0c0c";
    for (const [px, py] of POCKETS) {
      g.beginPath();
      g.arc(px, py, 15, 0, Math.PI * 2);
      g.fill();
    }
    for (const b of this.balls) {
      if (b.in) continue;
      g.fillStyle = "rgba(0,0,0,.25)";
      g.beginPath();
      g.arc(b.x + 2, b.y + 3, R, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = COLORS[b.n] ?? "#ddd";
      g.beginPath();
      g.arc(b.x, b.y, R, 0, Math.PI * 2);
      g.fill();
      if (b.n === 9) {
        g.fillStyle = "#f7f5ef";
        g.fillRect(b.x - R, b.y - 3, R * 2, 6);
      }
      if (b.n) {
        g.fillStyle = "#fff";
        g.beginPath();
        g.arc(b.x, b.y, 4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#111";
        g.font = "bold 6px Montserrat, sans-serif";
        g.textAlign = "center";
        g.fillText(String(b.n), b.x, b.y + 2);
      }
    }
    // mira (só na minha vez, com as bolas paradas)
    const cue = this.balls[0];
    if (this.aim && this.dragging && !this.moving && this.myTurn() && !cue.in) {
      const dx = cue.x - this.aim.x;
      const dy = cue.y - this.aim.y;
      const p = Math.min(1, Math.hypot(dx, dy) / 160);
      const a = Math.atan2(dy, dx);
      g.strokeStyle = "rgba(255,255,255,.55)";
      g.setLineDash([4, 6]);
      g.beginPath();
      g.moveTo(cue.x, cue.y);
      g.lineTo(cue.x + Math.cos(a) * 260, cue.y + Math.sin(a) * 260);
      g.stroke();
      g.setLineDash([]);
      // taco
      g.strokeStyle = "#d9b27a";
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(cue.x - Math.cos(a) * (14 + p * 50), cue.y - Math.sin(a) * (14 + p * 50));
      g.lineTo(cue.x - Math.cos(a) * (200 + p * 50), cue.y - Math.sin(a) * (200 + p * 50));
      g.stroke();
      g.lineWidth = 1;
      // força
      g.fillStyle = "rgba(0,0,0,.4)";
      g.fillRect(W / 2 - 60, H - 16, 120, 8);
      g.fillStyle = "#C8F501";
      g.fillRect(W / 2 - 60, H - 16, 120 * p, 8);
    }
    if (this.msg && !this.moving) {
      g.fillStyle = "rgba(0,0,0,.45)";
      g.fillRect(W / 2 - 150, 4, 300, 18);
      g.fillStyle = "#fff";
      g.font = "600 11px Montserrat, sans-serif";
      g.textAlign = "center";
      g.fillText(this.msg, W / 2, 17);
    }
  }

  pointer(p: { x: number; y: number }, kind: "move" | "down" | "up") {
    if (this.moving || !this.myTurn()) return null;
    const cue = this.balls[0];
    if (kind === "down") {
      this.dragging = true;
      this.aim = p;
    } else if (kind === "move" && this.dragging) this.aim = p;
    else if (kind === "up" && this.dragging) {
      this.dragging = false;
      const dx = cue.x - p.x;
      const dy = cue.y - p.y;
      const pw = Math.min(1, Math.hypot(dx, dy) / 160);
      this.aim = null;
      if (pw < 0.05) return null;
      const a = Math.atan2(dy, dx);
      if (this.role === "guest") return { a, p: pw };
      this.shoot(a, pw);
    }
    return null;
  }
  key() {}
  snapshot() {
    return {
      t: "st",
      b: this.balls.map((b) => (b.in ? 0 : [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10])),
      turn: this.turn,
      s: this.score,
      mv: this.moving,
      msg: this.msg,
    };
  }
  input() {
    return null; // na sinuca o convidado só manda a tacada
  }
  remote(m: any) {
    if (m.t === "shot" && this.role === "host" && this.turn === 1 && !this.moving) this.shoot(Number(m.a), Number(m.p));
    if (m.t === "st" && this.role === "guest") {
      (m.b as any[]).forEach((v, i) => {
        const b = this.balls[i];
        if (!b) return;
        if (v === 0) b.in = true;
        else (b.in = false), (b.x = v[0]), (b.y = v[1]);
      });
      this.turn = m.turn;
      this.score = m.s;
      this.moving = m.mv;
      this.msg = m.msg;
    }
  }
  winner() {
    if (!this.balls.slice(1).every((b) => b.in) || this.moving) return null;
    if (this.role === "solo") return 0;
    return this.score[0] >= this.score[1] ? 0 : 1;
  }
  scoreText() {
    return this.role === "solo" ? `${this.score[0]} bolas encaçapadas` : `${this.score[0]} x ${this.score[1]}`;
  }
  header(n: [string, string]) {
    if (this.role === "solo") return `<span>Treino</span><b>${this.score[0]} bolas</b><span></span>`;
    const t = (i: number) => (this.turn === i ? ' class="turn"' : "");
    return `<span${t(0)}>${esc(n[0])}</span><b>${this.score[0]} x ${this.score[1]}</b><span${t(1)}>${esc(n[1])}</span>`;
  }
}
