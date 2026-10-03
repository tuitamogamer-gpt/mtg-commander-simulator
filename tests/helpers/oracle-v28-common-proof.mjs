import strict from 'node:assert/strict';import {assertGameStateInvariants} from './game-state-invariants.mjs';
const total=p=>Object.values(p.pool).reduce((a,b)=>a+b,0);
export async function operationProofV28(M,entry,operation,role,h){
 if(!/entry-(?:land|creature)-type-v28/.test(JSON.stringify(entry.implementation)))return null;
 let checks=0;const assert={equal:(...args)=>{checks++;strict.equal(...args);},ok:(...args)=>{checks++;strict.ok(...args);}};
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.fillLibrary(M,a,30);h.fillLibrary(M,b,30);h.fund(a,100);h.fund(b,100);
 const name=entry.raw.name,types=name==='Illusionary Terrain'?['Forest','Mountain']:name==='Convincing Mirage'?'Mountain':name==='Thran Portal'||name==='Multiversal Passage'||name==='Shimmer'?'Forest':'Island';let index=0,target;
 const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.prompt==='Choose a creature type'?'Goblin':/basic land type/.test(q.prompt||'')?Array.isArray(types)?types[Math.min(index++,types.length-1)]:types:q.prompt==='Choose land type'?types:q.type==='chooseOption'&&q.aiHint?.kind==='basicLandType'?types:q.prompt?.endsWith('pay 2 life?')?'pay':q.type==='chooseTargets'&&target&&q.candidates.includes(target)?[target]:decide(g,q);
 if(name==='Convincing Mirage')target=h.permanent(M,game,b,'Forest');
 if(name==="Traveler's Cloak")target=h.permanent(M,game,a,'Grizzly Bears');
 const source=h.zoneCard(M,a,name,'hand'),before=total(a),entryLife=a.life;
 if(name==='Thran Portal'||name==='Multiversal Passage'){
  assert.equal(await game.playLand(a,source),true);await h.resolveAll(game);assert.equal(source.tapped,false);assert.equal(source.hasSub('Forest'),true);
  if(name==='Multiversal Passage')assert.equal(a.life,entryLife-2);
  for(const color of ['W','U','B','R','G','C'])a.pool[color]=0;
  if(name==='Thran Portal')assert.equal(game.manaSources(a).find(row=>row.card===source).extraCost.life,1,'Portal intrinsic mana has exactly one added life cost');
  const creature=h.zoneCard(M,a,'Llanowar Elves','hand'),life=a.life;assert.equal(await game.castSpell(a,creature,{from:'hand'}),true);await h.resolveAll(game);assert.equal(source.tapped,true);assert.equal(creature.zone,'battlefield');assert.equal(a.life,life-(name==='Thran Portal'?1:0));
 }else{
  assert.equal(await game.castSpell(a,source,{from:'hand',...(target?{quickTargets:[target]}:{})}),true);await h.resolveAll(game);assert.ok(total(a)<before);assert.equal(source.zone,'battlefield');
  if(['Conspiracy','Leyline of Transformation','Ashes of the Fallen'].includes(name)){
   const grave=h.zoneCard(M,a,'Grizzly Bears','graveyard'),enemy=h.zoneCard(M,b,'Grizzly Bears','graveyard'),hand=h.zoneCard(M,a,'Grizzly Bears','hand'),own=h.permanent(M,game,a,'Grizzly Bears'),retain=name!=='Conspiracy';
   assert.equal(grave.hasSub('Goblin'),true);assert.equal(grave.hasSub('Bear'),retain);assert.equal(enemy.hasSub('Goblin'),false);assert.ok(game.snapshot(grave).subtypes.includes('Goblin'));
   assert.equal(hand.hasSub('Goblin'),name!=='Ashes of the Fallen');assert.equal(own.hasSub('Goblin'),name!=='Ashes of the Fallen');
   if(name!=='Ashes of the Fallen'){assert.equal(await game.castSpell(a,hand,{from:'hand'}),true);assert.equal(hand.hasSub('Goblin'),true);await h.resolveAll(game);assert.equal(hand.hasSub('Goblin'),true);}
   await game.move(source,'exile');assert.equal(grave.hasSub('Goblin'),false);assert.equal(grave.hasSub('Bear'),true);assert.equal(own.hasSub('Goblin'),false);
  }else if(name==='Realmwright'){
   const land=h.permanent(M,game,a,'Forest'),enemy=h.permanent(M,game,b,'Forest');assert.equal(land.hasSub('Island'),true);assert.equal(land.hasSub('Forest'),true);assert.equal(enemy.hasSub('Island'),false);assert.ok(game.manaSources(a).some(row=>row.card===land&&row.produce.some(output=>output.U===1)));await game.move(source,'exile');assert.equal(land.hasSub('Island'),false);
  }else if(name==='Convincing Mirage'){
   assert.equal(target.hasSub('Mountain'),true);assert.equal(target.hasSub('Forest'),false);assert.ok(game.manaSources(b).some(row=>row.card===target&&row.produce.some(output=>output.R===1)));await game.move(source,'exile');assert.equal(target.hasSub('Forest'),true);
  }else if(name==='Illusionary Terrain'){
   const land=h.permanent(M,game,a,'Forest'),enemy=h.permanent(M,game,b,'Forest'),dual=h.permanent(M,game,b,'Temple Garden');assert.equal(land.hasSub('Mountain'),true);assert.equal(enemy.hasSub('Mountain'),true);assert.equal(dual.hasSub('Forest'),true);const mana=total(a);await game.emit('upkeep',{player:a});await h.resolveAll(game);assert.equal(source.counters.age,1);assert.equal(total(a),mana-2);await game.move(source,'exile');assert.equal(land.hasSub('Forest'),true);
  }else if(name==="Traveler's Cloak"){
   const blocker=h.permanent(M,game,b,'Grizzly Bears'),land=h.permanent(M,game,b,'Island');target.attacking=b;assert.equal(target.kw('islandwalk'),true);assert.equal(game.canBlock(blocker,target),false);assert.equal(a.hand.length,1);
   const combat=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='attackers'?[{card:target,target:b}]:combat(g,q);game.priorityRound=async()=>h.resolveAll(game);const life=b.life;await game.combatPhase(a);await h.resolveAll(game);assert.equal(b.life,life-2);await game.move(land,'exile');assert.equal(game.canBlock(blocker,target),true);await game.move(source,'exile');assert.equal(target.kw('islandwalk'),false);
  }else if(name==='Roots of Life'){
   const island=h.permanent(M,game,b,'Island'),swamp=h.permanent(M,game,b,'Swamp'),own=h.permanent(M,game,a,'Island'),life=a.life;
   assert.equal(await game.activateManaSource(b,game.manaSources(b).find(row=>row.card===island),{U:1}),true);await h.resolveAll(game);assert.equal(a.life,life+1);
   await game.activateManaSource(b,game.manaSources(b).find(row=>row.card===swamp),{B:1});await h.resolveAll(game);assert.equal(a.life,life+1);
   await game.activateManaSource(a,game.manaSources(a).find(row=>row.card===own),{U:1});await h.resolveAll(game);assert.equal(a.life,life+1);
   await game.move(source,'exile');island.tapped=false;await game.activateManaSource(b,game.manaSources(b).find(row=>row.card===island),{U:1});await h.resolveAll(game);assert.equal(a.life,life+1);
  }else if(name==='Shimmer'){
   const land=h.permanent(M,game,a,'Forest'),enemy=h.permanent(M,game,b,'Forest'),other=h.permanent(M,game,a,'Island'),version=land.zoneVersion;assert.equal(land.kw('phasing'),true);assert.equal(other.kw('phasing'),false);game.phaseDuringUntap(a);assert.equal(land.phasedOut,true);assert.equal(enemy.phasedOut,false);assert.equal(land.zoneVersion,version);await game.move(source,'exile');game.phaseDuringUntap(a);assert.equal(land.phasedOut,false);assert.equal(land.kw('phasing'),false);
  }else throw Error('Unproved chosen-land-type source '+name);
 }
 assertGameStateInvariants(game);h.assertControllerRole(M,f,name);return checks;
}
