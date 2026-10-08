import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose,cards as chooseCards,targets,source} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=['Zask, Skittering Swarmlord','Rose Noble','Shipwreck Sifters','Rage Extractor','Aragorn, Hornburg Hero','Ichneumon Druid','Volo, Guide to Monsters','Leyline of Resonance','Ertha Jo, Frontier Mentor','Dragonlord Kolaghan','Emberwilde Captain','Oath of Kaya','Slagstone Refinery','Ultron the Annihilator',"Ultron's Auxiliary",'Horn of the Mark','The Destined Thief','Rakshasa Vizier','Rielle, the Everwise',"Chandra's Phoenix",'Syr Carah, the Bold','The Thing, Ben Grimm','Taii Wakeen, Perfect Shot','Arashin War Beast'];
export async function proveEventV37(M,name,role,h,assert=strict){
  const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
  for(const p of g.players){fund(p);while(p.library.length<40)put(M,p,'Forest');}
  g.reviewCombatWithHuman=async()=>{};g.spotlight=async()=>{};
  const donor=(p=a,extra={})=>permanent(M,g,p,def('V37 witness',['Creature'],{power:'2',toughness:'20',...extra}));
  if(name==='Oath of Kaya')targets(a,[b]);
  const c=await source(M,f,name,settle);c.sick=false;
  const cast=async(d,player=a,resolve=true)=>{const card=put(M,player,d,'hand'),paid=total(player),turn=g.turnPlayer;g.turnPlayer=player;assert.equal(await g.castSpell(player,card,{from:'hand'}),true);assert.ok(total(player)<paid);const so=g.stack.find(row=>row.card===card);if(resolve)await settle(g);g.turnPlayer=turn;return {card,so};};
  const activate=async(card,index=0,player=a)=>{const row=g.activatableList(player).find(row=>row.card===card&&row.ability===card.def.abilities[index]);assert.ok(row);const paid=total(player);assert.equal(await g.activateAbility(player,row),true);await settle(g);if(row.ability.cost?.mana)assert.ok(total(player)<paid);};
  const harmless=(label,types=['Instant'],extra={})=>def(label,types,{cost:'{1}',resolve:async()=>{},...extra});
  const attackers=async(player,list,defenders)=>{g.turnPlayer=player;g.phase='combat';g.combat={attackers:list,defenders:new Map(),declaredAttackTargets:[]};list.forEach((card,i)=>{card.attacking=defenders[i]||defenders[0];card.blockedBy=[];});await g.emit('attackersDeclared',{player,attackers:list});await settle(g);};
  if(name==='Zask, Skittering Swarmlord'){
    const insect=donor(a,{subtypes:['Insect']}),before=a.library.length,gy=a.graveyard.length;await g.destroy(insect);await settle(g);assert.equal(insect.zone,'library');assert.equal(a.library[0],insect);assert.equal(a.library.length,before-1);assert.equal(a.graveyard.length,gy+2);
    await g.destroy(donor(a));await g.destroy(donor(b,{subtypes:['Insect']}));await settle(g);assert.equal(a.library.length,before-1);await g.destroy(c);assert.equal(g.pendingTriggers.filter(row=>row.src===c).length,0);await settle(g);assert.equal(c.zone,'graveyard');
  }else if(name==='Rose Noble'){
    const start=a.library.length;await cast(harmless('Doctor spell',['Creature'],{subtypes:['Doctor']}));assert.equal(a.library.length,start-1);
    await cast(harmless('Companion spell',['Creature'],{oracleCommanderPairing:{variant:'doctorsCompanion'}}));assert.equal(a.library.length,start-2);
    await cast(harmless('Ordinary spell',['Creature']));await cast(harmless('Foreign Doctor',['Creature'],{subtypes:['Doctor']}),b);assert.equal(a.library.length,start-2);
  }else if(name==='Shipwreck Sifters'){
    const before=c.counters['+1/+1']||0,spirit=put(M,a,def('Spirit discard',['Creature'],{subtypes:['Spirit']}),'hand'),disturb=put(M,a,def('Disturb discard',['Creature'],{bomDisturb:'{2}'}),'hand');
    await g.discard(a,[spirit,disturb]);await settle(g);assert.equal(c.counters['+1/+1'],before+2);await g.discard(a,[put(M,a,'Forest','hand')]);await g.discard(b,[put(M,b,spirit.def,'hand')]);await settle(g);assert.equal(c.counters['+1/+1'],before+2);
  }else if(name==='Rage Extractor'){
    targets(a,[b]);const life=b.life;await cast(harmless('Phyrexian spell',['Instant'],{cost:'{3}{U/P}'}));assert.equal(b.life,life-4);
    await cast(harmless('Ordinary blue spell',['Instant'],{cost:'{3}{U}'}));await cast(harmless('Foreign phyrexian spell',['Instant'],{cost:'{U/P}'}),b);assert.equal(b.life,life-4);
  }else if(name==='Ichneumon Druid'){
    const life=b.life;await cast(harmless('First instant'),b);assert.equal(b.life,life);await cast(harmless('Intervening sorcery',['Sorcery']),b);assert.equal(b.life,life);
    await cast(harmless('Second instant'),b);assert.equal(b.life,life-4);await cast(harmless('Own instant'));assert.equal(b.life,life-4);
  }else if(name==='Dragonlord Kolaghan'){
    const d=harmless('Graveyard name',['Creature']);put(M,b,d,'graveyard');const life=b.life;await cast(d,b);assert.equal(b.life,life-10);await cast(harmless('Different name',['Creature']),b);await cast(d,a);assert.equal(b.life,life-10);
  }else if(name==='Volo, Guide to Monsters'){
    const goblin=harmless('Volo Goblin',['Creature'],{subtypes:['Goblin']});await cast(goblin);assert.equal(g.bf().filter(card=>card.name===goblin.name).length,2);assert.equal(g.bf().filter(card=>card.name===goblin.name&&card.isToken).length,1);
    await cast(goblin);assert.equal(g.bf().filter(card=>card.name===goblin.name).length,3);const elf=harmless('Volo Elf',['Creature'],{subtypes:['Elf']});put(M,a,elf,'graveyard');await cast(elf);assert.equal(g.bf().filter(card=>card.name===elf.name).length,1);
    await cast(harmless('Volo Human',['Creature'],{subtypes:['Human']}));assert.equal(g.bf().filter(card=>card.name==='Volo Human').length,1);
  }else if(name==='Leyline of Resonance'){
    const own=donor(a),foreign=donor(b);targets(a,[own]);const d=harmless('Targeted counter spell',['Instant'],{targets:[M.T.creature()],resolve:async ctx=>{if(ctx.targets[0])ctx.g.addCounters(ctx.targets[0],'+1/+1',1);}});await cast(d);assert.equal(own.counters['+1/+1'],2);
    targets(a,[foreign]);await cast(d);assert.equal(foreign.counters['+1/+1'],1);assert.equal(own.counters['+1/+1'],2);
  }else if(name==='Ertha Jo, Frontier Mentor'){
    const own=donor(a),artifact=donor(a,{types:['Artifact']}),abilities=[M.T.creature(),M.T.permanent()].map(spec=>({cost:{mana:'{1}'},targets:[spec],run:async ctx=>{if(ctx.targets[0])ctx.g.addCounters(ctx.targets[0],'+1/+1',1);}})),activator=donor(a,{abilities});
    targets(a,[own]);await activate(activator);assert.equal(own.counters['+1/+1'],2);targets(a,[artifact]);await activate(activator,1);assert.equal(artifact.counters['+1/+1'],1);
  }else if(name==='Emberwilde Captain'){
    assert.equal(g.monarch,a);const first=donor(b),second=donor(b);put(M,b,harmless('Attacker hand A'),'hand');put(M,b,harmless('Attacker hand B'),'hand');const life=b.life;
    await attackers(b,[first,second],[a]);assert.equal(b.life,life-2);g.monarch=b;await attackers(b,[first,second],[a]);assert.equal(b.life,life-2);
  }else if(name==='Oath of Kaya'){
    const pw1=donor(a,{types:['Planeswalker'],loyalty:10}),pw2=donor(a,{types:['Planeswalker'],loyalty:10});g.addCounters(pw1,'loyalty',10);g.addCounters(pw2,'loyalty',10);
    const first=donor(b),second=donor(b),third=donor(b),life=a.life,enemy=b.life;
    await attackers(b,[first,second,third],[pw1,pw1,pw2]);assert.equal(a.life,life+4);assert.equal(b.life,enemy-4);await attackers(b,[first,second],[a]);assert.equal(a.life,life+4);assert.equal(b.life,enemy-4);
  }else if(name==='Horn of the Mark'){
    const first=donor(a),second=donor(a);for(let i=0;i<10;i++)put(M,a,def('Horn find '+i));choose(a,q=>q.type==='chooseCards'&&q.max===1&&q.from.some(card=>card.zone==='library'&&card.is('Creature'))?{...q,min:1}:null);
    const hand=a.hand.length;await attackers(a,[first,second],[b]);assert.equal(a.hand.length,hand+1);await attackers(a,[first],[b]);assert.equal(a.hand.length,hand+1);
  }else if(name==='Aragorn, Hornburg Hero'){
    const renowned=donor(a),plain=donor(a);renowned.meta.renowned=true;g.addCounters(renowned,'+1/+1',3);g.addCounters(plain,'+1/+1',2);
    await attackers(a,[renowned,plain],[b]);g.recalc();await g.combatDamage(a,'first');await settle(g);assert.equal(renowned.counters['+1/+1'],6);assert.equal(plain.counters['+1/+1'],3);assert.equal(plain.meta.renowned,true);
    await g.damageBatch([{src:renowned,target:b,n:1}],{deferSBA:true});await settle(g);assert.equal(renowned.counters['+1/+1'],6);
  }else if(name==='The Thing, Ben Grimm'){
    const one=donor(a,{subtypes:['Hero']}),two=donor(a,{subtypes:['Hero']}),other=donor(a),foreign=donor(b,{subtypes:['Hero']});
    await g.damageBatch([{src:one,target:b,n:1},{src:two,target:b,n:1},{src:other,target:b,n:1}],{deferSBA:true});await settle(g);assert.equal(c.counters['+1/+1'],2);
    await g.damageBatch([{src:foreign,target:a,n:1}],{deferSBA:true});await settle(g);assert.equal(c.counters['+1/+1'],2);
    await g.damageBatch([{src:one,target:b,n:1},{src:one,target:a,n:1}],{deferSBA:true});await settle(g);assert.equal(c.counters['+1/+1'],6);
  }else if(name==='The Destined Thief'){
    const one=donor(a),two=donor(a),third=g.addPlayer('Third',{name:'Third'},b.controller,false);third.life=40;for(let i=0;i<20;i++)put(M,third,'Forest');put(M,a,'Forest','hand');
    const before=a.library.length,hand=a.hand.length;await g.damageBatch([{src:one,target:b,n:1},{src:two,target:third,n:1}],{combat:true,deferSBA:true});await settle(g);assert.equal(a.library.length,before-1);assert.equal(a.hand.length,hand);
    for(const subtype of ['Cleric','Rogue','Warrior','Wizard'])donor(a,{subtypes:[subtype]});const now=a.hand.length;await g.damageBatch([{src:one,target:b,n:1}],{combat:true,deferSBA:true});await settle(g);assert.equal(a.hand.length,now+3);
  }else if(name==='Taii Wakeen, Perfect Shot'){
    const victim=donor(b,{toughness:'4'}),other=donor(b,{toughness:'8'}),hand=a.hand.length;targets(a,[victim]);await cast(harmless('Exact damage spell',['Instant'],{targets:[M.T.creature()],resolve:ctx=>ctx.g.damageBatch([{src:ctx.src,target:ctx.targets[0],n:4}],{deferSBA:true})}));assert.equal(victim.zone,'graveyard');assert.equal(a.hand.length,hand+1);
    await g.damageBatch([{src:c,target:other,n:8}],{combat:true,deferSBA:true});await settle(g);assert.equal(a.hand.length,hand+1);
    await g.damageBatch([{src:c,target:donor(b,{toughness:'7'}),n:6}],{deferSBA:true});await settle(g);assert.equal(a.hand.length,hand+1);
  }else if(name==='Arashin War Beast'){
    const one=donor(b),two=donor(b),other=donor(b);c.attacking=b;c.blockedBy=[one,two];one.blocking=two.blocking=c.iid;g.combat={attackers:[c],defenders:new Map()};const before=g.bf().filter(card=>card.faceDown).length;
    await g.damageBatch([{src:c,target:one,n:1},{src:c,target:two,n:1},{src:c,target:other,n:1}],{combat:true,deferSBA:true});await settle(g);assert.equal(g.bf().filter(card=>card.faceDown).length,before+1);
    await g.damageBatch([{src:c,target:one,n:1}],{deferSBA:true});await g.damageBatch([{src:c,target:other,n:1}],{combat:true,deferSBA:true});await settle(g);assert.equal(g.bf().filter(card=>card.faceDown).length,before+1);
  }else if(name==='Rakshasa Vizier'){
    const first=put(M,a,'Forest','graveyard'),second=put(M,a,harmless('Exiled instant'),'graveyard'),foreign=put(M,b,'Forest','graveyard');await g.moveGraveyardBatch([first,second,foreign],'exile');await settle(g);assert.equal(c.counters['+1/+1'],2);
    await g.move(put(M,a,'Forest','graveyard'),'hand');await g.move(put(M,a,'Forest','hand'),'exile');await settle(g);assert.equal(c.counters['+1/+1'],2);
  }else if(name==='Rielle, the Everwise'){
    const first=put(M,a,harmless('Discarded instant'),'hand'),second=put(M,a,'Forest','hand'),before=a.library.length;await g.discard(a,[first,second]);await settle(g);assert.equal(a.library.length,before-2);
    await g.discard(a,[put(M,a,'Forest','hand')]);await settle(g);assert.equal(a.library.length,before-2);g.turnNo++;a.turnState=a.freshTurnState();await g.discard(a,[put(M,a,'Forest','hand')]);await settle(g);assert.equal(a.library.length,before-3);
  }else if(name==='Slagstone Refinery'){
    const count=()=>g.bf().filter(card=>card.ctrl===a&&card.hasSub('Powerstone')).length;
    await g.destroy(donor(a,{types:['Artifact']}));await settle(g);assert.equal(count(),1);await g.move(donor(a,{types:['Artifact']}),'exile');await settle(g);assert.equal(count(),2);
    const [token]=await g.makeTokens(def('Other artifact token',['Artifact']),a,{n:1});await g.destroy(token);await g.move(donor(a,{types:['Artifact']}),'hand');await settle(g);assert.equal(count(),2);
    await g.move(c,'exile');await settle(g);assert.equal(count(),3);const powerstone=g.bf().find(card=>card.hasSub('Powerstone'));assert.equal(powerstone.tapped,true);g.untap(powerstone);for(const color of Object.keys(a.pool))a.pool[color]=0;await g.activateManaSource(a,g.manaSources(a).find(row=>row.card===powerstone),{C:1});assert.equal(a.pool.C,1);
    assert.equal(g.canPayMana(a,M.parseCost('{1}'),{card:put(M,a,harmless('Forbidden nonartifact'),'hand')}),false);assert.equal(g.canPayMana(a,M.parseCost('{1}'),{card:put(M,a,harmless('Allowed artifact',['Artifact']),'hand')}),true);
  }else if(name==='Ultron the Annihilator'||name==="Ultron's Auxiliary"){
    let n=0;const initial=b.life,check=()=>name==='Ultron the Annihilator'?assert.equal(b.life,initial-n):assert.equal(c.counters['+1/+1']||0,n);
    await g.destroy(donor(a,{types:['Artifact']}));n++;await settle(g);check();const owned=donor(a,{types:['Artifact']});owned.ctrl=b;g.recalc();await g.destroy(owned);n++;await settle(g);check();const borrowed=donor(b,{types:['Artifact']});borrowed.ctrl=a;g.recalc();await g.destroy(borrowed);await settle(g);check();
    put(M,a,def('Milled artifact',['Artifact']));await g.mill(a,1);n++;await settle(g);check();put(M,a,'Forest');await g.mill(a,1);await settle(g);check();await g.destroy(c);assert.equal(g.pendingTriggers.filter(row=>row.src===c).length,0);await settle(g);assert.equal(c.zone,'graveyard');if(name==='Ultron the Annihilator')check();else assert.equal(c.counters['+1/+1']||0,0);
  }else if(name==='Syr Carah, the Bold'){
    targets(a,[b]);const library=a.library.length;await activate(c);assert.equal(a.library.length,library-1);const exiled=a.exile.at(-1);assert.equal(await g.playLand(a,exiled),true);await settle(g);
    await cast(harmless('Own damage spell',['Instant'],{resolve:ctx=>ctx.g.damagePlayer(ctx.src,b,1)}));assert.equal(a.library.length,library-2);
    await cast(harmless('Foreign damage spell',['Instant'],{resolve:ctx=>ctx.g.damagePlayer(ctx.src,a,1)}),b);assert.equal(a.library.length,library-2);
  }else if(name==="Chandra's Phoenix"){
    await g.destroy(c);await settle(g);assert.equal(c.zone,'graveyard');await cast(harmless('Blue sorcery',['Sorcery'],{cost:'{U}',resolve:ctx=>ctx.g.damagePlayer(ctx.src,b,1)}));assert.equal(c.zone,'graveyard');
    await cast(harmless('Red instant',['Instant'],{cost:'{R}',resolve:ctx=>ctx.g.damagePlayer(ctx.src,b,1)}));assert.equal(c.zone,'hand');const before=total(a);assert.equal(await g.castSpell(a,c,{from:'hand'}),true);assert.ok(total(a)<before);await settle(g);await g.destroy(c);await settle(g);
    const walker=donor(a,{types:['Planeswalker'],colorsOverride:['R']});g.addCounters(walker,'loyalty',10);await g.damagePlayer(walker,b,1);await settle(g);assert.equal(c.zone,'hand');
  }else throw Error('Missing v37 proof '+name);
  assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV37(M,entry,op,role,h){
  if(!names.includes(entry.raw.name)||op.kind!=='generic-trigger')return null;
  // Ordinary ETB and ability clauses keep their independent generic proofs.
  if(!op.eventTestV37&&!['oracleDamageHit','oracleDamageBySource','oracleDamageToObject','oracleDamageByController'].includes(op.event)&&!["Chandra's Phoenix",'Zask, Skittering Swarmlord'].includes(entry.raw.name))return null;
  let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));await proveEventV37(M,entry.raw.name,role,h,assert);return count;
}
