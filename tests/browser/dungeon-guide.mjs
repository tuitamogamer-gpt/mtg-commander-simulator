// Controlled dungeon actions with real browser choices; GAME_URL also verifies production.
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=process.env.DUNGEON_QA_OUTPUT || `${root}output/dungeon-guide`;
mkdirSync(out,{recursive:true});
const server=express().use('/api/account',createAccountHandler({store:new MemoryAccountStore(),limiter:null})).use(express.static(root)).listen(0,'127.0.0.1');
await once(server,'listening');
const base=process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],checks=[];
try {
  for (const width of [1440,390,320]) {
    const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},reducedMotion:'reduce'});
    page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');});
    const check=name=>{checks.push(`${width}: ${name}`);console.log(`PASS ${width}: ${name}`);};
    const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.goto(base);await page.locator('[data-menu-action="solo"]').first().click();
    await page.waitForSelector('.deckentry',{timeout:45000});
    await page.locator('.decksearch input').fill('Dungeons of Death');await page.locator('.deckcard:visible').click();
    await page.locator('[data-spotlight-section="dungeons"]').click();
    assert.match(await page.locator('.dungeondeckcards').innerText(),/Sefris of the Hidden Ways/);
    for (const [key,count] of [['mine',7],['mage',9],['tomb',5],['undercity',9]]) {
      await page.locator(`[data-dungeon="${key}"]`).click();
      assert.equal(await page.locator('.dungeonroom').count(),count);
      await page.waitForFunction(()=>document.querySelectorAll('.dungeonarrows path').length>0);
      const geometry=await page.locator('.dungeonroom').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,scroll:n.scrollWidth,client:n.clientWidth})));
      assert.ok(geometry.every(n=>n.width>=160&&n.scroll<=n.client+1),JSON.stringify(geometry));
      await noOverflow();
      if(key==='mine')await page.screenshot({path:`${out}/pregame-${width}.png`});
    }
    await page.locator('.dungeonrules summary').click();
    assert.match(await page.locator('.dungeonrules').innerText(),/Losing initiative keeps your progress/);
    check('all four maps, room effects, arrows, and rules before play');
    await page.locator('.deckspotlightcontinue').click();await page.locator('[data-pod-preset="learn"]').click();
    await page.locator('.setupnext').click();await page.locator('.reviewstart').click();
    await page.waitForFunction(()=>window._ui?.pending?.q.type==='mulligan');
    await page.evaluate(()=>{
      const ui=new MTG.UI(),g=new MTG.Game({seed:91326,paced:false,onEvent:()=>ui.queueRender()});
      const a=g.addPlayer('You',{name:'Dungeons of Death'},null,false),b=g.addPlayer('Opponent',{name:'Party Time'},null,true);
      a.controller=ui.controllerFor(a);b.controller=new MTG.AIController(b,{difficulty:'normal',style:'balanced'});
      ui.me=a;ui.game=g;ui.prioMode='full';g.turnPlayer=a;g.turnNo=4;g.phase='main1';g.step='main';g.speedFactor=0;
      for(const p of g.players){
        for(let i=0;i<25;i++){const c=new MTG.CardInst(MTG.DEFS.Forest,p);c.zone='library';p.library.push(c);}
        const c=new MTG.CardInst(MTG.DEFS[p===a?'Sefris of the Hidden Ways':"Nalia de'Arnise"],p);c.zone='command';c.commander=true;p.command.push(c);p.commanders.push(c);
      }
      window._ui=ui;window._game=g;window.__dungeonQA={done:0,error:null};
      window.__venture=(undercity=false)=>{
        void(async()=>{await g.venture(a,null,undercity);for(let i=0;i<30;i++){await g.flushTriggers();if(g.stack.length)await g.resolveTop();else if(!g.pendingTriggers.length)break;}await g.checkSBA();__dungeonQA.done++;ui.render();})().catch(e=>__dungeonQA.error=e.stack);
      };
      g.recalc();ui.render();__venture();
    });
    await page.waitForSelector('.dungeonmodal');
    assert.equal(await page.locator('.dungeontabs button').count(),3);
    await page.locator('.dungeonmapscroll').focus();await page.keyboard.press('Space');
    assert.equal(await page.evaluate(()=>_ui.me.afcDungeon ?? null),null,'scrolling the map must not confirm entry');
    await page.locator('.dungeonrules summary').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>_ui.pending.dungeonRulesOpen===true);
    await page.evaluate(()=>_ui.render());
    assert.equal(await page.locator('.dungeonrules').evaluate(n=>n.open),true,'rules remain open across arena refresh');
    await page.locator('.dungeonrules summary').click();
    await page.locator('.dungeonrules summary').focus();await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.dungeon),'mine','keyboard focus stays inside the map dialog');
    await page.locator('[data-dungeon="tomb"]').click();await page.locator('[data-dungeon="mine"]').click();
    assert.equal(await page.evaluate(()=>_ui.me.afcDungeon ?? null),null,'preview does not enter a dungeon');
    await page.locator('[data-dungeon-confirm="mine"]').click();
    await page.waitForFunction(()=>_ui.pending?.q.type==='scry');
    await page.locator('.modal .pbtn.primary').click();await page.waitForFunction(()=>__dungeonQA.done===1);
    await page.locator('.meinfo .dungeonbadge').click();
    assert.match(await page.locator('.dungeonposition').innerText(),/Current room: Cave Entrance/);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.dungeonoverlay').count(),0);
    await page.evaluate(()=>__venture());await page.waitForSelector('.dungeonmodal');
    assert.deepEqual(await page.locator('button.dungeonroom').evaluateAll(nodes=>nodes.map(n=>n.dataset.room)),['goblin','tunnels']);
    await page.locator('[data-room="tunnels"]').click();
    await page.evaluate(()=>_ui.render());
    assert.equal(await page.locator('[data-dungeon-confirm="tunnels"]').count(),1,'chosen route survives arena refresh');
    await page.screenshot({path:`${out}/branch-${width}.png`});await noOverflow();
    await page.locator('[data-dungeon-confirm="tunnels"]').click();await page.waitForFunction(()=>__dungeonQA.done===2);
    assert.equal(await page.evaluate(()=>_game.bf().some(c=>c.hasSub('Treasure'))),true);
    await page.evaluate(()=>__venture());await page.locator('[data-room="pool"]').click();
    assert.equal(await page.locator('button[data-room="storeroom"]').count(),0,'no jumping to another branch');
    await page.locator('[data-dungeon-confirm="pool"]').click();await page.waitForFunction(()=>__dungeonQA.done===3);
    await page.locator('.meinfo .dungeonbadge').click();
    assert.equal(await page.locator('.dungeonroom.visited').count(),2);
    assert.match(await page.locator('.dungeonposition').innerText(),/Current room: Dark Pool/);
    await page.screenshot({path:`${out}/progress-${width}.png`});
    await page.locator('.dungeonpanelhead button').click();
    await page.evaluate(()=>__venture());await page.waitForFunction(()=>__dungeonQA.done===4);
    assert.equal(await page.evaluate(()=>_ui.me.afcDungeon),null);assert.equal(await page.evaluate(()=>_ui.me.afcCompletedDungeons),1);
    check('human dungeon selection, legal forks, effects, persistent choice, visited route and completion');
    await page.evaluate(()=>__venture(true));
    for(let i=0;i<10;i++){
      const s=await page.evaluate(()=>({done:__dungeonQA.done,error:__dungeonQA.error,type:_ui.pending?.q.type}));assert.equal(s.error,null);if(s.done===5)break;
      const confirm=page.locator('.modal .pbtn.primary:not(:disabled)');
      if(await confirm.count())await confirm.first().click();else await page.waitForTimeout(100);
    }
    await page.waitForFunction(()=>__dungeonQA.done===5);
    await page.evaluate(()=>__venture());await page.waitForSelector('.dungeonmodal');
    assert.deepEqual(await page.locator('button.dungeonroom').evaluateAll(nodes=>nodes.map(n=>n.dataset.room)),['forge','well']);
    await page.screenshot({path:`${out}/undercity-${width}.png`});
    assert.equal(await page.evaluate(()=>__dungeonQA.error),null);
    check('Undercity entry and legal initiative routes on desktop and phone');
    await page.evaluate(()=>{
      const g=_game,a=g.players[0],b=g.players[1],question=_ui.pending.q;
      a.onlineSeat=0;b.onlineSeat=1;
      const privateCard=new MTG.CardInst(MTG.DEFS['Grizzly Bears'],b);privateCard.zone='hand';b.hand.push(privateCard);
      b.afcDungeon={id:1,key:'tomb',room:'oubliette',path:['entry','oubliette']};
      const descriptor=MTG.onlineDecisionDescriptor(g,question,a,'dungeon-browser-live');
      const model=new MTG.OnlineArenaView();model.update(JSON.parse(JSON.stringify(MTG.onlineGameViewFor(g,a))),0);
      const ui=new MTG.UI();ui.game=model;ui.me=model.players[0];ui.prioMode='full';
      window.__liveDungeonAnswer=null;
      ui.pendings=[{q:model.decision(JSON.parse(JSON.stringify(descriptor))),resolve:key=>{window.__liveDungeonAnswer=key;},sel:[],assigns:new Map()}];
      window._ui=ui;window._game=model;ui.render();
    });
    assert.deepEqual(await page.locator('button.dungeonroom').evaluateAll(nodes=>nodes.map(n=>n.dataset.room)),['forge','well']);
    await page.locator('[data-room="well"]').click();
    await page.evaluate(()=>_ui.render());
    assert.equal(await page.locator('[data-dungeon-confirm="well"]').count(),1);
    await page.locator('[data-dungeon-confirm="well"]').click();
    assert.equal(await page.evaluate(()=>__liveDungeonAnswer),'well');
    assert.equal(await page.evaluate(()=>_game.players[1].hand[0].name),'Hidden card');
    await page.locator('.opphead .dungeonbadge').click();
    assert.match(await page.locator('.dungeonposition').innerText(),/Opponent · Current room: Oubliette/);
    assert.equal(await page.locator('.dungeonroom.visited').count(),1);
    await page.screenshot({path:`${out}/live-opponent-${width}.png`});await noOverflow();
    await page.locator('.dungeonpanelhead button').click();
    check('Live guest decision transport, opponent map, and private hand');
    await page.close();
  }
  assert.deepEqual(errors,[]);
} finally {
  writeFileSync(`${out}/result.json`,JSON.stringify({base,checks,errors},null,2));
  await browser.close();server.close();
}
