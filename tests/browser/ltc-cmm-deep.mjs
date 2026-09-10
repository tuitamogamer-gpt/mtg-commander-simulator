// Human decisions use visible controls; setup only supplies reproducible boards.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import express from 'express';
import {createAccountHandler,MemoryAccountStore} from '../../api/account.js';
import {precons} from '../../scripts/import-ltc-cmm-precons.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const remote=process.env.PRECON_BASE_URL;
const out=root+'output/precon-ltc-cmm-2026-09-10/deep/'+(remote?'production-browser':'browser');fs.mkdirSync(out,{recursive:true});
const server=remote?null:express().use('/api/account',createAccountHandler({store:new MemoryAccountStore(),limiter:null})).use(express.static(root)).listen(0,'127.0.0.1');if(server)await once(server,'listening');
const base=remote||`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[],errors=[];
try{for(const width of [1440,390])for(const deck of precons){
 if(process.env.PRECON_ONLY&&process.env.PRECON_ONLY!==deck.name)continue;
 const page=await browser.newPage({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce'});page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push({deck:deck.name,width,error:e.message}));page.on('console',m=>{if(m.type()==='error')errors.push({deck:deck.name,width,error:m.text()});});page.on('response',r=>{if(r.status()>=400)errors.push({deck:deck.name,width,url:r.url(),status:r.status()});});
 await page.addInitScript(()=>{localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');localStorage.setItem('mtgManaMode','auto');});
 await page.goto(base);await page.locator('[data-menu-action="solo"]').first().click();await page.waitForSelector('.deckentry',{timeout:30000});
 await page.locator('.decksearch input').fill(deck.name);await page.locator('.deckcard:visible').click();await page.locator('.deckspotlightcontinue').click();await page.locator('[data-pod-preset="learn"]').click();await page.locator('.setupnext').click();await page.locator('.reviewstart').click();await page.waitForFunction(()=>_ui.pending?.q.type==='mulligan');
 const opening=await page.evaluate(()=>{const p=_game.players.find(p=>!p.isAI);return{cards:p.library.length+p.hand.length+p.command.length,commanders:p.commanders.map(c=>c.name)};});assert.equal(opening.cards,100);assert.deepEqual(opening.commanders,[deck.commander,...(deck.partner?[deck.partner]:[])]);
 await page.evaluate(deck=>{
  document.querySelector('#game').replaceWith(document.querySelector('#game').cloneNode(false));
  const ui=new MTG.UI(),g=new MTG.Game({seed:910269,paced:true,onEvent:()=>ui.queueRender()}),a=g.addPlayer('You',MTG.DECKS[deck.name],null,false),b=g.addPlayer('Local AI',MTG.DECKS['Sliver Swarm'],null,true);a.deckName=deck.name;b.deckName='Sliver Swarm';
  a.controller=ui.controllerFor(a);b.controller=new MTG.AIController(b,{difficulty:'hard'});ui.me=a;ui.game=g;ui.prioMode='full';g.turnPlayer=a;g.turnNo=5;g.phase='main1';g.step='main';g.speedFactor=0;
  const put=(name,p=a,zone='battlefield')=>{const c=new MTG.CardInst(MTG.DEFS[name],p);c.zone=zone;c.sick=false;if(zone==='battlefield')g.battlefield.push(c);else p[zone].push(c);return c;};
  for(const p of g.players)for(let i=0;i<30;i++)put('Forest',p,'library');for(const name of ['Plains','Island','Swamp','Mountain','Forest'])for(let i=0;i<5;i++)put(name);
  let spell,source,subject;
  if(deck.name==='Riders of Rohan'){spell=put('Fealty to the Realm',a,'hand');subject=put('Grizzly Bears',b);}
  if(deck.name==='The Hosts of Mordor'){spell=put('Reanimate',a,'hand');subject=put('Sun Titan',b,'graveyard');}
  if(deck.name==='Food and Fellowship'){put('Sam, Loyal Attendant');put('Rosie Cotton of South Lane');subject=put('Grizzly Bears');spell=put('Farmer Cotton',a,'hand');}
  if(deck.name==='Sliver Swarm'){put('Hatchery Sliver');spell=put('Predatory Sliver',a,'hand');}
  if(deck.name==='Planeswalker Party'){source=put('The Chain Veil');spell=put('Jace Beleren',a,'hand');}
  g.recalc();window._game=g;window._ui=ui;window.__deep={done:false,error:null,spell,source,subject,actions:[],actionCard:null,actionIndex:null};ui.render();
  const action=async(c,index=null)=>{
   __deep.actionCard=c;__deep.actionIndex=index;const before=g.lands(a).filter(c=>c.tapped).length;
   const answer=await a.controller.decide(g,{type:'main',player:a,casts:g.castableList(a),acts:g.activatableList(a),lands:[],phase:g.phase});
   if(!await g.performAction(a,answer))throw Error('UI action failed: '+c.name);await g.flushTriggers();await g.priorityRound(a);
   __deep.actions.push({name:c.name,kind:answer.kind,landMana:g.lands(a).filter(c=>c.tapped).length-before});
  };
  void(async()=>{
   if(source)await action(source,0);
   await action(spell);
   if(deck.name==='Food and Fellowship')await action(g.bf().find(c=>c.hasSub('Food')),0);
   if(deck.name==='Planeswalker Party'){await action(spell,0);await action(spell,0);}
   if(deck.name==='Riders of Rohan'){__deep.controlBefore=subject.ctrl.idx;await g.becomeMonarch(b);await g.flushTriggers();await g.priorityRound(a);}
   __deep.done=true;ui.render();
  })().catch(e=>__deep.error=e.stack);
 },deck);
 const seen=new Set();let stackSeen=false;
 const click=async selector=>{const el=page.locator(selector).first();if(await el.count()){await el.click();return true;}return false;};
 for(let n=0;n<250;n++){
  const s=await page.evaluate(()=>({done:__deep.done,error:__deep.error,type:_ui.pending?.q.type,stack:_game.stack.length,name:__deep.actionCard?.name,iid:__deep.actionCard?.iid,index:__deep.actionIndex,selected:_ui.pending?.sel.length,prompt:_ui.pending?.q.prompt}));assert.equal(s.error,null);if(s.done)break;if(s.type)seen.add(s.type);
  if(await click('.stackpopx:visible'))continue;
  if(s.stack&&!stackSeen){stackSeen=true;await page.screenshot({path:`${out}/${deck.slug}-${width}-stack.png`});}
  if(s.type==='main'){
   await page.locator('.commandbutton').click();await page.locator('.commandsearch').fill(s.name);await page.locator(`.commandresult[data-card-id="${s.iid}"]`).click();
   if(s.index===null)await page.locator('.sheetacts .pbtn.primary:not(:disabled)').first().click();else await page.locator('.sheetacts .abilitybtn:not(:disabled)').nth(s.index).click();continue;
  }
  if(s.type==='chooseX'){const value=Number(await page.locator('.modal .xval').textContent());if(value!==2){await page.locator('.modal button').filter({hasText:value<2?/^\+$/:/^−$/}).click();continue;}if(await click('.modal .pbtn.primary:not(:disabled):visible'))continue;}
  if(s.type==='chooseTargets'||s.type==='choosePlayer'){
   if(!s.selected&&await click('#game .targetable:not(.selected):visible'))continue;
   if(!s.selected&&deck.name==='The Hosts of Mordor'){
    const zone=page.getByText('Graveyard 1',{exact:true}).filter({visible:true});if(await zone.count()){await zone.click();continue;}
    const graveyard=page.locator('.sheet .pbtn:visible').filter({hasText:'🪦'});if(await graveyard.count()){await graveyard.first().click();continue;}
    const details=page.getByRole('button',{name:'Open Local AI player details',exact:true}).filter({visible:true});if(await details.count()){await details.click();continue;}
   }
   if(await click('.promptbar .pbtn.primary:not(:disabled):visible'))continue;
  }
  if(s.type==='chooseCards'||s.type==='bottomCards'){if(await click('.modal .pbtn.primary:not(:disabled):visible'))continue;if(await click('.modal .bigcard:not(.selected):visible'))continue;}
  if(await click('.actionstage .pbtn.primary:visible'))continue;if(await click('.reveal .pbtn.primary:visible'))continue;if(await click('.modal .pbtn.primary:not(:disabled):visible'))continue;if(await click('.modal .pbtn:not(:disabled):visible'))continue;if(await click('.promptbar .pbtn.primary:not(:disabled):visible'))continue;
  await page.waitForTimeout(40);
 }
 const state=await page.evaluate(()=>({done:__deep.done,error:__deep.error,actions:__deep.actions,controlBefore:__deep.controlBefore,subjectZone:__deep.subject?.zone,subjectControl:__deep.subject?.ctrl.idx,life:_game.players[0].life,loyalty:__deep.spell.counters.loyalty,canActivate:_game.canActivateLoyalty(__deep.spell),tokens:_game.bf().filter(c=>c.isToken).map(c=>({name:c.name,subtypes:c.cur.subtypes,power:c.power})),hand:_game.players[0].hand.length,spellMana:__deep.spell.castMeta?.manaSpent,stack:_game.stack.length,pending:_game.pendingTriggers.length,fallback:(_game.aiDecisionLog||[]).some(r=>r.fallback),overflow:document.documentElement.scrollWidth>innerWidth}));
 fs.writeFileSync(out+'/last-state.json',JSON.stringify({deck:deck.name,width,seen:[...seen],state},null,2));await page.screenshot({path:`${out}/${deck.slug}-${width}-resolved.png`});
 assert.equal(state.done,true);assert.equal(state.error,null);assert.equal(state.stack,0);assert.equal(state.pending,0);assert.equal(state.fallback,false);assert.equal(state.overflow,false);assert.ok(stackSeen);assert.ok(state.spellMana>0);
 if(deck.name==='Riders of Rohan'){assert.equal(state.controlBefore,0);assert.equal(state.subjectControl,1);assert.ok(seen.has('chooseTargets'));}
 if(deck.name==='The Hosts of Mordor'){assert.equal(state.subjectZone,'battlefield');assert.equal(state.subjectControl,0);assert.equal(state.life,34);assert.ok(seen.has('chooseTargets'));}
 if(deck.name==='Food and Fellowship'){assert.equal(state.life,43);assert.equal(state.actions[1].landMana,1);assert.equal(state.tokens.filter(c=>c.subtypes.includes('Food')).length,1);assert.equal(state.tokens.filter(c=>c.subtypes.includes('Halfling')).length,2);assert.ok(seen.has('chooseX'));}
 if(deck.name==='Sliver Swarm'){assert.equal(state.tokens.filter(c=>c.name==='Predatory Sliver').length,2);assert.ok(seen.has('chooseX'));}
 if(deck.name==='Planeswalker Party'){assert.equal(state.actions.length,4);assert.equal(state.loyalty,7);assert.equal(state.hand,2);assert.equal(state.canActivate,false);}
 results.push({deck:deck.name,width,opening,decisions:[...seen],...state});console.log('PASS '+deck.name+' human decisions '+width);await page.close();
}assert.deepEqual(errors,[]);
}finally{fs.writeFileSync(out+'/result.json',JSON.stringify({results,errors},null,2)+'\n');await browser.close();server?.close();}
