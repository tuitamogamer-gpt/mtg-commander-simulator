const MANA='(?:\\{(?:0|[1-9][0-9]*|[WUBRGC])\\})+';

export function modifierOperation(card,line){
 if(card.layout&&card.layout!=='normal'||!/(?:^| )(?:Instant|Sorcery)(?: |$)/.test(card.type_line||''))return null;
 const match=new RegExp('^Awaken ([1-9][0-9]*)—('+MANA+')$').exec(line);
 if(!match||!Number.isSafeInteger(Number(match[1])))return null;
 // Modal target assembly and duplicate awaken instances need their own
 // announcement adapter. Never drop another instance or a printed clause.
 const text=card.oracle_text||card.oracle||'';
 if((text.match(/^Awaken /gm)||[]).length!==1||/Choose (?:one|two|three|four|any number)\b/.test(text))return null;
 return{kind:'mechanic-awaken-v8',n:Number(match[1]),cost:match[2],contract:'mechanic-awaken-v8'};
}
