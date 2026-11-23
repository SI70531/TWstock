/* TWstock Worker (Cloudflare, name "twstock-ai"): the server side of https://si70531.github.io/TWstock/.
   Moved here from the EZexams repository; signs in with the same Supabase accounts.
     GET  /tw/rt?c=2330,2317&idx=1   intraday quotes (TWSE market information system, Yahoo Finance when that refuses)  (no sign-in)
     GET  /tw/news?c=2330&n=台積電    news headlines and the company's material announcements                         (no sign-in)
     GET  /tw/premarket              the latest pre-market note                                                     (no sign-in)
     POST /tw/analyze {t, code, name, facts}   the AI analyst team (one AI call per sign-in)
     POST /tw/premarket/run {t}                write a pre-market note now (one AI call)
     cron 05:30 Taipei on trading-day mornings: the pre-market note, sent to Telegram.
     GET  /health                    does Supabase answer, does GEMINI_KEY work
   Secrets: GEMINI_KEY, TG_TOKEN (Telegram bot). Deployed by .github/workflows/worker.yml with tools/wrangler.toml.
   Google does not offer Gemini in Hong Kong, so the Gemini call goes through the GeminiRelay Durable Object in North America. */
const ALLOWED = ["https://si70531.github.io"];
const SUPABASE_URL = "https://jyfmolrqxypufwjqexan.supabase.co";
const SUPABASE_KEY = "sb_publishable_YJbE5DyYa6UKsAbfsxjnWg_4VW4HVnr";
const MAX_BODY = 60000;
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-flash-preview", "gemini-flash-latest", "gemini-flash-lite-latest"];
const AI_HOUR = 600, AI_DAY = 3000;

let ENV = null;   /* the current request's bindings, so the data fetchers can reach the Asia relay */
export default {
  async scheduled(event, env, ctx) {
    ENV = env;
    if (event.cron === "* * * * *") ctx.waitUntil(Promise.all([watchTick(env, new Date(event.scheduledTime)).catch(() => {}), bellNotice(env, new Date(event.scheduledTime)).catch(() => {})]));
    else ctx.waitUntil(premarket(env, true));
  },
  async fetch(req, env) {
    ENV = env;
    const origin = req.headers.get("Origin") || "";
    const ok = ALLOWED.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": ok ? origin : ALLOWED[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    if (url.pathname === "/tw/news" && req.method === "GET") return twNewsRoute(url, json, fail);
    if (url.pathname === "/tw/chart" && req.method === "GET") return twChart(url, json, fail);
    if (url.pathname === "/tw/otc" && req.method === "GET") return twOtc(json, fail);
    if (url.pathname === "/tw/hist" && req.method === "GET") return twHist(url, json, fail);
    if (url.pathname === "/tw/premarket" && req.method === "GET") return json(await pmStore(env, "get"), 200, { "Cache-Control": "no-store" });

    /* everything below needs a Supabase sign-in */
    let tokenIn = url.searchParams.get("t") || (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let bodyText = null;
    if (req.method === "POST") {
      bodyText = await req.text();
      if (bodyText.length > MAX_BODY) return fail(413, "TOO_BIG", "Request too large");
      try { const b = JSON.parse(bodyText); if (b && b.t) tokenIn = b.t; } catch (e) {}
    }
    const acct = await supaUser(tokenIn);
    if (!acct) return fail(401, "NEED_LOGIN", "Sign in first");
    const who = "u" + acct.id.replace(/-/g, "");

    if (url.pathname === "/tw/analyze" && req.method === "POST") return twAnalyze(env, who, bodyText, json, fail);
    if (url.pathname === "/tw/alerts/sync" && req.method === "POST") {
      let b; try { b = JSON.parse(bodyText); } catch (e) { return fail(400, "BAD_JSON", "Body is not JSON"); }
      const clean = a => [...new Set((Array.isArray(a) ? a : []).map(v => String(v).trim()).filter(v => /^[0-9A-Z]{4,6}$/.test(v)))].slice(0, 60);
      return json(await pmStore(env, "watch", { who, watch: clean(b.watch), hold: clean(b.hold) }));
    }
    if (url.pathname === "/tw/premarket/run" && req.method === "POST") {
      const q = await guard(env, "pin:" + who, "ai");
      if (q.blocked) return fail(429, "RESOURCE_EXHAUSTED", "Limit reached for this sign-in; try again later", { "Retry-After": String(q.aiWait || 60) });
      const r = await premarket(env, true);   /* a manual run is also sent to Telegram (useful as a test) */
      return r.error ? fail(502, "AI_FAILED", r.error) : json(r);
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
const TW_HOSTS = ["mis.twse.com.tw", "www.twse.com.tw", "openapi.twse.com.tw", "mis.taifex.com.tw", "openapi.taifex.com.tw", "www.tpex.org.tw"];
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
async function twFut() {
  /* day session 08:45–13:45, night session 15:00–05:00 (Taipei). TAIFEX's own quote list often refuses Cloudflare,
     so Yahoo Taiwan and cnyes (both carry the front-month TAIEX future, night session included) are tried next */
  const t = new Date(Date.now() + 8 * 3600e3), m = t.getUTCHours() * 60 + t.getUTCMinutes();
  const night = m >= 15 * 60 || m < 5 * 60 + 5, day = m >= 8 * 60 + 45 && m < 13 * 60 + 45;
  const tag = (o, live) => Object.assign(o, { src: live ? (night ? "night" : "rt") : "eod", sess: night || m < 8 * 60 + 45 ? "夜盤" : "日盤" });
  for (const mt of night ? ["1"] : ["0", "1"]) {
    for (const direct of [false, true]) {
      try {
        const init = { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": TW_UA, Referer: "https://mis.taifex.com.tw/futures/" },
          body: JSON.stringify({ MarketType: mt, SymbolType: "F", KindID: "1", CID: "TXF", ExpireMonth: "", RowSize: "全部", PageNo: "", SortColumn: "", AscDesc: "A" }) };
        const r = direct ? await fetch("https://mis.taifex.com.tw/futures/api/getQuoteList", init) : await twFetch("https://mis.taifex.com.tw/futures/api/getQuoteList", init);
        const j = await r.json(), list = (j && j.RtData && j.RtData.QuoteList) || [];
        const q = list.find(x => /^TXF[A-Z]\d-[FM]$/.test(String(x.SymbolID || "")) && twNum(x.CLastPrice) > 0);
        if (q) {
          const tt = String(q.CTime || "").replace(/\D/g, "");
          return tag({ n: twClip(q.DispCName || "臺指期", 20), z: twNum(q.CLastPrice), y: twNum(q.CRefPrice), o: twNum(q.COpenPrice), h: twNum(q.CHighPrice), l: twNum(q.CLowPrice), v: twNum(q.CTotalVolume),
            tm: tt.length >= 6 ? tt.slice(0, 2) + ":" + tt.slice(2, 4) + ":" + tt.slice(4, 6) : "", via: "taifex" }, mt === "1" ? night : day);
        }
      } catch (e) {}
    }
  }
  try {
    const r = await fetch("https://tw.stock.yahoo.com/_td-stock/api/resource/StockServices.stockList;fields=avgPrice;symbols=WTX%26", { headers: { "User-Agent": TW_UA, Accept: "application/json" } });
    const x = (await r.json())[0], raw = k => (x && x[k] && x[k].raw != null ? twNum(x[k].raw) : null);
    if (x && raw("price") > 0) {
      const at = Date.parse(x.regularMarketTime || ""), tm = at ? new Date(at + 8 * 3600e3).toISOString().slice(11, 19) : "";
      return tag({ n: "臺指期近一", z: raw("price"), y: raw("regularMarketPreviousClose"), o: raw("regularMarketOpen"), h: raw("regularMarketDayHigh"), l: raw("regularMarketDayLow"), v: twNum(x.volume), tm, via: "yahoo" },
        (night || day) && at && Date.now() - at < 20 * 60000);
    }
  } catch (e) {}
  try {
    const r = await fetch("https://ws.api.cnyes.com/ws/api/v1/quote/quotes/TWF:TXF:FUTURES?column=I", { headers: { "User-Agent": TW_UA, Accept: "application/json" } });
    const x = ((await r.json()).data || [])[0];
    if (x && twNum(x["6"]) > 0) {
      const at = (+x["200007"] || 0) * 1000, tm = at ? new Date(at + 8 * 3600e3).toISOString().slice(11, 19) : "";
      return tag({ n: "臺指期", z: twNum(x["6"]), y: twNum(x["21"]), o: twNum(x["19"]), h: twNum(x["12"]), l: twNum(x["13"]), v: twNum(x["800001"]), tm, via: "cnyes" },
        (night || day) && at && Date.now() - at < 20 * 60000);
    }
  } catch (e) {}
  try {
    const a = await (await twFetch("https://openapi.taifex.com.tw/v1/DailyMarketReportFut", { headers: { "User-Agent": TW_UA, Accept: "application/json" } })).json();
    const month = x => String(x["ContractMonth(Week)"] || "").trim();
    const x = a.find(r => String(r.Contract).trim() === "TX" && /^\d{6}$/.test(month(r)) && !/盤後|After/i.test(String(r.TradingSession || "")) && twNum(r.Last) > 0);
    if (x) {
      const last = twNum(x.Last), chg = twNum(x.Change) || 0;
      return { src: "eod", sess: "日盤", n: "臺指期 " + month(x), z: last, y: last - chg, o: twNum(x.Open), h: twNum(x.High), l: twNum(x.Low), v: twNum(x.Volume), tm: "", d: String(x.Date || "") };
    }
  } catch (e) {}
  return null;
}
async function twRt(url, json) {
  const codes = [...new Set((url.searchParams.get("c") || "").split(",").map(v => v.trim()).filter(v => /^[0-9A-Z]{4,6}$/.test(v)))].slice(0, 80);
  const out = { at: Date.now(), q: [], idx: [], fut: null };
  const jobs = [];
  if (codes.length) jobs.push(twCached("q:" + codes.join(","), 4000, () => twMis(codes.flatMap(c => ["tse_" + c + ".tw", "otc_" + c + ".tw"]))).then(v => { out.q = v; }));
  if (url.searchParams.get("idx") === "1") {
    jobs.push(twCached("idx", 4000, () => twMis(["tse_t00.tw", "tse_t13.tw", "tse_t17.tw"])).then(v => { out.idx = v; }));
    jobs.push(twCached("fut", 4000, twFut).then(v => { out.fut = v; }));
  }
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
        const m = d.meta || d, q = (d.indicators && d.indicators.quote && d.indicators.quote[0]) || {}, cl = (q.close || d.close || []).filter(v => v > 0);
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
async function twHeadlines(q, n) {
  const r = await fetch("https://news.google.com/rss/search?q=" + encodeURIComponent(q) + "&hl=zh-TW&gl=TW&ceid=TW:zh-Hant", { headers: { "User-Agent": TW_UA } });
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
/* the company's own material announcements (TWSE open data: every listed company's announcements of the day) */
async function twAnnouncements(code) {
  const all = await twCached("ann", 600000, async () => {
    const r = await twFetch("https://openapi.twse.com.tw/v1/opendata/t187ap04_L", { headers: { "User-Agent": TW_UA, Accept: "application/json" } });
    return r.ok ? await r.json() : [];
  });
  const pick = (o, sub) => { const k = Object.keys(o).find(x => x.includes(sub)); return k ? o[k] : ""; };
  return (Array.isArray(all) ? all : []).filter(x => String(pick(x, "公司代號")).trim() === code).slice(0, 6)
    .map(x => ({ d: twClip(pick(x, "發言日期"), 12), t: twClip(pick(x, "主旨"), 200), body: twClip(pick(x, "說明"), 500) }));
}
async function twNewsRoute(url, json, fail) {
  const code = (url.searchParams.get("c") || "").trim(), name = twClip(url.searchParams.get("n"), 20);
  if (!/^[0-9A-Z]{4,6}$/.test(code)) return fail(400, "BAD_CODE", "Bad stock code");
  const v = await twCached("news:" + code, 300000, async () => {
    const [news, ann] = await Promise.all([twHeadlines((name ? name + " " : "") + code + " when:14d", 12).catch(() => []), twAnnouncements(code).catch(() => [])]);
    return { news, ann };
  });
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
"- Each analyst: stance is exactly one of 偏多, 中性, 偏空; 2 or 3 points, each ONE short sentence (under about 35 Chinese characters).",
"- Keep every other field short and plain too: headline under 25 Chinese characters, short_term / mid_term / why one sentence each, at most 3 conditions, risks and watch items.",
"- 'order' is the bottom line, read FIRST: one concrete order suggestion. action is exactly one of 買進, 分批買進, 觀望, 續抱, 減碼, 賣出. If DATA.research.myPosition exists the user already holds the stock, so choose among 續抱, 加碼 (write it as 分批買進), 減碼, 賣出; otherwise among 買進, 分批買進, 觀望. Give the order type and price (for example 限價 or 收盤站上某價位後), how to split it, the stop, one or two targets, and the risk-reward ratio, all from DATA levels. If the answer is to wait, action is 觀望 and say exactly what would change that.",
"",
"Return ONE JSON object and nothing else, in exactly this shape:",
'{"team":[{"role":"技術面分析師","stance":"偏多","points":["..."]},{"role":"基本面分析師","stance":"中性","points":["..."]},{"role":"籌碼面分析師","stance":"中性","points":["..."]},{"role":"時事與國際分析師","stance":"中性","points":["..."]},{"role":"風險控管","stance":"中性","points":["..."]}],',
'"order":{"action":"買進|分批買進|觀望|續抱|減碼|賣出","how":"order type, price and timing","split":"how to split the order","stop":"stop price and which level","targets":["first target and which level"],"rr":"risk-reward, e.g. 1 : 2.1","why":"one or two sentences"},',
'"summary":{"stance":"偏多|中性|偏空","confidence":"低|中|高","headline":"one sentence","short_term":"the next 1 to 2 weeks","mid_term":"the next 1 to 3 months",',
'"scenarios":[{"name":"樂觀","chance":"約 30%","trigger":"what has to happen","range":"price area"},{"name":"基本","chance":"約 50%","trigger":"...","range":"..."},{"name":"悲觀","chance":"約 20%","trigger":"...","range":"..."}],',
'"entry":{"now":"適合進場|等待訊號|不建議進場","conditions":["..."],"zone":"price zone","stop":"stop level and why","avoid":"when not to buy"},',
'"risks":["..."],"watch":["upcoming events or dates to watch"]}}',
"",
"DATA.research (when present) holds the page's own research tools for this stock: technical scenarios with support and resistance, a 10,000-run bootstrap 'time machine' (how often the target or the stop was hit first), backtests of four simple strategies with Taiwan costs and an out-of-sample split, and the user's own position, trades, events and valuation. Every analyst must use the parts that concern them (the 技術面 analyst the scenarios and time machine, 風險控管 the time machine, backtests and the user's position) and say when a backtest has too few trades to mean anything.",
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
async function twAnalyze(env, who, bodyText, json, fail) {
  if (!env.GEMINI_KEY) return fail(500, "INTERNAL", "The Worker has no GEMINI_KEY secret yet");
  let b; try { b = JSON.parse(bodyText); } catch (e) { return fail(400, "BAD_JSON", "Body is not JSON"); }
  const code = String((b && b.code) || "").trim(), name = twClip(b && b.name, 20) || code;
  if (!/^[0-9A-Z]{4,6}$/.test(code)) return fail(400, "BAD_CODE", "Bad stock code");
  let facts; try { facts = JSON.stringify(b.facts || {}); } catch (e) { facts = "{}"; }
  if (facts.length > 16000) return fail(413, "TOO_BIG", "Too much data");
  const q = await guard(env, "pin:" + who, "ai");
  if (q.blocked) return fail(429, "RESOURCE_EXHAUSTED", "Limit reached for this sign-in; try again later", { "Retry-After": String(q.aiWait || 60) });
  const [news, ann, world] = await Promise.all([
    twHeadlines(name + " " + code + " when:14d", 12).catch(() => []),
    twAnnouncements(code).catch(() => []),
    twCached("world", 600000, () => twHeadlines("台股 OR 美股 OR 聯準會 OR 關稅 OR 匯率 when:3d", 10)).catch(() => []),
  ]);
  const g = await geminiJson(env, twPrompt(code, name, facts, news, ann, world), 0.4, 0);
  if (g.error) return fail(g.error.status === 429 ? 429 : 502, "AI_FAILED", "The analysis could not be written right now", g.error.status === 429 ? { "Retry-After": "60" } : undefined);
  let a = null; try { a = JSON.parse(g.text); } catch (e) { const m = g.text.match(/\{[\s\S]*\}/); try { a = m ? JSON.parse(m[0]) : null; } catch (e2) { a = null; } }
  if (!a || !Array.isArray(a.team) || !a.summary) return fail(502, "AI_FAILED", "The analysis came back in an unexpected form; try again");
  return json({ at: Date.now(), analysis: a, news: news.map(x => ({ t: x.t, src: x.src, u: x.u, at: x.at })), ann: ann.map(x => ({ d: x.d, t: x.t })), world: world.map(x => ({ t: x.t, src: x.src, u: x.u, at: x.at })) });
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

/* ---------- Supabase accounts ---------- */
/* who is behind a Supabase access token? Asked of Supabase itself (so a deleted or signed-out account stops working),
   and remembered for a minute so a grading session does not ask on every call */
const userCache = new Map();
async function supaUser(jwt) {
  if (!jwt || typeof jwt !== "string" || jwt.length > 4000 || jwt.split(".").length !== 3) return null;
  const hit = userCache.get(jwt);
  if (hit && hit.until > Date.now()) return hit.user;
  let r; try { r = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + jwt } }); } catch (e) { return null; }
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  if (!u || !/^[0-9a-f-]{36}$/.test(String(u.id || ""))) return null;
  const user = { id: u.id, email: String(u.email || "") };
  if (userCache.size > 500) userCache.clear();
  userCache.set(jwt, { user, until: Date.now() + 60000 });
  return user;
}
/* a device PIN is kept only as an HMAC of account + device + PIN, made with a key only this Worker has */

/* AI calls per account: a running count per hour and per day (one Durable Object per account) */
async function guard(env, key, op) {
  if (!env.GUARD) return { blocked: false };
  const r = await env.GUARD.get(env.GUARD.idFromName(key)).fetch("https://guard/" + op, { method: "POST" });
  return r.json();
}
export class Guard {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const op = new URL(req.url).pathname.slice(1), now = Date.now();
    const d = (await this.state.storage.get("d")) || {};
    const hr = Math.floor(now / 3600000), day = Math.floor(now / 86400000);
    if (!d.ai || d.ai.hr !== hr) d.ai = { hr, n: 0, day: d.ai && d.ai.day === day ? d.ai.day : day, dn: d.ai && d.ai.day === day ? d.ai.dn : 0 };
    if (d.ai.day !== day) { d.ai.day = day; d.ai.dn = 0; }
    let blocked = false, aiWait = 0;
    if (op === "ai") {
      if (d.ai.n >= AI_HOUR) { blocked = true; aiWait = Math.ceil(((hr + 1) * 3600000 - now) / 1000); }
      else if (d.ai.dn >= AI_DAY) { blocked = true; aiWait = Math.ceil(((day + 1) * 86400000 - now) / 1000); }
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
  let last = { status: 502 };
  for (let k = 0; k < MODELS.length; k++) {
    const model = MODELS[(attempt + k) % MODELS.length];
    const target = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
    let r;
    try {
      r = env.RELAY ? await env.RELAY.get(env.RELAY.idFromName("gemini-relay-us"), { locationHint: "enam" }).fetch("https://relay/" + encodeURIComponent(target), { method: "POST", body })
                    : await callGemini(env, target, body);
    } catch (e) { last = { status: 502 }; continue; }
    if (!r.ok) { if (r.status !== 404 || last.status === 502) last = { status: r.status }; if ([404, 429, 500, 502, 503, 504].includes(r.status)) continue; return { error: last }; }   /* a retired model (404) must not hide the 429 / 503 the others gave */
    const j = await r.json().catch(() => null), c = j && j.candidates && j.candidates[0];
    const text = c && c.content && Array.isArray(c.content.parts) ? c.content.parts.filter(p => !p.thought).map(p => p.text || "").join("") : "";
    if (text.trim()) return { text };
    last = { status: 502 };
  }
  return { error: last };
}
/* ---------- health: is each secret still good? ---------- */
async function health(env) {
  const out = { checkedAt: new Date().toISOString(), gemini: { ok: false }, supabase: { ok: false } };
  try {
    const r = await fetch(SUPABASE_URL + "/auth/v1/health", { headers: { apikey: SUPABASE_KEY } });
    out.supabase.ok = r.ok; out.supabase.status = r.status; out.supabase.secret = !!env.SUPABASE_SECRET_KEY;   /* is the device-PIN secret set? (never its value) */
  } catch (e) { out.supabase.error = String(e.message || e); }
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
    if (op === "put") { const h = (await st.get("hist")) || []; h.unshift(b.note); h.length = Math.min(h.length, 14); await st.put("hist", h); return Response.json({ ok: true }); }
    if (op === "chat") { if (b.set) await st.put("chat", b.set); return Response.json({ chat: (await st.get("chat")) || null, offset: (await st.get("off")) || 0 }); }
    if (op === "off") { await st.put("off", b.off || 0); return Response.json({ ok: true }); }
    /* the alert list belongs to the first account that sent one (the site owner); other accounts are ignored */
    if (op === "watch") {
      const owner = await st.get("owner");
      if (owner && owner !== b.who) return Response.json({ ok: false, owner: false });
      await st.put("owner", b.who); await st.put("wl", { watch: b.watch, hold: b.hold, at: Date.now() });
      return Response.json({ ok: true, owner: true, n: new Set([...b.watch, ...b.hold]).size });
    }
    if (op === "wl") return Response.json((await st.get("wl")) || { watch: [], hold: [] });
    if (op === "bell") { const k = "bell:" + b.kind, was = await st.get(k); if (was === b.day) return Response.json({ first: false }); await st.put(k, b.day); return Response.json({ first: true }); }
    if (op === "state") { if (b.set) await st.put("al", b.set); return Response.json((await st.get("al")) || {}); }
    const h = (await st.get("hist")) || [];
    return Response.json({ note: h[0] || null, history: h.slice(1, 7).map(x => ({ at: x.at, day: x.day, call: x.analysis && x.analysis.call })) });
  }
}
/* night-session TAIEX futures (MarketType "1"), or the futures exchange's after-hours daily report */
async function pmNight() {
  /* the night session's last quote (TAIFEX, Yahoo Taiwan or cnyes) plus TAIFEX's daily report when it answers */
  const f = await twFut().catch(() => null);
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
async function pmWorld() {
  const r = await fetch("https://query1.finance.yahoo.com/v7/finance/spark?range=5d&interval=1d&symbols=" + encodeURIComponent(PM_SYMS.map(x => x[0]).join(",")), { headers: { "User-Agent": TW_UA, Accept: "application/json" } });
  if (!r.ok) return [];
  const j = await r.json();
  const rows = j && j.spark && Array.isArray(j.spark.result) ? j.spark.result.map(x => ({ s: x.symbol, d: (x.response || [])[0] || {} })) : Object.entries(j || {}).map(([s, d]) => ({ s, d: d || {} }));
  return rows.map(({ s, d }) => {
    const m = d.meta || d, q = (d.indicators && d.indicators.quote && d.indicators.quote[0]) || {}, cl = (q.close || d.close || []).filter(v => v > 0);
    const last = twNum(m.regularMarketPrice) || cl[cl.length - 1], prev = cl.length > 1 ? cl[cl.length - 2] : twNum(m.chartPreviousClose);
    const nm = (PM_SYMS.find(x => x[0] === s) || [s, s])[1], t = m.regularMarketTime ? new Date((m.regularMarketTime + 8 * 3600) * 1000).toISOString().slice(0, 16).replace("T", " ") : "";
    return last > 0 ? { name: nm, symbol: s, last: Math.round(last * 100) / 100, changePct: prev > 0 ? Math.round((last / prev - 1) * 10000) / 100 : null, asOfTaipei: t } : null;
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
function pmPrompt(day, madeAt, night, world, inst, news, cands) {
  const list = (a, f) => (a && a.length ? a.map(f).join("\n") : "(none found)");
  return [
"You are the pre-market desk of a Taiwan equity research team, writing for one private investor. It is now " + madeAt + " Taipei time. You are calling the open of the NEXT Taiwan trading session: 09:00 on " + day + " (" + WD[new Date(day + "T00:00:00Z").getUTCDay()] + ").",
"Whenever you say 今日, 明日 or 今晚, name the date instead (for example 11/24 開盤), so the reader never has to guess which day you mean.",
"Write everything in Traditional Chinese as used in Taiwan. Be concrete; no filler.",
"",
"Weigh every factor that can move the Taiwan market at today's open: the TAIEX futures night session (it trades 15:00 to 05:00 and is the most direct signal of the open), the US close (S&P 500, Nasdaq, Philadelphia Semiconductor, TSMC ADR versus its Taiwan price, Nvidia), the VIX, US yields and the dollar, the NT dollar, oil, yesterday's institutional flows in Taiwan, and the news: Fed and US data, tariffs and export controls, geopolitics, big earnings, Taiwan policy.",
"",
"Rules:",
"- Use ONLY the numbers in DATA and the headlines given. Never invent a price, a figure or an event; if something important is missing say so.",
"- Keep it SHORT and plain, for reading on a phone: every sentence under about 35 Chinese characters, headline under 25, each list at most 3 items. No jargon where a plain word works.",
"- TSMC ADR: one ADR is 5 shares; if you compare it with the Taiwan price, say that you need the exchange rate and use the one in DATA.",
"- 'picks': one entry for EVERY stock in DATA.candidates, none left out: all 持股 first, then all 自選, then the 強勢 ones (the strongest movers, potential stocks), best first within each group. tag says why it is a candidate (持股 = the user holds it, 自選 = on the user's watchlist, 強勢 = strong mover yesterday with volume). For each give one concrete order like a trader would: action is exactly one of 買進, 分批買進, 觀望, 續抱, 減碼, 賣出 (for a 持股 choose among 續抱, 分批買進 as adding, 減碼, 賣出); how = order type and price (限價 or after a close above a named level), split = how to split the order, stop = the stop price and which level it is, targets = one or two target prices with the level they come from, rr = risk-reward like 1 : 2.0, why = one or two sentences tying the stock to tonight's factors. Every price must come from that candidate's numbers (ma5/ma20/ma60, bollinger, 20/60-day highs and lows, last close) or be a round number near them, and say which. If a stock is not worth buying today its action is 觀望 (or 續抱 / 減碼 / 賣出 for a 持股) and why says what would change that; say in picks_note how many are worth acting on.",
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
'"picks":[{"code":"2454","name":"聯發科","tag":"強勢|自選|持股","action":"分批買進","how":"...","split":"...","stop":"...","targets":["..."],"rr":"1 : 2.0","why":"..."}],"picks_note":"one sentence on the candidates overall"}',
"",
"DATA.night (TAIEX futures, TAIFEX): " + JSON.stringify(night),
"DATA.anchor: " + JSON.stringify(pmAnchor(night, world)),
"DATA.world (Yahoo Finance, last price and % change from the previous close, time in Taipei): " + JSON.stringify(world),
"DATA.institutions (TWSE, NT$ 100 million, previous trading day): " + JSON.stringify(inst),
"DATA.candidates (computed here from Yahoo Taiwan daily bars up to the last close; prices NT$, volume in lots): " + JSON.stringify(cands || []),
"",
"HEADLINES (last 24 hours, newest first):",
list(news, x => "- " + (x.at ? new Date(x.at + 8 * 3600e3).toISOString().slice(5, 16).replace("T", " ") : "") + " " + x.t + (x.src ? "（" + x.src + "）" : "")),
  ].join("\n");
}
const WD = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
/* the next Taiwan session to open: today before 09:00 on a weekday, otherwise the next weekday (exchange holidays are not known here) */
function nextOpenDay(now) {
  let t = new Date(now.getTime() + 8 * 3600e3);
  if (!(t.getUTCDay() >= 1 && t.getUTCDay() <= 5 && t.getUTCHours() < 9)) { t = new Date(t.getTime() + 864e5); while (t.getUTCDay() === 0 || t.getUTCDay() === 6) t = new Date(t.getTime() + 864e5); }
  return t.toISOString().slice(0, 10);
}
/* candidates for the pre-market picks: the owner's holdings and watchlist, plus yesterday's strongest movers with volume;
   each with a few numbers from about a year of Yahoo Taiwan daily bars */
async function pmCandidates(env) {
  /* every holding and every watchlist stock, plus the 5 strongest movers (capped at 35 in all to stay within the Worker's request limit) */
  const wl = await pmStore(env, "wl").catch(() => ({})), hold = (wl.hold || []).slice(0, 30), watch = (wl.watch || []).filter(c => !hold.includes(c)).slice(0, Math.max(0, 30 - hold.length));
  const mkt = new Map(), strong = [];
  try {
    const a = await (await twFetch("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", { headers: { "User-Agent": TW_UA, Accept: "application/json" } })).json();
    (Array.isArray(a) ? a : []).forEach(x => { const c = String(x.Code || "").trim(), z = twNum(x.ClosingPrice), ch = twNum(x.Change), v = Math.round((twNum(x.TradeVolume) || 0) / 1000), val = twNum(x.TradeValue) || 0;
      if (!/^\d{4}$/.test(c) || !(z > 0)) return; mkt.set(c, "TW"); const p = ch != null ? ch / (z - ch) * 100 : 0; if (p >= 3 && v >= 2000 && z >= 10) strong.push({ c, val, n: String(x.Name || "").trim() }); });
  } catch (e) {}
  try {
    const o = await (await fetch("https://raw.githubusercontent.com/SI70531/TWstock/data/otc.json", { headers: { "User-Agent": TW_UA } })).json();
    (o.list || []).forEach(x => { if (!mkt.has(x[0])) mkt.set(x[0], "TWO"); const p = x[2] > 0 && x[3] != null ? x[3] / (x[2] - x[3]) * 100 : 0; if (x[8] === "otc" && /^\d{4}$/.test(x[0]) && p >= 3 && x[7] >= 2000 && x[2] >= 10) strong.push({ c: x[0], val: x[2] * x[7] * 1000, n: x[1] }); });
  } catch (e) {}
  const pick = strong.sort((a, b) => b.val - a.val).map(x => x.c).filter(c => !hold.includes(c) && !watch.includes(c)).slice(0, 5);
  const list = [...hold.map(c => [c, "持股"]), ...watch.map(c => [c, "自選"]), ...pick.map(c => [c, "強勢"])];
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
        volumeVs20d: v20 ? r2(vols[n - 1] / v20) : null, return5dPct: r2((last / cl[n - 6] - 1) * 100), return20dPct: n > 20 ? r2((last / cl[n - 21] - 1) * 100) : null };
    } catch (e) { return null; }
  }));
  return out.filter(Boolean);
}
/* the night future against the last TAIEX close: the main anchor for the opening gap */
function pmAnchor(night, world) {
  const tw = (world || []).find(x => x.symbol === "^TWII"), q = night && night.quote;
  if (!tw || !q || !(q.last > 0)) return null;
  return { taiexClose: tw.last, nightFuture: q.last, diffPoints: Math.round(q.last - tw.last), diffPct: Math.round((q.last / tw.last - 1) * 10000) / 100, futureTime: q.time };
}
async function premarket(env, notify) {
  if (!env.GEMINI_KEY) return { error: "no GEMINI_KEY" };
  const day = nextOpenDay(new Date()), madeAt = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
  const [night, world, inst, n1, n2, n3, cands] = await Promise.all([
    pmNight().catch(() => null), pmWorld().catch(() => []), pmInst().catch(() => null),
    twHeadlines("台股 OR 台指期 OR 夜盤 when:1d", 10).catch(() => []),
    twHeadlines("美股 OR 聯準會 OR 費半 OR 台積電ADR when:1d", 10).catch(() => []),
    twHeadlines("關稅 OR 出口管制 OR 地緣政治 OR 匯率 OR 輝達 when:1d", 8).catch(() => []),
    pmCandidates(env).catch(() => []),
  ]);
  const seen = new Set(), news = [...n1, ...n2, ...n3].filter(x => !seen.has(x.t) && seen.add(x.t)).sort((a, b) => b.at - a.at).slice(0, 24);
  const g = await geminiJson(env, pmPrompt(day, madeAt, night, world, inst, news, cands), 0.3, 0);
  if (g.error) return { error: g.error.status === 429 ? "Gemini 用量到上限" : "Gemini 錯誤 " + g.error.status };
  let a = null; try { a = JSON.parse(g.text); } catch (e) { const m = g.text.match(/\{[\s\S]*\}/); try { a = m ? JSON.parse(m[0]) : null; } catch (e2) { a = null; } }
  if (!a) { const t = String(g.text || "").replace(/^```(?:json)?|```$/g, "").trim(), i = t.indexOf("{"), j = t.lastIndexOf("}"); try { a = JSON.parse(t.slice(i, j + 1).replace(/,\s*([\]}])/g, "$1")); } catch (e) { a = null; } }
  if (!a || !a.call) return { error: "AI 回覆格式不對（" + String(g.text || "").length + " 字）" };
  if (Array.isArray(a.picks)) {
    const ord = { 持股: 0, 自選: 1, 強勢: 2 }, tagOf = c => (cands.find(x => x.code === c) || {}).tag;
    a.picks = a.picks.filter(x => x && cands.some(c => c.code === String(x.code))).map(x => Object.assign(x, { tag: tagOf(String(x.code)) || x.tag }))
      .sort((x, y) => (ord[x.tag] ?? 3) - (ord[y.tag] ?? 3));
  }
  const note = { at: Date.now(), day, madeAt, analysis: a, data: { night, world, inst, candidates: cands.map(c => ({ code: c.code, name: c.name, tag: c.tag })) }, news: news.slice(0, 12).map(x => ({ t: x.t, src: x.src, u: x.u, at: x.at })) };
  await pmStore(env, "put", { note });
  if (notify) note.sent = await pmTelegram(env, a, day);
  return note;
}
/* Telegram: the bot token is the TG_TOKEN secret; the chat is whoever first sent the bot a message (kept after that) */
async function pmTelegram(env, a, day) {
  if (!env.TG_TOKEN) return "no TG_TOKEN";
  const api = m => "https://api.telegram.org/bot" + env.TG_TOKEN + "/" + m;
  let { chat } = await pmStore(env, "chat");
  if (!chat) {
    try { const u = await (await fetch(api("getUpdates"))).json(); const m = (u.result || []).map(x => x.message || x.channel_post).find(x => x && x.chat); if (m) { chat = m.chat.id; await pmStore(env, "chat", { set: chat }); } } catch (e) {}
  }
  if (!chat) return "no chat yet: send the bot any message first";
  const esc = v => String(v == null ? "" : v).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);
  const ch = a.chances || {}, f = (Array.isArray(a.factors) ? a.factors : []).slice(0, 6);
  const text = [
    `<b>預測 ${esc(day.slice(5).replace("-", "/"))}（${WD[new Date(day + "T00:00:00Z").getUTCDay()]}）台股開盤：${esc(a.call)}</b>（信心 ${esc(a.confidence || "—")}，${esc(a.gap || "")}）`,
    esc(a.headline || ""), "",
    `開高 ${esc(ch["開高"] || "—")}｜平盤 ${esc(ch["平盤"] || "—")}｜開低 ${esc(ch["開低"] || "—")}`,
    ...(a.close && a.close.call ? [`<b>收盤：${esc(a.close.call)}</b>（${esc(a.close.range || "")}）${esc(a.close.why || "")}`] : []), "",
    `<b>夜盤</b> ${esc(a.night || "—")}`, `<b>美股</b> ${esc(a.us || "—")}`, "",
    ...f.map(x => `${x.effect === "利多" ? "🔺" : x.effect === "利空" ? "🔻" : "▪️"} ${esc(x.name)}：${esc(x.note)}`), "",
    `<b>開盤後盯</b> ${esc((a.watch || []).slice(0, 3).join("；"))}`,
    ...(Array.isArray(a.picks) && a.picks.length ? ["", "<b>潛力股與下單建議</b>", ...a.picks.map(x => `${/賣|減/.test(x.action) ? "🔻" : /觀望|續抱/.test(x.action) ? "▪️" : "🔺"} <b>${esc(x.name)}（${esc(x.code)}）${esc(x.action)}</b>　${esc(x.how || "")}\n　停損 ${esc(x.stop || "—")}｜目標 ${esc((x.targets || []).join("、") || "—")}｜${esc(x.rr || "")}`)] : []),
    `<a href="https://si70531.github.io/TWstock/">完整分析</a>｜AI 研究參考，不保證漲跌`,
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
async function watchTick(env, now) {
  const ses = twSession(now); if (!ses || !env.DAILY) return;
  const st = await pmStore(env, "state"), S = st.day === ses.day ? st : { day: ses.day, lv: {}, seen: st.seen || [], newsAt: 0 };
  /* a level fires once per session: ±1.5%, ±3%, ±4.5% … for the index; a reversal through zero to the other side fires again */
  const msgs = [], fire = (key, pct, step, line) => {
    const lv = Math.trunc(pct / step), prev = S.lv[key] || 0;
    if (lv && (Math.abs(lv) > Math.abs(prev) || Math.sign(lv) !== Math.sign(prev || lv))) { S.lv[key] = lv; msgs.push(line); }
  };
  const sg = v => (v > 0 ? "+" : "") + v.toFixed(2) + "%", arrow = v => (v > 0 ? "🔺" : "🔻");
  const wl = await pmStore(env, "wl"), codes = [...new Set([...(wl.hold || []), ...(wl.watch || [])])];
  if (ses.s === "day") {
    const idx = await twMis(["tse_t00.tw"]).catch(() => []), x = idx.find(r => r.c === "t00");
    let z = x && x.z, y = x && x.y;
    if (!(z > 0 && y > 0)) { const yq = await twYahoo(["^TWII"]).catch(() => []); if (yq[0]) { z = yq[0].z; y = yq[0].y; } }
    if (z > 0 && y > 0) { const p = (z / y - 1) * 100; fire("TAIEX", p, IDX_STEP, `${arrow(p)} <b>加權指數 ${sg(p)}</b>　${z.toFixed(2)}（${p > 0 ? "+" : ""}${(z - y).toFixed(0)} 點）`); }
    if (codes.length) {
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
    if (f && f.src === "night" && f.z > 0 && f.y > 0) { const p = (f.z / f.y - 1) * 100; fire("TXN", p, IDX_STEP, `${arrow(p)} <b>台指期夜盤 ${sg(p)}</b>　${f.z}（${p > 0 ? "+" : ""}${(f.z - f.y).toFixed(0)} 點）`); }
  }
  /* news and the watched companies' material announcements, judged by the AI every 15 minutes */
  if (now.getTime() - (S.newsAt || 0) >= 14 * 60000) {
    S.newsAt = now.getTime();
    const ev = await watchNews(env, codes, S).catch(() => []);
    ev.forEach(e => msgs.push(`${e.impact === "利多" ? "🟥" : e.impact === "利空" ? "🟩" : "⚠️"} <b>${hesc(e.title)}</b>\n${hesc(e.why)}${e.link ? `\n<a href="${hesc(e.link)}">來源</a>` : ""}`));
  }
  await pmStore(env, "state", { set: S });
  if (msgs.length) await tgSend(env, `<b>${ses.s === "day" ? "台股盤中" : "夜盤"}警示</b>\n\n` + msgs.join("\n\n") + "\n\n<i>AI 與自動監控，研究參考</i>");
}
async function watchNews(env, codes, S) {
  const seen = new Set(S.seen || []), fresh = [], cut = Date.now() - 90 * 60000;
  const [a, b] = await Promise.all([
    twHeadlines("台股 OR 台指期 OR 台積電 OR 美股 OR 聯準會 when:1h", 12).catch(() => []),
    twHeadlines("關稅 OR 出口管制 OR 地緣政治 OR 輝達 OR 半導體 when:1h", 10).catch(() => []),
  ]);
  [...a, ...b].forEach(x => { if (x.at >= cut && !seen.has(x.t)) { seen.add(x.t); fresh.push({ k: "news", t: x.t, src: x.src, u: x.u }); } });
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
    "Pick ONLY the items that are likely to move the Taiwan market as a whole, or one of those stocks, meaningfully today (for example a surprise Fed or tariff decision, export controls, a war or disaster, a big earnings surprise, a major customer order, a trading halt, a capital change). Ignore routine items, opinion pieces, repeats and small moves. Usually the answer is none.",
    "Write in Traditional Chinese as used in Taiwan. Use only what the titles say; do not invent details.",
    'Return ONE JSON object: {"alerts":[{"n":item number,"title":"short title","impact":"利多|利空|不確定","why":"one sentence: what it means for Taiwan stocks or which holding"}]} — an empty list when nothing matters.',
    "",
    fresh.map((x, i) => `${i + 1}. [${x.k === "ann" ? "公司重大訊息" : "新聞"}] ${x.t}${x.src ? "（" + x.src + "）" : ""}${x.body ? " — " + x.body : ""}`).join("\n"),
  ].join("\n");
  const g = await geminiJson(env, prompt, 0.2, 0);
  if (g.error) return [];
  let r = null; try { r = JSON.parse(g.text); } catch (e) { const m = g.text.match(/\{[\s\S]*\}/); try { r = m ? JSON.parse(m[0]) : null; } catch (e2) { r = null; } }
  return (r && Array.isArray(r.alerts) ? r.alerts : []).slice(0, 5).map(x => ({ title: twClip(x.title, 80), impact: x.impact, why: twClip(x.why, 200), link: (fresh[(+x.n || 0) - 1] || {}).u || "" }));
}

/* ---------- index and futures charts (Yahoo Taiwan): 1-minute bars of the session, or daily bars for about a year ---------- */
const CHART_SYM = { t00: "^TWII", fut: "WTX&", t13: "^TELI", t17: "^TFNI" };
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
  const kind = m >= 541 && m <= 545 ? "open" : m >= 811 && m <= 816 ? "close" : null; if (!kind) return;
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

