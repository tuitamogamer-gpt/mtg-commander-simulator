'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M=MTG,G=M.Game.prototype,C=M.ZK,E=M.E;
  const level=c=>c.meta.afcClassLevel||1;
  const ownGrave=(filter=()=>true,opts={})=>C.grave((g,c,p)=>c.owner===p&&filter(c),opts);
  const zombie=(decayed=false)=>({...C.token('Zombie',['Zombie'],2,2,['B'],decayed?['decayed']:[]),tokenImageName:decayed?'MIC Decayed Zombie':'Zombie'});
  G.rollDice=async function(player,sides,count=1,{ignore=0,source=null}={}){
    if(!this.players.includes(player)||!Number.isInteger(sides)||sides<2||!Number.isInteger(count)||count<0)throw Error('Invalid dice roll');
    if(!count)return [];
    const extra=this.bf().filter(c=>C.live(c)&&c.ctrl===player&&c.def.afcExtraDie).length;
    const raw=Array.from({length:count+extra},()=>1+Math.floor(this.rnd()*sides));
    const sorted=raw.slice().sort((a,b)=>a-b),results=sorted.slice(Math.min(ignore+extra,raw.length));
    this.lg(player.name+' rolls '+count+'d'+sides+': '+results.join(', ')+(extra+ignore?' (ignored '+sorted.slice(0,ignore+extra).join(', ')+')':''),'info');
    const data={player,source,sides,results,raw,ignored:sorted.slice(0,ignore+extra)};
    this.note('diceRolled',data);await this.emit('diceRolled',data);return results;
  };
  const roll=(ctx,sides,n=1,ignore=0)=>ctx.g.rollDice(ctx.you,sides,n,{ignore,source:ctx.src});
  async function pair(ctx,sides,first,second){const dice=await roll(ctx,sides,2);const key=await C.option(ctx,dice.map((n,i)=>({key:String(i),label:first+': '+n+'; '+second+': '+dice[1-i]})),'assign the two dice');return [dice[Number(key)],dice[1-Number(key)]];}
  async function sacrifice(ctx,p,filter,n=1,optional=false){const pool=ctx.g.bf().filter(c=>c.ctrl===p&&filter(c)&&ctx.g.canSacrifice(c));const cards=await C.choose(ctx.g,p,pool,optional?0:Math.min(n,pool.length),Math.min(n,pool.length),ctx.src.name+': sacrifice '+n+' permanent(s)','sacCost');return C.sacrificeAll(ctx,cards);}
  const classAbility=(cost,to,run)=>({label:'Level '+to+' — '+cost,cost:{mana:cost},sorcery:true,cond:(g,c)=>level(c)===to-1,run:async ctx=>{if(!C.same(ctx)||level(ctx.src)!==to-1)return;ctx.src.meta.afcClassLevel=to;ctx.g.recalc();await ctx.g.emit('afcClassLevel',{card:ctx.src,level:to});if(run)await run(ctx);},aiScore:()=>3});
  const basePT=(ctx,c,p,t,extra={})=>{if(extra.insect)ctx.g.addOracleAnimation(c,{power:p,toughness:t,types:['Creature'],subtypes:['Insect'],retainTypes:true,retainAllSubtypes:false,keywords:['flying'],temporary:true});else ctx.g.addOracleBasePT(c,{power:p,toughness:t,temporary:true});ctx.g.recalc();};
  const recalc=G.recalc;
  G.recalc=function(){const result=recalc.call(this);for(const c of this.bf())if(c.kw('decayed'))c.cur.cantBlock=true;return result;};
  const emit=G.emit;
  G.emit=async function(name,data){
    if(name==='attacks'&&data.card.kw('decayed'))C.delayed({g:this,src:data.card,you:data.card.ctrl},data.card,'sacrifice',{on:'endCombat'});
    if(name==='beginCombat')this.afcCombatId=(this.afcCombatId||0)+1;
    if(name==='blockersDeclared')data.player.turnState.afcBlockersDeclared=true;
    if(name==='cardToGraveyard')data.afcGraveVersion=data.card.zoneVersion;
    if(name==='cast'&&data.so){
      if(data.player.turnState.afcAvalanches){const n=data.player.turnState.afcAvalanches;delete data.player.turnState.afcAvalanches;for(let i=0;i<n;i++)this.queueTrigger({src:data.card,ctrl:data.player,name:'Ride the Avalanche: put '+data.mv+' counters on up to one creature',targets:[M.T.creature({count:1,min:0,upTo:true})],run:ctx=>{for(const c of C.flat(ctx.targets))ctx.g.addCounters(c,'+1/+1',data.mv,false,ctx.you);}});}
      const id=data.so.castOpts?.c1719Id,rows=(this.c1719Permissions||[]).filter(r=>r.afcSpoils&&r.id===id);if(rows.length)await M.AFC.spoilsPlayed(this,data.player,rows);
      if(data.so.from==='library'&&data.so.castOpts?.fromTop&&data.card.hasSub('Equipment')&&this.bf().some(c=>C.live(c)&&c.ctrl===data.player&&c.def.afcGalea))data.card.castMeta.afcGalea=true;
      if(data.so.from==='exile')data.afcExileOrdinal=(data.player.turnState.afcExileSpells=(data.player.turnState.afcExileSpells||0)+1);
    }
    if(name==='landPlayed'&&data.from==='exile'){const rows=(this.c1719Permissions||[]).filter(r=>r.afcSpoils&&r.player===data.player.idx&&r.card===data.card.iid&&r.version===data.card.zoneVersion-1);if(rows.length)await M.AFC.spoilsPlayed(this,data.player,rows);}
    if(name==='etb'&&data.card.castMeta?.afcGalea){const c=data.card;this.queueTrigger({src:c,ctrl:c.ctrl,targets:[M.T.yourCreature()],name:'Galea: attach the Equipment to your creature',run:ctx=>C.same(ctx)&&ctx.targets[0]&&ctx.g.attach(ctx.src,ctx.targets[0])});}
    return emit.call(this,name,data);
  };
  M.AFC={...C,level,ownGrave,zombie,roll,pair,sacrifice,classAbility,basePT,
    snapshotBlockers:g=>g.untilEffects.some(e=>e.kind?.startsWith('afc'))?['a temporary AFC effect']:[]};
  const A=M.AFC,S=M.StarterCasting;
  A.moveCards=async(ctx,cards,to)=>ctx.g.withGraveyardEntryBatch(async()=>{const others=cards.filter(c=>c.zone!=='graveyard').map(C.row);await ctx.g.moveGraveyardBatch(cards,to);for(const r of others)if(C.current(r))await ctx.g.move(r.card,to);});
  A.immediate=(ctx,cards,{free=true,filter=()=>true}={})=>M.OracleV8PlayPermissions.castOne(ctx,cards,{free,filter:{}},{target:()=>({filter:(g,so)=>filter(so,g)})});
  A.rooftopLive=(g,p,c,a)=>!a.faceDownCast&&!a.adventure&&g.castHasType(c,a,'Creature')&&(c.oracleFaces?M.OracleV8Faces.view(c,a.oracleFace):c).hasSub('Zombie')&&g.bf().some(s=>s.ctrl===p&&C.live(s)&&s.def.afcRooftop);
  const strip=a=>{if(!a?.afcRooftop)return a;const x={...a};delete x.afcRooftop;delete x.altCostStr;return x;};
  const allowed=S.allowed,validate=S.validate;
  S.allowed=(g,p,c,a)=>a?.afcRooftop&&(!A.rooftopLive(g,p,c,a)||a.altCostStr!=='{0}'||a.free)?false:allowed(g,p,c,strip(a));
  S.validate=ctx=>ctx.so.castOpts.afcRooftop?A.rooftopLive(ctx.g,ctx.you,ctx.src,ctx.so.castOpts)&&validate({...ctx,so:{...ctx.so,castOpts:strip(ctx.so.castOpts)}}):validate(ctx);
  M.TOKENS.afcDecayed=zombie(true);M.TOKENS.afcZombie=zombie(false);
  A.zombie=(decayed=false)=>decayed?M.TOKENS.afcDecayed:M.TOKENS.afcZombie;
})();
