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
  const marketOpen = () => { const t = taipei(); return !/Sat|Sun/.test(t.wd) && t.mins >= 525 && t.mins <= 825; };   /* 08:45–13:45 */

  /* ---------------- state ---------------- */
  const DEFAULT_WATCH = ["2330", "2317", "2454", "2308", "2881", "0050"];
  const DB = { list: [], by: new Map(), live: false, date: "", rt: null, rtAt: "", err: "" };
  const IDX = [{ k: "t00", name: "加權指數" }, { k: "fut", name: "台指期" }, { k: "t13", name: "電子" }, { k: "t17", name: "金融" }];
  const MKT = { rows: null, inst: null };          /* TAIEX history rows and the institutions of the day */
  let WATCH = store.get("twtrade-watch", DEFAULT_WATCH);
  const IND = Object.assign({ ma: true, boll: false, vol: true, kd: true, macd: false, rsi: false }, store.get("twmain-ind", {}));
  let SPAN = store.get("twmain-span", 60);
  const VIEW = { q: "", preset: "all", key: "vol", dir: -1, shown: 50 };
  let CODE = store.get("twmain-code", "2330");

  /* ---------------- loaders: closing data from TWSE open data ---------------- */
  function setList(list, live, date) {
    DB.list = list; DB.by = new Map(list.map(s => [s.code, s])); DB.live = live; DB.date = date || DB.date;
  }
  async function loadList() {
    const rows = await J("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL");
    let date = "";
    const list = rows.map(x => {
      const price = num(x.ClosingPrice), chg = num(x.Change), prev = price - chg;
      if (!date && x.Date) date = ymd(x.Date);
      return { code: String(x.Code), name: String(x.Name), price, prev, chg, pct: prev ? chg / prev * 100 : 0,
        open: num(x.OpeningPrice), high: num(x.HighestPrice), low: num(x.LowestPrice), vol: Math.round(num(x.TradeVolume) / 1000) };
    }).filter(s => s.price > 0 && ok(s.prev) && ok(s.vol));
    if (list.length < 10) throw new Error("too few rows");
    setList(list, true, date);
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
  async function histMonth(code, ym, finished) {
    const key = `twh:${code}:${ym}`, hit = finished && store.get(key, null);
    if (hit) return hit;
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
    return $$("#dpOverview .mtbl tbody tr[data-code]").slice(0, 70).map(r => r.dataset.code);
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
        any = true; Object.assign(it, { z: x.z, y: x.y, h: x.h, l: x.l, tm: x.tm, src: "盤中", rt: true });
      });
      if (j.fut && j.fut.z > 0) { any = true; Object.assign(IDX[1], { z: j.fut.z, y: j.fut.y, h: j.fut.h, l: j.fut.l, tm: j.fut.tm, src: j.fut.src === "rt" ? "盤中" : "收盤", rt: true, label: j.fut.n }); }
      if (any) { DB.rt = true; DB.rtAt = new Date().toLocaleTimeString("zh-TW", { hour12: false }); paintLive(); }
      else if (DB.rt == null) DB.rt = false;
    } catch (e) { DB.rt = false; rtFailAt = Date.now(); }
    rtBusy = false; note();
  }
  function rtLoop() {
    clearTimeout(rtTimer);
    rtPoll().then(() => { rtTimer = setTimeout(rtLoop, marketOpen() ? 10000 : 120000); });
  }

  /* ---------------- banner ---------------- */
  function note() {
    const el = $(".dash-note"); if (!el) return;
    if (!DB.list.length) { el.innerHTML = `<b>載入中</b>正在讀取證交所公開資料…`; return; }
    if (!DB.live) { el.innerHTML = `<b>示意資料</b>目前連不到證交所，以下數字是示意，不代表真實行情。`; return; }
    if (DB.rt) el.innerHTML = `<b class="live">盤中報價</b>${esc(DB.rtAt)} 更新，約延遲數秒；${marketOpen() ? "每 10 秒更新畫面上的股票" : "目前非交易時段，顯示最後成交"}。`;
    else el.innerHTML = `<b>收盤資料</b>證交所公開資料 ${slash(DB.date)}。${DB.rt === false ? "盤中即時報價需要部署新版 Worker，部署後會自動切換。" : ""}`;
  }

  /* ---------------- 總覽 ---------------- */
  const PRESETS = [["all", "全部"], ["watch", "自選"], ["strong", "強勢股"], ["weak", "弱勢股"], ["volume", "成交量"]];
  const COLS = [["price", "成交價"], ["chg", "漲跌"], ["pct", "漲跌幅"], ["vol", "成交量"]];
  function buildOverview() {
    $("#dpOverview").innerHTML = `
      <div class="ixgrid">${IDX.map(i => `<div class="dcard ixcard" data-k="${i.k}"><h3><span class="ixn">${i.name}</span><span class="ixsrc"></span></h3>
        <div class="big">—</div><div class="sub ixchg">載入中…</div><div class="sub ixhl"></div><svg class="spark" viewBox="0 0 76 28" aria-hidden="true"><path/></svg></div>`).join("")}</div>
      <div class="dcard mstrip"></div>
      <div class="dcard mkt">
        <div class="mbar"><input class="msearch" type="search" placeholder="搜尋代號或名稱" aria-label="搜尋股票" autocomplete="off">
          <div class="chips">${PRESETS.map(([k, t]) => `<button type="button" class="chip" data-preset="${k}" aria-pressed="${k === VIEW.preset}">${t}</button>`).join("")}</div>
          <span class="sub mcount"></span></div>
        <div class="mwrap"><table class="mtbl ttbl mktab"><thead><tr><th class="l">商品</th>${COLS.map(([k, t]) => `<th class="sort" data-key="${k}">${t}<i></i></th>`).join("")}<th aria-label="自選"></th></tr></thead><tbody></tbody></table></div>
        <button type="button" class="mmore" hidden>顯示更多</button>
      </div>`;
    const box = $("#dpOverview");
    $(".msearch", box).addEventListener("input", e => { VIEW.q = e.target.value.trim(); VIEW.shown = 50; paintTable(true); });
    box.addEventListener("click", e => {
      const p = e.target.closest("[data-preset]");
      if (p) {
        VIEW.preset = p.dataset.preset; VIEW.shown = 50;
        const o = { all: ["vol", -1], watch: ["pct", -1], strong: ["pct", -1], weak: ["pct", 1], volume: ["vol", -1] }[VIEW.preset];
        VIEW.key = o[0]; VIEW.dir = o[1]; paintTable(true); return;
      }
      const th = e.target.closest("th.sort");
      if (th) { const k = th.dataset.key; if (VIEW.key === k) VIEW.dir *= -1; else { VIEW.key = k; VIEW.dir = -1; } paintTable(true); return; }
      if (e.target.closest(".mmore")) { VIEW.shown += 100; paintTable(false); return; }
      const st = e.target.closest(".starbtn");
      if (st) { toggleWatch(st.dataset.code); return; }
      const tr = e.target.closest("tr[data-code]");
      if (tr) openStock(tr.dataset.code, tr);
    });
  }
  function rowsNow() {
    const q = VIEW.q.toLowerCase();
    let rows = DB.list;
    if (VIEW.preset === "watch") rows = rows.filter(s => WATCH.includes(s.code));
    if (VIEW.preset === "strong" || VIEW.preset === "weak") rows = rows.filter(s => s.vol >= 500);   /* thin stocks are left out, as broker apps do */
    if (q) rows = rows.filter(s => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    const k = VIEW.key, d = VIEW.dir;
    return rows.slice().sort((a, b) => (a[k] - b[k]) * d || a.code.localeCompare(b.code));
  }
  const rowHTML = s => {
    const d = dig(s.price), t = tone(s.chg);
    return `<tr data-code="${esc(s.code)}" tabindex="0"><td class="l nm"><b>${esc(s.name)}</b><span>${esc(s.code)}</span></td>
      <td><span class="pxpill ${t}">${fmt(s.price, d)}</span></td><td class="${t}">${arrow(s.chg)}${fmt(Math.abs(s.chg), d)}</td><td class="${t}">${pct(s.pct)}</td>
      <td class="vol">${fmt(s.vol)}</td><td><button type="button" class="starbtn" data-code="${esc(s.code)}" aria-pressed="${WATCH.includes(s.code)}" aria-label="自選 ${esc(s.name)}">★</button></td></tr>`;
  };
  function paintTable(animate) {
    const box = $("#dpOverview"); if (!$(".mtbl", box)) return;
    const rows = rowsNow(), show = rows.slice(0, VIEW.shown);
    $(".mtbl tbody", box).innerHTML = show.map(rowHTML).join("") ||
      `<tr><td class="mempty" colspan="6">${VIEW.preset === "watch" && !VIEW.q ? "還沒有自選股，點任何一檔右邊的 ★ 加入。" : DB.list.length ? "找不到符合的股票。" : "載入中…"}</td></tr>`;
    $(".mmore", box).hidden = rows.length <= VIEW.shown;
    $(".mcount", box).textContent = DB.list.length ? `${fmt(rows.length)} 檔${VIEW.preset === "strong" || VIEW.preset === "weak" ? "（成交量 500 張以上）" : ""}` : "";
    $$("[data-preset]", box).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.preset === VIEW.preset)));
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
    const sp = $('.ixcard[data-k="t00"] .spark path');
    if (sp && MKT.rows) {
      const ys = MKT.rows.slice(-60).map(r => r[4]), lo = Math.min(...ys), span = Math.max(...ys) - lo || 1, n = ys.length - 1;
      sp.setAttribute("d", ys.map((y, k) => `${k ? "L" : "M"}${(k / n * 76).toFixed(1)},${(26 - (y - lo) / span * 24).toFixed(1)}`).join(""));
    }
  }
  function paintStrip() {
    const el = $("#dpOverview .mstrip"); if (!el) return;
    const last = MKT.rows && MKT.rows[MKT.rows.length - 1], prev = MKT.rows && MKT.rows[MKT.rows.length - 2], I = MKT.inst;
    let up = 0, down = 0, flat = 0; DB.list.forEach(s => { if (s.chg > 0) up++; else if (s.chg < 0) down++; else flat++; });
    const cell = (k, v, c, sub) => `<div class="mcell"><span>${k}</span><b class="${c || ""}">${v}</b>${sub ? `<i>${sub}</i>` : ""}</div>`;
    el.innerHTML = [
      cell("成交金額（億）", last ? fmt(last[2]) : "—", "", last && prev ? `較前日 ${pct((last[2] / prev[2] - 1) * 100)}` : (last ? "" : "")),
      cell("外資（億）", I ? signed(I.f, 1) : "—", I ? tone(I.f) : "", I && last && I.date !== last[0] ? shortDay(I.date) : ""),
      cell("投信（億）", I ? signed(I.t, 1) : "—", I ? tone(I.t) : ""),
      cell("自營商（億）", I ? signed(I.d, 1) : "—", I ? tone(I.d) : ""),
      cell("上漲 / 下跌 / 平盤", DB.list.length ? `<em class="up">${fmt(up)}</em> / <em class="down">${fmt(down)}</em> / ${fmt(flat)}` : "—", "", DB.live ? "含 ETF" : "示意"),
    ].join("");
  }

  /* ---------------- 自選股 ---------------- */
  function buildWatch() {
    $("#dpWatch").innerHTML = `<div class="wgrid"></div>`;
    $("#dpWatch").addEventListener("click", e => {
      const st = e.target.closest(".starbtn"); if (st) { toggleWatch(st.dataset.code); return; }
      const c = e.target.closest(".wcard[data-code]"); if (c) openStock(c.dataset.code, c);
    });
  }
  function paintWatch(animate) {
    const g = $("#dpWatch .wgrid"); if (!g) return;
    const cards = WATCH.map(code => {
      const s = DB.by.get(code);
      if (!s) return `<div class="dcard wcard"><h3>${esc(code)}<button type="button" class="starbtn" data-code="${esc(code)}" aria-pressed="true" aria-label="移除自選">★</button></h3><p class="sub">${DB.list.length ? "不在上市股清單中" : "載入中…"}</p></div>`;
      const d = dig(s.price), t = tone(s.chg), pos = s.high > s.low ? clamp((s.price - s.low) / (s.high - s.low) * 100, 0, 100) : 50;
      return `<div class="dcard wcard" data-code="${esc(code)}" tabindex="0" role="button"><h3><span>${esc(s.name)} <span class="sub">${esc(code)}</span></span><button type="button" class="starbtn" data-code="${esc(code)}" aria-pressed="true" aria-label="移除自選">★</button></h3>
        <div class="big ${t}">${fmt(s.price, d)}</div><div class="sub ${t}">${arrow(s.chg)} ${fmt(Math.abs(s.chg), d)}（${pct(s.pct)}）</div>
        <div class="rng"><div class="rngbar"><i class="rngdot" style="left:${pos.toFixed(1)}%"></i></div><div class="rngtxt sub"><span>低 ${fmt(s.low, d)}</span><span>高 ${fmt(s.high, d)}</span></div></div>
        <div class="sub">開 ${fmt(s.open, d)} · 量 ${fmt(s.vol)} 張</div></div>`;
    });
    g.innerHTML = cards.join("") || `<p class="mempty">還沒有自選股。到「總覽」的清單點 ★ 加入。</p>`;
    if (animate && $("#dpWatch").classList.contains("on")) rise($$(".wcard", g), 60);
  }
  function toggleWatch(code) {
    WATCH = WATCH.includes(code) ? WATCH.filter(c => c !== code) : WATCH.concat(code);
    store.set("twtrade-watch", WATCH);
    try { window.TWAccount && TWAccount.saveWatchlist(WATCH).catch(() => {}); } catch (e) {}
    $$(".starbtn").forEach(b => b.setAttribute("aria-pressed", String(WATCH.includes(b.dataset.code))));
    paintWatch(false);
    if (VIEW.preset === "watch") paintTable(false);
  }
  async function pullWatch() {
    try {
      if (!window.TWAccount || !TWAccount.account()) return;
      const sym = await TWAccount.loadWatchlist();
      if (sym && sym.length && JSON.stringify(sym) !== JSON.stringify(WATCH)) { WATCH = sym; store.set("twtrade-watch", WATCH); paintWatch(false); paintTable(false); starHead(); }
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
        <div class="sfind"><input class="ssearch" type="search" placeholder="輸入代號或名稱換一檔" aria-label="搜尋股票" autocomplete="off"><div class="ssug" hidden></div></div>
        <div class="stitle"><h2></h2><button type="button" class="starbtn sstar" aria-pressed="false" aria-label="加入自選">★</button></div>
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
        <div class="aihead"><div><h3>AI 分析團隊</h3><p class="sub">技術面、基本面、籌碼面、時事與國際、風險控管五位分析師各自表態，再給出情境與進場條件。</p></div>
          <button type="button" class="aigo">開始分析</button></div>
        <p class="sub aimsg"></p><div class="aiout"></div>
        <p class="sub ainote">AI 依公開數據與新聞標題整理，可能出錯，也沒有人能保證股價走向。這是研究用的參考，不是投資建議，下單前請自行判斷。</p>
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
      const s = e.target.closest(".ssug button"); if (s) { inp.value = ""; sug.hidden = true; setStock(s.dataset.code, true); return; }
      if (e.target.closest(".sstar")) { toggleWatch(CODE); starHead(); return; }
      const sp = e.target.closest("[data-span]"); if (sp) { SPAN = +sp.dataset.span; store.set("twmain-span", SPAN); drawChart(true); return; }
      const ind = e.target.closest("[data-ind]"); if (ind) { IND[ind.dataset.ind] = !IND[ind.dataset.ind]; store.set("twmain-ind", IND); drawChart(true); return; }
      if (e.target.closest(".aigo")) analyze();
    });
  }
  function starHead() { const b = $("#dpStock .sstar"); if (b) { b.dataset.code = CODE; b.setAttribute("aria-pressed", String(WATCH.includes(CODE))); } }
  function paintHead() {
    const box = $("#dpStock"), s = DB.by.get(CODE); if (!$(".shead", box)) return;
    $(".stitle h2", box).innerHTML = s ? `${esc(s.name)} <span>${esc(s.code)}</span>` : esc(CODE);
    starHead();
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
  function openStock(code, from) {
    const a = from && from.getBoundingClientRect();
    open("dpStock", true, true);
    setStock(code, true);
    const head = $("#dpStock .shead");
    scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    if (a && head) {
      const b = head.getBoundingClientRect();
      head.animate([{ transformOrigin: "0 0", transform: `translate(${a.left - b.left}px,${a.top - b.top}px) scale(${a.width / b.width},${a.height / b.height})`, opacity: .5 }, { transformOrigin: "0 0", transform: "none", opacity: 1 }],
        { duration: 420, easing: "cubic-bezier(.3,.7,.2,1)" });
      rise(Array.from($("#dpStock").children).slice(1), 80, 180);
    }
  }

  /* ---------------- the AI analyst team ---------------- */
  const AI = new Map();                            /* code → { at, data } for this visit */
  const stanceTone = s => (/多/.test(s || "") ? "up" : /空/.test(s || "") ? "down" : "");
  function paintAI() {
    const box = $("#dpStock"), out = $(".aiout", box), msg = $(".aimsg", box), go = $(".aigo", box); if (!out) return;
    const hit = AI.get(CODE);
    go.disabled = false; go.textContent = hit ? "重新分析" : "開始分析";
    if (!hit) { out.innerHTML = ""; msg.textContent = ""; return; }
    const a = hit.data.analysis || {}, S = a.summary || {}, E = S.entry || {}, li = arr => (Array.isArray(arr) ? arr : []).map(x => `<li>${esc(x)}</li>`).join("");
    msg.textContent = `分析時間 ${new Date(hit.at).toLocaleString("zh-TW", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}，依當時的報價與新聞。`;
    out.innerHTML = `
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
    const box = $("#dpStock"), msg = $(".aimsg", box), go = $(".aigo", box), code = CODE, s = DB.by.get(code);
    const cs = barsOf(code);
    if (!s || !cs || cs.length < 30) { msg.textContent = "這檔的歷史資料還不夠，無法分析。"; return; }
    if (!DB.live) { msg.textContent = "目前是示意資料，連上證交所後才能分析。"; return; }
    let tk = null;
    try { tk = window.TWAccount && TWAccount.token ? await TWAccount.token() : null; } catch (e) { tk = null; }
    if (!tk) { msg.textContent = "AI 分析需要先登入帳號（右上角「登入」）。"; return; }
    go.disabled = true; go.textContent = "分析中…"; msg.textContent = "五位分析師正在讀數據與新聞，大約需要 20 到 40 秒。";
    $(".aiout", box).innerHTML = `<div class="aiwait"><i></i><i></i><i></i><i></i><i></i></div>`;
    try {
      await Promise.all([loadFund(), loadChip()]);
      const r = await fetch(WORKER + "/tw/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: tk, code, name: s.name, facts: facts(cs) }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.analysis) {
        const st = r.status;
        throw new Error(st === 404 ? "AI 分析需要部署新版 Worker 後才能使用。" : st === 401 ? "登入已過期，請重新登入。" : st === 429 ? "AI 用量暫時到上限，請稍後再試。" : "AI 暫時寫不出分析，請稍後再試一次。");
      }
      AI.set(code, { at: j.at || Date.now(), data: j });
      if (code === CODE) { paintAI(); rise(Array.from($(".aiout", box).children), 90); }
    } catch (e) {
      if (code === CODE) { $(".aiout", box).innerHTML = ""; msg.textContent = e && e.message && /[一-鿿]/.test(e.message) ? e.message : "連不到 AI 服務，請稍後再試。"; go.disabled = false; go.textContent = "開始分析"; }
    }
  }

  /* ---------------- live repaint ---------------- */
  function paintLive() {
    paintIdx(); paintStrip();
    if (cur === "dpOverview") {
      $$("#dpOverview .mtbl tbody tr[data-code]").forEach(tr => {
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
    tabs.forEach(t => t.setAttribute("aria-selected", t === b ? "true" : "false"));
    movePill(b, animate);
    $$(".dpanel").forEach(p => p.classList.toggle("on", p === panel));
    cur = b.dataset.p;
    try { sessionStorage.setItem("twdash-tab", cur); } catch (e) {}
    if (!quiet) {
      /* panel content rises in one block after another; then the figures inside draw themselves */
      rise(Array.from(panel.children), 80);
      if (cur === "dpOverview") { rise($$(".ixcard", panel), 70); rise($$(".mtbl tbody tr", panel).slice(0, 24), 18, 200); drawSpark(); }
      if (cur === "dpWatch") { paintWatch(false); rise($$(".wcard", panel), 60, 80); }
      if (cur === "dpStock" && !same) { if (HIST.get(CODE)) drawChart(true); else setStock(CODE, true); }
    }
    rtPoll();
  }
  function drawSpark() {
    const p = $('.ixcard[data-k="t00"] .spark path'); if (!p || !p.getAttribute("d")) return;
    const L = p.getTotalLength(); p.style.strokeDasharray = L;
    p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 900, delay: 250, easing: "ease-out", fill: "backwards" });
  }
  tabs.forEach(b => b.addEventListener("click", () => open(b.dataset.p, true)));
  $(".dtabs").addEventListener("keydown", e => {
    const i = tabs.indexOf(document.activeElement); if (i < 0 || !/Arrow(Left|Right|Up|Down)/.test(e.key)) return;
    const n = tabs[(i + (/Right|Down/.test(e.key) ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click();
  });
  addEventListener("resize", () => { const b = tabs.find(t => t.getAttribute("aria-selected") === "true"); b && movePill(b, false); });
  root.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches && e.target.matches("tr[data-code], .wcard[data-code]")) e.target.click(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) rtPoll(); });

  /* ---------------- start ---------------- */
  buildOverview(); buildWatch(); buildStock();
  note(); paintIdx(); paintStrip(); paintTable(false); paintWatch(false); paintHead();
  let saved = null; try { saved = sessionStorage.getItem("twdash-tab"); } catch (e) {}
  requestAnimationFrame(() => open(saved || "dpOverview", false));
  window.TWDash = { replay: () => open(cur, false) };

  (async () => {
    try { await loadList(); } catch (e) { sampleList(); }
    note(); paintTable(true); paintStrip(); paintWatch(true); paintHead();
    if (cur === "dpStock") setStock(CODE, true);
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
