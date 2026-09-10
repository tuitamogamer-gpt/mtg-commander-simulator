// Object identity, entry replacements and emblem actions for Commander 2014.
'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
  const M=MTG,G=M.Game.prototype,C=M.C21;
  const live=c=>c.zone==='battlefield'&&!c.phasedOut&&!c.cur?.abilitiesDisabled;
  const flat=xs=>[xs].flat(Infinity).filter(Boolean);
  const opponents=ctx=>ctx.you.opponents(ctx.g);
  const controlledCommander=(g,p)=>g.bf().some(c=>c.ctrl===p&&c.owner===p&&c.commander);
  const currentDeath=ctx=>ctx.data.card.zone==='graveyard'&&ctx.data.card.zoneVersion===ctx.data.graveyardZoneVersion;
  const effectOn=(ctx,c,apply)=>{const r=C.row(c);ctx.g.untilEffects.push({kind:'c14ObjectEffect',expires:'eot',apply:(g,bf)=>{if(C.current(r)&&bf.includes(c))apply(g,c);}});ctx.g.recalc();};
  const control=(g,c,p,temporary=true)=>{M.OracleV8Control.gain(g,c,p,{temporary});g.recalc();};
  const faceDown=(g,c)=>{if(c.faceDown)return;c.meta.faceDownDef=c.def;c.meta.faceDownKind='c14FaceDown';c.faceDown=true;
    c.def={name:'Face-down creature',cost:null,types:['Creature'],super:[],subtypes:[],power:'2',toughness:'2',oracle:'',kws:[],rulesNoName:true};};
  async function skipUntap(g,p){p.c14SkipUntaps=(p.c14SkipUntaps||0)+1;}
  async function returnDeath(ctx,p=ctx.you){if(currentDeath(ctx))await ctx.g.move(ctx.data.card,'battlefield',{ctrl:p});}
  async function offering(ctx,action,prompt){const p=await C.choosePlayer(ctx,opponents(ctx),prompt);await action(ctx.you);if(p)await action(p);}
  async function sacrificeAll(ctx,cards){const by=ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you),rows=cards.filter(c=>ctx.g.canSacrifice(c)).map(card=>({card,ctrl:card.ctrl,snap:ctx.g.snapshot(card)}));
    const prior=ctx.g._simultaneousLeaveSources;ctx.g._simultaneousLeaveSources=[...(prior||[]),...rows];const paid=[];
    try{await ctx.g.withGraveyardEntryBatch(async()=>{for(const p of by)for(const r of rows.filter(r=>r.ctrl===p))if(await ctx.g.sacrifice(p,r.card))paid.push(r);});}
    finally{ctx.g._simultaneousLeaveSources=prior;M.StateTriggers?.settle(ctx.g);await ctx.g.returnOracleExiles();}return paid;
  }
  const oldFaceCosts=G.faceUpCosts;
  G.faceUpCosts=function(c){const costs=oldFaceCosts.call(this,c);return c.meta?.faceDownKind==='c14FaceDown'?costs.filter(x=>x.kind!=='mana cost'):costs;};
  G.c14LoyaltyInstant=function(p,c,a){return a?.loyalty!==undefined&&c.is('Planeswalker')&&c.ctrl===p&&p.emblems.some(e=>e.c14Teferi);};
  G.canLoseGame=function(p){return !this.bf().some(c=>live(c)&&c.def.c14Persecutor&&c.ctrl!==p);};
  G.canWinGame=function(p){return !this.bf().some(c=>live(c)&&c.def.c14Persecutor&&c.ctrl===p);};
  const canSacrifice=G.canSacrifice;
  G.canSacrifice=function(c){return !c.cur?.c14CantSacrifice&&canSacrifice.call(this,c);};
  const canAttack=G.canAttackTarget;
  G.canAttackTarget=function(c,t){const defender=t instanceof M.Player?t:t?.is?.('Planeswalker')?t.ctrl:null;
    if(defender&&(c.cur?.c14CannotAttack||[]).includes(defender))return false;return canAttack.call(this,c,t);};
  const recalc=G.recalc;
  G.recalc=function(){const result=recalc.call(this);for(const e of this.untilEffects||[])if(e.kind==='c14Lighthouse')for(const r of e.rows)if(C.current(r)){
    r.card.cur.kw.delete('hexproof');r.card.cur.kw.delete('shroud');r.card.cur.hexproof=false;r.card.cur.shroud=false;
  }for(const c of this.bf())if(c.meta.c14SuspendHaste!==undefined){if(c.ctrl.idx!==c.meta.c14SuspendHaste)delete c.meta.c14SuspendHaste;else c.cur.kw.add('haste');}return result;};
  const emit=G.emit;
  G.emit=async function(name,data){
    if((name==='dealtDamage'||name==='damageToPlayer')&&data.n>0){if(this.c14DamageTurn!==this.turnNo){this.c14DamageTurn=this.turnNo;this.c14GreatestDamage=0;}this.c14GreatestDamage=Math.max(this.c14GreatestDamage||0,data.n);}
    if(name==='lto'&&data.card.zone==='graveyard')data.card.meta.c14GraveEntry={version:data.card.zoneVersion,turn:this.turnNo};
    return emit.call(this,name,data);
  };
  const prohibitedAbility=(g,p,c)=>g.bf().some(s=>live(s)&&s.def.c14Abolisher&&s.ctrl!==p&&g.turnPlayer===s.ctrl)&&['Artifact','Creature','Enchantment'].some(t=>c?.is?.(t));
  const manaSources=G.manaSources,activateMana=G.activateManaSource;
  G.manaSources=function(p,...args){return manaSources.call(this,p,...args).filter(e=>!e.card||!prohibitedAbility(this,p,e.card)).map(s=>{
    if(!s.card?.is('Land'))return s;
    const hooks=this.bf().filter(c=>live(c)&&c.ctrl===p&&(c.def.c14Sun||c.def.c14Ghast));if(!hooks.length)return s;
    const bases=s.produce.flatMap(o=>o.ANY?['W','U','B','R','G'].map(color=>({[color]:o.n||1})): [o]);
    const produce=bases.map(o=>{const next={...o};for(const c of hooks){if(c.def.c14Ghast&&s.card.hasSub('Swamp'))next.B=(next.B||0)+1;if(c.def.c14Sun&&o[c.meta.c14Color]>0)next[c.meta.c14Color]++;}return next;});
    return {...s,produce,c14BaseMana:bases};
  });};
  G.activateManaSource=function(p,s,chosen,...args){
    if(s.card&&prohibitedAbility(this,p,s.card))return Promise.resolve(false);
    if(s.c14BaseMana){const i=s.produce.findIndex(o=>['W','U','B','R','G','C','ANY','n'].every(k=>o[k]===chosen?.[k]));if(i<0)return Promise.resolve(false);chosen=s.c14BaseMana[i];s={...s,produce:s.c14BaseMana};}
    return activateMana.call(this,p,s,chosen,...args);
  };
  const castSpell=G.castSpell;
  G.castSpell=function(p,c,...args){if(this.bf().some(s=>live(s)&&s.def.c14Abolisher&&s.ctrl!==p&&this.turnPlayer===s.ctrl))return Promise.resolve(false);return castSpell.call(this,p,c,...args);};
  const activatable=G.activatableList,activate=G.activateAbility;
  G.activatableList=function(p,...args){const out=activatable.call(this,p,...args).filter(e=>e.turnFaceUp||!prohibitedAbility(this,p,e.card));
    if(!this.hasSplitSecond()&&!p.lost)for(const emblem of p.emblems)if(emblem.c14Ob&&this.creatures(p).some(c=>this.canSacrifice(c))&&this.canPayMana(p,M.parseCost('{1}{B}'),{card:emblem.source,isAbility:true}))out.push({card:emblem.source,ability:emblem.source.def.abilities[0],idx:0,c14Emblem:emblem});
    return out;
  };
  G.activateAbility=async function(p,entry,...args){
    if(!entry.turnFaceUp&&prohibitedAbility(this,p,entry.card))return false;
    if(!entry.c14Emblem)return activate.call(this,p,entry,...args);
    const emblem=entry.c14Emblem;if(!p.emblems.includes(emblem)||!emblem.c14Ob||entry.card!==emblem.source||entry.ability!==emblem.source.def.abilities[0]||p.lost||this.hasSplitSecond())return false;
    const pool=this.creatures(p).filter(c=>this.canSacrifice(c)),locks=new Map(pool.map(c=>[c,c.zoneVersion]));
    const [chosen]=await C.choose(this,p,pool,1,1,emblem.name+': sacrifice a creature','sacCost');if(!chosen)return false;
    if(chosen.zone!=='battlefield'||chosen.ctrl!==p||chosen.zoneVersion!==locks.get(chosen)||!this.canSacrifice(chosen))return false;
    if(!await this.payMana(p,M.parseCost('{1}{B}'),{card:entry.card,isAbility:true},{protectedSacrifices:[chosen]}))return false;
    const power=Math.max(0,chosen.power);if(!await this.sacrifice(p,chosen))return false;
    const ctx={g:this,src:entry.card,you:p,targets:[],x:power,isActivatedAbility:true,ability:entry.ability};
    const so={kind:'ability',name:emblem.name,ctrl:p,ctx,run:entry.ability.run,targets:[],srcCard:entry.card,targetSpecs:[],targetIdentities:[]};
    this.markAbilityActivated(p,entry.card,false,{targets:[]});this.stack.push(so);this.lg(p.name+' activates '+emblem.name+'.','activate');
    await this.emit('abilityActivated',{player:p,card:entry.card,isMana:false,ability:entry.ability,targets:[],stackObject:so});this.note('stack',{});await this.flushTriggers();await this.priorityRound(p);return true;
  };
  function obEmblem(ctx){const name='Ob Nixilis of the Black Oath emblem';const ability={label:'{1}{B}, sacrifice a creature: gain life and draw equal to its power',cost:{mana:'{1}{B}',sacCreature:true},run:async c=>{await c.g.gainLife(c.you,c.x);await c.g.draw(c.you,c.x);},aiScore:()=>4};
    const source=new M.CardInst({name,cost:null,types:[],subtypes:[],super:[],oracle:ability.label,abilities:[ability],kws:[]},ctx.you);source.zone='emblem';source.ctrl=ctx.you;source.cur={types:[],subtypes:[],kw:new Set(),extraAbilities:[],extraMana:[]};
    ctx.you.emblems.push({name,c14Ob:true,source});
  }
  async function entry(g,card,opts){
    if(card.isToken)return {opts};const bf=g._battlefieldEntryReplacementSnapshot||g.bf(),p=opts.ctrl||card.owner;
    let def=card.def;const reflections=bf.filter(c=>c!==card&&live(c)&&c.ctrl===p&&c.def.c14Reflection&&c.attachedTo&&g.byIid(c.attachedTo)?.zone==='battlefield');
    if(def.types.includes('Creature')&&reflections.length){let aura=reflections[0];if(reflections.length>1){const [picked]=await C.choose(g,p,reflections,1,1,'Choose an Infinite Reflection entry effect');aura=picked;}
      def=M.OracleV8Faces.copyTokenDefinition(g.byIid(aura.attachedTo));opts={...opts,c14EntryCopy:def};}
    const cast=card.zone==='stack'&&!!card.castMeta;
    if(!cast&&def.types.includes('Creature')&&bf.some(c=>c!==card&&live(c)&&c.def.c14Priest))return {opts,toZone:'exile'};
    return {opts};
  }
  async function removeSuspend(ctx,c){const version=c.zoneVersion;if(c.zone!=='exile'||!(c.meta.suspended>0))return;
    if(M.CWW){M.CWW.syncTime(c);ctx.g.removeCounters(c,'time',1);return;}
    c.meta.suspended--;ctx.g.lg(c.name+': suspend '+c.meta.suspended+' remaining.');
    if(c.meta.suspended===0)ctx.g.queueTrigger({src:c,ctrl:c.owner,name:'Suspend: cast '+c.name,run:async next=>{
      if(c.zone!=='exile'||c.zoneVersion!==version)return;
      if(await C.option(next,[{key:'yes',label:'Cast without paying mana'},{key:'no',label:'Leave in exile'}],'cast suspended card',c.owner,'freeCast')==='yes')await next.g.castSpell(c.owner,c,{from:'exile',alt:{free:true,suspend:true}});
    }});
  }
  G.c14RetargetSingle=async function(so,chooser){
    if(!this.stack.includes(so)||flat(so.targets).length!==1)return false;
    const source=so.card||so.srcCard,previous=flat(so.targets)[0],specs=so.targetSpecs||this.spellTargetSpecs(source,so.castOpts,so.ctrl);
    if(!specs)return false;
    const ctx={g:this,src:source,you:so.ctrl,so,decisionPlayer:chooser,suppressTargetEvents:true,targetChoiceFilter:c=>c!==previous};
    if(!await this.pickTargets(ctx,specs.map(spec=>({...spec,chooseByOpponent:false})),source,so.ctrl))return false;
    so.targets=ctx.targets;so.targetIdentities=this.captureTargetIdentities(so.targets);if(so.ctx){so.ctx.targets=so.targets;so.ctx.targetIdentities=so.targetIdentities;}
    const target=flat(so.targets)[0];await this.emit('targeted',{card:target,byPlayer:so.ctrl,src:source,isSpell:so.kind==='spell',isActivatedAbility:so.kind==='ability',isTriggeredAbility:so.kind==='trigger',so});
    this.queueWardTriggers(so,ctx);if(so.damageDivision)for(const r of so.damageDivision){r.iid=target.iid;r.playerIdx=target instanceof M.Player?target.idx:null;}
    return true;
  };
  M.C14={...C,targetStackObjects:new WeakMap(),flat,live,opponents,controlledCommander,currentDeath,returnDeath,effectOn,control,faceDown,skipUntap,offering,sacrificeAll,obEmblem,entry,removeSuspend,
    damageMaximum:g=>g.c14DamageTurn===g.turnNo?g.c14GreatestDamage||0:0};
})();
