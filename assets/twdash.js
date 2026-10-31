/* TWstock dashboard (demo data) — tabs with a gliding pill; every panel redraws its charts when you open it:
   lines draw themselves, bars grow, the donut sweeps, numbers count up. 示意資料, not real quotes.
   Replace the DATA block with real series later; nothing else needs to change. */
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

  /* ---------------- DATA (示意資料) ---------------- */
  let seed = 20261031;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const idx = [], vol = [];
  let v = 21800;
  for (let i = 0; i < 60; i++) { v += (rnd() - 0.46) * 190; idx.push(Math.round(v)); vol.push(Math.round(2400 + rnd() * 1600)); }
  const bench = idx.map((x, i) => Math.round(21800 + (x - 21800) * 0.62 + Math.sin(i / 5) * 70));
  const sectors = [["半導體", 3.4], ["電子零組件", 1.8], ["金融保險", 0.9], ["航運", -0.6], ["鋼鐵", -1.2], ["生技醫療", 2.1], ["電信", 0.3]];
  const flows = [["外資", 48, "#8EB69B"], ["投信", 17, "#DAF1DE"], ["自營商", 11, "#235347"], ["散戶", 24, "#4a8a76"]];
  const net = [["外資", 86.4], ["投信", 12.7], ["自營商", -9.3], ["融資增減", -21.5]];

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
    const to = +node.dataset.to, d = +(node.dataset.d || 0), pre = node.dataset.pre || "", suf = node.dataset.suf || "";
    return run(1100, t => { node.textContent = pre + fmt(to * t, d) + suf; });
  }

  /* ---------------- charts ---------------- */
  function lineChart(host, series, opts) {
    const W = 520, H = 200, L = 6, R = 6, T = 10, B = 22;
    const all = series.flat(), lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.08;
    const X = i => L + (W - L - R) * i / (series[0].length - 1), Y = x => T + (H - T - B) * (1 - (x - (lo - pad)) / (hi - lo + 2 * pad));
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label });
    const defs = el("defs", {}, svg), g = el("linearGradient", { id: "dg-area", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: 0, "stop-color": "currentColor", "stop-opacity": .35 }, g); el("stop", { offset: 1, "stop-color": "currentColor", "stop-opacity": 0 }, g);
    for (let k = 0; k <= 4; k++) { const y = T + (H - T - B) * k / 4; el("line", { x1: L, x2: W - R, y1: y, y2: y, class: "gridl" }, svg); }
    const pts = s => s.map((x, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join("");
    const area = el("path", { d: pts(series[0]) + `L${X(series[0].length - 1)},${H - B}L${L},${H - B}Z`, class: "area" }, svg);
    area.style.color = "var(--c4)"; area.style.opacity = 0;
    const main = el("path", { d: pts(series[0]), class: "ln" }, svg);
    let second = null;
    if (series[1]) { second = el("path", { d: pts(series[1]), class: "ln2" }, svg); second.dataset.dash = "5 5"; }
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
    return () => { dot.setAttribute("opacity", 0); area.style.opacity = 0;
      return Promise.all([drawLine(main, 1500), second ? drawLine(second, 1500, 250) : 0, run(900, t => { area.style.opacity = t; }, 700)]); };
  }

  function barChart(host, rows) {
    const W = 520, rowH = 34, H = rows.length * rowH + 6, mid = 260, scale = 56;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "產業漲跌幅" });
    el("line", { x1: mid, x2: mid, y1: 0, y2: H, class: "gridl" }, svg);
    const bars = rows.map(([name, val], i) => {
      const w = Math.abs(val) * scale, y = i * rowH + 4;
      const r = el("rect", { x: val >= 0 ? mid : mid - w, y, width: w, height: 22, rx: 5, class: "bar" + (val < 0 ? " neg" : "") }, svg);
      r.style.transformOrigin = val >= 0 ? "0% 50%" : "100% 50%"; r.style.transform = "scaleX(0)";
      const t = el("text", { x: val >= 0 ? mid + w + 8 : mid - w - 8, y: y + 15, "text-anchor": val >= 0 ? "start" : "end" }, svg); t.textContent = `${val > 0 ? "+" : ""}${val.toFixed(1)}%`; t.style.opacity = 0;
      const n = el("text", { x: val >= 0 ? mid - 8 : mid + 8, y: y + 15, "text-anchor": val >= 0 ? "end" : "start" }, svg); n.textContent = name; n.style.fill = "var(--c5)";
      return [r, t];
    });
    host.replaceChildren(svg);
    return () => Promise.all(bars.map(([r, t], i) => run(700, k => { r.style.transform = `scaleX(${k})`; t.style.opacity = k; }, i * 90)));
  }

  function columnChart(host, data) {
    const W = 520, H = 170, B = 18, n = data.length, bw = W / n * 0.62, max = Math.max(...data);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "成交量" });
    const bars = data.map((x, i) => { const h = (H - B - 6) * x / max, r = el("rect", { x: W / n * i + (W / n - bw) / 2, y: H - B - h, width: bw, height: h, rx: 2, class: "bar" }, svg); r.style.transform = "scaleY(0)"; r.style.opacity = .4 + .6 * x / max; return r; });
    [["60 日前", 0, "start"], ["今天", W, "end"]].forEach(([t, x, a]) => { const tx = el("text", { x, y: H - 3, "text-anchor": a }, svg); tx.textContent = t; });
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

  /* ---------------- build ---------------- */
  const last = idx[idx.length - 1], first = idx[0], chg = last - idx[idx.length - 2];
  const days = idx.map((_, i) => `${i + 1 === idx.length ? "今天" : idx.length - 1 - i + " 日前"}`);
  const players = {};
  const k = (title, to, d, pre, suf, sub, cls) => `<div class="dcard"><h3>${title}</h3><div class="big" data-count data-to="${to}" data-d="${d}" data-pre="${pre}" data-suf="${suf}">0</div><div class="sub ${cls || ""}">${sub}</div></div>`;
  $("#dpOverview").innerHTML = `<div class="dgrid">${k("加權指數", last, 0, "", "", (chg >= 0 ? "▲ " : "▼ ") + fmt(Math.abs(chg)) + "（今日）", chg >= 0 ? "up" : "down")}${k("成交金額（億）", 3820, 0, "", "", "較前日 +6.2%", "up")}${k("外資買賣超（億）", 86.4, 1, "+", "", "連 3 買", "up")}${k("上漲 / 下跌家數", 912, 0, "", " 家", "下跌 648 家")}</div>
    <div class="dcard"><h3>加權指數 · 近 60 日（虛線：對照組）</h3><div data-chart="main"></div></div>`;
  $("#dpTrend").innerHTML = `<div class="dcard"><h3>指數走勢（滑過可看數值）</h3><div data-chart="trend"></div></div><div class="dcard"><h3>成交量 · 近 60 日</h3><div data-chart="vol"></div></div>`;
  $("#dpSector").innerHTML = `<div class="dcard"><h3>各產業今日漲跌幅</h3><div data-chart="sector"></div></div>`;
  $("#dpFlow").innerHTML = `<div class="dgrid"><div class="dcard"><h3>成交占比</h3><div data-chart="donut"></div></div><div class="dcard"><h3>法人買賣超（億元）</h3><div data-chart="net"></div></div></div>`;

  const play = {
    dpOverview: [lineChart($('[data-chart="main"]'), [idx, bench], { label: "加權指數近 60 日", xl: [[0, "60 日前"], [59, "今天"]], xs: days })],
    dpTrend: [lineChart($('[data-chart="trend"]'), [idx], { label: "指數走勢", xl: [[0, "60 日前"], [30, "30 日前"], [59, "今天"]], xs: days }), columnChart($('[data-chart="vol"]'), vol)],
    dpSector: [barChart($('[data-chart="sector"]'), sectors)],
    dpFlow: [donut($('[data-chart="donut"]'), flows), netRows($('[data-chart="net"]'), net)],
  };

  /* ---------------- tabs ---------------- */
  const tabs = $$(".dtabs button[data-p]"), pill = $(".dtabs .pill");
  let cur = null, token = 0;
  function movePill(b, animate) {
    if (!animate || reduced()) { pill.style.transition = "none"; }
    pill.style.width = b.offsetWidth + "px"; pill.style.transform = `translateX(${b.offsetLeft}px)`;
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
    (play[cur] || []).forEach(p => my === token && p());
  }
  tabs.forEach(b => b.addEventListener("click", () => open(b.dataset.p, true)));
  $$(".replay").forEach(b => b.addEventListener("click", () => open(cur, false)));
  $(".dtabs").addEventListener("keydown", e => {
    const i = tabs.indexOf(document.activeElement); if (i < 0 || !/Arrow(Left|Right)/.test(e.key)) return;
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click();
  });
  addEventListener("resize", () => { const b = tabs.find(t => t.getAttribute("aria-selected") === "true"); b && movePill(b, false); });
  let saved = null; try { saved = sessionStorage.getItem("twdash-tab"); } catch (e) {}
  /* wait a frame so tab widths are measured with the final font; also replay when the gate closes */
  requestAnimationFrame(() => open(saved || "dpOverview", false));
  window.TWDash = { replay: () => open(cur, false) };
})();
