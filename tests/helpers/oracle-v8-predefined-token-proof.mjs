import assert from 'node:assert/strict';
export function assertRoleToken(context,effect,source,subject,before,label){
 if(effect.action!=='role-token-v8')return false;
 const {game,a}=context;
 const hosts=effect.filters?before.battlefield.filter(card=>effect.filters.some(filter=>card.is('Creature')&&(filter.controller==='you'?card.ctrl===a:filter.controller==='opponent'?card.ctrl!==a:true)&&(!filter.subtype||card.hasSub(filter.subtype)))):[subject].flat().filter(Boolean);
 const entered=context.moveEvidence.slice(before.moveEvidenceIndex).filter(row=>row.from==='nowhere'&&row.to==='battlefield'&&row.card.isToken&&row.card.name===effect.role);
 // Optional target counts can be zero; when a target was actually selected,
 // witness the attachment established on its entry, before any later SBA.
 const legal=hosts.filter(host=>host.zone==='battlefield'&&!host.phasedOut&&host.is('Creature'));
 for(const host of legal){const row=entered.find(row=>row.after.attachedTo===host.iid||row.card.attachedTo===host.iid);assert.ok(row,label+': exact predefined Role entered attached to selected host');assert.equal(row.card.def.name,effect.role,label+': explicit Role name');assert.deepEqual([...row.card.def.types],['Enchantment']);assert.deepEqual([...row.card.def.subtypes],['Aura','Role']);assert.equal(row.card.owner,a);}
 assert.equal(new Set(entered.map(row=>row.card)).size,legal.length,label+': one Role per legal chosen creature');
 for(const host of legal)assert.ok(game.bf().filter(card=>card.hasSub('Role')&&card.ctrl===a&&card.attachedTo===host.iid).length<=1,label+': Role uniqueness after priority boundary');
 return true;
}
