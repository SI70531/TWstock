import { aiWhy, geminiJson } from "./ai.js";
import { TW_UA, twCached, twFetch } from "./core.js";
import { IDX_STEP, PM_FIXED, PM_SYMS, STK_STEP, WD, hesc, tgOn, twClip, twDayReport, twFlags, twFut, twHeadlines, twInstDay, twMis, twNum, twSession, twYahoo, twYahooTW } from "./data.js";
import { pmStore } from "./do.js";


/* night-session TAIEX futures (MarketType "1"), or the futures exchange's after-hours daily report */
export async function pmNight() {
  /* the night session's last quote (TAIFEX, Yahoo Taiwan or cnyes) plus TAIFEX's daily report when it answers */
  const f0 = await twFut().catch(() => null), f = f0 && f0.z > 0 ? f0 : null;
  let rep = null;
  try {
    const a = await (await twFetch("https://openapi.taifex.com.tw/v1/DailyMarketReportFut", { headers: { "User-Agent": TW_UA, Accept: "application/json" } })).json();
    const month = x => String(x["ContractMonth(Week)"] || "").trim();
    const tx = a.filter(r => String(r.Contract).trim() === "TX" && /^\d{6}$/.test(month(r)) && twNum(r.Last) > 0);
    const pick = x => x && { date: String(x.Date || ""), month: month(x), last: twNum(x.Last), change: twNum(x.Change), high: twNum(x.High), low: twNum(x.Low), volume: twNum(x.Volume) };
    rep = { night: pick(tx.find(r => /盤後|After/i.test(String(r.TradingSession || "")))), day: pick(tx.find(r => !/盤後|After/i.test(String(r.TradingSession || "")))) };
  } catch (e) {}
  return f || rep ? { quote: f && { name: f.n, session: f.sess, last: f.z, previousClose: f.y, high: f.h, low: f.l, volume: f.v, time: f.tm, source: f.via || "taifex report" }, report: rep } : null;
}
export async function pmWorld(withHist) {
  const r = await fetch("https://query1.finance.yahoo.com/v7/finance/spark?range=" + (withHist ? "1mo" : "5d") + "&interval=1d&symbols=" + encodeURIComponent(PM_SYMS.map(x => x[0]).join(",")), { headers: { "User-Agent": TW_UA, Accept: "application/json" } });
  if (!r.ok) return [];
  const j = await r.json();
  const rows = j && j.spark && Array.isArray(j.spark.result) ? j.spark.result.map(x => ({ s: x.symbol, d: (x.response || [])[0] || {} })) : Object.entries(j || {}).map(([s, d]) => ({ s, d: d || {} }));
  return rows.map(({ s, d }) => {
    const m = d.meta || d, q = (d.indicators && d.indicators.quote && d.indicators.quote[0]) || {}, cl = (q.close || d.close || []).filter(v => v > 0);
    const ts = d.timestamp || (d.response && d.response[0] && d.response[0].timestamp) || [], rc = (q.close || d.close || []), prs = ts.map((t, k) => [t, rc[k]]).filter(x => x[1] > 0);
    const last = twNum(m.regularMarketPrice) || cl[cl.length - 1], prev = cl.length > 1 ? cl[cl.length - 2] : twNum(m.chartPreviousClose);
    const nm = (PM_SYMS.find(x => x[0] === s) || [s, s])[1], t = m.regularMarketTime ? new Date((m.regularMarketTime + 8 * 3600) * 1000).toISOString().slice(0, 16).replace("T", " ") : "";
    return last > 0 ? { name: nm, symbol: s, last: Math.round(last * 100) / 100, changePct: prev > 0 ? Math.round((last / prev - 1) * 10000) / 100 : null, asOfTaipei: t, ...(withHist ? { hist: prs.slice(-22).map(x => [x[0], Math.round(x[1] * 100) / 100]) } : {}) } : null;
  }).filter(Boolean);
}
export async function pmInst() {
  /* yesterday's institutional net buying in the cash market (NT$ 100 million), from TWSE; may refuse servers abroad */
  try {
    const d = new Date(Date.now() + 8 * 3600e3);
    for (let back = 1; back < 6; back++) {
      const x = new Date(d.getTime() - back * 864e5); if (x.getUTCDay() % 6 === 0) continue;
      const ds = x.toISOString().slice(0, 10).replace(/-/g, "");
      const j = await (await twFetch(`https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate=${ds}&response=json`, { headers: { "User-Agent": TW_UA } })).json();
      if (j.stat === "OK" && Array.isArray(j.data)) return { date: ds, rows: j.data.map(r => [String(r[0]), Math.round(twNum(r[3]) / 1e6) / 100]) };
    }
  } catch (e) {}
  return null;
}
export function pmPrompt(day, madeAt, night, world, inst, news, cands, mid) {
  const list = (a, f) => (a && a.length ? a.map(f).join("\n") : "(none found)");
  return [
mid
  ? "You are the midday desk of a Taiwan equity research team, writing for one private investor. It is now " + madeAt + " Taipei time, DURING today's Taiwan session (it closes at 13:30). You are calling the open of the NEXT trading session: 09:00 on " + day + " (" + WD[new Date(day + "T00:00:00Z").getUTCDay()] + "), not today's."
  : "You are the pre-market desk of a Taiwan equity research team, writing for one private investor. It is now " + madeAt + " Taipei time. You are calling the open of the NEXT Taiwan trading session: 09:00 on " + day + " (" + WD[new Date(day + "T00:00:00Z").getUTCDay()] + ").",
"Whenever you say 今日, 明日 or 今晚, name the date instead (for example 11/24 開盤), so the reader never has to guess which day you mean.",
"Write everything in Traditional Chinese as used in Taiwan. Be concrete; no filler.",
"",
...(mid ? ["This note is written in the middle of today's session, so the US market and tonight's night session have not happened yet. Work from what is known now: today's TAIEX so far (DATA.today: level, change, high and low, how it moved through the morning), today's TAIEX futures day session, the previous US close, Asian markets and US index futures if present in DATA.world, yesterday's institutional flows and today's news. Say plainly what tonight's US session and night session would need to do to change the call. 'night' describes today's session so far and today's futures (not a night session); 'us' describes the last US close and what tonight's US session could bring. 'close' calls the close of " + day + ", and 'watch' lists what to check tonight and in the first 30 minutes of " + day + ". Anchor the gap on today's likely close (DATA.today) instead of a night future, and keep every range modest because the night has not traded yet.", ""] : []),
"Weigh every factor that can move the Taiwan market at today's open: the TAIEX futures night session (it trades 15:00 to 05:00 and is the most direct signal of the open), the US close (S&P 500, Nasdaq, Philadelphia Semiconductor, TSMC ADR versus its Taiwan price, Nvidia), the VIX, US yields and the dollar, the NT dollar, oil, yesterday's institutional flows in Taiwan, and the news: Fed and US data, tariffs and export controls, geopolitics, big earnings, Taiwan policy.",
"",
"Rules:",
"- Use ONLY the numbers in DATA and the headlines given. Never invent a price, a figure or an event; if something important is missing say so.",
"- Keep it SHORT and plain, for reading on a phone: every sentence under about 35 Chinese characters, headline under 25, each list at most 3 items. No jargon where a plain word works.",
"- TSMC ADR: one ADR is 5 shares; if you compare it with the Taiwan price, say that you need the exchange rate and use the one in DATA.",
"- For EVERY pick also give 'analysis': 3 or 4 short points labelled 技術, 量能籌碼, 消息 and 風險, each one sentence from that stock's numbers and the headlines; and 'days': a conservative plan for each of the trading days in DATA.days (open day first), with the likely view, a price range anchored on next5d (p10 to p90 over five days, so a single day is narrower) and what to do that day. For 分批買進 the days must say when each batch is bought and under which condition, and when to stop adding.",
"- 'picks': one entry for EVERY stock in DATA.candidates, none left out: all 推薦 first, then all 追蹤, then all 持股, then all 自選, best first within each group. tag says why it is a candidate (推薦 = screened here as a stock worth ordering today: liquid, in an uptrend with close above MA20 above MA60, sitting near MA20 rather than stretched, RSI not overbought; 追蹤 = always analysed for the user: 0050 (Yuanta Taiwan 50 ETF), 2330 TSMC and 2454 MediaTek, give the same full order and plan, 買進 / 分批買進 / 觀望 as the numbers support; 持股 = the user holds it; 自選 = on the user's watchlist). For a 推薦 stock the action is 買進 or 分批買進 with a limit price at or just above its support (MA20, the lower Bollinger band or a recent low), unless tonight's factors make buying it today clearly unwise, then 觀望 and why says what would change that. For each give one concrete order like a trader would: action is exactly one of 買進, 分批買進, 觀望, 續抱, 減碼, 賣出 (for a 持股 choose among 續抱, 分批買進 as adding, 減碼, 賣出); how = order type and price (限價 or after a close above a named level), split = how to split the order, stop = the stop price and which level it is, targets = one or two target prices with the level they come from, rr = risk-reward like 1 : 2.0, why = one or two sentences tying the stock to tonight's factors. Every price must come from that candidate's numbers (ma5/ma20/ma60, bollinger, 20/60-day highs and lows, last close) or be a round number near them, and say which. If a stock is not worth buying today its action is 觀望 (or 續抱 / 減碼 / 賣出 for a 持股) and why says what would change that; say in picks_note how many are worth acting on.",
"- Nobody can know the open for sure. Give the more likely direction for today's open, a rough gap range in TAIEX points, and chances that add up to about 100%. Say what would prove the call wrong in the first 30 minutes.",
"- Be CONSERVATIVE in every estimate (the user asked for this): when unsure, lean toward the smaller move, the nearer price level and the lower confidence. Gap and close ranges stay close to what DATA.anchor and recent days support, chances are never above about 70%, confidence is 高 only when the night session, the US close and the news all point the same way, picks use the nearest stop and the nearest target, and 觀望 is a fine answer.",
"- Anchor the gap on DATA.anchor: the night-session TAIEX future versus the last TAIEX close. The gap is normally within a few hundred points of that difference and almost never beyond ±3% of the TAIEX; never give a range wider than the data supports.",
"- Also call the CLOSE of that same day (13:30): 'close' gives 收紅, 平盤 or 收黑 against the previous TAIEX close, a TAIEX range for the close (numbers near DATA levels), chances adding up to about 100%, and one short sentence why (for example whether an opening gap is likely to hold or fade).",
"",
"Return ONE JSON object and nothing else, in exactly this shape:",
'{"call":"開高|平盤附近|開低","confidence":"低|中|高","gap":"例如 +80 到 +150 點","chances":{"開高":"約 55%","平盤":"約 25%","開低":"約 20%"},"headline":"one sentence for a phone notification",',
'"close":{"call":"收紅|平盤|收黑","range":"例如 36,500–36,900","chances":{"收紅":"約 50%","平盤":"約 20%","收黑":"約 30%"},"why":"one short sentence"},',
'"night":"what the night session did and what it implies","us":"the US close and what matters for Taiwan","factors":[{"name":"factor","effect":"利多|利空|中性","note":"one or two sentences"}],',
'"sectors":["sectors or big names likely to lead or lag, with the reason"],"levels":"TAIEX levels to watch, only from DATA","risks":["..."],"watch":["what to check between 09:00 and 09:30, and events later today"],',
'"picks":[{"code":"2454","name":"聯發科","tag":"推薦|追蹤|持股|自選","action":"分批買進","how":"...","split":"...","stop":"...","targets":["..."],"rr":"1 : 2.0","why":"...",',
'"analysis":["技術：...","量能籌碼：...","消息：...","風險：..."],"days":[{"d":"11/25","view":"偏多|盤整|偏空","range":"price range","do":"what to do that day, e.g. 第一批 3,600 掛單 / 不動 / 第二批若站上 3,700"}]}],"picks_note":"one sentence on the candidates overall"}',
"",
...(mid ? ["DATA.today (TAIEX in today's session so far, TWSE): " + JSON.stringify(mid)] : []),
"DATA.night (TAIEX futures, TAIFEX" + (mid ? "; during the day this is today's day session" : "") + "): " + JSON.stringify(night),
"DATA.anchor: " + JSON.stringify(pmAnchor(night, world)),
"DATA.days (the open day and the four trading days after it): " + JSON.stringify([day.slice(5).replace("-", "/").replace(/^0/, "").replace("/0", "/")].concat(nextDays(day, 4))),
"DATA.world (Yahoo Finance, last price and % change from the previous close, time in Taipei): " + JSON.stringify(world),
"DATA.institutions (TWSE, NT$ 100 million, previous trading day): " + JSON.stringify(inst),
"DATA.candidates (computed here from Yahoo Taiwan daily bars up to the last close; prices NT$, volume in lots): " + JSON.stringify(cands || []),
"",
"HEADLINES (last 24 hours, newest first):",
list(news, x => "- " + (x.at ? new Date(x.at + 8 * 3600e3).toISOString().slice(5, 16).replace("T", " ") : "") + " " + x.t + (x.src ? "（" + x.src + "）" : "")),
  ].join("\n");
}
/* the next n weekdays after a date (exchange holidays are not known here) */
export function nextDays(day, n) { const out = []; let t = new Date(day + "T00:00:00Z"); while (out.length < n) { t = new Date(t.getTime() + 864e5); if (t.getUTCDay() % 6) out.push((t.getUTCMonth() + 1) + "/" + t.getUTCDate()); } return out; }
/* the next Taiwan session to open: today before 09:00 on a weekday, otherwise the next weekday (exchange holidays are not known here) */
export function nextOpenDay(now) {
  let t = new Date(now.getTime() + 8 * 3600e3);
  if (!(t.getUTCDay() >= 1 && t.getUTCDay() <= 5 && t.getUTCHours() < 9)) { t = new Date(t.getTime() + 864e5); while (t.getUTCDay() === 0 || t.getUTCDay() === 6) t = new Date(t.getTime() + 864e5); }
  return t.toISOString().slice(0, 10);
}
export async function pmCandidates(env) {
  /* every holding and every watchlist stock, plus up to 12 liquid stocks to screen for an order (35 chart requests in all, within the Worker's request limit).
     First cut on yesterday's close only: price 10 or more, 2,000 lots or more, a day's move between -3% and +4% (no chasing limit-ups),
     largest turnover first; the daily bars then decide (end of this function). */
  const wl = await pmStore(env, "wl").catch(() => ({})), hold = (wl.hold || []).slice(0, 30), watch = [];   /* watchlist stocks are left out of the pre-market analysis for now */
  const mkt = new Map(), strong = [];
  try {
    const a = await (await twFetch("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", { headers: { "User-Agent": TW_UA, Accept: "application/json" } })).json();
    (Array.isArray(a) ? a : []).forEach(x => { const c = String(x.Code || "").trim(), z = twNum(x.ClosingPrice), ch = twNum(x.Change), v = Math.round((twNum(x.TradeVolume) || 0) / 1000), val = twNum(x.TradeValue) || 0;
      if (!/^\d{4}$/.test(c) || !(z > 0)) return; mkt.set(c, "TW"); const p = ch != null ? ch / (z - ch) * 100 : 0; if (p > -3 && p < 4 && v >= 2000 && z >= 10) strong.push({ c, val, n: String(x.Name || "").trim() }); });
  } catch (e) {}
  try {
    const o = await (await fetch("https://raw.githubusercontent.com/SI70531/TWstock/data/otc.json", { headers: { "User-Agent": TW_UA } })).json();
    (o.list || []).forEach(x => { if (!mkt.has(x[0])) mkt.set(x[0], "TWO"); const p = x[2] > 0 && x[3] != null ? x[3] / (x[2] - x[3]) * 100 : 0; if (x[8] === "otc" && /^\d{4}$/.test(x[0]) && p > -3 && p < 4 && x[7] >= 2000 && x[2] >= 10) strong.push({ c: x[0], val: x[2] * x[7] * 1000, n: x[1] }); });
  } catch (e) {}
  /* always analysed, whatever the screen says: 0050, TSMC and MediaTek (as 持股 instead when the user holds one) */
  const fixed = PM_FIXED.filter(c => !hold.includes(c));
  const pick = strong.sort((a, b) => b.val - a.val).map(x => x.c).filter(c => !hold.includes(c) && !watch.includes(c) && !PM_FIXED.includes(c)).slice(0, Math.max(0, Math.min(12, 35 - hold.length - watch.length - fixed.length)));
  const list = [...hold.map(c => [c, "持股"]), ...fixed.map(c => [c, "追蹤"]), ...watch.map(c => [c, "自選"]), ...pick.map(c => [c, "推薦"])];
  const r2 = v => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  const out = await Promise.all(list.map(async ([code, tag]) => {
    try {
      const ex = mkt.get(code) || "TW";
      const u = "https://tw.stock.yahoo.com/_td-stock/api/resource/FinanceChartService.ApacLibraCharts;symbols=" + encodeURIComponent(JSON.stringify([code + "." + ex])) + ";type=day;period=d";
      const j = await (await fetch(u, { headers: { "User-Agent": TW_UA, Accept: "application/json" } })).json();
      const c = (j[0] || {}).chart || {}, q = (c.indicators && c.indicators.quote && c.indicators.quote[0]) || {}, m = c.meta || {};
      const rows = (c.timestamp || []).map((t, i) => [q.close && q.close[i], q.high && q.high[i], q.low && q.low[i], q.volume && q.volume[i]]).filter(r => r[0] > 0);
      if (rows.length < 30) return null;
      const cl = rows.map(r => r[0]), n = cl.length, last = cl[n - 1];
      const ma = k => (n >= k ? cl.slice(-k).reduce((a, b) => a + b, 0) / k : null), sd20 = (() => { const m20 = ma(20); return Math.sqrt(cl.slice(-20).reduce((a, b) => a + (b - m20) ** 2, 0) / 20); })();
      let g = 0, l = 0; for (let i = n - 14; i < n; i++) { const d = cl[i] - cl[i - 1]; if (d > 0) g += d; else l -= d; }
      const hi = k => Math.max(...rows.slice(-k).map(r => r[1])), lo = k => Math.min(...rows.slice(-k).map(r => r[2])), vols = rows.map(r => r[3] || 0), v20 = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
      return { code, name: m.name || code, tag, market: ex === "TW" ? "上市" : "上櫃/興櫃", close: r2(last), changePct: r2((last / cl[n - 2] - 1) * 100), ma5: r2(ma(5)), ma20: r2(ma(20)), ma60: r2(ma(60)),
        bollUpper: r2(ma(20) + 2 * sd20), bollLower: r2(ma(20) - 2 * sd20), rsi14: r2(l ? 100 - 100 / (1 + g / l) : 100), high20: r2(hi(20)), low20: r2(lo(20)), high60: r2(hi(Math.min(60, n))), low60: r2(lo(Math.min(60, n))),
        next5d: (() => {   /* 4,000 bootstrap replays of the last 60 daily returns, 5 trading days ahead */
          const R = []; for (let i = Math.max(1, n - 60); i < n; i++) R.push(cl[i] / cl[i - 1]);
          let seed = 7; for (const ch of code) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
          const end = []; for (let k = 0; k < 4000; k++) { let p = last; for (let d = 0; d < 5; d++) p *= R[Math.floor(rnd() * R.length)]; end.push(p); }
          end.sort((a, b) => a - b); const q = f => r2(end[Math.floor(f * 3999)]);
          return { p10: q(0.1), p50: q(0.5), p90: q(0.9), upChancePct: r2(end.filter(v => v > last).length / 40) };
        })(),
        volumeVs20d: v20 ? r2(vols[n - 1] / v20) : null, return5dPct: r2((last / cl[n - 6] - 1) * 100), return20dPct: n > 20 ? r2((last / cl[n - 21] - 1) * 100) : null };
    } catch (e) { return null; }
  }));
  /* the screen: an uptrend (close > MA20 > MA60, up over 20 days), close 0-6% above MA20 (near support, not stretched), RSI 40-68;
     the closer to MA20 and the calmer the RSI, the better; the best 5 stay */
  const fit = x => x.ma20 && x.ma60 && x.close > x.ma20 && x.ma20 > x.ma60 && x.close <= x.ma20 * 1.06 && x.rsi14 >= 40 && x.rsi14 <= 68 && (x.return20dPct || 0) > 0;
  const score = x => (x.close / x.ma20 - 1) * 100 + Math.abs(x.rsi14 - 55) / 5;
  const rec = out.filter(x => x && x.tag === "推薦" && fit(x)).sort((a, b) => score(a) - score(b)).slice(0, 5);
  return [...rec, ...out.filter(x => x && x.tag !== "推薦")];
}
/* the night future against the last TAIEX close: the main anchor for the opening gap */
export function pmAnchor(night, world) {
  const tw = (world || []).find(x => x.symbol === "^TWII"), q = night && night.quote;
  if (!tw || !q || !(q.last > 0)) return null;
  return { taiexClose: tw.last, nightFuture: q.last, diffPoints: Math.round(q.last - tw.last), diffPct: Math.round((q.last / tw.last - 1) * 10000) / 100, futureTime: q.time };
}
export async function premarket(env, notify, isMid) {
  if (!env.GEMINI_KEY) return { error: "no GEMINI_KEY" };
  /* the midday note calls the session after today's: tomorrow, or Monday after a Friday */
  const day = isMid ? nextOpenDay(new Date(Date.now() + 864e5 - (Date.now() + 8 * 3600e3) % 864e5)) : nextOpenDay(new Date()), madeAt = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
  const [night, world, inst, n1, n2, n3, cands, n4] = await Promise.all([
    pmNight().catch(() => null), pmWorld().catch(() => []), pmInst().catch(() => null),
    twHeadlines(isMid ? "台股 OR 台指期 OR 盤中 when:1d" : "台股 OR 台指期 OR 夜盤 when:1d", 10).catch(() => []),
    twHeadlines("美股 OR 聯準會 OR 費半 OR 台積電ADR when:1d", 10).catch(() => []),
    twHeadlines("關稅 OR 出口管制 OR 地緣政治 OR 匯率 OR 輝達 when:1d", 8).catch(() => []),
    pmCandidates(env).catch(() => []),
    twHeadlines("Fed OR \"Wall Street\" OR Nvidia OR TSMC OR tariff OR \"export controls\" OR Treasury when:1d", 10, true).catch(() => []),
  ]);
  const seen = new Set(), news = [...n1, ...n2, ...n3, ...n4].filter(x => !seen.has(x.t) && seen.add(x.t)).sort((a, b) => b.at - a.at).slice(0, 24);
  let today = null;
  if (isMid) {
    const x = (await twMis(["tse_t00.tw"]).catch(() => [])).find(r => r.c === "t00");
    if (x && x.z > 0 && x.y > 0) today = { taiex: x.z, previousClose: x.y, changePoints: Math.round(x.z - x.y), changePct: Math.round((x.z / x.y - 1) * 10000) / 100, open: x.o, high: x.h, low: x.l, time: x.tm };
    if (!today) { const q = (await twYahoo(["^TWII"]).catch(() => []))[0]; if (q && q.z > 0 && q.y > 0) today = { taiex: q.z, previousClose: q.y, changePoints: Math.round(q.z - q.y), changePct: Math.round((q.z / q.y - 1) * 10000) / 100, high: q.h, low: q.l }; }
    if (!today) today = { note: "no live TAIEX quote right now" };
  }
  /* Gemini answers 503 when Google is overloaded: wait and go round the models again (a few times for the 05:30 run) */
  const prompt = pmPrompt(day, madeAt, night, world, inst, news, cands, today);
  let g = await geminiJson(env, prompt, 0.3, 0);
  for (let k = 1; g.error && [500, 502, 503, 504].includes(g.error.status) && k <= (notify ? 4 : 2); k++) {
    await new Promise(r => setTimeout(r, (notify ? 20000 : 4000) * k));
    g = await geminiJson(env, prompt, 0.3, k);
  }
  if (g.error) return { error: g.error.daily ? "今天的額度用完了" : aiWhy(g.error.status), daily: !!g.error.daily };
  let a = null; try { a = JSON.parse(g.text); } catch (e) { const m = g.text.match(/\{[\s\S]*\}/); try { a = m ? JSON.parse(m[0]) : null; } catch (e2) { a = null; } }
  if (!a) { const t = String(g.text || "").replace(/^```(?:json)?|```$/g, "").trim(), i = t.indexOf("{"), j = t.lastIndexOf("}"); try { a = JSON.parse(t.slice(i, j + 1).replace(/,\s*([\]}])/g, "$1")); } catch (e) { a = null; } }
  if (!a || !a.call) return { error: "分析結果不完整，再按一次" };
  if (Array.isArray(a.picks)) {
    const ord = { 推薦: 0, 追蹤: 1, 持股: 2, 自選: 3 }, tagOf = c => (cands.find(x => x.code === c) || {}).tag;
    a.picks = a.picks.filter(x => x && cands.some(c => c.code === String(x.code))).map(x => Object.assign(x, { tag: tagOf(String(x.code)) || x.tag }))
      .sort((x, y) => (ord[x.tag] ?? 3) - (ord[y.tag] ?? 3));
  }
  const note = { at: Date.now(), day, madeAt, mid: !!isMid, analysis: a, data: { today, night, world, inst, candidates: cands.map(c => ({ code: c.code, name: c.name, tag: c.tag })) }, news: news.slice(0, 12).map(x => ({ t: x.t, src: x.src, u: x.u, at: x.at })) };
  const saved = await pmStore(env, isMid ? "mput" : "put", { note }).catch(e => ({ error: String(e && e.message || e) }));
  if (!saved || !saved.ok) note.saveError = (saved && saved.error) || "not saved";
  if (notify) note.sent = await pmTelegram(env, a, day, isMid);
  return note;
}
/* Telegram: the bot token is the TG_TOKEN secret; the chat is whoever first sent the bot a message (kept after that) */
export async function pmTelegram(env, a, day, isMid) {
  if (!env.TG_TOKEN) return "no TG_TOKEN";
  if (!(await tgOn(env, "notes"))) return "off";
  const api = m => "https://api.telegram.org/bot" + env.TG_TOKEN + "/" + m;
  let { chat } = await pmStore(env, "chat");
  if (!chat) {
    try { const u = await (await fetch(api("getUpdates"))).json(); const m = (u.result || []).map(x => x.message || x.channel_post).find(x => x && x.chat); if (m) { chat = m.chat.id; await pmStore(env, "chat", { set: chat }); } } catch (e) {}
  }
  if (!chat) return "no chat yet: send the bot any message first";
  const esc = v => String(v == null ? "" : v).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);
  const ch = a.chances || {}, f = (Array.isArray(a.factors) ? a.factors : []).slice(0, 6);
  const text = [
    ...(isMid ? ["<b>盤中分析</b>"] : []),
    `<b>預測 ${esc(day.slice(5).replace("-", "/"))}（${WD[new Date(day + "T00:00:00Z").getUTCDay()]}）台股開盤：${esc(a.call)}</b>（信心 ${esc(a.confidence || "—")}，${esc(a.gap || "")}）`,
    esc(a.headline || ""), "",
    `開高 ${esc(ch["開高"] || "—")}｜平盤 ${esc(ch["平盤"] || "—")}｜開低 ${esc(ch["開低"] || "—")}`,
    ...(a.close && a.close.call ? [`<b>收盤：${esc(a.close.call)}</b>（${esc(a.close.range || "")}）${esc(a.close.why || "")}`] : []), "",
    `<b>${isMid ? "今日盤勢" : "夜盤"}</b> ${esc(a.night || "—")}`, `<b>美股</b> ${esc(a.us || "—")}`, "",
    ...f.map(x => `${x.effect === "利多" ? "🔺" : x.effect === "利空" ? "🔻" : "▪️"} ${esc(x.name)}：${esc(x.note)}`), "",
    `<b>${isMid ? "今晚與開盤後盯" : "開盤後盯"}</b> ${esc((a.watch || []).slice(0, 3).join("；"))}`,
    ...(Array.isArray(a.picks) && a.picks.length ? ["", "<b>推薦下單</b>", ...a.picks.map(x => `${/賣|減/.test(x.action) ? "🔻" : /觀望|續抱/.test(x.action) ? "▪️" : "🔺"} <b>${esc(x.name)}（${esc(x.code)}）${esc(x.action)}</b>　${esc(x.how || "")}\n　停損 ${esc(x.stop || "—")}｜目標 ${esc((x.targets || []).join("、") || "—")}｜${esc(x.rr || "")}`)] : []),
    `<a href="https://si70531.github.io/TWstock/">完整分析</a>｜研究參考，不保證漲跌`,
  ].join("\n").slice(0, 4000);
  try { const r = await fetch(api("sendMessage"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }) }); return r.ok ? "sent" : "telegram " + r.status; }
  catch (e) { return "telegram failed"; }
}

/* ---------- alerts during trading hours (day 09:00–13:30, night 15:00–05:00), cron every minute ---------- */
export async function tgSend(env, text) {
  if (!env.TG_TOKEN) return "no TG_TOKEN";
  const api = m => "https://api.telegram.org/bot" + env.TG_TOKEN + "/" + m;
  let { chat } = await pmStore(env, "chat");
  if (!chat) {
    try { const u = await (await fetch(api("getUpdates"))).json(); const m = (u.result || []).map(x => x.message || x.channel_post).find(x => x && x.chat); if (m) { chat = m.chat.id; await pmStore(env, "chat", { set: chat }); } } catch (e) {}
  }
  if (!chat) return "no chat";
  try { const r = await fetch(api("sendMessage"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true }) }); return r.ok ? "sent" : "telegram " + r.status; }
  catch (e) { return "telegram failed"; }
}
export async function watchTick(env, now) {
  const ses = twSession(now); if (!ses || !env.DAILY) return;
  const st = await pmStore(env, "state"), S = st.day === ses.day ? st : { day: ses.day, lv: {}, seen: st.seen || [], newsAt: 0 };
  /* a level fires once per session: ±1.5%, ±3%, ±4.5% … for the index; a reversal through zero to the other side fires again */
  const msgs = [], fire = (key, pct, step, line) => {
    const lv = Math.trunc(pct / step), prev = S.lv[key] || 0;
    if (lv && (Math.abs(lv) > Math.abs(prev) || Math.sign(lv) !== Math.sign(prev || lv))) { S.lv[key] = lv; msgs.push(line); }
  };
  const sg = v => (v > 0 ? "+" : "") + v.toFixed(2) + "%", arrow = v => (v > 0 ? "🔺" : "🔻");
  const wl = await pmStore(env, "wl"), codes = [...new Set([...(wl.hold || []), ...(wl.watch || [])])], on = k => (wl.opt || {})[k] !== false;
  if (ses.s === "day") {
    const idx = await twMis(["tse_t00.tw"]).catch(() => []), x = idx.find(r => r.c === "t00");
    let z = x && x.z, y = x && x.y;
    if (!(z > 0 && y > 0)) { const yq = await twYahoo(["^TWII"]).catch(() => []); if (yq[0]) { z = yq[0].z; y = yq[0].y; } }
    if (z > 0 && y > 0 && on("index")) { const p = (z / y - 1) * 100; fire("TAIEX", p, IDX_STEP, `${arrow(p)} <b>加權指數 ${sg(p)}</b>　${z.toFixed(2)}（${p > 0 ? "+" : ""}${(z - y).toFixed(0)} 點）`); }
    if (codes.length && on("stock")) {
      let q = await twMis(codes.map(c => "tse_" + c + ".tw")).catch(() => []);
      const have = new Set(q.filter(r => r.z > 0).map(r => r.c)), miss = codes.filter(c => !have.has(c));
      if (miss.length) q = q.filter(r => r.z > 0).concat(await twYahoo(miss).catch(() => []));
      q.forEach(r => {
        if (!(r.z > 0 && r.y > 0)) return;
        const p = (r.z / r.y - 1) * 100, tag = (wl.hold || []).includes(r.c) ? "持股" : "自選", nm = r.n || r.c;
        if (p >= 9.4) fire(r.c + ":lim", 1, 1, `🚀 <b>${hesc(nm)}（${r.c}）漲停</b> ${r.z}　[${tag}]`);
        else if (p <= -9.4) fire(r.c + ":lim", -1, 1, `🧊 <b>${hesc(nm)}（${r.c}）跌停</b> ${r.z}　[${tag}]`);
        fire(r.c, p, STK_STEP, `${arrow(p)} <b>${hesc(nm)}（${r.c}）${sg(p)}</b>　${r.z}　[${tag}]`);
      });
    }
  } else {
    const f = await twFut().catch(() => null);
    if (on("index") && f && f.src === "night" && f.z > 0 && f.y > 0) { const p = (f.z / f.y - 1) * 100; fire("TXN", p, IDX_STEP, `${arrow(p)} <b>台指期夜盤 ${sg(p)}</b>　${f.z}（${p > 0 ? "+" : ""}${(f.z - f.y).toFixed(0)} 點）`); }
  }
  /* news and the watched companies' material announcements, judged by the AI every 15 minutes */
  if (on("news") && now.getTime() - (S.newsAt || 0) >= 14 * 60000) {
    S.newsAt = now.getTime();
    const ev = await watchNews(env, codes, S).catch(() => []);
    ev.forEach(e => msgs.push(`${e.impact === "利多" ? "🟥" : e.impact === "利空" ? "🟩" : "⚠️"} <b>${hesc(e.title)}</b>\n${hesc(e.why)}${e.link ? `\n<a href="${hesc(e.link)}">來源</a>` : ""}`));
  }
  await pmStore(env, "state", { set: S });
  if (msgs.length) await tgSend(env, `<b>${ses.s === "day" ? "台股盤中" : "夜盤"}警示</b>\n\n` + msgs.join("\n\n") + "\n\n<i>自動監控，研究參考</i>");
}
export async function watchNews(env, codes, S) {
  const seen = new Set(S.seen || []), fresh = [], cut = Date.now() - 90 * 60000;
  const [a, b, c, d] = await Promise.all([
    twHeadlines("台股 OR 台指期 OR 台積電 OR 美股 OR 聯準會 when:1h", 12).catch(() => []),
    twHeadlines("關稅 OR 出口管制 OR 地緣政治 OR 輝達 OR 半導體 when:1h", 10).catch(() => []),
    twHeadlines("Fed OR Powell OR \"rate cut\" OR CPI OR \"jobs report\" OR Treasury yields OR \"stock market\" OR Nasdaq when:1h", 12, true).catch(() => []),
    twHeadlines("tariff OR \"export controls\" OR Nvidia OR TSMC OR semiconductor OR Taiwan OR China OR Trump when:1h", 12, true).catch(() => []),
  ]);
  [...a, ...b, ...c, ...d].forEach(x => { if (x.at >= cut && !seen.has(x.t)) { seen.add(x.t); fresh.push({ k: "news", t: x.t, src: x.src, u: x.u }); } });
  if (codes.length) {
    const all = await twCached("ann", 600000, async () => { const r = await twFetch("https://openapi.twse.com.tw/v1/opendata/t187ap04_L", { headers: { "User-Agent": TW_UA, Accept: "application/json" } }); return r.ok ? await r.json() : []; }).catch(() => []);
    const pick = (o, sub) => { const k = Object.keys(o).find(x => x.includes(sub)); return k ? o[k] : ""; };
    (Array.isArray(all) ? all : []).filter(x => codes.includes(String(pick(x, "公司代號")).trim())).forEach(x => {
      const t = String(pick(x, "公司代號")).trim() + " " + twClip(pick(x, "公司名稱"), 12) + "：" + twClip(pick(x, "主旨"), 160);
      if (!seen.has(t)) { seen.add(t); fresh.push({ k: "ann", t, body: twClip(pick(x, "說明"), 300) }); }
    });
  }
  S.seen = [...seen].slice(-400);
  if (!fresh.length || !env.GEMINI_KEY) return [];
  const prompt = [
    "You watch the Taiwan stock market for one private investor. Below are NEW headlines and company announcements from the last hour.",
    "The investor holds or watches these TWSE codes: " + (codes.join(", ") || "(none)") + ".",
    "The investor finds frequent alerts annoying, so the bar is very high. Pick ONLY a truly major, unexpected event that is likely to move the whole Taiwan market by more than about 1%, or one of those stocks by more than about 3%, today: a surprise Fed or central-bank decision, new tariffs or export controls actually announced, a war, attack or major disaster, a trading halt, a sudden executive departure, a capital reduction or a big earnings shock in a company announcement.",
    "Do NOT pick: ordinary good or bad news, expansion plans, subsidies or tax incentives, factory progress, product launches, analyst views, market commentary or summaries of how the market moved, foreign-investor buying or selling, rumours, follow-ups to news already known, or anything already priced in. When in doubt, leave it out. Almost always the answer is none; at most one item.",
    "Some headlines are from US English news (Fed, US data, US policy, US tech companies): a major US event that will clearly move Taiwan stocks counts just as much as Taiwan news, under the same high bar.",
    "Write in Traditional Chinese as used in Taiwan (translate English titles). Use only what the titles say; do not invent details.",
    'Return ONE JSON object: {"alerts":[{"n":item number,"title":"short title","impact":"利多|利空|不確定","why":"one sentence: what it means for Taiwan stocks or which holding"}]} — an empty list when nothing matters.',
    "",
    fresh.map((x, i) => `${i + 1}. [${x.k === "ann" ? "公司重大訊息" : "新聞"}] ${x.t}${x.src ? "（" + x.src + "）" : ""}${x.body ? " — " + x.body : ""}`).join("\n"),
  ].join("\n");
  const g = await geminiJson(env, prompt, 0.2, 0);
  if (g.error) return [];
  let r = null; try { r = JSON.parse(g.text); } catch (e) { const m = g.text.match(/\{[\s\S]*\}/); try { r = m ? JSON.parse(m[0]) : null; } catch (e2) { r = null; } }
  return (r && Array.isArray(r.alerts) ? r.alerts : []).slice(0, 1).map(x => ({ title: twClip(x.title, 80), impact: x.impact, why: twClip(x.why, 200), link: (fresh[(+x.n || 0) - 1] || {}).u || "" }));
}

/* ---------- opening and closing bell: one Telegram message at 09:01 and one at 13:31 (Taipei, Monday to Friday) ---------- */
export async function bellNotice(env, now) {
  const t = new Date(now.getTime() + 8 * 3600e3), wd = t.getUTCDay(), m = t.getUTCHours() * 60 + t.getUTCMinutes();
  if (wd < 1 || wd > 5) return;
  const kind = m >= 541 && m <= 545 ? "open" : m >= 811 && m <= 816 ? "close" : null; if (!kind || !(await tgOn(env, "bell"))) return;
  const day = t.toISOString().slice(0, 10);
  const idx = await twMis(["tse_t00.tw"]).catch(() => []), ix = idx.find(x => x.c === "t00");
  let z = ix && ix.z, y = ix && ix.y, o = ix && ix.o, h = ix && ix.h, l = ix && ix.l;
  if (!(z > 0 && y > 0)) { const q = (await twYahooTW(["^TWII"]).catch(() => []))[0] || (await twYahoo(["^TWII"]).catch(() => []))[0]; if (q) { z = q.z; y = q.y; o = q.o; h = q.h; l = q.l; } }
  if (!(z > 0 && y > 0)) return;                                /* market closed today (holiday): no message */
  if (ix && ix.d && ix.d !== day.replace(/-/g, "")) return;   /* the quote is from an earlier day: no trading today */
  if (!(await pmStore(env, "bell", { kind, day })).first) return;   /* once per day (the Durable Object decides atomically) */
  const sg = v => (v > 0 ? "+" : "") + v.toFixed(2) + "%", pts = v => (v > 0 ? "+" : "") + Math.round(v), arw = v => (v > 0 ? "🔺" : v < 0 ? "🔻" : "▪️");
  const lines = [];
  if (kind === "open") {
    const op = o > 0 ? o : z, gap = op - y;
    lines.push(`<b>🔔 開盤 ${day.slice(5).replace("-", "/")}</b>`, `${arw(gap)} 加權 ${op.toFixed(0)}（${pts(gap)} 點，${sg(gap / y * 100)}）`);
    const pm = (await pmStore(env, "get")).note;
    if (pm && pm.day === day && pm.analysis) { const c = pm.analysis.call || "", hit = /高/.test(c) ? gap > 20 : /低/.test(c) ? gap < -20 : Math.abs(gap) <= 60; lines.push(`盤前預測：${c}（${pm.analysis.gap || ""}）${hit ? "✅" : "❌"}`); }
  } else {
    lines.push(`<b>🔔 收盤 ${day.slice(5).replace("-", "/")}</b>`, `${arw(z - y)} 加權 ${z.toFixed(2)}（${pts(z - y)} 點，${sg((z / y - 1) * 100)}）`);
    if (h > 0 && l > 0) lines.push(`高 ${h.toFixed(0)}・低 ${l.toFixed(0)}`);
  }
  const f = await twFut().catch(() => null);
  if (f && f.z > 0 && f.y > 0) lines.push(`${arw(f.z - f.y)} 台指期 ${f.z}（${pts(f.z - f.y)}）`);
  const wl = await pmStore(env, "wl").catch(() => ({})), codes = [...new Set([...(wl.hold || []), ...(wl.watch || [])])].slice(0, 40);
  if (codes.length) {
    let q = await twMis(codes.flatMap(c => ["tse_" + c + ".tw", "otc_" + c + ".tw"])).catch(() => []);
    const have = new Set(q.filter(r => r.z > 0).map(r => r.c)), miss = codes.filter(c => !have.has(c));
    if (miss.length) q = q.filter(r => r.z > 0).concat(await twYahooTW(miss).catch(() => []));
    const rows = q.filter(r => r.z > 0 && r.y > 0).map(r => ({ ...r, p: ((kind === "open" && r.o > 0 ? r.o : r.z) / r.y - 1) * 100, px: kind === "open" && r.o > 0 ? r.o : r.z })).sort((a, b) => b.p - a.p);
    if (rows.length) {
      lines.push("", kind === "open" ? "<b>你的股票開盤</b>" : "<b>你的股票收盤</b>");
      rows.forEach(r => lines.push(`${r.p >= 9.4 ? "🚀" : r.p <= -9.4 ? "🧊" : arw(r.p)} ${hesc(r.n || r.c)} ${r.px}（${sg(r.p)}）${(wl.hold || []).includes(r.c) ? "　持股" : ""}`));
    }
  }
  await tgSend(env, lines.join("\n"));
}
export function closePrompt(day, D, news) {
  return [
"You are the closing desk of a Taiwan equity research team, writing the after-close review of " + day + " (" + WD[new Date(day + "T00:00:00Z").getUTCDay()] + ") for one private investor.",
"Write everything in Traditional Chinese as used in Taiwan. Keep it SHORT and plain for a phone: sentences under about 35 Chinese characters, headline under 25, each list at most 3 items.",
"Use ONLY the numbers in DATA and the headlines given; never invent a figure or an event. Name dates instead of saying 今日 / 明日.",
"",
"Cover: how the TAIEX closed and why; which sectors led and lagged (DATA.sectors are TWSE sector indices, % change); the day's biggest movers among liquid stocks; institutional flows (DATA.institutions, NT$ 100 million; if empty TWSE has not published yet, say so); turnover and breadth.",
"If DATA.premarket exists it is this morning's call: compare its open call and gap with DATA.open (the actual open against the previous close) and its close call with the actual close, and say plainly whether each was right (✅ or ❌) and what it missed. If DATA.premarket is null, check is null.",
"For each stock in DATA.mine (the user's holdings and watchlist) give one short line: what it did and the one thing to watch next. Mention any of them flagged in DATA.mine[].flag (注意股 = attention list, 處置股 = disposition list with trading restrictions).",
"End with what to watch for the next session: at most 3 items, only from DATA and the headlines. Be conservative; this is a review, not a forecast.",
"",
"Return ONE JSON object and nothing else, in exactly this shape:",
'{"call":"收紅|平盤|收黑","headline":"one sentence for a phone notification","market":"two or three sentences on the index, turnover and breadth","check":{"open":"盤前預測 vs 實際開盤 ✅/❌","close":"盤前預測 vs 實際收盤 ✅/❌","note":"what the morning call missed"},',
'"lead":["sector or stock that led, with the reason"],"lag":["..."],"flows":"one or two sentences on the institutions","mine":[{"code":"2330","name":"台積電","pct":"+1.2%","note":"one short sentence"}],"next":["what to watch next session"]}',
"",
"DATA: " + JSON.stringify(D),
"",
"HEADLINES (today):",
(news.map(x => "- " + x.t + (x.src ? "（" + x.src + "）" : "")).join("\n") || "(none)"),
  ].join("\n");
}

/* 復盤: each trading day, the pre-market call checked against what really happened (written when the close summary is made, kept for 120 days) */
export async function reviewRows(env) {
  const v = await pmStore(env, "kv", { k: "review" }).then(r => r.v).catch(() => null);
  return Array.isArray(v) ? v : [];
}
export async function reviewSave(env, day, pre, open, X) {
  if (!pre || !X || !(X.pct != null)) return;
  const openHit = (c, g) => (/高/.test(c) ? g > 20 : /低/.test(c) ? g < -20 : Math.abs(g) <= 60);
  const closeHit = (c, p) => (/紅/.test(c) ? p > 0.2 : /黑/.test(c) ? p < -0.2 : Math.abs(p) <= 0.2);
  const gap = open && Number.isFinite(open.gapPoints) ? open.gapPoints : null, pc = pre.close && pre.close.call ? pre.close.call : null;
  const e = { day, conf: pre.confidence || "", open: pre.call ? { call: pre.call, gap: pre.gap || "", actual: gap, hit: gap == null ? null : openHit(pre.call, gap) } : null,
    close: pc ? { call: pc, range: pre.close.range || "", actual: Math.round(X.pct * 100) / 100, z: X.z, hit: closeHit(pc, X.pct) } : null };
  const rows = (await reviewRows(env)).filter(x => x && x.day !== day); rows.push(e);
  await pmStore(env, "kv", { k: "review", set: rows.slice(-120) });
}

/* ---------- weekly review (Saturday 09:00 Taipei): the week's five trading days, written by the AI ---------- */
export function weekPrompt(from, to, D, news) {
  const day = t => (t ? new Date(t).toISOString().slice(0, 10) : "");
  return [
    "You are the market strategist of a Taiwan equity research desk writing the WEEKLY REVIEW for one private investor. Write in Traditional Chinese as used in Taiwan. Be concrete and short; no filler.",
    "Taiwan colours: red = up, green = down. Use ONLY the numbers in DATA; never invent a level, ratio or event. Headlines are only titles: do not claim details a title does not state.",
    "DATA.days are the trading days of the week (TAIEX close, change %, turnover in NT$ 100 million, institutional net buying in NT$ 100 million per group). DATA.week has the week's change and range; DATA.sectors the sector moves compounded over the week.",
    "Nobody can know the future: for next week say what to watch and what would change the view; never promise a result. Be conservative.",
    'Return ONE JSON object and nothing else: {"call":"本週收紅|本週收黑|本週盤整","headline":"one sentence under 30 Chinese characters","market":"2 or 3 sentences: how the week went and why","lead":["strong sectors with the reason, max 3"],"lag":["weak sectors with the reason, max 3"],"flows":"one or two sentences on foreign / trust / dealer flows over the week","risks":["max 3"],"next":["what to watch next week, max 4 items, include dates only if a headline states them"]}',
    "",
    "WEEK: " + from + " to " + to,
    "DATA: " + JSON.stringify(D),
    "",
    "HEADLINES (last 7 days, newest first):",
    news.length ? news.map(x => "- " + day(x.at) + " " + x.t + (x.src ? "（" + x.src + "）" : "")).join("\n") : "(none found)",
  ].join("\n");
}
export async function weekNote(env, notify, manual) {
  if (!env.GEMINI_KEY) return { error: "no GEMINI_KEY" };
  const days = []; let d = new Date(Date.now() + 8 * 3600e3);
  while (days.length < 5) { if (d.getUTCDay() % 6) days.unshift(d.toISOString().slice(0, 10)); d = new Date(d.getTime() - 864e5); }
  const reps = await Promise.all(days.map(async day => { const ds = day.replace(/-/g, ""); const [rep, inst] = await Promise.all([twDayReport(ds).catch(() => null), twInstDay(ds).catch(() => null)]); return rep && rep.taiex ? { day, rep, inst } : null; }));
  const ok = reps.filter(Boolean);
  if (ok.length < 2) return { error: "這個星期的收盤資料不足，或這週大多沒有交易" };
  const first = ok[0].rep.taiex, last = ok[ok.length - 1].rep.taiex, prev = first.z / (1 + (first.pct || 0) / 100);
  const weekPct = Math.round((last.z / prev - 1) * 10000) / 100, closes = ok.map(x => x.rep.taiex.z);
  const sec = new Map(); ok.forEach(x => x.rep.sectors.forEach(r => sec.set(r.name, (sec.get(r.name) || 1) * (1 + r.pct / 100))));
  const secs = [...sec].map(([name, m]) => ({ name, pct: Math.round((m - 1) * 10000) / 100 })).sort((a, b) => b.pct - a.pct);
  const D = {
    week: { fromClose: Math.round(prev * 100) / 100, toClose: last.z, changePct: weekPct, high: Math.max(...closes), low: Math.min(...closes) },
    days: ok.map(x => ({ day: x.day.slice(5), close: x.rep.taiex.z, pct: x.rep.taiex.pct, turnoverYi: x.rep.turnoverYi, inst: x.inst || [] })),
    sectors: { lead: secs.slice(0, 5), lag: secs.slice(-5).reverse() },
  };
  const [n1, n2] = await Promise.all([twHeadlines("台股 OR 加權指數 OR 外資 when:7d", 10).catch(() => []), twHeadlines("美股 OR 聯準會 OR 關稅 OR 半導體 when:7d", 8).catch(() => [])]);
  const seen = new Set(), news = [...n1, ...n2].filter(x => !seen.has(x.t) && seen.add(x.t)).sort((a, b) => b.at - a.at).slice(0, 14);
  const prompt = weekPrompt(ok[0].day, ok[ok.length - 1].day, D, news);
  let g = await geminiJson(env, prompt, 0.3, 0);
  for (let k = 1; g.error && [500, 502, 503, 504].includes(g.error.status) && k <= (manual ? 2 : 4); k++) {
    await new Promise(r => setTimeout(r, (manual ? 4000 : 20000) * k));
    g = await geminiJson(env, prompt, 0.3, k);
  }
  if (g.error) return { error: g.error.daily ? "今天的額度用完了" : aiWhy(g.error.status), daily: !!g.error.daily };
  let a = null; try { a = JSON.parse(g.text); } catch (e) { const t2 = String(g.text || ""), i = t2.indexOf("{"), j = t2.lastIndexOf("}"); try { a = JSON.parse(t2.slice(i, j + 1).replace(/,\s*([\]}])/g, "$1")); } catch (e2) { a = null; } }
  if (!a || !a.headline) return { error: "分析結果不完整，再按一次" };
  const note = { at: Date.now(), day: ok[ok.length - 1].day, from: ok[0].day, analysis: a, data: { week: D.week, days: D.days, sectors: D.sectors }, news: news.slice(0, 10).map(x => ({ t: x.t, src: x.src, u: x.u, at: x.at })) };
  const saved = await pmStore(env, "wput", { note }).catch(e => ({ error: String(e && e.message || e) }));
  if (!saved || !saved.ok) note.saveError = (saved && saved.error) || "not saved";
  if (notify) {
    const L = x => (Array.isArray(x) ? x.slice(0, 3) : []), sg = v => (v > 0 ? "+" : "") + Number(v).toFixed(2) + "%";
    const text = [
      `<b>🗓 ${note.from.slice(5).replace("-", "/")}–${note.day.slice(5).replace("-", "/")} 週回顧：${hesc(a.call || "")}</b>`,
      `${weekPct > 0 ? "🔺" : weekPct < 0 ? "🔻" : "▪️"} 加權 ${last.z.toFixed(2)}（本週 ${sg(weekPct)}）`,
      hesc(a.headline), "", hesc(a.market || ""),
      ...(L(a.lead).length ? ["", "<b>強勢</b> " + L(a.lead).map(hesc).join("；")] : []),
      ...(L(a.lag).length ? ["<b>弱勢</b> " + L(a.lag).map(hesc).join("；")] : []),
      ...(a.flows ? ["<b>法人</b> " + hesc(a.flows)] : []),
      ...(L(a.next).length ? ["", "<b>下週要盯</b> " + L(a.next).map(hesc).join("；")] : []),
      `<a href="https://si70531.github.io/TWstock/">完整內容</a>｜研究參考，不保證漲跌`,
    ].join("\n");
    note.sent = (await tgOn(env, "notes")) ? await tgSend(env, text) : "off";
  }
  return note;
}

export async function closeRetry(env, now) {
  const t = new Date(now.getTime() + 8 * 3600e3), wd = t.getUTCDay(), m = t.getUTCHours() * 60 + t.getUTCMinutes();
  if (wd < 1 || wd > 5 || m < 15 * 60 + 45 || m > 18 * 60 || (m - (15 * 60 + 45)) % 15) return;
  const day = t.toISOString().slice(0, 10), have = (await pmStore(env, "cget").catch(() => ({}))).note;
  if (have && have.day === day) return;
  const r = await closeNote(env, true, false).catch(e => ({ error: String(e && e.message || e) }));
  if (r && r.error && m === 18 * 60 && !/沒有交易/.test(r.error)) await tgSend(env, "<b>收盤摘要沒有產生</b>\n" + hesc(r.error) + "\n\n可以到網站的盤前分析頁按「產生」再試。");
}
export async function closeNote(env, notify, manual) {
  if (!env.GEMINI_KEY) return { error: "no GEMINI_KEY" };
  const t = new Date(Date.now() + 8 * 3600e3), day = t.toISOString().slice(0, 10), ds = day.replace(/-/g, "");
  const rep = await twDayReport(ds).catch(() => null);
  if (!rep || !rep.taiex) return { error: "證交所今天的收盤資料還沒出來（大約 14:30 之後），或今天沒有交易" };
  const [inst, flags, wl, pm, n1, n2, idxMis] = await Promise.all([
    twInstDay(ds), twFlags(ds), pmStore(env, "wl").catch(() => ({})), pmStore(env, "get").catch(() => ({})),
    twHeadlines("台股 OR 加權指數 OR 外資 when:1d", 10).catch(() => []), twHeadlines("台積電 OR 半導體 OR 美股 OR 關稅 when:1d", 8).catch(() => []),
    twMis(["tse_t00.tw"]).catch(() => []),
  ]);
  const by = new Map(rep.stocks.map(x => [x.c, x])), liq = rep.stocks.filter(x => x.lots >= 1000);
  const hold = wl.hold || [], codes = [...new Set([...hold, ...(wl.watch || [])])].slice(0, 30);
  let mine = codes.map(c => by.get(c)).filter(Boolean);
  const miss = codes.filter(c => !by.has(c));
  if (miss.length) mine = mine.concat((await twYahooTW(miss).catch(() => [])).filter(q => q.z > 0 && q.y > 0).map(q => ({ c: q.c, n: q.n || q.c, z: q.z, pct: Math.round((q.z / q.y - 1) * 10000) / 100 })));
  const T0 = idxMis.find(x => x.c === "t00"), pre = pm.note && pm.note.day === day && pm.note.analysis ? pm.note.analysis : null;
  const flagOf = c => ((flags.punish || []).some(p => p.c === c) ? "處置股" : (flags.notice || []).some(p => p.c === c) ? "注意股" : null);
  const D = {
    taiex: rep.taiex, turnoverYi: rep.turnoverYi, breadth: rep.breadth,
    open: T0 && T0.o > 0 && T0.y > 0 && T0.d === ds ? { open: T0.o, previousClose: T0.y, gapPoints: Math.round(T0.o - T0.y) } : null,
    sectors: { lead: rep.sectors.slice(0, 6), lag: rep.sectors.slice(-6).reverse() },
    gainers: liq.slice().sort((a, b) => b.pct - a.pct).slice(0, 8).map(x => ({ code: x.c, name: x.n, pct: x.pct })),
    losers: liq.slice().sort((a, b) => a.pct - b.pct).slice(0, 8).map(x => ({ code: x.c, name: x.n, pct: x.pct })),
    turnoverTop: rep.stocks.slice().sort((a, b) => b.val - a.val).slice(0, 8).map(x => ({ code: x.c, name: x.n, pct: x.pct, valueYi: Math.round(x.val / 1e7) / 10 })),
    institutions: inst || [],
    premarket: pre ? { open: pre.call, gap: pre.gap, close: pre.close && { call: pre.close.call, range: pre.close.range } } : null,
    mine: mine.map(x => ({ code: x.c, name: x.n, close: x.z, pct: x.pct, held: hold.includes(x.c), flag: flagOf(x.c) })),
  };
  const seen = new Set(), news = [...n1, ...n2].filter(x => !seen.has(x.t) && seen.add(x.t)).sort((a, b) => b.at - a.at).slice(0, 14);
  const prompt = closePrompt(day, D, news);
  let g = await geminiJson(env, prompt, 0.3, 0);
  for (let k = 1; g.error && [500, 502, 503, 504].includes(g.error.status) && k <= (manual ? 2 : 4); k++) {
    await new Promise(r => setTimeout(r, (manual ? 4000 : 20000) * k));
    g = await geminiJson(env, prompt, 0.3, k);
  }
  if (g.error) return { error: g.error.daily ? "今天的額度用完了" : aiWhy(g.error.status), daily: !!g.error.daily };
  let a = null; try { a = JSON.parse(g.text); } catch (e) { const t2 = String(g.text || ""), i = t2.indexOf("{"), j = t2.lastIndexOf("}"); try { a = JSON.parse(t2.slice(i, j + 1).replace(/,\s*([\]}])/g, "$1")); } catch (e2) { a = null; } }
  if (!a || !a.headline) return { error: "分析結果不完整，再按一次" };
  const note = { at: Date.now(), day, analysis: a, data: { taiex: rep.taiex, turnoverYi: rep.turnoverYi, breadth: rep.breadth, sectors: rep.sectors, institutions: inst || [], mine: D.mine }, news: news.slice(0, 10).map(x => ({ t: x.t, src: x.src, u: x.u, at: x.at })) };
  const saved = await pmStore(env, "cput", { note }).catch(e => ({ error: String(e && e.message || e) }));
  if (!saved || !saved.ok) note.saveError = (saved && saved.error) || "not saved";
  await reviewSave(env, day, pre, D.open, rep.taiex).catch(() => {});
  /* the owner's stocks newly on the attention or disposition list: each one is told once (forgotten 10 days after it was last seen) */
  const was = await pmStore(env, "flags").catch(() => ({})), keep = {}, newly = [], cut = new Date(Date.now() + 8 * 3600e3 - 10 * 864e5).toISOString().slice(0, 10);
  Object.entries(was || {}).forEach(([k, v]) => { if (typeof v === "string" && v >= cut) keep[k] = v; });
  codes.forEach(c => { const f = flagOf(c); if (!f) return; const k = c + ":" + f; if (!keep[k]) newly.push({ c, f }); keep[k] = day; });
  await pmStore(env, "flags", { set: keep }).catch(() => {});
  if (notify) {
    const sg = v => (v > 0 ? "+" : "") + Number(v).toFixed(2) + "%", arw = v => (v > 0 ? "🔺" : v < 0 ? "🔻" : "▪️"), L = x => (Array.isArray(x) ? x.slice(0, 3) : []);
    const nm = c => (by.get(c) || mine.find(x => x.c === c) || {}).n || c, X = rep.taiex;
    const text = [
      `<b>📋 ${day.slice(5).replace("-", "/")} 收盤摘要：${hesc(a.call || "")}</b>`,
      `${arw(X.pct)} 加權 ${X.z.toFixed(2)}（${X.pts != null ? (X.pct < 0 ? "-" : "+") + Math.abs(X.pts).toFixed(0) + " 點，" : ""}${sg(X.pct)}）${rep.turnoverYi ? "・成交 " + rep.turnoverYi.toLocaleString() + " 億" : ""}`,
      hesc(a.headline), "", hesc(a.market || ""),
      ...(a.check && (a.check.open || a.check.close) ? ["", "<b>盤前預測對帳</b>", ...[a.check.open, a.check.close, a.check.note].filter(Boolean).map(hesc)] : []),
      ...(L(a.lead).length ? ["", "<b>領漲</b> " + L(a.lead).map(hesc).join("；")] : []),
      ...(L(a.lag).length ? ["<b>落後</b> " + L(a.lag).map(hesc).join("；")] : []),
      ...(a.flows ? ["<b>法人</b> " + hesc(a.flows)] : []),
      ...(Array.isArray(a.mine) && a.mine.length ? ["", "<b>你的股票</b>", ...a.mine.slice(0, 20).map(x => `${hesc(x.name || x.code)} ${hesc(x.pct || "")}　${hesc(x.note || "")}`)] : []),
      ...(newly.length ? ["", "<b>⚠️ 新列入</b>", ...newly.map(x => `${hesc(nm(x.c))}（${x.c}）${x.f}${x.f === "處置股" ? "：交易受限制（分盤撮合、可能要預收款券）" : "：成交量或漲跌異常"}`)] : []),
      ...(L(a.next).length ? ["", "<b>下個交易日盯</b> " + L(a.next).map(hesc).join("；")] : []),
      `<a href="https://si70531.github.io/TWstock/">完整內容</a>｜研究參考，不保證漲跌`,
    ].join("\n");
    note.sent = (await tgOn(env, "notes")) ? await tgSend(env, text) : "off";
  }
  return note;
}