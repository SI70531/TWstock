import { TW_UA, twCache, twCached, twFetch } from "./core.js";
import { pmStore } from "./do.js";
import { pmWorld } from "./notes.js";


export const twNum = v => { const n = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
export const twClip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
export async function twMis(chs) {
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
export async function twFut(cid = "TXF") {
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
export async function twRt(url, json) {
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
export async function twYahoo(codes) {
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
export async function twHeadlines(q, n, us) {
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
export const twTaipeiDay = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");
export async function twAnnouncements(code, env) {
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
export async function twNewsRoute(url, json, fail, env) {
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
/* the same device's analysis of a stock is kept for the rest of the Taipei day, so opening it again costs no AI call
   (kept per device because the page sends the user's own position and trades with it) */
export const twToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
export const PM_SYMS = [["^GSPC", "S&P 500"], ["^IXIC", "Nasdaq"], ["^DJI", "道瓊"], ["^SOX", "費城半導體"], ["TSM", "台積電 ADR"], ["^VIX", "VIX"], ["^TNX", "美 10 年債殖利率"], ["TWD=X", "美元兌新台幣"], ["DX-Y.NYB", "美元指數"], ["CL=F", "原油"], ["NVDA", "輝達"], ["^TWII", "加權指數"], ["^N225", "日經"]];
export const WD = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
/* candidates for the pre-market picks: stocks recommended for an order today (screened below), the owner's holdings and watchlist;
   each with a few numbers from about a year of Yahoo Taiwan daily bars */
export const PM_FIXED = ["0050", "2330", "2454"];
export const hesc = v => String(v == null ? "" : v).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);
export const IDX_STEP = 1.5, STK_STEP = 5;
/* which session is open now (Taipei); weekends: no day session, night session runs Monday–Friday evenings into the next morning */
export function twSession(d) {
  const t = new Date(d.getTime() + 8 * 3600e3), wd = t.getUTCDay(), m = t.getUTCHours() * 60 + t.getUTCMinutes();
  if (wd >= 1 && wd <= 5 && m >= 9 * 60 && m <= 13 * 60 + 30) return { s: "day", day: t.toISOString().slice(0, 10), m };
  if ((wd >= 1 && wd <= 5 && m >= 15 * 60) || (wd >= 2 && wd <= 6 && m < 5 * 60)) {
    const start = m < 5 * 60 ? new Date(t.getTime() - 864e5) : t;
    return { s: "night", day: start.toISOString().slice(0, 10) + "N", m };
  }
  return null;
}
/* Telegram messages the owner can switch off on the site (all on unless set to false) */
export const ALERT_OPTS = ["stock", "index", "news", "bell", "notes"];
export const tgOn = async (env, k) => ((await pmStore(env, "wl").catch(() => ({}))).opt || {})[k] !== false;

/* ---------- index and futures charts (Yahoo Taiwan): 1-minute bars of the session, or daily bars for about a year ---------- */
export const CHART_SYM = { t00: "^TWII", fut: "WTX&", o00: "^TWOII", exf: "WTE&", dji: "^DJI", spx: "^GSPC", ixic: "^IXIC", sox: "^SOX", t13: "^TELI", t17: "^TFNI" };
export async function twChart(url, json, fail) {
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
export async function twOtc(json, fail) {
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
export async function twHist(url, json, fail) {
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
export async function twYahooTW(codes) {
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

/* ---------- the close summary: 15:30 Taipei on trading days (TWSE's daily report and the day's institutional flows are out by then) ---------- */
export const CLOSE_CRON = "30 7 * * MON-FRI", MID_CRON = "0 5 * * MON-FRI", WEEK_CRON = "0 1 * * SAT";   /* 15:30 and 13:00 Taipei */
export const pctOf = (z, ch) => (z > 0 && ch != null && z - ch > 0 ? Math.round(ch / (z - ch) * 10000) / 100 : null);
/* TWSE's daily report for one day: indices (sector indices included), turnover, breadth and every stock's close */
export async function twDayReport(ds) {
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
export async function twInstDay(ds) {
  try {
    const j = await (await twFetch(`https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate=${ds}&response=json`, { headers: { "User-Agent": TW_UA } })).json();
    if (j.stat === "OK" && Array.isArray(j.data)) return j.data.map(r => [String(r[0]).trim(), Math.round(twNum(r[3]) / 1e6) / 100]);
  } catch (e) {}
  return null;
}
/* TWSE's attention list (注意股) for a day and the disposition list (處置股) in force */
export async function twFlags(ds) {
  const get = async u => { try { const j = await (await twFetch(u, { headers: { "User-Agent": TW_UA } })).json(); return j.stat === "OK" ? j : null; } catch (e) { return null; } };
  const [n, p] = await Promise.all([get(`https://www.twse.com.tw/rwd/zh/announcement/notice?response=json&startDate=${ds}&endDate=${ds}`), get("https://www.twse.com.tw/rwd/zh/announcement/punish?response=json")]);
  const col = (j, k) => (j && Array.isArray(j.fields) ? j.fields.indexOf(k) : -1);
  const notice = n ? (n.data || []).map(r => ({ c: String(r[col(n, "證券代號")]).trim(), n: String(r[col(n, "證券名稱")]).trim() })).filter(x => /^\d{4}$/.test(x.c)) : null;
  const punish = p ? (p.data || []).map(r => ({ c: String(r[col(p, "證券代號")]).trim(), n: String(r[col(p, "證券名稱")]).trim(), period: String(r[col(p, "處置起迄時間")] || "") })).filter(x => /^\d{4}$/.test(x.c)) : null;
  return { notice, punish };
}
/* the 15:30 run can fail (TWSE's day report not out yet, Gemini busy, or the free AI quota used up until it resets at midnight US Pacific,
   16:00 or 15:00 Taipei): try again every 15 minutes until 18:00; if there is still none, say why on Telegram */
/* ---------- more market data for the page ---------- */
export const taipeiDays = (n, from) => { const out = []; let d = new Date((from || Date.now()) + 8 * 3600e3); while (out.length < n) { if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10).replace(/-/g, "")); d = new Date(d.getTime() - 864e5); } return out; };
export const codeOf = url => { const c = String(url.searchParams.get("c") || "").trim().toUpperCase(); return /^[0-9A-Z]{4,6}$/.test(c) ? c : ""; };

/* US indices, SOX, FX, oil and the 10-year yield (the same list the pre-market note reads) */
/* NYSE regular session, New York time: Mon-Fri 09:30-16:00 (holidays and early closes included), so the US rows can be kept fresh only while it matters */
export function twUsOpen(now) {
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
export async function twWorldRoute(json, fail) {
  const live = twUsOpen();   /* while Wall Street trades the rows are kept 10 s, otherwise 5 minutes */
  const rows = await twCached(live ? "worldlive" : "worldrows2", live ? 10000 : 300000, () => pmWorld(true)).catch(() => []);
  if (!rows.length) return fail(502, "NO_DATA", "國際行情暫時讀不到");
  return json({ at: Date.now(), rows }, 200, { "Cache-Control": "public, max-age=" + (live ? 5 : 120) });
}

/* the TAIEX future: net open interest of foreign investors, investment trusts and dealers (TAIFEX open data, latest day), kept day by day */
export async function twFutChip(env, json, fail) {
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
export async function twMarginDay(ds) {
  return twCached("margin:" + ds, 12 * 3600e3, async () => {
    const j = await (await twFetch(`https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${ds}&selectType=STOCK&response=json`, { headers: { "User-Agent": TW_UA } })).json();
    const t = Array.isArray(j.tables) ? j.tables.find(x => x && Array.isArray(x.data) && Array.isArray(x.fields) && x.fields[0] === "代號") : null;
    if (j.stat !== "OK" || !t) return null;
    const m = {}; t.data.forEach(r => { const c = String(r[0]).trim(); if (/^[0-9A-Z]{4,6}$/.test(c)) m[c] = [twNum(r[5]), twNum(r[6]), twNum(r[11]), twNum(r[12])]; });   /* 融資 前日, 今日; 融券 前日, 今日 (lots) */
    return m;
  });
}
export async function twMargin(url, json, fail) {
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
export async function twSectorHist(json, fail) {
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
export async function twMarginTop(json, fail) {
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

/* shareholding distribution (集保戶股權分散表): one big weekly file, read once and searched as text */
/* the TDCC file covers the whole market (tens of MB): stream it, keep only the rows of the stock asked for and stop reading there */
export async function twTdccRows(c) {
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
export async function twHolders(url, json, fail) {
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
export async function twPeMonth(c, ym) {
  const done = ym < new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 7).replace("-", "");
  return twCached("pe:" + c + ":" + ym, done ? 24 * 3600e3 : 1800e3, async () => {
    const j = await (await twFetch(`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?date=${ym}01&stockNo=${c}&response=json`, { headers: { "User-Agent": TW_UA } })).json();
    if (j.stat !== "OK" || !Array.isArray(j.data) || !Array.isArray(j.fields)) return [];
    const F = j.fields, iD = F.findIndex(x => String(x).includes("日期")), iP = F.findIndex(x => String(x).includes("本益比")), iY = F.findIndex(x => String(x).includes("殖利率")), iB = F.findIndex(x => String(x).includes("淨值比"));
    return j.data.map(r => { const m = String(r[iD]).match(/(\d+)\D+(\d+)\D+(\d+)/); if (!m) return null; const y = +m[1] < 1911 ? +m[1] + 1911 : +m[1];
      return [y + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[3]).padStart(2, "0"), iP >= 0 ? twNum(r[iP]) : null, iY >= 0 ? twNum(r[iY]) : null, iB >= 0 ? twNum(r[iB]) : null]; }).filter(Boolean);
  });
}
export async function twPe(url, json, fail) {
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
export async function twInstRank(json, fail) {
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

/* TWSE open data relayed through the worker: the browser cannot always reach openapi.twse.com.tw directly (CORS), the worker can */
export const TW_OPEN = new Set(["opendata/t187ap05_L", "opendata/t187ap38_L", "opendata/t187ap41_L", "exchangeReport/TWT48U_ALL", "exchangeReport/BWIBBU_ALL"]);
export async function twOpen(url, json, fail) {
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
export async function twRwdTable(path, ds, need) {
  return twCached("rwd:" + path + ds, 12 * 3600e3, async () => {
    const j = await (await twFetch(`https://www.twse.com.tw/rwd/zh/${path}${path.includes("?") ? "&" : "?"}date=${ds}&response=json`, { headers: { "User-Agent": TW_UA } })).json();
    const t = Array.isArray(j.tables) ? j.tables.find(x => x && Array.isArray(x.fields) && Array.isArray(x.data) && x.data.length > 50 && need(x.fields)) : (Array.isArray(j.fields) && Array.isArray(j.data) && need(j.fields) ? j : null);
    return j.stat === "OK" && t ? { fields: t.fields, data: t.data } : null;
  });
}
export async function twFirstDay(path, need, skip) {
  let n = 0;
  for (const ds of taipeiDays(14)) {
    let t = null; try { t = await twRwdTable(path, ds, need); } catch (e) { twCache.delete("rwd:" + path + ds); }
    if (!t) { twCache.delete("rwd:" + path + ds); continue; }
    if (n++ >= (skip || 0)) return { ds, t };
  }
  return null;
}
export const twDay8 = ds => ds.slice(0, 4) + "-" + ds.slice(4, 6) + "-" + ds.slice(6);
export async function twDayTrade(json, fail) {
  const r = await twFirstDay("dayTrading/TWTB4U", f => f.includes("證券代號") && f.some(x => x.includes("當日沖銷交易成交股數")));
  if (!r) return fail(502, "NO_DATA", "當沖資料暫時讀不到");
  const f = r.t.fields, iC = f.indexOf("證券代號"), iS = f.findIndex(x => x.includes("當日沖銷交易成交股數")), iB = f.findIndex(x => x.includes("買進成交金額")), iL = f.findIndex(x => x.includes("賣出成交金額"));
  const rows = r.t.data.map(x => [String(x[iC]).trim(), Math.round((twNum(x[iS]) || 0) / 1000), Math.round((twNum(x[iB]) || 0) / 1e4), Math.round((twNum(x[iL]) || 0) / 1e4)]).filter(x => /^[0-9A-Z]{4,6}$/.test(x[0]) && x[1] > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 300);                    /* code, lots day-traded, bought (NT$ 10k), sold (NT$ 10k) */
  return json({ day: twDay8(r.ds), rows }, 200, { "Cache-Control": "public, max-age=600" });
}
export async function twLending(json, fail) {
  const r = await twFirstDay("marginTrading/TWT93U", f => f.length >= 12 && f.includes("前日餘額") && f.includes("當日餘額"));
  if (!r) return fail(502, "NO_DATA", "借券資料暫時讀不到");
  const f = r.t.fields, iC = 0, iP = f.lastIndexOf("前日餘額"), iN = f.lastIndexOf("當日餘額"), iS = f.lastIndexOf("當日賣出");
  const rows = r.t.data.map(x => { const p = twNum(x[iP]) || 0, n = twNum(x[iN]) || 0; return [String(x[iC]).trim(), Math.round(n / 1000), Math.round((n - p) / 1000), Math.round((twNum(x[iS]) || 0) / 1000)]; })
    .filter(x => /^[0-9A-Z]{4,6}$/.test(x[0]));                    /* code, balance (lots), change (lots), sold today (lots) */
  const big = rows.filter(x => x[1] >= 500), top = (a, k, d, n) => a.slice().sort((p, q) => (q[k] - p[k]) * d).slice(0, n);
  return json({ day: twDay8(r.ds), up: top(big, 2, 1, 15), down: top(big, 2, -1, 15), bal: top(rows, 1, 1, 15) }, 200, { "Cache-Control": "public, max-age=600" });
}
export async function twQfii(json, fail) {
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