// One-or-more instructions share the engine's simultaneous-event boundary.
// Bodies with a singular event reference remain deferred: a batch has no
// arbitrarily chosen "that creature" for a following instruction to inspect.
export function extensionLine(card,line,h){
 const once=line.endsWith(' This ability triggers only once each turn.');
 const text=(once?line.slice(0,-' This ability triggers only once each turn.'.length):line).replace(' are put into a graveyard from the battlefield,',' die,').replace(/\band\/or\b/g,'or');
 const discard=/^Whenever (you discard|an opponent discards|a player discards) one or more (.+?), (.+)$/.exec(text);
 const sacrifice=/^Whenever you sacrifice one or more (other )?(.+?), (.+)$/.exec(text);
 const created=/^Whenever you create one or more (creature )?tokens(?: for the first time each turn)?, (.+)$/.exec(text);
 if(discard||sacrifice||created){
  const match=discard||sacrifice||created,body=h.effect(card,match[discard||sacrifice?3:2]);if(!body||/event-card|event-player/.test(JSON.stringify(body)))return null;
  const singular=phrase=>phrase.replace(/\bcards\b/g,'card').replace(/\bcreatures\b/g,'creature').replace(/\btokens\b/g,'token').replace(/\bartifacts\b/g,'artifact').replace(/\bpermanents\b/g,'permanent').replace(/^token\b/,'permanent token');
  const target=created?null:h.target('target '+singular(match[2])+(discard?' from a graveyard':''));
  if(!created&&(!target||target.zone!==(discard?'graveyard':'battlefield')))return null;
  const eventFilter=discard?{kind:'batch-discard-v8',target,controller:discard[1]==='you discard'?'you':discard[1]==='an opponent discards'?'opponent':'any'}:sacrifice?{kind:'filtered-sacrifice',target,another:!!sacrifice[1]}:{kind:'created-batch-v8',creature:!!created[1]};
  return {kind:'generic-trigger',event:discard?'discarded':sacrifice?'sacrificed':'tokensCreated',eventFilter,...body,oncePerBatch:true,...(once||created?.[0].includes('for the first time')?{onceEachTurn:true,onceGroup:line}:{}),contract:'generic-trigger-effect'};
 }
 const match=/^Whenever one or more (other )?(.+?) (enter|die|leave the battlefield)( during your turn)?, (.+)$/.exec(text);
 if(!match)return null;
 const phrase=match[2].replace(/\bcreatures\b/g,'creature').replace(/\bartifacts\b/g,'artifact').replace(/\benchantments\b/g,'enchantment').replace(/\bpermanents\b/g,'permanent').replace(/\btokens\b/g,'token').replace(/^token\b/,'permanent token').replace(/\byour opponents control\b/g,'an opponent controls');
 const target=h.target('target '+phrase),body=target&&h.effect(card,match[5]);
 if(target?.zone!=='battlefield'||!body||/event-card|event-player/.test(JSON.stringify(body)))return null;
 return {kind:'generic-trigger',event:{enter:'etb',die:'dies','leave the battlefield':'lto'}[match[3]],eventFilter:{kind:'filtered-object',target,another:!!match[1]},...body,oncePerBatch:true,...(once?{onceEachTurn:true,onceGroup:line}:{}),...(match[4]?{condition:{kind:'your-turn'}}:{}),contract:'generic-trigger-effect'};
}
