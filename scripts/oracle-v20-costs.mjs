// Closed compiler v20 extensions.
// Closed costs, mana and zone permissions added after v19. This module never
// edits a successful historical descriptor or drops an unparsed rule tail.
const COLORS=['W','U','B','R','G'];
const N='(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)';
const MANA='(?:\\{(?:[0-9]+|X|[WUBRGC]|[WUBRG]/[WUBRG]|2/[WUBRG])\\})+';
const number=x=>({a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[x]??Number(x));
const body=(effects,targets=[])=>({effects,targets,optional:false});
const generic=(cost,effects,targets=[])=>({kind:'generic-ability',cost,...body(effects,targets),contract:'generic-activated-effect'});
const spellFilter=(text,h)=>{const conjunction=/^(.+?) and (.+?) spells$/.exec(text);if(conjunction){const alternatives=[conjunction[1],conjunction[2]].map(x=>spellFilter(x+' spell',h));if(alternatives.every(x=>x?.zone==='stack'))return {what:'spell',zone:'stack',min:1,alternatives};}const keywords=/^spells with (flash|flying)(?: or (flash|flying))?$/.exec(text);if(keywords){const filters=[keywords[1],keywords[2]].filter(Boolean).map(withKeyword=>({what:'card',zone:'battlefield',controller:'any',min:1,withKeyword}));return {what:'spell',zone:'stack',min:1,spellFilter:filters.length===1?filters[0]:{what:'card',zone:'battlefield',controller:'any',min:1,alternatives:filters}};}if(/ spells? or (?:an? )?.+ spells?$/.test(text)){const alternatives=text.split(/(?<=spells?) or /).map(part=>spellFilter(part,h));if(alternatives.every(x=>x?.zone==='stack'))return {what:'spell',zone:'stack',min:1,alternatives};return null;}return h.target('target '+text.replace(/^an? /,'').replace(/\bspells\b/g,'spell').replace(/^(Creature|Artifact|Enchantment|Instant|Sorcery|Noncreature|Colorless|Legendary|White|Blue|Black|Red|Green)/,x=>x.toLowerCase()));};
function manaChild(card,text,h){const child=h.line({...card,name:'__GrantedPermanent__'},text.replace(/\.?$/,'.'));if(child?.kind==='mana-source')return child;if(child?.kind!=='generic-ability'||child.from||child.activationCondition||child.targets?.length||child.effects?.length!==1||child.effects[0].action!=='add-mana'||child.cost?.mana?.includes('{X}')||Object.keys(child.cost||{}).some(k=>!['mana','tap','sacSelf','life','rmCounter'].includes(k)))return null;const e=child.effects[0];return {kind:'mana-source',activationCost:child.cost,produce:e.choices||[e.produce],...(e.multiplier?{multiplier:e.multiplier}:{}),...(e.restriction?{restriction:e.restriction}:{}),...(e.restrictionV20?{costsV20:true,restrictionV20:e.restrictionV20}:{}),contract:'mana-source'};}
const groupText=x=>x.replace(/^All /,'').replace(/^Each /,'').replace(/^([A-Z])/,c=>c.toLowerCase()).replace(/\bcreatures\b/,'creature').replace(/\bartifacts\b/,'artifact').replace(/\blands\b/,'land').replace(/^slivers\b/,'Sliver').replace(/^human\b/,'Human');

export function extensionCost(text,h){
 const paymentAtoms=text.split(/,\s*/),payments=paymentAtoms.filter(s=>/^(?:Collect evidence [1-9][0-9]*|Blight [1-9][0-9]*|Forage)$/.test(s));
 if(payments.length===1){const p=payments[0],baseText=paymentAtoms.filter(s=>s!==p).join(', '),base=baseText?h.cost(baseText):{};if(base&&Object.keys(base).every(k=>['mana','tap','life','sacSelf'].includes(k)))return {...base,additionalCostV20:{kind:p==='Forage'?'forage':p.startsWith('Blight')?'blight':'evidence',n:p==='Forage'?3:Number(p.match(/[0-9]+/)[0])}};return null;}
 const atoms=text.split(/,\s*/),counterAtoms=atoms.filter(s=>/^Put (?:a|an) (?:[a-z]+|\+1\/\+1|-1\/-1) counter on this (?:creature|artifact|enchantment|land|permanent)$/.test(s));
 if(counterAtoms.length===1){const counter=/^Put (?:a|an) (.+) counter/.exec(counterAtoms[0])[1],rest=atoms.filter(s=>s!==counterAtoms[0]),base=rest.length?h.cost(rest.join(', ')):{};return base&&!base.counter?{...base,counter}:null;}
 const tapX=atoms.filter(s=>/^Tap X untapped (.+) you control$/.test(s));
 if(tapX.length===1){const quality=/^Tap X untapped (.+) you control$/.exec(tapX[0])[1].replace(/\b(artifacts|creatures|lands|permanents|Foods)\b/g,x=>x.slice(0,-1)),filter=h.target('target '+quality+' you control'),rest=atoms.filter(s=>s!==tapX[0]),base=rest.length?h.cost(rest.join(', ')):{};return base&&filter?.zone==='battlefield'&&!base.tapFilter?{...base,tapFilter:filter,tapN:'X'}:null;}
 if(/Sacrifice this (?:Aura|Equipment|Vehicle)(?:,|$)/.test(text))return h.cost(text.replace(/Sacrifice this (?:Aura|Equipment|Vehicle)(?=,|$)/g,'Sacrifice this artifact'));
 if(text.split(/,\s*/).includes('{Q}')){const parts=text.split(/,\s*/);if(parts.filter(x=>x==='{Q}').length!==1||parts.includes('{T}'))return null;const remaining=parts.filter(x=>x!=='{Q}');const parsed=remaining.length?h.cost(remaining.join(', ')):{};return parsed?{...parsed,untapSelf:true}:null;}
 const exile=/^Exile (a|an|one|two|three|four|five|six|seven|eight|nine|ten|[1-9][0-9]*) (.+? )?cards? from your hand$/.exec(text);
 if(exile){const filter=exile[2]?h.target('target '+exile[2]+'card from a graveyard'):null;if(exile[2]&&!filter)return null;return {exileHandV20:number(exile[1]),...(filter?{exileHandFilterV20:filter}:{})};}
 const parts=text.split(/,\s*/);if(parts.includes('Discard your hand')){if(parts.filter(x=>x==='Discard your hand').length!==1)return null;const rest=parts.filter(x=>x!=='Discard your hand'),parsed=rest.length?h.cost(rest.join(', ')):{};return parsed?{...parsed,discard:'all'}:null;}
 return null;
}

export function normalizeManaOperation(op){
 if(op.kind==='generic-static'&&op.grantedOperation){const child=normalizeManaOperation(op.grantedOperation);if(child)return {...op,grantedOperation:child};}
 if(op.kind==='attachment-operation'&&op.operation){const child=normalizeManaOperation(op.operation);if(child)return {...op,operation:child};}
 if(op.kind!=='generic-ability'||op.loyalty!==undefined||op.targets?.length||op.from||op.optional||op.sorceryOnly||op.beforeAttackersOnly||op.oncePerObject||op.cost?.mana?.includes('{X}'))return null;
 const counted=op.effects?.length===1&&op.effects[0],gain=counted?.action==='hand-count-v20'&&!counted.discard&&counted.effects?.length===1&&counted.effects[0];if(gain?.action==='add-mana'&&gain.produce&&Object.entries(gain.produce).every(([c,n])=>'WUBRGC'.includes(c)&&Number.isInteger(n)&&n>0)&&gain.multiplier?.kind==='snapshot-amount-v20'&&!gain.multiplier.multiply&&Object.keys(op.cost||{}).every(k=>k==='tap'))return {kind:'mana-source',activationCost:op.cost,produce:[{C:0}],handRevealV20:{filter:counted.filter,produce:gain.produce},contract:'mana-source'};
 if(op.cost?.additionalCostV20&&op.effects?.[0]?.action==='add-mana'&&op.effects.slice(1).every(e=>e.action==='counter'&&e.target==='self'&&Number.isInteger(e.n)&&e.n>0)&&Object.keys(op.cost).every(k=>['mana','tap','life','sacSelf','additionalCostV20'].includes(k))){const e=op.effects[0];return {kind:'mana-source',activationCost:op.cost,produce:e.choices||[e.produce],...(e.restriction?{restriction:e.restriction}:{}),...(op.effects.length>1?{afterEffects:op.effects.slice(1)}:{}),activationPaymentV20:true,contract:'mana-source'};}
 if(op.effects?.length!==1||!['add-mana','add-mana-v20'].includes(op.effects[0].action))return null;
 const allowed=new Set(['mana','tap','untapSelf','life','discard','discardFilter','exileFromGY','exileFilter','exileHandV20','exileHandFilterV20','sacSelf','sacWhat','sacOther','sacFilter','sacN','rmCounter']);
 if(Object.keys(op.cost||{}).some(key=>!allowed.has(key))||!op.effects[0].restrictionV20&&!op.effects[0].splitManaV20&&!['discard','exileFromGY','exileHandV20','untapSelf'].some(key=>op.cost?.[key]))return null;
 const e=op.effects[0];return {kind:'mana-source',costsV20:true,activationCost:op.cost,produce:e.choices||[e.produce],...(e.multiplier?{multiplier:e.multiplier}:{}),...(e.restriction?{restriction:e.restriction}:{}),...(e.restrictionV20?{restrictionV20:e.restrictionV20}:{}),...(e.splitManaV20?{splitManaV20:e.splitManaV20}:{}),...(op.activationCondition?{condition:op.activationCondition}:{}),...(op.onceEachTurn?{onceEachTurn:true}:{}),contract:'mana-source'};
}

export function extensionCount(text,h){
 const crafted={'the total power of the exiled cards used to craft it':'power','the number of colors among the exiled cards used to craft it':'colors','colors among the exiled cards used to craft it':'colors','the mana value of the exiled card used to craft it':'mv'};if(crafted[text])return {kind:'craft-stat-v20',stat:crafted[text]};
 const otherGrave=/^(?:the number of )?other (.+?) cards? in your graveyard$/.exec(text);if(otherGrave){const count=h.count(otherGrave[1]+' cards in your graveyard');if(count?.kind==='count'&&count.zone==='graveyard')return {...count,other:true};}
 const revealed=/^the revealed card's (mana value|power)$/.exec(text);if(revealed)return {kind:'casting-reveal-stat-v20',stat:revealed[1]==='mana value'?'mv':'power'};
 if(text==='your speed')return {kind:'player-speed-count-v20'};
 if(/^(?:the number of )?opponents? you have$/.test(text))return {kind:'opponents-count-v20'};
 if(text==='the greatest mana value of a commander you own on the battlefield or in the command zone')return {kind:'commander-mv-v20'};
 if(text==='the amount of life you lost this turn')return {kind:'turn-count',field:'lifeLost'};
 if(text==='the amount of life you gained this turn')return {kind:'turn-count',field:'lifeGained'};
 if(text==='the number of +1/+1 counters on creatures you control'||text==='+1/+1 counter on creatures you control')return {kind:'counters-on-creatures-v20',counter:'+1/+1'};
 if(text==='the number of differently named lands you control')return {kind:'distinct-land-names-v20'};
 if(text==='each different power among creatures you control'||text==='the number of different powers among creatures you control')return {kind:'distinct-creature-power-v20'};
 return null;
}

export function extensionCondition(text,h){
 if(text==='this artifact or another artifact entered the battlefield under your control this turn')return h.condition('one or more artifacts entered the battlefield under your control this turn');
 if(/^(?:this spell's|its) prowl cost was paid$/.test(text))return {kind:'prowl-paid-v20'};
 const hand=new RegExp('^you have ('+N+') or (more|fewer) cards in your hand$').exec(text);if(hand)return {kind:'count-comparison',count:{kind:'count',zone:'hand',what:'card'},[hand[2]==='more'?'min':'max']:number(hand[1])};
 if(text==='your life total is less than your starting life total')return {kind:'life-below-start-v20'};
 if(text==='an opponent controls at least four more creatures than you')return {kind:'opponent-more-creatures-v20',n:4};
 if(text==="you've drawn three or more cards this turn")return {kind:'turn-stat',field:'drewThisTurn',min:3};
 return null;
}

export function extensionLine(card,line,h){
 const fixedX=/^(.+) X is the number of cards in an opponent's hand\.$/.exec(line);if(fixedX){const child=h.line(card,fixedX[1]);if(child?.kind==='generic-ability'&&child.cost?.mana?.includes('{X}')&&Object.keys(child.cost).every(k=>['mana','tap'].includes(k)))return {...child,fixedXCostV20:{kind:'opponent-hand'}};}
 const exileReturn=new RegExp('^('+MANA+'): Put this card from exile onto the battlefield( tapped)?\\.( Activate only as a sorcery\\.)?$').exec(line);if(exileReturn&&!exileReturn[1].includes('{X}'))return {kind:'exile-return-v20',mana:exileReturn[1],tapped:!!exileReturn[2],sorceryOnly:!!exileReturn[3],contract:'exile-return-v20'};
 const xRestriction=/^Spend only (black|black and\/or red) mana on X\.$/.exec(line);if(xRestriction&&String(card.mana_cost||'').includes('{X}'))return {kind:'mechanic-mana-x-v20',colors:xRestriction[1]==='black'?['B']:['B','R'],contract:'mechanic-mana-x-v20'};
 const abilityX=/^(.*) Spend only (black|black and\/or red) mana on X\.$/.exec(line);if(abilityX){const child=h.line(card,abilityX[1]);if(child?.kind==='generic-ability'&&child.cost?.mana?.includes('{X}'))return {...child,cost:{...child.cost,manaXColorsV20:abilityX[2]==='black'?['B']:['B','R']}};}
 const equipEither=/^Equip—Pay (\{[1-9][0-9]*\}) or discard a card\.$/.exec(line);if(equipEither)return {kind:'generic-ability',oracleEquip:true,label:line,cost:{mana:equipEither[1],discardAlternativeV20:1},targets:[h.target('target creature you control')],effects:[{action:'attach-source',target:0}],sorceryOnly:true,contract:'generic-activated-effect'};
 const uncounterableMana=/^(.+?: Add .+?\.) Spend this mana only to cast (a legendary spell|a creature spell of the chosen type), and that spell can't be countered\.$/.exec(line);
 if(uncounterableMana){const child=manaChild(card,uncounterableMana[1],h),restrictionV20=uncounterableMana[2]==='a legendary spell'?{mode:'filtered-spell',filter:spellFilter('legendary spell',h)}:{mode:'chosen-creature-spell',chosenSubtypeV20:true};if(child&&(!restrictionV20.filter||restrictionV20.filter.zone==='stack'))return {...child,costsV20:true,restrictionV20,spentRiderV20:{scope:'any-spell',kind:'uncounterable'}};}
 const assassinMana=/^(.+?: Add .+?\.) Spend this mana only to cast an Assassin spell or a spell that has freerunning, or to activate an ability of an Assassin source\.$/.exec(line);if(assassinMana){const child=manaChild(card,assassinMana[1],h);if(child)return {...child,costsV20:true,restrictionV20:{mode:'assassin-or-freerunning'}};}
 const manaRider=/^(.+?: Add .+?\.) (.+)$/.exec(line);
 if(manaRider){const riders={
  'If that mana is spent on a creature spell, it gains haste.':{scope:'creature',kind:'haste'},
  'If that mana is spent on a creature spell, it gains haste until end of turn.':{scope:'creature',kind:'haste',duration:'eot'},
  "If that mana is spent on an instant or sorcery spell, that spell can't be countered.":{scope:'instant-sorcery',kind:'uncounterable'},
  'When you spend this mana to cast a Dragon creature spell, you gain 2 life.':{scope:'dragon',kind:'gain-life',n:2,delayed:true},
  'When you spend this mana to cast a Dragon creature spell, scry 2.':{scope:'dragon',kind:'scry',n:2,delayed:true},
  'When you spend this mana to cast a spell with mana value 6 or greater, draw a card.':{scope:'mv6',kind:'draw',n:1,delayed:true},
  'When you spend this mana to cast a Dragon creature spell, it enters with an additional +1/+1 counter on it and gains hexproof until your next turn.':{scope:'dragon',kind:'jade',delayed:true},
  'If that mana is spent to cast a non-Human creature spell, that creature enters with an additional +1/+1 counter on it.':{scope:'nonhuman',kind:'entry-counter'},
  'If that mana is spent on a multicolored creature spell, that creature enters with an additional +1/+1 counter on it.':{scope:'multicolored-creature',kind:'entry-counter'}
 };const rider=riders[manaRider[2]],child=rider&&manaChild(card,manaRider[1],h);if(child?.kind==='mana-source')return {...child,spentRiderV20:rider};}
 if(card.oracleTransformFacesV20&&line==='{T}: For each color among the exiled cards used to craft this creature, add one mana of that color.')return {kind:'mana-source',activationCost:{tap:true},produce:[{C:0}],craftColorsV20:true,contract:'mana-source'};
 if(card.oracleTransformFacesV20&&line==='This creature has flying as long as an exiled card used to craft it has flying. The same is true for first strike, double strike, deathtouch, haste, hexproof, indestructible, lifelink, menace, protection, reach, trample, and vigilance.')return {kind:'craft-keywords-v20',keywords:['flying','first strike','double strike','deathtouch','haste','hexproof','indestructible','lifelink','menace','protection','reach','trample','vigilance'],contract:'craft-keywords-v20'};
 const craft=new RegExp('^Craft with (.+?) ('+MANA+')$').exec(line);
 if(craft&&card.oracleTransformFacesV20&&!craft[2].includes('{X}')){
  const quantity=/^(one or more|two|three|four|five|six|seven|eight|nine|ten)(?: (.+))?$/.exec(craft[1]),min=quantity?quantity[1]==='one or more'?1:number(quantity[1]):1,quality=(quantity?quantity[2]||'permanent':craft[1]).replace(/\b(artifacts|creatures|lands|permanents)\b/g,x=>x.slice(0,-1)).replace(/Dinosaurs\b/,'Dinosaur'),filter=h.target('target '+quality+' you control'),graveFilter=h.target('target '+quality+' card from your graveyard');
  if(filter?.zone==='battlefield'&&graveFilter?.zone==='graveyard')return {kind:'mechanic-craft-v20',mana:craft[2],min,max:quantity?.[1]==='one or more'?'any':min,filter,graveFilter,contract:'mechanic-craft-v20'};
 }
 if(line==='You may spend mana as though it were mana of any color to activate those abilities.')return {kind:'mana-flexibility-v20',who:'you',scope:'borrowed-abilities',anyType:false,contract:'mana-flexibility-v20'};
 if(line==="You may spend blue mana as though it were mana of any color to pay the activation costs of this creature's abilities.")return {kind:'mana-flexibility-v20',who:'you',scope:'source-abilities',anyType:false,blueOnly:true,contract:'mana-flexibility-v20'};
 if(line==="Mana of any type can be spent to activate this creature's abilities."||line==='Mana of any type can be spent to activate '+card.name+"'s abilities.")return {kind:'mana-flexibility-v20',who:'all',scope:'source-abilities',anyType:true,contract:'mana-flexibility-v20'};
 const manaFlex=/^(You|Players) may spend mana as though it were mana of any (color|type)(?: to (cast (.+? spells)|activate abilities of (.+?)))?\.$/.exec(line);if(manaFlex){const filter=manaFlex[4]?spellFilter(manaFlex[4],h):manaFlex[5]?h.target('target '+manaFlex[5].replace(/^creatures\b/,'creature').replace(/^permanents\b/,'permanent')):null;if(!manaFlex[3]||filter)return {kind:'mana-flexibility-v20',who:manaFlex[1]==='You'?'you':'all',scope:manaFlex[4]?'spells':manaFlex[5]?'abilities':'all',anyType:manaFlex[2]==='type',...(filter?{filter}:{}),contract:'mana-flexibility-v20'};}
 const prowl=new RegExp('^Prowl ('+MANA+')$').exec(line);if(prowl&&!prowl[1].includes('{X}'))return {kind:'mechanic-prowl-v20',cost:prowl[1],contract:'mechanic-prowl-v20'};
 const grantAffinity=/^(.+? spells|Spells) you cast have affinity for (.+)\.$/.exec(line);if(grantAffinity)return h.line(card,grantAffinity[1]+' you cast cost {1} less to cast for each '+grantAffinity[2]+' you control.');
 const kickerX=new RegExp('^Kicker ('+MANA+')$').exec(line);if(kickerX&&kickerX[1].includes('{X}')&&!String(card.mana_cost||'').includes('{X}'))return {kind:'mechanic-kicker-x-v20',cost:kickerX[1],contract:'mechanic-kicker-x-v20'};
 if(!card.__kickerEntryV20&&/^Kicker \{X\}/m.test(card.oracle_text||'')&&!String(card.mana_cost||'').includes('{X}')&&/^When .+ enters, if (?:it|this creature) was kicked, /.test(line)){const child=h.line({...card,__kickerEntryV20:true},line);if(child?.kind==='generic-trigger'&&child.event==='etb'&&child.eventFilter==='self'&&child.condition?.kind==='kicked'){let found=false;const bind=node=>node==='X'?(found=true,{kind:'kicker-x-value-v20'}):Array.isArray(node)?node.map(bind):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([k,v])=>[k,bind(v)])):node;const result=bind(child);if(found)return {...result,kickerBoundV20:true};}}
 if(line==='Assist')return {kind:'mechanic-assist-v20',contract:'mechanic-assist-v20'};
 if(line==='As an additional cost to cast this spell, reveal a creature card from your hand.')return {kind:'mechanic-reveal-cost-v20',contract:'mechanic-reveal-cost-v20'};
 if(line==='You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast.')return {kind:'spell-alternative-v20',mode:'five-colors',contract:'spell-alternative-v20'};

 const tapAlternative=/^If (.+), you may tap (an?) untapped (.+?) you control rather than pay this spell's mana cost\.$/.exec(line);if(tapAlternative){const condition=h.condition(tapAlternative[1]),filter=h.target('target '+tapAlternative[3]+' you control');if(condition&&filter?.zone==='battlefield')return {kind:'mechanic-tap-cost-v20',n:1,filter,condition,alternative:true,contract:'mechanic-tap-cost-v20'};}
 const tapCost=new RegExp('^As an additional cost to cast this spell, tap ('+N+'|any number of) untapped (.+?) you control\\.$').exec(line);
 if(tapCost){const quality=tapCost[2].replace(/\b(artifacts|creatures|lands)\b/g,x=>x.slice(0,-1)).replace(/, and\/or | and\/or |, /g,' or '),filter=h.target('target '+quality+' you control');if(filter?.zone==='battlefield')return {kind:'mechanic-tap-cost-v20',n:tapCost[1]==='any number of'?'any':number(tapCost[1]),filter,contract:'mechanic-tap-cost-v20'};}

 const suspendX=new RegExp('^Suspend X—('+MANA+')\\. X can\'t be 0\\.$').exec(line);if(suspendX&&suspendX[1].includes('{X}'))return {kind:'mechanic-suspend-x-v20',cost:suspendX[1],contract:'mechanic-suspend-x-v20'};

 const powerUp=/^Power-up — (.+)$/.exec(line);if(powerUp){const op=h.line(card,powerUp[1]);if(op?.kind==='generic-ability'&&!op.from&&new RegExp('^'+MANA+'$').test(card.mana_cost||'{0}')&&new RegExp('^'+MANA+'$').test(op.cost?.mana||'{0}'))return {...op,powerUp:true,powerUpV20:true,oncePerObject:true};return null;}

 const attachedTax=/^Activated abilities of enchanted (creature|permanent) cost \{([1-9][0-9]*)\} more to activate\.$/.exec(line);if(attachedTax)return {kind:'ability-cost-attached-v20',n:Number(attachedTax[2]),contract:'ability-cost-attached-v20'};
 const ownEquip=/^This artifact's equip abilit(?:y costs|ies cost) \{([1-9][0-9]*)\} less to activate(?: if it targets a (.+?))?\.$/.exec(line);if(ownEquip){const target=ownEquip[2]&&h.target('target '+ownEquip[2]);if(!ownEquip[2]||target)return {kind:'equip-cost-v20',n:Number(ownEquip[1]),...(target?{target}:{}),contract:'equip-cost-v20'};}
 const equipCount=new RegExp('^Equip ('+MANA+')\\. This ability costs \\{([1-9][0-9]*)\\} less to activate for each (.+)\\.$').exec(line);if(equipCount){const count=h.count(equipCount[3]);if(count&&!equipCount[1].includes('{X}'))return {kind:'generic-ability',oracleEquip:true,label:line,cost:{mana:equipCount[1],manaAdjustment:{amount:-Number(equipCount[2]),count}},targets:[h.target('target creature you control')],effects:[{action:'attach-source',target:0}],sorceryOnly:true,contract:'generic-activated-effect'};}
 const grantedEquip=new RegExp('^Equipment you control have equip ([A-Z][a-z]+) ('+MANA+')\\.$').exec(line);if(grantedEquip){const target=h.target('target '+grantedEquip[1]+' creature you control');if(target)return {kind:'generic-static',scope:'filtered-permanents',filters:[h.target('target Equipment you control')],power:0,toughness:0,keywords:[],grantedOperation:{kind:'generic-ability',oracleEquip:true,label:'Equip '+grantedEquip[1]+' '+grantedEquip[2],cost:{mana:grantedEquip[2]},targets:[target],effects:[{action:'attach-source',target:0}],sorceryOnly:true,contract:'generic-activated-effect'},contract:'generic-continuous-effect'};}
 const chosenTypeCost=/^Spells( you cast)? of the chosen type cost \{([1-9][0-9]*)\} (less|more) to cast\.$/.exec(line);if(chosenTypeCost)return {kind:'spell-cost-v20',who:chosenTypeCost[1]?'you':'all',mana:'{'+chosenTypeCost[2]+'}',direction:chosenTypeCost[3]==='less'?-1:1,chosenTypeV20:true,contract:'spell-cost-v20'};
 const firstCreature=/^The first creature spell you cast each turn costs \{([1-9][0-9]*)\} less to cast and can be cast as though it had flash\.$/.exec(line);if(firstCreature)return {kind:'spell-cost-v20',who:'you',mana:'{'+firstCreature[1]+'}',direction:-1,filter:spellFilter('creature spell',h),first:'creature',grantFlash:true,contract:'spell-cost-v20'};
 const firstFlyer=/^The first non-([A-Z][a-z]+) creature spell with flying you cast during each of your turns costs \{([1-9][0-9]*)\} less to cast\.$/.exec(line);if(firstFlyer)return {kind:'spell-cost-v20',who:'you',mana:'{'+firstFlyer[2]+'}',direction:-1,filter:spellFilter('creature spell',h),first:'flying-creature',notSubtype:firstFlyer[1],yourTurn:true,contract:'spell-cost-v20'};
 const sharedCreature=/^Creature spells you cast that share a creature type with this creature cost \{([1-9][0-9]*)\} less to cast\.$/.exec(line);if(sharedCreature)return {kind:'spell-cost-v20',who:'you',mana:'{'+sharedCreature[1]+'}',direction:-1,filter:spellFilter('creature spell',h),sharedSourceCreatureType:true,contract:'spell-cost-v20'};
 const valueSpells=/^(.+? spells (?:you|your opponents) cast) with mana value ([0-9]+) or greater (cost .+)$/.exec(line);if(valueSpells){const op=h.line(card,valueSpells[1]+' '+valueSpells[3]);if(op?.kind==='spell-cost-v20')return {...op,filter:{...op.filter,stat:'mv',threshold:Number(valueSpells[2]),comparison:'greater'}};}
 const spellCost=new RegExp('^(.+? spells|Spells) (you|your opponents) cast cost ('+MANA+') (less|more) to cast(?:, where X is (.+?))?\\.(?: This effect reduces only the amount of colored mana you pay\\.)?$').exec(line);
 if(spellCost){let text=spellCost[1].replace(/^Spells$/,'spells'),filter;if(/^(?:Aura and Equipment|Instant and sorcery|Artifact, instant, and sorcery) spells$/.test(text)){const alternatives=text.replace(/ spells$/,'').split(/,? and |, /).map(x=>spellFilter(x+' spell',h));if(alternatives.every(x=>x?.zone==='stack'))filter={what:'spell',zone:'stack',min:1,alternatives};}else filter=spellFilter(text,h);const count=spellCost[5]&&(h.value?.(spellCost[5])||h.count(spellCost[5]));if(filter?.zone==='stack'&&(!spellCost[3].includes('{X}')||count)&&(!count||spellCost[3]==='{X}'))return {kind:'spell-cost-v20',filter,who:spellCost[2]==='you'?'you':'opponents',mana:spellCost[3],direction:spellCost[4]==='less'?-1:1,...(count?{count}:{}),...(spellCost[4]==='less'&&/[WUBRGC]/.test(spellCost[3])?{coloredOnlyV20:line.endsWith('This effect reduces only the amount of colored mana you pay.')}:{}) ,contract:'spell-cost-v20'};}
 if(line==='Spells you cast cost {1} less to cast for each card with the same name as that spell in your graveyard.')return {kind:'spell-cost-v20',who:'you',mana:'{1}',direction:-1,sameNameGrave:true,contract:'spell-cost-v20'};
 const exileTax=/^Spells your opponents cast from graveyards or from exile cost \{([1-9][0-9]*)\} more to cast\.$/.exec(line);if(exileTax)return {kind:'spell-cost-v20',who:'opponents',mana:'{'+exileTax[1]+'}',direction:1,from:['graveyard','exile'],contract:'spell-cost-v20'};
 const flashbackDiscount=new RegExp('^Flashback ('+MANA+')\\. This spell costs \\{X\\} less to cast this way, where X is (.+)\\.$').exec(line);
 if(flashbackDiscount){const count=h.value?.(flashbackDiscount[2])||h.count(flashbackDiscount[2]);if(count)return {kind:'flashback-cost-v20',cost:flashbackDiscount[1],count,contract:'flashback-cost-v20'};}
 const flashbackGlobal=/^Flashback costs (you|your opponents) pay cost \{([1-9][0-9]*)\} (less|more)\.$/.exec(line);
 if(flashbackGlobal)return {kind:'flashback-cost-v20',who:flashbackGlobal[1]==='you'?'you':'opponents',adjustment:Number(flashbackGlobal[2])*(flashbackGlobal[3]==='less'?-1:1),contract:'flashback-cost-v20'};
 const reorderedAlternative=new RegExp('^You may pay ('+MANA+') rather than pay this spell\'s mana cost if (.+)\\.$').exec(line);
 if(reorderedAlternative)return h.line(card,'If '+reorderedAlternative[2]+', you may pay '+reorderedAlternative[1]+" rather than pay this spell's mana cost.");
 const reorderedChoice=new RegExp('^As an additional cost to cast this spell, pay ('+MANA+') or (sacrifice .+)\\.$').exec(line);
 if(reorderedChoice)return h.line(card,'As an additional cost to cast this spell, '+reorderedChoice[2]+' or pay '+reorderedChoice[1]+'.');
 const ownColors=new RegExp('^('+MANA+'|\\{T\\}): Add one mana of any of this (?:creature|permanent)\'s colors\\.$').exec(line);
 if(ownColors){const cost=h.cost(ownColors[1]);if(cost)return {kind:'mana-source',activationCost:cost,produce:COLORS.map(c=>({[c]:1})),ownColorsV20:true,contract:'mana-source'};}
 const devotion=/^\{T\}: Choose a color\. Add an amount of mana of that color equal to your devotion to that color\.$/.exec(line);
 if(devotion)return {kind:'mana-source',activationCost:{tap:true},produce:COLORS.map(c=>({[c]:1})),devotionChoiceV20:true,contract:'mana-source'};
 const distinct=/^\{T\}: Choose a color\. Add one mana of that color for each different power among creatures you control\.$/.exec(line);
 if(distinct)return {kind:'mana-source',activationCost:{tap:true},produce:COLORS.map(c=>({[c]:1})),multiplier:{kind:'distinct-creature-power-v20'},contract:'mana-source'};
 const grant=/^(.+?) (?:have|has) "(.+)"\.?$/.exec(line);
 if(grant){const child=manaChild(card,grant[2],h),attachment=/^(?:Enchanted|Equipped) (?:creature|permanent|land)$/.test(grant[1]),filter=!attachment&&h.target('target '+groupText(grant[1]));if(child&&(attachment||filter?.zone==='battlefield')){if(child.costsV20||child.ownColorsV20)return {kind:'grant-mana-v20',...(attachment?{attachment:true}:{filter}),operation:child,contract:'grant-mana-v20'};return attachment?{kind:'attachment-operation',operation:child,contract:'attachment-granted-operation'}:{kind:'generic-static',scope:'filtered-permanents',filters:[filter],power:0,toughness:0,keywords:[],grantedOperation:child,contract:'generic-continuous-effect'};}}
 const combinedGrant=/^((?:Enchanted|Equipped) creature) gets ([+-]\d+)\/([+-]\d+) and has (.+?) and "(.+)"\.?$/.exec(line);
 if(combinedGrant){const child=manaChild(card,combinedGrant[5],h),keywords=h.keywordList(combinedGrant[4]);if(child&&keywords&&!child.costsV20&&!child.ownColorsV20)return {kind:'attachment-operation',operation:child,grant:{power:Number(combinedGrant[2]),toughness:Number(combinedGrant[3]),keywords},contract:'attachment-granted-operation'};}
 const impending=new RegExp('^Impending ([1-9][0-9]*)—('+MANA+')$').exec(line);
 if(impending&&!impending[2].includes('{X}'))return {kind:'mechanic-impending-v20',n:Number(impending[1]),cost:impending[2],contract:'mechanic-impending-v20'};
 const spirit=/^Exile this card from your hand: Add (\{[WUBRGC]\})\.$/.exec(line);
 if(spirit)return {kind:'mana-source',costsV20:true,fromV20:'hand',activationCost:{exileHandSelfV20:true},produce:[{[spirit[1][1]]:1}],contract:'mana-source'};
 const ownGrave=/^(.+): Return this card from your graveyard to (your hand|the battlefield)( tapped)?(?: with a (finality|\+1\/\+1) counter on it)?\.( Activate only as a sorcery\.)?$/.exec(line);
 if(ownGrave){const cost=h.cost(ownGrave[1]);if(cost&&!cost.tap&&!cost.sacSelf&&!cost.untapSelf)return {...generic(cost,[{action:'return-grave-source-v20',destination:ownGrave[2]==='your hand'?'hand':'battlefield',tapped:!!ownGrave[3],...(ownGrave[4]?{counter:ownGrave[4]}:{})}]),from:'graveyard',retainGraveSource:true,...(ownGrave[5]?{sorceryOnly:true}:{})};}
 const graveLibrary=new RegExp('^('+MANA+'): Put this card from your graveyard into your library (second|third|fourth|fifth) from the top\\.$').exec(line);
 if(graveLibrary)return {...generic({mana:graveLibrary[1]},[{action:'move-to-library',target:'self',fromGraveV19:true,depthV9:{second:1,third:2,fourth:3,fifth:4}[graveLibrary[2]]}]),from:'graveyard',retainGraveSource:true};
 if(line==='You may play lands and cast spells from the top of your library.'||line==='You may play the top card of your library.')return {kind:'top-library-permission-v20',any:true,contract:'top-library-permission-v20'};
 if(line==='You may play lands from the top of your library.')return {kind:'top-library-permission-v20',landFilter:h.target('target land'),contract:'top-library-permission-v20'};
 const top=/^You may cast (.+?) from the top of your library\.$/.exec(line);
 if(top){const filter=spellFilter(top[1].replace(/ spells and /g,' or ').replace('instant and sorcery','instant or sorcery'),h);if(filter?.zone==='stack')return {kind:'top-library-permission-v20',spellFilter:filter,contract:'top-library-permission-v20'};}
 const bothTop=/^You may play (lands|snow lands|historic lands) and cast (.+?) from the top of your library\.$/.exec(line);
 if(bothTop){const landFilter=h.target('target '+bothTop[1].replace(/lands$/,'land')),filter=spellFilter(bothTop[2],h);if(landFilter&&filter?.zone==='stack')return {kind:'top-library-permission-v20',spellFilter:filter,landFilter,contract:'top-library-permission-v20'};}
 const conditionalTop=/^As long as (.+?), you may play (?:lands and cast spells from the top card|lands and cast spells from the top|the top card) of your library\.$/.exec(line);
 if(conditionalTop){const condition=h.condition(conditionalTop[1]);if(condition)return {kind:'top-library-permission-v20',any:true,condition,contract:'top-library-permission-v20'};}
 const combinedTop=/^You may look at the top card of your library any time, and (you may play .+)\.$/.exec(line);if(combinedTop){const parsed=h.line(card,combinedTop[1][0].toUpperCase()+combinedTop[1].slice(1)+'.');if(parsed?.kind==='top-library-permission-v20')return {...parsed,lookV20:true};}
 if(line==='You may cast the first creature spell you cast each turn as though it had flash.')return {kind:'spell-cost-v20',who:'you',mana:'{0}',direction:-1,filter:spellFilter('creature spell',h),first:'creature',grantFlash:true,contract:'spell-cost-v20'};
 const conditionalGraveAlt=new RegExp('^As long as (.+), you may cast this card from your graveyard by paying ('+MANA+') rather than paying its mana cost\\. If you cast this card this way and it would be put into your graveyard, exile it instead\\.$').exec(line);if(conditionalGraveAlt){const condition=h.condition(conditionalGraveAlt[1]);if(condition&&!conditionalGraveAlt[2].includes('{X}'))return {kind:'cast-permission-v20',self:true,from:'graveyard',cost:conditionalGraveAlt[2],condition,exileAfter:true,contract:'cast-permission-v20'};}
 const ownGraveTax=/^You may cast this creature from your graveyard if you pay \{([1-9][0-9]*)\} more to cast it for each (.+)\.$/.exec(line);if(ownGraveTax){const count=h.count(ownGraveTax[2]);if(count)return {kind:'cast-permission-v20',self:true,from:'graveyard',costIncreaseV20:{n:Number(ownGraveTax[1]),count},contract:'cast-permission-v20'};}
 const onceGrave=/^Once during each of your turns, you may cast (.+?) from your graveyard by (.+?) in addition to paying its other costs\. If a spell cast this way would be put into your graveyard, exile it instead\.$/.exec(line);if(onceGrave){const filter=spellFilter(onceGrave[1],h),costs=h.line(card,'As an additional cost to cast this spell, '+onceGrave[2].replace(/\bsacrificing\b/g,'sacrifice').replace(/\bdiscarding\b/g,'discard')+'.');if(filter?.zone==='stack'&&costs?.kind==='mechanic-additional-costs'&&!costs.lifeX)return {kind:'cast-permission-v20',filter,from:'graveyard',once:true,yourTurn:true,additionalCosts:costs.costs,exileAfter:true,contract:'cast-permission-v20'};}
 const oncePermission=/^(Once each turn, you may|Once during each of your turns, you may|You may) cast (.+?) from (your hand|your graveyard|the top of your library)( without paying (?:its mana cost|their mana costs))?\.$/.exec(line);
 if(oncePermission){const filter=spellFilter(oncePermission[2],h);if(filter?.zone==='stack'&&(oncePermission[1]!=='You may'||oncePermission[3]!=='the top of your library'))return {kind:'cast-permission-v20',filter,from:oncePermission[3]==='your hand'?'hand':oncePermission[3]==='your graveyard'?'graveyard':'library',free:!!oncePermission[4],...(oncePermission[1]!=='You may'?{once:true,yourTurn:oncePermission[1].includes('your turns')}:{}) ,contract:'cast-permission-v20'};}
 const escape=new RegExp('^You may cast this card from your graveyard by paying ('+MANA+') and exiling ('+N+') other cards from your graveyard rather than paying its mana cost\\.$').exec(line);
 if(escape)return h.line(card,'Escape—'+escape[1]+', Exile '+escape[2]+' other cards from your graveyard.');
 const ownGraveCast=/^You may cast this card from your graveyard\.(?: If you do, it enters with a finality counter on it\.)?$/.exec(line);
 if(ownGraveCast)return {kind:'cast-permission-v20',self:true,from:'graveyard',...(line.includes('finality')?{entryCounter:'finality',entryN:1}:{}),contract:'cast-permission-v20'};
 const conditionalGrave=/^You may cast this card from your graveyard if (.+?)\.(?: If you do, this creature enters with a (\+1\/\+1|finality) counter on it\.)?$/.exec(line);
 if(conditionalGrave){const condition=h.condition(conditionalGrave[1]);if(condition)return {kind:'cast-permission-v20',self:true,from:'graveyard',condition,...(conditionalGrave[2]?{entryCounter:conditionalGrave[2],entryN:1}:{}),contract:'cast-permission-v20'};}
 const extraGrave=/^You may cast (this card|.+? spells) from your graveyard by (.+?) in addition to paying (?:its|their) other costs\.(?: If you cast a spell this way, that artifact enters with a (finality) counter on it\.)?$/.exec(line);
 if(extraGrave){const filter=extraGrave[1]==='this card'?null:spellFilter(extraGrave[1],h),costs=h.line(card,'As an additional cost to cast this spell, '+extraGrave[2].replace(/\bpaying\b/g,'pay').replace(/\bdiscarding\b/g,'discard').replace(/\bsacrificing\b/g,'sacrifice').replace(/\bexiling\b/g,'exile')+'.');if((!filter||filter.zone==='stack')&&costs?.kind==='mechanic-additional-costs'&&!costs.lifeX)return {kind:'cast-permission-v20',...(filter?{filter}:{self:true}),from:'graveyard',additionalCosts:costs.costs,...(extraGrave[3]?{entryCounter:extraGrave[3],entryN:1}:{}),contract:'cast-permission-v20'};}
 const graveAlternative=new RegExp('^You may cast this card from your graveyard by paying ('+MANA+') rather than paying its mana cost\\. If you do, it enters with ('+N+') (\\+1/\\+1|finality) counters? on it\\.$').exec(line);
 if(graveAlternative)return {kind:'cast-permission-v20',self:true,from:'graveyard',cost:graveAlternative[1],entryCounter:graveAlternative[3],entryN:number(graveAlternative[2]),contract:'cast-permission-v20'};
 const floor=/^Activated abilities of (creatures(?: you control)?|artifacts you control) cost \{([1-9][0-9]*|X)\} less to activate(?:, where X is this creature's power)?\. This effect can't reduce the mana in that cost to less than one mana\.$/.exec(line);
 if(floor&&(floor[2]!=='X'||line.includes(', where X is'))){const filter=h.target('target '+floor[1].replace(/^creatures/,'creature').replace(/^artifacts/,'artifact'));if(filter)return {kind:'ability-floor-cost-v20',filter,n:floor[2]==='X'?{kind:'source-stat',stat:'power'}:Number(floor[2]),contract:'ability-floor-cost-v20'};}
 // Printed X here describes the reduction, not an announced activation X.
 const adjustment=/ This ability costs \{X\} less to activate, where X is (.+)\.$/.exec(line);
 if(adjustment){const parsed=h.line(card,line.slice(0,adjustment.index)),count=h.value?.(adjustment[1])||h.count(adjustment[1]);if(parsed?.kind==='generic-ability'&&!parsed.from&&typeof parsed.cost?.mana==='string'&&!parsed.cost.mana.includes('{X}')&&count)return {...parsed,cost:{...parsed.cost,manaAdjustment:{amount:-1,count}}};}
 const conditionalAdjustment=new RegExp('^(.*) This ability costs ('+MANA+') less to activate if (.+)\\.$').exec(line);
 if(conditionalAdjustment){const parsed=h.line(card,conditionalAdjustment[1]),condition=h.condition(conditionalAdjustment[3]),target=conditionalAdjustment[3].startsWith('it targets ')?h.target('target '+conditionalAdjustment[3].slice(11).replace(/^an? /,'')):null;if(parsed?.kind==='generic-ability'&&!parsed.from&&typeof parsed.cost?.mana==='string'&&!parsed.cost.mana.includes('{X}')&&(condition||target)&&!conditionalAdjustment[2].includes('{X}'))return {...parsed,activationDiscountV20:{mana:conditionalAdjustment[2],...(condition?{condition}:{target})}};}
 const during=/^(.*) This ability costs \{([1-9][0-9]*)\} less to activate during your turn\.$/.exec(line);
 if(during){const parsed=h.line(card,during[1]);if(parsed?.kind==='generic-ability'&&!parsed.from&&typeof parsed.cost?.mana==='string')return {...parsed,cost:{...parsed.cost,manaAdjustment:{amount:-Number(during[2]),condition:{kind:'your-turn'}}}};}
 const storage=/^\{T\}, Remove X charge counters from this artifact: Add an amount of \{([WUBRGC])\} equal to X plus one\.$/.exec(line);
 if(storage)return {kind:'mana-source',activationCost:{tap:true,removeManaCounters:{kind:'charge',baseV18:1}},produce:[{[storage[1]]:1}],storageCounterMana:{kind:'charge',color:storage[1],baseV18:1},contract:'mana-source'};
 const bloom=/^\{T\}: For each color among permanents you control, add one mana of that color\.$/.exec(line);
 if(bloom)return {kind:'mana-source',colorsUnionV20:true,activationCost:{tap:true},produce:[{}],contract:'mana-source'};
 return null;
}

export function modifierOperation(card,line,h){
 const spellOnly=extensionLine(card,line,h);if(spellOnly)return spellOnly;
 return null;
}

export function extensionEffect(card,line,h){
 if(card.oracleTransformFacesV20&&line==='You gain life equal to the mana value of the exiled card used to craft it.')return body([{action:'gain-life',who:'you',n:{kind:'craft-stat-v20',stat:'mv'}}]);
 const flashbackGrant=/^Target (instant or sorcery|sorcery) card in your graveyard gains flashback until end of turn\. The flashback cost is equal to (?:its|that card's) mana cost\.$/.exec(line);if(flashbackGrant){const target=h.target('target '+flashbackGrant[1]+' card from your graveyard');if(target)return body([{action:'grant-flashback-v20',target:0}],[target]);}
 if(line==="You gain life equal to the revealed card's mana value.")return body([{action:'gain-life',who:'you',n:{kind:'casting-reveal-stat-v20',stat:'mv'}}]);
 if(line==="Target creature gets -X/-X until end of turn, where X is the revealed card's mana value.")return body([{action:'pump',target:0,power:{kind:'casting-reveal-stat-v20',stat:'mv',multiply:-1},toughness:{kind:'casting-reveal-stat-v20',stat:'mv',multiply:-1},keywords:[]}],[h.target('target creature')]);
 const revealedDamage=/^(.+?) deals damage to (target .+?) equal to the revealed card's power\.$/.exec(line);if(revealedDamage&&[card.name,'This spell','this spell'].includes(revealedDamage[1])){const target=h.target(revealedDamage[2]);if(target)return body([{action:'damage',target:0,n:{kind:'casting-reveal-stat-v20',stat:'power'}}],[target]);}

 if(line==='Add two mana of any one color and two mana of any other color.')return body([{action:'add-mana',choices:COLORS.flatMap((c,i)=>COLORS.slice(i+1).map(d=>({[c]:2,[d]:2})))}]);
 const temporaryGrant=/^Until end of turn, (.+?) gain "(.+)"\.?$/.exec(line);
 if(temporaryGrant){const child=manaChild(card,temporaryGrant[2],h),filter=h.target('target '+groupText(temporaryGrant[1]));if(child&&!child.costsV20&&!child.ownColorsV20&&filter?.zone==='battlefield')return body([{action:'grant-operation',filters:[filter],operation:child,keywords:[]}]);}
 const manaChoice=/^Add ((?:\{[WUBRGC]\})+(?: or (?:\{[WUBRGC]\})+)+)\.$/.exec(line);
 if(manaChoice)return body([{action:'add-mana',choices:manaChoice[1].split(' or ').map(text=>Object.fromEntries([...new Set(text.match(/[WUBRGC]/g))].map(c=>[c,text.match(new RegExp(c,'g')).length])))}]);
 const variable=/^Add X mana in any combination of (colors|\{[WUBRG]\}(?: and\/or \{[WUBRG]\})), where X is (.+)\.$/.exec(line);
 if(variable){const n=h.value?.(variable[2])||h.count(variable[2]);if(n)return body([{action:variable[1]==='colors'?'add-mana':'add-mana-v20',choices:[{ANY:true,n:1}],...(variable[1]==='colors'?{multiplier:n}:{splitManaV20:{colors:variable[1].match(/[WUBRG]/g),n}})}]);}
 const restrictions={
  'Spend this mana only to cast kicked spells.':{mode:'kicked'},
  'Spend this mana only to cast spells with flashback from a graveyard.':{mode:'flashback'},
  'Spend this mana only to foretell a card from your hand or cast an instant or sorcery spell.':{mode:'foretell-or-spell'},
  'Spend this mana only to pay a disturb cost or cast an instant or sorcery spell.':{mode:'disturb-or-spell'},
  'Spend this mana only to cast an instant or sorcery spell or a kicked spell.':{mode:'kicked-or-spell'},
  'Spend this mana only to cast a spell that\'s one or more colors without {X} in its mana cost.':{mode:'colored-no-x'},
  "This mana can't be spent to cast spells from your hand.":{mode:'not-hand'},
  'Spend this mana only to cast an Equipment spell or activate an equip ability.':{mode:'equipment'},
  'Spend this mana only on costs that contain {X}.':{mode:'cost-has-x'},
  'Spend this mana only to cast face-down spells or to turn creatures face up.':{mode:'face-down'},
  'Spend this mana only to cast a creature spell with mana value 4 or greater or a creature spell with {X} in its mana cost.':{mode:'large-creature'},
  'Spend this mana only to cast creature spells with mana value 4 or greater or creature spells with {X} in their mana costs.':{mode:'large-creature'},
  'Spend this mana only to cast a spell from anywhere other than your hand.':{mode:'spell-not-hand'},
  'Spend this mana only to cast an enchantment spell, unlock a door, or turn a permanent face up.':{mode:'enchantment-door-face-up'},
  'Spend this mana only to cast instant and sorcery spells.':{mode:'instant-sorcery'},
  'Spend this mana only to cast Equipment spells or activate equip abilities.':{mode:'equipment'},
 };
 for(const [suffix,restrictionV20]of Object.entries(restrictions))if(line.endsWith(' '+suffix)){const parsed=h.effect(card,line.slice(0,-suffix.length-1));if(parsed?.effects?.length===1&&['add-mana','add-mana-v20'].includes(parsed.effects[0].action))return {...parsed,effects:[{...parsed.effects[0],action:'add-mana-v20',restrictionV20}]};}
 const spellOnly=/^(Add .+\.) Spend this mana only to cast (.+)\.$/.exec(line);
 if(spellOnly){const filter=spellFilter(spellOnly[2].replace(' or an Omen spell',' or Omen spell'),h),parsed=filter?.zone==='stack'&&h.effect(card,spellOnly[1]);if(parsed?.effects?.length===1&&['add-mana','add-mana-v20'].includes(parsed.effects[0].action))return {...parsed,effects:[{...parsed.effects[0],action:'add-mana-v20',restrictionV20:{mode:'filtered-spell',filter}}]};}
 const typedBoth=/^(Add .+\.) Spend this mana only to cast ([A-Z][a-z]+) spells and activate abilities of \2 sources\.$/.exec(line);
 if(typedBoth){const spell=spellFilter(typedBoth[2]+' spell',h),ability=h.target('target '+typedBoth[2]+' permanent'),parsed=spell?.zone==='stack'&&ability&&h.effect(card,typedBoth[1]);if(parsed?.effects?.length===1&&['add-mana','add-mana-v20'].includes(parsed.effects[0].action))return {...parsed,effects:[{...parsed.effects[0],action:'add-mana-v20',restrictionV20:{mode:'filtered-both',filter:spell,ability}}]};}
 return null;
}
