(()=>{'use strict';
 const arena=document.querySelector('.arena'),button=document.getElementById('battle-fullscreen');
 const host=document.createElement('div');host.className='battle-fullscreen-host';arena.before(host);host.append(arena);
 let active=false,rotated=false,savedOverflow='',pending=false;
 const nativeElement=()=>document.fullscreenElement||document.webkitFullscreenElement;
 function layout(){
  if(!active)return;
  const w=window.visualViewport?.width||innerWidth,h=window.visualViewport?.height||innerHeight;
  rotated=matchMedia('(pointer:coarse)').matches&&h>w;
  const availableW=rotated?h:w,availableH=rotated?w:h;
  const motion=arena.classList.contains('motion-arena');
  const width=motion?Math.min(availableW,availableH*16/9):availableW;
  host.dataset.rotated=String(rotated);arena.style.width=width+'px';
  arena.style.maxHeight=availableH+'px';
 }
 function setActive(value){
  active=value;host.dataset.active=String(value);button.textContent=value?'全画面を終了':'全画面';button.setAttribute('aria-pressed',String(value));
  if(value){savedOverflow=document.body.style.overflow;document.body.style.overflow='hidden';layout();}
  else{rotated=false;document.body.style.overflow=savedOverflow;arena.style.width='';arena.style.maxHeight='';try{screen.orientation?.unlock?.();}catch{}}
  requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
 }
 async function toggle(){
  if(pending)return;pending=true;
  try{
   if(active){if(nativeElement()===host){await(document.exitFullscreen?.()??document.webkitExitFullscreen?.());}if(active)setActive(false);return;}
   setActive(true);
   try{const request=host.requestFullscreen||host.webkitRequestFullscreen;if(request)await request.call(host);}catch{/* In-page fullscreen also works on browsers without the API. */}
   if(matchMedia('(pointer:coarse)').matches&&nativeElement()===host){try{await screen.orientation?.lock?.('landscape');}catch{/* Rotate only the arena if orientation lock is unsupported. */}}
   layout();
  }finally{pending=false;}
 }
 button.addEventListener('click',toggle);
 for(const name of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(name,()=>{if(active&&nativeElement()!==host)setActive(false);});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&active){event.preventDefault();toggle();}});
 window.addEventListener('resize',layout);window.visualViewport?.addEventListener('resize',layout);
 new MutationObserver(()=>{if(active){if(arena.hidden)toggle();else layout();}}).observe(arena,{attributes:true,attributeFilter:['class','hidden']});
 // Convert screen rectangles back to arena coordinates when the mobile fallback is rotated.
 globalThis.RankBattleFullscreen={rect(node){const r=node.getBoundingClientRect();if(!active||!rotated)return r;const a=arena.getBoundingClientRect();return {left:r.top-a.top,top:a.right-r.right,width:r.height,height:r.width};}};
})();
