const shift=(node,n)=>Array.isArray(node)?node.map(child=>shift(child,n)):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,['target','who','otherTarget','conditionTarget'].includes(key)&&typeof value==='number'?value+n:shift(value,n)])):node;
export function extensionEffect(card,line,h){
 const prefix=/^(.+?), then (flip a coin\..+)$/i.exec(line);
 if(prefix){const first=h.effect(card,prefix[1]+'.'),next=extensionEffect(card,prefix[2],h);if(first&&!first.optional&&!first.v4Body&&next&&!next.optional)return{targets:[...first.targets,...next.targets],effects:[...first.effects,...shift(next.effects,first.targets.length)],optional:false};return null;}
 const head=/^(You may )?Flip a coin( until you lose a flip)?\.(?: (.+))?$/i.exec(line)||/^((?:That player|Its controller) flips a coin)\.(?: (.+))?$/i.exec(line);
 if(!head)return null;
 const own=!head[1]?.includes('flips'),optional=own&&!!head[1],repeat=own&&!!head[2],tail=(own?head[3]:head[2])||'';
 const who=own?'you':head[1].toLowerCase().startsWith('that player')?'event-player':'event-card-controller';
 const targets=[],effects=[],elseEffects=[],afterEffects=[];
 if(repeat&&tail){
  const scaled=/^(.+?) for each flip you won\.$/.exec(tail);if(!scaled)return null;
  const body=h.effect(card,scaled[1]+'.');if(!body||body.optional||body.effects.length!==1||!['counter','token-inline','token-key','gain-life','draw'].includes(body.effects[0].action)||typeof body.effects[0].n!=='number')return null;
  targets.push(...body.targets);afterEffects.push({...body.effects[0],n:{kind:'coin-wins-v8',multiply:body.effects[0].n}});
 }else if(tail){
  const pieces=tail.split(/ (?=If (?:you|they) (?:win|lose) the flip, )/);
  const seen=new Set();
  for(const piece of pieces){const m=/^If (?:you|they) (win|lose) the flip, (.+)$/.exec(piece);if(!m||seen.has(m[1]))return null;seen.add(m[1]);
   let body=h.effect(card,m[2]);
   if(!body&&/^(?:destroy|exile|tap|untap) that (?:creature|artifact|permanent)\.$/i.test(m[2])){const parsed=h.effect(card,m[2].replace(/that (?:creature|artifact|permanent)/i,'this creature'));if(parsed)body={...parsed,effects:parsed.effects.map(effect=>({...effect,target:effect.target==='self'?'event-card':effect.target}))};}
   if(!body||body.optional||body.v4Body)return null;
   (m[1]==='win'?effects:elseEffects).push(...shift(body.effects,targets.length));targets.push(...body.targets);
  }
 }
 return{targets,effects:[{action:'coin-flip-v8',who,repeat,effects,elseEffects,...(afterEffects.length?{afterEffects}:{})}],optional};
}
export function extensionLine(card,line,h){
 const m=/^Whenever (you|a player|an opponent) (win|wins|lose|loses) a coin flip, (.+)$/.exec(line);if(!m)return null;
 const body=h.effect(card,m[3]);if(!body||body.v4Body||/"event-card/.test(JSON.stringify(body)))return null;
 return{kind:'generic-trigger',event:'coinFlipped',eventFilter:{kind:'coin-flip-v8',who:m[1]==='you'?'you':m[1]==='an opponent'?'opponent':'any',won:m[2].startsWith('win')},...body,contract:'generic-trigger-effect'};
}
