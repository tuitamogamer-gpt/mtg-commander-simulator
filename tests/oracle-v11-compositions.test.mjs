import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v11-compositions.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length){const {report}=createImportPlan({cards:absent,bulk:{type:'oracle_cards',updated_at:'2026-08-30T09:01:56.964+00:00'},sequence:9913,limit:absent.length,compilerVersion:11});M.registerOracleBatch(report);}
M.initData(M.RAW_DATA);
const fund=player=>{for(const color of ['W','U','B','R','G','C'])player.pool[color]=30;};
async function cast(f,name,target){
  const {game,a}=f,source=put(M,game,a,name,'hand'),decide=a.controller.decide.bind(a.controller);fund(a);
  a.controller.decide=(g,q)=>q.type==='chooseTargets'&&target&&q.candidates.includes(target)?[target]:decide(g,q);
  try{assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);}finally{a.controller.decide=decide;}
  assertGameStateInvariants(game);return source;
}
async function cleanup(game){
  const saved={runBeginningPhase:game.runBeginningPhase,mainPhase:game.mainPhase,combatPhase:game.combatPhase};
  game.runBeginningPhase=game.mainPhase=game.combatPhase=async()=>{};
  try{await game.runTurn();}finally{Object.assign(game,saved);}
}
function creature(f,player,subtypes,zone='battlefield'){
  const card=new M.CardInst({...M.DEFS['Runeclaw Bear'],name:'Composition fixture '+subtypes.join(' '),subtypes:subtypes.slice()},player);
  card.zone=zone;card.sick=false;if(zone==='battlefield')f.game.battlefield.push(card);else player[zone].push(card);f.game.recalc();return card;
}

test('v11 composition grammar preserves complete earlier results and rejects unparsed instructions',()=>{
  for(const card of rows){
    const old=semanticClass(card,{compilerVersion:10});
    assert.ok(semanticClass(card,{compilerVersion:11}).semanticClass,card.name);
    assert.equal(semanticClass({...card,oracle_text:card.oracle_text+'\nDo an unsupported thing.'},{compilerVersion:11}).semanticClass,undefined,card.name);
    assert.deepEqual(semanticClass(card,{compilerVersion:10}),old);
  }
});

for(const role of ['human','ai']){
  test(role+': base stats, every creature type and flying compose and expire independently',async()=>{
    const f=context(M,role),{game,a}=f,bear=put(M,game,a,'Runeclaw Bear');game.addCounters(bear,'+1/+1',1);
    await cast(f,'Wings of Velis Vel',bear);
    assert.equal(bear.cur.basePower,4);assert.equal(bear.power,5);assert.equal(bear.toughness,5);
    assert.equal(bear.kw('flying'),true);assert.equal(bear.hasSub('Elf'),true);assert.equal(bear.hasSub('Dragon'),true);assert.equal(bear.hasSub('Equipment'),false);
    M.OracleV8AbilityLoss.add(game,[bear],{temporary:true});
    assert.equal(bear.kw('flying'),false);assert.equal(bear.hasSub('Elf'),true,'type-changing effect survives ability removal');
    await cleanup(game);assert.equal(bear.power,3);assert.equal(bear.toughness,3);assert.equal(bear.hasSub('Elf'),false);assert.equal(bear.hasSub('Bear'),true);assert.equal(bear.counters['+1/+1'],1);assertGameStateInvariants(game);
  });
  test(role+': temporary Dragon conversion keeps its pump and combat keywords until cleanup',async()=>{
    const f=context(M,role),{game,a}=f,source=await cast(f,'Dragonsoul Knight');fund(a);source.sick=false;
    const ability=game.activatableList(a).find(row=>row.card===source);assert.ok(ability);assert.equal(await game.activateAbility(a,ability),true);await settle(game);
    assert.equal(source.power,7);assert.equal(source.toughness,5);assert.equal(source.hasSub('Dragon'),true);assert.equal(source.hasSub('Human'),false);assert.equal(source.kw('flying'),true);assert.equal(source.kw('trample'),true);
    await cleanup(game);assert.equal(source.power,2);assert.equal(source.toughness,2);assert.equal(source.hasSub('Human'),true);assert.equal(source.hasSub('Dragon'),false);assert.equal(source.kw('flying'),false);assertGameStateInvariants(game);
  });
  test(role+': each printed entry-counter option is present before entry triggers',async()=>{
    for(const [name,kinds] of [['Flycatcher Giraffid',['reach','vigilance']],['Ferocious Tigorilla',['trample','menace']],['Helica Glider',['flying','first strike']],['Wingfold Pteron',['flying','hexproof']]])for(const selected of kinds){
      const f=context(M,role),{game,a}=f,decide=a.controller.decide.bind(a.controller);let observed=false;
      a.controller.decide=(g,q)=>q.aiHint?.kind==='keywordCounter'?selected:decide(g,q);
      const emit=game.emit;game.emit=async function(name,data){if(name==='etb'&&data.card.name===f.expected){assert.equal(data.card.counters[selected],1);assert.equal(data.card.kw(selected),true);observed=true;}return emit.call(this,name,data);};f.expected=name;
      const source=await cast(f,name);assert.equal(observed,true);assert.equal(source.counters[kinds.find(kind=>kind!==selected)]||0,0);assertGameStateInvariants(game);
    }
  });
  test(role+': decayed token cannot block and is sacrificed after its declared attack',async()=>{
    const f=context(M,role),{game,a,b}=f;await cast(f,'Falcon Abomination');
    const zombie=game.bf().find(card=>card.isToken&&card.hasSub('Zombie'));assert.ok(zombie);assert.equal(zombie.kw('decayed'),true);
    const enemy=put(M,game,b,'Runeclaw Bear');enemy.attacking=a;assert.equal(game.canBlock(zombie,enemy),false);enemy.attacking=null;
    await game.move(enemy,'hand');zombie.sick=false;const decide=a.controller.decide.bind(a.controller),life=b.life;
    a.controller.decide=(g,q)=>q.type==='attackers'?[{card:zombie,target:b}]:decide(g,q);game.priorityRound=async()=>settle(game);
    await game.combatPhase(a);await settle(game);assert.equal(b.life,life-2);assert.equal(zombie.zone,'ceased');assert.equal(game.bf().includes(zombie),false);assertGameStateInvariants(game);
  });
  test(role+': created Changeling is copiable, has only creature subtypes, and loses its CDA with its abilities',async()=>{
    const f=context(M,role),{game,a}=f;await cast(f,'Stalactite Dagger');const token=game.bf().find(card=>card.isToken);assert.ok(token);
    assert.equal(token.hasSub('Elf'),true);assert.equal(token.hasSub('Zombie'),true);assert.equal(token.hasSub('Equipment'),false);
    const copy=(await game.copyPermanentToken(token,a))[0];assert.ok(copy);assert.equal(copy.hasSub('Goblin'),true);
    M.OracleV8AbilityLoss.add(game,[token],{temporary:true});assert.equal(token.hasSub('Elf'),false);assert.equal(copy.hasSub('Elf'),true);
    await cleanup(game);assert.equal(token.hasSub('Elf'),true);assertGameStateInvariants(game);
  });
  test(role+': graveyard return tests the returned card type, including its negative branch',async()=>{
    for(const [name,kind] of [['Cemetery Recruitment','Zombie'],['Warren Pilferers','Goblin']])for(const matches of [false,true]){
      const f=context(M,role),{game,a}=f,target=creature(f,a,[matches?kind:'Bear'],'graveyard'),drawn=[];const draw=game.draw;
      game.draw=async function(player,n,src){drawn.push({player,n,src});return draw.call(this,player,n,src);};
      const source=await cast(f,name,target);assert.equal(target.zone,'hand');
      if(name==='Cemetery Recruitment')assert.equal(drawn.filter(row=>row.player===a&&row.src===source).reduce((n,row)=>n+row.n,0),matches?1:0);
      else assert.equal(source.kw('haste'),matches);assertGameStateInvariants(game);
    }
  });
  test(role+': qualified group affects only other Rabbit creatures or creature tokens you control',async()=>{
    const f=context(M,role),{game,a,b}=f,source=await cast(f,'Finneas, Ace Archer'),rabbit=creature(f,a,['Rabbit']),bear=creature(f,a,['Bear']),opposing=creature(f,b,['Rabbit']);
    const token=(await game.makeTokens('saproling',a))[0],treasure=(await game.makeTokens('treasure',a))[0];source.sick=false;
    source.attacking=b;game.combat={attackers:[source],defenders:new Map()};await game.emit('attacks',{card:source,player:a,defender:b});await settle(game);
    for(const card of [rabbit,token])assert.equal(card.counters['+1/+1'],1);
    for(const card of [source,bear,opposing,treasure])assert.equal(card.counters['+1/+1']||0,0);assertGameStateInvariants(game);
  });
  test(role+': coordinated damage uses one simultaneous batch across all opponents',async()=>{
    const f=context(M,role,2),{game,a,others}=f,own=put(M,game,a,'Runeclaw Bear'),enemies=others.map(player=>put(M,game,player,'Runeclaw Bear')),before=others.map(player=>player.life),batches=[],damage=game.damageBatch;
    game.damageBatch=async function(hits,options){batches.push(hits.slice());return damage.call(this,hits,options);};const source=await cast(f,'Dagger Caster');
    const batch=batches.find(hits=>hits.every(hit=>hit.src.iid===source.iid)&&hits.length===4);assert.ok(batch);assert.equal(own.damage,0);
    others.forEach((player,index)=>assert.equal(player.life,before[index]-1));enemies.forEach(card=>assert.equal(card.damage,1));assertGameStateInvariants(game);
  });
  test(role+': targeted hand-to-top choice is made by that player and tolerates an empty hand',async()=>{
    for(const empty of [false,true]){
      const f=context(M,role),{game,b}=f,target=empty?null:put(M,game,b,'Runeclaw Bear','hand'),before=b.library.length,decide=b.controller.decide.bind(b.controller);let choices=0;
      b.controller.decide=(g,q)=>{if(q.type==='chooseCards'&&q.prompt==='Choose cards from your hand'){choices++;assert.ok(q.from.includes(target));return [target];}return decide(g,q);};
      await cast(f,'Prying Questions',b);assert.equal(b.life,37);assert.equal(b.library.length,before+(empty?0:1));assert.equal(choices,empty?0:1);if(target)assert.equal(b.library.at(-1),target);assertGameStateInvariants(game);
    }
  });
  test(role+': Auriok Windwalker moves owned Equipment through a paid targeted activation',async()=>{
    const f=context(M,role),{game,a,b}=f,source=await cast(f,'Auriok Windwalker'),equipment=put(M,game,a,'Bonesplitter'),enemyEquipment=put(M,game,b,'Bonesplitter'),old=put(M,game,a,'Runeclaw Bear'),host=put(M,game,a,'Runeclaw Bear');
    await game.attach(equipment,old);source.sick=false;const decide=a.controller.decide.bind(a.controller);
    a.controller.decide=(g,q)=>{if(q.type==='chooseTargets'){if(q.candidates.includes(equipment)){assert.equal(q.candidates.includes(enemyEquipment),false);return [equipment];}if(q.candidates.includes(host))return [host];}return decide(g,q);};
    const ability=game.activatableList(a).find(row=>row.card===source);assert.ok(ability);assert.equal(await game.activateAbility(a,ability),true);assert.equal(source.tapped,true);await settle(game);
    assert.equal(equipment.attachedTo,host.iid);assert.equal(old.attachments.includes(equipment.iid),false);assert.equal(host.attachments.includes(equipment.iid),true);assertGameStateInvariants(game);
  });
}
