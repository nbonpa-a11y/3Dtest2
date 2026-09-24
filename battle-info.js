(()=>{'use strict';let frame=null,payload=null;
globalThis.RankBattleInfo={open(value){payload=value;if(parent!==window){parent.postMessage({type:'rankbattle:character-info',payload},'*');return;}frame=document.createElement('iframe');frame.className='battle-info-frame';frame.title='個体情報';frame.src='index.html?battleInfo=1';document.body.append(frame);}};
window.addEventListener('message',event=>{if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin)return;if(event.data?.type==='rankbattle:info-ready')frame.contentWindow.postMessage({type:'rankbattle:info-data',payload},'*');if(event.data?.type==='rankbattle:info-close'){frame.remove();frame=null;payload=null;}});
})();
