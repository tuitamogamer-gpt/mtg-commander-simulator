import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan, semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, put, settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
import {phaseEntryV10} from './helpers/oracle-v10-turn-proof.mjs';

const sources=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v11-primitives.json',import.meta.url),'utf8'));
const supported=[...sources,{...sources[0],name:'Retained Mana Fixture',id:'70631a92-b335-42c6-92b9-0adfc139bb91',oracle_id:'70631a92-b335-42c6-92b9-0adfc139bb92',layout:'normal',mana_cost:'{1}',type_line:'Artifact',oracle_text:"{T}: Add {C}{C}. Until end of turn, you don't lose this mana as steps and phases end."}];
const M=loadEngine();
const absent=supported.filter(card=>!M.DEFS[card.name]);
if(absent.length){
  const {report}=createImportPlan({cards:absent,bulk:{type:'oracle_cards',updated_at:'2026-08-30T09:01:56.964+00:00'},sequence:9911,limit:absent.length,compilerVersion:11});
  assert.equal(report.cards.length,absent.length);
  M.registerOracleBatch(report);
}
M.initData(M.RAW_DATA);
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=20;};
async function stackProbe(f,{type='Instant',cost='{1}',uncounterable=false,flashback=false,x=0}={}){
  const {game,a,b}=f;
  const card=flashback?put(M,game,b,'Think Twice','graveyard'):new M.CardInst({name:'Counter target fixture',cost,types:[type],super:[],subtypes:[],kws:[],power:'2',toughness:'3',oracle:'',uncounterable},b);
  if(!flashback){card.zone='hand';b.hand.push(card);}fund(b);game.turnPlayer=b;
  const decide=b.controller.decide.bind(b.controller);b.controller.decide=(g,q)=>q.type==='chooseX'?x:decide(g,q);
  try{
    const from=flashback?'graveyard':'hand',alt=flashback?game.castableList(b).find(row=>row.card===card)?.alt:undefined;
    assert.equal(await game.castSpell(b,card,{from,alt}),true);
  }finally{game.turnPlayer=a;b.controller.decide=decide;}
  const object=game.stack.find(row=>row.card===card);assert.ok(object);return object;
}
async function announceCounter(f,name,target){
  const {game,a}=f,card=put(M,game,a,name,'hand'),decide=a.controller.decide.bind(a.controller);fund(a);
  a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:decide(g,q);
  try{assert.equal(await game.castSpell(a,card,{from:'hand'}),true);}finally{a.controller.decide=decide;}
  assert.equal(game.stack.at(-1).card,card);return card;
}
async function cast(f,name,target){
  const spell=put(M,f.game,f.a,name,'hand');fund(f.a);
  const decide=f.a.controller.decide.bind(f.a.controller);
  f.a.controller.decide=(g,q)=>q.type==='chooseTargets'&&target&&q.candidates.includes(target)?[target]:decide(g,q);
  assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);
  await settle(f.game);f.a.controller.decide=decide;assertGameStateInvariants(f.game);return spell;
}
async function emblem(f,name,loyalty){
  const source=await cast(f,name);f.game.addCounters(source,'loyalty',Math.max(0,-loyalty-source.counters.loyalty));
  const entry=f.game.activatableList(f.a).find(row=>row.card===source&&row.ability.loyalty===loyalty);assert.ok(entry);
  assert.equal(await f.game.activateAbility(f.a,entry),true);await settle(f.game);
  assert.equal(source.zone,'graveyard','the ultimate spent the last loyalty');
  const created=f.a.emblems.at(-1);assert.ok(created?.oracleEmblemV11);assert.equal(created.zone,'command');assert.equal(f.game.bf().includes(created),false);return created;
}

test('v11 freezes complete v10 descriptors and rejects unknown clauses',()=>{
  const prior={name:'Prior grammar fixture',layout:'normal',type_line:'Instant',mana_cost:'{U}',oracle_text:'Draw a card.'};
  assert.deepEqual(semanticClass(prior,{compilerVersion:11}),semanticClass(prior,{compilerVersion:10}));
  for(const card of supported){
    const previous=semanticClass(card,{compilerVersion:10});
    assert.ok(semanticClass(card,{compilerVersion:11}).semanticClass,card.name);
    assert.equal(semanticClass({...card,oracle_text:card.oracle_text+'\nAn unsupported instruction must not disappear.'},{compilerVersion:11}).semanticClass,undefined,card.name);
    assert.deepEqual(semanticClass(card,{compilerVersion:10}),previous,card.name);
  }
});

test('quoted grants keep references to their granting Equipment unsupported',()=>{
  const card={name:'Hankyu',layout:'normal',mana_cost:'{1}',type_line:'Artifact — Equipment',oracle_text:'Equipped creature has "{T}: Put an aim counter on Hankyu" and "{T}, Remove all aim counters from Hankyu: This creature deals damage to any target equal to the number of aim counters removed this way."\nEquip {4}'};
  assert.equal(semanticClass(card,{compilerVersion:11}).semanticClass,undefined);
});

for(const role of ['human','ai']){
  test(role+': death follow-ups use the dead object type before its animation ends or it returns',async()=>{
    for(const [name,type] of [['Overgrowth Elemental','Elemental'],['Venom, Eddie Brock','Villain'],["Taborax, Hope's Demise",'Cleric']])for(const matched of [false,true]){
      const f=context(M,role),{game,a}=f,source=put(M,game,a,name),victim=put(M,game,a,'Runeclaw Bear');
      const animate=card=>game.addOracleAnimation(card,{types:[],subtypes:[type],keywords:[],retainTypes:true,retainAllSubtypes:false,replaceCreatureSubtypes:true,temporary:true});
      if(matched)animate(victim);
      const life=a.life,hand=a.hand.length;await game.destroy(victim);await game.flushTriggers();
      assert.ok(game.stack.some(row=>row.srcCard===source||row.ctx?.src===source));
      assert.equal(victim.zone,'graveyard');assert.equal(victim.hasSub(type),false);
      await game.move(victim,'battlefield',{ctrl:a});if(!matched)animate(victim);
      await settle(game);
      assert.equal(source.counters['+1/+1']||0,name==='Overgrowth Elemental'?Number(matched):1,name+'/'+matched);
      assert.equal(a.hand.length,hand+(name!=='Overgrowth Elemental'&&matched?1:0),name+'/'+matched);
      assert.equal(a.life,life+(name==='Overgrowth Elemental'?1:name.startsWith('Taborax')&&matched?-1:0),name+'/'+matched);
      assertGameStateInvariants(game);
    }
  });
  test(role+': Prohibit announces any spell, pays optional kicker and checks X-inclusive mana value on resolution',async()=>{
    for(const kicked of [false,true])for(const value of [2,3,4,5]){
      const f=context(M,role),{game,a}=f,target=await stackProbe(f,{cost:'{X}',x:value});
      assert.equal(game.stackSpellManaValue(target),value);
      const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseOption'&&q.prompt.startsWith('Kicker ')?kicked?'yes':'no':decide(g,q);
      const card=await announceCounter(f,'Prohibit',target);assert.equal(game.stack.at(-1).kicked,kicked);
      await game.resolveTop();assert.equal(card.zone,'graveyard');assert.equal(target.card.zone,value<=(kicked?4:2)?'graveyard':'stack');assertGameStateInvariants(game);
    }
  });
  test(role+': counter follow-ups retain the targeted spell mana value even when it cannot be countered',async()=>{
    for(const name of ['Reject Imperfection','Sound the Trumpets'])for(const value of [2,3,4])for(const uncounterable of [false,true]){
      const f=context(M,role),{game,a}=f,target=await stackProbe(f,{cost:'{X}',x:value,uncounterable}),witness=put(M,game,a,'Runeclaw Bear'),discard=put(M,game,a,'Runeclaw Bear','hand');
      game.addCounters(witness,'+1/+1',1);let choices=0;const decide=a.controller.decide.bind(a.controller);
      a.controller.decide=(g,q)=>{
        if(q.type==='chooseTargets'&&q.prompt==='Proliferate'){choices++;return [witness];}
        if(q.type==='chooseCards'&&q.prompt==='Recruit: discard a card'){choices++;assert.ok(q.from.includes(discard));return [discard];}
        return decide(g,q);
      };
      await announceCounter(f,name,target);await game.resolveTop();
      const applies=value<=(name==='Reject Imperfection'?3:2);assert.equal(choices,applies?1:0,name+'/'+value);
      assert.equal(target.card.zone,uncounterable?'stack':'graveyard');
      if(name==='Reject Imperfection')assert.equal(witness.counters['+1/+1'],applies?2:1);
      else {assert.equal(discard.zone,applies?'graveyard':'hand');assert.equal(game.bf().filter(card=>card.isToken&&card.hasSub('Soldier')).length,applies?1:0);}
      assertGameStateInvariants(game);
    }
  });
  test(role+': counter destinations respect uncounterability, copies, flashback and invalid targets',async()=>{
    for(const name of ['Lapse of Certainty','Memory Lapse','Remand'])for(const mode of ['normal','uncounterable','copy','flashback','invalid']){
      const f=context(M,role),{game,a,b}=f,original=await stackProbe(f,{uncounterable:mode==='uncounterable',flashback:mode==='flashback'});
      const target=mode==='copy'?await game.copySpell(original,b,{mayNewTargets:false}):original;
      await announceCounter(f,name,target);
      if(mode==='invalid')assert.equal(await game.counterStackObject(target),true);
      const hand=a.hand.length;await game.resolveTop();
      assert.equal(a.hand.length,hand+(name==='Remand'&&mode!=='invalid'?1:0),name+'/'+mode+': draw follows a legal resolution');
      if(['uncounterable','copy'].includes(mode)){
        assert.equal(original.card.zone,'stack');assert.equal(game.stack.includes(original),true);
        if(mode==='copy')assert.equal(game.stack.includes(target),false);
      }else{
        const destination=mode==='flashback'?'exile':mode==='invalid'?'graveyard':name==='Remand'?'hand':'library';
        assert.equal(original.card.zone,destination,name+'/'+mode);
        if(destination==='library')assert.equal(b.library.at(-1),original.card);
        assert.equal(game.stack.includes(original),false);
      }
      assertGameStateInvariants(game);
    }
  });
  test(role+': conditional counter taxes use the board at resolution and charge exactly one branch',async()=>{
    for(const name of ['Dazzling Denial','Lofty Denial','Stubborn Denial'])for(const initially of [false,true])for(const finallyPresent of [false,true]){
      const f=context(M,role),{game,a,b}=f,card=new M.CardInst({...M.DEFS['Runeclaw Bear'],name:'Counter condition fixture',power:'4',kws:['flying'],subtypes:['Bird']},a);
      card.zone='hand';a.hand.push(card);if(initially)await game.putPermanentOntoBattlefield(card,a);
      const target=await stackProbe(f);await announceCounter(f,name,target);
      if(initially&&!finallyPresent)await game.move(card,'hand');
      if(!initially&&finallyPresent)await game.putPermanentOntoBattlefield(card,a);
      for(const color of Object.keys(b.pool))b.pool[color]=0;b.pool.C=name==='Stubborn Denial'?1:3;
      const old=b.pool.C,payments=[],decide=b.controller.decide.bind(b.controller);
      b.controller.decide=(g,q)=>{if(q.type==='chooseOption'&&q.prompt.startsWith('Pay ')){payments.push(q.prompt);return 'yes';}return decide(g,q);};
      await game.resolveTop();
      assert.equal(target.card.zone,finallyPresent?'graveyard':'stack',name+': resolution-time condition');
      if(name==='Stubborn Denial'&&finallyPresent)assert.equal(payments.length,0);
      else {assert.equal(payments.length,1);assert.ok(payments[0].startsWith('Pay {'+(finallyPresent?4:name==='Dazzling Denial'?2:1)+'}'));}
      assert.equal(b.pool.C,old-(finallyPresent?0:name==='Dazzling Denial'?2:1));assertGameStateInvariants(game);
    }
  });
  test(role+': Anticognition checks every opponent and replaces payment with counter plus scry',async()=>{
    for(const graveyardSize of [7,8]){
      const f=context(M,role,2),{game,a,b}=f,other=f.others[1];
      for(let i=0;i<graveyardSize;i++)put(M,game,other,'Forest','graveyard');
      const target=await stackProbe(f,{type:'Creature'});await announceCounter(f,'Anticognition',target);
      for(const color of Object.keys(b.pool))b.pool[color]=0;
      let payments=0,scry=0;const originalA=a.controller.decide.bind(a.controller),originalB=b.controller.decide.bind(b.controller);
      a.controller.decide=(g,q)=>{if(q.type==='scry'){scry++;assert.equal(q.cards.length,2);return {top:q.cards,bottom:[]};}return originalA(g,q);};
      b.controller.decide=(g,q)=>{if(q.type==='chooseOption'&&q.prompt.startsWith('Pay ')){payments++;return 'no';}return originalB(g,q);};
      await game.resolveTop();assert.equal(target.card.zone,'graveyard');assert.equal(payments,graveyardSize===8?0:1);assert.equal(scry,graveyardSize===8?1:0);assertGameStateInvariants(game);
    }
  });
  test(role+': a keyword-union library search reveals a qualifying card and leaves it above the shuffle',async()=>{
    for(const keyword of ['deathtouch','hexproof','reach','trample']){
      const f=context(M,role),{game,a}=f,card=new M.CardInst({...M.DEFS['Runeclaw Bear'],name:'Search '+keyword,kws:[keyword]},a),miss=put(M,game,a,'Runeclaw Bear','library');
      card.zone='library';a.library.push(card);let revealed=false,selections=0;
      game.revealToHuman=async data=>{if(data.cards?.includes(card))revealed=true;};
      const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>{if(q.type==='chooseCards'&&q.search){selections++;assert.equal(q.from.includes(card),true,keyword);assert.equal(q.from.includes(miss),false);return [card];}return decide(g,q);};
      await cast(f,'Mwonvuli Beast Tracker');assert.equal(selections,1);assert.equal(revealed,true);assert.equal(a.library.at(-1),card);assert.equal(a.hand.includes(card),false);assertGameStateInvariants(game);
    }
  });
  test(role+': Landscaper Colos selects only an opponent graveyard and moves the card to its owner library bottom',async()=>{
    const f=context(M,role),{game,a,b}=f,own=put(M,game,a,'Forest','graveyard'),target=put(M,game,b,'Forest','graveyard');
    const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>{if(q.type==='chooseTargets'){assert.equal(q.candidates.includes(own),false);assert.equal(q.candidates.includes(target),true);return [target];}return decide(g,q);};
    await cast(f,'Landscaper Colos');assert.equal(b.library[0],target);assert.equal(own.zone,'graveyard');assert.equal(a.library.includes(target),false);assertGameStateInvariants(game);
  });
  test(role+': Sonic counts flash or haste once and filters damaged creatures by controller',async()=>{
    const f=context(M,role),{game,a,b}=f,source=await cast(f,'Sonic the Hedgehog'),plain=put(M,game,a,'Runeclaw Bear');
    const creature=(owner,name,kws)=>{const card=new M.CardInst({...M.DEFS['Runeclaw Bear'],name,kws,toughness:'8'},owner);card.zone='battlefield';game.battlefield.push(card);game.recalc();return card;};
    const flash=creature(a,'Flash fixture',['flash']),both=creature(a,'Flash and haste fixture',['flash','haste']),enemy=creature(b,'Enemy haste fixture',['haste']);
    await game.emit('attacks',{card:source,player:a,defender:b});await settle(game);
    for(const card of [source,flash,both])assert.equal(card.counters['+1/+1'],1);assert.equal(plain.counters['+1/+1']||0,0);assert.equal(enemy.counters['+1/+1']||0,0);
    await game.damageAny(source,flash,1);await game.damageAny(source,plain,1);await game.damageAny(source,enemy,1);await settle(game);
    const treasures=game.bf().filter(card=>card.ctrl===a&&card.hasSub('Treasure'));assert.equal(treasures.length,1);assert.equal(treasures[0].tapped,true);assertGameStateInvariants(game);
  });
  test(role+': both Quiver abilities are distinct and a pending ability survives removal of the granting Equipment',async()=>{
    const f=context(M,role),{game,a,b}=f,equipment=await cast(f,"Wolfhunter's Quiver"),host=put(M,game,a,'Runeclaw Bear');
    assert.equal(await game.attach(equipment,host),true);fund(a);host.sick=false;
    const target=new M.CardInst({...M.DEFS['Runeclaw Bear'],name:'Quiver Werewolf',subtypes:['Werewolf'],toughness:'8'},b);target.zone='battlefield';game.battlefield.push(target);game.recalc();
    const actions=game.activatableList(a).filter(row=>row.card===host&&host.cur.extraAbilities.includes(row.ability));assert.equal(actions.length,2);
    const three=actions.find(row=>row.ability.oracleOperation.effects[0].n===3),decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>{if(q.type==='chooseTargets'){assert.equal(q.candidates.includes(b),false);assert.equal(q.candidates.includes(host),false);return [target];}return decide(g,q);};
    assert.equal(await game.activateAbility(a,three),true);assert.equal(host.tapped,true);await game.move(equipment,'graveyard');await settle(game);assert.equal(target.damage,3);assert.equal(host.cur.extraAbilities.length,0);assertGameStateInvariants(game);
  });
  test(role+': Sigil Blessing excludes its chosen creature from the other-creature bonus',async()=>{
    const f=context(M,role),{game,a,b}=f,target=put(M,game,a,'Runeclaw Bear'),other=put(M,game,a,'Runeclaw Bear'),enemy=put(M,game,b,'Runeclaw Bear');
    await cast(f,'Sigil Blessing',target);assert.equal(target.power,5);assert.equal(target.toughness,5);assert.equal(other.power,3);assert.equal(enemy.power,2);
    const late=put(M,game,a,'Runeclaw Bear');assert.equal(late.power,2,'a resolving group buff does not affect later entrants');assertGameStateInvariants(game);
  });
  test(role+': Rookie Mistake requires two different announced creatures',async()=>{
    const f=context(M,role),{game,a,b}=f,first=put(M,game,a,'Runeclaw Bear'),second=put(M,game,b,'Runeclaw Bear'),spell=put(M,game,a,'Rookie Mistake','hand');fund(a);
    const decide=a.controller.decide.bind(a.controller);let targetChoices=0;
    a.controller.decide=(g,q)=>{if(q.type==='chooseTargets'){targetChoices++;if(targetChoices===1)return [first];assert.equal(q.candidates.includes(first),false,'another excludes the first announced target');return [second];}return decide(g,q);};
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);assert.equal(targetChoices,2);await settle(game);assert.equal(first.power,2);assert.equal(first.toughness,4);assert.equal(second.power,0);assert.equal(second.toughness,2);assertGameStateInvariants(game);
  });
  test(role+': Zealous Persecution applies opposite bonuses to the two controller groups',async()=>{
    const f=context(M,role),{game,a,b}=f,own=put(M,game,a,'Runeclaw Bear'),enemy=put(M,game,b,'Runeclaw Bear');await cast(f,'Zealous Persecution');
    assert.equal(own.power,3);assert.equal(own.toughness,3);assert.equal(enemy.power,1);assert.equal(enemy.toughness,1);assertGameStateInvariants(game);
  });
  test(role+': a leading next-turn duration lasts through an opponent turn and ends before upkeep',async()=>{
    const f=context(M,role),{game,a,b}=f,source=await cast(f,'Mu Yanling, Celestial Wind'),target=put(M,game,b,'Shivan Dragon');
    const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:decide(g,q);
    const action=game.activatableList(a).find(row=>row.card===source&&row.ability.loyalty===1);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(target.power,0);
    await phaseEntryV10(game,b,'untap');assert.equal(target.power,0);await phaseEntryV10(game,a,'untap');assert.equal(target.power,5);assertGameStateInvariants(game);
  });
  test(role+': a paid planeswalker enters with loyalty before its later counter trigger',async()=>{
    const f=context(M,role),{game,a,b}=f,source=await cast(f,'Tezzeret, Cruel Captain');assert.equal(source.counters.loyalty,4);
    await cast(f,'Sol Ring');assert.equal(source.counters.loyalty,5);assert.equal(source.zone,'battlefield');
    await game.makeTokens('treasure',b);await settle(game);assert.equal(source.counters.loyalty,5);assertGameStateInvariants(game);
  });
  test(role+': Kaito phases out on its entry turn and returns with the same loyalty',async()=>{
    const f=context(M,role),{game,a,b}=f,source=await cast(f,'Kaito Shizuki'),version=source.zoneVersion;
    assert.equal(source.counters.loyalty,3);await game.emit('endStep',{player:a});await settle(game);assert.equal(source.zone,'battlefield');assert.equal(source.phasedOut,true);
    game.phaseInFor(b);assert.equal(source.phasedOut,true);game.phaseInFor(a);assert.equal(source.phasedOut,false);assert.equal(source.zoneVersion,version);assert.equal(source.counters.loyalty,3);assertGameStateInvariants(game);
  });
  test(role+': Kaito gains loyalty from real combat damage by another creature',async()=>{
    const f=context(M,role),{game,a,b}=f,source=await cast(f,'Kaito, Cunning Infiltrator'),attacker=put(M,game,a,'Runeclaw Bear');
    attacker.attacking=b;game.combat={attackers:[attacker],defenders:new Map()};await game.combatDamage(a,'normal');await settle(game);
    assert.equal(source.counters.loyalty,4);assert.equal(source.zone,'battlefield');assertGameStateInvariants(game);
  });
  test(role+': Domri emblem affects future creatures and remains correct in AI snapshots',async()=>{
    const f=context(M,role),{game,a,b}=f;await emblem(f,'Domri Rade',-7);
    const own=put(M,game,a,'Runeclaw Bear'),enemy=put(M,game,b,'Runeclaw Bear');
    for(const keyword of ['double strike','trample','hexproof','haste']){assert.equal(own.kw(keyword),true);assert.equal(enemy.kw(keyword),false);}
    const copy=M.cloneGameForAISimulation(game,7711);copy.recalc();const cloned=copy.byIid(own.iid);assert.equal(cloned.kw('double strike'),true);
    M.OracleV8Control.gain(copy,cloned,copy.players[b.idx]);copy.recalc();assert.equal(cloned.kw('double strike'),false);assert.equal(own.kw('double strike'),true);assertGameStateInvariants(copy);assertGameStateInvariants(game);
  });
  test(role+': Huatli emblem survives its planeswalker and triggers only for its controller',async()=>{
    const f=context(M,role),{game,a,b}=f;await emblem(f,'Huatli, Radiant Champion',-8);
    const before=a.hand.length;await game.makeTokens('saproling',b);await settle(game);assert.equal(a.hand.length,before);
    await game.makeTokens('saproling',a);await settle(game);assert.equal(a.hand.length,before+1);assertGameStateInvariants(game);
  });
  test(role+': Venser emblem targets on the stack and cannot be targeted as a permanent',async()=>{
    const f=context(M,role),{game,a,b}=f,created=await emblem(f,'Venser, the Sojourner',-8),victim=put(M,game,b,'Runeclaw Bear');
    const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(victim)?[victim]:decide(g,q);
    const ring=put(M,game,a,'Sol Ring','hand');assert.equal(await game.castSpell(a,ring,{from:'hand'}),true);await game.flushTriggers();
    const trigger=game.stack.find(row=>row.srcCard===created);assert.ok(trigger);assert.equal(trigger.targets.length,1);assert.equal(trigger.targets[0],victim);assert.equal(game.stack.some(row=>row.card===ring),true);
    await settle(game);assert.equal(victim.zone,'exile');assert.equal(ring.zone,'battlefield');assert.equal(a.emblems.includes(created),true);assertGameStateInvariants(game);
  });
  test(role+': Koth emblem is the source of four damage after its planeswalker dies',async()=>{
    const f=context(M,role),{game,a,b}=f,created=await emblem(f,'Koth, Fire of Resistance',-7);const before=b.life;
    const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:decide(g,q);
    const mountain=put(M,game,a,'Mountain','hand');await game.move(mountain,'battlefield',{ctrl:a});await game.flushTriggers();
    assert.ok(game.stack.some(row=>row.srcCard===created));await settle(game);assert.equal(b.life,before-4);assertGameStateInvariants(game);
  });
  test(role+': a granted mana trigger belongs to the Aura host controller',async()=>{
    const f=context(M,role),{game,a,b}=f,host=put(M,game,b,'Runeclaw Bear'),aura=await cast(f,'Mark of Sakiko',host);game.emptyPool();game.turnPlayer=b;
    host.attacking=a;game.combat={attackers:[host],defenders:new Map()};await game.combatDamage(b,'normal');await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===host));
    await game.move(aura,'exile');await settle(game);assert.equal(a.pool.G,0);assert.equal(b.pool.G,2);game.emptyPool();assert.equal(b.pool.G,2);assertGameStateInvariants(game);
  });
  test(role+': Karn retains mana while preserving its artifact-spell restriction',async()=>{
    const f=context(M,role),{game,a}=f,source=put(M,game,a,'Karn, Legacy Reforged');for(let i=0;i<3;i++)put(M,game,a,'Sol Ring');
    await game.emit('upkeep',{player:a});await settle(game);assert.equal(a.pool.C,4);game.emptyPool();assert.equal(a.pool.C,4);
    for(const permanent of game.bf())permanent.tapped=true;
    const artifact=put(M,game,a,'Sol Ring','hand'),spell=new M.CardInst({name:'Ordinary Sorcery',types:['Sorcery'],subtypes:[],super:[],kws:[],cost:'{1}',oracle:'',resolve:async()=>{}},a);spell.zone='hand';a.hand.push(spell);
    assert.equal(game.canPayMana(a,M.parseCost('{1}'),{card:artifact}),true);assert.equal(game.canPayMana(a,M.parseCost('{1}'),{card:spell}),false);assert.equal(game.canPayMana(a,M.parseCost('{1}'),{card:source,isAbility:true}),true);
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),false);assert.equal(await game.castSpell(a,artifact,{from:'hand'}),true);await settle(game);assert.equal(a.pool.C,3);game.emptyPool();assert.equal(a.pool.C,3);assertGameStateInvariants(game);
  });
  test(role+': death-trigger mana survives source loss, spending and steps until cleanup',async()=>{
    const f=context(M,role),{game,a}=f,source=put(M,game,a,'Su-Chi Cave Guard');a.pool.C=2;a.pool.R=3;
    await game.sacrifice(a,source);await settle(game);assert.equal(source.zone,'graveyard');assert.equal(a.pool.C,10);
    game.emptyPool();assert.equal(a.pool.C,8,'ordinary colorless mana expired');assert.equal(a.pool.R,0);
    const ring=put(M,game,a,'Sol Ring','hand');assert.equal(await game.castSpell(a,ring,{from:'hand'}),true);await settle(game);
    assert.equal(a.pool.C,7);game.emptyPool();assert.equal(a.pool.C,7,'spent mana was removed from retained metadata');
    game.expirePersistentMana();game.emptyPool();assert.equal(a.pool.C,0);assertGameStateInvariants(game);
  });
  test(role+': retained upkeep mana belongs to the active player',async()=>{
    const f=context(M,role),{game,a,b}=f;put(M,game,a,'Shizuko, Caller of Autumn');a.pool.G=2;b.pool.G=1;game.turnPlayer=b;
    await game.emit('upkeep',{player:b});await settle(game);assert.equal(a.pool.G,2);assert.equal(b.pool.G,4);
    game.emptyPool();assert.equal(a.pool.G,0);assert.equal(b.pool.G,3);game.expirePersistentMana();game.emptyPool();assert.equal(b.pool.G,0);assertGameStateInvariants(game);
  });
  test(role+': combat-damage mana uses the actual damage and survives losing Sakiko',async()=>{
    const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Sakiko, Mother of Summer'),attacker=put(M,game,a,'Runeclaw Bear');
    attacker.attacking=b;game.combat={attackers:[attacker],defenders:new Map()};await game.combatDamage(a,'normal');await game.flushTriggers();assert.ok(game.stack.length);
    await game.move(source,'exile');await settle(game);assert.equal(a.pool.G,2);game.emptyPool();assert.equal(a.pool.G,2);
    game.expirePersistentMana();game.emptyPool();assert.equal(a.pool.G,0);assertGameStateInvariants(game);
  });
  test(role+': activated retained mana is an immediate mana ability with tracked spending',async()=>{
    const f=context(M,role),{game,a}=f,source=put(M,game,a,'Retained Mana Fixture'),ring=put(M,game,a,'Sol Ring','hand');
    const mana=game.manaSources(a).find(row=>row.card===source);assert.ok(mana);assert.equal(mana.m.retainManaV11,'eot');
    assert.equal(await game.castSpell(a,ring,{from:'hand'}),true);assert.equal(source.tapped,true);assert.equal(game.stack.length,1);assert.equal(a.pool.C,1);
    await settle(game);game.emptyPool();assert.equal(a.pool.C,1);await game.move(source,'exile');game.emptyPool();assert.equal(a.pool.C,1);
    game.expirePersistentMana();game.emptyPool();assert.equal(a.pool.C,0);assertGameStateInvariants(game);
  });
  test(role+': Sedge Sliver evaluates each recipient controller independently',async()=>{
    const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Sedge Sliver');
    const create=player=>{const card=new M.CardInst({name:'Plain Sliver',cost:'{2}',types:['Creature'],subtypes:['Sliver'],super:[],kws:[],oracle:'',power:'2',toughness:'2'},player);card.zone='battlefield';card.ctrl=player;game.battlefield.push(card);return card;};
    const own=create(a),opposing=create(b),swamp=put(M,game,b,'Swamp');game.recalc();
    assert.equal(own.power,2);assert.equal(source.power,2);assert.equal(opposing.power,3);
    M.OracleV8Control.gain(game,opposing,a);game.recalc();assert.equal(opposing.power,2,'the new controller has no Swamp');
    put(M,game,a,'Swamp');assert.equal(own.power,3);assert.equal(opposing.power,3);await game.move(source,'exile');assert.equal(own.power,2);assert.equal(opposing.power,2);assert.equal(swamp.ctrl,b);assertGameStateInvariants(game);
  });
  test(role+': Forgotten Monument grants mana with a real tap and life payment',async()=>{
    const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Forgotten Monument');
    const raw={name:'Plain Cave',cost:null,types:['Land'],subtypes:['Cave'],super:[],kws:[],oracle:''};
    const cave=new M.CardInst(raw,a);cave.zone='battlefield';cave.ctrl=a;game.battlefield.push(cave);game.recalc();
    assert.equal(source.cur.extraMana.length,0,'Other excludes the source');assert.equal(cave.cur.extraMana.length,1);
    const manaSource=game.manaSources(a).find(row=>row.card===cave);assert.ok(manaSource);assert.equal(manaSource.extraCost.life,1);
    for(const color of Object.keys(a.pool))a.pool[color]=0;
    const life=a.life,spell=put(M,game,a,'Opt','hand');
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);assert.equal(a.life,life-1);assert.equal(cave.tapped,true);assert.equal(game.stack.length,1,'the mana ability adds no stack object');
    await settle(game);
    M.OracleV8Control.gain(game,cave,b);game.recalc();assert.equal(cave.cur.extraMana.length,0,'an opponent does not receive the ability');assertGameStateInvariants(game);
  });
  test(role+': Metalcraft replaces the pump using the state at resolution',async()=>{
    for(const addArtifacts of [false,true]){
      const f=context(M,role),{game,a}=f,target=put(M,game,a,'Runeclaw Bear'),spell=put(M,game,a,'Mirran Mettle','hand');fund(a);
      const decide=a.controller.decide.bind(a.controller);
      a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:decide(g,q);
      assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);
      if(addArtifacts)for(let i=0;i<3;i++)put(M,game,a,'Sol Ring');
      await settle(game);assert.equal(target.power,2+(addArtifacts?4:2));assert.equal(target.toughness,target.power);assertGameStateInvariants(game);
    }
  });
  test(role+': Fatal Push checks mana value and revolt after a legal announcement',async()=>{
    for(const [name,revolt,destroyed] of [['Centaur Courser',false,false],['Centaur Courser',true,true],['Shivan Dragon',true,false],['Runeclaw Bear',false,true]]){
      const f=context(M,role),{game,a,b}=f,target=put(M,game,b,name),spell=put(M,game,a,'Fatal Push','hand');fund(a);
      const decide=a.controller.decide.bind(a.controller);
      a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:decide(g,q);
      assert.equal(await game.castSpell(a,spell,{from:'hand'}),true,'mana value does not restrict targeting');
      if(revolt){const land=put(M,game,a,'Forest');await game.sacrifice(a,land);}
      await settle(game);assert.equal(target.zone,destroyed?'graveyard':'battlefield');assertGameStateInvariants(game);
    }
  });
  test(role+': Flare of Faith tests the chosen creature and does not combine both outcomes',async()=>{
    for(const [name,human] of [['Elite Vanguard',true],['Runeclaw Bear',false]]){
      const f=context(M,role),target=put(M,f.game,f.a,name),power=target.power,toughness=target.toughness;
      await cast(f,'Flare of Faith',target);
      assert.equal(target.power,power+(human?3:2));assert.equal(target.toughness,toughness+(human?3:2));assert.equal(target.kw('indestructible'),human);
    }
  });
  test(role+': Narfi buffs the union of other snow and Zombie creatures once',async()=>{
    const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Narfi, Betrayer King');
    const make=(name,superTypes,subtypes,player)=>{const card=new M.CardInst({name,cost:'{2}',super:superTypes,types:['Creature'],subtypes,kws:[],oracle:'',power:'2',toughness:'3'},player);card.zone='battlefield';card.ctrl=player;game.battlefield.push(card);return card;};
    const snow=make('Snow Bear',['Snow'],['Bear'],a),zombie=make('Zombie',[],['Zombie'],a),both=make('Snow Zombie',['Snow'],['Zombie'],a),foreign=make('Foreign snow Zombie',['Snow'],['Zombie'],b),other=make('Other Bear',[],['Bear'],a);game.recalc();
    for(const card of [snow,zombie,both])assert.deepEqual([card.power,card.toughness],[3,4]);
    for(const card of [foreign,other])assert.deepEqual([card.power,card.toughness],[2,3]);
    assert.equal(source.power,Number(source.def.power));await game.move(source,'exile');for(const card of [snow,zombie,both])assert.deepEqual([card.power,card.toughness],[2,3]);assertGameStateInvariants(game);
  });
  test(role+': an observed entry remains bound after its enchantment leaves',async()=>{
    const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Lethal Vapors'),other=put(M,game,b,'Centaur Courser');
    const entered=put(M,game,b,'Runeclaw Bear','hand');
    await game.putPermanentOntoBattlefield(entered,b);await game.flushTriggers();
    assert.ok(game.stack.some(row=>row.srcCard===source));
    await game.move(source,'exile');await settle(game);
    assert.equal(entered.zone,'graveyard');assert.equal(other.zone,'battlefield');assertGameStateInvariants(game);
  });
  test(role+': own-or-control targets include stolen property but exclude unrelated permanents',async()=>{
    const f=context(M,role),{game,a,b}=f,owned=put(M,game,a,'Forest'),controlled=put(M,game,b,'Sol Ring'),foreign=put(M,game,b,'Mountain');
    M.OracleV8Control.gain(game,owned,b);M.OracleV8Control.gain(game,controlled,a);game.recalc();
    const spell=put(M,game,a,"Telim'Tor's Edict",'hand'),spec=spell.def.targets[0];
    assert.equal(spec.filter(game,owned,a,spell),true);assert.equal(spec.filter(game,controlled,a,spell),true);assert.equal(spec.filter(game,foreign,a,spell),false);
    await game.move(spell,'library');await cast(f,"Telim'Tor's Edict",owned);assert.equal(owned.zone,'exile');assert.equal(foreign.zone,'battlefield');
  });
  test(role+': a Blood sacrifice trigger ignores other artifact tokens',async()=>{
    const f=context(M,role),{game,a}=f;await cast(f,'Gluttonous Guest');
    const blood=game.bf().find(card=>card.isToken&&card.hasSub('Blood')),life=a.life;assert.ok(blood);
    await game.sacrifice(a,blood);await settle(game);assert.equal(a.life,life+1);
    const [other]=await game.makeTokens({name:'Other artifact',types:['Artifact'],subtypes:['Treasure'],super:[],kws:[],oracle:'',isTokenDef:true},a,{n:1});
    await game.sacrifice(a,other);await settle(game);assert.equal(a.life,life+1);assertGameStateInvariants(game);
  });
  test(role+': control, untap, haste and suspect all apply to the announced creature',async()=>{
    const f=context(M,role),{game,a,b}=f,chosen=put(M,game,b,'Runeclaw Bear'),other=put(M,game,b,'Centaur Courser');chosen.tapped=true;
    await cast(f,'Caught Red-Handed',chosen);assert.equal(chosen.ctrl,a);assert.equal(chosen.tapped,false);assert.equal(chosen.kw('haste'),true);assert.equal(chosen.meta.suspected,true);assert.equal(other.ctrl,b);assert.equal(other.meta.suspected,undefined);
    await game.move(chosen,'exile');await game.move(chosen,'battlefield',{ctrl:b});assert.equal(chosen.ctrl,b);assert.equal(chosen.kw('haste'),false);assertGameStateInvariants(game);
  });
  test(role+': colors among Allies are distinct and restricted to the controller',async()=>{
    const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Earthen Ally');
    const make=(name,colors,subtypes,player)=>{const card=new M.CardInst({name,cost:'{1}',super:[],types:['Creature'],subtypes,kws:[],oracle:'',colorsOverride:colors,power:'2',toughness:'3'},player);card.zone='battlefield';card.ctrl=player;game.battlefield.push(card);return card;};
    const red=make('Red Ally',['R'],['Ally'],a);make('Another red Ally',['R'],['Ally'],a);make('White blue Ally',['W','U'],['Ally'],a);make('Foreign black Ally',['B'],['Ally'],b);make('Green non-Ally',['G'],['Bear'],a);
    game.recalc();const ownColors=new Set(game.bf().filter(card=>card.ctrl===a&&card.hasSub('Ally')).flatMap(card=>Array.from(card.colors)));
    assert.equal(source.power,Number(source.def.power)+ownColors.size);await game.move(red,'exile');assert.equal(source.power,Number(source.def.power)+ownColors.size,'duplicate color remains represented');assertGameStateInvariants(game);
  });
  test(role+': coordinated attack buffs retain independent color filters',async()=>{
    const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Agrus Kos, Wojek Veteran'),red=put(M,game,a,'Shivan Dragon'),white=put(M,game,a,'Serra Angel'),green=put(M,game,a,'Runeclaw Bear');
    const before=[source,red,white,green].map(card=>[card.power,card.toughness]);for(const card of [source,red,white,green])card.attacking=b;
    await game.emit('attacks',{card:source,player:a,defender:b});await settle(game);
    assert.deepEqual([source.power,source.toughness],[before[0][0]+2,before[0][1]+2]);assert.deepEqual([red.power,red.toughness],[before[1][0]+2,before[1][1]]);assert.deepEqual([white.power,white.toughness],[before[2][0],before[2][1]+2]);assert.deepEqual([green.power,green.toughness],before[3]);assertGameStateInvariants(game);
  });
  test(role+': Drafna copies a paid artifact spell into an additional permanent token',async()=>{
    const f=context(M,role),{game,a}=f,source=put(M,game,a,'Drafna, Founder of Lat-Nam'),spell=put(M,game,a,'Sol Ring','hand');fund(a);
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);const original=game.stack.at(-1),ability=game.activatableList(a).find(row=>row.card===source&&row.ability.cost.tap);assert.ok(ability);
    const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(original)?[original]:decide(g,q);
    const mana=a.pool.C;assert.equal(await game.activateAbility(a,ability),true);assert.equal(source.tapped,true);assert.ok(a.pool.C<mana);await game.resolveTop();assert.ok(game.stack.some(row=>row.isCopy));await settle(game);
    const rings=game.bf().filter(card=>card.name==='Sol Ring');assert.equal(rings.length,2);assert.equal(rings.filter(card=>card.isToken).length,1);assertGameStateInvariants(game);
  });
}
