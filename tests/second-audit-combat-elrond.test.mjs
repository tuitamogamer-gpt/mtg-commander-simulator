import test from 'node:test';
import assert from 'node:assert/strict';
import {M,table,paidCast,stable} from './helpers/second-audit-combat-fixtures.mjs';

async function acquire(variant) {
  const f=table(),elf=f.put('Elrond of the White Council','hand'),bear=f.put('Grizzly Bears','hand',f.b);
  const walker=f.put('Jace Beleren','hand',f.b);
  const lignify=variant==='normal'?null:f.put('Lignify','hand');
  const remove=variant.endsWith('removed')?f.put('Naturalize','hand'):null;
  f.lands([...Array(3).fill('Island'),...Array(12).fill('Forest')]);
  f.lands([...Array(3).fill('Island'),...Array(3).fill('Forest')],f.b);
  f.g.turnPlayer=f.b;await paidCast(f,f.b,walker);await paidCast(f,f.b,bear);f.g.turnPlayer=f.a;
  f.option=(p,q)=>q.aiHint?.kind==='vote'?(p===f.b?'fellowship':'aid'):undefined;
  f.cards=(p,q)=>q.prompt?.includes('Give a creature')&&p===f.b&&q.from.includes(bear)?[bear]:undefined;
  f.targets=(p,q)=>q.src===lignify&&q.candidates.includes(bear)?[bear]:q.src===remove&&q.candidates.includes(lignify)?[lignify]:undefined;
  const queue=variant.includes('before')?[lignify,elf]:[elf,lignify].filter(Boolean);
  f.main=(p,q)=>{
    if(p!==f.a||q.phase!=='main1')return {kind:'done'};
    const card=queue.find(c=>c.zone==='hand')||(remove&&f.a.turnsStarted===2&&remove.zone==='hand'?remove:null);
    if(!card)return {kind:'done'};
    const row=q.casts.find(row=>row.card===card);assert.ok(row,'printed native paid cast: '+card.name);
    return {kind:'cast',card,from:row.from,alt:row.alt};
  };
  const ownerPermitted=variant==='Lignify after the grant';
  let declaration;
  f.attackers=(p,q)=>{
    if(p!==f.a||f.a.turnsStarted<2)return [];
    assert.ok(q.eligible.includes(bear),'actual next controller turn removes control-change sickness');
    declaration={owner:f.g.canAttackTarget(bear,f.b),other:f.g.canAttackTarget(bear,f.c),walker:f.g.canAttackTarget(bear,walker),disabled:bear.cur.abilitiesDisabled};
    return [{card:bear,target:ownerPermitted?f.b:f.c}];
  };
  await f.g.runTurn();
  assert.equal(bear.ctrl.idx,f.a.idx);assert.equal(bear.owner.idx,f.b.idx);assert.equal(bear.sick,true);
  assert.equal(f.g.canAttackTarget(bear,f.c),false,'newly gained creature cannot attack during the grant turn');
  for(let n=0;n<4;n++)await f.g.runTurn();
  assert.ok(declaration);
  return {f,elf,bear,walker,lignify,remove,declaration,ownerPermitted};
}

for(const variant of ['normal','Lignify before the grant','Lignify after the grant','Lignify after the grant then removed'])test('second combat: native paid Elrond Fellowship '+variant,async()=>{
  const {f,elf,bear,walker,lignify,remove,declaration,ownerPermitted}=await acquire(variant);
  assert.equal(declaration.owner,ownerPermitted,'a granted prohibition is removed by later ability loss, and retained if granted afterward');
  assert.equal(declaration.other,true);
  assert.equal(declaration.walker,true,'printed Elrond grant forbids its owner, not that owner planeswalker');
  const attack=f.events.find(r=>r.event==='attacks'&&r.data.card===bear);
  assert.ok(attack,'actual paid granted creature attacks via native declaration');
  assert.equal(attack.data.defender.idx,(ownerPermitted?f.b:f.c).idx);
  assert.equal(bear.counters['+1/+1'],3,'each actual aid ballot puts one counter on the stolen creature');
  if(remove)assert.equal(lignify.zone,'graveyard','actual paid removal restores the granted ability');
  assert.equal(f.casts.filter(r=>r.card===elf).length,1);
  stable(f,'Elrond native Fellowship '+variant);
});

for(const before of [false,true])for(const laterEffect of [false,true])test('second combat: JSON-restored native own Fellowship '+(before?'grant after Lignify':'Lignify after grant')+(laterEffect?' then a later paid effect':''),async()=>{
  const f=table(),bear=f.put('Grizzly Bears','hand'),elf=f.put('Elrond of the White Council','hand'),lignify=f.put('Lignify','hand');
  f.lands([...Array(3).fill('Island'),...Array(14).fill('Forest')]);
  f.lands([...Array(10).fill('Mountain'),...Array(6).fill('Island'),...Array(8).fill('Forest')],f.c);
  await paidCast(f,f.a,bear);
  f.option=(p,q)=>q.aiHint?.kind==='vote'?(p===f.a?'fellowship':'aid'):undefined;
  f.cards=(p,q)=>p===f.a&&q.prompt?.includes('Give a creature')&&q.from.includes(bear)?[bear]:undefined;
  f.targets=(p,q)=>q.src===lignify&&q.candidates.includes(bear)?[bear]:undefined;
  const setup=before?[lignify,elf]:[elf,lignify];
  f.main=(p,q)=>{
    if(p!==f.a||q.phase!=='main1')return {kind:'done'};
    const card=setup.find(c=>c.zone==='hand');if(!card)return {kind:'done'};
    const row=q.casts.find(row=>row.card===card);assert.ok(row);
    return {kind:'cast',card,from:row.from,alt:row.alt};
  };
  await f.g.runTurn();
  assert.equal(bear.ctrl.idx,f.a.idx);assert.equal(bear.owner.idx,f.a.idx);
  assert.equal(bear.counters['+1/+1'],3);
  assert.ok(f.g.untilEffects.some(row=>row.kind==='cantAttackPlayerCard'&&row.iid===bear.iid),'grant came from an actual Fellowship ballot');
  const snapshot=M.captureGameState(f.g);
  assert.ok(snapshot,M.gameStateSnapshotBlockers(f.g).join(', '));
  const next=table();M.restoreGameState(next.g,JSON.parse(JSON.stringify(snapshot)));
  const returned=next.g.byIid(bear.iid),aura=next.g.byIid(lignify.iid);
  const conscripts=next.put('Zealous Conscripts','hand',next.c);
  const later=laterEffect?next.put(before?'Dress Down':'Naturalize','hand',next.c):null;
  // Later Dress Down also removes the first haste grant. A real later
  // Expedite restores haste, while leaving the old Elrond ability removed.
  const haste=before&&laterEffect?next.put('Expedite','hand',next.c):null;
  next.targets=(p,q)=>(q.src===conscripts||q.src===haste)&&q.candidates.includes(returned)?[returned]:q.src===later&&q.candidates.includes(aura)?[aura]:undefined;
  const queue=[conscripts,later,haste].filter(Boolean);
  next.main=(p,q)=>{
    if(p!==next.c||q.phase!=='main1')return {kind:'done'};
    const card=queue.find(c=>c.zone==='hand');if(!card)return {kind:'done'};
    const row=q.casts.find(row=>row.card===card);assert.ok(row,'actual paid effect after restore: '+card.name);
    return {kind:'cast',card,from:row.from,alt:row.alt};
  };
  const permitted=before?laterEffect:!laterEffect;
  let ownerAllowed;
  next.attackers=(p,q)=>{
    if(p!==next.c)return [];
    assert.equal(returned.ctrl.idx,next.c.idx);assert.equal(returned.owner.idx,next.a.idx);
    assert.ok(q.eligible.includes(returned),'real Conscripts ability supplies haste despite the older Lignify');
    ownerAllowed=next.g.canAttackTarget(returned,next.a);
    return [{card:returned,target:permitted?next.a:next.b}];
  };
  await next.g.runTurn();await next.g.runTurn();
  assert.equal(ownerAllowed,permitted,'checkpoint retains layer order and later paid effects update the granted ability');
  assert.equal(next.casts.filter(row=>queue.includes(row.card)).length,queue.length);
  const attack=next.events.find(r=>r.event==='attacks'&&r.data.card===returned);
  assert.ok(attack);assert.equal(attack.data.defender.idx,(permitted?next.a:next.b).idx);
  stable(next,'Elrond portable native own-Fellowship chronology');
});
