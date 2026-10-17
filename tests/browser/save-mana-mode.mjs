import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/four-hour-2026-10-11/persistence/${process.env.AUDIT_LABEL || 'save-mana-mode'}`;
mkdirSync(output, {recursive:true});
const server = express().use('/api/account', createAccountHandler({store:new MemoryAccountStore(),limiter:null}))
  .use(express.static(root)).listen(0,'127.0.0.1');
await once(server,'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {})});
const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
page.setDefaultTimeout(30000);
const errors = [], reports = [];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
await page.addInitScript(()=>{
  localStorage.setItem('mtgOnboardingComplete','1'); localStorage.setItem('mtgReducedMotion','1');
  localStorage.setItem('mtgManaMode','auto'); localStorage.setItem('mtgStopProfile','end');
});
const view = () => page.evaluate(()=>({
  mode:_ui.manaMode,priority:_ui.prioMode,manual:_ui.me.manualMana,question:_ui.pending?.q.type,turn:_game.turnNo,phase:_game.phase,
  hand:_ui.me.hand.map(c=>({iid:c.iid,name:c.name})),pool:{..._ui.me.pool},
  battlefield:_game.bf().map(c=>({iid:c.iid,name:c.name,tapped:c.tapped,sick:c.sick,damage:c.damage})),
  timeline:MTG.activeAccountMatch.decisions,
}));
const continueSave = async () => {
  await page.reload(); await page.locator('.mainmenu-account-return').click();
  await page.locator('.account-continue').click();
  await page.waitForFunction(()=>window._ui?.pending?.q.type==='main',null,{timeout:90000});
};
const reachMain = async () => {
  for(let n=0;n<100;n++) {
    if(await page.evaluate(()=>_ui.pending?.q.type==='main'))return;
    const proceed=page.getByRole('button',{name:/^(Proceed|Pass|Continue|Got it)/}).filter({visible:true});
    if(await proceed.count())await proceed.last().click();
    await page.waitForTimeout(100);
  }
  assert.fail('The paid spell returns to the main action prompt.');
};
try {
  await page.goto(base);
  const registered = await page.request.post(`${base}/api/account`,{data:{action:'register',displayName:'Save audit',email:'save-audit@example.test',password:'Local-only-save-audit-58492!'}});
  const account = await registered.json(); assert.equal(account.ok,true);
  await page.reload(); await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForFunction(()=>!!window.MTG?.captureGameState && !MTGAccount.loading,null,{timeout:90000});
  const raw = readFileSync(`${root}tests/fixtures/yuriko-custom-deck.txt`,'utf8');
  const initial = await page.evaluate(raw=>{
    const name='Saved mana audit';
    const imported=MTG.importCommanderDeck(raw,{name,commanders:["Yuriko, the Tiger's Shadow"]});
    if(!imported.ok)throw Error('The native imported fixture must be valid.');
    const record=MTG.createImportedDeckRecord(imported,{id:'deck-save-mana-audit'});
    if(!MTG.adoptImportedDeckRecord(record).ok)throw Error('The carried deck must register.');
    const setup={deck:name,commanders:record.commanders,ai:1,aiDecks:['Quick Draw'],aiStyles:['balanced'],seed:'330957',manaMode:'auto',prioMode:'end',importedDecks:[record]};
    const g=MTG.newGame({humanDeck:name,humanCommanders:setup.commanders,aiDecks:setup.aiDecks,aiStyles:setup.aiStyles,
      humanController:()=>({decide:async()=>null}),seed:330957,paced:true,maxTurns:200});
    const human=g.players.find(p=>!p.isAI);
    for(const p of g.players)MTG.shuffle(p.library,g.rnd);
    const position=(name,zone)=>{const c=human.library.find(c=>c.name===name);if(!c)throw Error(`Missing ${name}`);g.remove(c);c.zone=zone;c.ctrl=human;c.sick=false;c.tapped=false;(zone==='battlefield'?g.battlefield:human[zone]).push(c);};
    position('Island','battlefield');position('Sol Ring','battlefield');position('Moon-Circuit Hacker','hand');
    for(const p of g.players){p.turnsStarted=2;p.landsPlayed=0;}
    g.turnPlayer=human;g.turnNo=8;g.phase='start';g.step='before';g.recalc();
    const state=MTG.captureGameState(g);if(!state||state.cards.length!==200)throw Error('The native table must contain 200 physical cards.');
    return MTG.buildAccountSave(g,setup,[],'match-manual-mode-resume-audit',state,0);
  },raw);
  const saved=await page.request.post(`${base}/api/account`,{data:{action:'save',save:initial,expectedOwnerId:account.user.id}});
  assert.equal((await saved.json()).ok,true);
  // The account now owns a newer same-name list. Continue must still use the
  // original carried list, and a later fresh launch must use My Library.
  const replacement={...initial.setup.importedDecks[0],cards:initial.setup.importedDecks[0].cards.map(row=>
    row.name==='Sol Ring'?{...row,name:'Arcane Signet'}:row)};
  const replaced=await page.request.post(`${base}/api/account`,{data:{action:'upsertDeck',deck:replacement,expectedOwnerId:account.user.id}});
  assert.equal((await replaced.json()).ok,true);
  await continueSave(); assert.equal((await view()).mode,'auto');
  await page.locator('.manamode').click(); assert.equal((await view()).mode,'manual');
  const beforeChoice=await view(); await page.evaluate(()=>MTG.flushAccountSave());
  await continueSave(); assert.deepEqual(await view(),beforeChoice,'a setting change is saved even before the next gameplay choice');
  const hacker=await page.evaluate(()=>_ui.me.hand.find(c=>c.name==='Moon-Circuit Hacker').iid);
  await page.locator(`.hcard[data-iid="${hacker}"]`).click();
  await page.locator('.sheetacts button:not(:disabled)').filter({hasText:/^Cast/}).click();
  await page.waitForFunction(()=>_ui.pending?.q.type==='chooseManaSources');
  await page.getByRole('button',{name:'Tap selected sources ✓',exact:true}).click(); await reachMain();
  await page.locator('.menubutton').click();
  await page.locator('[data-settings-tab="controls"]').click();
  await page.locator('.quickmenuitem').filter({hasText:/^Priority stops/}).click();
  await page.locator('.stopprofile').filter({hasText:'Required actions only'}).click();
  const before=await view(); assert.equal(before.pool.C,1); assert.ok(before.battlefield.some(c=>c.name==='Moon-Circuit Hacker'));
  assert.equal(before.priority,'off');
  await page.evaluate(()=>MTG.flushAccountSave());
  await page.screenshot({path:`${output}/before-continue.png`,animations:'disabled'});
  await continueSave(); const after=await view(); reports.push({before,after});
  await page.screenshot({path:`${output}/after-continue.png`,animations:'disabled'});
  assert.deepEqual(after,before,'Continue preserves the manual choice, mana payment and complete decision tail.');
  await page.locator('.menubutton').click();
  await page.locator('[data-settings-tab="table"]').click();
  await page.locator('.quickmenuitem').filter({hasText:/^Save & exit/}).click();
  await page.locator('.mainmenu-account-return').waitFor();
  await page.locator('[data-menu-action="import"]').first().click();
  await page.waitForFunction(()=>MTG.getImportedDeckLibrary?.().entries.some(entry=>entry.name==='Saved mana audit'&&entry.ready),null,{timeout:90000});
  await page.locator('.mainmenu-decklibrary-card').filter({hasText:'Saved mana audit'}).locator('.mainmenu-decklibrary-play').click();
  await page.locator('.deckspotlightcontinue').click(); await page.locator('[data-ai-count="1"]').click();
  await page.locator('.podstage .pbtn.start:visible, .podstage .setupnext:visible').click(); await page.locator('.reviewstart').click();
  await page.waitForFunction(()=>window._ui?.pending?.q.type==='mulligan',null,{timeout:90000});
  const fresh=await page.evaluate(()=>[..._ui.me.library,..._ui.me.hand,..._ui.me.command].map(c=>c.name));
  assert.equal(fresh.includes('Arcane Signet'),true,'a fresh My Library launch uses its newer list');
  assert.equal(fresh.includes('Sol Ring'),false,'the resumed match never overwrites the saved library record');
  reports.push({freshLibraryContainsReplacement:true});
  assert.deepEqual(errors,[],'No replay mismatch or browser error.');
  console.log('PASS mana and priority changes replay exact paid actions; Continue preserves its original list and a fresh library launch uses its replacement.');
} catch(error) {
  writeFileSync(`${output}/failure.json`,JSON.stringify({error:error.stack,reports,errors,current:await view().catch(()=>null)},null,2));
  throw error;
} finally {
  writeFileSync(`${output}/results.json`,JSON.stringify({reports,errors},null,2));
  await browser.close(); await new Promise(resolve=>server.close(resolve));
}
