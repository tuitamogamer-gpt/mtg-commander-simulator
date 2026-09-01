import assert from 'node:assert/strict';

export function stageFalseCondition(MTG,ctx,condition,source,helpers){
 const {game,a}=ctx;
 if(condition.kind==='cast-main-phase'){game.phase='end';ctx.paymentCondition=null;}
 else if(condition.kind==='city-blessing')a.cityBlessing=false;
 else if(condition.kind==='starting-life')a.life=(a.startingLife??40)+condition.offset+(condition.comparison==='greater'?-1:1);
 else if(condition.kind==='source-controlled')source.ctrl=ctx.b;
 else if(condition.kind==='opponent-count-range'){
   for(const card of game.bf().slice())if(card.ctrl!==a&&card!==source&&!ctx.proofLockedTargets?.includes(card)&&matches(card,condition.count.what)&&(!condition.count.filters||condition.count.filters.some(filter=>matchesTarget(card,filter,{...ctx,a:card.ctrl},source)))){
     game.battlefield.splice(game.battlefield.indexOf(card),1);card.zone='hand';card.owner.hand.push(card);
   }
 }
 else if(condition.kind==='opponent-comparison'){
   const reverse={...condition,comparison:condition.comparison==='greater'?'less':'greater',each:true};
   stageCondition(MTG,ctx,reverse,source,helpers);
 }
 else if(condition.kind==='mana-spent'){ctx.paymentCondition=null;}
 else if(condition.kind==='no-mana-spent'){ctx.paymentCondition={kind:'mana-spent',colors:['G']};}
 else if(condition.kind==='not')stageCondition(MTG,ctx,condition.condition,source,helpers);
 else if(condition.kind==='any')for(const child of condition.conditions)stageFalseCondition(MTG,ctx,child,source,helpers);
 else if(condition.kind==='all')stageFalseCondition(MTG,ctx,condition.conditions[0],source,helpers);
 else if(condition.kind==='your-turn')game.turnPlayer=ctx.b;
 else if(condition.kind==='not-your-turn')game.turnPlayer=a;
 else if(condition.kind==='count-comparison'&&condition.count.zone==='battlefield'){
  if(condition.min){for(const card of game.bf().slice())if(card!==source&&matches(card,condition.count.what)&&(!condition.count.filters||condition.count.filters.some(f=>matchesTarget(card,f,ctx,source)))){game.battlefield.splice(game.battlefield.indexOf(card),1);card.zone='hand';card.owner.hand.push(card);}}
  else for(let i=0;i<=(condition.max||0);i++)stageCount(MTG,ctx,condition.count,helpers);
 }
 else if(condition.kind==='creature-died')game.diedThisTurn=[];
 else if(condition.kind==='monarch')game.monarch=null;
 else if(condition.kind==='life')a.life=condition.threshold+(condition.comparison==='less'?1:-1);
 else if(condition.kind==='graveyard-count'||condition.kind==='graveyard-types'){
   for(const card of a.graveyard.splice(0)){card.zone='library';a.library.push(card);}
 }else if(condition.kind==='turn-stat')a.turnState[condition.field]=0;
 else if(condition.kind==='x-range')source.castMeta={...(source.castMeta||{}),x:condition.min===undefined?Math.max(0,(condition.max||0)+1):Math.max(0,condition.min-1)};
 else if(condition.kind==='cast-origin')source.castMeta={...(source.castMeta||{}),from:condition.from==='not-hand'?'hand':'exile'};
 else if(condition.kind==='mana-total-spent')source.castMeta={...(source.castMeta||{}),manaSpent:Math.max(0,condition.min-1)};
 else if(condition.kind==='another-entry-turn')a.turnState.permanentEntries=[];
 else if(condition.kind==='cast-quality-turn')a.turnState.spellsCastList=[];
 else if(condition.kind==='permanent-count'||condition.kind==='has-permanent'){
   const what=condition.type||condition.what;
   for(const card of game.battlefield.slice())if(card.ctrl===a&&(what==='commander'?card.commander:matches(card,what))){
     // Do not remove the card being tested or a locked test target.
     if(card===source||ctx.proofLockedTargets?.includes(card))continue;
     game.battlefield.splice(game.battlefield.indexOf(card),1);card.zone='hand';a.hand.push(card);
   }
 }else if(condition.kind==='source-quality'){
   assert.ok(source?.def&&!source.def.oracleImplementation,'false quality branch uses an independent target fixture');
   const f=condition.filter;
   for(const filter of f.alternatives||[f]){
     source.def={...source.def,types:source.def.types.slice(),subtypes:(source.def.subtypes||[]).slice(),super:(source.def.super||[]).slice()};
     if(filter.color)source.def.colorsOverride=filter.color==='colorless'?['R']:filter.color==='multicolored'?['R']:[filter.color==='red'?'G':'R'];
     else if(filter.colorsAny)source.def.colorsOverride=[];
     else if(filter.subtype)source.def.subtypes=source.def.subtypes.filter(type=>type!==filter.subtype);
     else if(filter.alsoType)source.def.types=source.def.types.filter(type=>type!==filter.alsoType);
     else if(filter.token)source.isToken=false;
     else if(filter.legendary)source.def.super=source.def.super.filter(type=>type!=='Legendary');
     else if(filter.enchanted||filter.equipped){for(const id of source.attachments||[]){const attachment=game.bf().find(card=>card.iid===id);if(attachment)attachment.attachedTo=null;}source.attachments=[];}
     else assert.fail('Unimplemented false quality fixture '+JSON.stringify(filter));
   }
 }else assert.fail('Unimplemented false condition fixture '+condition.kind);
 game.recalc();
}

export function stageCondition(MTG,ctx,condition,source,helpers) {
  if(condition?.kind==='your-phase'){ctx.game.turnPlayer=ctx.a;ctx.game.phase=condition.phase==='main'?'main1':condition.phase;return;}
  if(!condition)return;
  const {game,a,b}=ctx;
  const {permanent,fixtureDefinition,zoneCard}=helpers;
  const add=(what='Creature',extras={})=>permanent(MTG,game,a,fixtureDefinition('V5 condition '+what,[what],{power:'5',toughness:'20',...extras}));
  switch(condition.kind){
    case 'city-blessing': a.cityBlessing=true;break;
    case 'source-controlled': if(source)source.ctrl=a;break;
    case 'starting-life': a.life=(a.startingLife??40)+condition.offset;break;
    case 'opponent-count-range': {
      const relative={...ctx,a:b,b:a};
      for(let i=0;i<=condition.min&&countValue(relative,source,condition.count)<condition.min;i++)stageCount(MTG,relative,condition.count,helpers);
      break;
    }
    case 'opponent-comparison': {
      const opponents=game.alivePlayers().filter(player=>player!==a),node=condition.count;
      if(node.kind==='life-total')for(const other of opponents)other.life=a.life+(condition.comparison==='greater'?20:-1);
      else if(node.zone==='hand'){
        if(condition.comparison==='less'&&!a.hand.length)zoneCard(MTG,a,'Forest','hand');
        const n=a.hand.length+(condition.comparison==='greater'?5:-1);
        for(const other of opponents){while(other.hand.length>n){const card=other.hand.pop();card.zone='library';other.library.push(card);}while(other.hand.length<n)zoneCard(MTG,other,'Forest','hand');}
      }else if(condition.comparison==='greater'){
        const n=countValue(ctx,source,node);
        for(const other of opponents){const relative={...ctx,a:other,b:a};for(let i=0;i<n+2&&countValue(relative,source,node)<=n;i++)stageCount(MTG,relative,node,helpers);}
      }else{
        const n=Math.max(0,...opponents.map(other=>countValue({...ctx,a:other,b:a},source,node)));
        for(let i=0;i<n+2&&countValue(ctx,source,node)<=n;i++)stageCount(MTG,ctx,node,helpers);
      }
      break;
    }
    case 'cast-main-phase': ctx.game.phase='main1';ctx.paymentCondition=condition;break;
    case 'mana-spent': ctx.paymentCondition=condition;source.castMeta={...(source.castMeta||{}),paymentColorCounts:Object.fromEntries(condition.colors.map(color=>[color,condition.min||condition.colors.filter(c=>c===color).length])),manaSpent:condition.min||condition.colors.length,wasCast:true};break;
    case 'no-mana-spent': ctx.paymentCondition=condition;source.castMeta={...(source.castMeta||{}),paymentColorCounts:{},manaSpent:0,wasCast:true};break;
    case 'player-zone-count': {const player=b,n=condition.min??condition.max??0;while(player[condition.zone].length>n){const card=player[condition.zone].pop();card.zone=condition.zone==='library'?'hand':'library';player[card.zone].push(card);}while(player[condition.zone].length<n)zoneCard(MTG,player,'Forest',condition.zone);break;}
    case 'source-was-cast': source.castMeta={...(source.castMeta||{}),wasCast:true};break;
    case 'control-commander': add('Creature',{super:['Legendary']}).commander=true;break;
    case 'monarch': game.monarch=a;break;
    case 'source-any-counter': source.counters=source.counters||{};source.counters.charge=1;break;
    case 'source-quality': {
      // Quality-conditioned spell targets are independently generated fixtures.
      // Do not rewrite a catalog source's printed characteristics to pass.
      if(source.def&&!source.def.oracleImplementation){
        const probe=helpers.stageGenericTarget(MTG,ctx,{...condition.filter,controller:'you'},'condition-quality');
        const original=source.def;
        source.def={...original,...probe.def,name:original.name,power:probe.def.power??original.power,toughness:probe.def.toughness??original.toughness,types:[...new Set([...original.types,...probe.def.types])],subtypes:[...new Set([...(original.subtypes||[]),...(probe.def.subtypes||[])])],super:[...new Set([...(original.super||[]),...(probe.def.super||[])])]};source.isToken=probe.isToken;
        for(const id of probe.attachments||[]){const attachment=game.bf().find(card=>card.iid===id);if(attachment){attachment.attachedTo=source.iid;source.attachments.push(id);}}
        if(probe.zone==='battlefield')game.battlefield.splice(game.battlefield.indexOf(probe),1);
      }
      break;
    }
    case 'source-attacked': source.meta._attackedTurn=game.turnNo;break;
    case 'source-entry-turn': source.meta._enteredTurn=game.turnNo;break;
    case 'not': break;
    case 'all': for(const item of condition.conditions)stageCondition(MTG,ctx,item,source,helpers);break;
    case 'any': stageCondition(MTG,ctx,condition.conditions[0],source,helpers);break;
    case 'count-comparison': if(condition.min===condition.max&&condition.count.zone==='battlefield'){
      const node=condition.count,pending=source.zone==='hand'&&!node.other&&matches(source,node.what)&&(!node.filters||node.filters.some(f=>matchesTarget(source,f,ctx,source)))?1:0,desired=Math.max(0,condition.min-pending);
      for(let i=0;i<desired&&countValue(ctx,source,node)<desired;i++)stageCount(MTG,ctx,node,helpers);
      for(const card of game.bf().slice())if(countValue(ctx,source,node)>desired&&card!==source&&!ctx.proofLockedTargets?.includes(card)&&card.ctrl===a&&matches(card,node.what)&&(!node.filters||node.filters.some(f=>matchesTarget(card,f,ctx,source)))){game.battlefield.splice(game.battlefield.indexOf(card),1);card.zone='hand';a.hand.push(card);}
    }else if(condition.count.kind==='source-counters'){if(source.counters){source.counters[condition.count.counter]=condition.min||0;game.recalc();}}else if(condition.min){for(let i=0;i<condition.min&&countValue(ctx,source,condition.count)<condition.min;i++)stageCount(MTG,ctx,condition.count,helpers);}else if(condition.count.zone==='hand'){while(a.hand.length>(condition.max||0)){const card=a.hand.pop();card.zone='library';a.library.push(card);}}else if(condition.max===0&&condition.count.zone==='battlefield'){
      for(const card of game.bf().slice())if(card.ctrl===a&&(!condition.count.other||card!==source)&&matches(card,condition.count.what)&&(!condition.count.filters||condition.count.filters.some(f=>matchesTarget(card,f,ctx,source)))){game.battlefield.splice(game.battlefield.indexOf(card),1);card.zone='hand';a.hand.push(card);}
    }break;
    case 'turn-stat': a.turnState[condition.field]=condition.min;break;
    case 'x-range': source.castMeta={...(source.castMeta||{}),x:condition.min??condition.max};break;
    case 'cast-origin': source.castMeta={...(source.castMeta||{}),from:condition.from==='not-hand'?'exile':condition.from};break;
    case 'mana-total-spent': source.castMeta={...(source.castMeta||{}),manaSpent:condition.min};break;
    case 'another-entry-turn': a.turnState.permanentEntries=[{iid:-1,zoneVersion:1,creature:condition.what==='creature',nonland:true}];break;
    case 'cast-quality-turn': a.turnState.spellsCastList=[{isInstantSorcery:condition.quality==='instant-or-sorcery'}];break;
    case 'opponent-life': b.life=condition.max;break;
    case 'opponent-poison': b.poison=condition.min;break;
    case 'graveyard-count': while(a.graveyard.length<condition.min)zoneCard(MTG,a,'Forest','graveyard');break;
    case 'graveyard-types': for(const name of ['Forest','Grizzly Bears','Sol Ring','Doom Blade','Rancor'])zoneCard(MTG,a,name,'graveyard');break;
    case 'permanent-count': for(let i=0;i<condition.min;i++)add(condition.type[0].toUpperCase()+condition.type.slice(1));break;
    case 'land-subtype': permanent(MTG,game,a,condition.subtype);break;
    case 'your-turn': game.turnPlayer=a;break;
    case 'not-your-turn': game.turnPlayer=b;break;
    case 'attacked': a.turnState.attacked=true;break;
    case 'opponent-lost-life': b.turnState.lifeLost=1;break;
    case 'creature-died': game.diedThisTurn.push({types:['Creature']});break;
    case 'ferocious': case 'formidable': add('Creature',{power:'8'});break;
    case 'coven': for(const power of ['1','3','5'])add('Creature',{power});break;
    case 'pack-tactics': source.attacking=b;game.combat={...(game.combat||{}),attackers:[source,add('Creature',{power:'8'})]};break;
    case 'cast-from-hand': source.castMeta={...(source.castMeta||{}),from:'hand'};break;
    case 'kicked': source.castMeta={...(source.castMeta||{}),kicked:true};break;
    case 'source-stat-comparison': {
      const delta=condition.threshold-(Number(source[condition.stat])||Number(source.def?.[condition.stat])||0);
      const field=condition.stat;
      game.untilEffects.push({apply:(g,bf)=>{if(bf.includes(source))source.cur[field]+=delta;}});break;
    }
    case 'source-status':
      if(condition.status==='attacking')source.attacking=b;
      else if(condition.status==='blocking')source.blocking=1;
      else if(condition.status==='tapped'||condition.status==='untapped')source.tapped=condition.status==='tapped';
      else {const attachment=add(condition.status==='equipped'?'Artifact':'Enchantment',{subtypes:[condition.status==='equipped'?'Equipment':'Aura']});attachment.attachedTo=source.iid;source.attachments.push(attachment.iid);}break;
    case 'has-permanent': {
      if(condition.what==='commander'){add('Creature',{super:['Legendary']}).commander=true;break;}
      const type=['artifact','creature','enchantment'].includes(condition.what.toLowerCase())?condition.what[0].toUpperCase()+condition.what.slice(1).toLowerCase():'Creature';
      add(type,{subtypes:[condition.what]});break;
    }
    case 'life': a.life=condition.threshold;break;
    case 'no-other-creatures': for(const card of game.creatures(a))if(card!==source){game.battlefield.splice(game.battlefield.indexOf(card),1);card.zone='hand';a.hand.push(card);}break;
    case 'hand-count': while(a.hand.length>condition.n){const card=a.hand.pop();card.zone='library';a.library.push(card);}while(a.hand.length<condition.n)zoneCard(MTG,a,'Forest','hand');break;
    case 'filtered-permanent-count': for(let i=0;i<condition.min;i++){const c=add('Creature',{subtypes:[condition.what]});c.tapped=!!condition.tapped;}break;
    default: assert.fail('Missing condition driver '+condition.kind);
  }
  game.recalc();
}

export function countValue(ctx,source,node,snapshot=null){
  if(typeof node==='number')return node;
  if(['source-stat','explicit-source-stat'].includes(node.kind))return Math.max(0,Number(snapshot?.cards.get(source)?.[node.stat]??source?.[node.stat])||0);
  const {game,a}=ctx;
  if(node.kind==='source-attachments')return (snapshot?.battlefield||game.bf()).filter(card=>card.attachedTo===source.iid&&(node.what==='permanent'||card.hasSub(node.what))).length;
  if(node.kind==='opponent-poison-total')return game.alivePlayers().filter(player=>player!==a).reduce((n,player)=>n+(snapshot?.players.get(player)?.poison??player.poison??0),0);
  if(node.kind==='opponent-count')return game.alivePlayers().filter(player=>player!==a).length;
  if(node.kind==='creature-total-power')return (snapshot?.battlefield||game.bf()).filter(card=>card.ctrl===a&&card.is('Creature')).reduce((n,card)=>n+(snapshot?.cards.get(card)?.power??card.power),0);
  if(node.kind==='devotion')return game.bf().filter(c=>c.ctrl===a).reduce((n,c)=>n+[...String(c.def.cost).matchAll(/\{([^}]+)\}/g)].filter(m=>m[1].split('/').some(color=>node.colors.includes(color))).length,0);
  if(node.kind==='turn-count')return a.turnState[node.field]||0;
  if(node.kind==='party'){
    let masks=new Set([0]);for(const card of game.creatures(a)){const next=new Set(masks);for(const mask of masks)for(const [i,type]of ['Cleric','Rogue','Warrior','Wizard'].entries())if(!(mask&(1<<i))&&card.hasSub(type))next.add(mask|(1<<i));masks=next;}return Math.max(...[...masks].map(mask=>mask.toString(2).replaceAll('0','').length));
  }
  if(node.kind==='source-counters')return (snapshot?.cards.get(source)?.counters||source.counters)[node.counter]||0;
  if(node.kind==='died-count')return game.diedThisTurn.filter(row=>row.types.includes('Creature')).length;
  if(node.kind==='max-stat')return Math.max(0,...(snapshot?.battlefield||game.bf()).filter(card=>node.filters.some(filter=>matchesTarget(card,filter,ctx,source))).map(card=>snapshot?.cards.get(card)?.[node.stat]??card[node.stat]));
  if(node.kind==='sum')return node.values.reduce((sum,item)=>sum+countValue(ctx,source,item,snapshot),0);
  if(node.kind==='life-total')return a.life;
  const players=node.controller==='all'?game.players:node.controller==='opponents'?game.players.filter(p=>p!==a):[a];
  const cards=node.zone==='battlefield'?(snapshot?.battlefield||game.battlefield).filter(c=>players.includes(c.ctrl)):players.flatMap(p=>snapshot?snapshot.players.get(p)[node.zone+'Cards']:p[node.zone]);
  const rows=cards.filter(card=>(!node.other||card!==source)&&(!node.name||card.name===node.name)&&matches(card,node.what)&&(!node.filters||node.filters.some(filter=>matchesTarget(card,filter,ctx,source)))).filter(card=>{
    if(!node.color)return true;
    if(node.color==='nonbasic')return !card.def.super.includes('Basic');
    if(node.color==='colorless')return card.colors.length===0;
    if(node.color==='multicolored')return card.colors.length>1;
    return card.colors.includes({white:'W',blue:'U',black:'B',red:'R',green:'G'}[node.color]);
  });
  if(node.aggregate)return rows.reduce((sum,c)=>sum+(Number(snapshot?.cards.get(c)?.[node.aggregate]??c[node.aggregate])||0),0);
  if(node.unique==='types')return new Set(rows.flatMap(c=>c.def.types.map(t=>t==='Tribal'?'Kindred':t))).size;
  if(node.unique==='mana-values')return new Set(rows.map(card=>card.mv)).size;
  if(node.unique==='power'||node.unique==='toughness')return new Set(rows.map(card=>snapshot?.cards.get(card)?.[node.unique]??card[node.unique])).size;
  if(node.unique==='colors')return new Set(rows.flatMap(c=>c.colors)).size;
  if(node.unique==='basic-land-types')return ['Plains','Island','Swamp','Mountain','Forest'].filter(t=>rows.some(c=>c.hasSub(t))).length;
  return rows.length;
}
export function matches(card,what){
  if(what==='card')return true;
  if(what==='basic land')return card.is('Land')&&card.def.super.includes('Basic');
  if(what==='nonland permanent')return !card.is('Land')&&!card.is('Instant')&&!card.is('Sorcery');
  if(what==='permanent')return !card.is('Instant')&&!card.is('Sorcery');
  return what.replace(/ permanent$/,'').split(' or ').some(t=>/^(artifact|creature|land|instant|sorcery|enchantment|planeswalker)$/i.test(t)?card.is(t[0].toUpperCase()+t.slice(1).toLowerCase()):card.hasSub(t));
}
export function matchesTarget(card,f,ctx,source){
 const {a}=ctx;
 if(f.controller==='event-player'&&card.ctrl!==ctx.eventPlayer)return false;
 if(f.controller==='defending-player'&&card.ctrl!==(ctx.eventDefender||source?.attacking||ctx.b))return false;
 if(f.damagedThisTurn&&card.meta?._lastDamageVisual?.turn!==ctx.game.turnNo)return false;
 if(f.owner==='you'&&card.owner!==a||f.commander&&!card.commander||f.anyCounter&&!Object.values(card.counters||{}).some(n=>n>0))return false;
 if(f.enteredThisTurn&&card.meta._enteredTurn!==ctx.game.turnNo||f.attackedThisTurn&&card.meta._attackedTurn!==ctx.game.turnNo)return false;
 if(f.alternatives&&!f.alternatives.some(alternative=>matchesTarget(card,alternative,ctx,source)))return false;
 if(!matches(card,f.what)||f.controller==='you'&&card.ctrl!==a||f.controller==='opponent'&&card.ctrl===a||f.excludeSelf&&card===source)return false;
 const sup=card.cur?.super||card.def.super||[];
 if(f.subtype&&!card.hasSub(f.subtype)||f.notSubtype&&card.hasSub(f.notSubtype)||f.alsoType&&!card.is(f.alsoType)||f.notType&&card.is(f.notType))return false;
 if(f.excludedTypes?.some(type=>card.is(type)))return false;
 if(f.basic&&!sup.includes('Basic'))return false;
 if(f.token&&!card.isToken||f.nontoken&&card.isToken||f.tapped&&!card.tapped||f.untapped&&card.tapped)return false;
 if(f.hasCounter&&!(card.counters[f.hasCounter]>0)||f.withKeyword&&!card.kw(f.withKeyword)||f.withoutKeyword&&card.kw(f.withoutKeyword))return false;
 if(f.withoutCounter&&card.counters[f.withoutCounter]>0)return false;
 if(f.snow&&!sup.includes('Snow')||f.nonsnow&&sup.includes('Snow')||f.legendary&&!sup.includes('Legendary')||f.nonlegendary&&sup.includes('Legendary')||f.nonbasic&&sup.includes('Basic'))return false;
 if(f.nonblack&&card.colors.includes('B')||f.nonartifact&&card.is('Artifact'))return false;
 if(f.color){const symbol={white:'W',blue:'U',black:'B',red:'R',green:'G'}[f.color];if(symbol?!card.colors.includes(symbol):f.color==='colorless'?card.colors.length>0:f.color==='multicolored'?card.colors.length<2:card.colors.length!==1)return false;}
 if(f.notColor){const symbol={white:'W',blue:'U',black:'B',red:'R',green:'G'}[f.notColor];if(symbol?card.colors.includes(symbol):!card.colors.length)return false;}
 if(f.colorsAny&&!f.colorsAny.some(c=>card.colors.includes(c)))return false;
 if(f.stat){const threshold=typeof f.threshold==='object'?countValue(ctx,source,f.threshold,ctx.countSnapshot):f.threshold;if(f.comparison==='equal'?card[f.stat]!==threshold:f.comparison==='less'?card[f.stat]>threshold:card[f.stat]<threshold)return false;}
 if(f.attacking&&!card.attacking||f.blocking&&!card.blocking||f.attackingOrBlocking&&!card.attacking&&!card.blocking)return false;
 if(f.enchanted&&!card.attachments.some(id=>ctx.game.byIid(id)?.hasSub('Aura'))||f.equipped&&!card.attachments.some(id=>ctx.game.byIid(id)?.hasSub('Equipment')))return false;
 return true;
}
export function stageCount(MTG,ctx,node,helpers){
  if(typeof node!=='object'||node===null)return;
  if(node.kind==='source-attachments'){
    if(ctx.countSource)for(let n=0;n<2;n++){
      const attachment=helpers.permanent(MTG,ctx.game,ctx.a,helpers.fixtureDefinition('Counted attachment '+n,[node.what==='Aura'?'Enchantment':'Artifact'],{subtypes:[node.what==='permanent'?'Equipment':node.what]}));
      ctx.game.attach(attachment,ctx.countSource);
    }
    return;
  }
  if(node.kind==='opponent-poison-total'){ctx.b.poison=3;return;}
  if(node.kind==='opponent-count')return;
  if(node.kind==='creature-total-power'){helpers.permanent(MTG,ctx.game,ctx.a,helpers.fixtureDefinition('Total power counted',['Creature'],{power:'8',toughness:'10'}));return;}
  if(['sacrificed-stat','destroyed-count','damage-dealt','life-lost','event-card-counters'].includes(node.kind))return;
  if(node.kind==='max-stat'){for(const filter of node.filters){const card=helpers.stageGenericTarget(MTG,ctx,filter,'entry-maximum');if(!filter.stat)card.def.power='3';}ctx.game.recalc();return;}
  if(node.kind==='devotion'){helpers.permanent(MTG,ctx.game,ctx.a,helpers.fixtureDefinition('Devotion counted',['Enchantment'],{cost:'{'+node.colors[0]+'}{'+node.colors[0]+'}'}));return;}
  if(node.kind==='party'){for(const type of ['Cleric','Rogue','Warrior','Wizard'])helpers.permanent(MTG,ctx.game,ctx.a,helpers.fixtureDefinition('Party '+type,['Creature'],{subtypes:[type],power:'1',toughness:'20'}));return;}
  if(node.kind==='turn-count'){ctx.a.turnState[node.field]=3;return;}
  if(node.kind==='died-count'){ctx.game.diedThisTurn.push({types:['Creature']},{types:['Creature']});return;}
  if(['source-stat','explicit-source-stat','target-stat','source-counters'].includes(node.kind))return;
  if(node.kind==='life-total')return;
  if(node.kind==='target-count'){
    const target=typeof node.target==='number'?ctx.oracleProofTargets?.[node.target]:ctx.b;
    assert.ok(target instanceof MTG.Player,'a relative count needs its actual targeted or event player');
    stageCount(MTG,{...ctx,a:target,b:target===ctx.a?ctx.b:ctx.a},node.count,helpers);return;
  }
  if(node.kind==='sum'){for(const item of node.values)stageCount(MTG,ctx,item,helpers);return;}
  if(node.unique==='types'){for(const name of ['Forest','Grizzly Bears','Sol Ring','Doom Blade','Rancor','Divination'])helpers.zoneCard(MTG,ctx.a,name,'graveyard');return;}
  if(node.unique==='mana-values'){for(let n=0;n<6;n++)helpers.zoneCard(MTG,ctx.a,helpers.fixtureDefinition('Mana value '+n,['Sorcery'],{cost:'{'+n+'}'}),'graveyard');return;}
  if(node.unique==='basic-land-types'){for(const name of ['Plains','Island','Swamp','Mountain','Forest'])helpers.permanent(MTG,ctx.game,ctx.a,name);return;}
  if(node.filters){for(const target of node.filters)for(let i=0;i<3;i++){const card=helpers.stageGenericTarget(MTG,ctx,{...target,controller:node.controller==='opponents'?'opponent':node.controller==='all'?target.controller:'you',zone:node.zone==='battlefield'?'battlefield':'graveyard'},i);if(node.zone&&card.zone!==node.zone){card.owner[card.zone].splice(card.owner[card.zone].indexOf(card),1);card.zone=node.zone;card.owner[node.zone].push(card);}if(node.aggregate&&!target.stat){card.def.power='3';card.def.toughness='4';card.def.cost='{2}';}}ctx.game.recalc();return;}
  const {game,a,b}=ctx;
  const p=node.controller==='opponents'?b:a;
  const types=['Artifact','Creature','Enchantment','Land','Instant','Sorcery'].filter(type=>new RegExp(type,'i').test(node.what));
  const type=types[0]||'Creature';
  for(let i=0;i<3;i++){
    const def=helpers.fixtureDefinition(node.name||'V5 counted '+i,[type],{subtypes:[node.what.replace(/ permanent$/,''),'Forest'],colorsOverride:['G','W'],power:'3',toughness:'20'});
    const card=new MTG.CardInst(def,p);card.zone=node.zone;card.ctrl=p;
    if(node.zone==='battlefield')game.battlefield.push(card);else p[node.zone].push(card);
  }
  game.recalc();
}

export async function characteristicProof(MTG,entry,op,role,h){
  const ctx=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'});
  const {game,a}=ctx;h.fund(a);h.fillLibrary(MTG,a,30);
  if(op.count.kind!=='life-total')stageCount(MTG,ctx,op.count,h);
  const source=h.zoneCard(MTG,a,entry.raw.name,'hand');
  const check=()=>{
    const value=countValue(ctx,source,op.count)*op.multiply+op.offset;
    if(op.power)assert.equal(source.power,value,entry.raw.name+': CDA power in '+source.zone);
    if(op.toughness)assert.equal(source.toughness,value+op.toughnessOffset,entry.raw.name+': CDA toughness in '+source.zone);
  };
  check();await game.move(source,'graveyard');check();await game.move(source,'hand');
  assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);
  if(source.zone==='battlefield'){
    // Continuous bonuses are separate operation proofs. CDA is evaluated before them.
    const modifiers=(entry.implementation||[]).filter(o=>o.kind==='generic-static');
    if(!modifiers.length)check();
    await game.move(source,'exile');check();
  }else check();
  return 4;
}

export async function combatRestrictionProof(MTG,ctx,card,op,h,label){
 if(!['cantAttack','cantBlock','unblockable','blockOnlyFlying','attackerFilters','relativeAttackerPower','blockerFilters','defenderRule','cantAttackSourceController'].some(key=>op[key]))return 0;
 const {game,a,b}=ctx;let checks=0;
 const opponent=card.ctrl===a?b:a;
 const probe=h.permanent(MTG,game,opponent,h.fixtureDefinition('Combat legality probe',['Creature'],{power:'1',toughness:'20',colorsOverride:[],kws:[]}));
 if(op.cantAttack){assert.equal(card.cur.cantAttack,true,label+': attack restriction applied');assert.equal(game.canAttackAtAll(card),false);checks++;}
 if(op.cantBlock){assert.equal(game.canBlock(card,probe),false,label+': block restriction applied');checks++;}
 if(op.unblockable){assert.equal(game.canBlock(probe,card),false,label+': evasion applied');checks++;}
 if(op.blockOnlyFlying){assert.equal(game.canBlock(card,probe),false,label+': ground attacker rejected');assert.equal(card.cur.blockOnlyFlying,true);checks++;}
 if(op.attackerFilters||op.relativeAttackerPower){
   const attackers=[probe];for(const filter of op.attackerFilters||[])attackers.push(h.stageGenericTarget(MTG,ctx,{...filter,controller:card.ctrl===a?'opponent':'you'},'restricted-attacker'));
   for(const power of [card.power-1,card.power,card.power+1])attackers.push(h.permanent(MTG,game,opponent,h.fixtureDefinition('Attacker power probe',['Creature'],{power:String(power),toughness:'20',colorsOverride:[]})));
   let matches=0;for(const attacker of attackers){const match=op.relativeAttackerPower?(op.relativeAttackerPower==='greater'?attacker.power>card.power:attacker.power<card.power):op.attackerFilters.some(filter=>matchesTarget(attacker,filter,ctx,card));if(match){matches++;assert.equal(game.canBlock(card,attacker),false,label+': forbidden attacker rejected');}}
   assert.ok(matches,label+': attacker quality exercised');checks+=matches;
 }
 if(op.blockerFilters){
   const blockers=[probe];for(const filter of op.blockerFilters)blockers.push(h.stageGenericTarget(MTG,ctx,{...filter,controller:card.ctrl===a?'opponent':'you'},'restricted-blocker'));
   for(const power of [0,1,2,3,4,8])blockers.push(h.permanent(MTG,game,opponent,h.fixtureDefinition('Blocker power probe',['Creature'],{power:String(power),toughness:'20',colorsOverride:[]})));
   let rejected=0;for(const blocker of blockers){const match=op.blockerFilters.some(filter=>matchesTarget(blocker,filter,ctx,card));if(op.blockOnly?!match:match){rejected++;assert.equal(game.canBlock(blocker,card),false,label+': forbidden blocker rejected');}}
   assert.ok(rejected,label+': blocker quality exercised');checks+=rejected;
 }
 if(op.defenderRule){
   const filters=op.defenderRule.filters,present=()=>game.bf().some(permanent=>filters.some(filter=>matchesTarget(permanent,filter,{...ctx,a:opponent,b:card.ctrl},card)));
   for(const permanent of game.bf().slice())if(filters.some(filter=>matchesTarget(permanent,filter,{...ctx,a:opponent,b:card.ctrl},card)))await game.move(permanent,'hand');
   assert.equal(present(),false);assert.equal(game.canAttackTarget(card,opponent),!op.defenderRule.require,label+': defender without required permanent');
   for(const filter of filters)h.stageGenericTarget(MTG,ctx,{...filter,controller:card.ctrl===a?'opponent':'you'},'defender-rule');
   assert.equal(present(),true);assert.equal(game.canAttackTarget(card,opponent),op.defenderRule.require,label+': defender with required permanent');checks+=2;
 }
 if(op.cantAttackSourceController){assert.equal(game.canAttackTarget(card,a),false,label+': protected controller cannot be attacked');const walker=h.permanent(MTG,game,a,h.fixtureDefinition('Protected walker',['Planeswalker'],{loyalty:'5'}));assert.equal(game.canAttackTarget(card,walker),!op.includePlaneswalkers,label+': planeswalker restriction boundary');checks+=2;}
 return checks;
}

export async function staticProof(MTG,entry,op,role,h){
 const ctx=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;
 const source=h.permanent(MTG,game,a,entry.raw.name);
 ctx.countSource=source;
 if(op.conditionSubject!=='affected')stageCondition(MTG,ctx,op.condition,source,h);
 if(op.multiplier)stageCount(MTG,ctx,op.multiplier,h);
 game.recalc();
 if(op.scope==='self'&&(op.attackerFilters||op.relativeAttackerPower||op.defenderRule||op.blockOnlyFlying))return combatRestrictionProof(MTG,ctx,source,op,h,entry.raw.name);
 if(op.blockerFilters||op.relativeBlockerPower){
   const blockers=[];
   for(const filter of op.blockerFilters||[])blockers.push(h.stageGenericTarget(MTG,ctx,{...filter,controller:'opponent'},'block-filter'));
   for(const filter of op.blockerFilters||[])if(filter.notSubtype)blockers.push(h.permanent(MTG,game,b,h.fixtureDefinition('Excluded subtype blocker',['Creature'],{subtypes:[filter.notSubtype],power:'2',toughness:'20'})));
   for(const power of [0,Math.max(0,source.power-1),source.power,source.power+1])for(const keywords of [[],['flying','reach'],['defender']])blockers.push(h.permanent(MTG,game,b,h.fixtureDefinition('V7 blocker',['Creature'],{power:String(power),toughness:'20',kws:keywords,colorsOverride:[]})));
   source.attacking=b;let matches=0,misses=0;
   for(const blocker of blockers){
     const match=op.relativeBlockerPower?(op.relativeBlockerPower==='greater'?blocker.power>source.power:blocker.power<source.power):op.blockerFilters.some(filter=>matchesTarget(blocker,filter,ctx,source));
     if(match)matches++;else misses++;
     const expected=op.blockOnly?!match:match;
     assert.equal(source.cur.cantBeBlockedBy(game,blocker),expected,entry.raw.name+': exact blocker quality restriction');
     if(expected)assert.equal(game.canBlock(blocker,source),false,entry.raw.name+': forbidden blocker rejected by engine');
   }
   assert.ok(matches>0&&misses>0,entry.raw.name+': both blocker quality branches');return blockers.length;
 }
 if(op.unblockable){const blocker=h.permanent(MTG,game,b,'Grizzly Bears');assert.equal(game.canBlock(blocker,source),false,entry.raw.name+': conditional unblockable is effective');return 1;}
 if(op.scope==='filtered-permanents'){
   const targets=op.filters.map((filter,index)=>h.stageGenericTarget(MTG,ctx,{...filter,controller:filter.controller==='any'?'opponent':filter.controller},index));
   ctx.proofLockedTargets=targets;
   if(op.conditionSubject==='affected')for(const target of targets)stageCondition(MTG,ctx,op.condition,target,h);
   else if(op.condition?.kind==='count-comparison')stageCondition(MTG,ctx,op.condition,source,h);
   for(const target of targets)for(const kw of op.removeKeywords||[])target.def.kws=[...(target.def.kws||[]),kw];
   game.recalc();
   const original=source.def.statics,selected=original.find(layer=>layer.oracleOperation===op);assert.ok(selected);
   const prior=targets.map(card=>({power:card.power,toughness:card.toughness,multiplier:op.multiplier?countValue(ctx,op.multiplierSubject==='affected'?card:source,op.multiplier):1}));
   for(const target of targets){
     for(const kw of op.keywords||[])assert.equal(target.kw(kw),true,entry.raw.name+': filtered keyword');
     for(const kw of op.removeKeywords||[])assert.equal(target.kw(kw),false,entry.raw.name+': filtered removed keyword');
     if(op.cantAttack)assert.equal(target.cur.cantAttack,true);
     if(op.cantBlock)assert.equal(target.cur.cantBlock,true);
     if(op.cantUntap)assert.equal(target.cur.cantUntap,true,entry.raw.name+': matching permanent cannot untap in untap step');
     await combatRestrictionProof(MTG,ctx,target,op,h,entry.raw.name);
   }
   try{source.def.statics=original.filter(layer=>layer!==selected);game.recalc();
     targets.forEach((target,index)=>{assert.equal(prior[index].power-target.power,(op.power||0)*prior[index].multiplier);assert.equal(prior[index].toughness-target.toughness,(op.toughness||0)*prior[index].multiplier);});
   }finally{source.def.statics=original;game.recalc();}
   return Math.max(2,targets.length*2);
 }
 if(op.protectionQualities){
   for(const quality of op.protectionQualities){
     const type=quality.kind==='type'?quality.value:'Creature';
     const colors=quality.kind==='color'?[quality.value]:quality.kind==='multicolored'?['W','U']:quality.kind==='colored'||quality.kind==='monocolored'?['W']:[];
     const hostile=new MTG.CardInst(h.fixtureDefinition('V6 protection source',[type],{subtypes:[quality.kind==='subtype'?quality.value:'Test'],colorsOverride:colors}),b);
     hostile.zone='hand';b.hand.push(hostile);
     assert.equal(game.isProtectedFrom(source,hostile),true,entry.raw.name+': protection recognizes '+JSON.stringify(quality));
     assert.equal(await game.damageCreature(hostile,source,3),0,entry.raw.name+': protection prevents damage');
   }
   for(const kw of op.keywords||[])assert.equal(source.kw(kw),true,entry.raw.name+': accompanying keyword');
   return op.protectionQualities.length*2;
 }
 if(op.evasionMinBlockerPower!==undefined||op.evasionLessThanOwnPower||op.excludedBlockers||op.blockedOnlyByFlyingOrReach){
   const make=extras=>h.permanent(MTG,game,b,h.fixtureDefinition('V5 blocker',['Creature'],{power:'2',toughness:'20',kws:['flying','reach',...(source.kw('shadow')?['shadow']:[]),...(source.kw('horsemanship')?['horsemanship']:[])],colorsOverride:[],...extras}));
   let forbidden,legal;
   if(op.evasionMinBlockerPower!==undefined){forbidden=make({power:String(op.evasionMinBlockerPower)});legal=make({power:String(op.evasionMinBlockerPower-1)});}
   else if(op.evasionLessThanOwnPower){forbidden=make({power:String(source.power-1)});legal=make({power:String(source.power)});}
   else if(op.blockedOnlyByFlyingOrReach){forbidden=make({kws:[]});legal=make({kws:['flying']});}
   else if(op.excludedBlockers==='walls'){forbidden=make({subtypes:['Wall']});legal=make({subtypes:['Bear']});}
   else if(op.excludedBlockers==='artifact creatures'){forbidden=make({types:['Artifact','Creature']});legal=make({types:['Creature']});}
   else {forbidden=make({colorsOverride:[{white:'W',blue:'U',black:'B',red:'R',green:'G'}[op.excludedBlockers.split(' ')[0]]]});legal=make({colorsOverride:[]});}
   game.recalc();assert.equal(game.canBlock(forbidden,source),false,entry.raw.name+': excluded blocker');
   assert.equal(game.canBlock(legal,source),true,entry.raw.name+': legal blocker remains');return 2;
 }
 if(op.scope==='self'){
   if(!op.condition)await combatRestrictionProof(MTG,ctx,source,op,h,entry.raw.name);
   for(const kw of op.keywords||[])assert.equal(source.kw(kw),true,entry.raw.name+': conditional keyword '+kw);
   const original=source.def.statics;
   const generic=(entry.implementation||[]).filter(o=>o.kind==='generic-static');
   const index=generic.indexOf(op);
   // Remove only this continuous layer to measure its contribution, then
   // restore it. Card identity, zones, other abilities, and game state remain.
   const selected=original.find(s=>s.oracleOperation===op);assert.ok(selected,entry.raw.name+': continuous descriptor');
   const before={power:source.power,toughness:source.toughness};
   const multiple=op.multiplier?countValue(ctx,source,op.multiplier):1;
   try {source.def.statics=original.filter(s=>s!==selected);game.recalc();
     if(op.power)assert.equal(before.power-source.power,op.power*multiple,entry.raw.name+': power contribution');
     if(op.toughness)assert.equal(before.toughness-source.toughness,op.toughness*multiple,entry.raw.name+': toughness contribution');
   }finally{source.def.statics=original;game.recalc();}
   return 2;
 }
 const p=op.scope==='opponent-creatures'?b:a;
 const subtypes=op.subtype?[op.subtype]:[];
 const target=h.permanent(MTG,game,p,h.semanticSubtypeFixture(op));
 const opposite=h.permanent(MTG,game,p===a?b:a,h.semanticSubtypeFixture(op));
 if(op.subtype==='tapped'){target.tapped=true;opposite.tapped=true;}
 if(op.subtype==='attacking'){target.attacking=b;opposite.attacking=a;}
 if(op.subtype==='token'){target.isToken=true;opposite.isToken=true;}
 if(op.subtype?.toLowerCase()==='enchanted')for(const card of [target,opposite]){const aura=h.permanent(MTG,game,card.ctrl,h.fixtureDefinition('V6 attached Aura',['Enchantment'],{subtypes:['Aura']}));aura.attachedTo=card.iid;card.attachments.push(aura.iid);}
 game.recalc();
 const prior={power:target.power,toughness:target.toughness,opposite:opposite.power,source:source.power};
 const statics=source.def.statics,selected=statics.find(s=>s.oracleOperation===op);assert.ok(selected);
 try{source.def.statics=statics.filter(s=>s!==selected);game.recalc();
   assert.equal(prior.power-target.power,op.power||0,entry.raw.name+': selected controller receives power');
   assert.equal(prior.toughness-target.toughness,op.toughness||0,entry.raw.name+': selected controller receives toughness');
   assert.equal(prior.opposite-opposite.power,['all-creatures','all-other-creatures'].includes(op.scope)?(op.power||0):0,entry.raw.name+': opposite controller scope');
   if(['your-other-creatures','all-other-creatures'].includes(op.scope))assert.equal(source.power,prior.source,entry.raw.name+': source excluded');
 }finally{source.def.statics=statics;game.recalc();}
 for(const keyword of op.keywords||[])assert.equal(target.kw(keyword),true,entry.raw.name+': matching creature receives keyword');
 return 3;
}

export const mechanicKinds=new Set(['mechanic-unearth','mechanic-grave-return-self','mechanic-embalm','mechanic-eternalize','mechanic-soulshift','mechanic-modular','mechanic-fabricate','mechanic-living-weapon','mechanic-for-mirrodin','mechanic-offspring','mechanic-afflict','mechanic-ingest','mechanic-ninjutsu','mechanic-foretell','mechanic-retrace','doesnt-untap']);
for(const kind of ['replicate','ravenous','graveyard-lands','conditional-alternative'])mechanicKinds.add('mechanic-'+kind);
for(const kind of ['harmonize-v8','ward-v8'])mechanicKinds.add('mechanic-'+kind);
for(const kind of ['player-hexproof','additional-land','dethrone','rampage','mobilize','squad','blitz','warp','evoke','kicker','multikicker','escape','additional-costs','no-max-hand','echo','dash','dredge','plot','devour','graft','surge','spectacle','madness','buyback','split-second','jump-start','fading','vanishing','cumulative-upkeep'])mechanicKinds.add('mechanic-'+kind);
export async function mechanicProof(MTG,entry,op,role,h){
 const controller=h.decision({chooseX:(g,q)=>Math.min(3,q.max??3),chooseCards:(g,q)=>q.from.slice(0,q.max??q.min??1),chooseTargets:(g,q)=>q.candidates.slice(0,q.max??q.min??1),chooseOption:(g,q)=>q.options.find(o=>o.key==='yes')?.key||q.options[0].key});
 const ctx=h.gameFor(MTG,[controller,h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;
 h.fund(a,100);h.fillLibrary(MTG,a,60);h.fillLibrary(MTG,b,60);
 for(let i=0;i<5;i++)h.zoneCard(MTG,a,'Forest','hand');
 const additionalFixtures=[];
 const stageAdditional=cost=>{
   if(cost.kind==='exileGraveyard')for(let i=0;i<cost.quantity.min;i++)additionalFixtures.push(h.zoneCard(MTG,a,h.fixtureDefinition('V7 additional exile '+i,cost.object.types||['Creature'],{power:'2',toughness:'2'}),'graveyard'));
   if(cost.kind==='sacrifice'){
     const card=h.permanent(MTG,game,a,h.fixtureDefinition('V6 additional cost permanent',cost.object.types||['Creature'],{super:['Legendary'],power:'0',toughness:'20'}));additionalFixtures.push(card);
   }
   for(const child of cost.options||cost.costs||[])stageAdditional(child);
 };
 for(const operation of entry.implementation)if(operation.kind==='mechanic-additional-costs')for(const cost of operation.costs)stageAdditional(cost);
 for(const operation of entry.implementation){
   if(operation.kind==='copy-as-enters')h.stageGenericTarget(MTG,ctx,operation.filter,'copy-model');
   if(operation.kind==='aura-target')h.permanent(MTG,game,a,'Grizzly Bears');
   if(operation.kind==='spell-graveyard-return')h.zoneCard(MTG,a,'Grizzly Bears','graveyard');
   if(operation.kind==='spell-modal-generic')for(const mode of operation.modes)for(const [i,target]of mode.body.targets.entries())h.stageGenericTarget(MTG,ctx,target,i,mode.body.effects.find(effect=>effect.target===i));
   for(const [i,target] of (operation.targets||[]).entries())target.zone==='stack'?await h.stageGenericStackTarget(MTG,ctx,target,i):h.stageGenericTarget(MTG,ctx,target,i,operation.effects?.find(e=>e.target===i));
   const v4=operation.kind==='spell-v4'?operation:operation.v4Body;
   if(v4)for(const [i,target] of v4.targets.entries())await h.stageSpellV4Target(MTG,ctx,{name:entry.raw.name},target,v4.effects.find(e=>e.targetIds.includes(target.id)),h.spellV4TargetVariants(target)[0],i);
   if(operation.kind==='spell-counter'&&op.kind!=='mechanic-foretell'){
     await h.stageSpellV4Target(MTG,ctx,{name:entry.raw.name},{kind:'spell',zone:'stack',quantity:{min:1,max:1}},{kind:'counterSpell',targetIds:[]},'Instant',0);
   }else if(['spell-pump','spell-damage','spell-destroy','spell-bounce','spell-exile','spell-tap','spell-untap'].includes(operation.kind)){
     const what=(operation.what||'creature').replace(/^target /,'');
     h.stageGenericTarget(MTG,ctx,{...operation,what,controller:'any'},0,{action:operation.kind.slice(6),n:operation.n});
   }
 }
 for(const operation of entry.implementation||[])if(operation.kind==='attachment-grant'&&operation.multiplier)stageCount(MTG,ctx,operation.multiplier,h);
 if(JSON.stringify(entry.implementation).includes('"kind":"sacrificed-stat"')){for(const card of game.creatures(a))if(!card.def.oracleImplementation){card.def.power='3';card.def.toughness='4';}game.recalc();}
 const source=h.zoneCard(MTG,a,entry.raw.name,['mechanic-unearth','mechanic-grave-return-self','mechanic-embalm','mechanic-eternalize','mechanic-retrace','mechanic-escape'].includes(op.kind)?'graveyard':'hand');
 const cast=async()=>{assert.equal(await game.castSpell(a,source,{from:'hand',xVal:3}),true,entry.raw.name+': mechanic paid cast');await h.resolveAll(game);};
 if(op.kind==='mechanic-replicate'){
   h.constrainSquadMana(MTG,a,entry);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);const original=game.stack.find(row=>row.card===source),paid=source.castMeta.paidTimes;assert.ok(paid>0,entry.raw.name+': positive replicate payment');const spells=a.turnState.spellsCast;
   await game.flushTriggers();const trigger=game.stack.find(row=>row.kind==='trigger'&&row.name.includes('Replicate'));assert.ok(trigger);assert.equal(game.stack.filter(row=>row.isCopy).length,0);
   await game.counterStackObject(original,{ignoreUncounterable:true});await game.resolveTop();const copies=game.stack.filter(row=>row.isCopy);assert.equal(copies.length,paid);for(const copy of copies)assert.equal(copy.targets.length,original.targets.length);assert.equal(a.turnState.spellsCast,spells);await h.resolveAll(game);return 4;
 }
 if(op.kind==='mechanic-ravenous'){
   assert.equal(await game.castSpell(a,source,{from:'hand',xVal:5}),true);await game.resolveTop();assert.equal(source.counters['+1/+1'],5);await game.flushTriggers();assert.ok(game.stack.some(row=>row.name.includes('Ravenous')));await h.resolveAll(game);return 2;
 }
 if(op.kind==='mechanic-graveyard-lands'){
   await cast();const land=h.zoneCard(MTG,a,'Forest','graveyard');assert.ok(game.playableLands(a).includes(land));assert.equal(await game.playLand(a,land),true);assert.equal(land.zone,'battlefield');await game.move(source,'exile');const other=h.zoneCard(MTG,a,'Island','graveyard');a.landsPlayed=0;assert.equal(game.playableLands(a).includes(other),false);return 3;
 }
 if(op.kind==='mechanic-conditional-alternative'){
   const alt=source.def.altCosts.find(row=>row.oracleConditional);assert.ok(alt);stageCondition(MTG,ctx,op.condition,source,h);assert.equal(alt.cond(game,a,source),true);assert.equal(await game.castSpell(a,source,{from:'hand',alt}),true);assert.equal(source.castMeta.alt.free,true);await h.resolveAll(game);return 2;
 }
 if(op.kind==='mechanic-dethrone'){
   await cast();b.life=Math.max(...game.alivePlayers().map(p=>p.life));const before=source.counters['+1/+1']||0;source.attacking=b;
   await game.emit('attacks',{card:source,player:a,defender:b});await game.flushTriggers();assert.ok(game.stack.some(row=>row.name.includes('Dethrone')));await h.resolveAll(game);
   assert.equal(source.counters['+1/+1'],before+1);return 2;
 }
 if(op.kind==='mechanic-rampage'){
   await cast();const blockers=Array.from({length:3},(_,i)=>h.permanent(MTG,game,b,h.fixtureDefinition('Rampage blocker '+i,['Creature'],{power:'1',toughness:'20'})));
   source.attacking=b;source.blockedBy=blockers;for(const blocker of blockers)blocker.blocking=source.iid;const before=source.power;
   await game.emit('becomesBlocked',{attacker:source,blockers});await game.flushTriggers();assert.ok(game.stack.some(row=>row.name.includes('Rampage')));await game.move(blockers[0],'exile');await h.resolveAll(game);
   assert.equal(source.power,before+op.n,entry.raw.name+': rampage counts current blockers beyond the first');return 2;
 }
 if(op.kind==='mechanic-mobilize'){
   await cast();source.attacking=b;game.combat={attackers:[source],defenders:new Map()};const before=new Set(game.bf());
   await game.emit('attacks',{card:source,player:a,defender:b});await game.flushTriggers();assert.ok(game.stack.some(row=>row.name.includes('Mobilize')));await h.resolveAll(game);
   const tokens=game.bf().filter(card=>!before.has(card)&&card.isToken&&card.name==='Warrior');assert.equal(tokens.length,op.n);
   for(const token of tokens){assert.equal(token.tapped,true);assert.equal(token.attacking,b);assert.equal(token.def.power,'1');assert.deepEqual([...token.colors],['R']);}
   await game.emit('endStep',{player:a});await h.resolveAll(game);assert.ok(tokens.every(card=>card.zone!=='battlefield'));return 3;
 }
 if(op.kind==='mechanic-squad'){
   h.constrainSquadMana(MTG,a,entry);
   const created=[];const makeTokens=game.makeTokens;game.makeTokens=async function(...args){const cards=await makeTokens.apply(this,args);created.push(...cards);return cards;};
   assert.equal(await game.castSpell(a,source,{from:'hand'}),true);const paid=source.castMeta.paidTimes;assert.ok(paid>0,entry.raw.name+': positive squad payment');await game.resolveTop();
   assert.ok(game.stack.some(row=>row.name.includes('Squad')),entry.raw.name+': squad has a separate Stack trigger');await h.resolveAll(game);
   const tokens=created.filter(card=>card.name===source.name);assert.equal(tokens.length,paid);assert.ok(tokens.every(card=>!card.meta.paidTimes));return 3;
 }
 if(op.kind==='mechanic-blitz'||op.kind==='mechanic-warp'){
   const kind=op.kind.slice(9),row=game.castableList(a).find(row=>row.card===source&&row.alt?.[kind]);assert.ok(row,entry.raw.name+': alternative offered');const before=Object.values(a.pool).reduce((n,v)=>n+v,0);
   assert.equal(await game.castSpell(a,source,{from:'hand',alt:row.alt}),true);if(op.cost!=='{0}')assert.ok(Object.values(a.pool).reduce((n,v)=>n+v,0)<before);await h.resolveAll(game);
   assert.equal(source.zone,'battlefield');if(kind==='blitz')assert.equal(source.kw('haste'),true);
   const hand=a.hand.length;await game.emit('endStep',{player:a});await h.resolveAll(game);
   if(kind==='blitz'){assert.equal(source.zone,'graveyard');assert.ok(a.hand.length>=hand+1,entry.raw.name+': blitz death draw');}
   else {assert.equal(source.zone,'exile');assert.equal(game.castableList(a).some(row=>row.card===source),false);game.turnNo++;h.fund(a,100);assert.ok(game.castableList(a).some(row=>row.card===source));assert.equal(await game.castSpell(a,source,{from:'exile'}),true);await h.resolveAll(game);assert.equal(source.zone,'battlefield');}
   return 4;
 }
 if(op.kind==='mechanic-fading'||op.kind==='mechanic-vanishing'){
   await cast();const counter=op.kind==='mechanic-fading'?'fade':'time';assert.equal(source.counters[counter]||0,op.n||0);
   if(!op.n&&counter==='time')game.addCounters(source,'time',1);
   const n=source.counters[counter]||0;if(n)game.removeCounters(source,counter,n);
   if(counter==='fade'){await h.resolveAll(game);assert.equal(source.zone,'battlefield');await game.emit('upkeep',{player:a});}
   await h.resolveAll(game);assert.notEqual(source.zone,'battlefield',entry.raw.name+': duration sacrifice resolves');return 3;
 }
 if(op.kind==='mechanic-cumulative-upkeep'){
   await cast();const before=Object.values(a.pool).reduce((sum,n)=>sum+n,0);await game.emit('upkeep',{player:a});await h.resolveAll(game);assert.equal(source.counters.age,1);assert.equal(source.zone,'battlefield');if(op.cost!=='{0}')assert.ok(Object.values(a.pool).reduce((sum,n)=>sum+n,0)<before);
   for(const color of Object.keys(a.pool))a.pool[color]=0;
   if(op.cost==='{0}')a.controller=h.decision({chooseOption:()=> 'no'});
   await game.emit('upkeep',{player:a});await h.resolveAll(game);assert.notEqual(source.zone,'battlefield',entry.raw.name+': unpaid cumulative upkeep sacrifices');return 3;
 }
 if(op.kind==='mechanic-buyback'){
   await cast();assert.equal(source.castMeta.alt.buybackPaid,true,entry.raw.name+': buyback actually paid');assert.equal(source.zone,'hand');return 2;
 }
 if(op.kind==='mechanic-split-second'){
   assert.equal(await game.castSpell(a,source,{from:'hand'}),true);assert.equal(game.hasSplitSecond(),true);const response=h.zoneCard(MTG,b,'Opt','hand');assert.equal(game.canCastTiming(b,response),false);assert.equal(await game.castSpell(b,response,{from:'hand'}),false);await h.resolveAll(game);assert.equal(game.hasSplitSecond(),false);return 3;
 }
 if(op.kind==='mechanic-ward-v8'){
   // Ward is proved on the real targeting path: an opponent's printed removal
   // spell locks the target, the ward trigger reaches the Stack above it, and
   // the printed payment either resolves the spell or counters it.
   const warded=h.permanent(MTG,game,b,entry.raw.name);
   game.recalc();
   const cost=warded.cur.wardCost;
   assert.ok(cost,entry.raw.name+': printed ward is live on the battlefield');
   if(op.payment.kind==='life')assert.equal(cost.life,op.payment.n,entry.raw.name+': exact printed life payment');
   else assert.equal(cost.discard,op.payment.n,entry.raw.name+': exact printed discard payment');
   const decide=a.controller.decide.bind(a.controller);
   a.controller.decide=async(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(warded)?[warded]:decide(g,q);
   const attempt=async target=>{
     const removal=h.zoneCard(MTG,a,'Beast Within','hand');
     // Fill only the mana pool: the shared fund helper also restores life,
     // which would erase the deliberately unpayable ward scenario below.
     for(const color of ['W','U','B','R','G','C'])a.pool[color]=20;
     assert.equal(await game.castSpell(a,removal,{from:'hand'}),true,entry.raw.name+': printed removal targets the warded permanent');
     const spell=game.stack.find(row=>row.card===removal);
     assert.ok(spell&&[spell.targets].flat(2).includes(target),entry.raw.name+': the warded permanent is the locked target');
     await game.flushTriggers();
     assert.ok(game.stack.some(row=>row.kind==='trigger'&&row.srcCard===target),entry.raw.name+': ward reaches the Stack above the spell');
     await h.resolveAll(game);
     return removal;
   };
   // 1. the payment is affordable: it is actually paid and the spell resolves.
   const lifeBefore=a.life,handBefore=a.hand.length;
   if(op.payment.kind==='discard')h.zoneCard(MTG,a,'Forest','hand');
   await attempt(warded);
   if(op.payment.kind==='life')assert.equal(a.life,lifeBefore-op.payment.n,entry.raw.name+': the printed life is actually paid');
   else assert.ok(a.graveyard.length>0&&a.hand.length<=handBefore,entry.raw.name+': the printed card is actually discarded');
   assert.notEqual(warded.zone,'battlefield',entry.raw.name+': the paid spell resolves against the warded permanent');
   // 2. the payment is impossible: ward counters the spell instead.
   const second=h.permanent(MTG,game,b,entry.raw.name);
   game.recalc();
   a.controller.decide=async(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(second)?[second]:decide(g,q);
   if(op.payment.kind==='life')a.life=op.payment.n-1;else for(const card of a.hand.slice())await game.move(card,'graveyard');
   const blocked=await attempt(second);
   assert.equal(second.zone,'battlefield',entry.raw.name+': an unpayable ward counters the spell');
   assert.equal(blocked.zone,'graveyard',entry.raw.name+': the countered spell is put into the graveyard');
   return 6;
 }
 if(op.kind==='mechanic-harmonize-v8'){
   // Harmonize casts from the graveyard for its own cost, may tap one creature
   // to reduce it, and exiles the spell instead of returning it.
   const reducer=h.permanent(MTG,game,a,h.fixtureDefinition('Harmonize reducer',['Creature'],{power:'2',toughness:'20'}));
   reducer.sick=false;game.recalc();
   await game.move(source,'graveyard');
   assert.equal(game.castableList(a).some(row=>row.card===source&&!row.alt),false,entry.raw.name+': no ordinary graveyard cast');
   const offer=game.castableList(a).find(row=>row.card===source&&row.alt?.harmonize);
   assert.ok(offer,entry.raw.name+': harmonize offers the graveyard cast');
   assert.equal(await game.castSpell(a,source,{from:'graveyard',alt:offer.alt}),true,entry.raw.name+': harmonize cast is paid');
   const object=game.stack.find(row=>row.card===source);
   assert.ok(object,entry.raw.name+': harmonize spell uses the Stack');
   if(object.harmonizeCreature){
     assert.equal(object.harmonizeCreature.tapped,true,entry.raw.name+': the reducing creature is actually tapped');
     assert.equal(object.harmonizeCreature.ctrl,a,entry.raw.name+': only a controlled creature reduces the cost');
   }
   await h.resolveAll(game);
   assert.equal(source.zone,'exile',entry.raw.name+': harmonize exiles the spell instead of the graveyard');
   return 5;
 }
 if(op.kind==='mechanic-jump-start'){
   await game.move(source,'graveyard');const hand=a.hand.length;const row=game.castableList(a).find(row=>row.card===source&&row.alt?.jumpstart);assert.ok(row);assert.equal(await game.castSpell(a,source,{from:'graveyard',alt:row.alt}),true);assert.equal(a.hand.length,hand-1);await h.resolveAll(game);assert.equal(source.zone,'exile');assert.equal(source.castMeta.alt.jumpstart,true);return 3;
 }
 if(op.kind==='mechanic-madness'){
   await game.discard(a,[source],{noReplacement:true});assert.equal(source.zone,'exile',entry.raw.name+': madness replaces even a cost discard');
   await game.flushTriggers();const trigger=game.stack.find(row=>row.srcCard===source&&row.kind==='trigger');assert.ok(trigger,entry.raw.name+': madness uses Stack');
   const manaBefore=Object.values(a.pool).reduce((x,y)=>x+y,0);
   await h.resolveAll(game);assert.equal(source.castMeta?.alt?.madness,true,entry.raw.name+': actual alternative cast');assert.equal(source.castMeta.from,'exile');
   assert.notEqual(source.zone,'exile');if(op.cost!=='{0}')assert.ok(Object.values(a.pool).reduce((x,y)=>x+y,0)<manaBefore,entry.raw.name+': madness mana paid');return 4;
 }
 if(op.kind==='mechanic-surge'||op.kind==='mechanic-spectacle'){
   const kind=op.kind.slice(9),definition=source.def.altCosts.find(alt=>alt[kind]);assert.ok(definition);
   assert.equal(await game.castSpell(a,source,{from:'hand',alt:definition}),false,entry.raw.name+': inactive alternate cost rejected');
   if(kind==='surge')a.turnState.spellsCast=1;else await game.loseLife(b,1,'spectacle test');
   const offer=game.castableList(a).find(row=>row.card===source&&row.alt?.[kind]);assert.ok(offer);
   const before=Object.values(a.pool).reduce((x,y)=>x+y,0);assert.equal(await game.castSpell(a,source,{from:'hand',alt:offer.alt}),true);assert.ok(Object.values(a.pool).reduce((x,y)=>x+y,0)<before);await h.resolveAll(game);return 3;
 }
 if(op.kind==='mechanic-dredge'){
   await game.move(source,'graveyard');
   if(role==='human'){const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.aiHint?.kind==='dredge'?'dredge:'+source.iid:decide(g,q);}
   const n=a.library.length;await game.draw(a,1);assert.equal(source.zone,'hand',entry.raw.name+': dredge returns exact card');assert.equal(a.library.length,n-op.n);return 2;
 }
 if(op.kind==='mechanic-plot'){
   const action=game.activatableList(a).find(row=>row.card===source&&row.plot);assert.ok(action,entry.raw.name+': plot offered');
   assert.equal(await game.activateAbility(a,action),true);assert.equal(source.zone,'exile');
   assert.equal(game.castableList(a).some(row=>row.card===source),false,entry.raw.name+': no plotted cast on same turn');
   game.turnNo++;const offer=game.castableList(a).find(row=>row.card===source&&row.alt?.plotPlay);assert.ok(offer,entry.raw.name+': plotted cast on later turn');
   assert.equal(await game.castSpell(a,source,{from:'exile',alt:offer.alt}),true);await h.resolveAll(game);return 4;
 }
 if(op.kind==='mechanic-dash'){
   const offer=game.castableList(a).find(row=>row.card===source&&row.alt?.dash);assert.ok(offer);
   assert.equal(await game.castSpell(a,source,{from:'hand',alt:offer.alt}),true);await h.resolveAll(game);
   assert.equal(source.kw('haste'),true);await game.emit('endStep',{player:a});await h.resolveAll(game);assert.equal(source.zone,'hand');return 3;
 }
 if(op.kind==='mechanic-echo'){
   await cast();assert.equal(source.meta.oracleEchoPending,true);
   await game.emit('upkeep',{player:a});await h.resolveAll(game);assert.equal(source.meta.oracleEchoPending,false);
   assert.ok(source.zone==='battlefield'||source.zone==='graveyard');
   if(source.zone==='battlefield'){assert.equal(source.counters.echo,undefined);await game.emit('upkeep',{player:a});assert.equal(game.pendingTriggers.some(row=>String(row.name).startsWith('Echo')),false);}
   return 3;
 }
 if(op.kind==='mechanic-devour'){
   h.permanent(MTG,game,a,h.fixtureDefinition('Devour fodder',['Creature'],{power:'0',toughness:'1'}));
   h.permanent(MTG,game,a,h.fixtureDefinition('Devour fodder 2',['Creature'],{power:'0',toughness:'1'}));
   await cast();assert.ok(source.meta.oracleDevoured>=0);assert.equal(source.counters['+1/+1']||0,source.meta.oracleDevoured*op.n);return 2;
 }
 if(op.kind==='mechanic-graft'){
   await cast();const before=source.counters['+1/+1'];assert.ok(before>=op.n);
   const target=new MTG.CardInst(MTG.DEFS['Grizzly Bears'],a);target.zone='nowhere';await game.move(target,'battlefield',{ctrl:a});await h.resolveAll(game);
   assert.equal(target.counters['+1/+1'],1);assert.equal(source.counters['+1/+1']||0,before-1);return 3;
 }
 if(op.kind==='mechanic-escape'){
   const fodder=Array.from({length:op.n},()=>h.zoneCard(MTG,a,'Forest','graveyard'));
   const option=game.castableList(a).find(row=>row.card===source&&row.alt?.escape);assert.ok(option,entry.raw.name+': escape offered');
   const prior=Object.values(a.pool).reduce((x,y)=>x+y,0);
   assert.equal(await game.castSpell(a,source,{from:'graveyard',alt:option.alt,xVal:3}),true);
   assert.equal(fodder.filter(card=>card.zone==='exile').length,op.n);assert.equal(source.zone,'stack');
   assert.ok(Object.values(a.pool).reduce((x,y)=>x+y,0)<prior);await h.resolveAll(game);return 4;
 }
 if(op.kind==='mechanic-kicker'||op.kind==='mechanic-multikicker'){
   const prior=Object.values(a.pool).reduce((x,y)=>x+y,0);
   assert.equal(await game.castSpell(a,source,{from:'hand',xVal:3}),true);
   const object=game.stack.find(row=>row.card===source);assert.ok(object);
   if(op.kind==='mechanic-kicker')assert.equal(object.kicked,true,entry.raw.name+': kicker paid');
   else assert.ok(source.castMeta.paidTimes>0,entry.raw.name+': multikicker payment count');
   assert.ok(Object.values(a.pool).reduce((x,y)=>x+y,0)<prior);await h.resolveAll(game);return 3;
 }
 if(op.kind==='mechanic-additional-costs'){
   const prior={hand:a.hand.filter(card=>card!==source),life:a.life,battlefield:game.bf().slice()};
   assert.equal(await game.castSpell(a,source,{from:'hand',xVal:3}),true);assert.equal(source.zone,'stack');
   const paid=cost=>cost.kind==='exileGraveyard'?additionalFixtures.filter(card=>card.zone==='exile').length>=cost.quantity.min:cost.kind==='sacrifice'?prior.battlefield.filter(card=>['graveyard','ceased'].includes(card.zone)&&(!cost.object.types||cost.object.types.some(type=>card.is(type)))).length>=cost.quantity.min:cost.kind==='discard'?prior.hand.filter(card=>card.zone==='graveyard').length>=cost.quantity.min:cost.kind==='payLife'?a.life<prior.life:cost.kind==='choice'?cost.options.some(paid):cost.kind==='sequence'?cost.costs.every(paid):false;
   assert.ok(op.costs.every(paid),entry.raw.name+': every mandatory additional cost is paid before resolution');await h.resolveAll(game);return 3;
 }
 if(op.kind==='mechanic-player-hexproof'){
   await cast();const spell=h.zoneCard(MTG,b,'Doom Blade','hand');assert.equal(game.legalTargets({what:'player',zone:'player'},spell,b).includes(a),false,entry.raw.name+': opponent cannot target player');assert.equal(game.legalTargets({what:'player',zone:'player'},source,a).includes(a),true,entry.raw.name+': own player remains legal');await game.move(source,'exile');assert.equal(game.legalTargets({what:'player',zone:'player'},spell,b).includes(a),true);return 3;
 }
 if(op.kind==='mechanic-additional-land'){
   await cast();assert.equal(game.landPlayLimit(a),1+op.n);const lands=[];for(let i=0;i<op.n+2;i++)lands.push(h.zoneCard(MTG,a,'Forest','hand'));for(let i=0;i<op.n+1;i++){assert.equal(await game.playLand(a,lands[i]),true);await h.resolveAll(game);}assert.equal(await game.playLand(a,lands.at(-1)),false,entry.raw.name+': allowance exhausted');await game.move(source,'exile');assert.equal(game.landPlayLimit(a),1);return op.n+3;
 }
 if(op.kind==='mechanic-no-max-hand'){
   await cast();while(a.hand.length<12)h.zoneCard(MTG,a,'Forest','hand');
   game.mainPhase=async()=>{};game.combatPhase=async()=>{};await game.runTurn();
   assert.ok(a.hand.length>7,entry.raw.name+': cleanup keeps cards beyond seven');return 2;
 }
 if(op.kind==='mechanic-evoke'){
   const option=game.castableList(a).find(row=>row.card===source&&row.alt?.evoke);assert.ok(option,entry.raw.name+': evoke offered');
   const prior=Object.values(a.pool).reduce((x,y)=>x+y,0);
   assert.equal(await game.castSpell(a,source,{from:'hand',alt:option.alt}),true,entry.raw.name+': paid evoke cast');
   assert.ok(Object.values(a.pool).reduce((x,y)=>x+y,0)<prior,entry.raw.name+': evoke mana paid');
   let sacrificed=false;const sacrifice=game.sacrifice;
   game.sacrifice=async function(p,card,...rest){if(card===source)sacrificed=true;return sacrifice.call(this,p,card,...rest);};
   await h.resolveAll(game);assert.equal(sacrificed,true,entry.raw.name+': evoke sacrifice resolved');
   sacrificed=false;await game.move(source,'hand');await cast();assert.equal(sacrificed,false,entry.raw.name+': normal cast does not evoke-sacrifice');
   return 3;
 }
 if(['mechanic-unearth','mechanic-grave-return-self','mechanic-embalm','mechanic-eternalize'].includes(op.kind)){
   const beforeMana=Object.values(a.pool).reduce((x,y)=>x+y,0);
   const action=game.activatableList(a).find(row=>row.card===source&&row.gyAbility);assert.ok(action,entry.raw.name+': graveyard activation available');
   assert.equal(await game.activateAbility(a,action),true,entry.raw.name+': graveyard activation');
   assert.ok(game.stack.some(row=>row.kind==='ability'&&(row.srcCard===source||row.ctx?.src===source)),entry.raw.name+': graveyard ability uses Stack');
   if(op.cost!=='{0}')assert.ok(Object.values(a.pool).reduce((x,y)=>x+y,0)<beforeMana,entry.raw.name+': mana cost paid');
   if(op.kind==='mechanic-unearth'){
     await game.resolveTop();
     assert.equal(source.zone,'battlefield',entry.raw.name+': unearth returns before ETB triggers resolve');
     assert.equal(source.kw('haste'),true,entry.raw.name+': returned object has haste');
     // Independent ETB triggers may sacrifice the returned card. Check its
     // entry now, then check the replacement or end-step exile below.
   }
   await h.resolveAll(game);
   if(op.kind==='mechanic-grave-return-self')assert.equal(source.zone,'hand');
   else if(op.kind==='mechanic-unearth'){
     if(source.zone==='battlefield'){assert.equal(source.kw('haste'),true);await game.emit('endStep',{player:a});await h.resolveAll(game);}
     assert.equal(source.zone,'exile',entry.raw.name+': unearth exile or leave replacement');
   }else{
     assert.equal(source.zone,'exile');const token=game.creatures(a).find(c=>c.isToken&&c.name===source.name);assert.ok(token,entry.raw.name+': token copy');
     assert.equal(token.hasSub('Zombie'),true);assert.deepEqual([...token.colors],op.kind==='mechanic-embalm'?['W']:['B']);assert.equal(token.def.cost,'');
     if(op.kind==='mechanic-eternalize'){assert.equal(token.def.power,'4');assert.equal(token.def.toughness,'4');}
   }return 4;
 }
 if(op.kind==='mechanic-foretell'){
   const action=game.activatableList(a).find(row=>row.card===source&&row.foretell);assert.ok(action,entry.raw.name+': foretell available');assert.equal(await game.activateAbility(a,action),true);
   assert.equal(source.zone,'exile');assert.equal(source.faceDown,true);assert.equal(game.castableList(a).some(row=>row.card===source),false);
   game.turnNo++;
   if(entry.implementation.some(o=>o.kind==='spell-counter'))await h.stageSpellV4Target(MTG,ctx,{name:entry.raw.name},{kind:'spell',zone:'stack',quantity:{min:1,max:1}},{kind:'counterSpell',targetIds:[]},'Instant',0);
   const option=game.castableList(a).find(row=>row.card===source&&row.alt?.foretell);assert.ok(option,entry.raw.name+': later foretell cast');assert.equal(option.alt.altCostStr,op.cost);
   assert.equal(await game.castSpell(a,source,{from:'exile',alt:option.alt,xVal:3}),true);await h.resolveAll(game);assert.equal(source.faceDown,false);assert.notEqual(source.zone,'exile');return 4;
 }
 if(op.kind==='mechanic-retrace'){
   const lands=a.hand.slice();const option=game.castableList(a).find(row=>row.card===source&&row.alt?.retrace);assert.ok(option,entry.raw.name+': retrace cast offered');
   assert.equal(await game.castSpell(a,source,{from:'graveyard',alt:option.alt,xVal:3}),true);assert.ok(lands.some(c=>c.zone==='graveyard'),entry.raw.name+': land discarded as cost');
   await h.resolveAll(game);assert.equal(source.zone,'graveyard');return 3;
 }
 if(op.kind==='mechanic-ninjutsu'){
   const attacker=h.permanent(MTG,game,a,h.fixtureDefinition('V5 unblocked attacker',['Creature'],{power:'2',toughness:'20'}));attacker.attacking=b;attacker.wasBlocked=false;
   game.combat={attackers:[attacker],defenders:new Map()};game.phase='combat';game.step='blockers';
   const action=game.activatableList(a).find(row=>row.card===source&&row.ninjutsu);assert.ok(action,entry.raw.name+': ninjutsu offered');assert.equal(await game.activateAbility(a,action),true);
   assert.equal(attacker.zone,'hand');await h.resolveAll(game);assert.equal(source.zone,'battlefield');assert.equal(source.tapped,true);assert.equal(source.attacking,b);return 4;
 }
 if(op.kind==='mechanic-soulshift'){
   const def=h.fixtureDefinition('V5 Spirit to return',['Creature'],{cost:'{0}',subtypes:['Spirit'],power:'1',toughness:'1'});const spirit=new MTG.CardInst(def,a);spirit.zone='graveyard';a.graveyard.push(spirit);
   await cast();await game.move(source,'graveyard');await h.resolveAll(game);assert.equal(spirit.zone,'hand',entry.raw.name+': Soulshift legal Spirit returns');return 2;
 }
 if(op.kind==='mechanic-modular'){
   await cast();const count=source.counters['+1/+1']||0;assert.ok(count>=op.n,entry.raw.name+': modular entry counters');
   const receiver=h.permanent(MTG,game,a,h.fixtureDefinition('V5 Modular recipient',['Artifact','Creature'],{power:'10',toughness:'20'}));
   await game.move(source,'graveyard');await h.resolveAll(game);assert.equal(receiver.counters['+1/+1'],count,entry.raw.name+': modular LKI counters');return 2;
 }
 await cast();
 if(op.kind==='mechanic-fabricate')assert.ok((source.counters['+1/+1']||0)>=op.n||game.creatures(a).filter(c=>c.isToken&&c.hasSub('Servo')).length>=op.n,entry.raw.name+': fabricate outcome');
 else if(op.kind==='mechanic-living-weapon'||op.kind==='mechanic-for-mirrodin'){
   const token=game.byIid(source.attachedTo);assert.ok(token?.isToken,entry.raw.name+': equipment attached to token');assert.equal(token.hasSub(op.kind==='mechanic-living-weapon'?'Germ':'Rebel'),true);
 }else if(op.kind==='mechanic-offspring'){
   assert.ok(game.creatures(a).some(c=>c!==source&&c.isToken&&c.name===source.name&&String(c.def.power)==='1'&&String(c.def.toughness)==='1'),entry.raw.name+': offspring 1/1 copy');
 }else if(op.kind==='mechanic-afflict'){
   const life=b.life;source.attacking=b;await game.emit('becomesBlocked',{attacker:source,blockers:[h.permanent(MTG,game,b,'Grizzly Bears')]});await h.resolveAll(game);assert.equal(b.life,life-op.n);
 }else if(op.kind==='mechanic-ingest'){
   const card=b.library.at(-1);await game.damagePlayer(source,b,1,{combat:true});await game.emit('combatDamageToPlayer',{card:source,player:b,n:1,step:'normal'});await h.resolveAll(game);assert.equal(card.zone,'exile');
 }else if(op.kind==='doesnt-untap'){
   source.tapped=true;const stop=Symbol('stop after real untap');const emit=game.emit;
   game.emit=async function(event,...args){if(event==='upkeep')throw stop;return emit.call(this,event,...args);};
   try{await game.runTurn();assert.fail('Expected upkeep boundary');}catch(error){if(error!==stop)throw error;}finally{game.emit=emit;}
   assert.equal(source.tapped,true,entry.raw.name+': normal untap prohibited');
 }else assert.fail('Missing mechanic driver '+op.kind);
 return 2;
}
