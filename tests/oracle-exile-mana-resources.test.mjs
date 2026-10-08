import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,settle} from './helpers/oracle-v8-fixtures.mjs';
import {def,fund,put,total,choose} from './helpers/oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
for(const role of ['human','ai'])for(const mode of ['conflict','self','separate'])
  test(`${role}: Ether mana payment reserves its exile source (${mode})`,async()=>{
    const {game:g,a}=context(M,role);
    const castPermanent=async name=>{
      fund(a);
      const c=put(M,a,name,'hand'),before=total(a);
      assert.equal(await g.castSpell(a,c,{from:'hand'}),true);
      if(c.def.cost!=='{0}')assert.ok(total(a)<before);
      await settle(g);assert.equal(c.zone,'battlefield');return c;
    };
    const hasSeparateArtifact=mode==='separate',legal=mode!=='conflict';
    const sacrificeDefinition=mode==='conflict'?def('Native other-artifact mana source',['Artifact'],{
      cost:'{4}',oracle:'Sacrifice another artifact: Add {C}{C}.',
      mana:{cost:{sacOther:true,sac:(_g,c,source)=>c!==source&&c.is('Artifact')},produce:[{C:2}]},
    }):'Krark-Clan Ironworks';
    const ironworks=await castPermanent(sacrificeDefinition),ether=await castPermanent('Ether');
    const donor=hasSeparateArtifact?await castPermanent('Ornithopter'):null;
    if(donor)choose(a,q=>q.type==='chooseCards'&&q.from.includes(donor)?{...q,from:[donor]}:null);
    for(const color of ['W','U','B','R','G','C'])a.pool[color]=0;
    const spell=put(M,a,'Divination','hand'),versions=[ether,ironworks,spell].map(c=>c.zoneVersion);
    assert.equal(g.canPayMana(a,M.parseCost(spell.def.cost),{card:spell,castOpts:{}}),legal);
    const before={...a.pool},casts=a.turnState.spellsCastList.length,hand=a.hand.length;
    assert.equal(await g.castSpell(a,spell,{from:'hand'}),legal);
    if(legal){
      const so=g.stack.find(row=>row.card===spell);
      assert.ok(so);assert.equal(so.manaSpent,3);
      assert.equal(ether.zone,'exile');if(donor)assert.equal(donor.zone,'graveyard');
      assert.equal(ironworks.zone,hasSeparateArtifact?'battlefield':'graveyard');assert.equal(total(a),0);
      await settle(g);
      assert.equal(spell.zone,'graveyard');
      assert.equal(a.hand.length,hand+3,'the paid spell and Ether copy each draw two physical cards');
    }else{
      assert.deepEqual({...a.pool},before);
      assert.deepEqual([ether,ironworks,spell].map(c=>c.zoneVersion),versions);
      assert.equal(ether.zone,'battlefield');assert.equal(ether.tapped,false);
      assert.equal(ironworks.zone,'battlefield');assert.equal(ironworks.tapped,false);
      assert.equal(spell.zone,'hand');assert.equal(g.stack.length,0);
      assert.equal(a.turnState.spellsCastList.length,casts);
      assert.equal(a.hand.length,hand);
    }
    assert.equal(a.controller instanceof M.AIController,role==='ai');
    assertGameStateInvariants(g);
  });
