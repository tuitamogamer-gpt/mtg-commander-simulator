// Closed clauses for both printed faces. Native effects retain their normal
// casting, targeting, payment, identity and resolution paths.
const body=(effects,targets=[])=>({effects,targets,optional:false});
const trigger=(event,eventFilter,b,extra={})=>b&&({kind:'generic-trigger',event,eventFilter,...b,...extra,contract:'generic-trigger-effect'});
const aliases=new Map([
 ['Exile any number of target creatures that have -1/-1 counters on them.','Exile any number of target creatures with -1/-1 counters on them.'],
 ["Up to three target lands don't untap during their controller's next untap step.","Up to three target lands don't untap during their controllers' next untap steps."],
 ['Whenever this creature becomes blocked by a creature, the blocking creature gets -1/-1 until end of turn.','Whenever this creature becomes blocked by a creature, that creature gets -1/-1 until end of turn.'],
 ["Whenever this creature attacks and isn't blocked, you may pay {2}{B}. If you do, transform it.","Whenever this creature attacks and isn't blocked, you may pay {2}{B}. If you do, transform this creature."],
]);
export function extensionLine(card,line,h){
 if(line==='Permanent spells you cast that have an Adventure cost {1} less to cast.')return {kind:'common-cost-v63',mode:'adventure-permanent',contract:'generic-continuous-effect'};
 if(line==='This spell costs {X} less to cast, where X is the number of cards in your graveyard that are instant cards, sorcery cards, and/or have an Adventure.')return {kind:'common-cost-v63',mode:'grave-adventure-union',contract:'generic-continuous-effect'};
 if(aliases.has(line))return h.line(card,aliases.get(line));
 if(card.oracleTransformFacesV20 && /^At the beginning of your end step, if this creature is equipped, transform it\.$/.test(line))return trigger('endStep','your-end-step',body([{action:'transform-self'}]),{condition:{kind:'source-status',status:'equipped'}});
 if(line==='Whenever you cast a noncreature spell or a Dragon spell, this creature gets +2/+0 until end of turn.')return trigger('cast',{kind:'stack-copy-cast-v8',target:{what:'spell',zone:'stack',controller:'you',alternatives:[h.target('target noncreature spell'),h.target('target Dragon spell')]}},body([{action:'pump',target:'self',power:2,toughness:0,keywords:[]}]));
 if(line==='When this creature enters, draw cards equal to the number of opponents who were dealt combat damage this turn.')return trigger('etb','self',body([{action:'draw',who:'you',n:{kind:'combat-damaged-opponents-v63'}}]));
 if(line==='During your turn, prevent all damage that would be dealt to this creature.')return {kind:'damage-rule-v20',mode:'prevent',recipient:{ref:'self'},source:{all:true},n:'all',condition:{kind:'your-turn'},contract:'damage-rule-v20'};
 if(card.oraclePrepareV10&&line==="At the beginning of your upkeep, if this creature isn't prepared, it becomes prepared.")return trigger('upkeep','your-upkeep',body([{action:'prepare-v10',target:'self'}]),{condition:{kind:'not-prepared-v63'}});
 if(line==='{T}: Add X {G} or X {W}, where X is the number of other creatures you control.')return {kind:'mana-source',activationCost:{tap:true},produce:[{G:1},{W:1}],multiplier:{kind:'count',zone:'battlefield',what:'creature',controller:'you',other:true},contract:'mana-source'};
 if(line==='Whenever this creature attacks, return target creature card with mana value 2 or less from your graveyard to the battlefield tapped and attacking.'){const b=h.effect(card,'Return target creature card from your graveyard to the battlefield tapped and attacking.');return b&&trigger('attacks','self',{...b,targets:[{...b.targets[0],stat:'mv',comparison:'less',threshold:2}]});}
 if(line==='At the beginning of combat on your turn, if you control three or more creatures that each have toughness greater than their power, transform this creature.')return trigger('beginCombat','your-combat',body([{action:'transform-self'}]),{condition:{kind:'defensive-creature-count-v63',min:3}});
 if(line==='At the beginning of combat on your turn, put a +1/+1 counter on target creature you control. Then if that creature has toughness 6 or greater, transform this enchantment.')return trigger('beginCombat','your-combat',body([{action:'counter',target:0,counter:'+1/+1',n:1},{action:'conditional',conditionTarget:0,condition:{kind:'source-stat-comparison',stat:'toughness',comparison:'greater',threshold:6},effects:[{action:'transform-self'}]}],[h.target('target creature you control')]));
 if(line==='Whenever a source you control deals noncombat damage to an opponent, you may exile that many cards from the top of your library. You may play those cards this turn.')return trigger('oracleDamageHit',{kind:'damage-event-v8',source:{kind:'source',controller:'you'},recipient:{kind:'an opponent'},combat:false,bind:'source'},body([{action:'exile-permission-v22',who:'you',n:{kind:'event-amount'},duration:'eot'}]),{optional:true});
 if(card.oracleTransformFacesV20){
  const m=/^Whenever (.+) attacks, you may pay ((?:\{[^}]+\})+)\. If you do, transform (?:her|him|it)\.$/.exec(line);
  if(m && [card.name,card.name.split(',')[0],'this creature'].includes(m[1]))return h.line(card,'Whenever this creature attacks, you may pay '+m[2]+'. If you do, transform this creature.');
  const grave=/^(\{(?:[0-9]+|[WUBRGC])\}(?:\{(?:[0-9]+|[WUBRGC])\})*): (?:Put|Return) this card from your graveyard (?:onto|to) the battlefield transformed\. Activate only as a sorcery\.$/.exec(line);
  if(grave)return {kind:'generic-ability',from:'graveyard',retainGraveSource:true,sorceryOnly:true,cost:{mana:grave[1]},...body([{action:'return-faced-source-v21',face:'back',controller:'you',tapped:false}]),contract:'generic-activated-effect'};
  if(line==='When this creature transforms into Blightsower Thallid or dies, create a 1/1 green Phyrexian Saproling creature token.')return trigger(['transformed','dies'],'self',h.effect(card,'Create a 1/1 green Phyrexian Saproling creature token.'),{transformNameV21:'Blightsower Thallid'});
 }
 return null;
}
export function extensionEffect(card,line,h){
 if(line==="Choose target creature you control. Each other creature you control becomes a copy of it until end of turn, except those creatures aren't legendary.")return body([{action:'become-copy-v8',filter:h.target('target creature you control'),otherTarget:0,excludeModel:true,duration:'eot',modifications:{nonlegendary:true}}],[h.target('target creature you control')]);
 if(line==="Put target artifact or enchantment on the bottom of its owner's library.")return body([{action:'move-to-library',target:0,bottom:true}],[{what:'permanent',zone:'battlefield',controller:'any',min:1,alternatives:[h.target('target artifact'),h.target('target enchantment')]}]);
 if(line==="Up to three target lands don't untap during their controller's next untap step.")return body([{action:'skip-next-untap',target:0}],[h.target('up to three target lands')]);
 if(aliases.has(line))return h.effect(card,aliases.get(line));
 if(line==='Each non-Dragon creature gets -X/-X until end of turn.'){const n={kind:'signed',sign:-1,value:'X'};return body([{action:'battlefield-group',operation:'pump',filters:[{...h.target('target creature'),notSubtype:'Dragon'}],power:n,toughness:n,keywords:[]}]);}
 if(line==='Create a Heartwood token.')return body([{action:'token-inline',who:'you',n:1,token:{name:'Heartwood',super:[],types:['Artifact'],subtypes:[],colors:['R','G'],keywords:[],oracle:'{T}: Add {R} or {G}.',operations:[{kind:'mana-source',produce:[{R:1},{G:1}],contract:'mana-source'}]}}]);
 if(line==='Create a 1/1 white Human creature token and a Food token.'){const one=h.effect(card,'Create a 1/1 white Human creature token.'),two=h.effect(card,'Create a Food token.');return one&&two&&body([...one.effects,...two.effects]);}
 if(line==='Choose a creature or planeswalker, then destroy all other creatures and planeswalkers.'){const filter={what:'permanent',zone:'battlefield',controller:'any',alternatives:[h.target('target creature'),h.target('target planeswalker')]};return body([{action:'choose-source-v20',filter,effects:[{action:'battlefield-group',operation:'destroy',filters:[filter],excludeTargetsV11:[0]}]}]);}
 if(line==='Return target creature card from your graveyard to the battlefield. You lose life equal to its mana value.')return body([{action:'reanimate',target:0,controller:'you'},{action:'lose-life',who:'you',n:{kind:'target-stat',target:0,stat:'mv'}}],[h.target('target creature card from your graveyard')]);
 if(line==="Exile two target creatures and/or lands you control, then return them to the battlefield under their owner's control.")return body([{action:'blink',target:0,controller:'owner'}],[{what:'permanent',zone:'battlefield',controller:'you',alternatives:[h.target('target creature you control'),h.target('target land you control')],min:2,max:2}]);
 if(line==='Counter target activated or triggered ability from a noncreature source.')return body([{action:'counter-spell',target:0}],[{...h.target('target activated or triggered ability'),v20:{kind:'ability-noncreature-source-v63'}}]);
 if(line==='Put a creature card from a graveyard onto the battlefield under your control. It gains haste until end of turn.')return body([{action:'common-effects-v63',mode:'choose-grave-haste'}]);
 if(line==='Remove all +1/+1 counters from target creature you control. Draw that many cards.')return body([{action:'common-effects-v63',mode:'remove-counters-draw',target:0}],[h.target('target creature you control')]);
 if(line==='Each opponent chooses a creature they control. You gain control of those creatures.')return body([{action:'common-effects-v63',mode:'opponent-choice-control'}]);
 if(line==='Target player sacrifices a creature with the greatest power among creatures they control. You gain life equal to its power.')return body([{action:'common-effects-v63',mode:'greatest-power-life',target:0}],[h.target('target player')]);
 if(line==="Search target opponent's library for a card and exile it. You gain life equal to its mana value. That player shuffles.")return body([{action:'common-effects-v63',mode:'opponent-library-exile-life',target:0}],[h.target('target opponent')]);
 return null;
}
export const modifierOperation=extensionLine;
export function normalizeCard(card){return card;}

// Bind each split half against its own printed cost before composing it. This
// keeps a right-half X filter tied to that half's announced X.
export function compileWholeCard(card,h){
 if(card.layout==='normal'&&card.oracleTransformFacesV20){
  const text=h.stripReminderText(card.oracle_text);
  let implementation;
  if(card.name==='Dormant Grove'&&text==='At the beginning of combat on your turn, put a +1/+1 counter on target creature you control. If that creature has toughness 6 or greater, transform this enchantment.')implementation=[trigger('beginCombat','your-combat',body([{action:'counter',target:0,counter:'+1/+1',n:1},{action:'conditional',conditionTarget:0,condition:{kind:'source-stat-comparison',stat:'toughness',comparison:'greater',threshold:6},effects:[{action:'transform-self'}]}],[{what:'creature',zone:'battlefield',controller:'you',min:1}]))];
  if(card.name==='Blightsower Thallid'&&text==='When this creature transforms into this creature or dies, create a 1/1 green Phyrexian Saproling creature token.'){
   const tokens=body([{action:'token-inline',who:'you',n:1,token:{name:'Phyrexian Saproling',super:[],types:['Creature'],subtypes:['Phyrexian','Saproling'],colors:['G'],power:1,toughness:1,keywords:[],operations:[]}}]);
   implementation=[trigger('transformed',{kind:'transform-self-v20',name:'Blightsower Thallid'},tokens),trigger('dies','self',tokens)];
  }
  if(implementation)return {semanticClass:/\bCreature\b/.test(card.type_line)?'creature-template':'permanent-template',implementation,implementedKeywords:[],oracleContracts:[...new Set(implementation.map(op=>op.contract))],rulesCore:text};
 }
 if(card.layout!=='split'||card.card_faces?.length!==2||card.card_faces.some(face=>!['Instant','Sorcery'].includes(face.type_line)))return null;
 const faces=[];let fuse=false;
 for(const [index,face]of card.card_faces.entries()){
  const lines=h.stripReminderText(face.oracle_text).split('\n'),aftermath=lines.includes('Aftermath');
  fuse ||= lines.includes('Fuse');
  if(aftermath&&index!==1)return null;
  const compiled=h.compile({...card,...face,layout:'normal',card_faces:undefined,oracle_text:lines.filter(line=>!['Fuse','Aftermath'].includes(line)).join('\n')});
  if(!compiled.semanticClass||compiled.implementation.length!==1)return null;
  const op=compiled.implementation[0];
  if(op.kind!=='spell-generic'||op.optional||op.effects.some(effect=>effect.target==='self'))return null;
  faces.push({key:index?'right':'left',name:face.name,cost:face.mana_cost,types:[face.type_line],aftermath,effects:op.effects,targets:op.targets||[],optional:false});
 }
 if(fuse&&faces.some(face=>face.aftermath))return null;
 return {semanticClass:'spell-template',implementedKeywords:[],implementation:[{kind:'split-faces',faces,fuse,contract:'split-casting'}],oracleContracts:['split-casting'],rulesCore:card.card_faces.map(face=>face.name+': '+h.stripReminderText(face.oracle_text)).join('\n')};
}
