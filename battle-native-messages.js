/* Presentation text verified in native EF8C0D86 battle-message table.
   Unknown messages retain the diagnostic wording; no battle state is changed. */
(function(root){'use strict';
const effects={'どく':'どくをあびた','やけど':'やけどを負った','みずびたし':'みずびたしになった','かぜっぴき':'かぜをひいた','どろだらけ':'どろだらけになった','かんでん':'かんでんした','しもやけ':'しもやけになった','のろい':'のろわれた','マヒ':'しびれてしまった','ねむり':'ねむってしまった','みりょう':'魅了された','ゆうわく':'魅了された','きょうふ':'怖くて動けない','無敵':'むてきになった','むてき':'むてきになった'};
Object.assign(effects,{'うごけない':'動きがとめられた','ブラインド':'視界が悪くなった','こうふん':'こうふんした','アンテナ封じ':'とくぎを 封じられた','ふういん':'とくぎを 封じられた','ブレス封じ':'ブレスを封じた','ゴースト化':'ゴーストになった','必中':'必中の効果を得た','貫通':'貫通の効果を得た','オート防御':'オート防御を始めた','たくわえ':'ちからをためた','ガード':'ガードシールドをはった','反射':'ミラーシールドをはった'});
const stats={'攻撃':'攻撃力','防御':'防御力','素早さ':'素早さ','回避':'回避率'};
function title(kind,name,antenna,hits=1){let value=kind==='attack'?`${name}の 攻撃!`:['shot','heal','antenna-effect'].includes(kind)?`${name}の ${antenna} !`:kind==='guard'?`${name}は 身を守った!`:null;return value&&value+(hits>1?` ×${hits}`:'');}
function result(event,text){
 if(event.kind==='guard')return '身を守った!';
 if(effects[text]&&['antenna-effect','turn-start-condition'].includes(event.kind)&&event.success!==false)return effects[text];
 const stat=text.match(/^(攻撃|防御|素早さ|回避)(アップ|ダウン)$/);if(stat)return `${stats[stat[1]]}が${stat[2]}`;
 const expiry=text.match(/^(攻撃|防御|素早さ|回避)(アップ|ダウン)終了$/);if(expiry)return `${stats[expiry[1]]}が元に戻った`;
 if(text==='無敵終了')return 'むてきは終了した';
 if(text==='死亡')return 'やられてしまった';
 return text;
}
function damage(rows,name){
 const totals=new Map();for(const e of rows){if(!['attack','shot','physical-reflection'].includes(e.kind)||!e.target||!Number.isFinite(e.damage)||e.miss||e.blocked||e.reflectionQueued)continue;const k=e.target.side+':'+e.target.slot;const old=totals.get(k)||{ref:e.target,value:0};old.value+=Math.max(0,e.damage);totals.set(k,old);}
 const values=[...totals.values()];if(!values.length)return '';
 if(values.length===1)return name(values[0].ref)+'に '+values[0].value+'ダメージ';
 return name(values[0].ref)+'たちに 平均'+Math.floor(values.reduce((n,x)=>n+x.value,0)/values.length)+'ダメージ';
}
function appliedStart(e){if(e.kind!=='turn-start-condition')return true;if(!e.target||e.success===false)return false;const snapshot=e.presentation?.[e.target.side]?.[e.target.slot];if(!snapshot)return true;return snapshot.hp>0&&(snapshot.conditions||[]).some(c=>Number(c.uid)===Number(e.uid)&&Number(c.current)>Number(c.base||0));}
root.RankBattleNativeMessages={title,result,damage,appliedStart};if(typeof module!=='undefined')module.exports=root.RankBattleNativeMessages;
})(globalThis);
