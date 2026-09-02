// Lightweight public entry. The rules engine and 27 complete deck lists load
// only after a player asks to enter setup or opens a shared game URL.
'use strict';
import './account.js';

const root = document.querySelector('#setup');
const page = root && root.querySelector('.mainmenu');

if (!root || !page) throw new Error('Commander Simulator entry shell is missing.');

const detailsMarkup = `
  <section class="mainmenu-proof" aria-label="Product details">
    <div class="mainmenu-proof-stat"><strong>27</strong><span><b>Complete decks</b><small>Curated commanders and strategies</small></span></div>
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
      <li><span aria-hidden="true"><svg class="gameicon" aria-hidden="true" focusable="false"><use href="./assets/icons/game-ui.svg#icon-cards"></use></svg></span><div><b>Pick a deck</b><p>Filter by color or playstyle, then open its guide and signature cards.</p></div></li>
      <li><span aria-hidden="true"><svg class="gameicon" aria-hidden="true" focusable="false"><use href="./assets/icons/game-ui.svg#icon-player"></use></svg></span><div><b>Build the pod</b><p>Choose bot decks, personalities, difficulty, and optional Politics.</p></div></li>
      <li><span aria-hidden="true"><svg class="gameicon" aria-hidden="true" focusable="false"><use href="./assets/icons/game-ui.svg#icon-stack"></use></svg></span><div><b>Play the decisions</b><p>Proceed prompts, priority windows, targets, and combat stay visible.</p></div></li>
    </ol>
  </section>

  <section id="ways-to-play" class="mainmenu-modes" aria-label="Ways to play">
    <article class="mainmenu-mode solo">
            <div><small>PLAY AT YOUR PACE</small><h2>Solo Commander</h2><p>Build a complete four-player table around the deck you want to learn.</p><ul class="mainmenu-mode-points"><li>Three local AI opponents</li><li>Adjustable stops and personalities</li><li>Seeded games you can replay</li></ul></div>
      <button type="button" data-menu-action="solo">Start a solo table</button>
    </article>
    <article class="mainmenu-mode live">
            <div><small>PRIVATE TABLE</small><h2>Commander Live</h2><p>Open a private room for two, three, or four real players with no bot seats.</p><ul class="mainmenu-mode-points"><li>One invite link</li><li>Account optional; no public lobby</li><li>Up to four human seats</li></ul></div>
      <button type="button" data-menu-action="live">Create a Live table</button>
    </article>
  </section>

  <section class="mainmenu-final-cta" aria-labelledby="final-cta-title">
    <div><h2 id="final-cta-title">Pick a deck. We will set the table.</h2><p>Start solo now, or invite up to three friends to a private Live room.</p></div>
    <div class="mainmenu-final-actions"><button type="button" class="mainmenu-primary" data-menu-action="solo">Start a solo table</button><button type="button" class="mainmenu-secondary" data-menu-action="live">Create a Live table</button></div>
  </section>

  <footer class="mainmenu-footer">
    <div><b>COMMANDER SIMULATOR</b><span>Free, browser-based fan project. Card data and images are provided through Scryfall.</span><a href="#landing-top">Back to top</a></div>
    <p>Commander Simulator is unofficial Fan Content permitted under the <a href="https://company.wizards.com/en/legal/fancontentpolicy" target="_blank" rel="noreferrer">Fan Content Policy</a>. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.</p>
  </footer>`;

if (!page.querySelector('.mainmenu-proof')) page.insertAdjacentHTML('beforeend', detailsMarkup);
root.removeAttribute('aria-busy');

function onboardingComplete() {
  try { return localStorage.getItem('mtgOnboardingComplete') === '1'; }
  catch { return false; }
}

function rememberOnboarding() {
  try { localStorage.setItem('mtgOnboardingComplete', '1'); }
  catch { /* Private browsing can reject storage; setup still works. */ }
}

let gameLoad = null;

function showLoading(mode) {
  root.querySelector('.mainmenu-loadveil')?.remove();
  const veil = document.createElement('div');
  veil.className = 'mainmenu-loadveil';
  veil.setAttribute('role', 'status');
  veil.setAttribute('aria-live', 'polite');
  veil.innerHTML = `<div><i aria-hidden="true"></i><span>OPENING THE TABLE</span><h2>${mode === 'online' ? 'Preparing Commander Live.' : mode === 'import' ? 'Loading the decklist importer.' : 'Loading all 27 decks.'}</h2><p>The complete rules engine stays in this browser. This first load can take a moment.</p></div>`;
  root.appendChild(veil);
  page.inert = true;
  root.setAttribute('aria-busy', 'true');
  page.querySelectorAll('[data-menu-action]').forEach(button => { button.disabled = true; });
  return veil;
}

function showLoadError(veil, mode) {
  root.removeAttribute('aria-busy');
  page.querySelectorAll('[data-menu-action]').forEach(button => { button.disabled = false; });
  veil.classList.add('is-error');
  veil.innerHTML = '<div><span>TABLE LOAD INTERRUPTED</span><h2>The game files did not finish loading.</h2><p>Check the connection and try once more. Nothing has been submitted or saved.</p><button type="button">Try again</button></div>';
  veil.querySelector('button').onclick = () => {
    gameLoad = null;
    void loadGame(mode);
  };
  veil.querySelector('button').focus();
}

async function loadGame(mode = null) {
  if (mode === 'solo' || mode === 'online') window.__mtgPendingSetupMode = mode;
  const veil = showLoading(mode);
  try {
    if (!gameLoad) {
      gameLoad = (async () => {
        await import('./data.js');
        await import('./app.js');
      })();
    }
    await gameLoad;
    if ((mode === 'solo' || mode === 'online') && document.querySelector('#setup')?.dataset.appView === 'home') {
      globalThis.MTG?.showSetup?.({ mode });
    }
  } catch (error) {
    console.error('Commander Simulator failed to load.', error);
    delete window.__mtgPendingSetupMode;
    showLoadError(veil, mode);
  }
}

function hideLoading() {
  root.querySelector('.mainmenu-loadveil')?.remove();
  page.inert = false;
  root.removeAttribute('aria-busy');
  page.querySelectorAll('[data-menu-action]').forEach(button => { button.disabled = false; });
}

globalThis.MTGAccount?.setGameLoader(async save => {
  // Continue from the profile: the veil must never outlive the attempt. A
  // checkpoint that no longer restores used to leave "Loading all 27 decks."
  // on screen with the page inert, hiding the real error.
  try {
    await loadGame(null);
    if (!globalThis.MTG?.resumeAccountSave) throw new Error('The saved-game module did not finish loading.');
    return await globalThis.MTG.resumeAccountSave(save);
  } finally {
    hideLoading();
  }
});

function openGuide(continueMode = null) {
  page.querySelector('.mainmenu-onboarding')?.remove();
  document.body.classList.add('mainmenu-dialog-open');
  const overlay = document.createElement('div');
  overlay.className = 'mainmenu-onboarding';
  const dialog = document.createElement('article');
  dialog.className = 'mainmenu-onboarding-panel';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'public-guide-title');
  dialog.setAttribute('tabindex', '-1');
  dialog.innerHTML = `
    <button type="button" class="mainmenu-onboarding-close" aria-label="Close first-game guide">×</button>
    <header><span>FIRST GAME GUIDE</span><h2 id="public-guide-title">Four things before you sit down.</h2><p>You can reopen this guide from the main menu at any time.</p></header>
    <div class="mainmenu-onboarding-grid">
      <section><i aria-hidden="true">01</i><div><b>Your deck is complete</b><p>Every listed option is a fixed 100-card deck. Pick by feel first; the deck spotlight explains the plan.</p></div></section>
      <section><i aria-hidden="true">02</i><div><b>You control one seat</b><p>The other seats never expose hidden cards. Local AI makes decisions without an external model API.</p></div></section>
      <section><i aria-hidden="true">03</i><div><b>HOLD opens priority</b><p>Arm HOLD when you want to respond. The game also stops automatically at the priority windows you choose.</p></div></section>
      <section><i aria-hidden="true">04</i><div><b>Proceed protects clarity</b><p>Important spells, triggers, targets, and combat reviews wait until the table state is clear.</p></div></section>
    </div>
    <footer><button type="button" class="mainmenu-onboarding-later">Close guide</button><button type="button" class="mainmenu-onboarding-start">${continueMode === 'online' ? 'Build a Live table' : 'Choose my first deck'}</button></footer>`;
  overlay.appendChild(dialog);
  page.appendChild(overlay);

  const priorFocus = document.activeElement;
  const closeButton = dialog.querySelector('.mainmenu-onboarding-close');
  const close = () => {
    overlay.remove();
    document.body.classList.remove('mainmenu-dialog-open');
    if (priorFocus instanceof HTMLElement) priorFocus.focus({ preventScroll: true });
  };
  const start = dialog.querySelector('.mainmenu-onboarding-start');
  closeButton.onclick = close;
  dialog.querySelector('.mainmenu-onboarding-later').onclick = close;
  start.onclick = () => {
    rememberOnboarding();
    overlay.remove();
    document.body.classList.remove('mainmenu-dialog-open');
    void loadGame(continueMode || 'solo');
  };
  overlay.onclick = event => { if (event.target === overlay) close(); };
  dialog.onkeydown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled])')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  dialog.scrollTop = 0;
  closeButton.focus({ preventScroll: true });
}

page.querySelectorAll('[data-menu-action="tour"]').forEach(button => { button.onclick = () => openGuide(); });
page.querySelectorAll('[data-menu-action="solo"]').forEach(button => {
  button.onclick = () => onboardingComplete() ? void loadGame('solo') : openGuide('solo');
});
page.querySelectorAll('[data-menu-action="live"]').forEach(button => { button.onclick = () => void loadGame('online'); });
page.querySelectorAll('[data-menu-action="import"]').forEach(button => {
  button.onclick = async () => {
    await loadGame('import');
    globalThis.MTG?.showDeckImport?.();
  };
});

const liveStatus = page.querySelector('.mainmenu-livecheck');
const localStaticHost = location.protocol === 'file:' || ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
if (localStaticHost) {
  liveStatus.dataset.liveState = 'hosted';
  liveStatus.querySelector('b').textContent = 'Solo mode ready';
  liveStatus.querySelector('small').textContent = 'Live rooms require the hosted build';
} else if (!/(^|\.)vercel\.app$/i.test(location.hostname)) {
  liveStatus.dataset.liveState = 'hosted';
  liveStatus.querySelector('b').textContent = 'Solo mode ready';
  liveStatus.querySelector('small').textContent = 'Live support is checked when a room opens';
} else {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  fetch('./api/ws', { cache: 'no-store', signal: controller.signal })
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
    .finally(() => clearTimeout(timeout));
}

window.render_game_to_text = () => JSON.stringify({
  mode: 'menu',
  deckCount: 27,
  actions: ['Start a solo table', 'Create a Live table', 'Import your decklist here', 'Guide'],
  onboardingOpen: !!page.querySelector('.mainmenu-onboarding'),
  account: globalThis.MTGAccount?.user ? {
    signedIn: true,
    displayName: globalThis.MTGAccount.user.displayName,
    hasSave: !!globalThis.MTGAccount.save,
  } : { signedIn: false, hasSave: false },
});
window.advanceTime = async () => JSON.parse(window.render_game_to_text());

const initialParams = new URLSearchParams(window.location.search);
if (initialParams.get('room') || initialParams.get('onlineSmoke') || initialParams.get('smokeDeck')) {
  void loadGame(null);
}

// A player who left a lost table asked for their profile, so the entry page
// opens it once the session is known and drops the marker from the address.
if (initialParams.get('view') === 'profile') {
  const cleaned = new URLSearchParams(initialParams);
  cleaned.delete('view');
  const query = cleaned.toString();
  history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
  const account = globalThis.MTGAccount;
  if (account) {
    void Promise.resolve(account.whenReady?.())
      .then(() => { if (account.user) account.open('profile'); })
      .catch(() => {});
  }
}
