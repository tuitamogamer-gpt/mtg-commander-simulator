// The division belongs to the announcement, before costs or responses. This
// parser accepts only a complete printed damage instruction; later riders
// must still be compiled separately by the ordinary whole-card pipeline.
const escape = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8};
export function extensionEffect(card, line, h) {
  const source = '(?:'+escape(card.name)+'|this (?:creature|artifact|enchantment|permanent)|it|he)';
  const match = new RegExp('^'+source+' deals (\\d+|X) damage divided as you choose among (.+?)(?:, where X is (.+?))?\\.$','i').exec(line);
  const power = new RegExp('^'+source+' deals damage equal to (its power) divided as you choose among (.+?)\\.$','i').exec(line);
  if (!match && !power) return null;
  let amount = power ? h.value('this creature\'s power') : match[1] === 'X' ? 'X' : Number(match[1]);
  if (match?.[3]) {
    if (match[1] !== 'X') return null;
    const value = match[3].replace(/ as you (?:cast this spell|activate this ability)$/, '');
    amount = h.value(value) || h.count(value);
    if (!amount) return null;
  }
  if (amount === null || amount === undefined || typeof amount === 'number' && (!Number.isSafeInteger(amount) || amount < 1 || amount > 20)) return null;
  const clause = (match?.[2] || power[2]).toLowerCase();
  const quantity = /^(any number of|up to (?:two|three|four|five|six|seven|eight|\d+|x)|one or two|one, two, or three) (.+)$/.exec(clause);
  if (!quantity) return null;
  const minimum = quantity[1].startsWith('one') ? 1 : 0;
  const last = quantity[1].split(/\s+/).at(-1);
  const maximum = quantity[1] === 'any number of' || last === 'x' ? null : words[last] ?? Number(last);
  if (maximum !== null && (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 20)) return null;
  const noun = quantity[2] === 'targets' ? 'any target' : quantity[2]
    .replace(/\bcreatures\b/g,'creature').replace(/\bplaneswalkers\b/g,'planeswalker')
    .replace(/and\/or/g,'or').replace(/your opponents control/g,'an opponent controls');
  const target = noun === 'any target' ? {what:'any',zone:'battlefield',min:1} : h.target(noun);
  if (!target || target.zone === 'stack' || target.zone === 'graveyard') return null;
  return {targets:[{...target,min:minimum,...(maximum === null ? {unbounded:true} : {max:maximum}),dividedAmount:amount}],
    effects:[{action:'divided-damage-v8',target:0,n:amount}]};
}
