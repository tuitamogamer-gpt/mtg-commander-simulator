import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

for(const role of ['human','ai'])for(const remove of [false,true])test(`${role}: paid Deep Gnome does not consume an impossible search${remove?' before Stranglehold is removed':''}`,async()=>{
 const f=nativeFixture(role),orrery=await f.cast('Vedalken Orrery',Array(4).fill('Wastes'));
 f.targets=q=>q.candidates.includes(orrery)?[orrery]:q.candidates.includes(f.rival)?[f.rival]:undefined;
 await f.cast('Donate',['Island','Wastes','Wastes']);assert.equal(orrery.ctrl,f.rival);
 const source=await f.cast('Deep Gnome Terramancer',['Plains','Wastes']);
 const lock=await f.cast('Stranglehold',['Mountain','Wastes','Wastes','Wastes'],{player:f.rival});assert.equal(f.game.canSearchLibrary(f.me),false);
 const plains=f.put('Plains','library');
 f.cards=q=>q.from?.length?[q.from.find(c=>c.name==='Forest')||q.from.find(c=>c.name==='Plains')||q.from[0]]:undefined;
 f.put('Forest','library',f.rival);await f.cast('Rampant Growth',['Forest','Wastes'],{player:f.rival});assert.equal(plains.zone,'library','the native prohibition prevents the first search');
 if(remove){f.targets=q=>q.candidates.includes(lock)?[lock]:undefined;await f.cast('Disenchant',['Plains','Wastes']);assert.equal(lock.zone,'graveyard');assert.equal(f.game.canSearchLibrary(f.me),true);}
 f.put('Forest','library',f.rival);await f.cast('Rampant Growth',['Forest','Wastes'],{player:f.rival});
 assert.equal(plains.zone,remove?'battlefield':'library','only an actually permitted search consumes the action limit');
 const choices=f.questions.filter(q=>q.type==='chooseOption'&&q.aiHint?.src===source&&q.prompt?.includes('Search for a Plains?'));
 assert.equal(choices.length,remove?1:0,'CR608.2d does not offer an impossible search choice');
});
