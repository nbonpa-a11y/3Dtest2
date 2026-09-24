(()=>{'use strict';
let frame=null,infoScroll=0;
const infoReturn=document.createElement('button');infoReturn.id='battle-info-return';infoReturn.className='primary app-navigation-button';infoReturn.textContent='戦闘に戻る→';infoReturn.hidden=true;document.body.append(infoReturn);
function openInfo(payload){infoScroll=scrollY;RankBattleNavigation.showRegistration();infoReturn.hidden=false;RankPartyApp.showBattleInfo(payload);}
infoReturn.onclick=()=>{RankPartyApp.closeBattleInfo();infoReturn.hidden=true;if(parent!==window&&new URLSearchParams(location.search).has('battleInfo')){parent.postMessage({type:'rankbattle:info-close'},'*');return;}for(const n of setupNodes)n.hidden=true;if(frame)frame.hidden=false;document.body.classList.add('viewing-battle');document.title='Rankbattle — バトル';scrollTo(0,infoScroll);};
const setupNodes=[...document.body.children].filter(n=>n!==infoReturn&&!['SCRIPT','DIALOG'].includes(n.tagName));
function sendRegistration(){frame?.contentWindow.postMessage({type:'rankbattle:registration',registration:RankBattleNavigation.registration()},'*');}
globalThis.RankBattleNavigation={
 registration:()=>RankPartyModel.validate(RankPartyApp.getDocument()),
 showRegistration(){infoReturn.hidden=true;RankPartyApp.closeBattleInfo();if(frame)frame.hidden=true;for(const n of setupNodes)n.hidden=false;document.body.classList.remove('viewing-battle');document.title='Rankbattle — パーティ登録';},
};
window.addEventListener('message',event=>{
 if(!frame||event.source!==frame.contentWindow)return;
 if(event.data?.type==='rankbattle:ready')sendRegistration();
 if(event.data?.type==='rankbattle:registration-view')RankBattleNavigation.showRegistration();
 if(event.data?.type==='rankbattle:character-info')openInfo(event.data.payload);
});
document.getElementById('battle-open').onclick=()=>{
 try{
  const doc=RankBattleNavigation.registration();
  if(!frame){sessionStorage.setItem('rankbattle.battle.setup.tool-v1',JSON.stringify(doc));frame=document.createElement('iframe');frame.id='battle-view';frame.title='戦闘シミュレーション';frame.src='battle.html';document.body.append(frame);}
  else sendRegistration();
  for(const n of setupNodes)n.hidden=true;frame.hidden=false;document.body.classList.add('viewing-battle');document.title='Rankbattle — バトル';
 }catch(e){const notice=document.getElementById('notice');notice.hidden=false;notice.className='error';notice.textContent='バトル画面へ移動できませんでした：'+e.message;}
};})();

if(parent!==window&&new URLSearchParams(location.search).has('battleInfo')){window.addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='rankbattle:info-data'||event.origin!==location.origin)return;RankPartyApp.showBattleInfo(event.data.payload);document.getElementById('battle-info-return').hidden=false;});parent.postMessage({type:'rankbattle:info-ready'},'*');}
