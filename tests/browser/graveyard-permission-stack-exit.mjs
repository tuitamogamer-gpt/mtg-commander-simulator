// Controlled source boards; every graveyard spell and response is paid through
// the real cast/priority pipeline. Human source cases respond to their own spell.
import assert from 'node:assert/strict';import fs from 'node:fs';import {once}from'node:events';import express from'express';import {createAccountHandler,MemoryAccountStore}from'../../api/account.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');const root=new URL('../../',import.meta.url).pathname,out=process.env.ARENA_QA_OUTPUT||root+'output/graveyard-permission-stack-exit';fs.mkdirSync(out,{recursive:true});
const server=process.env.GAME_URL?null:express().use('/api/account',createAccountHandler({store:new MemoryAccountStore(),limiter:null})).use(express.static(root)).listen(0,'127.0.0.1');if(server)await once(server,'listening');const base=process.env.GAME_URL||`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true}),page=await browser.newPage({reducedMotion:'reduce'}),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');localStorage.setItem('mtgManaMode','auto');localStorage.setItem('mtgStopProfile','end');});
async function shot(name){await page.screenshot({path:out+'/'+name+'.png',animations:'disabled'});fs.writeFileSync(out+'/'+name+'-state.json',await page.evaluate(()=>render_game_to_text()));}
async function state(){return page.evaluate(()=>{const qa=__exit;for(const so of _game.stack){if(so.kind!=='spell'||(so.card!==qa.card&&so.card!==qa.response)||qa.observed.includes(so))continue;qa.observed.push(so);qa.events.push({name:so.card.name,player:so.ctrl.name,isAI:so.ctrl.isAI,from:so.from,manaSpent:so.manaSpent,flashback:!!so.castOpts.flashback,kotis:!!so.castOpts.kotis,broodship:!!so.castOpts.broodship,targets:so.targets.map(t=>t.name)});}return {done:__exit.done,error:__exit.error,ok:__exit.ok,pending:_ui.pending?.q.type,prompt:_ui.pending?.q.prompt||'',min:_ui.pending?.q.min,
 from:(_ui.pending?.q.from||[]).map(c=>({iid:c.iid,name:c.name})),selected:(_ui.pending?.sel||[]).map(c=>c.iid),candidates:(_ui.pending?.q.candidates||[]).map(c=>({name:c.name,kind:c.kind})),
 stack:_game.stack.map(s=>({name:s.name,kind:s.kind,controller:s.ctrl.name,mode:s.mode,targets:(s.targets||[]).flat().map(t=>t.name)})),events:__exit.events,questions:__exit.questions,
 sourceName:__exit.card.name,sourceZone:__exit.card.zone,responseZone:__exit.response.zone,actorHand:__exit.actor.hand.length,humanHand:__exit.human.hand.length,actorLibrary:__exit.actor.library.length,humanLibrary:__exit.human.library.length,
 fodder:__exit.food.map(c=>c.zone),sacrificed:__exit.lands.filter(c=>c.zone==='graveyard').length,charge:__exit.provider?.counters.charge,
 used:__exit.provider?.meta._kotisCastTurn===_game.turnNo||__exit.provider?.meta._broodshipCastTurn===_game.turnNo,
 copies:_game.players.flatMap(p=>['hand','library','graveyard','exile','command'].flatMap(z=>p[z])).filter(c=>c===__exit.card).length,
 fallback:(_game.aiDecisionLog||[]).some(row=>row.fallback)||!!_game._decisionFallbacks};});}
const cohorts=['kotis','gravecrawler','broodship','flashback'];
const scenarios=[...cohorts.flatMap(cohort=>[{cohort,role:'human',response:'Counterspell',width:390},{cohort,role:'ai',response:'Counterspell',width:1440}]),...cohorts.map(cohort=>({cohort,role:'human',response:'Reprieve',width:1440}))];
try{
 for(const scenario of scenarios){
  const {cohort,role,response,width}=scenario,label=[cohort,role,response.toLowerCase(),width].join('-');await page.setViewportSize({width,height:width===390?844:1000});await page.goto(base);await page.locator('[data-menu-action="solo"]').first().click();await page.waitForSelector('.deckentry');
  await page.evaluate(({cohort,role,response})=>{
   const root=document.querySelector('#game');root.replaceWith(root.cloneNode(false));document.body.classList.add('game-active');document.querySelector('#setup').style.display='none';document.querySelector('#game').style.display='flex';
   const ui=new MTG.UI(),game=new MTG.Game({seed:174928,paced:true,onEvent:event=>{if(event.type==='battlefieldArrival')ui.showBattlefieldArrival(event);ui.queueRender();}});
   const human=game.addPlayer('You',{name:'Graveyard permission responses'},null,false),bot=game.addPlayer('Local AI',{name:'Graveyard permission responses'},null,true);ui.me=human;ui.game=game;human.controller=ui.controllerFor(human);bot.controller=new MTG.AIController(bot,{difficulty:'hard',style:'balanced'});const actor=role==='ai'?bot:human;
   const put=(name,owner,zone='battlefield')=>{const c=new MTG.CardInst(MTG.DEFS[name],owner);c.zone=zone;c.ctrl=owner;c.sick=false;if(zone==='battlefield')game.battlefield.push(c);else owner[zone].push(c);return c;};
   for(const p of [human,bot])for(let n=0;n<20;n++)put('Forest',p,'library');
   const mana=cohort==='kotis'?['Forest','Forest','Forest','Forest']:cohort==='gravecrawler'?['Swamp']:cohort==='broodship'?['Forest','Forest','Forest']:['Island','Island','Island'];
   const lands=mana.map(name=>put(name,actor));
   for(let n=0;n<(role==='human'?4:2);n++)put('Island',human);if(response==='Reprieve'){put('Plains',human);put('Plains',human);}
   let provider;if(cohort==='kotis')provider=put('Kotis, Sibsig Champion',actor);if(cohort==='gravecrawler')provider=put('Walking Corpse',actor);if(cohort==='broodship'){provider=put('Exploration Broodship',actor);provider.counters.charge=8;}if(provider)provider.tapped=true;
   const sourceName={kotis:'Timeless Witness',gravecrawler:'Gravecrawler',broodship:'Grizzly Bears',flashback:'Think Twice'}[cohort],card=put(sourceName,actor,'graveyard'),food=cohort==='kotis'?Array.from({length:3},()=>put('Forest',actor,'graveyard')):[],counter=put(response,human,'hand');
   game.turnPlayer=actor;game.turnNo=14;game.phase='main1';game.step='main';game.speedFactor=0;game.recalc();window._game=game;window._ui=ui;const qa=window.__exit={actor,human,card,response:counter,provider,food,lands,events:[],observed:[],questions:[],done:false,error:null};
   const decide=actor.controller.decide.bind(actor.controller);actor.controller.decide=async(g,q)=>{qa.questions.push({type:q.type,prompt:q.prompt});return decide(g,q);};
   qa.start=()=>{void actor.controller.decide(game,{type:'main',player:actor,casts:game.castableList(actor),acts:game.activatableList(actor),lands:[],phase:game.phase}).then(async action=>{qa.ok=await game.performAction(actor,action);qa.done=true;ui.render();}).catch(error=>qa.error=error.stack);};ui.render();
  },scenario);
  await page.getByRole('button',{name:'HOLD',exact:true}).click();await page.evaluate(()=>__exit.start());
  if(role==='human'){await page.waitForFunction(()=>_ui.pending?.q.type==='main');const sourceName=await page.evaluate(()=>__exit.card.name);await page.locator('.offzone button').filter({hasText:sourceName}).first().click();}
  let sourceStack=false,responseStack=false,responseStarted=false;
  for(let n=0;n<160;n++){
   const s=await state();assert.equal(s.error,null);if(s.done)break;
   if(s.pending==='chooseCards'){
    assert.ok(s.prompt.startsWith('Kotis:')||s.prompt.startsWith('Exploration Broodship:'),s.prompt);const desired=s.from.filter(c=>c.name==='Forest').slice(0,s.min);assert.equal(desired.length,s.min);
    for(const c of desired)if(!s.selected.includes(c.iid))await page.locator('.modal .cardgrid .bigcard').nth(s.from.findIndex(row=>row.iid===c.iid)).click();await shot(label+'-cost-choice');await page.getByRole('button',{name:/^Confirm ✓/}).click();
   }else if(s.pending==='chooseTargets'){
    assert.ok(s.candidates.some(c=>c.name===s.sourceName));const preview=page.locator('.stackpopitem.targetable').filter({visible:true});const target=(await preview.count())?preview:page.getByRole('button',{name:s.sourceName+'. Select this spell as a target.',exact:true}).filter({visible:true});await target.first().click();await shot(label+'-response-target');await page.getByRole('button',{name:/Lock.*1 target/}).click();
   }else{
    if(s.stack.some(row=>row.name===s.sourceName)&&!sourceStack){sourceStack=true;await shot(label+'-source-stack');}
    if(s.pending==='priority'&&sourceStack&&!responseStarted){responseStarted=true;const openResponses=page.locator('.actionrespond').filter({visible:true});if(await openResponses.count())await openResponses.click();await page.getByRole('button',{name:'HOLD',exact:true}).click();await page.locator(`.hand [data-cname=${JSON.stringify(response)}]`).first().click();await page.locator('.sheetacts button').filter({hasText:/^Cast/}).first().click();}
    else{if(s.stack.some(row=>row.name===response)&&!responseStack){responseStack=true;await shot(label+'-response-stack');}const proceed=page.getByRole('button',{name:/^(Proceed|Pass|Resolve|Continue|Got it|Confirm order)/}).filter({visible:true});if(await proceed.count())await proceed.last().click();}
   }
   await page.waitForTimeout(25);
  }
  const s=await state(),expected=cohort==='flashback'?'exile':response==='Reprieve'?'hand':'graveyard';assert.equal(s.done,true,JSON.stringify(s));assert.equal(s.ok,true);assert.ok(sourceStack);assert.ok(responseStarted);assert.ok(responseStack);assert.equal(s.events.length,2,JSON.stringify(s.events));
  const first=s.events[0],reply=s.events[1];assert.equal(first.name,s.sourceName);assert.equal(first.from,'graveyard');assert.equal(first.isAI,role==='ai');assert.equal(first.manaSpent,{kotis:4,gravecrawler:1,broodship:2,flashback:3}[cohort]);assert.equal(first.flashback,cohort==='flashback');
  assert.equal(reply.name,response);assert.equal(reply.manaSpent,2);assert.deepEqual(reply.targets,[s.sourceName]);assert.equal(s.sourceZone,expected);assert.equal(s.responseZone,'graveyard');assert.equal(s.stack.length,0);assert.equal(s.copies,1);assert.equal(s.fallback,false);
  assert.equal(s.humanHand,(response==='Reprieve'?1:0)+(role==='human'&&expected==='hand'?1:0));assert.equal(s.actorHand,role==='human'?s.humanHand:expected==='hand'?1:0);assert.equal(s.humanLibrary,response==='Reprieve'?19:20);
  if(cohort==='kotis'){assert.deepEqual(s.fodder,['exile','exile','exile']);assert.equal(s.used,true);}if(cohort==='broodship'){assert.equal(s.sacrificed,1);assert.equal(s.charge,8);assert.equal(s.used,true);}await shot(label+'-resolved');results.push({label,sourceStack,responseStack,...s});console.log('PASS',label);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({results,errors},null,2));
}catch(error){await page.screenshot({path:out+'/failure.png'});fs.writeFileSync(out+'/failure.json',JSON.stringify({message:error.stack,errors,state:await state()},null,2));throw error;}
finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
