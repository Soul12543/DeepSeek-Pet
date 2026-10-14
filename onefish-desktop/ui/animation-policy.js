// Shared, testable playlist policy. Playback and movement use the bundled upstream engine.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OneFishAnimation=api;})(typeof globalThis==='object'?globalThis:this,function(){
 const INDEX={thinking:0,working:1,result:2,waiting:3,success:4,error:5};
 const names=slot=>(Array.isArray(slot)?slot:[slot]).flat().filter(n=>typeof n==='string'&&n.length);
 function pick(pool,current,random=Math.random){const unique=[...new Set(pool)],other=unique.filter(n=>n!==current),choices=other.length?other:unique;return choices[Math.min(choices.length-1,Math.floor(random()*choices.length))]||null;}
 function groups(a,fixed=false){
  const category=id=>a.categories?.find(c=>c.id===id)?.actions||[];
  return [
   {id:'移动',names:(a.moves?.actions||[]).filter(x=>x.auto!==false).map(x=>x.name),move:!fixed},
   ...['小动作','玩耍','吃什么','文字'].map(id=>({id,names:category(id)})),
   {id:'余额反馈',names:names(a.events?.balance||[])},
   {id:'碎碎念',names:names(a.events?.whisper||[])}
  ].filter(g=>g.names.length);
 }
 function choose(a,state,current,{fixed=false,forceBase=false,random=Math.random}={}){
  const active=['thinking','working','result','waiting','error'].includes(state);
  const base={id:active?'工作状态':'待机',names:active?names(a.events?.workStatus?.[INDEX[state]]):names(a.idle||[])};
  let pool=base;
  if(!forceBase&&!['waiting','error'].includes(state)){
   const extras=groups(a,fixed);const repeatedBase=base.names.length===1&&base.names[0]===current;
   if(extras.length&&(repeatedBase||random()>=.55))pool=extras[Math.min(extras.length-1,Math.floor(random()*extras.length))];
  }
  const name=pick(pool.names,current,random);return name?{name,group:pool.id,move:!!pool.move}:null;
 }
 function meal(a,current,random=Math.random){const food=a.categories?.find(c=>c.id==='吃什么')?.actions||[];const name=pick(food,current,random);return name?{name,group:'吃什么',move:false}:null;}
 return {groups,choose,meal};
});
