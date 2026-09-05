// Paid source/zone lifecycle and live graveyard permission through normal UI.
import assert from 'node:assert/strict';import fs from 'node:fs';import {once}from'node:events';import express from'express';import {createAccountHandler,MemoryAccountStore}from'../../api/account.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');const root=new URL('../../',import.meta.url).pathname,out=process.env.ARENA_QA_OUTPUT||root+'output/kotis-graveyard-browser';fs.mkdirSync(out,{recursive:true});
const server=process.env.GAME_URL?null:express().use('/api/account',createAccountHandler({store:new MemoryAccountStore(),limiter:null})).use(express.static(root)).listen(0,'127.0.0.1');if(server)await once(server,'listening');const base=process.env.GAME_URL||`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true}),page=await browser.newPage({reducedMotion:'reduce'}),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');localStorage.setItem('mtgManaMode','auto');localStorage.setItem('mtgStopProfile','end');});
async function state(){return page.evaluate(()=>({done:__kotis.done,error:__kotis.error,pending:_ui.pending?.q.type,prompt:_ui.pending?.q.prompt||'',min:_ui.pending?.q.min,
 candidates:(_ui.pending?.q.candidates||[]).map(c=>({iid:c.iid,name:c.name,zone:c.zone})),from:(_ui.pending?.q.from||[]).map(c=>({iid:c.iid,name:c.name})),sel:(_ui.pending?.sel||[]).map(c=>c.iid),
 preferred:__kotis.target?.iid,card:__kotis.card?.iid,stack:_game.stack.map(s=>({name:s.name,from:s.from,mana:s.manaSpent})),casts:__kotis.casts,witnessZone:__kotis.witness.zone,baseDef:__kotis.witness.def===MTG.DEFS['Timeless Witness'],kotisGrant:!!__kotis.witness.def.flashback?.kotis,exiled:__kotis.food.filter(c=>c.zone==='exile').length,offered:_game.castableList(__kotis.human).some(e=>e.card===__kotis.witness),fallback:(_game.aiDecisionLog||[]).some(row=>row.fallback)||!!_game._decisionFallbacks}));}
async function shot(name){await page.screenshot({path:out+'/'+name+'.png',animations:'disabled'});fs.writeFileSync(out+'/'+name+'-state.json',await page.evaluate(()=>render_game_to_text()));}
async function drive(label){let captured=false;for(let n=0;n<140;n++){
 const s=await state();assert.equal(s.error,null);if(s.done)return;
 if(s.pending==='chooseTargets'){
  const closePreview=page.locator('.stackpophead button');if(await closePreview.count())await closePreview.last().click();
  const desired=s.candidates.find(c=>c.iid===s.preferred)||s.candidates.find(c=>c.name==='Forest')||s.candidates[0];assert.ok(desired);
  if(!s.sel.includes(desired.iid)){
   if(desired.zone==='graveyard'){await page.locator('.meinfo [data-z="graveyard"]').click();await page.locator('.sheet .bigcard').filter({hasText:desired.name}).first().click();}
   else await page.locator(`.mini[data-iid="${desired.iid}"]`).first().click();
  }
  await page.getByRole('button',{name:/Lock.*1 target/}).click();
 }else if(s.pending==='chooseCards'){
  assert.ok(s.prompt.startsWith('Kotis:'));assert.equal(s.min,3);for(let n=0;n<3;n++)if(!s.sel.includes(s.from[n].iid))await page.locator('.modal .cardgrid .bigcard').nth(n).click();await shot(label+'-exile-payment');await page.getByRole('button',{name:/^Confirm ✓/}).click();
 }else{
  if(s.stack.length&&!captured){captured=true;await shot(label+'-stack');}
  const proceed=page.getByRole('button',{name:/^(Proceed|Pass|Resolve|Continue|Got it|Confirm order)/}).filter({visible:true});if(await proceed.count())await proceed.last().click();
 }
 await page.waitForTimeout(25);
 }throw Error('Kotis stage stalled '+JSON.stringify(await state()));}
async function cast(label,name,target=null,graveyard=false){
 await page.evaluate(({name,target,graveyard})=>{__kotis.offer(name,target,graveyard);},{name,target,graveyard});await page.waitForFunction(()=>_ui.pending?.q.type==='main');await page.getByRole('button',{name:'HOLD',exact:true}).click();
 if(graveyard)await page.locator('.offzone button').filter({hasText:'Timeless Witness'}).click();
 else{await page.locator(`.hand [data-cname=${JSON.stringify(name)}]`).first().click();await page.locator('.sheetacts button').filter({hasText:/^Cast/}).first().click();}
 await drive(label);const s=await state();assert.equal(s.casts.at(-1).ok,true);assert.ok(s.casts.at(-1).spent>0);
}
try{
 for(const [scenario,width]of [['reanimate',1440],['reanimate',390],['active',1440]]){
  const label=scenario+'-'+width;await page.setViewportSize({width,height:width===390?844:1000});await page.goto(base);await page.locator('[data-menu-action="solo"]').first().click();await page.waitForSelector('.deckentry');
  await page.evaluate(()=>{
   const root=document.querySelector('#game');root.replaceWith(root.cloneNode(false));document.body.classList.add('game-active');document.querySelector('#setup').style.display='none';document.querySelector('#game').style.display='flex';
   const ui=new MTG.UI(),game=new MTG.Game({seed:991123,paced:true,onEvent:event=>{if(event.type==='battlefieldArrival')ui.showBattlefieldArrival(event);ui.queueRender();}});
   const human=game.addPlayer('You',{name:'Kotis lifecycle'},null,false),bot=game.addPlayer('Local AI',{name:'Kotis lifecycle'},null,true);ui.me=human;ui.game=game;human.controller=ui.controllerFor(human);bot.controller=new MTG.AIController(bot,{difficulty:'hard',style:'balanced'});
   const put=(name,owner,zone='battlefield')=>{const c=new MTG.CardInst(MTG.DEFS[name],owner);c.zone=zone;c.ctrl=owner;c.sick=false;if(zone==='battlefield')game.battlefield.push(c);else owner[zone].push(c);return c;};
   for(const player of [human,bot])for(let n=0;n<20;n++)put('Forest',player,'library');for(const name of ['Forest','Swamp','Island'])for(let n=0;n<8;n++)put(name,human);
   const witness=put('Timeless Witness',human,'graveyard'),food=Array.from({length:4},()=>put('Forest',human,'graveyard'));
   game.turnPlayer=human;game.turnNo=30;game.phase='main1';game.step='main';game.speedFactor=0;game.recalc();window._game=game;window._ui=ui;const qa=window.__kotis={human,witness,food,casts:[],done:true,error:null};
   qa.offer=(name,target,graveyard)=>{qa.done=false;qa.error=null;qa.target=target==='witness'?witness:target==='kotis'?qa.kotis:null;qa.card=graveyard?witness:put(name,human,'hand');if(name==='Kotis, Sibsig Champion')qa.kotis=qa.card;
    void human.controller.decide(game,{type:'main',player:human,casts:game.castableList(human),acts:game.activatableList(human),lands:[],phase:game.phase}).then(async action=>{const card=qa.card,ok=await game.performAction(human,action);qa.casts.push({name:card.name,ok,spent:card.castMeta?.manaSpent,from:card.castMeta?.from});qa.done=true;ui.render();}).catch(error=>qa.error=error.stack);ui.render();};ui.render();
  });
  await cast(label+'-source','Kotis, Sibsig Champion');let s=await state();assert.equal(s.kotisGrant,true);assert.equal(s.offered,true);
  if(scenario==='active'){
   await cast(label+'-permission','Timeless Witness',null,true);s=await state();assert.equal(s.exiled,3);assert.equal(s.casts.at(-1).spent,4);assert.equal(s.casts.at(-1).from,'graveyard');assert.equal(s.witnessZone,'battlefield');assert.equal(s.baseDef,true);
  }else{
   await cast(label+'-reanimate','Zombify','witness');s=await state();assert.equal(s.witnessZone,'battlefield');assert.equal(s.baseDef,true);assert.equal(s.kotisGrant,false);
   await cast(label+'-remove-source','Murder','kotis');await cast(label+'-kill-witness','Murder','witness');s=await state();assert.equal(s.witnessZone,'graveyard');assert.equal(s.baseDef,true);assert.equal(s.kotisGrant,false);assert.equal(s.offered,false);
   // Ask the real main controller, proving the expired permission is absent
   // from visible graveyard cast buttons while native abilities stay intact.
   await page.evaluate(()=>{void __kotis.human.controller.decide(_game,{type:'main',player:__kotis.human,casts:_game.castableList(__kotis.human),acts:_game.activatableList(__kotis.human),lands:[],phase:_game.phase});});
   await page.waitForFunction(()=>_ui.pending?.q.type==='main');assert.equal(await page.locator('.offzone button').filter({hasText:'Timeless Witness'}).count(),0);
  }
  assert.equal(s.fallback,false);assert.equal(s.stack.length,0);await shot(label+'-resolved');results.push({label,...s});console.log('PASS',label);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({results,errors},null,2));
}catch(error){await page.screenshot({path:out+'/failure.png'});fs.writeFileSync(out+'/failure.json',JSON.stringify({message:error.stack,errors,state:await state()},null,2));throw error;}
finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
