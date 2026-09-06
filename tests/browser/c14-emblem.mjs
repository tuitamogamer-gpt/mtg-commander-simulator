// Real Ob Nixilis ultimate and paid emblem clicks; private library-top views.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {once} from 'node:events';
import express from 'express';
import {createAccountHandler,MemoryAccountStore} from '../../api/account.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../../',import.meta.url).pathname,out=root+'output/precon-c14-2026-09-06/emblem';fs.mkdirSync(out,{recursive:true});
const server=express().use('/api/account',createAccountHandler({store:new MemoryAccountStore(),limiter:null})).use(express.static(root)).listen(0,'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({headless:true}),results=[],errors=[],requests=[];
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce'});page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)requests.push({status:r.status(),url:r.url()});});
 await page.addInitScript(()=>{localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');localStorage.setItem('mtgManaMode','auto');});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('[data-menu-action="solo"]').first().click();await page.waitForSelector('.deckentry',{timeout:30000});
 await page.locator('.decksearch input').fill('Sworn to Darkness');await page.locator('.deckcard:visible').click();await page.locator('.deckspotlightcontinue').click();await page.locator('[data-pod-preset="learn"]').click();await page.locator('.setupnext').click();await page.locator('.reviewstart').click();await page.waitForFunction(()=>_ui.pending?.q.type==='mulligan');
 await page.evaluate(()=>{
  const surface=document.querySelector('#game');surface.replaceWith(surface.cloneNode(false));
  const ui=new MTG.UI(),g=new MTG.Game({seed:90614,paced:true,onEvent:()=>ui.queueRender()}),a=g.addPlayer('You',{name:'Sworn to Darkness'},null,false),b=g.addPlayer('Local AI',{name:'Peer Through Time'},null,true);
  a.controller=ui.controllerFor(a);b.controller=new MTG.AIController(b,{difficulty:'hard',style:'balanced'});ui.me=a;ui.game=g;ui.prioMode='full';g.turnPlayer=a;g.turnNo=5;g.phase='main1';g.step='main';g.speedFactor=0;
  function put(name,p,zone='battlefield'){const c=new MTG.CardInst(MTG.DEFS[name],p);c.zone=zone;if(zone==='battlefield')g.battlefield.push(c);else p[zone].push(c);return c;}
  for(const p of g.players){for(let i=0;i<25;i++)put('Forest',p,'library');put('Sphinx of Jwar Isle',p);}put('Reliquary Tower',a,'library');put('Wastes',b,'library');for(let i=0;i<7;i++)put('Swamp',a);
  const ob=put('Ob Nixilis of the Black Oath',a);ob.counters.loyalty=8;const bear=put('Grizzly Bears',a);g.recalc();window._game=g;window._ui=ui;window.__emblem={stage:'ultimate',done:false,error:null,ob,bear};ui.render();
  void(async()=>{for(const stage of ['ultimate','emblem']){__emblem.stage=stage;const q={type:'main',player:a,casts:g.castableList(a),acts:g.activatableList(a),lands:[],phase:g.phase};const action=await a.controller.decide(g,q);if(!await g.performAction(a,action))throw Error('UI action failed: '+stage);await g.flushTriggers();await g.priorityRound(a);}__emblem.done=true;ui.render();})().catch(e=>__emblem.error=e.stack);
 });
 const privateTop=await page.locator('[data-testid="library-top-peek"]').getAttribute('data-cname');assert.equal(privateTop,'Reliquary Tower');assert.equal(await page.locator('[data-testid="opponent-library-top"]').count(),0);
 let emblemButton=false;const stackStages=new Set();
 for(let i=0;i<150;i++){
  const s=await page.evaluate(()=>({done:__emblem.done,error:__emblem.error,stage:__emblem.stage,type:_ui.pending?.q.type,stack:_game.stack.length}));assert.equal(s.error,null);if(s.done)break;if(s.stack)stackStages.add(s.stage);
  if(s.type==='main'&&s.stage==='ultimate'){
   await page.locator('.commandbutton').click();await page.locator('.commandsearch').fill('Ob Nixilis of the Black Oath');const iid=await page.evaluate(()=>__emblem.ob.iid);await page.locator(`.commandresult[data-card-id="${iid}"]`).click();await page.locator('.sheetacts .abilitybtn:not(:disabled)').filter({hasText:'Emblem:'}).click();
  }else if(s.type==='main'&&s.stage==='emblem'){
   const button=page.locator('.abilitybtn').filter({hasText:'Ob Nixilis of the Black Oath emblem'});assert.equal(await button.count(),1);emblemButton=true;await page.screenshot({path:`${out}/${width}-emblem-action.png`});await button.click();
  }else if(s.type==='chooseCards'){
   const confirm=page.locator('.modal .pbtn.primary:not(:disabled):visible');if(await confirm.count())await confirm.first().click();else await page.locator('.modal .bigcard[data-card-name="Grizzly Bears"]').click();
  }else{
   const proceed=page.getByRole('button',{name:/^(Proceed|Pass|Resolve|Continue|Got it|Confirm order)/}).filter({visible:true});if(await proceed.count())await proceed.last().click();
  }
  await page.waitForTimeout(30);
 }
 const state=await page.evaluate(()=>({done:__emblem.done,error:__emblem.error,ob:__emblem.ob.zone,bear:__emblem.bear.zone,life:_game.players[0].life,hand:_game.players[0].hand.length,tapped:_game.lands(_game.players[0]).filter(c=>c.tapped).length,emblems:_game.players[0].emblems.length,stack:_game.stack.length,pending:_game.pendingTriggers.length,overflow:document.documentElement.scrollWidth>innerWidth}));
 assert.equal(state.done,true);assert.equal(state.error,null);assert.equal(state.ob,'graveyard');assert.equal(state.bear,'graveyard');assert.equal(state.life,42);assert.equal(state.hand,2);assert.equal(state.tapped,2);assert.equal(state.emblems,1);assert.equal(state.stack,0);assert.equal(state.pending,0);assert.equal(state.overflow,false);assert.ok(emblemButton);assert.equal(stackStages.size,2);
 await page.screenshot({path:`${out}/${width}-resolved.png`});results.push({width,privateTop,emblemButton,stackStages:[...stackStages],...state});await page.close();
}assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);console.log(JSON.stringify({passed:results.length,errors,requests}));
}finally{fs.writeFileSync(out+'/result.json',JSON.stringify({results,errors,requests},null,2));await browser.close();server.close();}
