import {extensionLine as extraLine} from './oracle-v74-extra.mjs';
// Complete closed clauses for the static legendary cohort.
const rule = mode => ({kind:'legend-static-extra-v74', mode, contract:'generic-continuous-effect'});
export function extensionLine(card, line, h) {
  if (line === "Spells and abilities your opponents control can't cause you to sacrifice permanents.") return {kind:'opponent-sacrifice-ban-v74', contract:'generic-continuous-effect'};
  if (line === 'Lethal damage dealt to creatures you control is determined by their power rather than their toughness.') return rule('zilortha');
  if (line === 'A player losing unspent mana causes that player to lose that much life.') return rule('yurlok');
  if (line === '{1}, {T}: Each player adds {B}{R}{G}.') return {kind:'mana-source',activationCost:{mana:'{1}',tap:true},produce:[{B:1,R:1,G:1}],afterEffects:[{action:'legend-static-effect-v74',mode:'others-mana'}],contract:'mana-source'};
  if (line === 'Each Fungus creature gets +1/+1 for each spore counter on it.') return rule('thelon-pump');
  if (line === '{B}{G}, Exile a Fungus card from a graveyard: Put a spore counter on each Fungus on the battlefield.') return {kind:'legend-static-extra-v74',mode:'thelon-ability',contract:'generic-activated-effect'};
  if (/^(?:Captain America|This creature) enters with a shield counter on (?:him|it|this creature)\.$/.test(line)) return {kind:'enters-with-counters',counter:'shield',n:1,contract:'permanent-enters-with-counters'};
  if (/^As long as (?:Captain America|this creature) has a shield counter on (?:him|it|this creature), you and other Heroes you control have hexproof\.$/.test(line)) return rule('captain');
  if (line === "Lands on the battlefield and land cards in graveyards can't be the targets of spells or abilities your opponents control.") return rule('tomik-targets');
  if (line === "Your opponents can't play land cards from graveyards.") return rule('tomik-lands');
  if (line === 'Planeswalkers you control have "No more than one creature can attack this planeswalker each combat."') return rule('tomik-attacks');
  if (line === '{T}: Target creature with a +1/+1 counter on it gains flying until end of turn.') {
    const target = h.target('target creature');
    return {kind:'generic-ability',cost:{tap:true},effects:[{action:'pump',target:0,power:0,toughness:0,keywords:['flying']}],targets:[{...target,v20:{kind:'plus-counter-v74'}}],optional:false,contract:'generic-activated-effect'};
  }
  if (line.replace(/^Delirium — /,'') === "As long as there are four or more card types among cards in your graveyard, each opponent's maximum hand size is equal to seven minus the number of those card types.") return rule('winter');
  if (/^As (?:Haktos|this creature) enters, choose 2, 3, or 4 at random\.$/.test(line)) return rule('haktos-choice');
  if (/^(?:Haktos|This creature) has protection from each mana value other than the chosen number\.$/.test(line)) return rule('haktos-protection');
  if (line === '{T}: Add {G}{W}. Spend this mana only to cast creature spells with no abilities.') return {kind:'mana-source',activationCost:{tap:true},produce:[{G:1,W:1}],restriction:{spell:{what:'spell',zone:'stack',min:1,spellFilter:{what:'creature',zone:'battlefield',v20:{kind:'no-abilities-v74'}}}},contract:'mana-source'};
  if (line === "Creatures you control with no abilities can't be blocked by creatures with abilities.") return rule('jasmine');
  if (line === 'The first time you would draw a card each turn except the first card you draw during each of your draw steps, you draw four cards instead.') return rule('reed');
  if (line === 'If there are exactly two permanents named Brothers Yamazaki on the battlefield, the "legend rule" doesn\'t apply to them.') return rule('brothers-legend');
  if (line === 'Each other creature named Brothers Yamazaki gets +2/+2 and has haste.') return rule('brothers-pump');
  return extraLine(card,line,h);
}
