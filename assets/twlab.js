/* TWstock 研究室: research tools that work on real closing data and on what the user enters in this browser.
   持股風險   holdings (kept only in this browser), P&L at the latest price, concentration by stock and industry,
              correlation and beta against 0050 from daily bars, a market −20% stress test and three rebalancing plans.
   交易日誌   trades (kept only in this browser): win rate, payoff, profit factor, expectancy, streaks, hold time of
              winners vs losers, trades without a stop or against the plan, and rules derived only from the record.
   技術情境   daily and weekly structure for one stock: support, resistance, trend line, moving averages, momentum,
              and bull / range / bear scenarios with the conditions that make or break each one (not a forecast).
   策略回測   four rule sets on up to 36 months of daily bars, signals on the close and fills at the next open,
              fees, tax and slippage, in-sample vs out-of-sample, buy-and-hold for comparison, CSV export.
   同業比較   P/E, P/B, yield and revenue growth side by side, with the industry so non-comparable rows stand out.
   敏感度     a small free-cash-flow model with three cases and a discount-rate × growth grid (no probabilities).
   事件日曆   events with source and the hypothesis to check, a weekly checklist, fact and guess kept apart.
   提示詞     the 12 research prompts, filled in with this page's data, ready to copy into Claude.
   Nothing here places orders or promises a result. */
(function () {
  "use strict";
  let A = null;                                       /* twmain's shared helpers, set on twdash:ready */
  const box = () => document.getElementById("dpLab");
  const $ = (s, r = box()) => r.querySelector(s);
  const $$ = (s, r = box()) => Array.from(r.querySelectorAll(s));
  const ok = Number.isFinite;
  const r2 = v => (ok(v) ? Math.round(v * 100) / 100 : null);
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const today = () => { const d = new Date(Date.now() + 8 * 3600e3); return d.toISOString().slice(0, 10); };
  const dayNum = s => Date.parse(String(s).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3") + "T00:00:00Z") / 864e5;
  const iso = ds => ds.slice(0, 4) + "-" + ds.slice(4, 6) + "-" + ds.slice(6);
  const K = { hold: "twlab-hold", cash: "twlab-cash", pref: "twlab-pref", trades: "twlab-trades", events: "twlab-events", tool: "twlab-tool", dcf: "twlab-dcf", bt: "twlab-bt", peers: "twlab-peers", check: "twlab-check" };
  const get = (k, d) => A.store.get(k, d), set = (k, v) => A.store.set(k, v);

  const TOOLS = [
    ["hold", "持股風險", "集中度、相關性、β、市場下跌 20% 壓力測試與再平衡比較", "#5"],
    ["journal", "交易日誌", "勝率、盈虧比、獲利因子、持有時間與違反規則的交易", "#6"],
    ["tech", "技術情境", "日線＋週線的支撐壓力、趨勢線與偏多／盤整／偏空條件", "#2"],
    ["bt", "策略回測", "含手續費、證交稅、滑價，樣本內外分開看", "#4"],
    ["peer", "同業比較", "本益比、淨值比、殖利率、營收年增並排，標出不可比", "#9"],
    ["dcf", "敏感度分析", "保守／基準／樂觀三種假設與折現率×成長率表", "#10"],
    ["cal", "事件日曆", "財報、法說、股東會：日期、來源、要驗證的假設", "#11"],
    ["prompt", "提示詞", "12 個研究提示詞，自動帶入本頁資料，一鍵複製", "#1–12"],
  ];

  /* ---------------- shared data ---------------- */
  const IND_NAME = { "01": "水泥", "02": "食品", "03": "塑膠", "04": "紡織纖維", "05": "電機機械", "06": "電器電纜", "08": "玻璃陶瓷", "09": "造紙", "10": "鋼鐵", "11": "橡膠", "12": "汽車", "14": "建材營造", "15": "航運", "16": "觀光餐旅", "17": "金融保險", "18": "貿易百貨", "19": "綜合", "20": "其他", "21": "化學", "22": "生技醫療", "23": "油電燃氣", "24": "半導體", "25": "電腦及週邊", "26": "光電", "27": "通信網路", "28": "電子零組件", "29": "電子通路", "30": "資訊服務", "31": "其他電子", "35": "綠能環保", "36": "數位雲端", "37": "運動休閒", "38": "居家生活" };
  const INDUSTRY = { map: null, busy: null };
  function loadIndustry() {
    if (INDUSTRY.map) return Promise.resolve(INDUSTRY.map);
    if (INDUSTRY.busy) return INDUSTRY.busy;
    INDUSTRY.busy = A.J("https://openapi.twse.com.tw/v1/opendata/t187ap03_L").then(rows => {
      const m = new Map();
      rows.forEach(x => { const c = String(x["公司代號"] || "").trim(), k = String(x["產業別"] || "").trim().padStart(2, "0"); if (c) m.set(c, IND_NAME[k] || ("產業 " + k)); });
      INDUSTRY.map = m; return m;
    }, () => { INDUSTRY.map = new Map(); return INDUSTRY.map; });
    return INDUSTRY.busy;
  }
  const industryOf = (code, manual) => manual || (/^00/.test(code) ? "ETF" : INDUSTRY.map && INDUSTRY.map.get(code)) || "未知";
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
    const root = scope || box(); if (!root || !box().classList.contains("on")) return;
    $$(".lbar i", root).forEach((b, i) => b.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 600, delay: 120 + i * 50, easing: "cubic-bezier(.2,.9,.3,1)", fill: "backwards" }));
    $$("path.ldraw", root).forEach((p, i) => { const L = p.getTotalLength ? p.getTotalLength() : 0; if (!L) return; p.style.strokeDasharray = L; p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 1000, delay: 250 + i * 200, easing: "ease-out", fill: "backwards" }); });
    $$(".lheat td[data-v]", root).forEach((c, i) => c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 100 + i * 25, fill: "backwards" }));
    A.rise($$(".lrise", root), 50, 60);
  }
  const io = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); drawIn(e.target); } }), { threshold: 0.2 }) : null;
  function watchIn(root) { if (!root) return; if (io) $$(".lfig", root).forEach(f => io.observe(f)); else drawIn(root); }
  const bar = (v, max, cls) => `<span class="lbar"><i class="${cls || ""}" style="width:${Math.max(0, Math.min(100, max ? v / max * 100 : 0)).toFixed(1)}%"></i></span>`;
  function lineSVG(series, opt = {}) {
    const W = 640, H = opt.h || 200, P = 30, all = series.flatMap(s => s.v.filter(ok));
    if (all.length < 2) return "";
    let lo = Math.min(...all), hi = Math.max(...all); if (hi === lo) { hi += 1; lo -= 1; }
    const n = Math.max(...series.map(s => s.v.length)), X = i => P + i / Math.max(1, n - 1) * (W - P - 6), Y = v => 8 + (hi - v) / (hi - lo) * (H - 26);
    const ticks = [lo, (lo + hi) / 2, hi].map(v => `<line class="gridl" x1="${P}" x2="${W - 6}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="0" y="${(Y(v) + 4).toFixed(1)}">${opt.fmt ? opt.fmt(v) : A.fmt(v, 0)}</text>`).join("");
    const paths = series.map(s => `<path class="ldraw ${s.cls}" d="${s.v.map((v, i) => (ok(v) ? (i && ok(s.v[i - 1]) ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1) : "")).join("")}"/>`).join("");
    const base = ok(opt.base) && opt.base > lo && opt.base < hi ? `<line class="lbase" x1="${P}" x2="${W - 6}" y1="${Y(opt.base)}" y2="${Y(opt.base)}"/>` : "";
    const split = ok(opt.split) ? `<line class="lsplit" x1="${X(opt.split)}" x2="${X(opt.split)}" y1="4" y2="${H - 16}"/><text x="${X(opt.split) + 4}" y="${H - 4}">樣本外 →</text>` : "";
    return `<svg class="lfig" viewBox="0 0 ${W} ${H}" role="img" aria-label="${A.esc(opt.label || "")}">${ticks}${base}${split}${paths}</svg>`;
  }
  const kv = (k, v, t) => `<div class="snap lrise"><span>${k}</span><b class="${t || ""}">${v}</b></div>`;
  const note = t => `<p class="sub lnote">${t}</p>`;
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
      <div class="dcard lrise"><div class="lhead"><div><h3>相關性、β 與壓力測試</h3><p class="sub">用最近 6 個月日線計算每檔與 0050 的 β，以及持股之間的報酬相關係數（每日收盤），再估算市場下跌 20% 時的損失。</p></div>
        <button type="button" class="aigo" data-act="hrisk" ${H.length ? "" : "disabled"}>計算</button></div>
        <p class="sub lmsg"></p><div class="lrisk"></div></div>`;
  }
  function holdRows() {
    const H = get(K.hold, []), cash = +get(K.cash, 0) || 0;
    const rows = H.map(h => { const px = priceOf(h), mv = ok(px) ? px * h.shares : NaN; return Object.assign({}, h, { manualPx: h.px, name: nameOf(h.code), px, mv, pnl: mv - h.cost, ret: (mv / h.cost - 1) * 100, ind: industryOf(h.code, h.ind) }); });
    const total = rows.reduce((a, r) => a + (ok(r.mv) ? r.mv : 0), 0) + cash;
    rows.forEach(r => { r.w = total ? r.mv / total * 100 : NaN; });
    return { rows, cash, total };
  }
  function paintHold() {
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
    watchIn(box());
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
        <div class="lfig">${hm.length > 1 ? `<table class="lheat"><tr><th></th>${hm.map(c => `<th>${A.esc(c)}</th>`).join("")}</tr>${hm.map(a => `<tr><th>${A.esc(a)}</th>${hm.map(b => { const v = a === b ? 1 : corr(R.get(a), R.get(b)); return `<td data-v style="--a:${ok(v) ? Math.abs(v).toFixed(2) : 0}" class="${v < 0 ? "neg" : ""}">${ok(v) ? A.fmt(v, 2) : "—"}</td>`; }).join("")}</tr>`).join("")}</table><p class="sub">相關係數：1 = 完全同向，0 = 無關，負數 = 反向。</p>` : note("只有一檔，沒有相關性可算。")}</div>
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
    watchIn(box());
  }

  /* ================= 技術情境（日線＋週線） ================= */
  function viewTech() {
    return `<div class="dcard lrise"><div class="lhead"><div><h3>技術情境</h3><p class="sub">讀取約 14 個月日線，另外合成週線。所有數字都由證交所日線計算；資料不夠的指標會標「無法計算」。</p></div>
      <div class="lform"><input class="in lcode" value="${A.esc(A.code())}" aria-label="股票代號" inputmode="numeric"><button type="button" class="aigo" data-act="tgo">分析</button></div></div>
      <p class="sub lmsg"></p><div class="ltech"></div></div>`;
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
  async function techRun() {
    const code = ($(".lcode").value || "").trim(), msg = $(".lmsg"), out = $(".ltech");
    if (!A.DB.by.get(code)) { msg.textContent = "找不到這個代號（支援上市、上櫃股票與 ETF）。"; return; }
    const cs = await bars(code, 14, (i, n) => { msg.textContent = `讀取日線 ${i}/${n} 個月…`; });
    if (cs.length < 30) { msg.textContent = "日線不足 30 日，無法分析。"; return; }
    const I = A.calc(cs), n = cs.length, i = n - 1, c = cs[i][4], w = weekly(cs), WI = A.calc(w), wi = w.length - 1, d2 = A.dig(c), F = (v, d = d2) => (ok(v) ? A.fmt(v, d) : "無法計算");
    const wma = (k) => (w.length >= k ? mean(w.slice(-k).map(x => x[4])) : NaN), wma10 = wma(10), wma20 = wma(20), wma10p = w.length > 10 ? mean(w.slice(-11, -1).map(x => x[4])) : NaN;
    const reg = regress(cs.slice(-60).map(x => x[4])), slopePct = reg.b / c * 100, k = Math.min(60, n) - 1, chanHi = reg.at(k) + 2 * reg.sd, chanLo = reg.at(k) - 2 * reg.sd;
    const hi = m => Math.max(...cs.slice(-m).map(x => x[2])), lo = m => Math.min(...cs.slice(-m).map(x => x[3]));
    const sup = [["MA20", I.ma20[i]], ["MA60", I.ma60[i]], ["20 日低點", lo(20)], ["60 日低點", n >= 60 ? lo(60) : NaN], ["週線 10MA", wma10], ["趨勢通道下緣", chanLo], ["前 52 週低點", w.length >= 52 ? Math.min(...w.slice(-52).map(x => x[3])) : NaN]].filter(x => ok(x[1]) && x[1] < c).sort((a, b) => b[1] - a[1]);
    const res = [["MA20", I.ma20[i]], ["MA60", I.ma60[i]], ["20 日高點", hi(20)], ["60 日高點", n >= 60 ? hi(60) : NaN], ["週線 10MA", wma10], ["趨勢通道上緣", chanHi], ["前 52 週高點", w.length >= 52 ? Math.max(...w.slice(-52).map(x => x[2])) : NaN]].filter(x => ok(x[1]) && x[1] > c).sort((a, b) => a[1] - b[1]);
    const S1 = sup[0], R1 = res[0], ma20up = I.ma20[i] > I.ma20[i - 5], volR = I.vma20[i] ? cs[i][5] / I.vma20[i] : NaN;
    const bw = I.ma20.map((m, j) => (m && I.bu[j] ? (I.bu[j] - I.bl[j]) / m : null)).filter(x => x != null), bwMed = bw.slice(-120).slice().sort((a, b) => a - b)[Math.floor(Math.min(120, bw.length) / 2)];
    const cond = (t, v) => `<li class="${v === true ? "yes" : v === false ? "no" : "na"}">${t}<em>${v === true ? "目前成立" : v === false ? "目前不成立" : "無法判斷"}</em></li>`;
    const bull = [cond("收盤在 MA20 之上", c > I.ma20[i]), cond("MA20 比 5 日前高（月線上彎）", ma20up), cond("週收盤在週 10MA 之上", ok(wma10) ? w[wi][4] > wma10 : null), cond("MACD 柱狀為正", I.hist[i] > 0)];
    const range = [cond(`收盤介於最近支撐 ${S1 ? F(S1[1]) : "—"} 與壓力 ${R1 ? F(R1[1]) : "—"} 之間`, !!(S1 && R1)), cond("布林通道寬度低於近半年中位數（收斂）", ok(bwMed) ? bw[bw.length - 1] < bwMed : null), cond("60 日趨勢線斜率接近 0（每日 ±0.1% 內）", Math.abs(slopePct) < 0.1)];
    const bear = [cond("收盤在 MA20 之下", c < I.ma20[i]), cond("MA20 比 5 日前低（月線下彎）", !ma20up), cond("週收盤在週 10MA 之下", ok(wma10) ? w[wi][4] < wma10 : null), cond("MACD 柱狀為負", I.hist[i] < 0)];
    const score = h => (h.join("").match(/class="yes"/g) || []).length + " / " + h.length;
    const sc = (title, cls, items, valid, fail, track) => `<div class="lscen ${cls} lrise"><h4>${title}<span>${score(items)} 條件成立</span></h4><ul>${items.join("")}</ul><p><b>成立後的延續訊號：</b>${valid}</p><p><b>失效條件：</b>${fail}</p><p class="sub"><b>要追蹤：</b>${track}</p></div>`;
    const span = Math.min(120, n), show = cs.slice(-span), off = n - span;
    out.innerHTML = `
      <div class="lgrid2">
        <div>${kv("資料", `${iso(cs[0][0])} 到 ${iso(cs[i][0])}，日線 ${n} 根、週線 ${w.length} 根`)}${kv("收盤", F(c))}
          ${kv("日線均線", `MA5 ${F(I.ma5[i])}・MA20 ${F(I.ma20[i])}・MA60 ${F(I.ma60[i])}`)}${kv("週線均線", `10 週 ${F(wma10)}（${ok(wma10p) ? (wma10 > wma10p ? "上彎" : "下彎") : "無法計算"}）・20 週 ${F(wma20)}`)}
          ${kv("60 日趨勢線", `斜率每日 ${A.signed(slopePct, 2)}%，R² ${A.fmt(reg.r2, 2)}（${reg.r2 < 0.3 ? "趨勢不明顯" : slopePct > 0 ? "上升趨勢" : "下降趨勢"}）`, slopePct > 0 ? "up" : "down")}
          ${kv("日 KD／週 KD", `${A.fmt(I.K[i], 0)}/${A.fmt(I.D[i], 0)}・${w.length >= 9 ? A.fmt(WI.K[wi], 0) + "/" + A.fmt(WI.D[wi], 0) : "無法計算"}`)}
          ${kv("RSI14 日／週", `${F(I.rsi[i], 1)}・${w.length > 15 ? F(WI.rsi[wi], 1) : "無法計算"}`)}${kv("MACD 柱 日／週", `${A.signed(I.hist[i], 2)}・${w.length > 35 ? A.signed(WI.hist[wi], 2) : "無法計算（週線不足 35 根）"}`)}
          ${kv("量能", ok(volR) ? `今日量是 20 日均量 ${A.fmt(volR, 2)} 倍` : "無法計算")}
          ${kv("支撐（由近到遠）", sup.slice(0, 3).map(x => `${F(x[1])} ${x[0]}`).join("、") || "下方無明確支撐")}${kv("壓力（由近到遠）", res.slice(0, 3).map(x => `${F(x[1])} ${x[0]}`).join("、") || "在近期高點之上")}</div>
        <div>${lineSVG([{ v: show.map(x => x[4]), cls: "lc" }, { v: I.ma20.slice(off), cls: "lm20" }, { v: I.ma60.slice(off), cls: "lm60" }, { v: show.map((_, j) => (j >= span - Math.min(60, n) ? reg.at(j - (span - Math.min(60, n))) : null)), cls: "ltr" }], { h: 380, label: "收盤、MA20、MA60 與 60 日趨勢線", fmt: v => A.fmt(v, d2) })}
          <p class="sub"><i class="lg lc"></i>收盤 <i class="lg lm20"></i>MA20 <i class="lg lm60"></i>MA60 <i class="lg ltr"></i>60 日趨勢線（迴歸）</p></div>
      </div>
      <div class="lscens">
        ${sc("偏多情境", "bull", bull, R1 ? `放量（≥ 1.5 倍均量）站上 ${F(R1[1])}（${R1[0]}）` : "維持在近期高點之上", S1 ? `收盤跌破 ${F(S1[1])}（${S1[0]}）` : "收盤跌回 MA20 之下", "日 KD 是否高檔鈍化、週 10MA 是否持續上彎、量能")}
        ${sc("盤整情境", "flat", range, "價格在區間內來回、量縮", `收盤離開 ${S1 ? F(S1[1]) : "支撐"}–${R1 ? F(R1[1]) : "壓力"} 區間且量 ≥ 1.5 倍均量`, "布林通道寬度、區間上下緣的反應")}
        ${sc("偏空情境", "bear", bear, S1 ? `跌破 ${F(S1[1])}（${S1[0]}）後無法站回` : "持續創低", R1 ? `收盤站回 ${F(R1[1])}（${R1[0]}）` : "收盤站回 MA20", "週 10MA 是否下彎、RSI 是否進入 30 以下、法人連續賣超")}
      </div>
      ${note("「條件成立」只描述現在的價格結構，不是預測，也不代表接下來會照這個情境走。週線由日線合成（週一到週五），指標以收盤計算。")}`;
    msg.textContent = ""; watchIn(out); drawIn(out);
  }

  /* ================= 策略回測 ================= */
  const STRATS = {
    ma: { name: "均線交叉", p: [["fast", "短均線", 5], ["slow", "長均線", 20]], help: "短均線向上穿過長均線買進，向下穿過賣出。" },
    rsi: { name: "RSI 逆勢", p: [["lo", "RSI 低於買進", 30], ["hi", "RSI 高於賣出", 60]], help: "RSI14 跌破下限的隔天買進，升破上限賣出。" },
    brk: { name: "突破", p: [["n", "創 N 日新高買進", 20], ["m", "跌破 M 日低點賣出", 10]], help: "收盤高於前 N 日最高價買進，低於前 M 日最低價賣出。" },
    kd: { name: "KD 交叉", p: [["k0", "K 低於此值的黃金交叉才買", 30], ["k1", "K 高於此值的死亡交叉才賣（0 = 任何）", 0]], help: "K 由下往上穿過 D 買進，由上往下穿過 D 賣出。" },
  };
  function viewBT() {
    const s = Object.assign({ code: A.code(), strat: "ma", months: 24, stop: 0, prm: {} }, get(K.bt, {})), P = prefs();
    return `<div class="dcard lrise"><h3>策略回測</h3>
      <div class="lform lbform">
        <label>代號 <input class="in" name="code" value="${A.esc(s.code)}" inputmode="numeric"></label>
        <label>策略 <select class="in" name="strat">${Object.entries(STRATS).map(([k, v]) => `<option value="${k}" ${k === s.strat ? "selected" : ""}>${v.name}</option>`).join("")}</select></label>
        <label>期間 <select class="in" name="months">${[12, 24, 36].map(m => `<option value="${m}" ${m === +s.months ? "selected" : ""}>${m} 個月</option>`).join("")}</select></label>
        <span class="lprm">${STRATS[s.strat].p.map(([k, t, d]) => `<label>${t} <input class="in" name="p_${k}" inputmode="decimal" value="${s.prm[k] != null ? s.prm[k] : d}"></label>`).join("")}</span>
        <label>停損 %（0 = 不設）<input class="in" name="stop" inputmode="decimal" value="${s.stop}"></label>
        <label>手續費 % <input class="in" name="fee" inputmode="decimal" value="${P.fee}"></label>
        <label>手續費折數 <input class="in" name="disc" inputmode="decimal" value="${P.disc}"></label>
        <label>滑價 %（單邊）<input class="in" name="slip" inputmode="decimal" value="${P.slip}"></label>
        <button type="button" class="aigo" data-act="bgo">回測</button>
      </div>
      <p class="sub lbhelp">${STRATS[s.strat].help} 訊號用當天收盤判斷，下一個交易日開盤成交（避免用到未來資料）；證交稅股票 0.3%、ETF 0.1%；全額進出、不加碼、只做多。</p>
      <p class="sub lmsg"></p><div class="lbt"></div></div>`;
  }
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
  async function btRun() {
    const f = name => $(`.lbform [name="${name}"]`), code = f("code").value.trim(), strat = f("strat").value, months = +f("months").value, msg = $(".lmsg"), out = $(".lbt");
    const prm = {}; STRATS[strat].p.forEach(([k, , d]) => { const el = f("p_" + k); const v = el ? parseFloat(el.value) : d; prm[k] = ok(v) ? v : d; });
    const P = Object.assign(prefs(), { fee: parseFloat(f("fee").value) || 0, disc: parseFloat(f("disc").value) || 1, slip: parseFloat(f("slip").value) || 0 }); set(K.pref, Object.assign(get(K.pref, {}), { fee: P.fee, disc: P.disc, slip: P.slip }));
    const stop = Math.max(0, parseFloat(f("stop").value) || 0);
    set(K.bt, { code, strat, months, stop, prm });
    if (!A.DB.by.get(code)) { msg.textContent = "找不到這個代號（支援上市、上櫃股票與 ETF）。"; return; }
    const cs = await bars(code, months, (i, n) => { msg.textContent = `讀取日線 ${i}/${n} 個月…（證交所每月一次查詢，第一次會比較久）`; });
    if (cs.length < 80) { msg.textContent = "日線不足 80 日，回測沒有意義。"; return; }
    const cost = { fee: P.fee / 100 * P.disc, tax: taxOf(code) / 100, slip: P.slip / 100, stop: stop / 100 };
    const { trades, eq } = backtest(cs, strat, prm, cost), n = cs.length, cut = Math.floor(n * 0.7);
    const all = stats(trades, eq, 0, n), ins = stats(trades, eq, 0, cut), oos = stats(trades, eq, cut, n), bh = cs[n - 1][4] / cs[0][1] - 1;
    const F = (v, d = 1, s = "") => (ok(v) ? A.fmt(v, d) + s : v === Infinity ? "無虧損" : "—");
    const row = (k, s) => `<tr class="lrise"><td class="l">${k}</td><td>${s.n}</td><td>${F(s.win, 1, "%")}</td><td>${F(s.pf, 2)}</td><td class="down">${F(s.mdd, 1, "%")}</td><td class="${A.tone(s.avg)}">${F(s.avg, 2, "%")}</td><td class="${A.tone(s.tot)}">${F(s.tot, 1, "%")}</td></tr>`;
    const warn = [];
    if (all.n < 30) warn.push(`只有 ${all.n} 筆交易，樣本太少，勝率與獲利因子很容易是運氣。`);
    if (ok(ins.tot) && ok(oos.tot) && ins.tot > 0 && oos.tot < 0) warn.push("樣本內賺錢、樣本外虧損：典型的過度擬合跡象，參數可能只適合過去。");
    if (all.tot < bh * 100) warn.push(`策略報酬 ${F(all.tot, 1, "%")} 低於同期買進持有 ${F(bh * 100, 1, "%")}。`);
    out.innerHTML = `
      <div class="ltblwrap"><table class="mtbl ltbl"><thead><tr><th class="l">區間</th><th>交易次數</th><th>勝率</th><th>獲利因子</th><th>最大回撤</th><th>平均每筆</th><th>累積報酬</th></tr></thead><tbody>
        ${row(`全部 ${iso(cs[0][0])}～${iso(cs[n - 1][0])}`, all)}${row(`樣本內（前 70%）`, ins)}${row(`樣本外（後 30%，自 ${iso(cs[cut][0])}）`, oos)}
        <tr class="lrise"><td class="l">買進持有（開盤買、最後收盤）</td><td>1</td><td>—</td><td>—</td><td>—</td><td>—</td><td class="${A.tone(bh)}">${F(bh * 100, 1, "%")}</td></tr></tbody></table></div>
      ${lineSVG([{ v: eq.map(v => v * 100), cls: "lc" }, { v: cs.map(c => c[4] / cs[0][1] * 100), cls: "lm60" }], { label: "策略淨值與買進持有", base: 100, split: cut, fmt: v => A.fmt(v, 0) })}
      <p class="sub"><i class="lg lc"></i>策略淨值（起點 100，已扣成本） <i class="lg lm60"></i>買進持有</p>
      ${warn.length ? `<div class="lwarn lrise">${warn.map(w => `<p>${w}</p>`).join("")}</div>` : ""}
      <div class="lform"><button type="button" class="btn" data-act="bcsv">下載交易明細 CSV</button><button type="button" class="btn" data-act="bdata">下載使用的日線 CSV</button></div>
      ${note(`檢查：前視偏誤＝訊號用收盤、隔日開盤成交，已避免；過度擬合＝請比較樣本內外，並試試相鄰參數是否結果相近；未計入除權息（股價除息會被當成下跌）、漲跌停無法成交與最低手續費 ${prefs().minFee} 元。過去績效不代表未來。`)}`;
    BTLAST = { code, strat, prm, stop, cost, trades, cs };
    msg.textContent = `完成：${STRATS[strat].name} ${JSON.stringify(prm)}${stop ? "，停損 " + stop + "%" : ""}`;
    watchIn(out); drawIn(out);
  }
  let BTLAST = null;

  /* ================= 同業比較 ================= */
  function viewPeer() {
    const H = get(K.hold, []).map(h => h.code), def = get(K.peers, H.length ? H.join(" ") : "2330 2303 2454 3711 2379");
    return `<div class="dcard lrise"><div class="lhead"><div><h3>同業估值比較</h3><p class="sub">輸入要比較的代號（空白或逗號分隔）。資料來自證交所每日本益比／殖利率／淨值比與最新月營收。</p></div>
      <div class="lform"><input class="in lpeers" value="${A.esc(def)}" aria-label="代號清單"><button type="button" class="aigo" data-act="pgo">比較</button></div></div>
      <p class="sub lmsg"></p><div class="lpeer"></div></div>`;
  }
  async function peerRun() {
    const codes = [...new Set(($(".lpeers").value || "").split(/[\s,，、]+/).filter(Boolean))].slice(0, 15), msg = $(".lmsg"), out = $(".lpeer");
    set(K.peers, codes.join(" "));
    msg.textContent = "讀取估值與產業資料…"; await Promise.all([A.loadFund(), loadIndustry()]);
    const rows = codes.map(c => { const s = A.DB.by.get(c), f = (A.FUND.map && A.FUND.map.get(c)) || {}; return { c, name: s ? s.name : "（查無）", px: s ? s.price : NaN, ind: industryOf(c), pe: f.pe, pb: f.pb, yld: f.yld, yoy: f.yoy, ym: f.ym }; });
    const med = k => { const v = rows.map(r => r[k]).filter(x => ok(x) && x > 0).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
    const M = { pe: med("pe"), pb: med("pb"), yld: med("yld"), yoy: med("yoy") }, F = (v, d = 2) => (ok(v) && v !== 0 ? A.fmt(v, d) : "缺");
    const inds = [...new Set(rows.map(r => r.ind))];
    const cell = (v, m, d, inv) => `<td class="${ok(v) && v && ok(m) ? ((inv ? v < m : v > m) ? "lhi" : "") : "lmiss"}">${F(v, d)}</td>`;
    out.innerHTML = `<div class="ltblwrap"><table class="mtbl ltbl"><thead><tr><th class="l">公司</th><th class="l">產業</th><th>股價</th><th>本益比</th><th>股價淨值比</th><th>殖利率 %</th><th>營收年增 %</th><th class="l">營收月份</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="lrise"><td class="l nm"><b>${A.esc(r.name)}</b><span>${A.esc(r.c)}</span></td><td class="l">${A.esc(r.ind)}</td><td>${ok(r.px) ? A.fmt(r.px, A.dig(r.px)) : "缺"}</td>${cell(r.pe, M.pe, 1, true)}${cell(r.pb, M.pb, 2, true)}${cell(r.yld, M.yld, 2)}${cell(r.yoy, M.yoy, 1)}<td class="l">${A.esc(r.ym || "缺")}</td></tr>`).join("")}
      <tr><td class="l"><b>中位數</b></td><td></td><td></td><td>${F(M.pe, 1)}</td><td>${F(M.pb, 2)}</td><td>${F(M.yld, 2)}</td><td>${F(M.yoy, 1)}</td><td></td></tr></tbody></table></div>
      ${inds.length > 1 ? `<div class="lwarn lrise"><p>清單裡有 ${inds.length} 個產業（${inds.map(A.esc).join("、")}），商業模式與獲利結構不同，估值倍數不能直接比較。</p></div>` : ""}
      ${note("標色＝優於清單中位數（本益比、淨值比較低；殖利率、營收年增較高）。「缺」＝證交所沒有提供，常見原因：虧損（本益比不計算）、ETF、上櫃股票。本益比用近四季 EPS，低本益比可能代表市場預期獲利下滑，不等於便宜；需要再查毛利率、負債與會計口徑才能判斷是否可比（可到「提示詞」#9 帶著這張表請 Claude 深入）。")}`;
    msg.textContent = `資料日期：估值 ${A.DB.date ? iso(A.DB.date) : "—"}。`; watchIn(out); drawIn(out);
  }

  /* ================= 敏感度（簡易自由現金流折現） ================= */
  const DCF0 = { code: "", rev: 1000, sh: 10, cashN: 0, r: 10, gT: 2, cases: { 保守: { g: 0, m: 8 }, 基準: { g: 8, m: 12 }, 樂觀: { g: 15, m: 15 } } };
  function viewDCF() {
    const d = Object.assign({}, DCF0, get(K.dcf, {}));
    const inp = (n, t, v) => `<label>${t}<input class="in" name="${n}" inputmode="decimal" value="${v}"></label>`;
    return `<div class="dcard lrise"><h3>財報情境與敏感度</h3>
      <div class="lform ldform">${inp("code", "代號（取現價比較，選填）", d.code)}${inp("rev", "最近一年營收（億）", d.rev)}${inp("sh", "流通股數（億股）", d.sh)}${inp("cashN", "淨現金（億，負債多填負數）", d.cashN)}${inp("r", "折現率 %", d.r)}${inp("gT", "第 6 年起永續成長 %", d.gT)}</div>
      <div class="ltblwrap"><table class="mtbl ltbl lcases"><thead><tr><th class="l">情境</th><th>未來 5 年營收年成長 %</th><th>自由現金流率 %（FCF／營收）</th></tr></thead><tbody>
        ${Object.entries(d.cases).map(([k, v]) => `<tr><td class="l">${k}</td><td><input class="in" name="g_${k}" inputmode="decimal" value="${v.g}"></td><td><input class="in" name="m_${k}" inputmode="decimal" value="${v.m}"></td></tr>`).join("")}</tbody></table></div>
      <button type="button" class="aigo" data-act="dgo">計算</button>
      <p class="sub">營收與股數請從公司財報或年報填入（公開資訊觀測站）。這裡不會自動補上缺的財務數據。</p>
      <div class="ldcf"></div></div>`;
  }
  function dcfVal(d, g, m, r, gT) {
    let rev = d.rev, pv = 0, fcf = 0;
    for (let y = 1; y <= 5; y++) { rev *= 1 + g / 100; fcf = rev * m / 100; pv += fcf / (1 + r / 100) ** y; }
    if (r <= gT) return NaN;
    const tv = fcf * (1 + gT / 100) / ((r - gT) / 100), pvT = tv / (1 + r / 100) ** 5;
    return { ps: (pv + pvT + d.cashN) / d.sh, tvShare: pvT / (pv + pvT) * 100 };
  }
  function dcfRun() {
    const f = n => parseFloat(($(`.dcard [name="${n}"]`) || {}).value), d = { code: ($(`.dcard [name="code"]`).value || "").trim(), rev: f("rev"), sh: f("sh"), cashN: f("cashN") || 0, r: f("r"), gT: f("gT"), cases: {} };
    Object.keys(DCF0.cases).forEach(k => { d.cases[k] = { g: f("g_" + k), m: f("m_" + k) }; });
    const out = $(".ldcf");
    if (![d.rev, d.sh, d.r, d.gT].every(ok) || d.sh <= 0) { out.innerHTML = note("營收、股數、折現率與永續成長率都要填。"); return; }
    set(K.dcf, d);
    const px = d.code && A.DB.by.get(d.code) ? A.DB.by.get(d.code).price : NaN, res = Object.entries(d.cases).map(([k, c]) => [k, c, dcfVal(d, c.g, c.m, d.r, d.gT)]);
    const mx = Math.max(...res.map(x => (x[2] && ok(x[2].ps) ? x[2].ps : 0)), ok(px) ? px : 0);
    const base = d.cases["基準"], rs = [-2, -1, 0, 1, 2].map(x => d.r + x), gs = [-4, -2, 0, 2, 4].map(x => base.g + x);
    const grid = `<table class="lheat lgrid"><tr><th>折現率＼成長</th>${gs.map(g => `<th>${A.fmt(g, 0)}%</th>`).join("")}</tr>${rs.map(r => `<tr><th>${A.fmt(r, 1)}%</th>${gs.map(g => { const v = dcfVal(d, g, base.m, r, d.gT); const p = v && ok(v.ps) ? v.ps : NaN; return `<td data-v style="--a:${ok(p) && ok(px) ? Math.min(1, Math.abs(p / px - 1)).toFixed(2) : 0}" class="${ok(p) && ok(px) && p < px ? "neg" : ""}">${ok(p) ? A.fmt(p, 0) : "—"}</td>`; }).join("")}</tr>`).join("")}</table>`;
    /* the most sensitive input: ±10% change of each base input, effect on value */
    const b0 = dcfVal(d, base.g, base.m, d.r, d.gT).ps, sens = [["營收成長 ±2 個百分點", dcfVal(d, base.g + 2, base.m, d.r, d.gT).ps - dcfVal(d, base.g - 2, base.m, d.r, d.gT).ps],
      ["現金流率 ±2 個百分點", dcfVal(d, base.g, base.m + 2, d.r, d.gT).ps - dcfVal(d, base.g, base.m - 2, d.r, d.gT).ps], ["折現率 ±1 個百分點", dcfVal(d, base.g, base.m, d.r - 1, d.gT).ps - dcfVal(d, base.g, base.m, d.r + 1, d.gT).ps],
      ["永續成長 ±0.5 個百分點", dcfVal(d, base.g, base.m, d.r, d.gT + 0.5).ps - dcfVal(d, base.g, base.m, d.r, d.gT - 0.5).ps]].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    out.innerHTML = `<div class="lgrid2"><div class="lfig">${res.map(([k, c, v]) => `<div class="lbrow lrise"><span>${k}（成長 ${c.g}%、FCF 率 ${c.m}%）</span>${bar(v && ok(v.ps) ? v.ps : 0, mx, k === "保守" ? "neg" : k === "樂觀" ? "pos" : "")}<b>${v && ok(v.ps) ? A.fmt(v.ps, 1) : "—"}</b></div>`).join("")}
        ${ok(px) ? `<div class="lbrow lrise"><span>現價 ${A.esc(d.code)}</span>${bar(px, mx, "cash")}<b>${A.fmt(px, A.dig(px))}</b></div>` : ""}
        ${kv("基準情境中終值占比", ok(b0) ? A.fmt(dcfVal(d, base.g, base.m, d.r, d.gT).tvShare, 0) + "%（越高越依賴遠期假設）" : "—")}</div>
        <div><h3 class="lsub">最敏感的變數（基準情境，每股價值變動）</h3>${sens.map(([k, v]) => kv(k, ok(v) ? A.fmt(Math.abs(v), 1) + " 元" : "—")).join("")}</div></div>
      <h3 class="lsub">基準情境：折現率 × 營收成長的每股價值${ok(px) ? "（顏色越深＝離現價越遠，紅框＝低於現價）" : ""}</h3><div class="lfig">${grid}</div>
      ${note("公式：每年 FCF＝營收×FCF 率，前 5 年逐年折現；第 5 年後用永續成長模型 FCF×(1+g)/(r−g) 求終值再折現；加淨現金後除以股數。三種情境是假設不是預測，這裡也不替它們指定機率。資本支出已包含在自由現金流率裡；若公司正在大量擴產，FCF 率可能暫時很低。")}`;
    watchIn(out); drawIn(out);
  }

  /* ================= 事件日曆 ================= */
  const ETYPES = ["財報", "月營收", "法說會", "股東會", "除權息", "產品發布", "產業事件", "總經數據", "其他"];
  function viewCal() {
    return `<div class="dcard lrise"><h3>新增事件</h3>
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
      <p class="sub">日期留空就標成「待確認」。每月 10 日前上市公司公布上月營收；季報法定期限：Q1 5/15、Q2 8/14、Q3 11/14、年報 3/31（以公開資訊觀測站公告為準）。</p></div>
      <div class="lgrid2"><div class="dcard lrise"><h3>本週檢查清單</h3><div class="lweek"></div></div><div class="dcard lrise"><h3>全部事件</h3><div class="lcal"></div></div></div>`;
  }
  function paintCal() {
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

  /* ================= 提示詞（12 個，帶入本頁資料） ================= */
  function ohlcv(code, n) { const h = A.HIST.get(code) || {}, cs = (h.cs || []).slice(-n); return cs.length ? "date,open,high,low,close,volume_lots\n" + cs.map(c => [iso(c[0]), ...c.slice(1)].join(",")).join("\n") : ""; }
  function holdText() { const { rows, cash, total } = holdRows(); return rows.length ? rows.map(r => `${r.code} ${r.name}：${r.shares} 股，成本 ${Math.round(r.cost)} 元，市值 ${ok(r.mv) ? Math.round(r.mv) : "未知"} 元，權重 ${ok(r.w) ? r.w.toFixed(1) : "?"}%，產業 ${r.ind}`).join("\n") + `\n現金：${cash} 元；總資產約 ${Math.round(total)} 元` : ""; }
  function tradesText() { const T = get(K.trades, []).slice(-20); return T.length ? "進場日,出場日,代號,股數,進場價,出場價,原定停損,照計畫,理由,心得\n" + T.map(t => TCOLS.map(([k]) => csvCell(t[k])).join(",")).join("\n") : ""; }
  const P12 = [
    ["交易點子產生器", (c, n, d) => `請根據我提供的 ${n}（${c}）及以下行情資料（資料日期 ${d}），提出 5 個值得進一步研究的交易情境。\n\n每個情境列出觸發條件、參考進場區間、目標區間、失效條件與風險報酬計算，並解釋技術面與基本面的支持理由。\n\n資料不足時先列出缺口，不要捏造價格、即時行情或勝率。區分已知事實、假設與待驗證項目。`],
    ["自動化技術分析師", (c, n, d) => `請分析 ${n}（${c}）的日線與週線。使用我提供的 OHLCV 資料（到 ${d}），整理支撐、壓力、趨勢線、移動平均線與動能指標。\n\n分別建立偏多、盤整與偏空情境，說明各情境成立條件、失效條件與需要追蹤的訊號。\n\n請展示判斷依據；若資料無法支持某項指標，就標示無法計算，不要把情境分析當成確定預測。`],
    ["新聞轉交易研究", (c, n) => `請整理 ${n}（${c}）的［貼上新聞內容或來源連結］，逐項列出事件日期、消息來源與已確認事實。\n\n分析可能的短期與長期影響，區分市場已知資訊與新增資訊，並列出利多、利空及可能推翻判斷的後續事件。\n\n不要在缺乏依據時預測漲跌幅。若無法讀取來源或取得最新消息，請直說並向我索取原文。`],
    ["交易策略回測分析師", (c, n) => { const b = BTLAST && BTLAST.code === c ? `${STRATS[BTLAST.strat].name}，參數 ${JSON.stringify(BTLAST.prm)}，停損 ${BTLAST.stop}%` : "［策略規則］"; return `請協助回測 ${b}，標的是 ${n}（${c}），期間為［起迄日期］。先確認進出場、部位、交易成本（手續費 ${prefs().fee}%×${prefs().disc} 折、證交稅 ${taxOf(c)}%）與滑價假設。\n\n若可執行並取得資料，請列出勝率、獲利因子、最大回撤、交易次數與平均報酬，並提供可重現的程式與資料來源。\n\n若不能實際執行，只提供回測程式與步驟，不要編造績效。請檢查前視偏誤、過度擬合及樣本外表現。`; }],
    ["投資組合風險管理", () => `請分析我的組合：\n${holdText() || "［股票代號、配置比例、現金比例］"}\n我的投資期間是［期間］，可承受的損失是總資產的 ${prefs().tol}%。\n\n檢查產業、區域、幣別及單一標的集中度，並指出可能的共同風險因子。相關性若需要資料，先告訴我所需期間與頻率。\n\n建立市場下跌 20% 的壓力測試假設，說明限制，再比較不同再平衡方案的風險、成本與取捨，不保證避開虧損。`],
    ["交易日誌分析師", () => `請檢視我最近 20 筆交易：\n${tradesText() || "［進出場時間、價格、部位、成本、結果及當時理由］"}\n\n找出重複錯誤、未遵守規則的情況、錯失機會與可能的行為偏誤。把紀錄能證明的事，和你的推測分開。\n\n最後提出 3 條可執行、可追蹤的個人交易規則，附上檢核方式。樣本不足時請明確提醒，不要宣稱一定能提高獲利。`],
    ["財報與基本面研究員", (c, n) => `請根據 ${n}（${c}）的［公司財報／年報／法說會資料］，分析營收、毛利率、營業利益、現金流、負債與股本變化。\n\n比較［指定期間］的趨勢，列出成長來源、一次性項目、潛在風險與需要追問管理層的問題。每個重要數字註明來源與期間。\n\n若涉及估值，請列出假設、同業可比性的限制與敏感度；不要自行補上缺失財務數據。`],
    ["投資論點反方審查", (c, n) => `這是我的投資論點：［貼上內容］（標的：${n} ${c}）。請擔任反方研究員，檢查前提、證據、估值假設及我可能忽略的風險。\n\n列出最有力的反對理由、可能的替代解釋，以及哪些新資訊會讓原論點失效。不要為了反對而捏造問題。\n\n最後整理一份追蹤清單：要觀察的指標、查證來源、更新頻率與重新評估條件。資訊不足就先提出問題。`],
    ["同業估值比較", (c, n) => `請根據［${get(K.peers, c)}］與我提供的［財報、股價及日期］，比較同業的營收成長、利潤率、負債與估值。\n\n選擇適合該產業的估值指標，說明各公司的商業模式、會計口徑與成長階段是否可比。不要只因本益比較低就判定便宜。\n\n用表格呈現數據來源、計算方式及缺失資料，列出估值差異的可能原因與需要進一步查證的問題。`],
    ["財報情境與敏感度分析", (c, n) => `請根據 ${n}（${c}）的［公司資料］建立保守、基準、樂觀三種情境，列出營收成長、利潤率、資本支出與折現假設。\n\n比較不同假設對現金流與估值範圍的影響，找出最敏感的變數，並說明假設的依據與限制。\n\n若無法執行計算，提供可重現的公式與步驟，不要捏造結果。情境不是價格預測，也不要替三種情境隨意指定機率。`],
    ["事件追蹤與研究日曆", () => `請依［持股／觀察名單：${get(K.hold, []).map(h => h.code).join("、") || "請填入"}］與［指定期間］，整理需要追蹤的財報、法說會、產品發布、股東會及重要產業事件。\n\n每項註明日期、官方來源、要驗證的投資假設，以及事件前後應更新的資料。找不到已確認日期時請標示待確認。\n\n建立每週檢查清單，區分事實更新與市場猜測。不要把事件必然解讀為利多，也不要在沒有證據時預測價格反應。`],
    ["研究資料查核員", () => `請檢查這份投資研究：［貼上內容與來源］。逐項核對重要數字、日期、單位、財報期間與引用來源。\n\n找出過期資料、前後矛盾、未支持的推論，以及把相關性當成因果的地方。將結果分成已核實、待核實與有誤三類。\n\n能讀取來源時附上可核對的出處；不能讀取就向我索取原文。最後列出修正清單，不要把未查到資料當成已證明錯誤。`],
  ];
  function viewPrompt() {
    const i = +get("twlab-pi", 1);
    return `<div class="dcard lrise"><h3>研究提示詞</h3>
      <div class="chips lpchips">${P12.map((p, k) => `<button type="button" class="chip" data-act="ppick" data-i="${k}" aria-pressed="${k === i}">${k + 1}. ${p[0]}</button>`).join("")}</div>
      <div class="lform"><label>股票 <input class="in lpcode" value="${A.esc(A.code())}" inputmode="numeric"></label><label class="lcheck"><input type="checkbox" class="lpdata" checked><span>附上本頁已讀取的資料（OHLCV、技術數據、基本面）</span></label></div>
      <textarea class="in lptext" rows="16" aria-label="提示詞"></textarea>
      <div class="lform"><button type="button" class="aigo" data-act="pcopy">複製</button><span class="sub lmsg"></span></div>
      ${note("提示詞來自 Denghao 的貼文（研究輔助用途｜資料需查證｜不保證獲利）。方括號［］是需要你自己貼上的內容。複製後貼到 Claude 使用。")}</div>`;
  }
  async function paintPrompt() {
    const ta = $(".lptext"); if (!ta) return;
    const i = +get("twlab-pi", 1), code = ($(".lpcode").value || A.code()).trim(), s = A.DB.by.get(code), name = s ? s.name : code, d = A.DB.date ? iso(A.DB.date) : "";
    let text = P12[i][1](code, name, d);
    if ($(".lpdata").checked && s && [0, 1, 2, 6, 7, 9].includes(i)) {
      if (!A.HIST.get(code)) { $(".lmsg").textContent = "讀取這檔的日線…"; await A.loadHist(code); await A.loadFund(); $(".lmsg").textContent = ""; }
      const F = A.facts(code), csv = ohlcv(code, i === 1 ? 140 : 60);
      text += `\n\n---\n以下是 TWstock 從臺灣證券交易所公開資料整理的數據（資料日期 ${d}，${A.DB.live ? "收盤資料" : "示意資料，不可用於分析"}；未經你驗證）：\n` + (F ? "技術與基本面摘要（JSON）：\n" + JSON.stringify(F) + "\n" : "") + (csv ? `\n日線 OHLCV（成交量單位：張）：\n${csv}` : "");
    }
    ta.value = text;
  }

  /* ---------------- shell: card menu → one tool, a button back to the menu ---------------- */
  const VIEWS = { hold: [viewHold, () => { loadIndustry().then(paintHold); paintHold(); }], journal: [viewJournal, paintJournal], tech: [viewTech, () => {}], bt: [viewBT, () => {}], peer: [viewPeer, () => {}], dcf: [viewDCF, () => { if (get(K.dcf, null)) dcfRun(); }], cal: [viewCal, paintCal], prompt: [viewPrompt, paintPrompt] };
  let TOOL = null;
  function menu() {
    TOOL = null; set(K.tool, "");
    box().innerHTML = `<div class="dcard lintro lrise"><h3>研究室</h3><p>用真實收盤資料與你自己的紀錄做研究：先看清風險和自己的交易習慣，再決定要不要動。持股與交易日誌只存在這台裝置的瀏覽器。</p>
      <p class="sub">這些工具能幫你少犯重複的錯、控制單一部位的風險，但沒有任何工具能保證帳面轉正或獲利。研究輔助用途｜資料需查證｜不保證獲利。</p></div>
      <div class="lmenu">${TOOLS.map(([k, t, d, n]) => `<button type="button" class="dcard lcard lrise" data-tool="${k}"><span class="sub">${n}</span><b>${t}</b><span class="sub">${d}</span></button>`).join("")}</div>`;
    A.rise($$(".lrise"), 50);
  }
  function openTool(k) {
    if (!VIEWS[k]) return menu();
    TOOL = k; set(K.tool, k);
    const t = TOOLS.find(x => x[0] === k);
    box().innerHTML = `<div class="ltop"><button type="button" class="btn" data-act="back">← 研究室</button><h2>${t[1]}</h2></div>${VIEWS[k][0]()}<div class="lback"><button type="button" class="btn" data-act="back">← 回到研究室</button></div>`;
    VIEWS[k][1](); A.rise($$(".lrise"), 40); watchIn(box()); box().scrollIntoView({ block: "start" });
  }
  function readCSV(input, done) { const f = input.files && input.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => done(parseCSV(String(r.result).replace(/^﻿/, ""))); r.readAsText(f); }
  function bind() {
    const B = box();
    B.addEventListener("click", e => {
      const card = e.target.closest("[data-tool]"); if (card) return openTool(card.dataset.tool);
      const a = e.target.closest("[data-act]"); if (!a || a.tagName === "INPUT") return;
      const act = a.dataset.act, val = n => (($(`[name="${n}"]`) || {}).value || "").trim();
      if (act === "back") return menu();
      if (act === "hadd") {
        const code = val("code"), shares = parseFloat(val("shares")), cost = parseFloat(val("cost")), px = parseFloat(val("px"));
        if (!code || !(shares > 0) || !(cost > 0)) { alertMsg("代號、股數、總成本都要填（股數與成本要大於 0）。"); return; }
        const H = get(K.hold, []).filter(h => h.code !== code); H.push({ code, shares, cost, px: ok(px) ? px : null, ind: val("ind") || "" }); set(K.hold, H); openTool("hold"); return;
      }
      if (act === "hdel") { set(K.hold, get(K.hold, []).filter(h => h.code !== a.dataset.code)); openTool("hold"); return; }
      if (act === "hrisk") { saveHoldPrefs(); a.disabled = true; holdRisk().finally(() => { a.disabled = false; }); return; }
      if (act === "hcsv") return download("twstock-holdings.csv", "代號,股數,總成本,手動現價,產業\n" + get(K.hold, []).map(h => [h.code, h.shares, h.cost, h.px == null ? "" : h.px, h.ind].map(csvCell).join(",")).join("\n"));
      if (act === "jadd") {
        const t = { id: uid() }; TCOLS.forEach(([k]) => { t[k] = val(k); }); ["qty", "pin", "pout", "stop"].forEach(k => { t[k] = parseFloat(t[k]); });
        if (!t.code || !t.din || !(t.qty > 0) || !(t.pin > 0)) { alertMsg("至少要填進場日、代號、股數、進場價。"); return; }
        if (ok(t.pout) && !t.dout) { alertMsg("有出場價就要填出場日。"); return; }
        set(K.trades, get(K.trades, []).concat([t])); openTool("journal"); return;
      }
      if (act === "jdel") { set(K.trades, get(K.trades, []).filter(t => t.id !== a.dataset.id)); paintJournal(); return; }
      if (act === "jcsv") return download("twstock-journal.csv", TCOLS.map(c => c[1]).join(",") + "\n" + get(K.trades, []).map(t => TCOLS.map(([k]) => csvCell(ok(t[k]) || typeof t[k] === "string" ? t[k] : "")).join(",")).join("\n"));
      if (act === "tgo") { a.disabled = true; techRun().finally(() => { a.disabled = false; }); return; }
      if (act === "bgo") { a.disabled = true; btRun().finally(() => { a.disabled = false; }); return; }
      if (act === "bcsv" && BTLAST) return download(`backtest-${BTLAST.code}-${BTLAST.strat}.csv`, "進場日,出場日,進場價(含滑價),出場價(含滑價),淨報酬%,持有日,未平倉\n" + BTLAST.trades.map(t => [iso(t.din), t.dout ? iso(t.dout) : "", t.pin.toFixed(2), t.pout.toFixed(2), t.ret.toFixed(3), t.days, t.open ? "Y" : ""].join(",")).join("\n") + `\n\n# 參數,${csvCell(JSON.stringify({ strat: BTLAST.strat, prm: BTLAST.prm, stop: BTLAST.stop, cost: BTLAST.cost }))}\n# 資料來源,臺灣證券交易所 STOCK_DAY`);
      if (act === "bdata" && BTLAST) return download(`ohlcv-${BTLAST.code}.csv`, "date,open,high,low,close,volume_lots\n" + BTLAST.cs.map(c => [iso(c[0]), ...c.slice(1)].join(",")).join("\n"));
      if (act === "pgo") { a.disabled = true; peerRun().finally(() => { a.disabled = false; }); return; }
      if (act === "dgo") return dcfRun();
      if (act === "cadd") {
        const e2 = { id: uid(), date: val("date"), code: val("code"), type: val("type"), title: val("title"), src: val("src"), hyp: val("hyp"), upd: val("upd") };
        if (!e2.title) { alertMsg("請填事件名稱。"); return; }
        set(K.events, get(K.events, []).concat([e2])); openTool("cal"); return;
      }
      if (act === "cdel") { set(K.events, get(K.events, []).filter(x => x.id !== a.dataset.id)); paintCal(); return; }
      if (act === "ppick") { set("twlab-pi", +a.dataset.i); $$(".lpchips .chip").forEach(c => c.setAttribute("aria-pressed", String(c === a))); paintPrompt(); return; }
      if (act === "pcopy") { const ta = $(".lptext"); (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).then(() => { $(".lmsg").textContent = "已複製。"; }, () => { ta.select(); document.execCommand && document.execCommand("copy"); $(".lmsg").textContent = "已選取，請手動複製。"; }); return; }
    });
    B.addEventListener("change", e => {
      const t = e.target, act = t.dataset && t.dataset.act;
      if (act === "hin") readCSV(t, rows => { const H = rows.slice(/[^\d.\s,]/.test(rows[0].join("")) && !/^\d/.test(rows[0][0]) ? 1 : 0).map(r => ({ code: String(r[0]).trim(), shares: parseFloat(r[1]), cost: parseFloat(r[2]), px: ok(parseFloat(r[3])) ? parseFloat(r[3]) : null, ind: (r[4] || "").trim() })).filter(h => h.code && h.shares > 0 && h.cost > 0); set(K.hold, H); openTool("hold"); });
      if (act === "jin") readCSV(t, rows => { const T = rows.filter(r => /\d{4}-\d{2}-\d{2}/.test(r[0])).map(r => { const o = { id: uid() }; TCOLS.forEach(([k], i) => { o[k] = (r[i] || "").trim(); }); ["qty", "pin", "pout", "stop"].forEach(k => { o[k] = parseFloat(o[k]); }); return o; }).filter(x => x.code && x.qty > 0 && x.pin > 0); set(K.trades, get(K.trades, []).concat(T)); openTool("journal"); });
      if (act === "ccheck") { const c = get(K.check, {}); c[t.dataset.k] = t.checked; set(K.check, c); }
      if (act === "cfact" || act === "cguess") { set(K.events, get(K.events, []).map(x => (x.id === t.dataset.id ? Object.assign(x, act === "cfact" ? { fact: t.value } : { guess: t.value }) : x))); paintCal(); }
      if (t.name === "strat" && TOOL === "bt") { const s = get(K.bt, {}); s.strat = t.value; s.prm = {}; set(K.bt, s); openTool("bt"); }
      if (/^(cash|tol|cap)$/.test(t.name) && TOOL === "hold") { saveHoldPrefs(); paintHold(); }
      if (t.classList.contains("lpdata") || t.classList.contains("lpcode")) paintPrompt();
    });
  }
  function saveHoldPrefs() {
    const v = n => parseFloat(($(`[name="${n}"]`) || {}).value);
    if (ok(v("cash"))) set(K.cash, v("cash")); else set(K.cash, 0);
    set(K.pref, Object.assign(get(K.pref, {}), ok(v("tol")) ? { tol: v("tol") } : {}, ok(v("cap")) ? { cap: v("cap") } : {}));
  }
  function alertMsg(t) { let m = $(".lalert"); if (!m) { m = document.createElement("p"); m.className = "sub warn lalert"; m.setAttribute("role", "status"); const f = $(".dcard"); f && f.appendChild(m); } m.textContent = t; }

  /* ---------------- start (twmain dispatches twdash:ready once its helpers exist) ---------------- */
  document.addEventListener("twdash:ready", () => {
    A = window.TWDash && window.TWDash.api; if (!A || !box()) return;
    bind();
    const t = get(K.tool, ""); t ? openTool(t) : menu();
    const tab = document.querySelector('.dtabs [data-p="dpLab"]');
    if (tab) new MutationObserver(() => { if (tab.getAttribute("aria-selected") === "true") { requestAnimationFrame(() => drawIn(box())); if (TOOL === "hold") paintHold(); } }).observe(tab, { attributes: true, attributeFilter: ["aria-selected"] });
  });
  document.addEventListener("twdash:list", () => { if (TOOL === "hold") paintHold(); });
})();
