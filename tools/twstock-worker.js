import { health, twAnalyze, twAsk } from "./worker/ai.js";
import { ALLOWED, CTX, MAX_BODY, PM_DAY, PM_HOUR } from "./worker/core.js";
import { ALERT_OPTS, CLOSE_CRON, MID_CRON, WEEK_CRON, twChart, twDayTrade, twFutChip, twHist, twHolders, twInstRank, twLending, twMargin, twMarginTop, twMis, twNewsRoute, twOpen, twOtc, twPe, twQfii, twRt, twSectorHist, twWorldRoute } from "./worker/data.js";
import { guard, pmStore } from "./worker/do.js";
import { bellNotice, closeNote, closeRetry, premarket, reviewRows, tgSend, watchTick, weekNote } from "./worker/notes.js";
export { AsiaRelay, GeminiRelay, Guard, ErrLog, Daily } from "./worker/do.js";

   /* the current request's bindings, so the data fetchers can reach the Asia relay */
export default {
  async scheduled(event, env, ctx) {
    CTX.env = env;
    if (event.cron === "* * * * *") ctx.waitUntil(Promise.all([watchTick(env, new Date(event.scheduledTime)).catch(() => {}), bellNotice(env, new Date(event.scheduledTime)).catch(() => {}), closeRetry(env, new Date(event.scheduledTime)).catch(() => {})]));
    else if (event.cron === CLOSE_CRON) ctx.waitUntil(closeNote(env, true, false));
    else if (event.cron === WEEK_CRON) ctx.waitUntil(weekNote(env, true, false).catch(() => {}));
    else if (event.cron === MID_CRON) ctx.waitUntil((async () => {
      /* no midday note on an exchange holiday: today's TAIEX quote must be from today */
      const x = (await twMis(["tse_t00.tw"]).catch(() => [])).find(r => r.c === "t00"), today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");
      if (x && x.d && x.d !== today) return;
      await premarket(env, true, true);
    })().catch(() => {}));
    else ctx.waitUntil(premarket(env, true));
  },
  async fetch(req, env) {
    CTX.env = env;
    const origin = req.headers.get("Origin") || "";
    const ok = ALLOWED.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": ok ? origin : ALLOWED[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-TW",
      "Access-Control-Expose-Headers": "Retry-After",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const json = (obj, status = 200, extra = {}) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json", ...extra } });
    const fail = (status, code, message, extra, more) => json({ error: { code: status, status: code, message, ...more } }, status, extra);

    if (req.method === "OPTIONS") return new Response(null, { status: ok ? 204 : 403, headers: cors });
    const url = new URL(req.url);
    if (url.pathname === "/health" && req.method === "GET") return json(await health(env));
    if (!ok) return fail(403, "PERMISSION_DENIED", "This service only serves " + ALLOWED.join(", "));

    /* public market data */
    if (url.pathname === "/tw/rt" && req.method === "GET") return twRt(url, json);
    if (url.pathname === "/tw/news" && req.method === "GET") return twNewsRoute(url, json, fail, env);
    if (url.pathname === "/tw/chart" && req.method === "GET") return twChart(url, json, fail);
    if (url.pathname === "/tw/otc" && req.method === "GET") return twOtc(json, fail);
    if (url.pathname === "/tw/hist" && req.method === "GET") return twHist(url, json, fail);
    if (url.pathname === "/tw/premarket" && req.method === "GET") return json(await pmStore(env, "get"), 200, { "Cache-Control": "no-store" });
    if (url.pathname === "/tw/midday" && req.method === "GET") return json(await pmStore(env, "mget"), 200, { "Cache-Control": "no-store" });
    if (url.pathname === "/tw/close" && req.method === "GET") return json(await pmStore(env, "cget"), 200, { "Cache-Control": "no-store" });
    if (url.pathname === "/tw/week" && req.method === "GET") return json(await pmStore(env, "wget"), 200, { "Cache-Control": "no-store" });
    if (url.pathname === "/tw/instrank" && req.method === "GET") return twInstRank(json, fail);
    if (url.pathname === "/tw/world" && req.method === "GET") return twWorldRoute(json, fail);
    if (url.pathname === "/tw/futchip" && req.method === "GET") return twFutChip(env, json, fail);
    if (url.pathname === "/tw/margin" && req.method === "GET") return twMargin(url, json, fail);
    if (url.pathname === "/tw/sectorhist" && req.method === "GET") return twSectorHist(json, fail);
    if (url.pathname === "/tw/margintop" && req.method === "GET") return twMarginTop(json, fail);
    if (url.pathname === "/tw/daytrade" && req.method === "GET") return twDayTrade(json, fail);
    if (url.pathname === "/tw/lending" && req.method === "GET") return twLending(json, fail);
    if (url.pathname === "/tw/qfii" && req.method === "GET") return twQfii(json, fail);
    if (url.pathname === "/tw/review" && req.method === "GET") return json({ rows: await reviewRows(env) }, 200, { "Cache-Control": "no-store" });
    if (url.pathname === "/tw/holders" && req.method === "GET") return twHolders(url, json, fail);
    if (url.pathname === "/tw/pe" && req.method === "GET") return twPe(url, json, fail);
    if (url.pathname === "/tw/open" && req.method === "GET") return twOpen(url, json, fail);

    /* everything below: no sign-in; the page's random device id (d) and the caller's IP address */
    let bodyText = null, dev = "";
    if (req.method === "POST") {
      bodyText = await req.text();
      if (bodyText.length > MAX_BODY) return fail(413, "TOO_BIG", "Request too large");
      try { const b = JSON.parse(bodyText); if (b && /^[0-9a-f]{32}$/.test(String(b.d || ""))) dev = b.d; } catch (e) {}
    }
    const ip = req.headers.get("CF-Connecting-IP") || "unknown";
    const who = dev ? "d" + dev : "ip" + ip;

    if (url.pathname === "/tw/analyze" && req.method === "POST") return twAnalyze(env, who, ip, bodyText, json, fail);
    if (url.pathname === "/tw/ask" && req.method === "POST") return twAsk(env, ip, bodyText, json, fail);
    if (url.pathname === "/tw/week/run" && req.method === "POST") {
      const q = await guard(env, "pmrun", "ai", { hr: PM_HOUR, day: PM_DAY });
      if (q.blocked) return fail(429, "RESOURCE_EXHAUSTED", "Limit reached; try again later", { "Retry-After": String(q.aiWait || 60) });
      const r = await weekNote(env, true, true);
      return r.error ? (r.daily ? fail(429, "AI_DAILY", r.error) : fail(502, "AI_FAILED", r.error)) : json(r);
    }
    /* the owner's own data (holdings, cash, trades, events, alerts, watchlists) shared by every device: last write per key wins. No login: anyone who calls this can read and change it. */
    if (url.pathname === "/tw/sync" && req.method === "POST") {
      let b; try { b = JSON.parse(bodyText); } catch (e) { return fail(400, "BAD_JSON", "Body is not JSON"); }
      const ALLOW = { has: k => /^tw[\w.:-]{1,40}$/.test(k) && !/^(twh:|twinst-|twdash-m-|twlog-|twstock-device|tw-sync)/.test(k) };
      const cur = ((await pmStore(env, "kv", { k: "sync" })).v) || {}; let ch = false;
      if (req.headers.get("X-TW") !== "1") return fail(403, "PERMISSION_DENIED", "Missing header");
      const prevs = ((await pmStore(env, "kv", { k: "syncprev" })).v) || {};
      for (const [k, x] of Object.entries(b.set || {})) { if (!ALLOW.has(k) || !x || typeof x.t !== "number" || x.v === undefined) continue; if (!cur[k] || x.t > cur[k].t) { if (cur[k] && JSON.stringify(cur[k].v) !== JSON.stringify(x.v)) { prevs[k] = (prevs[k] || []).concat([cur[k]]).slice(-3); } cur[k] = { v: x.v, t: x.t }; ch = true; } }
      if (b.undo) { for (const k of Object.keys(prevs)) { const last = (prevs[k] || []).pop(); if (last && ALLOW.has(k)) { cur[k] = { v: last.v, t: Date.now() }; ch = true; } } await pmStore(env, "kv", { k: "syncprev", set: prevs }); }
      else if (ch) await pmStore(env, "kv", { k: "syncprev", set: prevs });
      if (ch) { if (JSON.stringify(cur).length > 400000) return fail(413, "TOO_BIG", "Too much data to sync"); await pmStore(env, "kv", { k: "sync", set: cur }); }
      return json({ data: cur }, 200, { "Cache-Control": "no-store" });
    }
    /* script errors from the page, so a broken control is seen without anyone having to report it (the last 60, newest last) */
    if (url.pathname === "/tw/err" && req.method === "POST") {
      let b; try { b = JSON.parse(bodyText); } catch (e) { return fail(400, "BAD_JSON", "Body is not JSON"); }
      const log = ((await pmStore(env, "kv", { k: "errlog" })).v) || [];
      const m = String(b.m || "").slice(0, 200), w = String(b.w || "").slice(0, 120);
      const hit = log.find(x => x.m === m && x.w === w); if (hit) { hit.n++; hit.t = Date.now(); } else { log.push({ m, w, n: 1, t: Date.now(), ua: String(b.ua || "").slice(0, 80) }); try { await tgSend(env, "網站出現新的錯誤：" + m.replace(/[<>&]/g, "") + "（" + w.replace(/[<>&]/g, "") + "）"); } catch (e) {} }
      await pmStore(env, "kv", { k: "errlog", set: log.slice(-60) }); return json({ ok: 1 });
    }
    if (url.pathname === "/tw/err" && req.method === "GET") return json({ log: ((await pmStore(env, "kv", { k: "errlog" })).v) || [] }, 200, { "Cache-Control": "no-store" });
    if (url.pathname === "/tw/alerts/sync" && req.method === "POST") {
      let b; try { b = JSON.parse(bodyText); } catch (e) { return fail(400, "BAD_JSON", "Body is not JSON"); }
      if (!dev) return fail(400, "BAD_DEVICE", "No device id");
      const clean = a => [...new Set((Array.isArray(a) ? a : []).map(v => String(v).trim()).filter(v => /^[0-9A-Z]{4,6}$/.test(v)))].slice(0, 60);
      const opt = {}; ALERT_OPTS.forEach(k => { if (b.opt && b.opt[k] === false) opt[k] = false; });
      return json(await pmStore(env, "watch", { who, watch: clean(b.watch), hold: clean(b.hold), opt }));
    }
    if (url.pathname === "/tw/premarket/run" && req.method === "POST") {
      const q = await guard(env, "pmrun", "ai", { hr: PM_HOUR, day: PM_DAY });
      if (q.blocked) return fail(429, "RESOURCE_EXHAUSTED", "Limit reached; try again later", { "Retry-After": String(q.aiWait || 60) });
      const r = await premarket(env, true);   /* a manual run is also sent to Telegram (useful as a test) */
      return r.error ? (r.daily ? fail(429, "AI_DAILY", r.error) : fail(502, "AI_FAILED", r.error)) : json(r);
    }
    if (url.pathname === "/tw/midday/run" && req.method === "POST") {
      /* only while the day session is open: weekdays 09:00–13:30 Taipei, and not on an exchange holiday (today's TAIEX quote must be from today) */
      const t = new Date(Date.now() + 8 * 3600e3), m = t.getUTCHours() * 60 + t.getUTCMinutes(), wd = t.getUTCDay();
      if (wd < 1 || wd > 5 || m < 9 * 60 || m > 13 * 60 + 30) return fail(409, "MARKET_CLOSED", "非開盤時間，盤中無法分析");
      const x = (await twMis(["tse_t00.tw"]).catch(() => [])).find(r => r.c === "t00");
      if (x && x.d && x.d !== t.toISOString().slice(0, 10).replace(/-/g, "")) return fail(409, "MARKET_CLOSED", "今天沒有開盤，不做盤中分析");
      const q = await guard(env, "pmrun", "ai", { hr: PM_HOUR, day: PM_DAY });
      if (q.blocked) return fail(429, "RESOURCE_EXHAUSTED", "Limit reached; try again later", { "Retry-After": String(q.aiWait || 60) });
      const r = await premarket(env, true, true);
      return r.error ? (r.daily ? fail(429, "AI_DAILY", r.error) : fail(502, "AI_FAILED", r.error)) : json(r);
    }
    if (url.pathname === "/tw/close/run" && req.method === "POST") {   /* no button on the site any more (the summary is written after the close); kept for testing */
      const q = await guard(env, "pmrun", "ai", { hr: PM_HOUR, day: PM_DAY });
      if (q.blocked) return fail(429, "RESOURCE_EXHAUSTED", "Limit reached; try again later", { "Retry-After": String(q.aiWait || 60) });
      const r = await closeNote(env, true, true);
      return r.error ? (r.daily ? fail(429, "AI_DAILY", r.error) : fail(502, "AI_FAILED", r.error)) : json(r);
    }
    return fail(404, "NOT_FOUND", "Unknown path");
  },
};