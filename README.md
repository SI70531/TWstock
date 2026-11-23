# TWstock

Taiwan stock research site, hosted on GitHub Pages: https://si70531.github.io/TWstock/

## What it does

Four tabs:

- **總覽**: four indices (TAIEX, front-month TAIEX futures, electronics, finance), a market strip (turnover, net buying of foreign investors / investment trusts / dealers, advancers and decliners) and every TWSE-listed and TPEx (上櫃) stock in one list; TPEx rows are marked 櫃. The list can be searched by code or name, sorted by price, change, change % or volume, and filtered with presets (全部, 自選, 強勢股, 弱勢股, 成交量). ★ adds a stock to the watchlist; tapping a row opens it in 個股分析.
- **自選股**: the followed stocks as cards with price, change and the day's range.
- **個股分析**: one stock.
  - Price header and a search box to switch stock.
  - K-line for 60 or 120 days with MA5 / MA20 / MA60, Bollinger bands, volume, KD, MACD and RSI. Move over the chart to read any day.
  - 技術面快照: plain rules read from the same numbers (trend, KD, RSI, MACD, Bollinger position, volume, support and resistance, returns).
  - 基本面與籌碼: P/E, yield, P/B, monthly revenue and its yearly growth, and the day's net buying by institutions.
  - 新聞與公告: recent headlines and the company's own material announcements.
  - **AI 分析團隊**: five AI analysts (technical, fundamental, institutional flows, news and world events, risk) each give a stance, followed by a summary with a short- and mid-term view, three scenarios with rough chances, entry conditions (price zone, stop, when not to buy), risks and events to watch. Needs a sign-in.

- **研究室** (Lab): eight research tools, opened from a card menu. Holdings and the trade journal are kept only in this browser (never uploaded); CSV import and export are available.
  - 持股風險 (portfolio risk): P&L at the latest price, weights, concentration (largest holding, top three, effective number of holdings), industry mix, beta against 0050 and correlations from six months of daily bars, a market −20% stress test against the loss you say you can bear, and three rebalancing plans (as is, cap per holding, scale down to the tolerated loss) with their selling costs.
  - 交易日誌 (trade journal): win rate, average win and loss, profit factor, expectancy, losing streaks, hold time of winners vs losers, trades without a stop or against the plan, and up to three rules derived only from the record, each with a way to check it.
  - 技術情境 (technical scenarios): about 14 months of daily bars plus weekly bars built from them; support, resistance, a 60-day regression trend line, moving averages and momentum; bull, range and bear scenarios listing which conditions hold now, what would confirm and what would break each one.
  - 策略回測 (backtest): moving-average cross, RSI reversion, breakout and KD cross on 12–36 months; signals on the close, fills at the next open, fees, transaction tax and slippage; in-sample vs out-of-sample and buy-and-hold; trades and data downloadable as CSV.
  - 同業比較 (peer valuation): P/E, P/B, yield and revenue growth side by side with the industry, medians and missing data marked.
  - 敏感度分析 (sensitivity): a five-year free-cash-flow model with conservative, base and optimistic inputs, a discount-rate × growth grid and the most sensitive input; no probabilities are assigned.
  - 事件日曆 (event calendar): events with date or "to be confirmed", official source, the hypothesis to test and data to update; a weekly checklist; facts and market guesses recorded separately.
  - 提示詞 (prompts): the twelve research prompts, filled with the page's data (OHLCV, indicators, fundamentals, holdings, journal), ready to copy into Claude.
  These tools help with risk and discipline; none of them can promise a profit.

## Files

```
index.html               Sign-in gate, device PIN, page shell and the three tabs
assets/twmain.js/.css    The app: data loading, 總覽, 自選股, 個股分析, charts, AI analysis
assets/twlab.js          The 研究室 tab (uses helpers exposed by twmain.js as window.TWDash.api)
assets/twui.css / twui.js  UI v3: glass shell (sidebar on wide screens, tabs on tablets, bottom bar on phones), light/dark from the device, drifting aurora tinted by the TAIEX, counting numbers, card tilt and sheen, loading skeletons
tools/otc_list.py        Writes otc.json (上櫃 and 興櫃 stocks); the "OTC list" workflow publishes it on the `data` branch every 10 minutes in trading hours, because TPEx open data cannot be read by the page and refuses the Worker
assets/twaccount.js      Account, device PIN and watchlist sync (same Supabase project and Worker as EZexams)
assets/twapp.js/.css     App shell: gradient header, floating bottom tab pill (mobile)
assets/twdash.css, twmarket.css, twglass.css, twtheme.css   Shared look: cards, chips, glass surfaces, theme
tools/supabase-twstock.sql  Watchlist table (Row Level Security)
```

## Data sources

- **TPEx closing data**: `tpex_mainboard_daily_close_quotes` (TPEx open data) for the list and the TPEx per-stock monthly report for daily bars. Fundamentals, institutional flows and intraday quotes are TWSE only, so TPEx stocks show closing prices.
- **Closing data (no backend needed)**: TWSE open data, read by the browser. `STOCK_DAY_ALL` (all listed stocks), `MI_INDEX` (indices), `FMTQIK` (TAIEX history and turnover), `BFI82U` and `T86` (institutions), `STOCK_DAY` (daily bars per stock), `BWIBBU_ALL` and `t187ap05_L` (valuation and monthly revenue). Finished months are cached in the browser.
- **Intraday quotes, futures, news and AI (through the Worker)**: the `twstock-ai` Worker (source in this repository, `tools/twstock-worker.js`, settings in `tools/wrangler.toml`) serves
  - `GET /tw/rt` intraday quotes from TWSE's market information system and the TAIEX futures quote from TAIFEX. These are unofficial interfaces and can change or stop working.
  - `GET /tw/news` headlines (Google News) and material announcements (TWSE open data).
  - `POST /tw/analyze` the AI analysis (Gemini), counted per account. The page also sends the research tools' numbers for the stock (technical scenarios, the 10,000-run time machine, four strategy backtests, and the user's own position, trades and events); the tools themselves sit in a fold under the AI team on the stock page.
  - `GET /tw/chart?k=t00|fut|t13|t17&r=tick|day` 1-minute bars of the current session or about a year of daily bars for the TAIEX, the front-month TAIEX future (night session included), the electronics and the finance index (Yahoo Taiwan). The overview cards show the session as a sparkline; tapping a card opens the chart with the session, 3-month and 1-year views.
  - `GET /tw/premarket` the latest pre-market note. The Worker writes it at 05:30 Taipei on trading-day mornings from the TAIEX futures night session, the US close, rates, the NT dollar, institutional flows and headlines, and sends it to Telegram (secret `TELEGRAM_BOT_TOKEN` in this repository; the chat is whoever first messages the bot). `POST /tw/premarket/run` writes one on request for a signed-in account.
  - Trading-hours alerts (cron every minute, day session 09:00–13:30 and night session 15:00–05:00): TAIEX and night-session TAIEX futures at every ±1.5%, the owner's watchlist and held codes at every ±5% and at limit up / down, and every 15 minutes the AI screens new headlines and the watched companies' material announcements; all sent to Telegram. `POST /tw/alerts/sync` stores the codes (codes only, never shares or costs); the first account that syncs is the owner. A manual `POST /tw/premarket/run` is also sent to Telegram.
  - Opening and closing bell: at 09:01 and 13:31 Taipei on trading days, one Telegram message with the TAIEX (and, at the open, whether the pre-market call was right), the TAIEX future and every held and watched stock.
- Intraday quotes cover the stocks currently on screen (up to 70 rows, the watchlist, or the open stock) and refresh every 5 seconds during trading hours (the TAIEX future also during the night session); the rest of the list stays at the last close until scrolled into the first rows or opened. Sorting therefore mixes live and closing values.
- When the Worker does not answer, the page keeps working on closing data and says so in the banner. When TWSE cannot be reached at all, the banner says 示意資料 and the numbers are sample values.

The **Deploy Worker** workflow (`.github/workflows/worker.yml`) deploys it on every push that changes the Worker, or by hand (Actions → Deploy Worker → Run workflow). It needs the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and `TELEGRAM_BOT_TOKEN` for the notification. The Worker's `GEMINI_KEY` is kept in Cloudflare (Workers → twstock-ai → Settings → Variables and Secrets).

## About the AI analysis

This is a private research tool for its owner and a few friends, not a public service. The AI works from the figures on the page and from news headlines; it can be wrong, it only sees titles of news stories, and nobody can know where a price will go. The scenarios and entry conditions are a structured opinion to think with, not investment advice and not a promise of any result.

## Account

- The account is the same as EZexams; one username and password works on both sites.
- After signing in you can set a 4-digit PIN for this device and use it to sign in directly. The PIN only works on this device and is removed after 5 wrong attempts; you then have to sign in with your password again.
- When signed out, the watchlist is stored only in this browser.

## One-time setup

1. Supabase → SQL Editor: run `tools/supabase-twstock.sql`.
2. The Worker (`ezexams-ai`) is already configured in EZexams. TWstock uses the same site origin (`https://si70531.github.io`), so no extra setup is needed.

## Disclaimer

This site is for research and learning. Nothing on it, including the AI analysis, is investment advice. No orders are placed from this site.
