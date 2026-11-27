import { callGemini } from "./ai.js";
import { AI_DAY, AI_HOUR, TW_HOSTS } from "./core.js";
import { twToday } from "./data.js";


export class AsiaRelay {
  async fetch(req) {
    const b = await req.json().catch(() => null);
    if (!b || !TW_HOSTS.includes(new URL(b.url).hostname)) return new Response("bad target", { status: 400 });
    const r = await fetch(b.url, { method: b.method, headers: b.headers, body: b.method === "GET" ? undefined : b.body });
    return new Response(r.body, { status: r.status, headers: { "Content-Type": r.headers.get("Content-Type") || "application/json" } });
  }
}
/* Durable Object that makes the Gemini call from North America (see wrangler.toml for the binding) */
export class GeminiRelay {
  constructor(state, env) { this.env = env; }
  async fetch(req) {
    const target = decodeURIComponent(new URL(req.url).pathname.slice(1));
    if (!target.startsWith("https://generativelanguage.googleapis.com/")) return new Response("bad target", { status: 400 });
    if (req.method === "GET") return fetch(target, { headers: { "x-goog-api-key": this.env.GEMINI_KEY } });
    return callGemini(this.env, target, await req.text());
  }
}

/* AI calls per key (an IP address, or the whole site for manual pre-market notes): a running count per hour and per day */
export async function guard(env, key, op, body) {
  if (!env.GUARD) return { blocked: false };
  const r = await env.GUARD.get(env.GUARD.idFromName(key)).fetch("https://guard/" + op, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  return r.json();
}
export class Guard {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const op = new URL(req.url).pathname.slice(1), now = Date.now();
    if (op === "aiget" || op === "aiput") {
      const b = await req.json().catch(() => ({})), code = String(b.code || ""), day = twToday();
      if (!/^[0-9A-Z]{4,6}$/.test(code)) return Response.json({});
      if (op === "aiget") { const v = await this.state.storage.get("a:" + code); return Response.json(v && v.day === day ? { hit: v.data } : {}); }
      const old = await this.state.storage.list({ prefix: "a:" });
      const stale = [...old].filter(([, v]) => !v || v.day !== day).map(([k]) => k);
      if (stale.length) await this.state.storage.delete(stale.slice(0, 128));
      await this.state.storage.put("a:" + code, { day, data: b.data });
      return Response.json({ ok: true });
    }
    const d = (await this.state.storage.get("d")) || {};
    const hr = Math.floor(now / 3600000), day = Math.floor(now / 86400000);
    if (!d.ai || d.ai.hr !== hr) d.ai = { hr, n: 0, day: d.ai && d.ai.day === day ? d.ai.day : day, dn: d.ai && d.ai.day === day ? d.ai.dn : 0 };
    if (d.ai.day !== day) { d.ai.day = day; d.ai.dn = 0; }
    let blocked = false, aiWait = 0;
    if (op === "ai") {
      const lim = await req.json().catch(() => ({})), maxHr = lim.hr || AI_HOUR, maxDay = lim.day || AI_DAY;
      if (d.ai.n >= maxHr) { blocked = true; aiWait = Math.ceil(((hr + 1) * 3600000 - now) / 1000); }
      else if (d.ai.dn >= maxDay) { blocked = true; aiWait = Math.ceil(((day + 1) * 86400000 - now) / 1000); }
      else { d.ai.n++; d.ai.dn++; }
    }
    await this.state.storage.put("d", d);
    return Response.json({ blocked, aiWait });
  }
}
/* kept only because the deployed Worker already has this Durable Object class; nothing writes to it any more */
export class ErrLog {
  constructor(state) { this.state = state; }
  async fetch() { return Response.json({ errors: [] }); }
}

/* ---------- TWstock daily pre-market note ---------- */
/* the stored note and the Telegram chat it goes to live in one Durable Object ("daily") */
export async function pmStore(env, op, body) {
  if (!env.DAILY) return { note: null };
  const r = await env.DAILY.get(env.DAILY.idFromName("daily")).fetch("https://daily/" + op, { method: "POST", body: JSON.stringify(body || {}) });
  return r.json();
}
export class Daily {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const op = new URL(req.url).pathname.slice(1), st = this.state.storage, b = await req.json().catch(() => ({}));
    /* each note kind keeps its newest note under its own key and a short list of older ones without their data:
       one value may hold at most 128 KiB, and ten full notes in one list grew past that, so the newest note was never saved */
    const KIND = { put: "hist", cput: "close", mput: "mid", wput: "week" }, GETK = { cget: "close", mget: "mid", wget: "week" };
    if (KIND[op]) {
      const k = KIND[op], old = (await st.get("last:" + k)) || ((await st.get(k)) || [])[0] || null;
      const slim = x => x && { at: x.at, day: x.day, call: x.analysis && x.analysis.call };
      const h = ((await st.get("list:" + k)) || []).filter(Boolean);
      if (old) h.unshift(slim(old));
      try { await st.put("last:" + k, b.note); await st.put("list:" + k, h.slice(0, 14)); } catch (e) { return Response.json({ ok: false, error: String(e && e.message || e) }); }
      if (await st.get(k)) await st.delete(k);
      return Response.json({ ok: true });
    }
    if (GETK[op]) return Response.json({ note: (await st.get("last:" + GETK[op])) || ((await st.get(GETK[op])) || [])[0] || null });
    if (op === "kv") { if (b.set !== undefined) await st.put("kv:" + b.k, b.set); return Response.json({ v: (await st.get("kv:" + b.k)) || null }); }
    if (op === "flags") { const was = (await st.get("flags")) || {}; if (b.set) await st.put("flags", b.set); return Response.json(was); }
    if (op === "chat") { if (b.set) await st.put("chat", b.set); return Response.json({ chat: (await st.get("chat")) || null, offset: (await st.get("off")) || 0 }); }
    if (op === "off") { await st.put("off", b.off || 0); return Response.json({ ok: true }); }
    /* the alert list belongs to the first device that sent one (the site owner); other devices are ignored.
       "ownerDev", not the old "owner" (which held an account id from when the site had accounts) */
    if (op === "watch") {
      const owner = await st.get("ownerDev");
      if (owner && owner !== b.who) return Response.json({ ok: false, owner: false });
      await st.put("ownerDev", b.who); await st.put("wl", { watch: b.watch, hold: b.hold, opt: b.opt || {}, at: Date.now() });
      return Response.json({ ok: true, owner: true, opt: b.opt || {}, n: new Set([...b.watch, ...b.hold]).size });
    }
    if (op === "wl") return Response.json((await st.get("wl")) || { watch: [], hold: [] });
    if (op === "bell") { const k = "bell:" + b.kind, was = await st.get(k); if (was === b.day) return Response.json({ first: false }); await st.put(k, b.day); return Response.json({ first: true }); }
    if (op === "state") { if (b.set) await st.put("al", b.set); return Response.json((await st.get("al")) || {}); }
    const last = (await st.get("last:hist")) || ((await st.get("hist")) || [])[0] || null, list = (await st.get("list:hist")) || ((await st.get("hist")) || []).slice(1).map(x => ({ at: x.at, day: x.day, call: x.analysis && x.analysis.call }));
    return Response.json({ note: last, history: list.slice(0, 6) });
  }
}