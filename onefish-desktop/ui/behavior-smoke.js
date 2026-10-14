(async()=>{
 const sprite=sprites[0],saved=structuredClone(onefishState),seq=lastCompletionSeq,meals=pendingMeals,fixed=sprite.pet.fixedEnabled;
 const center={x:sprite.pos.x+sprite.halfW,y:sprite.pos.y+sprite.halfH};const results={groups:[],move:false};let phase='启动';
 const wait=async(fn,timeout=3000)=>{const until=Date.now()+timeout;while(!fn()){if(Date.now()>until)throw new Error('动画验收超时：'+phase+' '+JSON.stringify({animation:sprite.anim,mode:sprite.onefishMode,queue:pendingMeals,pending:sprite.pending,time:(sprite.front===0?sprite.videoA:sprite.videoB).currentTime,duration:(sprite.front===0?sprite.videoA:sprite.videoB).duration,rate:(sprite.front===0?sprite.videoA:sprite.videoB).playbackRate,ended:(sprite.front===0?sprite.videoA:sprite.videoB).ended,move:sprite.moveRef!==null}));await new Promise(r=>setTimeout(r,20));}};
 const loaded=()=>!sprite.pending&&(sprite.front===0?sprite.videoA:sprite.videoB).videoWidth===640;
 try{
  sprite.onefishMode='ambient';pendingMeals=0;
  const working={...saved,completionSeq:seq,sources:[{id:'codex',running:true,state:'working'},{id:'claude',running:true,state:'idle'},{id:'dsh',running:false,state:'offline'}]};applyOnefishState(working);
  for(let i=0;i<7;i++){
   phase='随机分组 '+i;const values=[.9,(i+.1)/7,0];const choice=OneFishAnimation.choose(sprite.animations,'working','',{fixed:true,random:()=>values.shift()});playChoice(sprite,choice);await wait(loaded);
   const video=sprite.front===0?sprite.videoA:sprite.videoB;results.groups.push({group:choice.group,name:sprite.anim,videoWidth:video.videoWidth,loop:video.loop});
  }
  // Exercise the existing movement driver with the mixed selector while unfixed.
  phase='真实移动';sprite.pet.fixedEnabled=false;const a=S.resolveRect(AREAS,center.x,center.y);sprite.facing=center.x>a.x+a.width/2?'left':'right';
  const values=[.9,0,0];const move=OneFishAnimation.choose(sprite.animations,'working','',{fixed:false,random:()=>values.shift()});
  for(const video of [sprite.videoA,sprite.videoB]){video.defaultPlaybackRate=8;video.playbackRate=8;}
  const startX=sprite.pos.x,startY=sprite.pos.y;playChoice(sprite,move);await wait(loaded);await wait(()=>Math.hypot(sprite.pos.x-startX,sprite.pos.y-startY)>2);results.move=true;sprite.stopMove();
  sprite.pet.fixedEnabled=fixed;placeInsideScreen(sprite,center);sprite.onefishMode='ambient';
  phase='开始吃东西';const started=sprite.onefishMealsStarted||0;applyOnefishState({...working,completionSeq:seq+2});await wait(()=>sprite.onefishMode==='meal'&&loaded());
  results.firstMeal=sprite.anim;results.otherTaskStillWorking=sprite.workState==='working';
  phase='等待吃完';await wait(()=>pendingMeals===0&&sprite.onefishMode==='ambient',15000);results.mealsStarted=(sprite.onefishMealsStarted||0)-started;results.afterMeal={state:sprite.workState,mode:sprite.onefishMode};
 }finally{
  sprite.stopMove();for(const video of [sprite.videoA,sprite.videoB]){video.defaultPlaybackRate=1;video.playbackRate=1;}
  sprite.pet.fixedEnabled=fixed;pendingMeals=meals;lastCompletionSeq=seq;sprite.onefishMode='ambient';placeInsideScreen(sprite,center);applyOnefishState(saved);playAmbient(sprite,true);
 }
 return results;
})()
