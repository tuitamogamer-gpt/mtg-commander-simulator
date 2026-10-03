export function extensionLine(card,line){
 if(/^As .+ enters, choose a number(?: between 1 and 10)?\.$/.test(line))return {kind:'entry-number-v27',min:line.includes('between 1 and 10')?1:0,max:line.includes('between 1 and 10')?10:Number.MAX_SAFE_INTEGER,contract:'entry-number-v27'};
 if(line==="Noncreature spells with mana value equal to the chosen number can't be cast.")return {kind:'chosen-number-casting-ban-v27',contract:'chosen-number-casting-ban-v27'};
 if(line==='Whenever an opponent casts a spell with mana value, power, or toughness equal to the chosen number, that player loses 2 life and you draw a card.')return {kind:'number-cast-trigger-v27',contract:'number-cast-trigger-v27'};
 if(line==='Whenever one or more creatures attack one of your opponents, if any of those creatures have power or toughness equal to the chosen number, this creature deals damage equal to its power to defending player.')return {kind:'number-attack-trigger-v27',contract:'number-attack-trigger-v27'};
 return null;
}
export function finalizeCompilation(card,result){
 if(!result.semanticClass)return result;
 const consumers=result.implementation.some(op=>['chosen-number-casting-ban-v27','number-cast-trigger-v27','number-attack-trigger-v27'].includes(op.kind));
 if(consumers&&!result.implementation.some(op=>op.kind==='entry-number-v27'))return {semanticClass:null,reason:'unbound-chosen-number-v27'};
 return result;
}
