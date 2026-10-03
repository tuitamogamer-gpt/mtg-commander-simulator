const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const stat=(count)=>({kind:'characteristic-pt',power:true,toughness:true,count,multiply:1,offset:0,toughnessOffset:0,contract:'characteristic-power-toughness'});
export function characteristicOperation(card,line){
 const form=entryForm(line);if(form)return {...form,power:true,toughness:true};
 const own='(?:This creature|'+escape(card.name)+')';
 if(new RegExp('^'+own+"'s power and toughness are each equal to the life paid as it entered\\.$",'i').test(line))return stat({kind:'common-count-v26',test:'entry-life'});
 if(new RegExp('^'+own+"'s power and toughness are each equal to 20 minus the highest life total among players\\.$",'i').test(line))return stat({kind:'common-count-v26',test:'twenty-minus-highest-life'});
 if(new RegExp('^'+own+"'s power and toughness are each equal to half the highest life total among your opponents, rounded up\\.$",'i').test(line))return stat({kind:'common-count-v26',test:'half-opponent-life'});
 return null;
}
export function extensionLine(card,line,h){
 const cda=characteristicOperation(card,line);if(cda)return cda;
 const life=/^As this creature enters, pay any amount of life\.( The amount you pay can't be more than the total number of white nontoken permanents your opponents control plus the total number of white cards in their graveyards\.)?$/.exec(line);
 if(life)return {kind:'entry-life-v26',whiteCap:!!life[1],contract:'entry-life-v26'};
 return entryForm(line);
}
function entryForm(line){
 if(line==='As this creature enters or is turned face up, it becomes your choice of 5/1 or 1/5.')return {kind:'entry-form-v26',faceUp:true,options:[{power:5,toughness:1,keywords:[]},{power:1,toughness:5,keywords:[]}],contract:'entry-form-v26'};
 const choice=/^As this creature enters, it becomes your choice of (.+)\.$/.exec(line);
 if(choice){
  const options=choice[1].split(/, or |, | or /).map(text=>{
   text=text.replace(/^(?:a|an) /,'');
   const parsed=/^([0-9]+)\/([0-9]+) (?:artifact )?creature(?: with (flying|vigilance|defender))?$/.exec(text),wall=/^([0-9]+)\/([0-9]+) Wall artifact creature with defender in addition to its other types$/.exec(text);
   if(!parsed&&!wall)return null;const row=parsed||wall;return {power:Number(row[1]),toughness:Number(row[2]),keywords:wall?['defender']:parsed[3]?[parsed[3]]:[],...(wall?{addSubtypes:['Wall']}:{})};
  });
  if(options.length>=2&&options.every(Boolean))return {kind:'entry-form-v26',options,contract:'entry-form-v26'};
 }
 if(/^As this creature enters, flip a coin\. If the coin comes up heads, this creature enters as a 5\/2 creature with haste\. If (?:the coin|it) comes up tails, this creature enters as a 2\/5 creature with defender\.$/.test(line))return {kind:'entry-form-v26',coin:true,options:[{power:5,toughness:2,keywords:['haste']},{power:2,toughness:5,keywords:['defender']}],contract:'entry-form-v26'};
 return null;
}
