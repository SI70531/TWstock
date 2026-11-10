/* TWstock app shell: builds the floating bottom pill from the dashboard tabs.
   The pill is a view of the existing .dtabs, so clicking it runs the same tab switch. */
(function () {
  var ICONS = {
    dpOverview: '<path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    dpWatch: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    dpStock: '<path d="M6 4v4M6 12v8M12 6v10M18 3v5M18 12v9"/>',
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
