(function(){
 'use strict';const M=globalThis.MTG;
 function install(script,operation){
  if(operation.kind==='mechanic-cycling-rule-v8'){
   if(operation.contract!=='mechanic-cycling-rule-v8'||Boolean(operation.prohibited)===Boolean(operation.reduction)||operation.reduction!==undefined&&operation.reduction!==2||operation.prohibited!==undefined&&operation.prohibited!==true||Object.keys(operation).some(key=>!['kind','contract','prohibited','reduction'].includes(key)))throw Error('Invalid cycling rule');
   if(operation.prohibited)script.oracleCyclingProhibited=true;else script.oracleCyclingReduction=operation.reduction;return;
  }
  if(operation.kind!=='mechanic-zone-keyword-cost-v8'||operation.contract!=='mechanic-zone-keyword-cost-v8'||!['cycling','eternalize'].includes(operation.keyword)||!/^(?:\{(?:[0-9]+|[WUBRGC])\})+$/.test(operation.mana)||Object.keys(operation).some(key=>!['kind','contract','keyword','mana','costs','label'].includes(key)))throw Error('Invalid zone keyword cost');
  const cost=operation.costs?.[0];if(operation.costs?.length!==1||!['sacrifice','payLife','discard'].includes(cost?.kind)||cost.quantity&&(cost.quantity.min!==cost.quantity.max||!Number.isSafeInteger(cost.quantity.min)||cost.quantity.min<1)||cost.amount&&(cost.amount.kind!=='number'||!Number.isSafeInteger(cost.amount.value)||cost.amount.value<1))throw Error('Unsupported zone keyword cost');
  const compiled=M.compileOracleAdditionalCosts(operation.costs);
  if(operation.keyword==='cycling'){
   if(script.cycling||cost.kind==='discard')throw Error('Conflicting cycling cost');
   script.cycling={cost:operation.mana,oracleAdditionalCosts:operation.costs,oraclePayment:compiled,label:operation.label};
  }else{
   if(script.gyAbility||cost.kind!=='discard'||cost.quantity.min!==1||cost.object?.qualifier)throw Error('Conflicting Eternalize cost');
   script.oracleEternalize=true;script.gyAbility={label:operation.label,cost:operation.mana,sorcery:true,oracleEternalize:true,extraCost:{discard:1},run:async ctx=>{
    const original=ctx.oracleEternalizeSourceDefinition;if(!original)throw Error('Eternalize lost source definition');
    const definition={...original,cost:'',colorsOverride:['B'],power:'4',toughness:'4',subtypes:[...new Set([...(original.subtypes||[]),'Zombie'])]};
    ctx.oracleEternalizeTokens=await ctx.g.makeTokens(definition,ctx.you,{copyOf:definition});
   }};
  }
 }
 function available(game){return !game.bf().some(card=>card.def.oracleCyclingProhibited&&!card.cur.abilitiesDisabled);}
 M.Game.prototype.cyclingManaCost=function(player,card){
  const d=card.def.cycling,parsed=M.parseCost(typeof d.cost==='function'?d.cost(this,card):d.cost),generic=parsed.generic;
  const discount=this.bf().filter(source=>source.ctrl===player&&!source.cur.abilitiesDisabled).reduce((sum,source)=>sum+(source.def.oracleCyclingReduction||0),0);
  parsed.generic=Math.max(0,generic-discount);parsed.xReduction=(parsed.xReduction||0)+Math.max(0,discount-generic);return parsed;
 };
 M.OracleV8ZoneKeywordCosts={install,available};
})();
