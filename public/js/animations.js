/* GrowthBox — motion layer: scroll reveals, counters, header, hero entrance */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Tag elements for reveal ----------
  function tag(el, variant, delay) {
    if (!el || el.hasAttribute('data-reveal')) return;
    el.setAttribute('data-reveal', variant || 'up');
    if (delay) el.style.setProperty('--rd', delay + 'ms');
  }

  // Stagger children within each parent matching parentSel
  function staggerChildren(parentSel, variant, step) {
    document.querySelectorAll(parentSel).forEach(function (parent) {
      Array.prototype.slice.call(parent.children).forEach(function (child, i) {
        tag(child, variant, i * (step || 90));
      });
    });
  }
  // Tag each standalone element (no stagger)
  function each(sel, variant) {
    document.querySelectorAll(sel).forEach(function (el) { tag(el, variant, 0); });
  }

  // Section headings + standalone blocks
  each('.section-head', 'up');
  each('.cta-banner', 'zoom');
  each('.final-cta', 'up');
  each('.contact-info-card', 'right');
  each('.contact-form', 'left');
  each('.funnel-circle', 'zoom');
  each('.page-hero .crumb', 'up');
  each('.page-hero h1', 'up');
  each('.page-hero p', 'up');

  // Split media / text
  document.querySelectorAll('.split').forEach(function (split) {
    var cols = split.children;
    tag(cols[0], 'left', 0);
    if (cols[1]) tag(cols[1], 'right', 120);
  });

  // Grids and lists (staggered)
  staggerChildren('.grid-3', 'up', 90);
  staggerChildren('.grid-2', 'up', 90);
  staggerChildren('.seo-grid', 'zoom', 100);
  staggerChildren('.stats-grid', 'up', 90);
  staggerChildren('.funnel-items', 'up', 70);
  staggerChildren('.logo-strip', 'up', 55);
  document.querySelectorAll('.feature-row').forEach(function (row, i) {
    tag(row, 'up', (i % 3) * 70);
  });

  // Inner-page elements
  staggerChildren('.checklist', 'left', 100);
  staggerChildren('.why-list', 'up', 90);
  staggerChildren('.job-list', 'up', 80);
  staggerChildren('.process-row', 'up', 70);
  // NB: do NOT transform-reveal .process-node — they rely on their own
  // positioning transform to sit around the ring. Fade the whole ring instead.
  each('.process-ring', 'fade');
  each('.svc-hero-title', 'up');
  each('.svc-hero-visual', 'left');
  each('.lead-h', 'up');

  // ---------- Reveal on scroll ----------
  var revealEls = document.querySelectorAll('[data-reveal]');
  if (reduce || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  // ---------- Hero entrance ----------
  var hero = document.querySelector('.hero');
  if (hero) {
    hero.classList.add('hero-ready');
    var heroCopy = hero.querySelector('.hero-copy');
    if (heroCopy && !reduce) {
      Array.prototype.slice.call(heroCopy.children).forEach(function (child, i) {
        child.style.opacity = 0;
        child.style.transform = 'translateY(24px)';
        child.style.transition = 'opacity .6s ease, transform .6s ease';
        child.style.transitionDelay = (120 + i * 130) + 'ms';
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            child.style.opacity = 1;
            child.style.transform = 'none';
          });
        });
      });
    }
  }

  // ---------- Header shrink on scroll ----------
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () {
      if (window.scrollY > 20) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---------- Animated counters ----------
  function animateCounter(el) {
    var raw = el.textContent.trim();
    var match = raw.match(/^(\D*)(\d[\d,]*)(.*)$/);
    if (!match) return;
    var prefix = match[1], target = parseInt(match[2].replace(/,/g, ''), 10), suffix = match[3];
    if (reduce) { return; }
    var dur = 1400, start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased).toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var counters = document.querySelectorAll('.stat .value');
  if (counters.length) {
    if (reduce || !('IntersectionObserver' in window)) {
      // leave as-is
    } else {
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { animateCounter(entry.target); cio.unobserve(entry.target); }
        });
      }, { threshold: 0.6 });
      counters.forEach(function (c) { cio.observe(c); });
    }
  }
})();
