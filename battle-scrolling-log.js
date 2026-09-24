/* Native BattleMessagePlayer::Impl::Update scrolls telop panes with a 0.2 s position animation. */
(()=>{'use strict';
const source=document.getElementById('arena-message'),arena=document.querySelector('.arena');if(!source||!arena)return;
const box=document.createElement('div');box.className='battle-scrolling-log';box.setAttribute('aria-hidden','true');source.parentElement.append(box);let lines=[],previous='',active=false;
function reset(){lines=[];previous='';active=false;box.replaceChildren();}
globalThis.RankBattleScrollingLog={reset};
// Keep a constant glyph scale; wrap long messages instead of shrinking or cropping them.
const glyphScale=.64;
function wrap(text){
 const font=typeof getComputedStyle==='function'?parseFloat(getComputedStyle(box).fontSize)||16:16;
 const available=box.clientWidth||source.parentElement.clientWidth||0,layout=globalThis.RankBattleMessageFont?.layout;
 if(!available||!layout)return [text];
 const result=[];let line='';
 for(const char of text){const candidate=line+char,image=layout(candidate,10000);if(line&&image&&image.width*glyphScale*font>available-4){result.push(line);line=char;}else line=candidate;}
 if(line)result.push(line);return result;
}
function draw(){box.replaceChildren();for(const text of lines.flatMap(wrap).slice(-2)){const row=document.createElement('div'),image=globalThis.RankBattleMessageFont?.layout(text,10000);row.className='battle-scrolling-line';row.textContent=text;if(image){row.style.backgroundImage=`url("${image.url}")`;row.style.color='transparent';row.style.backgroundSize=`${image.width*glyphScale}em ${image.height*glyphScale}em`;}box.append(row);}}
if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{if(active)draw();}).observe(box);
function refresh(){if(source.dataset?.batchPending==='1')return;const enabled=arena.classList.contains('motion-arena')&&arena.classList.contains('game-presentation')&&!arena.classList.contains('motion-ended');source.classList.toggle('telop-source',enabled);box.hidden=!enabled;if(!enabled){reset();return;}const text=source.textContent.trim();if(!text||text==='VS'||text===previous)return;previous=text;lines.push(...text.split('\n').filter(Boolean));lines=lines.slice(-2);draw();active=true;}
new MutationObserver(refresh).observe(source,{childList:true,characterData:true,subtree:true});new MutationObserver(refresh).observe(arena,{attributes:true,attributeFilter:['class']});refresh();
})();
