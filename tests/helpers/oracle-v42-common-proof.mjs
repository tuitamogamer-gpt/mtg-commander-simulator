import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=['Ravaging Riftwurm','Hunted Nightmare','Psychic Possession','Well of Knowledge','Celestial Kirin','Carry Away','Hardened Berserker','Ageless Sentinels','Angelic Guardian',"Arcum's Weathervane",'Ceaseless Searblades','Children of Korlis','Cyclopean Giant','Diligent Zookeeper','Dwarven Armorer','Fanatic of the Harrowing','Goblin Maskmaker','Greater Werewolf','Heartwood Storyteller','Magnigoth Treefolk','Mist Dragon','Parallax Inhibitor','Progenitor Exarch','Proteus Machine','Razorgrass Invoker','Repeat Offender','Sandstone Deadfall','Sheltering Prayers','Tainted Sigil','Unifying Theory','Void Mirror','Vulshok Battlemaster','Whipkeeper','Zenith Chronicler'];
export async function proveCommonV42(M,name,role,positive=true,h,assert=strict){
  const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
  for(const p of g.players){fund(p);while(p.library.length<45)put(M,p,'Forest');}
  g.spotlight=async()=>{};g.reviewCombatWithHuman=async()=>{};
  let picks=[],cardPicks=[],option=positive?'yes':'no';
  choose(a,q=>{
    if(q.type==='chooseTargets'&&picks.length){const requested=[picks.shift()].flat();assert.ok(requested.every(c=>q.candidates.includes(c)),'legal announced targets');return {...q,candidates:requested,min:requested.length,max:requested.length};}
    if(q.type==='chooseCards'&&cardPicks.length){const requested=cardPicks.shift();assert.ok(requested.every(c=>q.from.includes(c)),'legal card selection');return {...q,from:requested,min:requested.length,max:requested.length};}
    if(q.type==='chooseOption'&&q.options.some(o=>o.key===option))return {...q,options:q.options.filter(o=>o.key===option)};
    if(q.type==='chooseX')return {...q,min:2,max:2};return null;
  });
  choose(b,q=>q.type==='chooseOption'&&q.options.some(o=>o.key===option)?{...q,options:q.options.filter(o=>o.key===option)}:null);
  const donor=(p=a,extra={})=>permanent(M,g,p,def('V42 witness',['Creature'],{power:'3',toughness:'20',...extra}));
  const harmless=(extra={})=>def('V42 actual spell',['Instant'],{cost:'{1}',resolve:async()=>{},...extra});
  const cast=async(n=name,{player=a,targets=[],resolve=true,card,alt,from='hand'}={})=>{if(player===a)picks=targets.slice();card ||=put(M,player,n,from);const before=total(player);assert.equal(await g.castSpell(player,card,{from,...(alt?{alt}:{})}),true,typeof n==='string'?n:n.name);assert.ok(total(player)<before,'paid casting cost');const so=g.stack.find(o=>o.card===card);if(resolve)await settle(g);card.sick=false;return {card,so};};
  const activate=async(c,index=0,targets=[],player=a,resolve=true)=>{if(player===a)picks=targets.slice();const row=g.activatableList(player).find(r=>r.card===c&&r.ability===c.def.abilities[index]);assert.ok(row,'native legal activation');const before=total(player);assert.equal(await g.activateAbility(player,row),true);if(resolve)await settle(g);if(row.ability.cost?.mana&&row.ability.cost.mana!=='{0}')assert.ok(total(player)<before,'paid activation cost');return row;};
  const cleanup=async()=>{g.mainPhase=async()=>{};g.combatPhase=async()=>{};await g.runTurn();await settle(g);};
  const attack=async(cards,finish=true)=>{g.phase='combat';g.step='attackers';for(const c of cards){c.attacking=b;c.wasBlocked=false;c.blockedBy=[];g.recordCombatObjectEvent(c,'attacks');}g.combat={attackers:cards,declaredAttackTargets:cards.map(()=>b)};await g.emit('attackersDeclared',{player:a,attackers:cards});for(const c of cards)await g.emit('attacks',{player:a,card:c,defender:b});if(finish)await settle(g);};
  if(name==='Ravaging Riftwurm'){
    const before=total(a),{card:c}=await cast();assert.equal(c.counters.time,positive?5:2);assert.equal(total(a),before-(positive?7:3));await g.emit('upkeep',{player:a});await settle(g);assert.equal(c.counters.time,positive?4:1);for(let i=0;i<(positive?4:1);i++){await g.emit('upkeep',{player:a});await settle(g);}assert.equal(c.zone,'graveyard','last time counter removal sacrifices the original object');
  }else if(name==='Hunted Nightmare'){
    const ally=donor(),enemy=positive?donor(b,{kws:['hexproof']}):null;await cast(name,{targets:[b]});assert.equal(ally.kw('deathtouch'),false);if(enemy){assert.equal(enemy.counters.deathtouch,1);assert.equal(enemy.kw('deathtouch'),true);}
  }else if(name==='Psychic Possession'){
    const {card:c}=await cast(name,{targets:[b]});assert.equal(c.meta.cursedPlayer.idx,b.idx);const before=a.hand.length;await g.draw(b,1);await settle(g);assert.equal(a.hand.length,before+(positive?1:0));const library=a.library.length;await cleanup();assert.equal(a.library.length,library,'normal draw step is skipped');
  }else if(name==='Well of Knowledge'){
    const {card:c}=await cast();assert.equal(g.activatableList(a).some(row=>row.card===c),false);g.turnPlayer=b;g.phase='draw';const before=b.hand.length;await activate(c,0,[],b);assert.equal(b.hand.length,before+1);assert.equal(c.ctrl.idx,a.idx);assert.equal(g.activatableList(a).some(row=>row.card===c),false);g.phase='main1';assert.equal(g.activatableList(b).some(row=>row.card===c),false);
  }else if(name==='Celestial Kirin'){
    const own=donor(a,{types:['Artifact'],cost:'{2}'}),enemy=donor(b,{types:['Enchantment'],cost:'{2}'}),other=donor(b,{cost:'{3}'}),{card:c}=await cast();await cast(harmless({cost:'{2}',subtypes:positive?['Arcane']:[]}));assert.equal(own.zone,positive?'graveyard':'battlefield');assert.equal(enemy.zone,positive?'graveyard':'battlefield');assert.equal(other.zone,'battlefield');assert.equal(c.zone,'battlefield');
  }else if(name==='Carry Away'){
    const host=donor(b),equip=donor(b,{types:['Artifact'],subtypes:['Equipment']});await g.attach(equip,host);assert.equal(equip.attachedTo,host.iid);const {card:c}=await cast(name,{targets:[equip]});assert.equal(c.attachedTo,equip.iid);assert.equal(equip.attachedTo,null);assert.equal(host.attachments.includes(equip.iid),false);assert.equal(equip.ctrl.idx,a.idx);await g.destroy(c);assert.equal(equip.ctrl.idx,b.idx);
  }else if(name==='Hardened Berserker'){
    const {card:c}=await cast();await attack([c]);g.phase='main2';g.step='main';const first=put(M,a,harmless({cost:'{3}'}),'hand');assert.equal(g.spellCost(a,first).generic,2);if(!positive){await cleanup();fund(a);}const before=total(a);await cast(first.def,{card:first});assert.equal(total(a),before-(positive?2:3));const second=put(M,a,harmless({cost:'{3}'}),'hand');assert.equal(g.spellCost(a,second).generic,3);
  }else if(name==='Ageless Sentinels'){
    const {card:c}=await cast(),enemy=donor(b);c.blocking=enemy.iid;enemy.attacking=a;enemy.blockedBy=[c];await g.emit('blocks',{blocker:c,attacker:enemy});if(!positive){await g.move(c,'exile');await g.putPermanentOntoBattlefield(c,a);}await settle(g);assert.equal(c.hasSub('Bird'),positive);assert.equal(c.hasSub('Giant'),positive);assert.equal(c.hasSub('Wall'),!positive);assert.equal(c.kw('defender'),!positive);await cleanup();assert.equal(c.kw('defender'),!positive);
  }else if(name==='Angelic Guardian'){
    const {card:c}=await cast(),ally=donor(),other=donor();await attack([c,ally],false);if(!positive){await g.move(ally,'exile');await g.putPermanentOntoBattlefield(ally,a);}await settle(g);assert.equal(c.kw('indestructible'),true);assert.equal(ally.kw('indestructible'),positive);assert.equal(other.kw('indestructible'),false);await cleanup();assert.equal(c.kw('indestructible'),false);
  }else if(name==="Arcum's Weathervane"){
    const land=donor(a,{types:['Land'],subtypes:['Forest'],super:['Basic','Snow']}),nonbasic=donor(a,{types:['Land'],super:[]}),{card:c}=await cast();await activate(c,0,[land]);assert.equal(land.cur.super.includes('Snow'),false);g.untap(c);const spec=c.def.abilities[1].targets[0];assert.equal(g.legalTargets(spec,c,a).includes(nonbasic),false);await activate(c,1,[land]);assert.equal(land.cur.super.includes('Snow'),true);assert.equal(land.cur.super.includes('Basic'),true);await cleanup();assert.equal(land.cur.super.includes('Snow'),true);
  }else if(name==='Ceaseless Searblades'){
    const {card:c}=await cast(),power=c.power,elemental=donor(a,{types:['Artifact','Creature'],subtypes:['Elemental'],abilities:[{cost:{mana:'{1}',sacSelf:true},run:async()=>{}}]}),foreign=donor(b,{subtypes:['Elemental'],abilities:[{cost:{mana:'{1}'},run:async()=>{}}]});await activate(foreign,0,[],b);assert.equal(c.power,power);await activate(elemental);assert.equal(elemental.zone,'graveyard');assert.equal(c.power,power+1);await cleanup();assert.equal(c.power,power);
  }else if(name==='Children of Korlis'||name==='Tainted Sigil'){
    const {card:c}=await cast();await g.loseLife(a,5);await g.gainLife(a,2);await g.loseLife(b,3);const before=a.life;await activate(c);assert.equal(c.zone,'graveyard');assert.equal(a.life,before+(name==='Children of Korlis'?5:8));
  }else if(name==='Cyclopean Giant'){
    const {card:c}=await cast(),land=permanent(M,g,b,M.DEFS.Forest);picks=[land];await g.destroy(c);if(!positive)await g.putPermanentOntoBattlefield(c,a);await settle(g);assert.equal(c.zone,positive?'exile':'battlefield');assert.equal(land.hasSub('Swamp'),true);assert.equal(land.hasSub('Forest'),false);assert.ok(g.manaSources(b).some(row=>row.card===land&&row.m.produce?.some?.(v=>v.B)));
  }else if(name==='Diligent Zookeeper'){
    const multi=donor(a,{subtypes:['Elf','Warrior']}),human=donor(a,{subtypes:['Human','Warrior','Wizard']}),enemy=donor(b,{subtypes:['Elf']}),many=donor(a,{subtypes:[...M.CREATURE_SUBTYPES].filter(x=>x!=='Human').slice(0,12)}),{card:c}=await cast();assert.equal(multi.power,5);assert.equal(human.power,3);assert.equal(enemy.power,3);assert.equal(many.power,13);await g.move(c,'exile');assert.equal(multi.power,3);
  }else if(name==='Dwarven Armorer'){
    const {card:c}=await cast(),ally=donor(),discard=put(M,a,'Forest','hand');cardPicks=[[discard]];option=positive?'+1/+0':'+0/+1';await activate(c,0,[ally]);assert.equal(discard.zone,'graveyard');assert.equal(c.tapped,true);assert.equal(ally.power,positive?4:3);assert.equal(ally.toughness,positive?20:21);await cleanup();assert.equal(ally.counters[positive?'+1/+0':'+0/+1'],1);
  }else if(name==='Fanatic of the Harrowing'){
    if(positive)put(M,a,'Forest','hand');const enemy=put(M,b,'Forest','hand'),before=a.library.length;await cast();assert.equal(enemy.zone,'graveyard');assert.equal(a.hand.length,positive?1:0);assert.equal(a.library.length,before-(positive?1:0));
  }else if(name==='Goblin Maskmaker'){
    const {card:c}=await cast(),morph=put(M,a,'Willbender','hand'),alt=g.castableList(a).find(row=>row.card===morph&&row.alt?.faceDownCast==='morph').alt,before=g.spellCost(a,morph,alt).generic;await attack([c]);g.phase='main2';g.step='main';assert.equal(g.spellCost(a,morph,alt).generic,before-1);const paid=total(a);await cast('Willbender',{card:morph,alt});assert.equal(total(a),paid-2);assert.equal(morph.faceDown,true);const regular=put(M,a,harmless({cost:'{3}'}),'hand');assert.equal(g.spellCost(a,regular,{}).generic,3);await cleanup();const other=put(M,a,'Willbender','hand');assert.equal(g.spellCost(a,other,alt).generic,3);
  }else if(name==='Greater Werewolf'){
    const {card:c}=await cast(),first=donor(b),second=donor(b),other=donor(b);await attack([c]);c.wasBlocked=true;c.blockedBy=[first,second];first.blocking=c.iid;second.blocking=c.iid;for(const blocker of [first,second])await g.emit('blocks',{blocker,attacker:c});await g.emit('endCombat',{player:a});if(!positive){await g.move(second,'exile');await g.putPermanentOntoBattlefield(second,b);}await settle(g);assert.equal(first.counters['-0/-2'],1);assert.equal(first.toughness,18);assert.equal(second.counters['-0/-2']||0,positive?1:0);assert.equal(other.counters['-0/-2']||0,0);
  }else if(name==='Heartwood Storyteller'){
    await cast();const own=a.hand.length,enemy=b.hand.length;await cast(harmless(),{player:b});assert.equal(a.hand.length,own+(positive?1:0));assert.equal(b.hand.length,enemy);await cast(def('Ordinary creature'));assert.equal(a.hand.length,own+(positive?1:0));
  }else if(name==='Magnigoth Treefolk'){
    const island=permanent(M,g,a,M.DEFS.Island),forest=permanent(M,g,a,M.DEFS.Forest),{card:c}=await cast();assert.equal(c.kw('islandwalk'),true);assert.equal(c.kw('forestwalk'),true);assert.equal(c.kw('swampwalk'),false);await g.destroy(island);assert.equal(c.kw('islandwalk'),false);assert.equal(c.kw('forestwalk'),true);assert.equal(forest.zone,'battlefield');
  }else if(name==='Mist Dragon'){
    const {card:c}=await cast();await activate(c,0);assert.equal(c.kw('flying'),true);await cleanup();assert.equal(c.kw('flying'),true);await activate(c,1);assert.equal(c.kw('flying'),false);await cleanup();assert.equal(c.kw('flying'),false);fund(a);await activate(c,2);assert.equal(c.phasedOut,true);
  }else if(name==='Parallax Inhibitor'){
    const own=permanent(M,g,a,M.DEFS.Blastoderm),enemy=permanent(M,g,b,M.DEFS.Blastoderm),other=donor();g.addCounters(own,'fade',3);g.addCounters(enemy,'fade',3);g.addCounters(other,'fade',3);const {card:c}=await cast();await activate(c);assert.equal(c.zone,'graveyard');assert.equal(own.counters.fade,4);assert.equal(enemy.counters.fade,3);assert.equal(other.counters.fade,3);
  }else if(name==='Progenitor Exarch'){
    const {card:c}=await cast(),tokens=g.bf().filter(x=>x.isToken&&x.hasSub('Incubator'));assert.equal(tokens.length,2);for(const token of tokens)assert.equal(token.counters['+1/+1'],3);await activate(c,0,[tokens[0]]);assert.equal(tokens[0].is('Creature'),true);assert.equal(tokens[0].is('Artifact'),true);assert.equal(tokens[0].power,3);assert.equal(tokens[0].hasSub('Phyrexian'),true);assert.equal(tokens[1].is('Creature'),false);
  }else if(name==='Proteus Machine'){
    option='Dragon';const source=put(M,a,name,'hand'),alt=g.castableList(a).find(row=>row.card===source&&row.alt?.faceDownCast==='morph').alt;const {card:c}=await cast(name,{card:source,alt});assert.equal(c.faceDown,true);const row=g.activatableList(a).find(r=>r.card===c&&r.turnFaceUp);assert.ok(row);assert.equal(await g.activateAbility(a,row),true);await settle(g);assert.equal(c.hasSub('Dragon'),true);assert.equal(c.hasSub('Shapeshifter'),false);assert.equal(c.is('Artifact'),true);await cleanup();assert.equal(c.hasSub('Dragon'),true);await g.move(c,'exile');await g.putPermanentOntoBattlefield(c,a);assert.equal(c.hasSub('Dragon'),false);
  }else if(name==='Razorgrass Invoker'){
    const {card:c}=await cast(),ally=donor(),before=c.power;await activate(c,0,[positive?[ally]:[]]);assert.equal(c.power,before+3);assert.equal(ally.power,positive?6:3);await cleanup();assert.equal(c.power,before);
  }else if(name==='Repeat Offender'){
    const {card:c}=await cast(),power=c.power;await activate(c);assert.equal(c.meta.suspected,true);assert.equal(c.kw('menace'),true);assert.equal(c.power,power);await activate(c);assert.equal(c.power,power+1);assert.equal(c.counters['+1/+1'],1);await cleanup();assert.equal(c.meta.suspected,true);
  }else if(name==='Sandstone Deadfall'){
    const {card:c}=await cast(),enemy=donor(b);enemy.attacking=a;const first=permanent(M,g,a,M.DEFS.Forest);assert.equal(g.activatableList(a).some(row=>row.card===c),false);const second=permanent(M,g,a,M.DEFS.Island);cardPicks=[[first,second]];await activate(c,0,[enemy]);assert.equal(c.zone,'graveyard');assert.equal(first.zone,'graveyard');assert.equal(second.zone,'graveyard');assert.equal(enemy.zone,'graveyard');
  }else if(name==='Sheltering Prayers'){
    const land=permanent(M,g,a,M.DEFS.Forest),enemy=permanent(M,g,b,M.DEFS.Forest),nonbasic=donor(a,{types:['Land'],super:[]});await cast();assert.equal(land.kw('shroud'),true);assert.equal(enemy.kw('shroud'),true);assert.equal(nonbasic.kw('shroud'),false);permanent(M,g,a,M.DEFS.Island);const fourth=permanent(M,g,a,M.DEFS.Plains);assert.equal(land.kw('shroud'),false);assert.equal(enemy.kw('shroud'),true);await g.destroy(fourth);assert.equal(land.kw('shroud'),true);
  }else if(name==='Unifying Theory'){
    await cast();const before=b.hand.length,mana=total(b);await cast(harmless(),{player:b});assert.equal(b.hand.length,before+(positive?1:0));assert.equal(total(b),mana-(positive?3:1));assert.equal(a.hand.length,0);
  }else if(name==='Void Mirror'){
    await cast();for(const color of Object.keys(b.pool))b.pool[color]=0;b.pool[positive?'C':'U']=1;let resolved=0;const {card:c}=await cast(harmless({resolve:async()=>resolved++}),{player:b});assert.equal(resolved,positive?0:1);assert.equal(c.zone,'graveyard');
  }else if(name==='Vulshok Battlemaster'){
    const first=donor(a,{types:['Artifact'],subtypes:['Equipment']}),second=donor(b,{types:['Artifact'],subtypes:['Equipment']}),{card:c}=await cast();assert.equal(first.attachedTo,c.iid);assert.equal(second.attachedTo,c.iid);assert.equal(second.ctrl.idx,b.idx);assert.equal(first.ctrl.idx,a.idx);
  }else if(name==='Whipkeeper'){
    const {card:c}=await cast(),enemy=donor(b),other=donor(b);await g.damageBatch([{src:other,target:enemy,n:3}],{deferSBA:true});enemy.regenShield=1;await g.destroy(enemy);assert.equal(enemy.damage,0);await activate(c,0,[enemy]);assert.equal(enemy.damage,3);g.untap(c);if(!positive){await g.move(enemy,'exile');await g.putPermanentOntoBattlefield(enemy,b);}await activate(c,0,[enemy]);assert.equal(enemy.damage,positive?9:0);
  }else if(name==='Zenith Chronicler'){
    await cast();const before=a.hand.length;await cast(harmless({cost:'{1}',colorsOverride:['R']}),{player:b});assert.equal(a.hand.length,before);await cast(harmless({cost:'{W}{U}',colorsOverride:['W','U']}),{player:b});assert.equal(a.hand.length,before+1);await cast(harmless({cost:'{W}{U}',colorsOverride:['W','U']}),{player:b});assert.equal(a.hand.length,before+1);
  }else throw Error('Missing v42 proof '+name);
  assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV42(M,entry,op,role,h){
  if(!names.includes(entry.raw.name)||!['generic-trigger','generic-ability','type-count-boost-v42','domain-landwalk-v42','small-land-shroud-v42','enters-with-counters','mechanic-vanishing','mechanic-skip-draw-v9'].includes(op.kind))return null;
  let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));for(const positive of [true,false])await proveCommonV42(M,entry.raw.name,role,positive,h,assert);return count;
}
