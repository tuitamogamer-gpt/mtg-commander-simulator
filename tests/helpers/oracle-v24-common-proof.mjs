import assert from 'node:assert/strict';
const total=p=>Object.values(p.pool).reduce((sum,n)=>sum+n,0);
export async function licidProofV24(M,entry,role,h){
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.fund(a,100);h.fund(b,100);
 const source=h.zoneCard(M,a,entry.raw.name,'hand'),host=h.permanent(M,game,b,'Grizzly Bears');
 assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(source.zone,'battlefield');assert.equal(source.is('Creature'),true);source.sick=false;
 const activation=game.activatableList(a).find(e=>e.card===source&&e.ability?.oracleLicidV24);assert.ok(activation);const mana=total(a);assert.equal(await game.activateAbility(a,activation,[host]),true);assert.ok(total(a)<mana);assert.equal(source.tapped,true);assert.equal(source.is('Creature'),true);assert.equal(game.stack.length,1);await h.resolveAll(game);
 assert.equal(source.is('Creature'),false);assert.equal(source.is('Enchantment'),true);assert.equal(source.hasSub('Aura'),true);assert.equal(source.attachedTo,host.iid);assert.equal(game.activatableList(a).some(e=>e.card===source&&e.ability?.oracleLicidV24),false);
 let checks=12;
 for(const op of entry.implementation.slice(1)){
  if(op.kind==='attachment-grant'){for(const kw of op.keywords||[])assert.equal(host.kw(kw),true);if(op.cantAttack)assert.equal(host.cur.cantAttack,true);if(op.cantBlock)assert.equal(host.cur.cantBlock,true);if(op.lure)assert.equal(host.cur.lure,true);checks+=3;}
  else if(op.kind==='aura-control-v8'){assert.equal(host.ctrl,a);checks++;}
  else if(op.kind==='v8-layered-static'){assert.equal(host.is('Artifact'),true);assert.equal(host.power,3);assert.equal(host.toughness,3);checks+=3;}
  else if(op.kind==='generic-ability'&&op.effects.every(e=>e.action==='regenerate')){const end=game.activatableList(a).find(e=>e.card===source&&e.ability?.oracleOperation===op);assert.ok(end);const old=total(a);assert.equal(await game.activateAbility(a,end),true);assert.ok(total(a)<old);await h.resolveAll(game);assert.equal(host.regenShield,1);await game.destroy(host);assert.equal(host.zone,'battlefield');assert.equal(host.regenShield,0);checks+=5;}
  else if(op.kind==='generic-trigger'&&op.event==='upkeep'){const old=b.life;await game.emit('upkeep',{player:b});await h.resolveAll(game);assert.equal(b.life,old-1);const life=a.life;await game.emit('upkeep',{player:a});await h.resolveAll(game);assert.equal(a.life,life);checks+=2;}
  else if(op.kind==='generic-trigger'&&op.event==='becameTapped'){const old=b.life;game.tap(host);await h.resolveAll(game);assert.equal(b.life,old-2);checks++;}
  else throw Error('No full Licid body proof for '+op.kind);
 }
 game.turnPlayer=b;game.phase='main1';const spell=h.zoneCard(M,b,'Grizzly Bears','hand');assert.equal(await game.castSpell(b,spell,{from:'hand'}),true);const size=game.stack.length,end=game.activatableList(a,true).find(e=>e.card===source&&e.oracleLicidEndV24);assert.ok(end);const prior=total(a);assert.equal(await game.activateAbility(a,end),true);assert.equal(game.stack.length,size);assert.ok(total(a)<prior);assert.equal(source.is('Creature'),true);assert.equal(source.attachedTo,null);assert.equal(host.attachments.includes(source.iid),false);assert.equal(source.tapped,true);assert.equal(M.OracleV24Common.records(game,source).length,0);assert.equal(host.ctrl,b);await h.resolveAll(game);h.assertControllerRole(M,f,entry.raw.name);return checks+8;
}
export async function epicProofV24(M,entry,role,h){
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.fund(a,100);h.fund(b,100);h.fillLibrary(M,a,20);h.fillLibrary(M,b,20);h.permanent(M,game,a,'Grizzly Bears');h.zoneCard(M,a,'Grizzly Bears','hand');
 const choose=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:q.type==='chooseCards'&&q.search?q.from.slice(0,Math.max(q.min,Math.min(1,q.max))):choose(g,q);
 const seed=()=>{h.zoneCard(M,a,'Rancor','library');h.zoneCard(M,b,'Grizzly Bears','library');h.zoneCard(M,a,'Grizzly Bears','library');h.zoneCard(M,a,'Forest','library');h.zoneCard(M,a,'Forest','library');};
 const counts=()=>({tokens:game.bf().filter(c=>c.isToken&&c.hasSub('Snake')).length,exile:b.exile.length,ownExile:a.exile.length,foreign:game.bf().filter(c=>c.ctrl===a&&c.owner===b).length,life:b.life,enchants:game.bf().filter(c=>c.ctrl===a&&c.is('Enchantment')).length});
 const body=name=>{const before=counts();return()=>{const after=counts();if(name==='Endless Swarm')assert.equal(after.tokens-before.tokens,a.hand.length);else if(name==='Neverending Torment')assert.equal(after.exile-before.exile,a.hand.length);else if(name==='Eternal Dominion')assert.equal(after.foreign-before.foreign,1);else if(name==='Undying Flames'){assert.equal(after.ownExile-before.ownExile,3);assert.equal(before.life-after.life,2);}else if(name==='Enduring Ideal')assert.equal(after.enchants-before.enchants,1);else throw Error('Missing Epic body proof');};};
 seed();const source=h.zoneCard(M,a,entry.raw.name,'hand'),mana=total(a);assert.equal(await game.castSpell(a,source,{from:'hand',quickTargets:[b]}),true);assert.ok(total(a)<mana);const original=game.stack.at(-1),assertBody=body(entry.raw.name);await h.resolveAll(game);assertBody();assert.equal(source.zone,'graveyard');assert.equal(M.OracleV24Common.epic(game,a),true);assert.equal(game.delayed.filter(d=>d.name.includes('Epic')).length,1);assert.equal(game.castableList(a).length,0);assert.equal(await game.castSpell(a,a.hand[0],{from:'hand',alt:{free:true}}),false);assert.equal(M.OracleV24Common.epic(game,b),false);
 await game.emit('upkeep',{player:b});await h.resolveAll(game);assert.equal(game.delayed.filter(d=>d.name.includes('Epic')).length,1);
 for(let n=0;n<2;n++){seed();const verify=body(entry.raw.name);await game.emit('upkeep',{player:a});await game.flushTriggers();assert.equal(game.stack.length,1);await game.resolveTop();assert.equal(game.stack.length,1);assert.equal(game.stack[0].isCopy,true);assert.equal(game.stack[0].copyRoot,original);assert.equal(game.stack[0].oracleDefinition.oracleImplementation.some(op=>op.kind==='spell-epic-v24'),false);await h.resolveAll(game);verify();assert.equal(game.delayed.filter(d=>d.name.includes('Epic')).length,1);}h.assertControllerRole(M,f,entry.raw.name);return 30;
}
export async function operationProofV24(M,entry,operation,role,h){
 if(entry.implementation.some(op=>op.kind==='mechanic-licid-v24'))return licidProofV24(M,entry,role,h);
 if(operation.kind==='spell-epic-v24')return epicProofV24(M,entry,role,h);
 return null;
}
