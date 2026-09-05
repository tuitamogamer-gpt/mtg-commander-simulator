import test from 'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{semanticClass}from'../scripts/import-oracle-batch.mjs';import{loadEngine}from'./helpers/load-engine.mjs';import{context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
const M=loadEngine(),raw=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-draw-replacement-source.json',import.meta.url))),entries=raw.map((card,i)=>{const semantic=semanticClass(card),types=card.type_line.split(' — ')[0].split(' ');assert.ok(semantic.semanticClass,card.name);return{position:i+1,oracleId:card.oracle_id,scryfallId:card.id,...semantic,raw:{name:card.name,oracle:card.oracle_text,cost:card.mana_cost,types:types.filter(t=>!['Legendary','Basic','Snow'].includes(t)),super:types.filter(t=>['Legendary','Basic','Snow'].includes(t)),subtypes:card.type_line.split(' — ')[1]?.split(' ')||[],power:card.power,toughness:card.toughness,_ci:card.color_identity},catalog:{typeLine:card.type_line,commanderLegality:'legal'}};});
M.registerOracleBatch({id:'draw-replacement-source-draft',sequence:9993,cards:entries.filter(c=>!M.DEFS[c.raw.name])});M.initData(M.RAW_DATA);
const fund=p=>{for(const c of ['W','U','B','R','G','C'])p.pool[c]=100;};
function setup(role,opponents=1){const ctx=context(M,role,opponents),{game,a,b}=ctx;ctx.choice={};const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>{if(role==='human'&&q.aiHint?.kind==='drawReplacementOptional')return ctx.choice.optional||'no';if(role==='human'&&q.type==='chooseTargets'&&ctx.choice.target&&q.candidates.includes(ctx.choice.target))return[ctx.choice.target];if(ctx.choice.first&&q.aiHint?.kind==='replacementOrder')return q.options.find(o=>o.source?.name===ctx.choice.first)?.key??q.options[0].key;return decide(g,q);};return ctx;}
async function cast(ctx,name){fund(ctx.a);const card=put(M,ctx.game,ctx.a,name,'hand'),before=Object.values(ctx.a.pool).reduce((a,b)=>a+b,0);assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);await settle(ctx.game);assert.ok(Object.values(ctx.a.pool).reduce((a,b)=>a+b,0)<before);return card;}
async function activate(ctx,source){const list=ctx.game.activatableList(ctx.a).filter(row=>row.card===source),entry=list.find(row=>!row.mana)||list[0];assert.ok(entry,source.name+': paid ability');const before=Object.values(ctx.a.pool).reduce((a,b)=>a+b,0);assert.equal(await ctx.game.activateAbility(ctx.a,entry),true);await settle(ctx.game);assert.equal(Object.values(ctx.a.pool).reduce((a,b)=>a+b,0),before-1);}
for(const role of ['human','ai']){
 for(const entry of entries)test(`${role}: ${entry.raw.name} replaces an actual draw after a paid source spell`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx;ctx.choice.target=b;const source=await cast(ctx,entry.raw.name),op=entry.implementation.find(op=>op.kind==='draw-replacement-v8'),action=entry.implementation.find(op=>op.kind==='generic-ability')?.effects[0];
  if(entry.raw.name.startsWith('Words of ')){put(M,game,b,'Grizzly Bears');put(M,game,b,'Grizzly Bears','hand');await activate(ctx,source);}
  if(op?.mode==='look-three'||op?.mode==='reveal-creatures')for(const name of ['Serra Angel','Forest','Grizzly Bears'])put(M,game,a,name,'library');
  if(op?.mode==='win-empty'){for(const card of a.library.slice())await game.move(card,'exile');}
  const player=op?.mode==='redirect'||entry.raw.name==='Plagiarize'?b:a,hand=a.hand.length,otherHand=b.hand.length,life=a.life,grave=a.graveyard.length,exile=a.exile.length,tokens=game.bf().filter(card=>card.isToken).length,ownBoard=game.bf().filter(card=>card.ctrl===a).length,oppBoard=game.bf().filter(card=>card.ctrl===b).length;
  const events=[],emit=game.emit.bind(game);game.emit=async(event,data)=>{if(event==='draw')events.push(data);return emit(event,data);};const drawn=await game.draw(player,1,source);
  if(op?.mode==='multiply'){assert.equal(a.hand.length-hand,2);assert.equal(drawn,2);assert.equal(events.length,2);}
  else if(op?.mode==='redirect'||entry.raw.name==='Plagiarize'){assert.equal(a.hand.length-hand,1);assert.equal(b.hand.length,otherHand);assert.equal(drawn,0);assert.equal(events[0].player,a);}
  else if(op?.mode==='empty-hand'){assert.equal(a.hand.length-hand,2);assert.equal(a.life,life-1);assert.equal(events.length,2);}
  else if(op?.mode==='look-three'){assert.equal(a.hand.length-hand,1);assert.equal(events.length,0);assert.equal(a.graveyard.length-grave,op.rest==='graveyard'?2:0);}
  else if(op?.mode==='reveal-creatures'){assert.equal(a.hand.length-hand,2);assert.equal(a.hand.every(card=>card.is('Creature')),true);assert.equal(events.length,0);}
  else if(op?.mode==='impulse'){assert.equal(a.exile.length-exile,2);assert.equal(events.length,0);for(const card of a.exile.slice(-2)){assert.equal(card.meta.playableBy,a);assert.equal(game.hasExilePlayPermission(a,card),true);}}
  else if(op?.mode==='win-empty'){assert.equal(game.winner,a);assert.equal(!!a.deckedOut,false);assert.equal(events.length,0);}
  else if(op?.mode==='skip'||op?.mode==='study'){assert.equal(a.hand.length-hand,1);assert.equal(events.length,1);}
  else if(action?.mode==='gain-life'){assert.equal(a.life,life+5);assert.equal(events.length,0);}
  else if(action?.mode==='discard-opponents'){assert.equal(b.hand.length,otherHand-1);assert.equal(events.length,0);}
  else if(action?.mode==='bounce-each'){assert.equal(game.bf().filter(card=>card.ctrl===a).length,ownBoard-1);assert.equal(game.bf().filter(card=>card.ctrl===b).length,oppBoard-1);assert.equal(events.length,0);}
  else if(action?.mode==='bear'){const made=game.bf().filter(card=>card.isToken);assert.equal(made.length,tokens+1);assert.equal(made.at(-1).name,'Bear Token');assert.equal(made.at(-1).power,2);assert.equal(events.length,0);}
  else assert.fail('Missing source evidence '+entry.raw.name);
  assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);
 });
 test(`${role}: opposing Notion Thieves each replace a draw once without looping`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx;await cast(ctx,'Notion Thief');fund(b);const other=put(M,game,b,'Notion Thief','hand');assert.equal(await game.castSpell(b,other,{from:'hand'}),true);await settle(game);const ownHand=a.hand.length,otherHand=b.hand.length;assert.equal(await game.draw(a,1),1);assert.equal(a.hand.length,ownHand+1);assert.equal(b.hand.length,otherHand);assert.equal(game.gameOver,false);
 });
 test(`${role}: a resolved Plagiarize still replaces draws after its controller leaves multiplayer`,async()=>{
  const ctx=setup(role,2),{game,a,b}=ctx;ctx.choice.target=b;await cast(ctx,'Plagiarize');assert.ok(game.untilEffects.some(effect=>effect.kind==='oracleDrawReplacement'&&effect.playerSeat===b.idx));await game.playerLoses(a,'replacement creator departed');const hand=b.hand.length;assert.equal(await game.draw(b,1),0);assert.equal(b.hand.length,hand);assert.equal(game.gameOver,false);
 });
 test(`${role}: an unused paid Words replacement expires during real cleanup`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx;game.turnPlayer=a;let activated=false;game.combatPhase=async()=>{};game.mainPhase=async()=>{if(activated)return;activated=true;const source=await cast(ctx,'Words of Worship');await activate(ctx,source);};await game.runTurn();assert.equal(game.phase,'cleanup');assert.equal(activated,true);assert.equal(game.untilEffects.some(effect=>effect.kind==='oracleDrawReplacement'),false);const life=a.life,hand=a.hand.length;await game.draw(a,1);assert.equal(a.life,life);assert.equal(a.hand.length,hand+1);
 });
 test(`${role}: declining an optional replacement draws normally and an unpaid Words activation creates no replacement`,async()=>{
  const ctx=setup(role),{game,a}=ctx;await cast(ctx,'Obstinate Familiar');const mana={...a.pool};await game.draw(a,1);assert.equal(a.hand.length,1);assert.deepEqual({...a.pool},mana);const source=await cast(ctx,'Words of Worship'),ability=game.activatableList(a).find(row=>row.card===source);for(const color of Object.keys(a.pool))a.pool[color]=0;assert.equal(await game.activateAbility(a,ability),false);assert.equal(game.untilEffects.some(effect=>effect.kind==='oracleDrawReplacement'),false);
 });
 test(`${role}: optional skip prevents decking when the library is empty`,async()=>{
  const ctx=setup(role),{game,a}=ctx;await cast(ctx,'Obstinate Familiar');for(const card of a.library.slice())await game.move(card,'exile');ctx.choice.optional='yes';assert.equal(await game.draw(a,1),0);assert.equal(a.lost,false);assert.equal(!!a.deckedOut,false);
 });
 test(`${role}: Pursuit pays three accumulated study counters and itself before drawing seven`,async()=>{
  const ctx=setup(role),{game,a}=ctx,source=await cast(ctx,'Pursuit of Knowledge');for(let i=0;i<3;i++)put(M,game,a,'Forest','hand');ctx.choice.optional='yes';const hand=a.hand.length;await game.draw(a,3);assert.equal(source.counters.study,3);assert.equal(a.hand.length,hand);const ability=game.activatableList(a).find(row=>row.card===source);assert.ok(ability);assert.equal(await game.activateAbility(a,ability),true);await settle(game);assert.equal(source.zone,'graveyard');assert.equal(a.hand.length,hand+7);
 });
 test(`${role}: a Dredge choice replaces only its individual draw and a used Phial cannot expand its own replacement draws again`,async()=>{
  const ctx=setup(role),{game,a}=ctx;await cast(ctx,'Phial of Galadriel');put(M,game,a,'Stinkweed Imp','graveyard');const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>role==='human'&&q.aiHint?.kind==='dredge'?q.options.find(o=>o.card)?.key:decide(g,q);const before=a.library.length;await game.draw(a,1);const choices=ctx.trace.filter(row=>row.q.aiHint?.kind==='replacementOrder'),first=choices[0],source=first?.q.options.find(o=>o.key===String(first.result))?.source,phialFirst=!source||source.name==='Phial of Galadriel';assert.equal(a.library.length,before-(phialFirst?6:5));assert.equal(a.hand.length,phialFirst?2:1);assert.ok(a.hand.some(card=>card.name==='Stinkweed Imp'));assert.equal(a.turnState.drewThisTurn,phialFirst?1:0);assert.equal(game.gameOver,false);
 });
 test(`${role}: legacy object-shaped Dakmor dredge makes a legal concrete payment`,async()=>{
  const ctx=setup(role),{game,a}=ctx,dakmor=put(M,game,a,'Dakmor Salvage','graveyard'),before=a.library.length;const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>role==='human'&&q.aiHint?.kind==='dredge'?q.options.find(o=>o.card)?.key:decide(g,q);assert.equal(await game.draw(a,1),0);assert.equal(a.library.length,before-2);assert.equal(dakmor.zone,'hand');assert.equal(a.turnState.drewThisTurn,0);
 });
 test(`${role}: two actual Thought Reflections multiply once each and source phasing or ability loss stops replacement`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,one=await cast(ctx,'Thought Reflection'),two=await cast(ctx,'Thought Reflection');let n=a.hand.length;await game.draw(a,1);assert.equal(a.hand.length-n,4);game.phaseOut(one);n=a.hand.length;await game.draw(a,1);assert.equal(a.hand.length-n,2);game.phaseInFor(a);await game.move(two,'exile');await game.move(one,'exile');const creature=await cast(ctx,'Blood Scrivener'),aura=put(M,game,b,'Lignify','hand');await game.move(aura,'battlefield',{attachTo:creature});for(const card of a.hand.slice())await game.move(card,'graveyard');n=a.life;await game.draw(a,1);assert.equal(a.hand.length,1);assert.equal(a.life,n);
 });
 test(`${role}: the first draw exception applies only in that player's own draw step`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx;await cast(ctx,"Alhammarret's Archive");game.phase='draw';a.turnState._firstDrawDone=false;let hand=a.hand.length;await game.draw(a,2);assert.equal(a.hand.length-hand,3);a.turnState._firstDrawDone=false;game.turnPlayer=b;hand=a.hand.length;await game.draw(a,1);assert.equal(a.hand.length-hand,2);
 });
 test(`${role}: a paid Words effect is consumed once and persists when its source leaves or the game is cloned`,async()=>{
  const ctx=setup(role),{game,a}=ctx,source=await cast(ctx,'Words of Worship');await activate(ctx,source);await game.move(source,'graveyard');const clone=M.cloneGameForAISimulation(game,17),life=a.life;await clone.draw(clone.players[0],2);assert.equal(clone.players[0].life,life+5);assert.equal(clone.players[0].hand.length,1);assert.equal(a.life,life);await game.draw(a,2);assert.equal(a.life,life+5);assert.equal(a.hand.length,1);
 });
 test(`${role}: replaced Underrealm draws do not deck out, trigger draws, or reuse the looked-at three across a sequence`,async()=>{
  const ctx=setup(role),{game,a}=ctx;await cast(ctx,'Underrealm Lich');while(a.library.length>4)await game.move(a.library[0],'exile');assert.equal(await game.draw(a,3),0);assert.equal(a.hand.length,2);assert.equal(a.library.length,0);assert.equal(a.lost,false);assert.equal(a.turnState.drewThisTurn,0);
 });
}
