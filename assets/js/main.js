/* =========================================================
   Abraham Andebi - Interactions
   ========================================================= */
(function () {
  'use strict';

  const nav = document.getElementById('nav');
  const burger = document.getElementById('burger');
  const panel = document.getElementById('mobilePanel');
  const brandLogo = document.getElementById('brandLogo');
  const totop = document.getElementById('totop');

  /* ---- Sticky nav: swap logo + style on scroll ---- */
  const onScroll = () => {
    const scrolled = window.scrollY > 40;
    nav.classList.toggle('scrolled', scrolled);
    brandLogo.src = scrolled ? 'assets/img/logo.png' : 'assets/img/logo-white.png';
    totop.classList.toggle('show', window.scrollY > 600);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- Mobile menu ---- */
  const toggleMenu = (open) => {
    const isOpen = open ?? !panel.classList.contains('open');
    panel.classList.toggle('open', isOpen);
    burger.classList.toggle('open', isOpen);
    burger.setAttribute('aria-expanded', String(isOpen));
    document.body.style.overflow = isOpen ? 'hidden' : '';
  };
  burger.addEventListener('click', () => toggleMenu());
  panel.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => toggleMenu(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleMenu(false); });

  /* ---- Back to top ---- */
  totop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  /* ---- Reveal on scroll ---- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('in'));
  }

  /* ---- Count-up stats (runs once when hero meta visible) ---- */
  const counters = document.querySelectorAll('[data-count]');
  const runCount = (el) => {
    const target = +el.dataset.count;
    const suffix = el.dataset.suffix || '';
    const dur = 1400;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(eased * target) + (p === 1 ? suffix : '');
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (counters.length && 'IntersectionObserver' in window) {
    const co = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { runCount(e.target); co.unobserve(e.target); } });
    }, { threshold: 0.6 });
    counters.forEach((c) => co.observe(c));
  } else {
    counters.forEach((c) => (c.textContent = c.dataset.count + (c.dataset.suffix || '')));
  }

  /* ---- Active section highlight in nav ---- */
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-links a');
  if (sections.length && 'IntersectionObserver' in window) {
    const so = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const id = e.target.id;
          navLinks.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === '#' + id));
        }
      });
    }, { threshold: 0.4 });
    sections.forEach((s) => so.observe(s));
  }

  /* ---- Newsletter - submits to FormSubmit (delivers to the pastor's inbox) ---- */
  const form = document.getElementById('newsletterForm');
  if (form) {
    const note = document.getElementById('formNote');
    const btn = form.querySelector('button[type="submit"]');
    const setNote = (msg, color) => { note.textContent = msg; note.style.color = color; };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email');
      if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
        setNote('Veuillez saisir une adresse courriel valide.', '#ffd3a6');
        email.focus();
        return;
      }

      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Envoi…';
      setNote('Inscription en cours…', 'rgba(255,255,255,.6)');

      try {
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: new FormData(form),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        setNote('🙏 Merci ! Votre inscription a bien été enregistrée.', '#e3c879');
        form.reset();
      } catch (err) {
        setNote('Une erreur est survenue. Écrivez-nous à pstabrahamandebi@gmail.com.', '#ffd3a6');
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  }

  /* ---- "En direct" only during real service hours (Chicoutimi / Eastern time) ---- */
  const liveCards = document.querySelectorAll('.service-card[data-service-day]');
  if (liveCards.length) {
    const torontoNow = () => {
      const d = new Date();
      const wk = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', weekday: 'short' }).format(d);
      const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
      const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const [h, m] = hm.split(':').map(Number);
      return { day: days[wk], mins: h * 60 + m };
    };
    const inWindow = (now, day, start, end) => now.day === day && now.mins >= start && now.mins < end;

    const updateLive = () => {
      const now = torontoNow();
      liveCards.forEach((card) => {
        const day = +card.dataset.serviceDay;
        let cardLive = false;
        const sessions = card.querySelectorAll('.sessions li[data-start]');
        if (sessions.length) {
          sessions.forEach((li) => {
            const live = inWindow(now, day, +li.dataset.start, +li.dataset.end);
            li.classList.toggle('live', live);
            if (live) cardLive = true;
          });
        } else if (card.dataset.start) {
          cardLive = inWindow(now, day, +card.dataset.start, +card.dataset.end);
        }
        card.classList.toggle('is-live', cardLive);
      });
    };
    updateLive();
    setInterval(updateLive, 30000);
  }

  /* ---- Lightbox: click a gallery image to enlarge ---- */
  const figs = [...document.querySelectorAll('.gallery-grid figure img')];
  const lb = document.getElementById('lightbox');
  if (figs.length && lb) {
    const lbImg = document.getElementById('lbImg');
    let idx = 0;
    const srcOf = (im) => im.currentSrc || im.src;
    const show = (i) => {
      idx = (i + figs.length) % figs.length;
      lbImg.src = srcOf(figs[idx]);
      lbImg.alt = figs[idx].alt || '';
    };
    const open = (i) => { show(i); lb.classList.add('open'); lb.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; };
    const close = () => { lb.classList.remove('open'); lb.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; };

    figs.forEach((im, i) => { im.addEventListener('click', () => open(i)); });
    document.getElementById('lbClose').addEventListener('click', close);
    document.getElementById('lbNext').addEventListener('click', (e) => { e.stopPropagation(); show(idx + 1); });
    document.getElementById('lbPrev').addEventListener('click', (e) => { e.stopPropagation(); show(idx - 1); });
    lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('lb-stage')) close(); });
    document.addEventListener('keydown', (e) => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') show(idx + 1);
      else if (e.key === 'ArrowLeft') show(idx - 1);
    });
  }

  /* ---- Current year ---- */
  const yr = document.getElementById('year');
  if (yr) yr.textContent = new Date().getFullYear();
})();
