import { health } from "./ai.js";
import { GeminiRelay } from "./do.js";
import { premarket } from "./notes.js";

/* TWstock Worker (Cloudflare, name "twstock-ai"): the server side of https://si70531.github.io/TWstock/.
   No accounts: the AI calls are limited per IP address, and the page sends a random device id (d) that keys
   today's saved analyses and the alert list.
     GET  /tw/rt?c=2330,2317&idx=1   intraday quotes (TWSE market information system, Yahoo Finance when that refuses)
     GET  /tw/news?c=2330&n=台積電    news headlines and the company's material announcements
     GET  /tw/premarket              the latest pre-market note
     POST /tw/analyze {d, code, name, facts}   the AI analyst team (one AI call)
     POST /tw/alerts/sync {d, watch, hold}     the codes the trading-hours alerts watch (the first device that syncs owns the list)
     POST /tw/premarket/run                    write a pre-market note now (one AI call, a few per hour for the whole site)
     GET  /tw/close                  the latest close summary
     POST /tw/close/run                        write a close summary now (shares the pre-market limit)
     cron 05:30 Taipei on trading-day mornings: the pre-market note, sent to Telegram.
     GET  /tw/midday                 the latest midday note (tomorrow's open, written during today's session)
     POST /tw/midday/run                       write a midday note now (shares the pre-market limit)
     cron 13:00 Taipei on trading days: the midday note for the next session, sent to Telegram.
     cron 15:30 Taipei on trading days: the AI close summary (and the owner's stocks newly on the attention / disposition lists), sent to Telegram.
     GET  /tw/instrank               today's (or the latest) institutional net buying / selling ranking from TWSE T86
     POST /tw/ask {d, code, name, q, facts}    one question about one stock, answered by the AI from the page's numbers and headlines
     GET  /tw/week                   the latest weekly review; POST /tw/week/run writes one now (shares the pre-market limit)
     cron 09:00 Taipei on Saturdays: the weekly review of the market, sent to Telegram.
     GET  /tw/world                  US indices, SOX, FX, oil, US 10-year yield (Yahoo Finance)
     GET  /tw/futchip                TAIFEX: net open interest of the TAIEX future by foreign investors / trusts / dealers (and a short history)
     GET  /tw/margin?c=2330          margin / short balances of one stock, the last ~8 trading days (TWSE MI_MARGN)
     GET  /tw/holders?c=2330         shareholding distribution of one stock (TDCC weekly open data)
     GET  /tw/pe?c=2330&m=24         daily P/E, yield, P/B of one stock over the last m months (TWSE BWIBBU)
     GET  /tw/daytrade               day-trading volume per stock, latest day (TWSE TWTB4U)
     GET  /tw/lending                securities-lending short balance per stock and its change (TWSE TWT93U)
     GET  /tw/qfii                   foreign holding ratio per stock and its change over ~5 trading days (TWSE MI_QFIIS)
     GET  /health                    does GEMINI_KEY work
   Secrets: GEMINI_KEY, TG_TOKEN (Telegram bot). Deployed by .github/workflows/worker.yml with tools/wrangler.toml.
   Google does not offer Gemini in Hong Kong, so the Gemini call goes through the GeminiRelay Durable Object in North America. */
export const ALLOWED = ["https://si70531.github.io"];
export const MAX_BODY = 60000;
export const MODELS = ["gemini-3.8-flash", "gemini-3-flash-preview", "gemini-3.5-flash-lite", "gemini-flash-latest", "gemini-flash-lite-latest"];   /* the free tier has no 2.5 quota any more: its 429 "PerDay, limit 0" looked like the daily cap was used up */
export const AI_HOUR = 30, AI_DAY = 200;        /* AI calls per IP address */
export const PM_HOUR = 4, PM_DAY = 12;          /* manual pre-market notes for the whole site (each one also goes to Telegram) */

export const CTX = { env: null };

/* ---------- TWstock (/tw/*) ---------- */
export const TW_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
export const twCache = new Map();
/* a short memory per Worker instance, so many open pages do not each hit TWSE */
export async function twCached(key, ms, make) {
  const hit = twCache.get(key);
  if (hit && hit.until > Date.now()) return hit.v;
  const v = await make();
  if (twCache.size > 300) twCache.clear();
  twCache.set(key, { v, until: Date.now() + ms });
  return v;
}
/* TWSE market information system: one request carries many symbols (tse_2330.tw|tse_t00.tw|…) */
/* TWSE and TAIFEX often refuse servers in the US (where this Worker runs), so their requests go out from a Durable Object
   placed in Asia (locationHint "apac"); when that fails, the request is made directly */
export const TW_HOSTS = ["mis.twse.com.tw", "www.twse.com.tw", "openapi.twse.com.tw", "mis.taifex.com.tw", "openapi.taifex.com.tw", "www.tpex.org.tw", "openapi.tdcc.com.tw"];
export async function twFetch(url, init) {
  init = init || {};
  if (CTX.env && CTX.env.ASIA && TW_HOSTS.includes(new URL(url).hostname)) {
    try {
      const r = await CTX.env.ASIA.get(CTX.env.ASIA.idFromName("tw-relay-asia"), { locationHint: "apac" }).fetch("https://relay/", { method: "POST", body: JSON.stringify({ url, method: init.method || "GET", headers: init.headers || {}, body: init.body || null }) });
      if (r.ok) return r;
    } catch (e) {}
  }
  return fetch(url, init);
}