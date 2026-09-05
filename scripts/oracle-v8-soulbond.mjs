const escape=text=>String(text).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function extensionLine(card,line,h){
  if(line==='Soulbond')return {kind:'soulbond-v8',contract:'soulbond-pairing'};
  const source='(?:this creature|'+escape(card.name)+')';
  const match=new RegExp('^As long as '+source+' is paired with another creature, (.+)$').exec(line);
  if(!match)return null;
  const body=match[1];let operation,m;
  if((m=/^both creatures have (.+)\.$/.exec(body))){
    if(m[1]==='protection from Zombies')operation={kind:'generic-static',scope:'self',protectionQualities:[{kind:'subtype',value:'Zombie'}],contract:'generic-continuous-effect'};
    else {const keywords=h.keywordList(m[1]);if(!keywords)return null;operation={kind:'generic-static',scope:'self',keywords,contract:'generic-continuous-effect'};}
  }else if((m=/^each of those creatures gets \+(\d+)\/\+(\d+)\.$/.exec(body))){
    operation={kind:'generic-static',scope:'self',power:Number(m[1]),toughness:Number(m[2]),contract:'generic-continuous-effect'};
  }else if((m=/^each of those creatures has "(.+)"$/.exec(body))){
    const grant=h.line({...card,name:'__SoulbondRecipient'},m[1]);
    if(!grant||!['generic-ability','generic-trigger'].includes(grant.kind))return null;
    operation={kind:'generic-static',scope:'self',grantedOperation:grant,contract:'generic-continuous-effect'};
  }
  return operation?{kind:'soulbond-grant-v8',operation,contract:'soulbond-pairing'}:null;
}
