/* TWstock extra data cards and the loaders behind them.
   個股分析   到價提醒 (sent to the Worker with the alert list), 融資融券・借券 (TWSE MI_MARGN, TWT93U),
              股利與填息 (TWSE TWT49U, STOCK_DAY), 估值歷史位置 (TWSE BWIBBU, one month at a time).
   總覽       大盤籌碼溫度: market margin balance, foreign investors' net open interest in TAIEX futures (otc.json),
              and the share of listed stocks above their 20 / 60 day averages.
   Shared     window.TWData: lineChart (比較, 我的持股), tech (選股器), dividends (我的持股), marginFacts (AI).
   Everything here is TWSE-listed only. The technical figures use unadjusted closes. */
(function () {
  "use strict";
  let A = null;
  const ok = Number.isFinite;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const compact = ds => String(ds).replace(/-/g, "");
  const ymdOf = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  const dateOf = ds => new Date(+ds.slice(0, 4), +ds.slice(4, 6) - 1, +ds.slice(6));
  const lastDay = () => (A.DB.date ? dateOf(A.DB.date) : new Date());
  const listed = code => { const s = A.DB.by.get(code); return !!s && s.mkt !== "otc" && s.mkt !== "esb"; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const row = (k, v, t) => `<div class="snap"><span>${k}</span><b class="${t || ""}">${v}</b></div>`;
  const msg = t => `<p class="sub">${A.esc(t)}</p>`;
  const lots = v => (ok(v) ? A.fmt(Math.round(v)) + " 張" : "—");
  const delta = v => (ok(v) ? A.signed(Math.round(v), 0) + " 張" : "—");

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
        ${[0, mid, dates.length - 1].map((i, k) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${["start", "middle", "end"][k]}">${A.slash(dates[i])}</text>`).join("")}
        ${paths}<line class="mc-x" y1="${T}" y2="${H - B}" hidden></line></svg>`;
    const svg = $("svg", host), cross = $(".mc-x", host);
    /* the readout shows each series' value on the pointed day (or the latest one it has by then) */
    const read = i => {
      series.forEach((s, k) => {
        let v = NaN; for (let j = i; j >= 0 && !ok(v); j--) v = at[k].get(dates[j]);
        $(`.mc-v[data-k="${k}"]`, host).textContent = ok(v) ? fmt(v) : "—";
      });
      $(".mc-d", host).textContent = A.slash(dates[i]);
    };
    const move = e => {
      const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W, i = Math.max(0, Math.min(dates.length - 1, Math.round((px - L) / (W - L - R) * (dates.length - 1))));
      cross.removeAttribute("hidden"); cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); read(i);
    };
    svg.addEventListener("pointermove", move); svg.addEventListener("pointerdown", move);
    svg.addEventListener("pointerleave", () => { cross.setAttribute("hidden", ""); read(dates.length - 1); });
    read(dates.length - 1);
  }

  /* ---------------- 融資融券 and 借券, the newest published day ---------------- */
  const MARGIN = { v: null, busy: null };
  function loadMargin() {
    if (MARGIN.v) return Promise.resolve(MARGIN.v);
    if (!A.DB.live) return Promise.resolve(null);
    if (MARGIN.busy) return MARGIN.busy;
    MARGIN.busy = (async () => {
      const start = lastDay();
      for (let back = 0; back < 6; back++) {
        const ds = ymdOf(new Date(start.getTime() - back * 864e5));
        const j = await A.J(`https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${ds}&selectType=ALL&response=json`);
        const per = j.stat === "OK" && (j.tables || [])[1];
        if (!per || !(per.data || []).length) { await A.wait(500); continue; }
        const stocks = new Map(per.data.map(r => [String(r[0]).trim(), { mPrev: A.num(r[5]), mNow: A.num(r[6]), mLimit: A.num(r[7]), sPrev: A.num(r[11]), sNow: A.num(r[12]) }]));
        /* market totals: lots of margin and short, and the margin money in NT$ thousand */
        const sum = {};
        ((j.tables[0] || {}).data || []).forEach(r => { const k = /融資金額/.test(r[0]) ? "money" : /融資/.test(r[0]) ? "margin" : /融券/.test(r[0]) ? "short" : ""; if (k) sum[k] = { prev: A.num(r[4]), now: A.num(r[5]) }; });
        let sbl = new Map();
        try {
          await A.wait(500);
          const k = await A.J(`https://www.twse.com.tw/rwd/zh/marginTrading/TWT93U?date=${ds}&response=json`);
          if (k.stat === "OK") sbl = new Map((k.data || []).map(r => [String(r[0]).trim(), { prev: A.num(r[8]) / 1000, now: A.num(r[12]) / 1000 }]));
        } catch (e) { /* 借券 shows as missing */ }
        return (MARGIN.v = { date: ds, stocks, sum, sbl });
      }
      return null;
    })().finally(() => { MARGIN.busy = null; });
    return MARGIN.busy;
  }
  async function marginFacts(code) {
    const m = await loadMargin(), s = m && m.stocks.get(code); if (!s) return null;
    const b = m.sbl.get(code), n = v => (ok(v) ? Math.round(v) : null);
    return { date: m.date, marginBalanceLots: n(s.mNow), marginChangeLots: n(s.mNow - s.mPrev), marginUsagePct: s.mLimit > 0 ? Math.round(s.mNow / s.mLimit * 1000) / 10 : null,
      shortBalanceLots: n(s.sNow), shortChangeLots: n(s.sNow - s.sPrev), securitiesLendingSoldLots: b ? n(b.now) : null, securitiesLendingChangeLots: b ? n(b.now - b.prev) : null };
  }

  /* ---------------- ex-dividend results of every listed security between two dates ---------------- */
  const DIVS = new Map();
  function dividends(from, to) {
    const key = from + "-" + to;
    if (!DIVS.has(key)) DIVS.set(key, A.J(`https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate=${from}&endDate=${to}&response=json`).then(j => {
      if (j.stat !== "OK" || !Array.isArray(j.data)) throw new Error("no dividend table");
      return j.data.map(r => ({ date: A.ymd(r[0]), code: String(r[1]).trim(), before: A.num(r[3]), ref: A.num(r[4]), value: A.num(r[5]), kind: String(r[6]).trim() })).filter(r => r.date);
    }).catch(e => { DIVS.delete(key); throw e; }));
    return DIVS.get(key);
  }
  /* trading days (the ex-date counts as 1) until a close is back at the close before the ex-date; looked for over 12 months */
  async function fillDays(code, ev, onStep) {
    const now = A.taipei().ymd, first = dateOf(ev.date);
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

  /* ---------------- valuation by day for the last 36 months ---------------- */
  async function valuation(code, onStep) {
    const ms = A.monthsBack(36), out = [];
    for (let i = ms.length - 1; i >= 0; i--) {
      const ym = ms[i], key = `twval:${code}:${ym}`;
      let rows = i > 0 ? A.store.get(key, null) : null;
      if (!rows) {
        await A.wait(1100);
        const j = await A.J(`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?date=${ym}01&stockNo=${code}&response=json`);
        if (j.stat === "OK" && Array.isArray(j.data)) {
          const ix = k => j.fields.findIndex(f => f.includes(k)), iY = ix("殖利率"), iP = ix("本益比"), iB = ix("股價淨值比");
          rows = j.data.map(r => [A.num(r[iP]) || null, ok(A.num(r[iY])) ? A.num(r[iY]) : null, A.num(r[iB]) || null]);
          if (i > 0) A.store.set(key, rows);
        } else rows = [];                      /* months before the stock was listed have no table */
      }
      out.push(...rows);
      onStep && onStep(ms.length - i, ms.length);
    }
    return out;
  }
  function position(values, now) {
    const v = values.filter(x => ok(x) && x > 0).sort((a, b) => a - b);
    if (v.length < 60 || !(now > 0)) return null;
    return { now, lo: v[0], mid: v[Math.floor(v.length / 2)], hi: v[v.length - 1], pct: v.filter(x => x <= now).length / v.length * 100, n: v.length };
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
        volx: v20 > 0 ? cs[n - 1][5] / v20 : NaN, high60: n >= 60 ? z >= Math.max(...cl.slice(-60)) : null });
    });
    return { date: last, days: days.length, map: out };
  }
  /* how many of the wanted days are already kept: lets a page use the figures without asking for a long download */
  async function techCached() {
    try { const keys = await tx("readonly", s => s.getAllKeys()); return keys.filter(k => k >= ymdOf(new Date(lastDay().getTime() - 120 * 864e5))).length; } catch (e) { return 0; }
  }
  function tech(onStep) {
    if (onStep) TECH.listeners.add(onStep);
    if (TECH.v && TECH.v.date >= A.DB.date) return Promise.resolve(TECH.v);
    if (TECH.busy) return TECH.busy;
    if (!A.DB.live) return Promise.reject(new Error("目前是示意資料，算不出技術條件。"));
    TECH.busy = (async () => {
      const got = [], start = lastDay(), today = A.taipei().ymd;
      for (let back = 0; back < 130 && got.length < NEED; back++) {
        const d = new Date(start.getTime() - back * 864e5); if (d.getDay() % 6 === 0) continue;
        const ds = ymdOf(d);
        let rec = await tx("readonly", s => s.get(ds)).catch(() => undefined);
        if (rec === undefined) {
          await A.wait(2200);                  /* TWSE blocks pages that ask too fast */
          let rows;
          try { rows = await readDay(ds); } catch (e) { throw new Error(`證交所暫時拒絕讀取（已讀 ${got.length} 天）。過幾分鐘再按一次，會從這裡接著讀。`); }
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

  window.TWData = { lineChart, loadMargin, marginFacts, dividends, tech, techCached, listed };

  /* ================= 個股分析 cards ================= */
  const ALERT_OPS = { ge: "價格漲到（≥）", le: "價格跌到（≤）", ma20: "跌破月線（MA20）", ma60: "跌破季線（MA60）" };
  const alerts = () => { const a = A.store.get("twalert-price", []); return Array.isArray(a) ? a : []; };
  let syncState = null;
  const code = () => A.code();
  const box = s => $("#dpStock " + s);
  function paintAlerts() {
    const el = box(".xalist"); if (!el) return;
    const mine = alerts().filter(a => a.code === code()), s = A.DB.by.get(code());
    el.innerHTML = mine.length ? mine.map(a => {
      const hit = s && ((a.op === "ge" && s.price >= a.v) || (a.op === "le" && s.price <= a.v));
      return `<div class="snap"><span>${ALERT_OPS[a.op]}${a.v ? " " + A.fmt(a.v, A.dig(a.v)) : ""}</span><b>${hit ? "<em class='xhit'>目前已達到</em> " : ""}<button type="button" class="lx" data-xdrop="${A.esc(a.id)}" aria-label="刪除提醒">×</button></b></div>`;
    }).join("") : msg("這檔還沒有提醒。");
    const st = box(".xastate"), S = syncState;
    st.textContent = !S ? "盤中每分鐘檢查，達到時傳 Telegram，每天最多一次。"
      : S.old ? "目前部署的 Worker 還是舊版，到價提醒尚未生效。部署新版後重新整理。"
      : S.ok ? `已同步 ${S.price || 0} 個到價提醒。盤中每分鐘檢查，每天最多通知一次。`
      : S.owner === false ? "只有擁有者裝置的提醒會通知。" : "同步失敗，提醒還沒生效。";
    st.classList.toggle("warn", !!S && (!S.ok || !!S.old));
  }
  function addAlert() {
    const op = box('[name="xop"]').value, v = parseFloat(box('[name="xv"]').value), need = op === "ge" || op === "le", st = box(".xastate");
    if (need && !(v > 0)) { st.textContent = "請填價格。"; return; }
    if (alerts().length >= 30) { st.textContent = "最多 30 個提醒，先刪掉不用的。"; return; }
    A.store.set("twalert-price", alerts().concat([{ id: uid(), code: code(), op, v: need ? v : 0 }]));
    box('[name="xv"]').value = "";
    paintAlerts(); document.dispatchEvent(new Event("twalert:change"));
  }
  async function paintMargin(c) {
    const el = box(".xmargin"); if (!el) return;
    el.innerHTML = msg(A.DB.live ? "載入中…" : "示意資料模式下沒有融資融券資料。");
    if (!A.DB.live) return;
    if (!listed(c)) { el.innerHTML = msg("只提供上市股票。"); return; }
    let m = null; try { m = await loadMargin(); } catch (e) {}
    if (c !== code()) return;
    const s = m && m.stocks.get(c);
    if (!s) { el.innerHTML = msg(m ? "這檔沒有融資融券資料。" : "資料暫時讀不到。"); return; }
    const b = m.sbl.get(c);
    el.innerHTML = row("資料日期", A.slash(m.date)) + row("融資餘額", lots(s.mNow)) + row("融資增減", delta(s.mNow - s.mPrev), A.tone(s.mNow - s.mPrev)) +
      row("融資使用率", s.mLimit > 0 ? A.fmt(s.mNow / s.mLimit * 100, 1) + "%" : "—") + row("融券餘額", lots(s.sNow)) + row("融券增減", delta(s.sNow - s.sPrev), A.tone(s.sNow - s.sPrev)) +
      row("券資比", s.mNow > 0 ? A.fmt(s.sNow / s.mNow * 100, 2) + "%" : "—") + row("借券賣出餘額", b ? lots(b.now) : "—") + row("借券賣出增減", b ? delta(b.now - b.prev) : "—", b ? A.tone(b.now - b.prev) : "");
  }
  const DV = { code: "", list: [], fill: new Map(), busy: false };
  function paintDivList() {
    const el = box(".xdiv"); if (!el) return;
    if (!DV.list.length) { el.innerHTML = msg("近 5 年沒有除權息紀錄。"); return; }
    const years = new Map();
    DV.list.forEach(e => { const y = e.date.slice(0, 4), o = years.get(y) || { cash: 0, n: 0, other: 0 }; if (e.kind === "息") { o.cash += e.value; o.n++; } else o.other++; years.set(y, o); });
    el.innerHTML = `<div class="ltblwrap"><table class="mtbl ltbl"><thead><tr><th class="l">年度</th><th>現金股利合計</th><th>除息次數</th><th>含除權</th></tr></thead><tbody>${
      [...years].sort((a, b) => b[0].localeCompare(a[0])).map(([y, o]) => `<tr><td class="l">${y}</td><td>${o.n ? A.fmt(o.cash, 2) + " 元" : "—"}</td><td>${o.n}</td><td>${o.other ? o.other + " 次" : "—"}</td></tr>`).join("")}</tbody></table></div>
      <div class="ltblwrap"><table class="mtbl ltbl"><thead><tr><th class="l">除權息日</th><th>類別</th><th>權值＋息值</th><th>前一日收盤</th><th>填息天數</th></tr></thead><tbody>${
      DV.list.slice().reverse().map(e => { const f = DV.fill.get(e.date); return `<tr><td class="l">${A.slash(e.date)}</td><td>${A.esc(e.kind)}</td><td>${A.fmt(e.value, 2)}</td><td>${A.fmt(e.before, A.dig(e.before))}</td><td>${!f ? "—" : f.days ? f.days + " 天" : "尚未填（看了 " + f.seen + " 天）"}</td></tr>`; }).join("")}</tbody></table></div>
      <div class="lform"><button type="button" class="btn" data-xfill ${DV.busy ? "disabled" : ""}>計算填息天數</button><span class="sub xfmsg">含最近 4 次，最多往後看 12 個月。</span></div>`;
  }
  async function paintDiv(c) {
    const el = box(".xdiv"); if (!el) return;
    DV.code = c; DV.list = []; DV.fill = new Map();
    if (!A.DB.live || !listed(c)) { el.innerHTML = msg(A.DB.live ? "只提供上市股票。" : "示意資料模式下沒有股利資料。"); return; }
    el.innerHTML = `<button type="button" class="btn" data-xdivload>讀取近 5 年除權息</button>`;
  }
  async function loadDivs() {
    const c = code(), el = box(".xdiv"), t = A.taipei().ymd;
    el.innerHTML = msg("載入中…");
    try {
      const all = await dividends(String(+t.slice(0, 4) - 5) + "0101", t);
      if (c !== code()) return;
      DV.list = all.filter(r => r.code === c).sort((a, b) => (a.date < b.date ? -1 : 1)); paintDivList();
    } catch (e) { if (c === code()) { el.innerHTML = msg("股利資料暫時讀不到。") + `<button type="button" class="btn" data-xdivload>再試一次</button>`; } }
  }
  async function runFill() {
    const c = DV.code; if (DV.busy) return;
    DV.busy = true;
    const todo = DV.list.slice(-4).reverse();
    const say = t => { const m = box(".xfmsg"); if (m) m.textContent = t; };
    const b = box("[data-xfill]"); if (b) b.disabled = true;
    let failed = false;
    for (const ev of todo) {
      if (c !== code()) break;
      try { const r = await fillDays(c, ev, ym => say(`讀取 ${ym.slice(0, 4)}/${ym.slice(4)} 日線…`)); if (c === DV.code) { DV.fill.set(ev.date, r); paintDivList(); } }
      catch (e) { failed = true; break; }
    }
    DV.busy = false;
    if (c === code() && c === DV.code) { paintDivList(); if (failed) say("日線暫時讀不到，過一會兒再按一次。"); }
  }
  let valBusy = false;
  function paintValStart(c) {
    const el = box(".xval"); if (!el) return;
    el.innerHTML = !A.DB.live || !listed(c) ? msg(A.DB.live ? "只提供上市股票。" : "示意資料模式下沒有估值資料。")
      : `<button type="button" class="btn" data-xvalload>讀取近 3 年估值</button> <span class="sub">第一次約 40 秒</span>`;
  }
  async function loadVal() {
    if (valBusy) return;
    const c = code(), el = box(".xval"); valBusy = true;
    el.innerHTML = msg("讀取中…");
    try {
      const rows = await valuation(c, (i, n) => { if (c === code()) el.innerHTML = msg(`讀取中 ${i}/${n} 個月…`); });
      if (c !== code()) return;
      const last = rows[rows.length - 1] || [];
      const block = (name, k, dg, unit, high) => {
        const p = position(rows.map(r => r[k]), last[k]);
        if (!p) return row(name, "資料不足（虧損或上市不久）");
        const where = p.pct >= 80 ? high[0] : p.pct <= 20 ? high[1] : "中間區";
        return `<div class="xpos"><div class="snap"><span>${name} ${A.fmt(p.now, dg)}${unit}</span><b>高於 ${A.fmt(p.pct, 0)}% 的日子・${where}</b></div>
          <div class="xbar" role="img" aria-label="${name}位於近三年第 ${A.fmt(p.pct, 0)} 百分位"><i style="left:${p.pct.toFixed(1)}%"></i></div>
          <p class="sub">低 ${A.fmt(p.lo, dg)}・中位 ${A.fmt(p.mid, dg)}・高 ${A.fmt(p.hi, dg)}（${p.n} 天）</p></div>`;
      };
      el.innerHTML = block("本益比", 0, 2, "", ["偏高區", "偏低區"]) + block("殖利率", 1, 2, "%", ["偏高區", "偏低區"]) + block("股價淨值比", 2, 2, "", ["偏高區", "偏低區"]) +
        msg("只和這檔自己的過去比。偏低不代表便宜，可能是獲利預期變差。");
    } catch (e) { if (c === code()) el.innerHTML = msg("證交所暫時拒絕讀取，讀過的月份已保留。") + `<button type="button" class="btn" data-xvalload>接著讀</button>`; }
    finally { valBusy = false; }
  }
  function paintStockCards(c) {
    if (!box(".xgrid")) return;
    paintAlerts(); paintMargin(c); paintDiv(c); paintValStart(c);
  }
  function buildStockCards() {
    const panel = $("#dpStock"), ai = $(".sai", panel); if (!ai) return;
    const el = document.createElement("div"); el.className = "xgrid";
    el.innerHTML = `<div class="dcard"><h3>到價提醒</h3><div class="xalist"></div>
        <div class="lform"><select class="in" name="xop" aria-label="提醒條件">${Object.entries(ALERT_OPS).map(([k, t]) => `<option value="${k}">${t}</option>`).join("")}</select><input class="in" name="xv" inputmode="decimal" placeholder="價格" aria-label="提醒價格"><button type="button" class="aigo" data-xadd>加入提醒</button></div>
        <p class="sub xastate" role="status"></p></div>
      <div class="dcard"><h3>融資融券・借券</h3><div class="xmargin"></div></div>
      <div class="dcard"><h3>估值歷史位置</h3><div class="xval"></div></div>
      <div class="dcard xwide"><h3>股利與填息</h3><div class="xdiv"></div></div>`;
    panel.insertBefore(el, ai);
    el.addEventListener("click", e => {
      if (e.target.closest("[data-xadd]")) return addAlert();
      const d = e.target.closest("[data-xdrop]");
      if (d) { A.store.set("twalert-price", alerts().filter(a => a.id !== d.dataset.xdrop)); paintAlerts(); return document.dispatchEvent(new Event("twalert:change")); }
      if (e.target.closest("[data-xdivload]")) return loadDivs();
      if (e.target.closest("[data-xfill]")) return runFill();
      if (e.target.closest("[data-xvalload]")) return loadVal();
    });
    el.addEventListener("change", e => { if (e.target.name === "xop") { const i = $('[name="xv"]', el); i.disabled = !/^(ge|le)$/.test(e.target.value); } });
    el.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.name === "xv") addAlert(); });
  }

  /* ================= 總覽: 大盤籌碼溫度 ================= */
  const heatEl = () => $("#dpOverview .xtemp");
  const TP = { margin: null, tech: null, techMsg: "", techBusy: false };
  function paintTemp() {
    const el = heatEl(); if (!el) return;
    if (!A.DB.live) { el.innerHTML = msg(A.DB.list.length ? "示意資料模式下沒有籌碼資料。" : "載入中…"); return; }
    const m = TP.margin, S = (m && m.sum) || {}, F = A.DB.futoi, T = TP.tech;
    const cell = (name, value, sub, t) => `<div class="xcell"><span>${name}</span><b>${value}</b><i class="${t || ""}">${sub}</i></div>`;
    const money = S.money, short = S.short;
    let h = cell("融資餘額", money ? A.fmt(money.now / 1e5, 0) + " 億" : "—", money ? `較前一日 ${A.signed((money.now - money.prev) / 1e5, 1)} 億` : (m === false ? "暫時讀不到" : "載入中…"), money ? A.tone(money.now - money.prev) : "") +
      cell("融券餘額", short ? A.fmt(short.now) + " 張" : "—", short ? `較前一日 ${A.signed(short.now - short.prev, 0)} 張` : "", short ? A.tone(short.now - short.prev) : "") +
      cell("外資台指期未平倉", F && ok(F.foreign) ? A.signed(F.foreign, 0) + " 口" : "—", F && ok(F.foreign) ? `${F.foreign > 0 ? "淨多單" : "淨空單"}・${A.slash(String(F.date))}` : "新版排程發布後顯示", F ? A.tone(F.foreign) : "");
    if (T) {
      const all = [...T.map.values()], share = (k) => { const v = all.filter(x => x[k] != null); return v.length ? v.filter(x => x[k]).length / v.length * 100 : NaN; };
      h += cell("站上月線的股票", A.fmt(share("above20"), 1) + "%", `收盤價高於 MA20・${A.slash(T.date)}`) + cell("站上季線的股票", A.fmt(share("above60"), 1) + "%", "收盤價高於 MA60");
    } else h += `<div class="xcell xcta"><span>站上月線／季線的比例</span><button type="button" class="btn" data-xtech ${TP.techBusy ? "disabled" : ""}>計算</button><i>${A.esc(TP.techMsg || "第一次約 3 分鐘，之後只讀新的日期")}</i></div>`;
    el.innerHTML = h;
    $("#dpOverview .xtempd").textContent = m ? "融資融券 " + A.slash(m.date) : "";
  }
  async function runTempTech() {
    if (TP.techBusy) return;
    TP.techBusy = true; TP.techMsg = "讀取中…"; paintTemp();
    try { TP.tech = await tech((i, n) => { TP.techMsg = `讀取交易日 ${i}/${n}…`; paintTemp(); }); }
    catch (e) { TP.techMsg = e.message; }
    TP.techBusy = false; paintTemp();
  }
  async function loadTemp() {
    paintTemp();
    if (!A.DB.live) return;
    try { TP.margin = (await loadMargin()) || false; } catch (e) { TP.margin = false; }
    paintTemp();
    if (!TP.tech && (await techCached()) >= NEED - 3) runTempTech();          /* already read before: just bring it up to date */
  }
  function buildTemp() {
    const strip = $("#dpOverview .mstrip"); if (!strip) return;
    const el = document.createElement("div"); el.className = "dcard xtempcard";
    el.innerHTML = `<div class="bd-h"><h3>大盤籌碼溫度</h3><span class="sub xtempd"></span></div><div class="xtemp"></div>`;
    strip.after(el);
    el.addEventListener("click", e => { if (e.target.closest("[data-xtech]")) runTempTech(); });
    paintTemp();
  }

  document.addEventListener("twdash:ready", () => {
    A = window.TWDash && window.TWDash.api; if (!A) return;
    buildStockCards(); buildTemp();
  });
  document.addEventListener("twdash:stock", e => { if (A) paintStockCards(e.detail); });
  document.addEventListener("twdash:list", () => { if (!A) return; loadTemp(); paintStockCards(code()); });
  document.addEventListener("twdash:alertsync", e => { syncState = e.detail; if (A) paintAlerts(); });
})();
