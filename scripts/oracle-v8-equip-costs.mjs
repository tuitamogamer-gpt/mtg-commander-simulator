import {ORACLE_SUBTYPES} from './oracle-subtypes.mjs';
const MANA='(?:\\{(?:0|[1-9][0-9]*|[WUBRGC])\\})+';
const targetBase={what:'creature',zone:'battlefield',controller:'you',min:1};
function target(noun){
 if(noun==='creature token')return{...targetBase,token:true};
 if(noun==='commander')return{...targetBase,commander:true};
 if(noun==='legendary creature')return{...targetBase,legendary:true};
 const types=noun.split(/,? or |, /);if(!types.length||types.some(type=>!ORACLE_SUBTYPES.has(type)))return null;
 return types.length===1?{...targetBase,subtype:types[0]}:{...targetBase,alternatives:types.map(subtype=>({...targetBase,subtype}))};
}
export function modifierOperation(card,line,h){
 const self=[card.name,card.name?.split(/,| the /)[0],'this creature'].filter(Boolean).map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
 const reduction=new RegExp('^Equip abilities you activate( that target (?:'+self+'))?( of other Equipment)? cost \\{([1-9][0-9]*)\\} less to activate\\.$').exec(line);
 if(reduction){if(reduction[1]&&reduction[2])return null;return{kind:'mechanic-equip-reduction-v8',n:Number(reduction[3]),scope:reduction[1]?'target-self':reduction[2]?'other-equipment':'all',contract:'mechanic-equip-reduction-v8'};}
 if(!/\bEquipment\b/.test(card.type_line||''))return null;
 let text=line,onceEachTurn=false;
 if(/ Activate only once each turn\.$/.test(text)){onceEachTurn=true;text=text.replace(/ Activate only once each turn\.$/,'');}
 let match=new RegExp('^Equip (.+) ('+MANA+')$').exec(text),cost,chosenTarget=targetBase;
 if(match){chosenTarget=target(match[1]);if(!chosenTarget)return null;cost={mana:match[2]};}
 else if((match=new RegExp('^Equip ('+MANA+')\\. This ability costs \\{([1-9][0-9]*)\\} less to activate if (.+)\\.$').exec(text))){
  const condition=h.condition(match[3]);if(!condition)return null;cost={mana:match[1],manaAdjustment:{amount:-Number(match[2]),condition}};
 }else if((match=new RegExp('^Equip ('+MANA+')\\. This ability costs \\{X\\} less to activate, where X is the power of the creature it targets\\.$').exec(text))){cost={mana:match[1],oracleEquipPowerReduction:true};}
 else if((match=/^Equip—(.+)\.$/.exec(text))){
  const phrase=match[1].replace(/this Equipment/g,'this artifact');cost=h.cost(phrase);
  if(cost?.rmCounter)cost={...cost,oracleCounterPayment:{n:cost.rmCounter.n||1,kinds:[cost.rmCounter.kind||cost.rmCounter],self:true,among:false}};
  if(cost?.rmCounter)delete cost.rmCounter;
  if(!cost||Object.keys(cost).some(key=>!['mana','life','discard','sacWhat','sacOther','sacN','sacFilter','oracleCounterPayment'].includes(key)))return null;
  cost={mana:'{0}',...cost};
 }else return null;
 return{kind:'generic-ability',oracleEquip:true,label:line,cost,targets:[chosenTarget],effects:[{action:'attach-source',target:0}],sorceryOnly:true,...(onceEachTurn?{onceEachTurn:true}:{}),contract:'generic-activated-effect'};
}
