/* TWstock shared layer: marks units and data states, and keeps chart axis text a steady size on screen.
   It only adds classes, attributes and one wrapper around a trailing unit; the text itself never changes. */
(function () {
  "use strict";
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- units after a number: "8,711 張" "22.19 倍" "29.4 億" (the % sign is handled by the font) ---------- */
  const UNIT = /^([\s▲▼+\-−]*\d[\d,]*(?:\.\d+)?)\s?(張|億元|億|萬|倍|元|檔|天|日|筆|股|點)$/;
  const UNIT_IN = "td, .snap b, .snap em, .snap span, .mstrip b, .mcell b, .aikv b, .pk-kv b, .hmc-kv b";
  function units() {
    $$(UNIT_IN).forEach(el => {
      if (el.childNodes.length !== 1 || el.firstChild.nodeType !== 3) return;
      const m = UNIT.exec(el.textContent.trim());
      if (!m) return;
      const u = document.createElement("i"); u.className = "u"; u.textContent = m[2];
      el.textContent = m[1]; el.appendChild(u);
    });
  }

  /* ---------- one look for each kind of message ---------- */
  const STATES = [
    ["loading", /^(載入中|讀取中)/],
    ["error", /^([^，。（]{0,8}讀不到|查無)/],
    ["empty", /^(沒有|還沒有|目前沒有|尚無|找不到|資料不足)/],
    ["closed", /^休市/],
  ];
  const MSG_IN = ".app p, .app .empty, .app .mempty, .app .sub, .app .msg";
  function states() {
    $$(MSG_IN).forEach(el => {
      let kind = null;
      if (!el.querySelector("button, input, a, div, p, table, svg")) {
        const t = el.textContent.trim();
        const hit = t.length < 90 && STATES.find(s => s[1].test(t));
        if (hit) kind = hit[0];
      }
      if (kind) { if (el.dataset.state !== kind) el.dataset.state = kind; }
      else if (el.dataset.state) delete el.dataset.state;
    });
  }

  /* ---------- chart text: drawn in viewBox units, so each chart is told what 11 (K-line: 12) screen pixels is in its own units ---------- */
  const CHARTS = "svg.kchart, svg.ixfig, svg.mc, svg.lfig, svg.cmsvg, svg.river, .finp svg, svg.cpsvg";
  function axes() {
    $$(CHARTS).forEach(svg => {
      const vb = svg.viewBox && svg.viewBox.baseVal, r = svg.getBoundingClientRect();
      if (!vb || !vb.width || !r.width) return;
      let k = r.width / vb.width;
      if (svg.getAttribute("preserveAspectRatio") === "none") k = Math.min(k, r.height / vb.height || k);
      /* upper limits keep the labels inside the margins each drawing leaves for them */
      const max = svg.closest(".finp") ? 11 : svg.classList.contains("cmsvg") ? 10 : 13;
      const fs = Math.round(Math.max(7, Math.min(max, (svg.classList.contains("kchart") ? 12 : 11) / k)) * 10) / 10 + "px";
      if (svg.style.getPropertyValue("--ch-fs") !== fs) svg.style.setProperty("--ch-fs", fs);
    });
  }

  let queued = false;
  function run() { queued = false; units(); states(); axes(); }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(run); } }
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "hidden"] });
  addEventListener("resize", queue);
  queue();
})();
