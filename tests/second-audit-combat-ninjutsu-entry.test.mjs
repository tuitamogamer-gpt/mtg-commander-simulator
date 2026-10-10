import test from 'node:test';
import assert from 'node:assert/strict';
import {M,table,paidCast,paidAbility,stable} from './helpers/second-audit-combat-fixtures.mjs';

for(const change of ['player','planeswalker','bounce after activation','flicker after activation','opponent gains planeswalker','caster gains planeswalker','Battle changes controller and protector'])test('second combat: paid ninjutsu entry '+change,async()=>{
  const f=table(),attacker=f.put('Colossal Dreadmaw','hand'),ninja=f.put('Ninja of the Deep Hours','hand');
  const battle=change.startsWith('Battle'),controlChange=change.includes('gains')||battle;
  const walker=change==='player'?null:f.put(battle?'Invasion of Dominaria // Serra Faithkeeper':'Jace Beleren','hand',f.b),target=walker||f.b;
  const response=change.startsWith('bounce')?f.put('Into the Roil','hand',f.b):change.startsWith('flicker')?f.put('Flicker','hand',f.b):null;
  const orrery=change.startsWith('flicker')?f.put('Vedalken Orrery','hand',f.b):null;
  const responsePlayer=change.startsWith('caster')?f.a:f.c;
  const memnarch=controlChange?f.put('Memnarch','hand',responsePlayer):null;
  f.lands([...Array(18).fill('Island'),...Array(20).fill('Forest')]);
  f.lands([...Array(8).fill('Island'),...Array(4).fill('Plains'),...Array(8).fill('Forest')],f.b);
  f.lands([...Array(18).fill('Island'),...Array(12).fill('Forest')],f.c);
  f.option=(p,q)=>q.prompt?.includes('choose its protector')?String(q.options.some(row=>row.key===String(f.c.idx))?f.c.idx:f.d.idx):undefined;
  f.targets=(p,q)=>{
    if((q.src===response||q.src===memnarch)&&q.candidates.includes(walker))return [walker];
    return undefined;
  };
  if(walker){f.g.turnPlayer=f.b;await paidCast(f,f.b,walker);if(orrery)await paidCast(f,f.b,orrery);f.g.turnPlayer=f.a;}
  if(memnarch){
    f.g.turnPlayer=responsePlayer;await paidCast(f,responsePlayer,memnarch);
    await paidAbility(f,responsePlayer,memnarch,ability=>ability.cost?.mana==='{1}{U}{U}');
    f.g.turnPlayer=f.a;
  }
  const version=walker?.zoneVersion;let activated=false,responded=false,entryState;
  const emit=f.g.emit.bind(f.g);f.g.emit=async(event,data,...args)=>{
    if(event==='etb'&&data.card===ninja)entryState={attacking:!!ninja.attacking,inCombat:f.g.combat?.attackers.includes(ninja)||false,tapped:ninja.tapped,sameDestination:ninja.attacking===target,defender:M.defendingPlayerV92(ninja.attacking)?.idx};
    return emit(event,data,...args);
  };
  f.cards=(p,q)=>q.prompt?.includes('Ninjutsu: return')&&q.from.includes(attacker)?[attacker]:undefined;
  f.main=(p,q)=>{
    if(p===f.a&&q.phase==='main1'&&attacker.zone==='hand'&&f.a.turnsStarted===1){
      const row=q.casts.find(row=>row.card===attacker);assert.ok(row);return {kind:'cast',card:attacker,from:row.from,alt:row.alt};
    }
    return {kind:'done'};
  };
  f.attackers=(p,q)=>p===f.a&&f.a.turnsStarted===2&&q.eligible.includes(attacker)?[{card:attacker,target}]:[];
  f.priority=(p,q)=>{
    if(f.g.step==='blockers'&&p===f.a&&!activated&&f.g.combat?.attackers.includes(attacker)){
      const entry=q.acts.find(row=>row.card===ninja&&row.ninjutsu);assert.ok(entry,'actual paid ninjutsu offer at the native unblocked window');
      activated=true;return {kind:'activate',entry};
    }
    if(response&&activated&&!responded&&p===f.b&&f.g.stack.some(row=>row.kind==='ability'&&row.srcCard===ninja)){
      const row=q.casts.find(row=>row.card===response);assert.ok(row,'opponent actually responds to the paid ninjutsu ability');
      responded=true;return {kind:'cast',card:response,from:row.from,alt:row.alt};
    }
    if(memnarch&&activated&&!responded&&p===responsePlayer&&f.g.stack.some(row=>row.kind==='ability'&&row.srcCard===ninja)){
      const entry=q.acts.find(row=>row.card===memnarch&&row.ability.cost?.mana==='{3}{U}');
      assert.ok(entry,'real paid control-change response to the ninjutsu ability');responded=true;return {kind:'activate',entry};
    }
    return {kind:'pass'};
  };
  await f.g.runTurn();for(let n=0;n<4;n++)await f.g.runTurn();
  const attacksOnEntry=!response&&!change.startsWith('caster');
  assert.equal(activated,true);assert.equal(responded,!!response||!!memnarch);assert.equal(attacker.zone,'hand','native additional cost returns the original attacker');
  assert.equal(ninja.zone,'battlefield');assert.ok(entryState);assert.equal(entryState.tapped,true);
  assert.equal(entryState.attacking,attacksOnEntry,'CR508.4a entrant never attacks an invalid specified destination');
  assert.equal(entryState.inCombat,attacksOnEntry);
  assert.equal(entryState.sameDestination,attacksOnEntry);
  if(attacksOnEntry)assert.equal(entryState.defender,(battle?f.d:memnarch?f.c:f.b).idx,'a valid destination uses its actual defending player on entry');
  assert.equal(f.events.filter(row=>row.event==='attacks'&&row.data.card===ninja).length,0,'ninjutsu entry does not declare an attack');
  assert.equal(f.b.life,change==='player'?38:battle?44:40);
  if(walker){
    assert.equal(walker.zone,change.startsWith('bounce')?'hand':'battlefield');
    assert.equal(walker.counters[battle?'defense':'loyalty']||0,change.startsWith('bounce')?0:attacksOnEntry?(battle?3:1):(battle?5:3),'native zone changes clear counters and an invalid battlefield destination takes no damage');
    assert.equal(f.events.some(row=>row.event==='dealtDamage'&&row.data.combat&&row.data.src===ninja&&row.data.target===walker),attacksOnEntry,'only a valid captured destination receives actual Ninja combat damage');
    assert.equal(walker.zoneVersion,version+(change.startsWith('flicker')?2:change.startsWith('bounce')?1:0));
    if(memnarch)assert.equal(walker.ctrl.idx,responsePlayer.idx);
    if(battle)assert.equal(walker.protector.idx,f.d.idx);
  }
  stable(f,'native paid ninjutsu resolution destination '+change);
});
