import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v13-compositions.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9927,limit:absent.length,compilerVersion:13});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);}
M.initData(M.RAW_DATA);
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=50;};
function chooseTargets(player,targets){const decide=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>q.type==='chooseTargets'&&targets.some(target=>q.candidates.includes(target))?targets.filter(target=>q.candidates.includes(target)):decide(g,q);return ()=>{player.controller.decide=decide;};}
async function announce(f,name,targets=[],options={},player=f.a){
  const source=typeof name==='string'?put(M,f.game,player,name,'hand'):name;fund(player);const restore=chooseTargets(player,targets);
  try{assert.equal(await f.game.castSpell(player,source,{from:'hand',...options}),true,source.name+': paid cast');return {card:source,so:f.game.stack.find(object=>object.card===source)};}finally{restore();}
}
async function cast(f,name,targets=[],options={},player=f.a){const row=await announce(f,name,targets,options,player);await settle(f.game);assertGameStateInvariants(f.game);return row.card;}
function witness(f,player,cost,types=['Instant'],extras={}){const card=new M.CardInst({name:'V13 printed witness',cost,types,super:[],subtypes:[],kws:[],power:'2',toughness:'3',resolve:async()=>{},...extras},player);card.zone='hand';player.hand.push(card);return card;}
test('v13 accepts whole clauses and preserves all complete v12 definitions',()=>{
  for(const card of rows){const prior=semanticClass(card,{compilerVersion:12}),next=semanticClass(card,{compilerVersion:13});assert.ok(next.semanticClass,card.name+': '+next.reason);if(prior.semanticClass)assert.deepEqual(next,prior);
    assert.equal(semanticClass({...card,oracle_text:card.oracle_text+'\nDo an unsupported thing.'},{compilerVersion:13}).semanticClass,undefined,card.name);
  }
});
for(const role of ['human','ai']){
  test(role+': Glasskite counters only the first targeting spell each turn, including its controller’s spell',async()=>{
    const f=context(M,role),{game,a}=f,host=await cast(f,'Jetting Glasskite');
    await cast(f,'Giant Growth',[host]);assert.equal(host.power,4);
    await cast(f,'Giant Growth',[host]);assert.equal(host.power,7);
    game.turnNo++;await cast(f,'Giant Growth',[host]);assert.equal(host.power,7);assertGameStateInvariants(game);
  });
  test(role+': the first targeted activated ability is countered and the next resolves',async()=>{
    const f=context(M,role),{game,a,b}=f,host=await cast(f,'Shimmering Glasskite'),mage=put(M,game,b,'Prodigal Sorcerer');fund(b);
    const restore=chooseTargets(b,[host]);
    try{for(let n=0;n<2;n++){game.untap(mage);const action=game.activatableList(b).find(row=>row.card===mage);assert.ok(action);assert.equal(await game.activateAbility(b,action),true);await settle(game);assert.equal(host.damage,n);}}finally{restore();}
    assertGameStateInvariants(game);
  });
  test(role+': Kira tracks the first targeting event separately for each creature',async()=>{
    const f=context(M,role),{game,a}=f;await cast(f,'Kira, Great Glass-Spinner');const one=put(M,game,a,'Runeclaw Bear'),two=put(M,game,a,'Runeclaw Bear');
    await cast(f,'Giant Growth',[one]);await cast(f,'Giant Growth',[two]);assert.equal(one.power,2);assert.equal(two.power,2);
    await cast(f,'Giant Growth',[one]);assert.equal(one.power,5);assert.equal(two.power,2);assertGameStateInvariants(game);
  });
  test(role+': plot triggers on the real paid special action and retains next-turn casting restrictions',async()=>{
    for(const name of ['Aloe Alchemist','Longhorn Sharpshooter']){
      const f=context(M,role),{game,a,b}=f,host=put(M,game,a,'Runeclaw Bear'),source=put(M,game,a,name,'hand');fund(a);
      const restore=chooseTargets(a,name==='Aloe Alchemist'?[host]:[b]);const life=b.life;
      try{const action=game.activatableList(a).find(row=>row.card===source&&row.plot);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.equal(source.zone,'exile');await settle(game);}finally{restore();}
      if(name==='Aloe Alchemist'){assert.equal(host.power,5);assert.equal(host.toughness,4);assert.equal(host.kw('trample'),true);}else assert.equal(b.life,life-2);
      assert.equal(game.castableList(a).some(row=>row.card===source),false);game.turnNo++;assert.ok(game.castableList(a).some(row=>row.card===source&&row.alt.plotPlay));assertGameStateInvariants(game);
    }
  });
  test(role+': graveyard-from-anywhere triggers work after discard and mill and reject a new incarnation',async()=>{
    const f=context(M,role),{game,a}=f,vigor=put(M,game,a,'Vigor','hand');await game.discard(a,[vigor]);await settle(game);assert.equal(vigor.zone,'library');
    const dread=put(M,game,a,'Dread','library');await game.mill(a,1);assert.equal(dread.zone,'graveyard');await game.flushTriggers();
    await game.move(dread,'exile');await game.move(dread,'graveyard');await game.flushTriggers();assert.equal(game.stack.length,2);
    await game.resolveTop();assert.equal(dread.zone,'library');await settle(game);assert.equal(dread.zone,'library');assertGameStateInvariants(game);
  });
  test(role+': an Eldrazi shuffled from the graveyard returns the whole owner’s graveyard',async()=>{
    const f=context(M,role),{game,a}=f,other=put(M,game,a,'Forest','graveyard'),source=put(M,game,a,'Kozilek, Butcher of Truth','hand');
    await game.discard(a,[source]);await settle(game);assert.equal(source.zone,'library');assert.equal(other.zone,'library');assert.equal(a.graveyard.length,0);assertGameStateInvariants(game);
  });
  test(role+': counter observers trigger for a successful counter, including copied spells, but not failed counters',async()=>{
    const f=context(M,role),{game,a,b}=f;await cast(f,'Lullmage Mentor');
    const original=await announce(f,witness(f,b,'{2}'),[],{},b),copy=await game.copySpell(original.so,b,{mayNewTargets:false});
    const before=game.creatures(a).length;await cast(f,'Counterspell',[copy]);assert.equal(game.creatures(a).length,before+1);
    const unstoppable=await announce(f,witness(f,b,'{1}',['Instant'],{uncounterable:true}),[],{},b);await cast(f,'Counterspell',[unstoppable.so]);assert.equal(game.creatures(a).length,before+1);assertGameStateInvariants(game);
  });
  test(role+': Multani’s Presence distinguishes a cast spell from its uncast stack copy',async()=>{
    const f=context(M,role),{game,a,b}=f;await cast(f,"Multani's Presence");
    const original=await announce(f,witness(f,a,'{2}')),copy=await game.copySpell(original.so,a,{mayNewTargets:false}),hand=a.hand.length;
    await cast(f,'Counterspell',[copy],{},b);assert.equal(a.hand.length,hand);
    const next=await announce(f,witness(f,a,'{2}')),nextHand=a.hand.length;await cast(f,'Counterspell',[next.so],{},b);assert.equal(a.hand.length,nextHand+1);assertGameStateInvariants(game);
  });
  test(role+': Chalice uses the spell’s mana value with X rather than mana actually spent',async()=>{
    const f=context(M,role),{game,a,b}=f,chalice=await cast(f,'Chalice of the Void',[],{xVal:3});assert.equal(chalice.counters.charge,3);
    const spell=witness(f,b,'{X}{U}',['Instant'],{resolve:async ctx=>ctx.g.gainLife(ctx.you,4)}),life=b.life;
    await cast(f,spell,[],{xVal:2},b);assert.equal(b.life,life);
    await cast(f,witness(f,b,'{2}',['Instant'],{resolve:async ctx=>ctx.g.gainLife(ctx.you,4)}),[],{},b);assert.equal(b.life,life+4);assertGameStateInvariants(game);
  });
  test(role+': Brain in a Jar checks the counter count after adding its next counter',async()=>{
    const f=context(M,role),{game,a}=f,jar=await cast(f,'Brain in a Jar');
    const good=put(M,game,a,'Healing Salve','hand'),bad=put(M,game,a,'Cancel','hand'),choose=a.controller.decide.bind(a.controller);
    a.controller.decide=(g,q)=>q.type==='chooseCards'&&q.from.includes(good)?[good]:choose(g,q);const mana=Object.values(a.pool).reduce((n,v)=>n+v,0);
    try{const action=game.activatableList(a).find(row=>row.card===jar&&row.ability?.oracleOperation?.effects?.some(effect=>effect.action==='cast-from-hand-v8'));assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);}finally{a.controller.decide=choose;}
    assert.equal(jar.counters.charge,1);assert.equal(good.zone,'graveyard');assert.equal(bad.zone,'hand');assert.equal(mana-Object.values(a.pool).reduce((n,v)=>n+v,0),1);assertGameStateInvariants(game);
  });
  test(role+': Jackal copies the matching creature spell, then changes its own threshold for later spells',async()=>{
    const f=context(M,role),{game,a}=f,jackal=await cast(f,'Jackal, Genius Geneticist'),power=jackal.power;
    const make=()=>witness(f,a,'{'+power+'}',['Creature'],{name:'Legendary test creature',super:['Legendary']});
    await cast(f,make());assert.equal(jackal.counters['+1/+1'],1);assert.equal(game.creatures(a).filter(card=>card.name==='Legendary test creature').length,2);
    const other=make();other.def={...other.def,name:'Second test creature',super:[]};await cast(f,other);assert.equal(jackal.counters['+1/+1'],1);assertGameStateInvariants(game);
  });
  test(role+': Pain Magnification requires three damage from one source in one damage event',async()=>{
    const f=context(M,role),{game,a,b}=f;await cast(f,'Pain Magnification');const source=put(M,game,a,'Runeclaw Bear');for(let n=0;n<4;n++)put(M,game,b,'Forest','hand');
    const hand=b.hand.length;await game.damagePlayer(source,b,2);await settle(game);await game.damagePlayer(source,b,1);await settle(game);assert.equal(b.hand.length,hand);
    await game.damagePlayer(source,b,3);await settle(game);assert.equal(b.hand.length,hand-1);assertGameStateInvariants(game);
  });
  test(role+': Gwenna checks the cast creature’s power and applies both counter and untap effects',async()=>{
    const f=context(M,role),{game,a}=f,gwenna=await cast(f,'Gwenna, Eyes of Gaea');gwenna.tapped=true;
    await cast(f,witness(f,a,'{1}',['Creature'],{power:'4',toughness:'4'}));assert.equal(gwenna.tapped,true);
    await cast(f,witness(f,a,'{1}',['Creature'],{power:'5',toughness:'5'}));assert.equal(gwenna.tapped,false);assert.equal(gwenna.counters['+1/+1'],1);assertGameStateInvariants(game);
  });
  test(role+': Slitherwisp reacts to flash printed on a spell and not to an ordinary instant',async()=>{
    const f=context(M,role),{game,a,b}=f;await cast(f,'Slitherwisp');const life=b.life;
    await cast(f,witness(f,a,'{1}',['Instant']));assert.equal(b.life,life);
    const spell=witness(f,a,'{1}',['Creature'],{kws:['flash']}),hand=a.hand.length;await cast(f,spell);assert.equal(b.life,life-1);assert.equal(a.hand.length,hand);assertGameStateInvariants(game);
  });
  test(role+': Taniwha phases only its controller’s lands and preserves their identities',async()=>{
    const f=context(M,role),{game,a,b}=f,source=await cast(f,'Taniwha'),own=put(M,game,a,'Forest'),enemy=put(M,game,b,'Forest'),version=own.zoneVersion;
    await game.emit('upkeep',{player:a});await settle(game);assert.equal(own.phasedOut,true);assert.equal(enemy.phasedOut,false);assert.equal(source.phasedOut,false);
    game.phaseInFor(a);assert.equal(own.phasedOut,false);assert.equal(own.zoneVersion,version);assertGameStateInvariants(game);
  });
  test(role+': Dream Fighter phases both combatants while Alaborn Zealot destroys both',async()=>{
    for(const name of ['Dream Fighter','Alaborn Zealot']){
      const f=context(M,role),{game,a,b}=f,source=await cast(f,name),attacker=put(M,game,b,'Runeclaw Bear');attacker.attacking=a;source.blocking=attacker.iid;attacker.blockedBy=[source];
      await game.emit('blocks',{attacker,blocker:source});await settle(game);
      if(name==='Dream Fighter'){assert.equal(source.phasedOut,true);assert.equal(attacker.phasedOut,true);}else{assert.equal(source.zone,'graveyard');assert.equal(attacker.zone,'graveyard');}assertGameStateInvariants(game);
    }
  });
  test(role+': Suleiman’s Legacy observes both creature subtypes and ignores unrelated entrants',async()=>{
    const f=context(M,role),{game,a}=f;await cast(f,"Suleiman's Legacy");
    for(const subtype of ['Djinn','Efreet','Human']){const creature=witness(f,a,'{1}',['Creature'],{subtypes:[subtype]});await cast(f,creature);assert.equal(creature.zone,subtype==='Human'?'battlefield':'graveyard');}assertGameStateInvariants(game);
  });
  test(role+': Fleshwrither pays sacrifice and searches using its departed mana value',async()=>{
    const f=context(M,role),{game,a}=f,source=await cast(f,'Fleshwrither'),match=put(M,game,a,'Ravenous Chupacabra','library'),wrong=put(M,game,a,'Runeclaw Bear','library');source.sick=false;
    const choose=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseCards'&&q.from.includes(match)?[match]:choose(g,q);
    try{const action=game.activatableList(a).find(row=>row.card===source);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.equal(source.zone,'graveyard');await settle(game);}finally{a.controller.decide=choose;}
    assert.equal(match.zone,'battlefield');assert.equal(wrong.zone,'library');assertGameStateInvariants(game);
  });
  test(role+': a paid variable surge cost keeps the chosen X for both targets',async()=>{
    const f=context(M,role),{game,a,b}=f,first=witness(f,a,'{1}');await cast(f,first);const victim=put(M,game,b,'Runeclaw Bear'),spell=put(M,game,a,'Fall of the Titans','hand');fund(a);
    const offer=game.castableList(a).find(row=>row.card===spell&&row.alt?.surge);assert.ok(offer);const restore=chooseTargets(a,[b,victim]),life=b.life,mana=Object.values(a.pool).reduce((n,v)=>n+v,0);
    try{assert.equal(await game.castSpell(a,spell,{from:'hand',alt:offer.alt,xVal:3}),true);assert.equal(game.stack.at(-1).x,3);assert.equal(mana-Object.values(a.pool).reduce((n,v)=>n+v,0),4);await settle(game);}finally{restore();}
    assert.equal(b.life,life-3);assert.equal(victim.zone,'graveyard');assertGameStateInvariants(game);
  });
  test(role+': Undercity Plague makes its target lose life, discard and sacrifice',async()=>{
    const f=context(M,role),{game,a,b}=f,own=put(M,game,a,'Runeclaw Bear'),enemy=put(M,game,b,'Runeclaw Bear'),discarded=put(M,game,b,'Forest','hand'),life=b.life;
    await cast(f,'Undercity Plague',[b]);assert.equal(b.life,life-1);assert.equal(discarded.zone,'graveyard');assert.equal(enemy.zone,'graveyard');assert.equal(own.zone,'battlefield');assertGameStateInvariants(game);
  });
  test(role+': Imminent Doom uses the triggering spell’s mana value before increasing its own counter',async()=>{
    const f=context(M,role),{game,a,b}=f,doom=await cast(f,'Imminent Doom'),restore=chooseTargets(a,[b]),life=b.life;
    try{await cast(f,witness(f,a,'{1}'));assert.equal(b.life,life-1);assert.equal(doom.counters.doom,2);
      await cast(f,witness(f,a,'{2}'));assert.equal(b.life,life-3);assert.equal(doom.counters.doom,3);
      await cast(f,witness(f,a,'{1}'));assert.equal(b.life,life-3);}finally{restore();}assertGameStateInvariants(game);
  });
  test(role+': Norin responds independently to another spell or any creature attacking',async()=>{
    const f=context(M,role),{game,a,b}=f,norin=await cast(f,'Norin the Wary');
    await cast(f,witness(f,b,'{1}'),[],{},b);assert.equal(norin.zone,'exile');
    await game.emit('endStep',{player:a});await settle(game);assert.equal(norin.zone,'battlefield');
    const attacker=put(M,game,b,'Runeclaw Bear');attacker.attacking=a;await game.emit('attacks',{card:attacker,player:b,defender:a});await settle(game);assert.equal(norin.zone,'exile');
    await game.emit('endStep',{player:a});await settle(game);assert.equal(norin.zone,'battlefield');assertGameStateInvariants(game);
  });
}
test('a targeted ability and its defensive trigger keep their identity in an AI simulation',async()=>{
  const f=context(M),{game,a,b}=f,host=await cast(f,'Shimmering Glasskite'),mage=put(M,game,b,'Prodigal Sorcerer'),restore=chooseTargets(b,[host]);
  try{assert.equal(await game.activateAbility(b,game.activatableList(b).find(row=>row.card===mage)),true);}finally{restore();}
  await game.flushTriggers();assert.equal(game.stack.length,2);
  const clone=M.cloneGameForAISimulation(game,491);await settle(clone);assert.equal(clone.byIid(host.iid).damage,0);assert.equal(game.stack.length,2);
  await settle(game);assert.equal(host.damage,0);assertGameStateInvariants(game);assertGameStateInvariants(clone);
});
