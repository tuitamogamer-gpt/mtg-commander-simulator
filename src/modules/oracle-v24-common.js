 'use strict';
((M)=>{
 const G=M.Game.prototype,H=M.OracleV20.helpers;
 const records=(g,c)=>c.zone==='battlefield'?g.untilEffects.filter(e=>e.kind==='oracleAnimation'&&e.iid===c.iid&&e.zoneVersion===c.zoneVersion&&e.oracleLicidEndCostV24):[];
 const active=(g,c)=>records(g,c).at(-1);
 const epic=(g,p)=>g.untilEffects.some(e=>e.kind==='oracleEpicV24'&&e.player===p);
 const list=G.activatableList;G.activatableList=function(p,...args){const rows=list.call(this,p,...args);for(const c of this.bf())if(c.ctrl===p&&!c.phasedOut){for(const r of records(this,c))if(this.canPayMana(p,M.parseCost(r.oracleLicidEndCostV24),{card:c,isSpecialAction:true}))rows.push({card:c,oracleLicidEndV24:true,idx:'licid-end-'+r.timestamp,ability:{label:'End Licid effect',cost:{mana:r.oracleLicidEndCostV24},aiScore:(g,c,p)=>{const host=g.byIid(c.attachedTo);return !host||g.stack.some(so=>so.targets?.flat().includes(host))?12:-12;}},label:'End Licid effect ('+r.oracleLicidEndCostV24+')',version:c.zoneVersion,timestamp:r.timestamp});}return rows;};
 const activate=G.activateAbility;G.activateAbility=async function(p,entry,...args){if(!entry.oracleLicidEndV24)return activate.call(this,p,entry,...args);const c=entry.card,r=records(this,c).find(r=>r.timestamp===entry.timestamp);if(!r||c.ctrl!==p||c.phasedOut||entry.version!==c.zoneVersion||entry.timestamp!==r.timestamp||this.priorityState&&this.priorityState.holder!==p)return false;if(!await this.payMana(p,M.parseCost(r.oracleLicidEndCostV24),{card:c,isSpecialAction:true}))return false;if(!records(this,c).includes(r))throw Error('Licid identity changed during special action');this.untilEffects=this.untilEffects.filter(e=>!(e.kind==='oracleAnimation'&&e.iid===c.iid&&e.zoneVersion===r.zoneVersion&&e.timestamp===r.timestamp));this.recalc();if(!active(this,c)){delete c.meta.oracleBestowTarget;M.C1516.detach(this,c);}this.recalc();await this.checkSBA();return true;};
 const castable=G.castableList;G.castableList=function(p,...args){return epic(this,p)?[]:castable.call(this,p,...args);};
 const cast=G.castSpell;G.castSpell=async function(p,...args){return epic(this,p)?false:cast.call(this,p,...args);};
 M.OracleV24Common={active,records,epic};
 M.OracleV20.handlers.push({commonV24:true,compile(op,script,entry,h){
  if(op.kind==='mechanic-licid-v24'){
   const target={what:'creature',zone:'battlefield',controller:'any',min:1};
   const ability=h.compileGenericAbility({kind:'generic-ability',label:'Become an Aura ('+op.cost+')',cost:{mana:op.cost,tap:true},targets:[target],effects:[{action:'licid-transform-v24',target:0,endCost:op.endCost}]});
   ability.cond=(g,c)=>!active(g,c);ability.oracleLicidV24=true;h.abilities.push(ability);script.oracleLicidV24=op;return true;
  }
  if(op.kind!=='spell-epic-v24')return false;
  const base={...entry.raw,...h.compileOracleScript(h.batch,{...entry,...op.body})};for(const key of ['targets','prepareTargets','modes','cantCounter','castCond','xValues'])if(base[key]!==undefined)script[key]=base[key];
  script.resolve=async ctx=>{await base.resolve(ctx);const id=ctx.g.oracleEpicSerialV24=(ctx.g.oracleEpicSerialV24||0)+1;
   ctx.g.untilEffects.push({kind:'oracleEpicV24',expires:'game',id,player:ctx.you,spell:{...ctx.so,copyRoot:ctx.so.copyRoot||ctx.so,targets:ctx.so.targets.slice(),castOpts:{...ctx.so.castOpts},oracleDefinition:base}});
   ctx.g.delayed.push({on:'upkeep',once:false,src:ctx.src,ctrl:ctx.you,name:ctx.src.name+' — Epic',filter:(g,d,row)=>d.player===row.ctrl,
    run:async next=>{const record=next.g.untilEffects.find(e=>e.kind==='oracleEpicV24'&&e.id===id);if(record)await next.g.copySpell(record.spell,next.you,{oracleDefinition:record.spell.oracleDefinition,mayNewTargets:true});}});
  };return true;
 },async effect(ctx,effect,h){
  if(effect.action==='search-target-library-v24'){
   const owner=h.genericEffectSubjects(ctx,effect.target)[0];if(!(owner instanceof M.Player)||owner.lost)return true;
   const n=effect.quantity==='hand-count'?ctx.you.hand.length:effect.quantity,candidates=ctx.g.searchableLibrary(ctx.you,owner).filter(card=>!effect.types||effect.types.some(type=>card.is(type))),versions=new Map(candidates.map(c=>[c,c.zoneVersion])),min=effect.types?0:Math.min(n,candidates.length);
   const selected=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:candidates,min,max:Math.min(n,candidates.length),search:true,prompt:'Search '+owner.name+"'s library",aiHint:{kind:effect.destination==='battlefield'?'recur':'exileTarget',source:ctx.src}});
   if(!Array.isArray(selected)||selected.length<min||selected.length>n||new Set(selected).size!==selected.length||selected.some(c=>!candidates.includes(c)))throw Error('Invalid targeted library search');
   for(const card of selected)if(card.zone==='library'&&card.zoneVersion===versions.get(card)&&owner.library.includes(card)){if(effect.destination==='battlefield')await ctx.g.putPermanentOntoBattlefield(card,ctx.you);else await ctx.g.move(card,effect.destination);}
   M.shuffle(owner.library,ctx.g.rnd);return true;
  }
  if(effect.action==='exile-until-nonland-hit-v24'){
   let value=null;while(ctx.you.library.length){const card=ctx.you.library.at(-1);await ctx.g.move(card,'exile');if(card.zone==='exile'&&!card.is('Land')){value=card.mv;break;}if(ctx.you.library.at(-1)===card)break;}
   if(value!==null)await h.runGenericEffects(ctx,[{action:'damage',target:effect.target,n:value}]);return true;
  }
  if(effect.action!=='licid-transform-v24')return false;
  const target=h.genericEffectSubjects(ctx,effect.target)[0];if(!h.sameBattlefieldSource(ctx)||!target||target.zone!=='battlefield'||!target.is('Creature'))return true;
  ctx.g.addOracleAnimation(ctx.src,{types:['Enchantment'],subtypes:['Aura'],retainTypes:false,keywords:[],colors:null,temporary:false,oracleLicidEndCostV24:effect.endCost});
  ctx.src.meta.oracleBestowTarget=h.genericTargetSpec({what:'creature',zone:'battlefield',controller:'any',min:1});
  if(target!==ctx.src)await ctx.g.attach(ctx.src,target);return true;
 }});
})(MTG);
