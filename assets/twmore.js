/* TWstock extras: 走勢疊圖 and 除權息日曆 (two more sub-tabs of 股票), the opening / closing ritual,
   swipe between watchlist stocks, pull to refresh and keyboard shortcuts. Everything reads from TWDash.api. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const ok = Number.isFinite, RM = false;
  let A = null;
  const taipei = () => { const d = new Date(Date.now() + 8 * 3600e3); return { wd: d.getUTCDay(), m: d.getUTCHours() * 60 + d.getUTCMinutes(), s: d.getUTCSeconds(), md: (d.getUTCMonth() + 1) + "/" + d.getUTCDate(), iso: d.toISOString().slice(0, 10) }; };

  /* ================= 走勢疊圖 ================= */
  const COL = ["#4c8bf5", "#e6a23c", "#9b59b6", "#16a085", "#e84393", "#7f8c8d"];
  const CM = { sel: null, span: 60 };
  function cmBuild(dl) {
    const card = document.createElement("div"); card.className = "dcard cm"; card.dataset.sub = "cm"; card.hidden = true;
    card.innerHTML = `<div class="aihead"><div><h3>走勢疊圖</h3></div><span class="sub cmn">自選股，起點＝0%</span></div>
      <div class="chips cmspan">${[[20, "20 日"], [60, "60 日"], [120, "120 日"]].map(([n, t]) => `<button type="button" class="chip" data-span="${n}">${t}</button>`).join("")}</div>
      <div class="chips cmpick"></div><div class="cmout"><p class="sub">載入中…</p></div>`;
    dl.appendChild(card);
    card.addEventListener("click", e => {
      const sp = e.target.closest("[data-span]"); if (sp) { CM.span = +sp.dataset.span; A.store.set("twmore-cmspan", CM.span); cmPaint(true); return; }
      const c = e.target.closest("[data-pick]"); if (!c) return;
      const k = c.dataset.pick, i = CM.sel.indexOf(k);
      if (i >= 0) CM.sel.splice(i, 1); else if (CM.sel.length < 5) CM.sel.push(k);
      A.store.set("twmore-cmsel", CM.sel); cmPaint(true);
    });
  }
  async function cmPaint(anim) {
    const card = $("#dpList .cm"); if (!card || card.hidden && !anim) return;
    const W = A.watch().slice(0, 12);
    if (!CM.sel) CM.sel = (A.store.get("twmore-cmsel", null) || W.slice(0, 4)).filter(c => A.DB.by.get(c));
    CM.span = A.store.get("twmore-cmspan", CM.span);
    $$("[data-span]", card).forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.span === CM.span)));
    $(".cmpick", card).innerHTML = W.map(c => { const i = CM.sel.indexOf(c); return `<button type="button" class="chip" data-pick="${A.esc(c)}" aria-pressed="${i >= 0}" ${i >= 0 ? `style="--cmc:${COL[i % COL.length]}"` : ""}>${A.esc((A.DB.by.get(c) || {}).name || c)}</button>`; }).join("") || `<p class="sub">自選股是空的，先在清單點 ★ 加入。</p>`;
    const out = $(".cmout", card);
    if (!CM.sel.length) { out.innerHTML = `<p class="sub">上面點選 2–5 檔股票。</p>`; return; }
    const sets = await Promise.all(CM.sel.map(async c => { try { const got = await A.loadHist(c), h = A.HIST.get(c); const cs = (Array.isArray(got) ? got : h && h.cs ? h.cs : []).slice(-CM.span); return { c, cs }; } catch (e) { return { c, cs: [] }; } }));
    const ok2 = sets.filter(s => s.cs.length > 5); if (!ok2.length) { out.innerHTML = `<p class="sub">沒有資料</p>`; return; }
    const n = Math.max(...ok2.map(s => s.cs.length)), series = ok2.map((s, i) => ({ ...s, i, v: s.cs.map(r => (r[4] / s.cs[0][4] - 1) * 100) }));
    const all = series.flatMap(s => s.v), lo = Math.min(0, ...all), hi = Math.max(0, ...all), sp = hi - lo || 1, Wd = 320, H = 170, X = k => 8 + k / (n - 1) * (Wd - 70), Y = v => 10 + (hi - v) / sp * (H - 24);
    const grid = [lo, 0, hi].map(v => `<line x1="8" x2="${Wd - 62}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="cmg${v === 0 ? " z" : ""}"/><text x="${Wd - 58}" y="${(Y(v) + 3).toFixed(1)}">${v.toFixed(0)}%</text>`).join("");
    const lines = series.map(s => `<polyline class="cml" style="stroke:${COL[CM.sel.indexOf(s.c) % COL.length]}" points="${s.v.map((v, k) => `${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}"/>`).join("");
    out.innerHTML = `<svg class="cmsvg" viewBox="0 0 ${Wd} ${H}" preserveAspectRatio="none" role="img" aria-label="走勢疊圖">${grid}${lines}</svg>
      <div class="cmleg">${series.sort((a, b) => b.v[b.v.length - 1] - a.v[a.v.length - 1]).map(s => { const v = s.v[s.v.length - 1]; return `<span><i style="background:${COL[CM.sel.indexOf(s.c) % COL.length]}"></i>${A.esc((A.DB.by.get(s.c) || {}).name || s.c)} <b class="${A.tone(v)}">${v > 0 ? "+" : ""}${v.toFixed(1)}%</b></span>`; }).join("")}</div>`;
    if (!RM) $$(".cml", out).forEach((p, i) => { const L = p.getTotalLength ? p.getTotalLength() : 600; p.style.strokeDasharray = L; p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 900, delay: i * 120, easing: "ease-out", fill: "backwards" }).onfinish = () => { p.style.strokeDasharray = ""; }; });
  }

  /* ================= 除權息日曆 ================= */
  let DVROWS = null;
  function dvBuild(dl) {
    const card = document.createElement("div"); card.className = "dcard dv"; card.dataset.sub = "dv"; card.hidden = true;
    card.innerHTML = `<div class="aihead"><div><h3>除權息日曆</h3></div><span class="sub dvn"></span></div><div class="chips dvseg"><button type="button" class="chip" data-dv="w" aria-pressed="true">自選股</button><button type="button" class="chip" data-dv="a" aria-pressed="false">全部</button></div><div class="dvout"><p class="sub">載入中…</p></div>`;
    dl.appendChild(card);
    card.addEventListener("click", e => {
      const b = e.target.closest("[data-dv]"); if (b) { $$("[data-dv]", card).forEach(x => x.setAttribute("aria-pressed", String(x === b))); dvPaint(); return; }
      const r = e.target.closest("[data-code]"); if (r) A.openStock(r.dataset.code);
    });
  }
  const dvDate = v => { const m = String(v || "").match(/(\d{2,4})\D?(\d{2})\D?(\d{2})/); if (!m) return ""; let y = +m[1]; if (y < 1911) y += 1911; return `${y}-${m[2]}-${m[3]}`; };
  async function dvLoad() {
    if (DVROWS) return DVROWS;
    const a = await A.J("https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL"), t = taipei().iso;
    DVROWS = (Array.isArray(a) ? a : []).map(x => {
      const ks = Object.keys(x), code = String(x[ks.find(k => /代號|Code/i.test(k))] || "").trim(), name = String(x[ks.find(k => /名稱|Name/i.test(k))] || "").trim();
      const dk = ks.find(k => /除(權|息)(交易)?日|ExRight|Exdiv|Ex.?date/i.test(k) && dvDate(x[k])) || ks.find(k => !/^(Date|資料日期)$/i.test(k) && /日期|Date/i.test(k) && dvDate(x[k]));
      const kind = String(x[ks.find(k => /權值|息值|權\/息|Rights|Type|類別/i.test(k))] || "").trim(), ck = ks.find(k => /現金|Cash/i.test(k) && ok(parseFloat(String(x[k]).replace(/,/g, "")))), sk = ks.find(k => /股票|Stock/i.test(k) && ok(parseFloat(String(x[k]).replace(/,/g, ""))));
      return { code, name, d: dk ? dvDate(x[dk]) : "", kind, cash: ck ? parseFloat(String(x[ck]).replace(/,/g, "")) : null, stock: sk ? parseFloat(String(x[sk]).replace(/,/g, "")) : null };
    }).filter(r => r.code && r.d && r.d >= t).sort((a, b) => (a.d < b.d ? -1 : 1));
    return DVROWS;
  }
  async function dvPaint() {
    const card = $("#dpList .dv"); if (!card) return; const out = $(".dvout", card);
    try {
      const rows = await dvLoad(), W = new Set(A.watch()), onlyW = $("[data-dv=w]", card).getAttribute("aria-pressed") === "true";
      if (onlyW && !rows.some(r => W.has(r.code)) && !card.dataset.auto) { card.dataset.auto = "1"; $$("[data-dv]", card).forEach(x => x.setAttribute("aria-pressed", String(x.dataset.dv === "a"))); dvPaint(); return; }   /* nothing of yours goes ex soon: show everyone */
      let list = rows.filter(r => !onlyW || W.has(r.code)); const total = list.length; list = list.slice(0, 120);
      $(".dvn", card).textContent = total ? `${total} 檔` : "";
      if (!list.length) { out.innerHTML = `<p class="sub">沒有資料</p>`; return; }
      const by = {}; list.forEach(r => (by[r.d] = by[r.d] || []).push(r));
      const wd = "日一二三四五六";
      out.innerHTML = Object.entries(by).map(([d, rs]) => `<div class="dvday"><div class="dvdh"><b>${+d.slice(5, 7)}/${+d.slice(8)}</b><span>週${wd[new Date(d + "T00:00:00Z").getUTCDay()]}</span></div>${rs.map(r => `<button type="button" class="instrow dvrow" data-code="${A.esc(r.code)}"><span class="nm"><b>${A.esc(r.name)}</b><em>${A.esc(r.code)}</em></span><span class="dvk">${A.esc(r.kind || "")}</span><span class="dvv">${r.cash != null ? "現金 " + r.cash : ""}${r.stock != null && r.stock > 0 ? " 股票 " + r.stock : ""}</span></button>`).join("")}</div>`).join("");
      if (!RM) A.rise($$(".dvday", out).slice(0, 12), 40);
    } catch (e) { out.innerHTML = `<p class="sub">沒有資料</p>`; }
  }

  /* put the two cards and their buttons into 股票 */
  function mountList() {
    const dl = $("#dpList"), bar = dl && $(".lsub", dl); if (!dl || !bar || $(".cm", dl)) return !!$(".cm", dl);
    [["cm", "疊圖"], ["dv", "除息"]].forEach(([k, l]) => { const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "tab"); b.dataset.sub = k; b.setAttribute("aria-selected", "false"); b.textContent = l; bar.appendChild(b); });
    cmBuild(dl); dvBuild(dl);
    bar.addEventListener("click", e => { const b = e.target.closest("[data-sub]"); if (!b) return; if (b.dataset.sub === "cm") setTimeout(() => cmPaint(true), 30); if (b.dataset.sub === "dv") setTimeout(dvPaint, 30); });
    return true;
  }

  /* ================= opening / closing ritual ================= */
  let prevPhase = null;
  function ritualShow(kind) {
    if (document.hidden) return;
    const ix = A.IDX[0], p = ok(ix.z) && ok(ix.y) ? (ix.z / ix.y - 1) * 100 : null;
    const sw = document.createElement("div"); sw.className = "ritsweep"; document.body.appendChild(sw);
    const tx = document.createElement("div"); tx.className = "ritchip " + (p == null ? "" : p >= 0 ? "up" : "down");
    tx.innerHTML = `<b>${kind === "open" ? "台股開盤" : "台股收盤"}</b><span>加權 ${ok(ix.z) ? A.fmt(ix.z, 2) : "—"}${p == null ? "" : `　${p > 0 ? "+" : ""}${p.toFixed(2)}%`}</span>`;
    document.body.appendChild(tx);
    if (RM) { setTimeout(() => { sw.remove(); tx.remove(); }, 3500); return; }
    sw.animate([{ transform: "translateX(-110%)", opacity: 0 }, { opacity: 1, offset: .2 }, { transform: "translateX(110%)", opacity: 0 }], { duration: 1600, easing: "cubic-bezier(.4,0,.2,1)" }).onfinish = () => sw.remove();
    tx.animate([{ opacity: 0, transform: "translate(-50%,-14px) scale(.92)" }, { opacity: 1, transform: "translate(-50%,0) scale(1)", offset: .15 }, { opacity: 1, transform: "translate(-50%,0)", offset: .85 }, { opacity: 0, transform: "translate(-50%,-10px)" }], { duration: 4200, easing: "ease-out" }).onfinish = () => tx.remove();
  }
  function ritualTick() {
    const t = taipei(), wk = t.wd >= 1 && t.wd <= 5, ph = !wk ? "off" : t.m < 540 ? "pre" : t.m < 810 ? "day" : "post";
    if (prevPhase && ph !== prevPhase) { if (prevPhase === "pre" && ph === "day") ritualShow("open"); else if (prevPhase === "day" && ph === "post") ritualShow("close"); }
    prevPhase = ph;
  }

  /* ================= swipe to the next / previous watchlist stock (touch) ================= */
  function swipe() {
    let x0 = 0, y0 = 0, t0 = 0, ok0 = false;
    document.addEventListener("touchstart", e => {
      ok0 = false; if (A.tabNow() !== "dpStock" || e.touches.length !== 1) return;
      if (e.target.closest("svg, canvas, input, textarea, select, table, .ltblwrap, .kc, .peek, .ixdetail, [data-noswipe]")) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); ok0 = true;
    }, { passive: true });
    document.addEventListener("touchend", e => {
      if (!ok0) return; ok0 = false; const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Date.now() - t0 > 700 || Math.abs(dx) < 80 || Math.abs(dy) > 45 || Math.abs(dx) < Math.abs(dy) * 2.2) return;
      stepStock(dx < 0 ? 1 : -1, true);
    }, { passive: true });
  }
  function stepStock(dir, swiped) {
    const W = A.watch(); if (!W.length) return;
    const i = W.indexOf(A.code()), nx = W[((i < 0 ? (dir > 0 ? -1 : 0) : i) + dir + W.length) % W.length];
    if (nx === A.code()) return;
    const host = $("#dpStock"); if (host && !RM && swiped) host.animate([{ transform: `translateX(${dir * 28}px)`, opacity: .4 }, { transform: "none", opacity: 1 }], { duration: 320, easing: "cubic-bezier(.16,1,.3,1)" });
    A.openStock(nx);
    if (navigator.vibrate) navigator.vibrate(8);
  }

  /* ================= pull down to refresh (touch, at the top of the page) ================= */
  function pull() {
    const ind = document.createElement("div"); ind.className = "ptr"; ind.innerHTML = `<i></i><span>下拉更新</span>`; document.body.appendChild(ind);
    let y0 = 0, dy = 0, on = false, busy = false;
    const set = (d, txt) => { ind.style.transform = `translate(-50%, ${Math.min(d, 90) - 60}px)`; ind.style.opacity = Math.min(1, d / 60); $("i", ind).style.transform = `rotate(${d * 4}deg)`; if (txt) $("span", ind).textContent = txt; };
    document.addEventListener("touchstart", e => { on = false; if (busy || scrollY > 2 || e.touches.length !== 1 || e.target.closest("svg, canvas, input, textarea, .ixdetail, [data-noswipe]")) return; y0 = e.touches[0].clientY; dy = 0; on = true; }, { passive: true });
    document.addEventListener("touchmove", e => { if (!on) return; dy = (e.touches[0].clientY - y0) * 0.5; if (dy <= 0) { on = false; set(0); return; } set(dy, dy > 45 ? "放開更新" : "下拉更新"); }, { passive: true });
    document.addEventListener("touchend", () => {
      if (!on) return; on = false;
      if (dy > 45) {
        busy = true; set(56, "更新中…"); $("i", ind).classList.add("spin");
        Promise.resolve(A.refresh && A.refresh()).catch(() => {}).then(() => new Promise(r => setTimeout(r, 500))).finally(() => { $("i", ind).classList.remove("spin"); ind.style.transition = "transform .35s cubic-bezier(.34,1.56,.64,1), opacity .3s"; set(0); setTimeout(() => { ind.style.transition = ""; busy = false; }, 400); });
      } else { ind.style.transition = "transform .3s, opacity .3s"; set(0); setTimeout(() => { ind.style.transition = ""; }, 320); }
    }, { passive: true });
  }

  /* ================= keyboard ================= */
  const KEYS = [["/", "搜尋股票與功能"], ["1　2　3", "切換 總覽／分析／股票"], ["J　K", "個股頁：下一檔／上一檔自選股"], ["R", "立即更新行情"], ["?", "顯示這份說明"], ["Esc", "關閉視窗"]];
  function keyHelp() {
    let el = $(".kbhelp"); if (el) { el.remove(); return; }
    el = document.createElement("div"); el.className = "kbhelp"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "鍵盤快捷鍵");
    el.innerHTML = `<div class="kbcard"><h3>鍵盤快捷鍵</h3>${KEYS.map(([k, t]) => `<div><kbd>${k}</kbd><span>${t}</span></div>`).join("")}</div>`;
    el.addEventListener("click", () => el.remove()); document.body.appendChild(el);
    if (!RM) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); $(".kbcard", el).animate([{ transform: "scale(.94) translateY(8px)" }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.9,.3,1.2)" }); }
  }
  function keys() {
    document.addEventListener("keydown", e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "Escape") { const h = $(".kbhelp"); if (h) h.remove(); return; }
      if (e.key === "?") { e.preventDefault(); keyHelp(); return; }
      if (e.key === "/") { e.preventDefault(); document.dispatchEvent(new Event("twdash:palette")); return; }
      if (/^[123]$/.test(e.key)) { const p = ["dpOverview", "dpAnalysis", "dpList"][+e.key - 1], b = $(`.dtabs button[data-p="${p}"]`) || $$(".dtabs button[data-p]")[+e.key - 1]; if (b && !b.hidden) b.click(); return; }
      if ((e.key === "j" || e.key === "k") && A.tabNow() === "dpStock" && !(t && t.matches && t.matches("tr[data-code]"))) { stepStock(e.key === "j" ? 1 : -1, false); return; }
      if (e.key === "r" || e.key === "R") { A.refresh && A.refresh(); }
    });
  }

  function start() {
    A = window.TWDash && window.TWDash.api; if (!A) return;
    let tries = 0; const t = setInterval(() => { if (mountList() || ++tries > 40) clearInterval(t); }, 250);
    document.addEventListener("twdash:list", () => { if ($("#dpList .cm") && !$("#dpList .cm").hidden) cmPaint(false); });
    setInterval(ritualTick, 1000); ritualTick();
    swipe(); pull(); keys();
    sideToggle(); popAnim(); closeAnim(); actionAnim();
    window.TWDash.ritual = ritualShow;      /* TWDash.ritual("open") plays the opening animation for a look */
  }
  /* closing animates too: setting .hidden = true on a pop-open element first plays a short fade/sink, then hides it */
  function closeAnim() {
    const POP = ".ixdetail, .hmtip, .ktip, .kbcard, .sresults, .searchbox, .thpop, .thmenu, [role=dialog], [role=menu], [role=listbox], [role=tooltip], .popover, .menu-pop";
    const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "hidden"); if (!d || !d.set) return;
    const pend = new WeakMap();
    Object.defineProperty(HTMLElement.prototype, "hidden", { configurable: true, enumerable: d.enumerable, get() { return pend.has(this) ? true : d.get.call(this); }, set(v) {
      const el = this;
      if (pend.has(el)) { if (v) return; try { pend.get(el).cancel(); } catch (e) {} pend.delete(el); }
      if (v && !d.get.call(el) && el.matches(POP) && el.isConnected && el.getClientRects().length) {
        let a; try { a = el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(10px) scale(.98)" }], { duration: 240, easing: "ease-in", fill: "forwards" }); } catch (e) { d.set.call(el, v); return; }
        pend.set(el, a);
        a.onfinish = () => { pend.delete(el); d.set.call(el, true); try { a.cancel(); } catch (e) {} };
        return;
      }
      d.set.call(el, v);
    } });
  }
  /* anything an action adds to the page (rows, cards, results, panels) rises in; live refreshes stay quiet */
  function actionAnim() {
    let at = 0; const mark = () => { at = Date.now(); };
    ["click", "keydown", "change", "submit", "pointerup"].forEach(t => document.addEventListener(t, mark, true));
    /* removed items leave too: a ghost copy collapses in place while the real node goes at once */
    const rm = Element.prototype.remove, rc = Node.prototype.removeChild;
    const ghost = el => {
      try {
        if (Date.now() - at > 1200 || !(el instanceof HTMLElement) || !el.isConnected || !el.closest(".app") || el.closest(".side, .topbar, .sbtog, svg, .ixdetail, .xghost") || /^(SCRIPT|STYLE|TR|TD|TH|OPTION)$/.test(el.tagName)) return;
        const r = el.getBoundingClientRect(); if (r.height < 24 || r.width < 40 || !el.parentNode) return;
        const g = el.cloneNode(true); g.removeAttribute("id"); g.querySelectorAll("[id]").forEach(x => x.removeAttribute("id")); g.classList.add("xghost"); g.setAttribute("aria-hidden", "true"); g.style.cssText += `;pointer-events:none;overflow:hidden;box-sizing:border-box;height:${r.height}px`;
        el.parentNode.insertBefore(g, el);
        const a = g.animate([{ height: r.height + "px", opacity: 1, transform: "none" }, { height: "0px", opacity: 0, transform: "translateX(-14px)", marginTop: "0px", marginBottom: "0px", paddingTop: "0px", paddingBottom: "0px" }], { duration: 260, easing: "ease-in", fill: "forwards" });
        a.onfinish = () => rm.call(g);
      } catch (e) {}
    };
    Element.prototype.remove = function () { ghost(this); return rm.call(this); };
    Node.prototype.removeChild = function (c) { ghost(c); return rc.call(this, c); };
    new MutationObserver(ms => {
      if (Date.now() - at > 1200) return;
      let n = 0;
      ms.forEach(m => m.addedNodes.forEach(el => {
        if (el.nodeType !== 1 || n > 40 || el.closest(".side, .topbar, .sbtog, svg, .ixdetail")) return;
        const h = el.getBoundingClientRect(); if (h.height < 24 || h.width < 40) return;
        try { el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 320, delay: Math.min(n, 12) * 28, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }); } catch (e) {} n++;
      }));
    }).observe(document.querySelector(".app") || document.body, { subtree: true, childList: true });
  }
  /* the left menu opens and closes; the choice is remembered. Closed: the top tabs take over navigation. */
  function sideToggle() {
    if ($(".sbtog")) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "sbtog"; b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15"/></svg>';
    const set = hide => { document.body.classList.toggle("sbhide", hide); b.setAttribute("aria-label", hide ? "開啟左側選單" : "關閉左側選單"); b.title = b.getAttribute("aria-label"); b.setAttribute("aria-expanded", String(!hide)); try { localStorage.setItem("tw.sbhide", hide ? "1" : "0"); } catch (e) {} };
    let h = false; try { h = localStorage.getItem("tw.sbhide") === "1"; } catch (e) {}
    b.addEventListener("click", () => set(!document.body.classList.contains("sbhide")));
    document.body.appendChild(b); set(h);
  }
  /* everything that pops open animates: detail panels, menus, tips and dialogs; chart lines inside the index panel draw in */
  function popAnim() {
    const POP = ".ixdetail, .hmtip, .ktip, .thmenu, .kbcard, .sresults, .searchbox, [role=dialog], [role=menu], [role=listbox], [role=tooltip], .popover, .menu-pop";
    const seen = new WeakMap(), isOpen = el => !el.hidden && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden" && +getComputedStyle(el).opacity > 0.01;
    const IN = [{ opacity: 0, transform: "translateY(14px) scale(.97)" }, { opacity: 1, transform: "none" }];
    const pop = el => { try { el.animate(IN, { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" }); } catch (e) {} };
    let clk = 0; document.addEventListener("click", e => { if (e.target.closest && e.target.closest(".ixcard, .ixdetail button")) clk = Date.now(); }, true);
    const draw = root => {
      if (Date.now() - clk > 1500) return;   /* live refreshes redraw the chart quietly; only a click on a card or range plays the animation */
      $$(".ixline", root).forEach(l => { if (l.dataset.dr) return; l.dataset.dr = "1"; l.setAttribute("pathLength", "1"); l.style.strokeDasharray = "1"; const a = l.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 800, easing: "cubic-bezier(.215,.61,.355,1)" }); a.onfinish = () => { l.style.strokeDasharray = ""; }; });
      $$(".ixarea", root).forEach(a => { if (a.dataset.dr) return; a.dataset.dr = "1"; a.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 250, easing: "ease-out", fill: "backwards" }); });
      $$(".ixbk", root).forEach(g => { if (g.dataset.dr) return; g.dataset.dr = "1"; g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 }); });
    };
    const check = el => { const now = isOpen(el), was = seen.get(el); seen.set(el, now); if (now && was === false) { pop(el); if (el.matches(".ixdetail")) draw(el); } };
    $$(POP).forEach(el => seen.set(el, isOpen(el)));
    new MutationObserver(ms => {
      const todo = new Set();
      ms.forEach(m => {
        if (m.type === "attributes") { const t = m.target; if (t.matches && t.matches(POP)) todo.add(t); if (m.attributeName === "aria-expanded" && t.getAttribute("aria-expanded") === "true" && t.classList && t.classList.contains("ixcard")) { try { t.animate([{ transform: "scale(.96)" }, { transform: "scale(1.02)" }, { transform: "none" }], { duration: 360, easing: "ease-out" }); } catch (e) {} } }
        else m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.matches(POP)) { seen.set(n, false); todo.add(n); } else if (n.querySelectorAll) n.querySelectorAll(POP).forEach(x => { seen.set(x, false); todo.add(x); }); const d = n.closest && n.closest(".ixdetail"); if (d && (n.matches(".ixfig") || n.querySelector(".ixfig"))) draw(d); });
      });
      todo.forEach(check);
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "class", "style", "aria-expanded"] });
  }
  if (window.TWDash && window.TWDash.api) start(); else document.addEventListener("twdash:ready", start);
})();
