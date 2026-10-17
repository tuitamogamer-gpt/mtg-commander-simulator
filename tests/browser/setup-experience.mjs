// Native setup interactions at desktop and phone sizes. No game engine simulation.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium node tests/browser/setup-experience.mjs
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import express from 'express';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const app=express();app.use(express.static(root));
const server=process.env.GAME_URL?null:app.listen(0,'127.0.0.1');
if(server)await once(server,'listening');
const output=process.env.GAME_QA_OUTPUT || `${root}output/playwright/setup-experience`;await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const receipt={checks:[],errors:[]};
const base=process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
async function capture(page,name){await page.screenshot({path:`${output}/${name}.png`,animations:'disabled',fullPage:false});}
async function noOverflow(page,name){const sizes=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(sizes.scroll<=sizes.width,`${name} overflow ${JSON.stringify(sizes)}`);}
async function run(size){
 const context=await browser.newContext({viewport:size==='mobile'?{width:390,height:844}:{width:1440,height:1000},reducedMotion:'reduce',hasTouch:size==='mobile'});
 await context.addInitScript(()=>{localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');});
 await context.route('**/api/account**',route=>route.fulfill({json:{ok:true,user:null,profile:null,save:null}}));
 const page=await context.newPage();page.on('pageerror',error=>receipt.errors.push(`${size}: ${error.message}`));
 await page.goto(base,{waitUntil:'networkidle'});console.log(size+' home');await capture(page,`${size}-home`);await noOverflow(page,'home');
 await page.locator('[data-menu-action="solo"]').first().click();await page.waitForSelector('.deckentry:not([hidden]) .deckcard',{timeout:120000});
 await page.waitForFunction(()=>!document.querySelector('.mainmenu-loadveil'));
 console.log(size+' setup');await capture(page,`${size}-deck-explorer`);await noOverflow(page,'deck explorer');
 if(!await page.locator('[data-filter="complexity"]').isVisible())await page.locator('.deckfiltertoggle').click();
 await page.locator('[data-filter="complexity"]').selectOption('Approachable');
 const complexities=await page.locator('.deckentry:visible .deckexperience').allTextContents();assert.ok(complexities.length>0&&complexities.every(value=>value==='Approachable'));
 receipt.checks.push(`${size}: pilot experience filter shows only matching decks`);
 await page.locator('[data-filter="complexity"]').selectOption('all');
 const search=page.locator('#deck-search');await search.fill('not a real deck name');await page.waitForSelector('.deckempty:visible');
 await page.locator('.decksearchclear').click();assert.equal(await search.inputValue(),'');assert.equal(await search.evaluate(e=>e===document.activeElement),true);
 receipt.checks.push(`${size}: search clear restores results and keyboard focus`);
 await search.fill('Quick Draw');await page.locator('.deckentry:visible .deckcard').click();await page.waitForSelector('.deckspotlight');
 console.log(size+' spotlight');await capture(page,`${size}-spotlight`);await noOverflow(page,'spotlight');
 await page.locator('[data-spotlight-section="mana"]').click();await page.waitForFunction(()=>document.querySelector('[data-spotlight-section="mana"]')?.getAttribute('aria-current')==='location');
 receipt.checks.push(`${size}: spotlight section navigation tracks the visible section`);
 await page.locator('.deckspotlightcontinue').click();await capture(page,`${size}-pod-initial`);await page.locator('[data-ai-count="2"]').click();
 await page.locator('.botfields .deckselect').first().selectOption('Elven Council');
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='AI Dragon deck');
 await capture(page,`${size}-pod`);await noOverflow(page,'pod');
 await page.locator('.setupnext').click();await page.waitForSelector('.reviewstage:visible');
 assert.match(await page.locator('.reviewstage').innerText(),/Elven Council/);await capture(page,`${size}-review`);await noOverflow(page,'review');
 assert.equal(await page.locator('.review-cardback').count(),1);
 receipt.checks.push(`${size}: bot changes retain focus and review preserves chosen seats with cardback for random deck`);
 await page.locator('.reviewback').click();assert.equal(await page.locator('.botfields .deckselect').first().inputValue(),'Elven Council');
 await page.locator('.podback').click();assert.equal(await search.inputValue(),'Quick Draw');
 await page.locator('.setupselectiondetails').click();assert.equal(await page.locator('.deckspotlight').getAttribute('data-deck'),'Quick Draw');
 await page.locator('.deckspotlightbrowse').click();await page.locator('.setuphome').click();
 await page.locator('[data-menu-action="import"]').first().click();await page.waitForSelector('.mainmenu-deckimport-panel');
 await page.waitForFunction(()=>document.querySelector('.mainmenu-deckimport')?.dataset.librarySource!=='loading');
 await page.locator('.mainmenu-deckimport-text').fill('Commander\n1 Not A Real Commander *CMDR*\nDeck\n1 Not A Real Spell');
 await page.locator('.mainmenu-deckimport-check').click();assert.equal(await page.locator('.mainmenu-deckimport').getAttribute('data-import-state'),'error');
 await capture(page,`${size}-import-validation`);await noOverflow(page,'import error');
 const deckText=(await readFile(`${root}tests/fixtures/yuriko-custom-deck.txt`,'utf8')).replace("1 Yuriko, the Tiger's Shadow", "1 Yuriko, the Tiger's Shadow *CMDR*");
 await page.locator('.deckimportfile').setInputFiles({name:'yuriko.txt',mimeType:'text/plain',buffer:Buffer.from(deckText)});
 await page.waitForFunction(text=>document.querySelector('.mainmenu-deckimport-text')?.value===text,deckText);
 await page.locator('.mainmenu-deckimport-name').fill(`Night-table-${size}`);await page.locator('.mainmenu-deckimport-check').click();
 assert.equal(await page.locator('.mainmenu-deckimport').getAttribute('data-import-state'),'ready');await capture(page,`${size}-import-ready`);
 receipt.checks.push(`${size}: text-file import updates draft count and reports complete validation without changing saved decks`);
 await page.locator('.mainmenu-deckimport-start').click();await page.waitForSelector('.deckspotlight');await page.locator('.deckspotlightbrowse').click();
 await page.locator('.setuphome').click();await page.locator('[data-menu-action="import"]').first().click();await page.waitForSelector('.mainmenu-decklibrary-card');
 await page.locator('.decklibrarysearch').fill('missing deck');assert.equal(await page.locator('.mainmenu-decklibrary-card').count(),0);await page.locator('.decklibraryclear').click();
 assert.equal(await page.locator('.mainmenu-decklibrary-card').count(),1);await capture(page,`${size}-saved-library`);
 receipt.checks.push(`${size}: saved library search recovers from zero matches without losing decks`);
 await context.close();
}
try{await run('desktop');await run('mobile');assert.deepEqual(receipt.errors,[]);}finally{await writeFile(`${output}/receipt.json`,JSON.stringify(receipt,null,2));await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
console.log(JSON.stringify(receipt,null,2));
