/* TWstock: more cards for the menus.
   籌碼  當沖排行 · 借券賣出 · 外資持股（Worker: /tw/daytrade /tw/lending /tw/qfii）
   股票  排行 gets 成交值 / 成交量 / 60 日新高 / 60 日新低; a 比較 tab puts 2–4 stocks side by side
   產業  估值比較（本益比、殖利率、股價淨值比 by industry）
   持股與損益  產業配置 */
(() => {
  "use strict";
  let A;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const lots = v => Number(v).toLocaleString("zh-TW");
  const sg = (v, d = 0) => (v > 0 ? "+" : "") + Number(v).toLocaleString("zh-TW", { maximumFractionDigits: d, minimumFractionDigits: d });
  const tone = v => (v > 0 ? "up" : v < 0 ? "down" : "flat");
  const nm = c => { const s = A.DB.by.get(c); return s ? s.name : c; };
  const esc = s => A.esc(String(s));
  const grow = el => el.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 700, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
  const median = a => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); if (!v.length) return NaN; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
  const stockish = s => /^\d{4}$/.test(s.code) && s.mkt !== "esb";
  const mount = (id, fn) => { const p = $(id); if (p) fn(p); };

  function row(code, w, cls, main, sub) {
    const s = A.DB.by.get(code);
    return `<button type="button" class="instrow mgrow" data-code="${esc(code)}"><span class="nm"><b>${esc(nm(code))}</b><em>${esc(code)}${s && Number.isFinite(s.pct) ? "・" + A.pct(s.pct) : ""}</em></span><span class="mgbar"><i class="${cls}" style="width:${Math.max(4, Math.min(100, w)).toFixed(0)}%"></i></span><span class="rr"><b class="${cls}">${main}</b><i>${sub}</i></span></button>`;
  }
  function paintList(el, html, animate) {
    if (el.dataset.h === html) return; el.dataset.h = html; el.innerHTML = html;
    if (animate) { A.rise($$(".mgrow", el), 26); $$(".mgbar i", el).forEach(grow); }
  }
  function seg(cls, segs, cur) {
    return `<div class="hmseg ${cls}" role="group">${segs.map(([k, l]) => `<button type="button" data-g="${k}" aria-pressed="${k === cur}">${l}</button>`).join("")}<i></i></div>`;
  }
  function bindSeg(card, sel, onPick) {
    const sg2 = $(sel, card);
    sg2.addEventListener("click", e => { const b = e.target.closest("[data-g]"); if (!b) return; $$("[data-g]", sg2).forEach(x => x.setAttribute("aria-pressed", String(x === b))); A.segMark(sg2); onPick(b.dataset.g); });
    if (window.ResizeObserver) new ResizeObserver(() => A.segMark(sg2)).observe(sg2);
  }

  /* ================= 籌碼: three more rankings ================= */
  const CC = [
    { cls: "dtc", title: "當沖排行", ep: "daytrade", segs: [["n", "當沖張數"], ["r", "當沖比率"]], build(D, k) {
      const R = D.rows.map(([c, n, b, s]) => { const x = A.DB.by.get(c); return { c, n, b, s, vol: x ? x.vol : 0 }; });
      const rows = k === "n" ? R.slice(0, 12) : R.filter(r => r.vol >= 2000).map(r => Object.assign(r, { p: r.n / r.vol * 100 })).sort((a, b) => b.p - a.p).slice(0, 12);
      const mx = Math.max(1, ...rows.map(r => (k === "n" ? r.n : r.p)));
      return { day: D.day, html: rows.map(r => row(r.c, (k === "n" ? r.n : r.p) / mx * 100, "flat", k === "n" ? lots(r.n) + " 張" : r.p.toFixed(1) + "%", k === "n" ? (r.vol ? "占成交 " + (r.n / r.vol * 100).toFixed(1) + "%" : "") : lots(r.n) + " 張")).join("") };
    } },
    { cls: "lbc", title: "借券賣出", ep: "lending", segs: [["up", "餘額增加"], ["down", "餘額減少"], ["bal", "餘額最大"]], build(D, k) {
      const rows = (D[k] || []).slice(0, 12), key = k === "bal" ? 1 : 2, mx = Math.max(1, ...rows.map(r => Math.abs(r[key])));
      return { day: D.day, html: rows.map(r => k === "bal" ? row(r[0], Math.abs(r[1]) / mx * 100, "flat", lots(r[1]) + " 張", "今日 " + sg(r[2])) : row(r[0], Math.abs(r[2]) / mx * 100, tone(r[2]) === "up" ? "down" : "up", sg(r[2]) + " 張", "餘額 " + lots(r[1]))).join("") };
    } },
    { cls: "qfc wide", title: "外資持股", ep: "qfii", segs: [["top", "持股比率最高"], ["up", "近 5 日增持"], ["down", "近 5 日減持"]], build(D, k) {
      const rows = (D[k] || []).slice(0, 12), mx = Math.max(0.01, ...rows.map(r => (k === "top" ? r[1] : Math.abs(r[2]))));
      return { day: D.day + (D.since && k !== "top" ? "（對照 " + D.since.slice(5).replace("-", "/") + "）" : ""), html: rows.map(r => k === "top" ? row(r[0], r[1] / mx * 100, "flat", r[1].toFixed(2) + "%", r[2] == null ? "" : "5 日 " + sg(r[2], 2) + " 點") : row(r[0], Math.abs(r[2]) / mx * 100, r[2] > 0 ? "up" : "down", sg(r[2], 2) + " 點", "持股 " + r[1].toFixed(2) + "%")).join("") };
    } },
  ];
  const CS = {};
  function buildChip2(grid) {
    const after = $(".mg", grid) || grid.lastElementChild;
    const html = CC.map(c => `<div class="dcard ccx ${c.cls}" data-cc="${c.ep}"><div class="aihead"><div><h3>${c.title}</h3></div><span class="sub ccn"></span></div>${seg("ccseg", c.segs, c.segs[0][0])}<div class="ccout"><p class="sub">載入中…</p></div></div>`).join("");
    after.insertAdjacentHTML("afterend", html);
    CC.forEach(c => {
      const card = $(`[data-cc="${c.ep}"]`, grid); CS[c.ep] = { k: c.segs[0][0], data: null, busy: false, card, c };
      bindSeg(card, ".ccseg", k => { CS[c.ep].k = k; ccPaint(c.ep, true); });
      card.addEventListener("click", e => { const r = e.target.closest(".instrow"); if (r) A.openStock(r.dataset.code); });
    });
  }
  async function ccLoad(ep) {
    const S = CS[ep]; if (!S || S.busy) return; S.busy = true;
    try { S.data = await A.J(`${A.worker}/tw/${ep}`); ccPaint(ep, true); }
    catch (e) { if (!S.data) $(".ccout", S.card).innerHTML = `<p class="sub">這項資料需要部署新版 Worker，或證交所暫時讀不到。</p>`; }
    S.busy = false;
  }
  function ccPaint(ep, animate) {
    const S = CS[ep]; if (!S || !S.data) return;
    const r = S.c.build(S.data, S.k);
    $(".ccn", S.card).textContent = String(r.day).slice(5).replace("-", "/");
    const out = $(".ccout", S.card); out.dataset.h = ""; paintList(out, r.html || `<p class="sub">沒有資料。</p>`, animate);
  }

  /* ================= 股票 → 排行: more lists ================= */
  const RX = [["val", "成交值前 15"], ["vol", "成交量前 15"], ["hi", "60 日新高"], ["lo", "60 日新低"]];
  let techBusy = false, techPct = -1;
  function buildRank(rk) {
    const g = $(".rkgrid", rk); if (!g) return;
    g.insertAdjacentHTML("beforeend", RX.map(([k, t]) => `<div class="rkx" data-x="${k}"><h3>${t}</h3><div class="xl"></div></div>`).join(""));
    rk.addEventListener("click", e => { const r = e.target.closest(".instrow"); if (r) A.openStock(r.dataset.code); });
  }
  function rkPaint(animate) {
    const rk = $("#dpList .rk"); if (!rk || rk.hidden) return;
    const L = A.DB.list.filter(s => stockish(s) && s.price > 0 && s.vol > 0 && Number.isFinite(s.pct));
    const put = (k, html) => { const el = $(`[data-x="${k}"] .xl`, rk); if (el) paintList(el, html || `<p class="sub">沒有資料。</p>`, animate); };
    const val = L.slice().sort((a, b) => b.price * b.vol - a.price * a.vol).slice(0, 15), mv = Math.max(1, ...val.map(s => s.price * s.vol));
    put("val", val.map(s => row(s.code, s.price * s.vol / mv * 100, tone(s.pct), (s.price * s.vol / 1e5).toLocaleString("zh-TW", { maximumFractionDigits: 1 }) + " 億", A.fmt(s.price, A.dig(s.price)))).join(""));
    const vol = L.slice().sort((a, b) => b.vol - a.vol).slice(0, 15), mx = Math.max(1, ...vol.map(s => s.vol));
    put("vol", vol.map(s => row(s.code, s.vol / mx * 100, tone(s.pct), lots(s.vol) + " 張", A.fmt(s.price, A.dig(s.price)))).join(""));
    const T = A.techNow;
    const wait = `<p class="sub">計算 60 日高低點${techPct >= 0 ? "　" + techPct + "%" : "…"}</p><div class="xprog"><i style="width:${Math.max(0, techPct)}%"></i></div>`;
    if (!T) { put("hi", wait); put("lo", wait); loadTech(); return; }
    const pick = k => L.filter(s => { const t = T.map.get(s.code); return t && t[k] && s.vol >= 1000; }).sort((a, b) => (k === "high60" ? b.pct - a.pct : a.pct - b.pct)).slice(0, 15);
    const mk = (a) => { const m = Math.max(0.01, ...a.map(s => Math.abs(s.pct))); return a.map(s => row(s.code, Math.abs(s.pct) / m * 100, tone(s.pct), A.fmt(s.price, A.dig(s.price)), A.pct(s.pct))).join(""); };
    put("hi", mk(pick("high60"))); put("lo", mk(pick("low60")));
  }
  async function loadTech() {
    if (techBusy || !A.tech) return; techBusy = true;
    try { A.techNow = await A.tech((i, n) => { techPct = Math.round(i / n * 100); const rk = $("#dpList .rk"); if (rk && !rk.hidden && !A.techNow) { const w = $$('[data-x="hi"] .xprog i, [data-x="lo"] .xprog i', rk); w.forEach(x => { x.style.width = techPct + "%"; }); } }); rkPaint(true); }
    catch (e) { const rk = $("#dpList .rk"); if (rk) $$('[data-x="hi"] .xl, [data-x="lo"] .xl', rk).forEach(el => { el.dataset.h = ""; el.innerHTML = `<p class="sub">${esc(e.message || "暫時讀不到")}</p>`; }); }
    techBusy = false;
  }

  /* ================= 股票 → 比較 ================= */
  const CK = "twmain-cmp", COLORS = ["#d98a1a", "#3a7bd5", "#c63a3a", "#2f9b6a"];
  const CP = { codes: null, hist: new Map(), q: "" };
  function cpCodes() {
    if (CP.codes) return CP.codes;
    const s = A.store.get(CK, null);
    CP.codes = Array.isArray(s) && s.length ? s.filter(c => A.DB.by.get(c)).slice(0, 4) : [];
    if (!CP.codes.length) { const w = A.watch().filter(c => A.DB.by.get(c) && /^\d{4}$/.test(c)); CP.codes = (w.length >= 2 ? w : ["2330", "2454"]).slice(0, 2).filter(c => A.DB.by.get(c)); }
    return CP.codes;
  }
  function buildCompare(dl) {
    const card = document.createElement("div"); card.className = "dcard cpc"; card.dataset.sub = "cp"; card.hidden = true;
    card.innerHTML = `<div class="cpbar"><div class="cpchips"></div><div class="cpadd"><input class="in cpq" type="text" inputmode="search" autocomplete="off" placeholder="代號或名稱" aria-label="加入比較"><div class="cpsug" hidden></div></div></div><div class="cpchart"></div><div class="cptbl"></div>`;
    const rk = $(".rk", dl); (rk || dl.lastElementChild).after(card);
    const q = $(".cpq", card), sug = $(".cpsug", card);
    q.addEventListener("input", () => {
      const t = q.value.trim().toLowerCase(); if (!t) { sug.hidden = true; return; }
      const L = A.DB.list.filter(s => stockish(s) && !cpCodes().includes(s.code) && (s.code.startsWith(t) || s.name.toLowerCase().includes(t))).slice(0, 6);
      sug.innerHTML = L.map(s => `<button type="button" data-add="${esc(s.code)}"><b>${esc(s.name)}</b><em>${esc(s.code)}</em></button>`).join(""); sug.hidden = !L.length;
    });
    card.addEventListener("click", e => {
      const a = e.target.closest("[data-add]"); if (a) { if (cpCodes().length < 4) { CP.codes.push(a.dataset.add); A.store.set(CK, CP.codes); } q.value = ""; sug.hidden = true; cpPaint(true); return; }
      const x = e.target.closest("[data-rm]"); if (x) { CP.codes = cpCodes().filter(c => c !== x.dataset.rm); A.store.set(CK, CP.codes); cpPaint(true); return; }
      const o = e.target.closest("[data-open]"); if (o) A.openStock(o.dataset.open);
    });
    document.addEventListener("click", e => { if (!e.target.closest(".cpadd")) sug.hidden = true; });
  }
  const ret = (cs, n) => { if (!cs || cs.length <= n) return NaN; const a = cs[cs.length - 1][4], b = cs[cs.length - 1 - n][4]; return b > 0 ? (a / b - 1) * 100 : NaN; };
  async function cpPaint(animate) {
    const card = $("#dpList .cpc"); if (!card || card.hidden) return;
    const codes = cpCodes(); if (!A.DB.list.length) return;
    const chipHtml = codes.map((c, i) => `<span class="cpchip" style="--c:${COLORS[i]}"><i></i><button type="button" data-open="${esc(c)}">${esc(nm(c))} <em>${esc(c)}</em></button><button type="button" class="scx" data-rm="${esc(c)}" aria-label="移除">×</button></span>`).join(""), cb = $(".cpchips", card);
    if (cb.dataset.h !== chipHtml) { cb.dataset.h = chipHtml; cb.innerHTML = chipHtml; }
    $(".cpadd", card).hidden = codes.length >= 4;
    await Promise.all([A.loadFund(), A.loadChip()].map(p => p.catch(() => {})));
    await Promise.all(codes.map(c => CP.hist.has(c) ? 0 : A.loadHist(c).then(cs => CP.hist.set(c, cs)).catch(() => CP.hist.set(c, null))));
    if (card.hidden || codes.join() !== cpCodes().join()) return;
    const F = A.FUND.map || new Map(), C = (A.CHIP && A.CHIP.map) || new Map(), ind = {};
    A.heatGroups().forEach(g => g.list.forEach(s => { ind[s.code] = g.name; }));
    const M = codes.map(c => { const s = A.DB.by.get(c), f = F.get(c) || {}, cs = CP.hist.get(c); return { c, s, f, chip: C.get(c), cs, r20: ret(cs, 20), r60: ret(cs, 60) }; });
    const rowsDef = [
      ["現價", m => A.fmt(m.s.price, A.dig(m.s.price)), null], ["今日漲跌", m => A.pct(m.s.pct), m => m.s.pct, 1, m => tone(m.s.pct)],
      ["成交值", m => (m.s.price * m.s.vol / 1e5).toLocaleString("zh-TW", { maximumFractionDigits: 1 }) + " 億", m => m.s.price * m.s.vol, 1],
      ["產業", m => ind[m.c] || "—", null], ["本益比", m => (m.f.pe > 0 ? m.f.pe.toFixed(1) : "—"), m => (m.f.pe > 0 ? m.f.pe : NaN), -1],
      ["殖利率", m => (m.f.yld > 0 ? m.f.yld.toFixed(2) + "%" : "—"), m => (m.f.yld > 0 ? m.f.yld : NaN), 1], ["股價淨值比", m => (m.f.pb > 0 ? m.f.pb.toFixed(2) : "—"), m => (m.f.pb > 0 ? m.f.pb : NaN), -1],
      ["月營收年增", m => (Number.isFinite(m.f.yoy) ? A.pct(m.f.yoy) : "—"), m => m.f.yoy, 1, m => tone(m.f.yoy)],
      ["近 20 日", m => (Number.isFinite(m.r20) ? A.pct(m.r20) : "—"), m => m.r20, 1, m => tone(m.r20)], ["近 60 日", m => (Number.isFinite(m.r60) ? A.pct(m.r60) : "—"), m => m.r60, 1, m => tone(m.r60)],
    ];
    const body = rowsDef.map(([l, f, key, dir, cl]) => {
      let best = -1; if (key && M.length > 1) { const v = M.map(key); const ok = v.filter(Number.isFinite); if (ok.length > 1) { const t = dir > 0 ? Math.max(...ok) : Math.min(...ok); best = v.indexOf(t); } }
      return `<tr><th>${l}</th>${M.map((m, i) => `<td class="${cl ? cl(m) : ""}${i === best ? " best" : ""}">${f(m)}</td>`).join("")}</tr>`;
    }).join("");
    const th = `<tr><th></th>${M.map((m, i) => `<th style="--c:${COLORS[i]}"><i></i>${esc(nm(m.c))}</th>`).join("")}</tr>`;
    const html = `<table class="cptb"><thead>${th}</thead><tbody>${body}</tbody></table>`, tb = $(".cptbl", card);
    if (tb.dataset.h !== html) { tb.dataset.h = html; tb.innerHTML = html; if (animate) A.rise($$("tbody tr", tb), 30); }
    cpChart(card, M, animate);
  }
  function cpChart(card, M, animate) {
    const S = M.filter(m => m.cs && m.cs.length > 5).map(m => { const cs = m.cs.slice(-61), b = cs[0][4]; return { c: m.c, i: M.indexOf(m), v: cs.map(x => x[4] / b * 100) }; });
    const host = $(".cpchart", card);
    if (!S.length) { host.innerHTML = ""; host.dataset.h = ""; return; }
    const W = 640, H = 220, pad = 8, n = Math.max(...S.map(s => s.v.length)), all = S.flatMap(s => s.v), lo = Math.min(...all, 100), hi = Math.max(...all, 100), sp = hi - lo || 1;
    const X = (i, len) => (pad + i / Math.max(1, len - 1) * (W - 2 * pad)).toFixed(1), Y = v => (H - pad - (v - lo) / sp * (H - 2 * pad)).toFixed(1);
    const html = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="近 60 日相對走勢"><line x1="0" x2="${W}" y1="${Y(100)}" y2="${Y(100)}" class="cpz"/>${S.map(s => `<polyline class="cpl" style="--c:${COLORS[s.i]}" points="${s.v.map((v, i) => X(i, s.v.length) + "," + Y(v)).join(" ")}"/>`).join("")}</svg>
      <div class="cpend">${S.map(s => { const e = s.v[s.v.length - 1] - 100; return `<span style="--c:${COLORS[s.i]}"><i></i>${esc(nm(s.c))} <b class="${tone(e)}">${sg(e, 1)}%</b></span>`; }).join("")}</div>`;
    if (host.dataset.h === html) return; host.dataset.h = html; host.innerHTML = html;
    if (animate) { const sv = $("svg", host); sv.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0)" }], { duration: 900, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" }); A.rise($$(".cpend span", host), 70); }
  }

  /* ================= 產業 → 估值比較 ================= */
  const IV = { k: "pe" };
  function buildVal(grid) {
    const hm = $(".rot", grid) || $(".bd-heat", grid); if (!hm) return;
    hm.insertAdjacentHTML("afterend", `<div class="dcard ival wide"><div class="aihead"><div><h3>產業估值比較</h3></div><span class="sub ivn"></span></div>${seg("ivseg", [["pe", "本益比"], ["yld", "殖利率"], ["pb", "股價淨值比"]], "pe")}<div class="ivout"><p class="sub">載入中…</p></div></div>`);
    const c = $(".ival", grid); bindSeg(c, ".ivseg", k => { IV.k = k; ivPaint(true); });
  }
  async function ivPaint(animate) {
    const card = $(".ival"); if (!card) return;
    await Promise.resolve(A.loadFund()).catch(() => {});
    const F = A.FUND.map; if (!F) { $(".ivout", card).innerHTML = `<p class="sub">估值資料暫時讀不到。</p>`; return; }
    const G = A.heatGroups(); if (!G.length) { $(".ivout", card).innerHTML = `<p class="sub">產業分類還沒發布，稍後會出現。</p>`; return; }
    const key = IV.k, rows = G.map(g => { const v = g.list.map(s => (F.get(s.code) || {})[key]).filter(x => x > 0); return { g, m: median(v), n: v.length }; }).filter(r => Number.isFinite(r.m) && r.n >= 3);
    rows.sort((a, b) => (key === "yld" ? b.m - a.m : a.m - b.m));
    const mx = Math.max(...rows.map(r => r.m)), all = median(rows.map(r => r.m)), fmtv = v => (key === "yld" ? v.toFixed(2) + "%" : v.toFixed(key === "pb" ? 2 : 1));
    $(".ivn", card).textContent = `中位數・全產業 ${fmtv(all)}`;
    const html = rows.map(r => `<div class="ivrow"><span class="nm"><b>${esc(r.g.name)}</b><em>${r.n} 檔</em></span><span class="mgbar"><i class="${(key === "yld" ? r.m >= all : r.m <= all) ? "up" : "flat"}" style="width:${Math.max(4, r.m / mx * 100).toFixed(0)}%"></i></span><span class="rr"><b>${fmtv(r.m)}</b></span></div>`).join("");
    const out = $(".ivout", card); if (out.dataset.h === html) return; out.dataset.h = html; out.innerHTML = html;
    if (animate) { A.rise($$(".ivrow", out), 18); $$(".mgbar i", out).forEach(grow); }
  }

  /* ================= 持股與損益 → 產業配置 ================= */
  const PAL = ["#d98a1a", "#3a7bd5", "#c63a3a", "#2f9b6a", "#8a5fd0", "#d0568f", "#3aa7c4", "#a0a64a"];
  let alloSig = "";
  function alloPaint(animate) {
    const host = $("#dpHold .xhold"); if (!host || !A.DB.list.length) return;
    let card = $(".alc", host);
    const H = (A.store.get("twlab-hold", []) || []).filter(h => h && h.shares > 0);
    const ind = {}; A.heatGroups().forEach(g => g.list.forEach(s => { ind[s.code] = g.name; }));
    const by = new Map(); let total = 0;
    H.forEach(h => { const s = A.DB.by.get(h.code); if (!s || !(s.price > 0)) return; const v = s.price * h.shares, k = ind[h.code] || (/^00/.test(h.code) ? "ETF" : "其他"); by.set(k, (by.get(k) || 0) + v); total += v; });
    if (!total) { if (card) card.remove(); alloSig = ""; return; }
    const L = [...by].sort((a, b) => b[1] - a[1]), top = L.slice(0, 7), rest = L.slice(7).reduce((a, x) => a + x[1], 0); if (rest) top.push(["其他", rest]);
    const sig = top.map(([k, v]) => k + Math.round(v)).join(); if (card && sig === alloSig && !animate) return; alloSig = sig;
    if (!card) { host.insertAdjacentHTML("afterbegin", `<div class="dcard alc"><div class="aihead"><div><h3>產業配置</h3></div><span class="sub aln"></span></div><div class="alwrap"><div class="alpie"></div><div class="allist"></div></div></div>`); card = $(".alc", host); }
    const C = 2 * Math.PI * 54; let off = 0;
    const segs = top.map(([k, v], i) => { const len = v / total * C, el = `<circle cx="70" cy="70" r="54" class="alseg" data-len="${len.toFixed(2)}" style="stroke:${PAL[i % PAL.length]}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"/>`; off += len; return el; }).join("");
    $(".aln", card).textContent = `${H.length} 檔・${L.length} 個產業`;
    $(".alpie", card).innerHTML = `<svg viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r="54" class="albg"/><g transform="rotate(-90 70 70)">${segs}</g></svg><div class="alc2"><b>${(total / 1e4).toLocaleString("zh-TW", { maximumFractionDigits: 0 })}</b><span>市值（萬）</span></div>`;
    $(".allist", card).innerHTML = top.map(([k, v], i) => `<div class="alrow"><i style="background:${PAL[i % PAL.length]}"></i><span>${esc(k)}</span><b>${(v / total * 100).toFixed(1)}%</b></div>`).join("");
    if (animate) {
      $$(".alseg", card).forEach((c, i) => { const len = +c.dataset.len; c.animate([{ strokeDasharray: `0 ${C}` }, { strokeDasharray: `${len} ${C - len}` }], { duration: 800, delay: i * 90, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" }); });
      A.rise($$(".alrow", card), 50);
    }
  }

  /* ================= wiring ================= */
  function init() {
    A = window.TWDash && window.TWDash.api; if (!A) return;
    mount("#dpChip .nwgrid", buildChip2);
    const dl = $("#dpList"); if (dl) { const rk = $(".rk", dl); if (rk) buildRank(rk); buildCompare(dl); }
    mount("#dpInd .nwgrid", buildVal);
    document.addEventListener("twdash:tab", e => {
      const p = e.detail;
      if (p === "dpChip") CC.forEach(c => ccLoad(c.ep));
      else if (p === "dpInd") setTimeout(() => ivPaint(true), 200);
      else if (p === "dpHold") setTimeout(() => alloPaint(true), 600);
      else if (p === "dpList") setTimeout(() => { rkPaint(true); cpPaint(true); }, 80);
    });
    document.addEventListener("twdash:lstsub", e => { if (e.detail === "rk") rkPaint(true); else if (e.detail === "cp") cpPaint(true); });
    const live = () => { const t = A.tabNow(); if (t === "dpList") { rkPaint(false); const cp = $("#dpList .cpc"); if (cp && !cp.hidden) cpPaint(false); } else if (t === "dpInd") ivPaint(false); else if (t === "dpHold") alloPaint(false); };
    document.addEventListener("twdash:live", live); document.addEventListener("twdash:list", live);
    document.addEventListener("twlab:hold", () => { if (A.tabNow() === "dpHold") alloPaint(true); });
    if (A.tabNow() === "dpChip") CC.forEach(c => ccLoad(c.ep));
  }
  if (window.TWDash && window.TWDash.api) init(); else document.addEventListener("twdash:ready", init, { once: true });
})();
