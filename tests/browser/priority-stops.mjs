import assert from 'node:assert/strict';import fs from 'node:fs';import {once}from'node:events';import express from'express';import {createAccountHandler,MemoryAccountStore}from'../../api/account.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');const root=new URL('../../',import.meta.url).pathname,out=process.env.ARENA_QA_OUTPUT||root+'output/priority-stop-browser';fs.mkdirSync(out,{recursive:true});
const server=process.env.GAME_URL?null:express().use('/api/account',createAccountHandler({store:new MemoryAccountStore(),limiter:null})).use(express.static(root)).listen(0,'127.0.0.1');if(server)await once(server,'listening');const base=process.env.GAME_URL||`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true}),page=await browser.newPage({reducedMotion:'reduce'}),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');localStorage.setItem('mtgManaMode','auto');localStorage.setItem('mtgStopProfile','end');});
async function shot(name){await page.screenshot({path:out+'/'+name+'.png',animations:'disabled'});fs.writeFileSync(out+'/'+name+'-state.json',await page.evaluate(()=>render_game_to_text()));}
async function read(){return page.evaluate(()=>({done:__hold.done,error:__hold.error,zone:__hold.card.zone,spent:__hold.card.castMeta?.manaSpent,cast:__hold.ok,pending:_ui.pending?.q.type,options:(_ui.pending?.q.casts?.length||0)+(_ui.pending?.q.acts?.length||0),stack:_game.stack.map(s=>s.kind),life:__hold.human.life,hold:_ui.holdNext,mode:_ui.prioMode,tapped:__hold.lands.every(c=>c.tapped)}));}
try{
 for(const [mode,width]of [['hold',1440],['hold',390],['full',1440],['full',390],['auto',1440]]){
  const label=mode+'-'+width;await page.setViewportSize({width,height:width===390?844:1000});await page.goto(base);await page.locator('[data-menu-action="solo"]').first().click();await page.waitForSelector('.deckentry');
  await page.evaluate(mode=>{
   const root=document.querySelector('#game');root.replaceWith(root.cloneNode(false));document.body.classList.add('game-active');document.querySelector('#setup').style.display='none';document.querySelector('#game').style.display='flex';
   const ui=new MTG.UI(),game=new MTG.Game({seed:83522,paced:true,onEvent:event=>{if(event.type==='battlefieldArrival')ui.showBattlefieldArrival(event);ui.queueRender();}});
   const human=game.addPlayer('You',{name:'Priority controls'},null,false),bot=game.addPlayer('Local AI',{name:'Priority controls'},null,true);ui.me=human;ui.game=game;ui.prioMode='end';human.controller=ui.controllerFor(human);bot.controller=new MTG.AIController(bot,{difficulty:'hard',style:'balanced'});
   const put=(name,owner,zone='battlefield')=>{const c=new MTG.CardInst(MTG.DEFS[name],owner);c.zone=zone;c.ctrl=owner;c.sick=false;if(zone==='battlefield')game.battlefield.push(c);else owner[zone].push(c);return c;};
   for(const player of [human,bot])for(let n=0;n<20;n++)put('Forest',player,'library');const lands=[put('Forest',human),put('Forest',human)];if(mode==='full')put('Soul Warden',human);const card=put('Grizzly Bears',human,'hand');
   game.turnPlayer=human;game.turnNo=8;game.phase='main1';game.step='main';game.speedFactor=0;game.recalc();window._game=game;window._ui=ui;const qa=window.__hold={card,lands,human,done:false,error:null};
   void human.controller.decide(game,{type:'main',player:human,casts:game.castableList(human),acts:game.activatableList(human),lands:[],phase:game.phase}).then(async action=>{qa.ok=await game.performAction(human,action);qa.done=true;ui.render();}).catch(error=>qa.error=error.stack);ui.render();
  },mode);
  if(mode==='hold')await page.getByRole('button',{name:'HOLD',exact:true}).click();
  if(mode==='full'){
   await page.getByRole('button',{name:'MENU',exact:true}).click();await page.getByRole('button',{name:/Priority stops/}).click();await page.locator('.stopprofile').filter({hasText:'Full control'}).click();
  }
  await page.locator('.hand [data-cname]').first().click();await page.locator('.sheetacts button').filter({hasText:/^Cast/}).first().click();
  if(mode==='auto')await page.waitForFunction(()=>__hold.done||__hold.error);
  else{
   await page.waitForFunction(()=>_ui.pending?.q.type==='priority'||__hold.done||__hold.error);let s=await read();assert.equal(s.error,null);assert.equal(s.pending,'priority');assert.equal(s.zone,'stack');assert.equal(s.spent,2);assert.equal(s.options,0);assert.equal(s.tapped,true);if(mode==='hold')assert.equal(s.hold,false);await shot(label+'-own-spell');
   await page.getByRole('button',{name:/^Proceed/}).last().click();
   if(mode==='full'){
    await page.waitForFunction(()=>_ui.pending?.q.type==='priority'&&_game.stack.at(-1)?.kind==='trigger');s=await read();assert.equal(s.life,40);assert.equal(s.options,0);await shot(label+'-own-trigger');await page.getByRole('button',{name:/^Proceed/}).last().click();
    await page.waitForFunction(()=>_ui.pending?.q.type==='priority'&&!_game.stack.length);s=await read();assert.equal(s.life,41);assert.equal(s.options,0);await shot(label+'-empty-stack');await page.getByRole('button',{name:/^(Pass|Proceed)/}).last().click();
   }
   await page.waitForFunction(()=>__hold.done||__hold.error);
  }
  const result=await read();assert.equal(result.error,null);assert.equal(result.cast,true);assert.equal(result.zone,'battlefield');assert.equal(result.stack.length,0);assert.equal(result.pending,undefined);assert.equal(result.spent,2);await shot(label+'-resolved');results.push({label,...result});console.log('PASS',label);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({results,errors},null,2));
}catch(error){await page.screenshot({path:out+'/failure.png'});fs.writeFileSync(out+'/failure.json',JSON.stringify({message:error.stack,errors,state:await read()},null,2));throw error;}
finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
