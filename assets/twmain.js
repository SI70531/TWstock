/* TWstock: the whole app in three tabs.
   總覽      four indices (TAIEX, TAIEX futures, electronics, finance), a market strip, and every TWSE-listed stock in one
             searchable, sortable list (price, change, volume, ★ to follow).
   自選股    the followed stocks as cards.
   個股分析  one stock: price, K-line with moving averages, Bollinger bands, volume, KD, MACD and RSI, a rule-based
             technical snapshot, fundamentals and institutional flows, news and announcements, and the AI analyst team.

   Data
   - Closing data straight from TWSE open data (works without any backend): STOCK_DAY_ALL, MI_INDEX, FMTQIK, BFI82U,
     STOCK_DAY (history), BWIBBU_ALL, t187ap05_L, T86.
   - Intraday quotes, the futures quote, headlines and the AI analysis come from the Worker (/tw/rt, /tw/news,
     /tw/analyze in the EZexams repo, tools/ezexams-worker.js). When the Worker does not answer, the page keeps
     working on closing data and says what could not be read.
   - Anything that cannot be read is shown as "讀不到": no sample numbers, no stale or fallback values.
   No accounts: the watchlist stays in this browser, and a random device id (twstock-device) tells the Worker which
   device's saved analyses and alert list are which. */
(function () {
  "use strict";
  const root = document.getElementById("dash");
  if (!root) return;
  const WORKER = "https://twstock-ai.ta77199ta.workers.dev";
  /* this browser's random id, made once; the Worker keys today's saved analyses and the alert list by it */
  const DEVICE = (() => {
    let d = null; try { d = localStorage.getItem("twstock-device"); } catch (e) {}
    if (!/^[0-9a-f]{32}$/.test(d || "")) {
      d = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");
      try { localStorage.setItem("twstock-device", d); } catch (e) {}
    }
    return d;
  })();
  const NS = "http://www.w3.org/2000/svg";
  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => Array.from(r.querySelectorAll(s));
  const ok = Number.isFinite;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = v => { const n = parseFloat(String(v == null ? "" : v).replace(/[,\s%]/g, "").replace(/^\+/, "")); return ok(n) ? n : NaN; };
  const fmt = (n, d = 0) => (ok(n) ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
  const dig = p => (p >= 1000 ? 0 : p >= 100 ? 1 : 2);
  const signed = (v, d = 2) => (ok(v) ? (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v), d) : "—");
  const pct = v => (ok(v) ? signed(v, 2) + "%" : "—");
  const tone = v => (v > 0 ? "up" : v < 0 ? "down" : "");
  const arrow = v => (v > 0 ? "▲" : v < 0 ? "▼" : "");
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const whyOf = e => (e && /^HTTP (\d+)/.test(e.message || "") ? "Worker 或來源回應錯誤，" + e.message : e && e.message && !/Failed to fetch|Load failed|NetworkError/i.test(e.message) ? e.message : "網路連不上 Worker 或來源");
  const J = url => fetch(url, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  /* "115/11/03" (ROC year), "2026/11/03" and "1151103" all become "20261103" */
  const ymd = v => { const m = String(v).match(/(\d{2,4})\D?(\d{2})\D?(\d{2})/); if (!m) return ""; let y = +m[1]; if (y < 1911) y += 1911; return y + m[2] + m[3]; };
  const slash = ds => (ds ? `${ds.slice(0, 4)}/${ds.slice(4, 6)}/${ds.slice(6)}` : "");
  const shortDay = ds => +ds.slice(4, 6) + "/" + +ds.slice(6);
  const pick = (o, ...subs) => { const k = Object.keys(o).find(x => subs.every(s => x.includes(s))); return k ? o[k] : undefined; };
  /* Taipei wall clock, wherever the device is */
  function taipei() {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", weekday: "short", hour: "2-digit", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit", hour12: false }).formatToParts(new Date());
    const g = t => (p.find(x => x.type === t) || {}).value || "";
    return { wd: g("weekday"), mins: +g("hour") % 24 * 60 + +g("minute"), ymd: g("year") + g("month") + g("day") };
  }
  const nightOpen = () => { const t = taipei(); return (!/Sat|Sun/.test(t.wd) && t.mins >= 900) || (!/Sun|Mon/.test(t.wd) && t.mins < 300); };   /* futures night session 15:00–05:00 */
  const marketOpen = () => { const t = taipei(); return !/Sat|Sun/.test(t.wd) && t.mins >= 525 && t.mins <= 825; };   /* 08:45–13:45 */

  /* ---------------- state ---------------- */
  const DEFAULT_WATCH = ["2330", "2317", "2454", "2308", "2881", "0050"];
  const DB = { list: [], by: new Map(), live: false, date: "", rt: null, rtAt: "", err: "" };
  const IDX = [{ k: "t00", name: "加權指數", en: "TAIEX" }, { k: "fut", name: "台指期", en: "TX" }, { k: "o00", name: "櫃買指數", en: "TPEx" }, { k: "exf", name: "電子期", en: "EXF" },
    { k: "dji", name: "道瓊", en: "DJIA", us: "^DJI" }, { k: "spx", name: "標普 500", en: "S&P 500", us: "^GSPC" }, { k: "ixic", name: "那斯達克", en: "NASDAQ", us: "^IXIC" }, { k: "sox", name: "費城半導體", en: "SOX", us: "^SOX" }];
  const T_START = Date.now(); setTimeout(() => { try { paintIdx(); } catch (e) {} }, 31000); setTimeout(() => { try { paintIdx(); } catch (e) {} }, 6200);   /* "讀不到資料" only after 30 seconds of trying */
  const isFut = k => k === "fut" || k === "exf";
  const MKT = { rows: null, inst: null };          /* TAIEX history rows and the institutions of the day */
  let WATCH = store.get("twtrade-watch", DEFAULT_WATCH);
  /* five watchlists 自選1–自選5; 自選1 is WATCH (the 自選股 tab, sidebar, alerts) */
  const WL_SEED = [
    ["6770", "2383", "3260", "4967", "5475", "8358", "3131", "6187", "3583", "2330", "2454", "2317", "2303", "3037", "2515", "1711", "2103", "3231", "2408", "2382", "1301", "6285", "2883", "1314", "2485", "3481", "3017", "1802", "2308", "2449", "2327", "4916", "2367", "5309", "7742"],
    ["2887", "0050", "0056", "00878", "00919", "00929", "006208", "00403A", "0052"]];
  let LISTS = store.get("twtrade-wl", null);
  if (!Array.isArray(LISTS) || LISTS.length !== 5) LISTS = [WATCH.slice(), [], [], [], []];
  if (!store.get("twtrade-wl-seed", 0)) { LISTS[0] = WL_SEED[0].slice(); LISTS[1] = WL_SEED[1].slice(); WATCH = LISTS[0]; store.set("twtrade-watch", WATCH); store.set("twtrade-wl", LISTS); store.set("twtrade-wl-seed", 1); }
  LISTS[0] = WATCH;
  const listIdx = () => (/^w[1-5]$/.test(VIEW.preset) ? +VIEW.preset[1] - 1 : 0);
  const IND = Object.assign({ ma: true, boll: false, vol: true, kd: true, macd: false, rsi: false }, store.get("twmain-ind", {}));
  let SPAN = store.get("twmain-span", 60);
  const VIEW = { q: "", preset: "w1", key: "ord", dir: 1, shown: 50 };
  let CODE = store.get("twmain-code", "2330");

  /* ---------------- loaders: closing data from TWSE open data ---------------- */
  function setList(list, live, date) {
    DB.list = list; DB.by = new Map(list.map(s => [s.code, s])); DB.live = live; DB.date = date || DB.date;
  }
  /* every listed stock at the close. Two TWSE sources are read side by side and the newer one wins:
     the exchange's own daily report (MI_INDEX, same evening) and the open-data copy (STOCK_DAY_ALL, often a day late).
     Stocks without a trade that day are kept (price shown as —) so every listed code can still be searched. */
  const mk = (code, name, price, chg, open, high, low, lots) => {
    const prev = ok(price) && ok(chg) ? price - chg : NaN;
    return { code: String(code).trim(), name: String(name).trim(), price, prev, chg: ok(chg) ? chg : 0, pct: prev ? chg / prev * 100 : 0, open, high, low, vol: ok(lots) ? lots : 0 };
  };
  async function listOpenData() {
    const rows = await J("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL");
    let date = "";
    const list = rows.map(x => { if (!date && x.Date) date = ymd(x.Date);
      return mk(x.Code, x.Name, num(x.ClosingPrice), num(x.Change), num(x.OpeningPrice), num(x.HighestPrice), num(x.LowestPrice), Math.round(num(x.TradeVolume) / 1000)); });
    return { list, date };
  }
  async function listDaily() {
    const t = taipei(), start = new Date(+t.ymd.slice(0, 4), +t.ymd.slice(4, 6) - 1, +t.ymd.slice(6));
    if (t.mins < 14 * 60 + 30) start.setDate(start.getDate() - 1);       /* today's report appears after about 14:30 */
    for (let back = 0; back < 6; back++) {
      const d = new Date(start.getTime() - back * 864e5); if (d.getDay() % 6 === 0) continue;
      const ds = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
      const j = await J(`https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${ds}&type=ALLBUT0999&response=json`);
      const tb = (j.tables || []).find(x => Array.isArray(x.fields) && x.fields.includes("證券代號") && x.fields.includes("收盤價") && (x.data || []).length > 100);
      if (j.stat !== "OK" || !tb) { await wait(400); continue; }
      const f = k => tb.fields.findIndex(x => x.includes(k)), iC = f("證券代號"), iN = f("證券名稱"), iV = f("成交股數"), iO = f("開盤價"), iH = f("最高價"), iL = f("最低價"), iZ = f("收盤價"), iS = f("漲跌(+/-)"), iD = f("漲跌價差");
      const list = tb.data.map(r => { const sign = /-|－|green/.test(String(r[iS])) ? -1 : 1;
        return mk(r[iC], r[iN], num(r[iZ]), sign * Math.abs(num(r[iD]) || 0), num(r[iO]), num(r[iH]), num(r[iL]), Math.round(num(r[iV]) / 1000)); });
      return { list, date: ds };
    }
    throw new Error("no daily report");
  }
  /* 上櫃 and 興櫃 at the close, through the Worker (TPEx open data cannot be read by pages on other sites) */
  async function listOTC() {
    /* published every 10 minutes by the "OTC list" GitHub Actions job (TPEx refuses both the page and the Worker) */
    let j = null;
    try { j = await J("https://raw.githubusercontent.com/SI70531/TWstock/data/otc.json"); } catch (e) { j = await J(`${WORKER}/tw/otc`); }
    if (j && j.ind && typeof j.ind === "object") INDMAP = j.ind;
    return (j.list || []).map(([c, n, z, ch, o, h, l, v, m]) => Object.assign(mk(c, n, z == null ? NaN : z, ch == null ? NaN : ch, o == null ? NaN : o, h == null ? NaN : h, l == null ? NaN : l, v), { mkt: m }))
      .filter(s => s.code && s.name);
  }
  async function loadList() {
    const otc = listOTC().catch(() => []);
    const got = (await Promise.allSettled([listDaily(), listOpenData()])).filter(r => r.status === "fulfilled" && r.value.list.length > 100).map(r => r.value);
    if (!got.length) throw new Error("no list");
    got.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.list.length - a.list.length));
    const best = got[0], names = new Map(best.list.map(s => [s.code, s]));
    got.slice(1).forEach(g => g.list.forEach(s => { if (!names.has(s.code)) names.set(s.code, Object.assign(s, { price: NaN, chg: 0, pct: 0, vol: 0, stale: true })); }));
    (await otc).forEach(s => { if (!names.has(s.code)) names.set(s.code, s); });
    setList([...names.values()].filter(s => s.code && s.name), true, best.date);
  }
  /* indices at the close (used until the Worker supplies intraday values) */
  async function loadIdxEod() {
    const a = await J("https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX");
    const want = { t00: /^發行量加權股價指數$/ };
    a.forEach(x => {
      const nk = Object.keys(x).find(key => key === "指數") || Object.keys(x).find(key => key.includes("指數") && !key.includes("收盤"));
      const name = String(x[nk] || "").trim();
      const k = Object.keys(want).find(key => want[key].test(name)); if (!k) return;
      const z = num(pick(x, "收盤")), dir = String(x["漲跌"] || "").trim(); let d = num(pick(x, "點數"));
      if (!ok(z)) return;
      if (/^[-－]/.test(dir)) d = -Math.abs(d); else if (/^[+＋]/.test(dir)) d = Math.abs(d);
      const it = IDX.find(i => i.k === k);
      if (!it.rt) Object.assign(it, { z, y: ok(d) ? z - d : NaN, h: NaN, l: NaN, tm: "", src: "收盤" });
    });
  }
  /* TAIEX and turnover by day: rows [yyyymmdd, 億股, 億元, 萬筆, index, change]; finished months are kept in this browser */
  async function loadMonth(ym, finished) {
    const key = "twdash-m-" + ym, hit = finished && store.get(key, null);
    if (hit && hit.length) return hit;
    const j = await J(`https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date=${ym}01&response=json`);
    if (j.stat !== "OK" || !Array.isArray(j.data)) return [];
    const rows = j.data.map(r => [ymd(r[0]), num(r[1]) / 1e8, num(r[2]) / 1e8, num(r[3]) / 1e4, num(r[4]), num(r[5])]).filter(r => r[0] && r[4] > 0);
    if (finished && rows.length) store.set(key, rows);
    return rows;
  }
  const monthsBack = n => { const now = new Date(), out = []; for (let i = 0; i < n; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0")); } return out; };
  async function loadMarket() {
    const out = [];
    const ms = monthsBack(4);
    for (let i = 0; i < ms.length; i++) {
      if (i && !store.get("twdash-m-" + ms[i], null)) await wait(450);
      try { out.unshift(...(await loadMonth(ms[i], i > 0))); } catch (e) { if (!out.length) return; break; }
    }
    if (out.length < 2) return;
    MKT.rows = out;
    for (const ds of [out[out.length - 1][0], out[out.length - 2][0]]) {
      try {
        const j = await J(`https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate=${ds}&response=json`);
        if (j.stat !== "OK" || !Array.isArray(j.data) || !j.data.length) { await wait(450); continue; }
        const o = { date: ds, f: 0, t: 0, d: 0 }; let seen = 0;
        j.data.forEach(r => {
          const n = String(r[0]).replace(/\s/g, ""), v = num(r[3]) / 1e8; if (!ok(v) || n.includes("合計")) return;
          if (n.includes("外資")) { o.f += v; seen++; } else if (n.includes("投信")) { o.t += v; seen++; } else if (n.includes("自營")) { o.d += v; seen++; }
        });
        if (seen) { MKT.inst = o; break; }
      } catch (e) { break; }
    }
  }

  /* ---------------- loaders: one stock ---------------- */
  /* daily bars [yyyymmdd, open, high, low, close, lots]; finished months are kept in this browser */
  const YH = new Map();                                       /* code → promise of a year of daily bars (上櫃 / 興櫃) */
  async function histMonth(code, ym, finished) {
    const key = `twh:${code}:${ym}`, hit = finished && store.get(key, null);
    if (hit) return hit;
    const mkt = (DB.by.get(code) || {}).mkt;
    if (mkt === "otc" || mkt === "esb") {                       /* 上櫃 / 興櫃: about a year of daily bars from Yahoo Taiwan through the Worker */
      if (!YH.has(code)) YH.set(code, J(`${WORKER}/tw/hist?c=${code}`).then(j => j.rows || [], e => { YH.delete(code); throw e; }));
      const rows = (await YH.get(code)).filter(r => r[0].startsWith(ym)).map(r => [r[0], r[1], r[2], r[3], r[4], Math.round(r[5] > 1e5 ? r[5] / 1000 : r[5])]);
      if (finished && rows.length) store.set(key, rows);
      return rows;
    }
    const j = await J(`https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${ym}01&stockNo=${code}`);
    const rows = (j.data || []).map(r => [ymd(r[0]), num(r[3]), num(r[4]), num(r[5]), num(r[6]), Math.round(num(r[1]) / 1000)]).filter(r => r[0] && r.slice(1, 5).every(v => v > 0));
    if (finished) store.set(key, rows);
    return rows;
  }
  const HIST = new Map();                          /* code → { cs, full } */
  async function loadHist(code, onMore) {
    const hit = HIST.get(code);
    if (hit) return hit.cs;
    const s = DB.by.get(code);
    if (!DB.live) return null;
    const ms = monthsBack(7);
    let cs = [];
    try { cs = [...(await histMonth(code, ms[1], true)), ...(await histMonth(code, ms[0], false))]; } catch (e) { return null; }
    if (cs.length < 5) return null;
    const rec = { cs, full: false }; HIST.set(code, rec);
    (async () => {                                 /* the older months arrive in the background (120-day view, MA60) */
      for (let i = 2; i < ms.length; i++) {
        if (!store.get(`twh:${code}:${ms[i]}`, null)) await wait(600);
        try { rec.cs = [...(await histMonth(code, ms[i], true)), ...rec.cs]; } catch (e) { break; }
      }
      rec.full = true; onMore && onMore(rec.cs);
    })();
    return cs;
  }
  /* TWSE open data: through the worker first (no CORS problem there), straight from the browser as the fallback */
  const openJ = async p => { try { const a = await J(`${WORKER}/tw/open?p=${encodeURIComponent(p)}`); if (Array.isArray(a) && a.length) return a; } catch (e) {} return J("https://openapi.twse.com.tw/v1/" + p); };
  const FUND = { map: null, busy: null };
  function loadFund() {
    if (FUND.map || !DB.live) return Promise.resolve();
    if (FUND.busy) return FUND.busy;
    FUND.busy = (async () => {
      const m = new Map();
      try { (await openJ("exchangeReport/BWIBBU_ALL")).forEach(x => m.set(String(x.Code), { pe: num(x.PEratio), yld: num(x.DividendYield), pb: num(x.PBratio) })); } catch (e) {}
      try {
        (await openJ("opendata/t187ap05_L")).forEach(x => {
          const c = String(pick(x, "公司代號") || ""), o = m.get(c) || {};
          o.rev = num(pick(x, "當月營收")) / 1e5; o.yoy = num(pick(x, "去年同月增減")); o.mom = num(pick(x, "上月比較增減")); o.ytd = num(pick(x, "前期比較增減")); o.ym = String(pick(x, "資料年月") || "");
          if (c) m.set(c, o);
        });
      } catch (e) {}
      if (![...m.values()].some(o => o.pe > 0 || o.yld > 0 || o.pb > 0)) {
        /* openapi unreachable or empty: fall back on the same www.twse.com.tw host that already serves the chips */
        const start = DB.date ? new Date(+DB.date.slice(0, 4), +DB.date.slice(4, 6) - 1, +DB.date.slice(6)) : new Date();
        for (let back = 0; back < 6; back++) {
          const d = new Date(start.getTime() - back * 864e5), ds = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
          try {
            const j = await J(`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${ds}&selectType=ALL&response=json`);
            const F = j && j.fields, R = j && j.data; if (!F || !R || !R.length) continue;
            const f = k => F.findIndex(x => String(x).includes(k)), iC = f("代號"), iP = f("本益比"), iY = f("殖利率"), iB = f("淨值比");
            R.forEach(r => { const c = String(r[iC]).trim(), o = m.get(c) || {}; o.pe = num(r[iP]); o.yld = num(r[iY]); o.pb = num(r[iB]); m.set(c, o); });
            break;
          } catch (e) {}
        }
      }
      if (m.size) FUND.map = m; else setTimeout(() => { FUND.busy = null; }, 60000);
      if (m.size) FUND.busy = null;
    })();
    return FUND.busy;
  }
  const CHIP = { map: null, date: "", busy: null };
  function loadChip() {
    if (CHIP.map || !DB.live) return Promise.resolve();
    if (CHIP.busy) return CHIP.busy;
    CHIP.busy = (async () => {
      const start = DB.date ? new Date(+DB.date.slice(0, 4), +DB.date.slice(4, 6) - 1, +DB.date.slice(6)) : new Date();
      for (let back = 0; back < 6; back++) {
        const d = new Date(start.getTime() - back * 864e5), ds = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
        try {
          const j = await J(`https://www.twse.com.tw/rwd/zh/fund/T86?date=${ds}&selectType=ALLBUT0999&response=json`);
          if (j.stat !== "OK" || !j.data || !j.data.length) { await wait(400); continue; }
          const ix = (...subs) => j.fields.findIndex(f => subs.every(s => f.includes(s)));
          const iF = ix("外陸資買賣超股數", "不含"), iF2 = ix("外資", "買賣超"), iT = ix("投信買賣超"), iD = ix("自營商買賣超股數"), iA = ix("三大法人買賣超");
          const m = new Map();
          j.data.forEach(r => m.set(String(r[0]).trim(), { f: num(r[iF >= 0 ? iF : iF2]) / 1000, t: num(r[iT]) / 1000, d: iD >= 0 ? num(r[iD]) / 1000 : NaN, a: num(r[iA]) / 1000 }));
          if (m.size) { CHIP.map = m; CHIP.date = ds; break; }
        } catch (e) { break; }
      }
      CHIP.busy = null;
    })();
    return CHIP.busy;
  }

  /* ---------------- intraday quotes through the Worker ---------------- */
  let rtTimer = 0, rtBusy = false, rtFailAt = 0, rtFails = 0;
  /* live quotes stopped arriving: show "讀不到" instead of the last live numbers */
  function rtDrop() {
    DB.list.forEach(s => { if (s.rt) Object.assign(s, { price: NaN, chg: 0, pct: 0, rt: false, flash: "" }); });
    IDX.forEach(i => { if (i.rt && !i.us) Object.assign(i, { z: NaN, y: NaN, h: NaN, l: NaN, tm: "", src: "", rt: false }); });
    try { paintLive(); paintIdx(); } catch (e) {}
  }
  function rtCodes() {
    if (cur === "dpWatch") return WATCH.slice(0, 80);
    if (cur === "dpStock") return [CODE];
    if (cur === "dpHold" && window.TWExtra) { const c = TWExtra.liveCodes(); if (c.length) return c; }
    return $$("#dpList .mtbl tbody tr[data-code]").slice(0, 70).map(r => r.dataset.code);
  }
  function rtApply(x) {
    const s = DB.by.get(x.c); if (!s || !(x.z > 0) || !(x.y > 0)) return false;
    const had = s.rt, was = s.pct;
    s.flash = x.z > s.price ? "up" : x.z < s.price ? "down" : "";
    s.price = x.z; s.prev = x.y; s.chg = x.z - x.y; s.pct = (x.z / x.y - 1) * 100;
    if (x.o > 0) s.open = x.o; if (x.h > 0) s.high = x.h; if (x.l > 0) s.low = x.l; if (ok(x.v)) s.vol = x.v;
    s.tm = x.tm; s.day = x.d; s.rt = true;
    if (had && marketOpen()) moveAlert(s, was);
    return true;
  }
  /* the levels: limit up / down, then ±5%; a card appears when one of your stocks reaches a higher level than before (once per day) */
  const lvOf = p => (!ok(p) ? 0 : p >= 9.4 ? 2 : p >= 5 ? 1 : p <= -9.4 ? -2 : p <= -5 ? -1 : 0);
  function moveAlert(s, was) {
    if (!LISTS.some(l => l.includes(s.code))) return;
    const lv = lvOf(s.pct), pv = lvOf(was);
    if (!lv || (Math.sign(lv) === Math.sign(pv) && Math.abs(lv) <= Math.abs(pv))) return;
    const key = "twtoast-" + (s.day || "") + ":" + s.code + ":" + lv;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch (e) {}
    toast(s, lv);
  }
  let toastHost = null;
  function toast(s, lv) {
    if (!toastHost) { toastHost = document.createElement("div"); toastHost.className = "toasts"; toastHost.setAttribute("aria-live", "polite"); document.body.appendChild(toastHost); }
    const up = lv > 0, lim = Math.abs(lv) === 2, label = lim ? (up ? "漲停" : "跌停") : (up ? "漲逾 5%" : "跌逾 5%");
    const el = document.createElement("div");
    el.className = `toast ${up ? "up" : "down"}${lim ? " lim" : ""}`; el.dataset.code = s.code;
    el.innerHTML = `<span class="tt-badge">${label}</span><button type="button" class="tt-body" data-go="${esc(s.code)}"><b>${esc(s.name)} <i>${esc(s.code)}</i></b><span><em>${fmt(s.price, dig(s.price))}</em> <em>${pct(s.pct)}</em>　${esc((s.tm || "").slice(0, 5))}</span></button><button type="button" class="tt-x" aria-label="關閉">✕</button><i class="tt-life"></i>`;
    toastHost.prepend(el);
    while (toastHost.children.length > 4) toastHost.lastElementChild.remove();
    el.animate([{ opacity: 0, transform: "translateX(28px) scale(.96)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "none" }], { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" });
    if (lim) sparks($(".tt-badge", el), up);
    const life = $(".tt-life", el).animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: 9000, easing: "linear", fill: "forwards" });
    const close = () => { if (!el.isConnected) return; el.animate([{ opacity: 1 }, { opacity: 0, transform: "translateX(24px)" }], { duration: 200, fill: "forwards" }).onfinish = () => el.remove(); };
    life.onfinish = close;
    el.addEventListener("pointerenter", () => life.pause()); el.addEventListener("pointerleave", () => life.play());
    $(".tt-x", el).addEventListener("click", close);
    $(".tt-body", el).addEventListener("click", () => { close(); openStock(s.code); });
  }
  /* sparks fly out of the limit badge */
  function sparks(from, up) {
    const r = from.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let k = 0; k < 16; k++) {
      const d = document.createElement("i"); d.className = "spark " + (up ? "up" : "down"); d.style.left = cx + "px"; d.style.top = cy + "px"; document.body.appendChild(d);
      const ang = Math.random() * Math.PI * 2, dist = 30 + Math.random() * 70, sz = 0.6 + Math.random() * 0.8;
      d.animate([{ transform: `translate(-50%,-50%) scale(${sz})`, opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist + 18}px)) scale(0)`, opacity: 0 }],
        { duration: 650 + Math.random() * 450, easing: "cubic-bezier(.16,1,.3,1)" }).onfinish = () => d.remove();
    }
  }
  /* a stock just opened during trading hours: fetch its quote right away, outside the regular poll,
     and keep yesterday's close off the header until it arrives */
  async function quoteNow(code) {
    const s = DB.by.get(code); if (!s || s.rt || !DB.live || !marketOpen()) return;
    s.rtWait = true;
    try {
      const j = await J(`${WORKER}/tw/rt?c=${encodeURIComponent(code)}`);
      (j.q || []).forEach(rtApply);
      DB.rtSrc = j.src || DB.rtSrc;
    } catch (e) {}
    s.rtWait = false;
    if (CODE === code) { paintHead(); if (HIST.get(code)) drawChart(false); }
  }
  async function rtPoll() {
    if (rtBusy || !DB.live || document.hidden) return;
    if (DB.rt === false && Date.now() - rtFailAt < (marketOpen() || nightOpen() ? 4000 : 300000)) return;
    rtBusy = true;
    try {
      const codes = rtCodes(), wantIdx = cur === "dpOverview" || !IDX[0].rt;
      const j = await J(`${WORKER}/tw/rt?c=${codes.join(",")}${wantIdx ? "&idx=1" : ""}`);
      let any = false;
      (j.q || []).forEach(x => { if (rtApply(x)) any = true; });
      IDX.forEach(i => { if (!i.us) i.why = ""; });
      if (wantIdx) { const got = new Set((j.idx || []).filter(x => x.z > 0).map(x => x.c)); ["t00", "o00"].forEach(k => { const it = IDX.find(i => i.k === k); if (it && !got.has(k)) it.why = marketOpen() ? "證交所即時報價沒有回傳這個指數" : "非盤中，證交所沒有即時報價"; }); }
      if (j.exf && !(j.exf.z > 0)) IDX[3].why = j.exf.why || "Worker 沒有電子期報價"; else if (!j.exf && wantIdx) IDX[3].why = "Worker 沒有回傳電子期（可能還是舊版）";
      if (j.fut && !(j.fut.z > 0)) IDX[1].why = j.fut.why || "Worker 沒有台指期報價"; else if (!j.fut && wantIdx) IDX[1].why = "Worker 沒有回傳台指期（可能還是舊版）";
      (j.idx || []).forEach(x => {
        const it = IDX.find(i => i.k === x.c); if (!it || !(x.z > 0)) return;
        any = true; Object.assign(it, { z: x.z, y: x.y, h: x.h, l: x.l, tm: x.tm, src: marketOpen() ? "盤中" : "收盤", rt: true });
      });
      if (j.exf && j.exf.z > 0) { any = true; Object.assign(IDX[3], { z: j.exf.z, y: j.exf.y, h: j.exf.h, l: j.exf.l, v: j.exf.v, tm: j.exf.tm, src: j.exf.src === "night" ? "夜盤" : j.exf.src === "rt" ? "盤中" : (j.exf.sess || "") + "收盤", rt: true, label: "" }); }
      if (j.fut && j.fut.z > 0) { any = true; Object.assign(IDX[1], { z: j.fut.z, y: j.fut.y, h: j.fut.h, l: j.fut.l, tm: j.fut.tm, src: j.fut.src === "night" ? "夜盤" : j.fut.src === "rt" ? "盤中" : (j.fut.sess || "") + "收盤", rt: true, label: j.fut.n }); }
      DB.rtSrc = j.src || "mis";
      rtFails = 0; DB.rtErr = "";
      if (any) { DB.rt = true; DB.rtAt = new Date().toLocaleTimeString("zh-TW", { hour12: false }); paintLive(); }
      else if (DB.rt == null) DB.rt = false;
    } catch (e) { DB.rt = false; DB.rtErr = whyOf(e); rtFailAt = Date.now(); if (++rtFails >= 2) rtDrop(); }
    rtBusy = false; note();
  }
  document.addEventListener("twset:change", e => { if (e.detail.k === "poll") { clearTimeout(rtTimer); rtLoop(); } });
  function rtLoop() {
    clearTimeout(rtTimer);
    const pl = window.TWSet ? window.TWSet.get("poll") : "auto";
    rtPoll().then(() => { if (pl === "manual") return; rtTimer = setTimeout(rtLoop, pl === "5" || pl === "10" ? (marketOpen() || nightOpen() ? +pl * 1000 : 120000) : marketOpen() ? 2000 : nightOpen() ? 5000 : 120000); });
  }

  /* ---------------- banner ---------------- */
  function note() {
    const el = $(".dash-note"); if (!el) return;
    if (!DB.list.length && !DB.failed) { el.innerHTML = `<b>載入中</b>正在讀取證交所公開資料…`; return; }
    if (!DB.live) { el.innerHTML = `<b>讀不到</b>讀不到證交所資料。`; return; }
    if (DB.rt) el.innerHTML = `<b class="live">即時</b>${esc(DB.rtAt)} 更新${marketOpen() ? "・每 2 秒更新" : nightOpen() ? "・股票已收盤，台指期夜盤更新中" : "・非交易時段"}`;
    else el.innerHTML = `<b>收盤</b>${slash(DB.date)} 收盤資料${DB.rt === false ? "（即時報價讀不到）" : ""}`;
  }

  /* ---------------- 總覽 ---------------- */
  const PRESETS = [["w1", "自選1"], ["w2", "自選2"], ["w3", "自選3"], ["w4", "自選4"], ["w5", "自選5"], ["strong", "強勢股"], ["weak", "弱勢股"]];
  const COLS = [["price", "成交價"], ["chg", "漲跌"], ["pct", "漲跌幅"], ["vol", "成交量"]];
  function buildOverview() {
    $("#dpOverview").innerHTML = `
      <div class="ixgrid">${IDX.map(i => `<div class="dcard ixcard" data-k="${i.k}" role="button" tabindex="0" aria-expanded="false"><h3><span class="ixn">${i.name}<em class="ixen">${i.en}</em></span><span class="ixsrc"></span></h3>
        <div class="big">—</div><div class="sub ixchg">載入中…</div><div class="sub ixhl"></div><svg class="spark" viewBox="0 0 76 28" preserveAspectRatio="none" aria-hidden="true"><line class="spbase" x1="0" x2="76"/><path/></svg></div>`).join("")}</div>
      <div class="dcard ixdetail" hidden></div>
      <div class="dcard pm"><div class="aihead"><div><h3>盤前分析</h3></div>
        <button type="button" class="btn pmgo">分析</button></div><div class="pmout"><p class="sub">載入中…</p></div><p class="sub pmalert" hidden></p></div>
      <div class="dcard pm md"><div class="aihead"><div><h3>盤中分析</h3></div>
        <button type="button" class="btn mdgo">分析</button><span class="sub mdclosed" hidden>非開盤時間，盤中無法分析</span></div><div class="mdout"><p class="sub">載入中…</p></div></div>
      <div class="dcard mstrip"></div>
      <div class="board3">
        <div class="dcard wd"><div class="bd-h"><h3>國際行情</h3><span class="sub wdn"></span></div><div class="wdout"><p class="sub">載入中…</p></div></div>
        <div class="dcard ft"><div class="bd-h"><h3>期貨籌碼</h3><span class="sub ftn">台指期 未平倉淨口數</span></div><div class="ftout"><p class="sub">載入中…</p></div></div>
      </div>
      <div class="board">
        <div class="dcard bd-dist"><div class="bd-h"><h3>漲跌分布</h3><span class="sub bd-n"></span></div><div class="bd-bars"></div></div>
        <div class="dcard bd-up"><div class="bd-h"><h3>漲幅排行</h3></div><div class="bd-list"></div></div>
        <div class="dcard bd-down"><div class="bd-h"><h3>跌幅排行</h3></div><div class="bd-list"></div></div>
      </div>
      <div class="board board2">
        <div class="dcard bd-strk"><div class="bd-h"><h3>法人連續買賣超</h3><span class="sub bd-n"></span></div>
          <div class="chips">${[["f1", "外資連買"], ["f0", "外資連賣"], ["t1", "投信連買"], ["t0", "投信連賣"]].map(([k, t]) => `<button type="button" class="chip" data-stk="${k}" aria-pressed="${k === "f1"}">${t}</button>`).join("")}</div>
          <div class="bd-list"><p class="sub">載入中…</p></div></div>
        <div class="dcard bd-flag"><div class="bd-h"><h3>注意股・處置股</h3><span class="sub bd-n"></span></div><div class="bd-list"><p class="sub">載入中…</p></div><p class="sub fl-foot">證交所公告的上市股票；處置股交易受限制（分盤撮合，可能要預收款券）。</p></div>
      </div>
      <div class="dcard cl"><div class="aihead"><div><h3>收盤摘要</h3></div></div><div class="clout"><p class="sub">載入中…</p></div></div>
      <div class="dcard wk"><div class="aihead"><div><h3>週回顧</h3></div><button type="button" class="btn wkgo" hidden>產生</button></div><div class="wkout"><p class="sub">載入中…</p></div></div>
      <div class="dcard inst"><div class="aihead"><div><h3>法人買賣超排行</h3></div><span class="sub instday"></span></div>
        <div class="hmseg instseg" role="group" aria-label="法人">${[["a", "三大法人"], ["f", "外資"], ["t", "投信"], ["d", "自營商"]].map(([k, l]) => `<button type="button" data-g="${k}" aria-pressed="${k === "a"}">${l}</button>`).join("")}<i></i></div>
        <div class="instout"><p class="sub">載入中…</p></div></div>
      <div class="dcard mkt">
        <div class="mbar"><input class="msearch msfull" type="search" placeholder="搜尋代號或名稱" aria-label="搜尋股票" autocomplete="off">
          <div class="chips">${PRESETS.map(([k, t]) => `<button type="button" class="chip" data-preset="${k}" aria-pressed="${k === VIEW.preset}">${t}</button>`).join("")}</div>
          <span class="sub mcount"></span></div>
        <div class="mwrap"><table class="mtbl ttbl mktab"><thead><tr><th class="l">股票</th>${COLS.map(([k, t]) => `<th class="sort" data-key="${k}">${t}<i></i></th>`).join("")}<th aria-label="自選"></th></tr></thead><tbody></tbody></table></div>
        <button type="button" class="mmore" hidden>顯示更多</button>
      </div>`;
    const box = $("#dpOverview");
    $(".msearch", box).addEventListener("input", e => { VIEW.q = e.target.value.trim(); VIEW.dist = null; VIEW.shown = 50; paintTable(true); });
    root.addEventListener("click", e => {
      if (!e.target.closest("#dpOverview, #dpPre, #dpList, #dpChip, #dpInd, #dpRev")) return;
      const p = e.target.closest("[data-preset]");
      if (p) {
        VIEW.q = ""; $("#dpList .msearch").value = ""; VIEW.dist = null;
        VIEW.preset = p.dataset.preset; VIEW.shown = 50;
        const o = { all: ["vol", -1], w1: ["ord", 1], w2: ["ord", 1], w3: ["ord", 1], w4: ["ord", 1], w5: ["ord", 1], strong: ["pct", -1], weak: ["pct", 1], volume: ["vol", -1] }[VIEW.preset];
        VIEW.key = o[0]; VIEW.dir = o[1]; paintTable(true); return;
      }
      const th = e.target.closest("th.sort");
      if (th) { const k = th.dataset.key; if (VIEW.key === k) VIEW.dir *= -1; else { VIEW.key = k; VIEW.dir = -1; } paintTable(true); return; }
      if (e.target.closest(".mmore")) { VIEW.shown += 100; paintTable(false); return; }
      const st = e.target.closest(".wlbtn");
      if (st) { if (st.classList.contains("wladd")) wlMenu(st); else wlRemove(st); return; }
      const tr = e.target.closest("tr[data-code]");
      if (tr) openStock(tr.dataset.code, tr);
      if (e.target.closest(".pmgo")) pmRun(e.target.closest(".pmgo"));
      if (e.target.closest(".mdgo")) { pmRun(e.target.closest(".mdgo"), true); return; }
      if (e.target.closest(".clgo")) { clRun(e.target.closest(".clgo")); return; }
      if (e.target.closest(".hmback")) { heatZoom(null); return; }
      const hv = e.target.closest(".hmseg [data-hv]");
      if (hv) { const k = hv.closest(".hmseg").dataset.hk; if (HEAT[k] !== hv.dataset.hv) { HEAT[k] = hv.dataset.hv; heatCardClose($(".hm")); paintHeat(false); } return; }
      const hcg = e.target.closest(".hmc-go"); if (hcg) { const c = hcg.closest(".hmcard"); openStock(c.dataset.code, c); return; }
      if (e.target.closest(".hmc-x")) { heatCardClose($(".hm")); return; }
      if (e.target.closest(".hmcard")) return;
      const hmt = e.target.closest(".hmt"); if (hmt) { heatRipple(hmt, e); if (hmt.dataset.code) heatCard(hmt); else setTimeout(() => heatZoom(hmt), 160); return; }
      if (e.target.closest(".hm")) { heatCardClose($(".hm")); return; }
      const sk = e.target.closest("[data-stk]"); if (sk) { STRK.tab = sk.dataset.stk; paintStreak(true); return; }
      const dc = e.target.closest("[data-dist]");
      if (dc) { VIEW.q = ""; $("#dpList .msearch").value = ""; VIEW.dist = +dc.dataset.dist; VIEW.key = "vol"; VIEW.dir = -1; VIEW.shown = 50; open("dpList", true); paintTable(true); return; }
      if (e.target.closest(".distclr")) { VIEW.dist = null; VIEW.key = "ord"; VIEW.dir = 1; paintTable(true); return; }
      const pk = e.target.closest("[data-pick]"); if (pk) { openStock(pk.dataset.pick, pk); return; }
      const gt = e.target.closest("[data-goto]"); if (gt) { open(gt.dataset.goto, true); return; }
      const bd = e.target.closest(".bd-row, .bd-tile"); if (bd) { openStock(bd.dataset.code, bd); return; }
      const xc = e.target.closest(".ixcard"); if (xc) { ixOpen(xc.dataset.k); return; }
      const xr = e.target.closest("[data-ixr]"); if (xr) { IXV.r = xr.dataset.ixr; ixPaint(true); return; }
      if (e.target.closest(".ixclose")) { ixOpen(IXV.k); return; }
    });
    /* the pre-market note and the stock list each have their own tab */
    /* 分析: one tab with three parts (收盤摘要, 盤前分析, 盤中分析), one shown at a time */
    const pre = $("#dpPre");
    pre.insertAdjacentHTML("beforeend", `<div class="anasub" role="tablist" aria-label="分析">${[["pm", "盤前"], ["md", "盤中"], ["cl", "收盤"], ["wk", "週回顧"], ["ar", "存檔"]].map(([k, l]) => `<button type="button" role="tab" data-sub="${k}">${l}</button>`).join("")}<i></i></div>`);
    const pmc = $(".pm:not(.md)", box), mdc = $(".pm.md", box), clc = $(".cl", box), wkc = $(".wk", box);
    clc.dataset.sub = "cl"; pmc.dataset.sub = "pm"; mdc.dataset.sub = "md"; wkc.dataset.sub = "wk";
    pre.appendChild(clc); pre.appendChild(pmc); pre.appendChild(mdc); pre.appendChild(wkc);
    $(".anasub", pre).addEventListener("click", e => { const b = e.target.closest("[data-sub]"); if (b) anaSub(b.dataset.sub, true); });
    anaSub(anaDefault(), false); mdGate();
    const instc = $(".inst", box), mktc = $(".mkt", box), dl = $("#dpList");
    dl.insertAdjacentHTML("afterbegin", `<div class="anasub lsub" role="tablist" aria-label="股票">${[["ls", "清單"], ["rk", "排行"], ["cp", "比較"], ["sc", "選股"], ["rv", "營收"]].map(([k, l]) => `<button type="button" role="tab" data-sub="${k}">${l}</button>`).join("")}<i></i></div>`);
    mktc.dataset.sub = "ls"; dl.appendChild(mktc); instInit(instc); lstBuild(dl);
    $(".lsub", dl).addEventListener("click", e => { const b = e.target.closest("[data-sub]"); if (b) lstSub(b.dataset.sub, true); });
    lstSub((() => { try { return sessionStorage.getItem("twlst") || (window.TWSet && window.TWSet.get("lst")) || "ls"; } catch (e) { return "ls"; } })(), false);
    $(".wkgo", wkc).addEventListener("click", e => wkRun(e.currentTarget));
    pmLoad(); pmLoad(true); clLoad(); wkLoad(); wdLoad(); ftLoad();
    const dd = $(".bd-dist", box); dd.addEventListener("pointermove", distTip); dd.addEventListener("pointerleave", () => { const t = $(".bdtip", dd); if (t) t.hidden = true; });
    const hm = $(".hm", box); hm && hm.addEventListener("pointermove", e => { if (!$(".hmcard", hm)) heatTip(e); heatFocus(e); }); hm && hm.addEventListener("pointerleave", e => { const t = $(".hmtip", hm); if (t) t.hidden = true; heatFocus(e); }); setTimeout(alertSync, 2500); loadCharts(true);
    box.addEventListener("keydown", e => { const xc = e.target.closest && e.target.closest(".ixcard"); if (xc && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); ixOpen(xc.dataset.k); } });
  }
  function rowsNow() {
    const q = VIEW.q.toLowerCase();
    let rows = DB.list;
    const L = /^w[1-5]$/.test(VIEW.preset) && VIEW.dist == null ? LISTS[listIdx()] : null;
    if (!q && VIEW.dist != null && DIST[VIEW.dist]) {
      const f = DIST[VIEW.dist][1], v = x => (ok(x) ? x : -Infinity);
      return DB.list.filter(x => ok(x.price) && x.price > 0 && ok(x.pct) && f(x.pct)).sort((a, b) => (v(a[VIEW.key]) - v(b[VIEW.key])) * VIEW.dir || a.code.localeCompare(b.code));
    }
    if (q) return DB.list.filter(s => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))   /* a search looks through every stock */
      .sort((a, b) => (a.code.toLowerCase() === q ? -1 : 0) - (b.code.toLowerCase() === q ? -1 : 0) || (ok(b.vol) ? b.vol : 0) - (ok(a.vol) ? a.vol : 0));
    if (L) rows = rows.filter(s => L.includes(s.code));
    if (VIEW.preset === "strong" || VIEW.preset === "weak") rows = rows.filter(s => s.vol >= 500);   /* thin stocks are left out, as broker apps do */
    if (q) rows = rows.filter(s => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    const k = VIEW.key, d = VIEW.dir;
    const v = x => (ok(x) ? x : -Infinity);
    if (k === "ord") return L ? rows.slice().sort((a, b) => L.indexOf(a.code) - L.indexOf(b.code)) : rows.slice();
    return rows.slice().sort((a, b) => (v(a[k]) - v(b[k])) * d || a.code.localeCompare(b.code));
  }
  const rowHTML = s => {
    const d = dig(s.price), t = tone(s.chg);
    return `<tr data-code="${esc(s.code)}" tabindex="0"><td class="l nm">${/^w[1-5]$/.test(VIEW.preset) && VIEW.key === "ord" && !VIEW.q ? '<i class="dgrip" aria-label="拖曳排序" title="拖曳排序">⋮⋮</i>' : ""}<b>${esc(s.name)}${flagTag(s.code)}</b><span>${esc(s.code)}${s.mkt === "otc" ? " 櫃" : s.mkt === "esb" ? " 興櫃" : ""}</span></td>
      <td><span class="pxpill ${t}${s.pct >= 9.4 || s.pct <= -9.4 ? " lim" : ""}"${s.pct >= 9.4 ? ' title="漲停"' : s.pct <= -9.4 ? ' title="跌停"' : ""}>${fmt(s.price, d)}</span></td><td class="${t}">${arrow(s.chg)}${fmt(Math.abs(s.chg), d)}</td><td class="${t} pctc" style="--w:${ok(s.pct) ? Math.min(Math.abs(s.pct) / 10, 1).toFixed(3) : 0}">${pct(s.pct)}</td>
      <td class="vol">${fmt(s.vol)}</td><td>${wlBtn(s)}</td></tr>`;
  };
  /* inside 自選1–5: ＋ adds a searched stock to that list, − takes one out */
  const wlBtn = s => {
    if (VIEW.q || VIEW.dist != null) { const has = LISTS.some(l => l.includes(s.code)); return `<button type="button" class="wlbtn wladd${has ? " in" : ""}" data-code="${esc(s.code)}" aria-label="加入自選 ${esc(s.name)}">＋</button>`; }
    if (!/^w[1-5]$/.test(VIEW.preset)) return "";
    const n = listIdx() + 1, inL = LISTS[n - 1].includes(s.code);
    if (inL && ARM.code === s.code && ARM.list === n - 1) return `<button type="button" class="wlbtn in arm" data-code="${esc(s.code)}" aria-label="確定從自選${n}移除 ${esc(s.name)}">確定移除</button>`;
    return `<button type="button" class="wlbtn${inL ? " in" : ""}" data-code="${esc(s.code)}" aria-label="${inL ? "從" : "加入"}自選${n}${inL ? "移除" : ""} ${esc(s.name)}">${inL ? "−" : "＋"}</button>`;
  };
  /* the ＋ on a search result opens a small menu: tap 自選1–5 to add or remove */
  let menuEl = null;
  function wlMenu(btn) {
    const code = btn.dataset.code;
    if (menuEl && menuEl.dataset.code === code) { menuEl.remove(); menuEl = null; return; }
    if (menuEl) menuEl.remove();
    menuEl = document.createElement("div"); menuEl.className = "wlmenu"; menuEl.dataset.code = code;
    const paint = () => { menuEl.innerHTML = LISTS.map((l, i) => `<button type="button" data-i="${i}" aria-pressed="${l.includes(code)}">自選${i + 1}<i>${l.includes(code) ? "✓" : "＋"}</i></button>`).join(""); };
    paint(); document.body.appendChild(menuEl);
    const r = btn.getBoundingClientRect(), w = menuEl.offsetWidth, h = menuEl.offsetHeight;
    menuEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + "px";
    menuEl.style.top = (r.bottom + h + 8 > innerHeight ? r.top - h - 6 : r.bottom + 6) + "px";
    menuEl.addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (!b) return; e.stopPropagation(); toggleWatch(code, +b.dataset.i); paint(); });
  }
  document.addEventListener("click", e => { if (menuEl && !e.target.closest(".wlmenu, .wladd")) { menuEl.remove(); menuEl = null; } }, true);
  addEventListener("scroll", () => { if (menuEl) { menuEl.remove(); menuEl = null; } }, { passive: true });
  /* − asks once before removing: the first tap turns it into 確定移除, a second tap within 3 seconds removes */
  /* the armed one is kept here, not only on the button, so the live repaint every 2 seconds draws it armed too */
  const ARM = { code: "", list: -1, t: 0 };
  function disarm() {
    clearTimeout(ARM.t); const c = ARM.code; ARM.code = ""; ARM.list = -1;
    if (c) $$(`.wlbtn.arm[data-code="${c}"]`).forEach(b => { b.classList.remove("arm"); b.textContent = "−"; });
  }
  function wlRemove(btn) {
    const code = btn.dataset.code, li = listIdx();
    if (ARM.code === code && ARM.list === li) { disarm(); toggleWatch(code, li); return; }
    disarm();
    ARM.code = code; ARM.list = li; ARM.t = setTimeout(disarm, 3000);
    btn.classList.add("arm"); btn.textContent = "確定移除";
  }
  function paintTable(animate) {
    const box = $("#dpList"); if (!$(".mtbl", box)) return;
    const rows = rowsNow(), show = rows.slice(0, VIEW.shown);
    $(".mtbl tbody", box).innerHTML = show.map(rowHTML).join("") ||
      `<tr><td class="mempty" colspan="6">${DB.failed ? "讀不到資料。" : /^w[1-5]$/.test(VIEW.preset) && !VIEW.q ? `自選${listIdx() + 1} 還沒有股票。`  : DB.list.length ? "找不到符合的股票。" : "載入中…"}</td></tr>`;
    $(".mmore", box).hidden = rows.length <= VIEW.shown;
    const dl = VIEW.dist != null && !VIEW.q && DIST[VIEW.dist];
    $(".mcount", box).innerHTML = !DB.list.length ? "" : dl ? `<button type="button" class="chip distclr" aria-pressed="true">漲跌幅 ${esc(dl[0])}${/~/.test(dl[0]) ? "%" : ""}<i aria-hidden="true">✕</i></button> ${fmt(rows.length)} 檔`
      : `${fmt(rows.length)} 檔${VIEW.preset === "strong" || VIEW.preset === "weak" ? "（成交量 500 張以上）" : ""}`;
    $$("[data-preset]", box).forEach(b => b.setAttribute("aria-pressed", String(!VIEW.q && !dl && b.dataset.preset === VIEW.preset)));
    $$("th.sort", box).forEach(th => { th.dataset.dir = th.dataset.key === VIEW.key ? (VIEW.dir < 0 ? "desc" : "asc") : ""; });
    if (animate && box.classList.contains("on")) rise($$(".mtbl tbody tr", box).slice(0, 24), 18);
    if (animate) rtPoll();
  }
  function paintIdx() {
    IDX.forEach(i => {
      const c = $(`.ixcard[data-k="${i.k}"]`); if (!c) return;
      const cd = CH[i.k + ":tick"];
      /* no quote from the Worker: take the chart's last real bar, only if it is fresh (within 20 minutes of a session) or is the last session's close, shown with its date; otherwise "讀不到" */
      if (!i.us && !i.rt && cd && cd.last > 0 && cd.at) {
        const age = Date.now() - cd.at, live = age < 20 * 60000, tz = new Date(cd.at + 8 * 3600e3).toISOString();
        if (live || age < 4 * 864e5) Object.assign(i, { z: cd.last, y: cd.prev, h: cd.high, l: cd.low, tm: live ? tz.slice(11, 19) : "", src: live ? (sessOpen(i.k) ? "盤中" : "收盤") : "收盤 " + tz.slice(5, 10).replace("-", "/") });
      }
      /* the first time a card shows its number, its line must be ready too, so the count-up and the line draw start together and end together (give up waiting after 6 s) */
      if (ok(i.z) && !c.dataset.shown) { const sp = $(".spark path", c); if (!(sp && sp.getAttribute("d")) && Date.now() - T_START < 6000) { c.classList.add("ixwait"); return; } c.dataset.shown = "1"; }
      const d = ok(i.z) && ok(i.y) ? i.z - i.y : NaN, t = tone(d), big = $(".big", c);
      if (i.label) { const sub = i.label.replace(/^[臺台]指期\s*/, "").trim(); const ix = $(".ixn", c), tt = sub ? i.name + " (" + sub + ")" : i.name; if (ix.dataset.t !== tt) { ix.dataset.t = tt; ix.innerHTML = esc(tt) + `<em class="ixen">${i.en}</em>`; } }
      $(".ixsrc", c).textContent = i.src ? i.src + (i.tm ? " " + i.tm.slice(0, 5) : "") : "";
      const bt = ok(i.z) ? fmt(i.z, 2) : "—";
      if (big.dataset.txt !== bt) { const was = big.dataset.z ? +big.dataset.z : NaN; big.dataset.txt = bt; big.textContent = bt; if (ok(was) && ok(i.z) && was !== i.z) { big.classList.remove("fl-up", "fl-down"); void big.offsetWidth; big.classList.add(i.z > was ? "fl-up" : "fl-down"); } }
      big.dataset.z = ok(i.z) ? i.z : ""; big.className = "big " + t + (big.classList.contains("fl-up") ? " fl-up" : big.classList.contains("fl-down") ? " fl-down" : "");
      const ct = ok(d) ? `${arrow(d)} ${fmt(Math.abs(d), 2)} (${pct(d / i.y * 100)})` : (DB.failed || (Date.now() - T_START > 30000 && DB.list.length) ? "讀不到資料" + (DB.failed ? "（證交所連不上）" : i.us ? (i.why ? "（" + i.why + "）" : "") : DB.rtErr ? "（" + DB.rtErr + "）" : i.why ? "（" + i.why + "）" : "") : "載入中…"), cg = $(".ixchg", c); c.classList.toggle("ixwait", !ok(d));
      if (cg.textContent !== ct) cg.textContent = ct;
      cg.className = "sub ixchg " + t;
      const ht = i.h > 0 && i.l > 0 ? `高 ${fmt(i.h, 2)}　低 ${fmt(i.l, 2)}` : "", hl = $(".ixhl", c); if (hl.textContent !== ht) hl.textContent = ht;
    });
    paintSparks();
  }
  function paintStrip() {
    try { paintBoard(); } catch (e) {}
    try { paintHeat(false); } catch (e) {}
    const el = $("#dpOverview .mstrip"); if (!el) return;
    const last = MKT.rows && MKT.rows[MKT.rows.length - 1], prev = MKT.rows && MKT.rows[MKT.rows.length - 2], I = MKT.inst;
    let up = 0, down = 0, flat = 0; DB.list.forEach(s => { if (s.chg > 0) up++; else if (s.chg < 0) down++; else flat++; });
    const cell = (k, v, c, sub) => `<div class="mcell"><span>${k}</span><b class="${c || ""}">${v}</b>${sub ? `<i>${sub}</i>` : ""}</div>`;
    el.innerHTML = [
      cell("成交金額（億）", last ? fmt(last[2]) : "—", "", last && prev ? `較前日 ${pct((last[2] / prev[2] - 1) * 100)}` : (last ? "" : "")),
      cell("外資（億）", I ? signed(I.f, 1) : "—", I ? tone(I.f) : "", I && last && I.date !== last[0] ? shortDay(I.date) : ""),
      cell("投信（億）", I ? signed(I.t, 1) : "—", I ? tone(I.t) : ""),
      cell("自營商（億）", I ? signed(I.d, 1) : "—", I ? tone(I.d) : ""),
      cell("上漲 / 下跌 / 平盤", DB.list.length ? `<em class="up">${fmt(up)}</em><s>/</s><em class="down">${fmt(down)}</em><s>/</s>${fmt(flat)}` : "—", "brd", DB.live ? "含 ETF" : "讀不到"),
    ].join("");
    const bc = el.lastElementChild;
    if (bc && DB.list.length) bc.insertAdjacentHTML("beforeend", breadthBar(up, flat, down));
  }

  /* ---------------- 類股熱力圖: every listed and 上櫃 stock grouped by industry, area = turnover, colour = turnover-weighted change ---------------- */
  let INDMAP = null;                               /* code → TWSE / TPEx industry code, published with otc.json */
  const INDN = { "01": "水泥", "02": "食品", "03": "塑膠", "04": "紡織纖維", "05": "電機機械", "06": "電器電纜", "08": "玻璃陶瓷", "09": "造紙", "10": "鋼鐵", "11": "橡膠", "12": "汽車",
    "14": "建材營造", "15": "航運", "16": "觀光餐旅", "17": "金融保險", "18": "貿易百貨", "19": "綜合", "20": "其他", "21": "化學", "22": "生技醫療", "23": "油電燃氣", "24": "半導體",
    "25": "電腦週邊", "26": "光電", "27": "通信網路", "28": "電子零組件", "29": "電子通路", "30": "資訊服務", "31": "其他電子", "32": "文化創意", "33": "農業科技", "34": "電子商務",
    "35": "綠能環保", "36": "數位雲端", "37": "運動休閒", "38": "居家生活", "80": "管理股票", "91": "存託憑證" };
  const HEAT = { sel: null, sig: "", w: 0, f: "all", sort: "val" };   /* f: all | up | down; sort: val (turnover) | pct (change) */
  /* squarified treemap: values sorted largest first → [x, y, w, h] for each */
  function squarify(vals, W, H) {
    const total = vals.reduce((a, b) => a + b, 0), out = new Array(vals.length);
    if (!(total > 0)) return out;
    let x = 0, y = 0, w = W, h = H, row = [];
    const items = vals.map((v, i) => ({ i, a: v * W * H / total }));
    const worst = (r, side) => { const s = r.reduce((a, q) => a + q.a, 0); let mx = 0, mn = Infinity; r.forEach(q => { mx = Math.max(mx, q.a); mn = Math.min(mn, q.a); }); return Math.max(side * side * mx / (s * s), s * s / (side * side * mn)); };
    const lay = r => {
      const s = r.reduce((a, q) => a + q.a, 0);
      if (w >= h) { const cw = s / h; let yy = y; r.forEach(q => { out[q.i] = [x, yy, cw, q.a / cw]; yy += q.a / cw; }); x += cw; w -= cw; }
      else { const ch = s / w; let xx = x; r.forEach(q => { out[q.i] = [xx, y, q.a / ch, ch]; xx += q.a / ch; }); y += ch; h -= ch; }
    };
    items.forEach(it => { const side = Math.min(w, h); if (!row.length || worst(row.concat(it), side) <= worst(row, side)) row.push(it); else { lay(row); row = [it]; } });
    if (row.length) lay(row);
    return out;
  }
  function heatGroups() {
    const G = new Map();
    DB.list.forEach(s => {
      const id = INDMAP && INDMAP[s.code]; if (!id || !INDN[id] || s.mkt === "esb" || !(s.price > 0) || !(s.vol > 0) || !ok(s.pct)) return;
      const v = s.price * s.vol * 1000;
      let g = G.get(id); if (!g) G.set(id, g = { id, name: INDN[id], val: 0, wp: 0, up: 0, dn: 0, list: [] });
      g.val += v; g.wp += v * s.pct; g.list.push(s); if (s.chg > 0) g.up++; else if (s.chg < 0) g.dn++;
    });
    return [...G.values()].map(g => Object.assign(g, { pct: g.wp / g.val })).sort((a, b) => b.val - a.val);
  }
  function paintHeat(animate) {
    const card = $(".bd-heat"); if (!card) return;
    const hm = $(".hm", card), head = $(".hmsel", card);
    if (!DB.list.length) return;
    if (!INDMAP) { hm.innerHTML = `<p class="sub hmwait">${DB.live ? "產業分類還沒發布，稍後會出現。" : "讀不到資料。"}</p>`; return; }
    const groups = heatGroups(), g = HEAT.sel && groups.find(x => x.id === HEAT.sel); HEAT.groups = groups;
    if (HEAT.sel && !g) HEAT.sel = null;
    let items = g ? g.list.slice().sort((a, b) => b.price * b.vol - a.price * a.vol).slice(0, 60).map(s => ({ key: s.code, name: s.name, val: s.price * s.vol * 1000, pct: s.pct, sub: fmt(s.price, dig(s.price)) }))
      : groups.map(x => ({ key: x.id, name: x.name, val: x.val, pct: x.pct, sub: `${x.list.length} 檔` }));
    /* layout uses coarse (~12%) steps of turnover, so every live tick does not reshuffle and resize the tiles */
    items.forEach(i => { i.val = i.val > 0 ? Math.exp(Math.round(Math.log(i.val) / 0.12) * 0.12) : 0; });
    if (HEAT.f !== "all") items = items.filter(i => (HEAT.f === "up" ? i.pct > 0 : i.pct < 0));
    items.sort(HEAT.sort === "pct" ? (a, b) => (HEAT.f === "down" ? a.pct - b.pct : b.pct - a.pct) || (a.key < b.key ? -1 : 1) : (a, b) => b.val - a.val || (a.key < b.key ? -1 : 1));
    const W = hm.clientWidth || 800, H = hm.clientHeight || 380;
    const sig = (HEAT.sel || "") + HEAT.f + HEAT.sort + W + ":" + items.map(i => i.key + (i.pct || 0).toFixed(2) + Math.round(Math.log(i.val + 1) / 0.12)).join();
    if (!animate && sig === HEAT.sig) return; HEAT.sig = sig;
    const R = squarify(items.map(i => i.val), W, H), lim = g ? 7 : 3.5;
    const seg = (k, opts) => `<span class="hmseg" data-hk="${k}">${opts.map(([v, l]) => `<button type="button" data-hv="${v}" aria-pressed="${HEAT[k] === v}">${l}</button>`).join("")}<i></i></span>`;
    const ctl = seg("f", [["all", "全部"], ["up", "只看漲"], ["down", "只看跌"]]) + seg("sort", [["val", "依成交值"], ["pct", "依漲跌幅"]]);
    head.innerHTML = (g ? `<button type="button" class="chip hmback">← 全部類股</button><b>${esc(g.name)}</b><span class="sub">${g.list.length} 檔・<em class="${tone(g.pct)}">${pct(g.pct)}</em>・上漲 ${g.up}／下跌 ${g.dn}</span>`
      : `<span class="sub">面積 = 成交金額，顏色 = 漲跌幅</span>`) + `<span class="hmctl">${ctl}</span>`;
    requestAnimationFrame(() => $$(".hmseg", head).forEach(segMark));
    if (!items.length) { hm.innerHTML = `<p class="sub hmwait">${HEAT.f === "up" ? "目前沒有上漲的" : "目前沒有下跌的"}${g ? "個股" : "類股"}。</p>`; return; }
    const tiles = items.map((it, i) => {
      const r = R[i] || [0, 0, 0, 0], a = clamp(Math.abs(it.pct || 0) / lim, 0.08, 1) * 0.9, sz = r[2] < 58 || r[3] < 30 ? " xs" : r[2] < 96 || r[3] < 48 ? " sm" : "";
      return { it, cls: `hmt ${tone(it.pct)}${sz}${g && Math.abs(it.pct || 0) >= 9.4 ? " lim" : ""}`, st: `left:${(r[0] / W * 100).toFixed(3)}%;top:${(r[1] / H * 100).toFixed(3)}%;width:${(r[2] / W * 100).toFixed(3)}%;height:${(r[3] / H * 100).toFixed(3)}%;--a:${a.toFixed(3)}` };
    });
    /* tiles already on the map (a live update, a filter or a re-sort): move and recolour them in place so they glide to their new place;
       new ones fade in, gone ones fade out, and a tile whose change moved flashes and pulses */
    const old = new Map($$(".hmt", hm).map(t => [t.dataset.k, t]));
    const level = g ? "s" : "g";
    if (!animate && old.size && hm.dataset.level === level) {
      const keep = new Set();
      tiles.forEach(({ it, cls, st }, i) => {
        let t = old.get(it.key);
        if (!t) {
          hm.insertAdjacentHTML("beforeend", `<button type="button" class="${cls}" data-k="${esc(it.key)}"${g ? ` data-code="${esc(it.key)}"` : ""} style="${st}"><b>${esc(it.name)}</b><span>${pct(it.pct)}</span><i>${esc(it.sub)}</i></button>`);
          t = hm.lastElementChild; t.dataset.p = (it.pct || 0).toFixed(2);
          t.animate([{ opacity: 0, transform: "scale(.5)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 120 + Math.min(i, 20) * 15, easing: "cubic-bezier(.2,.9,.3,1.2)", fill: "backwards" });
        } else {
          const was = +t.dataset.p, now = +(it.pct || 0).toFixed(2);
          t.setAttribute("style", st); t.className = cls; $("span", t).textContent = pct(it.pct); $("i", t).textContent = it.sub;
          if (Number.isFinite(was) && Math.abs(now - was) >= 0.1) heatFlash(t, now > was);
          t.dataset.p = now;
        }
        t.title = it.name + " " + pct(it.pct); keep.add(it.key);
      });
      old.forEach((t, k) => { if (keep.has(k)) return; t.style.pointerEvents = "none"; t.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.4)" }], { duration: 300, easing: "cubic-bezier(.23,1,.32,1)", fill: "forwards" }).onfinish = () => t.remove(); });
      return;
    }
    hm.dataset.level = level;
    const keepTip = $(".hmtip", hm);
    hm.innerHTML = tiles.map(({ it, cls, st }) => `<button type="button" class="${cls}" data-k="${esc(it.key)}" data-p="${(it.pct || 0).toFixed(2)}"${g ? ` data-code="${esc(it.key)}"` : ""} style="${st}"><b>${esc(it.name)}</b><span>${pct(it.pct)}</span><i>${esc(it.sub)}</i></button>`).join("");
    if (keepTip) { keepTip.hidden = true; hm.appendChild(keepTip); }
    if (animate) $$(".hmt", hm).forEach((t, i) => t.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "none" }], { duration: 480, delay: Math.min(i, 30) * 22, easing: "cubic-bezier(.2,.9,.3,1.2)", fill: "backwards" }));
  }
  function heatTip(e) {
    const hm = e.currentTarget, t = e.target.closest && e.target.closest(".hmt");
    let tip = $(".hmtip", hm);
    if (!t) { if (tip) tip.hidden = true; return; }
    if (!tip) { tip = document.createElement("div"); tip.className = "hmtip"; hm.appendChild(tip); }
    const yi = v => fmt(v / 1e8, v >= 1e10 ? 0 : 1) + " 億";
    if (t.dataset.code) {
      const s = DB.by.get(t.dataset.code); if (!s) return;
      tip.innerHTML = `<b>${esc(s.name)} <i>${esc(s.code)}</i>${flagTag(s.code)}</b><div><span>成交價</span><em class="${tone(s.chg)}">${fmt(s.price, dig(s.price))}</em><span>漲跌幅</span><em class="${tone(s.chg)}">${pct(s.pct)}</em><span>成交量</span><em>${fmt(s.vol)} 張</em><span>成交金額</span><em>${yi(s.price * s.vol * 1000)}</em></div><p>點一下看個股分析・右鍵加自選</p>`;
    } else {
      const g = (HEAT.groups || []).find(x => x.id === t.dataset.k); if (!g) return;
      const top = g.list.slice().sort((a, b) => b.price * b.vol - a.price * a.vol).slice(0, 4);
      tip.innerHTML = `<b>${esc(g.name)} <em class="${tone(g.pct)}">${pct(g.pct)}</em></b><div><span>成交金額</span><em>${yi(g.val)}</em><span>上漲／下跌</span><em><i class="up">${g.up}</i>／<i class="down">${g.dn}</i></em></div>
        <ul>${top.map(s => `<li><span>${esc(s.name)}</span><em class="${tone(s.chg)}">${pct(s.pct)}</em></li>`).join("")}</ul><p>點一下看這個類股的個股</p>`;
    }
    tip.hidden = false;
    const r = hm.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.transform = `translate(${Math.round(x + 16 + w > r.width ? x - w - 14 : x + 16)}px, ${Math.round(y + 16 + h > r.height ? Math.max(4, y - h - 12) : y + 16)}px)`;
  }
  function heatZoom(tile) {
    const hm = $(".hm"); if (!hm) return;
    $(".hmcard", hm) && $(".hmcard", hm).remove(); hm.classList.remove("focus");
    const hr = hm.getBoundingClientRect(), from = HEAT.sel;
    const box = el => { const r = el.getBoundingClientRect(); return { x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height, bg: getComputedStyle(el).backgroundColor }; };
    const veil = (b, grow) => {
      const v = document.createElement("div"); v.className = "hmveil"; v.style.background = b.bg; hm.appendChild(v);
      const small = `translate(${b.x}px, ${b.y}px) scale(${Math.max(0.01, b.w / hr.width)}, ${Math.max(0.01, b.h / hr.height)})`;
      const a = v.animate(grow ? [{ transform: small, borderRadius: "6px" }, { transform: "none", borderRadius: "14px" }] : [{ transform: "none", opacity: 0.95 }, { transform: small, opacity: 0.95 }], { duration: grow ? 460 : 420, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" });
      a.onfinish = () => v.animate([{ opacity: grow ? 1 : 0.95 }, { opacity: 0 }], { duration: 260, fill: "forwards" }).onfinish = () => v.remove();
    };
    const fadeIn = delay => $$(".hmt", hm).forEach((t, i) => t.animate([{ opacity: 0, filter: "blur(6px)", transform: "scale(.94)" }, { opacity: 1, filter: "none", transform: "none" }], { duration: 420, delay: delay + Math.min(i, 30) * 14, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" }));
    if (tile) {
      const b = box(tile); HEAT.sel = tile.dataset.k; HEAT.sig = ""; paintHeat(false); veil(b, true); fadeIn(260);
    } else {
      HEAT.sel = null; HEAT.sig = ""; paintHeat(false);
      const t = from && $(`.hmt[data-k="${from}"]`, hm);
      if (t) { const b = box(t); veil(b, false); }
      fadeIn(120);
    }
  }
  /* a live change: the tile flashes brighter and pulses once, with a small arrow for the direction */
  function heatFlash(t, up) {
    const nw = Date.now(); if (nw - (+t.dataset.fl || 0) < 6000) return; t.dataset.fl = nw;   /* at most one flash per tile every 6 s */
    t.animate([{ filter: "brightness(1.3)" }, { filter: "none" }], { duration: 1200, easing: "cubic-bezier(.2,.8,.3,1)" });
    const a = document.createElement("em"); a.className = "hmarw " + (up ? "up" : "down"); a.textContent = up ? "▲" : "▼"; t.appendChild(a);
    a.animate([{ opacity: 0, transform: `translateY(${up ? 6 : -6}px)` }, { opacity: 1, transform: "none", offset: .25 }, { opacity: 0, transform: `translateY(${up ? -8 : 8}px)` }], { duration: 1400, easing: "ease-out" }).onfinish = () => a.remove();
  }
  /* the sliding highlight behind the pressed button of a filter / sort switch */
  function segMark(sg) {
    const b = $("[aria-pressed=true]", sg), hl = $("i", sg); if (!b || !hl) return;
    hl.style.width = b.offsetWidth + "px"; hl.style.transform = `translateX(${b.offsetLeft}px)`;
  }
  /* hover focus: the tile under the pointer lifts and glows, the rest dim */
  function heatFocus(e) {
    const hm = e.currentTarget, t = e.target.closest && e.target.closest(".hmt");
    const was = $(".hmt.on", hm); if (was === t) return;
    if (was) was.classList.remove("on");
    if (t) t.classList.add("on");
    hm.classList.toggle("focus", !!t);
  }
  /* a tap: a ripple spreads from the finger; a 類股 then zooms in, a stock opens a small card */
  function heatRipple(t, e) {
    const r = t.getBoundingClientRect(), d = document.createElement("span"), R = Math.hypot(r.width, r.height) * 1.2;
    d.className = "hmrip"; d.style.left = ((e && e.clientX ? e.clientX : r.left + r.width / 2) - r.left) + "px"; d.style.top = ((e && e.clientY ? e.clientY : r.top + r.height / 2) - r.top) + "px";
    t.appendChild(d);
    d.animate([{ width: "0px", height: "0px", opacity: .55 }, { width: R + "px", height: R + "px", opacity: 0 }], { duration: 650, easing: "cubic-bezier(.2,.8,.3,1)" }).onfinish = () => d.remove();
  }
  function heatCard(t) {
    const hm = t.closest(".hm"), s = DB.by.get(t.dataset.code); if (!s) return;
    let c = $(".hmcard", hm);
    if (c && c.dataset.code === s.code) { heatCardClose(hm); return; }
    if (!c) { c = document.createElement("div"); c.className = "hmcard"; hm.appendChild(c); }
    const tip = $(".hmtip", hm); if (tip) tip.hidden = true;
    const d = dig(s.price), tn = tone(s.chg), lo = s.low, hi = s.high, rng = hi > lo;
    const P = v => clamp((v - lo) / (hi - lo) * 100, 0, 100).toFixed(1) + "%";
    c.dataset.code = s.code;
    c.innerHTML = `<button type="button" class="hmc-x" aria-label="關閉">×</button>
      <div class="hmc-h"><b>${esc(s.name)}</b><i>${esc(s.code)}</i>${flagTag(s.code)}</div>
      <div class="hmc-p"><b class="${tn}">${fmt(s.price, d)}</b><span class="${tn}">${s.chg > 0 ? "▲" : s.chg < 0 ? "▼" : ""}${fmt(Math.abs(s.chg || 0), d)}（${pct(s.pct)}）</span></div>
      ${rng ? `<div class="hmc-r"><span>${fmt(lo, d)}</span><div class="hmc-bar"><i class="hmc-fill ${tn}" style="--from:${ok(s.prev) ? P(Math.max(lo, Math.min(hi, s.prev))) : "0%"};--to:${P(s.price)}"></i>${ok(s.open) ? `<i class="hmc-o" style="left:${P(s.open)}" title="開盤"></i>` : ""}<i class="hmc-dot ${tn}" style="left:${P(s.price)}"></i></div><span>${fmt(hi, d)}</span></div>` : ""}
      <div class="hmc-kv"><span>成交量</span><b>${fmt(s.vol)} 張</b><span>成交金額</span><b>${fmt(s.price * s.vol / 1e5, 1)} 億</b>${ok(s.open) ? `<span>開盤</span><b>${fmt(s.open, d)}</b>` : ""}${ok(s.prev) ? `<span>昨收</span><b>${fmt(s.prev, d)}</b>` : ""}</div>
      <button type="button" class="btn hmc-go">看個股 →</button>`;
    /* beside the tile, inside the map */
    const hr = hm.getBoundingClientRect(), tr = t.getBoundingClientRect(), w = c.offsetWidth, h = c.offsetHeight;
    let x = tr.right - hr.left + 8; if (x + w > hr.width - 6) x = tr.left - hr.left - w - 8; if (x < 6) x = clamp(tr.left - hr.left + tr.width / 2 - w / 2, 6, hr.width - w - 6);
    const y = clamp(tr.top - hr.top + tr.height / 2 - h / 2, 6, Math.max(6, hr.height - h - 6));
    c.style.left = x + "px"; c.style.top = y + "px";
    c.animate([{ opacity: 0, transform: "scale(.85) translateY(6px)", filter: "blur(4px)" }, { opacity: 1, transform: "none", filter: "none" }], { duration: 320, easing: "cubic-bezier(.16,1,.3,1)" });
    const f = $(".hmc-fill", c); if (f) f.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: 600, delay: 120, easing: "ease-out", fill: "backwards" });
    const dt = $(".hmc-dot", c); if (dt) dt.animate([{ transform: "translate(-50%, -50%) scale(.6)", opacity: 0 }, { transform: "translate(-50%, -50%) scale(1.4)", offset: .7 }, { transform: "translate(-50%, -50%) scale(1)" }], { duration: 420, delay: 600, fill: "backwards" });
    $$(".hmt.picked", hm).forEach(x => x.classList.remove("picked")); t.classList.add("picked");
  }
  function heatCardClose(hm) {
    const c = $(".hmcard", hm); $$(".hmt.picked", hm).forEach(x => x.classList.remove("picked"));
    if (c) c.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.9)" }], { duration: 160 }).onfinish = () => c.remove();
  }
  let heatRT = 0;
  addEventListener("resize", () => { clearTimeout(heatRT); heatRT = setTimeout(() => { const hm = $(".hm"); if (hm && hm.clientWidth !== HEAT.w) { HEAT.w = hm.clientWidth; HEAT.sig = ""; paintHeat(false); } }, 200); });

  /* ---------------- 注意股 / 處置股 (TWSE announcements; TPEx refuses other sites, so 上櫃 stocks are not covered) ---------------- */
  const FLAGS = new Map();                         /* code → { k: "punish" | "notice", t, info } */
  async function loadFlags() {
    if (!DB.live) return;
    const get = u => J(u).then(j => (j && j.stat === "OK" && Array.isArray(j.fields) ? j : null)).catch(() => null);
    const [n, p] = await Promise.all([get(`https://www.twse.com.tw/rwd/zh/announcement/notice?response=json&startDate=${DB.date}&endDate=${DB.date}`), get("https://www.twse.com.tw/rwd/zh/announcement/punish?response=json")]);
    FLAGS.clear();
    const col = (j, k) => j.fields.indexOf(k), cell = (j, r, k) => String(col(j, k) >= 0 ? r[col(j, k)] : "").trim();
    if (n) n.data.forEach(r => { const c = cell(n, r, "證券代號"); if (DB.by.has(c)) FLAGS.set(c, { k: "notice", t: "注意", info: cell(n, r, "注意交易資訊").replace(/﹝.*?﹞/g, "").replace(/。$/, ""), cnt: cell(n, r, "累計次數") }); });
    if (p) p.data.forEach(r => { const c = cell(p, r, "證券代號"); if (DB.by.has(c)) FLAGS.set(c, { k: "punish", t: "處置", info: `${cell(p, r, "處置起迄時間")}・${cell(p, r, "處置措施")}`, cond: cell(p, r, "處置條件") }); });
    FLAGS.ready = !!(n || p);
    paintTable(false); paintHead(); paintFlagCard(true);
  }
  const flagTag = code => { const f = FLAGS.get(code); return f ? `<em class="sflag ${f.k}" title="${esc(f.t + "股：" + f.info)}">${f.t}</em>` : ""; };
  function paintFlagCard(animate) {
    const card = $(".bd-flag"); if (!card) return;
    const list = [...FLAGS.entries()].map(([c, f]) => ({ s: DB.by.get(c), f })).filter(x => x.s).sort((a, b) => (a.f.k === "punish" ? 0 : 1) - (b.f.k === "punish" ? 0 : 1) || b.s.vol - a.s.vol);
    const mineSet = new Set(LISTS.flat());
    $(".bd-n", card).textContent = FLAGS.ready ? `處置 ${list.filter(x => x.f.k === "punish").length}・注意 ${list.filter(x => x.f.k === "notice").length}` : "";
    $(".bd-list", card).innerHTML = !FLAGS.ready ? `<p class="sub">${DB.live ? "載入中…" : "讀不到資料。"}</p>` : !list.length ? `<p class="sub">今天沒有上市股票被列入。</p>`
      : list.map(({ s, f }) => `<button type="button" class="bd-row fl-row" data-code="${esc(s.code)}"><span class="bd-nm"><b>${esc(s.name)}</b><i>${esc(s.code)}</i>${mineSet.has(s.code) ? `<i class="fl-mine">自選</i>` : ""}</span><span class="fl-info">${esc(f.info)}</span><span class="bd-v"><em class="sflag ${f.k}">${f.t}</em></span></button>`).join("");
    if (animate) $$(".fl-row", card).forEach((r, i) => r.animate([{ opacity: 0, transform: "translateX(-8px)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: Math.min(i, 12) * 40, fill: "backwards" }));
  }

  /* ---------------- 法人連續買賣超: the last 10 trading days of TWSE's T86, each day kept in this browser once read ---------------- */
  const STRK = { days: null, busy: false, tab: "f1" };
  const instKey = ds => "twinst-" + ds;
  function instRead(ds) {
    let v = null; try { v = localStorage.getItem(instKey(ds)); } catch (e) {}
    if (!v) return null;
    const m = new Map(); v.split(";").forEach(x => { const [c, f, t] = x.split(":"); if (c) m.set(c, [+f || 0, +t || 0]); });
    return m;
  }
  function instWrite(ds, m) {
    try {
      localStorage.setItem(instKey(ds), [...m].map(([c, v]) => c + ":" + v[0] + ":" + v[1]).join(";"));
      const cut = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10).replace(/-/g, "");
      Object.keys(localStorage).filter(k => k.startsWith("twinst-") && k.slice(7) < cut).forEach(k => localStorage.removeItem(k));
    } catch (e) {}
  }
  async function loadStreak() {
    if (STRK.busy || STRK.days || !DB.live || !MKT.rows) return;
    STRK.busy = true;
    let dates = MKT.rows.map(r => String(r[0])).filter(d => /^\d{8}$/.test(d));
    if (DB.date && DB.date > dates[dates.length - 1]) dates.push(DB.date);
    dates = dates.slice(-10).reverse();             /* newest first */
    const days = [];
    for (let i = 0; i < dates.length; i++) {
      const ds = dates[i];
      let m = instRead(ds);
      if (!m) {
        try {
          const j = await J(`https://www.twse.com.tw/rwd/zh/fund/T86?date=${ds}&selectType=ALLBUT0999&response=json`);
          if (j.stat === "OK" && Array.isArray(j.data) && j.data.length) {
            const ix = (...subs) => j.fields.findIndex(f => subs.every(s => f.includes(s)));
            const iF = ix("外陸資買賣超股數", "不含"), iF2 = ix("外資", "買賣超"), iT = ix("投信買賣超");
            m = new Map();
            j.data.forEach(r => { const c = String(r[0]).trim(), f = Math.round(num(r[iF >= 0 ? iF : iF2]) / 1000) || 0, t = Math.round(num(r[iT]) / 1000) || 0; if (f || t) m.set(c, [f, t]); });
            instWrite(ds, m);
          }
        } catch (e) {}
        await wait(350);
      }
      if (m) days.push({ ds, m });
      else if (i > 0 || days.length) break;         /* a missing day in the middle breaks the run; today's may not be out yet */
      paintStreakNote(`讀取法人資料 ${i + 1}/${dates.length}…`);
    }
    STRK.days = days; STRK.busy = false;
    paintStreak(true);
  }
  const paintStreakNote = t => { const el = $(".bd-strk .bd-list"); if (el && !STRK.days) el.innerHTML = `<p class="sub">${esc(t)}</p>`; };
  function streakRows(k, sg) {
    const D = STRK.days, out = [];
    D[0].m.forEach((v, c) => {
      if (Math.sign(v[k]) !== sg || !DB.by.has(c)) return;
      let n = 0, sum = 0;
      for (const d of D) { const x = (d.m.get(c) || [0, 0])[k]; if (Math.sign(x) !== sg) break; n++; sum += x; }
      if (n >= 2) out.push({ s: DB.by.get(c), n, sum });
    });
    return out.sort((a, b) => b.n - a.n || Math.abs(b.sum) - Math.abs(a.sum)).slice(0, 10);
  }
  function paintStreak(animate) {
    const card = $(".bd-strk"); if (!card) return;
    $$("[data-stk]", card).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.stk === STRK.tab)));
    if (!STRK.days) return;
    const D = STRK.days, el = $(".bd-list", card);
    if (!D.length) { el.innerHTML = `<p class="sub">讀不到證交所的法人資料。</p>`; return; }
    $(".bd-n", card).textContent = `近 ${D.length} 個交易日・至 ${shortDay(D[0].ds)}`;
    const k = STRK.tab[0] === "f" ? 0 : 1, sg = STRK.tab[1] === "1" ? 1 : -1, rows = streakRows(k, sg), mx = Math.max(1, ...rows.map(r => r.n));
    el.innerHTML = rows.length ? rows.map(r => `<button type="button" class="bd-row sk-row" data-code="${esc(r.s.code)}" style="--w:${(r.n / D.length * 100).toFixed(1)}%"><span class="bd-nm"><b>${esc(r.s.name)}</b><i>${esc(r.s.code)}</i></span><span class="bd-px ${sg > 0 ? "up" : "down"}">${signed(r.sum, 0)} 張</span><span class="bd-v sk-n">${r.n} 天</span></button>`).join("")
      : `<p class="sub">沒有連續 2 天以上的股票。</p>`;
    card.dataset.sg = sg > 0 ? "up" : "down";
    if (animate) $$(".sk-row", card).forEach((r, i) => r.animate([{ opacity: 0, backgroundSize: "0% 100%" }, { opacity: 1, backgroundSize: "var(--w) 100%" }], { duration: 650, delay: i * 45, easing: "ease-out", fill: "backwards" }));
  }

  /* ---------------- 分析 tab: which part shows. By default the one that fits the hour: 盤前 before 09:00, 盤中 in the session, 收盤 after it ---------------- */
  let ANA = "pm";
  function anaDefault() {
    const t = new Date(Date.now() + 8 * 3600e3), m = t.getUTCHours() * 60 + t.getUTCMinutes(), wd = t.getUTCDay();
    if (wd === 0 || wd === 6) return "cl";
    return m < 9 * 60 ? "pm" : m < 13 * 60 + 30 ? "md" : "cl";
  }
  /* 盤中 can only be analysed while the day session is open (weekdays 09:00–13:30; the Worker also refuses on exchange holidays) */
  function mdOpenNow() { const t = new Date(Date.now() + 8 * 3600e3), m = t.getUTCHours() * 60 + t.getUTCMinutes(), wd = t.getUTCDay(); return wd >= 1 && wd <= 5 && m >= 9 * 60 && m <= 13 * 60 + 30; }
  function mdGate() {
    const b = $("#dpPre .mdgo"), n = $("#dpPre .mdclosed"); if (!b || !n) return;
    const open = mdOpenNow() && !MD_HOLIDAY; if (b.disabled && b.textContent !== "分析") return;   /* a run in progress */
    b.hidden = !open; n.hidden = open; if (!open) n.textContent = MD_HOLIDAY ? "今天沒有開盤，不做盤中分析" : "非開盤時間，盤中無法分析";
  }
  let MD_HOLIDAY = false;
  setInterval(mdGate, 30000);
  function anaMark(bar, snap) {
    const b = $("[aria-selected=true]", bar), hl = $("i", bar); if (!b || !hl || !b.offsetWidth) return;
    if (snap) { hl.style.transition = "none"; }
    hl.style.width = b.offsetWidth + "px"; hl.style.transform = `translateX(${b.offsetLeft}px)`;
    if (snap) { void hl.offsetWidth; hl.style.transition = ""; }
  }
  function anaSub(k, animate) {
    const pre = $("#dpPre"), bar = $(".anasub", pre); if (!bar) return;
    if (!["cl", "pm", "md", "wk", "ar"].includes(k)) k = "pm";
    const prev = ANA; ANA = k;
    try { if (animate) sessionStorage.setItem("twana", k); } catch (e) {}
    const bs = $$("[data-sub]", bar), b = bs.find(x => x.dataset.sub === k) || bs[0];
    bs.forEach(x => x.setAttribute("aria-selected", String(x === b)));
    anaMark(bar);
    if (!bar._ro && window.ResizeObserver) { bar._ro = new ResizeObserver(() => anaMark(bar, true)); bar._ro.observe(bar); } /* the bar has no size while 分析 is hidden: place the highlight again once it shows */
    const order = ["pm", "md", "cl", "wk", "ar"], dir = order.indexOf(k) >= order.indexOf(prev) ? 1 : -1;
    $$(".dcard[data-sub]", pre).forEach(c => {
      const on = c.dataset.sub === k; c.hidden = !on;
      if (on && animate) { c.animate([{ opacity: 0, transform: `translateX(${dir * 40}px)` }, { opacity: 1, transform: "none" }], { duration: 360, easing: "cubic-bezier(.16,1,.3,1)" }); rise($$(".lrise", c), 50, 120); }
    });
  }

  /* ---------------- 收盤摘要 (written by the Worker at 15:30 on trading days, or on request) ---------------- */
  function clPaint(j, animate) {
    const el = $("#dpPre .clout"); if (!el) return;
    const n = j && j.note;
    if (!n || !n.analysis) { el.innerHTML = `<p class="sub">還沒有收盤摘要，交易日 15:30 會自動產生。</p>`; return; }
    document.dispatchEvent(new CustomEvent("twdash:close", { detail: n }));
    const a = n.analysis, d = n.data || {}, X = d.taiex || {}, B = d.breadth || {}, li = arr => (Array.isArray(arr) ? arr : []).map(x => `<li>${esc(x)}</li>`).join("");
    const at = new Date(n.at).toLocaleString("zh-TW", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const t = /紅/.test(a.call || "") ? "up" : /黑/.test(a.call || "") ? "down" : "";
    const mineBy = new Map((d.mine || []).map(x => [x.code, x]));
    el.innerHTML = `
      <div class="aisum lrise"><div class="aiverdict"><span class="aitag ${t}">${esc(a.call || "")}</span><b class="pmday">${esc(String(n.day).slice(5).replace("-", "/"))} 收盤</b><span class="sub">${esc(at)} 產生</span></div>
        <p class="ailead">${esc(a.headline || "")}</p>
        <div class="clnums">${X.z ? `<div><span>加權指數</span><b class="${tone(X.pct)}">${fmt(X.z, 2)}</b><i class="${tone(X.pct)}">${pct(X.pct)}</i></div>` : ""}${d.turnoverYi ? `<div><span>成交金額</span><b>${fmt(d.turnoverYi)} 億</b></div>` : ""}${B.up ? `<div><span>上漲／下跌</span><b><em class="up">${esc(B.up)}</em> / <em class="down">${esc(B.down)}</em></b></div>` : ""}</div>
        <p>${esc(a.market || "")}</p></div>
      ${a.check && (a.check.open || a.check.close) ? `<div class="clcheck lrise"><h4>盤前預測對帳</h4>${[a.check.open, a.check.close].filter(Boolean).map(x => `<p class="${/✅/.test(x) ? "ok" : /❌/.test(x) ? "miss" : ""}">${esc(x)}</p>`).join("")}${a.check.note ? `<p class="sub">${esc(a.check.note)}</p>` : ""}</div>` : ""}
      <div class="aicols"><div class="lrise"><h4>領漲</h4><ul>${li(a.lead)}</ul></div><div class="lrise"><h4>落後</h4><ul>${li(a.lag)}</ul></div></div>
      ${a.flows ? `<div class="lrise"><h4>法人</h4><p>${esc(a.flows)}</p></div>` : ""}
      ${Array.isArray(a.next) && a.next.length ? `<div class="lrise"><h4>下個交易日要盯</h4><ul>${li(a.next)}</ul></div>` : ""}
      ${n.news && n.news.length ? `<details class="pmmore"><summary>參考的新聞</summary><div class="newslist">${newsHTML(n.news, null)}</div></details>` : ""}`;
    if (animate) rise($$(".lrise", el), 70);
  }
  async function clLoad() { try { clPaint(await J(`${WORKER}/tw/close`), true); } catch (e) { const el = $("#dpPre .clout"); if (el) el.innerHTML = `<p class="sub">收盤摘要需要部署新版 Worker。</p>`; } }
  async function clRun(b) {
    const el = $("#dpPre .clout");
    $$(".runmsg", el).forEach(x => x.remove());
    b.disabled = true; b.textContent = "整理中…";
    try {
      const r = await fetch(WORKER + "/tw/close/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.analysis) throw new Error(aiLimitMsg(j) || (j && j.error && /[一-鿿]/.test(j.error.message || "") ? j.error.message : "暫時沒有回應，過幾分鐘再試"));
      clPaint({ note: j }, true);
      const tg = j.sent === "sent" ? "已傳到 Telegram。" : j.sent && j.sent !== "off" ? "Telegram 沒有送出：" + j.sent : "";
      if (tg) el.insertAdjacentHTML("afterbegin", `<p class="runmsg sub ${j.sent === "sent" ? "" : "warn"}">${esc(tg)}</p>`);
      if (j.saveError) el.insertAdjacentHTML("afterbegin", `<p class="runmsg sub warn">這份摘要沒有存到伺服器，其他裝置看不到：${esc(j.saveError)}</p>`);
    } catch (e) {
      /* a long run can outlast the connection even though the summary was written and sent: look for it before saying it failed */
      await new Promise(r => setTimeout(r, 4000));
      try { const j = await J(`${WORKER}/tw/close`); if (j.note && Date.now() - j.note.at < 300000) { clPaint(j, true); b.disabled = false; b.textContent = "產生"; return; } } catch (e2) {}
      el.insertAdjacentHTML("afterbegin", `<p class="runmsg sub warn">${/[一-鿿]/.test(e.message || "") ? esc(e.message) : "連線中斷，請稍後重新整理。"}</p>`);
    }
    b.disabled = false; b.textContent = "產生";
  }

  /* ---------------- 週回顧 (written by the Worker on Saturday 09:00, or on request when the last one is old) ---------------- */
  function wkPaint(j, animate) {
    const el = $("#dpPre .wkout"), go = $("#dpPre .wkgo"); if (!el) return;
    const n = j && j.note;
    if (go) go.hidden = !!(n && n.analysis && Date.now() - n.at < 6 * 864e5);
    if (!n || !n.analysis) { el.innerHTML = `<p class="sub">還沒有週回顧，每週六早上 09:00 會自動產生。</p>`; return; }
    const a = n.analysis, d = n.data || {}, W = d.week || {}, li = arr => (Array.isArray(arr) ? arr : []).map(x => `<li>${esc(x)}</li>`).join("");
    const t = /紅/.test(a.call || "") ? "up" : /黑/.test(a.call || "") ? "down" : "", md = x => String(x).slice(5).replace("-", "/");
    el.innerHTML = `
      <div class="aisum lrise"><div class="aiverdict"><span class="aitag ${t}">${esc(a.call || "")}</span><b class="pmday">${md(n.from)}–${md(n.day)} 週回顧</b></div>
        <p class="ailead">${esc(a.headline || "")}</p>
        <div class="clnums">${W.toClose ? `<div><span>加權指數</span><b class="${tone(W.changePct)}">${fmt(W.toClose, 2)}</b><i class="${tone(W.changePct)}">本週 ${pct(W.changePct)}</i></div>` : ""}${W.high ? `<div><span>本週高／低</span><b>${fmt(W.high, 0)} / ${fmt(W.low, 0)}</b></div>` : ""}</div>
        <p>${esc(a.market || "")}</p></div>
      ${(d.days || []).length ? `<div class="lrise"><h4>每日收盤</h4><div class="wkdays">${d.days.map(x => `<div><span>${esc(String(x.day).replace("-", "/"))}</span><b>${fmt(x.close, 0)}</b><i class="${tone(x.pct)}">${pct(x.pct)}</i></div>`).join("")}</div></div>` : ""}
      <div class="aicols"><div class="lrise"><h4>強勢</h4><ul>${li(a.lead)}</ul></div><div class="lrise"><h4>弱勢</h4><ul>${li(a.lag)}</ul></div></div>
      ${a.flows ? `<div class="lrise"><h4>法人</h4><p>${esc(a.flows)}</p></div>` : ""}
      ${Array.isArray(a.risks) && a.risks.length ? `<div class="lrise"><h4>風險</h4><ul>${li(a.risks)}</ul></div>` : ""}
      ${Array.isArray(a.next) && a.next.length ? `<div class="lrise"><h4>下週要盯</h4><ul>${li(a.next)}</ul></div>` : ""}
      ${n.news && n.news.length ? `<details class="pmmore"><summary>參考的新聞</summary><div class="newslist">${newsHTML(n.news, null)}</div></details>` : ""}`;
    if (animate) rise($$(".lrise", el), 70);
  }
  async function wkLoad() { try { wkPaint(await J(`${WORKER}/tw/week`), true); } catch (e) { const el = $("#dpPre .wkout"); if (el) el.innerHTML = `<p class="sub">週回顧需要部署新版 Worker。</p>`; } }
  async function wkRun(b) {
    const el = $("#dpPre .wkout"); $$(".runmsg", el).forEach(x => x.remove());
    b.disabled = true; b.textContent = "整理中…";
    try {
      const r = await fetch(WORKER + "/tw/week/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.analysis) throw new Error(aiLimitMsg(j) || (j && j.error && /[一-鿿]/.test(j.error.message || "") ? j.error.message : "暫時沒有回應，過幾分鐘再試"));
      wkPaint({ note: j }, true);
    } catch (e) {
      await new Promise(r => setTimeout(r, 4000));
      try { const j = await J(`${WORKER}/tw/week`); if (j.note && Date.now() - j.note.at < 300000) { wkPaint(j, true); b.disabled = false; b.textContent = "產生"; return; } } catch (e2) {}
      el.insertAdjacentHTML("afterbegin", `<p class="runmsg sub warn">${/[一-鿿]/.test(e.message || "") ? esc(e.message) : "連線中斷，請稍後重新整理。"}</p>`);
    }
    b.disabled = false; b.textContent = "產生";
  }

  /* ---------------- 股票 tab: 清單 / 選股 / 營收 / 族群 / 法人, one shown at a time ---------------- */
  let LST = "ls";
  function lstSub(k, animate) {
    const dl = $("#dpList"), bar = $(".lsub", dl); if (!bar) return;
    const order = ["ls", "rk", "cp", "sc", "rv", "cm", "dv"];
    if (!order.includes(k)) k = "ls";
    const prev = LST; LST = k;
    try { if (animate) sessionStorage.setItem("twlst", k); } catch (e) {}
    const bs = $$("[data-sub]", bar), b = bs.find(x => x.dataset.sub === k) || bs[0];
    bs.forEach(x => x.setAttribute("aria-selected", String(x === b)));
    anaMark(bar);
    if (!bar._ro && window.ResizeObserver) { bar._ro = new ResizeObserver(() => anaMark(bar, true)); bar._ro.observe(bar); }
    const dir = order.indexOf(k) >= order.indexOf(prev) ? 1 : -1;
    $$(":scope > .dcard[data-sub]", dl).forEach(c => {
      const on = c.dataset.sub === k; c.hidden = !on;
      if (on && animate) c.animate([{ opacity: 0, transform: `translateX(${dir * 40}px)` }, { opacity: 1, transform: "none" }], { duration: 360, easing: "cubic-bezier(.16,1,.3,1)" });
    });
    if (k === "sc") scGo(); else if (k === "rv") rvGo();
    document.dispatchEvent(new CustomEvent("twdash:lstsub", { detail: k }));
  }
  const stockish = s => /^\d{4}$/.test(s.code) && s.mkt !== "esb";
  const rowBtn = (s, right, sub) => `<button type="button" class="instrow" data-code="${esc(s.code)}"><span class="nm"><b>${esc(s.name)}</b><em>${esc(s.code)}${sub ? "・" + sub : ""}</em></span><span class="rr">${right}</span></button>`;
  function lstBuild(dl) {
    dl.insertAdjacentHTML("beforeend", `
      <div class="dcard sc" data-sub="sc"><div class="aihead"><div><h3>選股器</h3></div><span class="sub scn"></span></div>
        <div class="scform">${SC_F.map(f => `<label><span>${f.l}</span><select data-f="${f.k}">${f.o.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>`).join("")}</div>
        <div class="scpre"><button type="button" class="chip scsave">＋ 儲存目前條件</button><span class="scpl"></span></div>
        <div class="scout"></div></div>
      <div class="dcard rv" data-sub="rv"><div class="aihead"><div><h3>月營收排行</h3></div><span class="sub rvn"></span></div>
        <div class="hmseg rvseg" role="group" aria-label="營收">${[["yu", "年增 ↑"], ["yd", "年增 ↓"], ["mu", "月增 ↑"], ["md", "月增 ↓"]].map(([k, l]) => `<button type="button" data-g="${k}" aria-pressed="${k === "yu"}">${l}</button>`).join("")}<i></i></div>
        <p class="sub rvnote">只列當月營收 1 億元以上的公司（太小的公司比例會失真）。</p>
        <div class="rvout"></div></div>
      <div class="dcard gp" data-sub="gp"><div class="aihead"><div><h3>族群／概念股</h3></div><span class="sub">自訂參考分類・今日平均漲跌</span></div><div class="gpout"></div></div>`);
    const sc = $(".sc", dl), st = store.get("twmain-sc", {});
    $$("select", sc).forEach(sel => { if (st[sel.dataset.f] != null && [...sel.options].some(o => o.value === st[sel.dataset.f])) sel.value = st[sel.dataset.f]; });
    sc.addEventListener("change", e => { const o = {}; $$("select", sc).forEach(x => (o[x.dataset.f] = x.value)); store.set("twmain-sc", o); if (e.target.tagName === "SELECT") $$("[data-bi]", sc).forEach(x => x.setAttribute("aria-pressed", "false")); scPaint(true); });
    /* saved conditions: one tap brings a whole set of filters back (kept in this browser, up to 8) */
    const PK = "twmain-sc-presets", defOf = f => f.o[0][0];
    const presets = () => store.get(PK, []) || [];
    const preName = v => { const parts = SC_F.filter(f => f.k !== "sort" && v[f.k] != null && v[f.k] !== defOf(f)).map(f => { const o = f.o.find(x => x[0] === v[f.k]); return o ? (f.k === "ind" ? o[1] : f.l + " " + o[1]) : ""; }).filter(Boolean); return parts.length ? parts.slice(0, 3).join("＋") : "全部股票"; };
    const prePaint = () => { $(".scpl", sc).innerHTML = presets().map((p, i) => `<span class="scp"><button type="button" class="chip" data-pi="${i}">${esc(p.n)}</button><button type="button" class="scx" data-px="${i}" aria-label="刪除這組條件">×</button></span>`).join(""); };
    prePaint();
    /* built-in strategies: one tap sets the whole form (everything else back to 不限) */
    const BI = [["高殖利率", { yld: "5", pe: "20", sort: "yld" }], ["營收創高", { yoy: "30", vol: "1000", sort: "yoy" }], ["法人買超＋站上月線", { chip: "a", ma: "above20", vol: "1000", sort: "vol" }],
      ["強勢突破", { sig: "high60", volx: "1.5", sort: "pct" }], ["低本益比價值", { pe: "10", yld: "3", sort: "pe" }], ["量增上攻", { pct: "3", volx: "2", vol: "1000", sort: "pct" }]];
    $(".scpre", sc).insertAdjacentHTML("beforebegin", `<div class="scpre scbi">${BI.map(([n], i) => `<button type="button" class="chip" data-bi="${i}">${n}</button>`).join("")}</div>`);
    sc.addEventListener("click", e => {
      const bi = e.target.closest("[data-bi]"); if (!bi) return;
      const v = BI[+bi.dataset.bi][1];
      $$("select", sc).forEach(sel => { const f = SC_F.find(x => x.k === sel.dataset.f), want = v[sel.dataset.f] != null ? v[sel.dataset.f] : f.o[0][0]; if ([...sel.options].some(o => o.value === want)) sel.value = want; });
      $$("[data-bi]", sc).forEach(x => x.setAttribute("aria-pressed", String(x === bi)));
      sc.dispatchEvent(new Event("change"));
    });
    sc.addEventListener("click", e => {
      const sv = e.target.closest(".scsave");
      if (sv) { const v = {}; $$("select", sc).forEach(x => (v[x.dataset.f] = x.value)); const L = presets().filter(p => JSON.stringify(p.v) !== JSON.stringify(v)); L.unshift({ n: preName(v), v }); store.set(PK, L.slice(0, 8)); prePaint(); const nb = $(".scp", sc); if (nb) nb.animate([{ opacity: 0, transform: "scale(.7)" }, { opacity: 1, transform: "none" }], { duration: 360, easing: "cubic-bezier(.2,.9,.3,1.2)" }); return; }
      const x = e.target.closest("[data-px]"); if (x) { const L = presets(); L.splice(+x.dataset.px, 1); store.set(PK, L); prePaint(); return; }
      const pb = e.target.closest("[data-pi]"); if (pb) { const p = presets()[+pb.dataset.pi]; if (!p) return; $$("select", sc).forEach(sel => { if (p.v[sel.dataset.f] != null && [...sel.options].some(o => o.value === p.v[sel.dataset.f])) sel.value = p.v[sel.dataset.f]; }); sc.dispatchEvent(new Event("change")); }
    });
    sc.addEventListener("click", e => { const r = e.target.closest(".instrow"); if (r) openStock(r.dataset.code, r); });
    const rv = $(".rv", dl), seg = $(".rvseg", rv);
    seg.addEventListener("click", e => { const b = e.target.closest("[data-g]"); if (!b) return; $$("[data-g]", seg).forEach(x => x.setAttribute("aria-pressed", String(x === b))); RV.g = b.dataset.g; segMark(seg); rvPaint(true); });
    if (window.ResizeObserver) new ResizeObserver(() => segMark(seg)).observe(seg);
    rv.addEventListener("click", e => { const r = e.target.closest(".instrow"); if (r) openStock(r.dataset.code, r); });
    $(".gp", dl).addEventListener("click", e => {
      const m = e.target.closest("[data-code]"); if (m) { openStock(m.dataset.code, m); return; }
      const h = e.target.closest(".gphead"); if (h) { h.parentElement.classList.toggle("open"); }
    });
  }
  /* 選股器 */
  const SC_F = [
    { k: "yld", l: "殖利率", o: [["0", "不限"], ["3", "≥ 3%"], ["4", "≥ 4%"], ["5", "≥ 5%"], ["6", "≥ 6%"]] },
    { k: "pe", l: "本益比", o: [["0", "不限"], ["10", "≤ 10"], ["15", "≤ 15"], ["20", "≤ 20"], ["25", "≤ 25"]] },
    { k: "yoy", l: "月營收年增", o: [["-999", "不限"], ["0", "≥ 0%"], ["10", "≥ 10%"], ["20", "≥ 20%"], ["30", "≥ 30%"], ["50", "≥ 50%"]] },
    { k: "pct", l: "今日漲跌幅", o: [["-99", "不限"], ["0", "上漲"], ["3", "≥ +3%"], ["5", "≥ +5%"], ["-3", "≤ -3%（下跌）"]] },
    { k: "vol", l: "成交量", o: [["0", "不限"], ["1000", "≥ 1,000 張"], ["5000", "≥ 5,000 張"], ["20000", "≥ 20,000 張"]] },
    { k: "chip", l: "法人（最近一日）", o: [["", "不限"], ["a", "三大法人買超"], ["f", "外資買超"], ["t", "投信買超"]] },
    { k: "ma", l: "均線（上市）", o: [["", "不限"], ["above20", "站上月線"], ["above60", "站上季線"]] },
    { k: "sig", l: "訊號（上市）", o: [["", "不限"], ["gold", "KD 黃金交叉（近 3 日）"], ["high60", "收盤創 60 日新高"]] },
    { k: "volx", l: "量能（上市）", o: [["0", "不限"], ["1.5", "≥ 20 日均量 1.5 倍"], ["2", "≥ 2 倍"], ["3", "≥ 3 倍"]] },
    { k: "px", l: "股價", o: [["", "不限"], ["le50", "≤ 50 元"], ["le100", "≤ 100 元"], ["le300", "≤ 300 元"], ["ge300", "≥ 300 元"], ["ge1000", "≥ 1,000 元"]] },
    { k: "ind", l: "產業", o: [["", "不限"], ...Object.entries(INDN).filter(([id]) => !/^(80|91)$/.test(id)).sort((a, b) => a[1].localeCompare(b[1], "zh-TW")).map(([id, n]) => [id, n])] },
    { k: "sort", l: "排序", o: [["vol", "成交量"], ["pct", "漲跌幅"], ["yld", "殖利率"], ["yoy", "營收年增"], ["pe", "本益比（低→高）"]] },
  ];
  async function scGo() { const el = $(".scout"); if (el && !FUND.map) el.innerHTML = `<p class="sub">讀取財務與法人資料…</p>`; await Promise.all([loadFund(), loadChip()]); scPaint(false); }
  function scPaint(animate) {
    const card = $("#dpList .sc"), el = $(".scout", card); if (!card) return;
    if (!DB.live) { el.innerHTML = `<p class="sub">讀不到資料。</p>`; return; }
    const v = {}; $$("select", card).forEach(x => (v[x.dataset.f] = x.value));
    const F = FUND.map || new Map(), C = CHIP.map || new Map(), rows = [];
    const tw = window.TWExtra && TWExtra.screenWants(v);
    if (tw && !TWExtra.screenReady(v, el, () => scPaint(false))) { $(".scn", card).textContent = ""; return; }
    DB.list.forEach(s => {
      if (tw && !TWExtra.screenPass(s.code, v)) return;
      if (!stockish(s) || !(s.price > 0) || !(s.vol > 0)) return;
      const f = F.get(s.code) || {}, c = C.get(s.code) || {};
      if (+v.yld > 0 && !(f.yld >= +v.yld)) return;
      if (+v.pe > 0 && !(f.pe > 0 && f.pe <= +v.pe)) return;
      if (+v.yoy > -999 && !(f.yoy >= +v.yoy)) return;
      if (+v.pct > -99) { if (+v.pct === -3 ? !(s.pct <= -3) : !(s.pct >= (+v.pct === 0 ? 0.0001 : +v.pct))) return; }
      if (+v.vol > 0 && !(s.vol >= +v.vol)) return;
      if (v.chip && !(c[v.chip] > 0)) return;
      if (v.ind && !(INDMAP && INDMAP[s.code] === v.ind)) return;
      if (v.px) { const n = +v.px.slice(2); if (v.px.startsWith("le") ? !(s.price <= n) : !(s.price >= n)) return; }
      rows.push({ s, f, c });
    });
    const key = { vol: r => -r.s.vol, pct: r => -r.s.pct, yld: r => -(r.f.yld || -1), yoy: r => -(Number.isFinite(r.f.yoy) ? r.f.yoy : -1e9), pe: r => (r.f.pe > 0 ? r.f.pe : 1e9) }[v.sort] || (r => -r.s.vol);
    rows.sort((a, b) => key(a) - key(b));
    $(".scn", card).textContent = `符合 ${rows.length.toLocaleString("zh-TW")} 檔${rows.length > 40 ? "，列前 40" : ""}`;
    if (!FUND.map && (+v.yld > 0 || +v.pe > 0 || +v.yoy > -999)) { el.innerHTML = `<p class="sub">財務資料還沒讀到，稍後再試。</p>`; return; }
    el.innerHTML = rows.length ? rows.slice(0, 40).map(r => rowBtn(r.s, `<b>${fmt(r.s.price, dig(r.s.price))}</b> <i class="${tone(r.s.pct)}">${pct(r.s.pct)}</i>`, [r.f.yld > 0 ? "殖利 " + r.f.yld.toFixed(2) + "%" : "", r.f.pe > 0 ? "本益比 " + r.f.pe.toFixed(1) : "", Number.isFinite(r.f.yoy) ? "年增 " + r.f.yoy.toFixed(0) + "%" : ""].filter(Boolean).join("・"))).join("") : `<p class="sub">沒有符合的股票，放寬一些條件試試。</p>`;
    if (animate) rise($$(".instrow", el).slice(0, 14), 20);
  }
  /* 月營收排行 */
  const RV = { g: "yu" };
  async function rvGo() { const el = $(".rvout"); if (el && !FUND.map) el.innerHTML = `<p class="sub">讀取月營收…</p>`; await loadFund(); rvPaint(false); }
  function rvPaint(animate) {
    const card = $("#dpList .rv"), el = $(".rvout", card); if (!card) return;
    if (!FUND.map) { el.innerHTML = `<p class="sub">月營收資料還沒讀到，稍後再試。</p>`; return; }
    const k = RV.g[0] === "y" ? "yoy" : "mom", up = RV.g[1] === "u";
    const rows = DB.list.filter(stockish).map(s => ({ s, f: FUND.map.get(s.code) })).filter(r => r.f && r.f.rev >= 1 && Number.isFinite(r.f[k]));
    rows.sort((a, b) => (up ? b.f[k] - a.f[k] : a.f[k] - b.f[k]));
    const ym = (rows[0] && rows[0].f.ym) || "", ymt = /^\d{5}$/.test(ym) ? `${+ym.slice(0, 3) + 1911}/${ym.slice(3)}` : ym;
    $(".rvn", card).textContent = ymt ? ymt + " 營收" : "";
    el.innerHTML = rows.slice(0, 30).map(r => rowBtn(r.s, `<b class="${tone(r.f[k])}">${r.f[k] > 0 ? "+" : ""}${r.f[k].toFixed(1)}%</b>`, `營收 ${r.f.rev.toFixed(1)} 億・${k === "yoy" ? "月增 " + (Number.isFinite(r.f.mom) ? r.f.mom.toFixed(0) + "%" : "—") : "年增 " + (Number.isFinite(r.f.yoy) ? r.f.yoy.toFixed(0) + "%" : "—")}`)).join("") || `<p class="sub">沒有資料。</p>`;
    if (animate) rise($$(".instrow", el).slice(0, 14), 20);
  }
  /* 族群／概念股 */
  const GROUPS = [
    ["AI 伺服器", ["2317", "2382", "3231", "6669", "2356", "3706", "2376", "2301"]],
    ["散熱", ["3017", "3324", "2421", "6230", "3653", "8210"]],
    ["矽光子／CPO", ["3081", "3450", "6442", "4979", "3363", "3380"]],
    ["半導體", ["2330", "2303", "3711", "2454", "3034", "2379", "3443", "5269"]],
    ["記憶體", ["2408", "2337", "2344", "3006", "8299", "3260"]],
    ["PCB／載板", ["3037", "8046", "3189", "2368", "4958", "6213"]],
    ["網通", ["2345", "3596", "2332", "5388", "6285", "3704"]],
    ["重電／電網", ["1519", "1513", "1503", "1504", "1514", "1609"]],
    ["被動元件", ["2327", "2492", "2456", "6173", "3026"]],
    ["航運", ["2603", "2609", "2615", "2605", "2606", "5608"]],
    ["金融", ["2881", "2882", "2891", "2886", "2884", "2892", "5880", "2887"]],
    ["軍工／航太", ["2634", "8033", "3005", "2645"]],
    ["生技", ["6446", "4743", "1760", "4147", "6547"]],
    ["營建", ["2504", "2515", "2520", "2538", "2542", "5534"]],
    ["鋼鐵", ["2002", "2014", "2015", "2006", "2027"]],
  ];
  function gpPaint() {
    const el = $(".gpout"); if (!el) return;
    if (!DB.live || !DB.list.length) { el.innerHTML = `<p class="sub">讀不到資料。</p>`; return; }
    const open = new Set($$(".gpg.open .gpname").map(x => x.textContent));
    const gs = GROUPS.map(([n, cs]) => { const ms = cs.map(c => DB.by.get(c)).filter(s => s && s.price > 0 && ok(s.pct)); return { n, ms, avg: ms.length ? ms.reduce((t, s) => t + s.pct, 0) / ms.length : null, up: ms.filter(s => s.chg > 0).length }; }).filter(g => g.ms.length >= 3).sort((a, b) => b.avg - a.avg);
    const mx = Math.max(1, ...gs.map(g => Math.abs(g.avg)));
    el.innerHTML = gs.map(g => `<div class="gpg${open.has(g.n) ? " open" : ""}"><button type="button" class="gphead"><span class="gpname">${esc(g.n)}</span><span class="gpbar"><i class="${tone(g.avg)}" style="width:${Math.max(4, Math.abs(g.avg) / mx * 100).toFixed(0)}%"></i></span><b class="${tone(g.avg)}">${pct(g.avg)}</b><em>${g.up}/${g.ms.length} 漲</em></button><div class="gpmem">${g.ms.slice().sort((a, b) => b.pct - a.pct).map(s => `<button type="button" data-code="${esc(s.code)}"><span>${esc(s.name)}</span><i class="${tone(s.pct)}">${pct(s.pct)}</i></button>`).join("")}</div></div>`).join("");
  }

  /* ---------------- 法人買賣超排行 (TWSE T86 through the Worker) ---------------- */
  const INST = { g: "a", data: null };
  function instInit(card) {
    const seg = $(".instseg", card);
    seg.addEventListener("click", e => { const b = e.target.closest("[data-g]"); if (!b) return; $$("[data-g]", seg).forEach(x => x.setAttribute("aria-pressed", String(x === b))); INST.g = b.dataset.g; segMark(seg); instPaint(true); });
    if (window.ResizeObserver) new ResizeObserver(() => segMark(seg)).observe(seg);
    card.addEventListener("click", e => { const r = e.target.closest(".instrow"); if (r) openStock(r.dataset.code, r); });
  }
  async function instLoad() {
    const el = $(".instout"); if (!el) return;
    try { INST.data = await J(`${WORKER}/tw/instrank`); } catch (e) { el.innerHTML = `<p class="sub">法人買賣超讀不到資料（${esc(whyOf(e))}）。</p>`; return; }
    instPaint(true);
  }
  function instPaint(animate) {
    const card = $(".inst"), D = INST.data; if (!card || !D) return;
    const el = $(".instout", card), g = (D.groups || {})[INST.g] || { buy: [], sell: [] };
    $(".instday", card).textContent = String(D.day).slice(5).replace("-", "/") + "・單位：張";
    const col = (title, arr, cls) => `<div class="instcol"><h4>${title}</h4>${arr.length ? arr.map(([c, n, v]) => `<button type="button" class="instrow" data-code="${esc(c)}"><span class="nm"><b>${esc(n)}</b><em>${esc(c)}</em></span><span class="${cls}">${v > 0 ? "+" : ""}${Number(v).toLocaleString("zh-TW")}</span></button>`).join("") : `<p class="sub">沒有資料</p>`}</div>`;
    el.innerHTML = `<div class="instcols">${col("買超", g.buy, "up")}${col("賣超", g.sell, "down")}</div>`;
    if (animate) rise($$(".instrow", el), 25);
  }

  /* ---------------- 國際行情 and 期貨籌碼 on 總覽 (through the Worker) ---------------- */
  /* the four US indices, second row of the index cards: last close (or the live quote while Wall Street trades) and the day's change */
  function usPaint(rows) {
    IDX.filter(i => i.us).forEach(it => {
      const r = rows.find(x => x.symbol === it.us); if (!r) return;
      const p = r.changePct, y = ok(p) ? r.last / (1 + p / 100) : NaN, t = r.asOfTaipei ? r.asOfTaipei.slice(5).replace("-", "/") : "";
      Object.assign(it, { z: r.last, y, tm: "", src: "美股 UTC+8 " + t, rt: true, hist: Array.isArray(r.hist) ? r.hist : null });
    });
    paintIdx(); paintSparks();
  }
  async function wdLoad() {
    const el = $("#dpOverview .wdout"); if (!el) return;
    try {
      const j = await J(`${WORKER}/tw/world`), rows = j.rows || [];
      if (!rows.length) throw 0;
      usPaint(rows);
      const dg = r => (/殖利率/.test(r.name) ? 3 : r.last >= 1000 ? 0 : 2);
      el.innerHTML = `<div class="wdgrid">${rows.filter(r => !/^(S&P 500|Nasdaq|道瓊|費城半導體|加權指數)$/.test(r.name) && !/^\^(GSPC|IXIC|DJI|SOX|TWII)$/.test(r.symbol || "")).map(r => `<div class="wdcell"><span>${esc(r.name)}</span><b>${fmt(r.last, dg(r))}</b><i class="${/VIX/.test(r.name) ? tone(-r.changePct) : tone(r.changePct)}">${r.changePct == null ? "—" : pct(r.changePct)}</i></div>`).join("")}</div>`;
      const t = rows.map(r => r.asOfTaipei).filter(Boolean).sort().pop(); $("#dpOverview .wdn").textContent = t ? t.slice(5).replace("-", "/") + " 更新" : "";
    } catch (e) { const why = e === 0 ? "Worker 沒有回傳美股資料" : whyOf(e); IDX.filter(i => i.us).forEach(i => Object.assign(i, { why, z: NaN, y: NaN, h: NaN, l: NaN, src: "", rt: false, hist: null })); try { paintIdx(); } catch (er) {} el.innerHTML = `<p class="sub">讀不到資料（${why}）。</p>`; }
  }
  async function ftLoad() {
    const el = $(".ftout"); if (!el) return;
    try {
      const j = await J(`${WORKER}/tw/futchip`), who = [["f", "外資"], ["t", "投信"], ["d", "自營商"]];
      const mx = Math.max(1, ...who.map(([k]) => Math.abs((j[k] || {}).net || 0)));
      const h = (j.history || []).filter(x => Number.isFinite(x.f));
      let spark = "";
      if (h.length >= 2) {
        const v = h.map(x => x.f), lo = Math.min(...v, 0), hi = Math.max(...v, 0), sp = hi - lo || 1, Y = y => (34 - (y - lo) / sp * 30).toFixed(1);
        spark = `<div class="ftspark"><span>外資淨部位 近 ${h.length} 天</span><svg viewBox="0 0 120 38" preserveAspectRatio="none"><line x1="0" x2="120" y1="${Y(0)}" y2="${Y(0)}"/><polyline points="${v.map((y, i) => `${(i / (v.length - 1) * 120).toFixed(1)},${Y(y)}`).join(" ")}"/></svg></div>`;
      }
      el.innerHTML = who.map(([k, l]) => { const x = j[k]; if (!x || x.net == null) return ""; return `<div class="ftrow"><span>${l}</span><span class="ftbar"><i class="${tone(x.net)}" style="width:${Math.max(3, Math.abs(x.net) / mx * 100).toFixed(0)}%"></i></span><b class="${tone(x.net)}">${x.net > 0 ? "+" : ""}${x.net.toLocaleString("zh-TW")}</b><em>多 ${(x.long || 0).toLocaleString("zh-TW")}／空 ${(x.short || 0).toLocaleString("zh-TW")}</em></div>`; }).join("") + spark + `<p class="sub ftfoot">${esc(String(j.date).slice(5).replace("-", "/"))} 收盤後，單位：口。淨口數為正代表偏多、為負代表偏空。</p>`;
    } catch (e) { el.innerHTML = `<p class="sub">期貨籌碼讀不到資料（${esc(whyOf(e))}）。</p>`; }
  }
  let wdAt = Date.now();   /* US session: every 10 s; otherwise every 5 minutes */
  setInterval(() => { if (document.hidden || cur !== "dpOverview") return; const gap = window.TWSet && window.TWSet.usOpen() ? 10000 : 300000; if (Date.now() - wdAt >= gap - 500) { wdAt = Date.now(); wdLoad(); } }, 5000);

  /* ---------------- stock page: 融資融券, 股權分散, 本益比河流圖 ---------------- */
  const XT = new Map();
  /* the Worker first (7 seconds at most); when TWSE / TDCC refuse the Worker's servers, this browser asks them itself */
  const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  const nz = v => { const n = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
  const wdays = n => { const out = []; let d = new Date(Date.now() + 8 * 3600e3); for (let k = 0; k < n; k++, d = new Date(d.getTime() - 864e5)) if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10).replace(/-/g, "")); return out; };
  const MGD = new Map();
  async function directMargin(code) {
    const rows = [];
    for (const ds of wdays(14)) {
      if (rows.length >= 8) break;
      let m = MGD.get(ds);
      if (m === undefined) {
        try {
          const j = await J(`https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${ds}&selectType=STOCK&response=json`), t = Array.isArray(j.tables) ? j.tables.find(x => x && Array.isArray(x.data) && Array.isArray(x.fields) && x.fields[0] === "代號") : null;
          m = j.stat === "OK" && t ? Object.fromEntries(t.data.map(r => [String(r[0]).trim(), [nz(r[5]), nz(r[6]), nz(r[11]), nz(r[12])]])) : null;
          if (m) MGD.set(ds, m);
        } catch (e) { m = null; }
      }
      const r = m && m[code]; if (!r) continue;
      rows.unshift({ d: ds.slice(0, 4) + "-" + ds.slice(4, 6) + "-" + ds.slice(6), fin: r[1], finChg: r[1] - r[0], sht: r[3], shtChg: r[3] - r[2] });
    }
    if (!rows.length) throw new Error("no margin");
    return { code, rows };
  }
  async function directPe(code, n) {
    const yms = []; let d = new Date(Date.now() + 8 * 3600e3);
    for (let k = 0; k < n; k++) { yms.unshift(d.toISOString().slice(0, 7).replace("-", "")); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)); }
    const out = [];
    for (let i = 0; i < yms.length; i += 4) {
      const part = await Promise.all(yms.slice(i, i + 4).map(async ym => {
        try {
          const j = await J(`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?date=${ym}01&stockNo=${code}&response=json`);
          if (j.stat !== "OK" || !Array.isArray(j.data) || !Array.isArray(j.fields)) return [];
          const F = j.fields, f = k => F.findIndex(x => String(x).includes(k)), iD = f("日期"), iP = f("本益比"), iY = f("殖利率"), iB = f("淨值比");
          return j.data.map(r => { const m = String(r[iD]).match(/(\d+)\D+(\d+)\D+(\d+)/); if (!m) return null; const y = +m[1] < 1911 ? +m[1] + 1911 : +m[1];
            return [y + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[3]).padStart(2, "0"), iP >= 0 ? nz(r[iP]) : null, iY >= 0 ? nz(r[iY]) : null, iB >= 0 ? nz(r[iB]) : null]; }).filter(Boolean);
        } catch (e) { return []; }
      }));
      part.forEach(a => out.push(...a));
    }
    if (!out.length) throw new Error("no pe");
    return { code, rows: out };
  }
  /* 集保 distribution through FinMind (CORS open): the latest week, 15 levels */
  async function directHolders(code) {
    const from = new Date(Date.now() + 8 * 3600e3 - 40 * 864e5).toISOString().slice(0, 10);
    const j = await J(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockHoldingSharesPer&data_id=${encodeURIComponent(code)}&start_date=${from}`), a = Array.isArray(j.data) ? j.data : [];
    if (!a.length) throw new Error("no holders");
    const date = a.reduce((m, r) => (r.date > m ? r.date : m), ""), low = r => { const t = String(r.HoldingSharesLevel); if (/more|以上/i.test(t)) return 1e9; const m = t.replace(/,/g, "").match(/\d+/); return m ? +m[0] : -1; };
    const L = a.filter(r => r.date === date && /\d/.test(String(r.HoldingSharesLevel)) && !/total|合計|差異/i.test(String(r.HoldingSharesLevel))).sort((x, y) => low(x) - low(y)).slice(0, 15).map((r, i) => ({ lv: i + 1, people: nz(r.people), shares: nz(r.unit), pct: nz(r.percent) }));
    if (L.length < 10) throw new Error("no holders");
    const sum = (x, y, k) => Math.round(L.filter(o => o.lv >= x && o.lv <= y).reduce((t, o) => t + (o[k] || 0), 0) * 100) / 100;
    return { code, date, levels: L, big1000: sum(15, 15, "pct"), big400: sum(12, 15, "pct"), small10: sum(1, 3, "pct"), bigPeople: sum(12, 15, "people"), totalPeople: sum(1, 15, "people") };
  }
  const xtGet = (kind, code, q) => {
    const k = kind + ":" + code + (q || "");
    if (!XT.has(k)) {
      const direct = kind === "margin" ? () => directMargin(code) : kind === "pe" ? () => directPe(code, +((q || "").match(/m=(\d+)/) || [0, 12])[1]) : () => directHolders(code);
      XT.set(k, within(J(`${WORKER}/tw/${kind}?c=${encodeURIComponent(code)}${q || ""}`), 7000).catch(() => direct()).catch(e => { XT.delete(k); throw e; }));
    }
    return XT.get(k);
  };
  function stockExtras(code, tok) {
    const box = $("#dpStock"), put = (cls, html, note) => { if (tok !== chartTok || code !== CODE) return; const c = $("." + cls, box); if (!c) return; $(".sxout", c).innerHTML = html; $(".sxn", c).textContent = note || ""; };
    const miss = m => `<p class="sub">${m}</p>`, s0 = DB.by.get(code);
    ["smg", "shd", "spe", "sfin", "sinst"].forEach(c => put(c, miss("載入中…")));
    if (!s0 || !/^\d{4,6}[A-Z]?$/.test(code)) return;
    if (/^00/.test(code)) { put("smg", miss("沒有資料。")); put("spe", miss("沒有資料。")); }   /* ETFs have no margin trading and no P/E */
    else xtGet("margin", code).then(j => {
      const r = (j.rows || []).slice().reverse(), sg = v => (v > 0 ? "+" : "") + Number(v).toLocaleString("zh-TW");
      put("smg", `<div class="mgtbl"><div class="mgh"><span>日期</span><span>融資餘額</span><span>增減</span><span>融券餘額</span><span>增減</span><span>券資比</span></div>${r.map(x => `<div><span>${esc(x.d.slice(5).replace("-", "/"))}</span><span>${x.fin.toLocaleString("zh-TW")}</span><span class="${tone(x.finChg)}">${sg(x.finChg)}</span><span>${x.sht.toLocaleString("zh-TW")}</span><span class="${tone(x.shtChg)}">${sg(x.shtChg)}</span><span>${x.fin > 0 ? (x.sht / x.fin * 100).toFixed(1) + "%" : "—"}</span></div>`).join("")}</div>`, "單位：張");
    }, () => put("smg", miss("讀不到資料。")));
    xtGet("holders", code).then(j => {
      const L = j.levels || [], g = (a, b) => Math.round(L.filter(x => x.lv >= a && x.lv <= b).reduce((t, x) => t + (x.pct || 0), 0) * 100) / 100;
      const bands = [["10 張以下", g(1, 3)], ["10–50 張", g(4, 8)], ["50–200 張", g(9, 10)], ["200–400 張", g(11, 11)], ["400–1,000 張", g(12, 14)], ["1,000 張以上", g(15, 15)]], mx = Math.max(1, ...bands.map(b => b[1]));
      put("shd", `<div class="hdtiles"><div><span>千張大戶持股</span><b>${j.big1000.toFixed(2)}%</b></div><div><span>400 張以上</span><b>${j.big400.toFixed(2)}%</b></div><div><span>10 張以下散戶</span><b>${j.small10.toFixed(2)}%</b></div><div><span>股東人數</span><b>${Number(j.totalPeople).toLocaleString("zh-TW")}</b></div></div>${bands.map(([n, v]) => `<div class="hdrow"><span>${n}</span><span class="hdbar"><i style="width:${Math.max(1, Math.min(100, v)).toFixed(0)}%"></i></span><b>${v.toFixed(2)}%</b></div>`).join("")}`, String(j.date).slice(5).replace("-", "/") + " 週資料");
    }, () => put("shd", miss("讀不到資料。")));
    if (!/^00/.test(code)) peRiver(code, tok, put);
    finGlance(code, put); instGlance(code, put);
  }
  /* 三大法人買賣超 (last 10 trading days): FinMind, as the other cards on this page */
  const FMC = new Map();
  const fmGet = (ds, code, days) => {
    const k = ds + ":" + code; if (!FMC.has(k)) { const from = new Date(Date.now() + 8 * 3600e3 - days * 864e5).toISOString().slice(0, 10); FMC.set(k, J(`https://api.finmindtrade.com/api/v4/data?dataset=${ds}&data_id=${encodeURIComponent(code)}&start_date=${from}`).catch(e => { FMC.delete(k); throw e; })); }
    return FMC.get(k);
  };
  async function instGlance(code, put) {
    const miss = m => `<p class="sub">${m}</p>`;
    try {
      const a = ((await fmGet("TaiwanStockInstitutionalInvestorsBuySell", code, 24)).data || []), by = new Map();
      a.forEach(r => { const o = by.get(r.date) || { f: 0, t: 0, d: 0 }, v = (Number(r.buy) || 0) - (Number(r.sell) || 0), n = String(r.name);
        if (/^Foreign/.test(n)) o.f += v; else if (n === "Investment_Trust") o.t += v; else if (/^Dealer/.test(n)) o.d += v; by.set(r.date, o); });
      const days = [...by.keys()].sort().slice(-10).map(d => { const o = by.get(d), L = x => Math.round(x / 1000); return { d, f: L(o.f), t: L(o.t), dl: L(o.d), a: L(o.f + o.t + o.d) }; });
      if (days.length < 2) { put("sinst", miss("沒有資料。")); return; }
      const mx = Math.max(1, ...days.map(x => Math.abs(x.a))), c = v => (v > 0 ? "up" : v < 0 ? "down" : ""), n = v => (v > 0 ? "+" : "") + v.toLocaleString("zh-TW");
      const sum = k => days.reduce((t, x) => t + x[k], 0);
      put("sinst", `<div class="mgtbl itbl"><div class="mgh"><span>日期</span><span>外資</span><span>投信</span><span>自營商</span><span>合計</span><span></span></div>${days.slice().reverse().map(x => `<div><span>${esc(x.d.slice(5).replace("-", "/"))}</span><span class="${c(x.f)}">${n(x.f)}</span><span class="${c(x.t)}">${n(x.t)}</span><span class="${c(x.dl)}">${n(x.dl)}</span><b class="${c(x.a)}">${n(x.a)}</b><span class="ibar"><i class="${c(x.a)}" style="width:${Math.max(3, Math.abs(x.a) / mx * 100).toFixed(0)}%"></i></span></div>`).join("")}<div class="isum"><span>${days.length} 日合計</span><span class="${c(sum("f"))}">${n(sum("f"))}</span><span class="${c(sum("t"))}">${n(sum("t"))}</span><span class="${c(sum("dl"))}">${n(sum("dl"))}</span><b class="${c(sum("a"))}">${n(sum("a"))}</b><span></span></div></div>`, "單位：張");
      setTimeout(() => { rise($$(".sinst .mgtbl > div:not(.mgh)"), 30); $$(".sinst .ibar i").forEach(b => b.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 650, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" })); }, 30);
    } catch (e) { put("sinst", miss("讀不到資料。")); }
  }
  /* 財報速覽: the last 8 quarters of EPS, gross margin and operating margin (FinMind's quarterly statements; ETFs have none) */
  const FING = new Map();
  async function finGlance(code, put) {
    const miss = m => `<p class="sub">${m}</p>`;
    if (/^00/.test(code)) { put("sfin", miss("沒有資料。")); return; }
    try {
      if (!FING.has(code)) {
        const from = new Date(Date.now() + 8 * 3600e3 - 800 * 864e5).toISOString().slice(0, 10);
        FING.set(code, J(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockFinancialStatements&data_id=${encodeURIComponent(code)}&start_date=${from}`).catch(e => { FING.delete(code); throw e; }));
      }
      const a = ((await FING.get(code)).data || []), by = {};
      a.forEach(r => { (by[r.date] = by[r.date] || {})[r.type] = Number(r.value); });
      const qs = Object.keys(by).sort().slice(-8).map(d => { const o = by[d], rev = o.Revenue; return { d, eps: o.EPS, gm: rev > 0 && Number.isFinite(o.GrossProfit) ? o.GrossProfit / rev * 100 : null, om: rev > 0 && Number.isFinite(o.OperatingIncome) ? o.OperatingIncome / rev * 100 : null }; }).filter(q => Number.isFinite(q.eps));
      if (qs.length < 2) { put("sfin", miss("沒有資料。")); return; }
      const qn = d => { const m = +d.slice(5, 7); return d.slice(2, 4) + "Q" + Math.ceil(m / 3); };
      const W = 250, H = 156, L = 14, R = 14, T = 26, B = 24, n = qs.length, step = (W - L - R) / n, cx = i => L + step * (i + .5);
      const panel = (title, vals, kind, unit) => {
        const ok2 = vals.filter(v => v != null), lo = Math.min(...ok2), hi = Math.max(...ok2);
        const base = kind === "col" ? Math.min(0, lo) : lo - (hi - lo || 1) * .35, top = kind === "col" ? Math.max(0, hi) : hi + (hi - lo || 1) * .2, span = top - base || 1;
        const y = v => T + (H - T - B) * (1 - (v - base) / span), y0 = y(kind === "col" ? 0 : base);
        const lab = (v, i, x, yy, cls) => `<text class="fin-v ${cls || ""}" x="${x.toFixed(1)}" y="${(yy - 6).toFixed(1)}" text-anchor="middle">${v.toFixed(unit ? 1 : 2)}${unit}</text>`;
        let g = "";
        if (kind === "col") {
          g += `<line class="fin-ax" x1="${L}" x2="${W - R}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}"/>`;
          g += vals.map((v, i) => { if (v == null) return ""; const yy = y(v), up = v >= 0, h = Math.max(2, Math.abs(yy - y0)), x = cx(i) - step * .3; return `<g class="fin-b"><rect class="${up ? "fin-up" : "fin-dn"}" x="${x.toFixed(1)}" y="${(up ? y0 - h : y0).toFixed(1)}" width="${(step * .6).toFixed(1)}" height="${h.toFixed(1)}" rx="3" style="transform-origin:${cx(i).toFixed(1)}px ${y0.toFixed(1)}px"><title>${qn(qs[i].d)}：${v.toFixed(2)} 元</title></rect>${n <= 6 || i % 2 === (n - 1) % 2 ? lab(v, i, cx(i), up ? y0 - h : y0 + h + 14, up ? "" : "dn") : ""}</g>`; }).join("");
        } else {
          const pts = vals.map((v, i) => v == null ? null : [cx(i), y(v)]).filter(Boolean);
          g += `<line class="fin-ax" x1="${L}" x2="${W - R}" y1="${(H - B).toFixed(1)}" y2="${(H - B).toFixed(1)}"/>`;
          g += `<path class="fin-area" d="M${pts[0][0].toFixed(1)},${(H - B).toFixed(1)} ${pts.map(q => "L" + q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" ")} L${pts[pts.length - 1][0].toFixed(1)},${(H - B).toFixed(1)}Z"/>`;
          g += `<polyline class="fin-line" fill="none" points="${pts.map(q => q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" ")}"/>`;
          /* value labels: latest, highest, first and lowest, in that order; one that would sit on top of another is left out */
          const named = [];
          [n - 1, vals.indexOf(hi), 0, vals.indexOf(lo)].forEach(i => { if (i >= 0 && vals[i] != null && !named.includes(i) && named.every(j => Math.abs(cx(i) - cx(j)) >= 36 || Math.abs(y(vals[i]) - y(vals[j])) >= 13)) named.push(i); });
          g += vals.map((v, i) => v == null ? "" : `<g class="fin-b"><circle class="fin-dot${i === n - 1 ? " last" : ""}" cx="${cx(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === n - 1 ? 4 : 2.8}"><title>${qn(qs[i].d)}：${v.toFixed(1)}%</title></circle>${named.includes(i) ? lab(v, i, cx(i), y(v)) : ""}</g>`).join("");
        }
        const xl = qs.map((q, i) => (n <= 6 || i % 2 === (n - 1) % 2) ? `<text class="fin-q" x="${cx(i).toFixed(1)}" y="${H - 7}" text-anchor="middle">${qn(q.d)}</text>` : "").join("");
        return `<div class="finp"><h4>${title}</h4><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">${g}${xl}</svg></div>`;
      };
      put("sfin", `<div class="fqgrid">${panel("EPS（元）", qs.map(q => q.eps), "col", "")}${panel("毛利率", qs.map(q => q.gm), "line", "%")}${panel("營業利益率", qs.map(q => q.om), "line", "%")}</div>`, "近 " + qs.length + " 季");
      setTimeout(() => {
        $$(".fqgrid .fin-line:not([data-a])").forEach(l => { l.dataset.a = "1"; l.setAttribute("pathLength", "1"); l.style.strokeDasharray = "1"; l.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 900, easing: "cubic-bezier(.215,.61,.355,1)", fill: "backwards" }); });
        $$(".fqgrid .fin-area:not([data-a])").forEach(a => { a.dataset.a = "1"; a.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 250, fill: "backwards" }); });
        $$(".fqgrid .fin-b").forEach((b, i) => { if (b.dataset.a) return; b.dataset.a = "1"; b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 80 * (i % 8) + 200, fill: "backwards" }); });
        $$(".fqgrid rect.fin-up:not([data-a]), .fqgrid rect.fin-dn:not([data-a])").forEach((r, i) => { r.dataset.a = "1"; r.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 650, delay: 70 * (i % 8), easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }); });
      }, 30);
    } catch (e) { put("sfin", miss("讀不到資料。")); }
  }
  async function peRiver(code, tok, put) {
    const miss = m => `<p class="sub">${m}</p>`;
    try {
      const j = await xtGet("pe", code, "&m=12"), pes = (j.rows || []).filter(r => r[1] > 0);
      if (pes.length < 30) { put("spe", miss("沒有資料。")); return; }
      const px = new Map(); let ms = monthsBack(12);
      for (let i = 0; i < ms.length; i++) {
        if (tok !== chartTok) return;
        const key = `twh:${code}:${ms[i]}`, cached = i > 0 && store.get(key, null);
        let rows = []; try { rows = await histMonth(code, ms[i], i > 0); } catch (e) {}
        rows.forEach(r => px.set(String(r[0]).replace(/\D/g, ""), r[4]));
        if (!cached && i < ms.length - 1) await wait(500);
      }
      const pts = pes.map(r => ({ d: r[0].replace(/-/g, ""), pe: r[1], p: px.get(r[0].replace(/-/g, "")) })).filter(x => x.p > 0).map(x => ({ ...x, eps: x.p / x.pe }));
      if (pts.length < 30) { put("spe", miss("沒有資料。")); return; }
      const sorted = pts.map(x => x.pe).sort((a, b) => a - b), q = f => sorted[Math.min(sorted.length - 1, Math.floor(f * (sorted.length - 1)))];
      const lv = [[.1, "低"], [.3, ""], [.5, "中"], [.7, ""], [.9, "高"]].map(([f, n]) => ({ f, n, m: q(f) }));
      const all = pts.flatMap(x => [x.p, ...lv.map(l => l.m * x.eps)]), lo = Math.min(...all) * .97, hi = Math.max(...all) * 1.03, W = 640, H = 230, X = i => 8 + i / (pts.length - 1) * (W - 16), Y = v => 8 + (hi - v) / (hi - lo) * (H - 24);
      const cur = pts[pts.length - 1], rank = Math.round(sorted.filter(v => v <= cur.pe).length / sorted.length * 100);
      const cols = ["#4aa3a0", "#79b58a", "#c9a64a", "#d58b4f", "#cc5b52"];
      put("spe", `<svg class="river" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="本益比河流圖">${lv.map((l, k) => `<polyline fill="none" stroke="${cols[k]}" stroke-width="1.4" opacity=".85" points="${pts.map((x, i) => `${X(i).toFixed(1)},${Y(l.m * x.eps).toFixed(1)}`).join(" ")}"/>`).join("")}<polyline class="rvline" fill="none" stroke-width="2.2" points="${pts.map((x, i) => `${X(i).toFixed(1)},${Y(x.p).toFixed(1)}`).join(" ")}"/></svg>
        <div class="rvleg">${lv.map((l, k) => `<span><i style="background:${cols[k]}"></i>${l.m.toFixed(1)} 倍${l.n ? "（" + l.n + "）" : ""}</span>`).join("")}<span><i class="rvk"></i>股價</span></div>
        <p class="sub">目前本益比 ${cur.pe.toFixed(1)} 倍，在近 12 個月的區間裡高過約 ${rank}% 的日子。每條線是「近 12 個月這個本益比 × 當時每股盈餘」，只是歷史參考，不代表會漲或跌。</p>`, `${pts.length} 個交易日`);
    } catch (e) { put("spe", miss("讀不到資料。")); }
  }

  /* ---------------- 提問 (one question about the stock that is open) ---------------- */
  const ASK = { code: "" };
  async function askRun(q) {
    const box = $("#dpStock"), out = $(".askout", box), inp = $(".askin", box), go = $(".askform .aigo", box), code = CODE, s = DB.by.get(code), cs = barsOf(code);
    q = String(q || "").trim(); if (q.length < 2) return;
    if (!s || !cs || cs.length < 30) { out.insertAdjacentHTML("afterbegin", `<p class="runmsg sub warn">這檔的歷史資料還不夠，無法回答。</p>`); return; }
    if (!DB.live) { out.insertAdjacentHTML("afterbegin", `<p class="runmsg sub warn">讀不到資料。</p>`); return; }
    if (ASK.code !== code) { out.innerHTML = ""; ASK.code = code; }
    $$(".runmsg", out).forEach(x => x.remove());
    const item = document.createElement("div"); item.className = "askitem";
    item.innerHTML = `<div class="askq">${esc(q)}</div><div class="aska"><div class="aiwait"><i></i><i></i><i></i></div></div>`;
    out.insertBefore(item, out.firstChild); inp.value = ""; go.disabled = true;
    try {
      await Promise.all([loadFund(), loadChip()]);
      const r = await fetch(WORKER + "/tw/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ d: DEVICE, code, name: s.name, q, facts: facts(cs) }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.a) throw new Error(aiLimitMsg(j) || (j && j.error && /[一-鿿]/.test(j.error.message || "") ? j.error.message : "暫時沒有回應，過幾分鐘再試"));
      $(".aska", item).innerHTML = `<p>${esc(j.a)}</p>${j.news && j.news.length ? `<details class="pmmore"><summary>參考的新聞</summary><div class="newslist">${newsHTML(j.news, null)}</div></details>` : ""}`;
    } catch (e) {
      $(".aska", item).innerHTML = `<p class="sub warn">${/[一-鿿]/.test(e.message || "") ? esc(e.message) : "連不到分析服務，請稍後再試。"}</p>`;
    }
    go.disabled = false;
  }

  /* ---------------- 自選股 ---------------- */
  function buildWatch() {
    $("#dpWatch").innerHTML = `<div class="dcard wsum" hidden></div><div class="dcard mkt wlist"><div class="mwrap"><table class="mtbl ttbl mktab wtbl"><thead><tr><th class="l">商品</th><th>成交價</th><th>漲跌</th><th>漲跌幅</th><th>開盤</th><th>最高</th><th>最低</th><th class="wrngh">日內區間</th><th>成交量</th></tr></thead><tbody class="wgrid"></tbody></table></div></div>`;
    $("#dpWatch").addEventListener("click", e => {
      const c = e.target.closest("tr[data-code], .wpick[data-code]"); if (c) openStock(c.dataset.code, c);
    });
  }
  function paintWatch(animate) {
    const g = $("#dpWatch .wgrid"); if (!g) return;
    const cards = WATCH.map(code => {
      const s = DB.by.get(code);
      const star = "";
      if (!s) return `<tr class="wrow"><td class="l nm"><b>${esc(code)}</b><span>${DB.list.length ? "不在清單中" : "載入中…"}</span></td><td colspan="8"></td></tr>`;
      const d = dig(s.price), t = tone(s.chg), pos = s.high > s.low ? clamp((s.price - s.low) / (s.high - s.low) * 100, 0, 100) : 50;
      return `<tr class="wrow" data-code="${esc(code)}" tabindex="0"><td class="l nm"><b>${esc(s.name)}</b><span>${esc(code)}</span></td>
        <td><span class="pxpill ${t}${s.pct >= 9.4 || s.pct <= -9.4 ? " lim" : ""}">${fmt(s.price, d)}</span></td><td class="${t}">${arrow(s.chg)}${fmt(Math.abs(s.chg), d)}</td><td class="${t} pctc" style="--w:${ok(s.pct) ? Math.min(Math.abs(s.pct) / 10, 1).toFixed(3) : 0}">${pct(s.pct)}</td>
        <td>${fmt(s.open, d)}</td><td>${fmt(s.high, d)}</td><td>${fmt(s.low, d)}</td>
        <td class="wrng"><div class="rngbar"><i class="rngdot" style="left:${pos.toFixed(1)}%"></i></div></td><td class="vol">${fmt(s.vol)}</td>${star}</tr>`;
    });
    g.innerHTML = cards.join("") || `<tr><td class="mempty" colspan="9">還沒有自選股。</td></tr>`;
    paintWatchSum();
    if (animate && $("#dpWatch").classList.contains("on")) rise($$("tr", g).slice(0, 30), 25);
  }
  /* the watchlist in one line: the average move, how many rose and fell, who leads and who lags */
  function paintWatchSum() {
    const el = $("#dpWatch .wsum"); if (!el) return;
    const got = WATCH.map(c => DB.by.get(c)).filter(s => s && ok(s.pct));
    el.hidden = got.length < 2;
    if (got.length < 2) return;
    const up = got.filter(s => s.chg > 0).length, dn = got.filter(s => s.chg < 0).length, avg = got.reduce((a, s) => a + s.pct, 0) / got.length;
    const best = got.reduce((a, s) => (s.pct > a.pct ? s : a)), worst = got.reduce((a, s) => (s.pct < a.pct ? s : a));
    const pick = (k, s) => `<button type="button" class="wpick" data-code="${esc(s.code)}"><span>${k}</span><b>${esc(s.name)}</b><em class="${tone(s.pct)}">${pct(s.pct)}</em></button>`;
    el.dataset.tone = tone(avg);
    el.innerHTML = `<div class="wavg"><span>自選 ${got.length} 檔平均</span><b class="${tone(avg)}">${pct(avg)}</b></div>
      <div class="wmid"><div class="wcount"><em class="up">${up} 漲</em><em class="down">${dn} 跌</em><em>${got.length - up - dn} 平</em></div>${breadthBar(up, got.length - up - dn, dn)}</div>
      <div class="wlead">${pick("領漲", best)}${best !== worst ? pick("落後", worst) : ""}</div>`;
  }
  const breadthBar = (up, flat, down) => `<div class="breadth" role="img" aria-label="上漲 ${up}、平盤 ${flat}、下跌 ${down}"><i class="up" style="flex-grow:${up}"></i><i class="flat" style="flex-grow:${flat}"></i><i class="down" style="flex-grow:${down}"></i></div>`;
  function saveLists() { store.set("twtrade-watch", WATCH); store.set("twtrade-wl", LISTS); }
  function toggleWatch(code, i) {
    i = i || 0;
    const L = LISTS[i];
    LISTS[i] = L.includes(code) ? L.filter(c => c !== code) : L.concat(code);
    WATCH = LISTS[0];
    saveLists();
    if (i === 0) { alertSync(); paintTape(); }
    paintWatch(false);
    if (VIEW.q || /^w[1-5]$/.test(VIEW.preset)) paintTable(false);
  }

  /* ---------------- indicators ---------------- */
  const sma = (a, n) => a.map((_, i) => (i < n - 1 ? null : a.slice(i - n + 1, i + 1).reduce((x, y) => x + y, 0) / n));
  const ema = (a, n) => { const k = 2 / (n + 1), o = []; a.forEach((v, i) => o.push(i ? o[i - 1] + k * (v - o[i - 1]) : v)); return o; };
  function calc(cs) {
    const cl = cs.map(c => c[4]), n = cs.length;
    const ma5 = sma(cl, 5), ma20 = sma(cl, 20), ma60 = sma(cl, 60);
    const sd = cl.map((_, i) => { if (i < 19) return null; const w = cl.slice(i - 19, i + 1), m = ma20[i]; return Math.sqrt(w.reduce((a, x) => a + (x - m) ** 2, 0) / 20); });
    const bu = ma20.map((m, i) => (m == null ? null : m + 2 * sd[i])), bl = ma20.map((m, i) => (m == null ? null : m - 2 * sd[i]));
    let k = 50, d = 50; const K = [], D = [];
    cs.forEach((c, i) => { const w = cs.slice(Math.max(0, i - 8), i + 1), h9 = Math.max(...w.map(x => x[2])), l9 = Math.min(...w.map(x => x[3])); const rsv = h9 === l9 ? 50 : (c[4] - l9) / (h9 - l9) * 100; k = k * 2 / 3 + rsv / 3; d = d * 2 / 3 + k / 3; K.push(k); D.push(d); });
    const e12 = ema(cl, 12), e26 = ema(cl, 26), dif = e12.map((v, i) => v - e26[i]), dea = ema(dif, 9), hist = dif.map((v, i) => v - dea[i]);
    const rsi = []; let ag = 0, al = 0;
    cl.forEach((v, i) => {
      if (!i) { rsi.push(null); return; }
      const ch = v - cl[i - 1], g = Math.max(ch, 0), l = Math.max(-ch, 0);
      if (i <= 14) { ag += g / 14; al += l / 14; rsi.push(i === 14 ? 100 - 100 / (1 + (al ? ag / al : 99)) : null); }
      else { ag = (ag * 13 + g) / 14; al = (al * 13 + l) / 14; rsi.push(100 - 100 / (1 + (al ? ag / al : 99))); }
    });
    return { cl, n, ma5, ma20, ma60, bu, bl, K, D, dif, dea, hist, rsi, vol: cs.map(c => c[5]), vma20: sma(cs.map(c => c[5]), 20) };
  }

  /* ---------------- the chart: price, volume and the chosen indicators in one drawing with a shared time axis ---------------- */
  /* the drawing is as wide, in its own units, as the box it goes into (280–720), so its text is not shrunk on a phone */
  const chartW = host => clamp(Math.round((host && host.clientWidth) || 720), 280, 720);
  function chartSVG(all, span, end, W = 720) {
    const N0 = Math.min(span, all.length), off = clamp(all.length - N0 - (end || 0), 0, Math.max(0, all.length - N0));
    const I = calc(all), cs = all.slice(off, off + N0), N = cs.length;
    const PL = 8, PR = 60, gap = 14;
    const panes = [{ k: "price", h: 250 }];
    if (IND.vol) panes.push({ k: "vol", h: 64 });
    if (IND.kd) panes.push({ k: "kd", h: 84 });
    if (IND.macd) panes.push({ k: "macd", h: 84 });
    if (IND.rsi) panes.push({ k: "rsi", h: 84 });
    let y0 = 8; panes.forEach(p => { p.y = y0; y0 += p.h + gap; });
    const H = y0 + 8;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "K 線與技術指標");
    svg.setAttribute("class", "kchart");
    const add = (tag, attrs, cls, parent) => { const e = document.createElementNS(NS, tag); for (const a in attrs) e.setAttribute(a, attrs[a]); if (cls) e.setAttribute("class", cls); (parent || svg).appendChild(e); return e; };
    const X = i => PL + (W - PL - PR) * (i + 0.5) / N, bw = Math.max(2, (W - PL - PR) / N * 0.62);
    const sl = a => a.slice(off, off + N);
    const line = (arr, Y, cls) => add("path", { d: arr.map((v, i) => (v == null ? "" : (i && arr[i - 1] != null ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1))).join("") }, cls);
    const label = (p, t) => { add("text", { x: PL + 2, y: p.y + 11 }, "plabel").textContent = t; };
    panes.forEach(p => {
      const top = p.y, bot = p.y + p.h;
      if (p.k === "price") {
        const extra = IND.boll ? [...sl(I.bu), ...sl(I.bl)].filter(v => v != null) : [];
        const hi = Math.max(...cs.map(c => c[2]), ...extra), lo = Math.min(...cs.map(c => c[3]), ...extra), pad = (hi - lo) * 0.06 || 1;
        const a = hi + pad, b = lo - pad, Y = v => top + p.h * (a - v) / (a - b);
        for (let g = 0; g <= 4; g++) { const y = top + p.h * g / 4, v = a - (a - b) * g / 4; add("line", { x1: PL, x2: W - PR, y1: y, y2: y }, "gridl"); add("text", { x: W - PR + 6, y: y + 4 }).textContent = fmt(v, dig(v)); }
        cs.forEach((c, i) => {
          const cls = c[4] >= c[1] ? "tk-up" : "tk-down", x = X(i);
          add("line", { x1: x, x2: x, y1: Y(c[2]), y2: Y(c[3]) }, "wick " + cls);
          add("rect", { x: x - bw / 2, y: Y(Math.max(c[1], c[4])), width: bw, height: Math.max(1, Math.abs(Y(c[1]) - Y(c[4]))) }, cls);
        });
        if (IND.boll) { line(sl(I.bu), Y, "bb"); line(sl(I.bl), Y, "bb"); }
        if (IND.ma) { line(sl(I.ma5), Y, "ma5"); line(sl(I.ma20), Y, "ma20"); line(sl(I.ma60), Y, "ma60"); }
        p.Y = Y; p.a = a; p.b = b;
      } else if (p.k === "vol") {
        const max = Math.max(...cs.map(c => c[5])) || 1, Y = v => bot - (p.h - 12) * v / max;
        cs.forEach((c, i) => add("rect", { x: X(i) - bw / 2, y: Y(c[5]), width: bw, height: Math.max(1, bot - Y(c[5])) }, (c[4] >= c[1] ? "tk-up" : "tk-down") + " volbar"));
        line(sl(I.vma20), Y, "ma20");
        add("text", { x: W - PR + 6, y: top + 10 }).textContent = fmt(max); label(p, "成交量（張）");
      } else {
        let series, lo, hi, bars = null, guides = [];
        if (p.k === "kd") { series = [[sl(I.K), "ik"], [sl(I.D), "id"]]; lo = 0; hi = 100; guides = [20, 80]; label(p, "KD(9)"); }
        else if (p.k === "rsi") { series = [[sl(I.rsi), "ik"]]; lo = 0; hi = 100; guides = [30, 70]; label(p, "RSI(14)"); }
        else { bars = sl(I.hist); series = [[sl(I.dif), "ik"], [sl(I.dea), "id"]]; const v = [...sl(I.dif), ...sl(I.dea), ...bars]; lo = Math.min(...v); hi = Math.max(...v); guides = [0]; label(p, "MACD(12,26,9)"); }
        const span2 = hi - lo || 1, Y = v => top + 4 + (p.h - 8) * (hi - v) / span2;
        guides.forEach(v => { add("line", { x1: PL, x2: W - PR, y1: Y(v), y2: Y(v) }, "gridl"); add("text", { x: W - PR + 6, y: Y(v) + 4 }).textContent = String(v); });
        if (bars) bars.forEach((v, i) => add("rect", { x: X(i) - bw / 2, y: Math.min(Y(v), Y(0)), width: bw, height: Math.max(1, Math.abs(Y(v) - Y(0))) }, (v >= 0 ? "tk-up" : "tk-down") + " volbar"));
        series.forEach(([a, c]) => line(a, Y, c));
      }
    });
    [0, Math.floor((N - 1) / 2), N - 1].forEach((i, k) => add("text", { x: X(i), y: H - 1, "text-anchor": k === 0 ? "start" : k === 2 ? "end" : "middle" }, "xlabel").textContent = shortDay(cs[i][0]));
    const clip = add("clipPath", { id: "kclip" }); add("rect", { x: PL, y: panes[0].y, width: W - PL - PR, height: panes[0].h }, "", clip);
    const tg = add("g", { "clip-path": "url(#kclip)" }, "tlines");
    const band = add("rect", { x: 0, y: 8, width: 6, height: H - 22, rx: 3 }, "kband"); band.style.opacity = 0;
    const cross = add("line", { x1: 0, x2: 0, y1: 8, y2: H - 14 }, "cross"); cross.style.opacity = 0;
    const PP = panes[0], hline = add("line", { x1: PL, x2: W - PR, y1: 0, y2: 0 }, "cross hl"), dot = add("circle", { r: 3.5, cx: 0, cy: 0 }, "kdot");
    const ytag = add("g", {}, "ytag"), ytr = add("rect", { x: W - PR + 1, y: -9, width: PR - 2, height: 18, rx: 4 }, "", ytag), ytt = add("text", { x: W - PR + 6, y: 4 }, "", ytag);
    const xtag = add("g", {}, "ytag xtag"), xtr = add("rect", { x: -42, y: H - 17, width: 84, height: 16, rx: 4 }, "", xtag), xtt = add("text", { x: 0, y: H - 5, "text-anchor": "middle" }, "", xtag);
    const ring = add("circle", { r: 8, cx: 0, cy: 0 }, "kring");
    [hline, dot, ytag].forEach(e => { e.style.opacity = 0; });
    const at = i => {
      const j = off + i, c = cs[i], d = dig(c[4]), v = x => (x == null ? "—" : fmt(x, d));
      return `${slash(c[0])}　開 ${fmt(c[1], d)}　高 ${fmt(c[2], d)}　低 ${fmt(c[3], d)}　收 ${fmt(c[4], d)}　量 ${fmt(c[5])} 張` +
        (IND.ma ? `　MA5 ${v(I.ma5[j])}　MA20 ${v(I.ma20[j])}　MA60 ${v(I.ma60[j])}` : "") +
        (IND.kd ? `　K ${fmt(I.K[j], 1)}　D ${fmt(I.D[j], 1)}` : "") + (IND.rsi && I.rsi[j] != null ? `　RSI ${fmt(I.rsi[j], 1)}` : "") +
        (IND.macd ? `　DIF ${fmt(I.dif[j], 2)}　MACD ${fmt(I.dea[j], 2)}` : "");
    };
    const hit = e => { const r = svg.getBoundingClientRect(); return clamp(Math.round(((e.clientX - r.left) / r.width * W - PL) / (W - PL - PR) * N - 0.5), 0, N - 1); };
    return { svg, N, off, cs, all, tg, plotFrac: (W - PL - PR) / W, read: at, hit,
      plot: { x0: PL, x1: W - PR, y0: PP.y, y1: PP.y + PP.h },
      xOf: ai => X(ai - off), yOf: v => PP.Y(v),
      /* the pointer in chart terms: which bar (fractional, counted over the whole history) and which price */
      at(e) {
        const r = svg.getBoundingClientRect(), sx = (e.clientX - r.left) / r.width * W, sy = (e.clientY - r.top) / r.height * H;
        return { ai: off + ((sx - PL) / (W - PL - PR) * N - 0.5), price: PP.a - (PP.a - PP.b) * (sy - PP.y) / PP.h, inPrice: sy >= PP.y && sy <= PP.y + PP.h };
      },
      mark(i, e) {
        const bw = Math.max(3, (W - PL - PR) / N * 0.9);
        band.setAttribute("x", (X(i) - bw / 2).toFixed(1)); band.setAttribute("width", bw.toFixed(1)); band.style.opacity = 1;
        { const tx = clamp(X(i), PL + 42, W - PR - 42); xtag.setAttribute("transform", `translate(${tx.toFixed(1)} 0)`); xtt.textContent = slash(cs[i][0]); xtag.style.opacity = 1; }
        cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.style.opacity = 1;
        dot.setAttribute("cx", X(i)); dot.setAttribute("cy", PP.Y(cs[i][4])); dot.setAttribute("class", "kdot " + (cs[i][4] >= cs[i][1] ? "up" : "down")); dot.style.opacity = 1;
        ring.setAttribute("cx", X(i)); ring.setAttribute("cy", PP.Y(cs[i][4])); ring.setAttribute("class", "kring " + (cs[i][4] >= cs[i][1] ? "up" : "down")); ring.style.opacity = 1;
        const r = svg.getBoundingClientRect(), sy = e && r.height ? (e.clientY - r.top) / r.height * H : -1;
        if (sy >= PP.y && sy <= PP.y + PP.h) {
          /* magnet: near the bar's close, the line and its tag snap onto the close */
          const cy = PP.Y(cs[i][4]), snap = Math.abs(sy - cy) < 9, ly = snap ? cy : sy, v = snap ? cs[i][4] : PP.a - (PP.a - PP.b) * (sy - PP.y) / PP.h;
          hline.setAttribute("y1", ly); hline.setAttribute("y2", ly); hline.style.opacity = 1; hline.classList.toggle("snap", snap);
          ytag.setAttribute("transform", `translate(0 ${ly.toFixed(1)})`); ytt.textContent = fmt(v, dig(v)); ytag.style.opacity = 1;
        } else { hline.style.opacity = 0; ytag.style.opacity = 0; }
      },
      unmark() { [band, cross, hline, dot, ytag, xtag, ring].forEach(x => { x.style.opacity = 0; }); } };
  }

  /* the floating reading next to the pointer: date, OHLC, change against the day before, volume */
  const ktip = document.createElement("div"); ktip.className = "ktip"; ktip.hidden = true;
  function showTip(c, i, e, host) {
    const b = c.cs[i], prev = i > 0 ? c.cs[i - 1][4] : (c.off > 0 ? null : null), d = dig(b[4]);
    const ch = prev ? (b[4] / prev - 1) * 100 : NaN, t = tone(b[4] - (prev || b[1]));
    ktip.innerHTML = `<b>${slash(b[0])}</b><div><span>開</span><em>${fmt(b[1], d)}</em><span>高</span><em>${fmt(b[2], d)}</em><span>低</span><em>${fmt(b[3], d)}</em><span>收</span><em class="${t}">${fmt(b[4], d)}</em></div><p><i class="${tone(ch)}">${ok(ch) ? pct(ch) : ""}</i>　量 ${fmt(b[5])} 張</p>`;
    ktip.hidden = false;
    const r = host.getBoundingClientRect(), x = e.clientX - r.left + host.scrollLeft, y = e.clientY - r.top, w = ktip.offsetWidth || 180;
    ktip.style.transform = `translate(${Math.round(Math.max(host.scrollLeft + 4, x + 16 + w > r.width + host.scrollLeft ? x - w - 16 : x + 16))}px, ${Math.round(clamp(y - 30, 4, r.height - 90))}px)`;
  }
  function chartInput(cb, box) {
    const read = () => $(".cread", box);
    const idle = () => { const c = KV.c; if (!c) return; read().textContent = c.read(c.N - 1); c.unmark(); ktip.hidden = true; };
    const hover = e => { const c = KV.c; if (!c) return; const i = c.hit(e); c.mark(i, e); read().textContent = c.read(i); showTip(c, i, e, cb); };
    cb.addEventListener("pointerdown", e => {
      if (!KV.c || e.button > 0) return;
      if (KV.draw) {
        const a = KV.c.at(e); if (!a.inPrice) return;
        e.preventDefault(); try { cb.setPointerCapture(e.pointerId); } catch (er) {}
        KV.pen = { a, x: e.clientX, y: e.clientY, g: null }; return;
      }
      KV.drag = { x: e.clientX, end: KV.end, moved: false, id: e.pointerId }; hover(e);
    });
    cb.addEventListener("pointermove", e => {
      const c = KV.c, d = KV.drag; if (!c) return;
      if (KV.pen) {
        const p = KV.pen, b = c.at(e);
        if (p.g) p.g.remove();
        p.g = lineEls(c, c.xOf(p.a.ai), c.yOf(p.a.price), c.xOf(b.ai), c.yOf(b.price), "pen");
        hover(e); return;
      }
      if (d) {
        if (!d.moved && Math.abs(e.clientX - d.x) > 5) { d.moved = true; cb.classList.add("panning"); try { cb.setPointerCapture(d.id); } catch (er) {} }
        if (d.moved) {
          const per = c.svg.getBoundingClientRect().width * c.plotFrac / c.N, ne = clamp(d.end + Math.round((e.clientX - d.x) / per), 0, Math.max(0, KV.len - KV.span));
          if (ne !== KV.end) { KV.end = ne; drawChart(false, true); }
        }
      }
      hover(e);
    });
    const up = e => {
      if (KV.pen) {
        const p = KV.pen, c = KV.c; KV.pen = null;
        if (p.g) p.g.remove();
        if (c && e && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) {
          const b = c.at(e), i1 = clamp(Math.round(p.a.ai), 0, c.all.length - 1), i2 = clamp(Math.round(b.ai), 0, c.all.length - 1);
          if (i1 !== i2) {
            const [x, y] = i1 < i2 ? [[i1, p.a.price], [i2, b.price]] : [[i2, b.price], [i1, p.a.price]], r2 = v => Math.round(v * 100) / 100;
            store.set(linesKey(), [...(store.get(linesKey(), []) || []), { d1: c.all[x[0]][0], p1: r2(x[1]), d2: c.all[y[0]][0], p2: r2(y[1]) }].slice(-12));
          }
        }
        drawChart(false); return;
      }
      if (KV.drag && KV.drag.moved) { cb.classList.remove("panning"); drawChart(false); } KV.drag = null;
    };
    cb.addEventListener("pointerup", up); cb.addEventListener("pointercancel", up);
    cb.addEventListener("pointerleave", () => { if (!KV.drag) idle(); });
    cb.addEventListener("wheel", e => {
      const c = KV.c; if (!c || !e.deltaY || KV.len < 21) return;
      e.preventDefault();
      const ns = clamp(Math.round(KV.span * (e.deltaY > 0 ? 1.18 : 1 / 1.18)), 20, KV.len); if (ns === KV.span) return;
      const i = c.hit(e), ai = c.off + i, frac = (i + 0.5) / c.N, nOff = Math.round(ai + 0.5 - frac * ns);   /* the day under the pointer stays under it */
      KV.span = ns; KV.end = clamp(KV.len - ns - nOff, 0, KV.len - ns);
      drawChart(false, true); hover(e);
      clearTimeout(cb._wt); cb._wt = setTimeout(() => drawChart(false), 250);
    }, { passive: false });
    cb.addEventListener("dblclick", () => { KV.span = SPAN; KV.end = 0; drawChart(true); });
  }

  /* ---------------- 個股分析 ---------------- */
  const INDS = [["ma", "均線"], ["boll", "布林通道"], ["vol", "成交量"], ["kd", "KD"], ["macd", "MACD"], ["rsi", "RSI"]];
  function buildStock() {
    $("#dpStock").innerHTML = `
      <div class="dcard sbar"><div class="sfind"><button type="button" class="sback" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg><span></span></button><input class="ssearch" type="search" placeholder="輸入代號或名稱換一檔" aria-label="搜尋股票" autocomplete="off"><div class="ssug" hidden></div></div></div>
      <div class="dcard shead"><i class="sglow" aria-hidden="true"></i>
        <div class="stitle"><h2></h2></div>
        <p class="sflagline" hidden></p>
        <div class="spx"><span class="big">—</span><span class="schg"></span><span class="sub stime"></span></div>
        <div class="sohlc"></div>
        <div class="srange"></div>
      </div>
      <div class="scol">
      <div class="dcard schart">
        <div class="chips"><span class="clab">區間</span>${[[60, "60 日"], [120, "120 日"]].map(([n, t]) => `<button type="button" class="chip" data-span="${n}">${t}</button>`).join("")}
          <span class="clab">指標</span>${INDS.map(([k, t]) => `<button type="button" class="chip" data-ind="${k}">${t}</button>`).join("")}
          <span class="clab">畫線</span><button type="button" class="chip" data-draw aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19L20 5"/><circle cx="4" cy="19" r="2"/><circle cx="20" cy="5" r="2"/></svg>趨勢線</button><button type="button" class="chip" data-clrline hidden>清除</button></div>
        <div class="cbox"><p class="mempty">載入中…</p></div>
        <p class="sub cread"></p>
        <div class="cfoot"><p class="sub clegend">紅漲綠跌；均線：<i class="lg ma5"></i>MA5 <i class="lg ma20"></i>MA20 <i class="lg ma60"></i>MA60</p><p class="sub chint"><span class="czoom"></span>拖曳平移・滾輪縮放・雙擊還原</p></div>
      </div>
      <div class="dcard sai">
        <div class="aihead"><div><h3>分析團隊</h3></div>
          <button type="button" class="aigo">開始分析</button></div>
        <p class="sub aimsg"></p><div class="aiout"></div>
        
        <details class="slab"><summary>研究工具（自動送出）</summary><div id="dpLab" class="on"></div></details>
      </div>
      <div class="dcard sask">
        <div class="aihead"><div><h3>提問</h3></div></div>
        <div class="askchips">${["最近為什麼漲／跌？", "現在適合進場嗎？", "法人在買還是在賣？", "最大的風險是什麼？"].map(q => `<button type="button" class="chip" data-q="${q}">${q}</button>`).join("")}</div>
        <form class="askform"><input class="askin" type="text" maxlength="200" placeholder="問這檔股票任何問題" autocomplete="off" aria-label="提問"><button type="submit" class="aigo">問</button></form>
        <div class="askout"></div>
      </div>
      <div class="dcard sx smg"><div class="aihead"><div><h3>融資融券</h3></div><span class="sub sxn"></span></div><div class="sxout"><p class="sub">載入中…</p></div></div>
      <div class="dcard sx shd"><div class="aihead"><div><h3>股權分散</h3></div><span class="sub sxn"></span></div><div class="sxout"><p class="sub">載入中…</p></div></div>
      <div class="dcard sx spe"><div class="aihead"><div><h3>本益比河流圖</h3></div><span class="sub sxn"></span></div><div class="sxout"><p class="sub">載入中…</p></div></div>
      <div class="dcard sx sfin"><div class="aihead"><div><h3>財報速覽</h3></div><span class="sub sxn"></span></div><div class="sxout"><p class="sub">載入中…</p></div></div>
      <div class="dcard sx sinst"><div class="aihead"><div><h3>三大法人買賣超</h3></div><span class="sub sxn"></span></div><div class="sxout"><p class="sub">載入中…</p></div></div>
      </div>
      <div class="sgrid">
        <div class="dcard ssnap"><h3>技術面快照</h3><div class="snaplist"><p class="sub">載入中…</p></div></div>
        <div class="dcard sfund"><h3>基本面與籌碼</h3><div class="fundlist"><p class="sub">載入中…</p></div></div>
        <div class="dcard snews"><h3>新聞與公告</h3><div class="newslist"><p class="sub">載入中…</p></div></div>
      </div>`;
    const box = $("#dpStock"), inp = $(".ssearch", box), sug = $(".ssug", box);
    chartInput($(".cbox", box), box);
    inp.addEventListener("input", () => {
      const q = inp.value.trim().toLowerCase();
      const hits = q ? DB.list.filter(s => s.code.toLowerCase().startsWith(q) || s.name.toLowerCase().includes(q)).slice(0, 8) : [];
      sug.hidden = !hits.length;
      sug.innerHTML = hits.map(s => `<button type="button" data-code="${esc(s.code)}"><b>${esc(s.name)}</b><span>${esc(s.code)}</span><em class="${tone(s.chg)}">${fmt(s.price, dig(s.price))}</em></button>`).join("");
    });
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { const b = $("button", sug); if (b) b.click(); } });
    $(".askform", box).addEventListener("submit", e => { e.preventDefault(); askRun($(".askin", box).value); });
    $(".askchips", box).addEventListener("click", e => { const c = e.target.closest("[data-q]"); if (c) askRun(c.dataset.q); });
    box.addEventListener("click", e => {
      if (e.target.closest("#dpLab")) return;                 /* the research tools handle their own clicks */
      const s = e.target.closest(".ssug button"); if (s) { inp.value = ""; sug.hidden = true; setStock(s.dataset.code, true); navPush(); return; }
      if (e.target.closest(".sback")) { goBack(); return; }
      const sp = e.target.closest("[data-span]"); if (sp) { SPAN = +sp.dataset.span; KV.span = SPAN; KV.end = 0; store.set("twmain-span", SPAN); KV.morph = true; drawChart(false); return; }
      if (e.target.closest("[data-draw]")) { KV.draw = !KV.draw; drawChart(false); return; }
      if (e.target.closest("[data-clrline]")) { store.set(linesKey(), []); drawChart(false); return; }
      const ind = e.target.closest("[data-ind]"); if (ind) { IND[ind.dataset.ind] = !IND[ind.dataset.ind]; store.set("twmain-ind", IND); drawChart(true); return; }
      if (e.target.closest(".aigo")) analyze();
    });
  }
  const HEADLAST = { code: "", px: NaN };
  function paintHead() {
    const box = $("#dpStock"), s = DB.by.get(CODE); if (!$(".shead", box)) return;
    $(".stitle h2", box).innerHTML = s ? `${esc(s.name)} <span>${esc(s.code)}</span>${flagTag(s.code)}` : esc(CODE);
    const fl = FLAGS.get(CODE), fe = $(".sflagline", box);
    fe.hidden = !fl; fe.className = "sflagline" + (fl ? " " + fl.k : "");
    fe.textContent = fl ? (fl.k === "punish" ? `處置股：${fl.info}。交易受限制，下單前先確認撮合方式與是否要預收款券。` : `注意股：${fl.info}。`) : "";
    if (!s) { $(".spx .big", box).textContent = "—"; $(".schg", box).textContent = DB.list.length ? "找不到這檔上市股票" : ""; $(".sohlc", box).innerHTML = ""; return; }
    if (s.rtWait) { $(".spx .big", box).textContent = "—"; $(".spx .big", box).className = "big"; $(".schg", box).textContent = "讀取即時報價…"; $(".schg", box).className = "schg"; $(".stime", box).textContent = ""; $(".sohlc", box).innerHTML = ""; return; }
    const d = dig(s.price), t = tone(s.chg), sh = $(".shead", box);
    sh.dataset.tone = t || "flat"; sh.dataset.lim = s.pct >= 9.4 ? "up" : s.pct <= -9.4 ? "down" : ""; sh.classList.toggle("live", !!s.rt);
    if (HEADLAST.code === CODE && ok(HEADLAST.px) && s.price !== HEADLAST.px) { const g = $(".sglow", sh); g.classList.remove("hit"); void g.offsetWidth; g.classList.add("hit"); }
    HEADLAST.code = CODE; HEADLAST.px = s.price;
    $(".spx .big", box).textContent = fmt(s.price, d); $(".spx .big", box).className = "big " + t;
    $(".schg", box).textContent = `${arrow(s.chg)} ${fmt(Math.abs(s.chg), d)}（${pct(s.pct)}）`; $(".schg", box).className = "schg " + t;
    $(".stime", box).textContent = s.rt ? `盤中 ${s.tm || ""}` : DB.live ? `收盤 ${slash(DB.date)}` : "讀不到資料";
    $(".sohlc", box).innerHTML = [["開", fmt(s.open, d)], ["高", fmt(s.high, d)], ["低", fmt(s.low, d)], ["昨收", fmt(s.prev, d)], ["量（張）", fmt(s.vol)]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
    /* the empty lower left: where the price sits in today's range, the 52-week range and the ±10% limit band */
    (() => {
      const rg = $(".srange", box), rec = HIST.get(CODE), yr = rec && rec.cs ? rec.cs.slice(-250) : [], P = s.price;
      const rows = [["今日", s.low, s.high], ["52 週", yr.length > 20 ? Math.min(...yr.map(b => b[3]).filter(v => v > 0), s.low > 0 ? s.low : Infinity) : NaN, yr.length > 20 ? Math.max(...yr.map(b => b[2]), s.high > 0 ? s.high : 0) : NaN], ["漲跌停", ok(s.prev) ? Math.round(s.prev * 0.9 * 100) / 100 : NaN, ok(s.prev) ? Math.round(s.prev * 1.1 * 100) / 100 : NaN]].filter(r => ok(r[1]) && ok(r[2]) && r[2] > r[1] && ok(P));
      const html = rows.map(([k, lo, hi]) => { const f = Math.max(0, Math.min(1, (P - lo) / (hi - lo))); return `<div class="srr"><span class="srk">${k}</span><span class="srl">${fmt(lo, d)}</span><span class="srb"><i style="width:${(f * 100).toFixed(1)}%"></i><b style="left:${(f * 100).toFixed(1)}%"></b></span><span class="srl">${fmt(hi, d)}</span></div>`; }).join("");
      if (rg.dataset.h !== html) { const first = !rg.dataset.h; rg.dataset.h = html; rg.innerHTML = html; if (first) $$(".srb i", rg).forEach((el, k) => el.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 700, delay: k * 90, easing: "cubic-bezier(.215,.61,.355,1)" })); }
      rg.dataset.tone = t;
    })();
  }
  /* today's bar from the live quote is added to the history, or replaces today's bar */
  function barsOf(code) {
    const rec = HIST.get(code), s = DB.by.get(code); if (!rec) return null;
    const cs = rec.cs.slice();
    if (s && s.rt && s.day && s.open > 0) {
      const bar = [s.day, s.open, s.high, s.low, s.price, s.vol], last = cs[cs.length - 1];
      if (last && last[0] === s.day) cs[cs.length - 1] = bar; else if (last && last[0] < s.day) cs.push(bar);
    }
    return cs;
  }
  let chartTok = 0;
  /* the chart's window: how many days (span) and how far back from the latest (end); dragged, zoomed with the wheel, double-click resets */
  const KV = { span: SPAN, end: 0, code: null, c: null, len: 0, drag: null, draw: false, pen: null };
  const linesKey = () => "twlines:" + CODE;
  const NSL = (tag, attrs, cls, parent) => { const e = document.createElementNS(NS, tag); for (const a in attrs) e.setAttribute(a, attrs[a]); if (cls) e.setAttribute("class", cls); parent.appendChild(e); return e; };
  /* one trend line: the drawn part solid, carried on to the right edge dashed (where the trend would be now) */
  function lineEls(c, x1, y1, x2, y2, cls) {
    const g = NSL("g", {}, "tl " + (cls || ""), c.tg);
    NSL("line", { x1, y1, x2, y2 }, "tl-s", g);
    if (Math.abs(x2 - x1) > 0.5) { const xr = c.plot.x1, yr = y2 + (y2 - y1) / (x2 - x1) * (xr - x2); if (x2 < xr) NSL("line", { x1: x2, y1: y2, x2: xr, y2: yr }, "tl-x", g); }
    [[x1, y1], [x2, y2]].forEach(([x, y]) => NSL("circle", { cx: x, cy: y, r: 3 }, "tl-p", g));
    return g;
  }
  function paintLines(c) {
    const L = store.get(linesKey(), []) || [], ix = new Map(c.all.map((b, i) => [b[0], i]));
    L.forEach(l => { const a = ix.get(l.d1), b = ix.get(l.d2); if (a == null || b == null) return; const up = l.p2 >= l.p1; lineEls(c, c.xOf(a), c.yOf(l.p1), c.xOf(b), c.yOf(l.p2), up ? "rise" : "fall"); });
    const box = $("#dpStock"), clr = $("[data-clrline]", box);
    if (clr) { clr.hidden = !L.length; clr.textContent = `清除 ${L.length} 條`; }
    $$("[data-draw]", box).forEach(b => b.setAttribute("aria-pressed", String(KV.draw)));
    $(".cbox", box).classList.toggle("drawing", KV.draw);
  }
  function drawChart(animate, quick) {
    const box = $("#dpStock"), host = $(".cbox", box), read = $(".cread", box), cs = barsOf(CODE);
    if (KV.code !== CODE) { KV.code = CODE; KV.span = SPAN; KV.end = 0; }
    { const sb = $$("[data-span]", box), near = sb.reduce((m, b) => (Math.abs(+b.dataset.span - KV.span) < Math.abs(+m.dataset.span - KV.span) ? b : m), sb[0]); sb.forEach(b => b.setAttribute("aria-pressed", String(b === near))); }
    $$("[data-ind]", box).forEach(b => b.setAttribute("aria-pressed", String(!!IND[b.dataset.ind])));
    $(".clegend", box).hidden = !IND.ma;
    if (!cs) return;
    KV.len = cs.length; KV.span = clamp(KV.span, Math.min(20, cs.length), cs.length); KV.end = clamp(KV.end, 0, Math.max(0, cs.length - KV.span));
    const oldC = KV.c, oldSvg = KV.morph && oldC && $("svg.kchart", host) || (KV.morph && oldC && oldC.svg) || null;
    const oldBox = oldSvg && oldSvg.getBoundingClientRect(), hostBox = host.getBoundingClientRect();
    KV.w = chartW(host);
    const c = chartSVG(cs, KV.span, KV.end, KV.w); KV.c = c;
    if (!host.dataset.ro && window.ResizeObserver) {
      /* turning the phone or resizing the window (or showing a page drawn while hidden): draw again at the new width */
      host.dataset.ro = "1";
      new ResizeObserver(() => { if (KV.c && host.clientWidth && Math.abs(chartW(host) - KV.w) > 24) drawChart(false); }).observe(host);
    }
    host.replaceChildren(c.svg, ktip);
    /* a new range: the old drawing squeezes (or stretches) toward the latest day while it fades, the new one settles in from the opposite scale */
    if (KV.morph) {
      KV.morph = false;
      if (oldSvg && oldBox && oldBox.width && oldC.N !== c.N && box.classList.contains("on") && oldSvg !== c.svg) {
        const k = c.N / oldC.N, org = "93% 50%";
        oldSvg.style.cssText = `position:absolute;left:${(oldBox.left - hostBox.left + host.scrollLeft).toFixed(1)}px;top:${(oldBox.top - hostBox.top).toFixed(1)}px;width:${oldBox.width.toFixed(1)}px;height:${oldBox.height.toFixed(1)}px;pointer-events:none;transform-origin:${org}`;
        host.appendChild(oldSvg);
        oldSvg.animate([{ transform: "none", opacity: 1, filter: "none" }, { transform: `scaleX(${(1 / k).toFixed(3)})`, opacity: 0, filter: "blur(3px)" }], { duration: 480, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" }).onfinish = () => oldSvg.remove();
        c.svg.style.transformOrigin = org;
        c.svg.animate([{ transform: `scaleX(${k.toFixed(3)})`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 560, easing: "cubic-bezier(.16,1,.3,1)" });
      }
    }
    paintLines(c);
    document.dispatchEvent(new Event("twdash:chart"));
    const zl = $(".czoom", box); if (zl) zl.textContent = `${c.N} 日${KV.end ? `・往前 ${KV.end} 日` : ""}`;
    if (quick) return;
    read.textContent = c.read(c.N - 1); c.unmark(); ktip.hidden = true;
    /* the drawing is revealed from the left as one layer (cheap on a tablet), oldest day first */
    if (animate && box.classList.contains("on")) c.svg.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: 700, easing: "cubic-bezier(.3,.7,.3,1)" });
    paintSnap(cs);
  }
  /* what the numbers say, in plain rules; the same figures are handed to the AI team */
  function facts(cs) {
    const I = calc(cs), n = cs.length, i = n - 1, last = cs[i], s = DB.by.get(CODE) || {};
    const hi = k => Math.max(...cs.slice(-k).map(c => c[2])), lo = k => Math.min(...cs.slice(-k).map(c => c[3]));
    const ret = k => (n > k ? (last[4] / cs[i - k][4] - 1) * 100 : NaN), r2 = v => (v == null || !ok(v) ? null : Math.round(v * 100) / 100);
    const cross = I.K[i] > I.D[i] && I.K[i - 3] <= I.D[i - 3] ? "golden" : I.K[i] < I.D[i] && I.K[i - 3] >= I.D[i - 3] ? "dead" : "none";
    const f = FUND.map && FUND.map.get(CODE), ch = CHIP.map && CHIP.map.get(CODE);
    return {
      date: last[0], dataKind: s.rt ? "intraday" : DB.live ? "close" : "sample", close: r2(last[4]), changePct: r2(s.pct), open: r2(last[1]), high: r2(last[2]), low: r2(last[3]), volumeLots: last[5],
      ma5: r2(I.ma5[i]), ma20: r2(I.ma20[i]), ma60: r2(I.ma60[i]), bollUpper: r2(I.bu[i]), bollLower: r2(I.bl[i]),
      K: r2(I.K[i]), D: r2(I.D[i]), kdCross3d: cross, rsi14: r2(I.rsi[i]), macdDif: r2(I.dif[i]), macdSignal: r2(I.dea[i]), macdHist: r2(I.hist[i]), macdHistPrev: r2(I.hist[i - 1]),
      volumeVs20dAvg: I.vma20[i] ? r2(last[5] / I.vma20[i]) : null, high20: r2(hi(20)), low20: r2(lo(20)), high60: n >= 60 ? r2(hi(60)) : null, low60: n >= 60 ? r2(lo(60)) : null,
      return5dPct: r2(ret(5)), return20dPct: r2(ret(20)), return60dPct: r2(ret(60)), bars: n,
      last10Closes: cs.slice(-10).map(c => r2(c[4])),
      fundamentals: f ? { pe: r2(f.pe), dividendYieldPct: r2(f.yld), pb: r2(f.pb), monthlyRevenueYi: r2(f.rev), revenueYoYPct: r2(f.yoy), revenueMonth: f.ym || null } : null,
      institutionsLots: ch ? { date: CHIP.date, foreign: Math.round(ch.f), trust: Math.round(ch.t), dealers: ok(ch.d) ? Math.round(ch.d) : null, total: Math.round(ch.a) } : null,
      market: { taiex: r2(IDX[0].z), taiexChangePct: ok(IDX[0].z) && ok(IDX[0].y) ? r2((IDX[0].z / IDX[0].y - 1) * 100) : null,
        foreignYi: MKT.inst ? r2(MKT.inst.f) : null, trustYi: MKT.inst ? r2(MKT.inst.t) : null, dealersYi: MKT.inst ? r2(MKT.inst.d) : null },
    };
  }
  function paintSnap(cs) {
    const el = $("#dpStock .snaplist"); if (!el) return;
    if (cs.length < 30) { el.innerHTML = `<p class="sub">歷史資料不足 30 日，暫不判讀。</p>`; return; }
    const F = facts(cs), d = dig(F.close), v = x => (x == null ? "—" : fmt(x, d)), rows = [];
    const row = (k, text, t) => rows.push(`<div class="snap"><span>${k}</span><b class="${t || ""}">${text}</b></div>`);
    const above20 = F.ma20 != null && F.close >= F.ma20, above60 = F.ma60 != null && F.close >= F.ma60;
    row("趨勢", F.ma60 == null ? (above20 ? "站上月線（MA20）" : "在月線（MA20）之下") : F.ma5 > F.ma20 && F.ma20 > F.ma60 ? "多頭排列（MA5 > MA20 > MA60）" : F.ma5 < F.ma20 && F.ma20 < F.ma60 ? "空頭排列（MA5 < MA20 < MA60）" : `均線糾結，${above20 ? "站上" : "跌破"}月線、${above60 ? "站上" : "跌破"}季線`,
      F.ma60 == null ? (above20 ? "up" : "down") : F.ma5 > F.ma20 && F.ma20 > F.ma60 ? "up" : F.ma5 < F.ma20 && F.ma20 < F.ma60 ? "down" : "");
    row("KD", `K ${fmt(F.K, 1)} / D ${fmt(F.D, 1)}` + (F.kdCross3d === "golden" ? "，近 3 日黃金交叉" : F.kdCross3d === "dead" ? "，近 3 日死亡交叉" : "") + (F.K > 80 ? "，高檔區" : F.K < 20 ? "，低檔區" : ""), F.kdCross3d === "golden" ? "up" : F.kdCross3d === "dead" ? "down" : "");
    if (F.rsi14 != null) row("RSI(14)", fmt(F.rsi14, 1) + (F.rsi14 >= 70 ? "，偏熱" : F.rsi14 <= 30 ? "，偏冷" : "，中性"), "");
    row("MACD", `柱狀 ${signed(F.macdHist, 2)}，${F.macdHist > F.macdHistPrev ? "動能增強" : "動能減弱"}`, F.macdHist > 0 ? "up" : "down");
    if (F.bollUpper != null) row("布林位置", `${fmt(clamp((F.close - F.bollLower) / (F.bollUpper - F.bollLower) * 100, 0, 100), 0)}%（0 下軌，100 上軌）`, "");
    if (F.volumeVs20dAvg != null) row("量能", `今日量為 20 日均量的 ${fmt(F.volumeVs20dAvg, 2)} 倍`, "");
    const sup = [["MA20", F.ma20], ["MA60", F.ma60], ["20 日低點", F.low20], ["布林下軌", F.bollLower]].filter(x => x[1] != null && x[1] < F.close).sort((a, b) => b[1] - a[1]).slice(0, 2);
    const res = [["MA20", F.ma20], ["MA60", F.ma60], ["20 日高點", F.high20], ["60 日高點", F.high60], ["布林上軌", F.bollUpper]].filter(x => x[1] != null && x[1] > F.close).sort((a, b) => a[1] - b[1]).slice(0, 2);
    row("支撐", sup.length ? sup.map(x => `${v(x[1])}（${x[0]}）`).join("、") : "下方近期沒有明確支撐", "");
    row("壓力", res.length ? res.map(x => `${v(x[1])}（${x[0]}）`).join("、") : "已在近 60 日高點附近", "");
    row("報酬", [[5, F.return5dPct], [20, F.return20dPct], [60, F.return60dPct]].filter(([d, v]) => d < 60 || ok(v)).map(([d, v]) => `<span class="nw">${d} 日 ${pct(v)}</span>`).join("　"), "");
    el.innerHTML = rows.join("");
  }
  function paintFund() {
    const el = $("#dpStock .fundlist"); if (!el) return;
    if (!DB.live) { el.innerHTML = `<p class="sub">讀不到資料。</p>`; return; }
    const f = FUND.map && FUND.map.get(CODE), ch = CHIP.map && CHIP.map.get(CODE), rows = [];
    const row = (k, val, t) => rows.push(`<div class="snap"><span>${k}</span><b class="${t || ""}">${val}</b></div>`);
    const lots = x => (ok(x) ? signed(Math.round(x), 0) + " 張" : "—");
    row("本益比", f && ok(f.pe) ? fmt(f.pe, 2) : "—"); row("殖利率", f && ok(f.yld) ? fmt(f.yld, 2) + "%" : "—"); row("股價淨值比", f && ok(f.pb) ? fmt(f.pb, 2) : "—");
    row("月營收（億）" + (f && f.ym ? " " + f.ym : ""), f && ok(f.rev) ? fmt(f.rev, 1) : "—"); row("營收年增率", f && ok(f.yoy) ? pct(f.yoy) : "—", f ? tone(f.yoy) : "");
    row("外資買賣超" + (CHIP.date ? " " + shortDay(CHIP.date) : ""), ch ? lots(ch.f) : "—", ch ? tone(ch.f) : ""); row("投信買賣超", ch ? lots(ch.t) : "—", ch ? tone(ch.t) : "");
    row("自營商買賣超", ch ? lots(ch.d) : "—", ch ? tone(ch.d) : ""); row("三大法人合計", ch ? lots(ch.a) : "—", ch ? tone(ch.a) : "");
    el.innerHTML = rows.join("");
  }
  const NEWS = new Map();
  const when = t => { if (!t) return ""; const d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate(); };
  const newsHTML = (news, ann) =>
    (ann && ann.length ? ann.map(a => `<div class="nrow"><span class="ntag">公告</span><span class="ntext">${esc(a.t)}</span><i>${esc(shortRoc(a.d))}</i></div>`).join("") : "") +
    (news && news.length ? news.map(x => `<a class="nrow" href="${esc(x.u)}" target="_blank" rel="noopener"><span class="ntext">${esc(x.t)}</span><i>${esc(x.src)} ${when(x.at)}</i></a>`).join("") : "");
  const shortRoc = d => { const s = ymd(d); return s ? shortDay(s) : String(d || ""); };
  async function loadNews(code) {
    const el = $("#dpStock .newslist"), s = DB.by.get(code); if (!el) return;
    if (NEWS.has(code)) { el.innerHTML = NEWS.get(code); return; }
    el.innerHTML = `<p class="sub">載入中…</p>`;
    try {
      const j = await J(`${WORKER}/tw/news?c=${encodeURIComponent(code)}&n=${encodeURIComponent(s ? s.name : "")}`);
      const real = newsHTML(j.news, j.ann), html = real || `<p class="sub">近一個月沒有找到相關新聞或公告。</p>`;
      if (real) NEWS.set(code, html);          /* an empty answer is not kept, so opening the stock again asks again */
      if (code === CODE) el.innerHTML = html;
    } catch (e) { if (code === CODE) el.innerHTML = `<p class="sub">新聞需要部署新版 Worker 後才會出現。</p>`; }
  }
  async function setStock(code, animate) {
    CODE = code; store.set("twmain-code", CODE);
    document.dispatchEvent(new CustomEvent("twdash:stock", { detail: code }));
    const box = $("#dpStock"), tok = ++chartTok;
    const qs = DB.by.get(code); if (qs && !qs.rt && DB.live && marketOpen()) qs.rtWait = true;
    paintHead(); quoteNow(code);
    KV.c = null; $(".cbox", box).innerHTML = `<p class="mempty">載入中…</p>`; $(".cread", box).textContent = "";
    try { store.set("twrecent", [code, ...(store.get("twrecent", []) || []).filter(c => c !== code)].slice(0, 8)); } catch (e) {}
    $(".snaplist", box).innerHTML = `<p class="sub">載入中…</p>`;
    paintAI();
    if (!DB.list.length) return;
    if (!DB.by.get(code)) { $(".cbox", box).innerHTML = `<p class="mempty">找不到這檔上市股票，請用上面的搜尋換一檔。</p>`; $(".snaplist", box).innerHTML = ""; return; }
    rtPoll();
    paintFund(); loadFund().then(() => { if (tok === chartTok) { paintFund(); } });
    loadChip().then(() => { if (tok === chartTok) paintFund(); });
    loadNews(code); stockExtras(code, tok);
    const cs = await loadHist(code, () => { if (tok === chartTok) drawChart(false); });
    if (tok !== chartTok) return;
    if (!cs) { $(".cbox", box).innerHTML = `<p class="mempty">這檔的歷史資料讀不到，請稍後再試。</p>`; $(".snaplist", box).innerHTML = `<p class="sub">沒有歷史資料。</p>`; return; }
    drawChart(animate !== false);
  }
  /* opening a stock from a row or a card: the header grows out of the thing that was tapped */
  /* browser back / forward: every tab and every stock opened is a history entry (#/dpList, #stock/2454).
     The slash matters: "#dpList" is also a panel id, so the browser would scroll the page to it after loading */
  let navLock = false;
  const navHash = () => (cur === "dpStock" ? "#stock/" + CODE : "#/" + (cur || "dpOverview"));
  function navPush() {
    if (navLock || !cur) return;
    const h = navHash(); if (location.hash === h) return;
    try { history[history.state && history.state.tw ? "pushState" : "replaceState"]({ tw: 1, p: cur, code: CODE }, "", h); } catch (e) {}
  }
  function navGo(h) {
    h = String(h || "").replace(/^#\/dp/, "#dp");   /* older bookmarks have no slash */
    const m = /^#stock\/([0-9A-Z]{4,6})$/.exec(h || ""), p = m ? "dpStock" : (h || "").slice(1).replace(/^dpWatch$/, "dpList").replace(/^dpMid$/, "dpPre");
    if (h === "#dpMid") anaSub("md", false);
    navLock = true;
    try {
      if (m) { if (CODE !== m[1] || !HIST.get(m[1])) setStock(m[1], true); open("dpStock", true); }
      else if (tabs.some(t => t.dataset.p === p)) open(p, true);
      else open("dpOverview", true);
    } finally { navLock = false; }
  }
  addEventListener("popstate", () => { const bk = BACK; navGo(location.hash); if (bk && cur === bk.tab) backTo(bk); });
  /* where a stock was opened from: the 返回 button (and the browser's back) returns there, at the same scroll position */
  let BACK = null;
  function showBack() {
    const b = $("#dpStock .sback"); if (!b) return;
    b.hidden = !BACK;
    if (BACK) { const t = tabs.find(x => x.dataset.p === BACK.tab); const name = t ? t.textContent.trim() : ""; $("span", b).textContent = "返回" + name; b.setAttribute("aria-label", "返回" + name); }
  }
  function backTo(bk) {
    requestAnimationFrame(() => {
      scrollTo({ top: bk.y, behavior: "instant" in window ? "instant" : "auto" });
      const row = document.querySelector(`#${bk.tab} [data-code="${CSS.escape(bk.code)}"], #${bk.tab} [data-pick="${CSS.escape(bk.code)}"]`);
      if (row && row.animate) row.animate([{ boxShadow: "inset 0 0 0 2px var(--color-accent)" }, { boxShadow: "inset 0 0 0 2px transparent" }], { duration: 1400, easing: "ease-out" });
      /* the way back: the row grows out of where the stock header was (the opening animation in reverse) */
      if (row && row.animate && bk.hb) { const r = row.getBoundingClientRect(); if (r.width > 0) row.animate([{ transformOrigin: "0 0", transform: `translate(${bk.hb.left - r.left}px,${bk.hb.top - r.top}px) scale(${bk.hb.width / r.width},${Math.min(3, bk.hb.height / r.height)})`, opacity: .4 }, { transformOrigin: "0 0", transform: "none", opacity: 1 }], { duration: 380, easing: "cubic-bezier(.3,.7,.2,1)" }); }
    });
  }
  function goBack() { const bk = BACK; if (!bk) return; const hd = $("#dpStock .shead"); if (hd) bk.hb = hd.getBoundingClientRect(); open(bk.tab, true); backTo(bk); }
  function openStock(code, from) {
    const a = from && from.getBoundingClientRect();
    if (cur && cur !== "dpStock") BACK = { tab: cur, y: scrollY, code };
    navLock = true; open("dpStock", true, true); navLock = false;
    setStock(code, true); navPush(); showBack();
    const head = $("#dpStock .shead");
    scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    if (a && head) {
      const b = head.getBoundingClientRect();
      head.animate([{ transformOrigin: "0 0", transform: `translate(${a.left - b.left}px,${a.top - b.top}px) scale(${a.width / b.width},${a.height / b.height})`, opacity: .5 }, { transformOrigin: "0 0", transform: "none", opacity: 1 }],
        { duration: 420, easing: "cubic-bezier(.3,.7,.2,1)" });
      rise(Array.from($("#dpStock").children).slice(1), 80, 180);
    }
  }



  /* the watchlist and the held codes (codes only, never shares or costs) go to the Worker, which watches them during trading hours */
  let alertTimer = 0;
  function alertSync() {
    clearTimeout(alertTimer);
    alertTimer = setTimeout(async () => {
      const el = $("#dpPre .pmalert");
      const hold = (store.get("twlab-hold", []) || []).map(h => h.code);
      let state = { ok: false };
      try {
        const opt = store.get("twalert-opt", {}) || {};
        const r = await fetch(WORKER + "/tw/alerts/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ d: DEVICE, watch: WATCH, hold, opt }) });
        const j = await r.json().catch(() => ({}));
        /* a Worker from before the switches answers without "opt": they are not applied yet */
        state = j.ok ? { ok: true, old: j.opt === undefined } : j.owner === false ? { ok: false, owner: false } : { ok: false };
        if (el) el.textContent = j.ok ? `盤中警示：監控大盤、台指期與 ${j.n} 檔股票，有大漲跌或重大消息會傳 Telegram。`
          : j.owner === false ? "盤中警示只監控擁有者裝置的股票。" : "盤中警示：同步失敗。";
      } catch (e) { if (el) el.textContent = "盤中警示：同步失敗。"; }
      document.dispatchEvent(new CustomEvent("twdash:alertsync", { detail: state }));
    }, 1500);
  }
  document.addEventListener("twlab:hold", alertSync);
  document.addEventListener("twalert:change", alertSync);



  /* the distribution's buckets (% change); also a filter for the stock list */
  const DIST = [["跌停", p => p <= -9.4, "down"], ["-9~-6", p => p > -9.4 && p <= -6, "down"], ["-6~-3", p => p > -6 && p <= -3, "down"], ["-3~0", p => p > -3 && p < 0, "down"], ["平", p => p === 0, ""],
      ["0~3", p => p > 0 && p < 3, "up"], ["3~6", p => p >= 3 && p < 6, "up"], ["6~9", p => p >= 6 && p < 9.4, "up"], ["漲停", p => p >= 9.4, "up"]];
  /* ---------------- overview board: distribution, movers, volume, watchlist heat map, pre-market summary ---------------- */
  let PMN = null, boardSig = "";
  function paintBoard() {
    const box = $("#dpOverview .board"); if (!box) return;
    if (!DB.list.length) { if (DB.failed) { const b = $(".bd-bars", box); if (b && !b.dataset.f) { b.dataset.f = "1"; b.innerHTML = `<p class="sub">讀不到資料。</p>`; $(".bd-n", box).textContent = ""; } } return; }
    const live = DB.list.filter(s => ok(s.price) && s.price > 0 && ok(s.pct)), liq = live.filter(s => s.vol >= 500 && s.mkt !== "esb");
    const sig = live.length + ":" + live.reduce((a, s) => a + s.pct, 0).toFixed(1) + ":" + (PMN ? PMN.at : 0) + ":" + WATCH.join();
    const first = !boardSig; if (sig === boardSig) return; boardSig = sig;
    /* distribution: ≤-9, -9..-6, -6..-3, -3..0, 0, 0..3, 3..6, 6..9, ≥9 */
    const B = DIST;
    const cnt = B.map(b => live.filter(s => b[1](s.pct)).length), mx = Math.max(1, ...cnt);
    $(".bd-n", box).textContent = `${fmt(live.length)} 檔`;
    $(".bd-bars", box).innerHTML = B.map((b, i) => `<button type="button" class="bd-col" data-dist="${i}" aria-label="漲跌幅 ${b[0]}：${cnt[i]} 檔，點一下在股票清單列出"><span class="bd-c">${fmt(cnt[i])}</span><i class="bd-b ${b[2]}" style="--h:${(cnt[i] / mx * 100).toFixed(1)}%"></i><span class="bd-l">${b[0]}</span></button>`).join("");
    const row = (s, v, t) => `<button type="button" class="bd-row" data-code="${esc(s.code)}"><span class="bd-nm"><b>${esc(s.name)}</b><i>${esc(s.code)}</i></span><span class="bd-px">${fmt(s.price, dig(s.price))}</span><span class="bd-v ${t}">${v}</span></button>`;
    const up = liq.slice().sort((a, b) => b.pct - a.pct).slice(0, 15), dn = liq.slice().sort((a, b) => a.pct - b.pct).slice(0, 15), vol = live.slice().sort((a, b) => b.vol - a.vol).slice(0, 8), vmx = vol.length ? vol[0].vol : 1;
    $(".bd-up .bd-list").innerHTML = up.map(s => row(s, pct(s.pct), "up")).join("");
    $(".bd-down .bd-list").innerHTML = dn.map(s => row(s, pct(s.pct), "down")).join("");
    ($(".bd-vol .bd-list", box) || {}).innerHTML = vol.map(s => `<button type="button" class="bd-row bd-vrow" data-code="${esc(s.code)}" style="--w:${(s.vol / vmx * 100).toFixed(1)}%"><span class="bd-nm"><b>${esc(s.name)}</b><i>${esc(s.code)}</i></span><span class="bd-px ${tone(s.chg)}">${pct(s.pct)}</span><span class="bd-v">${fmt(s.vol)}</span></button>`).join("");
    const a = PMN && PMN.analysis;
    ($(".bd-pmout", box) || {}).innerHTML = a ? `<div class="bd-call"><span class="aitag ${/高/.test(a.call) ? "up" : /低/.test(a.call) ? "down" : ""}">${esc(a.call)}</span><span class="sub">預測 ${esc(String(PMN.day).slice(5).replace("-", "/"))} 開盤・${esc(a.gap || "")}</span>${a.close && a.close.call ? `<span class="aitag ${/紅/.test(a.close.call) ? "up" : /黑/.test(a.close.call) ? "down" : ""}">${esc(a.close.call)}</span><span class="sub">收盤 ${esc(a.close.range || "")}</span>` : ""}</div><p class="bd-head">${esc(a.headline || "")}</p>
      ${Array.isArray(a.picks) && a.picks.length ? `<div class="bd-picks">${a.picks.slice(0, 8).map(x => `<button type="button" class="bd-row" data-code="${esc(x.code)}"><span class="bd-nm"><b>${esc(x.name)}</b><i>${esc(x.code)}</i></span><span class="bd-px">${esc(x.tag || "")}</span><span class="bd-v ${/買|續抱/.test(x.action || "") ? "up" : /賣|減/.test(x.action || "") ? "down" : ""}">${esc(actFor(x.code, x.action || ""))}</span></button>`).join("")}</div>` : ""}<div class="bd-ch">${["開高", "平盤", "開低"].map(k => `<div><span>${k}</span><b class="${k === "開高" ? "up" : k === "開低" ? "down" : ""}">${esc((a.chances || {})[k] || "—")}</b></div>`).join("")}</div>` : `<p class="sub">05:30 自動產生。</p>`;
    if (first || cur === "dpOverview") boardIn(box, first);
  }
  /* the reading over a distribution bar: how many, and the busiest stocks in that bucket */
  function distTip(e) {
    const card = e.currentTarget, col = e.target.closest && e.target.closest(".bd-col");
    let tip = $(".bdtip", card);
    if (!col) { if (tip) tip.hidden = true; return; }
    if (!tip) { tip = document.createElement("div"); tip.className = "hmtip bdtip"; card.appendChild(tip); }
    const b = DIST[+col.dataset.dist], list = DB.list.filter(x => ok(x.price) && x.price > 0 && ok(x.pct) && b[1](x.pct));
    const top = list.slice().sort((a, c) => c.vol - a.vol).slice(0, 5);
    tip.innerHTML = `<b>漲跌幅 ${esc(b[0])}${/~/.test(b[0]) ? "%" : ""} <em>${fmt(list.length)} 檔</em></b>${top.length ? `<ul>${top.map(x => `<li><span>${esc(x.name)}</span><em class="${tone(x.chg)}">${pct(x.pct)}</em></li>`).join("")}</ul>` : ""}<p>點一下在股票清單列出全部</p>`;
    tip.hidden = false;
    const r = card.getBoundingClientRect(), cr = col.getBoundingClientRect(), w = tip.offsetWidth;
    tip.style.transform = `translate(${Math.round(clamp(cr.left - r.left + cr.width / 2 - w / 2, 6, r.width - w - 6))}px, ${Math.round(Math.max(6, cr.top - r.top + 24))}px)`;
  }
  /* bars grow from the baseline, list rows slide in one after another, tiles pop in */
  function boardIn(box, full) {
    $$(".bd-b", box).forEach((b, i) => b.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 700, delay: full ? 150 + i * 60 : 0, easing: "cubic-bezier(.2,.9,.3,1.1)", fill: "backwards" }));
    if (!full) return;
    $$(".bd-row", box).forEach((r, i) => r.animate([{ opacity: 0, transform: "translateX(-8px)" }, { opacity: 1, transform: "none" }], { duration: 400, delay: 250 + (i % 8) * 45, fill: "backwards" }));
    $$(".bd-vrow", box).forEach((r, i) => r.animate([{ backgroundSize: "0% 100%" }, { backgroundSize: "var(--w) 100%" }], { duration: 900, delay: 400 + i * 60, easing: "ease-out", fill: "backwards" }));
    $$(".bd-tile", box).forEach((t, i) => t.animate([{ opacity: 0, transform: "scale(.85)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 300 + i * 50, easing: "cubic-bezier(.2,.9,.3,1.3)", fill: "backwards" }));
  }

  /* ---------------- index cards: intraday sparklines and a detail chart (Yahoo Taiwan through the Worker) ---------------- */
  const CH = {};                                   /* "k:r" → chart data */
  const IXV = { k: null, r: "tick" };
  const usOpen = () => { const m = taipei().mins; return m >= 21 * 60 + 30 || m < 5 * 60; };
  const sessOpen = k => (isFut(k) ? marketOpen() || nightOpen() : /^(dji|spx|ixic|sox)$/.test(k) ? usOpen() : marketOpen());
  /* when Yahoo's chart service has nothing for a US index, the Worker's month of daily closes stands in for the chart */
  function histChart(it, r) {
    const h = it && it.hist; if (!h || h.length < 3) return null;
    const pts = h.map(x => [x[0], x[1], 0, null, null, null]), v = h.map(x => x[1]);
    return { k: it.k, r, name: it.name, prev: v[0], last: v[v.length - 1], open: NaN, high: Math.max(...v), low: Math.min(...v), volume: NaN, pts, synthetic: true };
  }
  async function loadChart(k, r) {
    const j = await J(`${WORKER}/tw/chart?k=${k}&r=${r}`);
    if (j && Array.isArray(j.pts)) {
      /* no intraday series: draw the daily closes instead */
      CH[k + ":" + r] = j;
      if (r === "tick" && j.pts.length < 2 && !CH[k + ":sday"]) loadChart(k, "day").then(dj => { if (dj && dj.pts && dj.pts.length > 2) { CH[k + ":sday"] = dj; paintSparks(); } }).catch(() => null);
    }
    return CH[k + ":" + r];
  }
  async function loadCharts(first) {
    await Promise.all(IDX.map(i => (first || sessOpen(i.k) || !CH[i.k + ":tick"] ? loadChart(i.k, "tick").catch(() => null) : null)));
    paintSparks(); if (first && cur === "dpOverview") drawSpark();
    if (IXV.k && IXV.r === "tick" && sessOpen(IXV.k)) ixPaint(false);
    setTimeout(() => loadCharts(false), marketOpen() || nightOpen() ? 60000 : 600000);
  }
  function paintSparks() {
    IDX.forEach(i => {
      const svg = $(`.ixcard[data-k="${i.k}"] .spark`), tk = CH[i.k + ":tick"], sd = CH[i.k + ":sday"], d = (tk && tk.pts && tk.pts.length > 1 ? tk : null) || (sd ? { pts: sd.pts.slice(-30).map(h => [h[0], h[1]]), prev: sd.pts[Math.max(0, sd.pts.length - 30)][1] } : null) || (i.hist && i.hist.length > 2 ? { pts: i.hist.map(h => [h[0], h[1]]), prev: i.hist[0][1] } : null); if (!svg || !d || d.pts.length < 2) return;
      const sg = d.pts.length + ":" + d.pts[d.pts.length - 1][1] + ":" + d.prev; if (svg.dataset.sg === sg) return; svg.dataset.sg = sg;
      const ys = d.pts.map(p => p[1]), base = ok(d.prev) ? d.prev : ys[0], lo = Math.min(base, ...ys), hi = Math.max(base, ...ys), span = hi - lo || 1, n = ys.length - 1;
      const Y = v => (26 - (v - lo) / span * 24).toFixed(1);
      /* a single-colour line (red when the day is above yesterday's close, green when below) */
      $$(".cd", svg).forEach(x => x.remove());
      let pth = $("path", svg); if (!pth) { pth = document.createElementNS("http://www.w3.org/2000/svg", "path"); svg.appendChild(pth); }
      pth.setAttribute("d", ys.map((v, k) => (k ? "L" : "M") + (k / n * 76).toFixed(2) + " " + Y(v)).join(""));
      const b = $(".spbase", svg); b.setAttribute("y1", Y(base)); b.setAttribute("y2", Y(base));
      svg.setAttribute("class", "spark up");
      if (!svg.dataset.drawn) { svg.dataset.drawn = "1"; pth.setAttribute("pathLength", "1"); pth.classList.remove("spdraw"); void pth.getBoundingClientRect(); pth.classList.add("spdraw"); }
    });
    if (!paintSparks.busy && $(".ixcard.ixwait:not([data-shown])")) { paintSparks.busy = true; try { paintIdx(); } finally { paintSparks.busy = false; } }   /* a card was waiting for its line: show number and line together now */
  }
  /* the detail panel sits right under the row of the card that was opened */
  function ixPlace(panel, k) {
    const grid = $("#dpOverview .ixgrid"), cards = $$(".ixcard", grid), i = cards.findIndex(c => c.dataset.k === k); if (i < 0) return;
    const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").length), last = Math.min(cards.length - 1, (Math.floor(i / cols) + 1) * cols - 1);
    panel.style.gridColumn = "1 / -1"; panel.style.marginTop = "0"; cards[last].after(panel);
  }
  addEventListener("resize", () => { const p = $("#dpOverview .ixdetail"); if (p && !p.hidden && IXV.k) ixPlace(p, IXV.k); });
  function ixOpen(k) {
    const panel = $("#dpOverview .ixdetail");
    $$(".ixcard").forEach(c => c.setAttribute("aria-expanded", "false"));
    if (IXV.k === k && !panel.hidden) { panel.hidden = true; IXV.k = null; return; }
    IXV.k = k; IXV.r = (IDX.find(i => i.k === k) || {}).us ? "3mo" : "tick"; ixPlace(panel, k); panel.hidden = false;
    $(`.ixcard[data-k="${k}"]`).setAttribute("aria-expanded", "true");
    ixPaint(true);
    panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  /* warm the chart data as soon as the pointer reaches a card, so the panel has something to draw the moment it opens */
  const ixWarm = e => { const c = e.target.closest && e.target.closest(".ixcard"); if (!c) return; const k = c.dataset.k, it = IDX.find(i => i.k === k); if (!it) return; const r = it.us ? "3mo" : "tick", key = k + ":" + (r === "tick" ? "tick" : "day"); if (!CH[key] && !ixWarm.p[key]) { ixWarm.p[key] = 1; Promise.resolve().then(() => loadChart(k, r === "tick" ? "tick" : "day")).catch(() => {}).finally(() => { delete ixWarm.p[key]; }); } };
  ixWarm.p = {}; ["pointerover", "pointerdown", "touchstart"].forEach(t => document.addEventListener(t, ixWarm, { capture: true, passive: true }));
  async function ixPaint(animate) {
    const panel = $("#dpOverview .ixdetail"), k = IXV.k, r = IXV.r; if (!k || panel.hidden) return;
    const it = IDX.find(i => i.k === k), key = k + ":" + (r === "tick" ? "tick" : "day");
    if (!CH[key] || (r !== "tick" && !CH[key].pts.length)) { panel.innerHTML = `<p class="sub">載入走勢…</p>`; try { await loadChart(k, r === "tick" ? "tick" : "day"); } catch (e) { const syn = histChart(it, r); if (syn) CH[key] = syn; else { panel.innerHTML = `<p class="sub">走勢讀不到，請稍後再試。</p>`; return; } } }
    if (IXV.k !== k || IXV.r !== r) return;
    const d = CH[key], pts = r === "tick" ? d.pts : d.pts.slice(r === "3mo" ? -66 : -250);
    const z = ok(it.z) ? it.z : d.last, y = ok(it.y) ? it.y : d.prev, ch = z - y, t = tone(ch), dg = 2;
    const sessName = isFut(k) ? (nightOpen() || (taipei().mins < 525) ? "夜盤（15:00 起）" : "日盤（08:45 起）") : "當日（09:00–13:30）";
    const vol = isFut(k) ? (ok(it.v) || ok(d.volume) ? fmt(ok(d.volume) ? d.volume : it.v) + " 口" : "—") : ok(d.volume) ? fmt(d.volume / 1e8, 1) + " 億股" : "—";
    const kv = (a, b, c) => `<div class="snap ixkv"><span>${a}</span><b class="${c || ""}">${b}</b></div>`;
    panel.innerHTML = `
      <div class="ixdhead"><div><h3>${esc(it.name)}<em class="ixen">${it.en}</em>${it.label ? " (" + esc(it.label.replace(/^臺指期\s*/, "")) + ")" : ""}</h3>
          <div class="ixdnow"><b class="big ${t}">${ok(z) ? fmt(z, dg) : "—"}</b><span class="${t}">${ok(ch) ? `${arrow(ch)} ${fmt(Math.abs(ch), dg)} (${pct(ch / y * 100)})` : ""}</span><span class="sub">${esc(it.src || "")} ${esc((it.tm || "").slice(0, 5))}</span></div></div>
        <div class="chips">${[["tick", sessName.replace(/（.*/, "") + "走勢"], ["3mo", "日線 3 個月"], ["1y", "日線 1 年"]].map(([v, l]) => `<button type="button" class="chip" data-ixr="${v}" aria-pressed="${v === r}">${l}</button>`).join("")}
          <button type="button" class="btn ixclose" aria-label="關閉">×</button></div></div>
      <div class="ixdbody"><div class="ixdchart">${ixSVG(pts, r === "tick" ? y : null, r, k)}<p class="sub ixread"></p></div>
        <div class="ixdstats">${kv("開盤", ok(d.open) ? fmt(d.open, dg) : "—")}${kv("最高", ok(it.h) ? fmt(it.h, dg) : ok(d.high) ? fmt(d.high, dg) : "—", "up")}${kv("最低", ok(it.l) ? fmt(it.l, dg) : ok(d.low) ? fmt(d.low, dg) : "—", "down")}
          ${kv(isFut(k) ? "參考價" : "昨收", ok(y) ? fmt(y, dg) : "—")}${kv("振幅", ok(d.high) && ok(d.low) && ok(y) ? pct((d.high - d.low) / y * 100).replace("+", "") : "—")}${kv("成交量", vol)}
          ${isFut(k) && ok(d.limitUp) ? kv("漲停／跌停", `${fmt(d.limitUp, 0)}／${fmt(d.limitDown, 0)}`) : ""}${r !== "tick" && pts.length > 1 ? kv("區間漲跌", pct((pts[pts.length - 1][1] / pts[0][1] - 1) * 100), tone(pts[pts.length - 1][1] - pts[0][1])) + kv("區間最高", fmt(Math.max(...pts.map(p => p[1])), 0), "up") + kv("區間最低", fmt(Math.min(...pts.map(p => p[1])), 0), "down") : ""}</div></div>`;
    ixHover(panel, pts, r);
    if (animate) ixAnimate(panel);
  }
  function ixSVG(pts, base, r, k) {
    const W = 760, H = 300, PL = 62, PR = 12, PT = 12, PB = 26;
    if (pts.length < 2) return `<p class="mempty">${r === "tick" ? "這個時段還沒有成交。" : "沒有資料。"}</p>`;
    const ys = pts.map(p => p[1]), lo0 = Math.min(...ys, ok(base) ? base : Infinity), hi0 = Math.max(...ys, ok(base) ? base : -Infinity), pad = (hi0 - lo0) * 0.08 || 1, lo = lo0 - pad, hi = hi0 + pad;
    /* the session's own time span for the intraday chart, so a morning line only fills part of the width */
    let x0 = pts[0][0], x1 = pts[pts.length - 1][0];
    if (r === "tick") { const d0 = new Date((pts[0][0] + 8 * 3600) * 1000), mid = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate()) / 1000 - 8 * 3600, h = d0.getUTCHours();
      if (isFut(k) && h >= 15) { x0 = mid + 15 * 3600; x1 = mid + 29 * 3600; } else if (isFut(k)) { x0 = mid + 8.75 * 3600; x1 = mid + 13.75 * 3600; } else { x0 = mid + 9 * 3600; x1 = mid + 13.5 * 3600; } }
    const X = (p, i) => PL + (r === "tick" ? (p[0] - x0) / (x1 - x0) : i / (pts.length - 1)) * (W - PL - PR), Y = v => PT + (hi - v) / (hi - lo) * (H - PT - PB);
    const ticks = [0, 1, 2, 3].map(j => lo + pad + (hi0 - lo0) * j / 3);
    const xl = r === "tick" ? [0, 0.25, 0.5, 0.75, 1].map(f => { const ts = x0 + (x1 - x0) * f, d = new Date((ts + 8 * 3600) * 1000); return [PL + f * (W - PL - PR), String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0")]; })
      : [0, 0.33, 0.66, 1].map(f => { const p = pts[Math.round(f * (pts.length - 1))], d = new Date((p[0] + 8 * 3600) * 1000); return [PL + f * (W - PL - PR), (d.getUTCMonth() + 1) + "/" + d.getUTCDate()]; });
    const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p, i).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(""), last = pts[pts.length - 1];
    const up = ok(base) ? last[1] >= base : last[1] >= pts[0][1];
    const area = line + `L${X(last, pts.length - 1).toFixed(1)} ${H - PB}L${X(pts[0], 0).toFixed(1)} ${H - PB}Z`;
    return `<svg class="ixfig ${up ? "up" : "down"}" viewBox="0 0 ${W} ${H}" role="img" aria-label="走勢圖">
      <g class="ixbk">${ticks.map(v => `<line class="gridl" x1="${PL}" x2="${W - PR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${PL - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${fmt(v, 0)}</text>`).join("")}
        ${xl.map(([x, l]) => `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle">${l}</text>`).join("")}
        ${ok(base) ? `<line class="ixbase" x1="${PL}" x2="${W - PR}" y1="${Y(base).toFixed(1)}" y2="${Y(base).toFixed(1)}"/>` : ""}</g>
      <path class="ixarea" d="${area}"/><path class="ixline" d="${line}"/>
      <g class="ixcur" style="display:none"><line class="ixvl" y1="${PT}" y2="${H - PB}"/><circle r="4"/></g>
      <rect class="ixhit" x="${PL}" y="${PT}" width="${W - PL - PR}" height="${H - PT - PB}" fill="transparent"/></svg>`;
  }
  function ixHover(panel, pts, r) {
    const svg = $(".ixfig", panel), read = $(".ixread", panel); if (!svg) return;
    const g = $(".ixcur", svg), vl = $(".ixvl", svg), dot = $("circle", svg), line = $(".ixline", svg), txt = read.textContent;
    const segs = line.getAttribute("d").match(/[ML][^ML]+/g).map(s => s.slice(1).trim().split(" ").map(Number));
    const move = e => {
      const b = svg.getBoundingClientRect(), x = (e.clientX - b.left) / b.width * 760;
      let i = 0, best = Infinity; segs.forEach((s, j) => { const dd = Math.abs(s[0] - x); if (dd < best) { best = dd; i = j; } });
      const p = pts[i], d = new Date((p[0] + 8 * 3600) * 1000);
      g.style.display = ""; vl.setAttribute("x1", segs[i][0]); vl.setAttribute("x2", segs[i][0]); dot.setAttribute("cx", segs[i][0]); dot.setAttribute("cy", segs[i][1]);
      read.textContent = (r === "tick" ? String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0") : `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`) + `　${fmt(p[1], 2)}` + (p[2] ? `　量 ${fmt(p[2])}` : "");
    };
    svg.addEventListener("pointermove", move); svg.addEventListener("pointerdown", move);
    svg.addEventListener("pointerleave", () => { g.style.display = "none"; read.textContent = txt; });
  }
  /* backdrop (grid, axis, reference line) first, then the line draws from left to right, then the shaded area and the figures */
  function ixAnimate(panel) {
    const svg = $(".ixfig", panel);
    if (svg) {
      $$(".ixbk > *", svg).forEach((el, i) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: i * 25, fill: "backwards" }));
      const ln = $(".ixline", svg), L = ln.getTotalLength(), t0 = 350;
      ln.style.strokeDasharray = L; ln.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 1100, delay: t0, easing: "ease-out", fill: "backwards" });
      $(".ixarea", svg).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: t0 + 1000, fill: "backwards" });
    }
    rise($$(".ixkv", panel), 50, 300);
  }

  /* ---------------- AI pre-market note (written by the Worker at 05:30, or on request) ---------------- */
  /* mid: the midday note (written at 13:00 during the session, calling the next session) in its own tab */
  function pmPaint(j, animate, mid) {
    if (!mid && j && j.note) { PMN = j.note; boardSig = boardSig ? "x" : ""; try { paintBoard(); } catch (e) {} }
    if (!mid && j && j.note) document.dispatchEvent(new CustomEvent("twdash:premarket", { detail: j }));
    const el = $(mid ? "#dpPre .mdout" : "#dpPre .pmout"); if (!el) return;
    const n = j && j.note;
    if (!n || !n.analysis) { el.innerHTML = `<p class="sub">還沒有分析，${mid ? "13:00" : "05:30"} 會自動產生。</p>`; return; }
    const a = n.analysis, ch = a.chances || {}, li = arr => (Array.isArray(arr) ? arr : []).map(x => `<li>${esc(x)}</li>`).join(""), tn = /高/.test(a.call) ? "up" : /低/.test(a.call) ? "down" : "";
    const at = new Date(n.at).toLocaleString("zh-TW", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    el.innerHTML = `
      <div class="aisum lrise"><div class="aiverdict"><span class="aitag ${tn}">${esc(a.call)}</span><b class="pmday">預測 ${esc(String(n.day).slice(5).replace("-", "/"))}（週${"日一二三四五六"[new Date(n.day + "T00:00:00Z").getUTCDay()]}）09:00 開盤</b><span class="sub">${esc(a.gap || "")}・信心 ${esc(a.confidence || "—")}・${at} 產生${n.day < new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10) || (n.day === new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10) && new Date(Date.now() + 8 * 3600e3).getUTCHours() >= 9) ? "（這天已經開過盤，是舊的分析）" : ""}</span></div>
        <p class="ailead">${esc(a.headline || "")}</p>
        <div class="pmrow"><div class="pmseg"><h4>09:00 開盤</h4><div class="pmchance">${["開高", "平盤", "開低"].map(k => `<div><span>${k}</span><b class="${k === "開高" ? "up" : k === "開低" ? "down" : ""}">${esc(ch[k] || "—")}</b></div>`).join("")}</div></div>
        ${a.close && a.close.call ? `<div class="pmseg"><h4>13:30 收盤 <span class="aitag ${/紅/.test(a.close.call) ? "up" : /黑/.test(a.close.call) ? "down" : ""}">${esc(a.close.call)}</span> <span class="sub">${esc(a.close.range || "")}</span></h4><div class="pmchance">${["收紅", "平盤", "收黑"].map(k => `<div><span>${k}</span><b class="${k === "收紅" ? "up" : k === "收黑" ? "down" : ""}">${esc((a.close.chances || {})[k] || "—")}</b></div>`).join("")}</div>${a.close.why ? `<p class="pmcw">${esc(a.close.why)}</p>` : ""}</div>` : ""}</div></div>
      <div class="aicols"><div class="lrise"><h4>${mid ? "今日盤勢" : "夜盤"}</h4><p>${esc(a.night || "—")}</p></div><div class="lrise"><h4>美股與國際</h4><p>${esc(a.us || "—")}</p></div></div>
      ${Array.isArray(a.picks) && a.picks.length ? `<div class="pmpicks"><div class="pmph"><h4>推薦下單</h4><span class="sub">${esc(a.picks_note || "")}</span></div><div class="pmpgrid">${a.picks.map(x => { const t = /買|續抱/.test(x.action || "") ? "up" : /賣|減/.test(x.action || "") ? "down" : ""; return `<button type="button" class="aiorder pmpick ${t ? "o-" + t : ""} lrise" data-pick="${esc(x.code)}">
        <div class="aiohead"><span class="ntag">${esc(x.tag || "")}</span><b class="pmpn">${esc(x.name || "")} <i>${esc(x.code)}</i></b><b class="${t}">${esc(actFor(x.code, x.action || ""))}</b>${x.rr ? `<span class="sub">風險報酬 ${esc(x.rr)}</span>` : ""}</div>
        <p class="pmpw">${esc(x.why || "")}</p>${anaHTML(x.analysis)}
        <div class="aikv"><div><span>怎麼下</span><b>${esc(x.how || "—")}</b></div><div><span>分批</span><b>${esc(x.split || "—")}</b></div><div><span>停損</span><b>${esc(x.stop || "—")}</b></div><div><span>目標</span><b>${esc((Array.isArray(x.targets) ? x.targets : []).join("；") || "—")}</b></div></div>${planHTML(x.days)}</button>`; }).join("")}</div></div>` : ""}
      <div class="pmfac">${(Array.isArray(a.factors) ? a.factors : []).map(f => `<div class="pmf lrise"><span class="aitag ${f.effect === "利多" ? "up" : f.effect === "利空" ? "down" : ""}">${esc(f.effect || "")}</span><b>${esc(f.name)}</b><span class="sub">${esc(f.note)}</span></div>`).join("")}</div>
      <details class="pmmore"><summary>族群、關鍵點位、風險與開盤後要盯的事</summary>
        <div class="aicols"><div><h4>可能領漲／落後</h4><ul>${li(a.sectors)}</ul><h4>關鍵點位</h4><p>${esc(a.levels || "—")}</p></div><div><h4>風險</h4><ul>${li(a.risks)}</ul><h4>${mid ? "今晚與開盤後要盯" : "09:00–09:30 要盯"}</h4><ul>${li(a.watch)}</ul></div></div>
        ${n.news && n.news.length ? `<h4>參考的新聞</h4><div class="newslist">${newsHTML(n.news, null)}</div>` : ""}</details>`;
    if (animate) rise($$(".lrise", el), 70);
  }
  async function pmLoad(mid) { try { pmPaint(await J(`${WORKER}/tw/${mid ? "midday" : "premarket"}`), true, mid); } catch (e) { const el = $(mid ? "#dpPre .mdout" : "#dpPre .pmout"); if (el) el.innerHTML = `<p class="sub">${mid ? "盤中" : "盤前"}分析需要部署新版 Worker。</p>`; } }
  async function pmRun(b, mid) {
    const el = $(mid ? "#dpPre .mdout" : "#dpPre .pmout"), path = mid ? "midday" : "premarket";
    $$(".runmsg", el).forEach(x => x.remove());
    b.disabled = true; b.textContent = "分析中…";
    const t0 = Date.now() - 5000;
    try {
      const r = await fetch(WORKER + "/tw/" + path + "/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const j = await r.json().catch(() => null);
      if (mid && j && j.error && j.error.status === "MARKET_CLOSED") { MD_HOLIDAY = true; b.disabled = false; b.textContent = "分析"; mdGate(); return; }
      if (!r.ok || !j || !j.analysis) throw new Error(aiLimitMsg(j) || (j && j.error && /[一-鿿]/.test(j.error.message || "") ? j.error.message : "暫時沒有回應，過幾分鐘再試"));
      pmPaint({ note: j }, true, mid);
      const tg = j.sent === "sent" ? "已傳到 Telegram。" : j.sent && j.sent !== "off" ? "Telegram 沒有送出：" + j.sent : "";
      if (tg) el.insertAdjacentHTML("afterbegin", `<p class="runmsg sub ${j.sent === "sent" ? "" : "warn"}">${esc(tg)}</p>`);
    } catch (e) {
      /* a long run can outlast the connection while the Worker keeps going: wait for the new note (up to about 2 minutes) before saying it failed */
      if (!/[一-鿿]/.test(e.message || "")) {
        el.insertAdjacentHTML("afterbegin", `<p class="runmsg sub">連線中斷了，伺服器還在分析，等它完成…</p>`);
        for (let k = 0; k < 12; k++) {
          await new Promise(r => setTimeout(r, 10000));
          try { const j = await J(`${WORKER}/tw/${path}`); if (j.note && j.note.at >= t0) { $$(".runmsg", el).forEach(x => x.remove()); pmPaint(j, true, mid); b.disabled = false; b.textContent = "分析"; return; } } catch (e2) {}
        }
        $$(".runmsg", el).forEach(x => x.remove());
      }
      el.insertAdjacentHTML("afterbegin", `<p class="runmsg sub warn">${/[一-鿿]/.test(e.message || "") ? esc(e.message) : "沒有等到新的分析，可能是額度用完或忙碌，過幾分鐘再按一次。"}</p>`);
    }
    b.disabled = false; b.textContent = "分析";
  }


  /* a 5-day plan strip and a short analysis list, shared by the AI team's order and the pre-market picks */
  const planHTML = days => (Array.isArray(days) && days.length ? `<div class="plan">${days.map(d => `<div class="pday ${/多/.test(d.view || "") ? "up" : /空/.test(d.view || "") ? "down" : ""}"><b>${esc(d.d || "")}</b><span class="pv">${esc(d.view || "")}</span><span class="pr">${esc(d.range || "")}</span><span class="pdo">${esc(d.do || "")}</span></div>`).join("")}</div>` : "");
  const anaHTML = a => (Array.isArray(a) && a.length ? `<ul class="pana">${a.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  /* ---------------- the AI analyst team ---------------- */
  const AI = new Map();                            /* code → { at, data } for this visit */
  /* the two limits that need their own words: the Gemini free tier's daily cap (reset at midnight US Pacific) and the per-connection cap;
     anything else (a busy minute included) keeps the Worker's own message */
  function aiLimitMsg(j) {
    const code = j && j.error && j.error.status;
    if (code === "AI_DAILY") {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date()).map(x => [x.type, x.value]));
      const t = Date.now() + (86400 - (+p.hour * 3600 + +p.minute * 60 + +p.second)) * 1000, tw = ms => new Date(ms + 8 * 3600e3).toISOString();
      return `今天的額度用完了，${tw(t).slice(0, 10) === tw(Date.now()).slice(0, 10) ? "今天" : "明天"} ${tw(t).slice(11, 16)} 重置`;
    }
    if (code === "RESOURCE_EXHAUSTED") return "分析次數到上限了，晚一點再試";
    return null;
  }
  const stanceTone = s => (/多/.test(s || "") ? "up" : /空/.test(s || "") ? "down" : "");
  function paintAI() {
    const box = $("#dpStock"), out = $(".aiout", box), msg = $(".aimsg", box), go = $(".aihead .aigo", box); if (!out) return;
    const hit = AI.get(CODE);
    go.disabled = false; go.textContent = hit ? "重新分析" : "開始分析";
    if (!hit) { out.innerHTML = ""; msg.textContent = ""; return; }
    const a = hit.data.analysis || {}, S = a.summary || {}, E = S.entry || {}, li = arr => (Array.isArray(arr) ? arr : []).map(x => `<li>${esc(x)}</li>`).join("");
    msg.textContent = `分析時間 ${new Date(hit.at).toLocaleString("zh-TW", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}，依當時的報價與新聞。`;
    const O = { ...(a.order || {}) }; O.action = actFor(CODE, O.action); const otn = /買|續抱|偏多/.test(O.action || "") ? "up" : /賣|減/.test(O.action || "") ? "down" : "";
    out.innerHTML = `
      ${O.action ? `<div class="aiorder ${otn ? "o-" + otn : ""}"><div class="aiohead"><span class="sub">下單建議</span><b class="${otn}">${esc(O.action)}</b>${O.rr ? `<span class="sub">風險報酬 ${esc(O.rr)}</span>` : ""}</div>
        <p class="ailead">${esc(O.why || "")}</p>
        <div class="aikv"><div><span>怎麼下</span><b>${esc(O.how || "—")}</b></div><div><span>分批</span><b>${esc(O.split || "—")}</b></div><div><span>停損</span><b>${esc(O.stop || "—")}</b></div><div><span>目標</span><b>${esc((Array.isArray(O.targets) ? O.targets : []).join("；") || "—")}</b></div></div>${planHTML(O.days)}</div>` : ""}
      <div class="aisum"><div class="aiverdict"><span class="aitag ${stanceTone(S.stance)}">${esc(S.stance || "—")}</span><span class="sub">信心 ${esc(S.confidence || "—")}</span></div>
        <p class="ailead">${esc(S.headline || "")}</p>
        <div class="aicols"><div><h4>未來 1–2 週</h4><p>${esc(S.short_term || "—")}</p></div><div><h4>未來 1–3 個月</h4><p>${esc(S.mid_term || "—")}</p></div></div></div>
      <div class="aiscen">${(Array.isArray(S.scenarios) ? S.scenarios : []).map(x => `<div class="dcard"><h4>${esc(x.name)} <span class="sub">${esc(x.chance || "")}</span></h4><p>${esc(x.trigger || "")}</p><p class="airange">${esc(x.range || "")}</p></div>`).join("")}</div>
      <div class="dcard aientry"><h4>進場時機 <span class="aitag ${/適合/.test(E.now || "") ? "up" : /不建議/.test(E.now || "") ? "down" : ""}">${esc(E.now || "—")}</span></h4>
        <ul>${li(E.conditions)}</ul>
        <div class="aikv"><div><span>價位區間</span><b>${esc(E.zone || "—")}</b></div><div><span>停損</span><b>${esc(E.stop || "—")}</b></div><div><span>不要進場的情況</span><b>${esc(E.avoid || "—")}</b></div></div></div>
      <div class="aiteam">${(Array.isArray(a.team) ? a.team : []).map(m => `<div class="dcard"><h4>${esc(m.role)} <span class="aitag ${stanceTone(m.stance)}">${esc(m.stance || "")}</span></h4><ul>${li(m.points)}</ul></div>`).join("")}</div>
      <div class="aicols"><div class="dcard"><h4>風險</h4><ul>${li(S.risks)}</ul></div><div class="dcard"><h4>接下來要盯的事</h4><ul>${li(S.watch)}</ul></div></div>
      ${hit.data.world && hit.data.world.length ? `<div class="dcard"><h4>這次參考的大盤與國際新聞</h4><div class="newslist">${newsHTML(hit.data.world, null)}</div></div>` : ""}`;
  }
  async function analyze() {
    const box = $("#dpStock"), msg = $(".aimsg", box), go = $(".aihead .aigo", box), code = CODE, s = DB.by.get(code);
    const cs = barsOf(code);
    if (!s || !cs || cs.length < 30) { msg.textContent = "這檔的歷史資料還不夠，無法分析。"; return; }
    if (!DB.live) { msg.textContent = "讀不到資料。"; return; }
    const fresh = AI.has(code);                    /* 重新分析 asks for a new one; 開始分析 may get today's saved one at no cost */
    go.disabled = true; go.textContent = "分析中…"; msg.textContent = "五位分析師正在讀數據與新聞，大約需要 20 到 40 秒。";
    $(".aiout", box).innerHTML = `<div class="aiwait"><i></i><i></i><i></i><i></i><i></i></div>`;
    try {
      await Promise.all([loadFund(), loadChip()]);
      let lab = null;
      try { lab = window.TWLab ? await TWLab.research(code, (i, n) => { if (code === CODE) msg.textContent = `整理研究資料（讀日線 ${i}/${n} 個月）…`; }) : null; } catch (e) { lab = null; }
      if (code === CODE) msg.textContent = "五位分析師正在讀數據、研究資料與新聞，大約需要 20 到 40 秒。";
      const F = facts(cs); if (lab) F.research = lab;
      const r = await fetch(WORKER + "/tw/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ d: DEVICE, code, name: s.name, facts: F, fresh }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.analysis) {
        const st = r.status;
        throw new Error(aiLimitMsg(j) || (j && j.error && /[一-鿿]/.test(j.error.message || "") ? j.error.message : st >= 500 ? "Google 的服務現在太忙，過幾分鐘再按一次" : "暫時沒有回應，過幾分鐘再試"));
      }
      AI.set(code, { at: j.at || Date.now(), data: j });
      document.dispatchEvent(new CustomEvent("twdash:ai", { detail: { code, name: s.name, at: j.at || Date.now(), price: F.close, barDate: F.date, analysis: j.analysis } }));
      if (code === CODE) { paintAI(); rise(Array.from($(".aiout", box).children), 90); }
    } catch (e) {
      /* a failed 重新分析 keeps the analysis already on screen */
      if (code === CODE) { paintAI(); msg.textContent = e && e.message && /[一-鿿]/.test(e.message) ? e.message : "連不到分析服務，請稍後再試。"; }
    }
  }

  /* a row or a tape item lights up in the direction of the tick, then fades */
  function tickFlash(el, dir) { el.classList.remove("tick-up", "tick-down"); void el.offsetWidth; el.classList.add(dir === "up" ? "tick-up" : "tick-down"); }

  /* ---------------- the tape: the indices and 自選1, scrolling across the top of every tab ---------------- */
  const tape = document.createElement("div");
  tape.className = "tape"; tape.setAttribute("aria-label", "自選1 行情"); tape.hidden = true;
  tape.innerHTML = `<div class="tape-track"></div>`;
  let tapeSig = "";
  function paintTape() {
    const note = $(".dash-note"); if (note && !tape.isConnected) note.after(tape);
    const codes = (LISTS[0] || []).filter(c => DB.by.has(c)).slice(0, 40);
    if (!DB.list.length || (!codes.length && !IDX.some(i => ok(i.z)))) { tape.hidden = true; return; }
    tape.hidden = false;
    const item = (key, name, v, p, d, isIx) => `<button type="button" class="tp" ${isIx ? `data-ix="${key}"` : `data-code="${esc(key)}"`}><b>${esc(name)}</b><span>${fmt(v, d)}</span><em class="${tone(p)}">${arrow(p)}${pct(p)}</em></button>`;
    const items = IDX.slice(0, 2).filter(i => ok(i.z) && ok(i.y)).map(i => ({ k: "ix" + i.k, h: item(i.k, i.name + " " + i.en, i.z, (i.z / i.y - 1) * 100, i.k === "fut" ? 0 : 2, true), v: i.z, p: (i.z / i.y - 1) * 100 }))
      .concat(codes.map(c => { const s = DB.by.get(c); return { k: c, h: item(c, s.name, s.price, s.pct, dig(s.price)), v: s.price, p: s.pct, s }; }));
    const sig = items.map(x => x.k).join();
    const track = $(".tape-track", tape);
    if (sig !== tapeSig) {
      tapeSig = sig;
      const one = items.map(x => x.h).join("");
      track.innerHTML = `<div class="tape-set">${one}</div><div class="tape-set" aria-hidden="true">${one}</div>`;
      track.style.setProperty("--dur", Math.max(24, items.length * 4.5) + "s");
      return;
    }
    items.forEach(x => {
      $$(x.k.startsWith("ix") ? `.tp[data-ix="${x.k.slice(2)}"]` : `.tp[data-code="${x.k}"]`, track).forEach(b => {
        const sp = $("span", b), em = $("em", b), txt = fmt(x.v, x.k === "ixfut" ? 0 : x.s ? dig(x.v) : 2);
        if (sp.textContent !== txt) { const up = num(sp.textContent) < x.v; sp.textContent = txt; tickFlash(b, up ? "up" : "down"); }
        em.className = tone(x.p); em.textContent = arrow(x.p) + pct(x.p);
      });
    });
  }
  tape.addEventListener("click", e => {
    const b = e.target.closest(".tp"); if (!b) return;
    if (b.dataset.code) openStock(b.dataset.code, b); else { open("dpOverview", true); setTimeout(() => ixOpen(b.dataset.ix), 60); }
  });

  /* ---------------- live repaint ---------------- */
  function paintLive() {
    paintIdx(); paintStrip(); paintTape(); document.dispatchEvent(new Event("twdash:live"));   /* the sidebar repaints in the same frame */
    if (cur === "dpList") {
      $$("#dpList .mtbl tbody tr[data-code]").forEach(tr => {
        const s = DB.by.get(tr.dataset.code); if (!s || !s.rt) return;
        const tmp = document.createElement("tbody"); tmp.innerHTML = rowHTML(s);
        const fresh = tmp.firstElementChild;
        if (fresh.innerHTML !== tr.innerHTML) { tr.innerHTML = fresh.innerHTML; if (s.flash) tickFlash(tr, s.flash); }
        const lim = s.pct >= 9.4 ? "up" : s.pct <= -9.4 ? "down" : "";
        if (lim && s.lim !== lim && s.lim !== undefined) { tr.classList.remove("lim-up", "lim-down"); void tr.offsetWidth; tr.classList.add("lim-" + lim); }
        s.lim = lim; s.flash = "";
      });
    } else if (cur === "dpWatch") paintWatch(false);
    else if (cur === "dpStock") { paintHead(); const s = DB.by.get(CODE); if (s && s.rt && HIST.get(CODE)) drawChart(false); }
  }

  /* ---------------- tabs ---------------- */
  function rise(nodes, gap, delay = 0) {
    nodes.forEach((n, i) => n.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: 460, delay: delay + i * gap, easing: "cubic-bezier(.2,.9,.3,1)", fill: "backwards" }));
  }
  const tabs = $$(".dtabs button[data-p]"), pill = $(".dtabs .pill");
  let cur = null;
  function movePill(b, animate) {
    if (!pill) return;
    if (!animate) pill.style.transition = "none";
    if (getComputedStyle(pill.parentElement).flexDirection === "column") { pill.style.width = ""; pill.style.height = b.offsetHeight + "px"; pill.style.transform = `translateY(${b.offsetTop}px)`; }
    else { pill.style.height = ""; pill.style.width = b.offsetWidth + "px"; pill.style.transform = `translateX(${b.offsetLeft}px)`; }
    if (!animate) { pill.offsetWidth; pill.style.transition = ""; }
  }
  /* "續抱" only makes sense for a stock the user actually holds */
  const heldCode = c => (store.get("twlab-hold", []) || []).some(h => String(h.code) === String(c));
  const actFor = (code, act) => (!heldCode(code) && /續抱/.test(act || "")) ? String(act).replace(/續抱/g, "偏多觀察") : act;
  function open(id, animate, quiet) {
    const nb = tabs.find(t => t.dataset.p === id) || tabs[0];
    if (false && animate && !quiet && cur && cur !== nb.dataset.p && document.startViewTransition && !document.hidden) {
      document.documentElement.style.setProperty("--vtd", tabs.indexOf(nb) > tabs.findIndex(t => t.dataset.p === cur) ? "1" : "-1");
      const vt = document.startViewTransition(() => openNow(id, animate, quiet)); [vt.ready, vt.finished, vt.updateCallbackDone].forEach(pr => pr && pr.catch(() => {}));
      return;
    }
    openNow(id, animate, quiet);
  }
  function openNow(id, animate, quiet) {
    const b = tabs.find(t => t.dataset.p === id) || tabs[0], panel = document.getElementById(b.dataset.p), same = cur === b.dataset.p;
    if (!same && cur) scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });   /* a different menu starts at the top */
    if (b.dataset.p !== "dpStock" && typeof BACK !== "undefined" && BACK) { BACK = null; showBack(); }
    tabs.forEach(t => t.setAttribute("aria-selected", t === b ? "true" : "false"));
    movePill(b, animate);
    $$(".dpanel").forEach(p => p.classList.toggle("on", p === panel));
    cur = b.dataset.p;
    try { sessionStorage.setItem("twdash-tab", cur); } catch (e) {}
    navPush();
    document.dispatchEvent(new CustomEvent("twdash:tab", { detail: cur }));
    if (!quiet) {
      /* panel content rises in one block after another; then the figures inside draw themselves */
      rise(Array.from(panel.children), 80);
      if (cur === "dpOverview") { rise($$(".ixcard", panel), 70); drawSpark(); const bx = $(".board", panel); if (bx) boardIn(bx, true); HEAT.sig = ""; paintHeat(true); paintStreak(true); paintFlagCard(true); }
      if (cur === "dpList") rise($$(".mtbl tbody tr", panel).slice(0, 24), 18, 200);
      if (cur === "dpWatch") { paintWatch(false); rise($$(".wcard", panel), 60, 80); }
      if (cur === "dpStock" && !same) { if (HIST.get(CODE)) drawChart(true); else setStock(CODE, true); }
    }
    rtPoll();
  }
  function drawSpark() {
    $$(".ixcard .spark").forEach((svg, i) => {
      const pp = $("path", svg); if (!pp || !pp.getAttribute("d")) return;
      svg.animate([{ clipPath: "inset(-4px 100% -4px 0)" }, { clipPath: "inset(-4px -4px -4px 0)" }], { duration: 900, delay: 400 + i * 80, easing: "ease-out", fill: "backwards" });
    });
  }

  tabs.forEach(b => b.addEventListener("click", () => open(b.dataset.p, true)));
  $(".dtabs").addEventListener("keydown", e => {
    const i = tabs.indexOf(document.activeElement); if (i < 0 || !/Arrow(Left|Right|Up|Down)/.test(e.key)) return;
    const n = tabs[(i + (/Right|Down/.test(e.key) ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click();
  });
  addEventListener("resize", () => { const b = tabs.find(t => t.getAttribute("aria-selected") === "true"); b && movePill(b, false); });
  root.addEventListener("keydown", e => {
    if (!e.target.matches) return;
    if (e.key === "Enter" && e.target.matches("tr[data-code], .wcard[data-code]")) e.target.click();
    if (/^(ArrowDown|ArrowUp|j|k)$/.test(e.key) && e.target.matches("tr[data-code]")) {
      e.preventDefault();
      const n = /ArrowDown|j/.test(e.key) ? e.target.nextElementSibling : e.target.previousElementSibling;
      if (n && n.matches("tr[data-code]")) { n.focus(); n.scrollIntoView({ block: "nearest" }); }
    }
  });
  /* ---------- right-click (or long-press) on any stock: open it, add it to 自選1–5, copy its code ---------- */
  let ctxEl = null, lp = null, swallow = false;
  const ctxClose = () => { if (ctxEl) { const el = ctxEl; ctxEl = null; el.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.96)" }], { duration: 120 }).onfinish = () => el.remove(); } };
  function ctxMenu(code, x, y) {
    ctxClose(); if (menuEl) { menuEl.remove(); menuEl = null; }
    const s = DB.by.get(code); if (!s) return;
    const el = document.createElement("div"); el.className = "ctxmenu"; el.setAttribute("role", "menu");
    const paint = () => {
      el.innerHTML = `<div class="cx-h"><b>${esc(s.name)}</b><i>${esc(code)}</i><em class="${tone(s.chg)}">${fmt(s.price, dig(s.price))}　${pct(s.pct)}</em></div>
        <button type="button" role="menuitem" data-a="open"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V5M5 19h14M8 15l4-5 3 3 4-6"/></svg>個股分析</button>
        <div class="cx-l">${LISTS.map((l, i) => `<button type="button" role="menuitemcheckbox" aria-checked="${l.includes(code)}" data-a="w" data-i="${i}">自選${i + 1}<i>${l.includes(code) ? "✓" : "＋"}</i></button>`).join("")}</div>
        <button type="button" role="menuitem" data-a="copy"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>複製代號</button>`;
    };
    paint(); document.body.appendChild(el); ctxEl = el;
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = clamp(x, 8, innerWidth - w - 8) + "px"; el.style.top = clamp(y, 8, innerHeight - h - 8) + "px";
    el.style.transformOrigin = `${x > innerWidth - w - 8 ? "right" : "left"} ${y > innerHeight - h - 8 ? "bottom" : "top"}`;
    el.animate([{ opacity: 0, transform: "scale(.92)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: "cubic-bezier(.16,1,.3,1)" });
    el.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return; e.stopPropagation();
      if (b.dataset.a === "open") { ctxClose(); openStock(code); }
      else if (b.dataset.a === "w") { toggleWatch(code, +b.dataset.i); paint(); }
      else if (b.dataset.a === "copy") { try { navigator.clipboard.writeText(code); } catch (er) {} b.lastChild.textContent = "已複製"; setTimeout(ctxClose, 500); }
    });
    $("button", el).focus({ preventScroll: true });
  }
  const codeAt = t => { const el = t.closest && t.closest("[data-code]"); return el && DB.by.has(el.dataset.code) ? el : null; };
  document.addEventListener("contextmenu", e => { const el = codeAt(e.target); if (!el || !el.closest("#dash")) return; e.preventDefault(); ctxMenu(el.dataset.code, e.clientX, e.clientY); });
  document.addEventListener("pointerdown", e => {
    if (ctxEl && !e.target.closest(".ctxmenu")) ctxClose();
    if (e.pointerType !== "touch") return;
    const el = codeAt(e.target); if (!el || !el.closest("#dash")) return;
    lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { swallow = true; if (navigator.vibrate) navigator.vibrate(12); ctxMenu(el.dataset.code, lp.x, lp.y); }, 520) };
  }, true);
  document.addEventListener("pointermove", e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) { clearTimeout(lp.t); lp = null; } }, { passive: true });
  document.addEventListener("pointerup", () => { if (lp) { clearTimeout(lp.t); lp = null; } });
  document.addEventListener("click", e => { if (swallow) { swallow = false; if (!e.target.closest(".ctxmenu")) { e.preventDefault(); e.stopPropagation(); } } }, true);
  document.addEventListener("keydown", e => { if (e.key === "Escape") ctxClose(); });
  addEventListener("scroll", ctxClose, { passive: true });

  /* ---------- the command palette (Ctrl+K): any stock, any tab, light / dark ---------- */
  let pal = null;
  const PAGES = [["dpOverview", "總覽", "大盤、國際行情、漲跌分布"], ["dpChip", "籌碼", "籌碼溫度、法人、融資融券、注意股"], ["dpInd", "產業", "類股熱力圖、產業輪動、族群"], ["dpList", "股票", "清單與自選1–5、點股票看個股分析"], ["dpHold", "持股與損益", "持股、損益、風險"], ["dpPre", "分析", "收盤摘要、盤前與盤中分析"], ["dpRev", "復盤", "預測對帳與命中率"], ["dpCal", "市場日曆", "除權息、股東會、結算日"]];
  function palOpen() {
    if (pal) { $("input", pal).focus(); return; }
    pal = document.createElement("div"); pal.className = "pal"; pal.setAttribute("role", "dialog"); pal.setAttribute("aria-modal", "true"); pal.setAttribute("aria-label", "搜尋");
    pal.innerHTML = `<div class="pal-box"><div class="pal-in"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="text" placeholder="代號、名稱或頁面…" aria-label="搜尋股票或頁面" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div><div class="pal-list" role="listbox"></div><p class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 選擇</span><span><kbd>Enter</kbd> 開啟</span><span>右鍵任何股票可加自選</span></p></div>`;
    document.body.appendChild(pal);
    const inp = $("input", pal), list = $(".pal-list", pal);
    let items = [], on = 0;
    const T = window.__twTheme;
    const paint = () => {
      const q = inp.value.trim().toLowerCase();
      const row = (k, ic, a, b, c, cls) => `<button type="button" role="option" class="pal-it" data-k="${esc(k)}"><span class="pi-ic">${ic}</span><b>${a}</b><span class="pi-sub">${b}</span>${c ? `<em class="${cls || ""}">${c}</em>` : ""}</button>`;
      const stk = s => ({ k: "s:" + s.code, h: row("s:" + s.code, esc(s.code), esc(s.name), FLAGS.get(s.code) ? flagTag(s.code) : s.mkt === "otc" ? "上櫃" : s.mkt === "esb" ? "興櫃" : "上市", `${fmt(s.price, dig(s.price))}　${pct(s.pct)}`, tone(s.chg)) });
      let stocks;
      let wl = [];
      if (!q) { stocks = (store.get("twrecent", []) || []).map(c => DB.by.get(c)).filter(Boolean).slice(0, 4); wl = WATCH.map(c => DB.by.get(c)).filter(s => s && !stocks.includes(s)).slice(0, 4); }
      else stocks = DB.list.filter(s => s.code.toLowerCase().startsWith(q) || s.name.toLowerCase().includes(q))
        .sort((a, b) => (b.code.toLowerCase() === q) - (a.code.toLowerCase() === q) || (b.code.toLowerCase().startsWith(q)) - (a.code.toLowerCase().startsWith(q)) || b.vol - a.vol).slice(0, 8);
      const pages = PAGES.filter(p => !q || p[1].toLowerCase().includes(q) || p[2].toLowerCase().includes(q)).map(p => ({ k: "p:" + p[0], h: row("p:" + p[0], "→", p[1], p[2]) }));
      const QA = [["a:settings", "開啟設定", "⚙"], ["a:ud", "切換漲跌顏色（" + (window.TWSet && window.TWSet.get("ud") === "intl" ? "目前綠漲紅跌" : "目前紅漲綠跌") + "）", "◑"], ["a:top", "回到頂端", "↑"], ["a:install", "加到主畫面（安裝成 App）", "⤓"], ["a:ovl", "自訂總覽版面", "⇅"], ...[["rk", "股票・排行"], ["cp", "股票・比較"], ["sc", "股票・選股"], ["rv", "股票・營收"], ["cm", "股票・疊圖"], ["dv", "股票・除息"]].map(([k, l]) => ["l:" + k, l, "▤"])];
      const quick = QA.filter(a => !q || a[1].toLowerCase().includes(q)).slice(0, q ? 6 : 5).map(a => ({ k: a[0], h: row(a[0], a[2], a[1], "") }));
      const acts = [["t:dark", "深色模式"], ["t:light", "淺色模式"], ["t:system", "外觀跟隨裝置"]].filter(a => !q || a[1].includes(q) || /dark|light|theme|深|淺|外觀/.test(q)).map(a => ({ k: a[0], h: row(a[0], "◐", a[1], T && T.mode === a[0].slice(2) ? "目前" : "") }));
      const sec = (t, arr) => (arr.length ? `<p class="pal-sec">${t}</p>` + arr.map(x => x.h).join("") : "");
      items = [...stocks.map(stk), ...wl.map(stk), ...pages, ...quick, ...(q ? acts : [])];
      list.innerHTML = sec(q ? "股票" : "最近看過", stocks.map(stk)) + sec("自選股", wl.map(stk)) + sec("頁面", pages) + sec("快速動作", quick) + (q ? sec("外觀", acts) : "") || `<p class="pal-empty">找不到「${esc(inp.value)}」。試試代號，例如 2330。</p>`;
      on = clamp(on, 0, Math.max(0, items.length - 1)); mark();
    };
    const mark = () => { $$(".pal-it", list).forEach((b, i) => { b.classList.toggle("on", i === on); b.setAttribute("aria-selected", String(i === on)); }); const b = $$(".pal-it", list)[on]; b && b.scrollIntoView({ block: "nearest" }); };
    const run = k => {
      palClose();
      if (k.startsWith("s:")) openStock(k.slice(2));
      else if (k.startsWith("p:")) open(k.slice(2), true);
      else if (k.startsWith("t:") && T) T.set(k.slice(2));
      else if (k === "a:settings") document.dispatchEvent(new Event("twdash:settings"));
      else if (k === "a:ud") { if (window.TWSet) window.TWSet.set("ud", window.TWSet.get("ud") === "intl" ? "tw" : "intl"); }
      else if (k === "a:top") scrollTo({ top: 0, behavior: "smooth" });
      else if (k === "a:install") document.dispatchEvent(new Event("twdash:install"));
      else if (k === "a:ovl") { open("dpOverview", true); setTimeout(() => document.dispatchEvent(new Event("twdash:overview-edit")), 120); }
      else if (k.startsWith("l:")) { open("dpList", true); setTimeout(() => lstSub(k.slice(2), true), 60); }
    };
    inp.addEventListener("input", () => { on = 0; paint(); });
    inp.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); on = clamp(on + (e.key === "ArrowDown" ? 1 : -1), 0, items.length - 1); mark(); }
      else if (e.key === "Enter") { e.preventDefault(); const b = $$(".pal-it", list)[on]; if (b) run(b.dataset.k); }
      else if (e.key === "Escape") { e.preventDefault(); palClose(); }
    });
    list.addEventListener("pointermove", e => { const b = e.target.closest(".pal-it"); if (!b) return; const i = $$(".pal-it", list).indexOf(b); if (i !== on) { on = i; mark(); } });
    list.addEventListener("click", e => { const b = e.target.closest(".pal-it"); if (b) run(b.dataset.k); });
    pal.addEventListener("pointerdown", e => { if (e.target === pal) palClose(); });
    paint();
    pal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
    $(".pal-box", pal).animate([{ opacity: 0, transform: "translateY(-10px) scale(.97)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "none" }], { duration: 260, easing: "cubic-bezier(.16,1,.3,1)" });
    inp.focus();
  }
  function palClose() {
    if (!pal) return; const el = pal; pal = null;
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120 }).onfinish = () => el.remove();
  }
  document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); pal ? palClose() : palOpen(); } });
  document.addEventListener("twdash:palette", palOpen);
  let help = null;
  function helpToggle() {
    if (help) { const el = help; help = null; el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120 }).onfinish = () => el.remove(); return; }
    help = document.createElement("div"); help.className = "pal"; help.setAttribute("role", "dialog"); help.setAttribute("aria-label", "快捷鍵");
    const K = [["Ctrl", "K"], ["/"], ["1"], ["2"], ["3"], ["↑", "↓"], ["Enter"], ["右鍵"], ["拖曳"], ["滾輪"], ["雙擊"], ["Esc"], ["?"]];
    const T = ["搜尋股票、切換頁面或外觀", "跳到搜尋框", "總覽", "分析", "股票", "在股票清單上下移動", "打開選到的股票", "任何股票：開啟、加自選、複製代號（手機長按）", "K 線：平移（開啟「趨勢線」時改成畫線）", "K 線：縮放", "K 線：還原", "關閉面板或選單", "顯示這張表"];
    help.innerHTML = `<div class="pal-box keys"><div class="pal-in"><b>快捷鍵</b><button type="button" class="key-x" aria-label="關閉"><kbd>Esc</kbd></button></div><div class="pal-list">${K.map((k, i) => `<div class="key-row"><span>${k.map(x => `<kbd>${x}</kbd>`).join(" ")}</span><span>${T[i]}</span></div>`).join("")}</div></div>`;
    document.body.appendChild(help);
    help.addEventListener("pointerdown", e => { if (e.target === help) helpToggle(); });
    $(".key-x", help).addEventListener("click", helpToggle);
    $(".pal-box", help).animate([{ opacity: 0, transform: "translateY(-10px) scale(.97)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "none" }], { duration: 260, easing: "cubic-bezier(.16,1,.3,1)" });
  }
  document.addEventListener("keydown", e => {
    if (help && (e.key === "Escape" || e.key === "Esc")) { e.preventDefault(); helpToggle(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || pal) return;
    const t = e.target; if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "")) return;
    if (e.key === "?") { e.preventDefault(); helpToggle(); return; }
    if (/^[1-3]$/.test(e.key) && !help) { e.preventDefault(); open(PAGES[+e.key - 1][0], true); }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { rtPoll(); pmLoad(); pmLoad(true); clLoad(); } });
  /* "/" jumps to the search box from anywhere: the stock page's own box there, the list's everywhere else */
  document.addEventListener("keydown", e => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || "")) return;
    e.preventDefault();
    if (cur !== "dpStock" && cur !== "dpList") open("dpList", true);
    const inp = cur === "dpStock" ? $("#dpStock .ssearch") : $("#dpList .msearch");
    if (inp) { inp.focus(); inp.select(); }
  });

  /* ---------------- start ---------------- */
  buildOverview(); buildWatch(); buildStock();
  note(); paintIdx(); paintStrip(); paintTable(false); paintWatch(false); paintHead();
  let saved = null; try { saved = sessionStorage.getItem("twdash-tab"); } catch (e) {}
  requestAnimationFrame(() => {
    if (/^#(stock\/[0-9A-Z]{4,6}|\/?dp\w+)$/.test(location.hash)) { navGo(location.hash); try { history.replaceState({ tw: 1, p: cur, code: CODE }, "", navHash()); } catch (e) {} }
    else { navLock = true; open(saved || ((window.TWSet && window.TWSet.get("home")) || "dpOverview"), false); navLock = false; try { history.replaceState({ tw: 1, p: cur, code: CODE }, "", navHash()); } catch (e) {} }
  });
  window.TWDash = { replay: () => open(cur, false),
    /* shared with the 研究室 tab (assets/twlab.js) */
    api: { chartC: () => KV.c, listCodes: () => LISTS[listIdx()].slice(), canSort: () => /^w[1-5]$/.test(VIEW.preset) && VIEW.key === "ord" && !VIEW.q,
      setOrder: codes => { const i = listIdx(); LISTS[i] = codes.slice(); WATCH = LISTS[0]; saveLists(); if (i === 0) { alertSync(); paintTape(); } paintWatch(false); paintTable(false); },
      rowStar: code => { const i = listIdx(), had = LISTS[i].includes(code); toggleWatch(code, i); return !had; }, goBackNow: () => { const b = $("#dpStock .sback"); if (b && !b.hidden) b.click(); return !!(b && !b.hidden); }, whyOf, paintHeat, gpPaint, instLoad, ftLoad, paintStreak, heatGroups, heatTip, heatFocus, segMark, DB, FUND, CHIP, IDX, HIST, calc, sma, histMonth, loadHist, loadFund, loadChip, monthsBack, facts: code => { const h = HIST.get(code); if (!h) return null; const k = CODE; CODE = code; try { return facts(h.cs); } finally { CODE = k; } },
      refresh: () => Promise.all([rtPoll(), pmLoad(), pmLoad(true), clLoad()]).then(() => open(cur, true)),
      rtPoll, quoteNow,
      store, worker: WORKER, openTab: p => open(p, true), lstSub: k => lstSub(k, true), tabNow: () => cur, ixk: () => IXV.k, openStock: code => openStock(code), toast: (code, lv) => { const x = DB.by.get(code); if (x) toast(x, lv); }, code: () => CODE, watch: () => WATCH.slice(), J, num, esc, fmt, signed, pct, tone, dig, wait, rise } };
  document.dispatchEvent(new Event("twdash:ready"));

  (async () => {
    try { await loadList(); } catch (e) { DB.failed = true; setList([], false, ""); }
    note(); paintTable(true); paintStrip(); paintWatch(true); paintHead(); paintHeat(true); paintTape();
    if (cur === "dpStock") setStock(CODE, true);
    loadFlags();
    document.dispatchEvent(new Event("twdash:list"));
    alertSync();
    if (DB.live) {
      loadIdxEod().then(paintIdx, () => {}).then(paintIdx);
      loadMarket().then(() => { paintIdx(); paintStrip(); if (cur === "dpOverview") drawSpark(); setTimeout(loadStreak, 800); }, () => {});
      rtLoop();
    } else paintIdx();
  })();
})();
