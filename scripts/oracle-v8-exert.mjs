const esc=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function extensionLine(card,line,h){
 const self='(?:this creature|'+[...new Set([card.name,card.name.split(/,| the /)[0]])].map(esc).join('|')+')';
 const option=new RegExp('^You may exert '+self+' as (?:it|he) attacks\\.(?: When you do, (.+))?$').exec(line);
 if(option){
  if(!option[1])return {kind:'exert-attack-v8',contract:'exert-attack'};
  const text=option[1].replace(/^(?:it|he) /,card.name+' ').replace(/\bto it this turn\b/,'to '+card.name+' this turn').replace(/ and you scry (\d+)\.$/,'. Scry $1.').replace(/ until end of turn and can't be blocked /,' until end of turn. '+card.name+" can't be blocked ");
  const body=h.effect(card,text[0].toUpperCase()+text.slice(1));if(!body?.effects?.length||body.v4Body)return null;
  return {kind:'exert-attack-v8',body,contract:'exert-attack'};
 }
 const watch=/^Whenever you exert a creature, (.+)$/.exec(line);
 if(watch){const body=h.effect(card,watch[1][0].toUpperCase()+watch[1].slice(1));if(!body?.effects?.length||body.v4Body)return null;return {kind:'generic-trigger',event:'exerted',eventFilter:{kind:'exerted-creature-v8',controller:'you'},...body,contract:'generic-trigger-effect'};}
 return null;
}
