/* Native effect links/timing + presentation-only staging. Never reads or changes battle RNG. */
(function(root){'use strict';
 function directFor(actor,stage){return root.RankBattleVisualData?.actions[Number(stage==='attack'?0x8602009b:actor?.actionUid)]||[];}
 // BattleCharacter::GetActionWait (0x925a24): 0.1s; UpdateAction waits for
 // caster trigger, not the remote target actor's reaction duration.
 function physicalTiming(motions){const d=directFor(null,'attack'),fps=root.RankBattleVisualData?.fps||60;
  const trigger=(d[0]?.triggerFrames||0)/fps;
  return {impact:.5+trigger,interval:trigger+.1};
 }
 function reactionSound(step){const a=root.RankBattleAudioData?.reactions;if(step.motion==='ダウン')return a?.down;
  if(step.reaction){const direct=root.RankBattleVisualData?.reactions?.[step.reaction];const sound=root.RankBattleAudioData?.directs?.[direct?.uid];if(sound)return sound;}
  if(step.soundEvent){const {kind,value}=step.soundEvent,uid=Number(step.soundEvent.uid);return kind==='expiration'?(a?.expiration?.[uid]?.[value<0?'down':'up']||(step.motion==='楽しむ'?a?.cure:null)):kind==='slip'?a?.slip?.[uid]:a?.[kind];}
  if(step.soundCondition){const {uid,value}=step.soundCondition;return a?.statValues?.[uid]?.[value]||a?.conditions?.[uid]?.[value<0?'down':'up'];}
  return null;
 }
 function hitSounds(step,base){return (step.damageSoundTypes||[]).flatMap(code=>{const s=code===0?root.RankBattleAudioData?.directs?.[directFor(null,'attack')[2]?.uid]:root.RankBattleAudioData?.reactions?.damageTypes?.[code];return s?[{...s,at:base?.at??s.at}]:[];});}
 function plan(cue,actor,motions,view){
  if(cue.prelude){const native=root.RankBattleVisualData.reactions[cue.prelude];
   const prefix=plan({steps:[{motion:native.motion,reaction:cue.prelude,smooth:true}]},actor,motions,view);
   const duration=Math.max(0,...prefix.map(s=>(s.at||0)+s.duration));
   const rest=plan({...cue,prelude:null},actor,motions,view).map((s,i)=>({...s,at:(s.at||0)+duration,...(i===0&&cue.actionTitle?{title:cue.actionTitle,smooth:true}:{})}));
   return [...prefix,...rest];
  }

  if(!cue.stage&&!(cue.steps||[]).some(s=>s.conditionUid||s.reaction||s.soundEvent?.kind==='slip'))return (cue.steps||cue.motions||[]).map(item=>{const s=typeof item==='string'?{motion:item}:item,sound=reactionSound(s);const extraSounds=hitSounds(s,sound);return sound||extraSounds.length?{...s,sound,extraSounds}:item;});
  if(cue.stage==='approach')return [{motion:actor.floating?'前進':'走る',duration:.5,travel:'approach'}];
  if(cue.stage==='return')return [{motion:actor.floating?'前進':'走る',duration:.4,travel:'return'}];
  const role=cue.stage==='cast'||cue.stage==='attack'?0:2;
  const baseDirect=directFor({...actor,actionUid:cue.actionUid??actor?.actionUid},cue.actionKind==='attack'?'attack':cue.stage)[role];
  const nativeFps=root.RankBattleVisualData?.fps||60;
  const raw=cue.steps||cue.motions||[],steps=[];let cursor=0;const physical=physicalTiming(motions);
  if(cue.stage==='attack'&&cue.approach!==false&&!view.approached&&motions.has('走る')){steps.push({motion:actor.floating&&motions.has('前進')?'前進':'走る',duration:.5,at:0,travel:'approach'});cursor=.5;}
  for(const [index,item] of raw.entries()){const s=typeof item==='string'?{motion:item}:{...item},clip=motions.get(s.motion);if(!clip)continue;
   if(s.cardUpdates&&s.duration===0){steps.push(s);continue;}
   const statDirect=root.RankBattleVisualData?.statDirects?.[Number(s.conditionUid)]?.[s.soundCondition?.value];
   const direct=(s.soundEvent?.kind==='slip'?root.RankBattleVisualData?.slip?.[Number(s.soundEvent.uid)]:null)||statDirect||root.RankBattleVisualData?.reactions?.[s.reaction]||root.RankBattleVisualData?.conditions?.[Number(s.conditionUid)]||baseDirect;
   const effectAt=(direct?.effectFrames||0)/nativeFps,labelAt=role===2?(direct?.triggerFrames||0)/nativeFps:0;
   const effectIds=s.motion==='回避'?[]:direct?.effects||[];
   // A nonzero native end frame is authoritative, even when the animation is longer.
   const nativeDuration=direct?.endFrames?direct.endFrames/nativeFps:Math.max(clip.frames/clip.fps,effectAt,labelAt);
   const duration=s.motion==='ダウン'?Math.max(nativeDuration,clip.frames/clip.fps):nativeDuration;
   let at=cursor;
   if(cue.synchronized&&cue.actionKind==='attack')at=cue.stage==='attack'?(view.approached?0:.5)+index*physical.interval:physical.impact-(view.approached?.5:0)+(s.hitIndex??index)*physical.interval;
   else if(cue.stage==='hit'&&cue.actionKind==='heal')at=index*.10000000149011612;
   else if(cue.stage==='hit'&&view.multiHit)at=(s.hitIndex??index)*((direct?.triggerFrames||0)/nativeFps+.1);
   const nativeSound=root.RankBattleAudioData?.directs?.[direct?.uid],sound=reactionSound(s)||nativeSound;
   const extraSounds=[...(s.motion==='ダウン'&&nativeSound&&sound&&nativeSound.sound!==sound.sound?[nativeSound]:[]),...hitSounds(s,nativeSound)];
   steps.push({...s,at,sound,extraSounds,effects:effectIds,effectPlacements:root.RankBattleNativeLayout?.effects[direct?.uid]||[],effectAt,labelAt,duration,...(!s.travel&&s.motion!=='ダウン'?{animationDuration:Math.min(duration,clip.frames/clip.fps)}:{})});
   cursor=at+duration;
  }
  // Return starts on the attacker's own end frame, while recipients can still
  // finish their reactions. Keep the same camera, formation and movement anchors.
  if(cue.stage==='attack'&&cue.autoReturn){const at=Math.max(0,...steps.map(s=>(s.at||0)+s.duration));steps.push(...plan({stage:'return'},actor,motions,view).map(s=>({...s,at})));}
  return steps;
 }
 function reactionGuardians(rows,actionRows,reaction,kind){return root.RankBattleMotion.guardians(reaction&&kind==='shot'?actionRows:rows);}
 function statusOnly(rows){return rows.some(e=>e.target&&e.kind==='antenna-effect')&&!rows.some(e=>['attack','shot','heal','physical-reflection'].includes(e.kind));}
 // Action database +0x14 is the field DirectUpdater, separate from caster and recipient.
 function field(view){if(view.reflected||view.stage!=='hit'||view.actionKind==='attack')return null;const d=directFor({actionUid:view.actionUid},'hit')[1];if(!d)return null;const fps=root.RankBattleVisualData?.fps||60;
  return {sound:root.RankBattleAudioData?.directs?.[d.uid],effects:d.effects||[],placements:root.RankBattleNativeLayout?.effects[d.uid]||[],effectAt:(d.effectFrames||0)/fps,hitAt:(d.triggerFrames||0)/fps,duration:(d.endFrames||0)/fps};
 }
 function hitGroups(rows){if(statusOnly(rows)||rows.some(e=>e.kind==='attack'||e.kind==='shot'||e.kind==='heal'))return [rows];const hits=[...new Set(rows.filter(e=>e.target&&e.reflectType===undefined&&Number.isInteger(e.hitIndex)).map(e=>e.hitIndex))];if(hits.length<2)return [rows];
  const groups=[];let current=[];let hit=hits[0];for(const e of rows){if(e.reflectType===undefined&&Number.isInteger(e.hitIndex)&&e.hitIndex!==hit&&current.length){groups.push(current);current=[];hit=e.hitIndex;}current.push(e);}if(current.length)groups.push(current);return groups;
 }
 // Results are already in native action order. Never re-sort speed or recompute RNG.
 function targetKeys(rows){return [...new Set(rows.filter(e=>e.kind==='attack'&&e.target&&e.reflectType===undefined).map(e=>{const t=e.cover?.originalTarget||e.target;return t.side+':'+t.slot;}))];}
 function attackChains(groups){let run=[];const flush=()=>{if(!run.length)return;const targets=[...new Set(run.flatMap(x=>x.group.rows.filter(e=>e.kind==='attack'&&e.target&&e.reflectType===undefined).map(e=>e.target.side+':'+e.target.slot)))];const slots=targets.map(k=>Number(k.split(':')[1]));const chain={id:'attack:'+run[0].index,keys:[...new Set(run.map(x=>x.key))],targets,moves:run.map(x=>({key:x.key,targetKeys:targetKeys(x.group.rows),targetKey:x.group.rows.find(e=>e.kind==='attack'&&e.target&&e.reflectType===undefined).target})).map(x=>({...x,targetKey:x.targetKey.side+':'+x.targetKey.slot})),span:Math.max(...slots)-Math.min(...slots)+1};run.forEach((x,i)=>{x.group.chain=chain;x.group.nextAttack=i<run.length-1});run=[];};
  groups.forEach((group,index)=>{const event=group.rows.find(e=>e.kind==='attack'&&e.source&&e.target&&e.reflectType===undefined);
   if(!event||event.jackType===3){flush();return;}const reactive=group.rows.some(e=>e.kind!=='physical-reflection'&&e.reflectType!==undefined);if(reactive){flush();return;}const side=event.source.side,targetSide=event.target.side;
   if(run.length&&(run[0].side!==side||run[0].targetSide!==targetSide))flush();
   run.push({group,index,side,targetSide,key:side+':'+event.source.slot});if(reactive)flush();});flush();return groups;
 }

 // Native camera dispatch at cae1cc/cae200 selects ShotMulti for multiple casters.
 // Group presentation only: retain every result in its original simulation order.
 function castChains(groups,actionFor){let run=[];
  const flush=()=>{if(run.length>1){const chain={side:run[0].side,actions:run.map(x=>({rows:x.group.allRows,actionUid:x.uid,actionKind:x.kind}))};run.forEach((x,i)=>{x.group.castChain=chain;x.group.castLeader=i===0;});}run=[];};
  for(const group of groups){const e=group.rows.find(e=>['shot','heal','antenna-effect'].includes(e.kind)&&e.source&&e.target&&e.reflectType===undefined&&e.reason!=='no-use');
   const uid=e?actionFor(e.source):null,key=e?e.source.side+':'+e.source.slot:null;
   if(!e||e.jackType===3||uid==null||!group.first||!group.last){flush();continue;}
   if(run.length&&(run[0].side!==e.source.side||String(run[0].uid)!==String(uid)||run.some(x=>x.key===key)))flush();
   run.push({group,side:e.source.side,key,uid,kind:e.kind});
  }flush();return groups;
 }
 // Recipient camera dispatch uses HitMulti at cafd3c; keep a chain's results
 // in one recipient timeline, rather than restarting the scene per caster.
 function castResultGroups(groups){return groups.flatMap(group=>{
  if(!group.castChain)return [group];if(!group.castLeader)return [];
  let offset=0;const rows=[];
  for(const action of group.castChain.actions){
   const hits=[...new Set(action.rows.filter(e=>e.target&&e.reflectType===undefined&&e.reason!=='no-use').map(e=>Number(e.hitIndex??0)))].sort((a,b)=>a-b);
   for(const e of action.rows)rows.push({...e,hitIndex:offset+Math.max(0,hits.indexOf(Number(e.hitIndex??0)))});
   offset+=Math.max(1,hits.length);
  }
  return [{...group,rows,allRows:rows}];
 });}
 // Reflection has its own recipient phase: aggregate all casters before returning
 // to the attacker's party, retaining each result's order within its side.
 function resultSides(rows){
  if(!rows.some(e=>e.kind==='shot'&&e.reflectType!==undefined))return root.RankBattleMotion.sides(rows);
  const groups=[];
  for(const reflected of [false,true])for(const e of rows){if((e.kind==='shot'&&e.reflectType!==undefined)!==reflected)continue;
   const side=(e.target??e.source)?.side??0;let group=groups.find(g=>g.side===side&&g.reflected===reflected);
   if(!group){group={side,reflected,rows:[]};groups.push(group);}group.rows.push(e);
  }
  for(const group of groups)if(group.reflected){const firstHits=new Map();for(const e of group.rows){const key=(e.target??e.source).side+':'+(e.target??e.source).slot;firstHits.set(key,Math.min(firstHits.get(key)??Infinity,e.hitIndex??0));}group.rows=group.rows.map(e=>({...e,hitIndex:(e.hitIndex??0)-firstHits.get((e.target??e.source).side+':'+(e.target??e.source).slot)}));}
  return groups;
 }
 function castCues(chain){return chain.actions.flatMap(a=>root.RankBattleMotion.action(a.rows).map(c=>({...c,stage:'cast',actionUid:a.actionUid,actionKind:a.actionKind})));}

 // Native scheduler counts source changes (ca8834–ca8884), then MoveTo uses
 // (ordinal - 1) * float32(0x3e4ccccd) at cae968–cae980.
 const chainDelay=0.20000000298023224;
 function batchPlan(batch,actors,motions){const byKey=new Map();
  const add=(key,steps)=>{if(!byKey.has(key))byKey.set(key,[]);byKey.get(key).push(...steps);};
  for(const [index,action] of batch.entries()){
   const offset=index*chainDelay,view={...action.view,approached:false};let end=offset;
   for(const cue of action.cues){const actor=actors.get(cue.key)?.track?.actor||actors.get(cue.key)||{};
    const steps=plan(cue,actor,motions,view).map(s=>({...s,at:(s.at||0)+offset}));
    add(cue.key,steps);if(cue.stage==='attack'){
     const finish=Math.max(...steps.map(s=>s.at+s.duration));end=Math.max(end,finish);
     add(cue.key,plan({stage:'return'},actor,motions,view).map(s=>({...s,at:finish})));
    }
   }
   for(const cue of action.reactions||[]){const actor=actors.get(cue.key)?.track?.actor||actors.get(cue.key)||{};add(cue.key,plan(cue,actor,motions,view).map(s=>({...s,at:(s.at||0)+end})));}
  }
  return [...byKey].map(([key,steps])=>({key,planned:true,steps:steps.sort((a,b)=>a.at-b.at)}));
 }
 root.RankBattleDirector={targetKeys,plan,physicalTiming,hitGroups,statusOnly,reactionGuardians,field,attackChains,castChains,castResultGroups,resultSides,castCues,batchPlan,chainDelay};if(typeof module!=='undefined')module.exports=root.RankBattleDirector;
})(globalThis);
