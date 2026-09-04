export function extensionLine(card,line,h){
 const limited=line.endsWith(' This ability triggers only once each turn.');
 const text=limited?line.slice(0,-' This ability triggers only once each turn.'.length):line;
 let event,filter,bodyText,condition;
 let m=/^Whenever you (surveil|scry or surveil)( for the first time each turn)?, (.+)$/.exec(text);
 if(m){event=m[1]==='surveil'?'surveil':['scry','surveil'];filter={kind:'observed-player-v8',first:!!m[2]};bodyText=m[3];}
 m=/^Whenever you (gain life|lose life|gain or lose life)( for the first time each turn| for the first time during each of your turns| during your turn)?, (.+)$/.exec(text);
 if(m){event=m[1]==='gain life'?'lifeGain':m[1]==='lose life'?'lifeLost':['lifeGain','lifeLost'];filter={kind:'observed-player-v8',first:!!m[2]?.includes('first time'),yourTurn:!!m[2]?.includes('your turn')};bodyText=m[3];}
 m=/^Whenever a creature you control explores(?: a (land|nonland) card)?, (.+)$/.exec(text);
 if(m){event='explored';filter={kind:'observed-explore-v8',...(m[1]?{land:m[1]==='land'}:{})};bodyText=m[2];}
 m=/^Whenever you become the monarch, (.+)$/.exec(text);
 if(m){event='monarchChanged';filter={kind:'observed-player-v8'};bodyText=m[1];}
 m=/^At the beginning of (your second main phase|each of your postcombat main phases), (.+)$/.exec(text);
 if(m){event='postcombatMain';filter={kind:'observed-player-v8',...(m[1]==='your second main phase'?{mainOrdinal:2}:{})};bodyText=m[2];
  const branch=/^if (.+?), (.+)$/.exec(bodyText);if(branch){condition=h.condition(branch[1]);if(!condition)return null;bodyText=branch[2];}
 }
 if(!event)return null;
 const body=h.effect(card,bodyText);if(!body||/event-card|event-player/.test(JSON.stringify(body)))return null;
 return {kind:'generic-trigger',event,eventFilter:filter,...body,...(condition?{condition}:{}),...(limited?{onceEachTurn:true,onceGroup:line}:{}),contract:'generic-trigger-effect'};
}
