/* Native GSWS samples and DirectUpdater sound frames. Presentation only; never uses battle RNG. */
(function(root){'use strict';
 const data=root.RankBattleAudioData||{assets:{},directs:{}},buffers=new Map(),pending=new Map(),sources=new Set(),recent=new Map();
 let context,bgmGain,seGain,bgm=null,bgmOffset=0,bgmStarted=0,enabled=false,paused=false,skip=false,outcome=false,epoch=0,outcomePlayed=false;
 let settings={bgm:.4,se:.7,muted:false};try{const saved=JSON.parse(localStorage.getItem('rankbattle-audio')||'null');if(saved)for(const k of ['bgm','se'])if(Number.isFinite(saved[k]))settings[k]=Math.max(0,Math.min(1,saved[k]));if(saved)settings.muted=!!saved.muted;}catch{}
 const live=()=>enabled&&!paused&&!skip&&!document.hidden;
 const errors=new Map();
 function showErrors(){const el=document.getElementById('audio-status');if(el)el.textContent=errors.size?([...errors.values()][0]+(errors.size>1?'（ほか'+(errors.size-1)+'件）':'')):'';}
 function warn(error,key='playback'){const detail=error?.message||String(error||'音声機能を利用できません');errors.set(key,'音声エラー：'+detail);showErrors();}
 function recovered(key){errors.delete(key);showErrors();}
 function scriptBytes(info){return new Promise((resolve,reject)=>{
  if(!info.script){reject(Error('ローカル用音声データがありません。ページを再読み込みしてください。'));return;}
  const script=document.createElement('script');let done=false;
  const finish=error=>{if(done)return;done=true;clearTimeout(timer);script.remove();if(error){reject(error);return;}try{const value=root.RankBattleAudioBytes?.[info.byteKey];if(typeof value!=='string')throw Error('音声データが空です');delete root.RankBattleAudioBytes[info.byteKey];const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));resolve(bytes.buffer);}catch(e){reject(e);}};
  const timer=setTimeout(()=>finish(Error('音声読み込みがタイムアウトしました')),15000);
  script.onload=()=>finish();script.onerror=()=>finish(Error('音声ファイルを読み込めません：'+info.script));script.src=info.script;document.head.append(script);
 });}
 async function audioBytes(info){
  if(root.location?.protocol==='file:')return scriptBytes(info);
  const controller=typeof AbortController==='function'?new AbortController():null,timer=setTimeout(()=>controller?.abort(),15000);
  try{const response=await fetch(info.url,controller?{signal:controller.signal}:{});if(!response.ok)throw Error('音声ファイルのHTTPエラー '+response.status);return await response.arrayBuffer();}
  catch(error){if(info.script)return scriptBytes(info);throw error;}finally{clearTimeout(timer);}
 }

 function gains(){if(!context)return;bgmGain.gain.setValueAtTime(settings.muted?0:settings.bgm,context.currentTime);seGain.gain.setValueAtTime(settings.muted?0:settings.se,context.currentTime);}
 async function load(id){if(buffers.has(id))return buffers.get(id);if(!context||!data.assets[id])return null;if(!pending.has(id)){const ctx=context;pending.set(id,(async()=>{const bytes=await audioBytes(data.assets[id]);let buffer;try{buffer=await ctx.decodeAudioData(bytes);}catch(error){throw Error('音声形式をデコードできません：'+data.assets[id].url+' ('+(error.message||error)+')');}buffers.set(id,buffer);recovered(id);return buffer;})().catch(error=>{warn(error,id);return null;}).finally(()=>pending.delete(id)));}return pending.get(id);}
 function stopBgm(reset=false){if(bgm){bgmOffset+=context.currentTime-bgmStarted;bgm.onended=null;bgm.stop();bgm.disconnect();bgm=null;}if(reset)bgmOffset=0;}
 function stopEffects(){for(const s of sources){s.onended=null;s.stop();s.disconnect();}sources.clear();recent.clear();epoch++;}
 async function startBgm(){if(!context||bgm||!live()||outcome||!data.bgm)return;const token=epoch,buffer=await load(data.bgm);if(!buffer||token!==epoch||bgm||!live()||outcome)return;const info=data.assets[data.bgm],s=context.createBufferSource();s.buffer=buffer;s.loop=info.loop;s.loopStart=info.loopStart;s.loopEnd=info.loopEnd||buffer.duration;s.connect(bgmGain);let offset=bgmOffset;if(s.loop&&offset>=s.loopEnd)offset=s.loopStart+(offset-s.loopStart)%(s.loopEnd-s.loopStart);else offset%=buffer.duration;bgmOffset=offset;bgmStarted=context.currentTime;bgm=s;s.start(0,offset);}
 async function unlock(){if(!enabled)return;try{if(!context){const C=root.AudioContext||root.webkitAudioContext;if(!C){warn();return;}context=new C();bgmGain=context.createGain();seGain=context.createGain();bgmGain.connect(context.destination);seGain.connect(context.destination);gains();}if(live())await context.resume();await startBgm();preload();recovered('playback');}catch(error){warn(error);}}
 let wanted=[],preloadKey='',preloadTask=null;
 function preload(){if(!context)return;const ids=new Set([data.bgm]);for(const a of wanted){for(const d of root.RankBattleVisualData?.actions?.[Number(a.actionUid)]||[])if(d&&data.directs[d.uid])ids.add(data.directs[d.uid].sound);}for(const d of [...(root.RankBattleVisualData?.actions?.[0x8602009b]||[]),...Object.values(root.RankBattleVisualData?.conditions||{}),...Object.values(root.RankBattleVisualData?.reactions||{})])if(d&&data.directs[d.uid])ids.add(data.directs[d.uid].sound);if(data.reactions?.down)ids.add(data.reactions.down.sound);for(const pair of Object.values(data.reactions?.conditions||{}))for(const item of Object.values(pair))if(item)ids.add(item.sound);for(const name of ['cure','recovery'])if(data.reactions?.[name])ids.add(data.reactions[name].sound);for(const item of Object.values(data.reactions?.slip||{}))if(item)ids.add(item.sound);for(const name of ['statValues','expiration'])for(const variants of Object.values(data.reactions?.[name]||{}))for(const item of Object.values(variants))if(item)ids.add(item.sound);for(const item of Object.values(data.reactions?.damageTypes||{}))if(item)ids.add(item.sound);for(const id of Object.values(data.outcome||{}))ids.add(id);for(const id of Object.values(data.ui||{}))ids.add(id);const list=[...ids].filter(Boolean),key=list.join(',');if(preloadTask&&key===preloadKey)return preloadTask;preloadKey=key;const previous=preloadTask;const task=(async()=>{if(previous)await previous;let cursor=0;await Promise.all(Array.from({length:Math.min(3,list.length)},async()=>{while(cursor<list.length)await load(list[cursor++]);}));})();preloadTask=task;void task.finally(()=>{if(preloadTask===task)preloadTask=null;});return task;}
 function sync(state){const wasOutcome=outcome;enabled=!!state.visible;paused=!!state.paused;skip=!!state.skip;outcome=!!state.defaultView?.outcome;if(!outcome)outcomePlayed=false;wanted=state.actors||[];const panel=document.getElementById('battle-audio-settings');if(panel)panel.hidden=!enabled;if(!enabled||skip||outcome&&!wasOutcome){stopEffects();stopBgm(true);}if(wasOutcome&&!outcome)stopBgm(true);if(!live()){if(context)void context.suspend().catch(warn);}else if(context){void context.resume().then(startBgm).catch(warn);preload();}}
 function play(id){if(!context||!live()||settings.muted||!data.assets[id])return;const buffer=buffers.get(id);if(!buffer){void load(id);return;}const now=context.currentTime;if(now-(recent.get(id)??-Infinity)<.04)return;recent.set(id,now);const info=data.assets[id],s=context.createBufferSource(),gain=context.createGain();s.buffer=buffer;s.playbackRate.value=info.pitch>0?info.pitch:1;gain.gain.value=info.volume??1;s.connect(gain);gain.connect(seGain);sources.add(s);s.onended=()=>{sources.delete(s);s.disconnect();gain.disconnect();};s.start();}
 async function playOutcome(winner){if(outcomePlayed||!live()||![0,1].includes(winner))return;outcomePlayed=true;stopBgm(true);
  const id=data.outcome?.[winner===0?'win':'lose'],token=epoch;if(!id)return;await unlock();await load(id);if(token===epoch&&outcome)play(id);
 }
 function setSettings(patch){settings={...settings,...patch};for(const k of ['bgm','se'])settings[k]=Math.max(0,Math.min(1,Number(settings[k])||0));settings.muted=!!settings.muted;gains();try{localStorage.setItem('rankbattle-audio',JSON.stringify(settings));}catch{}return {...settings};}
 root.RankBattleAudio={sync,play,playOutcome,unlock,prepare:preload,setSettings,getSettings:()=>({...settings}),stop(){enabled=false;stopEffects();stopBgm(true);void context?.suspend();}};
 for(const k of ['bgm','se']){const input=document.getElementById('audio-'+k),output=document.getElementById('audio-'+k+'-value');if(input){input.value=Math.round(settings[k]*100);if(output)output.textContent=input.value+'%';input.addEventListener('input',()=>{setSettings({[k]:Number(input.value)/100});if(output)output.textContent=input.value+'%';void unlock();});}}
 const mute=document.getElementById('audio-muted');if(mute){mute.checked=settings.muted;mute.addEventListener('change',()=>{setSettings({muted:mute.checked});void unlock();});}
 document.addEventListener('click',event=>{
  const button=event.target?.closest?.('button');if(!button||button.disabled||button.getAttribute?.('aria-disabled')==='true'||!live()||settings.muted)return;
  const kind=['command-back','individual-cancel','retire-battle'].includes(button.id)?'cancel':['command-status','command-info'].includes(button.id)?'select':'enter';
  const id=data.ui?.[kind];if(!id)return;
  if(context&&buffers.has(id)){play(id);return;}
  // First gesture can arrive before the local audio wrapper has decoded.
  const token=epoch;void unlock().then(()=>load(id)).then(()=>{if(token===epoch)play(id);});
 },{capture:true});
 document.addEventListener('pointerdown',unlock,{capture:true});document.addEventListener('keydown',unlock,{capture:true});document.addEventListener('visibilitychange',()=>{if(!context)return;if(document.hidden)void context.suspend();else if(live())void context.resume().then(startBgm);});root.addEventListener?.('pagehide',()=>root.RankBattleAudio.stop());
})(globalThis);
