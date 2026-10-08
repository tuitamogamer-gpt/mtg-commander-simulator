const body=(effects,targets=[])=>({effects,targets,optional:false});
const trigger=(event,eventFilter,b)=>({kind:'generic-trigger',event,eventFilter,...b,contract:'generic-trigger-effect'});

export function normalizeCard(card){
  if(card.oracle_text==='Modular—Sunburst')return {...card,oracle_text:'Sunburst\nModular 0'};
  return card;
}

export function extensionEffect(card,text,h){
  if(text==='You may collect evidence 4.')return body([{action:'collect-evidence-v33',n:4,optional:true}]);
  if(text==='Target creature becomes prepared.')return body([{action:'prepare-v10',target:0}],[h.target('target creature')]);
  if(text==='Create a 3/2 colorless Vehicle artifact token with crew 1.')return body([{action:'token-inline',who:'you',n:1,token:{name:'Vehicle',power:'3',toughness:'2',types:['Artifact'],subtypes:['Vehicle'],colors:[],keywords:[],oracle:'Crew 1',operations:[{kind:'crew',n:1,contract:'crew-ability'}]}}]);
  if(text==='This creature deals 3 damage to each of your opponents and you gain 3 life.')return h.effect(card,text.replace('each of your opponents','each opponent'));
  return null;
}

export function extensionLine(card,line,h){
  if(line==='You can spend mana of any type to cast creature spells.')return h.line(card,'You may spend mana as though it were mana of any type to cast creature spells.');
  if(line==='Whenever you tap a Forest for mana, add an additional {G}.')return {kind:'mana-bonus-v10',filter:h.target('target Forest land'),fixed:{G:1},all:false,contract:'mana-bonus-v10'};
  if(line==='Exhaust — {G}, {T}: Add three mana of any one color.')return {kind:'generic-ability',cost:{mana:'{G}',tap:true},...h.effect(card,'Add three mana of any one color.'),exhaustV18:true,oncePerObject:true,contract:'generic-activated-effect'};
  if(line==='Power-up — {4}{R}: Put two +1/+1 counters on Loki.')return h.line(card,'Power-up — {4}{R}: Put two +1/+1 counters on this creature.');
  const quality=/^Whenever one or more creatures you control (with \+1\/\+1 counters on them|with flying|that entered this turn|each with power greater than its base power) deals? combat damage to a player, (.+)$/.exec(line);
  if(quality){
    const noun={'with +1/+1 counters on them':'creature with a +1/+1 counter on it','with flying':'creature with flying','that entered this turn':'creature that entered this turn','each with power greater than its base power':'creature with power greater than its base power'}[quality[1]];
    const target=h.target('target '+noun),base=h.line(card,'Whenever one or more creatures you control deal combat damage to a player, '+quality[2]);
    if(target&&base?.eventFilter?.kind==='combat-damage-batch')return {...base,eventFilter:{...base.eventFilter,filters:[{...target,controller:'you'}]}};
  }
  const attackers=/^Whenever a player attacks(?: with (three|five) or more creatures)?, (.+)$/.exec(line);
  if(attackers){const base=h.line(card,'Whenever you attack, '+attackers[2]);if(base?.eventFilter?.kind==='v8-event')return {...base,eventFilter:{...base.eventFilter,player:'any',target:{...base.eventFilter.target,controller:'any'},minMatching:attackers[1]==='three'?3:attackers[1]==='five'?5:1}};}
  if(line==='When you draw your third card in a turn, return this card from your graveyard to the battlefield tapped.'){
    const base=h.line(card,'Whenever you draw your third card each turn, return this card from your graveyard to the battlefield tapped.');
    if(base)return {...base,zone:'graveyard'};
  }
  if(line==='Whenever this creature becomes tapped while it has a -1/-1 counter on it, remove a -1/-1 counter from it.')return trigger('becameTapped',{kind:'v8-event',subject:'self',target:h.target('target creature with a -1/-1 counter on it')},body([{action:'remove-counter',target:'self',counter:'-1/-1',n:1}]));
  if(line.startsWith('Whenever a source you control deals damage to another player, '))return h.line(card,line.replace('to another player,','to an opponent,'));
  const evidence=/^Whenever you collect evidence, (.+)$/.exec(line);
  if(evidence){const b=h.effect(card,evidence[1][0].toUpperCase()+evidence[1].slice(1));if(b)return trigger('oracleCollectedEvidenceV20',{kind:'event-v33',test:'you-collected-evidence'},b);}
  const activated=/^Whenever you activate (an ability of an Elemental|this creature's outlast ability|an ability of a Sarkhan planeswalker), (.+)$/.exec(line);
  if(activated){const b=h.effect(card,activated[2][0].toUpperCase()+activated[2].slice(1));if(b){const eventFilter={kind:'observation-v9',controller:'you'};
    if(activated[1]==="this creature's outlast ability")Object.assign(eventFilter,{self:true,abilityKeywordV18:'outlast'});
    else eventFilter.target=h.target(activated[1].includes('Sarkhan')?'target Sarkhan planeswalker':'target Elemental permanent');
    if(eventFilter.self||eventFilter.target)return trigger('abilityActivated',eventFilter,b);
  }}
  const hand=/^(Whenever an attacking creature you control dies|Whenever a legendary permanent other than this creature dies), return that card to its owner's hand\.$/.exec(line);
  if(hand){const base=h.line(card,hand[1]+', draw a card.');if(base)return {...base,effects:[{action:'bounce',target:'event-card'}]};}
  if(line==='Whenever a land with a mine counter on it becomes tapped, destroy it.')return trigger('becameTapped',{kind:'v8-event',target:h.target('target land with a mine counter on it')},body([{action:'destroy',target:'event-card'}]));
  if(line==='Whenever one or more creatures you control deal combat damage to a player, tap all lands that player controls and untap all lands you control.'){
    const base=h.line(card,'Whenever one or more creatures you control deal combat damage to a player, draw a card.');
    const b=h.effect(card,'Tap all lands that player controls and untap all lands you control.');
    if(base&&b)return {...base,effects:[{action:'combat-player-land-mana-v33'}]};
  }
  if(line==="Whenever this creature blocks, it gets +1/+1 until end of turn for each creature it's blocking."){
    const b=h.effect(card,"This creature gets +1/+1 until end of turn for each creature it's blocking.");
    if(b)return trigger('blockersDeclared',{kind:'event-v33',test:'self-blocked'},b);
  }
  if(line==='When this Vehicle enters, it becomes an artifact creature until end of turn.')return h.line(card,line.replace(', it becomes',', this Vehicle becomes'));
  if(line==='When this artifact is put into a graveyard from the battlefield, its owner shuffles it into their library.')return trigger('dies','self',body([{action:'move-to-library',target:'event-card',shuffleAfter:true}]));
  if(line==="Whenever equipped creature blocks a creature, that creature doesn't untap during its controller's next untap step.")return trigger('blocks',{kind:'v8-event',field:'attacker',sourceField:'blocker',sourceSubject:'attached',target:h.target('target creature')},body([{action:'skip-next-untap',target:'event-card'}]));
  if(line==="Whenever a nontoken creature you control dies, you may pay {1}. If you do, return this enchantment to its owner's hand."){
    const base=h.line(card,'Whenever a nontoken creature you control dies, draw a card.'),b=h.effect(card,"You may pay {1}. If you do, return this enchantment to its owner's hand.");if(base&&b)return {...base,...b};
  }
  if(line==='When this creature dies, exile it and each player returns all creature cards from their graveyard to their hand.'){
    const b=h.effect(card,'Each player returns all creature cards from their graveyard to their hand.');if(b)return trigger('dies','self',{...b,effects:[{action:'exile',target:'event-card'},...b.effects]});
  }
  if(line==="When a legendary creature an opponent controls dies, put this creature on the bottom of its owner's library.")return trigger('dies',{kind:'v8-event',target:h.target('target legendary creature an opponent controls')},body([{action:'move-to-library',target:'self',bottom:true}]));
  return null;
}

export function finalizeCompilation(card,result){
  if(result.semanticClass&&card.name==='Herald of Anafenza'){
    result=structuredClone(result);
    for(const op of result.implementation)if(op.kind==='generic-ability'&&op.cost?.mana==='{2}{W}'&&op.cost.tap&&op.sorceryOnly&&op.effects?.length===1&&op.effects[0].action==='counter')op.outlastV33=true;
  }
  return result;
}
