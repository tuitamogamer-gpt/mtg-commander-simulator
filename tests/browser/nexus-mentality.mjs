// Actual human card-sheet/modal/target/Stack interactions and hard-AI decisions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {once} from 'node:events';
import express from 'express';
import {createAccountHandler,MemoryAccountStore} from '../../api/account.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../../',import.meta.url).pathname,out=process.env.ARENA_QA_OUTPUT||root+'output/nexus-mentality-browser';fs.mkdirSync(out,{recursive:true});
const server=process.env.GAME_URL?null:express().use('/api/account',createAccountHandler({store:new MemoryAccountStore(),limiter:null})).use(express.static(root)).listen(0,'127.0.0.1');
if(server)await once(server,'listening');const base=process.env.GAME_URL||`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true}),page=await browser.newPage({reducedMotion:'reduce'}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');localStorage.setItem('mtgManaMode','auto');localStorage.setItem('mtgStopProfile','end');});
async function shot(name){await page.screenshot({path:out+'/'+name+'.png',animations:'disabled'});fs.writeFileSync(out+'/'+name+'-state.json',await page.evaluate(()=>render_game_to_text()));}
async function state(){return page.evaluate(()=>({done:__nexus.done,error:__nexus.error,zone:__nexus.card.zone,spent:__nexus.card.castMeta?.manaSpent,cast:__nexus.ok,
 pending:_ui.pending?.q.type,prompt:_ui.pending?.q.prompt||'',options:_ui.pending?.q.options?.map(o=>({key:o.key,label:o.label})),candidates:_ui.pending?.q.candidates?.map(c=>c.iid),selected:(_ui.pending?.sel||[]).map(c=>c.iid),
 zimone:__nexus.zimone.iid,other:__nexus.other?.iid,hand:__nexus.actor.hand.length,library:__nexus.actor.library.length,
 counters:[__nexus.zimone,__nexus.other].filter(Boolean).reduce((sum,c)=>sum+Object.values(c.counters).reduce((a,b)=>a+b,0),0),
 stack:_game.stack.map(s=>({name:s.name,mode:s.mode,targets:(s.targets||[]).flat().map(c=>c.iid)})),trace:__nexus.trace,fallback:(_game.aiDecisionLog||[]).some(row=>row.fallback)||!!_game._decisionFallbacks}));}
try{
 for(const [role,second,width]of [['human',false,1440],['human',true,1440],['human',false,390],['human',true,390],['ai',false,1440],['ai',true,1440]]){
  const label=role+'-'+(second?'both':'draw')+'-'+width;await page.setViewportSize({width,height:width===390?844:1000});await page.goto(base);await page.locator('[data-menu-action="solo"]').first().click();await page.waitForSelector('.deckentry');
  await page.evaluate(({role,second})=>{
   const root=document.querySelector('#game');root.replaceWith(root.cloneNode(false));document.body.classList.add('game-active');document.querySelector('#setup').style.display='none';document.querySelector('#game').style.display='flex';
   const ui=new MTG.UI(),game=new MTG.Game({seed:65496,paced:true,onEvent:event=>{if(event.type==='battlefieldArrival')ui.showBattlefieldArrival(event);ui.queueRender();}});
   const human=game.addPlayer('You',{name:'Nexus Mentality'},null,false),bot=game.addPlayer('Local AI',{name:'Nexus Mentality'},null,true);ui.me=human;ui.game=game;human.controller=ui.controllerFor(human);bot.controller=new MTG.AIController(bot,{difficulty:'hard',style:'balanced'});const actor=role==='ai'?bot:human;
   const put=(name,owner,zone='battlefield')=>{const c=new MTG.CardInst(MTG.DEFS[name],owner);c.zone=zone;c.ctrl=owner;c.sick=false;if(zone==='battlefield')game.battlefield.push(c);else owner[zone].push(c);return c;};
   for(const player of [human,bot])for(let n=0;n<20;n++)put('Forest',player,'library');
   for(let n=0;n<4;n++)put('Island',actor);const zimone=put('Zimone, Infinite Analyst',actor);zimone.commander=true;game.addCounters(zimone,'+1/+1',3,true,actor);const other=second?put('Sol Ring',actor):null,card=put('Nexus Mentality',actor,'hand');
   game.turnPlayer=actor;game.turnNo=8;game.phase='main1';game.step='main';game.speedFactor=0;game.recalc();window._game=game;window._ui=ui;const qa=window.__nexus={card,zimone,other,actor,done:false,error:null,trace:[]};
   const decide=actor.controller.decide.bind(actor.controller);actor.controller.decide=async(g,q)=>{qa.trace.push({type:q.type,prompt:q.prompt,options:q.options?.map(o=>o.key),candidates:q.candidates?.map(c=>c.iid)});return decide(g,q);};
   void actor.controller.decide(game,{type:'main',player:actor,casts:game.castableList(actor),acts:game.activatableList(actor),lands:[],phase:game.phase}).then(async action=>{qa.ok=await game.performAction(actor,action);qa.done=true;ui.render();}).catch(error=>qa.error=error.stack);ui.render();
  },{role,second});
  if(role==='human'){await page.getByRole('button',{name:'HOLD',exact:true}).click();await page.locator('.hand [data-cname]').first().click();await page.locator('.sheetacts button').filter({hasText:/^Cast/}).first().click();}
  let sawStack=false,sawModes=false;
  for(let n=0;n<100;n++){
   const s=await state();assert.equal(s.error,null);if(s.done)break;
   if(['chooseMulti','chooseOption'].includes(s.pending)&&s.prompt.startsWith('Nexus Mentality:')){
    assert.deepEqual(s.options.map(o=>o.key),second?['0','1']:['1']);sawModes=true;await shot(label+'-modes');
    for(const option of s.options)await page.locator('.modal button').filter({hasText:new RegExp('^'+option.label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).click();
    if(s.pending==='chooseMulti')await page.getByRole('button',{name:/^Confirm \(/}).click();
   }else if(s.pending==='chooseTargets'){
    if(!second)assert.equal(s.prompt,'Permanent to remove counters from');
    const desired=s.prompt==='From which permanent?'?s.zimone:(second?s.other:s.zimone);assert.ok(s.candidates.includes(desired));
    if(s.prompt==='To which permanent?')assert.ok(!s.candidates.includes(s.zimone),'destination excludes the chosen source');
    if(!s.selected.includes(desired))await page.locator(`.mini[data-iid="${desired}"]`).first().click();await shot(label+'-target-'+n);await page.getByRole('button',{name:/Lock.*1 target/}).click();
   }else{
    const spell=s.stack.find(row=>row.name==='Nexus Mentality');if(spell&&!sawStack){sawStack=true;assert.deepEqual(spell.mode,second?[0,1]:[1]);if(second)assert.notEqual(spell.targets[0],spell.targets[1]);assert.equal(s.spent,4);await shot(label+'-stack');}
    const proceed=page.getByRole('button',{name:/^(Proceed|Pass|Resolve|Continue|Got it|Confirm order)/}).filter({visible:true});if(await proceed.count())await proceed.last().click();
   }
   await page.waitForTimeout(30);
  }
  const s=await state();assert.equal(s.done,true,JSON.stringify(s));assert.equal(s.cast,true);assert.equal(s.spent,4);assert.equal(s.zone,'graveyard');assert.equal(s.fallback,false);assert.equal(s.stack.length,0);
  const modes=s.trace.find(q=>['chooseMulti','chooseOption'].includes(q.type)&&q.prompt?.startsWith('Nexus Mentality:'));assert.deepEqual(modes.options,second?['0','1']:['1']);assert.equal(s.hand,3-s.counters);assert.equal(s.library,20-s.hand);
  if(!second)assert.ok(!s.trace.some(q=>['From which permanent?','To which permanent?'].includes(q.prompt)));
  if(role==='human'){assert.ok(sawModes);assert.ok(sawStack);assert.equal(s.hand,3);assert.equal(s.counters,0);}
  await shot(label+'-resolved');results.push({label,sawStack,sawModes,...s});console.log('PASS',label);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({results,errors},null,2));
}catch(error){await page.screenshot({path:out+'/failure.png'});fs.writeFileSync(out+'/failure.json',JSON.stringify({message:error.stack,errors,state:await state()},null,2));throw error;}
finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
