// Native round_shadow (100x100): body follows spine; head follows its bone on the ground.
(function(root){'use strict';
function create(THREE,scene){
 const data=root.RankBattleShadowData;if(!data)return null;
 const texture=new THREE.TextureLoader().load(data.image);texture.flipY=false;
 const geometry=new THREE.PlaneGeometry(data.size,data.size);geometry.rotateX(-Math.PI/2);
 const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,toneMapped:false});
 const entries=new Map(),point=new THREE.Vector3();
 function update(actors){
  for(const [key,meshes]of entries)if(!actors.has(key)){for(const mesh of meshes)scene.remove(mesh);entries.delete(key);}
  for(const [key,e]of actors){let meshes=entries.get(key);if(!meshes){meshes=[new THREE.Mesh(geometry,material),new THREE.Mesh(geometry,material)];for(const m of meshes){m.renderOrder=1;scene.add(m);}entries.set(key,meshes);}
   e.model.root.updateMatrixWorld(true);
   ['spine','head'].forEach((bone,i)=>{const mesh=meshes[i];mesh.visible=e.model.root.visible;if(!mesh.visible)return;
    const matrix=e.model.attachment([bone]);point.set(0,0,0);if(matrix)point.setFromMatrixPosition(matrix);point.applyMatrix4(e.model.root.matrixWorld);
    mesh.position.set(point.x,.2+i*.02,point.z);
    const body=root.DENPA_ASSETS?.catalog?.bodyTypes?.find(b=>String(b.id)===String(e.model.bodyUid));
    const scale=i===0?(body?.bodyWidthScale||1):(body?.headScale||1);mesh.scale.set(scale,1,scale);
   });
  }
 }
 return {update,dispose(){for(const meshes of entries.values())for(const m of meshes)scene.remove(m);entries.clear();geometry.dispose();material.dispose();texture.dispose();}};
}
root.RankBattleShadows={create};
})(globalThis);
