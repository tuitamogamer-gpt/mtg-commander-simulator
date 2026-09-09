// Controlled boards retain the real human UI, paid actions, priority and combat.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {once} from 'node:events';
import express from 'express';
import {createAccountHandler,MemoryAccountStore} from '../../api/account.js';
import {precons} from '../../scripts/import-clb-dmc-40k-precons.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../../',import.meta.url).pathname,out=root+'output/precon-clb-dmc-40k-2026-09-09/abilities';fs.mkdirSync(out,{recursive:true});
const server=express().use('/api/account',createAccountHandler({store:new MemoryAccountStore(),limiter:null})).use(express.static(root)).listen(0,'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[],errors=[];
try{for(const width of [1440,390])for(const deck of precons){
 if(process.env.PRECON_ONLY&&process.env.PRECON_ONLY!==deck.name)continue;
 const page=await browser.newPage({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push({deck:deck.name,width,error:e.message}));page.on('response',r=>{if(r.status()>=400)errors.push({deck:deck.name,width,url:r.url(),status:r.status()});});
 await page.addInitScript(()=>{localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');localStorage.setItem('mtgManaMode','auto');});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('[data-menu-action="solo"]').first().click();await page.waitForSelector('.deckentry',{timeout:30000});
 await page.locator('.decksearch input').fill(deck.name);await page.locator('.deckcard:visible').click();await page.locator('.deckspotlightcontinue').click();await page.locator('[data-pod-preset="learn"]').click();await page.locator('.setupnext').click();await page.locator('.reviewstart').click();await page.waitForFunction(()=>_ui.pending?.q.type==='mulligan');
 await page.evaluate(async deck=>{
  document.querySelector('#game').replaceWith(document.querySelector('#game').cloneNode(false));
  const ui=new MTG.UI(),g=new MTG.Game({seed:90817,paced:true,onEvent:()=>ui.queueRender()}),a=g.addPlayer('You',{name:deck.name},null,false),b=g.addPlayer('Local AI',{name:'Primal Genesis'},null,true);
  a.controller=ui.controllerFor(a);b.controller=new MTG.AIController(b,{difficulty:'hard',style:'balanced'});ui.me=a;ui.game=g;ui.prioMode='full';g.turnPlayer=a;g.turnNo=5;g.phase='main1';g.step='main';g.speedFactor=0;
  const put=(name,p=a,zone='battlefield')=>{const c=new MTG.CardInst(MTG.DEFS[name],p);c.zone=zone;c.sick=false;if(zone==='battlefield')g.battlefield.push(c);else p[zone].push(c);return c;};
  for(const p of g.players)for(let n=0;n<25;n++)put('Forest',p,'library');for(const name of ['Plains','Island','Swamp','Mountain','Forest'])for(let n=0;n<5;n++)put(name);
  const commander=put(deck.commander);commander.commander=true;a.commanders.push(commander);if(commander.def.loyalty)commander.counters.loyalty=Number(commander.def.loyalty);
  const land=put('Forest',a,'hand');let spell;
  const enemy=put('Colossal Dreadmaw',b);
  if(deck.name==='Mind Flayarrrs'){spell=put('Zellix, Sanity Flayer',a,'hand');for(const p of g.players)put('Grizzly Bears',p,'library');}
  if(deck.name==='Party Time')spell=put('Seasoned Dungeoneer',a,'hand');
  if(deck.name==='Draconic Dissent')spell=put('Death Kiss',a,'hand');
  if(deck.name==='Exit from Exile'){spell=put('Grizzly Bears',a,'library');}
  if(deck.name==='Painbow')spell=commander;
  if(deck.name==="Legends' Legacy"){spell=commander;put('Shanid, Sleepers’ Scourge'.replace('’',"'"),a,'library');}
  if(deck.name==='Tyranid Swarm')spell=put('Exocrine',a,'hand');
  if(deck.name==='The Ruinous Powers'){spell=put('Pink Horror',a,'hand');put('Lightning Bolt',a,'hand');}
  if(deck.name==='Necron Dynasties')spell=put('Triarch Praetorian',a,'graveyard');
  if(deck.name==='Forces of the Imperium')spell=put('Birth of the Imperium',a,'hand');
  g.recalc();window._game=g;window._ui=ui;window.__proof={done:false,error:null,commander,spell,land,actionCard:null,actionLabel:null};ui.render();
  const action=async(c,label)=>{
    __proof.actionCard=c;__proof.actionLabel=label;
    const answer=await a.controller.decide(g,{type:'main',player:a,casts:g.castableList(a),acts:g.activatableList(a),lands:g.playableLands(a),phase:g.phase});
    if(!await g.performAction(a,answer))throw Error('Paid UI action failed: '+c.name);
    await g.flushTriggers();await g.priorityRound(a);
  };
  void(async()=>{
   if(deck.name==='Exit from Exile'){await action(commander,'Discard');await action(spell,'Play from exile');}
   else if(deck.name==='Painbow')await action(commander,'Create.*Kavu');
   else if(deck.name==="Legends' Legacy")await action(commander,'Reveal four');
   else if(deck.name==='Necron Dynasties')await action(spell,'Unearth');
   else {await action(spell,'Cast');
    if(deck.name==='Mind Flayarrrs'){g.untap(spell);spell.sick=false;await action(spell,'Target player mills');}
    if(deck.name==='Party Time'){spell.attacking=b;await g.emit('attackersDeclared',{player:a,attackers:[spell]});await g.flushTriggers();await g.priorityRound(a);}
    if(deck.name==='Draconic Dissent')await action(spell,'Monstrosity');
    if(deck.name==='The Ruinous Powers')await action(a.hand.find(c=>c.name==='Lightning Bolt'),'Cast');
   }
   __proof.done=true;ui.render();
  })().catch(e=>__proof.error=e.stack);
 },deck);
 const seen=new Set();let stackSeen=false;
 const click=async selector=>{const e=page.locator(selector).first();if(await e.count()){await e.click();return true;}return false;};
 for(let n=0;n<250;n++){
  const s=await page.evaluate(()=>({done:__proof.done,error:__proof.error,type:_ui.pending?.q.type,prompt:_ui.pending?.q.prompt,stack:_game.stack.length,source:__proof.actionCard?.iid,sourceZone:__proof.actionCard?.zone,name:__proof.actionCard?.name,label:__proof.actionLabel,selected:_ui.pending?.sel.length,candidate:_ui.pending?.q.candidates?.[0]?.iid}));assert.equal(s.error,null);if(s.done)break;if(s.type)seen.add(s.type);
  if(s.stack&&!stackSeen){stackSeen=true;await page.screenshot({path:`${out}/${deck.slug}-${width}-stack.png`});}
  if(s.type==='main'){
   if(s.sourceZone==='library')await page.locator('[data-testid="library-top-peek"]').click();else{await page.locator('.commandbutton').click();await page.locator('.commandsearch').fill(s.name);await page.locator(`.commandresult[data-card-id="${s.source}"]`).click();}
   await page.locator('.sheetacts button:not(:disabled)').filter({hasText:new RegExp(s.label,'i')}).first().click();continue;
  }
  if(s.type==='chooseX'){const val=Number(await page.locator('.modal .xval').textContent());if(val!==1){await page.locator('.modal button').filter({hasText:val<1?/^\+$/ : /^−$/}).click();continue;}if(await click('.modal .pbtn.primary:not(:disabled):visible'))continue;}
  if(s.type==='attackers'){
   if(!await page.locator('.attackalloclane.focused').count()){if(await click('.attackalloclane.player'))continue;}
   if(await click('.attackpoolcard:not(.assigned):not(.cantfocus)'))continue;
   if(await click('.attackallocmodal .pbtn.primary:not(:disabled):visible'))continue;
  }
  if(s.type==='chooseTargets'||s.type==='choosePlayer'){
    if(!s.selected&&deck.name==='Upgrades Unleashed'&&s.label.startsWith('Reconfigure')&&await click('#game .targetable[data-cname="Chishiro, the Shattered Blade"]:visible'))continue;
    if(!s.selected&&await click('#game .targetable:not(.selected):visible'))continue;
    if(await click('.promptbar .pbtn.primary:not(:disabled):visible'))continue;
  }
  if(s.type==='chooseCards'&&deck.name==='Unused'&&!s.selected){const zombie=page.locator('.modal .bigcard').filter({hasText:/Zombie/}).first();if(await zombie.count()){await zombie.click();continue;}}
  if(s.type==='chooseCards'||s.type==='bottomCards'){if(await click('.modal .pbtn.primary:not(:disabled):visible'))continue;if(await click('.modal .bigcard:not(.selected):visible'))continue;}
  if(await click('.actionstage .pbtn.primary:visible'))continue;if(await click('.reveal .pbtn.primary:visible'))continue;if(await click('.modal .pbtn.primary:not(:disabled):visible'))continue;if(await click('.modal .pbtn:not(:disabled):visible'))continue;if(await click('.promptbar .pbtn.primary:not(:disabled):visible'))continue;
  await page.locator('body').click({position:{x:4,y:4}});await page.keyboard.press('Space');await page.waitForTimeout(40);
 }
 const state=await page.evaluate(()=>({done:__proof.done,error:__proof.error,dungeon:_game.players[0].afcDungeon,attached:__proof.spell?.attachedTo,commanderId:__proof.commander.iid,hand:_game.players[0].hand.length,life:_game.players[1].life,spellMana:__proof.spell?.castMeta?.manaSpent,spellZone:__proof.spell?.zone,foretellTapped:__proof.foretellTapped,wasFaceDown:__proof.wasFaceDown,counters:{...__proof.commander.counters},tappedLands:_game.lands(_game.players[0]).filter(c=>c.tapped).length,landCount:_game.lands(_game.players[0]).length,animated:_game.lands(_game.players[0]).filter(c=>c.is('Creature')).length,tokens:_game.bf().filter(c=>c.isToken).map(c=>({name:c.name,types:c.cur.types,subtypes:c.cur.subtypes,power:c.power,attached:c.attachedTo,decayed:c.kw('decayed')})),stack:_game.stack.length,pending:_game.pendingTriggers.length,overflow:document.documentElement.scrollWidth>innerWidth,queries:_game.aiDecisionLog?.map(r=>r.queryType),fallback:_game.aiDecisionLog?.some(r=>r.fallback),text:JSON.parse(render_game_to_text())}));
 fs.writeFileSync(out+'/last-state.json',JSON.stringify({deck:deck.name,width,seen:[...seen],state},null,2));
 assert.equal(state.done,true);assert.equal(state.error,null);assert.equal(state.stack,0);assert.equal(state.pending,0);assert.equal(state.overflow,false);assert.ok(stackSeen);assert.equal(state.fallback||false,false);
 if(deck.name==='Mind Flayarrrs')assert.ok(state.tokens.some(t=>t.subtypes.includes('Horror')));
 if(deck.name==='Party Time'){assert.equal(state.dungeon?.key,'undercity');assert.ok(state.text.players[0].activeEffects.some(e=>e.label==='Initiative'));assert.ok(seen.has('chooseTargets'));}
 if(deck.name==='Draconic Dissent'){assert.ok(seen.has('chooseX'));assert.ok(seen.has('chooseTargets'));}
 if(deck.name==='Exit from Exile')assert.ok(state.tokens.some(t=>t.subtypes.includes('Wolf')));
 if(deck.name==='Painbow')assert.ok(state.tokens.some(t=>t.subtypes.includes('Kavu')&&t.power===3));
 if(deck.name==="Legends' Legacy")assert.ok(state.tokens.some(t=>t.subtypes.includes('Treasure')));
 if(deck.name==='Tyranid Swarm'){assert.ok(state.spellMana>=3);assert.ok(seen.has('chooseX'));}
 if(deck.name==='The Ruinous Powers')assert.ok(seen.has('chooseTargets'));
 if(deck.name==='Necron Dynasties'){assert.equal(state.spellZone,'battlefield');assert.ok(state.hand>=2);}
 if(deck.name==='Forces of the Imperium')assert.ok(state.tokens.some(t=>t.subtypes.includes('Astartes')));
 await page.screenshot({path:`${out}/${deck.slug}-${width}-resolved.png`});results.push({deck:deck.name,width,decisions:[...seen],stackSeen,...state});console.log('PASS '+deck.name+' ability '+width);await page.close();
}assert.deepEqual(errors,[]);
}finally{fs.writeFileSync(out+'/result.json',JSON.stringify({results,errors},null,2));await browser.close();server.close();}
