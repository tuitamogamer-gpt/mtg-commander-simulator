(() => {
  const M=globalThis.MTG,V=M.OracleV20,H=V.helpers;
  V.handlers.push({
    condition(game,source,node,player) {
      if(node.kind!=='common-condition-v21')return undefined;
      if(node.test==='attached-to-creature') {const host=game.byIid(source.attachedTo);return source.zone==='battlefield'&&host?.zone==='battlefield'&&host.is('Creature');}
      if(node.test==='top-card') {
        const card=player.library.at(-1);if(!card)return false;
        // The descriptor is a card-quality predicate; the library object is
        // presented to its public-zone equivalent without revealing it.
        const view=Object.assign(Object.create(card),{zone:'graveyard'});
        return H.genericTargetSpec(node.filter,[],0).filter(game,view,player,source);
      }
      throw Error('Unknown common condition '+node.test);
    },
  });
})();
