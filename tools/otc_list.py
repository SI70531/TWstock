"""Writes otc.json: every 上櫃 (TPEx main board) and 興櫃 (emerging) stock with its latest price.
TPEx open data cannot be read by pages on other sites and refuses Cloudflare, so a GitHub Actions job
runs this and publishes the file on the `data` branch, which the site reads from raw.githubusercontent.com."""
import json, re, sys, urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36", "Accept": "application/json"}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)

def num(v):
    try:
        return float(str(v).replace(",", "").lstrip("+"))
    except (TypeError, ValueError):
        return None

main = get("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes")
esb = get("https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics")
keep = re.compile(r"^(\d{4}|00\d{3,4}[A-Z]?)$")
out, date = [], ""
for x in main:
    c = str(x.get("SecuritiesCompanyCode", "")).strip()
    if not keep.match(c):
        continue
    date = date or str(x.get("Date", ""))
    out.append([c, str(x.get("CompanyName", "")).strip(), num(x.get("Close")), num(x.get("Change")), num(x.get("Open")), num(x.get("High")), num(x.get("Low")), round((num(x.get("TradingShares")) or 0) / 1000), "otc"])
for x in esb:
    c = str(x.get("SecuritiesCompanyCode", "")).strip()
    if not re.match(r"^\d{4}$", c):
        continue
    last, prev = num(x.get("LatestPrice")), num(x.get("PreviousAveragePrice"))
    out.append([c, str(x.get("CompanyName", "")).strip(), last, round(last - prev, 2) if last is not None and prev is not None else None, None, num(x.get("Highest")), num(x.get("Lowest")), round((num(x.get("TransactionVolume")) or 0) / 1000), "esb"])
if len(out) < 500:
    sys.exit("TPEx returned too little: %d" % len(out))

# industry of every listed (TWSE) and 上櫃 / 興櫃 (TPEx) company, for the site's sector heat map; codes like "24" (半導體)
ind = {}
for url, kc, ki in [("https://openapi.twse.com.tw/v1/opendata/t187ap03_L", "公司代號", "產業別"),
                    ("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O", "SecuritiesCompanyCode", "SecuritiesIndustryCode")]:
    try:
        for x in get(url):
            c, i = str(x.get(kc, "")).strip(), str(x.get(ki, "")).strip()
            if re.match(r"^\d{4}$", c) and re.match(r"^\d{2}$", i):
                ind[c] = i
    except Exception as e:  # the heat map just misses that market until the next run
        print("industry list failed:", url, e)

json.dump({"date": date, "list": out, "ind": ind}, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(out), "stocks,", len(ind), "industries")
