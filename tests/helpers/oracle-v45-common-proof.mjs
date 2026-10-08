import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=["Academic Ascent","Arcane Amphisbaena","Avatar of Burgeoning Echoes","Campus Crier","Countersculpt","Hexhaven Battalion","Inspired Tethermage","Jace's Machinations","Keeper of the Quiet Hour","Mindseeker Oculus","No Admittance","Overwrite the Multiverse","Protege's Awakening","Repurposed Enforcer","Rewrite Regrets","Sanctum Lurker","Solve for Disappointment","Tam's Resistance","Theorist's Proxy","Violent Echoes","Vraska's Final Mercy","Way of the Cryomancer","Way of the Deathbringer","Way of the Healer","Way of the Mentor","Way of the Mind Sculptor","Way of the Necromancer","Way of the Paradox","Way of the Pyromancer","Way of the Warlord","Way of the Wildspeaker"];
export async function proveCommonV45(M,name,role,positive=true,h,assert=strict){
 const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
 for(const p of g.players){fund(p);while(p.library.length<55)put(M,p,'Forest');}
 g.spotlight=async()=>{};g.reviewCombatWithHuman=async()=>{};
 let targets=[],cards=[],choice=positive?'yes':'no',scry=0,empowerPick;
 choose(a,q=>{
  if(q.type==='scry'&&q.surveil)scry+=q.cards.length;
  if(q.type==='chooseTargets'&&targets.length){const picked=[targets.shift()].flat();assert.ok(picked.every(c=>q.candidates.includes(c)),'legal targets');return {...q,candidates:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseCards'&&q.prompt.startsWith('Empower Jace')&&empowerPick)return {...q,from:[empowerPick],min:1,max:1};
  if(q.type==='chooseCards'&&cards.length){const picked=cards.shift();assert.ok(picked.every(c=>q.from.includes(c)),'legal selected cards');return {...q,from:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseOption'&&q.options.some(o=>o.key===choice))return {...q,options:q.options.filter(o=>o.key===choice)};return null;
 });
 const donor=(p=a,extra={})=>permanent(M,g,p,def('V45 witness',['Creature'],{power:'3',toughness:'20',...extra}));
 const harmless=()=>def('V45 paid instant',['Instant'],{cost:'{2}',resolve:async()=>{}});
 const cast=async(n=name,{aim=[],card,resolve=true}={})=>{targets=aim.slice();card ||=put(M,a,n,'hand');const before=total(a);assert.equal(await g.castSpell(a,card,{from:'hand'}),true,typeof n==='string'?n:n.name);assert.ok(total(a)<before,'mana paid');if(resolve)await settle(g);card.sick=false;return card;};
 const activate=async(c,ability,aim=[],resolve=true)=>{targets=aim.slice();const row=g.activatableList(a).find(r=>r.card===c&&(typeof ability==='function'?ability(r):r.ability===ability));assert.ok(row,'legal native activation');assert.equal(await g.activateAbility(a,row),true);if(resolve)await settle(g);return row;};
 const jaces=()=>g.bf().filter(c=>c.ctrl===a&&c.isToken&&c.hasSub('Jace'));
 const printedJace=donor(a,{types:['Planeswalker'],subtypes:['Jace'],loyalty:'9'});g.addCounters(printedJace,'loyalty',9);
 const enemyJace=(await g.makeTokens(def('Foreign Jace',['Planeswalker'],{subtypes:['Jace'],loyalty:'7'}),b))[0];
 let other,initial=0;
 if(!positive){await M.OracleV20.helpers.runGenericEffect({g,you:a,src:printedJace},{action:'empower-jace-v45',n:8});empowerPick=jaces()[0];other=(await g.makeTokens({...empowerPick.def},a))[0];g.addCounters(other,'loyalty',7);initial=8;}
 let expected=Number((M.DEFS[name].oracle.match(/[Ee]mpower Jace (\d+)/)||[])[1]),c,subject,oldHand=a.hand.length,life=a.life,enemyLife=b.life;
 if(['Academic Ascent',"Tam's Resistance"].includes(name)){subject=donor();c=await cast(name,{aim:name==="Tam's Resistance"&&!positive?[[]]:[subject]});assert.equal(subject.power,name==='Academic Ascent'?5:positive?4:3);assert.equal(subject.kw(name==='Academic Ascent'?'flying':'vigilance'),name==='Academic Ascent'||positive);}
 else if(name==='Rewrite Regrets'){subject=put(M,a,def('V45 reanimated',['Creature'],{cost:'{6}',power:'4',toughness:'4'}),'graveyard');c=await cast(name,{aim:[subject]});assert.equal(subject.zone,'battlefield');assert.equal(subject.ctrl.idx,a.idx);}
 else if(name==='Solve for Disappointment'){subject=put(M,b,'Sol Ring','hand');put(M,b,'Forest','hand');cards=[[subject]];c=await cast(name,{aim:[b]});assert.equal(subject.zone,'graveyard');assert.equal(b.hand.length,1);}
 else if(name==='No Admittance'){c=await cast(name,{aim:[b]});assert.equal(b.life,enemyLife-3);}
 else if(name==='Countersculpt'){const original=put(M,b,harmless(),'hand');assert.equal(await g.castSpell(b,original,{from:'hand'}),true);const so=g.stack.find(s=>s.card===original);c=await cast(name,{aim:[so]});assert.equal(original.zone,'graveyard');}
 else if(name==="Vraska's Final Mercy"){choice=positive?'1':'0';subject=donor(b);c=await cast(name,{aim:positive?[]:[subject]});assert.equal(a.life,life-2);assert.equal(subject.zone,positive?'battlefield':'graveyard');if(!positive)expected=0;}
 else if(name==='Violent Echoes'){subject=donor(b,{toughness:positive?'2':'8'});c=await cast(name,{aim:[subject]});expected=positive?4:0;assert.equal(subject.zone,positive?'graveyard':'battlefield');if(!positive)assert.equal(subject.damage,6);}
 else if(name==='Overwrite the Multiverse'){const first=donor(),second=donor(b);c=await cast();expected=2;assert.equal(first.zone,'exile');assert.equal(second.zone,'exile');}
 else if(name==='Campus Crier'){c=put(M,a,name,'graveyard');const before=total(a);await activate(c,r=>r.gyAbility);assert.equal(total(a),before-1);assert.equal(c.zone,'exile');}
 else if(name==='Inspired Tethermage'){c=await cast();const before=total(a);await activate(c,c.def.abilities[0]);assert.equal(total(a),before-6);assert.equal(c.counters['+1/+1'],1);}
 else if(name==='Avatar of Burgeoning Echoes'){c=await cast();const before=jaces().map(c=>c.counters.loyalty).join(',');const enemyLand=put(M,b,'Forest','hand');await g.putPermanentOntoBattlefield(enemyLand,b);await settle(g);assert.equal(jaces().map(c=>c.counters.loyalty).join(','),before);const land=put(M,a,'Forest','hand');assert.equal(await g.playLand(a,land),true);await settle(g);}
 else if(name==='Repurposed Enforcer'){c=await cast();subject=donor();c.attacking=b;c.blockedBy=[];c.wasBlocked=false;g.phase='combat';g.combat={attackers:[c],declaredAttackTargets:[b]};await g.emit('attacks',{card:c,player:a,defender:b});if(!positive)await g.destroy(subject);await settle(g);expected=positive?2:1;g.phase='main2';}
 else {c=await cast();if(name==="Protege's Awakening")assert.equal(a.hand.length,oldHand+1);if(name==='Hexhaven Battalion'){const tokens=g.bf().filter(c=>c.ctrl===a&&c.isToken&&c.name==='Cadet');assert.equal(tokens.length,3);assert.ok(tokens.every(c=>c.power===2&&c.toughness===2&&c.hasSub('Wizard')&&c.hasSub('Soldier')));}}
 const jace=empowerPick||jaces()[0];
 if(expected>0){assert.ok(jace,'empower produces a real Jace token');assert.equal(jace.counters.loyalty,initial+expected);assert.equal(jace.is('Planeswalker'),true);assert.equal(jace.isToken,true);assert.equal(jace.colors.join(','),'U');assert.equal(jace.def.abilities.length,2);if(other)assert.equal(other.counters.loyalty,7,'only one selected token is empowered');}
 else if(!positive)assert.equal(jace.counters.loyalty,initial);
 else assert.equal(jaces().length,0);
 assert.equal(printedJace.counters.loyalty,9,'nontoken Jaces are not empowered');assert.equal(enemyJace.counters.loyalty,7,'opponent Jaces are not empowered');
 const granted=c.def.oracleImplementation?.find(op=>op.kind==='generic-static'&&op.grantedOperation);
 if(granted){
  const required=Math.max(0,-granted.grantedOperation.loyalty);if(jace.counters.loyalty<required)g.addCounters(jace,'loyalty',required-jace.counters.loyalty);const row=g.activatableList(a).find(r=>r.card===jace&&r.ability===jace.cur.extraAbilities[0]);assert.ok(row,'actual granted loyalty ability');assert.equal(enemyJace.cur.extraAbilities.length,0);const loyalty=row.ability.loyalty;if((jace.counters.loyalty||0)<-loyalty)g.addCounters(jace,'loyalty',-loyalty-(jace.counters.loyalty||0));
  const before=jace.counters.loyalty,red=a.pool.R;
  if(name==='Avatar of Burgeoning Echoes'){subject=donor();targets=[subject];}
  if(name==='Way of the Warlord'){subject=donor(b);targets=[positive?[subject]:[],b];}
  if(name==='Way of the Deathbringer'){subject=donor();if(positive)cards=[[subject]];}
  const aims=targets.slice();await activate(jace,row.ability,aims);assert.equal(jace.counters.loyalty||0,before+loyalty);assert.equal(g.activatableList(a).some(r=>r.card===jace&&r.ability?.loyalty!==undefined),false,'once per turn');
  if(name==='Avatar of Burgeoning Echoes')assert.equal(subject.counters['+1/+1'],1);
  if(name==='Way of the Warlord'){assert.equal(b.life,enemyLife-2);assert.equal(subject.damage,positive?2:0);}
  if(name==='Way of the Pyromancer')assert.equal(a.pool.R,red+1);
  if(['Way of the Wildspeaker','Way of the Deathbringer'].includes(name)){const made=g.bf().filter(c=>c.ctrl===a&&c.isToken&&c.hasSub('Beast'));assert.equal(made.length,name==='Way of the Deathbringer'&&!positive?0:1);if(made.length){assert.equal(made[0].power,4);assert.equal(made[0].kw('trample'),true);}if(name==='Way of the Deathbringer')assert.equal(subject.zone,positive?'graveyard':'battlefield');}
  if(name==='Way of the Healer'){assert.equal(g.bf().filter(c=>c.ctrl===a&&c.isToken&&c.name==='Cadet').length,1);assert.equal(scry,1);}
  if(name==='Way of the Cryomancer'){let resolves=0;await cast(def('V45 copy probe',['Instant'],{cost:'{1}',resolve:async()=>{resolves++;}}));assert.equal(resolves,2);await cast(def('V45 second probe',['Instant'],{cost:'{1}',resolve:async()=>{resolves++;}}));assert.equal(resolves,3);}
  if(name==='Sanctum Lurker'){assert.equal(a.life,life+1);assert.equal(b.life,enemyLife-1);g.removeCounters(jace,'loyalty',jace.counters.loyalty);await g.checkSBA();assert.equal(jace.zone,'battlefield');await g.destroy(c);await g.checkSBA();await settle(g);assert.equal(jace.zone,'ceased');}
  else{await g.move(c,'exile');assert.equal(jace.zone==='battlefield'?jace.cur.extraAbilities.length:0,0,'grant disappears with source');}
 }
 if(name==='Way of the Mentor'||name==='Way of the Necromancer'){const before=jace.counters.loyalty;if(name==='Way of the Mentor')await g.gainLife(positive?a:b,3,c);else await g.destroy(donor(positive?a:b));await settle(g);assert.equal(jace.counters.loyalty,before+(positive?1:0));}
 if(['Way of the Paradox','Way of the Mind Sculptor'].includes(name)){const before=jace.counters.loyalty,hand=a.hand.length,land=a.extraLandPlays||0,ability=jace.def.abilities[name==='Way of the Mind Sculptor'&&positive?1:0];await activate(jace,ability);assert.equal(jace.counters.loyalty,before+ability.loyalty);if(name==='Way of the Mind Sculptor')assert.equal(a.hand.length,hand+(positive?2:0));else{assert.equal(a.life,life+1);const one=put(M,a,'Forest','hand'),two=put(M,a,'Forest','hand'),three=put(M,a,'Forest','hand');assert.equal(await g.playLand(a,one),true);assert.equal(await g.playLand(a,two),true);assert.equal(await g.playLand(a,three),false);}}
 if(name==="Jace's Machinations"){g.turnPlayer=b;g.phase='combat';const row=g.activatableList(a,true).find(r=>r.card===jace&&r.ability===jace.def.abilities[0]);assert.ok(row);assert.equal(await g.activateAbility(a,row),true);await settle(g);assert.equal(g.activatableList(a,true).some(r=>r.card===jace),false);g.turnNo++;assert.equal(g.activatableList(a,true).some(r=>r.card===jace),false,'permission expires at turn boundary');}
 // The generated token uses paid native loyalty costs, then native draw/surveil effects.
 if(expected>0&&jace.zone==='battlefield'&&g.canActivateLoyalty(jace)&&!granted){g.turnPlayer=a;g.phase='main2';const n=jace.counters.loyalty,hand=a.hand.length,ability=jace.def.abilities[n>=3?1:0],seen=scry;await activate(jace,ability);assert.equal(jace.counters.loyalty||0,n+ability.loyalty);if(ability.loyalty===-3)assert.equal(a.hand.length,hand+1);else assert.equal(scry,seen+1);}
 assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV45(M,entry,op,role,h){
 if(!names.includes(entry.raw.name)||!['generic-trigger','generic-static','generic-ability','zero-loyalty-v45','spell-generic','spell-modal-generic'].includes(op.kind))return null;
 // Unchanged secondary abilities retain their own central semantic proofs.
 if(entry.raw.name==="Theorist's Proxy"&&op.kind==='generic-ability')return null;
 let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));for(const positive of[true,false])await proveCommonV45(M,entry.raw.name,role,positive,h,assert);return count;
}
