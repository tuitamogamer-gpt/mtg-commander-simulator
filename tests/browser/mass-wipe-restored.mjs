// Real damage, JSON checkpoint restore, paid wipe and visible continuation.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=process.env.WIPE_OUTPUT||`${root}output/mass-wipe-restored`;
mkdirSync(out,{recursive:true});
const app=express();
if(process.env.SAVE_BASELINE)app.get('/src/modules/save-state.js',(_req,res)=>res.sendFile(process.env.SAVE_BASELINE));
const server=app.use(express.static(root)).listen(0,'127.0.0.1');await once(server,'listening');
const base=process.env.GAME_URL||`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const receipt={target:base,baseline:!!process.env.SAVE_BASELINE,checks:[],errors:[]};
page.on('pageerror',e=>receipt.errors.push(e.message));
await page.addInitScript(()=>localStorage.setItem('mtgOnboardingComplete','1'));
try{
 await page.goto(base);await page.locator('[data-menu-action="solo"]').first().click();await page.waitForSelector('.deckentry:visible',{timeout:120000});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:900});
  await page.evaluate(async()=>{
   const old=document.querySelector('#game');old.replaceWith(old.cloneNode(false));document.querySelector('#setup').style.display='none';document.querySelector('#game').style.display='flex';document.body.classList.add('game-active');
   const ui=new MTG.UI();let g;
   g=new MTG.Game({seed:7728,paced:false,onEvent:e=>{if(ui.game){if(e.type==='gameEffect')ui.showGameEffect(e);ui.queueRender();}}});
   const pass={decide:async(_g,q)=>q.type==='priority'?{kind:'pass'}:q.type==='chooseTargets'?q.candidates.filter(c=>c.name==='Colossal Dreadmaw').slice(0,1):q.type==='orderTriggers'?q.triggers:q.type==='chooseOption'?q.options[0]?.key:null};
   const a=g.addPlayer('You',MTG.DECKS['Quick Draw'],pass,false),b=g.addPlayer('Opponent',MTG.DECKS['Tramplesaurus Rex'],pass,true);
   g.turnPlayer=a;g.turnNo=8;g.phase='main1';g.step='main';g.speedFactor=0;
   const put=(name,p,zone='battlefield')=>{const c=new MTG.CardInst(MTG.DEFS[name],p);c.zone=zone;c.sick=false;(zone==='battlefield'?g.battlefield:p[zone]).push(c);return c;};
   for(const p of g.players)for(let n=0;n<10;n++)put('Forest',p,'library');
   for(const name of ['Colossal Dreadmaw','Grizzly Bears','Grizzly Bears','Darksteel Myr'])put(name,b);
   g.recalc();a.pool.R=1;const shock=put('Shock',a,'hand');await g.castSpell(a,shock,{from:'hand'});
   const victim=g.creatures(b).find(c=>c.name==='Colossal Dreadmaw');
   if(victim.damage!==2)throw Error('Setup Shock did not resolve');
   const saved=MTG.captureGameState(g);if(!saved)throw Error('Checkpoint refused: '+MTG.gameStateSnapshotBlockers(g));
   MTG.restoreGameState(g,JSON.parse(JSON.stringify(saved)));g.paced=true;g.speedFactor=0;
   ui.game=g;ui.me=g.players.find(p=>!p.isAI);ui.me.controller=ui.controllerFor(ui.me);ui.prioMode='off';ui.acceptAllReveals=g.turnNo;
   window._game=g;window._ui=ui;window.__wipe={done:false,error:null};
   const spell=put('Blasphemous Act',ui.me,'hand');ui.me.pool.R=9;g.phase='main2';g.step='main';g.turnPlayer=ui.me;g.recalc();ui.render();
   void g.castSpell(ui.me,spell,{from:'hand'}).then(()=>{__wipe.done=true;ui.render();}).catch(e=>{__wipe.error=e.stack;ui.handleFatal(e);});
  });
  await page.waitForFunction(()=>__wipe.error||_ui.pending?.q.effectKind==='resolutionRecap'||__wipe.done,{},{timeout:30000});
  const before=await page.evaluate(()=>({error:__wipe.error,recap:!!_ui.pending?.q.recap}));
  await page.waitForTimeout(1600);
  await page.screenshot({path:`${out}/${width}-result.png`});receipt.checks.push({width,before});
  assert.equal(before.error,null,'A saved damage-source record must not crash the wipe');assert.equal(before.recap,true);
  const recap=page.locator('[data-testid="resolution-recap"]');assert.match(await recap.innerText(),/Blasphemous Act/);
  assert.match(await recap.locator('.resolutionrecapstats').innerText(),/^3\s*permanents removed/i);
  const button=recap.locator('.resolutionrecapproceed'),rect=await button.boundingBox();assert.ok(rect&&rect.y>=0&&rect.y+rect.height<=(width===390?844:900));await button.click();
  await page.waitForFunction(()=>__wipe.done||__wipe.error);
  const after=await page.evaluate(()=>({error:__wipe.error,done:__wipe.done,stack:_game.stack.length,triggers:_game.pendingTriggers.length,creatures:_game.creatures().map(c=>({name:c.name,damage:c.damage})),fatal:!!_ui.fatalError,recovery:!!document.querySelector('[data-testid="view-recovery"]')}));receipt.checks.at(-1).after=after;
  assert.equal(after.error,null);assert.equal(after.done,true);assert.equal(after.stack,0);assert.equal(after.triggers,0);assert.equal(after.fatal,false);assert.equal(after.recovery,false);assert.deepEqual(after.creatures,[{name:'Darksteel Myr',damage:13}]);
  await page.screenshot({path:`${out}/${width}-continued.png`});
 }
 assert.deepEqual(receipt.errors,[]);receipt.passed=true;console.log(JSON.stringify({passed:true,checks:receipt.checks.length,target:base}));
}finally{writeFileSync(`${out}/receipt.json`,JSON.stringify(receipt,null,2));await browser.close();server.close();}
