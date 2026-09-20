import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan, semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, put, settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const sources=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v10-primitives.json',import.meta.url),'utf8'));
const M=loadEngine();
const absent=sources.filter(card=>!M.DEFS[card.name]);
if(absent.length){
  const {report}=createImportPlan({cards:absent,bulk:{type:'oracle_cards',updated_at:'2026-08-30T09:01:56.964+00:00'},sequence:9910,limit:absent.length,compilerVersion:10});
  M.registerOracleBatch(report);
}
M.initData(M.RAW_DATA);
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=20;};

for(const role of ['human','ai']){
  test(role+': numeric Toxic obeys ability loss timestamps, stacks, and does not follow a new object',async()=>{
    const f=context(M,role),{game,a,b}=f,host=put(M,game,a,'Runeclaw Bear'),equipment=await cast(f,'Prosthetic Injector');
    assert.equal(await game.attach(equipment,host),true);assert.equal(M.oracleToxicValueV10(host),1);
    const life=b.life,poison=b.poison||0;await game.damagePlayer(host,b,2);assert.equal(b.poison||0,poison,'noncombat damage adds no toxic poison');
    await game.damagePlayer(host,b,2,{combat:true});assert.equal(b.poison,poison+1);assert.equal(b.life,life-4);
    M.oracleGrantToxicV10(game,[host],2);assert.equal(M.oracleToxicValueV10(host),3);
    M.OracleV8AbilityLoss.add(game,[host],{temporary:true,keywords:[]});assert.equal(M.oracleToxicValueV10(host),0,'earlier static and temporary grants are removed');
    M.oracleGrantToxicV10(game,[host],2);assert.equal(M.oracleToxicValueV10(host),2,'a later grant survives ability loss');
    await game.damagePlayer(host,b,1,{combat:true});assert.equal(b.poison,poison+3);
    await game.move(host,'exile');await game.move(host,'battlefield',{ctrl:a});assert.equal(M.oracleToxicValueV10(host),0,'old temporary grants do not follow a returned creature');assertGameStateInvariants(game);
  });
  test(role+': Omen resolves into its owner library but a countered Omen stays in the graveyard',async()=>{
    const f=context(M,role),{game,a}=f,name='Marang River Regent // Coil and Catch',card=put(M,game,a,name,'hand');fund(a);
    const offer=game.castableList(a).find(row=>row.card===card&&row.alt?.omen);assert.ok(offer);
    assert.equal(await game.castSpell(a,card,{from:'hand',alt:offer.alt}),true);assert.equal(card.hasSub('Omen'),true);assert.equal(card.hasSub('Adventure'),false);assert.equal(card.is('Creature'),false);
    await settle(game);assert.equal(card.zone,'library');assert.equal(a.library.includes(card),true);assert.equal(card.meta.adventureExiled,undefined);
    await game.move(card,'hand');fund(a);assert.equal(await game.castSpell(a,card,{from:'hand',alt:offer.alt}),true);
    assert.equal(await game.counterStackObject(game.stack.find(row=>row.card===card)),true);await settle(game);assert.equal(card.zone,'graveyard');assertGameStateInvariants(game);
  });
}

for(const role of ['human','ai'])test(role+': saddle rejects invalid costs, uses the Stack, and expires at cleanup',async()=>{
  const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Alacrian Jaguar'),helper=put(M,game,a,'Llanowar Elves'),negative=put(M,game,a,'Llanowar Elves'),foreign=put(M,game,b,'Runeclaw Bear');
  negative.def={...negative.def,power:'-1',toughness:'2'};helper.sick=true;game.recalc();
  const row=()=>game.activatableList(a).find(row=>row.card===source&&row.ability.oracleSaddleV10),decide=a.controller.decide.bind(a.controller);
  for(const picks of [[helper,negative],[helper,helper],[source],[foreign]]){
    a.controller.decide=(g,q)=>q.aiHint?.saddleV10?picks:decide(g,q);
    assert.equal(await game.activateAbility(a,row()),false);assert.equal(helper.tapped,false);assert.equal(game.stack.length,0);
  }
  a.controller.decide=(g,q)=>q.aiHint?.saddleV10?[helper]:decide(g,q);
  const action=row();game.phase='combat';assert.equal(await game.activateAbility(a,action),false);game.phase='main1';
  assert.equal(await game.activateAbility(a,row()),true);assert.equal(helper.tapped,true,'a summoning-sick helper can saddle');assert.equal(M.oracleIsSaddledV10(game,source),false);
  assert.equal(await game.counterStackObject(game.stack.at(-1)),true);await settle(game);assert.equal(M.oracleIsSaddledV10(game,source),false);
  game.untap(helper);assert.equal(await game.activateAbility(a,row()),true);await game.move(source,'exile');await game.move(source,'battlefield',{ctrl:a});await settle(game);assert.equal(M.oracleIsSaddledV10(game,source),false);
  game.untap(helper);assert.equal(await game.activateAbility(a,row()),true);await settle(game);assert.equal(M.oracleIsSaddledV10(game,source),true);
  const before=source.power;source.attacking=b;await game.emit('attacks',{card:source,player:a,defender:b});await settle(game);assert.equal(source.power,before+2);
  source.attacking=null;game.mainPhase=async()=>{};game.combatPhase=async()=>{};await game.runTurn();assert.equal(M.oracleIsSaddledV10(game,source),false);assert.equal(source.power,before);assertGameStateInvariants(game);
});
async function cast(f,name,target){
  const spell=put(M,f.game,f.a,name,'hand');fund(f.a);
  const decide=f.a.controller.decide.bind(f.a.controller);
  f.a.controller.decide=async(g,q)=>{
    if(q.type==='chooseTargets'&&target){const eligible=[target].flat().filter(card=>q.candidates.includes(card));if(eligible.length)return eligible.slice(0,q.max||1);}
    return decide(g,q);
  };
  const before=Object.values(f.a.pool).reduce((a,b)=>a+b,0);
  assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true,name+': paid cast');
  assert.equal(spell.zone,'stack');assert.ok(Object.values(f.a.pool).reduce((a,b)=>a+b,0)<before);
  await settle(f.game);f.a.controller.decide=decide;assertGameStateInvariants(f.game);return spell;
}

test('v10 preserves prior complete descriptors and rejects unknown added clauses',()=>{
  const old={name:'Prior grammar fixture',layout:'normal',type_line:'Instant',mana_cost:'{U}',oracle_text:'Draw a card.'};
  assert.deepEqual(semanticClass(old,{compilerVersion:10}),semanticClass(old,{compilerVersion:9}));
  for(const card of sources){
    const prior=semanticClass(card,{compilerVersion:9});
    assert.ok(semanticClass(card,{compilerVersion:10}).semanticClass,card.name);
    const append=text=>(text||'')+'\nAn unsupported instruction must not disappear.';
    const invalid=card.card_faces?.length?card.card_faces.map((face,index)=>({...card,card_faces:card.card_faces.map((other,i)=>i===index?{...other,oracle_text:append(other.oracle_text)}:other)})):[{...card,oracle_text:append(card.oracle_text)}];
    for(const example of invalid)assert.equal(semanticClass(example,{compilerVersion:10}).semanticClass,undefined,card.name);
    assert.deepEqual(semanticClass(card,{compilerVersion:9}),prior,card.name+': version scope restored');
  }
});

for(const role of ['human','ai']){
  for(const chosen of ['W','U','B','R','G'])test(role+': entry choice '+chosen+' controls actual cast triggers and continuous characteristics',async()=>{
    const f=context(M,role),decide=f.a.controller.decide.bind(f.a.controller);
    f.a.controller.decide=(game,q)=>q.type==='chooseOption'&&q.prompt?.endsWith(': choose a color')?chosen:decide(game,q);
    const mare=await cast(f,'Diamond Mare'),before=f.a.life;
    const wrong=['W','U','B','R','G'].find(color=>color!==chosen);
    const make=(name,color)=>{const card=new M.CardInst({name,cost:'{'+color+'}',super:[],types:['Instant'],subtypes:[],oracle:'',kws:[],colorsOverride:[color],resolve:async()=>{}},f.a);card.zone='hand';f.a.hand.push(card);return card;};
    const miss=make('Unmatched paid spell',wrong);fund(f.a);
    assert.equal(await f.game.castSpell(f.a,miss,{from:'hand'}),true);await settle(f.game);assert.equal(f.a.life,before);
    const hit=make('Matching paid spell',chosen);
    assert.equal(await f.game.castSpell(f.a,hit,{from:'hand'}),true);await f.game.flushTriggers();
    assert.ok(f.game.stack.some(row=>row.kind==='trigger'&&row.srcCard===mare));
    await f.game.move(mare,'exile');await settle(f.game);assert.equal(f.a.life,before+1,'trigger survives losing its source');
    const red=put(M,f.game,f.b,'Shivan Dragon'),land=put(M,f.game,f.b,'Forest'),sky=await cast(f,'Shifting Sky');
    assert.deepEqual(Array.from(red.colors),[chosen]);assert.deepEqual(Array.from(land.colors),[]);
    await f.game.move(sky,'exile');assert.deepEqual(Array.from(red.colors),['R']);assertGameStateInvariants(f.game);
  });
  test(role+': chosen-color target remains bound after its source leaves and chooses a new color',async()=>{
    const f=context(M,role);let chosen='R';const decide=f.a.controller.decide.bind(f.a.controller);
    f.a.controller.decide=(game,q)=>q.type==='chooseOption'&&q.prompt?.endsWith(': choose a color')?chosen:decide(game,q);
    const source=await cast(f,'Pentarch Paladin'),red=put(M,f.game,f.b,'Shivan Dragon'),green=put(M,f.game,f.b,'Runeclaw Bear');source.sick=false;fund(f.a);
    const ability=f.game.activatableList(f.a).find(row=>row.card===source);assert.ok(ability);
    const spec=ability.ability.targets[0];assert.equal(spec.filter(f.game,red,f.a,source),true);assert.equal(spec.filter(f.game,green,f.a,source),false);
    f.a.controller.decide=(game,q)=>q.type==='chooseTargets'&&q.candidates.includes(red)?[red]:q.type==='chooseOption'&&q.prompt?.endsWith(': choose a color')?chosen:decide(game,q);
    assert.equal(await f.game.activateAbility(f.a,ability),true);
    await f.game.move(source,'exile');chosen='G';await f.game.move(source,'battlefield',{ctrl:f.a});
    assert.equal(source.meta.oracleChosenColor,'G');await settle(f.game);assert.equal(red.zone,'graveyard');assert.equal(green.zone,'battlefield');assertGameStateInvariants(f.game);
  });
  test(role+': airbend gives only the owner a paid two-mana cast with ordinary timing and a current exile identity',async()=>{
    const f=context(M,role),dragon=put(M,f.game,f.b,'Shivan Dragon');dragon.ctrl=f.a;f.game.recalc();
    await cast(f,'Airbending Lesson',dragon);assert.equal(dragon.zone,'exile');
    assert.equal(f.game.oracleAirbendAvailable(f.a,dragon),false);assert.equal(f.game.oracleAirbendAvailable(f.b,dragon),true);
    f.b.pool.C=2;assert.equal(await f.game.castSpell(f.b,dragon,{from:'exile',alt:{oracleAirbendV10:true,altCostStr:'{2}',speed:'instant'}}),false);
    f.game.turnPlayer=f.b;f.game.phase='main1';f.b.pool.C=1;assert.equal(f.game.castableList(f.b).some(row=>row.card===dragon),false);
    f.b.pool.C=2;const offer=f.game.castableList(f.b).find(row=>row.card===dragon&&row.alt?.oracleAirbendV10);assert.ok(offer);assert.equal(offer.alt.altCostStr,'{2}');
    assert.equal(await f.game.castSpell(f.b,dragon,{from:'exile',alt:{...offer.alt,free:true}}),false);
    assert.equal(await f.game.castSpell(f.b,dragon,{from:'exile',alt:offer.alt}),true);assert.equal(f.b.pool.C,0);await settle(f.game);assert.equal(dragon.zone,'battlefield');assert.equal(dragon.ctrl,f.b);
    await f.game.move(dragon,'exile');f.b.pool.C=2;assert.equal(f.game.oracleAirbendAvailable(f.b,dragon),false);assert.equal(await f.game.castSpell(f.b,dragon,{from:'exile',alt:offer.alt}),false);assertGameStateInvariants(f.game);
  });
  test(role+': airbend has a two-mana option for the front of a transforming permanent',async()=>{
    const f=context(M,role),def=Object.values(M.DEFS).find(def=>def.oracleFaces?.layout==='transform'&&def.oracleFaces.faces?.find(face=>face.key==='front')?.def.types.includes('Creature')&&Number(def.power)>0);
    assert.ok(def);const card=put(M,f.game,f.b,def.name);await cast(f,'Airbending Lesson',card);
    f.game.turnPlayer=f.b;f.game.phase='main1';f.b.pool.C=2;
    const choices=f.game.castableList(f.b).filter(row=>row.card===card&&row.alt?.oracleAirbendV10);assert.ok(choices.length);
    assert.ok(choices.every(row=>row.alt.oracleFace==='front'&&row.alt.altCostStr==='{2}'));
    assert.equal(await f.game.castSpell(f.b,card,{from:'exile',alt:choices[0].alt}),true);await settle(f.game);assert.equal(card.zone,'battlefield');assertGameStateInvariants(f.game);
  });
  for(const destination of ['graveyard','exile','hand'])test(role+': earthbend follows a land dying or being exiled, and stops after it changes zones: '+destination,async()=>{
    const f=context(M,role),land=put(M,f.game,f.a,'Forest');
    await cast(f,'Earthbending Lesson',land);
    assert.equal(land.is('Land'),true);assert.equal(land.is('Creature'),true);assert.equal(land.kw('haste'),true);
    assert.equal(land.power,4);assert.equal(land.toughness,4);assert.equal(land.counters['+1/+1'],4);
    assert.ok(f.game.untilEffects.some(row=>row.iid===land.iid&&row.kind==='oracleGrantedOperation'&&row.expires==='object'));
    const version=land.zoneVersion;await f.game.move(land,destination);await f.game.flushTriggers();
    if(destination==='hand'){assert.equal(f.game.stack.some(row=>row.srcCard===land),false);assert.equal(land.zone,'hand');}
    else {assert.ok(f.game.stack.some(row=>row.srcCard===land));await settle(f.game);assert.equal(land.zone,'battlefield');assert.equal(land.tapped,true);assert.equal(land.ctrl,land.owner);assert.equal(land.is('Creature'),false);assert.equal(land.zoneVersion,version+2);await f.game.move(land,'exile');await settle(f.game);assert.equal(land.zone,'exile');}
    assertGameStateInvariants(f.game);
  });
  test(role+': Serpopard protects its controller creature spells and the protection ends with its source',async()=>{
    const f=context(M,role),source=await cast(f,'Prowling Serpopard');fund(f.a);
    const bear=put(M,f.game,f.a,'Runeclaw Bear','hand');assert.equal(await f.game.castSpell(f.a,bear,{from:'hand'}),true);
    const spell=f.game.stack.find(row=>row.card===bear);assert.equal(await f.game.counterStackObject(spell),false);
    await f.game.move(source,'exile');assert.equal(await f.game.counterStackObject(spell),true);assert.equal(bear.zone,'graveyard');assertGameStateInvariants(f.game);
  });
  test(role+': Orb mana pays only Dragon spells and Dragon abilities',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Orb of Dragonkind');
    for(const color of Object.keys(f.a.pool))f.a.pool[color]=0;f.a.pool.C=1;
    const row=f.game.manaSources(f.a).find(row=>row.card===source);assert.ok(row);
    assert.equal(await f.game.payMana(f.a,M.parseCost(row.extraCost.mana),{card:source,isAbility:true}),true);
    assert.equal(await f.game.activateManaSource(f.a,row,row.produce[0],null,[]),true);
    const bear=put(M,f.game,f.a,'Runeclaw Bear','hand'),dragon=put(M,f.game,f.a,'Shivan Dragon','hand'),cost=M.parseCost('{1}');
    assert.equal(f.game.canPayMana(f.a,cost,{card:bear,from:'hand'}),false);
    assert.equal(f.game.canPayMana(f.a,cost,{card:bear,isAbility:true}),false);
    assert.equal(f.game.canPayMana(f.a,cost,{card:dragon,isAbility:true}),true);
    assert.equal(await f.game.payMana(f.a,cost,{card:dragon,from:'hand'}),true);assertGameStateInvariants(f.game);
  });
  test(role+': max speed grants and removes an actual mana ability at speed four',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Endrider Catalyzer');source.sick=false;
    await f.game.checkSBA();assert.equal(f.a.counters.speed,1);
    f.a.counters.speed=3;f.game.recalc();assert.equal(f.game.manaSources(f.a).some(row=>row.card===source),false);
    f.a.counters.speed=4;f.game.recalc();assert.equal(f.game.manaSources(f.a).some(row=>row.card===source),true);
    f.a.counters.speed=3;f.game.recalc();assert.equal(f.game.manaSources(f.a).some(row=>row.card===source),false);
    await f.game.move(source,'hand');await f.game.checkSBA();assert.equal(f.a.counters.speed,3);assertGameStateInvariants(f.game);
  });
  test(role+': a max speed trigger survives losing its granted ability after triggering',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Aether Syphon');
    for(let i=0;i<6;i++){put(M,f.game,f.a,'Forest','library');put(M,f.game,f.b,'Forest','library');}
    f.a.counters.speed=3;f.game.recalc();await f.game.draw(f.a,1,source);await settle(f.game);assert.equal(f.b.graveyard.length,0);
    f.a.counters.speed=4;f.game.recalc();await f.game.draw(f.a,1,source);await f.game.flushTriggers();
    assert.ok(f.game.stack.some(row=>row.srcCard===source));f.a.counters.speed=3;f.game.recalc();
    await settle(f.game);assert.equal(f.b.graveyard.length,2);assertGameStateInvariants(f.game);
  });
  test(role+': Sleep-Cursed Faerie consumes stun counters before it can untap',async()=>{
    const f=context(M,role),source=await cast(f,'Sleep-Cursed Faerie');
    assert.equal(source.tapped,true);assert.equal(source.counters.stun,3);
    for(let remaining=2;remaining>=-1;remaining--){fund(f.a);const action=f.game.activatableList(f.a).find(row=>row.card===source);
      assert.ok(action);assert.equal(await f.game.activateAbility(f.a,action),true);await settle(f.game);
      assert.equal(source.counters.stun||0,Math.max(0,remaining));assert.equal(source.tapped,remaining>=0);
    }assertGameStateInvariants(f.game);
  });
  test(role+': Humiliate chooses its counter recipient at resolution through shroud',async()=>{
    const f=context(M,role),recipient=put(M,f.game,f.a,'Nimble Mongoose'),other=put(M,f.game,f.b,'Runeclaw Bear');
    put(M,f.game,f.b,'Sol Ring','hand');assert.equal(recipient.kw('shroud'),true);
    await cast(f,'Humiliate',f.b);assert.equal(recipient.counters['+1/+1'],1);assert.equal(other.counters['+1/+1']||0,0);assert.equal(f.b.hand.length,0);
  });
  test(role+': Unexpected Fangs puts both printed counters on one locked creature',async()=>{
    const f=context(M,role),recipient=put(M,f.game,f.a,'Runeclaw Bear'),other=put(M,f.game,f.a,'Centaur Courser');
    await cast(f,'Unexpected Fangs',recipient);assert.equal(recipient.counters['+1/+1'],1);assert.equal(recipient.counters.lifelink,1);assert.equal(recipient.kw('lifelink'),true);assert.equal(other.counters.lifelink||0,0);
  });
  test(role+': Free from Flesh and Burning Cloak retain their announced creature',async()=>{
    const f=context(M,role),recipient=put(M,f.game,f.a,'Runeclaw Bear'),other=put(M,f.game,f.a,'Centaur Courser');
    await cast(f,'Free from Flesh',recipient);assert.equal(recipient.counters.oil,2);assert.equal(recipient.power,4);assert.equal(other.counters.oil||0,0);
    await cast(f,'Burning Cloak',recipient);assert.equal(recipient.damage,2);assert.equal(other.damage,0);assert.equal(recipient.power,6);
  });
  test(role+': Stand Together announces two distinct creatures and counters each',async()=>{
    const f=context(M,role),first=put(M,f.game,f.a,'Runeclaw Bear'),second=put(M,f.game,f.a,'Centaur Courser');
    await cast(f,'Stand Together',[first,second]);assert.equal(first.counters['+1/+1'],2);assert.equal(second.counters['+1/+1'],2);
  });
  test(role+': The Sibsig Ceremony replaces a cast creature once and ignores tokens and uncast creatures',async()=>{
    const f=context(M,role);put(M,f.game,f.a,'The Sibsig Ceremony');
    const bear=await cast(f,'Runeclaw Bear');assert.equal(bear.zone,'graveyard');
    assert.equal(f.game.bf().filter(card=>card.isToken&&card.hasSub('Zombie')&&card.hasSub('Druid')).length,1);
    const uncast=put(M,f.game,f.a,'Centaur Courser','hand');await f.game.putPermanentOntoBattlefield(uncast,f.a);await settle(f.game);
    assert.equal(uncast.zone,'battlefield');assert.equal(f.game.bf().filter(card=>card.isToken).length,1);
    assertGameStateInvariants(f.game);
  });
  test(role+': Death Watch uses the dead enchanted creature\'s power, toughness, and controller',async()=>{
    const f=context(M,role),host=put(M,f.game,f.b,'Centaur Courser');await cast(f,'Death Watch',host);
    const own=f.a.life,opponent=f.b.life,power=host.power,toughness=host.toughness;
    await f.game.destroy(host);await settle(f.game);
    assert.equal(f.b.life,opponent-power);assert.equal(f.a.life,own+toughness);assertGameStateInvariants(f.game);
  });
  test(role+': Twisted Sewer-Witch gives existing and newly created Rats one Wicked Role each',async()=>{
    const f=context(M,role);const rats=await f.game.makeTokens({name:'Rat',types:['Creature'],subtypes:['Rat'],super:[],power:'1',toughness:'1',colorsOverride:['B'],kws:[],oracle:'',isTokenDef:true},f.a,{n:1});
    await cast(f,'Twisted Sewer-Witch');const ownRats=f.game.creatures(f.a).filter(card=>card.hasSub('Rat'));
    assert.equal(ownRats.length,2);assert.ok(ownRats.includes(rats[0]));
    for(const rat of ownRats){const roles=f.game.bf().filter(card=>card.hasSub('Role')&&card.attachedTo===rat.iid);assert.equal(roles.length,1);assert.equal(roles[0].name,'Wicked');assert.equal(rat.power,2);}
    assertGameStateInvariants(f.game);
  });
  test(role+': Molder Slug requires the active player to choose their own artifact',async()=>{
    const f=context(M,role,2);put(M,f.game,f.a,'Molder Slug');
    const own=put(M,f.game,f.a,'Sol Ring'),opponent=put(M,f.game,f.b,'Sol Ring'),third=put(M,f.game,f.others[1],'Sol Ring');
    f.game.turnPlayer=f.b;await f.game.emit('upkeep',{player:f.b});await settle(f.game);
    assert.equal(opponent.zone,'graveyard');assert.equal(own.zone,'battlefield');assert.equal(third.zone,'battlefield');
    f.game.turnPlayer=f.a;await f.game.emit('upkeep',{player:f.a});await settle(f.game);
    assert.equal(own.zone,'graveyard');assert.equal(third.zone,'battlefield');assertGameStateInvariants(f.game);
  });
  for(const artifact of [false,true])test(role+': Topple the Statue draws independently when the target '+(artifact?'is':'is not')+' an artifact',async()=>{
    const f=context(M,role),target=put(M,f.game,f.b,artifact?'Sol Ring':'Runeclaw Bear'),before=f.a.hand.length;
    await cast(f,'Topple the Statue',target);
    assert.equal(target.zone,artifact?'graveyard':'battlefield');if(!artifact)assert.equal(target.tapped,true);
    assert.equal(f.a.hand.length,before+1,'printed second paragraph always draws');
  });
  test(role+': Verdant Rebirth grants the chosen creature a death trigger and draws immediately',async()=>{
    const f=context(M,role),target=put(M,f.game,f.a,'Runeclaw Bear'),before=f.a.hand.length;
    await cast(f,'Verdant Rebirth',target);assert.equal(f.a.hand.length,before+1);
    await f.game.destroy(target);await settle(f.game);assert.equal(target.zone,'hand');assert.equal(target.owner,f.a);assertGameStateInvariants(f.game);
  });
  test(role+': Gix\'s Caress discards a selected nonland and creates a tapped Powerstone with its mana restriction',async()=>{
    const f=context(M,role);put(M,f.game,f.b,'Runeclaw Bear','hand');put(M,f.game,f.b,'Forest','hand');
    await cast(f,"Gix's Caress",f.b);
    assert.ok(f.b.graveyard.some(card=>card.name==='Runeclaw Bear'));assert.ok(f.b.hand.some(card=>card.name==='Forest'));
    const token=f.game.bf().find(card=>card.isToken&&card.hasSub('Powerstone')&&card.ctrl===f.a);
    assert.ok(token);assert.equal(token.tapped,true);assert.equal(token.is('Artifact'),true);
    const mana=token.def.mana;assert.ok(mana,'token has a mana ability');
    for(const color of Object.keys(f.a.pool))f.a.pool[color]=0;
    token.tapped=false;
    const artifact=put(M,f.game,f.a,'Sol Ring','hand'),creature=put(M,f.game,f.a,'Runeclaw Bear','hand');
    assert.equal(f.game.canPayMana(f.a,M.parseCost('{1}'),{card:artifact}),true);
    assert.equal(f.game.canPayMana(f.a,M.parseCost('{1}'),{card:creature}),false);
    assert.equal(f.game.canPayMana(f.a,M.parseCost('{1}'),{card:creature,isAbility:true}),true);
    assert.equal(await f.game.payMana(f.a,M.parseCost('{1}'),{card:artifact}),true);
    assert.equal(token.tapped,true,'Powerstone actually pays for an artifact spell');
    assertGameStateInvariants(f.game);
  });
}
