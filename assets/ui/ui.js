/* UI 組件懶人包 · 共用行為（不依賴任何套件）
   window.UI.toast(msg) · UI.modal(el).open()/close() · UI.select(el) · UI.stars(el) · UI.drop(el, onFiles)
   UI.seg(el, onChange) · UI.steps(el, n) · UI.range(input) · UI.pager(el, total, onPage) · UI.init()
   init() 會自動啟用頁面上所有 [data-ui] 元件，之後動態加入的可以再呼叫 UI.init(容器) */
(function () {
  "use strict";
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const UI = (window.UI = {});

  UI.toast = function (msg, ms = 2600) {
    let box = document.querySelector(".ui-toasts");
    if (!box) { box = document.createElement("div"); box.className = "ui-toasts"; box.setAttribute("role", "status"); document.body.appendChild(box); }
    const t = document.createElement("div"); t.className = "ui-toast"; t.textContent = msg; box.appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }, ms);
  };

  UI.modal = function (el) {
    const api = {
      open() { el.classList.add("open"); const f = el.querySelector("input,button"); f && f.focus(); },
      close() { el.classList.remove("open"); },
    };
    el.addEventListener("click", e => { if (e.target === el || e.target.closest("[data-close]")) api.close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") api.close(); });
    return api;
  };

  UI.select = function (el) {
    const head = el.querySelector(".head"), list = el.querySelector(".list"), out = el.querySelector("input[type=hidden]");
    const opts = $$(".opt", el);
    const set = o => { opts.forEach(x => x.classList.toggle("on", x === o)); head.firstChild.textContent = o.textContent; if (out) out.value = o.dataset.v ?? o.textContent; el.dispatchEvent(new CustomEvent("change", { bubbles: true })); };
    head.addEventListener("click", () => el.classList.toggle("open"));
    opts.forEach(o => o.addEventListener("click", () => { set(o); el.classList.remove("open"); }));
    document.addEventListener("click", e => { if (!el.contains(e.target)) el.classList.remove("open"); });
    if (opts[0] && !opts.some(o => o.classList.contains("on"))) set(opts[0]);
  };

  UI.stars = function (el, onChange) {
    const btns = $$("button", el);
    const paint = n => btns.forEach((b, i) => b.classList.toggle("on", i < n));
    btns.forEach((b, i) => {
      b.setAttribute("aria-label", (i + 1) + " 顆星");
      b.addEventListener("click", () => { el.dataset.value = i + 1; paint(i + 1); onChange && onChange(i + 1); });
      b.addEventListener("mouseenter", () => paint(i + 1));
    });
    el.addEventListener("mouseleave", () => paint(+el.dataset.value || 0));
  };

  UI.drop = function (el, onFiles) {
    const input = el.querySelector("input[type=file]"), bar = el.querySelector(".bar i"), big = el.querySelector(".big");
    const handle = files => {
      if (!files || !files.length) return;
      if (big) big.textContent = files[0].name + "（" + files.length + " 個檔案）";
      let p = 0; const tm = setInterval(() => { p = Math.min(100, p + 12 + Math.random() * 14); bar && (bar.style.width = p + "%"); if (p >= 100) { clearInterval(tm); onFiles && onFiles(files); } }, 90);
    };
    el.addEventListener("click", e => { if (e.target !== input) input.click(); });
    input.addEventListener("change", () => handle(input.files));
    ["dragenter", "dragover"].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); el.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); el.classList.remove("over"); }));
    el.addEventListener("drop", e => handle(e.dataTransfer.files));
  };

  UI.seg = function (el, onChange) {
    const btns = $$("button", el), pill = el.querySelector(".pill") || el.insertBefore(Object.assign(document.createElement("span"), { className: "pill" }), el.firstChild);
    el.setAttribute("role", "tablist");
    const go = b => {
      btns.forEach(x => x.setAttribute("aria-selected", String(x === b)));
      pill.style.width = b.offsetWidth + "px"; pill.style.transform = "translateX(" + b.offsetLeft + "px)";
      onChange && onChange(b.dataset.v ?? b.textContent, b);
    };
    btns.forEach(b => { b.setAttribute("role", "tab"); b.addEventListener("click", () => go(b)); });
    const first = btns.find(b => b.getAttribute("aria-selected") === "true") || btns[0];
    if (first) requestAnimationFrame(() => go(first));
  };

  UI.steps = function (el, n) {
    const items = $$("li", el);
    items.forEach((li, i) => { li.classList.toggle("done", i < n); li.classList.toggle("cur", i === n); });
  };

  UI.range = function (input) {
    const paint = () => input.parentNode.style.setProperty("--p", ((input.value - input.min) / (input.max - input.min) * 100) + "%");
    const out = input.closest(".ui-range")?.querySelector("[data-out]");
    const upd = () => { paint(); if (out) out.textContent = input.value; input.style.setProperty("--p", ((input.value - input.min) / (input.max - input.min) * 100) + "%"); };
    input.addEventListener("input", upd); upd();
  };

  UI.pager = function (el, total, onPage) {
    let cur = 1;
    const draw = () => {
      el.innerHTML = "";
      const mk = (label, p, extra) => { const b = document.createElement("button"); b.textContent = label; b.disabled = !!extra?.disabled; if (p === cur) b.setAttribute("aria-current", "page"); b.onclick = () => go(p); return b; };
      el.appendChild(mk("‹", cur - 1, { disabled: cur === 1 }));
      for (let p = 1; p <= total; p++) el.appendChild(mk(String(p), p));
      el.appendChild(mk("›", cur + 1, { disabled: cur === total }));
    };
    const go = p => { if (p < 1 || p > total) return; cur = p; draw(); onPage && onPage(p); };
    draw();
    return { go };
  };

  /* 可重複呼叫：每個元件只會啟用一次 */
  UI.init = function (root = document) {
    const once = (sel, fn) => $$(sel, root).forEach(el => { if (el.dataset.uiOn) return; el.dataset.uiOn = "1"; fn(el); });
    once("[data-ui=select]", UI.select);
    once("[data-ui=stars]", el => UI.stars(el));
    once("[data-ui=drop]", el => UI.drop(el));
    once("[data-ui=seg]", el => UI.seg(el));
    once("[data-ui=range]", el => UI.range(el.querySelector("input") || el));
    once("[data-ui=modal]", el => { el._ui = UI.modal(el); });
    return root;
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => UI.init());
  else UI.init();
})();
