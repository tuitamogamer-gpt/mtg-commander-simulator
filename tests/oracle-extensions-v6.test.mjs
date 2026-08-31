import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticClass as latestSemanticClass } from '../scripts/import-oracle-batch.mjs';
// Keep the frozen v6 acceptance/rejection contract independent of v7.
const semanticClass=card=>latestSemanticClass(card,{compilerVersion:6});
import { extensionTarget } from '../scripts/oracle-extensions-v6.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const definitions = [
  ['Elf Lord','All Elf creatures have haste.'],
  ['Other Lord','Other creatures get -1/-1.'],
  ['Human Tap','{T}: Tap target Human creature.'],
  ['Snow Untap','{T}: Untap target snow land.'],
  ['Discard Hand','Target player discards their hand.','Sorcery'],
  ['Everyone Draw','When this creature enters, each player draws two cards.'],
  ['Opponents Mill','When this creature enters, each opponent mills three cards.'],
  ['Self Damage','At the beginning of your upkeep, this creature deals 2 damage to you.'],
  ['Charge Counter','{T}: Put a charge counter on this creature.'],
  ['Red Arrival','When this creature enters, add {R}{R}.'],
  ['Count Attack','Whenever this creature attacks, it gets +1/+1 until end of turn for each artifact you control.'],
  ['Nonwhite Wipe','Destroy all nonwhite creatures.','Sorcery'],
  ['Plains Wipe','Destroy all Plains.','Sorcery'],
  ['Fight Spell',"Target creature you control fights target creature you don't control.",'Sorcery'],
  ['Creature Protection','Protection from creatures'],
  ['Elf Protection','Flying, protection from Elves'],
  ['Draw And Gain','When this creature enters, draw a card and you gain 2 life.'],
  ['Evoke Creature','Evoke {G}'],
  ['Mega Creature','Megamorph {1}{G}'],
  ['Blue Counter','Counter target blue spell.','Instant'],
  ['Tap Two','Tap two target creatures.','Instant'],
  ['Kicker Creature','Kicker {G}\nWhen this creature enters, if it was kicked, draw a card.'],
  ['Escape Draw','Draw a card.\nEscape—{G}, Exile three other cards from your graveyard.','Sorcery'],
  ['Modal Tap Draw','Choose one or both —\n• Tap two target creatures.\n• Draw a card.','Instant'],
  ['Sacrifice Search','As an additional cost to cast this spell, sacrifice a creature.\nSearch your library for a card, put that card into your hand, then shuffle.','Sorcery'],
  ['Goblin Sacrifice','Sacrifice a Goblin: You gain 4 life.'],
  ['Damage Draw','Enrage — Whenever this creature is dealt damage, draw that many cards.'],
  ['Other Cast','Whenever an opponent casts a spell, you gain 1 life.'],
  ['Grounded','Creatures with flying get -1/-0.'],
  ['No Blocking',"Creatures can't block.",'Enchantment'],
  ['Multi Creature','Multikicker {1}\nThis creature enters with a +1/+1 counter on it for each time it was kicked.'],
  ['Life Pump','As an additional cost to cast this spell, pay X life.\nTarget creature gets +X/+0 until end of turn.','Instant'],
  ['Conditional Pump','Kicker {G}\nTarget creature gets +1/+0 until end of turn. If this spell was kicked, it gains lifelink until end of turn.','Instant'],
  ['Fear Pump','Target creature gains fear until end of turn.','Instant'],
  ['Copy Creature',"Create a token that's a copy of target creature you control.",'Sorcery'],
  ['Bounce All',"Return all nonland permanents to their owners' hands.",'Sorcery'],
  ['Counter Visitor','Whenever a creature an opponent controls with a +1/+1 counter on it dies, draw a card.'],
  ['Token Visitor','Whenever another artifact you control enters, you gain 1 life.'],
  ['Conditional Visitor','Whenever another creature you control enters, if you control an artifact, draw a card.'],
  ['Forest Discount','This spell costs {1} less to cast for each Forest you control.'],
  ['Creature Discount','Creature spells you cast cost {1} less to cast.','Enchantment'],
  ['Sacrifice Mana','Sacrifice this creature: Add {G}.'],
  ['Variable Morph','Morph {X}{X}{G}\nWhen this creature is turned face up, draw X cards.'],
  ['Event Draw','Whenever an opponent casts a spell, that player draws a card.'],
  ['Event Counter','Whenever another creature you control enters, put a +1/+1 counter on that creature.'],
  ['Event Controller','Whenever a creature dies, its controller gains 2 life.'],
  ['Granted Aura','Enchant creature\nEnchanted creature has "Whenever this creature attacks, draw a card."','Enchantment — Aura'],
  ['Attached Aura','Enchant creature\nWhenever enchanted creature attacks, draw a card.','Enchantment — Aura'],
  ['Base Size','Target creature has base power and toughness 4/4 until end of turn.','Instant'],
  ['Borrow','Gain control of target creature until end of turn. Untap it. It gains haste until end of turn.','Sorcery'],
  ['Tax Counter','Counter target spell unless its controller pays {2}.','Instant'],
  ['Upkeep Cost','At the beginning of your upkeep, sacrifice this creature unless you pay {1}.'],
  ['Echo Creature','Echo {G}'],
  ['Dash Creature','Dash {G}'],
  ['Plot Creature','Plot {G}'],
  ['Dredge Creature','Dredge 2'],
  ['Devour Creature','Devour 2'],
  ['Graft Creature','Graft 2'],
  ['Adapt Creature','{G}: Adapt 2.'],
  ['Animated Land',"{G}: This land becomes a 3/3 green Bear creature until end of turn. It's still a land.",'Land — Forest'],
  ['Animated Artifact','{G}: This artifact becomes a 4/4 blue Dragon artifact creature with flying until end of turn.','Artifact'],
  ['Prison','When this creature enters, exile target nonland permanent an opponent controls until this creature leaves the battlefield.'],
  ['Sacrifice Draw','You may sacrifice a creature. If you do, draw two cards.','Sorcery'],
  ['Global Grant','Creatures you control have "Whenever this creature attacks, draw a card."','Enchantment'],
  ['Host Death','Enchant creature\nWhenever enchanted creature dies, draw two cards.','Enchantment — Aura'],
  ['Counter Last Known','This creature enters with three +1/+1 counters on it.\nWhen this creature dies, draw a card for each +1/+1 counter on it.'],
  ['Once Draw','Whenever you scry, draw a card. This ability triggers only once each turn.'],
  ['Reinforce Creature','Reinforce 2—{G}'],
  ['Tap Choice','You may tap or untap target artifact, creature, or land.','Instant'],
  ['Next Turn Pump','Target creature gets +2/+2 until your next turn.','Instant'],
  ['Sacrifice Observer','Whenever you sacrifice a creature, draw a card.'],
  ['Mixed Removal','Destroy target artifact, enchantment, or creature with flying.','Instant'],
  ['Enchantment Choice','Target enchanted creature or enchantment creature you control gets +1/+1 until end of turn.','Instant'],
  ['Permanent Control','Gain control of target creature.','Sorcery'],
  ['Surge Creature','Surge {G}'],
  ['Spectacle Creature','Spectacle {G}'],
];
const fixtures=definitions.map(([name,oracle,type='Creature — Bear'],i)=>{
  name='V6 '+name;
  const card={name,oracle_text:oracle,type_line:type,layout:'normal',mana_cost:'{1}{G}',power:'2',toughness:'2'};
  const semantic=semanticClass(card);
  assert.ok(semantic.semanticClass,`${name}: ${semantic.reason}`);
  return {position:i+1,oracleId:'v6-'+i,scryfallId:'v6-print-'+i,...semantic,
    raw:{name,cost:card.mana_cost,oracle,types:type.split(' — ')[0].split(' '),subtypes:type.includes(' — ')?type.split(' — ')[1].split(' '):[],super:[],power:'2',toughness:'2',_ci:['G'],_oracleId:'v6-'+i,_scryfallId:'v6-print-'+i},
    catalog:{typeLine:type,commanderLegality:'legal'}};
});

for(const role of ['human','ai']){
  test(`v6 ${role}: adapt resolves only without counters and rechecks a blink`,async()=>{
    const ctx=context(role),{game,a}=ctx;game.priorityRound=async()=>{};const c=put(game,a,'V6 Adapt Creature');a.pool.G=4;
    const activate=()=>game.activateAbility(a,game.activatableList(a).find(row=>row.card===c));
    assert.equal(await activate(),true);await settle(game);assert.equal(c.counters['+1/+1'],2);
    assert.equal(await activate(),true);await settle(game);assert.equal(c.counters['+1/+1'],2);
    c.counters={};assert.equal(await activate(),true);await game.move(c,'exile');await game.move(c,'battlefield',{ctrl:a});await settle(game);assert.equal(c.counters['+1/+1']||0,0);
  });
  test(`v6 ${role}: echo is due once, declined echo sacrifices, and changing controller makes it due`,async()=>{
    const ctx=context(role),{game,a,b}=ctx;game.priorityRound=async()=>{};const c=await cast(ctx,'Echo Creature');a.pool.G=1;
    await game.emit('upkeep',{player:a});await settle(game);assert.equal(c.zone,'battlefield');assert.equal(a.pool.G,0);
    await game.emit('upkeep',{player:a});await settle(game);assert.equal(c.zone,'battlefield');
    c.ctrl=b;game.recalc();assert.equal(c.meta.oracleEchoPending,true);
    await game.emit('upkeep',{player:b});await settle(game);assert.equal(c.zone,'graveyard');
  });
  test(`v6 ${role}: dash uses paid alternative, returns at next end step, and ignores a blinked object`,async()=>{
    for(const blink of [false,true]){
      const ctx=context(role),{game,a}=ctx;game.priorityRound=async()=>{};const c=put(game,a,'V6 Dash Creature','hand');a.pool.G=1;
      const offer=game.castableList(a).find(row=>row.card===c&&row.alt?.dash);assert.ok(offer);assert.equal(await game.castSpell(a,c,{from:'hand',alt:offer.alt}),true);await settle(game);assert.equal(c.kw('haste'),true);assert.equal(a.pool.G,0);
      if(blink){await game.move(c,'exile');await game.move(c,'battlefield',{ctrl:a});}
      await game.emit('endStep',{player:a});await settle(game);assert.equal(c.zone,blink?'battlefield':'hand');
    }
  });
  test(`v6 ${role}: plotting is a special action, delays casting and clears permission after a zone change`,async()=>{
    const ctx=context(role),{game,a,b}=ctx;const c=put(game,a,'V6 Plot Creature','hand');a.pool.G=1;
    game.turnPlayer=b;assert.equal(game.activatableList(a).some(row=>row.card===c&&row.plot),false);game.turnPlayer=a;
    assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===c&&row.plot)),true);assert.equal(a.pool.G,0);assert.equal(game.stack.length,0);assert.equal(c.zone,'exile');
    assert.equal(game.castableList(a).some(row=>row.card===c),false);game.turnNo++;
    assert.ok(game.castableList(a).some(row=>row.card===c&&row.alt?.plotPlay));await game.move(c,'hand');await game.move(c,'exile');assert.equal(game.castableList(a).some(row=>row.card===c),false);
  });
  test(`v6 ${role}: dredge replaces one draw and is unavailable without enough library cards`,async()=>{
    const ctx=context(role),{game,a}=ctx;const c=put(game,a,'V6 Dredge Creature','graveyard');
    const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>role==='human'&&q.aiHint?.kind==='dredge'?'dredge:'+c.iid:decide(g,q);
    const n=a.library.length;await game.draw(a,1);assert.equal(c.zone,'hand');assert.equal(a.library.length,n-2);
    await game.move(c,'graveyard');a.library.splice(1);await game.draw(a,1);assert.equal(c.zone,'graveyard');assert.equal(a.library.length,0);
  });
  test(`v6 ${role}: animation changes types and base stats before counters and expires without following a blink`,async()=>{
    const ctx=context(role),{game,a}=ctx;game.priorityRound=async()=>{};
    for(const name of ['Animated Land','Animated Artifact']){
      const c=put(game,a,'V6 '+name);game.addCounters(c,'+1/+1',2);a.pool.G=1;
      assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===c&&!row.isMana)),true);await settle(game);
      assert.equal(c.is('Creature'),true);assert.equal(c.is(name==='Animated Land'?'Land':'Artifact'),true);assert.equal(c.power,(name==='Animated Land'?3:4)+2);
      assert.equal(c.hasSub(name==='Animated Land'?'Bear':'Dragon'),true);assert.deepEqual(Array.from(c.colors),[name==='Animated Land'?'G':'U']);
      await game.move(c,'exile');await game.move(c,'battlefield',{ctrl:a});assert.equal(c.is('Creature'),false);
    }
  });
  test(`v6 ${role}: exile duration returns immediately and never returns a different exile incarnation`,async()=>{
    for(const change of [false,true]){
      const ctx=context(role),{game,a,b}=ctx;game.priorityRound=async()=>{};const target=put(game,b,'Grizzly Bears');ctx.state.targets=[target];
      const source=await cast(ctx,'Prison');assert.equal(target.zone,'exile');
      if(change){await game.move(target,'hand');await game.move(target,'exile');}
      await game.move(source,'hand');assert.equal(target.zone,change?'exile':'battlefield');assert.equal(game.stack.length,0);
    }
  });
  test(`v6 ${role}: attached death trigger uses last-known attachment and controller`,async()=>{
    const ctx=context(role),{game,a,b}=ctx;game.priorityRound=async()=>{};const target=put(game,b,'Grizzly Bears');ctx.state.targets=[target];const aura=await cast(ctx,'Host Death');const n=a.library.length;
    await game.destroy(target);await settle(game);assert.equal(aura.zone,'graveyard');assert.equal(a.library.length,n-2);
  });
  test(`v6 ${role}: once-per-turn trigger resets next turn and source counter amount uses death LKI`,async()=>{
    const ctx=context(role),{game,a}=ctx;const once=put(game,a,'V6 Once Draw');let n=a.library.length;
    await MTG.E.scry(game,a,1);await settle(game);await MTG.E.scry(game,a,1);await settle(game);assert.equal(a.library.length,n-1);
    game.turnNo++;await MTG.E.scry(game,a,1);await settle(game);assert.equal(a.library.length,n-2);await game.move(once,'hand');
    const source=await cast(ctx,'Counter Last Known');n=a.library.length;await game.destroy(source);await settle(game);assert.equal(a.library.length,n-3);
  });
  test(`v6 ${role}: granted trigger follows host controller and disappears when granting source leaves`,async()=>{
    const ctx=context(role),{game,a,b}=ctx;const host=put(game,a,'Grizzly Bears'),grant=put(game,a,'V6 Global Grant');let n=a.library.length;
    await game.emit('attacks',{card:host,player:a,defender:b});await settle(game);assert.equal(a.library.length,n-1);
    host.ctrl=b;game.recalc();n=b.library.length;await game.emit('attacks',{card:host,player:b,defender:a});await settle(game);assert.equal(b.library.length,n);
    host.ctrl=a;await game.move(grant,'graveyard');n=a.library.length;await game.emit('attacks',{card:host,player:a,defender:b});await settle(game);assert.equal(a.library.length,n);
  });
  test(`v6 ${role}: graft moves counters without targeting and does not follow a blink`,async()=>{
    const ctx=context(role),{game,a}=ctx;game.priorityRound=async()=>{};const source=await cast(ctx,'Graft Creature');
    const target=put(game,a,'Grizzly Bears','hand');await game.move(target,'battlefield',{ctrl:a});await settle(game);assert.equal(target.counters['+1/+1'],1);assert.equal(source.counters['+1/+1'],1);
    const next=put(game,a,'Grizzly Bears','hand');await game.move(next,'battlefield',{ctrl:a});await game.move(next,'exile');await game.move(next,'battlefield',{ctrl:a});
    await game.flushTriggers();const pending=game.stack.length;assert.ok(pending>=2);await settle(game);assert.equal(next.counters['+1/+1']||0,1);assert.equal(source.counters['+1/+1']||0,0);
  });
}
MTG.registerOracleBatch({id:'oracle-v6-test',sequence:9999,cards:fixtures});
MTG.initData(MTG.RAW_DATA);

function context(role='human') {
  const state={targets:[],trace:[]};
  const control={decide:async(g,q)=>{
    state.trace.push(q);
    if(q.type==='priority') return {kind:'pass'};
    if(q.type==='chooseTargets') return [...state.targets.filter(c=>q.candidates.includes(c)),...q.candidates.filter(c=>!state.targets.includes(c))].slice(0,q.max??1);
    if(q.type==='chooseCards') return q.from.slice(0,q.max??q.min??1);
    if(q.type==='chooseOption') return q.options.find(o=>o.key==='yes')?.key||q.options[0].key;
    if(q.type==='chooseMulti')return q.options.slice(0,q.max).map(option=>option.key);
    if(q.type==='orderTriggers') return q.triggers;
    if(q.type==='scry') return {top:q.cards,bottom:[]};
    if(q.type==='main') return q.casts.length?{kind:'cast',...q.casts[0]}:{kind:'done'};
    return [];
  }};
  const game=new MTG.Game({seed:5047,paced:false,maxTurns:10});
  state.stackKinds=[];
  const resolveTop=game.resolveTop;
  game.resolveTop=async function(...args) {state.stackKinds.push(this.stack.at(-1)?.kind);return resolveTop.apply(this,args);};
  const a=game.addPlayer('A',{name:'A'},control,role==='ai');
  const b=game.addPlayer('B',{name:'B'},control,false);
  if(role==='ai') a.controller=new MTG.AIController(a,{difficulty:'hard',style:'balanced'});
  game.turnPlayer=a; game.turnNo=3; game.phase='main1'; game.step='main';
  for(const p of [a,b]) for(let i=0;i<20;i++) put(game,p,'Forest','library');
  return {game,a,b,state};
}
function put(game,p,name,zone='battlefield') {
  const card=new MTG.CardInst(MTG.DEFS[name],p); card.zone=zone; card.ctrl=p; card.sick=false;
  if(zone==='battlefield') {game.battlefield.push(card);game.recalc();} else p[zone].push(card);
  return card;
}
async function settle(game) {
  for(let i=0;i<60 && (game.stack.length||game.pendingTriggers.length);i++) {
    await game.flushTriggers(); if(game.stack.length) await game.resolveTop();
  }
  assert.equal(game.stack.length,0); assert.equal(game.pendingTriggers.length,0);
  assert.equal((game.aiDecisionLog||[]).some(d=>d.fallback),false);
}
async function cast(ctx,name,{resolve=true,pilot=false}={}) {
  const {game,a}=ctx;
  const card=put(game,a,'V6 '+name,'hand'); a.pool.C+=1; a.pool.G+=1;
  const priority=game.priorityRound;
  if(!resolve) game.priorityRound=async()=>{};
  try { if(pilot) {
    const action=await a.controller.decide(game,{type:'main',player:a,phase:game.phase,casts:game.castableList(a),acts:game.activatableList(a),lands:[]});
    assert.equal(action.kind,'cast',JSON.stringify(game.aiDecisionLog?.slice(-1))); assert.equal(action.card?.name,card.name);
    assert.equal(await game.performAction(a,action),true);
  } else assert.equal(await game.castSpell(a,card,{from:'hand'}),true);
  } finally { game.priorityRound=priority; }
  assert.notEqual(card.castMeta?.alt?.free,true);
  if(resolve) await settle(game);
  return card;
}

test('v6 retains every target restriction and rejects unparsed suffixes',()=>{
  assert.equal(extensionTarget('target You'),null);
  assert.equal(semanticClass({name:'Mask',layout:'normal',type_line:'Enchantment',mana_cost:'{W}',oracle_text:'You have shroud.'}).semanticClass,undefined);
  assert.equal(extensionTarget('target Spirit').subtype,'Spirit');
  assert.equal(extensionTarget('target non-Elf creature').notSubtype,'Elf');
  assert.equal(extensionTarget('target snow land').snow,true);
  assert.equal(extensionTarget('target Gate').what,'land');
  assert.equal(extensionTarget('target Equipment').what,'artifact');
  for(const oracle of ['Power-up — {G}: Draw a card.', 'Whenever you sacrifice a creature, draw X cards.']) {
    assert.equal(semanticClass({name:'Incomplete Rule',oracle_text:oracle,type_line:'Creature — Bear',layout:'normal',mana_cost:'{1}{G}',power:'2',toughness:'2'}).semanticClass,undefined,oracle);
  }
  for(const phrase of ['target Spirit from nowhere','target creature unless its controller pays {1}','target snow land except Tuesday'])assert.equal(extensionTarget(phrase),null);
  for(const oracle of ['{R}: Add {B}.','Sacrifice a creature: Add {C}{C}.','{T}: Add {B}. This creature deals 1 damage to you.']) {
    assert.equal(semanticClass({name:'Unimplemented Mana Ability',oracle_text:oracle,type_line:'Creature — Bear',layout:'normal',mana_cost:'{1}',power:'1',toughness:'1'}).semanticClass,undefined,oracle);
  }
  for(const [name,oracle,type='Creature — Bear'] of definitions) {
    const source={name,oracle_text:oracle+'\nThen win the game.',type_line:type,layout:'normal',mana_cost:'{1}{G}',power:'2',toughness:'2'};
    assert.equal(semanticClass(source).semanticClass,undefined,name);
  }
});

for(const role of ['human','ai']) {
  test(`v6 ${role}: multikicker offers every affordable repetition beyond four`,async()=>{
    const ctx=context(role);const {game,a}=ctx;game.priorityRound=async()=>{};a.pool.C=6;
    const decide=a.controller.decide.bind(a.controller);let offered;
    a.controller.decide=async(g,q)=>{if(q.type==='chooseX'&&q.aiHint?.kind==='squad'){offered=q.max;if(role==='human')return q.max;}return decide(g,q);};
    const source=await cast(ctx,'Multi Creature',{resolve:false});assert.equal(offered,6);
    const paid=source.castMeta.paidTimes;assert.ok(paid>0);await settle(game);assert.equal(source.counters['+1/+1'],paid);
  });
  test(`v6 ${role}: X in a life payment is chosen even without an X mana cost`,async()=>{
    const ctx=context(role);const {game,a}=ctx;game.priorityRound=async()=>{};const target=put(game,a,'Grizzly Bears');ctx.state.targets=[target];
    for(const free of [false,true]){
      const source=put(game,a,'V6 Life Pump','hand');a.pool.C++;a.pool.G++;
      const life=a.life,power=target.power;
      assert.equal(await game.castSpell(a,source,{from:'hand',xVal:3,...(free?{alt:{free:true}}:{})}),true);
      assert.equal(a.life,life-3);assert.equal(game.stack.at(-1).x,3);await settle(game);assert.equal(target.power,power+3);
    }
  });
  test(`v6 ${role}: a conditional follow-up keeps the original spell target`,async()=>{
    const ctx=context(role);const {game,a}=ctx;game.priorityRound=async()=>{};a.pool.G++;
    const target=put(game,a,'Grizzly Bears');ctx.state.targets=[target];const spell=await cast(ctx,'Conditional Pump',{resolve:false});assert.equal(spell.castMeta.kicked,true);
    await settle(game);assert.equal(target.kw('lifelink'),true);assert.equal(target.power,3);
  });
  test(`v6 ${role}: kicker requires payment and the entry condition captures the paid choice`,async()=>{
    for(const kicked of [false,true]){
      const ctx=context(role);const {game,a}=ctx;game.priorityRound=async()=>{};
      if(kicked)a.pool.G++;
      const card=await cast(ctx,'Kicker Creature',{resolve:false});
      assert.equal(card.castMeta.kicked,kicked);assert.equal(a.pool.G,0);
      const library=a.library.length;await game.resolveTop();
      if(kicked){await game.move(card,'exile');await game.move(card,'battlefield',{ctrl:a});}
      await settle(game);assert.equal(a.library.length,library-(kicked?1:0));
    }
  });
  test(`v6 ${role}: escape exiles other graveyard cards as a cost and can be used again`,async()=>{
    const ctx=context(role);const {game,a}=ctx;game.priorityRound=async()=>{};
    const card=put(game,a,'V6 Escape Draw','graveyard');
    for(let attempt=0;attempt<2;attempt++){
      const fodder=Array.from({length:3},()=>put(game,a,'Forest','graveyard'));a.pool.G++;
      const option=game.castableList(a).find(row=>row.card===card&&row.alt?.escape);assert.ok(option);
      assert.equal(await game.castSpell(a,card,{from:'graveyard',alt:option.alt}),true);
      for(const other of fodder)assert.equal(other.zone,'exile');assert.equal(card.zone,'stack');
      await settle(game);assert.equal(card.zone,'graveyard');assert.equal(a.pool.G,0);
    }
  });
  test(`v6 ${role}: modal spells pay once and execute the chosen printed modes`,async()=>{
    const ctx=context(role);const {game,a,b}=ctx;game.priorityRound=async()=>{};
    const targets=[put(game,b,'Grizzly Bears'),put(game,b,'Grizzly Bears')];ctx.state.targets=targets;
    const library=a.library.length;const card=await cast(ctx,'Modal Tap Draw',{resolve:false});
    const object=game.stack.find(row=>row.card===card);const modes=Array.from(object.mode);assert.ok(modes.length);
    await settle(game);assert.equal(a.library.length,library-(modes.includes(1)?1:0));
    if(modes.includes(0))for(const target of targets)assert.equal(target.tapped,true);
    assert.equal(a.pool.C+a.pool.G,0);
  });
  test(`v6 ${role}: additional sacrifice and subtype activation costs commit before resolution`,async()=>{
    const ctx=context(role);const {game,a}=ctx;game.priorityRound=async()=>{};
    const fodder=put(game,a,'Grizzly Bears');const card=await cast(ctx,'Sacrifice Search',{resolve:false});
    assert.equal(fodder.zone,'graveyard');assert.equal(card.zone,'stack');await settle(game);
    const source=put(game,a,'V6 Goblin Sacrifice');const goblin=put(game,a,'Goblin Piker');
    const ability=game.activatableList(a).find(row=>row.card===source);assert.ok(ability);
    const life=a.life;assert.equal(await game.activateAbility(a,ability),true);assert.equal(goblin.zone,'graveyard');
    await settle(game);assert.equal(a.life,life+4);
  });
  test(`v6 ${role}: damage and opponent-cast events do not react to unrelated events`,async()=>{
    const ctx=context(role);const {game,a,b}=ctx;game.priorityRound=async()=>{};
    const source=put(game,a,'V6 Damage Draw');const hostile=put(game,b,'Grizzly Bears');const library=a.library.length;
    await game.damageCreature(hostile,source,1);await settle(game);assert.equal(a.library.length,library-1);
    await game.damageCreature(source,hostile,1);await settle(game);assert.equal(a.library.length,library-1);
    const observer=put(game,a,'V6 Other Cast');const life=a.life;
    for(const player of [a,b]){const spell=put(game,player,'Opt','hand');player.pool.U++;assert.equal(await game.castSpell(player,spell,{from:'hand'}),true);await settle(game);}
    assert.equal(a.life,life+1);assert.equal(observer.zone,'battlefield');
  });
  test(`v6 ${role}: static group filters apply only to the stated permanents`,async()=>{
    const ctx=context(role);const {game,a,b}=ctx;const flyer=put(game,b,'Air Elemental'),bear=put(game,a,'Grizzly Bears');
    put(game,a,'V6 Grounded');assert.equal(flyer.power,3);assert.equal(bear.power,2);
    const enchantment=put(game,a,'V6 No Blocking');assert.equal(game.canBlock(bear,flyer),false);
    assert.equal(bear.cur.cantBlock,true);await game.move(enchantment,'exile');assert.equal(bear.cur.cantBlock,false);
  });
  test(`v6 ${role}: equal-cost manifest and megamorph actions remain distinct`,async()=>{
    const ctx=context(role);const {game,a}=ctx;game.priorityRound=async()=>{};
    for(const kind of ['mana cost','megamorph']) {
      const card=put(game,a,'V6 Mega Creature','hand');
      await game.putFaceDown(a,card,'manifest');a.pool.C+=1;a.pool.G+=1;
      const actions=game.activatableList(a).filter(row=>row.card===card&&row.turnFaceUp);
  assert.deepEqual(Array.from(actions,row=>row.faceUpKind),['mana cost','megamorph']);
      assert.equal(await game.activateAbility(a,actions.find(row=>row.faceUpKind===kind)),true);
      assert.equal(card.faceDown,false);assert.equal(card.counters['+1/+1']||0,kind==='megamorph'?1:0);
      assert.equal(card.power,kind==='megamorph'?3:2);
    }
  });
  test(`v6 ${role}: color-qualified counters use a real stack and preserve other spells`,async()=>{
    const ctx=context(role);const {game,a,b}=ctx;game.priorityRound=async()=>{};
    const blue=put(game,b,'Opt','hand');b.pool.U=1;assert.equal(await game.castSpell(b,blue,{from:'hand'}),true);
    const red=put(game,b,'Lightning Bolt','hand');b.pool.R=1;ctx.state.targets=[a];assert.equal(await game.castSpell(b,red,{from:'hand'}),true);
    await cast(ctx,'Blue Counter');
    assert.equal(blue.zone,'graveyard');assert.equal(red.zone,'graveyard');assert.equal(a.life,37);assert.equal(b.hand.length,0);
  });
  test(`v6 ${role}: fixed target quantities choose and resolve two distinct objects`,async()=>{
    const ctx=context(role);const one=put(ctx.game,ctx.b,'Grizzly Bears');const two=put(ctx.game,ctx.b,'Elite Vanguard');
    ctx.state.targets=[one,two];await cast(ctx,'Tap Two');
    assert.equal(one.tapped,true);assert.equal(two.tapped,true);
  });
  test(`v6 ${role}: Evoke pays its alternative cost and its sacrifice cannot follow a blink`,async()=>{
    const ctx=context(role);const {game,a}=ctx;game.priorityRound=async()=>{};
    const ordinary=await cast(ctx,'Evoke Creature');assert.equal(ordinary.zone,'battlefield');
    const evoke=async()=>{
      const card=put(game,a,'V6 Evoke Creature','hand');a.pool.G++;
      const option=game.castableList(a).find(row=>row.card===card&&row.alt?.evoke);assert.ok(option);
      const before=a.pool.G;assert.equal(await game.castSpell(a,card,{from:'hand',alt:option.alt}),true);assert.equal(a.pool.G,before-1);
      await game.resolveTop();await game.flushTriggers();return card;
    };
    const doomed=await evoke();assert.equal(doomed.zone,'battlefield');await settle(game);assert.equal(doomed.zone,'graveyard');
    const blinked=await evoke();await game.move(blinked,'exile');await game.move(blinked,'battlefield',{ctrl:a});
    await settle(game);assert.equal(blinked.zone,'battlefield');
  });
  test(`v6 ${role}: a nontargeted wipe obeys color filters and ignores hexproof`,async()=>{
    const ctx=context(role);const white=put(ctx.game,ctx.b,'Elite Vanguard');const green=put(ctx.game,ctx.b,'Grizzly Bears');
    const protectedCreature=put(ctx.game,ctx.b,'Gladecover Scout');
    assert.equal(protectedCreature.kw('hexproof'),true);
    await cast(ctx,'Nonwhite Wipe');
    assert.equal(white.zone,'battlefield');assert.equal(green.zone,'graveyard');assert.equal(protectedCreature.zone,'graveyard');
    const plains=put(ctx.game,ctx.b,'Plains');const forest=put(ctx.game,ctx.b,'Forest');
    await cast(ctx,'Plains Wipe');assert.equal(plains.zone,'graveyard');assert.equal(forest.zone,'battlefield');
  });
  test(`v6 ${role}: fighting uses both creatures as damage sources before either dies`,async()=>{
    const ctx=context(role);const first=put(ctx.game,ctx.a,'Grizzly Bears');const second=put(ctx.game,ctx.b,'Grizzly Bears');
    ctx.state.targets=[first,second];await cast(ctx,'Fight Spell');
    assert.equal(first.zone,'graveyard');assert.equal(second.zone,'graveyard');
  });
  test(`v6 ${role}: protection checks source type and subtype for damage and blocking`,async()=>{
    const ctx=context(role);const source=await cast(ctx,'Creature Protection');const creature=put(ctx.game,ctx.b,'Grizzly Bears');
    const spell=put(ctx.game,ctx.b,'Lightning Bolt','hand');
    assert.equal(ctx.game.isProtectedFrom(source,creature),true);assert.equal(ctx.game.isProtectedFrom(source,spell),false);
    assert.equal(await ctx.game.damageCreature(creature,source,3),0);
    assert.equal(ctx.game.canBlock(creature,source),false);
    const elfProtected=await cast(ctx,'Elf Protection');const elf=put(ctx.game,ctx.b,'Llanowar Elves');
    assert.equal(elfProtected.kw('flying'),true);assert.equal(ctx.game.isProtectedFrom(elfProtected,elf),true);assert.equal(ctx.game.isProtectedFrom(elfProtected,creature),false);
  });
  test(`v6 ${role}: Gadwick captures the paid X before source removal and resets it on a new entry`,async()=>{
    const ctx=context(role);const {game,a}=ctx;
    game.priorityRound=async()=>{};
    const source=put(game,a,'Gadwick, the Wizened','hand');a.pool.C=3;a.pool.U=3;
    assert.equal(await game.castSpell(a,source,{from:'hand',xVal:3}),true);
    assert.equal(a.pool.C+a.pool.U,0);
    await game.resolveTop();await game.flushTriggers();
    assert.ok(game.stack.some(row=>row.kind==='trigger'&&row.srcCard===source));
    await game.move(source,'hand');await settle(game);
    assert.equal(a.library.length,17);
    await game.move(source,'battlefield',{ctrl:a});await settle(game);
    assert.equal(a.library.length,17);
  });
  test(`v6 ${role}: paid draw and mill triggers affect exactly the stated players`,async()=>{
    const ctx=context(role);const {game,a,b}=ctx;
    await cast(ctx,'Everyone Draw',{pilot:true});
    assert.equal(a.library.length,18);assert.equal(b.library.length,18);
    await cast(ctx,'Opponents Mill',{pilot:true});
    assert.equal(a.library.length,18);assert.equal(b.library.length,15);
    assert.equal(b.graveyard.length,3);
  });
  test(`v6 ${role}: source damage and mana triggers use the actual controller`,async()=>{
    const ctx=context(role);const {game,a,b}=ctx;
    const source=await cast(ctx,'Self Damage');
    const life=a.life;await game.emit('upkeep',{player:a});await settle(game);
    assert.equal(a.life,life-2);assert.equal(b.life,40);
    await game.emit('upkeep',{player:b});await settle(game);assert.equal(a.life,life-2);
    const mana=a.pool.R;await cast(ctx,'Red Arrival');assert.equal(a.pool.R,mana+2);
    assert.equal(source.zone,'battlefield');
  });
  test(`v6 ${role}: global other-creature effect excludes source and includes opponents`,async()=>{
    const ctx=context(role);const source=await cast(ctx,'Other Lord');
    const friend=put(ctx.game,ctx.a,'Grizzly Bears');const enemy=put(ctx.game,ctx.b,'Grizzly Bears');
    ctx.game.recalc();assert.equal(source.power,2);assert.equal(friend.power,1);assert.equal(enemy.power,1);
    await ctx.game.move(source,'hand');ctx.game.recalc();assert.equal(friend.power,2);assert.equal(enemy.power,2);
  });
  test(`v6 ${role}: subtype and snow targets are filtered at announcement and resolution`,async()=>{
    const ctx=context(role);const source=await cast(ctx,'Human Tap');
    const human=put(ctx.game,ctx.b,'Elite Vanguard');const bear=put(ctx.game,ctx.b,'Grizzly Bears');
    assert.equal(ctx.game.activatableList(ctx.a).some(row=>row.card===source),false);
    ctx.game.turnNo++;source.sick=false;
    const action=ctx.game.activatableList(ctx.a).find(row=>row.card===source);assert.ok(action);
    ctx.state.targets=[bear,human];assert.equal(await ctx.game.activateAbility(ctx.a,action),true);
    await settle(ctx.game);assert.equal(human.tapped,true);assert.equal(bear.tapped,false);
    const snowSource=await cast(ctx,'Snow Untap');const snow=put(ctx.game,ctx.a,'Snow-Covered Forest');const ordinary=put(ctx.game,ctx.a,'Forest');
    ctx.game.turnNo++;snowSource.sick=false;
    snow.tapped=true;ordinary.tapped=true;ctx.state.targets=[ordinary,snow];
    const untap=ctx.game.activatableList(ctx.a).find(row=>row.card===snowSource);assert.ok(untap);
    assert.equal(await ctx.game.activateAbility(ctx.a,untap),true);await settle(ctx.game);
    assert.equal(snow.tapped,false);assert.equal(ordinary.tapped,true);
  });
}

for(const role of ['human','ai'])test(`v6 ${role} typed death uses LKI and correct controller`,async()=>{
 const ctx=context(role),{game,a,b}=ctx;put(game,a,'V6 Counter Visitor');
 const friendly=put(game,a,'Grizzly Bears'),enemy=put(game,b,'Grizzly Bears');
 game.addCounters(friendly,'+1/+1',1,false,a);game.addCounters(enemy,'+1/+1',1,false,b);
 const before=a.library.length;await game.move(friendly,'graveyard');await settle(game);assert.equal(a.library.length,before);
 await game.move(enemy,'graveyard');assert.equal(enemy.counters['+1/+1']||0,0);await settle(game);assert.equal(a.library.length,before-1);
});

test('v6 intervening condition is checked before trigger collection and again at resolution',async()=>{
 const ctx=context(),{game,a}=ctx;put(game,a,'V6 Conditional Visitor');
 const visitor=put(game,a,'Grizzly Bears','hand'),before=a.library.length;
 await game.move(visitor,'battlefield',{ctrl:a});assert.equal(game.pendingTriggers.length,0);
 const artifact=put(game,a,'Sol Ring');await settle(game);assert.equal(a.library.length,before);
 const second=put(game,a,'Grizzly Bears','hand');await game.move(second,'battlefield',{ctrl:a});await game.flushTriggers();assert.equal(game.stack.length,1);
 await game.move(artifact,'exile');await settle(game);assert.equal(a.library.length,before);
});

for(const role of ['human','ai'])test(`v6 ${role} nontarget Aura entry chooses a legal host before its ETB`,async()=>{
 const {game,a,b,state}=context(role),host=put(game,a,'Grizzly Bears');host.def={...host.def,kws:['hexproof','shroud']};game.recalc();
 const aura=put(game,a,'Rancor','graveyard');let attachedAtEntry=false;
 const emit=game.emit;game.emit=async function(name,data){if(name==='etb'&&data.card===aura)attachedAtEntry=aura.attachedTo===host.iid;return emit.call(this,name,data);};
 assert.equal(await game.putPermanentOntoBattlefield(aura,a),true);await settle(game);
 assert.equal(aura.attachedTo,host.iid);assert.equal(attachedAtEntry,true);assert.equal(host.power,4);
 await game.move(aura,'graveyard');await settle(game);await game.move(aura,'graveyard');
 host.cur.protectionFrom.push(()=>true);assert.equal(await game.putPermanentOntoBattlefield(aura,a),false);assert.equal(aura.zone,'graveyard');
});

for(const role of ['human','ai'])test(`v6 ${role} return-all returns Aura and host in the same event`,async()=>{
 const ctx=context(role),{game,a}=ctx,host=put(game,a,'Grizzly Bears'),aura=put(game,a,'Rancor','graveyard');
 await game.putPermanentOntoBattlefield(aura,a);await settle(game);await cast(ctx,'Bounce All');
 assert.equal(host.zone,'hand');assert.equal(aura.zone,'hand');assert.equal(game.pendingTriggers.length,0);
});

for(const role of ['human','ai'])test(`v6 ${role} copying uses copiable values rather than counters and temporary buffs`,async()=>{
 const ctx=context(role),{game,a,state}=ctx,host=put(game,a,'Grizzly Bears');state.targets=[host];
 game.addCounters(host,'+1/+1',2,false,a);MTG.E.pumpUntilEOT(game,host,3,3,['flying']);
 await cast(ctx,'Copy Creature');const token=game.bf().find(card=>card.isToken);
 assert.ok(token);assert.equal(token.power,2);assert.equal(token.toughness,2);assert.equal(token.kw('flying'),false);assert.equal(token.counters['+1/+1']||0,0);
});

for(const role of ['human','ai'])test(`v6 ${role} sacrifice mana is immediate and never uses the Stack`,async()=>{
 const {game,a}=context(role),source=put(game,a,'V6 Sacrifice Mana');
 const descriptor=game.manaSources(a).find(row=>row.card===source);assert.ok(descriptor);
 assert.equal(await game.activateManaSource(a,descriptor,descriptor.produce[0],null,[]),true);
 assert.equal(source.zone,'graveyard');assert.equal(a.pool.G,1);assert.equal(game.stack.length,0);
});

for(const role of ['human','ai'])test(`v6 ${role} Morph X is paid twice and reaches the turn-face-up trigger`,async()=>{
 const {game,a,state}=context(role),card=put(game,a,'V6 Variable Morph','hand');
 await game.putFaceDown(a,card,'morph');a.pool.C=6;a.pool.G=1;
 const controller=a.controller,decide=controller.decide.bind(controller);let chosen;
 controller.decide=async(g,q)=>{if(q.type==='chooseX'){chosen=role==='human'?3:await decide(g,q);return chosen;}return decide(g,q);};
 const before=a.library.length;assert.equal(await game.turnFaceUp(a,card,'{X}{X}{G}'),true);await settle(game);
 assert.ok(Number.isInteger(chosen)&&chosen>=0&&chosen<=3);assert.equal(a.pool.C,6-2*chosen);assert.equal(a.pool.G,0);assert.equal(a.library.length,before-chosen);
});

test('v6 cost reductions apply to normal and alternative mana costs',()=>{
 const {game,a,b}=context();const card=put(game,a,'V6 Forest Discount','hand');put(game,a,'Forest');
 assert.equal(game.spellCost(a,card,{}).generic,0);assert.equal(game.spellCost(a,card,{altCostStr:'{4}{G}'}).generic,3);
 put(game,a,'V6 Creature Discount');const bear=put(game,a,'Grizzly Bears','hand'),other=put(game,b,'Grizzly Bears','hand');
 assert.equal(game.spellCost(a,bear,{}).generic,0);assert.equal(game.spellCost(b,other,{}).generic,1);
});

for(const role of ['human','ai']) {
  test(`v6 ${role}: event references preserve the triggering object and its controller`,async()=>{
    const {game,a,b,state}=context(role);put(game,a,'V6 Event Counter');
    const visitor=put(game,a,'Grizzly Bears','hand');await game.move(visitor,'battlefield',{ctrl:a});
    await settle(game);assert.equal(visitor.counters['+1/+1'],1);
    const other=put(game,b,'Grizzly Bears');await game.emit('etb',{card:other,player:b});await settle(game);assert.equal(other.counters['+1/+1']||0,0);
    put(game,a,'V6 Event Controller');visitor.ctrl=b;const life=b.life;
    await game.move(visitor,'graveyard');await settle(game);assert.equal(b.life,life+2);assert.equal(visitor.ctrl,a);
    put(game,a,'V6 Event Draw');game.priorityRound=async()=>{};const card=put(game,b,'Opt','hand');b.pool.U=1;
    const before=b.library.length;assert.equal(await game.castSpell(b,card,{from:'hand'}),true);await game.flushTriggers();
    assert.equal(game.stack.at(-1).kind,'trigger');await game.resolveTop();assert.equal(b.library.length,before-1);
  });
  test(`v6 ${role}: attachment and granted triggers use distinct controllers`,async()=>{
    for(const name of ['Granted Aura','Attached Aura']){
      const {game,a,b}=context(role),host=put(game,b,'Grizzly Bears'),aura=put(game,a,'V6 '+name);
      assert.equal(await game.attach(aura,host),true);host.attacking=a;
      const ah=a.hand.length,bh=b.hand.length;await game.emit('attacks',{card:host,player:b,defender:a});await game.flushTriggers();
      assert.equal(game.stack.at(-1).ctrl,name==='Granted Aura'?b:a);await settle(game);
      assert.equal(a.hand.length,ah+(name==='Attached Aura'?1:0));assert.equal(b.hand.length,bh+(name==='Granted Aura'?1:0));
      await game.move(aura,'exile');await game.emit('attacks',{card:host,player:b,defender:a});await game.flushTriggers();assert.equal(game.stack.length,0);
    }
  });
  test(`v6 ${role}: base power is set before counters and existing buffs`,async()=>{
    const ctx=context(role),{game,a,state}=ctx,host=put(game,a,'Grizzly Bears');state.targets=[host];
    game.addCounters(host,'+1/+1',2,false,a);
    const buff=put(game,a,'Giant Growth','hand');a.pool.G=1;assert.equal(await game.castSpell(a,buff,{from:'hand'}),true);await settle(game);assert.equal(host.power,7);
    await cast(ctx,'Base Size');assert.equal(host.power,9);assert.equal(host.toughness,9);
    await game.move(host,'exile');await game.move(host,'battlefield',{ctrl:a});assert.equal(host.power,2);
  });
  test(`v6 ${role}: temporary control lasts through the end step and cannot follow a blink`,async()=>{
    for(const blink of [false,true]){
      const ctx=context(role),{game,a,b,state}=ctx,host=put(game,b,'Grizzly Bears');state.targets=[host];host.tapped=true;
      await cast(ctx,'Borrow');assert.equal(host.ctrl,a);assert.equal(host.tapped,false);assert.equal(host.kw('haste'),true);
      await game.emit('endStep',{player:a});await settle(game);assert.equal(host.ctrl,a);
      if(blink){await game.move(host,'exile');await game.move(host,'battlefield',{ctrl:a});}
      game.mainPhase=async()=>{};game.combatPhase=async()=>{};await game.runTurn();assert.equal(host.ctrl,blink?a:b);assert.equal(host.kw('haste'),false);
    }
  });
  test(`v6 ${role}: counter tax uses real mana and preserves the spell only when paid`,async()=>{
    for(const pay of [false,true]){
      const ctx=context(role),{game,a,b,state}=ctx;game.priorityRound=async()=>{};
      const original=b.controller.decide;b.controller.decide=async(g,q)=>q.type==='chooseOption'&&/prevent counter/.test(q.prompt)?'yes':original(g,q);
      const spell=put(game,b,'Opt','hand');b.pool.U=1;assert.equal(await game.castSpell(b,spell,{from:'hand'}),true);b.pool.C=pay?2:1;
      await cast(ctx,'Tax Counter',{resolve:false});await game.resolveTop();assert.equal(spell.zone,pay?'stack':'graveyard');assert.equal(b.pool.C,pay?0:1);
    }
  });
}

for(const role of ['human','ai']) {
  test(`v6 ${role}: target alternatives retain their own qualities and shared controller`,async()=>{
    const ctx=context(role),{game,a,b}=ctx;
    const artifact=put(game,b,'Sol Ring'),enchantment=put(game,b,'V6 Global Grant'),ground=put(game,b,'Grizzly Bears'),flying=put(game,b,'V6 Elf Protection'),land=put(game,b,'Forest');
    const source=put(game,a,'V6 Mixed Removal','hand');
    const targets=typeof source.def.targets==='function'?source.def.targets(game,source,{}):source.def.targets;
    const legal=game.legalTargets(targets[0],source,a);
    for(const card of [artifact,enchantment,flying])assert.ok(legal.includes(card),card.name);
    for(const card of [ground,land])assert.ok(!legal.includes(card),card.name);
    const own=put(game,a,'Grizzly Bears'),ownAura=put(game,a,'V6 Host Death'),otherAura=put(game,a,'V6 Host Death');
    await game.attach(ownAura,own);await game.attach(otherAura,ground);
    const spell=put(game,a,'V6 Enchantment Choice','hand');
    const specs=typeof spell.def.targets==='function'?spell.def.targets(game,spell,{}):spell.def.targets;
    const choices=game.legalTargets(specs[0],spell,a);
    assert.ok(choices.includes(own));assert.ok(!choices.includes(ground));assert.ok(!choices.includes(enchantment));
  });
  test(`v6 ${role}: alternative costs require their condition and commander tax still applies`,async()=>{
    for(const kind of ['Surge','Spectacle']){
      const ctx=context(role),{game,a,b}=ctx;game.priorityRound=async()=>{};
      const card=put(game,a,'V6 '+kind+' Creature','command');card.commander=true;card.cmdCasts=1;a.commanders.push(card);a.pool.G=1;a.pool.C=1;
      const alt=card.def.altCosts[0];
      assert.equal(await game.castSpell(a,card,{from:'command',alt}),false);
      if(kind==='Surge')a.turnState.spellsCast=1;else await game.loseLife(b,1);
      assert.equal(game.castableList(a).some(row=>row.card===card&&row.alt),false);
      a.pool.C=2;const offer=game.castableList(a).find(row=>row.card===card&&row.alt);assert.ok(offer);
      assert.equal(await game.castSpell(a,card,{from:'command',alt:offer.alt}),true);await settle(game);
      assert.equal(card.zone,'battlefield');assert.equal(a.pool.G,0);assert.equal(a.pool.C,0);assert.equal(card.cmdCasts,2);
    }
  });
  test(`v6 ${role}: later permanent control survives expiration of an earlier temporary effect`,async()=>{
    const ctx=context(role),{game,a,b,state}=ctx;const host=put(game,b,'Grizzly Bears');state.targets=[host];
    await cast(ctx,'Borrow');await cast(ctx,'Permanent Control');
    game.mainPhase=async()=>{};game.combatPhase=async()=>{};await game.runTurn();assert.equal(host.ctrl,a);
  });
  test(`v6 ${role}: devour allows zero or multiple sacrifices and uses the actual sacrificed count`,async()=>{
    for(const n of [0,2]){
      const ctx=context(role),{game,a,b}=ctx;const food=[put(game,a,'Grizzly Bears'),put(game,a,'Grizzly Bears')],enemy=put(game,b,'Grizzly Bears');
      const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.type==='chooseCards'&&q.prompt==='Devour: sacrifice creatures'?food.slice(0,n):decide(g,q);
      const source=await cast(ctx,'Devour Creature');assert.equal(source.counters['+1/+1']||0,n*2);
      assert.equal(food.filter(card=>card.zone==='graveyard').length,n);assert.equal(enemy.zone,'battlefield');
    }
  });
  test(`v6 ${role}: optional sacrifice draws only when a creature is sacrificed`,async()=>{
    for(const accept of [false,true]){
      const ctx=context(role),{game,a}=ctx;const host=put(game,a,'Grizzly Bears');const before=a.library.length;
      const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.type==='chooseCards'&&q.prompt==='You may sacrifice a permanent'?(accept?[host]:[]):decide(g,q);
      await cast(ctx,'Sacrifice Draw');assert.equal(host.zone,accept?'graveyard':'battlefield');assert.equal(a.library.length,before-(accept?2:0));
    }
  });
  test(`v6 ${role}: tap or untap offers all three legal choices`,async()=>{
    for(const choice of ['tap','untap','none']){
      const ctx=context(role),{game,a,state}=ctx;const host=put(game,a,'Sol Ring');host.tapped=choice!=='tap';state.targets=[host];
      const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.type==='chooseOption'&&q.aiHint?.kind==='tapUntap'?choice:decide(g,q);
      await cast(ctx,'Tap Choice');assert.equal(host.tapped,choice!=='untap');
    }
  });
  test(`v6 ${role}: exile-until does nothing if its source leaves before the trigger resolves`,async()=>{
    const ctx=context(role),{game,a,b,state}=ctx;game.priorityRound=async()=>{};const host=put(game,b,'Grizzly Bears');state.targets=[host];
    const source=await cast(ctx,'Prison',{resolve:false});await game.resolveTop();await game.flushTriggers();assert.ok(game.stack.length);
    await game.move(source,'hand');await settle(game);assert.equal(host.zone,'battlefield');
  });
}

for(const role of ['human','ai']){
  test(`v6 ${role}: Railway Brawler puts counters on the arriving creature using its power`,async()=>{
    const ctx=context(role),{game,a}=ctx;game.priorityRound=async()=>{};
    const source=put(game,a,'Railway Brawler'),visitor=put(game,a,'Grizzly Bears','hand');
    await game.move(visitor,'battlefield',{ctrl:a});await settle(game);
    assert.equal(visitor.counters['+1/+1'],2);assert.equal(source.counters['+1/+1']||0,0);
    const blinked=put(game,a,'Grizzly Bears','hand');await game.move(blinked,'battlefield',{ctrl:a});await game.move(blinked,'exile');await settle(game);assert.equal(blinked.counters['+1/+1']||0,0);
  });
  test(`v6 ${role}: Stalking Vengeance uses the dead creature's power, lifelink and controller`,async()=>{
    const ctx=context(role),{game,a,b,state}=ctx;game.priorityRound=async()=>{};
    put(game,a,'Stalking Vengeance');const victim=put(game,a,'Grizzly Bears');state.targets=[b];
    MTG.E.pumpUntilEOT(game,victim,2,2,['lifelink']);assert.equal(victim.power,4);
    const before=a.life,enemy=b.life;await game.destroy(victim);await settle(game);
    assert.equal(b.life,enemy-4);assert.equal(a.life,before+4);
  });
  test(`v6 ${role}: until-your-next-turn pump survives the opponent's turn then expires`,async()=>{
    const ctx=context(role),{game,a,b,state}=ctx;const host=put(game,a,'Grizzly Bears');state.targets=[host];
    await cast(ctx,'Next Turn Pump');assert.equal(host.power,4);
    game.mainPhase=async()=>{};game.combatPhase=async()=>{};
    game.turnPlayer=b;await game.runTurn();assert.equal(host.power,4);
    game.turnPlayer=a;await game.runTurn();assert.equal(host.power,2);
  });
}

test('v6 subtype alternatives keep ordinary creatures legal without admitting arbitrary artifacts',()=>{
  const {game,a,b}=context();const ordinary=put(game,b,'Grizzly Bears'),artifact=put(game,b,'Sol Ring');
  const ship=put(game,b,'Sol Ring');ship.def={...ship.def,subtypes:['Spacecraft']};game.recalc();
  const spell=put(game,a,'Gravkill','hand');const targets=typeof spell.def.targets==='function'?spell.def.targets(game,spell,{}):spell.def.targets;
  const legal=game.legalTargets(targets[0],spell,a);assert.ok(legal.includes(ordinary));assert.ok(legal.includes(ship));assert.ok(!legal.includes(artifact));
  const raptor=MTG.ORACLE_BATCHES.flatMap(b=>b.cards).find(c=>c.raw.name==='Ragamuffin Raptor');
  const alternative=raptor.implementation[0].targets[0];assert.equal(alternative.alternatives[0].subtype,undefined);assert.equal(alternative.alternatives[1].subtype,'Food');
  assert.ok(alternative.alternatives.every(branch=>branch.controller==='you'&&branch.zone==='graveyard'));
});
