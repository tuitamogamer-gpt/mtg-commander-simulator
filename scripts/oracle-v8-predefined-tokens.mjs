// CR 111.10: predefined tokens carry their complete, fixed rules text.
const ROLES='Cursed|Monster|Royal|Sorcerer|Virtuous|Wicked|Young Hero';
const NUM='a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+';
const number=text=>({a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[text.toLowerCase()]??Number(text));
const junk={name:'Junk',types:['Artifact'],subtypes:['Junk'],colors:[],keywords:[],oracle:'{T}, Sacrifice this token: Exile the top card of your library. You may play that card this turn. Activate only as a sorcery.',operations:[{kind:'generic-ability',cost:{tap:true,sacSelf:true},effects:[{action:'exile-top',who:'you',n:1,permission:{spellsOnly:false,nextOwnTurn:false,anyColor:false}}],targets:[],optional:false,onceEachTurn:false,sorceryOnly:true,contract:'generic-activated-effect'}]};
export function extensionEffect(card,line,h){
 let match=new RegExp('^(You may )?[Cc]reate ('+NUM+') Junk tokens?\\.$').exec(line);
 if(match){const n=number(match[2]);return Number.isSafeInteger(n)&&n>=1&&n<=10?{targets:[],optional:!!match[1],effects:[{action:'token-inline',who:'you',n,token:junk}]}:null;}
 match=new RegExp('^(You may )?[Cc]reate a ('+ROLES+') Role token attached to (.+)\\.$').exec(line);
 if(match){
  const noun=match[3],target=/^(?:(?:up to one|another|one other|other) )?target (?:(?:attacking|other) )?creature(?: (?:you control|you don\'t control|an opponent controls))?$/.test(noun)?h.target(noun):null;
  if(target&&target.zone==='battlefield'&&target.what==='creature')return {targets:[target],optional:!!match[1],effects:[{action:'role-token-v8',role:match[2],target:0}]};
  const ref=/^(?:it|this creature)$/.test(noun)?'self':noun==='that creature'?'event-card':null;
  if(ref)return {targets:[],optional:!!match[1],effects:[{action:'role-token-v8',role:match[2],target:ref}]};
  return null;
 }
 match=new RegExp('^For each (creature your opponents control|Rat you control), create a ('+ROLES+') Role token attached to that (creature|Rat)\\.$','i').exec(line);
 if(match&&match[3].toLowerCase()===(match[1].startsWith('Rat')?'rat':'creature')){
  const filter=h.target(match[1].startsWith('Rat')?'target Rat you control':"target creature you don't control");
  return filter?{targets:[],effects:[{action:'role-token-v8',role:match[2],filters:[filter]}]}:null;
 }
 return null;
}
