import assert from 'node:assert/strict';

export async function proveOracleAwaken(MTG,ctx,entry,operation,source,h){
 const {game,a}=ctx;
 h.permanent(MTG,game,a,'Forest');
 const before=new Map(game.bf().map(card=>[card.iid,{counter:card.counters['+1/+1']||0,version:card.zoneVersion}]));
 const option=game.castableList(a).find(row=>row.card===source&&row.alt?.oracleAwaken);
 assert.ok(option,entry.raw.name+': fully payable Awaken option with every original target');
 const expected=game.spellCost(a,source,{...option.alt,from:'hand'});
 assert.equal(await game.castSpell(a,source,{from:'hand',alt:option.alt}),true,entry.raw.name+': real Awaken alternative is cast');
 const so=game.stack.find(row=>row.card===source),land=so?.targets.at(-1),old=before.get(land?.iid);
 assert.ok(old&&land.ctrl===a&&land.is('Land'),entry.raw.name+': announced Awaken target is a controlled land');
 assert.equal(so.castOpts.oracleAwaken,true);assert.equal(so.manaSpent,expected.generic+expected.pips.length,entry.raw.name+': full printed alternative plus adjustments paid');
 await h.resolveAll(game);
 assert.equal(land.zone,'battlefield');assert.equal(land.zoneVersion,old.version);
 assert.ok(land.counters['+1/+1']>=old.counter+operation.n,entry.raw.name+': Awaken placed its counters');
 assert.ok(land.is('Land')&&land.is('Creature')&&land.hasSub('Elemental')&&land.kw('haste'),entry.raw.name+': permanent Elemental land creature retains land and gains haste');
 assert.equal(land.cur.basePower,0);assert.equal(land.cur.baseToughness,0);
 assert.ok(game.untilEffects.some(effect=>effect.kind==='oracleAnimation'&&effect.iid===land.iid&&effect.zoneVersion===land.zoneVersion&&effect.expires==='object'));
 return 9;
}
