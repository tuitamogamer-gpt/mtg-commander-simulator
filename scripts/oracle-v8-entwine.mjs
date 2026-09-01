const MANA = '(?:\\{(?:\\d+|X|[WUBRGC]|[WUBRG]\\/[WUBRG]|[WUBRG]\\/P|2\\/[WUBRG])\\})+';
const NUMBER = new Map([['one', 1], ['two', 2], ['three', 3], ['four', 4]]);

// Entwine changes the mode announcement and adds a cost. It is deliberately
// parsed only around an independently complete modal spell; it never makes an
// unsupported mode executable and never normalizes a trailing rider away.
export function modalOperation(card, text, parseEffect, parseModal) {
  if (!card?.type_line || !/\b(?:Instant|Sorcery)\b/.test(card.type_line)) return null;
  const lines = String(text || '').split('\n');
  if (lines.length < 4) return null;
  const marker = lines.at(-1);
  let cost = null;
  const mana = new RegExp('^Entwine (' + MANA + ')$').exec(marker);
  if (mana) cost = {kind: 'mana', mana: mana[1]};
  else {
    const sacrifice = /^Entwine—Sacrifice (?:(a) land|(two|three|four) lands)\.$/.exec(marker);
    if (sacrifice) cost = {kind: 'sacrifice', type: 'Land', n: sacrifice[1] ? 1 : NUMBER.get(sacrifice[2])};
  }
  if (!cost) return null;
  const body = lines.slice(0, -1).join('\n');
  const modal = parseModal(card, body, parseEffect);
  if (!modal || modal.kind !== 'spell-modal-generic' || !Array.isArray(modal.modes) || modal.modes.length < 2 ||
      !modal.choose || !Number.isInteger(modal.choose.min) || !Number.isInteger(modal.choose.max) ||
      modal.choose.min < 1 || modal.choose.max >= modal.modes.length || modal.modes.some(mode => !mode.body)) return null;
  const descriptor = {
    kind: 'mechanic-entwine', cost, modeCount: modal.modes.length,
    printedChoice: {min: modal.choose.min, max: modal.choose.max}, contract: 'mechanic-entwine',
  };
  return {kind: 'operation-bundle', operations: [descriptor, modal]};
}
