import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
function fixture(){
  const game=new M.Game({seed:10102026,paced:false});game.speedFactor=0;
  const f={game,trace:[],choices:{}};
  const decide=async(_g,q)=>{
    f.trace.push(q);
    if(q.type==='priority')return f.priority?.(q)||{kind:'pass'};
    if(q.type==='main')return{kind:'done'};
    if(q.type==='chooseTargets')return f.chooseTargets?.(q)||(q.quickTarget?[q.quickTarget]:q.candidates.slice(0,q.min||0));
    if(q.type==='chooseCards')return f.chooseCards?.(q)||q.from.slice(0,q.min||0);
    if(q.type==='chooseOption')return f.choices[q.aiHint?.kind]||q.options.find(o=>o.key==='yes')?.key||q.options[0]?.key;
    if(q.type==='chooseX')return f.chooseX?.(q)??q.min??0;
    if(q.type==='orderTriggers')return q.triggers;
    if(q.type==='scry')return{top:q.cards,bottom:[]};
    if(q.type==='attackers')return f.attackers?.(q)||[];
    if(q.type==='blockers')return [];
    if(q.type==='combatReview')return [];
    return null;
  };
  const players=Array.from({length:4},(_,i)=>game.addPlayer('Seat '+(i+1),{name:'Native trigger audit'},{decide},false));
  const [me,rival]=players;game.turnPlayer=me;game.turnNo=8;game.phase='main1';game.step='main';
  function put(name,zone='battlefield',owner=me){
    assert.ok(M.DEFS[name],`native definition ${name}`);const c=new M.CardInst(M.DEFS[name],owner);
    c.zone=zone;c.ctrl=owner;c.sick=false;(zone==='battlefield'?game.battlefield:owner[zone]).push(c);game.recalc();return c;
  }
  for(const p of players)for(let i=0;i<30;i++)put('Island','library',p);
  async function settle(){for(let i=0;i<70;i++){await game.flushTriggers();if(!game.stack.length){assert.equal(game.pendingTriggers.length,0);assertGameStateInvariants(game);return;}await game.resolveTop();}assert.fail('bounded native stack settles');}
  async function cast(name,lands,targets=[]){const c=put(name,'hand');lands.map(n=>put(n));assert.equal(await game.castSpell(me,c,{from:'hand',quickTargets:targets}),true,`paid native ${name}`);assert.equal(c.castMeta?.manaSpent,lands.length,`the native receipt records the printed cost of ${name}`);assert.equal(Object.values(me.pool).reduce((a,b)=>a+b,0),0);await settle();return c;}
  return Object.assign(f,{players,me,rival,put,settle,cast});
}

for(const [name,loss,lands] of [
  ['Panharmonicon','Song of the Dryads',['Forest','Forest','Forest']],
  ['Yarok, the Desecrated','Darksteel Mutation',['Plains','Plains']],
  ['Harmonic Prodigy','Darksteel Mutation',['Plains','Plains']],
])test(`${name}: native ability loss stops doubling a paid Visionary ETB`,async()=>{
  const f=fixture(),doubler=f.put(name);await f.cast(loss,lands,[doubler]);
  assert.equal(doubler.cur.abilitiesDisabled,true);const hand=f.me.hand.length;
  await f.cast('Elvish Visionary',['Forest','Forest']);assert.equal(f.me.hand.length,hand+1);
});

test('Veyran: native ability loss stops doubling the unaffected Iconoclast trigger',async()=>{
  const f=fixture(),veyran=f.put('Veyran, Voice of Duality'),iconoclast=f.put('Third Path Iconoclast');
  await f.cast('Darksteel Mutation',['Plains','Plains'],[veyran]);
  assert.equal(veyran.cur.abilitiesDisabled,true);const before=f.game.bf().filter(c=>c.isToken).length;
  await f.cast('Shock',['Mountain'],[f.rival]);
  assert.equal(f.rival.life,38);assert.equal(f.game.bf().filter(c=>c.isToken).length,before+1);assert.ok(iconoclast.zone==='battlefield');
});

for(const name of ['Ancient Greenwarden','Yarok, the Desecrated'])test(`${name}: an ordinary land play doubles the native Baloths landfall event`,async()=>{
  const f=fixture();f.put(name);f.put('Rampaging Baloths');const land=f.put('Forest','hand');
  assert.equal(await f.game.playLand(f.me,land),true);await f.settle();
  assert.equal(f.game.bf().filter(c=>c.isToken&&c.hasSub('Beast')).length,2);
});

test('Panharmonicon: artifact land play doubles native Tracker landfall',async()=>{
  const f=fixture();f.put('Panharmonicon');f.put('Tireless Tracker');const land=f.put('Tree of Tales','hand');
  assert.equal(await f.game.playLand(f.me,land),true);await f.settle();
  assert.equal(f.game.bf().filter(c=>c.isToken&&c.hasSub('Clue')).length,2);
});

test('Harmonic Prodigy: native Arcane Adaptation makes its own Shaman prowess eligible',async()=>{
  const f=fixture(),prodigy=f.put('Harmonic Prodigy');f.choices.chooseType='Shaman';
  await f.cast('Arcane Adaptation',['Island','Island','Island']);
  assert.equal(prodigy.hasSub('Shaman'),true);const power=prodigy.power;
  await f.cast('Shock',['Mountain'],[f.rival]);assert.equal(prodigy.power,power+2);
});

for(const count of [1,2])test(`${count} native Krang source(s): draw-trigger increases are additive`,async()=>{
  const f=fixture();if(count===2)f.put('Mirror Box');
  const krangs=Array.from({length:count},()=>f.put('Krang, the All-Powerful'));
  const vandal=f.put('Faerie Vandal');await f.cast('Divination',['Island','Island','Island']);
  assert.equal(vandal.counters['+1/+1'],count+1);
  assert.ok(krangs.every(c=>c.counters['+1/+1']===count+1));
});

test('Krang: native ability loss suppresses extra draw-trigger events',async()=>{
  const f=fixture(),krang=f.put('Krang, the All-Powerful'),vandal=f.put('Faerie Vandal');
  await f.cast('Darksteel Mutation',['Plains','Plains'],[krang]);
  assert.equal(krang.cur.abilitiesDisabled,true);await f.cast('Divination',['Island','Island','Island']);
  assert.equal(vandal.counters['+1/+1'],1);
});

for(const name of ['Krang, the All-Powerful','Baxter, Fly in the Ointment','Veyran, Voice of Duality'])test(`${name}: paid Ghostly Flicker cannot give an old source trigger to the new incarnation`,async()=>{
  const f=fixture(),source=f.put(name),land=f.put('Island'),flicker=f.put('Ghostly Flicker','hand');
  const mana=Array.from({length:3},()=>f.put('Island'));let responded=false;
  f.priority=q=>{
    if(q.player!==f.me||responded||!q.stack.some(so=>so.kind==='trigger'&&so.srcCard===source))return;
    const e=q.casts.find(c=>c.card===flicker);assert.ok(e,'native response is offered');responded=true;
    return{kind:'cast',card:flicker,from:e.from,alt:e.alt,quickTargets:[source,land]};
  };
  const version=source.zoneVersion;
  await f.cast(name==='Veyran, Voice of Duality'?'Shock':'Divination',name==='Veyran, Voice of Duality'?['Mountain']:['Island','Island','Island'],name==='Veyran, Voice of Duality'?[f.rival]:[]);
  assert.equal(responded,true);assert.ok(mana.filter(c=>c.tapped).length>=2);assert.ok(source.zoneVersion>version);
  assert.equal(source.counters['+1/+1']||0,0);assert.equal(source.power,Number(source.def.power));
});

test('Harmonic Prodigy: simultaneous Damnation preserves the dying Shaman trigger doubling',async()=>{
  const f=fixture(),prodigy=f.put('Harmonic Prodigy'),artist=f.put('Blood Artist');
  f.choices.chooseType='Shaman';await f.cast('Arcane Adaptation',['Island','Island','Island']);
  assert.equal(artist.hasSub('Shaman'),true);const before=f.me.life;
  await f.cast('Damnation',['Swamp','Swamp','Swamp','Swamp']);
  assert.equal(prodigy.zone,'graveyard');assert.equal(artist.zone,'graveyard');
  assert.equal(f.me.life,before,'four mandatory Artist targets choose the first player and gain back the same life');
  const targetChoices=f.trace.filter(q=>q.type==='chooseTargets'&&q.src===artist);
  assert.equal(targetChoices.length,4,'two creature deaths each create two Artist abilities from pre-death state');
});

test('Felidar Sovereign: a native upkeep trigger belongs to its original controller after Ray of Command',async()=>{
  const f=fixture(),source=f.put('Felidar Sovereign'),ray=f.put('Ray of Command','hand',f.rival);
  f.rival.life=39;const mana=Array.from({length:4},()=>f.put('Island','battlefield',f.rival));let responded=false,stolen=false,paid=false;
  f.priority=q=>{
    if(source.ctrl===f.rival){stolen=true;paid=mana.every(c=>c.tapped);}
    if(q.player!==f.rival||responded||!q.stack.some(so=>so.kind==='trigger'&&so.srcCard===source))return;
    const e=q.casts.find(c=>c.card===ray);assert.ok(e);responded=true;
    return{kind:'cast',card:ray,from:e.from,alt:e.alt,quickTarget:source};
  };
  await f.game.runUpkeepStepV90(f.me);await f.settle();
  assert.equal(responded,true);assert.equal(stolen,true);assert.equal(paid,true);
  assert.equal(f.game.winner?.idx??null,f.me.idx,'the original player still has forty life at resolution');
});

test('Felidar Sovereign: losing life in native upkeep priority invalidates its intervening if',async()=>{
  const f=fixture(),source=f.put('Felidar Sovereign'),shock=f.put('Shock','hand'),land=f.put('Mountain');let responded=false;
  f.priority=q=>{
    if(q.player!==f.me||responded||!q.stack.some(so=>so.kind==='trigger'&&so.srcCard===source))return;
    const e=q.casts.find(c=>c.card===shock);assert.ok(e);responded=true;
    return{kind:'cast',card:shock,from:e.from,alt:e.alt,quickTarget:f.me};
  };
  await f.game.runUpkeepStepV90(f.me);await f.settle();
  assert.equal(responded,true);assert.equal(land.tapped,true);assert.equal(f.me.life,38);assert.equal(f.game.gameOver,false);
});

for(const blink of [false,true])test(`Rainbow Vale: delayed control ${blink?'ignores a native-blinked new land':'changes the original land at native end step'}`,async()=>{
  const f=fixture(),vale=f.put('Rainbow Vale'),shock=f.put('Shock','hand');
  assert.equal(await f.game.castSpell(f.me,shock,{from:'hand',quickTargets:[f.rival]}),true);
  assert.equal(vale.tapped,true);assert.equal(f.rival.life,38);assert.equal(f.game.delayed.length,1);
  const version=vale.zoneVersion;
  if(blink){const witness=f.put('Grizzly Bears');await f.cast('Ghostly Flicker',['Island','Island','Island'],[vale,witness]);assert.ok(vale.zoneVersion>version);}
  await f.game.runEndStepV90(f.me);await f.settle();
  assert.equal(vale.ctrl.idx,(blink?f.me:f.rival).idx);
});

test('Monarch: paid Thorn of the Black Rose creates a counterable end-step draw trigger',async()=>{
  const f=fixture();await f.cast('Thorn of the Black Rose',['Swamp','Swamp','Swamp','Swamp']);
  assert.equal(f.game.monarch?.idx,f.me.idx);const before=f.me.hand.length,stifle=f.put('Stifle','hand',f.rival),mana=f.put('Island','battlefield',f.rival);let responded=false;
  f.priority=q=>{
    if(q.player!==f.rival||responded)return;
    const draw=q.stack.find(so=>so.kind==='trigger'&&/Monarch/i.test(so.name));if(!draw)return;
    const e=q.casts.find(c=>c.card===stifle);assert.ok(e);responded=true;
    return{kind:'cast',card:stifle,from:e.from,alt:e.alt,quickTarget:draw};
  };
  await f.game.runEndStepV90(f.me);await f.settle();
  assert.equal(responded,true,'the draw is announced on the stack before a card is drawn');
  assert.equal(mana.tapped,true);assert.equal(f.me.hand.length,before);assert.equal(f.game.monarch?.idx,f.me.idx);
});

for(const counter of [false,true])test(`Monarch: native combat crown trigger ${counter?'can be Stifled':'resolves after responses'}`,async()=>{
  const f=fixture();await f.cast('Thorn of the Black Rose',['Swamp','Swamp','Swamp','Swamp']);
  const attacker=f.put('Grizzly Bears','battlefield',f.rival),stifle=f.put('Stifle','hand'),mana=f.put('Island');
  f.game.turnPlayer=f.rival;f.attackers=()=>[{card:attacker,target:f.me}];
  let observed=false,responded=false;
  f.priority=q=>{
    if(q.player!==f.me||responded)return;
    const crown=q.stack.find(so=>so.kind==='trigger'&&/Monarch/i.test(so.name));if(!crown)return;
    observed=true;assert.equal(f.game.monarch?.idx,f.me.idx,'combat damage has not bypassed the stack');
    assert.equal(crown.ctrl.idx,f.me.idx);assert.equal(crown.srcCard??null,null,'the inherent crown ability has no source');
    if(!counter)return;
    const e=q.casts.find(c=>c.card===stifle);assert.ok(e);responded=true;
    return{kind:'cast',card:stifle,from:e.from,alt:e.alt,quickTarget:crown};
  };
  await f.game.combatPhase(f.rival);await f.settle();
  assert.equal(f.me.life,38);assert.equal(observed,true);assert.equal(responded,counter);
  assert.equal(mana.tapped,counter);assert.equal(f.game.monarch?.idx,(counter?f.me:f.rival).idx);
});

test('Massacre Girl: an old delayed death chain affects the native-blinked new Girl',async()=>{
  const f=fixture(),elf=f.put('Llanowar Elves','battlefield',f.rival),big=f.put('Colossal Dreadmaw','battlefield',f.rival);
  const girl=f.put('Massacre Girl','hand'),flicker=f.put('Ghostly Flicker','hand'),island=f.put('Island');
  f.chooseTargets=q=>q.max===2&&q.candidates.includes(girl)&&q.candidates.includes(island)?[girl,island]:undefined;
  Array.from({length:3},()=>f.put('Island'));Array.from({length:5},()=>f.put('Swamp'));let responded=false,girlPaid=false;
  f.priority=q=>{
    if(q.player!==f.me||responded||!q.stack.some(so=>so.kind==='trigger'&&so.name.includes('Massacre Girl chain')))return;
    const e=q.casts.find(c=>c.card===flicker);assert.ok(e);girlPaid=girl.castMeta?.manaSpent===5;responded=true;
    return{kind:'cast',card:flicker,from:e.from,alt:e.alt,quickTargets:[girl,island]};
  };
  assert.equal(await f.game.castSpell(f.me,girl,{from:'hand'}),true);await f.settle();
  assert.equal(girlPaid,true);assert.equal(flicker.castMeta?.manaSpent,3);assert.equal(responded,true);assert.equal(girl.zoneVersion,3);
  assert.equal(elf.zone,'graveyard');assert.equal(big.toughness,3);
  assert.equal(girl.toughness,3,'each other creature refers to the original source object, which already left');
});

test('Monarch: two simultaneous native attackers create two independently counterable crown abilities',async()=>{
  const f=fixture();await f.cast('Thorn of the Black Rose',['Swamp','Swamp','Swamp','Swamp']);
  const attackers=Array.from({length:2},()=>f.put('Grizzly Bears','battlefield',f.rival));
  const stifles=Array.from({length:2},()=>f.put('Stifle','hand')),mana=Array.from({length:2},()=>f.put('Island'));
  f.game.turnPlayer=f.rival;f.attackers=()=>attackers.map(card=>({card,target:f.me}));
  const seen=new Set(),selected=new Set();
  f.priority=q=>{
    if(q.player!==f.me)return;
    for(const so of q.stack.filter(so=>so.kind==='trigger'&&/Monarch/i.test(so.name))){seen.add(so);assert.equal(so.ctrl.idx,f.me.idx);}
    const crown=[...seen].find(so=>q.stack.includes(so)&&!selected.has(so));if(!crown)return;
    const e=q.casts.find(c=>stifles.includes(c.card));assert.ok(e);selected.add(crown);
    return{kind:'cast',card:e.card,from:e.from,alt:e.alt,quickTarget:crown};
  };
  await f.game.combatPhase(f.rival);await f.settle();
  assert.equal(f.me.life,36);assert.equal(seen.size,2);assert.equal(selected.size,2);
  assert.ok(mana.every(c=>c.tapped));assert.ok(stifles.every(c=>c.zone==='graveyard'));assert.equal(f.game.monarch?.idx,f.me.idx);
});

test('Monarch: crown ability remembers the damaging creature controller through paid Ray of Command',async()=>{
  const f=fixture();await f.cast('Thorn of the Black Rose',['Swamp','Swamp','Swamp','Swamp']);
  const attacker=f.put('Grizzly Bears','battlefield',f.rival),ray=f.put('Ray of Command','hand'),mana=Array.from({length:4},()=>f.put('Island'));
  f.game.turnPlayer=f.rival;f.attackers=()=>[{card:attacker,target:f.me}];let responded=false;
  f.priority=q=>{
    if(q.player!==f.me||responded||!q.stack.some(so=>so.kind==='trigger'&&/Monarch/i.test(so.name)))return;
    const e=q.casts.find(c=>c.card===ray);assert.ok(e);responded=true;
    return{kind:'cast',card:ray,from:e.from,alt:e.alt,quickTarget:attacker};
  };
  await f.game.combatPhase(f.rival);await f.settle();
  assert.equal(responded,true);assert.ok(mana.every(c=>c.tapped));assert.equal(attacker.ctrl.idx,f.me.idx);
  assert.equal(f.game.monarch?.idx,f.rival.idx,'the creature controller is captured when combat damage happens');
});

test('Monarch: an end-step draw keeps its original player after a paid opposing flash monarch creature',async()=>{
  const f=fixture();await f.cast('Thorn of the Black Rose',['Swamp','Swamp','Swamp','Swamp']);
  f.put('Vedalken Orrery','battlefield',f.rival);
  const thorn=f.put('Thorn of the Black Rose','hand',f.rival),mana=Array.from({length:4},()=>f.put('Swamp','battlefield',f.rival));
  const before=f.me.hand.length;let responded=false;
  f.priority=q=>{
    if(q.player!==f.rival||responded||!q.stack.some(so=>so.kind==='trigger'&&/Monarch/i.test(so.name)))return;
    const e=q.casts.find(c=>c.card===thorn);assert.ok(e,'printed flash permission offers the creature during the draw response');responded=true;
    return{kind:'cast',card:thorn,from:e.from,alt:e.alt};
  };
  await f.game.runEndStepV90(f.me);await f.settle();
  assert.equal(responded,true);assert.ok(mana.every(c=>c.tapped));assert.equal(f.game.monarch?.idx,f.rival.idx);
  assert.equal(f.me.hand.length,before+1);assert.equal(f.rival.hand.length,0);
});

test('Arthur: the native end-of-combat return advances identity and emits Vela leave triggers',async()=>{
  const f=fixture(),arthur=f.put('Arthur, Marigold Knight'),helper=f.put('Gingerbrute'),vela=f.put('Vela the Night-Clad'),hit=f.put('Grizzly Bears','library');
  f.attackers=()=>[{card:arthur,target:f.rival},{card:helper,target:f.rival}];
  f.chooseCards=q=>q.from.includes(hit)?[hit]:undefined;
  await f.game.combatPhase(f.me);await f.settle();
  assert.equal(hit.zone,'hand');assert.equal(hit.zoneVersion,2,'entering and returning are separate native zone changes');
  assert.equal(f.rival.life,32,'seven combat damage plus one leave-trigger life loss');
  assert.equal(f.players[2].life,39);assert.equal(f.players[3].life,39);assert.equal(vela.zone,'battlefield');
});

test('Arthur: the native end-of-combat return ignores a Grizzly Bears new incarnation after paid blink',async()=>{
  const f=fixture(),arthur=f.put('Arthur, Marigold Knight'),helper=f.put('Gingerbrute'),hit=f.put('Grizzly Bears','library');
  const flicker=f.put('Ghostly Flicker','hand'),island=f.put('Island');Array.from({length:3},()=>f.put('Island'));let responded=false;
  f.attackers=()=>[{card:arthur,target:f.rival},{card:helper,target:f.rival}];
  f.chooseCards=q=>q.from.includes(hit)?[hit]:undefined;
  f.chooseTargets=q=>q.max===2&&q.candidates.includes(hit)&&q.candidates.includes(island)?[hit,island]:undefined;
  f.priority=q=>{
    if(q.player!==f.me||responded||!q.stack.some(so=>so.kind==='trigger'&&so.name==='Arthur return'))return;
    const e=q.casts.find(c=>c.card===flicker);assert.ok(e);responded=true;
    return{kind:'cast',card:flicker,from:e.from,alt:e.alt};
  };
  await f.game.combatPhase(f.me);await f.settle();
  assert.equal(responded,true);assert.equal(flicker.castMeta?.manaSpent,3);assert.equal(hit.zoneVersion,3);
  assert.equal(hit.zone,'battlefield','a later Grizzly object is outside the old delayed return');
});

test('Arthur: its paid-blinked old attack trigger still puts the chosen creature into combat',async()=>{
  const f=fixture(),arthur=f.put('Arthur, Marigold Knight'),helper=f.put('Gingerbrute'),hit=f.put('Grizzly Bears','library');
  const flicker=f.put('Ghostly Flicker','hand'),island=f.put('Island');Array.from({length:3},()=>f.put('Island'));let responded=false;
  f.attackers=()=>[{card:arthur,target:f.rival},{card:helper,target:f.rival}];
  f.chooseCards=q=>q.from.includes(hit)?[hit]:undefined;
  f.chooseTargets=q=>q.max===2&&q.candidates.includes(arthur)&&q.candidates.includes(island)?[arthur,island]:undefined;
  f.priority=q=>{
    if(q.player!==f.me||responded||!q.stack.some(so=>so.kind==='trigger'&&so.srcCard===arthur))return;
    const e=q.casts.find(c=>c.card===flicker);assert.ok(e);responded=true;
    return{kind:'cast',card:flicker,from:e.from,alt:e.alt};
  };
  await f.game.combatPhase(f.me);await f.settle();
  assert.equal(responded,true);assert.equal(flicker.castMeta?.manaSpent,3);assert.equal(arthur.zoneVersion,2);
  assert.equal(hit.zone,'hand');assert.equal(f.rival.life,37,'Gingerbrute and the chosen Bears deal native combat damage');
});

test('Helix Pinnacle: paid hundred-counter upkeep uses source LKI after native nontargeted exile',async()=>{
  const f=fixture(),helix=await f.cast('Helix Pinnacle',['Forest']);f.put('Vedalken Orrery');
  const lands=Array.from({length:100},()=>f.put('Wastes'));f.chooseX=q=>Math.min(100,q.max);
  const entry=f.game.activatableList(f.me).find(e=>e.card===helix&&!e.manaAbility);assert.ok(entry);
  assert.equal(await f.game.activateAbility(f.me,entry),true);await f.settle();
  assert.equal(helix.counters.tower,100);assert.ok(lands.every(c=>c.tapped));
  const version=helix.zoneVersion,vanish=f.put('Sudden Disappearance','hand'),mana=Array.from({length:6},()=>f.put('Plains'));let responded=false;
  f.priority=q=>{
    if(q.player!==f.me||responded||!q.stack.some(so=>so.kind==='trigger'&&so.srcCard===helix))return;
    const e=q.casts.find(c=>c.card===vanish);assert.ok(e,'native Orrery permits the response without targeting the shrouded source');responded=true;
    return{kind:'cast',card:vanish,from:e.from,alt:e.alt,quickTarget:f.me};
  };
  await f.game.runUpkeepStepV90(f.me);await f.settle();
  assert.equal(responded,true);assert.equal(vanish.castMeta?.manaSpent,6);assert.ok(mana.every(c=>c.tapped));
  assert.equal(helix.zone,'exile');assert.equal(helix.counters.tower||0,0);assert.equal(helix.battlefieldLKI.get(version).counters.tower,100);
  assert.equal(f.game.winner?.idx??null,f.me.idx);
});

for(const removed of [false,true])test(`Kederekt Parasite: the intervening red permanent ${removed?'must survive a native bounce response':'allows native opponent draw triggers'}`,async()=>{
  const f=fixture(),parasite=f.put('Kederekt Parasite'),red=f.put('Goblin Guide'),snag=f.put('Vapor Snag','hand'),blue=f.put('Island');
  const divination=f.put('Divination','hand',f.rival);Array.from({length:3},()=>f.put('Island','battlefield',f.rival));let responded=false;
  f.priority=q=>{
    if(!removed||q.player!==f.me||responded||!q.stack.some(so=>so.kind==='trigger'&&so.srcCard===parasite))return;
    const e=q.casts.find(c=>c.card===snag);assert.ok(e);responded=true;
    return{kind:'cast',card:snag,from:e.from,alt:e.alt,quickTarget:red};
  };
  f.game.turnPlayer=f.rival;
  assert.equal(await f.game.castSpell(f.rival,divination,{from:'hand'}),true);await f.settle();
  assert.equal(divination.castMeta?.manaSpent,3);assert.equal(responded,removed);assert.equal(blue.tapped,removed);
  assert.equal(red.zone,removed?'hand':'battlefield');assert.equal(f.rival.life,removed?40:38);
});

for(const recycled of [false,true])test(`Oloro: native command upkeep ${recycled?'rejects a newly recast and exiled command incarnation':'gains life from the original command object'}`,async()=>{
  const f=fixture(),oloro=f.put('Oloro, Ageless Ascetic','command');oloro.commander=true;
  f.put('Vedalken Orrery');Array.from({length:2},()=>f.put('Island'));Array.from({length:2},()=>f.put('Swamp'));Array.from({length:3},()=>f.put('Plains'));
  const swords=f.put('Swords to Plowshares','hand');let cast=false,exiled=false,paid=false;
  f.choices.commanderZone='cz';
  f.priority=q=>{
    if(!recycled||q.player!==f.me||!q.stack.some(so=>so.kind==='trigger'&&so.srcCard===oloro))return;
    if(!cast){const e=q.casts.find(c=>c.card===oloro&&c.from==='command');assert.ok(e);cast=true;return{kind:'cast',card:oloro,from:e.from,alt:e.alt};}
    if(!exiled&&oloro.zone==='battlefield'){
      const e=q.casts.find(c=>c.card===swords);assert.ok(e);paid=oloro.castMeta?.manaSpent===6;exiled=true;
      return{kind:'cast',card:swords,from:e.from,alt:e.alt,quickTarget:oloro};
    }
  };
  await f.game.runUpkeepStepV90(f.me);await f.settle();
  assert.equal(cast,recycled);assert.equal(exiled,recycled);assert.equal(oloro.zone,'command');
  if(recycled){assert.equal(paid,true);assert.equal(swords.castMeta?.manaSpent,1);assert.equal(oloro.zoneVersion,3);}
  assert.equal(f.me.life,recycled?44:42,'the original command ability cannot observe a different returned object');
});

test('Initiative: taking it through a paid Tome creates a source-less counterable venture',async()=>{
  const f=fixture(),stifle=f.put('Stifle','hand',f.rival),mana=f.put('Island','battlefield',f.rival);let responded=false;
  f.priority=q=>{
    if(q.player!==f.rival||responded)return;
    const venture=q.stack.find(so=>so.kind==='trigger'&&so.name==='Initiative: venture into Undercity');if(!venture)return;
    assert.equal(venture.ctrl.idx,f.me.idx);assert.equal(venture.srcCard??null,null);
    const e=q.casts.find(c=>c.card===stifle);assert.ok(e);responded=true;
    return{kind:'cast',card:stifle,from:e.from,alt:e.alt,quickTarget:venture};
  };
  await f.cast("Sarevok's Tome",['Swamp','Swamp','Swamp','Swamp']);
  assert.equal(responded,true);assert.equal(mana.tapped,true);assert.equal(f.game.initiative?.idx,f.me.idx);assert.equal(f.me.afcDungeon??null,null);
});

test('Initiative: its native upkeep venture goes on the Stack and can be Stifled',async()=>{
  const f=fixture();await f.cast("Sarevok's Tome",['Swamp','Swamp','Swamp','Swamp']);
  assert.equal(f.me.afcDungeon.room,'entrance');const stifle=f.put('Stifle','hand',f.rival),mana=f.put('Island','battlefield',f.rival);let responded=false;
  f.priority=q=>{
    if(q.player!==f.rival||responded)return;
    const venture=q.stack.find(so=>so.kind==='trigger'&&so.name==='Initiative upkeep: venture into Undercity');if(!venture)return;
    assert.equal(venture.ctrl.idx,f.me.idx);assert.equal(venture.srcCard??null,null);
    const e=q.casts.find(c=>c.card===stifle);assert.ok(e);responded=true;
    return{kind:'cast',card:stifle,from:e.from,alt:e.alt,quickTarget:venture};
  };
  await f.game.runUpkeepStepV90(f.me);await f.settle();
  assert.equal(responded,true);assert.equal(mana.tapped,true);assert.equal(f.me.afcDungeon.room,'entrance');
});

for(const count of [1,2])test(`Initiative: ${count} native damaging creature(s) create one ability controlled by the initiative holder`,async()=>{
  const f=fixture();await f.cast("Sarevok's Tome",['Swamp','Swamp','Swamp','Swamp']);
  const attackers=Array.from({length:count},()=>f.put('Grizzly Bears','battlefield',f.rival)),stifle=f.put('Stifle','hand'),mana=f.put('Island');
  f.game.turnPlayer=f.rival;f.attackers=()=>attackers.map(card=>({card,target:f.me}));let responded=false;const seen=new Set();
  f.priority=q=>{
    if(q.player!==f.me||responded)return;
    const crowns=q.stack.filter(so=>so.kind==='trigger'&&so.name==='Take the initiative after combat damage');for(const so of crowns)seen.add(so);if(!crowns.length)return;
    const e=q.casts.find(c=>c.card===stifle);assert.ok(e);responded=true;
    return{kind:'cast',card:stifle,from:e.from,alt:e.alt,quickTarget:crowns[0]};
  };
  await f.game.combatPhase(f.rival);await f.settle();
  assert.equal(responded,true);assert.equal(mana.tapped,true);assert.equal(stifle.castMeta?.manaSpent,1);
  assert.equal(seen.size,1,'one or more creatures from the same player in one damage event trigger once');
  assert.equal([...seen][0].ctrl.idx,f.me.idx);assert.equal([...seen][0].srcCard??null,null);
  assert.equal(f.game.initiative?.idx,f.me.idx);assert.equal(f.rival.afcDungeon??null,null);
});

for(const bounce of [false,true])test(`Dragonmaster Outcast: native upkeep ${bounce?'rechecks six lands after paid Boomerang':'creates a Dragon with six lands'}`,async()=>{
  const f=fixture(),outcast=f.put('Dragonmaster Outcast'),land=f.put('Forest');f.put('Forest');Array.from({length:4},()=>f.put('Island'));
  const boomerang=f.put('Boomerang','hand');let responded=false;
  f.priority=q=>{
    if(!bounce||q.player!==f.me||responded||!q.stack.some(so=>so.kind==='trigger'&&so.srcCard===outcast))return;
    const e=q.casts.find(c=>c.card===boomerang);assert.ok(e);responded=true;
    return{kind:'cast',card:boomerang,from:e.from,alt:e.alt,quickTarget:land};
  };
  await f.game.runUpkeepStepV90(f.me);await f.settle();
  assert.equal(responded,bounce);assert.equal(f.game.lands(f.me).length,bounce?5:6);
  if(bounce)assert.equal(boomerang.castMeta?.manaSpent,2);
  assert.equal(f.game.bf().filter(c=>c.isToken&&c.hasSub('Dragon')).length,bounce?0:1);
});

test('Zulaport Cutthroat: native Ray control followed by simultaneous Damnation uses the dying source controller',async()=>{
  const f=fixture(),cutthroat=f.put('Zulaport Cutthroat','battlefield',f.rival);f.put('Llanowar Elves');
  await f.cast('Ray of Command',['Island','Island','Island','Island'],[cutthroat]);assert.equal(cutthroat.ctrl.idx,f.me.idx);
  await f.cast('Damnation',['Swamp','Swamp','Swamp','Swamp']);
  assert.equal(cutthroat.zone,'graveyard');assert.equal(cutthroat.ctrl.idx,f.rival.idx);
  assert.equal(f.me.life,42,'both controlled creature deaths trigger for the original controller');
  assert.ok(f.players.slice(1).every(p=>p.life===38));
});

test('Native simultaneous death triggers use APNAP across all four seats before targets resolve',async()=>{
  const f=fixture(),artists=f.players.map(p=>f.put('Blood Artist','battlefield',p));let observed=null;
  f.priority=q=>{
    if(observed||q.player!==f.me||!artists.every(c=>c.zone==='graveyard'))return;
    const abilities=q.stack.filter(so=>so.kind==='trigger'&&artists.includes(so.srcCard));
    if(abilities.length===16)observed=Array.from(abilities,so=>so.ctrl.idx);
  };
  await f.cast('Damnation',['Swamp','Swamp','Swamp','Swamp']);
  assert.deepEqual(observed,f.players.flatMap(p=>Array(4).fill(p.idx)));
  assert.deepEqual(f.trace.filter(q=>q.type==='orderTriggers').map(q=>q.player.idx),f.players.map(p=>p.idx));
});

test('Three native ETB doublers add three extra Visionary abilities',async()=>{
  const f=fixture();f.put('Panharmonicon');f.put('Panharmonicon');f.put('Yarok, the Desecrated');
  const before=f.me.hand.length;await f.cast('Elvish Visionary',['Forest','Forest']);
  assert.equal(f.me.hand.length,before+4);
});

test('Artifact landfall combines native Panharmonicon, Yarok, and Greenwarden once each',async()=>{
  const f=fixture();f.put('Panharmonicon');f.put('Yarok, the Desecrated');f.put('Ancient Greenwarden');f.put('Tireless Tracker');
  assert.equal(await f.game.playLand(f.me,f.put('Tree of Tales','hand')),true);await f.settle();
  assert.equal(f.game.bf().filter(c=>c.isToken&&c.hasSub('Clue')).length,4);
});

test('Veyran: a paid Reverberate copy trigger cannot pump its paid-blinked new incarnation',async()=>{
  const f=fixture(),veyran=f.put('Veyran, Voice of Duality'),land=f.put('Island'),shock=f.put('Shock','hand'),reverberate=f.put('Reverberate','hand'),flicker=f.put('Ghostly Flicker','hand');
  Array.from({length:3},()=>f.put('Mountain'));Array.from({length:3},()=>f.put('Island'));let copied=false,blinked=false;
  f.chooseTargets=q=>q.max===2&&q.candidates.includes(veyran)&&q.candidates.includes(land)?[veyran,land]:q.src?.name==='Shock'&&q.candidates.includes(f.rival)?[f.rival]:undefined;
  f.priority=q=>{
    if(q.player!==f.me)return;
    if(!copied){const target=q.stack.find(so=>so.kind==='spell'&&so.card===shock&&!so.isCopy),e=q.casts.find(c=>c.card===reverberate);if(target&&e){copied=true;return{kind:'cast',card:reverberate,from:e.from,alt:e.alt,quickTarget:target};}}
    if(!blinked&&q.stack.some(so=>so.kind==='spell'&&so.isCopy)&&q.stack.some(so=>so.kind==='trigger'&&so.srcCard===veyran)){
      const e=q.casts.find(c=>c.card===flicker);assert.ok(e);blinked=true;return{kind:'cast',card:flicker,from:e.from,alt:e.alt};
    }
  };
  assert.equal(await f.game.castSpell(f.me,shock,{from:'hand',quickTargets:[f.rival]}),true);await f.settle();
  assert.equal(copied,true);assert.equal(blinked,true);assert.equal(shock.castMeta?.manaSpent,1);assert.equal(reverberate.castMeta?.manaSpent,2);assert.equal(flicker.castMeta?.manaSpent,3);
  assert.equal(f.rival.life,36);assert.equal(veyran.zoneVersion,2);assert.equal(veyran.power,2);assert.equal(veyran.toughness,2);
});

test('Krang: a native graveyard Detective ability stays single when an opponent draws',async()=>{
  const f=fixture();f.put('Krang, the All-Powerful');const detective=f.put('Dogged Detective','graveyard'),stifle=f.put('Stifle','hand');f.put('Island');
  const divination=f.put('Divination','hand',f.rival);Array.from({length:3},()=>f.put('Island','battlefield',f.rival));let responded=false;const seen=new Set();
  f.priority=q=>{
    if(q.player!==f.me||responded)return;
    const abilities=q.stack.filter(so=>so.kind==='trigger'&&so.srcCard===detective);for(const so of abilities)seen.add(so);if(!abilities.length)return;
    const e=q.casts.find(c=>c.card===stifle);assert.ok(e);responded=true;return{kind:'cast',card:stifle,from:e.from,alt:e.alt,quickTarget:abilities[0]};
  };
  f.game.turnPlayer=f.rival;assert.equal(await f.game.castSpell(f.rival,divination,{from:'hand'}),true);await f.settle();
  assert.equal(divination.castMeta?.manaSpent,3);assert.equal(responded,true);assert.equal(stifle.castMeta?.manaSpent,1);
  assert.equal(seen.size,1,'the Detective in a graveyard is a card, not a controlled permanent');assert.equal(detective.zone,'graveyard');
});

for(const doubler of [null,'Panharmonicon','Yarok, the Desecrated'])test(`${doubler||'No doubler'}: a native Spit Flame graveyard ability is countered by one paid Stifle`,async()=>{
  const f=fixture();if(doubler)f.put(doubler);const flame=f.put('Spit Flame','graveyard'),stifle=f.put('Stifle','hand');
  Array.from({length:5},()=>f.put('Island'));Array.from({length:3},()=>f.put('Mountain'));let responded=false;const seen=new Set();
  f.priority=q=>{
    if(q.player!==f.me||responded)return;
    const abilities=q.stack.filter(so=>so.kind==='trigger'&&so.srcCard===flame);for(const so of abilities)seen.add(so);if(!abilities.length)return;
    const e=q.casts.find(c=>c.card===stifle);assert.ok(e);responded=true;return{kind:'cast',card:stifle,from:e.from,alt:e.alt,quickTarget:abilities[0]};
  };
  await f.cast('Shivan Dragon',Array(6).fill('Mountain'));
  assert.equal(responded,true);assert.equal(stifle.castMeta?.manaSpent,1);assert.equal(seen.size,1);assert.equal(flame.zone,'graveyard');
});

test('Ancient Greenwarden: native Dragon-typed Dryad Arbor does not double a graveyard Spit Flame ability',async()=>{
  const f=fixture();f.put('Ancient Greenwarden');const flame=f.put('Spit Flame','graveyard'),stifle=f.put('Stifle','hand');
  Array.from({length:5},()=>f.put('Island'));Array.from({length:3},()=>f.put('Mountain'));f.choices.chooseType='Dragon';
  await f.cast('Arcane Adaptation',['Island','Island','Island']);let responded=false;const seen=new Set();
  f.priority=q=>{
    if(q.player!==f.me||responded)return;
    const abilities=q.stack.filter(so=>so.kind==='trigger'&&so.srcCard===flame);for(const so of abilities)seen.add(so);if(!abilities.length)return;
    const e=q.casts.find(c=>c.card===stifle);assert.ok(e);responded=true;return{kind:'cast',card:stifle,from:e.from,alt:e.alt,quickTarget:abilities[0]};
  };
  const arbor=f.put('Dryad Arbor','hand');assert.equal(await f.game.playLand(f.me,arbor),true);
  await f.game.flushTriggers();await f.game.priorityRound(f.me);await f.settle();
  assert.equal(arbor.hasSub('Dragon'),true);assert.equal(responded,true);assert.equal(stifle.castMeta?.manaSpent,1);assert.equal(seen.size,1);assert.equal(flame.zone,'graveyard');
});

test('Séance Board: a native death and paid-blinked end-step source cannot pass its old soul counter to the new board',async()=>{
  const f=fixture(),board=await f.cast('Séance Board',['Island','Island']),elf=f.put('Llanowar Elves','battlefield',f.rival);
  await f.cast('Shock',['Mountain'],[elf]);assert.equal(elf.zone,'graveyard');
  const flicker=f.put('Ghostly Flicker','hand'),land=f.put('Island');Array.from({length:3},()=>f.put('Island'));let responded=false;
  f.chooseTargets=q=>q.max===2&&q.candidates.includes(board)&&q.candidates.includes(land)?[board,land]:undefined;
  f.priority=q=>{
    if(q.player!==f.me||responded||!q.stack.some(so=>so.kind==='trigger'&&so.srcCard===board))return;
    const e=q.casts.find(c=>c.card===flicker);assert.ok(e);responded=true;return{kind:'cast',card:flicker,from:e.from,alt:e.alt};
  };
  await f.game.runEndStepV90(f.me);await f.settle();
  assert.equal(responded,true);assert.equal(flicker.castMeta?.manaSpent,3);assert.equal(board.zoneVersion,3);assert.equal(board.counters.soul||0,0);
});

test('Initiative: native double strike creates one separately counterable ability in each damage step',async()=>{
  const f=fixture();await f.cast("Sarevok's Tome",['Swamp','Swamp','Swamp','Swamp']);
  const attacker=f.put('Fencing Ace','battlefield',f.rival),stifles=Array.from({length:2},()=>f.put('Stifle','hand'));Array.from({length:2},()=>f.put('Island'));
  f.game.turnPlayer=f.rival;f.attackers=()=>[{card:attacker,target:f.me}];const seen=new Set();
  f.priority=q=>{
    if(q.player!==f.me)return;
    const crown=q.stack.find(so=>so.kind==='trigger'&&so.name==='Take the initiative after combat damage'&&!seen.has(so));if(!crown)return;
    const e=q.casts.find(c=>stifles.includes(c.card));assert.ok(e);seen.add(crown);return{kind:'cast',card:e.card,from:e.from,alt:e.alt,quickTarget:crown};
  };
  await f.game.combatPhase(f.rival);await f.settle();
  assert.equal(f.me.life,38);assert.equal(seen.size,2);assert.ok(stifles.every(c=>c.castMeta?.manaSpent===1));assert.equal(f.game.initiative?.idx,f.me.idx);
});

test('Initiative: native crown resolution remembers the damaging controller after paid Ray of Command',async()=>{
  const f=fixture();await f.cast("Sarevok's Tome",['Swamp','Swamp','Swamp','Swamp']);
  const attacker=f.put('Grizzly Bears','battlefield',f.rival),ray=f.put('Ray of Command','hand');Array.from({length:4},()=>f.put('Island'));let responded=false;const seen=new Set();
  f.game.turnPlayer=f.rival;f.attackers=()=>[{card:attacker,target:f.me}];
  f.priority=q=>{
    if(q.player!==f.me||responded)return;
    const crowns=q.stack.filter(so=>so.kind==='trigger'&&so.name==='Take the initiative after combat damage');for(const so of crowns)seen.add(so);if(!crowns.length)return;
    const e=q.casts.find(c=>c.card===ray);assert.ok(e);responded=true;return{kind:'cast',card:ray,from:e.from,alt:e.alt,quickTarget:attacker};
  };
  await f.game.combatPhase(f.rival);await f.settle();
  assert.equal(responded,true);assert.equal(ray.castMeta?.manaSpent,4);assert.equal(attacker.ctrl.idx,f.me.idx);assert.equal(seen.size,1);
  assert.equal([...seen][0].ctrl.idx,f.me.idx);assert.equal(f.game.initiative?.idx,f.rival.idx);assert.equal(f.rival.afcDungeon.room,'entrance');
});

test('Initiative: a second paid initiative permanent advances the existing holder exactly once',async()=>{
  const f=fixture(),bear=f.put('Grizzly Bears');await f.cast("Sarevok's Tome",['Swamp','Swamp','Swamp','Swamp']);
  assert.equal(f.me.afcDungeon.room,'entrance');await f.cast("Sarevok's Tome",['Swamp','Swamp','Swamp','Swamp']);
  assert.equal(f.game.initiative?.idx,f.me.idx);assert.equal(f.me.afcDungeon.path.length,2);assert.equal(f.me.afcDungeon.room,'forge');assert.equal(bear.counters['+1/+1'],2);
});

for(const name of ['Veyran, Voice of Duality','Krang, the All-Powerful'])test(`${name}: losing abilities after announcement preserves its original native source trigger`,async()=>{
  const f=fixture(),source=f.put(name);f.put('Vedalken Orrery');const mutation=f.put('Darksteel Mutation','hand');Array.from({length:4},()=>f.put('Plains'));let responded=false;
  f.priority=q=>{
    if(q.player!==f.me||responded||!q.stack.some(so=>so.kind==='trigger'&&so.srcCard===source))return;
    const e=q.casts.find(c=>c.card===mutation);assert.ok(e);responded=true;return{kind:'cast',card:mutation,from:e.from,alt:e.alt,quickTarget:source};
  };
  await f.cast(name==='Veyran, Voice of Duality'?'Shock':'Divination',name==='Veyran, Voice of Duality'?['Mountain']:['Island','Island','Island'],name==='Veyran, Voice of Duality'?[f.rival]:[]);
  assert.equal(responded,true);assert.equal(mutation.castMeta?.manaSpent,2);assert.equal(source.cur.abilitiesDisabled,true);assert.equal(source.zoneVersion,0);
  assert.equal(source.power,2);assert.equal(source.toughness,3);
  if(name==='Krang, the All-Powerful')assert.equal(source.counters['+1/+1'],2);
});

test('Morbid Opportunist: native once-per-turn survives Harmonic doubling and resets for a reanimated new object',async()=>{
  const f=fixture(),morbid=f.put('Morbid Opportunist');f.put('Harmonic Prodigy');f.put('Llanowar Elves');f.choices.chooseType='Shaman';
  await f.cast('Arcane Adaptation',['Island','Island','Island']);const before=f.me.hand.length;
  await f.cast('Damnation',['Swamp','Swamp','Swamp','Swamp']);assert.equal(f.me.hand.length,before+1);assert.equal(morbid.zone,'graveyard');
  const version=morbid.zoneVersion;await f.cast('Unearth',['Swamp'],[morbid]);assert.equal(morbid.zoneVersion,version+1);
  const elf=await f.cast('Llanowar Elves',['Forest']);await f.cast('Shock',['Mountain'],[elf]);assert.equal(elf.zone,'graveyard');
  assert.equal(f.me.hand.length,before+2,'the new object receives its own per-turn quota in the same native turn');
});

test('Native four-seat APNAP rotates to an opposing active player casting Damnation',async()=>{
  const f=fixture(),artists=f.players.map(p=>f.put('Blood Artist','battlefield',p)),active=f.players[2],spell=f.put('Damnation','hand',active);Array.from({length:4},()=>f.put('Swamp','battlefield',active));let observed=null;
  f.game.turnPlayer=active;
  f.priority=q=>{
    if(observed||q.player!==active||!artists.every(c=>c.zone==='graveyard'))return;
    const abilities=q.stack.filter(so=>so.kind==='trigger'&&artists.includes(so.srcCard));if(abilities.length===16)observed=Array.from(abilities,so=>so.ctrl.idx);
  };
  assert.equal(await f.game.castSpell(active,spell,{from:'hand'}),true);await f.settle();assert.equal(spell.castMeta?.manaSpent,4);
  assert.deepEqual(observed,[2,3,0,1].flatMap(i=>Array(4).fill(i)));
});
