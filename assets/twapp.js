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
    dpEvent: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'
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
