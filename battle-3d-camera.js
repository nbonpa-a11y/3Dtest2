/* GCAM v1: CameraCurveData::GetValue uses clamped integer-frame samples (60 Hz). */
(function(root){'use strict';
 function name(view){const count=view.count||8,size=count<=2?'S':count<=4?'M':'L';
  if(view.mode==='attack'){const c=Math.max(view.targetCount>=6?3:view.targetCount>=3?2:1,view.battleSize||1);return 'cam_btl_'+(view.side===1?'enatk_'+(c>=3?'L':c===2?'M':'S'):'pcatk_'+(c>=4?'LL':c===3?'L':c===2?'M':'S')+'01')+'.gcam';}
  if(view.mode==='actor')return view.stage==='attack'&&!view.jackReverse?'cam_btl_'+(view.side===1?'enatk_S':'pcatk_S01')+'.gcam':view.side===1?'cam_btl_enskill_S.gcam':'cam_btl_pcskill.gcam';
  if(view.coverReaction)return view.side===0?'cam_btl_pclook_LL.gcam':'cam_btl_enlook_'+(view.battleSize>3?'LL':'L')+'.gcam';
  if(view.outcome)return 'cam_btl_result_LL.gcam';
  if(view.front&&!view.hpBars)return 'cam_btl_resultwait_LL.gcam';
  return 'cam_btl_'+'enlook_'+size+'.gcam';
 }
 function profile(view){return root.RankBattleCameraProfiles?.[name(view)];}
 function sample(p,seconds){if(!p)return null;const frame=Math.min(p.frames-1,Math.max(0,Math.floor(seconds*60+1e-7))),out={position:p.position.slice(),target:p.target.slice(),up:p.up.slice(),fov:p.fov,near:p.near,far:p.far,aspect:p.aspect,frame};
  for(const t of p.tracks||[]){const value=t.values[Math.min(frame,t.values.length-1)];if(t.kind===4)out.fov=value;else{const field=['position','target','rotation','up'][t.kind];if(field==='rotation')throw Error('Unexported rotation camera');out[field][t.axis]=value;}}
  return out;
 }
 function pose(view,width,height,seconds=0,anchor){const p=profile(view);if(!p)return null;const out=sample(p,view.mode==='team'&&!view.outcome?0:seconds);
  // Characters and cameras share native units. Attachment follows the displayed party/actor.
  const at=anchor||[0,0,view.side===0?250:-250];out.position=out.position.map((v,i)=>v+at[i]);out.target=out.target.map((v,i)=>v+at[i]);
  // Enemy hit/look cameras face +Z; mirror them when presenting the player's side.
  if(view.mode!=='actor'&&view.mode!=='attack'&&view.side===0&&!view.coverReaction){out.position[0]=at[0]-(out.position[0]-at[0]);out.position[2]=at[2]-(out.position[2]-at[2]);out.target[0]=at[0]-(out.target[0]-at[0]);out.target[2]=at[2]-(out.target[2]-at[2]);out.up[0]*=-1;out.up[2]*=-1;}
  // Preserve native horizontal framing on wide/narrow browser stages.
  out.fov=2*Math.atan(Math.tan(out.fov*Math.PI/360)*p.aspect/(width/height))*180/Math.PI;
  return {...out,profile:p.resource,name:name(view)};
 }
 function number(value){return String(value).replace(/^\+/,'').replace(/\d+/g,n=>n.replace(/\B(?=(\d{3})+(?!\d))/g,','));}
 // BattleCharacter::Impl::Update 0x9246d0: face camera using X/Z only.
 function faceParty(model,camera,view){
  if(view.mode!=='team')return;
  const dx=camera.position.x-model.position.x,dz=camera.position.z-model.position.z;
  if(Math.abs(dx)>1e-5||Math.abs(dz)>1e-5)model.rotation.y=Math.atan2(dx,dz);
 }
 root.RankBattleCamera={pose,profile,sample,name,number,faceParty};if(typeof module!=='undefined')module.exports=root.RankBattleCamera;
})(globalThis);
