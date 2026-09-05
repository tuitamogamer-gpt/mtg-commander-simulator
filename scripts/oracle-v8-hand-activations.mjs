// Closed hand activations: discarding this exact card is the only nonmana
// cost. A printed discount binds to this activation and uses public state.
const MANA='(?:(?:\\{(?:[0-9]+|X|[WUBRGC]|[WUBRG]/[WUBRG]|2/[WUBRG])\\})+)';
export function extensionLine(card,input,h){
 let line=input.replace(/^Channel — /,'');
 const match=new RegExp('^(?:('+MANA+'), )?Discard this card: (.+)$').exec(line);if(!match)return null;
 let body=match[2],manaAdjustment=null;
 const discount=/ This ability costs \{([1-9][0-9]*)\} less to activate for each legendary creature you control\.$/.exec(body);
 if(discount){
  if(!match[1]||match[1].includes('{X}'))return null;
  const count=h.count('legendary creatures you control');if(!count)return null;
  manaAdjustment={amount:-Number(discount[1]),count};body=body.slice(0,discount.index);
 }
 body=body.replace(/^It /,card.name+' ');
 const parsed=h.effect(card,body);if(!parsed?.effects?.length||parsed.v4Body)return null;
 return {kind:'generic-ability',from:'hand',cost:{mana:match[1]||'{0}',...(manaAdjustment?{manaAdjustment}:{})},...parsed,contract:'generic-activated-effect'};
}

// Paying X for a hand ability cannot bind an unrelated trigger or granted
// ability. Cards with a printed X spell cost retain the older spell/entry
// binding checks; this guard covers the new hand-cost composition specifically.
export function unboundX(card,result){
 if(/\{X\}/.test(card.mana_cost||''))return false;
 const operations=result.implementation||[];
 const hasHandX=value=>!!value&&typeof value==='object'&&(
  value.kind==='generic-ability'&&value.from==='hand'&&/\{X\}/.test(value.cost?.mana||'')||
  Object.values(value).some(value=>Array.isArray(value)?value.some(hasHandX):hasHandX(value)));
 if(!operations.some(hasHandX))return false;
 const visit=(value,bound=false)=>{
  if(value==='X')return !bound;
  if(Array.isArray(value))return value.some(child=>visit(child,bound));
  if(!value||typeof value!=='object')return false;
  if(value.kind==='generic-ability')bound=(!value.from||value.from==='hand')&&/\{X\}/.test(value.cost?.mana||'')||
    !value.from&&value.cost?.oracleCounterPayment?.n==='X'&&value.cost.oracleCounterPayment.self&&value.cost.oracleCounterPayment.kinds?.length===1;
  if(value.kind==='generic-trigger')bound=false;
  return Object.values(value).some(child=>visit(child,bound));
 };
 return operations.some(operation=>visit(operation));
}
