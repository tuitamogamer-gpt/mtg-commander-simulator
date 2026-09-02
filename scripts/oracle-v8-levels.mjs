// A leveler is one printed card whose characteristics change with the level
// counters on it. Every band is compiled through the ordinary compiler, so a
// band whose printed rules are not executable fails the whole card closed.

const MANA = /^(?:\{(?:\d+|X|[WUBRGC]|[WUBRG]\/[WUBRG]|[WUBRG]\/P|2\/[WUBRG])\})+$/;

function stripReminder(text) {
  let output = '', depth = 0;
  for (const character of String(text || '')) {
    if (character === '(') { depth += 1; continue; }
    if (character === ')' && depth > 0) { depth -= 1; continue; }
    if (!depth) output += character;
  }
  return output;
}

export function compileLeveler(card, helpers = {}) {
  if (card?.layout !== 'leveler') return null;
  if (typeof helpers.compile !== 'function') return {reason: 'leveler-needs-band-compiler'};
  const lines = stripReminder(card.oracle_text).split('\n').map(line => line.trim()).filter(Boolean);
  if (!lines.length) return {reason: 'leveler-needs-printed-levels'};

  const levelUp = /^Level up ((?:\{[^}]+\})+)$/i.exec(lines[0]);
  if (!levelUp || !MANA.test(levelUp[1])) return {reason: 'leveler-needs-printed-level-up-cost'};

  // A leveler that is not a creature has no printed power or toughness in any
  // of its bands (Under-Construction Skyscraper and the other level lands).
  const creature = String(card.type_line || '').includes('Creature');

  // Everything after the level-up line is a sequence of printed bands: a
  // "LEVEL a-b" or "LEVEL n+" header, its power/toughness, then its rules.
  // Any line before the first header is the card's own level-0 body.
  const bands = [];
  const baseRules = [];
  let current = null;
  for (const line of lines.slice(1)) {
    const header = /^LEVEL (\d+)(?:-(\d+)|(\+))$/i.exec(line);
    if (header) {
      if (creature && current && current.power === undefined) return {reason: 'leveler-band-needs-power-toughness'};
      current = {min: Number(header[1]), max: header[3] ? null : Number(header[2]), rules: []};
      bands.push(current);
      continue;
    }
    if (!current) { baseRules.push(line); continue; }
    const stats = /^(\d+)\/(\d+)$/.exec(line);
    if (stats && current.power === undefined) {
      current.power = Number(stats[1]);
      current.toughness = Number(stats[2]);
      continue;
    }
    if (creature && current.power === undefined) return {reason: 'leveler-band-needs-power-toughness'};
    current.rules.push(line);
  }
  if (bands.length < 2) return {reason: 'leveler-needs-printed-levels'};
  if (creature && bands.some(band => band.power === undefined)) return {reason: 'leveler-band-needs-power-toughness'};
  if (!creature && bands.some(band => band.power !== undefined)) return {reason: 'leveler-band-needs-power-toughness'};
  if (bands.some((band, index) => index && band.min <= bands[index - 1].min)) return {reason: 'leveler-bands-must-ascend'};

  // Each band's printed rules are compiled as if they were the whole card, so
  // an unsupported band keeps the entire leveler out of the catalog.
  const compiled = [];
  for (const band of bands) {
    if (!band.rules.length) { compiled.push({...band, implementedKeywords: [], implementation: [], oracleContracts: []}); continue; }
    const probe = {...card, layout: 'normal', oracle_text: band.rules.join('\n'),
      ...(creature ? {power: String(band.power), toughness: String(band.toughness)} : {})};
    const result = helpers.compile(probe);
    if (!result?.semanticClass) return {reason: 'leveler-band-needs-complete-semantics'};
    compiled.push({...band, implementedKeywords: result.implementedKeywords || [],
      implementation: result.implementation || [], oracleContracts: result.oracleContracts || []});
  }

  // The lines printed above the first band stay the card's own rules.
  const body = baseRules.length
    ? helpers.compile({...card, layout: 'normal', oracle_text: baseRules.join('\n')})
    : {semanticClass: 'creature-template', implementedKeywords: [], implementation: [], oracleContracts: []};
  if (!body.semanticClass) return {reason: 'leveler-body-needs-complete-semantics'};

  const operation = {kind: 'mechanic-level-up-v8', cost: levelUp[1],
    bands: compiled.map(band => ({min: band.min, max: band.max,
      power: band.power === undefined ? null : band.power,
      toughness: band.toughness === undefined ? null : band.toughness,
      implementedKeywords: band.implementedKeywords, implementation: band.implementation})),
    contract: 'mechanic-level-up-v8'};
  return {semanticClass: body.semanticClass, implementedKeywords: (body.implementedKeywords || []).slice(),
    implementation: [...(body.implementation || []), operation],
    oracleContracts: [...new Set([...(body.oracleContracts || []), operation.contract])],
    rulesCore: lines.join('\n')};
}
