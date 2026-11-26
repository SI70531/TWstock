/* TWstock 選股器: pick stocks by your own conditions (price, change, volume, valuation, revenue growth, technical
   position and how many days in a row foreign investors / investment trusts have been buying), and keep the condition sets you use often.
   Valuation and revenue come from TWSE, so a stock without that figure (上櫃, loss-making, ETF) fails a condition on it.
   Reads the dashboard through window.TWDash.api (twmain.js); conditions are kept only in this browser. */
(function () {
  "use strict";
  let A = null;
  const panel = () => document.getElementById("dpScan");
  const $ = s => panel().querySelector(s), $$ = s => Array.from(panel().querySelectorAll(s));
  const ok = Number.isFinite;
  /* [key, label, which figure, "min" or "max", what has to be loaded first] */
  const RULES = [
    ["pxMin", "股價 ≥", "price", "min"], ["pxMax", "股價 ≤", "price", "max"],
    ["pctMin", "漲跌幅 % ≥", "pct", "min"], ["pctMax", "漲跌幅 % ≤", "pct", "max"],
    ["volMin", "成交量（張）≥", "vol", "min"],
    ["peMax", "本益比 ≤", "pe", "max", "fund"], ["pbMax", "股價淨值比 ≤", "pb", "max", "fund"],
    ["yldMin", "殖利率 % ≥", "yld", "min", "fund"], ["yoyMin", "月營收年增 % ≥", "yoy", "min", "fund"],
    ["fDays", "外資連買（天）≥", "fd", "min", "inst"], ["tDays", "投信連買（天）≥", "td", "min", "inst"],
    ["volxMin", "量能（20 日均量的倍數）≥", "volx", "min", "tech"],
  ];
  /* yes / no conditions on the technical figures (twdata.js computes them from the last 61 trading days) */
  const FLAGS = [["above20", "站上月線"], ["above60", "站上季線"], ["gold", "KD 黃金交叉（近 3 日）"], ["high60", "收盤創 60 日新高"]];
  const COLS = [["price", "成交價"], ["pct", "漲跌幅"], ["vol", "成交量"], ["pe", "本益比"], ["pb", "淨值比"], ["yld", "殖利率"], ["yoy", "營收年增"], ["fd", "外資連買"], ["td", "投信連買"]];
  const K = { last: "twscan-last", saved: "twscan-saved" };
  const S = { rows: null, key: "vol", dir: -1, shown: 50, busy: false };
  const saved = () => { const v = A.store.get(K.saved, []); return Array.isArray(v) ? v : []; };

  /* days in a row, counted back from the newest day, with a net buy; k: 0 foreign investors, 1 investment trusts */
  function streak(days, code, k) {
    let n = 0;
    for (const d of days) { if (!((d.m.get(code) || [0, 0])[k] > 0)) break; n++; }
    return n;
  }
  function figures(s) {
    const x = (S.tech && S.tech.map.get(s.code)) || {};
    const f = (A.FUND.map && A.FUND.map.get(s.code)) || {}, days = A.STRK.days;
    return { s, price: s.price, pct: s.pct, vol: s.vol,
      pe: f.pe > 0 ? f.pe : NaN, pb: f.pb > 0 ? f.pb : NaN, yld: ok(f.yld) ? f.yld : NaN, yoy: ok(f.yoy) ? f.yoy : NaN,
      fd: days && days.length ? streak(days, s.code, 0) : NaN, td: days && days.length ? streak(days, s.code, 1) : NaN,
      volx: ok(x.volx) ? x.volx : NaN, above20: x.above20, above60: x.above60, gold: x.gold, high60: x.high60 };
  }
  function readForm() {
    const c = { market: $('[name="market"]').value };
    RULES.forEach(([k]) => { const v = parseFloat($(`[name="${k}"]`).value); if (ok(v)) c[k] = v; });
    FLAGS.forEach(([k]) => { if ($(`[name="${k}"]`).checked) c[k] = true; });
    return c;
  }
  function fillForm(c) {
    $('[name="market"]').value = c.market || "all";
    RULES.forEach(([k]) => { $(`[name="${k}"]`).value = ok(c[k]) ? c[k] : ""; });
    FLAGS.forEach(([k]) => { $(`[name="${k}"]`).checked = c[k] === true; });
  }
  const say = t => { $(".scmsg").textContent = t; };

  /* the institutions' last 10 days are read by the overview; wait for them if they are still on the way */
  async function needInst() {
    for (let i = 0; i < 90; i++) {
      if (A.STRK.days) return A.STRK.days.length > 0;
      A.loadStreak();
      say(A.STRK.busy ? "讀取近 10 個交易日的法人資料…" : "等大盤資料讀完…");
      await A.wait(700);
    }
    return false;
  }
  async function run() {
    if (S.busy) return;
    const c = readForm(), used = RULES.filter(([k]) => ok(c[k])), flags = FLAGS.filter(([k]) => c[k]);
    if (!used.length && !flags.length && c.market === "all") return say("至少填一個條件。");
    if (!A.DB.list.length) return say("股票清單還在讀取，請稍後再按一次。");
    A.store.set(K.last, c);
    const needs = new Set(used.map(r => r[4]).filter(Boolean));
    if (flags.length) needs.add("tech");
    if (needs.has("tech") && c.market === "otc") return say("技術面條件只有上市股票有資料，請把市場改成上市。");
    if (needs.size && !A.DB.live) return say("目前是示意資料，估值、營收與法人條件無法篩選。");
    S.busy = true; $(".scgo").disabled = true; say("篩選中…");
    try {
      await A.loadFund();
      if (needs.has("fund") && !A.FUND.map) return say("估值資料暫時讀不到，請稍後再試。");
      if (ok(c.yoyMin) && ![...A.FUND.map.values()].some(f => ok(f.yoy))) return say("月營收資料還沒發布，先清掉月營收年增條件再篩選。");
      if (needs.has("inst") && !(await needInst())) return say("法人資料暫時讀不到，請稍後再試。");
      if (needs.has("tech")) {
        try { S.tech = await window.TWData.tech((i, n) => say(`讀取交易日 ${i}/${n}…第一次約 3 分鐘，之後只讀新的日期。`)); }
        catch (e) { return say(e.message || "技術資料暫時讀不到。"); }
      }
      S.rows = A.DB.list
        .filter(s => ok(s.price) && s.price > 0 && s.mkt !== "esb" && (c.market === "all" || (c.market === "otc") === (s.mkt === "otc")))
        .map(figures)
        .filter(r => used.every(([k, , field, how]) => ok(r[field]) && (how === "min" ? r[field] >= c[k] : r[field] <= c[k])) && flags.every(([k]) => r[k] === true));
      S.shown = 50;
      say(`符合 ${A.fmt(S.rows.length)} 檔${A.DB.date ? "・資料日期 " + A.DB.date.slice(0, 4) + "/" + A.DB.date.slice(4, 6) + "/" + A.DB.date.slice(6) : ""}`);
      paint(true);
    } finally { S.busy = false; $(".scgo").disabled = false; }
  }

  function cell(r, key) {
    if (!ok(r[key])) return "<td>—</td>";
    if (key === "price") return `<td><span class="pxpill ${A.tone(r.s.chg)}">${A.fmt(r.price, A.dig(r.price))}</span></td>`;
    if (key === "pct") return `<td class="${A.tone(r.pct)}">${A.pct(r.pct)}</td>`;
    if (key === "yoy") return `<td class="${A.tone(r.yoy)}">${A.pct(r.yoy)}</td>`;
    if (key === "yld") return `<td>${A.fmt(r.yld, 2)}%</td>`;
    if (key === "pe" || key === "pb") return `<td>${A.fmt(r[key], 2)}</td>`;
    if (key === "fd" || key === "td") return `<td>${r[key] ? r[key] + " 天" : "—"}</td>`;
    return `<td>${A.fmt(r[key])}</td>`;
  }
  function paint(animate) {
    const out = $(".scout");
    if (!S.rows) { out.innerHTML = ""; return; }
    S.rows.forEach(r => { r.price = r.s.price; r.pct = r.s.pct; r.vol = r.s.vol; });
    const v = x => (ok(x) ? x : -Infinity);
    const rows = S.rows.slice().sort((a, b) => (v(a[S.key]) - v(b[S.key])) * S.dir || a.s.code.localeCompare(b.s.code));
    out.innerHTML = !rows.length ? `<div class="dcard"><p class="mempty">沒有符合全部條件的股票，放寬一兩個條件試試。</p></div>`
      : `<div class="dcard mkt"><div class="mwrap"><table class="mtbl ttbl sctbl"><thead><tr><th class="l">股票</th>${COLS.map(([k, t]) => `<th class="sort" data-key="${k}" data-dir="${k === S.key ? (S.dir < 0 ? "desc" : "asc") : ""}">${t}<i></i></th>`).join("")}</tr></thead><tbody>${
        rows.slice(0, S.shown).map(r => `<tr data-code="${A.esc(r.s.code)}" tabindex="0"><td class="l nm"><b>${A.esc(r.s.name)}</b><span>${A.esc(r.s.code)}${r.s.mkt === "otc" ? " 櫃" : ""}</span></td>${COLS.map(([k]) => cell(r, k)).join("")}</tr>`).join("")
      }</tbody></table></div><button type="button" class="mmore" ${rows.length <= S.shown ? "hidden" : ""}>顯示更多</button></div>`;
    if (animate && panel().classList.contains("on")) A.rise($$(".sctbl tbody tr").slice(0, 24), 18);
  }
  function paintSaved() {
    $(".scsaved").innerHTML = saved().map((p, i) => `<span class="scpreset"><button type="button" class="chip" data-load="${i}">${A.esc(p.name)}</button><button type="button" class="lx" data-drop="${i}" aria-label="刪除常用條件 ${A.esc(p.name)}">×</button></span>`).join("");
  }
  function build() {
    panel().innerHTML = `
      <div class="dcard"><div class="aihead"><div><h3>選股器</h3></div></div>
        <div class="chips scsaved"></div>
        <div class="lform scform">
          <label>市場 <select class="in" name="market"><option value="all">上市＋上櫃</option><option value="tse">上市</option><option value="otc">上櫃</option></select></label>
          ${RULES.map(([k, t]) => `<label>${t} <input class="in" name="${k}" inputmode="decimal" placeholder="不限"></label>`).join("")}
        </div>
        <div class="scflags" role="group" aria-label="技術面條件">${FLAGS.map(([k, t]) => `<label class="lcheck"><input type="checkbox" name="${k}"><span>${t}</span></label>`).join("")}</div>
        <p class="sub">技術面與量能條件只含上市股票，用未還原除權息的收盤價計算。</p>
        <div class="lform"><button type="button" class="aigo scgo">篩選</button><button type="button" class="btn scclear">清除條件</button>
          <input class="in scname" placeholder="常用條件名稱" aria-label="常用條件名稱" maxlength="20"><button type="button" class="btn scsave">儲存條件</button></div>
        <p class="sub scmsg" role="status"></p>
      </div>
      <div class="scout"></div>`;
    fillForm(A.store.get(K.last, {}));
    paintSaved();
    panel().addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches(".scform input")) run(); });
    panel().addEventListener("click", e => {
      if (e.target.closest(".scgo")) return run();
      if (e.target.closest(".scclear")) { fillForm({}); A.store.set(K.last, {}); S.rows = null; paint(); return say(""); }
      if (e.target.closest(".scsave")) {
        const name = $(".scname").value.trim(), c = readForm();
        if (!name) return say("先幫這組條件取一個名稱。");
        if (!RULES.some(([k]) => ok(c[k])) && !FLAGS.some(([k]) => c[k]) && c.market === "all") return say("至少填一個條件才能儲存。");
        A.store.set(K.saved, saved().filter(p => p.name !== name).concat([{ name, c }]));
        $(".scname").value = ""; paintSaved(); return say(`已儲存「${name}」。`);
      }
      const load = e.target.closest("[data-load]");
      if (load) { const p = saved()[+load.dataset.load]; if (p) { fillForm(p.c); run(); } return; }
      const drop = e.target.closest("[data-drop]");
      if (drop) { A.store.set(K.saved, saved().filter((_, i) => i !== +drop.dataset.drop)); return paintSaved(); }
      const th = e.target.closest("th.sort");
      if (th) { const k = th.dataset.key; if (S.key === k) S.dir *= -1; else { S.key = k; S.dir = -1; } return paint(true); }
      if (e.target.closest(".mmore")) { S.shown += 100; return paint(false); }
      const tr = e.target.closest("tr[data-code]");
      if (tr) A.openStock(tr.dataset.code);
    });
  }
  document.addEventListener("twdash:ready", () => { A = window.TWDash && window.TWDash.api; if (A && panel()) build(); });
  document.addEventListener("twdash:live", () => { if (A && S.rows && panel().classList.contains("on")) paint(false); });
})();
