import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=['Azor, the Lawbringer','Cleansing','Errant, Street Artist','Fade Away','Ghostly Keybearer',"Lim-Dûl's Hex",'Meletis Charlatan','Mister Immortal','Rooting Kavu','Sea Troll','Tower Worker',"Trespasser's Curse",'Yosei, the Morning Star','Zahid, Djinn of the Lamp'];
export async function proveCommonV51(M,name,role,positive=true,h,assert=strict){
 const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
 for(const p of g.players){fund(p);while(p.library.length<65)put(M,p,'Forest');}
 g.spotlight=async()=>{};g.reviewCombatWithHuman=async()=>{};
 let aims=[],picks=[],yes='yes',opponentYes=positive?'yes':'no';
 choose(a,q=>{
  if(q.type==='chooseTargets'&&aims.length){const picked=[aims.shift()].flat();assert.ok(picked.every(c=>q.candidates.includes(c)),'legal targets');return {...q,candidates:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseCards'&&picks.length){const picked=picks.shift();assert.ok(picked.every(c=>q.from.includes(c)),'legal cards');return {...q,from:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseX')return {...q,min:positive?3:0,max:positive?3:0};
  if(q.type==='chooseOption'&&q.options.some(o=>o.key===yes))return {...q,options:q.options.filter(o=>o.key===yes)};
  return null;
 });
 choose(b,q=>q.type==='chooseOption'&&q.options.some(o=>o.key===opponentYes)?{...q,options:q.options.filter(o=>o.key===opponentYes)}:null);
 const donor=(p=a,extra={})=>permanent(M,g,p,def('V51 witness',['Creature'],{power:'3',toughness:'20',...extra}));
 const cast=async(n=name,{aim=[],resolve=true,opts={},card,player=a}={})=>{if(player===a)aims=aim.slice();card ||=put(M,player,n,'hand');const before=total(player);assert.equal(await g.castSpell(player,card,{from:card.zone,...opts}),true,typeof n==='string'?n:n.name);assert.ok(total(player)<before,'paid cast');if(resolve)await settle(g);card.sick=false;return card;};
 const activate=async(c,aim=[],resolve=true)=>{aims=aim.slice();const row=g.activatableList(a).find(r=>r.card===c&&!r.manaAbility);assert.ok(row,'legal activation');assert.equal(await g.activateAbility(a,row),true);if(resolve)await settle(g);return row;};
 const pair=async(attacker,blocker)=>{attacker.attacking=blocker.ctrl;attacker.blockedBy=[blocker];attacker.wasBlocked=true;blocker.blocking=attacker.iid;g.combat={attackers:[attacker],declaredAttackTargets:[blocker.ctrl]};await g.emit('blocks',{attacker,blocker});await g.emit('becomesBlockedByCreature',{attacker,blocker,blockers:[blocker]});};
 if(name==='Azor, the Lawbringer'){
  const c=await cast(),instant=put(M,b,def('V51 instant',['Instant'],{cost:'{U}',resolve:async()=>{}}),'hand');assert.equal(g.canCastTiming(b,instant),true);g.turnPlayer=b;let checked=false;g.mainPhase=async()=>{checked=true;fund(b);assert.equal(g.canCastTiming(b,instant),false);};g.combatPhase=async()=>{};await g.runTurn();assert.equal(checked,true);assert.equal(g.canCastTiming(b,instant),true);
  fund(a);const life=a.life,hand=a.hand.length,mana=total(a);c.attacking=b;await g.emit('attacks',{player:a,card:c,defender:b});await settle(g);assert.equal(a.life,life+(positive?3:0));assert.equal(a.hand.length,hand+(positive?3:0));assert.equal(total(a),mana-(positive?6:3));assert.equal(c.kw('flying'),true);
 }else if(name==='Tower Worker'){
  const c=await cast();donor(a,{name:'Mine Worker'});if(positive)donor(a,{name:'Power Plant Worker'});const row=g.manaSources(a).find(r=>r.card===c);assert.ok(row);const n=positive?3:1,before=a.pool.C;assert.equal(await g.activateManaSource(a,row,{C:n}),true);assert.equal(a.pool.C,before+n);assert.equal(c.tapped,true);assert.equal(c.kw('reach'),true);
 }else if(name==='Sea Troll'){
  const c=await cast(),partner=donor(b,{colorsOverride:[positive?'U':'R']});assert.equal(g.activatableList(a).some(r=>r.card===c),false);await pair(positive?partner:c,positive?c:partner);await settle(g);assert.equal(g.activatableList(a).some(r=>r.card===c),positive);if(positive){await activate(c);await g.destroy(c);assert.equal(c.zone,'battlefield');assert.equal(c.regenShield,0);await g.move(c,'exile');await g.putPermanentOntoBattlefield(c,a);assert.equal(g.activatableList(a).some(r=>r.card===c),false);}
 }else if(name==='Mister Immortal'){
  const c=put(M,a,name,positive?'graveyard':'exile'),before=total(a);await activate(c);assert.equal(total(a),before-3);assert.equal(c.zone,'battlefield');assert.equal(c.tapped,true);assert.equal(g.activatableList(a).some(r=>r.card===c),false);await g.move(c,positive?'graveyard':'exile');await activate(c,[],false);await g.move(c,'hand');await settle(g);assert.equal(c.zone,'hand');
 }else if(name==='Rooting Kavu'){
  const c=await cast(),dead=put(M,a,'Grizzly Bears','graveyard'),land=put(M,a,'Forest','graveyard');yes=positive?'yes':'no';await g.destroy(c);await settle(g);assert.equal(c.zone,positive?'exile':'graveyard');assert.equal(dead.zone,positive?'library':'graveyard');assert.equal(land.zone,'graveyard');
 }else if(name==="Trespasser's Curse"){
  const c=await cast(name,{aim:[b]}),own=a.life,enemy=b.life;await g.putPermanentOntoBattlefield(put(M,positive?b:a,def('V51 cursed entrant'),'hand'),positive?b:a);await settle(g);assert.equal(a.life,own+(positive?1:0));assert.equal(b.life,enemy-(positive?1:0));assert.equal(c.meta.cursedPlayer,b);
 }else if(name==='Yosei, the Morning Star'){
  const c=await cast(),one=donor(b),two=donor(b),wrong=donor();aims=[b,positive?[one,two]:[]];await g.destroy(c);await settle(g);assert.equal(one.tapped,positive);assert.equal(two.tapped,positive);assert.equal(wrong.tapped,false);g.tap(wrong);g.tap(one);g.turnPlayer=b;g.mainPhase=async()=>{assert.equal(one.tapped,true);};g.combatPhase=async()=>{};await g.runTurn();g.turnPlayer=b;g.mainPhase=async()=>{assert.equal(one.tapped,false);};await g.runTurn();
 }else if(name==='Zahid, Djinn of the Lamp'){
  const artifact=permanent(M,g,a,def('V51 tap artifact',['Artifact'])),card=put(M,a,name,'hand');if(!positive)g.tap(artifact);const row=g.castableList(a).find(r=>r.card===card&&r.alt?.oracleTapAlternativeV20);assert.equal(!!row,positive);if(positive){picks=[[artifact]];const before=total(a);await cast(name,{card,opts:{alt:row.alt}});assert.equal(total(a),before-4);assert.equal(artifact.tapped,true);}else await cast(name,{card});assert.equal(card.kw('flying'),true);
 }else if(name==='Errant, Street Artist'||name==='Meletis Charlatan'){
  const c=await cast();let resolved=[];const owner=name==='Meletis Charlatan'?b:a,spell=put(M,owner,def('V51 copied spell',name==='Errant, Street Artist'&&!positive?['Creature']:['Instant'],{cost:'{U}',resolve:async ctx=>{resolved.push(ctx.you);}}),'hand');g.turnPlayer=owner;await cast(spell.def,{card:spell,player:owner,resolve:false});const original=g.stack.find(o=>o.card===spell),copy=name==='Errant, Street Artist'?await g.copySpell(original,a,{mayNewTargets:false}):null;const spec=c.def.abilities[0].targets[0];if(copy){assert.equal(g.legalTargets(spec,c,a).includes(original),false);assert.equal(g.legalTargets(spec,c,a).includes(copy),true);}await activate(c,[copy||original],false);await g.resolveTop();assert.equal(g.stack.filter(o=>o.isCopy).length,copy?2:1);assert.equal(g.stack.at(-1).ctrl,owner);await settle(g);if(spell.is('Instant'))assert.equal(resolved.length,copy?3:2);else assert.equal(g.bf().filter(x=>x.name===spell.name&&x.isToken).length,2);assert.equal(c.tapped,true);
 }else if(name==='Ghostly Keybearer'){
  const c=await cast(),room=permanent(M,g,a,M.DEFS['Bottomless Pool // Locker Room']||M.DEFS['Bottomless Pool']);assert.ok(room.def.bdfRoom);room.meta.bdfUnlocked=positive?[room.def.bdfRoom[0].key]:room.def.bdfRoom.map(d=>d.key);g.recalc();aims=[room];let unlock=0;const emit=g.emit;g.emit=async function(event,d,...args){if(event==='unlockDoor')unlock++;return emit.call(this,event,d,...args);};const mana=total(a);await g.damageBatch([{src:c,target:b,n:1}],{combat:true,deferSBA:true});await settle(g);assert.equal(room.meta.bdfUnlocked.length,2);assert.equal(unlock,positive?1:0);assert.equal(total(a),mana);
 }else if(name==="Lim-Dûl's Hex"){
  const c=await cast(),life=a.life,enemy=b.life,before=total(a);yes=positive?'{B}':'no';opponentYes='no';await g.emit('upkeep',{player:a});await settle(g);assert.equal(a.life,life-(positive?0:1));assert.equal(b.life,enemy-1);assert.equal(total(a),before-(positive?1:0));assert.equal(c.zone,'battlefield');
 }else if(name==='Cleansing'){
  const land=permanent(M,g,a,M.DEFS.Forest),other=permanent(M,g,b,M.DEFS.Island),life=a.life;yes=positive?'yes':'no';opponentYes='no';await cast();assert.equal(land.zone,positive?'battlefield':'graveyard');assert.equal(other.zone,positive?'battlefield':'graveyard');assert.equal(a.life,life-(positive?2:0));
 }else if(name==='Fade Away'){
  const creature=donor(),other=donor(b),land=permanent(M,g,b,M.DEFS.Island),before=total(a),enemy=total(b);yes=positive?'yes':'no';opponentYes='no';if(!positive)picks=[[creature]];choose(b,q=>q.type==='chooseCards'&&q.from.includes(land)?{...q,from:[land],min:1,max:1}:null);await cast();assert.equal(total(a),before-(positive?4:3));assert.equal(total(b),enemy);assert.equal(creature.zone,positive?'battlefield':'graveyard');assert.equal(other.zone,'battlefield');assert.equal(land.zone,'graveyard');
 }else throw Error('Missing v51 proof '+name);
 assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV51(M,entry,op,role,h){if(!names.includes(entry.raw.name))return null;let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));for(const positive of[true,false])await proveCommonV51(M,entry.raw.name,role,positive,h,assert);return count;}
