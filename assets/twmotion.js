/* Shared motion layer (the same code in TWstock and EZexams; only CONFIG differs). It adds what the two animation
   guides ask for and that the pages did not have yet:
     1. popups, menus and tooltips that had no entrance get one: 180ms ease-out, growing from where they were opened
     2. press feedback on anything pressable that had none
     3. the content of a <details> fades in when it opens
     4. nothing animates when the keyboard did it (shortcuts and tab arrows are used too often to wait for)
     5. endless animations pause while they are off screen
   It never replaces an animation that is already there. */
(function () {
  "use strict";
  if (!document.body || !document.body.animate) return;
  const CONFIG = {
    /* [selector, kind, transform-origin] kind: menu | tip | dialog */
    popups: [
      [".ctxmenu", "menu"], [".ssug", "menu", "top center"], [".cpsug", "menu", "top right"], [".hmcard", "menu", "center"],
      [".kbhelp", "dialog"], [".pal-box", "dialog"], [".fxshare-box", "dialog"], [".ixdetail", "menu", "top center"],
      [".ktip", "tip"], [".hmtip", "tip"], [".fxpeek", "menu"], [".toast", "menu", "bottom right"],
    ],
    shortcut: (e, typing) => ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") || e.key === "Escape" ||
      (!typing && (/^[1-9/?]$/.test(e.key) || (/^Arrow/.test(e.key) && !!(e.target.closest && e.target.closest(".dtabs, [role=tablist]"))))),
  };
  const calm = { matches: false };
  const root = document.documentElement;

  const css = document.createElement("style");
  css.textContent = `
:root { --motion-out: cubic-bezier(.23, 1, .32, 1); --motion-in-out: cubic-bezier(.77, 0, .175, 1); }
/* zero specificity: anything that already has its own transition or press style keeps it */
:where(button, [role="button"], [role="tab"], summary) { transition: scale 140ms var(--motion-out); }
:where(button, [role="button"], summary):where(:active:not(:disabled)) { scale: .97; }
html.kb-now *, html.kb-now *::before, html.kb-now *::after { transition-duration: 0s !important; transition-delay: 0s !important; }
`;
  document.head.insertBefore(css, document.head.firstChild);

  /* ---------- keyboard ---------- */
  let kbUntil = 0, kbTimer = 0;
  const byKeyboard = () => performance.now() < kbUntil;
  addEventListener("keydown", e => {
    const t = e.target, typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ""));
    if (!CONFIG.shortcut(e, typing)) return;
    kbUntil = performance.now() + 450; root.classList.add("kb-now");
    clearTimeout(kbTimer); kbTimer = setTimeout(() => root.classList.remove("kb-now"), 450);
  }, true);
  addEventListener("pointerdown", () => { kbUntil = 0; root.classList.remove("kb-now"); }, true);

  /* ---------- entrances for popups that have none ---------- */
  const KIND = { menu: [180, .96, -4], tip: [125, 1, 0], dialog: [220, .96, 8] };
  const shownState = new WeakMap();
  const visible = el => el.isConnected && !el.hidden && el.getClientRects().length > 0;
  function enter(el, kind, origin) {
    const was = shownState.get(el), now = visible(el);
    shownState.set(el, now);
    if (!now || was) return;
    /* its own entrance (CSS or script) wins */
    if (el.getAnimations().length) return;
    const [ms, from, dy] = KIND[kind];
    if (origin && !el.style.transformOrigin) el.style.transformOrigin = origin;
    const still = calm.matches;
    el.animate(still ? [{ opacity: 0 }, { opacity: getComputedStyle(el).opacity }]
      : [{ opacity: 0, scale: String(from), translate: "0 " + dy + "px" }, { opacity: getComputedStyle(el).opacity, scale: "1", translate: "0 0" }],
      { duration: ms, easing: "cubic-bezier(.23,1,.32,1)" });
  }
  const sweep = () => CONFIG.popups.forEach(([sel, kind, origin]) => document.querySelectorAll(sel).forEach(el => enter(el, kind, origin)));
  const ANY = CONFIG.popups.map(p => p[0]).join(",");
  let queued = false;
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; sweep(); }); } };
  new MutationObserver(list => {
    if (list.some(m => (m.type === "attributes" ? m.target.matches(ANY) || !!m.target.querySelector(ANY)
      : [...m.addedNodes, ...m.removedNodes].some(n => n.nodeType === 1 && (n.matches(ANY) || !!n.querySelector(ANY)))))) queue();
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "open"] });
  /* a popup that closed must be able to come in again */
  sweep();

  /* ---------- <details> ---------- */
  document.addEventListener("toggle", e => {
    const d = e.target; if (!d || d.tagName !== "DETAILS" || !d.open || byKeyboard()) return;
    [...d.children].forEach((c, i) => {
      if (c.tagName === "SUMMARY" || c.getAnimations().length) return;
      c.animate(calm.matches ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, translate: "0 -6px" }, { opacity: 1, translate: "0 0" }],
        { duration: 200, delay: Math.min(i - 1, 4) * 40, easing: "cubic-bezier(.23,1,.32,1)", fill: "backwards" });
    });
  }, true);

  /* ---------- endless animations rest while off screen ---------- */
  if (window.IntersectionObserver && document.getAnimations) {
    const paused = new WeakMap(), watched = new Set(), onScreen = new WeakMap();
    /* read from the document's list: animations on ::before / ::after are not returned by the element itself */
    const apply = (el, list) => list.forEach(a => {
      if (!a.effect || a.effect.target !== el || a.effect.getComputedTiming().iterations !== Infinity) return;
      if (onScreen.get(el) === false) { if (a.playState === "running") { a.pause(); paused.set(a, true); } }
      else if (paused.get(a)) { paused.delete(a); a.play(); }
    });
    const io = new IntersectionObserver(es => es.forEach(en => { onScreen.set(en.target, en.isIntersecting); apply(en.target, document.getAnimations()); }), { rootMargin: "120px" });
    setInterval(() => {
      if (document.hidden) return;
      const all = document.getAnimations();
      all.forEach(a => {
        const el = a.effect && a.effect.target;
        if (el && !watched.has(el) && a.effect.getComputedTiming().iterations === Infinity) { watched.add(el); io.observe(el); }
      });
      watched.forEach(el => { if (!el.isConnected) { io.unobserve(el); watched.delete(el); } else apply(el, all); });
    }, 2000);
  }
})();
