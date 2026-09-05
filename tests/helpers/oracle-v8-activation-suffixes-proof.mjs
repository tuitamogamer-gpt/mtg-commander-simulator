// Set only the public prerequisite; operation proofs still use actual engine
// activation, payment, targets and resolution.
export function stageActivationSuffix(MTG,{game,a,b},condition,source){
  if(condition?.kind!=='activation-state-v8')return false;
  const add=name=>{const card=new MTG.CardInst(MTG.DEFS[name],a);card.zone='battlefield';card.sick=false;game.battlefield.push(card);game.recalc();return card;};
  switch(condition.test){
    case 'end-combat':game.phase='combat';game.step='endCombat';break;
    case 'opponent-upkeep':game.turnPlayer=b;game.phase='upkeep';break;
    case 'any-upkeep':game.phase='upkeep';break;
    case 'source-blocked':source.attacking=b;source.wasBlocked=true;break;
    case 'opponent-damaged':b.turnState.damageTaken=1;break;
    case 'attacking-modified':{const attacker=add('Grizzly Bears');attacker.attacking=b;attacker.counters['+1/+1']=1;break;}
    case 'same-name-lands':for(let i=0;i<condition.min;i++)add('Forest');break;
    default:throw new Error('Missing activation suffix condition fixture');
  }
  game.recalc();return true;
}
