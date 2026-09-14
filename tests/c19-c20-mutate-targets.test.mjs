import test from 'node:test';
import assert from 'node:assert/strict';
import {M, setup, card, body, fuel, mana, settle} from './helpers/c19-c20-fixtures.mjs';

async function castMutation(f, source, host, {order = 'over', chooseBounce, inspectOrder} = {}) {
  f.decide = (player, q) => {
    if (q.type === 'chooseTargets') {
      if (q.so?.castOpts?.mutate) return [host];
      return chooseBounce?.(q);
    }
    if (q.type === 'chooseOption' && q.aiHint?.kind === 'mutateOrder') {
      inspectOrder?.(q);
      return order;
    }
    if (q.type === 'chooseOption' && q.options.some(option => option.key === 'yes')) return 'yes';
  };
  fuel(f.a);
  const alt = source.def.altCosts.find(option => option.mutate);
  assert.equal(await f.game.castSpell(f.a, source, {alt}), true);
  assert.equal(f.game.stack.at(-1).targets[0]?.iid, host.iid);
}

test('mutate order previews and Live presentation retain physical top-to-bottom order', async () => {
  const f = setup();
  const host = body(f);
  const source = card(f, 'Pouncing Shoreshark', 'hand');
  let preview;
  await castMutation(f, source, host, {order: 'under', inspectOrder: q => {
    preview = M.completeOnlineDecision(f.game, q, f.a, {legal: {}}).ui.mutateChoice;
  }});
  await settle(f.game);
  assert.equal(preview.incoming.name, 'Pouncing Shoreshark');
  assert.deepEqual(Array.from(preview.components, row => row.name), ['Grizzly Bears']);
  assert.deepEqual(Array.from(M.Mutate.present(host, f.a), row => row.name), ['Grizzly Bears', 'Pouncing Shoreshark']);
  const projected = M.onlineCardPresentation(host, f.b).meta.mutateComponents;
  assert.deepEqual(Array.from(projected, row => row.name), ['Grizzly Bears', 'Pouncing Shoreshark']);
  assert.match(projected[1].oracle, /Whenever this creature mutates/);
  await f.game.move(host, 'hand');
  assert.equal(M.Mutate.present(host, f.a).length, 0, 'departed cards no longer show a merged pile');
});

test('merged card art and rules remain hidden from opponents for face-down components', async () => {
  const f = setup();
  const host = card(f, 'Lightning Bolt', 'hand');
  await f.game.putFaceDown(f.a, host);
  const source = card(f, 'Pouncing Shoreshark', 'hand');
  await castMutation(f, source, host);
  await settle(f.game);
  const privateRow = M.Mutate.present(host, f.a).find(row => row.iid === host.iid);
  assert.equal(privateRow.name, 'Lightning Bolt');
  assert.equal(privateRow.faceDown, true);
  assert.match(privateRow.oracle, /3 damage/);
  const publicRow = M.onlineCardPresentation(host, f.b).meta.mutateComponents.find(row => row.iid === host.iid);
  assert.equal(publicRow.name, 'Hidden card');
  assert.equal(publicRow.hidden, true);
  for (const field of ['oracle', 'cost', 'types', 'subtypes', 'power', 'toughness']) assert.equal(publicRow[field], undefined);
});

function animate(f, artifact) {
  f.game.addOracleAnimation(artifact, {
    types: ['Creature'], subtypes: ['Beast'], power: 3, toughness: 3,
    retainTypes: true, keywords: [], temporary: true,
  });
  const effect = f.game.untilEffects.at(-1);
  assert.equal(artifact.is('Creature'), true);
  return () => {
    f.game.untilEffects = f.game.untilEffects.filter(row => row !== effect);
    f.game.recalc();
    assert.equal(artifact.is('Creature'), false);
  };
}

for (const role of ['human', 'ai']) {
  test(`${role}: mutate candidates require an owned non-Human creature, including artifact creatures`, () => {
    const f = setup(role);
    const source = card(f, 'Pouncing Shoreshark', 'hand');
    const creature = body(f);
    const artifactCreature = card(f, 'Solemn Simulacrum');
    const stolen = body(f);
    M.C1920.control(f.game, stolen, f.b, false);
    const excluded = [
      card(f, 'Sol Ring'), card(f, 'Forest'), card(f, 'Propaganda'),
      card(f, 'Valiant Rescuer'), card(f, 'Mirror Entity'), body(f, f.b),
      card(f, 'Sol Ring', 'battlefield', f.b),
    ];
    const alt = source.def.altCosts.find(option => option.mutate);
    const [spec] = f.game.spellTargetSpecs(source, alt, f.a);
    const candidates = f.game.legalTargets(spec, source, f.a);
    for (const target of excluded) assert.equal(candidates.includes(target), false, target.name);
    assert.deepEqual(Array.from(candidates, target => target.iid), [creature, artifactCreature, stolen].map(target => target.iid));
  });

  test(`${role}: mutate is unavailable when only noncreatures and Humans are owned`, async () => {
    const f = setup(role);
    const source = card(f, 'Pouncing Shoreshark', 'hand');
    card(f, 'Sol Ring');
    card(f, 'Forest');
    card(f, 'Valiant Rescuer');
    body(f, f.b);
    fuel(f.a);
    const offers = f.game.castableList(f.a).filter(option => option.card === source);
    assert.ok(offers.some(option => !option.alt?.mutate), 'ordinary creature casting remains available');
    assert.equal(offers.some(option => option.alt?.mutate), false);
    const before = mana(f.a);
    assert.equal(await f.game.castSpell(f.a, source, {
      alt: source.def.altCosts.find(option => option.mutate),
    }), false);
    assert.equal(mana(f.a), before);
    assert.equal(source.zone, 'hand');
    assert.equal(f.game.stack.length, 0);
  });

  test(`${role}: an invalid artifact selection and drag hint cannot spend mutate mana`, async () => {
    const f = setup(role);
    const source = card(f, 'Pouncing Shoreshark', 'hand');
    const artifact = card(f, 'Sol Ring');
    body(f);
    let prompt;
    f.decide = (player, q) => {
      if (q.type === 'chooseTargets') {
        prompt = q;
        return [artifact];
      }
    };
    fuel(f.a);
    const before = mana(f.a);
    assert.equal(await f.game.castSpell(f.a, source, {
      alt: source.def.altCosts.find(option => option.mutate), quickTargets: [artifact],
    }), false);
    assert.ok(prompt, 'a legal creature still permits the target prompt');
    assert.equal(prompt.candidates.includes(artifact), false);
    assert.equal(prompt.quickTarget, undefined);
    assert.equal(mana(f.a), before);
    assert.equal(source.zone, 'hand');
    assert.equal(artifact.mutateState, undefined);
    assert.equal(f.game.stack.length, 0);
  });

  for (const order of ['over', 'under']) {
    test(`${role}: mutate ${order} an artifact creature preserves a successful merge`, async () => {
      const f = setup(role);
      const source = card(f, 'Pouncing Shoreshark', 'hand');
      const host = card(f, 'Solemn Simulacrum');
      const version = host.zoneVersion;
      await castMutation(f, source, host, {order});
      await settle(f.game);
      assert.equal(source.zone, 'merged');
      assert.equal(host.zoneVersion, version);
      assert.equal(host.name, order === 'over' ? 'Pouncing Shoreshark' : 'Solemn Simulacrum');
      assert.equal(host.is('Creature'), true);
      assert.equal(host.is('Artifact'), order === 'under');
      assert.equal(host.meta.c1920Mutations, 1);
      assert.equal(host.mutateState.components.length, 2);
    });
  }

  test(`${role}: mutate becomes an ordinary creature if its animated artifact target stops being a creature`, async () => {
    const f = setup(role);
    const source = card(f, 'Pouncing Shoreshark', 'hand');
    const host = card(f, 'Sol Ring');
    const stopAnimation = animate(f, host);
    const enemy = body(f, f.b);
    let bouncePrompts = 0;
    await castMutation(f, source, host, {chooseBounce: () => {
      bouncePrompts++;
      return [enemy];
    }});
    stopAnimation();
    await settle(f.game);
    assert.equal(source.zone, 'battlefield');
    assert.equal(host.zone, 'battlefield');
    assert.equal(host.mutateState, undefined);
    assert.equal(bouncePrompts, 0, 'no mutation means no Shoreshark bounce trigger');
    assert.equal(enemy.zone, 'battlefield');
  });

  test(`${role}: Shoreshark's mutation trigger offers only opposing creatures`, async () => {
    const f = setup(role);
    const source = card(f, 'Pouncing Shoreshark', 'hand');
    const host = body(f);
    const enemy = body(f, f.b);
    const enemyHuman = card(f, 'Valiant Rescuer', 'battlefield', f.b);
    const enemyArtifactCreature = card(f, 'Solemn Simulacrum', 'battlefield', f.b);
    const noncreatures = ['Sol Ring', 'Forest', 'Propaganda'].map(name => card(f, name, 'battlefield', f.b));
    let prompts = 0;
    await castMutation(f, source, host, {chooseBounce: q => {
      prompts++;
      assert.deepEqual(Array.from(q.candidates, target => target.iid), [enemy, enemyHuman, enemyArtifactCreature].map(target => target.iid));
      return [enemyArtifactCreature];
    }});
    await settle(f.game);
    assert.equal(prompts, 1);
    assert.equal(enemyArtifactCreature.zone, 'hand');
    for (const permanent of [host, enemy, enemyHuman, ...noncreatures]) {
      assert.equal(permanent.zone, 'battlefield');
    }
  });

  test(`${role}: Shoreshark's bounce rechecks whether an animated artifact is still a creature`, async () => {
    const f = setup(role);
    const source = card(f, 'Pouncing Shoreshark', 'hand');
    const host = body(f);
    const enemy = card(f, 'Sol Ring', 'battlefield', f.b);
    const stopAnimation = animate(f, enemy);
    await castMutation(f, source, host, {chooseBounce: () => [enemy]});
    await f.game.resolveTop();
    assert.equal(source.zone, 'merged');
    const trigger = f.game.stack.at(-1);
    assert.equal(trigger.kind, 'trigger');
    assert.equal(trigger.targets[0]?.iid, enemy.iid);
    stopAnimation();
    await settle(f.game);
    assert.equal(enemy.zone, 'battlefield', 'an ordinary artifact is no longer a legal bounce target');
    assert.equal(f.b.hand.includes(enemy), false);
  });
}
