import test from 'node:test';
import assert from 'node:assert/strict';
import {table, paidCast, stable} from './helpers/second-audit-combat-fixtures.mjs';

async function combatTable(abuAttacks,partnerName='Hill Giant') {
  const f=table();
  f.lands(['Plains']);
  f.abu=await paidCast(f,f.a,f.put("Abu Ja'far",'hand'));
  f.g.turnPlayer=f.b;
  f.lands(['Mountain','Wastes','Wastes','Wastes'],f.b);
  f.partner=await paidCast(f,f.b,f.put(partnerName,'hand',f.b));
  f.active=abuAttacks?f.a:f.b;
  f.g.turnPlayer=f.active;f.g.turnNo++;
  await f.g.runBeginningPhase(f.active);
  f.g.phase='main1';f.g.step='main';
  f.attackers=p=>p===f.active?[{card:abuAttacks?f.abu:f.partner,target:abuAttacks?f.b:f.a}]:[];
  f.blockers=p=>p===(abuAttacks?f.b:f.a)?[{blocker:abuAttacks?f.partner:f.abu,attacker:abuAttacks?f.abu:f.partner}]:[];
  return f;
}

for(const attacking of [true,false])test(`Abu Ja'far destroys its combat partner after dying while ${attacking?'attacking':'blocking'}`,async()=>{
  const f=await combatTable(attacking);
  await f.g.combatPhase(f.active);
  assert.equal(f.abu.zone,'graveyard');
  assert.equal(f.partner.zone,'graveyard','the surviving creature blocked or was blocked by Abu immediately before its death');
  assert.equal(f.a.life,40);assert.equal(f.b.life,40);
  stable(f,'native Abu combat death');
});

for(const attacking of [true,false])test(`Abu's ${attacking?'attacking':'blocking'} death trigger excludes a partner returned by paid Cloudshift`,async()=>{
  const f=await combatTable(attacking),blink=f.put('Cloudshift','hand',f.b);
  f.lands(['Plains'],f.b);const version=f.partner.zoneVersion;let cast=false;
  f.priority=(p,q)=>{
    if(p===f.b&&!cast&&f.g.stack.some(row=>row.kind==='trigger'&&row.srcCard===f.abu)){
      const row=q.casts.find(row=>row.card===blink);assert.ok(row);cast=true;
      return {kind:'cast',card:blink,from:row.from,alt:row.alt,quickTargets:[f.partner]};
    }
    return {kind:'pass'};
  };
  await f.g.combatPhase(f.active);
  assert.equal(cast,true);assert.equal(blink.zone,'graveyard');assert.equal(f.abu.zone,'graveyard');
  assert.equal(f.partner.zone,'battlefield');assert.ok(f.partner.zoneVersion>version);
  stable(f,'Abu preserves a returned partner');
});

test("Abu's destruction ignores a regeneration shield paid in response",async()=>{
  const f=await combatTable(true),regen=f.put('Regenerate','hand',f.b);
  f.lands(['Forest','Forest'],f.b);let cast=false,shield=false;
  f.priority=(p,q)=>{
    if(p===f.b&&!cast&&f.g.stack.some(row=>row.kind==='trigger'&&row.srcCard===f.abu)){
      const row=q.casts.find(row=>row.card===regen);assert.ok(row);cast=true;
      return {kind:'cast',card:regen,from:row.from,alt:row.alt,quickTargets:[f.partner]};
    }
    if(regen.zone==='graveyard'&&f.partner.zone==='battlefield')shield ||= f.partner.regenShield>0;
    return {kind:'pass'};
  };
  await f.g.combatPhase(f.active);
  assert.equal(cast&&shield,true);assert.equal(f.partner.zone,'graveyard');
  stable(f,'Abu forbids regeneration');
});

test('a creature removed from combat before Abu dies is not a death-trigger partner',async()=>{
  const f=await combatTable(true),blink=f.put('Cloudshift','hand',f.b),shock=f.put('Shock','hand');
  f.lands(['Plains'],f.b);f.lands(['Mountain']);let stage=0;
  f.targets=(_p,q)=>q.src===shock?[f.abu]:q.src===blink?[f.partner]:undefined;
  f.priority=(p,q)=>{
    if(f.g.step!=='blockers')return {kind:'pass'};
    if(p===f.b&&stage===0&&f.abu.blockedBy.includes(f.partner)){
      const row=q.casts.find(row=>row.card===blink);assert.ok(row);stage=1;
      return {kind:'cast',card:blink,from:row.from,alt:row.alt,quickTargets:[f.partner]};
    }
    if(p===f.a&&stage===1&&blink.zone==='graveyard'){
      const row=q.casts.find(row=>row.card===shock);assert.ok(row);stage=2;
      return {kind:'cast',card:shock,from:row.from,alt:row.alt,quickTargets:[f.abu]};
    }
    return {kind:'pass'};
  };
  await f.g.combatPhase(f.active);
  assert.equal(stage,2);assert.equal(shock.zone,'graveyard');assert.equal(f.abu.zone,'graveyard');
  assert.equal(f.partner.zone,'battlefield');stable(f,'only current death-time combat partners');
});

test('dying after combat does not destroy creatures Abu blocked earlier',async()=>{
  const f=await combatTable(false,'Ornithopter');
  await f.g.combatPhase(f.active);
  assert.equal(f.abu.zone,'battlefield');assert.equal(f.partner.zone,'battlefield');
  f.g.phase='main2';f.g.step='main';f.lands(['Mountain']);
  const shock=f.put('Shock','hand');f.targets=(_p,q)=>q.candidates.includes(f.abu)?[f.abu]:undefined;
  await paidCast(f,f.a,shock);
  assert.equal(f.abu.zone,'graveyard');assert.equal(f.partner.zone,'battlefield');
  stable(f,'combat history is not a current combat relation');
});

test('Abu destroys every attacker it blocked using paid Entangler',async()=>{
  const f=await combatTable(false);
  f.g.turnPlayer=f.a;f.lands(['Plains','Plains','Plains','Plains']);
  f.targets=(_p,q)=>q.candidates.includes(f.abu)?[f.abu]:undefined;
  await paidCast(f,f.a,f.put('Entangler','hand'));
  f.g.turnPlayer=f.b;f.lands(['Mountain','Wastes','Wastes','Wastes'],f.b);
  const second=await paidCast(f,f.b,f.put('Hill Giant','hand',f.b));
  f.g.turnNo++;await f.g.runBeginningPhase(f.b);f.g.phase='main1';f.g.step='main';
  f.attackers=p=>p===f.b?[f.partner,second].map(card=>({card,target:f.a})):[];
  f.blockers=p=>p===f.a?[f.partner,second].map(attacker=>({blocker:f.abu,attacker})):[];
  await f.g.combatPhase(f.b);
  assert.equal(f.abu.zone,'graveyard');assert.equal(f.partner.zone,'graveyard');assert.equal(second.zone,'graveyard');
  assert.equal(f.a.life,40);stable(f,'all partners of a multi-blocker');
});

test("Abu's old death trigger survives its own return through paid Undying Evil",async()=>{
  const f=await combatTable(true);f.lands(['Swamp']);
  f.targets=(_p,q)=>q.candidates.includes(f.abu)?[f.abu]:undefined;
  await paidCast(f,f.a,f.put('Undying Evil','hand'));
  const version=f.abu.zoneVersion,decide=f.a.controller.decide;let returnedBeforeDestruction=false;
  f.a.controller.decide=async(g,q)=>q.type==='orderTriggers'
    ? q.triggers.slice().sort((a,b)=>Number(a.name==='Undying')-Number(b.name==='Undying'))
    : decide(g,q);
  f.priority=()=>{
    if(f.abu.zone==='battlefield'&&f.abu.zoneVersion>version&&f.g.stack.some(row=>row.kind==='trigger'&&row.srcCard===f.abu)){
      returnedBeforeDestruction=true;assert.equal(f.partner.zone,'battlefield');
    }
    return {kind:'pass'};
  };
  await f.g.combatPhase(f.active);
  assert.equal(returnedBeforeDestruction,true,'the old destroy trigger resolves after Abu has returned as a new object');
  assert.equal(f.abu.zone,'battlefield');assert.ok(f.abu.zoneVersion>version);
  assert.equal(f.abu.counters['+1/+1'],1);assert.equal(f.partner.zone,'graveyard');
  stable(f,'old trigger retains death-time combat partners');
});

test('simultaneous combat deaths preserve the same pre-departure relations',async()=>{
  const f=await combatTable(true);f.lands(['Mountain','Wastes']);
  f.targets=(_p,q)=>q.candidates.includes(f.abu)?[f.abu]:undefined;
  await paidCast(f,f.a,f.put('Brute Strength','hand'));
  await f.g.combatPhase(f.active);
  assert.equal(f.abu.zone,'graveyard');assert.equal(f.partner.zone,'graveyard');
  assert.equal(f.a.life,40);assert.equal(f.b.life,40);
  stable(f,'simultaneous Abu and partner deaths');
});
