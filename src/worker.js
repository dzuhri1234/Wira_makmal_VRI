// Wira Makmal VRI · server main bersama
// - Fail game (public/index.html) dihidangkan terus oleh Cloudflare Static Assets.
// - /ws      : WebSocket ke satu "bilik" (Durable Object) yang kongsi posisi avatar & reaksi.
// - /api/ping: game guna ini untuk tahu server main bersama wujud.
// Papan markah disimpan dalam SQLite di dalam Durable Object yang sama.
import { DurableObject } from "cloudflare:workers";

const ROOM_NAME = "vri-ipoh";
const MAX_PLAYERS = 60;       // sambungan serentak maksimum
const MAX_MSG = 2000;         // saiz mesej maksimum (aksara)
const MAX_PER_SEC = 30;       // had mesej sesaat bagi setiap pemain
const MAX_ROWS = 500;         // had baris papan markah
const MAX_WEEK = 5000;        // markah seminggu tertinggi yang diterima (elak markah palsu melampau)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ping") {
      return Response.json({ wm: 1 }, { headers: { "cache-control": "no-store" } });
    }
    if (url.pathname === "/api/admin") {
      // Pilihan: urus papan markah. Tetapkan dulu: npx wrangler secret put ADMIN_KEY
      if (!env.ADMIN_KEY) return new Response("Admin tidak diaktifkan", { status: 404 });
      if (url.searchParams.get("key") !== env.ADMIN_KEY) return new Response("Kunci salah", { status: 403 });
      const stub = env.ROOM.get(env.ROOM.idFromName(ROOM_NAME));
      const q = new URLSearchParams({ padam: url.searchParams.get("padam") || "" });
      return stub.fetch("https://bilik/admin?" + q.toString());
    }
    if (url.pathname === "/ws") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return new Response("Origin tidak dibenarkan", { status: 403 });
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Perlu WebSocket", { status: 426 });
      const stub = env.ROOM.get(env.ROOM.idFromName(ROOM_NAME));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

const clean = (s, n = 18) =>
  typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, "").trim().slice(0, n) : "";
const int = (v, max = 100000) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS skor (
      pid TEXT PRIMARY KEY, kh TEXT NOT NULL, nm TEXT,
      pm INTEGER, pps INTEGER, bintang INTEGER, apc INTEGER, minggu INTEGER, t INTEGER)`);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/admin") {
      const padam = url.searchParams.get("padam") || "";
      if (padam === "semua") this.sql.exec("DELETE FROM skor");
      else if (padam) this.sql.exec("DELETE FROM skor WHERE pid = ?", padam);
      if (padam) this.broadcast({ t: "lb", rows: this.board() });
      return Response.json({ pemain_online: this.ctx.getWebSockets().length, papan_markah: this.board() });
    }
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Perlu WebSocket", { status: 426 });
    if (this.ctx.getWebSockets().length >= MAX_PLAYERS) return new Response("Bilik penuh", { status: 503 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const id = crypto.randomUUID().slice(0, 8);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, p: null, w: Date.now(), n: 0 });
    const peers = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === server) continue;
      const a = ws.deserializeAttachment();
      if (a && a.p) peers.push({ id: a.id, p: a.p });
    }
    server.send(JSON.stringify({ t: "hello", id, peers, lb: this.board() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > MAX_MSG) return;
    const a = ws.deserializeAttachment() || { id: "?", p: null, w: 0, n: 0 };
    const now = Date.now();
    if (now - a.w > 1000) { a.w = now; a.n = 0; }
    a.n++;
    if (a.n > MAX_PER_SEC) { ws.serializeAttachment(a); return; }
    let m;
    try { m = JSON.parse(message); } catch { ws.serializeAttachment(a); return; }
    if (!m || typeof m !== "object") { ws.serializeAttachment(a); return; }

    if (m.t === "p" && m.p && typeof m.p === "object" && !Array.isArray(m.p)) {
      a.p = m.p;
      ws.serializeAttachment(a);
      this.broadcast({ t: "p", id: a.id, p: m.p }, ws);
    } else if (m.t === "skor") {
      ws.serializeAttachment(a);
      if (await this.saveScore(m)) this.broadcast({ t: "lb", rows: this.board() });
    } else if (m.t === "lb") {
      ws.serializeAttachment(a);
      ws.send(JSON.stringify({ t: "lb", rows: this.board() }));
    } else {
      ws.serializeAttachment(a);
    }
  }

  async webSocketClose(ws, code, reason) {
    this.leave(ws);
    try { ws.close(code, reason); } catch {}
  }

  async webSocketError(ws) {
    this.leave(ws);
  }

  leave(ws) {
    const a = ws.deserializeAttachment();
    if (a) this.broadcast({ t: "left", id: a.id }, ws);
  }

  broadcast(obj, except) {
    const text = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(text); } catch {}
    }
  }

  board() {
    return this.sql
      .exec("SELECT pid AS id, nm, pm, pps, bintang, apc, minggu FROM skor ORDER BY t DESC LIMIT 300")
      .toArray();
  }

  // Setiap pemain ada id rawak + kunci rahsia (disimpan dalam pelayar mereka).
  // Baris markah hanya boleh dikemas kini oleh pemilik kunci yang sama.
  async saveScore(m) {
    const pid = typeof m.pid === "string" ? m.pid : "";
    const key = typeof m.key === "string" ? m.key : "";
    if (!/^[a-z0-9]{12,32}$/.test(pid) || !/^[a-z0-9]{24,64}$/.test(key)) return false;
    const kh = await sha256(key);
    const old = this.sql.exec("SELECT kh FROM skor WHERE pid = ?", pid).toArray()[0];
    if (old && old.kh !== kh) return false;
    if (!old) {
      const n = this.sql.exec("SELECT COUNT(*) AS n FROM skor").one().n;
      if (n >= MAX_ROWS) return false;
    }
    this.sql.exec(
      `INSERT INTO skor (pid, kh, nm, pm, pps, bintang, apc, minggu, t) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(pid) DO UPDATE SET nm = excluded.nm, pm = excluded.pm, pps = excluded.pps,
         bintang = excluded.bintang, apc = excluded.apc, minggu = excluded.minggu, t = excluded.t`,
      pid, kh, clean(m.nm) || "Pemain", int(m.pm, MAX_WEEK), int(m.pps, MAX_WEEK), int(m.bintang, 10000), int(m.apc, 1000), int(m.minggu, 100000), Date.now()
    );
    return true;
  }
}
