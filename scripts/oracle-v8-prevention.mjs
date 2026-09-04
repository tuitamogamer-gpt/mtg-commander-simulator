const NUM='(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+|X)';
const amount=text=>text==='X'?'X':({a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[text.toLowerCase()]??Number(text));

// Finite shields retain the affected object, exact incarnation, damage kind,
// and remaining amount. Unknown restrictions are never dropped.
export function extensionEffect(card,line,h){
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
