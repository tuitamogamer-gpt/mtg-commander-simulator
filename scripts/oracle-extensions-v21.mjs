// Additive complete Oracle grammar. Successful v20 descriptors stay frozen.
import * as v20 from './oracle-extensions-v20.mjs';
import * as permanents from './oracle-v21-permanents.mjs';
import * as spells from './oracle-v21-spells.mjs';
import * as layouts from './oracle-v21-layouts.mjs';
import * as common from './oracle-v21-common.mjs';
export * from './oracle-extensions-v20.mjs';
const extensions = [common, permanents, spells, layouts];
function read(method, args) {
  for (const grammar of extensions) {
    const result = grammar[method]?.(...args);
    if (result !== null && result !== undefined) return result;
  }
  return v20[method]?.(...args) ?? null;
}
export const extensionEffect = (...args) => read('extensionEffect', args);
export const extensionLine = (...args) => read('extensionLine', args);
export const extensionCost = (...args) => read('extensionCost', args);
export const extensionCondition = (...args) => read('extensionCondition', args);
export const extensionCount = (...args) => read('extensionCount', args);
export const extensionValue = (...args) => read('extensionValue', args);
export const extensionTarget = (...args) => read('extensionTarget', args);
export const modifierOperation = (...args) => read('modifierOperation', args);
export const characteristicOperation = (...args) => read('characteristicOperation', args);
export const modalOperation = (...args) => read('modalOperation', args);
export const normalizeManaOperation = (...args) => read('normalizeManaOperation', args);
export const compileWholeCard = (...args) => read('compileWholeCard', args);
export const finalizeCompilation = (...args) => read('finalizeCompilation', args);
export function normalizeCard(card) {
  const normalized = v20.normalizeCard(card);
  return extensions.reduce((current, grammar) => grammar.normalizeCard?.(current, card) ?? current, normalized);
}
