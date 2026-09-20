import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v14-compositions.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9928,limit:absent.length,compilerVersion:14});assert.equal(plan.report.cards.length,absent.length,plan.report.deferred?.map(row=>row.name+': '+row.reason).join('\n'));M.registerOracleBatch(plan.report);}
M.initData(M.RAW_DATA);
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=50;};
function chooseTargets(player,targets){const decide=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>q.type==='chooseTargets'&&targets.some(target=>q.candidates.includes(target))?targets.filter(target=>q.candidates.includes(target)):decide(g,q);return ()=>{player.controller.decide=decide;};}
async function announce(f,name,targets=[],options={},player=f.a){
  const source=typeof name==='string'?put(M,f.game,player,name,'hand'):name;fund(player);const restore=chooseTargets(player,targets);
  try{assert.equal(await f.game.castSpell(player,source,{from:'hand',...options}),true,source.name+': paid cast');return {card:source,so:f.game.stack.find(object=>object.card===source)};}finally{restore();}
}
async function cast(f,name,targets=[],options={},player=f.a){const row=await announce(f,name,targets,options,player);await settle(f.game);assertGameStateInvariants(f.game);return row.card;}
function payment(player,accept){const old=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>q.type==='chooseOption'&&q.options.some(option=>option.payment)?(accept?q.options.find(option=>option.payment)?.key:'no'):old(g,q);return ()=>{player.controller.decide=old;};}
async function cleanup(game){const saved={runBeginningPhase:game.runBeginningPhase,mainPhase:game.mainPhase,combatPhase:game.combatPhase};game.runBeginningPhase=game.mainPhase=game.combatPhase=async()=>{};try{await game.runTurn();}finally{Object.assign(game,saved);}}

test('v14 accepts whole clauses, freezes complete v13 cards, and rejects unknown tails',()=>{
  for(const card of rows){const prior=semanticClass(card,{compilerVersion:13}),next=semanticClass(card,{compilerVersion:14});assert.ok(next.semanticClass,card.name+': '+next.reason);if(prior.semanticClass)assert.deepEqual(next,prior);assert.equal(semanticClass({...card,oracle_text:card.oracle_text+'\nDo an unsupported thing.'},{compilerVersion:14}).semanticClass,undefined,card.name);}
});
for(const role of ['human','ai']){
  test(role+': Torment repeats separately for each opponent and preserves the caster’s life',async()=>{
    const f=context(M,role,2),{game,a}=f;for(const player of game.players)payment(player,false);const lives=game.players.map(player=>player.life);await cast(f,'Torment of Hailfire',[],{xVal:3});assert.equal(a.life,lives[0]);for(const player of f.others)assert.equal(player.life,lives[player.idx]-9);assertGameStateInvariants(game);
  });
  test(role+': Wild Might always grants its first bonus when an opponent pays for the second',async()=>{
    const f=context(M,role),{game,a,b}=f,victim=put(M,game,a,'Runeclaw Bear');payment(a,false);payment(b,true);fund(b);const before=b.pool.C;await cast(f,'Wild Might',[victim]);assert.equal(victim.power,3);assert.equal(victim.toughness,3);assert.equal(b.pool.C,before-2);assertGameStateInvariants(game);
  });
  test(role+': Torment of Venom puts its counters before a payment and excludes the targeted creature',async()=>{
    const f=context(M,role),{game,a,b}=f,victim=put(M,game,b,'Craw Wurm'),other=put(M,game,b,'Forest');await game.discard(b,b.hand.slice());let offered=false;const old=b.controller.decide.bind(b.controller);b.controller.decide=(g,q)=>{if(q.type==='chooseOption'&&q.options.some(row=>row.payment)){offered=true;return q.options.find(row=>row.payment.kind==='sacrifice')?.key||'no';}if(q.type==='chooseCards'&&q.prompt.endsWith(': choose cards to sacrifice')){assert.ok(!q.from.includes(victim));return [other];}return old(g,q);};const life=b.life;await cast(f,'Torment of Venom',[victim]);assert.equal(victim.counters['-1/-1'],3);assert.equal(victim.zone,'battlefield');assert.equal(b.life,life-3);assert.equal(offered,false);assert.equal(other.zone,'battlefield');assertGameStateInvariants(game);
  });
  test(role+': damage payments can be chosen even when prevention prevents the damage',async()=>{
    const f=context(M,role),{game,a,b}=f,victim=put(M,game,b,'Runeclaw Bear');payment(b,true);await cast(f,'Safe Passage',[],{},b);const life=b.life;await cast(f,'Blazing Salvo',[victim]);assert.equal(victim.zone,'battlefield');assert.equal(b.life,life);assertGameStateInvariants(game);
  });
  test(role+': Mundungu requires both its mana and life payment',async()=>{
    const f=context(M,role),{game,a,b}=f,source=await cast(f,'Mundungu');source.sick=false;const spell=await announce(f,'Healing Salve',[b],{},b);payment(b,true);const life=b.life,mana=Object.values(b.pool).reduce((n,v)=>n+v,0),restore=chooseTargets(a,[spell.so]);try{const action=game.activatableList(a).find(row=>row.card===source&&!row.manaAbility);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);}finally{restore();}assert.equal(b.life,life+2);assert.equal(mana-Object.values(b.pool).reduce((n,v)=>n+v,0),1);assertGameStateInvariants(game);
  });
  test(role+': the topmost creature card pays Barrow Ghoul even when a land is above it',async()=>{
    const f=context(M,role),{game,a}=f,source=await cast(f,'Barrow Ghoul'),older=put(M,game,a,'Runeclaw Bear','graveyard'),newer=put(M,game,a,'Craw Wurm','graveyard'),top=put(M,game,a,'Forest','graveyard');payment(a,true);await game.emit('upkeep',{player:a});await settle(game);assert.equal(source.zone,'battlefield');assert.equal(older.zone,'graveyard');assert.equal(newer.zone,'exile');assert.equal(top.zone,'graveyard');assertGameStateInvariants(game);
  });
  test(role+': Damping Matrix stops nonmana abilities while preserving mana and restoring abilities when it leaves',async()=>{
    const f=context(M,role),{game,a}=f,mage=put(M,game,a,'Prodigal Sorcerer'),elf=put(M,game,a,'Llanowar Elves'),old=game.activatableList(a).find(row=>row.card===mage);assert.ok(old);const matrix=await cast(f,'Damping Matrix');assert.equal(game.activatableList(a).some(row=>row.card===mage),false);assert.equal(await game.activateAbility(a,old),false);const mana=game.manaSources(a).find(row=>row.card===elf);assert.ok(mana);const before=a.pool.G;assert.equal(await game.activateManaSource(a,mana,{G:1}),true);assert.equal(a.pool.G,before+1);await game.move(matrix,'graveyard');assert.ok(game.activatableList(a).some(row=>row.card===mage));assertGameStateInvariants(game);
  });
  test(role+': Revoke Privileges prevents crewing another Vehicle and releases it on departure',async()=>{
    const f=context(M,role),{game,a,b}=f,host=put(M,game,b,'Craw Wurm'),vehicle=put(M,game,b,"Smuggler's Copter");const aura=await cast(f,'Revoke Privileges',[host]);fund(b);assert.equal(host.cur.cantCrewV14,true);assert.equal(game.activatableList(b).some(row=>row.card===vehicle&&row.crew),false);await game.move(aura,'graveyard');assert.ok(game.activatableList(b).some(row=>row.card===vehicle&&row.crew));assertGameStateInvariants(game);
  });
  test(role+': conditional mana is recalculated when the qualifying creature leaves',async()=>{
    const f=context(M,role),{game,a}=f,source=await cast(f,'Ilysian Caryatid');source.sick=false;
    let ability=game.manaSources(a).find(row=>row.card===source);assert.ok(ability);assert.ok(ability.produce.every(option=>Object.values(option).reduce((n,v)=>n+v,0)===1));
    const strong=put(M,game,a,'Craw Wurm');ability=game.manaSources(a).find(row=>row.card===source);assert.ok(ability.produce.every(option=>Object.values(option).reduce((n,v)=>n+v,0)===2));
    const before=a.pool.G;assert.equal(await game.activateManaSource(a,ability,{G:2}),true);assert.equal(a.pool.G,before+2);
    await game.move(strong,'graveyard');game.untap(source);ability=game.manaSources(a).find(row=>row.card===source);assert.ok(ability.produce.every(option=>Object.values(option).reduce((n,v)=>n+v,0)===1));assertGameStateInvariants(game);
  });
  test(role+': Gemstone Mine produces its third mana before sacrificing itself',async()=>{
    const f=context(M,role),{game,a}=f,source=put(M,game,a,'Gemstone Mine','hand');assert.equal(await game.playLand(a,source),true);assert.equal(source.counters.mining,3);
    for(let n=3;n>0;n--){game.untap(source);const ability=game.manaSources(a).find(row=>row.card===source);assert.ok(ability);const before=a.pool.U;assert.equal(await game.activateManaSource(a,ability,{U:1}),true);assert.equal(a.pool.U,before+1);if(n>1){assert.equal(source.counters.mining,n-1);assert.equal(source.zone,'battlefield');}}
    assert.equal(source.zone,'graveyard');assertGameStateInvariants(game);
  });
  test(role+': Sphinx has all five colors in hand, on the Stack, and after zone changes',async()=>{
    const f=context(M,role),{game,a}=f,source=put(M,game,a,'Sphinx of the Guildpact','hand');const colors=()=>assert.deepEqual(Array.from(source.colors).sort(),['B','G','R','U','W']);colors();await announce(f,source);colors();await settle(game);colors();await game.move(source,'graveyard');colors();assertGameStateInvariants(game);
  });
  test(role+': Fear of Falling lasts through the opponent turn and expires at its controller’s next turn',async()=>{
    const f=context(M,role),{game,a,b}=f,source=await cast(f,'Fear of Falling'),victim=put(M,game,b,'Wind Drake');source.attacking=b;
    const restore=chooseTargets(a,[victim]);try{await game.emit('attacks',{card:source,player:a,attacker:source,defender:b});await settle(game);}finally{restore();}
    assert.equal(victim.power,0);assert.equal(victim.kw('flying'),false);await cleanup(game);assert.equal(victim.kw('flying'),false);
    game.turnPlayer=b;await game.runBeginningPhase(b);assert.equal(victim.kw('flying'),false);await game.runBeginningPhase(a);assert.equal(victim.power,2);assert.equal(victim.kw('flying'),true);assertGameStateInvariants(game);
  });
  test(role+': Make a Wish returns two random graveyard cards, or the only available card',async()=>{
    for(const n of [1,4]){const f=context(M,role),{game,a}=f,cards=Array.from({length:n},()=>put(M,game,a,'Forest','graveyard'));let queried=false;const old=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>{if(q.type==='chooseCards'&&q.from.some(card=>cards.includes(card)))queried=true;return old(g,q);};await cast(f,'Make a Wish');assert.equal(cards.filter(card=>card.zone==='hand').length,Math.min(2,n));assert.equal(queried,false);assertGameStateInvariants(game);}
  });
  test(role+': Consuming Ashes reads the exiled creature’s mana value',async()=>{
    for(const [name,expected]of [['Runeclaw Bear',2],['Craw Wurm',0]]){const f=context(M,role),{game,a,b}=f,victim=put(M,game,b,name);let viewed=0;const old=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>{if(q.type==='scry'&&q.surveil)viewed+=q.cards.length;return old(g,q);};await cast(f,'Consuming Ashes',[victim]);assert.equal(victim.zone,'exile');assert.equal(viewed,expected);assertGameStateInvariants(game);}
  });
  test(role+': Not Forgotten lets its caster choose the destination of an opponent’s card',async()=>{
    for(const position of ['top','bottom']){const f=context(M,role),{game,a,b}=f,card=put(M,game,b,'Runeclaw Bear','graveyard');let chooser=null;for(const player of [a,b]){const old=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>{if(q.type==='chooseOption'&&q.options.some(row=>row.key==='top')&&q.options.some(row=>row.key==='bottom')){chooser=player;return position;}return old(g,q);};}const before=game.creatures(a).length;await cast(f,'Not Forgotten',[card]);assert.equal(chooser,a);assert.equal(card.zone,'library');assert.equal(position==='top'?b.library.at(-1):b.library[0],card);assert.equal(game.creatures(a).length,before+1);assertGameStateInvariants(game);}
  });
  test(role+': Skirk Volcanist needs two Mountains and pays them before its face-up trigger',async()=>{
    const f=context(M,role),{game,a}=f,source=put(M,game,a,'Skirk Volcanist','hand');fund(a);const option=game.castableList(a).find(row=>row.card===source&&row.alt?.faceDownCast==='morph');assert.ok(option);assert.equal(await game.castSpell(a,source,{from:'hand',alt:option.alt}),true);await settle(game);
    const one=put(M,game,a,'Mountain');assert.equal(game.activatableList(a).some(row=>row.card===source&&row.turnFaceUp),false);const two=put(M,game,a,'Mountain'),victim=put(M,game,a,'Runeclaw Bear');const restore=chooseTargets(a,[victim]);const action=game.activatableList(a).find(row=>row.card===source&&row.turnFaceUp);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.equal(one.zone,'graveyard');assert.equal(two.zone,'graveyard');assert.equal(source.faceDown,false);await settle(game);restore();assert.equal(victim.zone,'graveyard');assertGameStateInvariants(game);
  });
  test(role+': Perplex can be paid by discarding an empty hand and preserves the targeted spell',async()=>{
    for(const accept of [true,false]){const f=context(M,role),{game,a,b}=f,life=b.life;const original=await announce(f,'Healing Salve',[b],{},b);await game.discard(b,b.hand.slice());payment(b,accept);await cast(f,'Perplex',[original.so]);assert.equal(b.life,life+(accept?3:0));assertGameStateInvariants(game);}
  });
  test(role+': a declined graveyard payment sacrifices Rotting Giant; paying exiles exactly one card',async()=>{
    for(const accept of [true,false]){const f=context(M,role),{game,a,b}=f,source=await cast(f,'Rotting Giant'),card=put(M,game,a,'Forest','graveyard');payment(a,accept);source.attacking=b;await game.emit('attacks',{card:source,player:a,attacker:source,defender:b});await settle(game);assert.equal(source.zone,accept?'battlefield':'graveyard');assert.equal(card.zone,accept?'exile':'graveyard');assertGameStateInvariants(game);}
  });
  test(role+': Magmatic Sprinter removes two oil counters or returns to its owner’s hand',async()=>{
    for(const accept of [true,false]){const f=context(M,role),{game,a}=f,source=await cast(f,'Magmatic Sprinter');game.addCounters(source,'oil',2,false,a);const count=source.counters.oil;payment(a,accept);await game.emit('endStep',{player:a});await settle(game);assert.equal(source.zone,accept?'battlefield':'hand');if(accept)assert.equal(source.counters.oil,count-2);assertGameStateInvariants(game);}
  });
  test(role+': Excise charges the announced X to the targeted creature’s controller',async()=>{
    for(const accept of [true,false]){const f=context(M,role),{game,a,b}=f,victim=put(M,game,b,'Runeclaw Bear');victim.attacking=a;fund(b);payment(b,accept);const before=Object.values(b.pool).reduce((n,v)=>n+v,0);await cast(f,'Excise',[victim],{xVal:4});assert.equal(victim.zone,accept?'battlefield':'exile');assert.equal(before-Object.values(b.pool).reduce((n,v)=>n+v,0),accept?4:0);assertGameStateInvariants(game);}
  });
}
