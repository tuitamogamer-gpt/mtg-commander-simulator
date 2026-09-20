import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {context,put,settle} from './oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
function choose(player,handler){const prior=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>{const answer=handler(g,q);return answer===undefined?prior(g,q):answer;};}
function fund(player){for(const color of ['W','U','B','R','G','C'])player.pool[color]=30;}
export async function handVisibilityProofV17(M,entry,op,role){
 const f=context(M,role,2),{game,a}=f;fund(a);for(const player of game.players)put(M,game,player,'Grizzly Bears','hand');
 const source=put(M,game,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);
 const expected=game.players.filter(player=>op.players==='all'||(player===a)===(op.players==='you')).flatMap(player=>player.hand);
 assert.deepEqual(Array.from(game.revealedHandCardsV17(),card=>card.iid),Array.from(expected,card=>card.iid));
 for(const viewer of game.players){const view=M.onlineArenaView(game,viewer);const shown=view.revealedCards.handV17;assert.equal(shown.length,expected.length);const objects=[...view.objects,...view.players.flatMap(player=>player.hand||[])];for(const id of shown)assert.ok(objects.some(card=>card.token===id&&card.name==='Grizzly Bears'&&!card.hidden));}
 await game.move(source,'exile');assert.equal(game.revealedHandCardsV17().length,0);assertGameStateInvariants(game);return 8;
}
export async function visibilityProofV17(M,entry,op,role){
 if(!M.UI)runInNewContext(readFileSync(new URL('../../src/modules/ui.js',import.meta.url),'utf8'),{MTG:M,document:{readyState:'loading',addEventListener(){}},window:{addEventListener(){}},console,setTimeout,clearTimeout,localStorage:{getItem(){return null;},setItem(){}}});
 const f=context(M,role),{game,a,b}=f;fund(a);const source=put(M,game,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);
 for(const viewer of [a,b])for(const owner of [a,b]){
  const expected=op.scope==='all'||owner===a&&(op.scope==='public'||viewer===a);
  const view=M.onlineArenaView(game,viewer).players.find(row=>row.idx===owner.idx);
  assert.equal(!!view.libraryTop,expected,entry.raw.name+': scoped multiplayer visibility');
  const ui={me:viewer,libraryTopSources:M.UI.prototype.libraryTopSources};assert.equal(!!M.UI.prototype.visibleLibraryTop.call(ui,game,owner),expected,entry.raw.name+': scoped Solo visibility');
 }
 await game.move(source,'exile');assert.equal(M.onlineArenaView(game,a).players.some(row=>row.libraryTop),false);assertGameStateInvariants(game);return 11;
}
export async function exileCastProofV17(M,entry,op,role){
 const {game,a,b}=context(M,role);fund(a);const source=put(M,game,a,entry.raw.name,'exile');
 assert.equal(game.hasExilePlayPermission(b,source),false);game.phase='combat';assert.equal(game.castableList(a).some(row=>row.card===source),false);game.phase='main1';
 const action=game.castableList(a).find(row=>row.card===source&&row.from==='exile');assert.ok(action);const before=Object.values(a.pool).reduce((n,x)=>n+x,0);
 assert.equal(await game.castSpell(a,source,{from:'exile',alt:action.alt}),true);assert.ok(Object.values(a.pool).reduce((n,x)=>n+x,0)<before);await settle(game);assert.equal(source.zone,'battlefield');
 await game.move(source,'exile');assert.equal(game.hasExilePlayPermission(a,source),true);assertGameStateInvariants(game);return 8;
}
export async function untapLimitProofV17(M,entry,op,role){
 const f=context(M,role),{game,a,b}=f;fund(a);const source=put(M,game,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);
 const name=op.filter.what==='artifact'?'Ornithopter':op.filter.what==='creature'?'Grizzly Bears':op.filter.nonbasic?'Command Tower':'Forest';
 const cards=Array.from({length:4},()=>put(M,game,a,name));for(const c of cards)c.tapped=true;
 choose(a,(g,q)=>q.aiHint?.kind==='finaleUntap'&&role==='human'?q.from.slice(0,q.max):undefined);
 await game.runBeginningPhase(a);await settle(game);assert.equal(cards.filter(c=>!c.tapped).length,op.n);
 for(const c of cards)c.tapped=true;
 if(op.untapped)source.tapped=true;else await game.move(source,'exile');
 await game.runBeginningPhase(a);await settle(game);assert.equal(cards.filter(c=>!c.tapped).length,4);assertGameStateInvariants(game);return 6;
}
export async function playerAuraProofV17(M,entry,op,role){
 const f=context(M,role,2),{game,a,b,others}=f;fund(a);const own=put(M,game,a,'Craw Wurm'),enemy=put(M,game,b,'Craw Wurm');
 for(let i=0;i<3;i++)put(M,game,b,'Forest','graveyard');for(let i=0;i<2;i++)put(M,game,b,'Forest','hand');
 choose(a,(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:undefined);choose(b,(g,q)=>q.aiHint?.kind==='oracleUnlessPayment'?'no':undefined);
 const source=put(M,game,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);assert.equal(source.meta.cursedPlayer,b);assert.equal(source.attachedTo,null);
 if(op.kind==='aura-target'){assert.equal(game.spellTargetSpecs(put(M,game,a,entry.raw.name,'hand'),{},a)[0].filter(game,own,a,source),false);return 4;}
 if(op.kind==='generic-static'){
  assert.equal(enemy.power,6+op.power);assert.equal(enemy.toughness,4+op.toughness);assert.equal(own.power,6);await game.move(source,'exile');assert.equal(enemy.power,6);return 5;
 }
 if(op.kind==='spell-limit-v8'){
  for(const player of [a,b]){fund(player);game.turnPlayer=player;const first=put(M,game,player,'Grizzly Bears','hand');assert.equal(await game.castSpell(player,first,{from:'hand'}),true);await settle(game);const second=put(M,game,player,'Grizzly Bears','hand');assert.equal(game.canCastTiming(player,second),player===a);}
  await game.move(source,'exile');assert.equal(game.canCastTiming(b,put(M,game,b,'Grizzly Bears','hand')),true);return 7;
 }
 assert.equal(op.kind,'generic-trigger');
 const before={library:b.library.length,hand:b.hand.length,exile:b.exile.length,life:b.life};
 if(op.event==='combatDamageToPlayer'){
  game.combat={attackers:[own],blockersDeclared:true};own.attacking=others[1];await game.combatDamage(a,'normal');await settle(game);assert.equal(own.counters['+1/+1']||0,0);own.attacking=b;await game.combatDamage(a,'normal');await settle(game);assert.equal(own.counters['+1/+1'],1);
 }else{
  await game.emit(op.event,{player:others[1]});await game.flushTriggers();assert.equal(game.stack.length,0);
  await game.emit(op.event,{player:b});await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===source));await game.move(source,'exile');await settle(game);
  const effect=op.effects[0];
  if(effect.action==='mill')assert.equal(b.library.length,before.library-effect.n);
  else if(effect.action==='draw')assert.equal(b.hand.length,before.hand+effect.n);
  else if(effect.action==='discard-hand')assert.equal(b.hand.length,0);
  else if(effect.action==='zone-select')assert.equal(b.exile.length,before.exile+effect.n);
  else if(effect.action==='unless-cost-v14')assert.equal(b.life,before.life-effect.effects[0].n);
  else assert.fail('Missing player Aura witness '+effect.action);
 }
 assertGameStateInvariants(game);return 8;
}
