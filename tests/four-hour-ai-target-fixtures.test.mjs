import test from 'node:test';
import {loadEngine} from './helpers/load-engine.mjs';
import {proveAITargetChoice} from './helpers/ai-target-choice-proof.mjs';
const M=loadEngine();
for(const role of ['human','ai'])for(const name of ['Explosive Getaway','Floodbringer'])for(const alternate of [false,true])test(`${role}: paid ${name} native target alternative ${alternate}`,()=>proveAITargetChoice(M,name,role,alternate));
