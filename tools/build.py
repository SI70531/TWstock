"""Builds the two files the page loads, from the sources in assets/:
   assets/app.css  <- the 12 style sheets, in page order
   assets/app.js   <- the 14 scripts, in page order; each runs inside its own try/catch, so one failing
                      script is reported (and goes to the Worker's error log) but does not stop the others.
Run `python3 tools/build.py` after changing any source file (tests/smoke.py fails if the build is stale)."""
import hashlib, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, "assets")
CSS = "tokens base twconsole twui twpulse twplay twextra twnew twfx twfx2 twfx3 twds".split()
JS = "twlab twmain twapp twui twplay twmore twextra twnew twnew2 twfx twfx2 twfx3 twds twmotion".split()


def rd(p):
    with open(os.path.join(A, p), encoding="utf8") as f:
        return f.read().rstrip() + "\n"


def build():
    css = "".join(f"/* ===== {n}.css ===== */\n{rd(n + '.css')}" for n in CSS)
    js = "".join(
        f"/* ===== {n}.js ===== */\ntry {{\n{rd(n + '.js')}}} catch (e) {{ setTimeout(() => {{ throw e; }}, 0); }}\n"
        for n in JS)
    return {"app.css": css, "app.js": js}


def stamp(out):
    """the ?v= on every local file in index.html = a short hash of what the page loads, so a changed file is never served from an old browser cache"""
    h = hashlib.sha1("".join(out.values()).encode("utf8") + rd("twset.js").encode("utf8") + rd("twintro.js").encode("utf8")).hexdigest()[:10]
    p = os.path.join(ROOT, "index.html")
    s = open(p, encoding="utf8").read()
    return p, s, re.sub(r"(\./assets/[\w.-]+\?v=)\w+", lambda m: m.group(1) + h, s)


if __name__ == "__main__":
    out = build()
    ip, old, new = stamp(out)
    if "--check" in sys.argv:
        stale = [k for k, v in out.items() if not os.path.exists(os.path.join(A, k)) or open(os.path.join(A, k), encoding="utf8").read() != v]
        if new != old:
            stale.append("index.html version")
        if stale:
            print("stale build:", ", ".join(stale), "- run python3 tools/build.py")
            sys.exit(1)
        print("build is up to date")
    else:
        if new != old:
            open(ip, "w", encoding="utf8").write(new)
        for k, v in out.items():
            with open(os.path.join(A, k), "w", encoding="utf8") as f:
                f.write(v)
            print("wrote assets/" + k, len(v) // 1024, "KB")
