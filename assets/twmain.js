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
     working on closing data and says so.
   - If TWSE itself cannot be reached the page shows clearly labelled sample numbers.
   The watchlist stays in this browser and syncs to the account when signed in (assets/twaccount.js). */
(function () {
  "use strict";
  const root = document.getElementById("dash");
  if (!root) return;
  const WORKER = "https://twstock-ai.ta77199ta.workers.dev";
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
  const IDX = [{ k: "t00", name: "加權指數" }, { k: "fut", name: "台指期" }, { k: "t13", name: "電子" }, { k: "t17", name: "金融" }];
  const MKT = { rows: null, inst: null };          /* TAIEX history rows and the institutions of the day */
  let WATCH = store.get("twtrade-watch", DEFAULT_WATCH);
  /* five watchlists 自選1–自選5; 自選1 is WATCH (the 自選股 tab, sidebar, alerts) */
  const WL_SEED = [
    ["6770", "2383", "3260", "4967", "5475", "8358", "3131", "6187", "3583", "2330", "2454", "2317", "2303", "3037", "2515", "1711", "2103", "3231", "2408", "2382", "1301", "6285", "2883", "1314", "2485", "3481", "3017", "1802", "2308", "2449", "2327", "4916", "2367", "5309", "7742"],
    ["2887", "0050", "0056", "00878", "00919", "00929", "006208", "00403A", "0052"]];
  let LISTS = store.get("twtrade-wl", null);
  if (!Array.isArray(LISTS) || LISTS.length !== 5) LISTS = [WATCH.slice(), [], [], [], []];
  let WL_SEEDED = false;
  if (!store.get("twtrade-wl-seed", 0)) { LISTS[0] = WL_SEED[0].slice(); LISTS[1] = WL_SEED[1].slice(); WATCH = LISTS[0]; store.set("twtrade-watch", WATCH); store.set("twtrade-wl", LISTS); store.set("twtrade-wl-seed", 1); WL_SEEDED = true; }
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
  function sampleList() {
    const base = [["2330", "台積電", 1085], ["2317", "鴻海", 215], ["2454", "聯發科", 1385], ["2308", "台達電", 415], ["2412", "中華電", 131], ["2881", "富邦金", 92],
      ["2882", "國泰金", 78], ["2603", "長榮", 225], ["1301", "台塑", 52], ["2891", "中信金", 40], ["0050", "元大台灣50", 190], ["2002", "中鋼", 24], ["3008", "大立光", 2310], ["2303", "聯電", 48]];
    let s = 20261110; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    setList(base.map(([code, name, p]) => {
      const pc = (r() - 0.48) * 6, prev = p / (1 + pc / 100), hi = Math.max(p, prev) * (1 + r() * 0.01), lo = Math.min(p, prev) * (1 - r() * 0.01);
      return { code, name, price: p, prev, chg: p - prev, pct: pc, open: prev * (1 + (r() - 0.5) * 0.01), high: hi, low: lo, vol: Math.round(3000 + r() * 60000) };
    }), false, taipei().ymd);
  }
  /* indices at the close (used until the Worker supplies intraday values) */
  async function loadIdxEod() {
    const a = await J("https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX");
    const want = { t00: /^發行量加權股價指數$/, t13: /^電子(工業)?類指數$/, t17: /^金融保險類指數$/ };
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
  function sampleHist(s) {
    let seed = 7; for (const c of s.code) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const out = [], d = new Date(); const days = [];
    while (days.length < 130) { if (d.getDay() % 6) days.unshift(d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0")); d.setDate(d.getDate() - 1); }
    let p = s.price * (0.82 + r() * 0.2);
    days.forEach((ds, i) => {
      const o = p, c = i === days.length - 1 ? s.price : o * (1 + (r() - 0.48) * 0.04 + (s.price - o) / o * 0.04);
      out.push([ds, o, Math.max(o, c) * (1 + r() * 0.012), Math.min(o, c) * (1 - r() * 0.012), c, Math.round(s.vol * (0.5 + r()))]); p = c;
    });
    return out;
  }
  const HIST = new Map();                          /* code → { cs, full } */
  async function loadHist(code, onMore) {
    const hit = HIST.get(code);
    if (hit) return hit.cs;
    const s = DB.by.get(code);
    if (!DB.live) { const cs = s ? sampleHist(s) : null; if (cs) HIST.set(code, { cs, full: true }); return cs; }
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
  const FUND = { map: null, busy: null };
  function loadFund() {
    if (FUND.map || !DB.live) return Promise.resolve();
    if (FUND.busy) return FUND.busy;
    FUND.busy = (async () => {
      const m = new Map();
      try { (await J("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL")).forEach(x => m.set(String(x.Code), { pe: num(x.PEratio), yld: num(x.DividendYield), pb: num(x.PBratio) })); } catch (e) {}
      try {
        (await J("https://openapi.twse.com.tw/v1/opendata/t187ap05_L")).forEach(x => {
          const c = String(pick(x, "公司代號") || ""), o = m.get(c) || {};
          o.rev = num(pick(x, "當月營收")) / 1e5; o.yoy = num(pick(x, "去年同月增減")); o.ym = String(pick(x, "資料年月") || "");
          if (c) m.set(c, o);
        });
      } catch (e) {}
      FUND.map = m; FUND.busy = null;
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
  let rtTimer = 0, rtBusy = false, rtFailAt = 0;
  function rtCodes() {
    if (cur === "dpWatch") return WATCH.slice(0, 80);
    if (cur === "dpStock") return [CODE];
    return $$("#dpList .mtbl tbody tr[data-code]").slice(0, 70).map(r => r.dataset.code);
  }
  async function rtPoll() {
    if (rtBusy || !DB.live || document.hidden) return;
    if (DB.rt === false && Date.now() - rtFailAt < 300000) return;
    rtBusy = true;
    try {
      const codes = rtCodes(), wantIdx = cur === "dpOverview" || !IDX[0].rt;
      const j = await J(`${WORKER}/tw/rt?c=${codes.join(",")}${wantIdx ? "&idx=1" : ""}`);
      let any = false;
      (j.q || []).forEach(x => {
        const s = DB.by.get(x.c); if (!s || !(x.z > 0) || !(x.y > 0)) return;
        any = true;
        s.flash = x.z > s.price ? "up" : x.z < s.price ? "down" : "";
        s.price = x.z; s.prev = x.y; s.chg = x.z - x.y; s.pct = (x.z / x.y - 1) * 100;
        if (x.o > 0) s.open = x.o; if (x.h > 0) s.high = x.h; if (x.l > 0) s.low = x.l; if (ok(x.v)) s.vol = x.v;
        s.tm = x.tm; s.day = x.d; s.rt = true;
      });
      (j.idx || []).forEach(x => {
        const it = IDX.find(i => i.k === x.c); if (!it || !(x.z > 0)) return;
        any = true; Object.assign(it, { z: x.z, y: x.y, h: x.h, l: x.l, tm: x.tm, src: marketOpen() ? "盤中" : "收盤", rt: true });
      });
      if (j.fut && j.fut.z > 0) { any = true; Object.assign(IDX[1], { z: j.fut.z, y: j.fut.y, h: j.fut.h, l: j.fut.l, tm: j.fut.tm, src: j.fut.src === "night" ? "夜盤" : j.fut.src === "rt" ? "盤中" : (j.fut.sess || "") + "收盤", rt: true, label: j.fut.n }); }
      DB.rtSrc = j.src || "mis";
      if (any) { DB.rt = true; DB.rtAt = new Date().toLocaleTimeString("zh-TW", { hour12: false }); paintLive(); }
      else if (DB.rt == null) DB.rt = false;
    } catch (e) { DB.rt = false; rtFailAt = Date.now(); }
    rtBusy = false; note();
  }
  function rtLoop() {
    clearTimeout(rtTimer);
    rtPoll().then(() => { rtTimer = setTimeout(rtLoop, marketOpen() || nightOpen() ? 5000 : 120000); });
  }

  /* ---------------- banner ---------------- */
  function note() {
    const el = $(".dash-note"); if (!el) return;
    if (!DB.list.length) { el.innerHTML = `<b>載入中</b>正在讀取證交所公開資料…`; return; }
    if (!DB.live) { el.innerHTML = `<b>示意資料</b>目前連不到證交所，以下數字是示意，不代表真實行情。`; return; }
    if (DB.rt) el.innerHTML = `<b class="live">即時</b>${esc(DB.rtAt)} 更新${DB.rtSrc === "yahoo" ? "・來源 Yahoo，可能延遲" : ""}${marketOpen() ? "・每 5 秒更新" : nightOpen() ? "・股票已收盤，台指期夜盤更新中" : "・非交易時段"}`;
    else el.innerHTML = `<b>收盤</b>${slash(DB.date)} 收盤資料${DB.rt === false ? "（即時報價暫時連不上）" : ""}`;
  }

  /* ---------------- 總覽 ---------------- */
  const PRESETS = [["w1", "自選1"], ["w2", "自選2"], ["w3", "自選3"], ["w4", "自選4"], ["w5", "自選5"], ["strong", "強勢股"], ["weak", "弱勢股"]];
  const COLS = [["price", "成交價"], ["chg", "漲跌"], ["pct", "漲跌幅"], ["vol", "成交量"]];
  function buildOverview() {
    $("#dpOverview").innerHTML = `
      <div class="ixgrid">${IDX.map(i => `<div class="dcard ixcard" data-k="${i.k}" role="button" tabindex="0" aria-expanded="false"><h3><span class="ixn">${i.name}</span><span class="ixsrc"></span></h3>
        <div class="big">—</div><div class="sub ixchg">載入中…</div><div class="sub ixhl"></div><svg class="spark" viewBox="0 0 76 28" preserveAspectRatio="none" aria-hidden="true"><line class="spbase" x1="0" x2="76"/><path/></svg></div>`).join("")}</div>
      <div class="dcard ixdetail" hidden></div>
      <div class="dcard pm"><div class="aihead"><div><h3>AI 盤前分析</h3></div>
        <button type="button" class="btn pmgo">分析</button></div><div class="pmout"><p class="sub">載入中…</p></div><p class="sub pmalert" hidden></p></div>
      <div class="dcard mstrip"></div>
      <div class="board">
        <div class="dcard bd-dist"><div class="bd-h"><h3>漲跌分布</h3><span class="sub bd-n"></span></div><div class="bd-bars"></div></div>
        <div class="dcard bd-up"><div class="bd-h"><h3>漲幅排行</h3></div><div class="bd-list"></div></div>
        <div class="dcard bd-down"><div class="bd-h"><h3>跌幅排行</h3></div><div class="bd-list"></div></div>
      </div>
      <div class="dcard mkt">
        <div class="mbar"><input class="msearch msfull" type="search" placeholder="搜尋代號或名稱" aria-label="搜尋股票" autocomplete="off">
          <div class="chips">${PRESETS.map(([k, t]) => `<button type="button" class="chip" data-preset="${k}" aria-pressed="${k === VIEW.preset}">${t}</button>`).join("")}</div>
          <span class="sub mcount"></span></div>
        <div class="mwrap"><table class="mtbl ttbl mktab"><thead><tr><th class="l">商品</th>${COLS.map(([k, t]) => `<th class="sort" data-key="${k}">${t}<i></i></th>`).join("")}<th aria-label="自選"></th></tr></thead><tbody></tbody></table></div>
        <button type="button" class="mmore" hidden>顯示更多</button>
      </div>`;
    const box = $("#dpOverview");
    $(".msearch", box).addEventListener("input", e => { VIEW.q = e.target.value.trim(); VIEW.shown = 50; paintTable(true); });
    root.addEventListener("click", e => {
      if (!e.target.closest("#dpOverview, #dpPre, #dpList")) return;
      const p = e.target.closest("[data-preset]");
      if (p) {
        VIEW.q = ""; $("#dpList .msearch").value = "";
        VIEW.preset = p.dataset.preset; VIEW.shown = 50;
        const o = { all: ["vol", -1], w1: ["ord", 1], w2: ["ord", 1], w3: ["ord", 1], w4: ["ord", 1], w5: ["ord", 1], strong: ["pct", -1], weak: ["pct", 1], volume: ["vol", -1] }[VIEW.preset];
        VIEW.key = o[0]; VIEW.dir = o[1]; paintTable(true); return;
      }
      const th = e.target.closest("th.sort");
      if (th) { const k = th.dataset.key; if (VIEW.key === k) VIEW.dir *= -1; else { VIEW.key = k; VIEW.dir = -1; } paintTable(true); return; }
      if (e.target.closest(".mmore")) { VIEW.shown += 100; paintTable(false); return; }
      const st = e.target.closest(".wlbtn");
      if (st) { if (st.classList.contains("wladd")) wlMenu(st); else toggleWatch(st.dataset.code, listIdx()); return; }
      const tr = e.target.closest("tr[data-code]");
      if (tr) openStock(tr.dataset.code, tr);
      if (e.target.closest(".pmgo")) pmRun(e.target.closest(".pmgo"));
      const pk = e.target.closest("[data-pick]"); if (pk) { openStock(pk.dataset.pick, pk); return; }
      const gt = e.target.closest("[data-goto]"); if (gt) { open(gt.dataset.goto, true); return; }
      const bd = e.target.closest(".bd-row, .bd-tile"); if (bd) { openStock(bd.dataset.code, bd); return; }
      const xc = e.target.closest(".ixcard"); if (xc) { ixOpen(xc.dataset.k); return; }
      const xr = e.target.closest("[data-ixr]"); if (xr) { IXV.r = xr.dataset.ixr; ixPaint(true); return; }
      if (e.target.closest(".ixclose")) { ixOpen(IXV.k); return; }
    });
    /* the pre-market note and the stock list each have their own tab */
    $("#dpPre").appendChild($(".pm", box)); $("#dpList").appendChild($(".mkt", box));
    pmLoad(); setTimeout(alertSync, 2500); loadCharts(true);
    box.addEventListener("keydown", e => { const xc = e.target.closest && e.target.closest(".ixcard"); if (xc && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); ixOpen(xc.dataset.k); } });
  }
  function rowsNow() {
    const q = VIEW.q.toLowerCase();
    let rows = DB.list;
    const L = /^w[1-5]$/.test(VIEW.preset) ? LISTS[listIdx()] : null;
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
    return `<tr data-code="${esc(s.code)}" tabindex="0"><td class="l nm"><b>${esc(s.name)}</b><span>${esc(s.code)}${s.mkt === "otc" ? " 櫃" : s.mkt === "esb" ? " 興櫃" : ""}</span></td>
      <td><span class="pxpill ${t}">${fmt(s.price, d)}</span></td><td class="${t}">${arrow(s.chg)}${fmt(Math.abs(s.chg), d)}</td><td class="${t} pctc" style="--w:${ok(s.pct) ? Math.min(Math.abs(s.pct) / 10, 1).toFixed(3) : 0}">${pct(s.pct)}</td>
      <td class="vol">${fmt(s.vol)}</td><td>${wlBtn(s)}</td></tr>`;
  };
  /* inside 自選1–5: ＋ adds a searched stock to that list, − takes one out */
  const wlBtn = s => {
    if (VIEW.q) { const has = LISTS.some(l => l.includes(s.code)); return `<button type="button" class="wlbtn wladd${has ? " in" : ""}" data-code="${esc(s.code)}" aria-label="加入自選 ${esc(s.name)}">＋</button>`; }
    if (!/^w[1-5]$/.test(VIEW.preset)) return "";
    const n = listIdx() + 1, inL = LISTS[n - 1].includes(s.code);
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
  function paintTable(animate) {
    const box = $("#dpList"); if (!$(".mtbl", box)) return;
    const rows = rowsNow(), show = rows.slice(0, VIEW.shown);
    $(".mtbl tbody", box).innerHTML = show.map(rowHTML).join("") ||
      `<tr><td class="mempty" colspan="6">${/^w[1-5]$/.test(VIEW.preset) && !VIEW.q ? `自選${listIdx() + 1} 還沒有股票。`  : DB.list.length ? "找不到符合的股票。" : "載入中…"}</td></tr>`;
    $(".mmore", box).hidden = rows.length <= VIEW.shown;
    $(".mcount", box).textContent = DB.list.length ? `${fmt(rows.length)} 檔${VIEW.preset === "strong" || VIEW.preset === "weak" ? "（成交量 500 張以上）" : ""}` : "";
    $$("[data-preset]", box).forEach(b => b.setAttribute("aria-pressed", String(!VIEW.q && b.dataset.preset === VIEW.preset)));
    $$("th.sort", box).forEach(th => { th.dataset.dir = th.dataset.key === VIEW.key ? (VIEW.dir < 0 ? "desc" : "asc") : ""; });
    if (animate && box.classList.contains("on")) rise($$(".mtbl tbody tr", box).slice(0, 24), 18);
    if (animate) rtPoll();
  }
  function paintIdx() {
    IDX.forEach(i => {
      const c = $(`.ixcard[data-k="${i.k}"]`); if (!c) return;
      const d = ok(i.z) && ok(i.y) ? i.z - i.y : NaN, t = tone(d), big = $(".big", c);
      if (i.label) $(".ixn", c).textContent = i.name + "（" + i.label.replace(/^臺指期\s*/, "") + "）";
      $(".ixsrc", c).textContent = i.src ? i.src + (i.tm ? " " + i.tm.slice(0, 5) : "") : "";
      big.textContent = ok(i.z) ? fmt(i.z, 2) : "—"; big.className = "big " + t;
      $(".ixchg", c).textContent = ok(d) ? `${arrow(d)} ${fmt(Math.abs(d), 2)}（${pct(d / i.y * 100)}）` : (i.k === "fut" && DB.rt === false ? "需要部署新版 Worker" : DB.list.length ? "讀不到資料" : "載入中…");
      $(".ixchg", c).className = "sub ixchg " + t;
      $(".ixhl", c).textContent = i.h > 0 && i.l > 0 ? `高 ${fmt(i.h, 2)}　低 ${fmt(i.l, 2)}` : "";
    });
    paintSparks();
  }
  function paintStrip() {
    try { paintBoard(); } catch (e) {}
    const el = $("#dpOverview .mstrip"); if (!el) return;
    const last = MKT.rows && MKT.rows[MKT.rows.length - 1], prev = MKT.rows && MKT.rows[MKT.rows.length - 2], I = MKT.inst;
    let up = 0, down = 0, flat = 0; DB.list.forEach(s => { if (s.chg > 0) up++; else if (s.chg < 0) down++; else flat++; });
    const cell = (k, v, c, sub) => `<div class="mcell"><span>${k}</span><b class="${c || ""}">${v}</b>${sub ? `<i>${sub}</i>` : ""}</div>`;
    el.innerHTML = [
      cell("成交金額（億）", last ? fmt(last[2]) : "—", "", last && prev ? `較前日 ${pct((last[2] / prev[2] - 1) * 100)}` : (last ? "" : "")),
      cell("外資（億）", I ? signed(I.f, 1) : "—", I ? tone(I.f) : "", I && last && I.date !== last[0] ? shortDay(I.date) : ""),
      cell("投信（億）", I ? signed(I.t, 1) : "—", I ? tone(I.t) : ""),
      cell("自營商（億）", I ? signed(I.d, 1) : "—", I ? tone(I.d) : ""),
      cell("上漲 / 下跌 / 平盤", DB.list.length ? `<em class="up">${fmt(up)}</em><s>/</s><em class="down">${fmt(down)}</em><s>/</s>${fmt(flat)}` : "—", "brd", DB.live ? "含 ETF" : "示意"),
    ].join("");
    const bc = el.lastElementChild;
    if (bc && DB.list.length) bc.insertAdjacentHTML("beforeend", breadthBar(up, flat, down));
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
        <td><span class="pxpill ${t}">${fmt(s.price, d)}</span></td><td class="${t}">${arrow(s.chg)}${fmt(Math.abs(s.chg), d)}</td><td class="${t} pctc" style="--w:${ok(s.pct) ? Math.min(Math.abs(s.pct) / 10, 1).toFixed(3) : 0}">${pct(s.pct)}</td>
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
  function saveLists() {
    store.set("twtrade-watch", WATCH); store.set("twtrade-wl", LISTS);
    try { window.TWAccount && TWAccount.saveWatchlist(WATCH, LISTS.slice(1)).catch(() => {}); } catch (e) {}
  }
  function toggleWatch(code, i) {
    i = i || 0;
    const L = LISTS[i];
    LISTS[i] = L.includes(code) ? L.filter(c => c !== code) : L.concat(code);
    WATCH = LISTS[0];
    saveLists();
    if (i === 0) alertSync();
    paintWatch(false);
    if (VIEW.q || /^w[1-5]$/.test(VIEW.preset)) paintTable(false);
  }
  async function pullWatch() {
    try {
      if (!window.TWAccount || !TWAccount.account()) return;
      if (WL_SEEDED) { WL_SEEDED = false; await TWAccount.saveWatchlist(WATCH, LISTS.slice(1)); }
      const sym = await TWAccount.loadWatchlist(), ex = TWAccount.watchExtra ? TWAccount.watchExtra() : null;
      let ch = false;
      if (sym && sym.length && JSON.stringify(sym) !== JSON.stringify(WATCH)) { WATCH = LISTS[0] = sym; ch = true; }
      if (Array.isArray(ex) && ex.length === 4 && JSON.stringify(ex) !== JSON.stringify(LISTS.slice(1))) { ex.forEach((l, j) => { LISTS[j + 1] = Array.isArray(l) ? l : []; }); ch = true; }
      if (ch) { store.set("twtrade-watch", WATCH); store.set("twtrade-wl", LISTS); paintWatch(false); paintTable(false); }
      alertSync();
    } catch (e) {}
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
  function chartSVG(all, span) {
    const I = calc(all), off = Math.max(0, all.length - span), cs = all.slice(off), N = cs.length;
    const W = 720, PL = 8, PR = 54, gap = 14;
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
    const sl = a => a.slice(off);
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
        p.Y = Y;
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
    const cross = add("line", { x1: 0, x2: 0, y1: 8, y2: H - 14 }, "cross"); cross.style.opacity = 0;
    const at = i => {
      const j = off + i, c = cs[i], d = dig(c[4]), v = x => (x == null ? "—" : fmt(x, d));
      return `${slash(c[0])}　開 ${fmt(c[1], d)}　高 ${fmt(c[2], d)}　低 ${fmt(c[3], d)}　收 ${fmt(c[4], d)}　量 ${fmt(c[5])} 張` +
        (IND.ma ? `　MA5 ${v(I.ma5[j])}　MA20 ${v(I.ma20[j])}　MA60 ${v(I.ma60[j])}` : "") +
        (IND.kd ? `　K ${fmt(I.K[j], 1)}　D ${fmt(I.D[j], 1)}` : "") + (IND.rsi && I.rsi[j] != null ? `　RSI ${fmt(I.rsi[j], 1)}` : "") +
        (IND.macd ? `　DIF ${fmt(I.dif[j], 2)}　MACD ${fmt(I.dea[j], 2)}` : "");
    };
    const hit = e => { const r = svg.getBoundingClientRect(); return clamp(Math.round(((e.clientX - r.left) / r.width * W - PL) / (W - PL - PR) * N - 0.5), 0, N - 1); };
    return { svg, N, read: at, hit, mark(i) { cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.style.opacity = 1; }, unmark() { cross.style.opacity = 0; } };
  }

  /* ---------------- 個股分析 ---------------- */
  const INDS = [["ma", "均線"], ["boll", "布林通道"], ["vol", "成交量"], ["kd", "KD"], ["macd", "MACD"], ["rsi", "RSI"]];
  function buildStock() {
    $("#dpStock").innerHTML = `
      <div class="dcard shead">
        <div class="sfind"><button type="button" class="sback" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg><span></span></button><input class="ssearch" type="search" placeholder="輸入代號或名稱換一檔" aria-label="搜尋股票" autocomplete="off"><div class="ssug" hidden></div></div>
        <div class="stitle"><h2></h2></div>
        <div class="spx"><span class="big">—</span><span class="schg"></span><span class="sub stime"></span></div>
        <div class="sohlc"></div>
      </div>
      <div class="dcard schart">
        <div class="chips"><span class="clab">區間</span>${[[60, "60 日"], [120, "120 日"]].map(([n, t]) => `<button type="button" class="chip" data-span="${n}">${t}</button>`).join("")}
          <span class="clab">指標</span>${INDS.map(([k, t]) => `<button type="button" class="chip" data-ind="${k}">${t}</button>`).join("")}</div>
        <div class="cbox"><p class="mempty">載入中…</p></div>
        <p class="sub cread"></p>
        <p class="sub clegend">紅漲綠跌；均線：<i class="lg ma5"></i>MA5 <i class="lg ma20"></i>MA20 <i class="lg ma60"></i>MA60</p>
      </div>
      <div class="sgrid">
        <div class="dcard ssnap"><h3>技術面快照</h3><div class="snaplist"><p class="sub">載入中…</p></div></div>
        <div class="dcard sfund"><h3>基本面與籌碼</h3><div class="fundlist"><p class="sub">載入中…</p></div></div>
        <div class="dcard snews"><h3>新聞與公告</h3><div class="newslist"><p class="sub">載入中…</p></div></div>
      </div>
      <div class="dcard sai">
        <div class="aihead"><div><h3>AI 分析團隊</h3></div>
          <button type="button" class="aigo">開始分析</button></div>
        <p class="sub aimsg"></p><div class="aiout"></div>
        
        <details class="slab"><summary>研究工具（自動交給 AI）</summary><div id="dpLab" class="on"></div></details>
      </div>`;
    const box = $("#dpStock"), inp = $(".ssearch", box), sug = $(".ssug", box);
    inp.addEventListener("input", () => {
      const q = inp.value.trim().toLowerCase();
      const hits = q ? DB.list.filter(s => s.code.toLowerCase().startsWith(q) || s.name.toLowerCase().includes(q)).slice(0, 8) : [];
      sug.hidden = !hits.length;
      sug.innerHTML = hits.map(s => `<button type="button" data-code="${esc(s.code)}"><b>${esc(s.name)}</b><span>${esc(s.code)}</span><em class="${tone(s.chg)}">${fmt(s.price, dig(s.price))}</em></button>`).join("");
    });
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { const b = $("button", sug); if (b) b.click(); } });
    box.addEventListener("click", e => {
      if (e.target.closest("#dpLab")) return;                 /* the research tools handle their own clicks */
      const s = e.target.closest(".ssug button"); if (s) { inp.value = ""; sug.hidden = true; setStock(s.dataset.code, true); navPush(); return; }
      if (e.target.closest(".sback")) { goBack(); return; }
      const sp = e.target.closest("[data-span]"); if (sp) { SPAN = +sp.dataset.span; store.set("twmain-span", SPAN); drawChart(true); return; }
      const ind = e.target.closest("[data-ind]"); if (ind) { IND[ind.dataset.ind] = !IND[ind.dataset.ind]; store.set("twmain-ind", IND); drawChart(true); return; }
      if (e.target.closest(".aigo")) analyze();
    });
  }
  function paintHead() {
    const box = $("#dpStock"), s = DB.by.get(CODE); if (!$(".shead", box)) return;
    $(".stitle h2", box).innerHTML = s ? `${esc(s.name)} <span>${esc(s.code)}</span>` : esc(CODE);
    if (!s) { $(".spx .big", box).textContent = "—"; $(".schg", box).textContent = DB.list.length ? "找不到這檔上市股票" : ""; $(".sohlc", box).innerHTML = ""; return; }
    const d = dig(s.price), t = tone(s.chg);
    $(".spx .big", box).textContent = fmt(s.price, d); $(".spx .big", box).className = "big " + t;
    $(".schg", box).textContent = `${arrow(s.chg)} ${fmt(Math.abs(s.chg), d)}（${pct(s.pct)}）`; $(".schg", box).className = "schg " + t;
    $(".stime", box).textContent = s.rt ? `盤中 ${s.tm || ""}` : DB.live ? `收盤 ${slash(DB.date)}` : "示意資料";
    $(".sohlc", box).innerHTML = [["開", fmt(s.open, d)], ["高", fmt(s.high, d)], ["低", fmt(s.low, d)], ["昨收", fmt(s.prev, d)], ["量（張）", fmt(s.vol)]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
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
  function drawChart(animate) {
    const box = $("#dpStock"), host = $(".cbox", box), read = $(".cread", box), cs = barsOf(CODE);
    $$("[data-span]", box).forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.span === SPAN)));
    $$("[data-ind]", box).forEach(b => b.setAttribute("aria-pressed", String(!!IND[b.dataset.ind])));
    $(".clegend", box).hidden = !IND.ma;
    if (!cs) return;
    const c = chartSVG(cs, SPAN);
    host.replaceChildren(c.svg);
    const idle = () => { read.textContent = c.read(c.N - 1); c.unmark(); };
    idle();
    const move = e => { const i = c.hit(e); c.mark(i); read.textContent = c.read(i); };
    c.svg.addEventListener("pointermove", move); c.svg.addEventListener("pointerdown", move); c.svg.addEventListener("pointerleave", idle);
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
    row("報酬", `5 日 ${pct(F.return5dPct)}　20 日 ${pct(F.return20dPct)}${ok(F.return60dPct) ? "　60 日 " + pct(F.return60dPct) : ""}`, "");
    el.innerHTML = rows.join("");
  }
  function paintFund() {
    const el = $("#dpStock .fundlist"); if (!el) return;
    if (!DB.live) { el.innerHTML = `<p class="sub">示意資料模式下沒有基本面與籌碼資料。</p>`; return; }
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
      const html = newsHTML(j.news, j.ann) || `<p class="sub">近兩週沒有找到相關新聞或公告。</p>`;
      NEWS.set(code, html); if (code === CODE) el.innerHTML = html;
    } catch (e) { if (code === CODE) el.innerHTML = `<p class="sub">新聞需要部署新版 Worker 後才會出現。</p>`; }
  }
  async function setStock(code, animate) {
    CODE = code; store.set("twmain-code", CODE);
    const box = $("#dpStock"), tok = ++chartTok;
    paintHead();
    $(".cbox", box).innerHTML = `<p class="mempty">載入中…</p>`; $(".cread", box).textContent = "";
    $(".snaplist", box).innerHTML = `<p class="sub">載入中…</p>`;
    paintAI();
    if (!DB.list.length) return;
    if (!DB.by.get(code)) { $(".cbox", box).innerHTML = `<p class="mempty">找不到這檔上市股票，請用上面的搜尋換一檔。</p>`; $(".snaplist", box).innerHTML = ""; return; }
    rtPoll();
    paintFund(); loadFund().then(() => { if (tok === chartTok) { paintFund(); } });
    loadChip().then(() => { if (tok === chartTok) paintFund(); });
    loadNews(code);
    const cs = await loadHist(code, () => { if (tok === chartTok) drawChart(false); });
    if (tok !== chartTok) return;
    if (!cs) { $(".cbox", box).innerHTML = `<p class="mempty">這檔的歷史資料暫時讀不到，請稍後再試。</p>`; $(".snaplist", box).innerHTML = `<p class="sub">沒有歷史資料。</p>`; return; }
    drawChart(animate !== false);
  }
  /* opening a stock from a row or a card: the header grows out of the thing that was tapped */
  /* browser back / forward: every tab and every stock opened is a history entry (#dpList, #stock/2454) */
  let navLock = false;
  const navHash = () => (cur === "dpStock" ? "#stock/" + CODE : "#" + (cur || "dpOverview"));
  function navPush() {
    if (navLock || !cur) return;
    const h = navHash(); if (location.hash === h) return;
    try { history[history.state && history.state.tw ? "pushState" : "replaceState"]({ tw: 1, p: cur, code: CODE }, "", h); } catch (e) {}
  }
  function navGo(h) {
    const m = /^#stock\/([0-9A-Z]{4,6})$/.exec(h || ""), p = m ? "dpStock" : (h || "").slice(1).replace(/^dpWatch$/, "dpList");
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
    });
  }
  function goBack() { const bk = BACK; if (!bk) return; open(bk.tab, true); backTo(bk); }
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
      let tk = null; try { tk = window.TWAccount && TWAccount.token ? await TWAccount.token() : null; } catch (e) {}
      if (!tk) { if (el) el.textContent = "盤中警示：登入後才會監控你的股票。"; return; }
      const hold = (store.get("twlab-hold", []) || []).map(h => h.code);
      try {
        const r = await fetch(WORKER + "/tw/alerts/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: tk, watch: WATCH, hold }) });
        const j = await r.json().catch(() => ({}));
        if (el) el.textContent = j.ok ? `盤中警示：監控大盤、台指期與 ${j.n} 檔股票，有大漲跌或重大消息會傳 Telegram。`
          : j.owner === false ? "盤中警示只監控擁有者帳號的股票。" : "盤中警示：同步失敗。";
      } catch (e) { if (el) el.textContent = "盤中警示：同步失敗。"; }
    }, 1500);
  }
  document.addEventListener("twlab:hold", alertSync);



  /* ---------------- overview board: distribution, movers, volume, watchlist heat map, pre-market summary ---------------- */
  let PMN = null, boardSig = "";
  function paintBoard() {
    const box = $("#dpOverview .board"); if (!box || !DB.list.length) return;
    const live = DB.list.filter(s => ok(s.price) && s.price > 0 && ok(s.pct)), liq = live.filter(s => s.vol >= 500 && s.mkt !== "esb");
    const sig = live.length + ":" + live.reduce((a, s) => a + s.pct, 0).toFixed(1) + ":" + (PMN ? PMN.at : 0) + ":" + WATCH.join();
    const first = !boardSig; if (sig === boardSig) return; boardSig = sig;
    /* distribution: ≤-9, -9..-6, -6..-3, -3..0, 0, 0..3, 3..6, 6..9, ≥9 */
    const B = [["跌停", p => p <= -9.4, "down"], ["-9~-6", p => p > -9.4 && p <= -6, "down"], ["-6~-3", p => p > -6 && p <= -3, "down"], ["-3~0", p => p > -3 && p < 0, "down"], ["平", p => p === 0, ""],
      ["0~3", p => p > 0 && p < 3, "up"], ["3~6", p => p >= 3 && p < 6, "up"], ["6~9", p => p >= 6 && p < 9.4, "up"], ["漲停", p => p >= 9.4, "up"]];
    const cnt = B.map(b => live.filter(s => b[1](s.pct)).length), mx = Math.max(1, ...cnt);
    $(".bd-n", box).textContent = `${fmt(live.length)} 檔`;
    $(".bd-bars", box).innerHTML = B.map((b, i) => `<div class="bd-col"><span class="bd-c">${fmt(cnt[i])}</span><i class="bd-b ${b[2]}" style="--h:${(cnt[i] / mx * 100).toFixed(1)}%"></i><span class="bd-l">${b[0]}</span></div>`).join("");
    const row = (s, v, t) => `<button type="button" class="bd-row" data-code="${esc(s.code)}"><span class="bd-nm"><b>${esc(s.name)}</b><i>${esc(s.code)}</i></span><span class="bd-px">${fmt(s.price, dig(s.price))}</span><span class="bd-v ${t}">${v}</span></button>`;
    const up = liq.slice().sort((a, b) => b.pct - a.pct).slice(0, 8), dn = liq.slice().sort((a, b) => a.pct - b.pct).slice(0, 8), vol = live.slice().sort((a, b) => b.vol - a.vol).slice(0, 8), vmx = vol.length ? vol[0].vol : 1;
    $(".bd-up .bd-list", box).innerHTML = up.map(s => row(s, pct(s.pct), "up")).join("");
    $(".bd-down .bd-list", box).innerHTML = dn.map(s => row(s, pct(s.pct), "down")).join("");
    ($(".bd-vol .bd-list", box) || {}).innerHTML = vol.map(s => `<button type="button" class="bd-row bd-vrow" data-code="${esc(s.code)}" style="--w:${(s.vol / vmx * 100).toFixed(1)}%"><span class="bd-nm"><b>${esc(s.name)}</b><i>${esc(s.code)}</i></span><span class="bd-px ${tone(s.chg)}">${pct(s.pct)}</span><span class="bd-v">${fmt(s.vol)}</span></button>`).join("");
    const a = PMN && PMN.analysis;
    ($(".bd-pmout", box) || {}).innerHTML = a ? `<div class="bd-call"><span class="aitag ${/高/.test(a.call) ? "up" : /低/.test(a.call) ? "down" : ""}">${esc(a.call)}</span><span class="sub">預測 ${esc(String(PMN.day).slice(5).replace("-", "/"))} 開盤・${esc(a.gap || "")}</span>${a.close && a.close.call ? `<span class="aitag ${/紅/.test(a.close.call) ? "up" : /黑/.test(a.close.call) ? "down" : ""}">${esc(a.close.call)}</span><span class="sub">收盤 ${esc(a.close.range || "")}</span>` : ""}</div><p class="bd-head">${esc(a.headline || "")}</p>
      ${Array.isArray(a.picks) && a.picks.length ? `<div class="bd-picks">${a.picks.slice(0, 8).map(x => `<button type="button" class="bd-row" data-code="${esc(x.code)}"><span class="bd-nm"><b>${esc(x.name)}</b><i>${esc(x.code)}</i></span><span class="bd-px">${esc(x.tag || "")}</span><span class="bd-v ${/買|續抱/.test(x.action || "") ? "up" : /賣|減/.test(x.action || "") ? "down" : ""}">${esc(x.action || "")}</span></button>`).join("")}</div>` : ""}<div class="bd-ch">${["開高", "平盤", "開低"].map(k => `<div><span>${k}</span><b class="${k === "開高" ? "up" : k === "開低" ? "down" : ""}">${esc((a.chances || {})[k] || "—")}</b></div>`).join("")}</div>` : `<p class="sub">05:30 自動產生。</p>`;
    if (first || cur === "dpOverview") boardIn(box, first);
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
  const sessOpen = k => (k === "fut" ? marketOpen() || nightOpen() : marketOpen());
  async function loadChart(k, r) {
    const j = await J(`${WORKER}/tw/chart?k=${k}&r=${r}`);
    if (j && Array.isArray(j.pts)) CH[k + ":" + r] = j;
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
      const svg = $(`.ixcard[data-k="${i.k}"] .spark`), d = CH[i.k + ":tick"]; if (!svg || !d || d.pts.length < 2) return;
      const ys = d.pts.map(p => p[1]), base = ok(d.prev) ? d.prev : ys[0], lo = Math.min(base, ...ys), hi = Math.max(base, ...ys), span = hi - lo || 1, n = ys.length - 1;
      const Y = v => (26 - (v - lo) / span * 24).toFixed(1);
      $("path", svg).setAttribute("d", ys.map((y, k) => `${k ? "L" : "M"}${(k / n * 76).toFixed(1)},${Y(y)}`).join(""));
      const b = $(".spbase", svg); b.setAttribute("y1", Y(base)); b.setAttribute("y2", Y(base));
      svg.setAttribute("class", "spark " + (ys[n] >= base ? "up" : "down"));
    });
  }
  function ixOpen(k) {
    const panel = $("#dpOverview .ixdetail");
    $$(".ixcard").forEach(c => c.setAttribute("aria-expanded", "false"));
    if (IXV.k === k && !panel.hidden) { panel.hidden = true; IXV.k = null; return; }
    IXV.k = k; IXV.r = "tick"; panel.hidden = false;
    $(`.ixcard[data-k="${k}"]`).setAttribute("aria-expanded", "true");
    ixPaint(true);
    panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  async function ixPaint(animate) {
    const panel = $("#dpOverview .ixdetail"), k = IXV.k, r = IXV.r; if (!k || panel.hidden) return;
    const it = IDX.find(i => i.k === k), key = k + ":" + (r === "tick" ? "tick" : "day");
    if (!CH[key] || (r !== "tick" && !CH[key].pts.length)) { panel.innerHTML = `<p class="sub">載入走勢…</p>`; try { await loadChart(k, r === "tick" ? "tick" : "day"); } catch (e) { panel.innerHTML = `<p class="sub">走勢暫時讀不到，請稍後再試。</p>`; return; } }
    if (IXV.k !== k || IXV.r !== r) return;
    const d = CH[key], pts = r === "tick" ? d.pts : d.pts.slice(r === "3mo" ? -66 : -250);
    const z = ok(it.z) ? it.z : d.last, y = ok(it.y) ? it.y : d.prev, ch = z - y, t = tone(ch), dg = 2;
    const sessName = k === "fut" ? (nightOpen() || (taipei().mins < 525) ? "夜盤（15:00 起）" : "日盤（08:45 起）") : "當日（09:00–13:30）";
    const vol = k === "fut" ? (ok(it.v) || ok(d.volume) ? fmt(ok(d.volume) ? d.volume : it.v) + " 口" : "—") : ok(d.volume) ? fmt(d.volume / 1e8, 1) + " 億股" : "—";
    const kv = (a, b, c) => `<div class="snap ixkv"><span>${a}</span><b class="${c || ""}">${b}</b></div>`;
    panel.innerHTML = `
      <div class="ixdhead"><div><h3>${esc(it.name)}${it.label ? "（" + esc(it.label.replace(/^臺指期\s*/, "")) + "）" : ""}</h3>
          <div class="ixdnow"><b class="big ${t}">${ok(z) ? fmt(z, dg) : "—"}</b><span class="${t}">${ok(ch) ? `${arrow(ch)} ${fmt(Math.abs(ch), dg)}（${pct(ch / y * 100)}）` : ""}</span><span class="sub">${esc(it.src || "")} ${esc((it.tm || "").slice(0, 5))}</span></div></div>
        <div class="chips">${[["tick", sessName.replace(/（.*/, "") + "走勢"], ["3mo", "日線 3 個月"], ["1y", "日線 1 年"]].map(([v, l]) => `<button type="button" class="chip" data-ixr="${v}" aria-pressed="${v === r}">${l}</button>`).join("")}
          <button type="button" class="btn ixclose" aria-label="關閉">×</button></div></div>
      <div class="ixdbody"><div class="ixdchart">${ixSVG(pts, r === "tick" ? y : null, r, k)}<p class="sub ixread"></p></div>
        <div class="ixdstats">${kv("開盤", ok(d.open) ? fmt(d.open, dg) : "—")}${kv("最高", ok(it.h) ? fmt(it.h, dg) : ok(d.high) ? fmt(d.high, dg) : "—", "up")}${kv("最低", ok(it.l) ? fmt(it.l, dg) : ok(d.low) ? fmt(d.low, dg) : "—", "down")}
          ${kv(k === "fut" ? "參考價" : "昨收", ok(y) ? fmt(y, dg) : "—")}${kv("振幅", ok(d.high) && ok(d.low) && ok(y) ? pct((d.high - d.low) / y * 100).replace("+", "") : "—")}${kv("成交量", vol)}
          ${k === "fut" && ok(d.limitUp) ? kv("漲停／跌停", `${fmt(d.limitUp, 0)}／${fmt(d.limitDown, 0)}`) : ""}${r !== "tick" && pts.length > 1 ? kv("區間漲跌", pct((pts[pts.length - 1][1] / pts[0][1] - 1) * 100), tone(pts[pts.length - 1][1] - pts[0][1])) + kv("區間最高", fmt(Math.max(...pts.map(p => p[1])), 0), "up") + kv("區間最低", fmt(Math.min(...pts.map(p => p[1])), 0), "down") : ""}</div></div>`;
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
      if (k === "fut" && h >= 15) { x0 = mid + 15 * 3600; x1 = mid + 29 * 3600; } else if (k === "fut") { x0 = mid + 8.75 * 3600; x1 = mid + 13.75 * 3600; } else { x0 = mid + 9 * 3600; x1 = mid + 13.5 * 3600; } }
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
  function pmPaint(j, animate) {
    if (j && j.note) { PMN = j.note; boardSig = boardSig ? "x" : ""; try { paintBoard(); } catch (e) {} }
    const el = $("#dpPre .pmout"); if (!el) return;
    const n = j && j.note;
    if (!n || !n.analysis) { el.innerHTML = `<p class="sub">還沒有分析，05:30 會自動產生。</p>`; return; }
    const a = n.analysis, ch = a.chances || {}, li = arr => (Array.isArray(arr) ? arr : []).map(x => `<li>${esc(x)}</li>`).join(""), tn = /高/.test(a.call) ? "up" : /低/.test(a.call) ? "down" : "";
    const at = new Date(n.at).toLocaleString("zh-TW", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    el.innerHTML = `
      <div class="aisum lrise"><div class="aiverdict"><span class="aitag ${tn}">${esc(a.call)}</span><b class="pmday">預測 ${esc(String(n.day).slice(5).replace("-", "/"))}（週${"日一二三四五六"[new Date(n.day + "T00:00:00Z").getUTCDay()]}）09:00 開盤</b><span class="sub">${esc(a.gap || "")}・信心 ${esc(a.confidence || "—")}・${at} 產生${n.day < new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10) || (n.day === new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10) && new Date(Date.now() + 8 * 3600e3).getUTCHours() >= 9) ? "（這天已經開過盤，是舊的分析）" : ""}</span></div>
        <p class="ailead">${esc(a.headline || "")}</p>
        <div class="pmrow"><div class="pmseg"><h4>09:00 開盤</h4><div class="pmchance">${["開高", "平盤", "開低"].map(k => `<div><span>${k}</span><b class="${k === "開高" ? "up" : k === "開低" ? "down" : ""}">${esc(ch[k] || "—")}</b></div>`).join("")}</div></div>
        ${a.close && a.close.call ? `<div class="pmseg"><h4>13:30 收盤 <span class="aitag ${/紅/.test(a.close.call) ? "up" : /黑/.test(a.close.call) ? "down" : ""}">${esc(a.close.call)}</span> <span class="sub">${esc(a.close.range || "")}</span></h4><div class="pmchance">${["收紅", "平盤", "收黑"].map(k => `<div><span>${k}</span><b class="${k === "收紅" ? "up" : k === "收黑" ? "down" : ""}">${esc((a.close.chances || {})[k] || "—")}</b></div>`).join("")}</div>${a.close.why ? `<p class="pmcw">${esc(a.close.why)}</p>` : ""}</div>` : ""}</div></div>
      <div class="aicols"><div class="lrise"><h4>夜盤</h4><p>${esc(a.night || "—")}</p></div><div class="lrise"><h4>美股與國際</h4><p>${esc(a.us || "—")}</p></div></div>
      ${Array.isArray(a.picks) && a.picks.length ? `<div class="pmpicks"><div class="pmph"><h4>推薦下單</h4><span class="sub">${esc(a.picks_note || "")}</span></div><div class="pmpgrid">${a.picks.map(x => { const t = /買|續抱/.test(x.action || "") ? "up" : /賣|減/.test(x.action || "") ? "down" : ""; return `<button type="button" class="aiorder pmpick ${t ? "o-" + t : ""} lrise" data-pick="${esc(x.code)}">
        <div class="aiohead"><span class="ntag">${esc(x.tag || "")}</span><b class="pmpn">${esc(x.name || "")} <i>${esc(x.code)}</i></b><b class="${t}">${esc(x.action || "")}</b>${x.rr ? `<span class="sub">風險報酬 ${esc(x.rr)}</span>` : ""}</div>
        <p class="pmpw">${esc(x.why || "")}</p>${anaHTML(x.analysis)}
        <div class="aikv"><div><span>怎麼下</span><b>${esc(x.how || "—")}</b></div><div><span>分批</span><b>${esc(x.split || "—")}</b></div><div><span>停損</span><b>${esc(x.stop || "—")}</b></div><div><span>目標</span><b>${esc((Array.isArray(x.targets) ? x.targets : []).join("；") || "—")}</b></div></div>${planHTML(x.days)}</button>`; }).join("")}</div></div>` : ""}
      <div class="pmfac">${(Array.isArray(a.factors) ? a.factors : []).map(f => `<div class="pmf lrise"><span class="aitag ${f.effect === "利多" ? "up" : f.effect === "利空" ? "down" : ""}">${esc(f.effect || "")}</span><b>${esc(f.name)}</b><span class="sub">${esc(f.note)}</span></div>`).join("")}</div>
      <details class="pmmore"><summary>族群、關鍵點位、風險與開盤後要盯的事</summary>
        <div class="aicols"><div><h4>可能領漲／落後</h4><ul>${li(a.sectors)}</ul><h4>關鍵點位</h4><p>${esc(a.levels || "—")}</p></div><div><h4>風險</h4><ul>${li(a.risks)}</ul><h4>09:00–09:30 要盯</h4><ul>${li(a.watch)}</ul></div></div>
        ${n.news && n.news.length ? `<h4>參考的新聞</h4><div class="newslist">${newsHTML(n.news, null)}</div>` : ""}</details>`;
    if (animate) rise($$(".lrise", el), 70);
  }
  async function pmLoad() { try { pmPaint(await J(`${WORKER}/tw/premarket`), true); } catch (e) { const el = $("#dpPre .pmout"); if (el) el.innerHTML = `<p class="sub">盤前分析需要部署新版 Worker。</p>`; } }
  async function pmRun(b) {
    let tk = null; try { tk = window.TWAccount && TWAccount.token ? await TWAccount.token() : null; } catch (e) {}
    const el = $("#dpPre .pmout");
    if (!tk) { el.insertAdjacentHTML("afterbegin", `<p class="sub warn">要先登入帳號才能手動分析。</p>`); return; }
    b.disabled = true; b.textContent = "分析中…";
    try {
      const r = await fetch(WORKER + "/tw/premarket/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: tk }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.analysis) throw new Error(r.status === 401 ? "登入過期了，請重新登入" : aiLimitMsg(j) || (j && j.error && /[一-鿿]/.test(j.error.message || "") ? j.error.message : "AI 暫時沒有回應，過幾分鐘再試"));
      pmPaint({ note: j }, true);
      const tg = j.sent === "sent" ? "已傳到 Telegram。" : j.sent ? "Telegram 沒有送出：" + j.sent : "";
      if (tg) el.insertAdjacentHTML("afterbegin", `<p class="sub ${j.sent === "sent" ? "" : "warn"}">${esc(tg)}</p>`);
    } catch (e) {
      /* a long run can outlast the connection even though the note was written: look for it before saying it failed */
      await new Promise(r => setTimeout(r, 4000));
      try { const j = await J(`${WORKER}/tw/premarket`); if (j.note && Date.now() - j.note.at < 180000) { pmPaint(j, true); b.disabled = false; b.textContent = "分析"; return; } } catch (e2) {}
      el.insertAdjacentHTML("afterbegin", `<p class="sub warn">${/[一-鿿]/.test(e.message || "") ? esc(e.message) : "連線中斷，請稍後重新整理。"}</p>`);
    }
    b.disabled = false; b.textContent = "分析";
  }


  /* a 5-day plan strip and a short analysis list, shared by the AI team's order and the pre-market picks */
  const planHTML = days => (Array.isArray(days) && days.length ? `<div class="plan">${days.map(d => `<div class="pday ${/多/.test(d.view || "") ? "up" : /空/.test(d.view || "") ? "down" : ""}"><b>${esc(d.d || "")}</b><span class="pv">${esc(d.view || "")}</span><span class="pr">${esc(d.range || "")}</span><span class="pdo">${esc(d.do || "")}</span></div>`).join("")}</div>` : "");
  const anaHTML = a => (Array.isArray(a) && a.length ? `<ul class="pana">${a.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  /* ---------------- the AI analyst team ---------------- */
  const AI = new Map();                            /* code → { at, data } for this visit */
  /* the two limits that need their own words: the Gemini free tier's daily cap (reset at midnight US Pacific) and this account's own cap;
     anything else (a busy minute included) keeps the Worker's own message */
  function aiLimitMsg(j) {
    const code = j && j.error && j.error.status;
    if (code === "AI_DAILY") {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date()).map(x => [x.type, x.value]));
      const t = Date.now() + (86400 - (+p.hour * 3600 + +p.minute * 60 + +p.second)) * 1000, tw = ms => new Date(ms + 8 * 3600e3).toISOString();
      return `AI 今天的額度用完了，${tw(t).slice(0, 10) === tw(Date.now()).slice(0, 10) ? "今天" : "明天"} ${tw(t).slice(11, 16)} 重置`;
    }
    if (code === "RESOURCE_EXHAUSTED") return "這個帳號的分析次數到上限了，晚一點再試";
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
    const O = a.order || {}, otn = /買|續抱/.test(O.action || "") ? "up" : /賣|減/.test(O.action || "") ? "down" : "";
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
    if (!DB.live) { msg.textContent = "目前是示意資料，連上證交所後才能分析。"; return; }
    let tk = null;
    try { tk = window.TWAccount && TWAccount.token ? await TWAccount.token() : null; } catch (e) { tk = null; }
    if (!tk) { msg.textContent = "AI 分析需要先登入帳號（右上角「登入」）。"; return; }
    const fresh = AI.has(code);                    /* 重新分析 asks for a new one; 開始分析 may get today's saved one at no cost */
    go.disabled = true; go.textContent = "分析中…"; msg.textContent = "五位分析師正在讀數據與新聞，大約需要 20 到 40 秒。";
    $(".aiout", box).innerHTML = `<div class="aiwait"><i></i><i></i><i></i><i></i><i></i></div>`;
    try {
      await Promise.all([loadFund(), loadChip()]);
      let lab = null;
      try { lab = window.TWLab ? await TWLab.research(code, (i, n) => { if (code === CODE) msg.textContent = `整理研究資料（讀日線 ${i}/${n} 個月）…`; }) : null; } catch (e) { lab = null; }
      if (code === CODE) msg.textContent = "五位分析師正在讀數據、研究資料與新聞，大約需要 20 到 40 秒。";
      const F = facts(cs); if (lab) F.research = lab;
      const r = await fetch(WORKER + "/tw/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: tk, code, name: s.name, facts: F, fresh }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.analysis) {
        const st = r.status;
        throw new Error(st === 401 ? "登入過期了，請重新登入" : aiLimitMsg(j) || (j && j.error && /[一-鿿]/.test(j.error.message || "") ? j.error.message : st >= 500 ? "Google 的 AI 現在太忙，過幾分鐘再按一次" : "AI 暫時沒有回應，過幾分鐘再試"));
      }
      AI.set(code, { at: j.at || Date.now(), data: j });
      if (code === CODE) { paintAI(); rise(Array.from($(".aiout", box).children), 90); }
    } catch (e) {
      /* a failed 重新分析 keeps the analysis already on screen */
      if (code === CODE) { paintAI(); msg.textContent = e && e.message && /[一-鿿]/.test(e.message) ? e.message : "連不到 AI 服務，請稍後再試。"; }
    }
  }

  /* ---------------- live repaint ---------------- */
  function paintLive() {
    paintIdx(); paintStrip(); document.dispatchEvent(new Event("twdash:live"));   /* the sidebar repaints in the same frame */
    if (cur === "dpList") {
      $$("#dpList .mtbl tbody tr[data-code]").forEach(tr => {
        const s = DB.by.get(tr.dataset.code); if (!s || !s.rt) return;
        const tmp = document.createElement("tbody"); tmp.innerHTML = rowHTML(s);
        const fresh = tmp.firstElementChild;
        if (fresh.innerHTML !== tr.innerHTML) { tr.innerHTML = fresh.innerHTML; if (s.flash) { const p = $(".pxpill", tr); p && p.animate([{ filter: "brightness(1.7)" }, { filter: "none" }], { duration: 600 }); } }
        s.flash = "";
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
  function open(id, animate, quiet) {
    const b = tabs.find(t => t.dataset.p === id) || tabs[0], panel = document.getElementById(b.dataset.p), same = cur === b.dataset.p;
    if (b.dataset.p !== "dpStock" && typeof BACK !== "undefined" && BACK) { BACK = null; showBack(); }
    tabs.forEach(t => t.setAttribute("aria-selected", t === b ? "true" : "false"));
    movePill(b, animate);
    $$(".dpanel").forEach(p => p.classList.toggle("on", p === panel));
    cur = b.dataset.p;
    try { sessionStorage.setItem("twdash-tab", cur); } catch (e) {}
    navPush();
    if (!quiet) {
      /* panel content rises in one block after another; then the figures inside draw themselves */
      rise(Array.from(panel.children), 80);
      if (cur === "dpOverview") { rise($$(".ixcard", panel), 70); drawSpark(); const bx = $(".board", panel); if (bx) boardIn(bx, true); }
      if (cur === "dpList") rise($$(".mtbl tbody tr", panel).slice(0, 24), 18, 200);
      if (cur === "dpWatch") { paintWatch(false); rise($$(".wcard", panel), 60, 80); }
      if (cur === "dpStock" && !same) { if (HIST.get(CODE)) drawChart(true); else setStock(CODE, true); }
    }
    rtPoll();
  }
  function drawSpark() {
    $$(".ixcard .spark").forEach((svg, i) => {
      const b = $(".spbase", svg), p = $("path", svg); if (!p || !p.getAttribute("d")) return;
      if (b) b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 150 + i * 80, fill: "backwards" });
      const L = p.getTotalLength(); p.style.strokeDasharray = L;
      p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 900, delay: 400 + i * 80, easing: "ease-out", fill: "backwards" });
    });
  }

  tabs.forEach(b => b.addEventListener("click", () => open(b.dataset.p, true)));
  $(".dtabs").addEventListener("keydown", e => {
    const i = tabs.indexOf(document.activeElement); if (i < 0 || !/Arrow(Left|Right|Up|Down)/.test(e.key)) return;
    const n = tabs[(i + (/Right|Down/.test(e.key) ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click();
  });
  addEventListener("resize", () => { const b = tabs.find(t => t.getAttribute("aria-selected") === "true"); b && movePill(b, false); });
  root.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches && e.target.matches("tr[data-code], .wcard[data-code]")) e.target.click(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) rtPoll(); });
  /* "/" jumps to the search box from anywhere: the stock page's own box there, the list's everywhere else */
  document.addEventListener("keydown", e => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || "")) return;
    const g = document.getElementById("gate"); if (g && !g.hidden) return;
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
    if (/^#(stock\/[0-9A-Z]{4,6}|dp\w+)$/.test(location.hash)) { navGo(location.hash); try { history.replaceState({ tw: 1, p: cur, code: CODE }, "", navHash()); } catch (e) {} }
    else { navLock = true; open(saved || "dpOverview", false); navLock = false; try { history.replaceState({ tw: 1, p: cur, code: CODE }, "", navHash()); } catch (e) {} }
  });
  window.TWDash = { replay: () => open(cur, false),
    /* shared with the 研究室 tab (assets/twlab.js) */
    api: { DB, FUND, CHIP, IDX, HIST, calc, sma, histMonth, loadHist, loadFund, loadChip, monthsBack, facts: code => { const h = HIST.get(code); if (!h) return null; const k = CODE; CODE = code; try { return facts(h.cs); } finally { CODE = k; } },
      store, openStock: code => openStock(code), code: () => CODE, watch: () => WATCH.slice(), J, num, esc, fmt, signed, pct, tone, dig, wait, rise } };
  document.dispatchEvent(new Event("twdash:ready"));

  (async () => {
    try { await loadList(); } catch (e) { sampleList(); }
    note(); paintTable(true); paintStrip(); paintWatch(true); paintHead();
    if (cur === "dpStock") setStock(CODE, true);
    document.dispatchEvent(new Event("twdash:list"));
    pullWatch();
    if (DB.live) {
      loadIdxEod().then(paintIdx, () => {}).then(paintIdx);
      loadMarket().then(() => { paintIdx(); paintStrip(); if (cur === "dpOverview") drawSpark(); }, () => {});
      rtLoop();
    } else {
      IDX.forEach((i, k) => Object.assign(i, { z: [45120.5, 45180, 2410.3, 2105.8][k], y: [44890.2, 44950, 2395.1, 2110.2][k], src: "示意" }));
      paintIdx();
    }
  })();
})();
