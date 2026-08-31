import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const baseURL=process.env.BASE_URL||'http://127.0.0.1:4174';
const out=path.resolve(process.env.ORACLE_BROWSER_OUTPUT||'output/next3000/browser');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
await context.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort());
if(baseURL.includes('127.0.0.1'))await context.route('**/api/account?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:null,profile:null,save:null})}));
const verify=(value,label)=>{assert.ok(value,label);checks.push(label);console.log('PASS',label);};
try{
  const response=await page.goto(baseURL,{waitUntil:'networkidle'});verify(response.status()===200,'Root returns HTTP 200');
  await page.locator('[data-menu-action=import]').first().click();
  await page.waitForFunction(()=>globalThis.MTG?.ORACLE_BATCHES?.length===97);
  const catalog=await page.evaluate(()=>({cards:Object.keys(MTG.CARD_CATALOG).length,batches:MTG.ORACLE_BATCHES.filter(batch=>/^oracle-\d+$/.test(batch.id)).map(batch=>batch.cards.length)}));
  verify(catalog.cards===11284&&catalog.batches.length===96&&catalog.batches.every(n=>n===100),'All 11,284 cards and 96 complete generic batches load');
  await page.locator('.mainmenu-deckimport-name').fill('Dwynen Oracle 9600 verification');
  await page.locator('.mainmenu-deckimport-text').fill(await fs.readFile('tests/fixtures/oracle-v6-dwynen-deck.txt','utf8'));
  await page.locator('.mainmenu-deckimport-check').click();
  await page.waitForFunction(()=>JSON.parse(render_game_to_text()).deckImport?.state==='ready');
  verify(await page.locator('.mainmenu-deckimport-start').isEnabled(),'The 100-card new-cohort deck validates through the paste/check UI');
  await page.locator('.mainmenu-deckimport-start').click();
  await page.waitForFunction(()=>JSON.parse(render_game_to_text()).importedDeckLibrary?.readyCount===1);
  await page.reload({waitUntil:'networkidle'});await page.locator('[data-menu-action=import]').first().click();
  await page.locator('.mainmenu-decklibrary-card[data-ready="true"]').waitFor();
  verify(await page.locator('.mainmenu-decklibrary-card[data-ready="true"]').count()===1,'Saved guest deck survives reload and revalidation');
  await page.screenshot({path:path.join(out,'01-library.png'),animations:'disabled'});
  await page.locator('.mainmenu-decklibrary-play').click();
  await page.waitForFunction(()=>window._game&&window._ui?.pending);
  await page.evaluate(()=>{window._game.speedFactor=0;window._ui.prioMode='off';window.__oracleCasts=[];const emit=window._game.emit;window._game.emit=async function(name,data){if(name==='cast')window.__oracleCasts.push({name:data.card.name,human:!data.player.isAI});return emit.call(this,name,data);};});
  for(let step=0;step<400;step++){
    const state=await page.evaluate(()=>({pending:window._ui.pending?.q?.type,land:window._ui.pending?.q?.lands?.[0]?.name,
      cast:window._ui.pending?.q?.casts?.find(row=>row.card.is('Creature'))?.card?.name,
      ready:window._ui.pending?.q?.type==='main'&&window.__oracleCasts.some(row=>row.human)&&window.__oracleCasts.some(row=>!row.human)&&window._game.stack.length===0&&window._game.pendingTriggers.length===0&&window._game.bf().some(card=>card.ctrl===window._ui.me&&!card.is('Land'))}));
    if(state.ready)break;
    if(state.pending==='chooseTargets'){
      const lock=page.locator('.targetpromptactions button').filter({hasText:/^Lock /}).first();
      if(await lock.count())await lock.click();
      else await page.locator('#game .targetable').first().click();
      await page.waitForTimeout(70);continue;
    }
    if(state.pending==='main'&&(state.land||state.cast)){
      const name=state.land||state.cast;const card=page.getByRole('button',{name:`${name}. Playable now. Open card actions.`,exact:true}).first();
      if(await card.count()){
        await card.click();const action=page.locator('#game button:visible').filter({hasText:state.land?/^Play land$/:/^Cast(?: |$)/}).first();
        if(await action.count()){await action.click();await page.waitForTimeout(70);continue;}
      }
    }
    const labels=await page.locator('#game button:visible').allTextContents();
    const label=labels.find(text=>/Keep/.test(text))||labels.find(text=>/^(Proceed|Pass|End turn|End main|Next phase|No attacks|No blocks|Got it|Continue|Done)/i.test(text.trim()));
    if(label)await page.locator('#game button:visible').filter({hasText:label}).last().click({timeout:5000});
    await page.waitForTimeout(70);
  }
  const result=await page.evaluate(()=>({state:MTG.renderGameState(),casts:window.__oracleCasts,decisions:window._game.aiDecisionLog,humanLands:window._game.lands(window._ui.me).length,
    humanPermanent:window._game.bf().some(card=>card.ctrl===window._ui.me&&!card.is('Land'))}));
  await fs.writeFile(path.join(out,'game-state.json'),JSON.stringify(result,null,2));
  verify(result.humanLands>=1,'Human plays lands through card actions');
  verify(result.casts.some(row=>row.human)&&result.humanPermanent,'Human casts a new-cohort creature and it resolves');
  verify(await page.evaluate(()=>window._ui.pending?.q?.type==='main'&&!window._game.stack.length&&!window._game.pendingTriggers.length),'Entry triggers and target choices finish before the stable gameplay frame');
  verify(result.casts.some(row=>!row.human),'Local AI casts real spells in the same game');
  verify(!result.decisions.some(row=>row.fallback),'No local AI fallback');
  await page.locator('.battlefieldarrival').waitFor({state:'detached',timeout:10000});await page.waitForTimeout(1600);
  await page.screenshot({path:path.join(out,'02-gameplay.png'),animations:'disabled'});
  verify(errors.length===0,'No console or page errors: '+errors.join('; '));
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({passed:true,checks,errors},null,2));
}catch(error){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({checks,errors,error:error.stack,body:await page.locator('body').innerText().catch(()=>''),pending:await page.evaluate(()=>window._ui?.pending?.q?.type).catch(()=>null)},null,2));throw error;}
finally{await browser.close();}
