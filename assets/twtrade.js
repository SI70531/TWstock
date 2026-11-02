/* TWstock trading tools: quote cards, K-line, position calculator, paper trading, risk, performance,
   price alerts, holdings, fear & greed gauge, quote list and settings.
   Data: TWSE open data (latest trading day) when the browser can reach it; otherwise labelled sample data.
   Paper trades, watchlist and alerts stay in this browser only. */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
  const pct = v => (Number.isFinite(v) ? (v > 0 ? "+" : "") + v.toFixed(2) + "%" : "—");
  const tone = v => (v >= 0 ? "up" : "down");
  const dig = p => (p >= 1000 ? 0 : p >= 10 ? 1 : 2);
  const FEE = 0.001425, TAX = 0.003, START = 1000000;
  const DEFAULT_WATCH = ["2330", "2317", "2454", "2308", "2881", "0050", "2603", "1301"];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const stamp = () => new Date().toLocaleString("zh-TW", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  /* ---------- data ---------- */
  const SAMPLE = [
    ["2330", "台積電", 1010], ["2317", "鴻海", 215], ["2454", "聯發科", 1385], ["2308", "台達電", 415],
    ["2412", "中華電", 131], ["2881", "富邦金", 92], ["2882", "國泰金", 78], ["2603", "長榮", 225],
    ["1301", "台塑", 52], ["2891", "中信金", 40], ["0050", "元大台灣50", 190], ["2002", "中鋼", 24],
  ];
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const hash = str => { let h = 7; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

  function buildSample() {
    return SAMPLE.map(([code, name, price]) => {
      const r = rng(hash(code)), chg = (r() - 0.5) * 7, prev = price / (1 + chg / 100);
      const open = prev * (1 + (r() - 0.5) * 0.02);
      return {
        code, name, price, prev, chgPct: (price - prev) / prev * 100, open,
        high: Math.max(open, price) * (1 + r() * 0.015), low: Math.min(open, price) * (1 - r() * 0.015),
        volume: Math.round(20000 + r() * 80000),
      };
    });
  }
  function sampleHistory(s) {
    const r = rng(hash(s.code) ^ 0x9e3779b9), N = 60, walk = [1];
    for (let i = 1; i < N; i++) walk.push(walk[i - 1] * (1 + (r() - 0.5) * 0.04));
    const k = s.price / walk[N - 1], close = walk.map(x => x * k);
    return close.map((c, i) => {
      const o = i ? close[i - 1] : c * (1 + (r() - 0.5) * 0.01);
      return { o, c, h: Math.max(o, c) * (1 + r() * 0.012), l: Math.min(o, c) * (1 - r() * 0.012) };
    });
  }

  const TWSE_ALL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";
  const num = v => { const t = String(v == null ? "" : v).replace(/,/g, "").trim(); return t === "" ? NaN : Number(t); };

  async function loadLive() {
    const res = await fetch(TWSE_ALL, { cache: "no-store" });
    if (!res.ok) throw new Error("TWSE 回應 " + res.status);
    const rows = await res.json();
    const list = rows.map(x => {
      const price = num(x.ClosingPrice), chg = num(x.Change), prev = price - chg;
      return {
        code: String(x.Code), name: String(x.Name), price, prev, chgPct: prev ? chg / prev * 100 : 0,
        open: num(x.OpeningPrice), high: num(x.HighestPrice), low: num(x.LowestPrice),
        volume: Math.round(num(x.TradeVolume) / 1000),
      };
    }).filter(s => s.price > 0 && s.open > 0 && s.high > 0 && s.low > 0 && Number.isFinite(s.prev));
    if (list.length < 10) throw new Error("資料筆數不足");
    return list;
  }

  async function loadHistory(code) {
    const now = new Date();
    const months = [0, 1].map(i => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + "01"; });
    const pages = await Promise.all(months.map(m =>
      fetch(`https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${m}&stockNo=${code}`, { cache: "no-store" })
        .then(r => { if (!r.ok) throw new Error("TWSE " + r.status); return r.json(); })));
    const rows = [];
    pages.reverse().forEach(p => (p.data || []).forEach(r => rows.push({ o: num(r[3]), h: num(r[4]), l: num(r[5]), c: num(r[6]) })));
    const cs = rows.filter(c => [c.o, c.h, c.l, c.c].every(v => v > 0)).slice(-60);
    if (cs.length < 5) throw new Error("沒有歷史資料");
    return cs;
  }

  /* ---------- state ---------- */
  const DB = { want: store.get("twtrade-source", "live"), source: "", list: [], byCode: new Map(), updated: "", error: "" };
  const hist = new Map();
  let WATCH = store.get("twtrade-watch", DEFAULT_WATCH);
  let ALERTS = store.get("twtrade-alerts", []);
  let SORT = { key: "volume", dir: -1 };
  const emptySim = () => ({ cash: START, pos: {}, trades: [] });
  let SIM = store.get("twtrade-sim", null) || emptySim();
  const saveSim = () => store.set("twtrade-sim", SIM);

  const px = code => (DB.byCode.get(code) || {}).price;
  const nameOf = code => (DB.byCode.get(code) || {}).name || "";
  const mv = code => { const p = SIM.pos[code], q = px(code); return p && q ? p.qty * q : 0; };
  const heldCodes = () => Object.keys(SIM.pos);
  function totals() {
    let inv = 0, upl = 0;
    heldCodes().forEach(c => { const p = SIM.pos[c], q = px(c); if (q) { inv += p.qty * q; upl += (q - p.avg) * p.qty; } });
    return { inv, upl, eq: SIM.cash + inv, cash: SIM.cash };
  }

  function setList(list, src) {
    DB.list = list; DB.byCode = new Map(list.map(s => [s.code, s]));
    DB.source = src; DB.updated = stamp(); DB.error = "";
  }
  function useSample() { setList(buildSample(), "sample"); }

  async function getHist(code) {
    const s = DB.byCode.get(code); if (!s) return null;
    const key = DB.source + "|" + code;
    if (hist.has(key)) return hist.get(key);
    let cs = null;
    if (DB.source === "live") { try { cs = await loadHistory(code); } catch (e) { cs = null; } }
    else cs = sampleHistory(s);
    if (cs) hist.set(key, cs);
    return cs;
  }

  function checkAlerts() {
    if (DB.source !== "live") return;
    const fired = [];
    ALERTS.forEach(a => {
      const s = DB.byCode.get(a.code);
      if (!s || a.hit) return;
      if ((a.dir === "above" && s.price >= a.price) || (a.dir === "below" && s.price <= a.price)) { a.hit = stamp(); fired.push(a); }
    });
    if (!fired.length) return;
    store.set("twtrade-alerts", ALERTS);
    try {
      if ("Notification" in window && Notification.permission === "granted")
        fired.forEach(a => new Notification(`${a.code} 到價提醒`, { body: `${a.dir === "above" ? "高於" : "低於"} ${a.price}，現價 ${px(a.code)}` }));
    } catch (e) {}
  }

  const P = {};
  function emit() { Object.keys(P).forEach(id => P[id].built && P[id].update(P[id].host)); }

  async function refresh() {
    if (DB.want === "live") {
      try { setList(await loadLive(), "live"); }
      catch (e) {
        if (DB.source !== "sample") useSample();
        DB.error = "即時資料暫時載入不到（" + ((e && e.message) || "未知錯誤") + "），先顯示示意資料。";
      }
    } else if (DB.source !== "sample") useSample();
    checkAlerts();
    emit();
  }
  setInterval(() => { if (DB.want === "live" && !document.hidden) refresh(); }, 60000);

  /* ---------- trading ---------- */
  function trade(side, code, qty) {
    const s = DB.byCode.get(code); if (!s) return "找不到這檔股票的報價";
    qty = Math.floor(qty);
    if (!(qty > 0)) return "股數要是大於 0 的整數";
    const price = s.price, p = SIM.pos[code] || { qty: 0, avg: 0 };
    if (side === "buy") {
      const cost = price * qty * (1 + FEE);
      if (cost > SIM.cash) return "現金不足";
      const nq = p.qty + qty;
      SIM.pos[code] = { qty: nq, avg: (p.avg * p.qty + cost) / nq };
      SIM.cash -= cost;
      SIM.trades.push({ t: stamp(), code, side, qty, price, pnl: null });
    } else {
      if (qty > p.qty) return "持股不足";
      const proceeds = price * qty * (1 - FEE - TAX), pnl = proceeds - p.avg * qty;
      SIM.cash += proceeds;
      if (p.qty - qty === 0) delete SIM.pos[code]; else SIM.pos[code] = { qty: p.qty - qty, avg: p.avg };
      SIM.trades.push({ t: stamp(), code, side, qty, price, pnl });
    }
    SIM.trades = SIM.trades.slice(-200);
    saveSim(); emit();
    return "";
  }
  function toggleWatch(code) {
    WATCH = WATCH.includes(code) ? WATCH.filter(c => c !== code) : WATCH.concat(code);
    store.set("twtrade-watch", WATCH); emit();
  }

  /* ---------- helpers ---------- */
  function srcTag() {
    const live = DB.source === "live";
    let t = `<b class="${live ? "live" : "warn"}">${live ? "TWSE 公開資料" : "示意資料"}</b>`;
    t += `<span>${live ? "最近一個交易日的收盤與日內價格（非逐筆即時）" : "數字是示意，不代表真實行情"}${DB.updated ? "　更新 " + DB.updated : ""}</span>`;
    if (DB.error) t += `<span class="warn">${esc(DB.error)}</span>`;
    return t;
  }
  function setOptions(sel, codes) {
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = codes.map(c => `<option value="${c}">${c} ${esc(nameOf(c))}</option>`).join("");
    if (codes.includes(cur)) sel.value = cur;
  }
  function rise(nodes, gap) {
    if (reduced()) return;
    nodes.forEach((n, i) => n.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }],
      { duration: 480, delay: i * gap, easing: "cubic-bezier(.2,.9,.3,1)", fill: "backwards" }));
  }
  function growBars(h) {
    $$("[data-w]", h).forEach((i, k) => {
      const w = i.dataset.w;
      i.style.width = w + "%";
      if (!reduced()) i.animate([{ width: "0%" }, { width: w + "%" }], { duration: 900, delay: 120 + k * 80, easing: "cubic-bezier(.2,.9,.3,1)", fill: "backwards" });
    });
  }
  /* a line sweeps in from the left (works for dashed lines too) */
  function sweep(p, ms, delay = 0) {
    if (!p || reduced()) return;
    p.classList.add("draw");
    p.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: ms, delay, easing: "cubic-bezier(.3,.7,.3,1)", fill: "backwards" });
  }
  function bar(label, value, note) {
    const v = Number.isFinite(value) ? value : 0;
    return `<div class="rrow"><div class="kv"><span>${esc(label)}</span><b>${fmt(v, 1)}%</b></div>` +
      `<div class="meter"><i data-w="${clamp(v, 0, 100).toFixed(1)}"></i></div>${note ? `<div class="sub">${esc(note)}</div>` : ""}</div>`;
  }
  function panel(id, def) {
    const el = document.getElementById(id); if (!el) return;
    const host = document.createElement("div"); host.className = "tt";
    el.replaceChildren(host);
    P[id] = Object.assign({ el, host, built: false, done: false, play: null }, def);
  }
  function show(id) {
    const p = P[id]; if (!p) return;
    if (!p.built) { p.build(p.host); p.built = true; }
    p.update(p.host);
    p.done = true;
    requestAnimationFrame(() => p.play && p.play(p.host));
  }

  /* ---------- 報價卡 ---------- */
  function quoteCard(code) {
    const s = DB.byCode.get(code);
    if (!s) return `<div class="dcard qcard"><h3>${esc(code)}</h3><p class="sub">目前沒有這檔的資料</p></div>`;
    const d = dig(s.price), dif = s.price - s.prev, t = tone(s.chgPct);
    const pos = s.high > s.low ? clamp((s.price - s.low) / (s.high - s.low) * 100, 0, 100) : 50;
    return `<div class="dcard qcard">
      <h3>${esc(s.name)} <span class="sub">${s.code}</span></h3>
      <div class="big ${t}">${fmt(s.price, d)}</div>
      <div class="sub ${t}">${dif >= 0 ? "▲" : "▼"} ${fmt(Math.abs(dif), d)}（${pct(s.chgPct)}）</div>
      <div class="rng"><div class="rngbar"><i class="rngdot" data-pos="${pos.toFixed(1)}" style="left:${pos.toFixed(1)}%"></i></div>
        <div class="rngtxt sub"><span>低 ${fmt(s.low, d)}</span><span>高 ${fmt(s.high, d)}</span></div></div>
      <div class="sub">開 ${fmt(s.open, d)} · 成交 ${fmt(s.volume)} 張</div></div>`;
  }
  panel("dpQuote", {
    build(h) { h.innerHTML = `<div class="tt-src"></div><div class="tgrid qgrid"></div>`; },
    update(h) {
      $(".tt-src", h).innerHTML = srcTag();
      $(".qgrid", h).innerHTML = WATCH.map(quoteCard).join("") || `<p class="empty">還沒有自選股，到「行情列表」點 ★ 加入。</p>`;
    },
    play(h) {
      const cards = $$(".qcard", h);
      rise(cards, 90);
      $$(".rngdot", h).forEach(dot => {
        if (reduced()) return;
        dot.animate([{ left: "0%" }, { left: dot.dataset.pos + "%" }], { duration: 900, delay: 200, easing: "cubic-bezier(.2,.9,.3,1)", fill: "backwards" });
      });
    },
  });

  /* ---------- K 線圖 ---------- */
  let chartCode = null, chartToken = 0, chartPlay = null;
  function candleSVG(cs) {
    const W = 560, H = 260, PT = 10, PB = 22, PL = 8, PR = 48, N = cs.length;
    const hi = Math.max(...cs.map(c => c.h)), lo = Math.min(...cs.map(c => c.l)), pad = (hi - lo) * 0.06 || 1;
    const top = hi + pad, bot = lo - pad;
    const X = i => PL + (W - PL - PR) * (i + 0.5) / N;
    const Y = v => PT + (H - PT - PB) * (top - v) / (top - bot);
    const bw = Math.max(3, (W - PL - PR) / N * 0.62);
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "K 線圖");
    const add = (parent, tag, attrs, cls) => {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (cls) e.setAttribute("class", cls);
      parent.appendChild(e); return e;
    };
    const grid = add(svg, "g", {});
    for (let k = 0; k <= 4; k++) {
      const y = PT + (H - PT - PB) * k / 4, v = top - (top - bot) * k / 4;
      add(grid, "line", { x1: PL, x2: W - PR, y1: y, y2: y }, "gridl");
      add(grid, "text", { x: W - PR + 6, y: y + 4 }).textContent = fmt(v, v < 100 ? 1 : 0);
    }
    const bodies = add(svg, "g", {}), wicks = add(svg, "g", {});
    const bl = [], wl = [];
    cs.forEach((c, i) => {
      const cls = c.c >= c.o ? "tk-up" : "tk-down", x = X(i);
      bl.push(add(bodies, "rect", { x: x - bw / 2, y: Y(Math.max(c.o, c.c)), width: bw, height: Math.max(1, Math.abs(Y(c.o) - Y(c.c))) }, cls));
      wl.push(add(wicks, "line", { x1: x, x2: x, y1: Y(c.h), y2: Y(c.l) }, "wick " + cls));
    });
    const sma = n => cs.map((_, i) => (i < n - 1 ? null : cs.slice(i - n + 1, i + 1).reduce((a, x) => a + x.c, 0) / n));
    const path = arr => arr.map((v, i) => (v == null ? "" : (i && arr[i - 1] != null ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1))).join("");
    const ma5 = add(svg, "path", { d: path(sma(5)), class: "ma5" });
    const ma20 = add(svg, "path", { d: path(sma(20)), class: "ma20" });
    const play = () => {
      bl.forEach((r, i) => { if (!reduced()) r.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 420, delay: i * 12, easing: "cubic-bezier(.2,.9,.3,1)", fill: "backwards" }); });
      const t0 = 420 + bl.length * 12;
      wl.forEach((w, i) => { if (!reduced()) w.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: t0 + i * 6, fill: "backwards" }); });
      sweep(ma5, 900, t0 + 200); sweep(ma20, 900, t0 + 400);
    };
    svg.classList.add("tt-candles");
    return { svg, play };
  }
  async function updateChart(h) {
    const p = P.dpChart;
    $(".tt-src", h).innerHTML = srcTag();
    const codes = WATCH.length ? WATCH : ["2330"];
    if (!codes.includes(chartCode)) chartCode = codes[0];
    $(".chips", h).innerHTML = codes.map(c => `<button type="button" class="chip" data-code="${esc(c)}" aria-pressed="${c === chartCode}">${esc(nameOf(c) || c)} ${esc(c)}</button>`).join("");
    const tok = ++chartToken, code = chartCode, box = $(".cbox", h), read = $(".cread", h);
    const cs = await getHist(code);
    if (tok !== chartToken) return;
    if (!cs) {
      box.innerHTML = `<p class="empty">這檔的歷史資料暫時無法載入，請到「設定」按「立即更新」。</p>`;
      read.textContent = ""; chartPlay = null; return;
    }
    const built = candleSVG(cs);
    box.replaceChildren(built.svg);
    const last = cs[cs.length - 1], d = dig(last.c);
    read.textContent = `最後一根：開 ${fmt(last.o, d)}　高 ${fmt(last.h, d)}　低 ${fmt(last.l, d)}　收 ${fmt(last.c, d)}`;
    chartPlay = built.play;
    if (p.el.classList.contains("on")) built.play();
  }
  panel("dpChart", {
    build(h) {
      h.innerHTML = `<div class="tt-src"></div><div class="chips" role="group" aria-label="選擇股票"></div>
        <div class="dcard"><h3>K 線 · 近 60 日（紅漲綠跌；實線 MA5、虛線 MA20）</h3><div class="cbox"><p class="empty">載入中…</p></div><p class="sub cread"></p></div>`;
      $(".chips", h).addEventListener("click", e => {
        const b = e.target.closest("button[data-code]"); if (!b) return;
        chartCode = b.dataset.code; updateChart(h);
      });
    },
    update(h) { updateChart(h); },
    play() { chartPlay && chartPlay(); },
  });

  /* ---------- 部位計算機 ---------- */
  function calcNums(h) {
    const v = f => Number($(`[data-f="${f}"]`, h).value);
    const code = $('[data-f="code"]', h).value, cap = v("cap"), risk = v("risk"), entry = v("entry"), stop = v("stop"), target = v("target");
    const per = entry - stop;
    let shares = 0;
    if (cap > 0 && risk > 0 && entry > 0 && per > 0) shares = Math.min(Math.floor(cap * risk / 100 / per), Math.floor(cap / (entry * (1 + FEE))));
    return { code, cap, entry, per, shares, cost: shares * entry, loss: shares * per, rr: target > entry && per > 0 ? (target - entry) / per : NaN };
  }
  function calcOut(h) {
    const r = calcNums(h), o = k => $(`[data-o="${k}"]`, h);
    const msg = $("[data-msg]", h);
    const ok = r.shares > 0;
    o("shares").textContent = ok ? fmt(r.shares) + " 股" : "—";
    o("lots").textContent = ok ? fmt(Math.floor(r.shares / 1000)) + " 張 + " + fmt(r.shares % 1000) + " 股" : "—";
    o("cost").textContent = ok ? "NT$" + fmt(r.cost) : "—";
    o("pct").textContent = ok && r.cap > 0 ? fmt(r.cost / r.cap * 100, 1) + "%" : "—";
    o("loss").textContent = ok ? "NT$" + fmt(r.loss) : "—";
    o("rr").textContent = Number.isFinite(r.rr) ? "1 : " + fmt(r.rr, 2) : "—";
    o("bar").style.width = ok && r.cap > 0 ? clamp(r.cost / r.cap * 100, 0, 100).toFixed(1) + "%" : "0%";
    msg.textContent = r.entry > 0 && r.per <= 0 ? "做多時停損價要低於進場價。" : (r.entry > 0 && r.cap > 0 && !ok ? "資金或停損距離不足，算不出股數。" : "");
  }
  panel("dpCalc", {
    build(h) {
      h.innerHTML = `<div class="tt-src"></div>
        <div class="dcard"><h3>部位計算機（依停損距離反推可買股數）</h3>
          <div class="fgrid">
            <label>股票<select data-f="code"></select></label>
            <label>總資金（NT$）<input data-f="cap" type="number" min="0" step="10000" value="1000000"></label>
            <label>單筆風險（%）<input data-f="risk" type="number" min="0" step="0.5" value="2"></label>
            <label>進場價<input data-f="entry" type="number" min="0" step="0.05"></label>
            <label>停損價<input data-f="stop" type="number" min="0" step="0.05"></label>
            <label>目標價（選填）<input data-f="target" type="number" min="0" step="0.05"></label>
          </div>
          <div class="btnrow"><button type="button" class="tb ghost" data-act="now">帶入現價</button><button type="button" class="tb" data-act="order">用這組數字模擬買進</button></div>
          <div class="kv">
            <span>可買股數</span><b data-o="shares">—</b>
            <span>換算張數</span><b data-o="lots">—</b>
            <span>部位金額</span><b data-o="cost">—</b>
            <span>占總資金</span><b data-o="pct">—</b>
            <span>停損時最大虧損</span><b data-o="loss">—</b>
            <span>報酬風險比（到目標價）</span><b data-o="rr">—</b>
          </div>
          <div class="meter"><i data-o="bar"></i></div>
          <p class="msg" data-msg></p></div>`;
      h.addEventListener("input", () => calcOut(h));
      h.addEventListener("change", e => {
        if (e.target.dataset.f === "code") $('[data-f="entry"]', h).value = px(e.target.value) || "";
        calcOut(h);
      });
      h.addEventListener("click", e => {
        const b = e.target.closest("button[data-act]"); if (!b) return;
        if (b.dataset.act === "now") { $('[data-f="entry"]', h).value = px($('[data-f="code"]', h).value) || ""; calcOut(h); return; }
        const r = calcNums(h);
        const err = r.shares > 0 ? trade("buy", r.code, r.shares) : "股數是 0，請檢查資金、風險與停損。";
        $("[data-msg]", h).textContent = err || `已模擬買進 ${fmt(r.shares)} 股（請到「模擬交易」查看）`;
      });
    },
    update(h) {
      $(".tt-src", h).innerHTML = srcTag();
      setOptions($('[data-f="code"]', h), WATCH);
      const entry = $('[data-f="entry"]', h);
      if (!entry.value) entry.value = px($('[data-f="code"]', h).value) || "";
      calcOut(h);
    },
    play(h) { growBars(h); },
  });

  /* ---------- 模擬交易 ---------- */
  panel("dpSim", {
    build(h) {
      h.innerHTML = `<div class="tt-src"></div>
        <div class="tgrid">
          <div class="dcard"><h3>總資產（模擬）</h3><div class="big" data-k="eq">—</div><div class="sub" data-k="eqsub"></div></div>
          <div class="dcard"><h3>可用現金</h3><div class="big" data-k="cash">—</div><div class="sub">起始資金 NT$1,000,000</div></div>
          <div class="dcard"><h3>未實現損益</h3><div class="big" data-k="upl">—</div><div class="sub" data-k="rl"></div></div>
        </div>
        <div class="dcard"><h3>下單（模擬，不會真的買賣）</h3>
          <div class="fgrid">
            <label>股票<select data-f="code"></select></label>
            <label>股數（1 張 = 1000 股）<input data-f="qty" type="number" min="1" step="1000" value="1000"></label>
          </div>
          <div class="btnrow"><button type="button" class="tb" data-side="buy">買進</button><button type="button" class="tb ghost" data-side="sell">賣出</button></div>
          <p class="msg" data-msg></p></div>
        <div class="dcard"><h3>持股</h3><div class="tblwrap"><table class="ttbl"><thead><tr><th class="l">股票</th><th>股數</th><th>均價</th><th>現價</th><th>市值</th><th>損益</th></tr></thead><tbody data-pos></tbody></table></div></div>
        <div class="dcard"><h3>最近成交</h3><div class="tblwrap"><table class="ttbl"><thead><tr><th class="l">時間</th><th class="l">買賣</th><th class="l">股票</th><th>股數</th><th>成交價</th><th>已實現</th></tr></thead><tbody data-trades></tbody></table></div></div>`;
      h.addEventListener("click", e => {
        const b = e.target.closest("button[data-side]"); if (!b) return;
        const code = $('[data-f="code"]', h).value, qty = Number($('[data-f="qty"]', h).value);
        const err = trade(b.dataset.side, code, qty);
        $("[data-msg]", h).textContent = err || (b.dataset.side === "buy" ? "已模擬買進" : "已模擬賣出");
      });
    },
    update(h) {
      $(".tt-src", h).innerHTML = srcTag();
      setOptions($('[data-f="code"]', h), [...new Set([...WATCH, ...heldCodes()])]);
      const t = totals(), k = n => $(`[data-k="${n}"]`, h);
      const realized = SIM.trades.filter(x => x.side === "sell").reduce((a, x) => a + x.pnl, 0);
      k("eq").textContent = fmt(t.eq);
      k("cash").textContent = fmt(t.cash);
      k("eqsub").textContent = `持股市值 ${fmt(t.inv)} · 相對起始資金 ${pct((t.eq / START - 1) * 100)}`;
      k("upl").textContent = (t.upl >= 0 ? "+" : "") + fmt(t.upl);
      k("upl").className = "big " + tone(t.upl);
      k("rl").textContent = `已實現損益 ${(realized >= 0 ? "+" : "") + fmt(realized)}`;
      $("[data-pos]", h).innerHTML = heldCodes().length ? heldCodes().map(c => {
        const p = SIM.pos[c], q = px(c) || p.avg, u = (q - p.avg) * p.qty;
        return `<tr><td class="l">${esc(nameOf(c))} ${c}</td><td>${fmt(p.qty)}</td><td>${fmt(p.avg, dig(p.avg))}</td><td>${fmt(q, dig(q))}</td><td>${fmt(p.qty * q)}</td><td class="${tone(u)}">${fmt(u)}（${pct((q / p.avg - 1) * 100)}）</td></tr>`;
      }).join("") : `<tr><td class="empty" colspan="6">還沒有持股</td></tr>`;
      $("[data-trades]", h).innerHTML = SIM.trades.length ? SIM.trades.slice(-12).reverse().map(x =>
        `<tr><td class="l">${esc(x.t)}</td><td class="l ${x.side === "buy" ? "up" : "down"}">${x.side === "buy" ? "買進" : "賣出"}</td><td class="l">${x.code} ${esc(nameOf(x.code))}</td><td>${fmt(x.qty)}</td><td>${fmt(x.price, dig(x.price))}</td><td class="${x.pnl == null ? "" : tone(x.pnl)}">${x.pnl == null ? "—" : fmt(x.pnl)}</td></tr>`).join("")
        : `<tr><td class="empty" colspan="6">還沒有成交紀錄</td></tr>`;
    },
    play(h) { rise($$("tbody tr", h), 40); },
  });

  /* ---------- 風險評估 ---------- */
  panel("dpRisk", {
    build(h) { h.innerHTML = ""; },
    update(h) {
      const t = totals(), eq = t.eq || START;
      const invPct = t.inv / eq * 100, cashPct = t.cash / eq * 100;
      const top = heldCodes().map(c => ({ c, w: mv(c) / eq * 100 })).sort((a, b) => b.w - a.w)[0];
      const drop10 = t.inv * 0.1 / eq * 100;
      const topW = top ? top.w : 0;
      const level = topW > 30 || invPct > 80 ? "偏高" : topW > 15 || invPct > 50 ? "中等" : "偏低";
      h.innerHTML = `<div class="dcard"><h3>風險等級</h3><div class="big ${level === "偏高" ? "up" : level === "偏低" ? "down" : ""}">${level}</div>
          <div class="sub">依持股集中度與總曝險粗略判斷，只是模擬帳戶的參考，不是投資建議。</div></div>
        <div class="dcard"><h3>風險指標（占總資產）</h3>
          ${bar("總曝險（持股占比）", invPct)}
          ${bar("最大單一持股", topW, top ? nameOf(top.c) + " " + top.c : "尚無持股")}
          ${bar("若全部下跌 10% 的損失", drop10)}
          ${bar("現金比例", cashPct)}
        </div>`;
    },
    play(h) { growBars(h); },
  });

  /* ---------- 交易績效 ---------- */
  function linePath(pts, W = 560, H = 200) {
    const min = Math.min(0, ...pts), max = Math.max(0, ...pts), span = max - min || 1, pad = 14;
    const X = i => pad + (W - pad * 2) * (pts.length > 1 ? i / (pts.length - 1) : 0.5);
    const Y = v => pad + (H - pad * 2) * (max - v) / span;
    const d = pts.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="累計已實現損益曲線">
      <line x1="${pad}" x2="${W - pad}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="gridl"/>
      <path class="perfline draw" d="${d}" fill="none" stroke="var(--c4)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  panel("dpPerf", {
    build(h) { h.innerHTML = ""; },
    update(h) {
      const pn = SIM.trades.filter(x => x.side === "sell").map(x => x.pnl);
      const sum = a => a.reduce((x, y) => x + y, 0);
      const wins = pn.filter(x => x > 0), losses = pn.filter(x => x <= 0);
      const total = sum(pn), gw = sum(wins), gl = sum(losses);
      const stats = [
        ["已實現損益", (total >= 0 ? "+" : "") + fmt(total), tone(total)],
        ["勝率", pn.length ? fmt(wins.length / pn.length * 100, 1) + "%" : "—", ""],
        ["賣出次數", fmt(pn.length), ""],
        ["平均獲利", wins.length ? "+" + fmt(gw / wins.length) : "—", "up"],
        ["平均虧損", losses.length ? fmt(gl / losses.length) : "—", "down"],
        ["獲利因子", gl < 0 ? fmt(gw / Math.abs(gl), 2) : "—", ""],
      ];
      let cum = 0;
      const pts = [0, ...pn.map(v => (cum += v))];
      h.innerHTML = `<div class="tgrid">${stats.map(([k, v, c]) =>
          `<div class="dcard"><h3>${k}</h3><div class="big ${c}">${v}</div></div>`).join("")}</div>
        <div class="dcard"><h3>累計已實現損益曲線</h3>${pn.length
          ? linePath(pts)
          : `<p class="empty">還沒有賣出紀錄。先到「模擬交易」買進再賣出，這裡就會畫出績效曲線。</p>`}</div>`;
    },
    play(h) {
      rise($$(".dcard", h), 80);
      sweep($(".perfline", h), 1100, 300);
    },
  });

  /* ---------- 持倉分布 ---------- */
  const COL = ["#8EB69B", "#DAF1DE", "#4cc38a", "#ffb84d", "#7aa7ff", "#ff8fa3", "#c2a6ff", "#5fd4d4", "#e6e27a", "#a0a0a0"];
  panel("dpHold", {
    build(h) {
      h.innerHTML = `<div class="tt-src"></div><div class="dcard"><h3>模擬持倉分布（含現金）</h3><div class="donutwrap"><div class="donut" data-donut></div><ul class="legend" data-legend></ul></div></div>`;
    },
    update(h) {
      $(".tt-src", h).innerHTML = srcTag();
      const t = totals();
      const parts = heldCodes().map(c => ({ label: nameOf(c) + " " + c, v: mv(c) })).filter(x => x.v > 0);
      parts.push({ label: "現金", v: t.cash, cash: true });
      const total = parts.reduce((a, x) => a + x.v, 0) || 1;
      let cum = 0, i = 0;
      const segs = parts.map(x => {
        const f = x.v / total, color = x.cash ? "var(--c3)" : COL[i++ % COL.length];
        const s = `<circle class="seg" data-f="${f.toFixed(5)}" cx="100" cy="100" r="70" pathLength="1" stroke="${color}" stroke-dasharray="${f.toFixed(5)} 1" stroke-dashoffset="${(-cum).toFixed(5)}"/>`;
        cum += f; return { s, color, x, f };
      });
      $("[data-donut]", h).innerHTML = `<svg viewBox="0 0 200 200" role="img" aria-label="持倉分布圓餅圖">
        <g transform="rotate(-90 100 100)"><circle class="ringbg" cx="100" cy="100" r="70"/>${segs.map(o => o.s).join("")}</g>
        <text x="100" y="98" class="dn-s">總資產</text><text x="100" y="120" font-size="16" font-weight="700">${fmt(t.eq)}</text></svg>`;
      $("[data-legend]", h).innerHTML = segs.map(o =>
        `<li><i style="background:${o.color}"></i><span class="lbl">${esc(o.x.label)}</span><b>${fmt(o.f * 100, 1)}%</b><span>${fmt(o.x.v)}</span></li>`).join("");
    },
    play(h) {
      if (reduced()) return;
      $$(".seg", h).forEach((c, i) => {
        const f = c.dataset.f;
        c.animate([{ strokeDasharray: "0 1" }, { strokeDasharray: f + " 1" }], { duration: 800, delay: i * 140, easing: "cubic-bezier(.3,.7,.3,1)", fill: "backwards" });
      });
      rise($$(".legend li", h), 90);
    },
  });

  /* ---------- 恐懼貪婪 ---------- */
  const BANDS = ["#4cc38a", "#9ad65c", "#e6c84a", "#ff9f5a", "#ff6b6b"];
  function arcPath(a1, a2, r = 80) {
    const x = a => 100 + r * Math.cos(a * Math.PI / 180), y = a => 100 - r * Math.sin(a * Math.PI / 180);
    return `M${x(a1).toFixed(2)} ${y(a1).toFixed(2)} A${r} ${r} 0 0 1 ${x(a2).toFixed(2)} ${y(a2).toFixed(2)}`;
  }
  panel("dpFear", {
    build(h) { h.innerHTML = `<div class="tt-src"></div><div class="dcard"><h3>市場情緒（恐懼 ↔ 貪婪）</h3><div class="gauge" data-g></div><div class="gbig" data-big></div><div class="sub" data-sub style="text-align:center"></div></div><div class="dcard"><h3>怎麼算的</h3><p class="sub" data-how></p></div>`; },
    update(h) {
      $(".tt-src", h).innerHTML = srcTag();
      const list = DB.list, n = list.length || 1;
      const up = list.filter(s => s.chgPct > 0).length, dn = list.filter(s => s.chgPct < 0).length;
      const avg = list.reduce((a, s) => a + s.chgPct, 0) / n;
      const score = clamp(0.6 * (up / n * 100) + 0.4 * clamp(50 + avg * 12, 0, 100), 0, 100);
      const band = score < 25 ? "極度恐懼" : score < 45 ? "恐懼" : score < 55 ? "中性" : score < 75 ? "貪婪" : "極度貪婪";
      const arcs = BANDS.map((c, i) => `<path class="gband" stroke="${c}" d="${arcPath(180 - 36 * i, 180 - 36 * (i + 1))}"/>`).join("");
      $("[data-g]", h).innerHTML = `<svg viewBox="0 0 200 118" role="img" aria-label="恐懼貪婪儀表">${arcs}
        <text x="22" y="114">恐懼</text><text x="178" y="114">貪婪</text>
        <g class="needle" style="transform:rotate(${(-90 + score * 1.8).toFixed(1)}deg)"><line x1="100" y1="100" x2="100" y2="32"/></g>
        <circle class="hub" cx="100" cy="100" r="5"/></svg>`;
      $("[data-big]", h).textContent = fmt(score, 0) + " · " + band;
      $("[data-sub]", h).textContent = `上漲 ${fmt(up)} 檔 · 下跌 ${fmt(dn)} 檔 · 平均漲跌 ${pct(avg)}`;
      $("[data-how]", h).textContent = "以最近一個交易日的上漲家數比例（六成）與平均漲跌幅（四成）推算，範圍 0–100。這是本站自己的簡易指標，不是官方或任何機構發布的恐懼貪婪指數。";
    },
    play(h) {
      const needle = $(".needle", h); if (!needle || reduced()) return;
      const target = needle.style.transform.match(/rotate\((.+)\)/)[1];
      needle.animate([{ transform: "rotate(-90deg)" }, { transform: "rotate(" + target + ")" }], { duration: 1200, easing: "cubic-bezier(.3,1.3,.5,1)", fill: "backwards" });
      $$(".gband", h).forEach((b, i) => b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: i * 90, fill: "backwards" }));
    },
  });

  /* ---------- 行情列表 ---------- */
  function renderRows(h) {
    const q = ($('[data-f="q"]', h).value || "").trim();
    const rows = DB.list.filter(s => !q || s.code.includes(q) || s.name.includes(q))
      .sort((a, b) => ((a[SORT.key] > b[SORT.key]) ? 1 : (a[SORT.key] < b[SORT.key]) ? -1 : 0) * SORT.dir);
    const shown = rows.slice(0, 80);
    $("[data-count]", h).textContent = `共 ${fmt(rows.length)} 檔${rows.length > shown.length ? "，先顯示前 80 檔，請輸入代號縮小範圍" : ""}`;
    $("[data-rows]", h).innerHTML = shown.map(s => {
      const d = dig(s.price), starred = WATCH.includes(s.code);
      return `<tr><td class="l"><button type="button" class="starbtn" data-star="${s.code}" aria-pressed="${starred}" aria-label="加入或移除自選股">★</button></td>
        <td class="l">${s.code}</td><td class="l">${esc(s.name)}</td><td>${fmt(s.price, d)}</td><td class="${tone(s.chgPct)}">${pct(s.chgPct)}</td><td>${fmt(s.volume)}</td></tr>`;
    }).join("") || `<tr><td class="empty" colspan="6">找不到符合的股票</td></tr>`;
  }
  panel("dpList", {
    build(h) {
      h.innerHTML = `<div class="tt-src"></div><div class="dcard">
        <div class="fgrid"><label>搜尋代號或名稱<input data-f="q" type="search" placeholder="例如 2330 或 台積"></label></div>
        <p class="sub" data-count></p>
        <div class="tblwrap"><table class="ttbl"><thead><tr>
          <th class="l">自選</th>
          <th class="l sort" data-sort="code">代號</th><th class="l sort" data-sort="name">名稱</th>
          <th class="sort" data-sort="price">收盤</th><th class="sort" data-sort="chgPct">漲跌</th><th class="sort" data-sort="volume">成交量（張）</th>
        </tr></thead><tbody data-rows></tbody></table></div></div>`;
      $('[data-f="q"]', h).addEventListener("input", () => renderRows(h));
      h.addEventListener("click", e => {
        const st = e.target.closest("button[data-star]");
        if (st) { toggleWatch(st.dataset.star); return; }
        const th = e.target.closest("th[data-sort]"); if (!th) return;
        const k = th.dataset.sort;
        SORT = SORT.key === k ? { key: k, dir: -SORT.dir } : { key: k, dir: (k === "code" || k === "name") ? 1 : -1 };
        renderRows(h);
      });
    },
    update(h) { $(".tt-src", h).innerHTML = srcTag(); renderRows(h); },
    play(h) { rise($$("tbody tr", h).slice(0, 30), 22); },
  });

  /* ---------- 到價提醒 ---------- */
  panel("dpAlert", {
    build(h) {
      h.innerHTML = `<div class="tt-src"></div>
        <div class="dcard"><h3>新增到價提醒</h3>
          <div class="fgrid">
            <label>股票<select data-f="code"></select></label>
            <label>條件<select data-f="dir"><option value="above">價格高於</option><option value="below">價格低於</option></select></label>
            <label>目標價<input data-f="price" type="number" min="0" step="0.05"></label>
          </div>
          <div class="btnrow"><button type="button" class="tb ghost" data-act="fill">帶入現價</button><button type="button" class="tb" data-act="add">新增提醒</button></div>
          <p class="msg" data-msg></p></div>
        <div class="dcard"><h3>提醒清單</h3><div data-list></div></div>`;
      h.addEventListener("click", e => {
        const del = e.target.closest("button[data-del]");
        if (del) { ALERTS = ALERTS.filter(a => a.id !== del.dataset.del); store.set("twtrade-alerts", ALERTS); emit(); return; }
        const b = e.target.closest("button[data-act]"); if (!b) return;
        const code = $('[data-f="code"]', h).value, msg = $("[data-msg]", h);
        if (b.dataset.act === "fill") { $('[data-f="price"]', h).value = px(code) || ""; return; }
        const price = Number($('[data-f="price"]', h).value);
        if (!(price > 0)) { msg.textContent = "請輸入大於 0 的目標價。"; return; }
        ALERTS.push({ id: String(Date.now()), code, dir: $('[data-f="dir"]', h).value, price, hit: "" });
        store.set("twtrade-alerts", ALERTS);
        msg.textContent = "已新增。"; emit();
      });
    },
    update(h) {
      $(".tt-src", h).innerHTML = srcTag();
      setOptions($('[data-f="code"]', h), WATCH);
      $("[data-list]", h).innerHTML = ALERTS.length ? ALERTS.map(a => {
        const s = DB.byCode.get(a.code);
        return `<div class="arow"><div><b>${esc(a.code)} ${esc(s ? s.name : "")}</b>
          <div class="sub">${a.dir === "above" ? "高於" : "低於"} ${fmt(a.price, dig(a.price))} · 現價 ${s ? fmt(s.price, dig(s.price)) : "—"}</div></div>
          <div class="aright"><span class="pill2 ${a.hit ? "hit" : ""}">${a.hit ? "已於 " + esc(a.hit) + " 觸發" : "待觸發"}</span>
          <button type="button" class="tb sm ghost" data-del="${esc(a.id)}">刪除</button></div></div>`;
      }).join("") : `<p class="empty">還沒有提醒。</p>`;
    },
    play(h) { rise($$(".arow", h), 80); },
  });

  /* ---------- 設定 ---------- */
  panel("dpSet", {
    build(h) {
      h.innerHTML = `<div class="dcard"><h3>資料來源</h3>
          <div class="btnrow">
            <button type="button" class="tb ghost" data-src="live" aria-pressed="false">TWSE 公開資料</button>
            <button type="button" class="tb ghost" data-src="sample" aria-pressed="false">示意資料</button>
            <button type="button" class="tb" data-act="now">立即更新</button>
          </div>
          <div class="kv" data-info></div>
          <p class="sub" style="margin-top:12px">TWSE 公開資料是最近一個交易日的收盤與日內價格，不是逐筆即時報價。若瀏覽器連不到 TWSE，會自動改用示意資料並說明原因。本頁不提供投資建議。</p></div>
        <div class="dcard"><h3>本機資料</h3><p class="sub">模擬帳戶、自選股與到價提醒只存在這台瀏覽器。</p>
          <div class="btnrow">
            <button type="button" class="tb ghost" data-act="resetSim">清空模擬帳戶</button>
            <button type="button" class="tb ghost" data-act="clearAlerts">清空到價提醒</button>
            <button type="button" class="tb ghost" data-act="resetWatch">還原預設自選股</button>
            <button type="button" class="tb ghost" data-act="notify">開啟到價通知</button>
          </div><p class="msg" data-msg></p></div>`;
      h.addEventListener("click", async e => {
        const b = e.target.closest("button"); if (!b) return;
        const msg = $("[data-msg]", h);
        if (b.dataset.src) { DB.want = b.dataset.src; store.set("twtrade-source", DB.want); await refresh(); return; }
        const act = b.dataset.act;
        if (act === "now") { msg.textContent = "更新中…"; await refresh(); msg.textContent = DB.error || "已更新"; }
        else if (act === "resetSim") {
          if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "再按一次確認清空"; return; }
          SIM = emptySim(); saveSim(); delete b.dataset.armed; b.textContent = "清空模擬帳戶";
          msg.textContent = "已清空，現金回到 NT$1,000,000。"; emit();
        }
        else if (act === "clearAlerts") { ALERTS = []; store.set("twtrade-alerts", ALERTS); msg.textContent = "已清空提醒。"; emit(); }
        else if (act === "resetWatch") { WATCH = DEFAULT_WATCH.slice(); store.set("twtrade-watch", WATCH); msg.textContent = "已還原。"; emit(); }
        else if (act === "notify") {
          try {
            const r = await Notification.requestPermission();
            msg.textContent = r === "granted" ? "已開啟；只有即時資料模式才會發通知。" : "瀏覽器沒有允許通知。";
          } catch (err) { msg.textContent = "這個瀏覽器不支援通知。"; }
        }
      });
    },
    update(h) {
      $$("[data-src]", h).forEach(x => x.setAttribute("aria-pressed", String(x.dataset.src === DB.want)));
      $("[data-info]", h).innerHTML = `<span>目前顯示</span><b>${DB.source === "live" ? "TWSE 公開資料" : "示意資料"}</b>
        <span>更新時間</span><b>${esc(DB.updated || "—")}</b><span>自選股</span><b>${WATCH.length} 檔</b><span>到價提醒</span><b>${ALERTS.length} 組</b>
        ${DB.error ? `<span>提示</span><b class="warn">${esc(DB.error)}</b>` : ""}`;
    },
  });

  /* ---------- wiring ---------- */
  function openObserver() {
    const mo = new MutationObserver(ms => ms.forEach(m => { if (m.target.classList.contains("on")) show(m.target.id); }));
    Object.keys(P).forEach(id => mo.observe(P[id].el, { attributes: true, attributeFilter: ["class"] }));
  }
  function scrollObserver() {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(es => es.forEach(e => {
      const p = P[e.target.dataset.pid]; if (!p) return;
      if (e.intersectionRatio === 0) p.done = false;
      else if (e.intersectionRatio >= 0.25 && !p.done && p.el.classList.contains("on")) { p.done = true; p.play && p.play(p.host); }
    }), { threshold: [0, 0.25] });
    Object.keys(P).forEach(id => { P[id].host.dataset.pid = id; io.observe(P[id].host); });
  }

  useSample();
  openObserver();
  scrollObserver();
  refresh();
  /* sidebar groups: the user can point at which panel is open through the existing tabs */
})();
