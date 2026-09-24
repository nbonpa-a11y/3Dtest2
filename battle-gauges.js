/* MenuBattle::OnUpdateStatus 0xab0b48..0xab0b78: current value -> HP over float32 0.3 s. */
(function(root){'use strict';
const entries=new Map();let scheduled=false,last=0;
function advance(dt){let moving=false;for(const e of entries.values()){if(!e.paused?.()){e.elapsed=Math.min(.3,e.elapsed+Math.max(0,dt));e.value=e.from+(e.target-e.from)*e.elapsed/.3;}e.node.style.width=e.value+'%';moving||=e.elapsed<.3;}return moving;}
function tick(now){scheduled=false;const dt=last?(now-last)/1000:0;last=now;if(advance(typeof document!=='undefined'&&document.hidden?0:dt))schedule();else last=0;}
function schedule(){if(!scheduled&&typeof requestAnimationFrame==='function'){scheduled=true;requestAnimationFrame(tick);}}
function bind(node,key,target,{animate=false,paused}={}){let e=entries.get(key);target=Math.max(0,Math.min(100,target));if(!e||!animate)e={value:target,from:target,target,elapsed:.3};else if(e.target!==target){e.from=e.value;e.target=target;e.elapsed=0;}e.node=node;e.paused=paused;entries.set(key,e);node.style.width=e.value+'%';if(e.elapsed<.3)schedule();}
root.RankBattleGauges={bind,advance};if(typeof module!=='undefined')module.exports=root.RankBattleGauges;
})(globalThis);
