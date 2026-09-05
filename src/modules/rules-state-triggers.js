(function(){
  'use strict';
  const M=globalThis.MTG;
  // CR603.8: state triggers observe intermediate instructions, but a single
  // simultaneous event must never expose partially moved/damaged objects.
  const suspended=g=>g._entryReplacementPhase||g._battlefieldEntryEvents||g._simultaneousLeaveSources?.length||g._damageEventQueue||g._graveyardEnterBatch||g._graveyardLeaveBatch;
  const outstanding=(g,source,ability)=>[g.pendingTriggers,g._placingTriggers,g.stack,g._resolvingStateTriggers].some(list=>(list||[]).some(row=>
    row.oracleStateTrigger===ability.stateTest&&(row.src||row.srcCard)===source&&(row.sourceZoneVersion??row.ctx?.sourceZoneVersion)===source.zoneVersion));
  const conditionKinds=new Set(['life','opponent-life','count-comparison','filtered-permanent-count','hand-count','source-quality','not','all','any','state-chosen-color-absence-v8']);
  const validCondition=condition=>condition&&conditionKinds.has(condition.kind)&&!/("event-|"turn-|"X")/.test(JSON.stringify(condition))&&
    (condition.kind!=='not'||validCondition(condition.condition))&&
    (!['all','any'].includes(condition.kind)||condition.conditions?.every(validCondition))&&
    (condition.kind!=='count-comparison'||['count','source-counters'].includes(condition.count?.kind));
  M.StateTriggers={
    apply(script,operation,h){
      if(operation.kind!=='state-trigger-v8')return false;
      if(operation.contract!=='state-trigger-v8'||Object.keys(operation).some(key=>!['kind','state','trigger','contract'].includes(key))||
        !validCondition(operation.state)||operation.trigger?.kind!=='generic-trigger'||operation.trigger.event!=='state'||operation.trigger.eventFilter!=='self')throw Error('Invalid Oracle state trigger');
      const trigger=h.trigger(operation.trigger);
      const effects=operation.trigger.effects||[],effect=effects[0];
      // Only a mandatory, otherwise inert self-sacrifice can prove this loop
      // without guessing whether a choice or another effect changes the state.
      trigger.stateMandatorySacrifice=!operation.trigger.optional&&effects.length===1&&
        (operation.trigger.targets||[]).every(target=>target.min===0)&&
        (effect.action==='sacrifice-source'||effect.action==='resolution-cost'&&!effect.optional&&
          effect.payment?.kind==='sacrifice'&&effect.payment.target==='self'&&effect.payment.zone==='battlefield'&&effect.payment.n===1);
      trigger.stateTest=(game,source)=>operation.state.kind==='state-chosen-color-absence-v8'?
        ['W','U','B','R','G'].includes(source.meta.oracleChosenColor)&&!game.bf().some(card=>card.ctrl===source.ctrl&&card.colors.includes(source.meta.oracleChosenColor)):
        h.condition(game,source,operation.state,source.ctrl);
      (script.triggers||(script.triggers=[])).push(trigger);
      (script.oracleStateOperations||(script.oracleStateOperations=[])).push(operation);
      return true;
    },
    afterResolve(g,so){
      if(g.gameOver||!so.oracleStateTrigger)return;
      this.settle(g);
      const source=so.srcCard;
      if(!source||source.zone!=='battlefield'||source.phasedOut||source.zoneVersion!==so.ctx?.sourceZoneVersion||
        source.ctrl!==so.ctrl||source.cur?.abilitiesDisabled||g.canSacrifice(source))return;
      const ability=(source.def.triggers||[]).concat(source.cur?.extraTriggers||[]).find(ability=>ability.stateTest===so.oracleStateTrigger);
      if(!ability?.stateMandatorySacrifice||!ability.stateTest(g,source)||ability.filter&&!ability.filter(g,source,{card:source,player:source.ctrl}))return;
      // CR104.4b: this failed mandatory sacrifice changes nothing, and CR603.8
      // immediately rearms it. Optional outside actions are not required to
      // break the resulting mandatory loop.
      g.gameOver=true;g.winner=null;g.drawReason='mandatory-state-trigger-loop';
      g.lg(`${source.name}: the mandatory state-trigger loop makes the game a draw.`,'draw');
      g.note('gameover',{winner:null,reason:g.drawReason});
    },
    // Recompute before event observation: a departing continuous-effect source
    // can change the surviving objects' types before its leave event is emitted.
    settle(g){
      if(g._stateTriggerSources?.length&&!suspended(g)&&!g._stateObserveRecalculation){
        g._stateObserveRecalculation=true;
        try{g.recalc();}finally{g._stateObserveRecalculation=false;}
      }
    },
    refresh(g){
      g._stateTriggerSources=g.bf().filter(source=>(source.def.triggers||[]).concat(source.cur?.extraTriggers||[]).some(ability=>typeof ability.stateTest==='function'));
      this.observe(g);
    },
    observe(g){
      if(g.gameOver||suspended(g))return;
      for(const source of g._stateTriggerSources||g.bf()){
        if(source.ctrl.lost||source.cur?.abilitiesDisabled)continue;
        for(const ability of(source.def.triggers||[]).concat(source.cur?.extraTriggers||[])){
          if(typeof ability.stateTest!=='function'||outstanding(g,source,ability)||!ability.stateTest(g,source))continue;
          const data={card:source,player:source.ctrl};
          if(ability.filter&&!ability.filter(g,source,data))continue;
          let times=1;
          for(const doubler of g.bf())if(doubler.ctrl===source.ctrl&&!doubler.cur?.abilitiesDisabled&&doubler.def.doubleTriggerFilter?.(g,doubler,source,'state',data))times++;
          for(let n=0;n<times;n++)g.queueTrigger({src:source,oracleStateTrigger:ability.stateTest,name:ability.desc||'State trigger',run:ability.run,
            ctrl:typeof ability.controller==='function'?ability.controller(g,source,data):ability.controller||source.ctrl,
            targets:ability.targets,modes:ability.modes,prepareTargets:ability.prepareTargets,opt:ability.opt,
            data,onlyIf:ability.onlyIf,aiHint:ability.aiHint});
        }
      }
    },
  };
})();
