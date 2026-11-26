/* TWstock: the newer tabs and the settings panel.
   比較       2–4 stocks side by side: price change from a common start, and today's valuation, revenue and flows.
   回測       one stock, one of the four strategies in twlab.js, with Taiwan trading costs.
   模擬交易   practice orders with virtual money, filled at the latest quote on screen. No broker, no real orders.
   紀錄回顧   AI stock analyses and pre-market calls as they were made, checked against what the market then did.
   設定       backup and restore of everything kept in this browser, Telegram switches, trading costs.
   Reads the dashboard through window.TWDash.api and the research tools through window.TWLab / window.TWData. */
(function () {
  "use strict";
  let A = null, cur = "";
  const ok = Number.isFinite;
  const pane = id => document.getElementById(id);
  const $ = (s, r) => r.querySelector(s), $$ = (s, r) => Array.from(r.querySelectorAll(s));
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const msg = t => `<p class="sub">${A.esc(t)}</p>`;
  const row = (k, v, t) => `<div class="snap"><span>${k}</span><b class="${t || ""}">${v}</b></div>`;
  const nameOf = c => { const s = A.DB.by.get(c); return s ? s.name : c; };
  const money = v => (ok(v) ? A.fmt(Math.round(v)) : "—");
  const twTime = at => new Date(at + 8 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
  const table = (head, rows) => `<div class="ltblwrap"><table class="mtbl ltbl"><thead><tr>${head.map((h, i) => `<th${i ? "" : ' class="l"'}>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  /* a typed code or a name → a code we know */
  function findStock(q) {
    const s = String(q || "").trim(); if (!s) return null;
    const hit = A.DB.by.get(s.toUpperCase()) || A.DB.list.find(x => x.name === s) || A.DB.list.find(x => s.startsWith(x.code + " "));
    return hit ? hit.code : null;
  }
  const stockOptions = () => `<datalist id="twstocks">${A.DB.list.map(s => `<option value="${A.esc(s.code)} ${A.esc(s.name)}"></option>`).join("")}</datalist>`;

  /* ================= 比較 ================= */
  const CMP = { months: 6, tok: 0 };
  const cmpCodes = () => { const c = A.store.get("twcmp-codes", []); return Array.isArray(c) ? c.slice(0, 4) : []; };
  function buildCmp() {
    pane("dpCmp").innerHTML = `
      <div class="dcard"><h3>比較（最多 4 檔）</h3>
        <div class="lform"><input class="in" name="add" list="twstocks" placeholder="代號或名稱" aria-label="加入比較的股票" autocomplete="off"><button type="button" class="aigo" data-cadd>加入</button></div>
        <div class="chips cmpsel"></div>
        <div class="chips"><span class="clab">期間</span>${[[3, "3 個月"], [6, "6 個月"], [12, "1 年"]].map(([m, t]) => `<button type="button" class="chip" data-months="${m}">${t}</button>`).join("")}</div>
        <p class="sub cmpmsg" role="status"></p></div>
      <div class="dcard"><h3>區間漲跌幅（%）</h3><div class="cmpchart"></div></div>
      <div class="dcard"><h3>並排數字</h3><div class="cmptable"></div></div>`;
    const el = pane("dpCmp");
    const add = () => {
      const i = $('[name="add"]', el), c = findStock(i.value), list = cmpCodes();
      if (!c) { $(".cmpmsg", el).textContent = "找不到這檔股票。"; return; }
      if (!list.includes(c)) { if (list.length >= 4) { $(".cmpmsg", el).textContent = "最多 4 檔，先移除一檔。"; return; } A.store.set("twcmp-codes", list.concat([c])); }
      i.value = ""; runCmp(); A.rtPoll();
    };
    el.addEventListener("click", e => {
      if (e.target.closest("[data-cadd]")) return add();
      const d = e.target.closest("[data-cdrop]"); if (d) { A.store.set("twcmp-codes", cmpCodes().filter(c => c !== d.dataset.cdrop)); return runCmp(); }
      const m = e.target.closest("[data-months]"); if (m) { CMP.months = +m.dataset.months; return runCmp(); }
      const o = e.target.closest("[data-open]"); if (o) A.openStock(o.dataset.open);
    });
    el.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.name === "add") add(); });
  }
  const SERIES = new Map();                       /* code:months → bars, for the table's live repaint */
  async function runCmp() {
    const el = pane("dpCmp"), codes = cmpCodes(), tok = ++CMP.tok, months = CMP.months;
    $(".cmpsel", el).innerHTML = codes.map((c, i) => `<span class="scpreset"><button type="button" class="chip" data-open="${A.esc(c)}"><i class="mc-dot s${i}"></i>${A.esc(nameOf(c))} ${A.esc(c)}</button><button type="button" class="lx" data-cdrop="${A.esc(c)}" aria-label="移除 ${A.esc(nameOf(c))}">×</button></span>`).join("");
    $$("[data-months]", el).forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.months === months)));
    const chart = $(".cmpchart", el), say = t => { if (tok === CMP.tok) $(".cmpmsg", el).textContent = t; };
    if (codes.length < 2) { chart.innerHTML = msg("加入至少 2 檔股票。"); $(".cmptable", el).innerHTML = ""; return say(""); }
    if (!A.DB.list.length) return say("股票清單讀取中…");
    chart.innerHTML = msg("讀取日線中…"); paintCmpTable();
    A.loadFund().then(() => tok === CMP.tok && paintCmpTable()); A.loadChip().then(() => tok === CMP.tok && paintCmpTable());
    const got = [];
    for (let i = 0; i < codes.length; i++) {
      let cs = [];
      try { cs = await TWLab.bars(codes[i], months + 1, (k, n) => say(`讀取 ${nameOf(codes[i])} 日線 ${k}/${n}…`)); } catch (e) {}
      if (tok !== CMP.tok) return;
      const from = new Date(Date.now() - months * 30.5 * 864e5).toISOString().slice(0, 10).replace(/-/g, "");
      cs = (cs || []).filter(c => c[0] >= from);
      SERIES.set(codes[i] + ":" + months, cs); got.push(cs);
    }
    const start = got.every(c => c.length) ? got.map(c => c[0][0]).sort().pop() : "";
    const series = codes.map((c, i) => { const cs = got[i].filter(b => b[0] >= start), base = cs.length ? cs[0][4] : NaN; return { name: nameOf(c), pts: cs.map(b => [b[0], (b[4] / base - 1) * 100]) }; });
    TWData.lineChart(chart, series, { label: "各股區間漲跌幅", fmt: v => A.fmt(v, 1) + "%" });
    say(start ? `從 ${A.slash(start)} 起算。收盤價未還原除權息與分割。` : "有股票讀不到日線。");
    paintCmpTable();
  }
  function paintCmpTable() {
    const el = $(".cmptable", pane("dpCmp")), codes = cmpCodes(); if (codes.length < 2) return;
    const f = c => (A.FUND.map && A.FUND.map.get(c)) || {}, ch = c => (A.CHIP.map && A.CHIP.map.get(c)) || {};
    const bars = c => SERIES.get(c + ":" + CMP.months) || [];
    const ret = c => { const b = bars(c); return b.length > 1 ? (b[b.length - 1][4] / b[0][4] - 1) * 100 : NaN; };
    const mdd = c => { let peak = -Infinity, m = 0; bars(c).forEach(b => { peak = Math.max(peak, b[4]); m = Math.min(m, b[4] / peak - 1); }); return bars(c).length > 1 ? m * 100 : NaN; };
    const vol = c => { const b = bars(c), r = []; for (let i = 1; i < b.length; i++) r.push(b[i][4] / b[i - 1][4] - 1); if (r.length < 20) return NaN; const m = mean(r); return Math.sqrt(mean(r.map(x => (x - m) ** 2)) * 250) * 100; };
    const s = c => A.DB.by.get(c) || {};
    const num = (v, d, unit = "") => (ok(v) && v !== 0 ? A.fmt(v, d) + unit : "—");
    const colored = (v, text) => [text, A.tone(v)];
    const lines = [
      ["成交價", c => [num(s(c).price, A.dig(s(c).price))]], ["今日漲跌幅", c => colored(s(c).pct, A.pct(s(c).pct))],
      ["區間漲跌幅", c => colored(ret(c), A.pct(ret(c)))], ["區間最大回落", c => [ok(mdd(c)) ? A.signed(mdd(c), 1) + "%" : "—"]], ["年化波動", c => [ok(vol(c)) ? A.fmt(vol(c), 0) + "%" : "—"]],
      ["本益比", c => [num(f(c).pe, 2)]], ["殖利率", c => [num(f(c).yld, 2, "%")]], ["股價淨值比", c => [num(f(c).pb, 2)]],
      ["月營收（億）", c => [num(f(c).rev, 1)]], ["營收年增", c => colored(f(c).yoy, A.pct(f(c).yoy))],
      ["外資買賣超（張）", c => colored(ch(c).f, ok(ch(c).f) ? A.signed(Math.round(ch(c).f), 0) : "—")], ["投信買賣超（張）", c => colored(ch(c).t, ok(ch(c).t) ? A.signed(Math.round(ch(c).t), 0) : "—")],
    ];
    el.innerHTML = table(["項目"].concat(codes.map(c => `${A.esc(nameOf(c))} ${A.esc(c)}`)), lines.map(([k, g]) => `<tr><td class="l">${k}</td>${codes.map(c => { const [v, t] = g(c); return `<td class="${t || ""}">${v}</td>`; }).join("")}</tr>`)) +
      msg("估值、營收與法人只有上市股票有資料。");
  }

  /* ================= 回測 ================= */
  const BT = { busy: false };
  const btPref = () => Object.assign({ code: "2330", months: 24, strat: "ma", stop: 0, prm: {} }, A.store.get("twbt-pref", {}));
  function buildBt() {
    const P = btPref();
    pane("dpBt").innerHTML = `
      <div class="dcard"><h3>回測</h3>
        <div class="lform btform">
          <label>股票 <input class="in" name="code" list="twstocks" value="${A.esc(P.code)}" autocomplete="off"></label>
          <label>期間 <select class="in" name="months">${[[12, "1 年"], [24, "2 年"], [36, "3 年"]].map(([m, t]) => `<option value="${m}" ${m === P.months ? "selected" : ""}>${t}</option>`).join("")}</select></label>
          <label>策略 <select class="in" name="strat">${Object.entries(TWLab.STRATS).map(([k, v]) => `<option value="${k}" ${k === P.strat ? "selected" : ""}>${v.name}</option>`).join("")}</select></label>
          <span class="lprm btprm"></span>
          <label>停損 %（0＝不設）<input class="in" name="stop" inputmode="decimal" value="${P.stop}"></label>
          <button type="button" class="aigo" data-btrun>開始回測</button>
        </div>
        <p class="sub bthelp"></p><p class="sub btmsg" role="status"></p></div>
      <div class="btout"></div>`;
    const el = pane("dpBt");
    const params = () => {
      const k = $('[name="strat"]', el).value, S = TWLab.STRATS[k], saved = btPref().prm[k] || {};
      $(".btprm", el).innerHTML = S.p.map(([pk, t, d]) => `<label>${t}<input class="in" data-prm="${pk}" inputmode="decimal" value="${ok(saved[pk]) ? saved[pk] : d}"></label>`).join("");
      $(".bthelp", el).textContent = S.help + "訊號出現後，用下一個交易日開盤價成交。";
    };
    params();
    el.addEventListener("change", e => { if (e.target.name === "strat") params(); });
    el.addEventListener("click", e => { if (e.target.closest("[data-btrun]")) runBt(); });
    el.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("input")) runBt(); });
  }
  async function runBt() {
    if (BT.busy) return;
    const el = pane("dpBt"), say = t => { $(".btmsg", el).textContent = t; }, v = n => $(`[name="${n}"]`, el).value;
    const code = findStock(v("code")), strat = v("strat"), months = +v("months"), stop = Math.max(0, parseFloat(v("stop")) || 0);
    if (!A.DB.live) return say("目前是示意資料，無法回測。");
    if (!code) return say("找不到這檔股票。");
    const prm = {}; let bad = false;
    $$("[data-prm]", el).forEach(i => { const x = parseFloat(i.value); if (!ok(x) || x < 0) bad = true; prm[i.dataset.prm] = x; });
    if (bad) return say("策略參數要是 0 以上的數字。");
    if ((strat === "ma" && !(prm.fast >= 2 && prm.slow > prm.fast && Number.isInteger(prm.fast) && Number.isInteger(prm.slow))) || (strat === "brk" && !(prm.n >= 2 && prm.m >= 2 && Number.isInteger(prm.n) && Number.isInteger(prm.m)))) return say("天數要是 2 以上的整數，短均線要小於長均線。");
    const P = btPref(); P.prm[strat] = prm; A.store.set("twbt-pref", { code, months, strat, stop, prm: P.prm });
    BT.busy = true; $("[data-btrun]", el).disabled = true; $(".btout", el).innerHTML = "";
    try {
      const cs = await TWLab.bars(code, months, (i, n) => say(`讀取日線 ${i}/${n} 個月…第一次較久，之後有快取。`));
      if (cs.length < 60) return say("日線不足 60 天，無法回測。");
      const pf = TWLab.prefs(), cost = { fee: pf.fee / 100 * pf.disc, tax: TWLab.taxOf(code) / 100, slip: pf.slip / 100, stop: stop / 100 };
      const { trades, eq } = TWLab.backtest(cs, strat, prm, cost), n = cs.length, cut = Math.floor(n * 0.7);
      const parts = [["全部期間", TWLab.stats(trades, eq, 0, n), 0, n], ["前 70%", TWLab.stats(trades, eq, 0, cut), 0, cut], ["後 30%", TWLab.stats(trades, eq, cut, n), cut, n]];
      const hold = (a, b) => (cs[b - 1][4] / (a ? cs[a - 1][4] : cs[0][4]) - 1) * 100;
      const pfac = x => (x === Infinity ? "沒有虧損" : ok(x) ? A.fmt(x, 2) : "—");
      $(".btout", el).innerHTML = `<div class="dcard"><h3>${A.esc(nameOf(code))} ${A.esc(code)}・${A.esc(TWLab.STRATS[strat].name)}</h3>` +
        table(["區段", "策略報酬", "買進持有", "完成交易", "勝率", "獲利因子", "平均每筆", "最大回落"], parts.map(([t, s, a, b]) => `<tr><td class="l">${t}</td><td class="${A.tone(s.tot)}">${A.pct(s.tot)}</td><td class="${A.tone(hold(a, b))}">${A.pct(hold(a, b))}</td><td>${s.n}</td><td>${ok(s.win) ? A.fmt(s.win, 0) + "%" : "—"}</td><td>${pfac(s.pf)}</td><td>${ok(s.avg) ? A.pct(s.avg) : "—"}</td><td>${A.signed(s.mdd, 1)}%</td></tr>`)) +
        (parts[0][1].n < 10 ? `<p class="sub warn">完成交易少於 10 筆，結果沒有統計意義。</p>` : "") +
        msg(`含手續費 ${pf.fee}%×${pf.disc}、證交稅 ${TWLab.taxOf(code)}%、滑價 ${pf.slip}%。未計最低手續費；價格未還原除權息與分割。過去的結果不代表以後。`) +
        `</div><div class="dcard"><h3>累積報酬（%）</h3><div class="btchart"></div></div>
         <div class="dcard"><h3>每筆交易</h3>${trades.length ? table(["買進日", "賣出日", "買價", "賣價", "報酬", "持有交易日"], trades.slice().reverse().map(t => `<tr><td class="l">${A.slash(t.din)}</td><td>${t.open ? "持有中" : A.slash(t.dout)}</td><td>${A.fmt(t.pin, 2)}</td><td>${A.fmt(t.pout, 2)}</td><td class="${A.tone(t.ret)}">${A.pct(t.ret)}</td><td>${t.days}</td></tr>`)) : msg("這段期間沒有任何買進訊號。")}</div>`;
      TWData.lineChart($(".btchart", el), [{ name: "策略", pts: cs.map((c, i) => [c[0], (eq[i] - 1) * 100]) }, { name: "買進持有", pts: cs.map(c => [c[0], (c[4] / cs[0][4] - 1) * 100]) }], { label: "策略與買進持有的累積報酬", fmt: x => A.fmt(x, 0) + "%" });
      say(`資料期間 ${A.slash(cs[0][0])} 到 ${A.slash(cs[n - 1][0])}（${n} 個交易日）。`);
    } catch (e) { say("回測失敗，請稍後再試。"); }
    finally { BT.busy = false; $("[data-btrun]", el).disabled = false; }
  }

  /* ================= 模擬交易 ================= */
  const START = 1000000;
  function account() {
    const a = A.store.get("twsim", null);
    return a && ok(a.cash) && Array.isArray(a.pos) && Array.isArray(a.log) ? a : { start: START, cash: START, pos: [], log: [], pick: "" };
  }
  const save = a => A.store.set("twsim", a);
  const feeOf = v => { const p = TWLab.prefs(); return Math.max(p.minFee, Math.round(v * p.fee / 100 * p.disc)); };
  const taxAmt = (code, v) => Math.round(v * TWLab.taxOf(code) / 100);
  function buildSim() {
    pane("dpSim").innerHTML = `
      <div class="dcard"><h3>模擬帳戶（虛擬資金，不會送出任何真實委託）</h3><div class="simsum"></div></div>
      <div class="dcard"><h3>下單</h3>
        <div class="lform"><label>股票 <input class="in" name="code" list="twstocks" autocomplete="off" placeholder="代號或名稱"></label>
          <label>股數（1 張＝1000）<input class="in" name="qty" inputmode="numeric" value="1000"></label>
          <button type="button" class="aigo simbuy" data-side="buy">模擬買進</button><button type="button" class="btn" data-side="sell">模擬賣出</button></div>
        <p class="sub simquote"></p><p class="sub simmsg" role="status"></p></div>
      <div class="dcard"><h3>目前部位</h3><div class="simpos"></div></div>
      <div class="dcard"><h3>成交紀錄</h3><div class="simlog"></div><div class="lform"><button type="button" class="btn" data-reset>重設帳戶</button></div></div>`;
    const el = pane("dpSim"); let armed = 0;
    const input = $('[name="code"]', el);
    input.value = account().pick || "";
    el.addEventListener("input", e => {
      if (e.target.name === "code") { const c = findStock(e.target.value); if (c) { const a = account(); a.pick = c; save(a); A.quoteNow(c).then(paintQuote); A.rtPoll(); } paintQuote(); }
      if (e.target.name === "qty") paintQuote();
    });
    el.addEventListener("click", e => {
      const s = e.target.closest("[data-side]"); if (s) return order(s.dataset.side);
      const p = e.target.closest("[data-simpick]");
      if (p) { const a = account(), h = a.pos.find(x => x.code === p.dataset.simpick); input.value = p.dataset.simpick; if (h) $('[name="qty"]', el).value = h.qty; a.pick = p.dataset.simpick; save(a); paintQuote(); input.scrollIntoView({ block: "center" }); return; }
      const r = e.target.closest("[data-reset]");
      if (r) {
        if (Date.now() - armed > 4000) { armed = Date.now(); r.textContent = "再按一次確認清除"; setTimeout(() => { r.textContent = "重設帳戶"; }, 4000); return; }
        armed = 0; r.textContent = "重設帳戶"; save({ start: START, cash: START, pos: [], log: [], pick: "" }); input.value = ""; paintSim(); paintQuote();
      }
    });
  }
  function priceNote(s) { return s.rt ? `盤中 ${s.tm || ""}` : `收盤 ${A.slash(A.DB.date)}`; }
  function paintQuote() {
    const el = pane("dpSim"), c = findStock($('[name="code"]', el).value), q = $(".simquote", el), s = c && A.DB.by.get(c);
    if (!s || !(s.price > 0)) { q.textContent = c ? "這檔目前沒有價格。" : ""; return; }
    const n = parseInt($('[name="qty"]', el).value, 10), v = n > 0 ? s.price * n : NaN;
    q.textContent = `${s.name} 成交價 ${A.fmt(s.price, A.dig(s.price))}（${priceNote(s)}）` + (ok(v) ? `・金額 ${money(v)}，手續費 ${money(feeOf(v))}，賣出時另扣證交稅 ${money(taxAmt(c, v))}` : "");
  }
  async function order(side) {
    const el = pane("dpSim"), say = (t, warn) => { const m = $(".simmsg", el); m.textContent = t; m.classList.toggle("warn", !!warn); };
    const c = findStock($('[name="code"]', el).value), raw = $('[name="qty"]', el).value.trim(), n = Number(raw);
    if (!A.DB.live) return say("目前是示意資料，不能下單。", true);
    if (!c) return say("找不到這檔股票。", true);
    if (!Number.isInteger(n) || n <= 0) return say("股數要是正整數。", true);
    await A.quoteNow(c);
    const s = A.DB.by.get(c);
    if (!(s.price > 0)) return say("這檔目前沒有價格，不能成交。", true);
    const a = account(), v = s.price * n, fee = feeOf(v), h = a.pos.find(x => x.code === c);
    const rec = { id: uid(), at: Date.now(), code: c, side, qty: n, price: s.price, fee, tax: 0, src: priceNote(s), pnl: null };
    if (side === "buy") {
      if (v + fee > a.cash) return say(`現金不足：需要 ${money(v + fee)}，剩 ${money(a.cash)}。`, true);
      a.cash -= v + fee;
      if (h) { h.qty += n; h.cost += v + fee; } else a.pos.push({ code: c, qty: n, cost: v + fee });
    } else {
      if (!h || h.qty < n) return say(h ? `只持有 ${A.fmt(h.qty)} 股。` : "沒有這檔部位（不支援放空）。", true);
      rec.tax = taxAmt(c, v);
      const part = h.cost * n / h.qty;
      rec.pnl = v - fee - rec.tax - part;
      a.cash += v - fee - rec.tax; h.cost -= part; h.qty -= n;
      if (!h.qty) a.pos = a.pos.filter(x => x !== h);
    }
    a.log.unshift(rec); a.log.length = Math.min(a.log.length, 500); a.pick = c; save(a); paintSim();
    say(`已模擬${side === "buy" ? "買進" : "賣出"} ${s.name} ${A.fmt(n)} 股 @ ${A.fmt(s.price, A.dig(s.price))}。`);
  }
  function paintSim() {
    const el = pane("dpSim"), a = account(), F = A.fmt;
    const rows = a.pos.map(p => { const s = A.DB.by.get(p.code), px = s && s.price > 0 ? s.price : NaN, mv = px * p.qty; return Object.assign({ px, mv, pnl: mv - p.cost }, p); });
    const unknown = rows.some(r => !ok(r.mv)), mv = rows.reduce((t, r) => t + (ok(r.mv) ? r.mv : r.cost), 0), eq = a.cash + mv;
    const sells = a.log.filter(t => t.side === "sell"), realized = sells.reduce((t, x) => t + x.pnl, 0), wins = sells.filter(x => x.pnl > 0).length;
    $(".simsum", el).innerHTML = row("總資產", money(eq) + (unknown ? "（查無價格的部位以成本計）" : "")) + row("總報酬", `${A.signed(eq - a.start, 0)}（${A.pct((eq / a.start - 1) * 100)}）`, A.tone(eq - a.start)) +
      row("可用現金", money(a.cash)) + row("持股市值", money(mv)) + row("已實現損益", A.signed(realized, 0), A.tone(realized)) + row("賣出勝率", sells.length ? `${F(wins / sells.length * 100, 0)}%（${sells.length} 筆）` : "—") +
      msg("依最新價全數成交，未模擬掛單、排隊、漲跌停買不到與滑價；股利不計入。非盤中以最近收盤價成交。");
    $(".simpos", el).innerHTML = rows.length ? table(["商品", "股數", "均價成本", "現價", "市值", "未實現損益", ""], rows.map(r => `<tr><td class="l nm"><b>${A.esc(nameOf(r.code))}</b><span>${A.esc(r.code)}</span></td><td>${F(r.qty)}</td><td>${F(r.cost / r.qty, 2)}</td><td>${ok(r.px) ? F(r.px, A.dig(r.px)) : "—"}</td><td>${money(r.mv)}</td><td class="${A.tone(r.pnl)}">${ok(r.pnl) ? A.signed(r.pnl, 0) : "—"}</td><td><button type="button" class="btn" data-simpick="${A.esc(r.code)}">賣出…</button></td></tr>`)) : msg("目前沒有部位。");
    $(".simlog", el).innerHTML = a.log.length ? table(["時間", "商品", "買賣", "股數", "價格", "費稅", "已實現"], a.log.slice(0, 100).map(t => `<tr><td class="l">${twTime(t.at)}</td><td>${A.esc(nameOf(t.code))}</td><td>${t.side === "buy" ? "買進" : "賣出"}</td><td>${F(t.qty)}</td><td title="${A.esc(t.src || "")}">${F(t.price, A.dig(t.price))}</td><td>${money(t.fee + t.tax)}</td><td class="${A.tone(t.pnl)}">${t.pnl == null ? "—" : A.signed(t.pnl, 0)}</td></tr>`)) : msg("還沒有成交。");
  }

  /* ================= 紀錄回顧 ================= */
  const aiLog = () => { const a = A.store.get("twlog-ai", []); return Array.isArray(a) ? a : []; };
  const pmLog = () => { const a = A.store.get("twlog-pm", []); return Array.isArray(a) ? a : []; };
  const HORIZON = [5, 10, 20];
  function recordAI(d) {
    const L = aiLog(); if (L.some(x => x.code === d.code && x.at === d.at)) return;     /* today's saved analysis can be shown again */
    const S = (d.analysis && d.analysis.summary) || {}, O = (d.analysis && d.analysis.order) || {};
    L.unshift({ code: d.code, name: d.name, at: d.at, day: d.barDate, price: d.price, stance: String(S.stance || ""), confidence: String(S.confidence || ""), headline: String(S.headline || ""), action: String(O.action || ""), res: {} });
    L.length = Math.min(L.length, 300); A.store.set("twlog-ai", L);
    if (cur === "dpLog") paintLog();
  }
  /* the newest note in full, and the calls of the few before it, as the Worker still has them */
  function recordPM(j) {
    const items = [j.note && { day: j.note.day, at: j.note.at, a: j.note.analysis }].concat((j.history || []).map(h => ({ day: h.day, at: h.at, a: { call: h.call } }))).filter(x => x && x.day && x.a && x.a.call);
    const by = new Map(pmLog().map(x => [x.day, x]));
    items.forEach(x => {
      const old = by.get(x.day); if (old && old.at >= x.at) return;
      const close = x.a.close && x.a.close.call ? String(x.a.close.call) : (old && old.close) || "";
      by.set(x.day, Object.assign({}, old, { day: x.day, at: x.at, call: String(x.a.call), close, gap: String(x.a.gap || (old && old.gap) || "") }));
    });
    A.store.set("twlog-pm", [...by.values()].sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 400));
    if (cur === "dpLog") paintLog();
  }
  /* the rules the opening-bell message uses: 開高 means a gap above 20 points, 開低 below −20, otherwise within 60 */
  const openHit = (call, gap) => (/高/.test(call) ? gap > 20 : /低/.test(call) ? gap < -20 : Math.abs(gap) <= 60);
  /* 收紅 / 收黑 by the sign of the day's change; 平盤 within 0.2% of the previous close */
  const closeHit = (call, chg, prev) => (/紅/.test(call) ? chg > 0 : /黑/.test(call) ? chg < 0 : Math.abs(chg / prev) <= 0.002);
  async function indexDays() {                       /* yyyymmdd → { o, c, prev } of the TAIEX, about a year */
    const j = await A.J(`${A.WORKER}/tw/chart?k=t00&r=day`), out = new Map(); let prev = NaN;
    (j.pts || []).forEach(p => { const ds = new Date((p[0] + 8 * 3600) * 1000).toISOString().slice(0, 10).replace(/-/g, ""); out.set(ds, { o: p[5], c: p[1], prev }); prev = p[1]; });
    return out;
  }
  let checking = false;
  async function checkLog() {
    if (checking) return;
    const el = pane("dpLog"), say = t => { const m = $(".logmsg", el); if (m) m.textContent = t; };
    if (!A.DB.live) return say("目前是示意資料，無法對照。");
    checking = true; $("[data-check]", el).disabled = true; say("讀取加權指數…");
    const now = A.taipei(), done = d => d < now.ymd || (d === now.ymd && now.mins >= 14 * 60);
    let failed = [];
    try {
      let ix = new Map();
      try { ix = await indexDays(); } catch (e) { failed.push("加權指數"); }
      const P = pmLog();
      P.forEach(x => {
        const ds = x.day.replace(/-/g, ""), d = ix.get(ds); if (!d || !done(ds) || !(d.prev > 0)) return;
        if (d.o > 0) { x.openGap = d.o - d.prev; x.openOk = openHit(x.call, x.openGap); }
        if (x.close) { x.chg = d.c - d.prev; x.closeOk = closeHit(x.close, x.chg, d.prev); }
      });
      A.store.set("twlog-pm", P);
      const pending = aiLog().filter(x => HORIZON.some(h => !x.res || !x.res[h])), codes = [...new Set(pending.map(x => x.code))], got = new Map();
      for (let i = 0; i < codes.length; i++) {
        say(`讀取日線 ${i + 1}/${codes.length}（${nameOf(codes[i])}）…`);
        const oldest = Math.min(...pending.filter(x => x.code === codes[i]).map(x => x.at));
        const months = Math.min(13, Math.ceil((Date.now() - oldest) / (30 * 864e5)) + 2);
        try { const cs = await TWLab.bars(codes[i], months); if (cs.length) got.set(codes[i], cs.filter(c => done(c[0]))); else failed.push(codes[i]); } catch (e) { failed.push(codes[i]); }
      }
      const L = aiLog();                           /* read again: a new analysis may have been added meanwhile */
      L.forEach(x => {
        const cs = got.get(x.code); if (!cs || !(x.price > 0)) return;
        const k = cs.findIndex(c => c[0] === x.day); if (k < 0) return;
        x.res = x.res || {};
        HORIZON.forEach(h => {
          const c = cs[k + h]; if (!c || x.res[h]) return;
          const base = ix.get(x.day), end = ix.get(c[0]);
          /* a move too large for the daily limit means a split or a capital change: leave it out of the figures */
          const step = cs.slice(k + 1, k + h + 1).some((b, i) => Math.abs(b[4] / cs[k + i][4] - 1) > 0.11);
          const ret = (c[4] / x.price - 1) * 100, mkt = base && end ? (end.c / base.c - 1) * 100 : null;
          x.res[h] = step ? { skip: true } : { ret, mkt };
        });
      });
      A.store.set("twlog-ai", L);
      paintLog();
      say(failed.length ? `部分資料讀不到：${failed.join("、")}。` : "已更新。");
    } finally { checking = false; const b = $("[data-check]", el); if (b) b.disabled = false; }
  }
  const mark = v => (v == null ? "—" : v ? "✓ 命中" : "✗ 沒中");
  function buildLog() {
    pane("dpLog").innerHTML = `
      <div class="dcard"><div class="aihead"><div><h3>紀錄回顧</h3></div><button type="button" class="aigo" data-check>更新對照結果</button></div>
        <p class="sub">紀錄只存在這個瀏覽器，從開始使用這項功能起累積。個股分析要在本站看過才會記下。</p><p class="sub logmsg" role="status"></p></div>
      <div class="lgrid2"><div class="dcard"><h3>AI 個股分析命中率</h3><div class="logsum"></div></div><div class="dcard"><h3>盤前預測命中率</h3><div class="logpmsum"></div></div></div>
      <div class="dcard"><h3>AI 個股分析紀錄</h3><div class="logai"></div></div>
      <div class="dcard"><h3>盤前預測紀錄</h3><div class="logpm"></div></div>`;
    pane("dpLog").addEventListener("click", e => {
      if (e.target.closest("[data-check]")) return checkLog();
      const o = e.target.closest("[data-open]"); if (o) return A.openStock(o.dataset.open);
      const d = e.target.closest("[data-logdrop]"); if (d) { A.store.set("twlog-ai", aiLog().filter(x => x.code + ":" + x.at !== d.dataset.logdrop)); paintLog(); }
    });
  }
  const side = s => (/多/.test(s) ? 1 : /空/.test(s) ? -1 : 0);
  function paintLog() {
    const el = pane("dpLog"), L = aiLog(), P = pmLog();
    const sum = HORIZON.map(h => {
      const done = L.filter(x => x.res && x.res[h] && !x.res[h].skip), calls = done.filter(x => side(x.stance)), hit = calls.filter(x => x.res[h].ret * side(x.stance) > 0).length;
      const vs = calls.filter(x => x.res[h].mkt != null), beat = vs.filter(x => (x.res[h].ret - x.res[h].mkt) * side(x.stance) > 0).length;
      const avg = s => { const a = done.filter(x => side(x.stance) === s); return a.length ? `${A.pct(mean(a.map(x => x.res[h].ret)))}（${a.length}）` : "—"; };
      return `<tr><td class="l">${h} 個交易日後</td><td>${calls.length ? `${A.fmt(hit / calls.length * 100, 0)}%（${hit}/${calls.length}）` : "—"}</td><td>${vs.length ? `${A.fmt(beat / vs.length * 100, 0)}%（${beat}/${vs.length}）` : "—"}</td><td>${avg(1)}</td><td>${avg(-1)}</td></tr>`;
    });
    $(".logsum", el).innerHTML = table(["期間", "方向命中", "贏過大盤方向", "偏多平均報酬", "偏空平均報酬"], sum) +
      msg("只算偏多與偏空的判斷。偏多後上漲、偏空後下跌算命中；括號是筆數，少於 20 筆看不出什麼。報酬從分析當時的價格算，未含股利。");
    const pct = key => { const a = P.filter(x => typeof x[key] === "boolean"), h = a.filter(x => x[key]).length; return a.length ? `${A.fmt(h / a.length * 100, 0)}%（${h}/${a.length}）` : "還沒有可對照的紀錄"; };
    $(".logpmsum", el).innerHTML = row("09:00 開盤方向", pct("openOk")) + row("13:30 收盤紅黑", pct("closeOk")) + msg("開高：跳空超過 +20 點；開低：低於 −20 點；平盤：±60 點內（和開盤通知相同）。收盤平盤指漲跌 0.2% 以內。");
    $(".logai", el).innerHTML = L.length ? table(["分析時間", "股票", "判斷", "當時價格", "5 日", "10 日", "20 日", ""], L.map(x => `<tr><td class="l">${twTime(x.at)}</td><td><button type="button" class="chip" data-open="${A.esc(x.code)}">${A.esc(x.name)} ${A.esc(x.code)}</button></td><td title="${A.esc(x.headline)}">${A.esc(x.stance || "—")}${x.action ? "・" + A.esc(x.action) : ""}</td><td>${A.fmt(x.price, A.dig(x.price))}</td>${HORIZON.map(h => { const r = x.res && x.res[h]; return !r ? "<td>—</td>" : r.skip ? "<td>價格不連續</td>" : `<td class="${A.tone(r.ret)}">${A.pct(r.ret)}</td>`; }).join("")}<td><button type="button" class="lx" data-logdrop="${A.esc(x.code + ":" + x.at)}" aria-label="刪除這筆紀錄">×</button></td></tr>`)) : msg("還沒有紀錄。到「個股分析」跑一次 AI 分析就會出現在這裡。");
    $(".logpm", el).innerHTML = P.length ? table(["日期", "開盤預測", "實際跳空", "開盤結果", "收盤預測", "實際漲跌", "收盤結果"], P.slice(0, 60).map(x => `<tr><td class="l">${A.esc(x.day)}</td><td>${A.esc(x.call)}</td><td>${ok(x.openGap) ? A.signed(x.openGap, 0) + " 點" : "—"}</td><td>${mark(x.openOk)}</td><td>${A.esc(x.close || "—")}</td><td>${ok(x.chg) ? A.signed(x.chg, 0) + " 點" : "—"}</td><td>${mark(x.closeOk)}</td></tr>`)) : msg("還沒有紀錄。開過「盤前分析」頁後會記下。");
  }

  /* ================= 設定 ================= */
  /* what a backup holds: the user's own records and choices, not the cached market data */
  const KEEP = /^(twstock-(device|theme)|twtrade-|twlab-|twmain-|twlines:|twrecent$|twscan-|twalert-|twsim$|twlog-|twcmp-|twbt-)/;
  const ownKeys = () => { const out = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (KEEP.test(k)) out.push(k); } return out; };
  const TG = [["stock", "自選與持股 ±5%、漲跌停"], ["index", "大盤與台指期夜盤大漲跌"], ["news", "AI 篩選的重大新聞與公告"], ["bell", "開盤與收盤通知"], ["notes", "盤前分析與收盤摘要"]];
  let dlg = null, pendingRestore = null, tgState = null;
  function backup() {
    const data = {}; ownKeys().forEach(k => { data[k] = localStorage.getItem(k); });
    const a = document.createElement("a"), day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: "twstock", version: 1, at: Date.now(), data }, null, 1)], { type: "application/json" })); a.download = `twstock-backup-${day}.json`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    A.store.set("twlab-backup-at", Date.now()); paintBackupNote();
  }
  function paintBackupNote() {
    if (!dlg) return;
    const at = A.store.get("twlab-backup-at", 0);
    $(".setlast", dlg).textContent = at ? `上次備份：${twTime(at)}` : "還沒有備份過。";
  }
  function readBackup(file) {
    const say = t => { $(".setmsg", dlg).textContent = t; }, go = $("[data-restore]", dlg);
    pendingRestore = null; go.hidden = true;
    if (!file) return;
    if (file.size > 5e6) return say("檔案太大，不像本站的備份。");
    const r = new FileReader();
    r.onload = () => {
      let j = null; try { j = JSON.parse(String(r.result)); } catch (e) {}
      const entries = j && j.app === "twstock" && j.data && typeof j.data === "object" ? Object.entries(j.data).filter(([k, v]) => KEEP.test(k) && typeof v === "string") : [];
      if (!entries.length) return say("這不是本站的備份檔。");
      pendingRestore = entries; go.hidden = false;
      say(`備份時間 ${ok(j.at) ? twTime(j.at) : "不明"}，共 ${entries.length} 項。按「確認還原」會取代這個瀏覽器目前的自選股、持股、交易紀錄與設定。`);
    };
    r.readAsText(file);
  }
  function restore() {
    if (!pendingRestore) return;
    const old = ownKeys().map(k => [k, localStorage.getItem(k)]);
    try {
      old.forEach(([k]) => localStorage.removeItem(k));
      pendingRestore.forEach(([k, v]) => localStorage.setItem(k, v));
    } catch (e) {                                   /* storage full: put back what was there */
      ownKeys().forEach(k => localStorage.removeItem(k)); old.forEach(([k, v]) => localStorage.setItem(k, v));
      $(".setmsg", dlg).textContent = "瀏覽器空間不足，沒有還原，原本的資料保持不變。"; return;
    }
    location.reload();
  }
  function paintTg() {
    if (!dlg) return;
    const S = tgState;
    $(".settg", dlg).textContent = !S ? "" : S.old ? "目前部署的 Worker 還是舊版，這些開關要部署新版後才生效。" : S.ok ? "已同步到 Worker。" : S.owner === false ? "只有擁有者裝置的設定會生效。" : "同步失敗。";
  }
  function openSettings() {
    if (dlg) return;
    const opt = A.store.get("twalert-opt", {}) || {}, pf = TWLab.prefs(), back = document.activeElement;
    dlg = document.createElement("div"); dlg.className = "pal setdlg"; dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-label", "設定");
    dlg.innerHTML = `<div class="pal-box"><div class="pal-in"><b>設定</b><button type="button" class="key-x" aria-label="關閉"><kbd>Esc</kbd></button></div>
      <div class="pal-list">
        <section><h4>資料備份</h4><p class="sub">自選股、持股、交易日誌、行事曆、模擬帳戶、提醒與回顧紀錄都只存在這個瀏覽器，清除瀏覽資料就會消失。備份檔含這些個人資料與這台裝置的警示識別碼，請自己保管。</p>
          <div class="lform"><button type="button" class="aigo" data-backup>下載備份</button><label class="btn lfile">選擇備份檔還原<input type="file" accept=".json,application/json" hidden></label><button type="button" class="btn" data-restore hidden>確認還原</button></div>
          <p class="sub setlast"></p><p class="sub setmsg" role="status"></p></section>
        <section><h4>Telegram 通知</h4>${TG.map(([k, t]) => `<label class="lcheck"><input type="checkbox" data-tg="${k}" ${opt[k] === false ? "" : "checked"}><span>${t}</span></label>`).join("")}
          <p class="sub">你自己設的到價提醒一律通知。</p><p class="sub settg" role="status"></p></section>
        <section><h4>交易成本（持股、日誌、回測、模擬交易共用）</h4>
          <div class="lform">${[["fee", "手續費率 %", pf.fee], ["disc", "手續費折數（6 折填 0.6）", pf.disc], ["minFee", "最低手續費（元）", pf.minFee], ["slip", "回測滑價 %", pf.slip]].map(([k, t, v]) => `<label>${t}<input class="in" data-cost="${k}" inputmode="decimal" value="${v}"></label>`).join("")}</div>
          <p class="sub setcost" role="status"></p></section>
      </div></div>`;
    document.body.appendChild(dlg);
    const close = () => { if (!dlg) return; dlg.remove(); dlg = null; pendingRestore = null; document.removeEventListener("keydown", onKey, true); back && back.focus && back.focus(); };
    /* while the panel is open it keeps the keyboard: the page's own shortcuts must not switch tabs behind it */
    const onKey = e => {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); return close(); }
      if (e.key !== "Tab") return;
      const f = $$('button:not([hidden]), input:not([type="file"])', dlg), i = f.indexOf(document.activeElement);
      if (e.shiftKey ? i <= 0 : i === f.length - 1 || i < 0) { e.preventDefault(); (e.shiftKey ? f[f.length - 1] : f[0]).focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    dlg.addEventListener("pointerdown", e => { if (e.target === dlg) close(); });
    dlg.addEventListener("click", e => {
      if (e.target.closest(".key-x")) return close();
      if (e.target.closest("[data-backup]")) return backup();
      if (e.target.closest("[data-restore]")) return restore();
    });
    dlg.addEventListener("change", e => {
      const t = e.target;
      if (t.type === "file") return readBackup(t.files && t.files[0]);
      if (t.dataset.tg) { const o = A.store.get("twalert-opt", {}) || {}; o[t.dataset.tg] = t.checked; A.store.set("twalert-opt", o); tgState = null; $(".settg", dlg).textContent = "同步中…"; document.dispatchEvent(new Event("twalert:change")); }
      if (t.dataset.cost) {
        const v = parseFloat(t.value), k = t.dataset.cost, max = { fee: 1, disc: 1, minFee: 1000, slip: 5 }[k];
        if (!(v >= 0 && v <= max)) { $(".setcost", dlg).textContent = `請填 0 到 ${max} 之間的數字。`; return; }
        A.store.set("twlab-pref", Object.assign(A.store.get("twlab-pref", {}), { [k]: v })); $(".setcost", dlg).textContent = "已儲存。";
      }
    });
    paintBackupNote(); paintTg(); $(".key-x", dlg).focus();
  }
  function buildSettingsButton() {
    const b = document.createElement("button");
    b.type = "button"; b.className = "setbtn"; b.setAttribute("aria-label", "設定與備份"); b.title = "設定與備份";
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9L7 7M17 17l2.100 2.100M2 12h3M19 12h3M4.900 19.100L7 17M17 7l2.100-2.100"/><circle cx="12" cy="12" r="7"/></svg>`;
    b.addEventListener("click", openSettings);
    /* the top bar is made by twui.js, the last script on the page: wait until every script has run */
    const place = () => { const bar = document.querySelector(".topbar .tb-right"); if (bar) bar.appendChild(b); else { b.classList.add("float"); document.body.appendChild(b); } };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", place, { once: true }); else place();
  }

  /* ---------------- start ---------------- */
  const SHOW = { dpCmp: () => runCmp(), dpSim: () => { paintSim(); paintQuote(); }, dpLog: () => paintLog() };
  document.addEventListener("twdash:ready", () => {
    A = window.TWDash && window.TWDash.api; if (!A || !pane("dpCmp")) return;
    document.body.insertAdjacentHTML("beforeend", `<datalist id="twstocks"></datalist>`);
    buildCmp(); buildBt(); buildSim(); buildLog(); buildSettingsButton();
  });
  document.addEventListener("twdash:tab", e => { cur = e.detail; if (A && SHOW[cur]) SHOW[cur](); });
  document.addEventListener("twdash:list", () => {
    if (!A) return;
    const old = document.getElementById("twstocks"); if (old) old.outerHTML = stockOptions();
    if (SHOW[cur]) SHOW[cur]();
    /* today's note is read even when the 盤前分析 tab is never opened, so the record has no gaps on days the site is visited */
    A.J(`${A.WORKER}/tw/premarket`).then(recordPM, () => {});
  });
  document.addEventListener("twdash:live", () => { if (!A) return; if (cur === "dpSim") { paintSim(); paintQuote(); } if (cur === "dpCmp") paintCmpTable(); });
  document.addEventListener("twdash:ai", e => { if (A) recordAI(e.detail); });
  document.addEventListener("twdash:premarket", e => { if (A) recordPM(e.detail); });
  document.addEventListener("twdash:alertsync", e => { tgState = e.detail; paintTg(); });
})();
