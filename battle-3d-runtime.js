(async()=>{'use strict';
 const canvas=document.getElementById('canvas'),status=document.getElementById('status');
 const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.setClearColor(0x000000,0);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33.4,1.778125,100,10000);
 camera.position.set(0,100,1800);camera.lookAt(0,100,0);
 scene.add(new THREE.HemisphereLight(0xffffff,0x33405b,2.2));const light=new THREE.DirectionalLight(0xffffff,2.8);light.position.set(3,5,4);scene.add(light);
 const fill=new THREE.DirectionalLight(0x91c8ff,1.4);fill.position.set(-4,2,-3);scene.add(fill);
 let loadingImages=0;const imageWaiters=[],imageErrors=[],manager=THREE.DefaultLoadingManager,startItem=manager.itemStart.bind(manager),endItem=manager.itemEnd.bind(manager);
 manager.onError=url=>imageErrors.push(url);manager.itemStart=url=>{loadingImages++;startItem(url)};manager.itemEnd=url=>{endItem(url);loadingImages--;if(!loadingImages)imageWaiters.splice(0).forEach(f=>f())};
 const textures=new Map(),bodies=new Map(),assets=new Map(),resources=new Map(),motions=new Map();
 const loadScript=src=>new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=()=>{s.remove();ok()};s.onerror=()=>{s.remove();no(Error('素材を読み込めません: '+src))};document.head.append(s)});
 const shared={motions,
 texture(url,key){if(!url)return null;if(!textures.has(key)){const t=new THREE.TextureLoader().load(url);t.flipY=false;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.encoding=THREE.sRGBEncoding;textures.set(key,t)}return textures.get(key)},
 body(key,create){if(!bodies.has(key))bodies.set(key,create());return bodies.get(key)},
 async imagesReady(){if(loadingImages)await new Promise(f=>imageWaiters.push(f));if(imageErrors.length)throw Error('画像素材の読み込みに失敗しました')},
 async resource(kind,path){const key=kind+':'+path;if(!resources.has(key))resources.set(key,(async()=>{const entry=DENPA_EQUIPMENT_INDEX[kind]?.[path];if(!entry)throw Error('装備素材がありません: '+path);const cache=DENPA_EQUIPMENT_CACHE[kind];if(!cache[entry.key])await loadScript(entry.script);if(!cache[entry.key])throw Error('装備素材が空です');return cache[entry.key]})());return resources.get(key)},
 async asset(text,mtl){const key=mtl+'\n'+text;if(!assets.has(key))assets.set(key,(async()=>{const url=URL.createObjectURL(new Blob([text],{type:'text/plain'}));try{return await loadIndexedObj({obj:url,mtl:'',mtlText:mtl.replace(/^map_Kd.*$/gm,'')})}finally{URL.revokeObjectURL(url)}})());
  const pending=assets.get(key),template=await pending;assets.delete(key);assets.set(key,pending);const mesh=template.mesh.clone();mesh.geometry=template.mesh.geometry.clone();mesh.material=Array.isArray(template.mesh.material)?template.mesh.material.map(m=>m.clone()):template.mesh.material.clone();
  for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){m.side=THREE.DoubleSide;m.shininess=0}
  const object=new THREE.Group();object.add(mesh);while(assets.size>24){const oldest=assets.keys().next().value,item=assets.get(oldest);assets.delete(oldest);item.then(t=>{t.mesh.geometry.dispose();for(const m of Array.isArray(t.mesh.material)?t.mesh.material:[t.mesh.material])m.dispose();});}return {...template,object,mesh,materialNames:template.materialNames.slice()};
 }
 };
 const names=['待機','ふらふら','倒れる','もがく','待機（反転）','走る','前進','技1','技2','防御','回避','ダメージ','ダウン','起き上がる','喜ぶ','悲しむ','楽しむ'];
 // Motion scripts publish one shared slot, so load them sequentially exactly once.
 async function loadMotions(list){for(const name of new Set(list)){if(motions.has(name))continue;const row=DENPA_MOTIONS.animations.find(x=>x.labelJa===name);if(!row)throw Error('モーションがありません: '+name);await loadScript(row.script);motions.set(name,await loadMotion(DENPA_MOTION_DATA,false));globalThis.DENPA_MOTION_DATA=null;}}
 // Standing actors need only these clips. Other battle clips prepare in the background.
 await loadMotions(['待機','待機（反転）','倒れる']);
 const motionsReady=loadMotions([...names,...Object.values(globalThis.RankBattleVisualData?.reactions||{}).map(d=>d.motion).filter(Boolean),...Object.values(globalThis.RankBattleVisualData?.conditions||{}).map(d=>d.motion).filter(Boolean)]).then(()=>null,error=>error);
 let fx=null;const effectsReady=Promise.resolve().then(()=>globalThis.createBattleEffects?.(renderer,loadScript)).then(value=>{if(disposed)value?.dispose();else{fx=value;renderer.resetState?.();}}).catch(error=>{console.warn('Battle effects unavailable:',error);parent.postMessage({type:'rank-battle-3d-warning',message:'エフェクトを準備できなかったため、モーションのみ再生します。'},'*');});
 const shadows=globalThis.RankBattleShadows?.create(THREE,scene);
 const arena=globalThis.RankBattleArena?.create(THREE);if(arena)scene.add(arena.group);
 let lastOutcomeY=null;
 let cameraTime=0,cameraView=null,cameraAnchor=null;
 const actors=new Map();let desired=[],revision=0,building=false,paused=false,visible=true,busy=false,last=0,width=0,height=0,disposed=false,view={mode:'team',side:1},phase=null;const labels=new Map(),overlay=document.getElementById('overlays');
 function setLabel(entry,data){
  const raw=String(data.text??''),number=raw.replace(/^AP\s*/,''),numeric=['damage','heal','ap'].includes(data.tone)&&/^[+-]?\d+(?:[、,\s]+[+-]?\d+)*$/.test(number);
  if(numeric){
   const values=data.amounts||[],signature=JSON.stringify([number,data.tone,values,data.critical,data.criticals,data.enhanced,data.enhanceds]);if(entry.amountSignature!==signature){entry.amountSignature=signature;
   globalThis.RankBattleNumbers?.clear(entry.label);entry.label.textContent=values.length>1?'':(globalThis.RankBattleCamera?.number(number)??number);entry.label.className='amount '+data.tone+(values.length>1?' multi':data.critical?' critical':'');
   if(values.length<=1)globalThis.RankBattleNumbers?.render(entry.label,entry.label.textContent,data.enhanced?'enhanced':data.tone);
   if(values.length>1){values.forEach((value,i)=>{const piece=document.createElement('span');piece.className='damage-piece'+(data.criticals?.[i]?' critical':'');piece.textContent=globalThis.RankBattleCamera?.number(value)??value;globalThis.RankBattleNumbers?.render(piece,piece.textContent,data.enhanceds?.[i]?'enhanced':data.tone);const offset=RankBattlePlacement.popupOffset(i,entry.track.actor.key);piece.style.left=offset.x+'px';piece.style.top=offset.y+'px';piece.popupIndex=i;entry.label.append(piece);});}
   }
  }
  else{const text=RankBattleMotion.sceneFootText(raw,entry.seenFootNotices??=new Set());if(text!==null){entry.amountSignature=null;entry.label.textContent='';globalThis.RankBattleNumbers?.clear(entry.label);entry.foot.textContent=text;}}
  if(data.footText!==undefined){const text=RankBattleMotion.sceneFootText(data.footText,entry.seenFootNotices??=new Set());if(text!==null)entry.foot.textContent=text;}
 }
 function animateNumbers(entry,dt){RankBattleNumbers.animate?.(entry.label,dt);for(const piece of entry.label.children)RankBattleNumbers.animate?.(piece,dt);}
 function pose(entry,dt){animateNumbers(entry,dt);const sample=entry.track.sample(dt,motions);entry.model.setMotion(sample.name,{smooth:!!sample.conditionUid||!!sample.smooth,snap:!!entry.poseSnap});entry.poseSnap=false;entry.model.update(sample.seconds,dt);
  // Native UpdateMoveToBack resets position/facing and resumes wait on arrival.
  const currentStep=entry.track.steps.filter(s=>s.at<=entry.track.time).at(-1);
  if(currentStep?.travel==='return'&&entry.track.time>=currentStep.at+currentStep.duration){entry.returning=false;entry.staged=false;entry.strikePosition=null;}
  if(entry.basePosition){entry.model.root.position.copy(entry.basePosition);if(view.mode==='attack'&&(entry.track.actor.key===view.key||entry.returning||entry.staged)&&entry.strikePosition){let travel=sample.travel;let t=travel?Math.min(1,sample.age/sample.length):1;if(view.batch){const active=entry.track.steps.filter(s=>s.travel&&s.at<=entry.track.time).at(-1);travel=active?.travel;t=active?Math.min(1,(entry.track.time-active.at)/active.duration):0;entry.returning=travel==='return';}entry.model.root.position.lerp(entry.strikePosition,travel==='return'?1-t:!travel&&entry.returning?0:t);const direction=entry.strikePosition.clone().sub(entry.basePosition);entry.model.root.rotation.y=Math.atan2(direction.x,direction.z)+(travel==='return'?Math.PI:0);}else if(sample.travel){const t=Math.min(1,sample.age/sample.length),sign=entry.track.actor.side?-1:1;entry.model.root.position.x+=sign*(sample.travel==='return'?-t*120:(t-1)*120);entry.model.root.rotation.y=sign*(sample.travel==='return'?-Math.PI/2:Math.PI/2);}else entry.model.root.rotation.y=entry.track.actor.side===0?Math.PI:0;}

  if(sample.token){const offset=RankBattlePlacement.popupOffset(0,entry.track.actor.key,width/1280);entry.label.style.transform='translate(-50%,calc(-50% + '+(entry.label.children.length?0:offset.y)+'px))';}
 }
 function layout(){const keys=new Set(RankBattleMotion.visibleKeys(desired,view)),front=(view.mode==='attack'?[]:view.guardians||[]).filter(k=>keys.has(k));for(const [key,e]of actors){const a=e.track.actor;e.model.root.visible=keys.has(key);e.label.hidden=e.foot.hidden=!keys.has(key);const index=front.indexOf(key);const party=desired.filter(v=>v.side===a.side),order=party.findIndex(v=>v.key===key),sign=a.side===0&&view.mode!=='attack'?-1:1;e.model.root.position.set(view.mode==='actor'?0:sign*(index>=0?(index-(front.length-1)/2)*150:(order-(party.length-1)/2)*150),0,(a.side===0?250:-250)+(index>=0?(a.side===0?-160:160):0));e.basePosition=e.model.root.position.clone();e.strikePosition=null;e.model.root.rotation.y=a.side===0?Math.PI:0;e.hp.hidden=!keys.has(key)||!view.hpBars;const ratio=a.maxHp>0?Math.max(0,Math.min(1,a.hp/a.maxHp)):0;e.hpFill.style.width=ratio*100+'%';e.hp.title='HP '+a.hp+' / '+a.maxHp;RankBattleHud.update(e.hud,a);}
  if(view.mode==='attack')for(const move of (view.chainMoves||[{key:view.key,targetKey:view.targetKey,targetKeys:view.targetKeys}])){const a=actors.get(move.key),t=actors.get(move.targetKey);if(a&&t){const b=RankBattlePlacement.body(a),tb=RankBattlePlacement.body(t);view.battleSize=Math.max(view.battleSize||1,b.battleSize||1,tb.battleSize||1);const range=(move.targetKeys||[move.targetKey]).map(k=>actors.get(k)?.basePosition).filter(Boolean);const center=t.basePosition.clone();if(range.length){center.x=(Math.min(...range.map(p=>p.x))+Math.max(...range.map(p=>p.x)))/2;center.z=(Math.min(...range.map(p=>p.z))+Math.max(...range.map(p=>p.z)))/2;}a.strikePosition=center;const direction=a.basePosition.clone().sub(center);direction.y=0;if(direction.lengthSq()<1)direction.set(0,0,a.track.actor.side===0?1:-1);direction.normalize();a.strikePosition.addScaledVector(direction,Math.max(50,b.radius)+Math.max(50,tb.radius));}}

  width=0;}
 function fieldTransform(info){const points=(view.effectTargetKeys||[]).map(k=>actors.get(k)?.basePosition?.x).filter(Number.isFinite);const center=points.length?(Math.min(...points)+Math.max(...points))/2:0;return RankBattlePlacement.field(THREE,info,view.side,center);}
 function updateTimeline(){if(!phase)return;const cardUpdates=[];
  for(const event of phase.timeline){if(event.played||event.at>phase.elapsed+1e-8)continue;event.played=true;if(event.kind==='sound'){parent.postMessage({type:'rank-battle-3d-audio',id:phase.id,sound:event.sound},'*');continue;}if(event.kind==='title'){parent.postMessage({type:'rank-battle-3d-title',text:event.text},'*');continue;}const e=event.entry,s=event.step;
   if(event.kind==='cover-camera'){
    cameraView={mode:'team',coverReaction:true,battleSize:view.battleSize,side:view.targetSide,count:desired.filter(a=>a.side===view.targetSide).length};cameraAnchor=null;cameraTime=0;
    // A front-party cut uses the normal ally order, not the rear strike formation.
    const front=(view.guardians||[]).filter(key=>actors.get(key)?.track.actor.side===view.targetSide);
    for(const [key,actor] of actors){if(actor.track.actor.side!==view.targetSide)continue;
     const index=front.indexOf(key),sign=view.targetSide===0?-1:1;
     if(index>=0){actor.basePosition.x=sign*(index-(front.length-1)/2)*150;actor.basePosition.z=(view.targetSide===0?250:-250)+(view.targetSide===0?-160:160);}
     else if(view.targetSide===0)actor.basePosition.x=-actor.basePosition.x;
     actor.model.root.position.copy(actor.basePosition);
    }
    for(const actor of actors.values()){const shown=actor.track.actor.side===view.targetSide;actor.model.root.visible=shown;actor.label.hidden=actor.foot.hidden=!shown;}
    updateCamera();continue;
   }
   if(event.kind==='cards')cardUpdates.push(...s.cardUpdates);
   else if(event.kind==='effect')fx?.play(s.effects,e.model.root.position,s.effectPlacements||[],p=>RankBattlePlacement.effect(THREE,e,p,camera));
   else{const previous=e.lastPopup;let data=s;
    // Keep rapid successive hits visible together. Cover hits already carry all values.
    if(previous&&previous.data.tone===s.tone&&(['heal','ap'].includes(s.tone)||s.tone==='damage'&&event.at-previous.at<.3))data={...s,amounts:[...(previous.data.amounts||[previous.data.text]),...(s.amounts||[s.text])],enhanceds:[...(previous.data.enhanceds||[!!previous.data.enhanced]),...(s.enhanceds||[!!s.enhanced])],criticals:[...(previous.data.criticals||[!!previous.data.critical]),...(s.criticals||[!!s.critical])]};
    const priorAges=data!==s?(e.label.children.length&&e.label.children[0].popupIndex!==undefined?Array.from(e.label.children).map(p=>p.numberAge||0):[e.label.numberAge||0]):[];
    setLabel(e,data);for(let i=0;i<priorAges.length;i++)if(e.label.children[i])RankBattleNumbers.animate(e.label.children[i],priorAges[i]);e.lastPopup={at:event.at,data};e.amountAge=0;
   }
  }
  if(cardUpdates.length)parent.postMessage({type:'rank-battle-3d-cards',id:phase.id,updates:cardUpdates},'*');
 }
 function updateField(){if(!phase?.field||phase.fieldPlayed||phase.elapsed<phase.field.effectAt)return;phase.fieldPlayed=true;fx?.play(phase.field.effects,new THREE.Vector3(0,0,0),phase.field.placements,fieldTransform);}
 function clearLabels(){labels.clear();for(const e of actors.values()){e.seenFootNotices=new Set();e.lastPopup=null;e.amountSignature=null;e.label.textContent='';e.label.className='amount';globalThis.RankBattleNumbers?.clear(e.label);e.label.style.transform='translate(-50%,-50%)';e.foot.textContent='';}}
 function complete(){if(!phase)return;parent.postMessage({type:'rank-battle-3d-done',id:phase.id,played:phase.duration>0},'*');phase=null;}
 function switchView(next){next=next||{mode:'team',side:1};
  const keep=(view.outcome&&next.outcome)||(next.preserveCamera&&view.mode==='team'&&next.mode==='team'&&view.side===next.side)||view.mode==='attack'&&next.mode==='attack'&&view.side===next.side&&view.targetSide===next.targetSide&&(next.chain&&next.chain===view.chain||next.key===view.key&&next.stage==='return');
  if(keep&&next.preserveCamera){
   // SetupConditionDirection changes only affected actors, not the party layout.
   next.guardians=view.guardians;view=next;clearLabels();
   for(const e of actors.values())for(const step of e.track.steps)step.holdLastPose=false;
   return;
  }
  if(!keep){fx?.clear();cameraTime=0;cameraView=null;cameraAnchor=null;}
  // Native result setup resets each ally before its win/loss direction (cb0988/cb0a34).
  // Do not carry the last combat down pose into the result reaction's idle fallback.
  const moving=new Map();for(const [key,e] of actors){if(keep&&e.returning&&e.track.time<e.track.duration)moving.set(key,{base:e.basePosition?.clone(),strike:e.strikePosition?.clone()});else{if(!keep)e.returning=false;const dead=e.track.visualDead,idleTime=e.track.idleTime;e.track.sync(e.track.actor,true);if(!next.outcome)e.track.idleTime=idleTime;e.track.visualDead=next.outcome&&e.track.actor.side===0?false:dead;}}
  if(!keep)for(const e of actors.values()){e.staged=false;e.returning=false;e.poseSnap=true;}
  view=next;view.count=desired.filter(a=>a.side===view.side).length;clearLabels();layout();
  for(const [key,pos] of moving){const e=actors.get(key);e.basePosition=pos.base;e.strikePosition=pos.strike;e.returning=true;}
  if(!cameraView){cameraView={...view,targetCount:Math.max(view.targetCount||0,view.cameraSpan||0)};cameraAnchor=view.mode==='attack'?(view.side===1&&(view.targetCount>=6||view.battleSize>=3)?[0,0,250]:actors.get(view.targetKey)?.basePosition?.toArray()):view.mode==='actor'?actors.get(view.key)?.basePosition?.toArray():null;
   const targets=(view.cameraTargets||[]).map(k=>actors.get(k)?.basePosition).filter(Boolean);if(view.mode==='attack'&&targets.length){cameraAnchor=[(Math.min(...targets.map(p=>p.x))+Math.max(...targets.map(p=>p.x)))/2,0,targets[0].z];}
  }
 }

 function updateCamera(){const w=canvas.clientWidth||width||1280,h=canvas.clientHeight||height||720;
  const acting=view.mode==='actor'?actors.get(view.key):null;
  const anchor=view.mode==='attack'?(view.side===1&&(view.targetCount>=6||view.battleSize>=3)?[0,0,250]:actors.get(view.targetKey)?.basePosition?.toArray()):acting?.basePosition?.toArray();
  const cameraPose=globalThis.RankBattleCamera?.pose(cameraView||view,w,h,cameraTime,cameraAnchor||(cameraView?.mode==='team'?undefined:anchor));
  if(cameraPose){camera.aspect=w/h;camera.fov=cameraPose.fov;camera.near=cameraPose.near;camera.far=cameraPose.far;camera.position.fromArray(cameraPose.position);camera.up.fromArray(cameraPose.up);camera.lookAt(...cameraPose.target);}
  else{camera.position.set(0,100,1800);camera.lookAt(0,100,0);}
  camera.updateProjectionMatrix();camera.updateMatrixWorld();
 }

 function labelPosition(e){
  const signature=[width,height,view.mode,e.model.root.position.x,e.model.root.position.y,e.model.root.position.z,e.foot.textContent,camera.position.x,camera.position.y,camera.position.z,e.label.textContent?cameraTime:0,e.label.className,e.label.children.length,camera.fov,...camera.matrixWorldInverse.elements,...camera.projectionMatrix.elements].join('|');if(e.labelLayout===signature)return;e.labelLayout=signature;
  const point=RankBattlePlacement.numberAnchor(THREE,e,camera).project(camera),foot=new THREE.Vector3(e.model.root.position.x,e.model.root.position.y-5,e.model.root.position.z).project(camera);
  const unit=width/1280; e.label.style.setProperty?.('--popup-unit',unit+'px'); e.label.style.fontSize=RankBattlePlacement.numberEm(e.label.className.includes('critical'),unit)+'px';
  e.label.style.left=Math.max(50*unit,Math.min(width-50*unit,(point.x+1)*width/2))+'px';e.label.style.top=Math.max(150*unit,Math.min(height,(1-point.y)*height/2))+'px';e.foot.style.left=((foot.x+1)*50)+'%';
  for(const piece of e.label.children){if(piece.popupIndex===undefined)continue;const offset=RankBattlePlacement.popupOffset(piece.popupIndex,e.track.actor.key,unit);piece.style.left=offset.x+'px';piece.style.top=offset.y+'px';piece.style.fontSize=RankBattlePlacement.numberEm(piece.className.includes('critical'),unit)+'px';}
  const cell=view.mode==='actor'?Math.min(width*.7,320):Math.abs(new THREE.Vector3(e.model.root.position.x+150,e.model.root.position.y,e.model.root.position.z).project(camera).x-foot.x)*width*.45;
  // Foot/HUD dimensions do not change with each frame of a standing revival motion.
  // Avoid interleaved DOM writes and scrollHeight reads for all eight characters.
  const footLayout=[width,height,foot.x,foot.y,cell,e.foot.textContent].join('|');
  if(e.footLayout===footLayout)return;e.footLayout=footLayout;
  e.foot.style.top=((1-foot.y)*50)+'%';e.hp.style.left=e.foot.style.left;const hudOrigin=new THREE.Vector3(e.model.root.position.x,e.model.root.position.y,e.model.root.position.z).project(camera);
  // MenuBattle 0xab6cb0: project model origin; ui-421 Gauge y=-2, 16 px high.
  e.hp.style.top=((1-hudOrigin.y)*height/2-6*unit)+'px';
  e.foot.style.width=cell+'px';e.hp.style.width=Math.min(256*unit,cell*.85)+'px';e.hp.style.height=Math.max(2,16*unit)+'px';e.hp.style.padding=Math.max(.5,3*unit)+'px';e.hp.style.fontSize=Math.max(5,Math.min(15*unit,cell/6))+'px';let font=Math.max(7,Math.min(18,cell/6.5));e.foot.style.fontSize=font+'px';
  const available=Math.max(0,height-(1-foot.y)*height/2-2);
  while(font>6&&e.foot.scrollHeight>available){font=Math.max(6,font-1);e.foot.style.fontSize=font+'px';}
 }

 async function reconcile(){if(building)return;building=true;
 try{do{const version=revision;
  for(const [key,e]of actors)if(!desired.some(a=>a.key===key&&JSON.stringify(a.spec)===e.signature)){e.model.dispose();e.label.remove();e.foot.remove();e.hp.remove();actors.delete(key)}
  const visibleKeys=new Set(RankBattleMotion.visibleKeys(desired,view));
  const ordered=desired.slice().sort((a,b)=>Number(visibleKeys.has(b.key))-Number(visibleKeys.has(a.key)));
  for(const a of ordered){if(version!==revision)break;if(actors.has(a.key))continue;status.textContent='3Dキャラクターを準備中…';const signature=JSON.stringify(a.spec),model=await createBattleActor(a.spec,shared,renderer);
   if(disposed||version!==revision){model.dispose();break}
   const latest=desired.find(x=>x.key===a.key)||a;
   const label=document.createElement('div');label.className='amount';const foot=document.createElement('div');foot.className='foot-log';const hp=document.createElement('div');hp.className='party-hp';const hpFill=document.createElement('span');hpFill.className='party-hp-fill';hp.append(hpFill);overlay.append(label,foot,hp);const entry={model,signature,label,foot,hp,hpFill,track:new RankBattleMotion.Track(latest),hud:RankBattleHud.create(hp)};actors.set(a.key,entry);model.root.userData.battleKey=a.key;scene.add(model.root);
   // Equal spacing on two team rows, with original slot positions retained after deaths.
   layout();pose(entry,0);
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(version===revision)break;
 }while(!disposed);
 // Upload decoded textures before announcing readiness, including hidden teammates.
 // Otherwise first-use uploads stall individual battle scenes on mobile drivers.
 await shared.imagesReady();
 if(renderer.initTexture){const seen=new Set();for(const entry of actors.values()){
  entry.model.root.traverse(node=>{for(const material of (Array.isArray(node.material)?node.material:[node.material]))if(material)for(const value of Object.values(material))if(value?.isTexture&&!seen.has(value)){seen.add(value);renderer.initTexture(value);}});
  await new Promise(resolve=>setTimeout(resolve,0));
 }}
 await globalThis.RankBattleNumbers?.prepare?.();
 const motionError=await motionsReady;if(motionError)throw motionError;
 await effectsReady;
 await fx?.prepare(desired);status.textContent='';parent.postMessage({type:'rank-battle-3d-prepared'},'*');
 }catch(e){status.textContent='3D表示を準備できませんでした';parent.postMessage({type:'rank-battle-3d-error',message:String(e.message||e)},'*')}
 finally{building=false}
 }
 canvas.addEventListener?.('pointerup',event=>{
  if(busy||!visible||!view.hpBars)return;
  const rect=canvas.getBoundingClientRect(),point={x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height},ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(point.x*2-1,1-point.y*2),camera);scene.updateMatrixWorld(true);
  const candidates=[...actors].filter(([key,e])=>key.startsWith('1:')&&e.model.root.visible),hits=ray.intersectObjects(candidates.map(([,e])=>e.model.root),true);
  const picked=hits.find(h=>h.object.visible&&(!h.object.material||!Array.isArray(h.object.material)&&h.object.material.visible!==false));if(!picked)return;
  const found=candidates.find(([,e])=>{let n=picked.object;while(n){if(n===e.model.root)return true;n=n.parent;}return false;});
  if(found)parent.postMessage({type:'rank-battle-3d-pick',key:found[0],point},'*');
 });
 window.addEventListener('message',event=>{
  if(event.source!==parent)return;const d=event.data;if(!d||typeof d.type!=='string')return;
  if(d.type==='rank-battle-3d-sync'){
   paused=!!d.paused;visible=!!d.visible;busy=!!d.busy;
   const next=d.actors||[],changed=JSON.stringify(next.map(a=>[a.key,a.spec]))!==JSON.stringify(desired.map(a=>[a.key,a.spec]));desired=next;if(changed)revision++;
   for(const a of desired){const e=actors.get(a.key);if(e)e.track.sync(a,!!d.snap)}
   if(busy){view.hpBars=false;for(const e of actors.values())e.hp.hidden=true;}
   if(changed||actors.size!==desired.length)void reconcile();
   if(d.snap){complete();switchView(d.defaultView||{mode:'team',side:1});for(const e of actors.values())pose(e,0);}
   }else if(d.type==='rank-battle-3d-cue'){
   if(d.view?.batch)d.cues=RankBattleDirector.batchPlan(d.view.batch,actors,motions);
   complete();switchView({...d.view,stage:d.view?.stage??d.cues?.[0]?.stage,side:d.view?.side??Number(d.view?.key?.split(':')[0])});last=0;phase={id:d.id,elapsed:0,duration:0,timeline:[],field:globalThis.RankBattleDirector?.field(view)};phase.duration=phase.field?.duration||0;updateCamera();updateField();
   for(const label of d.labels||[]){const e=actors.get(label.key);if(e&&e.model.root.visible){labels.set(label.key,label);const hasNumbers=(d.cues||[]).some(c=>c.key===label.key&&c.steps?.some(s=>s.text!==undefined));if(!hasNumbers)setLabel(e,label);}}
   for(const cue of d.cues||[]){const e=actors.get(cue.key);if(!e?.model.root.visible)continue;
    const planned=cue.planned?cue.steps:globalThis.RankBattleDirector?.plan(cue,e.track.actor,motions,view)||cue.steps||cue.motions||[];
    const steps=planned.filter(s=>motions.has(typeof s==='string'?s:s.motion)).map(s=>view.holdReactionPose&&typeof s==='object'&&s.motion!=='ダウン'?{...s,holdLastPose:true}:s);
    if(steps.length){e.returning=cue.stage==='return';if(cue.stage==='approach'||cue.planned&&steps.some(s=>s.travel))e.staged=true;if(e.returning)e.staged=false;e.track.play(steps,motions);const delay=cue.stage==='hit'?(phase.field?.hitAt||0):0;
     for(const step of e.track.steps){step.at+=delay;
      if(step.title)phase.timeline.push({kind:'title',at:step.at,text:step.title});
      if(step.cardUpdates?.length)phase.timeline.push({kind:'cards',at:step.at+(step.labelAt||0),entry:e,step});
      for(const sound of [step.sound,...(step.extraSounds||[])].filter(Boolean))phase.timeline.push({kind:'sound',at:step.at+sound.at,sound:sound.sound});
      if(step.effects?.length)phase.timeline.push({kind:'effect',at:step.at+(step.effectAt||0),entry:e,step});
      if(step.text!==undefined)phase.timeline.push({kind:'label',at:step.at+(step.labelAt||0),entry:e,step});
     }
     e.track.duration+=delay;phase.duration=Math.max(phase.duration,e.track.duration,...phase.timeline.map(e=>e.at));pose(e,0);
    }
   }
   if(phase.field?.sound)phase.timeline.push({kind:'sound',at:phase.field.sound.at,sound:phase.field.sound.sound});
   if(view.batch&&view.batchTitle)phase.timeline.push({kind:'title',at:0,text:view.batchTitle});
   if(view.resultTitle&&!view.batch){const impacts=phase.timeline.filter(e=>e.kind==='label'||e.kind==='cards');phase.timeline.push({kind:'title',at:impacts.length?Math.min(...impacts.map(e=>e.at)):0,text:view.resultTitle});}
   if(view.batch&&view.batchResultTitle){const impacts=phase.timeline.filter(e=>e.kind==='label'||e.kind==='cards');phase.timeline.push({kind:'title',at:impacts.length?Math.max(...impacts.map(e=>e.at)):0,text:view.batchResultTitle});}
   if(view.gutsTitle){const impacts=phase.timeline.filter(e=>e.kind==='label'||e.kind==='cards');const at=(impacts.length?Math.max(...impacts.map(e=>e.at)):0)+.2;phase.timeline.push({kind:'title',at,text:view.gutsTitle});phase.duration=Math.max(phase.duration,at+.5);}
   // Cover uses the recipient-side view at impact; keep the attack/return clocks running.
   if(view.mode==='attack'&&view.guardians?.length&&view.stage!=='return'){const impacts=phase.timeline.filter(e=>e.kind==='label'||e.kind==='cards');if(impacts.length)phase.timeline.unshift({kind:'cover-camera',at:Math.max((view.batch||!view.approached)?0.5:0,Math.min(...impacts.map(e=>e.at)))});}
   if(view.outcome)phase.duration=Math.max(phase.duration,((RankBattleCamera.profile(view)?.frames||1)-1)/60);
   phase.timeline.sort((a,b)=>a.at-b.at);updateTimeline();
   if(!phase.duration||d.view?.background)complete();
  }
 });
 document.addEventListener('visibilitychange',()=>{last=0});
 renderer.setAnimationLoop(now=>{try{
  const dt=last?Math.min(.1,Math.max(0,(now-last)/1000)):0;last=now;if(!visible||document.hidden)return;
  const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
  if(w!==width||h!==height){width=w;height=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();camera.updateMatrixWorld()}
  
  if(!paused){cameraTime+=dt;for(const e of actors.values())if(e.model.root.visible)pose(e,dt);updateCamera();fx?.update(dt);if(phase){phase.elapsed+=dt;updateField();updateTimeline();if(phase.elapsed>=phase.duration)complete();}}
  updateCamera();
  for(const e of actors.values())if(e.model.root.visible){globalThis.RankBattleCamera?.faceParty(e.model.root,camera,cameraView?.mode==='team'?cameraView:view);e.model.root.updateWorldMatrix(true,false);labelPosition(e);}
  if(view.outcome){const feet=[...actors.values()].filter(e=>e.model.root.visible).map(e=>(1-new THREE.Vector3(e.model.root.position.x,e.model.root.position.y-5,e.model.root.position.z).project(camera).y)/2);const y=Math.max(...feet)+.025;if(Number.isFinite(y)&&y!==lastOutcomeY){lastOutcomeY=y;parent.postMessage({type:'rank-battle-3d-outcome-anchor',y},'*');}}else lastOutcomeY=null;
  shadows?.update(actors);renderer.render(scene,camera);fx?.draw(camera);
 }catch(error){renderer.setAnimationLoop(null);parent.postMessage({type:"rank-battle-3d-error",message:String(error.message||error)},"*");}});
 window.addEventListener('pagehide',()=>{disposed=true;shadows?.dispose();fx?.dispose();arena?.dispose();renderer.setAnimationLoop(null);for(const e of actors.values())e.model.dispose();for(const t of textures.values())t.dispose();renderer.dispose()});
 status.textContent='';parent.postMessage({type:'rank-battle-3d-ready'},'*');
})().catch(error=>{document.getElementById('status').textContent='3D表示を利用できません';parent.postMessage({type:'rank-battle-3d-error',message:String(error.message||error)},'*')});
