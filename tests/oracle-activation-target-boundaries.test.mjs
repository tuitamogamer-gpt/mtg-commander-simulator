import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
import {createFixturePlan,registerCanonicalFixturePlan} from './helpers/oracle-fixture-plan.mjs';

import {context,settle} from './helpers/oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './helpers/oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v68-common.json',import.meta.url)))
  .filter(row=>['Razia, Boros Archangel','Baba Lysaga, Night Witch'].includes(row.name));
const plan=createFixturePlan(rows,69,9970),M=loadEngine();
registerCanonicalFixturePlan(M,plan);

function setup(role,opponents=1){
  const f=context(M,role,opponents);
  for(const player of f.game.players)fund(player);
  f.game.spotlight=async()=>{};
  return f;
}
const witness=(f,player=f.a,extra={})=>permanent(M,f.game,player,def('Native target boundary witness '+f.game.bf().length,
  ['Creature'],{toughness:'20',...extra}));
const entry=(f,source,index=0)=>({card:source,ability:source.def.abilities[index],idx:index});
async function paidSource(f,name){
  const source=put(M,f.a,name,'hand'),before=total(f.a);
  assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);
  assert.ok(total(f.a)<before,'the source uses its actual printed mana payment');
  await settle(f.game);source.sick=false;
  return source;
}
function noActivation(f,source,mana){
  assert.equal(source.tapped,false);
  assert.equal(total(f.a),mana);
  assert.equal(f.game.stack.length,0);
  assertGameStateInvariants(f.game);
  assert.equal(f.a.controller instanceof M.AIController,f.a.isAI);
}

for(const role of ['human','ai']){
  test(`${role}: canonical Razia rejects duplicate UI targets without tapping, then resolves distinct targets`,async()=>{
    const f=setup(role),{game:g,a,b}=f,source=await paidSource(f,'Razia, Boros Archangel'),host=witness(f),other=witness(f,b),damageSource=witness(f,b),mana=total(a);
    assert.equal(source.def.abilities[0].targets[1].differentFromAllPrevious,true);
    assert.equal(await g.activateAbility(a,entry(f,source),[host,host]),false);
    noActivation(f,source,mana);
    const wanted=[host,other];choose(a,q=>{if(q.type!=='chooseTargets')return null;const target=wanted.shift();assert.ok(q.candidates.includes(target));return {...q,candidates:[target],min:1,max:1};});
    assert.equal(await g.activateAbility(a,entry(f,source)),true);
    assert.equal(source.tapped,true);assert.equal(total(a),mana);
    assert.equal(g.stack.length,1);await settle(g);
    await g.damageAny(damageSource,host,5);
    assert.equal(host.damage,2);assert.equal(other.damage,3);
    assertGameStateInvariants(g);
  });

  for(const changed of ['first target','source'])test(`${role}: Razia preserves choice identities when ${changed} blinks during its second target prompt`,async()=>{
    const f=setup(role),{game:g,a,b}=f,source=await paidSource(f,'Razia, Boros Archangel'),host=witness(f),other=witness(f,b),mana=total(a),originalVersion=(changed==='source'?source:host).zoneVersion;
    const wanted=[host,other];choose(a,q=>q.type==='chooseTargets'?{...q,candidates:[wanted.shift()],min:1,max:1}:null);
    const native=a.controller.decide.bind(a.controller);let prompt=0;
    a.controller.decide=async(game,q)=>{const answer=await native(game,q);if(q.type==='chooseTargets'&&++prompt===2){const object=changed==='source'?source:host;await game.move(object,'hand');await game.putPermanentOntoBattlefield(object,a);}return answer;};
    assert.equal(await g.activateAbility(a,entry(f,source)),false);
    assert.ok((changed==='source'?source:host).zoneVersion>originalVersion);
    assert.equal(prompt,2);noActivation(f,source,mana);
    assert.equal(host.damage,0);assert.equal(other.damage,0);
  });

  test(`${role}: native Spurnmage group rejects mixed graveyards and returns two cards from one actual opponent`,async()=>{
    const f=setup(role,2),{game:g,a,b,others}=f,third=others[1],source=await paidSource(f,'Spurnmage Advocate'),one=put(M,b,'Forest','graveyard'),two=put(M,b,'Mountain','graveyard'),foreign=put(M,third,'Island','graveyard'),attacker=witness(f,b),mana=total(a);
    attacker.attacking=a;
    assert.equal(source.def.abilities[0].targets[0].sameGraveyard,true);
    assert.equal(await g.activateAbility(a,entry(f,source),[[one,foreign],attacker]),false);
    assert.equal(one.zone,'graveyard');assert.equal(foreign.zone,'graveyard');noActivation(f,source,mana);
    assert.equal(await g.activateAbility(a,entry(f,source),[[one,two],attacker]),true);
    await settle(g);assert.equal(source.tapped,true);assert.equal(one.zone,'hand');assert.equal(two.zone,'hand');assert.equal(foreign.zone,'graveyard');assert.equal(attacker.zone,'graveyard');
    assertGameStateInvariants(g);
  });

  test(`${role}: actual Wayta mana preparation revalidates a target after an awaited Altar sacrifice choice`,async()=>{
    const f=setup(role),{game:g,a,b}=f,source=await paidSource(f,'Wayta, Trainer Prodigy'),host=witness(f),other=witness(f,b),fuel=witness(f),altar=permanent(M,g,a,M.DEFS['Phyrexian Altar']);
    for(const color of Object.keys(a.pool))a.pool[color]=0;a.pool.C=2;
    const mana=total(a),version=other.zoneVersion;let choices=0;
    choose(a,q=>q.type==='chooseCards'&&q.from.includes(fuel)?{...q,from:[fuel],min:1,max:1}:null);
    const native=a.controller.decide.bind(a.controller);
    a.controller.decide=async(game,q)=>{const answer=await native(game,q);if(q.type==='chooseCards'&&q.from.includes(fuel)){choices++;await game.move(other,'hand');await game.putPermanentOntoBattlefield(other,b);}return answer;};
    assert.equal(await g.activateAbility(a,entry(f,source),[host,other]),false);
    assert.equal(choices,1,'a real native mana-sacrifice choice was awaited');assert.ok(other.zoneVersion>version);
    assert.equal(fuel.zone,'battlefield');assert.equal(altar.zone,'battlefield');assert.equal(altar.tapped,false);noActivation(f,source,mana);
    assert.equal(host.damage,0);assert.equal(other.damage,0);
  });

  test(`${role}: actual up-to-one Tawnos target permits a zero-target paid activation and still mills two`,async()=>{
    const f=setup(role),{game:g,a}=f,source=await paidSource(f,'Tawnos, Solemn Survivor'),mana=total(a),library=a.library.length;
    let choices=0;choose(a,q=>{if(q.type!=='chooseTargets')return null;choices++;return {...q,candidates:[],min:0,max:0};});
    assert.equal(await g.activateAbility(a,entry(f,source)),true);assert.equal(choices,1);
    assert.equal(total(a),mana-2);assert.equal(source.tapped,true);await settle(g);
    assert.equal(a.library.length,library-2);assertGameStateInvariants(g);
  });

  for(const count of [0,1])test(`${role}: Tawnos normalizes the optional UI single-target array with ${count} object`,async()=>{
    const f=setup(role),{game:g,a}=f,source=await paidSource(f,'Tawnos, Solemn Survivor'),mana=total(a),library=a.library.length;
    let token;
    if(count){await g.makeTokens(M.TOKENS.treasure,a);token=g.bf().find(card=>card.isToken&&card.hasSub('Treasure'));assert.ok(token);}
    assert.equal(await g.activateAbility(a,entry(f,source),[count?[token]:[]]),true);
    assert.equal(total(a),mana-2);assert.equal(source.tapped,true);
    const so=g.stack.at(-1);assert.equal(so.targets[0],token);
    await settle(g);assert.equal(a.library.length,library-2);
    assert.equal(g.bf().filter(card=>card.isToken&&card.hasSub('Treasure')).length,count?2:0);
    assertGameStateInvariants(g);
  });

  test(`${role}: canonical Baba caps the real sacrifice choice at three and rejects a forged fourth object`,async()=>{
    const f=setup(role),{game:g,a,b}=f,source=await paidSource(f,'Baba Lysaga, Night Witch'),creature=witness(f),artifact=permanent(M,g,a,def('Native Baba artifact',['Artifact'])),land=permanent(M,g,a,M.DEFS.Forest),fourth=witness(f),mana=total(a),life=a.life,enemyLife=b.life,hand=a.hand.length;
    assert.equal(source.def.abilities[0].cost.sacMaxV68,3);
    const native=a.controller.decide.bind(a.controller);let offeredMaximum;
    a.controller.decide=async(game,q)=>{if(q.type==='chooseCards'&&q.prompt==='Žrtvuj (X):'){offeredMaximum=q.max;return [creature,artifact,land,fourth];}return native(game,q);};
    assert.equal(await g.activateAbility(a,entry(f,source)),false);assert.equal(offeredMaximum,3);
    for(const card of [creature,artifact,land,fourth])assert.equal(card.zone,'battlefield');noActivation(f,source,mana);
    a.controller.decide=native;choose(a,q=>q.type==='chooseCards'&&q.prompt==='Žrtvuj (X):'?{...q,from:[creature,artifact,land],min:3,max:3}:null);
    assert.equal(await g.activateAbility(a,entry(f,source)),true);await settle(g);
    for(const card of [creature,artifact,land])assert.equal(card.zone,'graveyard');assert.equal(fourth.zone,'battlefield');
    assert.equal(a.life,life+3);assert.equal(b.life,enemyLife-3);assert.equal(a.hand.length,hand+3);assert.equal(source.tapped,true);assertGameStateInvariants(g);
  });
}
