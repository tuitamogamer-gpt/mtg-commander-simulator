import assert from 'node:assert/strict';
import {stageCraftMaterialsV20} from './oracle-v20-costs-proof.mjs';

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
  if(entry.oracleFlipSideV20==='back')return {...definition,...definition.c1719FlipBack};
  return entry.oracleFace ? MTG.OracleV8Faces.faceDefinition(definition.oracleFaces, entry.oracleFace) : definition;
}

export function proofEntersAsLand(MTG,entry){
  const faces=MTG.DEFS[entry.raw.name]?.oracleFaces;
  return entry.oracleLayout==='transform'&&faces?faces.faces[0].def.types.includes('Land'):entry.raw.types.includes('Land');
}

function sourceMatches(card, scope) {
  return !!scope && card?.oracleFaces?.canonicalName === scope.canonicalName;
}

export function installFaceProof(MTG, game) {
  if (!activeFaceProof) return;
  const scope = game.oracleFaceProof = {...activeFaceProof,preparedCards:new WeakSet()};
  // A transforming card is only ever cast as its front face; the other face is
  // reached on the battlefield. Its ordinary cast therefore needs no face
  // announcement and must stay visible to the cast list.
  if (scope.layout === 'transform') {
    if (scope.face === 'front') return;
    const frontDefinition=MTG.DEFS[scope.canonicalName]?.oracleFaces?.faces[0]?.def;
    if(frontDefinition?.abilities?.some(ability=>ability.oracleCraftV20)){
      const resolve=game.resolveTop;
      game.resolveTop=async function(...args){
        const spell=this.stack.at(-1),card=spell?.card,result=await resolve.apply(this,args);
        if(spell?.kind==='spell'&&sourceMatches(card,scope)&&card.zone==='battlefield'&&card.oracleFace==='front'){
          for(let i=0;i<20&&(this.stack.length||this.pendingTriggers.length);i++){await this.flushTriggers();if(this.stack.length)await resolve.call(this);}
          const player=card.ctrl,ability=card.def.abilities.find(row=>row.oracleCraftV20),materials=stageCraftMaterialsV20(MTG,this,player,card,ability.cost.craftV20),previous=player.controller.decide;
          player.controller.decide=function(g,q){if(q.aiHint?.kind==='oracleCraftV20'){const from=q.from.filter(row=>materials.includes(row));return previous.call(this,g,{...q,from,max:Math.min(q.max,from.length)});}return previous.call(this,g,q);};
          try{const action=this.activatableList(player).find(row=>row.card===card&&row.ability===ability);assert.ok(action,scope.canonicalName+': the front offers its paid Craft ability');assert.equal(await this.activateAbility(player,action),true);}
          finally{player.controller.decide=previous;}
          assert.equal(card.zone,'exile',scope.canonicalName+': Craft pays by exiling its source');
          for(let i=0;i<20&&card.zone==='exile'&&(this.stack.length||this.pendingTriggers.length);i++){await this.flushTriggers();if(this.stack.length)await resolve.call(this);}
          assert.equal(card.zone,'battlefield');assert.equal(card.oracleFace,'back',scope.canonicalName+': Craft returns the physical source transformed');
        }return result;
      };
      return;
    }
    if(frontDefinition?.auraTarget&&frontDefinition.oracleImplementation?.some(op=>JSON.stringify(op).includes('permanent-host-death-return-v20'))){
      const cast=game.castSpell,resolve=game.resolveTop;
      game.castSpell=async function(player,card,options={}){
        if(sourceMatches(card,scope)&&!this.legalTargets(frontDefinition.auraTarget[0],card,player).length){
          const host=new MTG.CardInst(MTG.DEFS['Grizzly Bears'],player);host.zone='battlefield';host.sick=false;this.battlefield.push(host);this.recalc();
        }
        return cast.call(this,player,card,options);
      };
      game.resolveTop=async function(...args){
        const spell=this.stack.at(-1),card=spell?.card,result=await resolve.apply(this,args);
        if(spell?.kind==='spell'&&sourceMatches(card,scope)&&card.zone==='battlefield'&&card.oracleFace==='front'){
          const host=this.byIid(card.attachedTo);assert.ok(host,scope.canonicalName+': the front Aura attaches through its paid spell');
          await this.destroy(host);await this.flushTriggers();
          for(let i=0;i<20&&(this.stack.length||this.pendingTriggers.length);i++){if(this.stack.length)await resolve.call(this);await this.flushTriggers();}
          assert.equal(card.zone,'battlefield');assert.equal(card.oracleFace,'back',scope.canonicalName+': the printed host-death ability returns the Aura transformed');
        }return result;
      };
      return;
    }
    if(MTG.DEFS[scope.canonicalName]?.oracleFaces?.faces[0]?.def.bomDisturb){
      const cast=game.castSpell;
      game.castSpell=async function(player,card,options={}){
        if(!sourceMatches(card,scope))return cast.call(this,player,card,options);
        if(card.zone!=='graveyard')await this.move(card,'graveyard');
        const offered=this.castableList(player).find(row=>row.card===card&&row.alt?.bomKind==='disturb');
        assert.ok(offered,scope.canonicalName+': Disturb reaches the back through its printed paid graveyard cast');
        return cast.call(this,player,card,{...options,from:'graveyard',alt:offered.alt});
      };
      return;
    }
    if(MTG.DEFS[scope.canonicalName]?.oracleFaces?.faces[0]?.def.bomDaybound){game.bomDayNight='night';return;}
    if(MTG.DEFS[scope.canonicalName]?.oracleFaces?.faces[0]?.def.saga){
      const resolve=game.resolveTop;
      game.resolveTop=async function(...args){
        const spell=this.stack.at(-1),card=spell?.card,result=await resolve.apply(this,args);
        if(spell?.kind==='spell'&&sourceMatches(card,scope)&&card.zone==='battlefield'&&card.oracleFace==='front'){
          for(let i=0;i<20&&card.zone==='battlefield'&&card.oracleFace==='front';i++){
            await this.flushTriggers();
            if(this.stack.at(-1)?.sagaChapter?.iid===card.iid)await resolve.call(this);
            else if(!this.stack.some(s=>s.srcCard===card))await this.sagaChapter(card);
            else break;
          }
          assert.equal(card.oracleFace,'back',scope.canonicalName+': the printed final chapter exiles and returns this Saga transformed');
        }return result;
      };
      return;
    }
    // The back face is proved where it is actually reachable: the physical card
    // is cast or played normally and then turns to its printed back face, the
    // same transition the printed transform ability performs.
    const originalMove = game.move;
    game.move = async function (card, toZone, ...rest) {
      const result = await originalMove.call(this, card, toZone, ...rest);
      if (sourceMatches(card, scope) && card.zone === 'battlefield' && card.oracleFace !== 'back' && !scope.preparedCards.has(card)) {
        assert.equal(MTG.OracleV8Faces.setFace(card, 'back'), true,
          scope.canonicalName + ': the permanent turns to its printed back face');
        card.oracleTransformCount = (card.oracleTransformCount || 0) + 1;
        scope.preparedCards.add(card);
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
  scope.preparedCards.add(card);
}

export function assertFaceZoneCard(game, card) {
  if (!sourceMatches(card, game.oracleFaceProof) || ['stack', 'battlefield'].includes(card.zone)) return;
  assert.equal(card.oracleFace, 'front', 'off-Stack face proof fixture retains actual front characteristics');
}
