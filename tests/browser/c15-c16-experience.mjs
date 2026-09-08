// Real paid enchantment, token activation and proliferate selection through the UI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out='output/precon-c15-c16-2026-09-08/experience';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),results=[],errors=[],requests=[];
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'});page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)requests.push({status:r.status(),url:r.url()});});
 await page.addInitScript(()=>{localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');localStorage.setItem('mtgManaMode','auto');});
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:8319');await page.locator('[data-menu-action="solo"]').first().click();await page.waitForSelector('.deckentry',{timeout:30000});
 await page.locator('.decksearch input').fill('Call the Spirits');await page.locator('.deckcard:visible').click();await page.locator('.deckspotlightcontinue').click();await page.locator('[data-pod-preset="learn"]').click();await page.locator('.setupnext').click();await page.locator('.reviewstart').click();await page.waitForFunction(()=>_ui.pending?.q.type==='mulligan');
 await page.evaluate(()=>{
  const surface=document.querySelector('#game');surface.replaceWith(surface.cloneNode(false));
  const ui=new MTG.UI(),g=new MTG.Game({seed:90815,paced:true,onEvent:()=>ui.queueRender()}),a=g.addPlayer('You',{name:'Call the Spirits'},null,false),b=g.addPlayer('Local AI',{name:'Swell the Host'},null,true);
  a.controller=ui.controllerFor(a);b.controller=new MTG.AIController(b,{difficulty:'hard',style:'balanced'});ui.me=a;ui.game=g;ui.prioMode='full';g.turnPlayer=a;g.turnNo=5;g.phase='main1';g.step='main';g.speedFactor=0;
  function put(name,p,zone='battlefield'){const c=new MTG.CardInst(MTG.DEFS[name],p);c.zone=zone;if(zone==='battlefield')g.battlefield.push(c);else p[zone].push(c);return c;}
  for(const p of g.players)for(let i=0;i<25;i++)put('Forest',p,'library');for(const n of ['Plains','Swamp','Island'])for(let i=0;i<4;i++)put(n,a);
  const daxos=put('Daxos the Returned',a),arena=put('Phyrexian Arena',a,'hand'),gambit=put("Tezzeret's Gambit",a,'hand');g.recalc();window._game=g;window._ui=ui;window.__exp={stage:'enchantment',done:false,error:null,daxos,arena,gambit};ui.render();
  void(async()=>{for(const stage of ['enchantment','spirit','proliferate']){__exp.stage=stage;const q={type:'main',player:a,casts:g.castableList(a),acts:g.activatableList(a),lands:[],phase:g.phase};const action=await a.controller.decide(g,q);if(!await g.performAction(a,action))throw Error('UI action failed: '+stage);await g.flushTriggers();await g.priorityRound(a);}__exp.done=true;ui.render();})().catch(e=>__exp.error=e.stack);
 });
 const stackStages=new Set();let choiceSeen=false;
 for(let i=0;i<180;i++){
  const s=await page.evaluate(()=>({done:__exp.done,error:__exp.error,stage:__exp.stage,type:_ui.pending?.q.type,proliferate:_ui.pending?.q.spec?.what==='proliferate',selected:_ui.pending?.sel?.length||0,stack:_game.stack.length}));assert.equal(s.error,null);if(s.done)break;if(s.stack)stackStages.add(s.stage);
  if(s.type==='main'){
   const name=s.stage==='enchantment'?'Phyrexian Arena':s.stage==='spirit'?'Daxos the Returned':"Tezzeret's Gambit";
   await page.locator('.commandbutton').click();await page.locator('.commandsearch').fill(name);const iid=await page.evaluate(stage=>__exp[stage==='enchantment'?'arena':stage==='spirit'?'daxos':'gambit'].iid,s.stage);await page.locator(`.commandresult[data-card-id="${iid}"]`).click();
   if(s.stage==='spirit')await page.locator('.sheetacts .abilitybtn:not(:disabled)').filter({hasText:'Create a Spirit'}).click();else await page.locator('.sheetacts .pbtn.primary').first().click();
  }else if(s.proliferate){
   if(!s.selected)await page.locator('.melife.targetable').click();else{assert.match(await page.locator('.proliferatechoice').innerText(),/\+1 experience/);choiceSeen=true;await page.screenshot({path:`${out}/${width}-choice.png`});await page.getByRole('button',{name:/^Confirm proliferate \(1\)/}).click();}
  }else{
   const proceed=page.getByRole('button',{name:/^(Proceed|Pass|Resolve|Continue|Got it|Confirm order)/}).filter({visible:true});if(await proceed.count())await proceed.last().click();else if(s.type==='chooseOption'){const option=page.locator('.modal .pbtn:not(:disabled):visible');if(await option.count())await option.first().click();}
  }
  await page.waitForTimeout(30);
 }
 const state=await page.evaluate(()=>({done:__exp.done,error:__exp.error,experience:_game.players[0].counters.experience,spirit:_game.creatures(_game.players[0]).filter(c=>c.isToken).map(c=>({power:c.power,toughness:c.toughness,enchantment:c.is('Enchantment')})),tapped:_game.lands(_game.players[0]).filter(c=>c.tapped).length,hand:_game.players[0].hand.length,stack:_game.stack.length,pending:_game.pendingTriggers.length,overflow:document.documentElement.scrollWidth>innerWidth,text:JSON.parse(render_game_to_text())}));
 assert.equal(state.done,true);assert.equal(state.error,null);assert.equal(state.experience,2);assert.deepEqual(state.spirit,[{power:2,toughness:2,enchantment:true}]);assert.equal(state.hand,2);assert.ok(state.tapped>=9);assert.equal(state.stack,0);assert.equal(state.pending,0);assert.equal(state.overflow,false);assert.equal(stackStages.size,3);assert.ok(choiceSeen);assert.equal(await page.locator('.experiencebadge').getAttribute('aria-label'),'2 experience counters');
 await page.screenshot({path:`${out}/${width}-resolved.png`});results.push({width,choiceSeen,stackStages:[...stackStages],...state});await page.close();
}assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);console.log(JSON.stringify({passed:results.length,errors,requests}));
}finally{fs.writeFileSync(out+'/result.json',JSON.stringify({results,errors,requests},null,2));await browser.close();}
