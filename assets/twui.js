/* TWstock UI v3 widgets: sidebar and top bar, market clock, mini watchlist, market mood for the aurora,
   counting numbers with a colour flash, card tilt with a moving sheen, and loading skeletons.
   Reads the dashboard through window.TWDash.api (twmain.js) and never changes its data. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const ICONS = {
    dpOverview: '<path d="M3 13h4l3-8 4 14 3-6h4"/>',
    dpWatch: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
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

  /* ---------- shell ---------- */
  function buildShell() {
    const tabs = $$('.dtabs button[role="tab"]'); if (!tabs.length || $(".side")) return;
    /* sidebar */
    const side = document.createElement("aside");
    side.className = "side"; side.setAttribute("aria-label", "側欄");
    side.innerHTML = `<div class="sb-brand"><span class="mk">TW</span><div>TWstock<small>台股研究</small></div></div>
      <nav aria-label="主要導覽"><i class="sb-hl"></i>${tabs.map(t => `<button type="button" data-p="${t.dataset.p}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[t.dataset.p] || '<circle cx="12" cy="12" r="3"/>'}</svg>${t.textContent.trim()}</button>`).join("")}</nav>
      <div class="sb-clock"><div class="s"><span class="statuschip" data-s="closed"><i></i><span class="ss">—</span></span><span class="sd"></span></div><div class="t">--:--:--</div>
        <div class="sb-ix" data-k="t00"><span>加權</span><b>—</b></div><div class="sb-ix" data-k="fut"><span>台指期</span><b>—</b></div></div>
      <div class="sb-h">自選股</div><div class="sb-watch"><p class="sb-empty">載入中…</p></div>`;
    document.body.appendChild(side);
    side.addEventListener("click", e => {
      const b = e.target.closest("nav button"); if (b) { const t = tabs.find(x => x.dataset.p === b.dataset.p); t && t.click(); return; }
      const r = e.target.closest(".sb-row"); if (r && A) A.openStock(r.dataset.code);
    });
    const place = () => {
      const i = Math.max(0, tabs.findIndex(t => t.getAttribute("aria-selected") === "true"));
      $$("nav button", side).forEach((b, k) => b.setAttribute("aria-current", String(k === i)));
      const hl = $(".sb-hl", side), btn = $$("nav button", side)[i]; if (btn) hl.style.transform = `translateY(${btn.offsetTop}px)`;
      const tt = $(".topbar .tb-title h2"); if (tt) tt.textContent = tabs[i].textContent.trim();
    };
    new MutationObserver(place).observe($(".dtabs"), { subtree: true, attributes: true, attributeFilter: ["aria-selected"] });

    /* top bar: page title, market status, the account buttons moved out of the old header */
    const main = $(".app main"), bar = document.createElement("div");
    bar.className = "topbar";
    bar.innerHTML = `<div class="tb-brand"><span class="mk">TW</span>TWstock</div><div class="tb-title"><h2>總覽</h2></div>
      <span class="statuschip tbchip" data-s="closed"><i></i><span class="ss">—</span><b class="tt"></b></span><div class="tb-right"></div>`;
    main.insertBefore(bar, main.firstChild);
    const right = $(".tb-right", bar);
    ["#who", "#pinBtn", "#accountBtn"].forEach(s => { const el = $(s); if (el) right.appendChild(el); });
    /* light / dark / follow the device */
    const T = window.__twTheme, seg = document.createElement("div");
    seg.className = "thseg"; seg.setAttribute("role", "radiogroup"); seg.setAttribute("aria-label", "外觀");
    seg.innerHTML = [["system", "跟隨裝置", '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'], ["light", "淺色", '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'], ["dark", "深色", '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>']]
      .map(([k, l, ic]) => `<button type="button" role="radio" data-t="${k}" title="${l}" aria-label="${l}"><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg><span>${l}</span></button>`).join("") + '<i class="th-hl"></i>';
    right.appendChild(seg);
    const markTheme = () => {
      const bs = $$("button", seg), i = Math.max(0, bs.findIndex(b => b.dataset.t === (T ? T.mode : "system")));
      bs.forEach((b, k) => b.setAttribute("aria-checked", String(k === i)));
      const hl = $(".th-hl", seg); hl.style.width = bs[i].offsetWidth + "px"; hl.style.transform = `translateX(${bs[i].offsetLeft}px)`;
    };
    seg.addEventListener("click", e => { const b = e.target.closest("button"); if (!b || !T) return; T.set(b.dataset.t); markTheme(); });
    requestAnimationFrame(markTheme); addEventListener("resize", markTheme);
    requestAnimationFrame(place);
    addEventListener("resize", place);
  }
  function tickClock() {
    const t = taipei(), [s, label] = session();
    $$(".statuschip").forEach(c => { c.dataset.s = s; const ss = $(".ss", c); if (ss) ss.textContent = label; const tt = $(".tt", c); if (tt) tt.textContent = t.hms; });
    const side = $(".side"); if (!side) return;
    $(".sb-clock .t", side).textContent = t.hms; $(".sb-clock .sd", side).textContent = t.md;
  }
  function paintSide() {
    const side = $(".side"); if (!side || !A) return;
    const fmt = (v, d) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
    A.IDX.slice(0, 2).forEach(i => {
      const el = $(`.sb-ix[data-k="${i.k}"] b`, side); if (!el) return;
      const p = Number.isFinite(i.z) && Number.isFinite(i.y) ? (i.z / i.y - 1) * 100 : NaN;
      el.textContent = Number.isFinite(i.z) ? `${fmt(i.z, 0)}  ${Number.isFinite(p) ? (p > 0 ? "+" : "") + p.toFixed(2) + "%" : ""}` : "—";
      el.className = p > 0 ? "up" : p < 0 ? "down" : "";
    });
    const W = (A.watch ? A.watch() : A.store.get("twtrade-watch", []) || []).slice(0, 12), box = $(".sb-watch", side);
    if (!A.DB.list.length) return;
    box.innerHTML = W.length ? W.map(c => {
      const s = A.DB.by.get(c); if (!s) return "";
      const t = s.chg > 0 ? "up" : s.chg < 0 ? "down" : "";
      return `<button type="button" class="sb-row" data-code="${A.esc(c)}"><b>${A.esc(s.name)}</b><span class="p ${t}">${fmt(s.price, s.price < 50 ? 2 : s.price < 1000 ? 1 : 0)}</span><span>${A.esc(c)}</span><span class="p ${t}">${(s.pct > 0 ? "+" : "") + (s.pct || 0).toFixed(2)}%</span></button>`;
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
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = from + (to - from) * e;
      el.textContent = k < 1 ? prefix + v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) + suffix : text;
      if (k < 1) requestAnimationFrame(step); else RUN.delete(el);
    };
    requestAnimationFrame(step);
  }
  function scanNumbers() {
    $$(".dash .big, .side .sb-ix b").forEach((el, i) => {
      if (RUN.has(el)) return;
      const text = el.textContent, v = num(text), k = keyOf(el, i), old = LAST.get(k);
      LAST.set(k, v);
      if (!Number.isFinite(v) || !Number.isFinite(old) || old === v) return;
      countTo(el, old, v, text);
      const c = v > old ? "nflash-up" : "nflash-down";
      el.classList.remove("nflash-up", "nflash-down"); void el.offsetWidth; el.classList.add(c);
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

  /* ---------- start ---------- */
  let pending = false;
  const schedule = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; scanNumbers(); scanSkeletons(); }); };
  function start() {
    A = window.TWDash && window.TWDash.api;
    buildShell(); tickClock(); paintSide(); scanSkeletons();
    setInterval(tickClock, 1000);
    setInterval(paintSide, 3000);
    document.addEventListener("twdash:list", paintSide);
    new MutationObserver(schedule).observe(document.querySelector(".app") || document.body, { subtree: true, childList: true, characterData: true });
    document.addEventListener("pointermove", tilt, { passive: true });
    document.addEventListener("pointerleave", () => $$(".tilting").forEach(untilt));
    document.addEventListener("pointerup", e => { if (e.pointerType !== "mouse") $$(".tilting").forEach(untilt); });
    document.addEventListener("pointercancel", () => $$(".tilting").forEach(untilt));
  }
  if (window.TWDash && window.TWDash.api) start(); else document.addEventListener("twdash:ready", start, { once: true });
})();
