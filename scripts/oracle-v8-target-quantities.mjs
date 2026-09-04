// Dynamic target counts bind to the already announced X; no prose is evaluated at runtime.
export function extensionEffect(card,line,h){
 if((line.match(/\bX target\b/g)||[]).length!==1)return null;
 const changed=line.replace(/\bX target\b/,'two target');
 const body=h.effect(card,changed);if(!body||body.targets.length!==1)return null;
 const target=body.targets[0];if(target.min!==2||target.max!==2)return null;
 return {...body,targets:[{...target,min:0,max:0,targetCountX:true}]};
}
