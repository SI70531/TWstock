/* TWstock interaction layer: gestures, touch feedback, gyro tilt and playable numbers / charts.
   - swipe left / right on the page switches tabs (phones and tablets), the page follows the finger
   - pull down at the top refreshes quotes and the AI notes
   - swipe a row of the stock list left to add it to / remove it from a 自選 list
   - press feedback on buttons and cards, with a short vibration where the device supports it
   - cards tilt with the device (gyroscope) on phones and tablets, as they do with the mouse on a computer
   - numbers roll digit by digit when a quote changes; rows of the ranking lists open a small inline chart
   Reads the dashboard through window.TWDash.api and drives it only by clicking its own controls. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const touchy = matchMedia("(hover: none), (pointer: coarse)").matches;
  let A = null;
  const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };

  /* ---------- tabs in order, and which one is on ---------- */
  const tabs = () => $$('.dtabs button[role="tab"]');
  const curIdx = () => Math.max(0, tabs().findIndex(t => t.getAttribute("aria-selected") === "true"));
  const panelOn = () => $(".dpanel.on") || $(".dpanel:not([hidden])");

  /* ---------- 1. swipe between tabs ---------- */
  function swipeTabs() {
    let sx = 0, sy = 0, st = 0, dir = 0, on = false, pnl = null, edge = null;
    const skip = el => el.closest("input, textarea, select, .hm, .kchart, .ixfig, svg, .mwrap, .chips, .hmseg, .thseg, .dtabs, .apppill, .pmpgrid, .plan, .tape, .ticker, [data-noswipe], .hmcard, .pal, .ctxmenu");
    document.addEventListener("touchstart", e => {
      if (e.touches.length !== 1 || skip(e.target)) { on = false; return; }
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); dir = 0; on = true; pnl = panelOn();
    }, { passive: true });
    document.addEventListener("touchmove", e => {
      if (!on) return;
      const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (!dir) { if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return; dir = Math.abs(dx) > Math.abs(dy) * 1.4 ? 1 : 2; }
      if (dir !== 1 || !pnl) return;
      const i = curIdx(), n = tabs().length, blocked = (dx > 0 && i === 0) || (dx < 0 && i === n - 1);
      const k = blocked ? dx * 0.18 : dx * 0.55;
      pnl.style.transition = "none"; pnl.style.transform = `translateX(${k}px)`; pnl.style.opacity = String(1 - Math.min(Math.abs(k) / 600, 0.35));
      if (!edge) { edge = document.createElement("div"); edge.className = "swedge"; document.body.appendChild(edge); }
      const nxt = tabs()[i + (dx < 0 ? 1 : -1)];
      edge.className = "swedge " + (dx < 0 ? "r" : "l") + (Math.abs(dx) > 80 && !blocked ? " go" : "");
      edge.textContent = nxt && !blocked ? (dx < 0 ? nxt.textContent.trim() + " ›" : "‹ " + nxt.textContent.trim()) : "";
      edge.style.opacity = String(Math.min(Math.abs(dx) / 80, 1));
    }, { passive: true });
    document.addEventListener("touchend", e => {
      if (!on) return; on = false;
      if (edge) { edge.remove(); edge = null; }
      if (dir !== 1 || !pnl) return;
      const t = e.changedTouches[0], dx = t.clientX - sx, fast = Math.abs(dx) > 50 && Date.now() - st < 280;
      const i = curIdx(), list = tabs(), j = i + (dx < 0 ? 1 : -1);
      const back = () => { pnl.style.transition = "transform .35s cubic-bezier(.2,.9,.3,1), opacity .35s"; pnl.style.transform = ""; pnl.style.opacity = ""; setTimeout(() => { pnl.style.transition = ""; }, 400); };
      if ((Math.abs(dx) > 90 || fast) && list[j]) {
        buzz(8);
        pnl.style.transition = "transform .18s ease-in, opacity .18s"; pnl.style.transform = `translateX(${dx < 0 ? -60 : 60}px)`; pnl.style.opacity = "0";
        const old = pnl;
        setTimeout(() => { old.style.transition = ""; old.style.transform = ""; old.style.opacity = ""; list[j].click();
          const np = panelOn(); if (np && np !== old) np.animate([{ transform: `translateX(${dx < 0 ? 50 : -50}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 320, easing: "cubic-bezier(.16,1,.3,1)" }); }, 170);
      } else back();
    }, { passive: true });
  }

  /* ---------- 2. pull down to refresh ---------- */
  function pullRefresh() {
    let sy = 0, on = false, d = 0, busy = false;
    const ring = document.createElement("div");
    ring.className = "ptr"; ring.innerHTML = '<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="14"/><path d="M18 4a14 14 0 0 1 14 14"/></svg><span>放開更新</span>';
    document.body.appendChild(ring);
    const set = v => { ring.style.transform = `translate(-50%, ${Math.min(v, 90) - 60}px) rotate(${v * 3}deg)`; ring.style.opacity = String(Math.min(v / 70, 1)); ring.classList.toggle("ready", v > 75); };
    document.addEventListener("touchstart", e => { if (busy || scrollY > 2 || e.touches.length !== 1 || e.target.closest("input, textarea, .hm, .kchart, .ixfig, .hmcard, .pal")) { on = false; return; } sy = e.touches[0].clientY; d = 0; on = true; }, { passive: true });
    document.addEventListener("touchmove", e => { if (!on) return; d = (e.touches[0].clientY - sy) * 0.5; if (d <= 0 || scrollY > 2) { set(0); return; } set(d); }, { passive: true });
    document.addEventListener("touchend", async () => {
      if (!on) return; on = false;
      if (d > 75 && A && A.refresh) {
        busy = true; buzz([10, 40, 10]); ring.classList.add("spin"); set(80);
        try { await A.refresh(); } catch (e) {}
        await new Promise(r => setTimeout(r, 500));
        ring.classList.remove("spin"); busy = false;
      }
      ring.style.transition = "transform .35s, opacity .35s"; set(0); setTimeout(() => { ring.style.transition = ""; }, 380);
    }, { passive: true });
  }

  /* ---------- 3. swipe a stock row left: add to / remove from 自選 ---------- */
  function swipeRows() {
    let row = null, sx = 0, sy = 0, dir = 0, dx = 0, tag = null;
    document.addEventListener("touchstart", e => {
      const r = e.target.closest("#dpList tr[data-code]"); row = null; if (!r || e.touches.length !== 1) return;
      row = r; sx = e.touches[0].clientX; sy = e.touches[0].clientY; dir = 0; dx = 0;
    }, { passive: true });
    document.addEventListener("touchmove", e => {
      if (!row) return;
      const t = e.touches[0]; dx = Math.min(0, t.clientX - sx); const dy = t.clientY - sy;
      if (!dir) { if (Math.abs(t.clientX - sx) < 10 && Math.abs(dy) < 10) return; dir = Math.abs(t.clientX - sx) > Math.abs(dy) * 1.3 && t.clientX < sx ? 1 : 2; }
      if (dir !== 1) { row = null; return; }
      const btn = $(".wlbtn", row), adding = !btn || btn.classList.contains("wladd");
      if (!tag) { tag = document.createElement("div"); tag.className = "rowact"; document.body.appendChild(tag); }
      const rr = row.getBoundingClientRect();
      tag.style.top = rr.top + "px"; tag.style.height = rr.height + "px"; tag.style.width = Math.max(0, -dx) + "px";
      tag.className = "rowact " + (adding ? "add" : "del") + (dx < -90 ? " go" : "");
      tag.textContent = -dx > 40 ? (adding ? "＋ 自選" : "－ 移除") : "";
      row.style.transition = "none"; row.style.transform = `translateX(${dx * 0.6}px)`;
    }, { passive: true });
    document.addEventListener("touchend", () => {
      if (!row) return;
      const r = row, go = dir === 1 && dx < -90; row = null;
      if (tag) { const t = tag; tag = null; t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220 }).onfinish = () => t.remove(); }
      r.style.transition = "transform .35s cubic-bezier(.2,.9,.3,1.2)"; r.style.transform = ""; setTimeout(() => { r.style.transition = ""; }, 400);
      if (go) { buzz(12); const b = $(".wlbtn", r); if (b) b.click(); }
    }, { passive: true });
  }

  /* ---------- 4. press feedback: a springy push on buttons and cards, a tick of vibration ---------- */
  function pressFeel() {
    const SEL = "button, .btn, .chip, .dcard[role=button], .ixcard, .bd-row, .hmt, tr[data-code], .sb-row, .wcard, .pal-it";
    document.addEventListener("pointerdown", e => {
      const el = e.target.closest(SEL); if (!el || el.disabled) return;
      el.classList.add("pressing");
      if (e.pointerType !== "mouse" && el.matches("button, .btn, .chip, .apppill a, .apppill button")) buzz(6);
      const up = () => { el.classList.remove("pressing"); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); };
      addEventListener("pointerup", up); addEventListener("pointercancel", up);
    }, { passive: true });
  }

  /* ---------- 5. gyroscope tilt on phones and tablets ---------- */
  const TILT = ".ixcard, .wcard, .pmf, .aiteam > .dcard, .lcard, .snap, .mcell, .aiorder, .pmchance > div, .dcard.pm, .dcard.cl, .bd-heat, .bd-up, .bd-down, .bd-dist";
  function gyro() {
    if (!touchy || !("DeviceOrientationEvent" in window)) return;
    let base = null, live = [], raf = 0, last = null;
    const io = new IntersectionObserver(es => es.forEach(x => { x.target.classList.toggle("gyin", x.isIntersecting); }), { threshold: 0.05 });
    const watch = () => $$(TILT).forEach(el => { if (!el.dataset.gy) { el.dataset.gy = "1"; el.classList.add("tilt", "gyro"); io.observe(el); } });
    watch(); new MutationObserver(() => { clearTimeout(watch.t); watch.t = setTimeout(watch, 300); }).observe(document.body, { childList: true, subtree: true });
    const paint = () => {
      raf = 0; if (!last) return;
      if (!base) base = last;
      /* the resting angle drifts slowly toward how the phone is held, so only movement tilts the cards */
      base = { b: base.b + (last.b - base.b) * 0.02, g: base.g + (last.g - base.g) * 0.02 };
      const rx = Math.max(-7, Math.min(7, (last.b - base.b) * 0.35)), ry = Math.max(-7, Math.min(7, (last.g - base.g) * 0.35));
      live = $$(".gyro.gyin");
      live.forEach(el => {
        if (el.classList.contains("tilting")) return;
        el.style.setProperty("--rx", (-rx).toFixed(2) + "deg"); el.style.setProperty("--ry", ry.toFixed(2) + "deg");
        el.style.setProperty("--mx", (50 + ry * 6).toFixed(1) + "%"); el.style.setProperty("--my", (50 + rx * 6).toFixed(1) + "%");
      });
      document.documentElement.classList.toggle("gyshine", Math.abs(rx) + Math.abs(ry) > 0.8);
    };
    const on = e => { if (e.beta == null) return; last = { b: e.beta, g: e.gamma }; if (!raf) raf = requestAnimationFrame(paint); };
    const start = () => addEventListener("deviceorientation", on, { passive: true });
    /* iOS asks once, after a tap */
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const ask = () => { DeviceOrientationEvent.requestPermission().then(s => { if (s === "granted") start(); }).catch(() => {}); removeEventListener("touchend", ask); };
      addEventListener("touchend", ask, { once: true });
    } else start();
  }

  /* ---------- 6. numbers roll digit by digit when a quote changes ---------- */
  function rollNumbers() {
    const SEL = ".mclock .sb-ix b, .side .sb-ix b, .hmc-p b";
    const seen = new WeakMap();
    const roll = el => {
      const txt = el.textContent, prev = seen.get(el);
      if (txt === prev || el.dataset.rolling) return;
      seen.set(el, txt);
      if (prev == null || prev.length !== txt.length) return;
      const up = parseFloat(txt.replace(/,/g, "")) >= parseFloat(prev.replace(/,/g, ""));
      el.dataset.rolling = "1";
      el.innerHTML = [...txt].map((c, i) => c !== prev[i] && /\d/.test(c) ? `<span class="rd ${up ? "u" : "d"}"><i>${prev[i]}</i><i>${c}</i></span>` : c).join("");
      setTimeout(() => { if (el.querySelector(".rd")) el.textContent = txt; delete el.dataset.rolling; }, 700);
    };
    new MutationObserver(ms => ms.forEach(m => { const el = m.target.nodeType === 3 ? m.target.parentElement : m.target; if (el && el.matches && el.matches(SEL)) roll(el); }))
      .observe(document.body, { childList: true, characterData: true, subtree: true });
  }

  /* ---------- 7. ranking rows open a small inline chart instead of leaving the page ---------- */
  function rowPeek() {
    document.addEventListener("click", async e => {
      const go = e.target.closest(".peek .pk-go"); if (go) { e.stopPropagation(); A && A.openStock(go.dataset.code); return; }
      if (e.target.closest(".peek")) { e.stopPropagation(); return; }
      const row = e.target.closest("#dpOverview .bd-up .bd-row, #dpOverview .bd-down .bd-row, #dpOverview .bd-flag .bd-row, #dpOverview .bd-strk .bd-row");
      if (!row || !A) return;
      e.stopPropagation(); e.preventDefault();
      const open = row.nextElementSibling && row.nextElementSibling.classList.contains("peek") ? row.nextElementSibling : null;
      $$("#dpOverview .peek").forEach(p => { p.animate([{ opacity: 1, maxHeight: p.offsetHeight + "px" }, { opacity: 0, maxHeight: "0px" }], { duration: 220, easing: "ease-in" }).onfinish = () => p.remove(); });
      $$("#dpOverview .bd-row.peeking").forEach(r => r.classList.remove("peeking"));
      if (open) return;
      const s = A.DB.by.get(row.dataset.code); if (!s) return;
      row.classList.add("peeking"); buzz(6);
      const pk = document.createElement("div"); pk.className = "peek";
      const d = A.dig(s.price), tn = A.tone(s.chg);
      pk.innerHTML = `<div class="pk-chart"><svg viewBox="0 0 300 90" preserveAspectRatio="none"><path class="pk-ln" d=""/></svg><span class="pk-read sub">載入近 3 個月走勢…</span></div>
        <div class="pk-kv"><span>成交價</span><b class="${tn}">${A.fmt(s.price, d)}</b><span>漲跌幅</span><b class="${tn}">${A.pct(s.pct)}</b><span>成交量</span><b>${A.fmt(s.vol)} 張</b></div>
        <button type="button" class="btn pk-go" data-code="${A.esc(s.code)}">看個股 →</button>`;
      row.after(pk);
      pk.animate([{ opacity: 0, maxHeight: "0px" }, { opacity: 1, maxHeight: "200px" }], { duration: 320, easing: "cubic-bezier(.16,1,.3,1)" });
      /* about 3 months of closes, drawn left to right; drag a finger across to read a day */
      try {
        const got = await A.loadHist(s.code), h = A.HIST.get(s.code), cs = (Array.isArray(got) ? got : h && h.cs ? h.cs : []).slice(-63);
        if (cs.length < 2 || !pk.isConnected) throw 0;
        const cl = cs.map(c => c[4]), lo = Math.min(...cl), hi = Math.max(...cl), X = i => i / (cl.length - 1) * 300, Y = v => 84 - (v - lo) / (hi - lo || 1) * 78;
        const ln = $(".pk-ln", pk), rd = $(".pk-read", pk), svg = $("svg", pk);
        ln.setAttribute("d", cl.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(""));
        ln.classList.add(cl[cl.length - 1] >= cl[0] ? "up" : "down");
        const L = ln.getTotalLength(); ln.style.strokeDasharray = L; ln.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 800, easing: "ease-out", fill: "backwards" });
        const base = `近 3 個月 ${A.pct((cl[cl.length - 1] / cl[0] - 1) * 100)}`; rd.textContent = base;
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle"); dot.setAttribute("r", "3.5"); dot.setAttribute("class", "pk-dot"); dot.style.display = "none"; svg.appendChild(dot);
        const mv = ev => { const b = svg.getBoundingClientRect(), i = Math.round(Math.max(0, Math.min(1, (ev.clientX - b.left) / b.width)) * (cl.length - 1));
          dot.style.display = ""; dot.setAttribute("cx", X(i)); dot.setAttribute("cy", Y(cl[i])); rd.textContent = `${cs[i][0] ? String(cs[i][0]).replace(/^(\d{4})(\d{2})(\d{2})$/, "$2/$3") : ""}　${A.fmt(cl[i], d)}`; };
        svg.addEventListener("pointermove", mv); svg.addEventListener("pointerdown", mv);
        svg.addEventListener("pointerleave", () => { dot.style.display = "none"; rd.textContent = base; });
      } catch (err) { const rd = $(".pk-read", pk); if (rd) rd.textContent = "沒有走勢資料"; }
    }, true);
  }

  function boot() {
    A = window.TWDash && window.TWDash.api;
    pressFeel(); rollNumbers(); rowPeek(); gyro();
    if (touchy) { swipeTabs(); pullRefresh(); swipeRows(); }
  }
  if (window.TWDash) boot(); else document.addEventListener("twdash:ready", boot, { once: true });
})();
