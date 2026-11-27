/* ===== twlab.js ===== */
try {
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
  const K = { hold: "twlab-hold", cash: "twlab-cash", pref: "twlab-pref", trades: "twlab-trades", events: "twlab-events", tool: "twlab-tool", dcf: "twlab-dcf", bt: "twlab-bt", peers: "twlab-peers", mc: "twlab-mc", check: "twlab-check" };
  const get = (k, d) => A.store.get(k, d), set = (k, v) => { A.store.set(k, v); if (k === K.hold) document.dispatchEvent(new Event("twlab:hold")); };

  const TOOLS = [
    ["hold", "持股風險", "集中度、相關性、β、市場下跌 20% 壓力測試與再平衡比較", "#5"],
    ["journal", "交易日誌", "勝率、盈虧比、獲利因子、持有時間與違反規則的交易", "#6"],
    ["tech", "技術情境", "日線＋週線的支撐壓力、趨勢線與偏多／盤整／偏空條件", "#2"],
    ["bt", "策略回測", "含手續費、證交稅、滑價，樣本內外分開看", "#4"],
    ["mc", "時光機", "拿過去 N 天的真實走勢隨機重播一萬次：先碰停利、先碰停損、還是都沒碰到", "#4+"],
    ["pnl", "損益日曆", "持股每天的損益用月曆熱度顯示，點一天看當天每檔的貢獻", "#7"],
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
    return `<div class="dcard lrise"><div class="lhead"><div><h3>技術情境</h3></div>
      <div class="lform lhide"><input class="in lcode" value="${A.esc(A.code())}" aria-label="股票代號" inputmode="numeric"></div></div><p class="sub lwho">分析對象：${A.esc(nameOf(A.code()))} ${A.esc(A.code())}（目前開啟的個股，資料自動讀取）</p>
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
    const s = Object.assign({ code: A.code(), strat: "ma", months: 24, stop: 0, prm: {} }, get(K.bt, {}), { code: A.code() }), P = prefs();
    return `<div class="dcard lrise"><h3>策略回測</h3><p class="sub lwho">分析對象：${A.esc(nameOf(A.code()))} ${A.esc(A.code())}（目前開啟的個股，資料自動讀取）</p>
      <div class="chips lbchips">${Object.entries(STRATS).map(([k, v]) => `<button type="button" class="chip" data-act="bpick" data-s="${k}" aria-pressed="${k === s.strat}">${v.name}</button>`).join("")}</div>
      <div class="lform lbform lhide">
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


  /* ================= 時光機（歷史日報酬自助抽樣，重播一萬次） ================= */
  function viewMC() {
    const s = Object.assign({ code: A.code(), entry: "", tp: 8, sl: 5, days: 20, look: 60 }, get(K.mc, {}), { code: A.code(), entry: "" });
    return `<div class="dcard lrise"><h3>時光機</h3><p class="sub lwho">分析對象：${A.esc(nameOf(A.code()))} ${A.esc(A.code())}（目前開啟的個股，資料自動讀取）</p>
      <p class="sub">假設以最新收盤進場、停利 ${s.tp}%、停損 ${s.sl}%、最多持有 ${s.days} 個交易日，用最近 ${s.look} 個交易日的真實日報酬重播。</p>
      <div class="lform lmform lhide">
        <label>代號 <input class="in" name="code" value="${A.esc(s.code)}" inputmode="numeric"></label>
        <label>進場價（空白＝最新收盤）<input class="in" name="entry" inputmode="decimal" value="${s.entry}"></label>
        <label>停利 % <input class="in" name="tp" inputmode="decimal" value="${s.tp}"></label>
        <label>停損 % <input class="in" name="sl" inputmode="decimal" value="${s.sl}"></label>
        <label>持有最多（交易日）<input class="in" name="days" inputmode="numeric" value="${s.days}"></label>
        <label>取樣最近（交易日）<select class="in" name="look">${[60, 120, 250].map(m => `<option value="${m}" ${m === +s.look ? "selected" : ""}>${m} 日</option>`).join("")}</select></label>
        <button type="button" class="aigo" data-act="mgo">重播一萬次</button>
      </div>
      <p class="sub lmsg"></p><div class="lmc"></div></div>`;
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
  function mcSVG(r, P0, days) {
    const W = 640, H = 340, P = 46, lo = r.dn - (r.up - r.dn) * 0.08, hi = r.up + (r.up - r.dn) * 0.08, d2 = A.dig(P0);
    const X = i => P + i / days * (W - P - 70), Y = v => 10 + (hi - v) / (hi - lo) * (H - 34);
    const hl = (v, cls, t) => `<g class="mcb"><line class="mcl ${cls}" x1="${P}" x2="${W - 70}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><rect class="mctag ${cls}" x="${W - 66}" y="${(Y(v) - 10).toFixed(1)}" width="64" height="20" rx="5"/><text class="mctx" x="${W - 34}" y="${(Y(v) + 4).toFixed(1)}">${t} ${A.fmt(v, d2)}</text></g>`;
    const grid = [0, Math.round(days / 2), days].map(i => `<text class="mcb" x="${X(i)}" y="${H - 6}" text-anchor="middle">第 ${i} 日</text>`).join("") + [lo, P0, hi].map(v => `<g class="mcb"><line class="gridl" x1="${P}" x2="${W - 70}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="0" y="${(Y(v) + 4).toFixed(1)}">${A.fmt(v, d2)}</text></g>`).join("");
    const paths = r.paths.map(p => `<path class="mcp ${p.res > 0 ? "t" : p.res < 0 ? "s" : "n"}" d="${p.v.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join("")}"/>`).join("");
    return `<svg class="lfig mcfig" viewBox="0 0 ${W} ${H}" role="img" aria-label="時光機：${r.paths.length} 條抽樣路徑">${grid}${hl(r.up, "t", "停利")}${hl(r.dn, "s", "停損")}${paths}<circle class="mcb mcdot" cx="${X(0)}" cy="${Y(P0).toFixed(1)}" r="5"/></svg>`;
  }
  /* backdrop first (grid, stop/target lines, entry dot), then the paths run out from the entry point, then the result bars */
  function mcPlay(root) {
    const svg = root.querySelector(".mcfig"); if (!svg) return;
    const bk = Array.from(svg.querySelectorAll(".mcb")), ps = Array.from(svg.querySelectorAll(".mcp"));
    bk.forEach((g, i) => g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, delay: i * 60, fill: "backwards" }));
    const t0 = bk.length * 60 + 300;
    ps.forEach((p, i) => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 1400, delay: t0 + (i % 50) * 18, easing: "ease-out", fill: "backwards" }); });
    const t1 = t0 + 50 * 18 + 1400;
    Array.from(root.querySelectorAll(".mcres .lbar i")).forEach((b, i) => b.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 600, delay: t1 + i * 150, easing: "cubic-bezier(.2,.9,.3,1)", fill: "backwards" }));
    Array.from(root.querySelectorAll(".mcres .lrise")).forEach((b, i) => b.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 400, delay: t1 + i * 150, fill: "backwards" }));
  }
  async function mcRun() {
    const f = n => $(`.lmform [name="${n}"]`), code = f("code").value.trim(), msg = $(".lmsg"), out = $(".lmc");
    const tp = Math.max(0.1, parseFloat(f("tp").value) || 8), sl = Math.max(0.1, Math.min(90, parseFloat(f("sl").value) || 5)), days = Math.max(1, Math.min(250, parseInt(f("days").value, 10) || 20)), look = +f("look").value || 60, entryIn = parseFloat(f("entry").value);
    set(K.mc, { code, entry: ok(entryIn) ? entryIn : "", tp, sl, days, look });
    if (!A.DB.by.get(code)) { msg.textContent = "找不到這個代號（支援上市、上櫃股票與 ETF）。"; return; }
    const cs = await bars(code, Math.ceil(look / 20) + 1, (i, n) => { msg.textContent = `讀取日線 ${i}/${n} 個月…`; });
    if (cs.length < Math.min(look, 40) + 1) { msg.textContent = `日線只有 ${cs.length} 日，不夠取樣。`; return; }
    const last = cs[cs.length - 1][4], P0 = ok(entryIn) && entryIn > 0 ? entryIn : last, seed = Math.floor(Math.random() * 1e9);
    msg.textContent = "重播中…"; await new Promise(r => setTimeout(r, 30));
    const runs = 10000, r = simulate(cs, look, P0, tp / 100, sl / 100, days, runs, seed), pc = x => x / runs * 100, d2 = A.dig(P0);
    const gap = pc(r.nT) - pc(r.nS), verdict = Math.abs(gap) < 8 ? "跟擲硬幣差不多" : gap > 0 ? "先碰停利的機會較高" : "先碰停損的機會較高";
    const ev = (pc(r.nT) * tp - pc(r.nS) * sl) / 100;
    const res = (t, n, cls, sub) => `<div class="mcrow lrise"><span>${t}</span><b class="${cls === "pos" ? "up" : cls === "neg" ? "down" : ""}">${A.fmt(pc(n), 1)}%</b>${bar(pc(n), 100, cls)}<em class="sub">${sub}</em></div>`;
    out.innerHTML = `
      ${mcSVG(r, P0, days)}
      <p class="sub"><i class="lg mct"></i>先碰停利 <i class="lg mcs"></i>先碰停損 <i class="lg mcn"></i>期限到都沒碰（畫出其中 ${r.paths.length} 條）</p>
      <div class="lgrid2 mcres">
        <div>${res("先碰停利", r.nT, "pos", `+${tp}% → ${A.fmt(r.up, d2)}`)}${res("先碰停損", r.nS, "neg", `−${sl}% → ${A.fmt(r.dn, d2)}`)}${res(`${days} 日內都沒碰到`, r.nN, "", `期末中位數 ${A.fmt(r.q50, d2)}`)}
          <div class="mcverdict lrise"><b>${verdict}</b><span class="sub">停利 ${A.fmt(pc(r.nT), 1)}% vs 停損 ${A.fmt(pc(r.nS), 1)}%；只算碰到的部分，每筆期望 ${A.signed(ev, 2)}%（未扣成本）</span></div></div>
        <div>${kv("進場價", A.fmt(P0, d2) + (P0 === last ? "（最新收盤）" : `（最新收盤 ${A.fmt(last, d2)}）`))}${kv("取樣", `${iso(r.from)}～${iso(r.to)}，${r.n} 根日 K`)}${kv("重播", `${runs.toLocaleString()} 次 × 最多 ${days} 日・seed ${seed}`)}
          ${kv("平均幾天碰到", ok(r.avgDay) ? A.fmt(r.avgDay, 1) + " 日" : "—")}${kv("期末價 10%／50%／90%", `${A.fmt(r.q10, d2)}／${A.fmt(r.q50, d2)}／${A.fmt(r.q90, d2)}`)}
          ${kv("同一天兩邊都碰到", `${r.both} 次（日 K 看不出先後，保守算停損）`)}</div>
      </div>
      ${note("假設：未來每天的漲跌像是從最近 N 日隨機抽出來的（自助抽樣，日與日之間獨立）。它只告訴你「如果接下來跟最近差不多」會怎樣，抓不到趨勢延續、消息面、除權息、跳空與漲跌停鎖死。研究輔助用途｜不保證獲利。")}`;
    msg.textContent = `完成：${nameOf(code)}（${code}）`;
    mcPlay(out);
  }

  /* ================= 損益日曆 ================= */
  function viewPnl() {
    const H = get(K.hold, []);
    return `<div class="dcard lrise"><h3>損益日曆</h3>${H.length ? `<p class="sub lwho">依「持股風險」裡的 ${H.length} 檔持股股數，用每日收盤價變動計算（不含手續費與股利）。</p>` : `<p class="sub lwho">沒有資料：請先到「持股風險」輸入持股。</p>`}
      <p class="sub lmsg"></p><div class="lpnl"></div><div class="lpnld"></div></div>`;
  }
  async function pnlRun() {
    const H = get(K.hold, []).filter(h => ok(h.shares) && h.shares > 0), msg = $(".lmsg"), out = $(".lpnl"); if (!H.length || !out) return;
    const daily = {};   /* date → { total, by: [[code, amount]] } */
    for (let n = 0; n < H.length; n++) {
      const h = H[n]; msg.textContent = `讀取日線 ${n + 1}/${H.length}…`;
      let cs = []; try { cs = await bars(h.code, 3); } catch (e) {}
      for (let i = 1; i < cs.length; i++) { const d = cs[i][0], amt = (cs[i][4] - cs[i - 1][4]) * h.shares; const o = (daily[d] = daily[d] || { total: 0, by: [] }); o.total += amt; o.by.push([h.code, amt]); }
    }
    const days = Object.keys(daily).sort(); if (!days.length) { msg.textContent = "沒有資料。"; return; }
    msg.textContent = "";
    const fmtM = v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(Math.round(v)).toLocaleString("zh-TW"), mx = Math.max(1, ...days.map(d => Math.abs(daily[d].total)));
    const months = [...new Set(days.map(d => d.slice(0, 6)))].slice(-2);
    out.innerHTML = months.map(ym => {
      const y = +ym.slice(0, 4), m = +ym.slice(4, 6), first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), dim = new Date(Date.UTC(y, m, 0)).getUTCDate(), tot = days.filter(d => d.startsWith(ym)).reduce((t, d) => t + daily[d].total, 0);
      let cells = "<i></i>".repeat(first);
      for (let d = 1; d <= dim; d++) { const k = ym + String(d).padStart(2, "0"), o = daily[k]; cells += o ? `<button type="button" class="pnlc ${o.total >= 0 ? "up" : "down"}" data-d="${k}" style="--a:${(0.18 + Math.abs(o.total) / mx * 0.72).toFixed(2)}"><b>${d}</b><span>${fmtM(o.total)}</span></button>` : `<i class="pnlx">${d}</i>`; }
      return `<div class="pnlm lrise"><div class="pnlh"><b>${y}/${m}</b><span class="${A.tone(tot)}">本月 ${fmtM(tot)} 元</span></div><div class="pnlw">${"日一二三四五六".split("").map(w => `<i>${w}</i>`).join("")}</div><div class="pnlg">${cells}</div></div>`;
    }).join("");
    out.onclick = e => { const b = e.target.closest("[data-d]"); if (!b) return; const o = daily[b.dataset.d], d = b.dataset.d;
      $(".lpnld").innerHTML = `<div class="pnldet"><b>${d.slice(4, 6)}/${d.slice(6)}　合計 <span class="${A.tone(o.total)}">${fmtM(o.total)} 元</span></b>${o.by.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).map(([c, v]) => `<div><span>${A.esc(nameOf(c))} ${A.esc(c)}</span><em class="${A.tone(v)}">${fmtM(v)}</em></div>`).join("")}</div>`; };
    A.rise($$(".pnlm", out), 80);
  }

  /* ================= 同業比較 ================= */
  function viewPeer() {
    const H = get(K.hold, []).map(h => h.code), def = get(K.peers, H.length ? H.join(" ") : "2330 2303 2454 3711 2379");
    return `<div class="dcard lrise"><div class="lhead"><div><h3>同業估值比較</h3></div>
      <div class="lform lhide"><input class="in lpeers" value="${A.esc(def)}" aria-label="代號清單"></div></div><p class="sub lwho">同業：自動挑出和目前個股同產業、成交值最大的幾檔。</p>
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

  async function autoPeers() {
    const cur = A.code(); await loadIndustry();
    const ind = industryOf(cur), val = s => (s.price || 0) * (s.vol || 0);
    let list = ind === "未知" || ind === "ETF" ? [] : A.DB.list.filter(s => /^\d{4}$/.test(s.code) && s.code !== cur && industryOf(s.code) === ind).sort((a, b) => val(b) - val(a)).slice(0, 7).map(s => s.code);
    const codes = [cur, ...(list.length ? list : "2330 2303 2454 3711 2379".split(" ").filter(c => c !== cur))];
    $(".lpeers").value = codes.join(" "); peerRun();
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
      </div>
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
      text += `\n\n---\n以下是 TWstock 從臺灣證券交易所公開資料整理的數據（資料日期 ${d}，${A.DB.live ? "收盤資料" : "讀不到資料"}；未經你驗證）：\n` + (F ? "技術與基本面摘要（JSON）：\n" + JSON.stringify(F) + "\n" : "") + (csv ? `\n日線 OHLCV（成交量單位：張）：\n${csv}` : "");
    }
    ta.value = text;
  }

  /* ---------------- shell: card menu → one tool, a button back to the menu ---------------- */
  const VIEWS = { hold: [viewHold, () => { loadIndustry().then(paintHold); paintHold(); }], journal: [viewJournal, paintJournal], tech: [viewTech, () => { techRun(); }], bt: [viewBT, () => { btRun(); }], mc: [viewMC, () => { mcRun().catch(err => { $(".lmsg").textContent = "出錯了：" + err.message; }); }], peer: [viewPeer, autoPeers], pnl: [viewPnl, () => { pnlRun(); }], dcf: [viewDCF, () => { if (get(K.dcf, null)) dcfRun(); }], cal: [viewCal, paintCal], prompt: [viewPrompt, paintPrompt] };
  let TOOL = null;
  function menu() {
    TOOL = null; set(K.tool, "");
    box().innerHTML = `<div class="lmenu">${TOOLS.map(([k, t, d, n]) => `<button type="button" class="dcard lcard lrise" data-tool="${k}"><b>${t}</b></button>`).join("")}</div>`;
    A.rise($$(".lrise"), 50);
  }
  function openTool(k) {
    if (!VIEWS[k]) return menu();
    TOOL = k; set(K.tool, k);
    const t = TOOLS.find(x => x[0] === k);
    box().innerHTML = `<div class="ltop"><button type="button" class="btn" data-act="back">← 研究室</button><h2>${t[1]}</h2></div>${VIEWS[k][0]()}<div class="lback"><button type="button" class="btn" data-act="back">← 回到研究室</button></div>`;
    VIEWS[k][1](); A.rise($$(".lrise"), 40); watchIn(box()); box().scrollIntoView({ block: "nearest" });
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
      if (act === "bpick") { const b = get(K.bt, {}); b.strat = a.dataset.s; b.prm = {}; set(K.bt, b); openTool("bt"); return; }
      if (act === "tgo") { a.disabled = true; techRun().finally(() => { a.disabled = false; }); return; }
      if (act === "mgo") { a.disabled = true; mcRun().catch(err => { $(".lmsg").textContent = "出錯了：" + err.message; }).finally(() => { a.disabled = false; }); return; }
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
    /* time machine: 10,000 bootstrap replays of the last 60 days, the user's saved target / stop */
    const mp = Object.assign({ tp: 8, sl: 5, days: 20, look: 60 }, get(K.mc, {})), sim = simulate(cs, Math.min(mp.look, n - 1), c, mp.tp / 100, mp.sl / 100, mp.days, 10000, 19);
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
    const d = get(K.dcf, null);
    if (d && d.code === code && d.cases) { const v = dcfVal(Object.assign({}, DCF0, d), d.cases["基準"].g, d.cases["基準"].m, d.r, d.gT); if (v && ok(v.ps)) out.myValuation = { baseCaseValuePerShare: r2v(v.ps), discountRatePct: d.r, growthPct: d.cases["基準"].g }; }
    return out;
  }
  window.TWLab = { research: (code, onStep) => (A ? research(code, onStep) : Promise.resolve(null)), bars };

  /* ---------------- start (twmain dispatches twdash:ready once its helpers exist) ---------------- */
  document.addEventListener("twdash:ready", () => {
    A = window.TWDash && window.TWDash.api; if (!A || !box()) return;
    bind();
    const t = get(K.tool, ""); t ? openTool(t) : menu();
    const det = box().closest("details");
    if (det) det.addEventListener("toggle", () => { if (det.open) { requestAnimationFrame(() => drawIn(box())); if (TOOL === "hold") paintHold(); } });
  });
  document.addEventListener("twdash:list", () => { if (TOOL === "hold") paintHold(); });
})();
} catch (e) { setTimeout(() => { throw e; }, 0); }
/* ===== twmain.js ===== */
try {
/* TWstock: the whole app in three tabs.
   總覽      four indices (TAIEX, TAIEX futures, electronics, finance), a market strip, and every TWSE-listed stock in one
             searchable, sortable list (price, change, volume, ★ to follow).
   自選股    the followed stocks as cards.
   個股分析  one stock: price, K-line with moving averages, Bollinger bands, volume, KD, MACD and RSI, a rule-based
             technical snapshot, fundamentals and institutional flows, news and announcements, and the AI analyst team.

   Data
   - Closing data straight from TWSE open data (works without any backend): STOCK_DAY_ALL, MI_INDEX, FMTQIK, BFI82U,
     STOCK_DAY (history), BWIBBU_ALL, t187ap05_L, T86.
   - Intraday quotes, the futures quote, headlines and the AI analysis come from the Worker (/tw/rt, /tw/news,
     /tw/analyze in the EZexams repo, tools/ezexams-worker.js). When the Worker does not answer, the page keeps
     working on closing data and says what could not be read.
   - Anything that cannot be read is shown as "讀不到": no sample numbers, no stale or fallback values.
   No accounts: the watchlist stays in this browser, and a random device id (twstock-device) tells the Worker which
   device's saved analyses and alert list are which. */
(function () {
  "use strict";
  const root = document.getElementById("dash");
  if (!root) return;
  const WORKER = "https://twstock-ai.ta77199ta.workers.dev";
  /* this browser's random id, made once; the Worker keys today's saved analyses and the alert list by it */
  const DEVICE = (() => {
    let d = null; try { d = localStorage.getItem("twstock-device"); } catch (e) {}
    if (!/^[0-9a-f]{32}$/.test(d || "")) {
      d = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");
      try { localStorage.setItem("twstock-device", d); } catch (e) {}
    }
    return d;
  })();
  const NS = "http://www.w3.org/2000/svg";
  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => Array.from(r.querySelectorAll(s));
  const ok = Number.isFinite;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = v => { const n = parseFloat(String(v == null ? "" : v).replace(/[,\s%]/g, "").replace(/^\+/, "")); return ok(n) ? n : NaN; };
  const fmt = (n, d = 0) => (ok(n) ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
  const dig = p => (p >= 1000 ? 0 : p >= 100 ? 1 : 2);
  const signed = (v, d = 2) => (ok(v) ? (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v), d) : "—");
  const pct = v => (ok(v) ? signed(v, 2) + "%" : "—");
  const tone = v => (v > 0 ? "up" : v < 0 ? "down" : "");
  const arrow = v => (v > 0 ? "▲" : v < 0 ? "▼" : "");
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const whyOf = e => (e && /^HTTP (\d+)/.test(e.message || "") ? "Worker 或來源回應錯誤，" + e.message : e && e.message && !/Failed to fetch|Load failed|NetworkError/i.test(e.message) ? e.message : "網路連不上 Worker 或來源");
  const J = url => fetch(url, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  /* "115/11/03" (ROC year), "2026/11/03" and "1151103" all become "20261103" */
  const ymd = v => { const m = String(v).match(/(\d{2,4})\D?(\d{2})\D?(\d{2})/); if (!m) return ""; let y = +m[1]; if (y < 1911) y += 1911; return y + m[2] + m[3]; };
  const slash = ds => (ds ? `${ds.slice(0, 4)}/${ds.slice(4, 6)}/${ds.slice(6)}` : "");
  const shortDay = ds => +ds.slice(4, 6) + "/" + +ds.slice(6);
  const pick = (o, ...subs) => { const k = Object.keys(o).find(x => subs.every(s => x.includes(s))); return k ? o[k] : undefined; };
  /* Taipei wall clock, wherever the device is */
  function taipei() {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", weekday: "short", hour: "2-digit", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit", hour12: false }).formatToParts(new Date());
    const g = t => (p.find(x => x.type === t) || {}).value || "";
    return { wd: g("weekday"), mins: +g("hour") % 24 * 60 + +g("minute"), ymd: g("year") + g("month") + g("day") };
  }
  const nightOpen = () => { const t = taipei(); return (!/Sat|Sun/.test(t.wd) && t.mins >= 900) || (!/Sun|Mon/.test(t.wd) && t.mins < 300); };   /* futures night session 15:00–05:00 */
  const marketOpen = () => { const t = taipei(); return !/Sat|Sun/.test(t.wd) && t.mins >= 525 && t.mins <= 825; };   /* 08:45–13:45 */

  /* ---------------- state ---------------- */
  const DEFAULT_WATCH = ["2330", "2317", "2454", "2308", "2881", "0050"];
  const DB = { list: [], by: new Map(), live: false, date: "", rt: null, rtAt: "", err: "" };
  const IDX = [{ k: "t00", name: "加權指數", en: "TAIEX" }, { k: "fut", name: "台指期", en: "TX" }, { k: "o00", name: "櫃買指數", en: "TPEx" }, { k: "exf", name: "電子期", en: "EXF" },
    { k: "dji", name: "道瓊", en: "DJIA", us: "^DJI" }, { k: "spx", name: "標普 500", en: "S&P 500", us: "^GSPC" }, { k: "ixic", name: "那斯達克", en: "NASDAQ", us: "^IXIC" }, { k: "sox", name: "費城半導體", en: "SOX", us: "^SOX" }];
  const T_START = Date.now(); setTimeout(() => { try { paintIdx(); } catch (e) {} }, 31000); setTimeout(() => { try { paintIdx(); } catch (e) {} }, 6200);   /* "讀不到資料" only after 30 seconds of trying */
  const isFut = k => k === "fut" || k === "exf";
  const MKT = { rows: null, inst: null };          /* TAIEX history rows and the institutions of the day */
  let WATCH = store.get("twtrade-watch", DEFAULT_WATCH);
  /* five watchlists 自選1–自選5; 自選1 is WATCH (the 自選股 tab, sidebar, alerts) */
  const WL_SEED = [
    ["6770", "2383", "3260", "4967", "5475", "8358", "3131", "6187", "3583", "2330", "2454", "2317", "2303", "3037", "2515", "1711", "2103", "3231", "2408", "2382", "1301", "6285", "2883", "1314", "2485", "3481", "3017", "1802", "2308", "2449", "2327", "4916", "2367", "5309", "7742"],
    ["2887", "0050", "0056", "00878", "00919", "00929", "006208", "00403A", "0052"]];
  let LISTS = store.get("twtrade-wl", null);
  if (!Array.isArray(LISTS) || LISTS.length !== 5) LISTS = [WATCH.slice(), [], [], [], []];
  if (!store.get("twtrade-wl-seed", 0)) { LISTS[0] = WL_SEED[0].slice(); LISTS[1] = WL_SEED[1].slice(); WATCH = LISTS[0]; store.set("twtrade-watch", WATCH); store.set("twtrade-wl", LISTS); store.set("twtrade-wl-seed", 1); }
  LISTS[0] = WATCH;
  const listIdx = () => (/^w[1-5]$/.test(VIEW.preset) ? +VIEW.preset[1] - 1 : 0);
  const IND = Object.assign({ ma: true, boll: false, vol: true, kd: true, macd: false, rsi: false }, store.get("twmain-ind", {}));
  let SPAN = store.get("twmain-span", 60);
  const VIEW = { q: "", preset: "w1", key: "ord", dir: 1, shown: 50 };
  let CODE = store.get("twmain-code", "2330");

  /* ---------------- loaders: closing data from TWSE open data ---------------- */
  function setList(list, live, date) {
    DB.list = list; DB.by = new Map(list.map(s => [s.code, s])); DB.live = live; DB.date = date || DB.date;
  }
  /* every listed stock at the close. Two TWSE sources are read side by side and the newer one wins:
     the exchange's own daily report (MI_INDEX, same evening) and the open-data copy (STOCK_DAY_ALL, often a day late).
     Stocks without a trade that day are kept (price shown as —) so every listed code can still be searched. */
  const mk = (code, name, price, chg, open, high, low, lots) => {
    const prev = ok(price) && ok(chg) ? price - chg : NaN;
    return { code: String(code).trim(), name: String(name).trim(), price, prev, chg: ok(chg) ? chg : 0, pct: prev ? chg / prev * 100 : 0, open, high, low, vol: ok(lots) ? lots : 0 };
  };
  async function listOpenData() {
    const rows = await J("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL");
    let date = "";
    const list = rows.map(x => { if (!date && x.Date) date = ymd(x.Date);
      return mk(x.Code, x.Name, num(x.ClosingPrice), num(x.Change), num(x.OpeningPrice), num(x.HighestPrice), num(x.LowestPrice), Math.round(num(x.TradeVolume) / 1000)); });
    return { list, date };
  }
  async function listDaily() {
    const t = taipei(), start = new Date(+t.ymd.slice(0, 4), +t.ymd.slice(4, 6) - 1, +t.ymd.slice(6));
    if (t.mins < 14 * 60 + 30) start.setDate(start.getDate() - 1);       /* today's report appears after about 14:30 */
    for (let back = 0; back < 6; back++) {
      const d = new Date(start.getTime() - back * 864e5); if (d.getDay() % 6 === 0) continue;
      const ds = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
      const j = await J(`https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${ds}&type=ALLBUT0999&response=json`);
      const tb = (j.tables || []).find(x => Array.isArray(x.fields) && x.fields.includes("證券代號") && x.fields.includes("收盤價") && (x.data || []).length > 100);
      if (j.stat !== "OK" || !tb) { await wait(400); continue; }
      const f = k => tb.fields.findIndex(x => x.includes(k)), iC = f("證券代號"), iN = f("證券名稱"), iV = f("成交股數"), iO = f("開盤價"), iH = f("最高價"), iL = f("最低價"), iZ = f("收盤價"), iS = f("漲跌(+/-)"), iD = f("漲跌價差");
      const list = tb.data.map(r => { const sign = /-|－|green/.test(String(r[iS])) ? -1 : 1;
        return mk(r[iC], r[iN], num(r[iZ]), sign * Math.abs(num(r[iD]) || 0), num(r[iO]), num(r[iH]), num(r[iL]), Math.round(num(r[iV]) / 1000)); });
      return { list, date: ds };
    }
    throw new Error("no daily report");
  }
  /* 上櫃 and 興櫃 at the close, through the Worker (TPEx open data cannot be read by pages on other sites) */
  async function listOTC() {
    /* published every 10 minutes by the "OTC list" GitHub Actions job (TPEx refuses both the page and the Worker) */
    let j = null;
    try { j = await J("https://raw.githubusercontent.com/SI70531/TWstock/data/otc.json"); } catch (e) { j = await J(`${WORKER}/tw/otc`); }
    if (j && j.ind && typeof j.ind === "object") INDMAP = j.ind;
    return (j.list || []).map(([c, n, z, ch, o, h, l, v, m]) => Object.assign(mk(c, n, z == null ? NaN : z, ch == null ? NaN : ch, o == null ? NaN : o, h == null ? NaN : h, l == null ? NaN : l, v), { mkt: m }))
      .filter(s => s.code && s.name);
  }
  async function loadList() {
    const otc = listOTC().catch(() => []);
    const got = (await Promise.allSettled([listDaily(), listOpenData()])).filter(r => r.status === "fulfilled" && r.value.list.length > 100).map(r => r.value);
    if (!got.length) throw new Error("no list");
    got.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.list.length - a.list.length));
    const best = got[0], names = new Map(best.list.map(s => [s.code, s]));
    got.slice(1).forEach(g => g.list.forEach(s => { if (!names.has(s.code)) names.set(s.code, Object.assign(s, { price: NaN, chg: 0, pct: NaN, vol: 0, stale: true })); }));
    (await otc).forEach(s => { if (!names.has(s.code)) names.set(s.code, s); });
    setList([...names.values()].filter(s => s.code && s.name), true, best.date);
  }
  /* indices at the close (used until the Worker supplies intraday values) */
  async function loadIdxEod() {
    const a = await J("https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX");
    const want = { t00: /^發行量加權股價指數$/ };
    a.forEach(x => {
      const nk = Object.keys(x).find(key => key === "指數") || Object.keys(x).find(key => key.includes("指數") && !key.includes("收盤"));
      const name = String(x[nk] || "").trim();
      const k = Object.keys(want).find(key => want[key].test(name)); if (!k) return;
      const z = num(pick(x, "收盤")), dir = String(x["漲跌"] || "").trim(); let d = num(pick(x, "點數"));
      if (!ok(z)) return;
      if (/^[-－]/.test(dir)) d = -Math.abs(d); else if (/^[+＋]/.test(dir)) d = Math.abs(d);
      const it = IDX.find(i => i.k === k);
      if (!it.rt) Object.assign(it, { z, y: ok(d) ? z - d : NaN, h: NaN, l: NaN, tm: "", src: "收盤" });
    });
  }
  /* TAIEX and turnover by day: rows [yyyymmdd, 億股, 億元, 萬筆, index, change]; finished months are kept in this browser */
  async function loadMonth(ym, finished) {
    const key = "twdash-m-" + ym, hit = finished && store.get(key, null);
    if (hit && hit.length) return hit;
    const j = await J(`https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date=${ym}01&response=json`);
    if (j.stat !== "OK" || !Array.isArray(j.data)) return [];
    const rows = j.data.map(r => [ymd(r[0]), num(r[1]) / 1e8, num(r[2]) / 1e8, num(r[3]) / 1e4, num(r[4]), num(r[5])]).filter(r => r[0] && r[4] > 0);
    if (finished && rows.length) store.set(key, rows);
    return rows;
  }
  const monthsBack = n => { const now = new Date(), out = []; for (let i = 0; i < n; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0")); } return out; };
  async function loadMarket() {
    const out = [];
    const ms = monthsBack(4);
    for (let i = 0; i < ms.length; i++) {
      if (i && !store.get("twdash-m-" + ms[i], null)) await wait(450);
      try { out.unshift(...(await loadMonth(ms[i], i > 0))); } catch (e) { if (!out.length) return; break; }
    }
    if (out.length < 2) return;
    MKT.rows = out;
    for (const ds of [out[out.length - 1][0], out[out.length - 2][0]]) {
      try {
        const j = await J(`https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate=${ds}&response=json`);
        if (j.stat !== "OK" || !Array.isArray(j.data) || !j.data.length) { await wait(450); continue; }
        const o = { date: ds, f: 0, t: 0, d: 0 }; let seen = 0;
        j.data.forEach(r => {
          const n = String(r[0]).replace(/\s/g, ""), v = num(r[3]) / 1e8; if (!ok(v) || n.includes("合計")) return;
          if (n.includes("外資")) { o.f += v; seen++; } else if (n.includes("投信")) { o.t += v; seen++; } else if (n.includes("自營")) { o.d += v; seen++; }
        });
        if (seen) { MKT.inst = o; break; }
      } catch (e) { break; }
    }
  }

  /* ---------------- loaders: one stock ---------------- */
  /* daily bars [yyyymmdd, open, high, low, close, lots]; finished months are kept in this browser */
  const YH = new Map();                                       /* code → promise of a year of daily bars (上櫃 / 興櫃) */
  async function histMonth(code, ym, finished) {
    const key = `twh:${code}:${ym}`, hit = finished && store.get(key, null);
    if (hit) return hit;
    const mkt = (DB.by.get(code) || {}).mkt;
    if (mkt === "otc" || mkt === "esb") {                       /* 上櫃 / 興櫃: about a year of daily bars from Yahoo Taiwan through the Worker */
      if (!YH.has(code)) YH.set(code, J(`${WORKER}/tw/hist?c=${code}`).then(j => j.rows || [], e => { YH.delete(code); throw e; }));
      const rows = (await YH.get(code)).filter(r => r[0].startsWith(ym)).map(r => [r[0], r[1], r[2], r[3], r[4], Math.round(r[5] > 1e5 ? r[5] / 1000 : r[5])]);
      if (finished && rows.length) store.set(key, rows);
      return rows;
    }
    const j = await J(`https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${ym}01&stockNo=${code}`);
    const rows = (j.data || []).map(r => [ymd(r[0]), num(r[3]), num(r[4]), num(r[5]), num(r[6]), Math.round(num(r[1]) / 1000)]).filter(r => r[0] && r.slice(1, 5).every(v => v > 0));
    if (finished) store.set(key, rows);
    return rows;
  }
  const HIST = new Map();                          /* code → { cs, full } */
  async function loadHist(code, onMore) {
    const hit = HIST.get(code);
    if (hit) return hit.cs;
    const s = DB.by.get(code);
    if (!DB.live) return null;
    const ms = monthsBack(7);
    let cs = [];
    try { cs = [...(await histMonth(code, ms[1], true)), ...(await histMonth(code, ms[0], false))]; } catch (e) { return null; }
    if (cs.length < 5) return null;
    const rec = { cs, full: false }; HIST.set(code, rec);
    (async () => {                                 /* the older months arrive in the background (120-day view, MA60) */
      for (let i = 2; i < ms.length; i++) {
        if (!store.get(`twh:${code}:${ms[i]}`, null)) await wait(600);
        try { rec.cs = [...(await histMonth(code, ms[i], true)), ...rec.cs]; } catch (e) { break; }
      }
      rec.full = true; onMore && onMore(rec.cs);
    })();
    return cs;
  }
  /* TWSE open data: through the worker first (no CORS problem there), straight from the browser as the fallback */
  const openJ = async p => { try { const a = await J(`${WORKER}/tw/open?p=${encodeURIComponent(p)}`); if (Array.isArray(a) && a.length) return a; } catch (e) {} return J("https://openapi.twse.com.tw/v1/" + p); };
  const FUND = { map: null, busy: null };
  function loadFund() {
    if (FUND.map || !DB.live) return Promise.resolve();
    if (FUND.busy) return FUND.busy;
    FUND.busy = (async () => {
      const m = new Map();
      try { (await openJ("exchangeReport/BWIBBU_ALL")).forEach(x => m.set(String(x.Code), { pe: num(x.PEratio), yld: num(x.DividendYield), pb: num(x.PBratio) })); } catch (e) {}
      try {
        (await openJ("opendata/t187ap05_L")).forEach(x => {
          const c = String(pick(x, "公司代號") || ""), o = m.get(c) || {};
          o.rev = num(pick(x, "當月營收")) / 1e5; o.yoy = num(pick(x, "去年同月增減")); o.mom = num(pick(x, "上月比較增減")); o.ytd = num(pick(x, "前期比較增減")); o.ym = String(pick(x, "資料年月") || "");
          if (c) m.set(c, o);
        });
      } catch (e) {}
      if (![...m.values()].some(o => o.pe > 0 || o.yld > 0 || o.pb > 0)) {
        /* openapi unreachable or empty: fall back on the same www.twse.com.tw host that already serves the chips */
        const start = DB.date ? new Date(+DB.date.slice(0, 4), +DB.date.slice(4, 6) - 1, +DB.date.slice(6)) : new Date();
        for (let back = 0; back < 6; back++) {
          const d = new Date(start.getTime() - back * 864e5), ds = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
          try {
            const j = await J(`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${ds}&selectType=ALL&response=json`);
            const F = j && j.fields, R = j && j.data; if (!F || !R || !R.length) continue;
            const f = k => F.findIndex(x => String(x).includes(k)), iC = f("代號"), iP = f("本益比"), iY = f("殖利率"), iB = f("淨值比");
            R.forEach(r => { const c = String(r[iC]).trim(), o = m.get(c) || {}; o.pe = num(r[iP]); o.yld = num(r[iY]); o.pb = num(r[iB]); m.set(c, o); });
            break;
          } catch (e) {}
        }
      }
      if (m.size) FUND.map = m; else setTimeout(() => { FUND.busy = null; }, 60000);
      if (m.size) FUND.busy = null;
    })();
    return FUND.busy;
  }
  const CHIP = { map: null, date: "", busy: null };
  function loadChip() {
    if (CHIP.map || !DB.live) return Promise.resolve();
    if (CHIP.busy) return CHIP.busy;
    CHIP.busy = (async () => {
      const start = DB.date ? new Date(+DB.date.slice(0, 4), +DB.date.slice(4, 6) - 1, +DB.date.slice(6)) : new Date();
      for (let back = 0; back < 6; back++) {
        const d = new Date(start.getTime() - back * 864e5), ds = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
        try {
          const j = await J(`https://www.twse.com.tw/rwd/zh/fund/T86?date=${ds}&selectType=ALLBUT0999&response=json`);
          if (j.stat !== "OK" || !j.data || !j.data.length) { await wait(400); continue; }
          const ix = (...subs) => j.fields.findIndex(f => subs.every(s => f.includes(s)));
          const iF = ix("外陸資買賣超股數", "不含"), iF2 = ix("外資", "買賣超"), iT = ix("投信買賣超"), iD = ix("自營商買賣超股數"), iA = ix("三大法人買賣超");
          const m = new Map();
          j.data.forEach(r => m.set(String(r[0]).trim(), { f: num(r[iF >= 0 ? iF : iF2]) / 1000, t: num(r[iT]) / 1000, d: iD >= 0 ? num(r[iD]) / 1000 : NaN, a: num(r[iA]) / 1000 }));
          if (m.size) { CHIP.map = m; CHIP.date = ds; break; }
        } catch (e) { break; }
      }
      CHIP.busy = null;
    })();
    return CHIP.busy;
  }

  /* ---------------- intraday quotes through the Worker ---------------- */
  let rtTimer = 0, rtBusy = false, rtFailAt = 0, rtFails = 0;
  /* live quotes stopped arriving: show "讀不到" instead of the last live numbers */
  function rtDrop() {
    DB.list.forEach(s => { if (s.rt) Object.assign(s, { price: NaN, chg: 0, pct: 0, rt: false, flash: "" }); });
    IDX.forEach(i => { if (i.rt && !i.us) Object.assign(i, { z: NaN, y: NaN, h: NaN, l: NaN, tm: "", src: "", rt: false }); });
    try { paintLive(); paintIdx(); } catch (e) {}
  }
  function rtCodes() {
    if (cur === "dpWatch") return WATCH.slice(0, 80);
    if (cur === "dpStock") return [CODE];
    if (cur === "dpHold" && window.TWExtra) { const c = TWExtra.liveCodes(); if (c.length) return c; }
    return $$("#dpList .mtbl tbody tr[data-code]").slice(0, 70).map(r => r.dataset.code);
  }
  function rtApply(x) {
    const s = DB.by.get(x.c); if (!s || !(x.z > 0) || !(x.y > 0)) return false;
    const had = s.rt, was = s.pct;
    s.flash = x.z > s.price ? "up" : x.z < s.price ? "down" : "";
    s.price = x.z; s.prev = x.y; s.chg = x.z - x.y; s.pct = (x.z / x.y - 1) * 100;
    if (x.o > 0) s.open = x.o; if (x.h > 0) s.high = x.h; if (x.l > 0) s.low = x.l; if (ok(x.v)) s.vol = x.v;
    s.tm = x.tm; s.day = x.d; s.rt = true;
    if (had && marketOpen()) moveAlert(s, was);
    return true;
  }
  /* the levels: limit up / down, then ±5%; a card appears when one of your stocks reaches a higher level than before (once per day) */
  const lvOf = p => (!ok(p) ? 0 : p >= 9.4 ? 2 : p >= 5 ? 1 : p <= -9.4 ? -2 : p <= -5 ? -1 : 0);
  function moveAlert(s, was) {
    if (!LISTS.some(l => l.includes(s.code))) return;
    const lv = lvOf(s.pct), pv = lvOf(was);
    if (!lv || (Math.sign(lv) === Math.sign(pv) && Math.abs(lv) <= Math.abs(pv))) return;
    const key = "twtoast-" + (s.day || "") + ":" + s.code + ":" + lv;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch (e) {}
    toast(s, lv);
  }
  let toastHost = null;
  function toast(s, lv) {
    if (!toastHost) { toastHost = document.createElement("div"); toastHost.className = "toasts"; toastHost.setAttribute("aria-live", "polite"); document.body.appendChild(toastHost); }
    const up = lv > 0, lim = Math.abs(lv) === 2, label = lim ? (up ? "漲停" : "跌停") : (up ? "漲逾 5%" : "跌逾 5%");
    const el = document.createElement("div");
    el.className = `toast ${up ? "up" : "down"}${lim ? " lim" : ""}`; el.dataset.code = s.code;
    el.innerHTML = `<span class="tt-badge">${label}</span><button type="button" class="tt-body" data-go="${esc(s.code)}"><b>${esc(s.name)} <i>${esc(s.code)}</i></b><span><em>${fmt(s.price, dig(s.price))}</em> <em>${pct(s.pct)}</em>　${esc((s.tm || "").slice(0, 5))}</span></button><button type="button" class="tt-x" aria-label="關閉">✕</button><i class="tt-life"></i>`;
    toastHost.prepend(el);
    while (toastHost.children.length > 4) toastHost.lastElementChild.remove();
    el.animate([{ opacity: 0, transform: "translateX(28px) scale(.96)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "none" }], { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" });
    if (lim) sparks($(".tt-badge", el), up);
    const life = $(".tt-life", el).animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: 9000, easing: "linear", fill: "forwards" });
    const close = () => { if (!el.isConnected) return; el.animate([{ opacity: 1 }, { opacity: 0, transform: "translateX(24px)" }], { duration: 200, fill: "forwards" }).onfinish = () => el.remove(); };
    life.onfinish = close;
    el.addEventListener("pointerenter", () => life.pause()); el.addEventListener("pointerleave", () => life.play());
    $(".tt-x", el).addEventListener("click", close);
    $(".tt-body", el).addEventListener("click", () => { close(); openStock(s.code); });
  }
  /* sparks fly out of the limit badge */
  function sparks(from, up) {
    const r = from.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let k = 0; k < 16; k++) {
      const d = document.createElement("i"); d.className = "spark " + (up ? "up" : "down"); d.style.left = cx + "px"; d.style.top = cy + "px"; document.body.appendChild(d);
      const ang = Math.random() * Math.PI * 2, dist = 30 + Math.random() * 70, sz = 0.6 + Math.random() * 0.8;
      d.animate([{ transform: `translate(-50%,-50%) scale(${sz})`, opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist + 18}px)) scale(0)`, opacity: 0 }],
        { duration: 650 + Math.random() * 450, easing: "cubic-bezier(.16,1,.3,1)" }).onfinish = () => d.remove();
    }
  }
  /* a stock just opened during trading hours: fetch its quote right away, outside the regular poll,
     and keep yesterday's close off the header until it arrives */
  async function quoteNow(code) {
    const s = DB.by.get(code); if (!s || s.rt || !DB.live || !marketOpen()) return;
    s.rtWait = true;
    try {
      const j = await J(`${WORKER}/tw/rt?c=${encodeURIComponent(code)}`);
      (j.q || []).forEach(rtApply);
      DB.rtSrc = j.src || DB.rtSrc;
    } catch (e) {}
    s.rtWait = false;
    if (CODE === code) { paintHead(); if (HIST.get(code)) drawChart(false); }
  }
  async function rtPoll() {
    if (rtBusy || !DB.live || document.hidden) return;
    if (DB.rt === false && Date.now() - rtFailAt < (marketOpen() || nightOpen() ? 4000 : 300000)) return;
    rtBusy = true;
    try {
      const codes = rtCodes(), wantIdx = cur === "dpOverview" || !IDX[0].rt;
      const j = await J(`${WORKER}/tw/rt?c=${codes.join(",")}${wantIdx ? "&idx=1" : ""}`);
      let any = false;
      (j.q || []).forEach(x => { if (rtApply(x)) any = true; });
      IDX.forEach(i => { if (!i.us) i.why = ""; });
      if (wantIdx) { const got = new Set((j.idx || []).filter(x => x.z > 0).map(x => x.c)); ["t00", "o00"].forEach(k => { const it = IDX.find(i => i.k === k); if (it && !got.has(k)) it.why = marketOpen() ? "證交所即時報價沒有回傳這個指數" : "非盤中，證交所沒有即時報價"; }); }
      if (j.exf && !(j.exf.z > 0)) IDX[3].why = j.exf.why || "Worker 沒有電子期報價"; else if (!j.exf && wantIdx) IDX[3].why = "Worker 沒有回傳電子期（可能還是舊版）";
      if (j.fut && !(j.fut.z > 0)) IDX[1].why = j.fut.why || "Worker 沒有台指期報價"; else if (!j.fut && wantIdx) IDX[1].why = "Worker 沒有回傳台指期（可能還是舊版）";
      (j.idx || []).forEach(x => {
        const it = IDX.find(i => i.k === x.c); if (!it || !(x.z > 0)) return;
        any = true; Object.assign(it, { z: x.z, y: x.y, h: x.h, l: x.l, tm: x.tm, src: marketOpen() ? "盤中" : "收盤", rt: true });
      });
      if (j.exf && j.exf.z > 0) { any = true; Object.assign(IDX[3], { z: j.exf.z, y: j.exf.y, h: j.exf.h, l: j.exf.l, v: j.exf.v, tm: j.exf.tm, src: j.exf.src === "night" ? "夜盤" : j.exf.src === "rt" ? "盤中" : (j.exf.sess || "") + "收盤", rt: true, label: "" }); }
      if (j.fut && j.fut.z > 0) { any = true; Object.assign(IDX[1], { z: j.fut.z, y: j.fut.y, h: j.fut.h, l: j.fut.l, tm: j.fut.tm, src: j.fut.src === "night" ? "夜盤" : j.fut.src === "rt" ? "盤中" : (j.fut.sess || "") + "收盤", rt: true, label: j.fut.n }); }
      DB.rtSrc = j.src || "mis";
      rtFails = 0; DB.rtErr = "";
      if (any) { DB.rt = true; DB.rtAt = new Date().toLocaleTimeString("zh-TW", { hour12: false }); paintLive(); }
      else if (DB.rt == null) DB.rt = false;
    } catch (e) { DB.rt = false; DB.rtErr = whyOf(e); rtFailAt = Date.now(); if (++rtFails >= 2) rtDrop(); }
    rtBusy = false; note();
  }
  document.addEventListener("twset:change", e => { if (e.detail.k === "poll") { clearTimeout(rtTimer); rtLoop(); } });
  function rtLoop() {
    clearTimeout(rtTimer);
    const pl = window.TWSet ? window.TWSet.get("poll") : "auto";
    rtPoll().then(() => { if (pl === "manual") return; rtTimer = setTimeout(rtLoop, pl === "5" || pl === "10" ? (marketOpen() || nightOpen() ? +pl * 1000 : 120000) : marketOpen() ? 2000 : nightOpen() ? 5000 : 120000); });
  }

  /* ---------------- banner ---------------- */
  function note() {
    const el = $(".dash-note"); if (!el) return;
    if (!DB.list.length && !DB.failed) { el.innerHTML = `<b>載入中</b>正在讀取證交所公開資料…`; return; }
    if (!DB.live) { el.innerHTML = `<b>讀不到</b>讀不到證交所資料。`; return; }
    if (DB.rt) el.innerHTML = `<b class="live">即時</b>${esc(DB.rtAt)} 更新${marketOpen() ? "・每 2 秒更新" : nightOpen() ? "・股票已收盤，台指期夜盤更新中" : "・非交易時段"}`;
    else el.innerHTML = `<b>收盤</b>${slash(DB.date)} 收盤資料${DB.rt === false ? "（即時報價讀不到）" : ""}`;
  }

  /* ---------------- 總覽 ---------------- */
  const PRESETS = [["w1", "自選1"], ["w2", "自選2"], ["w3", "自選3"], ["w4", "自選4"], ["w5", "自選5"], ["strong", "強勢股"], ["weak", "弱勢股"]];
  const COLS = [["price", "成交價"], ["chg", "漲跌"], ["pct", "漲跌幅"], ["vol", "成交量"]];
  function buildOverview() {
    $("#dpOverview").innerHTML = `
      <div class="ixgrid">${IDX.map(i => `<div class="dcard ixcard" data-k="${i.k}" role="button" tabindex="0" aria-expanded="false"><h3><span class="ixn">${i.name}<em class="ixen">${i.en}</em></span><span class="ixsrc"></span></h3>
        <div class="big">—</div><div class="sub ixchg">載入中…</div><div class="sub ixhl"></div><svg class="spark" viewBox="0 0 76 28" preserveAspectRatio="none" aria-hidden="true"><line class="spbase" x1="0" x2="76"/><path/></svg></div>`).join("")}</div>
      <div class="dcard ixdetail" hidden></div>
      <div class="dcard pm"><div class="aihead"><div><h3>盤前分析</h3></div>
        <button type="button" class="btn pmgo">分析</button></div><div class="pmout"><p class="sub">載入中…</p></div><p class="sub pmalert" hidden></p></div>
      <div class="dcard pm md"><div class="aihead"><div><h3>盤中分析</h3></div>
        <button type="button" class="btn mdgo">分析</button><span class="sub mdclosed" hidden>非開盤時間，盤中無法分析</span></div><div class="mdout"><p class="sub">載入中…</p></div></div>
      <div class="dcard mstrip"></div>
      <div class="board3">
        <div class="dcard wd"><div class="bd-h"><h3>國際行情</h3><span class="sub wdn"></span></div><div class="wdout"><p class="sub">載入中…</p></div></div>
        <div class="dcard ft"><div class="bd-h"><h3>期貨籌碼</h3><span class="sub ftn">台指期 未平倉淨口數</span></div><div class="ftout"><p class="sub">載入中…</p></div></div>
      </div>
      <div class="board">
        <div class="dcard bd-up"><div class="bd-h"><h3>漲幅排行</h3></div><div class="bd-list"></div></div>
        <div class="dcard bd-down"><div class="bd-h"><h3>跌幅排行</h3></div><div class="bd-list"></div></div>
      </div>
      <div class="board board2">
        <div class="dcard bd-strk"><div class="bd-h"><h3>法人連續買賣超</h3><span class="sub bd-n"></span></div>
          <div class="chips">${[["f1", "外資連買"], ["f0", "外資連賣"], ["t1", "投信連買"], ["t0", "投信連賣"]].map(([k, t]) => `<button type="button" class="chip" data-stk="${k}" aria-pressed="${k === "f1"}">${t}</button>`).join("")}</div>
          <div class="bd-list"><p class="sub">載入中…</p></div></div>
        <div class="dcard bd-flag"><div class="bd-h"><h3>注意股・處置股</h3><span class="sub bd-n"></span></div><div class="bd-list"><p class="sub">載入中…</p></div><p class="sub fl-foot">證交所公告的上市股票；處置股交易受限制（分盤撮合，可能要預收款券）。</p></div>
      </div>
      <div class="dcard cl"><div class="aihead"><div><h3>收盤摘要</h3></div></div><div class="clout"><p class="sub">載入中…</p></div></div>
      <div class="dcard wk"><div class="aihead"><div><h3>週回顧</h3></div><button type="button" class="btn wkgo" hidden>產生</button></div><div class="wkout"><p class="sub">載入中…</p></div></div>
      <div class="dcard inst"><div class="aihead"><div><h3>法人買賣超排行</h3></div><span class="sub instday"></span></div>
        <div class="hmseg instseg" role="group" aria-label="法人">${[["a", "三大法人"], ["f", "外資"], ["t", "投信"], ["d", "自營商"]].map(([k, l]) => `<button type="button" data-g="${k}" aria-pressed="${k === "a"}">${l}</button>`).join("")}<i></i></div>
        <div class="instout"><p class="sub">載入中…</p></div></div>
      <div class="dcard mkt">
        <div class="mbar"><input class="msearch msfull" type="search" placeholder="搜尋代號或名稱" aria-label="搜尋股票" autocomplete="off">
          <div class="chips">${PRESETS.map(([k, t]) => `<button type="button" class="chip" data-preset="${k}" aria-pressed="${k === VIEW.preset}">${t}</button>`).join("")}</div>
          <span class="sub mcount"></span></div>
        <div class="mwrap"><table class="mtbl ttbl mktab"><thead><tr><th class="l">股票</th>${COLS.map(([k, t]) => `<th class="sort" data-key="${k}">${t}<i></i></th>`).join("")}<th aria-label="自選"></th></tr></thead><tbody></tbody></table></div>
        <button type="button" class="mmore" hidden>顯示更多</button>
      </div>`;
    const box = $("#dpOverview");
    $(".msearch", box).addEventListener("input", e => { VIEW.q = e.target.value.trim(); VIEW.dist = null; VIEW.shown = 50; paintTable(true); });
    root.addEventListener("click", e => {
      if (!e.target.closest("#dpOverview, #dpPre, #dpList, #dpChip, #dpInd, #dpRev")) return;
      const p = e.target.closest("[data-preset]");
      if (p) {
        VIEW.q = ""; $("#dpList .msearch").value = ""; VIEW.dist = null;
        VIEW.preset = p.dataset.preset; VIEW.shown = 50;
        const o = { all: ["vol", -1], w1: ["ord", 1], w2: ["ord", 1], w3: ["ord", 1], w4: ["ord", 1], w5: ["ord", 1], strong: ["pct", -1], weak: ["pct", 1], volume: ["vol", -1] }[VIEW.preset];
        VIEW.key = o[0]; VIEW.dir = o[1]; paintTable(true); return;
      }
      const th = e.target.closest("th.sort");
      if (th) { const k = th.dataset.key; if (VIEW.key === k) VIEW.dir *= -1; else { VIEW.key = k; VIEW.dir = -1; } paintTable(true); return; }
      if (e.target.closest(".mmore")) { VIEW.shown += 100; paintTable(false); return; }
      const st = e.target.closest(".wlbtn");
      if (st) { if (st.classList.contains("wladd")) wlMenu(st); else wlRemove(st); return; }
      const tr = e.target.closest("tr[data-code]");
      if (tr) openStock(tr.dataset.code, tr);
      if (e.target.closest(".pmgo")) pmRun(e.target.closest(".pmgo"));
      if (e.target.closest(".mdgo")) { pmRun(e.target.closest(".mdgo"), true); return; }
      if (e.target.closest(".clgo")) { clRun(e.target.closest(".clgo")); return; }
      if (e.target.closest(".hmback")) { heatZoom(null); return; }
      const hv = e.target.closest(".hmseg [data-hv]");
      if (hv) { const k = hv.closest(".hmseg").dataset.hk; if (HEAT[k] !== hv.dataset.hv) { HEAT[k] = hv.dataset.hv; heatCardClose($(".hm")); paintHeat(false); } return; }
      const hcg = e.target.closest(".hmc-go"); if (hcg) { const c = hcg.closest(".hmcard"); openStock(c.dataset.code, c); return; }
      if (e.target.closest(".hmc-x")) { heatCardClose($(".hm")); return; }
      if (e.target.closest(".hmcard")) return;
      const hmt = e.target.closest(".hmt"); if (hmt) { heatRipple(hmt, e); if (hmt.dataset.code) heatCard(hmt); else setTimeout(() => heatZoom(hmt), 160); return; }
      if (e.target.closest(".hm")) { heatCardClose($(".hm")); return; }
      const sk = e.target.closest("[data-stk]"); if (sk) { STRK.tab = sk.dataset.stk; paintStreak(true); return; }
      const dc = e.target.closest("[data-dist]");
      if (dc) { VIEW.q = ""; $("#dpList .msearch").value = ""; VIEW.dist = +dc.dataset.dist; VIEW.key = "vol"; VIEW.dir = -1; VIEW.shown = 50; open("dpList", true); paintTable(true); return; }
      if (e.target.closest(".distclr")) { VIEW.dist = null; VIEW.key = "ord"; VIEW.dir = 1; paintTable(true); return; }
      const pk = e.target.closest("[data-pick]"); if (pk) { openStock(pk.dataset.pick, pk); return; }
      const gt = e.target.closest("[data-goto]"); if (gt) { open(gt.dataset.goto, true); return; }
      const bd = e.target.closest(".bd-row, .bd-tile"); if (bd) { openStock(bd.dataset.code, bd); return; }
      const xc = e.target.closest(".ixcard"); if (xc) { ixOpen(xc.dataset.k); return; }
      const xr = e.target.closest("[data-ixr]"); if (xr) { IXV.r = xr.dataset.ixr; ixPaint(true); return; }
      if (e.target.closest(".ixclose")) { ixOpen(IXV.k); return; }
    });
    /* the pre-market note and the stock list each have their own tab */
    /* 分析: one tab with three parts (收盤摘要, 盤前分析, 盤中分析), one shown at a time */
    const pre = $("#dpPre");
    pre.insertAdjacentHTML("beforeend", `<div class="anasub" role="tablist" aria-label="分析">${[["pm", "盤前"], ["md", "盤中"], ["cl", "收盤"], ["wk", "週回顧"], ["ar", "存檔"]].map(([k, l]) => `<button type="button" role="tab" data-sub="${k}">${l}</button>`).join("")}<i></i></div>`);
    const pmc = $(".pm:not(.md)", box), mdc = $(".pm.md", box), clc = $(".cl", box), wkc = $(".wk", box);
    clc.dataset.sub = "cl"; pmc.dataset.sub = "pm"; mdc.dataset.sub = "md"; wkc.dataset.sub = "wk";
    pre.appendChild(clc); pre.appendChild(pmc); pre.appendChild(mdc); pre.appendChild(wkc);
    $(".anasub", pre).addEventListener("click", e => { const b = e.target.closest("[data-sub]"); if (b) anaSub(b.dataset.sub, true); });
    anaSub(anaDefault(), false); mdGate();
    const instc = $(".inst", box), mktc = $(".mkt", box), dl = $("#dpList");
    dl.insertAdjacentHTML("afterbegin", `<div class="anasub lsub" role="tablist" aria-label="股票">${[["ls", "清單"], ["rk", "排行"], ["cp", "比較"], ["sc", "選股"], ["rv", "營收"]].map(([k, l]) => `<button type="button" role="tab" data-sub="${k}">${l}</button>`).join("")}<i></i></div>`);
    mktc.dataset.sub = "ls"; dl.appendChild(mktc); instInit(instc); lstBuild(dl);
    $(".lsub", dl).addEventListener("click", e => { const b = e.target.closest("[data-sub]"); if (b) lstSub(b.dataset.sub, true); });
    lstSub((() => { try { return sessionStorage.getItem("twlst") || (window.TWSet && window.TWSet.get("lst")) || "ls"; } catch (e) { return "ls"; } })(), false);
    $(".wkgo", wkc).addEventListener("click", e => wkRun(e.currentTarget));
    pmLoad(); pmLoad(true); clLoad(); wkLoad(); wdLoad(); ftLoad();
    const dd = $(".bd-dist", box); if (dd) { dd.addEventListener("pointermove", distTip); dd.addEventListener("pointerleave", () => { const t = $(".bdtip", dd); if (t) t.hidden = true; }); }
    const hm = $(".hm", box); hm && hm.addEventListener("pointermove", e => { if (!$(".hmcard", hm)) heatTip(e); heatFocus(e); }); hm && hm.addEventListener("pointerleave", e => { const t = $(".hmtip", hm); if (t) t.hidden = true; heatFocus(e); }); setTimeout(alertSync, 2500); loadCharts(true);
    box.addEventListener("keydown", e => { const xc = e.target.closest && e.target.closest(".ixcard"); if (xc && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); ixOpen(xc.dataset.k); } });
  }
  function rowsNow() {
    const q = VIEW.q.toLowerCase();
    let rows = DB.list;
    const L = /^w[1-5]$/.test(VIEW.preset) && VIEW.dist == null ? LISTS[listIdx()] : null;
    if (!q && VIEW.dist != null && DIST[VIEW.dist]) {
      const f = DIST[VIEW.dist][1], v = x => (ok(x) ? x : -Infinity);
      return DB.list.filter(x => ok(x.price) && x.price > 0 && ok(x.pct) && f(x.pct)).sort((a, b) => (v(a[VIEW.key]) - v(b[VIEW.key])) * VIEW.dir || a.code.localeCompare(b.code));
    }
    if (q) return DB.list.filter(s => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))   /* a search looks through every stock */
      .sort((a, b) => (a.code.toLowerCase() === q ? -1 : 0) - (b.code.toLowerCase() === q ? -1 : 0) || (ok(b.vol) ? b.vol : 0) - (ok(a.vol) ? a.vol : 0));
    if (L) rows = rows.filter(s => L.includes(s.code));
    if (VIEW.preset === "strong" || VIEW.preset === "weak") rows = rows.filter(s => s.vol >= 500);   /* thin stocks are left out, as broker apps do */
    if (q) rows = rows.filter(s => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    const k = VIEW.key, d = VIEW.dir;
    const v = x => (ok(x) ? x : -Infinity);
    if (k === "ord") return L ? rows.slice().sort((a, b) => L.indexOf(a.code) - L.indexOf(b.code)) : rows.slice();
    return rows.slice().sort((a, b) => (v(a[k]) - v(b[k])) * d || a.code.localeCompare(b.code));
  }
  const rowHTML = s => {
    const d = dig(s.price), t = tone(s.chg);
    return `<tr data-code="${esc(s.code)}" tabindex="0"><td class="l nm">${/^w[1-5]$/.test(VIEW.preset) && VIEW.key === "ord" && !VIEW.q ? '<i class="dgrip" aria-label="拖曳排序" title="拖曳排序">⋮⋮</i>' : ""}<b>${esc(s.name)}${flagTag(s.code)}</b><span>${esc(s.code)}${s.mkt === "otc" ? " 櫃" : s.mkt === "esb" ? " 興櫃" : ""}</span></td>
      <td><span class="pxpill ${t}${s.pct >= 9.4 || s.pct <= -9.4 ? " lim" : ""}"${s.pct >= 9.4 ? ' title="漲停"' : s.pct <= -9.4 ? ' title="跌停"' : ""}>${fmt(s.price, d)}</span></td><td class="${t}">${arrow(s.chg)}${fmt(Math.abs(s.chg), d)}</td><td class="${t} pctc" style="--w:${ok(s.pct) ? Math.min(Math.abs(s.pct) / 10, 1).toFixed(3) : 0}">${pct(s.pct)}</td>
      <td class="vol">${fmt(s.vol)}</td><td>${wlBtn(s)}</td></tr>`;
  };
  /* inside 自選1–5: ＋ adds a searched stock to that list, − takes one out */
  const wlBtn = s => {
    if (VIEW.q || VIEW.dist != null) { const has = LISTS.some(l => l.includes(s.code)); return `<button type="button" class="wlbtn wladd${has ? " in" : ""}" data-code="${esc(s.code)}" aria-label="加入自選 ${esc(s.name)}">＋</button>`; }
    if (!/^w[1-5]$/.test(VIEW.preset)) return "";
    const n = listIdx() + 1, inL = LISTS[n - 1].includes(s.code);
    if (inL && ARM.code === s.code && ARM.list === n - 1) return `<button type="button" class="wlbtn in arm" data-code="${esc(s.code)}" aria-label="確定從自選${n}移除 ${esc(s.name)}">確定移除</button>`;
    return `<button type="button" class="wlbtn${inL ? " in" : ""}" data-code="${esc(s.code)}" aria-label="${inL ? "從" : "加入"}自選${n}${inL ? "移除" : ""} ${esc(s.name)}">${inL ? "−" : "＋"}</button>`;
  };
  /* the ＋ on a search result opens a small menu: tap 自選1–5 to add or remove */
  let menuEl = null;
  function wlMenu(btn) {
    const code = btn.dataset.code;
    if (menuEl && menuEl.dataset.code === code) { menuEl.remove(); menuEl = null; return; }
    if (menuEl) menuEl.remove();
    menuEl = document.createElement("div"); menuEl.className = "wlmenu"; menuEl.dataset.code = code;
    const paint = () => { menuEl.innerHTML = LISTS.map((l, i) => `<button type="button" data-i="${i}" aria-pressed="${l.includes(code)}">自選${i + 1}<i>${l.includes(code) ? "✓" : "＋"}</i></button>`).join(""); };
    paint(); document.body.appendChild(menuEl);
    const r = btn.getBoundingClientRect(), w = menuEl.offsetWidth, h = menuEl.offsetHeight;
    menuEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + "px";
    menuEl.style.top = (r.bottom + h + 8 > innerHeight ? r.top - h - 6 : r.bottom + 6) + "px";
    menuEl.addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (!b) return; e.stopPropagation(); toggleWatch(code, +b.dataset.i); paint(); });
  }
  document.addEventListener("click", e => { if (menuEl && !e.target.closest(".wlmenu, .wladd")) { menuEl.remove(); menuEl = null; } }, true);
  addEventListener("scroll", () => { if (menuEl) { menuEl.remove(); menuEl = null; } }, { passive: true });
  /* − asks once before removing: the first tap turns it into 確定移除, a second tap within 3 seconds removes */
  /* the armed one is kept here, not only on the button, so the live repaint every 2 seconds draws it armed too */
  const ARM = { code: "", list: -1, t: 0 };
  function disarm() {
    clearTimeout(ARM.t); const c = ARM.code; ARM.code = ""; ARM.list = -1;
    if (c) $$(`.wlbtn.arm[data-code="${c}"]`).forEach(b => { b.classList.remove("arm"); b.textContent = "−"; });
  }
  function wlRemove(btn) {
    const code = btn.dataset.code, li = listIdx();
    if (ARM.code === code && ARM.list === li) { disarm(); toggleWatch(code, li); return; }
    disarm();
    ARM.code = code; ARM.list = li; ARM.t = setTimeout(disarm, 3000);
    btn.classList.add("arm"); btn.textContent = "確定移除";
  }
  function paintTable(animate) {
    const box = $("#dpList"); if (!$(".mtbl", box)) return;
    const rows = rowsNow(), show = rows.slice(0, VIEW.shown);
    $(".mtbl tbody", box).innerHTML = show.map(rowHTML).join("") ||
      `<tr><td class="mempty" colspan="6">${DB.failed ? "讀不到資料。" : /^w[1-5]$/.test(VIEW.preset) && !VIEW.q ? `自選${listIdx() + 1} 還沒有股票。`  : DB.list.length ? "找不到符合的股票。" : "載入中…"}</td></tr>`;
    $(".mmore", box).hidden = rows.length <= VIEW.shown;
    const dl = VIEW.dist != null && !VIEW.q && DIST[VIEW.dist];
    $(".mcount", box).innerHTML = !DB.list.length ? "" : dl ? `<button type="button" class="chip distclr" aria-pressed="true">漲跌幅 ${esc(dl[0])}${/~/.test(dl[0]) ? "%" : ""}<i aria-hidden="true">✕</i></button> ${fmt(rows.length)} 檔`
      : `${fmt(rows.length)} 檔${VIEW.preset === "strong" || VIEW.preset === "weak" ? "（成交量 500 張以上）" : ""}`;
    $$("[data-preset]", box).forEach(b => b.setAttribute("aria-pressed", String(!VIEW.q && !dl && b.dataset.preset === VIEW.preset)));
    $$("th.sort", box).forEach(th => { th.dataset.dir = th.dataset.key === VIEW.key ? (VIEW.dir < 0 ? "desc" : "asc") : ""; });
    if (animate && box.classList.contains("on")) rise($$(".mtbl tbody tr", box).slice(0, 24), 18);
    if (animate) rtPoll();
  }
  function paintIdx() {
    IDX.forEach(i => {
      const c = $(`.ixcard[data-k="${i.k}"]`); if (!c) return;
      const cd = CH[i.k + ":tick"];
      /* no quote from the Worker: take the chart's last real bar, only if it is fresh (within 20 minutes of a session) or is the last session's close, shown with its date; otherwise "讀不到" */
      if (!i.us && !i.rt && cd && cd.last > 0 && cd.at) {
        const age = Date.now() - cd.at, live = age < 20 * 60000, tz = new Date(cd.at + 8 * 3600e3).toISOString();
        if (live || age < 4 * 864e5) Object.assign(i, { z: cd.last, y: cd.prev, h: cd.high, l: cd.low, tm: live ? tz.slice(11, 19) : "", src: live ? (sessOpen(i.k) ? "盤中" : "收盤") : "收盤 " + tz.slice(5, 10).replace("-", "/") });
      }
      /* the first time a card shows its number, its line must be ready too, so the count-up and the line draw start together and end together (give up waiting after 6 s) */
      if (ok(i.z) && !c.dataset.shown) { const sp = $(".spark path", c); if (!(sp && sp.getAttribute("d")) && Date.now() - T_START < 6000) { c.classList.add("ixwait"); return; } c.dataset.shown = "1"; }
      const d = ok(i.z) && ok(i.y) ? i.z - i.y : NaN, t = tone(d), big = $(".big", c);
      if (i.label) { const sub = i.label.replace(/^[臺台]指期\s*/, "").trim(); const ix = $(".ixn", c), tt = sub ? i.name + " (" + sub + ")" : i.name; if (ix.dataset.t !== tt) { ix.dataset.t = tt; ix.innerHTML = esc(tt) + `<em class="ixen">${i.en}</em>`; } }
      $(".ixsrc", c).textContent = i.src ? i.src + (i.tm ? " " + i.tm.slice(0, 5) : "") : "";
      const bt = ok(i.z) ? fmt(i.z, 2) : "—";
      if (big.dataset.txt !== bt) { const was = big.dataset.z ? +big.dataset.z : NaN; big.dataset.txt = bt; big.textContent = bt; if (ok(was) && ok(i.z) && was !== i.z) { big.classList.remove("fl-up", "fl-down"); void big.offsetWidth; big.classList.add(i.z > was ? "fl-up" : "fl-down"); } }
      big.dataset.z = ok(i.z) ? i.z : ""; big.className = "big " + t + (big.classList.contains("fl-up") ? " fl-up" : big.classList.contains("fl-down") ? " fl-down" : "");
      const ct = ok(d) ? `${arrow(d)} ${fmt(Math.abs(d), 2)} (${pct(d / i.y * 100)})` : (DB.failed || (Date.now() - T_START > 30000 && DB.list.length) ? "讀不到資料" + (DB.failed ? "（證交所連不上）" : i.us ? (i.why ? "（" + i.why + "）" : "") : DB.rtErr ? "（" + DB.rtErr + "）" : i.why ? "（" + i.why + "）" : "") : "載入中…"), cg = $(".ixchg", c); c.classList.toggle("ixwait", !ok(d));
      if (cg.textContent !== ct) cg.textContent = ct;
      cg.className = "sub ixchg " + t;
      const ht = i.h > 0 && i.l > 0 ? `高 ${fmt(i.h, 2)}　低 ${fmt(i.l, 2)}` : "", hl = $(".ixhl", c); if (hl.textContent !== ht) hl.textContent = ht;
    });
    paintSparks();
  }
  function paintStrip() {
    try { paintBoard(); } catch (e) {}
    try { paintHeat(false); } catch (e) {}
    const el = $("#dpOverview .mstrip"); if (!el) return;
    const last = MKT.rows && MKT.rows[MKT.rows.length - 1], prev = MKT.rows && MKT.rows[MKT.rows.length - 2], I = MKT.inst;
    let up = 0, down = 0, flat = 0; DB.list.forEach(s => { if (s.chg > 0) up++; else if (s.chg < 0) down++; else flat++; });
    const cell = (k, v, c, sub) => `<div class="mcell"><span>${k}</span><b class="${c || ""}">${v}</b>${sub ? `<i>${sub}</i>` : ""}</div>`;
    el.innerHTML = [
      cell("成交金額（億）", last ? fmt(last[2]) : "—", "", last && prev ? `較前日 ${pct((last[2] / prev[2] - 1) * 100)}` : (last ? "" : "")),
      cell("外資（億）", I ? signed(I.f, 1) : "—", I ? tone(I.f) : "", I && last && I.date !== last[0] ? shortDay(I.date) : ""),
      cell("投信（億）", I ? signed(I.t, 1) : "—", I ? tone(I.t) : ""),
      cell("自營商（億）", I ? signed(I.d, 1) : "—", I ? tone(I.d) : ""),
      cell("上漲 / 下跌 / 平盤", DB.list.length ? `<em class="up">${fmt(up)}</em><s>/</s><em class="down">${fmt(down)}</em><s>/</s>${fmt(flat)}` : "—", "brd", DB.live ? "含 ETF" : "讀不到"),
    ].join("");
    const bc = el.lastElementChild;
    if (bc && DB.list.length) bc.insertAdjacentHTML("beforeend", breadthBar(up, flat, down));
  }

  /* ---------------- 類股熱力圖: every listed and 上櫃 stock grouped by industry, area = turnover, colour = turnover-weighted change ---------------- */
  let INDMAP = null;                               /* code → TWSE / TPEx industry code, published with otc.json */
  const INDN = { "01": "水泥", "02": "食品", "03": "塑膠", "04": "紡織纖維", "05": "電機機械", "06": "電器電纜", "08": "玻璃陶瓷", "09": "造紙", "10": "鋼鐵", "11": "橡膠", "12": "汽車",
    "14": "建材營造", "15": "航運", "16": "觀光餐旅", "17": "金融保險", "18": "貿易百貨", "19": "綜合", "20": "其他", "21": "化學", "22": "生技醫療", "23": "油電燃氣", "24": "半導體",
    "25": "電腦週邊", "26": "光電", "27": "通信網路", "28": "電子零組件", "29": "電子通路", "30": "資訊服務", "31": "其他電子", "32": "文化創意", "33": "農業科技", "34": "電子商務",
    "35": "綠能環保", "36": "數位雲端", "37": "運動休閒", "38": "居家生活", "80": "管理股票", "91": "存託憑證" };
  const HEAT = { sel: null, sig: "", w: 0, f: "all", sort: "val" };   /* f: all | up | down; sort: val (turnover) | pct (change) */
  /* squarified treemap: values sorted largest first → [x, y, w, h] for each */
  function squarify(vals, W, H) {
    const total = vals.reduce((a, b) => a + b, 0), out = new Array(vals.length);
    if (!(total > 0)) return out;
    let x = 0, y = 0, w = W, h = H, row = [];
    const items = vals.map((v, i) => ({ i, a: v * W * H / total }));
    const worst = (r, side) => { const s = r.reduce((a, q) => a + q.a, 0); let mx = 0, mn = Infinity; r.forEach(q => { mx = Math.max(mx, q.a); mn = Math.min(mn, q.a); }); return Math.max(side * side * mx / (s * s), s * s / (side * side * mn)); };
    const lay = r => {
      const s = r.reduce((a, q) => a + q.a, 0);
      if (w >= h) { const cw = s / h; let yy = y; r.forEach(q => { out[q.i] = [x, yy, cw, q.a / cw]; yy += q.a / cw; }); x += cw; w -= cw; }
      else { const ch = s / w; let xx = x; r.forEach(q => { out[q.i] = [xx, y, q.a / ch, ch]; xx += q.a / ch; }); y += ch; h -= ch; }
    };
    items.forEach(it => { const side = Math.min(w, h); if (!row.length || worst(row.concat(it), side) <= worst(row, side)) row.push(it); else { lay(row); row = [it]; } });
    if (row.length) lay(row);
    return out;
  }
  function heatGroups() {
    const G = new Map();
    DB.list.forEach(s => {
      const id = INDMAP && INDMAP[s.code]; if (!id || !INDN[id] || s.mkt === "esb" || !(s.price > 0) || !(s.vol > 0) || !ok(s.pct)) return;
      const v = s.price * s.vol * 1000;
      let g = G.get(id); if (!g) G.set(id, g = { id, name: INDN[id], val: 0, wp: 0, up: 0, dn: 0, list: [] });
      g.val += v; g.wp += v * s.pct; g.list.push(s); if (s.chg > 0) g.up++; else if (s.chg < 0) g.dn++;
    });
    return [...G.values()].map(g => Object.assign(g, { pct: g.wp / g.val })).sort((a, b) => b.val - a.val);
  }
  function paintHeat(animate) {
    const card = $(".bd-heat"); if (!card) return;
    const hm = $(".hm", card), head = $(".hmsel", card);
    if (!DB.list.length) return;
    if (!INDMAP) { hm.innerHTML = `<p class="sub hmwait">${DB.live ? "產業分類還沒發布，稍後會出現。" : "讀不到資料。"}</p>`; return; }
    const groups = heatGroups(), g = HEAT.sel && groups.find(x => x.id === HEAT.sel); HEAT.groups = groups;
    if (HEAT.sel && !g) HEAT.sel = null;
    let items = g ? g.list.slice().sort((a, b) => b.price * b.vol - a.price * a.vol).slice(0, 60).map(s => ({ key: s.code, name: s.name, val: s.price * s.vol * 1000, pct: s.pct, sub: fmt(s.price, dig(s.price)) }))
      : groups.map(x => ({ key: x.id, name: x.name, val: x.val, pct: x.pct, sub: `${x.list.length} 檔` }));
    /* layout uses coarse (~12%) steps of turnover, so every live tick does not reshuffle and resize the tiles */
    items.forEach(i => { i.val = i.val > 0 ? Math.exp(Math.round(Math.log(i.val) / 0.12) * 0.12) : 0; });
    if (HEAT.f !== "all") items = items.filter(i => (HEAT.f === "up" ? i.pct > 0 : i.pct < 0));
    items.sort(HEAT.sort === "pct" ? (a, b) => (HEAT.f === "down" ? a.pct - b.pct : b.pct - a.pct) || (a.key < b.key ? -1 : 1) : (a, b) => b.val - a.val || (a.key < b.key ? -1 : 1));
    const W = hm.clientWidth || 800, H = hm.clientHeight || 380;
    const sig = (HEAT.sel || "") + HEAT.f + HEAT.sort + W + ":" + items.map(i => i.key + (i.pct || 0).toFixed(2) + Math.round(Math.log(i.val + 1) / 0.12)).join();
    if (!animate && sig === HEAT.sig) return; HEAT.sig = sig;
    const R = squarify(items.map(i => i.val), W, H), lim = g ? 7 : 3.5;
    const seg = (k, opts) => `<span class="hmseg" data-hk="${k}">${opts.map(([v, l]) => `<button type="button" data-hv="${v}" aria-pressed="${HEAT[k] === v}">${l}</button>`).join("")}<i></i></span>`;
    const ctl = seg("f", [["all", "全部"], ["up", "只看漲"], ["down", "只看跌"]]) + seg("sort", [["val", "依成交值"], ["pct", "依漲跌幅"]]);
    head.innerHTML = (g ? `<button type="button" class="chip hmback">← 全部類股</button><b>${esc(g.name)}</b><span class="sub">${g.list.length} 檔・<em class="${tone(g.pct)}">${pct(g.pct)}</em>・上漲 ${g.up}／下跌 ${g.dn}</span>`
      : `<span class="sub">面積 = 成交金額，顏色 = 漲跌幅</span>`) + `<span class="hmctl">${ctl}</span>`;
    requestAnimationFrame(() => $$(".hmseg", head).forEach(segMark));
    if (!items.length) { hm.innerHTML = `<p class="sub hmwait">${HEAT.f === "up" ? "目前沒有上漲的" : "目前沒有下跌的"}${g ? "個股" : "類股"}。</p>`; return; }
    const tiles = items.map((it, i) => {
      const r = R[i] || [0, 0, 0, 0], a = clamp(Math.abs(it.pct || 0) / lim, 0.08, 1) * 0.9, sz = r[2] < 58 || r[3] < 30 ? " xs" : r[2] < 96 || r[3] < 48 ? " sm" : "";
      return { it, cls: `hmt ${tone(it.pct)}${sz}${g && Math.abs(it.pct || 0) >= 9.4 ? " lim" : ""}`, st: `left:${(r[0] / W * 100).toFixed(3)}%;top:${(r[1] / H * 100).toFixed(3)}%;width:${(r[2] / W * 100).toFixed(3)}%;height:${(r[3] / H * 100).toFixed(3)}%;--a:${a.toFixed(3)}` };
    });
    /* tiles already on the map (a live update, a filter or a re-sort): move and recolour them in place so they glide to their new place;
       new ones fade in, gone ones fade out, and a tile whose change moved flashes and pulses */
    const old = new Map($$(".hmt", hm).map(t => [t.dataset.k, t]));
    const level = g ? "s" : "g";
    if (!animate && old.size && hm.dataset.level === level) {
      const keep = new Set();
      tiles.forEach(({ it, cls, st }, i) => {
        let t = old.get(it.key);
        if (!t) {
          hm.insertAdjacentHTML("beforeend", `<button type="button" class="${cls}" data-k="${esc(it.key)}"${g ? ` data-code="${esc(it.key)}"` : ""} style="${st}"><b>${esc(it.name)}</b><span>${pct(it.pct)}</span><i>${esc(it.sub)}</i></button>`);
          t = hm.lastElementChild; t.dataset.p = (it.pct || 0).toFixed(2);
          t.animate([{ opacity: 0, transform: "scale(.5)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 120 + Math.min(i, 20) * 15, easing: "cubic-bezier(.2,.9,.3,1.2)", fill: "backwards" });
        } else {
          const was = +t.dataset.p, now = +(it.pct || 0).toFixed(2);
          t.setAttribute("style", st); t.className = cls; $("span", t).textContent = pct(it.pct); $("i", t).textContent = it.sub;
          if (Number.isFinite(was) && Math.abs(now - was) >= 0.1) heatFlash(t, now > was);
          t.dataset.p = now;
        }
        t.title = it.name + " " + pct(it.pct); keep.add(it.key);
      });
      old.forEach((t, k) => { if (keep.has(k)) return; t.style.pointerEvents = "none"; t.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.4)" }], { duration: 300, easing: "cubic-bezier(.23,1,.32,1)", fill: "forwards" }).onfinish = () => t.remove(); });
      return;
    }
    hm.dataset.level = level;
    const keepTip = $(".hmtip", hm);
    hm.innerHTML = tiles.map(({ it, cls, st }) => `<button type="button" class="${cls}" data-k="${esc(it.key)}" data-p="${(it.pct || 0).toFixed(2)}"${g ? ` data-code="${esc(it.key)}"` : ""} style="${st}"><b>${esc(it.name)}</b><span>${pct(it.pct)}</span><i>${esc(it.sub)}</i></button>`).join("");
    if (keepTip) { keepTip.hidden = true; hm.appendChild(keepTip); }
    if (animate) $$(".hmt", hm).forEach((t, i) => t.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "none" }], { duration: 480, delay: Math.min(i, 30) * 22, easing: "cubic-bezier(.2,.9,.3,1.2)", fill: "backwards" }));
  }
  function heatTip(e) {
    const hm = e.currentTarget, t = e.target.closest && e.target.closest(".hmt");
    let tip = $(".hmtip", hm);
    if (!t) { if (tip) tip.hidden = true; return; }
    if (!tip) { tip = document.createElement("div"); tip.className = "hmtip"; hm.appendChild(tip); }
    const yi = v => fmt(v / 1e8, v >= 1e10 ? 0 : 1) + " 億";
    if (t.dataset.code) {
      const s = DB.by.get(t.dataset.code); if (!s) return;
      tip.innerHTML = `<b>${esc(s.name)} <i>${esc(s.code)}</i>${flagTag(s.code)}</b><div><span>成交價</span><em class="${tone(s.chg)}">${fmt(s.price, dig(s.price))}</em><span>漲跌幅</span><em class="${tone(s.chg)}">${pct(s.pct)}</em><span>成交量</span><em>${fmt(s.vol)} 張</em><span>成交金額</span><em>${yi(s.price * s.vol * 1000)}</em></div><p>點一下看個股分析・右鍵加自選</p>`;
    } else {
      const g = (HEAT.groups || []).find(x => x.id === t.dataset.k); if (!g) return;
      const top = g.list.slice().sort((a, b) => b.price * b.vol - a.price * a.vol).slice(0, 4);
      tip.innerHTML = `<b>${esc(g.name)} <em class="${tone(g.pct)}">${pct(g.pct)}</em></b><div><span>成交金額</span><em>${yi(g.val)}</em><span>上漲／下跌</span><em><i class="up">${g.up}</i>／<i class="down">${g.dn}</i></em></div>
        <ul>${top.map(s => `<li><span>${esc(s.name)}</span><em class="${tone(s.chg)}">${pct(s.pct)}</em></li>`).join("")}</ul><p>點一下看這個類股的個股</p>`;
    }
    tip.hidden = false;
    const r = hm.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.transform = `translate(${Math.round(x + 16 + w > r.width ? x - w - 14 : x + 16)}px, ${Math.round(y + 16 + h > r.height ? Math.max(4, y - h - 12) : y + 16)}px)`;
  }
  function heatZoom(tile) {
    const hm = $(".hm"); if (!hm) return;
    $(".hmcard", hm) && $(".hmcard", hm).remove(); hm.classList.remove("focus");
    const hr = hm.getBoundingClientRect(), from = HEAT.sel;
    const box = el => { const r = el.getBoundingClientRect(); return { x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height, bg: getComputedStyle(el).backgroundColor }; };
    const veil = (b, grow) => {
      const v = document.createElement("div"); v.className = "hmveil"; v.style.background = b.bg; hm.appendChild(v);
      const small = `translate(${b.x}px, ${b.y}px) scale(${Math.max(0.01, b.w / hr.width)}, ${Math.max(0.01, b.h / hr.height)})`;
      const a = v.animate(grow ? [{ transform: small, borderRadius: "6px" }, { transform: "none", borderRadius: "14px" }] : [{ transform: "none", opacity: 0.95 }, { transform: small, opacity: 0.95 }], { duration: grow ? 460 : 420, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" });
      a.onfinish = () => v.animate([{ opacity: grow ? 1 : 0.95 }, { opacity: 0 }], { duration: 260, fill: "forwards" }).onfinish = () => v.remove();
    };
    const fadeIn = delay => $$(".hmt", hm).forEach((t, i) => t.animate([{ opacity: 0, filter: "blur(6px)", transform: "scale(.94)" }, { opacity: 1, filter: "none", transform: "none" }], { duration: 420, delay: delay + Math.min(i, 30) * 14, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" }));
    if (tile) {
      const b = box(tile); HEAT.sel = tile.dataset.k; HEAT.sig = ""; paintHeat(false); veil(b, true); fadeIn(260);
    } else {
      HEAT.sel = null; HEAT.sig = ""; paintHeat(false);
      const t = from && $(`.hmt[data-k="${from}"]`, hm);
      if (t) { const b = box(t); veil(b, false); }
      fadeIn(120);
    }
  }
  /* a live change: the tile flashes brighter and pulses once, with a small arrow for the direction */
  function heatFlash(t, up) {
    const nw = Date.now(); if (nw - (+t.dataset.fl || 0) < 6000) return; t.dataset.fl = nw;   /* at most one flash per tile every 6 s */
    t.animate([{ filter: "brightness(1.3)" }, { filter: "none" }], { duration: 1200, easing: "cubic-bezier(.2,.8,.3,1)" });
    const a = document.createElement("em"); a.className = "hmarw " + (up ? "up" : "down"); a.textContent = up ? "▲" : "▼"; t.appendChild(a);
    a.animate([{ opacity: 0, transform: `translateY(${up ? 6 : -6}px)` }, { opacity: 1, transform: "none", offset: .25 }, { opacity: 0, transform: `translateY(${up ? -8 : 8}px)` }], { duration: 1400, easing: "ease-out" }).onfinish = () => a.remove();
  }
  /* the sliding highlight behind the pressed button of a filter / sort switch */
  function segMark(sg) {
    const b = $("[aria-pressed=true]", sg), hl = $("i", sg); if (!b || !hl) return;
    hl.style.width = b.offsetWidth + "px"; hl.style.transform = `translateX(${b.offsetLeft}px)`;
  }
  /* hover focus: the tile under the pointer lifts and glows, the rest dim */
  function heatFocus(e) {
    const hm = e.currentTarget, t = e.target.closest && e.target.closest(".hmt");
    const was = $(".hmt.on", hm); if (was === t) return;
    if (was) was.classList.remove("on");
    if (t) t.classList.add("on");
    hm.classList.toggle("focus", !!t);
  }
  /* a tap: a ripple spreads from the finger; a 類股 then zooms in, a stock opens a small card */
  function heatRipple(t, e) {
    const r = t.getBoundingClientRect(), d = document.createElement("span"), R = Math.hypot(r.width, r.height) * 1.2;
    d.className = "hmrip"; d.style.left = ((e && e.clientX ? e.clientX : r.left + r.width / 2) - r.left) + "px"; d.style.top = ((e && e.clientY ? e.clientY : r.top + r.height / 2) - r.top) + "px";
    t.appendChild(d);
    d.animate([{ width: "0px", height: "0px", opacity: .55 }, { width: R + "px", height: R + "px", opacity: 0 }], { duration: 650, easing: "cubic-bezier(.2,.8,.3,1)" }).onfinish = () => d.remove();
  }
  function heatCard(t) {
    const hm = t.closest(".hm"), s = DB.by.get(t.dataset.code); if (!s) return;
    let c = $(".hmcard", hm);
    if (c && c.dataset.code === s.code) { heatCardClose(hm); return; }
    if (!c) { c = document.createElement("div"); c.className = "hmcard"; hm.appendChild(c); }
    const tip = $(".hmtip", hm); if (tip) tip.hidden = true;
    const d = dig(s.price), tn = tone(s.chg), lo = s.low, hi = s.high, rng = hi > lo;
    const P = v => clamp((v - lo) / (hi - lo) * 100, 0, 100).toFixed(1) + "%";
    c.dataset.code = s.code;
    c.innerHTML = `<button type="button" class="hmc-x" aria-label="關閉">×</button>
      <div class="hmc-h"><b>${esc(s.name)}</b><i>${esc(s.code)}</i>${flagTag(s.code)}</div>
      <div class="hmc-p"><b class="${tn}">${fmt(s.price, d)}</b><span class="${tn}">${s.chg > 0 ? "▲" : s.chg < 0 ? "▼" : ""}${fmt(Math.abs(s.chg || 0), d)}（${pct(s.pct)}）</span></div>
      ${rng ? `<div class="hmc-r"><span>${fmt(lo, d)}</span><div class="hmc-bar"><i class="hmc-fill ${tn}" style="--from:${ok(s.prev) ? P(Math.max(lo, Math.min(hi, s.prev))) : "0%"};--to:${P(s.price)}"></i>${ok(s.open) ? `<i class="hmc-o" style="left:${P(s.open)}" title="開盤"></i>` : ""}<i class="hmc-dot ${tn}" style="left:${P(s.price)}"></i></div><span>${fmt(hi, d)}</span></div>` : ""}
      <div class="hmc-kv"><span>成交量</span><b>${fmt(s.vol)} 張</b><span>成交金額</span><b>${fmt(s.price * s.vol / 1e5, 1)} 億</b>${ok(s.open) ? `<span>開盤</span><b>${fmt(s.open, d)}</b>` : ""}${ok(s.prev) ? `<span>昨收</span><b>${fmt(s.prev, d)}</b>` : ""}</div>
      <button type="button" class="btn hmc-go">看個股 →</button>`;
    /* beside the tile, inside the map */
    const hr = hm.getBoundingClientRect(), tr = t.getBoundingClientRect(), w = c.offsetWidth, h = c.offsetHeight;
    let x = tr.right - hr.left + 8; if (x + w > hr.width - 6) x = tr.left - hr.left - w - 8; if (x < 6) x = clamp(tr.left - hr.left + tr.width / 2 - w / 2, 6, hr.width - w - 6);
    const y = clamp(tr.top - hr.top + tr.height / 2 - h / 2, 6, Math.max(6, hr.height - h - 6));
    c.style.left = x + "px"; c.style.top = y + "px";
    c.animate([{ opacity: 0, transform: "scale(.85) translateY(6px)", filter: "blur(4px)" }, { opacity: 1, transform: "none", filter: "none" }], { duration: 320, easing: "cubic-bezier(.16,1,.3,1)" });
    const f = $(".hmc-fill", c); if (f) f.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: 600, delay: 120, easing: "ease-out", fill: "backwards" });
    const dt = $(".hmc-dot", c); if (dt) dt.animate([{ transform: "translate(-50%, -50%) scale(.6)", opacity: 0 }, { transform: "translate(-50%, -50%) scale(1.4)", offset: .7 }, { transform: "translate(-50%, -50%) scale(1)" }], { duration: 420, delay: 600, fill: "backwards" });
    $$(".hmt.picked", hm).forEach(x => x.classList.remove("picked")); t.classList.add("picked");
  }
  function heatCardClose(hm) {
    const c = $(".hmcard", hm); $$(".hmt.picked", hm).forEach(x => x.classList.remove("picked"));
    if (c) c.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.9)" }], { duration: 160 }).onfinish = () => c.remove();
  }
  let heatRT = 0;
  addEventListener("resize", () => { clearTimeout(heatRT); heatRT = setTimeout(() => { const hm = $(".hm"); if (hm && hm.clientWidth !== HEAT.w) { HEAT.w = hm.clientWidth; HEAT.sig = ""; paintHeat(false); } }, 200); });

  /* ---------------- 注意股 / 處置股 (TWSE announcements; TPEx refuses other sites, so 上櫃 stocks are not covered) ---------------- */
  const FLAGS = new Map();                         /* code → { k: "punish" | "notice", t, info } */
  async function loadFlags() {
    if (!DB.live) return;
    const get = u => J(u).then(j => (j && j.stat === "OK" && Array.isArray(j.fields) ? j : null)).catch(() => null);
    const [n, p] = await Promise.all([get(`https://www.twse.com.tw/rwd/zh/announcement/notice?response=json&startDate=${DB.date}&endDate=${DB.date}`), get("https://www.twse.com.tw/rwd/zh/announcement/punish?response=json")]);
    FLAGS.clear();
    const col = (j, k) => j.fields.indexOf(k), cell = (j, r, k) => String(col(j, k) >= 0 ? r[col(j, k)] : "").trim();
    if (n) n.data.forEach(r => { const c = cell(n, r, "證券代號"); if (DB.by.has(c)) FLAGS.set(c, { k: "notice", t: "注意", info: cell(n, r, "注意交易資訊").replace(/﹝.*?﹞/g, "").replace(/。$/, ""), cnt: cell(n, r, "累計次數") }); });
    if (p) p.data.forEach(r => { const c = cell(p, r, "證券代號"); if (DB.by.has(c)) FLAGS.set(c, { k: "punish", t: "處置", info: `${cell(p, r, "處置起迄時間")}・${cell(p, r, "處置措施")}`, cond: cell(p, r, "處置條件") }); });
    FLAGS.ready = !!(n || p);
    paintTable(false); paintHead(); paintFlagCard(true);
  }
  const flagTag = code => { const f = FLAGS.get(code); return f ? `<em class="sflag ${f.k}" title="${esc(f.t + "股：" + f.info)}">${f.t}</em>` : ""; };
  function paintFlagCard(animate) {
    const card = $(".bd-flag"); if (!card) return;
    const list = [...FLAGS.entries()].map(([c, f]) => ({ s: DB.by.get(c), f })).filter(x => x.s).sort((a, b) => (a.f.k === "punish" ? 0 : 1) - (b.f.k === "punish" ? 0 : 1) || b.s.vol - a.s.vol);
    const mineSet = new Set(LISTS.flat());
    $(".bd-n", card).textContent = FLAGS.ready ? `處置 ${list.filter(x => x.f.k === "punish").length}・注意 ${list.filter(x => x.f.k === "notice").length}` : "";
    $(".bd-list", card).innerHTML = !FLAGS.ready ? `<p class="sub">${DB.live ? "載入中…" : "讀不到資料。"}</p>` : !list.length ? `<p class="sub">今天沒有上市股票被列入。</p>`
      : list.map(({ s, f }) => `<button type="button" class="bd-row fl-row" data-code="${esc(s.code)}"><span class="bd-nm"><b>${esc(s.name)}</b><i>${esc(s.code)}</i>${mineSet.has(s.code) ? `<i class="fl-mine">自選</i>` : ""}</span><span class="fl-info">${esc(f.info)}</span><span class="bd-v"><em class="sflag ${f.k}">${f.t}</em></span></button>`).join("");
    if (animate) $$(".fl-row", card).forEach((r, i) => r.animate([{ opacity: 0, transform: "translateX(-8px)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: Math.min(i, 12) * 40, fill: "backwards" }));
  }

  /* ---------------- 法人連續買賣超: the last 10 trading days of TWSE's T86, each day kept in this browser once read ---------------- */
  const STRK = { days: null, busy: false, tab: "f1" };
  const instKey = ds => "twinst-" + ds;
  function instRead(ds) {
    let v = null; try { v = localStorage.getItem(instKey(ds)); } catch (e) {}
    if (!v) return null;
    const m = new Map(); v.split(";").forEach(x => { const [c, f, t] = x.split(":"); if (c) m.set(c, [+f || 0, +t || 0]); });
    return m;
  }
  function instWrite(ds, m) {
    try {
      localStorage.setItem(instKey(ds), [...m].map(([c, v]) => c + ":" + v[0] + ":" + v[1]).join(";"));
      const cut = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10).replace(/-/g, "");
      Object.keys(localStorage).filter(k => k.startsWith("twinst-") && k.slice(7) < cut).forEach(k => localStorage.removeItem(k));
    } catch (e) {}
  }
  async function loadStreak() {
    if (STRK.busy || STRK.days || !DB.live || !MKT.rows) return;
    STRK.busy = true;
    let dates = MKT.rows.map(r => String(r[0])).filter(d => /^\d{8}$/.test(d));
    if (DB.date && DB.date > dates[dates.length - 1]) dates.push(DB.date);
    dates = dates.slice(-10).reverse();             /* newest first */
    const days = [];
    for (let i = 0; i < dates.length; i++) {
      const ds = dates[i];
      let m = instRead(ds);
      if (!m) {
        try {
          const j = await J(`https://www.twse.com.tw/rwd/zh/fund/T86?date=${ds}&selectType=ALLBUT0999&response=json`);
          if (j.stat === "OK" && Array.isArray(j.data) && j.data.length) {
            const ix = (...subs) => j.fields.findIndex(f => subs.every(s => f.includes(s)));
            const iF = ix("外陸資買賣超股數", "不含"), iF2 = ix("外資", "買賣超"), iT = ix("投信買賣超");
            m = new Map();
            j.data.forEach(r => { const c = String(r[0]).trim(), f = Math.round(num(r[iF >= 0 ? iF : iF2]) / 1000) || 0, t = Math.round(num(r[iT]) / 1000) || 0; if (f || t) m.set(c, [f, t]); });
            instWrite(ds, m);
          }
        } catch (e) {}
        await wait(350);
      }
      if (m) days.push({ ds, m });
      else if (i > 0 || days.length) break;         /* a missing day in the middle breaks the run; today's may not be out yet */
      paintStreakNote(`讀取法人資料 ${i + 1}/${dates.length}…`);
    }
    STRK.days = days; STRK.busy = false;
    paintStreak(true);
  }
  const paintStreakNote = t => { const el = $(".bd-strk .bd-list"); if (el && !STRK.days) el.innerHTML = `<p class="sub">${esc(t)}</p>`; };
  function streakRows(k, sg) {
    const D = STRK.days, out = [];
    D[0].m.forEach((v, c) => {
      if (Math.sign(v[k]) !== sg || !DB.by.has(c)) return;
      let n = 0, sum = 0;
      for (const d of D) { const x = (d.m.get(c) || [0, 0])[k]; if (Math.sign(x) !== sg) break; n++; sum += x; }
      if (n >= 2) out.push({ s: DB.by.get(c), n, sum });
    });
    return out.sort((a, b) => b.n - a.n || Math.abs(b.sum) - Math.abs(a.sum)).slice(0, 10);
  }
  function paintStreak(animate) {
    const card = $(".bd-strk"); if (!card) return;
    $$("[data-stk]", card).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.stk === STRK.tab)));
    if (!STRK.days) return;
    const D = STRK.days, el = $(".bd-list", card);
    if (!D.length) { el.innerHTML = `<p class="sub">讀不到證交所的法人資料。</p>`; return; }
    $(".bd-n", card).textContent = `近 ${D.length} 個交易日・至 ${shortDay(D[0].ds)}`;
    const k = STRK.tab[0] === "f" ? 0 : 1, sg = STRK.tab[1] === "1" ? 1 : -1, rows = streakRows(k, sg), mx = Math.max(1, ...rows.map(r => r.n));
    el.innerHTML = rows.length ? rows.map(r => `<button type="button" class="bd-row sk-row" data-code="${esc(r.s.code)}" style="--w:${(r.n / D.length * 100).toFixed(1)}%"><span class="bd-nm"><b>${esc(r.s.name)}</b><i>${esc(r.s.code)}</i></span><span class="bd-px ${sg > 0 ? "up" : "down"}">${signed(r.sum, 0)} 張</span><span class="bd-v sk-n">${r.n} 天</span></button>`).join("")
      : `<p class="sub">沒有連續 2 天以上的股票。</p>`;
    card.dataset.sg = sg > 0 ? "up" : "down";
    if (animate) $$(".sk-row", card).forEach((r, i) => r.animate([{ opacity: 0, backgroundSize: "0% 100%" }, { opacity: 1, backgroundSize: "var(--w) 100%" }], { duration: 650, delay: i * 45, easing: "ease-out", fill: "backwards" }));
  }

  /* ---------------- 分析 tab: which part shows. By default the one that fits the hour: 盤前 before 09:00, 盤中 in the session, 收盤 after it ---------------- */
  let ANA = "pm";
  function anaDefault() {
    const t = new Date(Date.now() + 8 * 3600e3), m = t.getUTCHours() * 60 + t.getUTCMinutes(), wd = t.getUTCDay();
    if (wd === 6) return m >= 9 * 60 ? "wk" : "cl";   /* the weekly review is written on Saturday 09:00 */
    if (wd === 0) return "cl";
    return m < 9 * 60 ? "pm" : m < 13 * 60 + 30 ? "md" : "cl";
  }
  /* 盤中 can only be analysed while the day session is open (weekdays 09:00–13:30; the Worker also refuses on exchange holidays) */
  function mdOpenNow() { const t = new Date(Date.now() + 8 * 3600e3), m = t.getUTCHours() * 60 + t.getUTCMinutes(), wd = t.getUTCDay(); return wd >= 1 && wd <= 5 && m >= 9 * 60 && m <= 13 * 60 + 30; }
  function mdGate() {
    const b = $("#dpPre .mdgo"), n = $("#dpPre .mdclosed"); if (!b || !n) return;
    const open = mdOpenNow() && !MD_HOLIDAY; if (b.disabled && b.textContent !== "分析") return;   /* a run in progress */
    b.hidden = !open; n.hidden = open; if (!open) n.textContent = MD_HOLIDAY ? "今天沒有開盤，不做盤中分析" : "非開盤時間，盤中無法分析";
  }
  let MD_HOLIDAY = false;
  setInterval(mdGate, 30000);
  function anaMark(bar, snap) {
    const b = $("[aria-selected=true]", bar), hl = $("i", bar); if (!b || !hl || !b.offsetWidth) return;
    if (snap) { hl.style.transition = "none"; }
    hl.style.width = b.offsetWidth + "px"; hl.style.transform = `translateX(${b.offsetLeft}px)`;
    if (snap) { void hl.offsetWidth; hl.style.transition = ""; }
  }
  function anaSub(k, animate) {
    const pre = $("#dpPre"), bar = $(".anasub", pre); if (!bar) return;
    if (!["cl", "pm", "md", "wk", "ar"].includes(k)) k = "pm";
    const prev = ANA; ANA = k;
    try { if (animate) sessionStorage.setItem("twana", k); } catch (e) {}
    const bs = $$("[data-sub]", bar), b = bs.find(x => x.dataset.sub === k) || bs[0];
    bs.forEach(x => x.setAttribute("aria-selected", String(x === b)));
    anaMark(bar);
    if (!bar._ro && window.ResizeObserver) { bar._ro = new ResizeObserver(() => anaMark(bar, true)); bar._ro.observe(bar); } /* the bar has no size while 分析 is hidden: place the highlight again once it shows */
    const order = ["pm", "md", "cl", "wk", "ar"], dir = order.indexOf(k) >= order.indexOf(prev) ? 1 : -1;
    $$(".dcard[data-sub]", pre).forEach(c => {
      const on = c.dataset.sub === k; c.hidden = !on;
      if (on && animate) { c.animate([{ opacity: 0, transform: `translateX(${dir * 40}px)` }, { opacity: 1, transform: "none" }], { duration: 360, easing: "cubic-bezier(.16,1,.3,1)" }); rise($$(".lrise", c), 50, 120); }
    });
  }

  /* ---------------- 收盤摘要 (written by the Worker at 15:30 on trading days, or on request) ---------------- */
  function clPaint(j, animate) {
    const el = $("#dpPre .clout"); if (!el) return;
    const n = j && j.note;
    if (!n || !n.analysis) { el.innerHTML = `<p class="sub">還沒有收盤摘要，交易日 15:30 會自動產生。</p>`; return; }
    document.dispatchEvent(new CustomEvent("twdash:close", { detail: n }));
    const a = n.analysis, d = n.data || {}, X = d.taiex || {}, B = d.breadth || {}, li = arr => (Array.isArray(arr) ? arr : []).map(x => `<li>${esc(x)}</li>`).join("");
    const at = new Date(n.at).toLocaleString("zh-TW", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const t = /紅/.test(a.call || "") ? "up" : /黑/.test(a.call || "") ? "down" : "";
    const mineBy = new Map((d.mine || []).map(x => [x.code, x]));
    el.innerHTML = `
      <div class="aisum lrise"><div class="aiverdict"><span class="aitag ${t}">${esc(a.call || "")}</span><b class="pmday">${esc(String(n.day).slice(5).replace("-", "/"))} 收盤</b><span class="sub">${esc(at)} 產生</span></div>
        <p class="ailead">${esc(a.headline || "")}</p>
        <div class="clnums">${X.z ? `<div><span>加權指數</span><b class="${tone(X.pct)}">${fmt(X.z, 2)}</b><i class="${tone(X.pct)}">${pct(X.pct)}</i></div>` : ""}${d.turnoverYi ? `<div><span>成交金額</span><b>${fmt(d.turnoverYi)} 億</b></div>` : ""}${B.up ? `<div><span>上漲／下跌</span><b><em class="up">${esc(B.up)}</em> / <em class="down">${esc(B.down)}</em></b></div>` : ""}</div>
        <p>${esc(a.market || "")}</p></div>
      ${a.check && (a.check.open || a.check.close) ? `<div class="clcheck lrise"><h4>盤前預測對帳</h4>${[a.check.open, a.check.close].filter(Boolean).map(x => `<p class="${/✅/.test(x) ? "ok" : /❌/.test(x) ? "miss" : ""}">${esc(x)}</p>`).join("")}${a.check.note ? `<p class="sub">${esc(a.check.note)}</p>` : ""}</div>` : ""}
      <div class="aicols"><div class="lrise"><h4>領漲</h4><ul>${li(a.lead)}</ul></div><div class="lrise"><h4>落後</h4><ul>${li(a.lag)}</ul></div></div>
      ${a.flows ? `<div class="lrise"><h4>法人</h4><p>${esc(a.flows)}</p></div>` : ""}
      ${Array.isArray(a.next) && a.next.length ? `<div class="lrise"><h4>下個交易日要盯</h4><ul>${li(a.next)}</ul></div>` : ""}
      ${n.news && n.news.length ? `<details class="pmmore"><summary>參考的新聞</summary><div class="newslist">${newsHTML(n.news, null)}</div></details>` : ""}`;
    if (animate) rise($$(".lrise", el), 70);
  }
  async function clLoad() { try { clPaint(await J(`${WORKER}/tw/close`), true); } catch (e) { const el = $("#dpPre .clout"); if (el) el.innerHTML = `<p class="sub">收盤摘要需要部署新版 Worker。</p>`; } }
  async function clRun(b) {
    const el = $("#dpPre .clout");
    $$(".runmsg", el).forEach(x => x.remove());
    b.disabled = true; b.textContent = "整理中…";
    try {
      const r = await fetch(WORKER + "/tw/close/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.analysis) throw new Error(aiLimitMsg(j) || (j && j.error && /[一-鿿]/.test(j.error.message || "") ? j.error.message : "暫時沒有回應，過幾分鐘再試"));
      clPaint({ note: j }, true);
      const tg = j.sent === "sent" ? "已傳到 Telegram。" : j.sent && j.sent !== "off" ? "Telegram 沒有送出：" + j.sent : "";
      if (tg) el.insertAdjacentHTML("afterbegin", `<p class="runmsg sub ${j.sent === "sent" ? "" : "warn"}">${esc(tg)}</p>`);
      if (j.saveError) el.insertAdjacentHTML("afterbegin", `<p class="runmsg sub warn">這份摘要沒有存到伺服器，其他裝置看不到：${esc(j.saveError)}</p>`);
    } catch (e) {
      /* a long run can outlast the connection even though the summary was written and sent: look for it before saying it failed */
      await new Promise(r => setTimeout(r, 4000));
      try { const j = await J(`${WORKER}/tw/close`); if (j.note && Date.now() - j.note.at < 300000) { clPaint(j, true); b.disabled = false; b.textContent = "產生"; return; } } catch (e2) {}
      el.insertAdjacentHTML("afterbegin", `<p class="runmsg sub warn">${/[一-鿿]/.test(e.message || "") ? esc(e.message) : "連線中斷，請稍後重新整理。"}</p>`);
    }
    b.disabled = false; b.textContent = "產生";
  }

  /* ---------------- 週回顧 (written by the Worker on Saturday 09:00, or on request when the last one is old) ---------------- */
  function wkPaint(j, animate) {
    const el = $("#dpPre .wkout"), go = $("#dpPre .wkgo"); if (!el) return;
    const n = j && j.note;
    if (go) go.hidden = !!(n && n.analysis && Date.now() - n.at < 6 * 864e5);
    if (!n || !n.analysis) { el.innerHTML = `<p class="sub">還沒有週回顧，每週六早上 09:00 會自動產生。</p>`; return; }
    const a = n.analysis, d = n.data || {}, W = d.week || {}, li = arr => (Array.isArray(arr) ? arr : []).map(x => `<li>${esc(x)}</li>`).join("");
    const t = /紅/.test(a.call || "") ? "up" : /黑/.test(a.call || "") ? "down" : "", md = x => String(x).slice(5).replace("-", "/");
    el.innerHTML = `
      <div class="aisum lrise"><div class="aiverdict"><span class="aitag ${t}">${esc(a.call || "")}</span><b class="pmday">${md(n.from)}–${md(n.day)} 週回顧</b></div>
        <p class="ailead">${esc(a.headline || "")}</p>
        <div class="clnums">${W.toClose ? `<div><span>加權指數</span><b class="${tone(W.changePct)}">${fmt(W.toClose, 2)}</b><i class="${tone(W.changePct)}">本週 ${pct(W.changePct)}</i></div>` : ""}${W.high ? `<div><span>本週高／低</span><b>${fmt(W.high, 0)} / ${fmt(W.low, 0)}</b></div>` : ""}</div>
        <p>${esc(a.market || "")}</p></div>
      ${(d.days || []).length ? `<div class="lrise"><h4>每日收盤</h4><div class="wkdays">${d.days.map(x => `<div><span>${esc(String(x.day).replace("-", "/"))}</span><b>${fmt(x.close, 0)}</b><i class="${tone(x.pct)}">${pct(x.pct)}</i></div>`).join("")}</div></div>` : ""}
      <div class="aicols"><div class="lrise"><h4>強勢</h4><ul>${li(a.lead)}</ul></div><div class="lrise"><h4>弱勢</h4><ul>${li(a.lag)}</ul></div></div>
      ${a.flows ? `<div class="lrise"><h4>法人</h4><p>${esc(a.flows)}</p></div>` : ""}
      ${Array.isArray(a.risks) && a.risks.length ? `<div class="lrise"><h4>風險</h4><ul>${li(a.risks)}</ul></div>` : ""}
      ${Array.isArray(a.next) && a.next.length ? `<div class="lrise"><h4>下週要盯</h4><ul>${li(a.next)}</ul></div>` : ""}
      ${n.news && n.news.length ? `<details class="pmmore"><summary>參考的新聞</summary><div class="newslist">${newsHTML(n.news, null)}</div></details>` : ""}`;
    if (animate) rise($$(".lrise", el), 70);
  }
  async function wkLoad() { try { wkPaint(await J(`${WORKER}/tw/week`), true); } catch (e) { const el = $("#dpPre .wkout"); if (el) el.innerHTML = `<p class="sub">週回顧需要部署新版 Worker。</p>`; } }
  async function wkRun(b) {
    const el = $("#dpPre .wkout"); $$(".runmsg", el).forEach(x => x.remove());
    b.disabled = true; b.textContent = "整理中…";
    try {
      const r = await fetch(WORKER + "/tw/week/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.analysis) throw new Error(aiLimitMsg(j) || (j && j.error && /[一-鿿]/.test(j.error.message || "") ? j.error.message : "暫時沒有回應，過幾分鐘再試"));
      wkPaint({ note: j }, true);
    } catch (e) {
      await new Promise(r => setTimeout(r, 4000));
      try { const j = await J(`${WORKER}/tw/week`); if (j.note && Date.now() - j.note.at < 300000) { wkPaint(j, true); b.disabled = false; b.textContent = "產生"; return; } } catch (e2) {}
      el.insertAdjacentHTML("afterbegin", `<p class="runmsg sub warn">${/[一-鿿]/.test(e.message || "") ? esc(e.message) : "連線中斷，請稍後重新整理。"}</p>`);
    }
    b.disabled = false; b.textContent = "產生";
  }

  /* ---------------- 股票 tab: 清單 / 選股 / 營收 / 族群 / 法人, one shown at a time ---------------- */
  let LST = "ls";
  function lstSub(k, animate) {
    const dl = $("#dpList"), bar = $(".lsub", dl); if (!bar) return;
    const order = ["ls", "rk", "cp", "sc", "rv"];
    if (!order.includes(k)) k = "ls";
    const prev = LST; LST = k;
    try { if (animate) sessionStorage.setItem("twlst", k); } catch (e) {}
    const bs = $$("[data-sub]", bar), b = bs.find(x => x.dataset.sub === k) || bs[0];
    bs.forEach(x => x.setAttribute("aria-selected", String(x === b)));
    anaMark(bar);
    if (!bar._ro && window.ResizeObserver) { bar._ro = new ResizeObserver(() => anaMark(bar, true)); bar._ro.observe(bar); }
    const dir = order.indexOf(k) >= order.indexOf(prev) ? 1 : -1;
    $$(":scope > .dcard[data-sub]", dl).forEach(c => {
      const on = c.dataset.sub === k; c.hidden = !on;
      if (on && animate) c.animate([{ opacity: 0, transform: `translateX(${dir * 40}px)` }, { opacity: 1, transform: "none" }], { duration: 360, easing: "cubic-bezier(.16,1,.3,1)" });
    });
    if (k === "sc") scGo(); else if (k === "rv") rvGo();
    document.dispatchEvent(new CustomEvent("twdash:lstsub", { detail: k }));
  }
  const stockish = s => /^\d{4}$/.test(s.code) && s.mkt !== "esb";
  const rowBtn = (s, right, sub) => `<button type="button" class="instrow" data-code="${esc(s.code)}"><span class="nm"><b>${esc(s.name)}</b><em>${esc(s.code)}${sub ? "・" + sub : ""}</em></span><span class="rr">${right}</span></button>`;
  function lstBuild(dl) {
    dl.insertAdjacentHTML("beforeend", `
      <div class="dcard sc" data-sub="sc"><div class="aihead"><div><h3>選股器</h3></div><span class="sub scn"></span></div>
        <div class="scform">${SC_F.map(f => `<label><span>${f.l}</span><select data-f="${f.k}">${f.o.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>`).join("")}</div>
        <div class="scpre"><button type="button" class="chip scclr">清除目前條件</button><span class="scpl" hidden></span></div>
        <div class="scout"></div></div>
      <div class="dcard rv" data-sub="rv"><div class="aihead"><div><h3>月營收排行</h3></div><span class="sub rvn"></span></div>
        <div class="hmseg rvseg" role="group" aria-label="營收">${[["yu", "年增 ↑"], ["yd", "年增 ↓"], ["mu", "月增 ↑"], ["md", "月增 ↓"]].map(([k, l]) => `<button type="button" data-g="${k}" aria-pressed="${k === "yu"}">${l}</button>`).join("")}<i></i></div>
        <p class="sub rvnote">只列當月營收 1 億元以上的公司（太小的公司比例會失真）。</p>
        <div class="rvout"></div></div>
      <div class="dcard gp" data-sub="gp"><div class="aihead"><div><h3>族群／概念股</h3></div><span class="sub">自訂參考分類・今日平均漲跌</span></div><div class="gpout"></div></div>`);
    const sc = $(".sc", dl), st = store.get("twmain-sc", {});
    $$("select", sc).forEach(sel => { if (st[sel.dataset.f] != null && [...sel.options].some(o => o.value === st[sel.dataset.f])) sel.value = st[sel.dataset.f]; });
    sc.addEventListener("change", e => { const o = {}; $$("select", sc).forEach(x => (o[x.dataset.f] = x.value)); store.set("twmain-sc", o); if (e.target.tagName === "SELECT") $$("[data-bi]", sc).forEach(x => x.setAttribute("aria-pressed", "false")); scPaint(true); });
    /* saved conditions: one tap brings a whole set of filters back (kept in this browser, up to 8) */
    const PK = "twmain-sc-presets", defOf = f => f.o[0][0];
    const presets = () => store.get(PK, []) || [];
    const preName = v => { const parts = SC_F.filter(f => f.k !== "sort" && v[f.k] != null && v[f.k] !== defOf(f)).map(f => { const o = f.o.find(x => x[0] === v[f.k]); return o ? (f.k === "ind" ? o[1] : f.l + " " + o[1]) : ""; }).filter(Boolean); return parts.length ? parts.slice(0, 3).join("＋") : "全部股票"; };
    const prePaint = () => { $(".scpl", sc).innerHTML = presets().map((p, i) => `<span class="scp"><button type="button" class="chip" data-pi="${i}">${esc(p.n)}</button><button type="button" class="scx" data-px="${i}" aria-label="刪除這組條件">×</button></span>`).join(""); };
    prePaint();
    /* built-in strategies: one tap sets the whole form (everything else back to 不限) */
    const BI = [["高殖利率", { yld: "5", pe: "20", sort: "yld" }], ["營收創高", { yoy: "30", vol: "1000", sort: "yoy" }], ["法人買超＋站上月線", { chip: "a", ma: "above20", vol: "1000", sort: "vol" }],
      ["強勢突破", { sig: "high60", volx: "1.5", sort: "pct" }], ["低本益比價值", { pe: "10", yld: "3", sort: "pe" }], ["量增上攻", { pct: "3", volx: "2", vol: "1000", sort: "pct" }]];
    $(".scpre", sc).insertAdjacentHTML("beforebegin", `<div class="scpre scbi">${BI.map(([n], i) => `<button type="button" class="chip" data-bi="${i}">${n}</button>`).join("")}</div>`);
    sc.addEventListener("click", e => {
      const bi = e.target.closest("[data-bi]"); if (!bi) return;
      const v = BI[+bi.dataset.bi][1];
      $$("select", sc).forEach(sel => { const f = SC_F.find(x => x.k === sel.dataset.f), want = v[sel.dataset.f] != null ? v[sel.dataset.f] : f.o[0][0]; if ([...sel.options].some(o => o.value === want)) sel.value = want; });
      $$("[data-bi]", sc).forEach(x => x.setAttribute("aria-pressed", String(x === bi)));
      sc.dispatchEvent(new Event("change"));
    });
    sc.addEventListener("click", e => {
      const sv = e.target.closest(".scclr");
      if (sv) { $$("select", sc).forEach(x => { x.value = x.options[0].value; }); $$("[data-bi]", sc).forEach(x => x.setAttribute("aria-pressed", "false")); sc.dispatchEvent(new Event("change")); sv.animate([{ transform: "scale(1)" }, { transform: "scale(.94)" }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(.34,1.4,.5,1)" }); return; }
      const x = e.target.closest("[data-px]"); if (x) { const L = presets(); L.splice(+x.dataset.px, 1); store.set(PK, L); prePaint(); return; }
      const pb = e.target.closest("[data-pi]"); if (pb) { const p = presets()[+pb.dataset.pi]; if (!p) return; $$("select", sc).forEach(sel => { if (p.v[sel.dataset.f] != null && [...sel.options].some(o => o.value === p.v[sel.dataset.f])) sel.value = p.v[sel.dataset.f]; }); sc.dispatchEvent(new Event("change")); }
    });
    sc.addEventListener("click", e => { const r = e.target.closest(".instrow"); if (r) openStock(r.dataset.code, r); });
    const rv = $(".rv", dl), seg = $(".rvseg", rv);
    seg.addEventListener("click", e => { const b = e.target.closest("[data-g]"); if (!b) return; $$("[data-g]", seg).forEach(x => x.setAttribute("aria-pressed", String(x === b))); RV.g = b.dataset.g; segMark(seg); rvPaint(true); });
    if (window.ResizeObserver) new ResizeObserver(() => segMark(seg)).observe(seg);
    rv.addEventListener("click", e => { const r = e.target.closest(".instrow"); if (r) openStock(r.dataset.code, r); });
    $(".gp", dl).addEventListener("click", e => {
      const m = e.target.closest("[data-code]"); if (m) { openStock(m.dataset.code, m); return; }
      const h = e.target.closest(".gphead"); if (h) { h.parentElement.classList.toggle("open"); }
    });
  }
  /* 選股器 */
  const SC_F = [
    { k: "yld", l: "殖利率", o: [["0", "不限"], ["3", "≥ 3%"], ["4", "≥ 4%"], ["5", "≥ 5%"], ["6", "≥ 6%"]] },
    { k: "pe", l: "本益比", o: [["0", "不限"], ["10", "≤ 10"], ["15", "≤ 15"], ["20", "≤ 20"], ["25", "≤ 25"]] },
    { k: "yoy", l: "月營收年增", o: [["-999", "不限"], ["0", "≥ 0%"], ["10", "≥ 10%"], ["20", "≥ 20%"], ["30", "≥ 30%"], ["50", "≥ 50%"]] },
    { k: "pct", l: "今日漲跌幅", o: [["-99", "不限"], ["0", "上漲"], ["3", "≥ +3%"], ["5", "≥ +5%"], ["-3", "≤ -3%（下跌）"]] },
    { k: "vol", l: "成交量", o: [["0", "不限"], ["1000", "≥ 1,000 張"], ["5000", "≥ 5,000 張"], ["20000", "≥ 20,000 張"]] },
    { k: "chip", l: "法人（最近一日）", o: [["", "不限"], ["a", "三大法人買超"], ["f", "外資買超"], ["t", "投信買超"]] },
    { k: "ma", l: "均線（上市）", o: [["", "不限"], ["above20", "站上月線"], ["above60", "站上季線"]] },
    { k: "sig", l: "訊號（上市）", o: [["", "不限"], ["gold", "KD 黃金交叉（近 3 日）"], ["high60", "收盤創 60 日新高"]] },
    { k: "volx", l: "量能（上市）", o: [["0", "不限"], ["1.5", "≥ 20 日均量 1.5 倍"], ["2", "≥ 2 倍"], ["3", "≥ 3 倍"]] },
    { k: "px", l: "股價", o: [["", "不限"], ["le50", "≤ 50 元"], ["le100", "≤ 100 元"], ["le300", "≤ 300 元"], ["ge300", "≥ 300 元"], ["ge1000", "≥ 1,000 元"]] },
    { k: "ind", l: "產業", o: [["", "不限"], ...Object.entries(INDN).filter(([id]) => !/^(80|91)$/.test(id)).sort((a, b) => a[1].localeCompare(b[1], "zh-TW")).map(([id, n]) => [id, n])] },
    { k: "sort", l: "排序", o: [["vol", "成交量"], ["pct", "漲跌幅"], ["yld", "殖利率"], ["yoy", "營收年增"], ["pe", "本益比（低→高）"]] },
  ];
  async function scGo() { const el = $(".scout"); if (el && !FUND.map) el.innerHTML = `<p class="sub">讀取財務與法人資料…</p>`; await Promise.all([loadFund(), loadChip()]); scPaint(false); }
  function scPaint(animate) {
    const card = $("#dpList .sc"), el = $(".scout", card); if (!card) return;
    if (!DB.live) { el.innerHTML = `<p class="sub">讀不到資料。</p>`; return; }
    const v = {}; $$("select", card).forEach(x => (v[x.dataset.f] = x.value));
    const F = FUND.map || new Map(), C = CHIP.map || new Map(), rows = [];
    const tw = window.TWExtra && TWExtra.screenWants(v);
    if (tw && !TWExtra.screenReady(v, el, () => scPaint(false))) { $(".scn", card).textContent = ""; return; }
    DB.list.forEach(s => {
      if (tw && !TWExtra.screenPass(s.code, v)) return;
      if (!stockish(s) || !(s.price > 0) || !(s.vol > 0)) return;
      const f = F.get(s.code) || {}, c = C.get(s.code) || {};
      if (+v.yld > 0 && !(f.yld >= +v.yld)) return;
      if (+v.pe > 0 && !(f.pe > 0 && f.pe <= +v.pe)) return;
      if (+v.yoy > -999 && !(f.yoy >= +v.yoy)) return;
      if (+v.pct > -99) { if (+v.pct === -3 ? !(s.pct <= -3) : !(s.pct >= (+v.pct === 0 ? 0.0001 : +v.pct))) return; }
      if (+v.vol > 0 && !(s.vol >= +v.vol)) return;
      if (v.chip && !(c[v.chip] > 0)) return;
      if (v.ind && !(INDMAP && INDMAP[s.code] === v.ind)) return;
      if (v.px) { const n = +v.px.slice(2); if (v.px.startsWith("le") ? !(s.price <= n) : !(s.price >= n)) return; }
      rows.push({ s, f, c });
    });
    const key = { vol: r => -r.s.vol, pct: r => -r.s.pct, yld: r => -(r.f.yld || -1), yoy: r => -(Number.isFinite(r.f.yoy) ? r.f.yoy : -1e9), pe: r => (r.f.pe > 0 ? r.f.pe : 1e9) }[v.sort] || (r => -r.s.vol);
    rows.sort((a, b) => key(a) - key(b));
    $(".scn", card).textContent = `符合 ${rows.length.toLocaleString("zh-TW")} 檔${rows.length > 40 ? "，列前 40" : ""}`;
    if (!FUND.map && (+v.yld > 0 || +v.pe > 0 || +v.yoy > -999)) { el.innerHTML = `<p class="sub">財務資料還沒讀到，稍後再試。</p>`; return; }
    el.innerHTML = rows.length ? rows.slice(0, 40).map(r => rowBtn(r.s, `<b>${fmt(r.s.price, dig(r.s.price))}</b> <i class="${tone(r.s.pct)}">${pct(r.s.pct)}</i>`, [r.f.yld > 0 ? "殖利 " + r.f.yld.toFixed(2) + "%" : "", r.f.pe > 0 ? "本益比 " + r.f.pe.toFixed(1) : "", Number.isFinite(r.f.yoy) ? "年增 " + r.f.yoy.toFixed(0) + "%" : ""].filter(Boolean).join("・"))).join("") : `<p class="sub">沒有符合的股票，放寬一些條件試試。</p>`;
    if (animate) rise($$(".instrow", el).slice(0, 14), 20);
  }
  /* 月營收排行 */
  const RV = { g: "yu" };
  async function rvGo() { const el = $(".rvout"); if (el && !FUND.map) el.innerHTML = `<p class="sub">讀取月營收…</p>`; await loadFund(); rvPaint(false); }
  function rvPaint(animate) {
    const card = $("#dpList .rv"), el = $(".rvout", card); if (!card) return;
    if (!FUND.map) { el.innerHTML = `<p class="sub">月營收資料還沒讀到，稍後再試。</p>`; return; }
    const k = RV.g[0] === "y" ? "yoy" : "mom", up = RV.g[1] === "u";
    const rows = DB.list.filter(stockish).map(s => ({ s, f: FUND.map.get(s.code) })).filter(r => r.f && r.f.rev >= 1 && Number.isFinite(r.f[k]));
    rows.sort((a, b) => (up ? b.f[k] - a.f[k] : a.f[k] - b.f[k]));
    const ym = (rows[0] && rows[0].f.ym) || "", ymt = /^\d{5}$/.test(ym) ? `${+ym.slice(0, 3) + 1911}/${ym.slice(3)}` : ym;
    $(".rvn", card).textContent = ymt ? ymt + " 營收" : "";
    el.innerHTML = rows.slice(0, 30).map(r => rowBtn(r.s, `<b class="${tone(r.f[k])}">${r.f[k] > 0 ? "+" : ""}${r.f[k].toFixed(1)}%</b>`, `營收 ${r.f.rev.toFixed(1)} 億・${k === "yoy" ? "月增 " + (Number.isFinite(r.f.mom) ? r.f.mom.toFixed(0) + "%" : "—") : "年增 " + (Number.isFinite(r.f.yoy) ? r.f.yoy.toFixed(0) + "%" : "—")}`)).join("") || `<p class="sub">沒有資料。</p>`;
    if (animate) rise($$(".instrow", el).slice(0, 14), 20);
  }
  /* 族群／概念股 */
  const GROUPS = [
    ["AI 伺服器", ["2317", "2382", "3231", "6669", "2356", "3706", "2376", "2301"]],
    ["散熱", ["3017", "3324", "2421", "6230", "3653", "8210"]],
    ["矽光子／CPO", ["3081", "3450", "6442", "4979", "3363", "3380"]],
    ["半導體", ["2330", "2303", "3711", "2454", "3034", "2379", "3443", "5269"]],
    ["記憶體", ["2408", "2337", "2344", "3006", "8299", "3260"]],
    ["PCB／載板", ["3037", "8046", "3189", "2368", "4958", "6213"]],
    ["網通", ["2345", "3596", "2332", "5388", "6285", "3704"]],
    ["重電／電網", ["1519", "1513", "1503", "1504", "1514", "1609"]],
    ["被動元件", ["2327", "2492", "2456", "6173", "3026"]],
    ["航運", ["2603", "2609", "2615", "2605", "2606", "5608"]],
    ["金融", ["2881", "2882", "2891", "2886", "2884", "2892", "5880", "2887"]],
    ["軍工／航太", ["2634", "8033", "3005", "2645"]],
    ["生技", ["6446", "4743", "1760", "4147", "6547"]],
    ["營建", ["2504", "2515", "2520", "2538", "2542", "5534"]],
    ["鋼鐵", ["2002", "2014", "2015", "2006", "2027"]],
  ];
  function gpPaint() {
    const el = $(".gpout"); if (!el) return;
    if (!DB.live || !DB.list.length) { el.innerHTML = `<p class="sub">讀不到資料。</p>`; return; }
    const open = new Set($$(".gpg.open .gpname").map(x => x.textContent));
    const gs = GROUPS.map(([n, cs]) => { const ms = cs.map(c => DB.by.get(c)).filter(s => s && s.price > 0 && ok(s.pct)); return { n, ms, avg: ms.length ? ms.reduce((t, s) => t + s.pct, 0) / ms.length : null, up: ms.filter(s => s.chg > 0).length }; }).filter(g => g.ms.length >= 3).sort((a, b) => b.avg - a.avg);
    const mx = Math.max(1, ...gs.map(g => Math.abs(g.avg)));
    el.innerHTML = gs.map(g => `<div class="gpg${open.has(g.n) ? " open" : ""}"><button type="button" class="gphead"><span class="gpname">${esc(g.n)}</span><span class="gpbar"><i class="${tone(g.avg)}" style="width:${Math.max(4, Math.abs(g.avg) / mx * 100).toFixed(0)}%"></i></span><b class="${tone(g.avg)}">${pct(g.avg)}</b><em>${g.up}/${g.ms.length} 漲</em></button><div class="gpmem">${g.ms.slice().sort((a, b) => b.pct - a.pct).map(s => `<button type="button" data-code="${esc(s.code)}"><span>${esc(s.name)}</span><i class="${tone(s.pct)}">${pct(s.pct)}</i></button>`).join("")}</div></div>`).join("");
  }

  /* ---------------- 法人買賣超排行 (TWSE T86 through the Worker) ---------------- */
  const INST = { g: "a", data: null };
  function instInit(card) {
    const seg = $(".instseg", card);
    seg.addEventListener("click", e => { const b = e.target.closest("[data-g]"); if (!b) return; $$("[data-g]", seg).forEach(x => x.setAttribute("aria-pressed", String(x === b))); INST.g = b.dataset.g; segMark(seg); instPaint(true); });
    if (window.ResizeObserver) new ResizeObserver(() => segMark(seg)).observe(seg);
    card.addEventListener("click", e => { const r = e.target.closest(".instrow"); if (r) openStock(r.dataset.code, r); });
  }
  async function instLoad() {
    const el = $(".instout"); if (!el) return;
    try { INST.data = await J(`${WORKER}/tw/instrank`); } catch (e) { el.innerHTML = `<p class="sub">法人買賣超讀不到資料（${esc(whyOf(e))}）。</p>`; return; }
    instPaint(true);
  }
  function instPaint(animate) {
    const card = $(".inst"), D = INST.data; if (!card || !D) return;
    const el = $(".instout", card), g = (D.groups || {})[INST.g] || { buy: [], sell: [] };
    $(".instday", card).textContent = String(D.day).slice(5).replace("-", "/") + "・單位：張";
    const col = (title, arr, cls) => `<div class="instcol"><h4>${title}</h4>${arr.length ? arr.map(([c, n, v]) => `<button type="button" class="instrow" data-code="${esc(c)}"><span class="nm"><b>${esc(n)}</b><em>${esc(c)}</em></span><span class="${cls}">${v > 0 ? "+" : ""}${Number(v).toLocaleString("zh-TW")}</span></button>`).join("") : `<p class="sub">沒有資料</p>`}</div>`;
    el.innerHTML = `<div class="instcols">${col("買超", g.buy, "up")}${col("賣超", g.sell, "down")}</div>`;
    if (animate) rise($$(".instrow", el), 25);
  }

  /* ---------------- 國際行情 and 期貨籌碼 on 總覽 (through the Worker) ---------------- */
  /* the four US indices, second row of the index cards: last close (or the live quote while Wall Street trades) and the day's change */
  function usPaint(rows) {
    IDX.filter(i => i.us).forEach(it => {
      const r = rows.find(x => x.symbol === it.us); if (!r) return;
      const p = r.changePct, y = ok(p) ? r.last / (1 + p / 100) : NaN, t = r.asOfTaipei ? r.asOfTaipei.slice(5).replace("-", "/") : "";
      Object.assign(it, { z: r.last, y, tm: "", src: "美股 UTC+8 " + t, rt: true, hist: Array.isArray(r.hist) ? r.hist : null });
    });
    paintIdx(); paintSparks();
  }
  async function wdLoad() {
    const el = $("#dpOverview .wdout"); if (!el) return;
    try {
      const j = await J(`${WORKER}/tw/world`), rows = j.rows || [];
      if (!rows.length) throw 0;
      usPaint(rows);
      const dg = r => (/殖利率/.test(r.name) ? 3 : r.last >= 1000 ? 0 : 2);
      el.innerHTML = `<div class="wdgrid">${rows.filter(r => !/^(S&P 500|Nasdaq|道瓊|費城半導體|加權指數)$/.test(r.name) && !/^\^(GSPC|IXIC|DJI|SOX|TWII)$/.test(r.symbol || "")).map(r => `<div class="wdcell"><span>${esc(r.name)}</span><b>${fmt(r.last, dg(r))}</b><i class="${/VIX/.test(r.name) ? tone(-r.changePct) : tone(r.changePct)}">${r.changePct == null ? "—" : pct(r.changePct)}</i></div>`).join("")}</div>`;
      const t = rows.map(r => r.asOfTaipei).filter(Boolean).sort().pop(); $("#dpOverview .wdn").textContent = t ? t.slice(5).replace("-", "/") + " 更新" : "";
    } catch (e) { const why = e === 0 ? "Worker 沒有回傳美股資料" : whyOf(e); IDX.filter(i => i.us).forEach(i => Object.assign(i, { why, z: NaN, y: NaN, h: NaN, l: NaN, src: "", rt: false, hist: null })); try { paintIdx(); } catch (er) {} el.innerHTML = `<p class="sub">讀不到資料（${why}）。</p>`; }
  }
  async function ftLoad() {
    const el = $(".ftout"); if (!el) return;
    try {
      const j = await J(`${WORKER}/tw/futchip`), who = [["f", "外資"], ["t", "投信"], ["d", "自營商"]];
      const mx = Math.max(1, ...who.map(([k]) => Math.abs((j[k] || {}).net || 0)));
      const h = (j.history || []).filter(x => Number.isFinite(x.f));
      let spark = "";
      if (h.length >= 2) {
        const v = h.map(x => x.f), lo = Math.min(...v, 0), hi = Math.max(...v, 0), sp = hi - lo || 1, Y = y => (34 - (y - lo) / sp * 30).toFixed(1);
        spark = `<div class="ftspark"><span>外資淨部位 近 ${h.length} 天</span><svg viewBox="0 0 120 38" preserveAspectRatio="none"><line x1="0" x2="120" y1="${Y(0)}" y2="${Y(0)}"/><polyline points="${v.map((y, i) => `${(i / (v.length - 1) * 120).toFixed(1)},${Y(y)}`).join(" ")}"/></svg></div>`;
      }
      el.innerHTML = who.map(([k, l]) => { const x = j[k]; if (!x || x.net == null) return ""; return `<div class="ftrow"><span>${l}</span><span class="ftbar"><i class="${tone(x.net)}" style="width:${Math.max(3, Math.abs(x.net) / mx * 100).toFixed(0)}%"></i></span><b class="${tone(x.net)}">${x.net > 0 ? "+" : ""}${x.net.toLocaleString("zh-TW")}</b><em>多 ${(x.long || 0).toLocaleString("zh-TW")}／空 ${(x.short || 0).toLocaleString("zh-TW")}</em></div>`; }).join("") + spark + `<p class="sub ftfoot">${esc(String(j.date).slice(5).replace("-", "/"))} 收盤後，單位：口。淨口數為正代表偏多、為負代表偏空。</p>`;
    } catch (e) { el.innerHTML = `<p class="sub">期貨籌碼讀不到資料（${esc(whyOf(e))}）。</p>`; }
  }
  let wdAt = Date.now();   /* US session: every 10 s; otherwise every 5 minutes */
  setInterval(() => { if (document.hidden || cur !== "dpOverview") return; const gap = window.TWSet && window.TWSet.usOpen() ? 10000 : 300000; if (Date.now() - wdAt >= gap - 500) { wdAt = Date.now(); wdLoad(); } }, 5000);

  /* ---------------- stock page: 融資融券, 股權分散, 本益比河流圖 ---------------- */
  const XT = new Map();
  /* the Worker first (7 seconds at most); when TWSE / TDCC refuse the Worker's servers, this browser asks them itself */
  const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  const nz = v => { const n = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
  const wdays = n => { const out = []; let d = new Date(Date.now() + 8 * 3600e3); for (let k = 0; k < n; k++, d = new Date(d.getTime() - 864e5)) if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10).replace(/-/g, "")); return out; };
  const MGD = new Map();
  async function directMargin(code) {
    const rows = [];
    for (const ds of wdays(14)) {
      if (rows.length >= 8) break;
      let m = MGD.get(ds);
      if (m === undefined) {
        try {
          const j = await J(`https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${ds}&selectType=STOCK&response=json`), t = Array.isArray(j.tables) ? j.tables.find(x => x && Array.isArray(x.data) && Array.isArray(x.fields) && x.fields[0] === "代號") : null;
          m = j.stat === "OK" && t ? Object.fromEntries(t.data.map(r => [String(r[0]).trim(), [nz(r[5]), nz(r[6]), nz(r[11]), nz(r[12])]])) : null;
          if (m) MGD.set(ds, m);
        } catch (e) { m = null; }
      }
      const r = m && m[code]; if (!r) continue;
      rows.unshift({ d: ds.slice(0, 4) + "-" + ds.slice(4, 6) + "-" + ds.slice(6), fin: r[1], finChg: r[1] - r[0], sht: r[3], shtChg: r[3] - r[2] });
    }
    if (!rows.length) throw new Error("no margin");
    return { code, rows };
  }
  async function directPe(code, n) {
    const yms = []; let d = new Date(Date.now() + 8 * 3600e3);
    for (let k = 0; k < n; k++) { yms.unshift(d.toISOString().slice(0, 7).replace("-", "")); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)); }
    const out = [];
    for (let i = 0; i < yms.length; i += 4) {
      const part = await Promise.all(yms.slice(i, i + 4).map(async ym => {
        try {
          const j = await J(`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?date=${ym}01&stockNo=${code}&response=json`);
          if (j.stat !== "OK" || !Array.isArray(j.data) || !Array.isArray(j.fields)) return [];
          const F = j.fields, f = k => F.findIndex(x => String(x).includes(k)), iD = f("日期"), iP = f("本益比"), iY = f("殖利率"), iB = f("淨值比");
          return j.data.map(r => { const m = String(r[iD]).match(/(\d+)\D+(\d+)\D+(\d+)/); if (!m) return null; const y = +m[1] < 1911 ? +m[1] + 1911 : +m[1];
            return [y + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[3]).padStart(2, "0"), iP >= 0 ? nz(r[iP]) : null, iY >= 0 ? nz(r[iY]) : null, iB >= 0 ? nz(r[iB]) : null]; }).filter(Boolean);
        } catch (e) { return []; }
      }));
      part.forEach(a => out.push(...a));
    }
    if (!out.length) throw new Error("no pe");
    return { code, rows: out };
  }
  /* 集保 distribution through FinMind (CORS open): the latest week, 15 levels */
  async function directHolders(code) {
    const from = new Date(Date.now() + 8 * 3600e3 - 40 * 864e5).toISOString().slice(0, 10);
    const j = await J(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockHoldingSharesPer&data_id=${encodeURIComponent(code)}&start_date=${from}`), a = Array.isArray(j.data) ? j.data : [];
    if (!a.length) throw new Error("no holders");
    const date = a.reduce((m, r) => (r.date > m ? r.date : m), ""), low = r => { const t = String(r.HoldingSharesLevel); if (/more|以上/i.test(t)) return 1e9; const m = t.replace(/,/g, "").match(/\d+/); return m ? +m[0] : -1; };
    const L = a.filter(r => r.date === date && /\d/.test(String(r.HoldingSharesLevel)) && !/total|合計|差異/i.test(String(r.HoldingSharesLevel))).sort((x, y) => low(x) - low(y)).slice(0, 15).map((r, i) => ({ lv: i + 1, people: nz(r.people), shares: nz(r.unit), pct: nz(r.percent) }));
    if (L.length < 10) throw new Error("no holders");
    const sum = (x, y, k) => Math.round(L.filter(o => o.lv >= x && o.lv <= y).reduce((t, o) => t + (o[k] || 0), 0) * 100) / 100;
    return { code, date, levels: L, big1000: sum(15, 15, "pct"), big400: sum(12, 15, "pct"), small10: sum(1, 3, "pct"), bigPeople: sum(12, 15, "people"), totalPeople: sum(1, 15, "people") };
  }
  const xtGet = (kind, code, q) => {
    const k = kind + ":" + code + (q || "");
    if (!XT.has(k)) {
      const direct = kind === "margin" ? () => directMargin(code) : kind === "pe" ? () => directPe(code, +((q || "").match(/m=(\d+)/) || [0, 12])[1]) : () => directHolders(code);
      XT.set(k, within(J(`${WORKER}/tw/${kind}?c=${encodeURIComponent(code)}${q || ""}`), 7000).catch(() => direct()).catch(e => { XT.delete(k); throw e; }));
    }
    return XT.get(k);
  };
  function stockExtras(code, tok) {
    const box = $("#dpStock"), put = (cls, html, note) => { if (tok !== chartTok || code !== CODE) return; const c = $("." + cls, box); if (!c) return; $(".sxout", c).innerHTML = html; $(".sxn", c).textContent = note || ""; };
    const miss = m => `<p class="sub">${m}</p>`, s0 = DB.by.get(code);
    ["smg", "shd", "spe", "sfin", "sinst"].forEach(c => put(c, miss("載入中…")));
    if (!s0 || !/^\d{4,6}[A-Z]?$/.test(code)) return;
    if (/^00/.test(code)) { put("smg", miss("沒有資料。")); put("spe", miss("沒有資料。")); }   /* ETFs have no margin trading and no P/E */
    else xtGet("margin", code).then(j => {
      const r = (j.rows || []).slice().reverse(), sg = v => (v > 0 ? "+" : "") + Number(v).toLocaleString("zh-TW");
      put("smg", `<div class="mgtbl"><div class="mgh"><span>日期</span><span>融資餘額</span><span>增減</span><span>融券餘額</span><span>增減</span><span>券資比</span></div>${r.map(x => `<div><span>${esc(x.d.slice(5).replace("-", "/"))}</span><span>${x.fin.toLocaleString("zh-TW")}</span><span class="${tone(x.finChg)}">${sg(x.finChg)}</span><span>${x.sht.toLocaleString("zh-TW")}</span><span class="${tone(x.shtChg)}">${sg(x.shtChg)}</span><span>${x.fin > 0 ? (x.sht / x.fin * 100).toFixed(1) + "%" : "—"}</span></div>`).join("")}</div>`, "單位：張");
    }, () => put("smg", miss("讀不到資料。")));
    xtGet("holders", code).then(j => {
      const L = j.levels || [], g = (a, b) => Math.round(L.filter(x => x.lv >= a && x.lv <= b).reduce((t, x) => t + (x.pct || 0), 0) * 100) / 100;
      const bands = [["10 張以下", g(1, 3)], ["10–50 張", g(4, 8)], ["50–200 張", g(9, 10)], ["200–400 張", g(11, 11)], ["400–1,000 張", g(12, 14)], ["1,000 張以上", g(15, 15)]], mx = Math.max(1, ...bands.map(b => b[1]));
      put("shd", `<div class="hdtiles"><div><span>千張大戶持股</span><b>${j.big1000.toFixed(2)}%</b></div><div><span>400 張以上</span><b>${j.big400.toFixed(2)}%</b></div><div><span>10 張以下散戶</span><b>${j.small10.toFixed(2)}%</b></div><div><span>股東人數</span><b>${Number(j.totalPeople).toLocaleString("zh-TW")}</b></div></div>${bands.map(([n, v]) => `<div class="hdrow"><span>${n}</span><span class="hdbar"><i style="width:${Math.max(1, Math.min(100, v)).toFixed(0)}%"></i></span><b>${v.toFixed(2)}%</b></div>`).join("")}`, String(j.date).slice(5).replace("-", "/") + " 週資料");
    }, () => put("shd", miss("讀不到資料。")));
    if (!/^00/.test(code)) peRiver(code, tok, put);
    finGlance(code, put); instGlance(code, put);
  }
  /* 三大法人買賣超 (last 10 trading days): FinMind, as the other cards on this page */
  const FMC = new Map();
  const fmGet = (ds, code, days) => {
    const k = ds + ":" + code; if (!FMC.has(k)) { const from = new Date(Date.now() + 8 * 3600e3 - days * 864e5).toISOString().slice(0, 10); FMC.set(k, J(`https://api.finmindtrade.com/api/v4/data?dataset=${ds}&data_id=${encodeURIComponent(code)}&start_date=${from}`).catch(e => { FMC.delete(k); throw e; })); }
    return FMC.get(k);
  };
  async function instGlance(code, put) {
    const miss = m => `<p class="sub">${m}</p>`;
    try {
      const a = ((await fmGet("TaiwanStockInstitutionalInvestorsBuySell", code, 24)).data || []), by = new Map();
      a.forEach(r => { const o = by.get(r.date) || { f: 0, t: 0, d: 0 }, v = (Number(r.buy) || 0) - (Number(r.sell) || 0), n = String(r.name);
        if (/^Foreign/.test(n)) o.f += v; else if (n === "Investment_Trust") o.t += v; else if (/^Dealer/.test(n)) o.d += v; by.set(r.date, o); });
      const days = [...by.keys()].sort().slice(-10).map(d => { const o = by.get(d), L = x => Math.round(x / 1000); return { d, f: L(o.f), t: L(o.t), dl: L(o.d), a: L(o.f + o.t + o.d) }; });
      if (days.length < 2) { put("sinst", miss("沒有資料。")); return; }
      const mx = Math.max(1, ...days.map(x => Math.abs(x.a))), c = v => (v > 0 ? "up" : v < 0 ? "down" : ""), n = v => (v > 0 ? "+" : "") + v.toLocaleString("zh-TW");
      const sum = k => days.reduce((t, x) => t + x[k], 0);
      put("sinst", `<div class="mgtbl itbl"><div class="mgh"><span>日期</span><span>外資</span><span>投信</span><span>自營商</span><span>合計</span><span></span></div>${days.slice().reverse().map(x => `<div><span>${esc(x.d.slice(5).replace("-", "/"))}</span><span class="${c(x.f)}">${n(x.f)}</span><span class="${c(x.t)}">${n(x.t)}</span><span class="${c(x.dl)}">${n(x.dl)}</span><b class="${c(x.a)}">${n(x.a)}</b><span class="ibar"><i class="${c(x.a)}" style="width:${Math.max(3, Math.abs(x.a) / mx * 100).toFixed(0)}%"></i></span></div>`).join("")}<div class="isum"><span>${days.length} 日合計</span><span class="${c(sum("f"))}">${n(sum("f"))}</span><span class="${c(sum("t"))}">${n(sum("t"))}</span><span class="${c(sum("dl"))}">${n(sum("dl"))}</span><b class="${c(sum("a"))}">${n(sum("a"))}</b><span></span></div></div>`, "單位：張");
      setTimeout(() => { rise($$(".sinst .mgtbl > div:not(.mgh)"), 30); $$(".sinst .ibar i").forEach(b => b.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 650, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" })); }, 30);
    } catch (e) { put("sinst", miss("讀不到資料。")); }
  }
  /* 財報速覽: the last 8 quarters of EPS, gross margin and operating margin (FinMind's quarterly statements; ETFs have none) */
  const FING = new Map();
  async function finGlance(code, put) {
    const miss = m => `<p class="sub">${m}</p>`;
    if (/^00/.test(code)) { put("sfin", miss("沒有資料。")); return; }
    try {
      if (!FING.has(code)) {
        const from = new Date(Date.now() + 8 * 3600e3 - 800 * 864e5).toISOString().slice(0, 10);
        FING.set(code, J(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockFinancialStatements&data_id=${encodeURIComponent(code)}&start_date=${from}`).catch(e => { FING.delete(code); throw e; }));
      }
      const a = ((await FING.get(code)).data || []), by = {};
      a.forEach(r => { (by[r.date] = by[r.date] || {})[r.type] = Number(r.value); });
      const qs = Object.keys(by).sort().slice(-8).map(d => { const o = by[d], rev = o.Revenue; return { d, eps: o.EPS, gm: rev > 0 && Number.isFinite(o.GrossProfit) ? o.GrossProfit / rev * 100 : null, om: rev > 0 && Number.isFinite(o.OperatingIncome) ? o.OperatingIncome / rev * 100 : null }; }).filter(q => Number.isFinite(q.eps));
      if (qs.length < 2) { put("sfin", miss("沒有資料。")); return; }
      const qn = d => { const m = +d.slice(5, 7); return d.slice(2, 4) + "Q" + Math.ceil(m / 3); };
      const W = 250, H = 156, L = 14, R = 14, T = 26, B = 24, n = qs.length, step = (W - L - R) / n, cx = i => L + step * (i + .5);
      const panel = (title, vals, kind, unit) => {
        const ok2 = vals.filter(v => v != null), lo = Math.min(...ok2), hi = Math.max(...ok2);
        const base = kind === "col" ? Math.min(0, lo) : lo - (hi - lo || 1) * .35, top = kind === "col" ? Math.max(0, hi) : hi + (hi - lo || 1) * .2, span = top - base || 1;
        const y = v => T + (H - T - B) * (1 - (v - base) / span), y0 = y(kind === "col" ? 0 : base);
        const lab = (v, i, x, yy, cls) => `<text class="fin-v ${cls || ""}" x="${x.toFixed(1)}" y="${(yy - 6).toFixed(1)}" text-anchor="middle">${v.toFixed(unit ? 1 : 2)}${unit}</text>`;
        let g = "";
        if (kind === "col") {
          g += `<line class="fin-ax" x1="${L}" x2="${W - R}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}"/>`;
          g += vals.map((v, i) => { if (v == null) return ""; const yy = y(v), up = v >= 0, h = Math.max(2, Math.abs(yy - y0)), x = cx(i) - step * .3; return `<g class="fin-b"><rect class="${up ? "fin-up" : "fin-dn"}" x="${x.toFixed(1)}" y="${(up ? y0 - h : y0).toFixed(1)}" width="${(step * .6).toFixed(1)}" height="${h.toFixed(1)}" rx="3" style="transform-origin:${cx(i).toFixed(1)}px ${y0.toFixed(1)}px"><title>${qn(qs[i].d)}：${v.toFixed(2)} 元</title></rect>${n <= 6 || i % 2 === (n - 1) % 2 ? lab(v, i, cx(i), up ? y0 - h : y0 + h + 14, up ? "" : "dn") : ""}</g>`; }).join("");
        } else {
          const pts = vals.map((v, i) => v == null ? null : [cx(i), y(v)]).filter(Boolean);
          g += `<line class="fin-ax" x1="${L}" x2="${W - R}" y1="${(H - B).toFixed(1)}" y2="${(H - B).toFixed(1)}"/>`;
          g += `<path class="fin-area" d="M${pts[0][0].toFixed(1)},${(H - B).toFixed(1)} ${pts.map(q => "L" + q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" ")} L${pts[pts.length - 1][0].toFixed(1)},${(H - B).toFixed(1)}Z"/>`;
          g += `<polyline class="fin-line" fill="none" points="${pts.map(q => q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" ")}"/>`;
          /* value labels: latest, highest, first and lowest, in that order; one that would sit on top of another is left out */
          const named = [];
          [n - 1, vals.indexOf(hi), 0, vals.indexOf(lo)].forEach(i => { if (i >= 0 && vals[i] != null && !named.includes(i) && named.every(j => Math.abs(cx(i) - cx(j)) >= 36 || Math.abs(y(vals[i]) - y(vals[j])) >= 13)) named.push(i); });
          g += vals.map((v, i) => v == null ? "" : `<g class="fin-b"><circle class="fin-dot${i === n - 1 ? " last" : ""}" cx="${cx(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === n - 1 ? 4 : 2.8}"><title>${qn(qs[i].d)}：${v.toFixed(1)}%</title></circle>${named.includes(i) ? lab(v, i, cx(i), y(v)) : ""}</g>`).join("");
        }
        const xl = qs.map((q, i) => (n <= 6 || i % 2 === (n - 1) % 2) ? `<text class="fin-q" x="${cx(i).toFixed(1)}" y="${H - 7}" text-anchor="middle">${qn(q.d)}</text>` : "").join("");
        return `<div class="finp"><h4>${title}</h4><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">${g}${xl}</svg></div>`;
      };
      put("sfin", `<div class="fqgrid">${panel("EPS（元）", qs.map(q => q.eps), "col", "")}${panel("毛利率", qs.map(q => q.gm), "line", "%")}${panel("營業利益率", qs.map(q => q.om), "line", "%")}</div>`, "近 " + qs.length + " 季");
      setTimeout(() => {
        $$(".fqgrid .fin-line:not([data-a])").forEach(l => { l.dataset.a = "1"; l.setAttribute("pathLength", "1"); l.style.strokeDasharray = "1"; l.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 900, easing: "cubic-bezier(.215,.61,.355,1)", fill: "backwards" }); });
        $$(".fqgrid .fin-area:not([data-a])").forEach(a => { a.dataset.a = "1"; a.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 250, fill: "backwards" }); });
        $$(".fqgrid .fin-b").forEach((b, i) => { if (b.dataset.a) return; b.dataset.a = "1"; b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 80 * (i % 8) + 200, fill: "backwards" }); });
        $$(".fqgrid rect.fin-up:not([data-a]), .fqgrid rect.fin-dn:not([data-a])").forEach((r, i) => { r.dataset.a = "1"; r.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 650, delay: 70 * (i % 8), easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }); });
      }, 30);
    } catch (e) { put("sfin", miss("讀不到資料。")); }
  }
  async function peRiver(code, tok, put) {
    const miss = m => `<p class="sub">${m}</p>`;
    try {
      const j = await xtGet("pe", code, "&m=12"), pes = (j.rows || []).filter(r => r[1] > 0);
      if (pes.length < 30) { put("spe", miss("沒有資料。")); return; }
      const px = new Map(); let ms = monthsBack(12);
      for (let i = 0; i < ms.length; i++) {
        if (tok !== chartTok) return;
        const key = `twh:${code}:${ms[i]}`, cached = i > 0 && store.get(key, null);
        let rows = []; try { rows = await histMonth(code, ms[i], i > 0); } catch (e) {}
        rows.forEach(r => px.set(String(r[0]).replace(/\D/g, ""), r[4]));
        if (!cached && i < ms.length - 1) await wait(500);
      }
      const pts = pes.map(r => ({ d: r[0].replace(/-/g, ""), pe: r[1], p: px.get(r[0].replace(/-/g, "")) })).filter(x => x.p > 0).map(x => ({ ...x, eps: x.p / x.pe }));
      if (pts.length < 30) { put("spe", miss("沒有資料。")); return; }
      const sorted = pts.map(x => x.pe).sort((a, b) => a - b), q = f => sorted[Math.min(sorted.length - 1, Math.floor(f * (sorted.length - 1)))];
      const lv = [[.1, "低"], [.3, ""], [.5, "中"], [.7, ""], [.9, "高"]].map(([f, n]) => ({ f, n, m: q(f) }));
      const all = pts.flatMap(x => [x.p, ...lv.map(l => l.m * x.eps)]), lo = Math.min(...all) * .97, hi = Math.max(...all) * 1.03, W = 640, H = 230, X = i => 8 + i / (pts.length - 1) * (W - 16), Y = v => 8 + (hi - v) / (hi - lo) * (H - 24);
      const cur = pts[pts.length - 1], rank = Math.round(sorted.filter(v => v <= cur.pe).length / sorted.length * 100);
      const cols = ["#4aa3a0", "#79b58a", "#c9a64a", "#d58b4f", "#cc5b52"];
      put("spe", `<svg class="river" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="本益比河流圖">${lv.map((l, k) => `<polyline fill="none" stroke="${cols[k]}" stroke-width="1.4" opacity=".85" points="${pts.map((x, i) => `${X(i).toFixed(1)},${Y(l.m * x.eps).toFixed(1)}`).join(" ")}"/>`).join("")}<polyline class="rvline" fill="none" stroke-width="2.2" points="${pts.map((x, i) => `${X(i).toFixed(1)},${Y(x.p).toFixed(1)}`).join(" ")}"/></svg>
        <div class="rvleg">${lv.map((l, k) => `<span><i style="background:${cols[k]}"></i>${l.m.toFixed(1)} 倍${l.n ? "（" + l.n + "）" : ""}</span>`).join("")}<span><i class="rvk"></i>股價</span></div>
        <p class="sub">目前本益比 ${cur.pe.toFixed(1)} 倍，在近 12 個月的區間裡高過約 ${rank}% 的日子。每條線是「近 12 個月這個本益比 × 當時每股盈餘」，只是歷史參考，不代表會漲或跌。</p>`, `${pts.length} 個交易日`);
    } catch (e) { put("spe", miss("讀不到資料。")); }
  }

  /* ---------------- 提問 (one question about the stock that is open) ---------------- */
  const ASK = { code: "" };
  async function askRun(q) {
    const box = $("#dpStock"), out = $(".askout", box), inp = $(".askin", box), go = $(".askform .aigo", box), code = CODE, s = DB.by.get(code), cs = barsOf(code);
    q = String(q || "").trim(); if (q.length < 2) return;
    if (!s || !cs || cs.length < 30) { out.insertAdjacentHTML("afterbegin", `<p class="runmsg sub warn">這檔的歷史資料還不夠，無法回答。</p>`); return; }
    if (!DB.live) { out.insertAdjacentHTML("afterbegin", `<p class="runmsg sub warn">讀不到資料。</p>`); return; }
    if (ASK.code !== code) { out.innerHTML = ""; ASK.code = code; }
    $$(".runmsg", out).forEach(x => x.remove());
    const item = document.createElement("div"); item.className = "askitem";
    item.innerHTML = `<div class="askq">${esc(q)}</div><div class="aska"><div class="aiwait"><i></i><i></i><i></i></div></div>`;
    out.insertBefore(item, out.firstChild); inp.value = ""; go.disabled = true;
    try {
      await Promise.all([loadFund(), loadChip()]);
      const r = await fetch(WORKER + "/tw/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ d: DEVICE, code, name: s.name, q, facts: facts(cs) }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.a) throw new Error(aiLimitMsg(j) || (j && j.error && /[一-鿿]/.test(j.error.message || "") ? j.error.message : "暫時沒有回應，過幾分鐘再試"));
      $(".aska", item).innerHTML = `<p>${esc(j.a)}</p>${j.news && j.news.length ? `<details class="pmmore"><summary>參考的新聞</summary><div class="newslist">${newsHTML(j.news, null)}</div></details>` : ""}`;
    } catch (e) {
      $(".aska", item).innerHTML = `<p class="sub warn">${/[一-鿿]/.test(e.message || "") ? esc(e.message) : "連不到分析服務，請稍後再試。"}</p>`;
    }
    go.disabled = false;
  }

  /* ---------------- 自選股 ---------------- */
  function buildWatch() {
    $("#dpWatch").innerHTML = `<div class="dcard wsum" hidden></div><div class="dcard mkt wlist"><div class="mwrap"><table class="mtbl ttbl mktab wtbl"><thead><tr><th class="l">商品</th><th>成交價</th><th>漲跌</th><th>漲跌幅</th><th>開盤</th><th>最高</th><th>最低</th><th class="wrngh">日內區間</th><th>成交量</th></tr></thead><tbody class="wgrid"></tbody></table></div></div>`;
    $("#dpWatch").addEventListener("click", e => {
      const c = e.target.closest("tr[data-code], .wpick[data-code]"); if (c) openStock(c.dataset.code, c);
    });
  }
  function paintWatch(animate) {
    const g = $("#dpWatch .wgrid"); if (!g) return;
    const cards = WATCH.map(code => {
      const s = DB.by.get(code);
      const star = "";
      if (!s) return `<tr class="wrow"><td class="l nm"><b>${esc(code)}</b><span>${DB.list.length ? "不在清單中" : "載入中…"}</span></td><td colspan="8"></td></tr>`;
      const d = dig(s.price), t = tone(s.chg), pos = s.high > s.low ? clamp((s.price - s.low) / (s.high - s.low) * 100, 0, 100) : 50;
      return `<tr class="wrow" data-code="${esc(code)}" tabindex="0"><td class="l nm"><b>${esc(s.name)}</b><span>${esc(code)}</span></td>
        <td><span class="pxpill ${t}${s.pct >= 9.4 || s.pct <= -9.4 ? " lim" : ""}">${fmt(s.price, d)}</span></td><td class="${t}">${arrow(s.chg)}${fmt(Math.abs(s.chg), d)}</td><td class="${t} pctc" style="--w:${ok(s.pct) ? Math.min(Math.abs(s.pct) / 10, 1).toFixed(3) : 0}">${pct(s.pct)}</td>
        <td>${fmt(s.open, d)}</td><td>${fmt(s.high, d)}</td><td>${fmt(s.low, d)}</td>
        <td class="wrng"><div class="rngbar"><i class="rngdot" style="left:${pos.toFixed(1)}%"></i></div></td><td class="vol">${fmt(s.vol)}</td>${star}</tr>`;
    });
    g.innerHTML = cards.join("") || `<tr><td class="mempty" colspan="9">還沒有自選股。</td></tr>`;
    paintWatchSum();
    if (animate && $("#dpWatch").classList.contains("on")) rise($$("tr", g).slice(0, 30), 25);
  }
  /* the watchlist in one line: the average move, how many rose and fell, who leads and who lags */
  function paintWatchSum() {
    const el = $("#dpWatch .wsum"); if (!el) return;
    const got = WATCH.map(c => DB.by.get(c)).filter(s => s && ok(s.pct));
    el.hidden = got.length < 2;
    if (got.length < 2) return;
    const up = got.filter(s => s.chg > 0).length, dn = got.filter(s => s.chg < 0).length, avg = got.reduce((a, s) => a + s.pct, 0) / got.length;
    const best = got.reduce((a, s) => (s.pct > a.pct ? s : a)), worst = got.reduce((a, s) => (s.pct < a.pct ? s : a));
    const pick = (k, s) => `<button type="button" class="wpick" data-code="${esc(s.code)}"><span>${k}</span><b>${esc(s.name)}</b><em class="${tone(s.pct)}">${pct(s.pct)}</em></button>`;
    el.dataset.tone = tone(avg);
    el.innerHTML = `<div class="wavg"><span>自選 ${got.length} 檔平均</span><b class="${tone(avg)}">${pct(avg)}</b></div>
      <div class="wmid"><div class="wcount"><em class="up">${up} 漲</em><em class="down">${dn} 跌</em><em>${got.length - up - dn} 平</em></div>${breadthBar(up, got.length - up - dn, dn)}</div>
      <div class="wlead">${pick("領漲", best)}${best !== worst ? pick("落後", worst) : ""}</div>`;
  }
  const breadthBar = (up, flat, down) => `<div class="breadth" role="img" aria-label="上漲 ${up}、平盤 ${flat}、下跌 ${down}"><i class="up" style="flex-grow:${up}"></i><i class="flat" style="flex-grow:${flat}"></i><i class="down" style="flex-grow:${down}"></i></div>`;
  function saveLists() { store.set("twtrade-watch", WATCH); store.set("twtrade-wl", LISTS); }
  function toggleWatch(code, i) {
    i = i || 0;
    const L = LISTS[i];
    LISTS[i] = L.includes(code) ? L.filter(c => c !== code) : L.concat(code);
    WATCH = LISTS[0];
    saveLists();
    if (i === 0) { alertSync(); paintTape(); }
    paintWatch(false);
    if (VIEW.q || /^w[1-5]$/.test(VIEW.preset)) paintTable(false);
  }

  /* ---------------- indicators ---------------- */
  const sma = (a, n) => a.map((_, i) => (i < n - 1 ? null : a.slice(i - n + 1, i + 1).reduce((x, y) => x + y, 0) / n));
  const ema = (a, n) => { const k = 2 / (n + 1), o = []; a.forEach((v, i) => o.push(i ? o[i - 1] + k * (v - o[i - 1]) : v)); return o; };
  function calc(cs) {
    const cl = cs.map(c => c[4]), n = cs.length;
    const ma5 = sma(cl, 5), ma20 = sma(cl, 20), ma60 = sma(cl, 60);
    const sd = cl.map((_, i) => { if (i < 19) return null; const w = cl.slice(i - 19, i + 1), m = ma20[i]; return Math.sqrt(w.reduce((a, x) => a + (x - m) ** 2, 0) / 20); });
    const bu = ma20.map((m, i) => (m == null ? null : m + 2 * sd[i])), bl = ma20.map((m, i) => (m == null ? null : m - 2 * sd[i]));
    let k = 50, d = 50; const K = [], D = [];
    cs.forEach((c, i) => { const w = cs.slice(Math.max(0, i - 8), i + 1), h9 = Math.max(...w.map(x => x[2])), l9 = Math.min(...w.map(x => x[3])); const rsv = h9 === l9 ? 50 : (c[4] - l9) / (h9 - l9) * 100; k = k * 2 / 3 + rsv / 3; d = d * 2 / 3 + k / 3; K.push(k); D.push(d); });
    const e12 = ema(cl, 12), e26 = ema(cl, 26), dif = e12.map((v, i) => v - e26[i]), dea = ema(dif, 9), hist = dif.map((v, i) => v - dea[i]);
    const rsi = []; let ag = 0, al = 0;
    cl.forEach((v, i) => {
      if (!i) { rsi.push(null); return; }
      const ch = v - cl[i - 1], g = Math.max(ch, 0), l = Math.max(-ch, 0);
      if (i <= 14) { ag += g / 14; al += l / 14; rsi.push(i === 14 ? 100 - 100 / (1 + (al ? ag / al : 99)) : null); }
      else { ag = (ag * 13 + g) / 14; al = (al * 13 + l) / 14; rsi.push(100 - 100 / (1 + (al ? ag / al : 99))); }
    });
    return { cl, n, ma5, ma20, ma60, bu, bl, K, D, dif, dea, hist, rsi, vol: cs.map(c => c[5]), vma20: sma(cs.map(c => c[5]), 20) };
  }

  /* ---------------- the chart: price, volume and the chosen indicators in one drawing with a shared time axis ---------------- */
  /* the drawing is as wide, in its own units, as the box it goes into (280–720), so its text is not shrunk on a phone */
  const chartW = host => clamp(Math.round((host && host.clientWidth) || 720), 280, 720);
  function chartSVG(all, span, end, W = 720) {
    const N0 = Math.min(span, all.length), off = clamp(all.length - N0 - (end || 0), 0, Math.max(0, all.length - N0));
    const I = calc(all), cs = all.slice(off, off + N0), N = cs.length;
    const PL = 8, PR = 60, gap = 14;
    const panes = [{ k: "price", h: 250 }];
    if (IND.vol) panes.push({ k: "vol", h: 64 });
    if (IND.kd) panes.push({ k: "kd", h: 84 });
    if (IND.macd) panes.push({ k: "macd", h: 84 });
    if (IND.rsi) panes.push({ k: "rsi", h: 84 });
    let y0 = 8; panes.forEach(p => { p.y = y0; y0 += p.h + gap; });
    const H = y0 + 8;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "K 線與技術指標");
    svg.setAttribute("class", "kchart");
    const add = (tag, attrs, cls, parent) => { const e = document.createElementNS(NS, tag); for (const a in attrs) e.setAttribute(a, attrs[a]); if (cls) e.setAttribute("class", cls); (parent || svg).appendChild(e); return e; };
    const X = i => PL + (W - PL - PR) * (i + 0.5) / N, bw = Math.max(2, (W - PL - PR) / N * 0.62);
    const sl = a => a.slice(off, off + N);
    const line = (arr, Y, cls) => add("path", { d: arr.map((v, i) => (v == null ? "" : (i && arr[i - 1] != null ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1))).join("") }, cls);
    const label = (p, t) => { add("text", { x: PL + 2, y: p.y + 11 }, "plabel").textContent = t; };
    panes.forEach(p => {
      const top = p.y, bot = p.y + p.h;
      if (p.k === "price") {
        const extra = IND.boll ? [...sl(I.bu), ...sl(I.bl)].filter(v => v != null) : [];
        const hi = Math.max(...cs.map(c => c[2]), ...extra), lo = Math.min(...cs.map(c => c[3]), ...extra), pad = (hi - lo) * 0.06 || 1;
        const a = hi + pad, b = lo - pad, Y = v => top + p.h * (a - v) / (a - b);
        for (let g = 0; g <= 4; g++) { const y = top + p.h * g / 4, v = a - (a - b) * g / 4; add("line", { x1: PL, x2: W - PR, y1: y, y2: y }, "gridl"); add("text", { x: W - PR + 6, y: y + 4 }).textContent = fmt(v, dig(v)); }
        cs.forEach((c, i) => {
          const cls = c[4] >= c[1] ? "tk-up" : "tk-down", x = X(i);
          add("line", { x1: x, x2: x, y1: Y(c[2]), y2: Y(c[3]) }, "wick " + cls);
          add("rect", { x: x - bw / 2, y: Y(Math.max(c[1], c[4])), width: bw, height: Math.max(1, Math.abs(Y(c[1]) - Y(c[4]))) }, cls);
        });
        if (IND.boll) { line(sl(I.bu), Y, "bb"); line(sl(I.bl), Y, "bb"); }
        if (IND.ma) { line(sl(I.ma5), Y, "ma5"); line(sl(I.ma20), Y, "ma20"); line(sl(I.ma60), Y, "ma60"); }
        p.Y = Y; p.a = a; p.b = b;
      } else if (p.k === "vol") {
        const max = Math.max(...cs.map(c => c[5])) || 1, Y = v => bot - (p.h - 12) * v / max;
        cs.forEach((c, i) => add("rect", { x: X(i) - bw / 2, y: Y(c[5]), width: bw, height: Math.max(1, bot - Y(c[5])) }, (c[4] >= c[1] ? "tk-up" : "tk-down") + " volbar"));
        line(sl(I.vma20), Y, "ma20");
        add("text", { x: W - PR + 6, y: top + 10 }).textContent = fmt(max); label(p, "成交量（張）");
      } else {
        let series, lo, hi, bars = null, guides = [];
        if (p.k === "kd") { series = [[sl(I.K), "ik"], [sl(I.D), "id"]]; lo = 0; hi = 100; guides = [20, 80]; label(p, "KD(9)"); }
        else if (p.k === "rsi") { series = [[sl(I.rsi), "ik"]]; lo = 0; hi = 100; guides = [30, 70]; label(p, "RSI(14)"); }
        else { bars = sl(I.hist); series = [[sl(I.dif), "ik"], [sl(I.dea), "id"]]; const v = [...sl(I.dif), ...sl(I.dea), ...bars]; lo = Math.min(...v); hi = Math.max(...v); guides = [0]; label(p, "MACD(12,26,9)"); }
        const span2 = hi - lo || 1, Y = v => top + 4 + (p.h - 8) * (hi - v) / span2;
        guides.forEach(v => { add("line", { x1: PL, x2: W - PR, y1: Y(v), y2: Y(v) }, "gridl"); add("text", { x: W - PR + 6, y: Y(v) + 4 }).textContent = String(v); });
        if (bars) bars.forEach((v, i) => add("rect", { x: X(i) - bw / 2, y: Math.min(Y(v), Y(0)), width: bw, height: Math.max(1, Math.abs(Y(v) - Y(0))) }, (v >= 0 ? "tk-up" : "tk-down") + " volbar"));
        series.forEach(([a, c]) => line(a, Y, c));
      }
    });
    [0, Math.floor((N - 1) / 2), N - 1].forEach((i, k) => add("text", { x: X(i), y: H - 1, "text-anchor": k === 0 ? "start" : k === 2 ? "end" : "middle" }, "xlabel").textContent = shortDay(cs[i][0]));
    const clip = add("clipPath", { id: "kclip" }); add("rect", { x: PL, y: panes[0].y, width: W - PL - PR, height: panes[0].h }, "", clip);
    const tg = add("g", { "clip-path": "url(#kclip)" }, "tlines");
    const band = add("rect", { x: 0, y: 8, width: 6, height: H - 22, rx: 3 }, "kband"); band.style.opacity = 0;
    const cross = add("line", { x1: 0, x2: 0, y1: 8, y2: H - 14 }, "cross"); cross.style.opacity = 0;
    const PP = panes[0], hline = add("line", { x1: PL, x2: W - PR, y1: 0, y2: 0 }, "cross hl"), dot = add("circle", { r: 3.5, cx: 0, cy: 0 }, "kdot");
    const ytag = add("g", {}, "ytag"), ytr = add("rect", { x: W - PR + 1, y: -9, width: PR - 2, height: 18, rx: 4 }, "", ytag), ytt = add("text", { x: W - PR + 6, y: 4 }, "", ytag);
    const xtag = add("g", {}, "ytag xtag"), xtr = add("rect", { x: -42, y: H - 17, width: 84, height: 16, rx: 4 }, "", xtag), xtt = add("text", { x: 0, y: H - 5, "text-anchor": "middle" }, "", xtag);
    const ring = add("circle", { r: 8, cx: 0, cy: 0 }, "kring");
    [hline, dot, ytag].forEach(e => { e.style.opacity = 0; });
    const at = i => {
      const j = off + i, c = cs[i], d = dig(c[4]), v = x => (x == null ? "—" : fmt(x, d));
      return `${slash(c[0])}　開 ${fmt(c[1], d)}　高 ${fmt(c[2], d)}　低 ${fmt(c[3], d)}　收 ${fmt(c[4], d)}　量 ${fmt(c[5])} 張` +
        (IND.ma ? `　MA5 ${v(I.ma5[j])}　MA20 ${v(I.ma20[j])}　MA60 ${v(I.ma60[j])}` : "") +
        (IND.kd ? `　K ${fmt(I.K[j], 1)}　D ${fmt(I.D[j], 1)}` : "") + (IND.rsi && I.rsi[j] != null ? `　RSI ${fmt(I.rsi[j], 1)}` : "") +
        (IND.macd ? `　DIF ${fmt(I.dif[j], 2)}　MACD ${fmt(I.dea[j], 2)}` : "");
    };
    const hit = e => { const r = svg.getBoundingClientRect(); return clamp(Math.round(((e.clientX - r.left) / r.width * W - PL) / (W - PL - PR) * N - 0.5), 0, N - 1); };
    return { svg, N, off, cs, all, tg, plotFrac: (W - PL - PR) / W, read: at, hit,
      plot: { x0: PL, x1: W - PR, y0: PP.y, y1: PP.y + PP.h },
      xOf: ai => X(ai - off), yOf: v => PP.Y(v),
      /* the pointer in chart terms: which bar (fractional, counted over the whole history) and which price */
      at(e) {
        const r = svg.getBoundingClientRect(), sx = (e.clientX - r.left) / r.width * W, sy = (e.clientY - r.top) / r.height * H;
        return { ai: off + ((sx - PL) / (W - PL - PR) * N - 0.5), price: PP.a - (PP.a - PP.b) * (sy - PP.y) / PP.h, inPrice: sy >= PP.y && sy <= PP.y + PP.h };
      },
      mark(i, e) {
        const bw = Math.max(3, (W - PL - PR) / N * 0.9);
        band.setAttribute("x", (X(i) - bw / 2).toFixed(1)); band.setAttribute("width", bw.toFixed(1)); band.style.opacity = 1;
        { const tx = clamp(X(i), PL + 42, W - PR - 42); xtag.setAttribute("transform", `translate(${tx.toFixed(1)} 0)`); xtt.textContent = slash(cs[i][0]); xtag.style.opacity = 1; }
        cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.style.opacity = 1;
        dot.setAttribute("cx", X(i)); dot.setAttribute("cy", PP.Y(cs[i][4])); dot.setAttribute("class", "kdot " + (cs[i][4] >= cs[i][1] ? "up" : "down")); dot.style.opacity = 1;
        ring.setAttribute("cx", X(i)); ring.setAttribute("cy", PP.Y(cs[i][4])); ring.setAttribute("class", "kring " + (cs[i][4] >= cs[i][1] ? "up" : "down")); ring.style.opacity = 1;
        const r = svg.getBoundingClientRect(), sy = e && r.height ? (e.clientY - r.top) / r.height * H : -1;
        if (sy >= PP.y && sy <= PP.y + PP.h) {
          /* magnet: near the bar's close, the line and its tag snap onto the close */
          const cy = PP.Y(cs[i][4]), snap = Math.abs(sy - cy) < 9, ly = snap ? cy : sy, v = snap ? cs[i][4] : PP.a - (PP.a - PP.b) * (sy - PP.y) / PP.h;
          hline.setAttribute("y1", ly); hline.setAttribute("y2", ly); hline.style.opacity = 1; hline.classList.toggle("snap", snap);
          ytag.setAttribute("transform", `translate(0 ${ly.toFixed(1)})`); ytt.textContent = fmt(v, dig(v)); ytag.style.opacity = 1;
        } else { hline.style.opacity = 0; ytag.style.opacity = 0; }
      },
      unmark() { [band, cross, hline, dot, ytag, xtag, ring].forEach(x => { x.style.opacity = 0; }); } };
  }

  /* the floating reading next to the pointer: date, OHLC, change against the day before, volume */
  const ktip = document.createElement("div"); ktip.className = "ktip"; ktip.hidden = true;
  function showTip(c, i, e, host) {
    const b = c.cs[i], prev = i > 0 ? c.cs[i - 1][4] : (c.off > 0 ? null : null), d = dig(b[4]);
    const ch = prev ? (b[4] / prev - 1) * 100 : NaN, t = tone(b[4] - (prev || b[1]));
    ktip.innerHTML = `<b>${slash(b[0])}</b><div><span>開</span><em>${fmt(b[1], d)}</em><span>高</span><em>${fmt(b[2], d)}</em><span>低</span><em>${fmt(b[3], d)}</em><span>收</span><em class="${t}">${fmt(b[4], d)}</em></div><p><i class="${tone(ch)}">${ok(ch) ? pct(ch) : ""}</i>　量 ${fmt(b[5])} 張</p>`;
    ktip.hidden = false;
    const r = host.getBoundingClientRect(), x = e.clientX - r.left + host.scrollLeft, y = e.clientY - r.top, w = ktip.offsetWidth || 180;
    ktip.style.transform = `translate(${Math.round(Math.max(host.scrollLeft + 4, x + 16 + w > r.width + host.scrollLeft ? x - w - 16 : x + 16))}px, ${Math.round(clamp(y - 30, 4, r.height - 90))}px)`;
  }
  function chartInput(cb, box) {
    const read = () => $(".cread", box);
    const idle = () => { const c = KV.c; if (!c) return; read().textContent = c.read(c.N - 1); c.unmark(); ktip.hidden = true; };
    const hover = e => { const c = KV.c; if (!c) return; const i = c.hit(e); c.mark(i, e); read().textContent = c.read(i); showTip(c, i, e, cb); };
    cb.addEventListener("pointerdown", e => {
      if (!KV.c || e.button > 0) return;
      if (KV.draw) {
        const a = KV.c.at(e); if (!a.inPrice) return;
        e.preventDefault(); try { cb.setPointerCapture(e.pointerId); } catch (er) {}
        KV.pen = { a, x: e.clientX, y: e.clientY, g: null }; return;
      }
      KV.drag = { x: e.clientX, end: KV.end, moved: false, id: e.pointerId }; hover(e);
    });
    cb.addEventListener("pointermove", e => {
      const c = KV.c, d = KV.drag; if (!c) return;
      if (KV.pen) {
        const p = KV.pen, b = c.at(e);
        if (p.g) p.g.remove();
        p.g = lineEls(c, c.xOf(p.a.ai), c.yOf(p.a.price), c.xOf(b.ai), c.yOf(b.price), "pen");
        hover(e); return;
      }
      if (d) {
        if (!d.moved && Math.abs(e.clientX - d.x) > 5) { d.moved = true; cb.classList.add("panning"); try { cb.setPointerCapture(d.id); } catch (er) {} }
        if (d.moved) {
          const per = c.svg.getBoundingClientRect().width * c.plotFrac / c.N, ne = clamp(d.end + Math.round((e.clientX - d.x) / per), 0, Math.max(0, KV.len - KV.span));
          if (ne !== KV.end) { KV.end = ne; drawChart(false, true); }
        }
      }
      hover(e);
    });
    const up = e => {
      if (KV.pen) {
        const p = KV.pen, c = KV.c; KV.pen = null;
        if (p.g) p.g.remove();
        if (c && e && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) {
          const b = c.at(e), i1 = clamp(Math.round(p.a.ai), 0, c.all.length - 1), i2 = clamp(Math.round(b.ai), 0, c.all.length - 1);
          if (i1 !== i2) {
            const [x, y] = i1 < i2 ? [[i1, p.a.price], [i2, b.price]] : [[i2, b.price], [i1, p.a.price]], r2 = v => Math.round(v * 100) / 100;
            store.set(linesKey(), [...(store.get(linesKey(), []) || []), { d1: c.all[x[0]][0], p1: r2(x[1]), d2: c.all[y[0]][0], p2: r2(y[1]) }].slice(-12));
          }
        }
        drawChart(false); return;
      }
      if (KV.drag && KV.drag.moved) { cb.classList.remove("panning"); drawChart(false); } KV.drag = null;
    };
    cb.addEventListener("pointerup", up); cb.addEventListener("pointercancel", up);
    cb.addEventListener("pointerleave", () => { if (!KV.drag) idle(); });
    cb.addEventListener("wheel", e => {
      const c = KV.c; if (!c || !e.deltaY || KV.len < 21) return;
      e.preventDefault();
      const ns = clamp(Math.round(KV.span * (e.deltaY > 0 ? 1.18 : 1 / 1.18)), 20, KV.len); if (ns === KV.span) return;
      const i = c.hit(e), ai = c.off + i, frac = (i + 0.5) / c.N, nOff = Math.round(ai + 0.5 - frac * ns);   /* the day under the pointer stays under it */
      KV.span = ns; KV.end = clamp(KV.len - ns - nOff, 0, KV.len - ns);
      drawChart(false, true); hover(e);
      clearTimeout(cb._wt); cb._wt = setTimeout(() => drawChart(false), 250);
    }, { passive: false });
    cb.addEventListener("dblclick", () => { KV.span = SPAN; KV.end = 0; drawChart(true); });
  }

  /* ---------------- 個股分析 ---------------- */
  const INDS = [["ma", "均線"], ["boll", "布林通道"], ["vol", "成交量"], ["kd", "KD"], ["macd", "MACD"], ["rsi", "RSI"]];
  function buildStock() {
    $("#dpStock").innerHTML = `
      <div class="dcard sbar"><div class="sfind"><button type="button" class="sback" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg><span></span></button><input class="ssearch" type="search" placeholder="輸入代號或名稱換一檔" aria-label="搜尋股票" autocomplete="off"><div class="ssug" hidden></div></div></div>
      <div class="dcard shead"><i class="sglow" aria-hidden="true"></i>
        <div class="stitle"><h2></h2></div>
        <p class="sflagline" hidden></p>
        <div class="spx"><span class="big">—</span><span class="schg"></span><span class="sub stime"></span></div>
        <div class="sohlc"></div>
        <div class="srange"></div>
      </div>
      <div class="scol">
      <div class="dcard schart">
        <div class="chips"><span class="clab">區間</span>${[[60, "60 日"], [120, "120 日"]].map(([n, t]) => `<button type="button" class="chip" data-span="${n}">${t}</button>`).join("")}
          <span class="clab">指標</span>${INDS.map(([k, t]) => `<button type="button" class="chip" data-ind="${k}">${t}</button>`).join("")}
          <span class="clab">畫線</span><button type="button" class="chip" data-draw aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19L20 5"/><circle cx="4" cy="19" r="2"/><circle cx="20" cy="5" r="2"/></svg>趨勢線</button><button type="button" class="chip" data-clrline hidden>清除</button></div>
        <div class="cbox"><p class="mempty">載入中…</p></div>
        <p class="sub cread"></p>
        <div class="cfoot"><p class="sub clegend">紅漲綠跌；均線：<i class="lg ma5"></i>MA5 <i class="lg ma20"></i>MA20 <i class="lg ma60"></i>MA60</p><p class="sub chint"><span class="czoom"></span>拖曳平移・滾輪縮放・雙擊還原</p></div>
      </div>
      <div class="dcard sai">
        <div class="aihead"><div><h3>分析團隊</h3></div>
          <button type="button" class="aigo">開始分析</button></div>
        <p class="sub aimsg"></p><div class="aiout"></div>
        
        <details class="slab"><summary>研究工具（自動送出）</summary><div id="dpLab" class="on"></div></details>
      </div>
      <div class="dcard sask">
        <div class="aihead"><div><h3>提問</h3></div></div>
        <div class="askchips">${["最近為什麼漲／跌？", "現在適合進場嗎？", "法人在買還是在賣？", "最大的風險是什麼？"].map(q => `<button type="button" class="chip" data-q="${q}">${q}</button>`).join("")}</div>
        <form class="askform"><input class="askin" type="text" maxlength="200" placeholder="問這檔股票任何問題" autocomplete="off" aria-label="提問"><button type="submit" class="aigo">問</button></form>
        <div class="askout"></div>
      </div>
      <div class="dcard sx smg"><div class="aihead"><div><h3>融資融券</h3></div><span class="sub sxn"></span></div><div class="sxout"><p class="sub">載入中…</p></div></div>
      <div class="dcard sx shd"><div class="aihead"><div><h3>股權分散</h3></div><span class="sub sxn"></span></div><div class="sxout"><p class="sub">載入中…</p></div></div>
      <div class="dcard sx spe"><div class="aihead"><div><h3>本益比河流圖</h3></div><span class="sub sxn"></span></div><div class="sxout"><p class="sub">載入中…</p></div></div>
      <div class="dcard sx sfin"><div class="aihead"><div><h3>財報速覽</h3></div><span class="sub sxn"></span></div><div class="sxout"><p class="sub">載入中…</p></div></div>
      <div class="dcard sx sinst"><div class="aihead"><div><h3>三大法人買賣超</h3></div><span class="sub sxn"></span></div><div class="sxout"><p class="sub">載入中…</p></div></div>
      </div>
      <div class="sgrid" tabindex="0" aria-label="個股資料">
        <div class="dcard ssnap"><h3>技術面快照</h3><div class="snaplist"><p class="sub">載入中…</p></div></div>
        <div class="dcard sfund"><h3>基本面與籌碼</h3><div class="fundlist"><p class="sub">載入中…</p></div></div>
        <div class="dcard snews"><h3>新聞與公告</h3><div class="newslist"><p class="sub">載入中…</p></div></div>
      </div>`;
    const box = $("#dpStock"), inp = $(".ssearch", box), sug = $(".ssug", box);
    chartInput($(".cbox", box), box);
    inp.addEventListener("input", () => {
      const q = inp.value.trim().toLowerCase();
      const hits = q ? DB.list.filter(s => s.code.toLowerCase().startsWith(q) || s.name.toLowerCase().includes(q)).slice(0, 8) : [];
      sug.hidden = !hits.length;
      sug.innerHTML = hits.map(s => `<button type="button" data-code="${esc(s.code)}"><b>${esc(s.name)}</b><span>${esc(s.code)}</span><em class="${tone(s.chg)}">${fmt(s.price, dig(s.price))}</em></button>`).join("");
    });
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { const b = $("button", sug); if (b) b.click(); } });
    $(".askform", box).addEventListener("submit", e => { e.preventDefault(); askRun($(".askin", box).value); });
    $(".askchips", box).addEventListener("click", e => { const c = e.target.closest("[data-q]"); if (c) askRun(c.dataset.q); });
    box.addEventListener("click", e => {
      if (e.target.closest("#dpLab")) return;                 /* the research tools handle their own clicks */
      const s = e.target.closest(".ssug button"); if (s) { inp.value = ""; sug.hidden = true; setStock(s.dataset.code, true); navPush(); return; }
      if (e.target.closest(".sback")) { goBack(); return; }
      const sp = e.target.closest("[data-span]"); if (sp) { SPAN = +sp.dataset.span; KV.span = SPAN; KV.end = 0; store.set("twmain-span", SPAN); KV.morph = true; drawChart(false); return; }
      if (e.target.closest("[data-draw]")) { KV.draw = !KV.draw; drawChart(false); return; }
      if (e.target.closest("[data-clrline]")) { store.set(linesKey(), []); drawChart(false); return; }
      const ind = e.target.closest("[data-ind]"); if (ind) { IND[ind.dataset.ind] = !IND[ind.dataset.ind]; store.set("twmain-ind", IND); drawChart(true); return; }
      if (e.target.closest(".aigo")) analyze();
    });
  }
  const HEADLAST = { code: "", px: NaN };
  function paintHead() {
    const box = $("#dpStock"), s = DB.by.get(CODE); if (!$(".shead", box)) return;
    $(".stitle h2", box).innerHTML = s ? `${esc(s.name)} <span>${esc(s.code)}</span>${flagTag(s.code)}` : esc(CODE);
    const fl = FLAGS.get(CODE), fe = $(".sflagline", box);
    fe.hidden = !fl; fe.className = "sflagline" + (fl ? " " + fl.k : "");
    fe.textContent = fl ? (fl.k === "punish" ? `處置股：${fl.info}。交易受限制，下單前先確認撮合方式與是否要預收款券。` : `注意股：${fl.info}。`) : "";
    if (!s) { $(".spx .big", box).textContent = "—"; $(".schg", box).textContent = DB.list.length ? "找不到這檔上市股票" : ""; $(".sohlc", box).innerHTML = ""; return; }
    if (s.rtWait) { $(".spx .big", box).textContent = "—"; $(".spx .big", box).className = "big"; $(".schg", box).textContent = "讀取即時報價…"; $(".schg", box).className = "schg"; $(".stime", box).textContent = ""; $(".sohlc", box).innerHTML = ""; return; }
    const d = dig(s.price), t = tone(s.chg), sh = $(".shead", box);
    sh.dataset.tone = t || "flat"; sh.dataset.lim = s.pct >= 9.4 ? "up" : s.pct <= -9.4 ? "down" : ""; sh.classList.toggle("live", !!s.rt);
    if (HEADLAST.code === CODE && ok(HEADLAST.px) && s.price !== HEADLAST.px) { const g = $(".sglow", sh); g.classList.remove("hit"); void g.offsetWidth; g.classList.add("hit"); }
    HEADLAST.code = CODE; HEADLAST.px = s.price;
    $(".spx .big", box).textContent = fmt(s.price, d); $(".spx .big", box).className = "big " + t;
    $(".schg", box).textContent = `${arrow(s.chg)} ${fmt(Math.abs(s.chg), d)}（${pct(s.pct)}）`; $(".schg", box).className = "schg " + t;
    $(".stime", box).textContent = s.rt ? `盤中 ${s.tm || ""}` : DB.live ? `收盤 ${slash(DB.date)}` : "讀不到資料";
    $(".sohlc", box).innerHTML = [["開", fmt(s.open, d)], ["高", fmt(s.high, d)], ["低", fmt(s.low, d)], ["昨收", fmt(s.prev, d)], ["量（張）", fmt(s.vol)]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
    /* the empty lower left: where the price sits in today's range, the 52-week range and the ±10% limit band */
    (() => {
      const rg = $(".srange", box), rec = HIST.get(CODE), yr = rec && rec.cs ? rec.cs.slice(-250) : [], P = s.price;
      const rows = [["今日", s.low, s.high], ["52 週", yr.length > 20 ? Math.min(...yr.map(b => b[3]).filter(v => v > 0), s.low > 0 ? s.low : Infinity) : NaN, yr.length > 20 ? Math.max(...yr.map(b => b[2]), s.high > 0 ? s.high : 0) : NaN], ["漲跌停", ok(s.prev) ? Math.round(s.prev * 0.9 * 100) / 100 : NaN, ok(s.prev) ? Math.round(s.prev * 1.1 * 100) / 100 : NaN]].filter(r => ok(r[1]) && ok(r[2]) && r[2] > r[1] && ok(P));
      const html = rows.map(([k, lo, hi]) => { const f = Math.max(0, Math.min(1, (P - lo) / (hi - lo))); return `<div class="srr"><span class="srk">${k}</span><span class="srl">${fmt(lo, d)}</span><span class="srb"><i style="width:${(f * 100).toFixed(1)}%"></i><b style="left:${(f * 100).toFixed(1)}%"></b></span><span class="srl">${fmt(hi, d)}</span></div>`; }).join("");
      if (rg.dataset.h !== html) { const first = !rg.dataset.h; rg.dataset.h = html; rg.innerHTML = html; if (first) $$(".srb i", rg).forEach((el, k) => el.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 700, delay: k * 90, easing: "cubic-bezier(.215,.61,.355,1)" })); }
      rg.dataset.tone = t;
    })();
  }
  /* today's bar from the live quote is added to the history, or replaces today's bar */
  function barsOf(code) {
    const rec = HIST.get(code), s = DB.by.get(code); if (!rec) return null;
    const cs = rec.cs.slice();
    if (s && s.rt && s.day && s.open > 0) {
      const bar = [s.day, s.open, s.high, s.low, s.price, s.vol], last = cs[cs.length - 1];
      if (last && last[0] === s.day) cs[cs.length - 1] = bar; else if (last && last[0] < s.day) cs.push(bar);
    }
    return cs;
  }
  let chartTok = 0;
  /* the chart's window: how many days (span) and how far back from the latest (end); dragged, zoomed with the wheel, double-click resets */
  const KV = { span: SPAN, end: 0, code: null, c: null, len: 0, drag: null, draw: false, pen: null };
  const linesKey = () => "twlines:" + CODE;
  const NSL = (tag, attrs, cls, parent) => { const e = document.createElementNS(NS, tag); for (const a in attrs) e.setAttribute(a, attrs[a]); if (cls) e.setAttribute("class", cls); parent.appendChild(e); return e; };
  /* one trend line: the drawn part solid, carried on to the right edge dashed (where the trend would be now) */
  function lineEls(c, x1, y1, x2, y2, cls) {
    const g = NSL("g", {}, "tl " + (cls || ""), c.tg);
    NSL("line", { x1, y1, x2, y2 }, "tl-s", g);
    if (Math.abs(x2 - x1) > 0.5) { const xr = c.plot.x1, yr = y2 + (y2 - y1) / (x2 - x1) * (xr - x2); if (x2 < xr) NSL("line", { x1: x2, y1: y2, x2: xr, y2: yr }, "tl-x", g); }
    [[x1, y1], [x2, y2]].forEach(([x, y]) => NSL("circle", { cx: x, cy: y, r: 3 }, "tl-p", g));
    return g;
  }
  function paintLines(c) {
    const L = store.get(linesKey(), []) || [], ix = new Map(c.all.map((b, i) => [b[0], i]));
    L.forEach(l => { const a = ix.get(l.d1), b = ix.get(l.d2); if (a == null || b == null) return; const up = l.p2 >= l.p1; lineEls(c, c.xOf(a), c.yOf(l.p1), c.xOf(b), c.yOf(l.p2), up ? "rise" : "fall"); });
    const box = $("#dpStock"), clr = $("[data-clrline]", box);
    if (clr) { clr.hidden = !L.length; clr.textContent = `清除 ${L.length} 條`; }
    $$("[data-draw]", box).forEach(b => b.setAttribute("aria-pressed", String(KV.draw)));
    $(".cbox", box).classList.toggle("drawing", KV.draw);
  }
  function drawChart(animate, quick) {
    const box = $("#dpStock"), host = $(".cbox", box), read = $(".cread", box), cs = barsOf(CODE);
    if (KV.code !== CODE) { KV.code = CODE; KV.span = SPAN; KV.end = 0; }
    { const sb = $$("[data-span]", box), near = sb.reduce((m, b) => (Math.abs(+b.dataset.span - KV.span) < Math.abs(+m.dataset.span - KV.span) ? b : m), sb[0]); sb.forEach(b => b.setAttribute("aria-pressed", String(b === near))); }
    $$("[data-ind]", box).forEach(b => b.setAttribute("aria-pressed", String(!!IND[b.dataset.ind])));
    $(".clegend", box).hidden = !IND.ma;
    if (!cs) return;
    KV.len = cs.length; KV.span = clamp(KV.span, Math.min(20, cs.length), cs.length); KV.end = clamp(KV.end, 0, Math.max(0, cs.length - KV.span));
    const oldC = KV.c, oldSvg = KV.morph && oldC && $("svg.kchart", host) || (KV.morph && oldC && oldC.svg) || null;
    const oldBox = oldSvg && oldSvg.getBoundingClientRect(), hostBox = host.getBoundingClientRect();
    KV.w = chartW(host);
    const c = chartSVG(cs, KV.span, KV.end, KV.w); KV.c = c;
    if (!host.dataset.ro && window.ResizeObserver) {
      /* turning the phone or resizing the window (or showing a page drawn while hidden): draw again at the new width */
      host.dataset.ro = "1";
      new ResizeObserver(() => { if (KV.c && host.clientWidth && Math.abs(chartW(host) - KV.w) > 24) drawChart(false); }).observe(host);
    }
    host.replaceChildren(c.svg, ktip);
    /* a new range: the old drawing squeezes (or stretches) toward the latest day while it fades, the new one settles in from the opposite scale */
    if (KV.morph) {
      KV.morph = false;
      if (oldSvg && oldBox && oldBox.width && oldC.N !== c.N && box.classList.contains("on") && oldSvg !== c.svg) {
        const k = c.N / oldC.N, org = "93% 50%";
        oldSvg.style.cssText = `position:absolute;left:${(oldBox.left - hostBox.left + host.scrollLeft).toFixed(1)}px;top:${(oldBox.top - hostBox.top).toFixed(1)}px;width:${oldBox.width.toFixed(1)}px;height:${oldBox.height.toFixed(1)}px;pointer-events:none;transform-origin:${org}`;
        host.appendChild(oldSvg);
        oldSvg.animate([{ transform: "none", opacity: 1, filter: "none" }, { transform: `scaleX(${(1 / k).toFixed(3)})`, opacity: 0, filter: "blur(3px)" }], { duration: 480, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" }).onfinish = () => oldSvg.remove();
        c.svg.style.transformOrigin = org;
        c.svg.animate([{ transform: `scaleX(${k.toFixed(3)})`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 560, easing: "cubic-bezier(.16,1,.3,1)" });
      }
    }
    paintLines(c);
    document.dispatchEvent(new Event("twdash:chart"));
    const zl = $(".czoom", box); if (zl) zl.textContent = `${c.N} 日${KV.end ? `・往前 ${KV.end} 日` : ""}`;
    if (quick) return;
    read.textContent = c.read(c.N - 1); c.unmark(); ktip.hidden = true;
    /* the drawing is revealed from the left as one layer (cheap on a tablet), oldest day first */
    if (animate && box.classList.contains("on")) c.svg.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: 700, easing: "cubic-bezier(.3,.7,.3,1)" });
    paintSnap(cs);
  }
  /* what the numbers say, in plain rules; the same figures are handed to the AI team */
  function facts(cs) {
    const I = calc(cs), n = cs.length, i = n - 1, last = cs[i], s = DB.by.get(CODE) || {};
    const hi = k => Math.max(...cs.slice(-k).map(c => c[2])), lo = k => Math.min(...cs.slice(-k).map(c => c[3]));
    const ret = k => (n > k ? (last[4] / cs[i - k][4] - 1) * 100 : NaN), r2 = v => (v == null || !ok(v) ? null : Math.round(v * 100) / 100);
    const cross = I.K[i] > I.D[i] && I.K[i - 3] <= I.D[i - 3] ? "golden" : I.K[i] < I.D[i] && I.K[i - 3] >= I.D[i - 3] ? "dead" : "none";
    const f = FUND.map && FUND.map.get(CODE), ch = CHIP.map && CHIP.map.get(CODE);
    return {
      date: last[0], dataKind: s.rt ? "intraday" : DB.live ? "close" : "sample", close: r2(last[4]), changePct: r2(s.pct), open: r2(last[1]), high: r2(last[2]), low: r2(last[3]), volumeLots: last[5],
      ma5: r2(I.ma5[i]), ma20: r2(I.ma20[i]), ma60: r2(I.ma60[i]), bollUpper: r2(I.bu[i]), bollLower: r2(I.bl[i]),
      K: r2(I.K[i]), D: r2(I.D[i]), kdCross3d: cross, rsi14: r2(I.rsi[i]), macdDif: r2(I.dif[i]), macdSignal: r2(I.dea[i]), macdHist: r2(I.hist[i]), macdHistPrev: r2(I.hist[i - 1]),
      volumeVs20dAvg: I.vma20[i] ? r2(last[5] / I.vma20[i]) : null, high20: r2(hi(20)), low20: r2(lo(20)), high60: n >= 60 ? r2(hi(60)) : null, low60: n >= 60 ? r2(lo(60)) : null,
      return5dPct: r2(ret(5)), return20dPct: r2(ret(20)), return60dPct: r2(ret(60)), bars: n,
      last10Closes: cs.slice(-10).map(c => r2(c[4])),
      fundamentals: f ? { pe: r2(f.pe), dividendYieldPct: r2(f.yld), pb: r2(f.pb), monthlyRevenueYi: r2(f.rev), revenueYoYPct: r2(f.yoy), revenueMonth: f.ym || null } : null,
      institutionsLots: ch ? { date: CHIP.date, foreign: Math.round(ch.f), trust: Math.round(ch.t), dealers: ok(ch.d) ? Math.round(ch.d) : null, total: Math.round(ch.a) } : null,
      market: { taiex: r2(IDX[0].z), taiexChangePct: ok(IDX[0].z) && ok(IDX[0].y) ? r2((IDX[0].z / IDX[0].y - 1) * 100) : null,
        foreignYi: MKT.inst ? r2(MKT.inst.f) : null, trustYi: MKT.inst ? r2(MKT.inst.t) : null, dealersYi: MKT.inst ? r2(MKT.inst.d) : null },
    };
  }
  function paintSnap(cs) {
    const el = $("#dpStock .snaplist"); if (!el) return;
    if (cs.length < 30) { el.innerHTML = `<p class="sub">歷史資料不足 30 日，暫不判讀。</p>`; return; }
    const F = facts(cs), d = dig(F.close), v = x => (x == null ? "—" : fmt(x, d)), rows = [];
    const row = (k, text, t) => rows.push(`<div class="snap"><span>${k}</span><b class="${t || ""}">${text}</b></div>`);
    const above20 = F.ma20 != null && F.close >= F.ma20, above60 = F.ma60 != null && F.close >= F.ma60;
    row("趨勢", F.ma60 == null ? (above20 ? "站上月線（MA20）" : "在月線（MA20）之下") : F.ma5 > F.ma20 && F.ma20 > F.ma60 ? "多頭排列（MA5 > MA20 > MA60）" : F.ma5 < F.ma20 && F.ma20 < F.ma60 ? "空頭排列（MA5 < MA20 < MA60）" : `均線糾結，${above20 ? "站上" : "跌破"}月線、${above60 ? "站上" : "跌破"}季線`,
      F.ma60 == null ? (above20 ? "up" : "down") : F.ma5 > F.ma20 && F.ma20 > F.ma60 ? "up" : F.ma5 < F.ma20 && F.ma20 < F.ma60 ? "down" : "");
    row("KD", `K ${fmt(F.K, 1)} / D ${fmt(F.D, 1)}` + (F.kdCross3d === "golden" ? "，近 3 日黃金交叉" : F.kdCross3d === "dead" ? "，近 3 日死亡交叉" : "") + (F.K > 80 ? "，高檔區" : F.K < 20 ? "，低檔區" : ""), F.kdCross3d === "golden" ? "up" : F.kdCross3d === "dead" ? "down" : "");
    if (F.rsi14 != null) row("RSI(14)", fmt(F.rsi14, 1) + (F.rsi14 >= 70 ? "，偏熱" : F.rsi14 <= 30 ? "，偏冷" : "，中性"), "");
    row("MACD", `柱狀 ${signed(F.macdHist, 2)}，${F.macdHist > F.macdHistPrev ? "動能增強" : "動能減弱"}`, F.macdHist > 0 ? "up" : "down");
    if (F.bollUpper != null) row("布林位置", `${fmt(clamp((F.close - F.bollLower) / (F.bollUpper - F.bollLower) * 100, 0, 100), 0)}%（0 下軌，100 上軌）`, "");
    if (F.volumeVs20dAvg != null) row("量能", `今日量為 20 日均量的 ${fmt(F.volumeVs20dAvg, 2)} 倍`, "");
    const sup = [["MA20", F.ma20], ["MA60", F.ma60], ["20 日低點", F.low20], ["布林下軌", F.bollLower]].filter(x => x[1] != null && x[1] < F.close).sort((a, b) => b[1] - a[1]).slice(0, 2);
    const res = [["MA20", F.ma20], ["MA60", F.ma60], ["20 日高點", F.high20], ["60 日高點", F.high60], ["布林上軌", F.bollUpper]].filter(x => x[1] != null && x[1] > F.close).sort((a, b) => a[1] - b[1]).slice(0, 2);
    row("支撐", sup.length ? sup.map(x => `${v(x[1])}（${x[0]}）`).join("、") : "下方近期沒有明確支撐", "");
    row("壓力", res.length ? res.map(x => `${v(x[1])}（${x[0]}）`).join("、") : "已在近 60 日高點附近", "");
    row("報酬", [[5, F.return5dPct], [20, F.return20dPct], [60, F.return60dPct]].filter(([d, v]) => d < 60 || ok(v)).map(([d, v]) => `<span class="nw">${d} 日 ${pct(v)}</span>`).join("　"), "");
    el.innerHTML = rows.join("");
  }
  function paintFund() {
    const el = $("#dpStock .fundlist"); if (!el) return;
    if (!DB.live) { el.innerHTML = `<p class="sub">讀不到資料。</p>`; return; }
    const f = FUND.map && FUND.map.get(CODE), ch = CHIP.map && CHIP.map.get(CODE), rows = [];
    const row = (k, val, t) => rows.push(`<div class="snap"><span>${k}</span><b class="${t || ""}">${val}</b></div>`);
    const lots = x => (ok(x) ? signed(Math.round(x), 0) + " 張" : "—");
    row("本益比", f && ok(f.pe) ? fmt(f.pe, 2) : "—"); row("殖利率", f && ok(f.yld) ? fmt(f.yld, 2) + "%" : "—"); row("股價淨值比", f && ok(f.pb) ? fmt(f.pb, 2) : "—");
    row("月營收（億）" + (f && f.ym ? " " + f.ym : ""), f && ok(f.rev) ? fmt(f.rev, 1) : "—"); row("營收年增率", f && ok(f.yoy) ? pct(f.yoy) : "—", f ? tone(f.yoy) : "");
    row("外資買賣超" + (CHIP.date ? " " + shortDay(CHIP.date) : ""), ch ? lots(ch.f) : "—", ch ? tone(ch.f) : ""); row("投信買賣超", ch ? lots(ch.t) : "—", ch ? tone(ch.t) : "");
    row("自營商買賣超", ch ? lots(ch.d) : "—", ch ? tone(ch.d) : ""); row("三大法人合計", ch ? lots(ch.a) : "—", ch ? tone(ch.a) : "");
    el.innerHTML = rows.join("");
  }
  const NEWS = new Map();
  const when = t => { if (!t) return ""; const d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate(); };
  const newsHTML = (news, ann) =>
    (ann && ann.length ? ann.map(a => `<div class="nrow"><span class="ntag">公告</span><span class="ntext">${esc(a.t)}</span><i>${esc(shortRoc(a.d))}</i></div>`).join("") : "") +
    (news && news.length ? news.map(x => `<a class="nrow" href="${esc(x.u)}" target="_blank" rel="noopener"><span class="ntext">${esc(x.t)}</span><i>${esc(x.src)} ${when(x.at)}</i></a>`).join("") : "");
  const shortRoc = d => { const s = ymd(d); return s ? shortDay(s) : String(d || ""); };
  async function loadNews(code) {
    const el = $("#dpStock .newslist"), s = DB.by.get(code); if (!el) return;
    if (NEWS.has(code)) { el.innerHTML = NEWS.get(code); return; }
    el.innerHTML = `<p class="sub">載入中…</p>`;
    try {
      const j = await J(`${WORKER}/tw/news?c=${encodeURIComponent(code)}&n=${encodeURIComponent(s ? s.name : "")}`);
      const real = newsHTML(j.news, j.ann), html = real || `<p class="sub">近一個月沒有找到相關新聞或公告。</p>`;
      if (real) NEWS.set(code, html);          /* an empty answer is not kept, so opening the stock again asks again */
      if (code === CODE) el.innerHTML = html;
    } catch (e) { if (code === CODE) el.innerHTML = `<p class="sub">新聞需要部署新版 Worker 後才會出現。</p>`; }
  }
  async function setStock(code, animate) {
    CODE = code; store.set("twmain-code", CODE);
    document.dispatchEvent(new CustomEvent("twdash:stock", { detail: code }));
    const box = $("#dpStock"), tok = ++chartTok;
    const qs = DB.by.get(code); if (qs && !qs.rt && DB.live && marketOpen()) qs.rtWait = true;
    paintHead(); quoteNow(code);
    KV.c = null; $(".cbox", box).innerHTML = `<p class="mempty">載入中…</p>`; $(".cread", box).textContent = "";
    try { store.set("twrecent", [code, ...(store.get("twrecent", []) || []).filter(c => c !== code)].slice(0, 8)); } catch (e) {}
    $(".snaplist", box).innerHTML = `<p class="sub">載入中…</p>`;
    paintAI();
    if (!DB.list.length) return;
    if (!DB.by.get(code)) { $(".cbox", box).innerHTML = `<p class="mempty">找不到這檔上市股票，請用上面的搜尋換一檔。</p>`; $(".snaplist", box).innerHTML = ""; return; }
    rtPoll();
    paintFund(); loadFund().then(() => { if (tok === chartTok) { paintFund(); } });
    loadChip().then(() => { if (tok === chartTok) paintFund(); });
    loadNews(code); stockExtras(code, tok);
    const cs = await loadHist(code, () => { if (tok === chartTok) drawChart(false); });
    if (tok !== chartTok) return;
    if (!cs) { $(".cbox", box).innerHTML = `<p class="mempty">這檔的歷史資料讀不到，請稍後再試。</p>`; $(".snaplist", box).innerHTML = `<p class="sub">沒有歷史資料。</p>`; return; }
    drawChart(animate !== false);
  }
  /* opening a stock from a row or a card: the header grows out of the thing that was tapped */
  /* browser back / forward: every tab and every stock opened is a history entry (#/dpList, #stock/2454).
     The slash matters: "#dpList" is also a panel id, so the browser would scroll the page to it after loading */
  let navLock = false;
  const navHash = () => (cur === "dpStock" ? "#stock/" + CODE : "#/" + (cur || "dpOverview"));
  function navPush() {
    if (navLock || !cur) return;
    const h = navHash(); if (location.hash === h) return;
    try { history[history.state && history.state.tw ? "pushState" : "replaceState"]({ tw: 1, p: cur, code: CODE }, "", h); } catch (e) {}
  }
  function navGo(h) {
    h = String(h || "").replace(/^#\/dp/, "#dp");   /* older bookmarks have no slash */
    const m = /^#stock\/([0-9A-Z]{4,6})$/.exec(h || ""), p = m ? "dpStock" : (h || "").slice(1).replace(/^dpWatch$/, "dpList").replace(/^dpMid$/, "dpPre");
    if (h === "#dpMid") anaSub("md", false);
    navLock = true;
    try {
      if (m) { if (CODE !== m[1] || !HIST.get(m[1])) setStock(m[1], true); open("dpStock", true); }
      else if (tabs.some(t => t.dataset.p === p)) open(p, true);
      else open("dpOverview", true);
    } finally { navLock = false; }
  }
  addEventListener("popstate", () => { const bk = BACK; navGo(location.hash); if (bk && cur === bk.tab) backTo(bk); });
  /* where a stock was opened from: the 返回 button (and the browser's back) returns there, at the same scroll position */
  let BACK = null;
  function showBack() {
    const b = $("#dpStock .sback"); if (!b) return;
    b.hidden = !BACK;
    if (BACK) { const t = tabs.find(x => x.dataset.p === BACK.tab); const name = t ? t.textContent.trim() : ""; $("span", b).textContent = "返回" + name; b.setAttribute("aria-label", "返回" + name); }
  }
  function backTo(bk) {
    requestAnimationFrame(() => {
      scrollTo({ top: bk.y, behavior: "instant" in window ? "instant" : "auto" });
      const row = document.querySelector(`#${bk.tab} [data-code="${CSS.escape(bk.code)}"], #${bk.tab} [data-pick="${CSS.escape(bk.code)}"]`);
      if (row && row.animate) row.animate([{ boxShadow: "inset 0 0 0 2px var(--color-accent)" }, { boxShadow: "inset 0 0 0 2px transparent" }], { duration: 1400, easing: "ease-out" });
      /* the way back: the row grows out of where the stock header was (the opening animation in reverse) */
      if (row && row.animate && bk.hb) { const r = row.getBoundingClientRect(); if (r.width > 0) row.animate([{ transformOrigin: "0 0", transform: `translate(${bk.hb.left - r.left}px,${bk.hb.top - r.top}px) scale(${bk.hb.width / r.width},${Math.min(3, bk.hb.height / r.height)})`, opacity: .4 }, { transformOrigin: "0 0", transform: "none", opacity: 1 }], { duration: 380, easing: "cubic-bezier(.3,.7,.2,1)" }); }
    });
  }
  function goBack() { const bk = BACK; if (!bk) return; const hd = $("#dpStock .shead"); if (hd) bk.hb = hd.getBoundingClientRect(); open(bk.tab, true); backTo(bk); }
  function openStock(code, from) {
    const a = from && from.getBoundingClientRect();
    if (cur && cur !== "dpStock") BACK = { tab: cur, y: scrollY, code };
    navLock = true; open("dpStock", true, true); navLock = false;
    setStock(code, true); navPush(); showBack();
    const head = $("#dpStock .shead");
    scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    if (a && head) {
      const b = head.getBoundingClientRect();
      head.animate([{ transformOrigin: "0 0", transform: `translate(${a.left - b.left}px,${a.top - b.top}px) scale(${a.width / b.width},${a.height / b.height})`, opacity: .5 }, { transformOrigin: "0 0", transform: "none", opacity: 1 }],
        { duration: 420, easing: "cubic-bezier(.3,.7,.2,1)" });
      rise(Array.from($("#dpStock").children).slice(1), 80, 180);
    }
  }



  /* the watchlist and the held codes (codes only, never shares or costs) go to the Worker, which watches them during trading hours */
  let alertTimer = 0;
  function alertSync() {
    clearTimeout(alertTimer);
    alertTimer = setTimeout(async () => {
      const el = $("#dpPre .pmalert");
      const hold = (store.get("twlab-hold", []) || []).map(h => h.code);
      let state = { ok: false };
      try {
        const opt = store.get("twalert-opt", {}) || {};
        const r = await fetch(WORKER + "/tw/alerts/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ d: DEVICE, watch: WATCH, hold, opt }) });
        const j = await r.json().catch(() => ({}));
        /* a Worker from before the switches answers without "opt": they are not applied yet */
        state = j.ok ? { ok: true, old: j.opt === undefined } : j.owner === false ? { ok: false, owner: false } : { ok: false };
        if (el) el.textContent = j.ok ? `盤中警示：監控大盤、台指期與 ${j.n} 檔股票，有大漲跌或重大消息會傳 Telegram。`
          : j.owner === false ? "盤中警示只監控擁有者裝置的股票。" : "盤中警示：同步失敗。";
      } catch (e) { if (el) el.textContent = "盤中警示：同步失敗。"; }
      document.dispatchEvent(new CustomEvent("twdash:alertsync", { detail: state }));
    }, 1500);
  }
  document.addEventListener("twlab:hold", alertSync);
  document.addEventListener("twalert:change", alertSync);



  /* the distribution's buckets (% change); also a filter for the stock list */
  const DIST = [["跌停", p => p <= -9.4, "down"], ["-9~-6", p => p > -9.4 && p <= -6, "down"], ["-6~-3", p => p > -6 && p <= -3, "down"], ["-3~0", p => p > -3 && p < 0, "down"], ["平", p => p === 0, ""],
      ["0~3", p => p > 0 && p < 3, "up"], ["3~6", p => p >= 3 && p < 6, "up"], ["6~9", p => p >= 6 && p < 9.4, "up"], ["漲停", p => p >= 9.4, "up"]];
  /* ---------------- overview board: distribution, movers, volume, watchlist heat map, pre-market summary ---------------- */
  let PMN = null, boardSig = "";
  function paintBoard() {
    const box = $("#dpOverview .board"); if (!box) return;
    if (!DB.list.length) { if (DB.failed) {  } return; }
    const live = DB.list.filter(s => ok(s.price) && s.price > 0 && ok(s.pct)), liq = live.filter(s => s.vol >= 500 && s.mkt !== "esb");
    const sig = live.length + ":" + live.reduce((a, s) => a + s.pct, 0).toFixed(1) + ":" + (PMN ? PMN.at : 0) + ":" + WATCH.join();
    const first = !boardSig; if (sig === boardSig) return; boardSig = sig;
    /* distribution: ≤-9, -9..-6, -6..-3, -3..0, 0, 0..3, 3..6, 6..9, ≥9 */
    const B = DIST;
    const cnt = B.map(b => live.filter(s => b[1](s.pct)).length), mx = Math.max(1, ...cnt);
    if ($(".bd-bars", box)) { $(".bd-n", box).textContent = `${fmt(live.length)} 檔`;
    $(".bd-bars", box).innerHTML = B.map((b, i) => `<button type="button" class="bd-col" data-dist="${i}" aria-label="漲跌幅 ${b[0]}：${cnt[i]} 檔，點一下在股票清單列出"><span class="bd-c">${fmt(cnt[i])}</span><i class="bd-b ${b[2]}" style="--h:${(cnt[i] / mx * 100).toFixed(1)}%"></i><span class="bd-l">${b[0]}</span></button>`).join(""); }
    const row = (s, v, t) => `<button type="button" class="bd-row" data-code="${esc(s.code)}"><span class="bd-nm"><b>${esc(s.name)}</b><i>${esc(s.code)}</i></span><span class="bd-px">${fmt(s.price, dig(s.price))}</span><span class="bd-v ${t}">${v}</span></button>`;
    const up = liq.slice().sort((a, b) => b.pct - a.pct).slice(0, 15), dn = liq.slice().sort((a, b) => a.pct - b.pct).slice(0, 15), vol = live.slice().sort((a, b) => b.vol - a.vol).slice(0, 8), vmx = vol.length ? vol[0].vol : 1;
    $(".bd-up .bd-list").innerHTML = up.map(s => row(s, pct(s.pct), "up")).join("");
    $(".bd-down .bd-list").innerHTML = dn.map(s => row(s, pct(s.pct), "down")).join("");
    ($(".bd-vol .bd-list", box) || {}).innerHTML = vol.map(s => `<button type="button" class="bd-row bd-vrow" data-code="${esc(s.code)}" style="--w:${(s.vol / vmx * 100).toFixed(1)}%"><span class="bd-nm"><b>${esc(s.name)}</b><i>${esc(s.code)}</i></span><span class="bd-px ${tone(s.chg)}">${pct(s.pct)}</span><span class="bd-v">${fmt(s.vol)}</span></button>`).join("");
    const a = PMN && PMN.analysis;
    ($(".bd-pmout", box) || {}).innerHTML = a ? `<div class="bd-call"><span class="aitag ${/高/.test(a.call) ? "up" : /低/.test(a.call) ? "down" : ""}">${esc(a.call)}</span><span class="sub">預測 ${esc(String(PMN.day).slice(5).replace("-", "/"))} 開盤・${esc(a.gap || "")}</span>${a.close && a.close.call ? `<span class="aitag ${/紅/.test(a.close.call) ? "up" : /黑/.test(a.close.call) ? "down" : ""}">${esc(a.close.call)}</span><span class="sub">收盤 ${esc(a.close.range || "")}</span>` : ""}</div><p class="bd-head">${esc(a.headline || "")}</p>
      ${Array.isArray(a.picks) && a.picks.length ? `<div class="bd-picks">${a.picks.slice(0, 8).map(x => `<button type="button" class="bd-row" data-code="${esc(x.code)}"><span class="bd-nm"><b>${esc(x.name)}</b><i>${esc(x.code)}</i></span><span class="bd-px">${esc(x.tag || "")}</span><span class="bd-v ${/買|續抱/.test(x.action || "") ? "up" : /賣|減/.test(x.action || "") ? "down" : ""}">${esc(actFor(x.code, x.action || ""))}</span></button>`).join("")}</div>` : ""}<div class="bd-ch">${["開高", "平盤", "開低"].map(k => `<div><span>${k}</span><b class="${k === "開高" ? "up" : k === "開低" ? "down" : ""}">${esc((a.chances || {})[k] || "—")}</b></div>`).join("")}</div>` : `<p class="sub">05:30 自動產生。</p>`;
    if (first || cur === "dpOverview") boardIn(box, first);
  }
  /* the reading over a distribution bar: how many, and the busiest stocks in that bucket */
  function distTip(e) {
    const card = e.currentTarget, col = e.target.closest && e.target.closest(".bd-col");
    let tip = $(".bdtip", card);
    if (!col) { if (tip) tip.hidden = true; return; }
    if (!tip) { tip = document.createElement("div"); tip.className = "hmtip bdtip"; card.appendChild(tip); }
    const b = DIST[+col.dataset.dist], list = DB.list.filter(x => ok(x.price) && x.price > 0 && ok(x.pct) && b[1](x.pct));
    const top = list.slice().sort((a, c) => c.vol - a.vol).slice(0, 5);
    tip.innerHTML = `<b>漲跌幅 ${esc(b[0])}${/~/.test(b[0]) ? "%" : ""} <em>${fmt(list.length)} 檔</em></b>${top.length ? `<ul>${top.map(x => `<li><span>${esc(x.name)}</span><em class="${tone(x.chg)}">${pct(x.pct)}</em></li>`).join("")}</ul>` : ""}<p>點一下在股票清單列出全部</p>`;
    tip.hidden = false;
    const r = card.getBoundingClientRect(), cr = col.getBoundingClientRect(), w = tip.offsetWidth;
    tip.style.transform = `translate(${Math.round(clamp(cr.left - r.left + cr.width / 2 - w / 2, 6, r.width - w - 6))}px, ${Math.round(Math.max(6, cr.top - r.top + 24))}px)`;
  }
  /* bars grow from the baseline, list rows slide in one after another, tiles pop in */
  function boardIn(box, full) {
    $$(".bd-b", box).forEach((b, i) => b.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 700, delay: full ? 150 + i * 60 : 0, easing: "cubic-bezier(.2,.9,.3,1.1)", fill: "backwards" }));
    if (!full) return;
    $$(".bd-row", box).forEach((r, i) => r.animate([{ opacity: 0, transform: "translateX(-8px)" }, { opacity: 1, transform: "none" }], { duration: 400, delay: 250 + (i % 8) * 45, fill: "backwards" }));
    $$(".bd-vrow", box).forEach((r, i) => r.animate([{ backgroundSize: "0% 100%" }, { backgroundSize: "var(--w) 100%" }], { duration: 900, delay: 400 + i * 60, easing: "ease-out", fill: "backwards" }));
    $$(".bd-tile", box).forEach((t, i) => t.animate([{ opacity: 0, transform: "scale(.85)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 300 + i * 50, easing: "cubic-bezier(.2,.9,.3,1.3)", fill: "backwards" }));
  }

  /* ---------------- index cards: intraday sparklines and a detail chart (Yahoo Taiwan through the Worker) ---------------- */
  const CH = {};                                   /* "k:r" → chart data */
  const IXV = { k: null, r: "tick" };
  const usOpen = () => { const m = taipei().mins; return m >= 21 * 60 + 30 || m < 5 * 60; };
  const sessOpen = k => (isFut(k) ? marketOpen() || nightOpen() : /^(dji|spx|ixic|sox)$/.test(k) ? usOpen() : marketOpen());
  /* when Yahoo's chart service has nothing for a US index, the Worker's month of daily closes stands in for the chart */
  function histChart(it, r) {
    const h = it && it.hist; if (!h || h.length < 3) return null;
    const pts = h.map(x => [x[0], x[1], 0, null, null, null]), v = h.map(x => x[1]);
    return { k: it.k, r, name: it.name, prev: v[0], last: v[v.length - 1], open: NaN, high: Math.max(...v), low: Math.min(...v), volume: NaN, pts, synthetic: true };
  }
  async function loadChart(k, r) {
    const j = await J(`${WORKER}/tw/chart?k=${k}&r=${r}`);
    if (j && Array.isArray(j.pts)) {
      /* no intraday series: draw the daily closes instead */
      CH[k + ":" + r] = j;
      if (r === "tick" && j.pts.length < 2 && !CH[k + ":sday"]) loadChart(k, "day").then(dj => { if (dj && dj.pts && dj.pts.length > 2) { CH[k + ":sday"] = dj; paintSparks(); } }).catch(() => null);
    }
    return CH[k + ":" + r];
  }
  async function loadCharts(first) {
    await Promise.all(IDX.map(i => (first || sessOpen(i.k) || !CH[i.k + ":tick"] ? loadChart(i.k, "tick").catch(() => null) : null)));
    paintSparks(); if (first && cur === "dpOverview") drawSpark();
    if (IXV.k && IXV.r === "tick" && sessOpen(IXV.k)) ixPaint(false);
    setTimeout(() => loadCharts(false), marketOpen() || nightOpen() ? 60000 : 600000);
  }
  function paintSparks() {
    IDX.forEach(i => {
      const svg = $(`.ixcard[data-k="${i.k}"] .spark`), tk = CH[i.k + ":tick"], sd = CH[i.k + ":sday"], d = (tk && tk.pts && tk.pts.length > 1 ? tk : null) || (sd ? { pts: sd.pts.slice(-30).map(h => [h[0], h[1]]), prev: sd.pts[Math.max(0, sd.pts.length - 30)][1] } : null) || (i.hist && i.hist.length > 2 ? { pts: i.hist.map(h => [h[0], h[1]]), prev: i.hist[0][1] } : null); if (!svg || !d || d.pts.length < 2) return;
      const sg = d.pts.length + ":" + d.pts[d.pts.length - 1][1] + ":" + d.prev; if (svg.dataset.sg === sg) return; svg.dataset.sg = sg;
      const ys = d.pts.map(p => p[1]), base = ok(d.prev) ? d.prev : ys[0], lo = Math.min(base, ...ys), hi = Math.max(base, ...ys), span = hi - lo || 1, n = ys.length - 1;
      const Y = v => (26 - (v - lo) / span * 24).toFixed(1);
      /* a single-colour line (red when the day is above yesterday's close, green when below) */
      $$(".cd", svg).forEach(x => x.remove());
      let pth = $("path", svg); if (!pth) { pth = document.createElementNS("http://www.w3.org/2000/svg", "path"); svg.appendChild(pth); }
      pth.setAttribute("d", ys.map((v, k) => (k ? "L" : "M") + (k / n * 76).toFixed(2) + " " + Y(v)).join(""));
      const b = $(".spbase", svg); b.setAttribute("y1", Y(base)); b.setAttribute("y2", Y(base));
      svg.setAttribute("class", "spark up");
      if (!svg.dataset.drawn) { svg.dataset.drawn = "1"; pth.setAttribute("pathLength", "1"); pth.classList.remove("spdraw"); void pth.getBoundingClientRect(); pth.classList.add("spdraw"); }
    });
    if (!paintSparks.busy && $(".ixcard.ixwait:not([data-shown])")) { paintSparks.busy = true; try { paintIdx(); } finally { paintSparks.busy = false; } }   /* a card was waiting for its line: show number and line together now */
  }
  /* the detail panel sits right under the row of the card that was opened */
  function ixPlace(panel, k) {
    const grid = $("#dpOverview .ixgrid"), cards = $$(".ixcard", grid), i = cards.findIndex(c => c.dataset.k === k); if (i < 0) return;
    const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").length), last = Math.min(cards.length - 1, (Math.floor(i / cols) + 1) * cols - 1);
    panel.style.gridColumn = "1 / -1"; panel.style.marginTop = "0"; cards[last].after(panel);
  }
  addEventListener("resize", () => { const p = $("#dpOverview .ixdetail"); if (p && !p.hidden && IXV.k) ixPlace(p, IXV.k); });
  function ixOpen(k) {
    const panel = $("#dpOverview .ixdetail");
    $$(".ixcard").forEach(c => c.setAttribute("aria-expanded", "false"));
    if (IXV.k === k && !panel.hidden) { panel.hidden = true; IXV.k = null; return; }
    IXV.k = k; IXV.r = (IDX.find(i => i.k === k) || {}).us ? "3mo" : "tick"; ixPlace(panel, k); panel.hidden = false;
    $(`.ixcard[data-k="${k}"]`).setAttribute("aria-expanded", "true");
    ixPaint(true);
    panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  /* warm the chart data as soon as the pointer reaches a card, so the panel has something to draw the moment it opens */
  const ixWarm = e => { const c = e.target.closest && e.target.closest(".ixcard"); if (!c) return; const k = c.dataset.k, it = IDX.find(i => i.k === k); if (!it) return; const r = it.us ? "3mo" : "tick", key = k + ":" + (r === "tick" ? "tick" : "day"); if (!CH[key] && !ixWarm.p[key]) { ixWarm.p[key] = 1; Promise.resolve().then(() => loadChart(k, r === "tick" ? "tick" : "day")).catch(() => {}).finally(() => { delete ixWarm.p[key]; }); } };
  ixWarm.p = {}; ["pointerover", "pointerdown", "touchstart"].forEach(t => document.addEventListener(t, ixWarm, { capture: true, passive: true }));
  async function ixPaint(animate) {
    const panel = $("#dpOverview .ixdetail"), k = IXV.k, r = IXV.r; if (!k || panel.hidden) return;
    const it = IDX.find(i => i.k === k), key = k + ":" + (r === "tick" ? "tick" : "day");
    if (!CH[key] || (r !== "tick" && !CH[key].pts.length)) { panel.innerHTML = `<p class="sub">載入走勢…</p>`; try { await loadChart(k, r === "tick" ? "tick" : "day"); } catch (e) { const syn = histChart(it, r); if (syn) CH[key] = syn; else { panel.innerHTML = `<p class="sub">走勢讀不到，請稍後再試。</p>`; return; } } }
    if (IXV.k !== k || IXV.r !== r) return;
    const d = CH[key], pts = r === "tick" ? d.pts : d.pts.slice(r === "3mo" ? -66 : -250);
    const z = ok(it.z) ? it.z : d.last, y = ok(it.y) ? it.y : d.prev, ch = z - y, t = tone(ch), dg = 2;
    const sessName = isFut(k) ? (nightOpen() || (taipei().mins < 525) ? "夜盤（15:00 起）" : "日盤（08:45 起）") : "當日（09:00–13:30）";
    const vol = isFut(k) ? (ok(it.v) || ok(d.volume) ? fmt(ok(d.volume) ? d.volume : it.v) + " 口" : "—") : ok(d.volume) ? fmt(d.volume / 1e8, 1) + " 億股" : "—";
    const kv = (a, b, c) => `<div class="snap ixkv"><span>${a}</span><b class="${c || ""}">${b}</b></div>`;
    panel.innerHTML = `
      <div class="ixdhead"><div><h3>${esc(it.name)}<em class="ixen">${it.en}</em>${it.label ? " (" + esc(it.label.replace(/^臺指期\s*/, "")) + ")" : ""}</h3>
          <div class="ixdnow"><b class="big ${t}">${ok(z) ? fmt(z, dg) : "—"}</b><span class="${t}">${ok(ch) ? `${arrow(ch)} ${fmt(Math.abs(ch), dg)} (${pct(ch / y * 100)})` : ""}</span><span class="sub">${esc(it.src || "")} ${esc((it.tm || "").slice(0, 5))}</span></div></div>
        <div class="chips">${[["tick", sessName.replace(/（.*/, "") + "走勢"], ["3mo", "日線 3 個月"], ["1y", "日線 1 年"]].map(([v, l]) => `<button type="button" class="chip" data-ixr="${v}" aria-pressed="${v === r}">${l}</button>`).join("")}
          <button type="button" class="btn ixclose" aria-label="關閉">×</button></div></div>
      <div class="ixdbody"><div class="ixdchart">${ixSVG(pts, r === "tick" ? y : null, r, k)}<p class="sub ixread"></p></div>
        <div class="ixdstats">${kv("開盤", ok(d.open) ? fmt(d.open, dg) : "—")}${kv("最高", ok(it.h) ? fmt(it.h, dg) : ok(d.high) ? fmt(d.high, dg) : "—", "up")}${kv("最低", ok(it.l) ? fmt(it.l, dg) : ok(d.low) ? fmt(d.low, dg) : "—", "down")}
          ${kv(isFut(k) ? "參考價" : "昨收", ok(y) ? fmt(y, dg) : "—")}${kv("振幅", ok(d.high) && ok(d.low) && ok(y) ? pct((d.high - d.low) / y * 100).replace("+", "") : "—")}${kv("成交量", vol)}
          ${isFut(k) && ok(d.limitUp) ? kv("漲停／跌停", `${fmt(d.limitUp, 0)}／${fmt(d.limitDown, 0)}`) : ""}${r !== "tick" && pts.length > 1 ? kv("區間漲跌", pct((pts[pts.length - 1][1] / pts[0][1] - 1) * 100), tone(pts[pts.length - 1][1] - pts[0][1])) + kv("區間最高", fmt(Math.max(...pts.map(p => p[1])), 0), "up") + kv("區間最低", fmt(Math.min(...pts.map(p => p[1])), 0), "down") : ""}</div></div>`;
    ixHover(panel, pts, r);
    if (animate) ixAnimate(panel);
  }
  function ixSVG(pts, base, r, k) {
    const W = 760, H = 300, PL = 62, PR = 12, PT = 12, PB = 26;
    if (pts.length < 2) return `<p class="mempty">${r === "tick" ? "這個時段還沒有成交。" : "沒有資料。"}</p>`;
    const ys = pts.map(p => p[1]), lo0 = Math.min(...ys, ok(base) ? base : Infinity), hi0 = Math.max(...ys, ok(base) ? base : -Infinity), pad = (hi0 - lo0) * 0.08 || 1, lo = lo0 - pad, hi = hi0 + pad;
    /* the session's own time span for the intraday chart, so a morning line only fills part of the width */
    let x0 = pts[0][0], x1 = pts[pts.length - 1][0];
    if (r === "tick") { const d0 = new Date((pts[0][0] + 8 * 3600) * 1000), mid = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate()) / 1000 - 8 * 3600, h = d0.getUTCHours();
      if (isFut(k) && h >= 15) { x0 = mid + 15 * 3600; x1 = mid + 29 * 3600; } else if (isFut(k)) { x0 = mid + 8.75 * 3600; x1 = mid + 13.75 * 3600; } else { x0 = mid + 9 * 3600; x1 = mid + 13.5 * 3600; } }
    const X = (p, i) => PL + (r === "tick" ? (p[0] - x0) / (x1 - x0) : i / (pts.length - 1)) * (W - PL - PR), Y = v => PT + (hi - v) / (hi - lo) * (H - PT - PB);
    const ticks = [0, 1, 2, 3].map(j => lo + pad + (hi0 - lo0) * j / 3);
    const xl = r === "tick" ? [0, 0.25, 0.5, 0.75, 1].map(f => { const ts = x0 + (x1 - x0) * f, d = new Date((ts + 8 * 3600) * 1000); return [PL + f * (W - PL - PR), String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0")]; })
      : [0, 0.33, 0.66, 1].map(f => { const p = pts[Math.round(f * (pts.length - 1))], d = new Date((p[0] + 8 * 3600) * 1000); return [PL + f * (W - PL - PR), (d.getUTCMonth() + 1) + "/" + d.getUTCDate()]; });
    const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p, i).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(""), last = pts[pts.length - 1];
    const up = ok(base) ? last[1] >= base : last[1] >= pts[0][1];
    const area = line + `L${X(last, pts.length - 1).toFixed(1)} ${H - PB}L${X(pts[0], 0).toFixed(1)} ${H - PB}Z`;
    return `<svg class="ixfig ${up ? "up" : "down"}" viewBox="0 0 ${W} ${H}" role="img" aria-label="走勢圖">
      <g class="ixbk">${ticks.map(v => `<line class="gridl" x1="${PL}" x2="${W - PR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${PL - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${fmt(v, 0)}</text>`).join("")}
        ${xl.map(([x, l]) => `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle">${l}</text>`).join("")}
        ${ok(base) ? `<line class="ixbase" x1="${PL}" x2="${W - PR}" y1="${Y(base).toFixed(1)}" y2="${Y(base).toFixed(1)}"/>` : ""}</g>
      <path class="ixarea" d="${area}"/><path class="ixline" d="${line}"/>
      <g class="ixcur" style="display:none"><line class="ixvl" y1="${PT}" y2="${H - PB}"/><circle r="4"/></g>
      <rect class="ixhit" x="${PL}" y="${PT}" width="${W - PL - PR}" height="${H - PT - PB}" fill="transparent"/></svg>`;
  }
  function ixHover(panel, pts, r) {
    const svg = $(".ixfig", panel), read = $(".ixread", panel); if (!svg) return;
    const g = $(".ixcur", svg), vl = $(".ixvl", svg), dot = $("circle", svg), line = $(".ixline", svg), txt = read.textContent;
    const segs = line.getAttribute("d").match(/[ML][^ML]+/g).map(s => s.slice(1).trim().split(" ").map(Number));
    const move = e => {
      const b = svg.getBoundingClientRect(), x = (e.clientX - b.left) / b.width * 760;
      let i = 0, best = Infinity; segs.forEach((s, j) => { const dd = Math.abs(s[0] - x); if (dd < best) { best = dd; i = j; } });
      const p = pts[i], d = new Date((p[0] + 8 * 3600) * 1000);
      g.style.display = ""; vl.setAttribute("x1", segs[i][0]); vl.setAttribute("x2", segs[i][0]); dot.setAttribute("cx", segs[i][0]); dot.setAttribute("cy", segs[i][1]);
      read.textContent = (r === "tick" ? String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0") : `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`) + `　${fmt(p[1], 2)}` + (p[2] ? `　量 ${fmt(p[2])}` : "");
    };
    svg.addEventListener("pointermove", move); svg.addEventListener("pointerdown", move);
    svg.addEventListener("pointerleave", () => { g.style.display = "none"; read.textContent = txt; });
  }
  /* backdrop (grid, axis, reference line) first, then the line draws from left to right, then the shaded area and the figures */
  function ixAnimate(panel) {
    const svg = $(".ixfig", panel);
    if (svg) {
      $$(".ixbk > *", svg).forEach((el, i) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: i * 25, fill: "backwards" }));
      const ln = $(".ixline", svg), L = ln.getTotalLength(), t0 = 350;
      ln.style.strokeDasharray = L; ln.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 1100, delay: t0, easing: "ease-out", fill: "backwards" });
      $(".ixarea", svg).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: t0 + 1000, fill: "backwards" });
    }
    rise($$(".ixkv", panel), 50, 300);
  }

  /* ---------------- AI pre-market note (written by the Worker at 05:30, or on request) ---------------- */
  /* mid: the midday note (written at 13:00 during the session, calling the next session) in its own tab */
  function pmPaint(j, animate, mid) {
    if (!mid && j && j.note) { PMN = j.note; boardSig = boardSig ? "x" : ""; try { paintBoard(); } catch (e) {} }
    if (!mid && j && j.note) document.dispatchEvent(new CustomEvent("twdash:premarket", { detail: j }));
    const el = $(mid ? "#dpPre .mdout" : "#dpPre .pmout"); if (!el) return;
    const n = j && j.note;
    if (!n || !n.analysis) { el.innerHTML = `<p class="sub">還沒有分析，${mid ? "13:00" : "05:30"} 會自動產生。</p>`; return; }
    const a = n.analysis, ch = a.chances || {}, li = arr => (Array.isArray(arr) ? arr : []).map(x => `<li>${esc(x)}</li>`).join(""), tn = /高/.test(a.call) ? "up" : /低/.test(a.call) ? "down" : "";
    const at = new Date(n.at).toLocaleString("zh-TW", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    el.innerHTML = `
      <div class="aisum lrise"><div class="aiverdict"><span class="aitag ${tn}">${esc(a.call)}</span><b class="pmday">預測 ${esc(String(n.day).slice(5).replace("-", "/"))}（週${"日一二三四五六"[new Date(n.day + "T00:00:00Z").getUTCDay()]}）09:00 開盤</b><span class="sub">${esc(a.gap || "")}・信心 ${esc(a.confidence || "—")}・${at} 產生${n.day < new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10) || (n.day === new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10) && new Date(Date.now() + 8 * 3600e3).getUTCHours() >= 9) ? "（這天已經開過盤，是舊的分析）" : ""}</span></div>
        <p class="ailead">${esc(a.headline || "")}</p>
        <div class="pmrow"><div class="pmseg"><h4>09:00 開盤</h4><div class="pmchance">${["開高", "平盤", "開低"].map(k => `<div><span>${k}</span><b class="${k === "開高" ? "up" : k === "開低" ? "down" : ""}">${esc(ch[k] || "—")}</b></div>`).join("")}</div></div>
        ${a.close && a.close.call ? `<div class="pmseg"><h4>13:30 收盤 <span class="aitag ${/紅/.test(a.close.call) ? "up" : /黑/.test(a.close.call) ? "down" : ""}">${esc(a.close.call)}</span> <span class="sub">${esc(a.close.range || "")}</span></h4><div class="pmchance">${["收紅", "平盤", "收黑"].map(k => `<div><span>${k}</span><b class="${k === "收紅" ? "up" : k === "收黑" ? "down" : ""}">${esc((a.close.chances || {})[k] || "—")}</b></div>`).join("")}</div>${a.close.why ? `<p class="pmcw">${esc(a.close.why)}</p>` : ""}</div>` : ""}</div></div>
      <div class="aicols"><div class="lrise"><h4>${mid ? "今日盤勢" : "夜盤"}</h4><p>${esc(a.night || "—")}</p></div><div class="lrise"><h4>美股與國際</h4><p>${esc(a.us || "—")}</p></div></div>
      ${Array.isArray(a.picks) && a.picks.length ? `<div class="pmpicks"><div class="pmph"><h4>推薦下單</h4><span class="sub">${esc(a.picks_note || "")}</span></div><div class="pmpgrid">${a.picks.map(x => { const t = /買|續抱/.test(x.action || "") ? "up" : /賣|減/.test(x.action || "") ? "down" : ""; return `<button type="button" class="aiorder pmpick ${t ? "o-" + t : ""} lrise" data-pick="${esc(x.code)}">
        <div class="aiohead"><span class="ntag">${esc(x.tag || "")}</span><b class="pmpn">${esc(x.name || "")} <i>${esc(x.code)}</i></b><b class="${t}">${esc(actFor(x.code, x.action || ""))}</b>${x.rr ? `<span class="sub">風險報酬 ${esc(x.rr)}</span>` : ""}</div>
        <p class="pmpw">${esc(x.why || "")}</p>${anaHTML(x.analysis)}
        <div class="aikv"><div><span>怎麼下</span><b>${esc(x.how || "—")}</b></div><div><span>分批</span><b>${esc(x.split || "—")}</b></div><div><span>停損</span><b>${esc(x.stop || "—")}</b></div><div><span>目標</span><b>${esc((Array.isArray(x.targets) ? x.targets : []).join("；") || "—")}</b></div></div>${planHTML(x.days)}</button>`; }).join("")}</div></div>` : ""}
      <div class="pmfac">${(Array.isArray(a.factors) ? a.factors : []).map(f => `<div class="pmf lrise"><span class="aitag ${f.effect === "利多" ? "up" : f.effect === "利空" ? "down" : ""}">${esc(f.effect || "")}</span><b>${esc(f.name)}</b><span class="sub">${esc(f.note)}</span></div>`).join("")}</div>
      <details class="pmmore"><summary>族群、關鍵點位、風險與開盤後要盯的事</summary>
        <div class="aicols"><div><h4>可能領漲／落後</h4><ul>${li(a.sectors)}</ul><h4>關鍵點位</h4><p>${esc(a.levels || "—")}</p></div><div><h4>風險</h4><ul>${li(a.risks)}</ul><h4>${mid ? "今晚與開盤後要盯" : "09:00–09:30 要盯"}</h4><ul>${li(a.watch)}</ul></div></div>
        ${n.news && n.news.length ? `<h4>參考的新聞</h4><div class="newslist">${newsHTML(n.news, null)}</div>` : ""}</details>`;
    if (animate) rise($$(".lrise", el), 70);
  }
  async function pmLoad(mid) { try { pmPaint(await J(`${WORKER}/tw/${mid ? "midday" : "premarket"}`), true, mid); } catch (e) { const el = $(mid ? "#dpPre .mdout" : "#dpPre .pmout"); if (el) el.innerHTML = `<p class="sub">${mid ? "盤中" : "盤前"}分析需要部署新版 Worker。</p>`; } }
  async function pmRun(b, mid) {
    const el = $(mid ? "#dpPre .mdout" : "#dpPre .pmout"), path = mid ? "midday" : "premarket";
    $$(".runmsg", el).forEach(x => x.remove());
    b.disabled = true; b.textContent = "分析中…";
    const t0 = Date.now() - 5000;
    try {
      const r = await fetch(WORKER + "/tw/" + path + "/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const j = await r.json().catch(() => null);
      if (mid && j && j.error && j.error.status === "MARKET_CLOSED") { MD_HOLIDAY = true; b.disabled = false; b.textContent = "分析"; mdGate(); return; }
      if (!r.ok || !j || !j.analysis) throw new Error(aiLimitMsg(j) || (j && j.error && /[一-鿿]/.test(j.error.message || "") ? j.error.message : "暫時沒有回應，過幾分鐘再試"));
      pmPaint({ note: j }, true, mid);
      const tg = j.sent === "sent" ? "已傳到 Telegram。" : j.sent && j.sent !== "off" ? "Telegram 沒有送出：" + j.sent : "";
      if (tg) el.insertAdjacentHTML("afterbegin", `<p class="runmsg sub ${j.sent === "sent" ? "" : "warn"}">${esc(tg)}</p>`);
    } catch (e) {
      /* a long run can outlast the connection while the Worker keeps going: wait for the new note (up to about 2 minutes) before saying it failed */
      if (!/[一-鿿]/.test(e.message || "")) {
        el.insertAdjacentHTML("afterbegin", `<p class="runmsg sub">連線中斷了，伺服器還在分析，等它完成…</p>`);
        for (let k = 0; k < 12; k++) {
          await new Promise(r => setTimeout(r, 10000));
          try { const j = await J(`${WORKER}/tw/${path}`); if (j.note && j.note.at >= t0) { $$(".runmsg", el).forEach(x => x.remove()); pmPaint(j, true, mid); b.disabled = false; b.textContent = "分析"; return; } } catch (e2) {}
        }
        $$(".runmsg", el).forEach(x => x.remove());
      }
      el.insertAdjacentHTML("afterbegin", `<p class="runmsg sub warn">${/[一-鿿]/.test(e.message || "") ? esc(e.message) : "沒有等到新的分析，可能是額度用完或忙碌，過幾分鐘再按一次。"}</p>`);
    }
    b.disabled = false; b.textContent = "分析";
  }


  /* a 5-day plan strip and a short analysis list, shared by the AI team's order and the pre-market picks */
  const planHTML = days => (Array.isArray(days) && days.length ? `<div class="plan">${days.map(d => `<div class="pday ${/多/.test(d.view || "") ? "up" : /空/.test(d.view || "") ? "down" : ""}"><b>${esc(d.d || "")}</b><span class="pv">${esc(d.view || "")}</span><span class="pr">${esc(d.range || "")}</span><span class="pdo">${esc(d.do || "")}</span></div>`).join("")}</div>` : "");
  const anaHTML = a => (Array.isArray(a) && a.length ? `<ul class="pana">${a.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  /* ---------------- the AI analyst team ---------------- */
  const AI = new Map();                            /* code → { at, data } for this visit */
  /* the two limits that need their own words: the Gemini free tier's daily cap (reset at midnight US Pacific) and the per-connection cap;
     anything else (a busy minute included) keeps the Worker's own message */
  function aiLimitMsg(j) {
    const code = j && j.error && j.error.status;
    if (code === "AI_DAILY") {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date()).map(x => [x.type, x.value]));
      const t = Date.now() + (86400 - (+p.hour * 3600 + +p.minute * 60 + +p.second)) * 1000, tw = ms => new Date(ms + 8 * 3600e3).toISOString();
      return `今天的額度用完了，${tw(t).slice(0, 10) === tw(Date.now()).slice(0, 10) ? "今天" : "明天"} ${tw(t).slice(11, 16)} 重置`;
    }
    if (code === "RESOURCE_EXHAUSTED") return "分析次數到上限了，晚一點再試";
    return null;
  }
  const stanceTone = s => (/多/.test(s || "") ? "up" : /空/.test(s || "") ? "down" : "");
  function paintAI() {
    const box = $("#dpStock"), out = $(".aiout", box), msg = $(".aimsg", box), go = $(".aihead .aigo", box); if (!out) return;
    const hit = AI.get(CODE);
    go.disabled = false; go.textContent = hit ? "重新分析" : "開始分析";
    if (!hit) { out.innerHTML = ""; msg.textContent = ""; return; }
    const a = hit.data.analysis || {}, S = a.summary || {}, E = S.entry || {}, li = arr => (Array.isArray(arr) ? arr : []).map(x => `<li>${esc(x)}</li>`).join("");
    msg.textContent = `分析時間 ${new Date(hit.at).toLocaleString("zh-TW", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}，依當時的報價與新聞。`;
    const O = { ...(a.order || {}) }; O.action = actFor(CODE, O.action); const otn = /買|續抱|偏多/.test(O.action || "") ? "up" : /賣|減/.test(O.action || "") ? "down" : "";
    out.innerHTML = `
      ${O.action ? `<div class="aiorder ${otn ? "o-" + otn : ""}"><div class="aiohead"><span class="sub">下單建議</span><b class="${otn}">${esc(O.action)}</b>${O.rr ? `<span class="sub">風險報酬 ${esc(O.rr)}</span>` : ""}</div>
        <p class="ailead">${esc(O.why || "")}</p>
        <div class="aikv"><div><span>怎麼下</span><b>${esc(O.how || "—")}</b></div><div><span>分批</span><b>${esc(O.split || "—")}</b></div><div><span>停損</span><b>${esc(O.stop || "—")}</b></div><div><span>目標</span><b>${esc((Array.isArray(O.targets) ? O.targets : []).join("；") || "—")}</b></div></div>${planHTML(O.days)}</div>` : ""}
      <div class="aisum"><div class="aiverdict"><span class="aitag ${stanceTone(S.stance)}">${esc(S.stance || "—")}</span><span class="sub">信心 ${esc(S.confidence || "—")}</span></div>
        <p class="ailead">${esc(S.headline || "")}</p>
        <div class="aicols"><div><h4>未來 1–2 週</h4><p>${esc(S.short_term || "—")}</p></div><div><h4>未來 1–3 個月</h4><p>${esc(S.mid_term || "—")}</p></div></div></div>
      <div class="aiscen">${(Array.isArray(S.scenarios) ? S.scenarios : []).map(x => `<div class="dcard"><h4>${esc(x.name)} <span class="sub">${esc(x.chance || "")}</span></h4><p>${esc(x.trigger || "")}</p><p class="airange">${esc(x.range || "")}</p></div>`).join("")}</div>
      <div class="dcard aientry"><h4>進場時機 <span class="aitag ${/適合/.test(E.now || "") ? "up" : /不建議/.test(E.now || "") ? "down" : ""}">${esc(E.now || "—")}</span></h4>
        <ul>${li(E.conditions)}</ul>
        <div class="aikv"><div><span>價位區間</span><b>${esc(E.zone || "—")}</b></div><div><span>停損</span><b>${esc(E.stop || "—")}</b></div><div><span>不要進場的情況</span><b>${esc(E.avoid || "—")}</b></div></div></div>
      <div class="aiteam">${(Array.isArray(a.team) ? a.team : []).map(m => `<div class="dcard"><h4>${esc(m.role)} <span class="aitag ${stanceTone(m.stance)}">${esc(m.stance || "")}</span></h4><ul>${li(m.points)}</ul></div>`).join("")}</div>
      <div class="aicols"><div class="dcard"><h4>風險</h4><ul>${li(S.risks)}</ul></div><div class="dcard"><h4>接下來要盯的事</h4><ul>${li(S.watch)}</ul></div></div>
      ${hit.data.world && hit.data.world.length ? `<div class="dcard"><h4>這次參考的大盤與國際新聞</h4><div class="newslist">${newsHTML(hit.data.world, null)}</div></div>` : ""}`;
  }
  async function analyze() {
    const box = $("#dpStock"), msg = $(".aimsg", box), go = $(".aihead .aigo", box), code = CODE, s = DB.by.get(code);
    const cs = barsOf(code);
    if (!s || !cs || cs.length < 30) { msg.textContent = "這檔的歷史資料還不夠，無法分析。"; return; }
    if (!DB.live) { msg.textContent = "讀不到資料。"; return; }
    const fresh = AI.has(code);                    /* 重新分析 asks for a new one; 開始分析 may get today's saved one at no cost */
    go.disabled = true; go.textContent = "分析中…"; msg.textContent = "五位分析師正在讀數據與新聞，大約需要 20 到 40 秒。";
    $(".aiout", box).innerHTML = `<div class="aiwait"><i></i><i></i><i></i><i></i><i></i></div>`;
    try {
      await Promise.all([loadFund(), loadChip()]);
      let lab = null;
      try { lab = window.TWLab ? await TWLab.research(code, (i, n) => { if (code === CODE) msg.textContent = `整理研究資料（讀日線 ${i}/${n} 個月）…`; }) : null; } catch (e) { lab = null; }
      if (code === CODE) msg.textContent = "五位分析師正在讀數據、研究資料與新聞，大約需要 20 到 40 秒。";
      const F = facts(cs); if (lab) F.research = lab;
      const r = await fetch(WORKER + "/tw/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ d: DEVICE, code, name: s.name, facts: F, fresh }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.analysis) {
        const st = r.status;
        throw new Error(aiLimitMsg(j) || (j && j.error && /[一-鿿]/.test(j.error.message || "") ? j.error.message : st >= 500 ? "Google 的服務現在太忙，過幾分鐘再按一次" : "暫時沒有回應，過幾分鐘再試"));
      }
      AI.set(code, { at: j.at || Date.now(), data: j });
      document.dispatchEvent(new CustomEvent("twdash:ai", { detail: { code, name: s.name, at: j.at || Date.now(), price: F.close, barDate: F.date, analysis: j.analysis } }));
      if (code === CODE) { paintAI(); rise(Array.from($(".aiout", box).children), 90); }
    } catch (e) {
      /* a failed 重新分析 keeps the analysis already on screen */
      if (code === CODE) { paintAI(); msg.textContent = e && e.message && /[一-鿿]/.test(e.message) ? e.message : "連不到分析服務，請稍後再試。"; }
    }
  }

  /* a row or a tape item lights up in the direction of the tick, then fades */
  function tickFlash(el, dir) { el.classList.remove("tick-up", "tick-down"); void el.offsetWidth; el.classList.add(dir === "up" ? "tick-up" : "tick-down"); }

  /* ---------------- the tape: the indices and 自選1, scrolling across the top of every tab ---------------- */
  const tape = document.createElement("div");
  tape.className = "tape"; tape.setAttribute("aria-label", "自選1 行情"); tape.hidden = true;
  tape.innerHTML = `<div class="tape-track"></div>`;
  let tapeSig = "";
  function paintTape() {
    const note = $(".dash-note"); if (note && !tape.isConnected) note.after(tape);
    const codes = (LISTS[0] || []).filter(c => DB.by.has(c)).slice(0, 40);
    if (!DB.list.length || (!codes.length && !IDX.some(i => ok(i.z)))) { tape.hidden = true; return; }
    tape.hidden = false;
    const item = (key, name, v, p, d, isIx) => `<button type="button" class="tp" ${isIx ? `data-ix="${key}"` : `data-code="${esc(key)}"`}><b>${esc(name)}</b><span>${fmt(v, d)}</span><em class="${tone(p)}">${arrow(p)}${pct(p)}</em></button>`;
    const items = IDX.slice(0, 2).filter(i => ok(i.z) && ok(i.y)).map(i => ({ k: "ix" + i.k, h: item(i.k, i.name + " " + i.en, i.z, (i.z / i.y - 1) * 100, i.k === "fut" ? 0 : 2, true), v: i.z, p: (i.z / i.y - 1) * 100 }))
      .concat(codes.map(c => { const s = DB.by.get(c); return { k: c, h: item(c, s.name, s.price, s.pct, dig(s.price)), v: s.price, p: s.pct, s }; }));
    const sig = items.map(x => x.k).join();
    const track = $(".tape-track", tape);
    if (sig !== tapeSig) {
      tapeSig = sig;
      const one = items.map(x => x.h).join("");
      track.innerHTML = `<div class="tape-set">${one}</div><div class="tape-set" aria-hidden="true">${one}</div>`;
      track.style.setProperty("--dur", Math.max(24, items.length * 4.5) + "s");
      return;
    }
    items.forEach(x => {
      $$(x.k.startsWith("ix") ? `.tp[data-ix="${x.k.slice(2)}"]` : `.tp[data-code="${x.k}"]`, track).forEach(b => {
        const sp = $("span", b), em = $("em", b), txt = fmt(x.v, x.k === "ixfut" ? 0 : x.s ? dig(x.v) : 2);
        if (sp.textContent !== txt) { const up = num(sp.textContent) < x.v; sp.textContent = txt; tickFlash(b, up ? "up" : "down"); }
        em.className = tone(x.p); em.textContent = arrow(x.p) + pct(x.p);
      });
    });
  }
  tape.addEventListener("click", e => {
    const b = e.target.closest(".tp"); if (!b) return;
    if (b.dataset.code) openStock(b.dataset.code, b); else { open("dpOverview", true); setTimeout(() => ixOpen(b.dataset.ix), 60); }
  });

  /* ---------------- live repaint ---------------- */
  function paintLive() {
    paintIdx(); paintStrip(); paintTape(); document.dispatchEvent(new Event("twdash:live"));   /* the sidebar repaints in the same frame */
    if (cur === "dpList") {
      $$("#dpList .mtbl tbody tr[data-code]").forEach(tr => {
        const s = DB.by.get(tr.dataset.code); if (!s || !s.rt) return;
        const tmp = document.createElement("tbody"); tmp.innerHTML = rowHTML(s);
        const fresh = tmp.firstElementChild;
        if (fresh.innerHTML !== tr.innerHTML) { tr.innerHTML = fresh.innerHTML; if (s.flash) tickFlash(tr, s.flash); }
        const lim = s.pct >= 9.4 ? "up" : s.pct <= -9.4 ? "down" : "";
        if (lim && s.lim !== lim && s.lim !== undefined) { tr.classList.remove("lim-up", "lim-down"); void tr.offsetWidth; tr.classList.add("lim-" + lim); }
        s.lim = lim; s.flash = "";
      });
    } else if (cur === "dpWatch") paintWatch(false);
    else if (cur === "dpStock") { paintHead(); const s = DB.by.get(CODE); if (s && s.rt && HIST.get(CODE)) drawChart(false); }
  }

  /* ---------------- tabs ---------------- */
  function rise(nodes, gap, delay = 0) {
    nodes.forEach((n, i) => n.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: 460, delay: delay + i * gap, easing: "cubic-bezier(.2,.9,.3,1)", fill: "backwards" }));
  }
  const tabs = $$(".dtabs button[data-p]"), pill = $(".dtabs .pill");
  let cur = null;
  function movePill(b, animate) {
    if (!pill) return;
    if (!animate) pill.style.transition = "none";
    if (getComputedStyle(pill.parentElement).flexDirection === "column") { pill.style.width = ""; pill.style.height = b.offsetHeight + "px"; pill.style.transform = `translateY(${b.offsetTop}px)`; }
    else { pill.style.height = ""; pill.style.width = b.offsetWidth + "px"; pill.style.transform = `translateX(${b.offsetLeft}px)`; }
    if (!animate) { pill.offsetWidth; pill.style.transition = ""; }
  }
  /* "續抱" only makes sense for a stock the user actually holds */
  const heldCode = c => (store.get("twlab-hold", []) || []).some(h => String(h.code) === String(c));
  const actFor = (code, act) => (!heldCode(code) && /續抱/.test(act || "")) ? String(act).replace(/續抱/g, "偏多觀察") : act;
  function open(id, animate, quiet) {
    const nb = tabs.find(t => t.dataset.p === id) || tabs[0];
    if (false && animate && !quiet && cur && cur !== nb.dataset.p && document.startViewTransition && !document.hidden) {
      document.documentElement.style.setProperty("--vtd", tabs.indexOf(nb) > tabs.findIndex(t => t.dataset.p === cur) ? "1" : "-1");
      const vt = document.startViewTransition(() => openNow(id, animate, quiet)); [vt.ready, vt.finished, vt.updateCallbackDone].forEach(pr => pr && pr.catch(() => {}));
      return;
    }
    openNow(id, animate, quiet);
  }
  function openNow(id, animate, quiet) {
    const b = tabs.find(t => t.dataset.p === id) || tabs[0], panel = document.getElementById(b.dataset.p), same = cur === b.dataset.p;
    if (!same && cur) scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });   /* a different menu starts at the top */
    if (b.dataset.p !== "dpStock" && typeof BACK !== "undefined" && BACK) { BACK = null; showBack(); }
    tabs.forEach(t => t.setAttribute("aria-selected", t === b ? "true" : "false"));
    movePill(b, animate);
    $$(".dpanel").forEach(p => p.classList.toggle("on", p === panel));
    cur = b.dataset.p;
    try { sessionStorage.setItem("twdash-tab", cur); } catch (e) {}
    navPush();
    document.dispatchEvent(new CustomEvent("twdash:tab", { detail: cur }));
    if (!quiet) {
      /* panel content rises in one block after another; then the figures inside draw themselves */
      rise(Array.from(panel.children), 80);
      if (cur === "dpOverview") { rise($$(".ixcard", panel), 70); drawSpark(); const bx = $(".board", panel); if (bx) boardIn(bx, true); HEAT.sig = ""; paintHeat(true); paintStreak(true); paintFlagCard(true); }
      if (cur === "dpList") rise($$(".mtbl tbody tr", panel).slice(0, 24), 18, 200);
      if (cur === "dpWatch") { paintWatch(false); rise($$(".wcard", panel), 60, 80); }
      if (cur === "dpStock" && !same) { if (HIST.get(CODE)) drawChart(true); else setStock(CODE, true); }
    }
    rtPoll();
  }
  function drawSpark() {
    $$(".ixcard .spark").forEach((svg, i) => {
      const pp = $("path", svg); if (!pp || !pp.getAttribute("d")) return;
      svg.animate([{ clipPath: "inset(-4px 100% -4px 0)" }, { clipPath: "inset(-4px -4px -4px 0)" }], { duration: 900, delay: 400 + i * 80, easing: "ease-out", fill: "backwards" });
    });
  }

  tabs.forEach(b => b.addEventListener("click", () => open(b.dataset.p, true)));
  $(".dtabs").addEventListener("keydown", e => {
    const i = tabs.indexOf(document.activeElement); if (i < 0 || !/Arrow(Left|Right|Up|Down)/.test(e.key)) return;
    const n = tabs[(i + (/Right|Down/.test(e.key) ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click();
  });
  addEventListener("resize", () => { const b = tabs.find(t => t.getAttribute("aria-selected") === "true"); b && movePill(b, false); });
  root.addEventListener("keydown", e => {
    if (!e.target.matches) return;
    if (e.key === "Enter" && e.target.matches("tr[data-code], .wcard[data-code]")) e.target.click();
    if (/^(ArrowDown|ArrowUp|j|k)$/.test(e.key) && e.target.matches("tr[data-code]")) {
      e.preventDefault();
      const n = /ArrowDown|j/.test(e.key) ? e.target.nextElementSibling : e.target.previousElementSibling;
      if (n && n.matches("tr[data-code]")) { n.focus(); n.scrollIntoView({ block: "nearest" }); }
    }
  });
  /* ---------- right-click (or long-press) on any stock: open it, add it to 自選1–5, copy its code ---------- */
  let ctxEl = null, lp = null, swallow = false;
  const ctxClose = () => { if (ctxEl) { const el = ctxEl; ctxEl = null; el.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.96)" }], { duration: 120 }).onfinish = () => el.remove(); } };
  function ctxMenu(code, x, y) {
    ctxClose(); if (menuEl) { menuEl.remove(); menuEl = null; }
    const s = DB.by.get(code); if (!s) return;
    const el = document.createElement("div"); el.className = "ctxmenu"; el.setAttribute("role", "menu");
    const paint = () => {
      el.innerHTML = `<div class="cx-h"><b>${esc(s.name)}</b><i>${esc(code)}</i><em class="${tone(s.chg)}">${fmt(s.price, dig(s.price))}　${pct(s.pct)}</em></div>
        <button type="button" role="menuitem" data-a="open"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V5M5 19h14M8 15l4-5 3 3 4-6"/></svg>個股分析</button>
        <div class="cx-l">${LISTS.map((l, i) => `<button type="button" role="menuitemcheckbox" aria-checked="${l.includes(code)}" data-a="w" data-i="${i}">自選${i + 1}<i>${l.includes(code) ? "✓" : "＋"}</i></button>`).join("")}</div>
        <button type="button" role="menuitem" data-a="copy"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>複製代號</button>`;
    };
    paint(); document.body.appendChild(el); ctxEl = el;
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = clamp(x, 8, innerWidth - w - 8) + "px"; el.style.top = clamp(y, 8, innerHeight - h - 8) + "px";
    el.style.transformOrigin = `${x > innerWidth - w - 8 ? "right" : "left"} ${y > innerHeight - h - 8 ? "bottom" : "top"}`;
    el.animate([{ opacity: 0, transform: "scale(.92)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: "cubic-bezier(.16,1,.3,1)" });
    el.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return; e.stopPropagation();
      if (b.dataset.a === "open") { ctxClose(); openStock(code); }
      else if (b.dataset.a === "w") { toggleWatch(code, +b.dataset.i); paint(); }
      else if (b.dataset.a === "copy") { try { navigator.clipboard.writeText(code); } catch (er) {} b.lastChild.textContent = "已複製"; setTimeout(ctxClose, 500); }
    });
    $("button", el).focus({ preventScroll: true });
  }
  const codeAt = t => { const el = t.closest && t.closest("[data-code]"); return el && DB.by.has(el.dataset.code) ? el : null; };
  document.addEventListener("contextmenu", e => { const el = codeAt(e.target); if (!el || !el.closest("#dash")) return; e.preventDefault(); ctxMenu(el.dataset.code, e.clientX, e.clientY); });
  document.addEventListener("pointerdown", e => {
    if (ctxEl && !e.target.closest(".ctxmenu")) ctxClose();
    if (e.pointerType !== "touch") return;
    const el = codeAt(e.target); if (!el || !el.closest("#dash")) return;
    lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { swallow = true; if (navigator.vibrate) navigator.vibrate(12); ctxMenu(el.dataset.code, lp.x, lp.y); }, 520) };
  }, true);
  document.addEventListener("pointermove", e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) { clearTimeout(lp.t); lp = null; } }, { passive: true });
  document.addEventListener("pointerup", () => { if (lp) { clearTimeout(lp.t); lp = null; } });
  document.addEventListener("click", e => { if (swallow) { swallow = false; if (!e.target.closest(".ctxmenu")) { e.preventDefault(); e.stopPropagation(); } } }, true);
  document.addEventListener("keydown", e => { if (e.key === "Escape") ctxClose(); });
  addEventListener("scroll", ctxClose, { passive: true });

  /* ---------- the command palette (Ctrl+K): any stock, any tab, light / dark ---------- */
  let pal = null;
  const PAGES = [["dpOverview", "總覽", "大盤、國際行情"], ["dpChip", "籌碼", "籌碼溫度、法人、融資融券、注意股"], ["dpInd", "產業", "類股熱力圖、產業輪動、族群"], ["dpList", "股票", "清單與自選1–5、點股票看個股分析"], ["dpHold", "持股與損益", "持股、損益、風險"], ["dpPre", "分析", "收盤摘要、盤前與盤中分析"], ["dpRev", "復盤", "預測對帳與命中率"], ["dpCal", "市場日曆", "除權息、股東會、結算日"]];
  function palOpen() {
    if (pal) { $("input", pal).focus(); return; }
    pal = document.createElement("div"); pal.className = "pal"; pal.setAttribute("role", "dialog"); pal.setAttribute("aria-modal", "true"); pal.setAttribute("aria-label", "搜尋");
    pal.innerHTML = `<div class="pal-box"><div class="pal-in"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="text" placeholder="代號、名稱或頁面…" aria-label="搜尋股票或頁面" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div><div class="pal-list" role="listbox"></div><p class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 選擇</span><span><kbd>Enter</kbd> 開啟</span><span>右鍵任何股票可加自選</span></p></div>`;
    document.body.appendChild(pal);
    const inp = $("input", pal), list = $(".pal-list", pal);
    let items = [], on = 0;
    const T = window.__twTheme;
    const paint = () => {
      const q = inp.value.trim().toLowerCase();
      const row = (k, ic, a, b, c, cls) => `<button type="button" role="option" class="pal-it" data-k="${esc(k)}"><span class="pi-ic">${ic}</span><b>${a}</b><span class="pi-sub">${b}</span>${c ? `<em class="${cls || ""}">${c}</em>` : ""}</button>`;
      const stk = s => ({ k: "s:" + s.code, h: row("s:" + s.code, esc(s.code), esc(s.name), FLAGS.get(s.code) ? flagTag(s.code) : s.mkt === "otc" ? "上櫃" : s.mkt === "esb" ? "興櫃" : "上市", `${fmt(s.price, dig(s.price))}　${pct(s.pct)}`, tone(s.chg)) });
      let stocks;
      let wl = [];
      if (!q) { stocks = (store.get("twrecent", []) || []).map(c => DB.by.get(c)).filter(Boolean).slice(0, 4); wl = WATCH.map(c => DB.by.get(c)).filter(s => s && !stocks.includes(s)).slice(0, 4); }
      else stocks = DB.list.filter(s => s.code.toLowerCase().startsWith(q) || s.name.toLowerCase().includes(q))
        .sort((a, b) => (b.code.toLowerCase() === q) - (a.code.toLowerCase() === q) || (b.code.toLowerCase().startsWith(q)) - (a.code.toLowerCase().startsWith(q)) || b.vol - a.vol).slice(0, 8);
      const pages = PAGES.filter(p => !q || p[1].toLowerCase().includes(q) || p[2].toLowerCase().includes(q)).map(p => ({ k: "p:" + p[0], h: row("p:" + p[0], "→", p[1], p[2]) }));
      const QA = [["a:settings", "開啟設定", "⚙"], ["a:ud", "切換漲跌顏色（" + (window.TWSet && window.TWSet.get("ud") === "intl" ? "目前綠漲紅跌" : "目前紅漲綠跌") + "）", "◑"], ["a:top", "回到頂端", "↑"], ["a:install", "加到主畫面（安裝成 App）", "⤓"], ["a:ovl", "自訂總覽版面", "⇅"], ...[["rk", "股票・排行"], ["cp", "股票・比較"], ["sc", "股票・選股"], ["rv", "股票・營收"], ["cm", "股票・疊圖"], ["dv", "股票・除息"]].map(([k, l]) => ["l:" + k, l, "▤"])];
      const quick = QA.filter(a => !q || a[1].toLowerCase().includes(q)).slice(0, q ? 6 : 5).map(a => ({ k: a[0], h: row(a[0], a[2], a[1], "") }));
      const acts = [["t:dark", "深色模式"], ["t:light", "淺色模式"], ["t:system", "外觀跟隨裝置"]].filter(a => !q || a[1].includes(q) || /dark|light|theme|深|淺|外觀/.test(q)).map(a => ({ k: a[0], h: row(a[0], "◐", a[1], T && T.mode === a[0].slice(2) ? "目前" : "") }));
      const sec = (t, arr) => (arr.length ? `<p class="pal-sec">${t}</p>` + arr.map(x => x.h).join("") : "");
      items = [...stocks.map(stk), ...wl.map(stk), ...pages, ...quick, ...(q ? acts : [])];
      list.innerHTML = sec(q ? "股票" : "最近看過", stocks.map(stk)) + sec("自選股", wl.map(stk)) + sec("頁面", pages) + sec("快速動作", quick) + (q ? sec("外觀", acts) : "") || `<p class="pal-empty">找不到「${esc(inp.value)}」。試試代號，例如 2330。</p>`;
      on = clamp(on, 0, Math.max(0, items.length - 1)); mark();
    };
    const mark = () => { $$(".pal-it", list).forEach((b, i) => { b.classList.toggle("on", i === on); b.setAttribute("aria-selected", String(i === on)); }); const b = $$(".pal-it", list)[on]; b && b.scrollIntoView({ block: "nearest" }); };
    const run = k => {
      palClose();
      if (k.startsWith("s:")) openStock(k.slice(2));
      else if (k.startsWith("p:")) open(k.slice(2), true);
      else if (k.startsWith("t:") && T) T.set(k.slice(2));
      else if (k === "a:settings") document.dispatchEvent(new Event("twdash:settings"));
      else if (k === "a:ud") { if (window.TWSet) window.TWSet.set("ud", window.TWSet.get("ud") === "intl" ? "tw" : "intl"); }
      else if (k === "a:top") scrollTo({ top: 0, behavior: "smooth" });
      else if (k === "a:install") document.dispatchEvent(new Event("twdash:install"));
      else if (k === "a:ovl") { open("dpOverview", true); setTimeout(() => document.dispatchEvent(new Event("twdash:overview-edit")), 120); }
      else if (k.startsWith("l:")) { open("dpList", true); setTimeout(() => lstSub(k.slice(2), true), 60); }
    };
    inp.addEventListener("input", () => { on = 0; paint(); });
    inp.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); on = clamp(on + (e.key === "ArrowDown" ? 1 : -1), 0, items.length - 1); mark(); }
      else if (e.key === "Enter") { e.preventDefault(); const b = $$(".pal-it", list)[on]; if (b) run(b.dataset.k); }
      else if (e.key === "Escape") { e.preventDefault(); palClose(); }
    });
    list.addEventListener("pointermove", e => { const b = e.target.closest(".pal-it"); if (!b) return; const i = $$(".pal-it", list).indexOf(b); if (i !== on) { on = i; mark(); } });
    list.addEventListener("click", e => { const b = e.target.closest(".pal-it"); if (b) run(b.dataset.k); });
    pal.addEventListener("pointerdown", e => { if (e.target === pal) palClose(); });
    paint();
    pal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
    $(".pal-box", pal).animate([{ opacity: 0, transform: "translateY(-10px) scale(.97)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "none" }], { duration: 260, easing: "cubic-bezier(.16,1,.3,1)" });
    inp.focus();
  }
  function palClose() {
    if (!pal) return; const el = pal; pal = null;
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120 }).onfinish = () => el.remove();
  }
  document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); pal ? palClose() : palOpen(); } });
  document.addEventListener("twdash:palette", palOpen);
  let help = null;
  function helpToggle() {
    if (help) { const el = help; help = null; el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120 }).onfinish = () => el.remove(); return; }
    help = document.createElement("div"); help.className = "pal"; help.setAttribute("role", "dialog"); help.setAttribute("aria-label", "快捷鍵");
    const K = [["Ctrl", "K"], ["/"], ["1"], ["2"], ["3"], ["↑", "↓"], ["Enter"], ["右鍵"], ["拖曳"], ["滾輪"], ["雙擊"], ["Esc"], ["?"]];
    const T = ["搜尋股票、切換頁面或外觀", "跳到搜尋框", "總覽", "分析", "股票", "在股票清單上下移動", "打開選到的股票", "任何股票：開啟、加自選、複製代號（手機長按）", "K 線：平移（開啟「趨勢線」時改成畫線）", "K 線：縮放", "K 線：還原", "關閉面板或選單", "顯示這張表"];
    help.innerHTML = `<div class="pal-box keys"><div class="pal-in"><b>快捷鍵</b><button type="button" class="key-x" aria-label="關閉"><kbd>Esc</kbd></button></div><div class="pal-list">${K.map((k, i) => `<div class="key-row"><span>${k.map(x => `<kbd>${x}</kbd>`).join(" ")}</span><span>${T[i]}</span></div>`).join("")}</div></div>`;
    document.body.appendChild(help);
    help.addEventListener("pointerdown", e => { if (e.target === help) helpToggle(); });
    $(".key-x", help).addEventListener("click", helpToggle);
    $(".pal-box", help).animate([{ opacity: 0, transform: "translateY(-10px) scale(.97)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "none" }], { duration: 260, easing: "cubic-bezier(.16,1,.3,1)" });
  }
  document.addEventListener("keydown", e => {
    if (help && (e.key === "Escape" || e.key === "Esc")) { e.preventDefault(); helpToggle(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || pal) return;
    const t = e.target; if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "")) return;
    if (e.key === "?") { e.preventDefault(); helpToggle(); return; }
    if (/^[1-3]$/.test(e.key) && !help) { e.preventDefault(); open(PAGES[+e.key - 1][0], true); }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { rtPoll(); pmLoad(); pmLoad(true); clLoad(); } });
  /* "/" jumps to the search box from anywhere: the stock page's own box there, the list's everywhere else */
  document.addEventListener("keydown", e => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || "")) return;
    e.preventDefault();
    if (cur !== "dpStock" && cur !== "dpList") open("dpList", true);
    const inp = cur === "dpStock" ? $("#dpStock .ssearch") : $("#dpList .msearch");
    if (inp) { inp.focus(); inp.select(); }
  });

  /* ---------------- start ---------------- */
  buildOverview(); buildWatch(); buildStock();
  note(); paintIdx(); paintStrip(); paintTable(false); paintWatch(false); paintHead();
  let saved = null; try { saved = sessionStorage.getItem("twdash-tab"); } catch (e) {}
  requestAnimationFrame(() => {
    if (/^#(stock\/[0-9A-Z]{4,6}|\/?dp\w+)$/.test(location.hash)) { navGo(location.hash); try { history.replaceState({ tw: 1, p: cur, code: CODE }, "", navHash()); } catch (e) {} }
    else { navLock = true; open(saved || ((window.TWSet && window.TWSet.get("home")) || "dpOverview"), false); navLock = false; try { history.replaceState({ tw: 1, p: cur, code: CODE }, "", navHash()); } catch (e) {} }
  });
  window.TWDash = { replay: () => open(cur, false),
    /* shared with the 研究室 tab (assets/twlab.js) */
    api: { chartC: () => KV.c, listCodes: () => LISTS[listIdx()].slice(), canSort: () => /^w[1-5]$/.test(VIEW.preset) && VIEW.key === "ord" && !VIEW.q,
      setOrder: codes => { const i = listIdx(); LISTS[i] = codes.slice(); WATCH = LISTS[0]; saveLists(); if (i === 0) { alertSync(); paintTape(); } paintWatch(false); paintTable(false); },
      rowStar: code => { const i = listIdx(), had = LISTS[i].includes(code); toggleWatch(code, i); return !had; }, goBackNow: () => { const b = $("#dpStock .sback"); if (b && !b.hidden) b.click(); return !!(b && !b.hidden); }, whyOf, paintHeat, gpPaint, instLoad, ftLoad, paintStreak, heatGroups, heatTip, heatFocus, segMark, DB, FUND, CHIP, IDX, HIST, calc, sma, histMonth, loadHist, loadFund, loadChip, monthsBack, facts: code => { const h = HIST.get(code); if (!h) return null; const k = CODE; CODE = code; try { return facts(h.cs); } finally { CODE = k; } },
      refresh: () => Promise.all([rtPoll(), pmLoad(), pmLoad(true), clLoad()]).then(() => open(cur, true)),
      rtPoll, quoteNow,
      store, worker: WORKER, openTab: p => open(p, true), lstSub: k => lstSub(k, true), tabNow: () => cur, ixk: () => IXV.k, openStock: code => openStock(code), toast: (code, lv) => { const x = DB.by.get(code); if (x) toast(x, lv); }, code: () => CODE, watch: () => WATCH.slice(), J, num, esc, fmt, signed, pct, tone, dig, wait, rise } };
  document.dispatchEvent(new Event("twdash:ready"));

  (async () => {
    try { await loadList(); } catch (e) { DB.failed = true; setList([], false, ""); }
    note(); paintTable(true); paintStrip(); paintWatch(true); paintHead(); paintHeat(true); paintTape();
    if (cur === "dpStock") setStock(CODE, true);
    loadFlags();
    document.dispatchEvent(new Event("twdash:list"));
    alertSync();
    if (DB.live) {
      loadIdxEod().then(paintIdx, () => {}).then(paintIdx);
      loadMarket().then(() => { paintIdx(); paintStrip(); if (cur === "dpOverview") drawSpark(); setTimeout(loadStreak, 800); }, () => {});
      rtLoop();
    } else paintIdx();
  })();
})();
} catch (e) { setTimeout(() => { throw e; }, 0); }
/* ===== twapp.js ===== */
try {
/* TWstock app shell: builds the floating bottom pill from the dashboard tabs.
   The pill is a view of the existing .dtabs, so clicking it runs the same tab switch. */
(function () {
  var ICONS = {
    dpOverview: '<path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    dpPre: '<path d="M12 3v2M5.6 5.6l1.4 1.4M3 12h2M19 12h2M17 7l1.4-1.4"/><path d="M7 16a5 5 0 0 1 10 0"/><path d="M3 20h18"/>',
    dpMid: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    dpList: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    dpWatch: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    dpChip: '<path d="M4 18V9M10 18V5M16 18v-7M21 18H3"/><circle cx="19" cy="6" r="2"/>',
    dpInd: '<rect x="3.5" y="3.5" width="7" height="9" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.5"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.5"/><rect x="3.5" y="15.5" width="7" height="5" rx="1.5"/>',
    dpRev: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4.5h4.5"/><path d="M12 8v4.5l3 1.5"/>',
    dpStock: '<path d="M6 4v4M6 12v8M12 6v10M18 3v5M18 12v9"/>',
    dpAlert: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    dpHold: '<rect x="3.5" y="7" width="17" height="12" rx="2.5"/><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3.5 12.5h17"/>',
    dpCal: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    dpLab: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 15h9"/>',
  };
  var DEFAULT_ICON = '<circle cx="12" cy="12" r="3"/>';

  function init() {
    var tabs = document.querySelector('.dtabs');
    if (!tabs || document.querySelector('.apppill')) return;
    var all = Array.prototype.slice.call(tabs.querySelectorAll('button[role="tab"]'));
    /* a hidden tab (個股分析) has no button of its own: it lights the tab it belongs under (data-under) */
    var real = all.filter(function (t) { return !t.hidden; });
    if (!real.length) return;

    var nav = document.createElement('nav');
    nav.className = 'apppill';
    nav.setAttribute('aria-label', '主要導覽');
    var hl = document.createElement('i');
    hl.className = 'ap-hl';
    nav.appendChild(hl);

    var items = real.map(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ap-item';
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[t.dataset.p] || DEFAULT_ICON) + '</svg><span></span>';
      b.querySelector('span').textContent = t.textContent.trim();
      b.addEventListener('click', function () { t.click(); });
      nav.appendChild(b);
      return b;
    });
    document.body.appendChild(nav);

    function place() {
      var sel = all.find(function (t) { return t.getAttribute('aria-selected') === 'true'; });
      var key = sel ? (sel.hidden ? sel.dataset.under : sel.dataset.p) : '';
      var idx = real.findIndex(function (t) { return t.dataset.p === key; });
      if (idx < 0) idx = 0;
      items.forEach(function (b, i) { b.setAttribute('aria-current', i === idx ? 'true' : 'false'); });
      var target = items[idx];
      if (target) {
        hl.style.width = target.offsetWidth + 'px';
        hl.style.transform = 'translateX(' + target.offsetLeft + 'px)';
        /* eight tabs do not all fit on a phone: bring the chosen one into view */
        if (nav.scrollWidth > nav.clientWidth + 2) nav.scrollTo({ left: Math.max(0, target.offsetLeft - (nav.clientWidth - target.offsetWidth) / 2), behavior: 'smooth' });
      }
    }

    var mo = new MutationObserver(place);
    all.forEach(function (t) { mo.observe(t, { attributes: true, attributeFilter: ['aria-selected'] }); });
    window.addEventListener('resize', place);
    place();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
} catch (e) { setTimeout(() => { throw e; }, 0); }
/* ===== twui.js ===== */
try {
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
    /* search and 設定 (light / dark is inside 設定) */
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
    requestAnimationFrame(place);
    addEventListener("resize", place);
  }
  function tickClock() {
    const t = taipei(), [s, label] = session();
    $$(".statuschip:not(.futchip):not(.uschip)").forEach(c => { c.dataset.s = s; const ss = $(".ss", c); if (ss) ss.textContent = label; const tt = $(".tt", c); if (tt) tt.textContent = t.hms; });
    const [fk, fl] = futSess();
    $$(".statuschip:not(.futchip):not(.uschip)").forEach(c => {
      let f = c.nextElementSibling && c.nextElementSibling.classList.contains("futchip") ? c.nextElementSibling : null;
      if (!fk || fk === "closed") { if (f) f.remove(); return; }
      if (!f) { f = document.createElement("span"); f.className = "statuschip futchip"; f.innerHTML = "<i></i><span class=\"ss\"></span>"; c.after(f); }
      const ss = $(".ss", f), tx = "台指期" + fl; f.dataset.s = fk; if (ss.textContent !== tx) ss.textContent = tx;
    });
    /* 美股盤中: a third chip while the NYSE regular session is open */
    const us = !!(window.TWSet && window.TWSet.usOpen());
    $$(".statuschip:not(.futchip):not(.uschip)").forEach(c => {
      const base = c.nextElementSibling && c.nextElementSibling.classList.contains("futchip") ? c.nextElementSibling : c;
      let u = base.nextElementSibling && base.nextElementSibling.classList.contains("uschip") ? base.nextElementSibling : null;
      if (!us) { if (u) u.remove(); return; }
      if (!u) { u = document.createElement("span"); u.className = "statuschip uschip"; u.dataset.s = "night"; u.innerHTML = "<i></i><span class=\"ss\">美股盤中</span>"; base.after(u); }
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
    /* how hard the market moves sets how strongly (and how fast) the backdrop breathes */
    root.style.setProperty("--mood", Math.max(0, Math.min(1, Math.abs(p) / 2.5)).toFixed(3));
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
    if (window.TWSet && window.TWSet.calm()) { el.textContent = text; return; }
    const d = decs(text), t0 = performance.now(), dur = 700, prefix = text.match(/^[^\d-]*/)[0], suffix = text.match(/[^\d.,]*$/)[0];
    RUN.add(el);
    const nf = new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); el.style.willChange = "contents";
    const step = now => {
      if (el.dataset.txt && el.dataset.txt !== text) { RUN.delete(el); return; }   /* a newer quote arrived: let it stand */
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = from + (to - from) * e;
      el.textContent = k < 1 ? prefix + nf.format(v) + suffix : text;
      if (k < 1) requestAnimationFrame(step); else { RUN.delete(el); el.style.willChange = ""; }
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
      /* the same quote ticking by a little: odometer; a big jump, another stock or a first value: count */
      if (prev.who === who && prev.text && prev.text.length === text.length && Math.abs(v - from) / Math.max(1, Math.abs(from)) < 0.05) roll(el, prev.text, text, v > from); else countTo(el, from, v, text);
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
  const LOADING = /^(載入中…?|載入走勢…)$/;
  function scanSkeletons() {
    $$(".app p, .app .mempty, .app .sub, .app .big, .app td, .side .sb-empty").forEach(el => {
      if (el.children.length > 1) return;
      const t = el.textContent.trim(), loading = LOADING.test(t) || (el.classList.contains("big") && t === "—" && A && !A.DB.list.length);
      const was = el.classList.contains("skel");
      el.classList.toggle("skel", loading);
      /* data arrived: the real content melts in where the bars were */
      if (was && !loading && el.isConnected) el.animate([{ opacity: 0, filter: "blur(6px)", transform: "translateY(6px)" }, { opacity: 1, filter: "none", transform: "none" }], { duration: 520, easing: "cubic-bezier(.16,1,.3,1)" });
      if (loading && (el.tagName === "P" || el.classList.contains("mempty"))) el.classList.add("block"); else el.classList.remove("block");
    });
  }

  /* ---------- tilt and sheen on cards ---------- */
  const TILT = ".ixcard, .wcard, .pmf, .aiteam > .dcard, .aiscen > .dcard, .lcard, .snap, .mcell, .aiorder, .pmchance > div";
  function tilt(e) {
    if (window.TWSet && window.TWSet.calm()) return;
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
    const a = dot.animate([{ transform: "scale(.15)", opacity: 0.5 }, { transform: "scale(1)", opacity: 0 }], { duration: 650, easing: "cubic-bezier(.16,1,.3,1)" });
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
    if (window.TWSet && window.TWSet.calm()) return;
    const cv = document.createElement("canvas"); cv.className = "bgfx"; cv.setAttribute("aria-hidden", "true");
    document.body.insertBefore(cv, document.body.firstChild.nextSibling);
    const ctx = cv.getContext("2d"); let W = 0, H = 0, dpr = 1;
    const size = () => { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size(); addEventListener("resize", size);
    const rnd = (a, b) => a + Math.random() * (b - a), COLORS = () => { const cs = getComputedStyle(root); return ["--ring-a", "--ring-b", "--ring-c", "--color-up", "--color-down"].map(k => cs.getPropertyValue(k).trim()); };
    /* one pre-drawn glow per colour, instead of building a new gradient for every particle in every frame */
    const glows = new Map(), glow = c => {
      let s = glows.get(c); if (s) return s;
      s = document.createElement("canvas"); s.width = s.height = 64;
      const x = s.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, c); g.addColorStop(1, "transparent"); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      glows.set(c, s); return s;
    };
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
      if (document.hidden || now - last < 30) return;   /* 30 frames a second is enough for slow drifting glows, and every redraw makes the blurred cards behind it repaint */
      const dt = Math.min(50, now - last); last = now;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = root.dataset.theme === "light" ? "source-over" : "lighter";
      P.forEach(p => {
        p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; p.tw += dt / 600;
        if (p.y < -10) { p.y = H + 10; p.x = rnd(0, W); } if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
        const a = 0.35 + 0.35 * Math.sin(p.tw), d = p.r * 12;
        ctx.globalAlpha = a; ctx.drawImage(glow(pal[p.c]), p.x - d / 2, p.y - d / 2, d, d);
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
    setInterval(() => { if (!document.hidden) tickClock(); }, 1000);
    ["twdash:live", "twdash:list", "twdash:tab"].forEach(n => document.addEventListener(n, () => setTimeout(paintSide, 0)));
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
} catch (e) { setTimeout(() => { throw e; }, 0); }
/* ===== twplay.js ===== */
try {
/* TWstock interaction layer: gestures, touch feedback and playable numbers / charts.
   - swipe left / right on the page switches tabs (phones and tablets), the page follows the finger
   - pull down at the top refreshes quotes and the AI notes
   - swipe a row of the stock list left to add it to / remove it from a 自選 list
   - press feedback on buttons and cards, with a short vibration where the device supports it
   - numbers roll digit by digit when a quote changes; rows of the ranking lists open a small inline chart
   - every switch (bottom pill, 分析 sub-tabs, filters) can be pressed and dragged: the highlight lifts and follows the finger
   Reads the dashboard through window.TWDash.api and drives it only by clicking its own controls. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const touchy = matchMedia("(hover: none), (pointer: coarse)").matches;
  let A = null;
  const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };

  /* ---------- tabs in order, and which one is on ---------- */
  const tabs = () => $$('.dtabs button[role="tab"]').filter(t => !t.hidden);
  const curIdx = () => { const s = $('.dtabs button[aria-selected="true"]'), k = s ? (s.hidden ? s.dataset.under : s.dataset.p) : ""; return Math.max(0, tabs().findIndex(t => t.dataset.p === k)); };
  const panelOn = () => $(".dpanel.on") || $(".dpanel:not([hidden])");

  /* ---------- 1. swipe between tabs ---------- */
  function swipeTabs() {
    let sx = 0, sy = 0, st = 0, dir = 0, on = false, pnl = null, edge = null;
    const skip = el => el.closest("input, textarea, select, .hm, .kchart, .ixfig, svg, .mwrap, .chips, .hmseg, .dtabs, .apppill, .pmpgrid, .plan, .tape, .ticker, [data-noswipe], .hmcard, .pal, .ctxmenu");
    document.addEventListener("touchstart", e => {
      if (e.touches.length !== 1 || skip(e.target)) { on = false; return; }
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); dir = 0; on = true; pnl = panelOn();
    }, { passive: true });
    document.addEventListener("touchmove", e => {
      if (!on) return;
      const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (!dir) { if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return; dir = Math.abs(dx) > Math.abs(dy) * 1.4 ? 1 : 2; }
      if (dir !== 1 || !pnl) return;
      const i = curIdx(), n = tabs().length, blocked = (dx > 0 && i === 0) || (dx < 0 && i === n - 1);
      const k = blocked ? dx * 0.18 : dx * 0.55;
      pnl.style.transition = "none"; pnl.style.transform = `translateX(${k}px)`; pnl.style.opacity = String(1 - Math.min(Math.abs(k) / 600, 0.35));
      if (!edge) { edge = document.createElement("div"); edge.className = "swedge"; document.body.appendChild(edge); }
      const nxt = tabs()[i + (dx < 0 ? 1 : -1)];
      edge.className = "swedge " + (dx < 0 ? "r" : "l") + (Math.abs(dx) > 80 && !blocked ? " go" : "");
      edge.textContent = nxt && !blocked ? (dx < 0 ? nxt.textContent.trim() + " ›" : "‹ " + nxt.textContent.trim()) : "";
      edge.style.opacity = String(Math.min(Math.abs(dx) / 80, 1));
    }, { passive: true });
    document.addEventListener("touchend", e => {
      if (!on) return; on = false;
      if (edge) { edge.remove(); edge = null; }
      if (dir !== 1 || !pnl) return;
      const t = e.changedTouches[0], dx = t.clientX - sx, fast = Math.abs(dx) > 50 && Date.now() - st < 280;
      const i = curIdx(), list = tabs(), j = i + (dx < 0 ? 1 : -1);
      const back = () => { pnl.style.transition = "transform .35s cubic-bezier(.2,.9,.3,1), opacity .35s"; pnl.style.transform = ""; pnl.style.opacity = ""; setTimeout(() => { pnl.style.transition = ""; }, 400); };
      if ((Math.abs(dx) > 90 || fast) && list[j]) {
        buzz(8);
        pnl.style.transition = "transform .18s cubic-bezier(.23,1,.32,1), opacity .18s"; pnl.style.transform = `translateX(${dx < 0 ? -60 : 60}px)`; pnl.style.opacity = "0";
        const old = pnl;
        setTimeout(() => { old.style.transition = ""; old.style.transform = ""; old.style.opacity = ""; list[j].click();
          const np = panelOn(); if (np && np !== old) np.animate([{ transform: `translateX(${dx < 0 ? 50 : -50}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 320, easing: "cubic-bezier(.16,1,.3,1)" }); }, 170);
      } else back();
    }, { passive: true });
  }

  /* ---------- 2. pull down to refresh ---------- */
  function pullRefresh() {
    let sy = 0, on = false, d = 0, busy = false;
    const ring = document.createElement("div");
    ring.className = "ptr"; ring.innerHTML = '<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="14"/><path d="M18 4a14 14 0 0 1 14 14"/></svg><span>放開更新</span>';
    document.body.appendChild(ring);
    const set = v => { ring.style.transform = `translate(-50%, ${Math.min(v, 90) - 60}px) rotate(${v * 3}deg)`; ring.style.opacity = String(Math.min(v / 70, 1)); ring.classList.toggle("ready", v > 75); };
    document.addEventListener("touchstart", e => { if (busy || scrollY > 2 || e.touches.length !== 1 || e.target.closest("input, textarea, .hm, .kchart, .ixfig, .hmcard, .pal")) { on = false; return; } sy = e.touches[0].clientY; d = 0; on = true; }, { passive: true });
    document.addEventListener("touchmove", e => { if (!on) return; d = (e.touches[0].clientY - sy) * 0.5; if (d <= 0 || scrollY > 2) { set(0); return; } set(d); }, { passive: true });
    document.addEventListener("touchend", async () => {
      if (!on) return; on = false;
      if (d > 75 && A && A.refresh) {
        busy = true; buzz([10, 40, 10]); ring.classList.add("spin"); set(80);
        try { await A.refresh(); } catch (e) {}
        await new Promise(r => setTimeout(r, 500));
        ring.classList.remove("spin"); busy = false;
      }
      ring.style.transition = "transform .35s, opacity .35s"; set(0); setTimeout(() => { ring.style.transition = ""; }, 380);
    }, { passive: true });
  }

  /* ---------- 3. swipe a stock row left: add to / remove from 自選 ---------- */
  function swipeRows() {
    let row = null, sx = 0, sy = 0, dir = 0, dx = 0, tag = null;
    document.addEventListener("touchstart", e => {
      const r = e.target.closest("#dpList tr[data-code]"); row = null; if (!r || e.touches.length !== 1) return;
      row = r; sx = e.touches[0].clientX; sy = e.touches[0].clientY; dir = 0; dx = 0;
    }, { passive: true });
    document.addEventListener("touchmove", e => {
      if (!row) return;
      const t = e.touches[0]; dx = Math.min(0, t.clientX - sx); const dy = t.clientY - sy;
      if (!dir) { if (Math.abs(t.clientX - sx) < 10 && Math.abs(dy) < 10) return; dir = Math.abs(t.clientX - sx) > Math.abs(dy) * 1.3 && t.clientX < sx ? 1 : 2; }
      if (dir !== 1) { row = null; return; }
      const btn = $(".wlbtn", row), adding = !btn || btn.classList.contains("wladd");
      if (!tag) { tag = document.createElement("div"); tag.className = "rowact"; document.body.appendChild(tag); }
      const rr = row.getBoundingClientRect();
      tag.style.top = rr.top + "px"; tag.style.height = rr.height + "px"; tag.style.width = Math.max(0, -dx) + "px";
      tag.className = "rowact " + (adding ? "add" : "del") + (dx < -90 ? " go" : "");
      tag.textContent = -dx > 40 ? (adding ? "＋ 自選" : "－ 移除") : "";
      row.style.transition = "none"; row.style.transform = `translateX(${dx * 0.6}px)`;
    }, { passive: true });
    document.addEventListener("touchend", () => {
      if (!row) return;
      const r = row, go = dir === 1 && dx < -90; row = null;
      if (tag) { const t = tag; tag = null; t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220 }).onfinish = () => t.remove(); }
      r.style.transition = "transform .35s cubic-bezier(.2,.9,.3,1.2)"; r.style.transform = ""; setTimeout(() => { r.style.transition = ""; }, 400);
      if (go) { buzz(12); const b = $(".wlbtn", r); if (b) b.click(); }
    }, { passive: true });
  }

  /* ---------- 4. press feedback: a springy push on buttons and cards, a tick of vibration ---------- */
  function pressFeel() {
    const SEL = "button, .btn, .chip, .dcard[role=button], .ixcard, .bd-row, .hmt, tr[data-code], .sb-row, .wcard, .pal-it";
    document.addEventListener("pointerdown", e => {
      const el = e.target.closest(SEL); if (!el || el.disabled) return;
      el.classList.add("pressing");
      if (e.pointerType !== "mouse" && el.matches("button, .btn, .chip, .apppill a, .apppill button")) buzz(6);
      const up = () => { el.classList.remove("pressing"); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); };
      addEventListener("pointerup", up); addEventListener("pointercancel", up);
    }, { passive: true });
  }

  /* ---------- 6. numbers roll digit by digit when a quote changes ---------- */
  function rollNumbers() {
    const SEL = ".hmc-p b";
    const seen = new WeakMap();
    const roll = el => {
      const txt = el.textContent, prev = seen.get(el);
      if (txt === prev || el.dataset.rolling) return;
      seen.set(el, txt);
      if (prev == null || prev.length !== txt.length) return;
      const up = parseFloat(txt.replace(/,/g, "")) >= parseFloat(prev.replace(/,/g, ""));
      el.dataset.rolling = "1";
      el.innerHTML = [...txt].map((c, i) => c !== prev[i] && /\d/.test(c) ? `<span class="rd ${up ? "u" : "d"}"><i>${prev[i]}</i><i>${c}</i></span>` : c).join("");
      setTimeout(() => { if (el.querySelector(".rd")) el.textContent = txt; delete el.dataset.rolling; }, 700);
    };
    new MutationObserver(ms => ms.forEach(m => { const el = m.target.nodeType === 3 ? m.target.parentElement : m.target; if (el && el.matches && el.matches(SEL)) roll(el); }))
      .observe(document.body, { childList: true, characterData: true, subtree: true });
  }

  /* ---------- 7. ranking rows open a small inline chart instead of leaving the page ---------- */
  function rowPeek() {
    document.addEventListener("click", async e => {
      const go = e.target.closest(".peek .pk-go"); if (go) { e.stopPropagation(); A && A.openStock(go.dataset.code); return; }
      if (e.target.closest(".peek")) { e.stopPropagation(); return; }
      const row = e.target.closest(".bd-up .bd-row, .bd-down .bd-row, .bd-flag .bd-row, .bd-strk .bd-row");
      if (!row || !A) return;
      e.stopPropagation(); e.preventDefault();
      const open = row.nextElementSibling && row.nextElementSibling.classList.contains("peek") ? row.nextElementSibling : null;
      $$("#dpOverview .peek").forEach(p => { p.animate([{ opacity: 1, maxHeight: p.offsetHeight + "px" }, { opacity: 0, maxHeight: "0px" }], { duration: 220, easing: "cubic-bezier(.23,1,.32,1)" }).onfinish = () => p.remove(); });
      $$("#dpOverview .bd-row.peeking").forEach(r => r.classList.remove("peeking"));
      if (open) return;
      const s = A.DB.by.get(row.dataset.code); if (!s) return;
      row.classList.add("peeking"); buzz(6);
      const pk = document.createElement("div"); pk.className = "peek";
      const d = A.dig(s.price), tn = A.tone(s.chg);
      pk.innerHTML = `<div class="pk-chart"><svg viewBox="0 0 300 90" preserveAspectRatio="none"><path class="pk-ln" d=""/></svg><span class="pk-read sub">載入近 3 個月走勢…</span></div>
        <div class="pk-kv"><span>成交價</span><b class="${tn}">${A.fmt(s.price, d)}</b><span>漲跌幅</span><b class="${tn}">${A.pct(s.pct)}</b><span>成交量</span><b>${A.fmt(s.vol)} 張</b></div>
        <button type="button" class="btn pk-go" data-code="${A.esc(s.code)}">看個股 →</button>`;
      row.after(pk);
      pk.animate([{ opacity: 0, maxHeight: "0px" }, { opacity: 1, maxHeight: "200px" }], { duration: 320, easing: "cubic-bezier(.16,1,.3,1)" });
      /* about 3 months of closes, drawn left to right; drag a finger across to read a day */
      try {
        const got = await A.loadHist(s.code), h = A.HIST.get(s.code), cs = (Array.isArray(got) ? got : h && h.cs ? h.cs : []).slice(-63);
        if (cs.length < 2 || !pk.isConnected) throw 0;
        const cl = cs.map(c => c[4]), lo = Math.min(...cl), hi = Math.max(...cl), X = i => i / (cl.length - 1) * 300, Y = v => 84 - (v - lo) / (hi - lo || 1) * 78;
        const ln = $(".pk-ln", pk), rd = $(".pk-read", pk), svg = $("svg", pk);
        ln.setAttribute("d", cl.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(""));
        ln.classList.add(cl[cl.length - 1] >= cl[0] ? "up" : "down");
        const L = ln.getTotalLength(); ln.style.strokeDasharray = L; ln.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 800, easing: "ease-out", fill: "backwards" });
        const base = `近 3 個月 ${A.pct((cl[cl.length - 1] / cl[0] - 1) * 100)}`; rd.textContent = base;
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle"); dot.setAttribute("r", "3.5"); dot.setAttribute("class", "pk-dot"); dot.style.display = "none"; svg.appendChild(dot);
        const mv = ev => { const b = svg.getBoundingClientRect(), i = Math.round(Math.max(0, Math.min(1, (ev.clientX - b.left) / b.width)) * (cl.length - 1));
          dot.style.display = ""; dot.setAttribute("cx", X(i)); dot.setAttribute("cy", Y(cl[i])); rd.textContent = `${cs[i][0] ? String(cs[i][0]).replace(/^(\d{4})(\d{2})(\d{2})$/, "$2/$3") : ""}　${A.fmt(cl[i], d)}`; };
        svg.addEventListener("pointermove", mv); svg.addEventListener("pointerdown", mv);
        svg.addEventListener("pointerleave", () => { dot.style.display = "none"; rd.textContent = base; });
      } catch (err) { const rd = $(".pk-read", pk); if (rd) rd.textContent = "沒有走勢資料"; }
    }, true);
  }

  /* ---------- 6. every switch can be pressed and dragged: the highlight lifts like glass and follows the finger,
     the segment under it lights up, and letting go picks it (a plain tap still works as before) ---------- */
  const SEGS = [[".apppill", ".ap-item", ".ap-hl"], [".anasub", "[data-sub]", ":scope > i"], [".hmseg", "button", ":scope > i"], [".dtabs", 'button[role="tab"]', null]];
  function dragSeg() {
    document.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" && e.button) return;
      let box = null, itemSel, hlSel;
      for (const [b, i, h] of SEGS) { const x = e.target.closest(b); if (x) { box = x; itemSel = i; hlSel = h; break; } }
      if (!box) return;
      const btn = e.target.closest(itemSel); if (!btn || !box.contains(btn)) return;
      const items = () => $$(itemSel, box).filter(b => !b.hidden && b.offsetWidth), hl = hlSel ? $(hlSel, box) : null;
      const isCur = b => ["aria-selected", "aria-pressed", "aria-current"].some(a => b.getAttribute(a) === "true");
      const id = e.pointerId, x0 = e.clientX; let moved = false, hot = btn, lastX = x0;
      if (isCur(btn)) box.classList.add("lift");
      const under = x => { const it = items(); let best = it[0], bd = 1e9; it.forEach(b => { const r = b.getBoundingClientRect(), d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0; if (d < bd) { bd = d; best = b; } }); return best; };
      const snap = b => { if (!hl || !b) return; hl.style.width = b.offsetWidth + "px"; hl.style.transform = `translateX(${b.offsetLeft}px)`; };
      const light = b => { if (b === hot) return; $$(".hot", box).forEach(n => n.classList.remove("hot")); hot = b; b.classList.add("hot"); buzz(6); };
      const mv = ev => {
        if (ev.pointerId !== id) return; lastX = ev.clientX;
        if (!moved && Math.abs(ev.clientX - x0) > 5) { moved = true; box.classList.add("dragging"); box.classList.remove("lift"); }
        if (!moved) return;
        const it = items(), b = under(ev.clientX), br = box.getBoundingClientRect();
        light(b);
        if (hl) { const w = b.offsetWidth, lo = it[0].offsetLeft, hi = it[it.length - 1].offsetLeft + it[it.length - 1].offsetWidth - w;
          hl.style.width = w + "px"; hl.style.transform = `translateX(${Math.max(lo, Math.min(hi, ev.clientX - br.left + box.scrollLeft - w / 2))}px)`; }
        if (!hl && b !== btn && ev.pointerType) { /* no highlight to drag (top tabs): just preview */ }
      };
      const end = ev => {
        if (ev.pointerId !== id) return;
        removeEventListener("pointermove", mv); removeEventListener("pointerup", end); removeEventListener("pointercancel", end);
        box.classList.remove("lift", "dragging"); $$(".hot", box).forEach(n => n.classList.remove("hot"));
        if (!moved) return;
        const t = ev.type === "pointercancel" ? btn : under(ev.clientX != null ? ev.clientX : lastX);
        const stop = c => { if (c.isTrusted) { c.stopPropagation(); c.preventDefault(); } };
        addEventListener("click", stop, true); setTimeout(() => removeEventListener("click", stop, true), 80);
        snap(t); if (t && ev.type !== "pointercancel") t.click();
      };
      addEventListener("pointermove", mv); addEventListener("pointerup", end); addEventListener("pointercancel", end);
    });
  }

  function boot() {
    A = window.TWDash && window.TWDash.api;
    pressFeel(); rollNumbers(); rowPeek(); dragSeg();
    if (touchy) { swipeTabs(); pullRefresh(); swipeRows(); }
  }
  if (window.TWDash) boot(); else document.addEventListener("twdash:ready", boot, { once: true });
})();
} catch (e) { setTimeout(() => { throw e; }, 0); }
/* ===== twmore.js ===== */
try {
/* TWstock extras: 走勢疊圖 and 除權息日曆 (two more sub-tabs of 股票), the opening / closing ritual,
   swipe between watchlist stocks, pull to refresh and keyboard shortcuts. Everything reads from TWDash.api. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const ok = Number.isFinite, RM = false;
  let A = null;
  const taipei = () => { const d = new Date(Date.now() + 8 * 3600e3); return { wd: d.getUTCDay(), m: d.getUTCHours() * 60 + d.getUTCMinutes(), s: d.getUTCSeconds(), md: (d.getUTCMonth() + 1) + "/" + d.getUTCDate(), iso: d.toISOString().slice(0, 10) }; };

  /* ================= 走勢疊圖 ================= */
  const COL = ["#4c8bf5", "#e6a23c", "#9b59b6", "#16a085", "#e84393", "#7f8c8d"];
  const CM = { sel: null, span: 60 };
  function cmBuild(dl) {
    const card = document.createElement("div"); card.className = "dcard cm"; card.dataset.sub = "cm"; card.hidden = true;
    card.innerHTML = `<div class="aihead"><div><h3>走勢疊圖</h3></div><span class="sub cmn">起點＝0%</span></div>
      <div class="chips cmspan">${[[20, "20 日"], [60, "60 日"], [120, "120 日"]].map(([n, t]) => `<button type="button" class="chip" data-span="${n}">${t}</button>`).join("")}</div>
      <div class="chips cmpick"></div><div class="cmadd"><input class="in cmq" type="text" list="twstocks" autocomplete="off" placeholder="輸入代號或名稱，加入疊圖" aria-label="加入疊圖"></div><div class="cmout"><p class="sub">載入中…</p></div>`;
    dl.appendChild(card);
    $(".cmq", card).addEventListener("change", e => {
      const inp = e.target, v = inp.value.trim(); if (!v) return;
      const by = A.DB.by, tok = v.split(/\s+/)[0].toUpperCase(), hit = by.get(tok) || A.DB.list.find(x => x.name === v || x.code === tok) || A.DB.list.find(x => x.code.toUpperCase().startsWith(tok) || x.name.includes(v)) || (/^\d{4,6}[A-Z]?$/.test(tok) ? { code: tok } : null);
      if (!hit) { inp.classList.add("bad"); inp.animate([{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(5px)" }, { transform: "none" }], { duration: 260 }); setTimeout(() => inp.classList.remove("bad"), 600); return; }
      inp.value = ""; inp.dispatchEvent(new Event("input", { bubbles: true }));
      if (!CM.sel) CM.sel = [];
      if (CM.sel.includes(hit.code)) return;
      if (CM.sel.length >= 5) CM.sel.shift();
      CM.sel.push(hit.code); A.store.set("twmore-cmsel", CM.sel); cmPaint(true);
    });
    $(".cmq", card).addEventListener("keydown", e => { if (e.key === "Enter" && !e.defaultPrevented) { e.preventDefault(); e.target.dispatchEvent(new Event("change", { bubbles: true })); } });
    card.addEventListener("click", e => {
      const sp = e.target.closest("[data-span]"); if (sp) { CM.span = +sp.dataset.span; A.store.set("twmore-cmspan", CM.span); cmPaint(true); return; }
      const c = e.target.closest("[data-pick]"); if (!c) return;
      const k = c.dataset.pick, i = CM.sel.indexOf(k);
      if (i >= 0) CM.sel.splice(i, 1); else if (CM.sel.length < 5) CM.sel.push(k);
      A.store.set("twmore-cmsel", CM.sel); cmPaint(true);
    });
  }
  async function cmPaint(anim) {
    const card = $("#dpList .cm"); if (!card || card.hidden && !anim) return;
    const W = A.watch().slice(0, 12);
    if (!CM.sel || (!CM.sel.length && A.store.get("twmore-cmsel", null) == null)) CM.sel = (A.store.get("twmore-cmsel", null) || W.slice(0, 4)).filter(c => A.DB.by.get(c));
    CM.span = A.store.get("twmore-cmspan", CM.span);
    $$("[data-span]", card).forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.span === CM.span)));
    $(".cmpick", card).innerHTML = CM.sel.map((c, i) => `<button type="button" class="chip" data-pick="${A.esc(c)}" aria-pressed="true" style="--cmc:${COL[i % COL.length]}" aria-label="移除 ${A.esc((A.DB.by.get(c) || {}).name || c)}">${A.esc((A.DB.by.get(c) || {}).name || c)} <span aria-hidden="true">×</span></button>`).join("");
    const out = $(".cmout", card);
    if (!CM.sel.length) { out.innerHTML = `<p class="sub">輸入代號或名稱，加入 2–5 檔。</p>`; return; }
    const sets = await Promise.all(CM.sel.map(async c => { try { const got = await A.loadHist(c), h = A.HIST.get(c); const cs = (Array.isArray(got) ? got : h && h.cs ? h.cs : []).slice(-CM.span); return { c, cs }; } catch (e) { return { c, cs: [] }; } }));
    const ok2 = sets.filter(s => s.cs.length > 5); if (!ok2.length) { out.innerHTML = `<p class="sub">沒有資料。</p>`; return; }
    const n = Math.max(...ok2.map(s => s.cs.length)), series = ok2.map((s, i) => ({ ...s, i, v: s.cs.map(r => (r[4] / s.cs[0][4] - 1) * 100) }));
    const all = series.flatMap(s => s.v), lo = Math.min(0, ...all), hi = Math.max(0, ...all), sp = hi - lo || 1, Wd = 320, H = 170, X = k => 8 + k / (n - 1) * (Wd - 70), Y = v => 10 + (hi - v) / sp * (H - 24);
    const grid = [lo, 0, hi].map(v => `<line x1="8" x2="${Wd - 62}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="cmg${v === 0 ? " z" : ""}"/><text x="${Wd - 58}" y="${(Y(v) + 3).toFixed(1)}">${v.toFixed(0)}%</text>`).join("");
    const lines = series.map(s => `<polyline class="cml" style="stroke:${COL[CM.sel.indexOf(s.c) % COL.length]}" points="${s.v.map((v, k) => `${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}"/>`).join("");
    out.innerHTML = `<svg class="cmsvg" viewBox="0 0 ${Wd} ${H}" preserveAspectRatio="none" role="img" aria-label="走勢疊圖">${grid}${lines}</svg>
      <div class="cmleg">${series.sort((a, b) => b.v[b.v.length - 1] - a.v[a.v.length - 1]).map(s => { const v = s.v[s.v.length - 1]; return `<span><i style="background:${COL[CM.sel.indexOf(s.c) % COL.length]}"></i>${A.esc((A.DB.by.get(s.c) || {}).name || s.c)} <b class="${A.tone(v)}">${v > 0 ? "+" : ""}${v.toFixed(1)}%</b></span>`; }).join("")}</div>`;
    if (!RM) $$(".cml", out).forEach((p, i) => { const L = p.getTotalLength ? p.getTotalLength() : 600; p.style.strokeDasharray = L; p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 900, delay: i * 120, easing: "ease-out", fill: "backwards" }).onfinish = () => { p.style.strokeDasharray = ""; }; });
  }

  /* ================= 除權息日曆 ================= */
  let DVROWS = null;
  function dvBuild(dl) {
    const card = document.createElement("div"); card.className = "dcard dv"; card.dataset.sub = "dv"; card.hidden = true;
    card.innerHTML = `<div class="aihead"><div><h3>除權息日曆</h3></div><span class="sub dvn"></span></div><div class="chips dvseg"><button type="button" class="chip" data-dv="w" aria-pressed="true">自選股</button><button type="button" class="chip" data-dv="a" aria-pressed="false">全部</button></div><div class="dvout"><p class="sub">載入中…</p></div>`;
    dl.appendChild(card);
    card.addEventListener("click", e => {
      const b = e.target.closest("[data-dv]"); if (b) { $$("[data-dv]", card).forEach(x => x.setAttribute("aria-pressed", String(x === b))); dvPaint(); return; }
      const r = e.target.closest("[data-code]"); if (r) A.openStock(r.dataset.code);
    });
  }
  const dvDate = v => { const m = String(v || "").match(/(\d{2,4})\D?(\d{2})\D?(\d{2})/); if (!m) return ""; let y = +m[1]; if (y < 1911) y += 1911; return `${y}-${m[2]}-${m[3]}`; };
const openJ = async p => { try { const a = await A.J(`${A.worker}/tw/open?p=${encodeURIComponent(p)}`); if (Array.isArray(a) && a.length) return a; } catch (e) {} return A.J("https://openapi.twse.com.tw/v1/" + p); };
      async function dvLoad() {
    if (DVROWS) return DVROWS;
    const a = await openJ("exchangeReport/TWT48U_ALL"), t = taipei().iso;
    DVROWS = (Array.isArray(a) ? a : []).map(x => {
      const ks = Object.keys(x), code = String(x[ks.find(k => /代號|Code/i.test(k))] || "").trim(), name = String(x[ks.find(k => /名稱|Name/i.test(k))] || "").trim();
      const dk = ks.find(k => /除(權|息)(交易)?日|ExRight|Exdiv|Ex.?date/i.test(k) && dvDate(x[k])) || ks.find(k => !/^(Date|資料日期)$/i.test(k) && /日期|Date/i.test(k) && dvDate(x[k])) || (dvDate(x.Date) ? "Date" : undefined);   /* TWT48U_ALL: Date = ex-date, Exdividend = 權/息 */
      const kind = String(x.Exdividend || x[ks.find(k => /權值|息值|權\/息|Rights|Type|類別/i.test(k))] || "").trim(), ck = ks.find(k => /現金|Cash/i.test(k) && ok(parseFloat(String(x[k]).replace(/,/g, "")))), sk = ks.find(k => /股票|Stock/i.test(k) && ok(parseFloat(String(x[k]).replace(/,/g, ""))));
      return { code, name, d: dk ? dvDate(x[dk]) : "", kind, cash: ck ? parseFloat(String(x[ck]).replace(/,/g, "")) : null, stock: sk ? parseFloat(String(x[sk]).replace(/,/g, "")) : null };
    }).filter(r => r.code && r.d && r.d >= t).sort((a, b) => (a.d < b.d ? -1 : 1));
    return DVROWS;
  }
  async function dvPaint() {
    const card = $("#dpList .dv"); if (!card) return; const out = $(".dvout", card);
    try {
      const rows = await dvLoad(), W = new Set(A.watch()), onlyW = $("[data-dv=w]", card).getAttribute("aria-pressed") === "true";
      if (onlyW && !rows.some(r => W.has(r.code)) && !card.dataset.auto) { card.dataset.auto = "1"; $$("[data-dv]", card).forEach(x => x.setAttribute("aria-pressed", String(x.dataset.dv === "a"))); dvPaint(); return; }   /* nothing of yours goes ex soon: show everyone */
      let list = rows.filter(r => !onlyW || W.has(r.code)); const total = list.length; list = list.slice(0, 120);
      $(".dvn", card).textContent = total ? `${total} 檔` : "";
      if (!list.length) { out.innerHTML = `<p class="sub">沒有資料。</p>`; return; }
      const by = {}; list.forEach(r => (by[r.d] = by[r.d] || []).push(r));
      const wd = "日一二三四五六";
      out.innerHTML = Object.entries(by).map(([d, rs]) => `<div class="dvday"><div class="dvdh"><b>${+d.slice(5, 7)}/${+d.slice(8)}</b><span>週${wd[new Date(d + "T00:00:00Z").getUTCDay()]}</span></div>${rs.map(r => `<button type="button" class="instrow dvrow" data-code="${A.esc(r.code)}"><span class="nm"><b>${A.esc(r.name)}</b><em>${A.esc(r.code)}</em></span><span class="dvk">${A.esc(r.kind || "")}</span><span class="dvv">${r.cash != null ? "現金 " + r.cash : ""}${r.stock != null && r.stock > 0 ? " 股票 " + r.stock : ""}</span></button>`).join("")}</div>`).join("");
      if (!RM) A.rise($$(".dvday", out).slice(0, 12), 40);
    } catch (e) { out.innerHTML = `<p class="sub">讀不到資料。</p>`; }
  }

  /* put the two cards and their buttons into 股票 */
  function mountList() {
    const dl = $("#dpList"), bar = dl && $(".lsub", dl); if (!dl || !bar || $(".dv", dl)) return !!$(".dv", dl);
    [["dv", "除息"]].forEach(([k, l]) => { const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "tab"); b.dataset.sub = k; b.setAttribute("aria-selected", "false"); b.textContent = l; bar.appendChild(b); });
    dvBuild(dl);
    bar.addEventListener("click", e => { const b = e.target.closest("[data-sub]"); if (!b) return; if (b.dataset.sub === "cm") setTimeout(() => cmPaint(true), 30); if (b.dataset.sub === "dv") setTimeout(dvPaint, 30); });
    return true;
  }

  /* ================= opening / closing ritual ================= */
  let prevPhase = null;
  function ritualShow(kind) {
    if (document.hidden) return;
    const ix = A.IDX[0], p = ok(ix.z) && ok(ix.y) ? (ix.z / ix.y - 1) * 100 : null;
    const sw = document.createElement("div"); sw.className = "ritsweep"; document.body.appendChild(sw);
    const tx = document.createElement("div"); tx.className = "ritchip " + (p == null ? "" : p >= 0 ? "up" : "down");
    tx.innerHTML = `<b>${kind === "open" ? "台股開盤" : "台股收盤"}</b><span>加權 ${ok(ix.z) ? A.fmt(ix.z, 2) : "—"}${p == null ? "" : `　${p > 0 ? "+" : ""}${p.toFixed(2)}%`}</span>`;
    document.body.appendChild(tx);
    if (RM) { setTimeout(() => { sw.remove(); tx.remove(); }, 3500); return; }
    sw.animate([{ transform: "translateX(-110%)", opacity: 0 }, { opacity: 1, offset: .2 }, { transform: "translateX(110%)", opacity: 0 }], { duration: 1600, easing: "cubic-bezier(.4,0,.2,1)" }).onfinish = () => sw.remove();
    tx.animate([{ opacity: 0, transform: "translate(-50%,-14px) scale(.92)" }, { opacity: 1, transform: "translate(-50%,0) scale(1)", offset: .15 }, { opacity: 1, transform: "translate(-50%,0)", offset: .85 }, { opacity: 0, transform: "translate(-50%,-10px)" }], { duration: 4200, easing: "ease-out" }).onfinish = () => tx.remove();
  }
  function ritualTick() {
    const t = taipei(), wk = t.wd >= 1 && t.wd <= 5, ph = !wk ? "off" : t.m < 540 ? "pre" : t.m < 810 ? "day" : "post";
    if (prevPhase && ph !== prevPhase) { if (prevPhase === "pre" && ph === "day") ritualShow("open"); else if (prevPhase === "day" && ph === "post") ritualShow("close"); }
    prevPhase = ph;
  }

  /* ================= swipe to the next / previous watchlist stock (touch) ================= */
  function swipe() {
    let x0 = 0, y0 = 0, t0 = 0, ok0 = false;
    document.addEventListener("touchstart", e => {
      ok0 = false; if (A.tabNow() !== "dpStock" || e.touches.length !== 1) return;
      if (e.target.closest("svg, canvas, input, textarea, select, table, .ltblwrap, .kc, .peek, .ixdetail, [data-noswipe]")) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); ok0 = true;
    }, { passive: true });
    document.addEventListener("touchend", e => {
      if (!ok0) return; ok0 = false; const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Date.now() - t0 > 700 || Math.abs(dx) < 80 || Math.abs(dy) > 45 || Math.abs(dx) < Math.abs(dy) * 2.2) return;
      stepStock(dx < 0 ? 1 : -1, true);
    }, { passive: true });
  }
  function stepStock(dir, swiped) {
    const W = A.watch(); if (!W.length) return;
    const i = W.indexOf(A.code()), nx = W[((i < 0 ? (dir > 0 ? -1 : 0) : i) + dir + W.length) % W.length];
    if (nx === A.code()) return;
    const host = $("#dpStock"); if (host && !RM && swiped) host.animate([{ transform: `translateX(${dir * 28}px)`, opacity: .4 }, { transform: "none", opacity: 1 }], { duration: 320, easing: "cubic-bezier(.16,1,.3,1)" });
    A.openStock(nx);
    if (navigator.vibrate) navigator.vibrate(8);
  }

  /* ================= pull down to refresh (touch, at the top of the page) ================= */
  /* ================= keyboard ================= */
  const KEYS = [["/", "搜尋股票與功能"], ["1 至 8", "切換 總覽／籌碼／產業／股票／持股與損益／分析／復盤／市場日曆"], ["J　K", "個股頁：下一檔／上一檔自選股"], ["R", "立即更新行情"], ["?", "顯示這份說明"], ["Esc", "關閉視窗"]];
  function keyHelp() {
    let el = $(".kbhelp"); if (el) { el.remove(); return; }
    el = document.createElement("div"); el.className = "kbhelp"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "鍵盤快捷鍵");
    el.innerHTML = `<div class="kbcard"><h3>鍵盤快捷鍵</h3>${KEYS.map(([k, t]) => `<div><kbd>${k}</kbd><span>${t}</span></div>`).join("")}</div>`;
    el.addEventListener("click", () => el.remove()); document.body.appendChild(el);
    if (!RM) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); $(".kbcard", el).animate([{ transform: "scale(.94) translateY(8px)" }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.9,.3,1.2)" }); }
  }
  function keys() {
    document.addEventListener("keydown", e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "Escape") { const h = $(".kbhelp"); if (h) h.remove(); return; }
      if (e.key === "?") { e.preventDefault(); keyHelp(); return; }
      if (e.key === "/") { e.preventDefault(); document.dispatchEvent(new Event("twdash:palette")); return; }
      if (/^[1-8]$/.test(e.key)) { const p = ["dpOverview", "dpChip", "dpInd", "dpList", "dpHold", "dpPre", "dpRev", "dpCal"][+e.key - 1], b = $(`.dtabs button[data-p="${p}"]`); if (b && !b.hidden) b.click(); return; }
      if ((e.key === "j" || e.key === "k") && A.tabNow() === "dpStock" && !(t && t.matches && t.matches("tr[data-code]"))) { stepStock(e.key === "j" ? 1 : -1, false); return; }
      if (e.key === "r" || e.key === "R") { A.refresh && A.refresh(); }
    });
  }

  function start() {
    A = window.TWDash && window.TWDash.api; if (!A) return;
    setInterval(() => { if (!document.hidden) ritualTick(); }, 5000); ritualTick();
    swipe(); keys();
    sideToggle(); instant(); popAnim(); closeAnim(); actionAnim(); visAnim(); sortTables(); sidePlus(); syncInit();
    window.TWDash.ritual = ritualShow;      /* TWDash.ritual("open") plays the opening animation for a look */
  }
  /* closing animates too: setting .hidden = true on a pop-open element first plays a short fade/sink, then hides it */
  function closeAnim() {
    const POP = ".ixdetail, .hmtip, .ktip, .kbcard, .sresults, .searchbox, [role=dialog], [role=menu], [role=listbox], [role=tooltip], .popover, .menu-pop";
    const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "hidden"); if (!d || !d.set) return;
    const pend = new WeakMap();
    Object.defineProperty(HTMLElement.prototype, "hidden", { configurable: true, enumerable: d.enumerable, get() { return pend.has(this) ? true : d.get.call(this); }, set(v) {
      const el = this;
      if (pend.has(el)) { if (v) return; try { pend.get(el).cancel(); } catch (e) {} pend.delete(el); }
      if (v && !d.get.call(el) && el.matches(POP) && el.isConnected && el.getClientRects().length) {
        let a; try { a = el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(10px) scale(.98)" }], { duration: 140, easing: "cubic-bezier(.23,1,.32,1)", fill: "forwards" }); } catch (e) { d.set.call(el, v); return; }
        pend.set(el, a);
        a.onfinish = () => { pend.delete(el); d.set.call(el, true); try { a.cancel(); } catch (e) {} };
        return;
      }
      d.set.call(el, v);
    } });
  }
  /* anything an action adds to the page (rows, cards, results, panels) rises in; live refreshes stay quiet */
  function actionAnim() {
    let at = 0; const mark = () => { at = Date.now(); };
    ["click", "keydown", "change", "submit", "pointerup"].forEach(t => document.addEventListener(t, mark, true));
    /* removed items leave too: a ghost copy collapses in place while the real node goes at once */
    const rm = Element.prototype.remove, rc = Node.prototype.removeChild;
    const ghost = el => {
      try {
        if (Date.now() - at > 1200 || !(el instanceof HTMLElement) || !el.isConnected || !el.closest(".app") || el.closest(".side, .topbar, .sbtog, svg, .ixdetail, .xghost") || /^(SCRIPT|STYLE|TR|TD|TH|OPTION)$/.test(el.tagName)) return;
        const r = el.getBoundingClientRect(); if (r.height < 24 || r.width < 40 || !el.parentNode) return;
        const g = el.cloneNode(true); g.removeAttribute("id"); g.querySelectorAll("[id]").forEach(x => x.removeAttribute("id")); g.classList.add("xghost"); g.setAttribute("aria-hidden", "true"); g.style.cssText += `;pointer-events:none;overflow:hidden;box-sizing:border-box;height:${r.height}px`;
        el.parentNode.insertBefore(g, el);
        const a = g.animate([{ height: r.height + "px", opacity: 1, transform: "none" }, { height: "0px", opacity: 0, transform: "translateX(-14px)", marginTop: "0px", marginBottom: "0px", paddingTop: "0px", paddingBottom: "0px" }], { duration: 260, easing: "cubic-bezier(.23,1,.32,1)", fill: "forwards" });
        a.onfinish = () => rm.call(g);
      } catch (e) {}
    };
    Element.prototype.remove = function () { ghost(this); return rm.call(this); };
    Node.prototype.removeChild = function (c) { ghost(c); return rc.call(this, c); };
    new MutationObserver(ms => {
      if (Date.now() - at > 1200) return;
      let n = 0;
      ms.forEach(m => m.addedNodes.forEach(el => {
        if (el.nodeType !== 1 || n > 40 || el.closest(".side, .topbar, .sbtog, svg, .ixdetail")) return;
        const h = el.getBoundingClientRect(); if (h.height < 24 || h.width < 40) return;
        try { el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 320, delay: Math.min(n, 12) * 28, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }); } catch (e) {} n++;
      }));
    }).observe(document.querySelector(".app") || document.body, { subtree: true, childList: true });
  }
  /* ================= the same data on every device: holdings, cash, trades, alerts, watchlists (no login; stored in the Worker) ================= */
  function syncInit() {
    /* every key of the owner's own data (watchlists, holdings, trades, alerts, simulated account, compare and screener picks, settings) — not the caches */
    const SKIP = /^(twh:|twinst-|twdash-m-|twlog-|twstock-device|tw-sync|twmain-calc|twlab-backup-at|tw\.sbhide|twtrade-wl-seed)/, WATCHK = new Set(["twtrade-watch", "twtrade-wl"]);
    const mine = k => /^tw/.test(k) && !SKIP.test(k), TK = "tw-sync-t", SK = "tw-sync-seen";
    const rd = k => { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch (e) { return {}; } }, wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    const url = A.worker + "/tw/sync"; let pushT = 0, busy = false;
    const post = body => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-TW": "1" }, body: JSON.stringify(body) }).then(r => r.json());
    const raw = A.store.set.bind(A.store);
    A.store.set = (k, v) => { raw(k, v); if (mine(k)) { clearTimeout(pushT); pushT = setTimeout(sync, 1500); } };
    async function sync() {
      if (busy) { clearTimeout(pushT); pushT = setTimeout(sync, 1500); return; } busy = true;
      try {
        const first = localStorage.getItem(SK) == null, t = rd(TK), seen = rd(SK), push = {}, applied = [];
        /* a key whose text changed since the last sync was edited here (whatever wrote it) */
        Object.keys(localStorage).filter(mine).forEach(k => { const v = localStorage.getItem(k); if (v != null && v.length < 60000 && seen[k] !== v) { if (!first) t[k] = Date.now(); seen[k] = v; } });
        const r0 = await post({ set: {} }), rem = (r0 && r0.data) || {};
        new Set([...Object.keys(rem), ...Object.keys(t)]).forEach(k => {
          if (!mine(k)) return; const r = rem[k], lt = t[k] || 0, lv = localStorage.getItem(k);
          if (r && r.t > lt) { const txt = JSON.stringify(r.v); try { localStorage.setItem(k, txt); } catch (e) {} t[k] = r.t; seen[k] = txt; applied.push(k); }
          else if (lv != null && lv.length < 60000 && (!r || lt > r.t)) { let v; try { v = JSON.parse(lv); } catch (e) { v = lv; } push[k] = { v, t: lt || Date.now() }; }
        });
        wr(TK, t); wr(SK, seen);
        if (Object.keys(push).length) await post({ set: push });
        if (applied.length) {
          if (applied.some(k => WATCHK.has(k) || k === "twmain-set")) { const last = +sessionStorage.getItem("tw-sync-rl") || 0; if (Date.now() - last > 60000) { sessionStorage.setItem("tw-sync-rl", String(Date.now())); location.reload(); return; } }
          document.dispatchEvent(new Event("twlab:hold")); document.dispatchEvent(new Event("tw:synced"));
        }
      } catch (e) {} finally { busy = false; }
    }
    sync(); setInterval(() => { if (!document.hidden) sync(); }, 45000); document.addEventListener("visibilitychange", () => { if (!document.hidden) sync(); });
    addEventListener("pagehide", () => { clearTimeout(pushT); });
  }
  /* ================= sidebar extras: price alerts, holdings and P&L, market calendar, recently viewed ================= */
  function sidePlus() {
    const side = $(".side"), nav = side && $("nav", side); if (!side || !nav || $(".sb-tools", side)) { if (!side) setTimeout(sidePlus, 600); return; }
    const store = A.store, fmt = A.fmt, esc = A.esc, DB = A.DB;
    const IC = {
      alert: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
      hold: '<rect x="3.5" y="7" width="17" height="12" rx="2.5"/><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3.5 12.5h17"/>',
      cal: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'
    };
    const PID = { alert: "dpAlert", hold: "dpHold", cal: "dpCal" }, tools = nav;
    $$("nav button", side).forEach(bt => { if (/^(dpAlert|dpHold)$/.test(bt.dataset.p)) bt.insertAdjacentHTML("beforeend", '<em class="sbn" hidden></em>'); });
    const rec = document.createElement("div"); rec.className = "sb-recent"; rec.innerHTML = '<div class="sb-h">最近瀏覽</div><div class="sb-rlist"></div>'; nav.after(rec);
    const tone = v => (v > 0 ? "up" : v < 0 ? "down" : "flat"), num = v => (Number.isFinite(v) ? v : NaN), sgn = (v, d = 0) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
    const px = c => { const x = DB.by.get(c); return x ? num(x.price) : NaN; };
    const nm = c => { const x = DB.by.get(c); return x ? x.name : c; };

    /* ----- recently viewed ----- */
    const RK = "tw-recent";
    const noteHash = () => { const m = location.hash.match(/#stock\/([0-9A-Za-z]+)/); if (!m) return; const c = m[1].toUpperCase(), L = (store.get(RK, []) || []).filter(x => x !== c); L.unshift(c); store.set(RK, L.slice(0, 8)); paintRecent(); };
    function paintRecent() {
      const L = (store.get(RK, []) || []).filter(c => DB.by.get(c)).slice(0, 6), box = $(".sb-rlist", rec); rec.hidden = !L.length;
      const html = L.map(c => { const x = DB.by.get(c), t = tone(x.pct); return `<button type="button" class="sb-row" data-code="${esc(c)}"><b>${esc(x.name)}</b><span class="p ${t}">${fmt(x.price, x.price < 50 ? 2 : x.price < 1000 ? 1 : 0)}</span><span>${esc(c)}</span><span class="p ${t}">${(x.pct > 0 ? "+" : "") + (x.pct || 0).toFixed(2)}%</span></button>`; }).join("");
      if (box.dataset.h !== html) { box.dataset.h = html; box.innerHTML = html; }
    }
    window.addEventListener("hashchange", noteHash); noteHash();
    /* pushState / replaceState never fire hashchange, so hook them: opening a stock counts as a view at once */
    ["pushState", "replaceState"].forEach(f => { const o = history[f]; history[f] = function () { const r = o.apply(this, arguments); try { noteHash(); } catch (e) {} return r; }; });
    addEventListener("popstate", noteHash);

    /* ----- pages (each is a tab like 總覽 / 分析 / 股票) ----- */
    let cur = null;
    const isOn = k => A.tabNow && A.tabNow() === PID[k];
    function page(k, title, body) {
      const el = document.getElementById(PID[k]); if (!el) return null;
      if (!$(".sbpage", el)) el.innerHTML = `<div class="dcard sbpage"><div class="sbmb"></div></div>`;
      const b = $(".sbmb", el); b.innerHTML = body; el.dataset.k = k; cur = el; return el;
    }

    /* ----- price alerts ----- */
    const AK = "tw-palerts", alerts = () => store.get(AK, []) || [];
    function badge() {
      const act = 0, b = null;
      const H = store.get("twlab-hold", []) || [], hb = $('nav [data-p="dpHold"] .sbn', side);
      let net = 0, n = 0; H.forEach(h => { const p = px(h.code); if (Number.isFinite(p) && h.shares > 0) { const v = p * h.shares, c = sell(h.code, v, h.shares); net += v - c.fee - c.tax - h.cost; n++; } });
      hb.hidden = !n; hb.textContent = sgn(net); hb.className = "sbn " + tone(net);
    }
    function ping(a, now) {
      let host = $(".toasts"); if (!host) { host = document.createElement("div"); host.className = "toasts"; host.setAttribute("aria-live", "polite"); document.body.appendChild(host); }
      const el = document.createElement("div"); el.className = "toast " + (a.op === "above" ? "up" : "down");
      el.innerHTML = `<span class="tt-badge">價格提醒</span><button type="button" class="tt-body"><b>${esc(nm(a.code))} <i>${esc(a.code)}</i></b><span>現價 ${fmt(now, now < 50 ? 2 : 1)}，已${a.op === "above" ? "漲到" : "跌到"} ${fmt(a.px, a.px < 50 ? 2 : 1)}</span></button>`;
      el.addEventListener("click", () => { A.openStock(a.code); el.remove(); }); host.prepend(el); setTimeout(() => el.remove(), 15000);
      try { if (window.Notification && Notification.permission === "granted") new Notification("價格提醒 " + nm(a.code), { body: `現價 ${now}，已${a.op === "above" ? "漲到" : "跌到"} ${a.px}` }); } catch (e) {}
    }
    function checkAlerts() {
      const L = alerts(); let ch = false;
      L.forEach(a => { if (!a.on) return; const p = px(a.code); if (!Number.isFinite(p)) return; if ((a.op === "above" && p >= a.px) || (a.op === "below" && p <= a.px)) { a.on = false; a.at = Date.now(); a.hit = p; ch = true; ping(a, p); } });
      if (ch) { store.set(AK, L); if (isOn("alert")) alertView(); }
      badge();
    }
    function alertView() {
      const L = alerts(), body = `<h3 class="sbtitle">價格提醒</h3>
        <form class="sbf" data-f="alert"><input name="code" placeholder="代號，例如 2330" inputmode="text" autocomplete="off" aria-label="股票代號"><select name="op" aria-label="條件"><option value="above">漲到</option><option value="below">跌到</option></select><input name="px" type="number" step="any" min="0" placeholder="價格" aria-label="價格"><button type="submit" class="btn">新增</button></form>
        <p class="sub sbhint"></p>
        <div class="sbl">${L.length ? L.map((a, i) => `<div class="sbr${a.on ? "" : " done"}"><button type="button" class="sbl-go" data-go="${esc(a.code)}"><b>${esc(nm(a.code))}</b><span>${esc(a.code)}</span></button><span>${a.op === "above" ? "漲到" : "跌到"} <b>${fmt(a.px, a.px < 50 ? 2 : 1)}</b></span><span class="sbs">${a.on ? `監控中（現價 ${Number.isFinite(px(a.code)) ? fmt(px(a.code), px(a.code) < 50 ? 2 : 1) : "—"}）` : "已觸發 " + new Date(a.at).toLocaleString("zh-TW", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span><button type="button" class="sbdel" data-del="${i}" aria-label="刪除">×</button></div>`).join("") : '<p class="sub">還沒有提醒。輸入代號、條件和價格就會開始監控，頁面開著時到價會跳通知。</p>'}</div>`;
      return page("alert", "價格提醒", body);
    }

    /* ----- holdings and P&L ----- */
    const HK = "twlab-hold";
    /* selling now: broker fee (0.1425% x your discount, at least NT$20) and securities transaction tax (0.3% stocks, 0.1% ETFs) come off the profit */
    const sell = (code, mv, shares) => { const fee = Math.max(shares % 1000 ? 1 : 20, Math.round(mv * 0.001425)), tax = Math.round(mv * (/^00/.test(code) ? 0.001 : 0.003)); return { fee, tax }; };
    const dayNet = (code, p, chg, shares) => { if (!Number.isFinite(p) || !Number.isFinite(chg)) return NaN; const a = sell(code, p * shares, shares), b = sell(code, (p - chg) * shares, shares); return chg * shares - (a.fee + a.tax - b.fee - b.tax); };
    function holdBody() {
      const H = store.get(HK, []) || [];
      const rows = H.map(h => { const p = px(h.code), mv = Number.isFinite(p) ? p * h.shares : NaN, c = Number.isFinite(mv) ? sell(h.code, mv, h.shares) : { fee: 0, tax: 0 }, pl = mv - c.fee - c.tax - h.cost; return { h, p, mv, pl, c, rt: pl / h.cost * 100, day: dayNet(h.code, p, (DB.by.get(h.code) || {}).chg, h.shares) }; });
      const tot = rows.reduce((a, r) => { a.cost += r.h.cost; if (Number.isFinite(r.mv)) { a.mv += r.mv; a.fees += r.c.fee + r.c.tax; } if (Number.isFinite(r.day)) a.day += r.day; return a; }, { cost: 0, mv: 0, day: 0, fees: 0 });
      const net = tot.mv - tot.fees - tot.cost;
      return `<h3 class="sbtitle">持股與損益</h3><div class="sbsum"><div><span>總市值</span><b data-s="mv">${Number.isFinite(tot.mv) && tot.mv ? Math.round(tot.mv).toLocaleString("en-US") : "—"}</b></div><div><span>預估損益</span><b data-s="pl" class="${tone(net)}">${rows.length ? sgn(net) : "—"}</b></div><div><span>報酬率</span><b data-s="rt" class="${tone(net)}">${tot.cost ? sgn(net / tot.cost * 100, 2) + "%" : "—"}</b></div><div><span>今日損益</span><b data-s="day" class="${tone(tot.day)}">${rows.length ? sgn(tot.day) : "—"}</b></div></div>
        ${rows.length ? `<div class="sbtw"><table class="sbt"><thead><tr><th>股票</th><th>股數</th><th>均價</th><th>現價</th><th>市值</th><th>損益</th><th>報酬</th><th></th></tr></thead><tbody>${rows.map(r => `<tr data-c="${esc(r.h.code)}"><td><button type="button" class="sbl-go" data-go="${esc(r.h.code)}"><b>${esc(nm(r.h.code))}</b><span>${esc(r.h.code)}</span></button></td><td>${r.h.shares.toLocaleString("en-US")}</td><td>${(r.h.cost / r.h.shares).toFixed(2)}</td><td data-k="p" class="${tone((DB.by.get(r.h.code) || {}).chg)}">${Number.isFinite(r.p) ? fmt(r.p, r.p < 50 ? 2 : 1) : "—"}</td><td data-k="mv">${Number.isFinite(r.mv) ? Math.round(r.mv).toLocaleString("en-US") : "—"}</td><td data-k="pl" class="${tone(r.pl)}">${Number.isFinite(r.pl) ? sgn(Math.round(r.pl)) : "—"}</td><td data-k="rt" class="${tone(r.pl)}">${Number.isFinite(r.rt) ? sgn(r.rt, 2) + "%" : "—"}</td><td><button type="button" class="sbdel" data-hdel="${esc(r.h.code)}" aria-label="刪除">×</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="sub">還沒有持股。在下面輸入代號、股數和總成本。</p>'}
        <form class="sbf" data-f="hold"><input name="code" placeholder="代號" autocomplete="off" aria-label="代號"><input name="shares" type="number" min="1" step="1" placeholder="股數" aria-label="股數"><input name="cost" type="number" min="1" step="any" placeholder="總成本（元）" aria-label="總成本"><button type="submit" class="btn">新增／更新</button></form><p class="sub sbhint">損益是「現在全部賣出」的估算，已扣賣出手續費和證交稅。總成本請填含買進手續費的實際金額。股數以「股」計（1 張 = 1,000 股）。同一代號再輸入會覆蓋。</p>`;
    }
    function holdView() { return page("hold", "持股與損益", holdBody()); }
    function holdLive() {
      if (!isOn("hold")) return; const H = store.get(HK, []) || []; let mv = 0, cost = 0, day = 0, fees = 0;
      H.forEach(h => { const x = DB.by.get(h.code), p = px(h.code), tr = $(`tr[data-c="${h.code}"]`, cur); cost += h.cost; if (!Number.isFinite(p)) return; const v = p * h.shares, c = sell(h.code, v, h.shares), pl = v - c.fee - c.tax - h.cost; mv += v; fees += c.fee + c.tax; day += dayNet(h.code, p, x.chg || 0, h.shares) || 0;
        if (tr) { const set = (k, t, c) => { const td = $(`[data-k=${k}]`, tr); if (td && td.textContent !== t) { td.textContent = t; if (c) td.className = c; } }; set("p", fmt(p, p < 50 ? 2 : 1), tone(x.chg)); set("mv", Math.round(v).toLocaleString("en-US")); set("pl", sgn(Math.round(pl)), tone(pl)); set("rt", sgn(pl / h.cost * 100, 2) + "%", tone(pl)); } });
      const S = (k, t, c) => { const b = $(`[data-s=${k}]`, cur); if (b && b.textContent !== t) { b.textContent = t; if (c) b.className = c; } };
      S("mv", Math.round(mv).toLocaleString("en-US")); const nt = mv - fees - cost; S("pl", sgn(nt), tone(nt)); S("rt", cost ? sgn(nt / cost * 100, 2) + "%" : "—", tone(nt)); S("day", sgn(day), tone(day));
    }

    /* ----- market calendar ----- */
    let CY = new Date().getFullYear(), CM = new Date().getMonth(), CSEL = "", HOL = null, CMODE = (window.TWSet && window.TWSet.get("cmode")) || "list", CMINE = !!(window.TWSet && window.TWSet.get("cmine") === "1"), AGM = null;
    const ymd = (y, m, d) => y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    async function holidays(y) {
      if (HOL && HOL.y === y) return HOL.m; const m = {};
      try { const j = await A.J(`https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?response=json&queryYear=${y}`);
        (j.data || []).forEach(r => { const c = String(r[0]); let d = ""; const a = c.match(/(\d{4})-(\d{2})-(\d{2})/), b = c.match(/(\d{2,3})年(\d{1,2})月(\d{1,2})日/); if (a) d = c.slice(0, 10); else if (b) d = ymd(+b[1] + 1911, +b[2] - 1, +b[3]); if (d && !/開始交易|最後交易/.test(String(r[1] || ""))) m[d] = String(r[1] || "休市").replace(/<[^>]*>/g, "").slice(0, 12); }); } catch (e) {}
      HOL = { y, m }; return m;
    }
    /* shareholder meetings (TWSE open data t187ap38_L, fall back on t187ap41_L) */
    async function agmLoad() {
      if (AGM) return AGM;
      const num = v => { const n = parseFloat(String(v || "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
      let rows = [];
      try { const a = await openJ("opendata/t187ap38_L");
        rows = (Array.isArray(a) ? a : []).map(x => ({ code: String(x["公司代號"] || "").trim(), name: String(x["公司名稱"] || "").trim(), d: dvDate(x["股東常(臨時)會日期-日期"]), kind: String(x["股東常(臨時)會日期-常或臨時"] || "").trim(), cash: num(x["預擬配發現金(股利)(元/股)-盈餘"]) + num(x["預擬配發現金(股利)(元/股)-法定盈餘公積、資本公積"]), stop1: dvDate(x["停止過戶起訖日期-起"]), stop2: dvDate(x["停止過戶起訖日期-訖"]) })); } catch (e) {}
      if (!rows.some(r => r.d)) { try { const a = await openJ("opendata/t187ap41_L");
        rows = (Array.isArray(a) ? a : []).map(x => ({ code: String(x["公司代號"] || "").trim(), name: String(x["公司名稱"] || "").trim(), d: dvDate(x["開會日期"]), kind: String(x["股東常(臨)會"] || "").trim(), cash: 0 })); } catch (e) {} }
      return (AGM = rows.filter(r => r.code && r.d));
    }
    function legal(y) {
      const E = {}, add = (d, t) => (E[d] = E[d] || []).push(t);
      add(ymd(y, 4, 15), "第一季財報申報期限"); add(ymd(y, 7, 14), "第二季財報申報期限"); add(ymd(y, 10, 14), "第三季財報申報期限"); add(ymd(y, 2, 31), "年度財報申報期限");
      for (let m = 0; m < 12; m++) add(ymd(y, m, 10), "上月營收公布期限");
      for (let m = 0; m < 12; m++) { const w = new Date(y, m, 1).getDay(); add(ymd(y, m, 1 + ((3 - w + 7) % 7) + 14), "台指期・選擇權結算日"); }
      return E;
    }
    async function calView() {
      const body = `<h3 class="sbtitle">市場日曆</h3><div class="sbcal"><div class="sbsm"></div><div class="sbch"><button type="button" class="chip" data-cm="-1" aria-label="上個月">‹</button><b></b><button type="button" class="chip" data-cm="1" aria-label="下個月">›</button><button type="button" class="chip" data-cm="0">今天</button></div><div class="sbctl"><div class="sbseg" role="group" aria-label="範圍"><button type="button" data-cmine="0" aria-pressed="true">全部</button><button type="button" data-cmine="1" aria-pressed="false">我的</button></div><div class="sbseg" role="group" aria-label="檢視"><button type="button" data-cmode="list" aria-pressed="true">列表</button><button type="button" data-cmode="grid" aria-pressed="false">月曆</button></div></div><div class="sbgrid"></div><div class="sbday"></div><p class="sub sbhint">紅點＝除權息　綠點＝股東會　藍點＝財報／營收申報期限　灰底＝週末或休市。「我的」只看持股和自選股的事件；除權息只列出尚未發生的場次，休市日取自證交所公告，抓不到時只標週末。股息發放日以公司公告為準；法說會沒有公開資料可抓，這裡沒有列。</p></div>`;
      const el = document.getElementById(PID.cal); if (!el || $(".sbcal", el)) { await calPaint(); return el; }
      const m = page("cal", "市場日曆", body); await calPaint(true); await calPaint(); return m;
    }
    async function calPaint(quick) {
      if (!isOn("cal")) return;
      const root = $(".sbcal", cur); if (!root) return;
      /* the three sources are read side by side, and the last answer is kept for the day so the page opens at once and refreshes behind it */
      const day = taipei().iso, CK = "twmain-calc", C = store.get(CK, null), fresh = C && C.day === day && C.y === CY;
      const pull = async () => {
        const [h, d, g] = await Promise.all([holidays(CY).catch(() => ({})), dvLoad().catch(() => []), agmLoad().catch(() => [])]);
        const m0 = day.slice(0, 8) + "01";
        if (d.length || g.length) store.set(CK, { day, y: CY, hol: h, dv: d.filter(r => !r.d || r.d >= m0), ag: g.filter(r => !r.d || r.d >= m0) });
        return [h, d, g];
      };
      let hol, dv, ag;
      if (quick) { hol = {}; dv = []; ag = []; }   /* the first paint shows what needs no download: the range, the filters and the fixed dates; the numbers read … until the data arrives */
      else if (fresh && !HOL) { hol = C.hol; dv = C.dv; ag = C.ag; HOL = { y: CY, m: hol }; pull().then(() => { if (isOn("cal")) calPaint(); }); }
      else { [hol, dv, ag] = await pull(); if (!dv.length && !ag.length && C && C.y === CY) { dv = C.dv; ag = C.ag; } }   /* the sources are down: keep showing the last answer */
      const L = legal(CY), W = new Set(A.watch()), Hd = store.get(HK, []) || [], HM = new Map(Hd.map(h => [h.code, h.shares])), mine = c => W.has(c) || HM.has(c);
      const ev = []; dv.forEach(r => ev.push({ ...r, t: "ex" })); ag.forEach(r => ev.push({ ...r, t: "agm" }));
      const shown = ev.filter(e => !CMINE || mine(e.code)), byD = {}; shown.forEach(e => (byD[e.d] = byD[e.d] || []).push(e));
      const T0 = taipei().iso, T1 = (() => { const d = new Date(T0 + "T00:00:00"); d.setMonth(d.getMonth() + 1); return ymd(d.getFullYear(), d.getMonth(), d.getDate()); })(), mp = CY + "-" + String(CM + 1).padStart(2, "0"), inM = shown.filter(e => CMODE === "list" ? (e.d >= T0 && e.d <= T1) : e.d.startsWith(mp)), exM = inM.filter(e => e.t === "ex"), agM = inM.filter(e => e.t === "agm");
      const myEx = ev.filter(e => e.t === "ex" && (CMODE === "list" ? (e.d >= T0 && e.d <= T1) : e.d.startsWith(mp)) && HM.has(e.code) && e.cash > 0), income = myEx.reduce((a, e) => a + e.cash * HM.get(e.code), 0);
      $(".sbsm", root).innerHTML = `<div><span>${CMODE === "list" ? "未來一個月" : "本月"}除權息</span><b>${exM.length}</b><small>${CMINE ? "我的" : "全部"}檔數</small></div><div><span>${CMODE === "list" ? "未來一個月" : "本月"}股東會</span><b>${agM.length}</b><small>${CMINE ? "我的" : "全部"}場數</small></div><div><span>我的預估股息</span><b class="${income ? "up" : ""}">${income ? Math.round(income).toLocaleString("en-US") : "—"}</b><small>${myEx.length ? myEx.length + " 檔持股除息" : (CMODE === "list" ? "未來一個月" : "本月") + "沒有持股除息"}</small></div>`;
      if (quick || (!dv.length && !ag.length)) $$(".sbsm b", root).forEach(b => { b.textContent = quick ? "…" : "讀不到"; });
      $$("[data-cmine]", root).forEach(b => b.setAttribute("aria-pressed", String((b.dataset.cmine === "1") === CMINE))); $$("[data-cmode]", root).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.cmode === CMODE)));
      $(".sbch b", root).textContent = CMODE === "list" ? `${T0.slice(5).replace("-", "/")} – ${T1.slice(5).replace("-", "/")}（未來一個月）` : `${CY} 年 ${CM + 1} 月`; $$("[data-cm]", root).forEach(b => { b.hidden = CMODE === "list"; });
      const evHTML = e => { const mineTag = mine(e.code) ? "<i>我的</i>" : "", sh = HM.get(e.code);
        if (e.t === "ex") return `<button type="button" class="sbev ex" data-go="${esc(e.code)}"><u class="dx"></u><b>${esc(e.name)}</b> ${esc(e.code)} 除${/權/.test(e.kind) && !/息/.test(e.kind) ? "權" : "息"}<span>${e.cash ? "現金 " + e.cash + " 元" : ""}${e.stock ? "　股票 " + e.stock : ""}${sh && e.cash > 0 ? "　預估領 " + Math.round(e.cash * sh).toLocaleString("en-US") + " 元（" + sh.toLocaleString("en-US") + " 股）" : ""}</span>${mineTag}</button>`;
        return `<button type="button" class="sbev ag" data-go="${esc(e.code)}"><u class="da"></u><b>${esc(e.name)}</b> ${esc(e.code)} ${esc(e.kind || "股東會")}<span>${e.cash ? "預擬現金股利 " + e.cash + " 元" : ""}${e.stop1 ? "　停止過戶 " + e.stop1.slice(5).replace("-", "/") + "–" + (e.stop2 || "").slice(5).replace("-", "/") : ""}</span>${mineTag}</button>`; };
      const dayHead = d => { const dt = new Date(d + "T00:00:00"); return `${dt.getMonth() + 1}/${dt.getDate()}（週${"日一二三四五六"[dt.getDay()]}）`; };
      const g = $(".sbgrid", root), out = $(".sbday", root);
      if (CMODE === "list") {
        const y2 = +T1.slice(0, 4), LL = { ...legal(+T0.slice(0, 4)), ...(y2 !== +T0.slice(0, 4) ? legal(y2) : {}) };
        const hol2 = y2 !== CY ? { ...hol, ...(await holidays(y2)) } : hol;
        const inR = d => d >= T0 && d <= T1, all = [...new Set([...Object.keys(byD), ...Object.keys(LL)])].filter(inR).sort();
        g.hidden = true; g.innerHTML = "";
        out.innerHTML = all.length ? all.map(d => `<div class="sbld"><h4>${dayHead(d)}${hol2[d] ? "　休市：" + esc(hol2[d]) : ""}</h4>${(byD[d] || []).slice(0, 60).map(evHTML).join("")}${(LL[d] || []).map(t => `<p class="sbev lg"><u class="dl"></u><em class="sbt">${esc(t)}</em></p>`).join("")}</div>`).join("") : `<p class="sub">${CMINE ? "未來一個月沒有你的持股或自選股的事件。切到「全部」可以看所有公司。" : "未來一個月沒有已知的事件。"}</p>`;
        if (quick) root.dataset.q = "1"; else if (root.dataset.q) delete root.dataset.q; else out.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" });
        return;
      }
      g.hidden = false;
      const first = new Date(CY, CM, 1).getDay(), days = new Date(CY, CM + 1, 0).getDate(), today = taipei().iso;
      let cells = "日一二三四五六".split("").map(w => `<i class="sbw">${w}</i>`).join("");
      for (let i = 0; i < first; i++) cells += "<i></i>";
      for (let d = 1; d <= days; d++) { const k = ymd(CY, CM, d), wd = new Date(CY, CM, d).getDay(), es = byD[k] || [], ex = es.filter(e => e.t === "ex"), ag2 = es.filter(e => e.t === "agm"), lg = L[k] || [], my = es.some(e => mine(e.code));
        cells += `<button type="button" class="sbc${wd % 6 === 0 || hol[k] ? " off" : ""}${k === today ? " today" : ""}${k === CSEL ? " sel" : ""}${my ? " mine" : ""}" data-d="${k}"><span>${d}</span><em>${ex.length ? `<u class="dx"></u>${ex.length > 1 ? "<q>" + ex.length + "</q>" : ""}` : ""}${ag2.length ? `<u class="da"></u>${ag2.length > 1 ? "<q>" + ag2.length + "</q>" : ""}` : ""}${lg.length ? '<u class="dl"></u>' : ""}</em>${hol[k] ? `<small>${esc(hol[k])}</small>` : ""}</button>`; }
      g.innerHTML = cells;
      g.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" });
      const sel = CSEL && CSEL.startsWith(mp) ? CSEL : "";
      if (!sel) { out.innerHTML = ""; return; }
      const es = (byD[sel] || []), lg = L[sel] || [];
      out.innerHTML = `<h4>${dayHead(sel)}</h4>` + (hol[sel] ? `<p class="sbev off"><em class="sbt">休市：${esc(hol[sel])}</em></p>` : "") + lg.map(t => `<p class="sbev lg"><u class="dl"></u><em class="sbt">${esc(t)}</em></p>`).join("") + es.slice(0, 80).map(evHTML).join("") + ((!es.length && !lg.length && !hol[sel]) ? `<p class="sub">${CMINE ? "這天沒有你的持股或自選股的事件。" : "這天沒有已知的事件。"}</p>` : "");
    }

    /* ----- clicks ----- */
    const show = () => { const t = A.tabNow && A.tabNow(); if (t === PID.alert) alertView(); else if (t === PID.hold) holdView(); else if (t === PID.cal) calView(); };
    new MutationObserver(show).observe($(".dtabs"), { subtree: true, attributes: true, attributeFilter: ["aria-selected"] }); setTimeout(show, 300);
    document.addEventListener("click", e => {
      if (!e.target.closest || !e.target.closest(".sbpage")) return;
      const go = e.target.closest("[data-go]"); if (go) { A.openStock(go.dataset.go); return; }
      const del = e.target.closest("[data-del]"); if (del) { const L = alerts(); L.splice(+del.dataset.del, 1); store.set(AK, L); alertView(); badge(); return; }
      const hd = e.target.closest("[data-hdel]"); if (hd) { store.set(HK, (store.get(HK, []) || []).filter(h => h.code !== hd.dataset.hdel)); document.dispatchEvent(new Event("twlab:hold")); holdView(); badge(); return; }
      const cm = e.target.closest("[data-cm]"); if (cm) { const v = +cm.dataset.cm; if (!v) { CY = new Date().getFullYear(); CM = new Date().getMonth(); CSEL = taipei().iso; } else { CM += v; if (CM < 0) { CM = 11; CY--; } if (CM > 11) { CM = 0; CY++; } } calPaint(); return; }
      const dd = e.target.closest("[data-d]"); if (dd) { CSEL = dd.dataset.d; calPaint(); }
      const cmn = e.target.closest("[data-cmine]"); if (cmn) { CMINE = cmn.dataset.cmine === "1"; calPaint(); return; }
      const cmo = e.target.closest("[data-cmode]"); if (cmo) { CMODE = cmo.dataset.cmode; calPaint(); }
    });
    document.addEventListener("submit", e => {
      const f = e.target.closest && e.target.closest(".sbf"); if (!f || !f.closest(".sbpage")) return; e.preventDefault();
      const code = f.code.value.trim().toUpperCase(), hint = $(".sbhint", f.closest(".sbpage"));
      if (!DB.by.get(code)) { if (hint) hint.textContent = "找不到這個代號（要先在股票清單裡）。"; return; }
      if (f.dataset.f === "alert") { const p = parseFloat(f.px.value); if (!(p > 0)) { hint.textContent = "請輸入價格。"; return; } const L = alerts(); L.unshift({ code, op: f.op.value, px: p, on: true }); store.set(AK, L.slice(0, 40)); try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (x) {} alertView(); badge(); checkAlerts(); }
      else { const sh = parseFloat(f.shares.value), cost = parseFloat(f.cost.value); if (!(sh > 0) || !(cost > 0)) { hint.textContent = "股數和總成本都要大於 0。"; return; } const H = (store.get(HK, []) || []).filter(h => h.code !== code); const x = DB.by.get(code); H.push({ code, shares: sh, cost, px: null, ind: "" }); store.set(HK, H); document.dispatchEvent(new Event("twlab:hold")); holdView(); badge(); }
    });
    document.addEventListener("twdash:live", () => { try { checkAlerts(); paintRecent(); holdLive(); } catch (e) {} });
    document.addEventListener("twdash:list", () => { paintRecent(); badge(); });
    document.addEventListener("twlab:hold", badge); document.addEventListener("tw:synced", () => { try { badge(); show(); } catch (e) {} });
    paintRecent(); badge();
  }
  /* ================= every chart and table animates when it scrolls into view ================= */
  function visAnim() {
    const SKIP = ".spark, .ixfig, .side, .sbtog, .topbar, .thbtn, .ftspark, button, .ptr, .kbhelp, .xghost";
    const E = "cubic-bezier(.215,.61,.355,1)", seenAt = new WeakMap(), done = new WeakSet();
    const quiet = host => { const t = seenAt.get(host); return t && Date.now() - t < 30000; };   /* live refreshes re-render a chart: only play it again after 30 s */
    function chart(svg) {
      const r = svg.getBoundingClientRect(); if (r.width < 90 || r.height < 36) return;
      const host = svg.parentElement || svg; if (quiet(host) && Date.now() - lastAct > 1500) return; seenAt.set(host, Date.now());
      let n = 0;
      $$("path, polyline, line, rect, circle, polygon", svg).forEach(el => {
        if (el.closest(SKIP) || n > 400) return; n++;
        const cs = getComputedStyle(el), stroke = cs.stroke !== "none" && cs.fill === "none" || (el.tagName !== "rect" && el.tagName !== "circle" && cs.fill === "none"), tag = el.tagName;
        try {
          if ((tag === "path" || tag === "polyline") && cs.fill === "none" && cs.stroke !== "none") {
            el.setAttribute("pathLength", "1"); const a0 = el.style.strokeDasharray; el.style.strokeDasharray = "1";
            const a = el.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 900, easing: E }); a.onfinish = () => { el.style.strokeDasharray = a0; };
          } else if (tag === "rect") {
            const b = el.getBBox ? el.getBBox() : { height: 0 }; if (b.height > r.height * 0.95 && b.width > r.width * 0.9) return;   /* the hit area or backdrop */
            el.style.transformBox = "fill-box"; el.style.transformOrigin = "50% 100%";
            el.animate([{ transform: "scaleY(0)", opacity: .2 }, { transform: "scaleY(1)", opacity: 1 }], { duration: 650, delay: Math.min(n, 30) * 18, easing: E, fill: "backwards" });
          } else if (tag === "circle") {
            el.style.transformBox = "fill-box"; el.style.transformOrigin = "center";
            el.animate([{ transform: "scale(.6)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 420, delay: 300 + Math.min(n, 30) * 15, easing: "cubic-bezier(.2,.9,.3,1.4)", fill: "backwards" });
          } else if (tag === "path" || tag === "polygon") {
            el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 250, easing: "ease-out", fill: "backwards" });
          } else if (tag === "line") {
            el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: "backwards" });
          }
        } catch (e) {}
      });
    }
    const ROWS = "tbody tr, .bd-row, .sk-row, .fl-row, .cl-row, .fgr, .ftrow, .wdcell, .mcell, .newsitem, .levent, .lscen, .pnlrow, .dvday, .hrow";
    function rows(host) {
      const list = $$(ROWS, host).filter(el => !el.closest(".side, .xghost")).slice(0, 60), bars = $$(".bd-b, .hmb, .vbar", host), cnt = $$(".bd-c", host), fills = $$(".fgb i, .ftbar i, .bd-bar i", host);
      if (!list.length && !bars.length && !fills.length) return;   /* nothing rendered yet: wait for it */
      if (quiet(host) && Date.now() - lastAct > 1500) return; seenAt.set(host, Date.now());
      bars.forEach((el, i) => { try { el.style.transformOrigin = "bottom"; el.animate([{ transform: "scaleY(0)", opacity: .3 }, { transform: "scaleY(1)", opacity: 1 }], { duration: 750, delay: i * 55, easing: "cubic-bezier(.2,.9,.3,1.1)", fill: "backwards" }); } catch (e) {} });
      if (!(window.TWSet && window.TWSet.calm())) cnt.forEach((el, i) => { const txt = el.textContent, v = parseFloat(txt.replace(/,/g, "")); if (!Number.isFinite(v)) return; const t0 = performance.now() + i * 55, dur = 750; el.dataset.txt = txt;
        const step = now => { if (el.dataset.txt !== txt || !el.isConnected) return; const k = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3); el.textContent = k < 1 ? Math.round(v * e).toLocaleString("en-US") : txt; if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); });
      list.forEach((el, i) => { try { el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: Math.min(i, 20) * 35, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }); } catch (e) {} });
      fills.forEach(el => { try { el.style.transformOrigin = "left"; el.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 700, delay: 120, easing: E, fill: "backwards" }); } catch (e) {} });
    }
    let lastAct = 0; ["click", "keydown", "pointerup", "change"].forEach(t => document.addEventListener(t, () => { lastAct = Date.now(); }, true));
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (!en.isIntersecting) return; const el = en.target; io.unobserve(el); if (done.has(el)) return; done.add(el);
      if (el.tagName.toLowerCase() === "svg") chart(el); else rows(el);
    }), { threshold: 0.15 });
    const watch = root => {
      if (!root.querySelectorAll) return;
      const up = root.closest && root.closest("table, .bd-bars, .bd-tiles, .bd-list, .wdgrid, .fgrid, .fqgrid, .ftgrid, .newslist, .mstrip, .ixdstats, .snapgrid"); if (up) { done.delete(up); io.observe(up); }
      const svgs = root.matches && root.matches("svg") ? [root] : $$("svg", root), hosts = (root.matches && root.matches("table, .bd-bars, .bd-tiles, .bd-list, .wdgrid, .fgrid, .fqgrid, .ftgrid, .newslist, .mstrip, .ixdstats, .snapgrid") ? [root] : []).concat($$("table, .bd-bars, .bd-tiles, .bd-list, .wdgrid, .fgrid, .fqgrid, .ftgrid, .newslist, .mstrip, .ixdstats, .snapgrid", root));
      svgs.forEach(el => { if (!done.has(el) && !el.closest(SKIP) && !el.matches(SKIP)) io.observe(el); });
      hosts.forEach(el => { if (!done.has(el) && !el.closest(".side, .xghost")) io.observe(el); });
    };
    let queued = new Set(), tick = 0;
    new MutationObserver(ms => { ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) queued.add(n); })); if (!tick) tick = requestAnimationFrame(() => { tick = 0; const q = queued; queued = new Set(); q.forEach(watch); }); }).observe(document.querySelector(".app") || document.body, { subtree: true, childList: true });
    watch(document.body);
  }
  /* tables sort when a column heading is clicked (numbers by value, text alphabetically); rows slide to their new places */
  function sortTables() {
    document.addEventListener("click", e => {
      const th = e.target.closest && e.target.closest("table thead th"); if (!th) return;
      const table = th.closest("table"), tb = table.tBodies[0]; if (!tb || table.hasAttribute("data-nosort") || tb.rows.length < 3) return;
      const idx = th.cellIndex, dir = th.dataset.dir === "asc" ? "desc" : "asc";
      $$("th", table).forEach(x => { delete x.dataset.dir; x.removeAttribute("aria-sort"); }); th.dataset.dir = dir; th.setAttribute("aria-sort", dir === "asc" ? "ascending" : "descending");
      const val = tr => { const t = (tr.cells[idx] ? tr.cells[idx].textContent : "").trim(), n = parseFloat(t.replace(/[,%+＋\s]/g, "").replace(/[−–]/g, "-")); return Number.isFinite(n) ? n : t; };
      const rs = Array.from(tb.rows), first = new Map(rs.map(r => [r, r.getBoundingClientRect().top]));
      rs.sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "zh-Hant"); return dir === "asc" ? c : -c; }).forEach(r => tb.appendChild(r));
      rs.forEach(r => { const dy = first.get(r) - r.getBoundingClientRect().top; if (dy) r.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" }); });
    });
  }
  /* the left menu opens and closes; the choice is remembered. Closed: the top tabs take over navigation. */
  function sideToggle() {
    if ($(".sbtog")) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "sbtog"; b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15"/></svg>';
    const set = hide => { document.body.classList.toggle("sbhide", hide); b.setAttribute("aria-label", hide ? "開啟左側選單" : "關閉左側選單"); b.title = b.getAttribute("aria-label"); b.setAttribute("aria-expanded", String(!hide)); try { localStorage.setItem("tw.sbhide", hide ? "1" : "0"); } catch (e) {} };
    let h = false; try { h = localStorage.getItem("tw.sbhide") === "1"; } catch (e) {}
    b.addEventListener("click", () => set(!document.body.classList.contains("sbhide")));
    document.body.appendChild(b); set(h);
  }
  /* everything that pops open animates: detail panels, menus, tips and dialogs; chart lines inside the index panel draw in */
  /* mouse: act on press instead of release, so the animation starts ~80 ms sooner (touch and keyboard unchanged) */
  function instant() {
    const SEL = ".dtabs [data-p], .side nav [data-p], .ixcard, .chip, .sbc, [data-cmode], [data-cmine], [data-sub]";
    let swallow = null;
    document.addEventListener("pointerdown", e => {
      if (e.pointerType !== "mouse" || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target.closest && e.target.closest(SEL); if (!t || t.disabled || t.getAttribute("aria-disabled") === "true") return;
      swallow = t; setTimeout(() => { if (swallow === t) swallow = null; }, 600);
      t.click();
    }, true);
    document.addEventListener("click", e => {
      if (!swallow || !e.isTrusted) return;
      const t = e.target.closest && e.target.closest(SEL);
      if (t === swallow) { swallow = null; e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
  }
  function popAnim() {
    const POP = ".ixdetail, .hmtip, .ktip, .kbcard, .sresults, .searchbox, [role=dialog], [role=menu], [role=listbox], [role=tooltip], .popover, .menu-pop";
    const seen = new WeakMap(), isOpen = el => !el.hidden && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden" && +getComputedStyle(el).opacity > 0.01;
    const IN = [{ opacity: 0, transform: "translateY(14px) scale(.97)" }, { opacity: 1, transform: "none" }];
    const pop = el => { try { el.animate(IN, { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" }); } catch (e) {} };
    let clk = 0; document.addEventListener("click", e => { if (e.target.closest && e.target.closest(".ixcard, .ixdetail button")) clk = Date.now(); }, true);
    const draw = root => {
      if (Date.now() - clk > 1500) return;   /* live refreshes redraw the chart quietly; only a click on a card or range plays the animation */
      $$(".ixline", root).forEach(l => { if (l.dataset.dr) return; l.dataset.dr = "1"; l.setAttribute("pathLength", "1"); l.style.strokeDasharray = "1"; const a = l.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 800, easing: "cubic-bezier(.215,.61,.355,1)" }); a.onfinish = () => { l.style.strokeDasharray = ""; }; });
      $$(".ixarea", root).forEach(a => { if (a.dataset.dr) return; a.dataset.dr = "1"; a.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 250, easing: "ease-out", fill: "backwards" }); });
      $$(".ixbk", root).forEach(g => { if (g.dataset.dr) return; g.dataset.dr = "1"; g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 }); });
    };
    const check = el => { const now = isOpen(el), was = seen.get(el); seen.set(el, now); if (now && was === false) { pop(el); if (el.matches(".ixdetail")) draw(el); } };
    $$(POP).forEach(el => seen.set(el, isOpen(el)));
    new MutationObserver(ms => {
      const todo = new Set();
      ms.forEach(m => {
        if (m.type === "attributes") { const t = m.target; if (t.matches && t.matches(POP)) todo.add(t); if (m.attributeName === "aria-expanded" && t.getAttribute("aria-expanded") === "true" && t.classList && t.classList.contains("ixcard")) { try { t.animate([{ transform: "scale(.96)" }, { transform: "scale(1.02)" }, { transform: "none" }], { duration: 360, easing: "ease-out" }); } catch (e) {} } }
        else m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.matches(POP)) { seen.set(n, false); todo.add(n); } else if (n.querySelectorAll) n.querySelectorAll(POP).forEach(x => { seen.set(x, false); todo.add(x); }); const d = n.closest && n.closest(".ixdetail"); if (d && (n.matches(".ixfig") || n.querySelector(".ixfig"))) draw(d); });
      });
      todo.forEach(check);
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "class", "style", "aria-expanded"] });
  }
  if (window.TWDash && window.TWDash.api) start(); else document.addEventListener("twdash:ready", start);
})();
} catch (e) { setTimeout(() => { throw e; }, 0); }
/* ===== twextra.js ===== */
try {
/* TWstock extra tools, each added to a page that already exists.
   總覽          大盤籌碼溫度: market margin and short balances, and the share of listed stocks above their 20 / 60 day averages.
   股票 → 選股   technical conditions, computed from the last 61 trading days.
   個股分析      借券賣出 (under 融資融券) and 股利與填息.
   持股與損益    today's holdings worked backwards against 0050, position size, backup and restore, Telegram switches,
                 and a second view: 模擬交易 (practice orders with virtual money; no broker, no real orders).
   分析 → 命中率   AI stock analyses and pre-market calls as they were made, checked against what the market then did.
   Reads the dashboard through window.TWDash.api (twmain.js) and daily bars through window.TWLab (twlab.js). */
(function () {
  "use strict";
  let A = null;
  const ok = Number.isFinite;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const msg = t => `<p class="sub">${A.esc(t)}</p>`;
  const row = (k, v, t) => `<div class="snap"><span>${k}</span><b class="${t || ""}">${v}</b></div>`;
  const taipei = () => { const d = new Date(Date.now() + 8 * 3600e3), s = d.toISOString(); return { ymd: s.slice(0, 10).replace(/-/g, ""), mins: d.getUTCHours() * 60 + d.getUTCMinutes() }; };
  /* "115/11/25", "115年11月25日" and "20261125" all become "20261125" */
  const toYmd = v => { const m = String(v).match(/(\d{2,4})\D?(\d{2})\D?(\d{2})/); if (!m) return ""; let y = +m[1]; if (y < 1911) y += 1911; return y + m[2] + m[3]; };
  const slash = ds => (ds ? `${ds.slice(0, 4)}/${ds.slice(4, 6)}/${ds.slice(6)}` : "");
  const ymdOf = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  const dateOf = ds => new Date(+ds.slice(0, 4), +ds.slice(4, 6) - 1, +ds.slice(6));
  const lastDay = () => (A.DB.date ? dateOf(A.DB.date) : new Date());
  const listed = code => { const s = A.DB.by.get(code); return !!s && s.mkt !== "otc" && s.mkt !== "esb"; };
  const nameOf = c => { const s = A.DB.by.get(c); return s ? s.name : c; };
  const money = v => (ok(v) ? A.fmt(Math.round(v)) : "—");
  const twTime = at => new Date(at + 8 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
  const table = (head, rows) => `<div class="xtw"><table class="mtbl xtbl"><thead><tr>${head.map((h, i) => `<th${i ? "" : ' class="l"'}>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  /* the same selling costs the 持股與損益 page uses: 0.1425% (at least NT$20, NT$1 for odd lots) and 0.3% tax, 0.1% for ETFs */
  const FEE = 0.001425, taxRate = code => (/^00/.test(code) ? 0.001 : 0.003);
  /* a typed code or a name → a code we know */
  function findStock(q) {
    const s = String(q || "").trim(); if (!s) return null;
    const hit = A.DB.by.get(s.toUpperCase()) || A.DB.list.find(x => x.name === s) || A.DB.list.find(x => s.startsWith(x.code + " "));
    return hit ? hit.code : null;
  }
  const holdings = () => { const h = A.store.get("twlab-hold", []); return Array.isArray(h) ? h : []; };

  /* ---------------- a line chart for a few series: [{ name, pts: [[yyyymmdd, value]] }] ---------------- */
  function lineChart(host, series, opt = {}) {
    const dates = [...new Set(series.flatMap(s => s.pts.map(p => p[0])))].sort();
    if (dates.length < 2) { host.innerHTML = msg("資料不足，畫不出走勢。"); return; }
    const at = series.map(s => new Map(s.pts)), vals = series.flatMap(s => s.pts.map(p => p[1])).filter(ok);
    let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo || 1) * 0.08; lo -= pad; hi += pad;
    const W = 720, H = 280, L = 52, R = 10, T = 10, B = 24, fmt = opt.fmt || (v => A.fmt(v, 1));
    const x = i => L + (W - L - R) * i / (dates.length - 1), y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    const grid = [0, 1, 2, 3, 4].map(k => { const v = lo + (hi - lo) * k / 4; return `<line class="gridl" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`; }).join("");
    const paths = series.map((s, k) => {
      let d = "", pen = false;
      dates.forEach((ds, i) => { const v = at[k].get(ds); if (!ok(v)) return; d += (pen ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); pen = true; });
      return `<path class="mc-l s${k}" d="${d}"/>`;
    }).join("");
    const mid = Math.floor((dates.length - 1) / 2);
    host.innerHTML = `<div class="mc-key">${series.map((s, k) => `<span><i class="s${k}"></i>${A.esc(s.name)}<b class="mc-v" data-k="${k}"></b></span>`).join("")}<span class="sub mc-d"></span></div>
      <svg class="mc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${A.esc(opt.label || "走勢圖")}">${grid}
        ${[0, mid, dates.length - 1].map((i, k) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${["start", "middle", "end"][k]}">${slash(dates[i])}</text>`).join("")}
        ${paths}<line class="mc-x" y1="${T}" y2="${H - B}" hidden></line></svg>`;
    const svg = $("svg", host), cross = $(".mc-x", host);
    /* the readout shows each series' value on the pointed day (or the latest one it has by then) */
    const read = i => {
      series.forEach((s, k) => {
        let v = NaN; for (let j = i; j >= 0 && !ok(v); j--) v = at[k].get(dates[j]);
        $(`.mc-v[data-k="${k}"]`, host).textContent = ok(v) ? fmt(v) : "—";
      });
      $(".mc-d", host).textContent = slash(dates[i]);
    };
    const move = e => {
      const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W, i = Math.max(0, Math.min(dates.length - 1, Math.round((px - L) / (W - L - R) * (dates.length - 1))));
      cross.removeAttribute("hidden"); cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); read(i);
    };
    svg.addEventListener("pointermove", move); svg.addEventListener("pointerdown", move);
    svg.addEventListener("pointerleave", () => { cross.setAttribute("hidden", ""); read(dates.length - 1); });
    read(dates.length - 1);
  }

  /* ---------------- 融資融券 totals and 借券, the newest published day ---------------- */
  const MARGIN = { v: null, busy: null };
  function loadMargin() {
    if (MARGIN.v) return Promise.resolve(MARGIN.v);
    if (!A.DB.live) return Promise.resolve(null);
    if (MARGIN.busy) return MARGIN.busy;
    MARGIN.busy = (async () => {
      const start = lastDay();
      for (let back = 0; back < 6; back++) {
        const ds = ymdOf(new Date(start.getTime() - back * 864e5));
        const j = await A.J(`https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${ds}&selectType=MS&response=json`);
        const rows = j.stat === "OK" && j.tables && j.tables[0] && j.tables[0].data;
        if (!rows || !rows.length) { await A.wait(500); continue; }
        /* lots of margin and short, and the margin money in NT$ thousand: previous day and today */
        const sum = {};
        rows.forEach(r => { const k = /融資金額/.test(r[0]) ? "money" : /融資/.test(r[0]) ? "margin" : /融券/.test(r[0]) ? "short" : ""; if (k) sum[k] = { prev: A.num(r[4]), now: A.num(r[5]) }; });
        return (MARGIN.v = { date: ds, sum });
      }
      return null;
    })().finally(() => { MARGIN.busy = null; });
    return MARGIN.busy;
  }
  const SBL = { v: null, busy: null };
  function loadSbl() {
    if (SBL.v) return Promise.resolve(SBL.v);
    if (SBL.busy) return SBL.busy;
    SBL.busy = (async () => {
      const start = lastDay();
      for (let back = 0; back < 6; back++) {
        const ds = ymdOf(new Date(start.getTime() - back * 864e5));
        const j = await A.J(`https://www.twse.com.tw/rwd/zh/marginTrading/TWT93U?date=${ds}&response=json`);
        if (j.stat !== "OK" || !(j.data || []).length) { await A.wait(500); continue; }
        return (SBL.v = { date: ds, map: new Map(j.data.map(r => [String(r[0]).trim(), { prev: A.num(r[8]) / 1000, now: A.num(r[12]) / 1000 }])) });
      }
      return null;
    })().finally(() => { SBL.busy = null; });
    return SBL.busy;
  }

  /* ---------------- ex-dividend results of every listed security between two dates ---------------- */
  const DIVS = new Map();
  function dividends(from, to) {
    const key = from + "-" + to;
    if (!DIVS.has(key)) DIVS.set(key, A.J(`https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate=${from}&endDate=${to}&response=json`).then(j => {
      if (j.stat !== "OK" || !Array.isArray(j.data)) throw new Error("no dividend table");
      return j.data.map(r => ({ date: toYmd(r[0]), code: String(r[1]).trim(), before: A.num(r[3]), ref: A.num(r[4]), value: A.num(r[5]), kind: String(r[6]).trim() })).filter(r => r.date);
    }).catch(e => { DIVS.delete(key); throw e; }));
    return DIVS.get(key);
  }
  /* trading days (the ex-date counts as 1) until a close is back at the close before the ex-date; looked for over 12 months */
  async function fillDays(code, ev, onStep) {
    const now = taipei().ymd, first = dateOf(ev.date);
    let seen = 0;
    for (let i = 0; i <= 12; i++) {
      const d = new Date(first.getFullYear(), first.getMonth() + i, 1), ym = ymdOf(d).slice(0, 6);
      if (ym > now.slice(0, 6)) break;
      const finished = ym < now.slice(0, 6);
      if (!finished || !A.store.get(`twh:${code}:${ym}`, null)) await A.wait(700);
      onStep && onStep(ym);
      const bars = await A.histMonth(code, ym, finished);
      if (finished && !bars.length) throw new Error("empty month");
      for (const c of bars) { if (c[0] < ev.date) continue; seen++; if (c[4] >= ev.before) return { days: seen, date: c[0] }; }
    }
    return { days: null, seen };
  }

  /* ---------------- technical figures for every listed stock, from the last 61 trading days ----------------
     Each day's report is read once and kept in IndexedDB; a stopped run carries on where it left off. */
  const NEED = 61;
  let idbP = null;
  const idb = () => idbP || (idbP = new Promise((res, rej) => {
    const q = indexedDB.open("twstock-days", 1);
    q.onupgradeneeded = () => q.result.createObjectStore("days");
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  }).catch(e => { idbP = null; throw e; }));
  const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction("days", mode), r = fn(t.objectStore("days")); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
  async function readDay(ds) {
    const j = await A.J(`https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${ds}&type=ALLBUT0999&response=json`);
    const tb = (j.tables || []).find(x => Array.isArray(x.fields) && x.fields.includes("證券代號") && x.fields.includes("收盤價") && (x.data || []).length > 100);
    if (j.stat !== "OK" || !tb) return null;
    const f = k => tb.fields.findIndex(x => x.includes(k)), iC = f("證券代號"), iV = f("成交股數"), iH = f("最高價"), iL = f("最低價"), iZ = f("收盤價"), rows = {};
    tb.data.forEach(r => { const c = String(r[iC]).trim(), h = A.num(r[iH]), l = A.num(r[iL]), z = A.num(r[iZ]); if (/^(\d{4}|00\d{3,4}[A-Z]?)$/.test(c) && z > 0 && h > 0 && l > 0) rows[c] = [h, l, z, Math.round(A.num(r[iV]) / 1000) || 0]; });
    return rows;
  }
  const TECH = { v: null, busy: null, listeners: new Set() };
  function figures(days) {                       /* days: oldest first, [{ ds, rows }] */
    const by = new Map();
    days.forEach(d => Object.entries(d.rows).forEach(([c, r]) => { if (!by.has(c)) by.set(c, []); by.get(c).push([d.ds, r[2], r[0], r[1], r[2], r[3]]); }));
    const last = days[days.length - 1].ds, out = new Map(), mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    by.forEach((cs, code) => {
      const n = cs.length; if (cs[n - 1][0] !== last || n < 20) return;
      const cl = cs.map(c => c[4]), z = cl[n - 1], I = A.calc(cs);
      let gold = false; for (let i = n - 1; i >= Math.max(1, n - 3); i--) if (I.K[i] > I.D[i] && I.K[i - 1] <= I.D[i - 1]) gold = true;
      const v20 = n > 20 ? mean(cs.slice(-21, -1).map(c => c[5])) : NaN;
      out.set(code, { above20: z > mean(cl.slice(-20)), above60: n >= 60 ? z > mean(cl.slice(-60)) : null, gold: gold && I.K[n - 1] > I.D[n - 1],
        volx: v20 > 0 ? cs[n - 1][5] / v20 : NaN, high60: n >= 60 ? z >= Math.max(...cl.slice(-60)) : null, low60: n >= 60 ? z <= Math.min(...cl.slice(-60)) : null });
    });
    return { date: last, days: days.length, map: out };
  }
  function tech(onStep) {
    if (onStep) TECH.listeners.add(onStep);
    if (TECH.v && TECH.v.date >= A.DB.date) return Promise.resolve(TECH.v);
    if (TECH.busy) return TECH.busy;
    if (!A.DB.live) return Promise.reject(new Error("讀不到資料。"));
    TECH.busy = (async () => {
      const got = [], start = lastDay(), today = taipei().ymd;
      for (let back = 0; back < 130 && got.length < NEED; back++) {
        const d = new Date(start.getTime() - back * 864e5); if (d.getDay() % 6 === 0) continue;
        const ds = ymdOf(d);
        let rec = await tx("readonly", s => s.get(ds)).catch(() => undefined);
        if (rec === undefined) {
          await A.wait(2200);                  /* TWSE blocks pages that ask too fast */
          let rows;
          try { rows = await readDay(ds); } catch (e) { throw new Error(`證交所讀不到（已讀 ${got.length} 天）。再按一次會從這裡接著讀。`); }
          rec = rows;
          if (rows || back > 3) await tx("readwrite", s => s.put(rows, ds)).catch(() => {});   /* null = holiday */
        }
        if (rec) { got.push({ ds, rows: rec }); TECH.listeners.forEach(f => f(got.length, NEED)); }
      }
      if (got.length < NEED && !got.some(x => x.ds <= today)) throw new Error("讀不到足夠的交易日資料。");
      const cut = got.length ? got[got.length - 1].ds : "";
      tx("readwrite", s => s.delete(IDBKeyRange.upperBound(cut, true))).catch(() => {});
      return (TECH.v = figures(got.reverse()));
    })().finally(() => { TECH.busy = null; TECH.listeners.clear(); });
    return TECH.busy;
  }

  /* ================= 個股分析: 借券賣出 under 融資融券, and a 股利與填息 card ================= */
  const stockBox = s => $("#dpStock " + s);
  async function paintSbl(code) {
    const el = stockBox(".xsbl"); if (!el) return;
    el.textContent = "";
    if (!A.DB.live || !listed(code) || /^00/.test(code)) return;
    let v = null; try { v = await loadSbl(); } catch (e) {}
    if (code !== A.code()) return;
    const b = v && v.map.get(code);
    el.textContent = b ? `借券賣出餘額 ${A.fmt(Math.round(b.now))} 張（較前一日 ${A.signed(Math.round(b.now - b.prev), 0)}）・${slash(v.date)}` : "";
  }
  const DV = { code: "", list: [], fill: new Map(), busy: false };
  const divOut = () => stockBox(".sdiv .sxout");
  function paintDivList() {
    const el = divOut(); if (!el) return;
    if (!DV.list.length) { el.innerHTML = msg("近 5 年沒有除權息紀錄。"); return; }
    const years = new Map();
    DV.list.forEach(e => { const y = e.date.slice(0, 4), o = years.get(y) || { cash: 0, n: 0, other: 0 }; if (e.kind === "息") { o.cash += e.value; o.n++; } else o.other++; years.set(y, o); });
    el.innerHTML = table(["年度", "現金股利合計", "除息次數", "含除權"], [...years].sort((a, b) => b[0].localeCompare(a[0])).map(([y, o]) => `<tr><td class="l">${y}</td><td>${o.n ? A.fmt(o.cash, 2) + " 元" : "—"}</td><td>${o.n}</td><td>${o.other ? o.other + " 次" : "—"}</td></tr>`)) +
      `<div class="xscroll">${table(["除權息日", "類別", "權值＋息值", "前一日收盤", "填息天數"], DV.list.slice().reverse().map(e => { const f = DV.fill.get(e.date); return `<tr><td class="l">${slash(e.date)}</td><td>${A.esc(e.kind)}</td><td>${A.fmt(e.value, 2)}</td><td>${A.fmt(e.before, A.dig(e.before))}</td><td>${!f ? "—" : f.days ? f.days + " 天" : "尚未填（看了 " + f.seen + " 天）"}</td></tr>`; }))}</div>
      <div class="xrow"><button type="button" class="btn" data-xfill ${DV.busy ? "disabled" : ""}>計算填息天數</button><span class="sub xfmsg">最近 4 次，最多往後看 12 個月。</span></div>`;
  }
  function resetDiv(code) {
    const el = divOut(); if (!el) return;
    DV.code = code; DV.list = []; DV.fill = new Map();
    el.innerHTML = !A.DB.live || !listed(code) ? msg(A.DB.live ? "只提供上市股票。" : "讀不到資料。") : `<button type="button" class="btn" data-xdivload>讀取近 5 年除權息</button>`;
  }
  async function loadDivs() {
    const c = A.code(), el = divOut(), t = taipei().ymd;
    el.innerHTML = msg("載入中…");
    try {
      const all = await dividends(String(+t.slice(0, 4) - 5) + "0101", t);
      if (c !== A.code()) return;
      DV.code = c; DV.list = all.filter(r => r.code === c).sort((a, b) => (a.date < b.date ? -1 : 1)); paintDivList();
    } catch (e) { if (c === A.code()) el.innerHTML = msg("讀不到股利資料。") + `<button type="button" class="btn" data-xdivload>再試一次</button>`; }
  }
  async function runFill() {
    const c = DV.code; if (DV.busy) return;
    DV.busy = true;
    const say = t => { const m = stockBox(".xfmsg"); if (m) m.textContent = t; };
    const b = stockBox("[data-xfill]"); if (b) b.disabled = true;
    let failed = false;
    for (const ev of DV.list.slice(-4).reverse()) {
      if (c !== A.code() || c !== DV.code) break;
      try { const r = await fillDays(c, ev, ym => say(`讀取 ${ym.slice(0, 4)}/${ym.slice(4)} 日線…`)); if (c === DV.code) { DV.fill.set(ev.date, r); paintDivList(); } }
      catch (e) { failed = true; break; }
    }
    DV.busy = false;
    if (c === A.code() && c === DV.code) { paintDivList(); if (failed) say("日線讀不到，再按一次。"); }
  }
  function buildStockCards() {
    const mg = stockBox(".smg"), fin = stockBox(".sfin"); if (!mg || !fin) return;
    mg.insertAdjacentHTML("beforeend", `<p class="sub xsbl"></p>`);
    const card = document.createElement("div"); card.className = "dcard sx sdiv";
    card.innerHTML = `<div class="aihead"><div><h3>股利與填息</h3></div></div><div class="sxout"></div>`;
    fin.after(card);
    card.addEventListener("click", e => {
      if (e.target.closest("[data-xdivload]")) return loadDivs();
      if (e.target.closest("[data-xfill]")) return runFill();
    });
  }

  /* ================= 總覽: 大盤籌碼溫度 ================= */
  const TP = { margin: null, tech: null, techMsg: "", techBusy: false };
  function paintTemp() {
    const el = $(".xtemp"); if (!el) return;
    if (!A.DB.live) { el.innerHTML = msg(A.DB.list.length ? "讀不到資料。" : "載入中…"); return; }
    const m = TP.margin, S = (m && m.sum) || {}, T = TP.tech;
    const cell = (name, value, sub, t) => `<div class="xcell"><span>${name}</span><b>${value}</b><i class="${t || ""}">${sub}</i></div>`;
    const cash = S.money, short = S.short;
    let h = cell("融資餘額", cash ? A.fmt(cash.now / 1e5, 0) + " 億" : "—", cash ? `較前一日 ${A.signed((cash.now - cash.prev) / 1e5, 1)} 億` : (m === false ? "讀不到" : "載入中…"), cash ? A.tone(cash.now - cash.prev) : "") +
      cell("融券餘額", short ? A.fmt(short.now) + " 張" : "—", short ? `較前一日 ${A.signed(short.now - short.prev, 0)} 張` : "", short ? A.tone(short.now - short.prev) : "");
    if (T) {
      const all = [...T.map.values()], share = k => { const v = all.filter(x => x[k] != null); return v.length ? v.filter(x => x[k]).length / v.length * 100 : NaN; };
      h += cell("站上月線的股票", A.fmt(share("above20"), 1) + "%", `收盤價高於 MA20・${slash(T.date)}`) + cell("站上季線的股票", A.fmt(share("above60"), 1) + "%", "收盤價高於 MA60");
    } else h += `<div class="xcell"><span>站上月線／季線的比例</span>${TP.techBusy ? `<b>計算中</b><div class="xprog"><i style="width:${TP.techPct || 0}%"></i></div>` : `<button type="button" class="btn" data-xtech>重新計算</button>`}<i>${A.esc(TP.techMsg || "")}</i></div>`;
    el.innerHTML = h;
    $(".xtempd").textContent = m ? "上市・融資融券 " + slash(m.date) : "上市";
  }
  async function runTempTech() {
    if (TP.techBusy) return;
    TP.techBusy = true; TP.techMsg = "載入中…"; paintTemp();
    try { TP.tech = await tech((i, n) => { TP.techMsg = `讀取交易日 ${i}/${n}`; TP.techPct = Math.round(i / n * 100); paintTemp(); }); }
    catch (e) { TP.techMsg = e.message; }
    TP.techBusy = false; paintTemp();
  }
  async function loadTemp() {
    paintTemp();
    if (!A.DB.live) return;
    try { TP.margin = (await loadMargin()) || false; } catch (e) { TP.margin = false; }
    paintTemp();
    if (!TP.tech) runTempTech();          /* start on its own: a first read takes a few minutes, later ones only fetch the new days */
  }
  function buildTemp() {
    const strip = $("#dpOverview .mstrip"); if (!strip) return;
    const el = document.createElement("div"); el.className = "dcard xtempcard";
    el.innerHTML = `<div class="bd-h"><h3>大盤籌碼溫度</h3><span class="sub xtempd"></span></div><div class="xtemp"></div>`;
    strip.after(el);
    el.addEventListener("click", e => { if (e.target.closest("[data-xtech]")) runTempTech(); });
    paintTemp();
  }

  /* ================= 股票 → 選股: what twmain.js asks for when a technical condition is chosen ================= */
  /* v: { ma, sig, volx } from the three selects. Returns null while the figures are not there yet. */
  const SCT = { v: null, busy: false, note: "" };
  function screenWants(v) { return !!(v.ma || v.sig || +v.volx > 0); }
  function screenPass(code, v) {
    const x = SCT.v && SCT.v.map.get(code); if (!x) return false;
    if (v.ma && x[v.ma] !== true) return false;
    if (v.sig && x[v.sig] !== true) return false;
    if (+v.volx > 0 && !(x.volx >= +v.volx)) return false;
    return true;
  }
  function screenReady(v, el, repaint) {
    if (!screenWants(v)) return true;
    if (SCT.v && SCT.v.date >= A.DB.date) return true;
    el.innerHTML = `<p class="sub">${A.esc(SCT.note || "技術條件要先讀最近 61 個交易日的收盤資料。第一次約 3 分鐘，之後只讀新的日期。只含上市股票，收盤價未還原除權息。")}</p>${SCT.busy ? "" : `<button type="button" class="btn xscload">讀取技術資料</button>`}`;
    const b = $(".xscload", el);
    if (b) b.addEventListener("click", async () => {
      SCT.busy = true; SCT.note = "載入中…"; repaint();
      try { SCT.v = await tech((i, n) => { SCT.note = `讀取交易日 ${i}/${n}…`; repaint(); }); SCT.note = ""; }
      catch (e) { SCT.note = e.message || "讀不到技術資料。"; }
      SCT.busy = false; repaint();
    });
    return false;
  }

  /* ================= 持股與損益: extra cards, and a switch to 模擬交易 ================= */
  const holdPanel = () => document.getElementById("dpHold");
  const holdOn = () => A && A.tabNow() === "dpHold";
  let HV = "hold";
  const simBox = () => $("#dpHold .xsim");
  const simShown = () => holdOn() && HV === "sim";

  /* what today's share counts and cash would have done over about six months, next to 0050: not the account's real record */
  async function holdCurve() {
    const q = s => $("#dpHold " + s), say = t => { q(".lcmsg").textContent = t; };
    const H = holdings(), cash = +A.store.get("twlab-cash", 0) || 0;
    if (!H.length) return say("先新增持股。");
    if (!A.DB.live) return say("讀不到資料。");
    const codes = [...new Set(H.map(h => h.code).concat(["0050"]))], series = new Map();
    for (let i = 0; i < codes.length; i++) {
      say(`讀取日線 ${i + 1}/${codes.length}（${nameOf(codes[i])}）… 第一次會比較久，之後有快取。`);
      try { series.set(codes[i], await TWLab.bars(codes[i], 7)); } catch (e) { series.set(codes[i], []); }
    }
    const used = H.filter(h => (series.get(h.code) || []).length > 20), left = H.filter(h => !used.includes(h));
    const bench = series.get("0050") || [];
    if (!used.length || bench.length < 20) return say("讀不到日線資料。");
    /* from the first day every used holding and 0050 have a price; a day without a trade keeps the last close */
    const start = used.map(h => series.get(h.code)[0][0]).concat([bench[0][0]]).sort().pop();
    const maps = used.map(h => new Map(series.get(h.code).map(c => [c[0], c[4]]))), last = used.map(() => NaN);
    used.forEach((h, i) => series.get(h.code).forEach(c => { if (c[0] <= start) last[i] = c[4]; }));
    const days = bench.filter(c => c[0] >= start);
    const value = days.map(c => cash + used.reduce((a, h, i) => { const px = maps[i].get(c[0]); if (ok(px)) last[i] = px; return a + last[i] * h.shares; }, 0));
    const mine = days.map((c, i) => [c[0], (value[i] / value[0] - 1) * 100]), mkt = days.map(c => [c[0], (c[4] / days[0][4] - 1) * 100]);
    const gap = mine[mine.length - 1][1] - mkt[mkt.length - 1][1];
    q(".lcurve").innerHTML = `<div class="lcchart"></div>${row("目前持股組合", A.pct(mine[mine.length - 1][1]), A.tone(mine[mine.length - 1][1]))}${row("0050", A.pct(mkt[mkt.length - 1][1]), A.tone(mkt[mkt.length - 1][1]))}${row("差距（百分點）", A.signed(gap, 2), A.tone(gap))}`;
    lineChart(q(".lcchart"), [{ name: "目前持股組合", pts: mine }, { name: "0050", pts: mkt }], { label: "目前持股回推與 0050 的漲跌幅", fmt: v => A.fmt(v, 1) + "%" });
    say(`假設從 ${slash(start)} 起就持有現在的股數與現金。這是回推，不是你帳戶的實際績效；未含股利與交易成本，價格未還原分割。` + (left.length ? `日線不足未計入：${left.map(h => nameOf(h.code)).join("、")}。` : ""));
  }

  /* how many shares fit a stop: the loss at the stop, fees and tax included, stays inside the chosen share of capital */
  function sizePosition() {
    const out = $("#dpHold .lsizeout"), v = n => parseFloat($(`#dpHold [name="${n}"]`).value), code = $('#dpHold [name="zcode"]').value.trim();
    const entry = v("zin"), stop = v("zstop"), capital = v("zcap"), risk = v("zrisk");
    if (!(entry > 0 && stop > 0 && capital > 0 && risk > 0)) { out.innerHTML = msg("填入進場價、停損價與總資金。"); return; }
    if (stop >= entry) { out.innerHTML = `<p class="sub warn">停損價要低於進場價。</p>`; return; }
    const fee = (x, n) => Math.max(n % 1000 ? 1 : 20, Math.round(x * FEE)), tax = taxRate(code);
    const lossAt = n => (n ? n * entry + fee(n * entry, n) - (n * stop - fee(n * stop, n) - Math.round(n * stop * tax)) : 0);
    const fits = n => lossAt(n) <= capital * risk / 100 && n * entry + fee(n * entry, n) <= capital;
    let lo = 0, hi = Math.floor(capital / entry);                  /* the most shares both the loss budget and the cash allow */
    while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (fits(m)) lo = m; else hi = m - 1; }
    /* whole lots carry the NT$20 minimum, so a lot just below the answer can fit where odd lots near it do not (and the reverse) */
    const lot = Math.floor(lo / 1000) * 1000 + 1000; if (lot <= capital / entry && fits(lot)) lo = lot;
    const n = lo, value = n * entry;
    out.innerHTML = n ? row("最多可買", `${A.fmt(n)} 股（${A.fmt(Math.floor(n / 1000))} 張＋${A.fmt(n % 1000)} 股零股）`) + row("投入金額（含手續費）", A.fmt(Math.round(value + fee(value, n))) + " 元") + row("占總資金", A.fmt(value / capital * 100, 1) + "%") +
      row("停損時虧損（含費稅）", A.fmt(Math.round(lossAt(n))) + " 元") + row("停損距離", A.fmt((entry - stop) / entry * 100, 2) + "%") + row("2 倍風險的目標價", A.fmt(entry + 2 * (entry - stop), A.dig(entry))) +
      msg(`跳空跌破停損價時，實際虧損會更大。證交稅率 ${A.fmt(tax * 100, 1)}%。`) : `<p class="sub warn">這個虧損上限連 1 股都買不了。</p>`;
  }

  /* ---- backup and restore: the user's own records and choices, not the cached market data ---- */
  const KEEP = /^(twstock-(device|theme)$|twtrade-|twlab-|twmain-|tw-palerts$|tw-fee-disc$|tw-recent$|twsim$|twlog-|twalert-opt$)/;
  const ownKeys = () => { const out = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (KEEP.test(k)) out.push(k); } return out; };
  const TG = [["stock", "自選與持股 ±5%、漲跌停"], ["index", "大盤與台指期夜盤大漲跌"], ["news", "篩選的重大新聞與公告"], ["bell", "開盤與收盤通知"], ["notes", "盤前、盤中、收盤摘要與週回顧"]];
  let pendingRestore = null, tgState = null;
  function backup() {
    const data = {}; ownKeys().forEach(k => { data[k] = localStorage.getItem(k); });
    const a = document.createElement("a"), day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: "twstock", version: 1, at: Date.now(), data }, null, 1)], { type: "application/json" })); a.download = `twstock-backup-${day}.json`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    A.store.set("twlab-backup-at", Date.now()); paintBackupNote();
  }
  function paintBackupNote() {
    const el = $(".setlast"); if (!el) return;
    const at = A.store.get("twlab-backup-at", 0);
    el.textContent = at ? `上次備份：${twTime(at)}` : "還沒有備份過。";
  }
  function readBackup(file) {
    const say = t => { $(".setmsg").textContent = t; }, go = $(".setdlg [data-restore]");
    pendingRestore = null; go.hidden = true;
    if (!file) return;
    if (file.size > 5e6) return say("檔案太大，不像本站的備份。");
    const r = new FileReader();
    r.onload = () => {
      let j = null; try { j = JSON.parse(String(r.result)); } catch (e) {}
      const entries = j && j.app === "twstock" && j.data && typeof j.data === "object" ? Object.entries(j.data).filter(([k, v]) => KEEP.test(k) && typeof v === "string") : [];
      if (!entries.length) return say("這不是本站的備份檔。");
      pendingRestore = entries; go.hidden = false;
      say(`備份時間 ${ok(j.at) ? twTime(j.at) : "不明"}，共 ${entries.length} 項。按「確認還原」會用備份覆蓋同名的資料；持股、交易紀錄與自選股也會同步到其他裝置。`);
    };
    r.readAsText(file);
  }
  /* written through the app's own store, which stamps synced items as newest so the older synced copy does not come back over them */
  function restore() {
    if (!pendingRestore) return;
    try {
      pendingRestore.forEach(([k, v]) => {
        if (k === "twstock-theme" || k === "twstock-device") return localStorage.setItem(k, v);
        let parsed; try { parsed = JSON.parse(v); } catch (e) { return localStorage.setItem(k, v); }
        A.store.set(k, parsed);
        if (localStorage.getItem(k) !== JSON.stringify(parsed)) throw new Error("full");
      });
    } catch (e) { $(".setmsg").textContent = "瀏覽器空間不足，只還原了一部分。清出空間後再還原一次。"; return; }
    location.reload();
  }
  function paintTg() {
    const el = $(".settg"); if (!el) return;
    const S = tgState;
    el.textContent = !S ? "" : S.old ? "目前部署的 Worker 還是舊版，這些開關要部署新版後才生效。" : S.ok ? "" : S.owner === false ? "只有擁有者裝置的設定會生效。" : "同步失敗。";
  }

  function holdExtraHTML() {
    const opt = A.store.get("twalert-opt", {}) || {}, cash = +A.store.get("twlab-cash", 0) || 0;
    const mv = holdings().reduce((a, h) => { const s = A.DB.by.get(h.code); return a + (s && s.price > 0 ? s.price * h.shares : 0); }, 0);
    return `<div class="dcard"><div class="aihead"><div><h3>持股走勢與 0050 比較</h3></div><button type="button" class="aigo" data-xcurve>畫出走勢</button></div><p class="sub lcmsg" role="status"></p><div class="lcurve"></div></div>`;
  }
  /* top-right 設定: one popup for look, defaults, refresh, notifications and the user's own data */
  const PAGES = [["", "總覽"], ["dpChip", "籌碼"], ["dpInd", "產業"], ["dpList", "股票"], ["dpHold", "持股與損益"], ["dpPre", "分析"], ["dpRev", "復盤"], ["dpCal", "市場日曆"]];
  const SETS = [
    ["外觀", "theme", [["system", "系統"], ["light", "淺色"], ["dark", "深色"]]],
    ["漲跌顏色", "ud", [["tw", "紅漲綠跌"], ["intl", "綠漲紅跌"]]],
    ["預設開啟頁面", "home", PAGES],
    ["股票預設分頁", "lst", [["ls", "清單"], ["rk", "排行"], ["sc", "選股"], ["rv", "營收"]]],
    ["日曆預設範圍", "cmine", [["0", "全部"], ["1", "我的"]]],
    ["日曆預設檢視", "cmode", [["list", "列表"], ["grid", "月曆"]]],
    ["行情更新頻率", "poll", [["auto", "自動"], ["5", "5 秒"], ["10", "10 秒"], ["manual", "手動"]]],
    ["動畫速度", "speed", [["1.5", "慢"], ["1", "標準"], ["0.6", "快"]]],
  ];
  const setVal = k => k === "theme" ? (window.__twTheme ? window.__twTheme.mode : "system") : window.TWSet.get(k);
  function openSettings() {
    let el = $(".setdlg"); if (el || !window.TWSet) return;
    const opt = A.store.get("twalert-opt", {}) || {};
    el = document.createElement("div"); el.className = "kbhelp setdlg"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "設定");
    const grp = ks => SETS.filter(x => ks.includes(x[1])).map(([t, k, o]) => `<div class="setsec"><b>${t}</b><div class="setrow" data-set="${k}">${o.map(([v, l]) => `<button type="button" class="chip" data-v="${v}" aria-pressed="${String(setVal(k)) === v}">${l}</button>`).join("")}</div></div>`).join("");
    const TABS = [["look", "顯示", grp(["theme", "ud", "speed"])], ["def", "預設", grp(["home", "lst", "cmine", "cmode"])],
      ["feed", "行情與通知", grp(["poll"]) + `<div class="setsec"><b>Telegram 通知</b>${TG.map(([k, t]) => `<label class="lcheck"><input type="checkbox" data-tg="${k}" ${opt[k] === false ? "" : "checked"}><span>${t}</span></label>`).join("")}<p class="sub settg" role="status"></p></div>`],
      ["help", "說明", `<div class="setsec"><a class="btn thhelp" href="help.html">開啟說明頁</a></div>`],
      ["data", "資料", `<div class="setsec"><b>備份與清除</b><div class="xrow"><button type="button" class="aigo" data-backup>下載備份</button><label class="btn xfile">選擇備份檔還原<input type="file" accept=".json,application/json" hidden></label><button type="button" class="btn" data-restore hidden>確認還原</button><button type="button" class="btn" data-wipe>清除本機資料</button></div><p class="sub setlast"></p><p class="sub setmsg" role="status"></p></div>`]];
    el.innerHTML = `<div class="kbcard setcard"><h3>設定</h3><div class="settabs" role="tablist">${TABS.map(([k, t], i) => `<button type="button" class="chip" role="tab" data-tab="${k}" aria-pressed="${i === 0}">${t}</button>`).join("")}</div>${TABS.map(([k, , h], i) => `<div class="setpane" data-pane="${k}"${i ? " hidden" : ""}>${h}</div>`).join("")}</div>`;
    const shut = () => { document.removeEventListener("keydown", esc); el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" }).onfinish = () => el.remove(); };
    const esc = e => { if (e.key === "Escape") shut(); };
    document.addEventListener("keydown", esc);
    let wipeT = 0;
    el.addEventListener("click", e => {
      if (!e.target.closest(".kbcard")) return shut();
      const tb = e.target.closest("[data-tab]");
      if (tb) {
        $$("[data-tab]", el).forEach(x => x.setAttribute("aria-pressed", String(x === tb)));
        $$("[data-pane]", el).forEach(p => { const on = p.dataset.pane === tb.dataset.tab; if (on && p.hidden) { p.hidden = false; p.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.16,1,.3,1)" }); } else if (!on) p.hidden = true; });
        return;
      }
      const row = e.target.closest("[data-set]"), b = e.target.closest("[data-v]");
      if (row && b) {
        $$("[data-v]", row).forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        if (row.dataset.set === "theme") window.__twTheme && window.__twTheme.set(b.dataset.v); else window.TWSet.set(row.dataset.set, b.dataset.v);
        return;
      }
      if (e.target.closest("[data-backup]")) return backup();
      if (e.target.closest("[data-restore]")) return restore();
      const w = e.target.closest("[data-wipe]");
      if (w) {
        if (!wipeT) { w.textContent = "再按一次確認清除"; wipeT = setTimeout(() => { wipeT = 0; w.textContent = "清除本機資料"; }, 4000); return; }
        clearTimeout(wipeT);
        const dead = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^tw/.test(k) && k !== "twstock-device") dead.push(k); }
        dead.forEach(k => localStorage.removeItem(k)); try { sessionStorage.clear(); } catch (x) {}
        location.reload();
      }
    });
    el.addEventListener("change", e => {
      const t = e.target;
      if (t.type === "file") return readBackup(t.files && t.files[0]);
      if (!t.dataset.tg) return; const o = A.store.get("twalert-opt", {}) || {}; o[t.dataset.tg] = t.checked; A.store.set("twalert-opt", o); tgState = null; $(".settg", el).textContent = "同步中…"; document.dispatchEvent(new Event("twalert:change"));
    });
    document.body.appendChild(el); paintTg(); paintBackupNote();
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
    $(".kbcard", el).animate([{ transform: "scale(.94) translateY(8px)" }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.9,.3,1.2)" });
  }
  document.addEventListener("twdash:settings", () => { if (A) openSettings(); });
  /* the 持股與損益 page is drawn by twmore.js; the switch and these cards sit around it and are put back if it redraws */
  function mountHold() {
    const el = holdPanel(); if (!el || !$(".sbpage", el) || !A.DB.list.length) return;
    if (!$(".xviews", el)) {
      el.insertAdjacentHTML("afterbegin", `<div class="chips xviews">${[["hold", "持股"], ["sim", "模擬交易"]].map(([k, t]) => `<button type="button" class="chip" data-xview="${k}" aria-pressed="${k === HV}">${t}</button>`).join("")}</div>`);
      el.insertAdjacentHTML("beforeend", `<div class="xhold">${holdExtraHTML()}</div><div class="xsim" hidden></div>`);
      buildSim(); paintBackupNote(); paintTg();
    }
    showHoldView(HV);
  }
  function showHoldView(v) {
    HV = v;
    const el = holdPanel(), page = $(".sbpage", el); if (!page || !$(".xviews", el)) return;
    $$("[data-xview]", el).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.xview === v)));
    page.hidden = v !== "hold"; $(".xhold", el).hidden = v !== "hold"; $(".xsim", el).hidden = v !== "sim";
    if (v === "sim") { paintSim(); paintQuote(); A.rtPoll(); }
  }
  function bindHold() {
    const el = holdPanel(); if (!el) return;
    el.addEventListener("click", e => {
      const v = e.target.closest("[data-xview]"); if (v) return showHoldView(v.dataset.xview);
      const c = e.target.closest("[data-xcurve]"); if (c) { c.disabled = true; holdCurve().finally(() => { c.disabled = false; }); return; }
      if (e.target.closest("[data-backup]")) return backup();
      if (e.target.closest("[data-restore]")) return restore();
    });
    el.addEventListener("input", e => { if (/^z(code|in|stop|cap|risk)$/.test(e.target.name)) sizePosition(); });
    el.addEventListener("change", e => {
      const t = e.target;
      if (t.type === "file" && t.closest(".xhold")) return readBackup(t.files && t.files[0]);
    });
    new MutationObserver(() => { if ($(".sbpage", el) && !$(".xviews", el)) mountHold(); }).observe(el, { childList: true });
  }

  /* ================= 模擬交易 ================= */
  const START = 10000000;
  function account() {
    const a = A.store.get("twsim", null);
    if (a && a.start === 1000000 && a.cash === 1000000 && Array.isArray(a.log) && !a.log.length && Array.isArray(a.pos) && !a.pos.length) { a.start = START; a.cash = START; A.store.set("twsim", a); }   /* an untouched account takes the new starting cash */
    return a && ok(a.cash) && Array.isArray(a.pos) && Array.isArray(a.log) ? a : { start: START, cash: START, pos: [], log: [], pick: "" };
  }
  const save = a => A.store.set("twsim", a);
  const feeOf = (v, shares) => Math.max(shares % 1000 ? 1 : 20, Math.round(v * FEE));
  const taxAmt = (code, v) => Math.round(v * taxRate(code));
  function buildSim() {
    simBox().innerHTML = `
      <div class="dcard"><h3>模擬帳戶（虛擬資金，不會送出任何真實委託）</h3><div class="simsum"></div></div>
      <div class="dcard"><h3>下單</h3>
        <div class="lform"><label>股票 <input class="in" name="code" list="twstocks" autocomplete="off" placeholder="代號或名稱"></label>
          <label>股數（1 張＝1000）<input class="in" name="qty" inputmode="numeric" value="1000"></label>
          <button type="button" class="aigo simbuy" data-side="buy">模擬買進</button><button type="button" class="btn" data-side="sell">模擬賣出</button></div>
        <p class="sub simquote"></p><p class="sub simmsg" role="status"></p></div>
      <div class="dcard"><h3>目前部位</h3><div class="simpos"></div></div>
      <div class="dcard"><h3>成交紀錄</h3><div class="simlog"></div><div class="lform"><button type="button" class="btn" data-reset>重設帳戶</button></div></div>`;
    const el = simBox(); let armed = 0;
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
  function priceNote(s) { return s.rt ? `盤中 ${s.tm || ""}` : `收盤 ${slash(A.DB.date)}`; }
  function paintQuote() {
    const el = simBox(), c = findStock($('[name="code"]', el).value), q = $(".simquote", el), s = c && A.DB.by.get(c);
    if (!s || !(s.price > 0)) { q.textContent = c ? "這檔目前沒有價格。" : ""; return; }
    const n = parseInt($('[name="qty"]', el).value, 10), v = n > 0 ? s.price * n : NaN;
    q.textContent = `${s.name} 成交價 ${A.fmt(s.price, A.dig(s.price))}（${priceNote(s)}）` + (ok(v) ? `・金額 ${money(v)}，手續費 ${money(feeOf(v, n))}，賣出時另扣證交稅 ${money(taxAmt(c, v))}` : "");
  }
  async function order(side) {
    const el = simBox(), say = (t, warn) => { const m = $(".simmsg", el); m.textContent = t; m.classList.toggle("warn", !!warn); };
    const c = findStock($('[name="code"]', el).value), raw = $('[name="qty"]', el).value.trim(), n = Number(raw);
    if (!A.DB.live) return say("讀不到資料。", true);
    if (!c) return say("找不到這檔股票。", true);
    if (!Number.isInteger(n) || n <= 0) return say("股數要是正整數。", true);
    await A.quoteNow(c);
    const s = A.DB.by.get(c);
    if (!(s.price > 0)) return say("這檔目前沒有價格，不能成交。", true);
    const a = account(), v = s.price * n, fee = feeOf(v, n), h = a.pos.find(x => x.code === c);
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
    { const q = $('[name="qty"]', el); q.value = ""; q.dispatchEvent(new Event("input", { bubbles: true })); }   /* the next order starts from an empty box */
    say(`已模擬${side === "buy" ? "買進" : "賣出"} ${s.name} ${A.fmt(n)} 股 @ ${A.fmt(s.price, A.dig(s.price))}。`);
  }
  function paintSim() {
    const el = simBox(), a = account(), F = A.fmt;
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
    if (logShown()) paintLog();
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
    if (logShown()) paintLog();
  }
  /* the rules the opening-bell message uses: 開高 means a gap above 20 points, 開低 below −20, otherwise within 60 */
  const openHit = (call, gap) => (/高/.test(call) ? gap > 20 : /低/.test(call) ? gap < -20 : Math.abs(gap) <= 60);
  /* 收紅 / 收黑 by the sign of the day's change; 平盤 within 0.2% of the previous close */
  const closeHit = (call, chg, prev) => (/紅/.test(call) ? chg > 0 : /黑/.test(call) ? chg < 0 : Math.abs(chg / prev) <= 0.002);
  async function indexDays() {                       /* yyyymmdd → { o, c, prev } of the TAIEX, about a year */
    const j = await A.J(`${A.worker}/tw/chart?k=t00&r=day`), out = new Map(); let prev = NaN;
    (j.pts || []).forEach(p => { const ds = new Date((p[0] + 8 * 3600) * 1000).toISOString().slice(0, 10).replace(/-/g, ""); out.set(ds, { o: p[5], c: p[1], prev }); prev = p[1]; });
    return out;
  }
  let checking = false;
  async function checkLog() {
    if (checking) return;
    const el = logBox(), say = t => { const m = $(".logmsg", el); if (m) m.textContent = t; };
    if (!A.DB.live) return say("讀不到資料。");
    checking = true; $("[data-check]", el).disabled = true; say("讀取加權指數…");
    const now = taipei(), done = d => d < now.ymd || (d === now.ymd && now.mins >= 14 * 60);
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
    logBox().innerHTML = `
      <div class="xsec"><div class="aihead"><div><h3>判斷命中率</h3></div><button type="button" class="aigo" data-check>更新對照結果</button></div>
        <p class="sub">紀錄只存在這個瀏覽器，從開始使用這項功能起累積。個股分析要在本站看過才會記下。</p><p class="sub logmsg" role="status"></p></div>
      <div class="xsec"><h4>個股分析命中率</h4><div class="logsum"></div></div><div class="xsec"><h4>盤前預測命中率</h4><div class="logpmsum"></div></div>
      <div class="xsec"><h4>個股分析紀錄</h4><div class="logai"></div></div>
      <div class="xsec"><h4>盤前預測紀錄</h4><div class="logpm"></div></div>`;
    logBox().addEventListener("click", e => {
      if (e.target.closest("[data-check]")) return checkLog();
      const o = e.target.closest("[data-open]"); if (o) return A.openStock(o.dataset.open);
      const d = e.target.closest("[data-logdrop]"); if (d) { A.store.set("twlog-ai", aiLog().filter(x => x.code + ":" + x.at !== d.dataset.logdrop)); paintLog(); }
    });
  }
  const side = s => (/多/.test(s) ? 1 : /空/.test(s) ? -1 : 0);
  function paintLog() {
    const el = logBox(), L = aiLog(), P = pmLog();
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
    $(".logai", el).innerHTML = L.length ? table(["分析時間", "股票", "判斷", "當時價格", "5 日", "10 日", "20 日", ""], L.map(x => `<tr><td class="l">${twTime(x.at)}</td><td><button type="button" class="chip" data-open="${A.esc(x.code)}">${A.esc(x.name)} ${A.esc(x.code)}</button></td><td title="${A.esc(x.headline)}">${A.esc(x.stance || "—")}${x.action ? "・" + A.esc(x.action) : ""}</td><td>${A.fmt(x.price, A.dig(x.price))}</td>${HORIZON.map(h => { const r = x.res && x.res[h]; return !r ? "<td>—</td>" : r.skip ? "<td>價格不連續</td>" : `<td class="${A.tone(r.ret)}">${A.pct(r.ret)}</td>`; }).join("")}<td><button type="button" class="lx" data-logdrop="${A.esc(x.code + ":" + x.at)}" aria-label="刪除這筆紀錄">×</button></td></tr>`)) : msg("還沒有紀錄。到「個股分析」跑一次 分析就會出現在這裡。");
    $(".logpm", el).innerHTML = P.length ? table(["日期", "開盤預測", "實際跳空", "開盤結果", "收盤預測", "實際漲跌", "收盤結果"], P.slice(0, 60).map(x => `<tr><td class="l">${A.esc(x.day)}</td><td>${A.esc(x.call)}</td><td>${ok(x.openGap) ? A.signed(x.openGap, 0) + " 點" : "—"}</td><td>${mark(x.openOk)}</td><td>${A.esc(x.close || "—")}</td><td>${ok(x.chg) ? A.signed(x.chg, 0) + " 點" : "—"}</td><td>${mark(x.closeOk)}</td></tr>`)) : msg("還沒有紀錄。開過「盤前分析」頁後會記下。");
  }

  /* ---------------- 復盤 → 命中率 ---------------- */
  const logCard = () => $("#dpRev .xlog");
  const logBox = () => $("#dpRev .xlogbody");
  const logShown = () => { const c = logCard(); return !!c && !c.hidden && A.tabNow() === "dpRev"; };
  function mountLog() {
    const rev = document.getElementById("dpRev"); if (!rev) return;
    const card = document.createElement("div"); card.className = "dcard xlog";
    card.innerHTML = `<div class="xlogbody"></div>`;
    rev.appendChild(card);
    buildLog(); paintLog();
    document.addEventListener("twdash:revopen", () => paintLog());
  }

  /* ---------------- start ---------------- */
  const stockOptions = () => `<datalist id="twstocks">${A.DB.list.map(s => `<option value="${A.esc(s.code)} ${A.esc(s.name)}"></option>`).join("")}</datalist>`;
  window.TWExtra = {
    /* the codes whose live quotes this file needs while 持股與損益 is open */
    liveCodes: () => { const a = A && A.store.get("twsim", null); return [...new Set([...(A ? holdings().map(h => h.code) : []), ...((a && a.pos) || []).map(p => p.code), (a && a.pick) || ""])].filter(Boolean).slice(0, 70); },
    screenWants, screenReady, screenPass,
  };
  function init() {
    if (A) return;
    A = window.TWDash && window.TWDash.api; if (!A) return;
    A.tech = tech;
    document.body.insertAdjacentHTML("beforeend", `<datalist id="twstocks"></datalist>`);
    buildStockCards(); buildTemp(); bindHold(); mountLog();
    if (A.DB.list.length) onList();
  }
  document.addEventListener("twdash:stock", e => { if (A) { paintSbl(e.detail); resetDiv(e.detail); } });
  function onList() {
    if (!A) return;
    const list = document.getElementById("twstocks"); if (list) list.outerHTML = stockOptions();
    loadTemp(); paintSbl(A.code()); resetDiv(A.code()); mountHold();
    if (logShown()) paintLog();
    /* today's note is read even when 分析 is never opened, so the record has no gaps on days the site is visited */
    A.J(`${A.worker}/tw/premarket`).then(recordPM, () => {});
  }
  document.addEventListener("twdash:list", onList);
  document.addEventListener("twdash:live", () => { if (A && simShown()) { paintSim(); paintQuote(); } });
  document.addEventListener("twdash:ai", e => { if (A) recordAI(e.detail); });
  document.addEventListener("twdash:premarket", e => { if (A) recordPM(e.detail); });
  document.addEventListener("twdash:alertsync", e => { tgState = e.detail; if (A) paintTg(); });
  /* holdings synced from another device, or changed on the page: the size and backup cards keep their own values */
  document.addEventListener("tw:synced", () => { if (A && simShown()) paintSim(); });
  /* this file loads after twmain.js, which has usually said "ready" already */
  if (window.TWDash && window.TWDash.api) init(); else document.addEventListener("twdash:ready", init, { once: true });
})();
} catch (e) { setTimeout(() => { throw e; }, 0); }
/* ===== twnew.js ===== */
try {
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
  function paintInd(animate) {
    A.paintHeat(animate); A.gpPaint(); irPaint(animate);
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
} catch (e) { setTimeout(() => { throw e; }, 0); }
/* ===== twnew2.js ===== */
try {
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
    catch (e) { S.data = null; $(".ccout", S.card).innerHTML = `<p class="sub">讀不到資料（${A.esc(A.whyOf(e))}）。</p>`; }
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
    catch (e) { const rk = $("#dpList .rk"); if (rk) $$('[data-x="hi"] .xl, [data-x="lo"] .xl', rk).forEach(el => { el.dataset.h = ""; el.innerHTML = `<p class="sub">${esc(e.message || "讀不到")}</p>`; }); }
    techBusy = false;
  }

  /* ================= 股票 → 比較 ================= */
  const CK = "twmain-cmp", COLORS = ["#d98a1a", "#3a7bd5", "#c63a3a", "#2f9b6a"];
  const spanGet = () => { if (!CP.span) CP.span = (A.store.get("twnew2-cpspan", 60) | 0) || 60; return CP.span; };
  const CP = { codes: null, hist: new Map(), q: "", span: 0 };
  function cpCodes() {
    if (CP.codes) return CP.codes;
    const s = A.store.get(CK, null);
    CP.codes = Array.isArray(s) && s.length ? s.filter(c => /^\d{4,6}[A-Z]?$/.test(c)).slice(0, 4) : [];
    if (!CP.codes.length) { const w = A.watch().filter(c => A.DB.by.get(c) && /^\d{4}$/.test(c)); CP.codes = (w.length >= 2 ? w : ["2330", "2454"]).slice(0, 2).filter(c => A.DB.by.get(c)); }
    return CP.codes;
  }
  function buildCompare(dl) {
    const card = document.createElement("div"); card.className = "dcard cpc"; card.dataset.sub = "cp"; card.hidden = true;
    card.innerHTML = `<div class="cpbar"><div class="cpchips"></div><div class="cpadd"><input class="in cpq" type="text" inputmode="search" autocomplete="off" placeholder="代號或名稱" aria-label="加入比較"></div></div><div class="chips cpspan">${[[20, "20 日"], [60, "60 日"], [120, "120 日"]].map(([n, t]) => `<button type="button" class="chip" data-cpspan="${n}" aria-pressed="${n === spanGet()}">${t}</button>`).join("")}</div><div class="cpchart"></div><div class="cptbl"></div>`;
    const rk = $(".rk", dl); (rk || dl.lastElementChild).after(card);
    const q = $(".cpq", card);
    const add = () => { const hit = A.findStock && A.findStock(q.value); if (!hit) return; q.value = ""; const c = cpCodes(); if (!c.includes(hit.code)) { if (c.length >= 4) c.shift(); c.push(hit.code); CP.codes = c; A.store.set(CK, CP.codes); } cpPaint(true); };
    q.addEventListener("change", add); q.addEventListener("keydown", e => { if (e.key === "Enter" && !e.defaultPrevented) { e.preventDefault(); add(); } });
    card.addEventListener("click", e => {
      const sp = e.target.closest("[data-cpspan]"); if (sp) { CP.span = +sp.dataset.cpspan; A.store.set("twnew2-cpspan", CP.span); $$("[data-cpspan]", card).forEach(b => b.setAttribute("aria-pressed", String(b === sp))); cpPaint(true); return; }
      const x = e.target.closest("[data-rm]"); if (x) { CP.codes = cpCodes().filter(c => c !== x.dataset.rm); A.store.set(CK, CP.codes); cpPaint(true); return; }
      const o = e.target.closest("[data-open]"); if (o) A.openStock(o.dataset.open);
    });
  }
  const ret = (cs, n) => { if (!cs || cs.length <= n) return NaN; const a = cs[cs.length - 1][4], b = cs[cs.length - 1 - n][4]; return b > 0 ? (a / b - 1) * 100 : NaN; };
  async function cpPaint(animate) {
    const card = $("#dpList .cpc"); if (!card || card.hidden) return;
    const codes = cpCodes(); if (!A.DB.list.length) return;
    const chipHtml = codes.map((c, i) => `<span class="cpchip" style="--c:${COLORS[i]}"><i></i><button type="button" data-open="${esc(c)}">${esc(nm(c))} <em>${esc(c)}</em></button><button type="button" class="scx" data-rm="${esc(c)}" aria-label="移除">×</button></span>`).join(""), cb = $(".cpchips", card);
    if (cb.dataset.h !== chipHtml) { cb.dataset.h = chipHtml; cb.innerHTML = chipHtml; }
    $(".cpadd", card).hidden = codes.length >= 4;
    await Promise.all([A.loadFund(), A.loadChip()].map(p => p.catch(() => {})));
    await Promise.all(codes.map(c => CP.hist.has(c) ? 0 : A.loadHist(c, more => { CP.hist.set(c, more); cpPaint(false); }).then(cs => { if (!CP.hist.has(c) || (cs && cs.length > (CP.hist.get(c) || []).length)) CP.hist.set(c, cs); }).catch(() => CP.hist.set(c, null))));
    if (card.hidden || codes.join() !== cpCodes().join()) return;
    const F = A.FUND.map || new Map(), C = (A.CHIP && A.CHIP.map) || new Map(), ind = {};
    A.heatGroups().forEach(g => g.list.forEach(s => { ind[s.code] = g.name; }));
    const M = codes.map(c => { const s = A.DB.by.get(c) || { code: c, name: c, price: NaN, pct: NaN, chg: 0, vol: 0 }, f = F.get(c) || {}, cs = CP.hist.get(c); return { c, s, f, chip: C.get(c), cs, r20: ret(cs, 20), r60: ret(cs, 60) }; });
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
    const S = M.filter(m => m.cs && m.cs.length > 5).map(m => { const cs = m.cs.slice(-(spanGet() + 1)), b = cs[0][4]; return { c: m.c, i: M.indexOf(m), v: cs.map(x => x[4] / b * 100) }; });
    const host = $(".cpchart", card);
    if (!S.length) { host.innerHTML = ""; host.dataset.h = ""; return; }
    const W = 640, H = 220, pad = 8, n = Math.max(...S.map(s => s.v.length)), all = S.flatMap(s => s.v), lo = Math.min(...all, 100), hi = Math.max(...all, 100), sp = hi - lo || 1;
    const X = (i, len) => (pad + i / Math.max(1, len - 1) * (W - 2 * pad)).toFixed(1), Y = v => (H - pad - (v - lo) / sp * (H - 2 * pad)).toFixed(1);
    const html = `<svg class="cpsvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="近 ${spanGet()} 日相對走勢"><line x1="0" x2="${W}" y1="${Y(100)}" y2="${Y(100)}" class="cpz"/>${S.map(s => `<polyline class="cpl" style="--c:${COLORS[s.i]}" points="${s.v.map((v, i) => X(i, s.v.length) + "," + Y(v)).join(" ")}"/>`).join("")}</svg>
      <div class="cpend">${S.map(s => { const e = s.v[s.v.length - 1] - 100; return `<span style="--c:${COLORS[s.i]}"><i></i>${esc(nm(s.c))} <b class="${tone(e)}">${sg(e, 1)}%</b></span>`; }).join("")}</div>`;
    if (host.dataset.h === html) return; host.dataset.h = html; host.innerHTML = html;
    if (animate) { const sv = $("svg", host); sv.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0)" }], { duration: 900, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" }); A.rise($$(".cpend span", host), 70); }
  }

  /* ================= 產業 → 估值比較 ================= */
  const IV = { k: "pe" };
  function buildVal(grid) {
    const hm = $(".indx", grid) || $(".rot", grid) || $(".bd-heat", grid); if (!hm) return;
    hm.insertAdjacentHTML("afterend", `<div class="dcard ival wide"><div class="aihead"><div><h3>產業估值比較</h3></div><span class="sub ivn"></span></div>${seg("ivseg", [["pe", "本益比"], ["yld", "殖利率"], ["pb", "股價淨值比"]], "pe")}<div class="ivout"><p class="sub">載入中…</p></div></div>`);
    const c = $(".ival", grid); bindSeg(c, ".ivseg", k => { IV.k = k; ivPaint(true); });
  }
  async function ivPaint(animate) {
    const card = $(".ival"); if (!card) return;
    await Promise.resolve(A.loadFund()).catch(() => {});
    const F = A.FUND.map; if (!F) { $(".ivout", card).innerHTML = `<p class="sub">讀不到估值資料。</p>`; return; }
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
} catch (e) { setTimeout(() => { throw e; }, 0); }
/* ===== twfx.js ===== */
try {
/* TWstock finishing touches: direction-aware page transitions, touch gestures (swipe between pages, swipe a list row,
   pull the stock page down to go back), limit-up / new-high effects. Everything is layered on window.TWDash.api. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  let A = null, prevTab = null;
  const buzz = n => { try { navigator.vibrate && navigator.vibrate(n); } catch (e) {} };
  const tabIds = () => $$(".dtabs [data-p]").map(b => b.dataset.p).filter(p => p !== "dpStock");

  /* ---------- page transitions: the new page slides in from the side it sits on in the menu ---------- */
  function slideIn(cur) {
    const old = prevTab; prevTab = cur;
    const t = tabIds(), a = t.indexOf(old), b = t.indexOf(cur);
    if (!old || old === cur || a < 0 || b < 0) return;
    const p = document.getElementById(cur); if (!p) return;
    const dir = b > a ? 1 : -1;
    p.animate([{ transform: `translateX(${dir * 46}px) scale(.985)`, opacity: 0, filter: "blur(6px)" }, { transform: "none", opacity: 1, filter: "none" }], { duration: 520, easing: "cubic-bezier(.16,1,.3,1)" });
    const sw = document.createElement("i"); sw.className = "fxsweep"; sw.style.setProperty("--d", dir); document.body.appendChild(sw);
    sw.animate([{ transform: `translateX(${-dir * 100}%)`, opacity: .9 }, { transform: `translateX(${dir * 100}%)`, opacity: 0 }], { duration: 620, easing: "cubic-bezier(.4,0,.2,1)" }).onfinish = () => sw.remove();
  }

  /* ---------- touch gestures ---------- */
  const NOSW = ".hm, .cbox, .kchart, .xscroll, input, textarea, select, .pal, .setdlg, .kbcard, .ixdetail, .cpbar, .lsub, .anasub, .dtabs, .sfind, [data-noswipe], .hmcard";
  const scrollsX = el => { for (let n = el; n && n !== document.body; n = n.parentElement) { const ox = getComputedStyle(n).overflowX; if ((ox === "auto" || ox === "scroll") && n.scrollWidth > n.clientWidth + 4) return true; } return false; };
  let g = null, hint = null, pull = null;
  const ensureHint = () => { if (!hint) { hint = document.createElement("div"); hint.className = "swfx"; document.body.appendChild(hint); } return hint; };
  const toast = txt => {
    const t = document.createElement("div"); t.className = "fxtoast"; t.textContent = txt; document.body.appendChild(t);
    t.animate([{ opacity: 0, transform: "translate(-50%, 14px) scale(.9)" }, { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: .2 }, { opacity: 1, transform: "translate(-50%, 0)", offset: .8 }, { opacity: 0, transform: "translate(-50%, -8px)" }], { duration: 1500 }).onfinish = () => t.remove();
  };
  function resetRow(tr) { if (!tr) return; const cur = tr.style.transform; tr.style.transform = ""; tr.animate([{ transform: cur || "none" }, { transform: "none" }], { duration: 360, easing: "cubic-bezier(.16,1,.3,1)" }); }
  function hideHint() { if (!hint) return; const h = hint; hint = null; h.animate([{ opacity: +h.style.opacity || 1 }, { opacity: 0 }], { duration: 200 }).onfinish = () => h.remove(); }
  function start(e) {
    if (e.touches.length !== 1) { g = null; return; }
    const t = e.touches[0], el = e.target;
    g = { x: t.clientX, y: t.clientY, t: Date.now(), mode: null, row: el.closest && el.closest("#dpList .mtbl tbody tr[data-code]"), no: !!(el.closest && el.closest(NOSW)) || scrollsX(el), tab: A.tabNow() };
  }
  function move(e) {
    if (!g) return;
    const t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y;
    if (!g.mode && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) g.mode = Math.abs(dx) > Math.abs(dy) * 1.5 ? "h" : "v";
    if (g.mode === "h" && g.row && !g.no) {
      const r = g.row.getBoundingClientRect(), k = Math.min(1, Math.abs(dx) / 110), code = g.row.dataset.code;
      g.row.style.transform = `translateX(${(dx * 0.55).toFixed(1)}px)`;
      const h = ensureHint(); h.style.cssText = `top:${r.top}px;height:${r.height}px;left:${r.left}px;width:${r.width}px;opacity:${(0.25 + k * 0.75).toFixed(2)}`;
      const inW = (A.watch() || []).includes(code);
      h.dataset.side = dx < 0 ? "l" : "r"; h.dataset.ready = k >= 1 ? "1" : "";
      h.innerHTML = dx < 0 ? `<span>${inW ? "☆ 移除自選" : "★ 加入自選"}</span>` : `<span>看個股 →</span>`;
    } else if (g.mode === "v" && g.tab === "dpStock" && dy > 0 && scrollY <= 0 && !g.no && $("#dpStock .sback:not([hidden])")) {
      const p = $("#dpStock"), k = Math.min(1, dy / 130);
      p.style.transform = `translateY(${(dy * 0.45).toFixed(1)}px) scale(${(1 - k * 0.03).toFixed(3)})`; p.style.opacity = (1 - k * 0.35).toFixed(2);
      if (!pull) { pull = document.createElement("div"); pull.className = "fxpull"; pull.innerHTML = `<i></i><span></span>`; document.body.appendChild(pull); }
      pull.style.opacity = Math.min(1, dy / 60).toFixed(2); pull.style.transform = `translate(-50%, ${Math.min(dy * 0.5, 70).toFixed(0)}px)`; pull.dataset.ready = k >= 1 ? "1" : "";
      $("span", pull).textContent = k >= 1 ? "放開返回" : "下拉返回"; $("i", pull).style.transform = `rotate(${(k * 180).toFixed(0)}deg)`;
    }
  }
  function end(e) {
    const s = g; g = null; if (!s) return;
    const t = (e.changedTouches && e.changedTouches[0]) || { clientX: s.x, clientY: s.y }, dx = t.clientX - s.x, dy = t.clientY - s.y, dt = Date.now() - s.t;
    if (s.mode === "h" && s.row) {
      const code = s.row.dataset.code; hideHint();
      if (Math.abs(dx) > 110) {
        buzz(12);
        if (dx < 0) { const on = A.rowStar(code); const nm = (A.DB.by.get(code) || {}).name || code; toast(on ? `★ 已加入自選：${nm}` : `☆ 已移出自選：${nm}`); resetRow($(`#dpList .mtbl tbody tr[data-code="${code}"]`) || s.row); }
        else { s.row.style.transform = ""; A.openStock(code, s.row); }
      } else resetRow(s.row);
      return;
    }
    if (pull || $("#dpStock").style.transform) {
      const p = $("#dpStock"), ready = dy > 130; if (pull) { const x = pull; pull = null; x.animate([{ opacity: +x.style.opacity || 1 }, { opacity: 0 }], { duration: 220 }).onfinish = () => x.remove(); }
      const cur = p.style.transform; p.style.transform = ""; p.style.opacity = "";
      if (cur) p.animate([{ transform: cur, opacity: 0.7 }, { transform: "none", opacity: 1 }], { duration: 360, easing: "cubic-bezier(.16,1,.3,1)" });
      if (ready) { buzz(12); A.goBackNow(); }
      return;
    }
    if (s.mode === "h" && !s.no && s.tab !== "dpStock" && Math.abs(dx) > 90 && Math.abs(dy) < 55 && dt < 700) {
      const ids = tabIds(), i = ids.indexOf(s.tab), n = i + (dx < 0 ? 1 : -1);
      if (i >= 0 && n >= 0 && n < ids.length) { buzz(10); A.openTab(ids[n]); }
    }
  }

  /* ---------- 創 60 日新高 on the stock page ---------- */
  function newHigh() {
    if (A.tabNow() !== "dpStock") return;
    const code = A.code(), h = A.HIST.get(code), s = A.DB.by.get(code), box = $("#dpStock .stitle");
    if (!box || !h || !h.cs || !s || !(s.price > 0)) return;
    const prior = h.cs.slice(-61, -1).map(b => b[2]).filter(Number.isFinite);
    const is = prior.length >= 40 && s.price >= Math.max(...prior), tag = $(".nhtag", box);
    if (is && !tag) { const t = document.createElement("span"); t.className = "nhtag"; t.textContent = "▲ 創 60 日新高"; box.appendChild(t); t.animate([{ opacity: 0, transform: "scale(.4) rotate(-8deg)" }, { opacity: 1, transform: "scale(1.15)", offset: .6 }, { opacity: 1, transform: "none" }], { duration: 640, easing: "cubic-bezier(.2,.9,.3,1)" }); }
    else if (!is && tag) tag.remove();
  }

  function boot() {
    if (A) return; A = window.TWDash && window.TWDash.api; if (!A) return;
    prevTab = A.tabNow();
    document.addEventListener("twdash:tab", e => slideIn(e.detail));
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    document.addEventListener("touchcancel", () => { if (g && g.row) resetRow(g.row); g = null; hideHint(); }, { passive: true });
    ["twdash:live", "twdash:list"].forEach(n => document.addEventListener(n, () => setTimeout(newHigh, 0))); newHigh();
  }
  document.addEventListener("twdash:ready", boot);
  if (window.TWDash && window.TWDash.api) boot();
})();
} catch (e) { setTimeout(() => { throw e; }, 0); }
/* ===== twfx2.js ===== */
try {
/* TWstock interaction layer 2: preview card (hover / long-press), drag to reorder the watchlist,
   customisable 總覽 layout, and the compact bar that follows you down the stock page. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let A = null;
  const buzz = n => { try { navigator.vibrate && navigator.vibrate(n); } catch (e) {} };

  /* ---------- a vertical drag-to-reorder helper: the others slide out of the way, the dropped item settles into its slot ---------- */
  function dragSort(down, item, getItems, commit) {
    const items = getItems(), from = items.indexOf(item); if (from < 0) return;
    const rects = items.map(el => el.getBoundingClientRect()), me = rects[from], startY = down.clientY, h = me.height;
    const gap = rects[from + 1] ? rects[from + 1].top - me.bottom : rects[from - 1] ? me.top - rects[from - 1].bottom : 0;
    const handle = down.currentTarget || down.target; let to = from, dead = false;
    try { handle.setPointerCapture(down.pointerId); } catch (e) {}
    item.classList.add("fxdrag"); items.forEach(el => { if (el !== item) el.style.transition = "transform .28s cubic-bezier(.16,1,.3,1)"; });
    buzz(8);
    const move = e => {
      const dy = Math.max(rects[0].top - me.top, Math.min(rects[rects.length - 1].bottom - me.bottom, e.clientY - startY));
      item.style.transform = `translateY(${dy}px) scale(1.02)`;
      const mid = me.top + dy + h / 2;
      to = from; rects.forEach((r, i) => { if (i < from && mid <= r.top + r.height / 2 + 1) to = Math.min(to, i); if (i > from && mid >= r.top + r.height / 2 - 1) to = Math.max(to, i); });
      items.forEach((el, i) => { if (el === item) return; const sh = (from < to && i > from && i <= to) ? -(h + gap) : (from > to && i < from && i >= to) ? (h + gap) : 0; el.style.transform = sh ? `translateY(${sh}px)` : ""; });
    };
    const up = () => {
      if (dead) return; dead = true;
      const noClick = ev => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener("click", noClick, true); setTimeout(() => document.removeEventListener("click", noClick, true), 450);   /* letting go is not a tap on the row */
      handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", up);
      const slot = (to > from ? rects[to].bottom - me.bottom : to < from ? rects[to].top - me.top : 0);
      item.style.transition = "transform .3s cubic-bezier(.34,1.4,.5,1)"; item.style.transform = `translateY(${slot}px)`; buzz(6);
      setTimeout(() => {
        items.forEach(el => { el.style.transition = "none"; el.style.transform = ""; el.classList.remove("fxdrag"); });
        const order = items.slice(); order.splice(from, 1); order.splice(to, 0, item);
        if (to !== from) commit(order);
        requestAnimationFrame(() => items.forEach(el => { el.style.transition = ""; }));
      }, 320);
    };
    handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up); handle.addEventListener("pointercancel", up);
  }

  /* ---------- the watchlist rows: drag the grip ---------- */
  document.addEventListener("pointerdown", e => {
    const grip = e.target.closest && e.target.closest(".dgrip"); if (!grip || !A || e.button > 0) return;
    const tr = grip.closest("tr[data-code]"), tb = tr && tr.closest("tbody"); if (!tb || !A.canSort()) return;
    e.preventDefault(); e.stopPropagation();
    dragSort({ clientY: e.clientY, pointerId: e.pointerId, currentTarget: grip }, tr, () => $$("tr[data-code]", tb), order => {
      const seen = order.map(r => r.dataset.code), rest = A.listCodes().filter(c => !seen.includes(c));
      A.setOrder(seen.concat(rest));
    });
  }, true);

  /* ---------- a small chart of the last ~40 trading days ---------- */
  const BARS = new Map();
  const ym = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0");
  function bars(code) {
    const h = A.HIST.get(code); if (h && h.cs && h.cs.length) return Promise.resolve(h.cs.slice(-45));
    if (BARS.has(code)) return BARS.get(code);
    const now = new Date(), prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const pr = Promise.all([A.histMonth(code, ym(prev), true), A.histMonth(code, ym(now), false)]).then(([a, b]) => [...a, ...b].slice(-45), e => { BARS.delete(code); throw e; });
    BARS.set(code, pr); return pr;
  }
  function spark(cs, w, h) {
    const v = cs.map(b => b[4]), lo = Math.min(...v), hi = Math.max(...v), sp = hi - lo || 1, n = v.length - 1 || 1;
    const X = i => (i / n * (w - 8) + 4).toFixed(1), Y = x => (h - 6 - (x - lo) / sp * (h - 14)).toFixed(1);
    const d = v.map((x, i) => (i ? "L" : "M") + X(i) + " " + Y(x)).join(""), up = v[v.length - 1] >= v[0], hi_i = v.indexOf(hi), lo_i = v.indexOf(lo);
    return { hi, lo, up, svg: `<svg class="pkspark ${up ? "up" : "down"}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="ar" d="${d}L${X(n)} ${h}L${X(0)} ${h}Z"/><path class="ln" pathLength="1" d="${d}"/><circle cx="${X(v.length - 1)}" cy="${Y(v[v.length - 1])}" r="3.2"/><circle class="mx" cx="${X(hi_i)}" cy="${Y(hi)}" r="2"/><circle class="mn" cx="${X(lo_i)}" cy="${Y(lo)}" r="2"/></svg>` };
  }
  async function fillSpark(host, code) {
    host.innerHTML = `<p class="sub">載入走勢…</p>`;
    try {
      const cs = await bars(code); if (!host.isConnected) return;
      if (!cs || cs.length < 5) { host.innerHTML = `<p class="sub">走勢讀不到資料。</p>`; return; }
      const r = spark(cs, 260, 64), f = A.fmt;
      host.innerHTML = r.svg + `<div class="pkrng"><span>近 ${cs.length} 日低 <b>${f(r.lo, A.dig(r.lo))}</b></span><span>高 <b>${f(r.hi, A.dig(r.hi))}</b></span><span class="${A.tone(cs[cs.length - 1][4] - cs[0][4])}">${A.pct((cs[cs.length - 1][4] / cs[0][4] - 1) * 100)}</span></div>`;
      const ln = $(".ln", host); if (ln) ln.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 800, easing: "ease-out", fill: "backwards" });
      const ar = $(".ar", host); if (ar) ar.animate([{ opacity: 0 }, { opacity: 0.14 }], { duration: 700, delay: 500, fill: "backwards" });
    } catch (e) { if (host.isConnected) host.innerHTML = `<p class="sub">走勢讀不到資料（${esc(A.whyOf(e))}）。</p>`; }
  }

  /* hover preview (mouse): rest on a stock for half a second */
  let pk = null, pkT = 0, pkFor = null;
  const PKSEL = "#dash tr[data-code], .sb-row[data-code], .instrow[data-code], .wcard[data-code]";
  function pkHide() { clearTimeout(pkT); pkFor = null; if (!pk) return; const el = pk; pk = null; el.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.96)" }], { duration: 140, fill: "forwards" }).onfinish = () => el.remove(); }
  function pkShow(code, x, y) {
    const s = A.DB.by.get(code); if (!s) return;
    const t = A.tone(s.chg), d = A.dig(s.price);
    const el = document.createElement("div"); el.className = "fxpeek";
    el.innerHTML = `<div class="pkh"><b>${esc(s.name)}</b><i>${esc(code)}</i></div><div class="pkp"><strong class="${t}">${Number.isFinite(s.price) ? A.fmt(s.price, d) : "—"}</strong><em class="${t}">${Number.isFinite(s.pct) ? A.pct(s.pct) : ""}</em></div><div class="pkc"></div>
      <div class="pkv"><span>成交量 <b>${A.fmt(s.vol)} 張</b></span>${Number.isFinite(s.open) ? `<span>開 <b>${A.fmt(s.open, d)}</b></span>` : ""}</div>`;
    document.body.appendChild(el); pk = el;
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(innerWidth - w - 8, x + 18)) + "px"; el.style.top = Math.max(8, Math.min(innerHeight - h - 8, y + 14)) + "px";
    el.animate([{ opacity: 0, transform: "translateY(8px) scale(.94)", filter: "blur(4px)" }, { opacity: 1, transform: "none", filter: "none" }], { duration: 300, easing: "cubic-bezier(.16,1,.3,1)" });
    fillSpark($(".pkc", el), code);
  }
  document.addEventListener("pointerover", e => {
    if (!A || e.pointerType !== "mouse") return;
    const el = e.target.closest && e.target.closest(PKSEL); if (!el) return;
    if (pkFor === el) return; pkHide(); pkFor = el;
    const x = e.clientX, y = e.clientY;
    pkT = setTimeout(() => { if (pkFor === el && el.isConnected && !el.closest(".fxdrag")) pkShow(el.dataset.code, x, y); }, 520);
  });
  document.addEventListener("pointerout", e => { if (e.pointerType !== "mouse" || !pkFor) return; const to = e.relatedTarget; if (to && pkFor.contains(to)) return; if (to && to.closest && to.closest(".fxpeek")) return; pkHide(); });
  ["pointerdown", "wheel", "keydown", "scroll"].forEach(ev => addEventListener(ev, () => { if (pk || pkFor) pkHide(); }, { passive: true, capture: true }));

  /* touch long-press: the context menu gets the same little chart */
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
    if (!(n instanceof Element) || !n.classList.contains("ctxmenu")) return;
    const code = ($(".cx-h i", n) || {}).textContent; if (!code || !A) return;
    const host = document.createElement("div"); host.className = "pkc cxpk"; $(".cx-h", n).after(host); fillSpark(host, code);
    const r = n.getBoundingClientRect(); if (r.bottom > innerHeight - 8) n.style.top = Math.max(8, innerHeight - n.offsetHeight - 8) + "px";
  }))).observe(document.body, { childList: true });

  /* ---------- 總覽 layout: reorder and hide whole blocks ---------- */
  const OV = [["ixgrid", "四大指數與國際指數"], ["mstrip", "市場概況"], ["board3", "國際行情・期貨籌碼"]];
  const OK = "twmain-ovl";
  const ovSet = () => { const o = A.store.get(OK, null) || {}; return { order: Array.isArray(o.order) ? o.order : [], hide: Array.isArray(o.hide) ? o.hide : [] }; };
  function ovApply() {
    const panel = $("#dpOverview"); if (!panel) return;
    const S = ovSet(), order = [...S.order.filter(k => OV.some(x => x[0] === k)), ...OV.map(x => x[0]).filter(k => !S.order.includes(k))];
    const editing = panel.classList.contains("fxedit");
    order.forEach((k, i) => { const el = $(":scope > ." + k, panel); if (!el) return; el.style.order = i + 1; el.classList.toggle("fxhid", S.hide.includes(k)); el.classList.toggle("fxdim", editing && S.hide.includes(k)); });
    const ix = $(":scope > .ixdetail", panel); if (ix) ix.style.order = (order.indexOf("ixgrid") + 1) + 0.5;
  }
  function ovEditor() {
    const panel = $("#dpOverview"); if (!panel) return;
    let ed = $(":scope > .fxeditor", panel);
    if (ed) { closeEditor(ed); return; }
    panel.classList.add("fxedit");
    ed = document.createElement("div"); ed.className = "dcard fxeditor"; ed.style.order = 0; panel.prepend(ed);
    const S = ovSet(), order = [...S.order.filter(k => OV.some(x => x[0] === k)), ...OV.map(x => x[0]).filter(k => !S.order.includes(k))];
    ed.innerHTML = `<div class="bd-h"><h3>自訂總覽</h3><button type="button" class="btn fxdone">完成</button></div><div class="fxlist">${order.map(k => { const n = OV.find(x => x[0] === k)[1]; return `<div class="fxrow" data-k="${k}"><i class="dgrip fxg" aria-label="拖曳排序">⋮⋮</i><span>${n}</span><button type="button" class="fxeye" aria-pressed="${!S.hide.includes(k)}" aria-label="顯示或隱藏">${S.hide.includes(k) ? "已隱藏" : "顯示中"}</button></div>`; }).join("")}</div>`;
    ed.animate([{ opacity: 0, transform: "translateY(-12px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(.16,1,.3,1)" });
    $$(".fxrow", ed).forEach((r, i) => r.animate([{ opacity: 0, transform: "translateX(-14px)" }, { opacity: 1, transform: "none" }], { duration: 360, delay: 120 + i * 60, fill: "backwards", easing: "cubic-bezier(.16,1,.3,1)" }));
    const save = () => { const rows = $$(".fxrow", ed), o = { order: rows.map(r => r.dataset.k), hide: rows.filter(r => $(".fxeye", r).getAttribute("aria-pressed") === "false").map(r => r.dataset.k) }; A.store.set(OK, o); ovApply(); };
    ed.addEventListener("click", e => {
      if (e.target.closest(".fxdone")) { closeEditor(ed); return; }
      const eye = e.target.closest(".fxeye"); if (eye) { const on = eye.getAttribute("aria-pressed") !== "true"; eye.setAttribute("aria-pressed", String(on)); eye.textContent = on ? "顯示中" : "已隱藏"; save(); }
    });
    ed.addEventListener("pointerdown", e => {
      const g = e.target.closest(".fxg"); if (!g || e.button > 0) return; e.preventDefault();
      const row = g.closest(".fxrow"), list = row.parentElement;
      dragSort({ clientY: e.clientY, pointerId: e.pointerId, currentTarget: g }, row, () => $$(".fxrow", list), order => { order.forEach(r => list.appendChild(r)); save(); });
    });
    ovApply();
  }
  function closeEditor(ed) {
    const panel = $("#dpOverview"); panel.classList.remove("fxedit"); ovApply();
    ed.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(-10px)" }], { duration: 220, fill: "forwards" }).onfinish = () => ed.remove();
  }
  function ovButton() {
    const panel = $("#dpOverview"); if (!panel || $(":scope > .fxovbtn", panel)) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "chip fxovbtn"; b.style.order = 99; b.textContent = "⇅ 自訂總覽"; b.addEventListener("click", ovEditor); panel.appendChild(b);
  }
  document.addEventListener("twdash:overview-edit", ovEditor);

  /* ---------- the compact bar that follows you down the stock page ---------- */
  let mini = null;
  function miniBar() {
    const on = A.tabNow() === "dpStock", head = $("#dpStock .shead");
    const show = on && head && head.getBoundingClientRect().bottom < 56;
    if (show && !mini) {
      mini = document.createElement("div"); mini.className = "fxmini"; mini.setAttribute("role", "button"); mini.setAttribute("aria-label", "回到頂端"); document.body.appendChild(mini);
      mini.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));
      mini.animate([{ transform: "translate(-50%, -140%)", opacity: 0 }, { transform: "translate(-50%, 0)", opacity: 1 }], { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" });
    }
    if (!show && mini) { const el = mini; mini = null; el.animate([{ transform: "translate(-50%, 0)", opacity: 1 }, { transform: "translate(-50%, -140%)", opacity: 0 }], { duration: 260, fill: "forwards", easing: "cubic-bezier(.23,1,.32,1)" }).onfinish = () => el.remove(); }
    if (mini) {
      const s = A.DB.by.get(A.code()); if (!s) return;
      const t = A.tone(s.chg), html = `<b>${esc(s.name)}</b><i>${esc(s.code)}</i><strong class="${t}">${Number.isFinite(s.price) ? A.fmt(s.price, A.dig(s.price)) : "—"}</strong><em class="${t}">${Number.isFinite(s.pct) ? A.pct(s.pct) : ""}</em>`;
      if (mini.dataset.h !== html) { mini.dataset.h = html; mini.innerHTML = html; }
    }
  }

  function boot() {
    if (A) return; A = window.TWDash && window.TWDash.api; if (!A) return;
    ovApply(); ovButton();
    ["twdash:live", "twdash:list", "twdash:tab", "twdash:chart"].forEach(n => document.addEventListener(n, () => setTimeout(() => { ovButton(); miniBar(); }, 0)));
    let raf = 0; addEventListener("scroll", () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; miniBar(); }); }, { passive: true });
    document.addEventListener("twdash:tab", () => { setTimeout(ovApply, 0); miniBar(); });
  }
  document.addEventListener("twdash:ready", boot);
  if (window.TWDash && window.TWDash.api) boot();
})();
} catch (e) { setTimeout(() => { throw e; }, 0); }
/* ===== twfx3.js ===== */
try {
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

  /* a panel that is rewritten by a refresh must not undo what the reader is doing in it:
     - open <details> stay open (matched by their heading)
     - the same content written again while the reader is pressing or typing inside is left alone
     - a box being typed in keeps its focus, caret and text, and scrolled lists keep their place */
  (function () {
    const d = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML"); if (!d || !d.set) return;
    const key = x => { const s = x.querySelector(":scope > summary"); return s ? s.textContent.trim() : ""; };
    const last = new WeakMap(); let pressed = null;
    document.addEventListener("pointerdown", e => { pressed = e.target; }, true);
    const clear = () => setTimeout(() => { pressed = null; }, 80); document.addEventListener("pointerup", clear, true); document.addEventListener("pointercancel", clear, true);
    const path = (root, el) => { const p = []; while (el && el !== root) { const par = el.parentElement; if (!par) return null; p.unshift(Array.prototype.indexOf.call(par.children, el)); el = par; } return el === root ? p : null; };
    const walk = (root, p) => { let el = root; for (const i of p) { el = el && el.children[i]; } return el; };
    Object.defineProperty(Element.prototype, "innerHTML", { configurable: true, enumerable: d.enumerable, get: d.get, set(v) {
      const ae = document.activeElement, inside = x => x && x !== this && this.contains && this.contains(x);
      const busy = inside(pressed) || (inside(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName));
      if (busy && last.get(this) === v && this.isConnected) return;
      last.set(this, v);
      let open = null, foc = null, scr = null;
      try { const o = this.querySelectorAll ? this.querySelectorAll("details[open]") : []; if (o.length) { open = {}; o.forEach(x => { const k = key(x); open[k] = (open[k] || 0) + 1; }); } } catch (e) {}
      if (inside(ae) && /^(INPUT|TEXTAREA)$/.test(ae.tagName)) { const p = path(this, ae); if (p) foc = { p, v: ae.value, s: ae.selectionStart, e: ae.selectionEnd, n: ae.name, c: ae.className }; }
      try { if (this.isConnected && this.getElementsByTagName("*").length < 2500) { const sc = []; this.querySelectorAll(".bd-list, .xscroll, .irout, .cptbl, .hm, .rkgrid, .cpchart, .rotout, .sresults").forEach(x => { if (x.scrollTop > 0 || x.scrollLeft > 0) { const p = path(this, x); if (p) sc.push([p, x.scrollTop, x.scrollLeft, x.className]); } }); if (sc.length) scr = sc; } } catch (e) {}
      d.set.call(this, v);
      if (open) try { const seen = {}; this.querySelectorAll("details").forEach(x => { const k = key(x); seen[k] = (seen[k] || 0) + 1; if (open[k] >= seen[k]) x.setAttribute("open", ""); }); } catch (e) {}
      if (foc) try { const n = walk(this, foc.p); if (n && /^(INPUT|TEXTAREA)$/.test(n.tagName) && n.name === foc.n && n.className === foc.c) { if (!n.value) n.value = foc.v; n.focus({ preventScroll: true }); try { n.setSelectionRange(foc.s, foc.e); } catch (e) {} } } catch (e) {}
      if (scr) try { scr.forEach(([p, t, l, c]) => { const n = walk(this, p); if (n && n.className === c) { n.scrollTop = t; n.scrollLeft = l; } }); } catch (e) {}
    } });
  })();

  /* one way to read what was typed into any stock box: a code, "code name", or a name; a well-formed code not in today's list is still taken */
  function findStock(v) {
    v = String(v || "").trim(); if (!v) return null; const tok = v.split(/\s+/)[0].toUpperCase(), by = A.DB.by;
    return by.get(tok) || A.DB.list.find(x => x.name === v) || A.DB.list.find(x => x.name.includes(v)) || (/^\d{4,6}[A-Z]?$/.test(tok) ? { code: tok, name: tok } : null);
  }
  /* ================= stock picker: replaces the browser's own list on every code box ================= */
  const SUG = { el: null, inp: null, rows: [], i: -1 };
  function sugRows(q) {
    q = q.trim().toLowerCase(); const by = A.DB.by, out = [];
    if (!q) { A.watch().forEach(c => by.has(c) && out.push(by.get(c))); return out.slice(0, 8); }
    const code = q.split(/\s+/)[0];
    for (const s of A.DB.list) { if (s.code.toLowerCase() === code || s.code.toLowerCase().startsWith(code) || s.name.toLowerCase().includes(q)) { out.push(s); if (out.length >= 40) break; } }
    out.sort((a, b) => (a.code.toLowerCase() === code ? -1 : b.code.toLowerCase() === code ? 1 : 0) || (a.code.length - b.code.length) || (a.code < b.code ? -1 : 1));
    if (!out.length && /^\d{4,6}[a-z]?$/.test(code)) out.push({ code: code.toUpperCase(), name: "加入 " + code.toUpperCase(), price: NaN, chg: 0, pct: NaN, extra: 1 });
    return out.slice(0, 8);
  }
  function sugPaint() {
    const el = SUG.el, inp = SUG.inp; if (!el || !inp) return;
    SUG.rows = sugRows(inp.value);
    if (!SUG.rows.length) { sugClose(); return; }
    const r = inp.getBoundingClientRect(), below = innerHeight - r.bottom > 280;
    el.style.cssText = `left:${r.left}px;width:${r.width}px;${below ? `top:${r.bottom + 6}px` : `bottom:${innerHeight - r.top + 6}px`}`;
    el.innerHTML = SUG.rows.map((s, k) => `<button type="button" class="fxs-row${k === SUG.i ? " on" : ""}" data-k="${k}"><b>${A.esc(s.name)}</b><i>${s.extra ? "" : A.esc(s.code)}</i><span class="${A.tone(s.chg)}">${s.extra ? "" : Number.isFinite(s.price) ? A.fmt(s.price, A.dig(s.price)) : "讀不到"}</span><em class="${A.tone(s.chg)}">${Number.isFinite(s.pct) ? A.pct(s.pct) : ""}</em></button>`).join("");
  }
  function sugOpen(inp) {
    if (!SUG.el) { SUG.el = document.createElement("div"); SUG.el.className = "fxsug"; SUG.el.setAttribute("role", "listbox"); document.body.appendChild(SUG.el);
      SUG.el.addEventListener("mousedown", e => { e.preventDefault(); const b = e.target.closest(".fxs-row"); if (b) sugPick(+b.dataset.k); }); }
    const was = SUG.el.classList.contains("shown"); SUG.inp = inp; SUG.i = -1; SUG.el.classList.add("shown"); sugPaint();
    if (!was && SUG.rows.length) SUG.el.animate([{ opacity: 0, transform: "translateY(-6px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.16,1,.3,1)" });
  }
  function sugClose() {
    const el = SUG.el; if (!el || !el.classList.contains("shown")) return; el.classList.remove("shown");
    const c = el.cloneNode(true); c.classList.add("shown", "out"); document.body.appendChild(c);
    c.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(-4px)" }], { duration: 140, fill: "forwards" }).onfinish = () => c.remove(); el.innerHTML = "";
  }
  function sugPick(k) {
    const s = SUG.rows[k], inp = SUG.inp; if (!s || !inp) return;
    inp.value = inp._full && !s.extra ? s.code + " " + s.name : s.code; sugClose(); SUG.skip = true; inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); SUG.skip = false;
  }
  function sugBind(inp) {
    if (inp._fxs) return; inp._fxs = 1; inp._full = inp.getAttribute("list") === "twstocks"; inp.removeAttribute("list"); inp.setAttribute("autocomplete", "off"); inp.removeAttribute("title");
    inp.addEventListener("focus", () => { inp.select(); sugOpen(inp); });
    inp.addEventListener("input", () => { if (!SUG.skip && document.activeElement === inp) sugOpen(inp); });
    inp.addEventListener("blur", () => setTimeout(() => { if (SUG.inp === inp && document.activeElement !== inp) sugClose(); }, 120));
    inp.addEventListener("keydown", e => {
      if (!SUG.el || !SUG.el.classList.contains("shown")) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = SUG.rows.length; SUG.i = (SUG.i + (e.key === "ArrowDown" ? 1 : -1) + n) % n; $$(".fxs-row", SUG.el).forEach((b, k) => b.classList.toggle("on", k === SUG.i)); }
      else if (e.key === "Enter" && SUG.i >= 0) { e.preventDefault(); sugPick(SUG.i); }
      else if (e.key === "Escape") { e.stopPropagation(); sugClose(); }
    });
  }
  addEventListener("scroll", () => { if (SUG.el && SUG.el.classList.contains("shown")) sugClose(); }, true);
  addEventListener("resize", () => { if (SUG.el && SUG.el.classList.contains("shown")) sugPaint(); });

  /* ================= a × inside the order boxes ================= */
  function clearBind(inp) {
    if (inp._fxc) return; inp._fxc = 1;
    const cs = getComputedStyle(inp), pf = getComputedStyle(inp.parentNode).display.includes("flex"), w = document.createElement("span"); w.className = "fxclr"; if (pf) { w.style.flex = cs.flex; w.style.minWidth = "0"; } const had = document.activeElement === inp, ss = had ? inp.selectionStart : 0, se = had ? inp.selectionEnd : 0; inp.parentNode.insertBefore(w, inp); w.appendChild(inp); if (had) { inp.focus(); try { inp.setSelectionRange(ss, se); } catch (e) {} }
    const b = document.createElement("button"); b.type = "button"; b.className = "fxclr-x"; b.setAttribute("aria-label", "清除"); b.tabIndex = -1; b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>'; w.appendChild(b);
    const sync = () => w.classList.toggle("has", inp.value !== "");
    inp.addEventListener("input", sync); inp.addEventListener("change", sync);
    b.addEventListener("mousedown", e => e.preventDefault());
    b.addEventListener("click", () => { inp.value = ""; sync(); inp.dispatchEvent(new Event("input", { bubbles: true })); inp.focus(); });
    const pd = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Object.defineProperty(inp, "value", { configurable: true, get() { return pd.get.call(this); }, set(v) { pd.set.call(this, v); sync(); } }); sync();
  }

  /* the sliding highlight of the sub-tabs follows every change in the width of the tabs themselves: late-added tabs, fonts arriving, a reload */
  function hlBind(bar) {
    if (bar._fxh) return; bar._fxh = 1;
    const place = () => { const b = $("[aria-selected=true]", bar), hl = $(":scope > i", bar); if (!b || !hl || !b.offsetWidth) return; const w = b.offsetWidth + "px", t = `translateX(${b.offsetLeft}px)`; if (hl.style.width === w && hl.style.transform === t) return; hl.style.transition = "none"; hl.style.width = w; hl.style.transform = t; void hl.offsetWidth; hl.style.transition = ""; };
    if (window.ResizeObserver) { const ro = new ResizeObserver(place), watch = () => { ro.observe(bar); $$("[data-sub]", bar).forEach(x => ro.observe(x)); }; watch(); new MutationObserver(watch).observe(bar, { childList: true }); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
    addEventListener("load", place); setTimeout(place, 400); setTimeout(place, 1500);
  }

  /* ================= a press that lands is a click: when the browser drops the click (the thing pressed was repainted by a live refresh between press and release, or the click was sent to a container), send it to the control that was pressed ================= */
  (function () {
    const ACT = "button, a[href], summary, [role=tab], [role=button], tr[data-code], .chip, .ixcard, .wcard, .hmt, .sb-row, .instrow, label";
    const SKIP = ".dgrip, .cbox, .kchart, .hm .hmcard, input, select, textarea, [data-noclick]";
    const sig = el => el ? el.tagName + "|" + Array.from(el.attributes).filter(a => /^data-/.test(a.name)).map(a => a.name + "=" + a.value).join(",") + "|" + (el.textContent || "").trim().slice(0, 24) : "";
    let dn = null, cks = [];
    document.addEventListener("click", e => { cks.push({ at: performance.now(), t: e.target }); if (cks.length > 12) cks.shift(); }, true);
    document.addEventListener("pointerdown", e => {
      dn = null; if (e.button > 0 || !e.isTrusted || !e.target.closest) return;
      const el = e.target.closest(ACT); if (!el || el.disabled || el.closest(SKIP)) return;
      dn = { el, sig: sig(el), x: e.clientX, y: e.clientY, t: performance.now() };
    }, true);
    document.addEventListener("pointerup", e => {
      const d = dn; dn = null; if (!d || !e.isTrusted) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || performance.now() - d.t > 700) return;
      const x = e.clientX, y = e.clientY;
      setTimeout(() => {
        const under = document.elementFromPoint(x, y), tg = under && under.closest && under.closest(ACT); if (!tg || tg.disabled) return;
        const same = tg === d.el || (!d.el.isConnected && sig(tg) === d.sig); if (!same) return;
        const got = cks.some(ck => ck.at > d.t - 80 && ck.t && (d.el.contains(ck.t) || tg.contains(ck.t) || (ck.t.closest && sig(ck.t.closest(ACT)) === d.sig)));
        if (!got) tg.click();
      }, 60);
    }, true);
  })();

  /* cards that are built after the first paint (比較, 疊圖 ...) must open straight away when their sub-tab was the one a reload came back to */
  (function () {
    let on = false, touched = false; document.addEventListener("pointerdown", () => { touched = true; }, true);
    const fix = () => {
      const dl = $("#dpList"); if (!dl) return;
      if (performance.now() < 9000 && !touched) { let w = ""; try { w = sessionStorage.getItem("twlst") || ""; } catch (e) {} const sel = $(".lsub [aria-selected=true]", dl); if (w && sel && sel.dataset.sub !== w && $(".lsub [data-sub=\"" + w + "\"]", dl)) { A.lstSub(w); return; } }
      const b = $(".lsub [aria-selected=true]", dl); if (!b) return; const k = b.dataset.sub; let changed = false;
      $$(":scope > .dcard[data-sub]", dl).forEach(c => { const want = c.dataset.sub !== k; if (c.hidden !== want) { c.hidden = want; if (!want) changed = true; } });
      if (changed) document.dispatchEvent(new CustomEvent("twdash:lstsub", { detail: k }));
    };
    const start = () => { const dl = $("#dpList"); if (!dl || on) return; on = true; new MutationObserver(fix).observe(dl, { childList: true }); fix(); };
    document.addEventListener("twdash:ready", start); new MutationObserver(() => { if (!on) start(); }).observe(document.body, { childList: true, subtree: true });
  })();

  /* script errors go to the Worker (once per message per page load) */
  (function () {
    const sent = new Set(); let n = 0;
    const send = (m, w) => { const k = m + w; if (sent.has(k) || n++ > 8 || !window.TWDash || !TWDash.api) return; sent.add(k); try { fetch(TWDash.api.worker + "/tw/err", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ m, w, ua: navigator.userAgent }), keepalive: true }).catch(() => {}); } catch (e) {} };
    addEventListener("error", e => send(e.message || "error", (e.filename || "").split("/").pop() + ":" + (e.lineno || 0)));
    addEventListener("unhandledrejection", e => send("promise: " + String((e.reason && e.reason.message) || e.reason), ""));
  })();

  function boot() {
    if (A) return; A = window.TWDash && window.TWDash.api; if (!A) return;
    bindChart(); ensureChip(); ensureShare();
    document.addEventListener("twdash:chart", () => { ensureChip(); paintAlerts(); const cb = $("#dpStock .cbox"); if (cb) cb.classList.toggle("alerting", alertMode); });
    A.findStock = findStock;
    const STK = 'input[list="twstocks"], .cpq, input[name="code"], .lcode, .lpcode, [data-stock]', CLR = '.lform [name="code"], .lform [name="qty"], .cpq, .msearch, .ssearch, .pal-in input, ' + STK;
    let q = 0; const scan = () => { q = 0; ensureChip(); ensureShare(); $$(STK).forEach(sugBind); $$(".anasub").forEach(hlBind); $$(CLR).forEach(clearBind); };
    new MutationObserver(() => { if (!q) q = requestAnimationFrame(scan); }).observe(document.body, { childList: true, subtree: true }); scan();
    setInterval(() => { if (!document.hidden) checkAlerts(); }, 1500);
    document.addEventListener("twdash:tab", () => { if (alertMode) setMode(false); });
  }
  document.addEventListener("twdash:ready", boot);
  if (window.TWDash && window.TWDash.api) boot();
})();
} catch (e) { setTimeout(() => { throw e; }, 0); }
/* ===== twds.js ===== */
try {
/* TWstock shared layer: marks units and data states, and keeps chart axis text a steady size on screen.
   It only adds classes, attributes and one wrapper around a trailing unit; the text itself never changes. */
(function () {
  "use strict";
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- units after a number: "8,711 張" "22.19 倍" "29.4 億" (the % sign is handled by the font) ---------- */
  const UNIT = /^([\s▲▼+\-−]*\d[\d,]*(?:\.\d+)?\s?)(張|億元|億|萬|倍|元|檔|天|日|筆|股|點)$/;
  const UNIT_IN = "td, .snap b, .snap em, .snap span, .mstrip b, .mcell b, .aikv b, .pk-kv b, .hmc-kv b";
  function units() {
    $$(UNIT_IN).forEach(el => {
      if (el.childNodes.length !== 1 || el.firstChild.nodeType !== 3) return;
      const m = UNIT.exec(el.textContent.trim());
      if (!m) return;
      const u = document.createElement("i"); u.className = "u"; u.textContent = m[2];
      el.textContent = m[1]; el.appendChild(u);
    });
  }

  /* ---------- one look for each kind of message ---------- */
  const STATES = [
    ["loading", /^(載入中|讀取中)/],
    ["error", /^([^，。（]{0,8}讀不到|查無)/],
    ["empty", /^(沒有|還沒有|目前沒有|尚無|找不到|資料不足)/],
    ["closed", /^休市/],
  ];
  const MSG_IN = ".app p, .app .empty, .app .mempty, .app .sub, .app .msg";
  function states() {
    $$(MSG_IN).forEach(el => {
      let kind = null;
      if (!el.querySelector("button, input, a, div, p, table, svg")) {
        const t = el.textContent.trim();
        const hit = t.length < 90 && STATES.find(s => s[1].test(t));
        if (hit) kind = hit[0];
      }
      if (kind) { if (el.dataset.state !== kind) el.dataset.state = kind; }
      else if (el.dataset.state) delete el.dataset.state;
    });
  }

  /* ---------- chart text: drawn in viewBox units, so each chart is told what 11 (K-line: 12) screen pixels is in its own units ---------- */
  const CHARTS = "svg.kchart, svg.ixfig, svg.mc, svg.lfig, svg.cmsvg, svg.river, .finp svg, svg.cpsvg";
  function axes() {
    $$(CHARTS).forEach(svg => {
      const vb = svg.viewBox && svg.viewBox.baseVal, r = svg.getBoundingClientRect();
      if (!vb || !vb.width || !r.width) return;
      let k = r.width / vb.width;
      if (svg.getAttribute("preserveAspectRatio") === "none") k = Math.min(k, r.height / vb.height || k);
      /* upper limits keep the labels inside the margins each drawing leaves for them */
      const max = svg.classList.contains("cmsvg") ? 10 : 13;
      const fs = Math.round(Math.max(7, Math.min(max, (svg.classList.contains("kchart") ? 12 : 11) / k)) * 10) / 10 + "px";
      if (svg.style.getPropertyValue("--ch-fs") !== fs) svg.style.setProperty("--ch-fs", fs);
    });
  }

  let queued = false;
  function run() { queued = false; units(); states(); axes(); }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(run); } }
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "hidden"] });
  addEventListener("resize", queue);
  queue();
})();
} catch (e) { setTimeout(() => { throw e; }, 0); }
/* ===== twmotion.js ===== */
try {
/* Shared motion layer (the same code in TWstock and EZexams; only CONFIG differs). It adds what the two animation
   guides ask for and that the pages did not have yet:
     1. popups, menus and tooltips that had no entrance get one: 180ms ease-out, growing from where they were opened
     2. press feedback on anything pressable that had none
     3. the content of a <details> fades in when it opens
     4. nothing animates when the keyboard did it (shortcuts and tab arrows are used too often to wait for)
     5. endless animations pause while they are off screen
   It never replaces an animation that is already there. */
(function () {
  "use strict";
  if (!document.body || !document.body.animate) return;
  const CONFIG = {
    /* [selector, kind, transform-origin] kind: menu | tip | dialog */
    popups: [
      [".ctxmenu", "menu"], [".ssug", "menu", "top center"], [".cpsug", "menu", "top right"], [".hmcard", "menu", "center"],
      [".kbhelp", "dialog"], [".pal-box", "dialog"], [".fxshare-box", "dialog"], [".ixdetail", "menu", "top center"],
      [".ktip", "tip"], [".hmtip", "tip"], [".fxpeek", "menu"], [".toast", "menu", "bottom right"],
    ],
    shortcut: (e, typing) => ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") || e.key === "Escape" ||
      (!typing && (/^[1-9/?]$/.test(e.key) || (/^Arrow/.test(e.key) && !!(e.target.closest && e.target.closest(".dtabs, [role=tablist]"))))),
  };
  const calm = { matches: false };
  const root = document.documentElement;

  const css = document.createElement("style");
  css.textContent = `
:root { --motion-out: cubic-bezier(.23, 1, .32, 1); --motion-in-out: cubic-bezier(.77, 0, .175, 1); }
/* zero specificity: anything that already has its own transition or press style keeps it */
:where(button, [role="button"], [role="tab"], summary) { transition: scale 140ms var(--motion-out); }
:where(button, [role="button"], summary):where(:active:not(:disabled)) { scale: .97; }
html.kb-now *, html.kb-now *::before, html.kb-now *::after { transition-duration: 0s !important; transition-delay: 0s !important; }
`;
  document.head.insertBefore(css, document.head.firstChild);

  /* ---------- keyboard ---------- */
  let kbUntil = 0, kbTimer = 0;
  const byKeyboard = () => performance.now() < kbUntil;
  addEventListener("keydown", e => {
    const t = e.target, typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ""));
    if (!CONFIG.shortcut(e, typing)) return;
    kbUntil = performance.now() + 450; root.classList.add("kb-now");
    clearTimeout(kbTimer); kbTimer = setTimeout(() => root.classList.remove("kb-now"), 450);
  }, true);
  addEventListener("pointerdown", () => { kbUntil = 0; root.classList.remove("kb-now"); }, true);

  /* ---------- entrances for popups that have none ---------- */
  const KIND = { menu: [180, .96, -4], tip: [125, 1, 0], dialog: [220, .96, 8] };
  const shownState = new WeakMap();
  const visible = el => el.isConnected && !el.hidden && el.getClientRects().length > 0;
  function enter(el, kind, origin) {
    const was = shownState.get(el), now = visible(el);
    shownState.set(el, now);
    if (!now || was) return;
    /* its own entrance (CSS or script) wins */
    if (el.getAnimations().length) return;
    const [ms, from, dy] = KIND[kind];
    if (origin && !el.style.transformOrigin) el.style.transformOrigin = origin;
    const still = calm.matches;
    el.animate(still ? [{ opacity: 0 }, { opacity: getComputedStyle(el).opacity }]
      : [{ opacity: 0, scale: String(from), translate: "0 " + dy + "px" }, { opacity: getComputedStyle(el).opacity, scale: "1", translate: "0 0" }],
      { duration: ms, easing: "cubic-bezier(.23,1,.32,1)" });
  }
  const sweep = () => CONFIG.popups.forEach(([sel, kind, origin]) => document.querySelectorAll(sel).forEach(el => enter(el, kind, origin)));
  const ANY = CONFIG.popups.map(p => p[0]).join(",");
  let queued = false;
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; sweep(); }); } };
  new MutationObserver(list => {
    if (list.some(m => (m.type === "attributes" ? m.target.matches(ANY) || !!m.target.querySelector(ANY)
      : [...m.addedNodes, ...m.removedNodes].some(n => n.nodeType === 1 && (n.matches(ANY) || !!n.querySelector(ANY)))))) queue();
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "open"] });
  /* a popup that closed must be able to come in again */
  sweep();

  /* ---------- <details> ---------- */
  document.addEventListener("toggle", e => {
    const d = e.target; if (!d || d.tagName !== "DETAILS" || !d.open || byKeyboard()) return;
    [...d.children].forEach((c, i) => {
      if (c.tagName === "SUMMARY" || c.getAnimations().length) return;
      c.animate(calm.matches ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, translate: "0 -6px" }, { opacity: 1, translate: "0 0" }],
        { duration: 200, delay: Math.min(i - 1, 4) * 40, easing: "cubic-bezier(.23,1,.32,1)", fill: "backwards" });
    });
  }, true);

  /* ---------- endless animations rest while off screen ---------- */
  if (window.IntersectionObserver && document.getAnimations) {
    const paused = new WeakMap(), watched = new Set(), onScreen = new WeakMap();
    /* read from the document's list: animations on ::before / ::after are not returned by the element itself */
    const apply = (el, list) => list.forEach(a => {
      if (!a.effect || a.effect.target !== el || a.effect.getComputedTiming().iterations !== Infinity) return;
      if (onScreen.get(el) === false) { if (a.playState === "running") { a.pause(); paused.set(a, true); } }
      else if (paused.get(a)) { paused.delete(a); a.play(); }
    });
    const io = new IntersectionObserver(es => es.forEach(en => { onScreen.set(en.target, en.isIntersecting); apply(en.target, document.getAnimations()); }), { rootMargin: "120px" });
    setInterval(() => {
      if (document.hidden) return;
      const all = document.getAnimations();
      all.forEach(a => {
        const el = a.effect && a.effect.target;
        if (el && !watched.has(el) && a.effect.getComputedTiming().iterations === Infinity) { watched.add(el); io.observe(el); }
      });
      watched.forEach(el => { if (!el.isConnected) { io.unobserve(el); watched.delete(el); } else apply(el, all); });
    }, 2000);
  }
})();
} catch (e) { setTimeout(() => { throw e; }, 0); }
