(()=>{'use strict';
 const janken={グー:'rock',チョキ:'scissors',パー:'paper'};
 function icons(conditions=[],limit=Infinity){
  const active=(globalThis.RankBattleHudIcons||[]).filter(icon=>conditions.some(c=>Number(c.uid)===icon.uid&&c.current!==0&&(icon.sign===0||Math.sign(c.current)===icon.sign)));
  // Native ConditionUtil battle lists: two groups; expand all rows for the simulator HUD.
  return ['bad','good'].map(group=>active.filter(i=>i[group]>=0).sort((a,b)=>a[group]-b[group]).slice(0,limit));
 }
 function create(hp){
  const name=document.createElement('span');name.className='party-hp-name';
  const type=document.createElement('img');type.className='party-hp-type';
  const strips=[0,1].map(i=>{const n=document.createElement('span');n.className='party-hp-states row-'+i;hp.append(n);return n;});
  hp.append(name);hp.append(type);return {name,type,strips,signature:''};
 }
 function update(hud,actor){
  hud.name.textContent=actor.name||'';hud.name.title=actor.name||'';
  const type=janken[actor.janken];hud.type.hidden=!type;hud.type.alt=type?actor.janken:'';
  if(type)hud.type.src='images/janken/'+type+'.png';else hud.type.removeAttribute('src');
  const groups=icons(actor.conditions),signature=JSON.stringify(groups.map(g=>g.map(i=>i.index)));
  if(hud.signature===signature)return;hud.signature=signature;
  hud.strips[0].style?.setProperty?.('--good-rows',String(Math.max(1,Math.ceil(groups[1].length/4))));
  groups.forEach((group,row)=>{hud.strips[row].replaceChildren();hud.strips[row].style?.setProperty?.('--icon-rows',String(Math.max(1,Math.ceil(group.length/4))));for(const icon of group){const img=document.createElement('img');img.src='../images/status-icons/'+icon.index+'.webp?v=2';img.alt=img.title=icon.name;hud.strips[row].append(img);}});
 }
 globalThis.RankBattleHud={icons,create,update};
})();
