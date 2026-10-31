# TWstock

Taiwan stock research site, hosted on GitHub Pages: https://si70531.github.io/TWstock/

## Files

```
index.html               Home: dashboard (tabs + animated charts), sign-in and device PIN
assets/twdash.js/.css    Dashboard: sliding pill tabs, self-drawing lines, growing bars, sweeping donut (currently sample data; replace the DATA block in the file with real data)
assets/twaccount.js      Account, device PIN and watchlist sync (shares the same Supabase project and Worker as EZexams)
assets/twapp.js/.css     App shell: gradient header, floating bottom tab pill, card grid
assets/twmarket.js/.css  Market tabs: rankings, stock detail with K-line, news, event timeline (demo data)
tools/supabase-twstock.sql  Watchlist table (Row Level Security)
```

## Account

- The account is the same as EZexams; one username and password works on both sites.
- After signing in you can set a 4-digit PIN for this device and use it to sign in directly. The PIN only works on this device and is removed after 5 wrong attempts; you then have to sign in with your password again.
- When signed out, the watchlist is stored only in this browser.

## One-time setup

1. Supabase → SQL Editor: run `tools/supabase-twstock.sql`.
2. The Worker (`ezexams-ai`) is already configured in EZexams. TWstock uses the same site origin (`https://si70531.github.io`), so no extra setup is needed.
