import test from 'node:test';
import assert from 'node:assert/strict';
import {table,stable} from './helpers/second-audit-combat-fixtures.mjs';

for(const scenario of ['opponent commander','same-controller commander','opponent hand','opponent commander hand'])test('second combat: paid '+scenario+' ninjutsu copy retains its actual controller and hand restriction',async()=>{
  const fromHand=scenario.endsWith('hand'),ordinaryHand=scenario==='opponent hand',opponentCopy=scenario.startsWith('opponent');
  const f=table(),attacker=f.put('Colossal Dreadmaw','hand'),yuriko=f.put(ordinaryHand?'Ninja of the Deep Hours':"Yuriko, the Tiger's Shadow",fromHand?'hand':'command');
  yuriko.commander=!ordinaryHand;const copyPlayer=opponentCopy?f.c:f.a,entryPlayer=ordinaryHand?f.a:copyPlayer;
  const favor=f.put('Return the Favor','hand',copyPlayer);
  f.lands([...Array(8).fill('Island'),...Array(8).fill('Swamp'),...Array(12).fill('Mountain'),...Array(20).fill('Forest')]);
  f.lands([...Array(12).fill('Mountain'),...Array(8).fill('Forest')],f.c);
  let activated=false,copied=false,entry;
  const emit=f.g.emit.bind(f.g);f.g.emit=async(event,data,...args)=>{
    if(event==='etb'&&data.card===yuriko)entry={controller:yuriko.ctrl.idx,owner:yuriko.owner.idx,tapped:yuriko.tapped,
      attacking:!!yuriko.attacking,inCombat:f.g.combat?.attackers.includes(yuriko)||false,
      originalOnStack:f.g.stack.some(row=>row.kind==='ability'&&row.srcCard===yuriko&&row.ctrl===f.a)};
    return emit(event,data,...args);
  };
  f.multi=(p,q)=>q.prompt?.startsWith('Return the Favor:')?[q.options[0].key]:undefined;
  f.targets=(p,q)=>{
    if(q.src===favor){const ability=q.candidates.find(row=>row.kind==='ability'&&row.srcCard===yuriko);if(ability)return [ability];}
    return undefined;
  };
  f.cards=(p,q)=>q.prompt?.includes('Ninjutsu: return')&&q.from.includes(attacker)?[attacker]:undefined;
  f.main=(p,q)=>{
    if(p===f.a&&q.phase==='main1'&&attacker.zone==='hand'&&f.a.turnsStarted===1){
      const row=q.casts.find(row=>row.card===attacker);assert.ok(row);return {kind:'cast',card:attacker,from:row.from,alt:row.alt};
    }
    return {kind:'done'};
  };
  f.attackers=(p,q)=>p===f.a&&f.a.turnsStarted===2&&q.eligible.includes(attacker)?[{card:attacker,target:f.b}]:[];
  f.priority=(p,q)=>{
    if(!activated&&p===f.a&&f.g.step==='blockers'&&f.g.combat?.attackers.includes(attacker)){
      const offered=q.acts.find(row=>row.card===yuriko&&row.ninjutsu);assert.ok(offered);
      activated=true;return {kind:'activate',entry:offered};
    }
    if(activated&&!copied&&p===copyPlayer&&f.g.stack.some(row=>row.kind==='ability'&&row.srcCard===yuriko)){
      const row=q.casts.find(row=>row.card===favor);assert.ok(row,'actual printed copy spell is payable in response');
      copied=true;return {kind:'cast',card:favor,from:row.from,alt:row.alt};
    }
    return {kind:'pass'};
  };
  await f.g.runTurn();for(let n=0;n<4;n++)await f.g.runTurn();
  assert.equal(activated,true);assert.equal(copied,true);assert.ok(entry);
  assert.equal(entry.originalOnStack,!ordinaryHand,ordinaryHand?'CR702.49a copied ability cannot put a card onto the battlefield from a different player hand':'the commander enters from the copy before the original ability resolves');
  assert.equal(entry.owner,f.a.idx);assert.equal(entry.controller,entryPlayer.idx,'CR110.2a and702.49d use the resolving copied ability controller');
  assert.equal(entry.tapped,true);assert.equal(entry.attacking,!opponentCopy||ordinaryHand);assert.equal(entry.inCombat,!opponentCopy||ordinaryHand);
  assert.equal(yuriko.zone,'battlefield');assert.equal(yuriko.ctrl.idx,entryPlayer.idx);assert.equal(attacker.zone,'hand');
  assert.equal(f.events.filter(row=>row.event==='etb'&&row.data.card===yuriko).length,1,'the original ability cannot move the new battlefield incarnation again');
  assert.equal(f.b.life,ordinaryHand?38:opponentCopy?40:39);
  stable(f,'actual copied commander ninjutsu control receipt');
});
