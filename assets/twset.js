/* TWstock settings: one small store (twmain-set, kept by the backup) that other files read.
   ud    "tw" 紅漲綠跌 (default) | "intl" 綠漲紅跌
   home  tab opened on a fresh visit ("" = 總覽)
   lst   默認 sub-tab of 股票      cmode / cmine  日曆 default view and scope
   poll  "auto" | "5" | "10" | "manual"       speed  animation time scale */
(function () {
  const K = "twmain-set", DEF = { ud: "tw", home: "", lst: "ls", cmode: "list", cmine: "0", poll: "auto", speed: "1" };
  let S = {}; try { S = JSON.parse(localStorage.getItem(K) || "{}") || {}; } catch (e) {}
  const get = k => (S[k] == null ? DEF[k] : S[k]);
  function apply() {
    document.documentElement.dataset.ud = get("ud");
  }
  function set(k, v) {
    S[k] = v; try { localStorage.setItem(K, JSON.stringify(S)); } catch (e) {}
    apply(); document.dispatchEvent(new CustomEvent("twset:change", { detail: { k, v } }));
  }
  /* animation speed: every Web Animations call (almost all motion here) has its duration and delay scaled */
  const orig = Element.prototype.animate;
  /* the system's 減少動態效果: animations jump straight to their end (they still finish, so clean-up code runs) */
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  Element.prototype.animate = function (kf, o) {
    const f = +get("speed") || 1;
    if (f !== 1 && o != null) {
      if (typeof o === "number") o = o * f;
      else { o = Object.assign({}, o); if (typeof o.duration === "number") o.duration *= f; if (typeof o.delay === "number") o.delay *= f; }
    }
    /* a fade-out must stay faded until its element is removed, or Safari flashes it back for one frame */
    if (Array.isArray(kf) && kf.length > 1 && kf[kf.length - 1] && +kf[kf.length - 1].opacity === 0 && String(kf[kf.length - 1].opacity) === "0") {
      if (o == null) o = { duration: 400, fill: "forwards" };
      else if (typeof o === "number") o = { duration: o, fill: "forwards" };
      else if (!o.fill) o = Object.assign({}, o, { fill: "forwards" });
    }
    if (still.matches && o != null) o = Object.assign({}, typeof o === "number" ? {} : o, { duration: 0, delay: 0, iterations: 1 });
    return orig.call(this, kf, o);
  };
  /* NYSE regular session 09:30-16:00 New York (13:00 close on the day after Thanksgiving and on Christmas Eve), Mon-Fri, minus market holidays */
  const nth = (y, m, wd, n) => { let d = new Date(Date.UTC(y, m, 1)), c = 0; while (true) { if (d.getUTCDay() === wd && ++c === n) return d.getUTCDate(); d = new Date(d.getTime() + 864e5); } };
  const lastMon = (y, m) => { let d = new Date(Date.UTC(y, m + 1, 0)); while (d.getUTCDay() !== 1) d = new Date(d.getTime() - 864e5); return d.getUTCDate(); };
  function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451); return [Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1]; }
  function nyseHolidays(y) {
    const obs = (m, d) => { const w = new Date(Date.UTC(y, m, d)).getUTCDay(); return w === 6 ? [m, d - 1] : w === 0 ? [m, d + 1] : [m, d]; };
    const [em, ed] = easter(y), gf = new Date(Date.UTC(y, em, ed - 2));
    return new Set([obs(0, 1), [0, nth(y, 0, 1, 3)], [1, nth(y, 1, 1, 3)], [gf.getUTCMonth(), gf.getUTCDate()], [4, lastMon(y, 4)], obs(5, 19), obs(6, 4), [8, nth(y, 8, 1, 1)], [10, nth(y, 10, 4, 4)], obs(11, 25)].map(x => x[0] + "-" + x[1]));
  }
  function usOpen(now) {
    const p = {}; new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" }).formatToParts(new Date(now || Date.now())).forEach(x => { p[x.type] = x.value; });
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), y = +p.year, m = +p.month - 1, d = +p.day, t = +p.hour * 60 + +p.minute;
    if (wd < 1 || wd > 5 || nyseHolidays(y).has(m + "-" + d)) return false;
    const tg = nth(y, 10, 4, 4), early = (m === 10 && d === tg + 1) || (m === 11 && d === 24);
    return t >= 570 && t < (early ? 780 : 960);
  }
  apply();
  window.TWSet = { get, set, DEF, usOpen, calm: () => still.matches };
})();
