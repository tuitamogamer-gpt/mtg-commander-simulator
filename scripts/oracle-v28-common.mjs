const basic=['Plains','Island','Swamp','Mountain','Forest'];
const lands=['Barnyard','Cave','Cloud','Desert','Forest','Gate','Island','Lair','Locus','Mine','Mountain','Omenpath','Plains','Planet','Power-Plant','Sphere','Swamp','Tower','Town',"Ulamog's","Urza's"];
export function extensionLine(card,line){
 if(/^As .+ enters, choose a creature type\.$/.test(line))return {kind:'entry-creature-type-v28',contract:'entry-creature-type-v28'};
 if(line==='Each creature card in your graveyard has the chosen creature type in addition to its other types.')return {kind:'chosen-creature-types-v28',scope:'graveyard',retain:true,contract:'chosen-creature-types-v28'};
 if(/^Creatures you control are the chosen type(?: in addition to their other types)?\. The same is true for creature spells you control and creature cards you own that aren't on the battlefield\.$/.test(line))return {kind:'chosen-creature-types-v28',scope:'all-owned',retain:line.includes('addition'),contract:'chosen-creature-types-v28'};
 if(/^As .+ enters, choose a land type\.$/.test(line))return {kind:'entry-land-type-v28',choices:lands,quantity:1,contract:'entry-land-type-v28'};
 if(/^As .+ enters, choose a basic land type\.$/.test(line))return {kind:'entry-land-type-v28',choices:basic,quantity:1,contract:'entry-land-type-v28'};
 if(/^As .+ enters, choose two basic land types\.$/.test(line))return {kind:'entry-land-type-v28',choices:basic,quantity:2,contract:'entry-land-type-v28'};
 if(/^As .+ enters, choose Island or Swamp\.$/.test(line))return {kind:'entry-land-type-v28',choices:['Island','Swamp'],quantity:1,contract:'entry-land-type-v28'};
 if(/^As .+ enters, choose a basic land type\. (?:Then you|You) may pay 2 life\. If you don't, it enters tapped\.$/.test(line))return {kind:'entry-land-type-v28',choices:basic,quantity:1,payLife:2,contract:'entry-land-type-v28'};
 if(line==='This land is the chosen type.'||line==='This land is the chosen type in addition to its other types.')return {kind:'chosen-land-types-v28',scope:'self',retain:line.includes('addition'),contract:'chosen-land-types-v28'};
 if(line==='Enchanted land is the chosen type.')return {kind:'chosen-land-types-v28',scope:'attached',retain:false,contract:'chosen-land-types-v28'};
 if(line==='Lands you control are the chosen type in addition to their other types.')return {kind:'chosen-land-types-v28',scope:'your-lands',retain:true,contract:'chosen-land-types-v28'};
 if(line==='Basic lands of the first chosen type are the second chosen type.')return {kind:'chosen-land-types-v28',scope:'basic-first',retain:false,contract:'chosen-land-types-v28'};
 if(line==='Mana abilities of this land cost an additional 1 life to activate.')return {kind:'mana-activation-life-v28',life:1,contract:'mana-activation-life-v28'};
 if(line==='Enchanted creature has landwalk of the chosen type.')return {kind:'chosen-landwalk-v28',contract:'chosen-landwalk-v28'};
 if(line==='Each land of the chosen type has phasing.')return {kind:'chosen-land-phasing-v28',contract:'chosen-land-phasing-v28'};
 if(line==='Whenever a land of the chosen type an opponent controls becomes tapped, you gain 1 life.')return {kind:'chosen-land-tap-life-v28',contract:'chosen-land-tap-life-v28'};
 return null;
}
export function finalizeCompilation(card,result){
 if(!result.semanticClass)return result;
 const operations=result.implementation;
 if(operations.some(row=>row.kind==='chosen-creature-types-v28')&&!operations.some(row=>row.kind==='entry-creature-type-v28'))return {semanticClass:null,reason:'unbound-chosen-creature-type-v28'};
 if(operations.some(row=>row.kind==='entry-creature-type-v28')&&!operations.some(row=>row.kind==='chosen-creature-types-v28'))return {semanticClass:null,reason:'unsupported-chosen-creature-type-consumer-v28'};
 if(operations.some(row=>['chosen-land-types-v28','chosen-landwalk-v28','chosen-land-phasing-v28','chosen-land-tap-life-v28'].includes(row.kind))&&!operations.some(row=>row.kind==='entry-land-type-v28'))return {semanticClass:null,reason:'unbound-chosen-land-type-v28'};
 if(operations.some(row=>row.kind==='chosen-land-types-v28'&&row.scope==='basic-first')&&!operations.some(row=>row.kind==='entry-land-type-v28'&&row.quantity===2))return {semanticClass:null,reason:'unbound-second-land-type-v28'};
 return result;
}
