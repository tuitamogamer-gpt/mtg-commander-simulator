import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { extensionTarget } from '../scripts/oracle-extensions-v5.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const definitions = [
  ['Once Growth','{G}: This creature gets +2/+2 until end of turn. Activate only once each turn.'],
  ['Early Growth','{G}: This creature gets +2/+2 until end of turn. Activate only during your turn, before attackers are declared.'],
  ['Sorcery Growth','{G}: This creature gets +2/+2 until end of turn. Activate only as a sorcery.'],
  ['Threshold Bear','Threshold — This creature gets +3/+3 as long as there are seven or more cards in your graveyard.'],
  ['Metalcraft Bear','Metalcraft — This creature has flying as long as you control three or more artifacts.'],
  ['Second Draw','Whenever you draw your second card each turn, put a +1/+1 counter on this creature.'],
  ['Heroic Bear','Heroic — Whenever you cast a spell that targets this creature, put a +1/+1 counter on this creature.'],
  ['Search Bear','When this creature enters, you may search your library for a basic land card, reveal it, put it into your hand, then shuffle.'],
  ['Reanimate Bear','When this creature enters, return target creature card from your graveyard to the battlefield.'],
  ['Fragile Bear','When this creature becomes the target of a spell or ability, sacrifice it.'],
  ['Prevent Bear','{T}: Prevent the next 3 damage that would be dealt to any target this turn.'],
  ['Large Evasion','This creature can\'t be blocked by creatures with power 3 or greater.'],
  ['Delayed Draw',"Draw a card at the beginning of the next turn's upkeep.",'Instant'],
  ['Unblock Spell',"Target creature can't be blocked this turn.",'Sorcery'],
  ['Regen Spell','Regenerate target creature.','Instant'],
  ['Small Kill','Destroy target creature with power 2 or less.','Instant'],
  ['Equipment Arrival','When this Equipment enters, attach it to target creature you control.\nEquipped creature gets +1/+1.\nEquip {1}','Artifact — Equipment'],
  ['V4 Bear','When this creature enters, destroy target artifact. Draw a card.'],
  ['V4 Ability','{G}, {T}: Tap or untap target artifact.'],
  ['Library Bear','When this creature enters, look at the top three cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest into your graveyard.'],
  ['Pay Bear','When this creature enters, you may pay 2 life. If you do, draw a card.'],
  ['Count Bear','This creature gets +1/+1 for each artifact you control.'],
  ['Soulshift Bear','Soulshift 3'],
  ['Modular Bear','Modular 2','Artifact Creature — Construct'],
  ['Fabricate Bear','Fabricate 2'],
  ['Afflict Bear','Afflict 3'],
  ['Ingest Bear','Ingest'],
  ['Offspring Bear','Offspring {1}'],
  ['Living Blade','Living weapon\nEquipped creature gets +2/+2.\nEquip {2}','Artifact — Equipment'],
  ['Mirrodin Blade','For Mirrodin!\nEquipped creature gets +1/+1.\nEquip {2}','Artifact — Equipment'],
];
const fixtures=definitions.map(([name,oracle,type='Creature — Bear'],i)=>{
  name='V5 '+name;
  const card={name,oracle_text:oracle,type_line:type,layout:'normal',mana_cost:'{1}{G}',power:'2',toughness:'2'};
  const semantic=semanticClass(card);
  assert.ok(semantic.semanticClass,`${name}: ${semantic.reason}`);
  return {position:i+1,oracleId:'v5-'+i,scryfallId:'v5-print-'+i,...semantic,
    raw:{name,cost:card.mana_cost,oracle,types:type.split(' — ')[0].split(' '),subtypes:type.includes('Equipment')?['Equipment']:['Bear'],super:[],power:'2',toughness:'2',_ci:['G'],_oracleId:'v5-'+i,_scryfallId:'v5-print-'+i},
    catalog:{typeLine:type,commanderLegality:'legal'}};
});
MTG.registerOracleBatch({id:'oracle-v5-test',sequence:9999,cards:fixtures});
MTG.initData(MTG.RAW_DATA);

function context(role='human') {
  const state={targets:[],trace:[]};
  const control={decide:async(g,q)=>{
    state.trace.push(q);
    if(q.type==='priority') return {kind:'pass'};
    if(q.type==='chooseTargets') return [...state.targets.filter(c=>q.candidates.includes(c)),...q.candidates.filter(c=>!state.targets.includes(c))].slice(0,q.max??1);
    if(q.type==='chooseCards') return q.from.slice(0,q.max??q.min??1);
    if(q.type==='chooseOption') return q.options.find(o=>o.key==='yes')?.key||q.options[0].key;
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
  const card=put(game,a,'V5 '+name,'hand'); a.pool.C+=1; a.pool.G+=1;
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

test('extension grammar rejects unknown suffixes and retains every target restriction',()=>{
  assert.deepEqual(extensionTarget('target creature card from your graveyard'),{what:'creature',zone:'graveyard',controller:'you',min:1});
  for(const phrase of ['target creature with power 2 or less','target tapped creature','target nonblack creature','target creature without flying']) assert.ok(extensionTarget(phrase));
  for(const phrase of ['target creature unless its controller pays {1}','target creature or unicorn','target creature from nowhere']) assert.equal(extensionTarget(phrase),null);
  for(const [name,oracle,type='Creature — Bear'] of definitions) {
    const result=semanticClass({name,oracle_text:oracle+'\nThen win the game.',type_line:type,layout:'normal',mana_cost:'{1}{G}',power:'2',toughness:'2'});
    assert.equal(result.semanticClass,undefined,name);
  }
});

for(const role of ['human','ai']) {
  test(`v5 ${role}: real paid search/reanimation casts, legal choices and zones`,async()=>{
    const ctx=context(role);
    const source=await cast(ctx,'Search Bear',{pilot:true});
    assert.equal(source.zone,'battlefield');
    assert.equal(ctx.a.hand.filter(c=>c.name==='Forest').length,1);
    assert.equal(ctx.a.library.length,19);
    const dead=put(ctx.game,ctx.a,'Grizzly Bears','graveyard');
    ctx.state.targets=[dead];
    await cast(ctx,'Reanimate Bear',{pilot:true});
    assert.equal(dead.zone,'battlefield'); assert.equal(dead.ctrl,ctx.a);
  });
  test(`v5 ${role}: conditional statics cross the threshold in both directions`,async()=>{
    const ctx=context(role), {game,a}=ctx;
    const bear=await cast(ctx,'Threshold Bear',{pilot:true});
    assert.equal(bear.power,2);
    const grave=[]; for(let i=0;i<7;i++) grave.push(put(game,a,'Forest','graveyard'));
    game.recalc(); assert.equal(bear.power,5);
    await game.move(grave[0],'hand'); game.recalc(); assert.equal(bear.power,2);
    const metal=await cast(ctx,'Metalcraft Bear',{pilot:true});
    assert.equal(metal.kw('flying'),false);
    const arts=[]; for(let i=0;i<3;i++) arts.push(put(game,a,'Sol Ring'));
    game.recalc(); assert.equal(metal.kw('flying'),true);
    await game.destroy(arts[0]); game.recalc(); assert.equal(metal.kw('flying'),false);
  });
  test(`v5 ${role}: restricted activation pays, uses Stack and cannot repeat`,async()=>{
    const ctx=context(role), {game,a}=ctx; const bear=await cast(ctx,'Once Growth',{pilot:true});
    bear.sick=false; a.pool.G=3;
    const action=game.activatableList(a).find(e=>e.card===bear);
    assert.ok(action); assert.equal(await game.activateAbility(a,action),true);
    assert.equal(a.pool.G,2); await settle(game); assert.ok(ctx.state.stackKinds.includes('ability'));
    assert.equal(bear.power,4); assert.equal(game.activatableList(a).some(e=>e.card===bear),false);
    assert.equal(await game.activateAbility(a,action),false,'a stale once-per-turn action cannot pay again');
    assert.equal(a.pool.G,2);
  });
  test(`v5 ${role}: second draw triggers once and next-upkeep draw uses delayed Stack`,async()=>{
    const ctx=context(role), {game,a,b}=ctx; const bear=await cast(ctx,'Second Draw',{pilot:true});
    for(let i=0;i<3;i++) {await game.draw(a,1);await settle(game);assert.equal(bear.counters['+1/+1']||0,i===0?0:1);}
    await cast(ctx,'Delayed Draw'); const before=a.hand.length;
    await game.emit('upkeep',{player:a}); await settle(game); assert.equal(a.hand.length,before);
    game.turnNo++; await game.emit('upkeep',{player:b}); await game.flushTriggers();
    assert.equal(game.stack.at(-1).kind,'trigger'); await settle(game); assert.equal(a.hand.length,before+1);
    game.turnNo++; await game.emit('upkeep',{player:a}); await settle(game); assert.equal(a.hand.length,before+1);
  });
}

test('heroic observes casting and never spell copies; fragility observes targeting',async()=>{
  const ctx=context(), {game,a,state}=ctx;
  const heroic=await cast(ctx,'Heroic Bear'); state.targets=[heroic];
  await cast(ctx,'Unblock Spell',{resolve:false});
  const original=game.stack.find(s=>s.kind==='spell');
  assert.ok(original); await game.copySpell(original,a); await settle(game);
  assert.equal(heroic.counters['+1/+1'],1);
  const fragile=await cast(ctx,'Fragile Bear'); state.targets=[fragile];
  await cast(ctx,'Unblock Spell'); assert.equal(fragile.zone,'graveyard');
});

test('prevention consumes only its amount, expires with object identity and respects cannot-prevent',async()=>{
  const ctx=context(), {game,a,b,state}=ctx;
  const cleric=await cast(ctx,'Prevent Bear'); cleric.sick=false;
  const victim=put(game,a,'Grizzly Bears'); state.targets=[victim];
  const action=game.activatableList(a).find(e=>e.card===cleric); await game.activateAbility(a,action); await settle(game);
  await game.damageAny(null,victim,2); assert.equal(victim.damage,0);
  await game.damageAny(null,victim,2); assert.equal(victim.damage,1);
  await game.move(victim,'hand'); await game.move(victim,'battlefield',{ctrl:a});
  await game.damageAny(null,victim,1); assert.equal(victim.damage,1);
  cleric.tapped=false; state.targets=[b];
  await game.activateAbility(a,game.activatableList(a).find(e=>e.card===cleric));await settle(game);
  const life=b.life; await game.damageAny(null,b,2); assert.equal(b.life,life);
  await game.damageAny(null,b,3); assert.equal(b.life,life-2);
});

for(const role of ['human','ai']) {
  test(`v5 ${role}: effect-sequence adapters keep targets, follow-up draws and paid activation`,async()=>{
    const ctx=context(role),{game,a,b,state}=ctx;
    const ring=put(game,b,'Sol Ring');state.targets=[ring];
    const hand=a.hand.length;await cast(ctx,'V4 Bear',{pilot:true});
    assert.equal(ring.zone,'graveyard');assert.equal(a.hand.length,hand+1);
    const tool=await cast(ctx,'V4 Ability');tool.sick=false;
    const own=put(game,a,'Sol Ring');own.tapped=true;state.targets=[own];a.pool.G=1;
    const action=game.activatableList(a).find(x=>x.card===tool);assert.ok(action);
    await game.activateAbility(a,action);await settle(game);
    assert.equal(a.pool.G,0);assert.ok(state.stackKinds.includes('ability'));
  });
  test(`v5 ${role}: library selection, optional payment and count statics`,async()=>{
    const ctx=context(role),{game,a}=ctx;
    put(game,a,'Grizzly Bears','library');
    await cast(ctx,'Library Bear',{pilot:true});
    assert.equal(a.hand.some(c=>c.name==='Grizzly Bears'),true);assert.equal(a.graveyard.length,2);
    const before=a.life,hand=a.hand.length;
    await cast(ctx,'Pay Bear');assert.equal(a.life,before-2);assert.equal(a.hand.length,hand+1);
    const bear=await cast(ctx,'Count Bear');assert.equal(bear.power,2);
    const ring=put(game,a,'Sol Ring');game.recalc();assert.equal(bear.power,3);
    await game.move(ring,'hand');game.recalc();assert.equal(bear.power,2);
  });
  test(`v5 ${role}: modular, fabricate and equipment token triggers use real zones and counters`,async()=>{
    const ctx=context(role),{game,a,state}=ctx;
    const first=await cast(ctx,'Modular Bear',{pilot:true});assert.equal(first.counters['+1/+1'],2);
    const second=await cast(ctx,'Modular Bear',{pilot:true});state.targets=[second];
    await game.destroy(first);await settle(game);assert.equal(second.counters['+1/+1'],4);
    const fabricate=await cast(ctx,'Fabricate Bear',{pilot:true});
    assert.ok(fabricate.counters['+1/+1']===2||game.creatures(a).filter(c=>c.hasSub('Servo')).length===2);
    const blade=await cast(ctx,'Living Blade');const germ=game.creatures(a).find(c=>c.hasSub('Germ'));
    assert.ok(germ);assert.equal(blade.attachedTo,germ.iid);assert.equal(germ.power,2);assert.equal(germ.toughness,2);
    const mirrodin=await cast(ctx,'Mirrodin Blade');const rebel=game.creatures(a).find(c=>c.hasSub('Rebel'));
    assert.ok(rebel);assert.equal(mirrodin.attachedTo,rebel.iid);assert.equal(rebel.power,3);
  });
}

test('before-attackers timing allows own-turn priority and rejects stale/extra-combat actions', async()=>{
  const ctx=context(),{game,a,b}=ctx;
  const source=await cast(ctx,'Early Growth');a.pool.G=20;
  const entry=game.activatableList(a).find(row=>row.card===source);assert.ok(entry);
  game.priorityRound=async()=>{};
  for(const [phase,step] of [['upkeep','upkeep'],['draw','draw'],['main1','main'],['combat','begin']]) {
    game.phase=phase;game.step=step;
    assert.ok(game.activatableList(a,true).some(row=>row.card===source),phase);
    assert.equal(await game.activateAbility(a,entry),true,phase+' permits responses with a nonempty Stack');
  }
  assert.equal(game.stack.length,4);await settle(game);
  const pool=a.pool.G;
  for(const [phase,step] of [['combat','attackers'],['combat','blockers'],['main2','main'],['end','end']]) {
    game.phase=phase;game.step=step;
    assert.equal(await game.activateAbility(a,entry),false,phase+'/'+step);
  }
  game.phase='main1';game.turnPlayer=b;
  assert.equal(await game.activateAbility(a,entry),false,'opponent turn');
  game.turnPlayer=a;a.turnState.reachedDeclareAttackers=true;game.phase='combat';game.step='begin';
  assert.equal(await game.activateAbility(a,entry),false,'extra combat');assert.equal(a.pool.G,pool);
  a.turnState.reachedDeclareAttackers=false;source.tapped=true;
  await game.combatPhase(a);
  assert.equal(a.turnState.reachedDeclareAttackers,true,'deadline passes with no eligible attackers');
  game.phase='main1';assert.equal(await game.activateAbility(a,entry),false,'extra main phase after combat');
});

test('sorcery-speed activation revalidates timing before spending costs',async()=>{
  const ctx=context(),{game,a,b}=ctx;
  const source=await cast(ctx,'Sorcery Growth');a.pool.G=5;
  const entry=game.activatableList(a).find(row=>row.card===source);assert.ok(entry);
  game.phase='upkeep';assert.equal(await game.activateAbility(a,entry),false);
  game.phase='main1';game.turnPlayer=b;assert.equal(await game.activateAbility(a,entry),false);
  game.turnPlayer=a;game.stack.push({kind:'test'});assert.equal(await game.activateAbility(a,entry),false);game.stack.pop();
  assert.equal(a.pool.G,5);assert.equal(await game.activateAbility(a,entry),true);await settle(game);
  assert.equal(a.pool.G,4);assert.equal(source.power,4);
});

for(const role of ['human','ai']) {
  test(`v5 ${role}: arrival toughness follows the event creature, changes and last known identity`,async()=>{
    const ctx=context(role),{game,a}=ctx;
    const chorus=put(game,a,'Angelic Chorus','hand');a.pool.C=3;a.pool.W=2;
    game.priorityRound=async()=>{};
    assert.equal(await game.castSpell(a,chorus,{from:'hand'}),true);await settle(game);
    const bear=put(game,a,'Grizzly Bears','hand');a.pool.C=1;a.pool.G=1;
    assert.equal(await game.castSpell(a,bear,{from:'hand'}),true);await game.resolveTop();await game.flushTriggers();
    assert.equal(game.stack.length,1);const life=a.life;
    game.addCounters(bear,'+1/+1',3);await settle(game);assert.equal(a.life,life+5,'current toughness on resolution');
    await game.move(bear,'hand');await game.move(bear,'battlefield',{ctrl:a});await game.flushTriggers();
    game.addCounters(bear,'+1/+1',4);const before=a.life;
    await game.move(bear,'exile');await game.move(bear,'battlefield',{ctrl:a});await game.flushTriggers();
    await settle(game);assert.equal(a.life,before+6+2,'old trigger uses old 6 toughness; blink trigger uses new 2');
  });
  test(`v5 ${role}: another-creature death uses that creature's last known toughness`,async()=>{
    const ctx=context(role),{game,a}=ctx;
    put(game,a,'South Wind Avatar');const bear=put(game,a,'Grizzly Bears');game.addCounters(bear,'+1/+1',3);
    const life=a.life;await game.destroy(bear);await settle(game);assert.equal(a.life,life+5);
  });
}

test('intervening-if condition must hold when triggering and resolving',async()=>{
  const ctx=context(),{game,a}=ctx;
  const spirit=put(game,a,'Apothecary Geist');const companion=put(game,a,'Selfless Spirit');
  const before=a.life;game.priorityRound=async()=>{};
  await game.emit('etb',{card:spirit,player:a});await game.flushTriggers();assert.equal(game.stack.length,1);
  await game.move(companion,'exile');await settle(game);assert.equal(a.life,before);
  await game.emit('etb',{card:spirit,player:a});await game.flushTriggers();assert.equal(game.stack.length,0);
});

test('death damage keeps boosted source power after sacrifice and blink',async()=>{
  const ctx=context(),{game,a,b,state}=ctx;
  const scamp=put(game,a,'Cacophony Scamp');game.addCounters(scamp,'+1/+1',4);state.targets=[b];game.priorityRound=async()=>{};
  const life=b.life;await game.sacrifice(a,scamp);await game.flushTriggers();
  await game.move(scamp,'battlefield',{ctrl:a});await settle(game);assert.equal(b.life,life-5);
});

test('source-status intervening if uses last known tapped state after leaving',async()=>{
  for(const tapBeforeLeaving of [false,true]){
    const ctx=context(),{game,a}=ctx;const source=put(game,a,'Nim Abomination');const life=a.life;
    await game.emit('endStep',{player:a});await game.flushTriggers();assert.equal(game.stack.length,1);
    if(tapBeforeLeaving)game.tap(source);
    await game.move(source,'hand');await game.move(source,'battlefield',{ctrl:a});await settle(game);
    assert.equal(a.life,life-(tapBeforeLeaving?0:3));
  }
});

test('optional-payment decline does not spend life or execute the dependent draw',async()=>{
  const ctx=context(),{a}=ctx;const decide=a.controller.decide;
  a.controller.decide=async(g,q)=>q.type==='chooseOption'&&q.prompt==='Pay the optional cost?'?'no':decide(g,q);
  const life=a.life,hand=a.hand.length;await cast(ctx,'Pay Bear');assert.equal(a.life,life);assert.equal(a.hand.length,hand);
});

test('unearth rechecks graveyard identity, cannot return a new object, and expires after blink',async()=>{
  const ctx=context(),{game,a}=ctx;game.priorityRound=async()=>{};
  const card=put(game,a,'Dregscape Zombie','graveyard');a.pool.B=3;
  const action=game.activatableList(a).find(e=>e.card===card&&e.gyAbility);assert.ok(action);
  game.phase='upkeep';assert.equal(await game.activateAbility(a,action),false);assert.equal(a.pool.B,3);
  game.phase='main1';assert.equal(await game.activateAbility(a,action),true);
  await game.move(card,'exile');await game.move(card,'graveyard');await settle(game);assert.equal(card.zone,'graveyard');
  assert.equal(await game.activateAbility(a,game.activatableList(a).find(e=>e.card===card&&e.gyAbility)),true);await settle(game);
  assert.equal(card.zone,'battlefield');assert.equal(card.kw('haste'),true);
  await game.move(card,'hand');assert.equal(card.zone,'exile','unearth replaces a bounce with exile');
  await game.move(card,'battlefield',{ctrl:a});await game.emit('endStep',{player:a});await settle(game);
  assert.equal(card.zone,'battlefield','old delayed exile cannot exile the returned new object');
});

test('cannot-prevent bypasses a new prevention shield without consuming it',async()=>{
  const ctx=context(),{game,a,b,state}=ctx;
  const source=await cast(ctx,'Prevent Bear');source.sick=false;state.targets=[b];
  await game.activateAbility(a,game.activatableList(a).find(e=>e.card===source));await settle(game);
  const torment=put(game,a,'Everlasting Torment');const life=b.life;
  await game.damagePlayer(null,b,2);assert.equal(b.life,life-2);
  await game.move(torment,'exile');await game.damagePlayer(null,b,3);assert.equal(b.life,life-2);
});
