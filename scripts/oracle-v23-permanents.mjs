// Additive complete permanent clauses; production v22 sources remain immutable.
import {ORACLE_SUBTYPES,ORACLE_SUBTYPE_TYPES} from './oracle-subtypes.mjs';
import {resolutionPayment} from './oracle-v8-effects.mjs';
const mana='((?:\\{(?:[0-9]+|[WUBRGC])\\})+)';
const complete=body=>body&&!body.optional&&!body.v4Body&&Array.isArray(body.targets)&&Array.isArray(body.effects);
const upper=text=>text[0].toUpperCase()+text.slice(1);
export function extensionLine(card,line,h){
 if(/\bAura\b/.test(card.type_line||'')){
  if(/^Enchant creature or (?:enchantment|land)$/.test(line)){const target=h.target?.('target '+line.slice(8));if(target)return {kind:'aura-target',what:'permanent',targetV9:target,contract:'aura-targeting'};}
  const landMana=/^As long as enchanted permanent is a land, it has "\{T\}: Add two mana of any one color\."\.?$/.exec(line);
  if(landMana)return {kind:'attachment-operation',operation:{kind:'mana-source',produce:['W','U','B','R','G'].map(color=>({[color]:2})),activationMana:null,contract:'mana-source'},condition:{kind:'permanent-attached-condition-v21',condition:{kind:'source-quality',filter:{what:'land',zone:'battlefield',controller:'any'}}},contract:'attachment-granted-operation'};
  if(line==="As long as enchanted permanent is a Vehicle, it's a creature in addition to its other types.")return {kind:'v8-type-static',own:false,attached:true,filters:null,change:{creatureV9:true},condition:{kind:'source-quality',filter:{what:'permanent',zone:'battlefield',controller:'any',subtype:'Vehicle'}},conditionSubject:'affected',contract:'continuous-characteristic-type'};
  const base=/^As long as enchanted permanent is a creature, it has base power and toughness ([0-9]+)\/([0-9]+)\.$/.exec(line);
  if(base)return {kind:'base-pt-static',own:false,attached:true,filters:null,power:Number(base[1]),toughness:Number(base[2]),keywords:[],subtypes:[],condition:{kind:'permanent-attached-condition-v21',condition:{kind:'source-quality',filter:{what:'creature',zone:'battlefield',controller:'any'}}},contract:'base-pt-static'};
  const animation=/^Enchanted artifact is a ([A-Z][a-z-]+) creature with base power and toughness ([0-9]+)\/([0-9]+) in addition to its other types\.$/.exec(line);
  if(animation&&ORACLE_SUBTYPES.has(animation[1])&&!ORACLE_SUBTYPE_TYPES[animation[1]])return {kind:'v8-layered-static',own:false,attached:true,filters:null,change:{creatureV9:true,addCreatureTypes:[animation[1]]},operation:{kind:'base-pt-static',power:Number(animation[2]),toughness:Number(animation[3]),keywords:[],subtypes:[],contract:'base-pt-static'},contract:'continuous-layered-characteristics'};
  if(line==='Enchanted permanent is an enchantment and loses all other card types.')return {kind:'permanent-attached-type-set-v23',types:['Enchantment'],allowedSubtypes:Object.entries(ORACLE_SUBTYPE_TYPES).filter(([,type])=>type==='enchantment').map(([name])=>name),contract:'permanent-attached-type-set-v23'};
  const named=/^(Enchanted creature loses all abilities and is .+? with base power and toughness [0-9]+\/[0-9]+) named ([^".]+)\.$/.exec(line);
  if(named){const child=h.line(card,named[1]+'.');if(child?.kind==='v8-ability-loss-static')return {kind:'operation-bundle',operations:[child,{kind:'permanent-attached-name-v23',name:named[2],contract:'permanent-attached-name-v23'}],contract:'closed-permanent-clauses'};}
  const food=/^Enchanted permanent is a colorless Food artifact with "(\{2\}, \{T\}, Sacrifice this artifact: You gain 3 life)" and loses all other card types and abilities\.$/.exec(line);
  if(food){const child=h.line({...card,name:'__GrantedPermanent__',type_line:'Artifact'},food[1]+'.');if(child?.kind==='generic-ability')return {kind:'operation-bundle',operations:[{kind:'v8-ability-loss-static',attached:true,types:['Artifact'],subtypes:['Food'],colors:[],keywords:[],contract:'continuous-ability-removal'},{kind:'attachment-operation',operation:child,contract:'attachment-granted-operation'}],contract:'closed-permanent-clauses'};}
  const upkeep=/^Enchanted creature has "Cumulative upkeep ((?:\{(?:[0-9]+|[WUBRGC])\})+)\."\.?$/.exec(line);
  if(upkeep)return {kind:'permanent-attached-mechanic-v23',operation:{kind:'mechanic-cumulative-upkeep',cost:upkeep[1],contract:'mechanic-cumulative-upkeep'},contract:'permanent-attached-mechanic-v23'};
  const phase=/^At the beginning of (?:the (upkeep|end step) of enchanted (creature|artifact|enchantment|land|permanent)'s controller|enchanted (player|opponent)'s (upkeep|end step)), (.+)$/.exec(line);
  if(phase){const event=(phase[1]||phase[4])==='upkeep'?'upkeep':'endStep',noun=phase[2],body=noun?phase[5].replaceAll('that '+noun,'enchanted '+noun):phase[5];const child=h.line?.(card,'At the beginning of each '+(event==='upkeep'?'upkeep':'end step')+', '+body);
   if(child?.kind==='generic-trigger'&&child.event===event&&!child.v4Body){
    const bind=node=>Array.isArray(node)?node.map(bind):node&&typeof node==='object'?{...Object.fromEntries(Object.entries(node).map(([key,value])=>[key,bind(value)])),...(node.action==='unless-cost-v14'&&node.who==='attached-host-controller'?{who:'event-player'}:{})}:node;
    return {...child,...(/unless (?:they|that player) /.test(body)?{effects:bind(child.effects)}:{}),permanentAttachedPhaseV23:{subject:noun?'host-controller':'player'}};
   }
  }
  const enters=/^When this (?:Aura|enchantment) enters, if enchanted (creature|artifact|land|permanent) (.+?), (.+)$/.exec(line);
  if(enters){const condition=h.condition?.('this permanent '+enters[2]),text=enters[3].replaceAll('that '+enters[1],'enchanted '+enters[1]).replace(/^(tap|untap) it\.$/,'$1 enchanted '+enters[1]+'.'),body=h.effect?.(card,text[0].toUpperCase()+text.slice(1));if(condition&&body?.effects?.length&&Array.isArray(body.targets)&&!body.optional&&!body.v4Body)return {kind:'generic-trigger',event:'etb',eventFilter:'self',...body,condition:{kind:'permanent-attached-condition-v21',condition},permanentAuraEtbV23:true,contract:'generic-trigger-effect'};}
 }
 const unearth=new RegExp('^Each (creature|artifact|[A-Z][a-z-]+ creature) card in your graveyard has unearth '+mana+'\\.$').exec(line);
 if(unearth){const noun=unearth[1],filter=h.target?.('target '+noun+' card in your graveyard');if(filter?.zone==='graveyard')return {kind:'permanent-zone-keyword-v23',keyword:'unearth',zone:'graveyard',who:'you',filter,cost:unearth[2],contract:'permanent-zone-keyword-v23'};}
 const cycle=new RegExp("^Each ([A-Z][a-z-]+) card in each player's hand has ([a-z]+)cycling "+mana+'\\.$').exec(line);
 if(cycle&&ORACLE_SUBTYPES.has(cycle[1])&&cycle[2]===cycle[1].toLowerCase())return {kind:'permanent-zone-keyword-v23',keyword:'typecycling',zone:'hand',who:'all',subtype:cycle[1],cost:cycle[3],contract:'permanent-zone-keyword-v23'};
 const printedCycle=new RegExp('^([A-Z][a-z-]+)cycling '+mana+'$').exec(line);
 if(printedCycle&&ORACLE_SUBTYPES.has(printedCycle[1]))return {kind:'mechanic-typecycling',subtype:printedCycle[1],cost:printedCycle[2],contract:'mechanic-typecycling'};
 return null;
}
export function extensionEffect(card,line,h){
 if(!/\bAura\b/.test(card.type_line||''))return null;
 const unless=/^(.+?) unless (they|that player) (.+)\.$/.exec(line);
 if(unless){const parsed=h.effect(card,upper(unless[1])+'.');if(complete(parsed)&&!parsed.targets.length&&parsed.effects.length){
  let phrase=unless[3].replace(/\b(pays|sacrifices|discards|exiles|returns|taps|puts|removes|reveals)\b/g,word=>word.slice(0,-1)).replace(/\btheir\b/g,'your').replace(/ or ([0-9]+ life)$/,' or pay $1'),cost;
  if(/^sacrifice (?:that|enchanted) (?:creature|artifact|enchantment|land|permanent)$/.test(phrase))cost={payment:{kind:'sacrifice',zone:'battlefield',n:1,target:'attached-host'},targets:[]};
  else if(phrase==="pay {X}, where X is its mana value")cost={payment:{kind:'mana',mana:'{X}',xValue:{kind:'target-stat',target:'attached-host',stat:'mv'}},targets:[]};
  else cost=resolutionPayment(card,phrase,h);
  if(cost&&!cost.targets.length&&!cost.payment.chooseX){
   if(phrase.startsWith('sacrifice another ')&&cost.payment.filter)cost.payment.filter={...cost.payment.filter,excludeSelf:false,excludeTargetV14:'attached-host'};
   const who=parsed.effects.some(effect=>effect.who==='event-player'||effect.target==='event-player')?'event-player':'attached-host-controller';
   return {effects:[{action:'unless-cost-v14',who,payment:cost.payment,effects:parsed.effects}],targets:[],optional:false};
  }
 }}
 const sacrifice=/^That player sacrifices? (?:enchanted (?:creature|artifact|enchantment|land|permanent)|it)\.$/.exec(line);
 if(sacrifice)return {effects:[{action:'permanent-sacrifice-host-v23',who:'event-player',target:'attached-host'}],targets:[],optional:false};
 const controller=/^Enchanted (?:creature|artifact|enchantment|land|permanent)'s controller sacrifices? it\.$/.exec(line);
 if(controller)return {effects:[{action:'permanent-sacrifice-host-v23',who:'attached-host-controller',target:'attached-host'}],targets:[],optional:false};
 const damage=/^This (?:Aura|enchantment) deals ([0-9]+) damage to (that player|enchanted (?:creature|artifact|enchantment|land|permanent)'s controller|enchanted (?:player|opponent))\.$/.exec(line);
 if(damage)return {effects:[damage[2].startsWith('enchanted player')||damage[2].startsWith('enchanted opponent')?{action:'permanent-cursed-damage-v23',n:Number(damage[1])}:{action:'damage',n:Number(damage[1]),target:damage[2]==='that player'?'event-player':'attached-host-controller'}],targets:[],optional:false};
 const hostBite=/^Enchanted creature (fights? .+|deals damage equal to its (?:power|toughness) to .+)\.$/.exec(line);
 if(hostBite){const child=h.effect(card,'Target creature '+hostBite[1]+'.');if(child?.effects?.length===1&&child.targets?.length===2&&!child.optional&&['fight','bite'].includes(child.effects[0].action)&&child.effects[0].target===0&&child.effects[0].otherTarget===1)return {effects:[{...child.effects[0],target:'attached-host',otherTarget:0}],targets:[child.targets[1]],optional:false};}
 return null;
}
