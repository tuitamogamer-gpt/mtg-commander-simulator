'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.CWW,G=M.Game.prototype,T=M.T;
 const sources=(g,p,key)=>g.bf().filter(c=>(!p||c.ctrl===p)&&C.live(c)&&c.def[key]);
 const historic=c=>c.is('Artifact')||C.legendary(c)||c.hasSub('Saga');
 const historicSpell=(g,c,a={})=>{if(a.faceDownCast||a.adventure)return false;const d=g.castDefinition(c,a);return g.castHasType(c,a,'Artifact')||d.super?.includes('Legendary')||d.subtypes?.includes('Saga');};
 const own=(g,c,d)=>d.player===c.ctrl;
 const trigger=(on,desc,run,extra={})=>({on,desc,run,filter:own,...extra});
 const end=(desc,run,extra={})=>trigger('endStep',desc,run,extra);
 const upkeep=(desc,run,extra={})=>trigger('upkeep',desc,run,extra);
 const combat=(desc,run,extra={})=>trigger('beginCombat',desc,run,extra);
 const subtype=(sub,other=true,dp=1,dt=1,kws=[])=>({apply:(g,c,bf)=>{for(const x of bf)if(x.ctrl===c.ctrl&&(!other||x!==c)&&x.is('Creature')&&x.hasSub(sub)){x.cur.power+=dp;x.cur.toughness+=dt;for(const k of kws)x.cur.kw.add(k);}}});
 const grave=(filter=()=>true,extra={})=>C.grave((g,c,p)=>c.owner===p&&filter(c,g,p),extra);
 const investigate=ctx=>ctx.g.makeTokens(M.TOKENS.clue,ctx.you);
 const dalek=C.registerToken('wlmDalek',C.token('Dalek',['Dalek'],3,3,['B'],['menace'],{types:['Artifact','Creature']}));
 const vampire=C.registerToken('wlmVampire',C.token('Vampire',['Vampire'],1,1,['W'],['lifelink']));
 const demon=C.registerToken('wlmVampireDemon',C.token('Vampire Demon',['Vampire','Demon'],4,3,['W','B'],['flying']));
 const merfolk=C.registerToken('wlmMerfolk',C.token('Merfolk',['Merfolk'],1,1,['U']));
 const draw=(ctx,n=1,p=ctx.you)=>ctx.g.draw(p,Math.max(0,n),ctx.src);
 const discard=async(ctx,p,n=1)=>{const cs=await C.choose(ctx.g,p,p.hand,Math.min(n,p.hand.length),n,'Choose cards to discard','discard');await ctx.g.discard(p,cs);return cs;};
 const villain=async(ctx,p,choices)=>{const times=1+sources(ctx.g,null,'wlmValeyard').filter(c=>c.ctrl!==p).length;for(let i=0;i<times&&!p.lost;i++){const key=await C.option(ctx,choices.map(({key,label})=>({key,label})),'Villainous choice',p,'wlmVillain');const choice=choices.find(c=>c.key===key);if(!choice)throw Error('Invalid villainous choice');await choice.run();await ctx.g.emit('wlmVillainousChoice',{player:p,source:ctx.src,key});}};
 const discover=async(ctx,n)=>{const rows=[];let hit;for(const c of ctx.you.library.slice().reverse()){await ctx.g.move(c,'exile');if(c.zone!=='exile')continue;rows.push(C.row(c));if(!c.is('Land')&&c.mv<=n){hit=c;break;}}if(hit){await C.immediate(ctx,[hit],{filter:(c,g,so)=>g.stackSpellManaValue(so)<=n});if(hit.zone==='exile'&&C.current(rows.at(-1)))await ctx.g.move(hit,'hand');}await C.randomBottom(ctx,rows.filter(C.current).filter(r=>r.card!==hit).map(r=>r.card));};
 const mechanic=(kind,script={},extra={})=>{if(['undying','persist'].includes(kind)){script[kind]=true;if(kind==='persist')(script.triggers||=[]).push(C.death('Persist',async ctx=>{const c=ctx.data.card;if(c.zone==='graveyard'&&c.zoneVersion===ctx.data.graveyardZoneVersion)await ctx.g.putPermanentOntoBattlefield(c,c.owner,{additionalCounters:{'-1/-1':1},additionalCounterBy:ctx.you});},{filter:(g,c,d)=>d.card===c&&!(d.snap.counters['-1/-1']>0)}));return script;}if(kind==='evolve'){(script.triggers||=[]).push(C.enterTrigger('Evolve',ctx=>{const c=C.eventStats(ctx);if(C.same(ctx)&&c&&(c.power>ctx.src.power||c.toughness>ctx.src.toughness))C.add(ctx,ctx.src,'+1/+1');},{filter:(g,c,d)=>d.card!==c&&d.card.ctrl===c.ctrl&&d.card.is('Creature')&&(d.card.power>c.power||d.card.toughness>c.toughness),prepareTargets:C.snapshotEvent}));return script;}if(!M.applyOracleMechanic(script,{kind,...extra}))throw Error('Unavailable mechanic '+kind);return script;};
 const link=async(ctx,cs)=>{if(!C.same(ctx))return;await M.OracleV8Linked.run({...ctx,targets:cs},{action:'linked-exile-until',target:'targets'},{sameSource:C.same,subjects:c=>c.targets});};
 const grantType=(ctx,c,type,expires='object')=>{ctx.g.untilEffects.push({kind:'wlmType',iid:c.iid,zoneVersion:c.zoneVersion,type,expires});ctx.g.recalc();};
 const chooseCounter=async(ctx,c,kinds)=>{const key=await C.option(ctx,kinds.map(key=>({key,label:key+' counter'})),'Choose a counter');if(!kinds.includes(key))throw Error('Invalid counter');C.add(ctx,c,key);};
 const emit=G.emit;G.emit=function(name,d){
  if(name==='cast'&&d.card&&d.so){const p=d.player,st=p.turnState;d.wlmFromElsewhere=d.so.from!=='hand';if(d.wlmFromElsewhere)st.wlmParadox=(st.wlmParadox||0)+1;d.wlmHistoric=historicSpell(this,d.card,d.so.castOpts||{});if(d.wlmHistoric)st.wlmHistoric=(st.wlmHistoric||0)+1;if(this.castHasType(d.card,d.so.castOpts||{},'Artifact')&&!this.castDefinition(d.card,d.so.castOpts||{}).super?.includes('Legendary'))st.wlmNonlegendArtifacts=(st.wlmNonlegendArtifacts||0)+1;}
  if(name==='turnedFaceUp'){d.card.meta.wlmFaceUpTurn=this.turnNo;}
  if(name==='damageToPlayer'&&d.combat&&d.src?.hasSub('Pirate')){const st=d.src.ctrl.turnState,by=st.wlmPirateHits||={};by[d.player.idx]||=[];const key=d.src.iid+':'+d.src.zoneVersion;if(!by[d.player.idx].includes(key))by[d.player.idx].push(key);}
  return emit.call(this,name,d);
 };
 const surveil=M.E.surveil;M.E.surveil=async(g,p,n,opts)=>{for(const c of sources(g,p,'wlmSurveillance'))if(await C.yes({g,you:p,src:c},'Look at two additional cards while surveilling?'))n+=2;const prior=g.wlmSurveilling;g.wlmSurveilling=p;try{return await surveil(g,p,n,opts);}finally{g.wlmSurveilling=prior;}};
 const move=G.move;G.move=async function(c,to,o={}){const from=c.zone,v=c.zoneVersion,by=this.wlmSurveilling;const r=await move.call(this,c,to,o);if(from==='library'&&by&&c.owner===by&&c.zone==='graveyard'&&c.zoneVersion!==v)c.meta.wlmSurveilledTurn=this.turnNo;return r;};
 const explore=M.CDK.explore;M.CDK.explore=async(ctx,c)=>{const n=2**sources(ctx.g,c.ctrl,'wlmTopography').length;for(let i=0;i<n;i++)await explore({...ctx,you:c.ctrl},c);};
 const recalc=G.recalc;G.recalc=function(){const r=recalc.call(this);for(const e of this.untilEffects)if(e.kind==='wlmType'){const c=this.byIid(e.iid);if(c?.zone==='battlefield'&&c.zoneVersion===e.zoneVersion&&!c.cur.subtypes.includes(e.type))c.cur.subtypes.push(e.type);}return r;};
 M.WLM={...C,sources,historic,historicSpell,own,trigger,end,upkeep,combat,subtype,grave,investigate,dalek,vampire,demon,merfolk,draw,discard,villain,discover,mechanic,link,grantType,chooseCounter,win:async ctx=>{if(ctx.g.canWinGame(ctx.you))for(const p of ctx.you.opponents(ctx.g))await ctx.g.playerLoses(p,ctx.src.name);},fight:(ctx,a,b)=>ctx.g.fight(a,b),explore:(ctx,c)=>M.CDK.explore(ctx,c)};
})();
