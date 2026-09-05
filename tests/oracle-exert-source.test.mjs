import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine}from'./helpers/load-engine.mjs';
import {context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
import {createImportPlan,semanticClass}from'../scripts/import-oracle-batch.mjs';
const M=loadEngine(),cards=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-exert-source.json',import.meta.url))),plan=createImportPlan({cards,bulk:{type:'oracle_cards'},baseNames:new Set(),sequence:9995,limit:cards.length});
const missing=plan.report.cards.filter(row=>!M.DEFS[row.raw.name]);if(missing.length){M.registerOracleBatch({...plan.report,cards:missing});M.initData(M.RAW_DATA);}
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=25;},total=p=>Object.values(p.pool).reduce((a,b)=>a+b,0);
async function cast(f,name,player=f.a,targets){const card=put(M,f.game,player,name,'hand');fund(player);const before=total(player);assert.equal(await f.game.castSpell(player,card,{from:'hand',...(targets?{quickTargets:targets}:{})}),true,name+': actual paid cast');assert.ok(total(player)<before);await settle(f.game);return card;}
async function untapStep(game,player){const emit=game.emit,stop=new Error('next upkeep');game.turnPlayer=player;game.emit=async function(event,data){if(event==='upkeep')throw stop;return emit.call(this,event,data);};try{await assert.rejects(game.runTurn(),error=>error===stop);}finally{game.emit=emit;game.phase='main1';}}
async function declare(f,source,{exert,respond,check}={}){const {game,a,b}=f,decision=a.controller.decide.bind(a.controller),priority=game.priorityRound,stop=new Error('attack proof');a.controller.decide=async(g,q)=>q.type==='attackers'?[{card:source,target:b}]:q.aiHint?.kind==='exertAttack'&&exert!==undefined?(exert?'exert':'decline'):decision(g,q);game.priorityRound=async()=>{if(game.step!=='attackers')return;game.priorityRound=async()=>{};if(respond)await respond();if(check)await check();throw stop;};try{await assert.rejects(game.combatPhase(a),error=>error===stop);}finally{a.controller.decide=decision;game.priorityRound=priority;}return game.stack.find(row=>row.srcCard===source&&row.kind==='trigger');}
const buffs={
 'Nef-Crop Entangler':[1,2], 'Rhet-Crop Spearmaster':[1,0,'first strike'],'Gust Walker':[1,1,'flying'],'Hooded Brawler':[2,2],
 'Bitterblade Warrior':[1,0,'deathtouch'],'Khenra Scrapper':[2,0],'Themberchaud':[0,0,'flying'],'Glory-Bound Initiate':[1,3,'lifelink'],'Emberhorn Minotaur':[1,1,'menace'],
};
for(const role of ['human','ai'])for(const input of cards)test(`${role}: ${input.name} pays for its source and exerts during the actual declaration`,async()=>{
 const f=context(M,role),{game,a,b}=f,source=await cast(f,input.name);await untapStep(game,a);
 const friend=put(M,game,a,'Grizzly Bears'),enemy=put(M,game,b,'Colossal Dreadmaw'),hand=put(M,game,a,'Colossal Dreadmaw','hand'),grave=put(M,game,a,'Grizzly Bears','graveyard');
 if(input.name==='Ahn-Crop Champion')friend.tapped=true;
 if(role==='human'&&input.name==='Ahn-Crop Crasher'){const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(enemy)?[enemy]:decide(g,q);}
 const before={power:source.power,toughness:source.toughness,life:a.life,enemyLife:b.life,hand:a.hand.length,library:a.library.length};
 const object=await declare(f,source);assert.ok(object);assert.equal(object.ctrl,a);assert.ok(source.meta.oracleExertedBy.includes(a.idx));assert.equal(source.tapped,true);assert.equal(source.zone,'battlefield');
 assert.equal(source.power,before.power,'exert benefit has not resolved before the response window');
 await settle(game);
 const buff=buffs[input.name];if(buff){assert.equal(source.power,before.power+buff[0]);assert.equal(source.toughness,before.toughness+buff[1]);if(buff[2])assert.equal(source.kw(buff[2]),true);}
 else if(input.name==='Clockwork Droid'){assert.equal(game.canBlock(enemy,source),false);assert.equal(f.trace.some(row=>row.q.type==='scry'),true);}
 else if(input.name==='Anep, Vizier of Hazoret'){assert.equal(a.library.length,before.library-2);assert.equal(a.exile.length,2);assert.ok(a.exile.every(card=>game.castableList(a).some(row=>row.card===card)||card.is('Land')));}
 else if(input.name==='Vizier of the True')assert.equal(enemy.tapped,true);
 else if(input.name==='Watchful Naga')assert.equal(a.hand.length,before.hand+1);
 else if(input.name==='Resolute Survivors'){assert.equal(a.life,before.life+1);assert.equal(b.life,before.enemyLife-1);}
 else if(input.name==='Champion of Rhonas')assert.equal(hand.zone,'battlefield');
 else if(input.name==='Ahn-Crop Crasher')assert.equal(enemy.cur.cantBlock,true);
 else if(input.name==='Trueheart Twins'||input.name==='Tah-Crop Elite'){assert.equal(friend.power,3);assert.equal(friend.toughness,input.name==='Tah-Crop Elite'?3:2);}
 else if(input.name==="Oketra's Avenger"){await game.damageCreature(enemy,source,3,{combat:true});assert.equal(source.zone,'battlefield');assert.equal(source.damage,0);}
 else if(input.name==='Ahn-Crop Champion'){assert.equal(friend.tapped,false);assert.equal(source.tapped,true);}
 else if(input.name==='Sandstorm Crasher'){const tokens=game.creatures(a).filter(card=>card.isToken);assert.equal(tokens.length,1);const token=tokens[0];assert.equal(token.tapped,true);assert.equal(token.attacking,b);assert.equal(token.meta.oracleExertedBy,undefined,'entering attacking does not exert or trigger the printed permission');game.phase='end';await game.emit('endStep',{player:a});await settle(game);assert.notEqual(token.zone,'battlefield');}
 else if(input.name==='Battlefield Scavenger'){assert.equal(a.hand.length,before.hand);assert.equal(a.library.length,before.library-1);assert.equal(hand.zone,'graveyard');}
 else if(input.name==='Devoted Crop-Mate')assert.equal(grave.zone,'battlefield');
 else assert.fail('missing printed result '+input.name);
 assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);
});

for(const role of ['human','ai']){
 test(`${role}: real paid Stifle counters the exert benefit, after the exert cost is already paid`,async()=>{
  const f=context(M,role),{game,a,b}=f,source=await cast(f,'Gust Walker');await untapStep(game,a);await declare(f,source,{check:async()=>{assert.equal(source.power,2);assert.ok(source.meta.oracleExertedBy.includes(a.idx));const trigger=game.stack.at(-1);const stifle=put(M,game,b,'Stifle','hand');fund(b);assert.equal(await game.castSpell(b,stifle,{from:'hand',quickTargets:[trigger]}),true);await settle(game);assert.equal(source.power,2);}});await untapStep(game,a);assert.equal(source.tapped,true);assert.equal(source.meta.oracleExertedBy,undefined);await untapStep(game,a);assert.equal(source.tapped,false);
 });
 test(`${role}: decline leaves no trigger or exertion but the creature still attacks`,async()=>{const f=context(M,role),source=await cast(f,'Gust Walker');await untapStep(f.game,f.a);await declare(f,source,{exert:false});assert.equal(f.game.stack.length,0);assert.equal(source.attacking,f.b);assert.equal(source.meta.oracleExertedBy,undefined);await untapStep(f.game,f.a);assert.equal(source.tapped,false);});
 test(`${role}: real Cloudshift invalidates the source incarnation before its self pump resolves`,async()=>{const f=context(M,role),source=await cast(f,'Gust Walker');await untapStep(f.game,f.a);await declare(f,source,{respond:async()=>{const version=source.zoneVersion,spell=put(M,f.game,f.a,'Cloudshift','hand');fund(f.a);assert.equal(await f.game.castSpell(f.a,spell,{from:'hand',quickTargets:[source]}),true);await f.game.resolveTop();assert.equal(source.zone,'battlefield');assert.ok(source.zoneVersion>version);await settle(f.game);assert.equal(source.power,2);assert.equal(source.kw('flying'),false);assert.equal(source.meta.oracleExertedBy,undefined);}});});
 test(`${role}: exertion follows its payer across a real control change and expires on that payer's step`,async()=>{
  const f=context(M,role),{game,a,b}=f,source=await cast(f,'Gust Walker');await untapStep(game,a);await declare(f,source);await settle(game);
  game.turnPlayer=b;game.phase='main1';game.step='main';game.combat=null;await cast(f,'Control Magic',b,[source]);assert.equal(source.ctrl,b);source.tapped=true;await untapStep(game,b);assert.equal(source.tapped,false,'the new controller has no exertion restriction on their own step');assert.ok(source.meta.oracleExertedBy.includes(a.idx));source.tapped=true;await untapStep(game,a);assert.equal(source.tapped,true);assert.equal(source.meta.oracleExertedBy,undefined);
 });
 test(`${role}: phasing does not postpone the exerting player's actual untap step`,async()=>{
  const f=context(M,role),{game,a,b}=f,source=await cast(f,'Gust Walker');await untapStep(game,a);await declare(f,source);await settle(game);game.turnPlayer=b;game.phase='main1';game.step='main';game.combat=null;await cast(f,'Control Magic',b,[source]);game.phaseOut(source);assert.equal(source.phasedOut,true);await untapStep(game,a);assert.equal(source.phasedOut,true);assert.equal(source.meta.oracleExertedBy,undefined);await untapStep(game,b);assert.equal(source.phasedOut,false);assert.equal(source.tapped,false);
 });
 test(`${role}: repeated exertion before one step expires together, while a skipped step retains the duration`,async()=>{
  const f=context(M,role),{game,a}=f,source=await cast(f,'Gust Walker');await untapStep(game,a);await declare(f,source);await settle(game);game.untap(source);await declare(f,source);await settle(game);assert.deepEqual(Array.from(source.meta.oracleExertedBy),[a.idx]);a.skipUntapOnce=true;await untapStep(game,a);assert.ok(source.meta.oracleExertedBy.includes(a.idx));await untapStep(game,a);assert.equal(source.tapped,true);assert.equal(source.meta.oracleExertedBy,undefined);await untapStep(game,a);assert.equal(source.tapped,false);
 });
}

test('exert parser rejects unresolved or unrelated subjects and complete unsupported tails',()=>{
 const base=cards[0];for(const oracle_text of ['You may exert another creature as it attacks. When you do, draw a card.','You may exert this creature as it blocks. When you do, draw a card.','You may exert this creature as it attacks. When you do, draw X cards.','You may exert this creature as it attacks. When you do, draw a card. Then perform a dream.'])assert.equal(semanticClass({...base,oracle_text,keywords:[]},{compilerVersion:8}).semanticClass,undefined,oracle_text);
 assert.throws(()=>M.OracleV8Exert.apply({}, {kind:'exert-attack-v8',contract:'exert-attack',unknown:true},{}));
});

for(const role of ['human','ai']){
 test(`${role}: native Glorybringer offers exert during declaration and locks its damage target before responses`,async()=>{
  const f=context(M,role),{game,a,b}=f,source=await cast(f,'Glorybringer'),target=put(M,game,b,'Colossal Dreadmaw');
  const trigger=await declare(f,source);assert.ok(trigger);assert.equal(trigger.targets[0],target);assert.equal(target.damage,0);assert.ok(source.meta.oracleExertedBy.includes(a.idx));await settle(game);assert.equal(target.damage,4);
 });
 test(`${role}: native Combat Celebrant's paid cost limits the turn even when Stifle counters the benefit`,async()=>{
  const f=context(M,role),{game,a,b}=f,source=await cast(f,'Combat Celebrant');await untapStep(game,a);const friend=put(M,game,a,'Grizzly Bears');friend.tapped=true;
  await declare(f,source,{respond:async()=>{const object=game.stack.at(-1),stifle=put(M,game,b,'Stifle','hand');fund(b);assert.equal(await game.castSpell(b,stifle,{from:'hand',quickTargets:[object]}),true);await settle(game);}});assert.equal(game._extraCombats,0);assert.equal(friend.tapped,true);if(role==='human'){const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.aiHint?.kind==='tapUntap'?'untap':decide(g,q);}const twiddle=put(M,game,a,'Twiddle','hand');fund(a);assert.equal(await game.castSpell(a,twiddle,{from:'hand',quickTargets:[source]}),true);await settle(game);assert.equal(source.tapped,false);await declare(f,source);assert.equal(game.stack.length,0);assert.equal(game._extraCombats,0);
  await untapStep(game,a);game.untap(source);await declare(f,source);await settle(game);assert.equal(game._extraCombats,1);assert.equal(source.tapped,true);assert.equal(friend.tapped,false);
 });
 test(`${role}: Seedborn untaps on other players' steps but respects the actual exerting player's next step after control changes`,async()=>{
  const f=context(M,role),{game,a,b}=f,source=await cast(f,'Gust Walker');await untapStep(game,a);await declare(f,source);await settle(game);game.turnPlayer=b;game.phase='main1';game.step='main';game.combat=null;await cast(f,'Control Magic',b,[source]);await cast(f,'Seedborn Muse',b);source.tapped=true;await untapStep(game,a);assert.equal(source.tapped,true,'Seedborn is suppressed during the recorded payer step');assert.equal(source.meta.oracleExertedBy,undefined);await untapStep(game,b);assert.equal(source.tapped,false);
 });
 test(`${role}: local AI clones and JSON checkpoints retain actor identity without changing the original`,async()=>{
  const f=context(M,role),{game,a}=f,source=await cast(f,'Watchful Naga');await untapStep(game,a);await declare(f,source);await settle(game);game.combat=null;game.phase='main1';game.step='main';
  const clone=M.cloneGameForAISimulation(game,1601),copy=clone.byIid(source.iid);await untapStep(clone,clone.players[a.idx]);assert.equal(copy.tapped,true);assert.equal(copy.meta.oracleExertedBy,undefined);assert.ok(source.meta.oracleExertedBy.includes(a.idx));
  const snapshot=M.captureGameState(game);assert.ok(snapshot,JSON.stringify(M.gameStateSnapshotBlockers(game)));const fresh=context(M,role);M.restoreGameState(fresh.game,JSON.parse(JSON.stringify(snapshot)));const restored=fresh.game.byIid(source.iid);assert.deepEqual(Array.from(restored.meta.oracleExertedBy),[a.idx]);await untapStep(fresh.game,fresh.game.players[a.idx]);assert.equal(restored.tapped,true);assert.equal(restored.meta.oracleExertedBy,undefined);
 });
}

test('the local bot declines a purposeless native damage exertion and still declares its natural attack',async()=>{
 const f=context(M,'ai'),{game,a}=f,source=await cast(f,'Glorybringer');const stop=new Error('after natural attack'),priority=game.priorityRound;game.priorityRound=async()=>{if(game.step==='attackers')throw stop;};await assert.rejects(game.combatPhase(a),error=>error===stop);game.priorityRound=priority;assert.ok(source.attacking);assert.equal(source.meta.oracleExertedBy,undefined);assert.equal(game.stack.length,0);assert.equal(f.trace.some(row=>row.q.aiHint?.kind==='exertAttack'&&row.result==='decline'),true);
});

for(const role of ['human','ai'])test(`${role}: an AI simulation resolves the linked exert trigger against its own source instance`,async()=>{
 const f=context(M,role),source=await cast(f,'Gust Walker');await untapStep(f.game,f.a);await declare(f,source);const clone=M.cloneGameForAISimulation(f.game,1602),copy=clone.byIid(source.iid);await settle(clone);assert.equal(copy.power,3);assert.equal(copy.kw('flying'),true);assert.equal(source.power,2);assert.equal(source.kw('flying'),false);await settle(f.game);assert.equal(source.power,3);
});

test('two attack-exert permissions are linked independently and only the paid permission triggers',async()=>{
 const card={name:'Two independent exert permissions',layout:'normal',type_line:'Creature — Human',mana_cost:'{2}{G}',power:'2',toughness:'4',oracle_text:'You may exert this creature as it attacks. When you do, draw a card.\nYou may exert this creature as it attacks. When you do, you gain 2 life.',oracle_id:'exert-two-permissions-test',id:'exert-two-permissions-test',legalities:{commander:'legal'},games:['paper']};const fixture=createImportPlan({cards:[card],bulk:{type:'oracle_cards'},baseNames:new Set(),sequence:9999,limit:1});assert.equal(fixture.report.cards.length,1);M.registerOracleBatch(fixture.report);M.initData(M.RAW_DATA);
 for(const chosen of [[0],[1],[0,1]]){const f=context(M),{game,a}=f,source=await cast(f,card.name);await untapStep(game,a);const beforeHand=a.hand.length,life=a.life,decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.aiHint?.kind==='exertAttack'?(chosen.includes(q.aiHint.index)?'exert':'decline'):decide(g,q);await declare(f,source);assert.equal(game.stack.length,chosen.length);await settle(game);assert.equal(a.hand.length,beforeHand+Number(chosen.includes(0)));assert.equal(a.life,life+2*Number(chosen.includes(1)));assert.deepEqual(Array.from(source.meta.oracleExertedBy),[a.idx]);}
});

test('the local bot chooses real Twiddle untap/tap/unchanged outcomes from public controller and tap state',async()=>{
 for(const variant of ['friendly-tapped','enemy-untapped','friendly-untapped']){const f=context(M,'ai'),{game,a,b}=f,target=put(M,game,variant.startsWith('friendly')?a:b,'Grizzly Bears');target.tapped=variant==='friendly-tapped';await cast(f,'Twiddle',a,[target]);assert.equal(target.tapped,variant==='enemy-untapped');const choice=f.trace.findLast(row=>row.q.aiHint?.kind==='tapUntap');assert.ok(choice);assert.equal(choice.result,variant==='friendly-tapped'?'untap':variant==='enemy-untapped'?'tap':'none');}
});
