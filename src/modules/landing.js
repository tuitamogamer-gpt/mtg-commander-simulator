// Lightweight presentation shared by first arrival and the in-game home route.
// Preview images are captures of the real Command Table with Scryfall artwork.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function (U) {
  U.landingCounts = () => ({
    decks: U.DECKS ? Object.values(U.DECKS).filter(deck => !deck.custom).length : U.CATALOG_SUMMARY.decks,
    // The loaded catalog counts every importable card only once it is complete.
    importableCards: U.CARD_CATALOG && U.oracleCatalogComplete?.() !== false
      ? Object.values(U.CARD_CATALOG).filter(card => card.deckImportEligible).length : U.CATALOG_SUMMARY.importableCards,
  });
  U.syncLandingCounts = page => {
    const counts = U.landingCounts();
    page.querySelectorAll('[data-catalog-decks]').forEach(node => { node.textContent = String(counts.decks); });
    page.querySelectorAll('[data-catalog-cards]').forEach(node => { node.textContent = counts.importableCards.toLocaleString('en-US'); });
    page.querySelector('.mainmenu-visual-foot [data-menu-action="solo"]')?.setAttribute('aria-label', `Explore all ${counts.decks} Commander decks`);
  };
  U.landingDetailsMarkup = (deckCount = U.landingCounts().decks) => `
    <section class="mainmenu-proof" aria-label="Product details">
      <div class="mainmenu-proof-stat"><strong data-catalog-decks data-count-up>${Number(deckCount)}</strong><span><b>Complete decks</b><small>Find your playstyle</small></span></div>
      <div class="mainmenu-proof-stat"><strong data-count-up>4</strong><span><b>Seats at the table</b><small>The full Commander pod</small></span></div>
      <div class="mainmenu-proof-stat"><strong data-catalog-cards data-count-up>${U.landingCounts().importableCards.toLocaleString('en-US')}</strong><span><b>Importable cards</b><small>Build your own deck</small></span></div>
      <div class="mainmenu-livecheck" data-live-state="checking" role="status" aria-live="polite"><i aria-hidden="true"></i><span><b>Checking Live rooms</b><small>Solo play is always available</small></span></div>
    </section>

    <section class="mainmenu-statement" aria-label="What you can play here">
      <p>Four-player Commander in your browser. Tested decks, visible priority and stack decisions, local AI opponents, and private Live rooms.</p>
    </section>

    <section id="featured-decks" class="mainmenu-collection" aria-labelledby="collection-title">
      <header class="mainmenu-collection-head"><div><h2 id="collection-title">Find your next deck</h2><p>Try a featured commander, or explore the full collection.</p></div><button type="button" data-menu-action="solo">All <span data-catalog-decks>${Number(deckCount)}</span> decks <span aria-hidden="true"><svg class="ui-arrow-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 18 18 6M6 6h12v12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg></span></button></header>
      <div class="mainmenu-deck-grid">
        <button type="button" class="mainmenu-featured-deck" data-menu-action="solo" data-menu-deck="Elven Council" aria-label="Choose Elven Council, led by Galadriel, Elven-Queen">
          <span class="mainmenu-deck-art"><img src="./assets/cards/art/galadriel-elven-queen-efb29b8818.webp" width="626" height="457" loading="lazy" decoding="async" alt="Galadriel, Elven-Queen"><span aria-hidden="true"><svg class="ui-arrow-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 18 18 6M6 6h12v12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg></span></span>
          <span class="mainmenu-deck-colors"><img src="./assets/mana/G.svg" alt="Green"><img src="./assets/mana/U.svg" alt="Blue"><span>ELVES &amp; POLITICS</span></span><b>Elven Council</b><span class="mainmenu-deck-description">Build your fellowship. Make the table choose.</span>
        </button>
        <button type="button" class="mainmenu-featured-deck" data-menu-action="solo" data-menu-deck="Planar Portal" aria-label="Choose Planar Portal, led by Prosper, Tome-Bound">
          <span class="mainmenu-deck-art"><img src="./assets/cards/art/prosper-tome-bound-afb30a621f.webp" width="626" height="457" loading="lazy" decoding="async" alt="Prosper, Tome-Bound"><span aria-hidden="true"><svg class="ui-arrow-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 18 18 6M6 6h12v12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg></span></span>
          <span class="mainmenu-deck-colors"><img src="./assets/mana/B.svg" alt="Black"><img src="./assets/mana/R.svg" alt="Red"><span>EXILE &amp; TREASURE</span></span><b>Planar Portal</b><span class="mainmenu-deck-description">Turn the unknown into your next advantage.</span>
        </button>
        <button type="button" class="mainmenu-featured-deck" data-menu-action="solo" data-menu-deck="The Ruinous Powers" aria-label="Choose The Ruinous Powers, led by Abaddon the Despoiler">
          <span class="mainmenu-deck-art"><img src="./assets/cards/art/abaddon-the-despoiler-b709a97527.webp" width="626" height="457" loading="lazy" decoding="async" alt="Abaddon the Despoiler"><span aria-hidden="true"><svg class="ui-arrow-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 18 18 6M6 6h12v12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg></span></span>
          <span class="mainmenu-deck-colors"><img src="./assets/mana/U.svg" alt="Blue"><img src="./assets/mana/B.svg" alt="Black"><img src="./assets/mana/R.svg" alt="Red"><span>CHAOS &amp; CASCADE</span></span><b>The Ruinous Powers</b><span class="mainmenu-deck-description">One spell. A chain reaction. Let chaos reign.</span>
        </button>
      </div>
    </section>

    <div class="mainmenu-marquee" aria-hidden="true"><div><span>Choose a deck</span><i></i><span>Build your pod</span><i></i><span>Play your turn</span><i></i><span>Choose a deck</span><i></i><span>Build your pod</span><i></i><span>Play your turn</span><i></i></div></div>

    <section id="how-it-works" class="mainmenu-path" aria-labelledby="first-pod-title">
      <div class="mainmenu-path-copy"><span>FIRST TIME HERE?</span><h2 id="first-pod-title">From deck to table</h2><p>Three steps to your first game.</p><button type="button" data-menu-action="tour">Open the first-game guide <span aria-hidden="true"><svg class="ui-arrow-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 18 18 6M6 6h12v12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg></span></button></div>
      <ol class="mainmenu-path-steps">
        <li><span aria-hidden="true">01</span><div><b>Choose your deck</b><p>Browse precons or open My Library to use an imported deck.</p></div></li>
        <li><span aria-hidden="true">02</span><div><b>Set up your table</b><p>Pick opponents, their decks, and the difficulty.</p></div></li>
        <li><span aria-hidden="true">03</span><div><b>Play at your pace</b><p>Review your opening hand. Follow clear prompts for each decision.</p></div></li>
      </ol>
    </section>

    <section id="the-table" class="mainmenu-showcase" aria-labelledby="table-preview-title">
      <div class="mainmenu-preview">
      <header class="mainmenu-section-head">
        <span class="mainmenu-eyebrow">THE TABLE</span>
        <div><h2 id="table-preview-title">Your battlefield, at a glance</h2></div>
        <p>See every opponent, follow the stack, and take your next action.</p>
      </header>
      <figure class="mainmenu-preview-frame">
        <div class="mainmenu-preview-bar"><span><i aria-hidden="true"></i>COMMAND TABLE <small>Interface preview</small></span><div class="mainmenu-preview-controls" role="group" aria-label="Choose an interface preview"><button type="button" data-table-preview="table" aria-pressed="true" aria-controls="table-preview-image">Table</button><button type="button" data-table-preview="focus" aria-pressed="false" aria-controls="table-preview-image">Focus</button></div><span class="mainmenu-preview-phone-label">MOBILE VIEW</span></div>
        <picture>
          <source media="(max-width: 600px)" srcset="./assets/menu/command-mobile-preview.jpg" width="390" height="844">
          <img id="table-preview-image" src="./assets/menu/command-table-preview.jpg" width="1440" height="1024" loading="lazy" decoding="async" alt="Commander game with Scryfall card art, public battlefields, your hand, and the next decision alongside the table.">
        </picture>
        <figcaption><span class="mainmenu-preview-caption" aria-live="polite">Table view keeps all three opponents beside your battlefield and decision panel.</span><span class="mainmenu-preview-mobile-caption">A focused battlefield, seat switcher, and reachable actions on your phone.</span><span>Captured in the game · Scryfall card images</span></figcaption>
      </figure>
      <div class="mainmenu-preview-notes"><p><b>The whole pod</b><span>Life totals, commanders, and public zones in one place.</span></p><p><b>A clear next step</b><span>Priority, targets, and combat stay beside the action.</span></p><p><b>Your screen, your view</b><span>A full table on desktop. Focused controls on mobile.</span></p></div>
      </div>
    </section>

    <section class="mainmenu-finale" aria-labelledby="finale-title">
      <span class="mainmenu-eyebrow">TAKE YOUR SEAT</span>
      <h2 id="finale-title">Your table is ready.</h2>
      <p>Pick a deck, set the pod, and play your first turn.</p>
      <div class="mainmenu-finale-actions">
        <button type="button" class="mainmenu-finale-primary" data-menu-action="solo"><b>Play solo</b><i aria-hidden="true">→</i></button>
        <button type="button" class="mainmenu-finale-secondary" data-menu-action="live"><b>Play with friends</b><em class="mainmenu-beta">Beta</em></button>
      </div>
    </section>

    <footer class="mainmenu-footer"><div><b>COMMANDER SIMULATOR</b><span>Free, browser-based fan project. Card data and images are provided through Scryfall.</span><a href="#landing-top">Back to top ↑</a></div><p>Commander Simulator is unofficial Fan Content permitted under the <a href="https://company.wizards.com/en/legal/fancontentpolicy" target="_blank" rel="noreferrer">Fan Content Policy</a>. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.</p></footer>`;

  // ---------- Scroll motion ----------
  // One small engine for the landing page and the setup steps. It tags the
  // elements it animates itself (data-reveal), so a page without JavaScript,
  // a page with reduced motion and anything rendered later stay fully visible.
  // Scroll-linked values are unitless custom properties, eased towards the
  // scroll position, and every rule that reads them has a resting default:
  //   --enter  0 as the element's top meets the bottom of the screen, 1 near the top
  //   --exit   0 at rest, 1 once the element has scrolled away above the screen
  //   --view   0 to 1 across the element's whole pass through the screen
  //   --line   0 to 1 as a line at 72% of the screen travels down the element
  //   --page-p 0 to 1 over the page (on the scope element)
  let scrollMotion = null;
  const revealedOnce = new WeakSet();
  const countedOnce = new WeakSet();
  const clamp01 = value => Math.min(1, Math.max(0, value));
  U.scrollMotionAllowed = () => !document.body.classList.contains('reduced-motion')
    && !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  U.bindScrollMotion = (root, config = {}) => {
    if (scrollMotion) scrollMotion.destroy();
    scrollMotion = null;
    if (!root || typeof IntersectionObserver !== 'function' || typeof requestAnimationFrame !== 'function') return null;
    const animated = U.scrollMotionAllowed();
    const scope = config.scope || root;
    const cleanup = [];
    const timers = new Set();
    const later = (run, delay) => {
      const id = setTimeout(() => { timers.delete(id); run(); }, delay);
      timers.add(id);
    };
    let frame = 0;
    let destroyed = false;

    // Reveals: tagged here, shown when they meet the screen, then untagged so
    // the element's own hover and focus transitions are its own again.
    const settle = element => {
      element.removeAttribute('data-reveal');
      element.classList.remove('is-in');
      element.style.removeProperty('--reveal-delay');
    };
    const reveal = element => {
      if (!element.hasAttribute('data-reveal') || element.classList.contains('is-in')) return;
      revealedOnce.add(element);
      element.classList.add('is-in');
      later(() => settle(element), (parseFloat(element.style.getPropertyValue('--reveal-delay')) || 0) + 1100);
    };
    if (animated) {
      root.classList.add('sm-ready');
      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          reveal(entry.target);
        }
      }, { rootMargin: '0px 0px -7% 0px' });
      cleanup.push(() => observer.disconnect());
      for (const [selector, kind = 'rise', step = 80] of config.reveal || []) {
        const groups = new Map();
        root.querySelectorAll(selector).forEach(element => {
          if (element.hasAttribute('data-reveal') || (!config.replay && revealedOnce.has(element))) return;
          const index = groups.get(element.parentNode) || 0;
          groups.set(element.parentNode, index + 1);
          element.dataset.reveal = kind;
          element.style.setProperty('--reveal-delay', `${Math.min(index * step, 480)}ms`);
          observer.observe(element);
        });
      }
      // Keyboard focus never lands on something still waiting to appear.
      const onFocus = event => {
        for (let node = event.target; node && node !== root; node = node.parentElement) {
          if (node.hasAttribute?.('data-reveal')) reveal(node);
        }
      };
      root.addEventListener('focusin', onFocus);
      cleanup.push(() => root.removeEventListener('focusin', onFocus));

      // Numbers count up to the figure they already show.
      const counter = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          counter.unobserve(entry.target);
          const element = entry.target;
          const finalText = element.textContent;
          const target = Number(finalText.replace(/[^\d]/g, ''));
          if (!Number.isFinite(target) || target < 2) continue;
          const grouped = /,/.test(finalText);
          const start = performance.now();
          const duration = 1300;
          let written = finalText;
          const step = now => {
            // Another writer (a catalog count that arrived) owns the text now.
            if (destroyed || element.textContent !== written) return;
            const t = clamp01((now - start) / duration);
            const value = Math.round(target * (1 - Math.pow(1 - t, 4)));
            written = t >= 1 ? finalText : grouped ? value.toLocaleString('en-US') : String(value);
            element.textContent = written;
            if (t < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      }, { rootMargin: '0px 0px -7% 0px' });
      cleanup.push(() => counter.disconnect());
      if (config.count) root.querySelectorAll(config.count).forEach(element => {
        if (countedOnce.has(element)) return;
        countedOnce.add(element);
        counter.observe(element);
      });

      // A statement lights up word by word (--i of --n, read against --enter).
      for (const selector of config.words || []) {
        root.querySelectorAll(selector).forEach(element => {
          if (element.dataset.words) return;
          const words = element.textContent.trim().split(/\s+/);
          element.textContent = '';
          words.forEach((word, index) => {
            const span = document.createElement('span');
            span.textContent = word;
            span.style.setProperty('--i', String(index));
            element.append(span, index < words.length - 1 ? ' ' : '');
          });
          element.style.setProperty('--n', String(words.length));
          element.dataset.words = String(words.length);
        });
      }
    }

    const tracked = [];
    if (animated) {
      for (const selector of config.track || []) {
        root.querySelectorAll(selector).forEach(element => tracked.push({ element, current: null, target: [0, 0, 0, 0] }));
      }
    }
    const lit = animated ? (config.lit || []).flatMap(selector => [...root.querySelectorAll(selector)]) : [];
    const spyLinks = config.spy ? [...root.querySelectorAll(config.spy)] : [];
    const spyTarget = link => root.querySelector(link.dataset.spy);

    const names = ['--enter', '--exit', '--view', '--line'];
    const read = () => {
      // A step that is not on screen (the table has opened) has nothing to follow.
      if (!root.getClientRects().length) return;
      const view = window.innerHeight || 1;
      const page = document.documentElement;
      const range = page.scrollHeight - page.clientHeight;
      scope.style.setProperty('--page-p', (range > 0 ? clamp01(page.scrollTop / range) : 0).toFixed(4));
      scope.classList.toggle('is-scrolled', page.scrollTop > 16);
      const rootTop = root.getBoundingClientRect().top;
      for (const item of tracked) {
        const rect = item.element.getBoundingClientRect();
        if (!rect.height) continue;
        const anchor = Math.min(rect.top - rootTop, view * 0.15);
        item.target = [
          clamp01((view - rect.top) / (view * 0.85)),
          clamp01((anchor - rect.top) / rect.height),
          clamp01((view - rect.top) / (view + rect.height)),
          clamp01((view * 0.72 - rect.top) / rect.height),
        ];
      }
      for (const element of lit) element.classList.toggle('is-lit', element.getBoundingClientRect().top < view * 0.72);
      let current = null;
      for (const link of spyLinks) {
        const target = spyTarget(link);
        const shown = !!target && target.getClientRects().length > 0;
        link.hidden = !shown;
        // At the end of the page the last chapter is current, however short it is.
        if (shown && (!current || target.getBoundingClientRect().top <= view * 0.42 || (range > 0 && page.scrollTop >= range - 2))) current = link;
      }
      for (const link of spyLinks) {
        link.classList.toggle('is-current', link === current);
        if (link === current) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      }
    };
    const tick = () => {
      frame = 0;
      if (destroyed) return;
      if (!root.isConnected) { api.destroy(); return; }
      let moving = false;
      for (const item of tracked) {
        const first = !item.current;
        if (first) item.current = [-1, -1, -1, -1];
        item.target.forEach((goal, index) => {
          const before = item.current[index];
          let value = first ? goal : before + (goal - before) * 0.16;
          if (Math.abs(goal - value) < 0.0015) value = goal;
          else moving = true;
          if (value !== before) {
            item.current[index] = value;
            item.element.style.setProperty(names[index], value.toFixed(4));
          }
        });
      }
      if (moving) frame = requestAnimationFrame(tick);
    };
    const refresh = () => {
      if (destroyed) return;
      read();
      if (!frame) frame = requestAnimationFrame(tick);
    };
    window.addEventListener('scroll', refresh, { passive: true });
    window.addEventListener('resize', refresh, { passive: true });
    cleanup.push(() => window.removeEventListener('scroll', refresh), () => window.removeEventListener('resize', refresh));

    for (const link of spyLinks) {
      link.onclick = event => {
        const target = spyTarget(link);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: U.scrollMotionAllowed() ? 'smooth' : 'auto', block: 'start' });
        const heading = target.querySelector('h2, h3, [tabindex]') || target;
        if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      };
    }

    const api = {
      refresh,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        if (frame) cancelAnimationFrame(frame);
        timers.forEach(clearTimeout);
        cleanup.forEach(run => run());
        root.classList.remove('sm-ready');
        root.querySelectorAll('[data-reveal]').forEach(element => { revealedOnce.add(element); settle(element); });
        if (scrollMotion === api) scrollMotion = null;
      },
    };
    scrollMotion = api;
    refresh();
    return api;
  };

  // The landing page: what rises, what follows the scroll, what counts up.
  U.bindLandingMotion = page => {
    if (!page.querySelector('.mainmenu-progress')) {
      const progress = document.createElement('i');
      progress.className = 'mainmenu-progress';
      progress.setAttribute('aria-hidden', 'true');
      page.prepend(progress);
    }
    const hero = page.querySelector('.mainmenu-hero');
    if (hero && !hero.querySelector('.mainmenu-scrollcue')) {
      const cue = document.createElement('span');
      cue.className = 'mainmenu-scrollcue';
      cue.setAttribute('aria-hidden', 'true');
      cue.innerHTML = '<i></i>Scroll';
      hero.appendChild(cue);
    }
    return U.bindScrollMotion(page, {
      reveal: [
        ['.returningplayer', 'rise'],
        ['.mainmenu-proof > div', 'rise', 90],
        ['.mainmenu-collection-head > *', 'rise', 90],
        ['.mainmenu-featured-deck', 'rise', 120],
        ['.mainmenu-path-copy > *', 'rise', 70],
        ['.mainmenu-section-head > *', 'rise', 80],
        ['.mainmenu-preview-notes > p', 'rise', 110],
        ['.mainmenu-finale > *', 'rise', 90],
        ['.mainmenu-footer > *', 'fade', 90],
      ],
      track: ['.mainmenu-hero', '.mainmenu-statement', '.mainmenu-featured-deck', '.mainmenu-marquee', '.mainmenu-path-steps', '.mainmenu-preview-frame', '.mainmenu-finale'],
      lit: ['.mainmenu-path-steps > li'],
      words: ['.mainmenu-statement > p'],
      count: '[data-count-up]',
    });
  };

  U.bindLandingPreview = page => {
    document.body.classList.toggle('reduced-motion', U.readPreference('mtgReducedMotion', 0) === 1);
    const hero = page.querySelector('.mainmenu-hero');
    const proof = page.querySelector('.mainmenu-proof');
    if (hero && proof && hero.nextElementSibling !== proof) hero.after(proof);
    U.bindLandingMotion(page);
    const frame = page.querySelector('.mainmenu-preview-frame');
    if (!frame) return;
    const image = frame.querySelector('#table-preview-image');
    const caption = frame.querySelector('.mainmenu-preview-caption');
    const descriptions = {
      table: 'Table view keeps all three opponents beside your battlefield and decision panel.',
      focus: 'Focus view gives one opponent more room while keeping every seat available above it.',
    };
    frame.querySelectorAll('[data-table-preview]').forEach(button => {
      // Assignment also makes rebinding an existing boot shell idempotent.
      button.onclick = () => {
        const view = button.dataset.tablePreview;
        if (!Object.hasOwn(descriptions, view)) return;
        image.src = `./assets/menu/command-${view}-preview.jpg`;
        caption.textContent = descriptions[view];
        frame.querySelectorAll('[data-table-preview]').forEach(control => control.setAttribute('aria-pressed', String(control === button)));
      };
    });
  };
})(MTG);
