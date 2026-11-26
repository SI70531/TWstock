# TWstock

Taiwan stock research site, hosted on GitHub Pages: https://si70531.github.io/TWstock/

## What it does

The interface is in Traditional Chinese; this README uses English names. Eleven tabs:

- **Overview**: four indices (TAIEX, front-month TAIEX futures, electronics, finance), a market strip (turnover, net buying of foreign investors / investment trusts / dealers, advancers and decliners), the distribution of price changes and the biggest gainers and losers.
  - **Market chip gauge**: market margin and short balances with the day's change (TWSE), foreign investors' net open interest in TAIEX futures, and the share of listed stocks above their 20- and 60-day averages.
  - **Sector heat map**: TWSE- and TPEx-listed stocks grouped by industry; area = turnover, colour = turnover-weighted change; tap an industry to see its stocks.
  - **Institutional buying / selling streaks**: foreign investors and investment trusts buying or selling on consecutive days, from the last 10 trading days of TWSE's T86; each day is kept in the browser once read.
  - **Attention and disposition stocks**: TWSE's two lists, also marked in the stock list and on the stock page. TPEx stocks are not on them.
- **Pre-market**: the AI pre-market note and the AI close summary.
- **Stocks**: five watchlists plus Strong and Weak presets. The search box looks through every TWSE-listed, TPEx-listed (OTC) and Emerging Stock Board stock by code or name. The list can be sorted by price, change, change % or volume; tapping a row opens it in Stock Analysis.
- **Stock Analysis**: one stock.
  - Price header and a search box to switch stock.
  - K-line for 60 or 120 days with MA5 / MA20 / MA60, Bollinger bands, volume, KD, MACD and RSI, plus trend lines you draw yourself. Drag to pan, scroll to zoom, and move over the chart to read any day.
  - Technical snapshot: plain rules read from the same numbers (trend, KD, RSI, MACD, Bollinger position, volume, support and resistance, returns).
  - Fundamentals and institutional flows: P/E, yield, P/B, monthly revenue and its yearly growth, and the day's net buying by institutions.
  - News and announcements: recent headlines and the company's own material announcements.
  - **Price alerts**: price at or above a level, at or below it, or the day it falls through its 20- or 60-day average. The Worker checks every minute in the day session and sends a Telegram message, at most once a day per alert.
  - **Margin and securities lending**: margin and short balances, their change, margin usage, short-to-margin ratio and securities lending sales, from the newest published day.
  - **Dividends**: five years of ex-dividend and ex-rights results, cash per year, and on request how many trading days each of the latest four took to fill the gap (looked for over 12 months).
  - **Valuation history**: where today's P/E, yield and P/B sit among the stock's own days of the last 36 months.
  - **AI analyst team**: five AI analysts (technical, fundamental, institutional flows, news and world events, risk) each give a stance, followed by a summary with a short- and mid-term view, three scenarios with rough chances, entry conditions (price zone, stop, when not to buy), risks and events to watch. Research numbers computed in the browser go with the request, with no separate screen: technical scenarios on daily and weekly bars, 10,000 random replays of the last 60 days (+8% target, −5% stop, 20 trading days), four strategy backtests with Taiwan trading costs, margin balances, and your own position, trades and events for the stock.
- **Compare**: two to four stocks side by side: price change from a common start (3, 6 or 12 months), drawdown, volatility, valuation, monthly revenue and the day's institutional flows.
- **Screener**: filters TWSE-listed and TPEx stocks by market, price, change %, volume, P/E, P/B, yield, monthly revenue growth and consecutive days of buying by foreign investors or investment trusts, and technical conditions (above the 20- or 60-day average, KD golden cross in the last 3 days, volume against its 20-day average, closing at a 60-day high). All conditions must hold, results can be sorted by any column, and condition sets can be saved. A stock without a figure does not pass a condition on that figure; valuation, monthly revenue and the technical conditions cover TWSE-listed stocks only. The first technical screen reads the last 61 trading days, which takes a few minutes; they are kept in the browser (IndexedDB) and later runs read only the new days. If TWSE refuses requests, running it again carries on from where it stopped.
- **Backtest**: one stock over 1 to 3 years with one of four strategies (moving-average cross, RSI, breakout, KD cross), an optional stop and Taiwan trading costs: returns against buy and hold for the whole period, the first 70% and the last 30%, a chart and every trade.
- **Paper trading**: practice orders with NT$1,000,000 of virtual money, filled in full at the latest quote (the last close outside trading hours), with fees and tax. No order queue, price limits, slippage or dividends, and nothing is sent to any broker.
- **My Holdings**: two views. Holdings and trades are stored in this browser; CSV import and export are available.
  - Portfolio risk: P&L at the latest price, weights, concentration (largest holding, top three, effective number of holdings), industry mix, beta against 0050 and correlations from six months of daily bars, a market −20% stress test against the loss you say you can bear, and three rebalancing plans (as is, cap per holding, scale down to the tolerated loss) with their selling costs.
  - Trade journal: win rate, average win and loss, profit factor, expectancy, losing streaks, hold time of winners vs losers, trades without a stop or against the plan, and up to three rules derived only from the record, each with a way to check it.
  - Equity curve: what today's share counts and cash would have done over about six months, next to 0050. It is worked backwards, not the account's real record.
  - Dividend income: this year's cash dividends, paid and announced, on today's share counts. It is an estimate before taxes and fees.
  - Position size: from entry, stop, capital and the largest loss allowed, the number of shares that fits, fees and tax included.
- **Review**: AI stock analyses and pre-market calls kept as they were made and checked against what happened: analyses after 5, 10 and 20 trading days (also against the TAIEX), pre-market calls against the day's opening gap and close. Records start when this was added (the Worker also supplies a few earlier pre-market calls), and a stock analysis is recorded only when it is shown in this browser.
- **Calendar**:
  - Announced dates for the watchlist and held stocks: ex-dividend and ex-rights dates from TWSE's advance notice (TWSE-listed securities only), and the monthly revenue deadline (the 10th, moved to Monday when it falls on a weekend; other holidays are not taken into account).
  - Your own events (earnings, investor conferences, shareholder meetings and so on) with a date or "to be confirmed", an official source link, the hypothesis to test and data to update; a weekly checklist; facts and market guesses recorded separately.

The gear button opens the settings: download a backup of everything this browser keeps and restore it, switch each kind of Telegram message on or off (your own price alerts are always sent), and set trading costs.

Ctrl+K searches stocks and tabs, the number keys 1–9 and 0 switch to the first ten tabs, `?` lists the shortcuts, and right-click (long-press on a phone) on a stock opens a menu to analyse it, add it to a watchlist or copy its code.

These tools help with research, risk and discipline; none of them can promise a profit.

## Files

```
index.html               Page shell and the tabs
assets/twmain.js         The app: data loading, Overview, Pre-market, Stocks, Stock Analysis, charts, AI analysis
assets/twscan.js         Screener (uses helpers exposed by twmain.js as window.TWDash.api)
assets/twdata.js         Price alerts, margin, dividends, valuation history, market chip gauge, technical figures, line chart
assets/twmore.js         Compare, Backtest, Paper trading, Review and the settings panel (styles in twmore.css)
assets/twlab.js          My Holdings, Calendar, and the research numbers sent to the AI (same helpers)
assets/twui.js           Shell widgets: sidebar on wide screens, market clock, animations
assets/twapp.js          Bottom navigation bar on phones
assets/twconsole.css, twui.css, twpulse.css   Styles loaded by index.html
tools/twstock-worker.js  The Cloudflare Worker (settings in tools/wrangler.toml)
tools/otc_list.py        Writes otc.json (TPEx and Emerging Stock Board stocks, every company's industry code, listed companies' monthly revenue, and foreign investors' open interest in TAIEX futures); the "OTC list" workflow publishes it on the `data` branch every 10 minutes in trading hours and a few times after the close
```

## Data sources

- **Closing data from TWSE** (`www.twse.com.tw`, read by the browser): `MI_INDEX` (all listed stocks), `FMTQIK` (TAIEX history and turnover), `BFI82U` and `T86` (institutions), `STOCK_DAY` (daily bars per stock), `BWIBBU_d` (P/E, yield, P/B) `TWT48U` (ex-dividend notice), `TWT49U` (ex-dividend results), `BWIBBU` (one stock's valuation by month), `MI_MARGN` (margin) and `TWT93U` (securities lending). Finished months of daily bars are cached in the browser. TWSE open data (`openapi.twse.com.tw`) refused browser requests when tested on 2026-11-26. The page still asks it for a second copy of the stock list and for closing index values, so do not depend on those two reads.
- **Through `otc.json`**: TPEx open data cannot be read by the page, and neither can TWSE open data, so the "OTC list" workflow reads them and publishes the TPEx and Emerging Stock Board closing list, industry codes and monthly revenue. It also reads TAIFEX open data for the futures open interest.
- **TPEx and Emerging Stock Board daily bars**: about a year from Yahoo Taiwan through the Worker (`GET /tw/hist`). Valuation, monthly revenue and institutional flows cover TWSE-listed stocks only.
- **Intraday quotes, futures, news and AI (through the Worker)**: the `twstock-ai` Worker (source in this repository, `tools/twstock-worker.js`, settings in `tools/wrangler.toml`) serves
  - `GET /tw/rt` intraday quotes from TWSE's market information system and the TAIEX futures quote from TAIFEX. These are unofficial interfaces and can change or stop working.
  - `GET /tw/news` headlines (Google News) and material announcements (TWSE open data).
  - `POST /tw/analyze` the AI analysis (Gemini), limited to 30 calls an hour and 200 a day per IP address; today's analysis of a stock is kept per device (a random id the page makes once, `twstock-device` in localStorage). The request includes the research numbers described under Stock Analysis.
  - `GET /tw/chart?k=t00|fut|t13|t17&r=tick|day` 1-minute bars of the current session or about a year of daily bars for the TAIEX, the front-month TAIEX future (night session included), the electronics and the finance index (Yahoo Taiwan). The overview cards show the session as a sparkline; tapping a card opens the chart with the session, 3-month and 1-year views.
  - `GET /tw/premarket` the latest pre-market note. The Worker writes it at 05:30 Taipei on trading-day mornings from the TAIEX futures night session, the US close, rates, the NT dollar, institutional flows and headlines, and sends it to Telegram (secret `TELEGRAM_BOT_TOKEN` in this repository; the chat is whoever first messages the bot). `POST /tw/premarket/run` writes one on request (at most 4 an hour and 12 a day for the whole site).
  - Trading-hours alerts (cron every minute, day session 09:00–13:30 and night session 15:00–05:00): TAIEX and night-session TAIEX futures at every ±1.5%, the owner's watchlist and held codes at every ±5% and at limit up / down, and every 15 minutes the AI screens new headlines and the watched companies' material announcements; all sent to Telegram. `POST /tw/alerts/sync` stores the codes (codes only, never shares or costs), the price alerts and which messages are switched off; the first device that syncs is the owner. A manual `POST /tw/premarket/run` is also sent to Telegram.
  - Opening and closing bell: at 09:01 and 13:31 Taipei on trading days, one Telegram message with the TAIEX (and, at the open, whether the pre-market call was right), the TAIEX future and every held and watched stock.
  - Close summary: at 15:30 Taipei on trading days the Worker writes an AI review of the day from TWSE's daily report (sector indices, movers, turnover, breadth), the day's institutional flows and headlines, checks the morning's call against the actual open and close, comments on each held and watched stock, and sends it to Telegram together with any of those stocks newly on the attention or disposition list. `GET /tw/close` serves it (shown on the Pre-market tab); `POST /tw/close/run` writes one on request (shares the pre-market limit).
- Intraday quotes cover the stocks currently on screen (up to 70 rows, the watchlist, or the open stock) and refresh every 2 seconds during the day session (stocks and indices in one TWSE request, so an open page costs TWSE about one request every 2 seconds) and every 5 seconds for the TAIEX future in the night session; the rest of the list stays at the last close until scrolled into the first rows or opened. Sorting therefore mixes live and closing values.
- When the Worker does not answer, the page keeps working on closing data and says so in the banner. When TWSE cannot be reached at all, the banner says the data is illustrative and the numbers are sample values.

The **Deploy Worker** workflow (`.github/workflows/worker.yml`) deploys it on every push that changes the Worker, or by hand (Actions → Deploy Worker → Run workflow). It needs the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and `TELEGRAM_BOT_TOKEN` for the notification. The Worker's `GEMINI_KEY` is kept in Cloudflare (Workers → twstock-ai → Settings → Variables and Secrets).

## About the AI analysis

This is a private research tool for its owner and a few friends, not a public service. The AI works from the figures on the page and from news headlines; it can be wrong, it only sees titles of news stories, and nobody can know where a price will go. The scenarios and entry conditions are a structured opinion to think with, not investment advice and not a promise of any result.

## No accounts

There is no sign-in. Watchlists, holdings, the trade journal, calendar events, saved screener conditions, the paper account and the review records are kept in this browser; use the backup in the settings to keep a copy. For trading-hours alerts, the watchlist and held stock codes and your price alerts are sent to the Worker (never shares or costs). An AI analysis of a stock you hold or have traded also sends your position, trade summary and events for that stock. The AI analysis and the manual pre-market note are open to anyone on the site, within the limits above.

## Disclaimer

This site is for research and learning. Nothing on it, including the AI analysis, is investment advice. No orders are placed from this site.
