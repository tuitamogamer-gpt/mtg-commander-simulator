import test from 'node:test';
import assert from 'node:assert/strict';
import {M, table, paidCast, stable} from './helpers/second-audit-combat-fixtures.mjs';

async function tap(f, player, card) {
  const source=f.g.manaSources(player).find(row=>row.card===card);
  assert.ok(source,card.name+' has an actual mana activation');
  assert.equal(await f.g.activateAbility(player,{card,manaAbility:true,manaSource:source}),true);
}

for(const [name,basic,color,type] of [
  ['High Tide','Island','U','Instant'],['Bubbling Muck','Swamp','B','Sorcery'],
]) test(`paid ${name} retains spell provenance after resolution and through an AI clone`,async()=>{
  const f=table(),lands=f.lands([basic,basic]);
  const spell=await paidCast(f,f.a,f.put(name,'hand'));
  assert.equal(spell.zone,'graveyard');
  assert.ok(M.gameStateSnapshotBlockers(f.g).some(reason=>reason.includes('lasting effect')),
    'a live temporary mana effect retains the existing checkpoint replay fallback');
  const clone=M.cloneGameForAISimulation(f.g);
  const land=lands.find(card=>!card.tapped);await tap(f,f.a,land);
  assert.equal(f.a.pool[color],2);
  const bonus=f.a.poolMeta.find(row=>row.oracleManaOriginV86?.name===name);
  assert.ok(bonus);assert.deepEqual(Array.from(bonus.oracleManaOriginV86.snapshot.types),[type]);
  assert.equal(bonus.oracleManaOriginV86.iid,spell.iid);
  assert.equal(bonus.oracleManaOriginV86.controller,f.a.idx);
  const clonedLand=clone.byIid(land.iid),clonedPlayer=clone.players[f.a.idx];
  const source=clone.manaSources(clonedPlayer).find(row=>row.card===clonedLand);
  assert.equal(await clone.activateManaSource(clonedPlayer,source,{[color]:1}),true);
  assert.equal(clonedPlayer.pool[color],2);
  assert.deepEqual(Array.from(clonedPlayer.poolMeta.find(row=>row.oracleManaOriginV86?.name===name).oracleManaOriginV86.snapshot.types),[type]);
  await paidCast(f,f.a,f.put('Arcane Signet','hand'));
  assert.equal(f.a.pool[color],0);stable(f,name+' native mana origin');
});

test('High Tide bonus mana cannot satisfy Imperiosaur’s basic-land-only payment',async()=>{
  const f=table(),lands=f.lands(['Island','Island','Forest','Forest']);
  await paidCast(f,f.a,f.put('High Tide','hand'));
  for(const card of lands.filter(card=>!card.tapped))await tap(f,f.a,card);
  assert.equal(f.a.pool.U,2);assert.equal(f.a.pool.G,2);
  const dinosaur=f.put('Imperiosaur','hand'),before={...f.a.pool};
  assert.equal(f.g.castableList(f.a).some(row=>row.card===dinosaur),false,
    'only three of the four floating mana were produced by basic lands');
  assert.equal(await f.g.castSpell(f.a,dinosaur,{from:'hand'}),false);
  assert.deepEqual({...f.a.pool},before,'an illegal source payment does not spend mana');
  f.put('Wastes');await paidCast(f,f.a,dinosaur);
  assert.equal(f.a.pool.U,1,'the spell-produced blue mana remains unspent');
  stable(f,'basic-land-only mana origin');
});

test('Chaos Moon preserves an artifact source’s last-known mana origin when bounced before upkeep resolves',async()=>{
  const f=table();f.lands([...Array(8).fill('Mountain'),'Island','Island']);
  const moon=await paidCast(f,f.a,f.put('Chaos Moon','hand'));
  const coating=await paidCast(f,f.a,f.put('Liquimetal Coating','hand'));
  const bounce=f.put('Boomerang','hand');let stage=0;
  f.targets=(_p,q)=>q.candidates.includes(moon)?[moon]:undefined;
  f.priority=(p,q)=>{
    if(p!==f.a||!f.g.stack.some(row=>row.kind==='trigger'&&row.srcCard===moon))return {kind:'pass'};
    if(stage===0){const row=q.acts.find(row=>row.card===coating);assert.ok(row);stage=1;return {kind:'activate',entry:row};}
    if(stage===1&&moon.is('Artifact')){const row=q.casts.find(row=>row.card===bounce);assert.ok(row);stage=2;return {kind:'cast',card:bounce,from:row.from,alt:row.alt};}
    return {kind:'pass'};
  };
  await f.g.runBeginningPhase(f.a);
  assert.equal(stage,2);assert.equal(moon.zone,'hand');
  const effect=f.g.untilEffects.find(row=>row.kind==='oracleTemporaryManaBonusV36');assert.ok(effect);
  const mountain=f.g.lands(f.a).find(card=>card.name==='Mountain'&&!card.tapped);
  await tap(f,f.a,mountain);
  const bonus=f.a.poolMeta.find(row=>row.oracleManaOriginV86?.name==='Chaos Moon');assert.ok(bonus);
  assert.ok(bonus.oracleManaOriginV86.snapshot.types.includes('Artifact'));
  assert.ok(bonus.oracleManaOriginV86.snapshot.types.includes('Enchantment'));
  assert.equal(bonus.oracleManaOriginV86.snapshot.types.includes('Land'),false);
  f.g.phase='main1';f.g.step='main';
  const ring=await paidCast(f,f.a,f.put('Arcane Signet','hand'));
  const paid=f.casts.find(row=>row.card===ring);
  assert.ok(paid.so.oracleManaSourcesV86.some(row=>row.name==='Chaos Moon'&&row.artifactV91),
    'the artifact-mana spend observer consumes the preserved last-known source');
  stable(f,'departed Chaos Moon source');
});

for(const [name,back,color] of [
  ['The Everflowing Well // The Myriad Pools','The Myriad Pools','U'],
  ['Thousand Moons Smithy // Barracks of the Thousand','Barracks of the Thousand','W'],
  ["Brass's Tunnel-Grinder // Tecutlan, the Searing Rift",'Tecutlan, the Searing Rift','R'],
]) test(`${back} retains its native mana-spend trigger`,async()=>{
  const f=table(),land=f.put(name);
  M.OracleV8Faces.setFace(land,'back');f.g.recalc();
  const witness=f.put('Forest');
  f.targets=(_p,q)=>q.candidates.includes(witness)?[witness]:undefined;
  const discovery=f.put('Ornithopter','library');
  const beforeTokens=f.g.bf().filter(card=>card.isToken).length;
  await tap(f,f.a,land);
  assert.equal(f.a.pool[color],1);
  const origin=f.a.poolMeta.find(row=>row.oracleManaOriginV86?.name===back)?.oracleManaOriginV86;
  assert.ok(origin);assert.equal(origin.iid,land.iid);assert.equal(origin.version,land.zoneVersion);
  const ring=await paidCast(f,f.a,f.put('Sol Ring','hand'));
  assert.ok(f.casts.find(row=>row.card===ring).so.oracleManaSourcesV86.some(row=>row.iid===land.iid));
  if(back==='The Myriad Pools')assert.equal(witness.name,'Sol Ring');
  else if(back==='Barracks of the Thousand')assert.equal(f.g.bf().filter(card=>card.isToken).length,beforeTokens+1);
  else assert.ok(['battlefield','hand'].includes(discovery.zone),'the native discover trigger found the top nonland card');
  stable(f,back+' paid source trigger');
});
