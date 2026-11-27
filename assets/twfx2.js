/* TWstock interaction layer 2: preview card (hover / long-press), drag to reorder the watchlist,
   customisable 總覽 layout, and the compact bar that follows you down the stock page. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let A = null;
  const buzz = n => { try { navigator.vibrate && navigator.vibrate(n); } catch (e) {} };

  /* ---------- a vertical drag-to-reorder helper: the others slide out of the way, the dropped item settles into its slot ---------- */
  function dragSort(down, item, getItems, commit) {
    const items = getItems(), from = items.indexOf(item); if (from < 0) return;
    const rects = items.map(el => el.getBoundingClientRect()), me = rects[from], startY = down.clientY, h = me.height;
    const gap = rects[from + 1] ? rects[from + 1].top - me.bottom : rects[from - 1] ? me.top - rects[from - 1].bottom : 0;
    const handle = down.currentTarget || down.target; let to = from, dead = false;
    try { handle.setPointerCapture(down.pointerId); } catch (e) {}
    item.classList.add("fxdrag"); items.forEach(el => { if (el !== item) el.style.transition = "transform .28s cubic-bezier(.16,1,.3,1)"; });
    buzz(8);
    const move = e => {
      const dy = Math.max(rects[0].top - me.top, Math.min(rects[rects.length - 1].bottom - me.bottom, e.clientY - startY));
      item.style.transform = `translateY(${dy}px) scale(1.02)`;
      const mid = me.top + dy + h / 2;
      to = from; rects.forEach((r, i) => { if (i < from && mid <= r.top + r.height / 2 + 1) to = Math.min(to, i); if (i > from && mid >= r.top + r.height / 2 - 1) to = Math.max(to, i); });
      items.forEach((el, i) => { if (el === item) return; const sh = (from < to && i > from && i <= to) ? -(h + gap) : (from > to && i < from && i >= to) ? (h + gap) : 0; el.style.transform = sh ? `translateY(${sh}px)` : ""; });
    };
    const up = () => {
      if (dead) return; dead = true;
      const noClick = ev => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener("click", noClick, true); setTimeout(() => document.removeEventListener("click", noClick, true), 450);   /* letting go is not a tap on the row */
      handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", up);
      const slot = (to > from ? rects[to].bottom - me.bottom : to < from ? rects[to].top - me.top : 0);
      item.style.transition = "transform .3s cubic-bezier(.34,1.4,.5,1)"; item.style.transform = `translateY(${slot}px)`; buzz(6);
      setTimeout(() => {
        items.forEach(el => { el.style.transition = "none"; el.style.transform = ""; el.classList.remove("fxdrag"); });
        const order = items.slice(); order.splice(from, 1); order.splice(to, 0, item);
        if (to !== from) commit(order);
        requestAnimationFrame(() => items.forEach(el => { el.style.transition = ""; }));
      }, 320);
    };
    handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up); handle.addEventListener("pointercancel", up);
  }

  /* ---------- the watchlist rows: drag the grip ---------- */
  document.addEventListener("pointerdown", e => {
    const grip = e.target.closest && e.target.closest(".dgrip"); if (!grip || !A || e.button > 0) return;
    const tr = grip.closest("tr[data-code]"), tb = tr && tr.closest("tbody"); if (!tb || !A.canSort()) return;
    e.preventDefault(); e.stopPropagation();
    dragSort({ clientY: e.clientY, pointerId: e.pointerId, currentTarget: grip }, tr, () => $$("tr[data-code]", tb), order => {
      const seen = order.map(r => r.dataset.code), rest = A.listCodes().filter(c => !seen.includes(c));
      A.setOrder(seen.concat(rest));
    });
  }, true);

  /* ---------- a small chart of the last ~40 trading days ---------- */
  const BARS = new Map();
  const ym = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0");
  function bars(code) {
    const h = A.HIST.get(code); if (h && h.cs && h.cs.length) return Promise.resolve(h.cs.slice(-45));
    if (BARS.has(code)) return BARS.get(code);
    const now = new Date(), prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const pr = Promise.all([A.histMonth(code, ym(prev), true), A.histMonth(code, ym(now), false)]).then(([a, b]) => [...a, ...b].slice(-45), e => { BARS.delete(code); throw e; });
    BARS.set(code, pr); return pr;
  }
  function spark(cs, w, h) {
    const v = cs.map(b => b[4]), lo = Math.min(...v), hi = Math.max(...v), sp = hi - lo || 1, n = v.length - 1 || 1;
    const X = i => (i / n * (w - 8) + 4).toFixed(1), Y = x => (h - 6 - (x - lo) / sp * (h - 14)).toFixed(1);
    const d = v.map((x, i) => (i ? "L" : "M") + X(i) + " " + Y(x)).join(""), up = v[v.length - 1] >= v[0], hi_i = v.indexOf(hi), lo_i = v.indexOf(lo);
    return { hi, lo, up, svg: `<svg class="pkspark ${up ? "up" : "down"}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="ar" d="${d}L${X(n)} ${h}L${X(0)} ${h}Z"/><path class="ln" pathLength="1" d="${d}"/><circle cx="${X(v.length - 1)}" cy="${Y(v[v.length - 1])}" r="3.2"/><circle class="mx" cx="${X(hi_i)}" cy="${Y(hi)}" r="2"/><circle class="mn" cx="${X(lo_i)}" cy="${Y(lo)}" r="2"/></svg>` };
  }
  async function fillSpark(host, code) {
    host.innerHTML = `<p class="sub">載入走勢…</p>`;
    try {
      const cs = await bars(code); if (!host.isConnected) return;
      if (!cs || cs.length < 5) { host.innerHTML = `<p class="sub">走勢讀不到資料。</p>`; return; }
      const r = spark(cs, 260, 64), f = A.fmt;
      host.innerHTML = r.svg + `<div class="pkrng"><span>近 ${cs.length} 日低 <b>${f(r.lo, A.dig(r.lo))}</b></span><span>高 <b>${f(r.hi, A.dig(r.hi))}</b></span><span class="${A.tone(cs[cs.length - 1][4] - cs[0][4])}">${A.pct((cs[cs.length - 1][4] / cs[0][4] - 1) * 100)}</span></div>`;
      const ln = $(".ln", host); if (ln) ln.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 800, easing: "ease-out", fill: "backwards" });
      const ar = $(".ar", host); if (ar) ar.animate([{ opacity: 0 }, { opacity: 0.14 }], { duration: 700, delay: 500, fill: "backwards" });
    } catch (e) { if (host.isConnected) host.innerHTML = `<p class="sub">走勢讀不到資料（${esc(A.whyOf(e))}）。</p>`; }
  }

  /* hover preview (mouse): rest on a stock for half a second */
  let pk = null, pkT = 0, pkFor = null;
  const PKSEL = "#dash tr[data-code], .sb-row[data-code], .instrow[data-code], .wcard[data-code]";
  function pkHide() { clearTimeout(pkT); pkFor = null; if (!pk) return; const el = pk; pk = null; el.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.96)" }], { duration: 140, fill: "forwards" }).onfinish = () => el.remove(); }
  function pkShow(code, x, y) {
    const s = A.DB.by.get(code); if (!s) return;
    const t = A.tone(s.chg), d = A.dig(s.price);
    const el = document.createElement("div"); el.className = "fxpeek";
    el.innerHTML = `<div class="pkh"><b>${esc(s.name)}</b><i>${esc(code)}</i></div><div class="pkp"><strong class="${t}">${Number.isFinite(s.price) ? A.fmt(s.price, d) : "—"}</strong><em class="${t}">${Number.isFinite(s.pct) ? A.pct(s.pct) : ""}</em></div><div class="pkc"></div>
      <div class="pkv"><span>成交量 <b>${A.fmt(s.vol)} 張</b></span>${Number.isFinite(s.open) ? `<span>開 <b>${A.fmt(s.open, d)}</b></span>` : ""}</div>`;
    document.body.appendChild(el); pk = el;
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(innerWidth - w - 8, x + 18)) + "px"; el.style.top = Math.max(8, Math.min(innerHeight - h - 8, y + 14)) + "px";
    el.animate([{ opacity: 0, transform: "translateY(8px) scale(.94)", filter: "blur(4px)" }, { opacity: 1, transform: "none", filter: "none" }], { duration: 300, easing: "cubic-bezier(.16,1,.3,1)" });
    fillSpark($(".pkc", el), code);
  }
  document.addEventListener("pointerover", e => {
    if (!A || e.pointerType !== "mouse") return;
    const el = e.target.closest && e.target.closest(PKSEL); if (!el) return;
    if (pkFor === el) return; pkHide(); pkFor = el;
    const x = e.clientX, y = e.clientY;
    pkT = setTimeout(() => { if (pkFor === el && el.isConnected && !el.closest(".fxdrag")) pkShow(el.dataset.code, x, y); }, 520);
  });
  document.addEventListener("pointerout", e => { if (e.pointerType !== "mouse" || !pkFor) return; const to = e.relatedTarget; if (to && pkFor.contains(to)) return; if (to && to.closest && to.closest(".fxpeek")) return; pkHide(); });
  ["pointerdown", "wheel", "keydown", "scroll"].forEach(ev => addEventListener(ev, () => { if (pk || pkFor) pkHide(); }, { passive: true, capture: true }));

  /* touch long-press: the context menu gets the same little chart */
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
    if (!(n instanceof Element) || !n.classList.contains("ctxmenu")) return;
    const code = ($(".cx-h i", n) || {}).textContent; if (!code || !A) return;
    const host = document.createElement("div"); host.className = "pkc cxpk"; $(".cx-h", n).after(host); fillSpark(host, code);
    const r = n.getBoundingClientRect(); if (r.bottom > innerHeight - 8) n.style.top = Math.max(8, innerHeight - n.offsetHeight - 8) + "px";
  }))).observe(document.body, { childList: true });

  /* ---------- 總覽 layout: reorder and hide whole blocks ---------- */
  const OV = [["ixgrid", "四大指數與國際指數"], ["mstrip", "市場概況"], ["board3", "國際行情・期貨籌碼"], ["board", "漲跌分布・排行"]];
  const OK = "twmain-ovl";
  const ovSet = () => { const o = A.store.get(OK, null) || {}; return { order: Array.isArray(o.order) ? o.order : [], hide: Array.isArray(o.hide) ? o.hide : [] }; };
  function ovApply() {
    const panel = $("#dpOverview"); if (!panel) return;
    const S = ovSet(), order = [...S.order.filter(k => OV.some(x => x[0] === k)), ...OV.map(x => x[0]).filter(k => !S.order.includes(k))];
    const editing = panel.classList.contains("fxedit");
    order.forEach((k, i) => { const el = $(":scope > ." + k, panel); if (!el) return; el.style.order = i + 1; el.classList.toggle("fxhid", S.hide.includes(k)); el.classList.toggle("fxdim", editing && S.hide.includes(k)); });
    const ix = $(":scope > .ixdetail", panel); if (ix) ix.style.order = (order.indexOf("ixgrid") + 1) + 0.5;
  }
  function ovEditor() {
    const panel = $("#dpOverview"); if (!panel) return;
    let ed = $(":scope > .fxeditor", panel);
    if (ed) { closeEditor(ed); return; }
    panel.classList.add("fxedit");
    ed = document.createElement("div"); ed.className = "dcard fxeditor"; ed.style.order = 0; panel.prepend(ed);
    const S = ovSet(), order = [...S.order.filter(k => OV.some(x => x[0] === k)), ...OV.map(x => x[0]).filter(k => !S.order.includes(k))];
    ed.innerHTML = `<div class="bd-h"><h3>自訂總覽</h3><button type="button" class="btn fxdone">完成</button></div><div class="fxlist">${order.map(k => { const n = OV.find(x => x[0] === k)[1]; return `<div class="fxrow" data-k="${k}"><i class="dgrip fxg" aria-label="拖曳排序">⋮⋮</i><span>${n}</span><button type="button" class="fxeye" aria-pressed="${!S.hide.includes(k)}" aria-label="顯示或隱藏">${S.hide.includes(k) ? "已隱藏" : "顯示中"}</button></div>`; }).join("")}</div>`;
    ed.animate([{ opacity: 0, transform: "translateY(-12px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(.16,1,.3,1)" });
    $$(".fxrow", ed).forEach((r, i) => r.animate([{ opacity: 0, transform: "translateX(-14px)" }, { opacity: 1, transform: "none" }], { duration: 360, delay: 120 + i * 60, fill: "backwards", easing: "cubic-bezier(.16,1,.3,1)" }));
    const save = () => { const rows = $$(".fxrow", ed), o = { order: rows.map(r => r.dataset.k), hide: rows.filter(r => $(".fxeye", r).getAttribute("aria-pressed") === "false").map(r => r.dataset.k) }; A.store.set(OK, o); ovApply(); };
    ed.addEventListener("click", e => {
      if (e.target.closest(".fxdone")) { closeEditor(ed); return; }
      const eye = e.target.closest(".fxeye"); if (eye) { const on = eye.getAttribute("aria-pressed") !== "true"; eye.setAttribute("aria-pressed", String(on)); eye.textContent = on ? "顯示中" : "已隱藏"; save(); }
    });
    ed.addEventListener("pointerdown", e => {
      const g = e.target.closest(".fxg"); if (!g || e.button > 0) return; e.preventDefault();
      const row = g.closest(".fxrow"), list = row.parentElement;
      dragSort({ clientY: e.clientY, pointerId: e.pointerId, currentTarget: g }, row, () => $$(".fxrow", list), order => { order.forEach(r => list.appendChild(r)); save(); });
    });
    ovApply();
  }
  function closeEditor(ed) {
    const panel = $("#dpOverview"); panel.classList.remove("fxedit"); ovApply();
    ed.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(-10px)" }], { duration: 220, fill: "forwards" }).onfinish = () => ed.remove();
  }
  function ovButton() {
    const panel = $("#dpOverview"); if (!panel || $(":scope > .fxovbtn", panel)) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "chip fxovbtn"; b.style.order = 99; b.textContent = "⇅ 自訂總覽"; b.addEventListener("click", ovEditor); panel.appendChild(b);
  }
  document.addEventListener("twdash:overview-edit", ovEditor);

  /* ---------- the compact bar that follows you down the stock page ---------- */
  let mini = null;
  function miniBar() {
    const on = A.tabNow() === "dpStock", head = $("#dpStock .shead");
    const show = on && head && head.getBoundingClientRect().bottom < 56;
    if (show && !mini) {
      mini = document.createElement("div"); mini.className = "fxmini"; mini.setAttribute("role", "button"); mini.setAttribute("aria-label", "回到頂端"); document.body.appendChild(mini);
      mini.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));
      mini.animate([{ transform: "translate(-50%, -140%)", opacity: 0 }, { transform: "translate(-50%, 0)", opacity: 1 }], { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" });
    }
    if (!show && mini) { const el = mini; mini = null; el.animate([{ transform: "translate(-50%, 0)", opacity: 1 }, { transform: "translate(-50%, -140%)", opacity: 0 }], { duration: 260, fill: "forwards", easing: "cubic-bezier(.23,1,.32,1)" }).onfinish = () => el.remove(); }
    if (mini) {
      const s = A.DB.by.get(A.code()); if (!s) return;
      const t = A.tone(s.chg), html = `<b>${esc(s.name)}</b><i>${esc(s.code)}</i><strong class="${t}">${Number.isFinite(s.price) ? A.fmt(s.price, A.dig(s.price)) : "—"}</strong><em class="${t}">${Number.isFinite(s.pct) ? A.pct(s.pct) : ""}</em>`;
      if (mini.dataset.h !== html) { mini.dataset.h = html; mini.innerHTML = html; }
    }
  }

  function boot() {
    if (A) return; A = window.TWDash && window.TWDash.api; if (!A) return;
    ovApply(); ovButton();
    setInterval(() => { ovButton(); }, 3000);
    let raf = 0; addEventListener("scroll", () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; miniBar(); }); }, { passive: true });
    setInterval(miniBar, 1000);
    document.addEventListener("twdash:tab", () => { setTimeout(ovApply, 0); miniBar(); });
  }
  document.addEventListener("twdash:ready", boot);
  if (window.TWDash && window.TWDash.api) boot();
})();
