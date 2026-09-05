// Closed basic-land type clauses. CR 305.6 supplies intrinsic mana abilities;
// merely adding a subtype without that engine behavior is not support.
const landTypes = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
export function extensionLine(card, line) {
  const match = /^(Each land|All lands|Lands you control|Enchanted land) (?:is|are) (?:a |an )?(every basic land type|Plains|Islands?|Swamps?|Mountains?|Forests?) in addition to (?:its|their) other (?:land )?types\.$/.exec(line);
  if (!match) return settingLine(card,line);
  if (match[1] === 'Enchanted land' && !/\bAura\b/.test(card.type_line)) return null;
  const types = match[2] === 'every basic land type' ? landTypes.slice() : [match[2] === 'Plains' ? 'Plains' : match[2].replace(/s$/, '')];
  return { kind: 'v8-land-types', ...(match[1] === 'Enchanted land' ? { attached: true } : { filters: [{ what: 'land', zone: 'battlefield', controller: match[1] === 'Lands you control' ? 'you' : 'any', min: 1 }] }), types, retain: true, contract: 'continuous-basic-land-types' };
}
export function extensionEffect(card,line,h) { return settingEffect(card,line,h); }

export function settingLine(card,line){
 const match=/^(Nonbasic lands|Lands you control|Enchanted land) (?:are|is) (?:an? )?(Mountains|Islands|Plains|Swamps|Forests|Mountain|Island|Swamp|Forest|Mountain, Forest, and Plains)\.$/.exec(line);
 if(!match||match[1]==='Enchanted land'&&!/\bAura\b/.test(card.type_line))return null;
 const types=match[2]==='Mountain, Forest, and Plains'?['Mountain','Forest','Plains']:[match[2]==='Plains'?'Plains':match[2].replace(/s$/,'')];
 return {kind:'v8-land-types',...(match[1]==='Enchanted land'?{attached:true}:{filters:[{what:'land',zone:'battlefield',controller:match[1]==='Lands you control'?'you':'any',min:1,...(match[1]==='Nonbasic lands'?{nonbasic:true}:{})}]}),types,retain:false,contract:'continuous-basic-land-types'};
}
export function settingEffect(card,line,h){
 if(/^You may have target land become /i.test(line)){const body=h.effect(card,line.replace(/^You may have target land become /i,'Target land becomes '));if(body?.effects.length===1&&body.effects[0].action==='set-basic-land-types-v8')return {...body,optional:true};}
 const duration=/^(.+?) (until this creature leaves the battlefield|for as long as this creature remains on the battlefield)\.$/i.exec(line);
 if(duration){const body=h.effect(card,duration[1]+' until end of turn.');if(body?.effects.length===1&&body.effects[0].action==='set-basic-land-types-v8')return {...body,effects:[{...body.effects[0],duration:duration[2].startsWith('until')?'until-source-leaves':'while-source-battlefield'}]};}
 const several=/^Two target lands become (Plains|Islands|Swamps|Mountains|Forests) until end of turn\.$/i.exec(line);
 if(several)return {effects:[{action:'set-basic-land-types-v8',target:0,types:[several[1]==='Plains'?'Plains':several[1].replace(/s$/,'')],retain:false,duration:'eot'}],targets:[{...h.target('target land'),min:2,max:2}],optional:false};

 const match=/^Target land becomes (?:an? )?(Plains or an Island|the basic land type of your choice|Plains|Island|Swamp|Mountain|Forest)( in addition to its other types)?( until end of turn)?\.$/i.exec(line);
 if(!match)return null;
 const choice=/choice| or /.test(match[1]),types=choice?(match[1]==='Plains or an Island'?['Plains','Island']:landTypes.slice()):[match[1][0].toUpperCase()+match[1].slice(1)];
 return {effects:[{action:'set-basic-land-types-v8',target:0,types,retain:!!match[2],...(choice?{choose:true}:{}),duration:match[3]?'eot':'object'}],targets:[h.target('target land')],optional:false};
}
