import assert from 'node:assert/strict';
import {semanticClass,rawCard,catalogCard,runtimeBatch} from '../../scripts/import-oracle-batch.mjs';
import {createOracleCompilerCache} from '../../scripts/oracle-compiler-cache.mjs';
import {fileURLToPath} from 'node:url';

// Keep every historical fallback in the canonical compiler, while memoizing
// identical source rows inside this test process. Persist only independently
// compiled frozen-version results under their exact source/compiler hashes;
// nested physical faces otherwise repeat historical rejection across suites.
export function fixtureCompiler(compilerVersion){
  const classificationCaches=new Map();
  const frozenVersion=compilerVersion>63?63:56;
  const frozen=compilerVersion>frozenVersion?createOracleCompilerCache({directory:fileURLToPath(new URL('../../output/oracle-classifier',import.meta.url)),compilerVersion:frozenVersion}):null;
  for(let version=10;version<=compilerVersion;version++){
    const values=new Map();
    classificationCaches.set(version,{
      get(card){const result=values.get(JSON.stringify(card))||(version===frozenVersion?frozen?.get(card):undefined);return result&&structuredClone(result);},
      set(card,result){values.set(JSON.stringify(card),structuredClone(result));if(version===frozenVersion)frozen?.set(card,result);},
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

// The same canonical fixtures run before and after installation. Reuse an
// installed row only after proving its complete source and executable
// descriptors equal the independently compiled fixture; register the rest.
export function registerCanonicalFixturePlan(M,plan){
  const batch=runtimeBatch(plan.report);
  const installed=new Map(M.ORACLE_BATCHES.flatMap(existing=>existing.cards).map(entry=>[entry.raw.name,entry]));
  const normalized=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const missing=[];
  for(const entry of batch.cards){
    const existing=installed.get(entry.raw.name);
    if(!existing){missing.push(entry);continue;}
    for(const key of ['oracleId','scryfallId','semanticClass','raw','catalog','implementedKeywords','oracleContracts','implementation']){
      assert.deepEqual(normalized(existing[key]),normalized(entry[key]),entry.raw.name+': installed canonical '+key);
    }
  }
  if(missing.length)M.registerOracleBatch({...batch,cards:missing});
  M.initData(M.RAW_DATA);
}
