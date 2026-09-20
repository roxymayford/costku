/* ==========================================================================
   OTP PLAN — Interaksi
   Scroll progress · reveal on scroll · active section in rail · back to top
   ========================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. Reveal on scroll ---------- */
  var revealEls = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  if (!('IntersectionObserver' in window) || reduceMotion) {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    revealEls.forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i % 6, 5) * 45 + 'ms';
      revealObserver.observe(el);
    });
  }

  /* ---------- 2. Scroll progress hairline ---------- */
  var progress = document.getElementById('progress');
  var totop = document.getElementById('totop');

  var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id]'));
  var railLinks = Array.prototype.slice.call(document.querySelectorAll('#rail a'));

  function onScroll() {
    var docH = document.documentElement.scrollHeight - window.innerHeight;
    var y = window.scrollY || document.documentElement.scrollTop;
    var p = docH > 0 ? (y / docH) * 100 : 0;

    if (progress) progress.style.width = p + '%';
    if (totop) totop.classList.toggle('is-visible', y > 600);

    /* active section — the last one whose top passed the offset line */
    var offset = window.innerHeight * 0.32;
    var current = '';
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top <= offset) current = sections[i].id;
    }
    railLinks.forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('href') === '#' + current);
    });

    /* keep active rail item visible in the horizontal rail */
    var active = document.querySelector('#rail a.is-active');
    if (active && active.parentElement) {
      var rail = active.parentElement;
      if (rail.scrollWidth > rail.clientWidth) {
        var target = active.offsetLeft - rail.clientWidth / 2 + active.offsetWidth / 2;
        rail.scrollTo({ left: Math.max(0, target), behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(function () { onScroll(); ticking = false; });
    }
  }, { passive: true });

  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  /* ---------- 3. Back to top ---------- */
  if (totop) {
    totop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  /* ---------- 4. Anchor offset compensation for sticky header ---------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    if (!id) return;
    var target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    var head = document.querySelector('.masthead');
    var railH = document.querySelector('.rail');
    var offset = (head ? head.offsetHeight : 0) + (railH ? railH.offsetHeight : 0) - 6;
    var top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  });
})();
