(function(root){'use strict';
 // Non-blocking WebGL2 timers: never wait for results or force GPU completion.
 root.createBattleGpuTimer=function(gl){
  let ext=null;try{if(gl?.createQuery)ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');}catch{}
  let pending=[],running=null,last=null,frame=0,lost=false;
  const clear=()=>{for(const q of pending)gl.deleteQuery(q);pending=[];last=null;};
  gl?.canvas?.addEventListener?.('webglcontextlost',()=>{lost=true;pending=[];running=null;last=null;});
  gl?.canvas?.addEventListener?.('webglcontextrestored',()=>{lost=false;});
  return {begin(){if(!ext||lost)return;try{
   if(pending.length){if(gl.getParameter(ext.GPU_DISJOINT_EXT)){clear();}else if(gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)){const q=pending.shift();last=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(q);}}
   // Sparse samples keep instrumentation overhead low and avoid a growing queue.
   if(++frame%15===0&&pending.length<4){running=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,running);}
  }catch{ext=null;}},end(){if(!running||lost)return;try{gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(running);}catch{ext=null;}running=null;},read(){return {supported:!!ext,lastMs:last===null?null:+last.toFixed(2)};}};
 };
 function watchLongTasks(callback){try{if(root.PerformanceObserver?.supportedEntryTypes?.includes('longtask')){const observer=new root.PerformanceObserver(list=>{for(const e of list.getEntries())callback(e.duration);});observer.observe({type:'longtask',buffered:false});}}catch{}}
 root.createBattleDiagnostics=function(renderer,canvas){
  let longTaskCount=0,longTaskMax=0;watchLongTasks(ms=>{longTaskCount++;longTaskMax=Math.max(longTaskMax,ms);});
  const now=()=>performance.now();let frames=0,start=0,last=0,sums={},lastPublish=0,previousFrame=null,frameGaps=[],maxStages={};
  const send=(kind,data)=>root.parent?.postMessage({type:'rank-battle-diagnostics',kind,time:Date.now(),...data},'*');
  canvas.addEventListener?.('webglcontextlost',e=>{send('context-lost',{message:'WebGLコンテキストが失われました。',detail:String(e.statusMessage||'').slice(0,300)});});
  canvas.addEventListener?.('webglcontextrestored',()=>send('context-restored',{}));
  root.addEventListener?.('error',e=>send('error',{message:String(e.message||'描画エラー').slice(0,500)}));
  root.addEventListener?.('unhandledrejection',e=>send('error',{message:String(e.reason?.message||e.reason||'非同期処理エラー').slice(0,500)}));
  return {begin(time){if(!start||time-lastPublish>3000){start=time;frames=0;sums={};}if(previousFrame!==null&&time>=previousFrame)frameGaps.push(time-previousFrame);previousFrame=time;lastPublish=time;last=now();},mark(name){const t=now();const elapsed=t-last;sums[name]=(sums[name]||0)+elapsed;maxStages[name]=Math.max(maxStages[name]||0,elapsed);last=t;},end(time,extra){frames++;if(time-start<1000)return;const info=renderer.info,heap=root.performance?.memory,sorted=frameGaps.slice().sort((a,b)=>a-b);send('sample',{longTasks:{count:longTaskCount,maxMs:+longTaskMax.toFixed(2)},fps:+(frames*1000/(time-start)).toFixed(1),frameMs:{p95:+(sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]||0).toFixed(2),max:+(sorted.at(-1)||0).toFixed(2)},cpuMaxMs:Object.fromEntries(Object.entries(maxStages).map(([k,v])=>[k,+v.toFixed(2)])),cpuMs:Object.fromEntries(Object.entries(sums).map(([k,v])=>[k,+(v/frames).toFixed(2)])),drawCalls:info?.render?.calls??null,triangles:info?.render?.triangles??null,geometries:info?.memory?.geometries??null,textures:info?.memory?.textures??null,programs:info?.programs?.length??null,jsHeapMiB:heap?+(heap.usedJSHeapSize/1048576).toFixed(1):null,canvas:[canvas.width,canvas.height],...extra});start=time;frames=0;sums={};frameGaps=[];maxStages={};longTaskCount=0;longTaskMax=0;}};
 };
 const output=root.document?.getElementById('battle-diagnostics-output');if(!output)return;
 const key='rankbattle-last-diagnostics';let previous=null,records=[],lastSaved=0;
 try{previous=JSON.parse(root.localStorage?.getItem(key)||'null');}catch{}
 const report=()=>({version:3,userAgent:root.navigator?.userAgent||'',savedAt:new Date().toISOString(),records});
 function save(){try{root.localStorage?.setItem(key,JSON.stringify(report()));}catch{}}
 root.RankBattleDiagnosticsPanel={receive(data){records.push(data);if(records.length>60)records.shift();if(data.kind==='sample'){const stages=Object.entries(data.cpuMs).map(([k,v])=>k+': '+v+' ms').join(' / ');output.textContent='FPS: '+data.fps+' / 表示キャラ: '+data.visibleActors+'\nキャラ描画命令等: '+data.drawCalls+' / 三角形: '+data.triangles+'\n'+stages+'\nテクスチャ数: '+data.textures+' / ジオメトリ数: '+data.geometries+' / JSヒープ: '+(data.jsHeapMiB??'取得不可')+' MiB\nエフェクト: '+data.effectMode+' / キャラ変形停止: '+data.frozen+' / 再生エフェクト: '+(data.activeEffects??'不明')+'\nGPU時間: '+(data.gpu?.lastMs??'取得不可')+' ms / 長時間処理: '+(data.longTasks?.maxMs??0)+' ms\n最長フレーム: '+(data.frameMs?.max??'不明')+' ms / GPU設定読み戻し: '+(data.effectStateReadback===false?'省略':'あり・不明')+'\n描画CPU時間はGPU完了時間ではありません。メモリーはGPUやブラウザー全体を含みません。';}else output.textContent+='\n'+data.kind+': '+(data.message||'');if(data.kind!=='sample'||Date.now()-lastSaved>=5000){lastSaved=Date.now();save();}}};
 watchLongTasks(ms=>root.RankBattleDiagnosticsPanel.receive({kind:'parent-long-task',time:Date.now(),durationMs:+ms.toFixed(2)}));
 root.document.getElementById('save-battle-diagnostics')?.addEventListener('click',()=>{save();const url=URL.createObjectURL(new Blob([JSON.stringify({current:report(),previous},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='rankbattle-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 if(previous)output.textContent='前回の診断記録があります。「診断結果を保存」で今回と前回の記録を保存できます。';
})(globalThis);
