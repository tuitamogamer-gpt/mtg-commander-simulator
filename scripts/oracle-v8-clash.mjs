// Clash binds its result to this instruction only; targets are still announced
// before the spell or ability is put on the Stack.
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const shift = (node, n) => Array.isArray(node) ? node.map(child => shift(child, n)) : node && typeof node === 'object'
  ? Object.fromEntries(Object.entries(node).map(([key, value]) => [key,
    (['target', 'who', 'otherTarget', 'conditionTarget'].includes(key) || key === 'index' && ['target-controller', 'target-owner'].includes(node.kind)) && typeof value === 'number' ? value + n : shift(value, n)])) : node;
const complete = body => body && !body.v4Body && Array.isArray(body.targets) && Array.isArray(body.effects) && body.effects.length;
const sentence = text => text.endsWith('.') ? text : text + '.';
function body(card, text, h, priorTargets = []) {
  if (new RegExp('^return (?:' + escape(card.name) + '|this card) to its owner\\\'s hand\\.$', 'i').test(text))
    return {targets: [], effects: [{action: 'return-source-to-hand'}], optional: false};
  // A singular pronoun refers to the preceding instruction's sole target.
  // Keep controller and toughness references bound to its captured identity.
  if (priorTargets.length === 1) {
    const controllerDamage = new RegExp('^(?:' + escape(card.name) + '|this creature) deals (\\d+) damage to that creature\\\'s controller\\.$', 'i').exec(text);
    if (controllerDamage && priorTargets[0].what === 'creature') return {targets: [], boundPrior: true, effects: [{action: 'damage', target: {kind: 'target-controller', index: 0}, n: Number(controllerDamage[1])}]};
    const gain = /^you gain life equal to that creature's toughness\.$/i.exec(text);
    if (gain && priorTargets[0].what === 'creature') return {targets: [], boundPrior: true, effects: [{action: 'gain-life', who: 'you', n: {kind: 'target-stat', target: 0, stat: 'toughness'}}]};
    const mill = /^that spell's controller mills (one|two|three|four|five|\d+) cards?\.$/i.exec(text);
    if (mill && priorTargets[0].zone === 'stack') return {targets: [], boundPrior: true, effects: [{action: 'mill', who: {kind: 'target-controller', index: 0}, n: ({one:1,two:2,three:3,four:4,five:5}[mill[1].toLowerCase()] ?? Number(mill[1]))}]};
    if (/^that (creature|player) /i.test(text)) {
      const noun = /^that (creature|player)/i.exec(text)[1].toLowerCase();
      const parsed = h.effect(card, text.replace(/^that /i, 'Target ').replace('an additional ', ''));
      if (complete(parsed) && parsed.targets.length === 1 && priorTargets[0].what === noun)
        return {...parsed, targets: [], boundPrior: true};
      return null;
    }
  }
  const parsed = h.effect(card, text);
  if (!complete(parsed) || /"event-(?:player|card)/.test(JSON.stringify(parsed))) return null;
  return parsed;
}
export function extensionEffect(card, line, h) {
  if (!/\bclash with (?:an opponent|defending player)/i.test(line)) return null;
  const match = /^(?:(.+?\.) )?(You may )?Clash with (an opponent|defending player)\.(?: If you win, (.+))?$/i.exec(line);
  if (!match) return null;
  const first = match[1] ? h.effect(card, match[1]) : {targets: [], effects: []};
  if (!first || first.optional || first.v4Body) return null;
  const tail = match[4] ? /^(.+?\.)(?: Otherwise, (.+?\.))?(?: (.+))?$/.exec(match[4]) : null;
  if (match[4] && !tail) return null;
  const branches = tail ? [tail[1], tail[2]] : [];
  const after = tail?.[3] ? h.effect(card, tail[3]) : {targets: [], effects: []};
  if (!after || after.optional || after.v4Body || after.targets.length) return null;
  const yes = branches[0] ? body(card, sentence(branches[0]), h, first.targets) : {targets: [], effects: []};
  if (!yes) return null;
  const allTargets = [...first.targets, ...yes.targets];
  const no = branches[1] ? body(card, sentence(branches[1]), h, allTargets) : {targets: [], effects: []};
  if (!no || no.optional || no.targets.length) return null;
  return {targets: allTargets, effects: [...first.effects, {
    action: 'clash-v8', opponent: match[3].toLowerCase() === 'defending player' ? 'defending-player' : 'choose',
    optionalClash: !!match[2], effects: yes.boundPrior ? yes.effects : shift(yes.effects, first.targets.length),
    elseEffects: no.effects, ...(yes.optional ? {optionalWin: true} : {}),
  }, ...after.effects], optional: false};
}
export function extensionLine(card, line, h) {
  const watcher = /^Whenever you clash( and win)?, (.+)$/i.exec(line) || /^Whenever you (win a clash), (.+)$/i.exec(line);
  if (!watcher) return null;
  const parsed = h.effect(card, watcher[2]);
  if (!complete(parsed) || /\bIf you won, /i.test(watcher[2])) return null;
  return {kind: 'generic-trigger', event: 'clashed', eventFilter: {kind: 'clash-v8', wonOnly: !!watcher[1]}, ...parsed, contract: 'generic-trigger-effect'};
}
