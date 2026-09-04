// Forecast's reminder text is stripped by rulesCore normalization. The
// keyword itself supplies the own-upkeep and once-per-object-per-turn rules.
export function extensionLine(card,line,h={}){
 const match=/^Forecast — (.+), Reveal this (?:card|creature) from your hand: (.+)$/.exec(line);
 if(!match||typeof h.effect!=='function'||typeof h.line!=='function')return null;
 const parsed=h.line(card,match[1]+': '+match[2]);
 if(parsed?.kind!=='generic-ability'||parsed.from||parsed.modalBody||parsed.loyalty!==undefined||parsed.optional||parsed.onceEachTurn||parsed.oncePerObject)return null;
 const cost=parsed.cost||{};
 if(JSON.stringify(parsed).includes('"X"'))return null;
 if(Object.keys(cost).some(key=>!['mana','tapFilter','tapN'].includes(key)))return null;
 if(cost.mana!==undefined&&!/^(?:\{(?:[0-9]+|[WUBRGC])\})+$/.test(cost.mana))return null;
 if(cost.mana&&cost.tapFilter)return null;
 if(cost.tapFilter&&(!Number.isSafeInteger(cost.tapN)||cost.tapN<1||cost.tapN>10||cost.tapFilter.zone!=='battlefield'||cost.tapFilter.controller!=='you'))return null;
 return{...parsed,from:'hand',forecast:true,label:'Forecast',contract:'generic-activated-effect'};
}
export const modifierOperation=extensionLine;
