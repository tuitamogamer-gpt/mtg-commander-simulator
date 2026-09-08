'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,SC=M.SCRIPTS,C=M.C1920,T=M.T;
 const drift=async ctx=>{const c=ctx.targets[0];if(!c)return;const rows=M.Mutate?.follow(c)||[{card:c,zoneVersion:c.zoneVersion+1}];await ctx.g.move(c,'exile');ctx.g.delayed.push({on:'endStep',once:true,src:ctx.src,ctrl:ctx.you,name:'Astral Drift: return the exiled creature',run:next=>next.g.withBattlefieldEntryBatch(async()=>{for(const row of rows)if(row.card.zone==='exile'&&row.card.zoneVersion===row.zoneVersion)await next.g.putPermanentOntoBattlefield(row.card,row.card.owner);})});};
 SC['Astral Drift']={cycling:{cost:'{2}{W}',targets:[T.creature({upTo:true,min:0})],effect:drift},triggers:[{on:'cycled',filter:(g,c,d)=>d.player===c.ctrl&&d.card!==c,opt:true,desc:'Exile a creature until the next end step',targets:[T.creature()],run:drift}]};
 SC['Gavi, Nest Warden']={c1920Gavi:true,triggers:[{on:'draw',filter:(g,c,d)=>d.player===c.ctrl&&d.nth===2,desc:'Create a red and white Dinosaur Cat',run:ctx=>ctx.g.makeTokens(C.tokenImage(C.token('Dinosaur Cat',[C.type(ctx,'Dinosaur'),C.type(ctx,'Cat')],2,2,['R','W']),"Dinosaur Cat"),ctx.you)}]};
 SC['New Perspectives']={c1920Perspectives:true,triggers:[C.enterTrigger('Draw three cards',ctx=>ctx.g.draw(ctx.you,3,ctx.src))]};
 SC['Tectonic Reformation']={c1920Tectonic:true,cycling:{cost:'{2}'}};
 SC['Abandoned Sarcophagus']={c1920Sarcophagus:true};
 SC['Nimble Obstructionist']={cycling:{cost:'{2}{U}',targets:[{zone:'stack',what:'stack',filter:(g,s,p)=>s.ctrl!==p&&['ability','trigger'].includes(s.kind)}],effect:ctx=>ctx.targets[0]&&ctx.g.counterStackObject(ctx.targets[0],{source:ctx.src})}};
 SC['Valiant Rescuer']={cycling:{cost:'{2}'},triggers:[{on:'cycled',filter:(g,c,d)=>d.player===c.ctrl&&d.card!==c&&d.c1920Nth===1,desc:'Create a Human Soldier',run:ctx=>ctx.g.makeTokens(C.human(ctx),ctx.you)}]};
 SC['Herald of the Forgotten']={triggers:[C.enterTrigger('Return any number of permanent cards with cycling',ctx=>C.enterMany(ctx,C.flat(ctx.targets)),{filter:(g,c,d)=>d.card===c&&c.castMeta?.wasCast,targets:(g,c)=>[C.grave((g,x,p)=>x.owner===p&&!!x.def.cycling&&C.permanent(g,x),{count:c.ctrl.graveyard.length,min:0,upTo:true})]})]};
 SC['Rooting Moloch']={cycling:{cost:'{2}'},triggers:[C.enterTrigger('Exile a cycling card to play through your next turn',async ctx=>{const c=ctx.targets[0];if(c){await ctx.g.move(c,'exile');if(c.zone==='exile')C.nextOwnGrant(ctx,c);}},{targets:[C.grave((g,c,p)=>c.owner===p&&!!c.def.cycling)]})]};
 SC['Spellpyre Phoenix']={triggers:[C.enterTrigger('Return an instant or sorcery with cycling to your hand',ctx=>ctx.targets[0]&&ctx.g.move(ctx.targets[0],'hand'),{opt:true,targets:[C.grave((g,c,p)=>c.owner===p&&!!c.def.cycling&&(c.is('Instant')||c.is('Sorcery')))]}),{on:'endStep',zone:'graveyard',filter:(g,c)=>(c.owner.turnState.c1920Cycled||0)>=2,desc:'Return Spellpyre Phoenix to your hand',run:ctx=>ctx.src.zone==='graveyard'&&ctx.src.zoneVersion===ctx.sourceZoneVersion&&(ctx.you.turnState.c1920Cycled||0)>=2&&ctx.g.move(ctx.src,'hand')}]};
})();
