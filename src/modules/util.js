// ===== util.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});

// ---------- RNG (seeded) ----------
MTG.mulberry32 = function (seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

MTG.shuffle = function (arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// ---------- Mana ----------
// Cost representation: {generic:N, X:count, pips:[['B'],['G'],['B','R'],...], life:N (phyrexian alt)}
const COLORS = ['W', 'U', 'B', 'R', 'G'];
MTG.COLORS = COLORS;

MTG.parseCost = function (str) {
  // "{2}{B}{G}" / "{X}{R}{R}" / "{BR}{BR}" hybrid / "{UP}" phyrexian
  const cost = { generic: 0, x: 0, pips: [] };
  if (!str) return cost;
  const re = /\{([^}]+)\}/g; let m;
  while ((m = re.exec(str))) {
    const t = m[1];
    if (/^\d+$/.test(t)) cost.generic += parseInt(t, 10);
    else if (t === 'X') cost.x++;
    else if (t.length === 1 && COLORS.includes(t)) cost.pips.push([t]);
    else if (t === 'C') cost.pips.push(['C']);
    else if (t.length === 2 && t[1] === 'P') cost.pips.push([t[0], 'PHY']); // phyrexian
    else if (t.length === 2 && COLORS.includes(t[0]) && COLORS.includes(t[1])) cost.pips.push([t[0], t[1]]); // hybrid
    else if (/^2\/[WUBRG]$/.test(t)) cost.pips.push([t[2], 'TWO']);
    else if (t.includes('/')) {
      const parts = t.split('/');
      if (parts.includes('P')) cost.pips.push([parts[0], 'PHY']);
      else cost.pips.push(parts);
    }
  }
  return cost;
};

MTG.mv = function (str, xVal) {
  const c = MTG.parseCost(str);
  return c.generic + c.pips.length + (xVal || 0) * c.x;
};

MTG.costStr = function (cost, xVal) {
  const parts = [];
  const gen = cost.generic + (xVal !== undefined && cost.x ? 0 : 0);
  if (cost.x) parts.push(xVal !== undefined ? `X=${xVal}` : '{X}'.repeat(cost.x));
  if (cost.generic) parts.push('{' + cost.generic + '}');
  for (const p of cost.pips) {
    if (p[1] === 'PHY') parts.push('{' + p[0] + '/P}');
    else parts.push('{' + p.join('/') + '}');
  }
  if (!parts.length) return '{0}';
  return parts.join('');
};

MTG.colorsOfCost = function (str) {
  const set = new Set();
  const c = MTG.parseCost(str);
  for (const p of c.pips) for (const opt of p) if (COLORS.includes(opt)) set.add(opt);
  return [...set];
};

// count colored pips for devotion: pips whose options intersect given colors
MTG.devotionPips = function (str, colors) {
  if (!str) return 0;
  let n = 0;
  const c = MTG.parseCost(str);
  for (const p of c.pips) if (p.some(o => colors.includes(o))) n++;
  return n;
};

MTG.deepClone = function (o) { return JSON.parse(JSON.stringify(o)); };

MTG.plural = function (n, s, p) { return n === 1 ? s : (p || s + 's'); };

MTG.cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };

// 1x1 providna slika — kad Scryfall art ne stigne, ubacimo je da browser
// ne crta ikonu "slomljena slika"; CSS ispod prikaže poleđinu karte.
MTG.BLANK_PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
// mana simbol nije stigao → vrati se na stari obojeni pip
MTG.symFail = function (img, col, fg, code) {
  if (!img || img._failed || !img.parentNode) return;
  img._failed = true;
  const s = document.createElement('span');
  s.className = 'pip';
  s.style.background = col; s.style.color = fg;
  s.textContent = code;
  img.parentNode.replaceChild(s, img);
};
MTG.imgFail = function (img, cls) {
  if (!img || img._failed) return;
  img._failed = true;
  img.classList.add(cls || 'imgfail');
  img.removeAttribute('srcset');
  img.src = MTG.BLANK_PX;
};
