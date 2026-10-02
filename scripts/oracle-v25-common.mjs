// Closed hand choices: reveal/look, movement and printed follow-up stay together.
const body=(effect,targets=[])=>({targets,effects:[effect],optional:false});
const filter=(h,quality)=>h.target('target '+quality+' from a graveyard');
export function normalizeCard(card){
 const text=(card.oracle_text||'').replace(/^When this creature dies, it deals ([0-9]+) damage to a creature an opponent controls chosen at random\.$/m,'When this creature dies, this creature deals $1 damage to a creature an opponent controls chosen at random.');
 return text===card.oracle_text?card:{...card,oracle_text:text};
}
export function extensionTarget(text,h){
 if(text==='any target chosen at random')return {what:'any',zone:'battlefield',controller:'any',min:1,oracleRandomV25:true};
 const random=/^(target .+?) chosen at random$/.exec(text);if(!random)return null;
 const target=random[1]==='target any target'||random[1]==='target permanent or player'?null:h.target(random[1]);
 if(target&&target.min===1&&!target.max&&!target.unbounded)return {...target,oracleRandomV25:true};
 if(random[1]==='target any'||random[1]==='target any target')return {what:'any',zone:'battlefield',controller:'any',min:1,oracleRandomV25:true};
 return null;
}
export function finalizeCompilation(card,result){
 if(result.semanticClass&&result.implementation.some(op=>op.targets?.some(target=>target.oracleRandomV25)&&!['generic-trigger','generic-ability'].includes(op.kind)))return {reason:'random-target-needs-announce-route-v25'};
 if(!result.semanticClass||!JSON.stringify(result.implementation).includes('hand-sacrifice-colors-v25'))return result;
 const costs=result.implementation.filter(op=>op.kind==='mechanic-additional-costs').flatMap(op=>op.costs||[]);
 if(costs.length!==1||costs[0].kind!=='sacrifice'||costs[0].quantity?.min!==1||costs[0].quantity?.max!==1||JSON.stringify(costs[0].object)!==JSON.stringify({kind:'permanent',types:['Creature']}))return {reason:'hand-colors-needs-one-sacrifice-v25'};
 return result;
}
export function extensionEffect(card,line,h){
 const randomTargetBurn=/^This creature deals ([0-9]+) damage to any target chosen at random\.$/.exec(line);if(randomTargetBurn)return body({action:'damage',target:0,n:Number(randomTargetBurn[1])},[extensionTarget('any target chosen at random',h)]);
 const randomBurn=/^This creature deals ([0-9]+) damage to a creature an opponent controls chosen at random\.$/.exec(line);if(randomBurn)return body({action:'random-creature-damage-v25',n:Number(randomBurn[1])});
 const fate=/^(You may )?[Ff]ateseal ([1-9][0-9]*)\.$/.exec(line);if(fate)return body({action:'fateseal-v25',n:Number(fate[2]),optional:!!fate[1]});
 if(line==='Clash with an opponent. If you win, gain control of enchanted creature. Otherwise, that player gains control of enchanted creature.')return body({action:'clash-control-attached-v25',target:'attached-host'});
 const tokens=/^(Create .+? creature tokens\.) Clash with an opponent\. If you win, those creatures gain (.+) until end of turn\.$/.exec(line);
 if(tokens){const parsed=h.effect(card,tokens[1]),keywords=h.keywordList(tokens[2]);if(parsed&&!parsed.optional&&!parsed.v4Body&&!parsed.targets.length&&parsed.effects.length===1&&['token-inline','token-key'].includes(parsed.effects[0].action)&&keywords?.length)return body({action:'tokens-clash-keywords-v25',create:parsed.effects[0],keywords});}
 const inspected=/^Look at (target player's|target opponent's) hand\. You may choose (a|an) (.+? card|card) from it\. (.+)$/.exec(line);
 if(inspected){
  const target=h.target(inspected[1].replace(/'s$/,'')),quality=filter(h,inspected[3]);
  const discard=/^(?:That player|If you do, that player) discards that card(?:, then draws a card)?\.$/.test(inspected[4]);
  const bottom=inspected[4]==='If you do, that player reveals the chosen card, puts it on the bottom of their library, then draws a card.';
  if(target&&quality&&(discard||bottom))return body({action:'hand-choice-v25',who:0,look:true,optional:true,filter:quality,destination:bottom?'bottom':'discard',revealChosen:bottom,drawChosen:bottom||inspected[4].includes('then draws a card')},[target]);
 }
 const random=/^(Target opponent|Target player) reveals their hand and discards (a|an) (.+? card|card) at random\.$/.exec(line);
 if(random){const quality=filter(h,random[3]);if(quality)return body({action:'hand-choice-v25',who:0,look:false,optional:false,filter:quality,destination:'discard',random:true},[h.target(random[1].toLowerCase())]);}
 const duplicate=/^(Target player|Target opponent) reveals their hand\. That player discards all nonland cards with the same name as another card in their hand\.$/.exec(line);
 if(duplicate)return body({action:'hand-duplicates-v25',who:0},[h.target(duplicate[1].toLowerCase())]);
 const twoZones=/^(Target opponent|Target player) reveals their hand\. You choose (a|an) (.+? card) from it, then choose (a|an) (.+? card) from their graveyard\. Exile the chosen cards\.$/.exec(line);
 if(twoZones){const qualities=[twoZones[3],twoZones[5]].map(q=>filter(h,q));if(qualities.every(Boolean))return body({action:'hand-grave-choices-v25',who:0,filters:qualities},[h.target(twoZones[1].toLowerCase())]);}
 const colorSac=/^(Target player|Target opponent) reveals their hand and discards all cards of each of the sacrificed creature's colors\.$/.exec(line);
 if(colorSac)return body({action:'hand-sacrifice-colors-v25',who:0},[h.target(colorSac[1].toLowerCase())]);
 const exileAll=/^(Target opponent|Target player) reveals their hand\. Exile all (.+? cards) from that player's hand and graveyard\.$/.exec(line);
 if(exileAll){const quality=filter(h,exileAll[2].replace(/cards$/,'card'));if(quality)return body({action:'hand-grave-exile-v25',who:0,filter:quality},[h.target(exileAll[1].toLowerCase())]);}
 return null;
}
