'use strict';

const state = {
  loading: true,
  available: true,
  user: null,
  profile: null,
  save: null,
  saveError: '',
  decks: [],
  error: '',
};

let gameLoader = null;
let saveChain = Promise.resolve();
let deckChain = Promise.resolve();
let favoriteChain = Promise.resolve();
let pendingFavoriteWrite = null;
let favoriteMutationGeneration = 0;
let sessionRequestGeneration = 0;
let identityGeneration = 0;
let saveMutationGeneration = 0;
let profileMutationGeneration = 0;
let settleInitialReady;
let initialReadySettled = false;
const initialReady = new Promise(resolve => { settleInitialReady = resolve; });
const listeners = new Set();
const smokeMode = new URLSearchParams(location.search).get('accountSmoke');
const ACCOUNT_SYNC_KEY = 'mtg-account-session-sync/v1';
const LOCAL_RECOVERY_PREFIX = 'mtg-solo-recovery/v1/';
const MAX_LOCAL_SAVE_BYTES = 1_750_000;
let localRecoveryError = '';
let localRecoveryRevision = 0;
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const formatDate = value => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date) : '';
};

function emit() {
  renderEntry();
  for (const listener of listeners) listener({ ...state });
  window.dispatchEvent(new CustomEvent('mtg:account-change', { detail: { user: state.user, profile: state.profile, save: state.save, decks: state.decks } }));
}

function sortDecks(decks) {
  return [...decks].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || String(a.name || '').localeCompare(String(b.name || '')));
}

function finishInitialReady() {
  if (initialReadySettled) return;
  initialReadySettled = true;
  settleInitialReady();
}

function queueDeckOperation(operation) {
  deckChain = deckChain.catch(() => {}).then(operation);
  return deckChain;
}

function recoveryOwner(allowLoading = false) {
  if (state.loading && (!allowLoading || !state.user)) return null;
  return state.user?.id || 'guest';
}

function recoveryKey(ownerId) {
  return LOCAL_RECOVERY_PREFIX + encodeURIComponent(ownerId);
}

function utf8Bytes(value) {
  return typeof TextEncoder === 'function' ? new TextEncoder().encode(value).byteLength
    : encodeURIComponent(value).replace(/%[\dA-F]{2}/g, '_').length;
}

function recoverySave(value) {
  const valid = save => save && typeof save === 'object' && !Array.isArray(save) &&
    save.schema === 'commander-save/v1' && save.mode === 'solo' && save.setup &&
    typeof save.setup === 'object' && !Array.isArray(save.setup) && typeof save.matchId === 'string' &&
    /^[a-zA-Z0-9-]{16,80}$/.test(save.matchId) && Array.isArray(save.decisions) && save.decisions.length <= 5000;
  if (!valid(value)) throw new Error('This game cannot be stored for device recovery.');
  const wire = JSON.stringify(value);
  if (utf8Bytes(wire) > MAX_LOCAL_SAVE_BYTES) throw new Error('This game is too large for device recovery.');
  const save = JSON.parse(wire);
  if (!valid(save)) throw new Error('This game cannot be stored for device recovery.');
  return save;
}

function readLocalRecovery(ownerId) {
  try {
    const raw = localStorage.getItem(recoveryKey(ownerId));
    if (raw === null) return null;
    if (utf8Bytes(raw) > MAX_LOCAL_SAVE_BYTES + 16_000) throw new Error();
    const record = JSON.parse(raw);
    if (!record || record.version !== 1 || record.ownerId !== ownerId ||
      typeof record.revision !== 'string' || !record.revision || record.revision.length > 128) throw new Error();
    return { ownerId, revision: record.revision, save: recoverySave(record.save) };
  } catch {
    throw new Error('The recovery on this device could not be read.');
  }
}

function clearLocalRecoveryRecord(ownerId, condition = {}) {
  try {
    if (!condition || typeof condition !== 'object' || Array.isArray(condition))
      return { cleared: false, error: 'A matching device checkpoint is required.' };
    const { matchId, revision } = condition;
    if (typeof matchId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(matchId))
      return { cleared: false, error: 'A matching device checkpoint is required.' };
    const record = readLocalRecovery(ownerId);
    if (!record || record.save.matchId !== matchId || revision !== undefined && record.revision !== revision)
      return { cleared: false, error: '' };
    localStorage.removeItem(recoveryKey(ownerId));
    return { cleared: true, error: '' };
  } catch {
    return { cleared: false, error: 'The recovery on this device could not be removed.' };
  }
}

function applySessionSnapshot(result) {
  const previousOwner = state.user?.id || null;
  const nextOwner = result.user?.id || null;
  if (previousOwner !== nextOwner) {
    identityGeneration += 1;
    state.decks = [];
    localRecoveryError = '';
  }
  const active = globalThis.MTG?.activeAccountMatch;
  if (!previousOwner && nextOwner && initialReadySettled && active?.setup &&
    typeof globalThis.MTG?.captureActiveSoloSave === 'function') {
    const cleared = clearLocalRecoveryRecord('guest', { matchId: active.matchId });
    if (cleared.error) localRecoveryError = cleared.error;
  }
  state.user = result.user || null;
  state.profile = result.profile || null;
  state.save = result.save || null;
  state.saveError = '';
  if (state.user && Array.isArray(state.profile?.favoriteDecks)) {
    try { localStorage.setItem('mtgDeckFavorites', JSON.stringify(state.profile.favoriteDecks)); } catch {}
  }
}

async function request(action, payload = null, query = null) {
  if (document.querySelector('meta[name="mtg-build"]')?.content === 'ios-offline') {
    throw new Error('Accounts and cloud saves are available from Play online on the iOS app home screen.');
  }
  const options = { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };
  const params = new URLSearchParams({ action });
  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
  }
  let url = `./api/account?${params.toString()}`;
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
  if (!response.ok || !result.ok) {
    const error = new Error(result.error || 'The account request failed.');
    error.status = response.status;
    error.code = result.code || '';
    error.ownerId = result.ownerId || null;
    throw error;
  }
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
  const generation = ++sessionRequestGeneration;
  const saveGeneration = saveMutationGeneration;
  const profileGeneration = profileMutationGeneration;
  const favoriteGeneration = favoriteMutationGeneration;
  state.loading = true;
  emit();
  try {
    const result = smokeMode === 'profile'
      ? smokeSnapshot()
      : smokeMode === 'guest' ? { user: null, profile: null, save: null } : await request('session');
    if (generation !== sessionRequestGeneration) return false;
    const sameOwner = !!state.user && state.user.id === result.user?.id;
    let profile = sameOwner && profileGeneration !== profileMutationGeneration ? state.profile : result.profile;
    const pendingFavorites = sameOwner && pendingFavoriteWrite?.ownerId === result.user?.id ? pendingFavoriteWrite : null;
    if (sameOwner && profile && (pendingFavorites || favoriteGeneration !== favoriteMutationGeneration))
      profile = { ...profile, favoriteDecks: pendingFavorites?.decks || state.profile?.favoriteDecks || [] };
    applySessionSnapshot({
      ...result,
      ...(sameOwner && saveGeneration !== saveMutationGeneration ? { save: state.save } : {}),
      profile,
    });
    state.available = true;
    state.error = '';
  } catch (error) {
    if (generation !== sessionRequestGeneration) return false;
    state.available = false;
    state.error = error.message;
  } finally {
    if (generation === sessionRequestGeneration) {
      state.loading = false;
      emit();
    }
    finishInitialReady();
  }
  return true;
}

let sessionSyncTimer = null;
let sessionChannel = null;

function scheduleSessionRefresh() {
  clearTimeout(sessionSyncTimer);
  sessionSyncTimer = setTimeout(() => { void refresh(); }, 40);
}

function announceSessionChange() {
  try { sessionChannel?.postMessage({ type: 'session-change' }); } catch {}
  try { localStorage.setItem(ACCOUNT_SYNC_KEY, `${Date.now()}:${Math.random()}`); } catch {}
}

try {
  if (typeof BroadcastChannel === 'function') {
    sessionChannel = new BroadcastChannel('mtg-account-session/v1');
    sessionChannel.onmessage = event => {
      if (event.data?.type === 'session-change') scheduleSessionRefresh();
    };
  }
} catch {}

window.addEventListener('storage', event => {
  if (event.key === ACCOUNT_SYNC_KEY) scheduleSessionRefresh();
});

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
    ${state.error ? `<p class="account-service-error" role="alert">${esc(state.error)}</p>` : ''}
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
    ${save ? `<section class="account-continue-card"><div><small>ACTIVE SOLO SAVE · TURN ${Number(save.summary?.turn) || 0}</small><h3>${esc(save.summary?.deck || 'Saved Commander game')}</h3><p>${esc((save.summary?.commanders || []).join(' + '))} · ${Number(save.summary?.decisionCount) || 0} recorded actions replayed privately</p><span>Autosaved ${esc(formatDate(save.updatedAt))}</span>${state.saveError ? `<p class="account-service-error" role="alert">${esc(state.saveError)} Delete this old checkpoint to remove it safely.</p>` : ''}</div><div><button type="button" class="account-primary account-continue" ${state.saveError ? 'disabled' : ''}>${state.saveError ? 'Cannot continue' : 'Continue game'}</button><button type="button" class="account-clear-save">Delete save</button></div></section>` : '<section class="account-empty-save"><small>SAVE & CONTINUE</small><h3>No Solo game in progress.</h3><p>Start a Solo table while signed in. Every completed decision or manual table correction creates a private cloud checkpoint.</p></section>'}
    <section class="account-stats" aria-label="Lifetime Commander statistics">
      <article><small>LIFETIME SCORE</small><strong>${Number(profile.lifetimeScore) || 0}</strong><span>100 per win · 25 per completed loss</span></article>
      <article><small>MATCHES</small><strong>${Number(profile.gamesPlayed) || 0}</strong><span>${Number(profile.wins) || 0} wins · ${Number(profile.losses) || 0} losses</span></article>
      <article><small>WIN RATE</small><strong>${Number(profile.winRate) || 0}%</strong><span>Across completed Solo games</span></article>
    </section>
    <section class="account-section"><header><div><small>FAVOURITE COMMANDERS</small><h3>Your most-played leaders</h3></div><span>Based on completed games</span></header><div class="account-commanders">${commanders.length ? commanders.map((entry, index) => `<article data-commander="${esc(entry.name)}"><i>${String(index + 1).padStart(2, '0')}</i><div><b>${esc(entry.name)}</b><span>${Number(entry.games) || 0} game${Number(entry.games) === 1 ? '' : 's'}</span></div></article>`).join('') : '<p>Complete a game to begin your commander history.</p>'}</div></section>
    <section class="account-section"><header><div><small>FAVOURITE DECKS</small><h3>Saved from Deck Explorer</h3></div></header><div class="account-deck-tags">${(profile.favoriteDecks || []).length ? profile.favoriteDecks.map(name => `<span>${esc(name)}</span>`).join('') : '<p>Star decks in Deck Explorer to sync them here.</p>'}</div></section>
    <section class="account-section account-history"><header><div><small>RECENT MATCHES</small><h3>Your last results</h3></div></header>${recent.length ? `<ol>${recent.map(match => `<li><i class="${match.won ? 'win' : ''}">${match.won ? 'W' : 'L'}</i><span><b>${esc(match.deck)}</b><small>${esc((match.commanders || []).join(' + '))} · ${Number(match.turns) || 0} turns</small></span><strong>+${Number(match.score) || 0}</strong></li>`).join('')}</ol>` : '<p>No completed matches yet.</p>'}</section>
    <footer class="account-profile-actions"><button type="button" class="account-logout">Sign out</button><p class="account-form-error account-logout-error" role="alert">${esc(state.error)}</p></footer>`;
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
      sessionRequestGeneration += 1;
      applySessionSnapshot(result);
      state.loading = false;
      state.available = true;
      state.error = '';
      finishInitialReady();
      emit();
      renderModal('profile', content);
      announceSessionChange();
    } catch (problem) {
      error.textContent = problem.message;
      submit.disabled = false;
      submit.textContent = form.dataset.authMode === 'register' ? 'Create account' : 'Sign in';
    }
  };
  const switcher = content.querySelector('.account-switch');
  if (switcher) switcher.onclick = () => renderModal(view === 'register' ? 'login' : 'register', content);
  const continueButton = content.querySelector('.account-continue');
  const continueSave = state.save;
  const continueOwnerId = state.user?.id;
  const continueOwnerGeneration = identityGeneration;
  const sameContinue = () => state.user?.id === continueOwnerId && identityGeneration === continueOwnerGeneration &&
    state.save?.matchId === continueSave?.matchId;
  if (continueButton) continueButton.onclick = async () => {
    if (!gameLoader || !continueSave?.setup) return;
    continueButton.disabled = true; continueButton.textContent = 'Restoring table…';
    closeModal();
    try {
      await gameLoader(continueSave, { expectedOwnerId: continueOwnerId });
      if (sameContinue()) state.saveError = '';
    } catch (error) {
      if (sameContinue()) state.saveError = error && error.message || 'This saved game can no longer be restored.';
      emit();
      modalShell('profile');
    }
  };
  const clear = content.querySelector('.account-clear-save');
  if (clear) clear.onclick = async () => {
    if (!confirm('Delete this saved Solo game? This cannot be undone.')) return;
    clear.disabled = true;
    try { await api.clearSave(state.user?.id); renderModal('profile', content); }
    catch (error) {
      if (!state.user) renderModal('login', content);
      else { clear.disabled = false; clear.textContent = error.message; }
    }
  };
  const logout = content.querySelector('.account-logout');
  if (logout) logout.onclick = async () => {
    const errorNode = content.querySelector('.account-logout-error');
    logout.disabled = true;
    if (errorNode) errorNode.textContent = '';
    try {
      const result = await api.logout();
      renderModal('login', content);
      if (result.warning) {
        const warning = content.querySelector('.account-service-error');
        if (warning) warning.textContent = result.warning;
      }
    } catch (error) {
      state.error = error.message;
      logout.disabled = false;
      if (errorNode) errorNode.textContent = error.message;
    }
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
  document.querySelector('.mainmenu-account-return:not(.mainmenu-device-return)')?.remove();
  document.querySelector('.mainmenu-device-return')?.remove();
  document.querySelector('.mainmenu-device-recovery-error')?.remove();
  const actions = document.querySelector('#setup[data-app-view="home"] #primary-actions');
  if (actions && state.user && state.save) {
    const card = document.createElement('button');
    card.type = 'button'; card.className = 'mainmenu-account-return';
    card.innerHTML = `<i>↻</i><span><b>Continue ${esc(state.save.summary?.deck || 'saved game')}</b><small>Turn ${Number(state.save.summary?.turn) || 0} · ${esc((state.save.summary?.commanders || []).join(' + '))}</small></span>`;
    card.onclick = () => modalShell('profile');
    actions.prepend(card);
  }
  if (actions && !state.loading) {
    let recovery;
    try { recovery = api.getLocalRecovery(); }
    catch (error) { localRecoveryError = error.message; }
    if (recovery) {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'mainmenu-account-return mainmenu-device-return';
      card.innerHTML = '<i>↻</i><span><b>Continue on this device</b><small>A checkpoint kept in this browser</small></span>';
      card.onclick = async () => {
        card.disabled = true;
        try { await api.resumeLocalRecovery(recovery.ownerId, { matchId: recovery.save.matchId, revision: recovery.revision }); }
        catch (error) { localRecoveryError = error.message; renderEntry(); }
      };
      actions.prepend(card);
    }
    if (localRecoveryError) {
      const hint = document.createElement('p');
      hint.className = 'mainmenu-device-recovery-error';
      hint.setAttribute('role', 'alert');
      hint.textContent = localRecoveryError;
      actions.prepend(hint);
    }
  }
}

async function syncLocalFavorites() {
  if (!state.user || smokeMode === 'profile') return;
  const ownerId = state.user.id;
  const ownerGeneration = identityGeneration;
  const profileGeneration = profileMutationGeneration;
  const sessionGeneration = sessionRequestGeneration;
  let decks = [];
  try {
    const parsed = JSON.parse(localStorage.getItem('mtgDeckFavorites') || '[]');
    if (Array.isArray(parsed)) decks = parsed;
  } catch {}
  const write = { ownerId, decks };
  pendingFavoriteWrite = write;
  favoriteChain = favoriteChain.catch(() => {}).then(async () => {
    try {
      if (state.user?.id !== ownerId || identityGeneration !== ownerGeneration) return;
      const result = await request('favorites', { decks, expectedOwnerId: ownerId });
      if (state.user?.id !== ownerId || identityGeneration !== ownerGeneration) return;
      if (result.ownerId !== ownerId) await recoverAccountOwnerMismatch();
      if (pendingFavoriteWrite !== write) return;
      state.profile = sessionGeneration === sessionRequestGeneration && profileGeneration === profileMutationGeneration
        ? result.profile : { ...state.profile, favoriteDecks: result.profile.favoriteDecks };
      favoriteMutationGeneration += 1;
      try { localStorage.setItem('mtgDeckFavorites', JSON.stringify(result.profile.favoriteDecks)); } catch {}
      emit();
    } catch (error) {
      if (accountOwnerChanged(error) && state.user?.id === ownerId && identityGeneration === ownerGeneration) {
        try { await recoverAccountOwnerMismatch(); } catch {}
      }
    } finally {
      if (pendingFavoriteWrite === write) pendingFavoriteWrite = null;
    }
  });
  return favoriteChain;
}

function accountOwnerChanged(error) {
  return error?.status === 401
    || error?.code === 'ACCOUNT_OWNER_MISMATCH'
    || /account\s+(?:owner\s+)?changed|session\s+changed|owner mismatch/i.test(error?.message || '');
}

async function recoverAccountOwnerMismatch(message = 'Your account changed while profile data was updating. Please try again.') {
  sessionRequestGeneration += 1;
  identityGeneration += 1;
  state.loading = true;
  state.user = null;
  state.profile = null;
  state.save = null;
  state.saveError = '';
  state.decks = [];
  state.error = '';
  emit();
  await refresh();
  const error = new Error(message);
  error.code = 'ACCOUNT_OWNER_MISMATCH';
  throw error;
}

function applySignedOutState(warning = '') {
  sessionRequestGeneration += 1;
  applySessionSnapshot({ user: null, profile: null, save: null });
  state.loading = false;
  state.available = true;
  state.error = warning;
  emit();
  announceSessionChange();
}

async function runOwnedProfileOperation(expectedOwnerId, operation, commit) {
  await initialReady;
  const ownerGeneration = identityGeneration;
  if (!expectedOwnerId || state.user?.id !== expectedOwnerId) {
    return recoverAccountOwnerMismatch();
  }
  try {
    const result = await operation(expectedOwnerId);
    if (result?.ownerId !== expectedOwnerId || state.user?.id !== expectedOwnerId || identityGeneration !== ownerGeneration) {
      return recoverAccountOwnerMismatch();
    }
    if (Object.hasOwn(result, 'save')) saveMutationGeneration += 1;
    if (Object.hasOwn(result, 'profile')) profileMutationGeneration += 1;
    return commit(result, expectedOwnerId);
  } catch (error) {
    if (accountOwnerChanged(error) || state.user?.id !== expectedOwnerId || identityGeneration !== ownerGeneration) {
      return recoverAccountOwnerMismatch();
    }
    throw error;
  }
}

async function runOwnedDeckOperation(operation, commit) {
  await initialReady;
  const ownerId = state.user?.id || null;
  const ownerGeneration = identityGeneration;
  if (!ownerId) return null;
  return queueDeckOperation(async () => {
    if (state.user?.id !== ownerId || identityGeneration !== ownerGeneration) return recoverAccountOwnerMismatch('Your account changed while My Library was updating. Please try again.');
    try {
      const result = await operation(ownerId);
      if (result?.ownerId !== ownerId || state.user?.id !== ownerId || identityGeneration !== ownerGeneration) {
        return recoverAccountOwnerMismatch('Your account changed while My Library was updating. Please try again.');
      }
      return commit(result, ownerId);
    } catch (error) {
      if (accountOwnerChanged(error) || state.user?.id !== ownerId || identityGeneration !== ownerGeneration) {
        return recoverAccountOwnerMismatch('Your account changed while My Library was updating. Please try again.');
      }
      throw error;
    }
  });
}

const api = {
  get loading() { return state.loading; },
  get user() { return state.user; },
  get profile() { return state.profile; },
  get save() { return state.save; },
  get decks() { return state.decks; },
  whenReady() { return initialReady; },
  open(view = state.user ? 'profile' : 'login') { return modalShell(view); },
  render() { renderEntry(); },
  setGameLoader(loader) { gameLoader = loader; renderEntry(); },
  onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  saveLocalRecovery(save, ownerId) {
    if (!ownerId || ownerId !== recoveryOwner(true))
      return { saved: false, revision: null, error: 'The player identity changed. Device recovery was not saved.' };
    try {
      const checkpoint = recoverySave(save);
      const revision = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${++localRecoveryRevision}`;
      localStorage.setItem(recoveryKey(ownerId), JSON.stringify({ version: 1, ownerId, revision, save: checkpoint }));
      localRecoveryError = '';
      renderEntry();
      return { saved: true, revision, error: '' };
    } catch {
      return { saved: false, revision: null, error: 'Device recovery could not be saved in this browser.' };
    }
  },
  getLocalRecovery() {
    const ownerId = recoveryOwner();
    return ownerId ? readLocalRecovery(ownerId) : null;
  },
  clearLocalRecovery(ownerId, condition = {}) {
    const currentOwner = recoveryOwner(true) || (!state.user && initialReadySettled ? 'guest' : null);
    if (!ownerId || ownerId !== currentOwner)
      return { cleared: false, error: 'The player identity changed. Device recovery was not removed.' };
    const result = clearLocalRecoveryRecord(ownerId, condition);
    if (result.cleared) { localRecoveryError = ''; renderEntry(); }
    return result;
  },
  async resumeLocalRecovery(expectedOwnerId = null, condition = {}) {
    if (!condition || typeof condition !== 'object' || Array.isArray(condition))
      throw new Error('The device checkpoint could not be selected. Please try again.');
    const { matchId, revision } = condition;
    if (expectedOwnerId !== null && expectedOwnerId !== recoveryOwner())
      throw new Error('The player identity changed. Reload this page and try again.');
    const recovery = api.getLocalRecovery();
    if (!recovery) throw new Error('No device recovery is available for this player.');
    if (matchId !== undefined && recovery.save.matchId !== matchId || revision !== undefined && recovery.revision !== revision)
      throw new Error('The device checkpoint changed. Choose Continue on this device again.');
    if (!gameLoader) throw new Error('The game module is not ready. Please try again.');
    try {
      const result = await gameLoader(recovery.save, { expectedOwnerId: recovery.ownerId, localRecovery: true,
        matchId: recovery.save.matchId, revision: recovery.revision });
      if (result === false) throw new Error();
      localRecoveryError = '';
      renderEntry();
      return result;
    } catch {
      throw new Error('The recovery on this device could not be restored. Your checkpoint is still kept.');
    }
  },
  async logout() {
    try {
      if (smokeMode !== 'profile') await request('logout', {});
      applySignedOutState('');
      return { signedOut: true, warning: '' };
    } catch (error) {
      if (error?.code !== 'LOCAL_SESSION_CLEARED') throw error;
      const warning = 'You are signed out in this browser, but server-side session cleanup could not be confirmed. You can sign in again safely.';
      applySignedOutState(warning);
      return { signedOut: true, warning };
    }
  },
  async saveGame(save, expectedOwnerId = null) {
    await initialReady;
    const ownerId = expectedOwnerId || state.user?.id || null;
    if (!ownerId || !state.user) return false;
    if (smokeMode === 'profile') {
      if (state.user.id !== ownerId) return recoverAccountOwnerMismatch();
      state.save = { ...save, updatedAt: new Date().toISOString() };
      state.saveError = '';
      emit();
      return true;
    }
    saveChain = saveChain.catch(() => {}).then(async () => {
      return runOwnedProfileOperation(
        ownerId,
        currentOwnerId => request('save', { save, expectedOwnerId: currentOwnerId }),
        result => {
          state.save = result.save;
          state.saveError = '';
          emit();
          return true;
        }
      ).catch(error => {
        if (error.code === 'MATCH_ALREADY_COMPLETED') api.clearLocalRecovery(ownerId, { matchId: save?.matchId });
        throw error;
      });
    });
    return saveChain;
  },
  async clearSave(expectedOwnerId = null) {
    await initialReady;
    const ownerId = expectedOwnerId || state.user?.id || null;
    if (!ownerId || !state.user) return false;
    const clearedMatchId = state.save?.matchId;
    if (smokeMode === 'profile') {
      if (state.user.id !== ownerId) return recoverAccountOwnerMismatch();
      if (clearedMatchId) api.clearLocalRecovery(ownerId, { matchId: clearedMatchId });
      state.save = null; state.saveError = ''; emit(); return true;
    }
    saveChain = saveChain.catch(() => {}).then(() => runOwnedProfileOperation(
      ownerId,
      currentOwnerId => request('clearSave', { expectedOwnerId: currentOwnerId }),
      () => {
        if (clearedMatchId) api.clearLocalRecovery(ownerId, { matchId: clearedMatchId });
        state.save = null;
        state.saveError = '';
        emit();
        return true;
      }
    ));
    return saveChain;
  },
  async loadDecks() {
    await initialReady;
    if (!state.user) return [];
    if (smokeMode === 'profile') return state.decks;
    return await runOwnedDeckOperation(
      ownerId => request('decks', null, { expectedOwnerId: ownerId }),
      result => {
        state.decks = sortDecks(Array.isArray(result.decks) ? result.decks : []);
        emit();
        return state.decks;
      }
    ) || [];
  },
  async upsertDeck(deck) {
    await initialReady;
    if (!state.user) return false;
    if (smokeMode === 'profile') return false;
    return await runOwnedDeckOperation(
      ownerId => request('upsertDeck', { deck, expectedOwnerId: ownerId }),
      result => {
        const savedDeck = result.deck;
        state.decks = sortDecks([...state.decks.filter(saved => saved.id !== savedDeck.id), savedDeck]);
        emit();
        return savedDeck;
      }
    ) || false;
  },
  async deleteDeck(deckId) {
    await initialReady;
    if (!state.user) return false;
    if (smokeMode === 'profile') return false;
    return await runOwnedDeckOperation(
      ownerId => request('deleteDeck', { deckId, expectedOwnerId: ownerId }),
      result => {
        state.decks = state.decks.filter(deck => deck.id !== deckId);
        emit();
        return result.deleted;
      }
    ) || false;
  },
  async completeMatch(match, expectedOwnerId = null) {
    await initialReady;
    const ownerId = expectedOwnerId || state.user?.id || null;
    if (!ownerId || !state.user) return false;
    if (smokeMode === 'profile') {
      if (state.user.id !== ownerId) return recoverAccountOwnerMismatch();
      state.profile = { ...state.profile, gamesPlayed: state.profile.gamesPlayed + 1, wins: state.profile.wins + (match.won ? 1 : 0), losses: state.profile.losses + (match.won ? 0 : 1), lifetimeScore: state.profile.lifetimeScore + (match.won ? 100 : 25) };
      api.clearLocalRecovery(ownerId, { matchId: match.matchId });
      state.save = null; emit(); return true;
    }
    saveChain = saveChain.catch(() => {}).then(() => runOwnedProfileOperation(
      ownerId,
      currentOwnerId => request('completeMatch', { ...match, expectedOwnerId: currentOwnerId }),
      result => {
        api.clearLocalRecovery(ownerId, { matchId: match.matchId });
        state.profile = result.profile;
        state.save = result.save;
        state.saveError = '';
        emit();
        return result.recorded;
      }
    ));
    return saveChain;
  },
  syncLocalFavorites,
  refresh,
};

globalThis.MTGAccount = api;
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => void refresh(), { once: true });
else void refresh();
