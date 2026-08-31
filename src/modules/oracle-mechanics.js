// ===== oracle-mechanics.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});

// Closed runtime adapters for Oracle importer mechanic operations.  Every
// successful adapter installs an engine descriptor that participates in the
// normal rules path; unsupported or malformed operations return false.
(function () {
  const number = operation => Math.max(0, Number(operation.n) || 0);
  const push = (script, key, value) => { (script[key] || (script[key] = [])).push(value); };
  const keyword = (script, value) => {
    script.kws = script.kws || [];
    if (!script.kws.includes(value)) script.kws.push(value);
  };
  const chainAsEnters = (script, run) => {
    const previous = script.asEnters;
    script.asEnters = async (game, card) => {
      if (previous) await previous(game, card);
      await run(game, card);
    };
  };
  const addEtbPlusCounters = (script, amount) => {
    if (script.etbCounters && script.etbCounters.kind !== '+1/+1') return false;
    const previous = script.etbCounters && script.etbCounters.n;
    script.etbCounters = {
      kind: '+1/+1',
      n: (game, card) => {
        const before = typeof previous === 'function' ? previous(game, card) : Number(previous) || 0;
        const added = typeof amount === 'function' ? amount(game, card) : amount;
        return before + Math.max(0, Number(added) || 0);
      },
    };
    return true;
  };
  const aliveSource = ctx => ctx.src && ctx.src.zone === 'battlefield' &&
    ctx.src.zoneVersion === ctx.sourceZoneVersion && ctx.g.bf().includes(ctx.src);
  const objectIdentity = card => card && ({
    iid: card.iid, zoneVersion: card.zoneVersion, timestamp: card.timestamp,
  });
  const sameBattlefieldObject = (game, card, identity) => !!(card && identity &&
    card.iid === identity.iid && card.zoneVersion === identity.zoneVersion &&
    card.timestamp === identity.timestamp && card.zone === 'battlefield' && game.bf().includes(card));
  // Event data is also cloned by local-AI rollouts. A non-enumerable Symbol
  // sidecar travels with that clone, unlike a WeakMap keyed by live objects,
  // while staying out of serialized/public event payloads.
  const eventObjectCaptures = Symbol('oracleMechanicEventObjects');
  let nextCaptureId = 0;
  const captureTriggerObjects = (trigger, captureObjects) => {
    const captureId = ++nextCaptureId;
    const filter = trigger.filter;
    const run = trigger.run;
    const getCapture = (source, data) => data && data[eventObjectCaptures] &&
      data[eventObjectCaptures].get(captureId + ':' + source.iid);
    trigger.filter = (game, source, data) => {
      if (!data || filter && !filter(game, source, data)) return false;
      if (!data[eventObjectCaptures]) Object.defineProperty(data, eventObjectCaptures, { value: new Map() });
      data[eventObjectCaptures].set(captureId + ':' + source.iid, {
        source: objectIdentity(source), controller: source.ctrl,
        objects: captureObjects(game, source, data),
      });
      return true;
    };
    trigger.controller = (game, source, data) => getCapture(source, data)?.controller || source.ctrl;
    trigger.run = async ctx => {
      const capture = getCapture(ctx.src, ctx.data);
      if (!capture) throw new Error('Oracle mechanic lost its event-object capture');
      await run(ctx, capture);
    };
    return trigger;
  };
  const plusCounter = (game, card, n, by) => {
    if (!card || card.zone !== 'battlefield' || n <= 0) return;
    game.addCounters(card, '+1/+1', n, false, by);
  };
  const spiritToken = {
    name: 'Spirit', cost: null, super: [], types: ['Creature'], subtypes: ['Spirit'],
    power: '1', toughness: '1', colorsOverride: ['W', 'B'], kws: ['flying'],
    oracle: 'Flying', isTokenDef: true,
  };

  MTG.applyOracleMechanic = function (script, operation) {
    if (!script || !operation || typeof operation.kind !== 'string') return false;
    const kind = operation.kind.startsWith('mechanic-')
      ? operation.kind.slice('mechanic-'.length)
      : operation.kind;

    if(kind==='evoke') {
      push(script,'altCosts',{label:'Evoke '+operation.cost,altCostStr:operation.cost,evoke:true});
      return true;
    }
    if(kind==='surge'||kind==='spectacle'){
      push(script,'altCosts',{label:kind+' '+operation.cost,altCostStr:operation.cost,[kind]:true,cond:(game,p)=>kind==='surge'?p.turnState.spellsCast>0:game.alivePlayers().some(other=>other!==p&&other.turnState.lifeLost>0)});return true;
    }
    if(kind==='devour'){
      if(!addEtbPlusCounters(script,(game,card)=>(card.meta.oracleDevoured||0)*number(operation)))return false;
      chainAsEnters(script,async(game,card)=>{
        const candidates=game.creatures(card.ctrl).filter(other=>other!==card&&game.canSacrifice(other));
        const answer=await card.ctrl.controller.decide(game,{type:'chooseCards',from:candidates,min:0,max:candidates.length,prompt:'Devour: sacrifice creatures',aiHint:{kind:'sacrifice',source:card}});
        const picked=[...new Set(Array.isArray(answer)?answer:[])].filter(other=>candidates.includes(other));
        card.meta.oracleDevoured=await game.sacrificeMany(card.ctrl,picked);
      });return true;
    }
    if(kind==='graft'){
      if(!addEtbPlusCounters(script,number(operation)))return false;
      push(script,'triggers',captureTriggerObjects({on:'etb',desc:'Graft',filter:(g,s,d)=>d.card!==s&&d.card?.is('Creature'),run:async(ctx,capture)=>{
        const target=ctx.data.card;
        if(!sameBattlefieldObject(ctx.g,ctx.src,capture.source)||!sameBattlefieldObject(ctx.g,target,capture.objects.target)||!(ctx.src.counters['+1/+1']>0))return;
        const choice=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Move a +1/+1 counter with graft?',options:[{key:'yes',label:'Yes'},{key:'no',label:'No'}],aiHint:{kind:'optTrigger',src:ctx.src}});
        if(choice==='yes'){ctx.g.removeCounters(ctx.src,'+1/+1',1);plusCounter(ctx.g,target,1,ctx.you);}
      }},(g,s,d)=>({target:objectIdentity(d.card)})));return true;
    }
    if(kind==='dredge'){script.dredge=number(operation);return true;}
    if(kind==='plot'){script.plot=operation.cost;return true;}
    if(kind==='dash'){push(script,'altCosts',{label:'Dash '+operation.cost,altCostStr:operation.cost,dash:true});return true;}
    if(kind==='echo'){
      script.oracleEchoCost=operation.cost;
      push(script,'triggers',captureTriggerObjects({on:'upkeep',desc:'Echo '+operation.cost,
        filter:(game,source,data)=>data.player===source.ctrl&&source.meta.oracleEchoPending,
        run:async(ctx,capture)=>{
          const choice=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Pay echo '+operation.cost+'?',options:[{key:'yes',label:'Pay '+operation.cost},{key:'no',label:'Do not pay'}],aiHint:{kind:'pay',cost:operation.cost}});
          const paid=choice==='yes'&&await ctx.g.payMana(ctx.you,MTG.parseCost(operation.cost),{card:ctx.src});
          if(!paid&&sameBattlefieldObject(ctx.g,ctx.src,capture.source)&&ctx.src.ctrl===ctx.you)await ctx.g.sacrifice(ctx.you,ctx.src);
        }},()=>[]));return true;
    }
    if(kind==='megamorph') {script.morph=operation.cost;script.megamorph=true;return true;}
    if(kind==='kicker') {script.kicker={cost:operation.cost};return true;}
    if(kind==='multikicker') {script.multikicker=operation.cost;return true;}
    if(kind==='escape') {script.escape={altCostStr:operation.cost,exileN:number(operation)};return true;}
    if(kind==='no-max-hand') {script.noMaxHand=true;return true;}
    if(kind==='additional-costs') {
      if(operation.lifeX)script.additionalCostX=true;
      const previousCond=script.castCond,previousPrepare=script.prepareTargets;
      const fragment=MTG.compileOracleAdditionalCosts(operation.costs);
      script.castCond=(...args)=>(!previousCond||previousCond(...args))&&fragment.castCond(...args);
      script.prepareTargets=async ctx=>{
        if(previousPrepare&&await previousPrepare(ctx)===false)return false;
        return fragment.prepareTargets(ctx);
      };
      return true;
    }

    if(kind==='offspring') {script.offspring=operation.cost;return true;}
    if(kind==='foretell') {script.foretell=operation.cost;return true;}
    if(kind==='retrace') {script.retrace={altCostStr:operation.cost};return true;}
    if(kind==='ninjutsu') {script.ninjutsu=operation.cost;return true;}
    if(kind==='eternalize') {script.eternalize=operation.cost;return true;}
    if(kind==='embalm') {
      if(script.gyAbility)throw new Error('Multiple graveyard abilities require explicit composition');
      script.gyAbility={label:'Embalm '+operation.cost,cost:operation.cost,sorcery:true,run:async ctx=>{
        const base=ctx.src.def;
        const token={...base,cost:'',colorsOverride:['W'],subtypes:[...new Set([...base.subtypes,'Zombie'])]};
        await ctx.g.makeTokens(token,ctx.you,{copyOf:token});
      }};return true;
    }
    if(kind==='unearth'||kind==='grave-return-self') {
      if(script.gyAbility)throw new Error('Multiple graveyard abilities require explicit composition');
      script.gyAbility={label:kind==='unearth'?'Unearth '+operation.cost:'Return to hand',cost:operation.cost,sorcery:kind==='unearth',exileSelf:false,run:async ctx=>{
        const card=ctx.src;
        if(card.zone!=='graveyard'||card.zoneVersion!==ctx.sourceZoneVersion)return;
        if(kind==='grave-return-self'){await ctx.g.move(card,'hand');return;}
        await ctx.g.move(card,'battlefield',{ctrl:ctx.you});
        if(card.zone!=='battlefield')return;
        card.meta.tempHaste=true;card.meta.unearth=true;
        const identity=objectIdentity(card);
        ctx.g.delayed.push({on:'endStep',once:true,name:'Unearth exile',src:card,ctrl:ctx.you,run:async next=>{
          if(sameBattlefieldObject(next.g,card,identity))await next.g.move(card,'exile');
        }});ctx.g.recalc();
      }};return true;
    }
    if(kind==='soulshift') {
      push(script,'triggers',{
        on:'dies',desc:'Soulshift '+number(operation),
        filter:(game,self,data)=>data.card===self,
        targets:[{zone:'graveyard',what:'card',filter:(game,card,you)=>card.owner===you&&card.hasSub('Spirit')&&card.mv<=number(operation),aiHint:{goal:'recur'}}],
        run:async ctx=>{
          const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Soulshift: return the target?',options:[{key:'yes',label:'Yes'},{key:'no',label:'No'}],aiHint:{kind:'optTrigger',src:ctx.src}});
          if(answer==='yes'&&ctx.targets[0]) await ctx.g.move(ctx.targets[0],'hand');
        },
      });return true;
    }
    if(kind==='modular') {
      if(!addEtbPlusCounters(script,number(operation))) return false;
      push(script,'triggers',{
        on:'dies',desc:'Modular',filter:(game,self,data)=>data.card===self,
        targets:[{what:'creature',filter:(game,card)=>card.is('Artifact'),aiHint:{goal:'buff'}}],
        run:async ctx=>{
          const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Modular: put counters on the target?',options:[{key:'yes',label:'Yes'},{key:'no',label:'No'}],aiHint:{kind:'optTrigger',src:ctx.src}});
          if(answer==='yes'&&ctx.targets[0]) plusCounter(ctx.g,ctx.targets[0],ctx.data.snap.plus1||0,ctx.you);
        },
      });return true;
    }
    if(kind==='fabricate') {
      push(script,'triggers',captureTriggerObjects({
        on:'etb',desc:'Fabricate '+number(operation),filter:(game,self,data)=>data.card===self,
        run:async(ctx,capture)=>{
          let choice='t';
          if(sameBattlefieldObject(ctx.g,ctx.src,capture.source)) choice=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Fabricate '+number(operation),options:[{key:'c',label:'+1/+1 counters'},{key:'t',label:'Servo tokens'}],aiHint:{kind:'fabricate',source:ctx.src}});
          if(choice==='c'&&sameBattlefieldObject(ctx.g,ctx.src,capture.source)) plusCounter(ctx.g,ctx.src,number(operation),ctx.you);
          else await ctx.g.makeTokens('servo',ctx.you,{n:number(operation)});
        },
      },()=>({})));return true;
    }
    if(kind==='living-weapon'||kind==='for-mirrodin') {
      push(script,'triggers',captureTriggerObjects({
        on:'etb',desc:kind==='living-weapon'?'Living weapon':'For Mirrodin!',filter:(game,self,data)=>data.card===self,
        run:async(ctx,capture)=>{
          const living=kind==='living-weapon';
          const token={name:living?'Phyrexian Germ':'Rebel',cost:null,super:[],types:['Creature'],subtypes:living?['Phyrexian','Germ']:['Rebel'],power:living?'0':'2',toughness:living?'0':'2',colorsOverride:[living?'B':'R'],oracle:'',kws:[],isTokenDef:true};
          const made=await ctx.g.makeTokens(token,ctx.you,{n:1});
          if(made.length&&sameBattlefieldObject(ctx.g,ctx.src,capture.source)) await ctx.g.attach(ctx.src,made[0]);
        },
      },()=>({})));return true;
    }
    if(kind==='afflict') {
      push(script,'triggers',captureTriggerObjects({
        on:'becomesBlocked',desc:'Afflict '+number(operation),filter:(game,self,data)=>data.attacker===self,
        run:async(ctx,capture)=>{if(capture.objects.defender) await ctx.g.loseLife(capture.objects.defender,number(operation),'Afflict');},
      },(game,self)=>({defender:self.attacking instanceof MTG.Player?self.attacking:self.attacking?.ctrl})));return true;
    }
    if(kind==='ingest') {
      push(script,'triggers',{
        on:'combatDamageToPlayer',desc:'Ingest',filter:(game,self,data)=>data.card===self,
        run:async ctx=>{const card=ctx.data.player.library.at(-1);if(card) await ctx.g.move(card,'exile');},
      });return true;
    }

    if (kind === 'myriad' || kind === 'infect') {
      keyword(script, kind);
      return true;
    }
    if (kind === 'exalted') {
      push(script, 'triggers', captureTriggerObjects({
        on: 'attackersDeclared', desc: 'Exalted',
        filter: (game, self, data) => data.player === self.ctrl && data.attackers.length === 1,
        run: async (ctx, capture) => {
          const attacker = ctx.data.attackers[0];
          if (sameBattlefieldObject(ctx.g, attacker, capture.objects.attacker)) {
            MTG.E.pumpUntilEOT(ctx.g, attacker, 1, 1);
          }
        },
      }, (game, self, data) => ({ attacker: objectIdentity(data.attackers[0]) })));
      return true;
    }
    if (kind === 'flanking') {
      keyword(script, 'flanking');
      push(script, 'triggers', captureTriggerObjects({
        on: 'blocks', desc: 'Flanking',
        filter: (game, self, data) => data.attacker === self &&
          data.blocker && !data.blocker.kw('flanking') && !data.blocker.def.flanking,
        run: async (ctx, capture) => {
          if (!sameBattlefieldObject(ctx.g, ctx.data.blocker, capture.objects.blocker)) return;
          MTG.E.pumpUntilEOT(ctx.g, ctx.data.blocker, -1, -1);
          await ctx.g.checkSBA();
        },
      }, (game, self, data) => ({ blocker: objectIdentity(data.blocker) })));
      return true;
    }
    if (kind === 'battle-cry') {
      push(script, 'triggers', {
        on: 'attacks', desc: 'Battle cry',
        filter: (game, self, data) => data.card === self,
        run: async ctx => {
          for (const creature of ctx.g.creatures(ctx.you)) {
            if (creature !== ctx.src && creature.attacking) MTG.E.pumpUntilEOT(ctx.g, creature, 1, 0);
          }
        },
      });
      return true;
    }
    if (kind === 'mentor') {
      push(script, 'triggers', {
        on: 'attacks', desc: 'Mentor',
        filter: (game, self, data) => data.card === self && game.creatures(self.ctrl).some(card =>
          card !== self && card.attacking && card.power < self.power),
        targets: [{
          what: 'creature', prompt: 'Mentor — target attacking creature with lesser power',
          filter: (game, card, ctrl, self) => card.zone === 'battlefield' && card.ctrl === ctrl &&
            card !== self && card.is('Creature') && !!card.attacking && card.power < self.power,
          aiHint: { goal: 'buff' },
        }],
        run: async ctx => plusCounter(ctx.g, ctx.targets[0], 1, ctx.you),
      });
      return true;
    }
    if (kind === 'training') {
      push(script, 'triggers', {
        on: 'attackersDeclared', desc: 'Training',
        filter: (game, self, data) => data.player === self.ctrl && data.attackers.includes(self) &&
          data.attackers.some(card => card !== self && card.power > self.power),
        onlyIf: (game, self, data) => self.zone === 'battlefield' && data.attackers.includes(self) &&
          data.attackers.some(card => card !== self && card.zone === 'battlefield' && card.power > self.power),
        run: async ctx => { if (aliveSource(ctx)) plusCounter(ctx.g, ctx.src, 1, ctx.you); },
      });
      return true;
    }
    if (kind === 'riot') {
      if (script.etbCounters && script.etbCounters.kind !== '+1/+1') return false;
      chainAsEnters(script, async (game, card) => {
        const choice = await card.ctrl.controller.decide(game, {
          type: 'chooseOption', prompt: `${card.name} — Riot`,
          options: [{ key: 'counter', label: '+1/+1 counter' }, { key: 'haste', label: 'Haste' }],
          aiHint: { kind: 'riot', card },
        });
        card.meta.oracleRiotChoice = choice === 'haste' ? 'haste' : 'counter';
      });
      if (!addEtbPlusCounters(script, (game, card) => card.meta.oracleRiotChoice === 'counter' ? 1 : 0)) return false;
      push(script, 'statics', { apply: (game, self) => {
        if (self.meta.oracleRiotChoice === 'haste') self.cur.kw.add('haste');
      } });
      return true;
    }
    if (kind === 'unleash') {
      if (script.etbCounters && script.etbCounters.kind !== '+1/+1') return false;
      chainAsEnters(script, async (game, card) => {
        const choice = await card.ctrl.controller.decide(game, {
          type: 'chooseOption', prompt: `${card.name} — Unleash`,
          options: [{ key: 'counter', label: '+1/+1 counter' }, { key: 'none', label: 'No counter' }],
          aiHint: { kind: 'unleash', card },
        });
        card.meta.oracleUnleashed = choice === 'counter';
      });
      if (!addEtbPlusCounters(script, (game, card) => card.meta.oracleUnleashed ? 1 : 0)) return false;
      push(script, 'statics', { apply: (game, self) => {
        if ((self.counters['+1/+1'] || 0) > 0) self.cur.cantBlock = true;
      } });
      return true;
    }
    if (kind === 'evolve') {
      push(script, 'triggers', captureTriggerObjects({
        on: 'etb', desc: 'Evolve',
        filter: (game, self, data) => data.card !== self && data.card.ctrl === self.ctrl &&
          data.card.is('Creature') && (data.card.power > self.power || data.card.toughness > self.toughness),
        run: async (ctx, capture) => {
          if (!sameBattlefieldObject(ctx.g, ctx.src, capture.source)) return;
          const entering = ctx.data.card;
          const identity = capture.objects.entering;
          const compared = sameBattlefieldObject(ctx.g, entering, identity) ? entering
            : entering && entering.battlefieldLKI && entering.battlefieldLKI.get(identity.zoneVersion);
          // Evolve has an intervening-if condition: compare again now, using
          // the original entrant's LKI if it left, never a later blink object.
          if (!compared || compared.timestamp !== identity.timestamp) return;
          if (compared.power > ctx.src.power || compared.toughness > ctx.src.toughness) {
            plusCounter(ctx.g, ctx.src, 1, ctx.you);
          }
        },
      }, (game, self, data) => ({ entering: objectIdentity(data.card) })));
      return true;
    }
    if (kind === 'extort') {
      push(script, 'triggers', {
        on: 'cast', desc: 'Extort', opt: true,
        filter: (game, self, data) => data.player === self.ctrl,
        aiHint: { kind: 'extort' },
        run: async ctx => {
          const cost = MTG.parseCost('{W/B}');
          if (!ctx.g.canPayMana(ctx.you, cost) || !await ctx.g.payMana(ctx.you, cost)) return;
          const lost = await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 1, 'extort');
          if (lost) await ctx.g.gainLife(ctx.you, lost, ctx.src);
        },
      });
      return true;
    }
    if (kind === 'delve') {
      script.altCosts = script.altCosts || [];
      if (!script.altCosts.some(cost => cost.delve)) script.altCosts.push({ label: 'Delve', delve: true });
      return true;
    }
    if (kind === 'improvise') {
      script.improvise = true;
      return true;
    }
    if (kind === 'affinity-artifacts') {
      const previous = script.selfCostAdjust;
      script.selfCostAdjust = (game, card, player) =>
        (previous ? Number(previous(game, card, player)) || 0 : 0) -
        game.bf().filter(permanent => permanent.ctrl === player && permanent.is('Artifact')).length;
      return true;
    }
    if (kind === 'afterlife') {
      const n = number(operation);
      if (!n) return false;
      push(script, 'triggers', {
        on: 'dies', desc: `Afterlife ${n}`,
        filter: (game, self, data) => data.card === self,
        run: async ctx => { await ctx.g.makeTokens(spiritToken, ctx.you, { n }); },
      });
      return true;
    }
    if (kind === 'bushido') {
      const n = number(operation);
      if (!n) return false;
      const run = async ctx => { if (aliveSource(ctx)) MTG.E.pumpUntilEOT(ctx.g, ctx.src, n, n); };
      push(script, 'triggers', {
        on: 'blocks', desc: `Bushido ${n}`, filter: (game, self, data) => data.blocker === self, run,
      });
      push(script, 'triggers', {
        on: 'becomesBlocked', desc: `Bushido ${n}`, filter: (game, self, data) => data.attacker === self, run,
      });
      return true;
    }
    if (kind === 'renown') {
      const n = number(operation);
      if (!n) return false;
      push(script, 'triggers', {
        on: 'combatDamageToPlayer', desc: `Renown ${n}`,
        filter: (game, self, data) => data.card === self && !self.meta.renowned,
        run: async ctx => {
          if (!aliveSource(ctx) || ctx.src.meta.renowned) return;
          ctx.src.meta.renowned = true;
          plusCounter(ctx.g, ctx.src, n, ctx.you);
          await ctx.g.emit('renowned', { card: ctx.src, n });
        },
      });
      return true;
    }
    if (kind === 'bloodthirst') {
      const n = number(operation);
      if (!n) return false;
      return addEtbPlusCounters(script, (game, card) => card.ctrl.opponents(game)
        .some(player => (player.turnState.damageTaken || 0) > 0) ? n : 0);
    }
    if (kind === 'toxic') {
      const n = number(operation);
      if (!n) return false;
      // Toxic changes the results of combat damage; it is not a triggered
      // ability and cannot be responded to, countered, or trigger-doubled.
      script.toxic = Math.max(0, Number(script.toxic) || 0) + n;
      return true;
    }
    if (kind === 'typecycling') {
      const subtype = String(operation.subtype || '').trim();
      const cost = String(operation.cost || '').trim();
      if (!subtype || !cost) return false;
      script.cycling = {
        cost, noDraw: true,
        effect: async ctx => {
          const basicLand = /^basic land$/i.test(subtype);
          const available = ctx.you.library.filter(card => basicLand
            ? card.is('Land') && (card.def.super || []).includes('Basic')
            : card.hasSub(subtype));
          let chosen = [];
          if (available.length) chosen = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: available, min: 0, max: 1, search: true,
            prompt: `Search for a ${subtype} card`, aiHint: { kind: 'searchBasic' },
          });
          const card = Array.isArray(chosen) && available.includes(chosen[0]) ? chosen[0] : null;
          if (card) {
            await ctx.g.revealToHuman({ cards: [card], ctrl: ctx.you, kind: 'search' });
            await ctx.g.move(card, 'hand');
            ctx.g.lg(`${ctx.you.name} finds ${card.name} with ${subtype}cycling.`);
          }
          MTG.shuffle(ctx.you.library, ctx.g.rnd);
        },
      };
      return true;
    }
    return false;
  };
})();
