/* TWstock new menus: 籌碼, 產業, 復盤.
   The cards that already existed (法人排行, 期貨籌碼, 法人連續買賣超, 族群) are moved here from 總覽 and 股票 with their code untouched;
   new cards: 融資融券排行, 產業強弱, 類股熱力圖 (back on screen), 每日預測對帳.
   Reads the dashboard through window.TWDash.api (twmain.js). */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  let A = null;

  function init() {
    if (A) return;
    A = window.TWDash && window.TWDash.api; if (!A) return;
    buildChip(); buildInd(); buildRev(); buildBasis(); buildArchive();
    document.addEventListener("twdash:close", e => arSave(e.detail));
    document.addEventListener("twlab:hold", () => { if (A.tabNow() === "dpHold") hdvLoad(); });
    document.addEventListener("twdash:tab", e => onTab(e.detail));
    document.addEventListener("twdash:list", () => { const t = A.tabNow(); if (t === "dpInd") paintInd(false); });
    document.addEventListener("twdash:live", () => { if (A.tabNow() === "dpInd") paintInd(false); });
    /* a tab opened before this file loaded (a reload on 籌碼, say) */
    onTab(A.tabNow());
  }

  /* ---------------- helpers ---------------- */
  const nm = c => { const s = A.DB.by.get(c); return s ? s.name : c; };
  const lots = v => Number(v).toLocaleString("zh-TW");
  const sg = v => (v > 0 ? "+" : "") + lots(v);
  const grow = (el, to) => el.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 700, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });

  /* ---------------- 籌碼 ---------------- */
  const MG = { k: "fu", data: null, loading: false };
  function buildChip() {
    const panel = $("#dpChip"); if (!panel) return;
    panel.innerHTML = `<div class="nwgrid"></div>`;
    const grid = $(".nwgrid", panel);
    const temp = $(".xtempcard"); if (temp) { temp.classList.add("wide"); grid.appendChild(temp); }
    [$(".ft"), $(".bd-strk")].forEach(c => c && grid.appendChild(c));
    const inst = $(".inst"); if (inst) { inst.classList.add("wide"); grid.appendChild(inst); }
    grid.insertAdjacentHTML("beforeend", `<div class="dcard mg wide"><div class="aihead"><div><h3>融資融券增減排行</h3></div><span class="sub mgday"></span></div>
      <div class="mgsum"></div>
      <div class="hmseg mgseg" role="group" aria-label="融資融券">${[["fu", "融資增加"], ["fd", "融資減少"], ["su", "融券增加"], ["sd", "融券減少"]].map(([k, l]) => `<button type="button" data-g="${k}" aria-pressed="${k === "fu"}">${l}</button>`).join("")}<i></i></div>
      <div class="mgout"><p class="sub">載入中…</p></div></div>`);
    const mg = $(".mg", grid), seg = $(".mgseg", mg);
    seg.addEventListener("click", e => { const b = e.target.closest("[data-g]"); if (!b) return; $$("[data-g]", seg).forEach(x => x.setAttribute("aria-pressed", String(x === b))); MG.k = b.dataset.g; A.segMark(seg); mgPaint(true); });
    if (window.ResizeObserver) new ResizeObserver(() => A.segMark(seg)).observe(seg);
    mg.addEventListener("click", e => { const r = e.target.closest(".instrow"); if (r) A.openStock(r.dataset.code); });
    const flag = $(".bd-flag"); if (flag) { flag.classList.add("wide"); grid.appendChild(flag); }
    const b2 = $(".board2"); if (b2 && !b2.children.length) b2.remove();
    /* 股票 → 排行: the day's biggest gainers and losers, moved from 總覽 */
    const dl = $("#dpList"), up = $(".bd-up"), dn = $(".bd-down");
    if (dl && up && dn) {
      const rk = document.createElement("div"); rk.className = "dcard rk"; rk.dataset.sub = "rk"; rk.hidden = true;
      rk.innerHTML = `<div class="rkgrid"></div>`; [up, dn].forEach(c => { c.classList.remove("dcard"); $(".rkgrid", rk).appendChild(c); });
      const mkt = $(".mkt", dl); (mkt || dl.lastElementChild).after(rk);
      rk.addEventListener("click", e => { const r = e.target.closest("[data-code]"); if (r) A.openStock(r.dataset.code, r); });
    }
    const bd = $("#dpOverview > .board:not(.board2)"); if (bd && !bd.children.length) bd.remove();
  }
  async function mgLoad() {
    if (MG.loading) return; MG.loading = true;
    try { MG.data = await A.J(`${A.worker}/tw/margintop`); mgPaint(true); }
    catch (e) { MG.data = null; { const el = $(".mgout"); if (el) el.innerHTML = `<p class="sub">融資融券排行讀不到資料（${A.esc(A.whyOf(e))}）。</p>`; } }
    finally { MG.loading = false; }
  }
  function mgPaint(animate) {
    const D = MG.data, card = $(".mg"); if (!D || !card) return;
    $(".mgday", card).textContent = String(D.day).slice(5).replace("-", "/") + "・單位：張";
    const T = D.total || {}, tile = (t, v, c) => `<div><span>${t}</span><b>${lots(Math.round(v))}</b><i class="${c > 0 ? "up" : c < 0 ? "down" : ""}">${c ? sg(Math.round(c)) : "0"}</i></div>`;
    $(".mgsum", card).innerHTML = tile("全市場融資餘額", T.fin || 0, T.finChg) + tile("全市場融券餘額", T.sht || 0, T.shtChg);
    const key = { fu: "finUp", fd: "finDown", su: "shtUp", sd: "shtDown" }[MG.k], isFin = MG.k[0] === "f", rows = D[key] || [];
    const mx = Math.max(1, ...rows.map(r => Math.abs(r[isFin ? 2 : 4])));
    $(".mgout", card).innerHTML = rows.length ? rows.map(r => {
      const chg = r[isFin ? 2 : 4], bal = r[isFin ? 1 : 3], s = A.DB.by.get(r[0]);
      return `<button type="button" class="instrow mgrow" data-code="${A.esc(r[0])}"><span class="nm"><b>${A.esc(nm(r[0]))}</b><em>${A.esc(r[0])}${s && Number.isFinite(s.pct) ? "・" + A.pct(s.pct) : ""}</em></span><span class="mgbar"><i class="${chg > 0 ? "up" : "down"}" style="width:${Math.max(4, Math.abs(chg) / mx * 100).toFixed(0)}%"></i></span><span class="rr"><b class="${chg > 0 ? "up" : "down"}">${sg(chg)}</b><i>餘額 ${lots(bal)}</i></span></button>`;
    }).join("") : `<p class="sub">沒有資料。</p>`;
    if (animate) { A.rise($$(".mgrow", card), 28); $$(".mgbar i", card).forEach(grow); A.rise($$(".mgsum > div", card), 60); }
  }

  /* ---------------- 產業 ---------------- */
  function buildInd() {
    const panel = $("#dpInd"); if (!panel) return;
    panel.innerHTML = `<div class="nwgrid"></div>`;
    const grid = $(".nwgrid", panel);
    grid.insertAdjacentHTML("beforeend", `<div class="dcard bd-heat wide"><div class="bd-h"><h3>類股熱力圖</h3><span class="sub bd-n"></span></div><div class="hmsel"></div><div class="hm"></div></div>
      <div class="dcard rot wide"><div class="aihead"><div><h3>產業輪動</h3></div><span class="sub rotn"></span></div>
        <div class="hmseg rotseg" role="group" aria-label="期間">${[["5", "近 5 日"], ["10", "近 10 日"]].map(([k, l]) => `<button type="button" data-g="${k}" aria-pressed="${k === "5"}">${l}</button>`).join("")}<i></i></div>
        <div class="rotout"><p class="sub">載入中…</p></div></div>
      <div class="dcard ir"><div class="aihead"><div><h3>產業強弱排行</h3></div><span class="sub irn"></span></div><div class="irout"><p class="sub">載入中…</p></div></div>`);
    /* the three views of the sectors live in one card, one at a time */
    const box = document.createElement("div"); box.className = "dcard indx wide";
    const VIEWS = [["heat", "熱力圖", ".bd-heat"], ["rot", "輪動", ".rot"], ["ir", "強弱排行", ".ir"]];
    box.innerHTML = `<div class="aihead"><div><h3>產業</h3></div><div class="hmseg indseg" role="group" aria-label="產業檢視">${VIEWS.map(([k, l]) => `<button type="button" data-iv="${k}" aria-pressed="false">${l}</button>`).join("")}<i></i></div></div><div class="indpanes"></div>`;
    grid.prepend(box);
    const panes = $(".indpanes", box), iseg = $(".indseg", box);
    VIEWS.forEach(([k, , sel]) => { const c = $(sel, grid); if (!c) return; c.classList.remove("dcard", "wide"); c.classList.add("indpane"); c.dataset.iv = k; const h = $(":scope > .bd-h h3, :scope > .aihead h3", c); if (h) h.remove(); panes.appendChild(c); });
    const ivShow = (k, anim) => {
      const order = VIEWS.map(v => v[0]), prev = box.dataset.v || k, dir = order.indexOf(k) >= order.indexOf(prev) ? 1 : -1; box.dataset.v = k; A.store.set("twnew-indv", k);
      $$("[data-iv]", iseg).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.iv === k)));
      $$(".indpane", panes).forEach(c => { const on = c.dataset.iv === k; c.hidden = !on; if (on && anim) c.animate([{ opacity: 0, transform: `translateX(${dir * 40}px)` }, { opacity: 1, transform: "none" }], { duration: 360, easing: "cubic-bezier(.16,1,.3,1)" }); });
      requestAnimationFrame(() => { A.segMark(iseg); if (k === "heat") { A.paintHeat(anim); } else if (k === "rot") rotPaint(anim); else irPaint(anim); });
    };
    iseg.addEventListener("click", e => { const b = e.target.closest("[data-iv]"); if (b) ivShow(b.dataset.iv, true); });
    if (window.ResizeObserver) new ResizeObserver(() => A.segMark(iseg)).observe(iseg);
    ivShow(VIEWS.some(v => v[0] === A.store.get("twnew-indv", "heat")) ? A.store.get("twnew-indv", "heat") : "heat", false);
    const gp = $(".gp"); if (gp) { gp.removeAttribute("data-sub"); gp.hidden = false; grid.appendChild(gp); }
    grid.insertAdjacentHTML("beforeend", `<div class="dcard gpm"><div class="aihead"><div><h3>族群內領漲／領跌</h3></div><span class="sub">上方族群成員的個股前後 8 名</span></div><div class="gpmout"></div></div>`);
    $(".gpm", grid).addEventListener("click", e => { const m = e.target.closest("[data-code]"); if (m) A.openStock(m.dataset.code); });
    const rot = $(".rot", grid), rseg = $(".rotseg", rot);
    rseg.addEventListener("click", e => { const b = e.target.closest("[data-g]"); if (!b) return; $$("[data-g]", rseg).forEach(x => x.setAttribute("aria-pressed", String(x === b))); ROT.n = +b.dataset.g; A.segMark(rseg); rotPaint(true); });
    if (window.ResizeObserver) new ResizeObserver(() => A.segMark(rseg)).observe(rseg);
    const hm = $(".hm", grid);
    hm.addEventListener("pointermove", e => { if (!$(".hmcard", hm)) A.heatTip(e); A.heatFocus(e); });
    hm.addEventListener("pointerleave", e => { const t = $(".hmtip", hm); if (t) t.hidden = true; A.heatFocus(e); });
    $(".ir", grid).addEventListener("click", e => {
      const m = e.target.closest("[data-code]"); if (m) { A.openStock(m.dataset.code); return; }
      const h = e.target.closest(".gphead"); if (h) h.parentElement.classList.toggle("open");
    });
  }
  /* 產業輪動: the sector indices' daily changes, newest on the right, ranked by the change over the chosen window */
  const ROT = { n: 5, data: null, loading: false };
  async function rotLoad() {
    if (ROT.loading) return; ROT.loading = true;
    try { ROT.data = await A.J(`${A.worker}/tw/sectorhist`); rotPaint(true); }
    catch (e) { ROT.data = null; { const el = $(".rotout"); if (el) el.innerHTML = `<p class="sub">產業輪動讀不到資料（${A.esc(A.whyOf(e))}）。</p>`; } }
    finally { ROT.loading = false; }
  }
  function rotPaint(animate) {
    const D = ROT.data, el = $(".rotout"); if (!D || !el) return;
    const days = D.days, N = Math.min(ROT.n, days.length), cum = a => (a.slice(-N).reduce((t, p) => t * (1 + (p || 0) / 100), 1) - 1) * 100;
    const rows = D.rows.map(r => ({ n: r.n, d: r.d, c: cum(r.d), c5: cum(r.d.slice(-5)), c10: cum(r.d) })).sort((a, b) => b.c - a.c);
    $(".rotn").textContent = `${days[days.length - N].slice(5).replace("-", "/")} – ${days[days.length - 1].slice(5).replace("-", "/")}`;
    const cell = p => { const v = p == null ? 0 : p, a = Math.min(1, Math.abs(v) / 3), c = v >= 0 ? "var(--color-up)" : "var(--color-down)"; return `<i class="rc" style="background:color-mix(in oklab, ${c} ${(6 + a * 40).toFixed(0)}%, transparent)">${Math.abs(v) >= 0.05 ? (v > 0 ? "+" : "") + v.toFixed(1) : "0"}</i>`; };
    const mx = Math.max(1, ...rows.map(r => Math.abs(r.c)));
    el.innerHTML = `<div class="rothead"><span></span><span class="rdays">${days.slice(-N).map(d => `<em>${d.slice(8)}</em>`).join("")}</span><span>累計</span></div>` + rows.map(r => `<div class="rotrow"><b>${A.esc(r.n.replace(/(?<!工)業$/, ""))}</b><span class="rdays">${r.d.slice(-N).map(cell).join("")}</span><span class="rcum ${A.tone(r.c)}">${A.pct(r.c)}</span></div>`).join("");
    if (animate) { A.rise($$(".rotrow", el), 18); $$(".rc", el).forEach((c, i) => c.animate([{ opacity: 0, transform: "scale(.4)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: 120 + (i % 20) * 14, easing: "cubic-bezier(.2,.9,.3,1.2)", fill: "backwards" })); }
  }
  function irPaint(animate) {
    const el = $(".irout"); if (!el) return;
    const groups = A.heatGroups ? A.heatGroups() : [];
    if (!groups.length) { el.innerHTML = `<p class="sub">${A.DB.live ? "產業分類還沒發布，稍後會出現。" : "讀不到資料。"}</p>`; return; }
    const open = new Set($$(".ir .gpg.open .gpname").map(x => x.textContent)), tot = groups.reduce((a, g) => a + g.val, 0);
    const gs = groups.filter(g => g.list.length >= 3).sort((a, b) => b.pct - a.pct), mx = Math.max(0.5, ...gs.map(g => Math.abs(g.pct)));
    const html = gs.map(g => `<div class="gpg${open.has(g.name) ? " open" : ""}"><button type="button" class="gphead"><span class="gpname">${A.esc(g.name)}</span><span class="gpbar"><i class="${A.tone(g.pct)}" style="width:${Math.max(4, Math.abs(g.pct) / mx * 100).toFixed(0)}%"></i></span><b class="${A.tone(g.pct)}">${A.pct(g.pct)}</b><em>${g.up}/${g.list.length} 漲・${(g.val / tot * 100).toFixed(0)}%</em></button><div class="gpmem">${g.list.slice().sort((a, b) => b.price * b.vol - a.price * a.vol).slice(0, 8).map(s => `<button type="button" data-code="${A.esc(s.code)}"><span>${A.esc(s.name)}</span><i class="${A.tone(s.pct)}">${A.pct(s.pct)}</i></button>`).join("")}</div></div>`).join("");
    if (el.dataset.h === html) return; el.dataset.h = html; el.innerHTML = html;
    if (animate) { A.rise($$(".gpg", el), 22); $$(".gpbar i", el).forEach(grow); }
  }
  function gpmPaint(animate) {
    const el = $(".gpmout"); if (!el) return;
    if (!A.DB.live || !A.DB.list.length) { el.innerHTML = `<p class="sub">讀不到資料。</p>`; return; }
    const M = A.groupMovers(), col = (t, arr) => `<div class="instcol"><h4>${t}</h4>${arr.map(({ s, g }) => `<button type="button" class="instrow" data-code="${A.esc(s.code)}"><span class="nm"><b>${A.esc(s.name)}</b><em>${A.esc(s.code)}・${A.esc(g)}</em></span><span class="rr ${A.tone(s.pct)}">${A.fmt(s.price, A.dig(s.price))}<i>${A.pct(s.pct)}</i></span></button>`).join("")}</div>`;
    const html = `<div class="instcols">${col("領漲", M.up)}${col("領跌", M.down)}</div>`;
    if (el.dataset.h === html) return; el.dataset.h = html; el.innerHTML = html;
    if (animate) A.rise($$(".instrow", el), 18);
  }
  function paintInd(animate) {
    A.paintHeat(animate); A.gpPaint(); irPaint(animate); gpmPaint(animate);
    if (animate) { const gp = $(".gp"); if (gp) { A.rise($$(".gpg", gp), 22); $$(".gpbar i", gp).forEach(grow); } }
  }

  /* ---------------- 復盤 ---------------- */
  const RV = { rows: null, loading: false };
  function buildRev() {
    const panel = $("#dpRev"); if (!panel) return;
    panel.insertAdjacentHTML("afterbegin", `<div class="dcard rvw"><div class="aihead"><div><h3>每日預測對帳</h3></div><span class="sub rvwn"></span></div>
      <div class="rvwout"><p class="sub">載入中…</p></div></div>`);
  }
  async function rvLoad() {
    if (RV.loading) return; RV.loading = true;
    try { const j = await A.J(`${A.worker}/tw/review`); RV.rows = Array.isArray(j.rows) ? j.rows : []; rvPaint(true); }
    catch (e) { RV.rows = null; { const el = $(".rvwout"); if (el) el.innerHTML = `<p class="sub">每日對帳讀不到資料（${A.esc(A.whyOf(e))}）。</p>`; } }
    finally { RV.loading = false; }
  }
  const mark = h => (h == null ? "—" : h ? "✓" : "✗");
  function rvPaint(animate) {
    const el = $(".rvwout"), R = (RV.rows || []).slice().sort((a, b) => (a.day < b.day ? 1 : -1)); if (!el) return;
    $(".rvwn").textContent = R.length ? `累計 ${R.length} 個交易日` : "";
    if (!R.length) { el.innerHTML = `<p class="sub">還沒有紀錄</p>`; return; }
    const rate = (arr, f) => { const a = arr.filter(x => f(x) != null); const h = a.filter(x => f(x)).length; return { n: a.length, h, p: a.length ? h / a.length * 100 : null }; };
    const o = rate(R, x => x.open && x.open.hit), c = rate(R, x => x.close && x.close.hit);
    const last10 = R.slice(0, 10), o10 = rate(last10, x => x.open && x.open.hit), c10 = rate(last10, x => x.close && x.close.hit);
    let streak = 0; for (const x of R) { const hs = [x.open && x.open.hit, x.close && x.close.hit].filter(v => v != null); if (hs.length && hs.every(Boolean)) streak++; else break; }
    const tile = (t, r, r10) => `<div class="rvt"><span>${t}</span><b>${r.p == null ? "—" : r.p.toFixed(0) + "%"}</b><i style="--w:${(r.p || 0).toFixed(0)}%"></i></div>`;
    const conf = ["高", "中", "低"].map(k => { const sub = R.filter(x => x.conf === k), r = rate(sub, x => x.open && x.open.hit); return r.n ? `<span class="rvc"><b>信心${k}</b>${r.p.toFixed(0)}%<em>${r.h}/${r.n}</em></span>` : ""; }).join("");
    el.innerHTML = `<div class="rvtiles">${tile("開盤方向命中", o, o10)}${tile("收盤紅黑命中", c, c10)}<div class="rvt"><span>連續全中</span><b>${streak} 天</b></div></div>
      ${conf ? `<div class="rvconf"><span class="sub">開盤命中率</span>${conf}</div>` : ""}
      <div class="mwrap"><table class="mtbl rvtbl"><thead><tr><th class="l">日期</th><th>開盤預測</th><th>實際跳空</th><th></th><th>收盤預測</th><th>實際漲跌</th><th></th></tr></thead><tbody>${R.slice(0, 30).map(x => {
        const op = x.open, cl = x.close;
        return `<tr><td class="l">${A.esc(String(x.day).slice(5).replace("-", "/"))}</td><td>${op ? A.esc(op.call) : "—"}</td><td>${op && op.actual != null ? (op.actual > 0 ? "+" : "") + Math.round(op.actual) + " 點" : "—"}</td><td class="${op && op.hit != null ? (op.hit ? "up" : "down") : ""}">${mark(op && op.hit)}</td><td>${cl ? A.esc(cl.call) : "—"}</td><td>${cl && cl.actual != null ? A.pct(cl.actual) : "—"}</td><td class="${cl && cl.hit != null ? (cl.hit ? "up" : "down") : ""}">${mark(cl && cl.hit)}</td></tr>`;
      }).join("")}</tbody></table></div>`;
    if (animate) { A.rise($$(".rvt", el), 70); $$(".rvt i", el).forEach(grow); A.rise($$(".rvtbl tbody tr", el).slice(0, 14), 24, 200); }
  }

  /* ---------------- 總覽: 期現貨價差 (the index future against the cash index) ---------------- */
  function buildBasis() {
    const b3 = $(".board3"); if (!b3) return;
    b3.insertAdjacentHTML("beforeend", `<div class="dcard bs"><div class="bd-h"><h3>期現貨價差</h3><span class="sub bsn"></span></div><div class="bsout"><p class="sub">載入中…</p></div></div>`);
    paintBasis();
    document.addEventListener("twdash:live", paintBasis);
    ["twdash:live", "twdash:tab"].forEach(n => document.addEventListener(n, () => setTimeout(paintBasis, 0)));
  }
  let basisHist = [], bsFirst = true;
  /* the day's spread so far: one point per change, kept for the session so a reload keeps the line */
  function bsTrail(d) {
    const day = new Date().toDateString();
    if (!Array.isArray(basisHist) || basisHist.day !== day) { basisHist = []; basisHist.day = day; }
    if (!basisHist.length || basisHist[basisHist.length - 1] !== d) basisHist.push(d);
    if (basisHist.length > 240) basisHist.shift();
    const H = basisHist, W = 400, T = 120, mid = T / 2, mx = Math.max(20, ...H.map(v => Math.abs(v)));
    const y = v => (mid - v / mx * (mid - 12)).toFixed(1);
    const pts = H.length > 1 ? H.map((v, i) => `${(i / (H.length - 1) * W).toFixed(1)},${y(v)}`).join(" ") : `0,${y(H[0])} ${W},${y(H[0])}`;
    const hi = Math.max(...H), lo = Math.min(...H);
    return `<svg viewBox="0 0 ${W} ${T}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${W}" y1="${mid}" y2="${mid}" class="bz"/><polyline points="${pts}" class="bl ${d < 0 ? "down" : "up"}${bsFirst ? " in" : ""}" vector-effect="non-scaling-stroke"/></svg><div class="bsrng"><span>最低 <b>${sg(Math.round(lo * 100) / 100)}</b></span><span>最高 <b>${sg(Math.round(hi * 100) / 100)}</b></span></div>`;
  }
  function paintBasis() {
    const el = $(".bsout"); if (!el) return;
    const spot = A.IDX.find(i => i.k === "t00"), fut = A.IDX.find(i => i.k === "fut");
    if (!spot || !fut || !(spot.z > 0) || !(fut.z > 0)) {
      if (A.DB.failed || A.DB.rt === false || (el.dataset.h && el.dataset.h.indexOf("bsrow") > -1) || Date.now() - (window.__tw0 || (window.__tw0 = Date.now())) > 30000) { basisHist = []; const m = `<p class="sub">讀不到資料。</p>`; if (el.dataset.h !== m) { el.dataset.h = m; el.innerHTML = m; $(".bsn").textContent = ""; } }
      return;
    }
    const d = fut.z - spot.z, p = d / spot.z * 100, cls = d > 0 ? "up" : d < 0 ? "down" : "";
    /* the future only trades live when the cash market is closed too: say which two numbers are compared */
    const when = fut.src ? String(fut.src) : "";
    $(".bsn").textContent = when;
    const mx = Math.max(60, Math.abs(d)), w = Math.min(50, Math.abs(d) / mx * 50);
    const html = `<div class="bsrow"><span>台指期</span><b>${A.fmt(fut.z, 2)}</b></div><div class="bsrow"><span>加權指數</span><b>${A.fmt(spot.z, 2)}</b></div>
      <div class="bsdiff"><span class="aitag ${cls}">${d > 0 ? "正價差" : d < 0 ? "逆價差" : "無價差"}</span><b class="${cls}">${d > 0 ? "+" : ""}${A.fmt(d, 2)} 點</b><em class="${cls}">${p > 0 ? "+" : ""}${p.toFixed(2)}%</em></div>
      <div class="bsbar"><i class="${cls}" style="${d >= 0 ? "left:50%" : "right:50%"};width:${w.toFixed(1)}%"></i></div>
      <div class="bstr">${bsTrail(d)}</div>`;
    if (el.dataset.h === html) return; const first = !el.dataset.h; el.dataset.h = html; el.innerHTML = html;
    bsFirst = false;
    if (first) { A.rise($$(".bsrow, .bsdiff, .bstr", el), 60); const bar = $(".bsbar i", el); if (bar) bar.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 700, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" }); }
  }

  /* ---------------- 分析 → 存檔: every close summary this browser has seen, kept for 90 days ---------------- */
  const ARK = "twarch-close";
  const arList = () => { const L = A.store.get(ARK, []); return Array.isArray(L) ? L : []; };
  function arSave(n) {
    if (!n || !n.day || !n.analysis) return;
    const a = n.analysis, X = (n.data && n.data.taiex) || {};
    const e = { day: n.day, at: n.at, call: a.call || "", headline: a.headline || "", market: a.market || "", flows: a.flows || "", lead: a.lead || [], lag: a.lag || [], next: a.next || [], z: X.z, pct: X.pct };
    const L = arList().filter(x => x.day !== n.day); L.push(e); L.sort((x, y) => (x.day < y.day ? 1 : -1));
    A.store.set(ARK, L.slice(0, 90));
    if ($(".arc") && !$(".arc").hidden) arPaint(false);
  }
  function buildArchive() {
    const pre = $("#dpPre"); if (!pre || $(".arc", pre)) return;
    const bar = $(".anasub", pre), on = bar && $('[data-sub="ar"]', bar) && $('[data-sub="ar"]', bar).getAttribute("aria-selected") === "true";
    pre.insertAdjacentHTML("beforeend", `<div class="dcard arc" data-sub="ar"${on ? "" : " hidden"}><div class="aihead"><div><h3>收盤摘要存檔</h3></div><span class="sub arn"></span></div><div class="arout"></div></div>`);
    /* a day opens and closes on release of the press itself; the browser's own click is not always sent when the press animation moves the row, so it is only the keyboard's way in */
    const arc = $(".arc", pre); let dn = null, at = 0;
    const flip = h => { h.parentElement.classList.toggle("open"); };
    arc.addEventListener("pointerdown", e => { const h = e.target.closest && e.target.closest(".arh"); dn = h && e.button === 0 ? { h, x: e.clientX, y: e.clientY } : null; });
    arc.addEventListener("pointerup", e => { const d = dn; dn = null; if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return; at = Date.now(); flip(d.h); });
    arc.addEventListener("click", e => {
      const h = e.target.closest(".arh"); if (h) { if (Date.now() - at > 600) flip(h); return; }
      const m = e.target.closest("[data-code]"); if (m) A.openStock(m.dataset.code);
    });
    const tab = bar && $('[data-sub="ar"]', bar); if (tab) tab.addEventListener("click", () => arPaint(true));
    if (on) arPaint(false);
  }
  function arPaint(animate) {
    const el = $(".arout"), L = arList(); if (!el) return;
    $(".arn").textContent = L.length ? `${L.length} 天` : "";
    if (!L.length) { el.innerHTML = `<p class="sub">還沒有存檔</p>`; return; }
    const li = a => (Array.isArray(a) ? a : []).map(x => `<li>${A.esc(x)}</li>`).join("");
    const open = new Set($$(".arg.open .ard", el).map(x => x.textContent));
    const html = L.map(x => { const t = /紅/.test(x.call) ? "up" : /黑/.test(x.call) ? "down" : "";
      return `<div class="arg"><button type="button" class="arh"><span class="ard">${A.esc(String(x.day).slice(5).replace("-", "/"))}</span><span class="aitag ${t}">${A.esc(x.call)}</span><span class="arl">${A.esc(x.headline)}</span>${Number.isFinite(x.pct) ? `<b class="${A.tone(x.pct)}">${A.pct(x.pct)}</b>` : ""}</button>
        <div class="arb"><p>${A.esc(x.market)}</p>${x.lead.length || x.lag.length ? `<div class="aicols"><div><h4>領漲</h4><ul>${li(x.lead)}</ul></div><div><h4>落後</h4><ul>${li(x.lag)}</ul></div></div>` : ""}${x.flows ? `<h4>法人</h4><p>${A.esc(x.flows)}</p>` : ""}${x.next.length ? `<h4>當時盯的</h4><ul>${li(x.next)}</ul>` : ""}</div></div>`; }).join("");
    if (el.dataset.h === html) return; el.dataset.h = html; el.innerHTML = html;   /* a repaint with nothing new must not close what was opened */
    $$(".arg", el).forEach(g => { if (open.has($(".ard", g).textContent)) g.classList.add("open"); });
    if (animate) A.rise($$(".arg", el).slice(0, 20), 28);
  }

  /* ---------------- 持股與損益: 預估年股息 (each holding's cash dividends of the last year, from FinMind) ---------------- */
  const DVC = new Map();
  const dvGet = code => {
    if (!DVC.has(code)) { const from = new Date(Date.now() + 8 * 3600e3 - 800 * 864e5).toISOString().slice(0, 10); DVC.set(code, A.J(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockDividend&data_id=${encodeURIComponent(code)}&start_date=${from}`).catch(e => { DVC.delete(code); throw e; })); }
    return DVC.get(code);
  };
  let hdvBusy = false;
  async function hdvLoad() {
    const box = $("#dpHold .xhold");
    if (!box) { if (!hdvLoad.t) hdvLoad.t = setTimeout(() => { hdvLoad.t = 0; if (A.tabNow() === "dpHold") hdvLoad(); }, 1200); return; }
    if (!$(".hdv", box)) box.insertAdjacentHTML("afterbegin", `<div class="dcard hdv"><div class="aihead"><div><h3>預估年股息</h3></div><span class="sub hdvn"></span></div><div class="hdvout"><p class="sub">載入中…</p></div></div>`);
    if (hdvBusy) return; hdvBusy = true;
    const out = $(".hdvout", box), H = (A.store.get("twlab-hold", []) || []).filter(h => h && h.code && h.shares > 0);
    try {
      if (!H.length) { out.innerHTML = `<p class="sub">還沒有持股</p>`; return; }
      const yr = new Date(Date.now() + 8 * 3600e3 - 400 * 864e5).toISOString().slice(0, 10);
      const rows = await Promise.all(H.map(async h => {
        let per = 0; try { const a = (await dvGet(h.code)).data || []; per = a.filter(r => String(r.CashExDividendTradingDate || "") >= yr).reduce((t, r) => t + (Number(r.CashEarningsDistribution) || 0) + (Number(r.CashStatutorySurplus) || 0), 0); } catch (e) { per = null; }
        return { code: h.code, shares: h.shares, cost: h.cost, per, inc: per > 0 ? per * h.shares : 0 };
      }));
      const tot = rows.reduce((t, r) => t + r.inc, 0), cost = rows.filter(r => r.inc > 0).reduce((t, r) => t + (r.cost || 0), 0), mx = Math.max(1, ...rows.map(r => r.inc));
      $(".hdvn", box).textContent = "近一年現金股利";
      out.innerHTML = `<div class="hdvt"><div><span>預估年股息</span><b class="${tot ? "up" : ""}">${tot ? Math.round(tot).toLocaleString("zh-TW") + " 元" : "—"}</b></div><div><span>對成本殖利率</span><b>${tot && cost ? (tot / cost * 100).toFixed(2) + "%" : "—"}</b></div></div>
        <div class="hdvl">${rows.sort((a, b) => b.inc - a.inc).map(r => `<button type="button" class="instrow hdvrow" data-code="${A.esc(r.code)}"><span class="nm"><b>${A.esc(nm(r.code))}</b><em>${A.esc(r.code)}・${r.shares.toLocaleString("zh-TW")} 股</em></span><span class="mgbar"><i class="up" style="width:${r.inc > 0 ? Math.max(4, r.inc / mx * 100).toFixed(0) : 0}%"></i></span><span class="rr"><b>${r.per == null ? "讀不到" : r.inc > 0 ? Math.round(r.inc).toLocaleString("zh-TW") + " 元" : "無配息"}</b><i>${r.per > 0 ? "每股 " + r.per.toFixed(2) + " 元" : ""}</i></span></button>`).join("")}</div>`;
      A.rise($$(".hdvt > div, .hdvrow", out), 40); $$(".hdvrow .mgbar i", out).forEach(grow);
      if (!out.dataset.bound) { out.dataset.bound = "1"; out.addEventListener("click", e => { const r = e.target.closest(".instrow"); if (r) A.openStock(r.dataset.code); }); }
    } finally { hdvBusy = false; }
  }

  /* ---------------- tab switches ---------------- */
  function onTab(p) {
    if (!A) return;
    if (p === "dpChip") {
      A.instLoad(); A.ftLoad(); A.paintStreak(true); mgLoad();
      A.rise($$("#dpChip .nwgrid > .dcard"), 80);
    } else if (p === "dpInd") {
      A.rise($$("#dpInd .nwgrid > .dcard"), 80);
      requestAnimationFrame(() => paintInd(true)); rotLoad();
    } else if (p === "dpHold") {
      hdvLoad();
    } else if (p === "dpRev") {
      rvLoad();
      document.dispatchEvent(new Event("twdash:revopen"));
    }
  }

  if (window.TWDash && window.TWDash.api) init(); else document.addEventListener("twdash:ready", init, { once: true });
})();
