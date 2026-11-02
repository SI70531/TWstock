# TWstock

Taiwan stock research site, hosted on GitHub Pages: https://si70531.github.io/TWstock/

## Files

```
index.html               Home: dashboard (tabs + animated charts), trading tools, sign-in and device PIN
assets/twdash.js/.css    Dashboard tabs: sliding pill, self-drawing lines, growing bars, sweeping donut (sample data)
assets/twaccount.js      Account, device PIN and watchlist sync (shares the same Supabase project and Worker as EZexams)
assets/twapp.js/.css     App shell: gradient header, floating bottom tab pill (mobile), card grid
assets/twmarket.js/.css  Market tabs: rankings, stock detail with K-line, news, event timeline (sample data)
assets/twglass.css       Glassmorphism layer: background glow blobs, frosted cards and tables
assets/twdense.js        Overview: mini sparklines on stat cards and a side summary beside the chart (sample data)
assets/twtrade.js/.css   Trading tools (see below)
tools/supabase-twstock.sql  Watchlist table (Row Level Security)
```

## Trading tools

The tabs under "交易工具" are built in `assets/twtrade.js` and styled in `assets/twtrade.css`:

- **報價卡**: quote cards for the watchlist, with today's price, change and an animated day-range marker.
- **K線圖**: 60-day candles with MA5 (solid) and MA20 (dashed), for any watchlist stock.
- **部位計算機**: position size from capital, risk percentage and stop-loss distance, with risk/reward ratio.
- **模擬交易**: paper trading with NT$1,000,000 starting cash, 0.1425% fee and 0.3% sell tax. Nothing is sent to a broker.
- **風險評估**: exposure, largest single position, loss if all holdings fall 10%, and cash ratio.
- **交易績效**: realized P&L, win rate, average win and loss, profit factor, and a cumulative P&L curve.
- **到價提醒**: price alerts above or below a target. Browser notifications are sent only in live-data mode.
- **模擬持倉**: holdings and cash as an animated donut chart with legend.
- **恐懼貪婪**: a simple market sentiment gauge built from the day's advancing-stock share and average change. It is this site's own indicator, not an official index.
- **行情列表**: searchable, sortable list of all listed stocks. Click ★ to add a stock to the watchlist.
- **設定**: data source, manual refresh, and clearing paper trades, alerts or the watchlist.

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

## Disclaimer

This site is for research and learning. It gives no investment advice, and the simulator does not represent real trading results.
