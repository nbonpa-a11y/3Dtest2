(()=>{'use strict';
// Build immutable registration once; createBasicBattle clones it for every match.
async function run({B,document:doc,count,maxRounds,onMatch,onFlush,seedForMatch,now=()=>performance.now(),yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0))}){
 const base=B.buildPackedBattleState(doc);let deadline=now()+100;
 for(let match=1;match<=count;match++){
  let state=B.createBasicBattle(base,{evasion:true,critical:true,resetSavedParameters:true,maxRounds,...(seedForMatch?{seed:seedForMatch(match)}:{})});
  const rounds=[];
  while(state.basic.status!=='ended'){
   const round=state.basic.round,result=B.runBasicRound(state,{party:'auto',enemyParty:'auto'});state=result.nextState;rounds.push({events:result.events,round});
   if(now()>=deadline){onFlush?.();await yieldTask();deadline=now()+100;}
  }
  onMatch({match,state,turns:rounds.length,rounds:state.basic.winner===1?rounds:[]});
  if(now()>=deadline){onFlush?.();await yieldTask();deadline=now()+100;}
 }
 onFlush?.();
}
globalThis.RankTurboMatches={run};
})();
