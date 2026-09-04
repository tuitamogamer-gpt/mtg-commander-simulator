import assert from 'node:assert/strict';

export function stageLiveCondition(MTG, ctx, condition, source, h) {
  if (condition?.kind !== 'v8-live-condition') return false;
  const {game, a, b} = ctx;
  const make = (name, player = a, fields = {}) => h.permanent(MTG, game, player, h.fixtureDefinition(name, ['Creature'], {power:'2',toughness:'20',...fields}));
  switch (condition.test) {
    case 'most-common-color': {
      const n = game.bf().length + 1;
      for(let i=0;i<n;i++)make('Common-color fixture '+i,a,{colorsOverride:[condition.color]});
      break;
    }
    case 'half-starting-life': a.life=(a.startingLife??40)/2;break;
    case 'crime-turn': a.turnState.oracleCrimes=1;break;
    case 'entry-turn': a.turnState.oraclePermanentEntries=[{iid:-1,version:1,types:[condition.type],subtypes:condition.subtype?[condition.subtype]:[],changeling:false}];break;
    case 'sacrifice-turn': a.turnState.oracleSacrifices=[{types:[condition.type||'Creature']}];break;
    case 'counter-put-turn': a.turnState.oracleCounterPlacements=[{iid:source.iid,version:source.zoneVersion,counter:condition.counter,creature:true}];break;
    case 'exile-adventure': {
      const definition=Object.values(MTG.DEFS).find(def=>def.adventure);assert.ok(definition,'Adventure fixture exists');
      h.zoneCard(MTG,a,definition,'exile');break;
    }
    case 'source-counter-total': source.counters.charge=condition.min;break;
    case 'creature-counter-total': make('Creature counter total').counters.charge=condition.min;break;
    case 'creature-counter-minimum': make('Creature counter threshold',condition.anyPlayer?b:a).counters[condition.counter]=condition.min;break;
    case 'renowned': source.meta.renowned=true;break;
    case 'attacking-alone':
      for(const card of game.bf())if(card.ctrl===source.ctrl)card.attacking=null;
      source.attacking=source.ctrl===a?b:a;game.combat={attackers:[source],defenders:new Map()};break;
    case 'blocker-count':
      source.attacking=b;source.blockedBy=Array.from({length:condition.min},(_,i)=>make('Condition blocker '+i,b));
      for(const blocker of source.blockedBy)blocker.blocking=source.iid;
      game.combat={attackers:[source],defenders:new Map()};break;
    case 'controller-other-creatures':
      if(condition.min)make('Controller companion',source.ctrl);
      else for(const card of game.creatures(source.ctrl).slice())if(card!==source){game.battlefield.splice(game.battlefield.indexOf(card),1);card.zone='hand';card.owner.hand.push(card);}
      break;
    default: assert.fail('Missing v8 condition fixture '+condition.test);
  }
  game.recalc();return true;
}
