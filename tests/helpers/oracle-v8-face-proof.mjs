import assert from 'node:assert/strict';

let activeFaceProof = null;

export function faceProofEntry(entry, face, layout = 'modal_dfc') {
  return {...entry, semanticClass: face.semanticClass, implementedKeywords: face.implementedKeywords || [],
    implementation: face.implementation || [], oracleContracts: face.oracleContracts || [], rulesCore: face.rulesCore,
    raw: {...face.raw, name: entry.raw.name}, oracleFace: face.key, oraclePrintedName: face.raw.name, oracleLayout: layout};
}

export async function withFaceProof(entry, run) {
  const previous = activeFaceProof;
  activeFaceProof = {canonicalName: entry.raw.name, face: entry.oracleFace, printedName: entry.oraclePrintedName,
    layout: entry.oracleLayout || 'modal_dfc'};
  try {return await run();} finally {activeFaceProof = previous;}
}

export function proofDefinition(MTG, entry) {
  const definition = MTG.DEFS[entry.raw.name];
  return entry.oracleFace ? MTG.OracleV8Faces.faceDefinition(definition.oracleFaces, entry.oracleFace) : definition;
}

function sourceMatches(card, scope) {
  return !!scope && card?.oracleFaces?.canonicalName === scope.canonicalName;
}

export function installFaceProof(MTG, game) {
  if (!activeFaceProof) return;
  const scope = game.oracleFaceProof = {...activeFaceProof};
  // A transforming card is only ever cast as its front face; the other face is
  // reached on the battlefield. Its ordinary cast therefore needs no face
  // announcement and must stay visible to the cast list.
  if (scope.layout === 'transform') {
    if (scope.face === 'front') return;
    // The back face is proved where it is actually reachable: the physical card
    // is cast or played normally and then turns to its printed back face, the
    // same transition the printed transform ability performs.
    const originalMove = game.move;
    game.move = async function (card, toZone, ...rest) {
      const result = await originalMove.call(this, card, toZone, ...rest);
      if (sourceMatches(card, scope) && card.zone === 'battlefield' && card.oracleFace !== 'back') {
        assert.equal(MTG.OracleV8Faces.setFace(card, 'back'), true,
          scope.canonicalName + ': the permanent turns to its printed back face');
        card.oracleTransformCount = (card.oracleTransformCount || 0) + 1;
        this.recalc();
      }
      return result;
    };
    return;
  }
  const originalCast = game.castSpell, originalLand = game.playLand, originalCost = game.spellCost, originalList = game.castableList;
  // Keep the real physical CardInst and its front definition in hand. Only
  // the announced face is selected, through the same engine option as UI/AI.
  game.castSpell = async function (player, card, options = {}) {
    if (!sourceMatches(card, scope)) return originalCast.call(this, player, card, options);
    const physical = card.oracleFaces;
    const result = await originalCast.call(this, player, card, {...options, alt: {...options.alt, oracleFace: scope.face}});
    assert.equal(card.oracleFaces, physical, scope.canonicalName + ': casting preserves the physical two-face identity');
    if (result) assert.equal(card.oracleFace, scope.face, scope.canonicalName + ': actual cast selects ' + scope.face);
    return result;
  };
  game.playLand = async function (player, card, options = {}) {
    if (!sourceMatches(card, scope)) return originalLand.call(this, player, card, options);
    const result = await originalLand.call(this, player, card, {...options, oracleFace: scope.face});
    if (result) assert.equal(card.oracleFace, scope.face, scope.canonicalName + ': actual land action selects ' + scope.face);
    return result;
  };
  game.spellCost = function (player, card, options = {}) {
    return originalCost.call(this, player, card, sourceMatches(card, scope) && options.oracleFace === undefined ? {...options, oracleFace: scope.face} : options);
  };
  game.castableList = function (player) {
    return originalList.call(this, player).filter(row => !sourceMatches(row.card, scope) || row.alt?.oracleFace === scope.face);
  };
}

export function selectFixtureFace(MTG, game, card) {
  const scope = game.oracleFaceProof;
  if (card.zone !== 'battlefield' || !sourceMatches(card, scope)) return;
  assert.equal(MTG.OracleV8Faces.setFace(card, scope.face), true);
}

export function assertFaceZoneCard(game, card) {
  if (!sourceMatches(card, game.oracleFaceProof) || ['stack', 'battlefield'].includes(card.zone)) return;
  assert.equal(card.oracleFace, 'front', 'off-Stack face proof fixture retains actual front characteristics');
}
