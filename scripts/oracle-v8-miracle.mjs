export function modifierOperation(card,line){
 if(card.layout&&card.layout!=='normal')return null;
 const match=/^Miracle ((?:\{(?:[0-9]+|[WUBRGCX])\})+)$/.exec(line);
 return match?{kind:'mechanic-miracle-v8',cost:match[1],contract:'mechanic-miracle-v8'}:null;
}
