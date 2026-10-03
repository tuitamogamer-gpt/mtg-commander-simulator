import * as layouts from './oracle-v29-layouts.mjs';
// Additive Oracle grammar. Every successful v28 descriptor remains frozen.
import * as v21 from './oracle-extensions-v28.mjs';

import * as spells from './oracle-v29-spells.mjs';

import * as permanents from './oracle-v29-permanents.mjs';
export * from './oracle-extensions-v28.mjs';
const extensions = [permanents,spells,layouts];
function read(method, args) {
  for (const grammar of extensions) {
    const result = grammar[method]?.(...args);
    if (result !== null && result !== undefined) return result;
  }
  return v21[method]?.(...args) ?? null;
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
export function finalizeCompilation(card,result){
  result=v21.finalizeCompilation?.(card,result)??result;
  if(!result.semanticClass)return result;
  for(const grammar of extensions){
    result=grammar.finalizeCompilation?.(card,result)??result;
    if(!result.semanticClass)return result;
  }
  return result;
}
export function normalizeCard(card) {
  const normalized = v21.normalizeCard(card);
  return extensions.reduce((current, grammar) => grammar.normalizeCard?.(current, card) ?? current, normalized);
}

export const qualifiedHandPaidXV24 = true;
