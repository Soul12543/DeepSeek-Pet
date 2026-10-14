(async()=>{
 const sprite=sprites[0],saved=structuredClone(onefishState),center={x:sprite.pos.x+sprite.halfW,y:sprite.pos.y+sprite.halfH},ended=sprite.handleEnded;
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async(fn,timeout=4500)=>{const until=Date.now()+timeout;while(!fn()){if(Date.now()>until)throw new Error('四方向动画验收超时 '+sprite.anim);await pause(20);}};
 const a=S.resolveRect(AREAS,center.x,center.y),middle={x:a.x+a.width/2,y:a.y+a.height/2};
 const report={directions:[],fixed:false,edgeTurns:false,topPosition:false};
 const physical=()=>{const r=sprite.stage.getBoundingClientRect();return {x:window.screenX-VIEW.x+r.x,y:window.screenY-VIEW.y+r.y,width:r.width,height:r.height};};
 const loaded=()=>!sprite.pending&&(sprite.front===0?sprite.videoA:sprite.videoB).videoWidth===640;
 try{
  applyOnefishState({...saved,settings:{...saved.settings,fixed:false}});sprite.stopMove();sprite.stopThrow();sprite.handleEnded=()=>sprite.stopMove();
  for(const direction of ['left','right','up','down']){
   sprite.stopMove();placeInsideScreen(sprite,middle);await pause(100);const start=physical();
   const name=OneFishMovement.animationFor(sprite.animations,direction);sprite.onefishScheduling=false;const chosen=sprite.tryMove(name);if(!chosen)throw new Error('未能启动 '+direction);await wait(loaded);
   const video=sprite.front===0?sprite.videoA:sprite.videoB;await wait(()=>video.currentTime>.5);const mid=physical();
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0);const pixels=ctx.getImageData(0,0,640,360).data;let transparent=0,opaque=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)transparent++;if(pixels[i]>200)opaque++;}
   await wait(()=>sprite.moveRef===null&&video.currentTime>=video.duration-.3);const end=physical(),v=OneFishMovement.vectors[direction];
   const dx=end.x-start.x,dy=end.y-start.y;
   report.directions.push({direction,name,videoWidth:video.videoWidth,videoHeight:video.videoHeight,transform:video.style.transform,dx,dy,correctDirection:v.x?Math.sign(dx)===v.x&&Math.abs(dy)<2:Math.sign(dy)===v.y&&Math.abs(dx)<2,transparent:transparent>pixels.length/4*.5&&opaque>pixels.length/4*.07,fits:end.x>=a.x-.5&&end.y>=a.y-.5&&end.x+end.width<=a.x+a.width+.5&&end.y+end.height<=a.y+a.height+.5,mid});
  }
  placeInsideScreen(sprite,middle);sprite.tryMove(OneFishMovement.animationFor(sprite.animations,'right'));await wait(loaded);await wait(()=>sprite.moveRef!==null);applyOnefishState({...saved,settings:{...saved.settings,fixed:true}});const stopped=physical();await pause(180);const still=physical();report.fixed=sprite.moveRef===null&&Math.abs(stopped.x-still.x)<1&&Math.abs(stopped.y-still.y)<1;
  sprite.stopMove();applyOnefishState({...saved,settings:{...saved.settings,fixed:false}});placeInsideScreen(sprite,{x:a.x+sprite.halfW,y:middle.y});await pause(100);const edgeStart=physical();sprite.onefishScheduling=true;const result=sprite.tryMove(OneFishMovement.animationFor(sprite.animations,'left'));sprite.onefishScheduling=false;await wait(loaded);const inward=sprite.onefishDirection;await wait(()=>sprite.moveRef===null);const edgeEnd=physical();report.edgeTurns=!!result&&inward!=='left'&&edgeEnd.x>=a.x-.5&&Math.hypot(edgeEnd.x-edgeStart.x,edgeEnd.y-edgeStart.y)>2;
  placeInsideScreen(sprite,{x:middle.x,y:a.y+sprite.halfH});await pause(180);const top=physical();report.topPosition=Math.abs(top.y-(a.y+sprite.bottomPad))<2;report.top=top;
 }finally{sprite.stopMove();sprite.handleEnded=ended;sprite.onefishMode='ambient';placeInsideScreen(sprite,center);applyOnefishState(saved);playAmbient(sprite,true);}
 return report;
})()
