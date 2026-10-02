import assert from 'node:assert/strict';

export function stageCommonConditionV21(M,ctx,condition,source,h,truth=true){
 if(!condition)return false;
 const {game,a,b}=ctx;
 if(condition.kind==='common-condition-v21'){
  if(condition.test==='attached-to-creature'){
   if(truth){const host=h.permanent(M,game,a,h.fixtureDefinition('Attachment condition host',['Creature'],{power:'2',toughness:'30'}));source.attachedTo=host.iid;host.attachments.push(source.iid);}else{const host=game.byIid(source.attachedTo);if(host)host.attachments=host.attachments.filter(id=>id!==source.iid);source.attachedTo=null;}
  }else if(condition.test==='top-card'){
   if(truth){const card=h.stageGenericTarget(M,ctx,{...condition.filter,controller:'you'},'top-condition');a.graveyard.splice(a.graveyard.indexOf(card),1);card.zone='library';a.library.push(card);}else while(a.library.length){const card=a.library.pop();card.zone='hand';a.hand.push(card);}
  }else throw Error('Unknown common condition proof '+condition.test);
  game.recalc();
  assert.equal(M.OracleV20.helpers.genericCondition(game,source,condition,a),truth,'actual new condition branch');
  return true;
 }
 if(condition.kind==='opponent-count-range'&&condition.count.kind==='turn-count'){
  for(const player of game.alivePlayers().filter(player=>player!==a))player.turnState[condition.count.field]=truth?(condition.min??condition.max??0):condition.min>0?0:condition.max+1;
  return true;
 }
 if(condition.kind==='count-comparison'&&condition.count.kind==='v8-permanent-count'&&condition.count.test==='source-counter-total'){
  source.counters=truth?{charge:condition.min??condition.max??0}:{charge:condition.min>0?0:condition.max+1};game.recalc();return true;
 }
 if(condition.kind==='count-comparison'&&['hand','library'].includes(condition.count.zone)&&condition.count.what==='card'){
  const zone=condition.count.zone,n=truth?(condition.min??condition.max??0):condition.min>0?condition.min-1:condition.max+1;
  while(a[zone].length>n){const card=a[zone].pop();card.zone=zone==='hand'?'library':'hand';a[card.zone].push(card);}
  while(a[zone].length<n)h.zoneCard(M,a,'Forest',zone);
  return true;
 }
 return false;
}
