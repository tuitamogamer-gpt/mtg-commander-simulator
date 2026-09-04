import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const M=loadEngine();
const entries=[
  ['Color','This creature gets -2/-2 as long as green is the most common color among all permanents or is tied for most common.'],
  ['Half','As long as your life total is less than or equal to half your starting life total, this creature has indestructible.'],
  ['Counter','As long as this creature has three or more counters on it, it has flying.'],
  ['Board Counters','As long as there are two or more counters among creatures you control, this creature has vigilance.'],
  ['Level Counters','This creature gets +3/+3 as long as you control a creature with three or more level counters on it.'],
  ['Crime',"This creature gets +2/+0 as long as you've committed a crime this turn."],
  ['Alone',"As long as this creature is attacking alone, it can't be blocked."],
  ['Aura','Enchant creature\nEnchanted creature has intimidate as long as its controller controls no other creatures.','Enchantment — Aura'],
  ['Renown','Renown 1\nAs long as this creature is renowned, it has menace.'],
  ['Artifact Entry','This creature gets +2/+2 as long as an artifact entered the battlefield under your control this turn.'],
  ['Knight Entry','This creature gets +2/+2 as long as another Knight entered the battlefield under your control this turn.'],
  ['Artifact Sacrifice',"This creature gets +2/+0 as long as you've sacrificed an artifact this turn."],
  ['Counter Put',"As long as you've put one or more +1/+1 counters on this creature this turn, it has flying."],
].map(([label,oracle_text,type_line='Creature'],i)=>{
  const card={name:'Live Proof '+label,oracle_text,type_line,mana_cost:'{G}',power:'4',toughness:'20',layout:'normal'},compiled=semanticClass(card,{compilerVersion:8});assert.ok(compiled.semanticClass,label+': '+compiled.reason);
  return {position:i+1,oracleId:'live-proof-'+i,scryfallId:'live-print-'+i,...compiled,raw:{name:card.name,cost:card.mana_cost,oracle:oracle_text,types:type_line.split(' — ')[0].split(' '),subtypes:type_line.split(' — ')[1]?.split(' ')||[],super:[],power:'4',toughness:'20',_ci:['G']},catalog:{typeLine:type_line,commanderLegality:'legal'}};
});
M.registerOracleBatch({id:'oracle-live-condition-fixtures',sequence:9984,cards:entries});M.initData(M.RAW_DATA);
const fixture=(name,extra={})=>({name,cost:'{1}',types:['Creature'],subtypes:['Bear'],super:[],power:'1',toughness:'20',kws:[],oracle:'',...extra});
function setup(role){
  const choice={attackers:[]},human={async decide(g,q){if(q.type==='attackers')return choice.attackers;if(q.type==='blockers')return [];if(q.type==='chooseTargets')return q.candidates.slice(0,q.min??1);if(q.type==='chooseOption')return q.options[0].key;return null;}};
  const game=new M.Game({seed:160,paced:false}),a=game.addPlayer('A',{name:'A'},human,role==='ai'),b=game.addPlayer('B',{name:'B'},human,false);
  if(role==='ai')a.controller=new M.AIController(a,{difficulty:'hard',style:'balanced'});
  game.turnNo=5;game.turnPlayer=a;game.phase='main1';game.step='main';game.priorityRound=async()=>{};game.reviewCombatWithHuman=async()=>{};game.spotlight=async()=>{};game.pace=async()=>{};
  return {game,a,b,choice};
}
function put(ctx,name,player=ctx.a,zone='battlefield'){
  const c=new M.CardInst(typeof name==='string'?M.DEFS[name]:name,player);c.ctrl=player;c.zone=zone;c.sick=false;
  if(zone==='battlefield'){ctx.game.battlefield.push(c);ctx.game.recalc();}else player[zone].push(c);return c;
}
async function settle(game){for(let i=0;i<30&&(game.pendingTriggers.length||game.stack.length);i++){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}assert.equal(game.pendingTriggers.length+game.stack.length,0);}
for(const role of ['human','ai']){
  test(role+': entry history freezes actual types and controller and counts a later blink as a new entry',async()=>{
    const ctx=setup(role),{game,a,b}=ctx,source=put(ctx,'Live Proof Artifact Entry'),other=put(ctx,'Live Proof Artifact Entry',b);
    const artifact=put(ctx,fixture('Actual artifact cast',{types:['Artifact']}),a,'hand');a.pool.C=1;
    assert.equal(await game.castSpell(a,artifact,{from:'hand'}),true);await settle(game);assert.equal(source.power,6);assert.equal(other.power,4);
    game.addOracleAnimation(artifact,{types:['Creature'],subtypes:['Bear'],power:1,toughness:20,keywords:[],colors:null,retainTypes:false,temporary:false});assert.equal(artifact.is('Artifact'),false);assert.equal(source.power,6,'later type change cannot alter the entry snapshot');
    M.OracleV8Control.gain(game,artifact,b);game.recalc();assert.equal(source.power,6);assert.equal(other.power,4,'control change is not entry');
    await game.move(artifact,'exile');await game.move(artifact,'battlefield',{ctrl:b});assert.equal(other.power,6,'blink re-enters as printed artifact under new controller');
    a.turnState=a.freshTurnState();b.turnState=b.freshTurnState();game.turnNo++;game.recalc();assert.equal(source.power,4);assert.equal(other.power,4);
  });
  test(role+': simultaneous entry history sees a co-entering Aura type effect before any ETB trigger',async()=>{
    const ctx=setup(role),{game,a}=ctx,source=put(ctx,'Live Proof Knight Entry'),knight=put(ctx,fixture('Co-entering Knight',{subtypes:['Knight']}),a,'hand'),aura=put(ctx,'Lignify',a,'hand');
    await game.withBattlefieldEntryBatch(async()=>{await game.move(knight,'battlefield');await game.move(aura,'battlefield',{attachTo:knight});});
    assert.equal(knight.hasSub('Knight'),false);assert.equal(source.power,4,'the simultaneous creature entered as a Treefolk');
    const later=put(ctx,fixture('Later Knight',{subtypes:['Knight']}),a,'hand');await game.move(later,'battlefield');assert.equal(source.power,6);
    await game.attach(aura,later);assert.equal(later.hasSub('Knight'),false);assert.equal(source.power,6,'a later Aura cannot rewrite the earlier entry');
  });
  test(role+': sacrifice history uses the sacrificed permanent characteristics rather than its printed artifact type',async()=>{
    const ctx=setup(role),{game,a}=ctx,source=put(ctx,'Live Proof Artifact Sacrifice'),victim=put(ctx,fixture('Former artifact',{types:['Artifact']}));
    game.addOracleAnimation(victim,{types:['Creature'],subtypes:['Bear'],power:1,toughness:20,keywords:[],colors:null,retainTypes:false,temporary:false});assert.equal(victim.is('Artifact'),false);
    await game.sacrifice(a,victim);assert.equal(source.power,4);
    const artifact=put(ctx,fixture('Actual sacrificed artifact',{types:['Artifact']}));await game.sacrifice(a,artifact);assert.equal(source.power,6);
    assert.equal(artifact.zone,'graveyard');a.turnState=a.freshTurnState();game.turnNo++;game.recalc();assert.equal(source.power,4);
  });
  test(role+': counter history identifies the player who put the correct counter on this incarnation',async()=>{
    const ctx=setup(role),{game,a,b}=ctx,source=put(ctx,'Live Proof Counter Put');
    game.addCounters(source,'+1/+1',1,false,b);assert.equal(source.kw('flying'),false,'opponent placed the counter');
    game.addCounters(source,'charge',1,false,a);assert.equal(source.kw('flying'),false,'wrong counter kind');
    game.addCounters(source,'+1/+1',1,false,a);assert.equal(source.kw('flying'),true);
    game.removeCounters(source,'+1/+1',2);assert.equal(source.kw('flying'),true,'removing counters does not erase placement history');
    await game.move(source,'exile');await game.move(source,'battlefield');assert.equal(source.kw('flying'),false,'the new incarnation has no placement event');
  });
  test(role+': most-common color counts all players and every color of multicolored permanents, including ties',async()=>{
    const ctx=setup(role),{game,a,b}=ctx,source=put(ctx,'Live Proof Color');assert.equal(source.power,2);
    const red1=put(ctx,fixture('Red one',{colorsOverride:['R']}),b);assert.equal(source.power,2,'one green and one red tie');
    const red2=put(ctx,fixture('Red two',{colorsOverride:['R']}),b);assert.equal(source.power,4);
    put(ctx,fixture('Multicolor',{colorsOverride:['G','U']}),b);assert.equal(source.power,2,'green ties red regardless of controller');
    for(let i=0;i<3;i++)put(ctx,fixture('Colorless '+i,{types:['Artifact']}),b);assert.equal(source.power,2,'colorless is not a sixth color');
    await game.move(red1,'graveyard');red2.ctrl=a;game.recalc();assert.equal(source.power,2);
  });
  test(role+': half starting life uses exact arithmetic and the current controller',async()=>{
    const ctx=setup(role),{game,a,b}=ctx,source=put(ctx,'Live Proof Half');a.startingLife=41;a.life=21;game.recalc();assert.equal(source.kw('indestructible'),false);
    await game.damageAny(null,a,1);game.recalc();assert.equal(source.kw('indestructible'),true);
    await game.gainLife(a,1);game.recalc();assert.equal(source.kw('indestructible'),false);
    b.startingLife=30;b.life=15;M.OracleV8Control.gain(game,source,b);game.recalc();assert.equal(source.kw('indestructible'),true);
    b.life=16;game.recalc();assert.equal(source.kw('indestructible'),false);
  });
  test(role+': all counter kinds sum only for total predicates; a per-creature threshold never sums across creatures',async()=>{
    const ctx=setup(role),{game,a,b}=ctx,total=put(ctx,'Live Proof Counter'),board=put(ctx,'Live Proof Board Counters'),levels=put(ctx,'Live Proof Level Counters');
    game.addCounters(total,'charge',2);assert.equal(total.kw('flying'),false);assert.equal(board.kw('vigilance'),true);
    game.addCounters(total,'shield',1);assert.equal(total.kw('flying'),true);game.removeCounters(total,'charge',1);assert.equal(total.kw('flying'),false);
    const c1=put(ctx,fixture('Level one')),c2=put(ctx,fixture('Level two'));game.addCounters(c1,'level',2);game.addCounters(c2,'level',1);assert.equal(levels.power,4);
    game.addCounters(c1,'level',1);assert.equal(levels.power,7);M.OracleV8Control.gain(game,c1,b);game.recalc();assert.equal(levels.power,4);
    await game.move(total,'exile');await game.move(total,'battlefield');assert.equal(total.kw('flying'),false);
  });
  test(role+': crime condition changes through a paid targeted spell, and resets with the next turn state',async()=>{
    const ctx=setup(role),{game,a,b}=ctx,source=put(ctx,'Live Proof Crime');assert.equal(source.power,4);
    await game.damageAny(source,b,1);game.recalc();assert.equal(source.power,4,'damage without targeting is not a crime');
    const spell=put(ctx,fixture('Actual opponent target',{types:['Instant'],targets:[{what:'opponent',filter:(g,target,you)=>target instanceof M.Player&&target!==you}],resolve:async c=>c.g.damageAny(c.src,c.targets[0],1)}),a,'hand');
    a.pool.C=1;assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await settle(game);assert.equal(source.power,6);assert.equal(a.pool.C,0);
    a.turnState=a.freshTurnState();game.turnNo++;game.recalc();assert.equal(source.power,4);
    assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);
  });
  test(role+': an Aura tests its host controller rather than its owner, and updates when companions leave',async()=>{
    const ctx=setup(role),{game,a,b}=ctx,aura=put(ctx,'Live Proof Aura'),host=put(ctx,fixture('Opponent host'),b);put(ctx,fixture('Aura-owner creature'));
    await game.attach(aura,host);assert.equal(host.kw('intimidate'),true);
    const friend=put(ctx,fixture('Opponent companion'),b);assert.equal(host.kw('intimidate'),false);
    await game.move(friend,'graveyard');assert.equal(host.kw('intimidate'),true);
    M.OracleV8Control.gain(game,host,a);game.recalc();assert.equal(host.kw('intimidate'),false);
  });
  test(role+': static attacking-alone and renowned conditions follow actual combat and object identity',async()=>{
    const ctx=setup(role),{game,a,b}=ctx,alone=put(ctx,'Live Proof Alone'),renown=put(ctx,'Live Proof Renown');game.priorityRound=async()=>settle(game);
    renown.meta.mustAttackPlayer=b;ctx.choice.attackers=[{card:renown,target:b}];await game.combatPhase(a);assert.equal(renown.meta.renowned,true);assert.equal(renown.kw('menace'),true);
    alone.attacking=b;renown.attacking=null;game.recalc();assert.equal(alone.cur.unblockable,true);
    renown.attacking=b;game.recalc();assert.equal(alone.cur.unblockable,false);
    await game.move(renown,'exile');await game.move(renown,'battlefield');assert.equal(renown.kw('menace'),false);assert.equal(alone.cur.unblockable,true);
  });
}
