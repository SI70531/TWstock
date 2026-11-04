/* TWstock research tools: fundamentals + valuation river, ex-dividend list, institutional flows, stock screener, comparison.
   Built on the TWT helpers exported by twtrade.js. Live data comes from TWSE open data; when the browser cannot reach it
   (or the field names differ), the panels fall back to clearly labelled sample numbers. */
(function () {
  "use strict";
  const T = window.TWT; if (!T) return;
  const { DB, panel, $, $$, esc, fmt, pct, tone, dig, clamp, reduced, rise, growBars, sweep, srcTag, setOptions, num, hash, rng, getHist, NS } = T;
  const ok = v => Number.isFinite(v);
  const pick = (o, ...subs) => { for (const k of Object.keys(o)) if (subs.every(s => k.includes(s))) return o[k]; };
  const J = url => fetch(url, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("TWSE " + r.status); return r.json(); });

  /* ---------- fundamentals ---------- */
  const FUND = { map: null, at: 0, busy: false };
  async function loadFund() {
    if (DB.source !== "live" || FUND.busy || (FUND.map && Date.now() - FUND.at < 600000)) return;
    FUND.busy = true;
    const m = new Map();
    try { (await J("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL")).forEach(x => m.set(String(x.Code), { pe: num(x.PEratio), yld: num(x.DividendYield), pb: num(x.PBratio) })); } catch (e) {}
    try {
      (await J("https://openapi.twse.com.tw/v1/opendata/t187ap05_L")).forEach(x => {
        const c = String(pick(x, "公司代號") || ""), o = m.get(c) || {};
        o.rev = num(pick(x, "當月營收")) / 1e5; o.yoy = num(pick(x, "去年同月增減")); o.ym = String(pick(x, "資料年月") || "");
        if (c) m.set(c, o);
      });
    } catch (e) {}
    FUND.map = m; FUND.at = Date.now(); FUND.busy = false;
    if (m.size) T.emit();
  }
  function sampleFund(code) {
    const r = rng(hash(code) ^ 0x51ed);
    return { pe: 8 + r() * 22, yld: 1 + r() * 5, pb: 0.9 + r() * 4, rev: 10 + r() * 400, yoy: -20 + r() * 60, ym: "示意" };
  }
  const getFund = code => (DB.source === "live" ? ((FUND.map && FUND.map.get(code)) || {}) : sampleFund(code));
  const num1 = (v, d = 1, suf = "") => (ok(v) ? fmt(v, d) + suf : "—");
  const note = () => (DB.source === "live" ? "" : `<p class="sub warn">目前是示意資料，下面的數字不是真的。</p>`);

  /* ---------- 基本面 + 估值河流圖 ---------- */
  let fundCode = null, fundTok = 0, riverPlay = null;
  function riverSVG(cs, eps) {
    const W = 560, H = 240, PT = 12, PB = 12, PL = 8, PR = 40, mult = [10, 14, 18, 22, 26];
    const vals = [...cs.map(c => c.c), ...mult.map(m => m * eps)], hi = Math.max(...vals), lo = Math.min(...vals), pad = (hi - lo) * 0.05 || 1;
    const Y = v => PT + (H - PT - PB) * (hi + pad - v) / (hi - lo + 2 * pad), X = i => PL + (W - PL - PR) * i / Math.max(1, cs.length - 1);
    const bands = mult.map((m, k) => `<line class="riv r${k}" x1="${PL}" x2="${W - PR}" y1="${Y(m * eps).toFixed(1)}" y2="${Y(m * eps).toFixed(1)}"/><text x="${W - PR + 4}" y="${(Y(m * eps) + 4).toFixed(1)}">${m}x</text>`).join("");
    const line = cs.map((c, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(c.c).toFixed(1)).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="本益比河流圖">${bands}<path class="rp" d="${line}"/></svg>`;
  }
  async function updateFund(h) {
    $(".tt-src", h).innerHTML = srcTag();
    const codes = T.watch().length ? T.watch() : ["2330"];
    if (!codes.includes(fundCode)) fundCode = codes[0];
    $(".chips", h).innerHTML = codes.map(c => `<button type="button" class="chip" data-code="${esc(c)}" aria-pressed="${c === fundCode}">${esc((DB.byCode.get(c) || {}).name || c)} ${esc(c)}</button>`).join("");
    loadFund();
    const s = DB.byCode.get(fundCode), f = getFund(fundCode);
    if (!s) { $(".fcards", h).innerHTML = `<p class="empty">沒有這檔的資料</p>`; return; }
    const eps = ok(f.pe) && f.pe > 0 ? s.price / f.pe : NaN, div = ok(f.yld) ? s.price * f.yld / 100 : NaN;
    const items = [
      ["本益比", num1(f.pe, 1, " 倍"), "股價 ÷ 每股盈餘。倍數越低通常越便宜，但要跟同產業比。"],
      ["殖利率", num1(f.yld, 2, "%"), "一年現金股利 ÷ 股價，大約是只領股利一年的報酬率。"],
      ["股價淨值比", num1(f.pb, 2, " 倍"), "股價 ÷ 每股淨值。低於 1 代表股價低於帳面價值。"],
      ["估計 EPS（元）", num1(eps, 2), "用現價 ÷ 本益比反推的每股盈餘，是估計值。"],
      ["估計現金股利（元）", num1(div, 2), "用現價 × 殖利率反推，是估計值。"],
      ["當月營收（億）", num1(f.rev, 1), "資料年月 " + esc(f.ym || "—") + "。營收是公司賺錢的領先指標。"],
      ["營收年增率", ok(f.yoy) ? pct(f.yoy) : "—", "和去年同月比。連續成長比單月暴增更可靠。"],
    ];
    $(".fcards", h).innerHTML = note() + `<div class="tgrid">${items.map(([k, v, hint]) => `<div class="dcard"><h3>${k}</h3><div class="big">${v}</div><div class="sub hint">${hint}</div></div>`).join("")}</div>`;
    const tok = ++fundTok, cs = await getHist(fundCode);
    if (tok !== fundTok) return;
    $(".rbox", h).innerHTML = cs && ok(eps) ? riverSVG(cs, eps) : `<p class="empty">資料不足，畫不出河流圖。</p>`;
    riverPlay = () => { $$(".riv", h).forEach((l, i) => sweep(l, 500, i * 120)); sweep($(".rp", h), 1100, 700); };
    if (T.P.dpFund.el.classList.contains("on")) riverPlay();
  }
  panel("dpFund", {
    build(h) {
      h.innerHTML = `<div class="tt-src"></div><div class="chips"></div><div class="fcards tt"></div>
        <div class="dcard"><h3>本益比河流圖（近 60 日股價 vs 以最新估計 EPS 推算的 10 / 14 / 18 / 22 / 26 倍）</h3><div class="rbox"></div>
        <p class="sub hint">股價在越下面的線，代表用越低的倍數就買得到；只是歷史位置的參考，不是買賣建議。</p></div>`;
      $(".chips", h).addEventListener("click", e => { const b = e.target.closest("button[data-code]"); if (b) { fundCode = b.dataset.code; updateFund(h); } });
    },
    update(h) { updateFund(h); },
    play(h) { rise($$(".fcards .dcard", h), 60); riverPlay && riverPlay(); },
  });

  /* ---------- 除權息 ---------- */
  const DIV = { rows: null, at: 0, live: false };
  async function loadDiv() {
    if (DB.source === "live" && (!DIV.rows || !DIV.live || Date.now() - DIV.at > 3600000)) {
      try {
        const rows = (await J("https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL")).map(x => ({
          date: String(pick(x, "Date") || pick(x, "日期") || ""), code: String(x.Code || pick(x, "代號") || ""), name: String(x.Name || pick(x, "名稱") || ""),
          kind: String(pick(x, "權值") || pick(x, "Exdividend") || ""), cash: num(pick(x, "Cash") || pick(x, "現金")),
        })).filter(r => r.code && r.date);
        if (rows.length) { DIV.rows = rows.sort((a, b) => a.date.localeCompare(b.date)); DIV.live = true; DIV.at = Date.now(); T.emit(); return; }
      } catch (e) {}
    }
    if (!DIV.rows) {
      const r = rng(77), d0 = new Date();
      DIV.rows = DB.list.slice(0, 10).map((s, i) => { const d = new Date(d0.getTime() + (i * 2 + 3) * 864e5); return { date: d.toISOString().slice(0, 10), code: s.code, name: s.name, kind: "示意", cash: Math.round((0.5 + r() * 6) * 100) / 100 }; });
      DIV.live = false;
    }
  }
  let divOnlyWatch = false;
  panel("dpDiv", {
    build(h) {
      h.innerHTML = `<div class="tt-src"></div><div class="chips"><button type="button" class="chip" data-f="w" aria-pressed="false">只看自選股</button></div><div class="dcard"><h3>除權息預告</h3><p class="sub hint">除息前一天買進才領得到股利；除息日當天股價通常會扣掉股利，不代表賺到。</p><div class="tblwrap"><table class="ttbl"><thead><tr><th class="l">日期</th><th class="l">股票</th><th class="l">類別</th><th>現金股利（元）</th></tr></thead><tbody data-rows></tbody></table></div></div>`;
      $(".chips", h).addEventListener("click", () => { divOnlyWatch = !divOnlyWatch; T.emit(); });
    },
    update(h) {
      $(".tt-src", h).innerHTML = srcTag(); loadDiv();
      $("[data-f=w]", h).setAttribute("aria-pressed", String(divOnlyWatch));
      const w = T.watch(), rows = (DIV.rows || []).filter(r => !divOnlyWatch || w.includes(r.code)).slice(0, 60);
      $("[data-rows]", h).innerHTML = rows.map(r => `<tr><td class="l">${esc(r.date)}</td><td class="l">${esc(r.code)} ${esc(r.name)}</td><td class="l">${esc(r.kind || "—")}</td><td>${ok(r.cash) ? fmt(r.cash, 2) : "—"}</td></tr>`).join("")
        + (rows.length ? "" : `<tr><td class="empty" colspan="4">沒有符合的除權息資料</td></tr>`)
        + (DIV.live ? "" : `<tr><td class="empty" colspan="4">以上為示意資料</td></tr>`);
    },
    play(h) { rise($$("tbody tr", h).slice(0, 25), 25); },
  });

  /* ---------- 法人買賣超 ---------- */
  const CHIP = { rows: null, date: "", live: false, at: 0, busy: false };
  async function loadChip() {
    if (CHIP.busy) return;
    if (DB.source === "live" && (!CHIP.live || Date.now() - CHIP.at > 1800000)) {
      CHIP.busy = true;
      for (let back = 0; back < 8; back++) {
        const d = new Date(Date.now() - back * 864e5), ds = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
        try {
          const j = await J(`https://www.twse.com.tw/rwd/zh/fund/T86?date=${ds}&selectType=ALL&response=json`);
          if (j.stat !== "OK" || !j.data || !j.data.length) continue;
          const idx = (...subs) => j.fields.findIndex(f => subs.every(s => f.includes(s)));
          const iF = idx("外陸資買賣超股數", "不含"), iF2 = idx("外資", "買賣超"), iT = idx("投信買賣超"), iA = idx("三大法人買賣超");
          const rows = j.data.map(r => ({ code: String(r[0]).trim(), name: String(r[1]).trim(), f: num(r[iF >= 0 ? iF : iF2]) / 1000, t: num(r[iT]) / 1000, a: num(r[iA]) / 1000 })).filter(r => ok(r.a));
          if (rows.length) { CHIP.rows = rows; CHIP.date = ds; CHIP.live = true; CHIP.at = Date.now(); CHIP.busy = false; T.emit(); return; }
        } catch (e) { break; }
      }
      CHIP.busy = false;
    }
    if (!CHIP.rows) {
      CHIP.rows = DB.list.slice(0, 20).map(s => { const r = rng(hash(s.code) ^ 7); return { code: s.code, name: s.name, f: Math.round((r() - 0.5) * 20000), t: Math.round((r() - 0.5) * 3000), a: 0 }; });
      CHIP.rows.forEach(r => { r.a = r.f + r.t; });
      CHIP.date = "示意"; CHIP.live = false;
    }
  }
  let chipKey = "a";
  panel("dpChip", {
    build(h) {
      h.innerHTML = `<div class="tt-src"></div><div class="chips"><button type="button" class="chip" data-k="a">三大法人</button><button type="button" class="chip" data-k="f">外資</button><button type="button" class="chip" data-k="t">投信</button></div>
        <p class="sub hint">單位：張。買超代表當天買進多於賣出；法人買賣只是參考，不保證股價漲跌。</p><div class="tgrid cgrid"></div>`;
      $(".chips", h).addEventListener("click", e => { const b = e.target.closest("button[data-k]"); if (b) { chipKey = b.dataset.k; T.emit(); } });
    },
    update(h) {
      $(".tt-src", h).innerHTML = srcTag() + `<span>資料日期 ${esc(CHIP.date || "—")}${CHIP.live ? "" : "（示意）"}</span>`;
      $$("[data-k]", h).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.k === chipKey)));
      loadChip();
      const rows = (CHIP.rows || []).slice(), k = chipKey;
      const buy = rows.filter(r => r[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, 10), sell = rows.filter(r => r[k] < 0).sort((a, b) => a[k] - b[k]).slice(0, 10);
      const mx = Math.max(1, ...buy.map(r => r[k]), ...sell.map(r => -r[k]));
      const card = (title, list, cls) => `<div class="dcard"><h3>${title}</h3>${list.map(r => `<div class="rrow"><div class="kv"><span>${esc(r.code)} ${esc(r.name)}</span><b class="${cls}">${r[k] > 0 ? "+" : ""}${fmt(r[k])}</b></div><div class="meter"><i data-w="${(Math.abs(r[k]) / mx * 100).toFixed(1)}" class="${cls}b"></i></div></div>`).join("") || `<p class="empty">沒有資料</p>`}</div>`;
      $(".cgrid", h).innerHTML = card("買超前 10", buy, "up") + card("賣超前 10", sell, "down");
    },
    play(h) { rise($$(".cgrid .dcard", h), 100); growBars(h); },
  });

  /* ---------- 選股篩選器 ---------- */
  const SC = { yld: "", pe: "", pmin: "", pmax: "", chg: "", vol: "", yoy: "" };
  const PRESET = { 高殖利率: { yld: 5 }, 低本益比: { pe: 12 }, 營收成長: { yoy: 20 }, 強勢股: { chg: 3, vol: 5000 } };
  function runScreen(h) {
    const v = n => $(`[data-s="${n}"]`, h).value, n = x => (x === "" ? NaN : Number(x));
    const c = { yld: n(v("yld")), pe: n(v("pe")), pmin: n(v("pmin")), pmax: n(v("pmax")), chg: n(v("chg")), vol: n(v("vol")), yoy: n(v("yoy")) };
    const rows = DB.list.map(s => ({ s, f: getFund(s.code) })).filter(({ s, f }) =>
      (!ok(c.yld) || (ok(f.yld) && f.yld >= c.yld)) && (!ok(c.pe) || (ok(f.pe) && f.pe > 0 && f.pe <= c.pe)) &&
      (!ok(c.pmin) || s.price >= c.pmin) && (!ok(c.pmax) || s.price <= c.pmax) && (!ok(c.chg) || s.chgPct >= c.chg) &&
      (!ok(c.vol) || s.volume >= c.vol) && (!ok(c.yoy) || (ok(f.yoy) && f.yoy >= c.yoy)));
    rows.sort((a, b) => (b.f.yld || 0) - (a.f.yld || 0));
    $("[data-count]", h).textContent = `符合 ${fmt(rows.length)} 檔${rows.length > 50 ? "，先顯示前 50 檔（依殖利率排序）" : ""}${DB.source === "live" && !(FUND.map && FUND.map.size) ? "；基本面資料載入中或無法取得" : ""}`;
    $("[data-rows]", h).innerHTML = rows.slice(0, 50).map(({ s, f }) => `<tr><td class="l">${esc(s.code)}</td><td class="l">${esc(s.name)}</td><td>${fmt(s.price, dig(s.price))}</td><td class="${tone(s.chgPct)}">${pct(s.chgPct)}</td><td>${num1(f.yld, 2, "%")}</td><td>${num1(f.pe, 1)}</td><td>${num1(f.pb, 2)}</td><td>${ok(f.yoy) ? pct(f.yoy) : "—"}</td></tr>`).join("")
      || `<tr><td class="empty" colspan="8">沒有符合條件的股票</td></tr>`;
    rise($$("tbody tr", h).slice(0, 25), 20);
  }
  panel("dpScreen", {
    build(h) {
      const f = (k, label, step) => `<label>${label}<input data-s="${k}" type="number" step="${step}" placeholder="不限"></label>`;
      h.innerHTML = `<div class="tt-src"></div><div class="dcard"><h3>選股條件（留白代表不限）</h3>
        <div class="chips">${Object.keys(PRESET).map(k => `<button type="button" class="chip" data-p="${k}">${k}</button>`).join("")}</div>
        <div class="fgrid" style="margin-top:10px">${f("yld", "殖利率 ≥（%）", "0.5")}${f("pe", "本益比 ≤（倍）", "1")}${f("pmin", "股價 ≥", "1")}${f("pmax", "股價 ≤", "1")}${f("chg", "今日漲跌 ≥（%）", "0.5")}${f("vol", "成交量 ≥（張）", "1000")}${f("yoy", "營收年增 ≥（%）", "5")}</div>
        <div class="btnrow"><button type="button" class="tb" data-act="go">篩選</button><button type="button" class="tb ghost" data-act="clr">清除條件</button></div>
        <p class="sub hint">篩選只是縮小範圍的工具，不代表推薦；請自己再看公司基本面。</p></div>
        <div class="dcard"><p class="sub" data-count></p><div class="tblwrap"><table class="ttbl"><thead><tr><th class="l">代號</th><th class="l">名稱</th><th>收盤</th><th>漲跌</th><th>殖利率</th><th>本益比</th><th>淨值比</th><th>營收年增</th></tr></thead><tbody data-rows></tbody></table></div></div>`;
      h.addEventListener("click", e => {
        const p = e.target.closest("button[data-p]"), a = e.target.closest("button[data-act]");
        if (p) { $$("[data-s]", h).forEach(i => { i.value = ""; }); Object.entries(PRESET[p.dataset.p]).forEach(([k, v]) => { $(`[data-s="${k}"]`, h).value = v; }); runScreen(h); }
        else if (a) { if (a.dataset.act === "clr") $$("[data-s]", h).forEach(i => { i.value = ""; }); runScreen(h); }
      });
    },
    update(h) { $(".tt-src", h).innerHTML = srcTag(); loadFund(); runScreen(h); },
  });

  /* ---------- 多檔比較 ---------- */
  let cmpSel = null;
  panel("dpCmp", {
    build(h) {
      h.innerHTML = `<div class="tt-src"></div><div class="dcard"><h3>選最多 5 檔來比較（來自自選股）</h3><div class="chips cc"></div></div><div class="dcard"><div class="tblwrap"><table class="ttbl"><thead data-h></thead><tbody data-rows></tbody></table></div></div><div class="dcard"><h3>殖利率比較</h3><div data-bars></div></div>`;
      $(".cc", h).addEventListener("click", e => {
        const b = e.target.closest("button[data-c]"); if (!b) return;
        const c = b.dataset.c; cmpSel = cmpSel.includes(c) ? cmpSel.filter(x => x !== c) : (cmpSel.length < 5 ? cmpSel.concat(c) : cmpSel);
        T.emit(); rise($$(".meter i", h), 0);
      });
    },
    update(h) {
      $(".tt-src", h).innerHTML = srcTag(); loadFund();
      const w = T.watch(); if (!cmpSel) cmpSel = w.slice(0, 3);
      cmpSel = cmpSel.filter(c => DB.byCode.has(c));
      $(".cc", h).innerHTML = w.map(c => `<button type="button" class="chip" data-c="${esc(c)}" aria-pressed="${cmpSel.includes(c)}">${esc((DB.byCode.get(c) || {}).name || c)}</button>`).join("");
      const cols = cmpSel.map(c => ({ s: DB.byCode.get(c), f: getFund(c) }));
      const best = (key, low) => { const v = cols.map(x => x.f[key]).filter(x => ok(x) && (!low || x > 0)); return v.length ? (low ? Math.min(...v) : Math.max(...v)) : NaN; };
      const rows = [["收盤", x => fmt(x.s.price, dig(x.s.price))], ["今日漲跌", x => pct(x.s.chgPct), x => tone(x.s.chgPct)],
        ["本益比（低較便宜）", x => num1(x.f.pe, 1), x => (x.f.pe === best("pe", true) ? "best" : "")], ["殖利率（高較好）", x => num1(x.f.yld, 2, "%"), x => (x.f.yld === best("yld") ? "best" : "")],
        ["股價淨值比", x => num1(x.f.pb, 2), x => (x.f.pb === best("pb", true) ? "best" : "")], ["營收年增", x => (ok(x.f.yoy) ? pct(x.f.yoy) : "—"), x => (x.f.yoy === best("yoy") ? "best" : "")],
        ["成交量（張）", x => fmt(x.s.volume)]];
      $("[data-h]", h).innerHTML = `<tr><th class="l">項目</th>${cols.map(x => `<th>${esc(x.s.name)}</th>`).join("")}</tr>`;
      $("[data-rows]", h).innerHTML = cols.length ? rows.map(([k, f, c]) => `<tr><td class="l">${k}</td>${cols.map(x => `<td class="${c ? c(x) : ""}">${f(x)}</td>`).join("")}</tr>`).join("") : `<tr><td class="empty">請先選股票</td></tr>`;
      const mx = Math.max(1, ...cols.map(x => x.f.yld || 0));
      $("[data-bars]", h).innerHTML = cols.map(x => `<div class="rrow"><div class="kv"><span>${esc(x.s.name)}</span><b>${num1(x.f.yld, 2, "%")}</b></div><div class="meter"><i data-w="${((x.f.yld || 0) / mx * 100).toFixed(1)}"></i></div></div>`).join("");
    },
    play(h) { rise($$("tbody tr", h), 40); growBars(h); },
  });

  T.wire(["dpFund", "dpDiv", "dpChip", "dpScreen", "dpCmp"]);
})();
