'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.C1719;
 const armorFor=(g,c,bf=g.bf())=>bf.filter(a=>a.attachedTo===c.iid&&!a.cur.abilitiesDisabled&&(a.def.umbraArmor||a.hasSub('Aura')&&bf.some(s=>s.ctrl===c.ctrl&&C.live(s)&&s.def.cwwUmbraMystic)));
 // Choose all replacements against the pre-destruction battlefield. An Aura
 // being destroyed simultaneously still protects its host (CR 702.89).
 async function planDestruction(g,cards,opts={}){
  const bf=g.bf(),doomed=new Set(),actions=[],reserved=new Map();
  const available=(c,kind)=>Math.max(0,(kind==='shield'?c.counters.shield||0:c.regenShield||0)-(reserved.get(c)?.[kind]||0));
  async function replace(c,used=new Set()){
   if(!bf.includes(c)||c.kw('indestructible')&&!opts.ignoreIndestructible)return;
   const options=armorFor(g,c,bf).filter(a=>!used.has(a)).map(a=>({key:'armor:'+a.iid,label:'Umbra armor — '+a.name,aura:a}));
   if(!opts.noShield&&!opts.ignoreIndestructible&&available(c,'shield'))options.push({key:'shield',label:'Remove a shield counter'});
   if(!opts.noRegen&&available(c,'regen'))options.push({key:'regen',label:'Regenerate '+c.name});
   if(!options.length){doomed.add(c);return;}
   const key=options.length===1?options[0].key:await c.ctrl.controller.decide(g,{type:'chooseOption',player:c.ctrl,prompt:c.name+': choose a destruction replacement',options,aiHint:{kind:'replacement'}});
   const selected=options.find(o=>o.key===key);if(!selected)throw Error('Invalid destruction replacement');
   if(selected.aura){actions.push({kind:'armor',card:c});await replace(selected.aura,new Set([...used,selected.aura]));}
   else{const r=reserved.get(c)||{};r[key]=(r[key]||0)+1;reserved.set(c,r);actions.push({kind:key,card:c});}
  }
  for(const c of [...new Set(cards)])await replace(c);
  return {doomed:[...doomed],actions};
 }
 async function applyDestructionPreventions(g,actions){for(const {kind,card:c}of actions){
  if(kind==='shield'){g.removeCounters(c,'shield',1);await g.emit('shieldRemoved',{card:c});}
  else{c.damage=0;c.deathtouched=false;if(kind==='regen'){c.regenShield=Math.max(0,c.regenShield-1);c.tapped=true;if(g.combat)g.removeFromCombat(c);}}
 }}
 Object.assign(C,{hasArmor:(g,c)=>armorFor(g,c).length>0,planDestruction,applyDestructionPreventions});
})();
