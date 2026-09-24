(()=>{'use strict';
const data=globalThis.RANK_APPEARANCE_DATA,records=new Map(),byKey=new Map();
let frame,ready,active=null,timer,scheduled,idleTimer,sequence=0;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function antenna(id,level=50){const rows=data.antenna[id]||[];return [...rows].reverse().find(r=>r.level<=level)||rows[0];}
function thumbnail(kind,id,level){return(kind==='antenna'?antenna(id,level):data[kind]?.[id])?.image||'';}
function image(kind,id,level){const src=thumbnail(kind,id,level);return src?`<img class="choice-art" src="${escape(src)}" alt="" loading="lazy" decoding="async">`:'';}
function spec(c){
 const plain=RANK_PARTY_DATA.catalog.bodyPatterns.find(r=>r.name==='なし'),sp=RANK_PARTY_DATA.catalog.bodyColors.find(r=>r.name==='SP');
 const pattern=['0',String(sp.uid),c.color1].includes(c.color2)?String(plain.id):c.pattern;
 return {...(c.face?{face:{...c.face}}:{}),head:data.head[c.head].id,body:data.body[c.body].id,pattern:data.pattern[pattern].id,
  color1:data.color[c.color1].id,color2:data.color[c.color2].id,antenna:antenna(c.antenna,c.level).id,antennaLook:antenna(c.antenna,c.level).look,level:c.level,
  equipment:Object.fromEntries(Object.entries(c.equipment).map(([slot,id])=>[slot,id?data.equipment[id].id:'']))};
}
function character(c,extra='',view='full'){
 const value=spec(c),key=JSON.stringify(value);let record=byKey.get(key);
 if(!record){record={id:String(++sequence),spec:value};byKey.set(key,record);records.set(record.id,record);}
 schedule();
 return `<span class="appearance-frame ${extra}"><img data-appearance-id="${record.id}" data-appearance-view="${view}" alt="${escape(c.name)}の外見" ${record.image?`src="${view==='head'?(record.portrait||record.image):view==='party'?(record.partyImage||record.image):record.image}"`:'hidden'} decoding="async"><span class="appearance-note" ${record.image?'hidden':''}>${record.error?'画像を生成できませんでした':'画像生成中…'}</span></span>`;
}
function schedule(){clearTimeout(scheduled);scheduled=setTimeout(pump,120);}
function renderer(){
 clearTimeout(idleTimer);
 if(ready)return ready;
 ready=new Promise((resolve,reject)=>{
  frame=document.createElement('iframe');frame.className='appearance-renderer';frame.title='外見画像の生成';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
  const timeout=setTimeout(()=>reject(Error('外見画像の生成環境を起動できませんでした。WebGL対応ブラウザーで再読み込みしてください。')),45000);
  frame._resolve=()=>{clearTimeout(timeout);resolve()};frame._reject=error=>{clearTimeout(timeout);reject(Error(error))};
  frame.src='appearance-renderer.html';document.body.append(frame);
 });return ready;
}
window.addEventListener('message',event=>{
 if(!frame||event.source!==frame.contentWindow)return;
 const message=event.data;
 if(message?.type==='rank-appearance-ready')frame._resolve();
 if(message?.type==='rank-appearance-error')frame._reject(message.error);
 if(message?.type!=='rank-appearance-image'||String(message.id)!==active?.id)return;
 clearTimeout(timer);
 if(message.error)active.error=message.error;
 else if(typeof message.image==='string'&&message.image.startsWith('data:image/png;base64,'))Object.assign(active,{image:message.image,portrait:message.portrait,partyImage:message.partyImage,partyAspect:message.partyAspect});
 else active.error='外見画像の形式が不正です';
 display(active);active=null;schedule();
});
function display(record){
 for(const img of document.querySelectorAll(`[data-appearance-id="${record.id}"]`)){
  if(record.image){const view=img.dataset.appearanceView;img.src=view==='head'?(record.portrait||record.image):view==='party'?(record.partyImage||record.image):record.image;if(view==='party'&&record.partyAspect){img.parentElement.style.aspectRatio=record.partyAspect;img.parentElement.parentElement.style.flex=String(record.partyAspect)+' 1 0';img.parentElement.parentElement.style.setProperty('--party-aspect',String(record.partyAspect));}img.hidden=false;img.nextElementSibling.hidden=true;}
  else if(record.error){img.nextElementSibling.textContent='外見画像を生成できませんでした';img.nextElementSibling.title=record.error;}
 }
}
async function pump(){
 if(active)return;
 const ids=new Set([...document.querySelectorAll('[data-appearance-id]')].map(img=>img.dataset.appearanceId));
 // Bound the in-memory image cache; registrations/shared codes contain no images.
 if(records.size>80)for(const [id,r]of records){if(records.size<=64)break;if(!ids.has(id)){records.delete(id);byKey.delete(JSON.stringify(r.spec));}}
 for(const id of ids){const r=records.get(id);if(r?.image||r?.error)display(r);}
 const next=[...ids].map(id=>records.get(id)).find(r=>r&&!r.image&&!r.error);
 if(!next){clearTimeout(idleTimer);if(frame)idleTimer=setTimeout(()=>{frame?.remove();frame=null;ready=null;},30000);return;}
 active=next;
 try{
  await renderer();
  timer=setTimeout(()=>{next.error='外見生成が時間内に完了しませんでした';display(next);active=null;frame?.remove();frame=null;ready=null;schedule();},45000);
  frame.contentWindow.postMessage({type:'rank-appearance-render',id:next.id,spec:next.spec},'*');
 }catch(error){for(const id of ids){const r=records.get(id);if(r&&!r.image){r.error=error.message;display(r);}}active=null;}
}
function party(p){return `<section class="party-appearance"><h3>パーティ全体外見</h3><div class="party-appearance-line">${p.members.map((c,i)=>c?`<div class="party-appearance-member">${character(c,'','party')}<span>${escape(c.name)}</span></div>`:`<div class="party-appearance-member empty" aria-label="${i+1}枠目・未登録"></div>`).join('')}</div></section>`;}
globalThis.RankAppearance={image,thumbnail,character,party,spec,portrait:c=>character(c,'combatant-portrait','head')};
})();
