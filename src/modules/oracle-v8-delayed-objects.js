((M)=>{
  const actions=new Set(['delayed-objects-v8','delayed-create-v8']);
  const row=card=>({iid:card.iid,version:card.zoneVersion,zone:card.zone});
  function candidates(ctx,capture,h){
    if(capture.kind==='tokens')return ctx.g.battlefield.filter(card=>card.zone==='battlefield');
    if(capture.kind==='subjects')return h.subjects(ctx,capture.target).filter(card=>card.zone===capture.from);
    if(capture.kind==='zone')return ctx.you[capture.from].slice();
    if(capture.kind==='battlefield')return ctx.g.bf().filter(card=>capture.filters.some(filter=>h.filter(filter,card)));
    throw new Error('Unsupported delayed object capture');
  }
  async function run(ctx,effect,h){
    if(effect.action==='delayed-create-v8'){
      ctx.g.delayed.push({on:effect.event,once:true,ctrl:ctx.you,src:ctx.src,name:ctx.src.name+' — delayed token',oracleOperation:effect,
        run:next=>h.run(next,effect.effects)});return;
    }
    let locked=[];
    for(let i=0;i<effect.effects.length;i++){
      const before=i===effect.capture.index?candidates(ctx,effect.capture,h).map(row):[];
      await h.effect(ctx,effect.effects[i]);
      if(i!==effect.capture.index)continue;
      if(effect.capture.kind==='tokens'){
        const prior=new Set(before.map(row=>row.iid));
        locked=ctx.g.battlefield.filter(card=>card.zone==='battlefield'&&card.isToken&&!prior.has(card.iid)).map(row);
      }else{
        locked=before.flatMap(old=>{const card=ctx.g.byIid(old.iid);return card&&card.zone===effect.capture.zone&&card.zoneVersion===old.version+(effect.capture.moved?1:0)?[row(card)]:[];});
      }
    }
    if(effect.haste){
      const identities=locked.map(({iid,version})=>({iid,version}));
      ctx.g.untilEffects.push({kind:'pump',expires:effect.haste==='eot'?'eot':'never',locked:identities,
        apply:(_g,battlefield)=>{for(const card of battlefield)if(identities.some(id=>id.iid===card.iid&&id.version===card.zoneVersion))card.cur.kw.add('haste');}});
      ctx.g.recalc();
    }
    if(!locked.length)return;
    const controller=ctx.you.idx;
    ctx.g.delayed.push({on:effect.event,once:true,ctrl:ctx.you,src:ctx.src,name:ctx.src.name+' — '+effect.operation,oracleOperation:effect,locked,
      ...(effect.player==='you'?{filter:(_g,data)=>data.player?.idx===controller}:{}),
      run:async next=>{
        const cards=locked.flatMap(id=>{const card=next.g.byIid(id.iid);return card&&card.zone===id.zone&&card.zoneVersion===id.version?[card]:[];});
        if(effect.operation==='sacrifice')await next.g.sacrificeMany(next.you,cards.filter(card=>card.ctrl===next.you));
        else if(effect.operation==='exile')await next.g.exileMany(cards);
        else if(effect.operation==='return')await next.g.withBattlefieldEntryBatch(async()=>{for(const card of cards)if(!card.owner.lost&&!card.isToken)await next.g.putPermanentOntoBattlefield(card,card.owner,{tapped:!!effect.tapped});});
        else throw new Error('Unsupported delayed object operation');
      }});
  }
  M.OracleV8DelayedObjects={actions,run};
})(globalThis.MTG||={});
