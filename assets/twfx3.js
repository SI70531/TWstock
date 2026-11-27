/* TWstock layer 3: price-alert lines on the K-line chart, share as an image card, install as an app (PWA). */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const NS = "http://www.w3.org/2000/svg", esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let A = null, alertMode = false;
  const buzz = n => { try { navigator.vibrate && navigator.vibrate(n); } catch (e) {} };
  const toast = (txt, ms = 2200) => {
    const t = document.createElement("div"); t.className = "fxtoast"; t.textContent = txt; document.body.appendChild(t);
    t.animate([{ opacity: 0, transform: "translate(-50%, 14px) scale(.9)" }, { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: .12 }, { opacity: 1, transform: "translate(-50%, 0)", offset: .88 }, { opacity: 0, transform: "translate(-50%, -8px)" }], { duration: ms }).onfinish = () => t.remove();
  };

  /* ================= price alerts ================= */
  const AK = "twfx-palert";
  const alerts = () => A.store.get(AK, {}) || {};
  const saveAlerts = o => A.store.set(AK, o);
  const rnd = p => (p < 1000 ? Math.round(p * 100) / 100 : Math.round(p));
  const mk = (tag, attrs, cls, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (cls) e.setAttribute("class", cls); if (parent) parent.appendChild(e); return e; };
  function alertEl(c, p, cls, id) {
    const y = c.yOf(p); if (!(y >= c.plot.y0 - 1 && y <= c.plot.y1 + 1)) return null;
    const g = mk("g", { transform: `translate(0 ${y.toFixed(1)})` }, "kalert " + (cls || ""), c.svg); if (id) g.dataset.id = id;
    mk("line", { x1: c.plot.x0, x2: c.plot.x1, y1: 0, y2: 0 }, "kal", g);
    const w = 78, tg = mk("g", { transform: `translate(${(c.plot.x1 - w - 4).toFixed(1)} 0)` }, "kat", g);
    mk("rect", { x: 0, y: -11, width: w, height: 22, rx: 11 }, "", tg);
    const tx = mk("text", { x: w / 2, y: 4, "text-anchor": "middle" }, "", tg); tx.textContent = "🔔 " + A.fmt(p, p < 100 ? 2 : 0);
    return g;
  }
  function paintAlerts() {
    const c = A.chartC(); if (!c || !c.svg.isConnected) return;
    $$(".kalert:not(.tmp)", c.svg).forEach(x => x.remove());
    (alerts()[A.code()] || []).forEach(a => { const g = alertEl(c, a.p, a.dir, a.id); if (g) g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420 }); });
  }
  function ensureChip() {
    const d = $("#dpStock [data-draw]"); if (!d || $("#dpStock [data-fxalert]")) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.dataset.fxalert = ""; b.setAttribute("aria-pressed", String(alertMode));
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4"/></svg>提醒線`;
    d.after(b);
  }
  function setMode(on) {
    alertMode = on; const b = $("#dpStock [data-fxalert]"); if (b) b.setAttribute("aria-pressed", String(on));
    const cb = $("#dpStock .cbox"); if (cb) cb.classList.toggle("alerting", on);
    if (on) { const d = $("#dpStock [data-draw][aria-pressed=true]"); if (d) d.click(); if (window.Notification && Notification.permission === "default") { try { Notification.requestPermission(); } catch (e) {} } }
  }
  function addAlert(code, p) {
    const s = A.DB.by.get(code); if (!s || !(s.price > 0)) { toast("讀不到現價，無法設定提醒"); return; }
    const o = alerts(), list = (o[code] = o[code] || []);
    if (list.length >= 6) { toast("每檔最多 6 條提醒線"); return; }
    p = rnd(p); list.push({ id: Date.now().toString(36), p, dir: p > s.price ? "up" : "down" }); saveAlerts(o); buzz(12);
    toast(`🔔 ${A.DB.by.get(code).name} 到 ${A.fmt(p, p < 100 ? 2 : 0)} 時提醒（頁面開著時）`); paintAlerts();
  }
  function bindChart() {
    const box = $("#dpStock"); if (!box || box._fxb) return; box._fxb = true;
    box.addEventListener("click", e => {
      const b = e.target.closest("[data-fxalert]"); if (b) { setMode(!alertMode); return; }
      const t = e.target.closest(".kalert .kat"); if (t) {
        const g = t.closest(".kalert"), id = g.dataset.id, o = alerts(), code = A.code();
        o[code] = (o[code] || []).filter(a => a.id !== id); saveAlerts(o); buzz(8);
        g.animate([{ opacity: 1 }, { opacity: 0, transform: g.getAttribute("transform") + " scale(.96)" }], { duration: 240, fill: "forwards" }).onfinish = () => g.remove();
      }
    });
    box.addEventListener("pointerdown", e => {
      if (!alertMode || e.button > 0) return;
      const cb = e.target.closest && e.target.closest(".cbox"); if (!cb) return;
      let c = A.chartC(); if (!c) return; let a = c.at(e); if (!a.inPrice) return;
      e.stopPropagation(); e.preventDefault();
      let tmp = alertEl(c, a.price, "tmp"), last = a.price;
      const mv = ev => { ev.preventDefault(); c = A.chartC() || c; const b = c.at(ev); last = b.price; if (tmp) tmp.remove(); tmp = alertEl(c, b.price, "tmp"); };
      const up = ev => {
        document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
        c = A.chartC() || c; const b = c.at(ev); if (tmp) tmp.remove();
        if (ev.type !== "pointercancel" && b.inPrice) addAlert(A.code(), b.price);
        setMode(false);
      };
      document.addEventListener("pointermove", mv, { passive: false }); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
    }, true);
  }
  function checkAlerts() {
    const o = alerts(); let changed = false;
    Object.keys(o).forEach(code => {
      const s = A.DB.by.get(code); if (!s || !(s.price > 0)) return;
      o[code] = o[code].filter(a => {
        const hit = a.dir === "up" ? s.price >= a.p : s.price <= a.p; if (!hit) return true;
        changed = true; buzz([200, 80, 200]);
        const msg = `🔔 ${s.name} 已${a.dir === "up" ? "漲到" : "跌到"} ${A.fmt(s.price, A.dig(s.price))}（提醒線 ${A.fmt(a.p, a.p < 100 ? 2 : 0)}）`;
        toast(msg, 4200);
        try { if (window.Notification && Notification.permission === "granted") new Notification("TWstock 到價提醒", { body: msg, icon: "./assets/icon-192.png", tag: "twfx-" + a.id }); } catch (e) {}
        const g = $(`.kalert[data-id="${a.id}"]`); if (g) g.animate([{ opacity: 1 }, { opacity: .2 }, { opacity: 1 }, { opacity: 0 }], { duration: 1200, fill: "forwards" });
        return false;
      });
      if (!o[code].length) delete o[code];
    });
    if (changed) { saveAlerts(o); setTimeout(paintAlerts, 1300); }
  }

  /* ================= share as an image ================= */
  const FONT = '"PingFang TC","Noto Sans TC","Microsoft JhengHei","Heiti TC",sans-serif';
  const udCols = () => { const intl = document.documentElement.dataset.ud === "intl"; return intl ? { up: "#2fb36d", down: "#ef4b52" } : { up: "#ef4b52", down: "#2fb36d" }; };
  const rr = (x, y, w, h, r, c) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  function frame(W, H, glow) {
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const c = cv.getContext("2d");
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#1a2340"); g.addColorStop(1, "#0a0e18"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const rg = c.createRadialGradient(W * .85, H * .12, 10, W * .85, H * .12, W * .8); rg.addColorStop(0, glow + "66"); rg.addColorStop(1, glow + "00"); c.fillStyle = rg; c.fillRect(0, 0, W, H);
    c.fillStyle = "#f6c177"; c.font = `700 34px ${FONT}`; c.textBaseline = "alphabetic"; c.fillText("TWstock", 64, 92);
    return { cv, c };
  }
  const foot = (c, W, H, date) => { c.fillStyle = "rgba(255,255,255,.45)"; c.font = `400 24px ${FONT}`; c.textAlign = "left"; c.fillText(`資料日期 ${date}・僅供參考，不是投資建議`, 64, H - 52); };
  async function barsFor(code) {
    const h = A.HIST.get(code); if (h && h.cs && h.cs.length > 5) return h.cs.slice(-60);
    const now = new Date(), ym = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0"), prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const [a, b] = await Promise.all([A.histMonth(code, ym(prev), true), A.histMonth(code, ym(now), false)]); return [...a, ...b].slice(-60);
  }
  async function stockCard(code) {
    const s = A.DB.by.get(code); if (!s || !(s.price > 0)) throw new Error("讀不到現價");
    const cs = await barsFor(code); if (!cs || cs.length < 5) throw new Error("讀不到走勢");
    const col = udCols(), up = s.chg >= 0, tc = up ? col.up : col.down, W = 1080, H = 1350, d = A.dig(s.price);
    const { cv, c } = frame(W, H, tc);
    c.fillStyle = "#fff"; c.font = `700 84px ${FONT}`; c.fillText(s.name, 64, 210);
    c.fillStyle = "rgba(255,255,255,.55)"; c.font = `500 36px ${FONT}`; c.fillText(`${code}・${s.mkt === "otc" ? "上櫃" : s.mkt === "esb" ? "興櫃" : "上市"}`, 64, 264);
    c.fillStyle = tc; c.font = `700 190px ${FONT}`; c.fillText(A.fmt(s.price, d), 64, 460);
    c.font = `600 56px ${FONT}`; c.fillText(`${s.chg >= 0 ? "▲" : "▼"} ${A.fmt(Math.abs(s.chg), d)}　${A.pct(s.pct)}`, 64, 540);
    const x0 = 64, x1 = W - 64, y0 = 610, y1 = 960, v = cs.map(b => b[4]), lo = Math.min(...v), hi = Math.max(...v), sp = hi - lo || 1, n = v.length - 1;
    const X = i => x0 + i / n * (x1 - x0), Y = x => y1 - (x - lo) / sp * (y1 - y0 - 30) - 10;
    const ar = c.createLinearGradient(0, y0, 0, y1); ar.addColorStop(0, tc + "55"); ar.addColorStop(1, tc + "00");
    c.beginPath(); v.forEach((x, i) => (i ? c.lineTo(X(i), Y(x)) : c.moveTo(X(i), Y(x)))); c.lineTo(x1, y1); c.lineTo(x0, y1); c.closePath(); c.fillStyle = ar; c.fill();
    c.beginPath(); v.forEach((x, i) => (i ? c.lineTo(X(i), Y(x)) : c.moveTo(X(i), Y(x)))); c.strokeStyle = tc; c.lineWidth = 6; c.lineJoin = "round"; c.lineCap = "round"; c.stroke();
    c.beginPath(); c.arc(X(n), Y(v[n]), 11, 0, 7); c.fillStyle = "#fff"; c.fill();
    c.fillStyle = "rgba(255,255,255,.5)"; c.font = `400 26px ${FONT}`; c.fillText(`近 ${cs.length} 日　低 ${A.fmt(lo, d)}　高 ${A.fmt(hi, d)}`, 64, y1 + 52);
    const F = (A.FUND.map && A.FUND.map.get(code)) || {}, ret = (cs[cs.length - 1][4] / cs[0][4] - 1) * 100;
    const cells = [["開盤", Number.isFinite(s.open) ? A.fmt(s.open, d) : "—"], ["最高", Number.isFinite(s.high) ? A.fmt(s.high, d) : "—"], ["最低", Number.isFinite(s.low) ? A.fmt(s.low, d) : "—"], ["昨收", Number.isFinite(s.prev) ? A.fmt(s.prev, d) : "—"],
      ["成交量", A.fmt(s.vol) + " 張"], ["近期報酬", A.pct(ret)], ["本益比", F.pe > 0 ? F.pe.toFixed(1) : "—"], ["殖利率", F.yld > 0 ? F.yld.toFixed(2) + "%" : "—"]];
    cells.forEach(([k, val], i) => {
      const cx = 64 + (i % 4) * 232, cy = 1080 + Math.floor(i / 4) * 110;
      c.fillStyle = "rgba(255,255,255,.5)"; c.font = `400 26px ${FONT}`; c.fillText(k, cx, cy); c.fillStyle = "#fff"; c.font = `600 36px ${FONT}`; c.fillText(val, cx, cy + 48);
    });
    foot(c, W, H, cs[cs.length - 1][0].replace(/(\d{4})(\d{2})(\d{2})/, "$1/$2/$3"));
    return cv;
  }
  async function compareCard() {
    const codes = $$("#dpList .cpchips [data-open]").map(b => b.dataset.open).filter(x => A.DB.by.has(x)).slice(0, 4); if (codes.length < 2) throw new Error("先在比較分頁選 2 檔以上");
    const all = await Promise.all(codes.map(c => barsFor(c).catch(() => null))); if (all.some(x => !x || x.length < 5)) throw new Error("走勢讀不到");
    const COL = ["#f6c177", "#5aa9ff", "#c084fc", "#34d399"], W = 1080, H = 1350, { cv, c } = frame(W, H, "#5aa9ff");
    c.fillStyle = "#fff"; c.font = `700 68px ${FONT}`; c.fillText("個股並排比較", 64, 190);
    const len = Math.min(...all.map(x => x.length)), ser = all.map(x => x.slice(-len).map(b => (b[4] / x[x.length - len][4] - 1) * 100));
    const lo = Math.min(0, ...ser.flat()), hi = Math.max(0, ...ser.flat()), sp = hi - lo || 1, x0 = 64, x1 = W - 64, y0 = 260, y1 = 820;
    const Y = v => y1 - (v - lo) / sp * (y1 - y0), X = i => x0 + i / (len - 1) * (x1 - x0);
    c.strokeStyle = "rgba(255,255,255,.25)"; c.setLineDash([8, 10]); c.lineWidth = 2; c.beginPath(); c.moveTo(x0, Y(0)); c.lineTo(x1, Y(0)); c.stroke(); c.setLineDash([]);
    ser.forEach((v, k) => { c.beginPath(); v.forEach((x, i) => (i ? c.lineTo(X(i), Y(x)) : c.moveTo(X(i), Y(x)))); c.strokeStyle = COL[k]; c.lineWidth = 6; c.lineJoin = "round"; c.lineCap = "round"; c.stroke(); c.beginPath(); c.arc(X(len - 1), Y(v[len - 1]), 10, 0, 7); c.fillStyle = COL[k]; c.fill(); });
    const col = udCols();
    codes.forEach((code, k) => {
      const s = A.DB.by.get(code), r = ser[k][len - 1], y = 900 + k * 96;
      c.fillStyle = COL[k]; rr(64, y - 30, 14, 56, 7, c); c.fill();
      c.fillStyle = "#fff"; c.font = `600 40px ${FONT}`; c.textAlign = "left"; c.fillText(`${s.name}`, 100, y + 6); c.fillStyle = "rgba(255,255,255,.5)"; c.font = `400 28px ${FONT}`; c.fillText(code, 100, y + 40);
      c.textAlign = "right"; c.fillStyle = r >= 0 ? col.up : col.down; c.font = `700 46px ${FONT}`; c.fillText(A.pct(r), W - 64, y + 12); c.fillStyle = "rgba(255,255,255,.55)"; c.font = `400 28px ${FONT}`; c.fillText(`現價 ${A.fmt(s.price, A.dig(s.price))}`, W - 64, y + 46); c.textAlign = "left";
    });
    c.fillStyle = "rgba(255,255,255,.5)"; c.font = `400 26px ${FONT}`; c.fillText(`近 ${len} 日相對漲跌（起點 = 0%）`, 64, 240);
    foot(c, W, H, all[0][all[0].length - 1][0].replace(/(\d{4})(\d{2})(\d{2})/, "$1/$2/$3"));
    return cv;
  }
  function shareDialog(cv, name) {
    const ov = document.createElement("div"); ov.className = "fxshare-ov";
    const url = cv.toDataURL("image/png");
    ov.innerHTML = `<div class="fxshare-box" role="dialog" aria-label="分享圖片"><img alt="分享圖片預覽" src="${url}"><div class="fxshare-act"><button type="button" class="btn" data-a="share">分享</button><button type="button" class="btn" data-a="save">下載</button><button type="button" class="btn" data-a="x">關閉</button></div></div>`;
    document.body.appendChild(ov);
    ov.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    $(".fxshare-box", ov).animate([{ opacity: 0, transform: "translateY(24px) scale(.94)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "none" }], { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" });
    const close = () => ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" }).onfinish = () => ov.remove();
    const blob = () => new Promise(r => cv.toBlob(r, "image/png"));
    ov.addEventListener("click", async e => {
      if (e.target === ov) { close(); return; }
      const b = e.target.closest("[data-a]"); if (!b) return;
      if (b.dataset.a === "x") close();
      else if (b.dataset.a === "save") { const a = document.createElement("a"); a.href = url; a.download = `${name}.png`; a.click(); }
      else if (b.dataset.a === "share") {
        try { const f = new File([await blob()], `${name}.png`, { type: "image/png" }); if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: "TWstock" }); else { const a = document.createElement("a"); a.href = url; a.download = `${name}.png`; a.click(); } } catch (er) { if (er && er.name !== "AbortError") toast("分享讀不到可用的方式，已改成下載"); }
      }
    });
  }
  async function makeShare(kind, btn) {
    if (btn) { btn.disabled = true; btn.dataset.l = btn.textContent; btn.textContent = "產生中…"; }
    try { const code = A.code(), cv = kind === "cmp" ? await compareCard() : await stockCard(code); shareDialog(cv, kind === "cmp" ? "TWstock-比較" : `TWstock-${code}`); }
    catch (e) { toast(e && e.message ? e.message : "讀不到資料"); }
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.l; }
  }
  function ensureShare() {
    const head = $("#dpStock .shead");
    if (head && !$(".fxshare", head)) { const b = document.createElement("button"); b.type = "button"; b.className = "chip fxshare"; b.textContent = "分享圖片"; b.addEventListener("click", () => makeShare("stock", b)); head.appendChild(b); }
    const bar = $("#dpList .cpbar");
    if (bar && !$(".fxshare", bar)) { const b = document.createElement("button"); b.type = "button"; b.className = "chip fxshare cp"; b.textContent = "分享圖片"; b.addEventListener("click", () => makeShare("cmp", b)); bar.appendChild(b); }
  }

  /* ================= install as an app ================= */
  let deferred = null;
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; });
  addEventListener("appinstalled", () => { deferred = null; toast("已安裝 TWstock"); });
  async function install() {
    if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch (e) {} deferred = null; return; }
    if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) { toast("已經是 App 模式"); return; }
    toast(/iPhone|iPad|iPod/.test(navigator.userAgent) ? "點瀏覽器的「分享」→「加入主畫面」" : "用瀏覽器選單的「安裝 App」或「加到主畫面」", 4200);
  }
  document.addEventListener("twdash:install", install);
  function splash() {
    if (!(matchMedia("(display-mode: standalone)").matches || navigator.standalone)) return;
    const s = document.createElement("div"); s.className = "fxsplash"; s.innerHTML = `<img src="./assets/icon-192.png" alt=""><b>TWstock</b>`; document.body.appendChild(s);
    const done = () => s.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: "forwards" }).onfinish = () => s.remove();
    document.addEventListener("twdash:list", () => setTimeout(done, 350), { once: true }); setTimeout(done, 4000);
  }
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  splash();

  function boot() {
    if (A) return; A = window.TWDash && window.TWDash.api; if (!A) return;
    bindChart(); ensureChip(); ensureShare();
    document.addEventListener("twdash:chart", () => { ensureChip(); paintAlerts(); const cb = $("#dpStock .cbox"); if (cb) cb.classList.toggle("alerting", alertMode); });
    setInterval(() => { ensureChip(); ensureShare(); checkAlerts(); }, 1200);
    document.addEventListener("twdash:tab", () => { if (alertMode) setMode(false); });
  }
  document.addEventListener("twdash:ready", boot);
  if (window.TWDash && window.TWDash.api) boot();
})();
