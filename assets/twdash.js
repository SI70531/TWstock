/* TWstock dashboard — tabs with a gliding pill; every panel redraws its charts when you open it:
   lines draw themselves, bars grow, numbers count up.
   Data: TWSE open data for the latest trading day (see the DATA block). Sample numbers are used only when TWSE
   cannot be reached, and the banner then says so. */
(function () {
  "use strict";
  const root = document.getElementById("dash");
  if (!root) return;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";
  const ease = t => 1 - Math.pow(1 - t, 3);
  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => Array.from(r.querySelectorAll(s));
  const fmt = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  /* ---------------- DATA ----------------
     Live: TWSE open data. FMTQIK (TAIEX and market turnover, one month per request), BFI82U (the three institutional
     investors, by amount) and MI_INDEX (sector indices). Finished months are kept in this browser, so later visits only
     ask for the current month. If the index itself cannot be loaded the panels show clearly labelled sample numbers;
     a part that cannot be loaded on its own (institutions, sectors, advancers) shows "—", never a made-up figure.
     Row shape used everywhere: [yyyymmdd, shares 億股, value 億元, trades 萬筆, index, change in points]. */
  const num = v => { const n = parseFloat(String(v == null ? "" : v).replace(/[,\s%]/g, "").replace(/^\+/, "")); return Number.isFinite(n) ? n : NaN; };
  const ok = Number.isFinite;
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const J = url => fetch(url, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("TWSE " + r.status); return r.json(); });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  /* "115/11/03" (ROC year), "2026/11/03" and "1151103" all become "20261103" */
  const ymd = v => { const m = String(v).match(/(\d{2,4})\D?(\d{2})\D?(\d{2})/); if (!m) return ""; let y = +m[1]; if (y < 1911) y += 1911; return y + m[2] + m[3]; };
  const shortDay = ds => +ds.slice(4, 6) + "/" + +ds.slice(6);
  const toRow = (d, sh, val, tx, ix, ch) => [ymd(d), num(sh) / 1e8, num(val) / 1e8, num(tx) / 1e4, num(ix), num(ch)];
  const good = r => r[0] && r[4] > 0 && r[2] > 0;

  async function loadMonth(ym, finished) {
    const key = "twdash-m-" + ym, hit = finished && ls.get(key);
    if (hit && hit.length) return hit;
    const j = await J(`https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date=${ym}01&response=json`);
    if (j.stat !== "OK" || !Array.isArray(j.data)) return [];
    const rows = j.data.map(r => toRow(r[0], r[1], r[2], r[3], r[4], r[5])).filter(good);
    if (finished && rows.length) ls.set(key, rows);
    return rows;
  }
  /* four months give the 60 days on the chart plus the run-up the 20-day average needs */
  async function loadIndex() {
    const now = new Date(), out = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1), ym = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0");
      if (i && !ls.get("twdash-m-" + ym)) await wait(450);          /* go easy on TWSE */
      try { out.unshift(...(await loadMonth(ym, i > 0))); }
      catch (e) { if (!out.length) throw e; break; }
    }
    return out;
  }
  /* second route: the open-data mirror (current month only) */
  async function loadIndexOpen() {
    const a = await J("https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK");
    return a.map(x => toRow(x.Date, x.TradeVolume, x.TradeValue, x.Transaction, x.TAIEX, x.Change)).filter(good);
  }
  async function loadInst(dates) {
    for (const ds of dates) {
      try {
        const j = await J(`https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate=${ds}&response=json`);
        if (j.stat !== "OK" || !Array.isArray(j.data) || !j.data.length) { await wait(450); continue; }
        const o = { date: ds, f: 0, t: 0, d: 0, all: NaN, buy: NaN, sell: NaN };
        let seen = 0;
        j.data.forEach(r => {
          const n = String(r[0]).replace(/\s/g, ""), v = num(r[3]) / 1e8; if (!ok(v)) return;
          if (n.includes("合計")) { o.all = v; o.buy = num(r[1]) / 1e8; o.sell = num(r[2]) / 1e8; }
          else if (n.includes("外資")) { o.f += v; seen++; } else if (n.includes("投信")) { o.t += v; seen++; } else if (n.includes("自營")) { o.d += v; seen++; }
        });
        if (!seen) return null;
        if (!ok(o.all)) o.all = o.f + o.t + o.d;
        return o;
      } catch (e) { return null; }
    }
    return null;
  }
  async function loadSectors() {
    try {
      const a = await J("https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX"), rows = [];
      a.forEach(x => {
        const ks = Object.keys(x), kn = ks.find(k => k === "指數") || ks.find(k => k.includes("指數") && !k.includes("收盤")), kp = ks.find(k => k.includes("百分比")), kd = ks.find(k => k === "漲跌");
        const name = String(x[kn] || "").trim(), dir = String(x[kd] || "").trim(); let v = num(x[kp]);
        if (!/類指數$/.test(name) || /報酬/.test(name) || !ok(v)) return;
        if (/^[-－]/.test(dir)) v = -Math.abs(v); else if (/^[+＋]/.test(dir)) v = Math.abs(v);
        rows.push([name.replace(/類指數$/, ""), v]);
      });
      return rows.length ? rows.sort((p, q) => q[1] - p[1]) : null;
    } catch (e) { return null; }
  }
  /* advancers and decliners are counted from the quote list the trading tools already load (it includes ETFs) */
  function breadth() {
    const T = window.TWT;
    if (!T || !T.DB || T.DB.source !== "live" || !T.DB.list.length) return null;
    const o = { up: 0, down: 0, flat: 0 };
    T.DB.list.forEach(x => { if (x.chgPct > 0) o.up++; else if (x.chgPct < 0) o.down++; else o.flat++; });
    return o;
  }
  function compose(rows, inst, sectors, live) {
    const n = Math.min(60, rows.length), off = rows.length - n, cutRows = rows.slice(off);
    const last = rows[rows.length - 1], prev = rows[rows.length - 2] || last;
    const ma = cutRows.map((_, i) => { const j = off + i; if (j < 19) return null; let t = 0; for (let k = j - 19; k <= j; k++) t += rows[k][4]; return t / 20; });
    const base = last[4] - last[5];
    if (inst) { const day = rows.find(r => r[0] === inst.date); inst.ratio = day && ok(inst.buy) && ok(inst.sell) ? (inst.buy + inst.sell) / 2 / day[2] * 100 : NaN; }
    return {
      live, date: last[0], idx: cutRows.map(r => r[4]), ma, val: cutRows.map(r => r[2]), days: cutRows.map(r => shortDay(r[0])),
      last: last[4], chg: last[5], chgPct: base > 0 ? last[5] / base * 100 : NaN,
      value: last[2], valuePct: prev[2] > 0 ? (last[2] / prev[2] - 1) * 100 : NaN, shares: last[1], trades: last[3],
      inst: inst || null, sectors: sectors || null, breadth: null,
    };
  }
  /* sample numbers (示意資料): used only when TWSE cannot be reached */
  function sample() {
    let seed = 20261031; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const rows = [], d = new Date(); let v = 44800;
    const dates = []; while (dates.length < 80) { if (d.getDay() % 6) dates.unshift(d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0")); d.setDate(d.getDate() - 1); }
    dates.forEach(ds => { const ch = (rnd() - 0.47) * 620; v += ch; rows.push([ds, 80 + rnd() * 50, 7400 + rnd() * 3800, 380 + rnd() * 160, Math.round(v * 100) / 100, Math.round(ch * 100) / 100]); });
    const D = compose(rows, { date: rows[rows.length - 1][0], f: 86.4, t: 12.7, d: -9.3, all: 89.8, buy: 3310, sell: 3220.2 },
      [["半導體", 3.4], ["生技醫療", 2.1], ["電子零組件", 1.8], ["金融保險", 0.9], ["電信", 0.3], ["航運", -0.6], ["鋼鐵", -1.2]], false);
    D.breadth = { up: 912, down: 648, flat: 84 };
    return D;
  }

  /* ---------------- helpers ---------------- */
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; };
  const run = (ms, fn, delay = 0) => new Promise(res => {
    if (reduced()) { fn(1); res(); return; }
    const t0 = performance.now() + delay;
    (function f(now) { const t = Math.max(0, Math.min(1, (now - t0) / ms)); fn(ease(t)); t < 1 ? requestAnimationFrame(f) : res(); })(performance.now());
  });
  function drawLine(path, ms, delay) {
    const L = path.getTotalLength();
    path.style.strokeDasharray = L; path.style.strokeDashoffset = L;
    return run(ms, t => { path.style.strokeDashoffset = L * (1 - t); if (t === 1) { path.style.strokeDasharray = path.dataset.dash || ""; path.style.strokeDashoffset = ""; } }, delay);
  }
  function countUp(node) {
    if (node.dataset.to === "" || node.dataset.to == null) { node.textContent = "—"; return Promise.resolve(); }
    const to = +node.dataset.to, d = +(node.dataset.d || 0), pre = node.dataset.pre || "", suf = node.dataset.suf || "";
    return run(1100, t => { node.textContent = pre + fmt(to * t, d) + suf; });
  }

  /* ---------------- charts ---------------- */
  function lineChart(host, series, opts) {
    const W = 520, H = 200, L = 6, R = 6, T = 10, B = 22;
    const all = series.flat().filter(v => v != null), lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.08 || 1;
    const X = i => L + (W - L - R) * i / Math.max(1, series[0].length - 1), Y = x => T + (H - T - B) * (1 - (x - (lo - pad)) / (hi - lo + 2 * pad));
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label });
    const defs = el("defs", {}, svg), gid = "dg-area" + (lineChart.n = (lineChart.n || 0) + 1), g = el("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: 0, style: "stop-color:var(--c4);stop-opacity:.34" }, g); el("stop", { offset: 1, style: "stop-color:var(--c4);stop-opacity:0" }, g);
    for (let k = 0; k <= 4; k++) { const y = T + (H - T - B) * k / 4; el("line", { x1: L, x2: W - R, y1: y, y2: y, class: "gridl" }, svg); }
    const pts = s => s.map((x, i) => (x == null ? "" : `${i && s[i - 1] != null ? "L" : "M"}${X(i).toFixed(1)},${Y(x).toFixed(1)}`)).join("");
    const area = el("path", { d: pts(series[0]) + `L${X(series[0].length - 1)},${H - B}L${L},${H - B}Z`, class: "area" }, svg);
    const cid = "dg-clip" + lineChart.n, cp = el("clipPath", { id: cid }, defs), clipRect = el("rect", { x: 0, y: 0, width: 0, height: H }, cp);
    area.setAttribute("clip-path", "url(#" + cid + ")"); area.style.fill = "url(#" + gid + ")";
    area.style.color = "var(--c4)"; area.style.opacity = 0;
    const main = el("path", { d: pts(series[0]), class: "ln" }, svg);
    let second = null;
    if (series[1] && series[1].some(v => v != null)) { second = el("path", { d: pts(series[1]), class: "ln2" }, svg); second.dataset.dash = "5 5"; }
    const dot = el("circle", { r: 5, fill: "var(--c5)", stroke: "var(--c4)", "stroke-width": 2, opacity: 0 }, svg);
    (opts.xl || []).forEach(([i, t]) => { const tx = el("text", { x: X(i), y: H - 6, "text-anchor": i === 0 ? "start" : i === series[0].length - 1 ? "end" : "middle" }, svg); tx.textContent = t; });
    host.replaceChildren(svg);
    const tip = document.createElement("div"); tip.className = "dtip"; host.style.position = "relative"; host.appendChild(tip);
    const show = i => {
      dot.setAttribute("cx", X(i)); dot.setAttribute("cy", Y(series[0][i])); dot.setAttribute("opacity", 1);
      tip.textContent = `${opts.xs ? opts.xs[i] : "第 " + (i + 1) + " 日"}　${fmt(series[0][i])}`; tip.style.opacity = 1;
      tip.style.left = Math.min(host.clientWidth - 130, Math.max(0, X(i) / W * host.clientWidth - 50)) + "px"; tip.style.top = "0px";
    };
    svg.addEventListener("pointermove", e => { const r = svg.getBoundingClientRect(); show(Math.max(0, Math.min(series[0].length - 1, Math.round(((e.clientX - r.left) / r.width * W - L) / (W - L - R) * (series[0].length - 1))))); });
    svg.addEventListener("pointerleave", () => { dot.setAttribute("opacity", 0); tip.style.opacity = 0; });
    /* the shaded area under the line is revealed left to right together with the line that draws it (it never shows up before the line) */
    return () => { dot.setAttribute("opacity", 0); area.style.opacity = 1; clipRect.setAttribute("width", 0);
      return Promise.all([drawLine(main, 1500), second ? drawLine(second, 1500, 250) : 0, run(1500, t => { clipRect.setAttribute("width", t >= 1 ? W : (W - L - R) * t + L); })]); };
  }

  function barChart(host, rows, top) {
    const W = 520, rowH = 34, H = rows.length * rowH + 6, mid = 260, scale = Math.min(56, 170 / Math.max(0.5, top || 0, ...rows.map(r => Math.abs(r[1]))));
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "產業漲跌幅" });
    el("line", { x1: mid, x2: mid, y1: 0, y2: H, class: "gridl" }, svg);
    const bars = rows.map(([name, val], i) => {
      const w = Math.abs(val) * scale, y = i * rowH + 4;
      const r = el("rect", { x: val >= 0 ? mid : mid - w, y, width: w, height: 22, rx: 5, class: "bar" + (val < 0 ? " neg" : "") }, svg);
      r.style.transformOrigin = val >= 0 ? "0% 50%" : "100% 50%"; r.style.transform = "scaleX(0)";
      const t = el("text", { x: val >= 0 ? mid + w + 8 : mid - w - 8, y: y + 15, "text-anchor": val >= 0 ? "start" : "end" }, svg); t.textContent = `${val > 0 ? "+" : ""}${val.toFixed(2)}%`; t.style.opacity = 0;
      const n = el("text", { x: val >= 0 ? mid - 8 : mid + 8, y: y + 15, "text-anchor": val >= 0 ? "end" : "start" }, svg); n.textContent = name; n.style.fill = "var(--c5)";
      return [r, t];
    });
    host.replaceChildren(svg);
    return () => Promise.all(bars.map(([r, t], i) => run(700, k => { r.style.transform = `scaleX(${k})`; t.style.opacity = k; }, i * 90)));
  }

  function columnChart(host, data, ends) {
    const W = 520, H = 170, B = 18, n = data.length, bw = W / n * 0.62, max = Math.max(...data);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "成交金額" });
    const bars = data.map((x, i) => { const h = (H - B - 6) * x / max, r = el("rect", { x: W / n * i + (W / n - bw) / 2, y: H - B - h, width: bw, height: h, rx: 2, class: "bar" }, svg); r.style.transform = "scaleY(0)"; r.style.opacity = .4 + .6 * x / max; return r; });
    [[ends[0], 0, "start"], [ends[1], W, "end"]].forEach(([t, x, a]) => { const tx = el("text", { x, y: H - 3, "text-anchor": a }, svg); tx.textContent = t; });
    host.replaceChildren(svg);
    return () => Promise.all(bars.map((r, i) => run(520, k => { r.style.transform = `scaleY(${k})`; }, i * 14)));
  }

  function donut(host, rows) {
    const S = 220, c = S / 2, r = 78, C = 2 * Math.PI * r, tot = rows.reduce((a, x) => a + x[1], 0);
    const svg = el("svg", { viewBox: `0 0 ${S} ${S}`, role: "img", "aria-label": "三大法人與散戶成交占比", style: "max-width:240px;margin:8px auto 0" });
    el("circle", { cx: c, cy: c, r, fill: "none", stroke: "var(--c2)", "stroke-width": 26 }, svg);
    let acc = 0;
    const arcs = rows.map(([, val, col]) => {
      const len = C * val / tot, a = el("circle", { cx: c, cy: c, r, fill: "none", stroke: col, "stroke-width": 26, transform: `rotate(${-90 + 360 * acc / tot} ${c} ${c})` }, svg);
      a.style.strokeDasharray = `0 ${C}`; const o = { a, len }; acc += val; return o;
    });
    const mid = el("text", { x: c, y: c + 6, "text-anchor": "middle", style: "font-size:20px;font-weight:650;fill:var(--c5)" }, svg); mid.textContent = "0%";
    host.replaceChildren(svg);
    const lg = document.createElement("div"); lg.className = "legend";
    lg.innerHTML = rows.map(([n, val, col]) => `<span><i style="background:${col}"></i>${n} ${val}%</span>`).join(""); host.appendChild(lg);
    return () => run(1300, t => { arcs.forEach(({ a, len }) => { a.style.strokeDasharray = `${Math.max(0, len * t - 1.5)} ${C}`; }); mid.textContent = Math.round(t * 100) + "%"; });
  }

  function netRows(host, rows) {
    host.innerHTML = rows.map(([n, v]) => `<div style="display:grid;grid-template-columns:76px 1fr 72px;align-items:center;gap:10px;margin:10px 0;font-size:14px">
      <span>${n}</span><span style="height:10px;border-radius:99px;background:var(--c2);overflow:hidden"><i class="nb" data-w="${Math.min(100, Math.abs(v))}" style="display:block;height:100%;width:0;border-radius:99px;background:${v >= 0 ? "var(--c4)" : "var(--c3)"}"></i></span>
      <b class="${v >= 0 ? "up" : "down"}" style="text-align:right;font-variant-numeric:tabular-nums">${v > 0 ? "+" : ""}${v.toFixed(1)}</b></div>`).join("");
    return () => Promise.all($$(".nb", host).map((b, i) => run(800, t => { b.style.width = b.dataset.w * t + "%"; }, i * 120)));
  }

  /* ---------------- build ----------------
     The panels are laid out once; apply() then fills them, so they can be refreshed in place when new data arrives. */
  const k = title => `<div class="dcard"><h3>${title}</h3><div class="big" data-count data-to="">—</div><div class="sub">載入中…</div></div>`;
  $("#dpOverview").innerHTML = `<div class="dgrid">${k("加權指數")}${k("成交金額（億）")}${k("外資買賣超（億）")}${k("上漲 / 下跌檔數")}</div>
    <div class="dcard"><h3 data-h="main">加權指數</h3><div data-chart="main"></div></div>`;
  $("#dpTrend").innerHTML = `<div class="dcard"><h3 data-h="trend">指數走勢（滑過可看數值）</h3><div data-chart="trend"></div></div><div class="dcard"><h3 data-h="vol">成交金額</h3><div data-chart="vol"></div></div>`;
  $("#dpSector").innerHTML = `<div class="dcard"><h3 data-h="sector">各產業指數今日漲跌幅</h3><div class="secgrid"><div data-chart="sector"></div><div data-chart="sector2"></div></div></div>`;

  /* every time a chart scrolls back into view it draws itself again */
  const reg = new Map();
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      const h = e.target, fn = reg.get(h);
      if (e.intersectionRatio === 0) h._done = false;
      else if (fn && e.intersectionRatio >= 0.3 && !h._done && h.closest(".dpanel.on")) { h._done = true; fn(); }
    }), { threshold: [0, 0.3] });
    $$("[data-chart]").forEach(h => io.observe(h));
  }

  let DATA = null;
  const signed = (v, d = 1) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v), d);
  const toneOf = v => (v > 0 ? "up" : v < 0 ? "down" : "");
  function card(i, to, d, pre, suf, sub, cls) {
    const c = $$("#dpOverview .dgrid > .dcard")[i]; if (!c) return;
    const big = $(".big", c), note = $(".sub", c);
    big.dataset.to = ok(to) ? to : ""; big.dataset.d = d; big.dataset.pre = pre; big.dataset.suf = suf;
    note.textContent = sub; note.className = "sub " + (cls || "");
    if (!ok(to)) big.textContent = "—"; else if (c.closest(".dpanel.on")) countUp(big);
  }
  function mount(name, make) {
    const h = $(`[data-chart="${name}"]`); if (!h) return;
    const fn = make(h) || (() => {}); reg.set(h, fn); h._done = false;
    const r = h.getBoundingClientRect();
    if (h.closest(".dpanel.on") && r.top < innerHeight * 0.85 && r.bottom > 0) { h._done = true; fn(); }
  }
  function breadthCard(D) {
    const b = D.breadth;
    if (b) card(3, b.up, 0, "", " 檔", `下跌 ${fmt(b.down)} 檔 · 平盤 ${fmt(b.flat)} 檔（含 ETF）`);
    else card(3, NaN, 0, "", "", D.live ? "等待行情列表載入…" : "");
  }
  function apply(D) {
    DATA = D;
    const n = D.idx.length, dateTxt = `${D.date.slice(0, 4)}/${D.date.slice(4, 6)}/${D.date.slice(6)}`;
    $(".dash-note").innerHTML = D.live
      ? `<b>TWSE 公開資料</b>資料日期 ${dateTxt}，收盤後更新，不是盤中即時報價。`
      : `<b>示意資料</b>目前連不到證交所，以下數字是示意，不代表真實行情。`;
    card(0, D.last, 2, "", "", `${D.chg >= 0 ? "▲" : "▼"} ${fmt(Math.abs(D.chg), 2)}（${ok(D.chgPct) ? signed(D.chgPct, 2) + "%" : "—"}）`, toneOf(D.chg));
    card(1, D.value, 0, "", "", ok(D.valuePct) ? `較前一交易日 ${signed(D.valuePct, 1)}%` : "", toneOf(D.valuePct));
    const I = D.inst;
    if (I) card(2, I.f, 1, I.f > 0 ? "+" : "", "", `投信 ${signed(I.t)} · 自營商 ${signed(I.d)}${I.date !== D.date ? "（" + shortDay(I.date) + "）" : ""}`, toneOf(I.f));
    else card(2, NaN, 1, "", "", "收盤後約 15:00 公布");
    breadthCard(D);
    $('[data-h="main"]').textContent = `加權指數 · 近 ${n} 日（虛線：20 日均線）`;
    $('[data-h="trend"]').textContent = `指數走勢 · 近 ${n} 日（滑過可看數值）`;
    $('[data-h="vol"]').textContent = `成交金額（億）· 近 ${n} 日`;
    const mid = Math.floor((n - 1) / 2);
    mount("main", h => lineChart(h, [D.idx, D.ma], { label: "加權指數走勢", xl: [[0, D.days[0]], [n - 1, D.days[n - 1]]], xs: D.days }));
    mount("trend", h => lineChart(h, [D.idx], { label: "指數走勢", xl: [[0, D.days[0]], [mid, D.days[mid]], [n - 1, D.days[n - 1]]], xs: D.days }));
    mount("vol", h => columnChart(h, D.val, [D.days[0], D.days[n - 1]]));
    const S = D.sectors, h2 = $('[data-chart="sector2"]');
    if (S && S.length) {
      const top = Math.max(...S.map(r => Math.abs(r[1]))), half = S.length > 10 ? Math.ceil(S.length / 2) : S.length;
      h2.hidden = half === S.length;
      mount("sector", h => barChart(h, S.slice(0, half), top));
      mount("sector2", h => (half < S.length ? barChart(h, S.slice(half), top) : (h.replaceChildren(), null)));
    } else {
      h2.hidden = true;
      mount("sector", h => { h.innerHTML = `<p class="dempty">產業指數暫時讀不到，請稍後重新整理。</p>`; return null; });
      mount("sector2", h => (h.replaceChildren(), null));
    }
    document.dispatchEvent(new CustomEvent("twdash:data", { detail: D }));
  }
  async function load() {
    let rows = null;
    try { rows = await loadIndex(); } catch (e) { try { rows = await loadIndexOpen(); } catch (e2) { rows = null; } }
    if (!rows || rows.length < 2) { if (!DATA) apply(sample()); return; }
    const days = rows.map(r => r[0]);
    const [inst, sectors] = await Promise.all([loadInst([days[days.length - 1], days[days.length - 2]]), loadSectors()]);
    const D = compose(rows, inst, sectors, true);
    D.breadth = breadth() || (DATA && DATA.live && DATA.date === D.date ? DATA.breadth : null);
    apply(D);
    ls.set("twdash-D", { at: Date.now(), D });
  }
  /* the quote list arrives a little later than the index; fill the advancers card when it does */
  function watchBreadth() {
    let tries = 0;
    const t = setInterval(() => {
      const b = breadth();
      if (b && DATA && DATA.live) { DATA.breadth = b; breadthCard(DATA); document.dispatchEvent(new CustomEvent("twdash:data", { detail: DATA })); ls.set("twdash-D", { at: Date.now(), D: DATA }); }
      if (b || ++tries > 30) { clearInterval(t); if (!b && DATA && DATA.live && !DATA.breadth) card(3, NaN, 0, "", "", "行情列表讀不到"); }
    }, 1500);
  }

  /* ---------------- tabs ---------------- */
  const tabs = $$(".dtabs button[data-p]"), pill = $(".dtabs .pill");
  let cur = null, token = 0;
  function movePill(b, animate) {
    if (!animate || reduced()) { pill.style.transition = "none"; }
    if (getComputedStyle(pill.parentElement).flexDirection === "column") {
      pill.style.width = ""; pill.style.height = b.offsetHeight + "px"; pill.style.transform = `translateY(${b.offsetTop}px)`;
    } else {
      pill.style.height = ""; pill.style.width = b.offsetWidth + "px"; pill.style.transform = `translateX(${b.offsetLeft}px)`;
    }
    if (!animate || reduced()) { pill.offsetWidth; pill.style.transition = ""; }
    b.scrollIntoView && b.scrollIntoView({ inline: "center", block: "nearest", behavior: reduced() ? "auto" : "smooth" });
  }
  async function open(id, animate) {
    const my = ++token, b = tabs.find(t => t.dataset.p === id) || tabs[0], panel = document.getElementById(b.dataset.p);
    tabs.forEach(t => t.setAttribute("aria-selected", t === b ? "true" : "false"));
    movePill(b, animate);
    $$(".dpanel").forEach(p => p.classList.toggle("on", p === panel));
    cur = b.dataset.p;
    try { sessionStorage.setItem("twdash-tab", cur); } catch (e) {}
    /* panel content rises in one block after another (the video's page-to-page feel) */
    if (!reduced()) Array.from(panel.children).forEach((c, i) => c.animate([{ opacity: 0, transform: "translateY(18px) scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 520, delay: i * 90, easing: "cubic-bezier(.2,.9,.3,1)", fill: "backwards" }));
    $$("[data-count]", panel).forEach(countUp);
    /* charts already on screen start now; the others start when they scroll into view */
    $$("[data-chart]", panel).forEach(h => {
      const r = h.getBoundingClientRect(), fn = reg.get(h);
      if (fn && my === token && r.top < innerHeight * 0.85 && r.bottom > 0) { h._done = true; fn(); } else h._done = false;
    });
  }
  tabs.forEach(b => b.addEventListener("click", () => open(b.dataset.p, true)));
  $(".dtabs").addEventListener("keydown", e => {
    const i = tabs.indexOf(document.activeElement); if (i < 0 || !/Arrow(Left|Right)/.test(e.key)) return;
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click();
  });
  addEventListener("resize", () => { const b = tabs.find(t => t.getAttribute("aria-selected") === "true"); b && movePill(b, false); });
  let saved = null; try { saved = sessionStorage.getItem("twdash-tab"); } catch (e) {}
  /* wait a frame so tab widths are measured with the final font; also replay when the gate closes */
  requestAnimationFrame(() => open(saved || "dpOverview", false));
  window.TWDash = { replay: () => open(cur, false), data: () => DATA, reload: load };

  /* last known real numbers first (instant), then a fresh read when they are older than ten minutes */
  const kept = ls.get("twdash-D");
  if (kept && kept.D && kept.D.live && kept.D.idx && kept.D.idx.length > 1) apply(kept.D);
  if (!kept || !kept.D || !kept.D.live || Date.now() - kept.at > 600000) load().catch(() => { if (!DATA) apply(sample()); });
  watchBreadth();
})();
