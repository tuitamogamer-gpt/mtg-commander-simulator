// Closed casting transactions added after the frozen v22 grammar.
const MANA='(?:\\{(?:[0-9]+|[WUBRGC])\\})+',words={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6};
const amount=s=>words[s]??Number(s),N='(?:a|an|one|two|three|four|five|six|[1-9][0-9]*)';
function payment(card,text,h){
 const tap=new RegExp('^Tap ('+N+') untapped (.+) you control$').exec(text);
 if(tap){const filter=h.target('target '+tap[2].replace(/\b(creatures|artifacts|enchantments|lands|permanents)\b/g,word=>word.slice(0,-1))+' you control');if(filter?.zone==='battlefield')return {kind:'tap',n:amount(tap[1]),filter};}
 const behold=new RegExp('^Behold ('+N+') ([A-Z][a-z]+)s$').exec(text);
 if(behold){const filter=h.target('target '+behold[2]+' card from your graveyard');if(filter)return {kind:'behold',n:amount(behold[1]),filter};}
 const opponent=/^An opponent gains ([1-9][0-9]*) life$/.exec(text);if(opponent)return {kind:'opponent-life',n:Number(opponent[1])};
 const variable=/^(Discard X cards|Sacrifice X Mountains|Exile X blue cards from your graveyard)$/.exec(text);
 if(variable){const kind=text.startsWith('Discard')?'discard':text.startsWith('Sacrifice')?'sacrifice':'exileGraveyard',object=kind==='sacrifice'?{kind:'permanent',types:['Land'],qualifier:{subtypes:['Mountain']}}:{kind:'card',...(kind==='exileGraveyard'?{qualifier:{colors:['U']}}:{})};return {kind:'additional',x:true,costs:[{id:'v23-variable',kind,quantity:{min:0,max:0,xV19:true},object}]};}
 if(text==='Pay 3 life, Discard a card at random')return {kind:'additional',costs:[{id:'v23-buyback-life',kind:'payLife',amount:{kind:'number',value:3}},{id:'v23-buyback-random',kind:'discard',quantity:{min:1,max:1},object:{kind:'card'},randomV18:true}]};
 const parsed=h.line(card,'As an additional cost to cast this spell, '+text[0].toLowerCase()+text.slice(1)+'.');
 if(parsed?.kind==='mechanic-additional-costs'&&parsed.costs?.length&&!parsed.announcesXV19&&!parsed.lifeX&&parsed.costs.every(cost=>['sacrifice','discard','payLife','returnPermanent','exileGraveyard','exileHand'].includes(cost.kind)))return {kind:'additional',costs:parsed.costs};
 return null;
}
export function modifierOperation(card,line,h){
 if(card.layout&&card.layout!=='normal'||! /\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return null;
 const dragon=/^As an additional cost to cast this spell, you may reveal a Dragon card from your hand( or choose a Dragon you control)?\.$/.exec(line);
 if(dragon)return {kind:'mechanic-dragon-reveal-v23',chooseControlled:!!dragon[1],contract:'mechanic-dragon-reveal-v23'};
 if(line==="If you revealed a Dragon card or controlled a Dragon as you cast this spell, this spell can't be countered.")return {kind:'mechanic-dragon-uncounterable-v23',contract:'mechanic-dragon-uncounterable-v23'};
 const shoal=/^You may exile a (white|blue|black|red|green) card with mana value X from your hand rather than pay this spell's mana cost\.$/.exec(line);
 if(shoal)return {kind:'mechanic-alternative-payment-v23',payment:{kind:'hand-exile-mv',n:1,color:({white:'W',blue:'U',black:'B',red:'R',green:'G'})[shoal[1]],x:true},mana:'{0}',label:line,contract:'mechanic-alternative-payment-v23'};
 if(line==="You may discard an Island card and another card rather than pay this spell's mana cost.")return {kind:'mechanic-alternative-payment-v23',payment:{kind:'additional',costs:[{id:'v23-foil-island',kind:'discard',quantity:{min:1,max:1},object:{kind:'card',qualifier:{subtypes:['Island']}}},{id:'v23-foil-other',kind:'discard',quantity:{min:1,max:1},object:{kind:'card'}}]},mana:'{0}',label:line,contract:'mechanic-alternative-payment-v23'};
 const variable=/^As an additional cost to cast this spell, (sacrifice X lands|return X Swamps you control to their owner's hand)\.$/.exec(line);
 if(variable)return {kind:'mechanic-additional-costs',announcesXV19:true,costs:[{id:'v23-additional-variable',kind:variable[1].startsWith('sacrifice')?'sacrifice':'returnPermanent',quantity:{min:0,max:0,xV19:true},object:{kind:'permanent',types:['Land'],...(variable[1].startsWith('return')?{qualifier:{subtypes:['Swamp']}}:{})}}],contract:'mechanic-additional-costs'};
 const splice=/^Splice onto (Arcane|instant or sorcery)—(.+)\.$/.exec(line);
 if(splice){const parsed=payment(card,splice[2],h);if(parsed&&!parsed.x)return {kind:'mechanic-splice-payment-v23',onto:splice[1],payment:parsed,label:line,contract:'mechanic-splice-payment-v23'};}
 const keyword=new RegExp('^(Flashback|Buyback)—(?:('+MANA+'), )?(.+)\\.$').exec(line);
 if(keyword){const parsed=payment(card,keyword[3],h);if(parsed&&(keyword[1]==='Flashback'||parsed.kind==='additional'&&!parsed.x))return {kind:'mechanic-'+keyword[1].toLowerCase()+'-payment-v23',mana:keyword[2]||'{0}',payment:parsed,label:line,contract:'mechanic-'+keyword[1].toLowerCase()+'-payment-v23'};}
 if(line==='Escalate—Discard a card.')return {kind:'mechanic-escalate-payment-v23',payment:{kind:'additional',costs:[{id:'v23-escalate',kind:'discard',quantity:{min:1,max:1},object:{kind:'card'}}]},contract:'mechanic-escalate-payment-v23'};
 const replicate=/^Replicate—Pay ((?:\{E\})+)\.$/.exec(line);if(replicate)return {kind:'mechanic-replicate-payment-v23',energy:replicate[1].length/3,contract:'mechanic-replicate-payment-v23'};
 return null;
}
export const extensionLine=modifierOperation;
export function extensionEffect(card,line,h){
 if(line==='Create a number of 1/1 black Vampire Knight creature tokens with lifelink equal to the highest life total among all players.'){
  const parsed=h.effect(card,'Create a 1/1 black Vampire Knight creature token with lifelink.');if(parsed?.effects?.length===1&&!parsed.targets?.length&&parsed.effects[0].action==='token-inline')return {...parsed,effects:[{...parsed.effects[0],n:{kind:'permanent-count-v20',test:'highest-life'}}]};
 }
 if(line==='Counter target spell if its mana value is X.')return {effects:[{action:'counter-x-payment-v23',target:0}],targets:[h.target('target spell')],optional:false};
 if(line==='Counter target spell unless its controller pays {1}. If you revealed a Dragon card or controlled a Dragon as you cast this spell, counter that spell instead.')return {effects:[{action:'dragon-counter-v23',target:0}],targets:[h.target('target spell')],optional:false};
 if(line===card.name+" deals 3 damage to target creature. If you revealed a Dragon card or controlled a Dragon as you cast this spell, "+card.name+" deals 3 damage to that creature's controller.")return {effects:[{action:'damage',target:0,n:3},{action:'dragon-bonus-v23',effects:[{action:'damage',target:{kind:'target-controller',index:0},n:3}]}],targets:[h.target('target creature')],optional:false};
 if(line==='Target player sacrifices a creature of their choice. If you revealed a Dragon card or controlled a Dragon as you cast this spell, you gain 4 life.'){
  return {targets:[h.target('target player')],effects:[{action:'choose-permanents',operation:'sacrifice',n:1,filter:h.target('target creature'),who:0},{action:'dragon-bonus-v23',effects:[{action:'gain-life',who:'you',n:4}]}],optional:false};
 }
 if(line===card.name+" deals 3 damage to target creature or planeswalker. If you revealed a Dragon card or chose a Dragon as you cast this spell, "+card.name+' deals damage equal to the power of that card or creature instead.')return {effects:[{action:'dragon-power-damage-v23',target:0,otherwise:3}],targets:[h.target('target creature or planeswalker')],optional:false};
 return null;
}
export function compileWholeCard(card,h){
 const text=h.stripReminderText(card.oracle_text||'').replace('a creature of their choice.','a creature.');
 if(card.layout!=='normal'||! /^Instant(?: — .+)?$/.test(card.type_line||'')||text!=='As an additional cost to cast this spell, you may reveal a Dragon card from your hand.\nTarget player sacrifices a creature. If you revealed a Dragon card or controlled a Dragon as you cast this spell, you gain 4 life.')return null;
 const implementation=[{kind:'mechanic-dragon-reveal-v23',chooseControlled:false,contract:'mechanic-dragon-reveal-v23'},{kind:'spell-generic',targets:[{what:'player',zone:'player',controller:'any',min:1}],effects:[{action:'choose-permanents',operation:'sacrifice',n:1,filter:{what:'creature',zone:'battlefield',controller:'any',min:1},who:0},{action:'dragon-bonus-v23',effects:[{action:'gain-life',who:'you',n:4}]}],optional:false,contract:'spell-generic-effect'}];
 return {semanticClass:'spell-template',implementedKeywords:[],implementation,oracleContracts:[...new Set(implementation.map(op=>op.contract))],rulesCore:text};
}
