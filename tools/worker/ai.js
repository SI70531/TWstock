import { AI_DAY, AI_HOUR, MODELS, twCached } from "./core.js";
import { twAnnouncements, twClip, twHeadlines } from "./data.js";
import { guard } from "./do.js";
import { nextDays } from "./notes.js";


export function twPrompt(code, name, facts, news, ann, world) {
  const list = (a, f) => (a.length ? a.map(f).join("\n") : "(none found)");
  const day = t => (t ? new Date(t).toISOString().slice(0, 10) : "");
  return [
"You are a team of five analysts at a Taiwan equity research desk, writing for one private investor about a single TWSE-listed stock: " + name + " (" + code + ").",
"Write everything in Traditional Chinese as used in Taiwan. Be specific and concrete; no filler, no generic textbook lines.",
"",
"The five analysts, each with their own view:",
"1. 技術面分析師: trend, moving averages, KD / RSI / MACD, Bollinger position, volume, support and resistance.",
"2. 基本面分析師: valuation (P/E, yield, P/B), monthly revenue trend, what the business depends on.",
"3. 籌碼面分析師: foreign investors, investment trusts and dealers; what their recent buying or selling suggests.",
"4. 時事與國際分析師: the news headlines, the company's own announcements (board decisions, earnings calls, dividends, capital changes), and world events that can move this stock: US markets and Fed policy, tariffs and export controls, exchange rates, geopolitics, the industry cycle, big customers and competitors.",
"5. 風險控管: what could go wrong, position sizing and where the idea is proven wrong.",
"",
"Rules:",
"- Use ONLY the numbers in DATA. Never invent a price, ratio, date or event. If something needed is missing, say it is missing.",
"- When you rely on a headline or an announcement, name it briefly so the reader can find it. Headlines are only titles: do not claim details that a title does not state.",
"- Every price level you mention must come from DATA (moving averages, recent highs and lows, Bollinger bands, today's range) or be a simple round number near them, and you must say which one it is.",
"- Nobody can know the future price. Give the direction you think is more likely and why, with rough chances that add up to about 100%, and say plainly what would prove you wrong. Never promise a result.",
"- 'entry' is about timing: the concrete conditions under which buying makes sense (for example a close above a named level with volume above the 20-day average, or a pull-back to a named support that holds), a price zone, a stop level, and when NOT to buy. If the better choice now is to wait, say so.",
"- Be CONSERVATIVE (the user asked for this): when unsure, lean toward the smaller move, the nearer level and the lower confidence; scenario chances never above about 65%; targets are the nearest resistance, not the farthest; when signals disagree, the answer is 中性 / 等待訊號.",
"- order.days: a conservative day-by-day plan for each of the next 5 trading days listed in DAYS: the likely view, a price range (use DATA.research.timeMachine and the support / resistance levels; one day is narrower than the 20-day spread) and what to do that day. For 分批買進 say on which day and at which price or condition each batch is bought, and when to stop adding or cut.",
"- Each analyst: stance is exactly one of 偏多, 中性, 偏空; 2 or 3 points, each ONE short sentence (under about 35 Chinese characters).",
"- Keep every other field short and plain too: headline under 25 Chinese characters, short_term / mid_term / why one sentence each, at most 3 conditions, risks and watch items.",
"- 'order' is the bottom line, read FIRST: one concrete order suggestion. action is exactly one of 買進, 分批買進, 觀望, 續抱, 減碼, 賣出. If DATA.research.myPosition exists the user already holds the stock, so choose among 續抱, 加碼 (write it as 分批買進), 減碼, 賣出; otherwise among 買進, 分批買進, 觀望. Give the order type and price (for example 限價 or 收盤站上某價位後), how to split it, the stop, one or two targets, and the risk-reward ratio, all from DATA levels. If the answer is to wait, action is 觀望 and say exactly what would change that.",
"",
"Return ONE JSON object and nothing else, in exactly this shape:",
'{"team":[{"role":"技術面分析師","stance":"偏多","points":["..."]},{"role":"基本面分析師","stance":"中性","points":["..."]},{"role":"籌碼面分析師","stance":"中性","points":["..."]},{"role":"時事與國際分析師","stance":"中性","points":["..."]},{"role":"風險控管","stance":"中性","points":["..."]}],',
'"order":{"action":"買進|分批買進|觀望|續抱|減碼|賣出","how":"order type, price and timing","split":"how to split the order","stop":"stop price and which level","targets":["first target and which level"],"rr":"risk-reward, e.g. 1 : 2.1","why":"one or two sentences",',
'"days":[{"d":"11/25","view":"偏多|盤整|偏空","range":"price range","do":"what to do that day"}]},',
'"summary":{"stance":"偏多|中性|偏空","confidence":"低|中|高","headline":"one sentence","short_term":"the next 1 to 2 weeks","mid_term":"the next 1 to 3 months",',
'"scenarios":[{"name":"樂觀","chance":"約 30%","trigger":"what has to happen","range":"price area"},{"name":"基本","chance":"約 50%","trigger":"...","range":"..."},{"name":"悲觀","chance":"約 20%","trigger":"...","range":"..."}],',
'"entry":{"now":"適合進場|等待訊號|不建議進場","conditions":["..."],"zone":"price zone","stop":"stop level and why","avoid":"when not to buy"},',
'"risks":["..."],"watch":["upcoming events or dates to watch"]}}',
"",
"DATA.research (when present) holds the page's own research tools for this stock: technical scenarios with support and resistance, a 10,000-run bootstrap 'time machine' (how often the target or the stop was hit first), backtests of four simple strategies with Taiwan costs and an out-of-sample split, and the user's own position, trades, events and valuation. Every analyst must use the parts that concern them (the 技術面 analyst the scenarios and time machine, 風險控管 the time machine, backtests and the user's position) and say when a backtest has too few trades to mean anything.",
"",
"DAYS (the next 5 trading days): " + JSON.stringify(nextDays(new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), 5)),
"",
"DATA (computed by the page from TWSE figures; prices in NT$, volume in lots of 1,000 shares):",
facts,
"",
"COMPANY HEADLINES (last 14 days, newest first):",
list(news, x => "- " + day(x.at) + " " + x.t + (x.src ? "（" + x.src + "）" : "")),
"",
"COMPANY ANNOUNCEMENTS (material information filed with the exchange):",
list(ann, x => "- " + x.d + " " + x.t + (x.body ? " — " + x.body : "")),
"",
"MARKET AND WORLD HEADLINES (last 3 days):",
list(world, x => "- " + day(x.at) + " " + x.t + (x.src ? "（" + x.src + "）" : "")),
  ].join("\n");
}
export async function twAnalyze(env, who, ip, bodyText, json, fail) {
  if (!env.GEMINI_KEY) return fail(500, "INTERNAL", "The Worker has no GEMINI_KEY secret yet");
  let b; try { b = JSON.parse(bodyText); } catch (e) { return fail(400, "BAD_JSON", "Body is not JSON"); }
  const code = String((b && b.code) || "").trim(), name = twClip(b && b.name, 20) || code;
  if (!/^[0-9A-Z]{4,6}$/.test(code)) return fail(400, "BAD_CODE", "Bad stock code");
  let facts; try { facts = JSON.stringify(b.facts || {}); } catch (e) { facts = "{}"; }
  if (facts.length > 16000) return fail(413, "TOO_BIG", "Too much data");
  if (!b.fresh) {   /* today's analysis of this stock on this device, unless 重新分析 asked for a new one */
    const c = await guard(env, "dev:" + who, "aiget", { code }).catch(() => ({}));
    if (c && c.hit) return json({ ...c.hit, cached: true });
  }
  const q = await guard(env, "ip:" + ip, "ai", { hr: AI_HOUR, day: AI_DAY });
  if (q.blocked) return fail(429, "RESOURCE_EXHAUSTED", "Limit reached for this connection; try again later", { "Retry-After": String(q.aiWait || 60) });
  const [news, ann, world] = await Promise.all([
    twHeadlines(name + " " + code + " when:14d", 12).catch(() => []),
    twAnnouncements(code).catch(() => []),
    twCached("world", 600000, () => twHeadlines("台股 OR 美股 OR 聯準會 OR 關稅 OR 匯率 when:3d", 10)).catch(() => []),
  ]);
  const g = await geminiJson(env, twPrompt(code, name, facts, news, ann, world), 0.4, 0);
  if (g.error) return fail(g.error.status === 429 ? 429 : 502, g.error.daily ? "AI_DAILY" : "AI_FAILED", g.error.daily ? "今天的額度用完了" : aiWhy(g.error.status), g.error.status === 429 && !g.error.daily ? { "Retry-After": "60" } : undefined);
  let a = null; try { a = JSON.parse(g.text); } catch (e) { const m = g.text.match(/\{[\s\S]*\}/); try { a = m ? JSON.parse(m[0]) : null; } catch (e2) { a = null; } }
  if (!a || !Array.isArray(a.team) || !a.summary) return fail(502, "AI_FAILED", "分析結果不完整，再按一次");
  const out = { at: Date.now(), analysis: a, news: news.map(x => ({ t: x.t, src: x.src, u: x.u, at: x.at })), ann: ann.map(x => ({ d: x.d, t: x.t })), world: world.map(x => ({ t: x.t, src: x.src, u: x.u, at: x.at })) };
  await guard(env, "dev:" + who, "aiput", { code, data: out }).catch(() => {});
  return json(out);
}

/* what went wrong with the AI, in plain words for the page */
export function aiWhy(st) {
  if (st === 429) return "這一分鐘太忙，一分鐘後再按一次";   /* the daily cap has its own message (AI_DAILY) */
  if ([500, 502, 503, 504].includes(st)) return "Google 的服務現在太忙，過幾分鐘再按一次";
  if (st === 400 || st === 401 || st === 403) return "金鑰設定有問題，請檢查 Cloudflare 上的 GEMINI_KEY";
  return "暫時沒有回應，過幾分鐘再試";
}
export function callGemini(env, target, body) {
  return fetch(target, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY }, body });
}

/* one Gemini call that moves on to the next model when one is overloaded, over quota or retired */
export async function geminiJson(env, prompt, temperature, attempt) {
  const body = JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature, responseMimeType: "application/json" } });
  let last = { status: 502 }, n429 = 0, nDay = 0;   /* nDay: 429s that name a per-day quota (the free tier's daily cap) */
  for (let k = 0; k < MODELS.length; k++) {
    const model = MODELS[(attempt + k) % MODELS.length];
    const target = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
    let r;
    try {
      r = env.RELAY ? await env.RELAY.get(env.RELAY.idFromName("gemini-relay-us"), { locationHint: "enam" }).fetch("https://relay/" + encodeURIComponent(target), { method: "POST", body })
                    : await callGemini(env, target, body);
    } catch (e) { last = { status: 502 }; continue; }
    if (r.status === 429) { n429++; if (/PerDay/i.test(await r.text().catch(() => ""))) nDay++; }
    if (!r.ok) { if (r.status !== 404 || last.status === 502) last = { status: r.status }; if ([404, 429, 500, 502, 503, 504].includes(r.status)) continue; return { error: last }; }   /* a retired model (404) must not hide the 429 / 503 the others gave */
    const j = await r.json().catch(() => null), c = j && j.candidates && j.candidates[0];
    const text = c && c.content && Array.isArray(c.content.parts) ? c.content.parts.filter(p => !p.thought).map(p => p.text || "").join("") : "";
    if (text.trim()) return { text };
    last = { status: 502 };
  }
  if (n429 && nDay === n429) last = { status: 429, daily: true };   /* every model that answered 429 is out for the day */
  return { error: last };
}
/* ---------- health: is each secret still good? ---------- */
export async function health(env) {
  const out = { checkedAt: new Date().toISOString(), gemini: { ok: false } };
  try {
    const target = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1";
    let r;
    if (env.RELAY) r = await env.RELAY.get(env.RELAY.idFromName("gemini-relay-us"), { locationHint: "enam" }).fetch("https://relay/" + encodeURIComponent(target), { method: "GET" });
    else r = await fetch(target, { headers: { "x-goog-api-key": env.GEMINI_KEY } });
    out.gemini.ok = r.ok; out.gemini.status = r.status;
  } catch (e) { out.gemini.error = String(e.message || e); }
  return out;
}

/* ---------- 問 AI: one question about one stock ---------- */
export async function twAsk(env, ip, bodyText, json, fail) {
  if (!env.GEMINI_KEY) return fail(500, "INTERNAL", "The Worker has no GEMINI_KEY secret yet");
  let b; try { b = JSON.parse(bodyText); } catch (e) { return fail(400, "BAD_JSON", "Body is not JSON"); }
  const code = String((b && b.code) || "").trim(), name = twClip(b && b.name, 20) || code, q = twClip(String((b && b.q) || "").replace(/\s+/g, " ").trim(), 200);
  if (!/^[0-9A-Z]{4,6}$/.test(code)) return fail(400, "BAD_CODE", "Bad stock code");
  if (q.length < 2) return fail(400, "BAD_QUESTION", "請輸入問題");
  let facts; try { facts = JSON.stringify(b.facts || {}); } catch (e) { facts = "{}"; }
  if (facts.length > 12000) facts = facts.slice(0, 12000);
  const lim = await guard(env, "ip:" + ip, "ai", { hr: AI_HOUR, day: AI_DAY });
  if (lim.blocked) return fail(429, "RESOURCE_EXHAUSTED", "Limit reached for this connection; try again later", { "Retry-After": String(lim.aiWait || 60) });
  const news = await twHeadlines(name + " " + code + " when:14d", 10).catch(() => []);
  const day = t => (t ? new Date(t).toISOString().slice(0, 10) : "");
  const prompt = [
    "You are a Taiwan equity analyst answering ONE question from a private investor about " + name + " (" + code + ").",
    "Answer in Traditional Chinese as used in Taiwan: direct answer first, then the reason, at most 6 short sentences (about 200 Chinese characters).",
    "Use ONLY the numbers in DATA and the headlines below. Never invent a price, ratio, date or event; if DATA cannot answer the question, say what is missing. When a headline matters, name it briefly.",
    "Nobody can know the future price: say what is more likely and what would prove it wrong; never promise a result. Be conservative.",
    "If the question is not about this stock or the market, politely say you only answer questions about this stock.",
    'Return ONE JSON object and nothing else: {"a":"your answer"}',
    "",
    "QUESTION: " + q,
    "",
    "DATA (prices in NT$, volume in lots of 1,000 shares): " + facts,
    "",
    "HEADLINES (last 14 days, newest first):",
    news.length ? news.map(x => "- " + day(x.at) + " " + x.t + (x.src ? "（" + x.src + "）" : "")).join("\n") : "(none found)",
  ].join("\n");
  const g = await geminiJson(env, prompt, 0.3, 0);
  if (g.error) return fail(g.error.status === 429 ? 429 : 502, g.error.daily ? "AI_DAILY" : "AI_FAILED", g.error.daily ? "今天的額度用完了" : aiWhy(g.error.status), g.error.status === 429 && !g.error.daily ? { "Retry-After": "60" } : undefined);
  let a = null; try { a = JSON.parse(g.text); } catch (e) { const m = String(g.text || "").match(/\{[\s\S]*\}/); try { a = m ? JSON.parse(m[0]) : null; } catch (e2) { a = null; } }
  if (!a || !a.a) return fail(502, "AI_FAILED", "分析結果不完整，再問一次");
  return json({ at: Date.now(), q, a: String(a.a), news: news.slice(0, 4).map(x => ({ t: x.t, src: x.src, u: x.u, at: x.at })) });
}