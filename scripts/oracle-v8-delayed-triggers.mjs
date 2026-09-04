function paragraphs(text){let depth=0,clean='';for(const c of text||''){if(c==='(')depth++;else if(c===')'&&depth)depth--;else if(!depth)clean+=c;}return clean.split('\n').map(line=>line.trim());}
export function extensionEffect(card,line,h){
 const prefix=line.slice(0,line.indexOf(',')+1).toLowerCase();
 if(prefix)for(const paragraph of paragraphs(card.oracle_text)){const index=paragraph.toLowerCase().indexOf(prefix);if(index<0)continue;const declared=paragraph.slice(index);if(line.toLowerCase().startsWith(declared.toLowerCase()+' '))return null;}

 let body,once=false;
 const until=/^Until end of turn, (whenever .+)$/i.exec(line);
 const during=/^(Whenever .+?) this turn, (.+)$/.exec(line);
 const next=/^When you next (.+?) this turn, (.+)$/.exec(line);
 if(until)body=until[1][0].toUpperCase()+until[1].slice(1);
 else if(during)body=during[1]+', '+during[2];
 else if(next){body='Whenever you '+next[1]+', '+next[2];once=true;}
 else return null;
 const trigger=h.line(card,body);
 if(trigger?.kind!=='generic-trigger'||trigger.zone||trigger.oncePerBatch||trigger.modalBody||trigger.v4Body||trigger.onceEachTurn||!trigger.effects?.length)return null;
 const encoded=JSON.stringify(trigger);
 // A retained source's own characteristics and linked targets require another
 // binding scope. Do not approximate them with the future event's source.
 if(/"(?:self|self-card|self-combat|attached-host|source-stat|source-counters|source-status|source-controlled|linked-exile-count|X)"/.test(encoded)||encoded.includes('"excludeSelf":true')||encoded.includes('"another":true')||encoded.includes('"action":"install-trigger-v8"'))return null;
 if(typeof trigger.event!=='string'||trigger.eventFilter?.kind==='v8-event'&&trigger.eventFilter.perDefender)return null;
 return{targets:[],effects:[{action:'install-trigger-v8',trigger,once,duration:'eot'}]};
}
