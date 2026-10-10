import test from 'node:test';
import assert from 'node:assert/strict';
import {table,stable} from './helpers/second-audit-combat-fixtures.mjs';

const scenarios=[
  {mode:'normal',label:'prevents damage from its actual blocked creature'},
  {mode:'skull',label:'does not prevent actual Skullcrack combat damage'},
  {mode:'fight',label:'prevents actual Pit Fight and combat damage while blocking'},
  {mode:'disabled',label:'loses prevention after actual paid Lignify while blocking'},
];
for(const {mode,label} of scenarios)test('second combat: paid Wall of Vapor '+label,async()=>{
  const unpreventable=mode==='skull',disabled=mode==='disabled';
  const f=table(),bear=f.put('Grizzly Bears','hand'),wall=f.put('Wall of Vapor','hand',f.b);
  const response=mode==='normal'?null:f.put(mode==='skull'?'Skullcrack':mode==='fight'?'Pit Fight':'Lignify','hand');
  const orrery=disabled?f.put('Vedalken Orrery','hand'):null;
  f.lands([...Array(8).fill('Forest'),...Array(8).fill('Mountain')]);
  f.lands(Array(8).fill('Island'),f.b);
  let blocked=false,responsePaid=false;const hits=[],damage=[];
  const emit=f.g.emit.bind(f.g);
  f.g.emit=async(event,data,...args)=>{
    if(event==='damagePrevented'&&!f.g._damageEventQueue&&data.src===bear&&data.target===wall)hits.push(data.n);
    if(event==='dealtDamage'&&!f.g._damageEventQueue&&data.src===bear&&data.target===wall)damage.push({n:data.n,combat:data.combat});
    return emit(event,data,...args);
  };
  f.main=(p,q)=>{
    const card=p===f.a?(orrery?.zone==='hand'?orrery:bear):p===f.b?wall:null;
    if(card?.zone==='hand'){
      const row=q.casts.find(row=>row.card===card);assert.ok(row,'printed creature is actually offered');
      return {kind:'cast',card,from:row.from,alt:row.alt};
    }
    return {kind:'done'};
  };
  f.attackers=(p,q)=>p===f.a&&f.a.turnsStarted===2&&q.eligible.includes(bear)?[{card:bear,target:f.b}]:[];
  f.blockers=(p,q)=>{
    if(p!==f.b)return [];
    assert.ok(q.potential.includes(wall),'paid Wall is a native eligible blocker');
    blocked=true;return [{blocker:wall,attacker:bear}];
  };
  f.targets=(p,q)=>{
    if(mode==='skull'&&q.candidates.includes(f.b))return [f.b];
    if(['fight','disabled'].includes(mode)&&q.candidates.includes(wall))return [wall];
    if(mode==='fight'&&q.candidates.includes(bear))return [bear];
    return q.candidates.slice(0,q.min||0);
  };
  f.priority=(p,q)=>{
    if(response&&!responsePaid&&p===f.a&&f.g.step==='blockers'&&f.g.combat?.blockersDeclared){
      const row=q.casts.find(row=>row.card===response);assert.ok(row,'actual payable response after blockers');
      responsePaid=true;return {kind:'cast',card:response,from:row.from,alt:row.alt};
    }
    return {kind:'pass'};
  };
  for(let n=0;n<5;n++)await f.g.runTurn();
  assert.equal(blocked,true,'native blocker declaration occurred');
  assert.equal(responsePaid,mode!=='normal');
  assert.equal(bear.zone,'battlefield');
  assert.equal(wall.zone,unpreventable?'graveyard':'battlefield','printed prevention follows actual blocked creature');
  assert.equal(hits.reduce((sum,n)=>sum+n,0),unpreventable||disabled?0:mode==='fight'?4:2);
  assert.equal(damage.reduce((sum,hit)=>sum+hit.n,0),unpreventable||disabled?2:0,'actual prevented and unprevented damage receipts');
  if(disabled){assert.equal(wall.toughness,4);assert.equal(wall.cur.abilitiesDisabled,true);assert.equal(damage[0].combat,true);}
  if(response)assert.equal(f.casts.filter(row=>row.card===response).length,1,'response was actually cast once');
  assert.equal(f.b.life,unpreventable?37:40);
  stable(f,'paid native Wall of Vapor combat');
});
