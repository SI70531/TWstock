/* TWstock app shell: builds the floating bottom pill from the dashboard tabs.
   The pill is a view of the existing .dtabs, so clicking it runs the same tab switch. */
(function () {
  var ICONS = {
    dpOverview: '<path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    dpPre: '<path d="M12 3v2M5.6 5.6l1.4 1.4M3 12h2M19 12h2M17 7l1.4-1.4"/><path d="M7 16a5 5 0 0 1 10 0"/><path d="M3 20h18"/>',
    dpList: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    dpWatch: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    dpStock: '<path d="M6 4v4M6 12v8M12 6v10M18 3v5M18 12v9"/>',
    dpCmp: '<path d="M8 4v16M16 4v16M4 8l4-4 4 4M12 16l4 4 4-4"/>',
    dpBt: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5M12 8v5l3 2"/>',
    dpSim: '<circle cx="12" cy="12" r="9"/><path d="M15 9c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2-1.3 0-2.4-.5-3-1.5M12 5.500v2M12 16.500v2"/>',
    dpLog: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 13l2 2 4-4"/>',
    dpScan: '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
    dpHold: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
    dpCal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  };
  var DEFAULT_ICON = '<circle cx="12" cy="12" r="3"/>';

  function init() {
    var tabs = document.querySelector('.dtabs');
    if (!tabs || document.querySelector('.apppill')) return;
    var real = Array.prototype.filter.call(tabs.querySelectorAll('button[role="tab"]'), Boolean);
    if (!real.length) return;

    var nav = document.createElement('nav');
    nav.className = 'apppill';
    nav.setAttribute('aria-label', '主要導覽');
    var hl = document.createElement('i');
    hl.className = 'ap-hl';
    nav.appendChild(hl);

    var items = real.map(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ap-item';
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[t.dataset.p] || DEFAULT_ICON) + '</svg><span></span>';
      b.querySelector('span').textContent = t.textContent.trim();
      b.addEventListener('click', function () { t.click(); });
      nav.appendChild(b);
      return b;
    });
    document.body.appendChild(nav);

    function place() {
      var idx = real.findIndex(function (t) { return t.getAttribute('aria-selected') === 'true'; });
      if (idx < 0) idx = 0;
      items.forEach(function (b, i) { b.setAttribute('aria-current', i === idx ? 'true' : 'false'); });
      var target = items[idx];
      if (target) {
        hl.style.width = target.offsetWidth + 'px';
        hl.style.transform = 'translateX(' + target.offsetLeft + 'px)';
        /* the bar scrolls sideways on a phone: keep the current tab in view */
        nav.scrollLeft = target.offsetLeft - (nav.clientWidth - target.offsetWidth) / 2;
      }
    }

    var mo = new MutationObserver(place);
    real.forEach(function (t) { mo.observe(t, { attributes: true, attributeFilter: ['aria-selected'] }); });
    window.addEventListener('resize', place);
    place();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
