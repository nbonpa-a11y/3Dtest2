(()=>{'use strict';
 let frame=null,ready=false,prepared=false,failed=false,latest=null,signature='',waiters=[],serial=0;
 const pending=new Map(),host=()=>document.getElementById('battle-3d-stage');
 const post=data=>{if(ready&&!failed)frame.contentWindow.postMessage(data,'*')};
 const qualityInput=document.getElementById('render-quality');
 if(qualityInput){qualityInput.value=globalThis.RankBattleRenderQuality?.read()||'auto';qualityInput.addEventListener?.('change',()=>{const value=globalThis.RankBattleRenderQuality?.save(qualityInput.value)||'auto';post({type:'rank-battle-3d-quality',value});});}
 const finishWait=()=>waiters.splice(0).forEach(f=>f());
 const cancel=()=>{for(const resolve of pending.values())resolve(false);pending.clear()};
 function sync(state,{enabled,busy,paused,skip=false}){
  const area=host();if(!area)return;area.hidden=!enabled;const qualityLabel=document.getElementById('render-quality-label');if(qualityLabel)qualityLabel.hidden=!enabled;
  if(!enabled){latest={...(latest||{}),visible:false};globalThis.RankBattleAudio?.sync(latest);post({type:'rank-battle-3d-sync',...latest,snap:true});cancel();finishWait();return;}
  const outcome=state.basic?.status==='ended'&&[0,1].includes(state.basic.winner);
  const actors=state.parties.flatMap((p,side)=>p.members.flatMap((a,slot)=>a?.registration?[{key:`${side}:${slot}`,side,slot,actionUid:a.antenna?.action?.action_uid,name:a.name??a.registration.name??'',janken:a.calculated?.janken??'',conditions:(a.conditions||[]).map(c=>({uid:c.uid,current:c.current})),hp:a.hp,maxHp:a.initialStats?.hp??a.hp,spec:RankAppearance.spec(a.registration),dead:outcome&&side===0?false:a.hp<=0,floating:(a.conditions||[]).some(c=>Number(c.uid)===0x870000C6&&c.current>0)}]:[]));
  const nextSignature=JSON.stringify(actors.map(a=>[a.key,a.spec]));if(nextSignature!==signature){signature=nextSignature;prepared=false;}
  const defaultView={mode:'team',side:outcome?0:1,outcome,front:true,hpBars:!busy&&!outcome};
  const unchangedIdle=!busy&&latest?.visible&&!latest.busy&&JSON.stringify(latest.actors)===JSON.stringify(actors)&&JSON.stringify(latest.defaultView)===JSON.stringify(defaultView);
  latest={actors,visible:true,busy,paused,skip,defaultView,snap:skip||(!busy&&!unchangedIdle)};
  globalThis.RankBattleAudio?.sync(latest);
  if(!frame){frame=document.createElement('iframe');frame.title='戦闘キャラクターの3D表示';frame.src='battle-3d.html';frame.className='battle-3d-frame';area.append(frame);}
  post({type:'rank-battle-3d-sync',...latest});if(skip){cancel();finishWait();}
 }
 window.addEventListener('message',e=>{
  if(!frame||e.source!==frame.contentWindow)return;
  if(e.data?.type==='rank-battle-3d-pick'&&latest?.visible&&!latest?.busy&&latest?.defaultView?.hpBars)globalThis.RankBattle3D.onPick?.(String(e.data.key),e.data.point);
  if(e.data?.type==='rank-battle-3d-outcome-anchor'&&latest?.defaultView?.outcome){const y=Number(e.data.y);if(Number.isFinite(y))host().closest('.arena')?.style.setProperty('--outcome-y',Math.min(90,Math.max(50,y*100))+'%');}
  if(e.data?.type==='rank-battle-3d-audio'&&pending.has(e.data.id))globalThis.RankBattleAudio?.play(e.data.sound);
  if(e.data?.type==='rank-battle-3d-title')globalThis.RankBattle3D.onTitle?.(String(e.data.text||''));
  if(e.data?.type==='rank-battle-3d-cards'&&pending.has(e.data.id))globalThis.RankBattle3D.onCards?.(e.data.updates);
  if(e.data?.type==='rank-battle-3d-ready'){ready=true;post({type:'rank-battle-3d-quality',value:globalThis.RankBattleRenderQuality?.read()||'auto'});post({type:'rank-battle-3d-sync',...latest});}
  if(e.data?.type==='rank-battle-3d-prepared'){prepared=true;finishWait();}
  if(e.data?.type==='rank-battle-3d-done'){const resolve=pending.get(e.data.id);pending.delete(e.data.id);resolve?.(!!e.data.played);}
  if(e.data?.type==='rank-battle-3d-warning'){console.warn(e.data.message);const area=host();if(!area.querySelector?.('.battle-3d-warning')){const message=document.createElement('p');message.className='battle-3d-warning';message.textContent=e.data.message;area.append(message);}}
  if(e.data?.type==='rank-battle-3d-error'){failed=true;cancel();finishWait();const area=host();frame.hidden=true;const message=document.createElement('p');message.className='battle-3d-error';message.textContent='3D表示を読み込めませんでした。戦闘ログはそのまま利用できます。';area.append(message);console.error('Battle 3D:',e.data.message);}
 });
 globalThis.RankBattle3D={sync,async prepare(){await globalThis.RankBattleAudio?.prepare();if(prepared||failed||latest?.skip||!latest?.visible)return;await new Promise(resolve=>{const done=()=>{clearTimeout(timer);resolve()},timer=setTimeout(()=>{waiters=waiters.filter(f=>f!==done);done()},90000);waiters.push(done)});},
 present(view,cues=[],labels=[]){if(!ready||!prepared||failed||!latest?.visible||latest.skip)return Promise.resolve(false);cancel();const id=++serial;return new Promise(resolve=>{pending.set(id,resolve);post({type:'rank-battle-3d-cue',id,view,cues,labels})});}};
})();
