// Closed count phrases that reuse existing evaluators. Unknown qualifiers
// remain unparsed; this adapter must run after the existing v8 count parser.
export function extensionCount(text, helpers) {
  if (typeof text !== 'string' || /[.\n"]/u.test(text)) return null;
  const pluralCounters = / with (\+1\/\+1|-1\/-1|[a-z]+) counters on (?:it|them)(?= you control| your opponents control|$)/.exec(text);
  if (pluralCounters) return helpers.count(text.replace(pluralCounters[0], ' with one or more ' + pluralCounters[1] + ' counters on it'));
  const qualifier = /^(.+?) (you control|your opponents control) (with .+)$/.exec(text);
  if (qualifier) return helpers.count(qualifier[1] + ' ' + qualifier[3] + ' ' + qualifier[2]);

  const singular = /^(color|card type) among (.+)$/.exec(text);
  if (singular) return helpers.count(singular[1] + 's among ' + singular[2]);

  if (/^basic lands? you control$/.test(text)) return { kind: 'count', zone: 'battlefield', what: 'land', controller: 'you', filters: [{ what: 'land', zone: 'battlefield', controller: 'you', basic: true }] };
  const attackingType = /^(other )?(attacking|blocking) ([A-Z][a-zA-Z'-]+)$/.exec(text);
  if (attackingType) return helpers.count((attackingType[1] || '') + attackingType[2] + ' ' + attackingType[3] + ' creatures on the battlefield');

  const turn = /^(cards?|spells?) you(?:'ve| have)? (drawn|discarded|cast) this turn$/.exec(text);
  if (turn && (turn[1].startsWith('spell') === (turn[2] === 'cast'))) {
    return { kind: 'turn-count', field: { drawn: 'drewThisTurn', discarded: 'discardedN', cast: 'spellsCast' }[turn[2]] };
  }
  if (/^creatures? that died under your control this turn$/.test(text)) return { kind: 'turn-count', field: 'creaturesDiedUnder' };
  if (/^lands? that entered the battlefield under your control this turn$/.test(text)) return { kind: 'turn-count', field: 'landsEntered' };

  const chroma = /^(white|blue|black|red|green) mana symbols? in the mana costs of permanents you control$/.exec(text);
  if (chroma) return { kind: 'devotion', colors: [{ white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[chroma[1]]] };

  const named = /^(other )?(creatures?|artifacts?|enchantments?|lands?|permanents?) (?:you control named (.+)|named (.+) you control)$/.exec(text);
  if (named) return { kind: 'count', zone: 'battlefield', what: named[2].replace(/s$/, ''), controller: 'you', name: named[3] || named[4], ...(named[1] ? { other: true } : {}) };
  return null;
}
