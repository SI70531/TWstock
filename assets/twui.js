/* TWstock UI v3 widgets: sidebar and top bar, market clock, mini watchlist, market mood for the aurora,
   counting numbers with a colour flash, card tilt with a moving sheen, and loading skeletons.
   Reads the dashboard through window.TWDash.api (twmain.js) and never changes its data. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const ICONS = {
    dpOverview: '<path d="M3 13h4l3-8 4 14 3-6h4"/>',
    dpPre: '<path d="M12 3v2M5.6 5.6l1.4 1.4M3 12h2M19 12h2M17 7l1.4-1.4"/><path d="M7 16a5 5 0 0 1 10 0"/><path d="M3 20h18"/>',
    dpMid: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    dpList: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    dpAlert: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    dpHold: '<rect x="3.5" y="7" width="17" height="12" rx="2.5"/><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3.5 12.5h17"/>',
    dpCal: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    dpWatch: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    dpChip: '<path d="M4 18V9M10 18V5M16 18v-7M21 18H3"/><circle cx="19" cy="6" r="2"/>',
    dpInd: '<rect x="3.5" y="3.5" width="7" height="9" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.5"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.5"/><rect x="3.5" y="15.5" width="7" height="5" rx="1.5"/>',
    dpRev: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4.5h4.5"/><path d="M12 8v4.5l3 1.5"/>',
    dpStock: '<path d="M6 4v4M6 12v8M12 6v10M18 3v5M18 12v9"/><rect x="4.5" y="8" width="3" height="4" rx=".6"/><rect x="16.5" y="8" width="3" height="4" rx=".6"/>',
  };
  let A = null;

  /* ---------- session and clock (Taipei) ---------- */
  function taipei() {
    const t = new Date(Date.now() + 8 * 3600e3);
    return { wd: t.getUTCDay(), m: t.getUTCHours() * 60 + t.getUTCMinutes(), hms: t.toISOString().slice(11, 19), md: (t.getUTCMonth() + 1) + "/" + t.getUTCDate() };
  }
  function session() {
    const t = taipei(), wk = t.wd >= 1 && t.wd <= 5;
    if (wk && t.m >= 540 && t.m <= 810) return ["day", "台股盤中"];
    if (wk && t.m >= 525 && t.m < 540) return ["pre", "試撮中"];
    if ((wk && t.m >= 900) || (t.wd >= 2 && t.wd <= 6 && t.m < 300)) return ["night", "期貨夜盤"];
    return ["closed", "休市"];
  }

  /* TAIFEX index futures: day session 08:45-13:45 (Mon-Fri), night session 15:00-05:00 (Mon evening to Sat morning) */
  function futSess() {
    const t = taipei(), wk = t.wd >= 1 && t.wd <= 5;
    if (wk && t.m >= 525 && t.m < 825) return ["day", "日盤"];
    if ((wk && t.m >= 900) || (t.wd >= 2 && t.wd <= 6 && t.m < 300)) return ["night", "夜盤"];
    return ["closed", "休市"];
  }

  /* ---------- shell ---------- */
  function buildShell() {
    const allTabs = $$('.dtabs button[role="tab"]'), tabs = allTabs.filter(t => !t.hidden); if (!tabs.length || $(".side")) return;
    /* sidebar */
    const side = document.createElement("aside");
    /* the top tab bar (phones and tablets) gets the same icons as the sidebar */
    allTabs.forEach(t => { if (!$("svg", t) && ICONS[t.dataset.p]) t.insertAdjacentHTML("afterbegin", `<svg class="tabic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[t.dataset.p]}</svg>`); });
    window.dispatchEvent(new Event("resize"));
    side.className = "side"; side.setAttribute("aria-label", "側欄");
    side.innerHTML = `<div class="sb-clock"><div class="s"><span class="statuschip" data-s="closed"><i></i><span class="ss">—</span></span></div><div class="trow"><div class="t">--:--:--</div><span class="sd"></span></div>
        <div class="sb-prog" hidden><div class="bar"><i></i></div><span></span></div>
        <div class="sb-ix" data-k="t00"><span>加權</span><b>—</b></div><div class="sb-ix" data-k="fut"><span>台指期</span><b>—</b></div></div>
      <nav aria-label="主要導覽"><i class="sb-hl"></i>${tabs.map(t => `<button type="button" data-p="${t.dataset.p}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[t.dataset.p] || '<circle cx="12" cy="12" r="3"/>'}</svg>${t.textContent.trim()}</button>`).join("")}</nav>`;
    document.body.appendChild(side);
    side.addEventListener("click", e => {
      const b = e.target.closest("nav button"); if (b) { const t = tabs.find(x => x.dataset.p === b.dataset.p); t && t.click(); return; }
      const r = e.target.closest(".sb-row"); if (r && A) A.openStock(r.dataset.code);
    });
    const place = () => {
      const sel = allTabs.find(t => t.getAttribute("aria-selected") === "true"), key = sel ? (sel.hidden ? sel.dataset.under : sel.dataset.p) : "";
      const i = Math.max(0, tabs.findIndex(t => t.dataset.p === key));
      $$("nav button", side).forEach((b, k) => b.setAttribute("aria-current", String(k === i)));
      const hl = $(".sb-hl", side), btn = $$("nav button", side)[i]; if (btn) hl.style.transform = `translateY(${btn.offsetTop}px)`;
      const tt = $(".topbar .tb-title h2"); if (tt) tt.textContent = (sel && sel.hidden ? sel : tabs[i]).textContent.trim();
    };
    new MutationObserver(place).observe($(".dtabs"), { subtree: true, attributes: true, attributeFilter: ["aria-selected"] });

    /* top bar: page title, market status, appearance */
    const main = $(".app main"), bar = document.createElement("div");
    bar.className = "topbar";
    bar.innerHTML = `<div class="tb-brand">TWstock</div><div class="tb-title"><h2>總覽</h2></div>
      <span class="statuschip tbchip" data-s="closed"><i></i><span class="ss">—</span></span><div class="tb-right"></div>`;
    main.insertBefore(bar, main.firstChild);
    /* phones and tablets have no sidebar: the clock and the two quotes sit in a second row of the (sticky) top bar */
    const mc = document.createElement("div");
    mc.className = "mclock";
    mc.innerHTML = `<div class="mc-t"><b class="t">--:--:--</b><span class="sd"></span></div>
      <div class="sb-ix" data-k="t00"><span>加權</span><b>—</b></div><div class="sb-ix" data-k="fut"><span>台指期</span><b>—</b></div>
      <div class="sb-prog" hidden><div class="bar"><i></i></div><span></span></div>`;
    bar.appendChild(mc);
    const prog = document.createElement("i"); prog.className = "tb-prog"; prog.setAttribute("aria-hidden", "true"); bar.appendChild(prog);
    let sf = 0;
    const onScroll = () => { if (sf) return; sf = requestAnimationFrame(() => {
      sf = 0; const max = document.documentElement.scrollHeight - innerHeight;
      bar.classList.toggle("scrolled", scrollY > 24);
      prog.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max).toFixed(4) : 0})`;
    }); };
    addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll); onScroll();
    const right = $(".tb-right", bar);
    /* 說明 + light / dark / follow the device (same pattern as EZexams, in Chinese) */
    const T = window.__twTheme, seg = document.createElement("div");
    const IC = { system: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>', light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', dark: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>' };
    const LB = { system: "系統", light: "淺色", dark: "深色" };
    seg.className = "thdd";
    seg.innerHTML = `<button type="button" class="thbtn" aria-haspopup="menu" aria-expanded="false" aria-label="外觀"><svg viewBox="0 0 24 24" aria-hidden="true"></svg></button><div class="thpop" role="menu" hidden>${["system", "light", "dark"].map(k => `<button type="button" role="menuitemradio" data-t="${k}"><b>✓</b>${LB[k]}</button>`).join("")}</div>`;
    const hb = document.createElement("a"); hb.className = "btn thhelp"; hb.href = "help.html"; hb.textContent = "說明";
    right.appendChild(hb);
    /* the command palette (twmain.js) also opens with Ctrl+K */
    const sb = document.createElement("button");
    sb.type = "button"; sb.className = "tbsearch"; sb.setAttribute("aria-label", "搜尋股票或頁面（Ctrl+K）");
    sb.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><span>搜尋</span><kbd>Ctrl K</kbd>`;
    sb.addEventListener("click", () => document.dispatchEvent(new Event("twdash:palette")));
    right.appendChild(sb);
    const gb = document.createElement("button"); gb.type = "button"; gb.className = "thbtn tbset"; gb.setAttribute("aria-label", "設定"); gb.title = "設定";
    gb.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
    gb.addEventListener("click", () => { gb.animate([{ transform: "rotate(0)" }, { transform: "rotate(90deg)" }], { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" }); document.dispatchEvent(new Event("twdash:settings")); });
    right.appendChild(gb);
    right.appendChild(seg);
    const tbtn = $(".thbtn", seg), pop = $(".thpop", seg);
    const markTheme = () => {
      const m = T ? T.mode : "system";
      $("svg", tbtn).innerHTML = IC[m]; tbtn.title = "外觀：" + LB[m];
      $$("[data-t]", pop).forEach(b => b.setAttribute("aria-checked", String(b.dataset.t === m)));
    };
    const shut = () => { pop.hidden = true; tbtn.setAttribute("aria-expanded", "false"); };
    tbtn.addEventListener("click", e => { e.stopPropagation(); pop.hidden = !pop.hidden; tbtn.setAttribute("aria-expanded", String(!pop.hidden)); });
    pop.addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (!b || !T) return; T.set(b.dataset.t); markTheme(); shut(); });
    document.addEventListener("click", e => { if (!pop.hidden && !e.target.closest(".thdd")) shut(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") shut(); });
    markTheme();
    requestAnimationFrame(place);
    addEventListener("resize", place);
  }
  function tickClock() {
    const t = taipei(), [s, label] = session();
    $$(".statuschip:not(.futchip)").forEach(c => { c.dataset.s = s; const ss = $(".ss", c); if (ss) ss.textContent = label; const tt = $(".tt", c); if (tt) tt.textContent = t.hms; });
    const [fk, fl] = futSess();
    $$(".statuschip:not(.futchip)").forEach(c => {
      let f = c.nextElementSibling && c.nextElementSibling.classList.contains("futchip") ? c.nextElementSibling : null;
      if (!fk || fk === "closed") { if (f) f.remove(); return; }
      if (!f) { f = document.createElement("span"); f.className = "statuschip futchip"; f.innerHTML = "<i></i><span class=\"ss\"></span>"; c.after(f); }
      const ss = $(".ss", f), tx = "台指期" + fl; f.dataset.s = fk; if (ss.textContent !== tx) ss.textContent = tx;
    });
    const mc = $(".mclock"); if (mc) { $(".t", mc).textContent = t.hms; $(".sd", mc).textContent = t.md; }
    const side = $(".side"); if (!side) return;
    $(".sb-clock .t", side).textContent = t.hms; $(".sb-clock .sd", side).textContent = t.md;
    /* how far the session has run, and how long until it ends (or opens) */
    const prs = $$(".sb-prog"), now = new Date(Date.now() + 8 * 3600e3), sec = t.m * 60 + now.getUTCSeconds();
    const span = s === "day" ? [540, 810, "距收盤"] : s === "pre" ? [525, 540, "距開盤"] : s === "night" ? [900, 1740, "距夜盤收盤"] : null;
    if (!span) { prs.forEach(pr => { pr.hidden = true; }); return; }
    const cur = s === "night" && sec < 300 * 60 ? sec + 1440 * 60 : sec, a = span[0] * 60, b = span[1] * 60, left = Math.max(0, b - cur);
    const hh = Math.floor(left / 3600), mm = Math.floor(left % 3600 / 60), ss = left % 60, two = n => String(n).padStart(2, "0");
    prs.forEach(pr => {
      pr.hidden = false; pr.dataset.s = s;
      $("i", pr).style.transform = `scaleX(${Math.min(1, Math.max(0, (cur - a) / (b - a))).toFixed(4)})`;
      $("span", pr).textContent = `${span[2]} ${hh ? hh + ":" + two(mm) : mm}:${two(ss)}`;
      pr.classList.toggle("ending", s === "day" && left <= 300);
    });
  }
  function paintSide() {
    const side = $(".side"); if (!side || !A) return;
    const sp = p => { const v = Number.isFinite(p) ? Math.round(p * 100) / 100 : 0; return (p < 0 && v === 0 ? "-0.00" : (v < 0 ? "" : "+") + (v || 0).toFixed(2)) + "%"; };
    const fmt = (v, d) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
    A.IDX.slice(0, 2).forEach(i => {
      const p = Number.isFinite(i.z) && Number.isFinite(i.y) ? (i.z / i.y - 1) * 100 : NaN;
      $$(`.sb-ix[data-k="${i.k}"] b`).forEach(el => {
        el.textContent = Number.isFinite(i.z) ? `${fmt(i.z, 2)}  ${sp(p)}` : "—";
        el.className = p > 0 ? "up" : p < 0 ? "down" : "";
      });
    });
    const W = (A.watch ? A.watch() : A.store.get("twtrade-watch", []) || []).slice(0, 12), box = $(".sb-watch", side);
    if (box && A.DB.list.length) box.innerHTML = W.length ? W.map(c => {
      const s = A.DB.by.get(c); if (!s) return "";
      const t = s.chg > 0 ? "up" : s.chg < 0 ? "down" : "";
      return `<button type="button" class="sb-row" data-code="${A.esc(c)}"><b>${A.esc(s.name)}</b><span class="p ${t}">${fmt(s.price, s.price < 50 ? 2 : s.price < 1000 ? 1 : 0)}</span><span>${A.esc(c)}</span><span class="p ${t}">${sp(s.pct)}</span></button>`;
    }).join("") : `<p class="sb-empty">還沒有自選股。在清單點 ★ 加入。</p>`;
    /* the aurora leans red or green with the TAIEX */
    const ix = A.IDX[0], p = Number.isFinite(ix.z) && Number.isFinite(ix.y) ? (ix.z / ix.y - 1) * 100 : 0;
    root.dataset.mood = p > 0.3 ? "up" : p < -0.3 ? "down" : "flat";
  }

  /* ---------- numbers: count from the old value to the new one, then flash in the market colour ---------- */
  const LAST = new Map(), RUN = new WeakSet();
  const num = s => { const m = String(s).replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
  const decs = s => { const m = String(s).replace(/,/g, "").match(/\.(\d+)/); return m ? m[1].length : 0; };
  function keyOf(el, i) {
    const host = el.closest("[data-code],[data-k]"), id = host ? (host.dataset.code || host.dataset.k) : "";
    const pane = el.closest(".dpanel"); return (pane ? pane.id : "") + ":" + id + ":" + (el.className.split(" ")[0]) + ":" + (host ? "" : i);
  }
  function countTo(el, from, to, text) {
    const d = decs(text), t0 = performance.now(), dur = 700, prefix = text.match(/^[^\d-]*/)[0], suffix = text.match(/[^\d.,]*$/)[0];
    RUN.add(el);
    const step = now => {
      if (el.dataset.txt && el.dataset.txt !== text) { RUN.delete(el); return; }   /* a newer quote arrived: let it stand */
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = from + (to - from) * e;
      el.textContent = k < 1 ? prefix + v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) + suffix : text;
      if (k < 1) requestAnimationFrame(step); else RUN.delete(el);
    };
    requestAnimationFrame(step);
  }
  /* odometer: only the digits that changed slide (old up, new in); a longer or shorter number just swaps */
  function roll(el, old, text, up) {
    if (!old || old.length !== text.length) return;
    RUN.add(el);
    el.innerHTML = [...text].map((c, i) => (c !== old[i] && /\d/.test(c) ? `<span class="odo ${up ? "u" : "d"}"><span>${up ? `<i>${old[i]}</i><i>${c}</i>` : `<i>${c}</i><i>${old[i]}</i>`}</span></span>` : c)).join("");
    setTimeout(() => { el.textContent = text; RUN.delete(el); }, 700);
  }
  function scanNumbers() {
    $$(".dash .big, .side .sb-ix b").forEach((el, i) => {
      if (RUN.has(el)) return;
      /* who: the stock now shown on the 個股分析 page; switching to another stock counts up from 0 */
      const text = el.textContent, v = num(text), k = keyOf(el, i), who = el.closest("#dpStock") && A && A.code ? A.code() : el.closest(".ixdetail") && A && A.ixk ? A.ixk() : "", prev = LAST.get(k);
      LAST.set(k, { v, who, text });
      if (!Number.isFinite(v) || !prev) return;
      /* the same stock or index moving: count from the value that was on screen (37,000 → 36,800); another stock or index (or a first value): count up from 0 */
      const from = prev.who !== who || !Number.isFinite(prev.v) ? 0 : prev.v;
      if (from === v) return;
      countTo(el, from, v, text);
    });
    $$(".dash .pxpill").forEach(el => {
      const tr = el.closest("[data-code]"), k = "px:" + (tr ? tr.dataset.code : ""), v = num(el.textContent), old = LAST.get(k);
      LAST.set(k, v);
      if (!Number.isFinite(old) || old === v) return;
      el.classList.add(v > old ? "pxflash-up" : "pxflash-down");
      setTimeout(() => el.classList.remove("pxflash-up", "pxflash-down"), 1100);
    });
  }

  /* ---------- skeletons for anything still loading ---------- */
  const LOADING = /^(載入中…?|載入走勢…|讀取中…?)$/;
  function scanSkeletons() {
    $$(".app p, .app .mempty, .app .sub, .app .big, .app td, .side .sb-empty").forEach(el => {
      if (el.children.length > 1) return;
      const t = el.textContent.trim(), loading = LOADING.test(t) || (el.classList.contains("big") && t === "—" && A && !A.DB.list.length);
      el.classList.toggle("skel", loading);
      if (loading && (el.tagName === "P" || el.classList.contains("mempty"))) el.classList.add("block"); else el.classList.remove("block");
    });
  }

  /* ---------- tilt and sheen on cards ---------- */
  const TILT = ".ixcard, .wcard, .pmf, .aiteam > .dcard, .aiscen > .dcard, .lcard, .snap, .mcell, .aiorder, .pmchance > div";
  function tilt(e) {
    const el = e.target.closest && e.target.closest(TILT);
    $$(".tilting").forEach(x => { if (x !== el) untilt(x); });
    if (!el) return;
    el.classList.add("tilt", "tilting");
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const amp = Math.max(1.5, Math.min(8, 1400 / Math.max(r.width, 1)));
    el.style.setProperty("--mx", (x * 100).toFixed(1) + "%"); el.style.setProperty("--my", (y * 100).toFixed(1) + "%");
    el.style.setProperty("--rx", ((0.5 - y) * amp).toFixed(2) + "deg"); el.style.setProperty("--ry", ((x - 0.5) * amp).toFixed(2) + "deg");
  }
  function untilt(el) { el.classList.remove("tilting"); el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); }


  /* ---------- a soft light that follows the pointer across a card, and brightens its ring ---------- */
  let spotEl = null;
  function spot(e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    const el = e.target.closest && e.target.closest(".dcard:not(.dcard .dcard)");
    if (spotEl && spotEl !== el) spotEl.classList.remove("spot");
    spotEl = el; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--sx", (e.clientX - r.left).toFixed(0) + "px"); el.style.setProperty("--sy", (e.clientY - r.top).toFixed(0) + "px");
    el.classList.add("spot");
  }
  /* ---------- pressing anything that acts: a ripple from the exact point, clipped to the control's own shape ---------- */
  const PRESS = "button, [role=tab], .chip, tr[data-code], .bd-row, .hmt, .tp, .sb-row, .wcard";
  function ripple(e) {
    if (e.button > 0) return;
    const el = e.target.closest && e.target.closest(PRESS); if (!el || el.disabled || el.closest(".pal, .ctxmenu")) return;
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const cs = getComputedStyle(el), host = document.createElement("span"), dot = document.createElement("i");
    host.className = "rp"; host.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${cs.borderRadius}`;
    const d = Math.hypot(Math.max(e.clientX - r.left, r.right - e.clientX), Math.max(e.clientY - r.top, r.bottom - e.clientY)) * 2;
    dot.style.cssText = `left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px;width:${d}px;height:${d}px`;
    host.appendChild(dot); document.body.appendChild(host);
    const a = dot.animate([{ transform: "scale(0)", opacity: 0.5 }, { transform: "scale(1)", opacity: 0 }], { duration: 650, easing: "cubic-bezier(.16,1,.3,1)" });
    a.onfinish = () => host.remove();
    if (el.matches("button, .chip, .bd-row, .tp, .sb-row")) el.animate([{ transform: "scale(1)" }, { transform: "scale(.96)" }, { transform: "scale(1)" }], { duration: 260, easing: "cubic-bezier(.16,1,.3,1)" });
  }

  /* ---------- hot cards: a brighter ring and glow for big moves, a pulse at limit up / down ---------- */
  function scanHot() {
    $$(".ixcard, .wcard, .bd-tile").forEach(el => {
      const m = el.textContent.replace(/,/g, "").match(/([+-−]?\d+(?:\.\d+)?)%/); if (!m) return;
      const p = parseFloat(m[1].replace("−", "-")), idx = el.classList.contains("ixcard"), th = idx ? 1.5 : 4;
      const dn = /▼/.test(el.textContent) || p < 0, v = dn ? -Math.abs(p) : p;
      el.classList.toggle("hot-up", v >= th); el.classList.toggle("hot-down", v <= -th);
      el.classList.toggle("limit", !idx && Math.abs(v) >= 9.4);
      el.style.color = ""; if (!idx && Math.abs(v) >= 9.4) el.style.setProperty("color", v > 0 ? "var(--color-up)" : "var(--color-down)");
    });
  }

  /* ---------- backdrop: drifting glowing particles and occasional light streaks shaped like a price line ---------- */
  function backdrop() {
    const cv = document.createElement("canvas"); cv.className = "bgfx"; cv.setAttribute("aria-hidden", "true");
    document.body.insertBefore(cv, document.body.firstChild.nextSibling);
    const ctx = cv.getContext("2d"); let W = 0, H = 0, dpr = 1;
    const size = () => { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size(); addEventListener("resize", size);
    const rnd = (a, b) => a + Math.random() * (b - a), COLORS = () => { const cs = getComputedStyle(root); return ["--ring-a", "--ring-b", "--ring-c", "--color-up", "--color-down"].map(k => cs.getPropertyValue(k).trim()); };
    let pal = COLORS(); new MutationObserver(() => { pal = COLORS(); }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    const N = Math.round(Math.min(90, (innerWidth * innerHeight) / 16000));
    const P = Array.from({ length: N }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(0.6, 2.4), vx: rnd(-0.15, 0.15), vy: rnd(-0.35, -0.05), c: Math.floor(rnd(0, 3)), tw: rnd(0, 6.28) }));
    const S = [];   /* streaks: an area chart line that draws itself across the screen and fades */
    const streak = () => {
      const up = root.dataset.mood === "down" ? Math.random() < 0.35 : Math.random() < 0.65, cs = [], w = rnd(9, 13);
      let y = rnd(H * 0.3, H * 0.75);
      for (let x = -20; x <= W + 20; x += w * 1.7) {
        const o = y, c = o + rnd(-26, 26) + (up ? -4 : 4), h = Math.min(o, c) - rnd(2, 14), l = Math.max(o, c) + rnd(2, 14);
        cs.push({ x, o, c, h, l }); y = c;
      }
      S.push({ cs, w, t: 0 });
    };
    let last = 0, next = 1500;
    const frame = now => {
      requestAnimationFrame(frame);
      if (document.hidden) return;
      const dt = Math.min(50, now - last); last = now;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = root.dataset.theme === "light" ? "source-over" : "lighter";
      P.forEach(p => {
        p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; p.tw += dt / 600;
        if (p.y < -10) { p.y = H + 10; p.x = rnd(0, W); } if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
        const a = 0.35 + 0.35 * Math.sin(p.tw), g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
        g.addColorStop(0, pal[p.c]); g.addColorStop(1, "transparent");
        ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 6, 0, 6.283); ctx.fill();
      });
      next -= dt; if (next <= 0 && S.length < 3) { streak(); next = rnd(2500, 6000); }
      for (let i = S.length - 1; i >= 0; i--) {
        const s = S[i]; s.t += dt / 2600; if (s.t >= 1.6) { S.splice(i, 1); continue; }
        const n = Math.max(1, Math.floor(s.cs.length * Math.min(1, s.t))), fade = s.t > 1 ? 1 - (s.t - 1) / 0.6 : 1;
        /* an area chart: a glowing price line with a soft fill fading downwards; red when it ends above where it began, green when below */
        const pts = s.cs.slice(0, n + 1), col = pal[pts[pts.length - 1].c <= s.cs[0].o ? 3 : 4];
        let top = Infinity, bot = -Infinity; pts.forEach(q => { top = Math.min(top, q.c); bot = Math.max(bot, q.c); });
        const edge = Math.min(H, bot + 170), g = ctx.createLinearGradient(0, top, 0, edge);
        g.addColorStop(0, col); g.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.moveTo(pts[0].x, edge); pts.forEach(q => ctx.lineTo(q.x, q.c)); ctx.lineTo(pts[pts.length - 1].x, edge); ctx.closePath();
        ctx.globalAlpha = 0.22 * fade; ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.c) : ctx.moveTo(q.x, q.c)));
        ctx.globalAlpha = 0.7 * fade; ctx.lineWidth = 1.8; ctx.lineJoin = "round"; ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    };
    requestAnimationFrame(frame);
  }

  /* ---------- start ---------- */
  let pending = false;
  const schedule = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; scanNumbers(); scanSkeletons(); scanHot(); }); };
  function start() {
    A = window.TWDash && window.TWDash.api;
    buildShell(); tickClock(); paintSide(); scanSkeletons(); scanHot(); backdrop();
    setInterval(tickClock, 1000);
    setInterval(paintSide, 3000);
    document.addEventListener("twdash:list", paintSide);
    document.addEventListener("twdash:live", paintSide);
    new MutationObserver(schedule).observe(document.querySelector(".app") || document.body, { subtree: true, childList: true, characterData: true });
    document.addEventListener("pointermove", tilt, { passive: true });
    document.addEventListener("pointermove", spot, { passive: true });
    document.addEventListener("pointerdown", ripple, { passive: true });
    document.addEventListener("pointerleave", () => { if (spotEl) { spotEl.classList.remove("spot"); spotEl = null; } });
    document.addEventListener("pointerleave", () => $$(".tilting").forEach(untilt));
    document.addEventListener("pointerup", e => { if (e.pointerType !== "mouse") $$(".tilting").forEach(untilt); });
    document.addEventListener("pointercancel", () => $$(".tilting").forEach(untilt));
  }
  if (window.TWDash && window.TWDash.api) start(); else document.addEventListener("twdash:ready", start, { once: true });
})();
