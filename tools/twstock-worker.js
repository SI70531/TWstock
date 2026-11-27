/* TWstock Worker (Cloudflare, name "twstock-ai"): the server side of https://si70531.github.io/TWstock/.
   No accounts: the AI calls are limited per IP address, and the page sends a random device id (d) that keys
   today's saved analyses and the alert list.
     GET  /tw/rt?c=2330,2317&idx=1   intraday quotes (TWSE market information system, Yahoo Finance when that refuses)
     GET  /tw/news?c=2330&n=台積電    news headlines and the company's material announcements
     GET  /tw/premarket              the latest pre-market note
     POST /tw/analyze {d, code, name, facts}   the AI analyst team (one AI call)
     POST /tw/alerts/sync {d, watch, hold}     the codes the trading-hours alerts watch (the first device that syncs owns the list)
     POST /tw/premarket/run                    write a pre-market note now (one AI call, a few per hour for the whole site)
     GET  /tw/close                  the latest close summary
     POST /tw/close/run                        write a close summary now (shares the pre-market limit)
     cron 05:30 Taipei on trading-day mornings: the pre-market note, sent to Telegram.
     GET  /tw/midday                 the latest midday note (tomorrow's open, written during today's session)
     POST /tw/midday/run                       write a midday note now (shares the pre-market limit)
     cron 13:00 Taipei on trading days: the midday note for the next session, sent to Telegram.
     cron 15:30 Taipei on trading days: the AI close summary (and the owner's stocks newly on the attention / disposition lists), sent to Telegram.
     GET  /tw/instrank               today's (or the latest) institutional net buying / selling ranking from TWSE T86
     POST /tw/ask {d, code, name, q, facts}    one question about one stock, answered by the AI from the page's numbers and headlines
     GET  /tw/week                   the latest weekly review; POST /tw/week/run writes one now (shares the pre-market limit)
     cron 09:00 Taipei on Saturdays: the weekly review of the market, sent to Telegram.
     GET  /tw/world                  US indices, SOX, FX, oil, US 10-year yield (Yahoo Finance)
     GET  /tw/futchip                TAIFEX: net open interest of the TAIEX future by foreign investors / trusts / dealers (and a short history)
     GET  /tw/margin?c=2330          margin / short balances of one stock, the last ~8 trading days (TWSE MI_MARGN)
     GET  /tw/holders?c=2330         shareholding distribution of one stock (TDCC weekly open data)
     GET  /tw/pe?c=2330&m=24         daily P/E, yield, P/B of one stock over the last m months (TWSE BWIBBU)
     GET  /tw/daytrade               day-trading volume per stock, latest day (TWSE TWTB4U)
     GET  /tw/lending                securities-lending short balance per stock and its change (TWSE TWT93U)
     GET  /tw/qfii                   foreign holding ratio per stock and its change over ~5 trading days (TWSE MI_QFIIS)
     GET  /health                    does GEMINI_KEY work
   Secrets: GEMINI_KEY, TG_TOKEN (Telegram bot). Deployed by .github/workflows/worker.yml with tools/wrangler.toml.
   Google does not offer Gemini in Hong Kong, so the Gemini call goes through the GeminiRelay Durable Object in North America. */
const ALLOWED = ["https://si70531.github.io"];
const MAX_BODY = 60000;
const MODELS = ["gemini-3.8-flash", "gemini-3-flash-preview", "gemini-3.5-flash-lite", "gemini-flash-latest", "gemini-flash-lite-latest"];   /* the free tier has no 2.5 quota any more: its 429 "PerDay, limit 0" looked like the daily cap was used up */
const AI_HOUR = 30, AI_DAY = 200;        /* AI calls per IP address */
const PM_HOUR = 4, PM_DAY = 12;          /* manual pre-market notes for the whole site (each one also goes to Telegram) */

let ENV = null;   /* the current request's bindings, so the data fetchers can reach the Asia relay */
export default {
  async scheduled(event, env, ctx) {
    ENV = env;
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
    ENV = env;
    const origin = req.headers.get("Origin") || "";
    const ok = ALLOWED.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": ok ? origin : ALLOWED[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
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
      for (const [k, x] of Object.entries(b.set || {})) { if (!ALLOW.has(k) || !x || typeof x.t !== "number" || x.v === undefined) continue; if (!cur[k] || x.t > cur[k].t) { cur[k] = { v: x.v, t: x.t }; ch = true; } }
      if (ch) { if (JSON.stringify(cur).length > 400000) return fail(413, "TOO_BIG", "Too much data to sync"); await pmStore(env, "kv", { k: "sync", set: cur }); }
      return json({ data: cur }, 200, { "Cache-Control": "no-store" });
    }
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

/* ---------- TWstock (/tw/*) ---------- */
const TW_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const twCache = new Map();
/* a short memory per Worker instance, so many open pages do not each hit TWSE */
async function twCached(key, ms, make) {
  const hit = twCache.get(key);
  if (hit && hit.until > Date.now()) return hit.v;
  const v = await make();
  if (twCache.size > 300) twCache.clear();
  twCache.set(key, { v, until: Date.now() + ms });
  return v;
}
const twNum = v => { const n = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
const twClip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
/* TWSE market information system: one request carries many symbols (tse_2330.tw|tse_t00.tw|…) */
/* TWSE and TAIFEX often refuse servers in the US (where this Worker runs), so their requests go out from a Durable Object
   placed in Asia (locationHint "apac"); when that fails, the request is made directly */
const TW_HOSTS = ["mis.twse.com.tw", "www.twse.com.tw", "openapi.twse.com.tw", "mis.taifex.com.tw", "openapi.taifex.com.tw", "www.tpex.org.tw", "openapi.tdcc.com.tw"];
async function twFetch(url, init) {
  init = init || {};
  if (ENV && ENV.ASIA && TW_HOSTS.includes(new URL(url).hostname)) {
    try {
      const r = await ENV.ASIA.get(ENV.ASIA.idFromName("tw-relay-asia"), { locationHint: "apac" }).fetch("https://relay/", { method: "POST", body: JSON.stringify({ url, method: init.method || "GET", headers: init.headers || {}, body: init.body || null }) });
      if (r.ok) return r;
    } catch (e) {}
  }
  return fetch(url, init);
}
export class AsiaRelay {
  async fetch(req) {
    const b = await req.json().catch(() => null);
    if (!b || !TW_HOSTS.includes(new URL(b.url).hostname)) return new Response("bad target", { status: 400 });
    const r = await fetch(b.url, { method: b.method, headers: b.headers, body: b.method === "GET" ? undefined : b.body });
    return new Response(r.body, { status: r.status, headers: { "Content-Type": r.headers.get("Content-Type") || "application/json" } });
  }
}
async function twMis(chs) {
  const r = await twFetch("https://mis.twse.com.tw/stock/api/getStockInfo.jsp?json=1&delay=0&ex_ch=" + encodeURIComponent(chs.join("|")) + "&_=" + Date.now(),
    { headers: { "User-Agent": TW_UA, Accept: "application/json, text/plain, */*", Referer: "https://mis.twse.com.tw/stock/fibest.jsp?lang=zh_tw" } });
  if (!r.ok) throw new Error("MIS " + r.status);
  const j = await r.json();
  const first = v => { const n = twNum(String(v == null ? "" : v).split("_")[0]); return n > 0 ? n : null; };
  return (Array.isArray(j.msgArray) ? j.msgArray : []).map(x => {
    let z = twNum(x.z);                                   /* "-" when nothing traded in this snapshot: take the best bid or ask */
    if (!(z > 0)) z = first(x.b) || first(x.a) || null;
    return { c: String(x.c || ""), n: String(x.n || ""), z, y: twNum(x.y), o: twNum(x.o), h: twNum(x.h), l: twNum(x.l), v: twNum(x.v), tm: String(x.t || ""), d: String(x.d || "") };
  }).filter(x => x.c);
}
/* front-month TAIEX futures: the futures exchange's live quote list, or its daily report when that fails */
async function twFut(cid = "TXF") {
  /* day session 08:45–13:45, night session 15:00–05:00 (Taipei). TAIFEX's own quote list often refuses Cloudflare,
     so Yahoo Taiwan and cnyes (both carry the front-month TAIEX future, night session included) are tried next */
  const t = new Date(Date.now() + 8 * 3600e3), m = t.getUTCHours() * 60 + t.getUTCMinutes();
  const night = m >= 15 * 60 || m < 5 * 60 + 5, day = m >= 8 * 60 + 45 && m < 13 * 60 + 45;
  const tag = (o, live) => Object.assign(o, { src: live ? (night ? "night" : "rt") : "eod", sess: night || m < 8 * 60 + 45 ? "夜盤" : "日盤" });
  const why = [];   /* what each source said, so the page can show why there is no quote */
  for (const mt of night ? ["1"] : ["0", "1"]) {
    for (const direct of [false, true]) {
      try {
        const init = { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": TW_UA, Referer: "https://mis.taifex.com.tw/futures/" },
          body: JSON.stringify({ MarketType: mt, SymbolType: "F", KindID: "1", CID: cid, ExpireMonth: "", RowSize: "全部", PageNo: "", SortColumn: "", AscDesc: "A" }) };
        const r = direct ? await fetch("https://mis.taifex.com.tw/futures/api/getQuoteList", init) : await twFetch("https://mis.taifex.com.tw/futures/api/getQuoteList", init);
        const j = await r.json(), list = (j && j.RtData && j.RtData.QuoteList) || [];
        const q = list.find(x => new RegExp("^" + cid + "[A-Z]\\d-[FM]$").test(String(x.SymbolID || "")) && twNum(x.CLastPrice) > 0);
        if (q) {
          const tt = String(q.CTime || "").replace(/\D/g, "");
          return tag({ n: twClip(q.DispCName || "臺指期", 20), z: twNum(q.CLastPrice), y: twNum(q.CRefPrice), o: twNum(q.COpenPrice), h: twNum(q.CHighPrice), l: twNum(q.CLowPrice), v: twNum(q.CTotalVolume),
            tm: tt.length >= 6 ? tt.slice(0, 2) + ":" + tt.slice(2, 4) + ":" + tt.slice(4, 6) : "", via: "taifex" }, mt === "1" ? night : day);
        }
        why.push("期交所" + (direct ? "直連" : "") + (mt === "1" ? "夜盤" : "日盤") + "沒有" + cid + "報價（" + list.length + " 筆）");
      } catch (e) { why.push("期交所" + (direct ? "直連" : "") + "連不上（" + twClip(e && e.message, 40) + "）"); }
    }
  }
  const ysym = cid === "TXF" ? "WTX%26" : "WTE%26", nm = cid === "TXF" ? "臺指期" : "電子期";
  try {
    const r = await fetch("https://tw.stock.yahoo.com/_td-stock/api/resource/StockServices.stockList;fields=avgPrice;symbols=" + ysym, { headers: { "User-Agent": TW_UA, Accept: "application/json" } });
    const x = (await r.json())[0], raw = k => (x && x[k] && x[k].raw != null ? twNum(x[k].raw) : null);
    const lu = raw("limitUpPrice"), ld = raw("limitDownPrice");
    if (x && raw("price") > 0 && raw("price") !== lu && raw("price") !== ld) {   /* a quote sitting exactly on the limit price is Yahoo's placeholder, not a trade */
      const at = Date.parse(x.regularMarketTime || ""), tm = at ? new Date(at + 8 * 3600e3).toISOString().slice(11, 19) : "";
      return tag({ n: nm + "近一", z: raw("price"), y: raw("regularMarketPreviousClose"), o: raw("regularMarketOpen"), h: raw("regularMarketDayHigh"), l: raw("regularMarketDayLow"), v: twNum(x.volume), tm, via: "yahoo" },
        (night || day) && at && Date.now() - at < 20 * 60000);
    }
    why.push("Yahoo 沒有有效報價（" + (x ? (raw("price") > 0 ? "價格停在漲跌停價" : "價格為空") : "查無商品") + "）");
  } catch (e) { why.push("Yahoo 連不上（" + twClip(e && e.message, 40) + "）"); }
  try {
    const r = await fetch("https://ws.api.cnyes.com/ws/api/v1/quote/quotes/TWF:" + cid + ":FUTURES?column=I", { headers: { "User-Agent": TW_UA, Accept: "application/json" } });
    const x = ((await r.json()).data || [])[0];
    if (x && twNum(x["6"]) > 0) {
      const at = (+x["200007"] || 0) * 1000, tm = at ? new Date(at + 8 * 3600e3).toISOString().slice(11, 19) : "";
      return tag({ n: nm, z: twNum(x["6"]), y: twNum(x["21"]), o: twNum(x["19"]), h: twNum(x["12"]), l: twNum(x["13"]), v: twNum(x["800001"]), tm, via: "cnyes" },
        (night || day) && at && Date.now() - at < 20 * 60000);
    }
    why.push("鉅亨網沒有報價");
  } catch (e) { why.push("鉅亨網連不上（" + twClip(e && e.message, 40) + "）"); }
  try {
    const a = await (await twFetch("https://openapi.taifex.com.tw/v1/DailyMarketReportFut", { headers: { "User-Agent": TW_UA, Accept: "application/json" } })).json();
    const month = x => String(x["ContractMonth(Week)"] || "").trim();
    const x = a.find(r => String(r.Contract).trim() === (cid === "TXF" ? "TX" : "EXF") && /^\d{6}$/.test(month(r)) && !/盤後|After/i.test(String(r.TradingSession || "")) && twNum(r.Last) > 0);
    if (x) {
      const last = twNum(x.Last), chg = twNum(x.Change) || 0;
      return { src: "eod", sess: "日盤", n: nm + " " + month(x), z: last, y: last - chg, o: twNum(x.Open), h: twNum(x.High), l: twNum(x.Low), v: twNum(x.Volume), tm: "", d: String(x.Date || "") };
    }
    why.push("期交所日報表沒有" + (cid === "TXF" ? "TX" : "EXF") + "資料");
  } catch (e) { why.push("期交所日報表連不上（" + twClip(e && e.message, 40) + "）"); }
  return { z: null, why: why.join("；") };
}
async function twRt(url, json) {
  const codes = [...new Set((url.searchParams.get("c") || "").split(",").map(v => v.trim()).filter(v => /^[0-9A-Z]{4,6}$/.test(v)))].slice(0, 80);
  const out = { at: Date.now(), q: [], idx: [], fut: null };
  const jobs = [], wantIdx = url.searchParams.get("idx") === "1";
  /* the page asks every 2 seconds in the day session: the stocks and the indices go to TWSE as ONE request (kept 2 seconds),
     so each open page costs TWSE about one request every 2 seconds, as before (TWSE blocks an address that asks too often) */
  const IDX_CH = ["tse_t00.tw", "otc_o00.tw"], IDX_C = new Set(["t00", "o00"]);
  if (codes.length || wantIdx) {
    const chs = codes.flatMap(c => ["tse_" + c + ".tw", "otc_" + c + ".tw"]).concat(wantIdx ? IDX_CH : []);
    jobs.push(twCached("mis:" + codes.join(",") + (wantIdx ? "|idx" : ""), 2000, () => twMis(chs)).then(v => {
      out.q = v.filter(x => !IDX_C.has(x.c) || codes.includes(x.c));
      if (wantIdx) out.idx = v.filter(x => IDX_C.has(x.c));
    }));
  }
  if (wantIdx) { jobs.push(twCached("fut", 2000, twFut).then(v => { out.fut = v; })); jobs.push(twCached("exf", 2000, () => twFut("EXF")).then(v => { out.exf = v; })); }
  await Promise.all(jobs.map(p => p.catch(e => { out.err = twClip(e && e.message, 80); })));
  /* TWSE's MIS often refuses or answers empty to cloud servers outside Taiwan (this Worker runs in the US):
     every code still without a price is filled from Yahoo Finance (delayed a little, but the right day's price) */
  const have = new Set(out.q.filter(x => x.z > 0).map(x => x.c)), miss = codes.filter(c => !have.has(c));
  if (miss.length) {
    try {
      /* 興櫃 is not in TWSE's system at all: Yahoo Taiwan's quote list carries it (and 上市 / 上櫃 when TWSE refuses) */
      let y = await twCached("ytw:" + miss.join(","), 5000, () => twYahooTW(miss)).catch(() => []);
      const got = new Set(y.map(x => x.c)), rest = miss.filter(c => !got.has(c));
      if (rest.length) y = y.concat(await twCached("yq:" + rest.join(","), 15000, () => twYahoo(rest)).catch(() => []));
      const fromMis = out.q.filter(x => x.z > 0);
      out.q = fromMis.concat(y); if (y.length && !fromMis.length) out.src = "yahoo";   /* the banner only says "Yahoo" when TWSE gave nothing */
    }
    catch (e) { out.err = (out.err ? out.err + "; " : "") + twClip(e && e.message, 60); }
  }
  if (url.searchParams.get("idx") === "1" && !out.idx.some(x => x.c === "t00" && x.z > 0)) {
    try { const y = await twCached("yidx", 15000, () => twYahoo(["^TWII"])); y.forEach(x => { x.c = "t00"; }); out.idx = out.idx.filter(x => x.c !== "t00").concat(y); } catch (e) { /* keep the close */ }
  }
  return json(out, 200, { "Cache-Control": "no-store" });
}
/* Yahoo Finance quotes, 20 symbols per request; a code not found as listed (.TW) is tried as OTC (.TWO) */
async function twYahoo(codes) {
  const sym = c => (c.startsWith("^") ? c : c + ".TW"), out = [], tried = new Set();
  async function batch(list) {
    for (let i = 0; i < list.length; i += 20) {
      const part = list.slice(i, i + 20);
      const r = await fetch("https://query1.finance.yahoo.com/v7/finance/spark?range=1d&interval=5m&symbols=" + encodeURIComponent(part.join(",")), { headers: { "User-Agent": TW_UA, Accept: "application/json" } });
      if (!r.ok) throw new Error("Yahoo " + r.status);
      const j = await r.json();
      const rows = j && j.spark && Array.isArray(j.spark.result) ? j.spark.result.map(x => ({ s: x.symbol, d: (x.response || [])[0] || {} })) : Object.entries(j || {}).map(([s, d]) => ({ s, d: d || {} }));
      rows.forEach(({ s, d }) => {
        const m = d.meta || d, q = (d.indicators && d.indicators.quote && d.indicators.quote[0]) || {}, rawc = q.close || d.close || [], tsA = d.timestamp || m.timestamp || [], cl = rawc.filter(v => v > 0), prs = rawc.map((v, i) => [tsA[i], v]).filter(x => x[1] > 0 && x[0]);
        const z = twNum(m.regularMarketPrice) || cl[cl.length - 1] || null, y = twNum(m.previousClose) || twNum(m.chartPreviousClose);
        if (!(z > 0) || !(y > 0)) return;
        const hi = (q.high || []).filter(v => v > 0), lo = (q.low || []).filter(v => v > 0), op = (q.open || []).find(v => v > 0);
        const vs = (q.volume || []).filter(v => v > 0), t = m.regularMarketTime ? new Date((m.regularMarketTime + 8 * 3600) * 1000) : null;
        out.push({ c: String(s).replace(/^\^TWII$/, "^TWII").replace(/\.TWO?$/, ""), n: "", z, y,
          o: twNum(m.regularMarketOpen) || op || null, h: twNum(m.regularMarketDayHigh) || (hi.length ? Math.max(...hi) : null), l: twNum(m.regularMarketDayLow) || (lo.length ? Math.min(...lo) : null),
          v: twNum(m.regularMarketVolume) != null ? Math.round(m.regularMarketVolume / 1000) : vs.length ? Math.round(vs.reduce((a, b) => a + b, 0) / 1000) : null,
          tm: t ? t.toISOString().slice(11, 19) : "", d: t ? t.toISOString().slice(0, 10).replace(/-/g, "") : "" });
      });
    }
  }
  await batch(codes.map(sym)); codes.forEach(c => tried.add(c));
  const got = new Set(out.map(x => x.c)), otc = codes.filter(c => !c.startsWith("^") && !got.has(c));
  if (otc.length) { try { await batch(otc.map(c => c + ".TWO")); } catch (e) { /* listed codes already answered */ } }
  return out;
}
/* headlines from Google News (RSS search); q may carry "when:14d" to keep them recent */
/* us: the US English edition of Google News (Reuters, Bloomberg, CNBC, WSJ, AP and the rest), for US news that moves Taiwan */
async function twHeadlines(q, n, us) {
  const r = await fetch("https://news.google.com/rss/search?q=" + encodeURIComponent(q) + (us ? "&hl=en-US&gl=US&ceid=US:en" : "&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"), { headers: { "User-Agent": TW_UA } });
  if (!r.ok) return [];
  const xml = await r.text(), items = [];
  const un = v => v.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").trim();
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const g = t => { const k = m[1].match(new RegExp("<" + t + "[^>]*>([\\s\\S]*?)</" + t + ">")); return k ? un(k[1]) : ""; };
    const src = g("source"); let title = g("title");
    if (src && title.endsWith(" - " + src)) title = title.slice(0, -src.length - 3);
    const at = Date.parse(g("pubDate")) || 0;
    if (title) items.push({ t: twClip(title, 160), src: twClip(src, 40), u: g("link").slice(0, 600), at });
  }
  return items.sort((a, b) => b.at - a.at).slice(0, n);
}
/* the company's own material announcements: TWSE open data lists only today's, so each day's list is also kept (titles only, 30 days)
   in the Durable Object and merged back in. Without it most stocks show nothing: a company files a few a year. */
const twTaipeiDay = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");
async function twAnnouncements(code, env) {
  const all = await twCached("ann", 600000, async () => {
    const r = await twFetch("https://openapi.twse.com.tw/v1/opendata/t187ap04_L", { headers: { "User-Agent": TW_UA, Accept: "application/json" } });
    return r.ok ? await r.json() : [];
  });
  const pick = (o, sub) => { const k = Object.keys(o).find(x => x.includes(sub)); return k ? o[k] : ""; };
  const rows = Array.isArray(all) ? all : [], today = twTaipeiDay();
  const mine = rows.filter(x => String(pick(x, "公司代號")).trim() === code).map(x => ({ d: twClip(pick(x, "發言日期"), 12), t: twClip(pick(x, "主旨"), 200), body: twClip(pick(x, "說明"), 500) }));
  if (!env || !env.DAILY) return mine.slice(0, 6);
  try {
    if (rows.length) await twCached("annsave:" + today, 3600000, async () => {     /* once an hour at most: the whole market's titles for today */
      const map = {}; rows.forEach(x => { const c = String(pick(x, "公司代號")).trim(); if (c) (map[c] = map[c] || []).push([twClip(pick(x, "發言日期"), 12), twClip(pick(x, "主旨"), 80)]); });
      await pmStore(env, "kv", { k: "ann:" + today, set: map }); return 1;
    });
    const out = mine.slice();
    const days = []; for (let i = 1; i <= 30; i++) days.push(new Date(Date.now() + 8 * 3600e3 - i * 864e5).toISOString().slice(0, 10).replace(/-/g, ""));
    const got = await Promise.all(days.map(d => twCached("annday:" + d, 3600000, async () => (await pmStore(env, "kv", { k: "ann:" + d })).v || {}).catch(() => ({}))));
    got.forEach(m => (m[code] || []).forEach(([d, t]) => { if (!out.some(o => o.t.slice(0, 80) === t)) out.push({ d, t, body: "" }); }));
    return out.slice(0, 10);
  } catch (e) { return mine.slice(0, 6); }
}
async function twNewsRoute(url, json, fail, env) {
  const code = (url.searchParams.get("c") || "").trim(), name = twClip(url.searchParams.get("n"), 20);
  if (!/^[0-9A-Z]{4,6}$/.test(code)) return fail(400, "BAD_CODE", "Bad stock code");
  const key = "news:" + code;
  const v = await twCached(key, 300000, async () => {
    /* the company name alone finds more than name + code; widen the window and the wording until something turns up */
    const heads = async () => {
      for (const q of [(name ? '"' + name + '" ' : code + " ") + "when:30d", (name ? name + " " : "") + code + " 股票", name || code]) {
        const h = await twHeadlines(q, 12).catch(() => []); if (h.length >= 3) return h;
        if (q === name || q === code) return h;
      }
      return [];
    };
    const [news, ann] = await Promise.all([heads(), twAnnouncements(code, env).catch(() => [])]);
    return { news, ann };
  });
  if (!v.news.length && !v.ann.length) twCache.delete(key);          /* an empty answer may be a refusal from the source: ask again next time */
  return json({ at: Date.now(), ...v }, 200, { "Cache-Control": "no-store" });
}
function twPrompt(code, name, facts, news, ann, world) {
  const list = (a, f) => (a.length ? a.map(f).join("\n") : "(none found)");
  const day = t => (t ? new Date(t).toISOString().slice(0, 10) : "");
  return [
"You are a team of five analysts at a Taiwan equity research desk, writing for one private investor about a single TWSE-listed stock: " + name + " (" + code + ").",
"Write everything in Traditional Chinese as used in Taiwan. Be specific and concrete; no filler, no generic textbook lines.",
"",
"The five analysts, each with their own view:",
"1. 技術面分析師: trend, moving averages, KD / RSI / MACD, Bollinger position, volume, support and resistance.",
"2. 基本面分析師: valuation (P/E, yield, P/B), monthly revenue trend, what the business depends on.",
"3. 籌碼面分析師: foreign investors, investment trusts and dealers; what their recent buying or selling suggests.",
"4. 時事與國際分析師: the news headlines, the company's own announcements (board decisions, earnings calls, dividends, capital changes), and world events that can move this stock: US markets and Fed policy, tariffs and export controls, exchange rates, geopolitics, the industry cycle, big customers and competitors.",
"5. 風險控管: what could go wrong, position sizing and where the idea is proven wrong.",
"",
"Rules:",
"- Use ONLY the numbers in DATA. Never invent a price, ratio, date or event. If something needed is missing, say it is missing.",
"- When you rely on a headline or an announcement, name it briefly so the reader can find it. Headlines are only titles: do not claim details that a title does not state.",
"- Every price level you mention must come from DATA (moving averages, recent highs and lows, Bollinger bands, today's range) or be a simple round number near them, and you must say which one it is.",
"- Nobody can know the future price. Give the direction you think is more likely and why, with rough chances that add up to about 100%, and say plainly what would prove you wrong. Never promise a result.",
"- 'entry' is about timing: the concrete conditions under which buying makes sense (for example a close above a named level with volume above the 20-day average, or a pull-back to a named support that holds), a price zone, a stop level, and when NOT to buy. If the better choice now is to wait, say so.",
"- Be CONSERVATIVE (the user asked for this): when unsure, lean toward the smaller move, the nearer level and the lower confidence; scenario chances never above about 65%; targets are the nearest resistance, not the farthest; when signals disagree, the answer is 中性 / 等待訊號.",
"- order.days: a conservative day-by-day plan for each of the next 5 trading days listed in DAYS: the likely view, a price range (use DATA.research.timeMachine and the support / resistance levels; one day is narrower than the 20-day spread) and what to do that day. For 分批買進 say on which day and at which price or condition each batch is bought, and when to stop adding or cut.",
"- Each analyst: stance is exactly one of 偏多, 中性, 偏空; 2 or 3 points, each ONE short sentence (under about 35 Chinese characters).",
"- Keep every other field short and plain too: headline under 25 Chinese characters, short_term / mid_term / why one sentence each, at most 3 conditions, risks and watch items.",
"- 'order' is the bottom line, read FIRST: one concrete order suggestion. action is exactly one of 買進, 分批買進, 觀望, 續抱, 減碼, 賣出. If DATA.research.myPosition exists the user already holds the stock, so choose among 續抱, 加碼 (write it as 分批買進), 減碼, 賣出; otherwise among 買進, 分批買進, 觀望. Give the order type and price (for example 限價 or 收盤站上某價位後), how to split it, the stop, one or two targets, and the risk-reward ratio, all from DATA levels. If the answer is to wait, action is 觀望 and say exactly what would change that.",
"",
"Return ONE JSON object and nothing else, in exactly this shape:",
'{"team":[{"role":"技術面分析師","stance":"偏多","points":["..."]},{"role":"基本面分析師","stance":"中性","points":["..."]},{"role":"籌碼面分析師","stance":"中性","points":["..."]},{"role":"時事與國際分析師","stance":"中性","points":["..."]},{"role":"風險控管","stance":"中性","points":["..."]}],',
'"order":{"action":"買進|分批買進|觀望|續抱|減碼|賣出","how":"order type, price and timing","split":"how to split the order","stop":"stop price and which level","targets":["first target and which level"],"rr":"risk-reward, e.g. 1 : 2.1","why":"one or two sentences",',
'"days":[{"d":"11/25","view":"偏多|盤整|偏空","range":"price range","do":"what to do that day"}]},',
'"summary":{"stance":"偏多|中性|偏空","confidence":"低|中|高","headline":"one sentence","short_term":"the next 1 to 2 weeks","mid_term":"the next 1 to 3 months",',
'"scenarios":[{"name":"樂觀","chance":"約 30%","trigger":"what has to happen","range":"price area"},{"name":"基本","chance":"約 50%","trigger":"...","range":"..."},{"name":"悲觀","chance":"約 20%","trigger":"...","range":"..."}],',
'"entry":{"now":"適合進場|等待訊號|不建議進場","conditions":["..."],"zone":"price zone","stop":"stop level and why","avoid":"when not to buy"},',
'"risks":["..."],"watch":["upcoming events or dates to watch"]}}',
"",
"DATA.research (when present) holds the page's own research tools for this stock: technical scenarios with support and resistance, a 10,000-run bootstrap 'time machine' (how often the target or the stop was hit first), backtests of four simple strategies with Taiwan costs and an out-of-sample split, and the user's own position, trades, events and valuation. Every analyst must use the parts that concern them (the 技術面 analyst the scenarios and time machine, 風險控管 the time machine, backtests and the user's position) and say when a backtest has too few trades to mean anything.",
"",
"DAYS (the next 5 trading days): " + JSON.stringify(nextDays(new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), 5)),
"",
"DATA (computed by the page from TWSE figures; prices in NT$, volume in lots of 1,000 shares):",
facts,
"",
"COMPANY HEADLINES (last 14 days, newest first):",
list(news, x => "- " + day(x.at) + " " + x.t + (x.src ? "（" + x.src + "）" : "")),
"",
"COMPANY ANNOUNCEMENTS (material information filed with the exchange):",
list(ann, x => "- " + x.d + " " + x.t + (x.body ? " — " + x.body : "")),
"",
"MARKET AND WORLD HEADLINES (last 3 days):",
list(world, x => "- " + day(x.at) + " " + x.t + (x.src ? "（" + x.src + "）" : "")),
  ].join("\n");
}
async function twAnalyze(env, who, ip, bodyText, json, fail) {
  if (!env.GEMINI_KEY) return fail(500, "INTERNAL", "The Worker has no GEMINI_KEY secret yet");
  let b; try { b = JSON.parse(bodyText); } catch (e) { return fail(400, "BAD_JSON", "Body is not JSON"); }
  const code = String((b && b.code) || "").trim(), name = twClip(b && b.name, 20) || code;
  if (!/^[0-9A-Z]{4,6}$/.test(code)) return fail(400, "BAD_CODE", "Bad stock code");
  let facts; try { facts = JSON.stringify(b.facts || {}); } catch (e) { facts = "{}"; }
  if (facts.length > 16000) return fail(413, "TOO_BIG", "Too much data");
  if (!b.fresh) {   /* today's analysis of this stock on this device, unless 重新分析 asked for a new one */
    const c = await guard(env, "dev:" + who, "aiget", { code }).catch(() => ({}));
    if (c && c.hit) return json({ ...c.hit, cached: true });
  }
  const q = await guard(env, "ip:" + ip, "ai", { hr: AI_HOUR, day: AI_DAY });
  if (q.blocked) return fail(429, "RESOURCE_EXHAUSTED", "Limit reached for this connection; try again later", { "Retry-After": String(q.aiWait || 60) });
  const [news, ann, world] = await Promise.all([
    twHeadlines(name + " " + code + " when:14d", 12).catch(() => []),
    twAnnouncements(code).catch(() => []),
    twCached("world", 600000, () => twHeadlines("台股 OR 美股 OR 聯準會 OR 關稅 OR 匯率 when:3d", 10)).catch(() => []),
  ]);
  const g = await geminiJson(env, twPrompt(code, name, facts, news, ann, world), 0.4, 0);
  if (g.error) return fail(g.error.status === 429 ? 429 : 502, g.error.daily ? "AI_DAILY" : "AI_FAILED", g.error.daily ? "今天的額度用完了" : aiWhy(g.error.status), g.error.status === 429 && !g.error.daily ? { "Retry-After": "60" } : undefined);
  let a = null; try { a = JSON.parse(g.text); } catch (e) { const m = g.text.match(/\{[\s\S]*\}/); try { a = m ? JSON.parse(m[0]) : null; } catch (e2) { a = null; } }
  if (!a || !Array.isArray(a.team) || !a.summary) return fail(502, "AI_FAILED", "分析結果不完整，再按一次");
  const out = { at: Date.now(), analysis: a, news: news.map(x => ({ t: x.t, src: x.src, u: x.u, at: x.at })), ann: ann.map(x => ({ d: x.d, t: x.t })), world: world.map(x => ({ t: x.t, src: x.src, u: x.u, at: x.at })) };
  await guard(env, "dev:" + who, "aiput", { code, data: out }).catch(() => {});
  return json(out);
}

/* what went wrong with the AI, in plain words for the page */
function aiWhy(st) {
  if (st === 429) return "這一分鐘太忙，一分鐘後再按一次";   /* the daily cap has its own message (AI_DAILY) */
  if ([500, 502, 503, 504].includes(st)) return "Google 的服務現在太忙，過幾分鐘再按一次";
  if (st === 400 || st === 401 || st === 403) return "金鑰設定有問題，請檢查 Cloudflare 上的 GEMINI_KEY";
  return "暫時沒有回應，過幾分鐘再試";
}
function callGemini(env, target, body) {
  return fetch(target, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY }, body });
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
async function guard(env, key, op, body) {
  if (!env.GUARD) return { blocked: false };
  const r = await env.GUARD.get(env.GUARD.idFromName(key)).fetch("https://guard/" + op, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  return r.json();
}
/* the same device's analysis of a stock is kept for the rest of the Taipei day, so opening it again costs no AI call
   (kept per device because the page sends the user's own position and trades with it) */
const twToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
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

/* one Gemini call that moves on to the next model when one is overloaded, over quota or retired */
async function geminiJson(env, prompt, temperature, attempt) {
  const body = JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature, responseMimeType: "application/json" } });
  let last = { status: 502 }, n429 = 0, nDay = 0;   /* nDay: 429s that name a per-day quota (the free tier's daily cap) */
  for (let k = 0; k < MODELS.length; k++) {
    const model = MODELS[(attempt + k) % MODELS.length];
    const target = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
    let r;
    try {
      r = env.RELAY ? await env.RELAY.get(env.RELAY.idFromName("gemini-relay-us"), { locationHint: "enam" }).fetch("https://relay/" + encodeURIComponent(target), { method: "POST", body })
                    : await callGemini(env, target, body);
    } catch (e) { last = { status: 502 }; continue; }
    if (r.status === 429) { n429++; if (/PerDay/i.test(await r.text().catch(() => ""))) nDay++; }
    if (!r.ok) { if (r.status !== 404 || last.status === 502) last = { status: r.status }; if ([404, 429, 500, 502, 503, 504].includes(r.status)) continue; return { error: last }; }   /* a retired model (404) must not hide the 429 / 503 the others gave */
    const j = await r.json().catch(() => null), c = j && j.candidates && j.candidates[0];
    const text = c && c.content && Array.isArray(c.content.parts) ? c.content.parts.filter(p => !p.thought).map(p => p.text || "").join("") : "";
    if (text.trim()) return { text };
    last = { status: 502 };
  }
  if (n429 && nDay === n429) last = { status: 429, daily: true };   /* every model that answered 429 is out for the day */
  return { error: last };
}
/* ---------- health: is each secret still good? ---------- */
async function health(env) {
  const out = { checkedAt: new Date().toISOString(), gemini: { ok: false } };
  try {
    const target = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1";
    let r;
    if (env.RELAY) r = await env.RELAY.get(env.RELAY.idFromName("gemini-relay-us"), { locationHint: "enam" }).fetch("https://relay/" + encodeURIComponent(target), { method: "GET" });
    else r = await fetch(target, { headers: { "x-goog-api-key": env.GEMINI_KEY } });
    out.gemini.ok = r.ok; out.gemini.status = r.status;
  } catch (e) { out.gemini.error = String(e.message || e); }
  return out;
}

/* ---------- TWstock daily pre-market note ---------- */
/* the stored note and the Telegram chat it goes to live in one Durable Object ("daily") */
async function pmStore(env, op, body) {
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
/* night-session TAIEX futures (MarketType "1"), or the futures exchange's after-hours daily report */
async function pmNight() {
  /* the night session's last quote (TAIFEX, Yahoo Taiwan or cnyes) plus TAIFEX's daily report when it answers */
  const f0 = await twFut().catch(() => null), f = f0 && f0.z > 0 ? f0 : null;
  let rep = null;
  try {
    const a = await (await twFetch("https://openapi.taifex.com.tw/v1/DailyMarketReportFut", { headers: { "User-Agent": TW_UA, Accept: "application/json" } })).json();
    const month = x => String(x["ContractMonth(Week)"] || "").trim();
    const tx = a.filter(r => String(r.Contract).trim() === "TX" && /^\d{6}$/.test(month(r)) && twNum(r.Last) > 0);
    const pick = x => x && { date: String(x.Date || ""), month: month(x), last: twNum(x.Last), change: twNum(x.Change), high: twNum(x.High), low: twNum(x.Low), volume: twNum(x.Volume) };
    rep = { night: pick(tx.find(r => /盤後|After/i.test(String(r.TradingSession || "")))), day: pick(tx.find(r => !/盤後|After/i.test(String(r.TradingSession || "")))) };
  } catch (e) {}
  return f || rep ? { quote: f && { name: f.n, session: f.sess, last: f.z, previousClose: f.y, high: f.h, low: f.l, volume: f.v, time: f.tm, source: f.via || "taifex report" }, report: rep } : null;
}
const PM_SYMS = [["^GSPC", "S&P 500"], ["^IXIC", "Nasdaq"], ["^DJI", "道瓊"], ["^SOX", "費城半導體"], ["TSM", "台積電 ADR"], ["^VIX", "VIX"], ["^TNX", "美 10 年債殖利率"], ["TWD=X", "美元兌新台幣"], ["DX-Y.NYB", "美元指數"], ["CL=F", "原油"], ["NVDA", "輝達"], ["^TWII", "加權指數"], ["^N225", "日經"]];
async function pmWorld(withHist) {
  const r = await fetch("https://query1.finance.yahoo.com/v7/finance/spark?range=" + (withHist ? "1mo" : "5d") + "&interval=1d&symbols=" + encodeURIComponent(PM_SYMS.map(x => x[0]).join(",")), { headers: { "User-Agent": TW_UA, Accept: "application/json" } });
  if (!r.ok) return [];
  const j = await r.json();
  const rows = j && j.spark && Array.isArray(j.spark.result) ? j.spark.result.map(x => ({ s: x.symbol, d: (x.response || [])[0] || {} })) : Object.entries(j || {}).map(([s, d]) => ({ s, d: d || {} }));
  return rows.map(({ s, d }) => {
    const m = d.meta || d, q = (d.indicators && d.indicators.quote && d.indicators.quote[0]) || {}, cl = (q.close || d.close || []).filter(v => v > 0);
    const ts = d.timestamp || (d.response && d.response[0] && d.response[0].timestamp) || [], rc = (q.close || d.close || []), prs = ts.map((t, k) => [t, rc[k]]).filter(x => x[1] > 0);
    const last = twNum(m.regularMarketPrice) || cl[cl.length - 1], prev = cl.length > 1 ? cl[cl.length - 2] : twNum(m.chartPreviousClose);
    const nm = (PM_SYMS.find(x => x[0] === s) || [s, s])[1], t = m.regularMarketTime ? new Date((m.regularMarketTime + 8 * 3600) * 1000).toISOString().slice(0, 16).replace("T", " ") : "";
    return last > 0 ? { name: nm, symbol: s, last: Math.round(last * 100) / 100, changePct: prev > 0 ? Math.round((last / prev - 1) * 10000) / 100 : null, asOfTaipei: t, ...(withHist ? { hist: prs.slice(-22).map(x => [x[0], Math.round(x[1] * 100) / 100]) } : {}) } : null;
  }).filter(Boolean);
}
async function pmInst() {
  /* yesterday's institutional net buying in the cash market (NT$ 100 million), from TWSE; may refuse servers abroad */
  try {
    const d = new Date(Date.now() + 8 * 3600e3);
    for (let back = 1; back < 6; back++) {
      const x = new Date(d.getTime() - back * 864e5); if (x.getUTCDay() % 6 === 0) continue;
      const ds = x.toISOString().slice(0, 10).replace(/-/g, "");
      const j = await (await twFetch(`https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate=${ds}&response=json`, { headers: { "User-Agent": TW_UA } })).json();
      if (j.stat === "OK" && Array.isArray(j.data)) return { date: ds, rows: j.data.map(r => [String(r[0]), Math.round(twNum(r[3]) / 1e6) / 100]) };
    }
  } catch (e) {}
  return null;
}
function pmPrompt(day, madeAt, night, world, inst, news, cands, mid) {
  const list = (a, f) => (a && a.length ? a.map(f).join("\n") : "(none found)");
  return [
mid
  ? "You are the midday desk of a Taiwan equity research team, writing for one private investor. It is now " + madeAt + " Taipei time, DURING today's Taiwan session (it closes at 13:30). You are calling the open of the NEXT trading session: 09:00 on " + day + " (" + WD[new Date(day + "T00:00:00Z").getUTCDay()] + "), not today's."
  : "You are the pre-market desk of a Taiwan equity research team, writing for one private investor. It is now " + madeAt + " Taipei time. You are calling the open of the NEXT Taiwan trading session: 09:00 on " + day + " (" + WD[new Date(day + "T00:00:00Z").getUTCDay()] + ").",
"Whenever you say 今日, 明日 or 今晚, name the date instead (for example 11/24 開盤), so the reader never has to guess which day you mean.",
"Write everything in Traditional Chinese as used in Taiwan. Be concrete; no filler.",
"",
...(mid ? ["This note is written in the middle of today's session, so the US market and tonight's night session have not happened yet. Work from what is known now: today's TAIEX so far (DATA.today: level, change, high and low, how it moved through the morning), today's TAIEX futures day session, the previous US close, Asian markets and US index futures if present in DATA.world, yesterday's institutional flows and today's news. Say plainly what tonight's US session and night session would need to do to change the call. 'night' describes today's session so far and today's futures (not a night session); 'us' describes the last US close and what tonight's US session could bring. 'close' calls the close of " + day + ", and 'watch' lists what to check tonight and in the first 30 minutes of " + day + ". Anchor the gap on today's likely close (DATA.today) instead of a night future, and keep every range modest because the night has not traded yet.", ""] : []),
"Weigh every factor that can move the Taiwan market at today's open: the TAIEX futures night session (it trades 15:00 to 05:00 and is the most direct signal of the open), the US close (S&P 500, Nasdaq, Philadelphia Semiconductor, TSMC ADR versus its Taiwan price, Nvidia), the VIX, US yields and the dollar, the NT dollar, oil, yesterday's institutional flows in Taiwan, and the news: Fed and US data, tariffs and export controls, geopolitics, big earnings, Taiwan policy.",
"",
"Rules:",
"- Use ONLY the numbers in DATA and the headlines given. Never invent a price, a figure or an event; if something important is missing say so.",
"- Keep it SHORT and plain, for reading on a phone: every sentence under about 35 Chinese characters, headline under 25, each list at most 3 items. No jargon where a plain word works.",
"- TSMC ADR: one ADR is 5 shares; if you compare it with the Taiwan price, say that you need the exchange rate and use the one in DATA.",
"- For EVERY pick also give 'analysis': 3 or 4 short points labelled 技術, 量能籌碼, 消息 and 風險, each one sentence from that stock's numbers and the headlines; and 'days': a conservative plan for each of the trading days in DATA.days (open day first), with the likely view, a price range anchored on next5d (p10 to p90 over five days, so a single day is narrower) and what to do that day. For 分批買進 the days must say when each batch is bought and under which condition, and when to stop adding.",
"- 'picks': one entry for EVERY stock in DATA.candidates, none left out: all 推薦 first, then all 追蹤, then all 持股, then all 自選, best first within each group. tag says why it is a candidate (推薦 = screened here as a stock worth ordering today: liquid, in an uptrend with close above MA20 above MA60, sitting near MA20 rather than stretched, RSI not overbought; 追蹤 = always analysed for the user: 0050 (Yuanta Taiwan 50 ETF), 2330 TSMC and 2454 MediaTek, give the same full order and plan, 買進 / 分批買進 / 觀望 as the numbers support; 持股 = the user holds it; 自選 = on the user's watchlist). For a 推薦 stock the action is 買進 or 分批買進 with a limit price at or just above its support (MA20, the lower Bollinger band or a recent low), unless tonight's factors make buying it today clearly unwise, then 觀望 and why says what would change that. For each give one concrete order like a trader would: action is exactly one of 買進, 分批買進, 觀望, 續抱, 減碼, 賣出 (for a 持股 choose among 續抱, 分批買進 as adding, 減碼, 賣出); how = order type and price (限價 or after a close above a named level), split = how to split the order, stop = the stop price and which level it is, targets = one or two target prices with the level they come from, rr = risk-reward like 1 : 2.0, why = one or two sentences tying the stock to tonight's factors. Every price must come from that candidate's numbers (ma5/ma20/ma60, bollinger, 20/60-day highs and lows, last close) or be a round number near them, and say which. If a stock is not worth buying today its action is 觀望 (or 續抱 / 減碼 / 賣出 for a 持股) and why says what would change that; say in picks_note how many are worth acting on.",
"- Nobody can know the open for sure. Give the more likely direction for today's open, a rough gap range in TAIEX points, and chances that add up to about 100%. Say what would prove the call wrong in the first 30 minutes.",
"- Be CONSERVATIVE in every estimate (the user asked for this): when unsure, lean toward the smaller move, the nearer price level and the lower confidence. Gap and close ranges stay close to what DATA.anchor and recent days support, chances are never above about 70%, confidence is 高 only when the night session, the US close and the news all point the same way, picks use the nearest stop and the nearest target, and 觀望 is a fine answer.",
"- Anchor the gap on DATA.anchor: the night-session TAIEX future versus the last TAIEX close. The gap is normally within a few hundred points of that difference and almost never beyond ±3% of the TAIEX; never give a range wider than the data supports.",
"- Also call the CLOSE of that same day (13:30): 'close' gives 收紅, 平盤 or 收黑 against the previous TAIEX close, a TAIEX range for the close (numbers near DATA levels), chances adding up to about 100%, and one short sentence why (for example whether an opening gap is likely to hold or fade).",
"",
"Return ONE JSON object and nothing else, in exactly this shape:",
'{"call":"開高|平盤附近|開低","confidence":"低|中|高","gap":"例如 +80 到 +150 點","chances":{"開高":"約 55%","平盤":"約 25%","開低":"約 20%"},"headline":"one sentence for a phone notification",',
'"close":{"call":"收紅|平盤|收黑","range":"例如 36,500–36,900","chances":{"收紅":"約 50%","平盤":"約 20%","收黑":"約 30%"},"why":"one short sentence"},',
'"night":"what the night session did and what it implies","us":"the US close and what matters for Taiwan","factors":[{"name":"factor","effect":"利多|利空|中性","note":"one or two sentences"}],',
'"sectors":["sectors or big names likely to lead or lag, with the reason"],"levels":"TAIEX levels to watch, only from DATA","risks":["..."],"watch":["what to check between 09:00 and 09:30, and events later today"],',
'"picks":[{"code":"2454","name":"聯發科","tag":"推薦|追蹤|持股|自選","action":"分批買進","how":"...","split":"...","stop":"...","targets":["..."],"rr":"1 : 2.0","why":"...",',
'"analysis":["技術：...","量能籌碼：...","消息：...","風險：..."],"days":[{"d":"11/25","view":"偏多|盤整|偏空","range":"price range","do":"what to do that day, e.g. 第一批 3,600 掛單 / 不動 / 第二批若站上 3,700"}]}],"picks_note":"one sentence on the candidates overall"}',
"",
...(mid ? ["DATA.today (TAIEX in today's session so far, TWSE): " + JSON.stringify(mid)] : []),
"DATA.night (TAIEX futures, TAIFEX" + (mid ? "; during the day this is today's day session" : "") + "): " + JSON.stringify(night),
"DATA.anchor: " + JSON.stringify(pmAnchor(night, world)),
"DATA.days (the open day and the four trading days after it): " + JSON.stringify([day.slice(5).replace("-", "/").replace(/^0/, "").replace("/0", "/")].concat(nextDays(day, 4))),
"DATA.world (Yahoo Finance, last price and % change from the previous close, time in Taipei): " + JSON.stringify(world),
"DATA.institutions (TWSE, NT$ 100 million, previous trading day): " + JSON.stringify(inst),
"DATA.candidates (computed here from Yahoo Taiwan daily bars up to the last close; prices NT$, volume in lots): " + JSON.stringify(cands || []),
"",
"HEADLINES (last 24 hours, newest first):",
list(news, x => "- " + (x.at ? new Date(x.at + 8 * 3600e3).toISOString().slice(5, 16).replace("T", " ") : "") + " " + x.t + (x.src ? "（" + x.src + "）" : "")),
  ].join("\n");
}
/* the next n weekdays after a date (exchange holidays are not known here) */
function nextDays(day, n) { const out = []; let t = new Date(day + "T00:00:00Z"); while (out.length < n) { t = new Date(t.getTime() + 864e5); if (t.getUTCDay() % 6) out.push((t.getUTCMonth() + 1) + "/" + t.getUTCDate()); } return out; }
const WD = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
/* the next Taiwan session to open: today before 09:00 on a weekday, otherwise the next weekday (exchange holidays are not known here) */
function nextOpenDay(now) {
  let t = new Date(now.getTime() + 8 * 3600e3);
  if (!(t.getUTCDay() >= 1 && t.getUTCDay() <= 5 && t.getUTCHours() < 9)) { t = new Date(t.getTime() + 864e5); while (t.getUTCDay() === 0 || t.getUTCDay() === 6) t = new Date(t.getTime() + 864e5); }
  return t.toISOString().slice(0, 10);
}
/* candidates for the pre-market picks: stocks recommended for an order today (screened below), the owner's holdings and watchlist;
   each with a few numbers from about a year of Yahoo Taiwan daily bars */
const PM_FIXED = ["0050", "2330", "2454"];
async function pmCandidates(env) {
  /* every holding and every watchlist stock, plus up to 12 liquid stocks to screen for an order (35 chart requests in all, within the Worker's request limit).
     First cut on yesterday's close only: price 10 or more, 2,000 lots or more, a day's move between -3% and +4% (no chasing limit-ups),
     largest turnover first; the daily bars then decide (end of this function). */
  const wl = await pmStore(env, "wl").catch(() => ({})), hold = (wl.hold || []).slice(0, 30), watch = [];   /* watchlist stocks are left out of the pre-market analysis for now */
  const mkt = new Map(), strong = [];
  try {
    const a = await (await twFetch("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", { headers: { "User-Agent": TW_UA, Accept: "application/json" } })).json();
    (Array.isArray(a) ? a : []).forEach(x => { const c = String(x.Code || "").trim(), z = twNum(x.ClosingPrice), ch = twNum(x.Change), v = Math.round((twNum(x.TradeVolume) || 0) / 1000), val = twNum(x.TradeValue) || 0;
      if (!/^\d{4}$/.test(c) || !(z > 0)) return; mkt.set(c, "TW"); const p = ch != null ? ch / (z - ch) * 100 : 0; if (p > -3 && p < 4 && v >= 2000 && z >= 10) strong.push({ c, val, n: String(x.Name || "").trim() }); });
  } catch (e) {}
  try {
    const o = await (await fetch("https://raw.githubusercontent.com/SI70531/TWstock/data/otc.json", { headers: { "User-Agent": TW_UA } })).json();
    (o.list || []).forEach(x => { if (!mkt.has(x[0])) mkt.set(x[0], "TWO"); const p = x[2] > 0 && x[3] != null ? x[3] / (x[2] - x[3]) * 100 : 0; if (x[8] === "otc" && /^\d{4}$/.test(x[0]) && p > -3 && p < 4 && x[7] >= 2000 && x[2] >= 10) strong.push({ c: x[0], val: x[2] * x[7] * 1000, n: x[1] }); });
  } catch (e) {}
  /* always analysed, whatever the screen says: 0050, TSMC and MediaTek (as 持股 instead when the user holds one) */
  const fixed = PM_FIXED.filter(c => !hold.includes(c));
  const pick = strong.sort((a, b) => b.val - a.val).map(x => x.c).filter(c => !hold.includes(c) && !watch.includes(c) && !PM_FIXED.includes(c)).slice(0, Math.max(0, Math.min(12, 35 - hold.length - watch.length - fixed.length)));
  const list = [...hold.map(c => [c, "持股"]), ...fixed.map(c => [c, "追蹤"]), ...watch.map(c => [c, "自選"]), ...pick.map(c => [c, "推薦"])];
  const r2 = v => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  const out = await Promise.all(list.map(async ([code, tag]) => {
    try {
      const ex = mkt.get(code) || "TW";
      const u = "https://tw.stock.yahoo.com/_td-stock/api/resource/FinanceChartService.ApacLibraCharts;symbols=" + encodeURIComponent(JSON.stringify([code + "." + ex])) + ";type=day;period=d";
      const j = await (await fetch(u, { headers: { "User-Agent": TW_UA, Accept: "application/json" } })).json();
      const c = (j[0] || {}).chart || {}, q = (c.indicators && c.indicators.quote && c.indicators.quote[0]) || {}, m = c.meta || {};
      const rows = (c.timestamp || []).map((t, i) => [q.close && q.close[i], q.high && q.high[i], q.low && q.low[i], q.volume && q.volume[i]]).filter(r => r[0] > 0);
      if (rows.length < 30) return null;
      const cl = rows.map(r => r[0]), n = cl.length, last = cl[n - 1];
      const ma = k => (n >= k ? cl.slice(-k).reduce((a, b) => a + b, 0) / k : null), sd20 = (() => { const m20 = ma(20); return Math.sqrt(cl.slice(-20).reduce((a, b) => a + (b - m20) ** 2, 0) / 20); })();
      let g = 0, l = 0; for (let i = n - 14; i < n; i++) { const d = cl[i] - cl[i - 1]; if (d > 0) g += d; else l -= d; }
      const hi = k => Math.max(...rows.slice(-k).map(r => r[1])), lo = k => Math.min(...rows.slice(-k).map(r => r[2])), vols = rows.map(r => r[3] || 0), v20 = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
      return { code, name: m.name || code, tag, market: ex === "TW" ? "上市" : "上櫃/興櫃", close: r2(last), changePct: r2((last / cl[n - 2] - 1) * 100), ma5: r2(ma(5)), ma20: r2(ma(20)), ma60: r2(ma(60)),
        bollUpper: r2(ma(20) + 2 * sd20), bollLower: r2(ma(20) - 2 * sd20), rsi14: r2(l ? 100 - 100 / (1 + g / l) : 100), high20: r2(hi(20)), low20: r2(lo(20)), high60: r2(hi(Math.min(60, n))), low60: r2(lo(Math.min(60, n))),
        next5d: (() => {   /* 4,000 bootstrap replays of the last 60 daily returns, 5 trading days ahead */
          const R = []; for (let i = Math.max(1, n - 60); i < n; i++) R.push(cl[i] / cl[i - 1]);
          let seed = 7; for (const ch of code) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
          const end = []; for (let k = 0; k < 4000; k++) { let p = last; for (let d = 0; d < 5; d++) p *= R[Math.floor(rnd() * R.length)]; end.push(p); }
          end.sort((a, b) => a - b); const q = f => r2(end[Math.floor(f * 3999)]);
          return { p10: q(0.1), p50: q(0.5), p90: q(0.9), upChancePct: r2(end.filter(v => v > last).length / 40) };
        })(),
        volumeVs20d: v20 ? r2(vols[n - 1] / v20) : null, return5dPct: r2((last / cl[n - 6] - 1) * 100), return20dPct: n > 20 ? r2((last / cl[n - 21] - 1) * 100) : null };
    } catch (e) { return null; }
  }));
  /* the screen: an uptrend (close > MA20 > MA60, up over 20 days), close 0-6% above MA20 (near support, not stretched), RSI 40-68;
     the closer to MA20 and the calmer the RSI, the better; the best 5 stay */
  const fit = x => x.ma20 && x.ma60 && x.close > x.ma20 && x.ma20 > x.ma60 && x.close <= x.ma20 * 1.06 && x.rsi14 >= 40 && x.rsi14 <= 68 && (x.return20dPct || 0) > 0;
  const score = x => (x.close / x.ma20 - 1) * 100 + Math.abs(x.rsi14 - 55) / 5;
  const rec = out.filter(x => x && x.tag === "推薦" && fit(x)).sort((a, b) => score(a) - score(b)).slice(0, 5);
  return [...rec, ...out.filter(x => x && x.tag !== "推薦")];
}
/* the night future against the last TAIEX close: the main anchor for the opening gap */
function pmAnchor(night, world) {
  const tw = (world || []).find(x => x.symbol === "^TWII"), q = night && night.quote;
  if (!tw || !q || !(q.last > 0)) return null;
  return { taiexClose: tw.last, nightFuture: q.last, diffPoints: Math.round(q.last - tw.last), diffPct: Math.round((q.last / tw.last - 1) * 10000) / 100, futureTime: q.time };
}
async function premarket(env, notify, isMid) {
  if (!env.GEMINI_KEY) return { error: "no GEMINI_KEY" };
  /* the midday note calls the session after today's: tomorrow, or Monday after a Friday */
  const day = isMid ? nextOpenDay(new Date(Date.now() + 864e5 - (Date.now() + 8 * 3600e3) % 864e5)) : nextOpenDay(new Date()), madeAt = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
  const [night, world, inst, n1, n2, n3, cands, n4] = await Promise.all([
    pmNight().catch(() => null), pmWorld().catch(() => []), pmInst().catch(() => null),
    twHeadlines(isMid ? "台股 OR 台指期 OR 盤中 when:1d" : "台股 OR 台指期 OR 夜盤 when:1d", 10).catch(() => []),
    twHeadlines("美股 OR 聯準會 OR 費半 OR 台積電ADR when:1d", 10).catch(() => []),
    twHeadlines("關稅 OR 出口管制 OR 地緣政治 OR 匯率 OR 輝達 when:1d", 8).catch(() => []),
    pmCandidates(env).catch(() => []),
    twHeadlines("Fed OR \"Wall Street\" OR Nvidia OR TSMC OR tariff OR \"export controls\" OR Treasury when:1d", 10, true).catch(() => []),
  ]);
  const seen = new Set(), news = [...n1, ...n2, ...n3, ...n4].filter(x => !seen.has(x.t) && seen.add(x.t)).sort((a, b) => b.at - a.at).slice(0, 24);
  let today = null;
  if (isMid) {
    const x = (await twMis(["tse_t00.tw"]).catch(() => [])).find(r => r.c === "t00");
    if (x && x.z > 0 && x.y > 0) today = { taiex: x.z, previousClose: x.y, changePoints: Math.round(x.z - x.y), changePct: Math.round((x.z / x.y - 1) * 10000) / 100, open: x.o, high: x.h, low: x.l, time: x.tm };
    if (!today) { const q = (await twYahoo(["^TWII"]).catch(() => []))[0]; if (q && q.z > 0 && q.y > 0) today = { taiex: q.z, previousClose: q.y, changePoints: Math.round(q.z - q.y), changePct: Math.round((q.z / q.y - 1) * 10000) / 100, high: q.h, low: q.l }; }
    if (!today) today = { note: "no live TAIEX quote right now" };
  }
  /* Gemini answers 503 when Google is overloaded: wait and go round the models again (a few times for the 05:30 run) */
  const prompt = pmPrompt(day, madeAt, night, world, inst, news, cands, today);
  let g = await geminiJson(env, prompt, 0.3, 0);
  for (let k = 1; g.error && [500, 502, 503, 504].includes(g.error.status) && k <= (notify ? 4 : 2); k++) {
    await new Promise(r => setTimeout(r, (notify ? 20000 : 4000) * k));
    g = await geminiJson(env, prompt, 0.3, k);
  }
  if (g.error) return { error: g.error.daily ? "今天的額度用完了" : aiWhy(g.error.status), daily: !!g.error.daily };
  let a = null; try { a = JSON.parse(g.text); } catch (e) { const m = g.text.match(/\{[\s\S]*\}/); try { a = m ? JSON.parse(m[0]) : null; } catch (e2) { a = null; } }
  if (!a) { const t = String(g.text || "").replace(/^```(?:json)?|```$/g, "").trim(), i = t.indexOf("{"), j = t.lastIndexOf("}"); try { a = JSON.parse(t.slice(i, j + 1).replace(/,\s*([\]}])/g, "$1")); } catch (e) { a = null; } }
  if (!a || !a.call) return { error: "分析結果不完整，再按一次" };
  if (Array.isArray(a.picks)) {
    const ord = { 推薦: 0, 追蹤: 1, 持股: 2, 自選: 3 }, tagOf = c => (cands.find(x => x.code === c) || {}).tag;
    a.picks = a.picks.filter(x => x && cands.some(c => c.code === String(x.code))).map(x => Object.assign(x, { tag: tagOf(String(x.code)) || x.tag }))
      .sort((x, y) => (ord[x.tag] ?? 3) - (ord[y.tag] ?? 3));
  }
  const note = { at: Date.now(), day, madeAt, mid: !!isMid, analysis: a, data: { today, night, world, inst, candidates: cands.map(c => ({ code: c.code, name: c.name, tag: c.tag })) }, news: news.slice(0, 12).map(x => ({ t: x.t, src: x.src, u: x.u, at: x.at })) };
  const saved = await pmStore(env, isMid ? "mput" : "put", { note }).catch(e => ({ error: String(e && e.message || e) }));
  if (!saved || !saved.ok) note.saveError = (saved && saved.error) || "not saved";
  if (notify) note.sent = await pmTelegram(env, a, day, isMid);
  return note;
}
/* Telegram: the bot token is the TG_TOKEN secret; the chat is whoever first sent the bot a message (kept after that) */
async function pmTelegram(env, a, day, isMid) {
  if (!env.TG_TOKEN) return "no TG_TOKEN";
  if (!(await tgOn(env, "notes"))) return "off";
  const api = m => "https://api.telegram.org/bot" + env.TG_TOKEN + "/" + m;
  let { chat } = await pmStore(env, "chat");
  if (!chat) {
    try { const u = await (await fetch(api("getUpdates"))).json(); const m = (u.result || []).map(x => x.message || x.channel_post).find(x => x && x.chat); if (m) { chat = m.chat.id; await pmStore(env, "chat", { set: chat }); } } catch (e) {}
  }
  if (!chat) return "no chat yet: send the bot any message first";
  const esc = v => String(v == null ? "" : v).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);
  const ch = a.chances || {}, f = (Array.isArray(a.factors) ? a.factors : []).slice(0, 6);
  const text = [
    ...(isMid ? ["<b>盤中分析</b>"] : []),
    `<b>預測 ${esc(day.slice(5).replace("-", "/"))}（${WD[new Date(day + "T00:00:00Z").getUTCDay()]}）台股開盤：${esc(a.call)}</b>（信心 ${esc(a.confidence || "—")}，${esc(a.gap || "")}）`,
    esc(a.headline || ""), "",
    `開高 ${esc(ch["開高"] || "—")}｜平盤 ${esc(ch["平盤"] || "—")}｜開低 ${esc(ch["開低"] || "—")}`,
    ...(a.close && a.close.call ? [`<b>收盤：${esc(a.close.call)}</b>（${esc(a.close.range || "")}）${esc(a.close.why || "")}`] : []), "",
    `<b>${isMid ? "今日盤勢" : "夜盤"}</b> ${esc(a.night || "—")}`, `<b>美股</b> ${esc(a.us || "—")}`, "",
    ...f.map(x => `${x.effect === "利多" ? "🔺" : x.effect === "利空" ? "🔻" : "▪️"} ${esc(x.name)}：${esc(x.note)}`), "",
    `<b>${isMid ? "今晚與開盤後盯" : "開盤後盯"}</b> ${esc((a.watch || []).slice(0, 3).join("；"))}`,
    ...(Array.isArray(a.picks) && a.picks.length ? ["", "<b>推薦下單</b>", ...a.picks.map(x => `${/賣|減/.test(x.action) ? "🔻" : /觀望|續抱/.test(x.action) ? "▪️" : "🔺"} <b>${esc(x.name)}（${esc(x.code)}）${esc(x.action)}</b>　${esc(x.how || "")}\n　停損 ${esc(x.stop || "—")}｜目標 ${esc((x.targets || []).join("、") || "—")}｜${esc(x.rr || "")}`)] : []),
    `<a href="https://si70531.github.io/TWstock/">完整分析</a>｜研究參考，不保證漲跌`,
  ].join("\n").slice(0, 4000);
  try { const r = await fetch(api("sendMessage"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }) }); return r.ok ? "sent" : "telegram " + r.status; }
  catch (e) { return "telegram failed"; }
}

/* ---------- alerts during trading hours (day 09:00–13:30, night 15:00–05:00), cron every minute ---------- */
async function tgSend(env, text) {
  if (!env.TG_TOKEN) return "no TG_TOKEN";
  const api = m => "https://api.telegram.org/bot" + env.TG_TOKEN + "/" + m;
  let { chat } = await pmStore(env, "chat");
  if (!chat) {
    try { const u = await (await fetch(api("getUpdates"))).json(); const m = (u.result || []).map(x => x.message || x.channel_post).find(x => x && x.chat); if (m) { chat = m.chat.id; await pmStore(env, "chat", { set: chat }); } } catch (e) {}
  }
  if (!chat) return "no chat";
  try { const r = await fetch(api("sendMessage"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true }) }); return r.ok ? "sent" : "telegram " + r.status; }
  catch (e) { return "telegram failed"; }
}
const hesc = v => String(v == null ? "" : v).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);
const IDX_STEP = 1.5, STK_STEP = 5;
/* which session is open now (Taipei); weekends: no day session, night session runs Monday–Friday evenings into the next morning */
function twSession(d) {
  const t = new Date(d.getTime() + 8 * 3600e3), wd = t.getUTCDay(), m = t.getUTCHours() * 60 + t.getUTCMinutes();
  if (wd >= 1 && wd <= 5 && m >= 9 * 60 && m <= 13 * 60 + 30) return { s: "day", day: t.toISOString().slice(0, 10), m };
  if ((wd >= 1 && wd <= 5 && m >= 15 * 60) || (wd >= 2 && wd <= 6 && m < 5 * 60)) {
    const start = m < 5 * 60 ? new Date(t.getTime() - 864e5) : t;
    return { s: "night", day: start.toISOString().slice(0, 10) + "N", m };
  }
  return null;
}
/* Telegram messages the owner can switch off on the site (all on unless set to false) */
const ALERT_OPTS = ["stock", "index", "news", "bell", "notes"];
const tgOn = async (env, k) => ((await pmStore(env, "wl").catch(() => ({}))).opt || {})[k] !== false;
async function watchTick(env, now) {
  const ses = twSession(now); if (!ses || !env.DAILY) return;
  const st = await pmStore(env, "state"), S = st.day === ses.day ? st : { day: ses.day, lv: {}, seen: st.seen || [], newsAt: 0 };
  /* a level fires once per session: ±1.5%, ±3%, ±4.5% … for the index; a reversal through zero to the other side fires again */
  const msgs = [], fire = (key, pct, step, line) => {
    const lv = Math.trunc(pct / step), prev = S.lv[key] || 0;
    if (lv && (Math.abs(lv) > Math.abs(prev) || Math.sign(lv) !== Math.sign(prev || lv))) { S.lv[key] = lv; msgs.push(line); }
  };
  const sg = v => (v > 0 ? "+" : "") + v.toFixed(2) + "%", arrow = v => (v > 0 ? "🔺" : "🔻");
  const wl = await pmStore(env, "wl"), codes = [...new Set([...(wl.hold || []), ...(wl.watch || [])])], on = k => (wl.opt || {})[k] !== false;
  if (ses.s === "day") {
    const idx = await twMis(["tse_t00.tw"]).catch(() => []), x = idx.find(r => r.c === "t00");
    let z = x && x.z, y = x && x.y;
    if (!(z > 0 && y > 0)) { const yq = await twYahoo(["^TWII"]).catch(() => []); if (yq[0]) { z = yq[0].z; y = yq[0].y; } }
    if (z > 0 && y > 0 && on("index")) { const p = (z / y - 1) * 100; fire("TAIEX", p, IDX_STEP, `${arrow(p)} <b>加權指數 ${sg(p)}</b>　${z.toFixed(2)}（${p > 0 ? "+" : ""}${(z - y).toFixed(0)} 點）`); }
    if (codes.length && on("stock")) {
      let q = await twMis(codes.map(c => "tse_" + c + ".tw")).catch(() => []);
      const have = new Set(q.filter(r => r.z > 0).map(r => r.c)), miss = codes.filter(c => !have.has(c));
      if (miss.length) q = q.filter(r => r.z > 0).concat(await twYahoo(miss).catch(() => []));
      q.forEach(r => {
        if (!(r.z > 0 && r.y > 0)) return;
        const p = (r.z / r.y - 1) * 100, tag = (wl.hold || []).includes(r.c) ? "持股" : "自選", nm = r.n || r.c;
        if (p >= 9.4) fire(r.c + ":lim", 1, 1, `🚀 <b>${hesc(nm)}（${r.c}）漲停</b> ${r.z}　[${tag}]`);
        else if (p <= -9.4) fire(r.c + ":lim", -1, 1, `🧊 <b>${hesc(nm)}（${r.c}）跌停</b> ${r.z}　[${tag}]`);
        fire(r.c, p, STK_STEP, `${arrow(p)} <b>${hesc(nm)}（${r.c}）${sg(p)}</b>　${r.z}　[${tag}]`);
      });
    }
  } else {
    const f = await twFut().catch(() => null);
    if (on("index") && f && f.src === "night" && f.z > 0 && f.y > 0) { const p = (f.z / f.y - 1) * 100; fire("TXN", p, IDX_STEP, `${arrow(p)} <b>台指期夜盤 ${sg(p)}</b>　${f.z}（${p > 0 ? "+" : ""}${(f.z - f.y).toFixed(0)} 點）`); }
  }
  /* news and the watched companies' material announcements, judged by the AI every 15 minutes */
  if (on("news") && now.getTime() - (S.newsAt || 0) >= 14 * 60000) {
    S.newsAt = now.getTime();
    const ev = await watchNews(env, codes, S).catch(() => []);
    ev.forEach(e => msgs.push(`${e.impact === "利多" ? "🟥" : e.impact === "利空" ? "🟩" : "⚠️"} <b>${hesc(e.title)}</b>\n${hesc(e.why)}${e.link ? `\n<a href="${hesc(e.link)}">來源</a>` : ""}`));
  }
  await pmStore(env, "state", { set: S });
  if (msgs.length) await tgSend(env, `<b>${ses.s === "day" ? "台股盤中" : "夜盤"}警示</b>\n\n` + msgs.join("\n\n") + "\n\n<i>自動監控，研究參考</i>");
}
async function watchNews(env, codes, S) {
  const seen = new Set(S.seen || []), fresh = [], cut = Date.now() - 90 * 60000;
  const [a, b, c, d] = await Promise.all([
    twHeadlines("台股 OR 台指期 OR 台積電 OR 美股 OR 聯準會 when:1h", 12).catch(() => []),
    twHeadlines("關稅 OR 出口管制 OR 地緣政治 OR 輝達 OR 半導體 when:1h", 10).catch(() => []),
    twHeadlines("Fed OR Powell OR \"rate cut\" OR CPI OR \"jobs report\" OR Treasury yields OR \"stock market\" OR Nasdaq when:1h", 12, true).catch(() => []),
    twHeadlines("tariff OR \"export controls\" OR Nvidia OR TSMC OR semiconductor OR Taiwan OR China OR Trump when:1h", 12, true).catch(() => []),
  ]);
  [...a, ...b, ...c, ...d].forEach(x => { if (x.at >= cut && !seen.has(x.t)) { seen.add(x.t); fresh.push({ k: "news", t: x.t, src: x.src, u: x.u }); } });
  if (codes.length) {
    const all = await twCached("ann", 600000, async () => { const r = await twFetch("https://openapi.twse.com.tw/v1/opendata/t187ap04_L", { headers: { "User-Agent": TW_UA, Accept: "application/json" } }); return r.ok ? await r.json() : []; }).catch(() => []);
    const pick = (o, sub) => { const k = Object.keys(o).find(x => x.includes(sub)); return k ? o[k] : ""; };
    (Array.isArray(all) ? all : []).filter(x => codes.includes(String(pick(x, "公司代號")).trim())).forEach(x => {
      const t = String(pick(x, "公司代號")).trim() + " " + twClip(pick(x, "公司名稱"), 12) + "：" + twClip(pick(x, "主旨"), 160);
      if (!seen.has(t)) { seen.add(t); fresh.push({ k: "ann", t, body: twClip(pick(x, "說明"), 300) }); }
    });
  }
  S.seen = [...seen].slice(-400);
  if (!fresh.length || !env.GEMINI_KEY) return [];
  const prompt = [
    "You watch the Taiwan stock market for one private investor. Below are NEW headlines and company announcements from the last hour.",
    "The investor holds or watches these TWSE codes: " + (codes.join(", ") || "(none)") + ".",
    "The investor finds frequent alerts annoying, so the bar is very high. Pick ONLY a truly major, unexpected event that is likely to move the whole Taiwan market by more than about 1%, or one of those stocks by more than about 3%, today: a surprise Fed or central-bank decision, new tariffs or export controls actually announced, a war, attack or major disaster, a trading halt, a sudden executive departure, a capital reduction or a big earnings shock in a company announcement.",
    "Do NOT pick: ordinary good or bad news, expansion plans, subsidies or tax incentives, factory progress, product launches, analyst views, market commentary or summaries of how the market moved, foreign-investor buying or selling, rumours, follow-ups to news already known, or anything already priced in. When in doubt, leave it out. Almost always the answer is none; at most one item.",
    "Some headlines are from US English news (Fed, US data, US policy, US tech companies): a major US event that will clearly move Taiwan stocks counts just as much as Taiwan news, under the same high bar.",
    "Write in Traditional Chinese as used in Taiwan (translate English titles). Use only what the titles say; do not invent details.",
    'Return ONE JSON object: {"alerts":[{"n":item number,"title":"short title","impact":"利多|利空|不確定","why":"one sentence: what it means for Taiwan stocks or which holding"}]} — an empty list when nothing matters.',
    "",
    fresh.map((x, i) => `${i + 1}. [${x.k === "ann" ? "公司重大訊息" : "新聞"}] ${x.t}${x.src ? "（" + x.src + "）" : ""}${x.body ? " — " + x.body : ""}`).join("\n"),
  ].join("\n");
  const g = await geminiJson(env, prompt, 0.2, 0);
  if (g.error) return [];
  let r = null; try { r = JSON.parse(g.text); } catch (e) { const m = g.text.match(/\{[\s\S]*\}/); try { r = m ? JSON.parse(m[0]) : null; } catch (e2) { r = null; } }
  return (r && Array.isArray(r.alerts) ? r.alerts : []).slice(0, 1).map(x => ({ title: twClip(x.title, 80), impact: x.impact, why: twClip(x.why, 200), link: (fresh[(+x.n || 0) - 1] || {}).u || "" }));
}

/* ---------- index and futures charts (Yahoo Taiwan): 1-minute bars of the session, or daily bars for about a year ---------- */
const CHART_SYM = { t00: "^TWII", fut: "WTX&", o00: "^TWOII", exf: "WTE&", dji: "^DJI", spx: "^GSPC", ixic: "^IXIC", sox: "^SOX", t13: "^TELI", t17: "^TFNI" };
async function twChart(url, json, fail) {
  const k = url.searchParams.get("k"), r = url.searchParams.get("r") === "day" ? "day" : "tick", sym = CHART_SYM[k];
  if (!sym) return fail(400, "BAD_CODE", "Unknown chart");
  const out = await twCached("ch:" + k + ":" + r, r === "tick" ? 20000 : 3600000, async () => {
    const u = "https://tw.stock.yahoo.com/_td-stock/api/resource/FinanceChartService.ApacLibraCharts;symbols=" + encodeURIComponent(JSON.stringify([sym])) + ";type=" + r + (r === "day" ? ";period=d" : "");
    const res = await fetch(u, { headers: { "User-Agent": TW_UA, Accept: "application/json" } });
    if (!res.ok) throw new Error("Yahoo " + res.status);
    const c = ((await res.json())[0] || {}).chart || {}, q = (c.indicators && c.indicators.quote && c.indicators.quote[0]) || {}, m = c.meta || {}, qq = c.quote || {};
    const t = c.timestamp || [], pts = [];
    t.forEach((ts, i) => { const v = q.close && q.close[i]; if (v > 0) pts.push([ts, Math.round(v * 100) / 100, q.volume ? q.volume[i] || 0 : 0, q.high ? q.high[i] : null, q.low ? q.low[i] : null, q.open ? q.open[i] : null]); });
    return { k, r, name: m.name || "", prev: twNum(m.previousClose) || twNum(qq.previousClose), last: twNum(m.regularMarketPrice) || twNum(qq.price), open: twNum(qq.openPrice), high: twNum(qq.dayHighPrice), low: twNum(qq.dayLowPrice),
      volume: twNum(qq.volume), limitUp: twNum(m.limitUpPrice), limitDown: twNum(m.limitDownPrice), at: (m.regularMarketTime || 0) * 1000, pts };
  }).catch(e => ({ error: String(e.message || e) }));
  return out.error ? fail(502, "SOURCE", out.error) : json(out, 200, { "Cache-Control": "no-store" });
}

/* ---------- 上櫃 and 興櫃 lists (TPEx open data does not allow pages on other sites to read it, so the Worker does) ---------- */
async function twOtc(json, fail) {
  const out = await twCached("otc", 120000, async () => {
    /* TPEx is slow or silent towards Cloudflare: try the Asia relay, then directly, each with a time limit */
    const get = async u => {
      for (const via of ["relay", "direct"]) {
        try {
          const init = { headers: { "User-Agent": TW_UA, Accept: "application/json" }, signal: AbortSignal.timeout(9000) };
          const r = via === "relay" ? await Promise.race([twFetch(u, { headers: init.headers }), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 9000))]) : await fetch(u, init);
          if (r.ok) return await r.json();
        } catch (e) {}
      }
      throw new Error("TPEx did not answer");
    };
    const [main, esb] = await Promise.all([get("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes").catch(() => []), get("https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics").catch(() => [])]);
    const keep = c => /^(\d{4}|00\d{3,4}[A-Z]?)$/.test(c);
    const n = v => twNum(String(v == null ? "" : v).replace(/^\+/, ""));
    let date = "";
    const list = [];
    (Array.isArray(main) ? main : []).forEach(x => {
      const c = String(x.SecuritiesCompanyCode || "").trim(); if (!keep(c)) return;
      if (!date && x.Date) date = String(x.Date);
      list.push([c, String(x.CompanyName || "").trim(), n(x.Close), n(x.Change), n(x.Open), n(x.High), n(x.Low), Math.round((n(x.TradingShares) || 0) / 1000), "otc"]);
    });
    (Array.isArray(esb) ? esb : []).forEach(x => {
      const c = String(x.SecuritiesCompanyCode || "").trim(); if (!/^\d{4}$/.test(c)) return;
      const last = n(x.LatestPrice), prev = n(x.PreviousAveragePrice);
      list.push([c, String(x.CompanyName || "").trim(), last, last != null && prev != null ? Math.round((last - prev) * 100) / 100 : null, null, n(x.Highest), n(x.Lowest), Math.round((n(x.TransactionVolume) || 0) / 1000), "esb"]);
    });
    if (!list.length) throw new Error("TPEx answered nothing");
    return { date, list };
  }).catch(e => ({ error: String(e.message || e) }));
  return out.error ? fail(502, "SOURCE", out.error) : json(out, 200, { "Cache-Control": "no-store" });
}
/* about a year of daily bars for one stock from Yahoo Taiwan (used for 上櫃 and 興櫃, whose TPEx reports pages cannot read) */
async function twHist(url, json, fail) {
  const code = String(url.searchParams.get("c") || ""), ex = url.searchParams.get("x") === "TW" ? "TW" : "TWO";
  if (!/^[0-9A-Z]{4,6}$/.test(code)) return fail(400, "BAD_CODE", "Bad stock code");
  const out = await twCached("hist:" + code + ex, 1800000, async () => {
    const u = "https://tw.stock.yahoo.com/_td-stock/api/resource/FinanceChartService.ApacLibraCharts;symbols=" + encodeURIComponent(JSON.stringify([code + "." + ex])) + ";type=day;period=d";
    const r = await fetch(u, { headers: { "User-Agent": TW_UA, Accept: "application/json" } });
    if (!r.ok) throw new Error("Yahoo " + r.status);
    const c = ((await r.json())[0] || {}).chart || {}, q = (c.indicators && c.indicators.quote && c.indicators.quote[0]) || {}, t = c.timestamp || [];
    const rows = [];
    t.forEach((ts, i) => {
      const d = new Date((ts + 8 * 3600) * 1000).toISOString().slice(0, 10).replace(/-/g, "");
      const o = q.open && q.open[i], h = q.high && q.high[i], l = q.low && q.low[i], cl = q.close && q.close[i];
      if (o > 0 && h > 0 && l > 0 && cl > 0) rows.push([d, o, h, l, cl, q.volume ? q.volume[i] || 0 : 0]);
    });
    return { code, rows };
  }).catch(e => ({ error: String(e.message || e) }));
  return out.error ? fail(502, "SOURCE", out.error) : json(out, 200, { "Cache-Control": "no-store" });
}

/* Yahoo Taiwan quote list: real-time for 上市, 上櫃 and 興櫃 alike; each code is asked as .TWO, then the rest as .TW */
async function twYahooTW(codes) {
  const out = [];
  const ask = async (list, ex) => {
    for (let i = 0; i < list.length; i += 30) {
      const part = list.slice(i, i + 30);
      const r = await fetch("https://tw.stock.yahoo.com/_td-stock/api/resource/StockServices.stockList;fields=avgPrice;symbols=" + encodeURIComponent(part.map(c => c + "." + ex).join(",")), { headers: { "User-Agent": TW_UA, Accept: "application/json" } });
      if (!r.ok) continue;
      const a = await r.json().catch(() => []);
      (Array.isArray(a) ? a : []).forEach(x => {
        const raw = k => (x && x[k] && x[k].raw != null ? twNum(x[k].raw) : null), z = raw("price"), y = raw("regularMarketPreviousClose");
        if (!(z > 0) || !(y > 0)) return;
        const at = Date.parse(x.regularMarketTime || ""), t = at ? new Date(at + 8 * 3600e3).toISOString() : "";
        out.push({ c: String(x.symbol || "").replace(/\.TWO?$/, ""), n: String(x.symbolName || ""), z, y, o: raw("regularMarketOpen"), h: raw("regularMarketDayHigh"), l: raw("regularMarketDayLow"),
          v: ex === "TWO" && twNum(x.volume) >= 100000 ? Math.round(twNum(x.volume) / 1000) : twNum(x.volume), tm: t.slice(11, 19), d: t.slice(0, 10).replace(/-/g, ""), src: "yahoo-tw" });
      });
    }
  };
  await ask(codes, "TWO");
  const got = new Set(out.map(x => x.c)), rest = codes.filter(c => !got.has(c));
  if (rest.length) await ask(rest, "TW");
  return out;
}

/* ---------- opening and closing bell: one Telegram message at 09:01 and one at 13:31 (Taipei, Monday to Friday) ---------- */
async function bellNotice(env, now) {
  const t = new Date(now.getTime() + 8 * 3600e3), wd = t.getUTCDay(), m = t.getUTCHours() * 60 + t.getUTCMinutes();
  if (wd < 1 || wd > 5) return;
  const kind = m >= 541 && m <= 545 ? "open" : m >= 811 && m <= 816 ? "close" : null; if (!kind || !(await tgOn(env, "bell"))) return;
  const day = t.toISOString().slice(0, 10);
  const idx = await twMis(["tse_t00.tw"]).catch(() => []), ix = idx.find(x => x.c === "t00");
  let z = ix && ix.z, y = ix && ix.y, o = ix && ix.o, h = ix && ix.h, l = ix && ix.l;
  if (!(z > 0 && y > 0)) { const q = (await twYahooTW(["^TWII"]).catch(() => []))[0] || (await twYahoo(["^TWII"]).catch(() => []))[0]; if (q) { z = q.z; y = q.y; o = q.o; h = q.h; l = q.l; } }
  if (!(z > 0 && y > 0)) return;                                /* market closed today (holiday): no message */
  if (ix && ix.d && ix.d !== day.replace(/-/g, "")) return;   /* the quote is from an earlier day: no trading today */
  if (!(await pmStore(env, "bell", { kind, day })).first) return;   /* once per day (the Durable Object decides atomically) */
  const sg = v => (v > 0 ? "+" : "") + v.toFixed(2) + "%", pts = v => (v > 0 ? "+" : "") + Math.round(v), arw = v => (v > 0 ? "🔺" : v < 0 ? "🔻" : "▪️");
  const lines = [];
  if (kind === "open") {
    const op = o > 0 ? o : z, gap = op - y;
    lines.push(`<b>🔔 開盤 ${day.slice(5).replace("-", "/")}</b>`, `${arw(gap)} 加權 ${op.toFixed(0)}（${pts(gap)} 點，${sg(gap / y * 100)}）`);
    const pm = (await pmStore(env, "get")).note;
    if (pm && pm.day === day && pm.analysis) { const c = pm.analysis.call || "", hit = /高/.test(c) ? gap > 20 : /低/.test(c) ? gap < -20 : Math.abs(gap) <= 60; lines.push(`盤前預測：${c}（${pm.analysis.gap || ""}）${hit ? "✅" : "❌"}`); }
  } else {
    lines.push(`<b>🔔 收盤 ${day.slice(5).replace("-", "/")}</b>`, `${arw(z - y)} 加權 ${z.toFixed(2)}（${pts(z - y)} 點，${sg((z / y - 1) * 100)}）`);
    if (h > 0 && l > 0) lines.push(`高 ${h.toFixed(0)}・低 ${l.toFixed(0)}`);
  }
  const f = await twFut().catch(() => null);
  if (f && f.z > 0 && f.y > 0) lines.push(`${arw(f.z - f.y)} 台指期 ${f.z}（${pts(f.z - f.y)}）`);
  const wl = await pmStore(env, "wl").catch(() => ({})), codes = [...new Set([...(wl.hold || []), ...(wl.watch || [])])].slice(0, 40);
  if (codes.length) {
    let q = await twMis(codes.flatMap(c => ["tse_" + c + ".tw", "otc_" + c + ".tw"])).catch(() => []);
    const have = new Set(q.filter(r => r.z > 0).map(r => r.c)), miss = codes.filter(c => !have.has(c));
    if (miss.length) q = q.filter(r => r.z > 0).concat(await twYahooTW(miss).catch(() => []));
    const rows = q.filter(r => r.z > 0 && r.y > 0).map(r => ({ ...r, p: ((kind === "open" && r.o > 0 ? r.o : r.z) / r.y - 1) * 100, px: kind === "open" && r.o > 0 ? r.o : r.z })).sort((a, b) => b.p - a.p);
    if (rows.length) {
      lines.push("", kind === "open" ? "<b>你的股票開盤</b>" : "<b>你的股票收盤</b>");
      rows.forEach(r => lines.push(`${r.p >= 9.4 ? "🚀" : r.p <= -9.4 ? "🧊" : arw(r.p)} ${hesc(r.n || r.c)} ${r.px}（${sg(r.p)}）${(wl.hold || []).includes(r.c) ? "　持股" : ""}`));
    }
  }
  await tgSend(env, lines.join("\n"));
}

/* ---------- the close summary: 15:30 Taipei on trading days (TWSE's daily report and the day's institutional flows are out by then) ---------- */
const CLOSE_CRON = "30 7 * * MON-FRI", MID_CRON = "0 5 * * MON-FRI", WEEK_CRON = "0 1 * * SAT";   /* 15:30 and 13:00 Taipei */
const pctOf = (z, ch) => (z > 0 && ch != null && z - ch > 0 ? Math.round(ch / (z - ch) * 10000) / 100 : null);
/* TWSE's daily report for one day: indices (sector indices included), turnover, breadth and every stock's close */
async function twDayReport(ds) {
  const j = await (await twFetch(`https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${ds}&type=ALLBUT0999&response=json`, { headers: { "User-Agent": TW_UA } })).json();
  if (j.stat !== "OK" || !Array.isArray(j.tables)) return null;
  const T = j.tables, title = t => String(t.title || "");
  const ix = (T.find(t => /價格指數\(臺灣證券交易所\)/.test(title(t))) || {}).data || [];
  const idx = ix.map(r => ({ n: String(r[0]), z: twNum(r[1]), pts: twNum(r[3]), pct: twNum(r[4]) })).filter(x => x.z > 0);
  const taiex = idx.find(x => x.n === "發行量加權股價指數") || null;
  const sectors = idx.filter(x => /類指數$/.test(x.n) && x.pct != null).map(x => ({ name: x.n.replace(/類指數$/, ""), pct: x.pct })).sort((a, b) => b.pct - a.pct);
  const sum = ((T.find(t => /大盤統計/.test(title(t))) || {}).data || []).find(r => /總計/.test(String(r[0])));
  const br = (T.find(t => /漲跌證券數/.test(title(t))) || {}).data || [];
  const brk = k => { const r = br.find(x => String(x[0]).startsWith(k)); return r ? String(r[2]) : null; };   /* the 股票 column */
  const st = T.find(t => Array.isArray(t.fields) && t.fields.includes("證券代號") && (t.data || []).length > 100);
  let stocks = [];
  if (st) {
    const f = k => st.fields.indexOf(k), iC = f("證券代號"), iN = f("證券名稱"), iV = f("成交股數"), iA = f("成交金額"), iZ = f("收盤價"), iS = f("漲跌(+/-)"), iD = f("漲跌價差");
    stocks = st.data.filter(r => /^\d{4}$/.test(String(r[iC]))).map(r => {
      const z = twNum(r[iZ]), ch = (/-|green/.test(String(r[iS])) ? -1 : 1) * Math.abs(twNum(r[iD]) || 0);
      return { c: String(r[iC]), n: String(r[iN]).trim(), z, pct: pctOf(z, ch), lots: Math.round((twNum(r[iV]) || 0) / 1000), val: twNum(r[iA]) || 0 };
    }).filter(x => x.z > 0 && x.pct != null);
  }
  return { taiex, sectors, turnoverYi: sum ? Math.round(twNum(sum[1]) / 1e8) : null, breadth: { up: brk("上漲"), down: brk("下跌"), flat: brk("持平") }, stocks };
}
/* the day's institutional net buying (NT$ 100 million) */
async function twInstDay(ds) {
  try {
    const j = await (await twFetch(`https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate=${ds}&response=json`, { headers: { "User-Agent": TW_UA } })).json();
    if (j.stat === "OK" && Array.isArray(j.data)) return j.data.map(r => [String(r[0]).trim(), Math.round(twNum(r[3]) / 1e6) / 100]);
  } catch (e) {}
  return null;
}
/* TWSE's attention list (注意股) for a day and the disposition list (處置股) in force */
async function twFlags(ds) {
  const get = async u => { try { const j = await (await twFetch(u, { headers: { "User-Agent": TW_UA } })).json(); return j.stat === "OK" ? j : null; } catch (e) { return null; } };
  const [n, p] = await Promise.all([get(`https://www.twse.com.tw/rwd/zh/announcement/notice?response=json&startDate=${ds}&endDate=${ds}`), get("https://www.twse.com.tw/rwd/zh/announcement/punish?response=json")]);
  const col = (j, k) => (j && Array.isArray(j.fields) ? j.fields.indexOf(k) : -1);
  const notice = n ? (n.data || []).map(r => ({ c: String(r[col(n, "證券代號")]).trim(), n: String(r[col(n, "證券名稱")]).trim() })).filter(x => /^\d{4}$/.test(x.c)) : null;
  const punish = p ? (p.data || []).map(r => ({ c: String(r[col(p, "證券代號")]).trim(), n: String(r[col(p, "證券名稱")]).trim(), period: String(r[col(p, "處置起迄時間")] || "") })).filter(x => /^\d{4}$/.test(x.c)) : null;
  return { notice, punish };
}
function closePrompt(day, D, news) {
  return [
"You are the closing desk of a Taiwan equity research team, writing the after-close review of " + day + " (" + WD[new Date(day + "T00:00:00Z").getUTCDay()] + ") for one private investor.",
"Write everything in Traditional Chinese as used in Taiwan. Keep it SHORT and plain for a phone: sentences under about 35 Chinese characters, headline under 25, each list at most 3 items.",
"Use ONLY the numbers in DATA and the headlines given; never invent a figure or an event. Name dates instead of saying 今日 / 明日.",
"",
"Cover: how the TAIEX closed and why; which sectors led and lagged (DATA.sectors are TWSE sector indices, % change); the day's biggest movers among liquid stocks; institutional flows (DATA.institutions, NT$ 100 million; if empty TWSE has not published yet, say so); turnover and breadth.",
"If DATA.premarket exists it is this morning's call: compare its open call and gap with DATA.open (the actual open against the previous close) and its close call with the actual close, and say plainly whether each was right (✅ or ❌) and what it missed. If DATA.premarket is null, check is null.",
"For each stock in DATA.mine (the user's holdings and watchlist) give one short line: what it did and the one thing to watch next. Mention any of them flagged in DATA.mine[].flag (注意股 = attention list, 處置股 = disposition list with trading restrictions).",
"End with what to watch for the next session: at most 3 items, only from DATA and the headlines. Be conservative; this is a review, not a forecast.",
"",
"Return ONE JSON object and nothing else, in exactly this shape:",
'{"call":"收紅|平盤|收黑","headline":"one sentence for a phone notification","market":"two or three sentences on the index, turnover and breadth","check":{"open":"盤前預測 vs 實際開盤 ✅/❌","close":"盤前預測 vs 實際收盤 ✅/❌","note":"what the morning call missed"},',
'"lead":["sector or stock that led, with the reason"],"lag":["..."],"flows":"one or two sentences on the institutions","mine":[{"code":"2330","name":"台積電","pct":"+1.2%","note":"one short sentence"}],"next":["what to watch next session"]}',
"",
"DATA: " + JSON.stringify(D),
"",
"HEADLINES (today):",
(news.map(x => "- " + x.t + (x.src ? "（" + x.src + "）" : "")).join("\n") || "(none)"),
  ].join("\n");
}
/* the 15:30 run can fail (TWSE's day report not out yet, Gemini busy, or the free AI quota used up until it resets at midnight US Pacific,
   16:00 or 15:00 Taipei): try again every 15 minutes until 18:00; if there is still none, say why on Telegram */
/* ---------- more market data for the page ---------- */
const taipeiDays = (n, from) => { const out = []; let d = new Date((from || Date.now()) + 8 * 3600e3); while (out.length < n) { if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10).replace(/-/g, "")); d = new Date(d.getTime() - 864e5); } return out; };
const codeOf = url => { const c = String(url.searchParams.get("c") || "").trim().toUpperCase(); return /^[0-9A-Z]{4,6}$/.test(c) ? c : ""; };

/* US indices, SOX, FX, oil and the 10-year yield (the same list the pre-market note reads) */
/* NYSE regular session, New York time: Mon-Fri 09:30-16:00 (holidays and early closes included), so the US rows can be kept fresh only while it matters */
function twUsOpen(now) {
  const p = {}; new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" }).formatToParts(new Date(now || Date.now())).forEach(x => { p[x.type] = x.value; });
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), y = +p.year, m = +p.month - 1, d = +p.day, t = +p.hour * 60 + +p.minute;
  if (wd < 1 || wd > 5) return false;
  const nth = (mo, w, n) => { let c = 0; for (let k = 1; k <= 31; k++) { const x = new Date(Date.UTC(y, mo, k)); if (x.getUTCMonth() !== mo) break; if (x.getUTCDay() === w && ++c === n) return k; } return 0; };
  const lastMon = mo => { for (let k = 31; k > 0; k--) { const x = new Date(Date.UTC(y, mo, k)); if (x.getUTCMonth() === mo && x.getUTCDay() === 1) return k; } return 0; };
  const obs = (mo, k) => { const w = new Date(Date.UTC(y, mo, k)).getUTCDay(); return w === 6 ? [mo, k - 1] : w === 0 ? [mo, k + 1] : [mo, k]; };
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dd - g + 15) % 30, i = Math.floor(c / 4), k2 = c % 4, l = (32 + 2 * e + 2 * i - h - k2) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const gf = new Date(Date.UTC(y, Math.floor((h + l - 7 * mm + 114) / 31) - 1, ((h + l - 7 * mm + 114) % 31) + 1 - 2));
  const hol = new Set([obs(0, 1), [0, nth(0, 1, 3)], [1, nth(1, 1, 3)], [gf.getUTCMonth(), gf.getUTCDate()], [4, lastMon(4)], obs(5, 19), obs(6, 4), [8, nth(8, 1, 1)], [10, nth(10, 4, 4)], obs(11, 25)].map(x => x[0] + "-" + x[1]));
  if (hol.has(m + "-" + d)) return false;
  const early = (m === 10 && d === nth(10, 4, 4) + 1) || (m === 11 && d === 24);
  return t >= 570 && t < (early ? 780 : 960);
}
async function twWorldRoute(json, fail) {
  const live = twUsOpen();   /* while Wall Street trades the rows are kept 10 s, otherwise 5 minutes */
  const rows = await twCached(live ? "worldlive" : "worldrows2", live ? 10000 : 300000, () => pmWorld(true)).catch(() => []);
  if (!rows.length) return fail(502, "NO_DATA", "國際行情暫時讀不到");
  return json({ at: Date.now(), rows }, 200, { "Cache-Control": "public, max-age=" + (live ? 5 : 120) });
}

/* the TAIEX future: net open interest of foreign investors, investment trusts and dealers (TAIFEX open data, latest day), kept day by day */
async function twFutChip(env, json, fail) {
  const day = await twCached("futchip", 600000, async () => {
    const a = await (await twFetch("https://openapi.taifex.com.tw/v1/MarketDataOfMajorInstitutionalTradersDetailsOfFuturesContractsBytheDate", { headers: { "User-Agent": TW_UA, Accept: "application/json" } })).json();
    const rows = (Array.isArray(a) ? a : []).filter(r => /^(TX|臺股期貨|台股期貨)$/.test(String(r.ContractCode || r.ContractName || "").trim()));
    if (!rows.length) return null;
    const date = String(rows[0].Date || "").trim(), g = { f: null, t: null, d: null };
    rows.forEach(r => {
      const it = String(r.Item || ""), k = /外資|陸資/.test(it) ? "f" : /投信/.test(it) ? "t" : /自營/.test(it) ? "d" : null; if (!k || String(r.Date || "").trim() !== date) return;
      g[k] = { long: twNum(r["OpenInterest(Long)"]), short: twNum(r["OpenInterest(Short)"]), net: twNum(r["OpenInterest(Net)"]) };
    });
    return { date: date.length === 8 ? date.slice(0, 4) + "-" + date.slice(4, 6) + "-" + date.slice(6) : date, ...g };
  }).catch(() => null);
  if (!day || !day.date) { twCache.delete("futchip"); return fail(502, "NO_DATA", "期交所的三大法人期貨未平倉暫時讀不到"); }
  let hist = [];
  try {
    const was = await pmStore(env, "kv", { k: "futchip" }).then(r => r.v).catch(() => null);
    hist = Array.isArray(was) ? was : [];
    const pt = { d: day.date, f: day.f && day.f.net, t: day.t && day.t.net, dl: day.d && day.d.net };
    if (!hist.length || hist[hist.length - 1].d !== day.date) { hist.push(pt); hist = hist.slice(-30); await pmStore(env, "kv", { k: "futchip", set: hist }); }
  } catch (e) {}
  return json({ ...day, history: hist }, 200, { "Cache-Control": "public, max-age=300" });
}

/* margin / short balances: TWSE MI_MARGN returns every stock for one day, so each past day is kept for a day */
async function twMarginDay(ds) {
  return twCached("margin:" + ds, 12 * 3600e3, async () => {
    const j = await (await twFetch(`https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${ds}&selectType=STOCK&response=json`, { headers: { "User-Agent": TW_UA } })).json();
    const t = Array.isArray(j.tables) ? j.tables.find(x => x && Array.isArray(x.data) && Array.isArray(x.fields) && x.fields[0] === "代號") : null;
    if (j.stat !== "OK" || !t) return null;
    const m = {}; t.data.forEach(r => { const c = String(r[0]).trim(); if (/^[0-9A-Z]{4,6}$/.test(c)) m[c] = [twNum(r[5]), twNum(r[6]), twNum(r[11]), twNum(r[12])]; });   /* 融資 前日, 今日; 融券 前日, 今日 (lots) */
    return m;
  });
}
async function twMargin(url, json, fail) {
  const c = codeOf(url); if (!c) return fail(400, "BAD_CODE", "Bad stock code");
  const rows = [];
  for (const ds of taipeiDays(14)) {
    if (rows.length >= 8) break;
    let m = null; try { m = await twMarginDay(ds); } catch (e) { twCache.delete("margin:" + ds); }
    if (!m) { twCache.delete("margin:" + ds); continue; }
    const r = m[c]; if (!r) continue;
    rows.unshift({ d: ds.slice(0, 4) + "-" + ds.slice(4, 6) + "-" + ds.slice(6), fin: r[1], finChg: r[1] - r[0], sht: r[3], shtChg: r[3] - r[2] });
  }
  if (!rows.length) return fail(404, "NO_DATA", "這檔沒有融資融券資料（或證交所還沒公布）");
  return json({ code: c, rows }, 200, { "Cache-Control": "public, max-age=600" });
}

/* 產業輪動: each TWSE sector index's daily change over the last 10 trading days (MI_INDEX, one request per day, kept 12 hours) */
async function twSectorHist(json, fail) {
  const out = await twCached("sechist", 600000, async () => {
    const today = taipeiDays(1)[0], cand = taipeiDays(14);
    const got = await Promise.all(cand.map(async ds => {
      const key = "secday:" + ds;
      try { const v = await twCached(key, ds === today ? 600000 : 12 * 3600e3, async () => { const r = await twDayReport(ds); return r && r.sectors && r.sectors.length > 5 ? r.sectors : null; }); if (!v) twCache.delete(key); return v ? { ds, v } : null; }
      catch (e) { twCache.delete(key); return null; }
    }));
    const days = got.filter(Boolean).slice(0, 10).reverse();
    if (days.length < 3) return null;
    const names = [...new Set(days.flatMap(d => d.v.map(x => x.name)))];
    const rows = names.map(n => ({ n, d: days.map(d => { const x = d.v.find(y => y.name === n); return x ? x.pct : null; }) }));
    return { days: days.map(d => d.ds.slice(0, 4) + "-" + d.ds.slice(4, 6) + "-" + d.ds.slice(6)), rows };
  }).catch(() => null);
  if (!out) { twCache.delete("sechist"); return fail(502, "NO_DATA", "證交所的類股指數歷史暫時讀不到"); }
  return json(out, 200, { "Cache-Control": "public, max-age=600" });
}

/* market-wide margin ranking: the biggest rises and falls of 融資 and 融券 balances on the latest day TWSE has published */
async function twMarginTop(json, fail) {
  let day = "", m = null;
  for (const ds of taipeiDays(10)) {
    try { m = await twMarginDay(ds); } catch (e) { twCache.delete("margin:" + ds); m = null; }
    if (m && Object.keys(m).length > 100) { day = ds; break; } else twCache.delete("margin:" + ds);
  }
  if (!day) return fail(502, "NO_DATA", "證交所的融資融券資料暫時讀不到");
  const rows = Object.entries(m).map(([c, r]) => ({ c, fin: r[1], finChg: r[1] - r[0], sht: r[3], shtChg: r[3] - r[2], finPct: r[0] > 0 ? (r[1] / r[0] - 1) * 100 : 0 })).filter(x => x.fin != null && x.sht != null);
  const top = (arr, key, dir, n) => arr.slice().sort((a, b) => (b[key] - a[key]) * dir).slice(0, n).map(x => [x.c, x.fin, x.finChg, x.sht, x.shtChg]);
  const finBig = rows.filter(x => x.fin >= 1000), shtBig = rows.filter(x => x.sht >= 100);
  return json({ day: day.slice(0, 4) + "-" + day.slice(4, 6) + "-" + day.slice(6), unit: "張",
    finUp: top(finBig, "finChg", 1, 10), finDown: top(finBig, "finChg", -1, 10), shtUp: top(shtBig, "shtChg", 1, 10), shtDown: top(shtBig, "shtChg", -1, 10),
    total: { fin: rows.reduce((a, x) => a + x.fin, 0), finChg: rows.reduce((a, x) => a + x.finChg, 0), sht: rows.reduce((a, x) => a + x.sht, 0), shtChg: rows.reduce((a, x) => a + x.shtChg, 0) } }, 200, { "Cache-Control": "public, max-age=600" });
}

/* 復盤: each trading day, the pre-market call checked against what really happened (written when the close summary is made, kept for 120 days) */
async function reviewRows(env) {
  const v = await pmStore(env, "kv", { k: "review" }).then(r => r.v).catch(() => null);
  return Array.isArray(v) ? v : [];
}
async function reviewSave(env, day, pre, open, X) {
  if (!pre || !X || !(X.pct != null)) return;
  const openHit = (c, g) => (/高/.test(c) ? g > 20 : /低/.test(c) ? g < -20 : Math.abs(g) <= 60);
  const closeHit = (c, p) => (/紅/.test(c) ? p > 0.2 : /黑/.test(c) ? p < -0.2 : Math.abs(p) <= 0.2);
  const gap = open && Number.isFinite(open.gapPoints) ? open.gapPoints : null, pc = pre.close && pre.close.call ? pre.close.call : null;
  const e = { day, conf: pre.confidence || "", open: pre.call ? { call: pre.call, gap: pre.gap || "", actual: gap, hit: gap == null ? null : openHit(pre.call, gap) } : null,
    close: pc ? { call: pc, range: pre.close.range || "", actual: Math.round(X.pct * 100) / 100, z: X.z, hit: closeHit(pc, X.pct) } : null };
  const rows = (await reviewRows(env)).filter(x => x && x.day !== day); rows.push(e);
  await pmStore(env, "kv", { k: "review", set: rows.slice(-120) });
}

/* shareholding distribution (集保戶股權分散表): one big weekly file, read once and searched as text */
/* the TDCC file covers the whole market (tens of MB): stream it, keep only the rows of the stock asked for and stop reading there */
async function twTdccRows(c) {
  const r = await twFetch("https://openapi.tdcc.com.tw/v1/opendata/1-5", { headers: { "User-Agent": TW_UA, Accept: "application/json" } });
  if (!r.ok || !r.body) throw new Error("TDCC " + r.status);
  const marker = new RegExp('"證券代號"\\s*:\\s*"\\s*' + c + '\\s*"'), rd = r.body.getReader(), dec = new TextDecoder(); let buf = "", found = false, grabbed = "";
  try {
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      if (!found) {
        const at = buf.search(marker);
        if (at < 0) { buf = buf.slice(-600); continue; }
        found = true; buf = buf.slice(Math.max(0, buf.lastIndexOf("{", at)));
      }
      if (found) {
        /* stop once a later row belongs to another stock, or enough text for the 17 levels has arrived */
        const other = [...buf.matchAll(/"證券代號"\s*:\s*"([^"]*)"/g)].some(m => m[1].trim() !== c);
        if (other || buf.length > 17 * 320) { grabbed = buf; break; }
      }
    }
    if (found && !grabbed) grabbed = buf;
  } finally { try { await rd.cancel(); } catch (e) {} }
  return grabbed;
}
async function twHolders(url, json, fail) {
  const c = codeOf(url); if (!c) return fail(400, "BAD_CODE", "Bad stock code");
  let seg; try { seg = await twCached("tdcc:" + c, 6 * 3600e3, () => twTdccRows(c)); } catch (e) { return fail(502, "NO_DATA", "集保的股權分散表暫時讀不到"); }
  if (!seg) { twCache.delete("tdcc:" + c); return fail(404, "NO_DATA", "集保沒有這檔的股權分散資料"); }
  const lv = [];
  let date = "";
  for (const m of seg.matchAll(/\{[^{}]*\}/g)) {
    let o; try { o = JSON.parse(m[0]); } catch (e) { continue; }
    if (String(o["證券代號"]).trim() !== c) continue;
    if (!date) { const k = Object.keys(o).find(x => x.includes("資料日期")); date = k ? String(o[k]) : ""; }
    lv.push({ lv: +o["持股分級"], people: twNum(o["人數"]), shares: twNum(o["股數"]), pct: twNum(o["占集保庫存數比例%"]) });
  }
  const L = lv.filter(x => x.lv >= 1 && x.lv <= 15); if (L.length < 10) return fail(404, "NO_DATA", "集保沒有這檔的股權分散資料");
  const sum = (a, b, k) => Math.round(L.filter(x => x.lv >= a && x.lv <= b).reduce((t, x) => t + (x[k] || 0), 0) * 100) / 100;
  return json({ code: c, date: date.length === 8 ? date.slice(0, 4) + "-" + date.slice(4, 6) + "-" + date.slice(6) : date, levels: L, big1000: sum(15, 15, "pct"), big400: sum(12, 15, "pct"), small10: sum(1, 3, "pct"), bigPeople: sum(12, 15, "people"), totalPeople: sum(1, 15, "people") }, 200, { "Cache-Control": "public, max-age=3600" });
}

/* daily P/E, dividend yield and P/B of one stock (TWSE BWIBBU, one request per month) */
async function twPeMonth(c, ym) {
  const done = ym < new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 7).replace("-", "");
  return twCached("pe:" + c + ":" + ym, done ? 24 * 3600e3 : 1800e3, async () => {
    const j = await (await twFetch(`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?date=${ym}01&stockNo=${c}&response=json`, { headers: { "User-Agent": TW_UA } })).json();
    if (j.stat !== "OK" || !Array.isArray(j.data) || !Array.isArray(j.fields)) return [];
    const F = j.fields, iD = F.findIndex(x => String(x).includes("日期")), iP = F.findIndex(x => String(x).includes("本益比")), iY = F.findIndex(x => String(x).includes("殖利率")), iB = F.findIndex(x => String(x).includes("淨值比"));
    return j.data.map(r => { const m = String(r[iD]).match(/(\d+)\D+(\d+)\D+(\d+)/); if (!m) return null; const y = +m[1] < 1911 ? +m[1] + 1911 : +m[1];
      return [y + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[3]).padStart(2, "0"), iP >= 0 ? twNum(r[iP]) : null, iY >= 0 ? twNum(r[iY]) : null, iB >= 0 ? twNum(r[iB]) : null]; }).filter(Boolean);
  });
}
async function twPe(url, json, fail) {
  const c = codeOf(url); if (!c) return fail(400, "BAD_CODE", "Bad stock code");
  const n = Math.max(3, Math.min(36, parseInt(url.searchParams.get("m"), 10) || 24)), yms = [];
  let d = new Date(Date.now() + 8 * 3600e3);
  for (let k = 0; k < n; k++) { yms.unshift(d.toISOString().slice(0, 7).replace("-", "")); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)); }
  const out = [];
  for (let i = 0; i < yms.length; i += 4) {
    const part = await Promise.all(yms.slice(i, i + 4).map(ym => twPeMonth(c, ym).catch(() => { twCache.delete("pe:" + c + ":" + ym); return []; })));
    part.forEach(a => out.push(...a));
  }
  if (!out.length) return fail(404, "NO_DATA", "證交所沒有這檔的本益比資料（ETF 或虧損的公司沒有）");
  return json({ code: c, rows: out }, 200, { "Cache-Control": "public, max-age=1800" });
}

/* ---------- institutional net buying / selling ranking (TWSE T86), the latest trading day that has one ---------- */
async function twInstRank(json, fail) {
  const out = await twCached("instrank", 600000, async () => {
    let d = new Date(Date.now() + 8 * 3600e3);
    for (let k = 0; k < 8; k++, d = new Date(d.getTime() - 864e5)) {
      if (d.getUTCDay() % 6 === 0) continue;
      const ds = d.toISOString().slice(0, 10).replace(/-/g, "");
      try {
        const j = await (await twFetch(`https://www.twse.com.tw/rwd/zh/fund/T86?date=${ds}&selectType=ALLBUT0999&response=json`, { headers: { "User-Agent": TW_UA } })).json();
        if (j.stat !== "OK" || !Array.isArray(j.data) || !j.data.length || !Array.isArray(j.fields)) continue;
        const F = j.fields, ix = f => F.findIndex(x => String(x).includes(f));
        const iC = ix("證券代號"), iN = ix("證券名稱"), iF = ix("外陸資買賣超") >= 0 ? ix("外陸資買賣超") : ix("外資買賣超"), iT = ix("投信買賣超"), iD = F.findIndex(x => String(x).trim() === "自營商買賣超股數"), iA = ix("三大法人買賣超");
        if (iC < 0 || iA < 0) continue;
        const lots = v => Math.round((twNum(v) || 0) / 1000);
        const rows = j.data.map(r => ({ c: String(r[iC]).trim(), n: String(r[iN]).trim(), f: iF >= 0 ? lots(r[iF]) : 0, t: iT >= 0 ? lots(r[iT]) : 0, d: iD >= 0 ? lots(r[iD]) : 0, a: lots(r[iA]) })).filter(x => /^[0-9A-Z]{4,6}$/.test(x.c));
        const top = key => ({
          buy: rows.filter(x => x[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 10).map(x => [x.c, x.n, x[key]]),
          sell: rows.filter(x => x[key] < 0).sort((a, b) => a[key] - b[key]).slice(0, 10).map(x => [x.c, x.n, x[key]]),
        });
        return { day: ds.slice(0, 4) + "-" + ds.slice(4, 6) + "-" + ds.slice(6), unit: "張", groups: { f: top("f"), t: top("t"), d: top("d"), a: top("a") } };
      } catch (e) {}
    }
    return null;
  }).catch(() => null);
  if (!out) { twCache.delete("instrank"); return fail(502, "NO_DATA", "證交所的三大法人買賣超還沒有資料"); }
  return json(out, 200, { "Cache-Control": "public, max-age=300" });
}

/* ---------- 問 AI: one question about one stock ---------- */
async function twAsk(env, ip, bodyText, json, fail) {
  if (!env.GEMINI_KEY) return fail(500, "INTERNAL", "The Worker has no GEMINI_KEY secret yet");
  let b; try { b = JSON.parse(bodyText); } catch (e) { return fail(400, "BAD_JSON", "Body is not JSON"); }
  const code = String((b && b.code) || "").trim(), name = twClip(b && b.name, 20) || code, q = twClip(String((b && b.q) || "").replace(/\s+/g, " ").trim(), 200);
  if (!/^[0-9A-Z]{4,6}$/.test(code)) return fail(400, "BAD_CODE", "Bad stock code");
  if (q.length < 2) return fail(400, "BAD_QUESTION", "請輸入問題");
  let facts; try { facts = JSON.stringify(b.facts || {}); } catch (e) { facts = "{}"; }
  if (facts.length > 12000) facts = facts.slice(0, 12000);
  const lim = await guard(env, "ip:" + ip, "ai", { hr: AI_HOUR, day: AI_DAY });
  if (lim.blocked) return fail(429, "RESOURCE_EXHAUSTED", "Limit reached for this connection; try again later", { "Retry-After": String(lim.aiWait || 60) });
  const news = await twHeadlines(name + " " + code + " when:14d", 10).catch(() => []);
  const day = t => (t ? new Date(t).toISOString().slice(0, 10) : "");
  const prompt = [
    "You are a Taiwan equity analyst answering ONE question from a private investor about " + name + " (" + code + ").",
    "Answer in Traditional Chinese as used in Taiwan: direct answer first, then the reason, at most 6 short sentences (about 200 Chinese characters).",
    "Use ONLY the numbers in DATA and the headlines below. Never invent a price, ratio, date or event; if DATA cannot answer the question, say what is missing. When a headline matters, name it briefly.",
    "Nobody can know the future price: say what is more likely and what would prove it wrong; never promise a result. Be conservative.",
    "If the question is not about this stock or the market, politely say you only answer questions about this stock.",
    'Return ONE JSON object and nothing else: {"a":"your answer"}',
    "",
    "QUESTION: " + q,
    "",
    "DATA (prices in NT$, volume in lots of 1,000 shares): " + facts,
    "",
    "HEADLINES (last 14 days, newest first):",
    news.length ? news.map(x => "- " + day(x.at) + " " + x.t + (x.src ? "（" + x.src + "）" : "")).join("\n") : "(none found)",
  ].join("\n");
  const g = await geminiJson(env, prompt, 0.3, 0);
  if (g.error) return fail(g.error.status === 429 ? 429 : 502, g.error.daily ? "AI_DAILY" : "AI_FAILED", g.error.daily ? "今天的額度用完了" : aiWhy(g.error.status), g.error.status === 429 && !g.error.daily ? { "Retry-After": "60" } : undefined);
  let a = null; try { a = JSON.parse(g.text); } catch (e) { const m = String(g.text || "").match(/\{[\s\S]*\}/); try { a = m ? JSON.parse(m[0]) : null; } catch (e2) { a = null; } }
  if (!a || !a.a) return fail(502, "AI_FAILED", "分析結果不完整，再問一次");
  return json({ at: Date.now(), q, a: String(a.a), news: news.slice(0, 4).map(x => ({ t: x.t, src: x.src, u: x.u, at: x.at })) });
}

/* ---------- weekly review (Saturday 09:00 Taipei): the week's five trading days, written by the AI ---------- */
function weekPrompt(from, to, D, news) {
  const day = t => (t ? new Date(t).toISOString().slice(0, 10) : "");
  return [
    "You are the market strategist of a Taiwan equity research desk writing the WEEKLY REVIEW for one private investor. Write in Traditional Chinese as used in Taiwan. Be concrete and short; no filler.",
    "Taiwan colours: red = up, green = down. Use ONLY the numbers in DATA; never invent a level, ratio or event. Headlines are only titles: do not claim details a title does not state.",
    "DATA.days are the trading days of the week (TAIEX close, change %, turnover in NT$ 100 million, institutional net buying in NT$ 100 million per group). DATA.week has the week's change and range; DATA.sectors the sector moves compounded over the week.",
    "Nobody can know the future: for next week say what to watch and what would change the view; never promise a result. Be conservative.",
    'Return ONE JSON object and nothing else: {"call":"本週收紅|本週收黑|本週盤整","headline":"one sentence under 30 Chinese characters","market":"2 or 3 sentences: how the week went and why","lead":["strong sectors with the reason, max 3"],"lag":["weak sectors with the reason, max 3"],"flows":"one or two sentences on foreign / trust / dealer flows over the week","risks":["max 3"],"next":["what to watch next week, max 4 items, include dates only if a headline states them"]}',
    "",
    "WEEK: " + from + " to " + to,
    "DATA: " + JSON.stringify(D),
    "",
    "HEADLINES (last 7 days, newest first):",
    news.length ? news.map(x => "- " + day(x.at) + " " + x.t + (x.src ? "（" + x.src + "）" : "")).join("\n") : "(none found)",
  ].join("\n");
}
async function weekNote(env, notify, manual) {
  if (!env.GEMINI_KEY) return { error: "no GEMINI_KEY" };
  const days = []; let d = new Date(Date.now() + 8 * 3600e3);
  while (days.length < 5) { if (d.getUTCDay() % 6) days.unshift(d.toISOString().slice(0, 10)); d = new Date(d.getTime() - 864e5); }
  const reps = await Promise.all(days.map(async day => { const ds = day.replace(/-/g, ""); const [rep, inst] = await Promise.all([twDayReport(ds).catch(() => null), twInstDay(ds).catch(() => null)]); return rep && rep.taiex ? { day, rep, inst } : null; }));
  const ok = reps.filter(Boolean);
  if (ok.length < 2) return { error: "這個星期的收盤資料不足，或這週大多沒有交易" };
  const first = ok[0].rep.taiex, last = ok[ok.length - 1].rep.taiex, prev = first.z / (1 + (first.pct || 0) / 100);
  const weekPct = Math.round((last.z / prev - 1) * 10000) / 100, closes = ok.map(x => x.rep.taiex.z);
  const sec = new Map(); ok.forEach(x => x.rep.sectors.forEach(r => sec.set(r.name, (sec.get(r.name) || 1) * (1 + r.pct / 100))));
  const secs = [...sec].map(([name, m]) => ({ name, pct: Math.round((m - 1) * 10000) / 100 })).sort((a, b) => b.pct - a.pct);
  const D = {
    week: { fromClose: Math.round(prev * 100) / 100, toClose: last.z, changePct: weekPct, high: Math.max(...closes), low: Math.min(...closes) },
    days: ok.map(x => ({ day: x.day.slice(5), close: x.rep.taiex.z, pct: x.rep.taiex.pct, turnoverYi: x.rep.turnoverYi, inst: x.inst || [] })),
    sectors: { lead: secs.slice(0, 5), lag: secs.slice(-5).reverse() },
  };
  const [n1, n2] = await Promise.all([twHeadlines("台股 OR 加權指數 OR 外資 when:7d", 10).catch(() => []), twHeadlines("美股 OR 聯準會 OR 關稅 OR 半導體 when:7d", 8).catch(() => [])]);
  const seen = new Set(), news = [...n1, ...n2].filter(x => !seen.has(x.t) && seen.add(x.t)).sort((a, b) => b.at - a.at).slice(0, 14);
  const prompt = weekPrompt(ok[0].day, ok[ok.length - 1].day, D, news);
  let g = await geminiJson(env, prompt, 0.3, 0);
  for (let k = 1; g.error && [500, 502, 503, 504].includes(g.error.status) && k <= (manual ? 2 : 4); k++) {
    await new Promise(r => setTimeout(r, (manual ? 4000 : 20000) * k));
    g = await geminiJson(env, prompt, 0.3, k);
  }
  if (g.error) return { error: g.error.daily ? "今天的額度用完了" : aiWhy(g.error.status), daily: !!g.error.daily };
  let a = null; try { a = JSON.parse(g.text); } catch (e) { const t2 = String(g.text || ""), i = t2.indexOf("{"), j = t2.lastIndexOf("}"); try { a = JSON.parse(t2.slice(i, j + 1).replace(/,\s*([\]}])/g, "$1")); } catch (e2) { a = null; } }
  if (!a || !a.headline) return { error: "分析結果不完整，再按一次" };
  const note = { at: Date.now(), day: ok[ok.length - 1].day, from: ok[0].day, analysis: a, data: { week: D.week, days: D.days, sectors: D.sectors }, news: news.slice(0, 10).map(x => ({ t: x.t, src: x.src, u: x.u, at: x.at })) };
  const saved = await pmStore(env, "wput", { note }).catch(e => ({ error: String(e && e.message || e) }));
  if (!saved || !saved.ok) note.saveError = (saved && saved.error) || "not saved";
  if (notify) {
    const L = x => (Array.isArray(x) ? x.slice(0, 3) : []), sg = v => (v > 0 ? "+" : "") + Number(v).toFixed(2) + "%";
    const text = [
      `<b>🗓 ${note.from.slice(5).replace("-", "/")}–${note.day.slice(5).replace("-", "/")} 週回顧：${hesc(a.call || "")}</b>`,
      `${weekPct > 0 ? "🔺" : weekPct < 0 ? "🔻" : "▪️"} 加權 ${last.z.toFixed(2)}（本週 ${sg(weekPct)}）`,
      hesc(a.headline), "", hesc(a.market || ""),
      ...(L(a.lead).length ? ["", "<b>強勢</b> " + L(a.lead).map(hesc).join("；")] : []),
      ...(L(a.lag).length ? ["<b>弱勢</b> " + L(a.lag).map(hesc).join("；")] : []),
      ...(a.flows ? ["<b>法人</b> " + hesc(a.flows)] : []),
      ...(L(a.next).length ? ["", "<b>下週要盯</b> " + L(a.next).map(hesc).join("；")] : []),
      `<a href="https://si70531.github.io/TWstock/">完整內容</a>｜研究參考，不保證漲跌`,
    ].join("\n");
    note.sent = (await tgOn(env, "notes")) ? await tgSend(env, text) : "off";
  }
  return note;
}

async function closeRetry(env, now) {
  const t = new Date(now.getTime() + 8 * 3600e3), wd = t.getUTCDay(), m = t.getUTCHours() * 60 + t.getUTCMinutes();
  if (wd < 1 || wd > 5 || m < 15 * 60 + 45 || m > 18 * 60 || (m - (15 * 60 + 45)) % 15) return;
  const day = t.toISOString().slice(0, 10), have = (await pmStore(env, "cget").catch(() => ({}))).note;
  if (have && have.day === day) return;
  const r = await closeNote(env, true, false).catch(e => ({ error: String(e && e.message || e) }));
  if (r && r.error && m === 18 * 60 && !/沒有交易/.test(r.error)) await tgSend(env, "<b>收盤摘要沒有產生</b>\n" + hesc(r.error) + "\n\n可以到網站的盤前分析頁按「產生」再試。");
}
async function closeNote(env, notify, manual) {
  if (!env.GEMINI_KEY) return { error: "no GEMINI_KEY" };
  const t = new Date(Date.now() + 8 * 3600e3), day = t.toISOString().slice(0, 10), ds = day.replace(/-/g, "");
  const rep = await twDayReport(ds).catch(() => null);
  if (!rep || !rep.taiex) return { error: "證交所今天的收盤資料還沒出來（大約 14:30 之後），或今天沒有交易" };
  const [inst, flags, wl, pm, n1, n2, idxMis] = await Promise.all([
    twInstDay(ds), twFlags(ds), pmStore(env, "wl").catch(() => ({})), pmStore(env, "get").catch(() => ({})),
    twHeadlines("台股 OR 加權指數 OR 外資 when:1d", 10).catch(() => []), twHeadlines("台積電 OR 半導體 OR 美股 OR 關稅 when:1d", 8).catch(() => []),
    twMis(["tse_t00.tw"]).catch(() => []),
  ]);
  const by = new Map(rep.stocks.map(x => [x.c, x])), liq = rep.stocks.filter(x => x.lots >= 1000);
  const hold = wl.hold || [], codes = [...new Set([...hold, ...(wl.watch || [])])].slice(0, 30);
  let mine = codes.map(c => by.get(c)).filter(Boolean);
  const miss = codes.filter(c => !by.has(c));
  if (miss.length) mine = mine.concat((await twYahooTW(miss).catch(() => [])).filter(q => q.z > 0 && q.y > 0).map(q => ({ c: q.c, n: q.n || q.c, z: q.z, pct: Math.round((q.z / q.y - 1) * 10000) / 100 })));
  const T0 = idxMis.find(x => x.c === "t00"), pre = pm.note && pm.note.day === day && pm.note.analysis ? pm.note.analysis : null;
  const flagOf = c => ((flags.punish || []).some(p => p.c === c) ? "處置股" : (flags.notice || []).some(p => p.c === c) ? "注意股" : null);
  const D = {
    taiex: rep.taiex, turnoverYi: rep.turnoverYi, breadth: rep.breadth,
    open: T0 && T0.o > 0 && T0.y > 0 && T0.d === ds ? { open: T0.o, previousClose: T0.y, gapPoints: Math.round(T0.o - T0.y) } : null,
    sectors: { lead: rep.sectors.slice(0, 6), lag: rep.sectors.slice(-6).reverse() },
    gainers: liq.slice().sort((a, b) => b.pct - a.pct).slice(0, 8).map(x => ({ code: x.c, name: x.n, pct: x.pct })),
    losers: liq.slice().sort((a, b) => a.pct - b.pct).slice(0, 8).map(x => ({ code: x.c, name: x.n, pct: x.pct })),
    turnoverTop: rep.stocks.slice().sort((a, b) => b.val - a.val).slice(0, 8).map(x => ({ code: x.c, name: x.n, pct: x.pct, valueYi: Math.round(x.val / 1e7) / 10 })),
    institutions: inst || [],
    premarket: pre ? { open: pre.call, gap: pre.gap, close: pre.close && { call: pre.close.call, range: pre.close.range } } : null,
    mine: mine.map(x => ({ code: x.c, name: x.n, close: x.z, pct: x.pct, held: hold.includes(x.c), flag: flagOf(x.c) })),
  };
  const seen = new Set(), news = [...n1, ...n2].filter(x => !seen.has(x.t) && seen.add(x.t)).sort((a, b) => b.at - a.at).slice(0, 14);
  const prompt = closePrompt(day, D, news);
  let g = await geminiJson(env, prompt, 0.3, 0);
  for (let k = 1; g.error && [500, 502, 503, 504].includes(g.error.status) && k <= (manual ? 2 : 4); k++) {
    await new Promise(r => setTimeout(r, (manual ? 4000 : 20000) * k));
    g = await geminiJson(env, prompt, 0.3, k);
  }
  if (g.error) return { error: g.error.daily ? "今天的額度用完了" : aiWhy(g.error.status), daily: !!g.error.daily };
  let a = null; try { a = JSON.parse(g.text); } catch (e) { const t2 = String(g.text || ""), i = t2.indexOf("{"), j = t2.lastIndexOf("}"); try { a = JSON.parse(t2.slice(i, j + 1).replace(/,\s*([\]}])/g, "$1")); } catch (e2) { a = null; } }
  if (!a || !a.headline) return { error: "分析結果不完整，再按一次" };
  const note = { at: Date.now(), day, analysis: a, data: { taiex: rep.taiex, turnoverYi: rep.turnoverYi, breadth: rep.breadth, sectors: rep.sectors, institutions: inst || [], mine: D.mine }, news: news.slice(0, 10).map(x => ({ t: x.t, src: x.src, u: x.u, at: x.at })) };
  const saved = await pmStore(env, "cput", { note }).catch(e => ({ error: String(e && e.message || e) }));
  if (!saved || !saved.ok) note.saveError = (saved && saved.error) || "not saved";
  await reviewSave(env, day, pre, D.open, rep.taiex).catch(() => {});
  /* the owner's stocks newly on the attention or disposition list: each one is told once (forgotten 10 days after it was last seen) */
  const was = await pmStore(env, "flags").catch(() => ({})), keep = {}, newly = [], cut = new Date(Date.now() + 8 * 3600e3 - 10 * 864e5).toISOString().slice(0, 10);
  Object.entries(was || {}).forEach(([k, v]) => { if (typeof v === "string" && v >= cut) keep[k] = v; });
  codes.forEach(c => { const f = flagOf(c); if (!f) return; const k = c + ":" + f; if (!keep[k]) newly.push({ c, f }); keep[k] = day; });
  await pmStore(env, "flags", { set: keep }).catch(() => {});
  if (notify) {
    const sg = v => (v > 0 ? "+" : "") + Number(v).toFixed(2) + "%", arw = v => (v > 0 ? "🔺" : v < 0 ? "🔻" : "▪️"), L = x => (Array.isArray(x) ? x.slice(0, 3) : []);
    const nm = c => (by.get(c) || mine.find(x => x.c === c) || {}).n || c, X = rep.taiex;
    const text = [
      `<b>📋 ${day.slice(5).replace("-", "/")} 收盤摘要：${hesc(a.call || "")}</b>`,
      `${arw(X.pct)} 加權 ${X.z.toFixed(2)}（${X.pts != null ? (X.pct < 0 ? "-" : "+") + Math.abs(X.pts).toFixed(0) + " 點，" : ""}${sg(X.pct)}）${rep.turnoverYi ? "・成交 " + rep.turnoverYi.toLocaleString() + " 億" : ""}`,
      hesc(a.headline), "", hesc(a.market || ""),
      ...(a.check && (a.check.open || a.check.close) ? ["", "<b>盤前預測對帳</b>", ...[a.check.open, a.check.close, a.check.note].filter(Boolean).map(hesc)] : []),
      ...(L(a.lead).length ? ["", "<b>領漲</b> " + L(a.lead).map(hesc).join("；")] : []),
      ...(L(a.lag).length ? ["<b>落後</b> " + L(a.lag).map(hesc).join("；")] : []),
      ...(a.flows ? ["<b>法人</b> " + hesc(a.flows)] : []),
      ...(Array.isArray(a.mine) && a.mine.length ? ["", "<b>你的股票</b>", ...a.mine.slice(0, 20).map(x => `${hesc(x.name || x.code)} ${hesc(x.pct || "")}　${hesc(x.note || "")}`)] : []),
      ...(newly.length ? ["", "<b>⚠️ 新列入</b>", ...newly.map(x => `${hesc(nm(x.c))}（${x.c}）${x.f}${x.f === "處置股" ? "：交易受限制（分盤撮合、可能要預收款券）" : "：成交量或漲跌異常"}`)] : []),
      ...(L(a.next).length ? ["", "<b>下個交易日盯</b> " + L(a.next).map(hesc).join("；")] : []),
      `<a href="https://si70531.github.io/TWstock/">完整內容</a>｜研究參考，不保證漲跌`,
    ].join("\n");
    note.sent = (await tgOn(env, "notes")) ? await tgSend(env, text) : "off";
  }
  return note;
}

/* TWSE open data relayed through the worker: the browser cannot always reach openapi.twse.com.tw directly (CORS), the worker can */
const TW_OPEN = new Set(["opendata/t187ap05_L", "opendata/t187ap38_L", "opendata/t187ap41_L", "exchangeReport/TWT48U_ALL", "exchangeReport/BWIBBU_ALL"]);
async function twOpen(url, json, fail) {
  const p = String(url.searchParams.get("p") || "");
  if (!TW_OPEN.has(p)) return fail(400, "bad_request", "not allowed");
  try {
    const v = await twCached("open:" + p, 3600000, async () => {
      const r = await twFetch("https://openapi.twse.com.tw/v1/" + p, { headers: { "User-Agent": TW_UA, Accept: "application/json" } });
      const a = await r.json(); if (!Array.isArray(a)) throw new Error("bad data"); return a;
    });
    return json(v, 200, { "Cache-Control": "public, max-age=1800" });
  } catch (e) { return fail(502, "upstream", "open data unavailable"); }
}

/* ---- three more TWSE day reports: day trading, securities lending, foreign holding. Each tries the last trading days until one has data. ---- */
async function twRwdTable(path, ds, need) {
  return twCached("rwd:" + path + ds, 12 * 3600e3, async () => {
    const j = await (await twFetch(`https://www.twse.com.tw/rwd/zh/${path}${path.includes("?") ? "&" : "?"}date=${ds}&response=json`, { headers: { "User-Agent": TW_UA } })).json();
    const t = Array.isArray(j.tables) ? j.tables.find(x => x && Array.isArray(x.fields) && Array.isArray(x.data) && x.data.length > 50 && need(x.fields)) : (Array.isArray(j.fields) && Array.isArray(j.data) && need(j.fields) ? j : null);
    return j.stat === "OK" && t ? { fields: t.fields, data: t.data } : null;
  });
}
async function twFirstDay(path, need, skip) {
  let n = 0;
  for (const ds of taipeiDays(14)) {
    let t = null; try { t = await twRwdTable(path, ds, need); } catch (e) { twCache.delete("rwd:" + path + ds); }
    if (!t) { twCache.delete("rwd:" + path + ds); continue; }
    if (n++ >= (skip || 0)) return { ds, t };
  }
  return null;
}
const twDay8 = ds => ds.slice(0, 4) + "-" + ds.slice(4, 6) + "-" + ds.slice(6);
async function twDayTrade(json, fail) {
  const r = await twFirstDay("dayTrading/TWTB4U", f => f.includes("證券代號") && f.some(x => x.includes("當日沖銷交易成交股數")));
  if (!r) return fail(502, "NO_DATA", "當沖資料暫時讀不到");
  const f = r.t.fields, iC = f.indexOf("證券代號"), iS = f.findIndex(x => x.includes("當日沖銷交易成交股數")), iB = f.findIndex(x => x.includes("買進成交金額")), iL = f.findIndex(x => x.includes("賣出成交金額"));
  const rows = r.t.data.map(x => [String(x[iC]).trim(), Math.round((twNum(x[iS]) || 0) / 1000), Math.round((twNum(x[iB]) || 0) / 1e4), Math.round((twNum(x[iL]) || 0) / 1e4)]).filter(x => /^[0-9A-Z]{4,6}$/.test(x[0]) && x[1] > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 300);                    /* code, lots day-traded, bought (NT$ 10k), sold (NT$ 10k) */
  return json({ day: twDay8(r.ds), rows }, 200, { "Cache-Control": "public, max-age=600" });
}
async function twLending(json, fail) {
  const r = await twFirstDay("marginTrading/TWT93U", f => f.length >= 12 && f.includes("前日餘額") && f.includes("當日餘額"));
  if (!r) return fail(502, "NO_DATA", "借券資料暫時讀不到");
  const f = r.t.fields, iC = 0, iP = f.lastIndexOf("前日餘額"), iN = f.lastIndexOf("當日餘額"), iS = f.lastIndexOf("當日賣出");
  const rows = r.t.data.map(x => { const p = twNum(x[iP]) || 0, n = twNum(x[iN]) || 0; return [String(x[iC]).trim(), Math.round(n / 1000), Math.round((n - p) / 1000), Math.round((twNum(x[iS]) || 0) / 1000)]; })
    .filter(x => /^[0-9A-Z]{4,6}$/.test(x[0]));                    /* code, balance (lots), change (lots), sold today (lots) */
  const big = rows.filter(x => x[1] >= 500), top = (a, k, d, n) => a.slice().sort((p, q) => (q[k] - p[k]) * d).slice(0, n);
  return json({ day: twDay8(r.ds), up: top(big, 2, 1, 15), down: top(big, 2, -1, 15), bal: top(rows, 1, 1, 15) }, 200, { "Cache-Control": "public, max-age=600" });
}
async function twQfii(json, fail) {
  const need = f => f.includes("證券代號") && f.some(x => x.includes("全體外資及陸資持股比率"));
  const a = await twFirstDay("fund/MI_QFIIS?selectType=ALLBUT0999", need, 0);
  if (!a) return fail(502, "NO_DATA", "外資持股資料暫時讀不到");
  const b = await twFirstDay("fund/MI_QFIIS?selectType=ALLBUT0999", need, 5).catch(() => null);
  const grab = t => { const f = t.fields, iC = f.indexOf("證券代號"), iR = f.findIndex(x => x.includes("全體外資及陸資持股比率")), iH = f.findIndex(x => x.includes("全體外資及陸資持有股數")), m = {}; t.data.forEach(x => { const c = String(x[iC]).trim(); if (/^[0-9A-Z]{4,6}$/.test(c)) m[c] = [twNum(x[iR]), Math.round((twNum(x[iH]) || 0) / 1000)]; }); return m; };
  const now = grab(a.t), old = b ? grab(b.t) : {};
  const rows = Object.entries(now).filter(([, v]) => v[0] != null).map(([c, v]) => [c, v[0], old[c] && old[c][0] != null ? Math.round((v[0] - old[c][0]) * 100) / 100 : null, v[1]]);   /* code, ratio %, change vs ~5 days ago (pts), lots held */
  const withChg = rows.filter(x => x[2] != null && x[3] >= 1000);
  return json({ day: twDay8(a.ds), since: b ? twDay8(b.ds) : null, top: rows.slice().sort((p, q) => q[1] - p[1]).slice(0, 15), up: withChg.slice().sort((p, q) => q[2] - p[2]).slice(0, 15), down: withChg.slice().sort((p, q) => p[2] - q[2]).slice(0, 15) }, 200, { "Cache-Control": "public, max-age=600" });
}
