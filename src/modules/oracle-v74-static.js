'use strict';
((M) => {
  const G=M.Game.prototype, H=M.OracleV20.helpers;
  const live=c=>c?.zone==='battlefield'&&!c.phasedOut&&!c.cur?.abilitiesDisabled;
  const sources=(g,mode)=>g.bf().filter(c=>live(c)&&(c.def.oracleLegendStaticsV74||[]).includes(mode));
  const cardTypes=p=>new Set(p.graveyard.flatMap(c=>c.cur?.types||c.def.types));
  const hasAbilities=c=>M.OracleV20Permanents.hasAbilities(c)||(!c.cur?.abilitiesDisabled&&!!c.def.kws?.length);
  const oldSacrifice=G.canSacrifice;
  G.canSacrifice=function(c){
    const so=this.c1516Resolving,frame=this.oracleAnnouncementActorV65;
    const paying=frame&&frame.resolving===so||this.zkAnnouncing;
    if(c&&!this._sbaRunning&&!paying&&so?.ctrl&&so.ctrl!==c.ctrl&&['spell','ability','trigger'].includes(so.kind)&&this.bf().some(s=>live(s)&&s.ctrl===c.ctrl&&s.def.oracleNoOpponentSacrificeV74))return false;
    return oldSacrifice.call(this,c);
  };
  const oldTargets=G.legalTargets;
  G.legalTargets=function(spec,source,player,...args){
    const tomiks=sources(this,'tomik-targets').filter(s=>s.ctrl!==player);
    return oldTargets.call(this,spec,source,player,...args).filter(c=>
      !(tomiks.length&&c instanceof M.CardInst&&c.is('Land')&&['battlefield','graveyard'].includes(c.zone)));
  };
  const landForbidden=(g,p,c)=>c?.zone==='graveyard'&&c.is('Land')&&sources(g,'tomik-lands').some(s=>s.ctrl!==p);
  const oldLands=G.playableLands,oldPlay=G.playLand;
  G.playableLands=function(p,...args){return oldLands.call(this,p,...args).filter(c=>!landForbidden(this,p,c));};
  G.playLand=async function(p,c,...args){if(landForbidden(this,p,c))return false;return oldPlay.call(this,p,c,...args);};
  const oldPool=G.emptyPool;
  G.emptyPool=function(...args){
    const active=sources(this,'yurlok').length>0,before=this.players.map(p=>Object.values(p.pool).reduce((n,x)=>n+x,0));
    const result=oldPool.apply(this,args);
    if(active)for(const [i,p] of this.players.entries()){
      const lost=before[i]-Object.values(p.pool).reduce((n,x)=>n+x,0);
      if(lost>0)void this.loseLife(p,lost,'Yurlok — unspent mana');
    }
    return result;
  };
  G.grantNoMaximumHandSizeV74=function(p){p.noMaxHandForever=true;p.noMaxHandTimestampV74=this.nextOracleTimestamp();};
  const reduceHand=G.reduceMaximumHandSizeV64;
  G.reduceMaximumHandSizeV64=function(p,n){reduceHand.call(this,p,n);if(n)(p.maximumHandSizeEffectsV74||=[]).push({n:-n,timestamp:this.nextOracleTimestamp()});};
  const oldHand=G.maximumHandSize;
  G.maximumHandSize=function(p){
    if(p.lost)return Infinity;
    const winters=sources(this,'winter').filter(c=>c.ctrl!==p&&cardTypes(c.ctrl).size>=4);
    if(!winters.length)return oldHand.call(this,p);
    // CR 613.11 applies setters, unlimited sizes, and additions in timestamp
    // order. An older unlimited size or modifier does not override Winter.
    const effects=[],add=(timestamp,n,set=false)=>effects.push({timestamp:timestamp||0,n,set});
    const reductions=p.maximumHandSizeEffectsV74||[],recorded=-reductions.reduce((n,e)=>n+e.n,0);
    const legacy=Math.max(0,(p.maximumHandSizeReductionV64||0)-recorded);if(legacy)add(0,-legacy);
    for(const e of reductions)add(e.timestamp,e.n);
    if(p.noMaxHandForever)add(p.noMaxHandTimestampV74,Infinity,true);
    for(const c of this.bf())if(live(c)){
      const time=c.timestamp;
      if(c.ctrl===p&&(typeof c.def.noMaxHand==='function'?c.def.noMaxHand(this,c):c.def.noMaxHand))add(time,Infinity,true);
      if(c.def.wlmNoHandLimit)add(time,Infinity,true);
      if(c.ctrl===p&&c.cur.pomNoMaxHand)add(c.cur.pomNoMaxHandTimestampV74??time,Infinity,true);
      if(c.ctrl===p&&c.def.bdfHandSize!==undefined)add(time,c.def.bdfHandSize,true);
      if(c.ctrl===p&&c.def.oracleHandSizeSetV21){const rule=c.def.oracleHandSizeSetV21;add(time,rule.count?H.genericCount(this,c,p,rule.count):rule.n,true);}
      for(const rule of c.def.oracleHandSizeRules||[]){
        if(rule.activeV20&&!rule.activeV20(this,c)||rule.who==='you'&&c.ctrl!==p||rule.who==='opponents'&&c.ctrl===p)continue;
        add(time,rule.unlimited?Infinity:rule.n||0,!!rule.unlimited);
      }
    }
    for(const e of p.emblems)if(e.oracleNoHandLimitV20)add(e.timestamp,Infinity,true);
    for(const e of this.untilEffects)if(e.kind==='no-max-hand-v55'&&e.ctrl===p)add(e.oracleLayerTimestamp??e.timestamp,Infinity,true);
    for(const c of winters)add(c.timestamp,7-cardTypes(c.ctrl).size,true);
    let value=7;for(const e of effects.sort((a,b)=>a.timestamp-b.timestamp))value=e.set?e.n:value+e.n;
    return Math.max(0,value);
  };
  const oldCanAttack=G.canAttackTarget;
  G.canAttackTarget=function(c,target){
    if(target instanceof M.CardInst&&target.is('Planeswalker')&&target.cur.extraStaticAbilitiesV66.some(row=>row.mode==='tomik-attacks-v74')&&
       this.creatures(c.ctrl).some(other=>other!==c&&other.attacking===target))return false;
    return oldCanAttack.call(this,c,target);
  };
  M.OracleV74Static={
    unspentMana(g,p,n){if(n>0&&sources(g,'yurlok').length)return g.loseLife(p,n,'Yurlok — unspent mana');},
    lethalThreshold:(g,c)=>sources(g,'zilortha').some(s=>s.ctrl===c.ctrl)?Math.max(0,c.power):c.toughness,
    ignoreLegend:(g,list)=>list.every(c=>c.name==='Brothers Yamazaki')&&g.bf().filter(c=>c.name==='Brothers Yamazaki').length===2&&sources(g,'brothers-legend').length>0,
    pruneAttackers(g,attackers){const seen=new Set();for(let i=0;i<attackers.length;i++){const c=attackers[i],t=c.attacking;if(t instanceof M.CardInst&&t.is('Planeswalker')&&t.cur.extraStaticAbilitiesV66.some(row=>row.mode==='tomik-attacks-v74')){if(seen.has(t)){c.attacking=null;attackers.splice(i--,1);}else seen.add(t);}}},
  };
  M.OracleV20.handlers.push({
    compile(op,script,entry,h){
      if(op.kind==='opponent-sacrifice-ban-v74'){script.oracleNoOpponentSacrificeV74=true;return true;}
      if(op.kind!=='legend-static-extra-v74')return false;
      if(op.mode==='thelon-ability'){
        h.abilities.push({label:entry.raw.name+' — add spore counters',cost:{mana:'{B}{G}'},pomCost:{zone:'graveyard',to:'exile',filter:(g,c)=>c.hasSub('Fungus')},
          run:async ctx=>{for(const c of ctx.g.bf().filter(c=>c.hasSub('Fungus')))ctx.g.addCounters(c,'spore',1,false,ctx.you);}});
        return true;
      }
      if(op.mode==='haktos-choice'){const prior=script.asEnters;script.asEnters=async(g,c)=>{await prior?.(g,c);c.meta.haktosV74={version:c.zoneVersion,number:2+Math.floor(g.rnd()*3)};};}
      if(op.mode==='thelon-pump')h.statics.push({phase:2,apply:(g,s,bf)=>{for(const c of bf)if(c.is('Creature')&&c.hasSub('Fungus')){const n=c.counters.spore||0;c.cur.power+=n;c.cur.toughness+=n;}}});
      if(op.mode==='captain'){script.playerHexproof=(g,s)=>s.counters.shield>0;h.statics.push({phase:5,apply:(g,s,bf)=>{if(s.counters.shield>0)for(const c of bf)if(c!==s&&c.ctrl===s.ctrl&&c.hasSub('Hero'))c.cur.kw.add('hexproof');}});}
      if(op.mode==='tomik-attacks')h.statics.push({phase:5,apply:(g,s,bf)=>{for(const c of bf)if(c.ctrl===s.ctrl&&c.is('Planeswalker'))c.cur.extraStaticAbilitiesV66.push({mode:'tomik-attacks-v74'});}});
      if(op.mode==='jasmine')h.statics.push({phase:5,apply:(g,s,bf)=>{for(const c of bf)if(c.ctrl===s.ctrl&&c.is('Creature')&&!hasAbilities(c)){const prior=c.cur.cantBeBlockedBy;c.cur.cantBeBlockedBy=(game,blocker)=>!!prior?.(game,blocker)||hasAbilities(blocker);}}});
      if(op.mode==='brothers-pump')h.statics.push({phase:2,apply:(g,s,bf)=>{for(const c of bf)if(c!==s&&c.name==='Brothers Yamazaki'&&c.is('Creature')){c.cur.power+=2;c.cur.toughness+=2;c.cur.kw.add('haste');}}});
      if(op.mode==='haktos-protection')h.statics.push({phase:5,apply:(g,s)=>{const row=s.meta.haktosV74;if(row?.version===s.zoneVersion)s.cur.protectionFrom.push((game,origin)=>origin&&origin.mv!==row.number);}});
      (script.oracleLegendStaticsV74||=[]).push(op.mode);return true;
    },
    target(g,c,p,s,v){if(v.kind==='plus-counter-v74')return (c.counters?.['+1/+1']||0)>0;if(v.kind==='no-abilities-v74')return !hasAbilities(c.card||c);},
    async effect(ctx,e){if(e.action!=='legend-static-effect-v74')return false;if(e.mode==='others-mana'){for(const p of ctx.g.alivePlayers())if(p!==ctx.you)await H.runGenericEffect({...ctx,you:p},{action:'add-mana',produce:{B:1,R:1,G:1}});return true;}throw Error('Unknown static legend effect '+e.mode);},
    drawReplacements(g,p){
      if(g.phase==='draw'&&g.turnPlayer===p&&!(p.turnState.c1920DrawStepN||0))return [];
      return sources(g,'reed').filter(s=>s.ctrl===p&&s.meta.reedV74!==g.turnNo).map(src=>({key:'reed-v74:'+src.iid+':'+src.zoneVersion,src,operation:{mode:'reed-v74'}}));
    },
    async applyDrawReplacement({g,player,src,operation,draw}){
      if(operation.mode!=='reed-v74')return undefined;
      src.meta.reedV74=g.turnNo;
      let n=0;for(let i=0;i<4;i++)n+=await draw(player);return n;
    },
  });
})(globalThis.MTG||={});
