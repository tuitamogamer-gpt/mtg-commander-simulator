import assert from 'node:assert/strict';
const flat=value=>[value].flat(Infinity).filter(Boolean),worlds=new WeakMap(),wrapped=new WeakSet();
const actions=new Set(['dual-kicker-bonus-v24','dual-kicker-phase-v24','tap-self-hit-v24','search-target-name-v24']);
const total=player=>Object.values(player.pool).reduce((n,value)=>n+value,0);
function install(M,f,h){
 let state=worlds.get(f.game);if(!state){state={f,h,rows:[]};worlds.set(f.game,state);}state.h=h;
 for(const handler of M.OracleV20.handlers)if(handler.spellsV24&&!wrapped.has(handler)){wrapped.add(handler);const prior=handler.effect;handler.effect=async function(ctx,effect,helpers){const state=worlds.get(ctx.g);if(!state||!actions.has(effect.action))return prior.call(this,ctx,effect,helpers);const subjects=helpers.genericEffectSubjects(ctx,effect.target),row={effect,ctx,subjects,life:new Map(ctx.g.players.map(p=>[p,p.life])),hand:new Map(ctx.g.players.map(p=>[p,p.hand.length])),cards:new Map([...ctx.g.bf(),...ctx.you.library].map(card=>[card,{zone:card.zone,version:card.zoneVersion,power:card.power,controller:card.ctrl,damage:card.damage||0,phased:card.phasedOut,tapped:card.tapped}]))};state.rows.push(row);try{return await prior.call(this,ctx,effect,helpers);}finally{row.afterLife=new Map(ctx.g.players.map(p=>[p,p.life]));row.afterHand=new Map(ctx.g.players.map(p=>[p,p.hand.length]));row.afterCards=new Map([...row.cards.keys()].map(card=>[card,{zone:card.zone,version:card.zoneVersion,damage:card.damage||0,phased:card.phasedOut,tapped:card.tapped}]));}};}
 return state;
}
export function installSpellProofV24(M,f,h){return install(M,f,h);}
export function stageCostsCardV24(M,f,entry,h){
 const op=(entry.implementation||[]).find(op=>op.kind==='mechanic-hand-exile-reduction-v24');if(!op)return [];
 return Array.from({length:2},()=>{const card=h.zoneCard(M,f.a,'Grizzly Bears','hand');card.def={...card.def,cost:'{'+op.color+'}'};return card;});
}
export function stageSpellsConditionV24(M,f,node,source,h,positive=true){
 if(!['dual-kicker-cost-v24','dual-kicker-count-v24'].includes(node?.kind))return false;
 const costs=source.def?.oracleDualKickerV24||h.entry?.implementation.find(op=>op.kind==='mechanic-dual-kicker-v24')?.costs;
 if(!costs)throw Error('Missing dual kicker fixture costs');
 const picks=!positive?[]:node.kind==='dual-kicker-count-v24'?[0,1]:[costs.indexOf(node.cost)];assert.ok(picks.every(i=>i>=0));
 source.castMeta={...source.castMeta,kicked:!!picks.length,paidTimes:picks.length,alt:{...source.castMeta?.alt,oracleDualKickerV24:picks}};
 f.oracleDualKickerProofV24=picks;return true;
}
export function stageSpellsEffectV24(M,f,effect,h){
 if(!actions.has(effect.action))return false;install(M,f,h);
 if(effect.action==='dual-kicker-phase-v24')h.permanent(M,f.game,f.a,'Grizzly Bears');
 if(effect.action==='search-target-name-v24'){const target=flat(h.stagedTargets[effect.target])[0];if(target){target.def={...target.def,cost:'{1}'};const card=h.zoneCard(M,f.a,'Grizzly Bears','library');card.def={...card.def,name:target.name};}}
 if(effect.action==='dual-kicker-bonus-v24')for(const child of effect.effects)h.stageEffect(child);
 f.game.recalc();return true;
}
export async function assertSpellsEffectV24(M,f,entry,effect,source,targets,damaged,before,trace,label,h){
 if(!actions.has(effect.action))return false;
 const rows=install(M,f,h).rows.filter(row=>JSON.stringify(row.effect)===JSON.stringify(effect));assert.ok(rows.length,label+' actual v24 effect route');
 for(const row of rows){
  if(effect.action==='tap-self-hit-v24')for(const card of row.subjects){const original=row.cards.get(card),after=row.afterCards.get(card);if(original?.zone==='battlefield'){assert.equal(after.tapped,true,label);assert.equal(row.afterLife.get(original.controller),row.life.get(original.controller)-Math.max(0,original.power),label);}}
  if(effect.action==='search-target-name-v24'){const returned=[...row.cards].filter(([card,old])=>old.zone==='library'&&row.afterCards.get(card).zone==='battlefield');assert.ok(returned.length<=1,label);for(const [card]of returned){assert.equal(card.name,row.subjects[0].name,label);assert.equal(card.tapped,true,label);}}
  if(effect.action==='dual-kicker-phase-v24'){const phased=[...row.cards].filter(([card,old])=>!old.phased&&row.afterCards.get(card).phased);assert.ok(phased.length<=(row.ctx.so?.castOpts.oracleDualKickerV24||[]).length,label);assert.ok(phased.every(([card,old])=>old.controller===row.ctx.you),label);}
  if(effect.action==='dual-kicker-bonus-v24'){const paid=M.OracleV24Spells.hasCost(row.ctx.src,effect.cost,row.ctx.oracleSourceCapture,row.ctx.so?.castOpts);if(!paid){assert.deepEqual(row.afterLife,row.life,label);assert.deepEqual(row.afterHand,row.hand,label);}else for(const child of effect.effects){if(child.action==='draw')assert.equal(row.afterHand.get(row.ctx.you),row.hand.get(row.ctx.you)+(row.ctx.so?.x||0),label);if(child.action==='damage'){const card=row.ctx.targets[child.target.index],player=flat(card)[0].ctrl;assert.equal(row.afterLife.get(player),row.life.get(player)-(row.ctx.so?.x||0),label);}}}
 }
 return true;
}
export async function operationProofV24(M,entry,op,role,h){
 if(['Devouring Rage','Devouring Greed','Corpse Cobble','Vicious Betrayal','Burn at the Stake','Taste of Paradise'].includes(entry.raw.name))return aggregateProof(M,entry,role,h);
 const dual=entry.implementation.find(part=>part.kind==='mechanic-dual-kicker-v24');
 if(!dual&&op.kind!=='mechanic-hand-exile-reduction-v24')return null;
 const sets=dual?[[],[0],[1],[0,1]]:[[],[0],[0,1]];
 for(const choices of sets){
  const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;install(M,f,h);h.fund(a,100);h.fillLibrary(M,a,30);h.fillLibrary(M,b,30);a.life=b.life=40;
  const source=h.zoneCard(M,a,entry.raw.name,'hand'),donors=stageCostsCardV24(M,f,entry,h),enemy=h.permanent(M,game,b,'Grizzly Bears');enemy.def={...enemy.def,power:'1',toughness:'30',kws:['flying']};const artifact=h.permanent(M,game,b,'Sol Ring'),enchantment=h.permanent(M,game,b,h.fixtureDefinition('V24 enchantment donor',['Enchantment'],{cost:'{1}'})),land=h.permanent(M,game,b,'Forest'),own=h.permanent(M,game,a,'Grizzly Bears');own.def={...own.def,toughness:'30'};h.permanent(M,game,a,'Grizzly Bears');for(let i=0;i<4;i++)h.zoneCard(M,b,'Forest','hand');
  if(!dual)for(const part of entry.implementation)for(const target of part.targets||[])if(target.zone!=='stack')h.stageGenericTarget(M,f,target,0,part.effects?.[0]);
  const prior=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseOption'&&q.aiHint?.kind==='kicker'&&dual?(choices.some(i=>q.prompt.includes('its '+dual.costs[i]+' kicker'))?'yes':'no'):q.type==='chooseCards'&&q.prompt.includes('exile colored hand cards')?choices.map(i=>donors[i]):q.type==='chooseCards'&&q.prompt.includes('phase out')?q.from.slice(0,q.max):q.type==='chooseTargets'&&dual?(q.candidates.includes(enemy)?[enemy]:q.candidates.includes(b)?[b]:undefined)??prior(g,q):prior(g,q);
  game.recalc();const mana=total(a),versions=donors.map(card=>card.zoneVersion);assert.equal(await game.castSpell(a,source,{from:'hand',xVal:4}),true,entry.raw.name);const so=game.stack.find(so=>so.card===source);assert.ok(total(a)<mana,entry.raw.name+' pays mana');
  if(dual){assert.deepEqual(Array.from(so.castOpts.oracleDualKickerV24),choices);assert.equal(so.kicked,!!choices.length);assert.equal(source.castMeta.paidTimes,choices.length);const expected=M.parseCost(source.def.cost).generic+M.parseCost(source.def.cost).pips.length+(M.parseCost(source.def.cost).x||0)*4+choices.reduce((n,i)=>{const cost=M.parseCost(dual.costs[i]);return n+cost.generic+cost.pips.length;},0);assert.equal(mana-total(a),expected);}
  else for(let i=0;i<donors.length;i++){assert.equal(donors[i].zone,choices.includes(i)?'exile':'hand');assert.equal(donors[i].zoneVersion,versions[i]+(choices.includes(i)?1:0));}
  await h.resolveAll(game);
  const name=entry.raw.name;
  if(name==='Archangel of Wrath'){assert.equal(enemy.damage,choices.length*2);assert.equal(a.life,40+choices.length*2);}
  if(name==='Thornscape Battlemage'){assert.equal(enemy.damage,choices.includes(0)?2:0);assert.equal(artifact.zone,choices.includes(1)?'graveyard':'battlefield');}
  if(name==='Thunderscape Battlemage'){assert.equal(b.hand.length,choices.includes(0)?2:4);assert.equal(enchantment.zone,choices.includes(1)?'graveyard':'battlefield');}
  if(name==='Ana Battlemage'){assert.equal(b.hand.length,choices.includes(0)?1:4);assert.equal(enemy.tapped,choices.includes(1));assert.equal(b.life,choices.includes(1)?39:40);}
  if(name==='Sunscape Battlemage'){assert.equal(enemy.zone,choices.includes(0)?'graveyard':'battlefield');assert.equal(a.hand.length,choices.includes(1)?2:0);}
  if(name==='Nightscape Battlemage'){assert.equal(land.zone,choices.includes(1)?'graveyard':'battlefield');}
  if(name==='Stronghold Arena'){assert.equal(a.life,40+choices.length*3);const top=h.zoneCard(M,a,'Doom Blade','library'),hand=a.hand.length,life=a.life;for(const reveal of [false,true]){const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseOption'&&q.prompt==='Reveal the top card of your library?'?(reveal?'yes':'no'):decide(g,q);own.attacking=b;own.blockedBy=[];own.wasBlocked=false;game.combat={attackers:[own]};await game.combatDamage(a,'normal');await h.resolveAll(game);assert.equal(a.hand.length,hand+(reveal?1:0));assert.equal(a.life,life-(reveal?top.mv:0));}assert.equal(top.zone,'hand');}
  if(name==='Vodalian Mindsinger'){assert.equal(source.counters['+1/+1']||0,2*choices.length);assert.equal(enemy.ctrl,a);await game.move(source,'exile');assert.equal(enemy.ctrl,b);}
  if(name==='Urborg Lhurgoyf')assert.equal(a.graveyard.length,3*choices.length);
  if(name==='Illuminate'){assert.equal(enemy.damage,4);assert.equal(b.life,choices.includes(0)?36:40);assert.equal(a.hand.length,choices.includes(1)?4:0);}
  if(name==='Temporal Firestorm'){assert.equal(game.battlefield.filter(card=>card.ctrl===a&&card.phasedOut).length,choices.length);assert.equal(enemy.damage,5);assert.equal(own.damage,choices.length?0:5);}
  for(const grant of entry.implementation.filter(part=>part.kind==='dual-kicker-entry-v24'))if(choices.includes(dual.costs.indexOf(grant.cost))){for(const keyword of grant.keywords)assert.equal(source.kw(keyword),true);if(grant.ability==='damage-life'){const life=a.life;await game.damageAny(source,b,2);await h.resolveAll(game);assert.equal(a.life,life+2);}}
  if(entry.implementation.some(part=>part.kind==='dual-kicker-entry-v24'))assert.equal(source.counters['+1/+1']||0,entry.implementation.filter(part=>part.kind==='dual-kicker-entry-v24'&&choices.includes(dual.costs.indexOf(part.cost))).reduce((n,part)=>n+part.counters,0));
  h.assertControllerRole(M,f,entry.raw.name);
 }
 return sets.length*12;
}
async function aggregateProof(M,entry,role,h){
 for(const n of [0,1,2]){
  const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f,name=entry.raw.name;h.fund(a,100);a.life=b.life=40;const source=h.zoneCard(M,a,name,'hand'),donors=Array.from({length:2},(_,i)=>{const card=h.permanent(M,game,a,'Grizzly Bears');card.def={...card.def,power:String(i+2),toughness:'30',subtypes:['Spirit']};return card;}),target=h.permanent(M,game,b,'Grizzly Bears');target.def={...target.def,toughness:'30'};game.recalc();const prior=a.controller.decide.bind(a.controller);
  a.controller.decide=(g,q)=>q.type==='chooseCards'&&(q.prompt.includes('sacrifice any number')||q.aiHint?.kind==='addlTap')?donors.slice(0,n):q.type==='chooseX'&&q.prompt.includes('any number of times')?n:q.type==='chooseTargets'?[['Devouring Greed','Burn at the Stake'].includes(name)?b:target]:prior(g,q);
  const mana=total(a),cost=M.parseCost(source.def.cost);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);const so=game.stack.find(so=>so.card===source);assert.equal(mana-total(a),cost.generic+cost.pips.length+(name==='Taste of Paradise'?n*2:0));assert.equal(so.kicked,false);if(name==='Burn at the Stake'){assert.equal(so.additionalTapped.length,n);assert.equal(donors.filter(card=>card.tapped).length,n);}else if(name!=='Taste of Paradise'){assert.equal(so.oracleV4AdditionalCost.sacrifices.length,n);assert.equal(donors.filter(card=>card.zone==='graveyard').length,n);for(const card of donors.slice(0,n)){await game.move(card,'hand');card.def={...card.def,power:'20'};}}
  await game.copySpell(so,a,{mayNewTargets:false});await h.resolveAll(game);
  if(name==='Devouring Greed'){assert.equal(a.life,40+2*(2+n*2));assert.equal(b.life,40-2*(2+n*2));}
  if(name==='Devouring Rage')assert.equal(target.power,2+2*(3+3*n));
  if(name==='Vicious Betrayal'){assert.equal(target.power,2+4*n);assert.equal(target.toughness,30+4*n);}
  if(name==='Burn at the Stake')assert.equal(b.life,40-6*n);
  if(name==='Taste of Paradise')assert.equal(a.life,40+2*(3+3*n));
  if(name==='Corpse Cobble'){const tokens=game.bf().filter(card=>card.isToken&&card.hasSub('Zombie'));assert.equal(tokens.length,n?2:0);assert.ok(tokens.every(card=>card.power===(n===1?2:5)&&card.toughness===(n===1?2:5)&&card.kw('menace')));}
  h.assertControllerRole(M,f,name);
 }
 return 45;
}
