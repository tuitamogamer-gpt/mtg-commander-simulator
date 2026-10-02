// Closed equivalent Oracle clauses shared by the v21 grammar.
const N = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)';
const number = value => ({a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[value] ?? Number(value));
export function normalizeCard(card) {
  const normalize = text => String(text || '').replace(/\bthis creature (enter|die|become)(?= |,|\.)/g, (_all,verb)=>'this creature '+({enter:'enters',die:'dies',become:'becomes'}[verb]));
  return {...card,oracle_text:normalize(card.oracle_text),...(card.card_faces?{card_faces:card.card_faces.map(face=>({...face,oracle_text:normalize(face.oracle_text)}))}:{})};
}

export function extensionCondition(text, h) {
  // Conjunctions join two independently complete conditions. A bare noun
  // on one side is never silently inferred from the other side.
  for (const [separator, kind] of [[' and ', 'all'], [' or ', 'any']]) {
    for (let index = text.indexOf(separator); index >= 0; index = text.indexOf(separator, index + separator.length)) {
      const left = h.condition(text.slice(0, index));
      const right = h.condition(text.slice(index + separator.length));
      if (left && right) return {kind, conditions:[left, right]};
    }
  }
  const cards = new RegExp('^you have ('+N+') or (more|fewer) (cards?|creature cards?|artifact cards?|land cards?|permanent cards?|instant and sorcery cards?) in (?:your )?(hand|graveyard)$').exec(text);
  if (cards) {
    const count = h.count(cards[3].replace(/ card$/,' cards').replace(/^card$/,'cards')+' in your '+cards[4]);
    if (count) return {kind:'count-comparison', count, [cards[2] === 'more' ? 'min' : 'max']:number(cards[1])};
  }
  const source = /^(?:it|this creature|this artifact|this enchantment|this permanent) (has|doesn't have|does not have) (flying|first strike|double strike|deathtouch|lifelink|trample|haste|vigilance|menace|reach|defender|indestructible|hexproof|shroud)$/.exec(text);
  if (source) {
    const filter = h.target('target creature with '+source[2]);
    if (filter) { const condition = {kind:'source-quality', filter:{...filter,what:'permanent'}}; return source[1] === 'has' ? condition : {kind:'not', condition}; }
  }
  const token = /^(?:it|this creature|this artifact|this enchantment|this permanent) (is|isn't|is not) (?:a )?(token|legendary)$/.exec(text);
  if (token) {
    const filter = {what:'permanent',zone:'battlefield',controller:'any',[token[2] === 'token' ? 'token' : 'legendary']:true};
    const condition = {kind:'source-quality',filter};
    return token[1] === 'is' ? condition : {kind:'not',condition};
  }
  const discarded = new RegExp('^an opponent (?:discarded (?:a|one) card|(?:has |had )?discarded ('+N+') or more cards) this turn$').exec(text);
  if (discarded) return {kind:'opponent-count-range',count:{kind:'turn-count',field:'discardedN'},min:discarded[1] ? number(discarded[1]) : 1};
  const life = new RegExp('^an opponent lost ('+N+') or more life this turn$').exec(text);
  if (life) return {kind:'opponent-count-range',count:{kind:'turn-count',field:'lifeLost'},min:number(life[1])};
  const noCounters = /^(?:it|this creature|this artifact|this enchantment|this permanent) has no counters on it$/.test(text);
  if (noCounters) return {kind:'count-comparison',count:{kind:'v8-permanent-count',test:'source-counter-total'},max:0};
  const status = /^(?:it|this creature|this artifact|this enchantment|this land|this Equipment|this permanent) is (tapped|untapped|attacking|blocking)$/.exec(text);
  if (status) return {kind:'source-status',status:status[1]};
  const quality = /^(?:it|this creature|this artifact|this enchantment|this permanent) is(?: an?| the)? (white|blue|black|red|green|colorless|multicolored|creature|artifact|enchantment|land|planeswalker|Vehicle|Equipment|[A-Z][A-Za-z'-]+)(?: or (?:an? )?([A-Z][A-Za-z'-]+))?$/.exec(text);
  if (quality) {
    const filters = [quality[1],quality[2]].filter(Boolean).map(noun=>h.target('target '+noun+(/^(?:white|blue|black|red|green|colorless|multicolored)$/.test(noun)?' permanent':'')));
    if (filters.every(filter=>filter?.zone==='battlefield')) return filters.length===1?{kind:'source-quality',filter:filters[0]}:{kind:'any',conditions:filters.map(filter=>({kind:'source-quality',filter}))};
  }
  const noLibrary = /^(?:there are no cards in your library|your library is empty)$/.test(text);
  if (noLibrary) return {kind:'count-comparison',count:{kind:'count',zone:'library',what:'card'},max:0};
  if (text === "it's not your turn") return {kind:'not-your-turn'};
  const top = /^the top card of your library is (black|white|blue|red|green|a creature card|a land card|an artifact card|an enchantment card)$/.exec(text);
  if (top) {
    const phrase = top[1].replace(/^a |^an /,'');
    const filter = h.target('target '+phrase+(phrase.endsWith('card')?'':' card')+' from your graveyard');
    if (filter) return {kind:'common-condition-v21',test:'top-card',filter};
  }
  if (/^(?:it|this creature|this Equipment|this artifact|this permanent) is attached to a creature$/.test(text)) return {kind:'common-condition-v21',test:'attached-to-creature'};
  return null;
}

export function extensionEffect(card,line,h) {
  const emblem = /^You get an emblem with "([^"\n]+)"\.?$/.exec(line);
  if (!emblem) return null;
  const text = emblem[1].replace(/\bthis emblem\b/g,'this permanent').replace(/'([^']+:[^']+)'/g,'"$1"');
  const operation = h.line({...card,name:card.name+' Emblem',type_line:'Enchantment'},text);
  if (!operation || !['generic-trigger','generic-static'].includes(operation.kind)) return null;
  if (operation.kind === 'generic-static') {
    const allowed = new Set(['kind','contract','scope','filters','excludeSelf','subtype','power','toughness','keywords','grantedOperation']);
    if (operation.scope === 'self' || Object.keys(operation).some(key=>!allowed.has(key))) return null;
    const grant=operation.grantedOperation;
    // The new grant family has a complete activation and a directly observable
    // tap/draw result. More complex emblem grants need their own proof.
    if(grant && !(grant.kind==='generic-ability' && JSON.stringify(grant.cost)==='{"tap":true}' && !grant.targets?.length && !grant.optional && grant.effects?.length===1 && grant.effects[0].action==='draw' && grant.effects[0].who==='you' && grant.effects[0].n===1))return null;
  }
  if (operation.kind === 'generic-trigger' && (operation.zone || operation.from || operation.onceEachTurn || operation.oncePerBatch || operation.stateTest || operation.modalBody || operation.v4Body || operation.eventFilter?.perDefender || /"self"|source-stat|source-counters/.test(JSON.stringify(operation)) || [].concat(operation.event).some(event=>/mana/i.test(event)||event==='abilityActivated'))) return null;
  return {effects:[{action:'create-emblem-v11',operations:[operation],text:emblem[1]}],targets:[],optional:false};
}

export function extensionLine(card,line,h) {
  const attached = /^As long as enchanted (?:creature|permanent|artifact|land) (.+?), (?:it|enchanted (?:creature|permanent|artifact|land)) (.+)\.$/.exec(line);
  if (attached) {
    const condition = h.condition('this permanent '+attached[1]);
    const grant = /^(?:gets ([+-]\d+)\/([+-]\d+)(?: and has (.+))?|has (.+))$/.exec(attached[2]);
    const keywords = grant && h.keywordList(grant[3] || grant[4] || '');
    const operation = grant && (!(grant[3] || grant[4]) || keywords) ? {kind:'attachment-grant',power:Number(grant[1]||0),toughness:Number(grant[2]||0),keywords:keywords||[],contract:'attachment-continuous-effect'} : attached[2]==="doesn't untap during its controller's untap step" ? {kind:'attachment-grant',power:0,toughness:0,keywords:[],skipUntap:true,contract:'attachment-continuous-effect'} : h.line(card,'Enchanted permanent '+attached[2]+'.');
    if (condition && ['attachment-grant','attachment-operation'].includes(operation?.kind) && !operation.condition) return {...operation,conditionSubject:'affected',condition};
  }
  return null;
}

export function extensionTarget(text, h) {
  const mixed = /^target (.+, .+(?:,? or .+))$/.exec(text);
  if (mixed) {
    const nouns=mixed[1].split(/,? or |, /);
    if(nouns.length>=3 && nouns.every(noun=>/^(?:[A-Z][A-Za-z'-]+(?: [A-Z][A-Za-z'-]+)? )?(?:creature(?: token)?|artifact|enchantment|land|planeswalker|battle|player|opponent)$/.test(noun))){
      const alternatives=nouns.map(noun=>h.target('target '+noun));
      if(alternatives.every(Boolean))return {what:'any',zone:alternatives.some(row=>row.zone==='player')?'any':'battlefield',controller:'any',min:1,alternatives};
    }
  }
  const union = /^(target )((?:creature token|creature|artifact|enchantment|land|planeswalker|battle|player|opponent)(?:, (?:creature token|creature|artifact|enchantment|land|planeswalker|battle|player|opponent))*,? or (?:creature token|creature|artifact|enchantment|land|planeswalker|battle|player|opponent))$/.exec(text);
  if (union) {
    const alternatives = union[2].split(/,? or |, /).map(noun => h.target('target '+noun));
    if (alternatives.every(Boolean)) return {what:'any',zone:alternatives.some(row=>row.zone==='player')?'any':'battlefield',controller:'any',min:1,alternatives};
  }
  return null;
}
// The inherited damage-recipient binding interprets "It" as the damaged
// opponent. Bind this complete new v21 rule to the returned incarnation.
export function finalizeCompilation(card,frozen){
  if(card.layout!=='normal'||card.name!=='Bloodfeather Phoenix'||card.oracle_text!=='Flying\nThis creature can\'t block.\nWhenever an instant or sorcery spell you control deals damage to an opponent or battle, you may pay {R}. If you do, return this card from your graveyard to the battlefield. It gains haste until end of turn.')return null;
  const result=structuredClone(frozen),trigger=result.implementation.find(op=>op.eventFilter?.kind==='damage-event-v8'&&op.zone==='graveyard'),payment=trigger?.effects?.[0];
  if(payment?.action!=='optional-payment'||payment.effects?.length!==2||payment.effects[0].action!=='return-grave-source'||payment.effects[1].action!=='pump'||payment.effects[1].target!=='event-card'||payment.effects[1].keywords?.join()!=='haste')return null;
  payment.effects=[{...payment.effects[0],keywordsUntilEOTV21:['haste']}];
  return result;
}
