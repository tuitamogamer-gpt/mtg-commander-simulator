// New closed compositions; successful v18 descriptors remain unchanged.
import * as v18 from './oracle-extensions-v18.mjs';
export * from './oracle-extensions-v18.mjs';
const body=(effects,targets=[])=>({effects,targets,optional:false});
export function modifierOperation(card,line,h){
 if(line==='As an additional cost to cast this spell, discard X cards at random.')return {kind:'mechanic-additional-costs',announcesXV19:true,costs:[{id:'cost-1',kind:'discard',quantity:{min:0,max:0,xV19:true},object:{kind:'card'},randomV18:true}],contract:'mechanic-additional-costs'};
 const extra=/^As an additional cost to cast this spell, (discard X(?: (creature|land))? cards|exile X(?: (creature))? cards from your graveyard)\.$/.exec(line);
 if(extra){const type=extra[2]||extra[3],kind=extra[1].startsWith('discard')?'discard':'exileGraveyard';return {kind:'mechanic-additional-costs',announcesXV19:!card.mana_cost?.includes('{X}'),costs:[{id:'cost-1',kind,quantity:{min:0,max:0,xV19:true},object:{kind:'card',...(type?{types:[type[0].toUpperCase()+type.slice(1)]}:{})}}],contract:'mechanic-additional-costs'};}
 return v18.modifierOperation(card,line,h);
}
export function extensionCost(text,h,card){
 const variable=/\bSacrifice X (creatures|lands)\b/.exec(text);
 if(variable){const parsed=h.cost(text.replace(variable[0],'Sacrifice a '+variable[1].slice(0,-1)));if(parsed)return {...parsed,sacN:'X',afcZeroX:true};}
 return v18.extensionCost?.(text,h,card);
}
export function extensionCondition(text,h){
 if(text==='this creature was blocked this turn')return {kind:'source-blocked-history-v19'};
 if(text==='this is an extra turn')return {kind:'extra-turn-v19'};
 const dead=/^(one|two|three|four|[0-9]+) or more creatures died this turn$/.exec(text);
 if(dead)return {kind:'count-comparison',count:{kind:'died-count',what:'creature'},min:({one:1,two:2,three:3,four:4})[dead[1]]??Number(dead[1])};
 if(text==='your library has no cards in it')return {kind:'count-comparison',count:h.count('cards in your library'),max:0};
 if(text==='one or more cards left your graveyard this turn')return {kind:'turn-stat',field:'oracleGraveDeparturesV19',min:1};
 if(text==='an opponent cast a blue spell this turn')return {kind:'opponent-cast-v19',color:'U'};
 if(text==='an opponent cast a creature spell this turn')return {kind:'opponent-cast-v19',type:'Creature'};
 return v18.extensionCondition(text,h);
}
export function extensionCount(text,h){
 if(text==='transformed permanents you control')return {kind:'transformed-permanents-v19'};
 if(/^permanents? sacrificed this turn$/.test(text))return {kind:'sacrificed-count-v19'};
 return v18.extensionCount(text,h);
}
export function extensionTarget(text,h){
 if(text==="target creature this creature is blocking"||text==="target creature it's blocking")return {...h.target('target creature'),blockedBySourceV19:true};
 if(text==='target creature that blocked this turn')return {...h.target('target creature'),blockHistoryV19:'blocks'};
 if(text==='target creature that blocked or was blocked this turn')return {...h.target('target creature'),blockHistoryV19:'any'};
 const partner=/^target creature that blocked or was blocked by a (Zombie|legendary creature) this turn$/.exec(text);
 if(partner)return {...h.target('target creature'),blockHistoryV19:'any',blockPartnerV19:partner[1]};
 if(text==='target creature that has a -1/-1 counter on it')return {...h.target('target creature'),hasCounter:'-1/-1'};
 if(text.endsWith(" that's one or more colors")){const target=h.target(text.slice(0,-" that's one or more colors".length));if(target)return {...target,notColor:'colorless'};}
 return v18.extensionTarget(text,h);
}
export function extensionLine(card,line,h){
 if(line==='This creature gets +1/+0 for each transformed permanent you control.')return {kind:'generic-static',scope:'self',power:1,toughness:0,keywords:[],multiplier:{kind:'transformed-permanents-v19'},contract:'generic-continuous-effect'};
 if(line==='Other Sliver creatures you control have outlast {2}.')return h.line(card,'Other Sliver creatures you control have "{2}, {T}: Put a +1/+1 counter on this creature. Activate only as a sorcery."');
 if(line==="Equipped creature gets +1/+2, has reach, and can't be blocked by more than one creature.")return {kind:'operation-bundle',operations:[h.line(card,'Equipped creature gets +1/+2 and has reach.'),h.line(card,"Equipped creature can't be blocked by more than one creature.")],contract:'closed-permanent-clauses'};
 if(line==='Whenever you attack with this creature and another legendary creature, draw a card.')return {kind:'generic-trigger',event:'attackersDeclared',eventFilter:{kind:'v8-event',player:'you',selfAttacking:true,subject:'another',target:h.target('target legendary creature'),minMatching:1},...h.effect(card,'Draw a card.'),contract:'generic-trigger-effect'};
 if(line==="As long as you control enchanted creature, it gets +2/+2. Otherwise, it can't block.")return {kind:'operation-bundle',operations:[{kind:'attachment-grant',power:2,toughness:2,keywords:[],conditionSubject:'affected',condition:{kind:'source-controlled'},contract:'attachment-continuous-effect'},{kind:'attachment-grant',power:0,toughness:0,keywords:[],cantBlock:true,conditionSubject:'affected',condition:{kind:'not',condition:{kind:'source-controlled'}},contract:'attachment-continuous-effect'}],contract:'closed-permanent-clauses'};
 const lure=/^All (Walls|creatures with flying) able to block this creature do so\.$/.exec(line);
 if(lure)return {kind:'filtered-lure-v19',filter:h.target(lure[1]==='Walls'?'target Wall creature':'target creature with flying'),contract:'filtered-lure-v19'};
 if(line==='This creature can block Dragons as though it had reach.')return {kind:'blocking-permission-v19',mode:'dragon-reach',contract:'blocking-permission-v19'};
 if(line==="This creature can block creatures with shadow as though they didn't have shadow.")return {kind:'blocking-permission-v19',mode:'shadow',contract:'blocking-permission-v19'};
 if(line==='When this creature dies, if it was blocked this turn, you gain 4 life.')return {kind:'generic-trigger',event:'dies',eventFilter:'self',condition:{kind:'source-blocked-history-v19'},...h.effect(card,'You gain 4 life.'),contract:'generic-trigger-effect'};
 if(line==='At end of combat, destroy each creature that blocked or was blocked this turn.')return {kind:'generic-trigger',event:'endCombat',effects:[{action:'battlefield-group',operation:'destroy',filters:[h.target('target creature that blocked or was blocked this turn')]}],targets:[],optional:false,contract:'generic-trigger-effect'};
 if(line==='Whenever this creature becomes blocked, you may have it deal damage equal to its power to target creature. If you do, this creature assigns no combat damage this turn.')return {kind:'generic-trigger',event:'becomesBlocked',eventFilter:'self-attacker',...h.effect(card,'This creature deals damage equal to its power to target creature.'),optional:true,effects:[{action:'damage',n:{kind:'source-stat',stat:'power'},target:0},{action:'no-combat-assignment-v19'}],contract:'generic-trigger-effect'};
 const suppressed=/^(Creatures|Artifacts and creatures) entering don't cause abilities to trigger\.$/.exec(line);
 if(suppressed)return {kind:'entry-trigger-suppression-v19',types:suppressed[1]==='Creatures'?['Creature']:['Artifact','Creature'],contract:'entry-trigger-suppression-v19'};
 if(line==='Instant and sorcery spells you cast have affinity for creatures.')return h.line(card,'Instant and sorcery spells you cast cost {1} less to cast for each creature you control.');
 const spellGrant=/^(Sliver spells you cast|Spells you cast with mana value 6 or greater|Noncreature spells you cast) have (cascade|improvise)\.$/.exec(line);
 if(spellGrant&&((spellGrant[1]==='Noncreature spells you cast')===(spellGrant[2]==='improvise')))return {kind:'spell-keyword-grant-v19',keyword:spellGrant[2],filter:h.target(spellGrant[1].startsWith('Sliver')?'target Sliver spell':spellGrant[1].startsWith('Spells')?'target spell with mana value 6 or greater':'target noncreature spell'),contract:'spell-keyword-grant-v19'};
 const redirected=/^All damage that would be dealt to (you|enchanted creature) is dealt to (this creature|enchanted creature|equipped creature|its controller) instead\.$/.exec(line);
 if(redirected&&(redirected[1]==='you'?redirected[2]!=='its controller':redirected[2]==='its controller'))return {kind:'damage-redirection-v19',from:redirected[1]==='you'?'controller':'host',to:redirected[2]==='this creature'?'self':redirected[2]==='its controller'?'host-controller':'host',contract:'damage-redirection-v19'};
 const attackingBatch=/^Whenever (?:you attack with one or more legendary creatures|one or more Dinosaurs you control attack), (you gain that much life|create that many Treasure tokens)\.$/.exec(line);
 if(attackingBatch){const filter=h.target(line.includes('legendary')?'target legendary creature':'target Dinosaur creature');return {kind:'generic-trigger',event:'attackersDeclared',eventFilter:{kind:'v8-event',player:'you',target:filter,minMatching:1},attackersAmountV19:true,...h.effect(card,attackingBatch[1][0].toUpperCase()+attackingBatch[1].slice(1)+'.'),contract:'generic-trigger-effect'};}
 const entryBan=/^(Creature|Permanent|Nonland permanent) cards in (graveyards|graveyards and libraries) can't enter the battlefield\.$/.exec(line);
 if(entryBan)return {kind:'entry-prohibition-v19',quality:entryBan[1].toLowerCase(),zones:entryBan[2]==='graveyards'?['graveyard']:['graveyard','library'],contract:'entry-prohibition-v19'};
 if(line==="If a card would be put into an opponent's graveyard from anywhere, exile it instead.")return {kind:'zone-replacement-v8',scope:'opponent-owned-card-v19',from:'any',to:'exile',contract:'ordered-zone-replacement'};
 const kicked=/^If this creature was kicked, it enters with (two|three) \+1\/\+1 counters on it and with (haste|flying|trample)\.$/.exec(line);
 if(kicked)return {kind:'enters-with-counters',counter:'+1/+1',n:kicked[1]==='two'?2:3,condition:{kind:'kicked'},entryKeywordsV19:[kicked[2]],contract:'permanent-enters-with-counters'};
 if(line==='{T}: Add one mana of any color among legendary creatures and planeswalkers you control.')return {kind:'mana-source',activationCost:{tap:true},produce:['W','U','B','R','G'].map(color=>({[color]:1})),produceFromCardsV18:{...h.target('target creature or planeswalker you control'),legendary:true},contract:'mana-source'};
 if(line==='When this creature enters, you may have target creature block it this turn if able.')return {kind:'generic-trigger',event:'etb',eventFilter:'self',optional:true,targets:[h.target('target creature')],effects:[{action:'combat-restriction',target:0,duration:'eot',restriction:{combatRule:{kind:'source-block',mode:'require'}}}],contract:'generic-trigger-effect'};
 if(/^Enchanted land has "Untap this land during each (?:other player's|opponent's) untap step\."\.?$/.test(line))return {kind:'attachment-grant',power:0,toughness:0,keywords:[],otherUntapV10:true,contract:'attachment-continuous-effect'};
 if(line==='Each artifact spell costs {1} more to cast for each artifact its controller controls.')return {kind:'cost-modifier',target:h.target('target artifact'),controller:'any',amount:1,multiplier:h.count('artifacts you control'),multiplierCasterV19:true,contract:'generic-cost-modification'};
 if(/^You may have .+ assign his combat damage as though he weren't blocked\.$/.test(line))return h.line(card,line.replace('his combat','its combat').replace("he weren't","it weren't"));
 if(line==='Spiders you control get +1/+1 and can\'t be blocked by creatures with defender.')return {...h.line(card,'Spiders you control get +1/+1.'),blockerFilters:[h.target('target creature with defender')],blockOnly:false};
 if(/^Dash costs you pay cost \{2\} less\s*\.?$/.test(line))return {kind:'cost-modifier',target:{what:'card',zone:'battlefield',controller:'any'},controller:'you',amount:-2,castFlagV19:'dash',contract:'generic-cost-modification'};
 if(line==='Buyback costs cost {2} less.')return {kind:'keyword-cost-v19',keyword:'buyback',amount:2,contract:'keyword-cost-v19'};
 if(line==="This creature can't attack during extra turns.")return {kind:'generic-static',scope:'self',cantAttack:true,cantBlock:false,condition:{kind:'extra-turn-v19'},contract:'generic-continuous-effect'};
 if(line==='Protection from everything')return {kind:'generic-static',scope:'self',power:0,toughness:0,keywords:[],protectionQualities:[{kind:'everythingV19'}],contract:'generic-continuous-effect'};
 if(line==='Each creature has protection from its colors.')return {kind:'generic-static',scope:'filtered-permanents',filters:[h.target('target creature')],power:0,toughness:0,keywords:[],protectionColorsV19:'self',contract:'generic-continuous-effect'};
 if(line==='This creature has protection from the colors of permanents you control.')return {kind:'generic-static',scope:'self',power:0,toughness:0,keywords:[],protectionColorsV19:'own-permanents',contract:'generic-continuous-effect'};
 if(line==='Each other creature you control has hexproof from each of its colors.')return {kind:'generic-static',scope:'filtered-permanents',filters:[{...h.target('target creature you control'),excludeSelf:true}],power:0,toughness:0,keywords:[],targetRestrictionV18:{colorsFromSelfV19:true,opponentsOnly:true},contract:'generic-continuous-effect'};
 if(line==='Hellbent — Skip your upkeep step if you have no cards in hand.'||line==='Skip your upkeep step if you have no cards in hand.')return {kind:'mechanic-player-rule-v10',rule:'skip-upkeep',players:'you',conditionV19:h.condition('you have no cards in hand'),contract:'mechanic-player-rule-v10'};
 if(line==='During turns other than yours, this Vehicle is an artifact creature.')return {kind:'v8-type-static',own:true,condition:h.condition("it's not your turn"),change:{creatureV9:true},contract:'continuous-characteristic-type'};
 if(line==='Ninjutsu abilities you activate cost {1} less to activate.')return {kind:'ability-cost-v18',ability:'ninjutsuV19',controllerOnlyV19:true,amount:-1,contract:'ability-cost-v18'};
 if(line==="Creature cards you own that aren't on the battlefield have flash.")return h.line(card,'You may cast creature spells as though they had flash.');
 const loyalty=/^[−-]X: (.+)$/.exec(line);if(loyalty){const parsed=h.effect(card,loyalty[1]);if(parsed)return {kind:'generic-ability',cost:{},loyalty:'-X',sorceryOnly:true,...parsed,contract:'generic-activated-effect'};}
 const library=/^(\{[0-9WUBRGC]+\}(?:\{[0-9WUBRGC]+\})*): Put this card from your graveyard into your library third from the top\.$/.exec(line);
 if(library)return {kind:'generic-ability',cost:{mana:library[1]},from:'graveyard',retainGraveSource:true,...body([{action:'move-to-library',target:'self',fromGraveV19:true,depthV9:2}]),contract:'generic-activated-effect'};
 if(line==="As long as it's your turn and you control an Army, this artifact is an artifact creature.")return {kind:'v8-type-static',own:true,condition:h.condition("it's your turn and you control an Army"),change:{creatureV9:true},contract:'continuous-characteristic-type'};
 const rider=/^When this creature dies, you may put it into its owner's library fifth from the top\.$/.test(line);
 if(rider)return {kind:'generic-trigger',event:'dies',eventFilter:'self',...body([{action:'move-to-library',target:'self',depthV9:4}]),optional:true,contract:'generic-trigger-effect'};
 return v18.extensionLine(card,line,h);
}
export function extensionEffect(card,line,h){
 if(line===card.name+' deals X damage to each of X targets.')return body([{action:'damage',target:0,n:'X'}],[{what:'any',zone:'battlefield',controller:'any',min:1,max:1,targetCountX:true}]);
 const exchange=/^Exchange your (hand and graveyard|graveyard and library)\.$/.exec(line);
 if(exchange)return body([{action:'zone-exchange-v19',zones:exchange[1].split(' and ')}]);
 if(line==='Exile the bottom card of target player\'s graveyard.')return body([{action:'graveyard-edge-v19',target:0,edge:'bottom',destination:'exile'}],[h.target('target player')]);
 if(line==='Choose a creature at random, then destroy the rest.')return body([{action:'random-destroy-v19',allExceptOne:true}]);
 if(line==='Choose three target nonenchantment permanents. Destroy one of them at random.')return body([{action:'random-destroy-v19',target:0}],[{...h.target('target nonenchantment permanent'),max:3,min:3}]);
 if(line==='Creatures without defender can\'t block this creature this turn.')return h.effect(card,'This creature can\'t be blocked by creatures without defender this turn.');
 const related=/^(Target artifact creature) (blocks|can't block) this creature this turn( if able)?\.$/.exec(line);
 if(related&&(related[2]==='blocks')===!!related[3])return body([{action:'combat-restriction',target:0,duration:'eot',restriction:{combatRule:{kind:'source-block',mode:related[2]==='blocks'?'require':'forbid'}}}],[h.target(related[1].toLowerCase())]);
 const mana=/^(Add .+)\. Spend this mana only to activate (abilities of artifact sources|power-up abilities)\.$/.exec(line);
 if(mana){const parsed=h.effect(card,mana[1]+'.');if(parsed?.effects.length===1&&parsed.effects[0].action==='add-mana')return {...parsed,effects:[{...parsed.effects[0],restriction:{abilities:true,...(mana[2]==='power-up abilities'?{abilityKeywordV19:'powerUp'}:{abilitySource:h.target('target artifact')})}}]};}
 if(line==='Add {R}{R}. Spend this mana only to cast Dwarf, Equipment, and Saga spells.')return h.effect(card,'Add {R}{R}. Spend this mana only to cast Dwarf or Equipment or Saga spells.');
 if(line==='Each player chooses three permanents they control, then sacrifices the rest.')return body([{action:'sacrifice-except-v19',keep:3}]);
 if(line==="Exile each permanent with mana value X or less that's one or more colors.")return body([{action:'battlefield-group',operation:'exile',filters:[{...h.target('target permanent with mana value X or less'),notColor:'colorless'}]}]);
 const opposing=/^(.+) deals ([0-9]+) damage to each opponent and each creature your opponents control\.$/.exec(line);
 if(opposing&&[card.name,'this creature','this permanent','this artifact','this enchantment'].includes(opposing[1]))return body([{action:'damage-batch',hits:[{target:'each-opponent',n:Number(opposing[2])},{filters:[h.target('target creature an opponent controls')],n:Number(opposing[2])}]}]);
 const token=/^Each opponent creates X minus one (.+)\.$/.exec(line);
 if(token){const parsed=h.effect(card,'Each opponent creates X '+token[1]+'.');if(parsed?.effects.length===1&&['token-inline','token-key'].includes(parsed.effects[0].action)&&parsed.effects[0].n==='X')return {...parsed,effects:[{...parsed.effects[0],n:{kind:'difference-v10',left:'X',right:1}}]};}
 if(line==='All suspected creatures are no longer suspected.')return body([{action:'unsuspect-v19'}]);
 if(line==='Tap target untapped creature. It deals damage equal to its power to its controller.')return body([{action:'tap',target:0},{action:'bite',target:0,otherTarget:{kind:'target-controller',index:0},stat:'power'}],[h.target('target untapped creature')]);
 return v18.extensionEffect(card,line,h);
}
