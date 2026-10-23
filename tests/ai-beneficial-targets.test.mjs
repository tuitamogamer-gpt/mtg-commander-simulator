import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

// Every unhinted target whose rules text only helps it must be aimed at the
// bot's own creature, never handed to an opponent (Estrid's Mask, protection,
// counters, pumps, Equipment moves). Harmful or two-way effects are expected
// to pick the opponent and are listed explicitly.
const EXPECTED_HOSTILE = new Set([
  'Nameless Inversion', 'Blood Lust', 'Xathrid Gorgon', 'Bomb Squad',
  'Fatestitcher', 'Tideforce Elemental',
  // The Aura being moved is chosen first; without it the scan cannot judge.
  'Aura Finesse',
]);

test('the bot never aims a purely beneficial unhinted target at an opponent', { timeout: 300000 }, async () => {
  const MTG = loadEngine();
  const BENEFIT=/(attach(?:ed)? [^.]{0,40}to (?:another )?target|enchant(?:ed)? [^.]{0,30}target|put (?:a|an|one|two|three|x|that many) [^.]*?counters? on (?:another )?target|target [^.]{0,60}?(?:gets \+|gains? (?:hexproof|indestructible|flying|trample|haste|lifelink|vigilance|first strike|double strike|protection|shroud|menace|deathtouch))|untap (?:another )?target|attached to (?:another )?target|regenerate target|target creature you control|attach [^.]* to target)/i;
  const HARM=/(destroy|exile|damage|-\d+\/-\d+|gets -|sacrifice|tap target|return target [^.]* to (?:its|their) owner'?s hand|can't (?:block|attack))/i;
  const g=new MTG.Game({seed:3,paced:false});const bot=g.addPlayer('Bot',{name:'b'},null,true),opp=g.addPlayer('Opp',{name:'o'},{decide:async()=>({kind:'pass'})},false);
  bot.controller=new MTG.AIController(bot,{difficulty:'hard',style:'balanced'});
  const put=(n,p)=>{const c=new MTG.CardInst(MTG.DEFS[n],p);c.zone='battlefield';c.ctrl=p;c.sick=false;g.battlefield.push(c);return c;};
  const own=put('Grizzly Bears',bot),foe=put('Grizzly Bears',opp);
  g.turnPlayer=bot;g.phase='main1';g.step='main';g.turnNo=5;g.recalc();
  const out=[];
  for(const [name,def] of Object.entries(MTG.DEFS)){
    if(!def||def.isTokenDef)continue;
    const rows=[];
    for(const a of def.abilities||[])rows.push({kind:'ability',label:a.label||a.desc||'',targets:a.targets,loyalty:a.loyalty,ability:a});
    for(const t of def.triggers||[])rows.push({kind:'trigger',label:t.desc||t.on||'',targets:t.targets});
    if(def.targets)rows.push({kind:'spell',label:'spell',targets:def.targets});
    if(!rows.some(r=>r.targets))continue;
    const src=new MTG.CardInst(def,bot);src.zone='battlefield';src.ctrl=bot;
    for(const row of rows){
      let specs=row.targets;
      try{if(typeof specs==='function')specs=specs(g,src,{card:src},bot);}catch{continue;}
      if(!Array.isArray(specs))continue;
      for(const spec of specs){if(!spec||spec.aiHint)continue;
      const text=row.label&&row.label.length>12?row.label:(def.oracle||'');
      if(!BENEFIT.test(text)||HARM.test(text))continue;
      let legal;try{legal=g.legalTargets(spec,src,bot);}catch{continue;}
      if(!legal.includes(own)||!legal.includes(foe))continue;
      let pick;try{pick=await bot.controller.decide(g,{type:'chooseTargets',player:bot,candidates:[own,foe],min:1,max:1,spec,aiHint:spec.aiHint,src,ability:row.ability||null,effectText:row.kind==='trigger'?row.label:null,prompt:'scan'});}catch(e){continue;}
      const chosen=[pick].flat()[0];
      if(chosen===foe)out.push(`${name} | ${row.kind} | ${String(text).replace(/\n/g,' ').slice(0,110)}`);
    }}
  }
  
  const unexpected = out.filter(line => !EXPECTED_HOSTILE.has(line.split(' | ')[0]));
  assert.deepEqual(unexpected, []);
});

// The mirror case: unhinted removal, damage, shrinking or combat denial must
// never be aimed at the bot's own more valuable creature.
test('the bot never aims an unhinted harmful target at its own creature', { timeout: 300000 }, async () => {
  const MTG = loadEngine();
  const HARMFUL=/(destroy target|exile target|deals? \d+ damage to (?:target|any)|target creature gets -|put a -1\/-1 counter on target|tap target creature|target creature can't (?:block|attack))/i;
  const BENEFIT=/(attach(?:ed)? [^.]{0,40}to (?:another )?target|enchant(?:ed)? [^.]{0,30}target|put (?:a|an|one|two|three|x|that many) [^.]*?counters? on (?:another )?target|target [^.]{0,60}?(?:gets \+|gains? (?:hexproof|indestructible|flying|trample|haste|lifelink|vigilance|first strike|double strike|protection|shroud|menace|deathtouch))|untap (?:another )?target|attached to (?:another )?target|regenerate target|target creature you control|attach [^.]* to target)/i;
  const HARM=/(destroy|exile|damage|-\d+\/-\d+|gets -|sacrifice|tap target|return target [^.]* to (?:its|their) owner'?s hand|can't (?:block|attack))/i;
  const g=new MTG.Game({seed:3,paced:false});const bot=g.addPlayer('Bot',{name:'b'},null,true),opp=g.addPlayer('Opp',{name:'o'},{decide:async()=>({kind:'pass'})},false);
  bot.controller=new MTG.AIController(bot,{difficulty:'hard',style:'balanced'});
  const put=(n,p)=>{const c=new MTG.CardInst(MTG.DEFS[n],p);c.zone='battlefield';c.ctrl=p;c.sick=false;g.battlefield.push(c);return c;};
  const own=put('Serra Angel',bot),foe=put('Grizzly Bears',opp);
  g.turnPlayer=bot;g.phase='main1';g.step='main';g.turnNo=5;g.recalc();
  const out=[];
  for(const [name,def] of Object.entries(MTG.DEFS)){
    if(!def||def.isTokenDef)continue;
    const rows=[];
    for(const a of def.abilities||[])rows.push({kind:'ability',label:a.label||a.desc||'',targets:a.targets,loyalty:a.loyalty,ability:a});
    for(const t of def.triggers||[])rows.push({kind:'trigger',label:t.desc||t.on||'',targets:t.targets});
    if(def.targets)rows.push({kind:'spell',label:'spell',targets:def.targets});
    if(!rows.some(r=>r.targets))continue;
    const src=new MTG.CardInst(def,bot);src.zone='battlefield';src.ctrl=bot;
    for(const row of rows){
      let specs=row.targets;
      try{if(typeof specs==='function')specs=specs(g,src,{card:src},bot);}catch{continue;}
      if(!Array.isArray(specs))continue;
      for(const spec of specs){if(!spec||spec.aiHint)continue;
      const text=row.label&&row.label.length>12?row.label:(def.oracle||'');
      if(!HARMFUL.test(text)||BENEFIT.test(text)||/you control|another target creature you control|your creatures?/i.test(text))continue;
      let legal;try{legal=g.legalTargets(spec,src,bot);}catch{continue;}
      if(!legal.includes(own)||!legal.includes(foe))continue;
      let pick;try{pick=await bot.controller.decide(g,{type:'chooseTargets',player:bot,candidates:[own,foe],min:1,max:1,spec,aiHint:spec.aiHint,src,ability:row.ability||null,effectText:row.kind==='trigger'?row.label:null,prompt:'scan'});}catch(e){continue;}
      const chosen=[pick].flat()[0];
      if(chosen===own)out.push(`${name} | ${row.kind} | ${String(text).replace(/\n/g,' ').slice(0,110)}`);
    }}
  }
  
  assert.deepEqual(out, []);
});

// Players too: "target player draws / gains life / searches" is the bot's own
// benefit, and life loss, discard or mill goes to an opponent. Effects whose
// target is the player left out (Death by Dragons) or a gift are expected.
const PLAYER_EXPECTED_OPPONENT = new Set(['Death by Dragons', "Sazacap's Brew", 'Mind Spiral']);
test('the bot aims unhinted player benefits at itself and player harm at an opponent', { timeout: 300000 }, async () => {
  const MTG = loadEngine();
  const GOOD=/target player (?:draws?|gains? \d+ life|gains? life|may (?:search|put|draw)|searches|creates?|untaps?|puts? (?:a|an|up to|any number of) [^.]*(?:onto the battlefield|into (?:his|her|their) hand))/i;
  const BAD=/target player (?:loses?|discards?|sacrifices?|mills?|exiles?|reveals?|shuffles? [^.]*graveyard|skips?|can't)|damage to target player|target player['’]s (?:library|graveyard|hand)/i;
  const g=new MTG.Game({seed:3,paced:false});const bot=g.addPlayer('Bot',{name:'b'},null,true),opp=g.addPlayer('Opp',{name:'o'},{decide:async()=>({kind:'pass'})},false);
  bot.controller=new MTG.AIController(bot,{difficulty:'hard',style:'balanced'});
  for(const p of g.players)for(let i=0;i<20;i++){const c=new MTG.CardInst(MTG.DEFS.Island,p);c.zone='library';p.library.push(c);}
  g.turnPlayer=bot;g.phase='main1';g.step='main';g.turnNo=5;g.recalc();
  const good=[],bad=[];
  for(const [name,def] of Object.entries(MTG.DEFS)){
    if(!def||def.isTokenDef)continue;const rows=[];
    for(const a of def.abilities||[])rows.push({label:a.label||'',targets:a.targets,ability:a});
    for(const t of def.triggers||[])rows.push({label:t.desc||'',targets:t.targets,trigger:true});
    if(def.targets)rows.push({label:'',targets:def.targets});
    const src=new MTG.CardInst(def,bot);src.zone='battlefield';src.ctrl=bot;
    for(const row of rows){let specs=row.targets;try{if(typeof specs==='function')specs=specs(g,src,{card:src},bot);}catch{continue;}
      if(!Array.isArray(specs))continue;
      for(const spec of specs){if(!spec||spec.aiHint)continue;let legal;try{legal=g.legalTargets(spec,src,bot);}catch{continue;}
        if(!legal.includes(bot)||!legal.includes(opp))continue;
        const text=row.label.length>12?row.label:(def.oracle||'');const isGood=GOOD.test(text)&&!BAD.test(text),isBad=BAD.test(text)&&!GOOD.test(text);if(!isGood&&!isBad)continue;
        let pick;try{pick=await bot.controller.decide(g,{type:'chooseTargets',player:bot,candidates:[bot,opp],min:1,max:1,spec,src,ability:row.ability||null,effectText:row.trigger?row.label:null,prompt:'scan'});}catch{continue;}
        const chosen=[pick].flat()[0];
        if(isGood&&chosen===opp)good.push(name+' | '+text.replace(/\n/g,' ').slice(0,100));
        if(isBad&&chosen===bot)bad.push(name+' | '+text.replace(/\n/g,' ').slice(0,100));
      }}
  }
  
  assert.deepEqual(good.filter(line => !PLAYER_EXPECTED_OPPONENT.has(line.split(' | ')[0])), []);
  assert.deepEqual(bad, []);
});
