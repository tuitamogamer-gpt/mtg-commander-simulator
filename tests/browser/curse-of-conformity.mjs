// Run against a local server, or set GAME_URL for an existing build.
import {mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output=process.env.CURSE_OUTPUT || join(tmpdir(),'mtg-curse-target');
mkdirSync(output,{recursive:true});
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
page.setDefaultTimeout(20000);
await page.addInitScript(()=>{localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');});
try {
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8000');
await page.locator('[data-menu-action="solo"]').first().click();
await page.waitForSelector('.deckentry:visible',{timeout:120000});
for(const width of [390,1440]) {
 await page.setViewportSize({width,height:width===390?844:1000});
 await page.evaluate(()=>{
  const old=document.querySelector('#game');old.replaceWith(old.cloneNode(false));document.querySelector('#setup').style.display='none';document.querySelector('#game').style.display='flex';document.body.classList.add('game-active');
  const ui=new MTG.UI(),g=new MTG.Game({seed:19102026,paced:false,onEvent:()=>ui.queueRender()});
  for(const [i,name] of ['You','AI Raven','AI Wolf','AI Dragon'].entries())g.addPlayer(name,{name:'Curse QA'},{decide:async(_g,q)=>q.type==='orderTriggers'?q.triggers:{kind:'pass'}},i!==0);
  ui.game=g;ui.me=g.players[0];ui.prioMode='off';ui.manaMode='auto';ui.me.controller=ui.controllerFor(ui.me);g.turnPlayer=ui.me;g.turnNo=39;g.phase='main1';g.step='main';g.speedFactor=0;
  const put=(name,p,zone='battlefield')=>{const c=new MTG.CardInst(MTG.DEFS[name],p);c.zone=zone;c.sick=false;(zone==='battlefield'?g.battlefield:p[zone]).push(c);return c;};
  for(const p of g.players){put('Grizzly Bears',p);for(let i=0;i<10;i++)put('Plains',p,'library');}
  for(let i=0;i<5;i++)put('Plains',ui.me);
  const aura=put('Curse of Conformity',ui.me,'hand');g.recalc();window._ui=ui;window._game=g;window._aura=aura;window._castResult=null;window._castError=null;ui.render();
  void g.castSpell(ui.me,aura).then(x=>{window._castResult=x;}).catch(e=>window._castError=String(e));
 });
 await page.waitForFunction(()=>_ui.pending?.q.type==='chooseTargets');
 await page.screenshot({path:join(output,`pending-${width}.png`)});
 if(width===390)await page.locator('.mobileviewtab[data-view="table"]').click();
 await page.locator('.opphead').filter({hasText:'AI Raven'}).click();
 assert.deepEqual(await page.evaluate(()=>_ui.pending.sel.map(p=>p.name)),['AI Raven']);
 await page.getByRole('button',{name:/Lock.*1 target/}).click();
 await page.waitForFunction(()=>_castResult!==null||_castError);
 assert.equal(await page.evaluate(()=>_castError),null);
 assert.equal(await page.evaluate(()=>_castResult),true);
 const stackTarget=await page.evaluate(()=>_game.stack.find(s=>s.card===_aura)?.targets[0]?.name || _aura.meta.cursedPlayer?.name);assert.equal(stackTarget,'AI Raven');
 await page.evaluate(async()=>{while(_game.stack.length)await _game.resolveTop();_ui.render();});
 const state=await page.evaluate(()=>({host:_aura.meta.cursedPlayer?.name,controller:_aura.ctrl.name,creatures:_game.creatures().map(c=>({owner:c.ctrl.name,pt:[c.power,c.toughness],types:[...c.cur.subtypes]}))}));
 assert.equal(state.host,'AI Raven');assert.equal(state.controller,'You');
 for(const c of state.creatures)assert.deepEqual(c.pt,c.owner==='AI Raven'?[3,3]:[2,2]);
 console.log(JSON.stringify({width,stackTarget,...state}));
 if(width===390)await page.locator('.mobileviewtab[data-view="mine"]').click();
 const curseCard=page.locator('.mini[data-cname="Curse of Conformity"]');
 assert.equal(await curseCard.locator('.enchantplayertag').innerText(),'Enchants: AI Raven');
 await page.screenshot({path:join(output,`battlefield-${width}.png`)});
 await curseCard.click();
 await page.locator('.enchantplayerstate').waitFor();
 assert.equal(await page.locator('.enchantplayerstate').innerText(),'Enchants: AI Raven');
 await page.screenshot({path:join(output,`curse-${width}.png`)});
}
} finally { await browser.close(); }
