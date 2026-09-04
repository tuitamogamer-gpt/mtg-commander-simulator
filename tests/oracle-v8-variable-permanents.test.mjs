import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const M=loadEngine();
const rows=[
  ['Target Colors','Target creature gets +2/+2 until end of turn for each of its colors.','Instant'],
  ['Destroy Colors','Destroy target creature or planeswalker. You gain 1 life for each of its colors.','Instant'],
  ['Renown Trigger','Renown 1\nWhenever an opponent casts a noncreature spell, if this creature is renowned, this creature deals 2 damage to that player.'],
  ['Shared','Each creature gets +1/+1 for each other creature on the battlefield that shares at least one creature type with it.','Artifact'],
  ['Own Shared','Equipped creature gets +1/+1 for each other creature you control that shares a creature type with it.\nEquip {2}','Artifact — Equipment'],
  ['Host Grave',"Enchant creature\nEnchanted creature gets -X/-X, where X is the number of creature cards in its controller's graveyard.",'Enchantment — Aura'],
  ['Other Counters','Enchant creature\nEnchanted creature gets +1/+1 for each +1/+1 counter on other creatures you control.','Enchantment — Aura'],
  ['Symbols','Each creature you control gets +1/+1 for each white mana symbol in its mana cost.','Enchantment'],
  ['Colors','Each other multicolored creature you control gets +1/+1 for each of its colors.'],
  ['Total Counters','This creature gets +1/+1 for each counter on this creature.'],
  ['Counter Sacrifice','{T}, Sacrifice this creature: You gain life equal to the number of counters on this creature.'],
  ['Attachments','This creature gets +2/+2 for each Aura and Equipment attached to it.'],
  ['Cycling','This creature gets +1/+0 for each card with cycling in your graveyard.'],
  ['Commander','Creatures you control get +1/+1 for each time you\'ve cast your commander from the command zone this game.','Enchantment'],
  ['Entries','Creatures you control get +X/+X, where X is the number of creatures that entered the battlefield under your control this turn.','Enchantment'],
  ['Shadow','This creature gets -X/-X, where X is your life total.','Creature','13','13'],
  ['Ride','This Vehicle gets -X/-X, where X is your life total.\nCrew 2','Artifact — Vehicle','13','13'],
].map(([label,oracle_text,type_line='Creature — Elf',power='1',toughness='20'],i)=>{
  const card={name:'Variable Proof '+label,oracle_text,type_line,mana_cost:'{1}',power,toughness,layout:'normal'},compiled=semanticClass(card,{compilerVersion:8});
  assert.ok(compiled.semanticClass,label+': '+compiled.reason);
  return {position:i+1,oracleId:'variable-proof-'+i,scryfallId:'variable-print-'+i,...compiled,raw:{name:card.name,cost:card.mana_cost,oracle:oracle_text,types:type_line.split(' — ')[0].split(' '),subtypes:type_line.split(' — ')[1]?.split(' ')||[],super:[],power,toughness,_ci:[]},catalog:{typeLine:type_line,commanderLegality:'legal'}};
});
M.registerOracleBatch({id:'oracle-variable-fixtures',sequence:9983,cards:rows});M.initData(M.RAW_DATA);
const fixture=(name,extra={})=>({name,cost:'{1}',types:['Creature'],subtypes:['Elf','Warrior'],super:[],power:'2',toughness:'20',kws:[],oracle:'',...extra});
function setup(role){
  const human={async decide(g,q){if(q.type==='attackers')return g.creatures(g.turnPlayer).map(card=>({card,target:g.players.find(p=>p!==g.turnPlayer)}));if(q.type==='blockers')return [];if(q.type==='chooseCards')return q.from.slice(0,q.min??1);if(q.type==='chooseTargets')return q.candidates.slice(0,q.min??1);if(q.type==='chooseOption')return q.options[0].key;return null;}};
  const game=new M.Game({seed:161,paced:false}),a=game.addPlayer('A',{name:'A'},human,role==='ai'),b=game.addPlayer('B',{name:'B'},human,false);
  if(role==='ai')a.controller=new M.AIController(a,{difficulty:'hard',style:'balanced'});
  game.turnNo=5;game.turnPlayer=a;game.phase='main1';game.step='main';game.priorityRound=async()=>{};game.reviewCombatWithHuman=async()=>{};game.spotlight=async()=>{};game.pace=async()=>{};
  return {game,a,b};
}
function put(ctx,name,player=ctx.a,zone='battlefield'){
  const c=new M.CardInst(typeof name==='string'?M.DEFS[name]:name,player);c.ctrl=player;c.zone=zone;c.sick=false;
  if(zone==='battlefield'){ctx.game.battlefield.push(c);ctx.game.recalc();}else player[zone].push(c);return c;
}
async function settle(game){for(let i=0;i<30&&(game.pendingTriggers.length||game.stack.length);i++){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}assert.equal(game.pendingTriggers.length+game.stack.length,0);}
async function activate(ctx,card,crew=false){const action=ctx.game.activatableList(ctx.a).find(x=>x.card===card&&(!crew||x.crew));assert.ok(action);assert.equal(await ctx.game.activateAbility(ctx.a,action),true);await settle(ctx.game);}
for(const role of ['human','ai']){
  test(role+': target-relative colors bind the chosen creature at resolution and are locked for the pump duration',async()=>{
    const ctx=setup(role),{game,a}=ctx,host=put(ctx,fixture('Multicolored target',{colorsOverride:['G','U']})),spell=put(ctx,'Variable Proof Target Colors',a,'hand');a.pool.C=1;
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);game.addOracleCharacteristics([host],{characteristic:'color',colors:['W','U','B'],retain:false});await settle(game);assert.equal(host.power,8);
    game.addOracleCharacteristics([host],{characteristic:'color',colors:['R'],retain:false});assert.equal(host.power,8,'later color change cannot recompute an already resolved pump');
  });
  test(role+': destroy-and-gain colors reads the destroyed incarnation including changed colors and all-targets-illegal fizzle',async()=>{
    const ctx=setup(role),{game,a}=ctx,host=put(ctx,fixture('Colored victim',{colorsOverride:['G','U']})),spell=put(ctx,'Variable Proof Destroy Colors',a,'hand');a.pool.C=1;const life=a.life;
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);game.addOracleCharacteristics([host],{characteristic:'color',colors:['W','U','B'],retain:false});await settle(game);assert.equal(host.zone,'graveyard');assert.equal(host.colors.length,2);assert.equal(a.life,life+3);
    const victim=put(ctx,fixture('Blink victim',{colorsOverride:['R','W']})),next=put(ctx,'Variable Proof Destroy Colors',a,'hand');a.pool.C=1;assert.equal(await game.castSpell(a,next,{from:'hand'}),true);await game.move(victim,'exile');await game.move(victim,'battlefield');await settle(game);assert.equal(a.life,life+3);assert.equal(victim.zone,'battlefield');
  });
  test(role+': renowned intervening-if checks when the opponent casts and again when the trigger resolves',async()=>{
    const ctx=setup(role),{game,a,b}=ctx,source=put(ctx,'Variable Proof Renown Trigger');
    const cast=async()=>{const spell=put(ctx,fixture('Opponent spell',{types:['Instant'],subtypes:[]}),b,'hand');game.turnPlayer=b;b.pool.C=1;assert.equal(await game.castSpell(b,spell,{from:'hand'}),true);game.turnPlayer=a;};
    await cast();assert.equal(game.stack.filter(x=>x.kind==='trigger').length,0);await settle(game);
    source.meta.mustAttackPlayer=b;game.priorityRound=async()=>settle(game);await game.combatPhase(a);assert.equal(source.meta.renowned,true);game.priorityRound=async()=>{};game.phase='main1';game.step='main';
    const life=b.life;await cast();assert.equal(game.stack.filter(x=>x.kind==='trigger').length,1);await settle(game);assert.equal(b.life,life-2);
    await cast();assert.equal(game.stack.filter(x=>x.kind==='trigger').length,1);await game.move(source,'exile');await game.move(source,'battlefield');await settle(game);assert.equal(b.life,life-4,'trigger refers to the renowned departing incarnation');assert.equal(!!source.meta.renowned,false);await cast();assert.equal(game.stack.filter(x=>x.kind==='trigger').length,0);await settle(game);assert.equal(b.life,life-4,'new incarnation is not renowned');
  });
  test(role+': shared creature types count each creature once, all controllers, and changeling without treating other subtype families as creature types',async()=>{
    const ctx=setup(role),{game,b}=ctx;put(ctx,'Variable Proof Shared');const host=put(ctx,fixture('Host')),same=put(ctx,fixture('Double shared'),b),shape=put(ctx,fixture('Changeling',{subtypes:['Shapeshifter'],changeling:true})),empty=put(ctx,fixture('No types',{subtypes:[]}));
    put(ctx,fixture('Tribal permanent',{types:['Artifact'],subtypes:['Elf']}),b);assert.equal(host.power,4);assert.equal(same.power,4);assert.equal(empty.power,2);
    game.addOracleCharacteristics([same],{characteristic:'creature-type',creatureType:'Bird',retain:false});assert.equal(host.power,3);assert.equal(shape.power,4);
    const aura=put(ctx,'Lignify');await game.attach(aura,shape);assert.equal(host.power,2,'loss of changeling removes the shared-type bonus');
    await game.move(aura,'graveyard');assert.equal(host.power,3);await game.move(shape,'exile');assert.equal(host.power,2);
    game.addOracleAnimation(empty,{types:['Creature'],subtypes:[],power:2,toughness:20,keywords:[],colors:null,retainTypes:true,allCreatureTypes:true,temporary:true});assert.equal(host.power,3,'granted all creature types also shares a type');assert.equal(game.snapshot(empty).changeling,true);

  });
  test(role+': Equipment uses its host for shared types and its controller for the creatures you control',async()=>{
    const ctx=setup(role),{game,a,b}=ctx,equipment=put(ctx,'Variable Proof Own Shared'),host=put(ctx,fixture('Opponent host'),b),witness=put(ctx,fixture('Owner witness'));
    put(ctx,fixture('Opponent witness'),b);await game.attach(equipment,host);assert.equal(host.power,3);
    M.OracleV8Control.gain(game,witness,b);game.recalc();assert.equal(host.power,2);
    M.OracleV8Control.gain(game,equipment,b);game.recalc();assert.equal(host.power,4,'host is excluded, two other creatures qualify');
    assert.equal(host.ctrl===b,true);assert.equal(a.graveyard.length,0);
  });
  test(role+': Aura graveyard count follows the host controller, while other-creature counters exclude that host',async()=>{
    const ctx=setup(role),{game,a,b}=ctx,host=put(ctx,fixture('Foreign host'),b),aura=put(ctx,'Variable Proof Host Grave');
    put(ctx,fixture('A grave'),a,'graveyard');for(let i=0;i<3;i++)put(ctx,fixture('B grave '+i),b,'graveyard');put(ctx,fixture('B noncreature',{types:['Instant']}),b,'graveyard');
    await game.attach(aura,host);assert.equal(host.power,-1);M.OracleV8Control.gain(game,host,a);game.recalc();assert.equal(host.power,1);
    await game.move(aura,'graveyard');const counterAura=put(ctx,'Variable Proof Other Counters'),other=put(ctx,fixture('Other counter host'));game.addCounters(host,'+1/+1',4);game.addCounters(other,'+1/+1',3);await game.attach(counterAura,host);
    assert.equal(host.power,9,'base 2 plus four own counters plus three on the other creature');game.removeCounters(other,'+1/+1',2);assert.equal(host.power,7);
  });
  test(role+': mana symbols count each hybrid symbol once, and colors count every color on the affected creature',async()=>{
    const ctx=setup(role),{game,b}=ctx;put(ctx,'Variable Proof Symbols');const host=put(ctx,fixture('White hybrid',{cost:'{W}{W/U}{W/P}{2/W}{U}',colorsOverride:['W','U','G']}));assert.equal(host.power,6);
    const source=put(ctx,'Variable Proof Colors');assert.equal(host.power,9);assert.equal(source.power,1);
    const foreign=put(ctx,fixture('Foreign colors',{cost:'{W}',colorsOverride:['W','G']}),b);assert.equal(foreign.power,2);
    game.addOracleCharacteristics([host],{characteristic:'color',colors:['B'],retain:false});assert.equal(host.power,6,'mono-color removes only the color multiplier, never printed white symbols');
  });
  test(role+': mixed counters sum once and sacrificed-source amounts use the departing incarnation',async()=>{
    const ctx=setup(role),{game,a}=ctx,host=put(ctx,'Variable Proof Total Counters');game.addCounters(host,'charge',2);game.addCounters(host,'shield',1);assert.equal(host.power,4);
    const source=put(ctx,'Variable Proof Counter Sacrifice');game.addCounters(source,'charge',2);game.addCounters(source,'shield',3);const life=a.life;
    const action=game.activatableList(a).find(x=>x.card===source);assert.equal(await game.activateAbility(a,action),true);assert.equal(source.zone,'graveyard');
    await game.move(source,'battlefield');game.addCounters(source,'charge',8);await settle(game);assert.equal(a.life,life+5,'new incarnation counters cannot replace the sacrifice LKI');
  });
  test(role+': Aura and Equipment union counts attached permanents once and updates on detach',async()=>{
    const ctx=setup(role),{game}=ctx,host=put(ctx,'Variable Proof Attachments');const equipment=put(ctx,fixture('Dual attachment',{types:['Artifact','Enchantment'],subtypes:['Equipment','Aura']})),second=put(ctx,fixture('Second Equipment',{types:['Artifact'],subtypes:['Equipment']}));
    await game.attach(equipment,host);await game.attach(second,host);assert.equal(host.power,5);await game.move(equipment,'graveyard');assert.equal(host.power,3);await game.move(second,'graveyard');assert.equal(host.power,1);
  });
  test(role+': cards with cycling leave and enter the graveyard through real zone movement',async()=>{
    const ctx=setup(role),{game,a,b}=ctx,host=put(ctx,'Variable Proof Cycling'),def=Object.values(M.DEFS).find(d=>d.cycling),card=put(ctx,def,a,'hand');put(ctx,def,b,'graveyard');assert.equal(host.power,1);
    await game.discard(a,[card]);assert.equal(host.power,2);await game.move(card,'hand');assert.equal(host.power,1);
  });
  test(role+': commander bonuses count paid command-zone casts, retain across moves, and exclude casts from hand',async()=>{
    const ctx=setup(role),{game,a}=ctx;put(ctx,'Variable Proof Commander');const host=put(ctx,fixture('Commander witness')),cmd=put(ctx,fixture('Actual commander',{super:['Legendary']}),a,'command');cmd.commander=true;a.commanders.push(cmd);const seen=[],collect=game.collectTriggers.bind(game);game.collectTriggers=(name,data)=>{if(name==='cast')seen.push(host.power);return collect(name,data);};
    a.pool.C=1;assert.equal(await game.castSpell(a,cmd,{from:'command'}),true);await settle(game);assert.equal(host.power,3);assert.equal(a.pool.C,0);
    await game.move(cmd,'command');a.pool.C=3;assert.equal(await game.castSpell(a,cmd,{from:'command'}),true);await settle(game);assert.equal(host.power,4);assert.equal(a.pool.C,0,'second cast paid commander tax');
    await game.move(cmd,'hand',{noCmdReplace:true});assert.equal(cmd.zone,'hand');a.pool.C=1;assert.equal(await game.castSpell(a,cmd,{from:'hand'}),true);await settle(game);assert.equal(host.power,4);assert.equal(a.commanderCasts,2);assert.deepEqual(seen,[3,4,4],'cast predicates see the updated continuous bonus');
  });
  test(role+': creature entry multiplier records the entire actual token batch before its ETB events, and resets next turn',async()=>{
    const ctx=setup(role),{game,a}=ctx;put(ctx,'Variable Proof Entries');const host=put(ctx,fixture('Entry witness')),seen=[],original=game.collectTriggers.bind(game);
    game.collectTriggers=function(name,data){if(name==='etb')seen.push(host.power);return original(name,data);};
    await game.makeTokens(['saproling','treasure','saproling'],a);assert.equal(host.power,4);assert.deepEqual(seen,[4,4,4]);
    for(const token of game.creatures(a).filter(c=>c.token))await game.move(token,'graveyard');assert.equal(host.power,4,'departures preserve the turn history');
    a.turnState=a.freshTurnState();game.turnNo++;game.recalc();assert.equal(host.power,2);
  });
  test(role+': life-total penalties update with control and cause zero-toughness death after a real crew resolution',async()=>{
    const ctx=setup(role),{game,a,b}=ctx;a.life=8;b.life=4;const shadow=put(ctx,'Variable Proof Shadow');assert.equal(shadow.power,5);
    M.OracleV8Control.gain(game,shadow,b);game.recalc();assert.equal(shadow.power,9);await game.gainLife(b,9);await game.checkSBA();assert.equal(shadow.zone,'graveyard');
    const ride=put(ctx,'Variable Proof Ride'),helper=put(ctx,fixture('Crew helper'));await activate(ctx,ride,true);assert.equal(helper.tapped,true);assert.equal(ride.is('Creature'),true);assert.equal(ride.power,5);
    await game.gainLife(a,5);await game.checkSBA();assert.equal(ride.zone,'graveyard');
    const late=put(ctx,'Variable Proof Ride');helper.tapped=false;await game.checkSBA();assert.equal(late.zone,'battlefield','uncrewed Vehicle is not a creature');await activate(ctx,late,true);assert.equal(late.zone,'graveyard','crew at thirteen life creates zero toughness');
    assert.equal((game.aiDecisionLog||[]).some(x=>x.fallback),false);
  });
}

test('relative counts without a bound source or target stay unsupported',()=>{
  for(const oracle_text of ['You gain 1 life for each of its colors.','Draw a card for each of its colors.'])assert.equal(semanticClass({name:'Unbound count',type_line:'Instant',mana_cost:'{1}',layout:'normal',oracle_text},{compilerVersion:8}).semanticClass,undefined);
});
