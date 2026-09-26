const body=(effects,targets=[])=>({effects,targets,optional:false});
const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
function recipient(text,h,card){
 if(card&&[card.name,card.name.split(',')[0]].includes(text))return {self:true};
 text=text[0].toLowerCase()+text.slice(1);
 if(/^this (?:creature|artifact|enchantment|permanent)$/.test(text))return {self:true};
 if(/^enchanted (?:creature|permanent)$/.test(text))return {attached:true};
 if(text==='cards in graveyards')return {filter:{what:'card',zone:'graveyard',controller:'any'}};
 const normalized=text[0].toLowerCase()+text.slice(1),singular=normalized.replace(/\b(creature|permanent|land|artifact|enchantment)s\b/g,'$1');
 const filter=h.target('target '+singular);return filter?{filter}:null;
}
function restriction(card,line,h){
 const m=/^(.+?) can't be the targets? of (?:(white|blue|black|red|green)(?: or (white|blue|black|red|green))? )?(spells or abilities|spells|abilities)(?: (?:your opponents|an opponent) controls?)?\.$/.exec(line);
 if(!m)return null;const target=recipient(m[1],h,card);if(!target)return null;
 return {...target,actionType:m[4]==='spells'?'spell':m[4]==='abilities'?'ability':'any',...(m[2]?{colors:[colors[m[2]],...(m[3]?[colors[m[3]]]:[])]}:{}),opponentsOnly:/(?:opponents|opponent) controls?\.$/.test(line)};
}
export function extensionLine(card,line,h){
 if(line==='You have protection from each of your opponents.')return {kind:'player-protection-v20',from:'opponents',contract:'player-protection-v20'};
 const lifeRules={"Your life total can't change.":'locked',"You don't lose the game for having 0 or less life.":'survive-zero',"Damage that would reduce your life total to less than 1 reduces it to 1 instead.":'damage-floor'};
 if(lifeRules[line])return {kind:'life-rule-v20',rule:lifeRules[line],who:'you',contract:'life-rule-v20'};
 if(line==='If an opponent would lose life during your turn, they lose twice that much life instead.')return {kind:'life-rule-v20',rule:'double-loss',who:'opponents',yourTurn:true,contract:'life-rule-v20'};
 const floor=/^If (.+?), damage that would reduce your life total to less than 1 reduces it to 1 instead\.$/.exec(line);
 if(floor){const condition=h.condition(floor[1]);if(condition)return {kind:'life-rule-v20',rule:'damage-floor',who:'you',condition,contract:'life-rule-v20'};}
 if(line==="You have no maximum hand size and don't lose the game for having 0 or less life."){const hand=h.line(card,'You have no maximum hand size.');if(hand)return {kind:'operation-bundle',operations:[hand,{kind:'life-rule-v20',rule:'survive-zero',who:'you',contract:'life-rule-v20'}],contract:'closed-permanent-clauses'};}
 const parsed=restriction(card,line,h);if(parsed)return {kind:'target-restriction-v20',...parsed,contract:'target-restriction-v20'};
 const grant=/^(Commander spells you cast|Instant and sorcery spells you cast from your hand) have cascade\.$/.exec(line);
 if(grant)return {kind:'spell-keyword-grant-v19',keyword:'cascade',filter:grant[1].startsWith('Commander')?{what:'spell',zone:'stack',controller:'any',commanderV20:true,min:1}:{what:'spell',zone:'stack',controller:'any',castFrom:'hand',alternatives:[h.target('target instant spell'),h.target('target sorcery spell')],min:1},contract:'spell-keyword-grant-v19'};
 return null;
}
export function extensionEffect(card,line,h){
 const protection=/^You gain protection from everything (until your next turn|until end of turn)\.$/.exec(line);if(protection)return body([{action:'player-protection-v20',from:'everything',duration:protection[1]==='until your next turn'?'untilTurnOf':'eot'}]);
 const loss=/^(Target player|Target opponent|That player) loses the game\.$/i.exec(line);if(loss){const target=/^target /i.test(loss[1])?h.target(loss[1].toLowerCase()):null;return body([{action:'lose-game-v20',who:target?0:'event-player'}],target?[target]:[]);}
 if(line==="You can't lose the game this turn and your opponents can't win the game this turn.")return body([{action:'player-rule-v10',rule:'no-lose-win',who:'you'}]);
 if(line==="Until end of turn, damage that would reduce your life total to less than 1 reduces it to 1 instead.")return body([{action:'life-rule-v20',rule:'damage-floor',who:'you'}]);
 if(line==="Until end of turn, your life total can't change.")return body([{action:'life-rule-v20',rule:'locked',who:'you'}]);
 if(line==="Until end of turn, your life total can't change, and permanents you control gain hexproof and indestructible."){const parsed=h.effect(card,'Permanents you control gain hexproof and indestructible until end of turn.');if(parsed)return {...parsed,effects:[{action:'life-rule-v20',rule:'locked',who:'you'},...parsed.effects]};}
 const m=/^(.+?) can't be the targets? of (.+?) this turn\.$/.exec(line);if(!m)return null;
 const target=/^Target /.test(m[1])?h.target(m[1].replace(/^Target /,'target ')):null;
 const parsed=restriction(card,(target?'This creature':m[1])+" can't be the target of "+m[2]+'.',h);if(!parsed)return null;
 if(target){delete parsed.self;return body([{action:'target-restriction-v20',...parsed,target:0}],[target]);}
 return body([{action:'target-restriction-v20',...parsed}]);
}
export function extensionTarget(text,h){
 if(text==='target card with flashback you own from exile')return {what:'card',zone:'exile',controller:'any',owner:'you',hasMechanicV17:'flashback',min:1};
 if(text==='target suspended card')return {what:'card',zone:'exile',controller:'any',suspendedV20:true,min:1};
 if(text==='target nonland permanent or suspended card')return {what:'card',zone:'mixed-v18',controller:'any',min:1,alternatives:[h.target('target nonland permanent'),extensionTarget('target suspended card',h)]};
 const alone=/^(target creature(?: you control| an opponent controls)?) that(?:'s| is) attacking alone$/.exec(text);if(alone){const base=h.target(alone[1]);if(base)return {...base,attacking:true,attackingAloneV20:true};}
 const mechanic=/^(.+?) with (modular|level up|awaken)( from (?:your|a|an opponent's) graveyard)?$/.exec(text);
 if(mechanic){const base=h.target(mechanic[1]+(mechanic[3]||''));if(base)return {...base,mechanicV20:mechanic[2]};}
 const range=/^(.+?) with (power|toughness|mana value) (\d+), (\d+), or (\d+)$/.exec(text);
 if(range){const base=h.target(range[1]);if(base)return {...base,statValuesV20:{stat:range[2]==='mana value'?'mv':range[2],values:range.slice(3).map(Number)}};}
 const extremum=/^(.+?) with the (lowest|greatest) (mana value|power|toughness)(?: among (creatures|nonland permanents)(?: on the battlefield)?)?$/.exec(text);
 if(extremum){const base=h.target(extremum[1]),comparison=h.target('target '+(extremum[4]?extremum[4].replace(/s$/,''):extremum[1].replace(/^(?:another |up to one )?target /,'')));if(base?.zone==='battlefield'&&comparison?.zone==='battlefield')return {...base,statExtremumV20:{direction:extremum[2],stat:extremum[3]==='mana value'?'mv':extremum[3],filter:comparison}};}
 return null;
}
