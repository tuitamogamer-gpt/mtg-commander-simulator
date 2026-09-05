const NUM='(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+|X)';
const amount=text=>text==='X'?'X':({a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[text.toLowerCase()]??Number(text));
const filter=(what,extra={})=>({what,zone:'battlefield',controller:'any',min:1,...extra});
const result=effect=>({effects:[effect],targets:[],optional:false});

// Finite shields retain the affected object, exact incarnation, damage kind,
// and remaining amount. Unknown restrictions are never dropped.
export function extensionEffect(card,line,h){
  if(line==='Prevent all damage that creatures would deal to players this turn.')return result({action:'prevent-all',direction:'all',combat:'any',sourceFilters:[filter('creature')],recipientPlayers:true});
  if(line==='Prevent all damage that would be dealt to you and creatures you control this turn by creatures.')return result({action:'prevent-all',direction:'to',combat:'any',player:'you',filters:[filter('creature',{controller:'you'})],sourceFilters:[filter('creature')]});
  if(line==='Prevent all damage that black sources and red sources would deal this turn.')return result({action:'prevent-all',direction:'by',combat:'any',filters:[filter('card',{colorsAny:['B','R']})]});
  if(line==='Prevent all damage that would be dealt this turn by non-Human sources.')return result({action:'prevent-all',direction:'by',combat:'any',filters:[filter('card',{notSubtype:'Human'})]});
  if(line==='Prevent all combat damage that would be dealt by unblocked creatures this turn.')return result({action:'prevent-all',direction:'by',combat:'combat',filters:[filter('creature')],sourceUnblocked:true});
  const noCounters=/^Prevent all combat damage that would be dealt this turn by creatures with no (\+1\/\+1|-1\/-1) counters on them\.$/.exec(line);
  if(noCounters)return result({action:'prevent-all',direction:'by',combat:'combat',filters:[filter('creature',{withoutCounter:noCounters[1]})]});
  // Oracle uses both passive and active voice for the same source restriction.
  // Normalize only a complete damage sentence; target qualifiers stay intact.
  const active=/^Prevent all (combat |noncombat )?damage (.+?) would deal this turn\.$/.exec(line);
  if(active&&!active[2].includes('of your choice')){
    const body=h.effect(card,'Prevent all '+(active[1]||'')+'damage that would be dealt by '+active[2]+' this turn.');
    if(body?.effects?.length===1&&body.effects[0].action==='prevent-all')return body;
  }
  const chosenAll=/^Prevent all (combat )?damage (?:that would be dealt (?:to (you|any target) )?this turn by (?:a |an )((?:(?:white|blue|black|red|green|artifact|land) )?source|creature) of your choice|(?:a |an )((?:(?:white|blue|black|red|green|artifact|land) )?source|creature) of your choice would deal(?: to (you|any target))? this turn)\.$/.exec(line);
  if(chosenAll){
    const noun=chosenAll[3]||chosenAll[4],recipient=chosenAll[2]||chosenAll[5],targets=[];
    const color={white:'W',blue:'U',black:'B',red:'R',green:'G'}[noun.split(' ')[0]];
    const quality=noun==='creature'?{type:'Creature'}:color?{colors:[color]}:noun==='artifact source'?{type:'Artifact'}:noun==='land source'?{type:'Land'}:{};
    if(recipient==='any target')targets.push({what:'any',zone:'battlefield',controller:'any',min:1,max:1});
    return{targets,effects:[{action:'choose-damage-source-v8',target:recipient==='you'?'you':recipient?0:'all',quality,allTurn:true,...(chosenAll[1]?{combat:true}:{})}],optional:false};
  }
  const chosen=/^The next time (?:a|an) (?:(white|blue|black|red|green|black or red|artifact|land) )?source of your choice would deal damage(?: to (.+?))? this turn, prevent (that damage|half that damage, rounded down)\.(?: (You gain life equal to the damage prevented this way|Exile cards from the top of your library equal to the damage prevented this way)\.)?$/.exec(line);
  if(chosen){
    const targets=[];let target='all';
    if(chosen[2]==='you')target='you';
    else if(chosen[2]){const spec=chosen[2]==='any target'?{what:'any',zone:'battlefield',controller:'any',min:1,max:1}:h.target(chosen[2]);if(!spec||!['battlefield','player'].includes(spec.zone))return null;targets.push(spec);target=0;}
    const quality=chosen[1]?['artifact','land'].includes(chosen[1])?{type:chosen[1][0].toUpperCase()+chosen[1].slice(1)}:{colors:chosen[1].split(' or ').map(color=>({white:'W',blue:'U',black:'B',red:'R',green:'G'}[color]))}:{};
    return{effects:[{action:'choose-damage-source-v8',target,quality,half:chosen[3].startsWith('half'),...(chosen[4]?{after:chosen[4].startsWith('You')?'gain-life':'exile-library'}:{})}],targets,optional:false};
  }
  let text=line.replace(/ damage that would be dealt this turn (to|by) (.+)\.$/i,' damage that would be dealt $1 $2 this turn.');
  const match=new RegExp('^Prevent the next ('+NUM+') (combat )?damage that would be dealt (to|by) (.+?) this turn(?:, where X is (?:the number of )?(.+))?\\.$','i').exec(text);
  if(!match)return null;
  let n=amount(match[1]);
  if(match[5]){if(n!=='X')return null;n=h.count(match[5]);if(!n)return null;}
  const noun=match[4],direction=match[3].toLowerCase(),targets=[];
  let reference;
  if(noun==='you'&&direction==='to')reference='you';
  else if(/^this (?:creature|artifact|enchantment|permanent)$/.test(noun)||noun===card.name)reference='self';
  else if(/^(?:enchanted|equipped) creature$/.test(noun))reference='attached-host';
  else {
    const target=h.target(noun);
    if(!target||!['battlefield','player'].includes(target.zone)||direction==='by'&&['player','opponent','player or planeswalker','any'].includes(target.what))return null;
    targets.push(target);reference=0;
  }
  return {effects:[{action:'prevent-next',target:reference,n,...(match[2]?{combat:true}:{}),...(direction==='by'?{direction}: {})}],targets,optional:false};
}

export function extensionLine(card,line,h){
  if(line==='During your turn, prevent all damage that would be dealt to you.')return {kind:'damage-prevention',action:'prevent-all',direction:'to',combat:'any',player:'you',yourTurnOnly:true,contract:'damage-prevention'};
  if(line==='Prevent all damage that would be dealt to you by sources you don\'t control.')return {kind:'damage-prevention',action:'prevent-all',direction:'to',combat:'any',player:'you',sourceFilters:[filter('card',{controller:'opponent'})],contract:'damage-prevention'};
  const outgoing=/^Prevent all damage that this creature would deal to (snow|red) creatures\.$/.exec(line);
  if(outgoing)return {kind:'damage-prevention',action:'prevent-all',direction:'by',combat:'any',target:'self',recipientFilters:[filter('creature',outgoing[1]==='snow'?{snow:true}:{color:'red'})],contract:'damage-prevention'};
  return null;
}
