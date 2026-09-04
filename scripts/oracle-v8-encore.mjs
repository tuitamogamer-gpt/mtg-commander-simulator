export function modifierOperation(card,line){
 if(card.layout&&card.layout!=='normal'||!/\bCreature\b/.test(card.type_line||''))return null;
 const match=/^Encore ((?:\{(?:[0-9]+|[WUBRGC])\})+)$/.exec(line);
 return match?{kind:'mechanic-encore-v8',cost:match[1],contract:'mechanic-encore-v8'}:null;
}
