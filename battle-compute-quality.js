(function(root){'use strict';
 const key='rankbattle-compute-quality',values=['auto','full','light','minimum'];
 const valid=v=>values.includes(v)?v:'auto';
 function read(){try{return valid(root.localStorage?.getItem(key));}catch{return 'auto';}}
 function resolve(value,mobile=!!root.matchMedia?.('(pointer: coarse)').matches){const mode=valid(value)==='auto'?(mobile?'light':'full'):valid(value);return {mode,actorHz:{full:0,light:15,minimum:10}[mode],effectHz:{full:0,light:15,minimum:10}[mode]};}
 root.RankBattleComputeQuality={read,resolve,save(value){value=valid(value);try{root.localStorage?.setItem(key,value);}catch{}return value;}};
})(globalThis);
