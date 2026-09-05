import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {extensionTarget,normalizeAbilityWords} from '../scripts/oracle-extensions-v7.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const MTG=loadEngine();
test('v7 removes sourced flavor labels without erasing real keyword restrictions',()=>{
 assert.equal(normalizeAbilityWords('Sonic Blaster — Draw a card.'),'Draw a card.');
 assert.equal(normalizeAbilityWords('• Cure Wounds — You gain 5 life.'),'• You gain 5 life.');
 for(const label of ['Forecast','Exhaust','Max speed','Power-up','Companion','Unverified invented label'])assert.equal(normalizeAbilityWords(label+' — Draw a card.'),label+' — Draw a card.');
 assert.equal(semanticClass(input('Unknown Label','Unverified invented label — Draw a card.','Sorcery')).semanticClass,undefined);
 assert.equal(semanticClass(input('Unknown Trigger Label','Unverified invented label — When this creature enters, draw a card.')).semanticClass,undefined);
 const card=input('Flavor Label','Sonic Blaster — When this creature enters, draw a card.');assert.ok(semanticClass(card).semanticClass);
});
const definitions=[
 ['Keyword Choice','{G}: This creature gains your choice of vigilance, lifelink, or haste until end of turn.'],
 ['Keyword Pump','Target creature gets +1/+1 and gains your choice of deathtouch or lifelink until end of turn.','Instant'],
 ['Backup','Flash\nBackup 2\nFlying'],
 ['Backup Ability','Backup 1\n{G}, Sacrifice this creature: Draw a card.'],
 ['Reflexive Value','Whenever this creature attacks, you may sacrifice another creature. When you do, this creature deals damage equal to the sacrificed creature\'s power to any target.'],
 ['Optional Value',"At the beginning of your end step, you may sacrifice a nontoken creature. If you do, create X 1/1 green Saproling creature tokens, where X is the sacrificed creature's toughness."],
 ['Sac Value','{G}, Sacrifice another creature: You gain life equal to the sacrificed creature\'s toughness.'],
 ['Sac Spell',"As an additional cost to cast this spell, sacrifice a creature.\nV7 Sac Spell deals damage equal to the sacrificed creature's power to any target.",'Instant'],
 ['Sac Union','{G}, Sacrifice another creature or artifact: Draw a card.'],
 ['Total Grave','This creature enters with X +1/+1 counters on it, where X is the total mana value of instant and sorcery cards in your graveyard.'],
 ['Frog Affinity','Affinity for Frogs','Creature','{5}{G}'],
 ['Island Lock',"Islands don't untap during their controllers' untap steps.",'Enchantment'],
 ['Blue Bonus','Draw a card. If {U} was spent to cast this spell, you gain 3 life.','Instant','{2}{G}'],
 ['Adamant','If at least three blue mana was spent to cast this spell, this creature enters with a +1/+1 counter on it.','Creature','{3}{U}'],
 ['Main Bonus','You gain 2 life. If you cast this spell during your main phase, draw a card.','Instant'],
 ['Replicate','Replicate {1}{G}\nDraw a card.','Sorcery'],
 ['Replicate Target','Replicate {G}\nDestroy target artifact.','Sorcery','{G}'],
 ['Ravenous','Ravenous','Creature','{X}{G}'],
 ['Grave Lands','You may play lands from your graveyard.','Enchantment'],
 ['Free Commander','If you control a commander, you may cast this spell without paying its mana cost.\nDraw a card.','Instant','{3}{G}'],
 ['Entry Count','This creature enters with a +1/+1 counter on it for each other creature you control.'],
 ['Entry Grave','This creature enters with a number of +1/+1 counters on it equal to the number of creature cards in all graveyards.'],
 ['Entry Life',"This creature enters with X +1/+1 counters on it, where X is the amount of life you've gained this turn."],
 ['Entry Maximum','This creature enters with X +1/+1 counters on it, where X is the greatest power among other creatures you control.'],
 ['Entry X','This artifact enters with X charge counters on it.','Artifact','{X}{X}'],
 ['Entry Converge','This creature enters with two +1/+1 counters on it for each color of mana spent to cast it.','Creature','{3}'],
 ['Entry Tapped','This artifact enters tapped and with three charge counters on it.','Artifact'],
 ['Entry Hand','This creature enters with two -1/-1 counters on it if you cast it from your hand.'],
 ['Entry Turn',"Flash\nThis creature enters tapped if it's not your turn."],
 ['Entry Island','This land enters tapped unless you control an Island.\n{T}: Add {G}.','Land',''],
 ['Overload Bounce',"Return target nonland permanent you don't control to its owner's hand.\nOverload {3}{G}",'Instant'],
 ['Overload Damage',"V7 Overload Damage deals 2 damage to target creature you don't control.\nOverload {3}{G}",'Instant'],
 ['Overload Counter',"Counter target spell you don't control.\nOverload {3}{G}",'Instant'],
 ['Overload Mind','Target player discards two cards.\nOverload {3}{G}','Sorcery'],
 ['Overload X',"V7 Overload X deals X damage to target creature without flying you don't control.\nOverload {X}{X}{G}",'Instant','{X}{G}'],
 ['Fire','Firebending 2'],
 ['Power Fire',"Firebending X, where X is this creature's power."],
 ['Extra Land','You may play an additional land on each of your turns.','Enchantment'],
 ['Player Hexproof','You have hexproof.','Enchantment'],
 ['Grave Restriction',"This creature can't attack or block unless an opponent has eight or more cards in their graveyard."],
 ['Hand Restriction',"This creature can't attack or block unless a player has no cards in hand."],
 ['Mountain Restriction',"This creature can't attack unless there is a Mountain on the battlefield."],
 ['No Combat',"This creature can't attack or block."],
 ['Small Blocker',"This creature can't block creatures with power greater than this creature's power."],
 ['Two Way',"This creature can't block or be blocked by creatures with power 2 or greater."],
 ['Defender Island',"This creature can't attack unless defending player controls an Island."],
 ['Defender Ban',"This creature can't attack if defending player controls an untapped creature with power 2 or less."],
 ['Flying Defense',"Creatures with flying can't attack you or planeswalkers you control.",'Enchantment'],
 ['Ground Defense',"Creatures with power 2 or less can't attack you.",'Enchantment'],
 ['Evasive Aura',"Enchant creature\nEnchanted creature gets +2/+0 and can't be blocked by creatures with flying.",'Enchantment — Aura'],
 ['No Combat Spell',"Target creature can't attack or block this turn.",'Instant'],
 ['Group Sneak',"Creatures you control can't be blocked this turn.",'Instant'],
 ['No Ground Block',"Creatures without flying can't block this turn.",'Instant'],
 ['Combat Block',"Target creature can't block this combat.",'Instant'],
 ['Hasty Block',"{1}: This creature can't be blocked this turn except by creatures with haste."],
 ['Rat Token','Create a 1/1 black Rat creature token with "This token can\'t block."','Sorcery'],
 ['Flying Token','Create a 1/1 blue Faerie creature token with flying and "This token can block only creatures with flying."','Sorcery'],
 ['Modal Tuck',"Choose two —\n• Target creature's owner puts it on their choice of the top or bottom of their library.\n• Return target creature to its owner's hand.",'Instant'],
 ['Enemy Impulse',"Exile the top card of each opponent's library. Until end of turn, you may cast spells from among those exiled cards, and you may spend mana as though it were mana of any color to cast those spells.",'Sorcery'],
 ['Plain Exile','Target opponent exiles the top two cards of their library.','Sorcery'],
 ['Tuck Choice',"Target creature's owner puts it on their choice of the top or bottom of their library.",'Instant'],
 ['Peek','Look at the top card of target player\'s library. You may put that card into their graveyard.','Sorcery'],
 ['Reveal Life','At the beginning of your upkeep, reveal the top card of your library and put that card into your hand. You lose life equal to its mana value.','Enchantment'],
 ['Peek Land',"Look at the top card of your library. If it's a land card, you may put it onto the battlefield tapped. If you don't put the card onto the battlefield, you may put it on the bottom of your library.",'Sorcery'],
 ['Library All','Reveal the top four cards of your library. Put all land cards revealed this way into your hand and the rest into your graveyard.','Sorcery'],
 ['Library Company','Look at the top six cards of your library. Put up to two creature cards with mana value 3 or less from among them onto the battlefield. Put the rest on the bottom of your library in any order.','Instant'],
 ['Library X','Reveal the top X cards of your library. Put all creature cards revealed this way into your hand and the rest into your graveyard.','Sorcery','{X}{G}'],
 ['Color Protection','Target creature you control gains protection from the color of your choice until end of turn.','Instant'],
 ['Type Protection','Another target creature you control gains protection from the card type of your choice until end of turn.','Instant'],
 ['Team Protection','Choose a color. White creatures you control gain protection from the chosen color until end of turn.','Instant'],
 ['Artifact Protection','Target creature gains protection from artifacts until end of turn.','Instant'],
 ['Protection Aura','Enchant creature\nEnchanted creature gets +2/+2 and has protection from creatures.','Enchantment — Aura'],
 ['Protection Team','All creatures have protection from black.','Enchantment'],
 ['Distinct Base','Up to one target creature has base power and toughness 1/1 until end of turn. Up to one other target creature has base power and toughness 4/4 until end of turn.','Instant'],
 ['Base Lord','Other creatures have base power and toughness 1/1.'],
 ['Base Aura','Enchant creature\nEnchanted creature has base power and toughness 9/10 and has indestructible.','Enchantment — Aura'],
 ['Base Life','Enchant creature\nEnchanted creature has base power and toughness X/X, where X is your life total.','Enchantment — Aura'],
 ['Base Commander','Commander creatures you own have base power and toughness 10/10 and are Giants in addition to their other types.','Enchantment'],
 ['Base Team','Creatures you control have base power and toughness 4/5 until end of turn.','Instant'],
 ['Base Flight','Until end of turn, target creature you control has base power and toughness 4/4 and gains flying and hexproof.','Instant'],
 ['Base Forever','{X}: This creature has base power and toughness X/X.'],
 ['Frog','Until end of turn, target creature becomes a blue Frog with base power and toughness 3/3.','Instant'],
 ['Artifact Shape','Until end of turn, target artifact or creature becomes a Dinosaur artifact creature with base power and toughness 4/3 in addition to its other types.','Instant'],
 ['Damaged Exile','V7 Damaged Exile deals 2 damage to target creature. If a creature dealt damage this way would die this turn, exile it instead.','Instant'],
 ['Target Exile','V7 Target Exile deals 2 damage to target creature. If that creature would die this turn, exile it instead.','Instant'],
 ['Group Exile','All creatures get -1/-1 until end of turn. If a creature an opponent controls would die this turn, exile it instead.','Sorcery'],
 ['Damage Group Exile','V7 Damage Group Exile deals 2 damage to each creature. If a creature dealt damage this way would die this turn, exile it instead.','Sorcery'],
 ['Clone','You may have this creature enter as a copy of any creature on the battlefield.'],
 ['Grave Clone','You may have this creature enter as a copy of any creature card in a graveyard.'],
 ['Giant Clone',"You may have this creature enter as a copy of any creature on the battlefield, except it's 7/7."],
 ['Typed Clone',"You may have this creature enter as a copy of a creature an opponent controls, except it's a Faerie Shapeshifter in addition to its other types and it has flying."],
 ['Ability Clone','You may have this creature enter as a copy of a creature you control, except it has "{T}: Draw a card."'],
 ['Choice Payment','Target opponent loses 3 life unless they sacrifice a nonland permanent of their choice or discard a card.','Sorcery'],
 ['Group Payment','Each opponent sacrifices a permanent of their choice unless they pay {1}.','Sorcery'],
 ['Owned Commander','Commander creatures you own have "{T}: Draw a card."','Enchantment'],
 ['First Strikers','Creatures you control with first strike have vigilance.','Enchantment'],
 ['Counter Grant','Creatures you control with counters on them have hexproof.','Enchantment'],
 ['Newcomers','Creatures you control that entered this turn get +1/+1.','Enchantment'],
 ['Flying Return','Return target creature card with flying from your graveyard to your hand.','Sorcery'],
 ['Discard Upkeep','At the beginning of your upkeep, sacrifice this creature unless you discard a card.'],
 ['Return Upkeep',"At the beginning of your upkeep, sacrifice this creature unless you return an untapped Island you control to its owner's hand."],
 ['Paid Exile','Exile target creature unless its controller pays {2}.','Instant'],
 ['Sac Arrival','When this creature enters, exile it unless you sacrifice another creature.'],
 ['Switch','Switch target creature\'s power and toughness until end of turn.','Instant'],
 ['Double','Double the power and toughness of target creature until end of turn.','Instant'],
 ['Double Team','Double the power of each creature you control until end of turn.','Sorcery'],
 ['Double Counters','Double the number of each kind of counter on target permanent.','Instant'],
 ['Counter Double','Put a +1/+1 counter on target creature, then double the number of +1/+1 counters on that creature.','Instant'],
 ['Wheel','Each player discards their hand, then draws that many cards.','Sorcery'],
 ['Fixed Wheel','Discard your hand, then draw three cards.','Sorcery'],
 ['Damage Draw','Whenever this creature deals damage to an opponent, draw a card.'],
 ['Cycle Burn','Cycling {2}\nWhen you cycle this card, you may have it deal 2 damage to target creature.'],
 ['Power Restriction',"This creature can't attack or block unless its power is 4 or greater."],
 ['Great Discount',"This spell costs {X} less to cast, where X is the greatest power among creatures you control.",'Creature — Bear','{6}{G}'],
 ['Hand Artifact','Target opponent reveals their hand. You choose an artifact card from it. That player discards that card.','Sorcery'],
 ['Hand Exile','Target opponent reveals their hand. You choose a nonland card from it and exile that card.','Sorcery'],
 ['Hand Shuffle','Target opponent reveals their hand. You choose a card from it. That player shuffles that card into their library.','Sorcery'],
 ['Own Power','{T}: Another target creature you control gets +X/+X until end of turn, where X is this creature\'s power.'],
 ['Sac Power','Sacrifice this creature: You gain life equal to this creature\'s power.'],
 ['Power Gate','{T}: Draw a card. Activate only if this creature\'s power is 4 or greater.'],
 ['Death Power','When this creature dies, if its power was 3 or greater, draw a card.'],
 ['Upkeep Return','{G}: Return this card from your graveyard to your hand. Activate only during your upkeep.'],
 ['Either Mana','{T}: Add {W}. Activate only if you control a Forest or a Plains.','Artifact'],
 ['Grave Discard','{1}{G}, Discard two cards: Return this card from your graveyard to the battlefield tapped.'],
 ['Grave Exile','{1}{G}, Exile another creature card from your graveyard: Return this card from your graveyard to the battlefield.'],
 ['Grave Tap','Tap two untapped creatures you control: Return this card from your graveyard to your hand.'],
 ['Grave Rise','{1}{G}: Return this card from your graveyard to the battlefield tapped with two +1/+1 counters on it.'],
 ['Grave Landfall','Whenever a land you control enters, you may return this card from your graveyard to the battlefield.'],
 ['Self Exile','Draw a card. Exile V7 Self Exile.','Sorcery'],
 ['Combat Pump','Target creature gets +2/+2 until end of combat.','Instant'],
 ['Unbounded Bounce',"Return any number of target creatures you control to their owner's hand.",'Instant'],
 ['Range Return','Return one or two target creature cards from your graveyard to your hand.','Sorcery'],
 ['Global Mana','Creatures you control have "{T}: Add one mana of any color."','Enchantment'],
 ['Aura Mana','Enchant creature\nEnchanted creature has "{T}: Add {C}{C}."','Enchantment — Aura'],
 ['Temporary Mana','Until end of turn, lands you control gain "{T}: Add one mana of any color."','Instant'],
 ['Life Mana','{T}: Add {C}. You gain 1 life.','Artifact'],
 ['Egg Mana','{1}, {T}, Sacrifice this artifact: Add {U}. Draw a card.','Artifact'],
 ['Creature Mana','{T}: Add one mana of any color. Spend this mana only to cast a creature spell.'],
 ['Ability Mana','{T}: Add {C}{C}. Spend this mana only to activate abilities.','Artifact'],
 ['Pain Mana','{T}: Add {C}{C}. This land deals 2 damage to you.','Land'],
 ['Tap Team','Tap two untapped creatures you control: Draw a card.'],
 ['Tap Ally','{T}, Tap an untapped Ally you control: Draw a card.'],
 ['Paid Tap Team','{1}, Tap two untapped creatures you control: Draw a card.'],
 ['Owner Token','Exile target creature. Its owner creates a 3/3 green Beast creature token.','Instant'],
 ['Additive Tokens','Create a number of 1/1 green Elf creature tokens equal to two plus the number of creatures you control.','Sorcery'],
 ['Count Draw','Draw cards equal to the number of creatures you control.','Sorcery'],
 ['Library Life','You gain life equal to the number of cards in your library.','Sorcery'],
 ['Count Reanimate','Return target creature card with mana value less than or equal to the number of Swamps you control from your graveyard to the battlefield.','Sorcery'],
 ['Count Search','Search your library for a card with mana value less than or equal to your devotion to green, reveal it, put it into your hand, then shuffle.','Sorcery'],
 ['Lander','Create a Lander token.','Sorcery'],
 ['Mutagen','Create a Mutagen token.','Sorcery'],
 ['Enemy Token','Target opponent creates a 3/3 green Beast creature token.','Sorcery'],
 ['Life Change','At the beginning of your end step, if you gained or lost life this turn, draw a card.'],
 ['Exact Creature','At the beginning of your end step, if you control exactly one creature, draw a card.'],
 ['Full Party','At the beginning of your end step, if you have a full party, draw a card.'],
 ['Combat Shield','Prevent all combat damage that would be dealt to and dealt by target creature you control this turn.','Instant'],
 ['Creature Shield','Prevent all damage that would be dealt to creatures you control this turn.','Instant'],
 ['Static Shield','Prevent all combat damage that would be dealt to and dealt by this creature.'],
 ['Creature Fog','Prevent all damage that would be dealt by creatures this turn.','Instant'],
 ['Controller Draw','Destroy target creature. Its controller draws two cards.','Instant'],
 ['Same Player','Target opponent draws a card. That player loses 3 life.','Instant'],
 ['Group Blink',"Exile up to two target creatures you control, then return those cards to the battlefield under their owner's control.",'Instant'],
 ['Delayed Blink',"Exile up to one target creature you control. Return that card to the battlefield under its owner's control with a flying counter on it at the beginning of the next end step.",'Instant'],
 ['X Counter','Counter target spell unless its controller pays {X}.','Instant','{X}{G}'],
 ['Dynamic Counter','Counter target spell unless its controller pays {1} for each card in your graveyard.','Instant'],
 ['Conditional Exile Counter',"Counter target spell unless its controller pays {3}. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.",'Instant'],
 ['Unblocked Draw',"Whenever this creature attacks and isn't blocked, draw a card."],
 ['Unblocked Discard',"Whenever this creature attacks and isn't blocked, defending player discards a card."],
 ['Frenzied','Frenzy 2'],
 ['Flying Block','Whenever this creature blocks a creature with flying, this creature gets +2/+0 until end of turn.'],
 ['Combat Burn',"Whenever this creature blocks or becomes blocked by a creature, this creature deals 3 damage to that creature and 3 damage to that creature's controller."],
 ['Target Discount','This spell costs {2} less to cast if it targets a tapped creature.\nDestroy target creature.','Sorcery','{4}{G}'],
 ['Discount Kicker','This spell costs {3} less to cast if it targets a tapped creature.\nDestroy target creature.\nKicker {2}','Sorcery','{1}{G}'],
 ['Land Branch','Whenever a land you control enters, you gain 1 life. If that land is a Forest, you gain 3 life instead.'],
 ['Morbid Life','You gain 4 life. If a creature died this turn, you gain 8 life instead.','Instant'],
 ['Conditional Burn',"V7 Conditional Burn deals 2 damage to target creature. If that creature is green, V7 Conditional Burn deals 6 damage instead.",'Instant'],
 ['Conditional Shrink','Target creature gets -4/-1 until end of turn. If that creature is white, it gets -4/-4 until end of turn instead.','Instant'],
 ['Monarch Burn','At the beginning of your upkeep, this creature deals 2 damage to target player. If you are the monarch, this creature deals 7 damage instead.'],
 ['Different Bite','Target creature you control deals damage equal to its power to another target creature.','Sorcery'],
 ['Spider Knowledge',"Whenever another creature you control enters, you gain 1 life. If it's a Spider, draw a card."],
 ['Bite','Target creature you control deals damage equal to its power to target creature an opponent controls.','Sorcery'],
 ['Bite After Pump','Target creature you control gets +2/+0 until end of turn. Then it deals damage equal to its power to target creature an opponent controls.','Sorcery'],
 ['Tough Bite','Target creature you control deals damage equal to twice its toughness to target player.','Sorcery'],
 ['Spider Watcher',"Whenever another creature you control enters, you gain 1 life. If it's a Spider, put a +1/+1 counter on it."],
 ['Living Lands',"Each land gets +2/+2 as long as it's a creature.",'Enchantment'],
 ['Cast Entry','When this creature enters, if you cast it, you gain 7 life.'],
 ['Commander Condition','This creature gets +2/+2 as long as you control a commander.'],
 ['Monarch Condition','At the beginning of your upkeep, if you are the monarch, you gain 3 life.'],
 ['Artifact Bonus','Target creature gets +2/+2 until end of turn. If it is an artifact creature, it gains indestructible until end of turn.','Instant'],
 ['Scoped Search','When this creature enters, search your library for a basic Plains card or a creature card with mana value 1 or less, reveal it, put it into your hand, then shuffle.'],
 ['Dethroner','Dethrone'],
 ['Rampager','Rampage 2'],
 ['Mobilizer','Mobilize 2'],
 ['Squad','Squad {2}'],
 ['Blitzer','Blitz {G}'],
 ['Warper','Warp {G}'],
 ['Tall Watcher','Whenever you cast a spell with mana value 5 or greater, you gain 3 life.','Enchantment'],
 ['Entry Cast Watcher','When this enchantment enters and whenever you cast a spell with mana value 5 or greater, you gain 3 life.','Enchantment'],
 ['Land Cast Watcher','Whenever you cast a blue spell or an Island you control enters, you gain 3 life.','Enchantment'],
 ['Exile Cast Watcher','Whenever you cast a spell from anywhere other than your hand, you gain 3 life.','Enchantment'],
 ['Artifact Animator','When this creature enters, put three +1/+1 counters on up to one target noncreature artifact. That artifact becomes a 0/0 Homunculus artifact creature with flying.'],
 ['Goad','Goad target creature.','Sorcery'],
 ['Suspect','Suspect target creature.','Sorcery'],
 ['Grave Watcher','Whenever one or more creature cards leave your graveyard, you gain 3 life.'],
 ['Mill Watcher','Whenever one or more creature cards are put into your graveyard from your library, you gain 3 life.'],
 ['Combat Watcher','Whenever one or more Bears you control deal combat damage to a player, you gain 3 life.'],
 ['Attack Tribe','Whenever one or more Bears you control attack, you gain 3 life.'],
 ['Sky Restriction',"This creature can't be blocked by creatures with flying."],
 ['Wall Restriction',"This creature can't be blocked except by Walls."],
 ['Two Casts',"This creature can't be blocked if you've cast two or more spells this turn."],
 ['Reflexive Bolt','When this creature enters, you may pay {R}. When you do, this creature deals 3 damage to target creature an opponent controls.'],
 ['Reflexive Reanimate','When this creature enters, you may exile two cards from your graveyard. When you do, return target creature card from your graveyard to the battlefield.'],
 ['Reflexive Sacrifice','When this creature enters, you may sacrifice another creature. When you do, target player draws two cards.'],
 ['Saga','I, II — You gain 2 life.\nIII — Draw a card.','Enchantment — Saga'],
 ['Optional Saga','I — You may gain 3 life.','Enchantment — Saga'],
 ['Small Copy',"Create a token that's a copy of target creature, except it's a 1/1.",'Sorcery'],
 ['Hasty Copy',"Create a token that's a copy of target creature, except it has haste.",'Sorcery'],
 ['Fleeting Copy',"Create a token that's a copy of target creature. That token gains haste. Exile it at the beginning of the next end step.",'Sorcery'],
 ['Sacrificed Copy',"Create a token that's a copy of target creature. Sacrifice it at the beginning of the next end step.",'Sorcery'],
 ['Grave Copy',"Create a token that's a copy of target creature card from your graveyard.",'Sorcery'],
 ['Second Watcher','Whenever you cast your second spell each turn, put a +1/+1 counter on this creature.'],
 ['First Watcher',"Whenever you cast your first spell during each opponent's turn, you gain 3 life."],
 ['Enchantment Watcher','Whenever you cast your first enchantment spell each turn, put a +1/+1 counter on this creature.'],
 ['Historic Watcher','Whenever you cast a historic spell, put a +1/+1 counter on this creature.'],
 ['Attack Watcher','Whenever you attack, you gain 3 life.','Enchantment'],
 ['Revolt','When this creature enters, if a permanent left the battlefield under your control this turn, you gain 5 life.'],
 ['Cycling Bolt','Cycling {1}\nWhen you cycle this card, you may have it deal 2 damage to target creature.','Creature — Bear','{3}{R}'],
 ['Cycling Madness','Cycling {1}\nMadness {G}\nWhen you cycle this card, you gain 3 life.','Creature — Bear','{3}{G}'],
 ['Artifact Army','When this creature enters, create two tapped 2/2 black Necron Warrior artifact creature tokens.'],
 ['Exile Cost','As an additional cost to cast this spell, exile a creature card from your graveyard.','Creature — Bear','{1}{G}'],
 ['Land Cost','As an additional cost to cast this spell, sacrifice a land.\nDraw a card.','Sorcery','{G}'],
 ['Artifact Cost','As an additional cost to cast this spell, sacrifice an artifact.\nDraw a card.','Sorcery','{1}'],
 ['Life Cost','As an additional cost to cast this spell, pay 2 life.\nDraw a card.','Sorcery','{B/P}'],
 ['Tribal Gift','Bears you control gain flying until end of turn.','Instant'],
 ['Opponent Tap','Tap all creatures your opponents control.','Sorcery'],
 ['Other Gift','When this creature enters, another target creature you control gains hexproof until end of turn.'],
 ['Fight After Pump','Target green creature you control gets +2/+2 until end of turn. It fights target green creature an opponent controls.','Sorcery'],
 ['Manifest','Manifest the top two cards of your library.','Sorcery'],
 ['Dread','Manifest dread.','Sorcery'],
 ['Cloak','Cloak the top card of your library.','Sorcery'],
 ['Populate','Populate.','Instant'],
 ['Bolster','Bolster 3.','Instant'],
 ['Support','When this creature enters, support 2.'],
 ['Fader','Fading 2'],
 ['Vanisher','Vanishing 2'],
 ['Age','Cumulative upkeep {1}{G}'],
 ['Buyback','Draw a card.\nBuyback {2}','Instant','{U}'],
 ['Second','Draw a card.\nSplit second','Instant','{U}'],
 ['Jump','Draw a card.\nJump-start','Sorcery','{U}'],
 ['Transmuter','Transmute {1}{U}{U}','Creature — Bear','{2}{U}'],
 ['Foreteller','Draw a card.\nForetell {U}','Sorcery','{1}{U}'],
 ['Utility Converter','{R}: Add {B}.\n{G}: Draw a card.','Artifact'],
 ['Counter Continuation','Target creature you control gains double strike until end of turn. If it has a +1/+1 counter on it, draw a card.','Instant'],
 ['Temporary Rule','Until end of turn, target creature gains "{G}: Draw a card."','Instant'],
 ['Temporary Shield','Until end of turn, target creature you control gains indestructible and "Whenever this creature is dealt damage, put that many +1/+1 counters on it."','Instant'],
 ['Devout','You gain life equal to your devotion to green and white.','Sorcery'],
 ['Party','Draw a card for each creature in your party.','Sorcery'],
 ['Conditional Destroy','Destroy target creature if it is tapped.','Sorcery'],
 ['Exile Counter',"Counter target creature or enchantment spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.",'Instant'],
 ['Scavenger','Scavenge {G}','Creature — Bear','{4}{G}'],
 ['Renewer','Renew — {G}, Exile this card from your graveyard: Put two +1/+1 counters on target creature. Activate only as a sorcery.'],
 ['Mad Bear','Madness {G}','Creature — Bear','{4}{G}'],
 ['Mad Draw','Draw a card.\nMadness {G}','Sorcery','{4}{G}'],
 ['Bounce Spell',"Return target spell to its owner's hand.",'Instant'],
 ['Mercenary','When this creature enters, create a 1/1 red Mercenary creature token with "{T}: Target creature you control gets +1/+0 until end of turn. Activate only as a sorcery."'],
 ['Spawn' ,'Create a 0/1 colorless Eldrazi Spawn creature token with "Sacrifice this token: Add {C}."','Sorcery'],
 ['Wizard Maker','When this creature enters, create a 0/1 black Wizard creature token with "Whenever you cast a noncreature spell, this token deals 1 damage to each opponent."'],
 ['Ooze Maker','When this creature dies, create two 2/2 green Ooze creature tokens. They have "When this token dies, create two 1/1 green Ooze creature tokens."'],
 ['Exact Search' ,'Search your library for an artifact card with mana value 3, reveal it, put it into your hand, then shuffle.','Sorcery'],
 ['Basic Search','Search your library for a basic Forest, Plains, or Island card, put it onto the battlefield tapped, then shuffle.','Sorcery'],
 ['Top Permanents','Look at the top five cards of your library. Put any number of permanent cards onto the battlefield and the rest into your hand.','Sorcery'],
 ['Power Up','Power-up — {5}{G}{G}: Draw a card.','Creature — Hero','{2}{G}'],
 ['Loyal','+1: Draw a card.\n−2: Destroy target creature.\n−10: Gain 5 life.','Legendary Planeswalker — Tester'],
 ['Exhaustion','Exhaust — {G}: Draw a card.'],
 ['Boaster','Boast — {G}: Draw a card.'],
 ['Prismatic','Sunburst','Artifact Creature — Golem','{3}'],
 ['All Return','Return all creature cards from your graveyard to the battlefield.','Sorcery'],
 ['Each Return','Each player puts a creature card from their graveyard onto the battlefield.','Sorcery'],
 ['Empty Graves','Exile all graveyards.','Sorcery'],
 ['Converter','{R}: Add {B}.'],
 ['Altar','Sacrifice a creature: Add {C}{C}.','Artifact'],
 ['Cradle','{T}: Add {G} for each creature you control.','Land'],
 ['Dragon Mana','{T}: Add one mana of any color. Activate only if you control a Dragon.','Artifact'],
 ['Harbinger','When this creature enters, you may search your library for an Elf card, reveal it, then shuffle and put that card on top.'],
 ['Seahawk','When this creature enters, you may search your library for a card named Grizzly Bears, reveal it, put it into your hand, then shuffle.'],
 ['Two Targets','Destroy target creature and target land.','Sorcery'],
 ['Token Plague','Creature tokens get -1/-1.','Enchantment'],
 ['Vampire Observer','Whenever a Vampire you control deals combat damage to a player, put a +1/+1 counter on it.'],
 ['Oozes','Create X X/X green Ooze creature tokens.','Sorcery','{X}{X}{G}'],
 ['Death Size','Create an X/X black Horror creature token, where X is the number of creatures that died this turn.','Instant'],
 ['Optional Tail','When this creature enters, draw a card. You may gain 2 life.'],
 ['Blue Instant','Counter target blue instant spell.','Instant'],
 ['Regeneration','Regenerate each creature you control.','Instant'],
];
function input(name,oracle,type='Creature — Bear',cost='{1}{G}'){
 return {name:'V7 '+name,oracle_text:oracle,type_line:type,layout:type.includes('— Saga')?'saga':'normal',loyalty:type.includes('Planeswalker')?'5':undefined,mana_cost:cost,power:'2',toughness:'2'};
}
const fixtures=definitions.map((args,i)=>{
 if(process.env.ORACLE_V7_DEBUG)console.error('fixture',args[0]);
 const card=input(...args),semantic=semanticClass(card);
 assert.ok(semantic.semanticClass,card.name+': '+semantic.reason);
 return {position:i+1,oracleId:'v7-'+i,scryfallId:'v7-print-'+i,...semantic,
 raw:{name:card.name,loyalty:card.loyalty,cost:card.mana_cost,oracle:card.oracle_text,types:card.type_line.split(' — ')[0].split(' '),subtypes:card.type_line.split(' — ')[1]?.split(' ')||[],super:[],power:'2',toughness:'2',_ci:['G'],_oracleId:'v7-'+i,_scryfallId:'v7-print-'+i},catalog:{typeLine:card.type_line,commanderLegality:'legal'}};
});
const adventureSource={name:'V7 Adventurer // Test Gift',layout:'adventure',mana_cost:'{1}{G} // {1}{U}',card_faces:[{name:'V7 Adventurer',type_line:'Creature — Bear',mana_cost:'{1}{G}',oracle_text:'Vigilance',power:'2',toughness:'3'},{name:'Test Gift',type_line:'Instant — Adventure',mana_cost:'{1}{U}',oracle_text:"Return target creature to its owner's hand."}]};
const adventureSemantic=semanticClass(adventureSource);assert.ok(adventureSemantic.semanticClass);
fixtures.push({position:fixtures.length+1,oracleId:'v7-adventure',scryfallId:'v7-adventure-print',...adventureSemantic,raw:{name:adventureSource.name,cost:'{1}{G}',types:['Creature'],subtypes:['Bear'],super:[],power:'2',toughness:'3',oracle:'Vigilance',_ci:['G','U']},catalog:{typeLine:'Creature — Bear // Instant — Adventure',commanderLegality:'legal',aliases:['V7 Adventurer','Test Gift']}});
for(const [name,left,right] of [
 ['V7 Split',["Return target creature to its owner's hand.\nFuse",'{U}','Instant'],['Draw a card.\nFuse','{2}{G}','Sorcery']],
 ['V7 After',['Draw a card.','{U}','Sorcery'],['Aftermath\nYou gain 3 life.','{1}{W}','Sorcery']],
 ['V7 Double X',['Draw X cards.\nFuse','{X}{U}','Instant'],['You gain X life.\nFuse','{X}{G}','Instant']],
 ['V7 Blink Fuse',["Exile target creature, then return it to the battlefield under its owner's control.\nFuse",'{W}','Instant'],['Put a +1/+1 counter on target creature.\nFuse','{G}','Instant']],
]){
 const card={name,layout:'split',card_faces:[left,right].map(([oracle_text,mana_cost,type_line],i)=>({name:name+' '+i,oracle_text,mana_cost,type_line}))};
 const semantic=semanticClass(card);assert.ok(semantic.semanticClass,name+': '+semantic.reason);
 fixtures.push({position:fixtures.length+1,oracleId:name,scryfallId:name+'-print',...semantic,raw:{name,cost:left[1]+right[1],types:[...new Set([left[2],right[2]])],subtypes:[],super:[],oracle:card.card_faces.map(face=>face.oracle_text).join('\n'),_ci:['W','U','G']},catalog:{typeLine:left[2]+' // '+right[2],commanderLegality:'legal',aliases:card.card_faces.map(face=>face.name)}});
}
MTG.registerOracleBatch({id:'oracle-v7-test',sequence:9998,cards:fixtures});MTG.initData(MTG.RAW_DATA);
function put(game,player,name,zone='battlefield'){
 const card=new MTG.CardInst(MTG.DEFS[name],player);card.zone=zone;card.ctrl=player;card.sick=false;
 if(zone==='battlefield'){game.battlefield.push(card);game.recalc();}else player[zone].push(card);return card;
}
function context(role){
 const trace=[];const human={decide:async(g,q)=>{
  if(q.type==='priority')return {kind:'pass'};
  if(q.type==='chooseTargets')return q.candidates.slice(0,q.max??1);
  if(q.type==='chooseCards')return q.from.slice(0,q.max??q.min??1);
  if(q.type==='chooseOption')return q.options.find(o=>o.key==='yes')?.key||q.options[0].key;
  if(q.type==='chooseMulti')return q.options.slice(0,q.max??q.min).map(option=>option.key);
  if(q.type==='orderTriggers')return q.triggers;
  if(q.type==='attackers')return q.eligible.map(card=>({card,target:q.opponents[0]}));
  if(q.type==='blockers')return [];
  if(q.type==='chooseX'&&q.prompt?.startsWith('Replicate'))return Math.min(3,q.max);
  if(q.type==='scry')return {top:q.cards,bottom:[]};return [];
 }};
 const game=new MTG.Game({seed:970031,paced:false});const a=game.addPlayer('A',{name:'A'},human,role==='ai'),b=game.addPlayer('B',{name:'B'},human,false);
 if(role==='ai')a.controller=new MTG.AIController(a,{difficulty:'hard',style:'balanced'});
 const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>{const result=await decide(g,q);trace.push({q,result});return result;};
 game.turnPlayer=a;game.turnNo=3;game.phase='main1';game.step='main';game.priorityRound=async()=>{};
 game.revealToHuman=async()=>{};game.reviewGlobalEffectWithHuman=async()=>{};
 for(const p of [a,b])for(let i=0;i<15;i++)put(game,p,'Forest','library');
 return {game,a,b,trace};
}
async function settle(game){
 for(let i=0;i<80&&(game.stack.length||game.pendingTriggers.length);i++){await game.flushTriggers();if(game.stack.length)await game.resolveTop();}
 assert.equal(game.stack.length,0);assert.equal(game.pendingTriggers.length,0);assert.equal((game.aiDecisionLog||[]).some(d=>d.fallback),false);
}
async function cleanupTurn(game){const main=game.mainPhase,combat=game.combatPhase;game.mainPhase=async()=>{};game.combatPhase=async()=>{};try{await game.runTurn();}finally{game.mainPhase=main;game.combatPhase=combat;}}
async function cast(ctx,name,opts={}){
 const {game,a}=ctx,card=put(game,a,'V7 '+name,'hand');a.pool.C+=20;a.pool.G+=5;
 assert.equal(await game.castSpell(a,card,{from:'hand',...opts}),true);await settle(game);return card;
}
for(const role of ['human','ai']){
 test(`v7 ${role}: Moonring Island pays blue mana from its basic land subtype`,async()=>{
  const {game,a}=context(role),land=put(game,a,'Moonring Island','hand');
  assert.equal(await game.playLand(a,land),true);await settle(game);
  assert.equal(land.tapped,true);assert.equal(game.canPayMana(a,MTG.parseCost('{U}')),false);
  land.tapped=false;assert.equal(await game.payMana(a,MTG.parseCost('{U}')),true);
  assert.equal(land.tapped,true);assert.equal(a.pool.U,0);assert.equal(game.stack.length,0);
  land.tapped=false;land.cur.abilitiesDisabled=true;
  assert.equal(game.canPayMana(a,MTG.parseCost('{U}')),false);
 });
 test(`v7 ${role}: Masterwork inherits and uses the copied Equipment's equip ability`,async()=>{
  const {game,a}=context(role);put(game,a,'Lightning Greaves');const bear=put(game,a,'Grizzly Bears');
  const copy=put(game,a,'Masterwork of Ingenuity','hand');a.pool.C=1;
  assert.equal(await game.castSpell(a,copy,{from:'hand'}),true);await settle(game);
  assert.equal(copy.name,'Lightning Greaves');assert.equal(copy.def.equip,'{0}');
  const action=game.activatableList(a).find(row=>row.card===copy&&row.equip);assert.ok(action);
  assert.equal(await game.activateAbility(a,action),true);await settle(game);
  assert.equal(copy.attachedTo,bear.iid);assert.equal(bear.kw('shroud'),true);assert.equal(bear.kw('haste'),true);
  await game.move(copy,'hand');assert.equal(copy.name,'Masterwork of Ingenuity');assert.equal(copy.def.equip,undefined);
 });
 test(`v7 ${role}: a chosen keyword applies to the locked object and expires at cleanup`,async()=>{
  const ctx=context(role),{game,a,trace}=ctx,card=put(game,a,'V7 Keyword Choice');a.pool.G=1;assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===card)),true);await settle(game);const choice=trace.find(row=>row.q.prompt==='Choose a keyword');assert.ok(choice);assert.ok(card.kw(choice.result));await cleanupTurn(game);assert.equal(card.kw(choice.result),false);
 });
 test(`v7 ${role}: backup grants only printed abilities below it, even after the source leaves`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,bear=put(game,a,'Grizzly Bears'),card=put(game,a,'V7 Backup','hand');a.pool.C=1;a.pool.G=1;const decide=a.controller.decide.bind(a.controller);if(role==='human')a.controller.decide=async(g,q)=>q.type==='chooseTargets'?[bear]:decide(g,q);
  assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await game.resolveTop();await game.flushTriggers();const trigger=game.stack.find(row=>row.srcCard===card&&row.kind==='trigger');assert.ok(trigger);const target=trigger.targets[0];await game.move(card,'exile');await settle(game);assert.equal(target.counters['+1/+1'],2);assert.ok(target.kw('flying'));assert.equal(target.kw('flash'),false);await cleanupTurn(game);assert.equal(target.kw('flying'),false);assert.equal(target.counters['+1/+1'],2);
 });
 test(`v7 ${role}: backup's granted activated ability belongs to the recipient`,async()=>{
  const ctx=context(role),{game,a,trace}=ctx,bear=put(game,a,'Grizzly Bears'),card=put(game,a,'V7 Backup Ability','hand');a.pool.C=1;a.pool.G=2;const decide=a.controller.decide.bind(a.controller);if(role==='human')a.controller.decide=async(g,q)=>q.type==='chooseTargets'?[bear]:decide(g,q);
  assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await settle(game);const recipient=game.bf().find(c=>c!==card&&c.cur.extraAbilities.length);if(!recipient){assert.equal(card.counters['+1/+1'],1);assert.equal(card.cur.extraAbilities.length,0);return;}const hand=a.hand.length;const action=game.activatableList(a).find(row=>row.card===recipient);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(recipient.zone,'graveyard');assert.equal(card.zone,'battlefield');assert.equal(a.hand.length,hand+1);
 });
 test(`v7 ${role}: optional sacrifice uses the sacrificed toughness, not a lost battlefield object`,async()=>{
  const ctx=context(role),{game,a}=ctx,source=put(game,a,'V7 Optional Value'),bear=put(game,a,'Grizzly Bears');game.addCounters(bear,'+1/+1',1);const decide=a.controller.decide.bind(a.controller);if(role==='human')a.controller.decide=async(g,q)=>q.type==='chooseCards'&&q.from.includes(bear)?[bear]:decide(g,q);await game.emit('endStep',{player:a});await settle(game);const snap=[source,bear].find(c=>c.zone==='graveyard');if(!snap){assert.equal(role,'ai');assert.equal(game.bf().filter(c=>c.isToken).length,0);return;}const expected=snap===bear?3:2;assert.equal(game.bf().filter(c=>c.isToken).length,expected);
 });
 test(`v7 ${role}: sacrifice amount captures modified toughness before the permanent changes zones`,async()=>{
  const ctx=context(role),{game,a}=ctx,source=put(game,a,'V7 Sac Value'),bear=put(game,a,'Grizzly Bears');game.addCounters(bear,'+1/+1',3);a.pool.G=1;const life=a.life;assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===source)),true);assert.equal(bear.zone,'graveyard');assert.equal(bear.counters['+1/+1']||0,0);await settle(game);assert.equal(a.life,life+5);
 });
 test(`v7 ${role}: spell copies retain the sacrificed object's last known power without another sacrifice`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,bear=put(game,a,'Grizzly Bears');game.addCounters(bear,'+1/+1',2);const spell=put(game,a,'V7 Sac Spell','hand');a.pool.G=1;a.pool.C=1;assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);const so=game.stack.find(row=>row.card===spell),target=so.targets[0],before=target.life??target.damage;assert.equal(bear.zone,'graveyard');await game.copySpell(so,a,{mayNewTargets:false});await settle(game);if(target instanceof MTG.Player)assert.equal(target.life,before-8);else assert.equal(target.damage,before+8);
 });
 test(`v7 ${role}: affinity and total mana-value counters count only qualifying cards`,async()=>{
  const ctx=context(role),{game,a,b}=ctx;const frog=put(game,a,'Grizzly Bears');frog.def={...frog.def,subtypes:['Frog']};const other=put(game,b,'Grizzly Bears');other.def={...other.def,subtypes:['Frog']};game.recalc();const c=await cast(ctx,'Frog Affinity');assert.equal(a.pool.C,16);put(game,a,'Divination','graveyard');put(game,a,'Doom Blade','graveyard');put(game,a,'Grizzly Bears','graveyard');const grave=await cast(ctx,'Total Grave');assert.equal(grave.counters['+1/+1'],5);
 });
 test(`v7 ${role}: spent-color conditions use actual mana and are false on a spell copy`,async()=>{
  const ctx=context(role),{game,a}=ctx,spell=put(game,a,'V7 Blue Bonus','hand');a.pool.U=1;a.pool.C=1;a.pool.G=1;const life=a.life;assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);assert.equal(spell.castMeta.paymentColorCounts.U,1);await game.copySpell(game.stack.find(row=>row.card===spell),a,{mayNewTargets:false});await settle(game);assert.equal(a.life,life+3);
 });
 test(`v7 ${role}: adamant counts units of blue spent, while main-phase bonus uses cast time`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,creature=put(game,a,'V7 Adamant','hand');a.pool.U=3;a.pool.C=1;assert.equal(await game.castSpell(a,creature,{from:'hand'}),true);await settle(game);assert.equal(creature.counters['+1/+1'],1);const hand=a.hand.length;game.phase='end';await cast(ctx,'Main Bonus');assert.equal(a.hand.length,hand);game.phase='main1';const bonus=put(game,a,'V7 Main Bonus','hand');assert.equal(await game.castSpell(a,bonus,{from:'hand'}),true);game.phase='end';await settle(game);assert.equal(a.hand.length,hand+1);
 });
 test(`v7 ${role}: untap restriction stops the untap step but not an explicit untap effect`,async()=>{
  const ctx=context(role),{game,a}=ctx,land=put(game,a,'Island'),forest=put(game,a,'Forest'),source=await cast(ctx,'Island Lock');land.tapped=forest.tapped=true;const marker=new Error('stop after untap'),emit=game.emit;game.emit=async function(event,data){if(event==='upkeep')throw marker;return emit.call(this,event,data);};await assert.rejects(game.runTurn(),error=>error===marker);game.emit=emit;assert.equal(land.tapped,true);assert.equal(forest.tapped,false);game.untap(land);assert.equal(land.tapped,false);await game.move(source,'exile');assert.equal(land.cur.cantUntap,false);
 });
 test(`v7 ${role}: replicate pays each additional cost and copies survive the countered original`,async()=>{
  const ctx=context(role),{game,a}=ctx,card=put(game,a,'V7 Replicate','hand');a.pool.C=4;a.pool.G=4;const hand=a.hand.length;
  assert.equal(await game.castSpell(a,card,{from:'hand'}),true);const original=game.stack.find(row=>row.card===card),n=card.castMeta.paidTimes;assert.ok(n>0&&n<=3);assert.equal(a.pool.C,3-n);assert.equal(a.pool.G,3-n);assert.equal(game.stack.filter(row=>row.isCopy).length,0);
  await game.flushTriggers();assert.ok(game.stack.some(row=>row.name.includes('Replicate')));await game.counterStackObject(original);await settle(game);assert.equal(a.hand.length,hand-1+n);assert.equal(a.turnState.spellsCast,1);
 });
 test(`v7 ${role}: a free replicate spell still pays repeats and its trigger can be countered`,async()=>{
  const ctx=context(role),{game,a}=ctx,card=put(game,a,'V7 Replicate','hand');a.pool.C=2;a.pool.G=2;const hand=a.hand.length;assert.equal(await game.castSpell(a,card,{from:'hand',alt:{free:true}}),true);assert.ok(card.castMeta.paidTimes>0);assert.equal(a.pool.C,2-card.castMeta.paidTimes);
  await game.flushTriggers();const trigger=game.stack.find(row=>row.kind==='trigger'&&row.name.includes('Replicate'));assert.ok(trigger);assert.equal(await game.counterStackObject(trigger),true);await settle(game);assert.equal(a.hand.length,hand);assert.equal(a.turnState.spellsCast,1);
 });
 test(`v7 ${role}: ravenous threshold uses chosen X, not current counters, and is lost after blinking`,async()=>{
  const ctx=context(role),{game,a}=ctx,first=await cast(ctx,'Ravenous',{xVal:4});assert.equal(first.counters['+1/+1'],4);const hand=a.hand.length;const second=put(game,a,'V7 Ravenous','hand');a.pool.C=5;a.pool.G=1;assert.equal(await game.castSpell(a,second,{from:'hand',xVal:5}),true);await game.resolveTop();assert.equal(second.counters['+1/+1'],5);game.removeCounters(second,'+1/+1',5);await settle(game);assert.equal(a.hand.length,hand+1);await game.move(second,'exile');await game.move(second,'battlefield',{ctrl:a});await settle(game);assert.equal(second.counters['+1/+1']||0,0);assert.equal(a.hand.length,hand+1);
 });
 test(`v7 ${role}: graveyard land permission obeys ordinary timing, allowance and source removal`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,source=await cast(ctx,'Grave Lands'),land=put(game,a,'Forest','graveyard');game.turnPlayer=b;assert.equal(await game.playLand(a,land),false);game.turnPlayer=a;assert.equal(await game.playLand(a,land),true);const other=put(game,a,'Island','graveyard');assert.equal(await game.playLand(a,other),false);a.landsPlayed=0;await game.move(source,'exile');assert.equal(await game.playLand(a,other),false);assert.equal(other.zone,'graveyard');
 });
 test(`v7 ${role}: conditional free cast is rechecked when the commander leaves`,async()=>{
  const ctx=context(role),{game,a}=ctx,card=put(game,a,'V7 Free Commander','hand'),alt=card.def.altCosts.find(row=>row.oracleConditional);assert.equal(await game.castSpell(a,card,{from:'hand',alt}),false);const commander=put(game,a,'Grizzly Bears');commander.commander=true;const legal=game.castableList(a).find(row=>row.card===card&&row.alt?.oracleConditional);assert.ok(legal);await game.move(commander,'exile');assert.equal(await game.castSpell(a,card,{from:'hand',alt:legal.alt}),false);await game.move(commander,'battlefield',{ctrl:a});assert.equal(await game.castSpell(a,card,{from:'hand',alt:legal.alt}),true);await settle(game);assert.equal(card.castMeta.manaSpent,0);
 });
 test(`v7 ${role}: entry counts see pre-entry creatures and re-evaluate after blinking`,async()=>{
  const ctx=context(role),{game,a,b}=ctx;put(game,a,'Grizzly Bears');put(game,b,'Shivan Dragon');put(game,a,'Sol Ring');const card=await cast(ctx,'Entry Count');assert.equal(card.counters['+1/+1'],1);
  put(game,a,'Llanowar Elves');await game.move(card,'exile');await game.move(card,'battlefield',{ctrl:a});assert.equal(card.counters['+1/+1'],2);
  const maximum=await cast(ctx,'Entry Maximum');assert.equal(maximum.counters['+1/+1'],4);
 });
 test(`v7 ${role}: graveyard and gained-life entry counts exclude off-type cards and current life`,async()=>{
  const ctx=context(role),{game,a,b}=ctx;put(game,a,'Grizzly Bears','graveyard');put(game,b,'Shivan Dragon','graveyard');put(game,a,'Forest','graveyard');const card=await cast(ctx,'Entry Grave');assert.equal(card.counters['+1/+1'],2);
  await game.gainLife(a,3);await game.loseLife(a,7);const life=await cast(ctx,'Entry Life');assert.equal(life.counters['+1/+1'],3);
 });
 test(`v7 ${role}: X counters pay both symbols, converge uses only actually spent colors`,async()=>{
  const ctx=context(role),{game,a}=ctx,x=await cast(ctx,'Entry X',{xVal:3});assert.equal(x.counters.charge,3);assert.equal(a.pool.C,14);a.pool={W:1,U:1,B:0,R:0,G:0,C:1};const card=put(game,a,'V7 Entry Converge','hand');assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await settle(game);assert.equal(card.counters['+1/+1'],4);
  const free=await cast(ctx,'Entry Converge',{alt:{free:true}});assert.equal(free.counters['+1/+1']||0,0);
 });
 test(`v7 ${role}: entry counters and tapped replacements happen before observers and reset on a new object`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,tapped=await cast(ctx,'Entry Tapped');assert.equal(tapped.tapped,true);assert.equal(tapped.counters.charge,3);const hand=await cast(ctx,'Entry Hand');assert.equal(hand.zone,'graveyard');await game.move(hand,'battlefield',{ctrl:a});assert.equal(hand.counters['-1/-1']||0,0);
  game.turnPlayer=b;const flash=await cast(ctx,'Entry Turn');assert.equal(flash.tapped,true);game.turnPlayer=a;await game.move(flash,'exile');await game.move(flash,'battlefield',{ctrl:a});assert.equal(flash.tapped,false);
 });
 test(`v7 ${role}: conditional land entry uses its controller's actual Island`,async()=>{
  const ctx=context(role),{game,a,b}=ctx;put(game,b,'Island');const land=put(game,a,'V7 Entry Island','hand');assert.equal(await game.playLand(a,land),true);assert.equal(land.tapped,true);put(game,a,'Island');await game.move(land,'exile');await game.move(land,'battlefield',{ctrl:a});assert.equal(land.tapped,false);
 });
 test(`v7 ${role}: overload pays an alternative cost, ignores targeting shields and sees late arrivals`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,protectedCard=put(game,b,'Grizzly Bears');protectedCard.def={...protectedCard.def,kws:['shroud','hexproof']};game.recalc();const spell=put(game,a,'V7 Overload Bounce','hand');a.pool.C=10;a.pool.G=2;
  assert.equal(await game.castSpell(a,spell,{from:'hand'}),false);assert.equal(await game.castSpell(a,spell,{from:'hand',alt:{overloaded:true,altCostStr:'{3}{G}',free:true}}),false);assert.equal(spell.zone,'hand');const option=game.castableList(a).find(row=>row.card===spell&&row.alt?.overloaded);assert.ok(option);assert.equal(await game.castSpell(a,spell,{from:'hand',alt:option.alt}),true);const so=game.stack.find(row=>row.card===spell);assert.equal(so.targets.length,0);assert.equal(Object.values(a.pool).reduce((sum,n)=>sum+n,0),8);const late=put(game,b,'Grizzly Bears'),own=put(game,a,'Grizzly Bears'),land=put(game,b,'Forest');await settle(game);assert.equal(protectedCard.zone,'hand');assert.equal(late.zone,'hand');assert.equal(own.zone,'battlefield');assert.equal(land.zone,'battlefield');
 });
 test(`v7 ${role}: overload copies retain the choice but do not pay again`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,card=put(game,b,'Grizzly Bears');card.def={...card.def,toughness:'10'};game.recalc();const spell=put(game,a,'V7 Overload Damage','hand');a.pool.C=3;a.pool.G=1;assert.equal(await game.castSpell(a,spell,{from:'hand',alt:spell.def.altCosts[0]}),true);const so=game.stack.find(row=>row.card===spell);await game.copySpell(so,a,{mayNewTargets:true});assert.equal(game.stack.length,2);assert.ok(game.stack.every(row=>row.castOpts.overloaded&&row.targets.length===0));assert.equal(Object.values(a.pool).reduce((sum,n)=>sum+n,0),0);await settle(game);assert.equal(card.damage,4);
 });
 test(`v7 ${role}: X overload charges both X symbols without changing printed mana value`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,ground=put(game,b,'Grizzly Bears'),flyer=put(game,b,'Grizzly Bears');flyer.def={...flyer.def,kws:['flying']};game.recalc();const spell=put(game,a,'V7 Overload X','hand');a.pool.C=4;a.pool.G=1;assert.equal(await game.castSpell(a,spell,{from:'hand',xVal:2,alt:spell.def.altCosts[0]}),true);const so=game.stack.find(row=>row.card===spell);assert.equal(game.stackSpellManaValue(so),3);assert.equal(Object.values(a.pool).reduce((sum,n)=>sum+n,0),0);await settle(game);assert.equal(ground.zone,'graveyard');assert.equal(flyer.zone,'battlefield');assert.equal(flyer.damage,0);
 });
 test(`v7 ${role}: firebending uses the Stack, retains only its own mana and expires after combat`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,source=await cast(ctx,'Fire');for(const color of Object.keys(a.pool))a.pool[color]=0;a.pool.R=1;game.phase='combat';game.combat={attackers:[source],defenders:new Map()};source.attacking=b;await game.emit('attacks',{card:source,defender:b});await game.flushTriggers();assert.equal(a.pool.R,1);assert.ok(game.stack.some(row=>row.kind==='trigger'&&row.srcCard===source));await settle(game);assert.equal(a.pool.R,3);game.emptyPool();assert.equal(a.pool.R,2);assert.equal(await game.payMana(a,MTG.parseCost('{R}'),{}),true);game.emptyPool();assert.equal(a.pool.R,1);await game.endCombatStep(a);game.emptyPool();assert.equal(a.pool.R,0);assert.equal(a.poolMeta.length,0);
 });
 test(`v7 ${role}: firebending X evaluates current power on resolution and uses last known power after death`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,source=await cast(ctx,'Power Fire');for(const color of Object.keys(a.pool))a.pool[color]=0;game.phase='combat';game.combat={attackers:[source],defenders:new Map()};await game.emit('attacks',{card:source,defender:b});await game.flushTriggers();game.addCounters(source,'+1/+1',3);await settle(game);assert.equal(a.pool.R,5);await game.emit('attacks',{card:source,defender:b});await game.flushTriggers();await game.move(source,'graveyard');await settle(game);assert.equal(a.pool.R,10);
 });
 test(`v7 ${role}: global existence and opponent graveyard restrictions update immediately`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,source=await cast(ctx,'Mountain Restriction');assert.equal(game.canAttackAtAll(source),false);const mountain=put(game,b,'Mountain');assert.equal(game.canAttackAtAll(source),true);await game.move(mountain,'hand');assert.equal(game.canAttackAtAll(source),false);const grave=await cast(ctx,'Grave Restriction');assert.equal(grave.cur.cantBlock,true);for(let i=0;i<8;i++)put(game,b,'Forest','graveyard');game.recalc();assert.equal(grave.cur.cantBlock,false);await game.move(b.graveyard[0],'exile');assert.equal(grave.cur.cantBlock,true);
 });
 test(`v7 ${role}: extra land allowance disappears without resetting lands already played`,async()=>{
  const ctx=context(role),{game,a}=ctx,source=await cast(ctx,'Extra Land'),first=put(game,a,'Forest','hand'),second=put(game,a,'Forest','hand');assert.equal(await game.playLand(a,first),true);await game.move(source,'exile');assert.equal(await game.playLand(a,second),false);const another=await cast(ctx,'Extra Land');assert.equal(await game.playLand(a,second),true);assert.equal(a.landsPlayed,2);assert.equal(await game.playLand(a,put(game,a,'Forest','hand')),false);
 });
 test(`v7 ${role}: modal spells cannot adopt a new object after the earlier mode moves it`,async()=>{
  const ctx=context(role),{game,b}=ctx,card=put(game,b,'Grizzly Bears');await cast(ctx,'Modal Tuck');assert.equal(card.zone,'library');assert.equal(b.hand.includes(card),false);
 });
 test(`v7 ${role}: defending-player attack restrictions govern a complete combat`,async()=>{
  const ctx=context(role),{game,a,b,trace}=ctx,card=await cast(ctx,'Defender Island');card.sick=false;const life=b.life;
  assert.equal(game.canAttackTarget(card,b),false);await game.combatPhase(a);assert.equal(b.life,life);
  const island=put(game,b,'Island');assert.equal(game.canAttackTarget(card,b),true);await game.combatPhase(a);assert.equal(b.life,life-card.power);assert.ok(trace.some(row=>row.q.type==='attackers'));
  await game.move(island,'hand');assert.equal(game.canAttackTarget(card,b),false);
 });
 test(`v7 ${role}: blocker restrictions compare current power and both directions`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,small=await cast(ctx,'Small Blocker'),two=put(game,b,'Grizzly Bears');assert.equal(game.canBlock(small,two),true);game.addCounters(two,'+1/+1',1);assert.equal(game.canBlock(small,two),false);game.addCounters(small,'+1/+1',1);assert.equal(game.canBlock(small,two),true);
  const both=await cast(ctx,'Two Way');assert.equal(game.canBlock(both,two),false);assert.equal(game.canBlock(two,both),false);const one=put(game,b,'Grizzly Bears');one.def={...one.def,power:'1'};game.recalc();assert.equal(game.canBlock(both,one),true);assert.equal(game.canBlock(one,both),true);
 });
 test(`v7 ${role}: group combat effects lock recipients and expire at end of combat`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,old=put(game,b,'Grizzly Bears');await cast(ctx,'No Ground Block');assert.equal(old.cur.cantBlock,true);const newcomer=put(game,b,'Grizzly Bears');assert.equal(newcomer.cur.cantBlock,false);await game.move(old,'exile');await game.move(old,'battlefield',{ctrl:b});assert.equal(old.cur.cantBlock,false);
  const combat=await cast(ctx,'Combat Block');const affected=game.bf().find(card=>card.cur.cantBlock);assert.ok(affected);await game.endCombatStep(a);assert.equal(affected.cur.cantBlock,false);
 });
 test(`v7 ${role}: controller protection distinguishes players and planeswalkers`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,card=put(game,b,'Grizzly Bears'),walker=put(game,a,'Grizzly Bears');walker.def={...walker.def,types:['Planeswalker'],loyalty:5};walker.counters.loyalty=5;game.recalc();await cast(ctx,'Ground Defense');assert.equal(game.canAttackTarget(card,a),false);assert.equal(game.canAttackTarget(card,walker),true);card.def={...card.def,kws:['flying']};game.recalc();const source=await cast(ctx,'Flying Defense');assert.equal(game.canAttackTarget(card,walker),false);await game.move(source,'exile');assert.equal(game.canAttackTarget(card,walker),true);
 });
 test(`v7 ${role}: quoted token restrictions affect actual blocking and remain intrinsic`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,ground=put(game,b,'Grizzly Bears');await cast(ctx,'Rat Token');const rat=game.creatures(a).find(card=>card.hasSub('Rat'));assert.ok(rat);assert.equal(game.canBlock(rat,ground),false);await cast(ctx,'Flying Token');const faerie=game.creatures(a).find(card=>card.hasSub('Faerie'));assert.ok(faerie);assert.equal(game.canBlock(faerie,ground),false);ground.def={...ground.def,kws:['flying']};game.recalc();assert.equal(game.canBlock(faerie,ground),true);
 });
 test(`v7 ${role}: stolen impulse cards cost mana and obey cast-only land restrictions`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,foreign=put(game,b,'Sol Ring','library');foreign.def={...foreign.def,cost:'{U}'};await cast(ctx,'Enemy Impulse');assert.equal(foreign.zone,'exile');assert.equal(foreign.owner,b);assert.equal(game.castableList(a).some(row=>row.card===foreign),true);for(const key of Object.keys(a.pool))a.pool[key]=0;assert.equal(await game.castSpell(a,foreign,{from:'exile',asThoughAnyColor:true}),false);a.pool.G=1;const option=game.castableList(a).find(row=>row.card===foreign);assert.ok(option);assert.equal(await game.castSpell(a,foreign,{from:'exile',...option.alt}),true);await settle(game);assert.equal(foreign.ctrl,a);assert.equal(a.pool.G,0);const land=put(game,b,'Forest','library');await cast(ctx,'Enemy Impulse');assert.equal(game.playableLands(a).some(row=>(row.card||row)===land),false);
 });
 test(`v7 ${role}: plain exile grants no permission and owner chooses a stolen creature's library placement`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,top=b.library.slice(-2);await cast(ctx,'Plain Exile');assert.ok(top.every(card=>card.zone==='exile'&&!card.meta.playableBy));const stolen=put(game,b,'Grizzly Bears');stolen.ctrl=a;let asked=0;const decide=b.controller.decide.bind(b.controller);b.controller.decide=async(g,q)=>{if(q.aiHint?.kind==='oracleLibraryChoice'){asked++;return 'bottom';}return decide(g,q);};await cast(ctx,'Tuck Choice');assert.equal(asked,1);assert.equal(stolen.zone,'library');assert.equal(b.library[0]?.iid,stolen.iid);
 });
 test(`v7 ${role}: inspecting an opponent library does not publicly reveal it`,async()=>{
  const ctx=context(role),{game,a,b}=ctx;let publicReveals=0;game.revealToHuman=async()=>{publicReveals++;};const old=a.library.length+b.library.length;await cast(ctx,'Peek');assert.equal(publicReveals,0);assert.equal(a.library.length+b.library.length,old-1);
 });
 test(`v7 ${role}: reveal-to-hand loses the revealed mana value, no card means no life loss`,async()=>{
  const ctx=context(role),{game,a}=ctx;const source=await cast(ctx,'Reveal Life'),card=put(game,a,'Grizzly Bears','library');await game.emit('upkeep',{player:a});await settle(game);assert.equal(card.zone,'hand');assert.equal(a.life,38);for(const card of a.library.slice())await game.move(card,'exile');await game.emit('upkeep',{player:a});await settle(game);assert.equal(a.life,38);assert.equal(!!a.deckedOut,false);
 });
 test(`v7 ${role}: conditional top-card entry and failed-condition bottom choice`,async()=>{
  const ctx=context(role),{game,a}=ctx,land=put(game,a,'Forest','library');await cast(ctx,'Peek Land');assert.equal(land.zone,'battlefield');assert.equal(land.tapped,true);const creature=put(game,a,'Grizzly Bears','library');await cast(ctx,'Peek Land');assert.equal(creature.zone,'library');assert.equal(a.library[0]?.iid,creature.iid);
 });
 test(`v7 ${role}: mandatory library selection takes all matches and groups graveyard entry`,async()=>{
  const ctx=context(role),{game,a}=ctx,first=put(game,a,'Forest','library'),second=put(game,a,'Grizzly Bears','library'),third=put(game,a,'Forest','library'),fourth=put(game,a,'Grizzly Bears','library');let batches=0;const emit=game.emit.bind(game);game.emit=async(name,data)=>{if(name==='cardsToGraveyard')batches++;return emit(name,data);};await cast(ctx,'Library All');assert.equal(first.zone,'hand');assert.equal(third.zone,'hand');assert.equal(second.zone,'graveyard');assert.equal(fourth.zone,'graveyard');assert.equal(batches,2); // selected rest batch plus resolving spell
 });
 test(`v7 ${role}: multi-card library entry is simultaneous and excludes expensive candidates`,async()=>{
  const ctx=context(role),{game,a,trace}=ctx;const first=put(game,a,'Grizzly Bears','library'),second=put(game,a,'Grizzly Bears','library'),expensive=put(game,a,'Grizzly Bears','library');expensive.def={...expensive.def,cost:'{8}'};await cast(ctx,'Library Company');const choice=trace.find(row=>row.q.prompt==='Choose a card from the top of your library');assert.equal(choice.q.max,2);assert.equal(choice.q.from.includes(expensive),false);assert.equal(first.zone,'battlefield');assert.equal(second.zone,'battlefield');assert.equal(expensive.zone,'library');
 });
 test(`v7 ${role}: zero-card X look cannot expose or move the whole library`,async()=>{
  const ctx=context(role),{a}=ctx;const before=a.library.map(card=>card.iid);await cast(ctx,'Library X',{xVal:0});assert.deepEqual(a.library.map(card=>card.iid),before);
 });
 test(`v7 ${role}: protection choice controls damage, targeting and blocking`,async()=>{
  const ctx=context(role),{game,a,b,trace}=ctx,card=put(game,a,'Grizzly Bears'),hostile=put(game,b,'Grizzly Bears');await cast(ctx,'Color Protection');const decision=trace.find(row=>row.q.prompt==='Choose protection quality'),color=decision.q.options.find(option=>option.key===decision.result).quality.value;hostile.def={...hostile.def,colorsOverride:[color]};game.recalc();assert.equal(game.isProtectedFrom(card,hostile),true);assert.equal(await game.damageCreature(hostile,card,2),0);assert.equal(game.canBlock(hostile,card),false);assert.equal(game.legalTargets({what:'creature'},hostile,b).includes(card),false);await game.move(card,'exile');await game.move(card,'battlefield',{ctrl:a});assert.equal(game.isProtectedFrom(card,hostile),false);
 });
 test(`v7 ${role}: attached and global protection preserve buffs and cover real qualities`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,card=put(game,a,'Grizzly Bears'),hostile=put(game,b,'Grizzly Bears');const aura=await cast(ctx,'Protection Aura');assert.equal(card.power,4);assert.equal(game.isProtectedFrom(card,hostile),true);const artifact=put(game,b,'Sol Ring');assert.equal(game.isProtectedFrom(card,artifact),false);await game.move(aura,'graveyard');assert.equal(game.isProtectedFrom(card,hostile),false);const team=await cast(ctx,'Protection Team');hostile.def={...hostile.def,colorsOverride:['B']};game.recalc();assert.equal(game.isProtectedFrom(card,hostile),true);await game.move(team,'graveyard');assert.equal(game.isProtectedFrom(card,hostile),false);
 });
 test(`v7 ${role}: second other target cannot repeat the first base-stat target`,async()=>{
  const ctx=context(role),{game,a,b,trace}=ctx;put(game,a,'Grizzly Bears');put(game,b,'Grizzly Bears');await cast(ctx,'Distinct Base');const choices=trace.filter(row=>row.q.type==='chooseTargets');assert.equal(choices.length,2);if(choices[0].result.length)assert.equal(choices[1].q.candidates.includes(choices[0].result[0]),false);
 });
 test(`v7 ${role}: continuous base stats obey timestamp order and source removal`,async()=>{
  const ctx=context(role),{game,a}=ctx,model=put(game,a,'Grizzly Bears');const lord=await cast(ctx,'Base Lord');assert.equal(model.power,1);game.addCounters(model,'+1/+1',2);assert.equal(model.power,3);await cast(ctx,'Base Team');assert.equal(model.power,6);const later=await cast(ctx,'Base Lord');assert.equal(model.power,3);await game.move(later,'graveyard');assert.equal(model.power,6);await game.move(lord,'graveyard');assert.equal(model.power,6);
 });
 test(`v7 ${role}: attached continuous base values follow changing life and preserve counters`,async()=>{
  const ctx=context(role),{game,a}=ctx,model=put(game,a,'Grizzly Bears');const aura=await cast(ctx,'Base Life');assert.equal(aura.attachedTo,model.iid);assert.equal(model.power,40);game.addCounters(model,'+1/+1',2);await game.loseLife(a,5);game.recalc();assert.equal(model.power,37);await game.move(aura,'graveyard');assert.equal(model.power,4);
 });
 test(`v7 ${role}: setting base stats preserves counters, pumps and keywords and excludes later entrants`,async()=>{
  const ctx=context(role),{game,a}=ctx,card=put(game,a,'Grizzly Bears');game.addCounters(card,'+1/+1',2);MTG.E.pumpUntilEOT(game,card,1,2,[]);await cast(ctx,'Base Team');assert.equal(card.power,7);assert.equal(card.toughness,9);const later=put(game,a,'Grizzly Bears');assert.equal(later.power,2);await cast(ctx,'Base Flight');assert.equal(card.kw('flying')||later.kw('flying'),true);
 });
 test(`v7 ${role}: subtype changes retain artifact identity, explicit additions keep original creature types`,async()=>{
  const ctx=context(role),{game,b}=ctx,card=put(game,b,'Grizzly Bears');card.def={...card.def,types:['Artifact','Creature']};game.recalc();await cast(ctx,'Frog');assert.equal(card.is('Artifact'),true);assert.equal(card.hasSub('Frog'),true);assert.equal(card.hasSub('Bear'),false);assert.deepEqual([...card.colors],['U']);await cast(ctx,'Artifact Shape');assert.equal(card.hasSub('Frog'),true);assert.equal(card.hasSub('Dinosaur'),true);assert.equal(card.is('Artifact'),true);
 });
 test(`v7 ${role}: lethal damage exile replaces death and prevents dies triggers`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,model=put(game,b,'Grizzly Bears');let died=0;model.def={...model.def,triggers:[{on:'dies',filter:(g,s,d)=>d.card===s,run:async()=>{died++;}}]};await cast(ctx,'Damaged Exile');assert.equal(model.zone,'exile');assert.equal(died,0);
 });
 test(`v7 ${role}: damage-gated exile differs from unconditional target replacement`,async()=>{
  for(const name of ['Damaged Exile','Target Exile']){const ctx=context(role),{game,b}=ctx,model=put(game,b,'Grizzly Bears');model.counters.shield=1;await cast(ctx,name);assert.equal(model.zone,'battlefield');assert.equal(model.damage,0);await game.move(model,'graveyard');assert.equal(model.zone,name==='Target Exile'?'exile':'graveyard');}
 });
 test(`v7 ${role}: damage replacement is exact-object, survives control changes, expires at cleanup`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,model=put(game,b,'Grizzly Bears');model.def={...model.def,toughness:'6'};game.recalc();await cast(ctx,'Damaged Exile');await game.move(model,'exile');await game.move(model,'battlefield',{ctrl:b});await game.move(model,'graveyard');assert.equal(model.zone,'graveyard');const later=put(game,b,'Grizzly Bears');later.def={...later.def,toughness:'6'};game.recalc();await cast(ctx,'Damaged Exile');later.ctrl=a;await game.move(later,'graveyard');assert.equal(later.zone,'exile');
 });
 test(`v7 ${role}: global exile applies to later arrivals and only opponents at death`,async()=>{
  const ctx=context(role),{game,a,b}=ctx;await cast(ctx,'Group Exile');const own=put(game,a,'Grizzly Bears'),enemy=put(game,b,'Grizzly Bears'),artifact=put(game,b,'Sol Ring');await game.move(own,'graveyard');await game.move(enemy,'graveyard');await game.move(artifact,'graveyard');assert.equal(own.zone,'graveyard');assert.equal(enemy.zone,'exile');assert.equal(artifact.zone,'graveyard');
 });
 test(`v7 ${role}: group damage only marks creatures actually damaged`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,protectedCard=put(game,a,'Grizzly Bears'),hit=put(game,b,'Grizzly Bears');protectedCard.counters.shield=1;await cast(ctx,'Damage Group Exile');assert.equal(hit.zone,'exile');assert.equal(protectedCard.zone,'battlefield');await game.move(protectedCard,'graveyard');assert.equal(protectedCard.zone,'graveyard');
 });
 test(`v7 ${role}: damage-redirection exile follows the creature actually dealt damage`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,original=put(game,b,'Grizzly Bears'),recipient=put(game,b,'Grizzly Bears');game.untilEffects.push({kind:'redirectAllDamage',who:b,iid:recipient.iid,expires:'eot'});await cast(ctx,'Damaged Exile');assert.equal(recipient.zone,'exile');assert.equal(original.zone,'battlefield');await game.move(original,'graveyard');assert.equal(original.zone,'graveyard');
 });
 test(`v7 ${role}: copy entry uses copiable values, copied ETB counters and resets when it leaves`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,model=put(game,b,'Grizzly Bears');model.def={...model.def,kws:['hexproof'],etbCounters:{kind:'+1/+1',n:2},triggers:[{on:'etb',filter:(g,s,d)=>d.card===s,run:async({g,you})=>g.draw(you,1)}]};model.counters['+1/+1']=4;MTG.E.pumpUntilEOT(game,model,5,5,[]);const lib=a.library.length;
  const copy=await cast(ctx,'Clone');assert.equal(copy.name,model.name);assert.equal(copy.power,4);assert.equal(copy.counters['+1/+1'],2);assert.equal(copy.kw('hexproof'),true);assert.equal(a.library.length,lib-1);await game.move(copy,'graveyard');assert.equal(copy.name,'V7 Clone');assert.equal(copy.power,2);assert.equal(copy.isCopyOf,null);
 });
 test(`v7 ${role}: copy exceptions and graveyard choices persist as copiable values`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,model=put(game,b,'Grizzly Bears','graveyard');const copy=await cast(ctx,'Grave Clone');assert.equal(copy.name,'Grizzly Bears');assert.equal(model.zone,'graveyard');await game.move(copy,'graveyard');const creature=put(game,b,'Grizzly Bears');const typed=await cast(ctx,'Typed Clone');assert.equal(typed.hasSub('Faerie'),true);assert.equal(typed.hasSub('Bear'),true);assert.equal(typed.kw('flying'),true);const giant=await cast(ctx,'Giant Clone');assert.equal(giant.power,7);assert.equal(giant.toughness,7);const token=(await game.copyPermanentToken(giant,a))[0];assert.equal(token.power,7);assert.equal(token.toughness,7);
 });
 test(`v7 ${role}: copied activated ability belongs to the copy and can be used`,async()=>{
  const ctx=context(role),{game,a}=ctx;put(game,a,'Grizzly Bears');const copy=await cast(ctx,'Ability Clone');copy.sick=false;const action=game.activatableList(a).find(row=>row.card===copy);assert.ok(action);const n=a.library.length;assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(a.library.length,n-1);assert.equal(copy.tapped,true);
 });
 test(`v7 ${role}: alternate payment options only include costs the affected player can pay`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,life=b.life;await cast(ctx,'Choice Payment');assert.equal(b.life,life-3);const land=put(game,b,'Forest');await cast(ctx,'Choice Payment');assert.equal(b.life,life-6);assert.equal(land.zone,'battlefield');const discard=put(game,b,'Forest','hand');await cast(ctx,'Choice Payment');assert.equal(discard.zone,'graveyard');assert.equal(b.life,life-6);
 });
 test(`v7 ${role}: each opponent independently pays or receives the fallback`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,c=game.addPlayer('C',{name:'C'},b.controller,false),paid=put(game,b,'Forest'),unpaid=put(game,c,'Forest');unpaid.tapped=true;b.pool.C=1;await cast(ctx,'Group Payment');assert.equal(b.pool.C,0);assert.equal(paid.zone,'battlefield');assert.equal(unpaid.zone,'graveyard');assert.equal(a.life,40);
 });
 test(`v7 ${role}: owned commander grants follow ownership through stolen control`,async()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Owned Commander'),owned=put(game,a,'Grizzly Bears'),borrowed=put(game,b,'Grizzly Bears');owned.commander=borrowed.commander=true;owned.ctrl=b;borrowed.ctrl=a;game.recalc();assert.equal(owned.cur.extraAbilities.length,1);assert.equal(borrowed.cur.extraAbilities.length,0);
  assert.equal(owned.sick,true,'new controller cannot immediately pay a creature tap cost');assert.equal(game.activatableList(b).some(row=>row.card===owned),false);
  // The ownership assertion below uses an explicitly ready next-turn fixture.
  owned.sick=false;const n=b.library.length;assert.equal(await game.activateAbility(b,game.activatableList(b).find(row=>row.card===owned)),true);await settle(game);assert.equal(b.library.length,n-1);await game.move(source,'graveyard');assert.equal(owned.cur.extraAbilities.length,0);
 });
 test(`v7 ${role}: static keyword, counters and entry-turn filters track actual characteristics`,()=>{
  const {game,a,b}=context(role),own=put(game,a,'Grizzly Bears'),enemy=put(game,b,'Grizzly Bears');own.def={...own.def,kws:['first strike']};own.meta._enteredTurn=game.turnNo;put(game,a,'V7 First Strikers');put(game,a,'V7 Counter Grant');put(game,a,'V7 Newcomers');assert.equal(own.kw('vigilance'),true);assert.equal(enemy.kw('vigilance'),false);assert.equal(own.kw('hexproof'),false);game.addCounters(own,'charge',1);assert.equal(own.kw('hexproof'),true);assert.equal(own.power,3);game.turnNo++;game.recalc();assert.equal(own.power,2);game.removeCounters(own,'charge',1);assert.equal(own.kw('hexproof'),false);
 });
 test(`v7 ${role}: graveyard keyword filter excludes otherwise eligible nonflying cards`,async()=>{
  const ctx=context(role),{game,a}=ctx,flying=put(game,a,'Shivan Dragon','graveyard'),bear=put(game,a,'Grizzly Bears','graveyard');await cast(ctx,'Flying Return');assert.equal(flying.zone,'hand');assert.equal(bear.zone,'graveyard');
 });
 test(`v7 ${role}: unless-discard offers a real payment, decline applies the fallback`,async()=>{
  for(const pay of [true,false]){const {game,a}=context(role),source=put(game,a,'V7 Discard Upkeep'),card=put(game,a,'Forest','hand'),decide=a.controller.decide.bind(a.controller);if(!pay)a.controller.decide=(g,q)=>q.prompt==='Pay to avoid the Oracle effect?'?'no':decide(g,q);await game.emit('upkeep',{player:a});await settle(game);assert.equal(source.zone,pay?'battlefield':'graveyard');assert.equal(card.zone,pay?'graveyard':'hand');}
 });
 test(`v7 ${role}: unless-return excludes tapped lands and pays with the correct owner`,async()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Return Upkeep'),wrong=put(game,a,'Island');wrong.tapped=true;await game.emit('upkeep',{player:a});await settle(game);assert.equal(source.zone,'graveyard');assert.equal(wrong.zone,'battlefield');const next=put(game,a,'V7 Return Upkeep'),stolen=put(game,b,'Island');stolen.ctrl=a;await game.emit('upkeep',{player:a});await settle(game);assert.equal(next.zone,'battlefield');assert.equal(stolen.zone,'hand');assert.ok(b.hand.includes(stolen));
 });
 test(`v7 ${role}: the target controller pays and another creature excludes the source`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,victim=put(game,b,'Grizzly Bears');b.pool.C=2;await cast(ctx,'Paid Exile');assert.equal(victim.zone,'battlefield');assert.equal(b.pool.C,0);await cast(ctx,'Paid Exile');assert.equal(victim.zone,'exile');const source=await cast(ctx,'Sac Arrival');assert.equal(source.zone,'exile');
 });
 test(`v7 ${role}: switching applies after later modifiers, twice cancels, blink ends the effect`,async()=>{
  const ctx=context(role),{game,a}=ctx,host=put(game,a,'Grizzly Bears');host.def={...host.def,power:'2',toughness:'7'};game.recalc();await cast(ctx,'Switch');assert.equal(host.power,7);assert.equal(host.toughness,2);game.untilEffects.push({apply:(g,bf)=>{if(bf.includes(host))host.cur.power+=3;}});game.recalc();assert.equal(host.power,7);assert.equal(host.toughness,5);await cast(ctx,'Switch');assert.equal(host.power,5);assert.equal(host.toughness,7);await game.move(host,'exile');await game.move(host,'battlefield',{ctrl:a});assert.equal(host.power,5);assert.equal(host.toughness,7);
 });
 test(`v7 ${role}: doubling snapshots each creature's size including negative power`,async()=>{
  const ctx=context(role),{game,a}=ctx,host=put(game,a,'Grizzly Bears');host.def={...host.def,power:'-2',toughness:'7'};game.recalc();await cast(ctx,'Double');assert.equal(host.power,-4);assert.equal(host.toughness,14);game.addCounters(host,'+1/+1',1);assert.equal(host.power,-3);assert.equal(host.toughness,15);await cast(ctx,'Double Team');assert.equal(host.power,-6);assert.equal(host.toughness,15);const later=put(game,a,'Grizzly Bears');assert.equal(later.power,2);
 });
 test(`v7 ${role}: doubling counters adds each actual kind and respects preceding effects`,async()=>{
  const ctx=context(role),{game,a}=ctx,host=put(game,a,'Grizzly Bears');game.addCounters(host,'+1/+1',2);game.addCounters(host,'flying',1);await cast(ctx,'Double Counters');assert.equal(host.counters['+1/+1'],4);assert.equal(host.counters.flying,2);await cast(ctx,'Counter Double');assert.equal(host.counters['+1/+1'],10);assert.equal(host.counters.flying,2);
 });
 test(`v7 ${role}: wheel discards every hand before drawing and counts each player's actual discard`,async()=>{
  const ctx=context(role),{game,a,b}=ctx;put(game,a,'Forest','hand');put(game,a,'Forest','hand');put(game,b,'Forest','hand');let observations=[];const draw=game.draw;game.draw=async function(p,n,src){observations.push({p,n,other:b.hand.length});return draw.call(this,p,n,src);};
  await cast(ctx,'Wheel');assert.equal(observations[0].other,0);assert.equal(a.hand.length,2);assert.equal(b.hand.length,1);assert.equal(a.turnState.discardedN,2);assert.equal(b.turnState.discardedN,1);await cast(ctx,'Fixed Wheel');assert.equal(a.hand.length,3);
 });
 test(`v7 ${role}: opponent damage excludes self damage and zero damage`,async()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Damage Draw'),n=a.library.length;await game.damageAny(source,a,1);await game.damageAny(source,b,0);await settle(game);assert.equal(a.library.length,n);await game.damageAny(source,b,1);await settle(game);assert.equal(a.library.length,n-1);
 });
 test(`v7 ${role}: optional cycling damage resolves above the independent draw`,async()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Cycle Burn','hand'),victim=put(game,b,'Grizzly Bears'),n=a.library.length;a.pool.C=2;assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===source&&row.cycling)),true);await game.flushTriggers();assert.equal(game.stack.length,2);await game.resolveTop();assert.equal(victim.zone,'graveyard');assert.equal(a.library.length,n);await settle(game);assert.equal(a.library.length,n-1);
 });
 test(`v7 ${role}: power-based restriction sees counters and temporary bonuses`,()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Power Restriction'),attacker=put(game,b,'Grizzly Bears');assert.equal(game.canBlock(source,attacker),false);game.addCounters(source,'+1/+1',2);assert.equal(game.canBlock(source,attacker),true);game.removeCounters(source,'+1/+1',2);game.untilEffects.push({apply:(g,bf)=>{if(bf.includes(source))source.cur.power+=2;}});game.recalc();assert.equal(game.canBlock(source,attacker),true);
 });
 test(`v7 ${role}: greatest-power discount is recalculated before payment`,async()=>{
  const {game,a}=context(role),host=put(game,a,'Shivan Dragon'),spell=put(game,a,'V7 Great Discount','hand');a.pool.G=1;a.pool.C=1;assert.equal(game.castableList(a).some(row=>row.card===spell),true);await game.move(host,'hand');assert.equal(await game.castSpell(a,spell,{from:'hand'}),false);assert.equal(a.pool.C,1);await game.move(host,'battlefield',{ctrl:a});assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);assert.equal(a.pool.C,0);await settle(game);
 });
 test(`v7 ${role}: revealed hand choice belongs to the caster and only sees eligible cards`,async()=>{
  const ctx=context(role),{game,a,b,trace}=ctx,land=put(game,b,'Forest','hand'),artifact=put(game,b,'Sol Ring','hand');let seen=[];game.revealToHuman=async data=>seen.push(...data.cards);
  await cast(ctx,'Hand Artifact');assert.equal(artifact.zone,'graveyard');assert.equal(land.zone,'hand');assert.ok(seen.includes(land)&&seen.includes(artifact));const choice=trace.find(row=>row.q.prompt==='Choose the revealed card to discard');assert.equal(choice.q.from.length,1);assert.equal(choice.q.from[0],artifact);
  const bear=put(game,b,'Grizzly Bears','hand');await cast(ctx,'Hand Exile');assert.equal(bear.zone,'exile');assert.equal(b.turnState.discardedN||0,1);
  const n=b.library.length;await cast(ctx,'Hand Shuffle');assert.equal(land.zone,'library');assert.equal(b.library.length,n+1);assert.equal(b.turnState.discardedN||0,1);
 });
 test(`v7 ${role}: explicit source power uses resolution stats and departure LKI, never target power`,async()=>{
  const {game,a}=context(role),source=put(game,a,'V7 Own Power'),target=put(game,a,'Shivan Dragon');
  assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===source)),true);game.addCounters(source,'+1/+1',1);await game.move(source,'hand');await settle(game);assert.equal(target.power,8);assert.equal(target.toughness,8);
  const sacrifice=put(game,a,'V7 Sac Power'),life=a.life;game.addCounters(sacrifice,'+1/+1',2);assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===sacrifice)),true);await settle(game);assert.equal(a.life,life+4);
 });
 test(`v7 ${role}: stat restrictions recheck before costs and death conditions remember last power`,async()=>{
  const {game,a}=context(role),source=put(game,a,'V7 Power Gate');assert.equal(game.activatableList(a).some(row=>row.card===source),false);game.addCounters(source,'+1/+1',2);const action=game.activatableList(a).find(row=>row.card===source);assert.ok(action);game.removeCounters(source,'+1/+1',2);assert.equal(await game.activateAbility(a,action),false);assert.equal(source.tapped,false);
  for(const boost of [0,1]){const dead=put(game,a,'V7 Death Power'),n=a.library.length;game.addCounters(dead,'+1/+1',boost);await game.move(dead,'graveyard');await game.move(dead,'battlefield',{ctrl:a});await settle(game);assert.equal(a.library.length,n-boost);}
 });
 test(`v7 ${role}: upkeep-only graveyard activation rechecks the actual phase before payment`,async()=>{
  const {game,a}=context(role),source=put(game,a,'V7 Upkeep Return','graveyard');a.pool.G=1;assert.equal(game.activatableList(a).some(row=>row.card===source),false);game.phase='upkeep';const action=game.activatableList(a).find(row=>row.card===source);assert.ok(action);game.phase='main1';assert.equal(await game.activateAbility(a,action),false);assert.equal(a.pool.G,1);game.phase='upkeep';assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(source.zone,'hand');
 });
 test(`v7 ${role}: either side of an explicit land alternative permits the mana ability`,async()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Either Mana');put(game,b,'Forest');assert.equal(game.manaSources(a).some(row=>row.card===source),false);const forest=put(game,a,'Forest');assert.equal(game.manaSources(a).some(row=>row.card===source),true);await game.move(forest,'graveyard');put(game,a,'Plains');assert.equal(game.manaSources(a).some(row=>row.card===source),true);
 });
 test(`v7 ${role}: graveyard costs are paid before the return goes on Stack`,async()=>{
  const {game,a}=context(role),source=put(game,a,'V7 Grave Discard','graveyard'),one=put(game,a,'Forest','hand'),two=put(game,a,'Forest','hand');a.pool.C=1;a.pool.G=1;
  assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===source)),true);assert.equal(one.zone,'graveyard');assert.equal(two.zone,'graveyard');assert.equal(source.zone,'graveyard');await settle(game);assert.equal(source.zone,'battlefield');assert.equal(source.tapped,true);
  const exile=put(game,a,'V7 Grave Exile','graveyard');a.pool.C=1;a.pool.G=1;assert.equal(game.activatableList(a).some(row=>row.card===exile),false);const victim=put(game,a,'Grizzly Bears','graveyard');assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===exile)),true);assert.equal(victim.zone,'exile');await settle(game);assert.equal(exile.zone,'battlefield');
  const tapper=put(game,a,'V7 Grave Tap','graveyard');source.tapped=false;source.sick=exile.sick=true;assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===tapper)),true);assert.equal(source.tapped,true);assert.equal(exile.tapped,true);await settle(game);assert.equal(tapper.zone,'hand');
 });
 test(`v7 ${role}: a graveyard activation returns only that graveyard object with its entry counters`,async()=>{
  const {game,a}=context(role),source=put(game,a,'V7 Grave Rise','graveyard');a.pool.C=1;a.pool.G=1;const action=game.activatableList(a).find(row=>row.card===source);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.equal(source.zone,'graveyard');await settle(game);assert.equal(source.zone,'battlefield');assert.equal(source.tapped,true);assert.equal(source.counters['+1/+1'],2);
 });
 test(`v7 ${role}: a graveyard trigger does not follow a card that left and reentered the graveyard`,async()=>{
  const {game,a}=context(role),source=put(game,a,'V7 Grave Landfall','graveyard'),land=put(game,a,'Forest','hand');await game.move(land,'battlefield',{ctrl:a});await game.flushTriggers();assert.equal(game.stack.length,1);await game.move(source,'exile');await game.move(source,'graveyard');await settle(game);assert.equal(source.zone,'graveyard');
  const next=put(game,a,'Forest','hand');await game.move(next,'battlefield',{ctrl:a});await settle(game);assert.equal(source.zone,'battlefield');
 });
 test(`v7 ${role}: a copied self-exiling spell cannot move the original spell`,async()=>{
  const {game,a}=context(role),spell=put(game,a,'V7 Self Exile','hand');a.pool.C=1;a.pool.G=1;assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await game.copySpell(game.stack[0],a);await game.resolveTop();assert.equal(spell.zone,'stack');assert.equal(game.stack.length,1);await settle(game);assert.equal(spell.zone,'exile');assert.equal(a.library.length,13);
 });
 test(`v7 ${role}: combat duration ends after end-of-combat priority`,async()=>{
  const ctx=context(role),{game,a}=ctx,bear=put(game,a,'Grizzly Bears');await cast(ctx,'Combat Pump');assert.equal(bear.power,4);let seen;game.priorityRound=async()=>{seen=bear.power;};await game.endCombatStep(a);assert.equal(seen,4);assert.equal(bear.power,2);assert.equal(bear.toughness,2);
 });
 test(`v7 ${role}: a target range is available with its minimum, even below its maximum`,async()=>{
  const ctx=context(role),{game,a}=ctx,victim=put(game,a,'Grizzly Bears','graveyard'),card=put(game,a,'V7 Range Return','hand');a.pool.C=1;a.pool.G=1;assert.ok(game.castableList(a).some(row=>row.card===card));assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await settle(game);assert.equal(victim.zone,'hand');
 });
 test(`v7 ${role}: granted mana follows the matching permanent and the granting effect's duration`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,old=put(game,a,'Grizzly Bears'),enemy=put(game,b,'Grizzly Bears'),grant=put(game,a,'V7 Global Mana'),newcomer=put(game,a,'Vampire Nighthawk');
  assert.equal(old.cur.extraMana.length,1);assert.equal(newcomer.cur.extraMana.length,1);assert.equal(enemy.cur.extraMana.length,0);assert.equal(await game.payMana(a,MTG.parseCost('{U}')),true);
  await game.move(grant,'exile');assert.equal(newcomer.cur.extraMana.length,0);
  const aura=put(game,a,'V7 Aura Mana');await game.attach(aura,old);old.tapped=false;assert.equal(await game.payMana(a,MTG.parseCost('{2}')),true);assert.equal(old.tapped,true);await game.attach(aura,newcomer);assert.equal(old.cur.extraMana.length,0);assert.equal(newcomer.cur.extraMana.length,1);
  const land=put(game,a,'Forest');await cast(ctx,'Temporary Mana');assert.equal(land.cur.extraMana.length,1);const later=put(game,a,'Forest');assert.equal(later.cur.extraMana.length,0);await game.move(land,'exile');await game.move(land,'battlefield',{ctrl:a});assert.equal(land.cur.extraMana.length,0);
 });
 test(`v7 ${role}: nonlibrary mana followups remain immediate but library movement uses the stack under CR605.1a`,async()=>{
  const {game,a}=context(role),source=put(game,a,'V7 Life Mana'),life=a.life,seen=[];const gain=game.gainLife;game.gainLife=async function(p,n,...args){seen.push(p.pool.C);return gain.call(this,p,n,...args);};
  const action=game.activatableList(a).find(row=>row.card===source);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.equal(a.life,life+1);assert.deepEqual(seen,[1]);assert.equal(game.stack.length,0);
  const egg=put(game,a,'V7 Egg Mana'),library=a.library.length;const eggAction=game.activatableList(a).find(row=>row.card===egg);assert.ok(eggAction);assert.equal(await game.activateAbility(a,eggAction),true);assert.equal(egg.zone,'graveyard');assert.equal(a.library.length,library);assert.equal(a.pool.C,0);assert.equal(a.pool.U,0);assert.equal(game.stack.length,1);await settle(game);assert.equal(a.library.length,library-1);assert.equal(a.pool.U,1);assert.equal(game.stack.length,0);
 });
 test(`v7 ${role}: mana restrictions persist in the pool and distinguish spells from abilities`,async()=>{
  const {game,a}=context(role),source=put(game,a,'V7 Creature Mana'),bear=put(game,a,'Grizzly Bears','hand'),instant=put(game,a,'Giant Growth','hand');
  assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===source)),true);const pool=Object.values(a.pool).reduce((n,x)=>n+x,0);assert.equal(pool,1);
  assert.equal(game.canPayMana(a,MTG.parseCost('{1}'),{card:instant}),false);assert.equal(game.canPayMana(a,MTG.parseCost('{1}'),{card:bear,isAbility:true}),false);assert.equal(await game.payMana(a,MTG.parseCost('{1}'),{card:bear}),true);
  const rock=put(game,a,'V7 Ability Mana');assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===rock)),true);assert.equal(game.canPayMana(a,MTG.parseCost('{2}'),{card:bear}),false);assert.equal(await game.payMana(a,MTG.parseCost('{2}'),{card:rock,isAbility:true}),true);
 });
 test(`v7 ${role}: a replacement token belongs to the exiled creature's owner, including stolen creatures`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,victim=put(game,b,'Grizzly Bears');victim.ctrl=a;game.recalc();await cast(ctx,'Owner Token');assert.equal(victim.zone,'exile');const token=game.bf().find(card=>card.isToken);assert.ok(token);assert.equal(token.owner,b);assert.equal(token.ctrl,b);assert.equal(token.power,3);
 });
 test(`v7 ${role}: arithmetic counts use the resolution state and exclude the resolving token spell`,async()=>{
  const ctx=context(role),{game,a}=ctx;put(game,a,'Grizzly Bears');await cast(ctx,'Additive Tokens');assert.equal(game.creatures(a).filter(card=>card.isToken).length,3);
  const library=a.library.length;await cast(ctx,'Count Draw');assert.equal(a.library.length,library-4);const life=a.life;await cast(ctx,'Library Life');assert.equal(a.life,life+a.library.length);
 });
 test(`v7 ${role}: explicit untapped costs allow summoning sick creatures including their source`,async()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Tap Team'),ally=put(game,a,'Grizzly Bears'),enemy=put(game,b,'Grizzly Bears');source.sick=ally.sick=true;
  const action=game.activatableList(a).find(row=>row.card===source),size=a.library.length;assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.equal(source.tapped,true);assert.equal(ally.tapped,true);assert.equal(enemy.tapped,false);assert.equal(a.library.length,size);await settle(game);assert.equal(a.library.length,size-1);assert.equal(game.activatableList(a).some(row=>row.card===source),false);
 });
 test(`v7 ${role}: one permanent cannot pay both tap symbol and an additional tap cost`,async()=>{
  const {game,a}=context(role),source=put(game,a,'V7 Tap Ally');source.def={...source.def,subtypes:['Ally']};source.sick=false;game.recalc();assert.equal(game.activatableList(a).some(row=>row.card===source),false);
  const ally=put(game,a,'Grizzly Bears');ally.def={...ally.def,subtypes:['Ally']};ally.sick=true;game.recalc();const action=game.activatableList(a).find(row=>row.card===source);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.equal(source.tapped,true);assert.equal(ally.tapped,true);await settle(game);
 });
 test(`v7 ${role}: a dynamic target restriction is rechecked when the spell resolves`,async()=>{
  const ctx=context(role),{game,a}=ctx,one=put(game,a,'Swamp'),two=put(game,a,'Swamp'),target=put(game,a,'Grizzly Bears','graveyard'),spell=put(game,a,'V7 Count Reanimate','hand');a.pool.C=1;a.pool.G=1;
  assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);assert.equal(game.stack.at(-1).targets[0],target);await game.move(two,'hand');await settle(game);assert.equal(target.zone,'graveyard');assert.equal(spell.zone,'graveyard');assert.equal(one.zone,'battlefield');
 });
 test(`v7 ${role}: Lander and Mutagen use real paid sacrifice abilities`,async()=>{
  for(const name of ['Lander','Mutagen']){const ctx=context(role),{game,a}=ctx,host=put(game,a,'Grizzly Bears');await cast(ctx,name);const token=game.bf().find(card=>card.isToken&&card.name===name+' Token');assert.ok(token);assert.equal(token.is('Creature'),false);
   game.phase='combat';game.step='begin';assert.equal(game.activatableList(a).some(row=>row.card===token),name==='Lander');game.phase='main1';game.step='main';
   const row=game.activatableList(a).find(row=>row.card===token),prior=game.bf().filter(card=>card.is('Land')).length;assert.ok(row);assert.equal(await game.activateAbility(a,row),true);assert.equal(token.zone,'ceased');assert.equal(game.stack.length,1);await settle(game);
   if(name==='Mutagen')assert.equal(host.plus1(),1);else{const lands=game.bf().filter(card=>card.is('Land'));assert.equal(lands.length,prior+1);assert.equal(lands.at(-1).tapped,true);}
  }
 });
 test(`v7 ${role}: the chosen opponent creates and owns their token`,async()=>{
  const ctx=context(role),{game,b}=ctx;await cast(ctx,'Enemy Token');const token=game.bf().find(card=>card.isToken);assert.equal(token.owner,b);assert.equal(token.ctrl,b);assert.equal(token.power,3);assert.equal(token.toughness,3);
 });
 test(`v7 ${role}: gained-or-lost life and exact creature conditions recheck at resolution`,async()=>{
  for(const [name,field]of [['Life Change','lifeLost'],['Life Change','lifeGained'],['Exact Creature',null]]){const ctx=context(role),{game,a}=ctx;await cast(ctx,name);const library=a.library.length;if(field)a.turnState[field]=1;
   await game.emit('endStep',{player:a});await game.flushTriggers();assert.equal(game.stack.length,1);if(field)a.turnState[field]=0;else put(game,a,'Grizzly Bears');await settle(game);assert.equal(a.library.length,library);
  }
 });
 test(`v7 ${role}: prevent combat damage both ways without preventing noncombat damage`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,host=put(game,a,'Shivan Dragon'),enemy=put(game,b,'Shivan Dragon');await cast(ctx,'Combat Shield');const life=b.life;
  assert.equal(await game.damageAny(enemy,host,2,{combat:true}),0);assert.equal(await game.damageAny(host,b,2,{combat:true}),0);assert.equal(b.life,life);
  assert.equal(await game.damageAny(enemy,host,2),2);assert.equal(host.damage,2);
  await game.move(host,'hand');await game.putPermanentOntoBattlefield(host,a);assert.equal(await game.damageAny(enemy,host,1,{combat:true}),1);
 });
 test(`v7 ${role}: a group prevention includes later arrivals and respects unpreventable damage`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,enemy=put(game,b,'Shivan Dragon');await cast(ctx,'Creature Shield');const late=put(game,a,'Shivan Dragon');
  assert.equal(await game.damageAny(enemy,late,2),0);assert.equal(await game.damageAny(enemy,a,2),2);
  const suppressor=put(game,b,'Forest');suppressor.def={...suppressor.def,damageCantBePrevented:true};game.recalc();assert.equal(await game.damageAny(enemy,late,2),2);
  await game.move(suppressor,'hand');assert.equal(await game.damageAny(enemy,late,2),0);
 });
 test(`v7 ${role}: static prevention disappears with the source and creature fog excludes spells`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,host=await cast(ctx,'Static Shield'),enemy=put(game,b,'Shivan Dragon');
  assert.equal(await game.damageAny(enemy,host,1,{combat:true}),0);assert.equal(await game.damageAny(host,b,1,{combat:true}),0);assert.equal(await game.damageAny(enemy,host,1),1);
  await game.move(host,'hand');await cast(ctx,'Creature Fog');assert.equal(await game.damageAny(enemy,a,3),0);
  const spell=put(game,b,'Opt','graveyard');assert.equal(await game.damageAny(spell,a,3),3);
 });
 test(`v7 ${role}: a controller continuation uses the destroyed object's last controller`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,host=put(game,b,'Shivan Dragon'),library=b.library.length;host.owner=a;await cast(ctx,'Controller Draw');assert.equal(host.zone,'graveyard');assert.equal(b.library.length,library-2);
 });
 test(`v7 ${role}: a player continuation keeps the same chosen player`,async()=>{
  const ctx=context(role),{b}=ctx,library=b.library.length,life=b.life;await cast(ctx,'Same Player');assert.equal(b.library.length,library-1);assert.equal(b.life,life-3);
 });
 test(`v7 ${role}: a group blink exiles both objects before either entry`,async()=>{
  const ctx=context(role),{game,a}=ctx,first=put(game,a,'Grizzly Bears'),second=put(game,a,'Grizzly Bears'),seen=[];
  first.damage=second.damage=1;
  const original=game.handleETB.bind(game);game.handleETB=async(card,opts)=>{seen.push({card,first:first.zone,second:second.zone});return original(card,opts);};
  await cast(ctx,'Group Blink');
  assert.equal(seen.length,2);assert.equal(seen[0].card===first?seen[0].second:seen[0].first,'exile');assert.equal(first.zone,'battlefield');assert.equal(second.zone,'battlefield');assert.equal(first.damage,0);assert.equal(second.damage,0);
 });
 test(`v7 ${role}: a delayed blink adds entry counters and does not follow a changed exile object`,async()=>{
  for(const change of [false,true]){const ctx=context(role),{game,a}=ctx,host=put(game,a,'Grizzly Bears');host.damage=1;await cast(ctx,'Delayed Blink');assert.equal(host.zone,'exile');
   if(change){await game.move(host,'hand');await game.move(host,'exile');}
   await game.emit('endStep',{player:a});await settle(game);assert.equal(host.zone,change?'exile':'battlefield');assert.equal(host.counters.flying||0,change?0:1);
  }
 });
 test(`v7 ${role}: X and graveyard counter payments use the amount on resolution`,async()=>{
  for(const name of ['X Counter','Dynamic Counter'])for(const pay of [false,true]){const ctx=context(role),{game,a,b}=ctx,spell=put(game,b,'Grizzly Bears','hand');b.pool.G=1;b.pool.C=1;game.turnPlayer=b;assert.equal(await game.castSpell(b,spell,{from:'hand'}),true);
   for(let i=0;i<3;i++)put(game,a,'Forest','graveyard');b.pool.C=pay?3:0;
   await cast(ctx,name,{xVal:3});assert.equal(spell.zone,pay?'battlefield':'graveyard',name+'/'+pay);assert.equal(b.pool.C,0);
  }
 });
 test(`v7 ${role}: conditional counter exile applies only if payment is not made`,async()=>{
  for(const pay of [false,true]){const ctx=context(role),{game,b}=ctx,spell=put(game,b,'Grizzly Bears','hand');b.pool.G=1;b.pool.C=1;game.turnPlayer=b;assert.equal(await game.castSpell(b,spell,{from:'hand'}),true);b.pool.C=pay?3:0;
   await cast(ctx,'Conditional Exile Counter');assert.equal(spell.zone,pay?'battlefield':'exile');assert.equal(b.pool.C,0);
  }
 });
 test(`v7 ${role}: an unblocked trigger waits for blockers and accepts creatures put into combat`,async()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Unblocked Draw'),library=a.library.length;
  source.attacking=b;source.wasBlocked=false;source.blockedBy=[];game.combat={attackers:[source]};
  await game.emit('attacks',{card:source,player:a,defender:b});await settle(game);assert.equal(a.library.length,library);
  await game.emit('blockersDeclared',{player:a,attackers:[source]});await game.flushTriggers();assert.equal(game.stack.length,1);await settle(game);assert.equal(a.library.length,library-1);
  source.wasBlocked=true;await game.emit('blockersDeclared',{player:a,attackers:[source]});await settle(game);assert.equal(a.library.length,library-1);
 });
 test(`v7 ${role}: each opposing blocker supplies its own damage object and controller`,async()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Combat Burn'),first=put(game,b,'Shivan Dragon'),second=put(game,b,'Shivan Dragon'),life=b.life;
  source.attacking=b;source.blockedBy=[first,second];source.wasBlocked=true;first.blocking=second.blocking=source.iid;
  for(const blocker of [first,second])await game.emit('becomesBlockedByCreature',{attacker:source,blocker,blockers:source.blockedBy});await game.flushTriggers();assert.equal(game.stack.length,2);await settle(game);assert.equal(first.damage,3);assert.equal(second.damage,3);assert.equal(source.damage,0);assert.equal(b.life,life-6);
 });
 test(`v7 ${role}: a flying-block filter checks the opposing creature at trigger time`,async()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Flying Block'),ground=put(game,b,'Grizzly Bears'),flyer=put(game,b,'Shivan Dragon');
  await game.emit('blocks',{blocker:source,attacker:ground});await settle(game);assert.equal(source.power,2);
  await game.emit('blocks',{blocker:source,attacker:flyer});await game.flushTriggers();await game.move(flyer,'hand');await settle(game);assert.equal(source.power,4);
 });
 test(`v7 ${role}: a legal qualifying target enables the reduced cast and exact payment`,async()=>{
  const {game,a,b}=context(role),victim=put(game,b,'Grizzly Bears'),spell=put(game,a,'V7 Target Discount','hand');victim.tapped=true;a.pool.C=2;a.pool.G=1;
  assert.ok(game.castableList(a).some(row=>row.card===spell));assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);assert.equal(a.pool.C,0);assert.equal(a.pool.G,0);await settle(game);assert.equal(victim.zone,'graveyard');
 });
 test(`v7 ${role}: target discounts never apply with only nonqualifying targets`,async()=>{
  const {game,a,b}=context(role),victim=put(game,b,'Grizzly Bears'),spell=put(game,a,'V7 Target Discount','hand');a.pool.C=2;a.pool.G=1;
  assert.equal(game.castableList(a).some(row=>row.card===spell),false);assert.equal(await game.castSpell(a,spell,{from:'hand'}),false);assert.equal(a.pool.C,2);assert.equal(a.pool.G,1);assert.equal(victim.zone,'battlefield');assert.equal(spell.zone,'hand');
 });
 test(`v7 ${role}: land-quality replacement checks the entering land, including its old object`,async()=>{
  for(const forest of [false,true]){const {game,a}=context(role),source=put(game,a,'V7 Land Branch'),land=put(game,a,forest?'Forest':'Mountain','hand'),life=a.life;assert.equal(await game.playLand(a,land),true);await game.flushTriggers();await game.move(land,'hand');await settle(game);assert.equal(a.life,life+(forest?3:1));assert.equal(source.zone,'battlefield');}
 });
 test(`v7 ${role}: an instead branch performs exactly one life-gain instruction`,async()=>{
  for(const died of [false,true]){const ctx=context(role),{game,a}=ctx,life=a.life;if(died)await game.move(put(game,a,'Grizzly Bears'),'graveyard');await cast(ctx,'Morbid Life');assert.equal(a.life,life+(died?8:4));}
 });
 test(`v7 ${role}: conditional burn reads the recipient's current color, not the spell color`,async()=>{
  for(const green of [false,true]){const ctx=context(role),{game,b}=ctx,target=put(game,b,green?'Grizzly Bears':'Shivan Dragon');target.def={...target.def,toughness:'20'};game.recalc();await cast(ctx,'Conditional Burn');assert.equal(target.damage,green?6:2);}
 });
 test(`v7 ${role}: conditional shrink replaces both power and toughness deltas`,async()=>{
  for(const white of [false,true]){const ctx=context(role),{game,b}=ctx,target=put(game,b,'Shivan Dragon');target.def={...target.def,colorsOverride:white?['W']:['R'],toughness:'20'};game.recalc();await cast(ctx,'Conditional Shrink');assert.equal(target.power,1);assert.equal(target.toughness,white?16:19);}
 });
 test(`v7 ${role}: another bite target must be different from the selected damage source`,async()=>{
  const {game,a,b,trace}=context(role),source=put(game,a,'Grizzly Bears'),victim=put(game,b,'Shivan Dragon'),spell=put(game,a,'V7 Different Bite','hand');a.pool.C=1;a.pool.G=1;
  assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);const queries=trace.filter(row=>row.q.type==='chooseTargets');assert.equal(queries.length,2);assert.equal(queries[1].q.candidates.includes(source),false);await settle(game);assert.equal(victim.damage,2);assert.equal(source.damage,0);
 });
 test(`v7 ${role}: event-quality continuation retains last known information after a blink`,async()=>{
  const {game,a}=context(role),watcher=put(game,a,'V7 Spider Knowledge'),spider=put(game,a,'Giant Spider','hand'),library=a.library.length;
  await game.move(spider,'battlefield',{ctrl:a});await game.flushTriggers();await game.move(spider,'exile');spider.def={...spider.def,subtypes:['Bear']};await game.move(spider,'battlefield',{ctrl:a});await settle(game);assert.equal(a.library.length,library-1);assert.equal(watcher.zone,'battlefield');
 });
 test(`v7 ${role}: bite uses the selected creature, its updated power, deathtouch and lifelink`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,source=put(game,a,'Vampire Nighthawk'),victim=put(game,b,'Shivan Dragon'),life=a.life;
  await cast(ctx,'Bite After Pump');assert.equal(source.power,4);assert.equal(source.damage,0);assert.equal(victim.zone,'graveyard');assert.equal(a.life,life+4);
 });
 test(`v7 ${role}: a missing bite source cannot deal damage through its old target identity`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,source=put(game,a,'Grizzly Bears'),victim=put(game,b,'Shivan Dragon'),spell=put(game,a,'V7 Bite','hand');a.pool.C=1;a.pool.G=1;
  assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await game.move(source,'exile');await game.move(source,'battlefield',{ctrl:a});await settle(game);assert.equal(victim.damage,0);assert.equal(source.damage,0);assert.equal(spell.zone,'graveyard');
 });
 test(`v7 ${role}: the quality in an arrival continuation belongs to the arriving object`,async()=>{
  const {game,a}=context(role),watcher=put(game,a,'V7 Spider Watcher'),spider=put(game,a,'Giant Spider','hand'),bear=put(game,a,'Grizzly Bears','hand'),life=a.life;
  await game.move(spider,'battlefield',{ctrl:a});await settle(game);assert.equal(spider.counters['+1/+1'],1);assert.equal(watcher.counters['+1/+1']||0,0);
  await game.move(bear,'battlefield',{ctrl:a});await settle(game);assert.equal(bear.counters['+1/+1']||0,0);assert.equal(a.life,life+2);
 });
 test(`v7 ${role}: a continuous land quality condition is checked per affected permanent`,()=>{
  const {game,a,b}=context(role),effect=put(game,a,'V7 Living Lands'),land=put(game,a,'Forest'),bear=put(game,b,'Grizzly Bears'),animated=put(game,b,'Grizzly Bears');
  animated.def={...animated.def,types:['Land','Creature']};game.recalc();assert.equal(animated.power,4);assert.equal(bear.power,2);assert.equal(land.is('Creature'),false);assert.equal(effect.is('Creature'),false);
 });
 test(`v7 ${role}: cast-only ETB excludes spell copies and blinked permanents`,async()=>{
  const {game,a}=context(role),card=put(game,a,'V7 Cast Entry','hand');a.pool.C=1;a.pool.G=1;
  assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await game.copySpell(game.stack[0],a);await game.resolveTop();await settle(game);assert.equal(a.life,47);
  await game.move(card,'exile');await game.move(card,'battlefield',{ctrl:a});await settle(game);assert.equal(a.life,47);
 });
 test(`v7 ${role}: commander and monarch conditions track the actual current state`,async()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Commander Condition');assert.equal(source.power,2);const commander=put(game,a,'Grizzly Bears');commander.commander=true;game.recalc();assert.equal(source.power,4);
  commander.ctrl=b;game.recalc();assert.equal(source.power,2);put(game,a,'V7 Monarch Condition');await game.becomeMonarch(a);await game.emit('upkeep',{player:a});await settle(game);assert.equal(a.life,43);
  await game.becomeMonarch(b);await game.emit('upkeep',{player:a});await settle(game);assert.equal(a.life,43);
 });
 test(`v7 ${role}: target-quality condition applies only to the selected qualifying permanent`,async()=>{
  for(const name of ['Grizzly Bears','Ornithopter']){const {game,a}=context(role),target=put(game,a,name);await cast({game,a},'Artifact Bonus');assert.equal(target.kw('indestructible'),name==='Ornithopter');}
 });
 test(`v7 ${role}: separate search alternatives retain their own basic and mana-value restrictions`,async()=>{
  const {game,a,trace}=context(role),plain=put(game,a,'Plains','library'),small=put(game,a,'Llanowar Elves','library'),large=put(game,a,'Grizzly Bears','library'),nonbasic=put(game,a,'Hallowed Fountain','library');
  await cast({game,a},'Scoped Search');const query=trace.find(row=>row.q.search);assert.ok(query);assert.ok(query.q.from.includes(plain));assert.ok(query.q.from.includes(small));assert.equal(query.q.from.includes(large),false);assert.equal(query.q.from.includes(nonbasic),false);
 });
 test(`v7 ${role}: squad exposes all affordable payments and copied spells keep the paid count`,async()=>{
  const {game,a,trace}=context(role),source=put(game,a,'V7 Squad','hand');a.pool.C=21;a.pool.G=1;
  if(role==='human'){const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseX'?10:decide(g,q);}
  assert.equal(await game.castSpell(a,source,{from:'hand'}),true);const paid=source.castMeta.paidTimes;assert.ok(paid>4);if(role==='ai')assert.equal(trace.find(row=>row.q.type==='chooseX').q.max,10);
  await game.copySpell(game.stack[0],a);await settle(game);const tokens=game.creatures(a).filter(card=>card.isToken&&card.name===source.name);assert.equal(tokens.length,paid*2+1);assert.equal(game.pendingTriggers.length,0);
 });
 test(`v7 ${role}: dethrone checks the attacked player once and keeps source identity`,async()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Dethroner');source.attacking=b;
  b.life=39;await game.emit('attacks',{card:source,player:a,defender:b});await settle(game);assert.equal(source.counters['+1/+1']||0,0);
  b.life=40;await game.emit('attacks',{card:source,player:a,defender:b});await game.flushTriggers();b.life=20;await settle(game);assert.equal(source.counters['+1/+1'],1);
  b.life=50;await game.emit('attacks',{card:source,player:a,defender:b});await game.flushTriggers();await game.move(source,'exile');await game.move(source,'battlefield',{ctrl:a});await settle(game);assert.equal(source.counters['+1/+1']||0,0);
 });
 test(`v7 ${role}: rampage evaluates blockers on resolution and fixes the resulting bonus`,async()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Rampager'),blockers=Array.from({length:3},()=>put(game,b,'Grizzly Bears'));
  source.attacking=b;source.blockedBy=blockers;for(const card of blockers)card.blocking=source.iid;
  await game.emit('becomesBlocked',{attacker:source,blockers});await game.flushTriggers();await game.move(blockers[0],'exile');await settle(game);assert.equal(source.power,4);
  await game.move(blockers[1],'exile');game.recalc();assert.equal(source.power,4);await game.move(source,'exile');await game.move(source,'battlefield',{ctrl:a});assert.equal(source.power,2);
 });
 test(`v7 ${role}: mobilize resolves without its source and sacrifices only the original controlled tokens`,async()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Mobilizer');source.attacking=b;game.combat={attackers:[source]};
  await game.emit('attacks',{card:source,player:a,defender:b});await game.flushTriggers();await game.move(source,'exile');await settle(game);
  const tokens=game.creatures(a).filter(card=>card.name==='Warrior Token');assert.equal(tokens.length,2);assert.ok(tokens.every(card=>card.tapped&&card.attacking===b));
  tokens[0].ctrl=b;await game.emit('endStep',{player:a});await settle(game);assert.equal(tokens[0].zone,'battlefield');assert.notEqual(tokens[1].zone,'battlefield');
 });
 test(`v7 ${role}: blitz grants haste before ETB, death draw uses Stack, and blink resets the payment`,async()=>{
  const {game,a}=context(role),source=put(game,a,'V7 Blitzer','hand');a.pool.G=1;
  const row=game.castableList(a).find(row=>row.card===source&&row.alt?.blitz);assert.ok(row);assert.equal(await game.castSpell(a,source,{from:'hand',alt:row.alt}),true);await settle(game);assert.equal(source.kw('haste'),true);assert.equal(a.pool.G,0);
  const hand=a.hand.length;await game.emit('endStep',{player:a});await game.flushTriggers();assert.ok(game.stack.some(row=>row.name.includes('Blitz sacrifice')));await game.resolveTop();assert.equal(source.zone,'graveyard');assert.equal(a.hand.length,hand);assert.ok(game.stack.some(row=>row.name.includes('Blitz draw')));await settle(game);assert.equal(a.hand.length,hand+1);
  await game.move(source,'battlefield',{ctrl:a});assert.equal(source.kw('haste'),false);await game.sacrifice(a,source);await settle(game);assert.equal(a.hand.length,hand+1);
 });
 test(`v7 ${role}: warp returns casting permission to the owner next turn and rejects reused exile identity`,async()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Warper','hand');a.pool.G=1;
  const row=game.castableList(a).find(row=>row.card===source&&row.alt?.warp);assert.ok(row);assert.equal(await game.castSpell(a,source,{from:'hand',alt:row.alt}),true);await settle(game);source.ctrl=b;
  await game.emit('endStep',{player:a});await settle(game);assert.equal(source.zone,'exile');a.pool.C=1;a.pool.G=1;assert.equal(game.castableList(a).some(row=>row.card===source),false);
  game.turnNo++;assert.ok(game.castableList(a).some(row=>row.card===source));assert.equal(game.castableList(b).some(row=>row.card===source),false);
  await game.move(source,'hand');await game.move(source,'exile');assert.equal(game.castableList(a).some(row=>row.card===source),false);
 });
 test(`v7 ${role}: combined ETB and cast triggers enforce mana value and caster`,async()=>{
  const ctx=context(role),{game,a,b}=ctx;await cast(ctx,'Entry Cast Watcher');assert.equal(a.life,43);
  for(const [name,player,expected] of [['Grizzly Bears',a,43],['Air Elemental',b,43],['Air Elemental',a,46]]){
   const card=put(game,player,name,'hand');player.pool.C=20;player.pool.G=5;player.pool.U=5;game.turnPlayer=player;
   assert.equal(await game.castSpell(player,card,{from:'hand'}),true);await settle(game);assert.equal(a.life,expected);
  }
 });
 test(`v7 ${role}: combined land and colored-cast triggers independently resolve`,async()=>{
  const {game,a,b}=context(role);put(game,a,'V7 Land Cast Watcher');const island=put(game,a,'Island','hand');assert.equal(await game.playLand(a,island),true);await settle(game);assert.equal(a.life,43);
  const card=put(game,a,'Air Elemental','hand');a.pool.C=3;a.pool.U=2;assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await settle(game);assert.equal(a.life,46);
  const visitor=put(game,b,'Island','hand');await game.move(visitor,'battlefield',{ctrl:b});await settle(game);assert.equal(a.life,46);
 });
 test(`v7 ${role}: cast-origin filter ignores hand and observes paid permitted exile casts`,async()=>{
  const {game,a}=context(role);put(game,a,'V7 Exile Cast Watcher');
  for(const from of ['hand','exile']){const card=put(game,a,'Grizzly Bears',from);a.pool.C=1;a.pool.G=1;if(from==='exile'){card.meta.playableBy=a;card.meta.playableUntil=game.turnNo;}
   const row=game.castableList(a).find(row=>row.card===card);assert.ok(row);assert.equal(await game.castSpell(a,card,{from,alt:row.alt}),true);await settle(game);assert.equal(a.life,from==='hand'?40:43);assert.equal(a.pool.G,0);}
 });
 test(`v7 ${role}: artifact animation binds the selected artifact rather than the source`,async()=>{
  const {game,a}=context(role),artifact=put(game,a,'Sol Ring');const source=await cast({game,a},'Artifact Animator');assert.equal(source.is('Artifact'),false);assert.equal(source.kw('flying'),false);assert.equal(artifact.is('Creature'),true);assert.equal(artifact.kw('flying'),true);assert.equal(artifact.counters['+1/+1'],3);assert.equal(artifact.power,3);
 });
 test(`v7 ${role}: goad lasts through the other turn and expires before its caster's next turn`,async()=>{
  const {game,a,b}=context(role),card=put(game,b,'Grizzly Bears');await cast({game,a},'Goad');assert.ok(game.goadersOf(card).includes(a));assert.equal(game.isForcedToAttack(card),true);
  game.mainPhase=async()=>{};game.combatPhase=async()=>{};game.turnPlayer=b;await game.runTurn();assert.ok(game.goadersOf(card).includes(a));
  game.turnPlayer=a;await game.runTurn();assert.equal(game.goadersOf(card).length,0);
 });
 test(`v7 ${role}: goad and suspected status do not follow a blinked object`,async()=>{
  for(const name of ['Goad','Suspect']){const {game,a,b}=context(role),card=put(game,b,'Grizzly Bears');await cast({game,a},name);await game.move(card,'exile');await game.move(card,'battlefield',{ctrl:b});assert.equal(game.goadersOf(card).length,0);assert.equal(!!card.meta.suspected,false);assert.equal(card.kw('menace'),false);}
 });
 test(`v7 ${role}: one-or-more graveyard triggers count batches and require matching cards`,async()=>{
  const {game,a}=context(role);put(game,a,'V7 Grave Watcher');const cards=[put(game,a,'Grizzly Bears','graveyard'),put(game,a,'Grizzly Bears','graveyard')];
  await game.moveGraveyardBatch(cards,'exile');assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(a.life,43);
  const land=put(game,a,'Forest','graveyard');await game.move(land,'hand');assert.equal(game.pendingTriggers.length,0);
  for(const card of cards){await game.move(card,'graveyard');await game.move(card,'hand');}assert.equal(game.pendingTriggers.length,2);await settle(game);assert.equal(a.life,49);
 });
 test(`v7 ${role}: library-to-graveyard batch distinguishes milling from discarding`,async()=>{
  const {game,a}=context(role);put(game,a,'V7 Mill Watcher');put(game,a,'Grizzly Bears','library');put(game,a,'Grizzly Bears','library');
  await game.mill(a,2);assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(a.life,43);
  const card=put(game,a,'Grizzly Bears','hand');await game.discard(a,[card]);await settle(game);assert.equal(a.life,43);
 });
 test(`v7 ${role}: a shared combat hit creates one trigger per player and damage step`,async()=>{
  const {game,a,b}=context(role);put(game,a,'V7 Combat Watcher');const attackers=[put(game,a,'Grizzly Bears'),put(game,a,'Grizzly Bears')];
  for(const card of attackers){card.attacking=b;card.blockedBy=[];card.wasBlocked=false;}game.combat={attackers};
  await game.combatDamage(a,'normal');assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(a.life,43);assert.equal(b.life,36);
 });
 test(`v7 ${role}: blocker quality rules preserve other legal blockers`,async()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Sky Restriction'),flyer=put(game,b,'Air Elemental'),bear=put(game,b,'Grizzly Bears');
  assert.equal(game.canBlock(flyer,source),false);assert.equal(game.canBlock(bear,source),true);
  const walls=put(game,a,'V7 Wall Restriction'),wall=put(game,b,'Wall of Wood');assert.equal(game.canBlock(bear,walls),false);assert.equal(game.canBlock(wall,walls),true);
 });
 test(`v7 ${role}: conditional evasion changes after two actual spells and resets next turn`,async()=>{
  const {game,a,b}=context(role),source=put(game,a,'V7 Two Casts'),blocker=put(game,b,'Grizzly Bears');assert.equal(game.canBlock(blocker,source),true);
  for(let i=0;i<2;i++){const ring=put(game,a,'Sol Ring','hand');a.pool.C=1;assert.equal(await game.castSpell(a,ring,{from:'hand'}),true);await settle(game);assert.equal(game.canBlock(blocker,source),i===0);}
  game.mainPhase=async()=>{};game.combatPhase=async()=>{};await game.runTurn();assert.equal(game.canBlock(blocker,source),true);
 });
 test(`v7 ${role}: reflexive payment precedes target choices and creates a separately counterable trigger`,async()=>{
  const {game,a,b,trace}=context(role),enemy=put(game,b,'Grizzly Bears'),card=put(game,a,'V7 Reflexive Bolt','hand');a.pool.C=1;a.pool.G=1;a.pool.R=1;
  assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await game.resolveTop();assert.equal(game.stack.length,1);assert.equal(game.stack[0].targets.length,0);assert.equal(a.pool.R,1);
  const beforeChoices=trace.filter(row=>row.q.type==='chooseTargets').length;await game.resolveTop();
  assert.equal(a.pool.R,0);assert.equal(game.stack.length,1);assert.ok(game.stack[0].oracleReflexive);assert.equal(game.stack[0].targets[0],enemy);assert.ok(trace.filter(row=>row.q.type==='chooseTargets').length>beforeChoices);
  await game.counterStackObject(game.stack[0]);await settle(game);assert.equal(enemy.zone,'battlefield');assert.equal(enemy.damage,0);assert.equal(a.pool.R,0);
 });
 test(`v7 ${role}: reflexive graveyard cost excludes its exiled cards from later targets`,async()=>{
  const {game,a}=context(role);put(game,a,'Forest','graveyard');put(game,a,'Forest','graveyard');const bear=put(game,a,'Grizzly Bears','graveyard');
  await cast({game,a},'Reflexive Reanimate');assert.equal(a.exile.length,2);assert.equal(bear.zone,'battlefield');
 });
 test(`v7 ${role}: declining reflexive cost creates no follow-up trigger`,async()=>{
  const {game,a,b}=context(role);put(game,b,'Grizzly Bears');a.pool.R=1;
  const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.prompt==='Pay the reflexive ability cost?'?'no':decide(g,q);
  await cast({game,a},'Reflexive Bolt');assert.equal(a.pool.R,1);assert.equal(game.stack.length,0);assert.equal(game.pendingTriggers.length,0);
 });
 test(`v7 ${role}: Saga enters with lore, chapters use Stack and final sacrifice waits for resolution`,async()=>{
  const {game,a}=context(role),card=put(game,a,'V7 Saga','hand');a.pool.C=1;a.pool.G=1;
  assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await game.resolveTop();
  assert.equal(card.counters.lore,1);assert.equal(game.stack.length,1);assert.equal(a.life,40);
  await settle(game);assert.equal(a.life,42);
  await game.emit('upkeep',{player:a});await game.emit('drawStep',{player:a});await settle(game);assert.equal(card.counters.lore,1);
  game.addCounters(card,'lore',2);assert.equal(game.pendingTriggers.length,2);await game.checkSBA();assert.equal(card.zone,'battlefield');
  await game.flushTriggers();await game.checkSBA();assert.equal(card.zone,'battlefield');
  const final=game.stack.find(row=>row.sagaChapter&&row.name.endsWith('Poglavlje 3'));assert.ok(final);
  const original=final.run;final.run=async ctx=>{await ctx.g.checkSBA();assert.equal(card.zone,'battlefield');await original(ctx);};
  await settle(game);assert.equal(card.zone,'graveyard');assert.equal(a.life,44);assert.equal(a.hand.length,1);
 });
 test(`v7 ${role}: countered Saga chapter and unrelated pending trigger do not postpone final sacrifice`,async()=>{
  const {game,a}=context(role),card=put(game,a,'V7 Saga');card.counters.lore=2;
  game.addCounters(card,'lore',1);await game.flushTriggers();await game.counterStackObject(game.stack.at(-1));
  game.queueTrigger({ctrl:a,name:'Unrelated',run:async()=>{}});await game.checkSBA();assert.equal(card.zone,'graveyard');
 });
 test(`v7 ${role}: Saga removed counters retrigger crossed chapter, but old chapter cannot keep a new object alive`,async()=>{
  const {game,a}=context(role),card=put(game,a,'V7 Saga');card.counters.lore=1;
  game.removeCounters(card,'lore',1);game.addCounters(card,'lore',1);await settle(game);assert.equal(a.life,42);
  game.addCounters(card,'lore',2);await game.flushTriggers();await game.move(card,'hand');await game.move(card,'battlefield',{ctrl:a});
  assert.equal(card.counters.lore,1);await settle(game);assert.equal(card.zone,'battlefield');assert.equal(card.counters.lore,1);
 });
 test(`v7 ${role}: all controlled Sagas advance at precombat main as a turn action`,async()=>{
  const {game,a,b}=context(role),card=put(game,a,'V7 Saga'),other=put(game,b,'V7 Saga');card.counters.lore=1;other.counters.lore=1;
  const stop=new Error('precombat checkpoint'),emit=game.emit;game.emit=async function(event,data){if(event==='precombatMain'){assert.equal(card.counters.lore,2);assert.equal(other.counters.lore,1);assert.equal(this.pendingTriggers.length,1);throw stop;}return emit.call(this,event,data);};
  await assert.rejects(game.runTurn(),error=>error===stop);
 });
 test(`v7 ${role}: declining optional final chapter still uses Stack then sacrifices Saga`,async()=>{
  const {game,a}=context(role),card=put(game,a,'V7 Optional Saga','hand');a.pool.C=1;a.pool.G=1;
  const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.type==='chooseOption'&&q.options.some(option=>option.key==='no')?'no':decide(g,q);
  assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await game.resolveTop();assert.equal(card.zone,'battlefield');assert.equal(game.stack.length,1);
  await settle(game);assert.equal(a.life,40);assert.equal(card.zone,'graveyard');
 });
 test(`v7 ${role}: copy exceptions become copiable values while later haste grants do not`,async()=>{
  for(const name of ['Small Copy','Hasty Copy','Fleeting Copy']){
    const ctx=context(role),{game,a}=ctx,original=put(game,a,'Grizzly Bears');game.addCounters(original,'+1/+1',4);
    await cast(ctx,name);const copy=game.creatures(a).find(card=>card.isToken);assert.ok(copy);assert.equal(copy.plus1(),0);assert.equal(copy.power,name==='Small Copy'?1:2);
    const [next]=await game.copyPermanentToken(copy,a);assert.equal(next.power,copy.power);assert.equal(next.kw('haste'),name==='Hasty Copy');
    if(name==='Fleeting Copy'){assert.equal(copy.kw('haste'),true);await game.emit('endStep',{player:a});await game.flushTriggers();const delayed=game.stack.find(row=>row.name.includes('Created token'));assert.ok(delayed);await game.counterStackObject(delayed);await settle(game);game.mainPhase=async()=>{};game.combatPhase=async()=>{};await game.runTurn();assert.equal(copy.zone,'battlefield');assert.equal(copy.kw('haste'),true);}
  }
 });
 test(`v7 ${role}: delayed exile follows a changed controller while sacrifice cannot sacrifice another player's token`,async()=>{
  for(const name of ['Fleeting Copy','Sacrificed Copy']){
    const ctx=context(role),{game,a,b}=ctx;put(game,a,'Grizzly Bears');await cast(ctx,name);const copy=game.creatures(a).find(card=>card.isToken);copy.ctrl=b;
    await game.emit('endStep',{player:b});await settle(game);assert.equal(copy.zone,name==='Fleeting Copy'?'ceased':'battlefield');
  }
 });
 test(`v7 ${role}: a graveyard creature copy uses the card and leaves the original in its graveyard`,async()=>{
  const ctx=context(role),{game,a}=ctx,original=put(game,a,'Grizzly Bears','graveyard');await cast(ctx,'Grave Copy');assert.equal(original.zone,'graveyard');const token=game.creatures(a).find(card=>card.isToken);assert.equal(token.name,'Grizzly Bears');assert.equal(token.power,2);
 });
 test(`v7 ${role}: the three historical Robot manifests create actual artifact creatures`,async()=>{
  for(const name of ['Gravpack Monoist','Melded Moxite',"Sami, Ship's Engineer"]){
    const {game,a}=context(role),source=put(game,a,name);a.pool.C=3;
    if(name==='Gravpack Monoist')await game.sacrifice(a,source);
    else if(name==='Melded Moxite')assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===source)),true);
    else {put(game,a,'Grizzly Bears').tapped=true;put(game,a,'Grizzly Bears').tapped=true;await game.emit('endStep',{player:a});}
    await settle(game);const token=game.creatures(a).find(card=>card.isToken);assert.ok(token,name);assert.equal(token.name,'Robot Token');assert.equal(token.is('Artifact'),true);assert.equal(token.hasSub('Robot'),true);assert.equal(token.hasSub('artifact'),false);assert.equal(token.power,2);assert.equal(token.toughness,2);assert.equal(token.tapped,true);
  }
 });
 test(`v7 ${role}: numbered casts count spells before the watcher entered and freeze their types`,async()=>{
  const {game,a}=context(role);a.pool.U=3;
  const first=put(game,a,'Opt','hand');assert.equal(await game.castSpell(a,first,{from:'hand'}),true);await settle(game);
  const watcher=put(game,a,'V7 Second Watcher');for(let i=0;i<2;i++){const card=put(game,a,'Opt','hand');assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await settle(game);assert.equal(watcher.plus1(),1);}
  const typed=put(game,a,'V7 Enchantment Watcher');a.pool.C=5;a.pool.G=2;for(let i=0;i<2;i++){const card=put(game,a,'V7 Attack Watcher','hand');assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await settle(game);assert.equal(typed.plus1(),1);}
 });
 test(`v7 ${role}: historic casts use the spell face and count artifacts plus legendary and Saga spells`,async()=>{
  const {game,a,b}=context(role);put(game,b,'Grizzly Bears');const watcher=put(game,a,'V7 Historic Watcher');
  const adventure=put(game,a,adventureSource.name,'hand');assert.equal(await game.castSpell(a,adventure,{from:'hand',alt:{...adventure.def.adventure,adventure:true,free:true}}),true);await settle(game);assert.equal(watcher.plus1(),0);
  a.pool.C=1;const ring=put(game,a,'Sol Ring','hand');assert.equal(await game.castSpell(a,ring,{from:'hand'}),true);await settle(game);assert.equal(watcher.plus1(),1);
  for(const [name,types,superTypes,subtypes]of [['Legendary probe',['Creature'],['Legendary'],['Bear']],['Saga probe',['Enchantment'],[],['Saga']]]){
    const card=new MTG.CardInst({...MTG.DEFS['Grizzly Bears'],name,types,super:superTypes,subtypes,cost:'{0}'},a);card.zone='hand';a.hand.push(card);assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await settle(game);
  }
  assert.equal(watcher.plus1(),3);
 });
 test(`v7 ${role}: first spell on an opponent turn ignores the controller turn and later spells`,async()=>{
  const {game,a,b}=context(role);put(game,a,'V7 First Watcher');a.pool.U=3;const life=a.life;
  const first=put(game,a,'Opt','hand');assert.equal(await game.castSpell(a,first,{from:'hand'}),true);await settle(game);assert.equal(a.life,life);
  game.turnPlayer=b;a.turnState=a.freshTurnState();for(let i=0;i<2;i++){const card=put(game,a,'Opt','hand');assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await settle(game);assert.equal(a.life,life+3);}
 });
 test(`v7 ${role}: attack triggers fire once for a real declaration with several attackers and never for zero`,async()=>{
  const {game,a,b}=context(role);put(game,a,'V7 Attack Watcher');const life=a.life;
  await game.combatPhase(a);await settle(game);assert.equal(a.life,life);
  put(game,a,'Grizzly Bears');put(game,a,'Grizzly Bears');await game.combatPhase(a);await settle(game);assert.equal(a.life,life+3);assert.ok(b.life<40);
 });
 test(`v7 ${role}: Revolt follows the departing controller including a token and resets each turn`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,token=(await game.makeTokens('treasure',b))[0];token.ctrl=a;const life=a.life;
  await game.move(token,'exile');assert.equal(a.turnState.permanentsLeftBattlefield,1);assert.equal(b.turnState.permanentsLeftBattlefield,0);
  await cast(ctx,'Revolt');assert.equal(a.life,life+5);a.turnState=a.freshTurnState();await cast(ctx,'Revolt');assert.equal(a.life,life+5);
 });
 test(`v7 ${role}: a cycling trigger resolves independently above the paid draw ability`,async()=>{
  const {game,a,b}=context(role),card=put(game,a,'V7 Cycling Bolt','hand'),victim=put(game,b,'Grizzly Bears');a.pool.C=1;
  const row=game.activatableList(a).find(row=>row.card===card&&row.cycling);assert.ok(row);assert.equal(await game.activateAbility(a,row),true);
  assert.equal(card.zone,'graveyard');assert.equal(a.pool.C,0);assert.equal(game.stack.length,2);assert.equal(await game.counterStackObject(game.stack.at(-1)),true);await settle(game);
  assert.equal(victim.zone,'battlefield');assert.equal(a.hand.length,1);
 });
 test(`v7 ${role}: cycling still triggers when Madness replaces the discard with exile`,async()=>{
  const {game,a}=context(role),card=put(game,a,'V7 Cycling Madness','hand');a.pool.C=1;const life=a.life;
  assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===card&&row.cycling)),true);
  assert.equal(card.zone,'exile');await settle(game);assert.equal(a.life,life+3);assert.equal(card.zone,'graveyard');assert.equal(a.hand.length,1);
 });
 test(`v7 ${role}: artifact follows creature subtypes without becoming a subtype itself`,async()=>{
  const ctx=context(role),{game,a}=ctx;await cast(ctx,'Artifact Army');const tokens=game.creatures(a).filter(card=>card.isToken);
  assert.equal(tokens.length,2);for(const card of tokens){assert.equal(card.is('Artifact'),true);assert.equal(card.hasSub('Necron'),true);assert.equal(card.hasSub('Warrior'),true);assert.equal(card.hasSub('artifact'),false);assert.equal(card.tapped,true);}
 });
 test(`v7 ${role}: mandatory graveyard exile is paid only with a successful cast and never refunded by countering`,async()=>{
  const {game,a}=context(role),card=put(game,a,'V7 Exile Cost','hand'),wrong=put(game,a,'Forest','graveyard');
  assert.equal(game.castableList(a).some(row=>row.card===card),false);
  const fodder=put(game,a,'Grizzly Bears','graveyard');
  assert.equal(await game.castSpell(a,card,{from:'hand'}),false);assert.equal(fodder.zone,'graveyard');assert.equal(card.zone,'hand');
  a.pool.C=1;a.pool.G=1;assert.equal(await game.castSpell(a,card,{from:'hand'}),true);assert.equal(fodder.zone,'exile');assert.equal(wrong.zone,'graveyard');
  game.stack.at(-1).countered=true;await settle(game);assert.equal(card.zone,'graveyard');assert.equal(fodder.zone,'exile');
 });
 test(`v7 ${role}: a land can supply mana and then pay a sacrifice cost; failed mana payment spends nothing`,async()=>{
  const {game,a}=context(role),card=put(game,a,'V7 Land Cost','hand'),land=put(game,a,'Forest');land.tapped=true;
  assert.equal(await game.castSpell(a,card,{from:'hand'}),false);assert.equal(land.zone,'battlefield');
  land.tapped=false;assert.equal(await game.castSpell(a,card,{from:'hand'}),true);assert.equal(land.zone,'graveyard');await settle(game);
 });
 test(`v7 ${role}: one artifact cannot pay both its own mana sacrifice and the spell sacrifice`,async()=>{
  const {game,a}=context(role),card=put(game,a,'V7 Artifact Cost','hand'),treasure=(await game.makeTokens('treasure',a))[0];
  assert.equal(await game.castSpell(a,card,{from:'hand'}),false);assert.equal(treasure.zone,'battlefield');assert.equal(treasure.tapped,false);assert.equal(card.zone,'hand');
  a.pool.C=1;assert.equal(await game.castSpell(a,card,{from:'hand'}),true);assert.ok(['graveyard','ceased'].includes(treasure.zone));await settle(game);
 });
 test(`v7 ${role}: the mana solver reserves life already promised as an additional cost`,async()=>{
  const {game,a}=context(role),card=put(game,a,'V7 Life Cost','hand');a.life=3;
  assert.equal(await game.castSpell(a,card,{from:'hand'}),false);assert.equal(a.life,3);assert.equal(card.zone,'hand');
  a.pool.B=1;assert.equal(await game.castSpell(a,card,{from:'hand'}),true);assert.equal(a.life,1);await settle(game);
 });
 test(`v7 ${role}: plural subtype grants and opponent groups preserve their filters`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,own=put(game,a,'Grizzly Bears'),opposing=put(game,b,'Grizzly Bears'),elf=put(game,a,'Llanowar Elves');
  await cast(ctx,'Tribal Gift');assert.equal(own.kw('flying'),true);assert.equal(opposing.kw('flying'),false);assert.equal(elf.kw('flying'),false);
  await cast(ctx,'Opponent Tap');assert.equal(opposing.tapped,true);assert.equal(own.tapped,false);assert.equal(elf.tapped,false);
 });
 test(`v7 ${role}: Adventure object types and mana value follow its printed spell face even with an alternative cost`,async()=>{
  const {game,a,b}=context(role),card=put(game,a,adventureSource.name,'hand');put(game,b,'Grizzly Bears');
  assert.equal(await game.castSpell(a,card,{from:'hand',alt:{...card.def.adventure,adventure:true,free:true,altCostStr:'{R}'}}),true);
  assert.equal(card.is('Instant'),true);assert.equal(card.is('Creature'),false);assert.equal(card.hasSub('Bear'),false);assert.equal(card.hasSub('Adventure'),true);assert.equal(card.mv,2);assert.equal(game.stackSpellManaValue(game.stack.at(-1)),2);assert.deepEqual(Array.from(card.colors),['U']);await settle(game);assert.equal(card.is('Creature'),true);assert.equal(card.hasSub('Bear'),true);
 });
 test(`v7 ${role}: manifest puts both actual cards face down simultaneously and only creatures can turn face up`,async()=>{
  const ctx=context(role),{game,a}=ctx,bear=put(game,a,'Grizzly Bears','library'),land=put(game,a,'Forest','library');put(game,a,'Soul Warden');const life=a.life;await cast(ctx,'Manifest');assert.equal(bear.zone,'battlefield');assert.equal(land.zone,'battlefield');assert.equal(a.life,life+2);assert.equal(bear.mv,0);assert.equal(bear.power,2);assert.equal(land.power,2);assert.equal(game.faceUpCosts(land).length,0);const row=game.activatableList(a).find(row=>row.card===bear&&row.turnFaceUp);assert.ok(row);assert.equal(await game.activateAbility(a,row),true);assert.equal(bear.faceDown,false);assert.equal(bear.name,'Grizzly Bears');
 });
 test(`v7 ${role}: dread selects one of two cards and cloak supplies ward two`,async()=>{
  const ctx=context(role),{game,a}=ctx,top=[put(game,a,'Grizzly Bears','library'),put(game,a,'Forest','library')];await cast(ctx,'Dread');assert.equal(top.filter(card=>card.faceDown&&card.zone==='battlefield').length,1);assert.equal(top.filter(card=>card.zone==='graveyard').length,1);const bear=put(game,a,'Grizzly Bears','library');await cast(ctx,'Cloak');assert.equal(bear.faceDown,true);assert.equal(bear.meta.faceDownKind,'cloak');assert.equal(bear.cur.wardCost.mana,'{2}');
 });
 test(`v7 ${role}: populate copies a creature token without copying its counters or tapping`,async()=>{
  const ctx=context(role),{game,a}=ctx;const [token]=await game.makeTokens('beast33',a);game.addCounters(token,'+1/+1',3);token.tapped=true;put(game,a,'Grizzly Bears');await cast(ctx,'Populate');const copy=game.creatures(a).find(card=>card!==token&&card.isToken&&card.name===token.name);assert.ok(copy);assert.equal(copy.def.power,token.def.power);assert.equal(copy.plus1(),0);assert.equal(copy.tapped,false);
 });
 test(`v7 ${role}: bolster chooses the least toughness without targeting and support excludes its source`,async()=>{
  const ctx=context(role),{game,a}=ctx,small=put(game,a,'Llanowar Elves'),large=put(game,a,'Grizzly Bears');await cast(ctx,'Bolster');assert.equal(small.plus1(),3);assert.equal(large.plus1(),0);const source=await cast(ctx,'Support');assert.equal(source.plus1(),0);assert.equal(small.plus1(),4);assert.equal(large.plus1(),1);
 });
 test(`v7 ${role}: fading survives its last counter and sacrifices at the following upkeep`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,card=await cast(ctx,'Fader');assert.equal(card.counters.fade,2);await game.emit('upkeep',{player:b});await settle(game);assert.equal(card.counters.fade,2);
  for(const expected of [1,0]){await game.emit('upkeep',{player:a});await settle(game);assert.equal(card.counters.fade,expected);assert.equal(card.zone,'battlefield');}await game.emit('upkeep',{player:a});await settle(game);assert.equal(card.zone,'graveyard');
 });
 test(`v7 ${role}: vanishing uses a separate sacrifice trigger when any effect removes the last counter`,async()=>{
  for(const cancel of [false,true]){const ctx=context(role),{game,a}=ctx,card=await cast(ctx,'Vanisher');assert.equal(card.counters.time,2);game.removeCounters(card,'time',2);await game.flushTriggers();const trigger=game.stack.find(row=>row.kind==='trigger'&&row.srcCard===card);assert.ok(trigger);assert.equal(card.zone,'battlefield');if(cancel)game.stack.splice(game.stack.indexOf(trigger),1);else game.addCounters(card,'time',1);await settle(game);assert.equal(card.zone,cancel?'battlefield':'graveyard');if(cancel){await game.emit('upkeep',{player:a});await settle(game);assert.equal(card.zone,'battlefield');assert.equal(card.counters.time,0);}}
 });
 test(`v7 ${role}: an old vanishing trigger cannot sacrifice a blinked object or another player's permanent`,async()=>{
  for(const blink of [false,true]){const ctx=context(role),{game,a,b}=ctx,card=await cast(ctx,'Vanisher');game.removeCounters(card,'time',2);await game.flushTriggers();if(blink){await game.move(card,'exile');await game.putPermanentOntoBattlefield(card,a);}else {card.ctrl=b;game.recalc();}await settle(game);assert.equal(card.zone,'battlefield');if(blink)assert.equal(card.counters.time,2);}
 });
 test(`v7 ${role}: cumulative upkeep adds age and pays the entire growing mana cost`,async()=>{
  const ctx=context(role),{game,a}=ctx,card=await cast(ctx,'Age');for(const color of Object.keys(a.pool))a.pool[color]=0;a.pool.C=3;a.pool.G=3;
  for(const age of [1,2]){await game.emit('upkeep',{player:a});await settle(game);assert.equal(card.counters.age,age);assert.equal(card.zone,'battlefield');assert.equal(a.pool.C,age===1?2:0);assert.equal(a.pool.G,age===1?2:0);}await game.emit('upkeep',{player:a});await settle(game);assert.equal(card.zone,'graveyard');
 });
 test(`v7 ${role}: buyback pays an additional cost and returns only after successful resolution`,async()=>{
  for(const counter of [false,true]){const {game,a}=context(role),card=put(game,a,'V7 Buyback','hand');a.pool.C=2;a.pool.U=1;const library=a.library.length;assert.equal(await game.castSpell(a,card,{from:'hand'}),true);assert.equal(card.castMeta.alt.buybackPaid,true);assert.equal(a.pool.C,0);assert.equal(a.pool.U,0);if(counter)await game.counterStackObject(game.stack.at(-1));await settle(game);assert.equal(card.zone,counter?'graveyard':'hand');assert.equal(a.library.length,library-(counter?0:1));}
 });
 test(`v7 ${role}: a free spell still pays buyback, and unpaid buyback cannot return it`,async()=>{
  for(const free of [false,true]){const {game,a}=context(role),card=put(game,a,'V7 Buyback','hand');a.pool.U=free?0:1;a.pool.C=free?2:0;assert.equal(await game.castSpell(a,card,{from:'hand',alt:{free}}),true);await settle(game);assert.equal(a.pool.C,0);assert.equal(card.zone,free?'hand':'graveyard');}
 });
 test(`v7 ${role}: split second stops spells and nonmana abilities but allows mana, foretell, and triggers`,async()=>{
  const {game,a,b}=context(role),card=put(game,a,'V7 Second','hand'),ability=put(game,a,'V7 Exhaustion'),converter=put(game,a,'V7 Utility Converter'),foretell=put(game,a,'V7 Foreteller','hand'),response=put(game,a,'Opt','hand');a.pool.C=3;a.pool.U=2;a.pool.G=1;a.pool.R=1;
  const old=game.activatableList(a).find(row=>row.card===ability);assert.ok(old);assert.equal(await game.castSpell(a,card,{from:'hand'}),true);assert.equal(game.hasSplitSecond(),true);assert.equal(game.castableList(a).length,0);assert.equal(await game.castSpell(a,response,{from:'hand'}),false);assert.equal(await game.activateAbility(a,old),false);
  const mana=game.activatableList(a,true).find(row=>row.card===converter&&row.manaAbility);assert.ok(mana);assert.equal(await game.activateAbility(a,mana),true);assert.equal(a.pool.B,1);const special=game.activatableList(a,true).find(row=>row.card===foretell&&row.foretell);assert.ok(special);game.priorityState={holder:a};assert.equal(await game.activateAbility(a,special),true);game.priorityState=null;assert.equal(foretell.zone,'exile');
  put(game,a,'Soul Warden');const bear=put(game,b,'Grizzly Bears','hand'),life=a.life;await game.putPermanentOntoBattlefield(bear,b);await game.flushTriggers();assert.ok(game.stack.some(row=>row.kind==='trigger'));await settle(game);assert.equal(a.life,life+1);assert.equal(game.hasSplitSecond(),false);
 });
 test(`v7 ${role}: jump-start needs a real discard and exiles both a resolved and countered spell`,async()=>{
  for(const counter of [false,true]){const {game,a}=context(role),card=put(game,a,'V7 Jump','graveyard');a.pool.U=1;assert.equal(game.castableList(a).some(row=>row.card===card),false);const discard=put(game,a,'Forest','hand'),row=game.castableList(a).find(row=>row.card===card);assert.ok(row);assert.equal(await game.castSpell(a,card,{from:'graveyard',alt:row.alt}),true);assert.equal(discard.zone,'graveyard');assert.equal(a.pool.U,0);if(counter)await game.counterStackObject(game.stack.at(-1));await settle(game);assert.equal(card.zone,'exile');}
 });
 test(`v7 ${role}: transmute pays, discards, uses sorcery timing, and searches an exact mana value`,async()=>{
  const {game,a,b}=context(role),card=put(game,a,'V7 Transmuter','hand'),match=put(game,a,'Basalt Monolith','library');put(game,a,'Grizzly Bears','library');a.pool.C=1;a.pool.U=2;game.turnPlayer=b;assert.equal(game.activatableList(a).some(row=>row.card===card&&row.handAbility),false);assert.equal(await game.activateAbility(a,{card,handAbility:true}),false);game.turnPlayer=a;const action=game.activatableList(a).find(row=>row.card===card&&row.handAbility);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.equal(card.zone,'graveyard');assert.equal(a.pool.C,0);assert.equal(a.pool.U,0);assert.ok(game.stack.some(row=>row.srcCard===card));await settle(game);assert.equal(match.zone,'hand');
 });
 test(`v7 ${role}: split halves pay their own cost and have only the chosen spell characteristics`,async()=>{
  for(const key of ['left','right']){const {game,a,b}=context(role),card=put(game,a,'V7 Split','hand');put(game,b,'Grizzly Bears');a.pool.U=1;a.pool.G=1;a.pool.C=2;
   assert.equal(card.mv,4);game.turnPlayer=b;game.phase='end';assert.deepEqual(Array.from(game.castableList(a).filter(row=>row.card===card),row=>row.alt.splitHalf||'fuse'),['left','fuse']);
   game.turnPlayer=a;game.phase='main1';const row=game.castableList(a).find(row=>row.card===card&&row.alt.splitHalf===key);assert.ok(row);assert.equal(await game.castSpell(a,card,{from:'hand',alt:row.alt}),true);
   const so=game.stack.at(-1);assert.equal(game.stackSpellManaValue(so),key==='left'?1:3);assert.equal(card.mv,key==='left'?1:3);assert.equal(game.castHasType(card,so.castOpts,'Instant'),key==='left');assert.deepEqual(Array.from(card.colors),[key==='left'?'U':'G']);
   assert.equal(a.pool.U,key==='left'?0:1);assert.equal(a.pool.G,key==='left'?1:0);assert.equal(a.pool.C,key==='left'?2:0);await settle(game);assert.equal(card.zone,'graveyard');assert.equal(card.mv,4);
  }
 });
 test(`v7 ${role}: fused halves share X, pay both X costs, and cannot fuse outside hand`,async()=>{
  const {game,a}=context(role),card=put(game,a,'V7 Double X','hand');a.pool.C=6;a.pool.U=1;a.pool.G=1;const library=a.library.length,life=a.life;
  const alt=game.castableList(a).find(row=>row.card===card&&row.alt.splitFuse)?.alt;assert.ok(alt);assert.equal(await game.castSpell(a,card,{from:'hand',alt,xVal:3}),true);assert.equal(game.stackSpellManaValue(game.stack.at(-1)),8);assert.equal(card.mv,8);assert.equal(a.pool.C,0);await settle(game);assert.equal(a.library.length,library-3);assert.equal(a.life,life+3);
  await game.move(card,'exile');assert.equal(await game.castSpell(a,card,{from:'exile',alt:{...alt,free:true}}),false);
 });
 test(`v7 ${role}: aftermath is graveyard-only and exiles on resolution or counter`,async()=>{
  for(const counter of [false,true]){const {game,a,b}=context(role),card=put(game,a,'V7 After','hand');a.pool.C=1;a.pool.W=1;a.pool.U=1;assert.equal(game.castableList(a).some(row=>row.card===card&&row.alt?.splitHalf==='right'),false);assert.equal(await game.castSpell(a,card,{from:'hand',alt:{splitHalf:'right'}}),false);
   await game.move(card,'graveyard');game.turnPlayer=b;assert.equal(game.castableList(a).some(row=>row.card===card),false);game.turnPlayer=a;const row=game.castableList(a).find(row=>row.card===card);assert.ok(row);assert.equal(row.alt.splitHalf,'right');const life=a.life;assert.equal(await game.castSpell(a,card,{from:'graveyard',alt:row.alt}),true);if(counter)await game.counterStackObject(game.stack.at(-1));await settle(game);assert.equal(card.zone,'exile');assert.equal(a.life,life+(counter?0:3));
  }
 });
 test(`v7 ${role}: a fused right half cannot follow a target blinked by its left half`,async()=>{
  const {game,a}=context(role),host=put(game,a,'Grizzly Bears'),card=put(game,a,'V7 Blink Fuse','hand');a.pool.W=1;a.pool.G=1;const version=host.zoneVersion;
  assert.equal(await game.castSpell(a,card,{from:'hand',alt:{splitFuse:'right'}}),true);const so=game.stack.at(-1);assert.equal(so.targets[0],host);assert.equal(so.targets[1],host);await settle(game);assert.equal(host.zone,'battlefield');assert.notEqual(host.zoneVersion,version);assert.equal(host.plus1(),0);
 });
 test(`v7 ${role}: free split casting still uses printed mana value and colors`,async()=>{
  const {game,a,b}=context(role),card=put(game,a,'V7 Split','exile');put(game,b,'Grizzly Bears');assert.equal(await game.castSpell(a,card,{from:'exile',alt:{free:true,splitHalf:'left'}}),true);const so=game.stack.at(-1);assert.equal(game.stackSpellManaValue(so),1);assert.equal(card.mv,1);assert.deepEqual(Array.from(card.colors),['U']);await settle(game);
 });
 test(`v7 ${role}: a later sentence checks the previously chosen creature's counters`,async()=>{
  for(const count of [0,1]){const ctx=context(role),{game,a}=ctx,host=put(game,a,'Grizzly Bears');if(count)game.addCounters(host,'+1/+1',count);const library=a.library.length;await cast(ctx,'Counter Continuation');assert.equal(host.kw('double strike'),true);assert.equal(a.library.length,library-count);}
 });
 test(`v7 ${role}: a temporary granted activation belongs to its host and is lost on a zone change`,async()=>{
  const ctx=context(role),{game,a}=ctx,host=put(game,a,'Grizzly Bears');await cast(ctx,'Temporary Rule');const action=game.activatableList(a).find(row=>row.card===host);assert.ok(action);const library=a.library.length;assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(a.library.length,library-1);
  await game.move(host,'exile');await game.move(host,'battlefield',{ctrl:a});assert.equal(game.activatableList(a).some(row=>row.card===host),false);
 });
 test(`v7 ${role}: a temporary granted damage trigger observes actual damage and counters the host`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,host=put(game,a,'Grizzly Bears'),enemy=put(game,b,'Grizzly Bears');await cast(ctx,'Temporary Shield');assert.equal(host.kw('indestructible'),true);await game.damageAny(enemy,host,3);await settle(game);assert.equal(host.zone,'battlefield');assert.equal(host.counters['+1/+1'],3);
 });
 test(`v7 ${role}: a condition on the chosen target does not read the untapped source`,async()=>{
  for(const tapped of [false,true]){const ctx=context(role),{game,b}=ctx,target=put(game,b,'Grizzly Bears');target.tapped=tapped;await cast(ctx,'Conditional Destroy');assert.equal(target.zone,tapped?'graveyard':'battlefield');}
 });
 test(`v7 ${role}: a counter replacement exiles the spell`,async()=>{
  const ctx=context(role),{game,b}=ctx,card=put(game,b,'Grizzly Bears','hand');b.pool.G=1;b.pool.C=1;game.turnPlayer=b;assert.equal(await game.castSpell(b,card,{from:'hand'}),true);await cast(ctx,'Exile Counter');assert.equal(card.zone,'exile');
 });
 test(`v7 ${role}: devotion counts a hybrid symbol once and ignores mana symbols in rules text`,async()=>{
  const ctx=context(role),{game,a}=ctx;const def={...MTG.DEFS['Grizzly Bears'],cost:'{G/W}{G}{W}',oracle:'{G}{G}: Draw a card.'};const card=new MTG.CardInst(def,a);card.zone='battlefield';game.battlefield.push(card);game.recalc();const life=a.life;await cast(ctx,'Devout');assert.equal(a.life,life+3);
 });
 test(`v7 ${role}: a single changeling fills only one party role`,async()=>{
  const ctx=context(role),{game,a}=ctx;const make=(subtypes,changeling=false)=>{const card=new MTG.CardInst({...MTG.DEFS['Grizzly Bears'],subtypes,changeling},a);card.zone='battlefield';game.battlefield.push(card);game.recalc();};
  make([],true);make(['Cleric','Wizard']);make(['Warrior']);const n=a.library.length;await cast(ctx,'Party');assert.equal(a.library.length,n-3);
 });
 test(`v7 ${role}: graveyard activations choose a target before exile and respect sorcery timing`,async()=>{
  for(const name of ['Scavenger','Renewer']){const {game,a,b}=context(role),card=put(game,a,'V7 '+name,'graveyard'),target=put(game,a,'Grizzly Bears');a.pool.G=1;
   game.turnPlayer=b;assert.equal(game.activatableList(a).some(row=>row.card===card),false);game.turnPlayer=a;
   const action=game.activatableList(a).find(row=>row.card===card&&row.gyAbility);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.equal(card.zone,'exile');assert.equal(a.pool.G,0);assert.equal(game.stack.at(-1).targets[0],target);await settle(game);assert.equal(target.counters['+1/+1'],2);
  }
 });
 test(`v7 ${role}: graveyard activation without a legal target pays nothing and a removed target fizzles`,async()=>{
  const {game,a}=context(role),card=put(game,a,'V7 Scavenger','graveyard');a.pool.G=1;assert.equal(game.activatableList(a).some(row=>row.card===card),false);
  const target=put(game,a,'Grizzly Bears'),action=game.activatableList(a).find(row=>row.card===card);assert.equal(await game.activateAbility(a,action),true);await game.move(target,'hand');await settle(game);assert.equal(card.zone,'exile');assert.equal(a.pool.G,0);assert.equal(target.counters['+1/+1'],undefined);
 });
 test(`v7 ${role}: madness replaces a cost discard and pays its alternative cost during an opponent's turn`,async()=>{
  const {game,a,b}=context(role),card=put(game,a,'V7 Mad Bear','hand');a.pool.G=1;game.turnPlayer=b;game.phase='combat';
  await game.discard(a,[card],{noReplacement:true});assert.equal(card.zone,'exile');assert.equal(a.turnState.discardedN,1);assert.equal(game.castableList(a).some(row=>row.card===card),false);
  assert.equal(await game.castSpell(a,card,{from:'exile',alt:{madness:true,altCostStr:'{G}',speed:'instant'}}),false);
  await game.flushTriggers();assert.equal(game.stack.length,1);await game.resolveTop();assert.equal(card.zone,'stack');assert.equal(game.stack.length,1);assert.equal(a.pool.G,0);await settle(game);assert.equal(card.zone,'battlefield');
 });
 test(`v7 ${role}: declined or unpaid madness moves the card to the graveyard without casting`,async()=>{
  for(const decline of [false,true]){const {game,a}=context(role),card=put(game,a,'V7 Mad Draw','hand');a.pool.G=decline?1:0;const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.aiHint?.kind==='pay'?(decline?'no':'yes'):decide(g,q);
   const n=a.library.length;await game.discard(a,[card]);await settle(game);assert.equal(card.zone,'graveyard');assert.equal(a.library.length,n);assert.equal(a.pool.G,decline?1:0);assert.equal(card.castMeta?.alt?.madness,undefined);
  }
 });
 test(`v7 ${role}: countering the madness trigger leaves exile and stale triggers cannot follow a new object`,async()=>{
  for(const counter of [true,false]){const {game,a}=context(role),card=put(game,a,'V7 Mad Bear','hand');a.pool.G=1;await game.discard(a,[card]);await game.flushTriggers();
   if(counter)assert.equal(await game.counterStackObject(game.stack.at(-1)),true);else{await game.move(card,'graveyard');await game.move(card,'exile');}
   await settle(game);assert.equal(card.zone,'exile');assert.equal(a.pool.G,1);assert.equal(game.castableList(a).some(row=>row.card===card),false);
  }
 });
 test(`v7 ${role}: returning an uncounterable spell removes the Stack object without resolving it`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,spell=new MTG.CardInst({...MTG.DEFS.Opt,name:'Uncounterable test spell',uncounterable:true},b);spell.zone='hand';b.hand.push(spell);b.pool.U=1;
  assert.equal(await game.castSpell(b,spell,{from:'hand'}),true);const so=game.stack.find(row=>row.card===spell);assert.equal(await game.counterStackObject(so),false);const library=b.library.length;
  await cast(ctx,'Bounce Spell');assert.equal(game.stack.includes(so),false);assert.equal(spell.zone,'hand');assert.equal(b.library.length,library);
 });
 test(`v7 ${role}: a blue-instant counter sees the Adventure face instead of the green creature`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,adventure=put(game,b,adventureSource.name,'hand');put(game,a,'Grizzly Bears');b.pool.U=1;b.pool.C=1;
  assert.equal(await game.castSpell(b,adventure,{from:'hand',alt:{...adventure.def.adventure,adventure:true}}),true);
  const counter=put(game,a,'V7 Blue Instant','hand');a.pool.C=1;a.pool.G=1;assert.equal(await game.castSpell(a,counter,{from:'hand'}),true);assert.equal(game.stack.at(-1).targets[0].card,adventure);await settle(game);assert.equal(adventure.zone,'graveyard');
 });
 test(`v7 ${role}: Adventure is an instant on the Stack, then offers a paid permanent cast from exile`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,card=put(game,a,adventureSource.name,'hand'),victim=put(game,b,'Grizzly Bears');a.pool.C=2;a.pool.U=1;a.pool.G=1;
  game.turnPlayer=b;game.phase='end';const action=game.castableList(a).find(row=>row.card===card&&row.alt?.adventure);assert.ok(action);assert.equal(game.castableList(a).some(row=>row.card===card&&!row.alt?.adventure),false);
  assert.equal(await game.castSpell(a,card,{from:'hand',alt:action.alt}),true);const so=game.stack.find(row=>row.card===card);assert.equal(game.isInstantSorcerySpell(so),true);assert.equal(game.isCreatureSpell(so),false);assert.equal(game.stackSpellManaValue(so),2);await settle(game);assert.equal(card.zone,'exile');assert.equal(victim.zone,'hand');
  game.turnPlayer=a;game.phase='main1';const later=game.castableList(a).find(row=>row.card===card&&row.from==='exile');assert.ok(later);assert.equal(!!later.alt.adventure,false);assert.equal(await game.castSpell(a,card,{from:'exile',alt:later.alt}),true);await settle(game);assert.equal(card.zone,'battlefield');assert.equal(card.kw('vigilance'),true);assert.equal(a.pool.C,0);assert.equal(a.pool.U,0);assert.equal(a.pool.G,0);
  await game.move(card,'exile');assert.equal(game.hasExilePlayPermission(a,card),false);assert.equal(game.castableList(a).some(row=>row.card===card),false);
 });
 test(`v7 ${role}: countered or fizzled Adventure gives no exile casting permission`,async()=>{
  for(const counter of [false,true]){const ctx=context(role),{game,a,b}=ctx,card=put(game,a,adventureSource.name,'hand'),victim=put(game,b,'Grizzly Bears');a.pool.U=1;a.pool.C=1;
    assert.equal(await game.castSpell(a,card,{from:'hand',alt:{...card.def.adventure,adventure:true}}),true);const so=game.stack.find(row=>row.card===card);if(counter)assert.equal(await game.counterStackObject(so),true);else await game.move(so.targets[0],'hand');await settle(game);assert.equal(card.zone,'graveyard');assert.equal(game.hasExilePlayPermission(a,card),false);
  }
 });
 test(`v7 ${role}: created Mercenary obeys summoning sickness, timing, tap cost and targeted pump`,async()=>{
  const ctx=context(role),{game,a}=ctx,host=await cast(ctx,'Mercenary'),token=game.bf().find(c=>c.isToken);
  assert.equal(game.activatableList(a).some(row=>row.card===token),false);token.sick=false;game.phase='end';assert.equal(game.activatableList(a).some(row=>row.card===token),false);game.phase='main1';
  const action=game.activatableList(a).find(row=>row.card===token);assert.ok(action);const before=new Map(game.creatures().map(c=>[c,c.power]));assert.equal(await game.activateAbility(a,action),true);assert.equal(token.tapped,true);const target=game.stack.find(row=>row.srcCard===token).targets[0];await settle(game);assert.equal(target.power,before.get(target)+1);
 });
 test(`v7 ${role}: created Spawn sacrifices itself for immediate mana`,async()=>{
  const ctx=context(role),{game,a}=ctx;await cast(ctx,'Spawn');const token=game.bf().find(c=>c.isToken);assert.ok(token);for(const color of ['W','U','B','R','G','C'])a.pool[color]=0;
  assert.equal(await game.payMana(a,MTG.parseCost('{1}')),true);assert.equal(token.zone,'ceased');assert.equal(a.pool.C,0);assert.equal(game.stack.length,0);
 });
 test(`v7 ${role}: created Wizard reacts to a real noncreature cast`,async()=>{
  const ctx=context(role),{game,a,b}=ctx;await cast(ctx,'Wizard Maker');const token=game.bf().find(c=>c.isToken),life=b.life;
  const spell=put(game,a,'Opt','hand');a.pool.U=1;assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);assert.ok(game.stack.some(row=>row.srcCard===token&&row.kind==='trigger'));await settle(game);assert.equal(b.life,life-1);
 });
 test(`v7 ${role}: a created Ooze has its own death trigger and creates the next generation`,async()=>{
  const ctx=context(role),{game,a}=ctx,source=await cast(ctx,'Ooze Maker');await game.sacrifice(a,source);await settle(game);const token=game.bf().find(c=>c.isToken&&c.power===2);assert.ok(token);
  await game.sacrifice(a,token);await settle(game);assert.equal(token.zone,'ceased');assert.equal(game.bf().filter(c=>c.isToken&&c.power===1&&c.toughness===1).length,2);
 });
 test(`v7 ${role}: exact mana-value search excludes cheaper artifacts and wrong types`,async()=>{
  const ctx=context(role),{game,a,trace}=ctx,wanted=put(game,a,'Darksteel Ingot','library'),small=put(game,a,'Sol Ring','library'),wrong=put(game,a,'Vampire Nighthawk','library');
  await cast(ctx,'Exact Search');const choice=trace.find(row=>row.q.search);assert.ok(choice);assert.equal(choice.q.from.length,1);assert.equal(choice.q.from[0],wanted);assert.equal(wanted.zone,'hand');assert.equal(small.zone,'library');assert.equal(wrong.zone,'library');
 });
 test(`v7 ${role}: basic subtype search excludes a nonbasic dual and a different basic`,async()=>{
  const ctx=context(role),{game,a,trace}=ctx;put(game,a,'Mountain','library');put(game,a,'Breeding Pool','library');await cast(ctx,'Basic Search');const choice=trace.find(row=>row.q.search);assert.ok(choice);assert.ok(choice.q.from.length);assert.ok(choice.q.from.every(c=>c.name==='Forest'));for(const card of choice.result){assert.equal(card.zone,'battlefield');assert.equal(card.tapped,true);}
 });
 test(`v7 ${role}: top-card permanent selection moves unselected spells to hand and enters simultaneously`,async()=>{
  const ctx=context(role),{game,a,trace}=ctx,cards=['Soul Warden','Soul Warden','Grizzly Bears','Opt','Forest'].map(name=>put(game,a,name,'library')),library=a.library.length;
  await cast(ctx,'Top Permanents');const choice=trace.find(row=>row.q.type==='chooseCards'&&row.q.prompt==='Choose a card from the top of your library');assert.ok(choice);assert.equal(choice.q.from.length,4);assert.ok(choice.q.from.every(c=>!c.is('Instant')));assert.equal(a.library.length,library-5);for(const card of cards)assert.equal(card.zone,choice.result.includes(card)?'battlefield':'hand');
 });
 test(`v7 ${role}: power-up discounts matching pips only on the entry turn, then remains spent`,async()=>{
  const ctx=context(role),{game,a}=ctx,c=await cast(ctx,'Power Up');const action=game.activatableList(a).find(row=>row.card===c);
  assert.ok(action);const discounted=game.abilityManaCost(a,c,action.ability.cost.mana,{ability:action.ability});
  assert.equal(discounted.generic,3);assert.deepEqual(JSON.parse(JSON.stringify(discounted.pips)),[['G']]);
  for(const color of ['W','U','B','R','G','C'])a.pool[color]=0;a.pool.C=3;a.pool.G=1;
  assert.equal(await game.activateAbility(a,action),true);assert.equal(a.pool.C,0);assert.equal(a.pool.G,0);await settle(game);
  game.turnNo++;assert.equal(game.activatableList(a).some(row=>row.card===c),false);
  const full=game.abilityManaCost(a,c,action.ability.cost.mana,{ability:action.ability});assert.equal(full.generic,5);assert.equal(full.pips.length,2);
  const overflow=game.abilityManaCost(a,c,'{3}{R}',{ability:action.ability});assert.equal(overflow.generic,3);
  c.meta._enteredTurn=game.turnNo;const reduced=game.abilityManaCost(a,c,'{3}{R}',{ability:action.ability});assert.equal(reduced.generic,0);assert.deepEqual(JSON.parse(JSON.stringify(reduced.pips)),[['R']]);
 });
 test(`v7 ${role}: loyalty pays exact counters, shares the turn limit, and uses sorcery timing`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,c=await cast(ctx,'Loyal');assert.equal(c.counters.loyalty,5);
  game.phase='end';assert.equal(game.activatableList(a).some(row=>row.card===c),false);game.phase='main1';
  const victim=put(game,b,'Grizzly Bears'),offered=game.activatableList(a).filter(row=>row.card===c);
  assert.equal(offered.length,2);const plus=offered.find(row=>row.ability.loyalty===1),minus=offered.find(row=>row.ability.loyalty===-2);
  assert.equal(await game.activateAbility(a,plus),true);assert.equal(c.counters.loyalty,6);assert.equal(game.stack.length,1);
  await settle(game);assert.equal(game.activatableList(a).some(row=>row.card===c),false);
  assert.equal(await game.activateAbility(a,minus),false);assert.equal(c.counters.loyalty,6);
  game.turnNo++;assert.equal(await game.activateAbility(a,minus),true);assert.equal(c.counters.loyalty,4);await settle(game);assert.equal(victim.zone,'graveyard');
 });
 test(`v7 ${role}: exhaust stays spent across turns, resets only for a new object`,async()=>{
  const ctx=context(role),{game,a}=ctx,c=put(game,a,'V7 Exhaustion');a.pool.G=5;
  const action=game.activatableList(a).find(row=>row.card===c);assert.ok(action);
  assert.equal(await game.activateAbility(a,action),true);await settle(game);
  assert.equal(game.activatableList(a).some(row=>row.card===c),false);game.turnNo++;
  assert.equal(game.activatableList(a).some(row=>row.card===c),false);
  assert.equal(await game.activateAbility(a,action),false);assert.equal(a.pool.G,4);
  await game.move(c,'exile');await game.move(c,'battlefield',{ctrl:a});c.sick=false;
  assert.ok(game.activatableList(a).some(row=>row.card===c));
 });
 test(`v7 ${role}: boast requires an actual declared attack and is once each turn`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,c=put(game,a,'V7 Boaster');a.pool.G=5;
  assert.equal(game.activatableList(a).some(row=>row.card===c),false);
  const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.type==='attackers'?[{card:c,target:b}]:decide(g,q);
  await game.combatPhase(a);await settle(game);game.phase='main2';game.step='main';
  const action=game.activatableList(a).find(row=>row.card===c);assert.ok(action);
  assert.equal(await game.activateAbility(a,action),true);await settle(game);
  assert.equal(game.activatableList(a).some(row=>row.card===c),false);
  game.turnNo++;assert.equal(game.activatableList(a).some(row=>row.card===c),false);
 });
 test(`v7 ${role}: sunburst counts distinct spent colors, excluding colorless and free casts`,async()=>{
  const ctx=context(role),{game,a}=ctx,c=put(game,a,'V7 Prismatic','hand');a.pool.W=1;a.pool.U=1;a.pool.C=1;
  assert.equal(await game.castSpell(a,c,{from:'hand'}),true);await settle(game);assert.equal(c.counters['+1/+1'],2);
  const free=put(game,a,'V7 Prismatic','hand');assert.equal(await game.castSpell(a,free,{from:'hand',alt:{free:true}}),true);await settle(game);assert.equal(free.counters['+1/+1']||0,0);
 });
 test(`v7 ${role}: simultaneous reanimation lets both entering Wardens see the other`,async()=>{
  const ctx=context(role),{game,a,b}=ctx;const first=put(game,a,'Soul Warden','graveyard'),second=put(game,a,'Soul Warden','graveyard'),land=put(game,a,'Forest','graveyard'),enemy=put(game,b,'Grizzly Bears','graveyard'),life=a.life;await cast(ctx,'All Return');assert.equal(first.zone,'battlefield');assert.equal(second.zone,'battlefield');assert.equal(a.life,life+2);assert.equal(land.zone,'graveyard');assert.equal(enemy.zone,'graveyard');
 });
 test(`v7 ${role}: each player chooses from their own graveyard without targeting`,async()=>{
  const ctx=context(role),{game,a,b,trace}=ctx,own=put(game,a,'Grizzly Bears','graveyard'),enemy=put(game,b,'Vampire Nighthawk','graveyard');await cast(ctx,'Each Return');assert.equal(own.zone,'battlefield');assert.equal(enemy.zone,'battlefield');assert.equal(own.ctrl,a);assert.equal(enemy.ctrl,b);assert.equal(trace.some(({q})=>q.type==='chooseTargets'),false);
 });
 test(`v7 ${role}: clearing graveyards includes both players and does not exile the resolving spell`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,own=put(game,a,'Grizzly Bears','graveyard'),enemy=put(game,b,'Forest','graveyard'),spell=await cast(ctx,'Empty Graves');assert.equal(own.zone,'exile');assert.equal(enemy.zone,'exile');assert.equal(spell.zone,'graveyard');assert.equal(a.graveyard.length,1);assert.equal(b.graveyard.length,0);
 });
 test(`v7 ${role}: mana converter is immediate, pays its input and does not require tapping`,async()=>{
  const ctx=context(role),{game,a}=ctx,c=put(game,a,'V7 Converter');c.sick=true;a.pool.R=1;
  assert.equal(await game.payMana(a,MTG.parseCost('{B}')),true);assert.equal(a.pool.R,0);assert.equal(a.pool.B,0);assert.equal(c.tapped,false);assert.equal(game.stack.length,0);
 });
 test(`v7 ${role}: sacrifice mana pays a real creature and cannot activate without one`,async()=>{
  const ctx=context(role),{game,a}=ctx,c=put(game,a,'V7 Altar');assert.equal(game.manaSources(a).some(row=>row.card===c),false);const victim=put(game,a,'Grizzly Bears');assert.equal(await game.payMana(a,MTG.parseCost('{2}')),true);assert.equal(victim.zone,'graveyard');assert.equal(a.pool.C,0);assert.equal(game.stack.length,0);
 });
 test(`v7 ${role}: counted mana has no invented fallback and checks creature count now`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,c=put(game,a,'V7 Cradle');put(game,b,'Grizzly Bears');put(game,a,'Grizzly Bears');put(game,a,'Llanowar Elves');const sources=game.manaSources(a).filter(row=>row.card===c);assert.equal(sources.length,1);assert.equal(sources[0].produce[0].G,2);assert.equal(await game.payMana(a,MTG.parseCost('{G}{G}')),true);assert.equal(a.pool.G,0);assert.equal(c.tapped,true);assert.equal(game.stack.length,0);
 });
 test(`v7 ${role}: conditional mana cannot be offered without the required permanent`,()=>{
  const ctx=context(role),{game,a,b}=ctx,c=put(game,a,'V7 Dragon Mana');assert.equal(game.manaSources(a).some(row=>row.card===c),false);put(game,b,'Shivan Dragon');assert.equal(game.manaSources(a).some(row=>row.card===c),false);put(game,a,'Shivan Dragon');assert.equal(game.manaSources(a).some(row=>row.card===c),true);
 });
 test(`v7 ${role}: harbinger reveals only the chosen subtype and puts it above the shuffled library`,async()=>{
  const ctx=context(role),{game,a,trace}=ctx,elf=put(game,a,'Llanowar Elves','library'),before=a.library.length;
  await cast(ctx,'Harbinger');const selection=trace.find(({q})=>q.search);assert.ok(selection);assert.equal(selection.q.from.length,1);assert.equal(selection.q.from[0],elf);assert.equal(a.library.length,before);assert.equal(a.library.at(-1),elf);assert.equal(elf.zone,'library');assert.equal(new Set(a.library).size,a.library.length);
 });
 test(`v7 ${role}: named search offers the exact name, never arbitrary cards`,async()=>{
  const ctx=context(role),{game,a,trace}=ctx,bear=put(game,a,'Grizzly Bears','library');put(game,a,'Llanowar Elves','library');
  await cast(ctx,'Seahawk');const selection=trace.find(({q})=>q.search);assert.ok(selection);assert.equal(selection.q.from.length,1);assert.equal(selection.q.from[0],bear);assert.equal(bear.zone,'hand');
 });
 test(`v7 ${role}: two independently locked targets allow the valid target to survive a partial fizzle`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,creature=put(game,b,'Grizzly Bears'),land=put(game,b,'Mountain');const spell=put(game,a,'V7 Two Targets','hand');a.pool.G=1;a.pool.C=1;
  assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await game.move(creature,'hand');await settle(game);assert.equal(creature.zone,'hand');assert.equal(land.zone,'graveyard');
 });
 test(`v7 ${role}: token-only static debuff excludes real creatures and token artifacts`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,real=put(game,a,'Grizzly Bears');const tokens=await game.makeTokens({name:'Test Bear',types:['Creature'],subtypes:['Bear'],power:'3',toughness:'3',colorsOverride:['G']},b,{n:1});const treasure=(await game.makeTokens('treasure',a,{n:1}))[0];
  await cast(ctx,'Token Plague');assert.equal(real.power,2);assert.equal(tokens[0].power,2);assert.equal(tokens[0].toughness,2);assert.equal(treasure.zone,'battlefield');
 });
 test(`v7 ${role}: combat trigger counters the damaging Vampire and ignores another subtype`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,observer=put(game,a,'V7 Vampire Observer'),vampire=put(game,a,'Vampire Nighthawk'),bear=put(game,a,'Grizzly Bears');
  vampire.attacking=b;game.combat={attackers:[vampire],defenders:new Map()};await game.combatDamage(a,'normal');await settle(game);assert.equal(vampire.counters['+1/+1'],1);assert.equal(observer.counters['+1/+1']||0,0);
  vampire.attacking=null;bear.attacking=b;game.combat={attackers:[bear],defenders:new Map()};await game.combatDamage(a,'normal');await settle(game);assert.equal(vampire.counters['+1/+1'],1);assert.equal(bear.counters['+1/+1']||0,0);
 });
 test(`v7 ${role}: X sets both token count and token size after paying both X costs`,async()=>{
  const ctx=context(role),{game,a}=ctx;await cast(ctx,'Oozes',{xVal:3});const tokens=game.bf().filter(c=>c.isToken);assert.equal(tokens.length,3);for(const c of tokens){assert.equal(c.power,3);assert.equal(c.toughness,3);}assert.equal(a.pool.C,14);assert.equal(a.pool.G,4);
 });
 test(`v7 ${role}: token size uses the actual death count`,async()=>{
  const ctx=context(role),{game,a}=ctx;for(let i=0;i<2;i++)await game.move(put(game,a,'Grizzly Bears'),'graveyard');await cast(ctx,'Death Size');const horror=game.bf().find(c=>c.isToken);assert.ok(horror);assert.equal(horror.power,2);assert.equal(horror.toughness,2);
 });
 test(`v7 ${role}: group regeneration protects matching creatures only`,async()=>{
  const ctx=context(role),{game,a,b}=ctx,own=put(game,a,'Grizzly Bears'),enemy=put(game,b,'Grizzly Bears');await cast(ctx,'Regeneration');assert.equal(own.regenShield,1);assert.equal(enemy.regenShield||0,0);await game.destroy(own);assert.equal(own.zone,'battlefield');assert.equal(own.tapped,true);
 });
}
test('v7 optional continuation may be declined without undoing the mandatory draw',async()=>{
 const ctx=context('human'),{game,a}=ctx,decide=a.controller.decide.bind(a.controller),life=a.life,library=a.library.length;
 a.controller.decide=async(g,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='no')?'no':decide(g,q);await cast(ctx,'Optional Tail');assert.equal(a.life,life);assert.equal(a.library.length,library-1);
});
test('v7 failed mana payment does not tap any selected permanent',async()=>{
 const {game,a}=context('human'),source=put(game,a,'V7 Paid Tap Team'),elf=put(game,a,'Llanowar Elves');source.sick=elf.sick=false;
 const action=game.activatableList(a).find(row=>row.card===source);assert.ok(action);
 assert.equal(await game.activateAbility(a,action),false);assert.equal(source.tapped,false);assert.equal(elf.tapped,false);assert.equal(game.stack.length,0);assert.equal(a.pool.G,0);
});
test('v7 a proposed nonqualifying target loses the preview discount before payment',async()=>{
 const {game,a,b}=context('human'),qualifying=put(game,b,'Grizzly Bears'),chosen=put(game,b,'Shivan Dragon'),spell=put(game,a,'V7 Target Discount','hand');qualifying.tapped=true;a.pool.C=2;a.pool.G=1;
 const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.type==='chooseTargets'?[chosen]:decide(g,q);
 assert.equal(await game.castSpell(a,spell,{from:'hand'}),false);assert.equal(spell.zone,'hand');assert.equal(game.stack.length,0);assert.equal(a.pool.C,2);assert.equal(a.pool.G,1);
});
test('v7 target reduction applies to the total cost including kicker',async()=>{
 const {game,a,b}=context('human'),victim=put(game,b,'Grizzly Bears'),spell=put(game,a,'V7 Discount Kicker','hand');victim.tapped=true;a.pool.G=1;
 assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);assert.equal(game.stack.at(-1).kicked,true);assert.equal(a.pool.G,0);await settle(game);assert.equal(victim.zone,'graveyard');
});
test('v7 does not erase keyword rules or consume unmatched named-search suffixes',()=>{
 assert.equal(semanticClass(input('Unsafe','Power-up — {G/U}: Draw a card.')).semanticClass,undefined);
 assert.equal(semanticClass(input('Label','Keen Senses — When this creature enters, draw a card.')).semanticClass,'creature-template');
 assert.equal(semanticClass(input('Bad search','When this creature enters, search your library for a card named Elf, reveal it, exile it, put it into your hand, then shuffle.')).semanticClass,undefined);
 assert.equal(extensionTarget('target creature with mana value 2').comparison,'equal');
 assert.equal(extensionTarget('target creature with mana value 2 and ignore restrictions'),null);
});

test('v7 Adventure front and spell names resolve to the same deck entry',()=>{assert.equal(MTG.resolveDeckCardName('V7 Adventurer'),adventureSource.name);assert.equal(MTG.resolveDeckCardName('Test Gift'),adventureSource.name);});
test('v7 backup grants remain attached to the cloned recipient in local-AI simulation',async()=>{
 const ctx=context('human'),{game,a}=ctx,bear=put(game,a,'Grizzly Bears'),source=put(game,a,'V7 Backup Ability','hand');a.pool.C=1;a.pool.G=2;const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.type==='chooseTargets'?[bear]:decide(g,q);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);assert.equal(bear.cur.extraAbilities.length,1);
 const clone=MTG.cloneGameForAISimulation(game,970033);clone.recalc();const recipient=clone.bf().find(c=>c.iid===bear.iid),player=clone.players[0],hand=a.hand.length;assert.notEqual(recipient,bear);assert.equal(recipient.cur.extraAbilities.length,1);const action=clone.activatableList(player).find(row=>row.card===recipient);assert.ok(action);assert.equal(await clone.activateAbility(player,action),true);await settle(clone);assert.equal(recipient.zone,'graveyard');assert.equal(player.hand.length,hand+1);assert.equal(bear.zone,'battlefield');assert.equal(a.hand.length,hand);
});
test('v7 backup targeting itself adds counters without duplicating its printed activated ability',async()=>{
 const ctx=context('human'),{game,a}=ctx,source=put(game,a,'V7 Backup Ability','hand');a.pool.C=1;a.pool.G=2;const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.type==='chooseTargets'?[source]:decide(g,q);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);assert.equal(source.counters['+1/+1'],1);assert.equal(source.cur.extraAbilities.length,0);assert.equal(game.activatableList(a).filter(row=>row.card===source).length,1);
});
