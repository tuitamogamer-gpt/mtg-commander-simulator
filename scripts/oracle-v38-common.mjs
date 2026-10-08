const body=(effects,targets=[])=>({effects,targets,optional:false});
const effect=(mode,extra={})=>({action:'object-effects-v38',mode,...extra});
const trigger=(event,eventFilter,b)=>b&&({kind:'generic-trigger',event,eventFilter,...b,contract:'generic-trigger-effect'});
const title=s=>s[0].toUpperCase()+s.slice(1);
const choice=(options)=>({action:'choice-table-v20',kind:'mode',optional:false,options});
export function normalizeCard(card){
  let text=card.oracle_text;
  if(card.name==='Gorm the Great')text=text.replace('This creature must be blocked if able, and this creature must be blocked by two or more creatures if able.','This creature must be blocked if able.\nThis creature must be blocked by two or more creatures if able.');
  if(card.name==='Gandalf, Wandering Wizard')text=text.replace("this creature's owner shuffles him into their library and draws three cards.","This creature's owner shuffles it into their library and draws three cards.");
  if(card.name==='Black Panther, Most Dangerous')text=text.replaceAll('Black Panther','this creature').replace('he deals','this creature deals');
  if(card.name==='Krang, Master Mind')text=text.replaceAll('Krang','this creature');
  if(card.name==='Break of Day')text=text.replace('those creatures gain','creatures you control gain');
  return text===card.oracle_text?card:{...card,oracle_text:text};
}
export function extensionCondition(text,h){
  if(text==='you attacked with two or more creatures this turn')return {kind:'count-comparison',count:{kind:'attacked-creature-count-v10',youV18:true},min:2};
  if(text==='you have fewer than four cards in hand')return {kind:'count-comparison',count:{kind:'count',zone:'hand',what:'card'},max:3};
  return null;
}
export function extensionEffect(card,text,h){
  if(text==='Support X.'){const b=h.effect(card,'Support 2.');return {...b,targets:b.targets.map(t=>({...t,max:0,targetCountX:true,upToXV38:true}))};}
  if(text==='This creature endures X.')return body([{action:'endure-v9',target:'self',n:'X'}]);
  if(text==='Target player draws 2ˣ cards.')return body([{action:'draw',who:0,n:{kind:'power-two-v38',value:'X'}}],[h.target('target player')]);
  if(text==='For each creature card in your graveyard, put a +1/+1 counter on each creature you control.')return h.effect(card,'Put a +1/+1 counter on each creature you control for each creature card in your graveyard.');
  if(text==='Target opponent creates three Walker tokens.')return body([{action:'token-inline',who:0,n:3,token:{name:'Walker',power:'2',toughness:'2',types:['Creature'],subtypes:['Zombie'],colors:['B'],keywords:[],oracle:''}}],[h.target('target opponent')]);
  if(text==='Create a 5/5 colorless Vehicle artifact token named Zeppelin with flying and crew 3.')return body([{action:'token-inline',who:'you',n:1,token:{name:'Zeppelin',power:'5',toughness:'5',types:['Artifact'],subtypes:['Vehicle'],colors:[],keywords:['flying'],oracle:'Flying\nCrew 3',operations:[{kind:'crew',n:3,contract:'crew-ability'}]}}]);
  if(text==='Attach target Equipment you control to this creature.')return body([{action:'attach-v9',attachment:0,target:'self'}],[h.target('target Equipment you control')]);
  if(text==='Attach all Equipment on the battlefield to it.')return body([effect('attach-equipment')]);
  if(text==='Put all creature cards from all graveyards onto the battlefield under your control.')return body([effect('reanimate-all')]);
  if(text==='Each player sacrifices all lands they control except for three.')return body([effect('keep-three-lands')]);
  if(text==='Each opponent chooses two cards in their graveyard and exiles the rest.')return body([effect('keep-two-graveyard')]);
  if(text==='Each player discards a card. Each opponent who can\'t loses 3 life.')return body([effect('discard-or-lose')]);
  if(text==='Move all +1/+1 counters from all creatures onto it.')return body([effect('move-all-counters')]);
  if(text==="You control target player during that player's next turn.")return body([effect('control-next-turn',{target:0})],[h.target('target player')]);
  if(text==='Target unblocked attacking creature becomes blocked.')return body([effect('become-blocked',{target:0})],[{...h.target('target attacking creature'),v20:{kind:'unblocked-v38'}}]);
  if(text==='Attacking creatures become blocked.')return body([effect('become-blocked',{all:true})]);
  if(text==='Put a +0/+1 counter or a +1/+0 counter on target creature.')return body([choice(['+0/+1','+1/+0'].map(counter=>({key:counter,label:counter,effects:[{action:'counter',target:0,counter,n:1}]})))],[h.target('target creature')]);
  if(text==='Put a lore counter on target Saga you control or remove one from it.')return body([choice(['add','remove'].map(mode=>({key:mode,label:mode==='add'?'Add a lore counter':'Remove a lore counter',effects:[{action:mode==='add'?'counter':'remove-counter',target:0,counter:'lore',n:1}]})))],[h.target('target Saga you control')]);
  if(text==='Target opponent gains control of all other permanents you control.')return body([effect('give-other-permanents',{target:0})],[h.target('target opponent')]);
  if(text==='Choose a player. That player adds {G}{G}{G}.')return body([effect('choose-player-mana')]);
  if(text==='Each opponent chooses a creature they control. Tap and goad the chosen creatures.')return body([effect('opponents-choose-tap-goad')]);
  if(text==="This creature's owner shuffles it into their library and draws three cards.")return body([effect('owner-shuffle-draw')]);
  if(text==='Two target creatures you control that share a creature type can\'t be blocked this turn.')return body([{action:'combat-restriction',target:0,restriction:{unblockable:true}}],[{...h.target('target creature you control'),min:2,max:2,groupV22:{test:'shared-creature-type'}}]);
  if(text==='It becomes a Bird Giant, and it loses defender.')return body([{action:'characteristics-v8',target:'self',change:{creatureTypes:['Bird','Giant'],retainCreatureTypes:false},removeKeywords:['defender'],temporary:false}]);
  if(text==='Creatures target player controls get -2/-0 and lose all creature types until end of turn.')return body([effect('erase-types',{target:0})],[h.target('target player')]);
  if(text==='Creatures your opponents control lose hexproof and indestructible until end of turn.')return body([effect('lose-protection-keywords')]);
  if(text==='This creature deals 10 damage to target player and each creature and planeswalker they control.')return body([effect('damage-player-permanents',{target:0,n:10})],[h.target('target player')]);
  if(text==='This creature deals that much damage to any other target.')return body([{action:'damage',target:0,n:{kind:'event-amount'}}],[{...h.effect(card,'This creature deals 1 damage to any target.').targets[0],excludeSelf:true}]);
  if(text==='Draw cards equal to the difference.')return body([{action:'draw',who:'you',n:{kind:'hand-shortfall-v38',n:4}}]);
  if(text==='It phases out at end of combat.')return body([effect('delayed-objects',{target:'event-card',operation:'phase'})]);
  if(text==="Put it on top of its owner's library at end of combat.")return body([effect('delayed-objects',{target:'self',operation:'top'})]);
  if(text==="Return it and this enchantment to their owners' hands at end of combat.")return body([effect('delayed-objects',{target:'attached-host',includeSource:true,operation:'bounce'})]);
  return null;
}
export function extensionLine(card,line,h){
  if(line==='Whenever a creature you control attacks, it phases out at end of combat.'){const base=h.line(card,'Whenever a creature you control attacks, draw a card.');return base?{...base,effects:[effect('delayed-objects',{target:'event-card',operation:'phase'})]}:null;}
  if(line==="When enchanted creature attacks, return it and this enchantment to their owners' hands at end of combat."){const base=h.line(card,'When enchanted creature attacks, draw a card.');return base?{...base,effects:[effect('delayed-objects',{target:'attached-host',includeSource:true,operation:'bounce'})]}:null;}
  if(line==='Whenever one or more Treefolk you control attack, add twice that much {G}.'){
    const base=h.line(card,'Whenever one or more Treefolk you control attack, draw a card.');return base?{...base,effects:[effect('attacker-mana',{subtype:'Treefolk',multiply:2})]}:null;
  }
  if(line==='Whenever a source deals damage to this creature, that source\'s controller mills that many cards.'||line==='Whenever a source deals damage to this creature, that source\'s controller gets a poison counter.')return trigger('oracleDamageHit',{kind:'damage-event-v8',source:{kind:'source',controller:'any'},recipient:{kind:'self'},bind:'source'},body([line.includes('mills')?{action:'mill',who:'event-card-controller',n:{kind:'event-amount'}}:{action:'player-counter',who:'event-card-controller',counter:'poison',n:1}]));
  if(line==='Whenever a creature you control deals combat damage to a planeswalker, destroy that planeswalker.')return trigger('oracleDamageHit',{kind:'damage-event-v8',source:{kind:'filtered',target:h.target('target creature you control')},recipient:{kind:'filtered',target:h.target('target planeswalker')},bind:'recipient',combat:true},body([{action:'destroy',target:'event-card'}]));
  if(line==='Whenever you get one or more {E}, this enchantment deals that much damage to any target.')return trigger('energyGained','your-player',body([{action:'damage',target:0,n:{kind:'event-amount'}}],[h.effect(card,'This creature deals 1 damage to any target.').targets[0]]));
  if(line==='When this creature dies, target land becomes a Swamp. Exile this card.'){
    const base=h.line(card,'When this creature dies, target land becomes a Swamp.');return base?{...base,effects:[...base.effects,{action:'exile',target:'event-card'}]}:null;
  }
  return null;
}
