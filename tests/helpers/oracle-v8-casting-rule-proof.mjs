import assert from 'node:assert/strict';
import {stageCondition,stageCount,countValue} from './oracle-v5-proof.mjs';
import {stageCastingLimitCondition,stageFalseCastingLimitCondition} from './oracle-v8-casting-limits-proof.mjs';

// The v5 fixture dispatcher calls these before its historical switch. Return
// false/undefined for historical descriptors so existing proofs keep their path.
export function stageCastingRuleCondition(MTG,ctx,condition,source,h){
 if(stageCastingLimitCondition(MTG,ctx,condition))return true;
 if(condition?.kind==='casting-opponent-upkeep-v8'){ctx.game.turnPlayer=ctx.b;ctx.game.phase='upkeep';return true;}
 if(condition?.kind!=='casting-turn-stat-v8')return false;
 const p=condition.players==='you'?ctx.a:ctx.b;
 if(condition.field==='creatureEntries')p.turnState.permanentEntries=Array.from({length:condition.min},(_,i)=>({iid:'casting-proof-entry-'+i,zoneVersion:1,creature:true,nonland:true}));
 else p.turnState[condition.field]=condition.min;
 return true;
}

export function stageCastingRuleCount(MTG,ctx,node,h){
 const {game,a,b}=ctx;
 if(node?.kind==='casting-turn-count-v8'){
  const selected=node.players==='you'?[a]:game.alivePlayers().filter(p=>node.players==='all'||p!==a);
  for(const p of selected)p.turnState[node.field]=3;return true;
 }
 if(node?.kind!=='casting-live-count-v8')return false;
 if(node.what==='land-names')for(const name of ['Forest','Island','Forest'])h.permanent(MTG,game,a,name);
 else if(node.what==='modified-creatures')for(let i=0;i<3;i++){
  const card=h.permanent(MTG,game,a,h.fixtureDefinition('Modified casting fixture '+i,['Creature'],{power:'2',toughness:'3'}));
  game.addCounters(card,'+1/+1',1,false,a);
 }
 else if(node.what==='creature-types')for(const type of ['Elf','Goblin','Human'])h.permanent(MTG,game,a,h.fixtureDefinition('Casting type '+type,['Creature'],{subtypes:[type],power:'2',toughness:'3'}));
 else if(node.what==='own-exile-grave-spells-adventures')for(const zone of ['exile','graveyard'])for(const name of ['Lightning Bolt','Divination'])h.zoneCard(MTG,a,name,zone);
 else assert.fail('Unknown casting count fixture '+node.what);
 game.recalc();return true;
}

export function castingRuleCountValue(ctx,source,node){
 const {game,a}=ctx;
 if(node?.kind==='casting-turn-count-v8')return game.alivePlayers().filter(p=>node.players==='all'||(node.players==='you'?p===a:p!==a)).reduce((n,p)=>n+(node.distinct?Number((p.turnState[node.field]||0)>0):(p.turnState[node.field]||0)),0);
 if(node?.kind!=='casting-live-count-v8')return undefined;
 if(node.what==='land-names')return new Set(game.lands(a).map(card=>card.name)).size;
 if(node.what==='modified-creatures')return game.creatures(a).filter(card=>Object.values(card.counters).some(n=>n>0)||game.bf().some(attachment=>attachment.attachedTo===card.iid&&(attachment.hasSub('Equipment')||attachment.hasSub('Aura')&&attachment.ctrl===a))).length;
 if(node.what==='creature-types')return new Set(game.creatures(a).flatMap(card=>card.def.subtypes)).size;
 if(node.what==='own-exile-grave-spells-adventures')return [...a.graveyard,...a.exile].filter(card=>card.is('Instant')||card.is('Sorcery')||card.def.adventure).length;
 assert.fail('Unknown casting count witness '+node.what);
}

export function stageEntryCastingRules(MTG,ctx,entry,h){
 for(const op of entry.implementation||[])if(op.kind==='casting-restriction-v8')stageCondition(MTG,ctx,op.condition,null,h);
}

async function stageTargets(MTG,ctx,entry,source,h){
 let explicit=false;
 for(const op of entry.implementation||[]){
  if(op.kind==='spell-v4')for(const target of op.targets||[]){
   const effect=op.effects.find(effect=>effect.targetIds?.includes(target.id))||op.effects[0];
   await h.stageSpellV4Target(MTG,ctx,source,target,effect,h.spellV4TargetVariants(target)[0],0);explicit=true;
  }
  else if(op.kind.startsWith('spell-'))for(const [i,target]of(op.targets||[]).entries()){
   if(target.zone==='stack')await h.stageGenericStackTarget(MTG,ctx,target,i);else h.stageGenericTarget(MTG,ctx,target,i);explicit=true;
  }
 }
 if(explicit)return;
 const printedTarget=entry.implementation.find(op=>op.kind.startsWith('spell-')&&op.what)?.what;
 for(const [i,spec]of(ctx.game.spellTargetSpecs(source,{from:'hand'},ctx.a)||[]).entries()){
  if(spec.zone==='stack')await h.stageGenericStackTarget(MTG,ctx,{what:'spell',zone:'stack',min:1},i);
  else if(spec.what!=='player'&&spec.zone!=='player')h.stageGenericTarget(MTG,ctx,{what:printedTarget||spec.what||'creature',zone:spec.zone||'battlefield',controller:'opponent',min:1},i);
 }
}

export async function castingRulesProof(MTG,entry,operation,role,h){
 const ctx=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;
 h.fund(a,100);h.fillLibrary(MTG,a,40);h.fillLibrary(MTG,b,40);
 const source=h.zoneCard(MTG,a,entry.raw.name,'hand');
 await stageTargets(MTG,ctx,entry,source,h);
 let checks=0;
 if(operation.kind==='casting-restriction-v8'){
  stageFalseCastingLimitCondition(MTG,ctx,operation.condition);
  assert.equal(source.def.oracleCastRestriction(game,source,a),false,source.name+': initial casting restriction is unmet');
  const before=Object.values(a.pool).reduce((n,v)=>n+v,0);
  assert.equal(await game.castSpell(a,source,{from:'hand'}),false,source.name+': illegal cast is rejected');
  assert.equal(Object.values(a.pool).reduce((n,v)=>n+v,0),before,source.name+': illegal cast spends no mana');
  assert.equal(source.zone,'hand',source.name+': illegal cast keeps the source in hand');checks+=4;
  stageCondition(MTG,ctx,operation.condition,source,h);
 }
 const modifiers=operation.kind==='casting-cost-modifiers-v8'?operation.modifiers:operation.kind==='cost-modifier'?[operation]:[];
 for(const op of modifiers){if(op.condition)stageCondition(MTG,ctx,op.condition,source,h);if(op.multiplier)stageCount(MTG,ctx,op.multiplier,h);}
 h.stageCardCosts?.(MTG,ctx,entry);
 const printed=MTG.parseCost(source.def.cost),units=modifiers.map(op=>op.multiplier?countValue(ctx,source,op.multiplier):1);
 const before=Object.values(a.pool).reduce((n,v)=>n+v,0);
 assert.ok(game.castableList(a).some(row=>row.card===source),source.name+': genuinely payable cast appears');
 assert.equal(await game.castSpell(a,source,{from:'hand'}),true,source.name+': real cast succeeds');
 const stack=game.stack.find(row=>row.card===source);assert.ok(stack,source.name+': cast reaches Stack');
 // Optional printed additional costs are real announcement choices in this
 // casting-rule route too. Read the frozen Entwine cost, not the spent total.
 let additional={generic:0,pips:[]};
 if(stack.castOpts?.entwined){
  const entwine=entry.implementation.find(op=>op.kind==='mechanic-entwine');
  assert.ok(entwine,source.name+': Entwine announcement has a printed operation');
  if(entwine.cost.kind==='mana')additional=MTG.parseCost(entwine.cost.mana);
  else assert.equal(entwine.cost.kind,'sacrifice',source.name+': known nonmana Entwine cost');
 }
 const expectedGeneric=modifiers.reduce((n,op,i)=>n+(op.reductionCap!==undefined?Math.max(-op.reductionCap,op.amount*units[i]):op.amount*units[i]),printed.generic+additional.generic);
 const expectedPips=[...printed.pips,...additional.pips].map(p=>Array.from(p));
 for(const [i,op]of modifiers.entries())for(let n=0;n<units[i];n++)for(const color of op.coloredReduction||[]){const index=expectedPips.findIndex(pip=>pip.length===1&&pip[0]===color);if(index>=0)expectedPips.splice(index,1);}
 const expected=Math.max(0,expectedGeneric+printed.x*(stack.x||0))+expectedPips.length;
 assert.equal(before-Object.values(a.pool).reduce((n,v)=>n+v,0),expected,source.name+': floating mana payment matches independent printed modifiers');
 assert.equal(stack.manaSpent,expected,source.name+': Stack records exact paid mana');
 await h.resolveAll(game);
 return checks+5;
}
