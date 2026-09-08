'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,G=M.Game.prototype,C=M.C1719;
 M.SCRIPTS['Leonin Arbiter']={c1719Arbiter:true};
 G.canSearchLibrary=function(p){return !this.bf().some(c=>C.live(c)&&c.def.c1719Arbiter&&c.meta.c1719ArbiterPaid?.[p.idx]!==this.turnNo);};
 const list=G.activatableList,activate=G.activateAbility;
 G.activatableList=function(p,...args){const out=list.call(this,p,...args);for(const c of this.bf())if(C.live(c)&&c.def.c1719Arbiter&&c.meta.c1719ArbiterPaid?.[p.idx]!==this.turnNo&&this.canPayMana(p,M.parseCost('{2}')))out.push({card:c,c1719IgnoreArbiter:true,c1719ActingPlayer:p.idx,label:'Pay 2 to ignore Leonin Arbiter this turn'});return out;};
 G.activateAbility=async function(p,e,...args){if(!e.c1719IgnoreArbiter)return activate.call(this,p,e,...args);const c=e.card,v=c.zoneVersion;if(!C.live(c)||!c.def.c1719Arbiter||c.meta.c1719ArbiterPaid?.[p.idx]===this.turnNo)return false;if(!await this.payMana(p,M.parseCost('{2}')))return false;if(c.zoneVersion===v)(c.meta.c1719ArbiterPaid||={})[p.idx]=this.turnNo;this.note('specialAction',{card:c,player:p});return true;};
})();
