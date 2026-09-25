/* Presentation only. These selectors never mutate battle actors or consume RNG. */
(function(root){'use strict';
 const stat=new Set([0x87000028,0x87000013,0x87000010,0x87000014,0x87000065]);
 const harmful=new Set([0x8700001A,0x87000048,0x870000A6,0x87000007,0x87000074,0x87000066,0x8700009D,0x870000BC,0x87000093,0x87000081,0x87000077,0x870000B3,0x870000B8,0x8700009F,0x87000075,0x87000019,0x870000B5,0x8700005F,0x87000049]);
 const uid=v=>Number(v),key=r=>r?`${r.side}:${r.slot}`:null;
 const idle=a=>a.dead?'倒れる':a.floating?'待機（反転）':'待機';
 const conditionDirect=id=>!stat.has(Number(id))?root.RankBattleVisualData?.conditions?.[Number(id)]:null;
 function changed(uidValue,value){const id=uid(uidValue);return id===0x87000075?'もがく':stat.has(id)?Number(value)<0?'悲しむ':'喜ぶ':conditionDirect(id)?.motion??(id===0x87000075?'もがく':null);}
 function expiration(c){const delta=Number(c.before?.current||0)-Number(c.before?.base||0);if(!delta)return null;return harmful.has(uid(c.uid))||stat.has(uid(c.uid))&&delta<0?'楽しむ':'悲しむ';}
 function action(rows){const usable=rows.filter(e=>e.target&&e.reflectType===undefined&&e.reason!=='no-use'&&['attack','shot','heal','antenna-effect'].includes(e.kind));if(!usable.length)return [];
 const e=usable[0],hits=new Set(usable.map(x=>Number(x.hitIndex||0))).size;
 return [{key:key(e.source),motions:Array(hits).fill(e.kind==='attack'?'技1':'技2')}];
 }
 function damageSoundTypes(e){if(!['attack','shot','physical-reflection'].includes(e.kind)||!(e.damage>0)||e.miss||e.blocked||e.reflectionQueued)return [];
  if(e.damageSoundTypes)return e.damageSoundTypes;
  const code=Number(e.damageCode??(e.critical?1:e.vital?2:e.enhanced?3:0));return code>=1&&code<=5?[code]:code===0&&(e.kind==='physical-reflection'||e.reflectType===4)?[0]:[];
 }
 function coverHits(rows){
 const buckets=new Map();
 const eligible=e=>['attack','shot'].includes(e.kind)&&e.reflectType===undefined&&Number.isFinite(e.damage)&&!e.miss&&!e.blocked&&!e.reflectionQueued&&!e.blindnessFailed&&!e.excitementFailed;
 const token=e=>[key(e.source),key(e.target),e.kind,e.hitIndex??0].join('/');
 for(const e of rows)if(eligible(e)){const t=token(e);if(!buckets.has(t))buckets.set(t,[]);buckets.get(t).push(e);}
 const emitted=new Set();return rows.flatMap(e=>{if(!eligible(e))return [e];const t=token(e),items=buckets.get(t);if(items.length<2||!items.some(x=>x.cover?.originalTarget))return [e];if(emitted.has(t))return [];emitted.add(t);
 return [{...e,cover:items.find(x=>x.cover?.originalTarget).cover,damage:items.reduce((n,x)=>n+x.damage,0),damageValues:items.map(x=>x.damage),damageSoundTypes:[...new Set(items.flatMap(damageSoundTypes))],enhancedValues:items.map(x=>(!!x.enhanced||x.damageCode===3)&&!x.critical),criticalValues:items.map(x=>x.kind==='attack'&&!!x.critical),kill:items.some(x=>x.kill),hpAfter:items.at(-1).hpAfter}];});
 }
 function guardians(rows){return [...new Set(rows.filter(e=>e.cover?.originalTarget&&e.target).map(e=>key(e.target)))];}
 function effects(rows){rows=coverHits(rows);const groups=new Map(),steps=new Map(),dead=new Set(),reactions=new Set();let event;
 const add=(ref,name,conditionUid,reaction,conditionValue,soundEvent)=>{const k=key(ref);if(!k||!name||dead.has(k)&&name!=='起き上がる')return;if(event?.kind==='antenna-effect'){const token=k+':'+name+':'+(conditionUid??'');if(reactions.has(token))return;reactions.add(token);}if(name==='起き上がる')dead.delete(k);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(name);if(!steps.has(k))steps.set(k,[]);steps.get(k).push({motion:name,...(damageSoundTypes(event).length?{damageSoundTypes:damageSoundTypes(event)}:{}),...(soundEvent?{soundEvent}:{}),...(conditionUid!==undefined?{soundCondition:{uid:Number(conditionUid),value:Number(conditionValue??event?.effectValue??event?.conditionResult?.value??event?.value??1)}}:{}),...(reaction?{reaction}:{}),...((conditionDirect(conditionUid)||stat.has(Number(conditionUid)))?{conditionUid:Number(conditionUid)}:{}),hitIndex:event?.hitIndex??0,...(name==='回避'?{text:'回避',tone:'effect'}:name==='ダウン'&&!Number.isFinite(event?.damage)?{text:'死亡',tone:'effect'}:amount(event))});if(name==='ダウン')dead.add(k);};
 for(const e of rows){event=e;const r=e.target??e.source;
 if(e.kill||(e.hpAfter===0&&e.hpBefore>0)){add(r,'ダウン',undefined,e.vital?'vital':undefined,undefined,e.kind==='condition-damage'?{kind:'slip',uid:e.uid}:undefined);continue;}
 if(e.kind==='turn-start-condition'){add(r,changed(e.uid,e.value),e.uid);continue;}
 if(e.kind==='guard'){add(e.source,'防御');continue;}
 if((e.kind==='attack'||e.kind==='shot')&&(e.blocked==='guard'||e.reflectionQueued)){const reaction=e.reflectionQueued?'reflection':'guard',token=key(r)+':'+reaction+':'+(e.hitIndex??0);if(!reactions.has(token)){reactions.add(token);add(r,root.RankBattleVisualData?.reactions?.[reaction]?.motion||'防御',undefined,reaction);}continue;}
 if(e.kind==='heal'){if(e.revival&&e.hpGain>0)add(r,'起き上がる');else if(e.hpGain>0)add(r,'喜ぶ');continue;}
 if(e.kind==='condition-recovery'){if(e.gain>0)add(r,'喜ぶ',undefined,undefined,undefined,{kind:'recovery'});continue;}
 if(e.kind==='condition-up'){add(r,changed(e.conditionResult?.uid,e.conditionResult?.value),e.conditionResult?.uid);continue;}
 if(e.kind==='condition-round'){if(e.after?.current===e.after?.base&&e.before?.current!==e.before?.base)add(r,expiration(e),undefined,undefined,undefined,{kind:'expiration',uid:e.uid,value:e.before.current-e.before.base});continue;}
 if(e.kind==='condition-damage'){if(e.damage>0)add(r,'ふらふら',undefined,undefined,undefined,{kind:'slip',uid:e.uid});continue;}
 if(e.kind==='antenna-effect'){
  if(!e.success)continue;
  if(e.clearedConditions?.length){for(const c of e.clearedConditions)add(r,expiration(c),undefined,undefined,undefined,{kind:'expiration',uid:c.uid,value:c.before.current-c.before.base});}
  else if(e.conditionChildren){for(const c of e.conditionChildren)if(c.success)add(r,changed(c.uid,c.value),c.uid,undefined,c.value);}
  else add(r,changed(e.effectUid,e.effectValue),e.effectUid,Number(e.effectUid)===0x87000075?'excitementAntenna':undefined);continue;
 }
 if(['attack','shot','physical-reflection'].includes(e.kind)){
  if(e.reflectType===6){if(e.appliedHpGain>0)add(r,'喜ぶ');continue;}
  if(e.reflectType!==undefined&&![3,4].includes(e.reflectType)){
   if(e.reflectType===2&&e.type===2)add(r,'見回す',undefined,'wake');
   if(e.type===2&&[0,1].includes(e.reflectType))add(r,'喜ぶ',e.conditionResult?.uid,undefined,e.conditionResult?.value);
   if(e.type===2&&e.reflectType===5)add(r,changed(e.conditionResult?.uid,e.conditionResult?.value),e.conditionResult?.uid);
   continue;
  }
  if(e.kind==='attack'&&e.miss)add(r,'回避');
  else if(e.damage>0&&!e.blocked&&!e.reflectionQueued)add(r,'ダメージ');
 }
 }
 return [...groups].map(([key,motions])=>({key,motions,steps:steps.get(key)}));
 }
 function amount(e){
  if(!e)return {};
  if(e.kill&&e.vital)return {text:'',tone:'effect'};
  if(e.kill&&(e.kind==='antenna-effect'&&Number(e.effectUid)===0x87000081))return {text:'死亡',tone:'effect'};
  if(e.damageValues)return {text:e.damageValues.join("、"),amounts:e.damageValues.map(String),enhanceds:e.enhancedValues,criticals:e.criticalValues,tone:"damage"};
  if(e.appliedHpGain>0)return {text:'+'+e.appliedHpGain,tone:'heal'};
  if(e.hpGain>0)return {text:'+'+e.hpGain,tone:'heal'};
  if(e.gain>0)return {text:(e.resource==='ap'?'AP ':'')+'+'+e.gain,tone:e.resource==='ap'?'ap':'heal'};
  if(Number.isFinite(e.damage)&&[undefined,3,4].includes(e.reflectType)&&!e.miss&&!e.blocked&&!e.reflectionQueued&&!e.excitementFailed&&!e.blindnessFailed)return {text:String(e.damage),tone:'damage',enhanced:(!!e.enhanced||e.damageCode===3)&&!e.critical,critical:e.kind==='attack'&&!!e.critical};
  return {};
 }
 function sides(rows){const groups=[];for(const e of rows){const side=(e.target??e.source)?.side??0,last=groups.at(-1);if(last&&last.side===side)last.rows.push(e);else groups.push({side,rows:[e]});}return groups;}
 // Only repeated defensive notices are suppressed; numeric hits remain separate.
 function sceneFootText(text,seen){const lines=[];for(const line of String(text??'').split(/\n|、/)){
  const plain=line.replace(/^\d+ヒット目\s*/, '').trim();
  if(/^(?:無敵で無効|反射|ガードで無効|浮遊で無効|ゴースト化で無効)$/.test(plain)){
   if(seen.has(plain))continue;seen.add(plain);lines.push(plain);
  }else lines.push(line);
 }return lines.length?lines.join('\n'):null;}
 function visibleKeys(actors,view){actors=actors.filter(a=>!(view?.excludeKeys||[]).includes(a.key));if(view?.mode==='attack')return actors.filter(a=>a.side===0||a.side===1).map(a=>a.key);return actors.filter(a=>view?.mode==='actor'?a.key===view.key:a.side===(view?.side??0)).slice(0,8).map(a=>a.key);}
 // Authored frame count / FPS determines duration. No stretching to log interval.
 class Track{
  constructor(actor){this.actor=actor;this.visualDead=!!actor.dead;this.steps=[];this.time=0;this.duration=0;this.idleTime=0;this.generation=0;}
  sync(actor,snap=false){this.actor=actor;if(snap){this.visualDead=!!actor.dead;this.steps=[];this.time=0;this.duration=0;this.idleTime=0;}}
  play(steps,motions){const transition=steps.find(s=>['ダウン','起き上がる'].includes(typeof s==='string'?s:s.motion));if(transition)this.visualDead=(typeof transition==='string'?transition:transition.motion)==='起き上がる';this.generation++;let cursor=0;this.steps=steps.map(value=>{const s=typeof value==='string'?{motion:value}:{...value},m=motions.get(s.motion);s.at??=cursor;s.duration??=m.frames/m.fps;cursor=s.at+s.duration;return s});// Once a death starts, no queued hit/status/return may interrupt it.
   let down=this.visualDead&&this.actor.dead,deathEnd=0;
   this.steps=this.steps.sort((a,b)=>a.at-b.at).filter(step=>{if(step.motion==='起き上がる'){if(down)step.at=Math.max(step.at,deathEnd);down=false;return true;}if(down)return false;if(step.motion==='ダウン'){down=true;deathEnd=step.at+step.duration;}return true;});
   this.time=0;this.duration=Math.max(0,...this.steps.map(s=>s.at+s.duration));return this.duration;}
  sample(dt,motions){this.time+=dt;this.idleTime+=dt;let chosen=-1;
   // Later native triggers interrupt the current reaction; animations always run at 1x.
   for(let i=0;i<this.steps.length;i++)if(this.steps[i].at<=this.time)chosen=i;
   let idleSeconds=this.idleTime;
   if(chosen>=0){const step=this.steps[chosen],time=this.time-step.at,m=motions.get(step.motion),animationDuration=step.animationDuration??step.duration;if(step.motion==='起き上がる')this.visualDead=false;if(step.motion==='ダウン'&&time>=step.duration)this.visualDead=true;if(time<animationDuration||step.holdLastPose&&chosen===this.steps.length-1)return {...step,token:this.generation+":"+chosen,age:time,length:step.duration,name:step.motion,seconds:step.travel?time:Math.min((m.frames-1)/m.fps,time)};idleSeconds=this.idleTime;}
   const actor={...this.actor,dead:this.visualDead};
   const name=idle(actor),m=motions.get(name);return {name,seconds:actor.dead?(m.frames-1)/m.fps:idleSeconds};
  }

 }
 // Compute changes in calculation order before presentation overlaps actors/hits.
 // A snapshot on a later hit is not a new application of all its conditions.
 function cardChanges(events,initial){
  const states=new Map([...initial].map(([k,v])=>[k,structuredClone(v.conditions||[])]));
  return events.map((e,sequence)=>{const ref=e.target??e.source,k=key(ref),saved=ref&&e.presentation?.[ref.side]?.[ref.slot];if(!saved)return e;
   const before=new Map((states.get(k)||[]).map(c=>[Number(c.uid),c])),after=new Map((saved.conditions||[]).map(c=>[Number(c.uid),c]));
   const conditionChanges=[...new Set([...before.keys(),...after.keys()])].filter(uid=>JSON.stringify(before.get(uid))!==JSON.stringify(after.get(uid))).map(uid=>({uid,sequence,value:after.has(uid)?structuredClone(after.get(uid)):null}));
   states.set(k,structuredClone(saved.conditions||[]));return {...e,presentationConditionChanges:conditionChanges};
  });
 }
 function cardCues(rows,cues){
  const out=cues.map(c=>({...c,steps:(c.steps||[]).map(s=>({...s}))}));
  for(const e of rows){
   if(e.kind==='antenna-effect'&&!e.success||e.reflectType===2&&e.type!==2)continue;
   const ref=e.target??e.source,saved=ref&&e.presentation?.[ref.side]?.[ref.slot];if(!saved)continue;
   const k=key(ref),motion=effects([e])[0]?.steps?.[0]?.motion;
   const damageEvent=['attack','shot','physical-reflection','condition-damage'].includes(e.kind)&&!e.presentationConditionOnly;
   let cue=out.find(c=>c.key===k),step=cue?.steps?.find(s=>(s.hitIndex??0)===(e.hitIndex??0)&&(!motion||s.motion===motion));
   // Cover merges every recipient hit into one reaction, which may be Down even
   // when the earlier contributions were nonlethal. Keep every HP update on it.
   if(!step&&damageEvent)step=cue?.steps?.find(s=>(s.hitIndex??0)===(e.hitIndex??0)&&['ダメージ','ダウン','ふらふら'].includes(s.motion));
   // Deduplicated status reactions share their one displayed reaction.
   step??=cue?.steps?.find(s=>s.motion===motion);
   if(!step){if(!cue){cue={key:k,steps:[]};out.push(cue);}step={motion:'待機',duration:0,at:0};cue.steps.push(step);}
   // A delayed additional-condition reaction carries an old attack snapshot.
   // Patch only its condition; never restore HP or overwrite unrelated later effects.
   if(e.presentationConditionOnly&&e.presentationConditionChanges)continue;
   if(e.presentationConditionOnly||e.reflectType===2){
    const uid=Number(e.presentationConditionOnly||0x870000B3);
    (step.cardUpdates??=[]).push({key:k,conditionOnly:uid,conditions:saved.conditions.filter(c=>Number(c.uid)===uid)});
    continue;
   }
   const hpDelta=damageEvent?-(Number.isFinite(e.hpBefore)&&Number.isFinite(e.hpAfter)?Math.max(0,e.hpBefore-e.hpAfter):Math.max(0,Number(e.damage)||0)):undefined;
   (step.cardUpdates??=[]).push({key:k,hp:Number.isFinite(e.hpAfter)?e.hpAfter:saved.hp,...(damageEvent?{hpDelta}:{}),...(e.kill?{dead:true}:{}),conditions:saved.conditions,...(e.presentationConditionChanges?{conditionChanges:e.presentationConditionChanges,revival:!!e.revival}:{}),...(!e.kill&&(e.presentationDeferredConditionUid||e.additionalCondition?.success)?{preserveCondition:e.presentationDeferredConditionUid||e.additionalCondition.uid}:{})});
  }
  return out;
 }
 function applyCardUpdate(previous,update){
  if(update.conditionOnly){
   if(previous.hp<=0)return previous;
   const uid=Number(update.conditionOnly);
   return {...previous,conditions:[...structuredClone((previous.conditions||[]).filter(c=>Number(c.uid)!==uid)),...structuredClone(update.conditions||[])]};
  }
  let conditions=structuredClone(update.conditions||[]);
  const conditionVersions={...(previous.conditionVersions||{})};
  if(update.conditionChanges&&!update.dead){
   conditions=structuredClone(previous.conditions||[]);
   if(previous.hp>0||update.revival)for(const change of update.conditionChanges){if(change.sequence!==undefined&&change.sequence<(conditionVersions[change.uid]??-1))continue;if(change.sequence!==undefined)conditionVersions[change.uid]=change.sequence;conditions=conditions.filter(c=>Number(c.uid)!==change.uid);if(change.value)conditions.push(structuredClone(change.value));}
  }
  if(!update.conditionChanges&&update.preserveCondition){const id=Number(update.preserveCondition);conditions=conditions.filter(c=>Number(c.uid)!==id);conditions.push(...structuredClone((previous.conditions||[]).filter(c=>Number(c.uid)===id)));}
  return {...previous,...(update.conditionChanges?{conditionVersions}:{}),hp:update.dead?0:Number.isFinite(update.hpDelta)?Math.max(0,previous.hp+update.hpDelta):update.hp,conditions};
 }
 root.RankBattleMotion={action,effects,idle,Track,amount,sides,visibleKeys,sceneFootText,coverHits,guardians,cardChanges,cardCues,applyCardUpdate};
 if(typeof module!=='undefined')module.exports=root.RankBattleMotion;
})(globalThis);

