import test from 'node:test';
import assert from 'node:assert/strict';
import {table, stable, paidCast} from './helpers/second-audit-combat-fixtures.mjs';

function setup() {
  const f = table();
  const tezzeret = f.put('Tezzeret, Betrayer of Flesh');
  tezzeret.counters.loyalty = 4;
  return f;
}

for (const mana of [3, 5]) test(`Tezzeret does not discount Moonsnare Prototype channel with ${mana} available mana`, async () => {
  const f = setup();
  const prototype = f.put('Moonsnare Prototype', 'hand');
  const target = f.put('Grizzly Bears', 'battlefield', f.b);
  f.lands(['Island', ...Array(mana - 1).fill('Wastes')]);
  f.targets = (p, q) => q.candidates.includes(target) ? [target] : undefined;
  const entry = f.g.activatableList(f.a).find(row => row.card === prototype && row.handAbility);
  assert.equal(!!entry, mana === 5, 'the full printed {4}{U} is needed from hand');
  assert.equal(await f.g.activateAbility(f.a, entry || {card: prototype, handAbility: true}), mana === 5);
  assert.equal(prototype.zone, mana === 5 ? 'graveyard' : 'hand');
  assert.equal(target.zone, mana === 5 ? 'library' : 'battlefield');
  assert.equal(f.a.turnState.artifactAbilitiesActivated || 0, 0);
  stable(f, 'channel does not activate a battlefield artifact');
});

test('channel leaves Tezzeret available and a sacrificed battlefield artifact consumes it', async () => {
  const f = setup();
  const sphere = f.put('Mnemonic Sphere', 'hand');
  const first = f.put('Mind Stone');
  const second = f.put('Mind Stone');
  f.put('Island');
  const channel = f.g.activatableList(f.a).find(row => row.card === sphere && row.handAbility);
  assert.ok(channel);
  assert.equal(await f.g.activateAbility(f.a, channel), true);
  assert.equal(f.a.turnState.artifactAbilitiesActivated || 0, 0, 'hand channel preserves the discount');
  const draw = f.g.activatableList(f.a).find(row => row.card === first && row.ability?.cost?.sacSelf);
  assert.ok(draw, 'Mind Stone can now pay its discounted zero-mana sacrifice activation');
  const handSize = f.a.hand.length;
  assert.equal(await f.g.activateAbility(f.a, draw), true);
  assert.equal(first.zone, 'graveyard');
  assert.equal(f.a.hand.length, handSize + 1);
  assert.equal(f.a.turnState.artifactAbilitiesActivated, 1, 'the sacrificed source still counts its battlefield activation');
  assert.equal(f.g.artifactAbilityDiscountAmount(f.a), 0);
  assert.equal(f.g.activatableList(f.a).some(row => row.card === second && row.ability?.cost?.sacSelf), false,
    'the second Mind Stone cannot tap itself both for mana and for the draw cost');
  stable(f, 'artifact activation counts use the source zone before costs');
});

test('Tezzeret does not discount Scrapheap Scrounger in the graveyard', async () => {
  const f = setup();
  const scrounger = f.put('Scrapheap Scrounger', 'graveyard');
  const donor = f.put('Ornithopter', 'graveyard');
  const swamp = f.put('Swamp');
  assert.equal(f.g.activatableList(f.a).some(row => row.card === scrounger && row.gyAbility), false);
  assert.equal(await f.g.activateAbility(f.a, {card: scrounger, gyAbility: true}), false);
  assert.equal(scrounger.zone, 'graveyard');
  assert.equal(donor.zone, 'graveyard');
  assert.equal(swamp.tapped, false);
  stable(f, 'graveyard artifact card needs its printed activation cost');
});


test('Song of the Dryads removes Tezzeret’s discount with his other abilities', async () => {
  const f = setup();
  const tezzeret = f.g.bf().find(card => card.name === 'Tezzeret, Betrayer of Flesh');
  const stone = f.put('Mind Stone');
  const song = f.put('Song of the Dryads', 'hand');
  f.lands(['Forest', 'Wastes', 'Wastes']);
  f.targets = (p, q) => q.candidates.includes(tezzeret) ? [tezzeret] : undefined;
  await paidCast(f, f.a, song);
  assert.equal(tezzeret.cur.abilitiesDisabled, true);
  assert.equal(f.g.artifactAbilityDiscountAmount(f.a), 0);
  const entry = f.g.activatableList(f.a).find(row => row.card === stone && row.ability?.cost?.sacSelf);
  assert.ok(entry, 'the enchanted Tezzeret can tap as a Forest to pay the undiscounted {1}');
  assert.equal(await f.g.activateAbility(f.a, entry), true);
  assert.equal(tezzeret.tapped, true);
  assert.equal(stone.zone, 'graveyard');
  stable(f, 'ability loss removes the static activation discount');
});

test('artifact channel may use Tezzeret’s first discount on its battlefield mana source', async () => {
  const f = setup();
  const prototype = f.put('Moonsnare Prototype', 'hand');
  const prismite = f.put('Prismite');
  const target = f.put('Grizzly Bears', 'battlefield', f.b);
  const lands = f.lands(Array(4).fill('Wastes'));
  f.targets = (p, q) => q.candidates.includes(target) ? [target] : undefined;
  const entry = f.g.activatableList(f.a).find(row => row.card === prototype && row.handAbility);
  assert.ok(entry, 'Prismite provides the blue mana with its first activation fee reduced to zero');
  assert.equal(await f.g.activateAbility(f.a, entry), true);
  assert.equal(prototype.zone, 'graveyard');
  assert.equal(target.zone, 'library');
  assert.equal(prismite.zone, 'battlefield');
  assert.ok(lands.every(card => card.tapped), 'all four generic mana of channel are paid');
  assert.equal(f.a.turnState.artifactAbilitiesActivated, 1, 'only Prismite activated on the battlefield');
  stable(f, 'a hand artifact does not reserve the battlefield artifact discount');
});
