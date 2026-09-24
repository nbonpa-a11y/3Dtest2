/* Original SSFB bitmap glyphs, not an installed or substitute system font. */
(function(root){'use strict';
 const cache=new Map(),bitmaps=new Map();
 // SVG morphology is expensive when the browser rerasterizes scaled digit layers.
 // Rasterize each fixed glyph/tone once, then animate the reusable bitmap.
 function bitmap(text,tone){return bitmaps.get(tone+':'+text);}
 async function prepare(){
  if(!root.Image||!root.document?.createElement)return;
  const probe=root.document.createElement('canvas');if(!probe.getContext?.('2d')||!probe.toDataURL)return;
  for(const tone of ['damage','enhanced','heal','ap'])for(const text of '0123456789,+-'){
   const key=tone+':'+text;if(bitmaps.has(key))continue;const source=svg(text,tone);if(!source)continue;
   await new Promise(resolve=>{const image=new root.Image();image.onerror=resolve;image.onload=()=>{try{
    const canvas=root.document.createElement('canvas'),scale=4;
    canvas.width=Math.ceil(source.width*48*scale);canvas.height=Math.ceil(source.height*48*scale);
    const ctx=canvas.getContext('2d');if(ctx){ctx.drawImage(image,0,0,canvas.width,canvas.height);bitmaps.set(key,{...source,url:canvas.toDataURL('image/png')});}
   }catch{}resolve();};image.src=source.url;});
  }
 }

 // GSssTextProcessor::Impl::UpdateTextAnimation 0x73a508..0x73a5c8:
 // 70% of the animation staggers glyphs; each glyph uses the remaining 30%.
 // Type 4 virtual handler 0x73ab4c: scale=2-t^3, alpha=t, no translation.
 function glyphPhase(frame,index,count,critical=false,tone='damage'){
  const duration=critical?25:15,progress=frame/duration,delay=count>1?index*.7/(count-1):0;
  const t=Math.max(0,Math.min(1,(progress-delay)/.3));
  return tone==='heal'||tone==='ap'?{opacity:1,scale:1,dy:-18.3*Math.sin(t*Math.PI)}:{opacity:t,scale:2-t*t*t,dy:0};
 }
 function svg(text,tone='damage',frame=60,critical=false){
  const data=root.RankBattleNumberGlyphs;if(!data||![...text].every(c=>data.glyphs[c]))return null;
  const key=tone+':'+text+':'+frame+':'+critical;if(cache.has(key))return cache.get(key);
  let x=6,index=0;const glyphs=[];for(const c of text){const g=data.glyphs[c];const phase=glyphPhase(frame,index++,text.length,critical,tone),cx=x+g.x+g.w/2,cy=g.y+g.h/2;glyphs.push(`<image opacity="${phase.opacity}" transform="translate(${cx} ${cy+phase.dy}) scale(${phase.scale}) translate(${-cx} ${-cy})" x="${x+g.x}" y="${g.y}" width="${g.w}" height="${g.h}" href="${g.image}"/>`);x+=g.advance;}
  const w=x+6,h=data.height+6,color=tone==='enhanced'?'#f3691b':tone==='heal'?'#8ee500':tone==='ap'?'#14b8ee':'#fff9f2';
  // 03Effective / Text_Damage: packed AARRGGBB LT=fff3691b, LB=fff9bd21.
  const gradient=tone==='enhanced'?`<linearGradient id="effective" x2="0" y2="1"><stop stop-color="#f3691b"/><stop offset="1" stop-color="#f9bd21"/></linearGradient><mask id="digits" style="mask-type:alpha">${glyphs.join('')}</mask>`:'';
  const overlay=tone==='enhanced'?`<rect width="${w}" height="${h}" fill="url(#effective)" mask="url(#digits)"/>`:'';
  const markup=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${gradient}<filter id="outline" x="-20%" y="-30%" width="140%" height="160%"><feMorphology in="SourceAlpha" operator="dilate" radius="3.5" result="edge"/><feFlood flood-color="#320b20"/><feComposite in2="edge" operator="in" result="border"/><feFlood flood-color="${color}"/><feComposite in2="SourceAlpha" operator="in" result="fill"/><feMerge><feMergeNode in="border"/><feMergeNode in="fill"/></feMerge></filter></defs><g filter="url(#outline)">${glyphs.join('')}</g>${overlay}</svg>`;
  const value={url:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markup),width:w/48,height:h/48};if(cache.size>=256)cache.delete(cache.keys().next().value);cache.set(key,value);return value;
 }
 function render(element,text,tone){
  const value=String(text),a=element.numberAnimation={text:value,tone,elapsed:0,critical:element.className.includes('critical'),frame:-1};
  const image=svg(value,tone,0,a.critical);if(!image){element.textContent=text;return;}
  element.textContent=text;element.className+=' native-number';element.style.width=image.width+'em';element.style.height=image.height+'em';
  if(element.ownerDocument?.createElement){
   element.setAttribute('data-digit-animation','');element.style.backgroundImage='none';a.digits=[];let x=0;
   for(const c of value){const digit=element.ownerDocument.createElement('span'),glyph=bitmap(c,tone)||svg(c,tone),g=root.RankBattleNumberGlyphs.glyphs[c];digit.className='number-digit';digit.style.backgroundImage='url("'+glyph.url+'")';digit.style.width=glyph.width+'em';digit.style.height=glyph.height+'em';digit.style.left=x/48+'em';element.append(digit);a.digits.push(digit);x+=g.advance;}
   animate(element,0);
  }else element.style.backgroundImage='url("'+image.url+'")';
 }
 function animate(element,delta){const a=element.numberAnimation;if(!a)return;a.elapsed+=Math.max(0,delta||0);const frame=Math.min(30,Math.floor(a.elapsed*60));if(frame===a.frame)return;a.frame=frame;
  if(a.digits){a.digits.forEach((digit,index)=>{const phase=glyphPhase(frame,index,a.text.length,a.critical,a.tone);digit.style.opacity=String(phase.opacity);digit.style.transform='translateY('+(phase.dy/48)+'em) scale('+phase.scale+')';});}
  else {const image=svg(a.text,a.tone,frame,a.critical);if(image)element.style.backgroundImage='url("'+image.url+'")';}
  if(a.critical){const scale=frame<=10?.7+.5*frame/10:frame<=20?1.2-.2*(frame-10)/10:1;const opacity=Math.max(0,Math.min(1,(frame-2)/6));element.style.setProperty?.('--critical-scale',String(scale));element.style.setProperty?.('--critical-opacity',String(opacity));}if(frame>=30)element.numberAnimation=null;
 }
 function clear(element){element.numberAnimation=null;element.removeAttribute?.('data-digit-animation');element.querySelectorAll?.('.number-digit').forEach(n=>n.remove());element.style.backgroundImage='';element.style.width='';element.style.height='';}
 root.RankBattleNumbers={svg,render,clear,animate,glyphPhase,prepare};if(typeof module!=='undefined')module.exports=root.RankBattleNumbers;
})(globalThis);
