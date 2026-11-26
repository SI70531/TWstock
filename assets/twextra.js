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
      const got = [], start = lastDay(), today = taipei().ymd;
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
    el.innerHTML = !A.DB.live || !listed(code) ? msg(A.DB.live ? "只提供上市股票。" : "示意資料模式下沒有股利資料。") : `<button type="button" class="btn" data-xdivload>讀取近 5 年除權息</button>`;
  }
  async function loadDivs() {
    const c = A.code(), el = divOut(), t = taipei().ymd;
    el.innerHTML = msg("載入中…");
    try {
      const all = await dividends(String(+t.slice(0, 4) - 5) + "0101", t);
      if (c !== A.code()) return;
      DV.code = c; DV.list = all.filter(r => r.code === c).sort((a, b) => (a.date < b.date ? -1 : 1)); paintDivList();
    } catch (e) { if (c === A.code()) el.innerHTML = msg("股利資料暫時讀不到。") + `<button type="button" class="btn" data-xdivload>再試一次</button>`; }
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
    if (c === A.code() && c === DV.code) { paintDivList(); if (failed) say("日線暫時讀不到，過一會兒再按一次。"); }
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
    if (!A.DB.live) { el.innerHTML = msg(A.DB.list.length ? "示意資料模式下沒有籌碼資料。" : "載入中…"); return; }
    const m = TP.margin, S = (m && m.sum) || {}, T = TP.tech;
    const cell = (name, value, sub, t) => `<div class="xcell"><span>${name}</span><b>${value}</b><i class="${t || ""}">${sub}</i></div>`;
    const cash = S.money, short = S.short;
    let h = cell("融資餘額", cash ? A.fmt(cash.now / 1e5, 0) + " 億" : "—", cash ? `較前一日 ${A.signed((cash.now - cash.prev) / 1e5, 1)} 億` : (m === false ? "暫時讀不到" : "載入中…"), cash ? A.tone(cash.now - cash.prev) : "") +
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
    TP.techBusy = true; TP.techMsg = "讀取中…"; paintTemp();
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
      SCT.busy = true; SCT.note = "讀取中…"; repaint();
      try { SCT.v = await tech((i, n) => { SCT.note = `讀取交易日 ${i}/${n}…`; repaint(); }); SCT.note = ""; }
      catch (e) { SCT.note = e.message || "技術資料暫時讀不到。"; }
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
    if (!A.DB.live) return say("目前是示意資料，無法計算。");
    const codes = [...new Set(H.map(h => h.code).concat(["0050"]))], series = new Map();
    for (let i = 0; i < codes.length; i++) {
      say(`讀取日線 ${i + 1}/${codes.length}（${nameOf(codes[i])}）… 第一次會比較久，之後有快取。`);
      try { series.set(codes[i], await TWLab.bars(codes[i], 7)); } catch (e) { series.set(codes[i], []); }
    }
    const used = H.filter(h => (series.get(h.code) || []).length > 20), left = H.filter(h => !used.includes(h));
    const bench = series.get("0050") || [];
    if (!used.length || bench.length < 20) return say("日線不足，暫時畫不出來。");
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
  const TG = [["stock", "自選與持股 ±5%、漲跌停"], ["index", "大盤與台指期夜盤大漲跌"], ["news", "AI 篩選的重大新聞與公告"], ["bell", "開盤與收盤通知"], ["notes", "盤前、盤中、收盤摘要與週回顧"]];
  let pendingRestore = null, tgState = null;
  function backup() {
    const data = {}; ownKeys().forEach(k => { data[k] = localStorage.getItem(k); });
    const a = document.createElement("a"), day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: "twstock", version: 1, at: Date.now(), data }, null, 1)], { type: "application/json" })); a.download = `twstock-backup-${day}.json`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    A.store.set("twlab-backup-at", Date.now()); paintBackupNote();
  }
  function paintBackupNote() {
    const el = $("#dpHold .setlast"); if (!el) return;
    const at = A.store.get("twlab-backup-at", 0);
    el.textContent = at ? `上次備份：${twTime(at)}` : "還沒有備份過。";
  }
  function readBackup(file) {
    const say = t => { $("#dpHold .setmsg").textContent = t; }, go = $("#dpHold [data-restore]");
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
    } catch (e) { $("#dpHold .setmsg").textContent = "瀏覽器空間不足，只還原了一部分。清出空間後再還原一次。"; return; }
    location.reload();
  }
  function paintTg() {
    const el = $(".settg"); if (!el) return;
    const S = tgState;
    el.textContent = !S ? "" : S.old ? "目前部署的 Worker 還是舊版，這些開關要部署新版後才生效。" : S.ok ? "已同步到 Worker。" : S.owner === false ? "只有擁有者裝置的設定會生效。" : "同步失敗。";
  }

  function holdExtraHTML() {
    const opt = A.store.get("twalert-opt", {}) || {}, cash = +A.store.get("twlab-cash", 0) || 0;
    const mv = holdings().reduce((a, h) => { const s = A.DB.by.get(h.code); return a + (s && s.price > 0 ? s.price * h.shares : 0); }, 0);
    return `<div class="dcard"><div class="aihead"><div><h3>持股走勢與 0050 比較</h3></div><button type="button" class="aigo" data-xcurve>畫出走勢</button></div><p class="sub lcmsg" role="status"></p><div class="lcurve"></div></div>`;
  }
  /* top-right 設定: the Telegram switches live in a popup now */
  function openSettings() {
    let el = $(".setdlg"); if (el) return;
    const opt = A.store.get("twalert-opt", {}) || {};
    el = document.createElement("div"); el.className = "kbhelp setdlg"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "設定");
    el.innerHTML = `<div class="kbcard setcard"><h3>Telegram 通知</h3>${TG.map(([k, t]) => `<label class="lcheck"><input type="checkbox" data-tg="${k}" ${opt[k] === false ? "" : "checked"}><span>${t}</span></label>`).join("")}<p class="sub settg" role="status"></p></div>`;
    const shut = () => { document.removeEventListener("keydown", esc); el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" }).onfinish = () => el.remove(); };
    const esc = e => { if (e.key === "Escape") shut(); };
    document.addEventListener("keydown", esc);
    el.addEventListener("click", e => { if (!e.target.closest(".kbcard")) shut(); });
    el.addEventListener("change", e => { const t = e.target; if (!t.dataset.tg) return; const o = A.store.get("twalert-opt", {}) || {}; o[t.dataset.tg] = t.checked; A.store.set("twalert-opt", o); tgState = null; $(".settg", el).textContent = "同步中…"; document.dispatchEvent(new Event("twalert:change")); });
    document.body.appendChild(el); paintTg();
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
  const START = 1000000;
  function account() {
    const a = A.store.get("twsim", null);
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
    if (!A.DB.live) return say("目前是示意資料，不能下單。", true);
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
    if (!A.DB.live) return say("目前是示意資料，無法對照。");
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
      <div class="xsec"><div class="aihead"><div><h3>AI 判斷命中率</h3></div><button type="button" class="aigo" data-check>更新對照結果</button></div>
        <p class="sub">紀錄只存在這個瀏覽器，從開始使用這項功能起累積。個股分析要在本站看過才會記下。</p><p class="sub logmsg" role="status"></p></div>
      <div class="xsec"><h4>AI 個股分析命中率</h4><div class="logsum"></div></div><div class="xsec"><h4>盤前預測命中率</h4><div class="logpmsum"></div></div>
      <div class="xsec"><h4>AI 個股分析紀錄</h4><div class="logai"></div></div>
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
    $(".logai", el).innerHTML = L.length ? table(["分析時間", "股票", "判斷", "當時價格", "5 日", "10 日", "20 日", ""], L.map(x => `<tr><td class="l">${twTime(x.at)}</td><td><button type="button" class="chip" data-open="${A.esc(x.code)}">${A.esc(x.name)} ${A.esc(x.code)}</button></td><td title="${A.esc(x.headline)}">${A.esc(x.stance || "—")}${x.action ? "・" + A.esc(x.action) : ""}</td><td>${A.fmt(x.price, A.dig(x.price))}</td>${HORIZON.map(h => { const r = x.res && x.res[h]; return !r ? "<td>—</td>" : r.skip ? "<td>價格不連續</td>" : `<td class="${A.tone(r.ret)}">${A.pct(r.ret)}</td>`; }).join("")}<td><button type="button" class="lx" data-logdrop="${A.esc(x.code + ":" + x.at)}" aria-label="刪除這筆紀錄">×</button></td></tr>`)) : msg("還沒有紀錄。到「個股分析」跑一次 AI 分析就會出現在這裡。");
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
