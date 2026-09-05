const trigger=(effects,extra={})=>({kind:'generic-trigger',event:'attacks',eventFilter:'self',targets:[],effects,...extra,contract:'generic-trigger-effect'});
const melee=()=>trigger([{action:'pump',target:'self',power:{kind:'combat-attacked-opponents-v8'},toughness:{kind:'combat-attacked-opponents-v8'},keywords:[]}]);
export function modifierOperation(card,line,h={}){
  const annihilator=/^Annihilator ([1-9][0-9]*)$/.exec(line);
  if(annihilator&&Number.isSafeInteger(Number(annihilator[1])))return trigger([
    {action:'choose-permanents',who:'event-player',operation:'sacrifice',n:Number(annihilator[1]),filter:{what:'permanent',zone:'battlefield',controller:'you',min:1}},
  ],{eventFilter:{kind:'v8-event',subject:'self',playerField:'defender'}});
  if(line==='Provoke')return trigger([
    {action:'combat-restriction',target:0,duration:'combat',restriction:{combatRule:{kind:'source-block',mode:'require'}}},
    {action:'untap',target:0},
  ],{targets:[{what:'creature',zone:'battlefield',controller:'defending-player',min:1}],optional:true});
  if(line==='Melee')return melee();
  const grant=/^(?:As long as (you control your commander), )?(Other creatures|Other Spirits) you control have melee\.$/i.exec(line);
  if(grant){const condition=grant[1]?h.condition?.(grant[1]):null;if(grant[1]&&!condition)return null;
    return {kind:'generic-static',scope:'filtered-permanents',excludeSelf:true,filters:[{what:'creature',zone:'battlefield',controller:'you',min:1,...(grant[2].toLowerCase()==='other spirits'?{subtype:'Spirit'}:{})}],power:0,toughness:0,keywords:[],grantedOperation:melee(),...(condition?{condition}:{}),contract:'generic-continuous-effect'};
  }
  return null;
}
export const extensionLine=modifierOperation;
