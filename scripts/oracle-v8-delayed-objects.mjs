// A delayed instruction binds only to the explicit preceding object-producing
// operation. Unknown antecedents and intervening branches remain unsupported.
const valid = body => body && !body.v4Body && body.effects?.length && Array.isArray(body.targets);
let legacyProbe=false;
function capture(effect) {
  if (['token-inline','token-key','copy-token-v8'].includes(effect.action)) return {kind:'tokens',zone:'battlefield'};
  if (effect.action==='reanimate') return {kind:'subjects',target:effect.target,from:'graveyard',zone:'battlefield',moved:true};
  if (effect.action==='put-from-hand') return {kind:'zone',from:'hand',zone:'battlefield',moved:true};
  if (effect.action==='library-search-v8' && (effect.who??'you')==='you' && effect.placements?.length===1 && effect.placements[0].destination==='battlefield') return {kind:'zone',from:'library',zone:'battlefield',moved:true};
  if (['gain-control','pump'].includes(effect.action)) return {kind:'subjects',target:effect.target,from:'battlefield',zone:'battlefield',moved:false};
  if (effect.action==='exile') return {kind:'subjects',target:effect.target,from:'battlefield',zone:'exile',moved:true};
  if (effect.action==='exile-source') return {kind:'subjects',target:'self',from:'battlefield',zone:'exile',moved:true};
  if (effect.action==='battlefield-group' && effect.operation==='exile') return {kind:'battlefield',filters:effect.filters,zone:'exile',moved:true};
  return null;
}
export function extensionEffect(card,line,h) {
  if(legacyProbe)return null;
  if (!/at (?:the beginning of (?:the next|your next) (?:end step|upkeep)|end of combat)/i.test(line)) return null;
  // Earlier whole-sequence parsing runs after individual effect adapters.
  // Give it precedence too, without changing existing versioned descriptors.
  // The source-local marker isolates the probe from the currently active
  // effect/sequence memo entries; it never becomes imported card data.
  try{
    legacyProbe=true;
    const earlier=h.effect({...card,_oracleDelayedLegacyProbe:true},line);
    // A stand-alone pronoun that the earlier splitter left as an unrelated
    // event object is not a complete antecedent binding for this sequence.
    if(earlier&&!/"event-(?:card|player|card-controller|card-owner)"/.test(JSON.stringify(earlier)))return earlier;
  }finally{legacyProbe=false;}
  const simpleFuture=/^(Create .+?) at the beginning of the next end step\.$/i.exec(line);
  if (simpleFuture) {
    const body=h.effect(card,simpleFuture[1]+'.');
    if(valid(body)&&!body.optional&&!body.targets.length&&body.effects.every(e=>
      ['token-inline','token-key'].includes(e.action)&&Number.isInteger(e.n)&&e.n>0&&
      (!e.token||/^\d+$/.test(e.token.power)&&/^\d+$/.test(e.token.toughness))))
      return {targets:[],effects:[{action:'delayed-create-v8',effects:body.effects,event:'endStep'}],optional:false};
    return null;
  }
  const tail=/^(.+?\.) (If you do, )?(Sacrifice|Exile) (it|them|the (?:creature|token)|that (?:creature|artifact|token)|those tokens) at (the beginning of the next end step|end of combat)\.$/i.exec(line);
  const back=/^(.+?\.) (?:If you do, )?Return (?:it|them|that card|those cards|the exiled cards|this creature|this permanent|the exiled card) to the battlefield( tapped)? under (?:its owner's|their owner's|their owners') control at the beginning of (the next end step|your next upkeep)\.$/i.exec(line);
  if(!tail&&!back)return null;
  let prefix=(tail||back)[1],haste=null;
  const hasteTail=/\. (?:It|They|That (?:creature|artifact|Dragon)|Those tokens|The token) gains? haste( until end of turn)?\.$/i.exec(prefix);
  if(hasteTail){haste=hasteTail[1]?'eot':'permanent';prefix=prefix.slice(0,hasteTail.index+1);}
  // The older self parser recognizes the printed name. This is a source-local
  // normalization, never a new target or a future event's unrelated object.
  prefix=prefix.replace(/^Exile this (?:creature|permanent)\.$/i,'Exile '+card.name+'.');
  let body=h.effect(card,prefix);
  if(!body){
    const fromHand=/^(You may )?put (?:a|an) (creature|artifact|planeswalker) card from your hand onto the battlefield\.$/i.exec(prefix);
    if(fromHand)body={targets:[],optional:!!fromHand[1],effects:[{action:'put-from-hand',what:fromHand[2].toLowerCase(),n:1,tapped:false}]};
  }
  if(!valid(body))return null;
  if(/"delayed-(?:objects|create)-v8"/.test(JSON.stringify(body)))return null;
  let index=-1,binding;
  for(let i=body.effects.length-1;i>=0;i--){const candidate=capture(body.effects[i]);if(candidate){index=i;binding=candidate;break;}}
  if(index<0)return null;
  if(back&&binding.zone!=='exile'||tail&&binding.zone!=='battlefield')return null;
  // Only a single target/object group may supply a singular pronoun. Token
  // replacements can multiply that group and retain all created objects.
  if(binding.kind==='subjects'&&binding.target===undefined)return null;
  const operation=back?'return':tail[3].toLowerCase();
  const event=tail?.[5].toLowerCase()==='end of combat'?'endCombat':back?.[3].toLowerCase()==='your next upkeep'?'upkeep':'endStep';
  return {targets:body.targets,optional:!!body.optional,effects:[{action:'delayed-objects-v8',effects:body.effects,capture:{...binding,index},operation,event,
    ...(event==='upkeep'?{player:'you'}:{}),...(back?.[2]?{tapped:true}:{}),...(haste?{haste}:{})}]};
}
