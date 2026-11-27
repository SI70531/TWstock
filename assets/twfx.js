/* TWstock finishing touches: direction-aware page transitions, touch gestures (swipe between pages, swipe a list row,
   pull the stock page down to go back), limit-up / new-high effects. Everything is layered on window.TWDash.api. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  let A = null, prevTab = null;
  const buzz = n => { try { navigator.vibrate && navigator.vibrate(n); } catch (e) {} };
  const tabIds = () => $$(".dtabs [data-p]").map(b => b.dataset.p).filter(p => p !== "dpStock");

  /* ---------- page transitions: the new page slides in from the side it sits on in the menu ---------- */
  function slideIn(cur) {
    const old = prevTab; prevTab = cur;
    const t = tabIds(), a = t.indexOf(old), b = t.indexOf(cur);
    if (!old || old === cur || a < 0 || b < 0) return;
    const p = document.getElementById(cur); if (!p) return;
    const dir = b > a ? 1 : -1;
    p.animate([{ transform: `translateX(${dir * 46}px) scale(.985)`, opacity: 0, filter: "blur(6px)" }, { transform: "none", opacity: 1, filter: "none" }], { duration: 520, easing: "cubic-bezier(.16,1,.3,1)" });
    const sw = document.createElement("i"); sw.className = "fxsweep"; sw.style.setProperty("--d", dir); document.body.appendChild(sw);
    sw.animate([{ transform: `translateX(${-dir * 100}%)`, opacity: .9 }, { transform: `translateX(${dir * 100}%)`, opacity: 0 }], { duration: 620, easing: "cubic-bezier(.4,0,.2,1)" }).onfinish = () => sw.remove();
  }

  /* ---------- touch gestures ---------- */
  const NOSW = ".hm, .cbox, .kchart, .xscroll, input, textarea, select, .pal, .setdlg, .kbcard, .ixdetail, .cpbar, .lsub, .anasub, .dtabs, .sfind, [data-noswipe], .hmcard";
  const scrollsX = el => { for (let n = el; n && n !== document.body; n = n.parentElement) { const ox = getComputedStyle(n).overflowX; if ((ox === "auto" || ox === "scroll") && n.scrollWidth > n.clientWidth + 4) return true; } return false; };
  let g = null, hint = null, pull = null;
  const ensureHint = () => { if (!hint) { hint = document.createElement("div"); hint.className = "swfx"; document.body.appendChild(hint); } return hint; };
  const toast = txt => {
    const t = document.createElement("div"); t.className = "fxtoast"; t.textContent = txt; document.body.appendChild(t);
    t.animate([{ opacity: 0, transform: "translate(-50%, 14px) scale(.9)" }, { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: .2 }, { opacity: 1, transform: "translate(-50%, 0)", offset: .8 }, { opacity: 0, transform: "translate(-50%, -8px)" }], { duration: 1500 }).onfinish = () => t.remove();
  };
  function resetRow(tr) { if (!tr) return; const cur = tr.style.transform; tr.style.transform = ""; tr.animate([{ transform: cur || "none" }, { transform: "none" }], { duration: 360, easing: "cubic-bezier(.16,1,.3,1)" }); }
  function hideHint() { if (!hint) return; const h = hint; hint = null; h.animate([{ opacity: +h.style.opacity || 1 }, { opacity: 0 }], { duration: 200 }).onfinish = () => h.remove(); }
  function start(e) {
    if (e.touches.length !== 1) { g = null; return; }
    const t = e.touches[0], el = e.target;
    g = { x: t.clientX, y: t.clientY, t: Date.now(), mode: null, row: el.closest && el.closest("#dpList .mtbl tbody tr[data-code]"), no: !!(el.closest && el.closest(NOSW)) || scrollsX(el), tab: A.tabNow() };
  }
  function move(e) {
    if (!g) return;
    const t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y;
    if (!g.mode && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) g.mode = Math.abs(dx) > Math.abs(dy) * 1.5 ? "h" : "v";
    if (g.mode === "h" && g.row && !g.no) {
      const r = g.row.getBoundingClientRect(), k = Math.min(1, Math.abs(dx) / 110), code = g.row.dataset.code;
      g.row.style.transform = `translateX(${(dx * 0.55).toFixed(1)}px)`;
      const h = ensureHint(); h.style.cssText = `top:${r.top}px;height:${r.height}px;left:${r.left}px;width:${r.width}px;opacity:${(0.25 + k * 0.75).toFixed(2)}`;
      const inW = (A.watch() || []).includes(code);
      h.dataset.side = dx < 0 ? "l" : "r"; h.dataset.ready = k >= 1 ? "1" : "";
      h.innerHTML = dx < 0 ? `<span>${inW ? "☆ 移除自選" : "★ 加入自選"}</span>` : `<span>看個股 →</span>`;
    } else if (g.mode === "v" && g.tab === "dpStock" && dy > 0 && scrollY <= 0 && !g.no && $("#dpStock .sback:not([hidden])")) {
      const p = $("#dpStock"), k = Math.min(1, dy / 130);
      p.style.transform = `translateY(${(dy * 0.45).toFixed(1)}px) scale(${(1 - k * 0.03).toFixed(3)})`; p.style.opacity = (1 - k * 0.35).toFixed(2);
      if (!pull) { pull = document.createElement("div"); pull.className = "fxpull"; pull.innerHTML = `<i></i><span></span>`; document.body.appendChild(pull); }
      pull.style.opacity = Math.min(1, dy / 60).toFixed(2); pull.style.transform = `translate(-50%, ${Math.min(dy * 0.5, 70).toFixed(0)}px)`; pull.dataset.ready = k >= 1 ? "1" : "";
      $("span", pull).textContent = k >= 1 ? "放開返回" : "下拉返回"; $("i", pull).style.transform = `rotate(${(k * 180).toFixed(0)}deg)`;
    }
  }
  function end(e) {
    const s = g; g = null; if (!s) return;
    const t = (e.changedTouches && e.changedTouches[0]) || { clientX: s.x, clientY: s.y }, dx = t.clientX - s.x, dy = t.clientY - s.y, dt = Date.now() - s.t;
    if (s.mode === "h" && s.row) {
      const code = s.row.dataset.code; hideHint();
      if (Math.abs(dx) > 110) {
        buzz(12);
        if (dx < 0) { const on = A.rowStar(code); const nm = (A.DB.by.get(code) || {}).name || code; toast(on ? `★ 已加入自選：${nm}` : `☆ 已移出自選：${nm}`); resetRow($(`#dpList .mtbl tbody tr[data-code="${code}"]`) || s.row); }
        else { s.row.style.transform = ""; A.openStock(code, s.row); }
      } else resetRow(s.row);
      return;
    }
    if (pull || $("#dpStock").style.transform) {
      const p = $("#dpStock"), ready = dy > 130; if (pull) { const x = pull; pull = null; x.animate([{ opacity: +x.style.opacity || 1 }, { opacity: 0 }], { duration: 220 }).onfinish = () => x.remove(); }
      const cur = p.style.transform; p.style.transform = ""; p.style.opacity = "";
      if (cur) p.animate([{ transform: cur, opacity: 0.7 }, { transform: "none", opacity: 1 }], { duration: 360, easing: "cubic-bezier(.16,1,.3,1)" });
      if (ready) { buzz(12); A.goBackNow(); }
      return;
    }
    if (s.mode === "h" && !s.no && s.tab !== "dpStock" && Math.abs(dx) > 90 && Math.abs(dy) < 55 && dt < 700) {
      const ids = tabIds(), i = ids.indexOf(s.tab), n = i + (dx < 0 ? 1 : -1);
      if (i >= 0 && n >= 0 && n < ids.length) { buzz(10); A.openTab(ids[n]); }
    }
  }

  /* ---------- 創 60 日新高 on the stock page ---------- */
  function newHigh() {
    if (A.tabNow() !== "dpStock") return;
    const code = A.code(), h = A.HIST.get(code), s = A.DB.by.get(code), box = $("#dpStock .stitle");
    if (!box || !h || !h.cs || !s || !(s.price > 0)) return;
    const prior = h.cs.slice(-61, -1).map(b => b[2]).filter(Number.isFinite);
    const is = prior.length >= 40 && s.price >= Math.max(...prior), tag = $(".nhtag", box);
    if (is && !tag) { const t = document.createElement("span"); t.className = "nhtag"; t.textContent = "▲ 創 60 日新高"; box.appendChild(t); t.animate([{ opacity: 0, transform: "scale(.4) rotate(-8deg)" }, { opacity: 1, transform: "scale(1.15)", offset: .6 }, { opacity: 1, transform: "none" }], { duration: 640, easing: "cubic-bezier(.2,.9,.3,1)" }); }
    else if (!is && tag) tag.remove();
  }

  function boot() {
    if (A) return; A = window.TWDash && window.TWDash.api; if (!A) return;
    prevTab = A.tabNow();
    document.addEventListener("twdash:tab", e => slideIn(e.detail));
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    document.addEventListener("touchcancel", () => { if (g && g.row) resetRow(g.row); g = null; hideHint(); }, { passive: true });
    ["twdash:live", "twdash:list"].forEach(n => document.addEventListener(n, () => setTimeout(newHigh, 0))); newHigh();
  }
  document.addEventListener("twdash:ready", boot);
  if (window.TWDash && window.TWDash.api) boot();
})();
