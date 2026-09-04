// Public activation changes who may activate the printed ability; its source
// stays the same permanent and every cost is paid by the activating player.
export function extensionLine(card,line,h){
 const match=/^(.*) Any player may activate this ability( but only as a sorcery)?\.$/.exec(line);
 if(!match||/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return null;
 const parsed=h.line(card,match[1]+(match[2]?' Activate only as a sorcery.':''));
 if(parsed?.kind!=='generic-ability'||parsed.from||parsed.modalBody||parsed.v4Body||parsed.loyalty!==undefined||parsed.onceEachTurn||parsed.oncePerObject)return null;
 const cost=parsed.cost||{};
 if(Object.keys(cost).some(key=>!['mana','discard','sacWhat','sacN'].includes(key)))return null;
 if(cost.mana!==undefined&&(typeof cost.mana!=='string'||!/^(?:\{(?:[0-9]+|[WUBRGC])\})+$/.test(cost.mana)))return null;
 if(cost.discard!==undefined&&(!Number.isSafeInteger(cost.discard)||cost.discard<1))return null;
 if(cost.sacWhat!==undefined&&cost.sacWhat!=='land')return null;
 if(cost.sacN!==undefined&&(!Number.isSafeInteger(cost.sacN)||cost.sacN<1))return null;
 return {...parsed,anyPlayer:true,contract:'public-activated-ability-v8'};
}
