// Closed compiler v20 extensions.
// Closed additions for permanent predicates. Every successful branch consumes
// the complete clause; unsupported trailing instructions remain unsupported.
const N='(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)';
const number=x=>({a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[x]??Number(x));
const cap=x=>x[0].toUpperCase()+x.slice(1);
const body=(effects,targets=[])=>({effects,targets,optional:false});
const bundle=operations=>operations.every(Boolean)?{kind:'operation-bundle',operations,contract:'closed-permanent-clauses'}:null;
const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
const escaped=text=>String(text).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const map=(node,fn)=>Array.isArray(node)?node.map(x=>map(x,fn)):node&&typeof node==='object'?fn(Object.fromEntries(Object.entries(node).map(([k,v])=>[k,map(v,fn)]))):node;

export function normalizeCard(card,original=card){
 const normalize=text=>String(text||'').split('\n').map(line=>{
  // In these closed clauses the only object pronoun names the source; an
  // unrelated targeted paragraph must not change that lexical binding.
  if(/^(?:Heroic — )?Whenever you cast a spell that targets this creature, put (?:a|an|one|two|three|\d+) \+1\/\+1 counters? on it\.$/.test(line))return line.replace(/on it\.$/,'on this creature.');
  if(/^At the beginning of (?:each|your) end step, if this creature was dealt damage this turn, put (?:a|an|one|two|three|\d+) [+-]\d+\/[+-]\d+ counters? on it\.$/.test(line))return line.replace(/on it\.$/,'on this creature.');
  return line;
 }).join('\n');
 const originalOtherPlayer='Whenever a player casts their first multicolored spell each turn, each other player draws a card.';
 const text=String(original.oracle_text||'').split('\n').includes(originalOtherPlayer)?String(card.oracle_text||'').replace('Whenever a player casts their first multicolored spell each turn, each opponent draws a card.',originalOtherPlayer):card.oracle_text;
 return {...card,oracle_text:normalize(text),...(card.card_faces?{card_faces:card.card_faces.map(face=>({...face,oracle_text:normalize(face.oracle_text)}))}:{})};
}

export function extensionCondition(text,h){
 if(text==='three or more mana from creatures was spent to cast it')return {kind:'permanent-condition-v20',test:'event-creature-mana',min:3};
 if(text==='it was the second spell you cast this turn')return {kind:'permanent-condition-v20',test:'cast-ordinal',n:2};
 if(text==="you control three or more permanents you don't own")return {kind:'permanent-condition-v20',test:'borrowed-permanents',min:3};
 if(text==='you control three or more creatures that share a creature type')return {kind:'permanent-condition-v20',test:'shared-creature-type',min:3};
 if(text==="it's not suspected"||text==="this creature isn't suspected")return {kind:'permanent-condition-v20',test:'not-suspected'};
 const alternate=/^(?:its|this creature's) (spectacle|surge) cost was paid$/.exec(text);if(alternate)return {kind:'cast-flag-v10',flag:alternate[1]};
 if(text==='you control a transformed permanent')return {kind:'count-comparison',count:{kind:'transformed-permanents-v19'},min:1};
 if(text==="you've surveilled this turn")return {kind:'permanent-condition-v20',test:'surveilled'};
 const simple={
  'this card is in your graveyard':{kind:'permanent-condition-v20',test:'in-own-graveyard'},
  "you don't control a Ring-bearer":{kind:'permanent-condition-v20',test:'no-ring-bearer'},
  'another creature with flying entered the battlefield under your control this turn':{kind:'permanent-condition-v20',test:'another-flying-entry'},
  'you attacked with a Spacecraft this turn':{kind:'permanent-condition-v20',test:'attacked-spacecraft'},
  'you control at least two creatures that share a creature type':{kind:'permanent-condition-v20',test:'shared-creature-type'},
  'your opponents control no creatures':{kind:'count-comparison',count:{kind:'count',zone:'battlefield',what:'creature',controller:'opponents'},max:0},
  'your team gained life this turn':{kind:'turn-stat',field:'lifeGained',min:1},
  'a player discarded a card this turn':{kind:'permanent-condition-v20',test:'any-player-discarded'},
  'this creature is your Ring-bearer':{kind:'permanent-condition-v20',test:'ring-bearer'},
  "it hasn't dealt damage yet":{kind:'permanent-condition-v20',test:'never-dealt-damage'},
  "this creature hasn't dealt damage yet":{kind:'permanent-condition-v20',test:'never-dealt-damage'},
  'this card is the only creature card in your graveyard':{kind:'permanent-condition-v20',test:'only-grave-creature'},
  'all nonland permanents you control are white':{kind:'permanent-condition-v20',test:'all-nonlands-white'},
  'you control a permanent of each color':{kind:'permanent-condition-v20',test:'each-color'},
  'you control a creature with power greater than its base power':{kind:'permanent-condition-v20',test:'pumped-creature'},
  'no permanents left the battlefield this turn':{kind:'permanent-condition-v20',test:'no-permanent-left'},
  'it attacked a battle this turn':{kind:'permanent-condition-v20',test:'attacked-battle'},
  'this creature attacked a battle this turn':{kind:'permanent-condition-v20',test:'attacked-battle'},
  "it's paired with a creature with soulbond":{kind:'permanent-condition-v20',test:'soulbond-paired'},
  "this creature is paired with a creature with soulbond":{kind:'permanent-condition-v20',test:'soulbond-paired'},
  'there are two or more unlocked doors among Rooms you control':{kind:'permanent-condition-v20',test:'unlocked-doors',min:2},
 };
 if(simple[text])return simple[text];
 const attacked=new RegExp('^('+N+') or more creatures attacked this turn$').exec(text);
 if(attacked)return {kind:'permanent-condition-v20',test:'attacker-total',min:number(attacked[1])};
 const damageSources=new RegExp('^('+N+') or more sources you controlled dealt damage this turn$').exec(text);
 if(damageSources)return {kind:'permanent-condition-v20',test:'damage-sources',min:number(damageSources[1])};
 const graveTotal=new RegExp('^('+N+') or more creature cards were put into graveyards from anywhere this turn$').exec(text);
 if(graveTotal)return {kind:'permanent-condition-v20',test:'grave-creature-total',min:number(graveTotal[1])};
 const castTotal=new RegExp("^you've cast ("+N+') or more instant and sorcery spells this turn$').exec(text);
 if(castTotal)return {kind:'permanent-condition-v20',test:'instant-sorcery-cast-total',min:number(castTotal[1])};
 const suspected=/^you control no suspected ([A-Z][a-z]+)s$/.exec(text);
 if(suspected&&h.target('target '+suspected[1]+' creature'))return {kind:'permanent-condition-v20',test:'no-suspected-subtype',subtype:suspected[1]};
 const grave=/^(?:a|an) (creature|artifact|enchantment|permanent) card was put into your graveyard (?:from anywhere )?this turn$/.exec(text);
 if(grave)return {kind:'permanent-condition-v20',test:'grave-entry',type:cap(grave[1])};
 const lost=/^(?:a|an) (creature|artifact|enchantment|permanent) (?:left the battlefield under your control|was put into your graveyard from the battlefield) this turn$/.exec(text);
 if(lost)return {kind:'permanent-condition-v20',test:lost[0].includes('left')?'departed':'died-owned',type:lost[1]==='permanent'?null:cap(lost[1])};
 const died=/^a (?:non-([A-Z][a-z]+) )?creature(?: not named ([A-Za-z][A-Za-z ',:-]+))? died this turn$/.exec(text);
 if(died)return {kind:'permanent-condition-v20',test:'creature-died',...(died[1]?{excludeSubtype:died[1]}:{}),...(died[2]?{excludeName:died[2]}:{})};
 const entry=/^you had (?:an? )?([A-Z][a-z]+)(?: or ([A-Z][a-z]+))? enter the battlefield under your control this turn$/.exec(text);
 if(entry&&[entry[1],entry[2]].filter(Boolean).every(type=>h.target('target '+type+' creature')))return {kind:'permanent-condition-v20',test:'typed-entry',subtypes:[entry[1],entry[2]].filter(Boolean)};
 const counters=/^(?:it|this creature|this artifact|this permanent) has (?:a|an) (\+1\/\+1|-1\/-1|[a-z]+) counter on (?:it|this creature|this artifact|this permanent)$/.exec(text);
 if(counters)return {kind:'source-quality',filter:{what:'permanent',zone:'battlefield',controller:'any',hasCounter:counters[1]}};
 const playerLife=new RegExp('^a player lost ('+N+') or more life this turn$').exec(text);
 if(playerLife)return {kind:'permanent-condition-v20',test:'any-player-life-lost',min:number(playerLife[1])};
 const entries=new RegExp('^('+N+') or more (creatures|artifacts|lands|planeswalkers|permanents) entered the battlefield under your control this turn$').exec(text);
 if(entries)return {kind:'permanent-condition-v20',test:'entries',type:entries[2]==='permanents'?null:cap(entries[2].slice(0,-1)),min:number(entries[1])};
 if(text==='a planeswalker entered the battlefield under your control this turn')return {kind:'permanent-condition-v20',test:'entries',type:'Planeswalker',min:1};
 const hurt=new RegExp('^(?:this creature was dealt|damage was dealt to this creature|you were dealt) ('+N+') or more damage this turn$').exec(text);
 if(hurt)return {kind:'permanent-condition-v20',test:text.startsWith('you')?'player-damage':'source-received-damage',min:number(hurt[1])};
 const suffered=new RegExp('^('+N+') or more damage was dealt to it this turn$').exec(text);
 if(suffered)return {kind:'permanent-condition-v20',test:'source-received-damage',min:number(suffered[1])};
 if(text==='this creature was dealt damage this turn')return {kind:'permanent-condition-v20',test:'source-received-damage',min:1};
 if(text==='an opponent was dealt damage this turn')return {kind:'permanent-condition-v20',test:'opponent-damage',min:1};
 if(text==='a +1/+1 counter was put on a permanent under your control this turn')return {kind:'permanent-condition-v20',test:'own-counter-put',counter:'+1/+1'};
 if(text==='a permanent was put into your hand from the battlefield this turn')return {kind:'permanent-condition-v20',test:'bounced-to-you'};
 if(text==='you had another Cleric, Rogue, Warrior, or Wizard enter the battlefield under your control this turn')return {kind:'permanent-condition-v20',test:'party-entry'};
 if(text==='an artifact or creature was put into a graveyard from the battlefield this turn')return {kind:'permanent-condition-v20',test:'artifact-or-creature-died'};
 const exiled=new RegExp('^there are ('+N+') or more (cards|card types among cards) exiled with this creature$').exec(text);
 if(exiled)return {kind:'permanent-condition-v20',test:exiled[2]==='cards'?'linked-exile-count':'linked-exile-types',min:number(exiled[1])};
 return null;
}

export function extensionCount(text,h){
 if(/the chosen player's (?:hand|graveyard)$|the chosen player controls$/.test(text)){
  const count=h.count(text.replace(/the chosen player's /g,'your ').replace(/the chosen player controls/g,'you control'));
  if(count)return {kind:'permanent-count-v20',test:'chosen-player',count};
 }
 if(text==='instant and sorcery cards in your graveyard plus the number of cards with flashback you own in exile')return {kind:'permanent-count-v20',test:'grave-spells-and-exile-flashback'};
 if(text==='your life total minus the life total of an opponent with the most life')return {kind:'permanent-count-v20',test:'life-minus-opponent-max'};
 if(text==='the highest life total among all players'||text==='highest life total among players')return {kind:'permanent-count-v20',test:'highest-life'};
 if(/^loyalty counters? on planeswalkers you control$/.test(text))return {kind:'permanent-count-v20',test:'controlled-loyalty'};
 const maxHand=/^(?:cards in )?(?:the hand of the opponent with the most cards in hand|the opponent's hand with the most cards)$/.exec(text);
 if(maxHand)return {kind:'permanent-count-v20',test:'opponent-max-hand'};
 if(text==='creatures you control with toughness greater than their power'||text==='creatures you control with toughness greater than its power')return {kind:'permanent-count-v20',test:'greater-toughness-creatures'};
 if(text==='players being attacked')return {kind:'permanent-count-v20',test:'attacked-players'};
 if(text==='opponents who lost life this turn')return {kind:'permanent-count-v20',test:'opponents-lost-life'};
 if(text==='total life lost by all players this turn'||text==='the total life lost by all players this turn')return {kind:'permanent-count-v20',test:'all-life-lost'};
 if(text==='1 damage dealt to you this turn')return {kind:'permanent-count-v20',test:'player-damage'};
 if(text==='card types among spells you\'ve cast this turn')return {kind:'permanent-count-v20',test:'cast-types'};
 const named=/^other creatures? on the battlefield named (.+)$/.exec(text);
 if(named&&/^[A-Za-z][A-Za-z ',:-]+$/.test(named[1]))return {kind:'permanent-count-v20',test:'other-named-creatures',name:named[1]};
 return null;
}

export function extensionTarget(text,h){
 const stat=/^(target .+?) with (power|toughness) greater than (?:its|their) (power|toughness|base power|base toughness)$/.exec(text);
 if(stat){const base=h.target(stat[1]);if(base)return {...base,v20:{test:'relative-stat',left:stat[2],right:stat[3]}};}
 const maximum=/^(target creature)(?: with)? (?:with )?the greatest (mana value|power|toughness)$/.exec(text);
 if(maximum)return {...h.target(maximum[1]),v20:{test:'greatest-stat',stat:maximum[2]==='mana value'?'mv':maximum[2]}};
 const adventure=/^(target creature(?: you control)?) that has an Adventure$/.exec(text);
 if(adventure)return {...h.target(adventure[1]),v20:{test:'adventure'}};
 if(text==='target creature with no abilities')return {...h.target('target creature'),v20:{test:'no-abilities'}};
 return null;
}

export function extensionLine(card,line,h){
 const graveReturn=(destination='battlefield',tapped=false)=>({action:'return-grave-source',destination,tapped});
 const graveTrigger=(event,eventFilter,effects,extra={})=>({kind:'generic-trigger',event,eventFilter,zone:'graveyard',effects,targets:[],optional:false,contract:'generic-trigger-effect',...extra});
 if(line==='Whenever a Gate you control enters, you may put this card from your graveyard on top of your library.')return graveTrigger('etb',{kind:'v8-event',target:h.target('target Gate you control')},[graveReturn('library')],{optional:true,permanentGraveTriggerV20:'gate'});
 if(line==="Whenever you cast a spell, if it's the second creature spell you cast this turn, you may return this card from your graveyard to the battlefield.")return graveTrigger('castCreature','your-cast',[graveReturn()],{optional:true,permanentGraveTriggerV20:'second-creature'});
 if(line==='At the beginning of your upkeep, if this card is the only creature card in your graveyard, you may return this card to the battlefield.')return graveTrigger('upkeep','your-upkeep',[graveReturn()],{optional:true,condition:h.condition('this card is the only creature card in your graveyard'),permanentGraveTriggerV20:'only-creature'});
 const dualZone=new RegExp('^At the beginning of your upkeep, if (?:'+escaped(card.name)+'|this creature|this card) is in your graveyard or on the battlefield, you may gain 1 life\\.$').exec(line);
 if(dualZone)return bundle(['battlefield','graveyard'].map(zone=>graveTrigger('upkeep','your-upkeep',[{action:'gain-life',who:'you',n:1}],{zone,optional:true,condition:{kind:'permanent-condition-v20',test:'graveyard-or-battlefield'},permanentGraveTriggerV20:'dual-zone-life'})));
 if(line==='At the beginning of your upkeep, if this card is in your graveyard, you may exile a black creature card other than this card from your graveyard. If you do, return this card to the battlefield.')return graveTrigger('upkeep','your-upkeep',[{action:'permanent-grave-exile-return-v20',filter:h.target('target black creature card from your graveyard')}],{condition:h.condition('this card is in your graveyard'),permanentGraveTriggerV20:'exile-black'});
 if(line==='Whenever a creature enters, if it entered from your graveyard or you cast it from your graveyard, return this card from your graveyard to the battlefield tapped at the beginning of the next end step.')return graveTrigger('etb',{kind:'v8-event',target:h.target('target creature')},[{action:'delay-effect-v20',event:'endStep',own:false,body:body([graveReturn('battlefield',true)])}],{permanentGraveTriggerV20:'entered-from-grave'});
 if(line==='Whenever you scry, if you control an Island, you may exile this card from your graveyard. If you do, draw a card.')return graveTrigger('scry','your-player',[{action:'resolution-cost',payment:{kind:'exile',zone:'graveyard',target:'self',n:1},optional:true,effects:[{action:'draw',who:'you',n:1}]}],{condition:h.condition('you control an Island'),permanentGraveTriggerV20:'scry-exile'});
 const namedMill=new RegExp('^When (?:'+escaped(card.name)+'|this (?:creature|artifact|enchantment|permanent|card)) is put into your graveyard from your library, you may exile it\\. If you do, (.+)$').exec(line);
 if(namedMill){const parsed=h.effect(card,'You may exile this card from your graveyard. If you do, '+namedMill[1]);if(parsed)return graveTrigger('cardToGraveyard',{kind:'v8-event',subject:'self',from:'library'},parsed.effects,{targets:parsed.targets,optional:parsed.optional,permanentGraveTriggerV20:'milled-exile'});}
 if(line==="Whenever this creature attacks, if it's not suspected, you may suspect it.")return h.line(card,"Whenever this creature attacks, if this creature isn't suspected, you may suspect this creature.");
 const creatureOrWalker=/^Whenever a creature or planeswalker you control dies, (.+)$/.exec(line);
 if(creatureOrWalker){const op=h.line(card,'Whenever a creature you control dies, '+creatureOrWalker[1]);if(op?.kind==='generic-trigger')return {...op,eventFilter:{kind:'v8-event',target:{what:'permanent',zone:'battlefield',controller:'you',min:1,alternatives:[h.target('target creature you control'),h.target('target planeswalker you control')]}}};}
 const discardReplacement=/^If a spell or ability an opponent controls causes you to discard this card, put it onto the battlefield(?: with (two) \+1\/\+1 counters on it)? instead of putting it into your graveyard\.$/.exec(line);
 if(discardReplacement)return {kind:'permanent-discard-replacement-v20',subject:'self',n:discardReplacement[1]?2:0,contract:'permanent-discard-replacement-v20'};
 if(line==='If a spell or ability an opponent controls causes you to discard a card, you may reveal that card and put it on top of your library instead of putting it anywhere else.')return {kind:'permanent-discard-replacement-v20',subject:'controller',to:'library',optional:true,contract:'permanent-discard-replacement-v20'};
 const opponentDiscard=/^When a spell or ability an opponent controls causes you to discard this card, (.+)$/.exec(line);
 if(opponentDiscard){let text=opponentDiscard[1],condition;const predicate=/^if (.+?), (.+)$/.exec(text);if(predicate){condition=h.condition(predicate[1]);if(!condition)return null;text=predicate[2];}let parsed;
  if(text==='return it to your hand.')parsed=body([{action:'permanent-discard-return-v20',to:'hand',from:'public'}]);
  const delayed=/^return this card from your graveyard to (the battlefield with a \+1\/\+1 counter on it|your hand) at the beginning of the next end step\.$/.exec(text);
  if(delayed)parsed=body([{action:'permanent-discard-return-v20',to:delayed[1]==='your hand'?'hand':'battlefield',from:'graveyard',delay:true,...(delayed[1]==='your hand'?{}:{counter:'+1/+1',n:1})}]);
  parsed||=h.effect(card,cap(text).replace(/^It deals /,'This creature deals '));if(parsed)return {kind:'generic-trigger',event:'discarded',zone:'event-source-v20',eventFilter:'self',permanentOpponentDiscardV20:true,...(condition?{condition}:{}),...parsed,contract:'generic-trigger-effect'};
 }
 const opponentDiscards=/^Whenever a spell or ability an opponent controls causes you to discard a card, (.+)$/.exec(line);
 if(opponentDiscards){const op=h.line(card,'Whenever you discard a card, '+opponentDiscards[1]);if(op?.kind==='generic-trigger')return {...op,permanentOpponentDiscardV20:true};}
 const coloredGrant=/^As long as (.+?), this creature is (white|blue|black|red|green) and has "([^"\n]+)"\.?$/.exec(line);
 if(coloredGrant){const op=h.line(card,'As long as '+coloredGrant[1]+', this creature has "'+coloredGrant[3]+'".');if(op?.kind==='generic-static')return bundle([op,{kind:'permanent-static-v20',rule:'source-colors',condition:op.condition,colors:[colors[coloredGrant[2]]],contract:'permanent-static-v20'}]);}
 const conditionalGrant=/^As long as (.+?), this creature (has|is) (?:([a-z ,]+) and )?"([^"\n]+)"\.?$/.exec(line);
 if(conditionalGrant){const condition=h.condition(conditionalGrant[1]),child=h.line({...card,name:'__GrantedPermanent__'},conditionalGrant[4].replace(/put another \+1\/\+1 counter/,'put a +1/+1 counter')),colorsGrant=conditionalGrant[2]==='is'?colors[conditionalGrant[3]?.replace(/ and has$/,'')]:null,keywords=conditionalGrant[2]==='has'?conditionalGrant[3]?h.keywordList(conditionalGrant[3]):[]:[];
  if(condition&&child&&['generic-trigger','generic-ability','mana-source'].includes(child.kind)&&keywords&&(conditionalGrant[2]==='has'||colorsGrant))return {kind:'generic-static',scope:'self',power:0,toughness:0,keywords,condition,grantedOperation:child,...(colorsGrant?{typeChange:{colors:[colorsGrant]}}:{}),contract:'generic-continuous-effect'};
 }
 const typeGrant=/^((?:Each creature|Creatures|Other creatures)(?: you control| your opponents control)? (?:is|are) (?:(?:a|an) )?[A-Z][a-z]+(?: artifacts)? in addition to (?:its|their) other (?:creature )?types) and (?:has|have) "([^"\n]+)"\.?$/.exec(line);
 if(typeGrant){const type=typeGrant[1]==='Other creatures are Food artifacts in addition to their other types'?{kind:'permanent-static-v20',rule:'food-creatures',contract:'permanent-static-v20'}:h.line(card,typeGrant[1]+'.'),subject=typeGrant[1].replace(/ (?:is|are) .+$/,''),grant=h.line(card,subject+' '+(subject.startsWith('Each')?'has':'have')+' "'+typeGrant[2]+'".');if(type&&grant)return bundle([type,grant]);}
 const firstTap=/^Whenever this creature becomes tapped for the first time during each of your turns, (.+)$/.exec(line);
 if(firstTap){const op=h.line(card,'Whenever this creature becomes tapped, '+firstTap[1].replace(/on it\.$/,'on this creature.'));if(op?.kind==='generic-trigger')return {...op,permanentFirstTapV20:true};}
 if(line==='Whenever you attack, you create a Food token for each player being attacked.'){const op=h.line(card,'Whenever you attack, create a Food token.');if(op)return {...op,effects:op.effects.map(effect=>({...effect,n:{kind:'permanent-count-v20',test:'attacked-players'}}))};}
 if(line==='Whenever you lose life, sacrifice a permanent for each 1 life you lost.')return h.line(card,'Whenever you lose life, sacrifice that many permanents.');
 if(line==='Whenever you lose life, you gain 2 life for each 1 life you lost.'){const op=h.line(card,'Whenever you lose life, you gain that much life.');if(op)return {...op,effects:op.effects.map(effect=>({...effect,n:{kind:'product-v16',left:{kind:'event-amount'},right:2}}))};}
 const castLoss=/^Whenever a player casts a (spell|noncreature spell), (they lose 1 life for each spell they've cast this turn|this creature deals damage to that player equal to the number of noncreature spells they've cast this turn)\.$/.exec(line);
 if(castLoss){const damage=castLoss[2].startsWith('this creature'),op=h.line(card,'Whenever a player casts a '+castLoss[1]+', '+(damage?'this creature deals 1 damage to that player.':'that player loses 1 life.'));if(op?.kind==='generic-trigger')return {...op,permanentCastCountV20:damage?'noncreature':'all',effects:op.effects.map(effect=>({...effect,n:{kind:'permanent-amount-v20',test:'event-player-spells',quality:damage?'noncreature':'all'}}))};}
 if(line==='Whenever the first noncreature spell of a turn is cast, counter that spell.'){const op=h.line(card,'Whenever a player casts a noncreature spell, counter that spell.');if(op?.kind==='generic-trigger')return {...op,permanentFirstCastV20:{scope:'all',quality:'noncreature'}};}
 const firstCast=/^Whenever a player casts their first multicolored spell each turn, (.+)$/.exec(line);
 if(firstCast){const op=h.line(card,'Whenever a player casts a multicolored spell, '+firstCast[1]);if(op?.kind==='generic-trigger')return {...op,...(firstCast[1]==='each other player draws a card.'?{effects:[{action:'permanent-draw-other-players-v20',n:1}]}:{}),permanentFirstCastV20:{scope:'caster',quality:'multicolored'}};}
 const castCopy=/^Whenever an opponent casts or copies an instant or sorcery spell, they lose (\d+) life\.$/.exec(line);
 if(castCopy){const op=h.line(card,'Whenever an opponent casts an instant or sorcery spell, that player loses '+castCopy[1]+' life.');if(op?.kind==='generic-trigger')return {...op,permanentCopyAlsoV20:true};}
 const enlists=/^Whenever this creature enlists a creature, (.+)$/.exec(line);
 if(enlists){const op=h.line(card,'When this creature enters, '+enlists[1]);if(op?.kind==='generic-trigger')return {...op,kind:'permanent-native-trigger-v20',nativeEvent:'pomEnlisted',nativeSubject:'self',contract:'permanent-native-trigger-v20'};}
 const crews=/^Whenever this creature crews a Vehicle, that Vehicle (gets [+-]\d+\/[+-]\d+|gains [a-z ,]+) until end of turn\.$/.exec(line);
 if(crews){const parsed=h.effect(card,'Target creature '+crews[1]+' until end of turn.');if(parsed&&parsed.targets.length===1&&!parsed.optional)return {kind:'permanent-native-trigger-v20',event:'etb',eventFilter:{kind:'v8-event',target:h.target('target Vehicle')},nativeEvent:'oracleCrewedByV20',nativeSubject:'crewer',...parsed,targets:[],effects:parsed.effects.map(effect=>({...effect,target:'event-card'})),contract:'permanent-native-trigger-v20'};}
 const fromGrave=/^((?:When|Whenever) (?:this creature|a creature) enters) from (a|your) graveyard, (.+)$/.exec(line);
 if(fromGrave){let body=fromGrave[3];if(fromGrave[1].includes('this creature'))body=body.replace(/control of it\.$/,'control of this creature.');const parsed=/^you may attach this (?:Equipment|artifact) to it\.$/.test(body)?{kind:'generic-trigger',event:'etb',eventFilter:{kind:'v8-event',target:h.target('target creature')},targets:[],effects:[{action:'attach-source',target:'event-card'}],optional:true,contract:'generic-trigger-effect'}:h.line(card,fromGrave[1]+', '+body);if(parsed?.kind==='generic-trigger')return {...parsed,permanentEntryFromV20:'graveyard',permanentEntryOwnerV20:fromGrave[2]==='your'};}
 const graveToHand=/^When this card is put into your hand from your graveyard, (.+)$/.exec(line);
 if(graveToHand){const parsed=h.effect(card,cap(graveToHand[1]));if(parsed)return {kind:'generic-trigger',event:'cardLeftGraveyard',zone:'hand',eventFilter:{kind:'v8-event',subject:'self',to:'hand'},...parsed,contract:'generic-trigger-effect'};}
 if(line==='When this card is put into your graveyard from your library, you may put it onto the battlefield.')return {kind:'generic-trigger',event:'cardToGraveyard',zone:'graveyard',eventFilter:{kind:'v8-event',subject:'self',from:'library'},targets:[],effects:[{action:'reanimate',target:'event-card',controller:'you',tapped:false}],optional:true,contract:'generic-trigger-effect'};
 const milled=/^When this card is put into your graveyard from your library, (.+)$/.exec(line);
 if(milled){const parsed=h.effect(card,cap(milled[1]));if(parsed)return {kind:'generic-trigger',event:'cardToGraveyard',zone:'graveyard',eventFilter:{kind:'v8-event',subject:'self',from:'library'},...parsed,contract:'generic-trigger-effect'};}
 const discarded=/^When you discard this card, (.+)$/.exec(line);
 if(discarded){const parsed=h.effect(card,cap(discarded[1]));if(parsed)return {kind:'generic-trigger',event:'discarded',zone:'event-source-v20',eventFilter:'self',...parsed,contract:'generic-trigger-effect'};}
 const dieDiscard=/^When this creature dies and when you discard this card, (.+)$/.exec(line);
 if(dieDiscard){const first=h.line(card,'When this creature dies, '+dieDiscard[1]),second=h.line(card,'When you discard this card, '+dieDiscard[1]);if(first&&second)return bundle([first,second]);}
 if(line==='When this creature enters, sacrifice it unless an opponent was dealt damage this turn.'){const parsed=h.line(card,'When this creature enters, sacrifice this creature.');if(parsed)return {...parsed,effects:[{action:'conditional',condition:{kind:'not',condition:{kind:'permanent-condition-v20',test:'opponent-damage',min:1}},effects:parsed.effects}]};}
 const auraTarget=/^Whenever this creature becomes the target of an Aura spell, (.+)$/.exec(line);
 if(auraTarget){const parsed=h.line(card,'Whenever this creature becomes the target of a spell, '+auraTarget[1]);if(parsed?.kind==='generic-trigger')return {...parsed,permanentAuraSpellV20:true};}
 const ownNames=['This creature','This artifact','This permanent',card.name,card.name?.split(',')[0]].filter(Boolean).map(escaped).join('|');
 const inherited=new RegExp('^(?:As long as this (?:artifact|creature) is on the battlefield, it|'+ownNames+') has all activated abilities of (.+)\\.$').exec(line);
 if(inherited){
  let donor=inherited[1],filter,zone='battlefield',other=false,differentName=false,excludeMana=false,excludeLoyalty=false;
  if(donor.endsWith(' except mana abilities')){excludeMana=true;donor=donor.slice(0,-22);}
  if(donor.endsWith(' except for loyalty abilities')){excludeLoyalty=true;donor=donor.slice(0,-29);}
  if(donor==="creatures you control that don't have the same name as this creature"){differentName=true;filter=h.target('target creature you control');}
  else if(donor==='each other creature with a +1/+1 counter on it'){other=true;filter={...h.target('target creature'),hasCounter:'+1/+1'};}
  else if(donor==='all legendary creatures you control')filter=h.target('target legendary creature you control');
  else if(donor==='all creatures your opponents control')filter=h.target('target creature an opponent controls');
  else if(donor==='lands your opponents control')filter=h.target('target land an opponent controls');
  else if(/^all (?:land|creature) cards in all graveyards$/.test(donor)){zone='graveyard';filter=h.target('target '+donor.split(' ')[1]+' card from a graveyard');}
  else if(/^all [A-Z][a-z]+ cards in your graveyard$/.test(donor)){zone='graveyard';filter=h.target('target '+donor.split(' ')[1]+' card from your graveyard');}
  else if(/^(?:all (?:creature )?cards exiled with it|the exiled card)$/.test(donor)){zone='linked';filter={what:donor.includes('creature')?'creature':'card',zone:'exile',controller:'any',min:1};}
  else if(donor==='the chosen permanent'){zone='chosen';filter={what:'permanent',zone:'battlefield',controller:'any',min:1};}
  if(filter)return {kind:'permanent-static-v20',rule:'borrow-abilities',zone,filter,other,differentName,excludeMana,excludeLoyalty,contract:'permanent-static-v20'};
 }
 const borrowedFlex=/^(.+? has all activated abilities of .+?\.) (You may spend mana as though it were mana of any color to activate those abilities\.)$/.exec(line);
 if(borrowedFlex)return bundle([h.line(card,borrowedFlex[1]),h.line(card,borrowedFlex[2])]);
 if(line==='As long as the top card of your library is an artifact or creature card, this creature has all activated abilities of that card.')return {kind:'permanent-static-v20',rule:'borrow-abilities',zone:'top',filter:{zone:'library',what:'card',controller:'you',alternatives:[{zone:'library',what:'artifact',controller:'you',min:1},{zone:'library',what:'creature',controller:'you',min:1}],min:1},contract:'permanent-static-v20'};
 const receiverBorrow=/^Creatures you control with \+1\/\+1 counters on them have all activated abilities of all creature cards exiled with (.+)\.$/.exec(line);
 if(receiverBorrow&&[card.name,'this artifact'].includes(receiverBorrow[1]))return {kind:'permanent-static-v20',rule:'borrow-abilities',zone:'linked',filter:{what:'creature',zone:'exile',controller:'any',min:1},receivers:{...h.target('target creature you control'),hasCounter:'+1/+1'},contract:'permanent-static-v20'};
 const craftedBorrow=new RegExp('^(?:'+ownNames+') has each activated ability of the exiled cards used to craft it\\. You may activate each of those abilities only once each turn\\.$').exec(line);
 if(craftedBorrow)return {kind:'permanent-static-v20',rule:'borrow-abilities',zone:'craft',filter:{what:'card',zone:'exile',controller:'any',min:1},once:true,contract:'permanent-static-v20'};
 if(!card.permanentAbilityLinkCheckedV20&&/activated abilities of (?:all (?:creature )?cards exiled with |the exiled card)/.test(card.oracle_text||'')&&/^(?:Imprint — )?(?:\{[^}]+\}[^:]*: |When this artifact enters, if you cast it, )Exile target |^When this artifact enters, if you cast it, exile target /.test(line)){
  const operation=h.line({...card,permanentAbilityLinkCheckedV20:true},line);
  if(operation){let valid=true;const linked=map(operation,node=>{if(node.action!=='exile')return node;const target=operation.targets?.[node.target];if(!['battlefield','graveyard'].includes(target?.zone)){valid=false;return node;}return {action:'linked-exile',target:node.target,from:target.zone,link:'permanent-abilities-v20'};});if(valid)return linked;}
 }
 if(line==="Activated abilities of lands your opponents control can't be activated unless they're mana abilities.")return {kind:'permanent-static-v20',rule:'disable-nonmana',filter:h.target('target land an opponent controls'),contract:'permanent-static-v20'};
 if(line==='As this creature enters, you may choose a nonland permanent.')return {kind:'permanent-choose-object-v20',filter:h.target('target nonland permanent'),optional:true,contract:'permanent-choose-object-v20'};
 if(line==="Activated abilities of the chosen permanent can't be activated.")return {kind:'permanent-static-v20',rule:'disable-chosen-activation',contract:'permanent-static-v20'};
 const combatEntry=/^((?:When|Whenever) .+? enters) during combat, (.+)$/.exec(line);
 if(combatEntry){const op=h.line(card,combatEntry[1]+', '+combatEntry[2]);if(op?.kind==='generic-trigger'&&op.event==='etb')return {...op,permanentDuringCombatV20:true};}
 const layeredAura=/^(Enchanted creature gets [+-]\d+\/[+-]\d+)(?: and has|, has) (.+?), and "([^"]+)"\. (?:It's|It is) a ([A-Z][a-z]+) in addition to its other types\.$/.exec(line);
 if(layeredAura)return bundle([h.line(card,layeredAura[1]+' and has '+layeredAura[2]+'.'),h.line(card,'Enchanted creature has "'+layeredAura[3]+'".'),h.line(card,'Enchanted creature is a '+layeredAura[4]+' in addition to its other types.')]);
 const graveAura=/^When (a creature with mana value 6 or greater|a Ninja you control) enters, you may return this card from your graveyard to the battlefield attached to that creature\.$/.exec(line);
 if(graveAura&&/\bAura\b/.test(card.type_line||'')){const filter=h.target('target '+graveAura[1].slice(2));if(filter)return {kind:'generic-trigger',event:'etb',zone:'graveyard',eventFilter:{kind:'v8-event',target:filter},effects:[{action:'permanent-grave-aura-v20'}],targets:[],optional:true,contract:'generic-trigger-effect'};}
 const auraHand=/^When enchanted (land|creature|permanent|Plains|Island|Swamp|Mountain|Forest) (?:dies|is put into a graveyard), (you may )?return this (?:card|enchantment) (?:from your graveyard )?to (?:your|its owner's) hand\.$/.exec(line);
 if(auraHand&&/\bAura\b/.test(card.type_line||''))return {kind:'generic-trigger',event:'dies',eventFilter:{kind:'attached-object'},effects:[{action:'permanent-host-death-return-v20'}],targets:[],optional:!!auraHand[2],contract:'generic-trigger-effect'};
 const auraTransform=/^When enchanted creature dies, return this card to the battlefield transformed under your control(?: attached to (target opponent))?\.$/.exec(line);
 if(auraTransform&&/\bAura\b/.test(card.type_line||''))return {kind:'generic-trigger',event:'dies',eventFilter:{kind:'attached-object'},effects:[{action:'permanent-host-death-return-v20',transformed:true,...(auraTransform[1]?{target:0}:{})}],targets:auraTransform[1]?[h.target(auraTransform[1])]:[],optional:false,contract:'generic-trigger-effect'};
 if(/^At the beginning of your upkeep, if this card is in your graveyard, you may pay (?:\{[^}]+\})+\. If you do, return it to your hand\.$/.test(line))return h.line(card,line.replace('return it to your hand.','return this card from your graveyard to your hand.'));
 const combatTax=/^(This creature|Enchanted creature) can't (attack|attack or block|block creatures with power 3 or greater) unless (?:you pay|its controller pays) \{(\d+)\}(?: for each (card in your hand|\+1\/\+1 counter on it))?\.$/.exec(line);
 if(combatTax)return {kind:'permanent-combat-tax-v20',subject:combatTax[1]==='This creature'?'self':'attached',mode:combatTax[2]==='attack'?'attack':combatTax[2]==='attack or block'?'both':'block',...(combatTax[2].startsWith('block creatures')?{attackerPowerMin:3}:{}),mana:Number(combatTax[3]),...(combatTax[4]?{multiply:combatTax[4].startsWith('card')?{kind:'count',zone:'hand',what:'card'}:{counter:'+1/+1'}}:{}),contract:'permanent-combat-tax-v20'};
 const attackTax=/^(Creatures|Nonblack creatures) can't attack (you|you or planeswalkers you control) unless their controller pays \{(\d+|X)\} for each (?:of those creatures|creature they control that's attacking you)(, where X is the number of basic land types among lands you control)?\.$/i.exec(line);
 if(attackTax&&(attackTax[3]!=='X'||attackTax[4]))return {kind:'permanent-combat-tax-v20',subject:'all',mode:'attack',defender:attackTax[2]==='you'?'you':'you-and-walkers',mana:attackTax[3]==='X'?1:Number(attackTax[3]),...(attackTax[4]?{multiply:{kind:'count',zone:'battlefield',what:'land',unique:'basic-land-types'}}:{}),...(attackTax[1].toLowerCase()==='nonblack creatures'?{excludeColor:'B'}:{}),contract:'permanent-combat-tax-v20'};
 const castCounters=new RegExp('^This creature enters with ('+N+') ([a-z]+) counters? on it if you cast it\\.$').exec(line);
 if(castCounters)return {kind:'enters-with-counters',counter:castCounters[2],n:number(castCounters[1]),condition:{kind:'source-was-cast'},contract:'permanent-enters-with-counters'};
 const ownDeath=new RegExp('^When (?:(?:this creature|'+escaped(card.name)+') dies|you sacrifice this creature), (.+)$').exec(line);
 if(ownDeath&&/return (?:it|this card|this creature) to the battlefield/i.test(ownDeath[1])){
  let text=ownDeath[1],condition;
  const predicate=/^if (.+?), (.+)$/.exec(text);
  if(predicate){
   const notType=/^(?:it|he|she) wasn't a ([A-Z][a-z]+)$/.exec(predicate[1]);
   if(notType&&h.target('target '+notType[1]+' creature'))condition={kind:'permanent-condition-v20',test:'death-not-subtype',subtype:notType[1]};
   else condition=h.line(card,'When this creature dies, if '+predicate[1]+', draw a card.')?.condition;
   if(!condition)return null;text=predicate[2];
  }
  const parsed=h.effect({...card,permanentSelfDeathV20:true},cap(text).replace(/^Return it /,'Return this card ').replace(/\s+\./g,'.'));
  if(parsed&&JSON.stringify(parsed.effects).includes('"action":"permanent-self-return-v20"'))return {kind:'generic-trigger',event:line.startsWith('When you sacrifice')?'sacrificed':'dies',eventFilter:'self',...(condition?{condition}:{}),...parsed,contract:'generic-trigger-effect'};
 }
 const graveDeath=/^(?:When|Whenever) (a nontoken creature you own|a creature an opponent owns) dies, if this card is in your graveyard, (.+)$/.exec(line);
 if(graveDeath){const filter={...h.target('target '+(graveDeath[1].startsWith('a nontoken')?'nontoken ':'')+'creature'),ownerV9:graveDeath[1].includes('you own')?'you':'opponent'},parsed=graveDeath[2]==='exile this card.'?body([{action:'permanent-grave-exile-v20'}]):h.effect(card,cap(graveDeath[2]));if(parsed)return {kind:'generic-trigger',event:'dies',zone:'graveyard',eventFilter:{kind:'v8-event',target:filter},condition:{kind:'permanent-condition-v20',test:'in-own-graveyard'},permanentGraveWatcherV20:true,...parsed,contract:'generic-trigger-effect'};}
 const graveWatch=/^Whenever a creature you control dies while this card is in your graveyard, (.+)$/.exec(line);
 if(graveWatch){const op=h.line(card,'Whenever a creature you control dies, '+graveWatch[1]);if(op?.kind==='generic-trigger')return {...op,zone:'graveyard',permanentGraveWatcherV20:true};}
 const chooseType=/^As this (?:creature|artifact|enchantment|permanent) enters, (look at an opponent's hand, then )?choose a card type(?: other than (creature or land|creature|land))?\.$/.exec(line);
 if(chooseType)return {kind:'permanent-choose-card-type-v20',exclude:chooseType[2]?chooseType[2].split(' or ').map(cap):[],lookHand:!!chooseType[1],contract:'permanent-choose-card-type-v20'};
 if(/^As this (?:creature|artifact|enchantment|permanent) enters, choose an opponent\.$/.test(line))return {kind:'permanent-choose-opponent-v20',contract:'permanent-choose-opponent-v20'};
 const chosenUpkeep=/^At the beginning of the chosen player's upkeep, (.+)$/.exec(line);
 if(chosenUpkeep){
  const rack=/^this artifact deals X damage to that player, where X is 3 minus the number of cards in their hand\.$/.test(chosenUpkeep[1]);
  const vortex=/^this enchantment deals 3 damage to that player unless they pay \{1\} for each vortex counter on this enchantment\.$/.test(chosenUpkeep[1]);
  const op=h.line(card,'At the beginning of each upkeep, '+(rack||vortex?'draw a card.':chosenUpkeep[1]));
  if(op?.kind==='generic-trigger')return {...op,permanentChosenUpkeepV20:true,...(rack||vortex?{effects:[{action:'permanent-chosen-upkeep-v20',rule:rack?'rack':'vortex'}]}:{})};
 }
 const unattach=/^Whenever this (?:Equipment|artifact) becomes unattached from a permanent, (destroy|sacrifice) that permanent\.$/.exec(line);
 if(unattach)return {kind:'permanent-unattach-trigger-v20',operation:unattach[1],contract:'permanent-unattach-v20'};
 if(line==="If it's neither day nor night, it becomes day as this creature enters."||line==="If it's neither day nor night, it becomes day as this artifact enters.")return {kind:'permanent-daystart-v20',contract:'permanent-day-night-v20'};
 const dayNight=/^Whenever day becomes night or night becomes day, (.+)$/.exec(line);
 if(dayNight){const operation=h.line(card,'At the beginning of your upkeep, '+dayNight[1]);if(operation?.kind==='generic-trigger')return {...operation,event:'dayNightChanged',eventFilter:undefined,permanentDayNightV20:true};}
 const animation=/^This (?:enchantment|artifact|permanent|land) is an? ([0-9]+)\/([0-9]+) ((?:[A-Z][a-z]+ )*)creature(?: with ([a-z ,]+))? in addition to its other types\.$/.exec(line);
 if(animation){const subtypes=animation[3].trim().split(' ').filter(Boolean),keywords=animation[4]?h.keywordList(animation[4]):[];if(keywords&&subtypes.every(type=>h.target('target '+type+' creature')))return {kind:'v8-layered-static',own:true,change:{creatureV9:true,addCreatureTypes:subtypes},operation:{kind:'base-pt-static',power:Number(animation[1]),toughness:Number(animation[2]),keywords},contract:'continuous-layered-characteristics'};}
 if(line==='Haunt'&&/\bCreature\b/.test(card.type_line||''))return {kind:'permanent-haunt-v20',contract:'permanent-haunt-v20'};
 const haunt=/^When this creature enters or the creature it haunts dies, (.+)$/.exec(line);
 if(haunt){const base=h.line(card,'When this creature enters, '+haunt[1]);if(base?.kind==='generic-trigger')return bundle([base,{...base,kind:'permanent-haunt-trigger-v20',event:'dies',zone:'exile',contract:'permanent-haunt-v20'}]);}
 if(!card.permanentLinkCheckedV20&&/This creature has (?:flying as long as a card exiled with it has flying|protection from each of the exiled card's card types)/.test(card.oracle_text||'')&&/^(?:When|Whenever) this creature (?:enters|enters or attacks), (?:you may )?exile target card from a graveyard\.(?: Put a \+1\/\+1 counter on this creature\.)?$/.test(line)){
  const operation=h.line({...card,permanentLinkCheckedV20:true},line);
  if(operation)return map(operation,node=>node.action==='exile'?{action:'linked-exile',target:node.target,from:'graveyard',link:'permanent-v20'}:node);
 }
 const joined=/^This creature (.+ as long as .+)\.$/.exec(line);
 if(joined&&!joined[1].includes('"')){
  const clauses=joined[1].split(/, (?:and )?(?=gets |has )/);
  if(clauses.length>1)return bundle(clauses.map(text=>h.line(card,'This creature '+text+'.')));
 }
 if(line==='This creature has trample as long as you control a Beast, haste as long as you control a Goblin, first strike as long as you control a Soldier, flying as long as you control a Wizard, and "{B}: Regenerate this creature" as long as you control a Zombie.')return bundle(['This creature has trample as long as you control a Beast.','This creature has haste as long as you control a Goblin.','This creature has first strike as long as you control a Soldier.','This creature has flying as long as you control a Wizard.','This creature has "{B}: Regenerate this creature." as long as you control a Zombie.'].map(text=>h.line(card,text)));
 if(line==="This creature can't be blocked by creatures that don't have a name.")return {kind:'permanent-static-v20',rule:'nameless-blockers',contract:'permanent-static-v20'};
 if(line==="This creature can't be equipped.")return {kind:'permanent-rule-v20',rule:'cant-equip',contract:'permanent-rule-v20'};
 const inheritKeywords=/^This creature has (flying) as long as a card exiled with it has \1\. The same is true for (first strike, double strike, deathtouch, haste, hexproof, indestructible, lifelink, menace, reach, trample, and vigilance)\.$/.exec(line);
 if(inheritKeywords)return {kind:'permanent-static-v20',rule:'linked-keywords',keywords:['flying','first strike','double strike','deathtouch','haste','hexproof','indestructible','lifelink','menace','reach','trample','vigilance'],contract:'permanent-static-v20'};
 if(line==="This creature has protection from each of the exiled card's card types.")return {kind:'permanent-static-v20',rule:'linked-protection-types',contract:'permanent-static-v20'};
 if(line==="Creatures you don't control get -1/-1 for each slime counter on them.")return {kind:'generic-static',scope:'opponent-creatures',power:-1,toughness:-1,keywords:[],multiplier:{kind:'source-counters',counter:'slime'},multiplierSubject:'affected',contract:'generic-continuous-effect'};
 const threshold=/^When the (third|fourth|fifth|sixth|seventh) plan counter is put on this enchantment, (.+)$/.exec(line);
 if(threshold){const parsed=h.effect(card,cap(threshold[2]).replace(/^Sacrifice it\./,'Sacrifice this enchantment.'));if(parsed)return {kind:'permanent-event-trigger-v20',event:'countersPlaced',filter:{counter:'plan',subject:'self',reaches:{third:3,fourth:4,fifth:5,sixth:6,seventh:7}[threshold[1]]},...parsed,contract:'permanent-event-trigger-v20'};}
 const damage=/^Whenever this creature deals combat damage to a creature, destroy that creature\. It can't be regenerated\.$/.test(line);
 if(damage){const trigger=h.line(card,'Whenever this creature deals combat damage to a creature, destroy that creature.');if(trigger?.effects)return {...trigger,effects:trigger.effects.map(effect=>effect.action==='destroy'?{...effect,noRegen:true}:effect)};}
 const redistribution=/^(When this creature dies|Whenever (?:this creature or another|another|an?|a legendary) (?:creature|artifact) you control (?:dies|leaves the battlefield)), if it had counters on it, put (?:those|its) counters on (this (?:creature|artifact)|(?:up to one )?target (?:artifact or )?creature(?: you control)?)\.$/.exec(line);
 if(redistribution){const self=redistribution[2].startsWith('this '),trigger=h.line(card,redistribution[1]+', draw a card.'),target=self?null:h.target(redistribution[2]);if(trigger?.kind==='generic-trigger'&&(target||self)){const f=trigger.eventFilter,eventFilter=f==='self'?{kind:'v8-event',subject:'self'}:f?.kind==='filtered-object'?{kind:'v8-event',target:f.target,...(f.another?{subject:'another'}:{})}:f;return {...trigger,eventFilter,condition:{kind:'v8-event-condition',predicate:'past-counters',min:1},targets:target?[target]:[],effects:[{action:'permanent-copy-event-counters-v20',target:target?0:'self'}]};}}
 const ownCounters=/^When this creature (dies|leaves the battlefield), put its (\+1\/\+1) counters on (target creature you control)\.$/.exec(line);
 if(ownCounters){const trigger=h.line(card,'When this creature '+ownCounters[1]+', draw a card.'),target=h.target(ownCounters[3]);if(trigger&&target)return {...trigger,targets:[target],effects:[{action:'permanent-copy-event-counters-v20',target:0,counter:ownCounters[2]}]};}
 if(line==="Creatures entering or dying don't cause abilities to trigger.")return {kind:'permanent-rule-v20',rule:'creature-event-suppression',contract:'permanent-rule-v20'};
 const moreBlocks=/^(Enchanted|Equipped) creature gets ([+-]\d+)\/([+-]\d+), has (.+?), and can block an additional creature each combat\.$/.exec(line);
 if(moreBlocks)return bundle([h.line(card,moreBlocks[1]+' creature gets '+moreBlocks[2]+'/'+moreBlocks[3]+' and has '+moreBlocks[4]+'.'),h.line(card,moreBlocks[1]+' creature can block an additional creature each combat.')]);
 if(line==='This creature enters tapped with nine stun counters on it.')return bundle([h.line(card,'This creature enters tapped.'),h.line(card,'This creature enters with nine stun counters on it.')]);
 if(line==='If this creature was kicked, it enters with two +1/+1 counters on it and with first strike.')return {kind:'enters-with-counters',counter:'+1/+1',n:2,condition:{kind:'kicked'},entryKeywordsV19:['first strike'],contract:'permanent-enters-with-counters'};
 if(line==='This creature enters with X +1/+1 counters on it. If X is 5 or more, it enters with an additional X +1/+1 counters on it.')return {kind:'enters-with-counters',counter:'+1/+1',n:{kind:'permanent-amount-v20',test:'apocalypse-x'},contract:'permanent-enters-with-counters'};
 if(line==="This creature can't attack alone unless this creature has a +1/+1 counter on this creature.")return {kind:'generic-static',scope:'self',power:0,toughness:0,keywords:[],combatRule:{kind:'companion',attack:true,block:false},condition:{kind:'not',condition:h.condition('this creature has a +1/+1 counter on this creature')},contract:'generic-continuous-effect'};
 const colorAbilities=/^Each creature you control has vigilance if it's white, hexproof if it's blue, lifelink if it's black, first strike if it's red, and trample if it's green\.$/.test(line);
 if(colorAbilities)return bundle(['white','blue','black','red','green'].map((color,i)=>h.line(card,cap(color)+' creatures you control have '+['vigilance','hexproof','lifelink','first strike','trample'][i]+'.')));
 const angel=/^Other creatures you control that are enchanted by Auras you control have base power and toughness (\d+)\/(\d+) and have (.+)\.$/.exec(line);
 if(angel){const keywords=h.keywordList(angel[3]);if(keywords)return {kind:'permanent-static-v20',rule:'your-aura-base',power:Number(angel[1]),toughness:Number(angel[2]),keywords,contract:'permanent-static-v20'};}
 if(line==='Creatures with no abilities get +2/+2.')return {kind:'permanent-static-v20',rule:'abilityless-pump',power:2,toughness:2,contract:'permanent-static-v20'};
 if(line==='Each creature with the greatest mana value has protection from each color.')return {kind:'permanent-static-v20',rule:'greatest-mv-protection',contract:'permanent-static-v20'};
 if(line==='Nontoken artifacts you control are lands in addition to their other types.')return {kind:'permanent-static-v20',rule:'artifact-lands',contract:'permanent-static-v20'};
 const doubler=/^If a triggered ability of (an Ally|a legendary creature|a Ninja creature|another Elemental|a creature you control with power 2 or less|equipped creature|another Wolf or battle)(?: you control)? triggers, (?:that ability|it) triggers an additional time\.$/.exec(line);
 if(doubler){let phrase=doubler[1],attached=phrase==='equipped creature';if(!attached){phrase=phrase.replace(/^(an?|another) /,'');if(!phrase.includes('you control'))phrase+=' you control';}const filter=attached?null:h.target('target '+phrase);if(attached||filter)return {kind:'permanent-trigger-doubler-v20',...(attached?{attached:true}:{filter}),other:doubler[1].startsWith('another'),contract:'permanent-trigger-doubler-v20'};}
 const eventDoubler=/^If (a permanent|a Wizard you control) entering(?: the battlefield)? causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time\.$/.exec(line);
 if(eventDoubler)return {kind:'permanent-trigger-doubler-v20',entryFilter:h.target(eventDoubler[1]==='a permanent'?'target permanent':'target Wizard you control'),contract:'permanent-trigger-doubler-v20'};
 const plus=/^If one or more \+1\/\+1 counters would be put on (this creature|a creature you control|a creature or Vehicle you control), (?:twice that many|that many plus one) \+1\/\+1 counters are put on (?:it|that creature) instead\.$/.exec(line);
 if(plus)return {kind:'permanent-counter-replacement-v20',self:plus[1]==='this creature',filter:plus[1]==='this creature'?null:h.target('target '+plus[1].slice(2)),multiply:line.includes('twice')?2:1,add:line.includes('plus one')?1:0,contract:'permanent-counter-replacement-v20'};
 const counterTrigger=/^Whenever (?:you put (?:one or more |a )?(\+1\/\+1|[a-z]+) counters? on (.+?)|(?:one or more |a )?(\+1\/\+1|[a-z]+) counters? (?:are|is) put on (.+?)), (.+)$/.exec(line);
 if(counterTrigger){
  const counter=counterTrigger[1]||counterTrigger[3],own=!!counterTrigger[1],noun=(counterTrigger[2]||counterTrigger[4]).replace(/^one or more /,'').replace(/^(a|an) /,'').replace(/\bHumans\b/g,'Human creatures').replace(/\bHeroes\b/g,'Hero creatures').replace(/\b(creatures|artifacts|enchantments|lands|planeswalkers|permanents)\b/g,word=>word.slice(0,-1));
  const self=/^this (?:creature|artifact|permanent|enchantment)$/.test(noun),filter=self?null:h.target('target '+noun.replace(/^other /,'')),raw=counterTrigger[5];
  let text=raw.replace(/ This ability triggers only once each turn\.$/,'').replace(/ Do this only once each turn\.$/,'');
  const parsed=h.effect(card,cap(text));
  if(parsed&&(self||filter))return {kind:'generic-trigger',event:'countersPlaced',eventFilter:{kind:'v8-event',counter,...(own?{player:'you',playerField:'by'}:{}),...(self?{subject:'self'}:{target:filter,...(noun.startsWith('other ')?{subject:'another'}:{})})},...parsed,...(/^Whenever (?:you put a |a )/.test(line)?{permanentCounterEachV20:true}:{}),onceEachTurn:text!==raw,onceGroup:text!==raw?line:undefined,contract:'generic-trigger-effect'};
 }
 const removed=/^Whenever (a|one or more) (\+1\/\+1|-1\/-1|[a-z]+) counters? (?:is|are) removed from this (?:creature|permanent|card)( while it's exiled)?, (.+)$/.exec(line);
 if(removed){const text=cap(removed[4]).replace(/^(?:She|He|It) deals /,'This permanent deals ').replace(/^(Put (?:a|one|two|three|[0-9]+) \+1\/\+1 counters? on )it( at the beginning of the next end step\.)$/,'$1this creature$2'),parsed=h.effect(card,text);if(parsed)return {kind:'generic-trigger',event:'countersRemoved',eventFilter:{kind:'v8-event',counter:removed[2],subject:'self'},...parsed,...(removed[3]?{zone:'exile'}:{}),...(removed[1]==='a'?{permanentCounterEachV20:true}:{}),contract:'generic-trigger-effect'};}
 const anyCounter=/^Whenever you put a counter on a creature you control, (.+)\. This ability triggers only once each turn\.$/.exec(line);
 if(anyCounter){const parsed=h.effect(card,cap(anyCounter[1])+'.');if(parsed)return {kind:'generic-trigger',event:'countersPlaced',eventFilter:{kind:'v8-event',player:'you',playerField:'by',target:h.target('target creature you control')},...parsed,onceEachTurn:true,onceGroup:line,contract:'generic-trigger-effect'};}
 const firstCounter=/^Whenever one or more \+1\/\+1 counters are put on this creature for the first time each turn, (.+)$/.exec(line);
 if(firstCounter){const parsed=h.effect(card,cap(firstCounter[1]));if(parsed)return {kind:'generic-trigger',event:'countersPlaced',eventFilter:{kind:'v8-event',subject:'self',counter:'+1/+1'},...parsed,onceEachTurn:true,onceGroup:line,contract:'generic-trigger-effect'};}
 return null;
}

export function extensionEffect(card,line,h){
 if(line==='This creature gains all activated abilities of target creature until end of turn.')return body([{action:'permanent-borrow-abilities-v20',target:0}],[h.target('target creature')]);
 const enchantedBasic=/^(?:Until end of turn, enchanted|Enchanted) (Plains|Island|Swamp|Mountain|Forest) becomes .+\. It's still a land\.$/.test(line);
 if(enchantedBasic)return h.effect(card,line.replace(/([Ee]nchanted) (?:Plains|Island|Swamp|Mountain|Forest) becomes /,'$1 land becomes '));
 const animatedGrant=/^(Until end of turn, enchanted land becomes .+?) with "([^"]+)"\. It's still a land\.$/.exec(line);
 if(animatedGrant){const base=h.effect(card,animatedGrant[1]+". It's still a land."),text=animatedGrant[2]==='Whenever this creature deals damage, its controller gains that much life.'?'Whenever this creature deals damage, you gain that much life.':animatedGrant[2],child=h.line({name:'Granted Spirit',type_line:'Creature — Spirit'},text);if(base?.effects?.length&&base.targets.length===0&&child&&['generic-trigger','generic-ability','mana-source'].includes(child.kind))return {...base,effects:[...base.effects,{action:'grant-operation',target:'attached-host',operation:child}]};}
 const legendaryLand=/^Enchanted land becomes a legendary (.+ creature(?: with .+)?) until end of turn\. It's still a land\.$/.exec(line);
 if(legendaryLand){const parsed=h.effect(card,'Enchanted land becomes a '+legendaryLand[1]+" until end of turn. It's still a land.");if(parsed?.effects?.length===1&&parsed.effects[0].action==='animate')return {...parsed,effects:[{...parsed.effects[0],addSuperV20:['Legendary']}]};}
 const untilTax=/^Until your next turn, (creatures can't attack .+)$/i.exec(line);
 if(untilTax){const rule=extensionLine(card,cap(untilTax[1]),h);if(rule?.kind==='permanent-combat-tax-v20')return body([{action:'permanent-combat-tax-v20',rule,duration:'next-turn'}]);}
 if(line==="This turn, creatures can't attack unless their controller pays {X} for each attacking creature they control.")return body([{action:'permanent-combat-tax-v20',rule:{subject:'all',mode:'attack',mana:{kind:'cast-x-v14'}},duration:'turn'}]);
 if(card.permanentSelfDeathV20){
  if(/^Return (?:this card|this creature) to the battlefield(?: tapped)? transformed(?: under (?:its owner's|your) control)?(?: at the beginning of the next end step)?\.$/.test(line)){const parsed=extensionEffect(card,line.replace(' transformed',''),h);if(parsed)return {...parsed,effects:parsed.effects.map(effect=>({...effect,transformed:true}))};}
  const delayed=/^Return (?:this card|this creature) to the battlefield( tapped)?(?: under (its owner's|your) control)?(?: with one fewer ([a-z]+) counter on it)? at the beginning of (their next upkeep|the next end step)\.$/.exec(line);
  if(delayed)return body([{action:'permanent-self-return-v20',controller:delayed[2]==='your'?'you':'owner',tapped:!!delayed[1],...(delayed[3]?{fewerCounter:delayed[3]}:{}),delay:delayed[4]==='their next upkeep'?'owner-upkeep':'end-step'}]);
  const returned=new RegExp("^Return (?:this card|this creature) to the battlefield( tapped)?(?: under (its owner's|your|this creature's owner's) control)?(?: with ("+N+") (\\+1/\\+1|-1/-1|[a-z]+) counters? on (?:it|this creature))?\\.(?: (?:It|He|She)(?:'s| is) a ([A-Z][a-z]+) in addition to (?:its|his|her) other types\\.)?(?: This creature loses all abilities and gains (haste)\\.)?$").exec(line);
  if(returned&&(!returned[5]||h.target('target '+returned[5]+' creature')))return body([{action:'permanent-self-return-v20',controller:returned[2]==='your'?'you':'owner',tapped:!!returned[1],...(returned[3]?{counter:returned[4],n:number(returned[3])}:{}),...(returned[5]?{subtype:returned[5]}:{}),...(returned[6]?{loseAbilities:true,keywords:[returned[6]]}:{})}]);
 }
 const dynamic=/^((?:Until end of turn, )?(?:[Tt]his (?:enchantment|artifact|permanent)|Target land you control) becomes .+?)"(This creature's power and toughness are each equal to [^"]+)"\.( It's still a land\.)?$/.exec(line);
 if(dynamic){
  const head=dynamic[1].replace(/(?: and gains | with )$/,'').replace(/ and $/,'');
  const base=h.effect(card,head.replace(/ becomes an? /,' becomes a 0/0 ')+'.'+(dynamic[3]||''));
  const printed=dynamic[2]+(dynamic[2].endsWith('.')?'':'.'),operation=h.line({name:'Animated permanent',type_line:'Creature',oracle_text:printed,power:'*',toughness:'*'},printed);
  if(base?.effects?.length===1&&base.effects[0].action==='animate'&&operation?.kind==='characteristic-pt'){
   const {action,power,toughness,...animation}=base.effects[0];return {...base,effects:[{action:'permanent-dynamic-animation-v20',animation,operation}]};
  }
 }
 const cdaToken=/^(.+?)"((?:This token|[A-Z][A-Za-z ,'-]+)'s (?:power and toughness are each|power is|toughness is) equal to [^"]+)"\.$/.exec(line);
 if(cdaToken){
  let head=cdaToken[1],keywordText='';
  if(/\. (?:It has|Those creatures have) $/.test(head))head=head.replace(/\. (?:It has|Those creatures have) $/,'');
  else if(head.endsWith(' with '))head=head.slice(0,-6);
  else {const prefix=/^(.* creature tokens?) with ([a-z ,]+) and $/.exec(head);if(!prefix)return null;head=prefix[1];keywordText=prefix[2];}
  const created=/^(Create|Each player creates) (?:(.+), )?(a|an|one|two|three|four|five|[0-9]+) (legendary )?((?:white|blue|black|red|green|colorless)(?:,? and (?:white|blue|black|red|green|colorless)|, (?:white|blue|black|red|green|colorless))*) ((?:[A-Z][a-z]+ )+)(?:(artifact|enchantment) )?creature tokens?$/.exec(head);
  if(created){
   const subtypes=created[6].trim().split(' '),keywords=keywordText?h.keywordList(keywordText):[],name=created[2]||subtypes.join(' '),printed=cdaToken[2]+(cdaToken[2].endsWith('.')?'':'.');
   const text=printed.replace(/^This token's /,"This creature's ").replace(/its controller's graveyard/g,'your graveyard');
   const operation=h.line({name,type_line:'Creature',oracle_text:text,power:'*',toughness:'*'},text);
   if(operation?.kind==='characteristic-pt'&&keywords&&subtypes.every(type=>h.target('target '+type+' creature'))&&(!created[2]||created[4]))return body([{action:'token-inline',who:created[1]==='Create'?'you':'each-player',n:number(created[3]),token:{name,super:created[4]?['Legendary']:[],types:[...(created[7]?[cap(created[7])]:[]),'Creature'],subtypes,colors:(created[5].match(/white|blue|black|red|green/g)||[]).map(color=>colors[color]),keywords,power:'*',toughness:'*',oracle:printed,operations:[operation]}}]);
  }
 }
 if(line==="If it's night, it becomes day. Otherwise, it becomes night.")return body([{action:'conditional',condition:{kind:'day-night-state-v10',state:'night'},effects:[{action:'day-night-v12',state:'day'}],elseEffects:[{action:'day-night-v12',state:'night'}]}]);
 const twoCounters=/^Put (a|an|one|two|three) (\+1\/\+1|-1\/-1|[a-z]+) counters? on (target .+?) and (a|an|one|two|three) (\+1\/\+1|-1\/-1|[a-z]+) counters? on (this (?:creature|artifact|enchantment|permanent))\.$/.exec(line);
 if(twoCounters){const target=h.target(twoCounters[3]);if(target)return body([{action:'counter',target:0,counter:twoCounters[2],n:number(twoCounters[1])},{action:'counter',target:'self',counter:twoCounters[5],n:number(twoCounters[4])}],[target]);}
 const chimera=/^Put a \+2\/\+2 counter on target Chimera creature\. It gains (flying|first strike|trample|vigilance)\.$/.exec(line);
 if(chimera)return body([{action:'counter',target:0,counter:'+2/+2',n:1},{action:'base-pt',target:0,keywords:[chimera[1]],temporary:false}],[h.target('target Chimera creature')]);
 const counter=/^Put (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) ([+-]\d+\/[+-]\d+) counters? on (target .+|this creature|this artifact|this permanent)\.$/.exec(line);
 if(counter&&!['+1/+1','-1/-1','-0/-1'].includes(counter[2])){const target=counter[3].startsWith('this ')?'self':0,spec=target===0?h.target(counter[3]):null;if(target==='self'||spec)return body([{action:'counter',target,counter:counter[2],n:number(counter[1])}],spec?[spec]:[]);}
 const cannot=/^This creature gets ([+-]\d+)\/([+-]\d+) until end of turn and can attack this turn as though it didn't have defender\.$/.exec(line);
 if(cannot)return body([{action:'pump',target:'self',power:Number(cannot[1]),toughness:Number(cannot[2]),keywords:[]},{action:'combat-restriction',target:'self',duration:'eot',restriction:{combatRule:{kind:'defender-permission'}}}]);
 return null;
}
