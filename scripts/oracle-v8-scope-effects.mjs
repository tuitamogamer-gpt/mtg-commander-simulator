// A group controlled by a targeted player is not a group of targeted cards.
// Bind the player's target index while retaining the complete group filter.
function graveFilter(noun, h) {
  const qualified = /^(.+? cards?) with (mana value|power|toughness) (\d+|X) or (less|greater)$/.exec(noun);
  if (qualified) {
    const base = graveFilter(qualified[1], h);
    if (base) return { ...base, stat: qualified[2] === 'mana value' ? 'mv' : qualified[2],
      threshold: qualified[3] === 'X' ? 'X' : Number(qualified[3]), comparison: qualified[4] };
  }
  const filter = h.target('target ' + noun.replace(/\bcards\b/g, 'card') + ' from your graveyard');
  return filter?.zone === 'graveyard' ? filter : null;
}
export function extensionEffect(card, line, h) {
  line = line.endsWith('.') ? line : line + '.';
  if (/^(?:Untap|Tap|Destroy|Exile|Return) (?:another |up to one )?target basic land(?: you control| an opponent controls)?(?:\.| to its owner's hand\.)$/.test(line)) {
    const body = h.effect(card, line.replace('target basic land', 'target land'));
    if (body && body.targets?.length === 1 && body.targets[0].zone === 'battlefield' && body.targets[0].what === 'land')
      return { ...body, targets: [{ ...body.targets[0], basic: true }] };
  }
  // Keep the established count/condition grammar stable: the new basic-land
  // group qualifier is local to the effect, not a global target fallback.
  if (/^(?:Untap|Tap|Destroy|Exile|Return) all basic lands(?: you control| target (?:player|opponent) controls)?(?:\.| to their owners?' hands?\.)$/.test(line)) {
    const body = h.effect(card, line.replace('all basic lands', 'all lands'));
    if (body && body.effects?.length === 1 && body.effects[0].action === 'battlefield-group' &&
        body.effects[0].filters?.every(filter => filter.what === 'land'))
      return { ...body, effects: body.effects.map(effect => ({ ...effect,
        filters: effect.filters.map(filter => ({ ...filter, basic: true })) })) };
  }
  const mentions = [...line.matchAll(/\btarget (player|opponent) controls\b/g)];
  if (mentions.length === 1 && (line.match(/\btarget\b/g) || []).length === 1) {
    const mention = mentions[0];
    let normalized = line.replace(mention[0], 'you control');
    normalized = normalized.replace(/ to their owner's hand\.$/, " to their owners' hands.");
    let body = h.effect(card, normalized);
    if (body?.effects?.length === 1 && body.effects[0].action === 'pump-group' && body.effects[0].who === 'your-creatures') {
      const { who, ...effect } = body.effects[0];
      body = { ...body, effects: [{ ...effect, action: 'battlefield-group', operation: 'pump',
        filters: [{ what: 'creature', zone: 'battlefield', controller: 'you', min: 1 }] }] };
    }
    if (body && !body.optional && !body.v4Body && !body.targets.length && body.effects.length &&
        body.effects.every(effect => effect.action === 'battlefield-group' && !effect.players &&
          effect.target === undefined && effect.filters.length && effect.filters.every(filter => filter.controller === 'you'))) {
      return {
        targets: [h.target('target ' + mention[1])],
        effects: body.effects.map(effect => ({ ...effect, target: 0,
          filters: effect.filters.map(filter => ({ ...filter, controller: 'any' })) })),
      };
    }
  }
  const untap = /^Target (player|opponent) untaps (all .+?) they control\.$/i.exec(line);
  if (untap) return extensionEffect(card, 'Untap ' + untap[2] + ' target ' + untap[1] + ' controls.', h);
  // Both owner wordings return each object to its respective owner's hand.
  if (/^Return all .+ to their owner's hand\.$/.test(line)) {
    const body = h.effect(card, line.replace(" to their owner's hand.", " to their owners' hands."));
    if (body && !body.targets.length && body.effects.length === 1 &&
        body.effects[0].action === 'battlefield-group' && body.effects[0].operation === 'bounce') return body;
  }
  const exile = /^Exile all (.+?) from (your|target player's|target opponent's|all) (graveyard|graveyards|library|hand|hand and graveyard)\.$/i.exec(line);
  if (exile) {
    const zones = exile[3].toLowerCase().replace('graveyards', 'graveyard').split(' and ');
    const actor = exile[2].toLowerCase();
    if (actor === 'all' && zones.join() !== 'graveyard') return null;
    const noun = exile[1].replace(/\bcards\b/g, 'card');
    const filter = graveFilter(noun, h);
    if (filter?.zone === 'graveyard') {
      const who = actor === 'your' ? 'you' : actor === 'all' ? 'each-player' : 0;
      return { targets: typeof who === 'number' ? [h.target(actor.includes('opponent') ? 'target opponent' : 'target player')] : [],
        effects: zones.map(zone => {
          const rezone = spec => ({ ...spec, zone, ...(spec.alternatives ? { alternatives: spec.alternatives.map(rezone) } : {}) });
          return { action: 'zone-select', who, zone, filter: rezone(filter), n: 'all', destination: 'exile' };
        }) };
    }
  }
  const returnAll = /^Return all (.+? cards(?: with (?:mana value|power|toughness) (?:\d+|X) or (?:less|greater))?) from your graveyard to (your hand|the battlefield)( tapped)?\.$/i.exec(line);
  if (returnAll) {
    const qualities = returnAll[1].replace(/,? and /g, ' or ').replace(/, /g, ' or ').replace(/\bcards\b/g, 'card');
    const filter = graveFilter(qualities, h);
    const destination = returnAll[2] === 'your hand' ? 'hand' : 'battlefield';
    const permanent = spec => spec.alternatives ? spec.alternatives.every(permanent) :
      ['creature','artifact','enchantment','planeswalker','land','permanent','nonland permanent','artifact or enchantment','artifact or creature','creature or land'].includes(spec.what);
    if (filter?.zone === 'graveyard' && (destination !== 'battlefield' || permanent(filter)) && (!returnAll[3] || destination === 'battlefield'))
      return { targets: [], effects: [{ action: 'zone-select', who: 'you', zone: 'graveyard', filter, n: 'all', destination, tapped: !!returnAll[3] }] };
  }
  return null;
}
