// Controlled boards retain the real human UI, paid actions, priority and combat.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {once} from 'node:events';
import express from 'express';
import {createAccountHandler,MemoryAccountStore} from '../../api/account.js';
import {precons} from '../../scripts/import-c17-c19-precons.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../../',import.meta.url).pathname,out=root+'output/precon-c17-c19-2026-09-08/abilities';fs.mkdirSync(out,{recursive:true});
const server=express().use('/api/account',createAccountHandler({store:new MemoryAccountStore(),limiter:null})).use(express.static(root)).listen(0,'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[],errors=[];
try{for(const width of [1440,390])for(const deck of precons){
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
  put('Sol Ring',a,'hand');put('Forest',a,'hand');let spell,host;
  if(deck.set==='C17'){
   if(deck.name==='Draconic Domination')spell=put('Furnace Whelp',a,'hand');
   if(deck.name==='Vampiric Bloodlust')spell=put('Falkenrath Noble',a,'hand');
   if(deck.name==='Feline Ferocity')host=put('Leonin Shikari');
   if(deck.name==='Arcane Wizardry')spell=put('Sea Gate Oracle',a,'hand');
  }
  if(deck.name==='Primal Genesis'){const [rhino]=await g.makeTokens(MTG.TOKENS.c1719Rhino,a);rhino.sick=false;}
  g.recalc();window._game=g;window._ui=ui;window.__proof={done:false,error:null,stage:'main',commander,spell,host,queries:[]};ui.render();
  void(async()=>{
   if(!['Feline Ferocity','Primal Genesis'].includes(deck.name)){
    const q={type:'main',player:a,casts:g.castableList(a),acts:g.activatableList(a),lands:[],phase:g.phase};const action=await a.controller.decide(g,q);if(!await g.performAction(a,action))throw Error('Paid UI action failed');await g.flushTriggers();await g.priorityRound(a);
   }
   if(['Draconic Domination','Feline Ferocity','Primal Genesis'].includes(deck.name)){__proof.stage='combat';await g.combatPhase(a);}
   __proof.done=true;ui.render();
  })().catch(e=>__proof.error=e.stack);
 },deck);
 const seen=new Set();let stackSeen=false;
 const click=async selector=>{const e=page.locator(selector).first();if(await e.count()){await e.click();return true;}return false;};
 for(let n=0;n<250;n++){
  const s=await page.evaluate(()=>({done:__proof.done,error:__proof.error,type:_ui.pending?.q.type,prompt:_ui.pending?.q.prompt,stack:_game.stack.length,source:(__proof.spell||__proof.commander).iid,name:(__proof.spell||__proof.commander).name}));assert.equal(s.error,null);if(s.done)break;if(s.type)seen.add(s.type);
  if(s.stack&&!stackSeen){stackSeen=true;await page.screenshot({path:`${out}/${deck.slug}-${width}-stack.png`});}
  if(s.type==='main'){
   await page.locator('.commandbutton').click();await page.locator('.commandsearch').fill(s.name);await page.locator(`.commandresult[data-card-id="${s.source}"]`).click();
   if(['Draconic Domination','Vampiric Bloodlust','Arcane Wizardry'].includes(deck.name))await page.locator('.sheetacts .pbtn.primary').first().click();
   else {const abilities=page.locator('.sheetacts .abilitybtn:not(:disabled)');if(deck.name==='Adaptive Enchantment')await abilities.filter({hasText:'Create a Mask'}).click();else await abilities.first().click();}
   continue;
  }
  if(s.type==='attackers'){
   if(!await page.locator('.attackalloclane.focused').count()){if(await click('.attackalloclane.player'))continue;}
   if(await click('.attackpoolcard:not(.assigned):not(.cantfocus)'))continue;
   if(await click('.attackallocmodal .pbtn.primary:not(:disabled):visible'))continue;
  }
  if(s.type==='chooseTargets'||s.type==='choosePlayer'){if(await click('.promptbar .pbtn.primary:not(:disabled):visible'))continue;if(await click('#game .targetable:not(.selected):visible'))continue;}
  if(s.type==='chooseCards'||s.type==='bottomCards'){if(await click('.modal .pbtn.primary:not(:disabled):visible'))continue;if(await click('.modal .bigcard:not(.selected):visible'))continue;}
  if(await click('.actionstage .pbtn.primary:visible'))continue;if(await click('.reveal .pbtn.primary:visible'))continue;if(await click('.modal .pbtn.primary:not(:disabled):visible'))continue;if(await click('.modal .pbtn:not(:disabled):visible'))continue;if(await click('.promptbar .pbtn.primary:not(:disabled):visible'))continue;
  await page.locator('body').click({position:{x:4,y:4}});await page.keyboard.press('Space');await page.waitForTimeout(40);
 }
 const state=await page.evaluate(()=>({done:__proof.done,error:__proof.error,hand:_game.players[0].hand.length,grave:_game.players[0].graveyard.map(c=>c.name),life:_game.players[1].life,loyalty:__proof.commander.counters.loyalty,spellMana:__proof.spell?.castMeta?.manaSpent,hostPower:__proof.host?.power,tokens:_game.bf().filter(c=>c.isToken).map(c=>({name:c.name,types:c.cur.types,power:c.power,attached:c.attachedTo})),stack:_game.stack.length,pending:_game.pendingTriggers.length,overflow:document.documentElement.scrollWidth>innerWidth,queries:_game.aiDecisionLog?.map(r=>r.queryType),fallback:_game.aiDecisionLog?.some(r=>r.fallback),text:JSON.parse(render_game_to_text())}));
 assert.equal(state.done,true);assert.equal(state.error,null);assert.equal(state.stack,0);assert.equal(state.pending,0);assert.equal(state.overflow,false);assert.ok(stackSeen);
 if(deck.name==='Draconic Domination'){assert.equal(state.spellMana,3);assert.ok(state.life<=30);}
 if(deck.name==='Vampiric Bloodlust')assert.ok(state.tokens.some(t=>t.name.startsWith('Vampire')));
 if(deck.name==='Feline Ferocity')assert.ok(state.hostPower>=5);
 if(deck.name==='Arcane Wizardry')assert.ok(state.tokens.some(t=>t.name==='Sea Gate Oracle'));
 if(deck.name==='Exquisite Invention'){assert.equal(state.loyalty,5);assert.ok(state.tokens.some(t=>t.name.startsWith('Servo')));}
 if(deck.name==='Subjective Reality')assert.equal(state.loyalty,4);
 if(deck.name==="Nature's Vengeance"){assert.equal(state.loyalty,7);assert.ok(state.grave.length);}
 if(deck.name==='Adaptive Enchantment'){assert.equal(state.loyalty,2);assert.ok(state.tokens.some(t=>t.name==='Mask'&&t.attached));}
 if(deck.name==='Merciless Rage')assert.ok(state.grave.length);
 if(deck.name==='Primal Genesis'){assert.equal(state.tokens.filter(t=>t.name.startsWith('Rhino')).length,2);assert.ok(state.life<40);}
 await page.screenshot({path:`${out}/${deck.slug}-${width}-resolved.png`});results.push({deck:deck.name,width,decisions:[...seen],stackSeen,...state});console.log('PASS '+deck.name+' ability '+width);await page.close();
}assert.deepEqual(errors,[]);
}finally{fs.writeFileSync(out+'/result.json',JSON.stringify({results,errors},null,2));await browser.close();server.close();}
