// Worker tests: run the real Worker code against an in-memory Durable Object.  node tests/worker.test.mjs
import worker from "../tools/twstock-worker.js";
import { Daily, Guard } from "../tools/worker/do.js";

const mem = () => { const m = new Map(); return { storage: { get: async k => m.get(k), put: async (k, v) => { m.set(k, v); }, delete: async k => m.delete(k), list: async () => new Map(m) } }; };
const ns = cls => { const inst = new cls(mem()); return { idFromName: n => n, get: () => ({ fetch: (u, init) => inst.fetch(new Request(u, init)) }) }; };
const env = { DAILY: ns(Daily), GUARD: ns(Guard) };
const ORIGIN = "https://si70531.github.io";
const call = (path, init = {}, origin = ORIGIN) => worker.fetch(new Request("https://w.example" + path, { ...init, headers: { ...(origin ? { Origin: origin } : {}), ...(init.headers || {}) } }), env, { waitUntil() {} });
let fail = 0;
const t = async (name, fn) => { try { await fn(); console.log("ok   " + name); } catch (e) { fail++; console.log("FAIL " + name + " - " + (e && e.message)); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || "expected"}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };

await t("a page on another site is refused", async () => eq((await call("/tw/sync", { method: "POST", body: "{}" }, "https://evil.example")).status, 403));
await t("unknown path is a 404", async () => eq((await call("/nope")).status, 404));
await t("preflight allows the guard header", async () => { const r = await call("/tw/sync", { method: "OPTIONS" }); if (!/X-TW/.test(r.headers.get("Access-Control-Allow-Headers") || "")) throw new Error("X-TW not allowed"); });
await t("sync refuses a request without the guard header", async () => eq((await call("/tw/sync", { method: "POST", body: JSON.stringify({ set: {} }) })).status, 403));
const sync = body => call("/tw/sync", { method: "POST", headers: { "X-TW": "1" }, body: JSON.stringify(body) }).then(r => r.json());
await t("sync stores a value and returns it", async () => { const r = await sync({ set: { "twtrade-watch": { v: ["2330"], t: 1 } } }); eq(r.data["twtrade-watch"].v, ["2330"]); });
await t("sync: the newer write wins, an older one is ignored", async () => {
  await sync({ set: { "twtrade-watch": { v: ["2330", "0050"], t: 5 } } });
  const r = await sync({ set: { "twtrade-watch": { v: ["9999"], t: 2 } } });
  eq(r.data["twtrade-watch"].v, ["2330", "0050"]);
});
await t("sync refuses keys that are not the owner's data", async () => { const r = await sync({ set: { "evil-key": { v: 1, t: 9 }, "twh:2330:202610": { v: 1, t: 9 } } }); if ("evil-key" in r.data || "twh:2330:202610" in r.data) throw new Error("accepted"); });
await t("sync keeps the overwritten value", async () => {
  await sync({ set: { "twlab-hold": { v: [1], t: 10 } } }); await sync({ set: { "twlab-hold": { v: [2], t: 11 } } });
  const prev = (await (await env.DAILY.get().fetch("https://daily/kv", { method: "POST", body: JSON.stringify({ k: "syncprev" }) })).json()).v;
  eq(prev["twlab-hold"].map(x => x.v), [[1]]);
});
await t("undo brings back the value that was overwritten", async () => {
  const r = await sync({ undo: 1 }); eq(r.data["twlab-hold"].v, [1]);
});
await t("page errors are logged and counted", async () => {
  const post = b => call("/tw/err", { method: "POST", body: JSON.stringify(b) });
  await post({ m: "boom", w: "app.js:1" }); await post({ m: "boom", w: "app.js:1" });
  const log = (await (await call("/tw/err")).json()).log; eq([log.length, log[0].n], [1, 2]);
});
await t("close summary route answers", async () => { const r = await call("/tw/close"); if (r.status >= 500) throw new Error("status " + r.status); });
await t("every data route says plainly why when its source is down (no fake data, no crash)", async () => {
  const real = globalThis.fetch; globalThis.fetch = async () => { throw new Error("network down"); };
  try {
    for (const p of ["/tw/world", "/tw/instrank", "/tw/daytrade", "/tw/lending", "/tw/qfii", "/tw/futchip", "/tw/holders?c=2330", "/tw/sectorhist", "/tw/margintop", "/tw/hist?c=2330", "/tw/chart?k=t00&r=tick"]) {
      const r = await call(p), j = await r.json();
      if (r.status < 400 || !j.error || !j.error.message) throw new Error(p + " -> " + r.status + " " + JSON.stringify(j).slice(0, 80));
    }
    const rt = await (await call("/tw/rt?c=2330")).json();
    if (rt.q.length || !rt.err) throw new Error("rt invented quotes or hid the reason");
  } finally { globalThis.fetch = real; }
});
console.log(fail ? `${fail} failed` : "all passed"); process.exit(fail ? 1 : 0);
