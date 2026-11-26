/* TWstock 我的持股 and 行事曆, plus the research numbers the AI team reads.
   我的持股   持股風險: holdings (kept only in this browser), P&L at the latest price, concentration by stock and industry,
              correlation and beta against 0050 from daily bars, a market −20% stress test and three rebalancing plans.
              交易日誌: trades (kept only in this browser): win rate, payoff, profit factor, expectancy, streaks, hold time of
              winners vs losers, trades without a stop or against the plan, and rules derived only from the record.
   行事曆     ex-dividend dates (TWSE) and the monthly revenue deadline for the followed and held stocks, then the user's own
              events with source and the hypothesis to check, a weekly checklist, fact and guess kept apart.
   研究資料   technical scenarios, 10,000 bootstrap replays and four backtests for one stock, computed without any screen
              and sent along with the AI analysis (window.TWLab.research).
   Nothing here places orders or promises a result. */
(function () {
  "use strict";
  let A = null;                                       /* twmain's shared helpers, set on twdash:ready */
  let ROOT = null;                                    /* the panel being drawn or clicked: 我的持股 or 行事曆 */
  const pane = id => document.getElementById(id);
  const $ = (s, r = ROOT) => r.querySelector(s);
  const $$ = (s, r = ROOT) => Array.from(r.querySelectorAll(s));
  const ok = Number.isFinite;
  const r2 = v => (ok(v) ? Math.round(v * 100) / 100 : null);
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const today = () => { const d = new Date(Date.now() + 8 * 3600e3); return d.toISOString().slice(0, 10); };
  const dayNum = s => Date.parse(String(s).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3") + "T00:00:00Z") / 864e5;
  const iso = ds => ds.slice(0, 4) + "-" + ds.slice(4, 6) + "-" + ds.slice(6);
  const K = { hold: "twlab-hold", cash: "twlab-cash", pref: "twlab-pref", trades: "twlab-trades", events: "twlab-events", view: "twlab-view", check: "twlab-check" };
  const get = (k, d) => A.store.get(k, d), set = (k, v) => { A.store.set(k, v); if (k === K.hold) document.dispatchEvent(new Event("twlab:hold")); };

  /* ---------------- shared data ---------------- */
  const IND_NAME = { "01": "水泥", "02": "食品", "03": "塑膠", "04": "紡織纖維", "05": "電機機械", "06": "電器電纜", "08": "玻璃陶瓷", "09": "造紙", "10": "鋼鐵", "11": "橡膠", "12": "汽車", "14": "建材營造", "15": "航運", "16": "觀光餐旅", "17": "金融保險", "18": "貿易百貨", "19": "綜合", "20": "其他", "21": "化學", "22": "生技醫療", "23": "油電燃氣", "24": "半導體", "25": "電腦及週邊", "26": "光電", "27": "通信網路", "28": "電子零組件", "29": "電子通路", "30": "資訊服務", "31": "其他電子", "35": "綠能環保", "36": "數位雲端", "37": "運動休閒", "38": "居家生活" };
  /* the industry codes come with otc.json (see twmain.js) */
  const industryOf = (code, manual) => manual || (/^00/.test(code) ? "ETF" : IND_NAME[A.industryCode(code)] || "未知");
  const nameOf = code => { const s = A.DB.by.get(code); return s ? s.name : code; };
  const priceOf = h => (ok(h.px) && h.px > 0 ? h.px : (A.DB.by.get(h.code) || {}).price);

  /* daily bars for `months` months, finished months cached by twmain; spaced out so TWSE does not refuse us */
  const BARS = new Map();
  async function bars(code, months, onStep) {
    const key = code + ":" + months, hit = BARS.get(key);
    if (hit) return hit;
    if (!A.DB.live) { const cs = await A.loadHist(code); return cs || []; }
    const ms = A.monthsBack(months);
    let out = [];
    for (let i = ms.length - 1; i >= 0; i--) {
      const cached = i > 0 && A.store.get(`twh:${code}:${ms[i]}`, null);
      if (!cached) await A.wait(650);
      try { out = out.concat(await A.histMonth(code, ms[i], i > 0)); } catch (e) { /* skip a month TWSE refused */ }
      onStep && onStep(ms.length - i, ms.length);
    }
    out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    out = out.filter((c, i) => !i || c[0] !== out[i - 1][0]);
    if (out.length) BARS.set(key, out);
    return out;
  }

  /* ---------------- small drawing helpers (figures draw themselves when shown) ---------------- */
  function drawIn(scope) {
    const root = scope || ROOT; if (!root || !root.closest(".dpanel.on")) return;
    $$(".lbar i", root).forEach((b, i) => b.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 600, delay: 120 + i * 50, easing: "cubic-bezier(.2,.9,.3,1)", fill: "backwards" }));
    $$(".lheat td[data-v]", root).forEach((c, i) => c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 100 + i * 25, fill: "backwards" }));
    A.rise($$(".lrise", root), 50, 60);
  }
  const io = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); drawIn(e.target); } }), { threshold: 0.2 }) : null;
  function watchIn(root) { if (!root) return; if (io) $$(".lfig", root).forEach(f => io.observe(f)); else drawIn(root); }
  const bar = (v, max, cls) => `<span class="lbar"><i class="${cls || ""}" style="width:${Math.max(0, Math.min(100, max ? v / max * 100 : 0)).toFixed(1)}%"></i></span>`;
  const kv = (k, v, t) => `<div class="snap lrise"><span>${k}</span><b class="${t || ""}">${v}</b></div>`;
  const note = t => "";   /* explanations are not shown (the user asked for none) */
  const csvCell = v => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function download(name, text) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function parseCSV(text) {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim()));
  }

  /* ---------------- costs (Taiwan cash equities) ---------------- */
  function prefs() { return Object.assign({ fee: 0.1425, disc: 1, minFee: 20, slip: 0.1, tol: 20 }, get(K.pref, {})); }
  const taxOf = code => (/^00/.test(code) ? 0.1 : 0.3);

  /* ================= 持股風險 ================= */
  function viewHold() {
    const H = get(K.hold, []), cash = +get(K.cash, 0) || 0, P = prefs();
    return `
      <div class="dcard lrise"><h3>我的持股（只存在這台裝置的瀏覽器，不上傳）</h3>
        <div class="lform lhform">
          <input class="in" name="code" placeholder="代號 2330" inputmode="numeric" aria-label="代號">
          <input class="in" name="shares" placeholder="股數（1 張 = 1000）" inputmode="numeric" aria-label="股數">
          <input class="in" name="cost" placeholder="總成本（含手續費，元）" inputmode="decimal" aria-label="總成本">
          <input class="in" name="px" placeholder="現價（選填，查不到才填）" inputmode="decimal" aria-label="手動現價">
          <input class="in" name="ind" placeholder="產業（選填）" aria-label="產業">
          <button type="button" class="aigo" data-act="hadd">加入／更新</button>
        </div>
        <div class="lform lhform2">
          <label>現金 <input class="in" name="cash" inputmode="decimal" value="${cash || ""}" placeholder="0"></label>
          <label>可承受損失 % <input class="in" name="tol" inputmode="decimal" value="${P.tol}"></label>
          <label>單檔上限 % <input class="in" name="cap" inputmode="decimal" value="${get(K.pref, {}).cap || 25}"></label>
          <button type="button" class="btn" data-act="hcsv">匯出 CSV</button>
          <label class="btn lfile">匯入 CSV<input type="file" accept=".csv,text/csv" data-act="hin" hidden></label>
        </div>
        <div class="lhtable">${H.length ? "" : note("還沒有持股。輸入代號、股數與總成本（券商庫存的「總成本」或付出的金額）。")}</div>
      </div>
      <div class="lgrid2">
        <div class="dcard lrise"><h3>集中度</h3><div class="lconc">${note("加入持股後顯示。")}</div></div>
        <div class="dcard lrise"><h3>產業分布</h3><div class="lind">${note("加入持股後顯示。")}</div></div>
      </div>
      <div class="dcard lrise"><div class="lhead"><div><h3>相關性、β 與壓力測試</h3></div>
        <button type="button" class="aigo" data-act="hrisk" ${H.length ? "" : "disabled"}>計算</button></div>
        <p class="sub lmsg"></p><div class="lrisk"></div></div>
      <div class="dcard lrise"><div class="lhead"><div><h3>資產走勢與大盤比較</h3></div>
        <button type="button" class="aigo" data-act="hcurve" ${H.length ? "" : "disabled"}>畫出走勢</button></div>
        <p class="sub lcmsg" role="status"></p><div class="lcurve"></div></div>
      <div class="dcard lrise"><div class="lhead"><div><h3>今年股利收入（估算）</h3></div>
        <button type="button" class="aigo" data-act="hdiv" ${H.length ? "" : "disabled"}>計算</button></div>
        <p class="sub ldmsg" role="status"></p><div class="ldiv"></div></div>
      <div class="dcard lrise"><h3>部位試算（做多）</h3>
        <div class="lform lsize">
          <label>代號（選填）<input class="in" name="zcode" inputmode="numeric"></label>
          <label>進場價 <input class="in" name="zin" inputmode="decimal"></label>
          <label>停損價 <input class="in" name="zstop" inputmode="decimal"></label>
          <label>總資金（元）<input class="in" name="zcap" inputmode="decimal" value="${Math.round(holdRows().total) || ""}"></label>
          <label>單筆最多虧總資金 % <input class="in" name="zrisk" inputmode="decimal" value="${get(K.pref, {}).risk || 1}"></label>
        </div>
        <div class="lsizeout"><p class="sub">填入進場價、停損價與總資金。</p></div></div>`;
  }

  /* ---- what today's holdings would have done over six months, next to 0050 (not the account's real history) ---- */
  async function holdCurve() {
    const root = ROOT, q = s => root.querySelector(s), msg = q(".lcmsg"), { rows, cash } = holdRows();
    const live = rows.filter(r => ok(r.mv));
    if (!live.length) { msg.textContent = "沒有可計算市值的持股。"; return; }
    const codes = [...new Set(live.map(r => r.code).concat(["0050"]))], series = new Map();
    for (let i = 0; i < codes.length; i++) {
      msg.textContent = `讀取日線 ${i + 1}/${codes.length}（${nameOf(codes[i])}）… 第一次會比較久，之後有快取。`;
      series.set(codes[i], await bars(codes[i], 7));
    }
    if (!root.querySelector(".lcurve")) return;
    const used = live.filter(r => (series.get(r.code) || []).length > 20), left = live.filter(r => !used.includes(r));
    const bench = series.get("0050") || [];
    if (!used.length || bench.length < 20) { msg.textContent = "日線不足，暫時畫不出來。"; return; }
    /* from the first day every used holding and 0050 have a price; a day without a trade keeps the last close */
    const start = used.map(r => series.get(r.code)[0][0]).concat([bench[0][0]]).sort().pop();
    const maps = used.map(r => new Map(series.get(r.code).map(c => [c[0], c[4]]))), last = used.map(() => NaN);
    used.forEach((r, i) => series.get(r.code).forEach(c => { if (c[0] <= start) last[i] = c[4]; }));
    const days = bench.filter(c => c[0] >= start);
    const value = days.map(c => cash + used.reduce((a, r, i) => { const px = maps[i].get(c[0]); if (ok(px)) last[i] = px; return a + last[i] * r.shares; }, 0));
    const mine = days.map((c, i) => [c[0], (value[i] / value[0] - 1) * 100]), mkt = days.map(c => [c[0], (c[4] / days[0][4] - 1) * 100]);
    const gap = mine[mine.length - 1][1] - mkt[mkt.length - 1][1];
    q(".lcurve").innerHTML = `<div class="lcchart"></div>${kv("目前持股組合", A.pct(mine[mine.length - 1][1]), A.tone(mine[mine.length - 1][1]))}${kv("0050", A.pct(mkt[mkt.length - 1][1]), A.tone(mkt[mkt.length - 1][1]))}${kv("差距（百分點）", A.signed(gap, 2), A.tone(gap))}`;
    window.TWData.lineChart(q(".lcchart"), [{ name: "目前持股組合", pts: mine }, { name: "0050", pts: mkt }], { label: "目前持股回推與 0050 的漲跌幅", fmt: v => A.fmt(v, 1) + "%" });
    msg.textContent = `假設從 ${iso(start)} 起就持有現在的股數與現金。這是回推，不是你帳戶的實際績效；未含股利與交易成本，價格未還原分割。` + (left.length ? `日線不足未計入：${left.map(r => r.name).join("、")}。` : "");
  }

  /* ---- this year's cash dividends on today's share counts: TWSE results so far, plus the announced notice ---- */
  async function holdDividends() {
    const root = ROOT, q = s => root.querySelector(s), msg = q(".ldmsg"), H = get(K.hold, []);
    if (!A.DB.live) { msg.textContent = "目前是示意資料，無法計算。"; return; }
    msg.textContent = "讀取除權息資料…";
    const t = today(), now = t.replace(/-/g, "");
    let past, next;
    try { [past, next] = await Promise.all([window.TWData.dividends(now.slice(0, 4) + "0101", now), loadExDiv()]); }
    catch (e) { msg.textContent = "除權息資料暫時讀不到，請稍後再試。"; return; }
    if (!root.querySelector(".ldiv")) return;
    const list = [];
    H.forEach(h => {
      past.filter(r => r.code === h.code).forEach(r => list.push({ code: h.code, date: iso(r.date), per: r.kind === "息" ? r.value : NaN, kind: r.kind, shares: h.shares, done: true }));
      next.filter(r => r.code === h.code && r.date > t && r.date.slice(0, 4) === t.slice(0, 4)).forEach(r => { const m = r.info.match(/現金股利 ([\d.]+) 元/); list.push({ code: h.code, date: r.date, per: m ? +m[1] : NaN, kind: r.kind.replace("除", ""), shares: h.shares, done: false }); });
    });
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    const sum = done => list.filter(x => x.done === done && ok(x.per)).reduce((a, x) => a + x.per * x.shares, 0);
    const cost = H.reduce((a, h) => a + h.cost, 0), all = sum(true) + sum(false);
    q(".ldiv").innerHTML = list.length ? kv("已除息", A.fmt(Math.round(sum(true))) + " 元") + kv("已公告、尚未除息", A.fmt(Math.round(sum(false))) + " 元") + kv("合計占持股總成本", cost ? A.fmt(all / cost * 100, 2) + "%" : "—") +
      `<div class="ltblwrap"><table class="mtbl ltbl"><thead><tr><th class="l">商品</th><th>除權息日</th><th>狀態</th><th>每股現金</th><th>估計金額</th></tr></thead><tbody>${list.map(x => `<tr><td class="l nm"><b>${A.esc(nameOf(x.code))}</b><span>${A.esc(x.code)}</span></td><td>${x.date}</td><td>${x.done ? "已除" : "預告"}${x.kind === "息" ? "" : "・" + A.esc(x.kind)}</td><td>${ok(x.per) ? A.fmt(x.per, 2) : "未列入"}</td><td>${ok(x.per) ? A.fmt(Math.round(x.per * x.shares)) : "—"}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="sub">持股今年沒有查到除權息。</p>`;
    msg.textContent = "用目前股數估算，不是實際入帳金額：除息日之後才買的也會算進去。只含上市證券，未扣所得稅、健保補充費與匯費；除權或權息混合的場次不列金額。";
  }

  /* ---- how many shares fit a stop: the loss at the stop, fees and tax included, stays inside the chosen share of capital ---- */
  function sizePosition() {
    const out = $(".lsizeout"), v = n => parseFloat($(`[name="${n}"]`).value), code = $('[name="zcode"]').value.trim();
    const entry = v("zin"), stop = v("zstop"), capital = v("zcap"), risk = v("zrisk"), P = prefs();
    if (!(entry > 0 && stop > 0 && capital > 0 && risk > 0)) { out.innerHTML = `<p class="sub">填入進場價、停損價與總資金。</p>`; return; }
    if (stop >= entry) { out.innerHTML = `<p class="sub warn">停損價要低於進場價。</p>`; return; }
    if (risk <= 100) set(K.pref, Object.assign(get(K.pref, {}), { risk }));
    const fee = x => Math.max(P.minFee, Math.round(x * P.fee / 100 * P.disc)), tax = taxOf(code) / 100;
    const lossAt = n => (n ? n * entry + fee(n * entry) - (n * stop - fee(n * stop) - Math.round(n * stop * tax)) : 0);
    const budget = capital * risk / 100;
    let lo = 0, hi = Math.floor(capital / entry);                  /* the most shares both the loss budget and the cash allow */
    while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (lossAt(m) <= budget && m * entry + fee(m * entry) <= capital) lo = m; else hi = m - 1; }
    const n = lo, value = n * entry;
    out.innerHTML = n ? kv("最多可買", `${A.fmt(n)} 股（${A.fmt(Math.floor(n / 1000))} 張＋${A.fmt(n % 1000)} 股零股）`) + kv("投入金額（含手續費）", A.fmt(Math.round(value + fee(value))) + " 元") + kv("占總資金", A.fmt(value / capital * 100, 1) + "%", value / capital * 100 > (+get(K.pref, {}).cap || 25) ? "down" : "") +
      kv("停損時虧損（含費稅）", A.fmt(Math.round(lossAt(n))) + " 元") + kv("停損距離", A.fmt((entry - stop) / entry * 100, 2) + "%") + kv("2 倍風險的目標價", A.fmt(entry + 2 * (entry - stop), A.dig(entry))) +
      `<p class="sub">跳空跌破停損價時，實際虧損會更大。證交稅率 ${taxOf(code)}%。</p>` : `<p class="sub warn">這個虧損上限連 1 股都買不了。</p>`;
  }
  function holdRows() {
    const H = get(K.hold, []), cash = +get(K.cash, 0) || 0;
    const rows = H.map(h => { const px = priceOf(h), mv = ok(px) ? px * h.shares : NaN; return Object.assign({}, h, { manualPx: h.px, name: nameOf(h.code), px, mv, pnl: mv - h.cost, ret: (mv / h.cost - 1) * 100, ind: industryOf(h.code, h.ind) }); });
    const total = rows.reduce((a, r) => a + (ok(r.mv) ? r.mv : 0), 0) + cash;
    rows.forEach(r => { r.w = total ? r.mv / total * 100 : NaN; });
    return { rows, cash, total };
  }
  function paintHold(quiet) {
    if (holdView() !== "hold") return;
    ROOT = pane("dpHold");
    const el = $(".lhtable"); if (!el) return;
    const { rows, cash, total } = holdRows();
    if (!rows.length) return;
    const cost = rows.reduce((a, r) => a + r.cost, 0), mv = rows.reduce((a, r) => a + (ok(r.mv) ? r.mv : 0), 0), F = A.fmt;
    el.innerHTML = `<div class="ltblwrap"><table class="mtbl ltbl"><thead><tr><th class="l">商品</th><th>股數</th><th>現價</th><th>市值</th><th>成本</th><th>損益</th><th>報酬率</th><th>權重</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr class="lrise"><td class="l nm"><b>${A.esc(r.name)}</b><span>${A.esc(r.code)}・${A.esc(r.ind)}${!ok(r.px) ? "・查無價格" : ok(r.manualPx) && r.manualPx > 0 ? "・手動價" : ""}</span></td>
        <td>${F(r.shares)}</td><td>${ok(r.px) ? F(r.px, A.dig(r.px)) : "—"}</td><td>${F(r.mv)}</td><td>${F(r.cost)}</td><td class="${A.tone(r.pnl)}">${A.signed(r.pnl, 0)}</td><td class="${A.tone(r.ret)}">${A.pct(r.ret)}</td><td>${ok(r.w) ? F(r.w, 1) + "%" : "—"}</td>
        <td><button type="button" class="lx" data-act="hdel" data-code="${A.esc(r.code)}" aria-label="刪除 ${A.esc(r.name)}">×</button></td></tr>`).join("")}
      </tbody><tfoot><tr><td class="l">合計（含現金 ${F(cash)}）</td><td></td><td></td><td>${F(mv)}</td><td>${F(cost)}</td><td class="${A.tone(mv - cost)}">${A.signed(mv - cost, 0)}</td><td class="${A.tone(mv - cost)}">${A.pct((mv / cost - 1) * 100)}</td><td>${F(total)}</td><td></td></tr></tfoot></table></div>
      ${note("股價用證交所最新收盤（盤中為即時價）。興櫃股票在這裡查不到價格，請在「現價」欄手動填。損益未扣賣出時的手續費與證交稅。")}`;
    /* concentration */
    const ws = rows.filter(r => ok(r.w)).map(r => r.w / 100).concat(total ? [cash / total] : []);
    const hhi = rows.filter(r => ok(r.w)).reduce((a, r) => a + (r.w / 100) ** 2, 0), top = rows.filter(r => ok(r.w)).sort((a, b) => b.w - a.w);
    const cap = +(get(K.pref, {}).cap || 25), over = top.filter(r => r.w > cap);
    const losers = rows.filter(r => r.ret <= -30);
    $(".lconc").innerHTML = kv("最大單一持股", top[0] ? `${A.esc(top[0].name)} ${A.fmt(top[0].w, 1)}%` : "—", top[0] && top[0].w > cap ? "down" : "") +
      kv("前三大合計", A.fmt(top.slice(0, 3).reduce((a, r) => a + r.w, 0), 1) + "%") +
      kv("有效持股數（1/HHI）", hhi ? A.fmt(1 / hhi, 1) + " 檔" : "—") + kv("現金比例", total ? A.fmt(cash / total * 100, 1) + "%" : "—") +
      kv("超過單檔上限 " + cap + "%", over.length ? over.map(r => A.esc(r.name)).join("、") : "無", over.length ? "down" : "") +
      kv("虧損超過 30% 的持股", losers.length ? losers.map(r => `${A.esc(r.name)} ${A.pct(r.ret)}`).join("、") : "無", losers.length ? "down" : "") +
      (losers.length ? note("虧損很深的持股，值得回到交易日誌檢查：當初的停損條件是什麼？論點是否已經失效？這是檢查清單，不是賣出建議。") : "");
    const by = new Map(); rows.forEach(r => { if (ok(r.w)) by.set(r.ind, (by.get(r.ind) || 0) + r.w); });
    if (total && cash) by.set("現金", cash / total * 100);
    const list = [...by].sort((a, b) => b[1] - a[1]), mx = list.length ? list[0][1] : 1;
    $(".lind").innerHTML = `<div class="lfig">${list.map(([k, v]) => `<div class="lbrow lrise"><span>${A.esc(k)}</span>${bar(v, mx, k === "現金" ? "cash" : "")}<b>${A.fmt(v, 1)}%</b></div>`).join("")}</div>` +
      (list[0] && list[0][0] !== "現金" && list[0][1] > 40 ? note(`「${A.esc(list[0][0])}」占 ${A.fmt(list[0][1], 0)}%：同產業的股票常一起漲跌，分散效果比檔數看起來小。`) : "");
    if (!quiet) watchIn(ROOT);
  }
  async function holdRisk() {
    const msg = $(".lmsg"), out = $(".lrisk"), { rows, cash, total } = holdRows(), P = prefs();
    const live = rows.filter(r => ok(r.mv));
    if (!live.length) { msg.textContent = "沒有可計算市值的持股。"; return; }
    const codes = [...new Set(live.map(r => r.code).concat(["0050"]))], series = new Map();
    for (let i = 0; i < codes.length; i++) {
      msg.textContent = `讀取日線 ${i + 1}/${codes.length}（${nameOf(codes[i])}）… 第一次會比較久，之後有快取。`;
      series.set(codes[i], await bars(codes[i], 6));
    }
    const rets = code => { const cs = series.get(code) || [], m = new Map(); for (let i = 1; i < cs.length; i++) m.set(cs[i][0], cs[i][4] / cs[i - 1][4] - 1); return m; };
    const R = new Map(codes.map(c => [c, rets(c)])), mk = R.get("0050");
    const pair = (a, b) => { const x = [], y = []; a.forEach((v, d) => { if (b.has(d)) { x.push(v); y.push(b.get(d)); } }); return [x, y]; };
    const corr = (a, b) => { const [x, y] = pair(a, b); if (x.length < 20) return NaN; const mx = mean(x), my = mean(y); let c = 0, vx = 0, vy = 0; x.forEach((v, i) => { c += (v - mx) * (y[i] - my); vx += (v - mx) ** 2; vy += (y[i] - my) ** 2; }); return c / Math.sqrt(vx * vy); };
    const beta = a => { const [x, y] = pair(a, mk); if (x.length < 20) return NaN; const mm = mean(y), ma = mean(x); let c = 0, v = 0; x.forEach((r, i) => { c += (r - ma) * (y[i] - mm); v += (y[i] - mm) ** 2; }); return c / v; };
    const vol = a => sd([...a.values()]) * Math.sqrt(250) * 100;
    live.forEach(r => { r.beta = beta(R.get(r.code)); r.vol = vol(R.get(r.code)); });
    const shock = -0.2, tolAmt = total * P.tol / 100;
    const loss = (rs, ex) => rs.reduce((a, r) => a + r.mv * (ex ? Math.min(1, Math.max(-1, (ok(r.beta) ? Math.max(r.beta, 0.5) : 1) * shock)) : shock), 0);
    const portBeta = live.reduce((a, r) => a + (ok(r.beta) ? r.beta : 1) * r.mv, 0) / total;
    /* plans: as is / cap each holding / scale every holding down until the β-stress loss fits the tolerated loss */
    const cap = +(get(K.pref, {}).cap || 25) / 100, costRate = r => (P.fee * P.disc + taxOf(r.code)) / 100;
    const planCap = live.map(r => Object.assign({}, r, { mv: Math.min(r.mv, total * cap) }));
    const l0 = -loss(live, true), f = l0 > tolAmt && l0 ? tolAmt / l0 : 1, planTol = live.map(r => Object.assign({}, r, { mv: r.mv * f }));
    const plan = (name, rs, why) => { const sold = live.reduce((a, r, i) => a + (r.mv - rs[i].mv) * costRate(r), 0), invested = rs.reduce((a, r) => a + r.mv, 0), sl = -loss(rs, true);
      return `<tr class="lrise"><td class="l"><b>${name}</b><span class="sub"> ${why}</span></td><td>${A.fmt((total - invested) / total * 100, 1)}%</td><td>${A.fmt(Math.max(...rs.map(r => r.mv)) / total * 100, 1)}%</td><td class="down">−${A.fmt(sl)}</td><td>${A.fmt(sl / total * 100, 1)}%</td><td>${A.fmt(sold)}</td></tr>`; };
    const hm = live.map(r => r.code);
    out.innerHTML = `
      <div class="ltblwrap"><table class="mtbl ltbl"><thead><tr><th class="l">商品</th><th>β（對 0050）</th><th>年化波動</th><th>權重</th><th>跌 20%×β 損失</th></tr></thead><tbody>
      ${live.map(r => `<tr class="lrise"><td class="l nm"><b>${A.esc(r.name)}</b><span>${A.esc(r.code)}</span></td><td>${ok(r.beta) ? A.fmt(r.beta, 2) : "無法計算"}</td><td>${ok(r.vol) ? A.fmt(r.vol, 0) + "%" : "—"}</td><td>${A.fmt(r.w, 1)}%</td><td class="down">−${A.fmt(-r.mv * Math.max(-1, (ok(r.beta) ? Math.max(r.beta, 0.5) : 1) * shock))}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="lgrid2">
        <div>${kv("組合 β（現金 β=0）", A.fmt(portBeta, 2))}${kv("市場跌 20%，每檔同跌 20%", "−" + A.fmt(-loss(live, false)) + "（" + A.fmt(-loss(live, false) / total * 100, 1) + "%）", "down")}${kv("市場跌 20%，依 β 調整", "−" + A.fmt(l0) + "（" + A.fmt(l0 / total * 100, 1) + "%）", "down")}${kv("可承受損失 " + P.tol + "%", A.fmt(tolAmt) + (l0 > tolAmt ? "，壓力損失超過" : "，在範圍內"), l0 > tolAmt ? "down" : "up")}</div>
        <div class="lfig">${hm.length > 1 ? `<table class="lheat"><tr><th></th>${hm.map(c => `<th>${A.esc(c)}</th>`).join("")}</tr>${hm.map(a => `<tr><th>${A.esc(a)}</th>${hm.map(b => { const v = a === b ? 1 : corr(R.get(a), R.get(b)); return `<td data-v style="--a:${ok(v) ? Math.abs(v).toFixed(2) : 0}" class="${v < 0 ? "neg" : ""}">${ok(v) ? A.fmt(v, 2) : "—"}</td>`; }).join("")}</tr>`).join("")}</table>` : note("只有一檔，沒有相關性可算。")}</div>
      </div>
      <h3 class="lsub">再平衡方案比較（不保證避開虧損）</h3>
      <div class="ltblwrap"><table class="mtbl ltbl"><thead><tr><th class="l">方案</th><th>現金</th><th>最大單檔</th><th>壓力損失</th><th>占總資產</th><th>賣出成本</th></tr></thead><tbody>
        ${plan("A 維持現狀", live, "")}${plan("B 單檔上限 " + Math.round(cap * 100) + "%", planCap, "超出部分轉現金")}${plan("C 壓到可承受損失內", planTol, f < 1 ? `每檔等比例減到 ${A.fmt(f * 100, 0)}%` : "現狀已在範圍內")}
      </tbody></table></div>
      ${note(`限制：β 與相關係數只用最近約 ${A.fmt(mean(live.map(r => (series.get(r.code) || []).length)), 0)} 個交易日；市場急跌時相關性通常會升高，實際跌幅可能比估計更大。β 低於 0.5 以 0.5 計。0050 只是大盤的近似。賣出成本 = 賣出金額 ×（手續費 ${P.fee}%×${P.disc} 折 + 證交稅）。這是風險比較，不是買賣建議；賣出虧損部位會把帳面虧損變成實現虧損，要先回到你的投資論點判斷。`)}`;
    msg.textContent = "完成。資料日期到 " + (series.get("0050") || []).slice(-1).map(c => iso(c[0]))[0];
    watchIn(out); drawIn(out);
  }

  /* ================= 交易日誌 ================= */
  const TCOLS = [["din", "進場日"], ["dout", "出場日"], ["code", "代號"], ["qty", "股數"], ["pin", "進場價"], ["pout", "出場價"], ["stop", "原定停損價"], ["plan", "照計畫(Y/N)"], ["why", "進場理由"], ["note", "出場原因／心得"]];
  function viewJournal() {
    return `
      <div class="dcard lrise"><h3>新增一筆交易（做多；未出場的出場日與出場價留空）</h3>
        <div class="lform ljform">
          ${TCOLS.map(([k, t]) => k === "plan" ? `<select class="in" name="plan" aria-label="${t}"><option value="Y">照計畫執行</option><option value="N">沒照計畫</option></select>` :
            `<input class="in" name="${k}" ${/^d/.test(k) ? 'type="date"' : ""} placeholder="${t}" aria-label="${t}" ${/qty|pin|pout|stop/.test(k) ? 'inputmode="decimal"' : ""}>`).join("")}
          <button type="button" class="aigo" data-act="jadd">加入</button>
        </div>
        <div class="lform"><button type="button" class="btn" data-act="jcsv">匯出 CSV</button><label class="btn lfile">匯入 CSV<input type="file" accept=".csv,text/csv" data-act="jin" hidden></label>
          <span class="sub">CSV 欄位順序：${TCOLS.map(c => c[1]).join("、")}</span></div>
      </div>
      <div class="lgrid2"><div class="dcard lrise"><h3>紀錄能證明的事</h3><div class="ljstat">${note("至少要有已出場的交易才能統計。")}</div></div>
        <div class="dcard lrise"><h3>從紀錄推導的規則（附檢核方式）</h3><div class="ljrule">${note("—")}</div></div></div>
      <div class="dcard lrise"><h3>每筆淨損益（扣手續費與證交稅，依出場日排序）</h3><div class="ljchart"></div></div>
      <div class="dcard lrise"><h3>全部交易</h3><div class="ljlist"></div></div>`;
  }
  function tradeCalc(t) {
    const P = prefs(), fee = v => Math.max(P.minFee, Math.round(v * P.fee / 100 * P.disc));
    const buy = t.pin * t.qty, closed = ok(t.pout) && t.pout > 0 && t.dout;
    const cost = buy + fee(buy), net = closed ? t.pout * t.qty - fee(t.pout * t.qty) - Math.round(t.pout * t.qty * taxOf(t.code) / 100) : NaN;
    return Object.assign({}, t, { closed, cost, pnl: net - cost, ret: (net / cost - 1) * 100, days: closed ? dayNum(t.dout.replace(/-/g, "")) - dayNum(t.din.replace(/-/g, "")) : NaN,
      stopHit: ok(t.stop) && closed && t.pout < t.stop, overStop: ok(t.stop) && closed && t.pout < t.stop * 0.97 });
  }
  function paintJournal() {
    ROOT = pane("dpHold");
    const T = get(K.trades, []).map(tradeCalc), C = T.filter(t => t.closed).sort((a, b) => (a.dout < b.dout ? -1 : 1)), F = A.fmt;
    const list = $(".ljlist"); if (!list) return;
    list.innerHTML = T.length ? `<div class="ltblwrap"><table class="mtbl ltbl"><thead><tr><th class="l">商品</th><th>進場</th><th>出場</th><th>股數</th><th>價格</th><th>淨損益</th><th>天數</th><th class="l">理由</th><th></th></tr></thead><tbody>${
      T.slice().sort((a, b) => (a.din < b.din ? 1 : -1)).map(t => `<tr><td class="l nm"><b>${A.esc(nameOf(t.code))}</b><span>${A.esc(t.code)}${t.plan === "N" ? "・沒照計畫" : ""}${ok(t.stop) ? "" : "・沒設停損"}</span></td><td>${A.esc(t.din)}</td><td>${A.esc(t.dout || "持有中")}</td><td>${F(t.qty)}</td><td>${F(t.pin, 2)} → ${t.closed ? F(t.pout, 2) : "—"}</td><td class="${A.tone(t.pnl)}">${t.closed ? A.signed(t.pnl, 0) : "—"}</td><td>${ok(t.days) ? t.days : "—"}</td><td class="l lwhy">${A.esc(t.why)}${t.note ? "<br><span class=sub>" + A.esc(t.note) + "</span>" : ""}</td><td><button type="button" class="lx" data-act="jdel" data-id="${A.esc(t.id)}" aria-label="刪除">×</button></td></tr>`).join("")}</tbody></table></div>` : note("還沒有交易紀錄。");
    if (!C.length) { $(".ljstat").innerHTML = note("還沒有已出場的交易。"); $(".ljrule").innerHTML = note("—"); $(".ljchart").innerHTML = ""; return; }
    const W = C.filter(t => t.pnl > 0), L = C.filter(t => t.pnl <= 0), gw = W.reduce((a, t) => a + t.pnl, 0), gl = -L.reduce((a, t) => a + t.pnl, 0);
    let streak = 0, worst = 0; C.forEach(t => { streak = t.pnl <= 0 ? streak + 1 : 0; worst = Math.max(worst, streak); });
    const noStop = C.filter(t => !ok(t.stop)), offPlan = C.filter(t => t.plan === "N"), over = C.filter(t => t.overStop);
    const hw = mean(W.map(t => t.days).filter(ok)), hl = mean(L.map(t => t.days).filter(ok));
    const aw = W.length ? gw / W.length : NaN, al = L.length ? gl / L.length : NaN;
    const sum = a => a.reduce((x, t) => x + t.pnl, 0);
    $(".ljstat").innerHTML = kv("已出場筆數", C.length + (C.length < 20 ? "（少於 20 筆，統計很不穩定）" : ""), C.length < 20 ? "down" : "") +
      kv("總淨損益", A.signed(gw - gl, 0), A.tone(gw - gl)) + kv("勝率", F(W.length / C.length * 100, 1) + "%") +
      kv("平均獲利 / 平均虧損", `${F(aw)} / ${F(al)}（盈虧比 ${ok(aw / al) ? F(aw / al, 2) : "—"}）`) +
      kv("獲利因子", gl ? F(gw / gl, 2) : "無虧損") + kv("每筆期望值", A.signed((gw - gl) / C.length, 0), A.tone(gw - gl)) +
      kv("最長連續虧損", worst + " 筆") + kv("持有天數：賺錢 / 賠錢", `${ok(hw) ? F(hw, 1) : "—"} / ${ok(hl) ? F(hl, 1) : "—"} 天`, ok(hl) && ok(hw) && hl > hw * 1.5 ? "down" : "") +
      kv("沒設停損的交易", `${noStop.length} 筆，合計 ${A.signed(sum(noStop), 0)}`, noStop.length ? "down" : "") +
      kv("沒照計畫的交易", `${offPlan.length} 筆，合計 ${A.signed(sum(offPlan), 0)}`, offPlan.length && sum(offPlan) < 0 ? "down" : "") +
      kv("出場價低於停損 3% 以上", `${over.length} 筆（停損沒有執行）`, over.length ? "down" : "");
    const rules = [];
    if (ok(hl) && ok(hw) && hl > hw * 1.5) rules.push([`賠錢的交易平均拿 ${F(hl, 0)} 天，賺錢的只拿 ${F(hw, 0)} 天，紀錄顯示「賺了就跑、賠了抱著」（處分效應）。`, "規則：進場同時寫下停損價；收盤跌破就在下一個交易日出場。", "檢核：每月看「出場價低於停損 3% 以上」是否為 0 筆。"]);
    if (noStop.length) rules.push([`${noStop.length} 筆沒有停損價，合計 ${A.signed(sum(noStop), 0)} 元。`, "規則：沒有停損價的交易不下單。", "檢核：日誌裡「沒設停損」的新交易筆數為 0。"]);
    if (offPlan.length && sum(offPlan) < 0) rules.push([`沒照計畫的 ${offPlan.length} 筆合計虧損 ${F(-sum(offPlan))} 元。`, "規則：下單前用一句話寫出理由與失效條件，寫不出來就不買。", "檢核：每週看「沒照計畫」比例是否下降。"]);
    if (ok(aw / al) && aw / al < 1 && W.length / C.length < 0.6) rules.push([`盈虧比 ${F(aw / al, 2)}、勝率 ${F(W.length / C.length * 100, 0)}%，期望值${(gw - gl) < 0 ? "為負" : "偏低"}。`, "規則：只做預期獲利空間至少是停損距離 2 倍的交易（進場前計算）。", "檢核：每筆記錄（目標價−進場價）÷（進場價−停損價）≥ 2。"]);
    const big = Math.max(...C.map(t => t.cost)), smallAvg = mean(C.map(t => t.cost));
    if (big > smallAvg * 2.5) rules.push(["有交易的部位是平均的 2.5 倍以上，單筆虧損會被放大。", "規則：單筆最大虧損（進場−停損）×股數不超過總資產的 1–2%。", "檢核：每筆進場前算出這個數字並寫進心得。"]);
    if (!rules.length) rules.push(["紀錄中沒有看到明顯重複的問題。", "規則：維持現行做法，持續記錄。", "檢核：滿 20 筆後再看一次這頁。"]);
    $(".ljrule").innerHTML = rules.slice(0, 3).map((r, i) => `<div class="lrule lrise"><b>${i + 1}. ${r[1]}</b><p>${r[0]}</p><p class="sub">${r[2]}</p></div>`).join("") +
      note("以上只根據你輸入的紀錄計算，樣本不足時結論很不可靠；改善紀律可以減少大虧，但不代表一定會提高獲利。");
    const mx = Math.max(...C.map(t => Math.abs(t.pnl)), 1);
    $(".ljchart").innerHTML = `<div class="lfig lpnl">${C.map(t => `<div class="lbrow lrise"><span>${A.esc(t.dout.slice(5))} ${A.esc(nameOf(t.code))}</span>${bar(Math.abs(t.pnl), mx, t.pnl > 0 ? "pos" : "neg")}<b class="${A.tone(t.pnl)}">${A.signed(t.pnl, 0)}</b></div>`).join("")}</div>`;
    watchIn(ROOT);
  }
  function weekly(cs) {
    const out = []; let key = "";
    cs.forEach(c => {
      const d = new Date(iso(c[0]) + "T00:00:00Z"), mon = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
      if (mon !== key) { key = mon; out.push([c[0], c[1], c[2], c[3], c[4], c[5]]); }
      else { const w = out[out.length - 1]; w[0] = c[0]; w[2] = Math.max(w[2], c[2]); w[3] = Math.min(w[3], c[3]); w[4] = c[4]; w[5] += c[5]; }
    });
    return out;
  }
  function regress(v) {
    const n = v.length, xs = v.map((_, i) => i), mx = mean(xs), my = mean(v);
    let b = 0, d = 0; xs.forEach((x, i) => { b += (x - mx) * (v[i] - my); d += (x - mx) ** 2; }); b /= d;
    const a = my - b * mx, res = v.map((y, i) => y - (a + b * i)), ssr = res.reduce((s, r) => s + r * r, 0), sst = v.reduce((s, y) => s + (y - my) ** 2, 0);
    return { a, b, r2: 1 - ssr / sst, sd: sd(res), at: i => a + b * i };
  }

  /* ================= 策略回測 ================= */
  const STRATS = {
    ma: { name: "均線交叉", p: [["fast", "短均線", 5], ["slow", "長均線", 20]], help: "短均線向上穿過長均線買進，向下穿過賣出。" },
    rsi: { name: "RSI 逆勢", p: [["lo", "RSI 低於買進", 30], ["hi", "RSI 高於賣出", 60]], help: "RSI14 跌破下限的隔天買進，升破上限賣出。" },
    brk: { name: "突破", p: [["n", "創 N 日新高買進", 20], ["m", "跌破 M 日低點賣出", 10]], help: "收盤高於前 N 日最高價買進，低於前 M 日最低價賣出。" },
    kd: { name: "KD 交叉", p: [["k0", "K 低於此值的黃金交叉才買", 30], ["k1", "K 高於此值的死亡交叉才賣（0 = 任何）", 0]], help: "K 由下往上穿過 D 買進，由上往下穿過 D 賣出。" },
  };

  function backtest(cs, strat, prm, cost) {
    const I = A.calc(cs), cl = I.cl, n = cs.length, sig = new Array(n).fill(0);
    const smaN = k => A.sma(cl, k);
    if (strat === "ma") { const f = smaN(prm.fast), s = smaN(prm.slow); for (let i = 1; i < n; i++) if (f[i] != null && s[i] != null && f[i - 1] != null && s[i - 1] != null) { if (f[i] > s[i] && f[i - 1] <= s[i - 1]) sig[i] = 1; else if (f[i] < s[i] && f[i - 1] >= s[i - 1]) sig[i] = -1; } }
    if (strat === "rsi") for (let i = 15; i < n; i++) { if (I.rsi[i] < prm.lo) sig[i] = 1; else if (I.rsi[i] > prm.hi) sig[i] = -1; }
    if (strat === "brk") for (let i = Math.max(prm.n, prm.m); i < n; i++) { const h = Math.max(...cs.slice(i - prm.n, i).map(x => x[2])), l = Math.min(...cs.slice(i - prm.m, i).map(x => x[3])); if (cl[i] > h) sig[i] = 1; else if (cl[i] < l) sig[i] = -1; }
    if (strat === "kd") for (let i = 10; i < n; i++) { if (I.K[i] > I.D[i] && I.K[i - 1] <= I.D[i - 1] && I.K[i - 1] < prm.k0) sig[i] = 1; else if (I.K[i] < I.D[i] && I.K[i - 1] >= I.D[i - 1] && (!prm.k1 || I.K[i - 1] > prm.k1)) sig[i] = -1; }
    const trades = [], eq = new Array(n).fill(1); let pos = null, cashEq = 1, pend = 0;
    for (let i = 0; i < n; i++) {
      const o = cs[i][1];
      if (pend === 1 && !pos && i > 0) pos = { i, px: o * (1 + cost.slip), eq: cashEq };
      else if (pend === -1 && pos) {
        const exitPx = o * (1 - cost.slip), r = exitPx * (1 - cost.fee - cost.tax) / (pos.px * (1 + cost.fee)) - 1;
        cashEq = pos.eq * (1 + r); trades.push({ din: cs[pos.i][0], dout: cs[i][0], pin: pos.px, pout: exitPx, ret: r * 100, days: i - pos.i, oos: false, i0: pos.i }); pos = null;
      }
      pend = 0;
      eq[i] = pos ? pos.eq * (cl[i] * (1 - cost.fee - cost.tax) / (pos.px * (1 + cost.fee))) : cashEq;
      if (i < n - 1) {
        if (!pos && sig[i] === 1) pend = 1;
        else if (pos && (sig[i] === -1 || (cost.stop && cl[i] <= pos.px * (1 - cost.stop)))) pend = -1;
      }
    }
    if (pos) trades.push({ din: cs[pos.i][0], dout: "", pin: pos.px, pout: cl[n - 1], ret: (eq[n - 1] / pos.eq - 1) * 100, days: n - 1 - pos.i, open: true, i0: pos.i });
    return { trades, eq };
  }
  function stats(trades, eq, from, to) {
    const t = trades.filter(x => x.i0 >= from && x.i0 < to && !x.open), w = t.filter(x => x.ret > 0), l = t.filter(x => x.ret <= 0);
    const seg = eq.slice(from, to); let peak = -Infinity, mdd = 0; seg.forEach(v => { peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); });
    const gw = w.reduce((a, x) => a + x.ret, 0), gl = -l.reduce((a, x) => a + x.ret, 0);
    return { n: t.length, win: t.length ? w.length / t.length * 100 : NaN, pf: gl ? gw / gl : (gw ? Infinity : NaN), mdd: mdd * 100, avg: t.length ? mean(t.map(x => x.ret)) : NaN, tot: seg.length ? (seg[seg.length - 1] / (from ? eq[from - 1] || seg[0] : 1) - 1) * 100 : NaN };
  }

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function simulate(cs, look, P0, tp, sl, days, runs, seed) {
    const src = cs.slice(-(look + 1)), D = [];
    for (let i = 1; i < src.length; i++) { const p = src[i - 1][4]; if (p > 0) D.push([src[i][4] / p, src[i][2] / p, src[i][3] / p]); }
    const R = rng(seed), up = P0 * (1 + tp), dn = P0 * (1 - sl), keep = 150, paths = [];
    let nT = 0, nS = 0, both = 0; const ends = new Float64Array(runs), hitDay = [];
    for (let k = 0; k < runs; k++) {
      let P = P0, res = 0; const path = k < keep ? [P0] : null;
      for (let d = 0; d < days; d++) {
        const x = D[Math.floor(R() * D.length)], hi = P * x[1], lo = P * x[2];
        P *= x[0]; if (path) path.push(Math.min(up, Math.max(dn, P)));
        const hT = hi >= up, hS = lo <= dn;
        if (hT && hS) { both++; res = -1; } else if (hT) res = 1; else if (hS) res = -1;
        if (res) { hitDay.push(d + 1); if (path) path[path.length - 1] = res > 0 ? up : dn; P = res > 0 ? up : dn; break; }
      }
      if (res > 0) nT++; else if (res < 0) nS++;
      ends[k] = P; if (path) paths.push({ v: path, res });
    }
    const sorted = Array.from(ends).sort((a, b) => a - b), q = f => sorted[Math.floor(f * (runs - 1))];
    return { nT, nS, nN: runs - nT - nS, both, paths, up, dn, n: D.length, from: src[0][0], to: src[src.length - 1][0], q10: q(0.1), q50: q(0.5), q90: q(0.9), avgDay: hitDay.length ? mean(hitDay) : NaN };
  }

  /* ================= 事件日曆 ================= */
  const ETYPES = ["財報", "月營收", "法說會", "股東會", "除權息", "產品發布", "產業事件", "總經數據", "其他"];
  function viewCal() {
    return `<div class="dcard lrise"><div class="bd-h"><h3>自選與持股的公告日期</h3><span class="sub lauton"></span></div><div class="lauto"><p class="sub">載入中…</p></div></div>
      <div class="dcard lrise"><h3>新增事件</h3>
      <div class="lform lcform">
        <input class="in" name="date" type="date" aria-label="日期（不確定就留空＝待確認）">
        <input class="in" name="code" placeholder="代號（選填）" inputmode="numeric" aria-label="代號">
        <select class="in" name="type" aria-label="類型">${ETYPES.map(t => `<option>${t}</option>`).join("")}</select>
        <input class="in" name="title" placeholder="事件" aria-label="事件">
        <input class="in" name="src" placeholder="官方來源連結（公開資訊觀測站、公司 IR）" aria-label="來源">
        <input class="in" name="hyp" placeholder="要驗證的投資假設" aria-label="假設">
        <input class="in" name="upd" placeholder="事件前後要更新的資料" aria-label="要更新的資料">
        <button type="button" class="aigo" data-act="cadd">加入</button>
      </div>
      </div>
      <div class="lgrid2"><div class="dcard lrise"><h3>本週檢查清單</h3><div class="lweek"></div></div><div class="dcard lrise"><h3>全部事件</h3><div class="lcal"></div></div></div>`;
  }
  function paintCal() {
    ROOT = pane("dpCal");
    const E = get(K.events, []), el = $(".lcal"); if (!el) return;
    const t = today(), in7 = new Date(Date.parse(t) + 7 * 864e5).toISOString().slice(0, 10), done = get(K.check, {});
    const sorted = E.slice().sort((a, b) => ((a.date || "9999") < (b.date || "9999") ? -1 : 1));
    const item = e => `<div class="levent lrise ${e.date && e.date < t ? "past" : ""}"><div><b>${e.date ? A.esc(e.date) : "待確認"}</b><span class="ntag">${A.esc(e.type)}</span>${e.code ? `<span class="sub">${A.esc(nameOf(e.code))} ${A.esc(e.code)}</span>` : ""}</div>
      <p>${A.esc(e.title)}</p>${e.hyp ? `<p class="sub">假設：${A.esc(e.hyp)}</p>` : ""}${e.upd ? `<p class="sub">要更新：${A.esc(e.upd)}</p>` : ""}
      ${e.src && /^https?:\/\//.test(e.src) ? `<a class="sub" href="${A.esc(e.src)}" target="_blank" rel="noopener">來源</a>` : `<span class="sub warn">沒有官方來源</span>`}
      ${e.date && e.date < t ? `<div class="lfact"><label>事實結果 <input class="in" data-act="cfact" data-id="${e.id}" value="${A.esc(e.fact || "")}" placeholder="公布了什麼（只寫事實）"></label><label>市場猜測 <input class="in" data-act="cguess" data-id="${e.id}" value="${A.esc(e.guess || "")}" placeholder="媒體或法人的解讀"></label></div>` : ""}
      <button type="button" class="lx" data-act="cdel" data-id="${e.id}" aria-label="刪除">×</button></div>`;
    el.innerHTML = sorted.length ? sorted.map(item).join("") : note("還沒有事件。可先加入持股的下次月營收與季報日期。");
    const wk = sorted.filter(e => !e.date || (e.date >= t && e.date <= in7) || (e.date < t && !e.fact));
    const key = e => e.id + ":" + t.slice(0, 8);
    $(".lweek").innerHTML = wk.length ? wk.map(e => `<label class="lcheck lrise"><input type="checkbox" data-act="ccheck" data-k="${key(e)}" ${done[key(e)] ? "checked" : ""}><span>${!e.date ? "確認日期：" : e.date < t ? "補上結果：" : e.date + "："}${A.esc(e.title)}${e.code ? "（" + A.esc(nameOf(e.code)) + "）" : ""}</span></label>`).join("") +
      note("每週只核對兩件事：事實更新（公告、財報數字）和市場猜測分開寫；不要把事件預設為利多，也不要在沒有證據時猜價格反應。") : note("未來 7 天沒有事件，也沒有待確認或待補結果的項目。");
  }

  /* dates nobody has to type: TWSE's ex-dividend notice and the monthly revenue deadline (the 10th, moved past a weekend) */
  const EXDIV = { rows: null, busy: null };
  function loadExDiv() {
    if (EXDIV.rows) return Promise.resolve(EXDIV.rows);
    if (EXDIV.busy) return EXDIV.busy;
    EXDIV.busy = A.J("https://www.twse.com.tw/rwd/zh/exRight/TWT48U?response=json").then(j => {
      if (j.stat !== "OK" || !Array.isArray(j.data)) throw new Error("no notice");
      const ix = k => j.fields.findIndex(f => f.includes(k)), iD = ix("除權除息日期"), iC = ix("股票代號"), iN = ix("名稱"), iK = j.fields.indexOf("除權息"), iS = ix("無償配股率"), iM = ix("現金股利");
      EXDIV.rows = j.data.map(r => {
        const m = String(r[iD]).match(/^(\d{3})\D(\d{2})\D(\d{2})/), cash = parseFloat(r[iM]), stock = parseFloat(r[iS]);
        return m && { date: (+m[1] + 1911) + "-" + m[2] + "-" + m[3], code: String(r[iC]).trim(), name: String(r[iN]).trim(), kind: "除" + String(r[iK]).trim(),
          info: [cash > 0 ? "現金股利 " + +cash.toFixed(4) + " 元" : "", stock > 0 ? "無償配股率 " + +stock.toFixed(6) : ""].filter(Boolean).join("・") };
      }).filter(Boolean);
      EXDIV.busy = null; return EXDIV.rows;
    }).catch(e => { EXDIV.busy = null; throw e; });
    return EXDIV.busy;
  }
  function revenueDue(from) {
    const y = +from.slice(0, 4), m = +from.slice(5, 7) - 1;
    for (let k = 0; ; k++) {
      const d = new Date(Date.UTC(y, m + k, 10)); while (d.getUTCDay() % 6 === 0) d.setUTCDate(d.getUTCDate() + 1);
      const s = d.toISOString().slice(0, 10); if (s >= from) return s;
    }
  }
  const myCodes = () => new Set(A.lists().flat().concat(get(K.hold, []).map(h => h.code)));
  async function paintAuto() {
    const panel = pane("dpCal"), el = panel.querySelector(".lauto"); if (!el) return;
    const t = today(), mine = myCodes(), held = new Set(get(K.hold, []).map(h => h.code));
    const due = { date: revenueDue(t), kind: "月營收", name: "上月營收公布期限", info: "每月 10 日前，遇週末順延" };
    let list = [], failed = !A.DB.live;
    if (A.DB.live) { try { list = (await loadExDiv()).filter(r => r.date >= t && mine.has(r.code)); } catch (e) { failed = true; } }
    if (!el.isConnected) return;
    const rows = list.concat([due]).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    panel.querySelector(".lauton").textContent = failed ? "" : `除權息 ${list.length} 筆`;
    el.innerHTML = (failed ? `<p class="sub warn">除權息資料暫時讀不到。</p>` : !list.length ? `<p class="sub">自選與持股目前沒有已公告的除權息。</p>` : "") +
      rows.map(r => `<div class="levent lauto-row"><div><b>${A.esc(r.date)}</b><span class="ntag">${A.esc(r.kind)}</span>${r.code ? `<button type="button" class="chip" data-act="copen" data-code="${A.esc(r.code)}">${A.esc(r.name)} ${A.esc(r.code)}</button>${held.has(r.code) ? `<span class="sub">持股</span>` : ""}` : `<span>${A.esc(r.name)}</span>`}</div>${r.info ? `<p class="sub">${A.esc(r.info)}</p>` : ""}</div>`).join("");
  }

  /* ---------------- research pack for the AI team: every tool's numbers for one stock, no UI ---------------- */
  async function research(code, onStep) {
    const out = { note: "computed in the browser from TWSE daily bars and the user's own records; not predictions" };
    const cs = await bars(code, 14, onStep);
    if (cs.length < 60) return out;
    const n = cs.length, i = n - 1, c = cs[i][4], I = A.calc(cs), w = weekly(cs), r2v = v => (ok(v) ? Math.round(v * 100) / 100 : null);
    /* technical scenarios */
    const reg = regress(cs.slice(-60).map(x => x[4])), wma10 = w.length >= 10 ? mean(w.slice(-10).map(x => x[4])) : NaN, wma10p = w.length > 10 ? mean(w.slice(-11, -1).map(x => x[4])) : NaN;
    const hi = m => Math.max(...cs.slice(-m).map(x => x[2])), lo = m => Math.min(...cs.slice(-m).map(x => x[3]));
    const lv = [["MA20", I.ma20[i]], ["MA60", I.ma60[i]], ["20日低", lo(20)], ["60日低", lo(60)], ["20日高", hi(20)], ["60日高", hi(60)], ["週10MA", wma10], ["通道下緣", reg.at(59) - 2 * reg.sd], ["通道上緣", reg.at(59) + 2 * reg.sd], ["52週高", w.length >= 52 ? Math.max(...w.slice(-52).map(x => x[2])) : NaN], ["52週低", w.length >= 52 ? Math.min(...w.slice(-52).map(x => x[3])) : NaN]].filter(x => ok(x[1]));
    out.technicalScenarios = {
      supports: lv.filter(x => x[1] < c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0] + " " + r2v(x[1])),
      resistances: lv.filter(x => x[1] > c).sort((a, b) => a[1] - b[1]).slice(0, 3).map(x => x[0] + " " + r2v(x[1])),
      trend60dSlopePctPerDay: r2v(reg.b / c * 100), trend60dR2: r2v(reg.r2), weeklyMA10: r2v(wma10), weeklyMA10Rising: ok(wma10p) ? wma10 > wma10p : null,
      weeklyRsi: w.length > 15 ? r2v(A.calc(w).rsi[w.length - 1]) : null,
    };
    /* time machine: 10,000 bootstrap replays of the last 60 days, +8% target and −5% stop over 20 trading days */
    const mp = { tp: 8, sl: 5, days: 20, look: 60 }, sim = simulate(cs, Math.min(mp.look, n - 1), c, mp.tp / 100, mp.sl / 100, mp.days, 10000, 19);
    out.timeMachine = { method: `bootstrap of the last ${sim.n} daily bars, 10000 replays, up to ${mp.days} trading days from ${r2v(c)}`, targetPct: mp.tp, stopPct: mp.sl,
      targetFirstPct: r2v(sim.nT / 100), stopFirstPct: r2v(sim.nS / 100), neitherPct: r2v(sim.nN / 100), endPriceP10: r2v(sim.q10), endPriceP50: r2v(sim.q50), endPriceP90: r2v(sim.q90) };
    /* backtests of the four built-in strategies with default settings and Taiwan costs, 70/30 split */
    const P = prefs(), cost = { fee: P.fee / 100 * P.disc, tax: taxOf(code) / 100, slip: P.slip / 100, stop: 0 }, cut = Math.floor(n * 0.7);
    out.backtests = Object.entries(STRATS).map(([k, v]) => {
      const prm = {}; v.p.forEach(([pk, , d]) => { prm[pk] = d; });
      const { trades, eq } = backtest(cs, k, prm, cost), a = stats(trades, eq, 0, n), o = stats(trades, eq, cut, n);
      return { strategy: v.name, params: prm, trades: a.n, winPct: r2v(a.win), profitFactor: ok(a.pf) ? r2v(a.pf) : null, maxDrawdownPct: r2v(a.mdd), totalPct: r2v(a.tot), outOfSampleTotalPct: r2v(o.tot) };
    });
    out.buyAndHoldPct = r2v((cs[i][4] / cs[0][1] - 1) * 100); out.backtestPeriod = iso(cs[0][0]) + " to " + iso(cs[i][0]);
    /* the user's own position, trades and events for this stock (kept only in this browser) */
    const H = holdRows(), mine = H.rows.find(r => r.code === code);
    if (mine) out.myPosition = { shares: mine.shares, cost: Math.round(mine.cost), returnPct: r2v(mine.ret), weightPct: r2v(mine.w), portfolioHoldings: H.rows.length, largestWeightPct: r2v(Math.max(...H.rows.map(r => r.w).filter(ok))) };
    const T = get(K.trades, []).map(tradeCalc).filter(t => t.code === code);
    if (T.length) { const C = T.filter(t => t.closed); out.myTrades = { closed: C.length, open: T.length - C.length, winPct: C.length ? r2v(C.filter(t => t.pnl > 0).length / C.length * 100) : null, netPnl: Math.round(C.reduce((a, t) => a + t.pnl, 0)), withoutStop: T.filter(t => !ok(t.stop)).length }; }
    const t0 = today(), ev = get(K.events, []).filter(e => (!e.code || e.code === code) && (!e.date || e.date >= t0)).slice(0, 6);
    if (ev.length) out.myEvents = ev.map(e => ({ date: e.date || "TBD", type: e.type, title: e.title, hypothesis: e.hyp || "" }));
    return out;
  }
  window.TWLab = { research: (code, onStep) => (A ? research(code, onStep) : Promise.resolve(null)), bars, backtest, stats, STRATS, prefs, taxOf };

  /* ---------------- shell: 我的持股 has two views, 行事曆 is one page ---------------- */
  const HOLD_VIEWS = [["hold", "持股風險", viewHold], ["journal", "交易日誌", viewJournal]];
  const holdView = () => (get(K.view, "hold") === "journal" ? "journal" : "hold");
  function showHold(v) {
    set(K.view, v); ROOT = pane("dpHold");
    const view = HOLD_VIEWS.find(x => x[0] === holdView());
    ROOT.innerHTML = `<div class="chips lviews">${HOLD_VIEWS.map(([k, t]) => `<button type="button" class="chip" data-view="${k}" aria-pressed="${k === view[0]}">${t}</button>`).join("")}</div>${view[2]()}`;
    if (view[0] === "journal") paintJournal(); else paintHold();
    ROOT = pane("dpHold"); A.rise($$(".lrise"), 40); watchIn(ROOT);
  }
  function showCal() {
    ROOT = pane("dpCal");
    ROOT.innerHTML = viewCal();
    paintCal(); paintAuto();
    A.rise($$(".lrise"), 40);
  }
  function readCSV(input, done) { const f = input.files && input.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => done(parseCSV(String(r.result).replace(/^﻿/, ""))); r.readAsText(f); }
  function onClick(e) {
    ROOT = e.currentTarget;
    const view = e.target.closest("[data-view]"); if (view) return showHold(view.dataset.view);
    const a = e.target.closest("[data-act]"); if (!a || a.tagName === "INPUT") return;
    const act = a.dataset.act, val = n => (($(`[name="${n}"]`) || {}).value || "").trim();
    if (act === "copen") return A.openStock(a.dataset.code);
      if (act === "hadd") {
        const code = val("code"), shares = parseFloat(val("shares")), cost = parseFloat(val("cost")), px = parseFloat(val("px"));
        if (!code || !(shares > 0) || !(cost > 0)) { alertMsg("代號、股數、總成本都要填（股數與成本要大於 0）。"); return; }
        const H = get(K.hold, []).filter(h => h.code !== code); H.push({ code, shares, cost, px: ok(px) ? px : null, ind: val("ind") || "" }); set(K.hold, H); showHold("hold"); return;
      }
      if (act === "hdel") { set(K.hold, get(K.hold, []).filter(h => h.code !== a.dataset.code)); showHold("hold"); return; }
      if (act === "hrisk") { saveHoldPrefs(); a.disabled = true; holdRisk().finally(() => { a.disabled = false; }); return; }
      if (act === "hcurve") { saveHoldPrefs(); a.disabled = true; holdCurve().finally(() => { a.disabled = false; }); return; }
      if (act === "hdiv") { a.disabled = true; holdDividends().finally(() => { a.disabled = false; }); return; }
      if (act === "hcsv") return download("twstock-holdings.csv", "代號,股數,總成本,手動現價,產業\n" + get(K.hold, []).map(h => [h.code, h.shares, h.cost, h.px == null ? "" : h.px, h.ind].map(csvCell).join(",")).join("\n"));
      if (act === "jadd") {
        const t = { id: uid() }; TCOLS.forEach(([k]) => { t[k] = val(k); }); ["qty", "pin", "pout", "stop"].forEach(k => { t[k] = parseFloat(t[k]); });
        if (!t.code || !t.din || !(t.qty > 0) || !(t.pin > 0)) { alertMsg("至少要填進場日、代號、股數、進場價。"); return; }
        if (ok(t.pout) && !t.dout) { alertMsg("有出場價就要填出場日。"); return; }
        set(K.trades, get(K.trades, []).concat([t])); showHold("journal"); return;
      }
      if (act === "jdel") { set(K.trades, get(K.trades, []).filter(t => t.id !== a.dataset.id)); paintJournal(); return; }
      if (act === "jcsv") return download("twstock-journal.csv", TCOLS.map(c => c[1]).join(",") + "\n" + get(K.trades, []).map(t => TCOLS.map(([k]) => csvCell(ok(t[k]) || typeof t[k] === "string" ? t[k] : "")).join(",")).join("\n"));
      if (act === "cadd") {
        const e2 = { id: uid(), date: val("date"), code: val("code"), type: val("type"), title: val("title"), src: val("src"), hyp: val("hyp"), upd: val("upd") };
        if (!e2.title) { alertMsg("請填事件名稱。"); return; }
        set(K.events, get(K.events, []).concat([e2])); showCal(); return;
      }
      if (act === "cdel") { set(K.events, get(K.events, []).filter(x => x.id !== a.dataset.id)); paintCal(); return; }
  }
  function onChange(e) {
    ROOT = e.currentTarget;
    const t = e.target, act = t.dataset && t.dataset.act;
      if (act === "hin") readCSV(t, rows => { const H = rows.slice(/[^\d.\s,]/.test(rows[0].join("")) && !/^\d/.test(rows[0][0]) ? 1 : 0).map(r => ({ code: String(r[0]).trim(), shares: parseFloat(r[1]), cost: parseFloat(r[2]), px: ok(parseFloat(r[3])) ? parseFloat(r[3]) : null, ind: (r[4] || "").trim() })).filter(h => h.code && h.shares > 0 && h.cost > 0); set(K.hold, H); showHold("hold"); });
      if (act === "jin") readCSV(t, rows => { const T = rows.filter(r => /\d{4}-\d{2}-\d{2}/.test(r[0])).map(r => { const o = { id: uid() }; TCOLS.forEach(([k], i) => { o[k] = (r[i] || "").trim(); }); ["qty", "pin", "pout", "stop"].forEach(k => { o[k] = parseFloat(o[k]); }); return o; }).filter(x => x.code && x.qty > 0 && x.pin > 0); set(K.trades, get(K.trades, []).concat(T)); showHold("journal"); });
      if (act === "ccheck") { const c = get(K.check, {}); c[t.dataset.k] = t.checked; set(K.check, c); }
      if (act === "cfact" || act === "cguess") { set(K.events, get(K.events, []).map(x => (x.id === t.dataset.id ? Object.assign(x, act === "cfact" ? { fact: t.value } : { guess: t.value }) : x))); paintCal(); }
    if (/^(cash|tol|cap)$/.test(t.name)) { saveHoldPrefs(); paintHold(); }
    if (/^z(code|in|stop|cap|risk)$/.test(t.name)) sizePosition();
  }
  function saveHoldPrefs() {
    const v = n => parseFloat(($(`[name="${n}"]`) || {}).value);
    if (ok(v("cash"))) set(K.cash, v("cash")); else set(K.cash, 0);
    set(K.pref, Object.assign(get(K.pref, {}), ok(v("tol")) ? { tol: v("tol") } : {}, ok(v("cap")) ? { cap: v("cap") } : {}));
  }
  function alertMsg(t) { let m = $(".lalert"); if (!m) { m = document.createElement("p"); m.className = "sub warn lalert"; m.setAttribute("role", "status"); const f = $(".dcard"); f && f.appendChild(m); } m.textContent = t; }

  /* ---------------- start (twmain dispatches twdash:ready once its helpers exist) ---------------- */
  document.addEventListener("twdash:ready", () => {
    A = window.TWDash && window.TWDash.api; if (!A || !pane("dpHold") || !pane("dpCal")) return;
    [pane("dpHold"), pane("dpCal")].forEach(p => { p.addEventListener("click", onClick); p.addEventListener("change", onChange); });
    showHold(holdView()); showCal();
  });
  /* opening a tab redraws it with the latest prices and watchlists; live ticks only refresh the holdings figures */
  document.addEventListener("twdash:tab", e => { if (!A) return; if (e.detail === "dpHold") showHold(holdView()); if (e.detail === "dpCal") showCal(); });
  document.addEventListener("twdash:list", () => { if (!A) return; paintHold(true); paintAuto(); if (holdView() === "journal") paintJournal(); paintCal(); });
  document.addEventListener("twdash:live", () => { if (A && pane("dpHold").classList.contains("on")) paintHold(true); });
})();
