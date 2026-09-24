/* Presentation coordinates from ChrObject::GetAttachPos / Monitor::Update.
 * All random-looking popup offsets are local hashes; battle RNG is never consumed. */
(function(root){'use strict';
 function body(entry){return root.RankBattleNativeLayout?.bodies[entry.model.bodyUid]||{height:150,radius:70};}
 function numberAnchor(THREE,entry,camera){const b=body(entry),point=entry.model.root.position.clone();point.y+=b.height;
  const forward=camera.position.clone().sub(point).normalize();return point.addScaledVector(forward,Math.max(70,b.radius));
 }
 function effect(THREE,entry,info,camera){const b=body(entry),at=entry.model.root.position.clone(),rotation=entry.model.root.rotation.y,local=new THREE.Vector3(...info.offset);
  // Native attachment 4 = root, 5/6 = half height, 8/9 = height + 10.
  const bone=info.attach===1?entry.model.attachment?.(info.bones||[]):null;
  if(bone)local.applyMatrix4(bone);
  else if([5,6,11].includes(info.attach))local.y+=b.height*.5;
  else if([8,9].includes(info.attach))local.y+=b.height+10;
  else if(info.attach===3)local.y+=b.height;
  local.applyAxisAngle(new THREE.Vector3(0,1,0),rotation);at.add(local);
  // ChrEffect 0x98142c: signed effect-data +0x22 offsets toward the camera.
  if(info.cameraOffset&&camera){const toward=camera.position.clone().sub(at);if(toward.lengthSq()>0)at.addScaledVector(toward.normalize(),info.cameraOffset);}
  const angles=info.rotation.map(v=>v*Math.PI/180);angles[1]+=rotation;
  if(info.billboard)angles[1]=Math.atan2(camera.position.x-at.x,camera.position.z-at.z);
  return {position:at,rotation:angles,scale:info.scale};
 }
 // DirectUpdater::Impl::Setup takes camera offset X only (0x9a7554).
 // Field effects already contain their authored depth; do not add the party Z again.
 function field(THREE,info,side,centerX=0){const position=new THREE.Vector3(...(info.offset||[0,0,0])),rotation=(info.rotation||[0,0,0]).map(v=>v*Math.PI/180);if(side===0){position.x*=-1;position.z*=-1;rotation[1]+=Math.PI;}position.x+=centerX;return {position,rotation,scale:info.scale??1};}
 function numberEm(critical,unit){const panes=root.RankBattleNativeLayout?.layouts['423']?.panes;const size=panes?.[critical?'Text_Damage01':'Text_Damage']?.fontSize||(critical?44:37);return 48*Math.floor(size*100/61)/100*unit;}
 function popupOffset(index,key='',unit=1){let hash=2166136261;for(const c of key+':'+index)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;const a=(hash&65535)/65536,b=(hash>>>16)/65536;
  return {x:(index?([0,70,-70][index%3]+(a*2-1)*30):0)*unit,y:-(index?100:40)*b*unit};
 }
 root.RankBattlePlacement={body,numberAnchor,effect,field,numberEm,popupOffset};if(typeof module!=='undefined')module.exports=root.RankBattlePlacement;
})(globalThis);
