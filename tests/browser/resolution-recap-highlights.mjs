// Late requested highlights: actual printed effects and visible mobile choices.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,relative} from 'node:path';
import express from 'express';
import {createAccountHandler,MemoryAccountStore} from '../../api/account.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=join(root,'output/extended-engine-audit-2026-10-10-second/highlights',`browser-${Date.now()}-${process.pid}`);
mkdirSync(out,{recursive:true});
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
function fingerprint(){
  const paths=[];const walk=dir=>{for(const item of readdirSync(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory())walk(path);else if(item.name.endsWith('.js'))paths.push(path);}};
  walk(join(root,'src'));paths.push(join(root,'api/account.js'),join(root,'index.html'));
  const inventory=paths.map(path=>({path:relative(root,path),sha256:sha(path)})).sort((a,b)=>a.path.localeCompare(b.path));
  return {inventorySha256:createHash('sha256').update(JSON.stringify(inventory)).digest('hex'),inventory};
}
const sourceBefore=fingerprint(),driverSha256=sha(fileURLToPath(import.meta.url));
const server=express().use('/api/account',createAccountHandler({store:new MemoryAccountStore(),limiter:null})).use(express.static(root)).listen(0,'127.0.0.1');
await once(server,'listening');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
page.setDefaultTimeout(6000);
const errors=[],results=[],failures=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');localStorage.setItem('mtgManaMode','auto');});
async function install(kind){await page.evaluate(kind=>{
  document.querySelectorAll('.toastmsg,.battlefieldarrival,.turnbanner,.gamefxlayer').forEach(n=>n.remove());
  const root=document.querySelector('#game');root.replaceWith(root.cloneNode(false));
  document.querySelector('#setup').style.display='none';document.querySelector('#game').style.display='flex';document.body.classList.add('game-active');
  const ui=new MTG.UI(),g=new MTG.Game({seed:73191,paced:true,onEvent:()=>ui.queueRender()});
  const ps=['You','Native AI1','Native AI2','Native AI3'].map((name,i)=>g.addPlayer(name,{name:'Printed highlight'},null,i!==0)),a=ps[0],b=ps[1];
  ui.game=g;ui.me=a;ui.prioMode='off';ui.acceptAllReveals=-1;
  a.controller=ui.controllerFor(a);for(const p of ps.slice(1))p.controller=new MTG.AIController(p,{difficulty:'normal'});
  g.turnNo=6;g.turnPlayer=a;g.phase='main1';g.step='main';g.speedFactor=0;
  window._ui=ui;window._game=g;const audit=window.__highlight={kind,done:false,error:null,questions:[]};
  const decide=a.controller.decide.bind(a.controller);a.controller.decide=(game,q)=>{audit.questions.push({type:q.type,step:g.step});return decide(game,q);};
  const put=(name,owner=a,zone='battlefield')=>{if(!MTG.DEFS[name])throw Error(name);const c=new MTG.CardInst(MTG.DEFS[name],owner);c.zone=zone;c.sick=false;(zone==='battlefield'?g.battlefield:owner[zone]).push(c);return c;};
  for(const p of ps)for(let i=0;i<8;i++)put('Forest',p,'library');
  let spell;
  if(kind.startsWith('yuriko')){audit.attacker=put("Yuriko, the Tiger's Shadow");audit.card=put(kind==='yuriko-zero'?'Island':'Sol Ring',a,'library');}
  if(kind==='swords'){audit.card=put('Grizzly Bears',b);put('Plains');spell=put('Swords to Plowshares',a,'hand');}
  if(kind==='lantern'){audit.card=put('Grizzly Bears',b,'graveyard');put('Wastes');spell=put('Soul-Guide Lantern',a,'hand');}
  if(kind==='blink'){audit.card=put('Grizzly Bears');put('Plains');spell=put('Cloudshift',a,'hand');}
  if(kind==='gonti-private'){audit.card=put('Colossal Dreadmaw',b,'library');put('Swamp');put('Swamp');put('Wastes');put('Wastes');spell=put('Gonti, Lord of Luxury',a,'hand');}
  audit.spell=spell;g.recalc();ui.render();
  const work=spell?g.castSpell(a,spell,{from:'hand'}):g.combatPhase(a);
  void work.then(result=>{audit.result=result;audit.done=true;ui.render();}).catch(e=>{audit.error=e.stack;ui.render();});
},kind);}
async function state(){return page.evaluate(()=>{
  const a=__highlight,ui=_ui,g=_game,q=ui.pending?.q||ui.react?.q;
  return {done:a.done,error:a.error,question:q?.type,recap:q?.recap,attacker:a.attacker?.iid,
    selected:ui.pending?.sel?.length||0,target:a.card.iid,targetZone:a.card.zone,life:g.players.map(p=>p.life),
    choices:q?.from?.map((c,i)=>({iid:c.iid,name:c.name,index:i})),
    candidates:q?.candidates?.map(c=>({iid:c.iid,idx:c.idx,zone:c.zone,owner:c.owner?.idx,player:c instanceof MTG.Player})),
    questions:a.questions,stack:g.stack.map(s=>s.name),publicLog:g.log,
    card:{name:a.card.name,zone:a.card.zone,faceDown:a.card.faceDown,mv:a.card.mv},
    fallback:!!g._decisionFallbacks||(g.aiDecisionLog||[]).some(row=>row.fallback)};
});}
async function button(pattern){const b=page.getByRole('button',{name:pattern}).filter({visible:true});if(await b.count()){await b.last().click();return true;}return false;}
async function reachRecap(kind){
  for(let i=0;i<150;i++){
    const s=await state();assert.equal(s.error,null);assert.equal(s.fallback,false);if(s.recap)return s;assert.equal(s.done,false,'printed effect waits for its result highlight');
    if(s.question==='attackers'){
      await page.locator(`.ct-mobile-combat-card[data-iid="${s.attacker}"]:visible, .mini.ct-combat-pick[data-iid="${s.attacker}"]:visible`).first().click();
      await page.locator('[data-combat-defender="player-1"]').filter({visible:true}).click();
      await page.locator('[data-testid="confirm-combat-battlefield"]').filter({visible:true}).click();
    }else if(s.question==='chooseTargets'){
      if(!s.selected){const c=kind==='gonti-private'?s.candidates.find(c=>c.idx===1):s.candidates.find(c=>c.iid===s.target);assert.ok(c,'actual printed target offered');
        if(c.player){await page.locator('.mobileviewtab[data-view="table"]').click();await page.locator('.opprow[data-player-id="1"] .opphead.targetable').filter({visible:true}).click();}
        else if(c.zone==='graveyard'){await page.locator('.mobileviewtab[data-view="table"]').click();await page.locator('.targetzoneopen[data-target-zone="graveyard"][data-target-player="1"]').filter({visible:true}).click();await page.locator('.sheet .bigcard[data-card-name="Grizzly Bears"].targetable').click();}
        else{await page.locator(`.mobileviewtab[data-view="${c.owner===0?'mine':'table'}"]`).click();await page.locator(`.targetable[data-iid="${c.iid}"]`).filter({visible:true}).first().click();}
      }
      await page.locator('.targetpromptactions .primary:not(:disabled)').filter({visible:true}).click();
    }else if(s.question==='chooseCards'){
      const c=s.choices.find(c=>c.iid===s.target)||s.choices[0];assert.ok(c);
      if(!s.selected)await page.locator('.modal .cardgrid .bigcard').nth(c.index).click();
      await button(/^Confirm.*\(/);
    }else if(s.question==='chooseOption'){
      await page.locator('.modal [data-choice-key]').filter({visible:true}).first().click();
    }else await button(/^(Proceed|Pass|Continue|Let it|Let resolve|Got it|Confirm order)/);
    await page.waitForTimeout(40);
  }
  throw Error('No native highlight '+JSON.stringify(await state()));
}
let failure=null;
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('[data-menu-action="solo"]').first().click();await page.waitForFunction(()=>MTG.DEFS?.['Sol Ring'],null,{timeout:90000});
  for(const kind of ['yuriko-one','yuriko-zero','swords','lantern','blink','gonti-private']){
    try{
      await install(kind);const s=await reachRecap(kind);const modal=page.locator('[data-testid="resolution-recap"]');const text=await modal.innerText();
      assert.equal(await modal.getAttribute('data-impact'),'major');assert.ok(await modal.locator('.resolutionrecapstats').isVisible());
      const rows=await modal.locator('.resolutionrecapbody > .resolutionrecapsection .resolutionrecaprow').allTextContents();assert.ok(rows.length<=3);
      if(kind.startsWith('yuriko')){assert.match(rows[0],new RegExp(`${kind==='yuriko-zero'?'Island':'Sol Ring'}.*mana value ${kind==='yuriko-zero'?0:1}.*library → hand`));assert.match(rows[1],/Native AI1: 39 → (38|39) life/);assert.match(rows[1],/Native AI2: 40 → (39|40) life/);assert.match(rows[1],/Native AI3: 40 → (39|40) life/);assert.equal(s.recap.totalDamage,0);}
      if(kind==='swords'){assert.match(rows[0],/Grizzly Bears.*battlefield → exile/);assert.equal(s.life[1],42);}
      if(kind==='lantern')assert.match(rows[0],/Grizzly Bears.*graveyard → exile/);
      if(kind==='blink'){assert.match(rows[0],/battlefield → exile/);assert.match(rows[1],/exile → battlefield/);assert.equal(s.card.zone,'battlefield');}
      if(kind==='gonti-private'){assert.match(rows[0],/Face-down card.*library → exile/);assert.doesNotMatch(text,/Colossal Dreadmaw/);assert.equal(s.card.faceDown,true);}
      const before=await state();await page.waitForTimeout(150);assert.equal((await state()).done,false,'highlight requires visible acknowledgment');
      const dimensions=[];
      for(const [width,height] of [[390,844],[320,568]]){
        await page.setViewportSize({width,height});await modal.waitFor();
        await page.waitForFunction(()=>{const r=document.querySelector('.resolutionrecapproceed')?.getBoundingClientRect();return r&&r.top>=0&&r.bottom<=innerHeight+1&&r.right<=innerWidth+1;});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
        await page.screenshot({path:join(out,`${kind}-${width}x${height}.png`),animations:'disabled'});dimensions.push({width,height,proceedReachable:true});
      }
      await page.setViewportSize({width:390,height:844});await modal.locator('.resolutionrecapproceed').click();
      await page.waitForFunction(()=>__highlight.done||__highlight.error);assert.equal((await state()).error,null);
      results.push({label:kind,recap:s.recap,rows,state:before,viewports:dimensions});console.log('PASS '+kind);
    }catch(e){failures.push({label:kind,error:e.stack,state:await state().catch(()=>null)});await page.screenshot({path:join(out,`${kind}-failed.png`)});console.error('FAIL '+kind+': '+e.stack);}
  }
}catch(e){failure=e.stack;console.error(failure);}
finally{
  const sourceAfter=fingerprint();const report={viewport:{width:390,height:844},sourceBefore,sourceAfter,sourceUnchanged:sourceBefore.inventorySha256===sourceAfter.inventorySha256,driverSha256,results,failures,browserErrors:errors,failure,fullMatches:0};
  writeFileSync(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({out,passed:results.length,failed:failures.length,browserErrors:errors,failure,sourceUnchanged:report.sourceUnchanged}));await browser.close();await new Promise(resolve=>server.close(resolve));
}
if(failure||failures.length||errors.length)process.exitCode=1;
