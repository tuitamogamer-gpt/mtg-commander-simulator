// Immediate casting is a resolution instruction, not a lasting zone or
// timing permission. Keep the selected-card and prospective-spell filters
// separate so modal double-faced cards use the appropriate characteristics.
function spellFilter(text,helpers){
 const limit=/^(.*?) with mana value (?:(\d+|X) or less|less than or equal to (.+))$/.exec(text);
 const filter=helpers.target?.('target '+(limit?limit[1]:text));
 if(!filter||filter.what!=='spell'||filter.zone!=='stack')return null;
 const threshold=limit?.[3]?helpers.value?.(limit[3]):limit?.[2]==='X'?'X':limit?Number(limit[2]):undefined;
 if(limit&&(threshold===null||threshold===undefined))return null;
 return {...filter,...(limit?{stat:'mv',threshold,comparison:'less'}:{})};
}
const numbers={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
function inspectedCondition(text,h){
 if(!text)return {};
 if(text==="it's an instant or sorcery spell")return {filter:spellFilter('instant or sorcery spell',h)};
 if(text==='its mana value is odd')return {cardManaParity:'odd'};
 const fixed=/^(?:the spell's|that spell's) mana value is (\d+) or less$/.exec(text);
 if(fixed)return {filter:spellFilter('spell with mana value '+fixed[1]+' or less',h)};
 const match=/^(?:(?:the spell's|that spell's) mana value is |it's a spell with mana value )(less than or equal to|less than) (.+)$/.exec(text);
 if(!match)return null;
 const value=h.value?.(match[2]);if(value===null||value===undefined)return null;
 const threshold=match[1]==='less than'?{kind:'sum',values:[value,{kind:'signed',sign:-1,value:1}]}:value;
 const filter=spellFilter('spell',h);return filter?{filter:{...filter,stat:'mv',threshold,comparison:'less'}}:null;
}
function inspectedFallback(line,h){
 const until=/^(Exile|Reveal) cards from the top of your library until you (exile|reveal) (an? .+? card(?: with mana value \d+ or less)?)\. You may cast (?:that card|the exiled card|it) without paying its mana cost(?: if (.+?))?\.(.*)$/.exec(line);
 if(until){
  if(until[1].toLowerCase()!==until[2])return null;
  const filter=h.target?.('target '+until[3].replace(/^an? /,'')+' from a graveyard'),condition=inspectedCondition(until[4],h);
  if(!filter||filter.zone!=='graveyard'||!condition||condition.filter===null)return null;
  let rest='stay',uncast;
  if(until[5]){
   if(/^ (?:Then )?Put (?:all revealed cards not cast this way|the exiled cards not cast this way|the rest) on the bottom of your library in a random order\.$/.test(until[5]))rest='bottom-random';
   else if(/^ (?:If you don't cast that card this way,|If you don't,|Otherwise,) put (?:it|that card) into your hand\.$/.test(until[5]))uncast='hand';
   else return null;
  }
  return {targets:[],effects:[{action:'cast-inspected-v8',until:filter,visibility:until[2],rest,...(uncast?{uncast}:{}),free:true,...condition}]};
 }
 const top=/^(Reveal) the top card of your library\. You may cast it without paying its mana cost if (.+?)\.(.*)$/.exec(line);
 if(top){
  const condition=inspectedCondition(top[2],h);if(!condition||condition.filter===null)return null;
  let uncast;if(top[3]===" If you don't cast it, draw a card.")uncast='draw';else if(top[3])return null;
  return {targets:[],effects:[{action:'cast-inspected-v8',n:1,visibility:'reveal',rest:'stay',...(uncast?{uncast}:{}),free:true,...condition}]};
 }
 return null;
}
export function extensionEffect(card,line,helpers={}){
 // Bodies after trigger headers begin with a lower-case verb in Oracle.
 line=line.replace(/^[a-z]/,letter=>letter.toUpperCase());
 const foreignHand=/^(Target opponent reveals their hand|Look at that player's hand)\. You may cast an? ((?:.+? )?spell) from among those cards without paying its mana cost\.$/.exec(line);
 if(foreignHand){
  const filter=spellFilter(foreignHand[2],helpers);if(!filter)return null;
  const targeted=foreignHand[1].startsWith('Target');
  return {targets:targeted?[helpers.target('target opponent')]:[],effects:[{action:'cast-from-hand-v8',who:targeted?0:'event-player',visibility:targeted?'reveal':'look',filter,free:true}]};
 }
 const until=/^(Target opponent|That player) exiles cards from the top of their library until they exile an instant or sorcery card\. You may cast that card without paying its mana cost\. Then (?:that player puts|put) the exiled cards that weren't cast this way on the bottom of (?:their|that) library in a random order\.$/.exec(line);
 if(until){
  const filter=helpers.target?.('target instant or sorcery card from a graveyard');if(!filter)return null;
  return {targets:until[1]==='Target opponent'?[helpers.target('target opponent')]:[],effects:[{action:'cast-inspected-v8',who:until[1]==='Target opponent'?0:'event-player',until:filter,visibility:'exile',rest:'bottom-random',free:true}]};
 }
 const inspected=/^(Look at|Reveal|Exile) the top (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) cards of your library(?:, where X is (.+?))?\. You may cast an? ((?:.+? )?spell(?: with mana value [^.]+)?) from among them( with mana value [^.]+)? without paying its mana cost\. (?:Then )?[Pp]ut the rest on the bottom of your library in a random order\.$/.exec(line);
 if(inspected){
  if(inspected[5]&&inspected[4].includes(' with mana value '))return null;
  const filter=spellFilter(inspected[4]+(inspected[5]||''),helpers);
  const n=inspected[3]?helpers.count?.(inspected[3].replace(/^the number of /,'')):(numbers[inspected[2]]??(inspected[2]==='X'?'X':Number(inspected[2])));
  if(!filter||n===undefined||n===null||inspected[3]&&inspected[2]!=='X')return null;
  return {targets:[],effects:[{action:'cast-inspected-v8',filter,n,visibility:inspected[1]==='Look at'?'look':inspected[1].toLowerCase(),rest:'bottom-random',free:true}]};
 }
 const target=/^You may cast (target (?:instant or sorcery|instant|sorcery|nonland) card from (?:your|an opponent's|a) graveyard) without paying its mana cost\.(?: If that spell would be put into (?:a|their|your) graveyard, exile it instead\.)?$/.exec(line);
 if(target){
  const parsed=helpers.target?.(target[1]);if(!parsed||parsed.zone!=='graveyard')return null;
  return {targets:[parsed],effects:[{action:'cast-card-v8',target:0,free:true,...(line.endsWith('exile it instead.')?{exileAfter:true}:{})}]};
 }
 const graveyard=/^You may cast (target .+? card(?: with [^.]+)? from (?:your|an opponent's|that player's|a) graveyard|an? .+? spell(?: with [^.]+)? from (?:your|that player's|a) graveyard)( without paying its mana cost|, and mana of any type can be spent to cast that spell)?\.(?: If (that spell|an instant or sorcery spell cast this way) would be put into (?:a|their|your) graveyard, exile it instead\.)?$/.exec(line);
 if(graveyard){
  const flags={free:graveyard[2]===' without paying its mana cost',...(graveyard[2]?.startsWith(', and')?{anyColor:true}:{}),...(graveyard[3]?{exileAfter:true,...(graveyard[3]!=='that spell'?{exileTypes:['Instant','Sorcery']}:{})}:{})};
  if(graveyard[1].startsWith('target ')){
   let target=helpers.target?.(graveyard[1]);
   if(!target){
    const limit=/^(target .+? card) with mana value (less than or equal to|equal to) (.+?)( from (?:your|an opponent's|that player's|a) graveyard)$/.exec(graveyard[1]);
    const base=limit&&helpers.target?.(limit[1]+limit[4]),threshold=limit&&helpers.value?.(limit[3]);
    if(base&&threshold!==null&&threshold!==undefined)target={...base,stat:'mv',comparison:limit[2]==='equal to'?'equal':'less',threshold};
   }
   if(!target||target.zone!=='graveyard')return null;
   return {targets:[target],effects:[{action:'cast-card-v8',target:0,...flags}]};
  }
  const match=/^an? (.+) from (your|that player's|a) graveyard$/.exec(graveyard[1]),filter=match&&spellFilter(match[1],helpers);
  if(!filter)return null;
  return {targets:[],effects:[{action:'cast-from-graveyard-v8',who:match[2]==='your'?'you':match[2]==='a'?'each-player':'event-player',filter,...flags}]};
 }
 const hand=/^You may cast an? ((?:.+? )?spell(?: with mana value [^.]+)?) from your hand( with mana value [^.]+)? without paying its mana cost\.$/.exec(line);
 if(hand){
  if(hand[2]&&hand[1].includes(' with mana value '))return null;
  const filter=spellFilter(hand[1]+(hand[2]||''),helpers);if(!filter)return null;
  return {targets:[],effects:[{action:'cast-from-hand-v8',filter,free:true}]};
 }
 return inspectedFallback(line,helpers);
}
