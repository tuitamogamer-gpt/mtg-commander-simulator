import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
const MTG=fixtureEngine([
 ['Counter Any Self','{1}, Remove two counters from this creature: Draw a card.','Creature — Bear','{G}'],
 ['Counter Typed','{G}, Remove a +1/+1 counter from a creature you control: Draw a card.','Enchantment','{G}'],
 ['Counter Among','{G}, Remove two +1/+1 counters from among creatures you control: Draw a card.','Enchantment','{G}'],
 ['Counter Other','{T}, Remove a counter from another permanent you control: Draw a card.','Artifact','{G}'],
 ['Counter Union','{R}, Remove a +1/+1 counter or a charge counter from a permanent you control: Draw a card.','Artifact','{G}'],
 ['Counter Modal','{T}, Remove a counter from a permanent you control: Choose one —\n• Draw a card.\n• You gain 2 life.','Artifact','{G}'],
 ['Counter Named','Remove three oil counters from Counter Named: Draw a card.','Creature — Bear','{G}'],
 ['Counter Fixture','','Artifact Creature — Bear','{0}'],
 ['Counter Ordinary Mana','{T}: Add {G}.','Artifact Creature — Bear','{0}'],
]);
const own=(ctx,name='Counter Fixture')=>put(MTG,ctx.game,ctx.a,name);
const raw=ctx=>({card:ctx.source,ability:ctx.source.def.abilities[0],idx:0});
const entry=ctx=>ctx.game.activatableList(ctx.a).find(row=>row.card===ctx.source&&row.ability===raw(ctx).ability);
function ready(role,name){const ctx=context(MTG,role);ctx.a.pool={W:0,U:0,B:0,R:1,G:1,C:1};return{...ctx,source:own(ctx,name)};}
const rows=ctx=>ctx.game.stack.find(so=>so.kind==='ability'&&so.srcCard===ctx.source)?.ctx.oracleCounterPayment;
for(const role of ['human','ai']){
 test(`Counter cost ${role}: source can pay a fixed amount using different counter kinds`,async()=>{
  const ctx=ready(role,'Counter Any Self');ctx.source.counters.charge=1;ctx.game.recalc();assert.equal(entry(ctx),undefined);assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),false);assert.equal(ctx.a.pool.C,1);
  ctx.source.counters.oil=1;ctx.game.recalc();assert.ok(entry(ctx));assert.equal(await ctx.game.activateAbility(ctx.a,entry(ctx)),true);assert.equal(ctx.source.counters.oil||0,0);assert.equal(ctx.source.counters.charge||0,0);assert.equal(rows(ctx).reduce((n,row)=>n+row.n,0),2);assert.equal(ctx.a.pool.C,0);
  const so=ctx.game.stack.find(so=>so.srcCard===ctx.source);assert.equal(await ctx.game.counterStackObject(so),true);await settle(ctx.game);assert.equal(ctx.a.hand.length,0);assert.equal(ctx.source.counters.charge||0,0);
 });
 test(`Counter cost ${role}: among allows two permanents and exact types exclude opponents`,async()=>{
  const ctx=ready(role,'Counter Among'),first=own(ctx),second=own(ctx),opponent=put(MTG,ctx.game,ctx.b,'Counter Fixture');first.counters['+1/+1']=1;opponent.counters['+1/+1']=9;second.counters.charge=5;ctx.game.recalc();assert.equal(entry(ctx),undefined);
  second.counters['+1/+1']=1;ctx.game.recalc();assert.equal(await ctx.game.activateAbility(ctx.a,entry(ctx)),true);assert.equal(first.counters['+1/+1']||0,0);assert.equal(second.counters['+1/+1']||0,0);assert.equal(second.counters.charge,5);assert.equal(opponent.counters['+1/+1'],9);assert.equal(new Set(rows(ctx).map(row=>row.iid)).size,2);await settle(ctx.game);assert.equal(ctx.a.hand.length,1);
 });
 test(`Counter cost ${role}: another excludes source and a typed union excludes unprinted counter kinds`,async()=>{
  const ctx=ready(role,'Counter Other');ctx.source.counters.charge=1;assert.equal(entry(ctx),undefined);const other=own(ctx);other.counters.stun=1;ctx.game.recalc();assert.equal(await ctx.game.activateAbility(ctx.a,entry(ctx)),true);assert.equal(other.counters.stun||0,0);assert.equal(ctx.source.counters.charge,1);assert.equal(ctx.source.tapped,true);await settle(ctx.game);
  const union=ready(role,'Counter Union'),fodder=own(union);fodder.counters.oil=4;assert.equal(entry(union),undefined);fodder.counters.charge=1;assert.equal(await union.game.activateAbility(union.a,entry(union)),true);assert.equal(fodder.counters.oil,4);assert.equal(fodder.counters.charge||0,0);await settle(union.game);
 });
 test(`Counter cost ${role}: mana planner reserves counters while allowing a separate tap ability on the same permanent`,async()=>{
  const ctx=ready(role,'Counter Typed');ctx.a.pool={W:0,U:0,B:0,R:0,G:0,C:0};const mana=own(ctx,'Counter Ordinary Mana');mana.counters['+1/+1']=1;
  assert.equal(await ctx.game.activateAbility(ctx.a,entry(ctx)),true);assert.equal(mana.tapped,true);assert.equal(mana.counters['+1/+1']||0,0);await settle(ctx.game);
  const blocked=ready(role,'Counter Typed');blocked.a.pool={W:0,U:0,B:0,R:0,G:0,C:0};const resource=own(blocked,'Counter Ordinary Mana');resource.def={...resource.def,mana:[{produce:[{G:1}],cost:{tap:true,rmCounter:{kind:'+1/+1',n:1}}}]};resource.counters['+1/+1']=1;blocked.game.recalc();
  assert.equal(entry(blocked),undefined);assert.equal(await blocked.game.activateAbility(blocked.a,raw(blocked)),false);assert.equal(resource.tapped,false);assert.equal(resource.counters['+1/+1'],1);
  resource.counters['+1/+1']=2;blocked.game.recalc();assert.ok(entry(blocked));assert.equal(await blocked.game.activateAbility(blocked.a,entry(blocked)),true);assert.equal(resource.counters['+1/+1']||0,0);assert.equal(rows(blocked)[0].n,1);await settle(blocked.game);
 });
}
test('Counter cost rejects stale selected object, invalid choice count and disappearing counter before any mana/tap payment',async()=>{
 const ctx=ready('human','Counter Other'),other=own(ctx);other.counters.charge=1;const decide=ctx.a.controller.decide.bind(ctx.a.controller);
 ctx.a.controller.decide=async(g,q)=>{const answer=await decide(g,q);if(q.type==='chooseCards'){await g.move(other,'exile');await g.move(other,'battlefield');other.counters.charge=1;}return answer;};assert.equal(await ctx.game.activateAbility(ctx.a,raw(ctx)),false);assert.equal(ctx.source.tapped,false);
 const changed=ready('human','Counter Typed'),candidate=own(changed);candidate.counters['+1/+1']=1;changed.a.controller.decide=async()=>{candidate.counters['+1/+1']=0;return[candidate];};assert.equal(await changed.game.activateAbility(changed.a,raw(changed)),false);assert.equal(changed.a.pool.G,1);
 const invalid=ready('human','Counter Other'),card=own(invalid);card.counters.charge=1;invalid.a.controller.decide=async()=>[card,card];assert.equal(await invalid.game.activateAbility(invalid.a,raw(invalid)),false);assert.equal(invalid.source.tapped,false);
});
test('Counter cost named source and both modal choices use the real Stack payment',async()=>{
 const named=ready('human','Counter Named');named.source.counters.oil=3;assert.equal(await named.game.activateAbility(named.a,entry(named)),true);assert.equal(named.source.counters.oil||0,0);await settle(named.game);
 for(const index of [0,1]){const ctx=ready('human','Counter Modal'),other=own(ctx);other.counters.charge=1;const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=async(g,q)=>q.aiHint?.kind==='mode'?String(index):decide(g,q);const life=ctx.a.life;assert.equal(await ctx.game.activateAbility(ctx.a,entry(ctx)),true);assert.equal(other.counters.charge||0,0);await settle(ctx.game);assert.equal(ctx.a.hand.length,index?0:1);assert.equal(ctx.a.life,life+(index?2:0));}
});
test('Counter cost rejects unknown quantity, unsupported zone and overlapping additional costs',()=>{
 for(const cost of ['Remove X counters from this creature','Remove a counter from target creature','Remove a time counter from a permanent you control or suspended card you own','{G}, Sacrifice this creature, Remove a counter from another creature you control'])assert.equal(!!semanticClass({name:'Unknown Counter',layout:'normal',type_line:'Creature — Bear',mana_cost:'{G}',oracle_text:`${cost}: Draw a card.`,power:'2',toughness:'3'}).semanticClass,false);
 assert.equal(!!semanticClass({name:'Unsupported Counter Mana',layout:'normal',type_line:'Artifact',mana_cost:'{1}',oracle_text:'{T}, Remove a counter from another permanent you control: Add {G}.'}).semanticClass,false);
});
