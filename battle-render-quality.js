(function(root){'use strict';
 const key='rankbattle-render-quality',values=['auto','high','standard','low','minimal'];
 const valid=v=>values.includes(v)?v:'auto';
 function read(){try{return valid(root.localStorage?.getItem(key));}catch{return 'auto';}}
 function resolve(value,dpr=root.devicePixelRatio||1,mobile=!!root.matchMedia?.('(pointer: coarse)').matches){
  const mode=valid(value)==='auto'?(mobile?'low':'high'):valid(value);
  return {mode,pixelRatio:Math.min(Math.max(.1,Number(dpr)||1),{high:1.5,standard:1,low:.65,minimal:.45}[mode]),fps:mode==='minimal'?30:60};
 }
 root.RankBattleRenderQuality={read,resolve,save(value){value=valid(value);try{root.localStorage?.setItem(key,value);}catch{}return value;}};
})(globalThis);
