(()=>{'use strict';
 const samples=[];const clock=()=>performance.now();
 async function timed(kind,name,fn){const start=clock();try{return await fn();}finally{samples.push({kind,name,ms:clock()-start});if(samples.length>512)samples.shift();}}
 async function pool(rows,run,limit=4){let next=0;await Promise.all(Array.from({length:Math.min(limit,rows.length)},async()=>{while(next<rows.length){const row=rows[next++];await run(row);}}));}
 const buffers=new Map();
 async function preloadModel(record){
  if(!buffers.has(record.prepared))buffers.set(record.prepared,timed('network-model',record.prepared,async()=>{const response=await fetch(record.prepared);if(!response.ok)throw Error('モデル素材を読み込めません: '+response.status);return response.arrayBuffer();}).catch(e=>{buffers.delete(record.prepared);throw e}));
  const buffer=await buffers.get(record.prepared);while(buffers.size>64)buffers.delete(buffers.keys().next().value);return buffer;
 }
 async function prepared(record,mtl){
  const buffer=await preloadModel(record);
  return timed('assemble-model',record.prepared,async()=>{
   const view=new DataView(buffer);if(view.getUint32(0,true)!==0x31475044)throw Error('モデル形式が不正です');
   const size=view.getUint32(4,true),header=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,8,size))),start=8+size;
   const array=name=>{const d=header.arrays[name],T={Float32Array,Uint32Array,Uint16Array}[d.type];return new T(buffer.slice(start+d.offset,start+d.offset+d.bytes));};
   const geometry=new THREE.BufferGeometry();for(const [name,arity]of [['position',3],['normal',3],['uv',2]])geometry.setAttribute(name,new THREE.BufferAttribute(array(name),arity));geometry.setIndex(new THREE.BufferAttribute(array('index'),1));
   for(const g of header.groups)geometry.addGroup(g.start,g.count,g.materialIndex);geometry.computeBoundingBox();geometry.computeBoundingSphere();
   const creator=new MTLLoader().parse(mtl,'');creator.preload();const materials=header.materialNames.map(n=>materialFor(creator,n));const mesh=new THREE.Mesh(geometry,materials.length===1?materials[0]:materials),object=new THREE.Group();object.add(mesh);
   return {object,mesh,materialNames:header.materialNames,sourceIndices:array('sourceIndices'),sourcePositions:array('sourcePositions'),sourceNormals:array('sourceNormals')};
  });
 }
 async function asset(text,mtl){if(text?.prepared)return prepared(text,mtl);return timed('parse-model','OBJ',async()=>{const url=URL.createObjectURL(new Blob([text],{type:'text/plain'}));try{return await loadIndexedObj({obj:url,mtl:'',mtlText:mtl});}finally{URL.revokeObjectURL(url);}});}
 function equipmentRequests(specs){const rows=new Map();const add=(kind,path)=>{if(path)rows.set(kind+':'+path,[kind,path]);};for(const spec of specs)for(const uid of Object.values(spec.equipment||{})){const r=globalThis.DENPA_REGISTRATION?.items?.[uid];if(!r)continue;add('objects',r.visual?r.obj:null);add('motions',r.animation?.type==='mapped-skin'?r.animation.url:null);const folder=(r.mtl||'').slice(0,(r.mtl||'').lastIndexOf('/')+1);for(const match of String(r.mtlText||'').matchAll(/^map_Kd\s+(?:-[^\s]+\s+)*(.+)$/gm))add('textures',folder+match[1].trim());}return [...rows.values()];}
 globalThis.RankAssetLoader={asset,preloadModel,pool,timed,samples,equipmentRequests,key:text=>text?.prepared||text,report(){return {samples:[...samples],resources:performance.getEntriesByType('resource').filter(r=>/^https?:/.test(r.name)).map(r=>({name:r.name,duration:r.duration,transferSize:r.transferSize,decodedBodySize:r.decodedBodySize}))};}};
})();
