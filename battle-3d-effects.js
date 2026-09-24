/* Native Effekseer resources, shared with the character renderer's WebGL context. */
(function(root){'use strict';
 // Effekseer caches resources by the path INSIDE SKFE, before the JS redirect.
 // GEFT bundles reuse basenames for different images. Keep each bundle's identity.
 function namespaceResources(buffer,id){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);let at=8;
  if(bytes.length<8||String.fromCharCode(...bytes.subarray(0,4))!=='SKFE'||view.getInt32(4,true)!==1610)throw Error('未対応のエフェクト形式です');
  const chunks=[bytes.subarray(0,8)];
  const integer=n=>{const b=new Uint8Array(4);new DataView(b.buffer).setInt32(0,n,true);return b;};
  const read=()=>{if(at+4>bytes.length)throw Error('エフェクト参照が不正です');const n=view.getInt32(at,true);at+=4;return n;};
  // v1610: color, normal, distortion, sound, model, material, curve paths.
  for(let table=0;table<7;table++){
   const count=read();if(count<0||count>4096)throw Error('エフェクト参照数が不正です');chunks.push(integer(count));
   for(let i=0;i<count;i++){
    const length=read();if(length<1||length>32768||at+length*2>bytes.length||view.getUint16(at+(length-1)*2,true)!==0)throw Error('エフェクト参照名が不正です');
    let path='';for(let j=0;j<length-1;j++)path+=String.fromCharCode(view.getUint16(at+j*2,true));at+=length*2;
    path=id+'/'+path.replace(/\\/g,'/').replace(/^\.\//,'');
    const encoded=new Uint8Array((path.length+1)*2),out=new DataView(encoded.buffer);for(let j=0;j<path.length;j++)out.setUint16(j*2,path.charCodeAt(j),true);
    chunks.push(integer(path.length+1),encoded);
   }
  }
  chunks.push(bytes.subarray(at));const output=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}return output.buffer;
 }
 root.RankBattleEffectResources={namespace:namespaceResources};
 root.createBattleEffects=async function(renderer,loadScript){
  const manifest=root.RankBattleVisualData,cache=new Map(),ready=new Map(),resources=new Map(),active=[];
  let context=null,disposed=false;
  // GEFT embeds visual resources but its SKFE can still request external game audio.
  // Audio is not played by this renderer. Supply valid silent PCM only for WAV references.
  const silentWave=new ArrayBuffer(46),wave=new DataView(silentWave);
  for(const [offset,text] of [[0,'RIFF'],[8,'WAVEfmt '],[36,'data']])for(let i=0;i<text.length;i++)wave.setUint8(offset+i,text.charCodeAt(i));
  wave.setUint32(4,38,true);wave.setUint32(16,16,true);wave.setUint16(20,1,true);wave.setUint16(22,1,true);wave.setUint32(24,8000,true);wave.setUint32(28,16000,true);wave.setUint16(32,2,true);wave.setUint16(34,16,true);wave.setUint32(40,2,true);
  if(!manifest||!root.effekseer||!renderer.getContext)return null;
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('エフェクト再生ライブラリの準備がタイムアウトしました')),15000);effekseer.initRuntime(root.RankBattleEffectWasm,()=>{clearTimeout(timer);resolve()},()=>{clearTimeout(timer);reject(Error('エフェクト再生ライブラリを読み込めません'))});});
  context=effekseer.createContext();context.init(renderer.getContext(),{instanceMaxCount:4000});
  context.setRestorationOfStatesFlag(true);
  context.setResourceLoader((path,ok,no)=>{
   const normalized=path.replace(/\\/g,'/'),id=normalized.split('/')[0];
   const value=resources.get(normalized)||resources.get(id+'/'+normalized.split('/').at(-1));
   if(!value&&/\.wav$/i.test(path)){ok(silentWave.slice(0));return;}
   // Audited GEFT containers omit these references. Native texture/model loaders return
   // null (0xe93e74); EffectFactory::OnLoadingResource stores it and continues.
   if(!value&&manifest.nativeAbsentResources?.[id]?.includes(normalized.split('/').at(-1))){ok(null);return;}
   if(!value){no('エフェクト素材がありません: '+path,path);return;}
   if(value.startsWith('data:image/')){const image=new Image();image.onload=()=>ok(image);image.onerror=()=>no('画像素材を読み込めません',path);image.src=value;}
   else{const raw=atob(value.slice(value.indexOf(',')+1));ok(Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer);}
  });
  const load=id=>{
   if(!cache.has(id))cache.set(id,(async()=>{
    const info=manifest.assets[id];if(!info)return null;
    if(!root.RankBattleEffectAssets?.[id])await loadScript(info.script);
    const data=root.RankBattleEffectAssets[id];
    for(const [name,value] of Object.entries(data.resources))resources.set(id+'/'+name,value);
    const bytes=namespaceResources(Uint8Array.from(atob(data.data),c=>c.charCodeAt(0)).buffer,id);
    return await new Promise((resolve,reject)=>{let effect;const timer=setTimeout(()=>reject(Error('エフェクト素材の準備がタイムアウトしました: '+info.name)),15000);effect=context.loadEffect(bytes,1,()=>{clearTimeout(timer);queueMicrotask(()=>{ready.set(id,effect);for(const key of resources.keys())if(key.startsWith(id+'/'))resources.delete(key);delete root.RankBattleEffectAssets[id];resolve(effect)})},message=>{clearTimeout(timer);reject(Error(String(message)+' '+info.name))},path=>{const name=path.replace(/\\/g,'/').replace(/^\.\//,'');return name.startsWith(id+'/')?name:id+'/'+name;});});
   })().catch(error=>{console.warn('Battle effect:',id,error);root.parent?.postMessage({type:'rank-battle-3d-warning',message:'一部のエフェクトを準備できませんでした: '+(manifest.assets[id]?.name||id)},'*');return null}));
   return cache.get(id);
  };
  return {
   async prepare(actors){const ids=new Set([...Object.values(manifest.conditions||{}),...Object.values(manifest.reactions||{})].flatMap(d=>d.effects||[]));for(const uid of [0x8602009b,...actors.map(a=>Number(a.actionUid))])for(const d of manifest.actions[uid]||[])for(const id of d?.effects||[])ids.add(id);for(const id of ids)await load(id);},
   play(ids,position,placements=[],resolve){for(const [index,id] of (ids||[]).entries()){const effect=ready.get(id);if(!effect||disposed)continue;const info=placements[index]?.asset===id?placements[index]:placements.find(p=>p.asset===id);const transform=info&&resolve?resolve(info):{position,scale:1,rotation:[0,0,0]},at=transform.position;const handle=context.play(effect,at.x,at.y,at.z);if(handle){handle.setScale?.(transform.scale,transform.scale,transform.scale);handle.setRotation?.(...transform.rotation);active.push({handle,resolve:info&&info.attach!==0&&resolve?()=>resolve(info):null});}}},
   update(dt){if(!context||disposed)return;for(let i=active.length-1;i>=0;i--){const item=active[i];if(item.handle.exists===false){active.splice(i,1);continue;}if(!item.resolve)continue;const t=item.resolve();item.handle.setLocation?.(t.position.x,t.position.y,t.position.z);item.handle.setRotation?.(...t.rotation);}let remaining=Math.max(0,dt)*60;while(remaining>0){const step=Math.min(1,remaining);context.update(step);remaining-=step;}},
   draw(camera){if(!context||disposed||!active.length)return;context.setProjectionMatrix(camera.projectionMatrix.elements);context.setCameraMatrix(camera.matrixWorldInverse.elements);context.draw();if(renderer.resetState)renderer.resetState();else renderer.state?.reset();},
   clear(){context.stopAll();active.length=0;},
   dispose(){disposed=true;context.stopAll();for(const effect of ready.values())context.releaseEffect(effect);ready.clear();effekseer.releaseContext(context);resources.clear();}
  };
 };
})(globalThis);
