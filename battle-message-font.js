(function(root){'use strict';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const cache=new Map();
function layout(text,columns=30,fill="#ffffff",tight=false){
 const data=root.RankBattleMessageGlyphs;if(!data)return null;
 const key=tight+':'+fill+':'+columns+':'+text;if(cache.has(key))return cache.get(key);
 const size=data.size||24,lineHeight=data.height||42;const limit=Math.max(size*2,columns*size),lines=[[]];let x=6,y=3,max=0;const ink={left:Infinity,top:Infinity,right:0,bottom:0};
 for(const c of String(text)){
  const g=data.glyphs[c],advance=g?.advance??(c===' '?size/2:size);
  if(c==='\n'||x+advance>limit&&x>6){max=Math.max(max,x);x=6;y+=lineHeight;lines.push([]);if(c==='\n')continue;}
  if(g){ink.left=Math.min(ink.left,x+g.x);ink.top=Math.min(ink.top,y+g.y);ink.right=Math.max(ink.right,x+g.x+g.w);ink.bottom=Math.max(ink.bottom,y+g.y+g.h);}
  if(g)lines.at(-1).push(`<image x="${x+g.x}" y="${y+g.y}" width="${g.w}" height="${g.h}" href="${g.image}"/>`);
  else if(c!==' ')lines.at(-1).push(`<text x="${x}" y="${y+size}" font-size="${size}" fill="white">${escape(c)}</text>`);
  x+=advance;
 }
 const cropped=tight&&Number.isFinite(ink.left),ox=cropped?ink.left-2:0,oy=cropped?ink.top-2:0,w=cropped?ink.right-ink.left+4:Math.max(max,x)+6,h=cropped?ink.bottom-ink.top+4:y+lineHeight+3;
 const markup=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${ox} ${oy} ${w} ${h}"><defs><filter id="edge" x="-10%" y="-20%" width="120%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="2"/><feFlood flood-color="#380a20"/><feComposite in2="SourceAlpha" operator="in"/></filter><filter id="outline" x="-10%" y="-20%" width="120%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="2" result="a"/><feFlood flood-color="#380a20"/><feComposite in2="a" operator="in" result="border"/><feFlood flood-color="${fill}"/><feComposite in2="SourceAlpha" operator="in" result="fill"/><feMerge><feMergeNode in="border"/><feMergeNode in="fill"/></feMerge></filter></defs><g filter="url(#outline)">${lines.flat().join('')}</g></svg>`;
 const out={url:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markup),width:w/size,height:h/size};if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(key,out);return out;
}
function cardColor(kind,state={},resource={}) {
 if(kind==='label')return resource.hp?'#28e30b':'#009fe8';
 if(kind==='number')return resource.value===0&&!(resource.hp===false&&resource.maximum===0)?'#f84c12':resource.low?'#ffdc63':'#ffffff';
 return state.dead?'#f84c12':state.stopped?'#ff9f4a':'#ffffff';
}
function refreshCards(){document.querySelectorAll('.combatant-level,.combatant-name,.resource-number,.resource-label').forEach(el=>{
 const card=el.closest('.combatant'),row=el.closest('.resource-row');
 const fill=cardColor(el.classList.contains('resource-label')?'label':el.classList.contains('resource-number')?'number':'name',{dead:card?.classList.contains('fallen'),stopped:card?.classList.contains('stopped')},{hp:row?.classList.contains('hp'),value:Number(row?.dataset.value),maximum:Number(row?.dataset.maximum),low:row?.dataset.low==='true'});
 const text=el.textContent,key=fill+':'+text;if(el.dataset.bitmapText===key)return;
 el.dataset.bitmapText=key;const image=layout(text,10000,fill,true);if(!image)return;
 el.classList.add('native-card-text');el.style.backgroundImage='url("'+image.url+'")';
 el.style.setProperty('--card-text-width',image.width+'em');el.style.setProperty('--card-text-height',image.height+'em');
 });}
function refresh(){refreshCards();document.querySelectorAll('#arena-message,.foot-log').forEach(el=>{
 const font=parseFloat(getComputedStyle(el).fontSize)||16,cols=Math.min(30,Math.max(3,(el.clientWidth||480)/font));
 const text=el.textContent,image=text?layout(text,10000):null;
 el.classList.toggle('native-message',!!image);el.style.setProperty('--message-image',image?`url("${image.url}")`:'none');el.style.setProperty('--message-height',image?image.height+'em':'0');{const available=(el.id==='arena-message'?el.parentElement?.clientWidth:el.clientWidth)||480;el.style.setProperty('--message-height',image?Math.min(font,available/image.width)*image.height+'px':'0');}
});}
root.RankBattleMessageFont={layout,cardColor};if(typeof module!=='undefined')module.exports=root.RankBattleMessageFont;
if(typeof document!=='undefined'){
 const style=document.createElement('style');style.textContent='.native-message{color:transparent!important;text-shadow:none!important;min-height:var(--message-height)!important;background-image:var(--message-image)!important;background-repeat:no-repeat!important;background-position:center!important;background-size:contain!important}.native-message{white-space:pre!important;height:var(--message-height);line-height:0!important}.native-message>*{color:transparent!important;text-shadow:none!important}';document.head.append(style);
 let scheduled=false;const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;refresh();});}};
 new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,characterData:true});window.addEventListener('resize',schedule);schedule();
}
})(globalThis);
