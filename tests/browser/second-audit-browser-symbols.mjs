// Paid printed ability-symbol choices through the real mobile UI. Initial
// lands and libraries are allowed; prerequisites are cast and actually paid.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync,readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join,relative} from 'node:path';
import express from 'express';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)),sourceRoot=resolve(process.env.AUDIT_SOURCE_ROOT||root);
const {createAccountHandler,MemoryAccountStore}=await import(pathToFileURL(join(sourceRoot,'api/account.js')).href);
const indexPath=existsSync(join(sourceRoot,'index.html'))?join(sourceRoot,'index.html'):join(root,'index.html');
const assetRoot=existsSync(join(sourceRoot,'assets'))?join(sourceRoot,'assets'):join(root,'assets');
const runId=`${Date.now()}-${process.pid}`,output=join(root,'output/extended-engine-audit-2026-10-10-second/browser',`symbols-${runId}`);
mkdirSync(output,{recursive:true});
function fingerprint(){const files=[];const walk=d=>{for(const e of readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.js'))files.push(p);}};walk(join(sourceRoot,'src'));files.push(join(sourceRoot,'api/account.js'));const inventory=files.map(p=>({path:relative(sourceRoot,p),sha256:createHash('sha256').update(readFileSync(p)).digest('hex')}));inventory.push({path:'index.html',sha256:createHash('sha256').update(readFileSync(indexPath)).digest('hex')});inventory.sort((a,b)=>a.path.localeCompare(b.path));return {inventorySha256:createHash('sha256').update(JSON.stringify(inventory)).digest('hex'),inventory};}
const sourceBefore=fingerprint(),driverSha256=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const server=express().use('/api/account',createAccountHandler({store:new MemoryAccountStore(),limiter:null})).get('/',(req,res)=>res.sendFile(indexPath)).use('/assets',express.static(assetRoot)).use(express.static(sourceRoot)).listen(0,'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})}),page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});page.setDefaultTimeout(6000);
let interrupted='';const stop=signal=>{if(!interrupted){interrupted=`interrupted by ${signal}`;void page.close().catch(()=>{});}};process.once('SIGTERM',()=>stop('SIGTERM'));process.once('SIGINT',()=>stop('SIGINT'));
const errors=[],results=[],failures=[];page.on('pageerror',e=>{if(!interrupted)errors.push(e.message);});page.on('console',m=>{if(m.type()==='error'&&!interrupted)errors.push(m.text());});
await page.addInitScript(()=>{localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');localStorage.setItem('mtgManaMode','auto');localStorage.setItem('mtgStopProfile','full');});
const scenarios=[
 {label:'paid-hex-parasite-life-mode-manual-mana',kind:'hex',mode:'life',seat:1},
 {label:'paid-hex-parasite-black-mode-manual-mana',kind:'hex',mode:'B',seat:2},
 {label:'paid-tasigur-two-green-hybrid-modes-manual-mana',kind:'tasigur',seat:3},
];
async function fixture(s){await page.evaluate(s=>{
 localStorage.setItem('mtgManaMode','auto');const old=document.querySelector('#game');old.replaceWith(old.cloneNode(false));document.querySelector('#setup').style.display='none';document.querySelector('#game').style.display='flex';document.body.classList.add('game-active');
 const ui=new MTG.UI(),g=new MTG.Game({seed:883105,paced:true,onEvent:()=>ui.queueRender()}),players=Array.from({length:4},(_,idx)=>g.addPlayer(idx===s.seat?'You':`Native AI ${idx}`,{name:'Printed ability symbols'},null,idx!==s.seat)),human=players[s.seat];
 ui.game=g;ui.me=human;ui.prioMode='full';human.controller=ui.controllerFor(human);for(const p of players.filter(p=>p!==human))p.controller=new MTG.AIController(p,{difficulty:'normal',style:'aggressive'});
 g.turnPlayer=human;g.turnNo=6;g.phase='main1';g.step='main';g.speedFactor=0;window._game=g;window._ui=ui;
 const put=(name,owner=human,zone='battlefield')=>{if(!MTG.DEFS[name])throw Error(`Missing ${name}`);const c=new MTG.CardInst(MTG.DEFS[name],owner);c.zone=zone;c.ctrl=owner;c.sick=false;(zone==='battlefield'?g.battlefield:owner[zone]).push(c);return c;};
 for(const p of players)for(let n=0;n<24;n++)put('Island',p,'library');
 const source=put(s.kind==='hex'?'Hex Parasite':'Tasigur, the Golden Fang',human,'hand'),target=s.kind==='hex'?put('Liliana Vess',human,'hand'):null;
 const landNames=s.kind==='hex'?['Wastes','Swamp','Swamp','Wastes','Wastes','Wastes','Swamp','Wastes','Wastes']:['Swamp','Wastes','Wastes','Wastes','Wastes','Wastes','Wastes','Wastes','Forest','Forest','Island','Island'];
 const lands=landNames.map(name=>put(name)),a=window.__audit={human,source,target,lands,done:false,error:null,questions:[],actions:[]};g.recalc();
 const decide=human.controller.decide.bind(human.controller);human.controller.decide=(game,q)=>{a.questions.push({type:q.type,step:game.step,phase:game.phase,prompt:q.prompt,min:q.min,max:q.max,aiHint:q.aiHint&&{kind:q.aiHint.kind,symbol:q.aiHint.symbol,paymentKind:q.aiHint.paymentKind},options:q.options?.map(o=>({key:o.key,label:o.label})),stack:game.stack.map(so=>so.name)});return decide(game,q);};
 const perform=g.performAction;g.performAction=async function(p,action){const ok=await perform.call(this,p,action);a.actions.push({kind:action.kind,name:action.card?.name||action.entry?.card?.name,mana:action.entry?.ability?.cost?.mana,ok});return ok;};
 void g.runTurn().then(()=>{a.done=true;ui.render();}).catch(e=>{a.error=e.stack;});ui.render();
},s);}
async function state(){return page.evaluate(()=>{
 const a=__audit,g=_game,ui=_ui,q=ui.pending?.q||ui.react?.q;
 const card=c=>c&&({iid:c.iid,name:c.name,zone:c.zone,ctrl:c.ctrl.idx,tapped:c.tapped,counters:{...c.counters},power:c.power});
 return {done:a.done,error:a.error,step:g.step,phase:g.phase,question:q?.type,prompt:q?.prompt,min:q?.min,max:q?.max,manaMode:ui.manaMode,selected:ui.pending?.sel.map(c=>c.iid)||[],source:card(a.source),target:card(a.target),lands:a.lands.map(card),candidates:q?.candidates?.map(card),choices:q?.from?.map(card),acts:q?.acts?.map(e=>({iid:e.card.iid,name:e.card.name,label:ui.activationLabel(e),mana:e.ability?.cost?.mana})),casts:q?.casts?.map(e=>({iid:e.card.iid,name:e.card.name})),options:q?.options?.map(o=>({key:o.key,label:o.label})),aiHint:q?.aiHint&&{kind:q.aiHint.kind,symbol:q.aiHint.symbol,paymentKind:q.aiHint.paymentKind},life:a.human.life,libraryCount:a.human.library.length,graveyard:a.human.graveyard.map(card),pool:{...a.human.pool},questions:a.questions,actions:a.actions,stack:g.stack.map(so=>so.name),fallback:!!g._decisionFallbacks||(g.aiDecisionLog||[]).some(row=>row.fallback)};
});}
async function shot(label){await page.screenshot({path:join(output,`${label}.png`),animations:'disabled'});writeFileSync(join(output,`${label}.json`),JSON.stringify(await state(),null,2)+'\n');}
async function button(regex){const b=page.getByRole('button',{name:regex}).filter({visible:true});assert.ok(await b.count(),`Visible ${regex}`);await b.last().click();}
async function cast(card){await page.locator(`.hcard[data-iid="${card.iid}"]`).click();await page.locator('.sheetacts button:not(:disabled)').filter({hasText:/^Cast/}).first().click();}
async function activate(entry){await page.locator('.mobileviewtab[data-view="mine"]').click();await page.locator(`.mini[data-iid="${entry.iid}"]`).filter({visible:true}).first().click();await page.locator('.sheetacts button:not(:disabled)').filter({hasText:entry.label}).first().click();}
function assertEffect(s,a,before,finished=false){
 if(s.kind==='hex'){assert.equal(a.life,before.life-(s.mode==='life'?2:0));assert.equal(a.target.counters.loyalty,before.target.counters.loyalty-1);assert.equal(a.source.power,finished?1:2,'The printed until-end-of-turn boost expires at cleanup');assert.equal(a.lands[6].tapped,s.mode==='B','The selected Phyrexian mode determines whether the available black source is used');assert.equal(a.lands[7].tapped,true);assert.equal(a.lands[8].tapped,false);}
 else{assert.equal(a.libraryCount,before.libraryCount-2);assert.equal(a.graveyard.length,2);assert.ok(a.graveyard.every(c=>c.name==='Island'));assert.ok(a.lands.slice(6,10).every(c=>c.tapped));assert.ok(a.lands.slice(10).every(c=>!c.tapped),'Both blue sources remain unused after selecting green twice');}
}
async function run(s){const errorStart=errors.length;await fixture(s);let manual=false,stage=null,activated=false,before=null,effectSnapshot=null;const modes=[],started=Date.now();
 while(Date.now()-started<70000){const a=await state();assert.equal(a.error,null);assert.equal(errors.length,errorStart);if(a.done)break;
  if(!manual){await page.locator('.tbtn.hudaction.manamode').click();assert.equal((await state()).manaMode,'manual');manual=true;}
  if(activated&&!a.stack.length&&(s.kind==='hex'?a.target.counters.loyalty===before.target.counters.loyalty-1:a.libraryCount===before.libraryCount-2)&&!effectSnapshot){assertEffect(s,a,before);effectSnapshot=a;await shot(`${s.label}-actual-effect`);}
  if(a.question==='main'){
   if(a.phase==='main1'&&a.source.zone==='hand'){assert.ok(a.casts.some(c=>c.iid===a.source.iid),'Printed permanent is natively offered for casting');stage='source';await cast(a.source);}
   else if(a.phase==='main1'&&s.kind==='hex'&&a.target.zone==='hand'){assert.ok(a.casts.some(c=>c.iid===a.target.iid),'Liliana prerequisite is natively offered');stage='target';await cast(a.target);}
   else if(a.phase==='main1'&&!activated){const entry=a.acts.find(e=>e.iid===a.source.iid&&e.mana);assert.ok(entry,'The actual printed ability is offered');assert.equal(a.source.zone,'battlefield');assert.ok(a.lands.slice(0,6).every(c=>c.tapped),'Every prerequisite casting source was paid');if(s.kind==='hex')assert.equal(a.target.counters.loyalty,5);before=a;stage='ability';activated=true;await activate(entry);}
   else await button(/^(Continue|End turn)/);
  }else if(a.question==='priority')await button(/^(Proceed|Pass|Resolve)/);
  else if(a.question==='chooseX'){for(let n=0;n<30;n++){const x=Number(await page.locator('.modal .xval').innerText());if(x===1)break;await page.locator('.modal .xrow button').nth(x<1?1:0).click();}assert.equal(Number(await page.locator('.modal .xval').innerText()),1);await button(/^Confirm X=1/);}
  else if(a.question==='chooseTargets'){assert.equal(s.kind,'hex');assert.ok(a.candidates.some(c=>c.iid===a.target.iid));await page.locator('.mobileviewtab[data-view="mine"]').click();await page.locator(`.targetable[data-iid="${a.target.iid}"]`).filter({visible:true}).first().click();await page.locator('.targetpromptactions .primary:not(:disabled)').click();}
  else if(a.question==='chooseManaSources'){
   for(let n=0;n<20;n++){const current=await state();if(!current.selected.length)break;await page.locator('.manasourcerow').nth(current.candidates.findIndex(c=>c.iid===current.selected[0])).click();}
   assert.equal(await page.getByRole('button',{name:/^Tap selected sources/}).isDisabled(),true);
   const indexes=s.kind==='hex'?(stage==='source'?[0]:stage==='target'?[1,2,3,4,5]:s.mode==='B'?[6,7]:[7]):stage==='source'?[0,1,2,3,4,5]:[6,7,8,9],current=await state();
   for(const index of indexes){const n=current.candidates.findIndex(c=>c.iid===a.lands[index].iid);assert.ok(n>=0,`Native offered source ${index}`);await page.locator('.manasourcerow').nth(n).click();}
   await shot(`${s.label}-manual-payment-${stage}`);await button(/^Tap selected sources/);
  }else if(a.question==='chooseOption'){
   if(a.aiHint?.kind==='alternativeManaPayment'){const key=s.kind==='hex'?s.mode:'G',option=a.options.find(o=>o.key===key);assert.ok(option);assert.equal(a.aiHint.paymentKind,s.kind==='hex'?'phyrexian':'hybrid');assert.equal(a.aiHint.symbol,s.kind==='hex'?'{B/P}':'{G/U}');modes.push({hint:a.aiHint,options:a.options,selected:key});await shot(`${s.label}-printed-symbol-choice-${modes.length}`);await page.locator(`.modal [data-choice-key="${key}"]`).click();}
   else await page.locator(`.modal [data-choice-key="${a.options[0].key}"]`).click();
  }else if(a.question==='chooseCards'){for(const c of (a.choices||[]).slice(0,a.min||0))await page.locator(`.modal .bigcard[data-card-name="${c.name}"]`).first().click();await button(/^Confirm.*\(/);}
  else if(a.question==='attackers'||a.question==='blockers'||a.question==='combatReview')await page.locator('[data-testid="confirm-combat-battlefield"]').filter({visible:true}).click();
  else if(a.question==='chooseMulti')await button(/^Confirm/);
  else if(a.question)await button(/^(Proceed|Pass|Resolve|Continue|Got it|Confirm order)/);else await page.waitForTimeout(20);
 }
 const a=await state();assert.equal(a.done,true,'The actual native turn finishes');assert.equal(a.error,null);assert.equal(a.fallback,false);assert.ok(effectSnapshot,'The actual paid effect was observed before end-turn cleanup');assert.equal(modes.length,s.kind==='hex'?1:2);assert.equal(a.questions.filter(q=>q.type==='chooseManaSources').length,s.kind==='hex'?3:2);assertEffect(s,a,before,true);await shot(`${s.label}-resolved`);results.push({label:s.label,humanSeat:s.seat,elapsedMs:Date.now()-started,modes,before,effectSnapshot,state:a});console.log(`PASS ${s.label}`);
}
let failure=null;try{await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('[data-menu-action="solo"]').first().click();await page.waitForFunction(()=>MTG?.DEFS?.['Hex Parasite'],null,{timeout:90000});for(const s of scenarios.filter(s=>!process.env.AUDIT_SCENARIO||new RegExp(process.env.AUDIT_SCENARIO).test(s.label))){try{await run(s);}catch(e){failures.push({label:s.label,error:e.stack,state:await state().catch(()=>null)});await shot(`${s.label}-failure`).catch(()=>{});console.error(`FAIL ${s.label}: ${e.stack}`);}}}catch(e){failure=interrupted||e.stack;console.error(failure);}finally{const sourceAfter=fingerprint();writeFileSync(join(output,'result.json'),JSON.stringify({runId,sourceRoot,indexPath,assetRoot,sourceBefore,sourceAfter,sourceUnchanged:sourceBefore.inventorySha256===sourceAfter.inventorySha256,driverSha256,results,failures,browserErrors:errors,failure,fullMatches:0},null,2)+'\n');console.log(JSON.stringify({output,passed:results.length,failed:failures.length,browserErrors:errors,failure}));await browser.close();await new Promise(r=>server.close(r));}if(failure||failures.length||errors.length)process.exitCode=1;
