(function(){
  'use strict';
  const M=globalThis.MTG||(globalThis.MTG={});
  const key='oracleExertedBy';
  const live=(game,card)=>card instanceof M.CardInst&&card.zone==='battlefield'&&!card.phasedOut&&game.bf().includes(card);
  const actors=card=>Array.isArray(card.meta?.[key])?card.meta[key]:[];
  M.OracleV8Exert={
    native({trigger,score,condition}){
      const link=Symbol('nativeAttackExertion'),prior=trigger.filter;
      return {oracleExertAttackOptions:[{index:0,link,score,condition}],triggers:[{...trigger,on:'exerted',filter:(g,self,data)=>data.card===self&&data.attackExertion===link&&(!prior||prior(g,self,data))}]};
    },
    apply(script,operation,h){
      if(operation.kind==='generic-trigger'&&operation.event==='exerted'&&operation.eventFilter?.kind==='exerted-creature-v8'){
        (script.oracleExertWatcherScores||(script.oracleExertWatcherScores=[])).push(h.score(operation,{}));
        return false;
      }
      if(operation.kind!=='exert-attack-v8')return false;
      if(operation.contract!=='exert-attack'||Object.keys(operation).some(k=>!['kind','body','contract'].includes(k))||
        operation.body&&(!Array.isArray(operation.body.targets)||!Array.isArray(operation.body.effects)||!operation.body.effects.length||operation.body.v4Body))throw Error('Invalid Oracle attack exertion');
      const options=script.oracleExertAttackOptions||(script.oracleExertAttackOptions=[]),index=options.length;
      const score=operation.body?h.score(operation.body,{}):()=>0,link=Symbol('oracleAttackExertion');
      options.push({index,score,link});
      if(operation.body){
        const trigger=h.trigger({kind:'generic-trigger',event:'exerted',eventFilter:'self',...operation.body,contract:'generic-trigger-effect'});
        trigger.oracleExertAttackIndex=index;
        const base=trigger.filter;
        trigger.filter=(game,source,data)=>data.attackExertion===link&&base(game,source,data);
        (script.triggers||(script.triggers=[])).push(trigger);
      }
      return true;
    },
    eventMatches(game,source,data,filter){
      if(filter.kind!=='exerted-creature-v8'||filter.controller!=='you'||Object.keys(filter).some(k=>!['kind','controller'].includes(k)))throw Error('Invalid Oracle exertion event');
      return data.player===source.ctrl&&!!data.card?.is('Creature');
    },
    preventsUntap(card,player){return actors(card).includes(player.idx);},
    expire(game,player){
      // The exerting player's actual untap step consumes the duration even
      // when the permanent changed control or is currently phased out.
      for(const card of game.battlefield||[]){
        if(!actors(card).includes(player.idx))continue;
        card.meta[key]=actors(card).filter(index=>index!==player.idx);
        if(!card.meta[key].length)delete card.meta[key];
      }
    },
    async exert(game,player,card,data={}){
      if(!live(game,card)||!game.players.includes(player)||player.lost)return false;
      card.meta[key]=[...new Set([...actors(card),player.idx])];
      card.meta.oracleLastExertedTurn=game.turnNo;
      game.lg(`${player.name} exerts ${card.name}.`);
      await game.emit('exerted',{card,player,...data});
      return true;
    },
    async chooseAttackCosts(game,player,attackers){
      const selected=[];
      for(const card of attackers){
        if(!live(game,card)||card.ctrl!==player||card.cur?.abilitiesDisabled)continue;
        const version=card.zoneVersion,options=card.def.oracleExertAttackOptions||[];
        for(const option of options){
          if(option.condition&&!option.condition(game,card,player))continue;
          const result=await player.controller.decide(game,{type:'chooseOption',source:card,
            prompt:`Exert ${card.name} as it attacks? It will not untap during your next untap step.`,
            options:[{key:'exert',label:'Exert'},{key:'decline',label:'Do not exert'}],
            aiHint:{kind:'exertAttack',card,index:option.index}});
          if(result==='exert')selected.push({card,version,index:option.index,link:option.link});
        }
      }
      return selected;
    },
    async payAttackCosts(game,player,attackers,selected){
      for(const row of selected){
        if(!attackers.includes(row.card)||!live(game,row.card)||row.card.ctrl!==player||row.card.zoneVersion!==row.version)continue;
        await this.exert(game,player,row.card,{attackExertion:row.link});
      }
    },
    choose(game,player,query){
      const card=query.aiHint?.card,option=card?.def.oracleExertAttackOptions?.[query.aiHint.index];
      if(!live(game,card)||!option)return 'decline';
      // Multiple exertions before the same step do not add another skipped
      // untap. Value each actual effect against that remaining opportunity cost.
      const opportunity=actors(card).includes(player.idx)?0.1:0.8;
      let value=option.score(game,card,player);
      for(const source of game.bf())if(source.ctrl===player&&!source.cur?.abilitiesDisabled)
        for(const score of source.def.oracleExertWatcherScores||[])value+=score(game,source,player);
      return value>opportunity?'exert':'decline';
    },
  };
})();
