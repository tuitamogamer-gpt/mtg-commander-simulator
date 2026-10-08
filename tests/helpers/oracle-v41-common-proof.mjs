import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=['Become Brutes','Choking Vines','Concerted Defense','Display of Power','Drag the Canal','Druidic Ritual','Eliminate the Impossible','Ember Gale','Embiggen','Encircling Fissure','Flame Spill','Fractalize','Full Steam Ahead','Grasping Tentacles','Hide in Plain Sight','Incremental Growth','Irencrag Feat',"Karn's Touch","Mercadia's Downfall",'Moonmist','Nightmare Incursion','Outmaneuver','Pigment Storm','Risk Factor','Rune Snag','Sanctified Charge','Serene Remembrance','Surrounded by Orcs','Swallowed by Leviathan','Swarm Surge','Terrifying Presence','Turn the Earth','Waxing Moon','Write into Being'];
export async function proveSpellV41(M,name,role,positive=true,h,assert=strict){
  const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
  for(const p of g.players){fund(p);while(p.library.length<45)put(M,p,'Forest');}
  g.spotlight=async()=>{};g.reviewCombatWithHuman=async()=>{};
  let picks=[],cardPicks=[],option=positive?'yes':'no',x=2,surveillance=0,observedTax=0;
  choose(a,q=>{
    if(q.type==='chooseTargets'&&picks.length){const requested=[picks.shift()].flat();assert.ok(requested.every(c=>q.candidates.includes(c)),'legal announced targets');return {...q,candidates:requested,min:requested.length,max:requested.length};}
    if(q.type==='chooseCards'&&cardPicks.length){const requested=cardPicks.shift();assert.ok(requested.every(c=>q.from.includes(c)),'legal resolution selection');return {...q,from:requested,min:requested.length,max:requested.length};}
    if(q.type==='chooseOption'&&q.options.some(o=>o.key===option))return {...q,options:q.options.filter(o=>o.key===option)};
    if(q.type==='chooseX')return {...q,min:x,max:x};
    if(q.type==='scry'&&q.surveil)surveillance+=q.cards.length;
    return null;
  });
  choose(b,q=>{if(q.type==='chooseOption'&&/^Pay \{\d+\} to prevent counter/.test(q.prompt))observedTax=Number(q.prompt.match(/\d+/)[0]);return q.type==='chooseOption'&&q.options.some(o=>o.key===option)?{...q,options:q.options.filter(o=>o.key===option)}:null;});
  const donor=(p=a,extra={})=>permanent(M,g,p,def('V41 witness',['Creature'],{power:'3',toughness:'20',...extra}));
  const harmless=(label='V41 spell',extra={})=>def(label,['Instant'],{cost:'{1}',resolve:async()=>{},...extra});
  const cast=async(n=name,{player=a,targets=[],resolve=true,card,alt,from='hand'}={})=>{
    if(player===a)picks=targets.slice();card ||=put(M,player,n,from);const before=total(player);
    assert.equal(await g.castSpell(player,card,{from,...(alt?{alt}:{})}),true,typeof n==='string'?n:n.name);assert.ok(total(player)<before,'paid casting mana');const so=g.stack.find(o=>o.card===card);if(resolve)await settle(g);return {card,so};
  };
  const cleanup=async()=>{g.mainPhase=async()=>{};g.combatPhase=async()=>{};await g.runTurn();await settle(g);};
  const attack=(card,defender=b)=>{card.attacking=defender;card.blockedBy=[];card.wasBlocked=false;g.recordCombatObjectEvent(card,'attacks');return card;};
  if(name==='Become Brutes'){
    const first=donor(),second=donor(),power=first.power;await cast(name,{targets:[[first,second]],resolve:false});if(!positive)await g.move(second,'exile');await settle(g);assert.equal(first.kw('haste'),true);assert.equal(first.kw('trample'),true);assert.equal(first.power,power+1);assert.equal(g.bf().filter(c=>c.hasSub('Role')).length,positive?2:1);await cleanup();assert.equal(first.kw('haste'),false);assert.equal(first.kw('trample'),true);
  }else if(name==='Choking Vines'){
    const first=attack(donor(b),a),second=attack(donor(b),a),card=put(M,a,name,'hand');assert.equal(await g.castSpell(a,card,{from:'hand'}),false);g.phase='combat';g.step='blockers';await cast(name,{card,targets:[[first,second]],resolve:false});if(!positive)await g.move(second,'exile');await settle(g);assert.equal(first.wasBlocked,true);assert.equal(first.blockedBy.length,0);assert.equal(first.damage,1);assert.equal(second.damage,positive?1:0);
  }else if(['Concerted Defense','Rune Snag','Swallowed by Leviathan'].includes(name)){
    let resolved=0;const {so}=await cast(harmless('Counter target',{resolve:async()=>resolved++}),{player:b,resolve:false});let tax=0;
    if(name==='Concerted Defense'){donor(a,{subtypes:['Cleric','Wizard']});donor(a,{subtypes:['Warrior']});donor(b,{subtypes:['Rogue']});tax=3;}
    else if(name==='Rune Snag'){put(M,a,name,'graveyard');put(M,b,name,'graveyard');tax=6;}
    else {put(M,a,'Forest','graveyard');tax=10;}
    for(const color of Object.keys(b.pool))b.pool[color]=0;b.pool.C=positive?tax:tax-1;
    
    await cast(name,{targets:[so]});assert.equal(resolved,positive?1:0);assert.equal(b.pool.C,positive?tax-observedTax:tax-1);if(name==='Swallowed by Leviathan'){assert.equal(surveillance,2);assert.equal(observedTax,a.graveyard.length-1);}else assert.equal(observedTax,tax);
  }else if(name==='Display of Power'){
    let resolved=0;const first=await cast(harmless('First copy target',{resolve:async()=>resolved++}),{player:b,resolve:false}),second=await cast(harmless('Second copy target',{resolve:async()=>resolved++}),{player:b,resolve:false});
    const {so}=await cast(name,{targets:[[first.so,second.so]],resolve:false});assert.equal(await g.copySpell(so,a,{mayNewTargets:true}),null,'printed prohibition prevents copying Display');if(!positive)await g.counterStackObject(first.so);await g.resolveTop();assert.equal(g.stack.filter(o=>o.isCopy).length,positive?2:1);await settle(g);assert.equal(resolved,positive?4:2);
  }else if(name==='Drag the Canal'){
    if(positive)await g.destroy(donor(b));const life=a.life;await cast();assert.equal(g.bf().filter(c=>c.isToken&&c.hasSub('Detective')).length,1);assert.equal(g.bf().filter(c=>c.hasSub('Clue')).length,positive?1:0);assert.equal(a.life,life+(positive?2:0));
  }else if(name==='Druidic Ritual'){
    const grave=put(M,a,def('Old grave creature'),'graveyard'),top=put(M,a,def('Milled creature')),land=put(M,a,'Forest');put(M,a,'Island');const before=a.library.length;
    cardPicks=[[positive?top:grave],[positive?land:[]].flat()];await cast();assert.equal(a.library.length,before-(positive?3:0));assert.equal((positive?top:grave).zone,'hand');assert.equal(grave.zone,positive?'graveyard':'hand');assert.equal(land.zone,positive?'hand':'library');
  }else if(name==='Eliminate the Impossible'){
    const enemy=donor(b),own=donor();enemy.meta.suspected=true;own.meta.suspected=true;g.recalc();await cast();assert.equal(enemy.power,1);assert.equal(enemy.meta.suspected,false);assert.equal(own.power,3);assert.equal(own.meta.suspected,true);assert.equal(g.bf().filter(c=>c.hasSub('Clue')).length,1);await cleanup();assert.equal(enemy.power,3);assert.equal(enemy.meta.suspected,false);
  }else if(name==='Ember Gale'){
    const white=donor(b,{colorsOverride:['W','U']}),red=donor(b,{colorsOverride:['R']}),own=donor(a,{colorsOverride:['W']});await cast(name,{targets:[b]});assert.equal(white.damage,1);assert.equal(red.damage,0);assert.equal(own.damage,0);const attacker=attack(own);assert.equal(g.canBlock(white,attacker),false);assert.equal(g.canBlock(red,attacker),false);await cleanup();attack(own);assert.equal(g.canBlock(red,own),true);
  }else if(name==='Embiggen'){
    const c=donor(a,{types:['Creature','Artifact'],subtypes:['Human','Warrior'],super:['Legendary']}),brush=donor(a,{subtypes:['Brushwagg']}),card=put(M,a,name,'hand'),spec=g.spellTargetSpecs(card,{},a)[0];assert.equal(g.legalTargets(spec,card,a).includes(brush),false);await cast(name,{card,targets:[c],resolve:false});if(!positive){await g.move(c,'exile');await g.putPermanentOntoBattlefield(c,a);}await settle(g);assert.equal(c.power,positive?8:3);await cleanup();assert.equal(c.power,3);
  }else if(name==='Encircling Fissure'||name==='Terrifying Presence'){
    const own=donor(),enemy=donor(b);await cast(name,{targets:[name==='Encircling Fissure'?b:own]});const late=donor(b),life=a.life;await g.damageBatch([{src:enemy,target:a,n:2},{src:late,target:a,n:2},{src:own,target:a,n:2}],{combat:true,deferSBA:true});assert.equal(a.life,life-2);const next=a.life;await g.damageBatch([{src:enemy,target:a,n:2}],{deferSBA:true});assert.equal(a.life,next-2);
    if(!positive){await g.move(own,'exile');await g.putPermanentOntoBattlefield(own,a);const life=a.life;await g.damageBatch([{src:own,target:a,n:2}],{combat:true,deferSBA:true});assert.equal(a.life,life-(name==='Encircling Fissure'?2:0));}
    await cleanup();const post=a.life;await g.damageBatch([{src:enemy,target:a,n:2}],{combat:true,deferSBA:true});assert.equal(a.life,post-2);
  }else if(name==='Flame Spill'||name==='Pigment Storm'){
    const target=donor(b,{toughness:positive?'3':'9'}),life=b.life,n=name==='Flame Spill'?4:5;target.damage=1;await cast(name,{targets:[target]});assert.equal(b.life,life-(positive?n-2:0));assert.equal(target.zone,positive?'graveyard':'battlefield');if(!positive)assert.equal(target.damage,n+1);
  }else if(name==='Fractalize'){
    const c=donor(a,{types:['Artifact','Creature'],subtypes:['Elf'],super:['Legendary'],colorsOverride:['R']}),power=c.power;await cast(name,{targets:[c],resolve:false});if(!positive){await g.move(c,'exile');await g.putPermanentOntoBattlefield(c,a);}await settle(g);assert.equal(c.power,positive?3:power);assert.equal(c.toughness,positive?3:20);assert.equal(c.hasSub('Fractal'),positive);assert.equal(c.hasSub('Elf'),!positive);assert.equal(c.is('Artifact'),true);assert.equal(c.colors.includes('R'),!positive);await cleanup();assert.equal(c.toughness,20);assert.equal(c.hasSub('Elf'),true);
  }else if(name==='Full Steam Ahead'){
    const c=donor(),enemy=donor(b);await cast();assert.equal(c.power,5);assert.equal(c.kw('trample'),true);assert.equal(c.cur.maxBlockers,1);assert.equal(enemy.power,3);const late=donor();assert.equal(late.power,3);await cleanup();assert.equal(c.power,3);assert.equal(c.kw('trample'),false);
  }else if(name==='Grasping Tentacles'){
    const artifact=put(M,b,def('Tentacle artifact',['Artifact'])),before=b.library.length;cardPicks=[positive?[artifact]:[]];await cast(name,{targets:[b]});assert.equal(b.library.length,before-8);assert.equal(artifact.zone,positive?'battlefield':'graveyard');if(positive)assert.equal(artifact.ctrl.idx,a.idx);
  }else if(name==='Hide in Plain Sight'||name==='Write into Being'){
    const n=name==='Hide in Plain Sight'?5:2,seen=[];for(let i=0;i<n;i++)seen.push(put(M,a,def('Seen creature '+i)));const picked=seen.slice(- (n===5?2:1)),before=a.library.length;cardPicks=[picked];option=positive?'top':'bottom';await cast();assert.equal(a.library.length,before-picked.length);for(const c of picked){assert.equal(c.zone,'battlefield');assert.equal(c.faceDown,true);assert.equal(c.power,2);assert.equal(c.meta.faceDownKind,n===5?'cloak':'manifest');}
    if(n===5)assert.ok(seen.slice(0,3).every(c=>a.library.slice(0,3).includes(c)));else assert.equal((positive?a.library.at(-1):a.library[0]).iid,seen[0].iid);
    const row=g.activatableList(a).find(r=>r.card===picked[0]&&r.turnFaceUp);assert.ok(row);assert.equal(await g.activateAbility(a,row),true);assert.equal(picked[0].faceDown,false);
  }else if(name==='Incremental Growth'){
    const cards=[donor(),donor(),donor()];await cast(name,{targets:cards,resolve:false});if(!positive)await g.move(cards[1],'exile');await settle(g);assert.equal(cards[0].counters['+1/+1'],1);assert.equal(cards[1].counters['+1/+1']||0,positive?2:0);assert.equal(cards[2].counters['+1/+1'],3);
  }else if(name==='Irencrag Feat'){
    const before=a.pool.R;await cast();assert.ok(a.pool.R>before);const {card,so}=await cast(harmless(),{resolve:false});if(!positive)await g.counterStackObject(so);else await settle(g);const denied=put(M,a,harmless('Denied further spell'),'hand'),mana=total(a);assert.equal(await g.castSpell(a,denied,{from:'hand'}),false);assert.equal(total(a),mana);assert.equal(g.castableList(a).some(row=>row.card===denied),false);await cleanup();fund(a);await cast(denied.def,{card:denied});assert.equal(card.zone,'graveyard');
  }else if(name==="Karn's Touch"){
    const c=donor(a,{types:['Artifact'],subtypes:['Equipment'],cost:'{4}'});await cast(name,{targets:[c]});assert.equal(c.is('Creature'),true);assert.equal(c.power,4);assert.equal(c.toughness,4);assert.equal(c.hasSub('Equipment'),true);await cleanup();assert.equal(c.is('Creature'),false);assert.equal(c.is('Artifact'),true);
  }else if(name==="Mercadia's Downfall"){
    donor(b,{types:['Land'],super:[],subtypes:['Island']});donor(b,{types:['Land'],super:[],subtypes:[]});permanent(M,g,b,M.DEFS.Forest);donor(a,{types:['Land'],super:[],subtypes:[]});const own=attack(donor()),enemy=attack(donor(b),a),unattacked=donor();await cast();assert.equal(own.power,5);assert.equal(enemy.power,4);assert.equal(unattacked.power,3);await cleanup();assert.equal(own.power,3);
  }else if(name==='Moonmist'||name==='Waxing Moon'){
    const printed=Object.values(M.DEFS).find(d=>d.oracleFaces?.layout==='transform'&&d.subtypes?.includes('Human')&&d.subtypes?.includes('Werewolf')&&!d.bomDaybound);assert.ok(printed);const wolf=permanent(M,g,a,printed),enemy=permanent(M,g,b,printed),human=donor(a,{subtypes:['Human']}),normal=donor(b,{subtypes:['Goblin']});const original=wolf.name;await cast(name,{targets:name==='Waxing Moon'?[positive?[wolf]:[]]:[]});assert.equal(wolf.name!==original,name==='Moonmist'||positive);assert.equal(enemy.name!==original,name==='Moonmist');assert.equal(human.hasSub('Human'),true);
    if(name==='Moonmist'){const life=a.life;await g.damageBatch([{src:wolf,target:a,n:2},{src:human,target:a,n:2},{src:normal,target:a,n:2}],{combat:true,deferSBA:true});assert.equal(a.life,life-2);}
    else {assert.equal(wolf.kw('trample'),true);assert.equal(human.kw('trample'),true);assert.equal(normal.kw('trample'),false);}
  }else if(name==='Nightmare Incursion'){
    permanent(M,g,a,M.DEFS.Swamp);permanent(M,g,a,M.DEFS.Swamp);permanent(M,g,a,M.DEFS.Forest);permanent(M,g,b,M.DEFS.Swamp);const selected=b.library.slice(-2),before=b.library.length;cardPicks=[positive?selected:[]];await cast(name,{targets:[b]});assert.equal(b.library.length,before-(positive?2:0));assert.equal(b.exile.length,positive?2:0);
  }else if(name==='Outmaneuver'){
    const first=attack(donor()),second=attack(donor()),blockers=[donor(b),donor(b)];[first,second].forEach((c,i)=>{c.wasBlocked=true;c.blockedBy=[blockers[i]];blockers[i].blocking=c.iid;});g.phase='combat';g.step='blockers';g.combat={attackers:[first,second],declaredAttackTargets:[b,b]};await cast(name,{targets:[[first,second]]});option='no';const life=b.life;await g.combatDamage(a,'normal');await settle(g);assert.equal(b.life,life-6);assert.equal(blockers[0].damage,0);assert.equal(blockers[1].damage,0);
  }else if(name==='Risk Factor'){
    const life=b.life,hand=a.hand.length;await cast(name,{targets:[b]});assert.equal(b.life,life-(positive?4:0));assert.equal(a.hand.length,hand+(positive?0:3));
  }else if(name==='Sanctified Charge'||name==='Swarm Surge'){
    const chosen=donor(a,{colorsOverride:name==='Swarm Surge'?[]:['W']}),other=donor(a,{colorsOverride:['R']}),enemy=donor(b,{colorsOverride:name==='Swarm Surge'?[]:['W']});await cast();assert.equal(chosen.power,5);assert.equal(chosen.kw('first strike'),true);assert.equal(other.power,5);assert.equal(other.kw('first strike'),false);assert.equal(enemy.power,3);await cleanup();assert.equal(chosen.power,3);assert.equal(chosen.kw('first strike'),false);
  }else if(name==='Serene Remembrance'||name==='Turn the Earth'){
    const first=put(M,a,'Forest','graveyard'),second=put(M,name==='Turn the Earth'?b:a,'Island','graveyard'),life=a.life;const {card}=await cast(name,{targets:[positive?[first,second]:[]]});assert.equal(first.zone,positive?'library':'graveyard');assert.equal(second.zone,positive?'library':'graveyard');assert.equal(card.zone,name==='Serene Remembrance'?'library':'graveyard');assert.equal(a.life,life+(name==='Turn the Earth'?2:0));
  }else if(name==='Surrounded by Orcs'){
    let army;if(!positive)army=donor(a,{subtypes:['Zombie','Army'],power:'4',toughness:'4'});const before=b.library.length;await cast(name,{targets:[b]});army ||=g.creatures(a).find(c=>c.hasSub('Army'));assert.ok(army);assert.equal(army.hasSub('Orc'),true);assert.equal(army.power,positive?3:7);assert.equal(b.library.length,before-(positive?3:7));
  }else throw Error('Missing v41 proof '+name);
  assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV41(M,entry,op,role,h){
  if(!names.includes(entry.raw.name)||!['spell-generic','uncopyable-v41','casting-restriction-v8'].includes(op.kind))return null;
  let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));for(const positive of [true,false])await proveSpellV41(M,entry.raw.name,role,positive,h,assert);return count;
}
