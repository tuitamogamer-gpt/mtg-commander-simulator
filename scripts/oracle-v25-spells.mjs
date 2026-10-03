// Additive outcome-linked spell grammar. Only complete closed instructions are accepted.
const targetView=t=>t?.what==='any'&&t.zone==='battlefield'&&t.alternatives?.length&&t.alternatives.every(a=>!['player','opponent','any','any target'].includes(a.what))?{...t,what:'permanent'}:t;
const body=(effects,targets=[])=>targets.every(Boolean)?{effects,targets:targets.map(targetView),optional:false}:null;
const complete=x=>x&&!x.optional&&!x.v4Body&&Array.isArray(x.effects)&&Array.isArray(x.targets)&&x.targets.every(Boolean);
const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const stat=value=>({kind:'linked-stat-v25',stat:value==='mana value'?'mv':value});
const removal=(operation,follow,options={})=>({action:'linked-removal-v25',target:0,operation,follow,...options});
const step=(effects,options={})=>({effects,actor:'you',...options});
export function extensionEffect(card,line,h){
 const excessToken=new RegExp('^'+esc(card.name)+' deals (X|[0-9]+) damage to (target creature|target attacking or blocking creature)\\. Create a number of (tapped )?(Blood|Treasure) tokens equal to the amount of excess damage dealt(?: to that creature)? this way\\.$').exec(line);
 if(excessToken){const tokens=h.effect(card,'Create a '+excessToken[4]+' token.');if(complete(tokens)&&tokens.effects.length===1)return body([{action:'damage-linked-v25',target:0,n:excessToken[1]==='X'?'X':Number(excessToken[1]),follow:[step([{...tokens.effects[0],n:{kind:'linked-excess-v25'},...(excessToken[3]?{tapped:true}:{})}])]}],[h.target(excessToken[2])]);}
 const excessLife=new RegExp('^'+esc(card.name)+' deals ([0-9]+) damage to (target attacking or blocking creature)\\. You gain life equal to the excess damage dealt this way\\.$').exec(line);
 if(excessLife)return body([{action:'damage-linked-v25',target:0,n:Number(excessLife[1]),follow:[step([{action:'gain-life',who:'you',n:{kind:'linked-excess-v25'}}])]}],[h.target(excessLife[2])]);
 const excessChoice=new RegExp('^'+esc(card.name)+' deals (twice X|[0-9]+) damage to (target creature)\\. If excess damage was dealt(?: to that creature)? this way, (investigate|create a Lander token)\\.$').exec(line);
 if(excessChoice){const effects=h.effect(card,excessChoice[3]==='investigate'?'Investigate.':'Create a Lander token.');if(complete(effects)&&!effects.targets.length)return body([{action:'damage-linked-v25',target:0,n:excessChoice[1]==='twice X'?{kind:'sum',values:['X','X']}:Number(excessChoice[1]),follow:[step(effects.effects,{excess:true})]}],[h.target(excessChoice[2])]);}
 const victory=new RegExp('^'+esc(card.name)+' deals 5 damage to (target creature)\\. Each creature you control gains trample and gets \\+X/\\+0 until end of turn, where X is the amount of excess damage dealt this way\\.$').exec(line);
 if(victory)return body([{action:'damage-linked-v25',target:0,n:5,follow:[step([{action:'pump-group',who:'your-creatures',power:{kind:'linked-excess-v25'},toughness:0,keywords:['trample']}])]}],[h.target(victory[1])]);
 const energy=new RegExp('^Choose (target creature|target creature or planeswalker|target spell)\\. You get ((?:\\{E\\})+) ?, then you may pay any amount of \\{E\\}\\. ('+esc(card.name)+' deals that much damage to (?:that creature|that permanent)|Counter that spell unless its controller pays \\{1\\} for each \\{E\\} paid this way)\\.$').exec(line);
 if(energy)return body([{action:'pay-energy-effect-v25',target:0,gain:energy[2].length/3,effect:energy[1]==='target spell'?'counter':'damage'}],[h.target(energy[1])]);
 if(/^You get X \{E\} ?, then you may pay any amount of \{E\}\. Destroy each artifact, creature, and enchantment with mana value less than or equal to the amount of \{E\} paid this way\.$/.test(line))return body([{action:'pay-energy-effect-v25',gain:'X',effect:'destroy-group'}]);
 const canopy=/^Destroy (target artifact, enchantment, or creature with flying)\. If that permanent's mana value was 3 or less, proliferate\.$/.exec(line);
 if(canopy)return body([removal('destroy',[step([{action:'proliferate',who:'you'}],{statMax:{stat:'mv',max:3}})])],[h.target(canopy[1])]);
 const snare=/^Return (target nonland permanent) to its owner's hand\. If that permanent had mana value 3 or less, proliferate\.$/.exec(line);
 if(snare)return body([removal('bounce',[step([{action:'proliferate',who:'you'}],{statMax:{stat:'mv',max:3}})])],[h.target(snare[1])]);
 const breakSpell=/^Destroy (target enchantment)\. If a permanent you controlled or a token was destroyed this way, draw a card\.$/.exec(line);
 if(breakSpell)return body([removal('destroy',[step([{action:'draw',who:'you',n:1}],{success:'left',controllerOrToken:true})])],[h.target(breakSpell[1])]);
 const blasting=new RegExp('^Destroy (target Wall)\\. It can\'t be regenerated\\. '+esc(card.name)+' deals damage equal to that Wall\'s mana value to the Wall\'s controller\\.$').exec(line);
 if(blasting)return body([removal('destroy',[step([{action:'damage',target:'you',n:stat('mana value')}],{actor:'controller'})],{noRegen:true})],[h.target(blasting[1])]);
 const cinder=new RegExp('^Destroy (target creature)\\. If a white creature dies this way, '+esc(card.name)+' deals damage to that creature\'s controller equal to the creature\'s power\\.$').exec(line);
 if(cinder)return body([removal('destroy',[step([{action:'damage',target:'you',n:stat('power')}],{actor:'controller',success:'died',color:'W'})])],[h.target(cinder[1])]);
 const cling=/^Exile (target card from a graveyard)\. If it was a creature card, you gain 3 life\. Otherwise, you draw a card\.$/.exec(line);
 if(cling)return body([removal('exile',[step([{action:'gain-life',who:'you',n:3}],{type:'creature'}),step([{action:'draw',who:'you',n:1}],{notType:'creature'})])],[h.target(cling[1])]);
 const ritual=/^Exile (target creature card from your graveyard)\. Create a black Zombie creature token\. Its power is equal to that card's power and its toughness is equal to that card's toughness\.$/.exec(line);
 if(ritual){const token=h.effect(card,'Create a 1/1 black Zombie creature token.');if(complete(token)&&token.effects.length===1&&token.effects[0].action==='token-inline')return body([removal('exile',[step([{...token.effects[0],token:{...token.effects[0].token,power:stat('power'),toughness:stat('toughness')}}])])],[h.target(ritual[1])]);}
 const rebirth=new RegExp('^Return (target artifact or creature card from your graveyard) to your hand\\. '+esc(card.name)+' deals damage equal to that card\'s mana value to (up to one target creature or planeswalker)\\.$').exec(line);
 if(rebirth)return body([removal('bounce',[step([{action:'damage',target:1,n:stat('mana value')}])])],[h.target(rebirth[1]),h.target(rebirth[2])]);
 const foul=/^Return (target creature card from your graveyard) to your hand\. (Target creature) gets -X\/-X until end of turn, where X is the toughness of the card returned this way\.$/.exec(line);
 if(foul)return body([removal('bounce',[step([{action:'pump',target:1,power:{kind:'linked-negative-v25',value:stat('toughness')},toughness:{kind:'linked-negative-v25',value:stat('toughness')}}],{success:'returned'})])],[h.target(foul[1]),h.target(foul[2].toLowerCase())]);
 const siren=/^Exile (target creature you control), then return that card to the battlefield under its owner's control\. If a Pirate was exiled this way, draw a card\.$/.exec(line);
 if(siren)return body([removal('blink',[step([{action:'draw',who:'you',n:1}],{success:'exiled',subtype:'Pirate'})])],[h.target(siren[1])]);
 const splash=/^Exile (target creature you control), then return it to the battlefield under its owner's control\. If that creature is a Bird, Frog, Otter, or Rat, draw a card\.$/.exec(line);
 if(splash)return body([removal('blink',[step([{action:'draw',who:'you',n:1}],{postSubtypes:['Bird','Frog','Otter','Rat']})])],[h.target(splash[1])]);
 const historic=/^Return (target historic permanent card from your graveyard) to the battlefield\. It enters with two additional \+1\/\+1 counters on it if it's a creature\.$/.exec(line);
 if(historic)return body([removal('reanimate',[],{controller:'you',entryCreatureCounters:{'+1/+1':2}})],[h.target(historic[1])]);
 const auras=/^Return (target creature you control) and all Auras you control attached to it to their owner's hand\.$/.exec(line);
 if(auras)return body([{action:'bounce-with-auras-v25',target:0}],[h.target(auras[1])]);
 const typeFollow=/^Destroy (target .+?)\. If (?:an?|the) (artifact|creature|enchantment|land|planeswalker) (?:is|was) destroyed this way, (.+)\.$/.exec(line);
 if(typeFollow){const follow=h.effect(card,typeFollow[3][0].toUpperCase()+typeFollow[3].slice(1)+'.');if(complete(follow)&&!follow.targets.length)return body([removal('destroy',[step(follow.effects,{success:'left',type:typeFollow[2]})])],[h.target(typeFollow[1])]);}
 const life=/^Destroy (target .+?) and you lose life equal to its (power|toughness|mana value)\.$/.exec(line);
 if(life)return body([removal('destroy',[step([{action:'lose-life',who:'you',n:stat(life[2])}])])],[h.target(life[1])]);
 const agonizing=new RegExp('^Destroy (target nonblack creature)\\. It can\'t be regenerated\\. If this spell was kicked, '+esc(card.name)+' deals damage equal to that creature\'s power to the creature\'s controller\\.$').exec(line);
 if(agonizing)return body([removal('destroy',[step([{action:'damage',target:'you',n:stat('power')}],{actor:'controller',kicked:true})],{noRegen:true})],[h.target(agonizing[1])]);
 const purge=new RegExp('^Destroy (target creature with mana value X)\\. If that creature dies this way, '+esc(card.name)+' deals damage equal to the creature\'s power to the creature\'s controller\\.$').exec(line);
 if(purge)return body([removal('destroy',[step([{action:'damage',target:'you',n:stat('power')}],{actor:'controller',success:'died'})])],[h.target(purge[1])]);
 const mercy=/^(Target creature)'s controller sacrifices it, then creates X 1\/1 green and white Elf Warrior creature tokens, where X is that creature's power\.$/.exec(line);
 if(mercy){const tokens=h.effect(card,'Create a 1/1 green and white Elf Warrior creature token.');if(complete(tokens)&&tokens.effects.length===1&&!tokens.targets.length)return body([removal('sacrifice',[step([{...tokens.effects[0],n:stat('power')}],{actor:'controller'})])],[h.target(mercy[1].toLowerCase())]);}
 const commission=/^Return (target artifact or creature card with mana value 3 or less from your graveyard) to the battlefield\. If a creature enters this way, it enters with an additional \+1\/\+1 counter on it\.$/.exec(line);
 if(commission)return body([removal('reanimate',[],{controller:'you',entryCreatureCounters:{'+1/+1':1}})],[h.target(commission[1])]);
 const restoration=/^Return (target creature card from your graveyard) to the battlefield\. If this spell was kicked, you gain life equal to that card's mana value\. Otherwise, you lose that much life\.$/.exec(line);
 if(restoration)return body([removal('reanimate',[step([{action:'gain-life',who:'you',n:stat('mana value')}],{kicked:true}),step([{action:'lose-life',who:'you',n:stat('mana value')}],{kicked:false})],{controller:'you'})],[h.target(restoration[1])]);
 const respite=/^Exile (target nonlegendary creature), then return it to the battlefield under its owner's control\. If it entered under your control, put a \+1\/\+1 counter on it\. Otherwise, tap it\.$/.exec(line);
 if(respite)return body([removal('blink',[step([{action:'counter',target:0,counter:'+1/+1',n:1}],{enteredController:'you'}),step([{action:'tap',target:0}],{enteredController:'other'})])],[h.target(respite[1])]);
 const sacrifice=/^(Target opponent) sacrifices (?:a|an) (.+?)(?: of their choice)?\. If that player does, they lose ([0-9]+) life\.$/.exec(line);
 if(sacrifice){const filter=sacrifice[2]==='green or white creature'?{...h.target('target creature'),colorsAny:['G','W']}:h.target('target '+sacrifice[2]);if(filter?.zone==='battlefield')return body([{action:'choose-sacrifice-linked-v25',who:0,filter,follow:[step([{action:'lose-life',who:'you',n:Number(sacrifice[3])}],{actor:'controller',success:'sacrificed'})]}],[h.target(sacrifice[1].toLowerCase())]);}
 const exchange=/^Exchange control of (two target permanents|two target creatures)(?: (that share a (?:card|permanent) type|controlled by different players))?\.(?: If you control neither creature, draw three cards\.)?$/.exec(line);
 if(exchange){const target=h.target(exchange[1]);if(target?.zone==='battlefield'&&target.min===2&&target.max===2)return body([{action:'exchange-control-v25',target:0,...(line.endsWith('draw three cards.')?{drawIfNeither:3}:{})}],[{...target,...(exchange[2]?{groupV22:{test:exchange[2].startsWith('that share')?'shared-card-type':'different-controllers-v25',...(exchange[2].includes('permanent type')?{permanentOnly:true}:{})}}:{})}]);}
 return null;
}
export function extensionLine(){return null;}
export function modifierOperation(){return null;}
export function extensionCondition(){return null;}
export function extensionCount(){return null;}
export function extensionTarget(){return null;}
export function modalOperation(){return null;}
// Linked quantities may only appear inside the action that captures their values.
export function finalizeCompilation(card,result){
 let invalid=false;
 const walk=(node,scope)=>{
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const child of node)walk(child,scope);return;}
  const next=node.action==='linked-removal-v25'||node.action==='choose-sacrifice-linked-v25'?'stat':node.action==='damage-linked-v25'?'excess':scope;
  if(node.kind==='linked-stat-v25'&&(next!=='stat'||!['mv','power','toughness'].includes(node.stat))||node.kind==='linked-excess-v25'&&next!=='excess'||node.kind==='linked-negative-v25'&&next!=='stat')invalid=true;
  for(const value of Object.values(node))walk(value,next);
 };
 walk(result.implementation);
 return invalid?{reason:'Unsupported unbound outcome-linked quantity',unsupported:card.oracle_text}:result;
}
