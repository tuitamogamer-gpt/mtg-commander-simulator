const WORD_NUMBERS = Object.freeze({
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
});

const MODAL_HEADERS = Object.freeze({
  'Choose one —': Object.freeze({ min: 1, max: 1 }),
  'Choose two —': Object.freeze({ min: 2, max: 2 }),
  'Choose one or both —': Object.freeze({ min: 1, max: 2 }),
});

const RECOGNIZED_REMINDERS = Object.freeze([
  '(It\'s an artifact with "{T}, Sacrifice this token: Add one mana of any color.")',
  '(They\'re artifacts with "{T}, Sacrifice this token: Add one mana of any color.")',
  '(Create a Clue token. It\'s an artifact with "{2}, Sacrifice this token: Draw a card.")',
  '(To proliferate, choose any number of permanents and/or players, then give each another counter of each kind already there.)',
]);

const SIMPLE_TOKEN_TYPES = Object.freeze({
  Blood: Object.freeze(['Artifact']),
  Clue: Object.freeze(['Artifact']),
  Food: Object.freeze(['Artifact']),
  Map: Object.freeze(['Artifact']),
  Powerstone: Object.freeze(['Artifact']),
  Treasure: Object.freeze(['Artifact']),
});

const TARGET_DESCRIPTORS = Object.freeze({
  artifact: Object.freeze({ kind: 'permanent', types: Object.freeze(['Artifact']) }),
  artifacts: Object.freeze({ kind: 'permanent', types: Object.freeze(['Artifact']) }),
  'artifact card': Object.freeze({ kind: 'card', cardTypes: Object.freeze(['Artifact']) }),
  'artifact cards': Object.freeze({ kind: 'card', cardTypes: Object.freeze(['Artifact']) }),
  'artifact or creature': Object.freeze({ kind: 'permanent', types: Object.freeze(['Artifact', 'Creature']), typeMatch: 'any' }),
  'artifact or enchantment': Object.freeze({ kind: 'permanent', types: Object.freeze(['Artifact', 'Enchantment']), typeMatch: 'any' }),
  'artifact or enchantment spell': Object.freeze({ kind: 'spell', spellTypes: Object.freeze(['Artifact', 'Enchantment']), typeMatch: 'any' }),
  'artifacts and/or enchantments': Object.freeze({ kind: 'permanent', types: Object.freeze(['Artifact', 'Enchantment']), typeMatch: 'any' }),
  card: Object.freeze({ kind: 'card' }),
  cards: Object.freeze({ kind: 'card' }),
  creature: Object.freeze({ kind: 'permanent', types: Object.freeze(['Creature']) }),
  creatures: Object.freeze({ kind: 'permanent', types: Object.freeze(['Creature']) }),
  'creature card': Object.freeze({ kind: 'card', cardTypes: Object.freeze(['Creature']) }),
  'creature cards': Object.freeze({ kind: 'card', cardTypes: Object.freeze(['Creature']) }),
  'creature or planeswalker': Object.freeze({ kind: 'permanent', types: Object.freeze(['Creature', 'Planeswalker']), typeMatch: 'any' }),
  'creature spell': Object.freeze({ kind: 'spell', spellTypes: Object.freeze(['Creature']) }),
  enchantment: Object.freeze({ kind: 'permanent', types: Object.freeze(['Enchantment']) }),
  enchantments: Object.freeze({ kind: 'permanent', types: Object.freeze(['Enchantment']) }),
  forest: Object.freeze({ kind: 'permanent', types: Object.freeze(['Land']), subtypes: Object.freeze(['Forest']) }),
  land: Object.freeze({ kind: 'permanent', types: Object.freeze(['Land']) }),
  lands: Object.freeze({ kind: 'permanent', types: Object.freeze(['Land']) }),
  'noncreature spell': Object.freeze({ kind: 'spell', filters: Object.freeze({ noncreature: true }) }),
  'nonland permanent': Object.freeze({ kind: 'permanent', filters: Object.freeze({ nonland: true }) }),
  'nonland permanents': Object.freeze({ kind: 'permanent', filters: Object.freeze({ nonland: true }) }),
  'nonland permanent card': Object.freeze({ kind: 'card', filters: Object.freeze({ nonland: true }) }),
  'nonland permanent cards': Object.freeze({ kind: 'card', filters: Object.freeze({ nonland: true }) }),
  permanent: Object.freeze({ kind: 'permanent' }),
  permanents: Object.freeze({ kind: 'permanent' }),
  'permanent card': Object.freeze({ kind: 'card', cardTypes: Object.freeze(['Permanent']) }),
  'permanent cards': Object.freeze({ kind: 'card', cardTypes: Object.freeze(['Permanent']) }),
  planeswalker: Object.freeze({ kind: 'permanent', types: Object.freeze(['Planeswalker']) }),
  planeswalkers: Object.freeze({ kind: 'permanent', types: Object.freeze(['Planeswalker']) }),
  spell: Object.freeze({ kind: 'spell' }),
  spells: Object.freeze({ kind: 'spell' }),
  'instant or sorcery card': Object.freeze({ kind: 'card', cardTypes: Object.freeze(['Instant', 'Sorcery']), typeMatch: 'any' }),
  'instant or sorcery cards': Object.freeze({ kind: 'card', cardTypes: Object.freeze(['Instant', 'Sorcery']), typeMatch: 'any' }),
});

export const ORACLE_SPELL_V4_PARSER_VERSION = 4;

function normalizeApostrophes(value) {
  return value.replace(/[’‘]/g, "'");
}

function normalizeInput(value) {
  let normalized = normalizeApostrophes(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
  for (const reminder of RECOGNIZED_REMINDERS) {
    normalized = normalized.split(reminder).join('');
  }
  return normalized
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function stripTerminalPeriod(value) {
  const trimmed = value.trim();
  return trimmed.endsWith('.') ? trimmed.slice(0, -1).trim() : trimmed;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function amount(value) {
  const normalized = value.trim().toLowerCase();
  if (Object.hasOwn(WORD_NUMBERS, normalized)) {
    return { kind: 'number', value: WORD_NUMBERS[normalized] };
  }
  if (/^[1-9]\d*$/.test(normalized)) {
    return { kind: 'number', value: Number(normalized) };
  }
  if (normalized === 'x') {
    return { kind: 'variable', name: 'X' };
  }
  return null;
}

function exactQuantity(value) {
  const parsed = amount(value);
  if (!parsed || parsed.kind !== 'number') return null;
  return { min: parsed.value, max: parsed.value };
}

function cloneDescriptor(descriptor) {
  const clone = { kind: descriptor.kind };
  for (const key of ['types', 'cardTypes', 'spellTypes', 'subtypes']) {
    if (descriptor[key]) clone[key] = [...descriptor[key]];
  }
  if (descriptor.typeMatch) clone.typeMatch = descriptor.typeMatch;
  if (descriptor.filters) clone.filters = { ...descriptor.filters };
  return clone;
}

function targetQuantityAndBody(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'any target') {
    return {
      body: 'any',
      quantity: { min: 1, max: 1 },
      specialKind: 'damageable',
    };
  }

  let match = normalized.match(/^target (.+)$/);
  if (match) return { body: match[1], quantity: { min: 1, max: 1 } };

  match = normalized.match(/^up to (one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*) target (.+)$/);
  if (match) {
    const maximum = amount(match[1]);
    if (!maximum || maximum.kind !== 'number') return null;
    return { body: match[2], quantity: { min: 0, max: maximum.value } };
  }

  match = normalized.match(/^(one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*) target (.+)$/);
  if (match) {
    const quantity = exactQuantity(match[1]);
    return quantity ? { body: match[2], quantity } : null;
  }

  match = normalized.match(/^any number of target (.+)$/);
  if (match) return { body: match[1], quantity: { min: 0, max: null } };

  return null;
}

function parseTargetPhrase(value, options = {}) {
  const parsed = targetQuantityAndBody(value);
  if (!parsed) return null;
  if (parsed.specialKind) {
    return {
      kind: parsed.specialKind,
      quantity: parsed.quantity,
      distinct: true,
    };
  }

  let body = parsed.body;
  if (body === 'player') {
    return {
      kind: 'player',
      relation: 'any',
      quantity: parsed.quantity,
      distinct: true,
    };
  }
  if (body === 'opponent' || body === 'opponents') {
    return {
      kind: 'player',
      relation: 'opponent',
      quantity: parsed.quantity,
      distinct: true,
    };
  }

  let controller = null;
  const controllerSuffixes = [
    [" you don't control", 'notYou'],
    [' an opponent controls', 'opponent'],
    [' your opponent controls', 'opponent'],
    [' controlled by an opponent', 'opponent'],
    [' you control', 'you'],
  ];
  for (const [suffix, relation] of controllerSuffixes) {
    if (body.endsWith(suffix)) {
      body = body.slice(0, -suffix.length);
      controller = relation;
      break;
    }
  }

  const prefixFilters = [
    ['tapped ', 'tapped', true],
    ['untapped ', 'tapped', false],
    ['attacking ', 'attacking', true],
    ['blocking ', 'blocking', true],
  ];
  const addedFilters = {};
  for (const [prefix, key, state] of prefixFilters) {
    if (body.startsWith(prefix)) {
      body = body.slice(prefix.length);
      addedFilters[key] = state;
      break;
    }
  }

  const descriptor = TARGET_DESCRIPTORS[body];
  if (!descriptor) return null;
  const target = cloneDescriptor(descriptor);
  if (target.kind === 'card' && options.zone !== 'graveyard') return null;
  target.zone = options.zone || (target.kind === 'spell' ? 'stack' : target.kind === 'card' ? 'graveyard' : 'battlefield');
  target.quantity = parsed.quantity;
  target.distinct = true;
  if (target.kind === 'permanent') target.controller = controller || 'any';
  if (target.kind === 'card' && options.owner) target.owner = options.owner;
  if (Object.keys(addedFilters).length) {
    target.filters = { ...(target.filters || {}), ...addedFilters };
  }
  return target;
}

function parseTargetWithSourceZone(value, fallbackZone = null) {
  const normalized = value.trim().toLowerCase();
  const sources = [
    [' from your graveyard', 'graveyard', 'you'],
    [' in your graveyard', 'graveyard', 'you'],
    [' from a graveyard', 'graveyard', 'any'],
    [' in a graveyard', 'graveyard', 'any'],
    [' from any graveyard', 'graveyard', 'any'],
    [' from graveyards', 'graveyard', 'any'],
  ];
  for (const [suffix, zone, owner] of sources) {
    if (normalized.endsWith(suffix)) {
      const target = parseTargetPhrase(normalized.slice(0, -suffix.length), { zone, owner });
      return target?.kind === 'card' ? target : null;
    }
  }
  return parseTargetPhrase(normalized, fallbackZone ? { zone: fallbackZone } : {});
}

function targetEffect(effect, target) {
  return { effect, targets: [target] };
}

function untargetedEffect(effect) {
  return { effect, targets: [] };
}

function parseAdditionalCostAtom(value) {
  const normalized = value.trim().toLowerCase();
  let match = normalized.match(/^sacrifice (?:a|an|one) (artifact|creature|legendary creature)(?: or (?:a |an )?(artifact|creature))?$/);
  if (match) {
    const permanentTypes = match[2]
      ? ['Artifact', 'Creature']
      : [match[1] === 'artifact' ? 'Artifact' : 'Creature'];
    const object = { kind: 'permanent', types: permanentTypes };
    if (match[1] === 'legendary creature') object.filters = { legendary: true };
    if (permanentTypes.length > 1) object.typeMatch = 'any';
    return {
      kind: 'sacrifice',
      quantity: { min: 1, max: 1 },
      object,
    };
  }

  match = normalized.match(/^discard (a|one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*) cards?$/);
  if (match) {
    const quantity = exactQuantity(match[1]);
    return quantity ? { kind: 'discard', quantity, object: { kind: 'card' } } : null;
  }

  match = normalized.match(/^pay (x|one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*) life$/);
  if (match) {
    const life = amount(match[1]);
    return life ? { kind: 'payLife', amount: life } : null;
  }

  return null;
}

function parseAdditionalCost(value) {
  const normalized = stripTerminalPeriod(value);
  const prefix = 'As an additional cost to cast this spell, ';
  if (!normalized.startsWith(prefix)) return null;
  const clause = normalized.slice(prefix.length);
  const direct = parseAdditionalCostAtom(clause);
  if (direct) return direct;

  for (const separator of [' or ', ' and ']) {
    const index = clause.indexOf(separator);
    if (index === -1 || clause.indexOf(separator, index + separator.length) !== -1) continue;
    const left = parseAdditionalCostAtom(clause.slice(0, index));
    const right = parseAdditionalCostAtom(clause.slice(index + separator.length));
    if (!left || !right) continue;
    if (separator === ' or ') {
      return {
        kind: 'choice',
        choose: { min: 1, max: 1 },
        options: [left, right],
      };
    }
    return { kind: 'sequence', costs: [left, right] };
  }
  return null;
}

function parseDrawOrDiscardAtom(statement) {
  let match = statement.match(/^(?:you )?draw (a|one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*|x) cards?, then discard (a|one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*|x) cards?$/i);
  if (match) {
    const drawAmount = amount(match[1]);
    const discardAmount = amount(match[2]);
    if (!drawAmount || !discardAmount) return null;
    return [
      untargetedEffect({ kind: 'draw', actor: 'you', amount: drawAmount }),
      untargetedEffect({ kind: 'discard', actor: 'you', amount: discardAmount }),
    ];
  }

  match = statement.match(/^target player draws (a|one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*|x) cards?, then discards (a|one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*|x) cards?$/i);
  if (match) {
    const drawAmount = amount(match[1]);
    const discardAmount = amount(match[2]);
    if (!drawAmount || !discardAmount) return null;
    const player = parseTargetPhrase('target player');
    return [
      targetEffect({ kind: 'draw', amount: drawAmount }, player),
      targetEffect({ kind: 'discard', amount: discardAmount }, player),
    ];
  }

  match = statement.match(/^(?:you )?draw (a|one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*|x) cards?$/i);
  if (match) {
    const drawAmount = amount(match[1]);
    return drawAmount ? [untargetedEffect({ kind: 'draw', actor: 'you', amount: drawAmount })] : null;
  }

  match = statement.match(/^target player draws (a|one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*|x) cards?$/i);
  if (match) {
    const drawAmount = amount(match[1]);
    return drawAmount
      ? [targetEffect({ kind: 'draw', amount: drawAmount }, parseTargetPhrase('target player'))]
      : null;
  }

  match = statement.match(/^(?:you )?discard (a|one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*|x) cards?$/i);
  if (match) {
    const discardAmount = amount(match[1]);
    return discardAmount ? [untargetedEffect({ kind: 'discard', actor: 'you', amount: discardAmount })] : null;
  }

  match = statement.match(/^target player discards (a|one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*|x) cards?$/i);
  if (match) {
    const discardAmount = amount(match[1]);
    return discardAmount
      ? [targetEffect({ kind: 'discard', amount: discardAmount }, parseTargetPhrase('target player'))]
      : null;
  }
  return null;
}

function parseCounterAtom(statement) {
  let match = statement.match(/^Counter (.+?) unless (?:its|that spell's) controller pays \{([1-9]\d*)\}$/i);
  if (match) {
    const target = parseTargetPhrase(match[1], { zone: 'stack' });
    if (!target || target.kind !== 'spell') return null;
    return [targetEffect({
      kind: 'counterSpell',
      unless: {
        kind: 'controllerPaysMana',
        amount: { kind: 'genericMana', value: Number(match[2]) },
      },
    }, target)];
  }

  match = statement.match(/^Counter (.+)$/i);
  if (!match) return null;
  const target = parseTargetPhrase(match[1], { zone: 'stack' });
  return target?.kind === 'spell'
    ? [targetEffect({ kind: 'counterSpell' }, target)]
    : null;
}

function parseLifeAtom(statement) {
  let match = statement.match(/^(?:you )?gain (a|one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*|x) life$/i);
  if (match) {
    const life = amount(match[1]);
    return life ? [untargetedEffect({ kind: 'gainLife', actor: 'you', amount: life })] : null;
  }

  match = statement.match(/^target player gains (a|one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*|x) life$/i);
  if (match) {
    const life = amount(match[1]);
    return life
      ? [targetEffect({ kind: 'gainLife', amount: life }, parseTargetPhrase('target player'))]
      : null;
  }

  match = statement.match(/^target player gains twice x life$/i);
  if (match) {
    return [targetEffect({
      kind: 'gainLife',
      amount: {
        kind: 'multiply',
        operands: [{ kind: 'number', value: 2 }, { kind: 'variable', name: 'X' }],
      },
    }, parseTargetPhrase('target player'))];
  }
  return null;
}

function parseDamageAtom(statement, cardName) {
  const namedSource = cardName ? escapeRegExp(normalizeApostrophes(cardName)) : null;
  const sourcePattern = namedSource ? `(?:${namedSource}|this spell)` : 'this spell';
  let match = statement.match(new RegExp(`^${sourcePattern} deals (one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\\d*|x) damage to (.+)$`, 'i'));
  if (!match) {
    match = statement.match(/^Deal (one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*|x) damage to (.+)$/i);
  }
  if (!match) return null;
  const damage = amount(match[1]);
  const target = parseTargetPhrase(match[2]);
  return damage && target
    ? [targetEffect({ kind: 'dealDamage', source: 'spell', amount: damage }, target)]
    : null;
}

function parseDestroyOrExileAtom(statement) {
  let match = statement.match(/^Destroy (.+)\. It can't be regenerated$/i);
  if (match) {
    const target = parseTargetPhrase(match[1]);
    return target
      ? [targetEffect({ kind: 'destroy', canRegenerate: false }, target)]
      : null;
  }

  match = statement.match(/^Destroy all (artifacts|enchantments|creatures|planeswalkers|nonland permanents)$/i);
  if (match) {
    const descriptor = TARGET_DESCRIPTORS[match[1].toLowerCase()];
    return descriptor
      ? [untargetedEffect({ kind: 'destroyAll', scope: cloneDescriptor(descriptor) })]
      : null;
  }

  match = statement.match(/^Destroy (.+)$/i);
  if (match) {
    const target = parseTargetPhrase(match[1]);
    return target ? [targetEffect({ kind: 'destroy' }, target)] : null;
  }

  match = statement.match(/^Exile all cards from target player's graveyard$/i);
  if (match) {
    return [targetEffect({ kind: 'exileGraveyard' }, parseTargetPhrase('target player'))];
  }
  match = statement.match(/^Exile target player's graveyard$/i);
  if (match) {
    return [targetEffect({ kind: 'exileGraveyard' }, parseTargetPhrase('target player'))];
  }
  match = statement.match(/^Exile all cards from all graveyards$/i);
  if (match) return [untargetedEffect({ kind: 'exileAllGraveyards' })];

  match = statement.match(/^Exile (.+)$/i);
  if (match) {
    const target = parseTargetWithSourceZone(match[1]);
    return target ? [targetEffect({ kind: 'exile' }, target)] : null;
  }
  return null;
}

function parseReturnAtom(statement) {
  const destinations = [
    [' to the battlefield tapped under your control', 'returnToBattlefield', { tapped: true, controller: 'you' }],
    [' to the battlefield under your control', 'returnToBattlefield', { tapped: false, controller: 'you' }],
    [' to the battlefield tapped', 'returnToBattlefield', { tapped: true, controller: 'owner' }],
    [' to the battlefield', 'returnToBattlefield', { tapped: false, controller: 'owner' }],
    [" to their owners' hands", 'returnToHand', { destination: 'ownersHand' }],
    [" to its owner's hand", 'returnToHand', { destination: 'ownersHand' }],
    [' to your hand', 'returnToHand', { destination: 'yourHand' }],
  ];
  const normalized = statement.toLowerCase();
  if (!normalized.startsWith('return ')) return null;
  for (const [suffix, kind, fields] of destinations) {
    if (!normalized.endsWith(suffix)) continue;
    const phrase = statement.slice('Return '.length, statement.length - suffix.length);
    const target = parseTargetWithSourceZone(phrase);
    if (!target) return null;
    return [targetEffect({ kind, ...fields }, target)];
  }
  return null;
}

function parseTapAtom(statement) {
  let match = statement.match(/^Tap or untap (.+)$/i);
  if (match) {
    const target = parseTargetPhrase(match[1]);
    return target ? [targetEffect({ kind: 'tapOrUntap' }, target)] : null;
  }
  match = statement.match(/^(Tap|Untap) (.+)$/i);
  if (!match) return null;
  const target = parseTargetPhrase(match[2]);
  if (!target) return null;
  return [targetEffect({ kind: match[1].toLowerCase() }, target)];
}

function parseCreateTokenAtom(statement) {
  let actor = 'you';
  let target = null;
  let body = statement;
  if (/^you create /i.test(body)) {
    body = body.replace(/^you create /i, '');
  } else if (/^target player creates /i.test(body)) {
    body = body.replace(/^target player creates /i, '');
    actor = null;
    target = parseTargetPhrase('target player');
  } else if (/^create /i.test(body)) {
    body = body.replace(/^create /i, '');
  } else {
    return null;
  }

  const match = body.match(/^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*) (tapped )?(Blood|Clue|Food|Map|Powerstone|Treasure) tokens?$/i);
  if (!match) return null;
  const tokenAmount = amount(match[1]);
  const canonicalName = Object.keys(SIMPLE_TOKEN_TYPES).find(name => name.toLowerCase() === match[3].toLowerCase());
  if (!tokenAmount || !canonicalName) return null;
  const effect = {
    kind: 'createToken',
    amount: tokenAmount,
    token: {
      name: canonicalName,
      types: [...SIMPLE_TOKEN_TYPES[canonicalName]],
      tapped: Boolean(match[2]),
    },
  };
  if (actor) effect.controller = actor;
  return [target ? targetEffect(effect, target) : untargetedEffect(effect)];
}

function parseSpecialActionAtom(statement) {
  let match = statement.match(/^Investigate(?: (twice))?$/i);
  if (match) {
    return [untargetedEffect({
      kind: 'investigate',
      actor: 'you',
      amount: { kind: 'number', value: match[1] ? 2 : 1 },
    })];
  }
  match = statement.match(/^Target player investigates(?: (twice))?$/i);
  if (match) {
    return [targetEffect({
      kind: 'investigate',
      amount: { kind: 'number', value: match[1] ? 2 : 1 },
    }, parseTargetPhrase('target player'))];
  }
  if (/^Proliferate$/i.test(statement)) {
    return [untargetedEffect({ kind: 'proliferate', actor: 'you' })];
  }
  if (/^(?:You )?become the monarch$/i.test(statement)) {
    return [untargetedEffect({ kind: 'becomeMonarch', actor: 'you' })];
  }
  if (/^Target player becomes the monarch$/i.test(statement)) {
    return [targetEffect({ kind: 'becomeMonarch' }, parseTargetPhrase('target player'))];
  }
  return null;
}

function parsePumpAtom(statement) {
  let match = statement.match(/^(.+?) gets ([+-]\d+)\/([+-]\d+) until end of turn$/i);
  if (match) {
    const target = parseTargetPhrase(match[1]);
    if (!target) return null;
    return [targetEffect({
      kind: 'modifyPowerToughness',
      power: Number(match[2]),
      toughness: Number(match[3]),
      duration: 'untilEndOfTurn',
    }, target)];
  }

  match = statement.match(/^(All creatures|Creatures you control) get ([+-]\d+)\/([+-]\d+) until end of turn$/i);
  if (!match) return null;
  return [untargetedEffect({
    kind: 'modifyPowerToughnessAll',
    scope: {
      kind: 'permanent',
      types: ['Creature'],
      controller: /^creatures you control$/i.test(match[1]) ? 'you' : 'any',
    },
    power: Number(match[2]),
    toughness: Number(match[3]),
    duration: 'untilEndOfTurn',
  })];
}

function parseCounterPlacementAtom(statement) {
  const match = statement.match(/^Put (a|one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*|x) ([+-]\d+\/[+-]\d+|charge|stun) counters? on (.+)$/i);
  if (!match) return null;
  const counterAmount = amount(match[1]);
  const target = parseTargetPhrase(match[3]);
  if (!counterAmount || !target) return null;
  return [targetEffect({
    kind: 'putCounters',
    amount: counterAmount,
    counterType: match[2].toLowerCase(),
  }, target)];
}

function parseMillOrSelectionAtom(statement) {
  let match = statement.match(/^Target player mills (a|one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*|x) cards?$/i);
  if (match) {
    const millAmount = amount(match[1]);
    return millAmount
      ? [targetEffect({ kind: 'mill', amount: millAmount }, parseTargetPhrase('target player'))]
      : null;
  }
  match = statement.match(/^Mill (a|one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*|x) cards?$/i);
  if (match) {
    const millAmount = amount(match[1]);
    return millAmount ? [untargetedEffect({ kind: 'mill', actor: 'you', amount: millAmount })] : null;
  }
  match = statement.match(/^(Scry|Surveil) (one|two|three|four|five|six|seven|eight|nine|ten|[1-9]\d*|x)$/i);
  if (match) {
    const selectionAmount = amount(match[2]);
    return selectionAmount
      ? [untargetedEffect({ kind: match[1].toLowerCase(), actor: 'you', amount: selectionAmount })]
      : null;
  }
  return null;
}

function parseAtom(value, context) {
  const statement = stripTerminalPeriod(value);
  if (!statement || statement.includes('\n')) return null;
  const parsers = [
    () => parseDrawOrDiscardAtom(statement),
    () => parseCounterAtom(statement),
    () => parseLifeAtom(statement),
    () => parseDamageAtom(statement, context.cardName),
    () => parseDestroyOrExileAtom(statement),
    () => parseReturnAtom(statement),
    () => parseTapAtom(statement),
    () => parseCreateTokenAtom(statement),
    () => parseSpecialActionAtom(statement),
    () => parsePumpAtom(statement),
    () => parseCounterPlacementAtom(statement),
    () => parseMillOrSelectionAtom(statement),
  ];
  for (const parser of parsers) {
    const parsed = parser();
    if (parsed) return parsed;
  }
  return null;
}

function strongSplitCandidates(value) {
  const candidates = [];
  const patterns = [
    /, then /gi,
    /\. Then /g,
    /\. /g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(value))) {
      candidates.push({ index: match.index, length: match[0].length });
    }
  }
  return candidates.sort((left, right) => left.index - right.index || right.length - left.length);
}

function conjunctionSplitCandidates(value) {
  const candidates = [];
  const pattern = / and /gi;
  let match;
  while ((match = pattern.exec(value))) {
    candidates.push({ index: match.index, length: match[0].length });
  }
  return candidates;
}

function parseSequenceFragment(value, context, depth = 0) {
  if (depth > 24) return null;
  const direct = parseAtom(value, context);
  if (direct) return direct;

  for (const split of strongSplitCandidates(value)) {
    const left = value.slice(0, split.index).trim();
    const right = value.slice(split.index + split.length).trim();
    if (!left || !right) continue;
    const leftEffects = parseSequenceFragment(left, context, depth + 1);
    if (!leftEffects) continue;
    const rightEffects = parseSequenceFragment(right, context, depth + 1);
    if (rightEffects) return [...leftEffects, ...rightEffects];
  }

  for (const split of conjunctionSplitCandidates(value)) {
    const left = value.slice(0, split.index).trim();
    const right = value.slice(split.index + split.length).trim();
    if (!left || !right) continue;
    const leftEffects = parseSequenceFragment(left, context, depth + 1);
    if (!leftEffects) continue;
    const rightEffects = parseSequenceFragment(right, context, depth + 1);
    if (rightEffects) return [...leftEffects, ...rightEffects];
  }
  return null;
}

function parseSequenceLines(lines, context) {
  const effects = [];
  for (let index = 0; index < lines.length; index += 1) {
    const parsed = parseSequenceFragment(lines[index], context);
    if (!parsed) {
      return { ok: false, lineIndex: index };
    }
    effects.push(...parsed);
  }
  return effects.length ? { ok: true, effects } : { ok: false, lineIndex: 0 };
}

function parseModal(lines, context) {
  const choose = MODAL_HEADERS[lines[0]];
  if (!choose) return null;
  const bulletLines = lines.slice(1);
  if (!bulletLines.length || bulletLines.some(line => !line.startsWith('• '))) {
    return { ok: false, code: 'malformed-modal', lineIndex: 1 };
  }
  if (choose.max > bulletLines.length || (lines[0] === 'Choose one or both —' && bulletLines.length !== 2)) {
    return { ok: false, code: 'malformed-modal', lineIndex: 0 };
  }

  const options = [];
  for (let index = 0; index < bulletLines.length; index += 1) {
    let body = bulletLines[index].slice(2).trim();
    let label = null;
    const labelMatch = body.match(/^([A-Za-z0-9][A-Za-z0-9 ',:!-]*?) — (.+)$/);
    if (labelMatch) {
      label = labelMatch[1];
      body = labelMatch[2];
    }
    const effects = parseSequenceFragment(body, context);
    if (!effects) {
      return { ok: false, code: 'unparsed-modal-option', lineIndex: index + 1, modeIndex: index };
    }
    const option = { effects };
    if (label) option.label = label;
    options.push(option);
  }
  return { ok: true, choose: { ...choose }, options };
}

function addIdsToCosts(costs) {
  let nextId = 1;
  function add(cost) {
    const result = { id: `cost-${nextId}`, ...cost };
    nextId += 1;
    if (cost.kind === 'choice') result.options = cost.options.map(add);
    if (cost.kind === 'sequence') result.costs = cost.costs.map(add);
    return result;
  }
  return costs.map(add);
}

function compileSuccess(additionalCosts, parsedBody) {
  const targets = [];
  const effects = [];
  const targetIdsBySpec = new Map();
  let nextTargetId = 1;
  let nextEffectId = 1;

  function targetId(spec) {
    if (targetIdsBySpec.has(spec)) return targetIdsBySpec.get(spec);
    const id = `target-${nextTargetId}`;
    nextTargetId += 1;
    targetIdsBySpec.set(spec, id);
    targets.push({ id, ...spec });
    return id;
  }

  function effectIds(specs) {
    return specs.map(spec => {
      const id = `effect-${nextEffectId}`;
      nextEffectId += 1;
      const targetIds = spec.targets.map(targetId);
      const effect = { id, ...spec.effect, targetIds };
      effects.push(effect);
      return id;
    });
  }

  let operation;
  if (parsedBody.kind === 'modal') {
    const options = parsedBody.options.map((option, index) => {
      const ids = effectIds(option.effects);
      const optionTargetIds = [...new Set(ids.flatMap(id => effects.find(effect => effect.id === id).targetIds))];
      const compiled = {
        id: `mode-${index + 1}`,
        effectIds: ids,
        targetIds: optionTargetIds,
      };
      if (option.label) compiled.label = option.label;
      return compiled;
    });
    operation = {
      id: 'operation-1',
      kind: 'modal',
      choose: parsedBody.choose,
      options,
    };
  } else {
    operation = {
      id: 'operation-1',
      kind: 'sequence',
      effectIds: effectIds(parsedBody.effects),
    };
  }

  return {
    ok: true,
    parserVersion: ORACLE_SPELL_V4_PARSER_VERSION,
    semanticClass: 'spell-v4',
    additionalCosts: addIdsToCosts(additionalCosts),
    targets,
    effects,
    operations: [operation],
  };
}

function failure(code, location = {}) {
  return {
    ok: false,
    parserVersion: ORACLE_SPELL_V4_PARSER_VERSION,
    semanticClass: 'spell-v4',
    error: { code, ...location },
    additionalCosts: [],
    targets: [],
    effects: [],
    operations: [],
  };
}

function resolveCardAndText(cardOrText, rulesCoreOverride) {
  if (typeof cardOrText === 'string') {
    return {
      cardName: null,
      text: rulesCoreOverride === undefined ? cardOrText : rulesCoreOverride,
    };
  }
  if (!cardOrText || typeof cardOrText !== 'object') return { cardName: null, text: null };
  const raw = cardOrText.raw && typeof cardOrText.raw === 'object' ? cardOrText.raw : null;
  return {
    cardName: typeof cardOrText.name === 'string'
      ? cardOrText.name
      : typeof raw?.name === 'string' ? raw.name : null,
    text: rulesCoreOverride
      ?? cardOrText.rulesCore
      ?? cardOrText.oracle_text
      ?? cardOrText.oracle
      ?? raw?.oracle
      ?? null,
  };
}

/**
 * Parse a deliberately closed subset of instant/sorcery Oracle text.
 *
 * The parser never returns executable callbacks or a catch-all operation. An
 * unsupported line invalidates the entire spell, including already parsed
 * costs/modes, so callers can safely route `ok: false` to explicit semantics.
 */
export function parseOracleAdditionalCosts(text) {
  const parsed=parseAdditionalCost(text);
  return parsed?addIdsToCosts([parsed]):null;
}

export function parseOracleSpellV4(cardOrText, rulesCoreOverride) {
  const resolved = resolveCardAndText(cardOrText, rulesCoreOverride);
  if (typeof resolved.text !== 'string' || !resolved.text.trim()) {
    return failure('missing-oracle-text');
  }
  const text = normalizeInput(resolved.text);
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  if (!lines.length) return failure('missing-oracle-text');

  const context = {
    cardName: resolved.cardName ? normalizeApostrophes(resolved.cardName) : null,
  };
  const additionalCosts = [];
  while (lines.length && lines[0].startsWith('As an additional cost to cast this spell,')) {
    const parsedCost = parseAdditionalCost(lines[0]);
    if (!parsedCost) return failure('unsupported-additional-cost', { section: 'additionalCost', lineIndex: additionalCosts.length });
    additionalCosts.push(parsedCost);
    lines.shift();
  }
  if (!lines.length) return failure('missing-spell-effect', { section: 'effect' });

  const modal = parseModal(lines, context);
  if (modal) {
    if (!modal.ok) {
      return failure(modal.code, {
        section: 'modal',
        lineIndex: modal.lineIndex,
        ...(modal.modeIndex === undefined ? {} : { modeIndex: modal.modeIndex }),
      });
    }
    return compileSuccess(additionalCosts, {
      kind: 'modal',
      choose: modal.choose,
      options: modal.options,
    });
  }

  if (/^Choose\b/i.test(lines[0]) || lines.some(line => line.startsWith('• '))) {
    return failure('unsupported-modal-header', { section: 'modal', lineIndex: 0 });
  }

  const sequence = parseSequenceLines(lines, context);
  if (!sequence.ok) {
    return failure('unparsed-effect', { section: 'effect', lineIndex: sequence.lineIndex });
  }
  return compileSuccess(additionalCosts, { kind: 'sequence', effects: sequence.effects });
}
