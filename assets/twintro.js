/* TWstock opening intro: a stock chart draws itself, the name types out, an iris opens on the site.
   Plays once per tab (a new tab or window); not in automated browsers unless ?intro=1. */
(() => {
  const robot = navigator.webdriver && !/[?&]intro=1/.test(location.search);
  let seen = false;
  try { seen = sessionStorage.getItem("twintro-seen") === "1" && !/[?&]intro=1/.test(location.search); sessionStorage.setItem("twintro-seen", "1"); } catch (e) {}
  if (robot || seen || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const fx = document.createElement("canvas");
  fx.id = "fx"; fx.setAttribute("aria-hidden", "true");
  document.body.appendChild(fx);
  const g = fx.getContext("2d");
  const FULL = { a0: 0, a1: 6.283 };
  const GREENS = ["#235347", "#8EB69B", "#DAF1DE", "#ffffff"];
  /* on the light theme the pale sparks would vanish, so they are swapped for deeper greens (and drawn normally, not added) */
  const isLight = () => document.documentElement.dataset.theme === "light";
  const LMAP = { "#DAF1DE": "#235347", "#ffffff": "#4f8a6e", "#b9e4c6": "#3f7a62", "#8EB69B": "#2f6b57", "#F0A8A0": "#C0463A", "#ff8c82": "#D9534A" };
  let P = [], fxRaf = 0, fxLast = 0;
  function sizeFx() { const d = Math.min(devicePixelRatio || 1, 2); fx.width = innerWidth * d; fx.height = innerHeight * d; g.setTransform(d, 0, 0, d, 0, 0); }
  addEventListener("resize", sizeFx);
  sizeFx();
  function spawn(x, y, n, o) {
    const light = isLight() && o.force !== "dark";
    for (let i = 0; i < n; i++) {
      const a = o.a0 + Math.random() * (o.a1 - o.a0), sp = o.v0 + Math.random() * (o.v1 - o.v0);
      P.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.g || 0, drag: o.drag || .96, life: 0,
        max: o.l0 + Math.random() * (o.l1 - o.l0), s: o.s0 + Math.random() * (o.s1 - o.s0),
        c: (() => { const c = o.c[(Math.random() * o.c.length) | 0]; return light ? (LMAP[c] || c) : c; })(), add: !light, rect: !!o.rect && Math.random() < .65, r: Math.random() * 6.3, vr: (Math.random() - .5) * 14 });
    }
    if (!fxRaf) fxRaf = requestAnimationFrame(fxFrame);
  }
  function fxFrame(now) {
    const dt = Math.min((now - (fxLast || now)) / 1000, .05);
    fxLast = now;
    g.clearRect(0, 0, innerWidth, innerHeight);
    P = P.filter(p => {
      p.life += dt;
      if (p.life >= p.max) return false;
      const dr = Math.pow(p.drag, dt * 60);
      p.vx *= dr; p.vy = p.vy * dr + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      const k = 1 - p.life / p.max;
      g.globalAlpha = Math.min(1, k * 1.8);
      g.fillStyle = p.c;
      g.globalCompositeOperation = p.add ? "lighter" : "source-over";
      g.save(); g.translate(p.x, p.y); g.rotate(p.r);
      if (p.rect) g.fillRect(-p.s, -p.s * .5, p.s * 2, p.s);
      else { g.beginPath(); g.arc(0, 0, Math.max(.4, p.s * (.4 + k * .6)), 0, 6.283); g.fill(); }
      g.restore();
      return true;
    });
    g.globalAlpha = 1;
    if (P.length) fxRaf = requestAnimationFrame(fxFrame);
    else { fxRaf = 0; fxLast = 0; g.clearRect(0, 0, innerWidth, innerHeight); }
  }
  const rectCenter = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

  /* ---------- opening intro: a stock chart draws itself, the name types out, an iris opens on the site ---------- */
  function playIntro() {
    const W = innerWidth, H = innerHeight;
    const el = document.createElement("div");
    el.className = "intro"; el.setAttribute("aria-hidden", "true");
    let seed = 20261029;                                   /* the same chart every time */
    const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const N = Math.max(12, Math.min(44, Math.round(W / 34)));
    const top = H * .22, bot = H * .8;
    const cs = []; let price = 0;
    for (let i = 0; i < N; i++) {
      const o = price, c = o + (rnd() - .4) + .12;
      cs.push({ o, c, hi: Math.max(o, c) + rnd() * .5, lo: Math.min(o, c) - rnd() * .5 });
      price = c;
    }
    const lo = Math.min(...cs.map(c => c.lo)), hi = Math.max(...cs.map(c => c.hi));
    const Y = v => bot - (v - lo) / (hi - lo) * (bot - top);
    const step = W / (N + 1), cw = Math.max(5, step * .5);
    let candles = "", pts = "";
    cs.forEach((c, i) => {
      const x = step * (i + 1), up = c.c >= c.o, col = up ? "#8EB69B" : "#2c6354";
      candles += '<g class="cd"><line x1="' + x + '" x2="' + x + '" y1="' + Y(c.hi) + '" y2="' + Y(c.lo) + '" stroke="' + (up ? "#8EB69B" : "#4f8a6e") + '" stroke-width="1.6"/>' +
        '<rect x="' + (x - cw / 2) + '" y="' + Y(Math.max(c.o, c.c)) + '" width="' + cw + '" height="' + Math.max(2, Math.abs(Y(c.o) - Y(c.c))) + '" rx="2" fill="' + col + '" stroke="#8EB69B" stroke-opacity=".5"/></g>';
      pts += (i ? "L" : "M") + x + " " + Y(c.c);
    });
    const codes = [["2330", "台積電"], ["2317", "鴻海"], ["2454", "聯發科"], ["2412", "中華電"], ["2881", "富邦金"], ["2882", "國泰金"], ["2603", "長榮"], ["0050", "元大台灣50"], ["2308", "台達電"], ["2891", "中信金"]];
    const tape = off => { const one = codes.map((c, i) => "<span>" + c[0] + " " + c[1] + " <b>" + ((i + off) % 3 ? "▲" : "▼") + "</b></span>").join(""); return '<div class="track">' + one + one + one + one + '</div>'; };
    el.innerHTML = '<div class="grid"></div>' +
      '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">' + candles +
      '<path class="ln" d="' + pts + '" fill="none" stroke="var(--color-ink)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle class="dot" r="6" fill="var(--color-accent)" opacity="0"/></svg>' +
      '<div class="vig"></div>' +
      '<div class="tape t">' + tape(0) + '</div><div class="tape b">' + tape(1) + '</div>' +
      '<div class="center"><div class="mk">TW</div><div class="ti"><span class="tx"></span><i class="cur"></i></div><div class="sub">台股研究</div></div>' +
      '<div class="sk">點一下跳過</div>';
    document.body.appendChild(el);

    /* candles grow one after another */
    el.querySelectorAll(".cd").forEach((g, i) => g.animate(
      [{ transform: "scaleY(0)", opacity: 0 }, { transform: "scaleY(1.08)", opacity: 1, offset: .7 }, { transform: "scaleY(1)", opacity: 1 }],
      { duration: 460, delay: 80 + i * (1000 / N), easing: "cubic-bezier(.2,1,.4,1)", fill: "both" }));
    /* the closing-price line is traced after them, a bright dot at its head throwing sparks */
    const ln = el.querySelector(".ln"), dot = el.querySelector(".dot"), L = ln.getTotalLength();
    ln.style.strokeDasharray = L; ln.style.strokeDashoffset = L;
    const T0 = performance.now(), T_LINE = 650, D_LINE = 1200;
    let closed = false;
    (function trace(now) {
      if (closed) return;
      const k = Math.min(Math.max((now - T0 - T_LINE) / D_LINE, 0), 1), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      ln.style.strokeDashoffset = L * (1 - e);
      if (k > 0 && k < 1) {
        const pt = ln.getPointAtLength(L * e);
        dot.setAttribute("cx", pt.x); dot.setAttribute("cy", pt.y); dot.setAttribute("opacity", "1");
        spawn(pt.x, pt.y, 2, Object.assign({ v0: 20, v1: 110, l0: .3, l1: .7, s0: 1, s1: 2.4, c: ["#8EB69B", "#DAF1DE"], drag: .92, force: "dark" }, FULL));
      } else if (k >= 1) dot.setAttribute("opacity", "0");
      if (k < 1 || now - T0 < T_LINE + D_LINE + 50) requestAnimationFrame(trace);
    })(T0);

    /* the mark pops, the name types itself out */
    const mk = el.querySelector(".mk"), tx = el.querySelector(".tx"), sub = el.querySelector(".sub"), sk = el.querySelector(".sk"), C = el.querySelector(".center");
    mk.animate([{ transform: "scale(.3)", opacity: 0 }, { transform: "scale(1.18)", opacity: 1, offset: .6 }, { transform: "scale(1)", opacity: 1 }],
      { duration: 620, delay: 1000, easing: "cubic-bezier(.3,1.3,.5,1)", fill: "both" });
    setTimeout(() => { if (!closed) { const [mx, my] = rectCenter(mk); spawn(mx, my, 46, Object.assign({ v0: 80, v1: 360, l0: .5, l1: 1, s0: 1.2, s1: 3, c: GREENS, drag: .93, force: "dark" }, FULL)); } }, 1150);
    "TWstock".split("").forEach((ch, i) => setTimeout(() => { if (!closed) tx.textContent += ch; }, 1550 + i * 85));
    sub.animate([{ opacity: 0, letterSpacing: "1.3em" }, { opacity: 1, letterSpacing: ".5em" }], { duration: 700, delay: 2200, easing: "ease-out", fill: "both" });
    sk.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 500, fill: "both" });

    /* the way out: a circle opens from the middle and the site shows through it */
    const ring = document.createElement("div");
    ring.className = "irisring"; ring.style.opacity = "0";
    document.body.appendChild(ring);
    function reveal() {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey);
      C.animate([{ transform: "none", opacity: 1 }, { transform: "scale(1.5)", opacity: 0 }], { duration: 520, easing: "ease-in", fill: "forwards" });
      sk.remove();
      const R = Math.hypot(W, H) / 2 + 30, t0 = performance.now(), D = 1000;
      ring.style.opacity = "1";
      (function frame(now) {
        const k = Math.min((now - t0) / D, 1), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2, r = e * R;
        const m = "radial-gradient(circle at 50% 50%, transparent " + r + "px, #000 " + (r + 2) + "px)";
        el.style.webkitMaskImage = m; el.style.maskImage = m;
        ring.style.width = ring.style.height = (r * 2) + "px";
        ring.style.opacity = String(1 - k * k);
        if (k < 1) requestAnimationFrame(frame);
        else { el.remove(); ring.remove(); fx.remove(); }
      })(t0);
    }
    const onKey = e => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") reveal(); };
    el.addEventListener("click", reveal);
    document.addEventListener("keydown", onKey);
    setTimeout(reveal, 3100);
  }

  playIntro();
})();
