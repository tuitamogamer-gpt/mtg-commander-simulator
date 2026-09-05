const esc=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const SELF=card=>'(?:[Tt]his (?:creature|artifact|enchantment|permanent)|'+[...new Set([card.name,card.name.split(/,| the /)[0]])].map(esc).join('|')+')';
const op=fields=>({kind:'entry-counters-v8',...fields,contract:'entry-counter-replacement'});
const counter=(kind,n=1)=>({kind,n});
export function extensionLine(card,line,h){
 const self=SELF(card);let m;
 if(line==='Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control.')return {kind:'entry-counter-bonus-v8',filter:'angel',amount:'angels-controlled',other:true,contract:'entry-counter-replacement'};
 if(line==='Each creature you control enters with an additional +1/+1 counter on it for each land that entered the battlefield under your control this turn.')return {kind:'entry-counter-bonus-v8',filter:'creature',amount:'lands-entered',other:false,contract:'entry-counter-replacement'};
 if(line==='Each other Vehicle and creature you control enters with an additional +1/+1 counter on it if its mana value is 4 or less. Otherwise, it enters with three additional +1/+1 counters on it.')return {kind:'entry-counter-bonus-v8',filter:'vehicle-or-creature',amount:'mana-value-four',other:true,contract:'entry-counter-replacement'};
 if((m=new RegExp('^'+self+' enters with (?:a|an) (divinity|indestructible) counter on it if you cast it from your hand\\.$').exec(line)))return op({condition:'cast-from-your-hand',counters:[counter(m[1])]});
 if((m=new RegExp('^'+self+' enters with a (\\+1/\\+1|crystal|charge) counter on it for each (color of mana spent to cast it|mana spent to cast it|other spell cast this turn)\\.$').exec(line)))return op({counters:[counter(m[1],{value:{'color of mana spent to cast it':'mana-colors','mana spent to cast it':'mana-spent','other spell cast this turn':'other-spells'}[m[2]]})]});
 if(new RegExp('^'+self+' enters with two \\+1/\\+1 counters on it for each creature that convoked it\\.$').test(line))return op({counters:[counter('+1/+1',{value:'convoked',multiply:2})]});
 if(new RegExp('^'+self+' enters with two \\+1/\\+1 counters on it unless two or more colors of mana were spent to cast it\\.$').test(line))return op({condition:'at-most-one-mana-color',counters:[counter('+1/+1',2)]});
 if(new RegExp('^'+self+' enters with X \\+1/\\+1 counters on it, where X is the total life lost by your opponents this turn\\.$').test(line))return op({counters:[counter('+1/+1',{value:'opponent-life-lost'})]});
 if(new RegExp('^'+self+' enters with two -1/-1 counters on it unless you\'ve cast another red spell this turn\\.$').test(line))return op({condition:'no-other-red-spell',counters:[counter('-1/-1',2)]});
 if(new RegExp('^'+self+' enters with a \\+1/\\+1 counter on it for each different mana cost among nonland cards in your graveyard\\.$').test(line))return op({counters:[counter('+1/+1',{value:'graveyard-mana-costs'})]});
 if(new RegExp('^'+self+' enters with a \\+1/\\+1 counter on it for each \\+1/\\+1 counter among other creatures you control\\.$').test(line))return op({counters:[counter('+1/+1',{value:'other-creature-plus-counters'})]});
 if(new RegExp('^'+self+' enters with a \\+1/\\+1 counter on it plus an additional \\+1/\\+1 counter on it for each other creature you control\\.$').test(line))return op({counters:[counter('+1/+1',{value:'other-creatures',add:1})]});
 if(new RegExp('^If you control five or more untapped lands, '+self+' enters with two \\+1/\\+1 counters and a lifelink counter on it\\.$').test(line))return op({condition:'five-untapped-lands',counters:[counter('+1/+1',2),counter('lifelink')]});
 if(new RegExp('^'+self+' enters with your choice of a deathtouch counter or a lifelink counter on it\\.$').test(line))return op({choice:{count:1,kinds:['deathtouch','lifelink']}});
 if(new RegExp('^'+self+' enters with your choice of two different counters on it from among menace, deathtouch, and lifelink\\.$').test(line))return op({choice:{count:2,kinds:['menace','deathtouch','lifelink']}});
 if(new RegExp('^As '+self+' enters, choose an opponent\\. '+self+' enters with a -1/-1 counter on it for each creature that player controls\\.$').test(line))return op({prepare:'choose-opponent',counters:[counter('-1/-1',{value:'prepared-count'})]});
 if(new RegExp('^As '+self+' enters, you may reveal any number of other artifact cards from your hand\\. '+self+' enters with a \\+1/\\+1 counter on it for each card revealed this way\\.$').test(line))return op({prepare:'reveal-artifacts',counters:[counter('+1/+1',{value:'prepared-count'})]});
 if(new RegExp('^As '+self+' enters, remove all counters from all permanents\\. '+self+' enters with a \\+1/\\+1 counter on it for each counter removed this way\\.$').test(line))return op({prepare:'remove-all-counters',counters:[counter('+1/+1',{value:'prepared-count'})]});
 return null;
}
