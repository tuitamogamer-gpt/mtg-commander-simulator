// Pregame disclosures create real delayed triggers with the original controller.
const complete=body=>body&&!body.v4Body&&Array.isArray(body.targets)&&Array.isArray(body.effects)&&body.effects.length>0;
export function extensionLine(card,line,h){
 const prefix='You may reveal this card from your opening hand. If you do, ';
 if(!line.startsWith(prefix))return null;
 const text=line.slice(prefix.length);
 const before=/^at the beginning of (the first upkeep|your first upkeep|your first main phase of the game), (.+)$/.exec(text);
 const after=/^(.+?) at the beginning of your first upkeep\.$/.exec(text);
 const firstCast=/^when each opponent casts their first spell of the game, (.+)$/.exec(text);
 const sentence=before?.[2]||after?.[1]&&after[1]+'.'||firstCast?.[1];
 if(!sentence)return null;
 const body=h.effect(card,sentence[0].toUpperCase()+sentence.slice(1));
 if(!complete(body)||body.targets.length)return null;
 const timing=firstCast?'opponents-first-cast':after?'own-first-upkeep':before[1]==='the first upkeep'?'first-upkeep':before[1]==='your first upkeep'?'own-first-upkeep':'own-first-main';
 return {kind:firstCast?'generic-trigger':'opening-reveal-v23',...(firstCast?{event:'cast',eventFilter:'opponent-cast',openingRevealV23:true}:{}),timing,...body,contract:'opening-reveal-v23'};
}
export function extensionEffect(card,line,h){
 const counter=/^Counter (?:it|that spell) unless that player pays ((?:\{[0-9WUBRGC]+\})+)\.$/.exec(line);
 if(counter)return h.effect(card,'Counter that spell unless its controller pays '+counter[1]+'.');
 if(line==='Look at the top four cards of your library. You may put one of those cards back on top of your library. Exile the rest.')return {targets:[],effects:[{action:'opening-look-v23',n:4}],optional:false};
 return null;
}
export function extensionCondition(text){
 if(text==='there is an instant card and a sorcery card in your graveyard')return {kind:'all',conditions:['instant','sorcery'].map(what=>({kind:'count-comparison',count:{kind:'count',zone:'graveyard',what:'card',controller:'you',filters:[{what,zone:'graveyard',controller:'you',min:1}]},min:1}))};
 if(/^(?:this spell|it) was cast from (?:a|your) graveyard$/.test(text))return {kind:'cast-origin-v23',from:'graveyard'};
 if(/^you didn't cast it from your hand$/.test(text))return {kind:'not',condition:{kind:'cast-by-controller-v23',from:'hand'}};
 return null;
}
export function compileWholeCard(card,h){
 if(card.layout!=='normal'||! /^(?:Instant|Sorcery)(?: — .+)?$/.test(card.type_line||''))return null;
 const lines=h.stripReminderText(card.oracle_text||'').split('\n'),opening=lines.filter(line=>line.startsWith('You may reveal this card from your opening hand. If you do, '));
 if(!opening.length&&lines.some(line=>line.includes('If this spell was cast from a graveyard,'))){
  const rules=lines.filter(line=>/^Flashback /.test(line)),text=lines.filter(line=>!rules.includes(line)).join(' ');
  let ordinary,graveyard,doubleMill=false;
  const search=/^(Search your library for a card and put that card into your hand\.) If this spell was cast from a graveyard, instead (search your library for two cards and put those cards into your hand)\. (?:Then )?[Ss]huffle\.$/.exec(text);
  if(search){ordinary='Search your library for a card, put it into your hand, then shuffle.';graveyard='Search your library for two cards, put them into your hand, then shuffle.';}
  const mill=/^(Target player mills X cards\.) If this spell was cast from a graveyard, that player mills twice that many cards instead\.$/.exec(text);
  if(mill){ordinary=graveyard=mill[1];doubleMill=true;}
  const destination=/^(Search your library for a (.+?) card, reveal it, and put it into your hand\.) If this spell was cast from a graveyard, put that card onto the battlefield instead\. (?:Then )?[Ss]huffle\.$/.exec(text);
  if(destination){ordinary='Search your library for a '+destination[2]+' card, reveal it, put it into your hand, then shuffle.';graveyard='Search your library for a '+destination[2]+' card, reveal it, put it onto the battlefield, then shuffle.';}
  const tokens=/^Create (two tapped [0-9]+\/[0-9]+ .+? creature tokens)\. If this spell was cast from a graveyard, instead create X of those tokens, where X is (.+)\.$/.exec(text);
  if(tokens){ordinary='Create '+tokens[1]+'.';graveyard='Create X'+tokens[1].slice(3)+', where X is '+tokens[2]+'.';}
  if(!ordinary||!graveyard)return null;
  const compile=body=>h.compileCurrent({...card,oracle_text:[...rules,body].join('\n')}),a=compile(ordinary),b=compile(graveyard);
  if(!a.semanticClass||!b.semanticClass)return null;
  const split=value=>({implementation:value.implementation.filter(op=>/^spell-/.test(op.kind)),modifiers:value.implementation.filter(op=>!/^spell-/.test(op.kind))}),ordinaryBody=split(a),graveBody=split(b);
  if(!ordinaryBody.implementation.length||!graveBody.implementation.length||JSON.stringify(ordinaryBody.modifiers)!==JSON.stringify(graveBody.modifiers))return null;
  if(doubleMill){const op=graveBody.implementation[0];if(graveBody.implementation.length!==1||op.kind!=='spell-v4'||op.targets.length!==1||op.targets[0].kind!=='player'||op.effects.length!==1||op.effects[0].kind!=='mill'||op.effects[0].amount.kind!=='variable'||op.effects[0].amount.name!=='X')return null;graveBody.implementation=[{kind:'spell-generic',targets:[{what:'player',zone:'player',controller:'any',min:1}],effects:[{action:'mill',who:0,n:{kind:'product-v16',left:'X',right:2}}],optional:false,contract:'spell-generic-effect'}];}
  const operation={kind:'spell-origin-branches-v23',ordinary:{implementation:ordinaryBody.implementation},graveyard:{implementation:graveBody.implementation},contract:'spell-origin-branches-v23'};
  return {semanticClass:'spell-template',implementedKeywords:[],implementation:[...ordinaryBody.modifiers,operation],oracleContracts:[...new Set([...ordinaryBody.modifiers.map(op=>op.contract),operation.contract])]};
 }
 if(opening.length!==1)return null;
 const base=h.compileCurrent({...card,oracle_text:lines.filter(line=>line!==opening[0]).join('\n')});
 const disclosure=h.compileCurrent({...card,type_line:'Creature',power:'0',toughness:'1',oracle_text:opening[0]});
 if(!base.semanticClass||!disclosure.semanticClass||disclosure.implementation.length!==1||disclosure.implementation[0].kind!=='opening-reveal-v23')return null;
 return {...base,implementation:[...disclosure.implementation,...base.implementation],oracleContracts:[...new Set([...disclosure.oracleContracts,...base.oracleContracts])]};
}
