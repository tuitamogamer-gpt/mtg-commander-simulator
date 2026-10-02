// Whole resolution programs retain their source incarnation and printed order.
const ordinals={first:1,second:2,third:3};
const quantities={eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,'twenty-five':25,thirty:30,forty:40,fifty:50,'one hundred':100};
export function normalizeCard(card){
 const normalize=text=>String(text||'').replace(/\b(eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty-five|twenty|thirty|forty|fifty|one hundred)\b(?= (?:cards?\b|life\b|damage\b|counters?\b|[+\-]1\/[+\-]1 counters?\b|\{[WUBRGC]\}))/g,word=>String(quantities[word]));
 return {...card,oracle_text:normalize(card.oracle_text),...(card.card_faces?{card_faces:card.card_faces.map(face=>({...face,oracle_text:normalize(face.oracle_text)}))}:{})};
}
const initial=/this is the (first|second|third) time this ability has resolved this turn/;
const remap=(node,map)=>Array.isArray(node)?node.map(part=>remap(part,map)):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,(['target','who','otherTarget','conditionTarget'].includes(key)||key==='index'&&['target-controller','target-owner'].includes(node.kind))&&typeof value==='number'?map[value]:remap(value,map)])):node;
export function extensionEffect(card,line,h){
 const drawn=/^(Two|Three|Four|Up to two|Up to three|Up to four) target (players|opponents) each draw (a|one|two|three|four|[0-9]+) cards?\.$/.exec(line);
 if(drawn){const n=({a:1,one:1,two:2,three:3,four:4})[drawn[3]]??Number(drawn[3]),count=drawn[1].toLowerCase().replace('up to ',''),max=({two:2,three:3,four:4})[count];return {targets:[{what:drawn[2]==='players'?'player':'opponent',zone:'player',controller:'any',min:drawn[1].startsWith('Up to')?0:max,max}],effects:[{action:'draw',who:0,n}],optional:false};}
 const damage=/^(.+? deals .+? damage to) each opponent and (each .+)\.$/.exec(line);
 if(damage&&!initial.test(line)&&!/[.\n]/.test(damage[1])){const first=h.effect(card,damage[1]+' each opponent.'),second=h.effect(card,damage[1]+' '+damage[2]+'.');if(first&&!first.optional&&!first.targets?.length&&first.effects?.length&&second&&!second.optional&&!second.targets?.length&&second.effects?.length)return {targets:[],effects:[...first.effects,...second.effects],optional:false};}
 if(!initial.test(line)||/\binstead\b|"/.test(line))return null;
 const targets=[],programs=[];
 for(const sentence of line.split(/\. (?=(?:If (?:this is the|it's the)|Then if this is the|[^.\n]+ if this is the (?:first|second|third) time this ability has resolved this turn))/)){
  let text=sentence.replace(/\.$/,'').replace(/^Then if /,'If ').replace(/^Then /,'');
  const before=/^If (?:this is the (first|second|third) time this ability has resolved this turn|it's the (first|second|third) time), (.+)$/.exec(text);
  const after=/^(.+?) if this is the (first|second|third) time this ability has resolved this turn$/.exec(text);
  const ordinal=before?ordinals[before[1]||before[2]]:after?ordinals[after[2]]:null;
  text=before?before[3]:after?after[1]:text;
  if(/this ability has resolved|it's the (?:first|second|third) time/.test(text))return null;
  text=text[0].toUpperCase()+text.slice(1)+'.';
  const body=h.effect(card,text);
  if(!body||body.optional&&ordinal===null||body.v4Body||!body.effects?.length||!Array.isArray(body.targets))return null;
  const map=body.targets.map(target=>{const index=targets.findIndex(prior=>JSON.stringify(prior)===JSON.stringify(target));if(index>=0)return index;targets.push(target);return targets.length-1;});
  programs.push({ordinal,effects:remap(body.effects,map),...(body.optional?{optional:true}:{})});
 }
 return {targets,effects:[{action:'resolved-sequence-v22',abilityKey:line,programs}],optional:false};
}
export function extensionLine(card,line,h){
 const retention=/^You don't lose unspent (white|blue|black|red|green|colorless) mana as steps and phases end\.$/.exec(line);
 if(retention)return {kind:'mana-retention-v22',color:({white:'W',blue:'U',black:'B',red:'R',green:'G',colorless:'C'})[retention[1]],contract:'mana-retention-v22'};
 const attack=/^Whenever (?:you attack(?: with (one|two|three|[0-9]+) or more(?: (.+?))? creatures)?|(one|two|three|[0-9]+) or more (.+?) you control attack), (.+)$/.exec(line);
 if(attack){const noun=attack[2]?attack[2]+' creature':attack[4]?attack[4].replace(/creatures$/,'creature'):'creature',filter=h.target('target '+noun),body=h.effect(card,attack[5][0].toUpperCase()+attack[5].slice(1)),min=({one:1,two:2,three:3})[attack[1]||attack[3]]??Number(attack[1]||attack[3]||1);if(filter&&body&&!body.v4Body)return {kind:'generic-trigger',event:'attackersDeclared',eventFilter:{kind:'v8-event',player:'you',target:filter,minMatching:min},attackersAmountV19:true,...body,contract:'generic-trigger-effect'};}
 if(!initial.test(line))return null;
 const ability=/^([^:]+): (.+)$/.exec(line);if(!ability)return null;
 const cost=h.cost?.(ability[1]),body=extensionEffect(card,ability[2],h);
 return cost&&body?{kind:'generic-ability',cost,...body,onceEachTurn:false,sorceryOnly:false,contract:'generic-activated-effect'}:null;
}
export function extensionCount(text){
 if(/^(?:the number of )?creatures? that died under your control this turn$/.test(text))return {kind:'turn-count',field:'creaturesDiedUnder'};
 const mana=/^(?:the amount of )?(?:each |all )?unspent (?:(white|blue|black|red|green|colorless) )?mana you have$/.exec(text);
 if(mana)return {kind:'common-count-v22',test:'unspent-mana',color:mana[1]?({white:'W',blue:'U',black:'B',red:'R',green:'G',colorless:'C'})[mana[1]]:null};
 return null;
}
export function extensionCondition(){return null;}
export function extensionTarget(text,h){
 const history=/^(.+? cards?)(?: in| from) your graveyard that (were put there from the battlefield|you cycled or discarded) this turn$/.exec(text);
 if(!history)return null;
 const base=h.target(history[1]+' from your graveyard');
 if(!base||base.zone!=='graveyard'||base.v20)return null;
 return {...base,v20:{kind:'common-current-grave-v22',origin:history[2].startsWith('were')?'battlefield':'discard-or-cycle'}};
}
export function normalizeManaOperation(operation){
 if(operation.kind==='generic-ability'&&operation.targets?.length&&operation.effects?.some(effect=>effect.action==='resolved-sequence-v22')&&JSON.stringify(operation.effects).includes('"action":"add-mana"'))return {...operation,stackMana:true};
 return null;
}
