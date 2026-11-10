# TWstock

Taiwan stock research site, hosted on GitHub Pages: https://si70531.github.io/TWstock/

## What it does

Three tabs:

- **總覽**: four indices (TAIEX, front-month TAIEX futures, electronics, finance), a market strip (turnover, net buying of foreign investors / investment trusts / dealers, advancers and decliners) and every TWSE-listed stock in one list. The list can be searched by code or name, sorted by price, change, change % or volume, and filtered with presets (全部, 自選, 強勢股, 弱勢股, 成交量). ★ adds a stock to the watchlist; tapping a row opens it in 個股分析.
- **自選股**: the followed stocks as cards with price, change and the day's range.
- **個股分析**: one stock.
  - Price header and a search box to switch stock.
  - K-line for 60 or 120 days with MA5 / MA20 / MA60, Bollinger bands, volume, KD, MACD and RSI. Move over the chart to read any day.
  - 技術面快照: plain rules read from the same numbers (trend, KD, RSI, MACD, Bollinger position, volume, support and resistance, returns).
  - 基本面與籌碼: P/E, yield, P/B, monthly revenue and its yearly growth, and the day's net buying by institutions.
  - 新聞與公告: recent headlines and the company's own material announcements.
  - **AI 分析團隊**: five AI analysts (technical, fundamental, institutional flows, news and world events, risk) each give a stance, followed by a summary with a short- and mid-term view, three scenarios with rough chances, entry conditions (price zone, stop, when not to buy), risks and events to watch. Needs a sign-in.

## Files

```
index.html               Sign-in gate, device PIN, page shell and the three tabs
assets/twmain.js/.css    The app: data loading, 總覽, 自選股, 個股分析, charts, AI analysis
assets/twaccount.js      Account, device PIN and watchlist sync (same Supabase project and Worker as EZexams)
assets/twapp.js/.css     App shell: gradient header, floating bottom tab pill (mobile)
assets/twdash.css, twmarket.css, twglass.css, twtheme.css   Shared look: cards, chips, glass surfaces, theme
tools/supabase-twstock.sql  Watchlist table (Row Level Security)
```

## Data sources

- **Closing data (no backend needed)**: TWSE open data, read by the browser. `STOCK_DAY_ALL` (all listed stocks), `MI_INDEX` (indices), `FMTQIK` (TAIEX history and turnover), `BFI82U` and `T86` (institutions), `STOCK_DAY` (daily bars per stock), `BWIBBU_ALL` and `t187ap05_L` (valuation and monthly revenue). Finished months are cached in the browser.
- **Intraday quotes, futures, news and AI (through the Worker)**: the `ezexams-ai` Worker (source in the EZexams repo, `tools/ezexams-worker.js`) serves
  - `GET /tw/rt` intraday quotes from TWSE's market information system and the TAIEX futures quote from TAIFEX. These are unofficial interfaces and can change or stop working.
  - `GET /tw/news` headlines (Google News) and material announcements (TWSE open data).
  - `POST /tw/analyze` the AI analysis (Gemini), counted per account.
- Intraday quotes cover the stocks currently on screen (up to 70 rows, the watchlist, or the open stock) and refresh every 10 seconds during trading hours; the rest of the list stays at the last close until scrolled into the first rows or opened. Sorting therefore mixes live and closing values.
- When the Worker does not answer, the page keeps working on closing data and says so in the banner. When TWSE cannot be reached at all, the banner says 示意資料 and the numbers are sample values.

After changing the Worker source, run the **Deploy Worker** workflow in the EZexams repository (Actions → Deploy Worker → Run workflow).

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
