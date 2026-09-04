// ===== main.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Setup screen + game bootstrap (browser only)
(function () {
  MTG.deckStrategy = function (style) {
    const text = String(style || '').toLowerCase();
    if (/token|offspring|go-wide/.test(text)) return 'tokens';
    if (/counter|toughness|wither/.test(text)) return 'counters';
    if (/spell|noncreature|copy|connive/.test(text)) return 'spells';
    if (/artifact|treasure|clue/.test(text)) return 'artifacts';
    if (/goad|voting|politic|group slug/.test(text)) return 'politics';
    return 'combat';
  };
  if (typeof document === 'undefined') return;
  const U = MTG;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) { e.innerHTML = html; U.localizeTree(e); } return e; };
  const esc = s => U.uiText(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const escAttr = s => esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function commanderImg(deckName) {
    const d = MTG.DECKS[deckName];
    return artURL(d.commander);
  }
  function artURL(name) {
    return MTG.cardImageURL(name, 'art');
  }
  function cardImg(name) {
    return MTG.cardImageURL(name);
  }
  function typeLine(def) {
    return `${(def.super || []).join(' ')} ${(def.types || []).join(' ')}${(def.subtypes || []).length ? ' - ' + def.subtypes.join(' ') : ''}`.trim();
  }

  let importedLibraryOwner = null;
  let importedLibraryRefresh = Promise.resolve();
  let importedLibraryGeneration = 0;
  let activeGameLibraryOwner = null;

  function currentImportedLibraryOwner() {
    if (globalThis.MTGAccount?.loading) return 'loading';
    return globalThis.MTGAccount?.user?.id ? `account:${globalThis.MTGAccount.user.id}` : 'guest';
  }

  function announceImportedLibraryChange() {
    window.dispatchEvent(new CustomEvent('mtg:deck-library-change'));
  }

  function hideImportedLibraryWhileOwnerChanges() {
    importedLibraryGeneration += 1;
    importedLibraryOwner = null;
    if (window._game && typeof U.hideImportedDeckLibrary === 'function') {
      U.hideImportedDeckLibrary({ source: 'loading' });
    } else if (!window._game) {
      U.hydrateImportedDeckLibrary([], { source: 'loading' });
    }
    announceImportedLibraryChange();
  }

  async function refreshImportedDeckLibrary(options = {}) {
    await globalThis.MTGAccount?.whenReady?.();
    const owner = currentImportedLibraryOwner();
    if (owner === 'loading') return U.getImportedDeckLibrary();
    if (!options.force && importedLibraryOwner === owner) return importedLibraryRefresh;
    const generation = ++importedLibraryGeneration;
    importedLibraryOwner = owner;
    importedLibraryRefresh = (async () => {
      if (owner === 'guest') {
        try {
          const loaded = U.loadGuestImportedDeckLibrary();
          if (generation !== importedLibraryGeneration || owner !== currentImportedLibraryOwner()) return U.getImportedDeckLibrary();
          return loaded;
        }
        catch (error) {
          if (generation !== importedLibraryGeneration || owner !== currentImportedLibraryOwner()) return U.getImportedDeckLibrary();
          return U.hydrateImportedDeckLibrary([], {
            source: 'guest',
            error: `Your imported deck library could not be loaded: ${error && error.message || 'browser storage unavailable'}.`,
          });
        }
      }
      try {
        const accountId = globalThis.MTGAccount.user.id;
        const records = await globalThis.MTGAccount.loadDecks();
        if (generation !== importedLibraryGeneration || owner !== currentImportedLibraryOwner() || globalThis.MTGAccount?.user?.id !== accountId) {
          return U.getImportedDeckLibrary();
        }
        return U.hydrateImportedDeckLibrary(records, { source: 'account' });
      } catch (error) {
        if (generation !== importedLibraryGeneration || owner !== currentImportedLibraryOwner()) return U.getImportedDeckLibrary();
        return U.hydrateImportedDeckLibrary([], {
          source: 'account',
          error: `Your imported deck library could not be loaded: ${error && error.message || 'account service unavailable'}.`,
        });
      }
    })();
    return importedLibraryRefresh;
  }

  async function ensureImportedLibraryOwner() {
    await globalThis.MTGAccount?.whenReady?.();
    const owner = currentImportedLibraryOwner();
    if (owner === 'loading') throw new Error('Your profile is still loading. Please try again.');
    if (owner !== importedLibraryOwner) return refreshImportedDeckLibrary({ force: true });
    return importedLibraryRefresh;
  }

  async function saveImportedDeckToLibrary(validation) {
    // Validation is intentionally repeated at the persistence boundary. The
    // Check button is informative; it is never authority to save stale text.
    if (!validation || !validation.ok) throw new Error('Check the complete decklist before saving it.');
    const record = U.createImportedDeckRecord(validation);
    const semantic = U.validateImportedDeckRecord(record);
    if (!semantic.ok) throw new Error(semantic.errors[0]?.message || 'This deck is not supported by the current engine.');
    const existingBuiltIn = MTG.DECKS && MTG.DECKS[record.name];
    if (existingBuiltIn && !existingBuiltIn.custom) throw new Error(`A built-in deck is already named ${record.name}.`);
    await ensureImportedLibraryOwner();
    if (globalThis.MTGAccount?.user) {
      const accountId = globalThis.MTGAccount.user.id;
      const saved = await globalThis.MTGAccount.upsertDeck(record);
      if (globalThis.MTGAccount?.user?.id !== accountId || currentImportedLibraryOwner() !== `account:${accountId}`) {
        await refreshImportedDeckLibrary({ force: true });
        throw new Error('Your account changed before this deck could be saved. Please try again.');
      }
      if (!saved || saved.id !== record.id) throw new Error('The account service did not confirm this deck was saved. Please try again.');
      U.hydrateImportedDeckLibrary(globalThis.MTGAccount.decks, { source: 'account' });
      return saved;
    }
    return U.upsertGuestImportedDeck(record);
  }

  async function removeImportedDeckFromLibrary(id) {
    await ensureImportedLibraryOwner();
    if (globalThis.MTGAccount?.user) {
      const accountId = globalThis.MTGAccount.user.id;
      const removed = await globalThis.MTGAccount.deleteDeck(id);
      if (globalThis.MTGAccount?.user?.id !== accountId || currentImportedLibraryOwner() !== `account:${accountId}`) {
        await refreshImportedDeckLibrary({ force: true });
        throw new Error('Your account changed before this deck could be removed. Please try again.');
      }
      U.hydrateImportedDeckLibrary(globalThis.MTGAccount.decks, { source: 'account' });
      return removed;
    }
    return U.removeGuestImportedDeck(id);
  }

  function renderMainMenu() {
    const root = $('#setup');
    const bootPage = root.querySelector('.mainmenu-boot');
    const nDecks = Object.keys(MTG.DECKS).filter(name => !MTG.DECKS[name].custom).length;
    const featuredNames = ['The Fantastic Four', 'Elven Council', 'Quandrix Unlimited']
      .filter(name => MTG.DECKS[name]);
    const featuredMenuArt = {
      'The Fantastic Four': './assets/menu/invisible-woman.webp',
      'Elven Council': './assets/menu/galadriel-elven-queen.webp',
      'Quandrix Unlimited': './assets/menu/zimone-infinite-analyst.webp',
    };
    if (!bootPage) root.innerHTML = '';
    root.querySelector('.mainmenu-loadveil')?.remove();
    root.style.display = 'block';
    root.dataset.appView = 'home';
    root.dataset.setupStage = 'home';
    root.removeAttribute('aria-busy');
    $('#game').style.display = 'none';
    document.body.classList.remove('game-active', 'deck-spotlight-open', 'mainmenu-dialog-open');
    delete window._game;
    delete window._ui;
    activeGameLibraryOwner = null;
    const menuLibraryOwner = currentImportedLibraryOwner();
    if (menuLibraryOwner === 'loading') {
      if (U.getImportedDeckLibrary().source !== 'loading') hideImportedLibraryWhileOwnerChanges();
    } else if (menuLibraryOwner !== importedLibraryOwner) {
      hideImportedLibraryWhileOwnerChanges();
      void refreshImportedDeckLibrary({ force: true }).then(announceImportedLibraryChange);
    }

    const featuredCards = featuredNames.map((name, index) => {
      const deck = MTG.DECKS[name];
      return `<figure class="mainmenu-card card-${index + 1}">
        <img src="${featuredMenuArt[name] || cardImg(deck.commander)}" width="300" height="418" decoding="async" alt="${esc(name)} led by ${esc(deck.commander)}" onerror="MTG.imgFail(this)">
      </figure>`;
    }).join('');

    const page = bootPage || el('main', 'mainmenu');
    page.id = 'landing-top';
    page.tabIndex = -1;
    page.inert = false;
    if (!bootPage) page.innerHTML = `
      <a class="mainmenu-skip" href="#primary-actions">Skip to play options</a>
      <header class="mainmenu-nav">
        <a class="mainmenu-brand" href="#landing-top" aria-label="Commander Simulator home">
          <span class="menumark" aria-hidden="true"></span>
          <span><b>COMMANDER</b><small>SIMULATOR</small></span>
        </a>
        <nav class="mainmenu-navlinks" aria-label="Explore Commander Simulator">
          <a href="#your-library">My Library</a>
          <a href="#how-it-works">How it works</a>
          <a href="#ways-to-play">Ways to play</a>
        </nav>
        <div class="mainmenu-navtools">
          <div class="mainmenu-mana" role="img" aria-label="White, blue, black, red, green, and colorless mana">
            ${['W', 'U', 'B', 'R', 'G', 'C'].map(color => `<img src="./assets/mana/${color}.svg" alt="">`).join('')}
          </div>
          <button type="button" class="mainmenu-guide" data-menu-action="tour" aria-label="Open first-game guide">${U.icon('info')}<span>Guide</span></button>
        </div>
      </header>

      <section class="mainmenu-hero" aria-labelledby="mainmenu-title">
        <div class="mainmenu-hero-copy">
          <span class="mainmenu-kicker">Play instantly. Save when you sign in.</span>
          <h1 id="mainmenu-title">Your Commander table is ready.</h1>
          <p>Choose from ${nDecks} complete decks. Learn your commander against local AI, or bring your friends to a private Live table.</p>
          <div id="primary-actions" class="mainmenu-actions" tabindex="-1">
            <button type="button" class="mainmenu-primary" data-menu-action="solo">${U.icon('player')}<span><b>Start a solo table</b><small>You + three local AI opponents</small></span></button>
            <button type="button" class="mainmenu-secondary" data-menu-action="live">${U.icon('deals')}<span><b>Create a Live table</b><small>A private pod for 2-4 friends</small></span></button>
          </div>
          <ul class="mainmenu-trust" aria-label="What you need to play">
            <li><span aria-hidden="true">✓</span>Account optional</li>
            <li><span aria-hidden="true">✓</span>Runs in your browser</li>
            <li><span aria-hidden="true">✓</span>Local rules and AI</li>
          </ul>
        </div>
        <div class="mainmenu-visual" role="group" aria-label="Featured Commander decks">
          <div class="mainmenu-warroom" aria-hidden="true"></div>
          <div class="mainmenu-cardfan">${featuredCards}</div>
          <div class="mainmenu-table-note"><span>${U.icon('stack')}</span><div><small>VISIBLE RULES FLOW</small><b>Priority, stack, combat, choices</b></div></div>
        </div>
      </section>

      <section id="your-library" class="mainmenu-library-entry" aria-labelledby="library-entry-title">
        <div class="mainmenu-library-copy">
          <span>YOUR DECK LIBRARY</span>
          <h2 id="library-entry-title">Bring your own deck.</h2>
          <p>Paste a decklist, check engine support, and save it for your next solo table.</p>
        </div>
        <ol class="mainmenu-library-steps" aria-label="Deck import steps">
          <li><span>01</span>Paste</li><li><span>02</span>Check</li><li><span>03</span>Play</li>
        </ol>
        <button type="button" class="mainmenu-import-action" data-menu-action="import">${U.icon('cards')}<span><b>Import your decklist here</b><small>Open My Library</small></span><span aria-hidden="true">↗</span></button>
      </section>

      `;
    if (bootPage) {
      page.classList.remove('mainmenu-boot');
      // The public entry disables these while loading the engine for import.
      page.querySelectorAll('[data-menu-action]').forEach(button => { button.disabled = false; });
      const guide = page.querySelector('.mainmenu-guide');
      if (guide && !guide.querySelector('.gameicon')) guide.insertAdjacentHTML('afterbegin', U.icon('info'));
      const solo = page.querySelector('.mainmenu-primary');
      if (solo && !solo.querySelector('.gameicon')) solo.insertAdjacentHTML('afterbegin', U.icon('player'));
      const live = page.querySelector('.mainmenu-secondary');
      if (live && !live.querySelector('.gameicon')) live.insertAdjacentHTML('afterbegin', U.icon('deals'));
      const importDeck = page.querySelector('.mainmenu-import-action');
      if (importDeck && !importDeck.querySelector('.gameicon')) importDeck.insertAdjacentHTML('afterbegin', U.icon('cards'));
      const tableNote = page.querySelector('.mainmenu-table-note > span');
      if (tableNote && !tableNote.querySelector('.gameicon')) tableNote.innerHTML = U.icon('stack');
    }
    if (!page.querySelector('.mainmenu-proof')) page.insertAdjacentHTML('beforeend', `

      <section class="mainmenu-proof" aria-label="Product details">
        <div class="mainmenu-proof-stat"><strong>${nDecks}</strong><span><b>Complete decks</b><small>Curated commanders and strategies</small></span></div>
        <div class="mainmenu-proof-stat"><strong>4</strong><span><b>Real seats</b><small>A full multiplayer pod</small></span></div>
        <div class="mainmenu-proof-stat"><strong>Local</strong><span><b>Deterministic AI</b><small>No external model API</small></span></div>
        <div class="mainmenu-livecheck" data-live-state="checking" role="status" aria-live="polite"><i aria-hidden="true"></i><span><b>Checking Live rooms</b><small>Solo play is always available</small></span></div>
      </section>

      <section id="how-it-works" class="mainmenu-path" aria-labelledby="first-pod-title">
        <div class="mainmenu-path-copy">
          <span>THE FULL GAME, MADE READABLE</span>
          <h2 id="first-pod-title">From deck choice to opening hand.</h2>
          <p>Commander Simulator clears away table clutter while keeping the decisions that make the format interesting.</p>
          <ul class="mainmenu-decision-tags" aria-label="Visible game decisions"><li>Priority</li><li>Stack</li><li>Targets</li><li>Combat</li></ul>
          <button type="button" data-menu-action="tour">See the first-game guide</button>
        </div>
        <ol class="mainmenu-path-steps">
          <li><span>${U.icon('cards')}</span><div><b>Pick a deck</b><p>Filter by color or playstyle, then open its guide and signature cards.</p></div></li>
          <li><span>${U.icon('player')}</span><div><b>Build the pod</b><p>Choose bot decks, personalities, difficulty, and optional Politics.</p></div></li>
          <li><span>${U.icon('stack')}</span><div><b>Play the decisions</b><p>Proceed prompts, priority windows, targets, and combat stay visible.</p></div></li>
        </ol>
      </section>

      <section id="ways-to-play" class="mainmenu-modes" aria-label="Ways to play">
        <article class="mainmenu-mode solo">
          <span aria-hidden="true">01</span>
          <div><small>PLAY AT YOUR PACE</small><h2>Solo Commander</h2><p>Build a complete four-player table around the deck you want to learn.</p><ul class="mainmenu-mode-points"><li>Three local AI opponents</li><li>Adjustable stops and personalities</li><li>Seeded games you can replay</li></ul></div>
          <button type="button" data-menu-action="solo">Choose a solo deck</button>
        </article>
        <article class="mainmenu-mode live">
          <span aria-hidden="true">02</span>
          <div><small>PRIVATE TABLE</small><h2>Commander Live</h2><p>Open a private room for two, three, or four real players with no bot seats.</p><ul class="mainmenu-mode-points"><li>One invite link</li><li>Account optional; no public lobby</li><li>Up to four human seats</li></ul></div>
          <button type="button" data-menu-action="live">Configure a Live table</button>
        </article>
      </section>

      <section class="mainmenu-final-cta" aria-labelledby="final-cta-title">
        <div><span>YOUR NEXT POD</span><h2 id="final-cta-title">Pick a deck. We will set the table.</h2><p>Start solo now, or invite up to three friends to a private Live room.</p></div>
        <div class="mainmenu-final-actions"><button type="button" class="mainmenu-primary" data-menu-action="solo">Start solo</button><button type="button" class="mainmenu-secondary" data-menu-action="live">Create Live table</button></div>
      </section>

      <footer class="mainmenu-footer">
        <div><b>COMMANDER SIMULATOR</b><span>Free, browser-based fan project. Card data and images are provided through Scryfall.</span><a href="#landing-top">Back to top</a></div>
        <p>Commander Simulator is unofficial Fan Content permitted under the <a href="https://company.wizards.com/en/legal/fancontentpolicy" target="_blank" rel="noreferrer">Fan Content Policy</a>. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.</p>
      </footer>`);
    if (!bootPage) root.appendChild(page);

    const openGuide = (continueMode = null) => {
      root.querySelector('.mainmenu-onboarding')?.remove();
      document.body.classList.add('mainmenu-dialog-open');
      const overlay = el('div', 'mainmenu-onboarding');
      const dialog = el('article', 'mainmenu-onboarding-panel');
      dialog.tabIndex = -1;
      dialog.innerHTML = `
        <button type="button" class="mainmenu-onboarding-close" aria-label="Close first-game guide">×</button>
        <header><span>FIRST GAME GUIDE</span><h2 data-dialog-title>Four things before you sit down.</h2><p>You can reopen this guide from the main menu at any time.</p></header>
        <div class="mainmenu-onboarding-grid">
          <section><i>${U.icon('cards')}</i><div><b>Your deck is complete</b><p>Every listed option is a fixed 100-card deck. Pick by feel first; the deck spotlight explains the plan.</p></div></section>
          <section><i>${U.icon('player')}</i><div><b>You control one seat</b><p>The other seats never expose hidden cards. Local AI makes decisions without an external model API.</p></div></section>
          <section><i>${U.icon('hold')}</i><div><b>HOLD opens priority</b><p>Arm HOLD when you want to respond. The game also stops automatically at the priority windows you choose.</p></div></section>
          <section><i>${U.icon('stack')}</i><div><b>Proceed protects clarity</b><p>Important spells, triggers, targets, and combat reviews wait until the table state is clear.</p></div></section>
        </div>
        <footer><button type="button" class="mainmenu-onboarding-later">Close guide</button><button type="button" class="mainmenu-onboarding-start">${continueMode === 'online' ? 'Build a Live table' : 'Choose my first deck'}</button></footer>`;
      overlay.appendChild(dialog);
      root.appendChild(overlay);
      const close = () => {
        overlay.remove();
        document.body.classList.remove('mainmenu-dialog-open');
      };
      dialog.querySelector('.mainmenu-onboarding-close').onclick = close;
      dialog.querySelector('.mainmenu-onboarding-later').onclick = close;
      dialog.querySelector('.mainmenu-onboarding-start').onclick = () => {
        localStorage.setItem('mtgOnboardingComplete', '1');
        overlay.remove();
        document.body.classList.remove('mainmenu-dialog-open');
        renderSetup({ mode: continueMode || 'solo' });
      };
      overlay.onclick = event => { if (event.target === overlay) close(); };
      dialog.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        close();
      });
      U.enhanceDialog(overlay, dialog, {
        label: 'First game guide',
        initialFocus: dialog.querySelector('.mainmenu-onboarding-close'),
      });
      dialog.scrollTop = 0;
    };

    const openDeckImport = () => {
      root.querySelector('.mainmenu-deckimport')?.remove();
      document.body.classList.add('mainmenu-dialog-open');
      const overlay = el('div', 'mainmenu-deckimport');
      overlay.dataset.importState = 'idle';
      const dialog = el('article', 'mainmenu-deckimport-panel');
      dialog.tabIndex = -1;
      dialog.innerHTML = `
        <button type="button" class="mainmenu-deckimport-close" aria-label="Close decklist import">×</button>
        <header>
          <span>BRING YOUR OWN DECK</span>
          <h2 id="deckimport-title">Import your decklist here</h2>
          <p>Paste once, then play it again from your Library. Every save is checked for commander rules and complete engine support, and checked again before each game.</p>
        </header>
        <section class="mainmenu-decklibrary" aria-labelledby="decklibrary-title">
          <header><div><span>MY LIBRARY</span><h3 id="decklibrary-title">Imported decks</h3></div><small class="mainmenu-decklibrary-source">Loading…</small></header>
          <div class="mainmenu-decklibrary-list" aria-live="polite"><p>Loading your imported decks…</p></div>
        </section>
        <div class="mainmenu-deckimport-grid">
          <form class="mainmenu-deckimport-form" novalidate>
            <label><span>Deck name <small>optional</small></span><input class="mainmenu-deckimport-name" maxlength="80" autocomplete="off" placeholder="My Commander deck"></label>
            <label><span>Commander decklist</span><textarea class="mainmenu-deckimport-text" spellcheck="false" autocapitalize="off" placeholder="Commander&#10;1 Your Commander *CMDR*&#10;&#10;Deck&#10;1 Sol Ring&#10;1 Command Tower&#10;..."></textarea></label>
            <div class="mainmenu-deckimport-result" role="status" aria-live="polite" tabindex="-1" data-state="idle"><p>Nothing is imported until the complete list passes every check.</p></div>
            <div class="mainmenu-deckimport-actions">
              <button type="submit" class="mainmenu-deckimport-check">Check decklist</button>
              <button type="button" class="mainmenu-deckimport-start" disabled>Save to My Library</button>
            </div>
          </form>
          <aside>
            <span>BUILD ELSEWHERE</span>
            <h3>Need a decklist?</h3>
            <p>Build and tune it on Moxfield, export it as text, then paste that list here. Commander Simulator is the play table, not the deck builder.</p>
            <a href="https://moxfield.com/" target="_blank" rel="noopener noreferrer">Build your deck on Moxfield <b aria-hidden="true">↗</b></a>
            <ul>
              <li>Put one or two commanders under a Commander heading, or mark them with <code>*CMDR*</code>.</li>
              <li>The total must be exactly 100 cards including the commander.</li>
              <li>Cards not yet certified for this engine are listed before the game starts.</li>
            </ul>
          </aside>
        </div>`;
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'deckimport-title');
      overlay.appendChild(dialog);
      root.appendChild(overlay);

      const form = dialog.querySelector('.mainmenu-deckimport-form');
      const nameInput = dialog.querySelector('.mainmenu-deckimport-name');
      const textInput = dialog.querySelector('.mainmenu-deckimport-text');
      const resultBox = dialog.querySelector('.mainmenu-deckimport-result');
      const saveButton = dialog.querySelector('.mainmenu-deckimport-start');
      const libraryList = dialog.querySelector('.mainmenu-decklibrary-list');
      const librarySource = dialog.querySelector('.mainmenu-decklibrary-source');
      let validatedText = '';
      let validatedName = '';
      let validatedDeck = null;

      const renderLibrary = () => {
        const library = U.getImportedDeckLibrary();
        const readyCount = library.entries.filter(entry => entry.ready).length;
        overlay.dataset.librarySource = library.source;
        overlay.dataset.libraryCount = String(library.entries.length);
        overlay.dataset.libraryReady = String(readyCount);
        librarySource.textContent = library.source === 'loading'
          ? 'Checking your profile…'
          : library.source === 'account' ? 'Saved to your account' : 'Saved in this browser · sign in before importing to save to your account';
        if (library.error) {
          libraryList.innerHTML = `<div class="mainmenu-decklibrary-error"><strong>Library unavailable</strong><p>${esc(library.error)}</p>${library.source === 'guest' ? '<button type="button" class="mainmenu-decklibrary-reset">Reset local library</button>' : ''}</div>`;
          const resetButton = libraryList.querySelector('.mainmenu-decklibrary-reset');
          if (resetButton) resetButton.onclick = () => {
            if (!confirm('Reset the local imported deck library? Any saved imported decks in this browser will be removed.')) return;
            resetButton.disabled = true;
            resetButton.textContent = 'Resetting…';
            try {
              U.removeGuestImportedDeck('');
              renderLibrary();
            } catch (error) {
              resultBox.dataset.state = 'error';
              resultBox.innerHTML = `<strong>Library was not reset</strong><p>${esc(error && error.message || 'Browser storage is unavailable.')}</p>`;
              resetButton.disabled = false;
              resetButton.textContent = 'Reset local library';
            }
          };
          return;
        }
        if (!library.entries.length) {
          libraryList.innerHTML = library.source === 'loading'
            ? '<div class="mainmenu-decklibrary-empty"><strong>Loading My Library…</strong><p>Checking whether this browser is connected to your profile.</p></div>'
            : '<div class="mainmenu-decklibrary-empty"><strong>No imported decks yet</strong><p>Check a complete list below and save it once. It will appear here next time.</p></div>';
          return;
        }
        libraryList.innerHTML = library.entries.map(entry => `
          <article class="mainmenu-decklibrary-card${entry.ready ? '' : ' is-unavailable'}" data-deck-id="${escAttr(entry.id)}" data-ready="${entry.ready ? 'true' : 'false'}">
            <div><small>${entry.ready ? 'READY TO PLAY' : 'ENGINE UPDATE NEEDED'}</small><h4>${esc(entry.name || 'Unnamed imported deck')}</h4><p>${esc(entry.commanders.join(' + ') || 'Commander unavailable')}</p>${entry.ready ? '' : `<span>${esc(entry.issues[0]?.message || 'This saved deck is not supported by the current engine.')}</span>`}</div>
            <div class="mainmenu-decklibrary-card-actions">
              <button type="button" class="mainmenu-decklibrary-play" ${entry.ready ? '' : 'disabled'}>Choose deck</button>
              <button type="button" class="mainmenu-decklibrary-remove">Remove</button>
            </div>
          </article>`).join('');
        libraryList.querySelectorAll('.mainmenu-decklibrary-play').forEach(button => {
          button.onclick = async () => {
            const card = button.closest('[data-deck-id]');
            button.disabled = true;
            button.textContent = 'Loading…';
            try {
              await ensureImportedLibraryOwner();
              U.prepareSavedImportedCommanderDeck(card.dataset.deckId);
              close();
            } catch (error) {
              resultBox.dataset.state = 'error';
              resultBox.innerHTML = `<strong>Deck could not be selected</strong><p>${esc(error && error.message || 'Unknown library error.')}</p>`;
              renderLibrary();
            }
          };
        });
        libraryList.querySelectorAll('.mainmenu-decklibrary-remove').forEach(button => {
          button.onclick = async () => {
            const card = button.closest('[data-deck-id]');
            const entry = U.getImportedDeckLibraryEntry(card.dataset.deckId);
            if (!entry || !confirm(`Remove “${entry.name}” from My Library?`)) return;
            button.disabled = true;
            button.textContent = 'Removing…';
            try {
              await removeImportedDeckFromLibrary(entry.id);
              renderLibrary();
            } catch (error) {
              resultBox.dataset.state = 'error';
              resultBox.innerHTML = `<strong>Deck was not removed</strong><p>${esc(error && error.message || 'Unknown library error.')}</p>`;
              renderLibrary();
            }
          };
        });
      };
      const onLibraryChange = () => renderLibrary();
      window.addEventListener('mtg:deck-library-change', onLibraryChange);

      const close = () => {
        window.removeEventListener('mtg:deck-library-change', onLibraryChange);
        overlay.remove();
        document.body.classList.remove('mainmenu-dialog-open');
      };
      const setDirty = () => {
        validatedText = '';
        validatedName = '';
        validatedDeck = null;
        saveButton.disabled = true;
        saveButton.textContent = 'Save to My Library';
        overlay.dataset.importState = 'idle';
        delete overlay.dataset.inputCards;
        delete overlay.dataset.commanders;
        resultBox.dataset.state = 'idle';
        resultBox.innerHTML = '<p>Nothing is imported until the complete list passes every check.</p>';
      };
      const showValidation = validation => {
        saveButton.textContent = 'Save to My Library';
        if (!validation.ok) {
          overlay.dataset.importState = 'error';
          overlay.dataset.inputCards = String(validation.summary.inputCards);
          overlay.dataset.commanders = validation.commanders.join(' + ');
          resultBox.dataset.state = 'error';
          const shown = validation.errors.slice(0, 8);
          resultBox.innerHTML = `<strong>Decklist needs attention</strong><ul>${shown.map(error => `<li>${esc(error.message)}</li>`).join('')}</ul>${validation.errors.length > shown.length ? `<p>And ${validation.errors.length - shown.length} more issue${validation.errors.length - shown.length === 1 ? '' : 's'}.</p>` : ''}`;
          validatedDeck = null;
          saveButton.disabled = true;
          return;
        }
        validatedText = textInput.value;
        validatedName = nameInput.value.trim();
        validatedDeck = validation;
        overlay.dataset.importState = 'ready';
        overlay.dataset.inputCards = String(validation.summary.inputCards);
        overlay.dataset.commanders = validation.commanders.join(' + ');
        resultBox.dataset.state = 'ready';
        resultBox.innerHTML = `<strong>Ready to play</strong><p>${validation.summary.inputCards} cards · ${validation.summary.uniqueCards} unique · ${validation.summary.engineCertified} engine-certified · ${validation.interactions.contracts.length} interaction contracts</p><small>Commander: ${esc(validation.commanders.join(' + '))}</small>`;
        saveButton.disabled = false;
      };

      dialog.querySelector('.mainmenu-deckimport-close').onclick = close;
      overlay.onclick = event => { if (event.target === overlay) close(); };
      dialog.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        close();
      });
      textInput.addEventListener('input', setDirty);
      nameInput.addEventListener('input', setDirty);
      form.onsubmit = event => {
        event.preventDefault();
        const validation = U.importCommanderDeck(textInput.value, {
          name: nameInput.value.trim() || undefined,
          register: false,
        });
        showValidation(validation);
        resultBox.focus();
      };
      saveButton.onclick = async () => {
        if (textInput.value !== validatedText || nameInput.value.trim() !== validatedName) {
          setDirty();
          return;
        }
        saveButton.disabled = true;
        saveButton.textContent = 'Saving…';
        try {
          const currentValidation = U.importCommanderDeck(textInput.value, {
            name: validatedName || undefined,
            register: false,
          });
          if (!currentValidation.ok) {
            saveButton.textContent = 'Save to My Library';
            showValidation(currentValidation);
            return;
          }
          const saved = await saveImportedDeckToLibrary(currentValidation);
          validatedDeck = currentValidation;
          overlay.dataset.importState = 'saved';
          resultBox.dataset.state = 'ready';
          resultBox.innerHTML = `<strong>Saved to My Library</strong><p>${currentValidation.summary.inputCards} cards · ${currentValidation.summary.engineCertified} engine-certified · ready to play without pasting again.</p><small>Commander: ${esc(currentValidation.commanders.join(' + '))}</small>`;
          saveButton.textContent = 'Saved';
          renderLibrary();
          if (overlay.isConnected) {
            U.prepareSavedImportedCommanderDeck(saved.id);
            close();
          }
        } catch (error) {
          overlay.dataset.importState = 'error';
          resultBox.dataset.state = 'error';
          resultBox.innerHTML = `<strong>Deck was not saved</strong><p>${esc(error && error.message || 'Unknown import error.')}</p>`;
          saveButton.textContent = 'Save to My Library';
          saveButton.disabled = !validatedDeck;
        }
      };
      U.enhanceDialog(overlay, dialog, {
        label: 'Import Commander decklist',
        initialFocus: textInput,
        returnFocus: page.querySelector('.mainmenu-import-action'),
      });
      renderLibrary();
      dialog.scrollTop = 0;
    };

    MTG.showDeckImport = openDeckImport;

    page.querySelectorAll('[data-menu-action="tour"]').forEach(button => { button.onclick = () => openGuide(); });
    page.querySelectorAll('[data-menu-action="solo"]').forEach(button => {
      button.onclick = () => {
        if (localStorage.getItem('mtgOnboardingComplete') === '1') renderSetup({ mode: 'solo' });
        else openGuide('solo');
      };
    });
    page.querySelectorAll('[data-menu-action="live"]').forEach(button => {
      button.onclick = () => renderSetup({ mode: 'online' });
    });
    page.querySelectorAll('[data-menu-action="import"]').forEach(button => {
      button.onclick = openDeckImport;
    });
    globalThis.MTGAccount?.render();

    const liveStatus = page.querySelector('.mainmenu-livecheck');
    const localStaticHost = location.protocol === 'file:' || ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    if (localStaticHost) {
      liveStatus.dataset.liveState = 'hosted';
      liveStatus.querySelector('b').textContent = 'Solo mode ready';
      liveStatus.querySelector('small').textContent = 'Live rooms require the hosted build';
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    const vercelHost = /(^|\.)vercel\.app$/i.test(location.hostname);
    if (!vercelHost) {
      liveStatus.dataset.liveState = 'hosted';
      liveStatus.querySelector('b').textContent = 'Solo mode ready';
      liveStatus.querySelector('small').textContent = 'Live support is checked when a room opens';
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    const liveController = new AbortController();
    const liveTimeout = setTimeout(() => liveController.abort(), 3500);
    fetch('./api/ws', { cache: 'no-store', signal: liveController.signal })
      .then(async response => ({ response, payload: response.ok ? await response.json() : null }))
      .then(({ response, payload }) => {
        if (!response.ok || !payload || payload.ok !== true) throw new Error('Live rooms unavailable');
        liveStatus.dataset.liveState = 'online';
        liveStatus.querySelector('b').textContent = 'Live rooms online';
        liveStatus.querySelector('small').textContent = 'Private room service is ready';
      })
      .catch(() => {
        liveStatus.dataset.liveState = 'hosted';
        liveStatus.querySelector('b').textContent = 'Solo mode ready';
        liveStatus.querySelector('small').textContent = 'Live rooms require the hosted build';
      })
      .finally(() => clearTimeout(liveTimeout));
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  MTG.showMainMenu = renderMainMenu;
  MTG.exitToMainMenu = () => {
    if (window._game) {
      location.replace(location.pathname);
      return;
    }
    renderMainMenu();
  };
  MTG.showSetup = renderSetup;

  function renderSetup(options = {}) {
    const root = $('#setup');
    root.innerHTML = '';
    root.removeAttribute('aria-busy');
    root.style.display = 'block';
    root.dataset.appView = 'setup';
    document.body.classList.remove('game-active');
    document.body.classList.remove('deck-spotlight-open');
    const nDecks = Object.keys(MTG.DECKS).filter(d => !MTG.DECKS[d].custom).length;
    const initialMode = options.mode === 'online' ? 'online' : 'solo';
    // Setup V3: zadatak je podijeljen u tri jasna koraka, bez gubitka naprednih opcija.
    const head = el('div', 'menuhead');
    head.innerHTML = `
      <button type="button" class="setupbrand setuphome" aria-label="Back to main menu"><span class="menumark" aria-hidden="true"></span><b>COMMANDER</b><small>SIMULATOR</small></button>
      <nav class="setupsteps" aria-label="Game setup progress">
        <button type="button" class="setupstep on" data-step="deck"><span>1</span><b>Deck</b></button>
        <button type="button" class="setupstep" data-step="pod"><span>2</span><b>Pod</b></button>
        <button type="button" class="setupstep" data-step="review"><span>3</span><b>Review</b></button>
      </nav>
      <div class="menu-mana-showcase" aria-label="Official white, blue, black, red, green, and colorless mana symbols">
        ${['W', 'U', 'B', 'R', 'G', 'C'].map(color => `<img src="./assets/mana/${color}.svg" alt="{${color}}" title="{${color}}">`).join('')}
      </div>
      <div class="setuphero">
        <div class="menu-kicker">Build your table</div>
        <h1 class="title">Choose your commander.</h1>
        <p class="subtitle">Browse ${nDecks} tested preconstructed decks, then configure a four-player pod.</p>
      </div>`;
    root.appendChild(head);
    const setupTitle = head.querySelector('.title');
    setupTitle.tabIndex = -1;
    requestAnimationFrame(() => {
      if (root.dataset.appView === 'setup' && setupTitle.isConnected) setupTitle.focus({ preventScroll: true });
    });
    head.querySelector('.setuphome').onclick = () => {
      renderMainMenu();
      requestAnimationFrame(() => $('#landing-top')?.focus({ preventScroll: true }));
    };

    let savedFavorites = [];
    try {
      const parsed = JSON.parse(localStorage.getItem('mtgDeckFavorites') || '[]');
      if (Array.isArray(parsed)) savedFavorites = parsed;
    } catch {
      localStorage.removeItem('mtgDeckFavorites');
    }
    const state = {
      deck: null, ai: initialMode === 'online' ? 0 : 3, livePlayers: 2, mode: initialMode, difficulty: 'normal', seed: '',
      aiDecks: ['', '', ''],
      aiStyles: ['random', 'random', 'random'],
      commanders: [], aiRandomCommanders: false, sumPartnerDamage: false,
      diplomacyEnabled: false,
      applyingReplay: false,
      search: '', color: 'all', strategy: 'all', year: 'all', favoritesOnly: false,
      setupStage: 'deck', playstyle: 'all',
      favorites: new Set(savedFavorites),
      importedDeckId: null, importedLibraryOwner: null,
    };
    root.dataset.setupStage = state.setupStage;
    const setupSteps = [...root.querySelectorAll('.setupstep')];
    setupSteps.filter(step => step.dataset.step !== 'deck').forEach(step => {
      step.disabled = true;
      step.setAttribute('aria-disabled', 'true');
      step.title = 'Choose your deck first';
    });

    const grid = el('div', 'setupgrid');
    root.appendChild(grid);
    const left = el('section', 'setupleft');
    left.id = 'deck-explorer';
    const right = el('aside', 'setupright podbuilder');
    right.id = 'pod-builder';
    grid.appendChild(left); grid.appendChild(right);

    const deckBreakdown = deck => {
      const counts = { lands: 0, creatures: 0, spells: 0, engines: 0 };
      for (const row of deck.cards || []) {
        const def = MTG.DEFS[row.name] || {};
        const types = def.types || [];
        if (types.includes('Land')) counts.lands += row.n;
        else if (types.includes('Creature')) counts.creatures += row.n;
        else if (types.includes('Instant') || types.includes('Sorcery')) counts.spells += row.n;
        else if (types.includes('Artifact') || types.includes('Enchantment')) counts.engines += row.n;
      }
      return counts;
    };

    const openDeckSpotlight = (name, returnFocus) => {
      root.querySelector('.deckspotlightoverlay')?.remove();
      const deck = MTG.DECKS[name];
      const meta = MTG.DECK_META[name] || {};
      const guide = MTG.DECK_GUIDES[name] || (deck?.custom ? {
        theme: 'Your imported Commander deck, ready for the same table setup as the built-in decks.',
        pace: '100 cards', complexity: 'Engine checked',
        plan: 'Choose the number of opponents, their decks and AI styles, then review the table before starting.',
        mulligan: 'Review your opening hand when the game begins. You can keep it or take a mulligan.',
        tip: 'Your saved deck stays in My Library. Pod choices only apply to this game and do not change the saved list.',
        keys: deck.cards.filter(row => !deck.commanders?.includes(row.name) && row.name !== deck.commander && !(MTG.DEFS[row.name]?.types || []).includes('Land')).slice(0, 3).map(row => row.name),
      } : null);
      const route = deck?.custom ? [
        { label: 'SAVED DECK', title: 'Your list is ready', text: U.getImportedDeckLibrary().source === 'account' ? 'Saved to your account. Find it in My Library after signing in, including on another device.' : 'Saved in this browser. Sign in before importing if you want to keep a deck on your account.' },
        { label: 'BUILD THE POD', title: 'Choose your opponents', text: 'Pick 1–3 local AI opponents, their decks, styles and difficulty.' },
        { label: 'REVIEW', title: 'Start when you are ready', text: 'Confirm your choices on the Review screen. Opening this deck does not start a match.' },
      ] : guide && MTG.DECK_GUIDE_ROUTES[guide.route];
      if (!deck || !guide || !route) return;
      const commanders = state.commanders.length ? state.commanders : [deck.commander];
      const leadCommander = commanders[0];
      // Cinematics are optional; a missing visual helper must not prevent
      // choosing an imported deck or opening its ordinary card-art preview.
      const intro = MTG.commanderIntroForDeck?.(deck, leadCommander) || MTG.commanderIntroForDeck?.(deck, deck.commander);
      const counts = deckBreakdown(deck);
      const activeDecks = Object.keys(MTG.DECKS).filter(deckName => !MTG.DECKS[deckName].custom);
      const deckNumber = activeDecks.indexOf(name) + 1;
      const overlay = el('div', 'deckspotlightoverlay');
      const dialog = el('article', 'deckspotlight');
      dialog.dataset.deck = name;
      const mana = (meta.colors || []).map(color =>
        `<img src="./assets/mana/${color}.svg" alt="{${color}}" title="{${color}}">`).join('');
      const phases = route.map((phase, index) => `
        <li><span>0${index + 1}</span><div><small>${esc(phase.label)}</small><b>${esc(phase.title)}</b><p>${esc(phase.text)}</p></div></li>`).join('');
      const keyCards = guide.keys.map(cardName => `
        <figure class="deckspotlightkey">
          <img loading="eager" decoding="async" src="${cardImg(cardName)}" alt="${esc(cardName)}" onerror="MTG.imgFail(this)">
          <figcaption><small>${deck.custom ? 'FROM YOUR DECK' : 'KEY CARD'}</small><b>${esc(cardName)}</b></figcaption>
        </figure>`).join('');
      dialog.innerHTML = `
        <button type="button" class="deckspotlightclose" aria-label="Close deck spotlight">×</button>
        <header class="deckspotlighthero">
          <div class="deckspotlightvisual">
            <img class="deckspotlightbackdrop" src="${artURL(leadCommander)}" alt="" onerror="MTG.imgFail(this)">
            ${intro ? `<video class="deckspotlightvideo" muted autoplay loop playsinline preload="metadata" poster="${artURL(leadCommander)}" aria-hidden="true"><source src="${intro}" type="video/mp4"></video>` : ''}
            <div class="deckspotlightshade"></div>
            <img class="deckspotlightcard" src="${cardImg(leadCommander)}" alt="${esc(leadCommander)}" onerror="MTG.imgFail(this)">
            <span class="deckspotlightpicked"><b>✓</b> Selected for your seat</span>
          </div>
          <div class="deckspotlightintro">
            <div class="deckspotlightkicker"><span>DECK SPOTLIGHT</span><b>${deck.custom ? 'MY LIBRARY' : `${String(deckNumber).padStart(2, '0')} / ${String(activeDecks.length).padStart(2, '0')}`}</b></div>
            <div class="deckspotlightmana" aria-label="Color identity">${mana}</div>
            <h2 data-dialog-title>${esc(name)}</h2>
            <p class="deckspotlightcommander"><span>COMMANDER</span>${esc(commanders.join(' + '))}</p>
            <p class="deckspotlighttheme">${esc(guide.theme)}</p>
            <div class="deckspotlightbadges"><span>${esc(guide.pace)}</span><span>${esc(guide.complexity)}</span><span>${esc(meta.set || '')}</span></div>
            <div class="deckspotlightstats" aria-label="Deck breakdown">
              <span><b>${counts.lands}</b> lands</span><span><b>${counts.creatures}</b> creatures</span><span><b>${counts.spells}</b> instants + sorceries</span><span><b>${counts.engines}</b> artifacts + enchantments</span>
            </div>
          </div>
        </header>
        <div class="deckspotlightbody">
          <section class="deckspotlightplan" aria-labelledby="deckspotlight-plan-title">
            <span class="deckspotlighteyebrow">${deck.custom ? 'BUILD YOUR TABLE' : 'HOW IT PLAYS'}</span>
            <h3 id="deckspotlight-plan-title">${deck.custom ? 'Choose the rest of your pod' : 'Your route through the game'}</h3>
            <p class="deckspotlightlead">${esc(guide.plan)}</p>
            <ol class="deckspotlightrhythm">${phases}</ol>
          </section>
          <aside class="deckspotlightfieldguide" aria-label="Pilot field guide">
            <div><span>${U.icon('cards')}</span><small>OPENING HAND</small><b>What to keep</b><p>${esc(guide.mulligan)}</p></div>
            <div><span>${U.icon('info')}</span><small>PILOT NOTE</small><b>One thing to remember</b><p>${esc(guide.tip)}</p></div>
          </aside>
        </div>
        <section class="deckspotlightsignatures" aria-labelledby="deckspotlight-signatures-title">
          <div><span class="deckspotlighteyebrow">${deck.custom ? 'YOUR LIST' : 'SIGNATURE PIECES'}</span><h3 id="deckspotlight-signatures-title">${deck.custom ? 'Cards from your deck' : 'Cards that reveal the deck'}</h3></div>
          <div class="deckspotlightkeys">${keyCards}</div>
        </section>
        <footer class="deckspotlightactions">
          <div><b>${esc(name)} is selected.</b><span>You can keep browsing or build the rest of the pod.</span></div>
          <button type="button" class="pbtn deckspotlightbrowse">Keep browsing</button>
          <button type="button" class="pbtn primary deckspotlightcontinue">Build this pod →</button>
        </footer>`;
      overlay.appendChild(dialog);
      root.appendChild(overlay);
      document.body.classList.add('deck-spotlight-open');
      const close = nextStage => {
        const video = dialog.querySelector('video');
        if (video) video.pause();
        overlay.remove();
        document.body.classList.remove('deck-spotlight-open');
        if (nextStage === 'pod') {
          setSetupStage('pod');
          requestAnimationFrame(() => right.querySelector('select, button:not(:disabled)')?.focus({ preventScroll: true }));
        } else if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
      };
      dialog.querySelector('.deckspotlightclose').onclick = () => close('deck');
      dialog.querySelector('.deckspotlightbrowse').onclick = () => close('deck');
      dialog.querySelector('.deckspotlightcontinue').onclick = () => close('pod');
      overlay.onclick = event => { if (event.target === overlay) close('deck'); };
      dialog.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        close('deck');
      });
      U.enhanceDialog(overlay, dialog, {
        label: `${name} deck spotlight`,
        initialFocus: dialog.querySelector('.deckspotlightcontinue'),
        returnFocus: document.body,
      });
      requestAnimationFrame(() => { dialog.scrollTop = 0; });
    };

    const explorerHead = el('div', 'deckexplorerhead', `
      <div><span class="eyebrow">Deck explorer</span><h2>Find your playstyle</h2></div>
      <div class="deckexploreractions">
        <span class="deckresultcount">${nDecks} decks</span>
      </div>`);
    left.appendChild(explorerHead);
    const playstyleQuick = el('section', 'playstylequick');
    playstyleQuick.setAttribute('aria-labelledby', 'playstyle-title');
    playstyleQuick.innerHTML = `
      <div class="playstylequickhead"><span>Quick start</span><div><b id="playstyle-title">What sounds fun?</b><small>Pick a feel and we will surface three strong starting points.</small></div></div>
      <div class="playstylechoices" role="group" aria-label="Choose a playstyle">
        <button type="button" data-playstyle="tokens">${U.icon('cards')}<span>Build an army</span></button>
        <button type="button" data-playstyle="spells">${U.icon('stack')}<span>Cast big spells</span></button>
        <button type="button" data-playstyle="artifacts">${U.icon('mana')}<span>Build an engine</span></button>
        <button type="button" data-playstyle="politics">${U.icon('deals')}<span>Shape the table</span></button>
        <button type="button" data-playstyle="combat">${U.icon('attack')}<span>Attack early</span></button>
        <button type="button" data-playstyle="counters">${U.icon('effects')}<span>Grow threats</span></button>
      </div>
      <div class="playstylerecs" aria-live="polite"></div>`;
    left.appendChild(playstyleQuick);
    const deckTools = el('div', 'decktools');
    deckTools.innerHTML = `
      <label class="decksearch"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search decks or commanders" aria-label="Search decks or commanders"></label>
      <label><span class="sr-only">Colors</span><select data-filter="color" aria-label="Filter by color"><option value="all">Colors</option>${['W', 'U', 'B', 'R', 'G', 'C'].map(c => `<option value="${c}">${c === 'C' ? 'Colorless' : `{${c}}`}</option>`).join('')}</select></label>
      <label><span class="sr-only">Strategy</span><select data-filter="strategy" aria-label="Filter by strategy"><option value="all">Strategy</option><option value="tokens">Tokens</option><option value="counters">Counters</option><option value="spells">Spells</option><option value="artifacts">Artifacts</option><option value="combat">Combat</option><option value="politics">Politics</option></select></label>
      <label><span class="sr-only">Year</span><select data-filter="year" aria-label="Filter by year"><option value="all">Year</option>${[2026, 2025, 2024, 2023, 2022, 2021].map(y => `<option value="${y}">${y}</option>`).join('')}</select></label>
      <button type="button" class="favoritefilter" aria-pressed="false">☆ Favorites</button>`;
    left.appendChild(deckTools);
    const deckList = el('div', 'decklist');
    for (const [name, deck] of Object.entries(MTG.DECKS)) {
      const libraryEntry = deck.custom && U.getImportedDeckLibrary().entries.find(entry => entry.name === name && entry.ready);
      // A ready imported deck is selectable everywhere now, live rooms included:
      // the seat carries its list to the host.
      if (deck.custom && !libraryEntry) continue;
      const meta = MTG.DECK_META[name] || {};
      const strategy = MTG.deckStrategy(meta.style);
      const year = ((meta.set || '').match(/20\d{2}/) || [''])[0];
      const entry = el('div', 'deckentry');
      entry.dataset.deck = name;
      if (libraryEntry) entry.dataset.importedDeckId = libraryEntry.id;
      entry.dataset.name = `${name} ${deck.commander}`.toLowerCase();
      entry.dataset.colors = (meta.colors || []).join('');
      entry.dataset.strategy = strategy;
      entry.dataset.year = year;
      const card = el('button', 'deckcard');
      card.type = 'button';
      card.setAttribute('aria-pressed', 'false');
      card.innerHTML = `
        <img class="deckart" loading="lazy" decoding="async" alt="${esc(deck.commander)}" src="${commanderImg(name)}" onerror="MTG.imgFail(this)">
        <div class="deckinfo">
          <div class="decktopline"><div class="decktitle"><div class="deckname">${esc(name)}</div><span class="deckselectedmark"><b>✓</b> Selected for your seat</span></div><span class="deckyear">${esc(year)}</span></div>
          <div class="deckcmd"><span>Commander</span><b>${esc(deck.commander)}</b></div>
          <div class="deckcolors">${(meta.colors || []).map(c => `<img class="deckmana" src="./assets/mana/${c}.svg" alt="{${c}}" title="{${c}}">`).join('')} <span class="deckstyle">${esc(meta.style || '').replace(/[—–]/g, '-')}</span></div>
          <div class="deckblurb">${esc(meta.blurb || '').replace(/[—–]/g, '-')}</div>
          <div class="deckset">${esc(meta.set || '').replace(/[—–]/g, '-')}<span>Select deck →</span></div>
        </div>`;
      const favorite = el('button', 'deckfavorite', state.favorites.has(name) ? '★' : '☆');
      favorite.type = 'button';
      favorite.title = state.favorites.has(name) ? `Remove ${name} from favorites` : `Add ${name} to favorites`;
      favorite.setAttribute('aria-label', favorite.title);
      favorite.setAttribute('aria-pressed', state.favorites.has(name) ? 'true' : 'false');
      favorite.onclick = () => {
        if (state.favorites.has(name)) state.favorites.delete(name); else state.favorites.add(name);
        localStorage.setItem('mtgDeckFavorites', JSON.stringify([...state.favorites]));
        favorite.textContent = state.favorites.has(name) ? '★' : '☆';
        favorite.setAttribute('aria-pressed', state.favorites.has(name) ? 'true' : 'false');
        favorite.title = state.favorites.has(name) ? `Remove ${name} from favorites` : `Add ${name} to favorites`;
        favorite.setAttribute('aria-label', favorite.title);
        void globalThis.MTGAccount?.syncLocalFavorites?.();
        filterDecks();
      };
      card.onclick = () => {
        if (!state.applyingReplay) {
          importStatus.hidden = true;
          replayNotice.hidden = true;
        }
        state.deck = name;
        state.importedDeckId = libraryEntry ? libraryEntry.id : null;
        state.importedLibraryOwner = libraryEntry ? currentImportedLibraryOwner() : null;
        state.commanders = libraryEntry ? libraryEntry.commanders.slice() : MTG.defaultCommanders(deck, MTG.DEFS);
        const liveChoice = matchType.querySelector('[data-mode="online"]');
        liveChoice.disabled = false;
        liveChoice.title = libraryEntry
          ? 'Your imported list travels with your seat so the host can build it.' : '';
        deckList.querySelectorAll('.deckcard').forEach(c => {
          c.classList.remove('selected');
          c.setAttribute('aria-pressed', 'false');
        });
        card.classList.add('selected');
        card.setAttribute('aria-pressed', 'true');
        startBtn.disabled = false;
        podNext.disabled = false;
        renderCmdBox();
        for (let i = 0; i < state.aiDecks.length; i++) if (state.aiDecks[i] === name) state.aiDecks[i] = '';
        renderBotStyles();
        updateStartLabel();
        mobileDeck.innerHTML = `<img src="${commanderImg(name)}" alt="${esc(deck.commander)}" onerror="MTG.imgFail(this)"><span><small>Selected deck</small><b>${esc(name)}</b></span>`;
        mobileContinue.disabled = false;
        setupSteps.forEach(step => {
          step.disabled = false;
          step.removeAttribute('aria-disabled');
          step.removeAttribute('title');
        });
        setSetupStage('deck');
        if (!state.applyingReplay) openDeckSpotlight(name, card);
      };
      entry.appendChild(card);
      entry.appendChild(favorite);
      deckList.appendChild(entry);
    }
    left.appendChild(deckList);

    const noResults = el('section', 'deckempty');
    noResults.hidden = true;
    noResults.innerHTML = `
      <span>${U.icon('cards')}</span>
      <div><b>No exact matches</b><p class="deckemptyreason"></p></div>
      <button type="button" class="pbtn deckemptyreset">Clear filters</button>
      <div class="deckemptyalternatives" aria-label="Closest available decks"></div>`;
    left.appendChild(noResults);

    const activeFilterText = () => {
      const parts = [];
      if (state.search) parts.push(`search “${state.search}”`);
      if (state.color !== 'all') parts.push(`color ${state.color}`);
      if (state.strategy !== 'all') parts.push(`${state.strategy} strategy`);
      if (state.year !== 'all') parts.push(`release year ${state.year}`);
      if (state.favoritesOnly) parts.push('favorites only');
      return parts.length ? parts.join(' · ') : 'the current filters';
    };

    const closestDeckEntries = () => {
      const entries = [...deckList.querySelectorAll('.deckentry')];
      return entries.map(entry => {
        let score = 0;
        if (state.color !== 'all' && entry.dataset.colors.includes(state.color)) score += 4;
        if (state.strategy !== 'all' && entry.dataset.strategy === state.strategy) score += 5;
        if (state.year !== 'all' && entry.dataset.year === state.year) score += 2;
        if (state.search && entry.dataset.name.split(/\s+/).some(word => word.includes(state.search) || state.search.includes(word))) score += 3;
        if (state.favorites.has(entry.dataset.deck)) score += 1;
        return { entry, score };
      }).sort((a, b) => b.score - a.score || a.entry.dataset.deck.localeCompare(b.entry.dataset.deck)).slice(0, 3);
    };

    const renderPlaystyleRecommendations = strategy => {
      const recs = playstyleQuick.querySelector('.playstylerecs');
      playstyleQuick.querySelectorAll('[data-playstyle]').forEach(button => {
        const on = button.dataset.playstyle === strategy;
        button.classList.toggle('on', on);
        button.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      deckList.querySelectorAll('.deckentry').forEach(entry => entry.classList.toggle('recommended', entry.dataset.strategy === strategy));
      const matches = [...deckList.querySelectorAll(`.deckentry[data-strategy="${strategy}"]`)].slice(0, 3);
      recs.innerHTML = matches.length
        ? `<small>RECOMMENDED FOR YOU</small>${matches.map(entry => `<button type="button" data-deck-rec="${escAttr(entry.dataset.deck)}"><b>${esc(entry.dataset.deck)}</b><span>${esc((MTG.DECK_META[entry.dataset.deck] || {}).style || '')}</span></button>`).join('')}`
        : '';
      recs.querySelectorAll('[data-deck-rec]').forEach(button => {
        button.onclick = () => deckList.querySelector(`.deckentry[data-deck="${CSS.escape(button.dataset.deckRec)}"] .deckcard`)?.click();
      });
    };

    const filterDecks = () => {
      let visible = 0;
      deckList.querySelectorAll('.deckentry').forEach(entry => {
        const matches = (!state.search || entry.dataset.name.includes(state.search)) &&
          (state.color === 'all' || entry.dataset.colors.includes(state.color)) &&
          (state.strategy === 'all' || entry.dataset.strategy === state.strategy) &&
          (state.year === 'all' || entry.dataset.year === state.year) &&
          (!state.favoritesOnly || state.favorites.has(entry.querySelector('.deckname').textContent));
        entry.hidden = !matches;
        if (matches) visible++;
      });
      explorerHead.querySelector('.deckresultcount').textContent = `${visible} deck${visible === 1 ? '' : 's'}`;
      deckList.classList.toggle('noresults', visible === 0);
      noResults.hidden = visible !== 0;
      if (!visible) {
        noResults.querySelector('.deckemptyreason').textContent = `Nothing matches ${activeFilterText()}. Clear everything, or jump to one of the closest decks below.`;
        const alternatives = noResults.querySelector('.deckemptyalternatives');
        alternatives.innerHTML = closestDeckEntries().map(({ entry }) =>
          `<button type="button" data-alt-deck="${escAttr(entry.dataset.deck)}"><b>${esc(entry.dataset.deck)}</b><span>${esc((MTG.DECK_META[entry.dataset.deck] || {}).style || '')}</span></button>`).join('');
        alternatives.querySelectorAll('[data-alt-deck]').forEach(button => {
          button.onclick = () => {
            clearFilters();
            deckList.querySelector(`.deckentry[data-deck="${CSS.escape(button.dataset.altDeck)}"] .deckcard`)?.focus();
          };
        });
      }
    };
    deckTools.querySelector('input').oninput = e => { state.search = e.target.value.trim().toLowerCase(); filterDecks(); };
    deckTools.querySelector('[data-filter="color"]').onchange = e => { state.color = e.target.value; filterDecks(); };
    deckTools.querySelector('[data-filter="strategy"]').onchange = e => { state.strategy = e.target.value; filterDecks(); };
    deckTools.querySelector('[data-filter="year"]').onchange = e => { state.year = e.target.value; filterDecks(); };
    const favoriteFilter = deckTools.querySelector('.favoritefilter');
    favoriteFilter.onclick = () => {
      state.favoritesOnly = !state.favoritesOnly;
      favoriteFilter.classList.toggle('on', state.favoritesOnly);
      favoriteFilter.setAttribute('aria-pressed', state.favoritesOnly ? 'true' : 'false');
      favoriteFilter.textContent = state.favoritesOnly ? '★ Favorites' : '☆ Favorites';
      filterDecks();
    };
    const clearFilters = () => {
      state.search = ''; state.color = 'all'; state.strategy = 'all'; state.year = 'all'; state.favoritesOnly = false;
      deckTools.querySelector('input').value = '';
      deckTools.querySelector('[data-filter="color"]').value = 'all';
      deckTools.querySelector('[data-filter="strategy"]').value = 'all';
      deckTools.querySelector('[data-filter="year"]').value = 'all';
      favoriteFilter.classList.remove('on');
      favoriteFilter.setAttribute('aria-pressed', 'false');
      favoriteFilter.textContent = '☆ Favorites';
      filterDecks();
    };
    noResults.querySelector('.deckemptyreset').onclick = clearFilters;
    playstyleQuick.querySelectorAll('[data-playstyle]').forEach(button => {
      button.onclick = () => {
        state.playstyle = button.dataset.playstyle;
        state.strategy = state.playstyle;
        deckTools.querySelector('[data-filter="strategy"]').value = state.strategy;
        renderPlaystyleRecommendations(state.playstyle);
        filterDecks();
        deckList.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });

    // ---------- 2 · POD BUILDER ----------
    const podHead = el('div', 'controlintro', `
      <button type="button" class="podclose" aria-label="Close Pod Builder">×</button>
      <span>Pod builder</span>
      <h2>Ready your table</h2>
      <p>Your selections stay here while you browse. Review the seats and start when the pod is ready.</p>`);
    podHead.querySelector('.podclose').onclick = () => setSetupStage('deck');
    right.appendChild(podHead);
    const replayNotice = el('div', 'debugreplaynotice');
    replayNotice.setAttribute('role', 'status');
    replayNotice.setAttribute('aria-live', 'polite');
    replayNotice.hidden = true;
    right.appendChild(replayNotice);
    const matchType = el('div', 'matchtype');
    matchType.innerHTML = `
      <div class="matchtypecopy"><span>Match type</span><b>Choose how you enter the pod</b></div>
      <div class="matchtypechoices">
        <button type="button" class="matchtypebtn${state.mode === 'solo' ? ' selected' : ''}" data-mode="solo"><strong>Solo table</strong><small>You + 1-3 AI V2 bots</small></button>
        <button type="button" class="matchtypebtn live${state.mode === 'online' ? ' selected' : ''}" data-mode="online"><strong><i></i> Live players</strong><small>2–4 humans · no bots</small></button>
      </div>`;
    right.appendChild(matchType);
    const livePlayerRow = el('div', 'liveplayercount');
    livePlayerRow.innerHTML = '<span><b>Human seats</b><small>Choose before the private link is generated</small></span><div class="liveplayerchoices"></div>';
    for (const count of [2, 3, 4]) {
      const button = el('button', `pbtn choice${count === state.livePlayers ? ' selected' : ''}`, `${count} players`);
      button.type = 'button';
      button.dataset.livePlayers = String(count);
      button.onclick = () => {
        state.livePlayers = count;
        livePlayerRow.querySelectorAll('[data-live-players]').forEach(item => item.classList.toggle('selected', item === button));
        updateStartLabel();
        opponentsLabel.innerHTML = `<i>Live pod</i> ${count} human seats <em>Players 2–${count} choose after joining</em>`;
      };
      livePlayerRow.querySelector('.liveplayerchoices').appendChild(button);
    }
    right.appendChild(livePlayerRow);
    right.appendChild(el('div', 'seclabel', '<i>Choice</i> Commander'));
    const cmdBox = el('div', 'cmdbox');
    right.appendChild(cmdBox);
    const updateStartLabel = () => {
      if (!state.deck) return;
      const c = state.commanders;
      startBtn.textContent = state.mode === 'online' ? `Create ${state.livePlayers}-player room` : state.importedDeckId ? 'Review pod →' : 'Start game';
      startBtn.title = `${state.deck}: ${c.map(n => n.split(',')[0]).join(' + ')}`;
    };
    function renderCmdBox() {
      cmdBox.innerHTML = '';
      if (!state.deck) { cmdBox.appendChild(el('div', 'cmdhint', 'Choose a deck on the left first.')); return; }
      const deck = MTG.DECKS[state.deck];
      const legals = MTG.legalCommanders(deck, MTG.DEFS);
      const deckSummary = el('div', 'selecteddecksummary');
      deckSummary.setAttribute('role', 'status');
      deckSummary.setAttribute('aria-live', 'polite');
      deckSummary.innerHTML = `<span><small>Selected deck</small><b>${esc(state.deck)}</b></span><em>Ready</em>`;
      cmdBox.appendChild(deckSummary);
      const chosen = el('div', 'cmdchosen');
      for (const nm of state.commanders) {
        const def = MTG.DEFS[nm] || {};
        const tag = MTG.cmdTag(def);
        const chip = el('div', 'cmdchip');
        chip.innerHTML = `
          <img loading="lazy" src="${artURL(nm)}" onerror="MTG.imgFail(this)">
          <div class="cmdchipinfo">
            <div class="cmdchipname">${esc(nm)}</div>
            <div class="cmdchiptype">${esc(typeLine(def))}</div>
            ${tag.kind ? `<div class="cmdbadge">${esc(MTG.cmdTagLabel(tag))}</div>` : ''}
          </div>`;
        chosen.appendChild(chip);
      }
      cmdBox.appendChild(chosen);
      const partnerable = legals.filter(l => l.tag.kind).length;
      cmdBox.appendChild(el('div', 'cmdhint',
        `${legals.length} legal commander${legals.length === 1 ? '' : 's'} in this deck` +
        (partnerable ? ` · ${partnerable} with a partner ability 🤝` : '') +
        (state.commanders.length === 2 ? ' · you are playing TWO commanders' : '')));
      const btn = el('button', 'pbtn wide', legals.length > 1 ? '🔄 Change commander / partners' : '🔒 This deck has only one');
      btn.disabled = legals.length <= 1;
      btn.onclick = async () => {
        const res = await pickCommanders(state.deck, state.commanders);
        if (res) { state.commanders = res; renderCmdBox(); updateStartLabel(); }
      };
      cmdBox.appendChild(btn);
    }

    const opponentsLabel = el('div', 'seclabel', '<i>Pod</i> Opponents <em>Choose each AI deck</em>');
    right.appendChild(opponentsLabel);
    const aiRow = el('div', 'btnrow center');
    const botStyles = el('div', 'botstyles');
    const getStyleGroups = () => {
      const customKeys = MTG.readAISkillLibrary().records.map(MTG.aiSkillKey);
      const styleGroups = [
        ['Core archetypes', Object.entries(MTG.AI_STYLES).filter(([, style]) => !style.signature && !style.custom)],
        ['Command Zone signatures', Object.entries(MTG.AI_STYLES).filter(([, style]) => style.signature)],
        ['Your custom skills', Object.entries(MTG.AI_STYLES).filter(([key, style]) => style.custom && (customKeys.includes(key) || state.aiStyles.includes(key)))],
      ];
      return styleGroups;
    };
    const STYLE_DESC = {
      aggressive: 'Attacks relentlessly, hunts wounded players, and dislikes blocking.',
      jimmy: 'Jimmy-inspired Aggressive pressure: builds around the commander, attacks open lanes, protects its win, then commits to an alpha strike.',
      rachel: 'Rachel-inspired Balanced tablecraft: develops flexible value, reads the whole table, uses interaction defensively, and closes a real win.',
      opportunist: 'Avoids the leader and overwhelms wounded players.',
      post: 'Post Malone-inspired Opportunist showstopper: lays low behind card advantage, borrows opposing power, takes calculated risks, then makes a flashy finish.',
      olivia: 'Olivia-inspired Saboteur instigator: probes safe lanes, redirects pressure, disrupts the public leader, and springs a calculated ambush.',
      passive: 'Builds its board, keeps blockers, and attacks when it is safe.',
      josh: 'Josh-inspired Defensive value engine: develops mana and cards, holds interaction, makes exact short deals, then closes.',
      teaser: 'Sabotages plans with goad, misdirection, political pressure, and opportunistic disruption.',
      balanced: 'Standard, balanced AI logic.',
      random: 'Each bot receives a random personality, revealed in game.',
    };
    const renderBotStyles = () => {
      botStyles.innerHTML = '';
      const botNames = ['AI Dragon', 'AI Wolf', 'AI Raven'];
      const deckNames = Object.keys(MTG.DECKS).filter(name => !MTG.DECKS[name].custom).sort((a, b) => a.localeCompare(b));
      // Decks the player imported are offered to bots too, but only while the
      // list is ready in My Library — a broken or removed list must never be
      // dealt to a seat. Online rooms have no bots, so the mode is excluded.
      const importedDeckNames = state.mode === 'online' ? [] : (MTG.getImportedDeckLibrary?.() || { entries: [] })
        .entries.filter(entry => entry.ready && MTG.DECKS[entry.name]?.custom)
        .map(entry => entry.name).sort((a, b) => a.localeCompare(b));
      for (let i = 0; i < state.ai; i++) {
        const config = el('div', 'botconfig');
        const row = el('div', 'botstylerow');
        const badge = el('span', 'pbadge');
        badge.setAttribute('aria-hidden', 'true');
        const setBadge = k => {
          const badgeStyle = k === 'josh' ? 'passive' : k === 'jimmy' ? 'aggressive' : k === 'rachel' ? 'balanced' : k === 'post' ? 'opportunist' : k === 'olivia' ? 'teaser' : k;
          badge.className = 'pbadge ' + (['aggressive', 'opportunist', 'passive', 'teaser'].includes(badgeStyle) ? 'p-' + badgeStyle : 'p-none');
          badge.replaceChildren();
          const style = MTG.AI_STYLES[k];
          if (style && style.portrait) {
            const portrait = document.createElement('img');
            portrait.src = style.portrait;
            portrait.alt = '';
            portrait.loading = 'eager';
            portrait.decoding = 'async';
            portrait.onerror = () => MTG.imgFail(portrait);
            badge.appendChild(portrait);
            badge.classList.add('hasportrait');
          } else {
            badge.textContent = ['aggressive', 'opportunist', 'passive', 'teaser'].includes(badgeStyle)
              ? (style && style.icon || '') : (k === 'random' ? '?' : style?.icon || '=');
          }
          badge.title = style?.description || STYLE_DESC[k] || '';
        };
        const identity = el('div', 'botidentity', `<span class="botname">${esc(botNames[i])}</span><small>Seat 0${i + 1}</small>`);
        const fields = el('div', 'botfields');
        const deckField = el('label', 'botfield', '<span>Deck</span>');
        const deckSelect = el('select', 'styleselect deckselect');
        deckSelect.setAttribute('aria-label', `${botNames[i]} deck`);
        const randomDeck = el('option', '', 'Random deck');
        randomDeck.value = '';
        deckSelect.appendChild(randomDeck);
        const unavailable = new Set([state.deck, ...state.aiDecks.filter((deckName, index) => index !== i && deckName)]);
        const addDeckOption = (deckName, group) => {
          const option = el('option', '', deckName);
          option.value = deckName;
          option.disabled = unavailable.has(deckName);
          option.selected = state.aiDecks[i] === deckName;
          (group || deckSelect).appendChild(option);
        };
        for (const deckName of deckNames) addDeckOption(deckName);
        if (importedDeckNames.length) {
          const group = el('optgroup');
          group.label = 'From My Library';
          for (const deckName of importedDeckNames) addDeckOption(deckName, group);
          deckSelect.appendChild(group);
        }
        deckSelect.onchange = () => {
          state.aiDecks[i] = deckSelect.value;
          renderBotStyles();
        };
        deckField.appendChild(deckSelect);

        const styleField = el('label', 'botfield', '<span>Play style</span>');
        const sel = el('select', 'styleselect');
        sel.setAttribute('aria-label', `${botNames[i]} play style`);
        const randomOption = el('option', '', '🎲 Random style');
        randomOption.value = 'random';
        randomOption.selected = state.aiStyles[i] === 'random';
        sel.appendChild(randomOption);
        for (const [groupLabel, styles] of getStyleGroups()) {
          const group = document.createElement('optgroup');
          group.label = groupLabel;
          for (const [k, style] of styles) {
            const o = el('option');
            o.textContent = `${style.icon} ${style.label}`;
            o.value = k;
            if (state.aiStyles[i] === k) o.selected = true;
            group.appendChild(o);
          }
          sel.appendChild(group);
        }
        styleField.appendChild(sel);
        const desc = el('div', 'styledesc');
        desc.setAttribute('role', 'status');
        desc.setAttribute('aria-live', 'polite');
        const updateStylePresentation = k => {
          const style = MTG.AI_STYLES[k];
          config.dataset.aiStyle = k;
          config.classList.toggle('signaturestyle', !!(style && style.signature));
          desc.innerHTML = `<span>${style && style.signature ? `${esc(style.name)} · ${esc(style.archetype)} signature` : style?.custom ? `Custom skill · based on ${esc(MTG.AI_STYLES[style.baseStyle].label)}` : style ? 'Core archetype' : 'Random assignment'}</span><p>${esc(style?.description || STYLE_DESC[k] || '')}</p>`;
          setBadge(k);
        };
        updateStylePresentation(state.aiStyles[i]);
        sel.onchange = () => {
          state.aiStyles[i] = sel.value;
          updateStylePresentation(sel.value);
        };
        fields.appendChild(deckField); fields.appendChild(styleField);
        row.appendChild(badge); row.appendChild(identity); row.appendChild(fields);
        config.appendChild(row); config.appendChild(desc);
        botStyles.appendChild(config);
      }
    };
    for (const n of [1, 2, 3]) {
      const b = el('button', 'pbtn choice' + (n === state.ai ? ' selected' : ''), n === 1 ? '1 AI duel' : n === 3 ? '3 AI pod' : '2 AI players');
      b.dataset.aiCount = String(n);
      b.onclick = () => { state.ai = n; aiRow.querySelectorAll('.pbtn').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); renderBotStyles(); };
      aiRow.appendChild(b);
    }
    right.appendChild(aiRow);
    const botLoadoutsLabel = el('div', 'seclabel', '<i>AI</i> Bot loadouts');
    right.appendChild(botLoadoutsLabel);
    right.appendChild(botStyles);
    const customSkillsButton = el('button', 'pbtn wide customskillsbutton', 'Upload / manage custom AI skills');
    customSkillsButton.type = 'button';
    customSkillsButton.onclick = () => MTG.openAISkillLibrary(change => {
      if (change.removedKeys) state.aiStyles = state.aiStyles.map(key => change.removedKeys.includes(key) ? 'random' : key);
      if (change.previousKey) state.aiStyles = state.aiStyles.map(key => key === change.previousKey ? change.key : key);
      renderBotStyles();
    });
    right.appendChild(customSkillsButton);
    renderBotStyles();

    const advanced = el('details', 'advancedrules');
    advanced.appendChild(el('summary', '', '<span>Advanced rules</span><small>Commander options, politics and difficulty</small>'));
    // The reveal animation belongs to the click that opens the panel, not to
    // later re-renders of the pod builder while it stays open.
    advanced.addEventListener('toggle', () => {
      if (!advanced.open) return;
      advanced.classList.add('just-opened');
      setTimeout(() => advanced.classList.remove('just-opened'), 420);
    });
    const advancedSummaryCopy = advanced.querySelector('summary small');
    const advancedBody = el('div', 'advancedbody');
    advanced.appendChild(advancedBody);

    const randRow = el('label', 'cmdcheck');
    randRow.innerHTML = '<input type="checkbox"> <span>AI bots choose random commanders (including partners)</span>';
    randRow.querySelector('input').onchange = e => { state.aiRandomCommanders = e.target.checked; };
    advancedBody.appendChild(randRow);

    const houseRow = el('label', 'cmdcheck');
    houseRow.title = 'Official rule 903.10a: 21 damage from the SAME commander. ' +
      'Enable this only if your group combines damage from both partners.';
    houseRow.innerHTML = '<input type="checkbox"> <span>House rule: COMBINE damage from both partners (not rule 903.10a)</span>';
    houseRow.querySelector('input').onchange = e => { state.sumPartnerDamage = e.target.checked; };
    advancedBody.appendChild(houseRow);

    const diplomacyRow = el('label', 'cmdcheck diplomacysetup');
    diplomacyRow.title = 'Optional structured agreements between every player. Disabled for the first three full table rounds.';
    diplomacyRow.innerHTML = `<input type="checkbox"> <span><b>Diplomacy &amp; Politics</b><small>Short public deals between you and bots, and between bots. Unlocks after every player completes turn 3.</small></span>`;
    diplomacyRow.querySelector('input').onchange = e => {
      state.diplomacyEnabled = e.target.checked;
      diplomacyRow.classList.toggle('enabled', state.diplomacyEnabled);
    };
    advancedBody.appendChild(diplomacyRow);

    const difficultyLabel = el('div', 'seclabel', '<i>AI</i> Difficulty');
    advancedBody.appendChild(difficultyLabel);
    // What actually changes between the levels (see AI_SEARCH_CONFIG in
    // ai-v2.js): how many candidate plays the bots weigh, how far ahead they
    // look, how many lines they simulate and how readily they accept a
    // slightly weaker play.
    const DIFFICULTY_NOTES = {
      easy: {
        title: 'Easy', tag: 'learning table',
        text: 'Bots look one step ahead at 4 candidate plays and gladly accept a slightly weaker line. They miss some lethal attacks and make loose trades. Pick this to learn a deck.',
        facts: [['Lookahead', '1 step'], ['Candidate plays', '4'], ['Simulated lines', '3'], ['Mistakes', 'frequent']],
      },
      normal: {
        title: 'Normal', tag: 'default',
        text: 'Bots weigh 10 candidate plays up to 3 steps ahead and simulate 6 lines per decision. They take the best line most of the time, with a little variance.',
        facts: [['Lookahead', '3 steps'], ['Candidate plays', '10'], ['Simulated lines', '6'], ['Mistakes', 'occasional']],
      },
      hard: {
        title: 'Hard', tag: 'competitive',
        text: 'Bots weigh 18 candidate plays up to 4 steps ahead, simulate 9 lines and consider up to 14 targets. They almost always find the strongest line: open mana gets punished, bad attacks are refused and removal is saved for real threats.',
        facts: [['Lookahead', '4 steps'], ['Candidate plays', '18'], ['Simulated lines', '9'], ['Mistakes', 'rare']],
      },
    };
    const diffRow = el('div', 'btnrow center difficultyrow');
    const diffNote = el('div', 'difficultynote');
    diffNote.id = 'difficultynote';
    diffNote.setAttribute('role', 'note');
    const renderDifficultyNote = (key, previewing) => {
      const note = DIFFICULTY_NOTES[key] || DIFFICULTY_NOTES.normal;
      diffNote.classList.toggle('previewing', !!previewing);
      diffNote.innerHTML = `<b>${esc(note.title)}<em>${esc(note.tag)}${previewing ? ' · hover preview' : ' · selected'}</em></b>` +
        `<p>${esc(note.text)}</p>` +
        `<ul>${note.facts.map(([label, value]) => `<li><i>${esc(label)}</i>${esc(value)}</li>`).join('')}</ul>`;
    };
    for (const [k, label] of [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']]) {
      const b = el('button', 'pbtn choice' + (k === 'normal' ? ' selected' : ''), label);
      b.dataset.difficulty = k;
      b.type = 'button';
      b.title = DIFFICULTY_NOTES[k].text;
      b.setAttribute('aria-describedby', 'difficultynote');
      b.onclick = () => { state.difficulty = k; diffRow.querySelectorAll('.pbtn').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); renderDifficultyNote(k, false); };
      b.onmouseenter = () => renderDifficultyNote(k, k !== state.difficulty);
      b.onfocus = () => renderDifficultyNote(k, k !== state.difficulty);
      b.onmouseleave = () => renderDifficultyNote(state.difficulty || 'normal', false);
      b.onblur = () => renderDifficultyNote(state.difficulty || 'normal', false);
      diffRow.appendChild(b);
    }
    advancedBody.appendChild(diffRow);
    renderDifficultyNote(state.difficulty || 'normal', false);
    advancedBody.appendChild(diffNote);
    right.appendChild(advanced);

    const diagnostics = el('details', 'supportdiagnostics');
    diagnostics.innerHTML = `
      <summary><span>Support &amp; Diagnostics</span><small>Replay a share-safe debug snapshot</small></summary>
      <div class="supportdiagnosticsbody">
        <p>Import restores the same public setup and seed from turn 1. Hidden card identities are never included.</p>
        <button type="button" class="debugimportbtn">↺ Import debug snapshot</button>
        <input type="file" class="debugimportfile" accept="application/json,.json" hidden>
        <div class="debugimportstatus" role="status" aria-live="polite" hidden></div>
      </div>`;
    right.appendChild(diagnostics);
    const importStatus = diagnostics.querySelector('.debugimportstatus');

    const startBtn = el('button', 'pbtn primary start', 'Choose a deck first');
    startBtn.disabled = true;
    const launchSelectedTable = () => {
      try {
        return state.mode === 'online' ? openOnlineLobby(state) : startGame(state);
      } catch (error) {
        setSetupStage('pod');
        diagnostics.open = true;
        showImportStatus(error?.message || 'The table could not start. Please select your deck again.', true);
      }
    };
    startBtn.onclick = () => state.importedDeckId ? setSetupStage('review') : launchSelectedTable();
    right.appendChild(startBtn);
    renderCmdBox();

    const podNext = el('button', 'pbtn primary setupnext', 'Review pod →');
    podNext.type = 'button';
    podNext.disabled = true;
    right.appendChild(podNext);

    const setMatchMode = mode => {
      state.mode = mode === 'online' ? 'online' : 'solo';
      state.ai = state.mode === 'online' ? 0 : 3;
      matchType.querySelectorAll('.matchtypebtn').forEach(button => {
        const selected = button.dataset.mode === state.mode;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      livePlayerRow.hidden = state.mode !== 'online';
      aiRow.hidden = state.mode === 'online';
      botLoadoutsLabel.hidden = state.mode === 'online';
      botStyles.hidden = state.mode === 'online';
      customSkillsButton.hidden = state.mode === 'online';
      randRow.hidden = state.mode === 'online';
      difficultyLabel.hidden = state.mode === 'online';
      diffRow.hidden = state.mode === 'online';
      opponentsLabel.innerHTML = state.mode === 'online'
        ? `<i>Live pod</i> ${state.livePlayers} human seats <em>Players 2–${state.livePlayers} choose after joining</em>`
        : '<i>Pod</i> Opponents <em>Choose each AI deck</em>';
      diplomacyRow.hidden = state.mode === 'online';
      advancedSummaryCopy.textContent = state.mode === 'online'
        ? 'Commander damage options for this human table'
        : 'Commander options, politics and difficulty';
      if (state.mode === 'online') {
        state.diplomacyEnabled = false;
        diplomacyRow.querySelector('input').checked = false;
      }
      renderBotStyles();
      updateStartLabel();
    };
    matchType.querySelectorAll('.matchtypebtn').forEach(button => {
      button.setAttribute('aria-pressed', button.dataset.mode === state.mode ? 'true' : 'false');
      button.onclick = () => setMatchMode(button.dataset.mode);
    });
    setMatchMode(state.mode);

    right.appendChild(el('div', 'credits',
      'All cards and images: <b>Scryfall</b>. The fixed set of official WotC precons passes separate card-by-card certification.'));

    const podStage = el('div', 'setupstagepanel podstage');
    [...right.childNodes].forEach(node => podStage.appendChild(node));
    const reviewStage = el('section', 'setupstagepanel reviewstage');
    reviewStage.setAttribute('aria-labelledby', 'setup-review-title');
    right.appendChild(podStage);
    right.appendChild(reviewStage);

    const renderReviewStage = () => {
      const botNames = ['AI Dragon', 'AI Wolf', 'AI Raven'];
      const seats = state.mode === 'online'
        ? Array.from({ length: state.livePlayers }, (_, index) => [
          String(index + 1).padStart(2, '0'), index === 0 ? 'You' : `Player ${index + 1}`,
          index === 0 ? state.deck || 'Choose a deck' : 'Chooses after joining', null,
        ])
        : [['01', 'You', state.deck || 'Choose a deck', null]].concat(Array.from({ length: state.ai }, (_, index) =>
          [String(index + 2).padStart(2, '0'), botNames[index], state.aiDecks[index] || 'Random deck', state.aiStyles[index]]));
      const seatMarkup = seats.map(([number, name, deck, styleKey]) => {
        const style = styleKey && MTG.AI_STYLES[styleKey];
        const styleName = style ? style.label : styleKey === 'random' ? 'Random style' : '';
        return `<div><i>${number}</i><span><b>${esc(name)}</b><small>${esc(deck)}</small></span>${styleName ? `<em class="reviewstyle" title="${escAttr(style?.description || STYLE_DESC[styleKey] || styleName)}">${style && style.portrait ? `<img src="${style.portrait}" alt="" onerror="MTG.imgFail(this)">` : `<strong aria-hidden="true">${style ? style.icon : '🎲'}</strong>`}<b>${esc(styleName)}</b></em>` : ''}</div>`;
      }).join('');
      reviewStage.innerHTML = `
        <div class="reviewhead"><span>Step 3 of 3</span><h2 id="setup-review-title">Review your table</h2><p>Everything below is public at the start of the game. You can go back without losing your choices.</p></div>
        <div class="reviewdeck">
          <img src="${state.deck ? commanderImg(state.deck) : MTG.BLANK_PX}" alt="" onerror="MTG.imgFail(this)">
          <div><small>YOUR DECK</small><b>${esc(state.deck || 'Not selected')}</b><span>${esc((state.commanders || []).join(' + ') || 'Choose a commander')}</span></div>
        </div>
        <div class="reviewseats">${seatMarkup}</div>
        <dl class="reviewrules">
          <div><dt>Mode</dt><dd>${state.mode === 'online' ? `${state.livePlayers} human players · no bots` : `Solo + ${state.ai} local AI V2`}</dd></div>
          ${state.mode === 'solo' ? `<div><dt>Difficulty</dt><dd>${esc(state.difficulty)}</dd></div>` : ''}
          <div><dt>Politics</dt><dd>${state.diplomacyEnabled ? 'Enabled after round 3' : 'Off'}</dd></div>
          <div><dt>Commander damage</dt><dd>${state.sumPartnerDamage ? 'House rule: combined' : 'Official: tracked separately'}</dd></div>
        </dl>
        <div class="reviewactions">
          <button type="button" class="pbtn reviewback">← Back to pod</button>
          <button type="button" class="pbtn primary reviewstart">${state.mode === 'online' ? `Create ${state.livePlayers}-player room` : 'Start game'}</button>
        </div>`;
      reviewStage.querySelector('.reviewback').onclick = () => setSetupStage('pod');
      reviewStage.querySelector('.reviewstart').onclick = launchSelectedTable;
    };

    const mobileBar = el('div', 'setupmobilebar');
    const mobileDeck = el('div', 'mobiledeck', '<span><small>Step 1 of 3</small><b>Choose a deck</b></span>');
    const mobileContinue = el('button', 'pbtn primary', 'Continue');
    mobileContinue.type = 'button';
    mobileContinue.disabled = true;
    mobileContinue.onclick = () => setSetupStage('pod');
    mobileBar.appendChild(mobileDeck);
    mobileBar.appendChild(mobileContinue);
    root.appendChild(mobileBar);

    const setSetupStage = stage => {
      if (!state.deck && stage !== 'deck') return;
      state.setupStage = ['deck', 'pod', 'review'].includes(stage) ? stage : 'deck';
      root.dataset.setupStage = state.setupStage;
      root.querySelectorAll('.setupstep').forEach(item => item.classList.toggle('on', item.dataset.step === state.setupStage));
      if (state.setupStage === 'deck') {
        right.classList.remove('mobile-open');
        left.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        if (state.setupStage === 'review') renderReviewStage();
        right.classList.add('mobile-open');
        right.scrollTop = 0;
      }
    };
    podNext.onclick = () => setSetupStage('review');

    root.querySelectorAll('.setupstep').forEach(step => {
      step.onclick = () => {
        if (step.disabled) return;
        setSetupStage(step.dataset.step);
      };
    });

    const importButton = diagnostics.querySelector('.debugimportbtn');
    const importFile = diagnostics.querySelector('.debugimportfile');
    const showImportStatus = (message, isError) => {
      importStatus.textContent = message;
      importStatus.classList.toggle('error', !!isError);
      importStatus.hidden = false;
    };
    const applyDebugReplay = replay => {
      const selectedEntry = [...deckList.querySelectorAll('.deckentry')].find(entry => entry.dataset.deck === replay.deck);
      if (!selectedEntry) throw new Error('Debug snapshot: the selected deck is not visible in this build.');
      (replay.aiCustomSkills || []).forEach(MTG.registerAISkill);
      state.applyingReplay = true;
      selectedEntry.querySelector('.deckcard').click();
      state.applyingReplay = false;
      setMatchMode('solo');
      state.commanders = replay.commanders.slice();
      state.ai = replay.ai;
      state.aiDecks = Array.from({ length: 3 }, (_, index) => replay.aiDecks[index] || '');
      state.aiStyles = Array.from({ length: 3 }, (_, index) => replay.aiStyles[index] || 'random');
      state.aiRandomCommanders = replay.aiRandomCommanders;
      state.sumPartnerDamage = replay.sumPartnerDamage;
      state.diplomacyEnabled = replay.diplomacyEnabled;
      state.difficulty = replay.difficulty;
      state.seed = String(replay.seed);
      aiRow.querySelectorAll('[data-ai-count]').forEach(button =>
        button.classList.toggle('selected', Number(button.dataset.aiCount) === state.ai));
      randRow.querySelector('input').checked = state.aiRandomCommanders;
      houseRow.querySelector('input').checked = state.sumPartnerDamage;
      diplomacyRow.querySelector('input').checked = state.diplomacyEnabled;
      diplomacyRow.classList.toggle('enabled', state.diplomacyEnabled);
      diffRow.querySelectorAll('[data-difficulty]').forEach(button =>
        button.classList.toggle('selected', button.dataset.difficulty === state.difficulty));
      renderCmdBox();
      renderBotStyles();
      updateStartLabel();
      advanced.open = true;
      replayNotice.hidden = false;
      replayNotice.innerHTML = `
        <small>DEBUG REPLAY LOADED</small>
        <b>Seed ${replay.seed} · captured at turn ${replay.checkpoint.turn}</b>
        <span>${esc(replay.deck)} · ${replay.ai} AI · ${esc(replay.difficulty.toUpperCase())}</span>
        <p>Start begins from turn 1 with these selections; editing them creates a replay variant. The public checkpoint remains reference evidence, not a saved game.</p>`;
      showImportStatus(`Loaded ${replay.deck}, seed ${replay.seed}. Review the table, then press Start game.`, false);
      setupSteps.forEach(step => {
        step.disabled = false;
        step.removeAttribute('aria-disabled');
        step.removeAttribute('title');
      });
      podNext.disabled = false;
      setSetupStage('review');
    };
    importButton.onclick = () => importFile.click();
    importFile.onchange = async () => {
      const file = importFile.files && importFile.files[0];
      if (!file) return;
      importButton.disabled = true;
      showImportStatus(`Reading ${file.name}…`, false);
      try {
        if (file.size > 2 * 1024 * 1024) throw new Error('Debug snapshot: the selected file is larger than 2 MB.');
        applyDebugReplay(MTG.parseDebugBundle(await file.text()));
      } catch (error) {
        state.applyingReplay = false;
        showImportStatus(error && error.message ? error.message : 'Debug snapshot: import failed.', true);
      } finally {
        importButton.disabled = false;
        importFile.value = '';
      }
    };
    if (options.importedDeckId) {
      const saved = U.getImportedDeckLibraryEntry(options.importedDeckId);
      const selectedEntry = [...deckList.querySelectorAll('.deckentry')].find(entry => entry.dataset.deck === saved?.name);
      if (!selectedEntry) throw new Error('This saved deck is no longer available. Reopen My Library and try again.');
      selectedEntry.querySelector('.deckcard').click();
    }
    filterDecks();
  }

  // ---------- Izbor komandera (1 ili 2 partnera) ----------
  function pickCommanders(deckName, current) {
    const deck = MTG.DECKS[deckName];
    const legals = MTG.legalCommanders(deck, MTG.DEFS);
    let sel = (current && current.length ? current : MTG.defaultCommanders(deck, MTG.DEFS)).slice(0, 2);

    return new Promise(resolve => {
      const ov = el('div', 'overlay dark');
      const m = el('div', 'modal wide');
      m.appendChild(el('div', 'mtitle', `👑 Commanders: ${esc(deckName)}`));
      m.appendChild(el('div', 'cmdhint',
        'Click a card to select it. Cards with 🤝 <b>Partner</b> may be paired. ' +
        'Choose one, then click a compatible second card outlined in green. ' +
        'The rest of the deck stays unchanged; unselected legends go into the library.'));

      const grid = el('div', 'cmdgrid');
      m.appendChild(grid);
      const status = el('div', 'cmdstatus');
      m.appendChild(status);

      const row = el('div', 'btnrow');
      const okBtn = el('button', 'pbtn primary', 'Confirm ✔');
      const defBtn = el('button', 'pbtn', '↩ Default');
      const cancel = el('button', 'pbtn danger', 'Cancel');
      row.appendChild(okBtn); row.appendChild(defBtn); row.appendChild(cancel);
      m.appendChild(row);

      function draw() {
        grid.innerHTML = '';
        const soloDef = sel.length === 1 ? MTG.DEFS[sel[0]] : null;
        for (const L of legals) {
          const on = sel.indexOf(L.name) >= 0;
          const pairable = !!soloDef && !on && MTG.canPartner(soloDef, L.def);
          const c = el('div', 'cmdopt' + (on ? ' selected' : '') + (pairable ? ' pairable' : ''));
          c.innerHTML = `
            <img loading="lazy" src="${cardImg(L.name)}" onerror="MTG.imgFail(this)">
            <div class="cmdoptinfo">
              <div class="cmdoptname">${on ? '👑 ' : ''}${esc(L.name)}${L.isDefault ? ' <span class="deft">(original)</span>' : ''}</div>
              <div class="cmdopttype">${esc(typeLine(L.def))} · ${esc(L.def.cost || '')}</div>
              ${L.tag.kind ? `<div class="cmdbadge">${esc(L.partnerLabel)}</div>` : ''}
            </div>`;
          c.onclick = () => {
            const i = sel.indexOf(L.name);
            if (i >= 0) { if (sel.length > 1) sel.splice(i, 1); }
            else if (sel.length === 1 && MTG.canPartner(MTG.DEFS[sel[0]], L.def)) sel.push(L.name);
            else sel = [L.name];
            draw();
          };
          grid.appendChild(c);
        }
        const v = MTG.validateCommanders(deck, sel, MTG.DEFS);
        status.className = 'cmdstatus ' + (v.ok ? 'good' : 'bad');
        status.innerHTML = v.ok
          ? `✅ ${sel.map(n => esc(n)).join(' <b>+</b> ')}${sel.length === 2 ? ' (two commanders)' : ''}`
          : `⛔ ${esc(v.why)}`;
        okBtn.disabled = !v.ok;
      }
      draw();

      okBtn.onclick = () => { ov.remove(); resolve(sel.slice()); };
      defBtn.onclick = () => { sel = MTG.defaultCommanders(deck, MTG.DEFS); draw(); };
      cancel.onclick = () => { ov.remove(); resolve(null); };
      ov.onclick = e => { if (e.target === ov) { ov.remove(); resolve(null); } };
      ov.appendChild(m);
      document.body.appendChild(ov);
      U.enhanceDialog(ov, m, { label: `Choose commanders for ${deckName}` });
    });
  }

  async function openOnlineLobby(state, roomCode = null) {
    const root = $('#setup');
    root.style.display = 'block';
    $('#game').style.display = 'none';
    document.body.classList.remove('game-active');
    if (typeof MTG.createHiggsfieldRoomClient !== 'function') {
      root.innerHTML = `
        <main class="online-lobby unavailable">
          <header class="online-lobby-head"><button type="button" class="online-back">← Back</button><div><span>COMMANDER LIVE</span><h1>Live rooms open on the deployed game.</h1><p>The local build includes the complete multiplayer engine and UI. Open the Vercel preview or Higgsfield Games link to create or join an internet room.</p></div></header>
          <section class="online-unavailable-card"><i></i><div><small>LOCAL PREVIEW</small><b>The online room service is not active on this origin</b><span>No account or external model service is required for guest play.</span></div></section>
        </main>`;
      root.querySelector('.online-back').onclick = renderSetup;
      return null;
    }
    root.innerHTML = '<main class="online-lobby loading"><div class="online-waiting-game"><i></i><h1>Opening your private table…</h1></div></main>';
    try {
      const client = await MTG.createHiggsfieldRoomClient({
        create: !roomCode, roomCode, playerCount: state && state.livePlayers,
      });
      return MTG.mountOnlineLobby({
        root,
        client,
        initialSelection: state ? {
          name: 'Host', deck: state.deck, commanders: state.commanders,
          playerCount: state.livePlayers,
          sumPartnerDamage: state.sumPartnerDamage,
          seed: state.seed ? parseInt(state.seed, 10) : Math.floor(Math.random() * 1e9),
        } : null,
        onHostStart: (view, roomClient) => MTG.startOnlineHostGame(view, roomClient),
        onBack: () => {
          if (roomCode) location.href = location.pathname;
          else renderSetup();
        },
      });
    } catch (error) {
      root.innerHTML = `<main class="online-lobby unavailable"><header class="online-lobby-head"><button type="button" class="online-back">← Back</button><div><span>COMMANDER LIVE</span><h1>The live room could not open.</h1><p>${esc(error.message)}</p></div></header></main>`;
      root.querySelector('.online-back').onclick = renderSetup;
      return null;
    }
  }

  MTG.openOnlineLobby = openOnlineLobby;

  function startGame(state) {
    if (state.importedDeckId) {
      if (state.importedLibraryOwner !== currentImportedLibraryOwner()) throw new Error('Your account changed. Select the deck again from My Library.');
      const entry = MTG.getImportedDeckLibraryEntry(state.importedDeckId);
      if (!entry || entry.name !== state.deck) throw new Error('This saved deck is no longer in My Library.');
      const validation = MTG.validateImportedDeckRecord(entry.record);
      if (!validation.ok) throw new Error(validation.errors[0]?.message || 'This deck no longer passes the engine check.');
      const selectedCommanders = MTG.validateImportedDeck(entry.record, { name: entry.name, commanders: state.commanders });
      if (!selectedCommanders.ok) throw new Error(selectedCommanders.errors[0]?.message || 'Select legal commanders for this deck.');
      MTG.registerImportedDeck(validation, { replace: true });
    }
    const resumeSave = state.resumeSave ? MTG.validateAccountSave(state.resumeSave) : null;
    // A save that carries a written-down board needs no replay at all: the
    // timeline is only read for saves made before real state saves existed.
    const restoringBoard = !!(resumeSave && resumeSave.state);
    const savedTimeline = resumeSave && !restoringBoard ? resumeSave.decisions.slice() : [];
    const recordedTimeline = resumeSave ? resumeSave.decisions.slice() : [];
    let replayCursor = 0;
    let replayingSave = !!resumeSave && !restoringBoard;
    const matchId = resumeSave?.matchId || (globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID() : `match-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const matchCreatedAt = resumeSave?.createdAt || new Date().toISOString();
    const seed = state.seed ? parseInt(state.seed, 10) : Math.floor(Math.random() * 1e9);
    const rnd = MTG.mulberry32(seed);
    const remoteHumans = Array.isArray(state.remoteHumans)
      ? state.remoteHumans
      : state.remoteHuman ? [state.remoteHuman] : [];
    const aiDecks = remoteHumans.length ? [] : MTG.selectAIDecks(state.deck, state.ai, state.aiDecks, rnd);

    const ui = new MTG.UI();
    if (resumeSave?.setup.manaMode === 'manual' || resumeSave?.setup.manaMode === 'auto') ui.manaMode = resumeSave.setup.manaMode;
    if (resumeSave?.setup.prioMode) ui.prioMode = resumeSave.setup.prioMode;
    let gameRef = null;
    let saveSetup = null;
    let saveTimer = null;
    let queueAccountSave = () => {};
    let completeAccountMatch = () => {};
    let onlineSyncQueued = false;
    const queueOnlineSync = () => {
      if (!state.onlineBridge || !gameRef || onlineSyncQueued) return;
      onlineSyncQueued = true;
      queueMicrotask(() => {
        onlineSyncQueued = false;
        state.onlineBridge.syncGame(gameRef).then(() => ui.clearSyncError()).catch(error => {
          console.error(error);
          ui.setSyncError(`Live sync paused: ${error.message}`, queueOnlineSync);
        });
      });
    };
    document.body.classList.add('game-active');
    $('#setup').style.display = 'none';
    $('#game').style.display = 'flex';

    const g = MTG.newGame({
      humanDeck: state.deck,
      aiDecks,
      aiStyles: state.aiStyles.slice(0, state.ai),
      aiCustomSkills: resumeSave?.setup.aiCustomSkills || MTG.snapshotAISkills(state.aiStyles.slice(0, state.ai)),
      humanCommanders: (state.commanders && state.commanders.length) ? state.commanders : undefined,
      remoteHumans,
      aiRandomCommanders: state.aiRandomCommanders,
      sumPartnerDamage: state.sumPartnerDamage,
      diplomacyEnabled: state.diplomacyEnabled,
      seed,
      difficulty: state.difficulty,
      humanName: 'You',
      maxTurns: 200,
      // Save replay must preserve the exact interactive decision graph: paced
      // mode also controls reveal/Proceed checkpoints and full local-AI search,
      // not only animation delays. A resumed game therefore stays paced while
      // speedFactor=0 below removes waits until the recorded timeline catches up.
      paced: true,
      humanController: (p) => {
        ui.me = p;
        p.manualMana = ui.manaMode === 'manual';
        const human = ui.controllerFor(p);
        return {
          async decide(game, request) {
            // A checkpoint replays the recorded decisions against a fresh game.
            // When the rules engine or the AI changed since the save, a recorded
            // answer can stop matching the question it now receives. That must
            // not end the table: replay stops there and the seat plays on from
            // the state reached so far.
            const abandonReplay = error => {
              console.error('Saved game replay stopped early:', error);
              const restored = replayCursor;
              savedTimeline.length = replayCursor;
              recordedTimeline.length = Math.min(recordedTimeline.length, replayCursor);
              ui.toast(`Saved game restored up to turn ${game.turnNo} (${restored} of ${resumeSave.decisions.length} actions). The rules engine changed since this save, so play continues from here.`);
            };
            try {
              while (replayCursor < savedTimeline.length && savedTimeline[replayCursor]?.kind === 'side') {
                const side = savedTimeline[replayCursor];
                replayCursor += 1;
                ui.accountReplay = { current: replayCursor, total: savedTimeline.length };
                await MTG.replayAccountSideAction(game, p, side.action);
              }
              if (replayCursor < savedTimeline.length) {
                const recorded = savedTimeline[replayCursor];
                if (recorded?.kind && recorded.kind !== 'decision') throw new Error(`Saved game: timeline entry ${replayCursor + 1} is invalid.`);
                const result = MTG.restoreSaveDecision(request, p, recorded);
                replayCursor += 1;
                ui.accountReplay = { current: replayCursor, total: savedTimeline.length };
                return result;
              }
            } catch (error) {
              if (!replayingSave) throw error;
              abandonReplay(error);
            }
            if (replayingSave) {
              replayingSave = false;
              game.paced = true;
              ui.applySpeed();
              ui.accountReplay = null;
              ui.toast(`Saved game restored · turn ${game.turnNo} · ${recordedTimeline.length} recorded actions.`);
              queueAccountSave({ immediate: true });
            }
            const result = await human.decide(game, request);
            recordedTimeline.push({ kind: 'decision', ...MTG.recordSaveDecision(request, p, result) });
            queueAccountSave();
            return result;
          },
        };
      },
      onEvent: (e) => {
        if (e.type === 'turn' && e.p) ui.showBanner(e.p === ui.me ? '⭐ YOUR TURN' : `Turn ${g.turnNo}: ${e.p.name}`, e.p === ui.me);
        if (e.type === 'spotlight') ui.showSpot(e.text, e.kind);
        if (e.type === 'effectNotice') ui.showEffectNotice(e.text, e.kind, e);
        if (e.type === 'gameEffect') ui.showGameEffect(e);
        if (e.type === 'battlefieldArrival') ui.showBattlefieldArrival(e);
        if (e.type === 'monarchChanged') ui.showMonarchChange(e);
        if (e.type === 'diplomacy' && e.text) {
          ui.showDiplomacyEvent(e);
          if (e.proposal && e.proposal.status === 'pending-human' && e.proposal.toId === ui.me?.idx) {
            ui.sidebarTab = 'diplomacy';
            ui.utilityDrawerOpen = true;
          }
        }
        const signatureReaction = gameRef && MTG.signatureReactionForEvent && MTG.signatureReactionForEvent(gameRef, e);
        if (signatureReaction) ui.showPersonaReaction(signatureReaction);
        if (e.type === 'gameover') completeAccountMatch();
        ui.queueRender();
        queueOnlineSync();
      },
    });
    gameRef = g;
    const actualAIPlayers = g.players.filter(player => player.isAI)
      .sort((a, b) => (a.onlineSeat ?? a.idx) - (b.onlineSeat ?? b.idx));
    saveSetup = remoteHumans.length ? null : {
      deck: state.deck,
      commanders: ui.me.commanders.map(card => card.name),
      ai: aiDecks.length,
      aiDecks: aiDecks.slice(),
      aiStyles: actualAIPlayers.map(player => player.requestedAIStyle || player.aiStyle || 'balanced'),
      aiRandomCommanders: !!state.aiRandomCommanders,
      sumPartnerDamage: !!state.sumPartnerDamage,
      diplomacyEnabled: !!state.diplomacyEnabled,
      difficulty: state.difficulty || 'normal',
      manaMode: ui.manaMode,
      prioMode: ui.prioMode,
      seed: String(seed),
      createdAt: matchCreatedAt,
    };
    // A checkpoint now carries the list of every imported deck at the table, so
    // Continue can rebuild the match. It is refused only when a custom deck in
    // play has no saved record to carry (a deck removed from My Library).
    const customDecksInPlay = [state.deck, ...(aiDecks || [])]
      .filter(name => name && MTG.DECKS[name]?.custom);
    const accountCheckpointEnabled = !!saveSetup &&
      customDecksInPlay.every(name => !!MTG.importedDeckRecordFor?.(name));
    // The board as of the last turn boundary. A resume restores this directly;
    // the recorded timeline is only the fallback for older saves.
    let latestBoardState = resumeSave?.state || null;
    g.onTurnCheckpoint = () => {
      const snapshot = MTG.captureGameState(g);
      if (snapshot) { latestBoardState = snapshot; queueAccountSave(); }
    };
    let gameAccountOwnerId = globalThis.MTGAccount?.user?.id || null;
    let accountBindingDisabled = false;
    const accountCanWrite = () => !accountBindingDisabled
      && !!gameAccountOwnerId
      && globalThis.MTGAccount?.user?.id === gameAccountOwnerId;
    const disableAccountBinding = () => {
      if (accountBindingDisabled) return;
      accountBindingDisabled = true;
      clearTimeout(saveTimer);
      ui.accountSaveStatus = { state: 'error', text: 'Profile changed · saves paused' };
      ui.queueRender();
    };
    const writeAccountSave = async ({ notify = false } = {}) => {
      if (!accountCheckpointEnabled || g.gameOver || !accountCanWrite()) return false;
      clearTimeout(saveTimer);
      ui.accountSaveStatus = { state: 'saving', text: 'Saving…' };
      ui.queueRender();
      try {
        await globalThis.MTGAccount.saveGame(
          MTG.buildAccountSave(g, saveSetup, recordedTimeline, matchId, latestBoardState), gameAccountOwnerId);
        ui.accountSaveStatus = { state: 'saved', text: `Saved · turn ${g.turnNo}` };
        if (notify) ui.toast('Solo game saved to your profile.');
        ui.queueRender();
        return true;
      } catch (error) {
        ui.accountSaveStatus = accountBindingDisabled
          ? { state: 'error', text: 'Profile changed · saves paused' }
          : { state: 'error', text: 'Save failed' };
        ui.toast(`Save failed: ${error.message}`);
        ui.queueRender();
        return false;
      }
    };
    queueAccountSave = ({ immediate = false, notify = false } = {}) => {
      if (!accountCheckpointEnabled || g.gameOver || !accountCanWrite()) return;
      clearTimeout(saveTimer);
      if (immediate) void writeAccountSave({ notify });
      else saveTimer = setTimeout(() => void writeAccountSave(), 450);
    };
    let matchRecorded = false;
    completeAccountMatch = () => {
      if (matchRecorded || !saveSetup || !accountCanWrite()) return Promise.resolve(false);
      matchRecorded = true;
      clearTimeout(saveTimer);
      return globalThis.MTGAccount.completeMatch({
        matchId,
        deck: saveSetup.deck,
        commanders: saveSetup.commanders,
        won: g.winner === ui.me,
        turns: g.turnNo,
      }, gameAccountOwnerId).then(() => {
        ui.accountSaveStatus = { state: 'complete', text: 'Stats updated' };
        ui.queueRender();
        return true;
      }).catch(error => {
        matchRecorded = false;
        ui.accountSaveStatus = accountBindingDisabled
          ? { state: 'error', text: 'Profile changed · saves paused' }
          : { state: 'error', text: 'Stats pending' };
        console.error('Commander profile stats update failed:', error);
        return false;
      });
    };
    // An eliminated seat can leave a game the remaining players keep going.
    // The loss is recorded exactly like any other completed match before the
    // page returns to the profile view.
    MTG.leaveAsLoss = async () => {
      if (!ui.me || !ui.me.lost) return false;
      clearTimeout(saveTimer);
      try { await completeAccountMatch(); } catch (error) { console.error(error); }
      // Keep the address the player arrived with and only add the marker the
      // entry page consumes, so a signed-in seat lands on its profile.
      const params = new URLSearchParams(location.search);
      if (globalThis.MTGAccount?.user) params.set('view', 'profile');
      else params.delete('view');
      const query = params.toString();
      location.replace(location.pathname + (query ? `?${query}` : ''));
      return true;
    };
    if (window._accountGameCleanup) window._accountGameCleanup();
    let lastObservedAccountOwner = gameAccountOwnerId;
    const accountChange = event => {
      const ownerId = event.detail?.user?.id || null;
      if (!accountBindingDisabled && ownerId && gameAccountOwnerId && ownerId !== gameAccountOwnerId) {
        disableAccountBinding();
      } else if (!accountBindingDisabled && ownerId && !gameAccountOwnerId && !g.gameOver) {
        // A guest game may opt into persistence on its first successful login.
        gameAccountOwnerId = ownerId;
        queueAccountSave({ immediate: true });
      } else if (!accountBindingDisabled && ownerId === gameAccountOwnerId && !lastObservedAccountOwner && !g.gameOver) {
        // Logging back into the same account may resume that account's saves.
        queueAccountSave({ immediate: true });
      } else if (!ownerId && lastObservedAccountOwner) {
        clearTimeout(saveTimer);
        ui.accountSaveStatus = null;
        ui.queueRender();
      }
      lastObservedAccountOwner = ownerId;
    };
    MTG.flushAccountSave = options => writeAccountSave(options);
    const captureAccountSideAction = entry => {
      if (!accountCheckpointEnabled || g.gameOver || !entry) return false;
      recordedTimeline.push({ kind: 'side', action: MTG.portableAccountSideAction(g, ui.me, entry) });
      queueAccountSave({ immediate: true });
      return true;
    };
    MTG.captureAccountSideAction = captureAccountSideAction;
    window.addEventListener('mtg:account-change', accountChange);
    window._accountGameCleanup = () => {
      clearTimeout(saveTimer);
      window.removeEventListener('mtg:account-change', accountChange);
      if (MTG.captureAccountSideAction === captureAccountSideAction) delete MTG.captureAccountSideAction;
    };
    MTG.activeAccountMatch = { matchId, setup: saveSetup, decisions: recordedTimeline };
    if (state.onlineBridge && state.onlineBridge.setManualActionHandler) {
      state.onlineBridge.setManualActionHandler(async request => {
        const actor = g.players.find(player => (player.onlineSeat ?? player.idx) === request.seat && !player.isAI);
        if (!actor) throw new Error('The requesting human seat is not available.');
        const action = request.action || {};
        let result;
        if (action.type === 'setPause') {
          const paused = !!action.value;
          ui.lastResortActive = paused;
          ui.showJudge = false;
          g.setLastResortPaused(paused);
          g.lastResortLog(actor, paused ? 'opened remote recovery mode' : 'finished remote recovery mode');
          result = { ok: true, text: paused ? 'Last Resort active.' : 'Recovery finished.' };
        } else {
          if (!g.lastResortPaused) throw new Error('Enable Last Resort before sending a correction.');
          result = g.applyLastResortAction(actor, action);
        }
        ui.queueRender();
        await state.onlineBridge.syncGame(g);
        return result;
      });
    }
    if (!state.onlineBridge) {
      const rematchDecks = aiDecks.slice();
      const rematchStyles = g.players.filter(player => player.isAI)
        .sort((a, b) => a.onlineSeat - b.onlineSeat)
        .map(player => player.aiStyle || player.requestedAIStyle || 'balanced');
      MTG.rematchLastGame = () => startGame({
        deck: state.deck,
        importedDeckId: state.importedDeckId,
        importedLibraryOwner: state.importedLibraryOwner,
        ai: state.ai,
        mode: 'solo',
        difficulty: state.difficulty,
        seed: '',
        aiDecks: rematchDecks.slice(),
        aiStyles: rematchStyles.slice(),
        commanders: state.commanders.slice(),
        aiRandomCommanders: state.aiRandomCommanders,
        sumPartnerDamage: state.sumPartnerDamage,
        diplomacyEnabled: state.diplomacyEnabled,
      });
    }
    ui.game = g;
    ui.applySpeed();
    if (resumeSave) g.speedFactor = 0;
    window._game = g;
    window._ui = ui;
    ui.render();
    if (accountCheckpointEnabled && !resumeSave && globalThis.MTGAccount?.user) queueAccountSave({ immediate: true });
    if (resumeSave) {
      ui.accountReplay = { current: 0, total: savedTimeline.length };
      ui.toast(`Restoring ${savedTimeline.length} saved actions…`);
    }
    const cmdTxt = (state.commanders || []).map(n => n.split(',')[0]).join(' + ');
    const smokeScenario = new URLSearchParams(window.location.search).get('smokeScenario');
    if (!smokeScenario) ui.toast(remoteHumans.length
      ? `Seed: ${seed} · 👑 ${cmdTxt} · ${remoteHumans.length + 1} live players`
      : `Seed: ${seed} · 👑 ${cmdTxt} · Opponents: ${aiDecks.join(', ')}`);
    // Deterministički browser scenario za card-sheet interakcije koje bi kroz
    // nasumičnu biblioteku bilo teško pouzdano dovesti na ekran. Aktivira se
    // isključivo eksplicitnim smokeScenario query parametrom.
    if (smokeScenario === 'diplomacy') {
      // Stabilna javna tabla za provjeru optional toggle-a, otključavanja,
      // offer buildera i aktivnog ugovora bez čekanja dvanaest prirodnih
      // poteza. Dostupno isključivo eksplicitnom browser-smoke parametru.
      if (!g.diplomacy || !g.diplomacy.enabled) MTG.initDiplomacy(g, true);
      for (const player of g.players) {
        player.turnsStarted = 3;
        const creature = new MTG.CardInst(MTG.DEFS['Stormcatch Mentor'], player);
        creature.ctrl = player; creature.zone = 'battlefield'; creature.sick = false; creature.tapped = false;
        g.battlefield.push(creature);
      }
      g.turnPlayer = ui.me; g.turnNo = 13; g.phase = 'main1'; g.step = 'main'; g.paced = false;
      g.recalc();
      const botDiplomacyScenario = new URLSearchParams(window.location.search).get('botDiplomacy');
      if (botDiplomacyScenario === '1') {
        // Poseban vizuelni canary: napravi objektivnog runaway lidera i pusti
        // dva bota da sama sklope javni, vremenski ograničen ugovor.
        ui.me.life = 500;
        const initiator = g.players.find(player => player.isAI && !player.lost);
        void g.processDiplomacyCheckpoint(initiator);
      } else if (botDiplomacyScenario === 'shared') {
        // Jači, ali ne runaway, javni permanent je dovoljan razlog da dva bota
        // pregovaraju. Ovaj canary čuva upravo taj uobičajeni Commander slučaj.
        const threat = new MTG.CardInst(MTG.DEFS['Inferno Titan'], ui.me);
        threat.ctrl = ui.me; threat.zone = 'battlefield'; threat.sick = false; threat.tapped = false;
        g.battlefield.push(threat);
        g.recalc();
        const initiator = g.players.find(player => player.isAI && !player.lost);
        void g.processDiplomacyCheckpoint(initiator);
      } else if (botDiplomacyScenario === 'human') {
        // Regression canary for the old routing bug: an AI with a meaningful
        // public deal must ask the human directly instead of always choosing a bot.
        const leader = g.players.find(player => player.isAI && !player.lost);
        const initiator = g.players.find(player => player.isAI && !player.lost && player !== leader);
        leader.life = 500;
        const threat = new MTG.CardInst(MTG.DEFS['Inferno Titan'], leader);
        threat.ctrl = leader; threat.zone = 'battlefield'; threat.sick = false;
        const safeAttacker = new MTG.CardInst(MTG.DEFS['Inferno Titan'], ui.me);
        safeAttacker.ctrl = ui.me; safeAttacker.zone = 'battlefield'; safeAttacker.sick = false;
        g.battlefield.push(threat, safeAttacker); g.recalc();
        void g.processDiplomacyCheckpoint(initiator);
      } else if (botDiplomacyScenario === 'group') {
        // Three-player pact canary: remover + human + one bot coordinate against
        // an objective bot leader, with the exact spell and permanent public.
        const leader = g.players.find(player => player.isAI && !player.lost);
        const remover = g.players.find(player => player.isAI && !player.lost && player !== leader);
        leader.life = 500;
        const threat = new MTG.CardInst(MTG.DEFS['Inferno Titan'], leader);
        threat.ctrl = leader; threat.zone = 'battlefield'; threat.sick = false;
        g.battlefield.push(threat);
        for (let i = 0; i < 3; i++) {
          const forest = new MTG.CardInst(MTG.DEFS.Forest, remover);
          forest.ctrl = remover; forest.zone = 'battlefield'; forest.sick = false; forest.tapped = false;
          g.battlefield.push(forest);
        }
        const removal = new MTG.CardInst(MTG.DEFS['Beast Within'], remover);
        removal.zone = 'hand'; remover.hand.push(removal);
        g.turnPlayer = remover; g.recalc();
        void g.processDiplomacyCheckpoint(remover);
      } else if (botDiplomacyScenario === 'human-compose') {
        // Human-initiated offer canary: open the real composer so browser QA
        // clicks the production Send handler and reaches the blocking result
        // review instead of constructing a synthetic pending decision.
        const [leader, recipient] = g.players.filter(player => player.isAI && !player.lost);
        leader.life = 500;
        for (let i = 0; i < 2; i++) {
          const creature = new MTG.CardInst(MTG.DEFS['Inferno Titan'], ui.me);
          creature.ctrl = ui.me; creature.zone = 'battlefield'; creature.sick = false; creature.tapped = false;
          g.battlefield.push(creature);
        }
        g.recalc();
        ui.beginDiplomacyOffer(g, recipient);
        if (ui.diplomacyComposer) {
          ui.diplomacyComposer.requestKey = `no_attack:${ui.me.idx}`;
          ui.diplomacyComposer.offerKey = `no_attack:${recipient.idx}`;
          ui.render();
        }
      }
      ui.sidebarTab = 'diplomacy';
      ui.render();
      return;
    }
    if (smokeScenario === 'visualCardChoice') {
      void (async () => {
        const choice = new URLSearchParams(window.location.search).get('smokeChoice') || 'clash';
        g.turnPlayer = ui.me; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        if (choice === 'clash') {
          const opponent = g.players.find(player => player !== ui.me);
          for (const player of g.players) if (player !== ui.me && player !== opponent) player.lost = true;
          const mine = new MTG.CardInst(MTG.DEFS.Cultivate, ui.me);
          mine.zone = 'library'; ui.me.library.push(mine);
          const theirs = new MTG.CardInst(MTG.DEFS['Sol Ring'], opponent);
          theirs.zone = 'library'; opponent.library.push(theirs);
          ui.toast('Clash canary: the revealed card must appear as art before choosing top or bottom.');
          ui.render();
          const won = await MTG.E7.clash(g, ui.me);
          g.lg(`Clash visual canary resolved: ${won ? 'won' : 'lost or tied'}.`, 'effect');
        } else if (choice === 'discover') {
          const hit = new MTG.CardInst(MTG.DEFS["Night's Whisper"], ui.me);
          hit.zone = 'library'; ui.me.library.push(hit);
          ui.toast('Discover canary: the exiled card must appear as art before choosing cast or hand.');
          ui.render();
          await MTG.E7.discover(g, ui.me, 2);
          g.lg(`Discover visual canary resolved: Night's Whisper moved to ${hit.zone}.`, 'effect');
        } else if (choice === 'piles') {
          const faceUp = ['Island', 'Cultivate', 'Sol Ring', "Night's Whisper"].map(name => {
            const card = new MTG.CardInst(MTG.DEFS[name], ui.me);
            card.zone = 'exile';
            return card;
          });
          ui.toast('Exile-pile canary: face-up cards show art; hidden cards show only card backs.');
          ui.render();
          const pile = await ui.me.controller.decide(g, {
            type: 'chooseOption', prompt: 'Exile piles — which pile goes to the graveyard?',
            options: [
              { key: 'down', label: 'Face-down pile (4 hidden cards)', hiddenCount: 4 },
              { key: 'up', label: 'Face-up pile', cards: faceUp },
            ],
            aiHint: { kind: 'abstractPile', faceDownCount: 4 },
          });
          g.lg(`Exile-pile visual canary resolved: chose ${pile === 'down' ? 'face-down' : 'face-up'} pile.`, 'effect');
        } else {
          throw new Error(`Unknown visual card choice canary: ${choice}`);
        }
        ui.showLog = true;
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'monarchVisibility') {
      void (async () => {
        const mode = new URLSearchParams(window.location.search).get('smokeCrown') || 'initial';
        g.turnPlayer = ui.me; g.turnNo = 9; g.phase = mode === 'transfer' ? 'combat' : 'main1';
        g.step = mode === 'transfer' ? 'damage' : 'main'; g.paced = false;
        if (mode === 'transfer') {
          g.monarch = ui.me;
          g.monarchSince = { turn: 8, phase: 'main1', step: '', reason: 'Palace Jailer entered', sourceName: 'Palace Jailer' };
          const opponent = g.players.find(player => player !== ui.me && !player.lost);
          g.turnPlayer = opponent;
          const attacker = new MTG.CardInst(MTG.DEFS['Willie Lumpkin, Postman'], opponent);
          attacker.ctrl = opponent; attacker.zone = 'battlefield'; attacker.sick = false;
          attacker.attacking = ui.me;
          g.battlefield.push(attacker);
          g.recalc(); ui.render();
          await g.damagePlayer(attacker, ui.me, 1, { combat: true, deferSBA: true });
        } else {
          const jailer = new MTG.CardInst(MTG.DEFS['Palace Jailer'], ui.me);
          jailer.ctrl = ui.me; jailer.zone = 'battlefield'; jailer.sick = false;
          g.battlefield.push(jailer);
          g.recalc(); ui.render();
          await g.becomeMonarch(ui.me, { reason: 'entered the battlefield', source: jailer });
        }
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'spellTargetVisibility') {
      void (async () => {
        const mode = new URLSearchParams(window.location.search).get('smokeStack') || 'original';
        const opponent = g.players.find(player => player !== ui.me && !player.lost);
        g.turnPlayer = opponent; g.turnNo = 12; g.phase = 'main1'; g.step = 'main'; g.paced = false;

        const place = (player, name) => {
          const card = new MTG.CardInst(MTG.DEFS[name], player);
          card.ctrl = player; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const solRing = place(ui.me, 'Sol Ring');
        const jailer = place(ui.me, 'Palace Jailer');
        const signet = place(ui.me, 'Arcane Signet');
        const stella = place(opponent, 'Stella Lee, Wild Card');
        g.recalc();
        const warp = new MTG.CardInst(MTG.DEFS['Chaos Warp'], opponent);
        warp.ctrl = opponent; warp.zone = 'stack';
        const targetSpec = {
          zone: 'battlefield', what: 'permanent', count: 1,
          filter: (game, card) => card.ctrl === ui.me,
        };
        const original = {
          kind: 'spell', card: warp, ctrl: opponent, name: warp.name,
          targets: [solRing], targetSpecs: [targetSpec], castOpts: {}, copyOf: null,
        };
        g.stack.push(original);
        g.note('stack', {});

        if (mode !== 'original') {
          const previousController = opponent.controller;
          let wanted = jailer;
          opponent.controller = {
            decide: async (game, q) => {
              if (q.type === 'chooseOption' && q.aiHint && q.aiHint.kind === 'newTargets') return 'yes';
              if (q.type === 'chooseTargets' && q.candidates.includes(wanted)) return [wanted];
              return previousController.decide(game, q);
            },
          };
          await g.copySpell(original, opponent, { mayNewTargets: true, copySource: stella });
          if (mode === 'multi') {
            wanted = signet;
            await g.copySpell(original, opponent, { mayNewTargets: true, copySource: stella });
          }
          opponent.controller = previousController;
        }

        g.recalc();
        ui.stackPopup = true;
        ui.stackPopDismissed = 0;
        ui.react = {
          q: { type: 'priority', player: ui.me, casts: [], acts: [] },
          resolve: () => {},
        };
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'infernoTargeting') {
      void (async () => {
        const titan = new MTG.CardInst(MTG.DEFS['Inferno Titan'], ui.me);
        titan.ctrl = ui.me; titan.zone = 'battlefield'; titan.sick = false;
        g.battlefield.push(titan);
        const opponents = g.players.filter(player => player !== ui.me && !player.lost);
        const names = ['Stormcatch Mentor', 'Ignoble Hierarch', 'Oft-Nabbed Goat'];
        opponents.forEach((player, index) => {
          const card = new MTG.CardInst(MTG.DEFS[names[index]], player);
          card.ctrl = player; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          ui.collapsed = ui.collapsed || new Set();
          ui.collapsed.delete(player.idx);
        });
        g.turnPlayer = ui.me; g.turnNo = 12; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Inferno Titan: choose 1-3 glowing targets, confirm the numbered set, then divide exactly 3 damage.');
        ui.render();
        await g.emit('etb', { card: titan });
        await g.flushTriggers();
        g.lg('Inferno Titan targeting smoke: targets and damage split are locked on the stack.', 'effect');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'resourceChoice') {
      const pizza = new MTG.CardInst(MTG.DEFS['Ninja Pizza'], ui.me);
      pizza.ctrl = ui.me; pizza.zone = 'battlefield';
      const food = new MTG.CardInst(MTG.TOKENS.food, ui.me);
      food.ctrl = ui.me; food.zone = 'battlefield'; food.isToken = true;
      g.battlefield.push(pizza, food);
      g.turnPlayer = ui.me; g.turnNo = 1; g.phase = 'main1'; g.step = 'main';
      ui.me.pool.C = 2;
      g.recalc();
      const acts = g.activatableList(ui.me);
      void ui.me.controller.decide(g, {
        type: 'main', player: ui.me, casts: [], acts, lands: [], phase: g.phase,
      }).then(action => g.performAction(ui.me, action));
      ui.sheet = { card: food };
      ui.render();
      return;
    }
    if (smokeScenario === 'battlefieldLayout') {
      const smokeStation = new URLSearchParams(window.location.search).get('smokeStation') || 'offline';
      const smokeEliminate = Number(new URLSearchParams(window.location.search).get('smokeEliminate') || 0);
      const place = (player, name) => {
        const card = new MTG.CardInst(MTG.DEFS[name], player);
        card.ctrl = player; card.zone = 'battlefield'; card.sick = false; card.tapped = false;
        g.battlefield.push(card);
        return card;
      };
      const addLands = (player, names) => names.forEach(name => place(player, name));

      place(ui.me, 'Stormcatch Mentor');
      place(ui.me, 'Harmonic Prodigy');
      place(ui.me, 'Academy Manufactor');
      place(ui.me, "Gourmand's Talent");
      place(ui.me, 'Skullclamp');
      place(ui.me, 'Sol Ring');
      place(ui.me, 'Arcane Signet');
      const stationVessel = place(ui.me, 'Inspirit, Flagship Vessel');
      stationVessel.counters.charge = smokeStation === 'online' ? 8 : 7;
      const animatedSpire = place(ui.me, 'Restless Spire');
      void animatedSpire.def.abilities[0].run({ g, src: animatedSpire, you: ui.me });
      addLands(ui.me, ['Forest', 'Forest', 'Island', 'Plains']);

      const opponents = g.players.filter(player => player !== ui.me && !player.lost);
      opponents.forEach((player, index) => {
        place(player, index === 0 ? 'Stormcatch Mentor' : index === 1 ? 'Oracle of Mul Daya' : 'Academy Manufactor');
        place(player, 'Outpost Siege');
        place(player, 'Skullclamp');
        place(player, index === 1 ? 'Mind Stone' : 'Sol Ring');
        if (index === 0) {
          const botSpire = place(player, 'Restless Spire');
          void botSpire.def.abilities[0].run({ g, src: botSpire, you: player });
        }
        addLands(player, index === 0 ? ['Mountain', 'Island', 'Mountain'] : index === 1 ? ['Forest', 'Forest', 'Swamp'] : ['Plains', 'Island', 'Swamp']);
        ui.collapsed = ui.collapsed || new Set();
        ui.collapsed.delete(player.idx);
      });

      g.turnPlayer = ui.me; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.paced = false;
      g.recalc();
      g.lg(`Battlefield layout smoke: Station is ${stationVessel.is('Creature') ? 'online in CREATURES' : 'offline in SUPPORT'}; current permanent types control every zone.`, 'effect');
      if (smokeEliminate >= 1 && smokeEliminate <= opponents.length) {
        const eliminated = opponents[smokeEliminate - 1];
        void g.playerLoses(eliminated, 'controlled layout smoke').then(() => {
          g.lg(`Elimination layout smoke: ${eliminated.name} left the table and the remaining seats reclaimed the space.`, 'effect');
          ui.render();
        });
      }
      ui.render();
      return;
    }
    if (smokeScenario === 'suspendVisibility') {
      const suspendFromHand = new MTG.CardInst(MTG.DEFS['Rousing Refrain'], ui.me);
      suspendFromHand.ctrl = ui.me; suspendFromHand.zone = 'hand';
      ui.me.hand.push(suspendFromHand);
      const alreadySuspended = new MTG.CardInst(MTG.DEFS['Rousing Refrain'], ui.me);
      alreadySuspended.ctrl = ui.me; alreadySuspended.zone = 'exile'; alreadySuspended.meta = { suspended: 2 };
      ui.me.exile.push(alreadySuspended);
      g.turnPlayer = ui.me; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.paced = false;
      ui.me.pool.C = 1; ui.me.pool.R = 1;
      g.recalc();
      const q = {
        type: 'main', player: ui.me,
        casts: g.castableList(ui.me), acts: g.activatableList(ui.me), lands: g.playableLands(ui.me), phase: g.phase,
      };
      void ui.me.controller.decide(g, q).then(action => g.performAction(ui.me, action));
      g.lg('Suspend visibility smoke: Rousing Refrain is ready in hand and another copy has 2 time counters.', 'effect');
      ui.render();
      return;
    }
    if (smokeScenario === 'libraryTop') {
      const take = (name, zone) => {
        const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
        const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
        g.remove(card);
        card.ctrl = ui.me; card.zone = zone; card.sick = false;
        if (zone === 'battlefield') g.battlefield.push(card); else ui.me[zone].push(card);
        return card;
      };
      take('Oracle of Mul Daya', 'battlefield');
      const top = take('Forest', 'library');
      g.turnPlayer = ui.me; g.turnNo = 6; g.phase = 'main1'; g.step = 'main'; g.paced = false;
      ui.me.landsPlayed = 0;
      g.recalc();
      const q = {
        type: 'main', player: ui.me,
        casts: g.castableList(ui.me), acts: g.activatableList(ui.me), lands: g.playableLands(ui.me), phase: g.phase,
      };
      void ui.me.controller.decide(g, q).then(action => g.performAction(ui.me, action));
      g.lg(`Library top smoke: ${top.name} is revealed and playable via Oracle of Mul Daya.`, 'effect');
      ui.render();
      return;
    }
    if (smokeScenario === 'opponentChoice') {
      g.turnPlayer = ui.me; g.turnNo = 1; g.phase = 'main1'; g.step = 'main';
      void MTG.E.chooseOpponent(g, ui.me, {
        prompt: 'Sylvan Offering: who gets the Treefolk?', goal: 'gift',
      }).then(opponent => {
        if (opponent) ui.toast(`Chosen opponent: ${opponent.name}`);
        ui.render();
      });
      ui.render();
      return;
    }
    if (smokeScenario === 'manualMana') {
      ui.manaMode = 'manual';
      ui.me.manualMana = true;
      localStorage.setItem('mtgManaMode', 'manual');
      const lands = ['Plains', 'Plains', 'Plains', 'Island'].map(name => {
        const land = new MTG.CardInst(MTG.DEFS[name], ui.me);
        land.ctrl = ui.me; land.zone = 'battlefield'; land.sick = false;
        g.battlefield.push(land);
        return land;
      });
      const spell = new MTG.CardInst(MTG.DEFS['Cut a Deal'], ui.me);
      spell.zone = 'hand'; ui.me.hand.push(spell);
      g.turnPlayer = ui.me; g.turnNo = 1; g.phase = 'main1'; g.step = 'main';
      g.recalc();
      void g.castSpell(ui.me, spell, { from: 'hand' });
      ui.render();
      return;
    }
    if (smokeScenario === 'manifest') {
      void (async () => {
        const hidden = new MTG.CardInst(MTG.DEFS['Stalwart Pathlighter'], ui.me);
        hidden.zone = 'library'; ui.me.library.push(hidden);
        g.turnPlayer = ui.me; g.turnNo = 1; g.phase = 'main1'; g.step = 'main';
        ui.me.pool.W = 2; ui.me.pool.C = 1;
        await g.manifestTop(ui.me);
        g.recalc();
        const acts = g.activatableList(ui.me);
        void ui.me.controller.decide(g, {
          type: 'main', player: ui.me, casts: [], acts, lands: [], phase: g.phase,
        }).then(action => g.performAction(ui.me, action));
        ui.sheet = { card: hidden };
        ui.render();
      })();
      return;
    }
    if (smokeScenario === 'combatReaction') {
      const attackerPlayer = g.players.find(player => player !== ui.me);
      const attacker = new MTG.CardInst(MTG.DEFS['Stalwart Pathlighter'], attackerPlayer);
      attacker.ctrl = attackerPlayer; attacker.zone = 'battlefield'; attacker.sick = false;
      attacker.attacking = ui.me;
      const plains = new MTG.CardInst(MTG.DEFS['Plains'], ui.me);
      plains.ctrl = ui.me; plains.zone = 'battlefield'; plains.sick = false;
      const answer = new MTG.CardInst(MTG.DEFS['Swords to Plowshares'], ui.me);
      answer.zone = 'hand'; ui.me.hand.push(answer);
      g.battlefield.push(attacker, plains);
      g.turnPlayer = attackerPlayer; g.turnNo = 1; g.phase = 'combat'; g.step = 'blockers';
      g.combat = { attackers: [attacker], defenders: new Map() };
      g.recalc();
      void g.askPriorityAction(ui.me).then(action => action && g.performAction(ui.me, action));
      ui.render();
      return;
    }
    if (smokeScenario === 'counterSwords') {
      const opponent = g.players.find(player => player !== ui.me && !player.lost);
      const commander = new MTG.CardInst(MTG.DEFS['Riders of Gavony'], ui.me);
      commander.ctrl = ui.me; commander.zone = 'battlefield'; commander.commander = true; commander.sick = false;
      g.battlefield.push(commander);
      for (let i = 0; i < 2; i++) {
        const island = new MTG.CardInst(MTG.DEFS.Island, ui.me);
        island.ctrl = ui.me; island.zone = 'battlefield'; island.sick = false; island.tapped = false;
        g.battlefield.push(island);
      }
      const answer = new MTG.CardInst(MTG.DEFS['Arcane Denial'], ui.me);
      answer.zone = 'hand'; ui.me.hand.push(answer);
      const swords = new MTG.CardInst(MTG.DEFS['Swords to Plowshares'], opponent);
      swords.ctrl = opponent; swords.zone = 'stack';
      const targetSpecs = g.spellTargetSpecs(swords, { from: 'hand' }, opponent);
      const stackObject = { kind: 'spell', card: swords, ctrl: opponent, name: swords.name,
        targets: [commander], targetSpecs, castOpts: { from: 'hand' }, from: 'hand' };
      g.stack.push(stackObject);
      g.turnPlayer = opponent; g.turnNo = 4; g.phase = 'main1'; g.step = 'main'; g.paced = false;
      g.recalc(); g.note('stack', {});
      void g.askPriorityAction(ui.me).then(action => action && g.performAction(ui.me, action));
      ui.render();
      return;
    }
    if (smokeScenario === 'combatBattlefieldToggle') {
      const attackerPlayer = g.players.find(player => player !== ui.me && !player.lost);
      const otherDefender = g.players.find(player => player !== ui.me && player !== attackerPlayer && !player.lost);
      const makeAttacker = (name, target) => {
        const card = new MTG.CardInst(MTG.DEFS[name], attackerPlayer);
        card.ctrl = attackerPlayer; card.zone = 'battlefield'; card.sick = false; card.tapped = true; card.attacking = target;
        g.battlefield.push(card);
        return card;
      };
      const attackers = [
        makeAttacker('Stalwart Pathlighter', ui.me),
        makeAttacker('Academy Manufactor', ui.me),
        makeAttacker('Humble Defector', otherDefender || ui.me),
      ];
      g.turnPlayer = attackerPlayer; g.turnNo = 7; g.phase = 'combat'; g.step = 'attackers'; g.paced = false;
      g.combat = { attackers, defenders: new Map() };
      g.recalc();
      void ui.me.controller.decide(g, {
        type: 'combatReview', attackingPlayer: attackerPlayer, attackers,
        prompt: 'Review the declared combat before continuing.',
      });
      if (ui.pending && new URLSearchParams(window.location.search).get('smokePeek') === '1') ui.pending.boardPeek = true;
      ui.render();
      return;
    }
    if (smokeScenario === 'doomMoonstoneExile') {
      void (async () => {
        const take = (name, zone) => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me;
          card.zone = zone;
          if (zone === 'battlefield') {
            card.sick = false;
            g.battlefield.push(card);
          } else ui.me[zone].push(card);
          return card;
        };
        const moonstone = take('Moonstone, Harsh Mistress', 'battlefield');
        const spell = take("Night's Whisper", 'graveyard');
        g.turnPlayer = ui.me; g.turnNo = 20; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        ui.me.turnsStarted = 5;
        await moonstone.def.triggers[0].run({ g, src: moonstone, you: ui.me, data: { player: ui.me, card: spell } });

        // Reprodukuj screenshot: tri protivnička poteza su prošla, sada je
        // Doomov sljedeći potez. Karta i dalje mora biti legalna iz exilea.
        g.turnNo = 24;
        ui.me.turnsStarted = 6;
        ui.me.pool.B = 1;
        ui.me.pool.C = 1;
        g.recalc();
        const q = {
          type: 'main', player: ui.me,
          casts: g.castableList(ui.me), acts: g.activatableList(ui.me), lands: g.playableLands(ui.me), phase: g.phase,
        };
        void ui.me.controller.decide(g, q).then(action => g.performAction(ui.me, action));
        const smokeView = new URLSearchParams(window.location.search).get('smokeView');
        if (smokeView === 'exile') ui.zoneBrowse = { player: ui.me, zone: 'exile' };
        if (smokeView === 'sheet') ui.sheet = { card: spell };
        ui.toast(`Moonstone: ${spell.name} can be played from exile until the end of this turn.`);
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'doomCombat') {
      void (async () => {
        const doom = new MTG.CardInst(MTG.DEFS['Doctor Doom, King of Latveria'], ui.me);
        doom.ctrl = ui.me; doom.zone = 'battlefield'; doom.sick = false;
        const prowler = new MTG.CardInst(MTG.DEFS['Prowler, Clawed Thief'], ui.me);
        prowler.ctrl = ui.me; prowler.zone = 'battlefield'; prowler.sick = false;
        g.battlefield.push(doom, prowler);
        g.turnPlayer = ui.me; g.turnNo = 4; g.phase = 'combat'; g.step = 'begin';
        g.combat = { attackers: [], defenders: new Map() };
        g.recalc();
        await g.emit('beginCombat', { player: ui.me });
        await g.flushTriggers();
        await g.priorityRound(ui.me);
        ui.render();
      })();
      return;
    }
    if (smokeScenario === 'doomDeluge') {
      const doom = new MTG.CardInst(MTG.DEFS['Doctor Doom, King of Latveria'], ui.me);
      doom.ctrl = ui.me; doom.zone = 'battlefield'; doom.sick = false;
      doom.counters['+1/+1'] = 2;
      const opponent = g.players.find(player => player !== ui.me);
      const threat = new MTG.CardInst(MTG.DEFS['Red Ghost, Intangible Genius'], opponent);
      threat.ctrl = opponent; threat.zone = 'battlefield'; threat.sick = false;
      const deluge = new MTG.CardInst(MTG.DEFS['Toxic Deluge'], ui.me);
      deluge.zone = 'hand'; ui.me.hand.push(deluge);
      g.battlefield.push(doom, threat);
      ui.me.pool.B = 1; ui.me.pool.C = 2;
      g.turnPlayer = ui.me; g.turnNo = 4; g.phase = 'main1'; g.step = 'main';
      g.recalc();
      void g.castSpell(ui.me, deluge, { from: 'hand' });
      ui.render();
      return;
    }
    if (smokeScenario === 'manaBloom') {
      void (async () => {
        const zones = [ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
        const bloom = zones.flat().find(card => card.name === 'Mana Bloom') ||
          new MTG.CardInst(MTG.DEFS['Mana Bloom'], ui.me);
        g.remove(bloom);
        bloom.zone = 'hand';
        ui.me.hand.length = 0;
        ui.me.hand.push(bloom);
        for (let i = 0; i < 4; i++) {
          const forest = new MTG.CardInst(MTG.DEFS.Forest, ui.me);
          forest.ctrl = ui.me; forest.zone = 'battlefield'; forest.sick = false; forest.tapped = false;
          g.battlefield.push(forest);
        }
        g.turnPlayer = ui.me; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Mana Bloom browser canary: choose X, pay X plus one green, then inspect its charge counters.');
        ui.render();
        if (!await g.castSpell(ui.me, bloom, { from: 'hand' })) {
          throw new Error('Mana Bloom browser cast was unexpectedly rejected.');
        }
        const counters = bloom.counters.charge || 0;
        const result = bloom.zone === 'battlefield' && counters === (bloom.castMeta?.x || 0)
          ? `X=${bloom.castMeta.x}, ${counters} charge counters ✓`
          : `unexpected ${bloom.zone}, X=${bloom.castMeta?.x ?? '?'}, counters=${counters}`;
        g.lg(`Mana Bloom browser check: ${result}.`, 'ai');
        const acts = g.activatableList(ui.me);
        void ui.me.controller.decide(g, {
          type: 'main', player: ui.me, casts: [], acts, lands: [], phase: g.phase,
        }).then(async action => {
          if (!action || action.kind === 'done') return;
          await g.performAction(ui.me, action);
          ui.sheet = { card: bloom };
          ui.render();
        });
        ui.sheet = { card: bloom };
        ui.toast(`Mana Bloom: ${result}.`);
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'troyanMana') {
      const troyan = new MTG.CardInst(MTG.DEFS['Troyan, Gutsy Explorer'], ui.me);
      troyan.ctrl = ui.me; troyan.zone = 'battlefield'; troyan.sick = false; troyan.tapped = false;
      g.battlefield.push(troyan);
      g.turnPlayer = ui.me; g.turnNo = 9; g.phase = 'main1'; g.step = 'main'; g.paced = false;
      g.recalc();
      const acts = g.activatableList(ui.me).filter(entry => entry.card === troyan);
      void ui.me.controller.decide(g, {
        type: 'main', player: ui.me, casts: [], acts, lands: [], phase: g.phase,
      }).then(async action => {
        if (!action || action.kind === 'done') return;
        if (!await g.performAction(ui.me, action)) throw new Error('Troyan mana activation was rejected.');
        const tracked = (ui.me.poolMeta || []).reduce((sum, entry) => sum + (entry.n || 0), 0);
        const result = troyan.tapped && ui.me.pool.G === 1 && ui.me.pool.U === 1 && tracked === 2
          ? 'tapped, G=1, U=1, restricted units=2 ✓'
          : `unexpected tapped=${troyan.tapped}, G=${ui.me.pool.G}, U=${ui.me.pool.U}, tracked=${tracked}`;
        g.lg(`Troyan restricted-mana browser check: ${result}.`, 'ai');
        ui.sheet = { card: troyan };
        ui.toast(`Troyan: ${result}.`);
        ui.render();
      }).catch(error => { console.error(error); ui.toast(error.message); });
      ui.sheet = { card: troyan };
      ui.toast('Troyan browser canary: activate the visible restricted G/U mana ability.');
      ui.render();
      return;
    }
    if (smokeScenario === 'xManaHaldir') {
      void (async () => {
        const forest = new MTG.CardInst(MTG.DEFS.Forest, ui.me);
        forest.ctrl = ui.me; forest.zone = 'battlefield'; forest.sick = false; forest.tapped = false;
        const haldir = new MTG.CardInst(MTG.DEFS['Haldir, Lórien Lieutenant'], ui.me);
        haldir.zone = 'hand'; ui.me.hand.push(haldir);
        g.battlefield.push(forest);
        g.turnPlayer = ui.me; g.turnNo = 1; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Haldir browser canary: one Forest means the only legal choice is X=0.');
        ui.render();
        if (!await g.castSpell(ui.me, haldir, { from: 'hand' })) {
          throw new Error('Haldir X=0 cast was unexpectedly rejected.');
        }
        const result = haldir.zone === 'graveyard' ? '0/0 and died immediately ✓' : `unexpectedly ended in ${haldir.zone}`;
        g.lg(`Haldir X=0 browser check: ${result}.`, 'ai');
        ui.showLog = true;
        ui.toast(`Haldir X=0: ${result}.`);
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'seizeTheDay') {
      void (async () => {
        const take = (name, zone = 'battlefield') => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = zone; card.sick = zone === 'battlefield'; card.tapped = zone === 'battlefield';
          if (zone === 'battlefield') g.battlefield.push(card); else ui.me[zone].push(card);
          return card;
        };
        const target = take('Willie Lumpkin, Postman');
        take('Mister Fantastic, Reed Richards');
        const seize = take('Seize the Day', 'hand');
        ui.me.pool.R = 1; ui.me.pool.C = 3;
        g.turnPlayer = ui.me; g.turnNo = 20; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g._extraCombats = 0; g._additionalPhases = [];
        g.recalc();
        ui.toast('Seize the Day: choose one tapped creature, then Proceed. The next phases must be additional combat → additional main.');
        ui.render();
        if (!await g.castSpell(ui.me, seize, { from: 'hand' })) throw new Error('Seize the Day browser cast was rejected.');
        if (target.tapped) throw new Error('Seize the Day did not untap the chosen creature.');
        if (g._additionalPhases.map(entry => entry.kind).join(',') !== 'combat,main') {
          throw new Error('Seize the Day did not schedule combat followed by main.');
        }
        await g.runAdditionalPhases(ui.me);
        ui.showLog = true;
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'doomHiddenExile') {
      void (async () => {
        const klaw = new MTG.CardInst(MTG.DEFS['Klaw, Master of Sound'], ui.me);
        klaw.ctrl = ui.me; klaw.zone = 'battlefield'; klaw.sick = false;
        const victim = g.players.find(player => player !== ui.me);
        const secret = new MTG.CardInst(MTG.DEFS['Sol Ring'], victim);
        secret.zone = 'library'; victim.library.push(secret);
        g.battlefield.push(klaw);
        g.turnPlayer = ui.me; g.turnNo = 4; g.phase = 'main1'; g.step = 'main';
        g.recalc();
        await klaw.def.triggers[0].run({ g, src: klaw, you: ui.me, data: { player: victim } });
        ui.zoneBrowse = { player: victim, zone: 'exile' };
        ui.render();
      })();
      return;
    }
    if (smokeScenario === 'doomAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Doom Prevails');
        const opponent = ui.me;
        if (!bot) throw new Error('doomAI scenario zahtijeva smokeAIDeck=Doom Prevails');
        const doom = new MTG.CardInst(MTG.DEFS['Doctor Doom, King of Latveria'], bot);
        doom.ctrl = bot; doom.zone = 'battlefield'; doom.sick = false; doom.counters['+1/+1'] = 2;
        const threat = new MTG.CardInst(MTG.DEFS['Red Ghost, Intangible Genius'], opponent);
        threat.ctrl = opponent; threat.zone = 'battlefield'; threat.sick = false;
        const deluge = new MTG.CardInst(MTG.DEFS['Toxic Deluge'], bot);
        deluge.zone = 'hand'; bot.hand.push(deluge);
        g.battlefield.push(doom, threat);
        bot.life = 12; bot.pool.B = 1; bot.pool.C = 2;
        g.turnPlayer = bot; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        await g.castSpell(bot, deluge, { from: 'hand' });
        ui.showLog = true;
        ui.toast(`Doom AI je razriješio Toxic Deluge; život: ${bot.life}.`);
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'elvenHuman') {
      void (async () => {
        const take = name => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        take('Galadriel, Elven-Queen');
        take('Erestor of the Council');
        take('Model of Unity');
        const visionary = take('Elvish Visionary');
        g.turnPlayer = ui.me; g.turnNo = 6; g.phase = 'combat'; g.step = 'begin'; g.paced = false;
        ui.me.turnState.elfEntries = [visionary.iid];
        g.recalc();
        await g.emit('beginCombat', { player: ui.me });
        await g.flushTriggers();
        await g.resolveTop();
        await g.priorityRound(ui.me);
        ui.showLog = true;
        ui.toast(`Elven human scenario završen: Ring ${ui.me.emblems.find(emblem => emblem.ring)?.level || 0}.`);
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'elvenAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Elven Council');
        if (!bot) throw new Error('elvenAI scenario zahtijeva smokeAIDeck=Elven Council');
        const takeBot = name => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const radagast = takeBot('Radagast, Wizard of Wilds');
        const flyer = new MTG.CardInst(MTG.TOKENS.birdU, ui.me);
        flyer.ctrl = ui.me; flyer.zone = 'battlefield'; flyer.isToken = true; flyer.sick = false;
        g.battlefield.push(flyer);
        const farsight = new MTG.CardInst(MTG.DEFS['Elven Farsight'], bot);
        const forest = new MTG.CardInst(MTG.DEFS.Forest, bot);
        bot.library.length = 0; forest.zone = 'library'; bot.library.push(forest);
        g.turnPlayer = bot; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        await radagast.def.triggers[0].run({ g, src: radagast, you: bot, data: { player: bot, mv: 5 } });
        const handBefore = bot.hand.length;
        await farsight.def.resolve({ g, src: farsight, you: bot });
        const madeBird = g.creatures(bot).some(card => card.isToken && card.hasSub('Bird'));
        const declinedBadReveal = bot.hand.length === handBefore;
        g.lg(`Elven AI check: Radagast ${madeBird ? 'Bird ✓' : 'not a Bird'}; bad Farsight reveal ${declinedBadReveal ? 'declined ✓' : 'accepted'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Elven AI scenario: kontekstualne odluke razriješene.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'counterHuman') {
      void (async () => {
        const take = name => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const inspirit = take('Inspirit, Flagship Vessel');
        const reactor = take('Darksteel Reactor');
        const kilo = take('Kilo, Apogee Mind');
        const opponent = g.players.find(player => player !== ui.me);
        const weakened = new MTG.CardInst(MTG.DEFS['Kilo, Apogee Mind'], opponent);
        weakened.ctrl = opponent; weakened.zone = 'battlefield'; weakened.sick = false;
        g.battlefield.push(weakened);
        inspirit.counters.charge = 8; reactor.counters.charge = 17;
        kilo.counters['+1/+1'] = 2; weakened.counters['-1/-1'] = 1; opponent.poison = 2;
        g.turnPlayer = ui.me; g.turnNo = 10; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Counter human: izaberi svaki permanent/player koji želiš proliferirati.');
        await MTG.E.proliferate(g, ui.me);
        ui.showLog = true;
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'chaosWarp') {
      void (async () => {
        const opponent = g.players.find(player => player !== ui.me && !player.lost);
        if (!opponent) throw new Error('Chaos Warp scenario requires an opponent');
        const warp = [ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile]
          .flat().find(card => card.name === 'Chaos Warp') || new MTG.CardInst(MTG.DEFS['Chaos Warp'], ui.me);
        g.remove(warp);
        warp.zone = 'hand';
        ui.me.hand.push(warp);

        for (const card of ui.me.library) card.zone = 'nowhere';
        ui.me.library.length = 0;
        const haven = new MTG.CardInst(MTG.DEFS['Wolfwillow Haven'], ui.me);
        haven.zone = 'library';
        ui.me.library.push(haven);

        const island = new MTG.CardInst(MTG.DEFS.Island, ui.me);
        island.ctrl = ui.me; island.zone = 'battlefield'; island.sick = false;
        const stolenRing = new MTG.CardInst(MTG.DEFS['Sol Ring'], ui.me);
        stolenRing.ctrl = opponent; stolenRing.zone = 'battlefield'; stolenRing.sick = false;
        // Keep Sol Ring first so keyboard-only smoke QA can select the intended
        // Chaos Warp target before the Aura choice offers the lone Island.
        g.battlefield.push(stolenRing, island);
        ui.collapsed.delete(opponent.idx);

        g.rnd = () => 0;
        g.turnPlayer = ui.me; g.turnNo = 9; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        ui.me.pool.R = 1; ui.me.pool.C = 2;
        g.recalc();
        ui.toast('Chaos Warp: target the Sol Ring controlled by an opponent, then attach the revealed Wolfwillow Haven to Island.');
        ui.render();

        await g.castSpell(ui.me, warp, { from: 'hand' });
        await g.checkSBA();
        const attached = haven.zone === 'battlefield' && haven.attachedTo === island.iid;
        g.lg(`Chaos Warp browser check: owner library used; Aura ${attached ? 'attached correctly' : 'attachment failed'}.`, 'effect');
        ui.showLog = true;
        ui.sheet = { card: haven };
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'counterAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Counter Intelligence');
        if (!bot) throw new Error('counterAI scenario zahtijeva smokeAIDeck=Counter Intelligence');
        const takeBot = name => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const inspirit = takeBot('Inspirit, Flagship Vessel');
        const reactor = takeBot('Darksteel Reactor');
        const kilo = takeBot('Kilo, Apogee Mind');
        const weakened = new MTG.CardInst(MTG.DEFS['Kilo, Apogee Mind'], ui.me);
        weakened.ctrl = ui.me; weakened.zone = 'battlefield'; weakened.sick = false;
        g.battlefield.push(weakened);
        inspirit.counters.charge = 8; reactor.counters.charge = 17;
        kilo.counters['+1/+1'] = 2; weakened.counters['-1/-1'] = 1; ui.me.poison = 2;
        g.turnPlayer = bot; g.turnNo = 12; g.phase = 'combat'; g.step = 'begin'; g.paced = false;
        g.recalc();
        await MTG.E.proliferate(g, bot);
        await g.emit('beginCombat', { player: bot });
        await g.flushTriggers();
        while (g.stack.length && !g.gameOver) await g.resolveTop();
        g.lg(`Counter AI provjera: Reactor ${reactor.counters.charge || 0}; neprijateljski -1/-1 ${weakened.counters['-1/-1'] || 0}; poison ${ui.me.poison}.`, 'ai');
        ui.showLog = true;
        ui.toast('Counter AI scenario: proliferate i Inspirit odluke razriješene.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'enchantPlayer') {
      void (async () => {
        const opponent = g.players.find(player => player !== ui.me && !player.lost);
        if (!opponent) throw new Error('Enchant player scenario requires an opponent');
        const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
        const curse = zones.flat().find(card => card.name === 'Curse of Clinging Webs') ||
          new MTG.CardInst(MTG.DEFS['Curse of Clinging Webs'], ui.me);
        g.remove(curse);
        curse.ctrl = ui.me; curse.zone = 'hand'; ui.me.hand.push(curse);
        g.turnPlayer = ui.me; g.turnNo = 12; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        ui.collapsed = ui.collapsed || new Set();
        ui.collapsed.delete(opponent.idx);
        const resolveMode = new URLSearchParams(window.location.search).get('smokeResolve') || 'target';
        if (resolveMode === 'stack') g.priorityRound = async () => {};
        if (resolveMode === 'resolved') ui.prioMode = 'off';
        g.recalc();

        const casting = g.castSpell(ui.me, curse, { from: 'hand', free: true });
        const targetDecision = ui.pending;
        if (!targetDecision || targetDecision.q.type !== 'chooseTargets') {
          throw new Error('Enchant player scenario did not open target selection');
        }
        targetDecision.sel = [opponent];
        ui.toast(`Curse of Clinging Webs: review ${opponent.name} as the enchanted player, then lock the target.`);
        ui.render();

        await casting;
        ui.showLog = true;
        if (resolveMode === 'stack') {
          if (!g.stack.some(item => item.card === curse)) throw new Error('Enchant player Aura is not on the stack');
          g.lg(`Enchant player smoke: ${opponent.name} is locked as the target.`, 'effect');
          ui.toast('Enchant player scenario: target is locked and the Aura is on the stack.');
        } else if (resolveMode === 'resolved') {
          if (curse.zone !== 'battlefield' || curse.meta.cursedPlayer !== opponent) {
            throw new Error('Enchant player Aura did not resolve attached to the chosen player');
          }
          g.lg(`Enchant player smoke: ${curse.name} now enchants ${opponent.name}.`, 'effect');
          ui.toast(`Resolved: ${curse.name} enchants ${opponent.name}.`);
        }
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'covenHuman') {
      void (async () => {
        const take = name => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const vanguard = take("Sigarda's Vanguard");
        take("Avacyn's Pilgrim");
        take('Dawnhart Wardens');
        take('Wall of Mourning');
        g.turnPlayer = ui.me; g.turnNo = 12; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Coven human: izaberi bilo koji broj stvorenja, ali svako mora imati različitu snagu.');
        await g.emit('etb', { card: vanguard });
        await g.flushTriggers();
        await g.resolveTop();
        g.lg(`Coven human provjera: ${g.creatures(ui.me).filter(card => card.kw('double strike')).map(card => card.name).join(', ') || 'niko'} dobija double strike.`, 'ai');
        ui.showLog = true;
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'covenAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Coven Counters');
        if (!bot) throw new Error('covenAI scenario zahtijeva smokeAIDeck=Coven Counters');
        const takeBot = name => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const leinore = takeBot('Leinore, Autumn Sovereign');
        const pilgrim = takeBot("Avacyn's Pilgrim");
        const wardens = takeBot('Dawnhart Wardens');
        const siege = new MTG.CardInst(MTG.DEFS['Citadel Siege'], bot);
        siege.ctrl = bot; siege.zone = 'battlefield'; siege.sick = false;
        g.battlefield.push(siege);
        g.turnPlayer = bot; g.turnNo = 13; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        await siege.def.asEnters(g, siege);
        const upgrade = [bot.hand, bot.library, bot.graveyard, bot.exile].flat()
          .find(card => card.name === 'Biogenic Upgrade') || new MTG.CardInst(MTG.DEFS['Biogenic Upgrade'], bot);
        g.remove(upgrade); upgrade.zone = 'hand'; bot.hand.push(upgrade);
        bot.pool.G = 2; bot.pool.C = 4;
        await g.castSpell(bot, upgrade, { from: 'hand' });
        g.phase = 'combat'; g.step = 'begin';
        await g.emit('beginCombat', { player: bot });
        await g.flushTriggers();
        while (g.stack.length && !g.gameOver) await g.resolveTop();
        g.lg(`Coven AI provjera: Siege=${siege.meta.siege}; Leinore ${leinore.power}; Pilgrim ${pilgrim.power}; Wardens ${wardens.power}.`, 'ai');
        ui.showLog = true;
        ui.toast('Coven AI scenario: Citadel režim, raspodjela countera i combat Coven su razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'blightHuman') {
      void (async () => {
        const take = name => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        take('Auntie Ool, Cursewretch');
        take('Hapatra, Vizier of Poisons');
        const tools = take("Wickersmith's Tools");
        take('Flourishing Defenses');
        take('Lasting Tarfire');
        const goat = take('Oft-Nabbed Goat');
        g.turnPlayer = ui.me; g.turnNo = 10; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        await g.addM1(goat, 3, ui.me);
        await g.flushTriggers();
        await g.priorityRound(ui.me);
        await g.emit('endStep', { player: ui.me });
        await g.flushTriggers();
        await g.priorityRound(ui.me);
        g.lg(`Blight human provjera: Goat ${goat.counters['-1/-1'] || 0} m1; Tools ${tools.counters.charge || 0} charge.`, 'ai');
        ui.showLog = true;
        ui.toast('Blight human scenario: one-or-more triggeri i izbor Elf tokena razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'blightWard') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Blight Curse');
        if (!bot) throw new Error('blightWard scenario zahtijeva smokeAIDeck=Blight Curse');
        const ool = new MTG.CardInst(MTG.DEFS['Auntie Ool, Cursewretch'], bot);
        ool.ctrl = bot; ool.zone = 'battlefield'; ool.sick = false;
        const recipient = new MTG.CardInst(MTG.DEFS['Grave Titan'], ui.me);
        recipient.ctrl = ui.me; recipient.zone = 'battlefield'; recipient.sick = false;
        const trophy = new MTG.CardInst(MTG.DEFS["Assassin's Trophy"], ui.me);
        trophy.zone = 'hand'; ui.me.hand.push(trophy);
        g.battlefield.push(ool, recipient);
        ui.me.pool.B = 1; ui.me.pool.G = 1;
        g.turnPlayer = ui.me; g.turnNo = 11; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        // Headless smoke nema canvas metu za klik, zato samo prvi izbor mete
        // zaključaj deterministički. Ward—Blight i svi naredni izbori i dalje
        // prolaze kroz pravi ljudski controller/UI.
        const humanController = ui.me.controller;
        let trophyTargetPending = true;
        ui.me.controller = {
          decide(game, request) {
            if (trophyTargetPending && request.type === 'chooseTargets') {
              trophyTargetPending = false;
              return Promise.resolve([ool]);
            }
            return humanController.decide(game, request);
          },
        };
        try {
          await g.castSpell(ui.me, trophy, { from: 'hand' });
        } finally {
          ui.me.controller = humanController;
        }
        ui.showLog = true;
        ui.toast(`Ward—Blight scenario: ${recipient.name} ima ${recipient.counters['-1/-1'] || 0} m1 countera.`);
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'blightAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Blight Curse');
        if (!bot) throw new Error('blightAI scenario zahtijeva smokeAIDeck=Blight Curse');
        const takeBot = name => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        takeBot('Auntie Ool, Cursewretch');
        const goat = takeBot('Oft-Nabbed Goat');
        const glissa = takeBot('Glissa Sunslayer');
        const reactor = new MTG.CardInst(MTG.DEFS['Darksteel Reactor'], ui.me);
        reactor.ctrl = ui.me; reactor.zone = 'battlefield'; reactor.sick = false; reactor.counters.charge = 5;
        const defenses = new MTG.CardInst(MTG.DEFS['Flourishing Defenses'], ui.me);
        defenses.ctrl = ui.me; defenses.zone = 'battlefield'; defenses.sick = false;
        g.battlefield.push(reactor, defenses);
        goat.counters['-1/-1'] = 1;
        g.turnPlayer = bot; g.turnNo = 12; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        await MTG.DEFS["Eventide's Shadow"].resolve({ g, src: null, you: bot, targets: [] });
        await g.emit('combatDamageToPlayer', { card: glissa, player: ui.me, n: 3, combat: true });
        await g.flushTriggers();
        await g.priorityRound(bot);
        const curiosity = [bot.hand, bot.library, bot.graveyard, bot.exile].flat()
          .find(card => card.name === 'Burning Curiosity') || new MTG.CardInst(MTG.DEFS['Burning Curiosity'], bot);
        g.remove(curiosity); curiosity.zone = 'hand'; bot.hand.push(curiosity);
        bot.pool.C = 2; bot.pool.R = 1;
        await g.castSpell(bot, curiosity, { from: 'hand' });
        g.lg(`Blight AI provjera: Goat ${goat.counters['-1/-1'] || 0} m1; Reactor ${reactor.counters.charge || 0}; Glissa enchantment ${defenses.zone}.`, 'ai');
        ui.showLog = true;
        ui.toast('Blight AI scenario: Eventide, Glissa i Burning Curiosity odluke razriješene.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'mostHuman') {
      void (async () => {
        const take = name => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        take('Olivia, Opulent Outlaw');
        take('Academy Manufactor');
        const marauder = take('Aetherborn Marauder');
        const defector = take('Humble Defector');
        const marchesa = take('Queen Marchesa');
        defector.counters['+1/+1'] = 2;
        marchesa.counters['+1/+1'] = 3;
        g.turnPlayer = ui.me; g.turnNo = 14; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Most Wanted human: izaberi sa kojih permanenata i koliko countera premještaš na Maraudera.');
        await g.emit('etb', { card: marauder });
        await g.flushTriggers();
        await g.resolveTop();
        g.lg(`Most Wanted human provjera: Marauder ima ${marauder.counters['+1/+1'] || 0} +1/+1 countera.`, 'ai');
        ui.showLog = true;
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'mostAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Most Wanted');
        if (!bot) throw new Error('mostAI scenario zahtijeva smokeAIDeck=Most Wanted');
        const takeBot = name => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const grenzo = takeBot('Grenzo, Havoc Raiser');
        const pilferer = takeBot('Impulsive Pilferer');
        const victim = new MTG.CardInst(MTG.DEFS['Grave Titan'], ui.me);
        victim.ctrl = ui.me; victim.zone = 'battlefield'; victim.sick = false;
        g.battlefield.push(victim);
        pilferer.counters.stun = 1;
        bot.life = 8;
        g.turnPlayer = bot; g.turnNo = 15; g.phase = 'combat'; g.step = 'damage'; g.paced = false;
        g.recalc();

        await g.emit('combatDamageToPlayer', { card: grenzo, player: ui.me, n: grenzo.power, combat: true });
        await g.flushTriggers();
        while (g.stack.length && !g.gameOver) await g.resolveTop();

        const heliod = await bot.controller.decide(g, {
          type: 'chooseOption',
          options: [{ key: '0', label: 'Uništi X artefakata/enchantmenta' }, { key: '1', label: 'Dobij 2X života' }],
          aiHint: { kind: 'heliodIntervention', x: 4 },
        });
        const rankle = await bot.controller.decide(g, {
          type: 'chooseMulti', min: 0, max: 3,
          options: [{ key: 'disc', label: 'Svi odbacuju' }, { key: 'draw', label: 'Svi vuku' }, { key: 'sac', label: 'Svi žrtvuju' }],
          aiHint: { kind: 'rankleModes' },
        });
        const fain = await bot.controller.decide(g, {
          type: 'chooseCards', from: [pilferer], min: 1, max: 1,
          aiHint: { kind: 'fainCounterCost' }, prompt: 'Fain counter cijena',
        });
        g.lg(`Most Wanted AI: Grenzo=${g.isGoaded(victim) ? 'goad' : 'exile'}; Heliod mod=${heliod}; Rankle=${(rankle || []).join(',') || 'bez moda'}; Fain=${fain[0]?.name || 'bez izbora'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Most Wanted AI scenario: Grenzo, Heliod, Rankle i Fain odluke razriješene.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'prismariHuman') {
      void (async () => {
        const take = (name, owner = ui.me, zone = 'battlefield') => {
          const zones = [owner.command, owner.hand, owner.library, owner.graveyard, owner.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], owner);
          g.remove(card);
          card.ctrl = owner; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card);
          else owner[zone].push(card);
          return card;
        };
        const opponent = g.players.find(player => player !== ui.me && !player.lost);
        if (!opponent) throw new Error('Prismari human scenario zahtijeva protivnika');
        take('Veyran, Voice of Duality');
        take('Storm-Kiln Artist');
        take('Manaform Hellkite');
        const goldspan = take('Goldspan Dragon');
        const ownRock = take('Arcane Signet');
        const enemyCreature = take('Stormcatch Mentor', opponent);
        const enemyRock = take('Sol Ring', opponent);
        const opus = take('Magma Opus', ui.me, 'hand');
        ui.me.pool.C = 6; ui.me.pool.U = 1; ui.me.pool.R = 1;
        g.turnPlayer = ui.me; g.turnNo = 20; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Prismari human: Magma Opus — izaberi Goldspan + protivničko stvorenje za štetu, zatim oba mana artefakta za tapovanje i podijeli 4 štete.');
        ui.render();
        if (!await g.castSpell(ui.me, opus, { from: 'hand' })) throw new Error('Magma Opus cast nije uspio');
        const dragons = g.creatures(ui.me).filter(card => card.isToken && card.hasSub('Dragon'));
        const treasures = g.bf().filter(card => card.ctrl === ui.me && card.hasSub('Treasure'));
        g.lg(`Prismari human provjera: Manaform zmajevi=${dragons.length}; Treasure=${treasures.length}; Goldspan šteta=${goldspan.damage}; protivnički ${enemyCreature.name} zona=${enemyCreature.zone}; tap artefakti=${Number(ownRock.tapped) + Number(enemyRock.tapped)}.`, 'ai');
        ui.showLog = true;
        ui.toast('Prismari human scenario: mete, podjela štete, Veyran, magecraft, Manaform i Goldspan su razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'prismariAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Prismari Artistry');
        if (!bot) throw new Error('prismariAI scenario zahtijeva smokeAIDeck=Prismari Artistry');
        const takeBot = (name, zone = 'battlefield') => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card);
          else bot[zone].push(card);
          return card;
        };
        const addHuman = name => {
          const card = new MTG.CardInst(MTG.DEFS[name], ui.me);
          card.ctrl = ui.me; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        takeBot('Veyran, Voice of Duality');
        takeBot('Storm-Kiln Artist');
        takeBot('Manaform Hellkite');
        takeBot('Goldspan Dragon');
        takeBot('Brudiclad, Telchor Engineer');
        await g.makeTokens('treasure', bot);
        await g.makeTokens('elementalUR44', bot);
        addHuman('Stormcatch Mentor');
        addHuman('Harmonic Prodigy');
        addHuman('Sol Ring');
        addHuman('Arcane Signet');
        const opus = takeBot('Magma Opus', 'hand');
        bot.pool.C = 6; bot.pool.U = 1; bot.pool.R = 1;
        g.turnPlayer = bot; g.turnNo = 21; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        if (!await g.castSpell(bot, opus, { from: 'hand' })) throw new Error('Prismari AI nije castovao Magma Opus');

        g.phase = 'combat'; g.step = 'begin';
        await g.emit('beginCombat', { player: bot });
        await g.flushTriggers();
        await g.priorityRound(bot);

        g.phase = 'main2'; g.step = 'main';
        const command = takeBot('Prismari Command', 'hand');
        bot.pool.C = 1; bot.pool.U = 1; bot.pool.R = 1;
        if (!await g.castSpell(bot, command, { from: 'hand' })) throw new Error('Prismari AI nije castovao Prismari Command');
        const recent = (g.aiDecisionLog || []).filter(entry => entry.playerName === bot.name).slice(-20);
        const tokenNames = [...new Set(g.bf().filter(card => card.ctrl === bot && card.isToken).map(card => card.name))];
        g.lg(`Prismari AI provjera: tokeni=${tokenNames.join(', ') || 'nema'}; odluke=${recent.length}; fallback=${recent.some(entry => entry.fallback) ? 'DA' : 'NE'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Prismari AI scenario: Magma Opus, Veyran/magecraft, Brudiclad i Command odluke su razriješene.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'marduHuman') {
      void (async () => {
        const take = name => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const addFreshToken = tokenName => {
          const token = new MTG.CardInst(MTG.TOKENS[tokenName], ui.me);
          token.ctrl = ui.me; token.zone = 'battlefield'; token.isToken = true; token.sick = false;
          token.meta._enteredTurn = 18;
          g.battlefield.push(token);
          return token;
        };
        const settle = async () => {
          let guard = 0;
          while ((g.pendingTriggers.length || g.stack.length) && guard++ < 120) {
            await g.flushTriggers();
            if (g.stack.length) await g.resolveTop();
          }
          if (guard >= 120) throw new Error('Mardu human scenario trigger guard');
        };
        const zurgo = take('Zurgo Stormrender');
        zurgo.commander = true;
        const storm = take('Redoubled Stormsinger');
        addFreshToken('servo'); addFreshToken('servo'); addFreshToken('warriorR');
        const first = g.players.find(player => player !== ui.me && !player.lost);
        const walkerOwner = g.players.find(player => player !== ui.me && player !== first && !player.lost) || first;
        const walker = new MTG.CardInst(MTG.DEFS['Kaya, Geist Hunter'], walkerOwner);
        walker.ctrl = walkerOwner; walker.zone = 'battlefield'; walker.sick = false; walker.counters.loyalty = 6;
        g.battlefield.push(walker);
        g.turnPlayer = ui.me; g.turnNo = 18; g.phase = 'combat'; g.step = 'attackers'; g.paced = false;
        g.combat = { attackers: [zurgo, storm], defenders: new Map() };
        zurgo.attacking = first; zurgo.tapped = true;
        storm.attacking = first; storm.tapped = true;
        g.recalc();
        ui.toast('Mardu human: poredaj Zurgo/Stormsinger triggere, pa za svaki novi token izaberi igrača ili planeswalkera kojeg napada.');
        await g.emit('attacks', { card: zurgo, player: ui.me, defender: first });
        await g.emit('attacks', { card: storm, player: ui.me, defender: first });
        await settle();
        for (const card of g.bf()) card.attacking = null;
        g.combat = null;
        g.step = '';
        await g.emit('endStep', { player: first });
        await settle();
        const temporary = g.bf().filter(card => card.isToken && card.attacking).length;
        g.lg(`Mardu human provjera: privremeni napadači na tabli=${temporary}; ruka=${ui.me.hand.length}.`, 'ai');
        ui.showLog = true;
        ui.toast('Mardu human scenario: attack izbori, simultani sacrifice i Zurgo LKI su razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'marduAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Mardu Surge');
        if (!bot) throw new Error('marduAI scenario zahtijeva smokeAIDeck=Mardu Surge');
        const takeBot = name => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        const addBotToken = tokenName => {
          const token = new MTG.CardInst(MTG.TOKENS[tokenName], bot);
          token.ctrl = bot; token.zone = 'battlefield'; token.isToken = true; token.sick = false;
          token.meta._enteredTurn = 19;
          g.battlefield.push(token);
          return token;
        };
        const settle = async () => {
          let guard = 0;
          while ((g.pendingTriggers.length || g.stack.length) && guard++ < 160) {
            await g.flushTriggers();
            if (g.stack.length) await g.resolveTop();
          }
          if (guard >= 160) throw new Error('Mardu AI scenario trigger guard');
        };
        const zurgo = takeBot('Zurgo Stormrender');
        zurgo.commander = true;
        const storm = takeBot('Redoubled Stormsinger');
        const angel = takeBot('Angel of Invention');
        takeBot('Bastion of Remembrance');
        const sphere = takeBot('Myr Battlesphere');
        addBotToken('servo'); addBotToken('servo');
        addBotToken('myr'); addBotToken('myr'); addBotToken('myr');
        const walker = new MTG.CardInst(MTG.DEFS['Kaya, Geist Hunter'], ui.me);
        walker.ctrl = ui.me; walker.zone = 'battlefield'; walker.sick = false; walker.counters.loyalty = 8;
        g.battlefield.push(walker);
        g.turnPlayer = bot; g.turnNo = 19; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        await g.emit('etb', { card: angel });
        await settle();
        g.phase = 'combat'; g.step = 'attackers';
        g.combat = { attackers: [zurgo, storm, sphere], defenders: new Map() };
        zurgo.attacking = ui.me; zurgo.tapped = true;
        storm.attacking = ui.me; storm.tapped = true;
        sphere.attacking = walker; sphere.tapped = true;
        await g.emit('attacks', { card: zurgo, player: bot, defender: ui.me });
        await g.emit('attacks', { card: storm, player: bot, defender: ui.me });
        await g.emit('attacks', { card: sphere, player: bot, defender: walker });
        await settle();
        const tokenRoutes = [...new Set(g.bf().filter(card => card.isToken && card.attacking)
          .map(card => card.attacking.name))];
        for (const card of g.bf()) card.attacking = null;
        g.combat = null;
        g.step = '';
        await g.emit('endStep', { player: ui.me });
        await settle();
        const recent = (g.aiDecisionLog || []).filter(entry => entry.playerName === bot.name).slice(-12);
        g.lg(`Mardu AI provjera: Servi=${g.creatures(bot).filter(card => card.isToken && card.hasSub('Servo')).length}; token mete=${tokenRoutes.join(', ') || 'nema'}; Kaya loyalty=${walker.counters.loyalty || 0}; odluke=${recent.length}; fallback=${recent.some(entry => entry.fallback) ? 'DA' : 'NE'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Mardu AI scenario: Fabricate, Stormsinger, Mobilize i Battlesphere odluke su razriješene.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'clueHuman') {
      void (async () => {
        const take = name => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        take('Morska, Undersea Sleuth');
        take('Academy Manufactor');
        take('Adrix and Nev, Twincasters');
        take('Esix, Fractal Bloom');
        take('Graf Mole');
        take('Armed with Proof');
        g.turnPlayer = ui.me; g.turnNo = 22; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Deep Clue human: izaberi redoslijed Academy / Adrix / Esix, pa stvorenje za Esix kopije.');
        ui.render();
        await MTG.E.investigate(g, ui.me);
        let guard = 0;
        while ((g.pendingTriggers.length || g.stack.length) && guard++ < 100) {
          await g.flushTriggers();
          if (g.stack.length) await g.resolveTop();
        }
        const tokens = g.bf().filter(card => card.ctrl === ui.me && card.isToken);
        g.lg(`Deep Clue human: tokeni=${tokens.length}; ${tokens.map(card => card.name).join(', ')}.`, 'ai');
        ui.showLog = true;
        ui.toast('Deep Clue human scenario: replacement redoslijed i Esix izbor su razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'cluePrepared') {
      void (async () => {
        const take = (name, owner = ui.me, zone = 'battlefield') => {
          const zones = [owner.command, owner.hand, owner.library, owner.graveyard, owner.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], owner);
          g.remove(card);
          card.ctrl = owner; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card); else owner[zone].push(card);
          return card;
        };
        const opponent = g.players.find(player => player !== ui.me && !player.lost);
        const focusmage = take('Dirgur Focusmage');
        take('Aerial Extortionist', opponent);
        for (let i = 0; i < 8; i++) {
          const card = new MTG.CardInst(MTG.DEFS[i % 2 ? 'Island' : 'Forest'], ui.me);
          card.zone = 'library'; ui.me.library.push(card);
        }
        g.turnPlayer = ui.me; g.turnNo = 23; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        ui.me.pool.C = 3; ui.me.pool.U = 2;
        g.recalc();
        await focusmage.def.triggers[0].run({ g, src: focusmage, you: ui.me });
        const prepared = ui.me.exile.find(card => card.meta && card.meta.preparedBy === focusmage.iid);
        if (!prepared) throw new Error('Prepared Braingeyser nije napravljen');
        const q = {
          type: 'main', player: ui.me,
          casts: g.castableList(ui.me), acts: g.activatableList(ui.me), lands: g.playableLands(ui.me), phase: g.phase,
        };
        ui.toast('Prepared: klikni Braingeyser iz egzila, izaberi X i target playera.');
        const action = await ui.me.controller.decide(g, q);
        await g.performAction(ui.me, action);
        g.lg(`Prepared UI: Braingeyser=${prepared.zone}; tvoja ruka=${ui.me.hand.length}; ${opponent.name} ruka=${opponent.hand.length}.`, 'ai');
        ui.toast('Prepared Braingeyser je razriješen; privremena kopija je prestala postojati.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'clueAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Deep Clue Sea');
        if (!bot) throw new Error('clueAI scenario zahtijeva smokeAIDeck=Deep Clue Sea');
        const takeBot = name => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = 'battlefield'; card.sick = false;
          g.battlefield.push(card);
          return card;
        };
        takeBot('Academy Manufactor');
        takeBot('Adrix and Nev, Twincasters');
        takeBot('Esix, Fractal Bloom');
        takeBot('Graf Mole');
        const focusmage = takeBot('Dirgur Focusmage');
        const aerial = new MTG.CardInst(MTG.DEFS['Aerial Extortionist'], ui.me);
        aerial.ctrl = ui.me; aerial.zone = 'battlefield'; aerial.sick = false;
        g.battlefield.push(aerial);
        for (let i = 0; i < 8; i++) {
          const card = new MTG.CardInst(MTG.DEFS[i % 2 ? 'Island' : 'Forest'], bot);
          card.zone = 'library'; bot.library.push(card);
        }
        g.turnPlayer = bot; g.turnNo = 24; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        const priorityRound = g.priorityRound;
        g.priorityRound = async () => {};
        await MTG.E.investigate(g, bot);
        await focusmage.def.triggers[0].run({ g, src: focusmage, you: bot });
        const prepared = bot.exile.find(card => card.meta && card.meta.preparedBy === focusmage.iid);
        bot.pool.C = 2; bot.pool.U = 2;
        if (!prepared || !await g.castSpell(bot, prepared, { from: 'exile', xVal: 2 })) {
          throw new Error('Deep Clue AI Prepared cast nije uspio');
        }
        let guard = 0;
        while ((g.pendingTriggers.length || g.stack.length) && guard++ < 120) {
          await g.flushTriggers();
          if (g.stack.length) await g.resolveTop();
        }
        g.priorityRound = priorityRound;
        const recent = (g.aiDecisionLog || []).filter(entry => entry.playerName === bot.name).slice(-20);
        const tokens = g.bf().filter(card => card.ctrl === bot && card.isToken);
        g.lg(`Deep Clue AI: tokeni=${tokens.map(card => card.name).join(', ') || 'nema'}; Prepared=${prepared.zone}; odluke=${recent.length}; fallback=${recent.some(entry => entry.fallback) ? 'DA' : 'NE'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Deep Clue AI scenario: replacement redoslijed i Prepared Braingeyser su razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'scionsHuman') {
      void (async () => {
        const take = (name, zone = 'battlefield') => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card); else ui.me[zone].push(card);
          return card;
        };
        const settle = async () => {
          let guard = 0;
          while ((g.pendingTriggers.length || g.stack.length) && guard++ < 120) {
            await g.flushTriggers();
            if (g.stack.length) await g.resolveTop();
          }
          if (guard >= 120) throw new Error('Scions human scenario trigger guard');
        };
        const alisaie = take('Alisaie Leveilleur');
        const alphinaud = take('Alphinaud Leveilleur', 'library');
        g.turnPlayer = ui.me; g.turnNo = 26; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Scions Partner: izaberi SEBE kao target igrača, zatim potvrdi pretragu za Alphinauda.');
        ui.render();
        await g.emit('etb', { card: alisaie, ctrl: ui.me });
        await settle();

        const planisphere = take("Astrologian's Planisphere");
        await g.emit('etb', { card: planisphere, ctrl: ui.me });
        await settle();
        ui.me.turnState.drewThisTurn = 2;
        await g.draw(ui.me, 1);
        await settle();
        const hero = planisphere.attachedTo && g.byIid(planisphere.attachedTo);
        g.lg(`Scions human: Partner=${alphinaud.zone}; Planisphere host=${hero ? hero.name : 'nema'}; counteri=${hero && hero.counters['+1/+1'] || 0}.`, 'ai');
        ui.showLog = true;
        ui.toast('Scions human scenario: Partner search i Planisphere treći draw su razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'scionsAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Scions & Spellcraft');
        if (!bot) throw new Error('scionsAI scenario zahtijeva smokeAIDeck=Scions & Spellcraft');
        const takeBot = (name, zone = 'battlefield') => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card); else bot[zone].push(card);
          return card;
        };
        const settle = async () => {
          let guard = 0;
          while ((g.pendingTriggers.length || g.stack.length) && guard++ < 180) {
            await g.flushTriggers();
            if (g.stack.length) await g.resolveTop();
          }
          if (guard >= 180) throw new Error('Scions AI scenario trigger guard');
        };
        const alisaie = takeBot('Alisaie Leveilleur');
        const alphinaud = takeBot('Alphinaud Leveilleur', 'library');
        takeBot("G'raha Tia, Scion Reborn");
        takeBot('Fandaniel, Telophoroi Ascian');
        const victim = g.players.find(player => player.isAI && player !== bot);
        if (victim) {
          const creature = new MTG.CardInst(MTG.DEFS['Baleful Strix'], victim);
          creature.ctrl = victim; creature.zone = 'battlefield'; creature.sick = false;
          g.battlefield.push(creature);
          for (const name of ['Arcane Signet', 'Sol Ring', 'Thought Vessel']) {
            const artifact = new MTG.CardInst(MTG.DEFS[name], victim);
            artifact.ctrl = victim; artifact.zone = 'battlefield'; artifact.sick = false;
            g.battlefield.push(artifact);
          }
        }
        for (const name of ['Swords to Plowshares', 'Void Rend', 'Snuff Out']) takeBot(name, 'graveyard');
        g.turnPlayer = bot; g.turnNo = 27; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        await g.emit('etb', { card: alisaie, ctrl: bot });
        await settle();

        const nova = takeBot('Cleansing Nova', 'hand');
        bot.pool.C = 3; bot.pool.W = 2;
        if (!await g.castSpell(bot, nova, { from: 'hand' })) throw new Error('Scions AI Cleansing Nova cast nije uspio');
        await settle();
        g.phase = 'end'; g.step = 'end';
        await g.emit('endStep', { player: bot });
        await settle();
        const recent = (g.aiDecisionLog || []).filter(entry => entry.playerName === bot.name).slice(-24);
        g.lg(`Scions AI: Partner=${alphinaud.zone}; Hero=${g.creatures(bot).filter(card => card.isToken && card.hasSub('Hero')).length}; Nova=${nova.zone}; odluke=${recent.length}; fallback=${recent.some(entry => entry.fallback) ? 'DA' : 'NE'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Scions AI scenario: Partner, G\'raha, wipe mod i Fandaniel odluke su razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'avengersHuman') {
      void (async () => {
        const take = (name, zone = 'battlefield') => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card); else ui.me[zone].push(card);
          return card;
        };
        const settle = async () => {
          let guard = 0;
          while ((g.pendingTriggers.length || g.stack.length) && guard++ < 120) {
            await g.flushTriggers();
            if (g.stack.length) await g.resolveTop();
          }
          if (guard >= 120) throw new Error('Avengers human scenario trigger guard');
        };
        const quinjet = take('Avengers Quinjet');
        const ironMan = take('Iron Man, Armored Avenger', 'hand');
        const jocasta = take('Jocasta, Automaton Avenger', 'graveyard');
        take('Captain Marvel, Apex Avenger');
        g.turnPlayer = ui.me; g.turnNo = 28; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        const resolveHandChoice = new URLSearchParams(window.location.search).get('smokeResolve') === 'hand';
        ui.toast(resolveHandChoice
          ? 'Avengers Quinjet: choose the real Hero card that will move from hand to the battlefield.'
          : 'Avengers Quinjet: choose the hand mode or the graveyard mode, then choose its real card.');
        ui.render();
        if (resolveHandChoice) {
          await quinjet.def.triggers[0].run({ g, src: quinjet, you: ui.me, mode: 0, targets: [], data: { card: quinjet } });
        } else {
          await g.emit('etb', { card: quinjet, ctrl: ui.me });
          await settle();
        }
        g.lg(`Avengers human: Iron Man=${ironMan.zone}; Jocasta=${jocasta.zone}; Quinjet=${quinjet.zone}.`, 'ai');
        ui.showLog = true;
        ui.toast('Avengers human scenario: the chosen Quinjet mode and card resolved through the stack.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'avengersAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Avengers Assemble');
        if (!bot) throw new Error('avengersAI scenario zahtijeva smokeAIDeck=Avengers Assemble');
        const takeBot = (name, zone = 'battlefield') => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card); else bot[zone].push(card);
          return card;
        };
        const settle = async () => {
          let guard = 0;
          while ((g.pendingTriggers.length || g.stack.length) && guard++ < 160) {
            await g.flushTriggers();
            if (g.stack.length) await g.resolveTop();
          }
          if (guard >= 160) throw new Error('Avengers AI scenario trigger guard');
        };
        const captainMarvel = takeBot('Captain Marvel, Apex Avenger');
        const antMan = takeBot('Ant-Man, Elusive Avenger');
        const door = takeBot('Door of Destinies', 'hand');
        g.remove(door); door.zone = 'nowhere';
        const quinjet = takeBot('Avengers Quinjet');
        const ironMan = takeBot('Iron Man, Armored Avenger', 'hand');
        const jocasta = takeBot('Jocasta, Automaton Avenger', 'graveyard');
        g.turnPlayer = bot; g.turnNo = 29; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        await g.move(door, 'battlefield', { ctrl: bot });
        g.addCounters(antMan, 'shield', 2, false, bot);
        await settle();
        await g.emit('etb', { card: quinjet, ctrl: bot });
        await settle();
        const recent = (g.aiDecisionLog || []).filter(entry => entry.playerName === bot.name).slice(-20);
        g.lg(`Avengers AI: Door=${door.meta.chosenType || 'nema'}; Marvel shield=${captainMarvel.counters.shield || 0}; Iron Man=${ironMan.zone}; Jocasta=${jocasta.zone}; odluke=${recent.length}; fallback=${recent.some(entry => entry.fallback) ? 'DA' : 'NE'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Avengers AI scenario: Hero type, Captain Marvel counters, and Quinjet mode resolved.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'fantasticHuman') {
      void (async () => {
        const take = (name, zone = 'battlefield') => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card); else ui.me[zone].push(card);
          return card;
        };
        const willie = take('Willie Lumpkin, Postman');
        take('Mister Fantastic, Reed Richards');
        const opponent = g.players.find(player => player !== ui.me);
        const threat = new MTG.CardInst(MTG.DEFS["Silver Surfer, Galactus's Herald"], opponent);
        threat.ctrl = opponent; threat.zone = 'battlefield'; threat.sick = false;
        g.battlefield.push(threat);
        const effort = take('Collective Effort', 'hand');
        ui.me.pool.W = 3;
        g.turnPlayer = ui.me; g.turnNo = 30; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.recalc();
        ui.toast('Collective Effort: choose removal plus counters, then lock the target/player and tap one creature for escalate.');
        ui.render();
        await g.castSpell(ui.me, effort, { from: 'hand' });
        while (g.pendingTriggers.length || g.stack.length) {
          await g.flushTriggers();
          if (g.stack.length) await g.resolveTop();
        }
        g.lg(`Fantastic human: Surfer=${threat.zone}; Willie +1/+1=${willie.counters['+1/+1'] || 0}.`, 'ai');
        ui.showLog = true;
        ui.toast('Fantastic Four human scenario: modalni targeti i escalate trošak su potpuno razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'fantasticAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'The Fantastic Four');
        if (!bot) throw new Error('fantasticAI scenario zahtijeva smokeAIDeck=The Fantastic Four');
        const takeBot = (name, zone = 'battlefield') => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card); else bot[zone].push(card);
          return card;
        };
        const settle = async () => {
          let guard = 0;
          while ((g.pendingTriggers.length || g.stack.length) && guard++ < 160) {
            await g.flushTriggers();
            if (g.stack.length) await g.resolveTop();
          }
          if (guard >= 160) throw new Error('Fantastic AI scenario trigger guard');
        };
        const surfer = takeBot("Silver Surfer, Galactus's Herald");
        const thing = takeBot('The Thing');
        takeBot('Cosmic Crucible');
        const opponents = g.players.filter(player => player !== bot && !player.lost);
        const victim = opponents[0];
        const third = opponents[1];
        const victimCreature = new MTG.CardInst(MTG.DEFS['Galactus, Devourer of Worlds'], victim);
        victimCreature.ctrl = victim; victimCreature.zone = 'battlefield'; victimCreature.sick = false;
        const thirdCreature = new MTG.CardInst(MTG.DEFS['Mister Fantastic, Reed Richards'], third);
        thirdCreature.ctrl = third; thirdCreature.zone = 'battlefield'; thirdCreature.sick = false;
        g.battlefield.push(victimCreature, thirdCreature);
        g.turnPlayer = bot; g.turnNo = 31; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.priorityRound = async () => {};
        g.recalc();

        await g.emit('combatDamageToPlayer', { card: surfer, player: victim, n: 4 });
        await settle();
        bot.pool = { W: 1, U: 1, B: 0, R: 1, G: 1, C: 0 };
        await g.emit('attacks', { card: thing, player: bot, defender: victim });
        await settle();
        const thingPaid = bot.pool.W === 0 && bot.pool.U === 0 && bot.pool.R === 0 && bot.pool.G === 0;
        bot.pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 };
        const signet = takeBot('Arcane Signet', 'hand');
        if (!await g.castSpell(bot, signet, { from: 'hand' })) throw new Error('Fantastic AI Arcane Signet cast nije uspio');
        await settle();
        const forced = g.untilEffects.some(effect => effect.kind === 'mustAttackPlayerCard' &&
          effect.iid === thirdCreature.iid && effect.targetPlayer === victim);
        const copies = g.bf().filter(card => card.ctrl === bot && card.name === 'Arcane Signet').length;
        const recent = (g.aiDecisionLog || []).filter(entry => entry.playerName === bot.name).slice(-24);
        g.lg(`Fantastic AI: Surfer third-party force=${forced ? 'DA' : 'NE'}; Thing empty pay=${thingPaid ? 'DA' : 'NE'}; Signet copies=${copies}; odluke=${recent.length}; fallback=${recent.some(entry => entry.fallback) ? 'DA' : 'NE'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Fantastic Four AI scenario: Surfer, Thing i Cosmic Crucible odluke su razriješene.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'wakandaHuman') {
      void (async () => {
        const take = (name, zone = 'battlefield') => {
          const zones = [ui.me.command, ui.me.hand, ui.me.library, ui.me.graveyard, ui.me.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], ui.me);
          g.remove(card);
          card.ctrl = ui.me; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card); else ui.me[zone].push(card);
          return card;
        };
        const revealed = [
          take('Harmonize', 'library'),
          take('Fight for the Throne', 'library'),
          take('Birds of Paradise', 'library'),
          take('Sol Ring', 'library'),
          take('Forest', 'library'),
          take('Canopy Vista', 'library'),
        ];
        const spell = take('Wakanda Forever!', 'graveyard');
        g.turnPlayer = ui.me; g.turnNo = 32; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.priorityRound = async () => {};
        g.recalc();
        ui.toast('Wakanda Forever!: pregledaj šest karata, zatim odvojeno izaberi permanent za battlefield i drugi permanent za ruku.');
        ui.render();
        await spell.def.resolve({ g, src: spell, you: ui.me, targets: [], so: { card: spell } });
        const battlefield = revealed.find(card => card.zone === 'battlefield');
        const hand = revealed.find(card => card.zone === 'hand');
        const graveyard = revealed.filter(card => card.zone === 'graveyard').length;
        g.lg(`Wakanda human: battlefield=${battlefield ? battlefield.name : 'none'} (${battlefield && battlefield.counters.indestructible || 0} indestructible); hand=${hand ? hand.name : 'none'}; graveyard=${graveyard}.`, 'ai');
        ui.showLog = true;
        ui.toast('Wakanda human scenario: oba nezavisna izbora i indestructible counter su razriješeni.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'wakandaAI') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Wakanda Forever');
        if (!bot) throw new Error('wakandaAI scenario zahtijeva smokeAIDeck=Wakanda Forever');
        const takeBot = (name, zone = 'battlefield') => {
          const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
          const card = zones.flat().find(candidate => candidate.name === name) || new MTG.CardInst(MTG.DEFS[name], bot);
          g.remove(card);
          card.ctrl = bot; card.zone = zone; card.sick = false;
          if (zone === 'battlefield') g.battlefield.push(card); else bot[zone].push(card);
          return card;
        };
        const settle = async () => {
          let guard = 0;
          while ((g.pendingTriggers.length || g.stack.length) && guard++ < 160) {
            await g.flushTriggers();
            if (g.stack.length) await g.resolveTop();
          }
          if (guard >= 160) throw new Error('Wakanda AI scenario trigger guard');
        };
        const revealed = [
          takeBot('Harmonize', 'library'),
          takeBot('Fight for the Throne', 'library'),
          takeBot('Birds of Paradise', 'library'),
          takeBot('Sol Ring', 'library'),
          takeBot('Forest', 'library'),
          takeBot('Canopy Vista', 'library'),
        ];
        const spell = takeBot('Wakanda Forever!', 'graveyard');
        const conduit = takeBot('Conduit of Worlds');
        const conduitCard = takeBot("Black Panther's Claws", 'graveyard');
        takeBot('Kimoyo Beads');
        g.turnPlayer = bot; g.turnNo = 33; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        g.priorityRound = async () => {};
        g.recalc();
        await spell.def.resolve({ g, src: spell, you: bot, targets: [], so: { card: spell } });
        bot.pool.C = 4;
        const conduitEntry = g.activatableList(bot).find(entry => entry.card === conduit && entry.ability);
        if (!conduitEntry || !await g.activateAbility(bot, conduitEntry)) throw new Error('Wakanda AI Conduit activation nije uspjela');
        await settle();
        bot.life = 8;
        g.phase = 'end'; g.step = 'end';
        await g.emit('endStep', { player: bot });
        await settle();
        const battlefield = revealed.find(card => card.zone === 'battlefield');
        const hand = revealed.find(card => card.zone === 'hand');
        const recent = (g.aiDecisionLog || []).filter(entry => entry.playerName === bot.name).slice(-24);
        g.lg(`Wakanda AI: battlefield=${battlefield ? battlefield.name : 'none'} (${battlefield && battlefield.counters.indestructible || 0} indestructible); hand=${hand ? hand.name : 'none'}; Conduit=${conduitCard.zone}; life=${bot.life}; odluke=${recent.length}; fallback=${recent.some(entry => entry.fallback) ? 'DA' : 'NE'}.`, 'ai');
        ui.showLog = true;
        ui.toast('Wakanda AI scenario: Wakanda Forever!, Conduit i Kimoyo odluke su razriješene.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'birdsAICombat') {
      void (async () => {
        const bot = g.players.find(player => player.isAI && player.deckName === 'Wakanda Forever');
        if (!bot) throw new Error('birdsAICombat scenario zahtijeva smokeAIDeck=Wakanda Forever');
        const zones = [bot.command, bot.hand, bot.library, bot.graveyard, bot.exile];
        const birds = zones.flat().find(card => card.name === 'Birds of Paradise') || new MTG.CardInst(MTG.DEFS['Birds of Paradise'], bot);
        g.remove(birds);
        birds.ctrl = bot; birds.zone = 'battlefield'; birds.sick = false; birds.tapped = false;
        g.battlefield.push(birds);
        g.turnPlayer = bot; g.turnNo = 2; g.phase = 'combat'; g.step = 'attackers'; g.paced = false;
        g.recalc();
        const opponents = bot.opponents(g);
        const q = { type: 'attackers', player: bot, eligible: [birds], opponents, attackTargets: opponents, forced: [] };
        const decision = await MTG.chooseBotAction({ gameState: g, botPlayerId: bot.idx, seed: 9, actionWindow: q });
        const assignments = MTG.unwrapBotDecisionAction(decision.action);
        if (assignments.length) throw new Error(`Birds AI canary je izabrao ${assignments.length} nepotreban napad`);
        g.combat = { attackers: [], defenders: new Map() };
        g.lg('AI combat canary: Birds of Paradise stays untapped — no attacks on turn 2.', 'ai');
        ui.showLog = true;
        ui.toast('AI correctly keeps Birds of Paradise untapped for mana.');
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'playerEffects') {
      const place = (player, name, meta = {}) => {
        const card = new MTG.CardInst(MTG.DEFS[name], player);
        card.ctrl = player; card.zone = 'battlefield'; card.sick = false; card.tapped = false;
        Object.assign(card.meta, meta);
        g.battlefield.push(card);
        return card;
      };
      const opponent = g.players.find(player => player !== ui.me && !player.lost);
      g.turnPlayer = ui.me; g.turnNo = 11; g.phase = 'main1'; g.step = 'main'; g.paced = false;
      place(ui.me, 'Patchwork Banner', { chosenType: 'Human' });
      place(ui.me, "Gourmand's Talent", { level: 2 });
      ui.me.cityBlessing = true;
      ui.me.emblems.push({ name: 'Garruk emblem' });
      g.untilEffects.push({ kind: 'tokenDouble', who: ui.me, expires: 'eot', label: 'Kaya, Geist Hunter' });
      place(opponent, "Progenitor's Icon", { chosenType: 'Wizard' });
      place(opponent, 'Outpost Siege', { siegeMode: 'dragons' });
      opponent.noMaxHandForever = true;
      g.recalc();
      ui.playerSheet = new URLSearchParams(window.location.search).get('smokePlayer') === 'human' ? ui.me : opponent;
      ui.render();
      return;
    }
    if (smokeScenario === 'personaReaction') {
      const bot = g.players.find(player => player.isAI && MTG.AI_STYLES[player.aiStyle]?.signature);
      if (!bot) throw new Error('personaReaction scenario requires a signature smokeAIStyle.');
      const source = new MTG.CardInst(MTG.DEFS['Inferno Titan'], bot);
      source.ctrl = bot; source.zone = 'battlefield'; source.sick = false; source.tapped = false;
      g.battlefield.push(source);
      g.turnPlayer = bot; g.turnNo = 7; g.phase = 'combat'; g.step = 'damage'; g.paced = false;
      const autoPersonaReaction = new URLSearchParams(window.location.search).get('autoPersonaReaction') === '1';
      // The generic web-game client performs a deliberately expensive full
      // DOM render before capture. Keep this explicit smoke-only reaction up
      // long enough for its screenshot; normal games use the 3.2 s duration.
      if (autoPersonaReaction) g._signatureReactionDuration = 15000;
      g.recalc(); ui.render();
      const trigger = document.createElement('button');
      trigger.id = 'smoke-trigger-persona';
      trigger.className = 'pbtn primary smokefxtrigger';
      trigger.textContent = `Trigger ${MTG.AI_STYLES[bot.aiStyle].name} signature comment`;
      trigger.onclick = async () => {
        trigger.remove();
        await g.damagePlayer(source, ui.me, 8, { combat: true });
        ui.render();
      };
      document.body.appendChild(trigger);
      if (autoPersonaReaction) setTimeout(() => trigger.click(), 250);
      return;
    }
    if (smokeScenario === 'generalEffects') {
      void (async () => {
        const mode = new URLSearchParams(window.location.search).get('smokeEffect') || 'damage';
        g.turnPlayer = ui.me; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.paced = true;
        const place = (player, name) => {
          const card = new MTG.CardInst(MTG.DEFS[name], player);
          card.ctrl = player; card.zone = 'battlefield'; card.sick = false; card.tapped = false;
          g.battlefield.push(card);
          return card;
        };
        if (mode === 'counter') {
          const source = place(ui.me, 'Stormcatch Mentor');
          const caster = g.players.find(player => player !== ui.me);
          const spell = new MTG.CardInst(MTG.DEFS['Swords to Plowshares'], caster);
          spell.ctrl = caster; spell.zone = 'stack';
          const stackObject = { kind: 'spell', name: spell.name, card: spell, ctrl: caster, targets: [], targetSpecs: [] };
          g.stack.push(stackObject); g.recalc(); ui.render();
          const trigger = document.createElement('button');
          trigger.id = 'smoke-trigger-fx'; trigger.className = 'pbtn primary smokefxtrigger'; trigger.textContent = 'Trigger counterspell FX';
          trigger.onclick = async () => { trigger.remove(); await g.counterStackObject(stackObject, { source, message: 'General effects smoke: spell countered.' }); };
          document.body.appendChild(trigger);
          return;
        } else if (mode === 'keywordFx') {
          const requested = new URLSearchParams(window.location.search).get('smokeKeyword') || 'hexproof';
          const keyword = MTG.KEYWORD_VISUALS[requested] ? requested : 'hexproof';
          const card = place(ui.me, 'Academy Manufactor');
          card.def = Object.assign({}, card.def, { kws: [...new Set([...(card.def.kws || []), keyword])] });
          g.recalc(); ui.render();
          const trigger = document.createElement('button');
          trigger.id = 'smoke-trigger-fx'; trigger.className = 'pbtn primary smokefxtrigger'; trigger.textContent = `Trigger ${keyword} FX`;
          trigger.onclick = () => { trigger.remove(); g.note('gameEffect', { kind: 'keyword', keyword, state: keyword === 'indestructible' ? 'prevented' : 'gained', card, target: card }); };
          document.body.appendChild(trigger);
          return;
        } else if (mode === 'minusCounter') {
          const card = place(ui.me, 'Academy Manufactor');
          g.recalc(); ui.render();
          const trigger = document.createElement('button');
          trigger.id = 'smoke-trigger-fx'; trigger.className = 'pbtn primary smokefxtrigger'; trigger.textContent = 'Trigger −1/−1 FX';
          trigger.onclick = async () => { trigger.remove(); await g.addM1(card, 2, ui.me); };
          document.body.appendChild(trigger);
          return;
        } else if (mode === 'keywords') {
          const cards = ['Zetalpa, Primal Dawn', 'Weathered Sentinels', 'Nighthawk Scavenger',
            'Quicksilver, Speedster', 'Adrix and Nev, Twincasters', 'Kulrath Knight',
            'Chatterfang, Squirrel General', 'Goldlust Triad', 'Ingenious Prodigy', 'Academy Manufactor']
            .map(name => place(ui.me, name));
          g.untilEffects.push({ expires: 'eot', apply: () => cards[9].cur.kw.add('shroud') });
          cards[9].counters['-1/-1'] = 2;
          g.recalc(); ui.render();
          g.lg('General effects smoke: complete ability icon board prepared.', 'effect');
        } else if (mode === 'strike' || mode === 'doubleStrike') {
          const attacker = place(ui.me, 'Riders of Gavony');
          const twin = place(ui.me, 'Inferno Titan');
          attacker.def = Object.assign({}, attacker.def, { kws: [...new Set([...(attacker.def.kws || []), 'first strike'])] });
          twin.def = Object.assign({}, twin.def, { kws: [...new Set([...(twin.def.kws || []), 'double strike'])] });
          const defender = g.players.find(player => player !== ui.me);
          for (const card of [attacker, twin]) { card.attacking = defender; card.blockedBy = []; card.wasBlocked = false; }
          if (mode === 'doubleStrike') { attacker.meta._dealtFirstStrike = true; twin.meta._dealtFirstStrike = true; }
          g.combat = { attackers: [attacker, twin] }; g.recalc(); ui.render();
          const trigger = document.createElement('button');
          trigger.id = 'smoke-trigger-fx'; trigger.className = 'pbtn primary smokefxtrigger'; trigger.textContent = `Trigger ${mode === 'doubleStrike' ? 'double strike' : 'first strike'} FX`;
          trigger.onclick = async () => { trigger.remove(); await g.combatDamage(ui.me, mode === 'doubleStrike' ? 'normal' : 'first'); };
          document.body.appendChild(trigger);
          return;
        } else if (mode === 'combatDamage') {
          const attacker = place(ui.me, 'Inferno Titan');
          const defender = g.players.find(player => player !== ui.me);
          attacker.attacking = defender; attacker.blockedBy = []; attacker.wasBlocked = false;
          g.combat = { attackers: [attacker] }; g.phase = 'combat'; g.step = 'damage';
          g.recalc(); ui.render();
          const trigger = document.createElement('button');
          trigger.id = 'smoke-trigger-fx'; trigger.className = 'pbtn primary smokefxtrigger'; trigger.textContent = 'Trigger combat damage FX';
          trigger.onclick = async () => { trigger.remove(); await g.combatDamage(ui.me, 'normal'); };
          document.body.appendChild(trigger);
          return;
        } else if (mode === 'bounce') {
          const card = place(ui.me, 'Inferno Titan');
          g.recalc(); ui.render(); await g.pace(500);
          await g.move(card, 'hand');
          g.lg('General effects smoke: return-to-hand transfer completed.', 'effect');
        } else if (mode === 'wipe') {
          const names = ['Stormcatch Mentor', 'Academy Manufactor', 'Riders of Gavony', 'Whirler Rogue', 'Inferno Titan', 'Palace Jailer'];
          names.forEach((name, index) => place(g.players[index % g.players.length], name));
          g.recalc(); ui.render(); await g.pace(500);
          await g.destroyMany(g.bf().filter(card => card.is('Creature')), { source: null });
          g.lg('General effects smoke: board wipe completed.', 'effect');
        } else {
          const commander = ui.me.commanders[0];
          if (!commander) throw new Error('General effects scenario nema komandera');
          await g.move(commander, 'battlefield', { ctrl: ui.me });
          await g.damageOpponents(commander, ui.me, 2);
          g.lg('General effects smoke: global damage confirmed and applied.', 'effect');
        }
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'voteDiplomacy') {
      void (async () => {
        if (!g.diplomacy || !g.diplomacy.enabled) MTG.initDiplomacy(g, true);
        g.turnPlayer = ui.me; g.turnNo = 5; g.phase = 'combat'; g.step = 'begin'; g.paced = false;
        const source = new MTG.CardInst(MTG.DEFS['Galadriel, Elven-Queen'], ui.me);
        source.ctrl = ui.me; source.zone = 'battlefield'; source.sick = false;
        g.battlefield.push(source); g.recalc(); ui.render();
        const votes = await MTG.E7.vote(g, ui.me, source, [
          { key: 'dominion', label: '👑 Dominion (Ring + counter)' },
          { key: 'guidance', label: '📜 Guidance (draw a card)' },
        ], voter => voter === ui.me ? 'dominion' : 'guidance');
        g.lg(`Vote bargain smoke: Dominion ${votes.get('dominion') || 0} · Guidance ${votes.get('guidance') || 0}.`, 'diplomacy');
        ui.sidebarTab = 'diplomacy'; ui.utilityDrawerOpen = true; ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'commanderIntro') {
      void (async () => {
        const requested = new URLSearchParams(window.location.search).get('smokeCommander');
        const commander = ui.me.commanders.find(card => card.name === requested) || ui.me.commanders[0];
        if (!commander) throw new Error('Commander intro scenario nema komandera');
        g.turnPlayer = ui.me; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.paced = false;
        await g.move(commander, 'battlefield', { ctrl: ui.me });
        ui.render();
      })().catch(error => { console.error(error); ui.toast(error.message); });
      return;
    }
    if (smokeScenario === 'planeswalkerCombat') {
      const makePermanent = (name, ctrl, loyalty) => {
        const card = new MTG.CardInst(MTG.DEFS[name], ctrl);
        card.ctrl = ctrl; card.zone = 'battlefield'; card.sick = false; card.tapped = false;
        g.battlefield.push(card);
        if (loyalty !== undefined) card.counters.loyalty = loyalty;
        return card;
      };
      const attackers = [
        makePermanent('Riders of Gavony', ui.me),
        makePermanent('Humble Defector', ui.me),
        makePermanent('Stormcatch Mentor', ui.me),
        makePermanent('Academy Manufactor', ui.me),
        makePermanent('Whirler Rogue', ui.me),
      ];
      const walkers = [
        makePermanent("Vraska, Betrayal's Sting", g.players[1], 6),
        makePermanent("Elspeth, Sun's Champion", g.players[2], 4),
        makePermanent('Tezzeret, Betrayer of Flesh', g.players[3], 4),
      ];
      g.turnPlayer = ui.me; g.turnNo = 20; g.phase = 'combat'; g.step = 'attackers'; g.paced = false;
      g.combat = { attackers: [], defenders: new Map() };
      g.recalc();
      const opponents = ui.me.opponents(g);
      void ui.me.controller.decide(g, {
        type: 'attackers', eligible: attackers, opponents,
        attackTargets: opponents.concat(walkers), forced: [attackers[0]],
      }).then(declared => {
        const valid = Array.isArray(declared) ? declared.filter(entry =>
          attackers.includes(entry.card) && g.legalDeclarationAttackTargets(entry.card).includes(entry.target)) : [];
        for (const entry of valid) {
          entry.card.attacking = entry.target;
          if (!entry.card.kw('vigilance')) g.tap(entry.card);
        }
        g.combat.attackers = valid.map(entry => entry.card);
        g.lg(`Planeswalker combat smoke: ${valid.length} attackers assigned.`, 'attack');
        ui.render();
      });
      // Browser canary namjerno fokusira planeswalkera: prvi klik na eligible
      // kartu mora je dodijeliti upravo Vraska laneu, bez per-card popupa.
      if (ui.pending) {
        ui.pending.attackTarget = walkers[0];
        if (new URLSearchParams(window.location.search).get('smokePreset') === 'assigned') {
          ui.pending.sel.push({ card: attackers[0], target: walkers[0] });
        }
        if (new URLSearchParams(window.location.search).get('smokePeek') === '1') ui.pending.boardPeek = true;
      }
      ui.render();
      return;
    }
    const begin = restoringBoard
      ? (async () => {
        // Put the saved board back and carry on from the turn it was saved at.
        MTG.restoreGameState(g, resumeSave.state);
        ui.render();
        ui.toast(`Saved game restored · turn ${g.turnNo + 1} · the board is exactly as you left it.`);
        await MTG.resumeGame(g);
      })()
      : g.start();
    begin.catch(err => {
      console.error(err);
      ui.handleFatal(err);
    });
    return g;
  }

  // Main-menu paste UI koristi isti startGame tok kao fabrički deckovi.
  // Funkcija namjerno ne renderuje svoj paralelni game mode: prvo registruje
  // samo potpuno validiran deck, pa ga predaje normalnom UI/engineu.
  function startValidatedImportedCommanderDeck(imported, options = {}) {
    if (!imported || !imported.ok) return { imported, game: null };
    MTG.registerImportedDeck(imported, { replace: true });
    const game = startGame({
      deck: imported.deck.name,
      commanders: imported.commanders,
      ai: 3,
      aiDecks: options.aiDecks || [],
      aiStyles: options.aiStyles || ['balanced', 'balanced', 'balanced'],
      aiRandomCommanders: false,
      sumPartnerDamage: !!options.sumPartnerDamage,
      diplomacyEnabled: !!options.diplomacyEnabled,
      difficulty: options.difficulty || 'normal',
      // Blank delegates to startGame's fresh seed; only explicit replay/test
      // seeds (including 0) should repeat an imported deck's opening hand.
      seed: String(options.seed ?? ''),
    });
    return { imported, game };
  }

  MTG.startImportedCommanderDeck = function (text, options = {}) {
    const imported = MTG.importCommanderDeck(text, {
      name: options.name,
      commanders: options.commanders,
      register: false,
    });
    return startValidatedImportedCommanderDeck(imported, options);
  };

  MTG.startSavedImportedCommanderDeck = function (id, options = {}) {
    const entry = MTG.getImportedDeckLibraryEntry(id);
    if (!entry || !entry.record) throw new Error('This saved deck is not in My Library.');
    // A saved validation result is never trusted. Oracle support, interaction
    // contracts and Commander legality are evaluated again on every launch.
    const imported = MTG.validateImportedDeckRecord(entry.record);
    if (!imported.ok) {
      MTG.hydrateImportedDeckLibrary(
        MTG.getImportedDeckLibrary().entries.map(saved => saved.record).filter(Boolean),
        { source: MTG.getImportedDeckLibrary().source }
      );
      return { imported, game: null };
    }
    return startValidatedImportedCommanderDeck(imported, options);
  };

  MTG.prepareSavedImportedCommanderDeck = function (id) {
    if (currentImportedLibraryOwner() !== importedLibraryOwner) throw new Error('Your profile is still loading. Reopen My Library and try again.');
    const entry = MTG.getImportedDeckLibraryEntry(id);
    if (!entry?.record) throw new Error('This saved deck is not in My Library.');
    const imported = MTG.validateImportedDeckRecord(entry.record);
    if (!imported.ok) throw new Error(imported.errors[0]?.message || 'This deck no longer passes the engine check.');
    MTG.registerImportedDeck(imported, { replace: true });
    renderSetup({ mode: 'solo', importedDeckId: id });
    return imported;
  };

  MTG.resumeAccountSave = function (save) {
    const checkpoint = MTG.validateAccountSave(save);
    document.querySelector('.account-overlay')?.remove();
    document.body.classList.remove('account-dialog-open');
    return startGame({
      ...checkpoint.setup,
      mode: 'solo',
      ai: checkpoint.setup.aiDecks.length,
      resumeSave: checkpoint,
    });
  };

  // The generated Higgsfield client supplies a tiny roomClient adapter. The
  // existing engine remains host-authoritative while every remote human decision
  // is validated by the room contract before this controller hydrates it.
  MTG.startOnlineHostGame = function (roomView, roomClient) {
    if (!roomView || roomView.phase !== 'running' || roomView.you !== 0)
      throw new Error('Only the connected host can start the live Commander engine.');
    const seats = roomView.seats || [];
    const host = seats.find(seat => seat.seat === 0);
    const humans = seats.filter(seat => seat.kind === 'human').sort((a, b) => a.seat - b.seat);
    if (!host || humans.length < 2 || humans.length > 4 || humans.length !== seats.length)
      throw new Error('Live Commander requires two to four human players and no bots.');
    // Every seat's deck is built on this machine. A guest playing an imported
    // list sends the list with their seat; the host registers it here so the
    // engine can build the same deck it would build for its owner.
    const ownLibrary = new Set((MTG.getImportedDeckLibrary?.() || { entries: [] }).entries
      .filter(entry => entry.ready).map(entry => entry.name));
    for (const seat of humans) {
      if (!seat.deckRecord) continue;
      const seatName = seat.name || `Player ${seat.seat + 1}`;
      // The host's own saved lists are never overwritten by a guest's list of
      // the same name; the guest renames their deck instead.
      if (seat.seat !== 0 && ownLibrary.has(seat.deckRecord.name))
        throw new Error(`${seatName} sent a deck named ${seat.deckRecord.name}, which is also in your My Library. Ask them to rename their list.`);
      const adopted = MTG.adoptImportedDeckRecord(seat.deckRecord);
      if (!adopted.ok) throw new Error(`${seatName} sent an imported deck that cannot be built: ${adopted.error}`);
    }
    const missing = humans.filter(seat => !MTG.DECKS[seat.deckId]);
    if (missing.length) throw new Error(`No deck named ${missing[0].deckId} is available on the host.`);
    const bridge = MTG.onlineHostBridge(roomClient);
    return startGame({
      deck: host.deckId,
      commanders: host.commanderNames,
      remoteHumans: humans.slice(1).map(human => ({
        deck: human.deckId,
        name: human.name || `Player ${human.seat + 1}`,
        commanders: human.commanderNames,
        controller: player => MTG.remoteControllerFor(player, bridge),
      })),
      ai: 0,
      aiDecks: [],
      aiStyles: [],
      aiRandomCommanders: false,
      sumPartnerDamage: !!roomView.settings.sumPartnerDamage,
      diplomacyEnabled: false,
      difficulty: 'normal',
      seed: String(roomView.settings.seed),
      onlineBridge: bridge,
    });
  };

  // Stabilan, semantički prikaz trenutno vidljivog stanja. Koriste ga desktop
  // smoke-testovi i card-by-card scenariji; ne sadrži skrivene biblioteke AI-a.
  MTG.renderGameState = function () {
    const g = window._game;
    const ui = window._ui;
    if (!g) {
      const setup = document.querySelector('#setup');
      const online = setup && setup.querySelector('[data-online-view]');
      if (online) {
        return {
          mode: online.dataset.onlineView,
          phase: online.dataset.phase || 'lobby',
          playerCount: Number(online.dataset.playerCount) || online.querySelectorAll('.onlineseat').length,
          you: Number(online.dataset.you),
          seats: [...online.querySelectorAll('.onlineseat')].map(seat => ({
            number: seat.querySelector('.onlineseatnum')?.textContent?.trim() || '',
            name: seat.querySelector('.onlineseatcopy b')?.textContent?.trim() || '',
            deck: seat.querySelector('.onlineseatcopy span')?.textContent?.trim() || '',
            connected: seat.classList.contains('connected'),
            mine: seat.classList.contains('mine'),
          })),
          invite: online.querySelector('.online-invite b')?.textContent?.trim() || null,
          status: online.querySelector('.online-lobby-actions b')?.textContent?.trim() || null,
          pendingDecision: online.querySelector('.online-decision.active h2')?.textContent?.trim() || null,
        };
      }
      if (setup && setup.dataset.appView === 'home') {
        const deckImport = setup.querySelector('.mainmenu-deckimport');
        const library = MTG.getImportedDeckLibrary ? MTG.getImportedDeckLibrary() : { source: 'guest', entries: [] };
        return {
          mode: 'menu',
          deckCount: MTG.DECKS ? Object.keys(MTG.DECKS).filter(name => !MTG.DECKS[name].custom).length : 0,
          actions: [...setup.querySelectorAll('[data-menu-action]')].map(button => button.dataset.menuAction),
          onboardingOpen: !!setup.querySelector('.mainmenu-onboarding'),
          deckImport: deckImport ? {
            open: true,
            state: deckImport.dataset.importState || 'idle',
            inputCards: Number(deckImport.dataset.inputCards) || 0,
            commanders: deckImport.dataset.commanders || '',
            canSave: !deckImport.querySelector('.mainmenu-deckimport-start')?.disabled,
            libraryCount: Number(deckImport.dataset.libraryCount) || 0,
            libraryReady: Number(deckImport.dataset.libraryReady) || 0,
          } : { open: false },
          importedDeckLibrary: {
            source: library.source,
            readyCount: library.entries.filter(entry => entry.ready).length,
            unavailableCount: library.entries.filter(entry => !entry.ready).length,
            decks: library.entries.map(entry => ({
              id: entry.id,
              name: entry.name,
              commanders: entry.commanders,
              ready: entry.ready,
              issues: entry.issues.map(problem => problem.code),
            })),
          },
          account: globalThis.MTGAccount?.user ? {
            signedIn: true,
            displayName: globalThis.MTGAccount.user.displayName,
            hasSave: !!globalThis.MTGAccount.save,
          } : { signedIn: false, hasSave: false },
        };
      }
      const selected = setup && setup.querySelector('.deckcard.selected');
      const spotlight = setup && setup.querySelector('.deckspotlight');
      return {
        mode: 'setup',
        deckCount: MTG.DECKS ? Object.keys(MTG.DECKS).length : 0,
        stage: setup && setup.dataset.setupStage || 'deck',
        selectedDeck: selected && selected.closest('.deckentry')?.dataset.deck || null,
        spotlight: spotlight ? {
          deck: spotlight.dataset.deck,
          actions: [...spotlight.querySelectorAll('button')].map(button => button.textContent.trim() || button.getAttribute('aria-label')),
        } : null,
      };
    }
    const card = c => ({
      id: c.iid, name: c.name, zone: c.zone, tapped: !!c.tapped,
      types: c.cur && c.cur.types ? [...c.cur.types] : [...(c.def.types || [])],
      subtypes: c.cur && c.cur.subtypes ? [...c.cur.subtypes] : [...(c.def.subtypes || [])],
      landCreature: c.is('Land') && c.is('Creature'),
      suspended: c.meta && Object.prototype.hasOwnProperty.call(c.meta, 'suspended')
        ? Math.max(0, Number(c.meta.suspended) || 0) : undefined,
      faceDown: !!c.faceDown,
      hiddenIdentity: c.faceDown && c.ctrl === ui.me && c.meta && c.meta.faceDownDef
        ? c.meta.faceDownDef.name : undefined,
      power: c.is('Creature') ? c.power : undefined,
      toughness: c.is('Creature') ? c.toughness : undefined,
      damage: c.zone === 'battlefield' && c.is('Creature') ? c.damage || 0 : undefined,
      deathtouched: c.zone === 'battlefield' && c.is('Creature') ? !!c.deathtouched : undefined,
      attacking: c.attacking ? c.attacking.name : null,
      blocking: c.blocking || null,
      attachedTo: c.attachedTo ? (g.byIid(c.attachedTo)?.name || c.attachedTo) : null,
      enchantedPlayer: c.meta && c.meta.cursedPlayer ? c.meta.cursedPlayer.name : null,
      attachments: (c.attachments || []).map(iid => g.byIid(iid)?.name || iid),
      counters: Object.fromEntries(Object.entries(c.counters || {}).filter(([, n]) => n)),
    });
    const players = g.players.map(p => {
      const style = p.isAI && MTG.AI_STYLES && MTG.AI_STYLES[p.aiStyle];
      const skill = p.isAI && MTG.getAIStyleSkill ? MTG.getAIStyleSkill(p.aiStyle) : null;
      let styleMode = null;
      if (p.isAI && MTG.getAIStyleMode) {
        try { styleMode = MTG.getAIStyleMode(g, p); } catch (error) { styleMode = null; }
      }
      return {
        name: p.name, deck: p.deckName, life: p.life, poison: Number(p.poison) || 0, lost: !!p.lost, isAI: !!p.isAI,
        aiStyle: style ? p.aiStyle : undefined,
        aiStyleLabel: style ? style.label : undefined,
        aiSkill: skill ? skill.id : undefined,
        aiMode: styleMode || undefined,
        handCount: p.hand.length, libraryCount: p.library.length,
        graveyardCount: p.graveyard.length, exileCount: p.exile.length,
        manaPool: Object.fromEntries(Object.entries(p.pool || {}).filter(([, amount]) => amount > 0)),
        commanders: p.commanders.map(card),
        battlefield: g.battlefield.filter(c => c.ctrl === p).map(card),
        hand: p === ui.me ? p.hand.map(card) : undefined,
        exile: p === ui.me ? p.exile.map(card) : undefined,
        visibleLibraryTop: ui.visibleLibraryTop?.(g, p) ? card(ui.visibleLibraryTop(g, p)) : undefined,
        activeEffects: ui && ui.playerStatusEffects ? ui.playerStatusEffects(g, p).map(effect => ({
          kind: effect.kind, label: effect.label, detail: effect.detail,
          source: effect.source || null, duration: effect.duration || null,
        })) : [],
      };
    });
    const pending = ui && ui.pending ? ui.pending.q : (ui && ui.react ? ui.react.q : null);
    const pendingDecisionActions = (() => {
      if (!pending) return [];
      if (pending.type === 'main') {
        const phaseLabel = g.phase === 'main1' ? 'Continue to combat' :
          g.phase === 'main2' && g.step === 'additional' ? 'Continue to next phase' : 'End turn';
        return (pending.lands || []).map(card => ({
          card: card.name, from: card.zone, label: `Play ${card.name}`,
        })).concat({ label: phaseLabel, value: { kind: 'done' } });
      }
      if (pending.type === 'priority') return [{
        label: MTG.isLastEndStepBeforeMyTurn(g, ui.me) ? 'Continue to my turn' : 'Proceed',
        value: { kind: 'pass' },
      }];
      if (pending.type === 'mulligan') return [
        { label: 'Keep hand', value: false },
        { label: 'Mulligan', value: true },
      ];
      if (pending.type === 'chooseOption') return (pending.options || []).map(option => ({
        label: MTG.uiText(option.label), value: option.key,
      }));
      if (pending.type === 'chooseMulti') return (pending.options || []).map(option => ({
        label: MTG.uiText(option.label), value: option.key,
      }));
      if (pending.type === 'combatReview' || pending.type === 'effectReview' || pending.type === 'cardReveal') {
        return [{ label: 'Proceed', value: true }];
      }
      if (pending.type === 'threatAlert') return [
        { label: 'Got it', value: { hold: false } },
        { label: 'I will respond (HOLD)', value: { hold: true } },
      ];
      if (pending.type === 'attackers') {
        const selected = ui && ui.pending ? (ui.pending.sel || []) : [];
        const selectedCards = new Set(selected.map(entry => entry && entry.card).filter(Boolean));
        const missingForced = (pending.forced || []).some(card => !selectedCards.has(card));
        if (missingForced) return [];
        return [{
          label: selected.length ? `Confirm attack (${selected.length})` : 'No attacks',
          value: selected.map(entry => ({ card: entry.card.name, target: entry.target.name })),
        }];
      }
      if (pending.type === 'blockers') {
        const selected = ui && ui.pending && ui.pending.assigns
          ? [...ui.pending.assigns.entries()].flatMap(([blocker, targets]) => [].concat(targets).map(attacker => [blocker, attacker])) : [];
        return [{
          label: selected.length ? `Confirm blocks (${selected.length})` : 'No blocks',
          value: selected.map(([blocker, attacker]) => ({ blocker: blocker.name, attacker: attacker.name })),
        }];
      }
      if (pending.type === 'bottomCards' || pending.type === 'chooseCards' || pending.type === 'chooseTargets') {
        const selected = ui && ui.pending ? (ui.pending.sel || []) : [];
        const proliferate = pending.type === 'chooseTargets' && pending.spec && pending.spec.what === 'proliferate';
        const actions = selected.length >= (pending.min || 0)
          ? [{ label: proliferate
            ? (selected.length ? `Confirm proliferate (${selected.length})` : 'Confirm proliferate with no selections')
            : `Confirm (${selected.length})`, value: selected.map(target => target.name || target.card && target.card.name || 'stack object') }]
          : [];
        if (!proliferate && (pending.type === 'chooseCards' || pending.type === 'chooseTargets') && pending.min === 0) {
          actions.push({ label: 'None', value: [] });
        }
        return actions;
      }
      if (pending.type === 'chooseX') return [{
        label: `Confirm X=${ui && ui.pending ? ui.pending.xVal : pending.min}`,
        value: ui && ui.pending ? ui.pending.xVal : pending.min,
      }];
      if (pending.type === 'scry') return [{ label: 'Confirm scry', value: true }];
      if (pending.type === 'orderTriggers') return [{ label: 'Confirm order', value: true }];
      return [];
    })();
    return {
      mode: g.gameOver ? 'gameover' : 'game',
      account: {
        signedIn: !!globalThis.MTGAccount?.user,
        saveStatus: ui?.accountSaveStatus?.state || null,
        saveLabel: ui?.accountSaveStatus?.text || null,
        replay: ui?.accountReplay || null,
        decisionCount: MTG.activeAccountMatch?.decisions?.length || 0,
      },
      signatureReaction: ui && ui.activePersonaReaction ? {
        style: ui.activePersonaReaction.style,
        persona: ui.activePersonaReaction.personaName,
        moment: ui.activePersonaReaction.moment,
        label: ui.activePersonaReaction.label,
        comment: ui.activePersonaReaction.comment,
        detail: ui.activePersonaReaction.detail,
      } : null,
      manaMode: ui ? ui.manaMode : 'auto',
      lastResort: ui ? {
        active: !!ui.lastResortActive,
        paused: !!g.lastResortPaused,
        toolboxOpen: !!ui.showJudge && !!ui.lastResortActive,
        hiddenInformation: 'opponent hands, libraries, and face-down identities stay hidden',
      } : { active: false, paused: false, toolboxOpen: false },
      coordinateSystem: 'Commander seats are ordered by players[]; the human seat is marked isAI=false.',
      turn: g.turnNo, activePlayer: g.turnPlayer ? g.turnPlayer.name : null,
      phase: g.phase, step: g.step, winner: g.winner ? g.winner.name : null,
      monarch: g.monarch ? {
        name: g.monarch.name,
        isHuman: g.monarch === ui.me,
        since: g.monarchSince || null,
      } : null,
      additionalPhases: (g._additionalPhases || []).map(entry => entry.kind),
      extraCombats: g._extraCombats || 0,
      diplomacy: g.diplomacy && g.diplomacy.enabled && ui && ui.me ? (() => {
        const view = g.diplomacyView(ui.me);
        return {
          enabled: true, unlocked: view.status.unlocked, completedRounds: view.status.rounds,
          unlockRounds: view.status.unlockRounds, reason: view.status.reason,
          offersRemaining: view.offersRemaining,
          incoming: view.incoming.map(proposal => ({
            id: proposal.id, from: proposal.fromName,
            kind: proposal.kind === 'group-removal' ? 'group-removal' : proposal.isCounteroffer ? 'counteroffer' : 'bot-initiated',
            title: proposal.title,
            participants: proposal.participantNames,
            clauses: proposal.clauses,
            publicBalance: proposal.publicBalance,
          })),
          recentNegotiations: view.recent,
          activeContracts: view.activeContracts.map(contract => ({
            id: contract.id,
            clauses: contract.clauses.map(clause => ({ state: clause.state, label: clause.label })),
          })),
        };
      })() : { enabled: false },
      pending: pending ? {
        type: pending.type,
        prompt: pending.prompt ? MTG.uiText(pending.prompt) : null,
        xChoice: pending.type === 'chooseX' ? {
          min: pending.min, max: pending.max,
          legalValues: pending.values || undefined,
          current: ui.pending && ui.pending.xVal,
        } : undefined,
        selectedTargets: pending.type === 'chooseTargets' && ui.pending
          ? (ui.pending.sel || []).map((target, index) => ({
            order: index + 1, name: target.name || target.card && target.card.name || 'stack object',
            selectionKind: pending.spec && pending.spec.what === 'proliferate' ? 'proliferate choice' : 'target',
            adds: pending.spec && pending.spec.what === 'proliferate'
              ? (target instanceof MTG.Player
                ? [...((target.poison||0)>0?['+1 poison']:[]),...((target.counters?.energy||0)>0?['+1 energy']:[])]
                : Object.entries(target.counters || {}).filter(([, amount]) => amount > 0).map(([kind]) => `+1 ${kind}`))
              : undefined,
          })) : undefined,
        allocation: pending.type === 'chooseX' && pending.allocation ? {
          kind: pending.allocation.kind,
          source: pending.allocation.source && pending.allocation.source.name,
          total: pending.allocation.total,
          currentTarget: pending.allocation.targets[pending.allocation.index] &&
            pending.allocation.targets[pending.allocation.index].name,
          currentValue: ui.pending && ui.pending.xVal,
          assigned: (pending.allocation.assigned || []).map(entry => ({
            name: entry.target && entry.target.name, amount: entry.n,
          })),
          remaining: pending.allocation.left,
        } : undefined,
        effect: pending.type === 'effectReview' ? {
          kind: pending.effectKind,
          source: pending.source && pending.source.name,
          amount: pending.amount,
          targets: (pending.targets || []).map(player => ({ name: player.name, life: player.life })),
        } : undefined,
        actions: pendingDecisionActions.concat((pending.casts || []).map(entry => ({
          card: entry.card && entry.card.name,
          from: entry.from,
          label: entry.from === 'exile'
            ? `Play ${entry.card && entry.card.name} from exile`
            : `Cast ${entry.card && entry.card.name}`,
        })).concat((pending.acts || []).map(entry => ({
          card: entry.card && entry.card.name,
          label: MTG.uiText(entry.manaAbility ? entry.label :
            entry.turnFaceUp ? entry.label :
              entry.handAbility ? entry.card.def.handAbility.label :
                entry.gyAbility ? (entry.gyAbilityOverride || entry.card.def.gyAbility).label :
                  entry.ability ? entry.ability.label :
                    entry.equip ? 'Equip' : entry.crew ? 'Crew' : entry.cycling ? 'Cycling' :
                    entry.suspend ? `Suspend ${entry.card.def.suspend.cost} with ${entry.card.def.suspend.n} time counters` : 'Activate'),
        })))),
      } : null,
      priority: g.priorityState ? {
        holder: g.priorityState.holder ? g.priorityState.holder.name : null,
        consecutivePasses: g.priorityState.consecutivePasses,
        neededPasses: g.priorityState.neededPasses,
      } : null,
      stack: g.stack.map((item, index) => ({
        index, kind: item.kind, name: item.name, controller: item.ctrl && item.ctrl.name,
        isCopy: !!item.isCopy,
        copyIndex: item.copyIndex || null,
        copiedFrom: item.copyOf && (item.copyOf.card && item.copyOf.card.name || item.copyOf.name) || null,
        copiedBy: item.copySource && item.copySource.name || null,
        targetMode: item.targetMode || null,
        targets: (item.targets || item.ctx && item.ctx.targets || []).flat(Infinity).filter(Boolean).map(target => {
          const cardTarget = target.card || target;
          return {
            name: target instanceof MTG.Player
              ? target.name
              : cardTarget.faceDown && cardTarget.ctrl !== ui.me ? 'Face-down permanent' : cardTarget.name || 'Stack object',
            controller: cardTarget.ctrl && cardTarget.ctrl.name || null,
            faceDown: !!cardTarget.faceDown,
            zone: cardTarget.zone,
          };
        }),
        damageDivision: (item.damageDivision || item.ctx && item.ctx.damageDivision || []).map(entry => {
          const dividedTarget = entry.playerIdx !== null && entry.playerIdx !== undefined
            ? g.players.find(player => player.idx === entry.playerIdx) : g.byIid(entry.iid);
          return {
            target: dividedTarget && dividedTarget.name,
            amount: entry.n,
            faceDown: !!(dividedTarget && dividedTarget.faceDown),
            zone: dividedTarget && dividedTarget.zone,
          };
        }),
      })),
      combat: g.combat ? {
        attackers: g.combat.attackers.map(card),
      } : null,
      aiDecisions: (g.aiDecisionLog || []).slice(-3).map(entry => ({
        turn: entry.turn, player: entry.playerName, chosen: MTG.uiText(entry.chosen),
        style: entry.style || null, skill: entry.skill || null, mode: entry.mode || null,
        score: entry.score, reason: Array.isArray(entry.scoreBreakdown)
          ? entry.scoreBreakdown.map(MTG.uiText)
          : typeof entry.scoreBreakdown === 'string'
            ? MTG.uiText(entry.scoreBreakdown)
            : entry.scoreBreakdown,
        nodes: entry.analyzedNodes, depth: entry.reachedDepth,
        tieBreak: entry.tieBreak, fallback: entry.fallback,
      })),
      pendingDecision: ui && ui.pending ? {
        type: ui.pending.q.type,
        eligible: (ui.pending.q.eligible || ui.pending.q.potential || ui.pending.q.candidates || ui.pending.q.from || []).map(candidate => {
          if (candidate instanceof MTG.Player) return candidate.name;
          if (candidate && candidate.faceDown && candidate.ctrl !== ui.me) return 'Face-down permanent';
          return candidate && (candidate.name || candidate.label) || 'Option';
        }),
        targets: ui.pending.q.type === 'attackers'
          ? (ui.pending.q.attackTargets || ui.pending.q.opponents || []).map(target => target.name)
          : ui.pending.q.type === 'blockers'
            ? (ui.pending.q.attackers || []).map(card => card.name)
            : [],
        legalAssignments: ui.pending.q.type === 'attackers'
          ? (ui.pending.q.eligible || []).flatMap(attacker => {
            const targets = g.legalDeclarationAttackTargets
              ? g.legalDeclarationAttackTargets(attacker)
              : (ui.pending.q.attackTargets || ui.pending.q.opponents || []);
            const legalTargets = g.diplomacyAttackTargetsFor
              ? g.diplomacyAttackTargetsFor(attacker, targets, (ui.pending.q.forced || []).includes(attacker))
              : targets;
            return legalTargets.map(target => ({ card: attacker.name, target: target.name }));
          })
          : ui.pending.q.type === 'blockers'
            ? (ui.pending.q.potential || []).flatMap(blocker => (ui.pending.q.attackers || [])
              .filter(attacker => !g.canBlock || g.canBlock(blocker, attacker))
              .map(attacker => ({ card: blocker.name, target: attacker.name })))
            : [],
        forced: (ui.pending.q.forced || []).map(card => card.name),
        assignments: ui.pending.q.type === 'attackers'
          ? (ui.pending.sel || []).filter(entry => entry && entry.card && entry.target)
            .map(entry => ({ card: entry.card.name, target: entry.target.name }))
          : ui.pending.q.type === 'blockers' && ui.pending.assigns
            ? [...ui.pending.assigns.entries()].flatMap(([blocker, targets]) => [].concat(targets).map(attacker => ({
              card: blocker.name, target: attacker.name,
            })))
            : [],
      } : null,
      players,
      recentLog: g.log.slice(-10).map(entry => ({ ...entry, msg: MTG.uiText(entry.msg) })),
    };
  };
  window.render_game_to_text = () => JSON.stringify(MTG.renderGameState());

  // Card game nema kontinuiranu fiziku; ovaj hook uklanja vizuelno čekanje i
  // osvježava deterministički snapshot između automatizovanih input burstova.
  window.advanceTime = async ms => {
    const g = window._game;
    if (g) {
      g._testClock = (g._testClock || 0) + Math.max(0, Number(ms) || 0);
      g.speedFactor = 0;
    }
    await Promise.resolve();
    if (window._ui) window._ui.render();
    return MTG.renderGameState();
  };

  let entryInitialized = false;
  const initializeEntry = () => {
    if (entryInitialized) return;
    entryInitialized = true;
    MTG.initData(MTG.RAW_DATA);
    hideImportedLibraryWhileOwnerChanges();
    if (currentImportedLibraryOwner() !== 'loading') {
      void refreshImportedDeckLibrary({ force: true }).then(announceImportedLibraryChange);
    }
    const initialParams = new URLSearchParams(window.location.search);
    const onlineSmoke = initialParams.get('onlineSmoke');
    if (['host', 'guest', 'guest2', 'guest3', 'guest4'].includes(onlineSmoke)) {
      MTG.createHiggsfieldRoomClient = async () => MTG.createOnlineSmokeRoomClient(onlineSmoke);
      void openOnlineLobby(null, 'smoke');
      return;
    }
    const liveRoom = initialParams.get('room');
    if (liveRoom && typeof MTG.createHiggsfieldRoomClient === 'function') {
      void openOnlineLobby(null, liveRoom);
      return;
    }
    const pendingSetupMode = window.__mtgPendingSetupMode;
    if (pendingSetupMode === 'solo' || pendingSetupMode === 'online') {
      delete window.__mtgPendingSetupMode;
      renderSetup({ mode: pendingSetupMode });
      return;
    }
    renderMainMenu();
    // Reproducibilan desktop smoke ulaz. Ne mijenja normalan UX; test otvara
    // stvarnu partiju i zaustavlja se na prvoj ljudskoj odluci (mulligan).
    const smoke = initialParams;
    const smokeDeck = smoke.get('smokeDeck');
    if (smokeDeck && MTG.DECKS[smokeDeck]) {
      const smokeAIDeck = smoke.get('smokeAIDeck');
      const requestedSmokeStyle = smoke.get('smokeAIStyle');
      const smokeAIStyle = requestedSmokeStyle && MTG.AI_STYLES[requestedSmokeStyle] ? requestedSmokeStyle : 'balanced';
      startGame({
        deck: smokeDeck,
        commanders: MTG.defaultCommanders(MTG.DECKS[smokeDeck], MTG.DEFS),
        ai: 3,
        aiDecks: smokeAIDeck && MTG.DECKS[smokeAIDeck] ? [smokeAIDeck] : [],
        aiStyles: [smokeAIStyle, smokeAIStyle, smokeAIStyle],
        aiRandomCommanders: false,
        sumPartnerDamage: false,
        diplomacyEnabled: smoke.get('diplomacy') === '1',
        difficulty: 'normal',
        seed: smoke.get('seed') || '11081',
      });
    }
  };
  window.addEventListener('mtg:account-change', () => {
    if (!entryInitialized || !MTG.CARD_CATALOG) return;
    const owner = currentImportedLibraryOwner();
    if (window._game && owner === activeGameLibraryOwner) return;
    if (owner === importedLibraryOwner) return;
    const previousOwner = activeGameLibraryOwner || importedLibraryOwner;
    hideImportedLibraryWhileOwnerChanges();
    if (!window._game && $('#setup')?.querySelector('[data-imported-deck-id]')) renderSetup({ mode: 'solo' });
    if (window._game) {
      // Any seat may now hold an imported deck, so a rematch is unsafe as soon
      // as one of them belongs to a library that just changed hands.
      const customInPlay = (window._game.players || [])
        .some(player => player.deckName && MTG.DECKS[player.deckName]?.custom);
      if (owner === 'loading') {
        activeGameLibraryOwner = previousOwner;
        return;
      }
      if (previousOwner && previousOwner !== 'loading' && previousOwner !== owner && customInPlay) {
        delete MTG.rematchLastGame;
      }
      activeGameLibraryOwner = owner;
      return;
    }
    if (owner !== 'loading') void refreshImportedDeckLibrary({ force: true }).then(announceImportedLibraryChange);
  });
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initializeEntry, { once: true });
  } else {
    initializeEntry();
  }
})();
