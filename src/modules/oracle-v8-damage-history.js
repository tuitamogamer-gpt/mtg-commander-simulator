((M)=>{
  const key=(iid,version)=>iid+':'+version;
  M.OracleV8DamageHistory={
    record(game,source,target,n,options={}){
      if(!(n>0)||!(source instanceof M.CardInst)||!(target instanceof M.CardInst)||target.zone!=='battlefield')return;
      // A resolving ability can deal damage using its departed source's last
      // battlefield incarnation. Do not credit a later blinked incarnation.
      const snapshot=source._oracleDamageSnapshot||options._damageBatch?.snapshots?.get(source);
      const sourceVersion=snapshot?.zoneVersion??source.zoneVersion;
      let history=game.oracleDamageHistory;
      if(history?.turn!==game.turnNo)history=game.oracleDamageHistory={turn:game.turnNo,bySource:new Map()};
      const identity=key(source.iid,sourceVersion);
      if(!history.bySource.has(identity))history.bySource.set(identity,new Set());
      history.bySource.get(identity).add(key(target.iid,target.zoneVersion));
    },
    damaged(game,source,sourceSnapshot,creature,deathSnapshot,relation){
      if(!['self','attached'].includes(relation))throw new Error('Invalid historical damage source');
      const history=game.oracleDamageHistory;if(history?.turn!==game.turnNo||!creature||!deathSnapshot)return false;
      const iid=relation==='self'?source.iid:(sourceSnapshot?.attachedTo??source.attachedTo);
      const version=relation==='self'?(sourceSnapshot?.zoneVersion??source.zoneVersion):
        (sourceSnapshot?.attachedHostVersion??game.byIid(iid)?.zoneVersion);
      return !!history.bySource.get(key(iid,version))?.has(key(creature.iid,deathSnapshot.zoneVersion));
    },
  };
})(globalThis.MTG||={});
