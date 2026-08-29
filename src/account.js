'use strict';

const state = {
  loading: true,
  available: true,
  user: null,
  profile: null,
  save: null,
  error: '',
};

let gameLoader = null;
let saveChain = Promise.resolve();
const listeners = new Set();
const smokeMode = new URLSearchParams(location.search).get('accountSmoke');
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const formatDate = value => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date) : '';
};

function emit() {
  renderEntry();
  for (const listener of listeners) listener({ ...state });
  window.dispatchEvent(new CustomEvent('mtg:account-change', { detail: { user: state.user, profile: state.profile, save: state.save } }));
}

async function request(action, payload = null) {
  const options = { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };
  let url = `./api/account?action=${encodeURIComponent(action)}`;
  if (payload !== null) {
    options.method = 'POST';
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify({ action, ...payload });
    url = './api/account';
  }
  const response = await fetch(url, options);
  let result;
  try { result = await response.json(); }
  catch { throw new Error('The account service returned an unreadable response.'); }
  if (!response.ok || !result.ok) throw new Error(result.error || 'The account request failed.');
  return result;
}

function smokeSnapshot() {
  return {
    user: { id: 'smoke-user', displayName: 'Boro', email: 'boro@example.com', createdAt: '2026-08-29T08:00:00.000Z' },
    profile: {
      gamesPlayed: 18, wins: 7, losses: 11, lifetimeScore: 975, winRate: 39,
      favoriteCommanders: [{ name: 'Zimone, Infinite Analyst', games: 6 }, { name: 'Galadriel, Elven-Queen', games: 4 }, { name: 'Doctor Doom, King of Latveria', games: 3 }],
      favoriteDecks: ['Quandrix Unlimited', 'Elven Council', 'Doom Prevails'],
      recentMatches: [
        { deck: 'Quandrix Unlimited', commanders: ['Zimone, Infinite Analyst'], won: true, score: 100, turns: 14, completedAt: '2026-08-29T08:00:00.000Z' },
        { deck: 'Elven Council', commanders: ['Galadriel, Elven-Queen'], won: false, score: 25, turns: 12, completedAt: '2026-08-28T08:00:00.000Z' },
      ],
    },
    save: {
      schema: 'commander-save/v1', matchId: 'account-smoke-save-0001', updatedAt: '2026-08-29T09:00:00.000Z',
      mode: 'solo', createdAt: '2026-08-29T08:59:00.000Z',
      setup: {
        deck: 'Quandrix Unlimited', commanders: ['Zimone, Infinite Analyst'], ai: 3,
        aiDecks: ['Elven Council', 'Doom Prevails', 'Quick Draw'], aiStyles: ['balanced', 'balanced', 'balanced'],
        aiRandomCommanders: false, sumPartnerDamage: false, diplomacyEnabled: false, difficulty: 'normal', manaMode: 'auto', prioMode: 'end', seed: '290829',
      },
      decisions: [{ shape: { type: 'mulligan', prompt: 'Opening hand' }, response: { kind: 'boolean', value: false } }],
      summary: { deck: 'Quandrix Unlimited', commanders: ['Zimone, Infinite Analyst'], turn: 1, decisionCount: 1 },
    },
  };
}

async function refresh() {
  state.loading = true;
  renderEntry();
  try {
    const result = smokeMode === 'profile'
      ? smokeSnapshot()
      : smokeMode === 'guest' ? { user: null, profile: null, save: null } : await request('session');
    state.user = result.user;
    state.profile = result.profile;
    state.save = result.save;
    state.available = true;
    state.error = '';
    if (state.user) void syncLocalFavorites();
  } catch (error) {
    state.available = false;
    state.error = error.message;
  } finally {
    state.loading = false;
    emit();
  }
}

function closeModal() {
  document.querySelector('.account-overlay')?.remove();
  document.body.classList.remove('account-dialog-open');
}

function modalShell(view) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'account-overlay';
  overlay.innerHTML = '<section class="account-panel" role="dialog" aria-modal="true" aria-labelledby="account-title" tabindex="-1"><button type="button" class="account-close" aria-label="Close account panel">×</button><div class="account-content"></div></section>';
  document.body.appendChild(overlay);
  document.body.classList.add('account-dialog-open');
  const panel = overlay.querySelector('.account-panel');
  const close = overlay.querySelector('.account-close');
  const prior = document.activeElement;
  const dismiss = () => {
    closeModal();
    if (prior instanceof HTMLElement) prior.focus({ preventScroll: true });
  };
  close.onclick = dismiss;
  overlay.onclick = event => { if (event.target === overlay) dismiss(); };
  panel.onkeydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); dismiss(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button:not([disabled]), input:not([disabled])')];
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
  };
  renderModal(view, overlay.querySelector('.account-content'));
  panel.focus({ preventScroll: true });
  return overlay;
}

function authMarkup(mode) {
  const registering = mode === 'register';
  return `
    <header class="account-auth-head"><span>COMMANDER PROFILE</span><h2 id="account-title">${registering ? 'Create your account.' : 'Welcome back.'}</h2><p>${registering ? 'Keep one Solo game in progress and build lifetime Commander stats.' : 'Continue your saved table and see every match add up.'}</p></header>
    <form class="account-form" data-auth-mode="${mode}">
      ${registering ? '<label>Display name<input name="displayName" minlength="2" maxlength="32" autocomplete="nickname" required></label>' : ''}
      <label>Email<input name="email" type="email" maxlength="254" autocomplete="email" required></label>
      <label>Password<input name="password" type="password" minlength="8" maxlength="128" autocomplete="${registering ? 'new-password' : 'current-password'}" required></label>
      <p class="account-form-error" role="alert"></p>
      <button type="submit" class="account-primary">${registering ? 'Create account' : 'Sign in'}</button>
    </form>
    <button type="button" class="account-switch">${registering ? 'Already have an account? Sign in' : 'New to Commander Simulator? Create account'}</button>
    <small class="account-privacy">Your password is salted and hashed. Sessions use a secure HttpOnly cookie; saved games stay private to your account.</small>`;
}

function profileMarkup() {
  const profile = state.profile || { gamesPlayed: 0, wins: 0, losses: 0, lifetimeScore: 0, winRate: 0, favoriteCommanders: [], favoriteDecks: [], recentMatches: [] };
  const save = state.save;
  const commanders = profile.favoriteCommanders || [];
  const recent = profile.recentMatches || [];
  return `
    <header class="account-profile-head">
      <div class="account-avatar" aria-hidden="true">${esc(state.user.displayName.slice(0, 1).toUpperCase())}</div>
      <div><span>COMMANDER PROFILE</span><h2 id="account-title">${esc(state.user.displayName)}</h2><p>${esc(state.user.email)} · Player since ${esc(formatDate(state.user.createdAt))}</p></div>
    </header>
    ${save ? `<section class="account-continue-card"><div><small>ACTIVE SOLO SAVE · TURN ${Number(save.summary?.turn) || 0}</small><h3>${esc(save.summary?.deck || 'Saved Commander game')}</h3><p>${esc((save.summary?.commanders || []).join(' + '))} · ${Number(save.summary?.decisionCount) || 0} recorded actions replayed privately</p><span>Autosaved ${esc(formatDate(save.updatedAt))}</span></div><div><button type="button" class="account-primary account-continue">Continue game</button><button type="button" class="account-clear-save">Delete save</button></div></section>` : '<section class="account-empty-save"><small>SAVE & CONTINUE</small><h3>No Solo game in progress.</h3><p>Start a Solo table while signed in. Every completed decision or manual table correction creates a private cloud checkpoint.</p></section>'}
    <section class="account-stats" aria-label="Lifetime Commander statistics">
      <article><small>LIFETIME SCORE</small><strong>${Number(profile.lifetimeScore) || 0}</strong><span>100 per win · 25 per completed loss</span></article>
      <article><small>MATCHES</small><strong>${Number(profile.gamesPlayed) || 0}</strong><span>${Number(profile.wins) || 0} wins · ${Number(profile.losses) || 0} losses</span></article>
      <article><small>WIN RATE</small><strong>${Number(profile.winRate) || 0}%</strong><span>Across completed Solo games</span></article>
    </section>
    <section class="account-section"><header><div><small>FAVOURITE COMMANDERS</small><h3>Your most-played leaders</h3></div><span>Based on completed games</span></header><div class="account-commanders">${commanders.length ? commanders.map((entry, index) => `<article data-commander="${esc(entry.name)}"><i>${String(index + 1).padStart(2, '0')}</i><div><b>${esc(entry.name)}</b><span>${Number(entry.games) || 0} game${Number(entry.games) === 1 ? '' : 's'}</span></div></article>`).join('') : '<p>Complete a game to begin your commander history.</p>'}</div></section>
    <section class="account-section"><header><div><small>FAVOURITE DECKS</small><h3>Saved from Deck Explorer</h3></div></header><div class="account-deck-tags">${(profile.favoriteDecks || []).length ? profile.favoriteDecks.map(name => `<span>${esc(name)}</span>`).join('') : '<p>Star decks in Deck Explorer to sync them here.</p>'}</div></section>
    <section class="account-section account-history"><header><div><small>RECENT MATCHES</small><h3>Your last results</h3></div></header>${recent.length ? `<ol>${recent.map(match => `<li><i class="${match.won ? 'win' : ''}">${match.won ? 'W' : 'L'}</i><span><b>${esc(match.deck)}</b><small>${esc((match.commanders || []).join(' + '))} · ${Number(match.turns) || 0} turns</small></span><strong>+${Number(match.score) || 0}</strong></li>`).join('')}</ol>` : '<p>No completed matches yet.</p>'}</section>
    <footer class="account-profile-actions"><button type="button" class="account-logout">Sign out</button></footer>`;
}

function renderModal(view, content) {
  if (!content) return;
  if (view === 'profile' && state.user) content.innerHTML = profileMarkup();
  else if (!state.available && !smokeMode) content.innerHTML = `<header class="account-auth-head"><span>COMMANDER PROFILE</span><h2 id="account-title">Profiles need the hosted build.</h2><p>Solo play remains available locally. The account service could not be reached from this copy.</p></header><p class="account-service-error">${esc(state.error)}</p>`;
  else content.innerHTML = authMarkup(view === 'register' ? 'register' : 'login');

  const form = content.querySelector('.account-form');
  if (form) form.onsubmit = async event => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    const error = form.querySelector('.account-form-error');
    submit.disabled = true; submit.textContent = 'Working…'; error.textContent = '';
    try {
      const data = new FormData(form);
      const result = await request(form.dataset.authMode, Object.fromEntries(data.entries()));
      state.user = result.user; state.profile = result.profile; state.save = result.save; state.available = true;
      emit();
      renderModal('profile', content);
      void syncLocalFavorites();
    } catch (problem) {
      error.textContent = problem.message;
      submit.disabled = false;
      submit.textContent = form.dataset.authMode === 'register' ? 'Create account' : 'Sign in';
    }
  };
  const switcher = content.querySelector('.account-switch');
  if (switcher) switcher.onclick = () => renderModal(view === 'register' ? 'login' : 'register', content);
  const continueButton = content.querySelector('.account-continue');
  if (continueButton) continueButton.onclick = () => {
    if (!gameLoader || !state.save?.setup) return;
    continueButton.disabled = true; continueButton.textContent = 'Restoring table…';
    closeModal();
    void gameLoader(state.save);
  };
  const clear = content.querySelector('.account-clear-save');
  if (clear) clear.onclick = async () => {
    if (!confirm('Delete this saved Solo game? This cannot be undone.')) return;
    clear.disabled = true;
    try { await request('clearSave', {}); state.save = null; emit(); renderModal('profile', content); }
    catch (error) { clear.disabled = false; clear.textContent = error.message; }
  };
  const logout = content.querySelector('.account-logout');
  if (logout) logout.onclick = async () => {
    logout.disabled = true;
    try { await request('logout', {}); } catch {}
    state.user = null; state.profile = null; state.save = null; emit(); renderModal('login', content);
  };
}

function renderEntry() {
  const tools = document.querySelector('#setup[data-app-view="home"] .mainmenu-navtools');
  if (tools) {
    let button = tools.querySelector('.mainmenu-account');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button'; button.className = 'mainmenu-account';
      tools.appendChild(button);
    }
    button.disabled = state.loading;
    button.innerHTML = state.loading ? '<i></i><span>Profile</span>' : state.user
      ? `<i>${esc(state.user.displayName.slice(0, 1).toUpperCase())}</i><span>${esc(state.user.displayName)}</span>`
      : '<i>♙</i><span>Sign in</span>';
    button.onclick = () => modalShell(state.user ? 'profile' : 'login');
  }
  document.querySelector('.mainmenu-account-return')?.remove();
  const actions = document.querySelector('#setup[data-app-view="home"] #primary-actions');
  if (actions && state.user && state.save) {
    const card = document.createElement('button');
    card.type = 'button'; card.className = 'mainmenu-account-return';
    card.innerHTML = `<i>↻</i><span><b>Continue ${esc(state.save.summary?.deck || 'saved game')}</b><small>Turn ${Number(state.save.summary?.turn) || 0} · ${esc((state.save.summary?.commanders || []).join(' + '))}</small></span>`;
    card.onclick = () => modalShell('profile');
    actions.prepend(card);
  }
}

async function syncLocalFavorites() {
  if (!state.user || smokeMode === 'profile') return;
  let decks = [];
  try {
    const parsed = JSON.parse(localStorage.getItem('mtgDeckFavorites') || '[]');
    if (Array.isArray(parsed)) decks = parsed;
  } catch {}
  try {
    const result = await request('favorites', { decks });
    state.profile = result.profile;
    emit();
  } catch {}
}

const api = {
  get user() { return state.user; },
  get profile() { return state.profile; },
  get save() { return state.save; },
  open(view = state.user ? 'profile' : 'login') { return modalShell(view); },
  render() { renderEntry(); },
  setGameLoader(loader) { gameLoader = loader; renderEntry(); },
  onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  async saveGame(save) {
    if (!state.user) return false;
    if (smokeMode === 'profile') {
      state.save = { ...save, updatedAt: new Date().toISOString() };
      emit();
      return true;
    }
    saveChain = saveChain.catch(() => {}).then(async () => {
      const result = await request('save', { save });
      state.save = result.save;
      emit();
      return true;
    });
    return saveChain;
  },
  async clearSave() {
    if (!state.user) return false;
    if (smokeMode === 'profile') { state.save = null; emit(); return true; }
    await request('clearSave', {}); state.save = null; emit(); return true;
  },
  async completeMatch(match) {
    if (!state.user) return false;
    if (smokeMode === 'profile') {
      state.profile = { ...state.profile, gamesPlayed: state.profile.gamesPlayed + 1, wins: state.profile.wins + (match.won ? 1 : 0), losses: state.profile.losses + (match.won ? 0 : 1), lifetimeScore: state.profile.lifetimeScore + (match.won ? 100 : 25) };
      state.save = null; emit(); return true;
    }
    const result = await request('completeMatch', match);
    state.profile = result.profile; state.save = result.save; emit();
    return result.recorded;
  },
  syncLocalFavorites,
  refresh,
};

globalThis.MTGAccount = api;
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => void refresh(), { once: true });
else void refresh();
