# TWstock

Taiwan stock research site, hosted on GitHub Pages: https://si70531.github.io/TWstock/

## What it does

The interface is in Traditional Chinese; this README uses English names. The menu has Overview, Market calendar, Analysis, Stocks and My holdings. A stock's own page (Stock Analysis) opens when you tap the stock, and the back button returns.

- **Overview**: four indices (TAIEX, front-month TAIEX futures, electronics, finance), a market strip (turnover, net buying of foreign investors / investment trusts / dealers, advancers and decliners) and the market's movers.
  - **Institutional buying / selling streaks** (foreign investors and investment trusts on consecutive days, from the last 10 trading days of TWSE's T86, each day kept in the browser once read) and **attention and disposition stocks** (TWSE's two lists, also marked in the stock list and on the stock page; TPEx stocks are not on them).
  - **World markets** (US indices, SOX, FX, oil, the US 10-year yield) and **futures positions** (net open interest of the TAIEX future held by foreign investors, trusts and dealers).
  - **Market chip gauge**: market margin and short balances with the day's change, and the share of listed stocks above their 20- and 60-day averages.
- **Market calendar**: ex-dividend dates, shareholder meetings and filing deadlines, for all companies or your own stocks, with an estimate of dividends on your holdings.
- **Analysis**: the AI close summary, the pre-market note, the midday note and the weekly review, plus **Hit rate**: AI stock analyses and pre-market calls kept as they were made and checked against what happened (analyses after 5, 10 and 20 trading days, also against the TAIEX; pre-market calls against the day's opening gap and close). Records are kept in this browser from when this was added, and a stock analysis is recorded only when it is shown here.
- **Stocks**: the list with five watchlists and Strong / Weak presets, a screener, a monthly revenue ranking, concept groups, institutional net buyers and sellers, a price overlay chart and the ex-dividend list.
  - The screener filters by yield, P/E, monthly revenue growth, today's move, volume and the latest institutional buying, and by technical conditions: above the 20- or 60-day average, KD golden cross in the last 3 days or a 60-day closing high, and volume against its 20-day average. Technical conditions cover TWSE-listed stocks and use unadjusted closes. The first use reads the last 61 trading days, which takes a few minutes; they are kept in the browser (IndexedDB) and later runs read only the new days. If TWSE refuses requests, running it again carries on from where it stopped.
- **Stock Analysis**: price header, K-line (60 or 120 days) with MA5 / MA20 / MA60, Bollinger bands, volume, KD, MACD and RSI, a rule-based technical snapshot, fundamentals and institutional flows, news and announcements, financial highlights, the shareholding distribution and a P/E band chart.
  - Margin and short balances for recent days, with the latest securities lending sales.
  - **Dividends**: five years of ex-dividend and ex-rights results for TWSE-listed securities, cash per year, and on request how many trading days each of the latest four took to fill the gap (looked for over 12 months).
  - **AI analyst team**: five AI analysts (technical, fundamental, institutional flows, news and world events, risk) each give a stance, followed by a summary with a short- and mid-term view, three scenarios with rough chances, entry conditions, risks and events to watch. Research numbers computed in the browser go with the request (technical scenarios, 10,000 random replays, four strategy backtests with Taiwan trading costs, and your own position, trades and events). You can also ask the AI a question about the stock.
- **My holdings**: holdings and estimated profit and loss after selling fees and tax.
  - What today's share counts and cash would have done over about six months, next to 0050. It is worked backwards, not the account's real record.
  - Position size: from entry, stop, capital and the largest loss allowed, the number of shares that fits, fees and tax included.
  - **Paper trading**: practice orders with NT$1,000,000 of virtual money, filled in full at the latest quote (the last close outside trading hours), with fees and tax. No order queue, price limits, slippage or dividends, and nothing is sent to any broker.
  - **Backup and restore** of what this browser keeps, and switches for each kind of Telegram message.

These tools help with research, risk and discipline; none of them can promise a profit.

## Files

```
index.html               Page shell and the tabs
assets/twmain.js/.css    The app: data loading, Overview, Analysis, Stocks, Stock Analysis, charts, AI analysis
assets/twlab.js          Research tools and the research numbers sent to the AI (uses helpers exposed by twmain.js as window.TWDash.api)
assets/twmore.js         Price overlay and ex-dividend views, holdings page, market calendar, cross-device sync, sidebar and gestures
assets/twextra.js/.css   Market chip gauge, technical screening, dividends, equity curve, position size, paper trading, hit rate, backup, line chart
assets/twui.css / twui.js  UI v3: glass shell (sidebar on wide screens, tabs on tablets, bottom bar on phones), light/dark from the device, drifting aurora tinted by the TAIEX, counting numbers, card tilt and sheen, loading skeletons
tools/otc_list.py        Writes otc.json (TPEx and Emerging Stock Board stocks, plus every company's industry code); the "OTC list" workflow publishes it on the `data` branch every 10 minutes in trading hours, because TPEx open data cannot be read by the page and refuses the Worker
assets/twapp.js/.css     App shell: gradient header, floating bottom tab pill (mobile)
assets/twdash.css, twmarket.css, twglass.css, twtheme.css   Shared look: cards, chips, glass surfaces, theme
```

## Data sources

- **TPEx closing data**: `tpex_mainboard_daily_close_quotes` (TPEx open data) for the list and the TPEx per-stock monthly report for daily bars. Fundamentals, institutional flows and intraday quotes are TWSE only, so TPEx stocks show closing prices.
- **Closing data (no backend needed)**: TWSE open data, read by the browser. `STOCK_DAY_ALL` (all listed stocks), `MI_INDEX` (indices), `FMTQIK` (TAIEX history and turnover), `BFI82U` and `T86` (institutions), `STOCK_DAY` (daily bars per stock), `BWIBBU_ALL` and `t187ap05_L` (valuation and monthly revenue). Finished months are cached in the browser.
- **Intraday quotes, futures, news and AI (through the Worker)**: the `twstock-ai` Worker (source in this repository, `tools/twstock-worker.js`, settings in `tools/wrangler.toml`) serves
  - `GET /tw/rt` intraday quotes from TWSE's market information system and the TAIEX futures quote from TAIFEX. These are unofficial interfaces and can change or stop working.
  - `GET /tw/news` headlines (Google News) and material announcements (TWSE open data).
  - `POST /tw/analyze` the AI analysis (Gemini), limited to 30 calls an hour and 200 a day per IP address; today's analysis of a stock is kept per device (a random id the page makes once, `twstock-device` in localStorage). The page also sends the research tools' numbers for the stock (technical scenarios, the 10,000-run time machine, four strategy backtests, and the user's own position, trades and events); the tools themselves sit in a fold under the AI team on the stock page.
  - `GET /tw/chart?k=t00|fut|t13|t17&r=tick|day` 1-minute bars of the current session or about a year of daily bars for the TAIEX, the front-month TAIEX future (night session included), the electronics and the finance index (Yahoo Taiwan). The overview cards show the session as a sparkline; tapping a card opens the chart with the session, 3-month and 1-year views.
  - `GET /tw/premarket` the latest pre-market note. The Worker writes it at 05:30 Taipei on trading-day mornings from the TAIEX futures night session, the US close, rates, the NT dollar, institutional flows and headlines, and sends it to Telegram (secret `TELEGRAM_BOT_TOKEN` in this repository; the chat is whoever first messages the bot). `POST /tw/premarket/run` writes one on request (at most 4 an hour and 12 a day for the whole site).
  - Trading-hours alerts (cron every minute, day session 09:00–13:30 and night session 15:00–05:00): TAIEX and night-session TAIEX futures at every ±1.5%, the owner's watchlist and held codes at every ±5% and at limit up / down, and every 15 minutes the AI screens new headlines and the watched companies' material announcements; all sent to Telegram. `POST /tw/alerts/sync` stores the codes (codes only, never shares or costs) and which messages are switched off; the first device that syncs is the owner. A manual `POST /tw/premarket/run` is also sent to Telegram.
  - Opening and closing bell: at 09:01 and 13:31 Taipei on trading days, one Telegram message with the TAIEX (and, at the open, whether the pre-market call was right), the TAIEX future and every held and watched stock.
  - Close summary: at 15:30 Taipei on trading days the Worker writes an AI review of the day from TWSE's daily report (sector indices, movers, turnover, breadth), the day's institutional flows and headlines, checks the morning's call against the actual open and close, comments on each held and watched stock, and sends it to Telegram together with any of those stocks newly on the attention or disposition list. `GET /tw/close` serves it (shown under Analysis); `POST /tw/close/run` writes one on request (shares the pre-market limit).
  - Weekly review: Saturday 09:00 Taipei the Worker summarises the week's five trading days (TAIEX closes, sector moves, institutional flows, headlines) with the AI and sends it to Telegram. `GET /tw/week` serves it (shown under Analysis); `POST /tw/week/run` writes one on request (shares the pre-market limit).
  - Institutional ranking: `GET /tw/instrank` returns the top net buyers and sellers (foreign, investment trust, dealers, all three) from TWSE T86 for the latest trading day; the Stocks tab shows it.
  - Ask the AI: `POST /tw/ask {d, code, name, q, facts}` answers one question about the open stock from the page's numbers and recent headlines (one AI call, counted in the per-IP limit).
- Intraday quotes cover the stocks currently on screen (up to 70 rows, the watchlist, or the open stock) and refresh every 2 seconds during the day session (stocks and indices in one TWSE request, so an open page costs TWSE about one request every 2 seconds) and every 5 seconds for the TAIEX future in the night session; the rest of the list stays at the last close until scrolled into the first rows or opened. Sorting therefore mixes live and closing values.
- When the Worker does not answer, the page keeps working on closing data and says so in the banner. When TWSE cannot be reached at all, the banner says the data is illustrative and the numbers are sample values.

The **Deploy Worker** workflow (`.github/workflows/worker.yml`) deploys it on every push that changes the Worker, or by hand (Actions → Deploy Worker → Run workflow). It needs the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and `TELEGRAM_BOT_TOKEN` for the notification. The Worker's `GEMINI_KEY` is kept in Cloudflare (Workers → twstock-ai → Settings → Variables and Secrets).

## About the AI analysis

This is a private research tool for its owner and a few friends, not a public service. The AI works from the figures on the page and from news headlines; it can be wrong, it only sees titles of news stories, and nobody can know where a price will go. The scenarios and entry conditions are a structured opinion to think with, not investment advice and not a promise of any result.

## No accounts

There is no sign-in. The paper account and the hit-rate records stay in this browser. Holdings, cash, trades, events, price alerts and watchlists are also shared across devices through the Worker (`POST /tw/sync`, last write per key wins). That endpoint has no authentication: anyone using the site can read and change this shared data. The AI analysis and the manual pre-market note are open to anyone on the site, within the limits above.

## Disclaimer

This site is for research and learning. Nothing on it, including the AI analysis, is investment advice. No orders are placed from this site.
