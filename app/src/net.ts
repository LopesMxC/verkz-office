type Handler = (m: any) => void;

/** Conexão WebSocket com o servidor de presença, com reconexão automática. */
export class Net {
  private ws?: WebSocket;
  private handlers = new Map<string, Handler[]>();
  private closedByUser = false;
  private pingTimer?: number;
  private retryTimer?: number;
  private retry = 0;
  /** Último sinal do servidor: conexão "aberta" mas muda (troca de Wi-Fi, notebook acordando) é refeita. */
  private lastSeen = 0;

  constructor(private url: string, private join: () => object) {}

  on(t: string, h: Handler) {
    const l = this.handlers.get(t) ?? [];
    l.push(h);
    this.handlers.set(t, l);
  }

  private emit(t: string, m: any) {
    this.handlers.get(t)?.forEach((h) => h(m));
  }

  connect() {
    this.closedByUser = false;
    this.open();
  }

  private open() {
    clearTimeout(this.retryTimer);
    // saiu (Sair) enquanto esperava para reconectar: não entra de novo sozinho
    if (this.closedByUser) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify(this.join()));
      this.emit("open", {});
      this.lastSeen = Date.now();
      clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => {
        // 50 s sem nada do servidor (ele responde o ping): a conexão morreu sem avisar
        if (Date.now() - this.lastSeen > 50_000) return ws.close();
        this.send({ t: "ping" });
      }, 20000);
    };
    ws.onmessage = (ev) => {
      this.lastSeen = Date.now();
      try {
        const m = JSON.parse(ev.data);
        this.emit(m.t, m);
      } catch {
        /* ignora */
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return; // conexão antiga
      clearInterval(this.pingTimer);
      this.emit("close", {});
      if (!this.closedByUser) {
        const wait = Math.min(10000, 800 * 2 ** this.retry++);
        this.retryTimer = window.setTimeout(() => this.open(), wait);
      }
    };
  }

  send(m: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close() {
    this.closedByUser = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    this.ws?.close();
  }
}
