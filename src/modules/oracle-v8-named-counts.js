((M)=>{
 const names=M.OracleV8NameGroups.names,matches=M.OracleV8NameGroups.matches;
 const actions=new Set(['named-spell-trigger-v8','named-if-effect-v8']);
 const conditions=new Set(['named-group-size-v8','named-event-unique-v8']);
 function condition(game,source,node,player,capture){
  if(node.kind==='named-group-size-v8'){
   const counts=new Map();
   for(const card of game.bf())if(card.ctrl===player&&(!node.nontoken||!card.isToken)&&(!node.nonland||!card.is('Land'))&&(node.what==='permanent'||card.is(node.what==='land'?'Land':'Artifact'))){
    for(const name of new Set(names(card)))counts.set(name,(counts.get(name)||0)+1);
   }
   return [...counts.values()].some(count=>count>=node.min);
  }
  if(node.kind==='named-event-unique-v8'){
   const card=capture?.eventCard,version=capture?.eventCardZoneVersion;
   if(!card)return false;
   const exact=card.zone==='battlefield'&&card.zoneVersion===version;
   const identity=exact?names(card):names(card.battlefieldLKI?.get(version)||{rulesNames:capture.eventRulesNames||[]});
   return ![...game.creatures(player).filter(other=>other!==card||other.zoneVersion!==version),...player.graveyard.filter(other=>other.is('Creature'))].some(other=>matches(identity,names(other)));
  }
  throw Error('Unknown named condition');
 }
 async function run(ctx,effect,h){
  if(effect.action==='named-if-effect-v8'){
   const target=h.subjects(ctx,effect.target)[0];if(!target||target.zone!=='battlefield'||target.phasedOut)return;
   if(ctx.g.bf().some(other=>other!==target&&matches(names(target),names(other))))for(const child of effect.effects)await h.effect(ctx,child);
   return;
  }
  if(effect.action==='named-spell-trigger-v8'){
   const capture=ctx.oracleSourceCapture,player=capture?.eventPlayer;
   if(!player||player.lost)return;
   const identity=capture.eventRulesNames||[],n=ctx.g.alivePlayers().flatMap(p=>p.graveyard).filter(card=>matches(identity,names(card))).length*(effect.multiply||1);
   const body={gain:{action:'gain-life',who:'event-player',n},discard:{action:'discard',who:'event-player',n},damage:{action:'damage',target:'event-player',n},squirrel:{action:'token-key',tokenKey:'squirrel',who:'event-player',n}}[effect.mode];
   if(!body)throw Error('Unknown named spell trigger');
   return h.effect(ctx,body);
  }
  throw Error('Unknown named effect');
 }
 M.OracleV8NamedCounts={condition,conditions,run,actions};
})(globalThis.MTG||={});
