import assert from 'node:assert/strict';

export function permanentCountValue(ctx,source,node,snapshot){
  if(node?.kind!=='v8-permanent-count')return undefined;
  const {game,a}=ctx,own=snapshot?.cards.get(source)||source,bf=snapshot?.battlefield||game.bf(),before=c=>snapshot?.cards.get(c)||c;
  const types=c=>c.subtypes||c.cur?.subtypes||c.def?.subtypes||[];
  switch(node.test){
    case 'source-counter-total':return Object.values(own.counters||{}).reduce((n,x)=>n+x,0);
    case 'attachments':return bf.filter(c=>before(c).attachedTo===source.iid&&(c.hasSub('Aura')||c.hasSub('Equipment'))).length;
    case 'colors':return own.colors.length;
    case 'mana-value':return own.mv;
    case 'mana-symbols':return [...String(source.def.cost).matchAll(/\{([^}]+)\}/g)].filter(m=>m[1].split('/').includes(node.color)).length;
    case 'shared-creature-types':return bf.filter(c=>c!==source&&c.is('Creature')&&(node.controller==='all'||before(c).ctrl===a)&&
      (c.cur?.changeling&&types(own).length>0||source.cur?.changeling&&types(c).length>0||types(c).some(t=>types(own).includes(t)))).length;
    case 'creature-counters':return bf.filter(c=>c!==source&&c.is('Creature')&&before(c).ctrl===a).reduce((n,c)=>n+(before(c).counters[node.counter]||0),0);
    case 'graveyard-cycling':return (snapshot?.players.get(a)?.graveyardCards||a.graveyard).filter(c=>c.def.cycling).length;
    case 'commander-casts':return a.commanderCasts;
    case 'commander-mana-value':return Math.max(0,...a.commanders.map(c=>c.mv));
    case 'graveyard-size-count':return game.alivePlayers().filter(p=>(snapshot?.players.get(p)?.graveyard??p.graveyard.length)>=node.min).length;
    case 'creature-entries':return (a.turnState.oraclePermanentEntries||[]).filter(row=>row.types.includes('Creature')).length;
    case 'controller-graveyard':return (snapshot?.players.get(own.ctrl)?.graveyardCards||own.ctrl.graveyard).filter(c=>!node.creatures||c.is('Creature')).length;
    default:assert.fail('Unknown permanent count '+node.test);
  }
}

export function stagePermanentCount(MTG,ctx,node,h){
  if(node?.kind!=='v8-permanent-count')return false;
  const {game,a,b,countSource:source}=ctx;
  const make=(name,fields={},p=a)=>h.permanent(MTG,game,p,h.fixtureDefinition(name,['Creature'],{power:'2',toughness:'20',...fields}));
  switch(node.test){
    case 'source-counter-total':if(source)source.counters.charge=3;break;
    case 'attachments':if(source)for(const subtype of ['Aura','Equipment']){const c=h.permanent(MTG,game,a,h.fixtureDefinition('Counted '+subtype,[subtype==='Aura'?'Enchantment':'Artifact'],{subtypes:[subtype]}));c.attachedTo=source.iid;source.attachments.push(c.iid);}break;
    case 'colors':case 'mana-value':case 'mana-symbols':break;
    case 'shared-creature-types':make('Shared type witness',{changeling:true,subtypes:['Shapeshifter']});break;
    case 'creature-counters':make('Counted counters').counters[node.counter]=3;break;
    case 'graveyard-cycling':{const def=Object.values(MTG.DEFS).find(d=>d.cycling);assert.ok(def);h.zoneCard(MTG,a,def,'graveyard');break;}
    case 'commander-casts':case 'commander-mana-value':if(!a.commanders.length){const c=h.zoneCard(MTG,a,h.fixtureDefinition('Counted commander',['Creature'],{cost:'{5}',power:'5',toughness:'5',super:['Legendary']}),'command');c.commander=true;a.commanders.push(c);}a.commanders[0].cmdCasts=2;break;
    case 'graveyard-size-count':while(b.graveyard.length<node.min)h.zoneCard(MTG,b,'Forest','graveyard');break;
    case 'creature-entries':a.turnState.oraclePermanentEntries=[{types:['Creature']},{types:['Creature']}];break;
    case 'controller-graveyard':for(let i=0;i<2;i++)h.zoneCard(MTG,source?.ctrl||a,'Grizzly Bears','graveyard');break;
    default:assert.fail('Unknown count fixture '+node.test);
  }
  game.recalc();return true;
}
