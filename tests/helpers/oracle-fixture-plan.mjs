import assert from 'node:assert/strict';
import {semanticClass,rawCard,catalogCard} from '../../scripts/import-oracle-batch.mjs';
import {createOracleCompilerCache} from '../../scripts/oracle-compiler-cache.mjs';
import {fileURLToPath} from 'node:url';

// Keep every historical fallback in the canonical compiler, while memoizing
// identical source rows only inside this test process. Nested physical faces
// otherwise repeat the same historical rejection dozens of times.
export function fixtureCompiler(compilerVersion){
  const classificationCaches=new Map();
  const frozen=compilerVersion>56?createOracleCompilerCache({directory:fileURLToPath(new URL('../../output/oracle-classifier',import.meta.url)),compilerVersion:56}):null;
  for(let version=10;version<=compilerVersion;version++){
    const values=new Map();
    classificationCaches.set(version,{
      get(card){const result=values.get(JSON.stringify(card))||(version===56?frozen?.get(card):undefined);return result&&structuredClone(result);},
      set(card,result){values.set(JSON.stringify(card),structuredClone(result));},
    });
  }
  return card=>{
    const {catalog_reason,analysis_difficulty_score,analysis_oracle_length,...source}=card;
    return semanticClass(source,{compilerVersion,classificationCaches});
  };
}

export function createFixturePlan(rows,compilerVersion,sequence){
  const classify=fixtureCompiler(compilerVersion);
  const cards=rows.map((card,index)=>{
    const result=classify(card);
    assert.ok(result.semanticClass,card.name+': '+result.reason);
    return {position:index+1,oracleId:card.oracle_id,scryfallId:card.id,...result,raw:rawCard(card),catalog:catalogCard(card)};
  });
  return {classify,report:{schemaVersion:1,id:'oracle-fixture-'+sequence,sequence,source:{bulkType:'oracle_cards'},cards}};
}
