(function(){'use strict';
const data=globalThis.RANK_PARTY_DATA,engine=globalThis.RankPartyEngine;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=message=>{throw new Error(message)};
const ids=rows=>new Set(rows.map(r=>String(r.id??r.uid)));
const allowed={body:ids(data.catalog.bodyTypes),head:ids(data.catalog.headModels),pattern:ids(data.catalog.bodyPatterns),color1:ids(data.catalog.bodyColors.filter(c=>c.name!=='SP')),color2:new Set(['0',...ids(data.catalog.bodyColors)]),antenna:new Set([data.antennaProgressions.noAntenna.uid,...data.antennaProgressions.groups.map(g=>g.uid)]),ability:new Set(Object.keys(data.calculator.abilitySetMeta))};
const slotIds=Object.fromEntries(engine.slotDefs.map(([slot])=>[slot,new Set(['',...data.slots[slot].map(i=>i.uid)])]));
function character(name='ななし'){
 const p=data.catalog;
 return {name,level:50,body:String(p.bodyTypes.find(r=>r.name==='1A(0最速)').id),head:String(p.headModels.find(r=>r.name==='まる').id),pattern:String(p.bodyDefaults.pattern),color1:String(p.bodyDefaults.color1),color2:'0',antenna:data.antennaProgressions.noAntenna.uid,ability:'0',equipment:Object.fromEntries(engine.slotDefs.map(([s])=>[s,'']))};
}
function empty(){return {schema:'rankbattle-party',version:1,idNamespace:data.idNamespace,parties:[{name:'味方パーティ',members:Array(8).fill(null)},{name:'敵パーティ',members:Array(8).fill(null)}]};}
function text(v,label,max=40){if(typeof v!=='string'||!v.trim()||v.length>max)fail(`${label}は1～${max}文字で指定してください`);return v;}
function validateCharacter(c){
 if(!plain(c))fail('個体情報の形式が不正です');
 const next={name:text(c.name,'個体名')};
 if(!Number.isInteger(c.level)||c.level<1||c.level>data.calculator.maxLevel||!data.calculator.levels[c.level])fail('レベルが不正です');next.level=c.level;
 for(const [key,set] of Object.entries(allowed)){if(typeof c[key]!=='string'||!set.has(c[key]))fail(`個体情報「${key}」が登録データにありません`);next[key]=c[key];}
 if(!plain(c.equipment))fail('装備の形式が不正です');next.equipment={};
 for(const [slot,set] of Object.entries(slotIds)){if(typeof c.equipment[slot]!=='string'||!set.has(c.equipment[slot]))fail('装備の部位またはIDが不正です');next.equipment[slot]=c.equipment[slot];}
 if(c.face!==undefined){
  const catalog=globalThis.RANK_FACE_DATA;if(!plain(c.face)||!catalog)fail('顔パーツの形式が不正です');next.face={};
  for(const [key,field]of Object.entries(catalog.fields)){const value=String(c.face[key]??catalog.defaults[key]);if(!field.rows.some(r=>r.id===value))fail('顔パーツ「'+field.label+'」が不正です');next.face[key]=value;}
 }
 engine.calculate(next);return next;
}
function validate(doc){
 if(doc?.idNamespace!==undefined&&doc.idNamespace!==data.idNamespace)fail('ID形式が異なります。非公開の移行ツールで変換してください');
 if(!plain(doc)||doc.schema!=='rankbattle-party'||doc.version!==1||!Array.isArray(doc.parties)||doc.parties.length!==2)fail('Rankbattleパーティ登録のJSON（version 1）を選択してください');
 return {schema:'rankbattle-party',version:1,idNamespace:data.idNamespace,parties:doc.parties.map(p=>{
  if(!plain(p)||!Array.isArray(p.members)||p.members.length!==8)fail('各パーティは空き枠を含めて8枠必要です');
  return {name:text(p.name,'パーティ名'),members:p.members.map(c=>c===null?null:validateCharacter(c))};
 })};
}
function duplicate(doc,side,index){const to=doc.parties[side].members.indexOf(null);if(to<0)fail('このパーティは8人登録済みです');if(!doc.parties[side].members[index])fail('コピーする個体がありません');doc.parties[side].members[to]=clone(doc.parties[side].members[index]);return to;}
function exportDocument(doc){const clean=validate(doc);return {...clean,exportedAt:new Date().toISOString(),calculationVersion:1,snapshots:clean.parties.map(p=>p.members.map(c=>c?engine.calculate(c):null))};}
globalThis.RankPartyModel={character,empty,validate,validateCharacter,duplicate,exportDocument,clone};
})();
