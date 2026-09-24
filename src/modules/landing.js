// Lightweight presentation shared by first arrival and the in-game home route.
// Preview images are captures of the real Command Table with Scryfall artwork.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function (U) {
  U.landingCounts = () => ({
    decks: U.DECKS ? Object.values(U.DECKS).filter(deck => !deck.custom).length : U.CATALOG_SUMMARY.decks,
    importableCards: U.CARD_CATALOG ? Object.values(U.CARD_CATALOG).filter(card => card.deckImportEligible).length : U.CATALOG_SUMMARY.importableCards,
  });
  U.syncLandingCounts = page => {
    const counts = U.landingCounts();
    page.querySelectorAll('[data-catalog-decks]').forEach(node => { node.textContent = String(counts.decks); });
    page.querySelectorAll('[data-catalog-cards]').forEach(node => { node.textContent = counts.importableCards.toLocaleString('en-US'); });
    page.querySelector('.mainmenu-visual-foot [data-menu-action="solo"]')?.setAttribute('aria-label', `Explore all ${counts.decks} Commander decks`);
  };
  U.landingDetailsMarkup = (deckCount = U.landingCounts().decks) => `
    <section class="mainmenu-proof" aria-label="Product details">
      <div class="mainmenu-proof-stat"><strong data-catalog-decks>${Number(deckCount)}</strong><span><b>Complete decks</b><small>Find your playstyle</small></span></div>
      <div class="mainmenu-proof-stat"><strong>4</strong><span><b>Seats at the table</b><small>The full Commander pod</small></span></div>
      <div class="mainmenu-proof-stat"><strong data-catalog-cards>${U.landingCounts().importableCards.toLocaleString('en-US')}</strong><span><b>Importable cards</b><small>Build your own deck</small></span></div>
      <div class="mainmenu-livecheck" data-live-state="checking" role="status" aria-live="polite"><i aria-hidden="true"></i><span><b>Checking Live rooms</b><small>Solo play is always available</small></span></div>
    </section>

    <section id="featured-decks" class="mainmenu-collection" aria-labelledby="collection-title">
      <header class="mainmenu-collection-head"><div><h2 id="collection-title">Find your next deck</h2><p>Try a featured commander, or explore the full collection.</p></div><button type="button" data-menu-action="solo">All <span data-catalog-decks>${Number(deckCount)}</span> decks <span aria-hidden="true">↗</span></button></header>
      <div class="mainmenu-deck-grid">
        <button type="button" class="mainmenu-featured-deck" data-menu-action="solo" data-menu-deck="Elven Council" aria-label="Choose Elven Council, led by Galadriel, Elven-Queen">
          <span class="mainmenu-deck-art"><img src="./assets/cards/art/galadriel-elven-queen-efb29b8818.webp" width="626" height="457" loading="lazy" decoding="async" alt="Galadriel, Elven-Queen"><span aria-hidden="true">↗</span></span>
          <span class="mainmenu-deck-colors"><img src="./assets/mana/G.svg" alt="Green"><img src="./assets/mana/U.svg" alt="Blue"><span>ELVES &amp; POLITICS</span></span><b>Elven Council</b><span class="mainmenu-deck-description">Build your fellowship. Make the table choose.</span>
        </button>
        <button type="button" class="mainmenu-featured-deck" data-menu-action="solo" data-menu-deck="Planar Portal" aria-label="Choose Planar Portal, led by Prosper, Tome-Bound">
          <span class="mainmenu-deck-art"><img src="./assets/cards/art/prosper-tome-bound-afb30a621f.webp" width="626" height="457" loading="lazy" decoding="async" alt="Prosper, Tome-Bound"><span aria-hidden="true">↗</span></span>
          <span class="mainmenu-deck-colors"><img src="./assets/mana/B.svg" alt="Black"><img src="./assets/mana/R.svg" alt="Red"><span>EXILE &amp; TREASURE</span></span><b>Planar Portal</b><span class="mainmenu-deck-description">Turn the unknown into your next advantage.</span>
        </button>
        <button type="button" class="mainmenu-featured-deck" data-menu-action="solo" data-menu-deck="The Ruinous Powers" aria-label="Choose The Ruinous Powers, led by Abaddon the Despoiler">
          <span class="mainmenu-deck-art"><img src="./assets/cards/art/abaddon-the-despoiler-b709a97527.webp" width="626" height="457" loading="lazy" decoding="async" alt="Abaddon the Despoiler"><span aria-hidden="true">↗</span></span>
          <span class="mainmenu-deck-colors"><img src="./assets/mana/U.svg" alt="Blue"><img src="./assets/mana/B.svg" alt="Black"><img src="./assets/mana/R.svg" alt="Red"><span>CHAOS &amp; CASCADE</span></span><b>The Ruinous Powers</b><span class="mainmenu-deck-description">One spell. A chain reaction. Let chaos reign.</span>
        </button>
      </div>
    </section>

    <section id="how-it-works" class="mainmenu-path" aria-labelledby="first-pod-title">
      <div class="mainmenu-path-copy"><span>FIRST TIME HERE?</span><h2 id="first-pod-title">From deck to table</h2><p>Three steps to your first game.</p><button type="button" data-menu-action="tour">Open the first-game guide <span aria-hidden="true">↗</span></button></div>
      <ol class="mainmenu-path-steps">
        <li><span aria-hidden="true">01</span><div><b>Choose your deck</b><p>Browse precons or open My Library to use an imported deck.</p></div></li>
        <li><span aria-hidden="true">02</span><div><b>Set up your table</b><p>Pick opponents, their decks, and the difficulty.</p></div></li>
        <li><span aria-hidden="true">03</span><div><b>Play at your pace</b><p>Review your opening hand. Follow clear prompts for each decision.</p></div></li>
      </ol>
    </section>

    <details id="the-table" class="mainmenu-preview-disclosure">
      <summary><span><b>Take a look at the table</b><small>See the game interface before you play.</small></span><i aria-hidden="true">+</i></summary>
      <section class="mainmenu-preview" aria-labelledby="table-preview-title">
      <header class="mainmenu-section-head">
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
      </section>
    </details>

    <footer class="mainmenu-footer"><div><b>COMMANDER SIMULATOR</b><span>Free, browser-based fan project. Card data and images are provided through Scryfall.</span><a href="#landing-top">Back to top ↑</a></div><p>Commander Simulator is unofficial Fan Content permitted under the <a href="https://company.wizards.com/en/legal/fancontentpolicy" target="_blank" rel="noreferrer">Fan Content Policy</a>. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.</p></footer>`;

  U.bindLandingPreview = page => {
    document.body.classList.toggle('reduced-motion', U.readPreference('mtgReducedMotion', 0) === 1);
    const hero = page.querySelector('.mainmenu-hero');
    const proof = page.querySelector('.mainmenu-proof');
    if (hero && proof && hero.nextElementSibling !== proof) hero.after(proof);
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
