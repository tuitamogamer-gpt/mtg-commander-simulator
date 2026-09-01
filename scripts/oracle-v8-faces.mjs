// A double-faced card is admitted only when both complete printed faces have
// independently passed the normal compiler. No face's text is discarded.
export function compileFaces(card, helpers = {}) {
  if (card?.layout !== 'modal_dfc') return null;
  if (!Array.isArray(card.card_faces) || card.card_faces.length !== 2 || typeof helpers.compile !== 'function' || typeof helpers.raw !== 'function') {
    return {reason: 'double-faced-card-needs-two-complete-faces'};
  }
  const faces = [];
  for (const [index, face] of card.card_faces.entries()) {
    if (!face?.name || !face.type_line || typeof face.oracle_text !== 'string' || /\b(?:transform|convert|meld|daybound|nightbound)\b/i.test(face.oracle_text)) {
      return {reason: 'double-faced-card-needs-face-transition-semantics'};
    }
    const normal = {...card, ...face, layout: 'normal', card_faces: undefined};
    for (const field of ['mana_cost', 'power', 'toughness', 'loyalty', 'defense']) {
      if (face[field] === undefined) delete normal[field];
    }
    const result = helpers.compile(normal);
    if (!result?.semanticClass) return {reason: 'double-faced-card-needs-complete-' + (index ? 'back' : 'front') + '-semantics'};
    const raw = helpers.raw(normal);
    if (Array.isArray(face.colors) || Array.isArray(face.color_indicator)) raw.colorsOverride = [...(face.color_indicator || face.colors)];
    faces.push({key: index ? 'back' : 'front', raw, semanticClass: result.semanticClass,
      implementedKeywords: result.implementedKeywords || [], implementation: result.implementation || [], oracleContracts: result.oracleContracts || [], rulesCore: result.rulesCore || ''});
  }
  if (faces[0].raw.name === faces[1].raw.name) return {reason: 'double-faced-card-faces-must-have-distinct-names'};
  return {semanticClass: faces[0].semanticClass, implementedKeywords: [],
    implementation: [{kind: 'double-faced-v8', layout: 'modal_dfc', faces, contract: 'double-faced-card'}],
    oracleContracts: ['double-faced-card'], rulesCore: faces.map(face => face.raw.name + ': ' + face.rulesCore).join('\n')};
}
