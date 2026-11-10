# TWstock

Taiwan stock research site, hosted on GitHub Pages: https://si70531.github.io/TWstock/

## Files

```
index.html               Home: dashboard (tabs + animated charts), trading tools, sign-in and device PIN
assets/twdash.js/.css    Dashboard tabs (總覽 / 走勢 / 產業): sliding pill, self-drawing lines, growing bars; TWSE open data
assets/twaccount.js      Account, device PIN and watchlist sync (shares the same Supabase project and Worker as EZexams)
assets/twapp.js/.css     App shell: gradient header, floating bottom tab pill (mobile), card grid
assets/twmarket.js/.css  Market tabs: rankings, stock detail with K-line, news, event timeline (sample data)
assets/twglass.css       Glassmorphism layer: background glow blobs, frosted cards and tables
assets/twdense.js        Overview: mini sparklines on stat cards and a side summary beside the chart (same data as the dashboard)
assets/twtrade.js/.css   Trading tools (see below)
assets/twtools.js        Research tools: fundamentals, ex-dividend list, institutional flows, screener, comparison
tools/supabase-twstock.sql  Watchlist table (Row Level Security)
```

## Trading tools

The tabs under "交易工具" are built in `assets/twtrade.js` and styled in `assets/twtrade.css`:

- **報價卡**: quote cards for the watchlist, with today's price, change and an animated day-range marker.
- **報價卡 → 走勢**: tap a quote card to select it, then press 看走勢. The card flies open into that stock's K-line with KD and MACD, and an info sheet slides up with a one-line verdict, distance from MA20, position in the 60-day range and the 60-day change. 換一檔 plays the move backwards with the card still selected; 完整 K 線圖 opens the full chart tab on the same stock.
- **K線圖**: 60-day candles with MA5 (solid) and MA20 (dashed), for any watchlist stock.
- **部位計算機**: position size from capital, risk percentage and stop-loss distance, with risk/reward ratio.
- **模擬交易**: paper trading with NT$1,000,000 starting cash, 0.1425% fee and 0.3% sell tax. Nothing is sent to a broker.
- **風險評估**: exposure, largest single position, loss if all holdings fall 10%, and cash ratio.
- **交易績效**: realized P&L, win rate, average win and loss, profit factor, and a cumulative P&L curve.
- **到價提醒**: price alerts above or below a target. Browser notifications are sent only in live-data mode.
- **模擬持倉**: holdings and cash as an animated donut chart with legend.
- **恐懼貪婪**: a simple market sentiment gauge built from the day's advancing-stock share and average change. It is this site's own indicator, not an official index.
- **行情列表**: searchable, sortable list of all listed stocks. Click ★ to add a stock to the watchlist.
- **基本面**: P/E, dividend yield, P/B, estimated EPS and dividend, monthly revenue and YoY growth, each with a plain-language explanation, plus a P/E river chart (price vs 10x–26x of the latest estimated EPS).
- **除權息**: ex-dividend / ex-rights schedule, optionally limited to the watchlist.
- **法人買賣超**: top-10 net buy and net sell for foreign investors, investment trusts, and all three institutions combined.
- **選股**: screener on yield, P/E, price, change, volume and revenue growth, with presets.
- **多檔比較**: side-by-side comparison of up to 5 watchlist stocks, best value highlighted.
- **K線圖 extras**: Bollinger bands, KD, MACD, and hand-drawn trend lines (stored in this browser).
- **報價卡 groups**: tag watchlist stocks as 短線 / 長期 / 觀察 and filter by group. The watchlist itself syncs to your account when signed in.
- **設定**: data source, manual refresh, and clearing paper trades, alerts or the watchlist.

### Market tabs (總覽 / 走勢 / 產業)

These tabs read TWSE open data for the latest trading day; the banner above the tabs shows the data date.

- **TAIEX, turnover, shares and trades**: TWSE `FMTQIK` (one request per month, four months). Finished months are cached in the browser, so later visits only ask for the current month. The dashed line on the index chart is the 20-day average.
- **Institutional net buy / sell (外資, 投信, 自營商)**: TWSE `BFI82U`, by amount. It is published after the close (about 15:00); until then the previous trading day is shown with its date, or "—".
- **Sector moves**: sector indices from TWSE open data `MI_INDEX`, sorted from strongest to weakest.
- **Advancers / decliners**: counted from the quote list used by the trading tools, so the count includes ETFs.

If TWSE cannot be reached, the banner says 示意資料 and the numbers are sample values. A single part that fails on its own shows "—" instead of a sample value.

### Data sources

- **TWSE 公開資料 (default)**: the browser fetches TWSE open data. These are the latest trading day's closing and day-range prices, not tick-by-tick real-time quotes. K-line history comes from TWSE's monthly stock-day endpoint. Live data refreshes every 60 seconds.
- **示意資料**: generated sample data, used automatically when TWSE cannot be reached from the browser (the page shows the reason). Sample numbers do not reflect real prices.

TWSE may block cross-origin requests from some networks. If live data does not load, use the sample fallback and check the message in the panel.

All paper trades, the watchlist and alerts are stored only in the current browser (localStorage).

## Account

- The account is the same as EZexams; one username and password works on both sites.
- After signing in you can set a 4-digit PIN for this device and use it to sign in directly. The PIN only works on this device and is removed after 5 wrong attempts; you then have to sign in with your password again.
- When signed out, the watchlist is stored only in this browser.

## One-time setup

1. Supabase → SQL Editor: run `tools/supabase-twstock.sql`.
2. The Worker (`ezexams-ai`) is already configured in EZexams. TWstock uses the same site origin (`https://si70531.github.io`), so no extra setup is needed.

## What this site deliberately does not do

No stock picks, buy/sell signals, target prices or "should buy" scores, no community posting, no paid groups or copy-trading, and no redistribution of tick-by-tick real-time quotes. In Taiwan, giving investment advice for pay without a licence can fall under securities investment advisory rules, so the site only shows data and objective indicators. Screener results and indicators are tools for narrowing down, not recommendations.

## Disclaimer

This site is for research and learning. It gives no investment advice, and the simulator does not represent real trading results.
