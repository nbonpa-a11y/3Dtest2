(()=>{'use strict';
const $=id=>document.getElementById(id),B=RankBattle;
let pickedModelPoint=null;
let doc=RankPartyModel.empty(),selected=null,targeting=false,busy=false,party='auto',individual={},loadError=false,statusView=false,selectedSide=0;
try{const saved=sessionStorage.getItem('rankbattle.battle.setup.tool-v1')||localStorage.getItem('rankbattle.parties.tool-v1');if(saved)doc=RankPartyModel.validate(JSON.parse(saved));}
catch(e){loadError=true;error('パーティ情報を読み込めません。登録画面から入り直してください。');}
let state=B.buildPackedBattleState(doc);globalThis.RankBattleSession=state;
let latestRegistration=doc;
let cardMessages=new Map(),motionCardState=null;
let activeActor=null,paused=false,resumePlayback=null,finishPlayback=false,advancePlayback=null;
const roundHistory=[],roundFuture=[];
function error(message){$('battle-error').hidden=false;$('battle-error').textContent=message;}
function el(tag,cls,text){const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function effectTargetSide(){return selected===null?null:B.basicEffectAction(state.parties[0].members[selected])?.side===1?1:0;}
function ended(){return state.basic?.status==='ended';}
function close(){selected=null;targeting=false;statusView=false;render();}
function isActionStopped(actor){return !!actor&&actor.hp>0&&B.movementBlockers(actor.conditions??[]).length>0;}
function select(slot,side=0){if(busy||ended())return;const actor=state.parties[side]?.members[slot];if(!actor)return;selected=slot;selectedSide=side;targeting=false;statusView=side===1||isActionStopped(actor)||actor.hp<=0;render();$('command-back').focus();}
function appendStatusIcons(card,actor){
 const strip=el('span','combatant-status-icons');strip.setAttribute('aria-label','現在の状態');
 const groups=globalThis.RankBattleHud.icons(actor.conditions??[],4);
 groups.forEach((icons,row)=>icons.forEach((icon,column)=>{
  const img=el('img','combatant-status-icon');img.src='images/status-icons/'+icon.index+'.webp?v=2';img.width=24;img.height=24;img.alt=img.title=icon.name;
  // Native slots 00..03: bad row y=48; 04..07: good row y=68.
  img.style.gridRow=String(row===0?2:1);img.style.gridColumn=String(column+1);strip.append(img);
 }));
 if(strip.children.length)card.append(strip);
}
function playbackLogSpace(root,side,active){
 root.style.paddingTop='';root.style.paddingBottom='';
 if(!active)return;
 // Three 18px lines, 12px box padding/border, and a small card gap.
 let reserve=74;
 for(const label of root.querySelectorAll?.('.card-result')??[])reserve=Math.max(reserve,label.offsetHeight+8);
 root.style[side?'paddingBottom':'paddingTop']=reserve+'px';
}
function renderRoster(side){
 const root=$(side?'enemy-roster':'ally-roster');root.replaceChildren();
 state.parties[side].members.forEach((raw,slot)=>{
 const a=raw&&motionCardState?.has(side+':'+slot)?{...raw,...motionCardState.get(side+':'+slot)}:raw;
  const stopped=isActionStopped(a),card=el(a?'button':'div','combatant'+(!a?' vacant':'')+(a&&a.hp<=0?' fallen':'')+(stopped?' stopped':''));
  if(activeActor===`${side}:${slot}`)card.className+=' acting-glow';
  card.append(el('span','position-label',String(slot+1).padStart(2,'0')));
  if(!a){card.append(el('span','vacant-label','空き枠'));root.append(card);return;}
  const revivalTarget=side===0&&targeting==='heal'&&selected!==null&&B.basicHealAction(state.parties[0].members[selected])?.data.type===0x37;
  card.type='button';card.setAttribute('aria-label',a.name+' HP '+a.hp+' AP '+a.ap);card.disabled=busy||ended()||rapid()||(!targeting?false:revivalTarget?a.hp>0:a.hp<=0)||(targeting==='effect'?side!==effectTargetSide():false);
  card.append(el('span','combatant-level','Lv.'+a.level),el('strong','combatant-name',a.name),el('span','combatant-antenna',a.antenna.name||'アンテナなし'));
  if(!turbo()&&a.registration&&globalThis.RankAppearance){const portrait=el('span','combatant-portrait-holder');portrait.innerHTML=RankAppearance.portrait(a.registration);card.append(portrait);}
  for(const key of ['hp','ap']){
   const row=el('span','resource-row');row.dataset.value=String(a[key]);row.dataset.maximum=String(a.initialStats[key]);row.dataset.low=String(a[key]>0&&a[key]<a.initialStats[key]*.5);row.append(el('span','resource-label',key.toUpperCase()),el('b','resource-number',a[key].toLocaleString('ja-JP')));
   const bar=el('span','resource-bar '+key);const fill=el('span','resource-fill');fill.style.width=(a.initialStats[key]?Math.max(0,Math.min(100,a[key]/a.initialStats[key]*100)):0)+'%';if(side===0&&key==='hp')globalThis.RankBattleGauges?.bind(fill,side+':'+slot,parseFloat(fill.style.width),{animate:busy&&!finishPlayback&&$('progression-style').value==='game',paused:()=>paused});bar.append(fill);row.className+=' '+key;card.append(row,bar);
  }
  if(!rapid())appendStatusIcons(card,a);
  if(side===0){card.dataset.allySlot=slot;card.setAttribute('aria-pressed',String(selectedSide===side&&selected===slot));card.setAttribute('aria-controls','individual-commands');card.onclick=()=>{if(targeting==='heal'||targeting==='effect'){commitIndividual({kind:targeting,target:slot});}else select(slot);};
   const c=individual[slot],orderLabel=a.hp<=0?'':c?['effect','shot','heal'].includes(c.kind)?'個別：'+a.antenna.name:c.kind==='guard'?'個別：ぼうぎょ':`個別：敵${c.target+1}へ打撃`:'';if(orderLabel)card.append(el('span','order-label',orderLabel));
  }else {card.dataset.enemySlot=slot;card.onclick=()=>{if(!targeting){select(slot,1);return;}if((targeting!==true&&targeting!=='shot'&&targeting!=='effect')||selected===null)return;commitIndividual({kind:targeting==='effect'?'effect':targeting==='shot'?'shot':'attack',target:slot});};}
  const message=cardMessages.get(`${side}:${slot}`);
  if(message&&!motionEnabled()){card.append(el('span','card-result'+(message.glow?'':' no-effect'),message.text));if(message.glow)card.className+=' result-glow';}
  root.append(card);
 });
 playbackLogSpace(root,side,busy&&!rapid()&&$('progression-style').value==='game'&&!motionEnabled());
}
if(globalThis.RankBattle3D)RankBattle3D.onPick=(key,point)=>{
 if(busy||ended()||!motionEnabled()||!/^1:[0-7]$/.test(key))return;
 const slot=Number(key.split(':')[1]),card=$('enemy-roster').children[slot];if(!card||card.disabled)return;
 pickedModelPoint=point;card.click();
};
function positionIndividualCommand(){
 const panel=$('individual-commands'),arena=document.querySelector('.arena');
 if(!panel||!arena)return;
 if(selected===null||!motionEnabled()){panel.style.position='';panel.style.left='';panel.style.top='';return;}
 const card=$(selectedSide?'enemy-roster':'ally-roster').children[selected];if(!card)return;
 const a=arena.getBoundingClientRect();let c=card.getBoundingClientRect();if(selectedSide===1&&pickedModelPoint){const stage=$('battle-3d-stage').getBoundingClientRect();c={left:stage.left+pickedModelPoint.x*stage.width,top:stage.top+pickedModelPoint.y*stage.height,width:0,height:0};}arena.append(panel);
 panel.style.position='absolute';panel.style.left=Math.max(0,Math.min(a.width-panel.offsetWidth,c.left-a.left+c.width/2-panel.offsetWidth/2))+'px';
 panel.style.top=Math.max(0,Math.min(a.height-panel.offsetHeight,c.top-a.top+c.height-panel.offsetHeight))+'px';
}
window.addEventListener('resize',positionIndividualCommand);
function positionMotionLog(){const arena=document.querySelector('.arena'),cards=$('ally-roster'),center=arena?.querySelector('.arena-center');if(!arena||!cards||!center)return;
 if(!motionEnabled()||ended()){center.style.top='';center.style.transform='';return;}
 const a=arena.getBoundingClientRect(),r=cards.getBoundingClientRect();
 if(a.height&&r.height){center.style.top=Math.max(0,Math.min(r.top,...Array.from(cards.querySelectorAll('.combatant-portrait-holder')).map(n=>n.getBoundingClientRect().top))-a.top-Math.max(4,a.width/160))+'px';center.style.transform='translateY(-100%)';}
}
if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(positionMotionLog);observer.observe($('ally-roster'));observer.observe(document.querySelector('.arena'));}
window.addEventListener('resize',positionMotionLog);
function motionEnabled(){return !rapid()&&$('progression-style').value==='game'&&$('motion-style')?.value==='on';}
function render(){
 if(!busy&&$('arena-message')?.dataset)delete $('arena-message').dataset.batchPending;
 $('motion-label').hidden=rapid()||$('progression-style').value!=='game';$('motion-style').disabled=busy;
 globalThis.RankBattle3D?.sync(state,{enabled:motionEnabled(),busy,paused,skip:finishPlayback});
 document.querySelector('.arena').hidden=turbo();
 if(turbo()){
  const controls=document.querySelector('.battle-controls-row');for(const id of ['start-round','reset-battle','rewind-round','forward-round','pause-round','finish-playback'])controls.append($(id));
  for(const id of ['rewind-round','forward-round','pause-round','finish-playback','progression-label','log-interval-label','command-summary','damage-summary','party-commands','individual-commands'])$(id).hidden=true;
  $('match-count-label').hidden=false;$('start-round').hidden=false;$('start-round').textContent='連続試合開始';$('start-round').disabled=busy||loadError;$('reset-battle').disabled=busy;
  for(const id of ['battle-mode','round-limit','match-count'])$(id).disabled=busy;
  $('log-title').textContent='敗北時戦闘ログ';document.querySelector('.phase-label').textContent='爆速連射コンモード';document.querySelector('.battle-heading h1').textContent='爆速連射コンモード';return;
 }
 const actions=rapid()?document.querySelector('.battle-controls-row'):$('normal-actions');
 for(const id of ['start-round','reset-battle','rewind-round','forward-round','pause-round','finish-playback'])actions.append($(id));
 $('start-round').hidden=!rapid();
 $('forward-round').hidden=rapid()||!roundFuture.length;$('forward-round').disabled=busy;
 $('rewind-round').hidden=rapid()||!roundHistory.length;$('rewind-round').disabled=busy;
 $('pause-round').hidden=rapid()||$('progression-style').value!=='game';$('pause-round').disabled=!busy;
 $('pause-round').textContent=paused?'再開':'一時停止';
 $('finish-playback').hidden=rapid()||$('progression-style').value!=='game'||!busy;$('finish-playback').disabled=!busy;
 $('progression-label').hidden=rapid();$('progression-style').disabled=busy;
 $('log-interval-label').hidden=rapid()||$('progression-style').value!=='game';$('log-interval').disabled=busy;
 document.querySelector('.arena').className='arena'+(busy&&!rapid()&&$('progression-style').value==='game'?' game-presentation':'')+(motionEnabled()?' motion-arena':'')+(motionEnabled()&&ended()?' motion-ended':'');
 const configuredLimit=Math.max(1,Number.parseInt($('round-limit').value,10)||10),nextRound=state.basic?.round??1,remaining=state.basic?.status==='ended'&&state.basic?.reason==='round-limit'?0:Math.max(0,configuredLimit-nextRound+1);$('remaining-rounds').textContent=`残り${remaining}ターン`;
 $(selectedSide===1&&selected!==null?'enemy-command-dock':'ally-command-dock').append($('individual-commands'));
 $('command-summary').hidden=rapid();$('damage-summary').hidden=rapid();$('log-title').textContent=rapid()?'敗北時戦闘ログ':'戦闘ログ';
 requestAnimationFrame(()=>{positionMotionLog();positionIndividualCommand();});
 $('ally-name').textContent=doc.parties[0].name;$('enemy-name').textContent=doc.parties[1].name;
 $('party-commands').hidden=selected!==null||(busy&&$('progression-style').value==='game');$('individual-commands').hidden=selected===null||targeting==='heal'||(targeting==='effect'&&effectTargetSide()===0);
 $('individual-action-buttons').hidden=statusView;
 $('individual-status').hidden=!statusView;
 $('command-status').hidden=selectedSide===1;
 $('command-status').textContent=statusView?'コマンド':'状態';
 $('command-status').setAttribute('aria-expanded',String(statusView));
 $('command-status').disabled=busy||ended();
 $('individual-view-label').textContent=statusView?'現在の状態':'個別コマンド';
 if(statusView&&selected!==null){
  const root=$('individual-status');root.replaceChildren();
  const rows=currentStatusRows(state.parties[selectedSide].members[selected]);
  if(!rows.length)root.append(el('p','','現在かかっている状態異常・強化・弱体はありません。'));
  for(const row of rows){const item=el('div','status-row');item.append(el('span','',row.name),el('span','status-duration',row.duration));root.append(item);}
 }
 if(selected!==null){const a=state.parties[selectedSide].members[selected];$('selected-name').textContent=a.name;$('antenna-command').textContent=a.antenna.name||'アンテナなし';}
 const selectedCommand=selectedSide===0&&selected!==null?individual[selected]?.kind:null,pendingCommand=targeting===true?'attack':['heal','shot','effect'].includes(targeting)?targeting:null,shownCommand=pendingCommand??selectedCommand;
 $('individual-attack').setAttribute('aria-pressed',String(shownCommand==='attack'));
 $('antenna-command').setAttribute('aria-pressed',String(['heal','shot','effect'].includes(shownCommand)));
 $('individual-guard').setAttribute('aria-pressed',String(shownCommand==='guard'));
 const selectedStopped=selectedSide===0&&selected!==null&&(state.parties[0].members[selected]?.hp<=0||isActionStopped(state.parties[0].members[selected]));
 document.getElementById('antenna-command').disabled=busy||ended()||selected===null||selectedSide===1||selectedStopped||(!B.basicHealAction(state.parties[0].members[selected])&&!B.basicShotAction(state.parties[0].members[selected])&&!B.basicEffectAction(state.parties[0].members[selected]));
 const antennaSupported=selectedSide===0&&selected!==null&&(B.basicHealAction(state.parties[0].members[selected])||B.basicShotAction(state.parties[0].members[selected])||B.basicEffectAction(state.parties[0].members[selected]));
 $('antenna-command').title=antennaSupported?'この個体のアンテナを使用します':'このアンテナの実行は未対応です';
 renderRoster(0);renderRoster(1);
 const result=ended()?state.basic.reason==='retired'?'リタイア':state.basic.winner===0?'味方の勝利':state.basic.winner===1?'敵の勝利':'引き分け':null;
 document.querySelector('.phase-label').textContent=result??(busy?'ターン処理中':state.basic?`${state.basic.round}ターン目・コマンド入力`:'基礎戦闘の準備');
 document.querySelector('.battle-heading h1').textContent=result??'基礎戦闘';
 const targetPrompt=targeting==='effect'?(effectTargetSide()===1?'対象の敵を選んでください':'対象の味方を選んでください'):targeting==='heal'?'対象の味方を選んでください':targeting?'対象の敵を選んでください':'';
 if(ended()&&[0,1].includes(state.basic.winner))$('arena-message').textContent=state.basic.winner===0?'YOU WIN!!':'YOU LOSE···';
 else if(!busy)$('arena-message').textContent=targetPrompt||(motionEnabled()?'':'VS');
 $('command-summary').textContent=`全体指示：${party==='auto'?'がんばれ':party==='attack'?'そうこうげき':'まもり'} ／ 個別指示 ${Object.keys(individual).length}人`;
 $('start-round').textContent=rapid()?'連続試合開始':state.basic?'ターン開始':'戦闘開始';
 $('match-count-label').hidden=!rapid();
 for(const id of ['battle-mode','round-limit','match-count'])$(id).disabled=busy||(id==='round-limit'&&!!state.basic);
 $('damage-summary').textContent=`累計ダメージ：味方 ${state.basic?.damageTotals?.[0]??0} ／ 敵 ${state.basic?.damageTotals?.[1]??0}`;
 if(rapid())$('party-commands').hidden=true;
 $('start-round').disabled=busy||ended()||loadError||targeting;
 for(const id of ['party-auto','party-attack','party-guard'])$(id).disabled=busy||ended();
 for(const id of ['individual-attack','individual-guard','individual-cancel'])$(id).disabled=busy||ended()||selectedStopped;
 $('retire-battle').disabled=busy||ended()||!state.basic;$('reset-battle').disabled=busy;$('command-back').disabled=busy;
 $('party-auto').setAttribute('aria-pressed',String(party==='auto'));$('party-attack').setAttribute('aria-pressed',String(party==='attack'));$('party-guard').setAttribute('aria-pressed',String(party==='guard'));
 globalThis.RankBattleSession=state;
}
function commitIndividual(command){
 if(selected===null||selectedSide!==0||busy||ended()||state.parties[0].members[selected]?.hp<=0||isActionStopped(state.parties[0].members[selected]))return;
 individual[selected]=command;close();
 const required=state.parties[0].members.flatMap((actor,slot)=>actor&&actor.hp>0&&!isActionStopped(actor)?[slot]:[]);
 if(required.length&&required.every(slot=>Object.hasOwn(individual,slot)))void runRound();
}
function setIndividual(kind){if(selected===null||selectedSide!==0||busy||ended()||state.parties[0].members[selected]?.hp<=0||isActionStopped(state.parties[0].members[selected]))return;if(kind){commitIndividual({kind});return;}delete individual[selected];close();}
const conditionLabels={'0x87000007':'かぜっぴき','0x87000010':'素早さ','0x87000013':'防御','0x87000014':'回避','0x87000019':'アンテナ封じ','0x8700001A':'毒','0x87000027':'無敵','0x87000028':'攻撃','0x87000047':'反射','0x87000048':'やけど','0x8700005F':'ジャック','0x87000065':'全能力','0x87000066':'感電','0x87000074':'どろだらけ','0x87000075':'こうふん','0x87000077':'マヒ','0x87000081':'一撃KO','0x87000093':'呪い','0x8700009D':'水びたし','0x8700009F':'恐怖','0x870000A6':'しもやけ','0x870000B3':'眠り','0x870000B8':'誘惑','0x870000BC':'ブラインド'};
Object.assign(conditionLabels,{'0x87000037':'トゲトゲ','0x87000053':'必中','0x87000090':'たくわえ','0x870000AC':'オート防御','0x870000C2':'ゴースト化','0x870000C5':'ガード'});
Object.assign(conditionLabels,{'0x87000023':'オート防御','0x87000025':'無敵貫通','0x8700009C':'貫通','0x870000C4':'ゴーストバスター','0x870000B5':'ブレス封じ'});
function conditionName(value){const raw=typeof value==='number'?value.toString(16):String(value??'').replace(/^0x/i,'');return conditionLabels['0x'+raw.padStart(8,'0').toUpperCase()]??'状態変化';}
const nonStageConditions=new Set(['87000023','87000027','87000037','87000047','87000053','8700009C','870000AC','870000C2','870000C4','870000C5']);
const circledSlots=['①','②','③','④','⑤','⑥','⑦','⑧'];
function actorLabel(ref){const a=ref&&state.parties[ref.side]?.members[ref.slot];return ref?`${ref.side?'敵':'味方'}${circledSlots[ref.slot]??ref.slot+1}${a?' '+a.name:''}`:'';}
function currentStatusRows(actor){
 const equipmentRows=[];
 for(const [uid,label]of [['870000AD','ターゲット'],['87000034','かばう']]){
  const c=(actor.conditions??[]).find(c=>String(c.uid).replace(/^0x/i,'').toUpperCase()===uid);
  if(c?.current>0)equipmentRows.push({name:label+(uid==='87000034'?' ('+Math.min(100,c.current)+'%)':''),duration:c.remainingTurns>0?'残り'+c.remainingTurns+'ターン':'常時'});
 }
 return equipmentRows.concat((actor.conditions??[]).filter(c=>!['870000AD','87000034'].includes(String(c.uid).replace(/^0x/i,'').toUpperCase())).filter(c=>c.current!==0&&(c.current!==(c.base??0)||c.remainingTurns>0)).map(c=>({
  name:`${effectLabel({effectUid:c.uid,effectValue:c.current})}${nonStageConditions.has(String(c.uid).replace(/^0x/i,'').toUpperCase())?'':` (${c.current>0?'+':''}${c.current})`}`,
  duration:c.remainingTurns>0?`残り${c.remainingTurns}ターン`:'ターン期限なし'
 })));
}
function effectLabel(e){
 if(e.actionType===0x35)return e.clearedConditions?.length?e.clearedConditions.map(c=>effectLabel({effectUid:c.uid,effectValue:c.before.current-c.before.base})+'解除').join('・'):'解除対象なし';
 if(e.conditionChildren)return e.conditionChildren.filter(c=>c.success).map(c=>effectLabel({effectUid:c.uid,effectValue:c.value})).join('・');
 const raw=typeof e.effectUid==='number'?e.effectUid.toString(16):String(e.effectUid??'').replace(/^0x/i,''),uid=raw?'0x'+raw.padStart(8,'0').toUpperCase():'';
 const name=conditionName(uid);
 if(['攻撃','防御','素早さ','回避','全能力'].includes(name))return name+(Number(e.effectValue)<0?'ダウン':'アップ');
 return name;
}
function appliedEffectLabel(e){
 const uid=Number(e.effectUid);
 if(uid===0x8700005F){
  const c=e.presentation?.[e.target?.side]?.[e.target?.slot]?.conditions?.find(c=>Number(c.uid)===uid);
  return Number(e.effectCurrentValue??c?.current??e.effectValue)>=2?'ますますこんらんした':'こんらんした';
 }
 return effectLabel(e)+(e.kill?'・死亡':'');
}
function stripTargetParticle(text){return text.replace(/^(?:への|には|へは|の|に|は|へ|が|を)/,'');}
function attackLogResult(x){
 if(x.kind==='shot-unavailable')return ({'antenna-sealed':'アンテナ封じで使用不可','insufficient-ap':'AP不足で使用不可','no-valid-target':'有効な対象なし','cannot-move':'行動停止で使用不可','inactive-source':'行動できる状態ではない'})[x.reason]??'使用条件を満たさず不発';
 const target=x.target?actorLabel(x.target):'',cover=x.cover?.originalTarget?`（${actorLabel(x.cover.originalTarget)}をかばう）`:'';
 if(x.kind==='physical-reflection'||(x.kind==='shot'&&x.reflectType!==undefined&&x.reflectType!==4)){
  if(x.reflectType===6)return x.appliedHpGain>0?`${target}がHP吸収で${x.appliedHpGain}回復`:'';
  if(x.reflectType===3)return `${target}にトゲトゲで${x.damage??0}ダメージ${x.kill?'・死亡':''}`;
  if(x.type!==2)return '';
  if(x.reflectType===2)return `${target}の眠り解除`;
  if(x.reflectType===5)return `${target}にボディ効果：${effectLabel({effectUid:x.conditionResult.uid,effectValue:x.conditionResult.value})}`;
  return `${target}は${x.reflectType===0?'硬化で防御アップ':'逆ギレで攻撃アップ'}`;
 }
 if(x.reflectionQueued)return `${target}${cover}が反射`;
 return `${target}${cover}${x.reflected?'へ反射で'+x.damage+'ダメージ'+(x.kill?'・死亡':''):x.excitementFailed?'への打撃はこうふんで失敗':x.blindnessFailed?'への打撃はブラインドで失敗':x.blocked?(x.blocked==='floating-ground'?'には浮遊で無効':x.blocked==='guardian-rental'?'は対象外':x.blocked==='ghost'?'にはゴースト化で無効':x.blocked==='rental'?'は対象外':x.blocked==='guard'?'にはガードで無効':'には無敵で無効'):x.miss?'は回避した':`に${x.damage}ダメージ${x.vital?'・きゅうしょづき':''}${x.critical?'・クリティカル':''}${x.fixedDamage?'・固定ダメージ':''}${x.guts?'・こんじょうで1耐えた':''}${x.kill?'・死亡':''}`}${x.additionalCondition?.success?'・'+appliedEffectLabel({effectUid:x.additionalCondition.uid,effectValue:x.additionalCondition.value,effectCurrentValue:x.additionalCondition.current,presentation:x.presentation,target:x.target}):''}`;
}

function executedHitCount(rows){
 return new Set(rows.filter(r=>r.reflectType===undefined&&r.reason!=='no-use'&&r.kind!=='heal-unavailable'&&r.kind!=='shot-unavailable'&&(r.kind!=='antenna-effect'||r.target)).map(r=>Number(r.hitIndex??0))).size;
}
function formatHitResults(rows,format){
 const numbered=executedHitCount(rows)>1,results=[];let previousHit=null;
 for(const row of rows){const result=format(row);if(!result)continue;const hit=Number(row.hitIndex??0);
  if(hit!==previousHit){results.push((numbered?`${hit+1}ヒット目 `:'')+result);}
  else results[results.length-1]+='、'+result;
  previousHit=hit;
 }return results;
}
function healLogResult(x){
 if(x.kind==='heal-unavailable')return ({'antenna-sealed':'アンテナ封じで使用不可','insufficient-ap':'AP不足で使用不可','cannot-move':'行動停止で使用不可'})[x.reason]??'使用条件を満たさず不発';
 if(x.reason==='no-use'||!(x.hpGain>0))return '';return `${actorLabel(x.target)} HP +${x.hpGain}${x.revival?'・復活':''}`;
}
function groupPhaseLogs(events){
 const start=new Set(['guard','turn-start-condition']),end=new Set(['condition-recovery','condition-up','condition-round','condition-damage','condition-countdown']),out=[];
 for(let i=0;i<events.length;){
  const types=start.has(events[i].kind)?start:end.has(events[i].kind)?end:null;
  if(!types){out.push(events[i++]);continue;}
  const groups=new Map();
  while(i<events.length&&types.has(events[i].kind)){
   const e=events[i++],side=(start.has(e.kind)?e.source:e.target).side;
   const effect=e.kind==='condition-round'?effectLabel({effectUid:e.uid,effectValue:e.before.current-e.before.base}):e.uid??e.resource??e.conditionResult?.uid??'';
   const key=[e.kind,side,effect].join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);
  }
  for(const rows of groups.values()){
   const e=rows[0],side=(start.has(e.kind)?e.source:e.target).side,team=side?'敵':'味方';let label,suffix='',values;
   rows.sort((a,b)=>(a.target??a.source).slot-(b.target??b.source).slot);
   if(e.kind==='guard'){label='防御状態';suffix=' のぼうぎょ';values=rows.map(x=>actorLabel(x.source));}
   else if(e.kind==='turn-start-condition'){label=team+'の'+(conditionName(e.uid));suffix=' '+(conditionName(e.uid));values=[...new Set(rows.map(x=>actorLabel(x.target)))];}
   else if(e.kind==='condition-recovery'){label=team+'の'+(e.resource==='ap'?'AP':'HP')+'自動回復';values=rows.map(x=>actorLabel(x.target)+' '+x.gain+'回復');}
   else if(e.kind==='condition-up'){label=team+'のかそく';values=rows.map(x=>actorLabel(x.target)+' '+effectLabel({effectUid:x.conditionResult.uid,effectValue:x.conditionResult.value})+' +'+x.conditionResult.value);}
   else if(e.kind==='condition-round'){label=team+'の'+effectLabel({effectUid:e.uid,effectValue:e.before.current-e.before.base})+'の効果終了';values=rows.map(x=>actorLabel(x.target));}
   else{label=team+'の'+(conditionName(e.uid));values=rows.map(x=>actorLabel(x.target)+' '+(x.kind==='condition-damage'?x.damage+'ダメージ':x.kill?'終了':'残り'+x.remainingTurns)+(x.kill?'・死亡':''));}
   out.push({kind:'phase-log',text:label+'：'+values.join('、')+suffix,actors:rows.map(x=>x.target??x.source),rows});
  }
 }
 return out;
}
function appendLog(events,round,output=null,heading=true){
 events=groupPhaseLogs(events);
 const log=output??$('battle-log');if(heading){if(log.children.length)log.append(el('li','round-gap',''));log.append(el('li','round-heading',`---------- ${round}ターン目開始 ----------`));}let actionLines=0;
 const appendDecorated=(node,text)=>{const parts=String(text).split(/(死亡)/);for(const part of parts)if(part)node.append(el('span',part==='死亡'?'log-death':'',part));};
 const appendAction=text=>{text=text.replace('：','：\n');if(actionLines++)log.append(el('li','action-gap',''));const line=el('li','');const labels=state.parties.flatMap((p,side)=>p.members.flatMap((a,slot)=>a?[actorLabel({side,slot})]:[])).sort((a,b)=>b.length-a.length);const label=labels.find(l=>text.startsWith(l));if(label){line.append(el('span',label.startsWith('敵')?'log-actor enemy':'log-actor ally',label));appendDecorated(line,text.slice(label.length));}else appendDecorated(line,text);log.append(line);};
 for(let i=0;i<events.length;){const e=events[i];
 if(e.kind==='antenna-sealed'){appendAction(`${actorLabel(e.source)}のアンテナは使えない`);i++;continue;}
 if(e.kind==='phase-log'){
  if(actionLines++)log.append(el('li','action-gap',''));const line=el('li','');
  appendDecorated(line,e.text.replace('：','：\n'));
  log.append(line);i++;continue;
 }
 if(e.kind==='antenna-effect'){const same=[];while(i<events.length){const x=events[i];if(x.kind!==e.kind||x.source.side!==e.source.side||x.source.slot!==e.source.slot||x.name!==e.name)break;same.push(x);i++;}appendAction(`${actorLabel(e.source)}の${e.name}：${formatHitResults(same,x=>x.target?`${actorLabel(x.target)} ${x.success?appliedEffectLabel(x):'不発・使用不可'}`:x.reason||'不発・使用不可').join('\n')}`);continue;}
 if(e.kind==='condition-recovery'){appendAction(`${actorLabel(e.target)}の${e.resource==='ap'?'AP':'HP'}自動回復：${e.gain}回復`);i++;continue;}
 if(e.kind==='condition-up'){appendAction(`${actorLabel(e.target)}のかそく：${effectLabel({effectUid:e.conditionResult.uid,effectValue:e.conditionResult.value})}`);i++;continue;}
 if(e.kind==='condition-round'){appendAction(`${actorLabel(e.target)}：${effectLabel({effectUid:e.uid,effectValue:e.before.current-e.before.base})}の効果が切れた`);i++;continue;}
 if(e.kind==='turn-start-condition'){const same=[];while(i<events.length){const x=events[i];if(x.kind!==e.kind||x.source.side!==e.source.side||x.source.slot!==e.source.slot||x.uid!==e.uid)break;same.push(x);i++;}const label=conditionName(e.uid);appendAction(`${actorLabel(e.source)}の${label}：${same.map(x=>actorLabel(x.target)+' '+label).join('、')}`);continue;}
 if(e.kind==='condition-damage'||e.kind==='condition-countdown'){appendAction(`${actorLabel(e.target)}：${e.kind==='condition-damage'?`状態ダメージ ${e.damage}`:e.kill?'カウントダウン終了':`カウントダウン 残り${e.remainingTurns}`}${e.kill?'・死亡':''}`);i++;continue;}
 if(e.kind==='jack-idle'){appendAction(`${actorLabel(e.source)}はジャックで何もしなかった`);i++;continue;}
 if(e.kind==='cannot-act'){appendAction(`${actorLabel(e.source)}は行動できない`);i++;continue;}
 if(e.kind==='heal'||e.kind==='heal-unavailable'){const same=[];while(i<events.length){const x=events[i];if(!['heal','heal-unavailable'].includes(x.kind)||x.source.side!==e.source.side||x.source.slot!==e.source.slot)break;same.push(x);i++;}const results=formatHitResults(same,healLogResult);if(results.length)appendAction(`${actorLabel(e.source)}の${state.parties[e.source.side].members[e.source.slot].antenna.name}：${results.join('\n')}`);continue;}
 if(['attack','shot','shot-unavailable','physical-reflection'].includes(e.kind)){const same=[],isShot=['shot','shot-unavailable'].includes(e.kind),kinds=isShot?['shot','shot-unavailable']:['attack','physical-reflection'];while(i<events.length){const x=events[i];if(!kinds.includes(x.kind)||x.source.side!==e.source.side||x.source.slot!==e.source.slot)break;same.push(x);i++;}appendAction(`${actorLabel(e.source)}の${isShot?(state.parties[e.source.side].members[e.source.slot].antenna.name||'属性アンテナ'):'打撃'}：${formatHitResults(same,attackLogResult).join('\n')}`);continue;}
 appendAction(`${actorLabel(e.source)}のぼうぎょ：防御状態`);i++;
 }
}
$('party-attack').onclick=async()=>{party='attack';render();await runRound();};$('party-guard').onclick=async()=>{party='guard';render();await runRound();};$('party-auto').onclick=async()=>{party='auto';render();await runRound();};
$('individual-attack').onclick=()=>{targeting=true;render();};$('individual-guard').onclick=()=>setIndividual('guard');$('individual-cancel').onclick=()=>setIndividual(null);
$('command-info').onclick=()=>{if(busy||selected===null)return;RankBattleInfo.open({document:doc,side:selectedSide,slot:selected});};
$('command-back').onclick=close;document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!busy)close();});
$('command-status').onclick=()=>{if(busy||ended()||selected===null)return;statusView=!statusView;targeting=false;render();};
function playbackGroups(events){
 const groups=[];
 for(const e of groupPhaseLogs(events)){
  if(e.kind==='phase-log'){groups.push(e.rows);continue;}
  const last=groups.at(-1),previous=last?.at(-1);
  const family=x=>['attack','physical-reflection'].includes(x.kind)?'attack':['shot','shot-unavailable'].includes(x.kind)?'shot':['heal','heal-unavailable'].includes(x.kind)?'heal':x.kind;
  if(previous&&previous.source&&e.source&&family(previous)===family(e)&&previous.source.side===e.source.side&&previous.source.slot===e.source.slot&&previous.name===e.name)last.push(e);
  else groups.push([e]);
 }
 return groups;
}
function playbackStages(rows){
 const damage=[],effects=[];
 for(const e of rows){
  const attack=['attack','shot','physical-reflection'].includes(e.kind);
  if(attack&&e.reflectType!==undefined&&![3,4,6].includes(e.reflectType)){effects.push(e);continue;}
  damage.push(attack?{...e,presentationDeferredConditionUid:e.additionalCondition?.success?e.additionalCondition.uid:undefined,additionalCondition:undefined}:e);
  if(attack&&e.additionalCondition?.success)effects.push({...e,presentationConditionOnly:e.additionalCondition.uid,kind:'antenna-effect',damage:undefined,damageValues:undefined,appliedHpGain:undefined,hpGain:undefined,gain:undefined,kill:undefined,hpBefore:undefined,hpAfter:undefined,cover:undefined,success:true,effectUid:e.additionalCondition.uid,effectValue:e.additionalCondition.value,effectCurrentValue:e.additionalCondition.current,additionalCondition:undefined});
 }
 return effects.length?[damage,effects].filter(r=>r.length):[rows];
}
function playbackFailure(reason){
 const labels={'condition-add':'効果なし','no-improvement':'効果なし','resisted':'耐性で無効','resistance':'耐性で無効','insufficient-ap':'AP不足','antenna-sealed':'アンテナ封じ','cannot-move':'行動停止','no-valid-target':'有効な対象なし'};
 return labels[reason]??(reason&&/[ぁ-んァ-ヶ一-龠]/.test(reason)?reason:'不発');
}
async function playRound(result,round){
 globalThis.RankBattleScrollingLog?.reset();$('arena-message').textContent='';
 const motionsOn=motionEnabled();motionCardState=motionsOn?new Map(state.parties.flatMap((p,side)=>p.members.flatMap((a,slot)=>a?[[side+':'+slot,{hp:a.hp,conditions:structuredClone(a.conditions)}]]:[]))):null;if(motionsOn&&globalThis.RankBattle3D)RankBattle3D.onCards=updates=>{if(finishPlayback||!motionCardState)return;for(const u of updates||[])if(motionCardState.has(u.key))motionCardState.set(u.key,RankBattleMotion.applyCardUpdate(motionCardState.get(u.key),u));renderRoster(0);renderRoster(1);};render();if(motionsOn)await globalThis.RankBattle3D?.prepare();
 const seconds=Number($('log-interval').value)||2;
 if(!Number.isInteger(seconds*2)||seconds<0.5||seconds>10)throw Error('ログ表示間隔は0.5～10秒（0.5秒刻み）で選択してください');
 const wait=async()=>{if(finishPlayback)return;await new Promise(resolve=>{let remaining=seconds*1000,last=performance.now(),wasHidden=!!document.hidden,timer;
  const done=()=>{clearTimeout(timer);if(advancePlayback===done)advancePlayback=null;resolve()};
  const tick=()=>{const now=performance.now();if(!paused&&!document.hidden&&!wasHidden)remaining-=now-last;last=now;wasHidden=!!document.hidden;if(finishPlayback||remaining<=0)done();else timer=setTimeout(tick,25)};
  advancePlayback=done;timer=setTimeout(tick,25);
 });};
 let batchQueue=null,batchItem=null;
 const show=async(view,cues,labels=[])=>{if(batchItem){if(cues.some(c=>c.stage==='attack')){batchItem.view=view;batchItem.cues=cues;batchItem.labels=labels;batchItem.title=$('arena-message').textContent;}else batchItem.reactions.push(...cues);return;}if(finishPlayback)return;const played=motionsOn?await globalThis.RankBattle3D?.present(view,cues,labels):false;if(!played&&!finishPlayback)await wait();};
 const phaseKinds=new Set(['guard','turn-start-condition','condition-recovery','condition-up','condition-round','condition-damage','condition-countdown']);
 appendLog([],round);
 const visualGroups=playbackGroups(result.events.filter(e=>RankBattleNativeMessages.appliedStart(e))).flatMap(allRows=>{const chunks=motionsOn&&globalThis.RankBattleDirector?RankBattleDirector.hitGroups(allRows):[allRows];return chunks.map((rows,i)=>({rows,allRows,first:i===0,last:i===chunks.length-1}));});
 if(motionsOn)globalThis.RankBattleDirector?.attackChains(visualGroups);
 if(motionsOn&&globalThis.RankBattle3D)RankBattle3D.onTitle=text=>{if(!finishPlayback)$('arena-message').textContent=text;};
 const approachedChains=new Set();
 for(const {rows,allRows,first,last,chain,nextAttack} of visualGroups){
  if(motionsOn&&rows.every(e=>e.kind==='cannot-act')){appendLog(allRows,round,$('battle-log'),false);continue;}
  const batched=motionsOn&&chain?.keys.length>0;if(batched){$('arena-message').dataset.batchPending='1';batchQueue??=[];batchItem={cues:[],reactions:[]};batchQueue.push(batchItem);}
  const output=el('ol','');appendLog(allRows,round,output,false);
  if(motionsOn&&rows.every(e=>Number(e.hitIndex)>0&&!e.target&&['no-valid-target','no-effective-target','no-use','効果のある対象なし','有効な対象なし'].includes(e.reason)))continue;
  const line=Array.from(output.children).find(n=>n.textContent);if(!line)continue;
  const split=line.textContent.indexOf('：'),phase=phaseKinds.has(rows[0].kind);
  let title=split<0?line.textContent:line.textContent.slice(0,split);
  const hits=executedHitCount(allRows);
  if(!phase&&hits>1)title+=` ×${hits}`;
  const center=$('arena-message');center.replaceChildren();
  center.className='';
  const source=rows[0].source,label=source?actorLabel(source):'';
  const actionUid=source?state.parties[source.side].members[source.slot]?.antenna?.action?.action_uid:null;
  const actionKind=rows.find(e=>['attack','shot','heal','antenna-effect'].includes(e.kind))?.kind;
  const target=allRows.find(e=>e.target&&e.reflectType===undefined)?.target;
  const attackView=source&&target?{mode:'attack',approached:!!chain,chainMoves:chain?.moves,targetKeys:globalThis.RankBattleDirector.targetKeys(allRows),chain:chain?.id,attackers:chain?.keys,cameraTargets:chain?.targets,cameraSpan:chain?.span,key:source.side+':'+source.slot,side:source.side,targetSide:target.side,targetKey:target.side+':'+target.slot,targetCount:new Set(allRows.filter(e=>e.target&&e.reflectType===undefined).map(e=>e.target.side+':'+e.target.slot)).size}:null;
  if(motionsOn&&chain&&!batched&&!approachedChains.has(chain.id)){approachedChains.add(chain.id);await show({...attackView,stage:'approach'},chain.keys.map(key=>({key,stage:'approach',motions:['走る']})));}
  const statusOnly=motionsOn&&globalThis.RankBattleDirector?.statusOnly(allRows);
  if(motionsOn&&!phase&&label&&title.startsWith(label)){center.textContent=(state.parties[source.side].members[source.slot]?.name||label)+title.slice(label.length);}
  else if(!phase&&label&&title.startsWith(label)){center.append(el('span',source.side?'log-actor enemy':'log-actor ally',label),el('span','',title.slice(label.length)));}
  else center.textContent=title;
  if(motionsOn&&source){const user=state.parties[source.side].members[source.slot];const nativeTitle=globalThis.RankBattleNativeMessages?.title(actionKind||rows[0].kind,user?.name||label,user?.antenna?.name||'',hits);if(nativeTitle)center.textContent=nativeTitle;}
  if(!first)center.replaceChildren();
  activeActor=first&&!phase&&source?`${source.side}:${source.slot}`:null;
  const turnEnd=['condition-recovery','condition-up','condition-round','condition-damage','condition-countdown'].includes(rows[0].kind);
  cardMessages.clear();render();if(first&&!turnEnd&&!(motionsOn&&['guard','turn-start-condition'].includes(rows[0].kind))&&!(motionsOn&&actionKind==='attack'&&attackView)){await show(!phase&&source?(actionKind==='attack'&&attackView?attackView:{mode:'actor',key:source.side+':'+source.slot}):{mode:'team',side:source?.side??0},motionsOn?globalThis.RankBattleMotion.action(allRows).map(c=>({...c,stage:actionKind==='attack'?'attack':'cast',approach:first,actionKind,actionUid})):[]);center.replaceChildren();}activeActor=null;
  if(motionsOn&&rows[0].kind==='guard')center.replaceChildren();
  const stages=playbackStages(rows).flatMap((stage,index)=>motionsOn?RankBattleMotion.sides(stage).map(part=>({...part,reaction:index>0})):[{rows:stage,reaction:index>0}]);
  for(const [stageIndex,part] of stages.entries()){
  const stage=part.rows;
  cardMessages.clear();
  const deadTargets=new Set(rows.filter(e=>e.kill||e.hpAfter===0).map(e=>e.target?`${e.target.side}:${e.target.slot}`:null));
  for(const e of stage){
   if(part.reaction&&e.target&&deadTargets.has(`${e.target.side}:${e.target.slot}`))continue;
   const ref=e.target??e.source;if(!ref)continue;
   const key=`${ref.side}:${ref.slot}`,actor=state.parties[ref.side].members[ref.slot];if(!actor)continue;
   let text='',glow=false;
   if(e.kind==='guard'){text='防御した';glow=true;}
   else if(e.kind==='antenna-sealed'){text='アンテナは使えない';}
   else if(e.kind==='turn-start-condition'){text=conditionName(e.uid);glow=true;}
   else if(e.kind==='antenna-effect'){text=e.success?appliedEffectLabel(e):playbackFailure(e.reason);glow=!!e.success;}
   else if(e.kind==='heal'){text=e.hpGain>0?`HP +${e.hpGain}${e.revival?'・復活':''}`:'';glow=e.hpGain>0;}
   else if(e.kind==='condition-recovery'){text=`${e.resource.toUpperCase()} +${e.gain}`;glow=e.gain>0;}
   else if(e.kind==='condition-up'){text=effectLabel({effectUid:e.conditionResult.uid,effectValue:e.conditionResult.value});glow=true;}
   else if(e.kind==='condition-round'){text=effectLabel({effectUid:e.uid,effectValue:e.before.current-e.before.base})+'終了';}
   else if(e.kind==='condition-damage'||e.kind==='condition-countdown'){text=e.damage!==undefined?`${e.damage}ダメージ`:e.kill?'死亡':`残り${e.remainingTurns}`;glow=!!e.damage;}
   else if(['attack','shot','physical-reflection'].includes(e.kind)){text=e.cover&&Number.isFinite(e.damage)&&!e.blocked&&!e.miss&&!e.reflectionQueued?`${e.damage}ダメージ${e.kill?'・死亡':''}`:stripTargetParticle(attackLogResult({...e,cover:undefined}).replace(actorLabel(ref),''));glow=!e.miss&&!e.blocked&&!e.excitementFailed&&!e.blindnessFailed&&(e.damage>0||e.type===2||e.reflectionQueued);}
   else text=playbackFailure(e.reason);
   if(motionsOn)text=(text==='不発'||text==='効果のある対象無し'||['no-valid-target','no-effective-target','no-use','効果のある対象なし','有効な対象なし'].includes(e.reason))?'':globalThis.RankBattleNativeMessages?.result(e,text)??text;
   if(text){const old=cardMessages.get(key),lines=old?.lines??[],hitLines=old?.hitLines??{};
    const quantity=e.kind!=='antenna-effect'&&(e.damage!==undefined||e.hpGain!==undefined||e.gain!==undefined||e.appliedHpGain>0);
    const multiple=!statusOnly&&executedHitCount(allRows)>1;
    const hit=Number(e.hitIndex??0),formatted=multiple&&e.reflectType===undefined?`${hit+1}ヒット目 ${text}`:text;
    if(quantity){if(hitLines[hit]!==undefined)lines[hitLines[hit]]+='、'+text;else {hitLines[hit]=lines.length;lines.push(formatted);}}
    else if(!lines.includes(formatted))lines.push(formatted);
    cardMessages.set(key,{text:lines.join('\n').replace(/(\d+)ダメージ、(?=\d+ダメージ)/g,'$1、'),lines,hitLines,glow:glow||!!old?.glow});}
   if(!motionsOn&&e.cover?.originalTarget&&e.target){
    const coveredKey=`${e.cover.originalTarget.side}:${e.cover.originalTarget.slot}`,old=cardMessages.get(coveredKey),lines=old?.lines??[],hit=Number(e.hitIndex??0),coverText=`${actorLabel(e.target)}が庇った`,formatted=executedHitCount(allRows)>1?`${hit+1}ヒット目 ${coverText}`:coverText;
    if(!lines.includes(formatted))lines.push(formatted);
    cardMessages.set(coveredKey,{text:lines.join('\n'),lines,hitLines:old?.hitLines??{},glow:true});
   }
   const saved=e.presentation?.[ref.side]?.[ref.slot];
   if(saved){
    if(!phase){if(stageIndex<stages.length-1){if(Number.isFinite(e.hpAfter))actor.hp=e.hpAfter;}else Object.assign(actor,structuredClone(saved));}
    else {
     if(e.kind==='condition-recovery')actor[e.resource]=saved[e.resource];
     if(['condition-damage','condition-countdown'].includes(e.kind))actor.hp=saved.hp;
     const uid=e.uid??e.conditionResult?.uid;
     if(uid){const condition=saved.conditions.find(c=>Number(c.uid)===Number(uid));actor.conditions=actor.conditions.filter(c=>Number(c.uid)!==Number(uid));if(condition)actor.conditions.push(structuredClone(condition));}
     if(actor.hp<=0)actor.conditions=structuredClone(saved.conditions);
    }
   }
   if(!phase&&e.source){const user=state.parties[e.source.side].members[e.source.slot],savedUser=e.presentation?.[e.source.side]?.[e.source.slot];if(user&&savedUser){if(stageIndex<stages.length-1)user.ap=savedUser.ap;else Object.assign(user,structuredClone(savedUser));}}
  }
  if(stageIndex===stages.length-1&&!phase)for(const e of rows)for(const ref of [e.target,e.source]){if(!ref)continue;const saved=e.presentation?.[ref.side]?.[ref.slot],actor=state.parties[ref.side].members[ref.slot];if(saved&&actor)Object.assign(actor,structuredClone(saved));}
  render();
  if(cardMessages.size||turnEnd){const motionRows=stage.filter(e=>!(part.reaction&&e.target&&deadTargets.has(e.target.side+':'+e.target.slot)));if(batchItem)(batchItem.damageRows??=[]).push(...motionRows);
   const labels=motionsOn?[...cardMessages].map(([key,v])=>{const quantities=motionRows.filter(e=>(e.target??e.source)?.side+':'+(e.target??e.source)?.slot===key).map(e=>RankBattleMotion.amount(e)).filter(a=>a.text!==undefined);return {key,critical:quantities.length===1&&!!quantities[0].critical,text:quantities.length?quantities.map(a=>a.text).join('、'):v.text,tone:quantities[0]?.tone||'effect'};}):[];
   const sameAttackScene=motionsOn&&!phase&&actionKind==='attack'&&attackView&&!motionRows.some(e=>e.kind==='physical-reflection'||e.reflectType!==undefined);
   const simultaneous=motionsOn&&!phase&&!part.reaction&&actionKind==='attack'&&attackView&&motionRows.some(e=>e.kind==='attack'&&e.reflectType===undefined);
   const cues=motionsOn?RankBattleMotion.cardCues(motionRows,RankBattleMotion.effects(motionRows)).map(c=>({...c,...(!phase&&!part.reaction?{stage:'hit',actionKind,actionUid,synchronized:!!simultaneous}:{} )})):[];
   if(simultaneous)cues.unshift(...RankBattleMotion.action(motionRows).map(c=>({...c,stage:'attack',actionKind,actionUid,synchronized:true})));
   await show({...(sameAttackScene?attackView:{mode:'team',side:part.side??(stage[0]?.target??stage[0]?.source)?.side??0}),holdReactionPose:actionKind==='shot'&&!part.reaction&&stages.some(p=>p.reaction),preserveCamera:part.reaction&&actionKind==='shot',stage:!phase&&!part.reaction?'hit':undefined,actionKind,actionUid,resultTitle:motionsOn?RankBattleNativeMessages.damage(motionRows,ref=>state.parties[ref.side].members[ref.slot]?.name||''):null,multiHit:!phase&&!part.reaction&&hits>1,guardians:motionsOn?RankBattleDirector.reactionGuardians(motionRows,rows,part.reaction,actionKind):[]},cues,motionsOn?labels:[]);
  }cardMessages.clear();if(turnEnd)center.replaceChildren();render();
  }
  if(last&&!batched&&motionsOn&&globalThis.RankBattleDirector&&actionKind==='attack'&&source&&state.parties[source.side].members[source.slot]?.hp>0){if(!finishPlayback)await globalThis.RankBattle3D?.present({...attackView,background:!!nextAttack},[{key:source.side+':'+source.slot,stage:'return',motions:['走る']}]);}
  if(batched&&!nextAttack){const queue=batchQueue.filter(a=>a.cues.length);batchQueue=null;batchItem=null;delete $('arena-message').dataset.batchPending;if(queue.length){const batchTitle=(queue[0].view.side===0?'味方':'敵')+'の 攻撃!';$('arena-message').textContent=batchTitle;await show({...queue[0].view,batchTitle,batchResultTitle:RankBattleNativeMessages.damage(queue.flatMap(a=>a.damageRows||[]),ref=>state.parties[ref.side].members[ref.slot]?.name||''),guardians:[...new Set(queue.flatMap(a=>a.view.guardians||[]))],batch:queue},[],[]);}}else batchItem=null;
  if(last){const log=$('battle-log');if(log.children.length)log.append(el('li','action-gap',''));for(const child of Array.from(output.children))log.append(child);log.scrollTop=log.scrollHeight;}
 }
 motionCardState=null;if(globalThis.RankBattle3D){RankBattle3D.onTitle=null;RankBattle3D.onCards=null;}
 $('arena-message').textContent='VS';
 $('arena-message').className='';
}
$('motion-style').onchange=()=>{if(!busy)render();};
$('progression-style').onchange=()=>{if(!busy)render();};
$('start-round').onclick=async()=>{if(!rapid()||busy)return;await runMatches();};
async function playOutcome(){
 if(!ended()||![0,1].includes(state.basic.winner)||!motionEnabled())return;
 activeActor=null;cardMessages.clear();render();
 if(finishPlayback)return;
 await globalThis.RankBattle3D?.prepare();
 if(finishPlayback)return;
 await globalThis.RankBattleAudio?.playOutcome(state.basic.winner);
 const motion=state.basic.winner===0?'喜ぶ':'悲しむ';
 const cues=state.parties[0].members.flatMap((a,slot)=>a?.registration?[{key:`0:${slot}`,motions:[motion]}]:[]);
 await globalThis.RankBattle3D?.present({mode:'team',side:0,front:true,outcome:true},cues);
}
async function runRound(){
 if(busy||ended()||targeting||rapid())return;busy=true;finishPlayback=false;render();await new Promise(resolve=>setTimeout(resolve,30));
 let original=state;
 const snapshot={state:structuredClone(state),party,individual:structuredClone(individual),log:$('battle-log').innerHTML};
 try{$('battle-error').hidden=true;const input=state.basic?(roundFuture.length?B.refreshSimulationRandom(state):state):B.createBasicBattle(state,{evasion:true,critical:true,resetSavedParameters:true,maxRounds:readCount('round-limit',100,1000)});const animated=$('progression-style').value==='game',round=input.basic.round,result=B.runBasicRound(input,{party,individual,enemyParty:'auto',capturePresentation:true});
  if(animated){state=structuredClone(input);selected=null;targeting=false;await playRound(result,round);}else appendLog(result.events,round);
  snapshot.result=result;snapshot.round=round;roundHistory.push(snapshot);roundFuture.length=0;state=result.nextState;individual={};selected=null;targeting=false;await playOutcome();
 }catch(e){state=original;$('battle-log').innerHTML=snapshot.log;error(e.message);}finally{motionCardState=null;activeActor=null;paused=false;resumePlayback=null;advancePlayback=null;finishPlayback=false;cardMessages.clear();$('arena-message').textContent='VS';busy=false;render();}
}
$('pause-round').onclick=()=>{if(!busy||rapid())return;paused=!paused;if(!paused&&resumePlayback){const resume=resumePlayback;resumePlayback=null;resume();}render();};
$('finish-playback').onclick=()=>{if(!busy||rapid()||$('progression-style').value!=='game')return;finishPlayback=true;paused=false;if(resumePlayback){const resume=resumePlayback;resumePlayback=null;resume();}if(advancePlayback){const advance=advancePlayback;advancePlayback=null;advance();}render();};
$('forward-round').onclick=async()=>{if(busy||!roundFuture.length)return;const entry=roundFuture.at(-1),original=state,log=$('battle-log').innerHTML;finishPlayback=false;busy=true;selected=null;targeting=false;render();try{if($('progression-style').value==='game'){state=structuredClone(state);await playRound(entry.result,entry.round);}else appendLog(entry.result.events,entry.round);state=structuredClone(entry.result.nextState);roundFuture.pop();roundHistory.push(entry);individual={};await playOutcome();}catch(e){state=original;$('battle-log').innerHTML=log;error(e.message);}finally{motionCardState=null;paused=false;resumePlayback=null;advancePlayback=null;finishPlayback=false;activeActor=null;cardMessages.clear();$('arena-message').textContent='VS';busy=false;render();}};
$('rewind-round').onclick=()=>{if(busy||!roundHistory.length)return;const saved=roundHistory.pop();roundFuture.push(saved);state=structuredClone(saved.state);party=saved.party;individual=structuredClone(saved.individual);selected=null;targeting=false;statusView=false;$('battle-log').innerHTML=saved.log;$('battle-error').hidden=true;render();};
$('retire-battle').onclick=async()=>{if(!busy&&state.basic&&!ended()){state=B.retireBasicBattle(state);close();busy=true;try{await playOutcome();}finally{busy=false;paused=false;finishPlayback=false;render();}}};
$('reset-battle').onclick=()=>{if(busy)return;try{doc=RankPartyModel.validate(latestRegistration);state=B.buildPackedBattleState(doc);roundHistory.length=0;roundFuture.length=0;individual={};party='auto';selected=null;selectedSide=0;statusView=false;targeting=false;$('battle-log').replaceChildren();$('match-results').replaceChildren();$('match-summary').replaceChildren();$('battle-error').hidden=true;render();}catch(e){error(e.message);}};
$('antenna-command').onclick=()=>{if(selected===null||busy||ended())return;const a=state.parties[0].members[selected],h=B.basicHealAction(a)??B.basicShotAction(a)??B.basicEffectAction(a),kind=B.basicHealAction(a)?'heal':B.basicShotAction(a)?'shot':'effect';if(!h)return;if(h.range===9||h.range===11){commitIndividual({kind});}else{targeting=kind;render();}};
function turbo(){return $('battle-mode').value==='turbo';}
function rapid(){return ['rapid','turbo'].includes($('battle-mode').value);}
function readCount(id,fallback,max){const raw=$(id).value.trim(),n=raw===''?fallback:Number(raw);if(!Number.isInteger(n)||n<1||n>max)throw Error(`${id==='round-limit'?'上限ターン数':'試合数'}は1～${max}の整数を入力してください`);return n;}
$('battle-mode').onchange=()=>{$('round-limit').value='10';$('reset-battle').onclick();};
$('round-limit').oninput=()=>{if(!state.basic)render();};
async function runMatches(){
 if(turbo()){await runTurboMatches();return;}
 try{const count=readCount('match-count',1,10000),maxRounds=readCount('round-limit',100,1000);busy=true;selected=null;targeting=false;render();$('battle-error').hidden=true;const wins=[0,0];$('battle-log').replaceChildren();$('match-results').replaceChildren();$('match-summary').replaceChildren();
 for(let match=1;match<=count;match++){
 state=B.createBasicBattle(B.buildPackedBattleState(doc),{evasion:true,critical:true,resetSavedParameters:true,maxRounds});const rounds=[];
 while(state.basic.status!=='ended'){const round=state.basic.round,r=B.runBasicRound(state,{party:'auto',enemyParty:'auto'});state=r.nextState;rounds.push({events:r.events,round});render();await new Promise(resolve=>setTimeout(resolve,0));}
 if(state.basic.winner!==null)wins[state.basic.winner]++;
 if(state.basic.winner===1){$('battle-log').append(el('li','match-log-heading',`${match}試合目：${rounds.length}Tで敵勝利`));for(const r of rounds)appendLog(r.events,r.round);}
 $('match-results').append(el('span','match-result '+(state.basic.winner===0?'ally':'enemy'),`${match}試合目：${rounds.length}Tで${state.basic.winner===0?'味方勝利':state.basic.winner===1?'敵勝利':'引き分け'}${state.basic.reason==='round-limit'?`（累計ダメージ：味方 ${state.basic.damageTotals[0]} ／ 敵 ${state.basic.damageTotals[1]}）`:''}`));
 $('match-summary').replaceChildren(el('strong','',`${match}/${count}試合終了`),el('strong','ally',`味方 ${wins[0]}勝`),el('strong','enemy',`敵 ${wins[1]}勝`));
 }
 }catch(e){error(e.message);}finally{busy=false;render();}
}
async function runTurboMatches(){
 let resultFragment=document.createDocumentFragment(),logFragment=document.createDocumentFragment(),completed=0;const wins=[0,0];
 function flush(){if(resultFragment.childNodes.length)$('match-results').append(resultFragment);if(logFragment.childNodes.length)$('battle-log').append(logFragment);if(completed)$('match-summary').replaceChildren(el('strong','',completed+'/'+count+'試合終了'),el('strong','ally','味方 '+wins[0]+'勝'),el('strong','enemy','敵 '+wins[1]+'勝'));}
 let count;
 try{count=readCount('match-count',1,10000);const maxRounds=readCount('round-limit',100,1000);busy=true;selected=null;targeting=false;render();$('battle-error').hidden=true;for(const id of ['battle-log','match-results','match-summary'])$(id).replaceChildren();
 await new Promise(resolve=>setTimeout(resolve,0));
 await RankTurboMatches.run({B,document:doc,count,maxRounds,onFlush:flush,onMatch:result=>{
  const {match,state:final,turns,rounds}=result;completed=match;if(final.basic.winner!==null)wins[final.basic.winner]++;
  if(final.basic.winner===1){const original=state;state=final;try{const log=el('ol','');log.append(el('li','match-log-heading',match+'試合目：'+turns+'Tで敵勝利'));for(const r of rounds)appendLog(r.events,r.round,log);while(log.firstChild)logFragment.append(log.firstChild);}finally{state=original;}}
  const b=final.basic;resultFragment.append(el('span','match-result '+(b.winner===0?'ally':'enemy'),match+'試合目：'+turns+'Tで'+(b.winner===0?'味方勝利':b.winner===1?'敵勝利':'引き分け')+(b.reason==='round-limit'?'（累計ダメージ：味方 '+b.damageTotals[0]+' ／ 敵 '+b.damageTotals[1]+'）':'')));
 }});
 }catch(e){error(e.message);}finally{flush();busy=false;render();}
}

globalThis.RankBattleScreen={refreshRegistration(registration){latestRegistration=RankPartyModel.validate(registration);if(busy||state.basic)return;doc=latestRegistration;state=B.buildPackedBattleState(doc);individual={};selected=null;targeting=false;render();}};
if(typeof window!=='undefined'&&parent!==window){
 document.addEventListener('click',event=>{const link=event.target.closest?.('a[href="index.html"]');if(link){event.preventDefault();parent.postMessage({type:'rankbattle:registration-view'},'*');}});
 window.addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='rankbattle:registration')return;try{RankBattleScreen.refreshRegistration(event.data.registration);}catch(e){error(e.message);}});
 parent.postMessage({type:'rankbattle:ready'},'*');
}
render();
})();
