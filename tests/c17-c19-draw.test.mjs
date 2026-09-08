import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,play,event,settle} from './helpers/c17-c19-fixtures.mjs';
for(const role of ['human','ai']){
 test(role+': Abundance finds the chosen kind, bottoms the others, and does not draw',async()=>{
  const f=setup(role);await play(f,'Abundance');for(let i=0;i<3;i++)card(f,'Forest','hand');const c=card(f,'Grizzly Bears','library'),top=card(f,'Forest','library');
  if(role==='human')f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.endsWith('choose land or nonland')?'nonland':undefined;
  let draws=0;const emit=f.game.emit.bind(f.game);f.game.emit=async(n,d)=>{if(n==='draw')draws++;return emit(n,d);};assert.equal(await f.game.draw(f.a,1),0);assert.equal(c.zone,'hand');assert.equal(f.a.library[0],top);assert.equal(draws,0);assert.equal(f.a.hand.length,4);
 });
 test(role+': Alms Collector replaces a multi-card instruction, but leaves separate single draws alone',async()=>{
  const f=setup(role);await play(f,'Alms Collector');assert.equal(await f.game.draw(f.b,5),1);assert.equal(f.a.hand.length,1);assert.equal(f.b.hand.length,1);await f.game.draw(f.b,1);await f.game.draw(f.b,1);assert.equal(f.a.hand.length,1);assert.equal(f.b.hand.length,3);
 });
 test(role+': Alms applies once before Thought Reflection and can replace a doubled single draw',async()=>{
  const f=setup(role);await play(f,'Alms Collector');card(f,'Thought Reflection','battlefield',f.b);await f.game.draw(f.b,5);assert.equal(f.a.hand.length,1);assert.equal(f.b.hand.length,2);
  await f.game.draw(f.b,1);assert.equal(f.a.hand.length,2);assert.equal(f.b.hand.length,3);
 });
 test(role+': Two opposing Collectors apply independently to each multi-card draw',async()=>{
  const f=setup(role,3);await play(f,'Alms Collector');card(f,'Alms Collector','battlefield',f.b);await f.game.draw(f.a,5);await f.game.draw(f.b,5);assert.equal(f.a.hand.length,2);assert.equal(f.b.hand.length,2);
 });
}
test('Alms modifies the multi-card instruction before the affected player dredges their resulting single draw',async()=>{
 const f=setup('human',3);card(f,'Alms Collector');const imp=card(f,'Stinkweed Imp','graveyard',f.b);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt==='Replace this draw with dredge?'?'dredge:'+imp.iid:undefined;
 await f.game.draw(f.b,4);assert.equal(f.a.hand.length,1);assert.equal(f.b.hand.length,1);assert.equal(f.b.hand[0],imp);assert.equal(f.b.graveyard.length,5);assert.equal(f.b.library.length,25);
});
test('Abundance with no matching card or an empty library never causes a failed draw',async()=>{
 const f=setup();card(f,'Abundance');f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.endsWith('choose land or nonland')?'nonland':undefined;await f.game.draw(f.a,1);assert.equal(f.a.hand.length,0);assert.equal(f.a.library.length,30);assert.equal(f.a.lost,false);for(const c of f.a.library.slice())await f.game.move(c,'exile');await f.game.draw(f.a,1);assert.equal(f.a.lost,false);assert.equal(!!f.a.deckedOut,false);
});
test('The affected player chooses between Collectors and each resulting draw still permits Abundance',async()=>{
 const f=setup('human',3);card(f,'Alms Collector');const c=card(f,'Alms Collector','battlefield',f.b);card(f,'Abundance','battlefield',f.others[1]);
 f.decide=(p,q)=>q.type==='chooseOption'&&q.aiHint?.kind==='replacementOrder'?q.options.find(o=>o.source===c)?.key:undefined;
 await f.game.draw(f.others[1],4);assert.equal(f.a.hand.length,0);assert.equal(f.b.hand.length,1);assert.equal(f.others[1].hand.length,1);assert.equal(f.others[1].turnState._firstDrawDone,undefined);
});
