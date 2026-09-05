const escape=text=>String(text).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const self=card=>'(?:this (?:creature|permanent)|'+[...new Set([card.name,card.name.split(/,| the /)[0]])].map(escape).join('|')+')';
export function extensionCondition(text){
 if(/^(?:this creature|this permanent) is monstrous$/.test(text))return {kind:'creature-upgrade-state-v8',state:'monstrous'};
 if(text==="tribute wasn't paid")return {kind:'creature-upgrade-state-v8',state:'tribute-unpaid'};
 return null;
}
export function extensionEffect(card,line,h){
 if(/^Destroy all artifacts and creatures other than this creature\.$/i.test(line))return {effects:[{action:'battlefield-group',operation:'destroy',filters:['artifact','creature'].map(what=>({what,zone:'battlefield',controller:'any',min:1,excludeSelf:true})),noRegen:false}],targets:[],optional:false};

 let match=/^Monstrosity (\d+|X)\.$/.exec(line);
 if(match)return {effects:[{action:'monstrosity-v8',n:match[1]==='X'?'X':Number(match[1])}],targets:[],optional:false};
 if(line==='Monstrosity X, where X is the number of counters among creatures you control.')return {effects:[{action:'monstrosity-v8',n:{kind:'creature-counter-total-v8'}}],targets:[],optional:false};
 return null;
}
export function extensionLine(card,line,h){
 const source=self(card);let m;
 if(line==="As long as this creature is monstrous, it has trample and can attack as though it didn't have defender.")return {kind:'generic-static',scope:'self',keywords:['trample'],defenderCanAttack:true,condition:extensionCondition('this creature is monstrous'),contract:'generic-continuous-effect'};
 if(line==="When this creature enters, if tribute wasn't paid, you may have this creature fight another target creature.")return {kind:'generic-trigger',event:'etb',eventFilter:'self',effects:[{action:'fight',target:'self',otherTarget:0}],targets:[{...h.target('target creature'),excludeSelf:true}],optional:true,condition:extensionCondition("tribute wasn't paid"),contract:'generic-trigger-effect'};

 if((m=/^Tribute (\d+)$/.exec(line)))return {kind:'creature-upgrade-entry-v8',mode:'tribute',n:Number(m[1]),contract:'creature-upgrade-status'};
 if((m=new RegExp('^When '+source+' (enters or becomes monstrous|becomes monstrous), (.+)$','i').exec(line))){
  const body=h.effect(card,m[2].replace(/^it /,'this creature '));if(!body)return null;
  const trigger=event=>({kind:'generic-trigger',event,eventFilter:'self',...body,contract:'generic-trigger-effect'});
  return m[1]==='becomes monstrous'?trigger('monstrous'):{kind:'operation-bundle',operations:[trigger('etb'),trigger('monstrous')],contract:'closed-permanent-clauses'};
 }
 return null;
}
