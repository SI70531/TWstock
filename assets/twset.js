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
  Element.prototype.animate = function (kf, o) {
    const f = +get("speed") || 1;
    if (f !== 1 && o != null) {
      if (typeof o === "number") o = o * f;
      else { o = Object.assign({}, o); if (typeof o.duration === "number") o.duration *= f; if (typeof o.delay === "number") o.delay *= f; }
    }
    return orig.call(this, kf, o);
  };
  apply();
  window.TWSet = { get, set, DEF };
})();
