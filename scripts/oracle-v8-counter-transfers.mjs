const escape=text=>String(text).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const self=(card,text)=>new RegExp('^(?:this creature|this artifact|this enchantment|this land|this permanent|'+escape(card.name)+'|'+escape(card.name.split(/,| the /)[0])+')$','i').test(text);
export function extensionEffect(card,line,h){
 const match=/^Move (a|an|one|all|any number of) (?:(\+\d+\/\+\d+|-\d+\/-\d+|[a-z]+) )?counters? from (.+) onto (.+)\.$/.exec(line);
 if(!match)return null;
 const n=match[1]==='all'?'all':match[1]==='any number of'?'chosen':1,counter=match[2]||null;
 if(n==='chosen'&&!counter)return null;
 const targets=[];
 const subject=(text,recipient=false)=>{
  if(self(card,text))return'self';
  if(!/\btarget\b/.test(text))return null;
  const distinct=recipient&&/^(?:another|a second) target /.test(text),normalized=text.replace(/^a second target /,'target ').replace(/^another target /,'target ');
  const spec=h.target(normalized);if(!spec||spec.zone!=='battlefield'||['any','player','opponent'].includes(spec.what)||spec.min!==1||spec.max!==undefined&&spec.max!==1)return null;
  if(distinct){if(targets.length)spec.differentFromPrevious=true;else spec.excludeSelf=true;}
  const index=targets.length;targets.push(spec);return index;
 };
 const sourceTarget=subject(match[3]),target=subject(match[4],true);
 if(sourceTarget===null||target===null||sourceTarget==='self'&&target==='self')return null;
 return{targets,effects:[{action:'move-counters-v8',sourceTarget,target,counter,n}]};
}
export function extensionLine(card,line,h){
 const optional=/^At the beginning of (your upkeep|combat on your turn), you may (move .+)\.$/i.exec(line);
 if(optional){const body=extensionEffect(card,optional[2][0].toUpperCase()+optional[2].slice(1)+'.',h);if(body)return{kind:'generic-trigger',event:optional[1]==='your upkeep'?'upkeep':'beginCombat',eventFilter:optional[1]==='your upkeep'?'your-upkeep':'your-combat',optional:true,...body,contract:'generic-trigger-effect'};return null;}
 const match=/^When (.+) (dies|leaves the battlefield), put its counters on (.+)\.$/.exec(line);
 if(!match||!self(card,match[1]))return null;
 const target=h.target(match[3]);if(!target||target.zone!=='battlefield'||target.what!=='creature')return null;
 return{kind:'generic-trigger',event:match[2]==='dies'?'dies':'lto',eventFilter:'self',targets:[target],effects:[{action:'copy-counters-v8',target:0,from:'event-card'}],contract:'generic-trigger-effect'};
}
