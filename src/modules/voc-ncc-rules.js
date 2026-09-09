'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M=MTG, C=M.AFC, G=M.Game.prototype;
  const kinds=cards=>[...new Set(cards.flatMap(c=>[...Object.keys(c.counters||{}).filter(k=>c.counters[k]>0),...(c.poison>0?['poison']:[])]))];
  const attached=(g,c,kind,own=false)=>c.attachments.some(id=>{const a=g.byIid(id);return a?.zone==='battlefield'&&a.hasSub(kind)&&(!own||a.ctrl===c.ctrl);});
  const modified=(g,c)=>kinds([c]).length>0||attached(g,c,'Equipment')||attached(g,c,'Aura',true);
  const attack=(desc,run,extra={})=>({on:'attacks',filter:(g,c,d)=>d.card===c,desc,run,...extra});
  const step=(on,desc,run,extra={})=>({on,filter:C.own,desc,run,...extra});
  const yes=(ctx,prompt,p=ctx.you)=>C.option(ctx,[{key:'yes',label:'Yes'},{key:'no',label:'No'}],prompt,p).then(k=>k==='yes');
  const add=(ctx,c,k,n=1)=>c&&ctx.g.addCounters(c,k,n,false,ctx.you);
  const buff=(ctx,c,p,t,kw=[])=>{if(!c)return;M.E.pumpUntilEOT(ctx.g,c,p,t);if(kw.length)M.E.grantUntilEOT(ctx.g,c,kw);};
  const snapshotBlockers=g=>g.bf().some(c=>c.def.vnTimotharBat)?['a Timothar Bat linked to its exiled Vampire']:[];
  const spirit=(color=['W'],power=1,toughness=1,kw=['flying'])=>({...C.token('Spirit',['Spirit'],power,toughness,color,kw),...(color.length===0?{tokenImageName:'NEC Colorless Spirit'}:color[0]==='R'?{tokenImageName:'NEC Spirit'}:{})});
  const citizen=C.token('Citizen',['Citizen'],1,1,['G','W']);
  const connive=async(ctx,c,n=1)=>{
    const p=c.ctrl,version=c.zoneVersion;if(p.lost)return;
    await ctx.g.draw(p,n,ctx.src);
    const discarded=await C.choose(ctx.g,p,p.hand,Math.min(n,p.hand.length),Math.min(n,p.hand.length),'Connive '+n+': discard cards','addlDiscard');
    const nonland=discarded.filter(c=>!c.is('Land')).length;
    await ctx.g.discard(p,discarded);
    if(c.zone==='battlefield'&&c.zoneVersion===version)add({...ctx,you:p},c,'+1/+1',nonland);
    await ctx.g.emit('connive',{card:c,ctrl:p,n});
  };
  G.connive=function(card,n=1){return connive({g:this,src:card,you:card.ctrl},card,n);};
  const vote=async(ctx,options)=>{
    const votes=[];
    for(const p of ctx.g.apnapFrom(ctx.you)){
      const extra=ctx.g.bf().filter(c=>c.ctrl===p&&C.live(c)&&c.def.vnExtraVote).length;
      const count=extra&&await yes(ctx,'Use additional votes?',p)?1+extra:1;
      for(let i=0;i<count;i++)votes.push({player:p,key:await C.option(ctx,options,'cast your vote',p,'vote')});
    }
    return votes;
  };
  const legalTargets=G.legalTargets;
  G.legalTargets=function(spec,src,p,opts){
    if(!spec.vnPermanentOrPlayer)return legalTargets.call(this,spec,src,p,opts);
    const clean={...spec};delete clean.vnPermanentOrPlayer;
    return [...legalTargets.call(this,{...clean,zone:'battlefield',what:'permanent'},src,p,opts),...legalTargets.call(this,{...clean,what:'player'},src,p,opts)];
  };
  const playerCounter=async(ctx,p,kind)=>{
    if(kind==='energy')await M.OracleV8Energy.gain(ctx.g,p,1,ctx.src);
    else if(kind==='poison')p.poison++;
    else p.counters[kind]=(p.counters[kind]||0)+1;
    ctx.g.note('counter',{p,kind});
  };
  M.VN={...C,snapshotBlockers,kinds,attached,modified,attack,step,yes,add,buff,spirit,citizen,connive,vote,playerCounter};
})();
