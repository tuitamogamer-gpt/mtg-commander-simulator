import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {semanticClass}from'../scripts/import-oracle-batch.mjs';import{extensionLine}from'../scripts/oracle-v8-ripple.mjs';import{loadEngine}from'./helpers/load-engine.mjs';
import{context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';import{rippleScenario,rippleChoices,ripplePaid}from'./helpers/oracle-ripple-proof.mjs';
const M=loadEngine(),raw=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-ripple-source.json',import.meta.url)));
const entries=raw.map((card,index)=>{const parsed=semanticClass(card),type=card.type_line.split(' — ')[0].split(' ');assert.ok(parsed.semanticClass,card.name+': '+parsed.reason);return{position:index+1,oracleId:card.oracle_id,scryfallId:card.id,...parsed,raw:{name:card.name,oracle:card.oracle_text,cost:card.mana_cost,types:type.filter(t=>!['Legendary','Snow','Basic'].includes(t)),super:type.filter(t=>['Legendary','Snow','Basic'].includes(t)),subtypes:card.type_line.split(' — ')[1]?.split(' ')||[],power:card.power,toughness:card.toughness,_ci:card.color_identity},catalog:{typeLine:card.type_line,commanderLegality:'legal'}};});
M.registerOracleBatch({id:'ripple-source-draft',sequence:9998,cards:entries.filter(entry=>!M.DEFS[entry.raw.name])});M.initData(M.RAW_DATA);
test('closed Ripple source schema rejects suffixes, unsupported counts and unknown runtime fields',()=>{
 assert.equal(raw.length,6);for(const line of ['Ripple 3','Ripple X','Ripple 4, haste','Ripple 4. Draw a card.','Spells you cast have ripple 4 until end of turn.'])assert.equal(extensionLine(raw[0],line),null,line);
 for(const bad of [{n:3},{scope:'opponents'},{extra:true},{contract:'unchecked'}])assert.throws(()=>M.OracleV8Ripple.apply({}, {kind:'ripple-v8',scope:'self',n:4,contract:'ripple-cast-chain',...bad}));
 const altered={...raw[0],oracle_text:raw[0].oracle_text+'\nAt the beginning of each square step, win the game.'};assert.equal(semanticClass(altered).semanticClass,undefined);
});
for(const role of ['human','ai']){
 for(const entry of entries)test(`${role}: ${entry.raw.name} has exact paid whole-source Ripple proof`,async()=>rippleScenario(M,entry,context(M,role)));
 test(`${role}: declining reveal preserves the complete library and leaks no identities`,async()=>{
  const ctx=context(M,role);rippleChoices(ctx);const before=ctx.a.library.slice();let revealed=0;ctx.game.revealToHuman=async()=>revealed++;
  const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=async(g,q)=>q.prompt?.startsWith('Ripple 4:')?'no':decide(g,q);
  await ripplePaid(M,ctx,'Surging Sentinels');await ctx.game.resolveTop();assert.deepEqual(ctx.a.library,before);assert.equal(revealed,0);assert.equal(ctx.game.stack.length,1);await settle(ctx.game);
 });
 test(`${role}: optional casting can decline after revelation and uses the player's exact bottom order`,async()=>{
  const ctx=context(M,role);rippleChoices(ctx);const {game,a}=ctx;const card=put(M,game,a,'Surging Sentinels','library'),island=put(M,game,a,'Island','library');const top=a.library.slice(-4).reverse();
  const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.prompt?.startsWith('You may cast one')?[]:q.prompt?.startsWith('Ripple: order')?q.from.slice().reverse():decide(g,q);
  await ripplePaid(M,ctx,'Surging Sentinels');await game.resolveTop();assert.equal(card.zone,'library');assert.equal(island.zone,'library');assert.deepEqual(a.library.slice(0,4),top);await settle(game);
 });
 test(`${role}: short and empty libraries reveal only available cards without drawing or losing`,async()=>{
  for(const count of [0,1,2,3]){const ctx=context(M,role);rippleChoices(ctx);const {game,a}=ctx;a.library=[];for(let i=0;i<count;i++)put(M,game,a,'Forest','library');let revealed=0;game.revealToHuman=async q=>revealed+=q.cards.length;
   await ripplePaid(M,ctx,'Surging Sentinels',{resolve:true});assert.equal(revealed,count);assert.equal(a.library.length,count);assert.equal(a.lost,false);
  }
 });
 test(`${role}: countering the original leaves its Ripple trigger and source name intact`,async()=>{
  const ctx=context(M,role);rippleChoices(ctx);const {game,a}=ctx,copy=put(M,game,a,'Surging Sentinels','library');await ripplePaid(M,ctx,'Surging Sentinels');
  const original=game.stack.find(row=>row.kind==='spell');await game.counterStackObject(original);assert.equal(original.card.zone,'graveyard');await settle(game);assert.equal(copy.zone,'battlefield');assert.equal(a.turnState.spellsCast,2);
 });
 test(`${role}: copying a spell does not cast it and creates no Ripple trigger`,async()=>{
  const ctx=context(M,role);rippleChoices(ctx);const {game,a}=ctx;await ripplePaid(M,ctx,'Surging Sentinels');const original=game.stack.find(row=>row.kind==='spell'),before=game.stack.length;
  await game.copySpell(original,a);assert.equal(game.stack.length,before+1);assert.equal(game.pendingTriggers.length,0);assert.equal(a.turnState.spellsCast,1);await settle(game);
 });
 test(`${role}: Thrumming Stone grants each own cast an independent additional Ripple and survives source loss on the Stack`,async()=>{
  const ctx=context(M,role);rippleChoices(ctx);const {game,a,b}=ctx,stone=await ripplePaid(M,ctx,'Thrumming Stone',{resolve:true});await ripplePaid(M,ctx,'Surging Sentinels');assert.equal(game.stack.length,3);
  await game.move(stone,'graveyard');assert.equal(game.stack.length,3);await settle(game);
  game.turnPlayer=b;for(const key of ['W','U','B','R','G','C'])b.pool[key]=20;const bear=put(M,game,b,'Grizzly Bears','hand');assert.equal(await game.castSpell(b,bear,{from:'hand'}),true);assert.equal(game.stack.length,1);await settle(game);
 });
 test(`${role}: phased or abilityless Thrumming Stone cannot grant Ripple`,async()=>{
  for(const mode of ['phased','disabled']){const ctx=context(M,role);rippleChoices(ctx);const {game,a,b}=ctx,stone=await ripplePaid(M,mode==='phased'?ctx:{...ctx,a:b,b:a},'Thrumming Stone',{resolve:true});
   if(mode==='phased')game.phaseOut(stone);else{await ripplePaid(M,ctx,'Opportunistic Dragon',{resolve:true});assert.equal(stone.ctrl,a);assert.equal(stone.cur.abilitiesDisabled,true);}
   await ripplePaid(M,ctx,'Grizzly Bears');assert.equal(game.stack.length,1,mode);await settle(game);
  }
 });
 test(`${role}: Rule of Law blocks further casting while Ripple still reveals and bottoms the cohort`,async()=>{
  const ctx=context(M,role);rippleChoices(ctx);const {game,a,b}=ctx;
  await ripplePaid(M,{...ctx,a:b,b:a},'Rule of Law',{resolve:true});const copy=put(M,game,a,'Surging Sentinels','library');
  await ripplePaid(M,ctx,'Surging Sentinels');await game.resolveTop();assert.equal(copy.zone,'library');assert.equal(a.turnState.spellsCast,1);assert.ok(a.library.slice(0,4).includes(copy));await settle(game);
 });
 test(`${role}: a free Ripple cast must pay Thalia's additional mana or stay in the library`,async()=>{
  for(const payable of [false,true]){
   const ctx=context(M,role);rippleChoices(ctx);const {game,a,b}=ctx;await ripplePaid(M,{...ctx,a:b,b:a},'Thalia, Guardian of Thraben',{resolve:true});const copy=put(M,game,a,'Surging Flame','library');
   await ripplePaid(M,ctx,'Surging Flame');for(const key of Object.keys(a.pool))a.pool[key]=0;if(payable)a.pool.C=1;
   await game.resolveTop();assert.equal(copy.zone,payable?'stack':'library');assert.equal(a.pool.C,0);await settle(game);assert.equal(a.turnState.spellsCast,payable?2:1);
  }
 });
 test(`${role}: free Fling still requires and pays its creature sacrifice`,async()=>{
  for(const payable of [false,true]){
   const ctx=context(M,role);rippleChoices(ctx);const {game,a}=ctx;await ripplePaid(M,ctx,'Thrumming Stone',{resolve:true});const creatures=[put(M,game,a,'Grizzly Bears')];if(payable)creatures.push(put(M,game,a,'Grizzly Bears'));
   const copy=put(M,game,a,'Fling','library');await ripplePaid(M,ctx,'Fling');assert.equal(creatures.filter(card=>card.zone==='graveyard').length,1);
   await game.resolveTop();assert.equal(copy.zone,payable?'stack':'library');assert.equal(creatures.filter(card=>card.zone==='graveyard').length,payable?2:1);await settle(game);
  }
 });
 test(`${role}: Ripple cannot cast an Aura after all legal enchant targets disappear`,async()=>{
  const ctx=context(M,role);rippleChoices(ctx);const {game,a,b}=ctx,host=put(M,game,a,'Grizzly Bears'),copy=put(M,game,a,'Surging Might','library');
  const source=await ripplePaid(M,ctx,'Surging Might');await ripplePaid(M,{...ctx,a:b,b:a},'Doom Blade');await game.resolveTop();assert.equal(host.zone,'graveyard');
  await game.resolveTop();assert.equal(copy.zone,'library');assert.equal(a.turnState.spellsCast,1);await settle(game);assert.equal(source.zone,'graveyard');
 });
 test(`${role}: a locked revealed card cannot be replaced with a new incarnation during a choice`,async()=>{
  const ctx=context(M,role);rippleChoices(ctx);const {game,a}=ctx,copy=put(M,game,a,'Surging Sentinels','library'),version=copy.zoneVersion;
  game.revealToHuman=async()=>{await game.move(copy,'graveyard');await game.move(copy,'library');};
  await ripplePaid(M,ctx,'Surging Sentinels');await game.resolveTop();assert.equal(a.turnState.spellsCast,1);assert.equal(copy.zone,'library');assert.ok(copy.zoneVersion>version);assert.equal(a.library.at(-1),copy);await settle(game);
 });
 test(`${role}: a face-down spell has no name and gains only Stone's Ripple`,async()=>{
  const ctx=context(M,role);rippleChoices(ctx);const {game,a}=ctx;await ripplePaid(M,ctx,'Thrumming Stone',{resolve:true});const twin=put(M,game,a,'Fathom Seer','library'),source=put(M,game,a,'Fathom Seer','hand');
  const offer=game.castableList(a).find(row=>row.card===source&&row.alt?.faceDownCast);assert.ok(offer);assert.equal(await game.castSpell(a,source,{from:'hand',alt:offer.alt}),true);
  assert.equal(game.stack.length,2);assert.deepEqual(Array.from(game.stack.at(-1).ctx.data.names),[]);await game.resolveTop();assert.equal(twin.zone,'library');assert.equal(a.turnState.spellsCast,2);await settle(game);
 });
 test(`${role}: a split name matches the revealed physical card and permits either half`,async()=>{
  const ctx=context(M,role);rippleChoices(ctx);const {game,a,b}=ctx;await ripplePaid(M,ctx,'Thrumming Stone',{resolve:true});put(M,game,b,'Sol Ring');
  const twin=put(M,game,a,'Fire // Ice','library'),source=put(M,game,a,'Fire // Ice','hand'),offer=game.castableList(a).find(row=>row.card===source&&row.alt?.name==='Ice');assert.ok(offer);
  const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.prompt==='Choose a spell face'?q.options.find(option=>option.label.startsWith('Fire ')).key:decide(g,q);
  assert.equal(await game.castSpell(a,source,{from:'hand',alt:offer.alt}),true);await game.resolveTop();const child=game.stack.find(row=>row.card===twin);assert.ok(child);assert.equal(child.name,'Fire');assert.equal(child.castOpts.name,'Fire');assert.equal(child.from,'library');await settle(game);
 });
 test(`${role}: cloning pending Ripple preserves source/cohort identities without touching the real game`,async()=>{
  const ctx=context(M,role);rippleChoices(ctx);const {game,a}=ctx;const twin=put(M,game,a,'Surging Sentinels','library');await ripplePaid(M,ctx,'Surging Sentinels');
  const clone=M.cloneGameForAISimulation(game,7183),player=clone.players[0];assert.ok(clone);rippleChoices({game:clone,a:player,b:clone.players[1]});
  clone.priorityRound=async()=>{};clone.revealToHuman=async()=>{};await settle(clone);
  assert.equal(game.stack.length,2);assert.equal(twin.zone,'library');assert.ok(clone.bf().some(card=>card.iid===twin.iid));
 });
 test(`${role}: a removed Stone's existing trigger casts its cohort without granting new Ripple instances`,async()=>{
  const ctx=context(M,role);rippleChoices(ctx);const {game,a}=ctx,stone=await ripplePaid(M,ctx,'Thrumming Stone',{resolve:true});const twin=put(M,game,a,'Grizzly Bears','library');
  await ripplePaid(M,ctx,'Grizzly Bears');await game.move(stone,'graveyard');await game.resolveTop();assert.equal(twin.zone,'stack');assert.equal(game.stack.length,2);assert.equal(game.pendingTriggers.length,0);await settle(game);
 });
 test(`${role}: Stone grants only its controller's spells and retains this behavior after save/reload`,async()=>{
  const ctx=context(M,role);rippleChoices(ctx);const {game,a,b}=ctx;await ripplePaid(M,ctx,'Thrumming Stone',{resolve:true});
  const saved=M.captureGameState(game);assert.ok(saved,JSON.stringify(M.gameStateSnapshotBlockers(game)));const restored=context(M,role);M.restoreGameState(restored.game,JSON.parse(JSON.stringify(saved)));rippleChoices(restored);
  await ripplePaid(M,{...restored,a:restored.b,b:restored.a},'Grizzly Bears');assert.equal(restored.game.stack.length,1);await settle(restored.game);
  await ripplePaid(M,restored,'Grizzly Bears');assert.equal(restored.game.stack.length,2);await settle(restored.game);
 });
}
