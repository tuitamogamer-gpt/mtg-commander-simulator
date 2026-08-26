// ===== util.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});

// Presentation-only English localization. The rules engine deliberately keeps
// its stable internal prompts and logs; every player-facing string passes
// through this layer before it reaches the DOM. Longer phrases come first so
// card-specific prompts remain natural instead of becoming word-for-word text.
const uiWord = word => new RegExp(`(?<![\\p{L}\\p{N}_])${word}(?![\\p{L}\\p{N}_])`, 'gu');

const UI_ENGLISH_PRIORITY_RULES = [
  // High-visibility card labels and prompts that otherwise become awkward
  // mixed-language fragments after the generic word pass.
  [/Sačuvaj countere/g, 'Preserve counters'], [/sačuvaj countere/g, 'preserve counters'],
  [/Žrtvuje artefakt/g, 'Sacrifices an artifact'], [/žrtvuje artefakt/g, 'sacrifices an artifact'],
  [/Žrtvuješ/g, 'Sacrifice'], [/žrtvuješ/g, 'sacrifice'],
  [/ne untapuje se/g, 'does not untap'],
  [/Counter \(osim \{3\}\)/g, 'Counter unless its controller pays {3}'],
  [/Permanenti čije countere dupliraš/g, 'Permanents whose counters you double'],
  [/Permanent koji prima countere/g, 'Permanent that receives the counters'],
  [/Permanent sa kojeg pomjeraš countere/g, 'Permanent to move counters from'],
  [/Drugi permanent koji prima countere/g, 'Another permanent that receives the counters'],
  [/Magma Opus: tačno dva permanenta za tapovanje/g, 'Magma Opus: exactly two permanents to tap'],
  [/Žrtvuj drugu Zmiju: tapni permanent i ugasi aktivacije/g,
    'Sacrifice another Serpent: tap a permanent and prevent its activated abilities'],
  [/Tapni i ugasi aktivacije/g, 'Tap and prevent activated abilities'],
  [/Žrtvuj drugu Zmiju/g, 'Sacrifice another Serpent'],
  [/Nekreaturni artefakt/g, 'Noncreature artifact'],
  [/Ciljani igrač/g, 'Target player'], [/ciljani igrač/g, 'target player'],
  [/s vrha/g, 'from the top'], [/S vrha/g, 'From the top'],
  [/smiješ baciti/g, 'you may cast'], [/možeš baciti/g, 'you may cast'],
  [/Do jedno/g, 'Up to one'], [/do jedno/g, 'up to one'],
  [/Do dvije bazne zemlje/g, 'Up to two basic lands'], [/do dvije bazne zemlje/g, 'up to two basic lands'],
  [/Dva Plainsa u ruku/g, 'Two Plains cards to hand'],
  [/dva basica/g, 'two basic lands'], [/Dva basica/g, 'Two basic lands'],
  [/Druga legendarna permanenta/g, 'Another legendary permanent'],
  [/Counter na opremljeno/g, 'Counter on the equipped creature'],
  [/counter na opremljeno/g, 'counter on the equipped creature'],
  [/Counter za Humana/g, 'Counter for a Human'], [/counter za Humana/g, 'counter for a Human'],
  [/Karte za pogođene protivnike/g, 'Cards for opponents dealt damage'],
  [/Treasure za protivnički draw van njegovog poteza/g,
    "Treasure for an opponent's draw outside their turn"],
  [/Counter svakom drugom/g, 'Counter on each other creature'],
  [/Botovi blokiraju tvoj napad/g, 'Bots block your attack'],
  [/Prisilni napadi/g, 'Forced attacks'],
  [/Rasporedi četiri \+1\/\+1 countera/g, 'Distribute four +1/+1 counters'],
  [/Izaberi metu/g, 'Choose target'], [/izaberi metu/g, 'choose target'],
  [/Ne otkrivaj/g, "Don't reveal"], [/ne otkrivaj/g, "don't reveal"],
  [/Do one/g, 'Up to one'], [/do one/g, 'up to one'],
  [/COUNTEROVAN/g, 'COUNTERED'], [/Counterovan/g, 'Countered'], [/counterovan/g, 'countered'],
  [/egzilirano/g, 'exiled'], [/Egzilirano/g, 'Exiled'],
  [/IGRAJ ▶/g, 'PLAY ▶'],
  [/Permanenti indestructible/g, 'Permanents gain indestructible'],
  [/Humani napadaju/g, 'Humans attack'], [/Goblini napadaju/g, 'Goblins attack'],
  [/Ninje napadaju/g, 'Ninjas attack'], [/vojnika napadaju/g, 'Soldiers attack'],
  [/Humani \+1\/\+1/g, 'Humans get +1/+1'],
  [/Counteri svima/g, 'Counters on each creature'],
  [/Karta \+ counteri/g, 'Card + counters'],
  [/Isti counteri/g, 'The same counters'],
  [/Obara letača/g, 'Ground a flyer'],
  [/Karte i Treasuri/g, 'Cards and Treasures'],
  [/Wolf \+ dva Beasta/g, 'Wolf + two Beasts'],
  [/Odbaci do (\d+) u ruci/g, 'Discard down to $1 cards in hand'],
  [/\bDo (?=\d)/g, 'Up to '], [/\bdo (?=\d)/g, 'up to '],
  [uiWord('Žrtvuje'), 'Sacrifices'], [uiWord('žrtvuje'), 'sacrifices'],
  [uiWord('Sačuvaj'), 'Preserve'], [uiWord('sačuvaj'), 'preserve'],
  [uiWord('Dupliraj'), 'Double'], [uiWord('dupliraj'), 'double'],
  [uiWord('Ukradi'), 'Steal'], [uiWord('ukradi'), 'steal'],
  [uiWord('Skini'), 'Remove'], [uiWord('skini'), 'remove'],
  [uiWord('Tapni'), 'Tap'], [uiWord('tapni'), 'tap'],
  [uiWord('Counteri'), 'Counters'], [uiWord('counteri'), 'counters'], [uiWord('countere'), 'counters'], [uiWord('counteru'), 'counter'],
  [uiWord('Artefakata'), 'Artifacts'], [uiWord('artefakata'), 'artifacts'],
  [uiWord('Artefakti'), 'Artifacts'], [uiWord('artefakti'), 'artifacts'],
  [uiWord('Artefakte'), 'Artifacts'], [uiWord('artefakte'), 'artifacts'],
  [uiWord('Artefakta'), 'Artifact'], [uiWord('artefakta'), 'artifact'],
  [uiWord('Artefakt'), 'Artifact'], [uiWord('artefakt'), 'artifact'],
  [uiWord('Permanenti'), 'Permanents'], [uiWord('permanenti'), 'permanents'],
  [uiWord('Karte'), 'Cards'], [uiWord('karte'), 'cards'], [uiWord('Karta'), 'Card'], [uiWord('karta'), 'card'],
  [uiWord('Humani'), 'Humans'], [uiWord('Humana'), 'Human'], [uiWord('Elfovi'), 'Elves'], [uiWord('Ptice'), 'Birds'],
  [uiWord('Goblini'), 'Goblins'], [uiWord('Ninje'), 'Ninjas'], [uiWord('vojnika'), 'Soldiers'],
  [uiWord('napadaju'), 'attack'], [uiWord('baciti'), 'cast'], [uiWord('vrha'), 'top'], [uiWord('vrh'), 'top'],
  [uiWord('Dva'), 'Two'], [uiWord('dva'), 'two'], [uiWord('Dvije'), 'Two'], [uiWord('dvije'), 'two'],
  [uiWord('Tri'), 'Three'], [uiWord('tri'), 'three'], [uiWord('redom'), 'respectively'], [uiWord('tapovanje'), 'tapping'],
  [uiWord('Isti'), 'Same'], [uiWord('isti'), 'same'], [uiWord('Ciljani'), 'Target'], [uiWord('ciljani'), 'target'],
  [uiWord('Zmiju'), 'Serpent'], [/ugasi aktivacije/g, 'prevent activated abilities'],
  [uiWord('prima'), 'receives'], [uiWord('pomjeraš'), 'move'], [uiWord('kao'), 'as'], [uiWord('osim'), 'except'],
  [uiWord('mrtvaca'), 'a creature from a graveyard'], [uiWord('uz'), 'with'],
  [uiWord('opremljeno'), 'the equipped creature'], [uiWord('tapovani'), 'tapped'], [uiWord('letača'), 'flyer'],
  [uiWord('Treasuri'), 'Treasures'], [uiWord('bonusi'), 'bonuses'], [uiWord('legendarna'), 'legendary'],
  [uiWord('permanenta'), 'permanent'], [uiWord('zemlju'), 'land'], [/bazne zemlje/g, 'basic lands'],
  [/van njegovog poteza/g, 'outside their turn'], [/van poteza/g, 'outside the turn'],
  [/pogođene protivnike/g, 'opponents dealt damage'], [/protivnike/g, 'opponents'],
  [uiWord('Povratak'), 'Return'], [uiWord('povratak'), 'return'], [uiWord('primirje'), 'truce'],
  [uiWord('basica'), 'basic lands'], [uiWord('vuka'), 'Wolves'],
  [uiWord('zahtijeva'), 'requires'], [uiWord('rezultat'), 'result'],
  [uiWord('metu'), 'target'], [uiWord('cilja'), 'targets'], [uiWord('ga'), 'it'],
  [uiWord('blokera'), 'blocker'], [uiWord('Rasporedi'), 'Distribute'], [uiWord('četiri'), 'four'],
  [uiWord('otkrivena'), 'revealed'], [uiWord('otkriveno'), 'revealed'], [uiWord('otkrivaj'), 'reveal'],
  [uiWord('proliferira'), 'proliferates'], [uiWord('izabrano'), 'selected'], [uiWord('dodani'), 'added'],
  [uiWord('ukupno'), 'total'], [uiWord('modalni'), 'modal'], [uiWord('targeti'), 'targets'],
  [uiWord('trošak'), 'cost'], [uiWord('potpuno'), 'fully'], [uiWord('Kontriraj'), 'Counter'],
  [uiWord('Preuzmi'), 'Take control of'], [uiWord('preuzmi'), 'take control of'],
  [uiWord('goadovana'), 'goaded'], [uiWord('prema'), 'according to'],
  [uiWord('artefaktu'), 'artifact'], [/štiti od poraza/g, 'protects against losing'],
  [/TVOJ POTEZ/g, 'YOUR TURN'], [/Tvoja tabla je prazna/g, 'Your battlefield is empty'],
  [/Nema komandera na stolu/g, 'No commanders at the table'],
  [/Nema dovoljno mane/g, 'Not enough mana'], [/nema dovoljno mane/g, 'not enough mana'],
  [/nije tvoja main faza/g, 'it is not your main phase'],
  [/do kraja sljedećeg poteza/g, 'until the end of the next turn'],
  [/do kraja ovog poteza/g, 'until the end of this turn'], [/do kraja poteza/g, 'until end of turn'],
  [/na početku sljedećeg end stepa/g, 'at the beginning of the next end step'],
  [/na dno biblioteke/g, 'on the bottom of the library'], [/na vrh biblioteke/g, 'on top of the library'],
  [/iz svog groblja/g, 'from your graveyard'], [/iz tvog groblja/g, 'from your graveyard'],
  [/iz bilo kojeg groblja/g, 'from any graveyard'], [/iz groblja/g, 'from the graveyard'],
  [/u svoje groblje/g, 'into your graveyard'], [/u groblje/g, 'into the graveyard'],
  [/iz svoje biblioteke/g, 'from your library'], [/iz biblioteke/g, 'from the library'],
  [/u svoju biblioteku/g, 'into your library'], [/u biblioteku/g, 'into the library'],
  [/iz svoje ruke/g, 'from your hand'], [/iz ruke/g, 'from hand'], [/u svoju ruku/g, 'to your hand'], [/u ruku/g, 'to hand'],
  [/sa bojnog polja/g, 'from the battlefield'], [/na bojno polje/g, 'onto the battlefield'], [/na tablu/g, 'onto the battlefield'],
  [/bilo koji broj/g, 'any number of'], [/do jednog/g, 'up to one'], [/do jedne/g, 'up to one'],
  [/do dva/g, 'up to two'], [/do dvije/g, 'up to two'], [/do tri/g, 'up to three'],
  [/svaki protivnik/g, 'each opponent'], [/svakom protivniku/g, 'to each opponent'],
  [/svih protivnika/g, 'all opponents'], [/protivničkih/g, "opponents'"],
  [/ciljano stvorenje/g, 'target creature'], [/ciljani permanent/g, 'target permanent'],
  [/ciljanu kartu/g, 'target card'], [/ciljanog igrača/g, 'target player'],
  [/drugo stvorenje/g, 'another creature'], [/drugi permanent/g, 'another permanent'],
  [/bez mete/g, 'no target'], [/bez napada/g, 'no attacks'], [/bez blokova/g, 'no blocks'],
  [/prije mog poteza/g, 'before my turn'], [/prije tvog poteza/g, 'before your turn'],
  [/sljedećem prioritetu/g, 'the next priority window'], [/svakom priority prozoru/g, 'every priority window'],
  [/glavnoj fazi/g, 'main phase'], [/početna ruka/g, 'opening hand'], [/besplatan mulligan/g, 'free mulligan'],
  [/komandnu zonu/g, 'the command zone'], [/command zonu/g, 'the command zone'],
  [/komanderske štete/g, 'commander damage'], [/komander šteta/g, 'commander damage'],
  [/moguće štete/g, 'possible damage'], [/borbene štete/g, 'combat damage'], [/direktna šteta/g, 'direct damage'],
  [/gubitak života/g, 'life loss'], [/gubi život/g, 'loses life'], [/dobija život/g, 'gains life'],
  [/nanesi štetu jednaku snazi stvorenju/g, 'deal damage equal to power to a creature'],
  [/Tvoje target stvorenje za fight/g, 'Your target creature for the fight'],
  [/do četiri mete za podjelu 4 štete/g, 'choose up to four targets to divide 4 damage'],
  [/mora imati/g, 'must have'],
  [/različite snage/g, 'different powers'], [/različiti igrači/g, 'different players'],
  [/nije izabran nijedan/g, 'none selected'], [/najviše dva/g, 'no more than two'],
  [/ne može biti/g, 'cannot be'], [/nisu partneri/g, 'are not partners'], [/nije u ovom deku/g, 'is not in this deck'],
  [/izvan identiteta komandera/g, "outside the commanders' color identity"],
  [/igraš sa dva komandera/gi, 'you are playing two commanders'],
  [/izaberi tačne/g, 'choose the exact'], [/Prvo izaberi/g, 'First choose'], [/prvo izaberi/g, 'first choose'],
  [/Prokletstvo na igrača/g, 'Curse a player'], [/prokletstvo na igrača/g, 'curse a player'],
  [/Prokuni igrača/g, 'Curse a player'], [/prokuni igrača/g, 'curse a player'],
  [/ne može blokirati ovaj potez/g, "can't block this turn"],
];

const UI_ENGLISH_RULES = [
  [/AI Zmaj/g, 'AI Dragon'], [/AI Vuk/g, 'AI Wolf'], [/AI Gavran/g, 'AI Raven'],
  [/Igra počinje\. Redoslijed:/g, 'The game begins. Turn order:'],
  [/Odbaci do (\d+) u ruci/g, 'Discard down to $1 cards in hand'],
  [/Potez (\d+):/g, 'Turn $1:'],
  [/zadržava/g, 'keeps'],
  [/Sljedeći spell plaćaš životima/g, 'Pay life for the next spell'],
  [/Ciljaj/g, 'Target'], [/ciljaj/g, 'target'], [/Enchantaj/g, 'Enchant'], [/enchantaj/g, 'enchant'],
  [/Goaduj/g, 'Goad'], [/goaduj/g, 'goad'], [/Prokuni/g, 'Curse'], [/prokuni/g, 'curse'],
  [/više nisu/g, 'are no longer'],
  [/pokazati/g, 'reveal'], [/Heroja/g, 'Hero'],
  [/protivničkog/g, "opponent's"], [/protivničkom/g, "opponent's"], [/protivničkima/g, 'opponents'],
  [/čijem/g, 'whose'], [/čijoj/g, 'whose'], [/čiju/g, 'whose'], [/čija/g, 'whose'], [/čije/g, 'whose'],
  [/košta/g, 'costs'], [/Bilo koji/g, 'Any'], [/bilo koji/g, 'any'],
  [/Redoslijed replacement efekata/g, 'Order of replacement effects'],
  [/Rezolvira se:/g, 'Resolving:'], [/bez automatike/g, 'no automation'],
  [/umjesto mana cijene/g, 'instead of the mana cost'], [/dodatna cijena/g, 'additional cost'],
  [/nove mete/g, 'new targets'], [/Okreni licem gore/g, 'Turn face up'], [/licem nadolje/g, 'face down'],
  [/Limit poteza dostignut — kraj\./g, 'Turn limit reached — game over.'],
  [/U ruku/g, 'To hand'], [/u ruku/g, 'to hand'], [/na dno/g, 'to the bottom'], [/na vrhu/g, 'on top'],
  [/\bDa\b/g, 'Yes'], [/\bNe\b/g, 'No'], [/\bbesplatno\b/g, 'for free'], [/\bpreostalo\b/g, 'remaining'],
  [/\bRedoslijed\b/g, 'Order'], [/\befekata\b/g, 'effects'], [/\befekti\b/g, 'effects'], [/\befekat\b/g, 'effect'],
  [/\bcijena\b/g, 'cost'], [/\bcijene\b/g, 'cost'], [/\bcijenu\b/g, 'cost'],
  [/\bKopija\b/g, 'Copy'], [/\bkopija\b/g, 'copy'], [/\bkopije\b/g, 'copies'], [/\bkopiju\b/g, 'copy'],
  [/\bboja\b/g, 'color'], [/\bboje\b/g, 'colors'], [/\bmane\b/g, 'mana'],
  [/\botkriva\b/g, 'reveals'], [/\bpokazuje\b/g, 'reveals'], [/\bcrewovan\b/g, 'crewed'],
  [/\bTapuj\b/g, 'Tap'], [/\btapuj\b/g, 'tap'], [/\blandove\b/g, 'lands'], [/\bspellove\b/g, 'spells'],
  [/\bcounteri\b/g, 'counters'], [/\bcounterom\b/g, 'counter'], [/\bartefakta\b/g, 'artifact'], [/\bartefakti\b/g, 'artifacts'],
  [/\bStvorenje\b/g, 'Creature'], [/\bZemlja\b/g, 'Land'], [/\bzemlja\b/g, 'land'],
  [/\bDruga\b/g, 'Another'], [/\bDrugi\b/g, 'Another'], [/\bdruga\b/g, 'another'], [/\bdrugi\b/g, 'another'],
  [/\bnove\b/g, 'new'], [/\boba\b/g, 'both'], [/\bovog\b/g, 'this'], [/\bovaj\b/g, 'this'], [/\bnjega\b/g, 'it'],
  [/\bnjegovog\b/g, 'their'], [/\bnjegov\b/g, 'their'], [/\bkastera\b/g, 'caster'], [/\bsebe\b/g, 'itself'],
  [/\bsvom\b/g, 'your'], [/\bsvojim\b/g, 'your'], [/\bsvojih\b/g, 'your'], [/\bsvoju\b/g, 'your'],
  [/\bprvo\b/g, 'first'], [/\bonda\b/g, 'then'], [/\bzatim\b/g, 'then'], [/\bsamo\b/g, 'only'],
  [/\bmora\b/g, 'must'], [/\bmogu\b/g, 'can'], [/\bako\b/g, 'if'], [/\bdok\b/g, 'until'],
  [/\bostavi\b/g, 'leave'], [/\bostaje\b/g, 'stays'], [/\bide\b/g, 'goes'], [/\bsada\b/g, 'now'],
  [/\bnovu\b/g, 'new'], [/\bnova\b/g, 'new'], [/\bisto\b/g, 'same'], [/\bisti\b/g, 'same'],
  [/\bima\b/g, 'has'], [/\bimaju\b/g, 'have'], [/\bnije\b/g, 'is not'], [/\bnema\b/g, 'has no'],
  [uiWord('je'), 'is'], [uiWord('se'), ''], [uiWord('ne'), 'not'], [uiWord('da'), 'to'], [uiWord('ti'), 'you'],
  [uiWord('u'), 'in'], [uiWord('na'), 'on'], [uiWord('za'), 'for'], [uiWord('sa'), 'with'], [uiWord('od'), 'from'], [uiWord('iz'), 'from'],
  [uiWord('po'), 'per'], [uiWord('su'), 'are'],
  [/exilesno/g, 'exiled'], [/nanotlo/g, 'dealt'], [/nanotti/g, 'deal'], [/counterovan/g, 'countered'],
  [/\bblokiran\b/g, 'blocked'], [/\bspell-a\b/g, 'spell'], [/\bumjesto\b/g, 'instead of'],
  [/\bDA\b/g, 'YES'], [/\bNE\b/g, 'NO'], [/\bTi\b/g, 'You'], [/\bEgzil\b/g, 'Exile'], [/\bBoja\b/g, 'Color'],
  [/\bKopije\b/g, 'Copies'], [/\bStvorenja\b/g, 'Creatures'], [/\bHrpa\b/g, 'Pile'], [/\bVrh\b/g, 'Top'],
  [/\bSVE\b/g, 'ALL'], [/\bbroj\b/g, 'number'], [/\bmanje\b/g, 'less'], [/\bpodjela\b/g, 'division'],
  [/\bredoslijed\b/g, 'order'], [/\bizbor\b/g, 'choice'], [/\bmete\b/g, 'targets'], [/\btabli\b/g, 'battlefield'],
  [/\bruka\b/g, 'hand'], [/\bdnu\b/g, 'bottom'], [/\bprazna\b/g, 'empty'], [/\bpermanente\b/g, 'permanents'],
  [/\bpermanentsma\b/g, 'permanents'], [/\bobje polovine\b/g, 'both halves'], [/\bdrugu\b/g, 'another'],
  [/\blegalne\b/g, 'legal'], [/\bkopiji\b/g, 'copy'], [/\bcastovima\b/g, 'casts'], [/\bnajdublje\b/g, 'deepest'],
  [/\bsto\b/g, 'battlefield'], [/\btipu\b/g, 'type'], [/\bbojama\b/g, 'colors'], [/\btvojih\b/g, 'your'],
  [/\bsvoj\b/g, 'your'], [/\btvog\b/g, 'your'], [/\bkog\b/g, 'which'], [/\bnapad\b/g, 'attack'],
  [/\bnapadati\b/g, 'attack'], [/\bmoraju\b/g, 'must'], [/\bpoweru\b/g, 'power'], [/\bprivremeni\b/g, 'temporary'],
  [/\bdozvoljava\b/g, 'allows'], [/\bigranje\b/g, 'playing'], [uiWord('igra'), 'plays'], [/\bvuku\b/g, 'draw'],
  [/\bneblokabilni\b/g, "can't be blocked"], [/\bpostaje\b/g, 'becomes'], [/\bpa\b/g, 'then'],
  [/\bnisu\b/g, 'are not'], [/\bblokove\b/g, 'blockers'],
  [/možeš/g, 'you may'], [/Možeš/g, 'You may'], [/Igrač/g, 'Player'], [/Traži/g, 'Searches for'],
  [/uništenje/g, 'destruction'], [/naći/g, 'search for'], [/Vijeće/g, 'Council'], [/ciljaš/g, 'target'],
  [/vučenje/g, 'draw'], [/Različite/g, 'Different'], [/Do četiri/g, 'Up to four'],
  [/šuti/g, 'stay silent'], [/cinkaj/g, 'rat out'], [/preživljava/g, 'survives'], [/sačuvaj/g, 'keep'],
  [/Žrtva/g, 'Sacrifice'], [/Štit/g, 'Shield'], [/zajedničkom/g, 'shared'],
  [/najveću/g, 'greatest'], [/čuva/g, 'protects'], [/Najveća/g, 'Greatest'], [/najveća/g, 'greatest'], [/kućno/g, 'house'],
  [/proizvodiš/g, 'produce'], [/razriješio/g, 'resolved'], [/Treća/g, 'Third'], [/treća/g, 'third'],
  [/zamiješan/g, 'shuffled'], [/Otključana/g, 'Unlocked'], [/mač/g, 'sword'], [/OSUMNJIČEN/g, 'SUSPECTED'],
  [/plaćam/g, 'pay'], [/vučete/g, 'draw'], [/dosadašnjih/g, 'previous'], [/transformiše/g, 'transforms'],
  [/bilo čemu/g, 'anything'], [/Bacač/g, 'Fighter'], [/Čija/g, 'Whose'], [/Širi/g, 'Spread'],
  [/tuđi/g, "another player's"], [/zločin/g, 'crime'], [/trećinu/g, 'a third'], [/oslobađa/g, 'releases'],
  [/otišao/g, 'gone'], [/daš/g, 'give'], [/možda/g, 'maybe'], [/niču/g, 'appear'], [/spasiš/g, 'save'],
  [/\bSvako\b/g, 'Each'], [/\bJedno\b/g, 'One'], [/\bTvoje\b/g, 'Your'], [/\btvoje\b/g, 'your'], [/\bDrugo\b/g, 'Another'], [/\bdrugo\b/g, 'another'],
  [/\bdrugog\b/g, 'another'], [/\bbira(?!š)\b/g, 'chooses'], [/\bmelje\b/g, 'mills'], [/\bkontroloru\b/g, 'its controller'],
  [/\bVillaina\b/g, 'Villain'], [/\bconnivea\b/g, 'connives'],
  [/tuđa/g, "another player's"], [/uništeni/g, 'destroyed'], [/uništena/g, 'destroyed'], [/špilu/g, 'deck'],
  [/odbačenom/g, 'discarded'], [/duže/g, 'longer'], [/exileš/g, 'exile'], [/kažnjava/g, 'punishes'], [/veže/g, 'attaches'],
  [/Udvostruči/g, 'Double'], [/letače/g, 'flyers'], [/uskrsnuće/g, 'resurrection'], [/pojačanje/g, 'boost'],
  [/zečevi/g, 'Rabbits'], [/vraćeni/g, 'returned'], [/protivnička/g, "opponent's"], [/stršljena/g, 'Hornets'],
  [/Život/g, 'Life'], [/Zaključaj/g, 'Lock'], [/zaključan/g, 'locked'],
  [/Čiju biblioteku otkrivaš\?/g, 'Whose library do you reveal?'], [/otkrivaš/g, 'reveal'], [/više/g, 'more'],
  [/čistka/g, 'purge'], [/pokaži/g, 'show'], [/počinje/g, 'begins'], [/moguće/g, 'possible'],
  [/koliko karata vučeš\?/g, 'how many cards do you draw?'],
  [/Protivnik čiju biblioteku egziliraš/g, 'Opponent whose library you exile'],
  [/šta biraš\?/g, 'what do you choose?'], [/bilo koji broj/g, 'any number of'],
  [/mora imati/g, 'must have'], [/različitu/g, 'different'],
  [/Napadaču/g, 'Attacker'], [/napadaču/g, 'attacker'], [/napadača/g, 'attacker'], [/napadači/g, 'attackers'],
  [/Akcija se ne može mapirati u simulirani snapshot\./g, 'The action cannot be mapped to the simulated snapshot.'],
  [/Greška u igri:/g, 'Game error:'],
  [/Nevažeći izbor komandera/g, 'Invalid commander selection'],
  [/Previše okidača u jednom potezu — sigurnosni ventil preskače ostatak\./g, 'Too many triggers in one turn — the safety limit skips the rest.'],
  [/mana nije plaćena/g, 'mana was not paid'],
  [/efekat rješavaš ručno \(sudija-panel\)/g, 'resolve this effect manually (Judge panel)'],
  [/Ne može biti blokiran/g, 'Cannot be blocked'], [/ne može biti blokiran/g, 'cannot be blocked'],
  [/vučeš/g, 'draw'], [/vući/g, 'draw'], [/bacaš/g, 'cast'],
  [/odbacuješ/g, 'discard'], [/plaćaš/g, 'pay'], [/egziliraš/g, 'exile'],
  [/stavljaš/g, 'put'], [/žrtvuješ/g, 'sacrifice'], [/napadaš/g, 'attack'],
  [/kontrolišeš/g, 'you control'], [/\bkontroliše\b/g, 'controls'], [/dupliraš/g, 'double'],
  [/Šteta/g, 'Damage'], [/šteta/g, 'damage'], [/štete/g, 'damage'], [/štetu/g, 'damage'],
  [/\bMože\b/g, 'Can'], [/\bmože\b/g, 'can'], [/\bNađi\b/g, 'Search for'], [/\bnađi\b/g, 'search for'],
  [/\btraži\b/g, 'searches for'], [/\bsprječava\b/g, 'prevents'],
  [/\bspriječena\b/g, 'prevented'], [/\bspriječenu\b/g, 'prevented'], [/\bspriječeno\b/g, 'prevented'],
  [/\bzaštita\b/g, 'protection'], [/\bZaštiti\b/g, 'Protect'], [/\bzaštiti\b/g, 'protect'], [/štit/g, 'shield'],
  [/uklanjaš/g, 'remove'], [/premještaš/g, 'move'], [/pomjeraš/g, 'move'],
  [/\bZadrži\b/g, 'Keep'], [/\bzadrži\b/g, 'keep'], [/\bPOBJEĐUJE\b/g, 'WINS'], [/pobjeđuješ/g, 'you win'], [/\bpobjeđuje\b/g, 'wins'],
  [/\bregeneriše\b/g, 'regenerates'], [/\bRegeneriši\b/g, 'Regenerate'], [/\bregeneriši\b/g, 'regenerate'],
  [/\bokidača\b/g, 'triggers'], [/\bpreskače\b/g, 'skips'], [/\bciljaš\b/g, 'target'], [/\btakođe\b/g, 'also'],
  [/Čije/g, 'Whose'], [/čije/g, 'whose'], [/čija/g, 'whose'], [/čiju/g, 'whose'], [/čijoj/g, 'whose'], [/čijem/g, 'whose'],
  [/\bČetiri\b/g, 'Four'], [/\bčetiri\b/g, 'four'], [/Šest/g, 'Six'], [/šest/g, 'six'],
  [/\bVraćen\b/g, 'Returned'], [/\bvraćen\b/g, 'returned'], [/\bvraćena\b/g, 'returned'], [/\bvraćeno\b/g, 'returned'],
  [/\bmiješa\b/g, 'shuffles'], [/\bPromiješaj\b/g, 'Shuffle'], [/\bpromiješaj\b/g, 'shuffle'],
  [/\bodbačeno\b/g, 'discarded'], [/\bodbačena\b/g, 'discarded'], [/\bodbačenu\b/g, 'discarded'],
  [/\bSljedeći\b/g, 'Next'], [/\bSljedeća\b/g, 'Next'], [/\bsljedeću\b/g, 'next'],
  [/\buđe\b/g, 'enters'], [/\buđu\b/g, 'enter'], [/želiš/g, 'want'], [/\bzavrši\b/g, 'finish'],
  [/\bništa\b/g, 'nothing'], [/smiješ/g, 'may'], [/šta/g, 'what'], [/\bTačno\b/g, 'Exactly'],
  [/\bkošta\b/g, 'costs'], [/\bplaćena\b/g, 'paid'], [/\bplaćen\b/g, 'paid'], [/\bproizvodiš\b/g, 'produce'],
  [/rješavaš/g, 'resolve'], [/\bograničenje\b/g, 'restriction'], [/žrtvovan/g, 'sacrificed'], [/primjenjuješ/g, 'apply'],
  [/\bpogođene\b/g, 'damaged'], [/\bzakačiti\b/g, 'attach'], [/\bmačke\b/g, 'Cats'],
  [/\bOtključaj\b/g, 'Unlock'], [/\botključaj\b/g, 'unlock'], [/\botključana\b/g, 'unlocked'],
  [/\bOsumnjiči\b/g, 'Suspect'], [/\bosumnjiči\b/g, 'suspect'], [/\bosumnjičen\b/g, 'suspected'], [/\bosumnjičena\b/g, 'suspected'], [/\bosumnjičenih\b/g, 'suspected'],
  [/\budvostruči\b/g, 'double'], [/ponoć/g, 'midnight'], [/\bvršnu\b/g, 'top'], [/\bhrpu\b/g, 'pile'], [/šalje/g, 'sends'],
  [/\bKo\b/g, 'Who'], [/\bKome\b/g, 'Who takes'], [/\bKoji\b/g, 'Which'], [/\bKoju\b/g, 'Which'], [/\bKojeg\b/g, 'Which'],
  [/\bkoji\b/g, 'which'], [/\bkoju\b/g, 'which'], [/\bkojeg\b/g, 'which'], [/\bkoja\b/g, 'which'],
  [/\bKoliko\b/g, 'How many'], [/\bkoliko\b/g, 'how many'], [/biraš/g, 'choose'],
  [/Napadač/g, 'Attacker'], [/napadač/g, 'attacker'], [/\bbloker\b/g, 'blocker'],
  [/Pobjeđuješ/g, 'You win'], [/pobjeđuješ/g, 'you win'], [/gubiš/g, 'lose'], [/dobijaš/g, 'get'],
  [/životima/g, 'life'], [/životom/g, 'life'], [/\bživotu\b/g, 'life'], [/Životi/g, 'Life'], [/životi/g, 'life'],
  [/Protivničko/g, "Opponent's"], [/protivničko/g, "opponent's"], [/Protivnički/g, "Opponent's"], [/protivnički/g, "opponent's"],
  [/protivničkog/g, "opponent's"], [/protivničkom/g, "opponent's"], [/protivničkima/g, 'opponents'],
  [/\bProtivnik\b/g, 'Opponent'], [/\bProtivnici\b/g, 'Opponents'],
  [/\bnajjače\b/g, 'strongest'], [/\bnajveće\b/g, 'greatest'], [/\bsnage\b/g, 'power'], [/\bsnagu\b/g, 'power'],
  [/\bruci\b/g, 'hand'], [/\bruke\b/g, 'hands'], [/\bvlasnika\b/g, 'owner'], [/\bsvog\b/g, 'your'], [/\bsvoje\b/g, 'your'],
  [/\bsve\b/g, 'all'], [/\bSva\b/g, 'All'], [/\bsva\b/g, 'all'], [/\bostali\b/g, 'other'], [/\bostale\b/g, 'other'],
  [/\btokene\b/g, 'tokens'], [/\btokena\b/g, 'tokens'], [/\btokeni\b/g, 'tokens'], [/\bvrata\b/g, 'door'], [/\bopremu\b/g, 'Equipment'],
  [/\bOtkrij\b/g, 'Reveal'], [/\botkrij\b/g, 'reveal'], [/\bmanu\b/g, 'mana'], [/brojiš/g, 'count'], [/praviš/g, 'create'],
  [/\bgubiš\b/g, 'lose'], [/\bjednu\b/g, 'one'], [/\bjedan\b/g, 'one'], [/\bjedno\b/g, 'one'],
  [/\bsvako\b/g, 'each'], [/\bsvima\b/g, 'everyone'], [/\bmeni\b/g, 'me'], [/\btebi\b/g, 'you'], [/\btuđem\b/g, "another player's"],
  [/\bglobalna\b/g, 'global'], [/\bpotvrđena\b/g, 'confirmed'], [/\bprimijenjena\b/g, 'applied'], [/\brežim\b/g, 'mode'], [/\braspodjela\b/g, 'distribution'],
  [/\btreći\b/g, 'third'], [/\bzavršen\b/g, 'completed'], [/razriješeni/g, 'resolved'], [/\bprovjera\b/g, 'check'],
  [/\bloš\b/g, 'bad'], [/\bodbijen\b/g, 'declined'], [/\bprihvaćen\b/g, 'accepted'], [/\bsmrt\b/g, 'death'], [/\bbroju\b/g, 'number'],
  [/(\s)i(\s)/g, '$1and$2'], [/(\s)ili(\s)/g, '$1or$2'], [/(\s)ali(\s)/g, '$1but$2'],
  [/TVOJ POTEZ/g, 'YOUR TURN'], [/Tvoja tabla je prazna/g, 'Your battlefield is empty'],
  [/Nema komandera na stolu/g, 'No commanders at the table'],
  [/Nema dovoljno mane/g, 'Not enough mana'], [/nema dovoljno mane/g, 'not enough mana'],
  [/nije tvoja main faza/g, 'it is not your main phase'],
  [/do kraja sljedećeg poteza/g, 'until the end of the next turn'],
  [/do kraja ovog poteza/g, 'until the end of this turn'], [/do kraja poteza/g, 'until end of turn'],
  [/na početku sljedećeg end stepa/g, 'at the beginning of the next end step'],
  [/na dno biblioteke/g, 'on the bottom of the library'], [/na vrh biblioteke/g, 'on top of the library'],
  [/iz svog groblja/g, 'from your graveyard'], [/iz tvog groblja/g, 'from your graveyard'],
  [/iz bilo kojeg groblja/g, 'from any graveyard'], [/iz groblja/g, 'from the graveyard'],
  [/u svoje groblje/g, 'into your graveyard'], [/u groblje/g, 'into the graveyard'],
  [/iz svoje biblioteke/g, 'from your library'], [/iz biblioteke/g, 'from the library'],
  [/u svoju biblioteku/g, 'into your library'], [/u biblioteku/g, 'into the library'],
  [/iz svoje ruke/g, 'from your hand'], [/iz ruke/g, 'from hand'], [/u svoju ruku/g, 'to your hand'], [/u ruku/g, 'to hand'],
  [/sa bojnog polja/g, 'from the battlefield'], [/na bojno polje/g, 'onto the battlefield'], [/na tablu/g, 'onto the battlefield'],
  [/bilo koji broj/g, 'any number of'], [/do jednog/g, 'up to one'], [/do jedne/g, 'up to one'], [/do dva/g, 'up to two'], [/do dvije/g, 'up to two'], [/do tri/g, 'up to three'],
  [/svaki protivnik/g, 'each opponent'], [/svakom protivniku/g, 'to each opponent'], [/svih protivnika/g, 'all opponents'], [/protivničkih/g, "opponents'"],
  [/ciljano stvorenje/g, 'target creature'], [/ciljani permanent/g, 'target permanent'], [/ciljanu kartu/g, 'target card'], [/ciljanog igrača/g, 'target player'],
  [/drugo stvorenje/g, 'another creature'], [/drugi permanent/g, 'another permanent'],
  [/bez mete/g, 'no target'], [/bez napada/g, 'no attacks'], [/bez blokova/g, 'no blocks'],
  [/prije mog poteza/g, 'before my turn'], [/prije tvog poteza/g, 'before your turn'],
  [/sljedećem prioritetu/g, 'the next priority window'], [/svakom priority prozoru/g, 'every priority window'],
  [/glavnoj fazi/g, 'main phase'], [/početna ruka/g, 'opening hand'], [/besplatan mulligan/g, 'free mulligan'],
  [/komandnu zonu/g, 'the command zone'], [/command zonu/g, 'the command zone'],
  [/komanderske štete/g, 'commander damage'], [/komander šteta/g, 'commander damage'],
  [/moguće štete/g, 'possible damage'], [/borbene štete/g, 'combat damage'], [/direktna šteta/g, 'direct damage'],
  [/gubitak života/g, 'life loss'], [/gubi život/g, 'loses life'], [/dobija život/g, 'gains life'],
  [/različite snage/g, 'different powers'], [/različiti igrači/g, 'different players'],
  [/nasumične/g, 'random'], [/nasumični/g, 'random'], [/nasumičan/g, 'random'], [/nasumično/g, 'randomly'],
  [/nije izabran nijedan/g, 'none selected'], [/najviše dva/g, 'no more than two'],
  [/ne može biti/g, 'cannot be'], [/nisu partneri/g, 'are not partners'], [/nije u ovom deku/g, 'is not in this deck'],
  [/izvan identiteta komandera/g, "outside the commanders' color identity"],
  [/igraš sa dva komandera/gi, 'you are playing two commanders'],
  [/izaberi tačne/g, 'choose the exact'], [/izabrani/g, 'selected'], [/izabrana/g, 'selected'], [/izabrane/g, 'selected'],
  [/Prvo izaberi/g, 'First choose'], [/prvo izaberi/g, 'first choose'],
  [/Izaberi/g, 'Choose'], [/izaberi/g, 'choose'], [/Odaberi/g, 'Choose'], [/odaberi/g, 'choose'],
  [/Potvrdi/g, 'Confirm'], [/potvrdi/g, 'confirm'], [/Otkaži/g, 'Cancel'], [/otkaži/g, 'cancel'],
  [/Zatvori/g, 'Close'], [/zatvori/g, 'close'], [/Nastavi/g, 'Continue'], [/nastavi/g, 'continue'],
  [/Preskoči/g, 'Skip'], [/preskoči/g, 'skip'], [/Promijeni/g, 'Change'], [/promijeni/g, 'change'],
  [/\bPovuci\b/g, 'Draw'], [/\bpovuci\b/g, 'draw'], [/\bVuci\b/g, 'Draw'], [/\bvuci\b/g, 'draw'], [/\bvuče\b/g, 'draws'],
  [/\bBaci\b/g, 'Cast'], [/\bbaci\b/g, 'cast'], [/\bbaca\b/g, 'casts'], [/odigraj/g, 'play'], [/igra stilom/g, 'plays with style'],
  [/Igraj/g, 'Play'], [/igraj/g, 'play'], [/Vrati/g, 'Return'], [/vrati/g, 'return'], [/vraćaš/g, 'return'], [/vraća/g, 'returns'],
  [/Uništi/g, 'Destroy'], [/uništi/g, 'destroy'], [/uništeno/g, 'destroyed'],
  [/Egzilaj/g, 'Exile'], [/egzilaj/g, 'exile'], [/egzilira/g, 'exiles'], [/egziliran/g, 'exiled'],
  [/Žrtvuj/g, 'Sacrifice'], [/žrtvuj/g, 'sacrifice'], [/žrtvuje/g, 'sacrifices'],
  [/\bOdbaci\b/g, 'Discard'], [/\bodbaci\b/g, 'discard'], [/\bodbacuje\b/g, 'discards'],
  [/\bPlati\b/g, 'Pay'], [/\bplati\b/g, 'pay'], [/\bplaća\b/g, 'pays'], [/\bNapravi\b/g, 'Create'], [/\bnapravi\b/g, 'create'],
  [/\bStavi\b/g, 'Put'], [/\bstavi\b/g, 'put'], [/\bstavlja\b/g, 'puts'], [/\bDodaj\b/g, 'Add'], [/\bdodaj\b/g, 'add'],
  [/Ukloni/g, 'Remove'], [/ukloni/g, 'remove'], [/Premjesti/g, 'Move'], [/premjesti/g, 'move'],
  [/Kopiraj/g, 'Copy'], [/kopiraj/g, 'copy'], [/Prepolovi/g, 'Halve'], [/prepolovi/g, 'halve'],
  [/Spriječi/g, 'Prevent'], [/spriječi/g, 'prevent'], [/Podijeli/g, 'Divide'], [/podijeli/g, 'divide'],
  [/\bNapadni\b/g, 'Attack'], [/\bnapadni\b/g, 'attack'], [/\bnapadači\b/g, 'attackers'], [/\bnapadača\b/g, 'attacker'], [/\bnapadaču\b/g, 'attacker'], [/\bnapadač\b/g, 'attacker'], [/\bnapada\b/g, 'attacks'],
  [/blokirati/g, 'be blocked'], [/blokiraš/g, 'block'], [/\bBlokiraj\b/g, 'Block'], [/\bblokiraj\b/g, 'block'], [/\bblokira\b/g, 'blocks'], [/blokeri/g, 'blockers'], [/blokova/g, 'blocks'],
  [/igraču/g, 'player'], [/igrača/g, 'player'], [/igrači/g, 'players'], [/igrač/g, 'player'],
  [/protivniku/g, 'opponent'], [/protivnika/g, 'opponent'], [/protivnici/g, 'opponents'], [/protivnik/g, 'opponent'],
  [/stvorenjima/g, 'creatures'], [/stvorenja/g, 'creatures'], [/stvorenje/g, 'creature'],
  [/permanenata/g, 'permanents'], [/permanenti/g, 'permanents'],
  [/karata/g, 'cards'], [/karte/g, 'cards'], [/kartu/g, 'card'], [/karta/g, 'card'],
  [/biblioteke/g, 'library'], [/biblioteku/g, 'library'], [/biblioteka/g, 'library'],
  [/groblja/g, 'graveyard'], [/groblje/g, 'graveyard'], [/egzila/g, 'exile'], [/egzil/g, 'exile'],
  [/života/g, 'life'], [/život/g, 'life'], [/štete/g, 'damage'], [/šteta/g, 'damage'],
  [/poteza/g, 'turns'], [/potezu/g, 'turn'], [/potez/g, 'turn'], [/koraka/g, 'steps'], [/korak/g, 'step'],
  [/komandera/g, 'commanders'], [/komanderi/g, 'commanders'], [/komander/g, 'commander'], [/deku/g, 'deck'], [/decku/g, 'deck'],
  [/countera/g, 'counters'], [/izvora/g, 'sources'], [/izvorom/g, 'source'], [/\bMeta\b/g, 'Target'], [/\bmeta\b/g, 'target'],
  [/Svi/g, 'All'], [/svi/g, 'all'], [/Svaki/g, 'Each'], [/svaki/g, 'each'], [/Tvoja/g, 'Your'], [/tvoja/g, 'your'], [/\bTvoj\b/g, 'Your'], [/\btvoj\b/g, 'your'],
  [/Možeš/g, 'You may'], [/možeš/g, 'you may'], [/Nemaš/g, 'You have no'], [/nemaš/g, 'you have no'], [/Imaš/g, 'You have'], [/imaš/g, 'you have'],
  [/Nema/g, 'No'], [/nema/g, 'no'], [/Nije/g, 'Not'], [/nije/g, 'not'], [/Još/g, 'Still'], [/još/g, 'still'],
  [/gubi/g, 'loses'], [/dobija/g, 'gets'], [/dobije/g, 'gets'], [/razriješen/g, 'resolved'], [/razrješava/g, 'resolves'],
  [/sljedeći/g, 'next'], [/sljedeća/g, 'next'], [/sljedećeg/g, 'next'], [/zadnja/g, 'last'], [/kraja/g, 'end'],
  [/sposobnost/g, 'ability'], [/sposobnosti/g, 'abilities'], [/odluke/g, 'decisions'], [/odluka/g, 'decision'],
  [/Prazno/g, 'Empty'], [/prazno/g, 'empty'], [/ručno/g, 'manually'], [/\bautomatsk(?:i|a|o|e|ih)?\b/g, 'automatic'],
  [/tačno/g, 'exactly'], [/različitih/g, 'different'], [/različite/g, 'different'], [/različita/g, 'different'], [/različiti/g, 'different'],
  [/dodatnih/g, 'additional'], [/dodatne/g, 'additional'], [/dodatna/g, 'additional'], [/dodatni/g, 'additional'],
  [/vlastitih/g, 'own'], [/vlastite/g, 'own'], [/vlastita/g, 'own'], [/vlastiti/g, 'own'],
  [/\bTEBE\b/g, 'YOU'], [/\bTVOJ\b/g, 'YOUR'], [/\bTI\b/g, 'YOU'],
];

MTG.uiText = function (value) {
  let text = String(value ?? '');
  for (const [pattern, replacement] of UI_ENGLISH_PRIORITY_RULES) text = text.replace(pattern, replacement);
  for (const [pattern, replacement] of UI_ENGLISH_RULES) text = text.replace(pattern, replacement);
  return text;
};

MTG.localizeTree = function (root) {
  if (!root || typeof document === 'undefined') return root;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (node.parentElement && !['SCRIPT', 'STYLE'].includes(node.parentElement.tagName)) {
      const translated = MTG.uiText(node.nodeValue);
      if (translated !== node.nodeValue) node.nodeValue = translated;
    }
  }
  const elements = root.nodeType === 1 ? [root, ...root.querySelectorAll('*')] : [...root.querySelectorAll('*')];
  for (const element of elements) {
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      if (element.hasAttribute(attr)) element.setAttribute(attr, MTG.uiText(element.getAttribute(attr)));
    }
  }
  return root;
};

// ---------- RNG (seeded) ----------
MTG.mulberry32 = function (seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

MTG.shuffle = function (arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// ---------- Mana ----------
// Cost representation: {generic:N, X:count, pips:[['B'],['G'],['B','R'],...], life:N (phyrexian alt)}
const COLORS = ['W', 'U', 'B', 'R', 'G'];
MTG.COLORS = COLORS;

MTG.parseCost = function (str) {
  // "{2}{B}{G}" / "{X}{R}{R}" / "{BR}{BR}" hybrid / "{UP}" phyrexian
  const cost = { generic: 0, x: 0, pips: [] };
  if (!str) return cost;
  const re = /\{([^}]+)\}/g; let m;
  while ((m = re.exec(str))) {
    const t = m[1];
    if (/^\d+$/.test(t)) cost.generic += parseInt(t, 10);
    else if (t === 'X') cost.x++;
    else if (t.length === 1 && COLORS.includes(t)) cost.pips.push([t]);
    else if (t === 'C') cost.pips.push(['C']);
    else if (t.length === 2 && t[1] === 'P') cost.pips.push([t[0], 'PHY']); // phyrexian
    else if (t.length === 2 && COLORS.includes(t[0]) && COLORS.includes(t[1])) cost.pips.push([t[0], t[1]]); // hybrid
    else if (/^2\/[WUBRG]$/.test(t)) cost.pips.push([t[2], 'TWO']);
    else if (t.includes('/')) {
      const parts = t.split('/');
      if (parts.includes('P')) cost.pips.push([parts[0], 'PHY']);
      else cost.pips.push(parts);
    }
  }
  return cost;
};

MTG.mv = function (str, xVal) {
  const c = MTG.parseCost(str);
  return c.generic + c.pips.length + (xVal || 0) * c.x;
};

MTG.costStr = function (cost, xVal) {
  const parts = [];
  const gen = cost.generic + (xVal !== undefined && cost.x ? 0 : 0);
  if (cost.x) parts.push(xVal !== undefined ? `X=${xVal}` : '{X}'.repeat(cost.x));
  if (cost.generic) parts.push('{' + cost.generic + '}');
  for (const p of cost.pips) {
    if (p[1] === 'PHY') parts.push('{' + p[0] + '/P}');
    else parts.push('{' + p.join('/') + '}');
  }
  if (!parts.length) return '{0}';
  return parts.join('');
};

MTG.colorsOfCost = function (str) {
  const set = new Set();
  const c = MTG.parseCost(str);
  for (const p of c.pips) for (const opt of p) if (COLORS.includes(opt)) set.add(opt);
  return [...set];
};

// count colored pips for devotion: pips whose options intersect given colors
MTG.devotionPips = function (str, colors) {
  if (!str) return 0;
  let n = 0;
  const c = MTG.parseCost(str);
  for (const p of c.pips) if (p.some(o => colors.includes(o))) n++;
  return n;
};

MTG.deepClone = function (o) { return JSON.parse(JSON.stringify(o)); };

MTG.plural = function (n, s, p) { return n === 1 ? s : (p || s + 's'); };

// Player seats use the display name "You" for the human. Keep verbs in the
// first person for that seat while preserving third-person grammar for bots.
MTG.playerVerb = function (player, firstPerson, thirdPerson) {
  return `${player.name} ${player.name === 'You' ? firstPerson : thirdPerson}`;
};

MTG.cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };

// 1x1 providna slika — kad Scryfall art ne stigne, ubacimo je da browser
// ne crta ikonu "slomljena slika"; CSS ispod prikaže poleđinu karte.
MTG.BLANK_PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
// mana simbol nije stigao → vrati se na stari obojeni pip
MTG.symFail = function (img, col, fg, code) {
  if (!img || img._failed || !img.parentNode) return;
  img._failed = true;
  const s = document.createElement('span');
  s.className = 'pip';
  s.style.background = col; s.style.color = fg;
  s.textContent = code;
  img.parentNode.replaceChild(s, img);
};
MTG.imgFail = function (img, cls) {
  if (!img || img._failed) return;
  const requested = String(img.getAttribute && img.getAttribute('src') || img.src || '');
  if (!img._apiFallback && MTG.CARD_IMAGE_API_BASE && requested.startsWith(MTG.CARD_IMAGE_API_BASE)) {
    img._apiFallback = true;
    img.removeAttribute('srcset');
    img.src = MTG.CARD_IMAGE_PLACEHOLDER;
    return;
  }
  img._failed = true;
  img.classList.add(cls || 'imgfail');
  img.removeAttribute('srcset');
  img.src = MTG.BLANK_PX;
};
