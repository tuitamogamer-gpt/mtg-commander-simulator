const NUM='(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+|X)';
const number=t=>t==='X'?'X':({a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[t]??Number(t));
const body=effect=>({effects:[effect],targets:[]});
function scope(card,text,h){
 if(!text)return {all:true};
 if(['a source','any source','a permanent or player'].includes(text))return {all:true};
 if(text==='a source of your choice')return {ref:'chosen-source-v20'};
 if(text==="that source's controller"||text==="its controller")return {damageSourceController:true};
 if(['this creature and/or you','you and/or this creature'].includes(text))return {youAndSelf:true};
 if(text==='you')return {player:'you'};
 if(['a player','players','any player'].includes(text))return {player:'all'};
 if(['an opponent','opponents'].includes(text))return {player:'opponent'};
 if(['an opponent or a permanent an opponent controls','an opponent or a permanent they control'].includes(text))return {opponentObjects:true};
 if(['you and/or permanents you control','you or a permanent you control','you and permanents you control'].includes(text))return {yourObjects:true};
 if(text==='you and other permanents you control')return {yourObjects:true,other:true};
 if(['this creature','this enchantment','this artifact','this permanent',card.name,card.name.split(',')[0]].includes(text))return {ref:'self'};
 if(text==='it')return {ref:'event-card'};
 if(text==='enchanted creature'||text==='equipped creature')return {ref:'attached-host'};
 if(text==='enchanted player')return {ref:'attached-host'};
 if(['a creature, battle, or opponent','a permanent, player, or battle'].includes(text))return null;
 const phrase=text.replace(/^(?:a |an |any )/,'').replace(/sources?\b/g,'card').replace(/\b(creature|permanent|artifact|land|enchantment|planeswalker)s\b/g,'$1').replace(/ your opponents control\b/g," an opponent controls");
 const base=h.target('target '+(phrase.startsWith('other ')?phrase.slice(6):phrase)),filter=base&&{...base,...(phrase.startsWith('other ')?{excludeSelf:true}:{})};
 return filter?{filter}:null;
}
function amount(text,h){const fixed=number(text);return typeof fixed==='number'&&Number.isFinite(fixed)||fixed==='X'?fixed:h.value?.(text)||h.count(text);}
const target=(text,h)=>text==='any target'?{what:'any',zone:'battlefield',controller:'any',min:1,max:1}:h.target(text);
function redirected(card,line,h,temporary=false){
 const all=/^All (combat )?damage that would be dealt to (.+?)(?: this turn)?(?: by (.+?))?(?: this turn)? is dealt to (.+?) instead\.$/.exec(line);
 const next=/^The next time (?:damage would be dealt to (.+?)|a source of your choice would deal damage(?: to (.+?))?) this turn, that damage is dealt to (.+?) instead\.$/.exec(line);
 if(!all&&!next)return null;
 const targets=[];
 const selector=text=>{if(/^another target /.test(text))text=text.replace('another target','target');if(/^(?:target |any target$)/.test(text)){const filter=target(text,h);if(!filter)return null;const ref=targets.length;targets.push({...filter,...(ref?{differentFromAllPrevious:true}:{})});return {ref};}return scope(card,text,h);};
 const recipient=selector(all?all[2]:next[1]||next[2]),source=selector(all?all[3]:next[2]||!next[1]?'a source of your choice':undefined);
 const destination=selector(all?all[4]:next[3]);
 if(!recipient||!source||!destination)return null;
 const op={mode:'redirect',source,recipient,destination,...(all?.[1]?{combat:'combat'}:{}),...(next?{once:true}:{}),n:'all'};
 if(temporary!==/this turn/.test(line)||!temporary&&targets.length)return null;
 return temporary?{effects:[{action:'damage-rule-v20',...op,...(typeof source.ref==='number'?{sourceTarget:source.ref}:{}),...(typeof recipient.ref==='number'?{target:recipient.ref}:{}),...(typeof destination.ref==='number'?{redirectTarget:destination.ref}:{})}],targets}:{kind:'damage-rule-v20',...op,contract:'damage-rule-v20'};
}
function multiplier(card,line,h){
 line=line.replace(/ damage this turn to (.+?),/, ' damage to $1 this turn,');
 const changed=/^(.+?), instead it deals that much damage plus X, where X is (.+)\.$/.exec(line);
 if(changed)line=changed[1]+', it deals that much damage plus '+changed[2]+' instead.';
 const m=/^If (.+?) would deal (combat |noncombat )?damage(?: to (.+?))?( this turn)?, it deals (double that damage|twice that much damage|triple that damage|that much damage plus (.+?))(?: to (?:that player|that permanent|that creature|that opponent|that permanent or player))? instead\.$/.exec(line);
 if(!m)return null;
 const source=scope(card,m[1],h),recipient=scope(card,m[3],h);if(!source||!recipient)return null;
 const add=m[6]?amount(m[6].replace(/^an amount of damage equal to (?:the number of )?/,''),h):0;
 if(add===null||add===undefined)return null;
 return {mode:'modify',source,recipient,...(m[2]?{combat:m[2].trim()}:{}),factor:m[5].startsWith('triple')?3:m[5].startsWith('that')?1:2,add,temporary:!!m[4]};
}
export function extensionLine(card,line,h){
 if(/^Prevent all (?:combat )?damage .+\.$/.test(line)&&!line.includes('this turn')){const parsed=extensionEffect(card,line.slice(0,-1)+' this turn.',h);if(parsed?.targets?.length===0&&parsed.effects?.length===1&&parsed.effects[0].action==='damage-rule-v20'){const {action,...op}=parsed.effects[0];return {kind:'damage-rule-v20',...op,contract:'damage-rule-v20'};}}
 const sacrifice=/^If damage would be dealt to (.+?), sacrifice that many permanents instead\.$/.exec(line);
 if(sacrifice){const recipient=scope(card,sacrifice[1],h);if(recipient?.ref==='self')return {kind:'damage-rule-v20',mode:'sacrifice-controller',source:{all:true},recipient,contract:'damage-rule-v20'};}
 const spellKeywords=/^(?:(White|Blue|Black|Red|Green) )?[Ii]nstant and sorcery spells you control have (deathtouch|lifelink|wither|infect)\.$/.exec(line);
 if(spellKeywords)return {kind:'spell-keywords-v20',keywords:[spellKeywords[2]],...(spellKeywords[1]?{colors:[{White:'W',Blue:'U',Black:'B',Red:'R',Green:'G'}[spellKeywords[1]]]}:{}),contract:'spell-keywords-v20'};
 const conditioned=/^As long as (.+?), (all .+|prevent .+)$/i.exec(line);
 if(conditioned){const condition=h.condition(conditioned[1]),op=extensionLine(card,conditioned[2][0].toUpperCase()+conditioned[2].slice(1),h);if(condition&&op&&!op.condition)return {...op,condition};return null;}
 const redirect=redirected(card,line,h);if(redirect)return redirect;
 const prefix=/^(?:As long as (.+?), if |Max speed — If )(.+)$/.exec(line);
 if(prefix){const condition=prefix[1]?h.condition(prefix[1]):{kind:'player-speed-v10',min:4},op=extensionLine(card,'If '+prefix[2],h);if(condition&&op&&!op.condition)return {...op,condition};return null;}
 const whileClause=/^(.+?) while (.+?), (.+)$/.exec(line);
 if(whileClause){const condition=h.condition(whileClause[2]),op=extensionLine(card,whileClause[1]+', '+whileClause[3],h);if(condition&&op&&!op.condition)return {...op,condition};return null;}
 const modified=multiplier(card,line,h);if(modified&&!modified.temporary)return {kind:'damage-rule-v20',...modified,contract:'damage-rule-v20'};
 const phyto=/^If damage would be dealt to (.+?), put that many (\+1\/\+1|-1\/-1) counters on (?:this creature|it) instead\.$/.exec(line);
 if(phyto){const recipient=scope(card,phyto[1],h);if(recipient)return {kind:'damage-rule-v20',mode:'counters',counter:phyto[2],source:{all:true},recipient,contract:'damage-rule-v20'};}
 const replace=/^If (.+?) would deal noncombat damage to (.+?), put that many -1\/-1 counters on that creature instead\.$/.exec(line);
 if(replace){const source=scope(card,replace[1],h),recipient=scope(card,replace[2],h);if(source&&recipient?.filter)return {kind:'damage-rule-v20',mode:'counters',source,recipient,combat:'noncombat',contract:'damage-rule-v20'};}
 const prevent=/^If (?:(combat |noncombat )?damage would be dealt to (.+?)|a source would deal damage to (.+?)), prevent (that damage|all that damage|([0-9]+|X) of that damage)\.(?: (You gain life equal to the damage prevented this way)\.)?$/.exec(line);
 if(prevent){const recipient=scope(card,prevent[2]||prevent[3],h);if(recipient&&prevent[5]!=='X')return {kind:'damage-rule-v20',mode:'prevent',recipient,source:{all:true},...(prevent[1]?{combat:prevent[1].trim()}:{}),n:prevent[5]?Number(prevent[5]):'all',...(prevent[6]?{rider:{kind:'gain-life',basis:'prevented'}}:{}),contract:'damage-rule-v20'};}
 const rider=/^If (?:(combat |noncombat )?damage would be dealt to (.+?)|a source would deal damage to (.+?)), prevent that damage and (put an? ([a-z-]+) counter on this (?:enchantment|creature)|mill (twice )?that many cards|exile that many cards from the top of your library|each opponent mills that many cards)\.$/.exec(line);
 if(rider){const recipient=scope(card,rider[2]||rider[3],h);if(recipient)return {kind:'damage-rule-v20',mode:'prevent',recipient,source:{all:true},...(rider[1]?{combat:rider[1].trim()}:{}),n:'all',rider:rider[5]?{kind:'source-counter',counter:rider[5],n:1,basis:'attempted'}:rider[4].startsWith('exile')?{kind:'exile-library',basis:'attempted'}:{kind:'mill',opponents:rider[4].startsWith('each'),factor:rider[6]?2:1,basis:'attempted'},contract:'damage-rule-v20'};}
 const mind=/^If (a source you control) would deal damage to (an opponent), prevent that damage and each opponent mills that many cards\.$/.exec(line);
 if(mind)return {kind:'damage-rule-v20',mode:'prevent',source:scope(card,mind[1],h),recipient:scope(card,mind[2],h),n:'all',rider:{kind:'mill',opponents:true,basis:'attempted'},contract:'damage-rule-v20'};
 const swans=/^If a source would deal damage to (.+?), prevent that damage\. The source's controller draws cards equal to the damage prevented this way\.$/.exec(line);
 if(swans){const recipient=scope(card,swans[1],h);if(recipient)return {kind:'damage-rule-v20',mode:'prevent',source:{all:true},recipient,n:'all',rider:{kind:'draw-source-controller',basis:'prevented'},contract:'damage-rule-v20'};}
 const exilePlayer=/^If damage would be dealt to a player, that player exiles that many cards from the top of their library instead\.$/.exec(line);
 if(exilePlayer)return {kind:'damage-rule-v20',mode:'exile-player-library',source:{all:true},recipient:{player:'all'},contract:'damage-rule-v20'};
 return null;
}
export function extensionEffect(card,line,h){
 if(line==='The next time a source of your choice of the chosen color would deal damage to you this turn, prevent that damage.')return body({action:'choose-damage-source-v20',target:'you',quality:{chosenColorV10:true}});
 if(line==='The next time a creature of your choice with shadow would deal damage to you this turn, prevent that damage.')return body({action:'choose-damage-source-v20',target:'you',quality:{type:'Creature',keyword:'shadow'}});
 if(line==='The next time a creature of the chosen type would deal damage to you this turn, prevent that damage.')return body({action:'choose-damage-source-v20',target:'you',quality:{type:'Creature',subtype:{kind:'chosen-subtype-v16'}}});
 if(line==='If any source would deal 1 or more damage to a permanent or player this turn, it deals 2 damage to that permanent or player instead.')return body({action:'damage-rule-v20',mode:'modify',source:{all:true},recipient:{all:true},factor:0,add:2});
 const redirect=redirected(card,line,h,true);if(redirect)return redirect;
 const prevent=/^Prevent all (combat )?damage (?:that would be dealt (?:this turn )?by (.+?)|that would be dealt (?:this turn )?to (.+?)(?: by (.+?))?|(?:that )?(.+?) would deal)(?: this turn)\.$/.exec(line);
 if(prevent){
  const targets=[];
  const selector=text=>{if(!text)return {all:true};if(text.startsWith('target ')||text==='any target'){const spec=target(text,h);if(!spec)return null;const ref=targets.length;targets.push(spec);return {ref};}if(text==='that creature')return {ref:'event-card'};return scope(card,text,h);};
  const source=selector(prevent[2]||prevent[4]||prevent[5]),recipient=selector(prevent[3]);
  if(source&&recipient&&source.ref!=='chosen-source-v20')return {effects:[{action:'damage-rule-v20',mode:'prevent',source,recipient,n:'all',...(prevent[1]?{combat:'combat'}:{}),...(source.ref!==undefined?{sourceTarget:source.ref}:{}),...(recipient.ref!==undefined?{target:recipient.ref}:{})}],targets};
 }
 const modified=multiplier(card,line,h);if(modified?.temporary){delete modified.temporary;return body({action:'damage-rule-v20',...modified});}
 const targeted=/^Each time (target permanent) would deal damage to a permanent or player this turn, it deals double that damage to that permanent or player instead\.$/.exec(line);
 if(targeted){const target=h.target(targeted[1]);if(target)return {effects:[{action:'damage-rule-v20',mode:'modify',source:{ref:0},sourceTarget:0,recipient:{all:true},factor:2,add:0}],targets:[target]};}
 const shield=new RegExp('^Prevent the next ('+NUM+') damage that would be dealt to (.+?) this turn(?:, where X is (.+?))?\\.(?: (You gain life equal to the damage prevented this way|For each 1 damage prevented this way, put a \\+1/\\+1 counter on that creature)\\.)?$').exec(line);
 if(shield){const spec=target(shield[2],h),n=shield[3]?amount(shield[3],h):amount(shield[1],h);if(spec&&n!==null&&n!==undefined)return {effects:[{action:'damage-rule-v20',mode:'prevent',recipient:{ref:0},target:0,source:{all:true},n,...(shield[4]?{rider:{kind:shield[4].startsWith('You')?'gain-life':'target-counter',counter:'+1/+1',basis:'prevented'}}:{})}],targets:[spec]};}
 const next=/^The next time (target creature|that creature|this creature|target spell) would deal (combat )?damage this turn, prevent that damage\.(?: (You gain life equal to the damage prevented this way)\.)?$/.exec(line);
 if(next){const target=next[1].startsWith('target')?h.target(next[1]):null,ref=target?0:next[1]==='this creature'?'self':'event-card';if(target||!next[1].startsWith('target'))return {effects:[{action:'damage-rule-v20',mode:'prevent',source:{ref},sourceTarget:ref,recipient:{all:true},n:'all',once:true,...(next[2]?{combat:'combat'}:{}),...(next[3]?{rider:{kind:'gain-life',basis:'prevented'}}:{})}],targets:target?[target]:[]};}
 const spell=/^Prevent all damage (target (?:instant or sorcery )?spell) would deal this turn\.(?: (You gain life equal to the damage prevented this way)\.)?$/.exec(line);
 if(spell){const target=h.target(spell[1]);if(target)return {effects:[{action:'damage-rule-v20',mode:'prevent',source:{ref:0},sourceTarget:0,recipient:{all:true},n:'all',...(spell[2]?{rider:{kind:'gain-life',basis:'prevented'}}:{})}],targets:[target]};}
 return null;
}
