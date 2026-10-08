'use strict';
((M)=>{
  const H=M.OracleV20.helpers,G=M.Game.prototype;
  const lock=c=>({card:c,version:c.zoneVersion}),current=r=>r.card.zone==='battlefield'&&r.card.zoneVersion===r.version;
  const partners=(g,c)=>[...new Set([...(c.blockedBy||[]),...(c.blocking?[g.byIid(c.blocking)]:[])].filter(x=>x?.zone==='battlefield'&&x.is('Creature')))];
  const matches=(g,s,d,test)=>{
    if(test==='own-elemental-ability'){const view=d.stackObject?.ctx?.sourceLkiEvidenceV10?.snapshot||d.stackObject?.ctx?.sourceSnapshot||d.card;return d.player===s.ctrl&&(view?.hasSub?.('Elemental')||view?.subtypes?.includes('Elemental')||view?.changeling);}
    if(test==='no-colored-mana')return ['W','U','B','R','G'].every(color=>!(d.so?.paymentColorCounts?.[color]>0));
    if(test==='first-multicolor')return d.player.turnState.spellsCastList.filter(row=>row.colors.length>1).length===1&&d.player.turnState.spellsCastList.findLast(row=>row.so===d.so)?.colors.length>1;
    throw Error('Unknown v42 event qualifier '+test);
  };
  async function yes(ctx,player,prompt){const answer=await player.controller.decide(ctx.g,{type:'chooseOption',prompt:ctx.src.name+': '+prompt,options:[{key:'yes',label:'Yes'},{key:'no',label:'No'}],aiHint:{kind:'confirm',src:ctx.src}});if(!['yes','no'].includes(answer))throw Error('Invalid v42 choice');return answer==='yes';}
  const history=G.recordDamageResult;G.recordDamageResult=function(src,target,n,opts){if(n>0&&target instanceof M.CardInst){if(target.meta.oracleDamageReceivedV42?.turn!==this.turnNo||target.meta.oracleDamageReceivedV42.version!==target.zoneVersion)target.meta.oracleDamageReceivedV42={turn:this.turnNo,version:target.zoneVersion,n:0};target.meta.oracleDamageReceivedV42.n+=n;}return history.call(this,src,target,n,opts);};
  const cost=G.spellCost;G.spellCost=function(p,c,a={}){const out=cost.call(this,p,c,a),discount=a.faceDownCast?this.untilEffects.filter(row=>row.kind==='oracleFaceDownDiscountV42'&&row.player===p).length:0;if(!discount)return out;const raw=out.generic-(out.xReduction||0)-discount;return {...out,generic:Math.max(0,raw),xReduction:Math.max(0,-raw)};};
  M.OracleV20.handlers.push({
    condition(g,s,c,p){if(c.kind==='own-draw-step-v42')return g.turnPlayer===p&&g.phase==='draw';},
    compile(op,script,entry,h){
      if(op.kind==='type-count-boost-v42'){h.statics.push({apply:(g,s,bf)=>{for(const c of bf)if(c.ctrl===s.ctrl&&c.is('Creature')&&!c.hasSub('Human')){const n=Math.min(10,[...M.CREATURE_SUBTYPES].filter(type=>c.hasSub(type)).length);c.cur.power+=n;c.cur.toughness+=n;}}});return true;}
      if(op.kind==='domain-landwalk-v42'){h.statics.push({apply:(g,s)=>{for(const type of ['Plains','Island','Swamp','Mountain','Forest'])if(g.lands(s.ctrl).some(c=>c.hasSub(type)))s.cur.kw.add(type.toLowerCase()+'walk');}});return true;}
      if(op.kind==='small-land-shroud-v42'){h.statics.push({apply:(g,s,bf)=>{for(const c of bf)if(c.is('Land')&&c.cur.super.includes('Basic')&&g.lands(c.ctrl).length<=3)c.cur.kw.add('shroud');}});return true;}
      if(op.kind!=='generic-trigger'||!op.eventTestV42&&!op.captureAttackersV42&&!op.effects?.some(e=>e.mode==='combat-partners-counters'))return false;
      const t=h.compileGenericTrigger(op),filter=t.filter,run=t.run,captures=new WeakMap();
      t.filter=(g,s,d)=>{if(!filter(g,s,d)||op.eventTestV42&&!matches(g,s,d,op.eventTestV42))return false;let rows=captures.get(d);if(!rows){rows=new Map();captures.set(d,rows);}rows.set(s.iid,{...(op.captureAttackersV42?{attackerRowsV42:(d.attackers||[]).map(lock)}:{}),...(op.effects?.some(e=>e.mode==='combat-partners-counters')?{partnerRowsV42:partners(g,s).map(lock)}:{})});return true;};
      t.run=ctx=>{ctx.oracleExtraCaptureV42=captures.get(ctx.data)?.get(ctx.src.iid)||{};return run(ctx);};
      h.triggers.push(t);return true;
    },
    amount(v,ctx){
      if(v.kind==='all-life-lost-v42')return ctx.g.players.reduce((n,p)=>n+(p.turnState.lifeLost||0),0);
      if(v.kind==='damage-received-v42'){const c=H.genericEffectSubjects(ctx,v.target)[0],r=c?.meta.oracleDamageReceivedV42;return r?.turn===ctx.g.turnNo&&r.version===c.zoneVersion?r.n:0;}
    },
    target(g,c,you,s,p){if(p.kind==='has-fading-v42')return !!c.def.oracleFadingV42&&!c.cur.abilitiesDisabled;if(p.kind==='not-snow-v42')return !c.cur.super.includes('Snow');},
    targetHint(e){if(e.action==='common-effects-v42')return {goal:'buff'};},
    async effect(ctx,e){
      if(e.action!=='common-effects-v42')return false;
      const g=ctx.g,cards=H.genericEffectSubjects(ctx,e.target),run=(effects,targets=ctx.targets)=>H.runGenericEffects({...ctx,targets},effects,true),same=()=>H.sameBattlefieldSource(ctx);
      switch(e.mode){
        case 'opponent-deathtouch':for(const p of cards){const from=g.creatures(p);if(!from.length)continue;const chosen=await p.controller.decide(g,{type:'chooseCards',from,min:1,max:1,prompt:ctx.src.name+': choose a creature for a deathtouch counter',aiHint:{kind:'buff',src:ctx.src}});if(!Array.isArray(chosen)||chosen.length!==1||!from.includes(chosen[0]))throw Error('Invalid deathtouch choice');g.addCounters(chosen[0],'deathtouch',1,false,p);}break;
        case 'unattach-equipment':for(const c of cards)if(c.hasSub('Equipment'))M.C1516.detach(g,c);break;
        case 'next-spell-discount':(ctx.you.tempReductions ||= []).push({delta:-1,once:true,filter:()=>true});break;
        case 'destroy-spell-value':{const mv=ctx.oracleSourceCapture.eventSpellMvV10;if(!Number.isFinite(mv))throw Error('Missing captured spell mana value');await g.destroyMany(g.bf().filter(c=>c.mv===mv));break;}
        case 'keyword-duration':for(const c of cards)g.addOracleAnimation(c,{types:[],subtypes:[],keywords:e.remove?[]:[e.keyword],...(e.remove?{removeKeywords:[e.keyword]}:{}),retainTypes:true,retainAllSubtypes:true,temporary:false});break;
        case 'counter-choice':{const answer=await ctx.you.controller.decide(g,{type:'chooseOption',prompt:'Choose a counter',options:[{key:'toughness',label:'+0/+1 counter'},{key:'power',label:'+1/+0 counter'}],aiHint:{kind:'confirm',src:ctx.src}});if(!['toughness','power'].includes(answer))throw Error('Invalid counter type');for(const c of cards)g.addCounters(c,answer==='toughness'?'+0/+1':'+1/+0',1,false,ctx.you);break;}
        case 'discard-draw':{
          const before=ctx.you.turnState.discardedN||0,choices=[];
          for(const p of g.apnapFrom(g.turnPlayer||ctx.you)){if(!p.hand.length)continue;const from=p.hand.slice(),picked=await p.controller.decide(g,{type:'chooseCards',from,min:1,max:1,prompt:ctx.src.name+': discard a card',aiHint:{kind:'discard',src:ctx.src}});if(!Array.isArray(picked)||picked.length!==1||!from.includes(picked[0]))throw Error('Invalid simultaneous discard');choices.push({player:p,cards:picked});}
          await g.withGraveyardEntryBatch(async()=>{for(const group of choices)await g.discard(group.player,group.cards);});if((ctx.you.turnState.discardedN||0)>before)await g.draw(ctx.you,1);break;
        }
        case 'suspect-or-grow':if(same()){if(ctx.src.meta.suspected)g.addCounters(ctx.src,'+1/+1',1,false,ctx.you);else M.E.suspect(g,ctx.src);}break;
        case 'all-equipment':if(same())for(const c of g.bf().filter(c=>c.hasSub('Equipment')))await run([{action:'attach-v9',attachment:0,target:'self'}],[c]);break;
        case 'choose-source-type':if(same())await run([{action:'choose-subtype-v10',exclude:[],effects:[{action:'animate',target:'self',types:[],subtypes:[{kind:'chosen-subtype-v10'}],keywords:[],retainTypes:true,replaceCreatureSubtypes:true,temporary:false}]}]);break;
        case 'snow-status':for(const c of cards)g.addOracleAnimation(c,{types:[],subtypes:[],keywords:[],retainTypes:true,retainAllSubtypes:true,...(e.snow?{addSuperV20:['Snow']}:{removeSuperV42:['Snow']}),temporary:false});break;
        case 'caster-opponents-draw':for(const p of g.apnapFrom(g.turnPlayer||ctx.you).filter(p=>p!==ctx.oracleSourceCapture.eventPlayer))if(!e.optional||await yes(ctx,p,'Draw a card?'))await g.draw(p,1);break;
        case 'caster-pay-draw':{const p=ctx.oracleSourceCapture.eventPlayer;if(g.canPayMana(p,M.parseCost('{2}'),null)&&await yes(ctx,p,'Pay {2} to draw a card?')&&await g.payMana(p,M.parseCost('{2}'),null))await g.draw(p,1);break;}
        case 'face-down-discount':g.untilEffects.push({kind:'oracleFaceDownDiscountV42',expires:'eot',player:ctx.you});break;
        case 'repeat-incubate':{const n=H.genericAmount(e.n,ctx);for(let i=0;i<n;i++)await M.BOM.incubate(ctx,e.size);break;}
        case 'transform-incubator':for(const c of cards)if(c.isToken&&c.zone==='battlefield'&&M.OracleV8Faces.physical(c)?.layout==='transform')await H.runGenericEffects({...ctx,src:c,sourceZoneVersion:c.zoneVersion},[{action:'transform-self'}],true);break;
        case 'attackers-indestructible':await run([{action:'pump',target:0,power:0,toughness:0,keywords:['indestructible']}],[(ctx.oracleExtraCaptureV42.attackerRowsV42||[]).filter(current).map(r=>r.card)]);break;
        case 'combat-partners-counters':for(const r of ctx.oracleExtraCaptureV42.partnerRowsV42||[])if(current(r))g.addCounters(r.card,'-0/-2',1,false,ctx.you);break;
        default:throw Error('Unknown v42 effect '+e.mode);
      }g.recalc();return true;
    }
  });
})(globalThis.MTG ||= {});
