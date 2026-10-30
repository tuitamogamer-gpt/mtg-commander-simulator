// Deck sleeves: every deck at the table has its own card back. The chosen card
// back design stays the frame; the deck's color identity tints its stone and
// its commander (partners side by side) fills the central medallion. A sleeve
// follows the card's owner, which is public, and never the concealed card.
// Drawing needs a 2D canvas: without one, and until a sleeve is ready, the
// plain design stands in.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const U = MTG;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const TINT = { W: '#f0dfae', U: '#3d8fe6', B: '#8f5fc0', R: '#e5513a', G: '#38b25d', C: '#b5b0a6' };
  // The metal of each design, for the hairlines around the medallion.
  const METAL = { obsidian: '#c9a45c', astral: '#c9d2de', ember: '#c98a58' };
  // All three designs share one layout: 600 x 840 with the sigil's ring here.
  const WIDTH = 600, HEIGHT = 840, CX = 300, CY = 405, RADIUS = 146;
  const KEEP = 16;
  const identities = new WeakMap();
  const sleeves = new Map();
  let tableGame = null, drawable;

  // Commanders are public from the first turn; a guest's view may show a
  // face-down commander as a hidden card, which is not a name.
  function identityOf(player) {
    if (!player || typeof player !== 'object') return null;
    if (identities.has(player)) return identities.get(player);
    const inPlay = (player.commanders || []).map(card => card && card.name).filter(name => name && name !== 'Hidden card');
    const recorded = Array.isArray(player.commanderNames) ? player.commanderNames.filter(Boolean) : [];
    const deck = player.deck || U.DECKS?.[player.deckName];
    const names = (recorded.length ? recorded : inPlay.length ? inPlay : deck?.commander ? [deck.commander] : []).slice(0, 2);
    const listed = Array.isArray(player.colorIdentity) && player.colorIdentity.length ? player.colorIdentity : null;
    const colors = new Set(listed || names.flatMap(name => U.cardColorIdentity?.(U.DEFS?.[name]) || []));
    const identity = { names, colors: COLORS.filter(color => colors.has(color)) };
    // Keep it for the game once the deck is built; the sleeve must not change.
    if (recorded.length || inPlay.length) identities.set(player, identity);
    return identity;
  }

  // Two copies of one deck at a table: a later seat takes the next design,
  // so the two sleeves still differ.
  function frameFor(player, identity) {
    const backs = U.CARD_BACKS || [], chosen = U.selectedCardBack?.() || backs[0];
    const seats = player.game?.players || [], seat = seats.indexOf(player);
    const signature = identity.names.join(' + ');
    const earlier = seat > 0 ? seats.slice(0, seat).filter(other => identityOf(other)?.names.join(' + ') === signature).length : 0;
    return backs[(backs.indexOf(chosen) + earlier) % backs.length] || chosen;
  }

  U.deckSleeveSpec = player => {
    const identity = identityOf(player);
    if (!identity?.names.length) return null;
    const frame = frameFor(player, identity);
    if (!frame) return null;
    const colors = identity.colors.length ? identity.colors : ['C'];
    return {
      key: `${frame.id}|${colors.join('')}|${identity.names.join(' + ')}`, frame, colors, commanders: identity.names,
      arts: identity.names.map(name => U.cardImageURL?.(name, 'art')).filter(Boolean),
    };
  };

  U.deckBackURL = player => {
    const spec = U.deckSleeveSpec(player);
    if (!spec) return U.cardBackURL?.() || '';
    const sleeve = sleeves.get(spec.key);
    if (sleeve?.url) return sleeve.url;
    if (!sleeve) compose(spec);
    return spec.frame.url;
  };

  // A surface painted with CSS (library reveal, card flights) takes the
  // owner's sleeve through --card-back-image.
  U.applyDeckSleeve = (node, player) => {
    if (!node || !player || !Number.isInteger(player.idx)) return node;
    node.dataset.sleeveOwner = String(player.idx);
    node.style.setProperty('--card-back-image', `url("${U.deckBackURL(player)}")`);
    return node;
  };

  // Points every rendered back at its owner's finished sleeve (or the plain
  // design after the design changes, until the new sleeve is drawn).
  U.refreshDeckSleeves = () => {
    if (typeof document === 'undefined') return;
    const players = (tableGame || globalThis._ui?.game)?.players || [];
    for (const node of document.querySelectorAll('[data-sleeve-owner]')) {
      const player = players.find(candidate => String(candidate.idx) === node.dataset.sleeveOwner);
      if (!player) continue;
      const url = U.deckBackURL(player);
      if (node.tagName === 'IMG') { if (node.getAttribute('src') !== url) node.setAttribute('src', url); }
      else node.style.setProperty('--card-back-image', `url("${url}")`);
    }
  };

  // Draw every seat's sleeve as soon as the table exists, before the first
  // face-down card needs one.
  U.prepareDeckSleeves = game => {
    tableGame = game || tableGame;
    for (const player of game?.players || []) U.deckBackURL(player);
  };

  const canDraw = () => {
    if (drawable !== undefined) return drawable;
    try {
      drawable = typeof document !== 'undefined' && typeof Image === 'function' && typeof URL?.createObjectURL === 'function' &&
        !!document.createElement('canvas').getContext?.('2d');
    } catch (error) { drawable = false; }
    return drawable;
  };
  const idle = () => new Promise(resolve => typeof requestIdleCallback === 'function'
    ? requestIdleCallback(() => resolve(), { timeout: 400 }) : setTimeout(resolve, 16));

  function compose(spec) {
    const sleeve = {};
    sleeves.set(spec.key, sleeve);
    if (!canDraw()) { sleeve.failed = true; return; }
    idle().then(() => draw(spec)).then(url => {
      sleeve.url = url;
      prune();
      U.refreshDeckSleeves();
    }).catch(() => { sleeve.failed = true; });
  }

  // Sleeves of earlier tables and designs are released; the current seats'
  // sleeves always stay.
  function prune() {
    if (sleeves.size <= KEEP) return;
    const seated = new Set((tableGame?.players || []).map(player => U.deckSleeveSpec(player)?.key));
    for (const [key, sleeve] of sleeves) {
      if (sleeves.size <= KEEP) break;
      if (seated.has(key)) continue;
      if (sleeve.url) URL.revokeObjectURL(sleeve.url);
      sleeves.delete(key);
    }
  }

  const load = url => new Promise((resolve, reject) => {
    const image = new Image();
    // Remote art must allow canvas use; the bundled art is same-origin.
    if (/^https?:/i.test(url)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Sleeve image failed: ${url}`));
    image.src = url;
  });
  const blobOf = (canvas, type) => new Promise((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Sleeve encoding failed')), type, 0.9));

  async function draw(spec) {
    const [base, ...arts] = await Promise.all([load(spec.frame.url), ...spec.arts.map(url => load(url).catch(() => null))]);
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH; canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(base, 0, 0, WIDTH, HEIGHT);
    tintStone(ctx, spec.colors);
    medallion(ctx, arts.filter(Boolean), spec);
    let blob = await blobOf(canvas, 'image/webp');
    // Browsers without WebP encoding return PNG; JPEG keeps an opaque back small.
    if (blob.type !== 'image/webp') blob = await blobOf(canvas, 'image/jpeg');
    return URL.createObjectURL(blob);
  }

  const rgb = hex => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
  const light = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  // The identity colors along the card's diagonal, as 256 RGB samples.
  function diagonal(colors) {
    const stops = colors.map(color => rgb(TINT[color] || TINT.C)), table = new Uint8ClampedArray(256 * 3);
    for (let n = 0; n < 256; n++) {
      const at = stops.length < 2 ? 0 : Math.max(0, Math.min(1, (n / 255 - 0.12) / 0.76)) * (stops.length - 1);
      const low = Math.floor(at), high = Math.min(stops.length - 1, low + 1), mix = at - low;
      for (let c = 0; c < 3; c++) table[n * 3 + c] = stops[low][c] + (stops[high][c] - stops[low][c]) * mix;
    }
    return table;
  }

  // Recolor the dark stone in the deck's colors at its own brightness; the
  // brighter metal and sparks keep the design's finish.
  function tintStone(ctx, colors) {
    const table = diagonal(colors), image = ctx.getImageData(0, 0, WIDTH, HEIGHT), data = image.data;
    for (let y = 0, i = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++, i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], l = light(r, g, b);
        const weight = Math.min(1, (105 - l) / 70) * 0.92;
        if (weight <= 0) continue;
        const t = Math.round(255 * (x / WIDTH * 0.55 + y / HEIGHT * 0.45)) * 3;
        const tr = table[t], tg = table[t + 1], tb = table[t + 2], scale = (l * 1.3 + 6) / (light(tr, tg, tb) + 1);
        data[i] = r + (Math.min(255, tr * scale) - r) * weight;
        data[i + 1] = g + (Math.min(255, tg * scale) - g) * weight;
        data[i + 2] = b + (Math.min(255, tb * scale) - b) * weight;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  // Art crops are landscape. A full card image (portrait) is cut to its
  // illustration so no frame or rules text reaches the medallion.
  function cover(ctx, image, x, y, width, height) {
    const portrait = image.height > image.width;
    const sx = portrait ? image.width * 0.085 : 0, sy = portrait ? image.height * 0.11 : 0;
    const sw = portrait ? image.width * 0.83 : image.width, sh = portrait ? image.height * 0.445 : image.height;
    const scale = Math.max(width / sw, height / sh), dw = sw * scale, dh = sh * scale;
    ctx.drawImage(image, sx, sy, sw, sh, x + (width - dw) / 2, y + (height - dh) * 0.4, dw, dh);
  }

  function circle(ctx, radius, width, style, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = style; ctx.lineWidth = width;
    ctx.beginPath(); ctx.arc(CX, CY, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function medallion(ctx, arts, spec) {
    const metal = METAL[spec.frame.id] || METAL.obsidian, colors = spec.colors;
    let band = TINT[colors[0]];
    if (colors.length > 1 && ctx.createConicGradient) {
      band = ctx.createConicGradient(-Math.PI * 0.75, CX, CY);
      colors.concat(colors[0]).forEach((color, index) => band.addColorStop(index / colors.length, TINT[color]));
    }
    ctx.save();
    ctx.shadowColor = TINT[colors[0]]; ctx.shadowBlur = 34;
    circle(ctx, RADIUS + 7, 10, band, 0.55);
    ctx.restore();
    const left = CX - RADIUS, top = CY - RADIUS, size = RADIUS * 2;
    ctx.save();
    ctx.beginPath(); ctx.arc(CX, CY, RADIUS, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#07080b'; ctx.fillRect(left, top, size, size);
    if (arts.length > 1) {
      for (const [index, image] of arts.slice(0, 2).entries()) {
        ctx.save();
        ctx.beginPath(); ctx.rect(left + index * RADIUS, top, RADIUS, size); ctx.clip();
        cover(ctx, image, left + index * RADIUS, top, RADIUS, size);
        ctx.restore();
      }
    } else if (arts.length) cover(ctx, arts[0], left, top, size, size);
    else {
      // No art (offline import, blocked image): a gem in the deck's colors.
      const gem = ctx.createLinearGradient(left, top, left + size, top + size);
      colors.forEach((color, index) => gem.addColorStop(colors.length > 1 ? index / (colors.length - 1) : 0, TINT[color]));
      if (colors.length === 1) gem.addColorStop(1, TINT[colors[0]]);
      ctx.fillStyle = gem; ctx.globalAlpha = 0.75; ctx.fillRect(left, top, size, size); ctx.globalAlpha = 1;
    }
    const vignette = ctx.createRadialGradient(CX, CY, RADIUS * 0.5, CX, CY, RADIUS);
    vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = vignette; ctx.fillRect(left, top, size, size);
    const gloss = ctx.createLinearGradient(left, top, CX + RADIUS * 0.3, CY + RADIUS * 0.2);
    gloss.addColorStop(0, 'rgba(255,255,255,.16)'); gloss.addColorStop(0.45, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss; ctx.fillRect(left, top, size, size);
    ctx.restore();
    if (arts.length > 1) {
      ctx.save();
      ctx.strokeStyle = metal; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(CX, top); ctx.lineTo(CX, top + size); ctx.stroke();
      ctx.restore();
    }
    circle(ctx, RADIUS + 3, 6, 'rgba(0,0,0,.75)');
    circle(ctx, RADIUS + 7.5, 7, band);
    circle(ctx, RADIUS + 12, 2.5, metal);
    circle(ctx, RADIUS + 1, 1.6, metal, 0.9);
  }

  // A new design means new sleeves: rendered backs switch at once.
  const select = U.selectCardBack;
  if (typeof select === 'function') U.selectCardBack = id => { const saved = select(id); U.refreshDeckSleeves(); return saved; };

  const render = U.UI?.prototype?.render;
  if (render) {
    U.UI.prototype.render = function (...args) {
      const result = render.apply(this, args);
      if (this.game?.players && (this === globalThis._ui || !globalThis._ui)) U.prepareDeckSleeves(this.game);
      return result;
    };
  }
})();
