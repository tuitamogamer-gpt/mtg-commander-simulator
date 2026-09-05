// Typed activation payment references bind only within this operation.
export function extensionLine(card,line,h){
 const split=/^(.+?): (.+)$/.exec(line);if(!split)return null;
 const cost=h.cost(split[1]),info=cost?.oracleCounterPayment;
 if(!info?.self||info.among||info.kinds?.length!==1||!['X','all','chosen'].includes(info.n))return null;
 const kind=info.kinds[0],escaped=kind.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');let body=split[2],multiply=1;
 const damage=new RegExp('^(.+?) deals damage to (.+?) equal to the number of '+escaped+' counters removed this way\\.$').exec(body);
 const scaledLife=new RegExp('^You gain ([1-9][0-9]*) life for each '+escaped+' counter removed this way\\.$').exec(body);
 const scaledPump=/^For each counter removed, this creature gets \+([1-9][0-9]*)\/\+0 until end of turn\.$/.exec(body);
 const shrinks=new RegExp('^Target creature gets -1/-1 until end of turn for each '+escaped+' counter removed this way\\.$').test(body);
 if(damage)body=damage[1]+' deals X damage to '+damage[2]+'.';
 else if(scaledLife){body='You gain X life.';multiply=Number(scaledLife[1]);}
 else if(scaledPump){body='This creature gets +X/+0 until end of turn.';multiply=Number(scaledPump[1]);}
 else if(shrinks)body='Target creature gets -X/-X until end of turn.';
 else if(/^(?:It|This (?:artifact|creature)|[^.]+) deals that much damage to (?:any target|target creature)\.$/.test(body))body=body.replace('that much damage','X damage');
 else if(/^Create that many [^.]+ creature tokens\.$/.test(body))body=body.replace('that many','X');
 else if(/, where X is the number of counters removed this way\.$/.test(body))body=body.replace(/, where X is the number of counters removed this way\.$/,'.');
 else return null;
 body=body.replace(/^It /,card.name+' ');
 if(!Number.isSafeInteger(multiply))return null;
 const parsed=h.effect?.(card,body);if(!parsed||parsed.v4Body||!parsed.effects?.length||parsed.optional)return null;
 const bind=node=>Array.isArray(node)?node.map(bind):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,bind(value)])):
   ['X','+X','-X'].includes(node)?{kind:'counter-payment-v8',multiply:node==='-X'?-multiply:multiply}:node;
 // Target quantity/quality X needs a separate announcement contract.
 if(/"(?:threshold|targetCountX)"/.test(JSON.stringify(parsed.targets)))return null;
 return{kind:'generic-ability',cost,targets:parsed.targets,effects:bind(parsed.effects),contract:'generic-activated-effect'};
}
export function normalizeOperation(operation){
 const info=operation.cost?.oracleCounterPayment,effect=operation.effects?.[0];
 if(operation.kind==='generic-ability'&&!operation.from&&info?.self&&!info.among&&info.kinds?.length===1&&['all','chosen'].includes(info.n)&&operation.effects?.length===1&&['damage','gain-life','token-inline'].includes(effect.action)&&effect.n?.kind==='event-amount')return {...operation,effects:[{...effect,n:{kind:'counter-payment-v8',multiply:1}}]};
 return operation;
}
