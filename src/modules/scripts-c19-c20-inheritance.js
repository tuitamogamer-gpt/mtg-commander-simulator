'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,SC=M.SCRIPTS,C=M.C1920,G=M.Game.prototype;
 const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'},protectionCache=new WeakMap();
 function protections(def){
  if(protectionCache.has(def))return protectionCache.get(def);const tests=[];
  for(const line of (def.oracle||'').split('\n')){
   // Only an intrinsic keyword line can supply protection in a graveyard or
   // exile. Triggered grants and choices with no value outside play cannot.
   const clean=line.replace(/\s*\([^)]*\)/g,'').trim().toLowerCase();
   if(!/^(?:[\w -]+, )*protection from /.test(clean)||/[.:]/.test(clean))continue;
   for(const match of clean.matchAll(/protection from (.*?)(?=, (?:flying|first strike|double strike|deathtouch|haste|hexproof|indestructible|lifelink|menace|reach|trample|vigilance|protection)|$)/g)){
    for(const quality of match[1].split(/,? and (?:from )?|, (?:from )?/)){
     if(colors[quality])tests.push((g,s)=>s.colors?.includes(colors[quality]));
     else if(quality==='everything')tests.push((g,s)=>!!s);
     else if(quality==='all colors'||quality==='all five colors'||quality==='all colored spells')tests.push((g,s)=>s.colors?.length>0&&(quality!=='all colored spells'||s.zone==='stack'));
     else if(quality==='multicolored')tests.push((g,s)=>s.colors?.length>1);
     else if(quality==='monocolored')tests.push((g,s)=>s.colors?.length===1);
     else if(quality==='colorless')tests.push((g,s)=>s.colors?.length===0);
     else if(['artifacts','creatures','enchantments','lands','planeswalkers','instants','sorceries'].includes(quality)){const type=quality==='sorceries'?'Sorcery':quality[0].toUpperCase()+quality.slice(1,-1);tests.push((g,s)=>s.is?.(type));}
     else{const type=[...M.CREATURE_SUBTYPES].find(t=>t.toLowerCase()===quality||t.toLowerCase()+'s'===quality);if(type)tests.push((g,s)=>s.hasSub?.(type));}
    }
   }
  }protectionCache.set(def,tests);return tests;
 }
 function inherit(g,c,cards,keywords){for(const k of keywords)if(cards.some(x=>C.keyword(x,k)))c.cur.kw.add(k);for(const x of cards)c.cur.protectionFrom.push(...protections(x.def));}
 const walks=['forestwalk','islandwalk','swampwalk','mountainwalk','plainswalk','nonbasic landwalk','legendary landwalk'];
 SC['Cairn Wanderer']={changeling:true,statics:[{apply:(g,c)=>inherit(g,c,g.players.flatMap(p=>p.graveyard).filter(c=>c.is('Creature')),['flying','fear','first strike','double strike','deathtouch','haste','lifelink','reach','trample','shroud','vigilance',...walks])}]};
 SC['Rayami, First of the Fallen']={c1920Rayami:true,statics:[{apply:(g,c)=>inherit(g,c,g.players.flatMap(p=>p.exile).filter(c=>!c.faceDown&&c.is('Creature')&&c.counters.blood>0),C.keywords)}]};
 const canBlock=G.canBlock;G.canBlock=function(b,a){const defender=a.attacking instanceof M.Player?a.attacking:a.attacking?.ctrl;if(defender&&(a.kw('nonbasic landwalk')&&this.lands(defender).some(c=>!c.def.super.includes('Basic'))||a.kw('legendary landwalk')&&this.lands(defender).some(c=>c.def.super.includes('Legendary'))))return false;return canBlock.call(this,b,a);};
 const copies=new WeakMap();
 function borrowed(a){if(!copies.has(a))copies.set(a,{...a,c1920Borrowed:true});return copies.get(a);}
 SC['Manascape Refractor']={entersTapped:true,c1920Manascape:true,statics:[{phase:5,apply:(g,c,bf)=>{
  const abilities=new Set(),mana=new Set();
  for(const land of bf.filter(x=>x.is('Land'))){
   for(const a of (land.cur.abilitiesDisabled?[]:land.def.abilities||[]).concat(land.cur.extraAbilities||[]))if(!a.c1920Borrowed)abilities.add(a);
   for(const a of (land.cur.abilitiesDisabled?[]:[land.def.mana].flat().filter(Boolean)).concat(land.cur.extraMana||[]))if(!a.c1920Borrowed)mana.add(a);
   for(const source of bf)if(C.live(source)&&source.def.grantMana&&source.def.grantMana.filter(g,land,source)&&!(land.cur.oracleAbilityLossTimestamp>source.timestamp))mana.add(source.def.grantMana);
  }
  c.cur.extraAbilities.push(...[...abilities].map(borrowed));c.cur.extraMana.push(...[...mana].map(borrowed));
 }}]};
 const cost=G.abilityManaCost;G.abilityManaCost=function(p,c,raw,context){const value=cost.call(this,p,c,raw,context);if(c?.def.c1920Manascape&&C.live(c))value.pips=value.pips.map(pip=>pip.some(k=>'WUBRG'.includes(k))?['C','W','U','B','R','G',...pip.filter(k=>k==='PHY'||k==='TWO')]:pip);return value;};
 C.intrinsicProtection=protections;
})();
