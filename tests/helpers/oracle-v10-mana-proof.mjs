import assert from 'node:assert/strict';
import {context,put,settle} from './oracle-v8-fixtures.mjs';

export async function manaBonusProofV10(M,entry,op,role){
  const f=context(M,role),g=f.game,source=put(M,g,f.a,entry.raw.name),producer=put(M,g,f.a,op.filter.what==='creature'?'Llanowar Elves':'Forest');
  if(op.attached){await g.attach(source,producer);assert.equal(source.attachedTo,producer.iid);}
  const n=1+(op.any||op.fixed&&Object.values(op.fixed).reduce((a,b)=>a+b,0)||1),cost=M.parseCost('{'+n+'}');
  assert.equal(g.canPayMana(f.a,cost,{isAbility:true}),true,entry.raw.name+': affordability includes additional mana');
  assert.equal(await g.payMana(f.a,cost,{isAbility:true}),true);assert.equal(producer.tapped,true);assert.equal(Object.values(f.a.pool).reduce((a,b)=>a+b,0),0);
  const other=put(M,g,f.b,'Forest'),qualifies=!!op.all;
  assert.equal(g.canPayMana(f.b,M.parseCost('{2}'),{isAbility:true}),qualifies,entry.raw.name+': opponent scope');
  await g.move(source,'exile');producer.tapped=false;await settle(g);assert.equal(g.canPayMana(f.a,cost,{isAbility:true}),false,entry.raw.name+': departed source no longer grants mana');
  assert.equal(other.tapped,false);return 7;
}

export async function damagePreventionRuleProofV10(M,entry,op,role){
  const f=context(M,role),g=f.game,source=put(M,g,f.a,entry.raw.name),own=put(M,g,f.a,'Grizzly Bears'),hostile=put(M,g,f.b,'Grizzly Bears');let checks=0;
  for(const attacker of [source,own,hostile])for(const combat of [false,true]){
    const expected=(!op.self||attacker===source)&&(!op.combat||combat)&&(!op.yourCreatures||attacker.is('Creature')&&attacker.ctrl===f.a);
    g.untilEffects.push({kind:'oraclePreventNextAmount',target:f.b,zoneVersion:f.b.zoneVersion,remaining:1,expires:'eot'});
    const life=f.b.life;await g.damagePlayer(attacker,f.b,1,{combat});await settle(g);assert.equal(f.b.life,life-(expected?1:0),entry.raw.name+': printed prevention scope');
    g.untilEffects=g.untilEffects.filter(effect=>effect.kind!=='oraclePreventNextAmount');checks++;
  }
  await g.move(source,'exile');g.untilEffects.push({kind:'oraclePreventNextAmount',target:f.b,remaining:1,expires:'eot'});const life=f.b.life;
  await g.damagePlayer(own,f.b,1,{combat:true});await settle(g);assert.equal(f.b.life,life);return checks+1;
}
