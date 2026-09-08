import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,settle} from './helpers/c17-c19-fixtures.mjs';
for(const role of ['human','ai']){
 test(role+': Archfiend remembers the damaging controller if the borrowed source dies before triggers are stacked',async()=>{const f=setup(role),a=await play(f,'Archfiend of Spite'),source=body(f,f.a);M.OracleV8Control.gain(f.game,source,f.b);f.game.recalc();f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('sacrifice or lose life')?'life':undefined;await f.game.damageCreature(source,a,2);await f.game.destroy(source);assert.equal(source.ctrl,f.a);await settle(f.game);assert.equal(f.b.life,38);assert.equal(f.a.life,40);});
 test(role+': Finest Hour adds exactly one combat after attacking alone in the first combat',async()=>{const f=setup(role),hour=await play(f,'Finest Hour'),b=body(f);b.sick=false;f.decide=(p,q)=>q.type==='attackers'?[{card:b,target:f.b}]:undefined;f.game.priorityRound=()=>settle(f.game);await f.game.combatPhase(f.a);assert.ok(!b.tapped);assert.equal(f.b.life,37);const scheduled=f.game._additionalPhases;assert.equal(scheduled.length,1);await f.game.combatPhase(f.a);assert.equal(f.game._additionalPhases.length,1);assert.equal(b.tapped,true);assert.equal(f.b.life,33);assert.equal(hour.zone,'battlefield');});
}
