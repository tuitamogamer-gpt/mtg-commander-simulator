import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out='output/precon-c15-c16-2026-09-08/control';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),results=[],errors=[];
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');localStorage.setItem('mtgManaMode','auto');});
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:8320');await page.locator('[data-menu-action="solo"]').first().click();await page.waitForSelector('.deckentry',{timeout:30000});
 await page.locator('.decksearch input').fill('Entropic Uprising');await page.locator('.deckcard:visible').click();await page.locator('.deckspotlightcontinue').click();await page.locator('[data-pod-preset="learn"]').click();await page.locator('.setupnext').click();await page.locator('.reviewstart').click();await page.waitForFunction(()=>_ui.pending?.q.type==='mulligan');
 // Retain the actual recording controller created by main.js. Park the opening
 // mulligan while a controlled board exercises a separate, bounded sequence.
 await page.evaluate(()=>{
  const g=_game,ui=_ui,a=g.players.find(p=>!p.isAI),b=g.players.find(p=>p.isAI);ui.pendings=[];ui.sheet=null;ui.prioMode='full';g.battlefield=[];g.stack=[];g.pendingTriggers=[];g.delayed=[];g.untilEffects=[];g.turnPlayer=a;g.turnNo=5;g.phase='main1';g.step='main';g.speedFactor=0;
  for(const p of g.players){for(const z of ['hand','library','graveyard','exile','command'])p[z]=[];p.commanders=[];p.pool={W:0,U:0,B:0,R:0,G:0,C:0};p.landsPlayed=0;}
  function put(n,p,z='battlefield'){const c=new MTG.CardInst(MTG.DEFS[n],p);c.zone=z;if(z==='battlefield')g.battlefield.push(c);else p[z].push(c);return c;}
  for(const p of g.players)for(let i=0;i<20;i++)put('Forest',p,'library');for(let i=0;i<10;i++)put('Swamp',a);put('Forest',a,'hand');const land=put('Forest',b,'hand'),spell=put('Cruel Entertainment',a,'hand');g.recalc();ui.render();window.__control={stage:'cast',done:false,error:null,a,b,land,spell};
  void(async()=>{const q={type:'main',player:a,casts:g.castableList(a),acts:[],lands:[],phase:g.phase};const action=await a.controller.decide(g,q);if(!await g.performAction(a,action))throw Error('Cruel cast failed');await g.flushTriggers();await g.priorityRound(a);if(g.c1516TurnControls.length!==2)throw Error('Missing turn-control grants');__control.stage='controlled';g.turnPlayer=b;g.turnNo++;await g.runTurn();__control.afterControlled={uiSeat:ui.me.idx,land:land.zone,remaining:g.c1516TurnControls.length};__control.stage='ai';g.turnPlayer=a;g.turnNo++;await g.runTurn();__control.done=true;ui.render();})().catch(e=>__control.error=e.stack);
 });
 let played=false,stackSeen=false,handSeen=false;
 for(let i=0;i<220;i++){
  const s=await page.evaluate(()=>({done:__control.done,error:__control.error,stage:__control.stage,type:_ui.pending?.q.type,me:_ui.me.idx,actor:__control.a.idx,subject:__control.b.idx,land:__control.land.iid,stack:_game.stack.length}));assert.equal(s.error,null);if(s.done)break;if(s.stack)stackSeen=true;
  if(s.type==='main'&&s.stage==='cast'){
   await page.locator('.commandbutton').click();await page.locator('.commandsearch').fill('Cruel Entertainment');await page.locator('.commandresult').filter({hasText:'Cruel Entertainment'}).first().click();await page.locator('.sheetacts .pbtn.primary').first().click();
  }else if(s.type==='main'&&s.stage==='controlled'&&s.me===s.subject&&!played){
   assert.ok((await page.locator('.handwrap').innerText()).includes('Forest'));handSeen=true;await page.screenshot({path:`${out}/${width}-controlled-hand.png`});await page.locator('.commandbutton').click();await page.locator('.commandsearch').fill('Forest');await page.locator(`.commandresult[data-card-id="${s.land}"]`).click();await page.locator('.sheetacts .pbtn.primary').first().click();played=true;
  }else if(s.type==='chooseTargets'){
   const confirm=page.locator('.promptbar .pbtn.primary:not(:disabled):visible');if(await confirm.count())await confirm.first().click();else await page.locator('#game .targetable:not(.selected):visible').first().click();
  }else if(s.type==='main')await page.getByRole('button',{name:/^(End turn|Continue)/}).filter({visible:true}).first().click();
  else{
   const proceed=page.getByRole('button',{name:/^(Proceed|Pass|Resolve|Continue|Got it|Confirm order|No attacks)/}).filter({visible:true});if(await proceed.count())await proceed.last().click();else if(s.type==='chooseOption'){const opt=page.locator('.modal .pbtn:not(:disabled):visible');if(await opt.count())await opt.first().click();}
  }
  await page.waitForTimeout(35);
 }
 const state=await page.evaluate(()=>({done:__control.done,error:__control.error,paid:__control.spell.castMeta.manaSpent,land:__control.land.zone,landController:__control.land.ctrl.idx,subject:__control.b.idx,actor:__control.a.idx,uiSeat:_ui.me.idx,grants:_game.c1516TurnControls.length,active:_game.c1516ActiveControl,afterControlled:__control.afterControlled,stack:_game.stack.length,pending:_game.pendingTriggers.length,overflow:document.documentElement.scrollWidth>innerWidth}));
 assert.equal(state.error,null);assert.ok(state.done&&played&&stackSeen&&handSeen);assert.equal(state.paid,7);assert.equal(state.land,'battlefield');assert.equal(state.landController,state.subject);assert.equal(state.uiSeat,state.actor);assert.equal(state.grants,0);assert.equal(state.active,null);assert.equal(state.stack,0);assert.equal(state.pending,0);assert.equal(state.overflow,false);await page.screenshot({path:`${out}/${width}-returned.png`});results.push({width,played,stackSeen,handSeen,...state});await page.close();
}assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length,errors}));
}finally{fs.writeFileSync(out+'/result.json',JSON.stringify({results,errors},null,2));await browser.close();}
