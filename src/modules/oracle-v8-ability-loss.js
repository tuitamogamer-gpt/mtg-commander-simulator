// Layer-six removal is separate from activation restrictions: abilities
// granted after the removal can still be activated and can still trigger.
'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
  function change(card,effect){
    if(effect.types)card.cur.types=effect.types.slice();
    if(effect.subtypes){
      card.cur.subtypes=effect.retainSubtypes?[...new Set(card.cur.subtypes.concat(effect.subtypes))]:card.cur.subtypes.filter(type=>!MTG.CREATURE_SUBTYPES.has(type)).concat(effect.subtypes);
      if(!effect.retainSubtypes){card.cur.allCreatureTypes=false;card.cur.allCreatureTypesFromOtherEffects=false;card.cur.suppressPrintedChangeling=true;}
      if(effect.types)card.cur.subtypes=card.cur.subtypes.filter(type=>MTG.CREATURE_SUBTYPES.has(type)||effect.types.includes('Artifact')&&type==='Equipment');
    }
    if(effect.colors)card.cur.colors=effect.retainColors?[...new Set(card.cur.colors.concat(effect.colors))]:effect.colors.slice();
  }
  const hasType=effect=>!!(effect.types||effect.subtypes||effect.colors);
  function compile(operation,helpers){
    const starts=new WeakMap();
    const chosen=source=>{const row=starts.get(source);return row?.cur===source.cur?row.cards:[];};
    const descriptor={phase:1,oracleAbilityLoss:true,oracleOperation:operation,startedType:hasType(operation),chosen,
      apply(game,source,bf){
        const cards=operation.attached?bf.filter(card=>card.iid===source.attachedTo):operation.own?[source]:bf.filter(card=>operation.filters.some(filter=>helpers.target(filter).filter(game,card,source.ctrl,source)));
        const affected=cards.filter(card=>!operation.condition||helpers.condition(game,operation.conditionSubject==='affected'?card:source,operation.condition,source.ctrl));
        starts.set(source,{cur:source.cur,cards:affected});
        if(hasType(operation))for(const card of affected)change(card,operation);
      }};
    return [descriptor,{phase:7,continuesAfterType:true,apply(game,source){if(!descriptor.applied?.has(source.cur))return;for(const card of chosen(source)){if(operation.power!==undefined)card.cur.basePower=operation.power;if(operation.toughness!==undefined)card.cur.baseToughness=operation.toughness;}}},
      {phase:2,continuesAfterType:true,apply(game,source){if(!descriptor.applied?.has(source.cur))return;for(const card of chosen(source)){card.cur.power+=operation.dp||0;card.cur.toughness+=operation.dt||0;if(operation.cantAttack)card.cur.cantAttack=true;if(operation.cantUntap)card.cur.cantUntap=true;}}}];
  }
  function add(game,cards,effect){
    const timestamp=game.nextOracleTimestamp();
    for(const card of new Set(cards))if(card.zone==='battlefield')game.untilEffects.push({...effect,kind:'oracleAbilityLoss',iid:card.iid,zoneVersion:card.zoneVersion,timestamp,expires:effect.temporary?'eot':'object'});
    game.recalc();
  }
  function begin(game,bf,force=false){
    const records=game.untilEffects.filter(row=>row.kind==='oracleAbilityLoss'&&bf.some(card=>card.iid===row.iid&&card.zoneVersion===row.zoneVersion));
    const statics=bf.flatMap(source=>(source.def.statics||[]).filter(row=>row.oracleAbilityLoss).map(descriptor=>({source,descriptor,timestamp:source.timestamp})));
    if(!force&&!records.length&&!statics.length&&!bf.some(card=>(card.def.statics||[]).some(row=>row.oracleLegacyAbilityLoss)))return null;
    let timestamp=0,applied=false;
    const states=new Map();
    const arrayKeys=['extraAbilities','extraTriggers','extraMana','extraWards','protectionFrom'];
    for(const card of bf){
      const cur=card.cur,kw=cur.kw,stamps=new Map([...kw].map(key=>[key,-Infinity])),removed=new Map(),grants=new Map();
      const add=kw.add,del=kw.delete,clear=kw.clear;
      const allowed=()=>!applied||timestamp>=(cur.oracleAbilityLossTimestamp??-Infinity);
      Object.defineProperties(kw,{
        add:{configurable:true,value:function(key){if(allowed()&&timestamp>=(removed.get(key)??-Infinity)){stamps.set(key,Math.max(stamps.get(key)??-Infinity,timestamp));add.call(this,key);}return this;}},
        delete:{configurable:true,value:function(key){removed.set(key,Math.max(removed.get(key)??-Infinity,timestamp));if(timestamp<(stamps.get(key)??-Infinity))return false;stamps.delete(key);return del.call(this,key);}},
        clear:{configurable:true,value:function(){stamps.clear();return clear.call(this);}}
      });
      const arrays=[];
      for(const key of arrayKeys){const list=cur[key],push=list.push;Object.defineProperty(list,'push',{configurable:true,value:function(...values){for(const value of values)grants.set(value,timestamp);return push.apply(this,values);}});arrays.push(list);}
      states.set(card,{stamps,del,grants,arrays,flags:[]});
    }
    const at=(value,run)=>{const old=timestamp;timestamp=value??0;try{return run();}finally{timestamp=old;}};
    function apply(){
      const rows=statics.map(row=>({...row,cards:row.descriptor.chosen(row.source),effect:row.descriptor.oracleOperation})).concat(records.map(effect=>({cards:bf.filter(card=>card.iid===effect.iid&&card.zoneVersion===effect.zoneVersion),effect,timestamp:effect.timestamp})));
      // Removing an ability on a source makes pure layer-six statics depend
      // on that removal. An effect already begun in layer four continues.
      const pending=rows.slice();
      for(const row of statics)row.descriptor.applied=new WeakSet();
      while(pending.length){
        const independent=pending.filter(row=>!row.source||row.descriptor.startedType||!pending.some(other=>other!==row&&other.cards.includes(row.source)));
        const row=(independent.length?independent:pending).sort((a,b)=>a.timestamp-b.timestamp)[0];
        pending.splice(pending.indexOf(row),1);
        if(row.source?.cur.abilitiesDisabled&&!row.descriptor.startedType)continue;
        if(row.descriptor)row.descriptor.applied.add(row.source.cur);
        for(const card of row.cards){
          const cur=card.cur;
          cur.abilitiesDisabled=true;cur.oracleAbilityLossTimestamp=Math.max(cur.oracleAbilityLossTimestamp??-Infinity,row.timestamp);
        }
      }
      applied=true;
      for(const [card,state]of states){
        const cur=card.cur,loss=cur.oracleAbilityLossTimestamp;
        if(loss!==undefined){
          for(const [key,stamp]of state.stamps)if(stamp<loss)state.del.call(cur.kw,key);
          cur.wardCost=null;cur.hexproof=false;cur.shroud=false;
          for(const key of arrayKeys)cur[key]=cur[key].filter(value=>(state.grants.get(value)??-Infinity)>=loss);
        }
        for(const key of arrayKeys){const list=cur[key],push=list.push;Object.defineProperty(list,'push',{configurable:true,value:function(...values){return timestamp>=(cur.oracleAbilityLossTimestamp??-Infinity)?push.apply(this,values):this.length;}});state.arrays.push(list);}
        for(const key of ['hexproof','shroud','wardCost']){let value=cur[key];Object.defineProperty(cur,key,{configurable:true,enumerable:true,get:()=>value,set:next=>{if(!next||timestamp>=(cur.oracleAbilityLossTimestamp??-Infinity))value=next;}});state.flags.push(key);}
      }
      for(const row of rows)if(!row.descriptor||row.descriptor.applied?.has(row.source.cur))at(row.timestamp,()=>{for(const card of row.cards)for(const keyword of row.effect.keywords||[])card.cur.kw.add(keyword);});
    }
    function finish(){for(const [card,state]of states){for(const key of ['add','delete','clear'])delete card.cur.kw[key];for(const list of state.arrays)delete list.push;for(const key of state.flags)Object.defineProperty(card.cur,key,{value:card.cur[key],writable:true,configurable:true,enumerable:true});}}
    return {at,apply,finish,records,suppressPrinted(card){const state=states.get(card);for(const [key,stamp]of state?.stamps||[])if(stamp===-Infinity)state.del.call(card.cur.kw,key);}};
  }
  MTG.OracleV8AbilityLoss={compile,add,begin,change};
})();
