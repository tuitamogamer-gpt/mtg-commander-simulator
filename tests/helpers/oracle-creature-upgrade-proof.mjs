import assert from 'node:assert/strict';
export async function activateUpgrade(M,ctx,source,{resolve=true}={}){
 const {game,a}=ctx;const action=game.activatableList(a).find(row=>row.card===source&&row.ability.oracleOperation?.effects?.some(effect=>effect.action==='monstrosity-v8'))||game.activatableList(a).find(row=>row.card===source&&row.ability.oracleCompiled);assert.ok(action,source.name+': live Monstrosity action');const before=Object.values(a.pool).reduce((n,v)=>n+v,0);assert.equal(await game.activateAbility(a,action),true);assert.ok(Object.values(a.pool).reduce((n,v)=>n+v,0)<before,source.name+': real Monstrosity payment');if(resolve)await game.resolveTop();return source.meta.oracleMonstrosityX;
}
export async function creatureUpgradeProof(M,entry,operation,role,h){
 const tribute=entry.implementation.find(row=>row.kind==='creature-upgrade-entry-v8'),isEntry=operation.kind==='creature-upgrade-entry-v8';
 let result=0;for(const paid of tribute?(isEntry?[true,false]:[false]):[false]){
 const ctx=h.gameFor(M,[h.decision({chooseCards:(game,q)=>q.prompt?.startsWith('You may cast one of these cards')?q.from.slice(0,1):q.from.slice(0,q.min||0),chooseTargets:(game,q)=>q.candidates.filter(card=>card!==game.players[0]&&card.ctrl!==game.players[0]).slice(0,q.max||q.min||1)}),h.decision({chooseOption:(game,q)=>q.aiHint?.kind==='tribute'?(paid?'yes':'no'):q.options.find(row=>row.key==='yes')?.key||q.options[0]?.key})],{ai:role==='ai'}),{game,a,b}=ctx;
 h.assertControllerRole(M,ctx,entry.raw.name+'/'+role);for(const p of [a,b]){h.fund(p,100);h.fillLibrary(M,p,30);}const enemy=h.permanent(M,game,b,'Grizzly Bears'),ring=h.permanent(M,game,b,'Sol Ring');
 if(entry.raw.name==='Oracle of Bones')h.zoneCard(M,a,'Lightning Bolt','hand');
 const source=h.zoneCard(M,a,entry.raw.name,'hand'),before=Object.values(a.pool).reduce((n,v)=>n+v,0),life=a.life,enemyLife=b.life;
 assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.ok(Object.values(a.pool).reduce((n,v)=>n+v,0)<before);
 if(tribute){assert.equal(source.meta.oracleTributePaid,paid);assert.equal(source.counters['+1/+1']||0,paid?tribute.n:0);
 if(!paid){switch(entry.raw.name){
 case 'Ornitharch':assert.equal(game.bf().filter(c=>c.isToken&&c.hasSub('Bird')&&c.kw('flying')).length,2);break;
 case 'Nessian Demolok':assert.equal(ring.zone,'graveyard');break;
 case 'Pharagax Giant':assert.equal(b.life,enemyLife-5);break;
 case 'Shrike Harpy':assert.equal(enemy.zone,'graveyard');break;
 case 'Siren of the Fanged Coast':assert.equal(enemy.ctrl,a);break;
 case 'Thunder Brute':assert.equal(source.kw('haste'),true);break;
 case 'Snake of the Golden Grove':assert.equal(a.life,life+4);break;
 case 'Fanatic of Xenagos':assert.equal(source.power,Number(entry.raw.power)+1);assert.equal(source.kw('haste'),true);break;
 case 'Nessian Wilds Ravager':assert.equal(enemy.zone,'graveyard');assert.equal(source.damage,2);break;
 case 'Oracle of Bones':assert.ok(a.graveyard.some(c=>c.name==='Lightning Bolt'));assert.ok(b.life<enemyLife||enemy.zone==='graveyard');break;
 default:assert.fail('Unproven Tribute source '+entry.raw.name);}
 }else assert.equal(b.life,enemyLife);
 }else{
 assert.equal(operation.condition?.state,'monstrous');for(const keyword of operation.keywords||[])assert.equal(source.kw(keyword),false);
 await activateUpgrade(M,ctx,source);await h.resolveAll(game);assert.equal(source.meta.oracleMonstrous,true);for(const keyword of operation.keywords||[])assert.equal(source.kw(keyword),true);
 if(operation.defenderCanAttack)assert.equal(game.canAttackAtAll(source),true);
 await game.move(source,'exile');await game.putPermanentOntoBattlefield(source,a);assert.equal(!!source.meta.oracleMonstrous,false);for(const keyword of operation.keywords||[])assert.equal(source.kw(keyword),false);
 }
 result+=6;
 }return result;
}
