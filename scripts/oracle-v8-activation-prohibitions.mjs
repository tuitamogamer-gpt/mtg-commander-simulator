// Prohibiting activation leaves printed keywords and triggered abilities intact.
// Nonmana exceptions, selected card names and crew restrictions remain closed.
const base={kind:'attachment-grant',power:0,toughness:0,keywords:[],activationDisabled:true,contract:'attachment-continuous-effect'};
const restriction={cantAttack:true,cantBlock:true,activationDisabled:true};
const targetFor=(helpers,text)=>helpers.target?.(text.toLowerCase().replace(/ your opponents control\b/g,' an opponent controls'));
export function extensionLine(card,line,helpers={}){
  let match=/^(Enchanted|Equipped) (creature|permanent|artifact|land)'s activated abilities can't be activated\.$/.exec(line);
  if(match)return {...base};
  match=/^(Enchanted|Equipped) (creature|permanent|artifact|land) (can't attack or block|can't attack|can't block|doesn't untap during its controller's untap step|gets [+-]\d+\/[+-]\d+),? and its activated abilities can't be activated\.$/.exec(line);
  if(match){const body=match[3],power=/^gets ([+-]\d+)\/([+-]\d+)$/.exec(body);return {...base,
    ...(power?{power:Number(power[1]),toughness:Number(power[2])}:{}),
    ...(body.includes('attack')?{cantAttack:true}:{}),...(body.includes('block')?{cantBlock:true}:{}),...(body.startsWith("doesn't untap")?{skipUntap:true}:{})};}
  match=/^Activated abilities of (artifacts|creatures|enchantments|lands)( you control| your opponents control)? can't be activated\.$/.exec(line);
  if(match){const filter=targetFor(helpers,'target '+match[1].slice(0,-1)+(match[2]||''));if(filter?.zone==='battlefield')return{kind:'generic-static',scope:'filtered-permanents',filters:[filter],activationDisabled:true,contract:'generic-continuous-effect'};}
  return null;
}
export const modifierOperation=extensionLine;
export function extensionEffect(card,line,helpers={}){
  let match=/^Detain (target (?:creature|nonland permanent)(?: an opponent controls| your opponents control)?)\.$/i.exec(line);
  if(match){const target=targetFor(helpers,match[1]);if(target?.zone==='battlefield')return{targets:[target],effects:[{action:'combat-restriction',target:0,restriction:{...restriction},duration:'next-turn'}]};}
  match=/^Detain up to (one|two|three) target (creatures|nonland permanents) your opponents control\.$/i.exec(line);
  if(match){const target=targetFor(helpers,'target '+match[2].slice(0,-1)+' your opponents control');if(target?.zone==='battlefield')return{targets:[{...target,min:0,max:{one:1,two:2,three:3}[match[1].toLowerCase()]}],effects:[{action:'combat-restriction',target:0,restriction:{...restriction},duration:'next-turn'}]};}
  match=/^Detain each nonland permanent your opponents control with mana value (\d+) or less\.$/i.exec(line);
  if(match){const filter=targetFor(helpers,'target nonland permanent your opponents control');if(filter?.zone==='battlefield')return{targets:[],effects:[{action:'combat-restriction',filters:[{...filter,stat:'mv',comparison:'less',threshold:Number(match[1])}],restriction:{...restriction},duration:'next-turn'}]};}
  match=/^(Until your next turn, |Until end of turn, )?(target (?:creature|permanent|artifact|land)(?: an opponent controls| you control)?) (can't attack or block|can't attack|can't block),? and its activated abilities can't be activated( this turn)?\.$/i.exec(line);
  if(match&&!(match[1]&&match[4])&&(match[1]||match[4])){const target=helpers.target?.(match[2].toLowerCase());if(target?.zone==='battlefield')return{targets:[target],effects:[{action:'combat-restriction',target:0,restriction:{activationDisabled:true,...(match[3].includes('attack')?{cantAttack:true}:{}),...(match[3].includes('block')?{cantBlock:true}:{})},duration:match[1]?.startsWith('Until your')?'next-turn':'eot'}]};}
  match=/^(target (?:creature|permanent|artifact|land)(?: an opponent controls| you control)?)'s activated abilities can't be activated this turn\.$/i.exec(line);
  if(match){const target=helpers.target?.(match[1].toLowerCase());if(target?.zone==='battlefield')return{targets:[target],effects:[{action:'combat-restriction',target:0,restriction:{activationDisabled:true},duration:'eot'}]};}
  return null;
}
