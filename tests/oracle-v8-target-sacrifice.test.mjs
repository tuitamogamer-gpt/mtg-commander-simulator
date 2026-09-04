import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';

const text='Target creature you control deals damage equal to its power to any other target. Then sacrifice it.';
const input={name:'Callous Sell-Sword // Burn Together',layout:'adventure',type_line:'Creature — Human Soldier // Sorcery — Adventure',card_faces:[
  {name:'Callous Sell-Sword',type_line:'Creature — Human Soldier',mana_cost:'{1}{B}',power:'2',toughness:'2',oracle_text:'This creature enters with a +1/+1 counter on it for each creature that died under your control this turn.'},
  {name:'Burn Together',type_line:'Sorcery — Adventure',mana_cost:'{R}',oracle_text:text}
]};
const semantic=semanticClass(input,{compilerVersion:8});
assert.ok(semantic.semanticClass,semantic.reason);
const adventure=semantic.implementation.find(op=>op.kind==='adventure-face');
assert.deepEqual(adventure.effects.at(-1),{action:'sacrifice-target-v8',target:0});
assert.equal(adventure.targets[1].differentFromPrevious,true);
const MTG=fixtureEngine([['Sacrifice Donor','','Creature — Bear','{2}']]);
const fixtureName='Target Sacrifice Callous Sell-Sword';
MTG.registerOracleBatch({id:'oracle-v8-target-sacrifice-test',sequence:99994,cards:[{position:1,oracleId:input.name,scryfallId:input.name,...semantic,
  raw:{name:fixtureName,oracle:input.card_faces[0].oracle_text,cost:'{1}{B}',types:['Creature'],subtypes:['Human','Soldier'],super:[],power:'2',toughness:'2',_ci:['B','R']},
  catalog:{typeLine:input.type_line,commanderLegality:'legal'}}]});
MTG.initData(MTG.RAW_DATA);

async function prepare(role){
  const ctx=context(MTG,role),donor=put(MTG,ctx.game,ctx.a,'Sacrifice Donor');
  donor.def={...donor.def,power:'5',toughness:'8',kws:['indestructible']};ctx.game.recalc();donor.regenShield=1;
  const card=put(MTG,ctx.game,ctx.a,fixtureName,'hand');ctx.a.pool.R=1;
  const events=[];const emit=ctx.game.emit;
  ctx.game.emit=async function(event,data,...rest){events.push({event,data});return emit.call(this,event,data,...rest);};
  if(role==='human'){
    const decide=ctx.a.controller.decide;
    ctx.a.controller.decide=(g,q)=>decide(g,q.type==='chooseTargets'&&q.candidates.includes(ctx.b)?{...q,candidates:[ctx.b,...q.candidates.filter(card=>card!==ctx.b)]}:q);
  }
  const alt=ctx.game.castableList(ctx.a).find(row=>row.card===card&&row.alt?.adventure)?.alt;assert.ok(alt);
  assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand',alt}),true);
  const picks=ctx.trace.filter(row=>row.q.type==='chooseTargets');assert.equal(picks.length,2);
  assert.equal(picks[0].result[0],donor);assert.equal(picks[1].q.candidates.includes(donor),false,'any other target excludes the damage source');
  assert.equal(ctx.a.pool.R,0);
  return {...ctx,donor,card,events,recipient:picks[1].result[0]};
}
for(const role of ['human','ai']){
  test(`${role}: Burn Together uses its creature as damage source and then sacrifices it`,async()=>{
    const ctx=await prepare(role),before=ctx.recipient.life;
    await settle(ctx.game);
    assert.equal(ctx.recipient.life,before-5);
    assert.equal(ctx.donor.zone,'graveyard','indestructible and regeneration cannot replace sacrifice');
    assert.equal(ctx.card.zone,'exile','the successfully resolved Adventure remains available');
    assert.ok(ctx.events.some(row=>row.event==='sacrificed'&&row.data.card===ctx.donor&&row.data.player===ctx.a));
    assert.equal(ctx.events.some(row=>row.event==='sacrificed'&&row.data.card===ctx.card),false);
    assert.equal(ctx.recipient.zone,undefined);
  });
  test(`${role}: an illegal damage source neither damages nor sacrifices a new object`,async()=>{
    const ctx=await prepare(role),before=ctx.recipient.life;
    await ctx.game.move(ctx.donor,'exile');await ctx.game.move(ctx.donor,'battlefield',{ctrl:ctx.a});
    await settle(ctx.game);
    assert.equal(ctx.recipient.life,before);assert.equal(ctx.donor.zone,'battlefield');
    assert.equal(ctx.events.some(row=>row.event==='sacrificed'),false);
  });
  test(`${role}: an illegal recipient prevents damage but the legal creature is still sacrificed`,async()=>{
    const ctx=await prepare(role),before=ctx.b.life;
    assert.equal(ctx.recipient,ctx.b);
    ctx.game.untilEffects.push({kind:'playerHexproof',who:ctx.b,expires:'eot'});
    await settle(ctx.game);
    assert.equal(ctx.b.life,before);assert.equal(ctx.donor.zone,'graveyard');assert.equal(ctx.card.zone,'exile');
    assert.ok(ctx.events.some(row=>row.event==='sacrificed'&&row.data.card===ctx.donor));
  });
  test(`${role}: a source changed to a new incarnation during damage is not sacrificed`,async()=>{
    const ctx=await prepare(role),before=ctx.recipient.life,version=ctx.donor.zoneVersion;
    const damage=ctx.game.damageBatch;
    ctx.game.damageBatch=async function(hits,options){
      assert.ok(hits.some(hit=>hit.src===ctx.donor),'damage belongs to the selected creature');
      const result=await damage.call(this,hits,options);
      await this.move(ctx.donor,'exile');await this.move(ctx.donor,'battlefield',{ctrl:ctx.a});return result;
    };
    await settle(ctx.game);
    assert.equal(ctx.recipient.life,before-5);assert.equal(ctx.donor.zone,'battlefield');assert.ok(ctx.donor.zoneVersion>version);
    assert.equal(ctx.events.some(row=>row.event==='sacrificed'),false);
  });
  test(`${role}: losing control during damage prevents sacrificing an opponent's permanent`,async()=>{
    const ctx=await prepare(role),before=ctx.recipient.life;
    const damage=ctx.game.damageBatch;
    ctx.game.damageBatch=async function(hits,options){const result=await damage.call(this,hits,options);ctx.donor.ctrl=ctx.b;return result;};
    await settle(ctx.game);assert.equal(ctx.recipient.life,before-5);assert.equal(ctx.donor.zone,'battlefield');assert.equal(ctx.donor.ctrl,ctx.b);
    assert.equal(ctx.events.some(row=>row.event==='sacrificed'),false);
  });
}
test('only the exact complete targeted damage and sacrifice sentence receives the new binding',()=>{
  const normal={name:'Target sacrifice boundary',layout:'normal',type_line:'Sorcery',mana_cost:'{R}'};
  for(const oracle_text of [text+' Scry 7, then explore twice.',text.replace('Then sacrifice it.','Then sacrifice another creature.')]){
    const result=semanticClass({...normal,oracle_text},{compilerVersion:8});
    assert.equal(JSON.stringify(result.implementation||[]).includes('sacrifice-target-v8'),false);
  }
});
test('v8 repairs the old bite tail while earlier compiler outputs remain frozen',()=>{
  const card={name:'Bite sacrifice boundary',layout:'normal',type_line:'Sorcery',mana_cost:'{R}',oracle_text:text.replace('any other target','target creature an opponent controls')};
  assert.equal(semanticClass(card,{compilerVersion:7}).implementation[0].effects.at(-1).action,'sacrifice-source');
  assert.deepEqual(semanticClass(card,{compilerVersion:8}).implementation[0].effects.at(-1),{action:'sacrifice-target-v8',target:0});
});
