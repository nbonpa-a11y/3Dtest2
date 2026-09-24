(function(root){'use strict';
 const key='rankbattle-effect-mode';
 const valid=v=>['normal','hidden','off'].includes(v)?v:'normal';
 root.RankBattleEffectSettings={read(){try{return valid(root.localStorage?.getItem(key));}catch{return 'normal';}},save(value){value=valid(value);try{root.localStorage?.setItem(key,value);}catch{}return value;}};
})(globalThis);
