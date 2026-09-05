const colors = ['W', 'U', 'B', 'R', 'G'];
const amounts = {one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10};
const number = text => amounts[text] ?? (/^\d+$/.test(text) ? Number(text) : null);
const result = effect => ({targets: [], effects: [effect]});
const colorNames = {white:'W',blue:'U',black:'B',red:'R',green:'G'};
const escape = value => String(value||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function extensionLine(card, line) {
  if (/\b(?:Instant|Sorcery)\b/.test(card.type_line||'')) return null;
  const subject = '(?:this (?:land|artifact|creature|enchantment|permanent|Aura)|' + escape(card.name) + ')';
  const entry = new RegExp('^(?:'+subject+' enters tapped\\. )?As (?:'+subject+'|it) enters, choose a color(?: other than (white|blue|black|red|green))?\\.$','i').exec(line);
  if (entry) return {kind:'chosen-color-entry-v8',colors:colors.filter(color=>color!==colorNames[entry[1]?.toLowerCase()]),tapped:/ enters tapped\./.test(line),contract:'as-enters-color-choice'};
  // A chosen-color reference must be bound on this complete source card.
  if (!/As .+? enters, choose a color(?: other than (?:white|blue|black|red|green))?\./i.test(card.oracle_text||'')) return null;
  const mana = /^\{T\}: Add (?:(\{[WUBRG]\}) or )?(one|two|three|four) mana of the chosen color(?:\. Spend this mana only to activate abilities of land sources)?\.$/.exec(line);
  if (mana) return {kind:'chosen-color-mana-v8',n:number(mana[2]),...(mana[1]?{fixed:mana[1][1]}:{}),...(line.includes('Spend this mana')?{landAbilities:true}:{}),contract:'chosen-color-mana-source'};
  return null;
}

// Enumerate printed fixed-color choices. Each object represents a distinct
// mana allocation that the ordinary payment planner can reserve and pay.
export function manaCombinations(n, allowed, distinct = false) {
  if (!Number.isSafeInteger(n) || n < 0 || n > 10 || !allowed.length || allowed.some(c => !colors.includes(c)) || new Set(allowed).size !== allowed.length) return null;
  const choices = [];
  const visit = (index, left, option) => {
    if (index === allowed.length) { if (!left) choices.push(option); return; }
    for (let count = Math.min(left, distinct ? 1 : left); count >= 0; count--)
      visit(index + 1, left - count, count ? {...option, [allowed[index]]: count} : option);
  };
  visit(0, n, {});
  return choices;
}

export function extensionEffect(card, line, h) {
  if (line.includes('\n')) return null;
  const text = line.replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').replace(/\.$/, '');
  let match = /^Add (one|two|three|four|five|six|seven|eight|nine|ten|\d+) mana in any combination of (colors|\{[WUBRG]\}(?:, \{[WUBRG]\})*(?:,? and\/or \{[WUBRG]\})?)$/i.exec(text);
  if (match) {
    const allowed = match[2].toLowerCase() === 'colors' ? colors : match[2].match(/[WUBRG]/g);
    const choices = manaCombinations(number(match[1].toLowerCase()), allowed);
    return choices?.length ? result({action: 'add-mana', choices}) : null;
  }
  match = /^Add (two|three|four|five|\d+) mana of different colors$/i.exec(text);
  if (match) {
    const choices = manaCombinations(number(match[1].toLowerCase()), colors, true);
    return choices?.length ? result({action: 'add-mana', choices}) : null;
  }
  match = /^Add (?:an amount of )?(\{[WUBRGC]\}) equal to (.+)$/i.exec(text);
  if (match) {
    const multiplier = h.value?.(match[2]) || h.count?.(match[2]);
    if (multiplier) return result({action: 'add-mana', produce: {[match[1][1]]: 1}, multiplier});
  }
  match = /^Add X mana of any one color, where X is (.+)$/i.exec(text);
  if (match) {
    const multiplier = h.value?.(match[1]) || h.count?.(match[1]);
    if (multiplier) return result({action: 'add-mana', choices: colors.map(c => ({[c]: 1})), multiplier});
  }
  match = /^(Add .+)\. Spend this mana only to cast (.+?)(?: or (?:to )?activate (?:an ability of (?:an? )?|abilities of )(.*))?$/i.exec(text);
  if (match) {
    const body = h.effect(card, match[1] + '.');
    if (body?.targets?.length || body?.effects?.length !== 1 || body.effects[0].action !== 'add-mana') return null;
    let phrase = match[2].replace(/^an? /i, '').replace(/spells$/i, 'spell');
    const from = /^(?:a )?spells? from (your graveyard|a graveyard|exile)$/i.exec(match[2]);
    const spell = from ? h.target('target spell') : h.target('target ' + phrase);
    if (spell?.zone !== 'stack') return null;
    let abilitySource;
    if (match[3]) {
      phrase = match[3].replace(/ sources?$/i, '').replace(/^(?:an? )?/i, '').replace(/(artifact|creature|enchantment|land|planeswalker)s$/i, '$1');
      abilitySource = h.target('target ' + phrase);
      if (abilitySource?.zone !== 'battlefield') return null;
    }
    return result({...body.effects[0], restriction: {spell, abilities: !!abilitySource, ...(abilitySource ? {abilitySource} : {}),
      ...(from ? {from: from[1].includes('graveyard') ? 'graveyard' : 'exile', ...(from[1] === 'your graveyard' ? {ownGraveyard: true} : {})} : {})}});
  }
  return null;
}
