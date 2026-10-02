import strict from 'node:assert/strict';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
const total=p=>Object.values(p.pool).reduce((a,b)=>a+b,0);
export async function proveRandomV25(M,f,name,h,assert=strict){
 const {game,a,b}=f;h.fund(a,100);const host=h.permanent(M,game,b,'Grizzly Bears'),own=h.permanent(M,game,a,'Colossal Dreadmaw'),artifact=h.permanent(M,game,b,'Sol Ring');
 const source=h.zoneCard(M,a,name,'hand'),before=total(a);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);assert.ok(total(a)<before);
 if(name==='Scab-Clan Giant'){
  await game.resolveTop();await game.flushTriggers();const trigger=game.stack.find(row=>row.srcCard===source);assert.ok(trigger);assert.equal(trigger.targets[0]===host,true,'Random fight target is chosen when the trigger is announced');await h.resolveAll(game);assert.equal(host.zone,'graveyard');assert.equal(source.damage,2);assert.equal(own.damage,0);assert.equal(artifact.zone,'battlefield');
 }else if(name==='Cinderheart Giant'){
  await h.resolveAll(game);M.E.pumpUntilEOT(game,host,0,0,['hexproof']);game.recalc();assert.equal(host.kw('hexproof'),true);await game.destroy(source);await game.flushTriggers();const trigger=game.stack.find(row=>row.srcCard===source);assert.ok(trigger);assert.equal(trigger.targets.length,0);await h.resolveAll(game);assert.equal(host.zone,'graveyard');assert.equal(source.zone,'graveyard');assert.equal(own.damage,0);assert.equal(artifact.zone,'battlefield');
 }else if(name==='Goblin Test Pilot'){
  await h.resolveAll(game);source.sick=false;const ability=game.activatableList(a).find(row=>row.card===source);assert.ok(ability);game.rnd=()=>0;const life=a.life,other=b.life;assert.equal(await game.activateAbility(a,ability,[b]),true);assert.equal(source.tapped,true);assert.equal(game.stack[0].targets[0]===a,true,'Printed random targeting overrides a supplied target');await h.resolveAll(game);assert.equal(a.life,life-2);assert.equal(b.life,other);assert.equal(host.damage,0);assert.equal(artifact.zone,'battlefield');
 }else throw Error('Unproved random source '+name);
 assertGameStateInvariants(game);
}
export async function operationProofV25(M,entry,operation,role,h){
 if(!/hand-choice-v25|hand-duplicates-v25|hand-grave-choices-v25|hand-sacrifice-colors-v25|hand-grave-exile-v25|clash-control-attached-v25|tokens-clash-keywords-v25|fateseal-v25|random-creature-damage-v25|oracleRandomV25/.test(JSON.stringify(entry.implementation)))return null;
 let checks=0;const assert={equal:(...args)=>{checks++;strict.equal(...args);},ok:(...args)=>{checks++;strict.ok(...args);},deepEqual:(...args)=>{checks++;strict.deepEqual(...args);}};
 const fund=p=>h.fund(p,100),put=(M,g,p,name,zone='battlefield')=>zone==='battlefield'?h.permanent(M,g,p,name):h.zoneCard(M,p,name,zone),settle=g=>h.resolveAll(g);const name=entry.raw.name;
 if(['Cinderheart Giant','Scab-Clan Giant','Goblin Test Pilot'].includes(name)){
  const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'});h.fillLibrary(M,f.a,30);h.fillLibrary(M,f.b,30);await proveRandomV25(M,f,name,h,assert);h.assertControllerRole(M,f,name);return checks;
 }
 if(['Captivating Glance','Gilt-Leaf Ambush'].includes(name)){for(const outcome of ['win','tie','lose']){
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.fillLibrary(M,a,30);h.fillLibrary(M,b,30);fund(a);const host=put(M,game,b,'Grizzly Bears'),older=put(M,game,a,'Grizzly Bears');
 put(M,game,a,outcome==='win'?'Colossal Dreadmaw':outcome==='tie'?'Shock':'Forest','library');put(M,game,b,outcome==='lose'?'Colossal Dreadmaw':outcome==='tie'?'Shock':'Forest','library');
 const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(host)?[host]:q.aiHint?.kind==='clashPlace'?'top':decide(g,q);
 const oldIds=new Set(game.bf().map(c=>c.iid)),source=put(M,game,a,name,'hand'),before=total(a);assert.equal(await game.castSpell(a,source,{from:'hand',quickTargets:[host]}),true);assert.ok(total(a)<before);await settle(game);
 if(name==='Captivating Glance'){await game.emit('endStep',{player:a});await settle(game);assert.equal(host.ctrl,outcome==='win'?a:b);await game.move(source,'graveyard');game.recalc();assert.equal(host.ctrl,outcome==='win'?a:b);}
 else{const created=game.bf().filter(c=>!oldIds.has(c.iid)&&c.isToken);assert.equal(created.length,2);for(const token of created){assert.equal(token.power,1);assert.equal(token.toughness,1);assert.equal(token.hasSub('Elf'),true);assert.equal(token.hasSub('Warrior'),true);assert.equal(token.kw('deathtouch'),outcome==='win');}assert.equal(older.kw('deathtouch'),false);}
 assertGameStateInvariants(game);h.assertControllerRole(M,f,name);}}
 else if(['Mesmeric Sliver','Spin into Myth'].includes(name)){
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.fillLibrary(M,a,30);h.fillLibrary(M,b,30);const spare=game.addPlayer('Spare',{name:'Spare'},h.decision(),false);h.fillLibrary(M,spare,30);const others=[b,spare];fund(a);fund(b);const untouched=others[1].library.slice(),choices=[];const host=put(M,game,b,'Grizzly Bears'),top=put(M,game,b,'Shock','library');
 const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(host)?[host]:q.aiHint?.kind==='chooseOpponent'?String(b.idx):q.type==='scry'&&q.libraryOwner?(choices.push(q),{top:[],bottom:q.cards}):decide(g,q);
 const source=put(M,game,a,name,'hand'),before=total(a);assert.equal(await game.castSpell(a,source,{from:'hand',quickTargets:[host]}),true);assert.ok(total(a)<before);await settle(game);
 assert.equal(choices.length,1);assert.equal(choices[0].player,a);assert.equal(choices[0].libraryOwner,b);assert.equal(b.library[0],name==='Spin into Myth'?host:top);assert.equal(choices[0].cards.length,name==='Spin into Myth'?2:1);assert.deepEqual(others[1].library,untouched);
 if(name==='Mesmeric Sliver'){
  const ownSliver=new M.CardInst({...M.DEFS['Grizzly Bears'],name:'Granted fateseal witness',subtypes:['Sliver']},b);ownSliver.ctrl=b;ownSliver.zone='hand';b.hand.push(ownSliver);game.turnPlayer=b;
  const old=b.controller.decide.bind(b.controller);b.controller.decide=(g,q)=>q.aiHint?.kind==='chooseOpponent'?String(a.idx):q.type==='scry'&&q.libraryOwner?{top:q.cards,bottom:[]}:old(g,q);
  let grantedChoice;const cdecide=b.controller.decide;b.controller.decide=(g,q)=>{if(q.type==='scry'&&q.libraryOwner)grantedChoice=q;return cdecide(g,q);};assert.equal(await game.castSpell(b,ownSliver,{from:'hand'}),true);await settle(game);assert.ok(grantedChoice);assert.equal(grantedChoice.player,b);assert.equal(grantedChoice.libraryOwner,a);
 }assertGameStateInvariants(game);h.assertControllerRole(M,f,name);}
 else {
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.fillLibrary(M,a,30);h.fillLibrary(M,b,30);fund(a);const seen=[];game.revealToHuman=async row=>{seen.push(row);};
 const bear=put(M,game,b,'Grizzly Bears','hand'),duplicate=put(M,game,b,'Grizzly Bears','hand'),land=put(M,game,b,'Forest','hand'),shock=put(M,game,b,'Shock','hand'),counter=put(M,game,b,'Counterspell','hand');
 const graveBear=put(M,game,b,'Grizzly Bears','graveyard'),graveShock=put(M,game,b,'Shock','graveyard');
 const host=put(M,game,b,'Grizzly Bears');
 const sacrificed=new M.CardInst({...M.DEFS['Grizzly Bears'],name:'Cost LKI fixture',cost:'{R}{G}',colors:['R','G']},a);sacrificed.zone='battlefield';sacrificed.ctrl=a;sacrificed.sick=false;game.battlefield.push(sacrificed);game.recalc();
 const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'?q.candidates.includes(b)?[b]:q.candidates.includes(host)?[host]:decide(g,q):q.type==='chooseCards'?q.from.includes(sacrificed)&&q.min?[sacrificed]:q.from.includes(bear)?[bear]:q.from.includes(graveBear)?[graveBear]:decide(g,q):decide(g,q);
 const source=put(M,game,a,entry.raw.name,'hand'),before=total(a);assert.equal(await game.castSpell(a,source,{from:'hand',quickTargets:[host]}),true);assert.ok(total(a)<before);await settle(game);
 if(entry.raw.name==='Rag Man'){source.sick=false;const activation=game.activatableList(a).find(e=>e.card===source);assert.ok(activation);assert.equal(await game.activateAbility(a,activation,[b]),true);await settle(game);assert.equal([bear,duplicate].filter(c=>c.zone==='graveyard').length,1);assert.equal(shock.zone,'hand');assert.equal(land.zone,'hand');}
 else if(entry.raw.name==='Mind Extraction'){assert.equal(sacrificed.zone,'graveyard');assert.equal(bear.zone,'graveyard');assert.equal(duplicate.zone,'graveyard');assert.equal(shock.zone,'graveyard');assert.equal(counter.zone,'hand');assert.equal(land.zone,'hand');}
 else if(entry.raw.name==='Hint of Insanity'){assert.equal(bear.zone,'graveyard');assert.equal(duplicate.zone,'graveyard');assert.equal(shock.zone,'hand');assert.equal(land.zone,'hand');}
 else if(entry.raw.name==='Thought Distortion'){assert.equal(shock.zone,'exile');assert.equal(counter.zone,'exile');assert.equal(graveShock.zone,'exile');assert.equal(graveBear.zone,'graveyard');assert.equal(land.zone,'hand');assert.equal(bear.zone,'hand');}
 else if(entry.raw.name==='Dreams of Steel and Oil'){assert.equal(bear.zone,'exile');assert.equal(graveBear.zone,'exile');assert.equal(shock.zone,'hand');assert.equal(graveShock.zone,'graveyard');}
 else if(entry.raw.name==='Vendilion Clique'){assert.equal(bear.zone,'library');assert.equal(b.library[0],bear);assert.equal(b.hand.length,5);assert.equal(seen.filter(r=>r.kind==='look')[0].ctrl,a);assert.ok(seen.some(r=>r.cards.length===1&&r.cards[0]===bear&&r.kind==='reveal'));}
 else if(entry.raw.name==='Oildeep Gearhulk'){assert.equal(bear.zone,'graveyard');assert.equal(b.hand.length,5);assert.equal(seen.filter(r=>r.kind==='look')[0].ctrl,a);}
 else if(entry.raw.name==='Cracked Skull'){assert.equal(bear.zone,'graveyard');assert.equal(source.attachedTo,host.iid);await game.damageCreature(shock,host,1);await settle(game);assert.equal(host.zone,'graveyard');assert.equal(source.zone,'graveyard');}
 else throw Error('No whole-body fixture');assertGameStateInvariants(game);h.assertControllerRole(M,f,name);}
 return checks;
}
