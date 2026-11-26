"""Writes otc.json: every 上櫃 (TPEx main board) and 興櫃 (emerging) stock with its latest price, every company's
industry code, listed companies' latest monthly revenue (TWSE open data refuses pages on other sites too),
and foreign investors' open interest in TAIEX futures (TAIFEX).
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

# latest monthly revenue of listed companies: code -> [revenue (NT$ 100 million), year-on-year %, ROC year-month]
rev = {}
try:
    for x in get("https://openapi.twse.com.tw/v1/opendata/t187ap05_L"):
        c = str(x.get("公司代號", "")).strip()
        amount, yoy = num(x.get("營業收入-當月營收")), num(x.get("營業收入-去年同月增減(%)"))
        if c and amount is not None:
            rev[c] = [round(amount / 1e5, 2), None if yoy is None else round(yoy, 2), str(x.get("資料年月", ""))]
except Exception as e:  # the page shows revenue as missing until the next run
    print("revenue list failed:", e)

# foreign investors' net open interest in TAIEX futures, newest trading day (TAIFEX open data does not allow other sites either)
futoi = None
try:
    for x in get("https://openapi.taifex.com.tw/v1/MarketDataOfMajorInstitutionalTradersDetailsOfFuturesContractsBytheDate"):
        if x.get("ContractCode") == "臺股期貨" and str(x.get("Item", "")).startswith("外資"):
            net = num(x.get("OpenInterest(Net)"))
            if net is not None:
                futoi = {"date": str(x.get("Date", "")), "foreign": int(net)}
except Exception as e:  # the page shows it as missing until the next run
    print("futures open interest failed:", e)

json.dump({"date": date, "list": out, "ind": ind, "rev": rev, "futoi": futoi}, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(out), "stocks,", len(ind), "industries,", len(rev), "revenues, futures", futoi)
