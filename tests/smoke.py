"""Smoke test for the TWstock page: serves the repo, mocks every market source, and walks the site.
Run: pip install playwright && playwright install chromium && python3 tests/smoke.py
Set CHROME=/path/to/chrome to use an installed browser instead of Playwright's own."""
import asyncio, datetime, functools, http.server, json, os, re, sys, threading
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8799
TODAY = datetime.date.today()


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()


ROC = f"{TODAY.year - 1911}{TODAY.month:02d}{TODAY.day:02d}"
STOCKS = [("2330", "台積電"), ("2454", "聯發科"), ("2317", "鴻海"), ("0050", "元大台灣50")] + [(str(1100 + i), f"測{i}") for i in range(150)]
ROWS = [{"Date": ROC, "Code": c, "Name": n, "TradeVolume": "50000000", "ClosingPrice": "100", "Change": "1", "OpeningPrice": "99",
         "HighestPrice": "101", "LowestPrice": "98"} for c, n in STOCKS]


def stock_day(url):
    ym = re.search(r"date=(\d{6})", url).group(1)
    y, mo = int(ym[:4]), int(ym[4:])
    d, data, p = datetime.date(y, mo, 1), [], 900
    while d.month == mo:
        if d.weekday() < 5 and d <= TODAY:
            p += 7 if d.day % 3 else -9
            data.append([f"{d.year - 1911}/{d.month:02d}/{d.day:02d}", "10,000,000", "1", str(p - 1), str(p + 3), str(p - 3), str(p), "+2", "100"])
        d += datetime.timedelta(1)
    return {"stat": "OK", "data": data}


FAIL = []


def check(ok, what):
    print(("ok   " if ok else "FAIL ") + what)
    if not ok:
        FAIL.append(what)


async def main():
    serve()
    async with async_playwright() as p:
        kw = {"args": ["--no-sandbox"]}
        if os.environ.get("CHROME"):
            kw["executable_path"] = os.environ["CHROME"]
        b = await p.chromium.launch(**kw)
        ctx = await b.new_context(viewport={"width": 1280, "height": 900})
        pg = await ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        hdr = {"access-control-allow-origin": "*"}

        async def dead(route):
            await route.abort()

        SYNC_HDR, ERR_BODY = [], []

        async def sync(route):
            r = route.request
            if r.url.endswith("/tw/sync"):
                SYNC_HDR.append(r.headers.get("x-tw"))
                return await route.fulfill(status=200, content_type="application/json", headers=hdr, body='{"data":{}}')
            if r.url.endswith("/tw/err"):
                ERR_BODY.append(r.post_data or "")
                return await route.fulfill(status=200, content_type="application/json", headers=hdr, body='{"ok":1}')
            await route.abort()

        await pg.route("**/STOCK_DAY_ALL*", lambda r: r.fulfill(status=200, content_type="application/json", headers=hdr, body=json.dumps(ROWS)))
        await pg.route("**/exchangeReport/STOCK_DAY?*", lambda r: r.fulfill(status=200, content_type="application/json", headers=hdr, body=json.dumps(stock_day(r.request.url))))
        for pat in ["**/rwd/**", "**/MI_INDEX", "**/*raw.githubusercontent.com/**", "**/fonts.googleapis.com/**", "**/fonts.gstatic.com/**"]:
            await pg.route(pat, dead)
        await pg.add_init_script('localStorage.setItem("twtrade-wl",JSON.stringify([["2330","2454","2317"],[],[],[],[]]));localStorage.setItem("twtrade-watch",JSON.stringify(["2330","2454","2317"]));localStorage.setItem("twtrade-wl-seed","1")')
        await pg.route("**/*workers.dev/**", sync)
        url = f"http://127.0.0.1:{PORT}/index.html"
        await pg.goto(url)
        await pg.wait_for_timeout(3000)

        # every top-level page opens and shows something
        for t in ["dpOverview", "dpInd", "dpChip", "dpList", "dpHold", "dpPre", "dpRev", "dpCal"]:
            await pg.evaluate(f'window.TWDash.api.openTab("{t}")')
            await pg.wait_for_timeout(700)
            h = await pg.evaluate(f'(document.getElementById("{t}")||{{}}).offsetHeight||0')
            check(h > 50, f"page {t} is shown ({h}px)")

        # one press = one click on the list sub-tabs
        await pg.evaluate('window.TWDash.api.openTab("dpList")')
        await pg.wait_for_timeout(600)
        await pg.evaluate('window.__c=0;document.addEventListener("click",e=>{if(e.target.closest(".lsub"))window.__c++},true)')
        subs = await pg.evaluate('[...document.querySelectorAll(".lsub [data-sub]")].map(b=>b.dataset.sub)')
        for k in subs:
            el = await pg.query_selector(f".lsub [data-sub={k}]")
            bb = await el.bounding_box()
            await pg.evaluate("window.__c=0")
            await pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2)
            await pg.mouse.down()
            await pg.mouse.up()
            await pg.wait_for_timeout(400)
            n = await pg.evaluate("window.__c")
            vis = await pg.evaluate(f'[...document.querySelectorAll("#dpList > .dcard[data-sub]")].filter(c=>!c.hidden).map(c=>c.dataset.sub).join()')
            check(n == 1 and vis == k, f"sub-tab {k}: {n} click, showing [{vis}]")

        # a reload comes back to the same sub-tab, with its card visible
        for k in ["cp", "dv"]:
            if k not in subs:
                continue
            await pg.click(f".lsub [data-sub={k}]")
            await pg.wait_for_timeout(500)
            await pg.reload()
            await pg.wait_for_timeout(3500)
            vis = await pg.evaluate('[...document.querySelectorAll("#dpList > .dcard[data-sub]")].filter(c=>!c.hidden).map(c=>c.dataset.sub).join()')
            check(vis == k, f"reload keeps sub-tab {k} (showing [{vis}])")

        # compare: an ETF can be added by typing its code and pressing Enter
        await pg.click(".lsub [data-sub=cp]")
        await pg.wait_for_timeout(800)
        await pg.click(".cpq")
        await pg.keyboard.type("0050")
        await pg.wait_for_timeout(300)
        await pg.keyboard.press("Enter")
        await pg.wait_for_timeout(1200)
        chips = await pg.evaluate('[...document.querySelectorAll(".cpchips [data-open]")].map(b=>b.dataset.open)')
        check("0050" in chips, f"compare adds 0050 ({chips})")

        # search opens ready to type
        await pg.keyboard.press("Escape")
        await pg.keyboard.press("Control+k")
        await pg.wait_for_timeout(500)
        await pg.keyboard.type("2330")
        await pg.wait_for_timeout(300)
        v = await pg.evaluate('(document.querySelector(".pal-in input")||{}).value||""')
        check(v == "2330", f"search takes typing at once ({v!r})")

        await pg.keyboard.press("Escape")
        await pg.wait_for_timeout(500)
        # simulated order: buying clears the quantity box and books the position
        await pg.evaluate('window.TWDash.api.openTab("dpHold")')
        await pg.wait_for_timeout(800)
        await pg.click('[data-xview="sim"]')
        await pg.wait_for_timeout(600)
        await pg.fill('.dcard:has(.simbuy) [name="code"]', "2330")
        await pg.fill('.dcard:has(.simbuy) [name="qty"]', "1000")
        await pg.click(".simbuy")
        await pg.wait_for_timeout(1500)
        q = await pg.evaluate('document.querySelector(\'.lform [name="qty"]\').value')
        pos = await pg.evaluate('(document.querySelector(".simpos")||{}).textContent||""')
        check(q == "" and "2330" in pos, f"simulated buy clears qty ({q!r}) and shows the position")

        # personal data is sent to the Worker with the guard header, and script errors are reported
        await pg.evaluate('localStorage.setItem("twsim-test", JSON.stringify({a:1}))')
        await pg.evaluate('window.TWDash.api.store.set("twtrade-watch", ["2330","2454","0050"])')
        await pg.wait_for_timeout(2500)
        check(any(h == "1" for h in SYNC_HDR), f"sync request carries X-TW ({SYNC_HDR})")
        await pg.evaluate('setTimeout(()=>{ throw new Error("smoke-test-error") }, 0)')
        await pg.wait_for_timeout(800)
        check(any("smoke-test-error" in x for x in ERR_BODY), "script errors are reported to the Worker")
        errs[:] = [e for e in errs if "smoke-test-error" not in e]

        # a number counting up: no frame takes long
        await pg.evaluate('window.TWDash.api.openTab("dpOverview")')
        await pg.wait_for_timeout(800)
        worst = await pg.evaluate("""new Promise(res=>{const el=document.querySelector(".ixcard .big");let last=performance.now(),w=0,n=0;
          const t=el.textContent;el.dataset.txt="";el.textContent="1";
          const loop=n0=>{const d=n0-last;last=n0;if(n++>3)w=Math.max(w,d);if(n<50)requestAnimationFrame(loop);else{el.textContent=t;res(Math.round(w))}};requestAnimationFrame(loop)})""")
        check(worst < 250, f"worst frame while numbers move: {worst} ms")

        check(not errs, "no script errors " + (json.dumps(errs, ensure_ascii=False) if errs else ""))
        await b.close()
    sys.exit(1 if FAIL else 0)


asyncio.run(main())
