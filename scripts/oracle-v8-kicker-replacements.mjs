// A kicked replacement selects exactly one complete effect outcome. This
// adapter deliberately requires an unchanged target announcement; cards whose
// kicker changes target count or target legality need a separate casting path.
const number = word => ({a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twelve:12}[word.toLowerCase()] ?? (/^\d+$/.test(word)?Number(word):null));
const clone = value => JSON.parse(JSON.stringify(value));
function bindPronouns(body, original) {
  if(body.targets.length || original.targets.length!==1)return body;
  const result=clone(body);
  const walk=node=>{
    if(!node||typeof node!=='object')return;
    for(const key of ['target','who'])if(node[key]==='event-card'||node[key]==='event-player')node[key]=0;
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else walk(value);
  };
  walk(result.effects);
  return result;
}
export function extensionEffect(card,line,h) {
  const searchNumber=/^(Search your library for a basic land card, reveal it, put it into your hand, then shuffle)\. If this spell was kicked, search your library for two basic land cards instead of one\.$/.exec(line);
  if(searchNumber){
    const body=h.effect(card,searchNumber[1]+'.');
    if(body&&!body.optional&&!body.targets.length&&body.effects.length===1&&body.effects[0].action==='search-library'&&body.effects[0].n===1)
      return {targets:[],effects:[{action:'conditional',condition:{kind:'kicked'},effects:[{...body.effects[0],n:2}],elseEffects:body.effects}]};
    return null;
  }
  // Quantity adapters may simplify a plural target phrase before this helper.
  // Retain the original source boundary until kicker-aware target announcement
  // is available, instead of accepting the simplified shared target by mistake.
  if(/If (?:this spell|this creature|it) was kicked, (?:instead )?(?:any number of target|(?:return|choose|exile) (?:any number of|two|three|up to \w+) target)/.test(card.oracle_text||''))return null;
  const match=/^(.+)\. If (?:this spell|this creature|it) was kicked, (?:instead (.+)|(.+) instead)\.$/.exec(line);
  if(!match)return null;
  const first=match[1]+'.';let replacement=match[2]||match[3];
  const group=/^(Creatures (?:you control|target player controls)) get [+-]\d+\/[+-]\d+ until end of turn\.$/.exec(first);
  if(group&&/^those creatures get /i.test(replacement))replacement=replacement.replace(/^those creatures/i,group[1]);
  const moved=/^Return (target (?:creature or planeswalker you don't control|creature card from your graveyard)) to (?:its owner's hand|your hand)\.$/.exec(first);
  if(moved&&/^put that (?:permanent|card) (?:on the bottom of its owner's library|onto the battlefield tapped)$/i.test(replacement))replacement=replacement.replace(/^put that (?:permanent|card)/i,'Put '+moved[1]);
  const commonUntap=/^Untap target creature\. It gets [+-]\d+\/[+-]\d+ until end of turn\.$/.test(first);
  if(first.slice(0,-1).includes('.')&&!commonUntap)return null;
  const original=h.effect(card,first);
  if(!original||original.optional||original.v4Body||!original.effects.length||original.effects.some(e=>e.action==='conditional'))return null;
  let alternative=h.effect(card,replacement+'.');
  const damage=/^(?:it|this spell|this creature) deals (\d+|one|two|three|four|five|six|seven|eight|nine|ten) damage(?: to (?:that creature|that permanent or player))?$/.exec(replacement);
  if(damage&&original.effects.length===1&&original.effects[0].action==='damage')alternative={targets:original.targets,effects:[{...original.effects[0],n:number(damage[1])}]};
  const tokens=/^create (\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve) of those tokens$/i.exec(replacement);
  if(tokens&&original.effects.length===1&&['token-inline','token-key'].includes(original.effects[0].action))alternative={targets:[],effects:[{...original.effects[0],n:number(tokens[1])}]};
  if(!alternative||alternative.optional||alternative.v4Body||!alternative.effects.length)return null;
  // A pronoun can refer only to the single target already announced. Group
  // pronouns need their original complete filters, handled by an exact rewrite.
  if(/\b(?:that creature|that artifact|that permanent|that player|that card)\b/.test(replacement))alternative=bindPronouns(alternative,original);
  const same=JSON.stringify(alternative.targets)===JSON.stringify(original.targets);
  if(!same&&alternative.targets.length)return null;
  const hasEvent=node=>typeof node==='string'?/^event-/.test(node):!!node&&typeof node==='object'&&Object.values(node).some(hasEvent);
  if(hasEvent(alternative.effects))return null;
  if(!same&&original.targets.length&&!alternative.effects.some(e=>e.target===0||e.who===0))return null;
  if(commonUntap){
    if(original.effects.length!==2||original.effects[0].action!=='untap'||original.effects[1].action!=='pump'||alternative.effects.length!==1||alternative.effects[0].action!=='pump')return null;
    alternative={...alternative,effects:[original.effects[0],...alternative.effects]};
  }
  return {targets:original.targets,effects:[{action:'conditional',condition:{kind:'kicked'},effects:alternative.effects,elseEffects:original.effects}]};
}
