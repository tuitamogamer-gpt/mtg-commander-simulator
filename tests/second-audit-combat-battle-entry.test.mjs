import test from 'node:test';
import assert from 'node:assert/strict';
import {M,table,paidCast,stable} from './helpers/second-audit-combat-fixtures.mjs';

for(const battleBody of [true,false])test('second combat: paid Delina copying '+(battleBody?'an animated Battle':'ordinary Bears')+' enters with legal combat status',async()=>{
  const f=table(8),delina=f.put('Delina, Wild Mage','hand');
  const model=f.put(battleBody?'Invasion of Dominaria // Serra Faithkeeper':'Grizzly Bears','hand');
  const mycosynth=battleBody?f.put('Encroaching Mycosynth','hand'):null;
  const march=battleBody?f.put('March of the Machines','hand'):null;
  const fervor=f.put('Fervor','hand');
  f.lands([...Array(12).fill('Mountain'),...Array(12).fill('Island'),...Array(8).fill('Plains'),...Array(12).fill('Forest')]);
  f.option=(p,q)=>{
    if(q.prompt?.includes('Roll again for Delina?'))return 'no';
    const opponent=q.options.find(row=>row.target===f.b);
    return opponent?.key;
  };
  await paidCast(f,f.a,delina);await paidCast(f,f.a,model);await paidCast(f,f.a,fervor);
  if(mycosynth){await paidCast(f,f.a,mycosynth);await paidCast(f,f.a,march);}
  assert.equal(model.is('Creature'),true);assert.equal(model.is('Battle'),battleBody);
  f.targets=(p,q)=>q.src===delina&&q.candidates.includes(model)?[model]:undefined;
  let entered;
  const emit=f.g.emit.bind(f.g);f.g.emit=async(event,data,...args)=>{
    if(event==='etb'&&data.card.isToken&&data.card.name===model.name){
      const card=data.card;
      entered={battle:card.is('Battle'),creature:card.is('Creature'),tapped:card.tapped,
        attacking:!!card.attacking,inCombat:f.g.combat?.attackers.includes(card)||false,
        defender:M.defendingPlayerV92(card.attacking)?.idx};
    }
    return emit(event,data,...args);
  };
  f.attackers=(p,q)=>p===f.a&&q.eligible.includes(delina)?[{card:delina,target:f.b}]:[];
  await f.g.runTurn();
  assert.ok(entered,'a real printed Delina trigger created the copy through native token entry');
  assert.equal(entered.battle,battleBody);assert.equal(entered.creature,true);assert.equal(entered.tapped,true);
  assert.equal(entered.attacking,!battleBody,'CR506.3f: a Battle creature put onto the battlefield attacking is never attacking');
  assert.equal(entered.inCombat,!battleBody);
  if(!battleBody){assert.equal(entered.defender,f.b.idx);assert.equal(f.b.life,35);}
  assert.equal(f.g.bf().some(card=>card.isToken&&card.name===model.name),false,'the printed delayed end-of-combat exile still resolves');
  stable(f,'paid Delina entry combat role');
});
