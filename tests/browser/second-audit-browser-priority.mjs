// Native mobile priority/combat audit. Starting positions use printed cards;
// every player decision and mana payment is a visible DOM click.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync,readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join,relative} from 'node:path';
import express from 'express';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const sourceRoot=resolve(process.env.AUDIT_SOURCE_ROOT||root);
const {createAccountHandler,MemoryAccountStore}=await import(pathToFileURL(join(sourceRoot,'api/account.js')).href);
const indexPath=existsSync(join(sourceRoot,'index.html'))?join(sourceRoot,'index.html'):join(root,'index.html');
const assetRoot=existsSync(join(sourceRoot,'assets'))?join(sourceRoot,'assets'):join(root,'assets');
const runId=`${Date.now()}-${process.pid}`;
const output=join(root,'output/extended-engine-audit-2026-10-10-second/browser',`priority-${runId}`);
mkdirSync(output,{recursive:true});
const sourceHashes=Object.fromEntries(['src/modules/engine.js','src/modules/engine2.js','src/modules/ui.js'].map(path=>[path,createHash('sha256').update(readFileSync(join(sourceRoot,path))).digest('hex')]));
function fingerprint(){
  const files=[];const walk=directory=>{for(const entry of readdirSync(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())walk(path);else if(entry.name.endsWith('.js'))files.push(path);}};
  walk(join(sourceRoot,'src'));files.push(join(sourceRoot,'api/account.js'));
  const inventory=files.map(path=>({path:relative(sourceRoot,path),sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
  inventory.push({path:'index.html',sha256:createHash('sha256').update(readFileSync(indexPath)).digest('hex')});inventory.sort((a,b)=>a.path.localeCompare(b.path));
  return {inventorySha256:createHash('sha256').update(JSON.stringify(inventory)).digest('hex'),inventory};
}
const sourceBefore=fingerprint(),driverSha256=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const server=express().use('/api/account',createAccountHandler({store:new MemoryAccountStore(),limiter:null})).get('/',(req,res)=>res.sendFile(indexPath)).use('/assets',express.static(assetRoot)).use(express.static(sourceRoot)).listen(0,'127.0.0.1');
await once(server,'listening');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
page.setDefaultTimeout(6000);
const errors=[],results=[],caseFailures=[];
let interrupted='';
const interrupt=signal=>{if(!interrupted){interrupted=`interrupted by ${signal}`;void page.close().catch(()=>{});}};
process.once('SIGTERM',()=>interrupt('SIGTERM'));process.once('SIGINT',()=>interrupt('SIGINT'));
page.on('pageerror',e=>{if(!interrupted)errors.push(e.message);});page.on('console',m=>{if(m.type()==='error'&&!interrupted)errors.push(m.text());});
await page.addInitScript(()=>{localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');localStorage.setItem('mtgManaMode','auto');localStorage.setItem('mtgStopProfile','end');});
const scenarios=[
  ...[0,1,2,3].map(seat=>({label:`END-paid-growth-seat-${seat}`,seat,kind:'growth',lands:['Forest']})),
  ...[0,1,2,3].map(seat=>({label:`END-unpayable-growth-skips-seat-${seat}`,seat,kind:'unpayable',lands:[]})),
  {label:'END-manual-growth-exact-second-forest',seat:2,kind:'growth',lands:['Forest','Forest'],manual:true,exactSecond:true},
  {label:'END-only-mana-source-skips',seat:1,kind:'empty',lands:['Island']},
  {label:'END-sorcery-hand-skips',seat:2,kind:'sorcery',lands:['Forest','Forest']},
  {label:'END-equip-sorcery-timing-skips',seat:3,kind:'equip',lands:['Forest','Forest']},
  {label:'END-yuriko-command-paid-seat-1',seat:1,kind:'yuriko',lands:['Island','Swamp']},
  {label:'END-yuriko-command-manual-seat-3',seat:3,kind:'yuriko',lands:['Island','Swamp'],manual:true},
  {label:'END-hacker-hand-paid-seat-0',seat:0,kind:'hacker',lands:['Island']},
  {label:'END-hacker-hand-manual-seat-2',seat:2,kind:'hacker',lands:['Island','Island'],manual:true,exactSecond:true},
  {label:'END-cycling-hand-paid-seat-3',seat:3,kind:'cycling',lands:['Island']},
  {label:'END-cycling-manual-exact-second-island',seat:0,kind:'cycling',lands:['Island','Island'],manual:true,exactSecond:true},
  {label:'END-graveyard-skeleton-manual-exact-forest-swamp',seat:1,kind:'skeleton',lands:['Forest','Forest','Swamp'],manual:true,exactSecond:true,selectedLandIndexes:[1,2]},
  {label:'FULL-signet-manual-nested-fee-exact-second-wastes',seat:3,kind:'signet',lands:['Wastes','Wastes'],manual:true,exactSecond:true,profile:'full'},
  {label:'ACTIONS-yuriko-command-window-only',seat:2,kind:'yuriko',lands:['Island','Swamp'],profile:'off'},
  {label:'ACTIONS-hacker-hand-window-only',seat:1,kind:'hacker',lands:['Island'],profile:'off'},
  {label:'ACTIONS-HOLD-empty-window-once',seat:1,kind:'empty',lands:[],profile:'off',hold:true},
  {label:'FULL-empty-native-windows',seat:3,kind:'empty',lands:[],profile:'full'},
  {label:'END-xantcha-owner-battle-other-protector-mobile',seat:1,kind:'battle',lands:[]},
];
async function state(){return page.evaluate(()=>{
  const a=__audit,g=_game,ui=_ui,q=ui.pending?.q||ui.react?.q;
  const card=c=>c&&({iid:c.iid,name:c.name,zone:c.zone,tapped:c.tapped,power:c.power,toughness:c.toughness,idx:c.idx,ctrl:c.ctrl?.idx,owner:c.owner?.idx,counters:{...c.counters},protector:c.protector?.idx,attacking:c.attacking?.idx,manaSpent:c.castMeta?.manaSpent});
  return {done:a.done,error:a.error,step:g.step,phase:g.phase,question:q?.type,hint:q?.aiHint?.kind,prompt:q?.prompt,min:q?.min,
    pending:ui.pending?.q.type,reaction:!!ui.react,selected:ui.pending?.sel.map(c=>c.iid)||[],holdNext:ui.holdNext,manaMode:ui.manaMode,
    source:card(a.source),bear:card(a.bear),lands:a.lands.map(card),libraryCount:a.human.library.length,life:g.players.map(p=>p.life),
    hand:a.human.hand.map(c=>c.name),graveyard:a.human.graveyard.map(c=>c.name),questions:a.questions,actions:a.actions,events:a.events,
    legalDestinations:g.legalDeclarationAttackTargets(a.bear).map(card),ownerWalker:card(a.ownerWalker),
    choices:q?.from?.map(card),candidates:q?.candidates?.map(card),options:q?.options?.map(o=>({key:o.key,label:o.label})),
    sourceOffered:!!q&&(q.casts?.some(e=>e.card===a.source)||q.acts?.some(e=>e.card===a.source)),
    acts:q?.acts?.map(e=>({iid:e.card.iid,name:e.card.name,label:ui.activationLabel(e),ninjutsu:!!e.ninjutsu})),
    casts:q?.casts?.map(e=>({iid:e.card.iid,name:e.card.name})),stack:g.stack.map(so=>so.name),pool:{...a.human.pool},
    defenderLabels:Array.from(document.querySelectorAll('.ct-defender-choice')).map(node=>node.textContent),
    combatReviewLabels:Array.from(document.querySelectorAll('.combatreviewtarget, .ct-mobile-combat .ct-battle-copy small')).map(node=>node.textContent),
    defenseGroups:Array.from(document.querySelectorAll('.ct-mobile-combat-defense-player')).map(node=>({player:Number(node.dataset.defensePlayer),open:node.open,copy:node.querySelector('summary')?.textContent})),
    fallback:!!g._decisionFallbacks||(g.aiDecisionLog||[]).some(row=>row.fallback),
  };});}
async function fixture(s){await page.evaluate(s=>{
  localStorage.setItem('mtgManaMode','auto');
  const old=document.querySelector('#game');old.replaceWith(old.cloneNode(false));document.querySelector('#setup').style.display='none';document.querySelector('#game').style.display='flex';document.body.classList.add('game-active');
  const ui=new MTG.UI(),g=new MTG.Game({seed:773501,paced:true,onEvent:()=>ui.queueRender()});
  const players=Array.from({length:4},(_,idx)=>g.addPlayer(idx===s.seat?'You':`Native AI ${idx}`,{name:'Quick Draw'},null,idx!==s.seat));
  const human=players[s.seat],enemy=players[(s.seat+1)%4];ui.game=g;ui.me=human;ui.prioMode=s.profile||'end';human.controller=ui.controllerFor(human);
  for(const player of players.filter(p=>p!==human))player.controller=new MTG.AIController(player,{difficulty:'normal',style:'aggressive'});
  g.turnPlayer=human;g.turnNo=9;g.phase='main1';g.step='main';g.speedFactor=0;window._game=g;window._ui=ui;
  const put=(name,owner=human,zone='battlefield')=>{if(!MTG.DEFS[name])throw Error(`Missing ${name}`);const c=new MTG.CardInst(MTG.DEFS[name],owner);c.zone=zone;c.ctrl=owner;c.sick=false;(zone==='battlefield'?g.battlefield:owner[zone]).push(c);return c;};
  for(const p of players)for(let n=0;n<10;n++)put('Forest',p,'library');
  const bear=s.kind==='battle'?put('Xantcha, Sleeper Agent',players[0]):put('Grizzly Bears'),lands=s.lands.map(name=>put(name));
  let source=null,ownerWalker=null;
  if(s.kind==='battle'){bear.ctrl=human;source=put('Invasion of Zendikar // Awakened Skyclave',players[0]);source.counters.defense=3;source.protector=players[2];ownerWalker=put('Jace Beleren',players[0]);ownerWalker.counters.loyalty=3;}
  if(['growth','unpayable'].includes(s.kind))source=put('Giant Growth',human,'hand');
  if(s.kind==='sorcery')source=put('Rampant Growth',human,'hand');
  if(s.kind==='equip')source=put('Skullclamp');
  if(s.kind==='cycling')source=put('Lonely Sandbar',human,'hand');
  if(s.kind==='skeleton')source=put('Reassembling Skeleton',human,'graveyard');
  if(s.kind==='signet')source=put('Izzet Signet');
  if(s.kind==='hacker')source=put('Moon-Circuit Hacker',human,'hand');
  if(s.kind==='yuriko'){source=put("Yuriko, the Tiger's Shadow",human,'command');source.isCommander=true;human.commanders=[source];}
  const a=window.__audit={human,enemy,bear,source,ownerWalker,lands,done:false,error:null,questions:[],actions:[],events:[]};
  g.recalc();
  const decide=human.controller.decide.bind(human.controller);
  human.controller.decide=(game,q)=>{a.questions.push({type:q.type,step:game.step,phase:game.phase,prompt:q.prompt,
    autoPass:null,
    casts:(q.casts||[]).map(e=>e.card.name),acts:(q.acts||[]).map(e=>({name:e.card.name,label:ui.activationLabel(e),ninjutsu:!!e.ninjutsu})),stack:game.stack.map(so=>so.name)});return decide(game,q);};
  const auto=ui.autoAnswer.bind(ui);
  ui.autoAnswer=(game,q)=>{const answer=auto(game,q);if(q.type==='priority')a.questions.at(-1).autoPass=answer?.kind==='pass';return answer;};
  const perform=g.performAction;
  g.performAction=async function(player,action){const ok=await perform.call(this,player,action);a.actions.push({kind:action.kind,name:action.card?.name||action.entry?.card?.name,ok,pool:{...player.pool}});return ok;};
  const emit=g.emit;g.emit=async function(event,data,...args){if(event==='countersRemoved')a.events.push({event,iid:data.card?.iid,kind:data.kind,before:data.before,after:data.after});return emit.call(this,event,data,...args);};
  void g.combatPhase(human).then(()=>{a.done=true;ui.render();}).catch(e=>{a.error=e.stack;});ui.render();
},s);}
async function button(regex){const b=page.getByRole('button',{name:regex}).filter({visible:true});assert.ok(await b.count(),`Visible button ${regex}`);await b.last().click();}
async function shot(label){await page.screenshot({path:join(output,`${label}.png`),animations:'disabled'});writeFileSync(join(output,`${label}.json`),JSON.stringify(await state(),null,2)+'\n');}
async function run(s){
  await fixture(s);let reacted=false,manualToggled=false,held=false,forcedWindows=0,battleLabel=null,battleReview=null,battleDefenseGroups=null;
  const started=Date.now();
  while(Date.now()-started<45000){
    const a=await state();assert.equal(a.error,null);assert.equal(errors.length,0);if(a.done)break;
    if(s.manual&&!manualToggled){await page.locator('.tbtn.hudaction.manamode').click();assert.equal((await state()).manaMode,'manual');manualToggled=true;}
    if(a.question==='attackers'){
      if(s.hold&&!held){await page.locator('.tbtn.hudaction').filter({hasText:'HOLD'}).click();assert.equal((await state()).holdNext,true);held=true;}
      await page.locator(`.ct-mobile-combat-card[data-iid="${a.bear.iid}"]:visible, .mini.ct-combat-pick[data-iid="${a.bear.iid}"]:visible`).first().click();
      if(s.kind==='battle'){
        assert.ok(a.legalDestinations.some(c=>c.iid===a.source.iid),'Native Xantcha can attack its owner\'s Battle protected by another opponent');
        assert.ok(!a.legalDestinations.some(c=>c.idx===0||c.iid===a.ownerWalker.iid),'Native owner/player and owner/planeswalker restrictions remain');
        const target=page.locator(`[data-combat-defender="card-${a.source.iid}"]`).filter({visible:true});battleLabel=await target.textContent();await target.click();battleDefenseGroups=(await state()).defenseGroups;await shot(`${s.label}-native-legal-battle-label`);
      }else await page.locator(`[data-combat-defender="player-${(s.seat+1)%4}"]`).filter({visible:true}).click();
      await page.locator('[data-testid="confirm-combat-battlefield"]').filter({visible:true}).click();
    }else if(a.question==='priority'){
      if(a.pending==='priority'&&!a.stack.length)forcedWindows++;
      if(!reacted&&a.step==='blockers'&&['growth','yuriko','hacker','cycling','skeleton','signet'].includes(s.kind)){
        assert.equal(a.sourceOffered,true,'The native blockers priority question offers the printed payable response');
        assert.ok(a.questions.filter(q=>q.type==='priority'&&['begin','attackers'].includes(q.step)).every(q=>!q.acts.some(e=>e.ninjutsu)),'Ninjutsu is unavailable before blockers');
        await shot(`${s.label}-legal-window`);
        if(s.kind==='growth'){
          await page.locator(`.hcard[data-iid="${a.source.iid}"]`).click();await page.locator('.sheetacts button:not(:disabled)').filter({hasText:/^Cast/}).first().click();
        }else{
          const direct=page.locator('.priorityabilities .abilitybtn').filter({hasText:a.source.name});
          assert.ok(await direct.count(),'Hand/command reaction ability is visible at the native priority window');await direct.first().click();
        }
        reacted=true;
      }else await button(/^(Proceed|Pass|Resolve)/);
    }else if(a.question==='chooseTargets'){
      assert.ok(a.candidates.some(c=>c.iid===a.bear.iid));await page.locator('.mobileviewtab[data-view="mine"]').click();await page.locator(`.targetable[data-iid="${a.bear.iid}"]`).filter({visible:true}).first().click();await page.locator('.targetpromptactions .primary:not(:disabled)').click();
    }else if(a.question==='chooseCards'){
      if(a.min>0){assert.ok(a.choices.some(c=>c.iid===a.bear.iid),'Ninjutsu chooses the actual unblocked Bear');await page.locator('.modal .bigcard[data-card-name="Grizzly Bears"]').click();}
      await button(/^Confirm.*\(/);
    }else if(a.question==='chooseManaSources'){
      if(s.exactSecond){
        for(let n=0;n<4;n++){const current=await state();if(!current.selected.length)break;const index=current.candidates.findIndex(c=>c.iid===current.selected[0]);await page.locator('.manasourcerow').nth(index).click();}
        assert.equal(await page.getByRole('button',{name:/^Tap selected sources/}).isDisabled(),true,'An empty selection cannot pay the actual printed cost');
        const current=await state();
        if(s.kind==='signet')assert.ok(!current.candidates.some(c=>c.iid===a.source.iid),'The native Signet fee excludes its own producer');
        for(const landIndex of s.selectedLandIndexes||[1]){const index=current.candidates.findIndex(c=>c.iid===a.lands[landIndex].iid);assert.ok(index>=0);await page.locator('.manasourcerow').nth(index).click();}
      }
      await shot(`${s.label}-native-mana-payment`);await button(/^Tap selected sources/);
    }else if(a.question==='chooseOption'){
      const option=a.options.find(o=>o.key==='yes')||a.options.find(o=>o.key==='command')||a.options[0];await page.locator(`.modal [data-choice-key="${option.key}"]`).click();
    }else if(a.question==='combatReview'){
      if(s.kind==='battle'){battleReview=a.combatReviewLabels.join(' ');await shot(`${s.label}-native-combat-review-label`);}
      await page.locator('[data-testid="confirm-combat-battlefield"]').filter({visible:true}).click();
    }
    else if(a.question)await button(/^(Proceed|Pass|Resolve|Continue|Got it|Confirm order)/);
    else await page.waitForTimeout(20);
  }
  const a=await state();assert.equal(a.done,true,'Native combat finishes after visible actions');assert.equal(a.error,null);assert.equal(a.fallback,false);
  const priority=a.questions.filter(q=>q.type==='priority'&&!q.stack.length);
  if(['unpayable','empty','sorcery','equip'].includes(s.kind)&&!s.hold&&s.profile!=='full'){
    assert.ok(priority.length>0,'Native empty-action questions reached human policy');assert.ok(priority.every(q=>q.autoPass),'END skips every actual empty legal-action priority window');assert.equal(forcedWindows,0);assert.equal(reacted,false);assert.equal(a.life[(s.seat+1)%4],38);
  }
  if(['growth','yuriko','hacker','cycling','skeleton','signet'].includes(s.kind)){
    assert.equal(reacted,true);assert.ok(a.actions.some(action=>action.name===a.source.name&&action.ok),'The native response resolved successfully');
    if(s.kind==='growth'){assert.equal(a.source.zone,'graveyard');assert.equal(a.bear.power,5);assert.equal(a.life[(s.seat+1)%4],35);}
    if(['yuriko','hacker'].includes(s.kind)){assert.equal(a.source.zone,'battlefield');assert.equal(a.bear.zone,'hand');assert.equal(a.source.tapped,true);assert.equal(a.life[(s.seat+1)%4],s.kind==='yuriko'?39:38);assert.equal(a.libraryCount,9);}
    if(s.kind==='cycling'){assert.equal(a.source.zone,'graveyard');assert.equal(a.libraryCount,9);assert.equal(a.life[(s.seat+1)%4],38);}
    if(s.kind==='skeleton'){assert.equal(a.source.zone,'battlefield');assert.equal(a.source.tapped,true);assert.equal(a.libraryCount,10);assert.equal(a.life[(s.seat+1)%4],38);}
    if(s.kind==='signet'){assert.equal(a.source.tapped,true);const action=a.actions.find(action=>action.name===a.source.name&&action.ok);assert.equal(action.pool.U,1);assert.equal(action.pool.R,1);assert.equal(action.pool.C,0);assert.equal(a.life[(s.seat+1)%4],38);}
    if(s.exactSecond){assert.equal(a.lands[0].tapped,false);assert.equal(a.lands[1].tapped,true);}else assert.ok(a.lands.some(c=>c.tapped),'Printed response consumed real mana sources');
    if(s.selectedLandIndexes)for(const index of s.selectedLandIndexes)assert.equal(a.lands[index].tapped,true);
    if(s.manual)assert.ok(a.questions.some(q=>q.type==='chooseManaSources'),'Manual mode reached native source payment');
  }
  if(s.hold){assert.equal(forcedWindows,1,'HOLD offers one empty native priority question in ACTIONS');assert.equal(a.holdNext,false);}
  if(s.profile==='full')assert.ok(forcedWindows>=3,'FULL offers actual empty native combat priority windows');
  if(s.kind==='battle'){assert.ok(a.events.some(e=>e.iid===a.source.iid&&e.kind==='defense'&&e.before===3&&e.after===0),'Native declared Battle receives real combat damage and loses its defense counters');assert.ok(a.life.every(life=>life===40),'The Battle attack never redirects damage to a player');await shot(`${s.label}-native-damage-complete`);assert.match(battleLabel,/3 defense/i,'The mobile Battle destination displays its actual defense');assert.match(battleLabel,/Native AI 2/i,'The mobile destination identifies the Battle protector');assert.doesNotMatch(battleLabel,/loyalty/i,'A Battle is never labeled with planeswalker loyalty');assert.ok(battleDefenseGroups.some(group=>group.player===2&&group.open),'The focused defending creatures belong to the native Battle protector');assert.ok(!battleDefenseGroups.some(group=>group.player===0&&group.open),'The unrelated Battle owner is not the focused defender');}
  await shot(`${s.label}-resolved`);const result={label:s.label,humanSeat:s.seat,profile:s.profile||'end',reacted,forcedWindows,battleLabel,battleReview,battleDefenseGroups,elapsedMs:Date.now()-started,state:a};results.push(result);console.log(`PASS ${s.label}`);
}
let failure=null;
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('[data-menu-action="solo"]').first().click();await page.waitForFunction(()=>window.MTG?.DEFS?.['Giant Growth'],null,{timeout:90000});
  for(const s of scenarios.filter(s=>!process.env.AUDIT_SCENARIO||new RegExp(process.env.AUDIT_SCENARIO).test(s.label))){
    try{await run(s);}catch(e){const receipt=await state().catch(()=>null);caseFailures.push({label:s.label,error:e.stack,state:receipt});await shot(`${s.label}-failure`).catch(()=>{});console.error(`FAIL ${s.label}: ${e.stack}`);}
  }
}catch(e){failure=interrupted||e.stack;await shot('failure').catch(()=>{});console.error(failure);}
finally{
  const sourceAfter=fingerprint();const report={runId,sourceRoot,indexPath,assetRoot,sourceRevision:process.env.AUDIT_SOURCE_REVISION||null,sourceHashes,sourceBefore,sourceAfter,sourceUnchanged:sourceBefore.inventorySha256===sourceAfter.inventorySha256,driverSha256,viewport:{width:390,height:844},results,caseFailures,browserErrors:errors,failure,fullMatches:0};writeFileSync(join(output,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,passed:results.length,failed:caseFailures.length,browserErrors:errors,failure,sourceUnchanged:report.sourceUnchanged}));await browser.close();await new Promise(resolve=>server.close(resolve));
}
if(failure||caseFailures.length||errors.length)process.exitCode=1;
