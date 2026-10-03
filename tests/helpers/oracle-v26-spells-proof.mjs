import strict from 'node:assert/strict';
import {context,put,settle} from './oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
const sum=p=>Object.values(p.pool).reduce((n,v)=>n+v,0),fund=p=>{for(const c in p.pool)p.pool[c]=40;};
function choose(p,fn){const prior=p.controller.decide.bind(p.controller);p.controller.decide=(g,q)=>fn(g,q)??prior(g,q);}
function body(M,f,p,extra={}){const c=put(M,f.game,p,'Grizzly Bears',extra.zone||'battlefield');c.def={...c.def,cost:'{2}{G}',power:'4',toughness:'30',kws:[],...extra};f.game.recalc();return c;}
const colors={'Dawnglow Infusion':['G','W'],'Cankerous Thirst':['B','G'],'Moonhold':['R','W'],'Repel Intruders':['W','U'],'Invert the Skies':['G','U'],'Boros Fury-Shield':['W','R'],'Induce Paranoia':['U','B']};
const cohorts=new Set(['Steer Clear','Faerie Fencing','Lethal Exploit','Flame Discharge']),paidLKI=new Set(['Corpse Lunge','Corpse Explosion','Draconic Intervention',"Nahiri's Wrath",'Splitting the Powerstone']);
export async function proveSpellV26(M,row,role,positive,h,assert=strict){
 const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role);if(h){h.fillLibrary(M,f.a,35);h.fillLibrary(M,f.b,35);}const {game,a,b}=f;fund(a);fund(b);
 const name=row.name,source=put(M,game,a,name,'hand'),enemy=body(M,f,b),own=body(M,f,a),grave=body(M,f,a,{zone:'graveyard',cost:positive?'{4}{G}':'{G}',power:positive?'6':'2'});let target=enemy,other,stackEnemy;
 if(colors[name]){for(const c in a.pool)a.pool[c]=0;const [first,second]=colors[name];a.pool[first]=positive?2:40;a.pool[second]=positive?40:0;}
 if(cohorts.has(name)){own.def={...own.def,subtypes:positive?['Faerie','Mount']:['Bear']};if(positive)own.counters['+1/+1']=1;}
 if(['Steer Clear','Boros Fury-Shield'].includes(name)){enemy.attacking=a;}
 if(name==='Splitting the Powerstone'){own.def={...own.def,types:['Artifact'],subtypes:[],super:positive?['Legendary']:[]};}
 if(name==='Draconic Intervention'){grave.def={...grave.def,types:['Sorcery'],subtypes:[]};own.def={...own.def,subtypes:['Dragon']};}
 if(name==="Nahiri's Wrath"){other=body(M,f,a,{zone:'hand',cost:positive?'{3}{G}':'{G}'});grave.zone='hand';a.graveyard.splice(a.graveyard.indexOf(grave),1);a.hand.push(grave);}
 if(name==='Astarion\'s Thirst'){own.commander=true;if(!positive)own.def={...own.def,types:['Artifact'],subtypes:[]};}
 if(name==='Energy Tap'||name==='Fateful Handoff')target=own;
 if(name==='Energy Tap')own.def={...own.def,cost:positive?'{4}{G}':'{G}'};
 if(name==='Joint Assault'&&positive){other=body(M,f,a);own.meta.oracleSoulbond={iid:other.iid,version:other.zoneVersion,selfVersion:own.zoneVersion,controller:a.idx,phaseEpoch:0,selfPhaseEpoch:0};other.meta.oracleSoulbond={iid:own.iid,version:own.zoneVersion,selfVersion:other.zoneVersion,controller:a.idx,phaseEpoch:0,selfPhaseEpoch:0};target=own;}
 if(name==='Joint Assault'&&!positive)target=own;
 if(name==='Fateful Handoff'){own.def={...own.def,cost:positive?'{4}{G}':'{G}'};}
 if(name==='Redcap Melee'){enemy.def={...enemy.def,cost:positive?'{G}':'{R}'};other=put(M,game,a,'Forest');}
 if(name==='Baki\'s Curse'||name==='Aura Barbs'){if(positive){other=put(M,game,b,'Pacifism');await game.attach(other,enemy);if(name==='Baki\'s Curse'){const second=put(M,game,a,'Pacifism');await game.attach(second,enemy);}}}
 if(name==='Invert the Skies')enemy.def={...enemy.def,kws:['flying']};
 if(name==='Banefire'||name==='Demonfire'||name==='Arrow Storm'||name==='Lightning Surge')game.untilEffects.push({kind:'preventToCreature',expires:'eot',iid:enemy.iid,zoneVersion:enemy.zoneVersion});
 if(name==='Demonfire'&&!positive)put(M,game,a,'Forest','hand');
 if(name==='Arrow Storm')a.turnState.attacked=positive;
 if(name==='Lightning Surge'||name==='Exquisite Firecraft'){for(let i=a.graveyard.length;i<(positive?(name==='Lightning Surge'?7:2):1);i++)body(M,f,a,{zone:'graveyard',types:['Instant'],subtypes:[]});if(name==='Exquisite Firecraft')grave.def={...grave.def,types:positive?['Sorcery']:['Creature']};}
 if(name==='Flames of the Blood Hand'||name==='Bonfire of the Damned'||name==='Moonhold')target=b;
 if(name==='Silver Scrutiny')game.turnPlayer=positive?b:a;
 if(name==='Cankerous Thirst')other=own;
 if(name==='Fear, Fire, Foes!'||name==='Bonfire of the Damned')other=body(M,f,b);
 if(name==='Repel Intruders'||name==='Induce Paranoia'){const bolt=put(M,game,b,'Lightning Bolt','hand');choose(b,(g,q)=>q.type==='chooseTargets'?[a]:undefined);assert.equal(await game.castSpell(b,bolt,{from:'hand'}),true);stackEnemy=game.stack.find(so=>so.card===bolt);if(name==='Repel Intruders'){stackEnemy.card.def={...stackEnemy.card.def,types:['Creature'],power:'2',toughness:'3'};stackEnemy.oracleDefinition={...stackEnemy.oracleDefinition,types:['Creature']};}target=stackEnemy;}
 game.recalc();const initial={aLife:a.life,bLife:b.life,hand:a.hand.length,ownP:own.power,enemyP:enemy.power,enemyT:enemy.toughness,ownT:own.toughness,gravePower:grave.power,graveMV:grave.mv,library:b.library.length,cMana:a.pool.C};
 choose(a,(g,q)=>q.type==='chooseTargets'?(q.candidates.includes(target)?[target]:q.candidates.includes(own)?[own]:undefined):q.type==='chooseCards'?(q.from?.includes(grave)&&paidLKI.has(name)?(name==="Nahiri's Wrath"?[grave,other]:[grave]):q.from?.includes(own)&&name==='Splitting the Powerstone'?[own]:q.from?.includes(own)&&name==='Astarion\'s Thirst'?[own]:q.from?.includes(other)&&name==='Redcap Melee'?[other]:q.prompt?.includes('exile a card from your graveyard?')?(positive?[grave]:[]):undefined):q.type==='chooseOption'&&q.aiHint?.kind==='kicker'?(positive?'yes':'no'):q.type==='chooseOption'&&q.aiHint?.kind==='optionalEffect'?(positive?'yes':'no'):undefined);
 if(name==='Cankerous Thirst'){let slot=0;choose(a,(g,q)=>q.type==='chooseTargets'?[slot++?own:enemy]:undefined);}
 const x=name==='Banefire'?(positive?5:4):2,mana=sum(a);assert.equal(await game.castSpell(a,source,{from:'hand',xVal:x}),true);const so=game.stack.find(s=>s.card===source);assert.ok(so);assert.ok(mana>sum(a));const cost=M.parseCost(source.def.cost),kick=positive&&['Heroic Charge',"Orim's Touch","Jet's Brainwashing"].includes(name)?M.parseCost(name==='Heroic Charge'?'{1}{R}':name==="Orim's Touch"?'{1}':'{3}'):null;assert.equal(mana-sum(a),cost.generic+cost.pips.length+(cost.x||0)*x+(kick?kick.generic+kick.pips.length:0));
 if(['Exquisite Firecraft','Demonfire','Banefire'].includes(name))assert.equal(M.isUncounterable(game,so),positive);
 await settle(game);
 if(name==='Dawnglow Infusion')assert.equal(a.life,initial.aLife+x*(positive?2:1));
 if(name==='Moonhold'){assert.equal(game.landPlayLimit(b),0);game.turnPlayer=b;const bodyCard=put(M,game,b,'Grizzly Bears','hand');assert.equal(await game.castSpell(b,bodyCard,{from:'hand'}),!positive);await settle(game);}
 if(name==='Invert the Skies'){assert.equal(enemy.kw('flying'),false);assert.equal(own.kw('flying'),positive);}
 if(name==='Cankerous Thirst'){assert.equal(enemy.power,initial.enemyP-(positive?3:0));assert.equal(own.power,initial.ownP+(positive?3:0));}
 if(name==='Repel Intruders'){assert.equal(game.bf().filter(c=>c.isToken&&c.hasSub('Kithkin')).length,2);assert.equal(stackEnemy.card.zone,positive?'graveyard':'battlefield');}
 if(name==='Induce Paranoia'){assert.equal(stackEnemy.card.zone,'graveyard');assert.equal(b.library.length,initial.library-(positive?1:0));}
 if(name==='Boros Fury-Shield'){assert.equal(b.life,initial.bLife-(positive?4:0));const life=a.life;await game.damagePlayer(enemy,a,3,{combat:true});assert.equal(a.life,life);}
 if(name==='Faerie Fencing'){assert.equal(enemy.power,initial.enemyP-x-(positive?3:0));assert.equal(enemy.toughness,initial.enemyT-x-(positive?3:0));}
 if(name==='Lethal Exploit'){assert.equal(enemy.power,initial.enemyP-2-(positive?1:0));assert.equal(enemy.toughness,initial.enemyT-2-(positive?1:0));}
 if(name==='Flame Discharge')assert.equal(enemy.damage,x+(positive?2:0));
 if(name==='Steer Clear')assert.equal(enemy.damage,positive?4:2);
 if(name==='Corpse Lunge'||name==='Corpse Explosion'){assert.equal(grave.zone,'exile');assert.equal(enemy.damage,initial.gravePower);if(name==='Corpse Explosion')assert.equal(own.damage,initial.gravePower);}
 if(name==='Draconic Intervention'){assert.equal(grave.zone,'exile');assert.equal(source.zone,'exile');assert.equal(enemy.damage,initial.graveMV);assert.equal(own.damage,0);await game.destroy(enemy);assert.equal(enemy.zone,'exile');}
 if(name==="Nahiri's Wrath"){assert.equal(grave.zone,'graveyard');assert.equal(other.zone,'graveyard');assert.equal(enemy.damage,initial.graveMV+other.mv);}
 if(name==='Splitting the Powerstone'){assert.equal(own.zone,'graveyard');assert.equal(game.bf().filter(c=>c.hasSub('Powerstone')&&c.tapped).length,2);assert.equal(a.hand.length,initial.hand-1+(positive?1:0));}
 if(name==='Energy Tap'){assert.equal(own.tapped,true);assert.equal(a.pool.C,initial.cMana+own.mv);}
 if(name==="Astarion's Thirst"){assert.equal(enemy.zone,'exile');assert.equal(own.counters['+1/+1']||0,positive?4:0);}
 if(name==='Fateful Handoff'){assert.equal(a.hand.length,initial.hand-1+own.mv);assert.equal(own.ctrl,b);}
 if(name==='Joint Assault'){assert.equal(own.power,initial.ownP+2);if(other)assert.equal(other.power,6);}
 if(name==='Bonfire of the Damned'){assert.equal(b.life,initial.bLife-x);assert.equal(enemy.damage,x);assert.equal(other.damage,x);assert.equal(own.damage,0);}
 if(name==='Fear, Fire, Foes!'){assert.equal(enemy.damage,x);assert.equal(other.damage,1);assert.equal(own.damage,0);}
 if(name==="Baki's Curse"){assert.equal(enemy.damage,positive?4:0);assert.equal(own.damage,0);}
 if(name==='Aura Barbs'){assert.equal(b.life,initial.bLife-(positive?2:0));assert.equal(enemy.damage,positive?2:0);}
 if(name==='Redcap Melee'){assert.equal(enemy.damage,4);assert.equal(other.zone,positive?'graveyard':'battlefield');}
 if(name==='Heated Argument'){assert.equal(enemy.damage,6);assert.equal(b.life,initial.bLife-(positive?2:0));assert.equal(grave.zone,positive?'exile':'graveyard');}
 if(name==='Banefire')assert.equal(enemy.damage,positive?5:0);
 if(name==='Demonfire')assert.equal(enemy.damage,positive?2:0);
 if(name==='Arrow Storm')assert.equal(enemy.damage,positive?5:0);
 if(name==='Lightning Surge')assert.equal(enemy.damage,positive?6:0);
 if(name==='Exquisite Firecraft')assert.equal(enemy.damage,4);
 if(name==='Silver Scrutiny')assert.equal(a.hand.length,initial.hand-1+x);
 if(name==='Flames of the Blood Hand'){assert.equal(b.life,initial.bLife-4);await game.gainLife(b,5,own);assert.equal(b.life,initial.bLife-4);await game.gainLife(a,5,own);assert.equal(a.life,initial.aLife+5);}
 if(name==='Heroic Charge'){assert.equal(own.power,initial.ownP+2);assert.equal(own.toughness,initial.ownT+1);assert.equal(own.kw('trample'),positive);}
 if(name==="Orim's Touch"){await game.damageAny(enemy,target,6);assert.equal(target.damage,positive?2:4);}
 if(name==="Jet's Brainwashing"){assert.equal(enemy.ctrl,positive?a:b);assert.equal(enemy.kw('haste'),positive);assert.equal(game.bf().filter(c=>c.hasSub('Clue')).length,1);}
 assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return {f,source,enemy,own,grave,so};
}
export const edgeCasesV26={
 'Corpse Lunge':['copy-payment'],'Corpse Explosion':['copy-payment'],'Draconic Intervention':['copy-payment'],"Nahiri's Wrath":['copy-payment'],'Splitting the Powerstone':['copy-payment'],
 'Faerie Fencing':['cohort-gone','cohort-late'],'Lethal Exploit':['cohort-gone','cohort-late'],'Steer Clear':['cohort-gone','cohort-late'],'Flame Discharge':['cohort-gone','cohort-late'],
 'Banefire':['counter-prohibited','counter-allowed'],'Exquisite Firecraft':['counter-prohibited','counter-allowed'],'Silver Scrutiny':['flash-large-rejected'],'Bonfire of the Damned':['miracle-cast'],'Lightning Surge':['flashback-cast'],
 'Heated Argument':['target-stale'],'Redcap Melee':['damage-prevented'],'Fateful Handoff':['target-stale'],"Astarion's Thirst":['target-stale'],
 'Energy Tap':['tap-changed'],"Joint Assault":['pair-left'],"Jet's Brainwashing":['copy-kicker'],"Orim's Touch":['copy-kicker'],
};
export async function proveSpellEdgeV26(M,name,role,scenario,h,assert=strict){
 const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role);if(h){h.fillLibrary(M,f.a,35);h.fillLibrary(M,f.b,35);}const {game,a,b}=f;fund(a);fund(b);const source=put(M,game,a,name,'hand'),enemy=body(M,f,b),own=body(M,f,a),grave=body(M,f,a,{zone:'graveyard',power:'6',cost:'{4}{G}'});let target=enemy,other;
 if(name==='Draconic Intervention'){grave.def={...grave.def,types:['Instant'],subtypes:[]};own.def={...own.def,subtypes:['Dragon']};}
 if(name==='Splitting the Powerstone')own.def={...own.def,types:['Artifact'],subtypes:[],super:['Legendary']};
 if(name==="Nahiri's Wrath"){other=body(M,f,a,{zone:'hand',cost:'{2}{G}'});grave.zone='hand';a.graveyard.splice(a.graveyard.indexOf(grave),1);a.hand.push(grave);}
 if(cohorts.has(name)){own.def={...own.def,subtypes:scenario==='cohort-gone'?['Mount','Faerie']:['Bear']};if(scenario==='cohort-gone')own.counters['+1/+1']=1;}
 if(name==='Steer Clear')enemy.attacking=a;
 if(name==='Bonfire of the Damned')target=b;
 if(name==='Fateful Handoff'||name==='Energy Tap')target=own;
 if(name==="Astarion's Thirst")own.commander=true;
 if(name==='Joint Assault'){target=own;other=body(M,f,a);own.meta.oracleSoulbond={iid:other.iid,version:other.zoneVersion,selfVersion:own.zoneVersion,controller:a.idx,phaseEpoch:0,selfPhaseEpoch:0};other.meta.oracleSoulbond={iid:own.iid,version:own.zoneVersion,selfVersion:other.zoneVersion,controller:a.idx,phaseEpoch:0,selfPhaseEpoch:0};}
 if(name==='Exquisite Firecraft'&&scenario==='counter-prohibited'){for(const c of [grave,body(M,f,a,{zone:'graveyard'})])c.def={...c.def,types:['Instant'],subtypes:[]};}
 if(scenario==='flash-large-rejected'){game.turnPlayer=b;const before=sum(a);assert.equal(await game.castSpell(a,source,{from:'hand',xVal:4}),false);assert.equal(sum(a),before);assert.equal(source.zone,'hand');assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return;}
 choose(a,(g,q)=>q.type==='chooseTargets'?[target]:q.type==='chooseX'?2:q.type==='chooseCards'?(name==="Nahiri's Wrath"&&q.from.includes(grave)?[grave,other]:q.from.includes(grave)&&paidLKI.has(name)?[grave]:q.from.includes(own)&&name==='Splitting the Powerstone'?[own]:q.from.includes(own)&&name==="Astarion's Thirst"?[own]:[]):q.type==='chooseOption'&&q.aiHint?.kind==='kicker'?'yes':undefined);
 if(scenario==='miracle-cast'){const mana=sum(a),life=b.life;await game.move(source,'library');a.turnState.drewThisTurn=0;game.turnPlayer=b;await game.draw(a,1);assert.ok(game.miracleRevealedCards(a).includes(source));await game.flushTriggers();const tr=game.stack.find(so=>so.kind==='trigger'&&so.srcCard===source);assert.ok(tr);await game.resolveTop();const spell=game.stack.find(so=>so.card===source);assert.ok(spell);assert.equal(spell.castOpts.miracle,true);assert.equal(spell.x,2);assert.equal(mana-sum(a),3);await settle(game);assert.equal(b.life,life-2);assert.equal(enemy.damage,2);assert.equal(source.zone,'graveyard');assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return;}
 if(scenario==='flashback-cast'){await game.move(source,'graveyard');for(let i=0;i<6;i++)body(M,f,a,{zone:'graveyard'});const offer=game.castableList(a).find(row=>row.card===source&&row.alt?.flashback);assert.ok(offer);const mana=sum(a);assert.equal(await game.castSpell(a,source,{from:'graveyard',alt:offer.alt}),true);assert.equal(mana-sum(a),7);assert.equal(game.stack.find(so=>so.card===source).castOpts.flashback,true);await settle(game);assert.equal(source.zone,'exile');assert.equal(enemy.damage,6);assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return;}
 game.recalc();const hand=a.hand.length,x=scenario==='counter-prohibited'?5:scenario==='counter-allowed'?4:2,mana=sum(a),basePower=enemy.power;
 assert.equal(await game.castSpell(a,source,{from:'hand',xVal:x}),true);assert.ok(sum(a)<mana);const so=game.stack.find(s=>s.card===source);assert.ok(so);
 if(scenario.startsWith('counter-')){assert.equal(await game.counterStackObject(so),scenario==='counter-allowed');assert.equal(game.stack.includes(so),scenario==='counter-prohibited');await settle(game);assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return;}
 if(scenario==='cohort-gone')await game.move(own,'hand');
 if(scenario==='cohort-late'){own.def={...own.def,subtypes:['Faerie','Mount']};own.counters['+1/+1']=1;game.recalc();}
 if(scenario==='target-stale'){await game.move(target,'hand');await game.putPermanentOntoBattlefield(target,target.owner);}
 if(scenario==='tap-changed')game.tap(own);
 if(scenario==='pair-left'){await game.move(other,'hand');await game.putPermanentOntoBattlefield(other,a);}
 if(scenario==='damage-prevented')put(M,game,a,'Forest');
 if(scenario==='damage-prevented')game.untilEffects.push({kind:'preventToCreature',expires:'eot',iid:enemy.iid,zoneVersion:enemy.zoneVersion});
 if(scenario==='copy-payment'){const saved=so.oraclePaymentValuesV26.map(row=>({...row}));grave.def={...grave.def,power:'1',cost:'{G}'};if(other)other.def={...other.def,cost:'{G}'};const clone=await game.copySpell(so,a,{mayNewTargets:false});assert.deepEqual(Array.from(clone.oraclePaymentValuesV26,row=>({...row})),Array.from(saved,row=>({...row})));assert.equal(clone.isCopy,true);await settle(game);if(name==='Corpse Lunge'||name==='Corpse Explosion')assert.equal(enemy.damage,12);if(name==='Draconic Intervention')assert.equal(enemy.damage,10);if(name==="Nahiri's Wrath")assert.equal(enemy.damage,16);if(name==='Splitting the Powerstone'){assert.equal(game.bf().filter(c=>c.hasSub('Powerstone')).length,4);assert.equal(a.hand.length,hand-1+2);}assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return;}
 if(scenario==='copy-kicker'){source.castMeta.kicked=false;const clone=await game.copySpell(so,a,{mayNewTargets:false});assert.equal(clone.kicked,true);await settle(game);if(name==="Jet's Brainwashing"){assert.equal(enemy.ctrl,a);assert.equal(game.bf().filter(c=>c.hasSub('Clue')).length,2);}else{await game.damageAny(own,enemy,10);assert.equal(enemy.damage,2);}assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return;}
 const poolC=a.pool.C;await settle(game);
 if(scenario.startsWith('cohort-')){const yes=scenario==='cohort-gone';if(name==='Faerie Fencing')assert.equal(enemy.power,basePower-2-(yes?3:0));if(name==='Lethal Exploit')assert.equal(enemy.power,basePower-2-(yes?1:0));if(name==='Steer Clear')assert.equal(enemy.damage,yes?4:2);if(name==='Flame Discharge')assert.equal(enemy.damage,yes?4:2);}
 if(scenario==='target-stale'){assert.equal(target.zone,'battlefield');assert.equal(target.damage,0);if(name==='Fateful Handoff')assert.equal(own.ctrl,a);if(name==="Astarion's Thirst")assert.equal(own.counters['+1/+1']||0,0);if(name==='Heated Argument')assert.equal(grave.zone,'graveyard');}
 if(scenario==='damage-prevented'){assert.equal(enemy.damage,0);assert.equal(game.lands(a).length,1);}
 if(scenario==='tap-changed')assert.equal(a.pool.C,poolC);
 if(scenario==='pair-left'){assert.equal(own.power,6);assert.equal(other.power,4);}
 assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);
}
const names=new Set(["Astarion's Thirst",'Joint Assault','Energy Tap','Bonfire of the Damned','Corpse Lunge','Splitting the Powerstone','Aura Barbs','Redcap Melee','Fateful Handoff','Boros Fury-Shield','Silver Scrutiny','Steer Clear','Demonfire','Heated Argument',"Baki's Curse",'Fear, Fire, Foes!',"Nahiri's Wrath",'Faerie Fencing','Dawnglow Infusion','Flames of the Blood Hand','Banefire','Lethal Exploit','Cankerous Thirst','Repel Intruders','Moonhold','Draconic Intervention','Arrow Storm','Corpse Explosion','Lightning Surge','Exquisite Firecraft','Invert the Skies','Induce Paranoia','Flame Discharge','Heroic Charge',"Orim's Touch","Jet's Brainwashing"]);
export async function operationProofV26(M,entry,op,role,h){
 if(!names.has(entry.raw.name))return null;let checks=0;const assert={equal:(...args)=>{checks++;strict.equal(...args);},ok:(...args)=>{checks++;strict.ok(...args);},deepEqual:(...args)=>{checks++;strict.deepEqual(...args);}};for(const positive of [false,true])await proveSpellV26(M,{name:entry.raw.name},role,positive,h,assert);for(const scenario of edgeCasesV26[entry.raw.name]||[])await proveSpellEdgeV26(M,entry.raw.name,role,scenario,h,assert);return checks;
}
