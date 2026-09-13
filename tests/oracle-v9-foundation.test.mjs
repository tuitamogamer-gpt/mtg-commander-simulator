import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan, semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, put, settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const sources = JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v9-primitives.json', import.meta.url), 'utf8'));
const M = loadEngine();
const absent=sources.filter(card=>!M.DEFS[card.name]);
if(absent.length){
  const {report} = createImportPlan({cards:absent, bulk:{type:'oracle_cards',updated_at:'2026-08-30T09:01:56.964+00:00'},sequence:9909,limit:absent.length,compilerVersion:9});
  M.registerOracleBatch(report);
}
M.initData(M.RAW_DATA);
const fund = p => {for (const color of ['W','U','B','R','G','C']) p.pool[color] = 20;};
function chooseOptionalCards(f,kind){
  if(f.a.isAI)return;
  const decide=f.a.controller.decide.bind(f.a.controller);
  f.a.controller.decide=(g,q)=>q.type==='chooseCards'&&q.aiHint?.kind===kind?q.from.slice(0,q.max):decide(g,q);
}
async function cast(f, name) {
  const card = put(M, f.game, f.a, name, 'hand');
  fund(f.a);
  const before = Object.values(f.a.pool).reduce((sum,n)=>sum+n,0);
  assert.equal(await f.game.castSpell(f.a,card,{from:'hand'}),true,name+': paid cast');
  assert.equal(card.zone,'stack');
  assert.ok(Object.values(f.a.pool).reduce((sum,n)=>sum+n,0)<before);
  await settle(f.game);
  assertGameStateInvariants(f.game);
  return card;
}

test('v9 preserves successful v8 cards and rejects incomplete Oracle clauses',()=>{
  const simple={name:'Closed Grammar Check',layout:'normal',type_line:'Instant',mana_cost:'{U}',oracle_text:'Draw a card.'};
  assert.deepEqual(semanticClass(simple,{compilerVersion:9}),semanticClass(simple,{compilerVersion:8}));
  const largeReinforce={...simple,type_line:'Creature — Elemental',power:'2',toughness:'2',oracle_text:'Reinforce twelve—{W}'};
  assert.equal(semanticClass(largeReinforce,{compilerVersion:8}).semanticClass,undefined);
  assert.equal(semanticClass(largeReinforce,{compilerVersion:9}).implementation[0].effects[0].n,12);
  for(const type of ['creature','artifact']){
    const unsupported={...simple,type_line:'Enchantment',oracle_text:'Whenever you tap a '+type+' for mana, you gain 1 life.'};
    assert.equal(semanticClass(unsupported,{compilerVersion:9}).semanticClass,undefined,'nonland mana observation remains closed');
  }
  for(const card of sources){
    const compiled=semanticClass(card,{compilerVersion:9});
    assert.ok(compiled.semanticClass,card.name);
    const invalid=card.card_faces?{...card,card_faces:card.card_faces.map(face=>({...face,oracle_text:face.oracle_text+'\nAn unknown instruction must not disappear.'}))}:{...card,oracle_text:card.oracle_text+'\nAn unknown instruction must not disappear.'};
    assert.equal(semanticClass(invalid,{compilerVersion:9}).semanticClass,undefined,card.name);
    const old=semanticClass(card,{compilerVersion:8});
    semanticClass(card,{compilerVersion:9});
    assert.deepEqual(semanticClass(card,{compilerVersion:8}),old,'v9 grammar context cannot leak into v8');
  }
});

for(const role of ['human','ai']){

  test(role+': Bayek grants double strike to an animated Saga and other historic creatures only during its controller turn',async()=>{
    const f=context(M,role),source=await cast(f,'Bayek of Siwa');
    const saga=owner=>{
      const card=new M.CardInst({...M.DEFS['Runeclaw Bear'],name:'Animated Saga fixture',types:['Enchantment','Creature'],subtypes:['Saga'],super:[]},owner);
      card.zone='battlefield';card.sick=false;f.game.battlefield.push(card);return card;
    };
    const ownSaga=saga(f.a),enemySaga=saga(f.b),artifact=put(M,f.game,f.a,'Ornithopter');
    const ordinary=put(M,f.game,f.a,'Runeclaw Bear'),ring=put(M,f.game,f.a,'Sol Ring');
    f.game.recalc();
    assert.equal(ownSaga.kw('double strike'),true);assert.equal(artifact.kw('double strike'),true);
    for(const card of [enemySaga,ordinary,ring])assert.equal(card.kw('double strike'),false,card.name);
    f.game.turnPlayer=f.b;f.game.recalc();
    assert.equal(ownSaga.kw('double strike'),false);assert.equal(artifact.kw('double strike'),false);
    assert.equal(source.kw('double strike'),true,'printed double strike is independent of the granted ability');
    f.game.turnPlayer=f.a;f.game.recalc();assert.equal(ownSaga.kw('double strike'),true);
    await f.game.move(source,'exile');assert.equal(ownSaga.kw('double strike'),false);
    assertGameStateInvariants(f.game);
  });

  test(role+': General Kreat creates one attacking Goblin for a multi-Goblin attack and its entry deals damage',async()=>{
    const f=context(M,role),source=await cast(f,'General Kreat, the Boltbringer'),other=put(M,f.game,f.a,'Goblin Javelineer');
    source.sick=false;other.sick=false;
    if(role==='human'){
      const decide=f.a.controller.decide.bind(f.a.controller);
      f.a.controller.decide=(g,q)=>q.type==='attackers'?[source,other].map(card=>({card,target:f.b})):decide(g,q);
    }
    f.game.priorityRound=()=>settle(f.game);f.game.reviewCombatWithHuman=async()=>{};
    const combatDamage=f.game.combatDamage.bind(f.game),life=f.b.life;
    let attackingToken;
    f.game.combatDamage=async(...args)=>{
      const tokens=f.game.combat.attackers.filter(card=>card.isToken&&card.hasSub('Goblin'));
      assert.equal(tokens.length,1);attackingToken=tokens[0];
      assert.equal(attackingToken.attacking,f.b);assert.equal(attackingToken.tapped,true);assert.equal(attackingToken.sick,true);
      return combatDamage(...args);
    };
    await f.game.combatPhase(f.a);await settle(f.game);
    assert.ok(attackingToken);assert.equal(attackingToken.zone,'battlefield');assert.equal(f.b.life,life-5);
    assertGameStateInvariants(f.game);
  });
  test(role+': Sanctimony observes only opposing Mountain mana activations',async()=>{
    const f=context(M,role);await cast(f,'Sanctimony');
    const ownMountain=put(M,f.game,f.a,'Mountain'),opponentForest=put(M,f.game,f.b,'Forest'),opponentMountain=put(M,f.game,f.b,'Mountain');
    const life=f.a.life;
    for(const land of [ownMountain,opponentForest,opponentMountain]){
      const action=f.game.manaSources(land.ctrl).find(row=>row.card===land);
      assert.equal(await f.game.activateManaSource(land.ctrl,action,action.produce[0],null,[]),true);await settle(f.game);
      assert.equal(f.a.life,life+(land===opponentMountain?1:0));
    }
    assertGameStateInvariants(f.game);
  });
  test(role+': Scald damages the actual Island mana controller and ignores other lands',async()=>{
    const f=context(M,role);await cast(f,'Scald');
    for(const player of [f.a,f.b]){
      const forest=put(M,f.game,player,'Forest'),island=put(M,f.game,player,'Island'),life=player.life;
      for(const land of [forest,island]){
        const action=f.game.manaSources(player).find(row=>row.card===land);
        assert.equal(await f.game.activateManaSource(player,action,action.produce[0],null,[]),true);await settle(f.game);
        assert.equal(player.life,life-(land===island?1:0));
      }
    }
    assertGameStateInvariants(f.game);
  });
  test(role+': Blight counters cancel opposing counters through the real counter rules',async()=>{
    const f=context(M,role),host=put(M,f.game,f.b,'Grizzly Bears');f.game.addCounters(host,'+1/+1',2);
    await cast(f,'High Perfect Morcant');assert.equal(host.counters['+1/+1'],1);assert.equal(host.counters['-1/-1']||0,0);assert.equal(host.power,3);
  });
  test(role+': Silence blocks payment and casting until actual cleanup',async()=>{
    const f=context(M,role);await cast(f,'Silence');const spell=put(M,f.game,f.b,'Lightning Bolt','hand');fund(f.b);const pool=JSON.stringify(f.b.pool);
    assert.equal(await f.game.castSpell(f.b,spell,{from:'hand'}),false);assert.equal(JSON.stringify(f.b.pool),pool);assert.equal(spell.zone,'hand');
    f.game.turnPlayer=f.b;f.game.mainPhase=async()=>{};f.game.combatPhase=async()=>{};await f.game.runTurn();f.game.phase='main1';fund(f.b);
    assert.equal(await f.game.castSpell(f.b,spell,{from:'hand'}),true);await settle(f.game);assert.equal(spell.zone,'graveyard');
  });
  test(role+': a creature casting prohibition respects the selected Adventure face',async()=>{
    const f=context(M,role),source=await cast(f,'Steel Golem'),card=put(M,f.game,f.a,'Brazen Borrower','hand');fund(f.a);
    assert.equal(f.game.canCastTiming(f.a,card),false);assert.equal(M.OracleV8CastingLimits.allowed(f.game,f.a,card,{adventure:true}),true);
    await f.game.move(source,'exile');assert.equal(f.game.canCastTiming(f.a,card),true);
  });
  test(role+': a Ward retains its own Aura while still preventing damage from its color',async()=>{
    const f=context(M,role),host=put(M,f.game,f.a,'Grizzly Bears'),aura=await cast(f,'White Ward');await f.game.checkSBA();
    assert.equal(aura.zone,'battlefield');assert.equal(aura.attachedTo,host.iid);assert.equal(f.game.isProtectedFrom(host,aura),true);assert.equal(await f.game.damageAny(aura,host,1),0);
    const other=put(M,f.game,f.b,'Pacifism','hand');const spec=other.def.auraTarget[0];assert.equal(f.game.legalTargets(spec,other,f.b).includes(host),false);
  });
  test(role+': Aura death return places its counter before the new permanent enters',async()=>{
    const f=context(M,role),host=put(M,f.game,f.b,'Grizzly Bears');await cast(f,'Unholy Indenture');const entered=[],emit=f.game.emit.bind(f.game);
    f.game.emit=async(event,data,...args)=>{if(event==='etb'&&data.card===host)entered.push(host.counters['+1/+1']||0);return emit(event,data,...args);};
    await f.game.destroy(host);await settle(f.game);assert.equal(host.zone,'battlefield');assert.equal(host.ctrl,f.a);assert.equal(host.counters['+1/+1'],1);assert.deepEqual(entered,[1]);
  });
  test(role+': Pull from Eternity rejects face-down cards in exile',async()=>{
    const f=context(M,role),visible=put(M,f.game,f.b,'Grizzly Bears','exile'),hidden=put(M,f.game,f.b,'Serra Angel','exile');hidden.faceDown=true;
    const source=put(M,f.game,f.a,'Pull from Eternity','hand'),spec=source.def.targets[0];assert.equal(f.game.legalTargets(spec,source,f.a).includes(hidden),false);assert.equal(f.game.legalTargets(spec,source,f.a).includes(visible),true);
    fund(f.a);assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await settle(f.game);assert.equal(visible.zone,'graveyard');assert.equal(hidden.zone,'exile');
  });
  test(role+': life-total setting counts the entering creature and emits real life gain',async()=>{
    const f=context(M,role);put(M,f.game,f.a,'Grizzly Bears');f.a.life=3;await cast(f,'Loxodon Lifechanter');assert.equal(f.a.life,8);assert.equal(f.a.turnState.lifeGained,5);
  });
  test(role+': doubling life uses normal gain prevention',async()=>{
    const f=context(M,role);put(M,f.game,f.b,'Leyline of Punishment');const before=f.game.players.map(p=>p.life);await cast(f,'Beacon of Immortality');assert.deepEqual(f.game.players.map(p=>p.life),before);
  });
  test(role+': an enchantment conditional animation refers to itself after another creature dies',async()=>{
    const f=context(M,role),source=await cast(f,'Lurking Skirge'),host=put(M,f.game,f.b,'Grizzly Bears');await f.game.destroy(host);await settle(f.game);
    assert.equal(source.is('Creature'),true);assert.equal(source.is('Enchantment'),false);assert.equal(source.power,3);assert.equal(source.toughness,2);assert.equal(host.zone,'graveyard');
  });
  test(role+': modified death uses the Aura controller in the departing host snapshot',async()=>{
    for(const own of [false,true]){
      const f=context(M,role);await cast(f,'Akki Ember-Keeper');const host=put(M,f.game,f.a,'Grizzly Bears'),aura=put(M,f.game,own?f.a:f.b,'Pacifism');await f.game.attach(aura,host);
      await f.game.destroy(host);await settle(f.game);assert.equal(f.game.bf().filter(c=>c.isToken&&c.hasSub('Spirit')).length,own?1:0);
    }
  });

  test(role+': optional scry is decided independently by each affected player',async()=>{
    const f=context(M,role),events=[],scry=M.E.scry;
    M.E.scry=async(g,p,n)=>{if(g===f.game)events.push(p);return scry(g,p,n);};
    const decide=f.b.controller.decide.bind(f.b.controller);
    f.b.controller={decide:(g,q)=>q.aiHint?.kind==='optTrigger'?'no':decide(g,q)};
    try{await cast(f,'Eager Construct');assert.deepEqual(events,[f.a]);}finally{M.E.scry=scry;}
  });
  test(role+': each player damage counts that player nonbasic lands',async()=>{
    const f=context(M,role);
    for(const [p,n]of [[f.a,2],[f.b,5]])for(let i=0;i<n;i++)put(M,f.game,p,'Command Tower');
    put(M,f.game,f.a,'Forest');await cast(f,'Price of Progress');
    assert.equal(f.a.life,36);assert.equal(f.b.life,30);
  });
  test(role+': color choice changes only matching battlefield objects',async()=>{
    const f=context(M,role),blue=Array.from({length:3},()=>put(M,f.game,f.b,'Air Elemental')),red=put(M,f.game,f.b,'Hill Giant');
    if(role==='human'){const decide=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=(g,q)=>q.aiHint?.kind==='oracleColorChange'?'U':decide(g,q);}
    await cast(f,'Wash Out');assert.ok(blue.every(c=>c.zone==='hand'));assert.equal(red.zone,'battlefield');
  });
  test(role+': destroyed target controller receives the follow-up Clue',async()=>{
    const f=context(M,role),target=put(M,f.game,f.a,'Grizzly Bears');M.OracleV8Control.gain(f.game,target,f.b);f.game.recalc();
    await cast(f,'Fateful Absence');assert.equal(target.zone,'graveyard');assert.equal(target.owner,f.a);
    const clues=f.game.bf().filter(c=>c.hasSub('Clue'));assert.equal(clues.length,1);assert.equal(clues[0].ctrl,f.b);
  });
  test(role+': tapped source group bonus survives cleanup and control change but ends on untap',async()=>{
    const f=context(M,role),a=put(M,f.game,f.a,'Grizzly Bears'),b=put(M,f.game,f.b,'Grizzly Bears'),source=await cast(f,'Thran Weaponry');
    assert.equal(await f.game.activateAbility(f.a,f.game.activatableList(f.a).find(row=>row.card===source)),true);await settle(f.game);
    assert.equal(a.power,4);assert.equal(b.power,4);f.game.turnPlayer=f.b;f.game.mainPhase=async()=>{};f.game.combatPhase=async()=>{};await f.game.runTurn();
    assert.equal(a.power,4);assert.equal(b.power,4);M.OracleV8Control.gain(f.game,source,f.b);f.game.recalc();assert.equal(a.power,4);
    f.game.untap(source);f.game.recalc();assert.equal(a.power,2);assert.equal(b.power,2);f.game.tap(source);f.game.recalc();assert.equal(a.power,2);
  });
  test(role+': source blink before animation resolves cannot start a new duration',async()=>{
    const f=context(M,role),host=put(M,f.game,f.a,'Sol Ring'),source=put(M,f.game,f.a,'Skilled Animator','hand');fund(f.a);
    assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await f.game.resolveTop();await f.game.flushTriggers();assert.ok(f.game.stack.length);
    await f.game.move(source,'exile');await f.game.move(source,'battlefield',{ctrl:f.a});await settle(f.game);
    assert.equal(host.is('Creature'),true);assert.equal(f.game.untilEffects.filter(e=>e.kind==='oracleAnimation').length,1,'only the new ETB creates an animation');
    await f.game.move(source,'exile');assert.equal(host.is('Creature'),false);
  });
  test(role+': Aura enchant restriction applies before casting',async()=>{
    const f=context(M,role),host=put(M,f.game,f.b,'Grizzly Bears'),aura=put(M,f.game,f.a,'Glimmerdust Nap','hand');fund(f.a);
    const before=Object.values(f.a.pool).reduce((a,b)=>a+b,0);assert.equal(await f.game.castSpell(f.a,aura,{from:'hand'}),false);assert.equal(aura.zone,'hand');assert.equal(Object.values(f.a.pool).reduce((a,b)=>a+b,0),before);
    f.game.tap(host);assert.equal(await f.game.castSpell(f.a,aura,{from:'hand'}),true);await settle(f.game);assert.equal(aura.attachedTo,host.iid);
  });
  test(role+': continuous Aura animation retains artifact type and counters after removal',async()=>{
    const f=context(M,role),host=put(M,f.game,f.a,'Sol Ring'),aura=await cast(f,'Ensoul Artifact');f.game.addCounters(host,'+1/+1',2);
    assert.equal(host.power,7);assert.equal(host.toughness,7);assert.equal(host.is('Artifact'),true);assert.equal(host.is('Creature'),true);
    await f.game.move(aura,'exile');assert.equal(host.is('Creature'),false);assert.equal(host.is('Artifact'),true);assert.equal(host.counters['+1/+1'],2);
  });
  test(role+': Aura death trigger returns its host under Aura controller',async()=>{
    const f=context(M,role),host=put(M,f.game,f.b,'Grizzly Bears'),aura=await cast(f,'Unhallowed Pact');
    await f.game.destroy(host);await settle(f.game);assert.equal(host.zone,'battlefield');assert.equal(host.ctrl,f.a);assert.equal(host.owner,f.b);assert.equal(aura.zone,'graveyard');
  });
  test(role+': host leaving its graveyard in response invalidates the Aura return',async()=>{
    const f=context(M,role),host=put(M,f.game,f.b,'Grizzly Bears');await cast(f,'Unhallowed Pact');await f.game.destroy(host);await f.game.flushTriggers();
    assert.ok(f.game.stack.length);await f.game.move(host,'exile');await f.game.move(host,'graveyard');await settle(f.game);assert.equal(host.zone,'graveyard');
  });
  test(role+': returning death trigger attaches its Role to the returned incarnation',async()=>{
    const f=context(M,role),host=put(M,f.game,f.a,'Grizzly Bears');await cast(f,'Not Dead After All');await f.game.destroy(host);await settle(f.game);
    assert.equal(host.zone,'battlefield');assert.equal(host.tapped,true);assert.equal(host.power,3);const aura=f.game.bf().find(c=>c.name==='Wicked');assert.ok(aura);assert.equal(aura.attachedTo,host.iid);
  });
  test(role+': Umbra replaces simultaneous Aura and host destruction but never sacrifice',async()=>{
    for(const mode of ['destroy','sacrifice']){
      const f=context(M,role),host=put(M,f.game,f.a,'Grizzly Bears'),aura=await cast(f,'Hyena Umbra');host.damage=1;
      if(mode==='destroy'){await f.game.destroyMany([host,aura],{noRegen:true});assert.equal(host.zone,'battlefield');assert.equal(host.damage,0);}
      else{await f.game.sacrifice(f.a,host);assert.equal(host.zone,'graveyard');}
      assert.equal(aura.zone,'graveyard');
    }
  });

  test(role+': nonmana activation triggers use the sacrificed source characteristics',async()=>{
    const f=context(M,role);await cast(f,'Immolation Shaman');
    const source=put(M,f.game,f.b,'Mind Stone');fund(f.b);
    const action=f.game.activatableList(f.b).find(row=>row.card===source&&row.ability.cost?.sacSelf);assert.ok(action);
    assert.equal(await f.game.activateAbility(f.b,action),true);assert.equal(source.zone,'graveyard');await settle(f.game);assert.equal(f.b.life,39);
  });
  test(role+': own sacrificed artifact activation pumps Crackdown Construct exactly once',async()=>{
    const f=context(M,role),watcher=await cast(f,'Crackdown Construct'),source=put(M,f.game,f.a,'Mind Stone');fund(f.a);
    const action=f.game.activatableList(f.a).find(row=>row.card===source&&row.ability.cost?.sacSelf);assert.ok(action);
    assert.equal(await f.game.activateAbility(f.a,action),true);await settle(f.game);assert.equal(source.zone,'graveyard');assert.equal(watcher.power,3);assert.equal(watcher.toughness,3);
  });
  test(role+': Recoil makes the owner of a controlled permanent discard',async()=>{
    const f=context(M,role),target=put(M,f.game,f.a,'Grizzly Bears');M.OracleV8Control.gain(f.game,target,f.b);f.game.recalc();
    put(M,f.game,f.a,'Forest','hand');const untouched=put(M,f.game,f.b,'Forest','hand');
    await cast(f,'Recoil');assert.notEqual(target.zone,'battlefield');assert.equal(f.a.hand.length,1);assert.equal(untouched.zone,'hand');assert.equal(f.b.hand.length,1);assert.equal(f.a.graveyard.filter(c=>c.name!=='Recoil').length,1);
  });
  test(role+': Sorceress Queen cannot select herself',async()=>{
    const f=context(M,role),source=await cast(f,'Sorceress Queen'),other=put(M,f.game,f.b,'Grizzly Bears');source.sick=false;
    const spec=source.def.abilities[0].targets[0],legal=f.game.legalTargets(spec,source,f.a);assert.equal(legal.includes(source),false);assert.equal(legal.includes(other),true);
  });
  test(role+': top creature graveyard cost skips a later noncreature card',async()=>{
    const f=context(M,role),source=await cast(f,'Zombie Scavengers'),old=put(M,f.game,f.a,'Serra Angel','graveyard'),top=put(M,f.game,f.a,'Grizzly Bears','graveyard'),noncreature=put(M,f.game,f.a,'Forest','graveyard');
    assert.equal(await f.game.activateAbility(f.a,f.game.activatableList(f.a).find(row=>row.card===source)),true);await settle(f.game);
    assert.equal(top.zone,'exile');assert.equal(old.zone,'graveyard');assert.equal(noncreature.zone,'graveyard');
  });
  test(role+': named discard cost needs another matching hand card',async()=>{
    const f=context(M,role);put(M,f.game,f.a,'Swamp');const source=await cast(f,'Korlash, Heir to Blackblade');put(M,f.game,f.a,'Forest','hand');
    const action=()=>f.game.activatableList(f.a).find(row=>row.card===source&&row.ability.cost?.discard);
    assert.equal(action(),undefined);assert.equal(f.a.hand[0].name,'Forest');const matching=put(M,f.game,f.a,'Korlash, Heir to Blackblade','hand');assert.ok(action());assert.equal(await f.game.activateAbility(f.a,action()),true);assert.equal(matching.zone,'graveyard');await settle(f.game);
  });
  test(role+': changing only base power preserves toughness and counters',async()=>{
    const f=context(M,role),source=await cast(f,'Turtle-Duck'),toughness=source.toughness;f.game.addCounters(source,'+1/+1',2);
    assert.equal(await f.game.activateAbility(f.a,f.game.activatableList(f.a).find(row=>row.card===source)),true);await settle(f.game);assert.equal(source.power,6);assert.equal(source.toughness,toughness+2);
  });
  test(role+': changing only base toughness preserves power and counters',async()=>{
    const f=context(M,role),host=put(M,f.game,f.a,'Centaur Courser'),source=await cast(f,'Chariot of the Sun');f.game.addCounters(host,'+1/+1',2);
    assert.equal(await f.game.activateAbility(f.a,f.game.activatableList(f.a).find(row=>row.card===source)),true);await settle(f.game);assert.equal(host.power,5);assert.equal(host.toughness,3);assert.equal(host.kw('flying'),true);
  });
  test(role+': independent keyword gain and loss expire during cleanup',async()=>{
    const f=context(M,role),source=await cast(f,'Canopy Dragon');assert.equal(source.kw('trample'),true);
    assert.equal(await f.game.activateAbility(f.a,f.game.activatableList(f.a).find(row=>row.card===source)),true);await settle(f.game);assert.equal(source.kw('flying'),true);assert.equal(source.kw('trample'),false);
    f.game.mainPhase=async()=>{};f.game.combatPhase=async()=>{};await f.game.runTurn();assert.equal(source.kw('flying'),false);assert.equal(source.kw('trample'),true);
  });
  test(role+': temporary life gain and damage prevention prohibitions expire',async()=>{
    const f=context(M,role);const source=await cast(f,'Skullcrack');const life=f.b.life;
    await f.game.gainLife(f.b,2,source);assert.equal(f.b.life,life);
    f.game.untilEffects.push({kind:'oraclePreventNextAmount',target:f.b,remaining:10,direction:'to',expires:'eot'});await f.game.damageAny(source,f.b,2);assert.equal(f.b.life,life-2);
    f.game.mainPhase=async()=>{};f.game.combatPhase=async()=>{};await f.game.runTurn();await f.game.gainLife(f.b,2,source);assert.equal(f.b.life,life);
    f.game.untilEffects.push({kind:'oraclePreventNextAmount',target:f.b,remaining:10,direction:'to',expires:'eot'});await f.game.damageAny(source,f.b,2);assert.equal(f.b.life,life);
  });


  for(const discardedName of ['Forest','Grizzly Bears'])test(role+': Recruit distinguishes an actually discarded '+discardedName,async()=>{
    const f=context(M,role),top=put(M,f.game,f.a,discardedName,'library');await cast(f,'Long Lake Nuisance');
    assert.equal(top.zone,'graveyard');assert.equal(f.game.creatures(f.a).filter(c=>c.isToken&&c.hasSub('Human')&&c.hasSub('Soldier')).length,discardedName==='Forest'?0:1);
  });
  test(role+': Station uses paid crew power if that crew changes incarnation',async()=>{
    const f=context(M,role),source=await cast(f,'Galvanizing Sawship'),crew=put(M,f.game,f.a,'Centaur Courser');
    const action=f.game.activatableList(f.a).find(row=>row.card===source&&row.ability.label==='Station');assert.ok(action);
    assert.equal(await f.game.activateAbility(f.a,action),true);assert.equal(crew.tapped,true);
    await f.game.move(crew,'exile');await f.game.putPermanentOntoBattlefield(crew,f.a);f.game.addCounters(crew,'+1/+1',7);await settle(f.game);
    assert.equal(source.counters.charge,3);assert.equal(source.is('Creature'),true);assert.equal(source.kw('flying'),true);
  });
  test(role+': Station cannot put counters on a later source incarnation',async()=>{
    const f=context(M,role),source=await cast(f,'Galvanizing Sawship');put(M,f.game,f.a,'Centaur Courser');
    assert.equal(await f.game.activateAbility(f.a,f.game.activatableList(f.a).find(row=>row.card===source&&row.ability.label==='Station')),true);
    await f.game.move(source,'exile');await f.game.putPermanentOntoBattlefield(source,f.a);await settle(f.game);assert.equal(source.counters.charge||0,0);assert.equal(source.is('Creature'),false);
  });
  test(role+': Increment rechecks power and toughness when its paid-cast trigger resolves',async()=>{
    const f=context(M,role),source=await cast(f,'Hungry Graffalon'),spell=put(M,f.game,f.a,'Serra Angel','hand');fund(f.a);
    assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);await f.game.flushTriggers();assert.equal(f.game.stack.length,2);
    f.game.addCounters(source,'+1/+1',7);await settle(f.game);assert.equal(source.counters['+1/+1'],7);
  });
  test(role+': temporary Undying returns its exact graveyard identity only once',async()=>{
    const f=context(M,role),target=put(M,f.game,f.a,'Grizzly Bears');await cast(f,'Undying Evil');assert.equal(target.kw('undying'),true);
    await f.game.destroy(target);await settle(f.game);assert.equal(target.zone,'battlefield');assert.equal(target.counters['+1/+1'],1);assert.equal(target.kw('undying'),false);
    await f.game.destroy(target);await settle(f.game);assert.equal(target.zone,'graveyard');
  });
  test(role+': Shroud gained before Donate resolves invalidates the announced player',async()=>{
    const f=context(M,role),target=put(M,f.game,f.a,'Grizzly Bears'),spell=put(M,f.game,f.a,'Donate','hand');fund(f.a);
    assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);put(M,f.game,f.b,'True Believer');await settle(f.game);assert.equal(target.ctrl,f.a);
  });
  test(role+': Switcheroo cannot exchange only one legal target',async()=>{
    const f=context(M,role),own=put(M,f.game,f.a,'Grizzly Bears'),other=put(M,f.game,f.b,'Serra Angel'),spell=put(M,f.game,f.a,'Switcheroo','hand');fund(f.a);
    assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);await f.game.move(other,'exile');await f.game.putPermanentOntoBattlefield(other,f.b);await settle(f.game);assert.equal(own.ctrl,f.a);assert.equal(other.ctrl,f.b);
  });
  test(role+': damage-history targets expire on a new turn and a new object identity',async()=>{
    const f=context(M,role),dealer=put(M,f.game,f.b,'Grizzly Bears'),spell=put(M,f.game,f.a,'Reciprocate','hand'),spec=spell.def.targets[0];
    assert.equal(f.game.legalTargets(spec,spell,f.a).includes(dealer),false);await f.game.damageAny(dealer,f.a,1);assert.equal(f.game.legalTargets(spec,spell,f.a).includes(dealer),true);
    f.game.turnNo++;assert.equal(f.game.legalTargets(spec,spell,f.a).includes(dealer),false);await f.game.damageAny(dealer,f.a,1);await f.game.move(dealer,'exile');await f.game.putPermanentOntoBattlefield(dealer,f.b);assert.equal(f.game.legalTargets(spec,spell,f.a).includes(dealer),false);
  });
  test(role+': proliferating without eligible counters still triggers Scheming Aspirant',async()=>{
    const f=context(M,role);await cast(f,'Scheming Aspirant');await M.E.proliferate(f.game,f.a);await settle(f.game);assert.equal(f.a.life,42);assert.equal(f.b.life,38);
  });

  test(role+': Amplify reveals each shared-type hand card once without discarding it',async()=>{
    const f=context(M,role);chooseOptionalCards(f,'amplify-v9');
    const matching=put(M,f.game,f.a,'Aven Warhawk','hand'),unmatched=put(M,f.game,f.a,'Forest','hand');
    const source=await cast(f,'Aven Warhawk');assert.equal(source.counters['+1/+1'],1);assert.equal(matching.zone,'hand');assert.equal(unmatched.zone,'hand');
  });
  test(role+': Reconfigure pays to attach and detach and obeys sorcery timing',async()=>{
    const f=context(M,role),host=put(M,f.game,f.a,'Grizzly Bears'),source=await cast(f,'Armguard Familiar');
    const ability=()=>f.game.activatableList(f.a).find(row=>row.card===source&&row.ability?.label==='Reconfigure — attach');
    f.game.turnPlayer=f.b;assert.equal(ability(),undefined);f.game.turnPlayer=f.a;
    assert.equal(await f.game.activateAbility(f.a,ability()),true);await settle(f.game);assert.equal(source.is('Creature'),false);assert.equal(source.attachedTo,host.iid);assert.equal(host.cur.wardCost.mana,'{2}');
    const detach=f.game.activatableList(f.a).find(row=>row.card===source&&row.ability?.label==='Reconfigure — unattach');assert.equal(await f.game.activateAbility(f.a,detach),true);await settle(f.game);assert.equal(source.is('Creature'),true);assert.equal(host.cur.wardCost,null);
  });
  test(role+': Champion returns the exiled identity and cannot return a later incarnation',async()=>{
    const f=context(M,role);chooseOptionalCards(f,'champion-v9');
    const fodder=put(M,f.game,f.a,'Grizzly Bears');fodder.def={...fodder.def,power:'0',toughness:'1',cost:'{0}'};f.game.recalc();
    const source=await cast(f,'Changeling Titan');assert.equal(fodder.zone,'exile');await f.game.move(source,'exile');await settle(f.game);assert.equal(fodder.zone,'battlefield');
    await f.game.move(source,'hand');fund(f.a);assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await settle(f.game);assert.equal(fodder.zone,'exile');
    await f.game.move(fodder,'hand');await f.game.move(fodder,'exile');await f.game.move(source,'exile');await settle(f.game);assert.equal(fodder.zone,'exile');
  });
  test(role+': Devour captures actual sacrifices for an ETB draw after its source leaves',async()=>{
    const f=context(M,role);chooseOptionalCards(f,'devour-v9');
    for(let i=0;i<2;i++){const c=put(M,f.game,f.a,'Grizzly Bears');c.def={...c.def,power:'0',toughness:'1',cost:'{0}'};}f.game.recalc();
    const source=put(M,f.game,f.a,'Skullmulcher','hand');fund(f.a);assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await f.game.resolveTop();await f.game.flushTriggers();
    const count=source.meta.oracleDevoured,library=f.a.library.length;assert.ok(count>0);await f.game.move(source,'exile');await settle(f.game);assert.equal(f.a.library.length,library-count);
  });
  test(role+': Recover ignores opponent deaths and cannot recover a different graveyard incarnation',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Grim Harvest','graveyard');fund(f.a);
    await f.game.destroy(put(M,f.game,f.b,'Grizzly Bears'));await f.game.flushTriggers();assert.equal(f.game.stack.length,0);
    await f.game.destroy(put(M,f.game,f.a,'Grizzly Bears'));await f.game.flushTriggers();assert.equal(f.game.stack.length,1);
    await f.game.move(source,'hand');await f.game.move(source,'graveyard');await settle(f.game);assert.equal(source.zone,'graveyard');
  });
  test(role+': Mayhem respects Flash and expires when the discarded card changes zones',async()=>{
    const f=context(M,role),flash=put(M,f.game,f.a,'Swarm, Being of Bees','hand'),slow=put(M,f.game,f.a,'Raging Goblinoids','hand');fund(f.a);
    await f.game.discard(f.a,[flash,slow]);f.game.turnPlayer=f.b;
    const offers=f.game.castableList(f.a);assert.ok(offers.some(row=>row.card===flash&&row.alt?.mayhem));assert.equal(offers.some(row=>row.card===slow),false);
    const alt=offers.find(row=>row.card===flash).alt;assert.equal(await f.game.castSpell(f.a,flash,{from:'graveyard',alt}),true);await settle(f.game);assert.equal(flash.zone,'battlefield');
    await f.game.move(flash,'graveyard');assert.equal(f.game.castableList(f.a).some(row=>row.card===flash),false);
  });
  test(role+': granted Ward counters an unpaid opposing spell and disappears with the provider',async()=>{
    const f=context(M,role),target=put(M,f.game,f.b,'Grizzly Bears'),provider=put(M,f.game,f.b,'Giant Ankheg');
    assert.equal(target.cur.wardCost.mana,'{2}');const spell=put(M,f.game,f.a,'Shock','hand');f.a.pool.R=1;
    const decide=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=(g,q)=>q.type==='chooseTargets'?[target]:decide(g,q);
    assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);await settle(f.game);assert.equal(spell.zone,'graveyard');assert.equal(target.zone,'battlefield');assert.equal(target.damage,0);
    await f.game.move(provider,'exile');assert.equal(target.cur.wardCost,null);
  });
  test(role+': half-library attack uses the captured defender and rounds an odd library up',async()=>{
    const f=context(M,role,2),source=put(M,f.game,f.a,'Terisian Mindbreaker');put(M,f.game,f.b,'Forest','library');
    source.attacking=f.b;await f.game.emit('attacks',{card:source,player:f.a,defender:f.b});await f.game.flushTriggers();
    assert.equal(f.game.stack.length,1);source.attacking=f.others[1];await f.game.move(source,'exile');await settle(f.game);
    assert.equal(f.b.library.length,15);assert.equal(f.b.graveyard.length,16);assert.equal(f.others[1].library.length,30);
    assertGameStateInvariants(f.game);
  });
  test(role+': an X-cost Fractal gets counters before state-based actions can kill its 0/0 token',async()=>{
    const f=context(M,role),spell=put(M,f.game,f.a,'Fractal Summoning','hand');fund(f.a);
    assert.equal(await f.game.castSpell(f.a,spell,{from:'hand',xVal:4}),true);await settle(f.game);
    const token=f.game.creatures(f.a).find(c=>c.isToken&&c.hasSub('Fractal'));assert.ok(token);assert.equal(token.counters['+1/+1'],4);assert.equal(token.power,4);assert.equal(token.toughness,4);
    assertGameStateInvariants(f.game);
  });
  test(role+': granted Infect changes actual player and creature damage and ends at cleanup',async()=>{
    const f=context(M,role),attacker=put(M,f.game,f.b,'Grizzly Bears');await cast(f,'Tainted Strike');assert.equal(attacker.kw('infect'),true);
    const life=f.a.life;await f.game.damageAny(attacker,f.a,1);assert.equal(f.a.life,life);assert.equal(f.a.poison,1);
    const victim=put(M,f.game,f.a,'Serra Angel');await f.game.damageAny(attacker,victim,1);assert.equal(victim.counters['-1/-1'],1);assert.equal(victim.damage,0);
    f.game.mainPhase=async()=>{};f.game.combatPhase=async()=>{};await f.game.runTurn();assert.equal(attacker.kw('infect'),false);
    assertGameStateInvariants(f.game);
  });
  test(role+': an exiled damaged creature still satisfies the damage condition using its battlefield identity',async()=>{
    const f=context(M,role),victim=put(M,f.game,f.b,'Serra Angel'),dealer=put(M,f.game,f.b,'Grizzly Bears');
    await f.game.damageAny(dealer,victim,1);await f.game.move(dealer,'exile');await cast(f,'Sold Out');
    assert.equal(victim.zone,'exile');assert.equal(f.game.bf().filter(c=>c.ctrl===f.a&&c.isToken&&c.hasSub('Clue')).length,1);
    assertGameStateInvariants(f.game);
  });
  test(role+': off-turn casting checks the caster rather than the trigger controller',async()=>{
    const f=context(M,role);put(M,f.game,f.a,'Scytheclaw Raptor');
    await cast(f,'Opt');assert.equal(f.a.life,40);
    f.game.turnPlayer=f.b;await cast(f,'Opt');assert.equal(f.a.life,36);assert.equal(f.b.life,40);
    assertGameStateInvariants(f.game);
  });
  test(role+': an upkeep condition is checked for that player both at triggering and resolution',async()=>{
    const f=context(M,role);put(M,f.game,f.a,'Spiritual Sanctuary');const plains=put(M,f.game,f.b,'Plains');
    await f.game.emit('upkeep',{player:f.b});await f.game.flushTriggers();assert.equal(f.game.stack.length,1);
    await f.game.move(plains,'exile');await settle(f.game);assert.equal(f.b.life,40);
    await f.game.putPermanentOntoBattlefield(plains,f.b);await f.game.emit('upkeep',{player:f.b});await settle(f.game);assert.equal(f.b.life,41);assert.equal(f.a.life,40);
    await f.game.emit('upkeep',{player:f.a});await f.game.flushTriggers();assert.equal(f.game.stack.length,0);
  });
  test(role+': half-life upkeep rounds up and retains the actual upkeep player',async()=>{
    const f=context(M,role,2);put(M,f.game,f.a,'Havoc Festival');f.b.life=31;
    await f.game.emit('upkeep',{player:f.b});await settle(f.game);assert.equal(f.b.life,15);assert.equal(f.a.life,40);assert.equal(f.others[1].life,40);
  });
  test(role+': Endure creates a Spirit if the source left before its trigger resolves',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Dusyut Earthcarver','hand');fund(f.a);
    assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await f.game.resolveTop();await f.game.flushTriggers();assert.equal(f.game.stack.length,1);
    await f.game.move(source,'exile');await settle(f.game);const token=f.game.creatures(f.a).find(c=>c.isToken&&c.hasSub('Spirit'));
    assert.ok(token);assert.equal(token.power,3);assert.equal(token.toughness,3);assert.equal(source.counters['+1/+1']||0,0);
  });
  test(role+': alternate victory checks the real life total and eliminates every opponent',async()=>{
    const f=context(M,role,2);put(M,f.game,f.a,'Near-Death Experience');
    await f.game.emit('upkeep',{player:f.a});await f.game.flushTriggers();assert.equal(f.game.stack.length,0);
    f.a.life=1;await f.game.emit('upkeep',{player:f.a});await f.game.flushTriggers();assert.equal(f.game.stack.length,1);await settle(f.game);assert.ok(f.others.every(p=>p.lost));assert.equal(f.a.lost,false);
  });
  test(role+': daybound follows the previous active player and enters transformed at night',async()=>{
    const f=context(M,role),source=await cast(f,'Tavern Ruffian // Tavern Smasher');
    assert.equal(f.game.bomDayNight,'day');assert.equal(source.oracleFace,'front');const version=source.zoneVersion;
    f.game.bomPreviousActive=f.a.idx;f.a.lastTurnSpellsCast=0;f.b.lastTurnSpellsCast=3;
    await f.game.bomUpdateDayNight();assert.equal(source.oracleFace,'back');assert.equal(source.zoneVersion,version);
    f.a.lastTurnSpellsCast=1;await f.game.bomUpdateDayNight();assert.equal(source.oracleFace,'back');
    f.a.lastTurnSpellsCast=2;await f.game.bomUpdateDayNight();assert.equal(source.oracleFace,'front');
    await f.game.move(source,'hand');f.a.lastTurnSpellsCast=0;await f.game.bomUpdateDayNight();
    fund(f.a);assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await settle(f.game);assert.equal(source.oracleFace,'back');
    assertGameStateInvariants(f.game);
  });
  test(role+': tapping a land for mana leaves its damage trigger on the Stack',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Manabarbs'),land=put(M,f.game,f.b,'Forest');
    const mana=f.game.manaSources(f.b).find(row=>row.card===land),life=f.b.life;
    assert.equal(await f.game.activateManaSource(f.b,mana,mana.produce[0],null,[]),true);
    assert.equal(f.b.pool.G,1);assert.equal(f.b.life,life);await f.game.flushTriggers();
    await f.game.move(source,'exile');await settle(f.game);assert.equal(f.b.life,life-1);assert.equal(f.a.life,40);
  });
  test(role+': a graveyard-owner trigger uses the owner of a stolen permanent',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Liability'),card=put(M,f.game,f.b,'Grizzly Bears');card.ctrl=f.a;f.game.recalc();
    const before=[f.a.life,f.b.life];await f.game.move(card,'graveyard');await f.game.flushTriggers();await f.game.move(source,'exile');await settle(f.game);
    assert.deepEqual([f.a.life,f.b.life],[before[0],before[1]-1]);assert.ok(f.b.graveyard.includes(card));
  });
  test(role+': an alternative sacrifice filter excludes the source only in its printed creature branch',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Mold Folk');fund(f.a);
    assert.equal(f.game.activatableList(f.a).some(row=>row.card===source),false);
    const artifact=put(M,f.game,f.a,'Bonesplitter'),row=f.game.activatableList(f.a).find(row=>row.card===source);assert.ok(row);
    assert.equal(await f.game.activateAbility(f.a,row),true);assert.equal(artifact.zone,'graveyard');assert.equal(source.zone,'battlefield');assert.equal(source.counters['+1/+1']||0,0);
    await settle(f.game);assert.equal(source.counters['+1/+1'],1);
  });
  test(role+': a graveyard ability must exile seven other cards before returning Bone Dragon',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Bone Dragon','graveyard');fund(f.a);
    for(let i=0;i<6;i++)put(M,f.game,f.a,'Forest','graveyard');
    assert.equal(f.game.activatableList(f.a).some(row=>row.card===source),false);
    put(M,f.game,f.a,'Island','graveyard');const row=f.game.activatableList(f.a).find(row=>row.card===source);assert.ok(row);
    assert.equal(await f.game.activateAbility(f.a,row),true);assert.equal(source.zone,'graveyard');assert.equal(f.a.exile.length,7);
    await settle(f.game);assert.equal(source.zone,'battlefield');assert.equal(source.tapped,true);assertGameStateInvariants(f.game);
  });
  test(role+': separate discard batches retain their own exact card counts',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Marauding Mako');
    const first=['Forest','Island','Mountain'].map(name=>put(M,f.game,f.a,name,'hand'));
    await f.game.discard(f.a,first);
    const next=put(M,f.game,f.a,'Plains','hand');await f.game.discard(f.a,[next]);
    await f.game.flushTriggers();
    assert.equal(f.game.stack.filter(row=>row.srcCard===source).length,2);
    await f.game.resolveTop();assert.ok([1,3].includes(source.counters['+1/+1']));
    await settle(f.game);assert.equal(source.counters['+1/+1'],4);
    assertGameStateInvariants(f.game);
  });
  test(role+': a simultaneous entry trigger counts only matching artifacts after its source leaves',async()=>{
    const f=context(M,role,2),source=put(M,f.game,f.a,'Ingenious Artillerist');
    const own=['Bonesplitter','Sol Ring'].map(name=>put(M,f.game,f.a,name,'hand'));
    const other=put(M,f.game,f.b,'Bonesplitter','hand'),creature=put(M,f.game,f.a,'Grizzly Bears','hand');
    const life=Array.from(f.game.players,p=>p.life);
    await f.game.withBattlefieldEntryBatch(async()=>{for(const card of [...own,other,creature])await f.game.move(card,'battlefield',{ctrl:card.owner});});
    await f.game.flushTriggers();assert.equal(f.game.stack.filter(row=>row.srcCard===source).length,1);
    await f.game.move(source,'exile');await f.game.move(own[1],'exile');await settle(f.game);
    assert.deepEqual(Array.from(f.game.players,(p,i)=>p.life-life[i]),[0,-2,-2]);
    assertGameStateInvariants(f.game);
  });
  test(role+': a Sliver attack keeps its defending player after both battlefield references change',async()=>{
    const f=context(M,role,2),source=put(M,f.game,f.a,'Leeching Sliver');
    const attacker=new M.CardInst({...M.DEFS['Grizzly Bears'],name:'Sliver witness',subtypes:['Sliver']},f.a);
    attacker.zone='battlefield';attacker.sick=false;f.game.battlefield.push(attacker);f.game.recalc();
    const life=Array.from(f.game.players,p=>p.life);attacker.attacking=f.b;
    await f.game.emit('attacks',{card:attacker,player:f.a,defender:f.b});
    attacker.attacking=f.others[1];await f.game.move(source,'exile');await settle(f.game);
    assert.deepEqual(Array.from(f.game.players,(p,i)=>p.life-life[i]),[0,-1,0]);
    assertGameStateInvariants(f.game);
  });
  test(role+': setting a life total uses a real life-gain event',async()=>{
    const f=context(M,role),events=[],emit=f.game.emit.bind(f.game);
    f.game.emit=async(event,data)=>{if(event==='lifeGain')events.push({player:data.player,n:data.n});return emit(event,data);};
    f.a.life=3;f.b.life=3;await cast(f,'Blessed Wind');
    const target=f.trace.find(row=>row.q.type==='chooseTargets').result[0];
    assert.equal(target.life,20);assert.ok(events.some(event=>event.player===target&&event.n===17));
  });
  test(role+': exiling a card from a hand lets its owner choose the real card',async()=>{
    const f=context(M,role),cards=['Forest','Island','Mountain'].map(name=>put(M,f.game,f.b,name,'hand'));
    await cast(f,'Unscrupulous Agent');
    assert.equal(f.b.hand.length,2);assert.equal(cards.filter(card=>card.zone==='exile').length,1);
    assert.equal(f.b.exile.length,1);assert.equal(f.a.exile.length,0);
  });
  test(role+': an Equipment attachment fails against protection from artifacts',async()=>{
    const f=context(M,role),equipment=put(M,f.game,f.a,'Bonesplitter'),host=put(M,f.game,f.b,'Tel-Jilad Chosen');
    await cast(f,'Magnetic Theft');
    assert.equal(equipment.attachedTo,null);assert.equal(host.attachments.length,0);
    assert.equal(equipment.ctrl===f.a,true);assert.equal(equipment.owner===f.a,true);
  });
  test(role+': sacrificing every creature includes foreign-owned creatures under the same controller',async()=>{
    const f=context(M,role),own=put(M,f.game,f.a,'Grizzly Bears'),foreign=put(M,f.game,f.b,'Grizzly Bears'),opposing=put(M,f.game,f.b,'Grizzly Bears');
    foreign.ctrl=f.a;f.game.recalc();await cast(f,'Death Pit Offering');
    assert.equal(own.zone,'graveyard');assert.equal(foreign.zone,'graveyard');assert.equal(opposing.zone,'battlefield');
    assert.ok(f.b.graveyard.includes(foreign));assertGameStateInvariants(f.game);
  });
  test(role+': a card put second from the top leaves the existing top card unchanged',async()=>{
    const f=context(M,role),creature=put(M,f.game,f.b,'Grizzly Bears'),oldTop=f.b.library.at(-1);
    await cast(f,'Chronostutter');assert.equal(creature.zone,'library');
    assert.equal(f.b.library.at(-1)===oldTop,true);assert.equal(f.b.library.at(-2)===creature,true);
  });
  test(role+': Time Stretch schedules exactly two turns for its announced player',async()=>{
    const f=context(M,role);await cast(f,'Time Stretch');
    const target=f.trace.find(row=>row.q.type==='chooseTargets').result[0];
    assert.deepEqual(Array.from(f.game.extraTurns,p=>p.idx),[target.idx,target.idx]);
  });
  test(role+': discard-your-hand is paid before the counter ability resolves',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Null Brooch'),cards=['Forest','Island','Mountain'].map(name=>put(M,f.game,f.a,name,'hand'));
    const spell=put(M,f.game,f.b,'Opt','hand');fund(f.b);fund(f.a);
    assert.equal(await f.game.castSpell(f.b,spell,{from:'hand'}),true);
    const row=f.game.activatableList(f.a).find(row=>row.card===source);assert.ok(row);
    assert.equal(await f.game.activateAbility(f.a,row),true);
    assert.equal(f.a.hand.length,0);assert.ok(cards.every(card=>card.zone==='graveyard'));assert.equal(source.tapped,true);assert.equal(spell.zone,'stack');
    await settle(f.game);assert.equal(spell.zone,'graveyard');
  });
  test(role+': the untap symbol requires a tapped source and obeys summoning sickness',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Safehold Sentry');fund(f.a);
    const action=()=>f.game.activatableList(f.a).find(row=>row.card===source);
    assert.equal(action(),undefined,'an untapped permanent cannot pay Q');
    source.tapped=true;source.sick=true;assert.equal(action(),undefined,'a summoning-sick creature cannot pay Q');
    source.sick=false;const row=action();assert.ok(row);
    const toughness=source.toughness,mana=Object.values(f.a.pool).reduce((sum,n)=>sum+n,0);
    assert.equal(await f.game.activateAbility(f.a,row),true);
    assert.equal(source.tapped,false,'untapping is paid before resolution');
    assert.equal(source.toughness,toughness,'effect waits on the Stack');
    assert.equal(mana-Object.values(f.a.pool).reduce((sum,n)=>sum+n,0),3);
    assert.equal(action(),undefined,'the same untapped source cannot pay again');
    await settle(f.game);assert.equal(source.toughness,toughness+2);
    assertGameStateInvariants(f.game);
  });
  test(role+': Mystic Genesis remembers a countered spell mana value including its paid X',async()=>{
    const f=context(M,role),spell=put(M,f.game,f.b,"Red Sun's Zenith",'hand');fund(f.b);
    f.game.turnPlayer=f.b;
    assert.equal(await f.game.castSpell(f.b,spell,{from:'hand',xVal:4}),true);
    const target=f.game.stack.find(row=>row.card===spell);
    assert.equal(f.game.stackSpellManaValue(target),5);
    await cast(f,'Mystic Genesis');
    assert.equal(spell.zone,'graveyard');
    const ooze=f.game.creatures(f.a).find(card=>card.isToken&&card.hasSub('Ooze'));
    assert.ok(ooze);assert.equal(ooze.power,5);assert.equal(ooze.toughness,5);
    assertGameStateInvariants(f.game);
  });
  test(role+': Converge remembers the five paid colors after its ETB source leaves',async()=>{
    const f=context(M,role,2),source=put(M,f.game,f.a,'Radiant Epicure','hand');
    for(const color of ['W','U','B','R','G'])f.a.pool[color]=1;f.a.pool.C=0;
    const life=Array.from(f.game.players,p=>p.life);
    assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);
    assert.equal(Object.values(f.a.pool).reduce((sum,n)=>sum+n,0),0);
    await f.game.resolveTop();await f.game.flushTriggers();
    assert.equal(source.zone,'battlefield');assert.ok(f.game.stack.length);
    await f.game.move(source,'exile');await settle(f.game);
    assert.deepEqual(Array.from(f.game.players,(p,i)=>p.life-life[i]),[5,-5,-5]);
    assertGameStateInvariants(f.game);
  });
  test(role+': a source-shuffling spell keeps its target separate from its own library move',async()=>{
    const f=context(M,role),life=f.b.life;
    const source=await cast(f,'Beacon of Destruction');
    const selected=f.trace.find(row=>row.q.type==='chooseTargets').result[0];
    assert.ok([f.a,f.b].includes(selected));assert.equal(selected.life,life-5);
    assert.equal(source.zone,'library');assert.ok(f.a.library.includes(source));
    assert.equal(f.b.library.length,30);
  });
  test(role+': a group library move includes an Aura and its enchanted host without a graveyard detour',async()=>{
    const f=context(M,role);
    const host=put(M,f.game,f.b,'Eidolon of Blossoms'),aura=put(M,f.game,f.a,'Rancor');
    await f.game.attach(aura,host);
    const moves=[],move=f.game.move.bind(f.game);
    f.game.move=async(card,zone,opts)=>{moves.push({card,zone});return move(card,zone,opts);};
    await cast(f,'Harmonic Convergence');
    assert.equal(host.zone,'library');assert.equal(aura.zone,'library');
    assert.equal(f.b.library.at(-1),host);assert.equal(f.a.library.at(-1),aura);
    assert.equal(moves.some(row=>[host,aura].includes(row.card)&&row.zone==='graveyard'),false);
    assertGameStateInvariants(f.game);
  });
  test(role+': a global bottom-library instruction preserves ownership and lets each owner order cards',async()=>{
    const f=context(M,role);
    const own=[put(M,f.game,f.a,'Grizzly Bears'),put(M,f.game,f.a,'Llanowar Elves')];
    const foreign=put(M,f.game,f.b,'Serra Angel');foreign.ctrl=f.a;f.game.recalc();
    await cast(f,'Hallowed Burial');
    assert.ok(own.every(card=>card.zone==='library'&&f.a.library.slice(0,2).includes(card)));
    assert.equal(f.b.library[0],foreign);assert.equal(f.game.creatures().length,0);
    assertGameStateInvariants(f.game);
  });
  test(role+': keyword loss ends at real cleanup and never survives a new incarnation',async()=>{
    const f=context(M,role),target=put(M,f.game,f.b,'Serra Angel');
    assert.equal(target.kw('flying'),true);
    await cast(f,'Canopy Claws');assert.equal(target.kw('flying'),false);
    f.game.mainPhase=async()=>{};f.game.combatPhase=async()=>{};await f.game.runTurn();
    assert.equal(target.kw('flying'),true);
    f.game.turnPlayer=f.a;f.game.phase='main1';f.game.step='main';
    await cast(f,'Canopy Claws');assert.equal(target.kw('flying'),false);
    await f.game.move(target,'hand');await f.game.putPermanentOntoBattlefield(target,f.b);
    assert.equal(target.kw('flying'),true);
    assertGameStateInvariants(f.game);
  });
  test(role+': drawing for each other player preserves individual draw triggers',async()=>{
    const f=context(M,role,2);await cast(f,'Sheoldred, the Apocalypse');
    const life=f.game.players.map(p=>p.life),hands=f.game.players.map(p=>p.hand.length);
    await cast(f,'Words of Wisdom');
    assert.deepEqual(Array.from(f.game.players,(p,i)=>p.hand.length-hands[i]),[2,1,1]);
    assert.deepEqual(Array.from(f.game.players,(p,i)=>p.life-life[i]),[4,-2,-2]);
    assertGameStateInvariants(f.game);
  });
  test(role+': an optional self fight uses the new permanent and deals damage simultaneously',async()=>{
    const f=context(M,role),target=put(M,f.game,f.b,'Grizzly Bears');
    const source=await cast(f,'Affectionate Indrik');
    assert.equal(target.zone,'graveyard');assert.equal(source.zone,'battlefield');
    assert.equal(source.damage,2);assert.equal(source.power,4);
  });
  test(role+': a paid initiative creature takes the initiative and enters Undercity',async()=>{
    const f=context(M,role),card=await cast(f,'Aarakocra Sneak');
    assert.equal(card.zone,'battlefield');
    assert.equal(f.game.initiative,f.a);
    assert.equal(f.a.afcDungeon.key,'undercity');
    assert.equal(f.a.afcDungeon.room,'entrance');
    assert.equal(f.b.afcDungeon,undefined);
    await f.game.move(card,'exile');
    assert.equal(f.game.initiative,f.a,'initiative persists after the source leaves');
  });
  test(role+': a paid venture creature enters a legal dungeon and queues its room',async()=>{
    const f=context(M,role),card=await cast(f,'Veteran Dungeoneer');
    assert.equal(card.zone,'battlefield');
    assert.ok(['mine','mage','tomb'].includes(f.a.afcDungeon.key));
    assert.ok(f.a.afcDungeon.room);
    assert.equal(f.b.afcDungeon,undefined);
    assert.equal(f.game.pendingTriggers.length,0);
  });
  test(role+': Mindslicer discards every hand through its actual death trigger',async()=>{
    const f=context(M,role,2);
    const hands=f.game.players.map(p=>[put(M,f.game,p,'Forest','hand'),put(M,f.game,p,'Llanowar Elves','hand')]);
    const source=await cast(f,'Mindslicer');
    await f.game.destroy(source);await settle(f.game);
    for(const [i,p]of f.game.players.entries()){
      assert.equal(p.hand.length,0);
      assert.ok(hands[i].every(c=>c.zone==='graveyard'));
    }
    assertGameStateInvariants(f.game);
  });
  test(role+': a legendary short self name retains the correct damage source',async()=>{
    const f=context(M,role,2),source=await cast(f,'Purphoros, God of the Forge');
    const before=f.others.map(p=>p.life),own=f.a.life;
    await cast(f,'Llanowar Elves');
    assert.deepEqual(f.others.map(p=>p.life),before.map(life=>life-2));
    assert.equal(f.a.life,own);
    assert.equal(source.zone,'battlefield');
  });
}
