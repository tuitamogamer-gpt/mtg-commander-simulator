import assert from 'node:assert/strict';
import {enterChosenColorSource} from './oracle-chosen-color-proof.mjs';
const physical=c=>c?.card||c;
function witness(M,f,source,selector,side,h,state){
 const {game,a,b}=f;
 if(selector?.ref!==undefined){const row=state?.records.get(selector.ref)?.[0];if(row)return row.card;if(selector.ref==='self')return source;if(selector.ref==='attached-host')return source.meta.cursedPlayer||game.byIid(source.attachedTo);}
 if(selector?.player)return selector.player==='you'?a:b;
 if(selector?.opponentObjects)return b;
 if(selector?.yourObjects)return a;
 if(selector?.youAndSelf)return a;
 if(selector?.filter){const c=h.stageGenericTarget(M,f,selector.filter,'damage-'+side);if(selector.filter.enteredThisTurn)c.enteredTurn=game.turnNo;return c;}
 return side==='recipient'?b:h.permanent(M,game,b,h.fixtureDefinition('Damage source witness',['Creature'],{power:'2',toughness:'20'}));
}
function expectedAmount(op,source,state){
 if(state)return state.add;
 if(typeof op.add==='number')return op.add;
 if(op.add?.kind==='source-counters')return source.counters[op.add.counter]||0;
 if(['source-stat','explicit-source-stat'].includes(op.add?.kind))return source[op.add.stat];
 return 0;
}
async function hit(M,f,source,op,h,state){
 const {game,a,b}=f,attacker=witness(M,f,source,op.source,'source',h,state);let target=witness(M,f,source,op.recipient,'recipient',h,state);
 if(op.mode==='redirect'&&op.destination.damageSourceController&&op.recipient.all&&target===attacker.ctrl)target=game.players.find(p=>p!==attacker.ctrl&&!p.lost);
 assert.ok(attacker&&target,'matching source and recipient exist');
 if(op.mode==='redirect'){
  const to=op.destination.damageSourceController?attacker.ctrl:witness(M,f,source,op.destination,'destination',h,state),life=to.life,damage=to.damage||0,oldLife=target.life,oldDamage=target.damage||0;
  assert.ok(to&&to!==target,'redirection has a distinct live destination '+JSON.stringify({source:source.name,attacker:attacker.name,controller:attacker.ctrl?.idx,target:target.name,destination:to?.name}));
  assert.equal(await game.damageAny(attacker,target,2,{combat:op.combat==='combat',deferSBA:true}),2,'redirection preserves damage amount');
  if(to instanceof M.Player)assert.equal(to.life,life-2);else assert.equal(to.damage||0,damage+2);
  if(target instanceof M.Player)assert.equal(target.life,oldLife);else assert.equal(target.damage||0,oldDamage);
  return {attacker,target,checks:4};
 }
 const before={damage:target.damage||0,life:target.life,battlefield:game.bf().filter(card=>card.ctrl===a),targetLibrary:target.library?.length,targetExile:target.exile?.length,counter:target.counters?.[op.counter||'-1/-1']||0,plus:target.counters?.['+1/+1']||0,sourceHand:attacker.ctrl.hand.length,ownLife:a.life,library:a.library.length,exile:a.exile.length,opponentLibrary:b.library.length,sourceCounter:source.counters[op.rider?.counter]||0};
 const n=op.mode==='prevent'&&state&&Number.isFinite(state.remaining)?Math.max(1,Math.min(2,state.remaining)):2,prevented=op.mode==='prevent'?op.n==='all'?n:Math.min(n,state?.remaining??op.n):0,expected=op.mode==='modify'?n*op.factor+expectedAmount(op,source,state):['counters','exile-player-library','sacrifice-controller'].includes(op.mode)?0:n-prevented;
 const actual=await game.damageAny(attacker,target,n,{combat:op.combat==='combat',deferSBA:true});assert.equal(actual,expected,'exact damage after the printed replacement');
 if(op.mode==='counters')assert.equal(target.counters[op.counter||'-1/-1'],before.counter+n,'damage becomes exactly that many printed counters');
 else if(op.mode==='exile-player-library'){assert.equal(target.library.length,before.targetLibrary-n);assert.equal(target.exile.length,before.targetExile+n);assert.equal(target.life,before.life);}
 else if(op.mode==='sacrifice-controller')assert.equal(before.battlefield.filter(card=>card.zone==='graveyard').length,Math.min(n,before.battlefield.length),'damage is replaced by exactly the required sacrifices');
 else if(!(target instanceof M.Player))assert.equal(target.damage||0,before.damage+expected,'exact damage is marked on the permanent');
 if(op.rider){const r=op.rider,amount=(r.basis==='attempted'?n:prevented)*(r.factor||1);if(r.kind==='gain-life')assert.equal(a.life,before.ownLife+amount-(target===a?expected:0),'exact life gained from prevention');else if(r.kind==='draw-source-controller')assert.equal(attacker.ctrl.hand.length,before.sourceHand+amount,'the damage source controller draws exactly the prevented amount');else if(r.kind==='source-counter')assert.equal(source.counters[r.counter],before.sourceCounter+r.n,'exact printed source counter');else if(r.kind==='target-counter')assert.equal(target.counters[r.counter],before.plus+amount,'counters equal damage prevented');else if(r.kind==='mill')assert.equal((r.opponents?b:a).library.length,(r.opponents?before.opponentLibrary:before.library)-amount,'exact printed mill');else if(r.kind==='exile-library')assert.equal(a.exile.length,before.exile+amount,'exact library exile');}
 return {attacker,target,checks:3+(op.rider?1:0)};
}
export async function operationProofV20(M,entry,op,role,h){
 if(op.kind==='spell-keywords-v20'){
  const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.assertControllerRole(M,f,entry.raw.name);h.fund(a,100);
  const source=h.permanent(M,game,a,entry.raw.name),victim=h.permanent(M,game,b,h.fixtureDefinition('Spell keyword victim',['Creature'],{power:'1',toughness:'20'}));
  const definition=h.fixtureDefinition('Spell keyword witness',['Instant'],{cost:'{'+(op.colors?.[0]||'R')+'}',resolve:async ctx=>{assert.equal(game.damageSourceTrait(ctx.src,op.keywords[0]),true);await game.damageAny(ctx.src,victim,1);}}),spell=h.zoneCard(M,a,definition,'hand'),life=a.life;
  assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await h.resolveAll(game);
  if(op.keywords.includes('deathtouch'))assert.equal(victim.zone,'graveyard');
  if(op.keywords.includes('lifelink'))assert.equal(a.life,life+1);
  if(op.keywords.some(k=>['wither','infect'].includes(k)))assert.equal(victim.counters['-1/-1'],1);
  M.OracleV8AbilityLoss.add(game,[source],{});const probe=h.zoneCard(M,a,definition,'hand');probe.zone='stack';assert.equal(M.OracleV20Damage.spellKeyword(game,probe,op.keywords[0]),false);probe.zone='hand';return 4;
 }
 if(op.kind==='state-trigger-v8'&&op.state.count?.kind==='source-counters'&&entry.implementation.some(x=>x.kind==='damage-rule-v20'&&x.rider?.kind==='source-counter')){
  const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.assertControllerRole(M,f,entry.raw.name);h.fillLibrary(M,a,40);h.fillLibrary(M,b,40);h.fund(a,100);
  const source=h.zoneCard(M,a,entry.raw.name,'hand'),attacker=h.permanent(M,game,b,'Grizzly Bears');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);
  for(let i=1;i<=op.state.min;i++){assert.equal(await game.damageAny(attacker,a,1),0);assert.equal(source.counters[op.state.count.counter],i);await game.flushTriggers();if(i<op.state.min)assert.equal(game.stack.length,0);}
  assert.equal(game.stack.filter(s=>s.oracleStateTrigger&&s.srcCard===source).length,1);await game.resolveTop();assert.equal(source.zone,'exile');await h.resolveAll(game);assert.equal(a.lost,true);return 5+op.state.min*2;
 }
 if(op.kind!=='damage-rule-v20')return null;
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.assertControllerRole(M,f,entry.raw.name);for(const p of game.players)h.fillLibrary(M,p,40);
 const source=h.permanent(M,game,a,entry.raw.name);if(op.add?.kind==='source-counters')source.counters[op.add.counter]=3;
 if(op.mode==='sacrifice-controller'){for(let i=0;i<3;i++)h.permanent(M,game,a,h.fixtureDefinition('Sacrifice witness '+i,['Artifact'],{cost:'{0}'}));game.battlefield.splice(game.battlefield.indexOf(source),1);game.battlefield.push(source);}
 if(op.condition)h.stageCondition(M,f,op.condition,source);
 if(op.recipient?.ref==='attached-host'||op.source?.ref==='attached-host'){const aura=entry.implementation.find(x=>x.kind==='aura-target');if(aura?.targetV9?.zone==='player')source.meta.cursedPlayer=b;else {const host=h.permanent(M,game,a,h.fixtureDefinition('Damage attachment host',['Creature'],{power:'2',toughness:'20'}));source.attachedTo=host.iid;host.attachments.push(source.iid);}}
 if(entry.implementation.some(row=>row.kind==='chosen-color-entry-v8'))await enterChosenColorSource(M,f,entry,source,h);
 game.recalc();const result=await hit(M,f,source,op,h);M.OracleV8AbilityLoss.add(game,[source],{});
 assert.equal(await game.damageAny(result.attacker,result.target.zone==='graveyard'?a:result.target,1,{combat:op.combat==='combat',deferSBA:true}),1,'ability loss removes this replacement');return result.checks+1;
}
export function stageDamageEffectV20(M,f,e,h){
 if(e.action==='choose-damage-source-v20'){h.permanent(M,f.game,f.b,h.fixtureDefinition('Qualified damage source witness',['Creature'],{power:'8',toughness:'40',colorsOverride:['W','U','B','R','G'],kws:['shadow','changeling'],subtypes:['Elf']}));return true;}
 if(e.action!=='damage-rule-v20')return false;
 const target=physical(h.stagedTargets?.[e.sourceTarget]);
 if(target?.zone==='battlefield'&&e.mode==='redirect'&&e.destination?.damageSourceController&&e.recipient?.player==='you'){target.ctrl=f.b;target.attacking=f.a;f.game.recalc();}
 if(target?.zone==='stack'&&target.name.startsWith('V6 stack target')){
  const row={effect:e,card:target,player:f.a,hits:[]};(f.damageSpellFixturesV20||=[]).push(row);target.def.resolve=async ctx=>{row.life=f.a.life;row.hits.push(await ctx.g.damageAny(ctx.src,f.a,3));row.after=f.a.life;};
 }
 return true;
}
export async function assertDamageEffectV20(M,f,entry,e,source,targets,damagedPlayer,before,trace,label,h){
 if(e.action==='choose-damage-source-v20'){const state=f.game.untilEffects.findLast(s=>s.kind==='oracleChosenSourcePrevention'&&s.sourceCard===source);assert.ok(state,label+': actual source choice made a shield');const selected=state.sourceRecord.card;assert.ok(trace.some(row=>row.query.aiHint?.kind==='damagePreventionSource'));if(e.quality.keyword)assert.ok(selected.kw(e.quality.keyword));if(e.quality.subtype)assert.ok(selected.hasSub(state.effect.quality.subtype));if(e.quality.chosenColorV10)assert.ok(selected.colors.includes(state.effect.quality.colors[0]));assert.equal(await f.game.damageAny(selected,f.a,2),0);assert.equal(state.consumed,true);assert.equal(await f.game.damageAny(selected,f.a,2),2);return true;}
 if(e.action!=='damage-rule-v20')return false;
 const state=f.game.untilEffects.findLast(s=>s.kind==='oracleDamageRuleV20'&&s.source.iid===source.iid&&JSON.stringify(s.op)===JSON.stringify(e));assert.ok(state,label+': actual resolution installed the printed damage rule');
 const spell=f.damageSpellFixturesV20?.find(r=>JSON.stringify(r.effect)===JSON.stringify(e));
 if(spell){assert.deepEqual(spell.hits,[0],label+': targeted spell dealt no damage');if(e.rider?.kind==='gain-life')assert.equal(spell.after,spell.life+3,label+': actual prevented damage gained as life');return true;}
 await hit(M,f,source,e,h,state);return true;
}
