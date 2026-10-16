import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadEngine } from './helpers/load-engine.mjs';
const M = loadEngine();
const plain = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const events = [], game = new M.Game({seed: 57291, paced: false, onEvent: event => events.push(event)});
  const decide = async (_g, q) => q.type === 'priority' ? {kind:'pass'}
    : q.type === 'chooseOption' ? q.options[0].key
    : q.type === 'chooseTargets' ? q.candidates.slice(0, q.max || 1)
    : q.type === 'orderTriggers' ? q.triggers : [];
  const player = game.addPlayer('Caster', {name:'Test deck'}, {decide}, false);
  const opponent = game.addPlayer('Opponent', {name:'Test deck'}, {decide}, false);
  game.turnPlayer = player; game.turnNo = 4; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {};
  const card = ({kws=[], power=3, toughness=3, name='Audio fixture', types=['Creature'], cost='{3}', owner=player, ...rest}={}) => {
    const c = new M.CardInst({name,cost,types,subtypes:[],kws,power,toughness,...rest},owner);
    c.zone='battlefield'; c.sick=false; game.battlefield.push(c); game.recalc(); return c;
  };
  const facts = () => events.filter(event => event.audioFacts).map(event => ({kind:event.kind,...plain(event.audioFacts)}));
  const keywords = () => facts().flatMap(event => event.keywords || []);
  return {game,player,opponent,card,events,facts,keywords};
}

test('actual damage and life gain facts exclude prevented damage and forbidden life gain', async () => {
  const f=fixture(), source=f.card({kws:['lifelink']});
  f.game.untilEffects.push({kind:'preventAllCombat'});
  await f.game.damagePlayer(source,f.opponent,15,{combat:true});
  assert.equal(f.facts().length,0); assert.equal(f.player.life,40); assert.equal(f.opponent.life,40);
  f.game.untilEffects=[];
  await f.game.damagePlayer(source,f.opponent,15,{combat:true});
  assert.ok(f.facts().some(row=>row.actualDamageToPlayer===15));
  assert.ok(f.facts().some(row=>row.lifeBefore===40&&row.lifeAfter===55&&row.lifeGained===15));
  assert.ok(f.keywords().includes('lifelink'));
  f.events.length=0; f.game.untilEffects.push({kind:'lifeGainProhibitionV9',players:[f.player]});
  await f.game.damagePlayer(source,f.opponent,2,{combat:true});
  assert.equal(f.keywords().includes('lifelink'),false); assert.equal(f.player.life,55);
});

test('life replacements report the actual gain and never produce identity-bearing facts', async () => {
  const f=fixture();
  // Use the standard public replacement interface; no event should contain source definitions.
  const original=f.game.replacers.bind(f.game);
  f.game.replacers=kind=>kind==='lifegain'?[{key:'double',ctrl:f.player,run:async(_g,n)=>n*2}]:original(kind);
  await f.game.gainLife(f.player,7);
  assert.deepEqual(f.facts().find(row=>row.kind==='lifeGain'),{kind:'lifeGain',lifeBefore:40,lifeAfter:54,lifeGained:14});
});

test('deathtouch sound follows an actual death, never indestructible or regenerated survival', async () => {
  for (const protection of ['none','indestructible','regenerate']) {
    const f=fixture(), source=f.card({kws:['deathtouch']}), target=f.card({owner:f.opponent,toughness:8,kws:protection==='indestructible'?['indestructible']:[]});
    if(protection==='regenerate')target.regenShield=1;
    await f.game.damageCreature(source,target,1);
    assert.equal(f.keywords().includes('deathtouch'),protection==='none');
    assert.equal(target.zone,protection==='none'?'graveyard':'battlefield');
    if(protection!=='none') {
      target.def={...target.def,kws:[]}; f.game.recalc(); f.events.length=0;
      const hidden=f.card({kws:['deathtouch']}); hidden.faceDown=true;
      await f.game.damageCreature(hidden,target,1);
      assert.equal(f.keywords().includes('deathtouch'),false,'old public deathtouch cannot label a later hidden source');
    }
  }
});

test('infect and wither facts represent real damage while face-down sources stay silent', async () => {
  for (const keyword of ['infect','wither']) {
    const f=fixture(), source=f.card({kws:[keyword]}), target=f.card({owner:f.opponent,toughness:8});
    await f.game.damageCreature(source,target,1);
    assert.ok(f.keywords().includes(keyword)); assert.equal(target.counters['-1/-1'],1);
    source.faceDown=true; f.events.length=0;
    await f.game.damageCreature(source,target,1);
    assert.deepEqual(f.keywords(),[]);
  }
});

test('post-wipe facts count actual departures despite a suppressed move', async () => {
  const f=fixture(), doomed=Array.from({length:5},()=>f.card()), survivor=f.card({kws:['indestructible']});
  const original=f.game.move.bind(f.game);
  f.game.move=async (card,zone,opts)=>card===doomed[0]&&zone==='graveyard'?undefined:original(card,zone,opts);
  await f.game.destroyMany([...doomed,survivor]);
  assert.equal(f.events.find(event=>event.kind==='boardWipe').count,5);
  assert.equal(f.facts().find(row=>row.kind==='boardWipeResolved').removedCount,4);
  assert.equal(survivor.zone,'battlefield'); assert.equal(doomed[0].zone,'battlefield');
  f.events.length=0;
  const exiled=Array.from({length:4},()=>f.card()); await f.game.exileMany(exiled);
  assert.equal(f.facts().find(row=>row.kind==='boardWipeResolved').removedCount,4);
});

test('damage wipe completion is counted after state-based departures', async () => {
  const f=fixture(), source=f.card(), victims=Array.from({length:5},()=>f.card({owner:f.opponent,toughness:1}));
  await f.game.damageBatch(victims.map(target=>({src:source,target,n:1})));
  assert.equal(f.facts().find(row=>row.kind==='boardWipeResolved').removedCount,5);
});

test('token batch facts count creature tokens after replacements and exclude noncreatures and spell copies', async () => {
  const f=fixture(), creature={name:'Fixture Soldier',types:['Creature'],subtypes:['Soldier'],power:1,toughness:1,kws:[],cost:''};
  const clue={name:'Fixture Clue',types:['Artifact'],subtypes:['Clue'],cost:''};
  await f.game.makeTokens([creature,creature,clue],f.player);
  assert.equal(f.facts().find(row=>row.kind==='tokenCreation').creatureTokensCreated,2);
  f.events.length=0; await f.game.makeTokens(creature,f.player,{fromSpellCopy:true});
  assert.equal(f.facts().some(row=>row.kind==='tokenCreation'),false);
});

test('arrival facts retain event-time power after the permanent changes', async () => {
  const f=fixture(), source=f.card({power:11,toughness:12});
  await f.game.move(source,'hand'); f.events.length=0; await f.game.move(source,'battlefield');
  const event=f.events.find(event=>event.type==='battlefieldArrival');
  assert.equal(event.audioFacts.power,11); assert.equal(event.audioFacts.toughness,12);
  source.cur.power=1; source.cur.toughness=1;
  assert.equal(event.audioFacts.power,11); assert.ok(Object.isFrozen(event.audioFacts));
});

test('public fact sanitizer rejects objects, strings, nonfinite numbers, and unlisted keywords', () => {
  assert.deepEqual(plain(M.sanitizeAudioFacts({keywords:['flying','flying','secret-card-name',{}],power:12,
    lifeGained:Infinity,removedCount:'5',source:{name:'Private'},privateName:'Private'})),{keywords:['flying'],power:12});
});

test('Live forwards immutable facts equally to both seats once and sanitizes the wire payload', async () => {
  const f=fixture(), received=[[],[]]; f.player.onlineSeat=0; f.opponent.onlineSeat=1;
  class UI { render(){} resolvePending(){} resolvePendingEntry(){} skipReactWindow(){} queueRender(){} showGameEffect(){} showBattlefieldArrival(){} }
  const live={...M,UI,audio:{attach(){},unlock(){},handle(event,view){if(event.audioFacts)received[view.viewer.onlineSeat].push(plain(event.audioFacts));}}};
  const env={MTG:live,window:{},location:{href:'http://localhost/'},document:{querySelector:()=>({style:{}}),body:{classList:{add(){}}}}};
  vm.runInNewContext(readFileSync(new URL('../src/modules/multiplayer-arena.js',import.meta.url),'utf8'),env);
  const session=(seat,authority)=>live.createOnlineArena({authority,ui:new UI(),client:{current:()=>({you:seat}),subscribe:()=>()=>{}}});
  const local=session(0,f.game),remote=session(1,null),snapshot=()=>plain(M.onlineGameViewFor(f.game,f.opponent));
  local.updateLocal(); remote.updateSnapshot(snapshot()); f.game.onEvent=event=>local.publishEvent(event);
  await f.game.gainLife(f.player,10);
  local.publishEvent({type:'gameEffect',kind:'damage',audioFacts:{actualDamageToPlayer:15,keywords:['trample','private'],source:f.player,secret:'x',power:Infinity}});
  remote.updateSnapshot(snapshot());
  assert.deepEqual(received[0],received[1]); assert.equal(received[0].length,2);
  assert.deepEqual(received[0][1],{keywords:['trample'],actualDamageToPlayer:15});
  remote.updateSnapshot(snapshot()); remote.eventCursor=null; remote.updateSnapshot(snapshot());
  assert.equal(received[1].length,2,'snapshot refresh/reconnect does not replay narration');
});

test('presentation facts do not consume gameplay randomness', async () => {
  const a=fixture(),b=fixture();
  await a.game.gainLife(a.player,11); await b.game.gainLife(b.player,11);
  a.game.note('combat',{kind:'attackersDeclared',audioFacts:{keywords:['flying','haste']}});
  assert.equal(a.game.rnd(),b.game.rnd());
});

async function combat(f, attacker, blockers=[]) {
  const a=f.player.controller.decide,b=f.opponent.controller.decide;
  f.player.controller.decide=(g,q)=>q.type==='attackers'?[{card:attacker,target:f.opponent}]:a(g,q);
  f.opponent.controller.decide=(g,q)=>q.type==='blockers'?blockers.map(blocker=>({blocker,attacker})):b(g,q);
  await f.game.combatPhase(f.player);
}

test('native legal attack and block declarations snapshot active keywords', async () => {
  const f=fixture(), attacker=f.card({kws:['flying','vigilance','menace','haste'],toughness:8}); attacker.sick=true;
  const blockers=[f.card({owner:f.opponent,kws:['reach'],power:1,toughness:5}),f.card({owner:f.opponent,kws:['reach'],power:1,toughness:5})];
  await combat(f,attacker,blockers);
  assert.deepEqual(f.facts().find(row=>row.kind==='attackersDeclared').keywords,['flying','vigilance','menace','haste']);
  assert.deepEqual(f.facts().find(row=>row.kind==='blockersDeclared').keywords,['reach']);
  assert.equal(attacker.tapped,false);
});

test('haste is silent for a creature already eligible to attack without it', async () => {
  const f=fixture(), attacker=f.card({kws:['haste']}); await combat(f,attacker);
  assert.equal(f.keywords().includes('haste'),false);
});

test('first and double strike cues require positive damage after prevention', async () => {
  for(const keyword of ['first strike','double strike'])for(const prevented of [false,true]) {
    const f=fixture(), attacker=f.card({kws:[keyword],power:2});
    if(prevented)f.game.untilEffects.push({kind:'preventAllCombat'});
    await combat(f,attacker);
    const strikes=f.keywords().filter(word=>word===keyword.replace(' ','-'));
    assert.equal(strikes.length,prevented?0:keyword==='double strike'?2:1);
  }
});

test('trample sounds only when blocked combat damage actually spills to the assigned destination', async () => {
  for(const mode of ['overflow','unblocked','prevented','redirected']) {
    const f=fixture(), attacker=f.card({kws:['trample'],power:7,toughness:8}), blocker=f.card({owner:f.opponent,power:1,toughness:2});
    if(mode==='prevented')f.game.untilEffects.push({kind:'preventCombatToPlayer',who:f.opponent});
    if(mode==='redirected') {
      const sink=f.card({owner:f.opponent,toughness:20});
      f.game.untilEffects.push({kind:'redirectToCreature',who:f.opponent,iid:sink.iid,zoneVersion:sink.zoneVersion});
    }
    await combat(f,attacker,mode==='unblocked'?[]:[blocker]);
    assert.equal(f.keywords().includes('trample'),mode==='overflow',mode);
    if(mode==='overflow')assert.ok(f.facts().some(row=>row.actualDamageToPlayer===5));
  }
});

test('counter narration snapshots the public chosen spell mana value before leaving the stack', async () => {
  const f=fixture();
  const makeSpell=(faceDown=false)=>{
    const card=new M.CardInst({name:'X test spell',types:['Sorcery'],subtypes:[],kws:[],cost:'{X}{R}'},f.player);
    card.zone='stack'; card.faceDown=faceDown; card.castMeta={x:8,alt:{}};
    const so={kind:'spell',name:card.name,card,ctrl:f.player,x:8,castOpts:faceDown?{faceDownCast:true}:{}};
    f.game.stack.push(so); return so;
  };
  const so=makeSpell(); assert.equal(await f.game.counterStackObject(so),true);
  assert.equal(so.card.mv,1); assert.equal(f.facts().find(row=>row.kind==='counterspell').counteredSpellManaValue,9);
  f.events.length=0; assert.equal(await f.game.counterStackObject(so),false); assert.deepEqual(f.facts(),[]);
  await f.game.counterStackObject(makeSpell(true)); assert.deepEqual(f.facts(),[]);
});

test('proliferate facts require a completed public choice with eligible counters', async () => {
  const f=fixture(), target=f.card();
  await M.E.proliferate(f.game,f.player); assert.equal(f.keywords().includes('proliferate'),false);
  f.game.addCounters(target,'+1/+1',1); f.events.length=0;
  await M.E.proliferate(f.game,f.player);
  assert.equal(target.counters['+1/+1'],2); assert.ok(f.keywords().includes('proliferate'));
});

test('Vorinclex reducing proliferate additions to zero produces no keyword sound', async () => {
  const f=fixture(), target=f.card(); f.game.addCounters(target,'+1/+1',1);
  const vorinclex=new M.CardInst(M.DEFS['Vorinclex, Monstrous Raider'],f.opponent);
  vorinclex.zone='battlefield'; f.game.battlefield.push(vorinclex); f.game.recalc(); f.events.length=0;
  await M.E.proliferate(f.game,f.player);
  assert.equal(target.counters['+1/+1'],1); assert.equal(f.keywords().includes('proliferate'),false);
});

test('simultaneous damage preserves source visibility captured before the batch', async () => {
  for(const startsHidden of [false,true]) {
    const f=fixture(), source=f.card({kws:['infect','lifelink']}), target=f.card({owner:f.opponent,toughness:20});
    source.faceDown=startsHidden;
    f.game.onEvent=event=>{f.events.push(event);if(event.kind==='damage')source.faceDown=!startsHidden;};
    await f.game.damageBatch([{src:source,target,n:1},{src:source,target:f.opponent,n:1}]);
    assert.equal(f.keywords().includes('infect'),!startsHidden);
    assert.equal(f.keywords().includes('lifelink'),!startsHidden);
  }
});
