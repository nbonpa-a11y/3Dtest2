(function(root){'use strict';
 root.createBattleDiagnostics=function(renderer,canvas){
  const now=()=>performance.now();let frames=0,start=0,last=0,sums={},lastPublish=0;
  const send=(kind,data)=>root.parent?.postMessage({type:'rank-battle-diagnostics',kind,time:Date.now(),...data},'*');
  canvas.addEventListener?.('webglcontextlost',e=>{send('context-lost',{message:'WebGLコンテキストが失われました。',detail:String(e.statusMessage||'').slice(0,300)});});
  canvas.addEventListener?.('webglcontextrestored',()=>send('context-restored',{}));
  root.addEventListener?.('error',e=>send('error',{message:String(e.message||'描画エラー').slice(0,500)}));
  root.addEventListener?.('unhandledrejection',e=>send('error',{message:String(e.reason?.message||e.reason||'非同期処理エラー').slice(0,500)}));
  return {begin(time){if(!start||time-lastPublish>3000){start=time;frames=0;sums={};}lastPublish=time;last=now();},mark(name){const t=now();sums[name]=(sums[name]||0)+t-last;last=t;},end(time,extra){frames++;if(time-start<1000)return;const info=renderer.info,heap=root.performance?.memory;send('sample',{fps:+(frames*1000/(time-start)).toFixed(1),cpuMs:Object.fromEntries(Object.entries(sums).map(([k,v])=>[k,+(v/frames).toFixed(2)])),drawCalls:info?.render?.calls??null,triangles:info?.render?.triangles??null,geometries:info?.memory?.geometries??null,textures:info?.memory?.textures??null,programs:info?.programs?.length??null,jsHeapMiB:heap?+(heap.usedJSHeapSize/1048576).toFixed(1):null,canvas:[canvas.width,canvas.height],...extra});start=time;frames=0;sums={};}};
 };
 const output=root.document?.getElementById('battle-diagnostics-output');if(!output)return;
 const key='rankbattle-last-diagnostics';let previous=null,records=[],lastSaved=0;
 try{previous=JSON.parse(root.localStorage?.getItem(key)||'null');}catch{}
 const report=()=>({version:1,userAgent:root.navigator?.userAgent||'',savedAt:new Date().toISOString(),records});
 function save(){try{root.localStorage?.setItem(key,JSON.stringify(report()));}catch{}}
 root.RankBattleDiagnosticsPanel={receive(data){records.push(data);if(records.length>60)records.shift();if(data.kind==='sample'){const stages=Object.entries(data.cpuMs).map(([k,v])=>k+': '+v+' ms').join(' / ');output.textContent='FPS: '+data.fps+' / 表示キャラ: '+data.visibleActors+'\nキャラ描画命令等: '+data.drawCalls+' / 三角形: '+data.triangles+'\n'+stages+'\nテクスチャ数: '+data.textures+' / ジオメトリ数: '+data.geometries+' / JSヒープ: '+(data.jsHeapMiB??'取得不可')+' MiB\nエフェクト: '+data.effectMode+' / キャラ変形停止: '+data.frozen+'\n描画CPU時間はGPU完了時間ではありません。メモリーはGPUやブラウザー全体を含みません。';}else output.textContent+='\n'+data.kind+': '+(data.message||'');if(data.kind!=='sample'||Date.now()-lastSaved>=5000){lastSaved=Date.now();save();}}};
 root.document.getElementById('save-battle-diagnostics')?.addEventListener('click',()=>{save();const url=URL.createObjectURL(new Blob([JSON.stringify({current:report(),previous},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='rankbattle-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 if(previous)output.textContent='前回の診断記録があります。「診断結果を保存」で今回と前回の記録を保存できます。';
})(globalThis);
