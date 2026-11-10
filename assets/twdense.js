/* TWstock overview, denser: a mini sparkline on the stat cards and a side summary beside the main chart.
   Both follow the data the dashboard loaded (TWSE open data, or labelled sample numbers when TWSE cannot be reached).
   Runs after the dashboard has built its panels. */
(function () {
  "use strict";
  const ov = document.getElementById("dpOverview");
  if (!ov) return;
  const grid = ov.querySelector(".dgrid");
  const chart = Array.from(ov.querySelectorAll(":scope > .dcard")).pop();
  if (!grid || !chart) return;

  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";
  const ease = t => 1 - Math.pow(1 - t, 3);
  const ok = Number.isFinite;
  const fmt = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const signed = (v, d = 1) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v), d);
  const tone = v => (v > 0 ? "up" : v < 0 ? "down" : "");
  const run = (ms, fn, delay = 0) => new Promise(res => {
    if (reduced()) { fn(1); res(); return; }
    const t0 = performance.now() + delay;
    (function f(now) {
      const t = Math.max(0, Math.min(1, (now - t0) / ms));
      fn(ease(t));
      t < 1 ? requestAnimationFrame(f) : res();
    })(performance.now());
  });

  /* main chart moves into a two-column row with the summary */
  const wrap = document.createElement("div");
  wrap.className = "ovgrid";
  ov.insertBefore(wrap, chart);
  wrap.appendChild(chart);

  /* one sparkline slot per stat card; only cards that have a real history get a line */
  const W = 76, H = 28;
  const paths = Array.from(grid.children).map(card => {
    card.style.position = "relative";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "spark");
    svg.setAttribute("aria-hidden", "true");
    svg.style.display = "none";
    const p = document.createElementNS(NS, "path");
    svg.appendChild(p);
    card.appendChild(svg);
    return p;
  });
  function spark(p, ys) {
    const svg = p.parentNode;
    if (!ys || ys.length < 2) { svg.style.display = "none"; return; }
    const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1, n = ys.length - 1;
    p.setAttribute("d", ys.map((y, k) => `${k ? "L" : "M"}${(k / n * W).toFixed(1)},${(H - 2 - (y - lo) / span * (H - 4)).toFixed(1)}`).join(""));
    svg.style.display = "";
  }

  const side = document.createElement("div");
  side.className = "dcard ovside";
  side.innerHTML = `<h3>今日摘要</h3><div class="mrow"><span>載入中…</span><b></b></div>`;
  wrap.appendChild(side);

  function render(D) {
    if (!D) return;
    spark(paths[0], D.idx);
    spark(paths[1], D.val);
    spark(paths[2], null);
    spark(paths[3], null);
    const I = D.inst, B = D.breadth, v = (x, f) => (ok(x) ? f(x) : "—");
    const rows = [
      ["上市成交金額（億）", v(D.value, x => fmt(x)), ""],
      ["成交股數（億股）", v(D.shares, x => fmt(x, 1)), ""],
      ["成交筆數（萬筆）", v(D.trades, x => fmt(x, 1)), ""],
      ["外資買賣超（億）", I ? signed(I.f) : "—", I ? tone(I.f) : ""],
      ["投信買賣超（億）", I ? signed(I.t) : "—", I ? tone(I.t) : ""],
      ["自營商買賣超（億）", I ? signed(I.d) : "—", I ? tone(I.d) : ""],
      ["三大法人合計（億）", I ? signed(I.all) : "—", I ? tone(I.all) : ""],
      ["法人成交比重", I && ok(I.ratio) ? fmt(I.ratio, 1) + "%" : "—", ""],
      ["上漲 / 下跌 / 平盤（檔）", B ? `${fmt(B.up)} / ${fmt(B.down)} / ${fmt(B.flat)}` : "—", ""],
    ];
    side.innerHTML = `<h3>${D.live ? "今日摘要" : "今日摘要（示意）"}</h3>` +
      rows.map(([k, val, c]) => `<div class="mrow"><span>${k}</span><b class="${c}">${val}</b></div>`).join("");
    if (ov.classList.contains("on")) play();
  }

  /* sparklines draw themselves each time the overview opens */
  const play = () => paths.forEach((p, i) => {
    if (p.parentNode.style.display === "none") return;
    const L = p.getTotalLength();
    p.style.strokeDasharray = L;
    p.style.strokeDashoffset = L;
    run(900, t => { p.style.strokeDashoffset = L * (1 - t); }, i * 80);
  });
  new MutationObserver(() => { if (ov.classList.contains("on")) play(); })
    .observe(ov, { attributes: true, attributeFilter: ["class"] });

  document.addEventListener("twdash:data", e => render(e.detail));
  render(window.TWDash && window.TWDash.data && window.TWDash.data());
})();
