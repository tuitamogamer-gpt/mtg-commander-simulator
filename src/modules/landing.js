// Lightweight presentation shared by first arrival and the in-game home route.
// Preview images are captures of the real Command Table with Scryfall artwork.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function (U) {
  U.landingDetailsMarkup = (deckCount = 27) => `
    <section class="mainmenu-proof" aria-label="Product details">
      <div class="mainmenu-proof-stat"><strong>${Number(deckCount) || 27}</strong><span><b>Complete decks</b><small>Find your playstyle</small></span></div>
      <div class="mainmenu-proof-stat"><strong>4</strong><span><b>Seats at the table</b><small>The full Commander pod</small></span></div>
      <div class="mainmenu-proof-stat"><strong>Local</strong><span><b>AI opponents</b><small>Play at your own pace</small></span></div>
      <div class="mainmenu-livecheck" data-live-state="checking" role="status" aria-live="polite"><i aria-hidden="true"></i><span><b>Checking Live rooms</b><small>Solo play is always available</small></span></div>
    </section>

    <section id="the-table" class="mainmenu-preview" aria-labelledby="table-preview-title">
      <header class="mainmenu-section-head">
        <div><span class="mainmenu-eyebrow">INSIDE THE COMMAND TABLE</span><h2 id="table-preview-title">See the table. Find your next move.</h2></div>
        <p>Track all four players, focus on an opponent, and keep the next decision within reach.</p>
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

    <section id="how-it-works" class="mainmenu-path" aria-labelledby="first-pod-title">
      <div class="mainmenu-path-copy"><span>THE FULL GAME, MADE READABLE</span><h2 id="first-pod-title">From deck choice<br>to opening hand.</h2><p>Set up your pod in three steps. The first-game guide walks you through the decisions when you are ready.</p><button type="button" data-menu-action="tour">Open the first-game guide <span aria-hidden="true">↗</span></button></div>
      <ol class="mainmenu-path-steps">
        <li><span aria-hidden="true">01</span><div><b>Find your commander</b><p>Browse colors and playstyles. Read the deck guide and see its signature cards.</p></div></li>
        <li><span aria-hidden="true">02</span><div><b>Build your pod</b><p>Choose opponents, decks, and difficulty. Review all four seats before you start.</p></div></li>
        <li><span aria-hidden="true">03</span><div><b>Make your next move</b><p>Keep or mulligan your opening hand, then play with visible priority, stack, and combat choices.</p></div></li>
      </ol>
    </section>

    <section id="ways-to-play" class="mainmenu-modes" aria-label="Ways to play">
      <article class="mainmenu-mode solo"><span aria-hidden="true">01 / SOLO</span><div><small>PLAY AT YOUR PACE</small><h2>A seat just for you.</h2><p>Learn a new deck or try a different line against a full pod of local AI opponents.</p><ul class="mainmenu-mode-points"><li>Three local AI opponents</li><li>Adjustable stops and personalities</li><li>Seeded games you can replay</li></ul></div><button type="button" data-menu-action="solo">Start a solo table <span aria-hidden="true">↗</span></button></article>
      <article class="mainmenu-mode live"><span aria-hidden="true">02 / LIVE</span><div><small>BRING YOUR PLAYGROUP</small><h2>Your friends. Your table.</h2><p>Open a private room, share the invite link, and play with two to four human players.</p><ul class="mainmenu-mode-points"><li>One invite link</li><li>Account optional; no public lobby</li><li>Up to four human seats</li></ul></div><button type="button" data-menu-action="live">Create a Live table <span aria-hidden="true">↗</span></button></article>
    </section>

    <section class="mainmenu-final-cta" aria-labelledby="final-cta-title"><div><span>TAKE YOUR SEAT</span><h2 id="final-cta-title">Pick a deck. We will set the table.</h2><p>Play instantly. Save when you sign in.</p></div><div class="mainmenu-final-actions"><button type="button" class="mainmenu-primary" data-menu-action="solo">Start a solo table <span aria-hidden="true">↗</span></button><button type="button" class="mainmenu-secondary" data-menu-action="live">Create a Live table</button></div></section>

    <footer class="mainmenu-footer"><div><b>COMMANDER SIMULATOR</b><span>Free, browser-based fan project. Card data and images are provided through Scryfall.</span><a href="#landing-top">Back to top ↑</a></div><p>Commander Simulator is unofficial Fan Content permitted under the <a href="https://company.wizards.com/en/legal/fancontentpolicy" target="_blank" rel="noreferrer">Fan Content Policy</a>. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.</p></footer>`;

  U.bindLandingPreview = page => {
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
