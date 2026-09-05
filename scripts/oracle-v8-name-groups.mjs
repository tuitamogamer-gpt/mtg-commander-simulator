const TYPES={creature:"creature",artifact:"artifact",enchantment:"enchantment",land:"land",permanent:"permanent",token:"token",creatures:'creature',artifacts:'artifact',enchantments:'enchantment',lands:'land',permanents:'permanent',tokens:'token'};
function make(target,noun,child,h){const spec=target==='self'?null:h.target(target),what=TYPES[noun];if(target!=='self'&&(!spec||spec.zone!=='battlefield')||!what)return null;return{targets:spec?[spec]:[],effects:[{action:'same-name-group-v8',target:spec?0:'self',what,effect:child}]};}
export function extensionEffect(card,line,h){
 let m=/^(Destroy|Exile) (target .+?) and (?:all|each) other (creatures?|artifacts?|enchantments?|lands?|permanents?|tokens?) with the same name as (?:that (?:creature|artifact|enchantment|land|permanent|token)|it)\.$/.exec(line);
 if(m)return make(m[2],m[3],{action:m[1].toLowerCase()},h);
 m=/^Return (target .+?) and all other (creatures?|artifacts?|enchantments?|lands?|permanents?|tokens?) with the same name as (?:that (?:creature|artifact|enchantment|land|permanent|token)|it) to their owners' hands\.$/.exec(line);
 if(m)return make(m[1],m[2],{action:'bounce'},h);
 m=/^(Target .+?|This creature) and (?:all|each) other (creatures?|artifacts?|enchantments?|lands?|permanents?|tokens?) with the same name as (?:that (?:creature|artifact|enchantment|land|permanent|token)|it) get ([+-]\d+)\/([+-]\d+) until end of turn\.$/.exec(line);
 if(m)return make(m[1]==='This creature'?'self':m[1].replace(/^Target/,'target'),m[2],{action:'pump',power:Number(m[3]),toughness:Number(m[4])},h);
 m=/^(.+?) deals (\d+) damage to (target .+?) and (?:all|each) other (creatures?|artifacts?|enchantments?|lands?|permanents?|tokens?) with the same name as (?:that (?:creature|artifact|enchantment|land|permanent|token)|it)\.$/.exec(line);
 if(m&&(m[1]===card.name||/^This (?:creature|artifact|enchantment|land|permanent)$/.test(m[1])))return make(m[3],m[4],{action:'damage',n:Number(m[2])},h);
 m=/^Return target creature card and all other cards with the same name as that card from your graveyard to (your hand|the battlefield( tapped)?)\.$/.exec(line);
 if(m){const spec=h.target('target creature card from your graveyard');if(!spec)return null;return{targets:[spec],effects:[{action:'same-name-group-v8',target:0,what:'card',zone:'graveyard',effect:{action:m[1]==='your hand'?'move-to-hand':'reanimate',...(m[2]?{tapped:true}:{})}}]};}
 m=/^Exile (target nonland permanent an opponent controls) and all tokens that player controls with the same name as that permanent\.$/.exec(line);
 if(m){const parsed=make(m[1],'tokens',{action:'exile'},h);if(parsed)parsed.effects[0].sameController=true;return parsed;}
 return null;
}
