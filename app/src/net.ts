type Handler = (m: any) => void;

/** Conexão WebSocket com o servidor de presença, com reconexão automática. */
export class Net {
  private ws?: WebSocket;
  private handlers = new Map<string, Handler[]>();
  private closedByUser = false;
  private pingTimer?: number;
  private retry = 0;

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
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify(this.join()));
      this.emit("open", {});
      this.pingTimer = window.setInterval(() => this.send({ t: "ping" }), 20000);
    };
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        this.emit(m.t, m);
      } catch {
        /* ignora */
      }
    };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      this.emit("close", {});
      if (!this.closedByUser) {
        const wait = Math.min(10000, 800 * 2 ** this.retry++);
        setTimeout(() => this.connect(), wait);
      }
    };
  }

  send(m: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close() {
    this.closedByUser = true;
    this.ws?.close();
  }
}
