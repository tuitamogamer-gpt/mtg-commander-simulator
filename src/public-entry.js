// Lightweight public entry. The rules engine and 27 complete deck lists load
// only after a player asks to enter setup or opens a shared game URL.
'use strict';

const root = document.querySelector('#setup');
const page = root && root.querySelector('.mainmenu');

if (!root || !page) throw new Error('Commander Simulator entry shell is missing.');

const detailsMarkup = `
  <section class="mainmenu-proof" aria-label="Product details">
    <div><b>27</b><span>tested preconstructed decks</span></div>
    <div><b>4</b><span>real Commander seats</span></div>
    <div><b>Local</b><span>deterministic AI, no model API</span></div>
    <div class="mainmenu-livecheck" data-live-state="checking"><i></i><span><b>Checking Live rooms</b><small>Solo play is always available</small></span></div>
  </section>

  <section class="mainmenu-path" aria-labelledby="first-pod-title">
    <div class="mainmenu-path-copy">
      <span>YOUR FIRST POD</span>
      <h2 id="first-pod-title">From deck choice to opening hand.</h2>
      <p>The client keeps the table readable while preserving the decisions that make Commander interesting.</p>
      <button type="button" data-menu-action="tour">See the first-game guide</button>
    </div>
    <ol class="mainmenu-path-steps">
      <li><span aria-hidden="true">01</span><div><b>Pick a deck</b><p>Filter by color or playstyle, then open its guide and signature cards.</p></div></li>
      <li><span aria-hidden="true">02</span><div><b>Build the pod</b><p>Choose bot decks, personalities, difficulty, and optional Politics.</p></div></li>
      <li><span aria-hidden="true">03</span><div><b>Play the decisions</b><p>Proceed prompts, priority windows, targets, and combat stay visible.</p></div></li>
    </ol>
  </section>

  <section class="mainmenu-modes" aria-label="Ways to play">
    <article class="mainmenu-mode solo">
      <span aria-hidden="true">01</span>
      <div><small>PLAY AT YOUR PACE</small><h2>Solo Commander</h2><p>Seeded games, adjustable stops, five bot personalities, optional public deals, and a share-safe debug snapshot.</p></div>
      <button type="button" data-menu-action="solo">Choose a solo deck</button>
    </article>
    <article class="mainmenu-mode live">
      <span aria-hidden="true">02</span>
      <div><small>PRIVATE TABLE</small><h2>Commander Live</h2><p>Host a two-player room, send one private link, and let two local AI seats complete the four-player pod.</p></div>
      <button type="button" data-menu-action="live">Configure a Live table</button>
    </article>
  </section>

  <footer class="mainmenu-footer">
    <div><b>COMMANDER SIMULATOR</b><span>Free, browser-based fan project. Card data and images are provided through Scryfall.</span></div>
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
  page.querySelector('.mainmenu-loadveil')?.remove();
  const veil = document.createElement('div');
  veil.className = 'mainmenu-loadveil';
  veil.setAttribute('role', 'status');
  veil.setAttribute('aria-live', 'polite');
  veil.innerHTML = `<div><i aria-hidden="true"></i><span>OPENING THE TABLE</span><h2>${mode === 'online' ? 'Preparing Commander Live.' : 'Loading all 27 decks.'}</h2><p>The complete rules engine stays in this browser. This first load can take a moment.</p></div>`;
  page.appendChild(veil);
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

function openGuide(continueMode = null) {
  page.querySelector('.mainmenu-onboarding')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'mainmenu-onboarding';
  const dialog = document.createElement('article');
  dialog.className = 'mainmenu-onboarding-panel';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'public-guide-title');
  dialog.innerHTML = `
    <button type="button" class="mainmenu-onboarding-close" aria-label="Close first-game guide">×</button>
    <header><span>FIRST GAME GUIDE</span><h2 id="public-guide-title">Four things before you sit down.</h2><p>You can reopen this guide from the main menu at any time.</p></header>
    <div class="mainmenu-onboarding-grid">
      <section><i aria-hidden="true">01</i><div><b>Your deck is complete</b><p>Every listed option is a fixed 100-card deck. Pick by feel first; the deck spotlight explains the plan.</p></div></section>
      <section><i aria-hidden="true">02</i><div><b>You control one seat</b><p>The other seats never expose hidden cards. Local AI makes decisions without an external model or account.</p></div></section>
      <section><i aria-hidden="true">03</i><div><b>HOLD opens priority</b><p>Arm HOLD when you want to respond. The game also stops automatically at the priority windows you choose.</p></div></section>
      <section><i aria-hidden="true">04</i><div><b>Proceed protects clarity</b><p>Important spells, triggers, targets, and combat reviews wait until the table state is clear.</p></div></section>
    </div>
    <footer><button type="button" class="mainmenu-onboarding-later">Close guide</button><button type="button" class="mainmenu-onboarding-start">${continueMode === 'online' ? 'Build a Live table' : 'Choose my first deck'}</button></footer>`;
  overlay.appendChild(dialog);
  page.appendChild(overlay);

  const priorFocus = document.activeElement;
  const close = () => {
    overlay.remove();
    if (priorFocus instanceof HTMLElement) priorFocus.focus();
  };
  const start = dialog.querySelector('.mainmenu-onboarding-start');
  dialog.querySelector('.mainmenu-onboarding-close').onclick = close;
  dialog.querySelector('.mainmenu-onboarding-later').onclick = close;
  start.onclick = () => {
    rememberOnboarding();
    overlay.remove();
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
  start.focus();
}

page.querySelectorAll('[data-menu-action="tour"]').forEach(button => { button.onclick = () => openGuide(); });
page.querySelectorAll('[data-menu-action="solo"]').forEach(button => {
  button.onclick = () => onboardingComplete() ? void loadGame('solo') : openGuide('solo');
});
page.querySelectorAll('[data-menu-action="live"]').forEach(button => { button.onclick = () => void loadGame('online'); });

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
  actions: ['Play solo', 'Play with a friend', 'How to play'],
  onboardingOpen: !!page.querySelector('.mainmenu-onboarding'),
});
window.advanceTime = async () => JSON.parse(window.render_game_to_text());

const initialParams = new URLSearchParams(window.location.search);
if (initialParams.get('room') || initialParams.get('onlineSmoke') || initialParams.get('smokeDeck')) {
  void loadGame(null);
}
