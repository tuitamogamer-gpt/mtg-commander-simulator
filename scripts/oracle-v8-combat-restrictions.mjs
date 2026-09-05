// Additive, closed combat forms. Unknown costs, durations and target riders
// remain deferred; whole-card parsing must still account for every sentence.
const escape = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const self = card => '(?:this (?:creature|artifact|permanent|token)|' + escape(card.name) + ')';
function subject(card, text) {
  if (new RegExp('^' + self(card) + '$', 'i').test(text)) return {scope: 'self'};
  if (/^(?:Enchanted|Equipped) creature$/i.test(text)) return {kind: 'attachment-grant', contract: 'attachment-continuous-effect'};
  const scope = {'Each creature':'all-creatures','Each creature you control':'your-creatures','All creatures':'all-creatures', 'Creatures':'all-creatures', 'Creatures you control':'your-creatures', 'Other creatures you control':'your-other-creatures', 'Creatures your opponents control':'opponent-creatures'}[text];
  return scope ? {scope} : null;
}
const staticBase = {kind:'generic-static', power:0, toughness:0, keywords:[], contract:'generic-continuous-effect'};
export function extensionLine(card, line, helpers = {}) {
  let assignment = /^(.+?) assigns? combat damage equal to its toughness rather than its power( and can attack as though it didn't have defender)?\.$/.exec(line);
  if(assignment){
    const condition=/ with (toughness greater than its power|defender)$/.exec(assignment[1]);
    const recipient=subject(card,condition?assignment[1].slice(0,condition.index):assignment[1]);
    if(recipient&&(!assignment[2]||condition?.[1]==='defender'))return{...staticBase,...recipient,combatRule:{kind:'assign-toughness',...(condition?{requires:condition[1]==='defender'?'defender':'toughness-greater'}:{}),...(assignment[2]?{defenderPermission:true}:{})}};
  }
  assignment=/^(Enchanted|Equipped) creature gets ([+-]\d+)\/([+-]\d+) and assigns combat damage equal to its toughness rather than its power\.$/.exec(line);
  if(assignment)return{...staticBase,...subject(card,assignment[1]+' creature'),power:Number(assignment[2]),toughness:Number(assignment[3]),combatRule:{kind:'assign-toughness'}};
  assignment=/^As long as (?:equipped|enchanted) creature(?:'s toughness is greater than its power| has vigilance), it assigns combat damage equal to its toughness rather than its power\.$/.exec(line);
  if(assignment)return{...staticBase,kind:'attachment-grant',contract:'attachment-continuous-effect',combatRule:{kind:'assign-toughness',requires:line.includes(' has vigilance')?'vigilance':'toughness-greater'}};
  let match = /^(.+?) (blocks?|attacks or blocks) each combat if able\.$/.exec(line);
  if (match) {
    const recipient = subject(card, match[1]);
    if (recipient) return {...staticBase, ...recipient, combatRule:{kind:'required-block'}, ...(match[2]==='attacks or blocks'?{mustAttack:true}:{})};
  }
  match = /^(.+?) gets? ([+-]\d+)\/([+-]\d+) and attacks? each combat if able\.$/.exec(line);
  if (match) {
    const recipient = subject(card, match[1]);
    if (recipient) return {...staticBase, ...recipient, power:Number(match[2]), toughness:Number(match[3]), mustAttack:true};
  }
  match = new RegExp('^You may have (' + self(card) + ') assign its combat damage as though it weren\'t blocked\\.$','i').exec(line)
    || /^Enchanted creature's controller may have it assign its combat damage as though it weren't blocked\.$/.exec(line);
  if (match) return {...staticBase, ...(match[1]?{scope:'self'}:{kind:'attachment-grant',contract:'attachment-continuous-effect'}), combatRule:{kind:'assign-unblocked'}};
  return null;
}
export const modifierOperation = extensionLine;
export function extensionEffect(card, line, helpers = {}) {
  const blockedPump=/^(this creature|it|that creature) gets ([+-]\d+)\/([+-]\d+) until end of turn for each creature blocking (it|that creature)\.$/i.exec(line);
  if(blockedPump&&((blockedPump[1].toLowerCase()==='that creature')===(blockedPump[4].toLowerCase()==='that creature'))){
    const target=blockedPump[1].toLowerCase()==='that creature'?'event-card':'self';
    const value=amount=>({kind:'combat-blocker-count-v8',subject:target,multiply:Number(amount)});
    return{targets:[],effects:[{action:'pump',target,power:value(blockedPump[2]),toughness:value(blockedPump[3]),keywords:[]}]};
  }
  const assignment=/^(Until end of turn, )?(target creature(?: you control| an opponent controls)?) assigns combat damage equal to its toughness rather than its power( this turn)?\.$/i.exec(line);
  if(assignment&&!!assignment[1]!==!!assignment[3]){const target=helpers.target?.(assignment[2].toLowerCase());if(target)return{targets:[target],effects:[{action:'combat-restriction',target:0,duration:'eot',restriction:{combatRule:{kind:'assign-toughness'}}}]};}
  let match = /^(target creature(?: an opponent controls| you control)?) (attacks|blocks) this turn if able\.$/i.exec(line);
  if (match) {
    const target = helpers.target?.(match[1].toLowerCase());
    if (target) return {targets:[target], effects:[{action:'combat-restriction',target:0,duration:'eot',restriction:match[2]==='attacks'?{mustAttack:true}:{combatRule:{kind:'required-block'}}}]};
  }
  match = new RegExp('^(target creature(?: an opponent controls| you control)?) (can\'t block|blocks) ('+self(card)+') this turn( if able)?\\.$','i').exec(line);
  if (match && (match[2]==='blocks') === !!match[4]) {
    const target = helpers.target?.(match[1].toLowerCase());
    if (target) return {targets:[target],effects:[{action:'combat-restriction',target:0,duration:'eot',restriction:{combatRule:{kind:'source-block',mode:match[2]==='blocks'?'require':'forbid'}}}]};
  }
  match = new RegExp('^('+self(card)+') can attack this turn as though it didn\'t have defender\\.$','i').exec(line);
  if (match) return {targets:[],effects:[{action:'combat-restriction',target:'self',duration:'eot',restriction:{combatRule:{kind:'defender-permission'}}}]};
  return null;
}
