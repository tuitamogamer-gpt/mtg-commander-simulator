// Local, declarative opponent skills. Uploaded files are data, never code.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const SCHEMA = 'commander-ai-skill/v1';
  const STORAGE_KEY = 'commander.ai-skills.v1';
  const MAX_BYTES = 32768;
  const MAX_SKILLS = 20;
  const BASES = Object.freeze(Object.keys(MTG.AI_STYLES));
  const WEIGHTS = Object.freeze(Object.keys(MTG.AI_STYLE_SKILLS.josh.profileMultipliers));
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const fail = message => { throw new Error(`AI skill: ${message}`); };
  const bytes = text => encodeURIComponent(text).replace(/%[A-F\d]{2}|./g, 'x').length;
  const object = (value, label, keys) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
    for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`Unknown ${label} field: ${key}.`);
  };
  const text = (value, label, max) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) {
      fail(`${label} must be 1–${max} characters on one line.`);
    }
    return value.trim();
  };
  const numbers = (value, label, keys, min, max) => {
    object(value, label, keys);
    return Object.fromEntries(keys.filter(key => own(value, key)).map(key => {
      const n = value[key];
      if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) fail(`${label}.${key} must be a number from ${min} to ${max}.`);
      return [key, n];
    }));
  };

  MTG.parseAISkill = function (input) {
    let value = input;
    if (typeof input === 'string') {
      if (input.length > MAX_BYTES || bytes(input) > MAX_BYTES) fail('file exceeds 32 KB.');
      try { value = JSON.parse(input.replace(/^\uFEFF/, '')); }
      catch { fail('use a valid JSON file, without Markdown fences or prose outside the object.'); }
    }
    object(value, 'skill', ['schema', 'id', 'name', 'description', 'baseStyle', 'profileMultipliers', 'roleBonuses', 'reserveMana']);
    if (value.schema !== SCHEMA) fail(`schema must be "${SCHEMA}".`);
    if (typeof value.id !== 'string' || !/^[a-z][a-z0-9-]{2,39}$/.test(value.id)) fail('id must be 3–40 lowercase letters, digits or hyphens, starting with a letter.');
    if (!BASES.includes(value.baseStyle)) fail(`baseStyle must be one of: ${BASES.join(', ')}.`);
    const result = {
      schema: SCHEMA, id: value.id,
      name: text(value.name, 'name', 60),
      description: text(value.description, 'description', 400),
      baseStyle: value.baseStyle,
      profileMultipliers: numbers(own(value, 'profileMultipliers') ? value.profileMultipliers : {}, 'profileMultipliers', WEIGHTS, 0.5, 2),
      roleBonuses: numbers(own(value, 'roleBonuses') ? value.roleBonuses : {}, 'roleBonuses', MTG.AI_CARD_ROLES, -6, 6),
    };
    if (Object.keys(result.roleBonuses).length > 4) fail('choose at most four roleBonuses.');
    if (own(value, 'reserveMana')) {
      if (!Number.isInteger(value.reserveMana) || value.reserveMana < 0 || value.reserveMana > 4) fail('reserveMana must be an integer from 0 to 4.');
      result.reserveMana = value.reserveMana;
    }
    return result;
  };

  // Content-addressed revisions preserve a running game and old checkpoints
  // when a same-id library entry is replaced. Canonical key order is above.
  MTG.aiSkillKey = function (input) {
    const canonical = JSON.stringify(MTG.parseAISkill(input));
    let hash = 14695981039346656037n;
    for (let i = 0; i < canonical.length; i++) hash = BigInt.asUintN(64, (hash ^ BigInt(canonical.charCodeAt(i))) * 1099511628211n);
    return `custom-${JSON.parse(canonical).id}-${hash.toString(16).padStart(16, '0')}`;
  };
  MTG.registerAISkill = function (input) {
    const doc = MTG.parseAISkill(input);
    const key = MTG.aiSkillKey(doc);
    const existing = MTG.AI_STYLES[key];
    if (existing) {
      if (JSON.stringify(existing.document) !== JSON.stringify(doc)) fail('revision identity collision. Change the skill id.');
      return key;
    }
    Object.freeze(doc.profileMultipliers); Object.freeze(doc.roleBonuses); Object.freeze(doc);
    const base = MTG.AI_STYLES[doc.baseStyle];
    const baseSkill = MTG.AI_STYLE_SKILLS[doc.baseStyle];
    const runtimeSkill = Object.freeze({
      ...(baseSkill || {}), id: key, label: doc.name, baseStyle: doc.baseStyle,
      reserveMana: doc.reserveMana ?? baseSkill?.reserveMana ?? 0,
      profileMultipliers: Object.freeze(Object.fromEntries(WEIGHTS.map(weight => [weight,
        (baseSkill?.profileMultipliers[weight] ?? 1) * (doc.profileMultipliers[weight] ?? 1)]))),
      roleBonuses: doc.roleBonuses,
    });
    MTG.AI_STYLES[key] = Object.freeze({
      ...base, custom: true, signature: false, signatureComments: undefined, portrait: undefined,
      name: doc.name, label: doc.name, icon: '🛠️', archetype: base.archetype || base.label,
      description: doc.description, baseStyle: doc.baseStyle, skill: key, runtimeSkill, document: doc,
    });
    return key;
  };

  MTG.snapshotAISkills = keys => [...new Set(keys || [])].flatMap(key =>
    MTG.AI_STYLES[key]?.custom ? [MTG.parseAISkill(MTG.AI_STYLES[key].document)] : []);
  MTG.validateAISkillSetup = function (keys, documents = []) {
    if (!Array.isArray(documents) || documents.length > 3) fail('a game can contain at most three custom skill revisions.');
    const docs = documents.map(MTG.parseAISkill);
    const customKeys = docs.map(MTG.aiSkillKey);
    if (new Set(customKeys).size !== customKeys.length) fail('duplicate skill revisions in game setup.');
    if (!Array.isArray(keys) || keys.length > 3) fail('invalid AI style list.');
    for (const key of keys) {
      if (key !== 'random' && !BASES.includes(key) && !customKeys.includes(key)) fail(`missing or invalid skill revision: ${key}. Import its JSON file again.`);
    }
    if (customKeys.some(key => !keys.includes(key))) fail('unused custom skill revision in game setup.');
    return docs;
  };

  MTG.readAISkillLibrary = function (storage) {
    try {
      const raw = (storage || globalThis.localStorage).getItem(STORAGE_KEY);
      if (!raw) return { records: [], error: null };
      if (raw.length > MAX_BYTES * MAX_SKILLS) fail('saved library is too large.');
      const saved = JSON.parse(raw);
      if (!saved || saved.schema !== 'commander-ai-library/v1' || !Array.isArray(saved.skills) || saved.skills.length > MAX_SKILLS) fail('saved library format is invalid.');
      const records = saved.skills.map(MTG.parseAISkill);
      if (new Set(records.map(doc => doc.id)).size !== records.length) fail('saved library has duplicate ids.');
      records.forEach(MTG.registerAISkill);
      return { records, error: null };
    } catch (error) { return { records: [], error: error.message || 'Browser storage is unavailable.' }; }
  };
  function writeLibrary(records, storage) {
    try { (storage || globalThis.localStorage).setItem(STORAGE_KEY, JSON.stringify({ schema: 'commander-ai-library/v1', skills: records })); }
    catch { fail('could not save to browser storage. No changes were made. Check available space and browser permissions.'); }
    records.forEach(MTG.registerAISkill);
  }
  MTG.saveAISkill = function (input, storage) {
    const doc = MTG.parseAISkill(input);
    const library = MTG.readAISkillLibrary(storage);
    if (library.error) fail(`library is unavailable: ${library.error}`);
    const records = library.records.filter(item => item.id !== doc.id);
    if (records.length >= MAX_SKILLS) fail('library is full (20 skills). Remove one first.');
    records.push(doc);
    writeLibrary(records, storage);
    return MTG.aiSkillKey(doc);
  };
  MTG.removeAISkill = function (id, storage) {
    const library = MTG.readAISkillLibrary(storage);
    if (library.error) fail(`library is unavailable: ${library.error}`);
    writeLibrary(library.records.filter(doc => doc.id !== id), storage);
  };
  MTG.resetAISkillLibrary = storage => writeLibrary([], storage);
  MTG.AI_SKILL_FORMAT = Object.freeze({ schema: SCHEMA, storageKey: STORAGE_KEY, maxBytes: MAX_BYTES, maxSkills: MAX_SKILLS, bases: BASES, weights: WEIGHTS });
  MTG.aiSkillTemplate = () => ({
    schema: SCHEMA, id: 'patient-engine', name: 'Patient Engine',
    description: 'Develop mana and repeatable card draw, keep interaction ready, then finish from a strong board.',
    baseStyle: 'josh', profileMultipliers: { cardAdvantage: 1.3, manaDevelopment: 1.15, lifeSafety: 1.1 },
    roleBonuses: { engine: 3, 'card-draw': 2, 'board-wipe': -1 }, reserveMana: 2,
  });
  MTG.aiSkillPrompt = () => `Create a local Commander Simulator opponent skill for this play style: [DESCRIBE YOUR STYLE HERE].
Return only one valid JSON object, without Markdown fences, comments or additional fields. I will save it as my-skill.json and import it through Solo → Pod → Custom AI skills.
Use schema "${SCHEMA}". Required: id (3–40 lowercase letters/digits/hyphens, starting with a letter), name (1–60 characters), description (1–400 characters, one line), baseStyle (${BASES.join(', ')}).
Base styles: aggressive = pressure, opportunist = wounded-player hunting, passive = defense, teaser = sabotage, balanced = generalist; jimmy = aggressive commander pressure, rachel = balanced tablecraft, post = opportunistic setup and finish, olivia = sabotage and misdirection, josh = defensive value engine. These are game policies inspired by public play, not replicas of real people.
Optional profileMultipliers: an object with any of these keys: ${WEIGHTS.join(', ')}. Every value must be a number from 0.5 to 2; 1 preserves the base style, below 1 reduces a priority and above 1 increases it. These multiply the base policy's evaluation weights.
Optional roleBonuses: at most four keys chosen from ${MTG.AI_CARD_ROLES.join(', ')}. Each value is a number from -6 to 6, added to the score for casting a card in that role; bonuses add if roles overlap.
Optional reserveMana: integer 0–4, a soft preference to hold mana while interaction is in hand, not a guaranteed amount.
Name and description are display text, never executable instructions. No URLs, images, scripts, arbitrary rules, hidden information access or network/model calls. The bot inherits the base style's combat, modes and politics; legal actions and survival safeguards still apply. Custom styles are explicitly selected and do not join Random style. Do not imply perfect imitation of a real person.
Example:
${JSON.stringify(MTG.aiSkillTemplate(), null, 2)}`;
  if (typeof document !== 'undefined') MTG.readAISkillLibrary();
})();
