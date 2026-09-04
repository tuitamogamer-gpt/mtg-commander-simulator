import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
const MTG=fixtureEngine([
 ['Awaken Draw','Draw two cards.\nAwaken 4—{5}{U}','Sorcery','{1}{U}'],
 ['Awaken Bounce',"Return target creature to its owner's hand.\nAwaken 3—{4}{U}",'Sorcery','{U}'],
 ['Awaken Counters','Put two +1/+1 counters on target permanent.\nAwaken 4—{6}{G}','Sorcery','{1}{G}'],
 ['Awaken Wipe','Destroy all nonland creatures.\nAwaken 4—{5}{W}{W}{W}','Sorcery','{3}{W}{W}'],
 ['Awaken Counter','Counter target spell.\nAwaken 3—{4}{U}{U}','Instant','{1}{U}{U}'],
]);
const own=(ctx,name,zone='battlefield')=>put(MTG,ctx.game,ctx.a,name,zone);
function ready(role,name='Awaken Draw'){const ctx=context(MTG,role);ctx.a.pool={W:10,U:10,B:10,R:10,G:10,C:20};return{...ctx,source:own(ctx,name,'hand')};}
const alternate=ctx=>ctx.source.def.altCosts.find(option=>option.oracleAwaken);
const cast=ctx=>ctx.game.castSpell(ctx.a,ctx.source,{from:'hand',alt:alternate(ctx)});
const stack=ctx=>ctx.game.stack.find(so=>so.card===ctx.source);
for(const role of ['human','ai']){
 test(`Awaken ${role}: alternative is paid, land is a mandatory target, animation persists and zone identity expires it`,async()=>{
  const ctx=ready(role),land=own(ctx,'Forest');land.sick=true;
  const option=ctx.game.castableList(ctx.a).find(row=>row.card===ctx.source&&row.alt?.oracleAwaken);assert.ok(option);
  assert.equal(await cast(ctx),true);const so=stack(ctx);assert.equal(so.manaSpent,6);assert.equal(so.targets.length,1);assert.equal(so.targets[0],land);assert.equal(land.is('Creature'),false);
  await settle(ctx.game);assert.equal(ctx.a.hand.length,2);assert.equal(land.is('Land'),true);assert.equal(land.is('Creature'),true);assert.equal(land.hasSub('Forest'),true);assert.equal(land.hasSub('Elemental'),true);assert.equal(land.kw('haste'),true);assert.equal(land.counters['+1/+1'],4);assert.equal(land.power,4);assert.equal(land.toughness,4);assert.equal(land.def.types.includes('Creature'),false);
  await ctx.game.emit('endStep',{player:ctx.a});await settle(ctx.game);ctx.game.turnNo++;ctx.game.recalc();assert.equal(land.is('Creature'),true);assert.equal(land.kw('haste'),true);
  await ctx.game.move(land,'exile');await ctx.game.move(land,'battlefield');assert.equal(land.is('Creature'),false);assert.equal(land.counters['+1/+1']||0,0);
 });
 test(`Awaken ${role}: normal cast needs no land and pays printed cost`,async()=>{
  const ctx=ready(role);assert.ok(ctx.game.castableList(ctx.a).some(row=>row.card===ctx.source&&!row.alt));assert.equal(ctx.game.castableList(ctx.a).some(row=>row.card===ctx.source&&row.alt?.oracleAwaken),false);
  assert.equal(await cast(ctx),false);assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand'}),true);assert.equal(stack(ctx).manaSpent,2);assert.equal(stack(ctx).targets.length,0);await settle(ctx.game);assert.equal(ctx.a.hand.length,2);
 });
 test(`Awaken ${role}: a missing original target or opponent land cannot replace either mandatory target`,async()=>{
  const ctx=ready(role,'Awaken Bounce'),land=own(ctx,'Forest');assert.equal(await cast(ctx),false);const creature=put(MTG,ctx.game,ctx.b,'Grizzly Bears');await ctx.game.move(land,'hand');put(MTG,ctx.game,ctx.b,'Forest');assert.equal(await cast(ctx),false);
  await ctx.game.move(land,'battlefield');assert.equal(await cast(ctx),true);assert.equal(stack(ctx).targets.length,2);assert.equal(stack(ctx).targets[0],creature);assert.equal(stack(ctx).targets[1],land);await settle(ctx.game);assert.equal(creature.zone,'hand');assert.equal(land.power,3);
 });
 test(`Awaken ${role}: one illegal target preserves the other effect and all illegal targets stop the whole spell`,async()=>{
  const ctx=ready(role,'Awaken Bounce'),land=own(ctx,'Forest'),creature=put(MTG,ctx.game,ctx.b,'Grizzly Bears');assert.equal(await cast(ctx),true);await ctx.game.move(creature,'exile');await settle(ctx.game);assert.equal(land.power,3);
  const second=ready(role,'Awaken Bounce'),secondLand=own(second,'Forest'),secondCreature=put(MTG,second.game,second.b,'Grizzly Bears');assert.equal(await cast(second),true);await second.game.move(secondLand,'exile');await second.game.move(secondLand,'battlefield');await settle(second.game);assert.equal(secondCreature.zone,'hand');assert.equal(secondLand.is('Creature'),false);
  const third=ready(role),thirdLand=own(third,'Forest');assert.equal(await cast(third),true);await third.game.move(thirdLand,'exile');await settle(third.game);assert.equal(third.a.hand.length,0);assert.equal(third.source.zone,'graveyard');
 });
}
test('Awaken rejects forged reduced cost, bare effect flag, free alternative and stale source without payment',async()=>{
 const ctx=ready('human');own(ctx,'Forest');const before=JSON.stringify(ctx.a.pool);
 for(const alt of [{oracleAwaken:true},{...alternate(ctx),free:true},{...alternate(ctx),altCostStr:'{0}'},{altCostStr:'{5}{U}'}])assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand',alt}),false);
 assert.equal(JSON.stringify(ctx.a.pool),before);const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=async(g,q)=>{const answer=await decide(g,q);if(q.type==='chooseTargets'){await g.move(ctx.source,'exile');await g.move(ctx.source,'hand');}return answer;};assert.equal(await cast(ctx),false);assert.equal(JSON.stringify(ctx.a.pool),before);
});
test('Awaken copied spell retains paid choice and can animate its own newly chosen target without spending or casting again',async()=>{
 const ctx=ready('human'),first=own(ctx,'Forest'),second=own(ctx,'Island');assert.equal(await cast(ctx),true);const original=stack(ctx),before=JSON.stringify(ctx.a.pool),spells=ctx.a.turnState.spellsCast,decide=ctx.a.controller.decide.bind(ctx.a.controller);
 ctx.a.controller.decide=async(g,q)=>q.aiHint?.kind==='newTargets'?'yes':q.type==='chooseTargets'?[second]:decide(g,q);
 await ctx.game.copySpell(original,ctx.a,{mayNewTargets:true});const copy=ctx.game.stack.at(-1);assert.equal(copy.isCopy,true);assert.equal(copy.targets[0],second);assert.equal(copy.castOpts.oracleAwaken,true);await ctx.game.resolveTop();assert.equal(second.power,4);assert.equal(first.is('Creature'),false);assert.equal(ctx.a.turnState.spellsCast,spells);assert.equal(JSON.stringify(ctx.a.pool),before);await settle(ctx.game);assert.equal(first.power,4);assert.equal(ctx.a.hand.length,4);
});
test('Awaken counter order, existing land types/abilities/colors and complete original wipe are preserved',async()=>{
 const ctx=ready('human','Awaken Counters'),land=own(ctx,'Forest');land.def={...land.def,types:['Artifact','Land','Creature'],subtypes:['Forest','Bear'],colorsOverride:['G'],power:'2',toughness:'2'};ctx.game.recalc();assert.equal(await cast(ctx),true);assert.equal(stack(ctx).targets[0],land);assert.equal(stack(ctx).targets[1],land);await settle(ctx.game);assert.equal(land.counters['+1/+1'],6);assert.equal(land.power,6);assert.ok(['Artifact','Land','Creature'].every(type=>land.is(type)));assert.ok(['Forest','Bear','Elemental'].every(type=>land.hasSub(type)));assert.deepEqual([...land.colors],['G']);assert.ok(ctx.game.manaSources(ctx.a,null).some(source=>source.card===land));
 const wipe=ready('human','Awaken Wipe'),forest=own(wipe,'Forest'),creature=own(wipe,'Grizzly Bears'),opponent=put(MTG,wipe.game,wipe.b,'Grizzly Bears');assert.equal(await cast(wipe),true);await settle(wipe.game);assert.equal(creature.zone,'graveyard');assert.equal(opponent.zone,'graveyard');assert.equal(forest.zone,'battlefield');assert.equal(forest.power,4);
});
test('Awaken local AI executes its actual offered alternate action and commander tax remains additional',async()=>{
 const ctx=ready('ai');own(ctx,'Forest');const casts=ctx.game.castableList(ctx.a).filter(row=>row.card===ctx.source&&row.alt?.oracleAwaken);const action=await ctx.a.controller.decide(ctx.game,{type:'main',player:ctx.a,phase:ctx.game.phase,casts,acts:[],lands:[]});assert.equal(action.kind,'cast');assert.equal(action.alt.oracleAwaken,true);await ctx.game.performAction(ctx.a,action);assert.equal(stack(ctx).manaSpent,6);await settle(ctx.game);
 const tax=ready('human');own(tax,'Forest');await tax.game.move(tax.source,'command');tax.source.commander=true;tax.source.cmdCasts=2;assert.equal(await tax.game.castSpell(tax.a,tax.source,{from:'command',alt:alternate(tax)}),true);assert.equal(stack(tax).manaSpent,10);await settle(tax.game);
});
test('Awaken compiler rejects unknown, variable, modal and duplicate forms',()=>{
 for(const oracle of ['Draw a card.\nAwaken X—{3}{U}','Draw a card.\nAwaken 3—{X}{U}','Draw a card.\nAwaken 3—{3}{U} until end of turn.','Draw a card.\nAwaken 3—{3}{U}\nAwaken 4—{4}{U}','Choose one —\n• Draw a card.\n• You gain 2 life.\nAwaken 3—{3}{U}'])assert.equal(!!semanticClass({name:'Unknown Awaken',layout:'normal',type_line:'Sorcery',mana_cost:'{1}{U}',oracle_text:oracle}).semanticClass,false);
});
