// Results bind only to the preceding, fully parsed instruction in this ability.
// They cannot read an unrelated discard/mill or carry across modal boundaries.
const verbs={milled:'mill',discarded:'discard',exiled:'exile',sacrificed:'sacrifice'};
const scalar=new Set(['draw','gain-life','lose-life','damage','counter','token-key','token-inline']);
const passive=body=>body.replace(/^Prevent all (combat |noncombat )?damage (?:that )?(.+?) would deal this turn\.$/i,'Prevent all $1damage that would be dealt by $2 this turn.');
const shift=(node,n)=>Array.isArray(node)?node.map(x=>shift(x,n)):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,x])=>[key,['target','otherTarget','who','conditionTarget'].includes(key)&&typeof x==='number'?x+n:shift(x,n)])):node;
function filter(text,h){
 const phrase=text.trim().replace(/, nonland/g,' nonland').replace(/ cards$/,' card').replace(/^cards$/,'card');
 const parsed=h.target('target '+phrase+(/\bcard$/.test(phrase)?'':' card')+' from a graveyard');return parsed?{...parsed,...(/\bcard$/.test(phrase)?{nontoken:true}:{})}:null;
}
function family(effect){
 if(effect.action==='library-select-v8'||effect.action==='with-card-results-v8')return 'selected-hand';
 if(['mill','discard','discard-hand'].includes(effect.action))return effect.action==='discard-hand'?'discard':effect.action;
 if(effect.action==='exile'||effect.action==='exile-top'||effect.action==='zone-select'&&effect.destination==='exile'||effect.action==='battlefield-group'&&effect.operation==='exile')return 'exile';
 if(effect.action==='choose-permanents'&&effect.operation==='sacrifice')return 'sacrifice';
 return null;
}
export function extensionEffect(card,line,h){
 const handResult=/^(.+\.) If you (didn't put a card|put (?:an? )?(.+?) card) into your hand this way, (.+)$/.exec(line);
 if(handResult){
  const primary=h.effect(card,handResult[1]),body=h.effect(card,handResult[4]),quality=filter(handResult[3]||'card',h),effect=primary?.effects?.[0];
  // The selected set is explicit and belongs to this instruction. In particular,
  // drawing, returning an unrelated graveyard card, and putting the rest in hand
  // cannot supply this antecedent.
  const library=effect?.action==='library-select-v8'&&(effect.who??'you')==='you'&&!effect.until&&effect.selections.length===1&&effect.selections[0].destination==='hand'&&effect.rest?.destination!=='hand';
  const milled=effect?.action==='with-card-results-v8'&&effect.event==='mill'&&effect.effects.every(child=>child.action==='mill'&&child.who==='you')&&effect.clauses.length===1&&effect.clauses[0].action==='result-select-v8'&&!effect.clauses[0].elseEffects?.length;
  if(!primary||primary.optional||primary.v4Body||primary.effects.length!==1||!(library||milled)||!body||body.optional||body.v4Body||!quality)return null;
  const targets=[...(primary.targets||[])],effects=shift(body.effects,targets.length);targets.push(...(body.targets||[]));
  return {effects:[{action:'with-card-results-v8',event:'selected-hand',effects:primary.effects,clauses:[{action:'result-if-v8',filter:quality,effects:handResult[2].startsWith("didn't")?[]:effects,...(handResult[2].startsWith("didn't")?{elseEffects:effects}:{})}]}],targets};
 }
 const selection=/^(.+?)\. You may put (?:an? )?(.+?)(?: (?:from among (?:them|the milled cards)|(?:from among the cards )?milled this way)) into your hand\.(?: If you don't, (.+))?$/.exec(line);
 if(selection){
  if(/\bcards? (?:and\/or|and) (?:an? )?/.test(selection[2]))return null;
  const primary=h.effect(card,selection[1]+'.'),quality=filter(selection[2],h),otherwise=selection[3]?h.effect(card,selection[3]):null;
  if(!primary?.effects?.length||primary.optional||primary.v4Body||primary.effects.some(effect=>family(effect)!=='mill')||!quality||selection[3]&&(!otherwise||otherwise.optional||otherwise.v4Body))return null;
  const targets=[...(primary.targets||[])],elseEffects=otherwise?shift(otherwise.effects,targets.length):[];targets.push(...(otherwise?.targets||[]));
  return {effects:[{action:'with-card-results-v8',event:'mill',effects:primary.effects,clauses:[{action:'result-select-v8',filter:quality,destination:'hand',max:1,elseEffects}]}],targets};
 }
 const trailing=/^(.+?\. )(.+) for each (.+?) (milled|discarded|exiled|sacrificed) this way\.$/.exec(line);
 if(trailing&&!/this way/.test(trailing[1]))line=trailing[1]+'For each '+trailing[3]+' '+trailing[4]+' this way, '+trailing[2]+'.';
 const counterCount=/^(.+?\. )Put (?:X|a number of) (.+? counters on .+?)(?:, where X is| equal to) the number of (.+?) (milled|discarded|exiled|sacrificed) this way\.$/.exec(line);
 if(counterCount)line=counterCount[1]+'For each '+counterCount[3]+' '+counterCount[4]+' this way, Put one '+counterCount[2]+'.';
 const first=/\. (?=(?:For each|If (?:a |an |at least one |two )))/.exec(line);
 if(!first||!/(?:milled|discarded|exiled|sacrificed) this way/.test(line))return null;
 const primary=h.effect(card,line.slice(0,first.index+1));
 if(!primary?.effects?.length||primary.v4Body)return null;
 const observed=new Set(primary.effects.map(family).filter(Boolean));
 if(observed.size!==1||primary.effects.some(effect=>!family(effect)&&effect.action!=='draw'))return null;
 const event=[...observed][0],clauses=[],targets=[...(primary.targets||[])];
 const chunks=line.slice(first.index+2).split(/ (?=(?:For each|If (?:a |an |at least one |two )))/);
 for(const chunk of chunks){
  const repeated=/^For each (.+?) (milled|discarded|exiled|sacrificed) this way, (.+)$/.exec(chunk);
  const condition=/^If (?:a|an|at least one) (.+?) (?:is|was) (milled|discarded|exiled|sacrificed) this way, (.+)$/.exec(chunk);
  const shared=/^If two (.+?) that share (a color|a card type|all their card types) (?:are|were) (milled|discarded|exiled|sacrificed) this way, (.+)$/.exec(chunk);
  const shareMatch=shared&&[shared[0],shared[1],shared[3],shared[4]];
  const match=repeated||condition||shareMatch;if(!match||verbs[match[2]]!==event)return null;
  const quality=filter(match[1],h);if(!quality)return null;
  const branches=match[3].split('. Otherwise, ');if(branches.length>2||primary.optional&&branches.length>1)return null;
  const parse=text=>h.effect(card,passive(text.endsWith('.')?text:text+'.'));
  const yes=parse(branches[0]),no=branches[1]&&parse(branches[1]);
  if(!yes||yes.optional||yes.v4Body||branches[1]&&(!no||no.optional||no.v4Body))return null;
  const append=body=>{const values=shift(body.effects,targets.length);targets.push(...body.targets);return values;};
  const effects=append(yes),elseEffects=no?append(no):undefined;
  if(repeated&&(effects.length!==1||!scalar.has(effects[0].action)||!Number.isSafeInteger(effects[0].n)||effects[0].n<0))return null;
  clauses.push({action:repeated?'result-scaled-v8':'result-if-v8',filter:quality,...(shared?{shared:shared[2]}:{}),effects,...(elseEffects?{elseEffects}:{})});
 }
 return {effects:[{action:'with-card-results-v8',event,effects:primary.effects,clauses}],targets,optional:!!primary.optional};
}
