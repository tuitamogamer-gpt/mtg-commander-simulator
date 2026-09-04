const numbers={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
export function extensionLine(card,line){
 if(line==='Players have no maximum hand size.')return {kind:'hand-size-v8',who:'all',unlimited:true,contract:'generic-continuous-effect'};
 const match=/^(Your|Each opponent's) maximum hand size is (increased|reduced) by (one|two|three|four|five|six|seven|eight|nine|ten|\d+)\.$/.exec(line);
 return match?{kind:'hand-size-v8',who:match[1]==='Your'?'you':'opponents',n:(numbers[match[3]]??Number(match[3]))*(match[2]==='reduced'?-1:1),contract:'generic-continuous-effect'}:null;
}
export function extensionEffect(card,line,h){
 if(line.includes('\n'))return null;
 const exact='You have no maximum hand size for the rest of the game.';
 if(line===exact||line===exact[0].toLowerCase()+exact.slice(1))return {targets:[],effects:[{action:'no-hand-limit-v8',who:'you'}]};
 const tail=/^(.+\.) You have no maximum hand size for the rest of the game\.$/.exec(line);
 if(tail){const body=h.effect(card,tail[1]);if(body&&!body.optional&&!body.v4Body)return {...body,effects:[...body.effects,{action:'no-hand-limit-v8',who:'you'}]};}
 const head=/^You have no maximum hand size for the rest of the game\. (.+)$/.exec(line);
 if(head){const body=h.effect(card,head[1]);if(body&&!body.optional&&!body.v4Body)return {...body,effects:[{action:'no-hand-limit-v8',who:'you'},...body.effects]};}
 return null;
}
