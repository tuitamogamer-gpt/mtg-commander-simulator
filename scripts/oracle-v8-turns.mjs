// Only complete, explicit phase and turn instructions are admitted. A main-
// phase-relative instruction cannot create a phase when resolving elsewhere.
export function extensionEffect(card,line,h){
 const turn=/^(?:You take|Take|Target player takes|Target opponent takes) an extra turn after this one\.$/.exec(line);
 if(turn){const target=line.startsWith('Target ')?h.target(line.startsWith('Target opponent')?'target opponent':'target player'):null;return{targets:target?[target]:[],effects:[{action:'extra-turn-v8',target:target?0:'you'}]};}
 const phase=/^After this (main |combat )?phase, there (?:is|will be) an additional combat phase( followed by an additional main phase)?\.$/.exec(line);
 if(phase)return{targets:[],effects:[{action:'extra-phase-v8',after:phase[1]?.trim()||'any',phases:phase[2]?['combat','main']:['combat']}]};
 const joined=/^(.+?)(?:,? and|, then) (after this (?:main |combat )?phase, there (?:is|will be) an additional combat phase(?: followed by an additional main phase)?\.)$/.exec(line);
 if(joined){const before=h.effect(card,joined[1]+'.'),after=extensionEffect(card,joined[2][0].toUpperCase()+joined[2].slice(1),h);if(before&&after&&!before.optional)return{...before,effects:[...before.effects,...after.effects]};}
 return null;
}
export function extensionCondition(text){
 if(text==="it's the first combat phase of the turn")return{kind:'combat-ordinal-v8',n:1};
 if(text==="it's your main phase")return{kind:'phase-v8',phase:'main',yourTurn:true};
 if(text==="it's a main phase")return{kind:'phase-v8',phase:'main'};
 return null;
}
