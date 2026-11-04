/* TWstock app shell: builds the floating bottom pill from the dashboard tabs.
   The pill is a view of the existing .dtabs, so clicking it runs the same tab switch. */
(function () {
  var ICONS = {
    dpOverview: '<path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    dpTrend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    dpSector: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9h9"/>',
    dpFlow: '<path d="M4 6h16M4 12h10M4 18h6"/>',
    dpRank: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    dpStock: '<path d="M6 4v4M6 12v8M12 6v10M18 3v5M18 12v9"/>',
    dpNews: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>',
    dpEvent: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    dpQuote: '<rect x="3" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="4" width="8" height="7" rx="1.5"/><rect x="3" y="13" width="8" height="7" rx="1.5"/><rect x="13" y="13" width="8" height="7" rx="1.5"/>',
    dpChart: '<path d="M4 20V4M4 16l4-4 3 3 5-6 4 3"/>',
    dpCalc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>',
    dpSim: '<path d="M3 7h13l-3-3M21 17H8l3 3"/>',
    dpRisk: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    dpPerf: '<path d="M3 17l5-5 4 4 8-8"/><path d="M15 8h6v6"/>',
    dpAlert: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 21h4"/>',
    dpHold: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9h9"/>',
    dpFear: '<path d="M3 15a9 9 0 0118 0"/><path d="M12 15l4-5"/>',
    dpList: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    dpFund: '<path d="M4 20h16M6 20V10h3v10M11 20V4h3v16M16 20v-7h3v7"/>',
    dpDiv: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 010 3.6h-3a1.8 1.8 0 000 3.6h4"/>',
    dpChip: '<path d="M4 6h16M4 12h10M4 18h6"/>',
    dpScreen: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
    dpCmp: '<path d="M8 4v16M16 4v16M4 8h8M12 16h8"/>',
    dpSet: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
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
