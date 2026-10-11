import test from 'node:test';
import {loadEngine} from './helpers/load-engine.mjs';
import {proveLearnChoice} from './helpers/learn-choice-proof.mjs';
const M=loadEngine();
for(const role of ['human','ai'])for(const key of ['discard','none'])test(`${role}: paid Cram Session preserves native Learn ${key} choice`,()=>proveLearnChoice(M,role,key));
