export function extensionLine(card,line){
  if(line==='Ripple 4')return {kind:'ripple-v8',scope:'self',n:4,contract:'ripple-cast-chain'};
  if(line==='Spells you cast have ripple 4.'&&!/\b(?:Instant|Sorcery|Land)\b/.test(card.type_line||''))return {kind:'ripple-v8',scope:'your-spells',n:4,contract:'ripple-cast-chain'};
  return null;
}
