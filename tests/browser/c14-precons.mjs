// Standard selector -> pod -> review -> opening hand, then paid commander play.
// Screenshots only; no video recording.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {once} from 'node:events';
import express from 'express';
import {createAccountHandler,MemoryAccountStore} from '../../api/account.js';
import {c14Precons} from '../../scripts/import-c14-precons.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../../',import.meta.url).pathname,out=root+'output/precon-c14-2026-09-06/browser';
fs.mkdirSync(out,{recursive:true});
const server=express().use('/api/account',createAccountHandler({store:new MemoryAccountStore(),limiter:null})).use(express.static(root)).listen(0,'127.0.0.1');
await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true}),results=[],errors=[],requests=[];
try{
  for(const width of [1440,390])for(const [index,deck] of c14Precons.entries()){
    const page=await browser.newPage({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce'});
    page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push({deck:deck.name,width,error:e.message}));
    page.on('response',r=>{if(r.status()>=400)requests.push({deck:deck.name,width,status:r.status(),url:r.url()});});
    page.on('console',m=>{if(m.type()==='error')errors.push({deck:deck.name,width,error:m.text()});});
    await page.addInitScript(()=>{localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');localStorage.setItem('mtgManaMode','auto');});
    await page.goto(base);assert.equal(await page.evaluate(()=>JSON.parse(render_game_to_text()).deckCount),52);
    await page.locator('[data-menu-action="solo"]').first().click();await page.waitForSelector('.deckentry',{timeout:30000});
    assert.equal(await page.evaluate(()=>Object.keys(MTG.DECKS).length),52);
    await page.locator('.decksearch input').fill(deck.name);await page.locator('.deckcard:visible').click();
    assert.ok((await page.locator('.deckspotlight').innerText()).includes(deck.commander));
    await page.waitForFunction(()=>[...document.querySelectorAll('.deckspotlight img')].every(img=>img.complete&&img.naturalWidth>0));
    await page.screenshot({path:`${out}/${deck.slug}-${width}-select.png`});
    await page.locator('.deckspotlightcontinue').click();await page.locator('[data-pod-preset="learn"]').click();
    const opponent=c14Precons[(index+1)%5].name;await page.locator('.botfields .deckselect').selectOption(opponent);
    await page.locator('.setupnext').click();await page.locator('.reviewstart').click();
    await page.waitForFunction(()=>_ui.pending?.q.type==='mulligan');
    assert.equal(await page.evaluate(()=>_game.players.find(p=>!p.isAI).deckName),deck.name);
    assert.equal(await page.evaluate(()=>_game.players.find(p=>p.isAI).deckName),opponent);
    const opening=await page.evaluate(()=>{const p=_game.players.find(p=>!p.isAI);return {commander:p.commanders.map(c=>c.name),count:p.library.length+p.hand.length+p.command.length};});
    assert.equal(opening.count,100);assert.deepEqual(opening.commander,[deck.commander]);
    await page.screenshot({path:`${out}/${deck.slug}-${width}-opening.png`});
    // A controlled follow-on board retains the real UI controller and legal
    // card definitions; the user clicks the commander, pays mana and passes.
    await page.evaluate(({deck,opponent})=>{
      const surface=document.querySelector('#game');surface.replaceWith(surface.cloneNode(false));
      const ui=new MTG.UI(),g=new MTG.Game({seed:90606,paced:true,onEvent:()=>ui.queueRender()});
      const you=g.addPlayer('You',{name:deck.name},null,false),bot=g.addPlayer('Local AI',{name:opponent},null,true);
      you.controller=ui.controllerFor(you);bot.controller=new MTG.AIController(bot,{difficulty:'hard',style:'balanced'});
      ui.me=you;ui.game=g;ui.prioMode='full';g.turnPlayer=you;g.turnNo=5;g.phase='main1';g.step='main';g.speedFactor=0;
      for(const player of g.players){for(let n=0;n<30;n++){const c=new MTG.CardInst(MTG.DEFS.Forest,player);c.zone='library';player.library.push(c);}}
      for(const name of [...Array(7).fill('Plains'),...Array(7).fill('Island'),...Array(7).fill('Swamp'),...Array(7).fill('Mountain'),...Array(7).fill('Forest')]){
        const land=new MTG.CardInst(MTG.DEFS[name],you);land.zone='battlefield';g.battlefield.push(land);
      }
      const commander=new MTG.CardInst(MTG.DEFS[deck.commander],you);commander.zone='command';commander.commander=true;you.command.push(commander);you.commanders.push(commander);
      g.recalc();window._game=g;window._ui=ui;window.__c14={done:false,error:null,stage:'cast',commander};ui.render();
      void(async()=>{
        const action=await you.controller.decide(g,{type:'main',player:you,casts:g.castableList(you),acts:g.activatableList(you),lands:[],phase:g.phase});
        if(!await g.performAction(you,action))throw Error('Commander action failed');
        await g.flushTriggers();await g.priorityRound(you);
        __c14.loyaltyBefore=commander.counters.loyalty;__c14.stage='loyalty';
        const abilityAction=await you.controller.decide(g,{type:'main',player:you,casts:g.castableList(you),acts:g.activatableList(you),lands:[],phase:g.phase});
        if(!await g.performAction(you,abilityAction))throw Error('Loyalty activation failed');
        await g.flushTriggers();await g.priorityRound(you);__c14.done=true;ui.render();
      })().catch(e=>{__c14.error=e.stack;});
    },{deck,opponent});
    let stackSeen=false;const stackKinds=new Set();
    for(let n=0;n<100;n++){
      const state=await page.evaluate(()=>({done:__c14.done,error:__c14.error,stage:__c14.stage,type:_ui.pending?.q.type,
        stack:_game.stack.map(s=>s.name),kinds:_game.stack.map(s=>s.kind),hint:_ui.pending?.q.aiHint?.kind,prompt:_ui.pending?.q.prompt}));
      assert.equal(state.error,null);for(const kind of state.kinds)stackKinds.add(kind);if(state.done)break;
      if(state.stack.length&&!stackSeen){stackSeen=true;await page.screenshot({path:`${out}/${deck.slug}-${width}-stack.png`});}
      if(state.type==='main'){
        if(state.stage==='cast'){
          await page.getByRole('button',{name:`${deck.commander}. Open commander actions.`,exact:true}).click();
          await page.locator('.sheetacts button').filter({hasText:/^Cast/}).first().click();
        }else{
          await page.locator('.commandbutton').click();await page.locator('.commandsearch').fill(deck.commander);
          const id=await page.evaluate(()=>__c14.commander.iid);await page.locator(`.commandresult[data-card-id="${id}"]`).click();
          await page.locator('.sheetacts .abilitybtn:not(:disabled)').first().click();
        }
      }else if(state.type==='chooseCards'){
        const confirm=page.locator('.modal .pbtn.primary:not(:disabled):visible');
        if(await confirm.count())await confirm.first().click();else await page.locator('.modal .bigcard:not(.selected):visible').first().click();
      }else{
        const proceed=page.getByRole('button',{name:/^(Proceed|Pass|Resolve|Continue|Got it|Confirm order)/}).filter({visible:true});
        if(await proceed.count())await proceed.last().click();
      }
      await page.waitForTimeout(30);
    }
    const state=await page.evaluate(()=>({done:__c14.done,error:__c14.error,zone:__c14.commander.zone,
      loyaltyBefore:__c14.loyaltyBefore,loyaltyAfter:__c14.commander.counters.loyalty,loyaltyDelta:__c14.commander.def.abilities[0].loyalty,
      manaSpent:__c14.commander.castMeta?.manaSpent,graveyard:_game.players[0].graveyard.length,
      pending:_game.pendingTriggers.length,stack:_game.stack.length,fallback:(_game.aiDecisionLog||[]).some(d=>d.fallback),
      text:JSON.parse(render_game_to_text()),overflow:document.documentElement.scrollWidth>innerWidth}));
    assert.equal(state.error,null);assert.equal(state.done,true);assert.equal(state.zone,'battlefield');assert.ok(state.manaSpent>0);assert.ok(stackSeen);
    assert.equal(state.loyaltyAfter,state.loyaltyBefore+state.loyaltyDelta);assert.ok(stackKinds.has('spell')&&stackKinds.has('ability'));
    assert.equal(state.pending,0);assert.equal(state.stack,0);assert.equal(state.fallback,false);assert.equal(state.overflow,false);
    await page.screenshot({path:`${out}/${deck.slug}-${width}-battlefield.png`});
    results.push({deck:deck.name,width,opponent,opening,stackSeen,stackKinds:[...stackKinds],...state});await page.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);console.log(JSON.stringify({passed:results.length,errors,requests}));
}finally{
  fs.writeFileSync(out+'/result.json',JSON.stringify({results,errors,requests},null,2));await browser.close();server.close();
}
