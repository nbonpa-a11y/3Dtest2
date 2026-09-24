// Presentation-only pose interpolation. ChrObject::GetBlendTime fallback is 0.2 s.
// Native per-character overrides/StopAnimBlend are not yet mapped; never blend deaths or hit reactions.
(function(root){'use strict';
function create(group){let from=null,target=null,elapsed=0;
 function capture(){const nodes=[],seen=new Set();group.traverse(o=>{if(o===group)return;const attrs=[];for(const key of ['position','normal']){const a=o.geometry?.attributes?.[key];if(a&&!seen.has(a)){seen.add(a);attrs.push([a,a.array.slice()]);}}nodes.push({o,m:o.matrix.clone(),attrs});});return nodes;}
 function refresh(pose){for(const n of pose){n.m.copy(n.o.matrix);for(const [a,v]of n.attrs)v.set(a.array);}return pose;}
 function restore(pose){if(!pose)return;for(const n of pose){n.o.matrix.copy(n.m);n.o.matrixWorldNeedsUpdate=true;for(const [a,v]of n.attrs){a.array.set(v);a.needsUpdate=true;}}}
 return {begin(){from=capture();target=null;elapsed=0;},before(){restore(target);},apply(dt){if(!from)return;target=target?refresh(target):capture();elapsed+=Math.max(0,Number(dt)||0);const t=Math.min(1,elapsed/.2);if(t>=1){from=target=null;return;}
 for(let i=0;i<target.length;i++){const n=target[i],old=from[i];if(!old||old.o!==n.o)continue;
  if(!n.o.matrixAutoUpdate){// Match the linear deformation of the face vertices to the head's rigid attachment.
   // Spherical rotation on the head alone lets its surface occlude the blended face.
   for(let k=0;k<16;k++)n.o.matrix.elements[k]=old.m.elements[k]+(n.m.elements[k]-old.m.elements[k])*t;n.o.matrixWorldNeedsUpdate=true;}
  for(let j=0;j<n.attrs.length;j++){const [attr,next]=n.attrs[j],prev=old.attrs[j]?.[1];if(!prev||prev.length!==next.length)continue;for(let k=0;k<next.length;k++)attr.array[k]=prev[k]+(next[k]-prev[k])*t;attr.needsUpdate=true;}
 }
 },cancel(){restore(target);from=target=null;}};
}
root.RankBattlePoseBlend={create};if(typeof module!=='undefined')module.exports=root.RankBattlePoseBlend;
})(globalThis);
