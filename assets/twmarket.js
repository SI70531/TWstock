/* TWstock market pages (示意資料): rankings, stock detail with K-line, news, event timeline.
   Every panel draws itself when its tab opens and again each time it scrolls back into view.
   Replace the DATA block with real feeds later; the renderers only read from it. */
(function () {
  "use strict";
  if (!document.getElementById("dpRank")) return;

  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";
  const ease = t => 1 - Math.pow(1 - t, 3);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmt = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const sign = v => (v > 0 ? "+" : "") + v.toFixed(2) + "%";
  const tone = v => (v >= 0 ? "up" : "down");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------------- DATA (示意資料) ---------------- */
  let seed = 20261101;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const STOCKS = [
    ["2330", "台積電", 1085, "半導體"], ["2317", "鴻海", 212, "電子代工"], ["2454", "聯發科", 1320, "半導體"],
    ["2881", "富邦金", 92.4, "金融保險"], ["2603", "長榮", 198, "航運"], ["2002", "中鋼", 24.8, "鋼鐵"],
    ["1301", "台塑", 58.1, "塑膠"], ["2412", "中華電", 128.5, "電信"], ["3008", "大立光", 2310, "光學"],
    ["2308", "台達電", 1120, "電子零組件"], ["6488", "環球晶", 385, "半導體"], ["0050", "元大台灣50", 188.6, "ETF"],
  ].map(([code, name, price, sector]) => {
    const chg = (rnd() - 0.5) * 8;
    return {
      code, name, price, sector, chg,
      prev: price / (1 + chg / 100),
      volume: Math.round(800 + rnd() * 52000),           // 張
      pe: 8 + rnd() * 30,
      yld: 1 + rnd() * 5,
      cap: 200 + rnd() * 9000,                            // 億
    };
  });

  const NEWS = [
    ["半導體", "半導體族群買盤回流，外資連三日買超", "財經示意 · 1 小時前"],
    ["航運", "運價續跌，航運股盤中走弱", "財經示意 · 2 小時前"],
    ["金融", "金控股配息題材升溫，市場關注除息日", "財經示意 · 3 小時前"],
    ["法說", "電子代工公司將召開法說會，留意營收展望", "財經示意 · 昨天"],
    ["總經", "央行理監事會前觀望氣氛濃，成交量縮", "財經示意 · 昨天"],
    ["ETF", "台灣50 ETF 規模創新高，資金持續流入", "財經示意 · 2 天前"],
  ];

  const EVENTS = [
    ["11/03", "除息", "2881 富邦金", "每股現金股利（示意）1.5 元"],
    ["11/05", "法說會", "2330 台積電", "第三季財報與展望說明"],
    ["11/07", "股東會", "2317 鴻海", "年度股東常會"],
    ["11/12", "除權", "2603 長榮", "配股示意，除權交易首日"],
    ["11/14", "營收公布", "2454 聯發科", "10 月營收揭露"],
    ["11/20", "除息", "2412 中華電", "季配息示意"],
  ];

  /* K-line data: random walk that ends exactly on the stock's price */
  const candleCache = {};
  function candles(s) {
    if (candleCache[s.code]) return candleCache[s.code];
    const N = 60, walk = [];
    let c = s.price * 0.88;
    for (let i = 0; i < N; i++) { c *= 1 + (rnd() - 0.48) * 0.03; walk.push(c); }
    const k = s.price / walk[N - 1];
    const close = walk.map(x => x * k);
    const out = close.map((c, i) => {
      const o = i ? close[i - 1] : c * (1 + (rnd() - 0.5) * 0.01);
      const h = Math.max(o, c) * (1 + rnd() * 0.012);
      const l = Math.min(o, c) * (1 - rnd() * 0.012);
      return { o, h, l, c };
    });
    return (candleCache[s.code] = out);
  }
  const sma = (arr, n) => arr.map((_, i) => (i < n - 1 ? null : arr.slice(i - n + 1, i + 1).reduce((a, x) => a + x.c, 0) / n));

  /* ---------------- helpers ---------------- */
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent && parent.appendChild(e);
    return e;
  };
  const run = (ms, fn, delay = 0) => new Promise(res => {
    if (reduced()) { fn(1); res(); return; }
    const t0 = performance.now() + delay;
    (function f(now) {
      const t = Math.max(0, Math.min(1, (now - t0) / ms));
      fn(ease(t));
      t < 1 ? requestAnimationFrame(f) : res();
    })(performance.now());
  });
  const rise = (node, delay) => (reduced() ? null : node.animate(
    [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }],
    { duration: 480, delay, easing: "cubic-bezier(.2,.9,.3,1)", fill: "backwards" }));
  function drawLine(path, ms, delay) {
    const L = path.getTotalLength();
    path.style.strokeDasharray = L;
    path.style.strokeDashoffset = L;
    return run(ms, t => { path.style.strokeDashoffset = L * (1 - t); }, delay).then(() => {
      path.style.strokeDasharray = path.dataset.dash || "";
      path.style.strokeDashoffset = "";
    });
  }

  /* ---------------- 排行 ---------------- */
  function renderRank(host) {
    const lists = [
      ["漲幅排行", [...STOCKS].sort((a, b) => b.chg - a.chg).slice(0, 6), "chg"],
      ["跌幅排行", [...STOCKS].sort((a, b) => a.chg - b.chg).slice(0, 6), "chg"],
      ["成交量排行（張）", [...STOCKS].sort((a, b) => b.volume - a.volume).slice(0, 6), "vol"],
    ];
    const maxVol = Math.max(...STOCKS.map(s => s.volume));
    host.innerHTML = `<div class="mkgrid">` + lists.map(([title, rows, kind]) => `
      <div class="dcard"><h3>${title}</h3><table class="mktab"><tbody>` + rows.map((s, i) => `
        <tr>
          <td class="rn">${i + 1}</td>
          <td><b>${esc(s.name)}</b> <small>${s.code}</small></td>
          <td class="num">${fmt(s.price, s.price < 100 ? 1 : 0)}</td>
          <td class="num ${tone(s.chg)}">${kind === "chg"
            ? sign(s.chg)
            : `<span class="vbar"><i data-w="${(s.volume / maxVol * 100).toFixed(1)}"></i></span>${fmt(s.volume)}`}</td>
        </tr>`).join("") + `</tbody></table></div>`).join("") + `</div>`;
    const rows = $$("tbody tr", host), bars = $$(".vbar i", host);
    return () => {
      rows.forEach((r, i) => r.animate([{ opacity: 0 }, { opacity: 1 }],
        { duration: 380, delay: (i % 6) * 60, fill: "backwards" }));
      bars.forEach((b, i) => run(900, t => { b.style.width = b.dataset.w * t + "%"; }, 200 + (i % 6) * 60));
    };
  }

  /* ---------------- 個股 ---------------- */
  function drawCandles(box, cs, readout) {
    const W = 520, H = 240, PT = 10, PB = 22, PL = 6, PR = 6, N = cs.length;
    const hi = Math.max(...cs.map(c => c.h)), lo = Math.min(...cs.map(c => c.l)), pad = (hi - lo) * 0.06;
    const top = hi + pad, bot = lo - pad;
    const X = i => PL + (W - PL - PR) * (i + 0.5) / N;
    const Y = v => PT + (H - PT - PB) * (top - v) / (top - bot);
    const bw = Math.max(3, (W - PL - PR) / N * 0.62);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "K 線圖" });
    for (let k = 0; k <= 4; k++) {
      const y = PT + (H - PT - PB) * k / 4;
      el("line", { x1: PL, x2: W - PR, y1: y, y2: y, class: "gridl" }, svg);
    }
    const parts = cs.map((c, i) => {
      const cls = c.c >= c.o ? "up" : "down", x = X(i), g = el("g", {}, svg);
      const wick = el("line", { x1: x, x2: x, y1: Y(c.h), y2: Y(c.l), class: "wick " + cls }, g);
      const body = el("rect", { x: x - bw / 2, y: Y(Math.max(c.o, c.c)), width: bw,
        height: Math.max(1.2, Math.abs(Y(c.o) - Y(c.c))), rx: 1, class: cls }, g);
      for (const n of [wick, body]) { n.style.transformBox = "fill-box"; n.style.transform = "scaleY(0)"; }
      wick.style.transformOrigin = "50% 50%";
      body.style.transformOrigin = "50% 100%";
      return { wick, body, i };
    });
    const line = n => {
      const v = sma(cs, n);
      return v.map((x, i) => (x == null ? "" : `${i === 0 || v[i - 1] == null ? "M" : "L"}${X(i).toFixed(1)},${Y(x).toFixed(1)}`)).join("");
    };
    const m5 = el("path", { d: line(5), class: "ma5", "data-dash": "" }, svg);
    const m20 = el("path", { d: line(20), class: "ma20", "data-dash": "5 5" }, svg);
    svg.addEventListener("pointermove", e => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(N - 1, Math.round(((e.clientX - r.left) / r.width * W - PL) / (W - PL - PR) * N - 0.5)));
      const c = cs[i];
      readout.textContent = `第 ${i + 1} 日　開 ${fmt(c.o, 2)}　高 ${fmt(c.h, 2)}　低 ${fmt(c.l, 2)}　收 ${fmt(c.c, 2)}`;
    });
    box.replaceChildren(svg);
    const last = cs[N - 1];
    readout.textContent = `最新　開 ${fmt(last.o, 2)}　高 ${fmt(last.h, 2)}　低 ${fmt(last.l, 2)}　收 ${fmt(last.c, 2)}`;

    return () => Promise.all([
      ...parts.map(({ wick, body, i }) => run(420, t => {
        wick.style.transform = `scaleY(${t})`;
        body.style.transform = `scaleY(${t})`;
      }, i * 14)),
      drawLine(m5, 900, 500),
      drawLine(m20, 900, 700),
    ]);
  }

  function renderStock(host) {
    host.innerHTML = `
      <div class="stkchips" role="group" aria-label="選擇個股">${STOCKS.map((s, i) =>
        `<button type="button" class="chip" data-code="${s.code}" aria-pressed="${i === 0}">${esc(s.name)} ${s.code}</button>`).join("")}</div>
      <div class="stkwrap">
        <div class="dcard stkside">
          <h3 class="stkname"></h3>
          <div class="big stkprice"></div>
          <div class="sub stkchg"></div>
          <div class="stats"></div>
        </div>
        <div class="dcard">
          <h3>K 線 · 近 60 日（紅漲綠跌；實線 MA5、虛線 MA20）</h3>
          <div class="candlebox"></div>
          <div class="ohlc"></div>
        </div>
      </div>`;
    const q = sel => $(sel, host);
    let playChart = null;
    function fill(s) {
      const cs = candles(s), last = cs[cs.length - 1];
      const d = s.price < 100 ? 1 : 0;
      q(".stkname").textContent = `${s.name}（${s.code}・${s.sector}）`;
      q(".stkprice").textContent = fmt(s.price, d);
      q(".stkprice").className = "big stkprice " + tone(s.chg);
      q(".stkchg").innerHTML = `<span class="${tone(s.chg)}">${s.chg >= 0 ? "▲" : "▼"} ${fmt(Math.abs(s.price - s.prev), d)}（${sign(s.chg)}）</span>`;
      q(".stats").innerHTML = [
        ["開盤", fmt(last.o, 2)], ["最高", fmt(last.h, 2)], ["最低", fmt(last.l, 2)], ["昨收", fmt(s.prev, 2)],
        ["成交量（張）", fmt(s.volume)], ["本益比", s.pe.toFixed(1) + " 倍"],
        ["殖利率", s.yld.toFixed(2) + "%"], ["市值（億）", fmt(s.cap)],
      ].map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join("");
      return drawCandles(q(".candlebox"), cs, q(".ohlc"));
    }
    playChart = fill(STOCKS[0]);
    host.addEventListener("click", e => {
      const b = e.target.closest(".chip");
      if (!b) return;
      const s = STOCKS.find(x => x.code === b.dataset.code);
      $$(".chip", host).forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
      playChart = fill(s);
      playChart();
    });
    return () => playChart();
  }

  /* ---------------- 新聞 ---------------- */
  function renderNews(host) {
    host.innerHTML = `<p class="mknote">以下標題皆為示意內容，非真實新聞。</p><div class="newsgrid">` +
      NEWS.map(([tag, title, meta]) => `<article class="news"><span class="tag">${esc(tag)}</span><h3>${esc(title)}</h3><div class="sub">${esc(meta)}</div></article>`).join("") +
      `</div>`;
    const items = $$(".news", host);
    return () => items.forEach((n, i) => rise(n, i * 90));
  }

  /* ---------------- 行事曆 ---------------- */
  function renderEvent(host) {
    host.innerHTML = `<div class="tl"><i class="tlline"></i>` + EVENTS.map(([d, t, s, x]) =>
      `<div class="tlitem"><div class="date">${d}</div><div class="tlhead"><span class="tag">${esc(t)}</span> <b>${esc(s)}</b></div><div class="sub">${esc(x)}</div></div>`).join("") + `</div>`;
    const line = $(".tlline", host), items = $$(".tlitem", host);
    return () => {
      run(900, t => { line.style.transform = `scaleY(${t})`; });
      items.forEach((n, i) => rise(n, 200 + i * 140));
    };
  }

  /* ---------------- wire up ---------------- */
  const PANELS = [["dpRank", renderRank], ["dpStock", renderStock], ["dpNews", renderNews], ["dpEvent", renderEvent]];
  const plays = new Map();
  PANELS.forEach(([id, render]) => {
    const panel = document.getElementById(id);
    if (!panel) return;
    const host = document.createElement("div");
    host.className = "mkhost";
    panel.replaceChildren(host);
    plays.set(host, render(host));
  });

  function playHost(h) {
    h._done = true;
    const fn = plays.get(h);
    fn && fn();
  }

  /* opening the tab plays the panel */
  const mo = new MutationObserver(muts => muts.forEach(m => {
    if (!m.target.classList.contains("on")) return;
    const h = m.target.querySelector(".mkhost");
    h && playHost(h);
  }));
  PANELS.forEach(([id]) => {
    const p = document.getElementById(id);
    p && mo.observe(p, { attributes: true, attributeFilter: ["class"] });
  });

  /* and again each time it scrolls back into view */
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      const h = e.target;
      if (e.intersectionRatio === 0) h._done = false;
      else if (e.intersectionRatio >= 0.25 && !h._done && h.closest(".dpanel.on")) playHost(h);
    }), { threshold: [0, 0.25] });
    plays.forEach((_, h) => io.observe(h));
  }
})();
