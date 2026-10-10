'use strict';
((M)=>{
 const COLORS=['W','U','B','R','G'],own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
 const problem=(code,message,card)=>({code,message,...(card?{card}:{})});
 const colorList=value=>String(value).toUpperCase().match(/[WUBRG]/g)||[];
 const aliases={count:'notedCount',player:'notedPlayer',guessed:'guessedCorrect'};
 const listFields=new Set(['names','types','keywords','removed','exiled','exiledCards']),numberFields=new Set(['number','notedCount','notedPlayer']),booleanFields=new Set(['guessedCorrect']);
 function configCopy(config){return JSON.parse(JSON.stringify(config));}
 M.copyAuxiliaryDeckV87=configCopy;
 const parse=M.parseDeckText;M.parseDeckText=function(text){
  const main=[],config={attractions:[],stickers:[],outsideGame:[],companion:null,draft:{},colors:{}},errors=[];let section='main';
  for(const [lineNo,raw]of String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).entries()){
   const line=raw.trim();if(!line||/^(#|\/\/)/.test(line)){if(section==='main')main.push(raw);continue;}
   const header=/^(Attractions?|Sticker sheets?|Stickers?|Outside game|Sideboard|Companion|Draft notes|Commander[s]?|Deck|Mainboard|Main|Considering|Maybeboard|Tokens?)\s*:?\s*$/i.exec(line);
   if(header){const h=header[1].toLowerCase();section=h.startsWith('attraction')?'attractions':h.startsWith('sticker')?'stickers':['outside game','sideboard'].includes(h)?'outsideGame':h==='companion'?'companion':h==='draft notes'?'draft':'main';if(section==='main')main.push(raw);continue;}
   if(section==='draft'){
    const [name,...notes]=line.split('|').map(x=>x.trim()),row={};for(const note of notes){const m=/^([a-z][a-zA-Z]*)\s*=\s*(.+)$/.exec(note);if(!m){errors.push(problem('draft-note','Invalid draft note on line '+(lineNo+1)+'. Use Card name | count=4.',name));continue;}const key=aliases[m[1]]||m[1],value=m[2].trim();if(listFields.has(key))row[key]=value.split(';').map(x=>x.trim()).filter(Boolean);else if(key==='colors')row[key]=colorList(value);else if(key==='numbers')row[key]=value.split(/[;,]/).map(Number);else if(numberFields.has(key))row[key]=Number(value)-(m[1]==='player'?1:0);else if(booleanFields.has(key))row[key]=value==='true';else errors.push(problem('draft-field','Unknown draft note '+m[1]+'.',name));}config.draft[name]=row;continue;
   }
   const annotation=/\s*\[colors\s*[:=]\s*([WUBRG,\s]+)\]\s*$/i.exec(line),without=annotation?line.slice(0,annotation.index):line,one=parse('Deck\n'+without).cards[0];
   if(annotation&&one)config.colors[one.name]=colorList(annotation[1]);
   if(section==='main'){main.push(without);continue;}
   if(!one){errors.push(problem('auxiliary-card','Invalid auxiliary card on line '+(lineNo+1)+'.'));continue;}
   if(section==='companion'){if(config.companion||one.n!==1)errors.push(problem('companion-count','Choose exactly one companion.'));config.companion=one.name;}else for(let n=0;n<one.n;n++)config[section].push(one.name);
  }
  const result=parse(main.join('\n'));result.auxiliaryV87=config;result.auxiliaryErrorsV87=errors;return result;
 };
 function validateConfig(config,deck,defs){
  const errors=[],clean={attractions:[],stickers:[],outsideGame:[],companion:null,draft:{},colors:{}};
  if(!plain(config)){errors.push(problem('auxiliary-format','Auxiliary deck configuration must be an object.'));return {errors,config:clean};}
  if(JSON.stringify(config).length>60000){errors.push(problem('auxiliary-size','Auxiliary deck configuration is too large.'));return {errors,config:clean};}
  const names=new Set((deck.cards||[]).map(r=>r.name));
  for(const field of ['attractions','stickers','outsideGame']){
   const rows=config[field]||[];if(!Array.isArray(rows)||rows.length>500||rows.some(x=>typeof x!=='string')){errors.push(problem('auxiliary-list',field+' must be a list of card names.'));continue;}
   for(const raw of rows){const name=M.resolveDeckCardName(raw)||raw,def=defs[name];if(!def){errors.push(problem('auxiliary-unknown',raw+' is not available in the engine catalog.',raw));continue;}if(field==='attractions'&&!def.attractionLightsV87||field==='stickers'&&!def.stickerSheetV87||field==='outsideGame'&&(def.attractionLightsV87||def.stickerSheetV87)){errors.push(problem('auxiliary-type',name+' does not belong in '+field+'.',name));continue;}clean[field].push(name);}
   if(field!=='outsideGame'&&rows.length&&(rows.length<10||new Set(clean[field]).size!==clean[field].length))errors.push(problem('auxiliary-deck',field==='attractions'?'An Attraction deck needs at least ten different names.':'Bring at least ten different sticker sheets; three will be selected at random.'));
  }
  if(config.companion){const name=M.resolveDeckCardName(config.companion)||config.companion,validator=M.OracleV87.companionValidators.get(name);if(!defs[name]||!validator)errors.push(problem('companion-unsupported',name+' is not an available companion.',name));else if(names.has(name))errors.push(problem('companion-main','A companion must be outside the starting deck.',name));else if(!validator(deck,defs))errors.push(problem('companion-condition',name+"'s companion condition is not satisfied by the starting deck.",name));else clean.companion=name;}
  if(config.colors!==undefined&&!plain(config.colors))errors.push(problem('chosen-colors','Chosen colors must be recorded by card name.'));
  for(const [raw,colors]of Object.entries(plain(config.colors)?config.colors:{})){const name=M.resolveDeckCardName(raw)||raw;if(!names.has(name)||!Array.isArray(colors)||colors.some(c=>!COLORS.includes(c))||new Set(colors).size!==colors.length)errors.push(problem('chosen-colors','Invalid chosen colors for '+name+'.',name));else clean.colors[name]=colors.slice();}
  for(const name of names){const n=name==='Cryptic Spires'?2:(deck.commanders||[]).includes(name)&&['The Prismatic Piper','Faceless One'].includes(name)?1:0;if(n&&(clean.colors[name]||[]).length!==n)errors.push(problem('chosen-colors',name+' needs '+n+' chosen color'+(n===1?'':'s')+'; append [colors='+ (n===1?'U':'W,U')+'] to its card line.',name));if(defs[name]?.stickerSheetV87||defs[name]?.attractionLightsV87)errors.push(problem('auxiliary-main',name+' belongs in its supplementary deck section.',name));}
  if(config.draft!==undefined&&!plain(config.draft))errors.push(problem('draft-format','Draft notes must be recorded by card name.'));
  for(const [raw,row]of Object.entries(plain(config.draft)?config.draft:{})){
   if(['palianoColors','automatonCounts','trackerPlayers'].includes(raw)){const allowed=raw==='palianoColors'?row.every?.(x=>COLORS.includes(x)):row.every?.(x=>Number.isSafeInteger(x)&&x>=0);if(!Array.isArray(row)||!allowed)errors.push(problem('draft-format','Invalid '+raw+' notes.'));else clean.draft[raw]=row.slice();continue;}
   const name=M.resolveDeckCardName(raw)||raw;if(!names.has(name)||!plain(row)){errors.push(problem('draft-card','Draft notes must name a card in the starting deck.',name));continue;}const record={};
   for(const [key,value]of Object.entries(row)){if(listFields.has(key)){if(!Array.isArray(value)||value.length>100||value.some(x=>typeof x!=='string'||!x.trim()||x.length>160)){errors.push(problem('draft-note','Invalid '+key+' list for '+name+'.',name));continue;}record[key]=value.map(x=>key==='keywords'?x:M.resolveDeckCardName(x)||x);if(['names','removed','exiled','exiledCards'].includes(key)&&record[key].some(x=>!defs[x]))errors.push(problem('draft-note','Unknown card in '+name+' '+key+' notes.',name));}
    else if(numberFields.has(key)){if(!Number.isSafeInteger(value)||value<0||value>1000||key==='notedPlayer'&&value>3)errors.push(problem('draft-note','Invalid '+key+' for '+name+'.',name));else record[key]=value;}
    else if(key==='colors'){if(!Array.isArray(value)||value.length!==3||new Set(value).size!==3||value.some(c=>!COLORS.includes(c)))errors.push(problem('draft-colors',name+' requires three different colors.',name));else record.colors=value.slice();}
    else if(key==='numbers'){if(!Array.isArray(value)||value.some(n=>!Number.isSafeInteger(n)||n<0||n>1000))errors.push(problem('draft-note','Invalid drafted numbers.',name));else record.numbers=value.slice();}
    else if(booleanFields.has(key)){if(typeof value!=='boolean')errors.push(problem('draft-note','Invalid '+key+' for '+name+'.',name));else record[key]=value;}
    else errors.push(problem('draft-field','Unknown draft field '+key+'.',name));
   }
   if(record.exiled){const required=name==='Caller of the Untamed'?1:name==='Volatile Chimera'?3:0;if(required&&((name==='Caller of the Untamed'&&record.exiled.length!==1)||record.exiled.length<required||record.exiled.some(n=>!defs[n]?.types.includes('Creature')||names.has(n))))errors.push(problem('draft-exile',name+' requires '+(required===1?'one':'at least three')+' creature cards outside the starting deck.',name));}
   if(record.exiledCards&&record.exiledCards.some(n=>!defs[n]?.types.some(t=>['Instant','Sorcery'].includes(t))||names.has(n)))errors.push(problem('draft-savant','Arcane Savant notes require instant or sorcery cards outside the starting deck.',name));
   if(record.removed?.length&&names.has(name)&&record.removed.some(n=>names.has(n)))errors.push(problem('draft-removed','Cards removed during the draft cannot be in the starting deck.',name));clean.draft[name]=record;
  }
  return {errors,config:clean};
 }
 M.OracleV87.validateAuxiliary=validateConfig;
 const validate=M.validateImportedDeck;M.validateImportedDeck=function(parsed,options){
  const raw=parsed?.auxiliaryV87||{},chosen=plain(raw.colors)?raw.colors:{},original=M.DEFS;let defs=original;for(const [name,colors]of Object.entries(chosen))if(defs[name]&&Array.isArray(colors)&&['Cryptic Spires','The Prismatic Piper','Faceless One'].includes(name)){if(defs===original)defs={...original};defs[name]={...defs[name],colorIdentityExtra:colors};}
  M.DEFS=defs;let result;try{result=validate.call(this,parsed,options);}finally{M.DEFS=original;}
  const aux=validateConfig(raw,result.draftDeck,defs),identity=result.summary.colorIdentity;
  if(aux.config.companion&&M.cardColorIdentity(defs[aux.config.companion]).some(c=>!identity.includes(c)))aux.errors.push(problem('companion-color','The companion is outside the commanders’ color identity.',aux.config.companion));
  result.errors.push(...(parsed?.auxiliaryErrorsV87||[]),...aux.errors);result.ok=result.errors.length===0;result.draftDeck.auxiliaryV87=aux.config;result.deck=result.ok?result.draftDeck:null;result.summary.attractions=aux.config.attractions.length;result.summary.stickerSheets=aux.config.stickers.length;result.summary.companion=aux.config.companion;return result;
 };
 // Outside-game cards are owned physical objects, separate from exile. Draft
 // exile choices are likewise represented by actual cards, with zone locks.
 const G=M.Game.prototype,initialize=G.initializeAuxiliaryV87;G.initializeAuxiliaryV87=function(p,config,defs,...args){initialize.call(this,p,config,defs,...args);const draft=configCopy(config.draft||{});p.oracleDraftV87=draft;
  const make=(name,zone,source,field,index)=>{const c=new M.CardInst(defs[name],p);c.zone=zone;c.meta.draftExileV87={source,field,index};if(zone==='exile')p.exile.push(c);else p.outsideGameV87.push(c);return c;};
  for(const [source,row]of Object.entries(draft))if(plain(row)){if(row.exiled)row.exiled=row.exiled.map((n,index)=>typeof n==='string'?make(n,'outside-game',source,'exiled',index):n);if(row.exiledCards)row.exiledCards=row.exiledCards.map((n,index)=>typeof n==='string'?make(n,'exile',source,'exiledCards',index):n);}
  for(const c of [...p.library,...p.command])if(draft[c.def.name])c.meta.draftV87=draft[c.def.name];
 };
 G.outsideCardsV87=function(p){return (p.outsideGameV87||[]).filter(c=>c.zone==='outside-game'&&c.owner===p);};
M.OracleV87.captureDraft=function capture(value,seen=new Set()){if(value instanceof M.CardInst)return {cardIidV87:value.iid};if(value instanceof M.Player)return {playerIdxV87:value.idx};if(value===null||['number','string','boolean'].includes(typeof value))return value;if(!value||typeof value!=='object'||seen.has(value))return undefined;seen.add(value);const out=Array.isArray(value)?value.map(v=>capture(v,seen)):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,capture(v,seen)]).filter(([,v])=>v!==undefined));seen.delete(value);return out;};
M.OracleV87.restoreDraftReferences=(g,p)=>{function restore(value){if(!value||typeof value!=='object')return value;if(own(value,'cardIidV87'))return g.byIid(value.cardIidV87)||null;if(own(value,'playerIdxV87'))return g.players[value.playerIdxV87]||null;if(Array.isArray(value))return value.map(restore);return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,restore(v)]));}p.oracleDraftV87=restore(p.oracleDraftV87||{});for(const [name,row]of Object.entries(p.oracleDraftV87))if(plain(row))for(const field of ['exiled','exiledCards'])if(row[field])row[field]=row[field].map((n,index)=>typeof n==='string'?p.exile.concat(p.outsideGameV87).find(c=>c.meta.draftExileV87?.source===name&&c.meta.draftExileV87.field===field&&c.meta.draftExileV87.index===index):n).filter(Boolean);for(const c of g.battlefield.concat(p.library,p.hand,p.command,p.graveyard,p.exile))if(c.owner===p){if(c.meta.draftV87)c.meta.draftV87=restore(c.meta.draftV87);else if(p.oracleDraftV87[c.def.name])c.meta.draftV87=p.oracleDraftV87[c.def.name];}};
})(MTG);
