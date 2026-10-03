import strict from 'node:assert/strict';
import {context,put,settle} from './oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
const fund=p=>{for(const c in p.pool)p.pool[c]=30;},sum=p=>Object.values(p.pool).reduce((a,b)=>a+b,0);
function choose(p,fn){const prior=p.controller.decide.bind(p.controller);p.controller.decide=(g,q)=>fn(g,q)??prior(g,q);}
function body(M,f,p,extra={}){const c=put(M,f.game,p,'Grizzly Bears',extra.zone||'battlefield');c.def={...c.def,cost:'{2}{G}',power:'4',toughness:'30',kws:[],...extra};f.game.recalc();return c;}
const makeBody=body;
function makeContext(M,role,h,opponents=1){if(!h)return context(M,role,opponents);const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'});f.others=[f.b];if(opponents===2)f.others.push(f.game.addPlayer('Oracle C',{name:'Oracle C'},h.decision(),true));for(const p of f.game.players)h.fillLibrary(M,p,30);return f;}
const expanded=new Set(['Fatal Grudge','Hellish Sideswipe','Foundry Helix','Endemic Plague','Rescue from the Underworld','Flash Conscription','Vigorous Charge','Maddening Cacophony','Sadistic Sacrament','Full Bore','Snarl Song','Moment of Glory','Retrieve the Esper',"The Last Ronin's Technique",'Goblin Barrage','Chocobo Kick']);
const more=new Set(['Expel the Unworthy',"Galadriel's Dismissal",'The Eagles Are Coming!','Soulblast',"Cauldron's Gift",'Mythos of Nethroi','Outmuscle','Sundering Stroke','Once and Future',"River's Grasp",'Mega Flare',"Aang's Journey"]);
export const wholeSourcesV27=new Set(['Liquid Fire','Eldritch Evolution','Neoform','Anchor to Reality',...expanded,...more]);
export async function proveSpellV27(M,name,role,positive,h,assert=strict){
 if(expanded.has(name))return proveExpandedV27(M,name,role,positive,h,assert);if(more.has(name))return proveMoreV27(M,name,role,positive,h,assert);
 const f=makeContext(M,role,h),{game,a,b}=f;fund(a);const source=put(M,game,a,name,'hand'),enemy=body(M,f,b),own=body(M,f,a);let scried=0;
 if(name==='Liquid Fire'){const n=positive?2:0,life=b.life,mana=sum(a);choose(a,(g,q)=>q.type==='chooseX'?n:q.type==='chooseTargets'?[enemy]:undefined);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);assert.equal(mana-sum(a),6);const so=game.stack.find(s=>s.card===source);assert.equal(so.oracleChosenNumberV27,n);if(positive){const clone=await game.copySpell(so,a,{mayNewTargets:false});assert.equal(clone.oracleChosenNumberV27,n);}await settle(game);assert.equal(enemy.damage,n*(positive?2:1));assert.equal(b.life,life-(5-n)*(positive?2:1));}
 else{const candidate=body(M,f,a,{zone:'library',cost:name==='Neoform'?(positive?'{3}{G}':'{4}{G}'):name==='Anchor to Reality'?'{1}':positive?'{4}{G}':'{5}{G}'});if(name==='Anchor to Reality'){own.def={...own.def,types:['Artifact'],subtypes:[]};candidate.def={...candidate.def,types:['Artifact'],subtypes:positive?['Equipment']:['Clue']};}game.recalc();choose(a,(g,q)=>q.type==='scry'?(scried+=q.cards.length,{top:q.cards,bottom:[]}):q.type==='chooseCards'?(q.from.includes(own)?[own]:q.from.includes(candidate)?[candidate]:[]):undefined);const mana=sum(a);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);assert.equal(mana-sum(a),name==='Neoform'?2:name==='Anchor to Reality'?4:3);assert.equal(own.zone,'graveyard');await settle(game);assert.equal(candidate.zone,positive?'battlefield':'library');if(name==='Neoform'&&positive)assert.equal(candidate.counters['+1/+1'],1);if(name==='Anchor to Reality')assert.equal(scried,positive?2:0);if(name==='Eldritch Evolution')assert.equal(source.zone,'exile');}
 assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return f;
}
export const edgeCasesV27={'Liquid Fire':['invalid-number','maximum-number','copy-of-copy','target-stale','controller-changed'],'Foundry Helix':['paid-copy'],'Soulblast':['paid-copy','empty-cohort'],'Neoform':['paid-search-copy'],'Eldritch Evolution':['paid-search-copy'],'Vigorous Charge':['controller-changed'],'Goblin Barrage':['kicker-unavailable'],'Fatal Grudge':['opponents-simultaneous']};
export async function proveSpellEdgeV27(M,name,role,scenario,h,assert=strict){
 const f=makeContext(M,role,h),{game,a,b}=f;fund(a);const source=put(M,game,a,name,'hand'),enemy=body(M,f,b),own=body(M,f,a),life=a.life,enemyLife=b.life;
 if(scenario==='empty-cohort'){await game.move(own,'graveyard');choose(a,(g,q)=>q.type==='chooseTargets'?[enemy]:undefined);assert.equal(game.creatures(a).length,0);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);assert.equal(enemy.damage,0);assert.equal(source.zone,'graveyard');assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return;}
 if(scenario==='kicker-unavailable'){choose(a,(g,q)=>q.type==='chooseTargets'?[enemy]:undefined);assert.equal(M.OracleV8KeywordPayments.canPay(game,a,source,'kicker'),false);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);assert.equal(game.stack.find(so=>so.card===source).kicked,false);await settle(game);assert.equal(enemy.damage,4);assert.equal(own.zone,'battlefield');assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return;}
 if(scenario==='opponents-simultaneous'){const c=game.addPlayer('Third',{name:'Third'},h?h.decision():b.controller,false),other=body(M,f,c);if(h)h.fillLibrary(M,c,30);choose(a,(g,q)=>q.type==='chooseCards'?[own]:undefined);choose(b,(g,q)=>q.type==='chooseCards'?[enemy]:undefined);choose(c,(g,q)=>q.type==='chooseCards'?(assert.equal(enemy.zone,'battlefield'),[other]):undefined);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);assert.equal(enemy.zone,'graveyard');assert.equal(other.zone,'graveyard');assert.equal(own.zone,'graveyard');assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return;}
 if(name==='Foundry Helix')own.def={...own.def,types:['Artifact'],subtypes:[]};
 const searches=['Neoform','Eldritch Evolution'].includes(name),candidate=searches?body(M,f,a,{zone:'library',cost:'{3}{G}'}):null,second=searches?body(M,f,a,{zone:'library',cost:'{3}{G}'}):null;game.recalc();
 choose(a,(g,q)=>q.type==='chooseTargets'?[name==='Vigorous Charge'?own:enemy]:q.type==='chooseX'?(scenario==='invalid-number'?6:scenario==='maximum-number'?5:2):q.type==='chooseOption'&&q.aiHint?.kind==='kicker'?'yes':q.type==='chooseCards'?(q.from.includes(own)?[own]:q.from.includes(candidate)?[candidate]:q.from.includes(second)?[second]:[]):undefined);
 const mana=sum(a);if(scenario==='invalid-number'){assert.equal(await game.castSpell(a,source,{from:'hand'}),false);assert.equal(source.zone,'hand');assert.equal(sum(a),mana);assert.equal(enemy.damage,0);assert.equal(b.life,enemyLife);assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return;}
 assert.equal(await game.castSpell(a,source,{from:'hand'}),true);const so=game.stack.find(s=>s.card===source);
 if(scenario==='maximum-number'){assert.equal(so.oracleChosenNumberV27,5);await settle(game);assert.equal(enemy.damage,5);assert.equal(b.life,enemyLife);}
 if(scenario==='copy-of-copy'){so.oracleChosenNumberV27=5;const clone=await game.copySpell(so,a,{mayNewTargets:false});assert.equal(clone.oracleChosenNumberV27,2);so.oracleChosenNumberV27=2;clone.oracleChosenNumberV27=5;const twice=await game.copySpell(clone,a,{mayNewTargets:false});assert.equal(twice.oracleChosenNumberV27,2);clone.oracleChosenNumberV27=2;await settle(game);assert.equal(enemy.damage,6);assert.equal(b.life,enemyLife-9);}
 if(scenario==='target-stale'){await game.move(enemy,'hand');await game.putPermanentOntoBattlefield(enemy,b);await settle(game);assert.equal(enemy.damage,0);assert.equal(b.life,enemyLife);}
 if(scenario==='controller-changed'){M.OracleV8Control.gain(game,name==='Liquid Fire'?enemy:own,name==='Liquid Fire'?a:b);await settle(game);if(name==='Liquid Fire'){assert.equal(enemy.damage,2);assert.equal(a.life,life-3);assert.equal(b.life,enemyLife);}else{await game.damagePlayer(own,a,3,{combat:true});await settle(game);assert.equal(a.life,life);assert.equal(b.life,enemyLife);}}
 if(scenario==='paid-copy'){own.def={...own.def,types:['Creature'],subtypes:['Bear'],power:'1'};const clone=await game.copySpell(so,a,{mayNewTargets:false});assert.ok(clone.oraclePaymentSnapshotsV27?.length);await settle(game);if(name==='Foundry Helix'){assert.equal(enemy.damage,8);assert.equal(a.life,life+8);}else assert.equal(enemy.damage,8);}
 if(scenario==='paid-search-copy'){own.def={...own.def,cost:'{9}{G}'};const clone=await game.copySpell(so,a,{mayNewTargets:false});assert.equal(clone.oraclePaymentValuesV26[0].mv,3);await settle(game);assert.equal(candidate.zone,'battlefield');assert.equal(second.zone,'battlefield');if(name==='Neoform'){assert.equal(candidate.counters['+1/+1'],1);assert.equal(second.counters['+1/+1'],1);}}
 assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);
}
export async function operationProofV27(M,entry,op,role,h){if(!wholeSourcesV27.has(entry.raw.name))return null;let checks=0;const assert={equal:(...args)=>{checks++;strict.equal(...args);},ok:(...args)=>{checks++;strict.ok(...args);},deepEqual:(...args)=>{checks++;strict.deepEqual(...args);}};for(const positive of [false,true])await proveSpellV27(M,entry.raw.name,role,positive,h,assert);for(const scenario of edgeCasesV27[entry.raw.name]||[])await proveSpellEdgeV27(M,entry.raw.name,role,scenario,h,assert);return checks;}

export async function proveExpandedV27(M,name,role,positive,h,assert=strict){
 const body=(f,p,extra={})=>makeBody(M,f,p,extra);
 const f=makeContext(M,role,h),{game,a,b}=f;fund(a);fund(b);const gravecast=positive&&['Moment of Glory','Retrieve the Esper'].includes(name),source=put(M,game,a,name,gravecast?'graveyard':'hand'),own=body(f,a),enemy=body(f,b),other=body(f,b),grave=body(f,a,{zone:'graveyard'});let target=enemy,attacker;
 if(name==='Fatal Grudge'){own.def={...own.def,types:[positive?'Artifact':'Creature'],subtypes:[]};enemy.def={...enemy.def,types:['Artifact'],subtypes:[]};}
 if(name==='Hellish Sideswipe')own.def={...own.def,types:['Artifact'],subtypes:positive?['Vehicle']:['Clue']};
 if(name==='Foundry Helix')own.def={...own.def,types:[positive?'Artifact':'Creature'],subtypes:[]};
 if(name==='Endemic Plague'){own.def={...own.def,subtypes:positive?['Elf']:['Goblin']};enemy.def={...enemy.def,subtypes:['Elf']};other.def={...other.def,subtypes:['Bear']};}
 if(name==='Rescue from the Underworld')target=grave;
 if(name==='Flash Conscription'){for(const c in a.pool)a.pool[c]=0;a.pool.R=positive?5:6;a.pool.W=positive?1:0;enemy.tapped=true;}
 if(name==='Snarl Song'){for(const c in a.pool)a.pool[c]=0;a.pool.G=positive?1:6;a.pool.R=positive?4:0;a.pool.U=positive?1:0;}
 if(name==='Full Bore'){target=own;own.castMeta={alt:{warp:positive},from:'hand'};}
 if(name==='Moment of Glory'||name==='Vigorous Charge'||name==='Chocobo Kick')target=own;
 if(name==='Moment of Glory')body(f,a);
 if(name==='Sadistic Sacrament')target=b;
 if(name==='Goblin Barrage')own.def={...own.def,types:['Artifact'],subtypes:[]};if(name==='Chocobo Kick')attacker=put(M,game,a,'Forest');
 if(name==="The Last Ronin's Technique"&&positive){attacker=own;own.attacking=b;own.wasBlocked=false;own.blockedBy=[];own.tapped=true;game.phase='combat';game.step='blockers';game.combat={attackers:[own],defenders:new Map()};}
 game.recalc();const initial={aLife:a.life,bLife:b.life,hand:a.hand.length,library:b.library.length,mana:sum(a),ownP:own.power,ownT:own.toughness};let targetSlot=0;
 choose(a,(g,q)=>q.type==='chooseTargets'?(name==='Goblin Barrage'?[targetSlot++?b:enemy]:name==='Chocobo Kick'?[targetSlot++?enemy:own]:q.candidates.includes(target)?[target]:undefined):q.type==='chooseCards'?(q.from.includes(own)&&['Fatal Grudge','Hellish Sideswipe','Foundry Helix','Endemic Plague','Rescue from the Underworld','Goblin Barrage',"The Last Ronin's Technique"].includes(name)?[own]:name==='Chocobo Kick'&&q.from.includes(attacker)?[attacker]:name==='Sadistic Sacrament'?q.from.slice(0,positive?15:3):undefined):q.type==='chooseOption'&&q.aiHint?.kind==='kicker'?(positive?'yes':'no'):undefined);
 choose(b,(g,q)=>q.type==='chooseCards'&&name==='Fatal Grudge'?(q.from.includes(enemy)?[enemy]:q.from.includes(other)?[other]:undefined):undefined);
 let opts={from:gravecast?'graveyard':'hand'};if(gravecast){const offer=game.castableList(a).find(row=>row.card===source&&row.alt?.flashback);assert.ok(offer);opts={...opts,alt:offer.alt};}if(name==="The Last Ronin's Technique"&&positive)opts={...opts,alt:source.def.altCosts.find(row=>row.oracleSneakCost)};
 assert.equal(await game.castSpell(a,source,opts),true);const so=game.stack.find(s=>s.card===source);assert.ok(so);assert.ok(initial.mana>sum(a));await settle(game);
 if(['Fatal Grudge','Hellish Sideswipe','Foundry Helix','Endemic Plague','Rescue from the Underworld'].includes(name))assert.equal(own.zone,'graveyard');
 if(name==='Fatal Grudge'){assert.equal((positive?enemy:other).zone,'graveyard');assert.equal((positive?other:enemy).zone,'battlefield');assert.equal(a.hand.length,initial.hand);}
 if(name==='Hellish Sideswipe'){assert.equal(enemy.zone,'graveyard');assert.equal(a.hand.length,initial.hand-1+(positive?1:0));}
 if(name==='Foundry Helix'){assert.equal(enemy.damage,4);assert.equal(a.life,initial.aLife+(positive?4:0));}
 if(name==='Endemic Plague'){assert.equal(enemy.zone,positive?'graveyard':'battlefield');assert.equal(other.zone,'battlefield');}
 if(name==='Rescue from the Underworld'){assert.equal(grave.zone,'graveyard');assert.equal(source.zone,'exile');await game.emit('upkeep',{player:b});await settle(game);assert.equal(grave.zone,'graveyard');if(!positive){await game.move(own,'exile');await game.move(own,'graveyard');}await game.emit('upkeep',{player:a});await settle(game);assert.equal(grave.zone,'battlefield');assert.equal(own.zone,positive?'battlefield':'graveyard');}
 if(name==='Flash Conscription'){assert.equal(enemy.ctrl,a);assert.equal(enemy.tapped,false);assert.equal(enemy.kw('haste'),true);const life=a.life;await game.damagePlayer(enemy,b,3,{combat:false});await settle(game);assert.equal(a.life,life);await game.damageBatch([{src:enemy,target:b,n:2},{src:enemy,target:other,n:3}],{combat:true});await settle(game);assert.equal(a.life,life+(positive?5:0));}
 if(name==='Vigorous Charge'){assert.equal(own.kw('trample'),true);const life=a.life;await game.damageBatch([{src:own,target:b,n:2},{src:own,target:enemy,n:3}],{combat:true});await settle(game);assert.equal(a.life,life+(positive?5:0));}
 if(name==='Maddening Cacophony')assert.equal(b.library.length,initial.library-(positive?Math.ceil(initial.library/2):8));
 if(name==='Sadistic Sacrament'){assert.equal(b.library.length,initial.library-(positive?15:3));assert.equal(b.exile.length,positive?15:3);}
 if(name==='Full Bore'){assert.equal(own.power,initial.ownP+3);assert.equal(own.toughness,initial.ownT+2);assert.equal(own.kw('haste'),positive);assert.equal(own.kw('trample'),positive);}
 if(name==='Snarl Song'){const tokens=game.bf().filter(c=>c.isToken&&c.hasSub('Fractal'));assert.equal(tokens.length,2);assert.equal(tokens[0].counters['+1/+1'],positive?3:1);assert.equal(tokens[0].power,positive?3:1);assert.equal(a.life,initial.aLife+(positive?3:1));}
 if(name==='Moment of Glory'){assert.equal(own.counters['+1/+1'],1);assert.equal(grave.zone,'graveyard');assert.equal(source.zone,positive?'exile':'graveyard');const otherOwn=game.creatures(a).filter(c=>c!==own);for(const c of otherOwn)assert.equal(c.counters['+1/+1']||0,positive?1:0);}
 if(name==='Retrieve the Esper'){const token=game.bf().find(c=>c.isToken&&c.hasSub('Robot'));assert.ok(token);assert.equal(token.counters['+1/+1']||0,positive?2:0);assert.equal(token.power,positive?5:3);assert.equal(source.zone,positive?'exile':'graveyard');}
 if(name==="The Last Ronin's Technique"){const tokens=game.bf().filter(c=>c.isToken&&c.hasSub('Turtle'));assert.equal(tokens.length,3);for(const c of tokens){assert.equal(c.tapped,positive);assert.equal(!!c.attacking,positive);}if(positive)assert.equal(own.zone,'hand');}
 if(name==='Goblin Barrage'){assert.equal(enemy.damage,4);assert.equal(b.life,initial.bLife-(positive?4:0));assert.equal(own.zone,positive?'graveyard':'battlefield');}
 if(name==='Chocobo Kick'){assert.equal(enemy.damage,positive?8:4);assert.equal(attacker.zone,positive?'hand':'battlefield');}
 assertGameStateInvariants(game);
 if(h)h.assertControllerRole(M,f,name);return f;
}
export async function proveMoreV27(M,name,role,positive,h,assert=strict){
 const body=(f,p,extra={})=>makeBody(M,f,p,extra);
 const f=makeContext(M,role,h,name==='Mega Flare'?2:1),{game,a,b}=f;fund(a);fund(b);const source=put(M,game,a,name,'hand'),own=body(f,a),ally=body(f,a),enemy=body(f,b),other=body(f,b),grave=body(f,a,{zone:'graveyard'}),secondGrave=body(f,a,{zone:'graveyard'});let target=enemy,slot=0,extra;
 if(name==='Expel the Unworthy')enemy.def={...enemy.def,cost:positive?'{4}{G}':'{2}{G}'};
 if(name==="Galadriel's Dismissal")target=positive?b:enemy;
 if(name==='The Eagles Are Coming!')target=own;
 if(name==='Soulblast'){ally.def={...ally.def,power:positive?'2':'-3'};own.def={...own.def,power:positive?'4':'-1'};}
 if(name==='Mythos of Nethroi'){enemy.def={...enemy.def,types:['Artifact'],subtypes:[]};for(const c in a.pool)a.pool[c]=0;a.pool.B=positive?1:3;a.pool.G=positive?1:0;a.pool.W=positive?1:0;}
 if(name==="Cauldron's Gift"){for(const c in a.pool)a.pool[c]=0;a.pool.B=positive?3:1;a.pool.C=positive?2:4;}
 if(['Outmuscle','Once and Future'].includes(name)){for(const c in a.pool)a.pool[c]=0;a.pool.G=positive?3:1;a.pool.C=positive?1:3;}
 if(name==='Outmuscle')target=own;
 if(name==='Once and Future')target=grave;
 if(name==='Sundering Stroke'){for(const c in a.pool)a.pool[c]=0;a.pool.R=positive?7:1;a.pool.C=positive?0:6;}
 if(name==="River's Grasp"){for(const c in a.pool)a.pool[c]=0;a.pool.U=positive?1:4;a.pool.B=positive?3:0;extra=body(f,b,{zone:'hand'});}
 if(name==='Mega Flare')extra=body(f,f.others[1]);
 if(name==="Aang's Journey")extra=body(f,a,{zone:'library',types:['Enchantment'],subtypes:['Shrine'],power:undefined,toughness:undefined});
 game.recalc();const initial={aLife:a.life,bLife:b.life,hand:a.hand.length,library:a.library.length,mana:sum(a)};
 choose(a,(g,q)=>q.type==='chooseOption'&&q.aiHint?.kind==='kicker'?(positive?'yes':'no'):q.type==='chooseTargets'?(name==='Outmuscle'?[slot++?enemy:own]:name==='Once and Future'?[slot++?secondGrave:grave]:name==='The Eagles Are Coming!'?(positive?[own,ally]:[own]):name==='Sundering Stroke'?[enemy,other]:name==="River's Grasp"?[slot++?b:enemy]:name==='Mega Flare'?[enemy,extra]:q.candidates.includes(target)?[target]:undefined):q.type==='chooseX'&&q.allocation?q.min:q.type==='chooseCards'?(name==="Cauldron's Gift"?(positive?[grave]:[]):name==="River's Grasp"&&q.from.includes(extra)?[extra]:name==="Aang's Journey"?q.from.includes(extra)?[extra]:q.from.slice(0,1):undefined):undefined);
 assert.equal(await game.castSpell(a,source,{from:'hand'}),true);assert.ok(sum(a)<initial.mana);await settle(game);
 if(name==='Expel the Unworthy'){assert.equal(enemy.zone,'exile');assert.equal(b.life,initial.bLife+(positive?5:3));}
 if(name==="Galadriel's Dismissal"){assert.equal(enemy.phasedOut,true);assert.equal(!!other.phasedOut,positive);assert.equal(!!own.phasedOut,false);}
 if(name==='The Eagles Are Coming!'){assert.equal(own.zone,'hand');assert.equal(ally.zone,positive?'hand':'battlefield');await game.emit('upkeep',{player:b});await settle(game);const tokens=game.bf().filter(c=>c.isToken&&c.hasSub('Bird'));assert.equal(tokens.length,positive?2:1);assert.equal(tokens[0].kw('flying'),true);}
 if(name==='Soulblast'){assert.equal(own.zone,'graveyard');assert.equal(ally.zone,'graveyard');assert.equal(enemy.damage,positive?6:0);}
 if(name==="Cauldron's Gift"){assert.equal(a.library.length,initial.library-(positive?4:0));assert.equal(grave.zone,positive?'battlefield':'graveyard');if(positive)assert.equal(grave.counters['+1/+1'],1);}
 if(name==='Mythos of Nethroi')assert.equal(enemy.zone,positive?'graveyard':'battlefield');
 if(name==='Outmuscle'){assert.equal(own.counters['+1/+1'],1);assert.equal(own.damage,4);assert.equal(enemy.damage,5);assert.equal(own.kw('indestructible'),positive);}
 if(name==='Sundering Stroke'){assert.equal(enemy.damage,positive?7:1);assert.equal(other.damage,positive?7:6);}
 if(name==='Once and Future'){assert.equal(grave.zone,'hand');assert.equal(secondGrave.zone,positive?'hand':'library');if(!positive)assert.equal(a.library.at(-1),secondGrave);assert.equal(source.zone,'exile');}
 if(name==="River's Grasp"){assert.equal(enemy.zone,'hand');assert.equal(extra.zone,positive?'graveyard':'hand');}
 if(name==='Mega Flare'){assert.equal(enemy.damage,positive?6:4);assert.equal(extra.damage,positive?6:4);assert.equal(other.damage,0);assert.equal(game.bf().filter(c=>c.isToken&&c.hasSub('Dragon')).length,positive?1:0);}
 if(name==="Aang's Journey"){assert.equal(a.hand.filter(c=>c.is('Land')).length,1);assert.equal(extra.zone,positive?'hand':'library');assert.equal(a.life,initial.aLife+2);}
 assertGameStateInvariants(game);
 if(h)h.assertControllerRole(M,f,name);return f;
}
