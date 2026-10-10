// A bounded complete-game attempt. The smoke URL selects a reproducible normal
// table; every human answer below is a visible DOM click. No engine decisions,
// rules, positions, controllers, or outcomes are replaced.
import {once} from 'node:events';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createAccountHandler,MemoryAccountStore} from '../../api/account.js';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const seed=process.env.MATCH_SEED||'330957';
const minutes=Math.min(15,Number(process.env.MATCH_MINUTES)||15);
const output=`${root}output/extended-engine-audit-2026-10-10/browser/full-match-${seed}`;
mkdirSync(output,{recursive:true});
const server=express().use('/api/account',createAccountHandler({store:new MemoryAccountStore(),limiter:null})).use(express.static(root)).listen(0,'127.0.0.1');
await once(server,'listening');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
page.setDefaultTimeout(7000);
const errors=[],actions=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
await page.addInitScript(()=>{
  localStorage.setItem('mtgOnboardingComplete','1');localStorage.setItem('mtgReducedMotion','1');
  localStorage.setItem('mtgStopProfile','off');localStorage.setItem('mtgManaMode','auto');
  localStorage.setItem('mtgPlayerPreferences',JSON.stringify({speed:'fast'}));
});

async function view(){
  return page.evaluate(()=>{
    const g=window._game,ui=window._ui,q=ui?.pending?.q||ui?.react?.q;
    if(!g)return {loaded:false};
    const card=c=>({iid:c.iid,name:c.name,zone:c.zone,owner:c.owner?.idx,mine:c===ui.me||c.ctrl===ui.me||c.zone!=='battlefield'&&c.owner===ui.me,
      player:c instanceof MTG.Player,idx:c.idx,life:c.life,power:c.power,toughness:c.toughness,mv:c.mv,
      land:typeof c.is==='function'&&c.is('Land'),creature:typeof c.is==='function'&&c.is('Creature'),
      artifact:typeof c.is==='function'&&c.is('Artifact'),enchantment:typeof c.is==='function'&&c.is('Enchantment'),
      planeswalker:typeof c.is==='function'&&c.is('Planeswalker'),kind:c.kind,tapped:c.tapped});
    return {loaded:true,turn:g.turnNo,phase:g.phase,step:g.step,active:g.turnPlayer?.idx,human:ui.me.idx,
      gameOver:g.gameOver,winner:g.winner&&{idx:g.winner.idx,name:g.winner.name,deck:g.winner.deckName,life:g.winner.life},maxTurns:g.maxTurns,
      turnLimit:g.log.some(row=>/Turn limit reached/.test(String(row.msg||row.text||row.message||row))),
      fallback:!!g._decisionFallbacks||(g.aiDecisionLog||[]).some(row=>row.fallback),
      players:g.players.map(p=>({idx:p.idx,name:p.name,deck:p.deckName,isAI:p.isAI,style:p.aiStyle,life:p.life,lost:p.lost,
        hand:p.hand.length,library:p.library.length,graveyard:p.graveyard.length,command:p.command.map(c=>({name:c.name,zone:c.zone,casts:c.cmdCasts})),
        creatures:g.creatures(p).map(card),lands:g.lands(p).map(card)})),
      question:q?.type,prompt:q?.prompt,hint:q?.aiHint?.kind,min:q?.min,max:q?.max,n:q?.n,mulls:q?.mulls,
      selected:ui.pending?.sel?.map(card)||[],options:q?.options?.map(o=>({key:o.key,label:o.label})),
      hand:ui.me.hand.map((c,index)=>({...card(c),choiceIndex:index})),choices:q?.from?.map((c,index)=>({...card(c),choiceIndex:index})),candidates:q?.candidates?.map(card),
      eligible:q?.eligible?.map(card),attackTargets:q?.attackTargets?.filter(p=>p instanceof MTG.Player&&!p.lost).map(card),
      potential:q?.potential?.map(card),incoming:q?.attackers?.map(card),
      lands:q?.lands?.map(card),casts:q?.casts?.map((e,i)=>({index:i,...card(e.card),alt:!!e.alt,from:e.from})),
      stack:g.stack.map(s=>({name:s.name,controller:s.ctrl?.idx,kind:s.kind})),nativeLog:g.log.slice(-8),
    };
  });
}
async function button(pattern){
  const b=page.getByRole('button',{name:pattern}).filter({visible:true});if(!await b.count())return false;
  await b.last().click();return true;
}
async function chooseCard(c){
  await page.locator('.modal .cardgrid .bigcard').nth(c.choiceIndex).click();
}
async function chooseTarget(c){
  if(['graveyard','exile','command'].includes(c.zone)){
    await page.locator(`.mobileviewtab[data-view="${c.mine?'mine':'table'}"]`).click();
    await page.locator(`.targetzoneopen[data-target-zone="${c.zone}"][data-target-player="${c.owner}"]`).filter({visible:true}).first().click();
    await page.locator(`.sheet .bigcard[data-card-name="${c.name}"].targetable`).first().click();
  }else if(c.kind){
    await page.locator('.mobileviewtab[data-view="stack"]').click();
    await page.locator('.sidebar .stackitem.targetable').filter({visible:true}).first().click();
  }else if(c.player){
    await page.locator(`.mobileviewtab[data-view="${c.mine?'mine':'table'}"]`).click();
    await page.locator(c.mine?'.melife.targetable':`.opprow[data-player-id="${c.idx}"] .opphead.targetable`).filter({visible:true}).first().click();
  }else{
    await page.locator(`.mobileviewtab[data-view="${c.mine?'mine':'table'}"]`).click();
    await page.locator(`.targetable[data-iid="${c.iid}"]`).filter({visible:true}).first().click();
  }
}

let lastTurn=-1,lastProgress=Date.now(),started;
let final=null,stoppedReason='';
try{
  const params=new URLSearchParams({smokeDeck:'Tramplesaurus Rex',smokeAIDeck:'Draconic Destruction',smokeAIStyle:'aggressive',seed});
  await page.goto(`http://127.0.0.1:${server.address().port}/?${params}`);
  await page.waitForFunction(()=>window._ui?.pending?.q.type==='mulligan',null,{timeout:90000});
  started=Date.now();
  const opening=await view();writeFileSync(`${output}/opening.json`,JSON.stringify(opening,null,2)+'\n');
  await page.screenshot({path:`${output}/opening.png`,animations:'disabled',timeout:15000});
  while(Date.now()-started<minutes*60000){
    const s=await view();final=s;
    if(s.gameOver){stoppedReason=s.turnLimit||s.turn>=s.maxTurns?'native turn limit':'natural game over';break;}
    if(errors.length){stoppedReason='browser error';break;}
    if(s.turn!==lastTurn){
      lastTurn=s.turn;console.log(`TURN ${s.turn} human seat ${s.human}, active ${s.active}, life ${s.players.map(p=>p.life).join('/')}, question ${s.question}`);
      writeFileSync(`${output}/progress.json`,JSON.stringify({seed,elapsedMs:Date.now()-started,actions:actions.length,state:s},null,2)+'\n');
    }
    let action=null;
    if(s.question==='mulligan'){
      const lands=s.hand.filter(c=>c.land).length;
      action=(lands<2||lands>5)&&s.mulls<2?'Mulligan':'Keep';await button(new RegExp(`^${action}`));
    }else if(s.question==='bottomCards'||s.question==='chooseCards'){
      const cards=(s.question==='bottomCards'?s.hand:s.choices)||[];
      const sacrifice=/sacrific/i.test(s.prompt||'');const discard=/discard|bottom/i.test(s.prompt||'')||s.question==='bottomCards';
      const sorted=cards.slice().sort((a,b)=>discard?Number(a.land)-Number(b.land)||b.mv-a.mv:sacrifice?a.power-b.power:Number(b.land)-Number(a.land)||b.power-a.power);
      const count=s.question==='bottomCards'?s.n:(s.min||(/search|onto the battlefield|return.*hand/i.test(s.prompt||'')?Math.min(s.max||1,cards.length):0));
      for(const c of sorted.slice(0,count).filter(c=>!s.selected.some(old=>old.iid===c.iid)))await chooseCard(c);
      await button(/^Confirm.*\(/)||await button(/^None$/)||await button(/^Cancel/);action=`${s.question} ${count}`;
    }else if(s.question==='main'){
      const land=s.lands?.[0];
      const permanent=(s.casts||[]).filter(c=>!c.alt&&(c.creature||c.artifact||c.enchantment||c.planeswalker));
      const cast=permanent.sort((a,b)=>Number(b.from==='command')-Number(a.from==='command')||a.mv-b.mv)[0]||
        (s.casts||[]).find(c=>/Cultivate|Kodama's Reach|Rampant Growth|Harmonize|Shamanic Revelation|Overwhelming Stampede|Rishkar's Expertise/.test(c.name)&&!c.alt);
      if(land){await page.locator(`.hcard[data-iid="${land.iid}"]`).click();await button(/^Play land$/);action=`land ${land.name}`;}
      else if(cast){
        if(cast.from==='command'){await page.locator('.mobileviewtab[data-view="mine"]').click();await page.locator(`.czcard[data-iid="${cast.iid}"]`).click();}
        else if(['graveyard','exile'].includes(cast.from)){
          await page.locator('.mobileviewtab[data-view="mine"]').click();
          await page.locator(`.meinfo .zone-${cast.from}`).filter({visible:true}).first().click();
          await page.locator(`.sheet .bigcard[data-card-name="${cast.name}"]`).first().click();
        }else await page.locator(`.hcard[data-iid="${cast.iid}"]`).click();
        await page.locator('.sheetacts button:not(:disabled)').filter({hasText:/^Cast/}).first().click();action=`cast ${cast.name}`;
      }else{await button(/^(Continue|End turn)/);action='end main';}
    }else if(s.question==='chooseTargets'){
      const candidates=s.candidates||[];
      const beneficial=/buff|pump|equip|attach|counter|your|protect|hexproof|gain|untap/i.test(`${s.hint||''} ${s.prompt||''}`)&&!/counter.*spell/i.test(s.prompt||'');
      const own=candidates.filter(c=>c.mine).sort((a,b)=>b.power-a.power);
      const enemy=candidates.filter(c=>!c.mine).sort((a,b)=>a.player&&b.player?a.life-b.life:a.toughness-b.toughness);
      const target=(beneficial?own[0]:enemy[0])||own[0]||candidates[0];
      if(s.selected.length<(s.min||0)&&target)await chooseTarget(target);
      const confirm=page.locator('.targetpromptactions .primary:not(:disabled)').filter({visible:true});
      if(await confirm.count()){await confirm.first().click();action='confirm legal target';}
      else if(target){await chooseTarget(target);action=`target ${target.name}`;}
    }else if(s.question==='chooseOption'){
      const option=s.options.find(o=>o.key==='command')||s.options.find(o=>o.key==='G')||s.options.find(o=>o.key==='yes')||
        s.options.find(o=>/draw|forest|create|creature/i.test(o.label))||s.options[0];
      await page.locator(`.modal [data-choice-key="${option.key}"]`).click();action=`option ${option.label}`;
    }else if(s.question==='chooseMulti'){
      const modes=page.locator('.modal .pbtn.wide:not(.primary)');for(let i=0;i<(s.min||1);i++)await modes.nth(i).click();
      await button(/^Confirm \(/);action='choose printed mode';
    }else if(s.question==='chooseX'){
      const desired=Math.max(s.min||0,Math.min(s.max||0,5));
      for(let i=0;i<50;i++){const current=Number(await page.locator('.modal .xval').innerText());if(current===desired)break;await page.locator('.modal .xrow button').nth(current<desired?1:0).click();}
      await button(/^Confirm X=/);action=`X ${desired}`;
    }else if(s.question==='attackers'){
      const target=(s.attackTargets||[]).sort((a,b)=>a.life-b.life)[0];
      if(target){for(const c of s.eligible||[]){
        await page.locator(`.ct-mobile-combat-card[data-iid="${c.iid}"]:visible, .mini.ct-combat-pick[data-iid="${c.iid}"]:visible`).first().click();
        const preferred=page.locator(`[data-combat-defender="player-${target.idx}"]:not(:disabled)`).filter({visible:true});
        if(await preferred.count())await preferred.click();
        else await page.locator('[data-combat-defender]:not(:disabled)').filter({visible:true}).first().click();
      }}
      await page.locator('[data-testid="confirm-combat-battlefield"]').filter({visible:true}).first().click();action=`attack ${s.eligible?.length||0} vs ${target?.idx}`;
    }else if(s.question==='blockers'){
      // Preserve the attack plan and keep blocker routing independently audited
      // by the focused mobile suite. Declining blocks is a real legal choice.
      await page.locator('[data-testid="confirm-combat-battlefield"]').filter({visible:true}).first().click();action='decline blocks';
    }else if(s.question==='chooseManaSources'){
      await button(/^Tap selected sources/);action='pay native suggested sources';
    }else if(s.question==='scry'){
      await button(/^Confirm order/);action='keep native scry order';
    }else if(s.question==='combatReview'){
      await page.locator('[data-testid="confirm-combat-battlefield"]').filter({visible:true}).first().click();action='review combat';
    }else if(s.question==='manualResolve'){
      stoppedReason='native manual-resolution question';break;
    }else if(await button(/^(Proceed|Pass|Resolve|Continue|End turn|Got it|Confirm order)/))action=s.question||'proceed';
    if(action){actions.push({turn:s.turn,phase:s.phase,step:s.step,question:s.question,action});lastProgress=Date.now();}
    else if(s.question&&Date.now()-lastProgress>20000){stoppedReason=`unhandled native question: ${s.question}`;break;}
    await page.waitForTimeout(action?20:100);
  }
  final=await view();stoppedReason=stoppedReason||'15-minute bounded attempt';
}catch(error){stoppedReason=`harness or product failure: ${error.stack}`;final=await view().catch(()=>null);}
finally{
  const fullMatches=final?.gameOver&&final.winner&&!final.turnLimit&&final.turn<final.maxTurns&&!errors.length?1:0;
  const report={viewport:{width:390,height:844},seed,selection:'Tramplesaurus Rex + Draconic Destruction + two seeded native random decks',
    humanDecisions:'Visible DOM clicks, proactive permanent casts and attacks, legal declined blocks',elapsedMs:started?Date.now()-started:null,
    fullMatches,stoppedReason,state:final,actions,browserErrors:errors};
  writeFileSync(`${output}/result.json`,JSON.stringify(report,null,2)+'\n');
  await page.screenshot({path:`${output}/final.png`,animations:'disabled',timeout:15000}).catch(()=>{});
  console.log(JSON.stringify({fullMatches,stoppedReason,turn:final?.turn,winner:final?.winner,actions:actions.length,browserErrors:errors}));
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
