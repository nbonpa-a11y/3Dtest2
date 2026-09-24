/* Native GMDL geometry and KTX textures; shared in the character WebGL scene. */
(function(root){'use strict';
 function create(THREE,data=root.RankBattleArenaData){
  if(!data)return null;
  const group=new THREE.Group();group.name='native-rank-arena';const textures=new Map(),materials=[];
  for(const [name,url] of Object.entries(data.textures)){const t=new THREE.TextureLoader().load(url);t.flipY=false;t.encoding=THREE.sRGBEncoding;t.wrapS=t.wrapT=THREE.RepeatWrapping;textures.set(name,t);}
  for(const row of data.meshes){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(row.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(row.normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(row.uv,2));g.setIndex(row.indices);
   if(row.colors)g.setAttribute('color',new THREE.Uint8BufferAttribute(row.colors,4,true));
   const source=data.materials[row.material],m=new THREE.MeshBasicMaterial({map:textures.get(source.texture),vertexColors:!!row.colors,side:THREE.DoubleSide,transparent:row.alphaBlend,depthWrite:!row.alphaBlend,toneMapped:false});materials.push(m);const mesh=new THREE.Mesh(g,m);mesh.name=row.material;group.add(mesh);
  }
  return {group,dispose(){group.traverse(o=>o.geometry?.dispose());for(const m of materials)m.dispose();for(const t of textures.values())t.dispose();group.parent?.remove(group);}};
 }
 root.RankBattleArena={create};if(typeof module!=='undefined')module.exports=root.RankBattleArena;
})(globalThis);
