/* TWstock overview, denser: a mini sparkline on each stat card and a side summary beside the main chart.
   Demo data (示意資料). Runs after the dashboard has built its panels. */
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

  /* mini sparklines (示意資料) */
  let s = 7;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const W = 76, H = 28;
  const paths = Array.from(grid.children).map((card, i) => {
    card.style.position = "relative";
    s = 500 + i * 97;
    let v = 50;
    const ys = [];
    for (let k = 0; k < 40; k++) { v += (rnd() - 0.45) * 6; ys.push(v); }
    const lo = Math.min(...ys), hi = Math.max(...ys) || lo + 1;
    const d = ys.map((y, k) => `${k ? "L" : "M"}${(k / 39 * W).toFixed(1)},${(H - 2 - (y - lo) / (hi - lo) * (H - 4)).toFixed(1)}`).join("");
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "spark");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
    card.appendChild(svg);
    return p;
  });

  /* side summary (示意資料) */
  const side = document.createElement("div");
  side.className = "dcard ovside";
  side.innerHTML = `<h3>今日摘要</h3>` + [
    ["上市成交值（億）", "3,820", ""],
    ["上櫃成交值（億）", "1,240", ""],
    ["外資買賣超（億）", "+86.4", "up"],
    ["投信買賣超（億）", "+12.7", "up"],
    ["自營商買賣超（億）", "−9.3", "down"],
    ["漲停 / 跌停（家）", "38 / 6", ""],
    ["融資餘額變化（億）", "−21.5", "down"],
  ].map(([k, v, c]) => `<div class="mrow"><span>${k}</span><b class="${c}">${v}</b></div>`).join("");
  wrap.appendChild(side);

  /* sparklines draw themselves each time the overview opens */
  const play = () => paths.forEach((p, i) => {
    const L = p.getTotalLength();
    p.style.strokeDasharray = L;
    p.style.strokeDashoffset = L;
    run(900, t => { p.style.strokeDashoffset = L * (1 - t); }, i * 80);
  });
  new MutationObserver(() => { if (ov.classList.contains("on")) play(); })
    .observe(ov, { attributes: true, attributeFilter: ["class"] });
})();
