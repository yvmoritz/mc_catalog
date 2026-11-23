// Server-Sent Events: je Mandant eine Menge offener Verbindungen.
export class Hub {
  constructor() { this.clients = new Map(); }
  add(key, res) {
    if (!this.clients.has(key)) this.clients.set(key, new Set());
    this.clients.get(key).add(res);
  }
  remove(key, res) { this.clients.get(key)?.delete(res); }
  publish(key, event) {
    const set = this.clients.get(key);
    if (!set) return;
    const msg = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of set) { try { res.write(msg); } catch { set.delete(res); } }
  }
  ping() {
    for (const set of this.clients.values()) for (const res of set) { try { res.write(': ping\n\n'); } catch { set.delete(res); } }
  }
}
