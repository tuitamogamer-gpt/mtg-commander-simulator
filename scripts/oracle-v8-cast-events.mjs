// Final fallback only: existing cast descriptors keep their frozen shape.
const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
function rule(text,h){
 const actor=/^(you cast|an opponent casts|a player casts) (.+)$/.exec(text);if(!actor)return null;
 const result={kind:'qualified-cast-v8',controller:actor[1]==='you cast'?'you':actor[1]==='an opponent casts'?'opponent':'any'};
 let noun=actor[2];
 const targeted=/ that targets you or a creature you control$/.exec(noun);if(targeted){result.targetsYouOrCreature=true;noun=noun.slice(0,targeted.index);}
 const turn=/ during (your main phase|your turn|an opponent's turn)$/.exec(noun);
 if(turn){result.timing=turn[1]==='your main phase'?'your-main':turn[1]==='your turn'?'your-turn':'opponent-turn';noun=noun.slice(0,turn.index);}
 const from=/ from (anywhere other than (?:your|their) hand|your library|your graveyard|exile)$/.exec(noun);
 if(from){result.from=from[1].startsWith('anywhere')?'not-hand':from[1]==='exile'?'exile':from[1]==='your library'?'library':'graveyard';
  if(result.from!=='exile')result.zoneOwner=from[1].includes('their')?'caster':'source';noun=noun.slice(0,from.index);}
 const pair=/ that's both (white|blue|black|red|green) and (white|blue|black|red|green)$/.exec(noun);
 if(pair){if(pair[1]===pair[2])return null;result.colors=[colors[pair[1]],colors[pair[2]]];noun=noun.slice(0,pair.index);}
 const mana=/ with \{X\} in its mana cost$/.exec(noun);if(mana){result.manaX=true;noun=noun.slice(0,mana.index);}
 if(!/^an? .+/.test(noun))return null;
 const target=h.target('target '+noun.replace(/^an? /,''));if(!target||target.what!=='spell'||target.zone!=='stack')return null;
 if(target.withKeyword&&target.withKeyword!=='flying'||target.withoutKeyword)return null;
 result.target=target;return result;
}
export function extensionLine(card,line,h){
 const self=/^When you cast this spell, (.+)$/.exec(line);
 if(self){const body=h.effect(card,self[1]);return body?{kind:'generic-trigger',event:'cast',eventFilter:'self',zone:'stack',...body,contract:'generic-trigger-effect'}:null;}
 const opening=/^Whenever (.+)$/.exec(line);if(!opening)return null;
 for(const split of opening[1].matchAll(/, /g)){
  const filter=rule(opening[1].slice(0,split.index),h);if(!filter)continue;
  const body=h.effect(card,opening[1].slice(split.index+2));
  // Generic event-card values currently model battlefield LKI. They cannot
  // stand in for a spell's chosen face/X after it has left the Stack.
  if(!body||/event-card-stat|event-card-counters/.test(JSON.stringify(body)))return null;
  return {kind:'generic-trigger',event:'cast',eventFilter:filter,...body,contract:'generic-trigger-effect'};
 }
 return null;
}
