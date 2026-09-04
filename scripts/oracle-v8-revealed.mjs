// Bind only one explicitly revealed top card. Each clause retains its own
// predicate, and the binding ends with this resolution instruction.
const STATS={"mana value":'mv',power:'power',toughness:'toughness'};
const VALUES={mv:510000001,power:510000002,toughness:510000003};
const map=(value,fn)=>Array.isArray(value)?value.map(item=>map(item,fn)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,map(item,fn)])):fn(value);
const shift=(value,n)=>Array.isArray(value)?value.map(item=>shift(item,n)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['target','who','conditionTarget','otherTarget'].includes(key)&&typeof item==='number'?item+n:shift(item,n)])):value;
export function extensionEffect(card,line,h){
 line=line.replace(/^[a-z]/,letter=>letter.toUpperCase());
 const head=/^(?:(Scry (?:one|two|three|four|five|six|\d+)), then )?(?:([Yy]ou may) )?[Rr]eveal the top card of your library(?: and put (?:it|that card) into your hand)?\. (.+)$/.exec(line);
 if(!head)return null;
 if(/51000000[123]/.test(line)||/\n/.test(line))return null;
 const prefix=head[1]?h.effect(card,head[1]+'.'):null;if(head[1]&&(!prefix||prefix.optional||prefix.targets?.length))return null;
 const targets=[],clauses=[];
 const parse=text=>{
  text=text.replace(/^you /,'You ').replace(/^[a-z]/,letter=>letter.toUpperCase()).replace(/\.$/,'');
  const move=/^(You may )?[Pp]ut (?:it|that card|the revealed card) (into your hand|into your graveyard|onto the battlefield(?: tapped)?(?: under your control)?|on the bottom of your library)$/.exec(text);
  if(move)return [{action:'revealed-move-v8',destination:move[2].includes('battlefield')?'battlefield':move[2].includes('bottom')?'bottom':move[2].includes('graveyard')?'graveyard':'hand',optional:!!move[1],...(move[2].includes('tapped')?{tapped:true}:{})}];
  const bindings=new Set();
  text=text.replace(/(?:that card's|the revealed card's|the card's|its) (mana value|power|toughness)/g,(_,stat)=>{bindings.add(STATS[stat]);return String(VALUES[STATS[stat]]);});
  const parsed=h.effect(card,text+'.');if(!parsed||parsed.optional||parsed.v4Body||!parsed.effects.length)return null;
  if(Object.values(VALUES).some(value=>JSON.stringify(parsed.targets||[]).includes(String(value))))return null;
  // Generic bodies must not invent a second meaning for this revealed card.
  if(/\bthat (?:creature|artifact|enchantment|land|permanent)\b/.test(text)||/\b(?:that card|the revealed card|it)\b/.test(text)&&!/^This (?:creature|artifact|enchantment|permanent)\b/.test(text))return null;
  const effects=shift(parsed.effects,targets.length);targets.push(...(parsed.targets||[]));
  return map(effects,value=>{for(const stat of bindings)if(value===VALUES[stat])return {kind:'revealed-card-stat-v8',stat};return value;});
 };
 const body=head[3].replace(/^If you do, /,'');
 if(head[0].slice(0,head[0].length-head[3].length).includes(' and put '))clauses.push({effects:[{action:'revealed-move-v8',destination:'hand',optional:false}]});
 const chunks=body.split(/ (?=If (?:it's|it isn't|an? .+? card is revealed this way))/);
 for(const chunk of chunks){
  const revealed=/^If an? (.+?) card is revealed this way, (.+)$/.exec(chunk);
  const conditional=/^If (it's|it isn't) an? (.+?) card, (.+)$/.exec(chunk)||(revealed&&[revealed[0],"it's",revealed[1],revealed[2]]);
  let filter,invert=false,content=chunk;
  if(conditional){filter=h.target('target '+conditional[2]+' card from your graveyard');if(!filter)return null;invert=conditional[1]==="it isn't";content=conditional[3];}
  if(content.startsWith('If '))return null;
  const branches=content.split('. Otherwise, ');if(branches.length>2||branches.length>1&&!filter)return null;
  const parseSequence=sequence=>{
   const parts=sequence.split(/\. (?=(?:Then )?(?:[Pp]ut|[Yy]ou (?:gain|lose|draw)|[Dd]raw|[Ee]ach opponent|This (?:creature|artifact|enchantment|permanent)))/),effects=[];
   for(const part of parts){const parsed=parse(part.replace(/^Then /,''));if(!parsed)return null;effects.push(...parsed);}return effects;
  };
  const effects=parseSequence(branches[0]),elseEffects=branches[1]?parseSequence(branches[1]):undefined;
  if(!effects||branches[1]&&!elseEffects)return null;
  clauses.push({...(filter?{filter,...(invert?{invert:true}:{})}:{}),effects,...(elseEffects?{elseEffects}:{})});
 }
 return {targets,effects:[...(prefix?.effects||[]),{action:'reveal-card-v8',optional:!!head[2],clauses}]};
}
