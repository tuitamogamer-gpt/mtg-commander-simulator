// Closed grammar additions. Every accepted clause has an explicit runtime
// descriptor; unknown suffixes and ambiguous pronouns remain unsupported.
import { parseOracleSpellV4 } from './oracle-spell-v4.mjs';
const NUM = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)';
const amount = value => ({ a:1, an:1, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 }[value.toLowerCase()] ?? Number(value));
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TYPES = '(?:artifact or enchantment|artifact or creature|artifact or land|creature or planeswalker|instant or sorcery|nonland permanent|permanent|creature|artifact|enchantment|land|planeswalker|card)';

export function extensionTarget(phrase) {
  let text = phrase.trim().toLowerCase();
  const spec = { what: 'creature', zone: 'battlefield', controller: 'any', min: 1 };
  if (text.startsWith('another ')) { spec.excludeSelf = true; text = text.slice(8); }
  if (text.startsWith('up to one ')) { spec.min = 0; text = text.slice(10); }
  if (!text.startsWith('target ')) return null;
  text = text.slice(7);
  if (text.endsWith(' from your graveyard')) { spec.zone = 'graveyard'; spec.controller = 'you'; text = text.slice(0, -20); }
  else if (text.endsWith(' from a graveyard')) { spec.zone = 'graveyard'; text = text.slice(0, -17); }
  const restriction = / with (mana value|power|toughness) (\d+) or (less|greater)$/.exec(text);
  if (restriction) {
    spec.stat = restriction[1] === 'mana value' ? 'mv' : restriction[1];
    spec.threshold = Number(restriction[2]); spec.comparison = restriction[3];
    text = text.slice(0, restriction.index);
  }
  if (text.endsWith(' you control')) { spec.controller = 'you'; text = text.slice(0,-12); }
  else if (text.endsWith(' an opponent controls')) { spec.controller = 'opponent'; text = text.slice(0,-21); }
  else if (text.endsWith(' defending player controls')) { spec.controller = 'defending-player'; text = text.slice(0,-26); }
  if (spec.zone === 'graveyard') text = text.replace(/ card$/, '');
  if(spec.zone==='graveyard'&&['power','toughness'].includes(spec.stat))return null;
  for (const [prefix,field] of [['attacking or blocking ','attackingOrBlocking'],['attacking ','attacking'],['blocking ','blocking'],['tapped ','tapped'],['untapped ','untapped'],['nonblack ','nonblack'],['nonartifact ','nonartifact'],['nonlegendary ','nonlegendary'],['nontoken ','nontoken']]) {
    if (text.startsWith(prefix)) { spec[field] = true; text = text.slice(prefix.length); }
  }
  const color=/^(white|blue|black|red|green|colorless|multicolored|monocolored) /.exec(text);
  if(color){spec.color=color[1];text=text.slice(color[0].length);}
  const keyword = / with(out)? (flying|defender)$/.exec(text);
  if (keyword) { spec[keyword[1] ? 'withoutKeyword' : 'withKeyword'] = keyword[2]; text = text.slice(0,keyword.index); }
  if (!new RegExp('^'+TYPES+'$').test(text)) return null;
  spec.what = text;
  return spec;
}

export function extensionEffect(card, line, helpers) {
  if (!line.endsWith('.')) return null;
  let text = line.slice(0,-1);
  let optional = false;
  if (/^you may /i.test(text)) { optional = true; text = text.slice(8); }
  const result = (effects, targets=[]) => ({ effects, targets, optional });
  let m;
  const self = '(?:this creature|this artifact|this enchantment|this land|it|'+escape(card.name)+')';
  m=/^exile the top (?:(one|two|three|four|five|six|seven|eight|nine|ten|\d+) )?cards? of your library\. (?:(Until (?:the )?end of (?:your next turn|turn)), you may (play|cast) (?:that card|those cards)|You may (play|cast) (?:that card|those cards) this turn)$/i.exec(text);
  if(m)return result([{action:'impulse',n:m[1]?amount(m[1]):1,spellsOnly:(m[3]||m[4]).toLowerCase()==='cast',nextOwnTurn:!!m[2]&&/your next turn/i.test(m[2])}]);
  m=/^exile (target .+?)(?:, then return|\. Return) (?:it|that card) to the battlefield( tapped)? under (its owner's|your) control( at the beginning of the next end step)?$/i.exec(text);
  if(m) {const target=extensionTarget(m[1]);if(target?.zone==='battlefield')return result([{action:'blink',target:0,tapped:!!m[2],controller:m[3]==='your'?'you':'owner',delayed:!!m[4]}],[target]);}
  m=/^target (opponent|player) reveals their hand\. You choose a (nonland|noncreature|noncreature, nonland|nonland, noncreature|creature|artifact|enchantment|instant or sorcery) card from it\. That player discards that card$/i.exec(text);
  if(m)return result([{action:'reveal-hand-discard',target:0,what:m[2].toLowerCase()}],[{what:m[1].toLowerCase(),min:1}]);
  m=new RegExp('^'+self+' deals damage equal to (its power|its toughness|the number of .+?) to (any target|target .+|each opponent)$','i').exec(text);
  if(m) {
    const value=extensionValue(m[1]);
    const target=m[2]==='any target'?{what:'any',min:1}:extensionTarget(m[2]);
    if(value&&(target||m[2]==='each opponent'))return result([{action:'damage',n:value,target:target?0:'each-opponent'}],target?[target]:[]);
  }
  m=/^(?:you )?gain life equal to (its power|its toughness|the number of .+)$/i.exec(text);
  if(m) {const value=extensionValue(m[1]);if(value)return result([{action:'gain-life',who:'you',n:value}]);}
  if(/^you gain that much life$/i.test(text))return result([{action:'gain-life',who:'you',n:{kind:'event-amount'}}]);
  m=new RegExp('^(untap|tap|regenerate) '+self+'$','i').exec(text);
  if(m)return result([{action:m[1].toLowerCase(),target:'self'}]);
  m=new RegExp('^'+self+" can't (block|be blocked) this turn$",'i').exec(text);
  if(m)return result([{action:m[1]==='block'?'cant-block-until-eot':'unblockable-until-eot',target:'self'}]);
  m=/^((?:another |up to one )?target .+?)\. (?:That (?:creature|permanent)|It) doesn't untap during its controller's next untap step$/i.exec(text.replace(/^tap /i,''));
  if(m&&/^tap /i.test(text)) {const target=extensionTarget(m[1]);if(target)return result([{action:'tap',target:0},{action:'skip-next-untap',target:0}],[target]);}
  m=/^put (a|an) (.+?) card from your hand onto the battlefield( tapped)?$/i.exec(text);
  if(m&&extensionSearchType(m[2]))return result([{action:'put-from-hand',what:extensionSearchType(m[2]),tapped:!!m[3],n:1}]);
  m=/^search your library for (?:up to )?(one|two|three|four|five|six|seven|eight|nine|ten|\d+) (.+?) cards, (reveal them, put them into your hand|put them onto the battlefield(?: tapped)?), then shuffle$/i.exec(text);
  if(m&&extensionSearchType(m[2]))return result([{action:'search-library',what:extensionSearchType(m[2]),maxMv:null,n:amount(m[1]),destination:m[3].includes('hand')?'hand':'battlefield',tapped:m[3].includes('tapped'),reveal:m[3].includes('reveal')}]);
  m=/^search your library for a card, put (?:it|that card) into your hand, then shuffle$/i.exec(text);
  if(m)return result([{action:'search-library',what:'card',maxMv:null,n:1,destination:'hand',tapped:false,reveal:false}]);
  m = /^(?:you )?gain (\d+) life for each (.+)$/i.exec(text);
  if(m) {const count=extensionCount(m[2]);if(count)return result([{action:'gain-life',who:'you',n:{...count,multiply:Number(m[1])}}]);}
  m=/^draw (?:a|one) card for each (.+)$/i.exec(text);
  if(m){const count=extensionCount(m[1]);if(count)return result([{action:'draw',who:'you',n:count}]);}
  m = /^create (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) (tapped )?(\d+)\/(\d+) ((?:(?:white|blue|black|red|green|colorless|and|artifact|enchantment) )+)([A-Z][a-zA-Z -]*) creature tokens?(?: with (.+))?$/i.exec(text);
  if(m) {
    const keywords=m[7]?helpers.keywordList(m[7]):[];
    if(!keywords) return null;
    const words=m[5].toLowerCase().trim().split(/\s+/), colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
    return result([{action:'token-inline',who:'you',n:amount(m[1]),tapped:!!m[2],token:{name:m[6],power:m[3],toughness:m[4],subtypes:m[6].split(' '),colors:words.filter(w=>colors[w]).map(w=>colors[w]),types:[...(words.includes('artifact')?['Artifact']:[]),...(words.includes('enchantment')?['Enchantment']:[]),'Creature'],keywords}}]);
  }
  m=/^(?:look at|reveal) the top (one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards? of your library\. You may (?:reveal (a|an) (.+?) card from among them and put it into your hand|put (a|an) (.+?) card from among them into your hand)\. Put the rest (?:on the bottom of your library in (any|a random) order|into your graveyard)$/i.exec(text);
  if(m) {
    const what=m[3]||m[5]; const descriptor=extensionSearchType(what);
    if(descriptor) return result([{action:'look-select',n:amount(m[1]),what:descriptor,revealAll:/^reveal/i.test(text),reveal:!!m[3],rest:/into your graveyard$/i.test(text)?'graveyard':'bottom',random:m[6]==='a random'}]);
  }
  m=/^look at the top (one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards? of your library, then put them back in any order$/i.exec(text);
  if(m) return result([{action:'order-top',n:amount(m[1])}]);
  m=new RegExp('^(?:you may )?(pay (\\d+) life|pay ((?:\\{(?:\\d+|[WUBRGC])\\})+)|sacrifice '+self+'|discard a card)\\. If you do, (.+)$','i').exec(text);
  if(m && helpers.effect) {
    const body=helpers.effect(card,m[4]+'.');
    if(body&&!body.optional) return {effects:[{action:'optional-payment',payment:m[2]?{life:Number(m[2])}:m[3]?{mana:m[3]}:/^sacrifice/i.test(m[1])?{sacSelf:true}:{discard:1},effects:body.effects}],targets:body.targets,optional:false};
  }
  m=/^amass (Orcs |Zombies )?(\d+)$/i.exec(text);
  if(m) return result([{action:'amass',n:Number(m[2]),subtype:m[1]?.startsWith('Orcs')?'Orc':'Zombie'}]);
  if(/^the Ring tempts you$/i.test(text)) return result([{action:'ring-tempts'}]);
  if(/^learn$/i.test(text)) return result([{action:'learn'}]);
  m = new RegExp('^'+self+' gains? (.+) until end of turn$', 'i').exec(text);
  if (m) { const keywords = helpers.keywordList(m[1]); return keywords ? result([{action:'pump',target:'self',power:0,toughness:0,keywords}]) : null; }
  m = /^(?:Until end of turn, )?(target .+?) gains? (.+?)(?: until end of turn)?$/i.exec(text);
  if (m && (/^Until end of turn, /i.test(text) || / until end of turn$/i.test(text))) {
    const target = extensionTarget(m[1]), keywords = helpers.keywordList(m[2]);
    return target && keywords ? result([{action:'pump',target:0,power:0,toughness:0,keywords}],[target]) : null;
  }
  m = /^(destroy|exile|tap|untap|regenerate) ((?:another |up to one )?target .+)$/i.exec(text);
  if (m) { const target=extensionTarget(m[2]); if(target) return result([{action:m[1].toLowerCase(),target:0}],[target]); }
  m = /^return ((?:another |up to one )?target .+?) to (your hand|its owner's hand|the battlefield(?: tapped)?(?: under your control)?)$/i.exec(text);
  if(m) {
    const target=extensionTarget(m[1]);
    if(target && (m[2].includes('battlefield') ? target.zone==='graveyard' : true)) return result([{
      action:m[2].includes('battlefield')?'reanimate':target.zone==='graveyard'?'move-to-hand':'bounce',target:0,
      ...(m[2].includes('battlefield')?{tapped:m[2].includes('tapped'),controller:m[2].includes('your control')?'you':'owner'}:{}),
    }],[target]);
  }
  m = new RegExp('^'+self+' deals ('+NUM+'|X) damage to (target .+)$','i').exec(text);
  if(m) { const target=extensionTarget(m[2]); if(target) return result([{action:'damage',target:0,n:m[1]==='X'?'X':amount(m[1])}],[target]); }
  m = /^((?:up to one )?target .+?) gets ([+-]\d+)\/([+-]\d+)(?: and gains? (.+))? until end of turn$/i.exec(text.replace(/^Until end of turn, (.+)$/i,'$1 until end of turn'));
  if(m) {
    const target=extensionTarget(m[1]), keywords=m[4]?helpers.keywordList(m[4]):[];
    if(target && keywords) return result([{action:'pump',target:0,power:Number(m[2]),toughness:Number(m[3]),keywords}],[target]);
  }
  m = new RegExp('^put ('+NUM+') (\\+1/\\+1|-1/-1|charge|stun) counters? on ((?:another |up to one )?target .+)$','i').exec(text);
  if(m) { const target=extensionTarget(m[3]); if(target) return result([{action:'counter',target:0,n:amount(m[1]),counter:m[2]}],[target]); }
  m = /^(target .+?) can't (block|be blocked) this turn$/i.exec(text);
  if(m) { const target=extensionTarget(m[1]); if(target) return result([{action:m[2]==='block'?'cant-block-until-eot':'unblockable-until-eot',target:0}],[target]); }
  m = /^(creatures your opponents control|all creatures|other creatures) get ([+-]\d+)\/([+-]\d+)(?: and gain (.+))? until end of turn$/i.exec(text);
  if(m) {
    const keywords=m[4]?helpers.keywordList(m[4]):[];
    if(keywords) return result([{action:'pump-group',who:m[1].toLowerCase().startsWith('creatures your')?'opponent-creatures':m[1].toLowerCase()==='all creatures'?'all-creatures':'all-other-creatures',power:Number(m[2]),toughness:Number(m[3]),keywords}]);
  }
  m = new RegExp('^(?:you )?mill ('+NUM+') cards?$','i').exec(text);
  if(m) return result([{action:'mill',who:'you',n:amount(m[1])}]);
  m = new RegExp('^(?:you )?discard ('+NUM+') cards?$','i').exec(text);
  if(m) return result([{action:'discard',who:'you',n:amount(m[1])}]);
  m = new RegExp('^search your library for (a|an) (.+?) card(?: with mana value (\\d+) or less)?, (reveal it, put it into your hand|put it onto the battlefield(?: tapped)?), then shuffle$','i').exec(text);
  if(m&&extensionSearchType(m[2])) return result([{action:'search-library',what:extensionSearchType(m[2]),maxMv:m[3]?Number(m[3]):null,destination:m[4].includes('hand')?'hand':'battlefield',tapped:m[4].includes('tapped'),reveal:m[4].includes('reveal'),n:1}]);
  m = /^attach (?:it|this Equipment|this creature) to (target creature you control)$/i.exec(text);
  if(m) return result([{action:'attach-source',target:0}],[extensionTarget(m[1])]);
  m = new RegExp('^prevent the next ('+NUM+') damage that would be dealt to (any target|target creature|target player) this turn$','i').exec(text);
  if(m) return result([{action:'prevent-next',target:0,n:amount(m[1])}],[m[2].toLowerCase()==='any target'?{what:'any',min:1}:m[2].toLowerCase()==='target player'?{what:'player',min:1}:extensionTarget(m[2])]);
  if(/^draw a card at the beginning of the next turn's upkeep$/i.test(text)) return result([{action:'draw-next-upkeep',n:1}]);
  return null;
}

export function extensionLine(card, line, helpers) {
  const characteristic=characteristicOperation(card,line);
  if(characteristic)return characteristic;
  // Cosmetic ability words have no rules meaning, but only remove the exact
  // known prefix, never any Oracle sentence following it.
  line=line.replace(/^(?:Landfall|Heroic|Raid|Threshold|Metalcraft|Delirium|Revolt|Morbid|Ferocious|Coven|Pack tactics|Rally|Alliance|Eerie|Survival|Flurry|Opus|Battalion|Formidable) — /,'');
  const self='(?:this creature|this artifact|this enchantment|this land|'+escape(card.name)+')';
  const numbered=/^(Soulshift|Modular|Fabricate|Afflict) (\d+)$/.exec(line);
  if(numbered) return {kind:'mechanic-'+numbered[1].toLowerCase(),n:Number(numbered[2]),contract:'mechanic-'+numbered[1].toLowerCase()};
  const offspring=/^Offspring ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(offspring) return {kind:'mechanic-offspring',cost:offspring[1],contract:'mechanic-offspring'};
  const zoneMechanic=/^(Unearth|Ninjutsu|Embalm|Eternalize|Foretell) ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
  if(zoneMechanic)return {kind:'mechanic-'+zoneMechanic[1].toLowerCase(),cost:zoneMechanic[2],contract:'mechanic-'+zoneMechanic[1].toLowerCase()};
  const graveReturn=/^((?:\{(?:\d+|[WUBRGC])\})+): Return this card from your graveyard to your hand\.$/.exec(line);
  if(graveReturn)return {kind:'mechanic-grave-return-self',cost:graveReturn[1],contract:'mechanic-grave-return-self'};
  if(['Ingest','Living weapon','For Mirrodin!'].includes(line)) {
    const name={'Ingest':'ingest','Living weapon':'living-weapon','For Mirrodin!':'for-mirrodin'}[line];
    return {kind:'mechanic-'+name,contract:'mechanic-'+name};
  }
  const patterns=[
    ['etb','self',new RegExp('^When '+self+' enters, (.+)$','i')],
    ['dies','self',new RegExp('^When '+self+' dies, (.+)$','i')],
    [['etb','dies'],'self',new RegExp('^When '+self+' enters or dies, (.+)$','i')],
    [['damageToPlayer','dealtDamage'],'self-source',new RegExp('^Whenever '+self+' deals damage, (.+)$','i')],
    ['dies','self',new RegExp('^When '+self+' is put into a graveyard from the battlefield, (.+)$','i')],
    ['attacks','self',new RegExp('^Whenever '+self+' attacks, (.+)$','i')],
    ['targeted','self',new RegExp('^When '+self+' becomes the target of a spell or ability, (.+)$','i')],
    ['cast','your-spell-targets-self',new RegExp('^Whenever you cast a spell that targets '+self+', (.+)$','i')],
    ['combatDamageToPlayer','self',new RegExp('^Whenever '+self+' deals combat damage to a player, (.+)$','i')],
    ['turnedFaceUp','self',new RegExp('^When '+self+' is turned face up, (.+)$','i')],
    ['upkeep','your-upkeep',/^At the beginning of your upkeep, (.+)$/i],
    ['drawStep','your-draw-step',/^At the beginning of your draw step, (.+)$/i],
    ['upkeep','each-upkeep',/^At the beginning of each upkeep, (.+)$/i],
    ['endStep','each-end-step',/^At the beginning of (?:the|each) end step, (.+)$/i],
    ['endStep','your-end-step',/^At the beginning of your end step, (.+)$/i],
    ['beginCombat','your-combat',/^At the beginning of combat on your turn, (.+)$/i],
    ['landfall','your-landfall',/^Whenever a land you control enters, (.+)$/i],
    ['castIS','your-cast',/^Whenever you cast an instant or sorcery spell, (.+)$/i],
    ['castNonCreature','your-cast',/^Whenever you cast a noncreature spell, (.+)$/i],
    ['castCreature','your-cast',/^Whenever you cast a creature spell, (.+)$/i],
    ['lifeGain','your-life-gain',/^Whenever you gain life, (.+)$/i],
    ['draw','your-second-draw',/^Whenever you draw your second card each turn, (.+)$/i],
    ['etb','any-creature',/^Whenever a creature enters, (.+)$/i],
    ['etb','another-creature',/^Whenever another creature enters, (.+)$/i],
    ['etb','your-creature',/^Whenever a creature you control enters, (.+)$/i],
    ['etb','another-your-creature',/^Whenever another creature you control enters, (.+)$/i],
    ['dies','your-creature',/^Whenever a creature you control dies, (.+)$/i],
    ['dies','any-creature',/^Whenever a creature dies, (.+)$/i],
    ['dies','another-creature',/^Whenever another creature dies, (.+)$/i],
    ['cast',{kind:'your-subtype-cast',subtypes:['Spirit','Arcane']},/^Whenever you cast a Spirit or Arcane spell, (.+)$/i],
    ['discarded','your-draw',/^Whenever you (?:cycle or )?discard a card, (.+)$/i],
  ];
  const castType=/^Whenever you cast (?:a|an) (white|blue|black|red|green|multicolored|colorless|artifact|enchantment|[A-Z][a-z]+) spell, (.+)$/.exec(line);
  if(castType) {
    const parsed=helpers.effect(card,castType[2])||extensionV4Body(card,castType[2]);
    if(parsed)return {kind:'generic-trigger',event:'cast',eventFilter:{kind:'your-filtered-cast',what:castType[1]},...parsed,contract:'generic-trigger-effect'};
  }
  const tribal=new RegExp('^Whenever (?:'+self+' or )?(another )?([A-Z][a-z]+)(?: creature)? you control (enters|dies), (.+)$').exec(line);
  if(tribal) {
    const parsed=helpers.effect(card,tribal[4])||extensionV4Body(card,tribal[4]);
    if(parsed)return {kind:'generic-trigger',event:tribal[3]==='enters'?'etb':'dies',eventFilter:{kind:'your-subtype',subtype:tribal[2],another:!!tribal[1]&&!line.includes(' or ')},...parsed,contract:'generic-trigger-effect'};
  }
  for(const [event,eventFilter,re] of patterns) {
    const m=new RegExp(re.source,re.flags+'s').exec(line); if(!m) continue;
    let body=m[1],condition=null;
    const conditional=/^if (.+?), (.+)$/.exec(body);
    if(conditional) {condition=extensionCondition(conditional[1]);if(!condition)return null;body=conditional[2];}
    if(event==='drawStep')body=body.replace(/^draw an additional card\.$/i,'draw a card.');
    const parsed=helpers.effect(card,body)||extensionV4Body(card,body);
    if(parsed) return {kind:'generic-trigger',event,eventFilter,...parsed,...(condition?{condition}:{}),contract:'generic-trigger-effect'};
    return null;
  }
  const activated=/^(.+): (.+)$/.exec(line);
  if(activated) {
    const cost=helpers.cost(activated[1]); if(!cost) return null;
    let body=activated[2];
    const onceEachTurn=/ Activate only once each turn\.$/i.test(body);
    const sorceryOnly=/ Activate only as a sorcery\.$/i.test(body);
    body=body.replace(/ Activate only (?:once each turn|as a sorcery)\.$/i,'');
    const parsed=helpers.effect(card,body)||extensionV4Body(card,body);
    if(parsed && (!parsed.v4Body||parsed.v4Body.operations[0].kind==='sequence') && !parsed.v4Body?.targets.some(target=>target.quantity.max===null)) return {kind:'generic-ability',cost,...parsed,onceEachTurn,sorceryOnly,contract:'generic-activated-effect'};
  }
  let m=new RegExp('^'+self+' can\'t be blocked by creatures with power (\\d+) or greater\\.$','i').exec(line);
  if(m) return {kind:'generic-static',scope:'self',evasionMinBlockerPower:Number(m[1]),contract:'generic-continuous-effect'};
  m=new RegExp('^'+self+" can't be blocked by (artifact creatures|white creatures|blue creatures|black creatures|red creatures|green creatures|Walls)\\.$",'i').exec(line);
  if(m)return {kind:'generic-static',scope:'self',excludedBlockers:m[1].toLowerCase(),contract:'generic-continuous-effect'};
  if(new RegExp('^'+self+" can't be blocked except by creatures with flying or reach\\.$",'i').test(line))return {kind:'generic-static',scope:'self',blockedOnlyByFlyingOrReach:true,contract:'generic-continuous-effect'};
  m=/^(All ([A-Z][a-z]+) creatures|Creatures your opponents control|Other ([A-Z][a-z]+)s you control) get ([+-]\d+)\/([+-]\d+)\.$/.exec(line);
  if(m)return {kind:'generic-static',scope:m[1].startsWith('All ')?'all-creatures':m[1].startsWith('Other ')?'your-other-creatures':'opponent-creatures',subtype:m[2]||m[3]||null,power:Number(m[4]),toughness:Number(m[5]),contract:'generic-continuous-effect'};
  if(new RegExp('^Creatures with power less than '+self+"'s power can't block it\\.$",'i').test(line))return {kind:'generic-static',scope:'self',evasionLessThanOwnPower:true,contract:'generic-continuous-effect'};
  m=new RegExp('^As long as (.+), ('+self+' (?:gets?|has) .+)\\.$','i').exec(line);
  if(m)return extensionLine(card,m[2]+' as long as '+m[1]+'.',helpers);
  m=new RegExp('^'+self+' gets ([+-]\\d+)/([+-]\\d+) for each (.+)\\.$','i').exec(line);
  if(m) { const count=extensionCount(m[3]);if(count)return {kind:'generic-static',scope:'self',power:Number(m[1]),toughness:Number(m[2]),multiplier:count,contract:'generic-continuous-effect'}; }
  m=new RegExp('^'+self+' gets ([+-]\\d+)/([+-]\\d+)(?: and has (.+))? as long as (.+)\\.$','i').exec(line);
  if(m) {
    const condition=extensionCondition(m[4]); const keywords=m[3]?helpers.keywordList(m[3]):[];
    if(condition && keywords) return {kind:'generic-static',scope:'self',power:Number(m[1]),toughness:Number(m[2]),keywords,condition,contract:'generic-continuous-effect'};
  }
  m=new RegExp('^'+self+' has (.+) as long as (.+)\\.$','i').exec(line);
  if(m) { const condition=extensionCondition(m[2]),keywords=helpers.keywordList(m[1]); if(condition && keywords) return {kind:'generic-static',scope:'self',keywords,condition,contract:'generic-continuous-effect'}; }
  return null;
}

function extensionV4Body(card,text) {
  const optional=/^you may /i.test(text);
  const body=(optional?text.slice(8):text).replace(/\bthis (?:creature|artifact|enchantment|land) deals\b/gi,card.name+' deals');
  const parsed=parseOracleSpellV4(card,body.charAt(0).toUpperCase()+body.slice(1));
  // Casting costs and modal selection have different announcement timing.
  // This adapter accepts only an ordinary effect sequence, with no costs.
  if(!parsed.ok||parsed.additionalCosts.length) return null;
  const top=parsed.operations[0];
  if(top.kind!=='sequence'&&!(top.kind==='modal'&&top.choose.min===1&&top.choose.max===1))return null;
  if(optional&&parsed.effects.length!==1)return null;
  return {optional,targets:[],effects:[],v4Body:{kind:'spell-v4',parserVersion:4,additionalCosts:[],targets:parsed.targets,effects:parsed.effects,operations:parsed.operations}};
}

export function extensionCondition(text) {
  text=text.replace(/^it's (attacking|blocking|tapped|untapped|enchanted|equipped)$/i,'it is $1');
  if(/^a creature died this turn$/i.test(text))return {kind:'creature-died'};
  if(/^you control three or more creatures with different powers$/i.test(text))return {kind:'coven'};
  if(/^you control no other creatures$/i.test(text))return {kind:'no-other-creatures'};
  if(/^you have no cards in hand$/i.test(text))return {kind:'hand-count',n:0};
  if(/^you have exactly one card in hand$/i.test(text))return {kind:'hand-count',n:1};
  if(/^you control creatures with total power 8 or greater$/i.test(text))return {kind:'formidable'};
  if(/^you attacked with creatures with total power 6 or greater this combat$/i.test(text))return {kind:'pack-tactics'};
  if(/^(?:this creature|it) is (attacking|blocking|tapped|untapped|enchanted|equipped)$/i.test(text))return {kind:'source-status',status:/(attacking|blocking|tapped|untapped|enchanted|equipped)$/i.exec(text)[1].toLowerCase()};
  let conditionMatch=/^you (?:have|control) (?:a|an|another) ([A-Z][a-z]+|artifact|creature|enchantment)(?: creature)?$/i.exec(text);
  if(conditionMatch)return {kind:'has-permanent',what:conditionMatch[1],other:/another /i.test(text)};
  conditionMatch=/^your life total is (\d+) or (less|greater)$/i.exec(text);
  if(conditionMatch)return {kind:'life',threshold:Number(conditionMatch[1]),comparison:conditionMatch[2]};
  conditionMatch=/^you control (one|two|three|four|five|six|seven|\d+) or more (tapped creatures|Gates|[A-Z][a-z]+s)$/.exec(text);
  if(conditionMatch)return {kind:'filtered-permanent-count',min:amount(conditionMatch[1]),what:conditionMatch[2]==='tapped creatures'?'creature':conditionMatch[2].slice(0,-1),tapped:conditionMatch[2]==='tapped creatures'};
  if(/^you cast it from your hand$/i.test(text)) return {kind:'cast-from-hand'};
  if(/^you attacked this turn$/i.test(text)) return {kind:'attacked'};
  if(/^an opponent lost life this turn$/i.test(text)) return {kind:'opponent-lost-life'};
  if(/^you control a creature with power 4 or greater$/i.test(text)) return {kind:'ferocious'};
  if(/^there are seven or more cards in your graveyard$/i.test(text)) return {kind:'graveyard-count',min:7};
  if(/^there are four or more card types among cards in your graveyard$/i.test(text)) return {kind:'graveyard-types',min:4};
  let m=new RegExp('^you control ('+NUM+') or more (artifacts|creatures|enchantments|lands)$','i').exec(text);
  if(m) return {kind:'permanent-count',type:m[2].slice(0,-1),min:amount(m[1])};
  m=/^you control (?:a|an) (Plains|Island|Swamp|Mountain|Forest)$/i.exec(text);
  if(m) return {kind:'land-subtype',subtype:m[1]};
  if(/^it's your turn$/i.test(text)) return {kind:'your-turn'};
  if(/^it's not your turn$/i.test(text)) return {kind:'not-your-turn'};
  return null;
}

function extensionValue(text) {
  if(/^its (power|toughness)$/i.test(text))return {kind:'source-stat',stat:text.toLowerCase().slice(4)};
  if(/^the number of /i.test(text))return extensionCount(text.slice(14));
  return null;
}

export function extensionSearchType(text) {
  if(/^(?:Plains|Island|Swamp|Mountain|Forest)(?: or (?:Plains|Island|Swamp|Mountain|Forest))+$/.test(text))return text;
  if(/^(?:basic land|artifact or enchantment|artifact or creature|creature or land|instant or sorcery|land|creature|artifact|enchantment|instant|sorcery|permanent|nonland permanent|card)$/i.test(text)) return text;
  if(/^[A-Z][a-z]+(?: permanent)?$/.test(text)) return text;
  return null;
}

export function extensionCount(text) {
  text=text.replace(/^instant and sorcery /,'instant or sorcery ');
  let extended=/^(white|blue|black|red|green|colorless|multicolored|nonbasic) (permanents|creatures|lands) (you control|your opponents control|on the battlefield)$/.exec(text);
  if(extended)return {kind:'count',zone:'battlefield',what:extended[2].slice(0,-1),color:extended[1],controller:extended[3]==='you control'?'you':extended[3]==='your opponents control'?'opponents':'all'};
  extended=/^(artifact|creature|enchantment|land|[A-Z][a-z]+)s? on the battlefield$/.exec(text);
  if(extended)return {kind:'count',zone:'battlefield',what:extended[1],controller:'all'};
  extended=/^(creature|artifact|enchantment|land|instant or sorcery|[A-Z][a-z]+) cards? in (your graveyard|all graveyards|your opponents' graveyards)$/.exec(text);
  if(extended)return {kind:'count',zone:'graveyard',what:extended[1],controller:extended[2]==='your graveyard'?'you':extended[2]==='all graveyards'?'all':'opponents'};
  extended=/^card types among cards in (your graveyard|all graveyards|your opponents' graveyards)$/.exec(text);
  if(extended)return {kind:'count',zone:'graveyard',what:'card',unique:'types',controller:extended[1]==='your graveyard'?'you':extended[1]==='all graveyards'?'all':'opponents'};
  if(text==='basic land types among lands you control')return {kind:'count',zone:'battlefield',what:'land',unique:'basic-land-types'};
  if(text==='colors among permanents you control')return {kind:'count',zone:'battlefield',what:'permanent',unique:'colors'};
  let m=/^(other )?(artifact|creature|enchantment|land|[A-Z][a-z]+)s? you control$/.exec(text);
  if(m) return {kind:'count',zone:'battlefield',what:m[2],other:!!m[1]};
  m=/^(creature|artifact|enchantment|land|instant or sorcery) cards? in your graveyard$/.exec(text);
  if(m) return {kind:'count',zone:'graveyard',what:m[1]};
  if(/^cards? in your hand$/.test(text)) return {kind:'count',zone:'hand',what:'card'};
  if(/^cards? in your graveyard$/.test(text)) return {kind:'count',zone:'graveyard',what:'card'};
  return null;
}

export function characteristicOperation(card,line) {
  const name='(?:'+[card.name,card.name.split(',')[0]].map(escape).join('|')+')';
  const m=new RegExp('^(?:Domain — |Vivid — )?'+name+"'s (power and toughness are each|power is|toughness is) equal to (.+)\\.$").exec(line);
  if(!m)return null;
  let text=m[2],toughnessOffset=0;
  const pair=/^(.+) and its toughness is equal to that number plus (\d+)$/.exec(text);
  if(pair){if(m[1]!=='power is')return null;text=pair[1];toughnessOffset=Number(pair[2]);}
  let offset=0,multiply=1;
  const prefix=/^(\d+) plus (.+)$/.exec(text);if(prefix){offset=Number(prefix[1]);text=prefix[2];}
  if(text.startsWith('twice ')){multiply=2;text=text.slice(6);}
  let count=text==='your life total'?{kind:'life-total'}:text.startsWith('the number of ')?extensionCount(text.slice(14)):null;
  if(!count)return null;
  return {kind:'characteristic-pt',power:m[1]!=='toughness is',toughness:!!pair||m[1]!=='power is',count,multiply,offset,toughnessOffset,contract:'characteristic-power-toughness'};
}
