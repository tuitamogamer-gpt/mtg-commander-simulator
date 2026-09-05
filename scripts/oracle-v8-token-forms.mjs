// Entire source-local token noun phrases; no prose is discarded.
import {ORACLE_SUBTYPES} from './oracle-subtypes.mjs';
const NUMBER='(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+|X)';
const COLORS={white:'W',blue:'U',black:'B',red:'R',green:'G',colorless:null};
const amount=text=>text==='X'?'X':({a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[text.toLowerCase()]??Number(text));
function descriptor(text,h){
 const match=new RegExp('^('+NUMBER+') (tapped )?(legendary )?(\\d+)\\/(\\d+) (.+?) creature tokens?(?: (?:with (.+)|named (.+)))?$','i').exec(text);
 if(!match)return null;
 let words=match[6].replace(/, and | and |, /g,' ').split(' '),colors=words.filter(w=>Object.hasOwn(COLORS,w));
 const types=words.filter(w=>['artifact','enchantment','land'].includes(w));
 let subtypes=words.filter(w=>!Object.hasOwn(COLORS,w)&&!types.includes(w));
 const keywords=match[7]?h.keywordList(match[7]):[];
 if(!subtypes.length||subtypes.some(s=>!ORACLE_SUBTYPES.has(s))||!keywords||colors.includes('colorless')&&colors.length>1)return null;
 const name=match[8]||subtypes.join(' ');if(/[.\n]/.test(name))return null;
 return {action:'token-inline',who:'you',n:amount(match[1]),...(match[2]?{tapped:true}:{}),token:{name,super:match[3]?['Legendary']:[],types:[...types.map(t=>t[0].toUpperCase()+t.slice(1)),'Creature'],subtypes,power:match[4],toughness:match[5],colors:colors.filter(c=>COLORS[c]).map(c=>COLORS[c]),keywords}};
}
export function extensionEffect(card,line,h){
 let match=/^(You may )?create (.+)\.$/i.exec(line);if(!match)return null;
 let body=match[2],named=null;
 const namedPrefix=/^(.+), ((?:a|an) legendary .+)$/.exec(body);if(namedPrefix){named=namedPrefix[1];body=namedPrefix[2];}
 const colorTail=/^(.*? creature tokens?) that(?:'s| are| is) ((?:white|blue|black|red|green)(?:,? and |, )?(?:(?:white|blue|black|red|green)(?:,? and |, )?)*)(?: with (.+))?$/i.exec(body);
 if(colorTail){const first=new RegExp('^('+NUMBER+' (?:tapped )?(?:legendary )?\\d+\\/\\d+) (.+)$','i').exec(colorTail[1]);if(!first)return null;body=first[1]+' '+colorTail[2]+' '+first[2]+(colorTail[3]?' with '+colorTail[3]:'');}
 const pieces=body.split(new RegExp(',? and (?='+NUMBER+' (?:tapped )?(?:legendary )?\\d+\\/\\d+ )','i'));
 const effects=pieces.map(piece=>descriptor(piece,h));if(effects.some(e=>!e))return null;
 if(named){if(effects.length!==1||/[.\n]/.test(named))return null;effects[0].token.name=named;}
 return {targets:[],optional:!!match[1],effects:effects.length===1?effects:[{action:'create-token-group-v8',effects}]};
}

export function needsRecompile(card,frozen){
 const bad=node=>!!node&&typeof node==='object'&&(
  node.token?.subtypes?.some(type=>!['artifact','enchantment'].includes(type)&&!/^[A-Z][A-Za-z'-]*(?: [A-Z][A-Za-z'-]*)?$/.test(type))||
  Object.values(node).some(value=>Array.isArray(value)?value.some(bad):bad(value)));
 return bad(frozen.implementation);
}

export function temptingOffer(card,line,h){
 const match=/^(.+?\.) Then each opponent may (.+?\.) For each opponent who does, (.+\.)$/.exec(line);
 if(!match)return null;
 const normalize=text=>text.replace(/^you /i,'').replace(/ and you /g,' and ').replace(/^([a-z])/,letter=>letter.toUpperCase());
 const first=h.effect(card,normalize(match[1])),offered=h.effect(card,normalize(match[2])),reward=h.effect(card,normalize(match[3]));
 const supported=body=>body&&!body.optional&&!body.targets.length&&body.effects.length&&body.effects.every(effect=>
  effect.action==='draw'&&effect.who==='you'&&Number.isInteger(effect.n)&&effect.n>0||
  ['token-inline','token-key'].includes(effect.action)&&effect.who==='you'&&Number.isInteger(effect.n)&&effect.n>0);
 if(![first,offered,reward].every(supported))return null;
 return {targets:[],optional:false,effects:[{action:'tempting-offer-v8',effects:first.effects,offered:offered.effects,reward:reward.effects}]};
}
