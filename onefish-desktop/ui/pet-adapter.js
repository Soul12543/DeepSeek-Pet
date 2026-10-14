// Adapt the bundled dsh-pet engine to OneFish without changing its animation/physics implementation.
'use strict';
let onefishState=null,lastWork='',nativeWorkTick=0,lastCompletionSeq=null,pendingMeals=0,onefishMenuOpen=false,completionNotice=null,completionBubbleTimer=null,onefishNativeOffset={x:0,y:0};
function placeInsideScreen(sprite,center) {
 const a=S.resolveRect(AREAS,center.x,center.y)||{x:0,y:0,width:VIEW.w,height:VIEW.h};
 // Keep the whole video stage visible: some expressions extend beyond the body hit box.
 const clamp=(n,min,max)=>max<min?(min+max)/2:Math.min(max,Math.max(min,n));
 const point={x:clamp(center.x,a.x+sprite.halfW,a.x+a.width-sprite.halfW),y:clamp(center.y,a.y+sprite.halfH,a.y+a.height-sprite.halfH-sprite.bottomPad)};
 sprite.customPos={rx:point.x/VIEW.w,ry:point.y/VIEW.h};sprite.position();
}
function reportPetHit(sprite){
 if(!sprite.hit||!window.petBridge?.setHitRect)return;
 const r=sprite.hit.getBoundingClientRect();window.petBridge.setHitRect({x:r.x,y:r.y,width:r.width,height:r.height});
}
function placePetInWindow(sprite){if(sprite.el){sprite.el.style.left=(sprite.margin.l+onefishNativeOffset.x)+'px';sprite.el.style.top=(sprite.margin.t+onefishNativeOffset.y)+'px';reportPetHit(sprite);}}
function applySize(sprite,size) {
 if(!sprite||!Number.isFinite(size)||size===sprite.size)return;
 const center={x:sprite.pos.x+sprite.halfW,y:sprite.pos.y+sprite.halfH},ratio=size/sprite.size;
 sprite.stopMove();sprite.stopThrow();sprite.stopDragFollow();
 for(const k of ['height','halfW','halfH','bottomPad','winH','sideAllow'])sprite[k]*=ratio;
 for(const k of Object.keys(sprite.hitRect))sprite.hitRect[k]*=ratio;
 for(const k of Object.keys(sprite.margin))sprite.margin[k]*=ratio;
 sprite.size=size;sprite.pet.size=size;sprite.space=null;
 placePetInWindow(sprite);
 sprite.el.style.setProperty('--pet-size',size+'px');sprite.stage.style.transform='translateY('+sprite.bottomPad+'px)';
 placeInsideScreen(sprite,center);
 window.__dshPetDebug.hitRect=sprite.hitRect;
}
function playChoice(sprite,choice,mode='ambient') {
 if(!choice)return;
 sprite.stopMove();sprite.onefishMode=mode;sprite.onefishGroup=choice.group;if(mode==='meal')sprite.onefishMealsStarted=(sprite.onefishMealsStarted||0)+1;sprite.onefishScheduling=true;
 try{if(choice.move&&sprite.tryMove(choice.name)!==false)return;sprite.playOnce(choice.name);}finally{sprite.onefishScheduling=false;}
}
function startMeal(sprite){
 if(!pendingMeals||sprite.onefishMode==='meal'||sprite.onefishMode==='interaction'||sprite.dragState.active||sprite.throwRef!==null)return false;
 const choice=OneFishAnimation.meal(sprite.animations,sprite.anim);if(!choice)return false;
 pendingMeals--;playChoice(sprite,choice,'meal');return true;
}
function playAmbient(sprite,forceBase=false){
 if(sprite.dragState.active)return;
 if(startMeal(sprite))return;
 const choice=OneFishAnimation.choose(sprite.animations,sprite.workState,sprite.anim,{fixed:sprite.pet.fixedEnabled||onefishMenuOpen,forceBase});
 playChoice(sprite,choice);
}
function applyOnefishState(next) {
 onefishState=next;
 const seq=Number(next.completionSeq)||0;
 if(lastCompletionSeq!==null&&seq>lastCompletionSeq){const count=seq-lastCompletionSeq;pendingMeals+=count;completionNotice=OneFishBubbles.completed(next,count);clearTimeout(completionBubbleTimer);completionBubbleTimer=setTimeout(()=>{completionNotice=null;refreshBubbles();},10000);}
 lastCompletionSeq=seq;
 for(const sprite of sprites){applySize(sprite,next.settings.size);if(next.settings.fixed&&!sprite.pet.fixedEnabled)sprite.stopMove();sprite.pet.fixedEnabled=next.settings.fixed;}
 const priority={waiting:70,working:60,thinking:50,result:40,error:30};
 const best=next.sources.filter(s=>s.running&&priority[s.state]).sort((a,b)=>priority[b.state]-priority[a.state])[0];
 const state=best?.state||null,signature=state||'idle';
 if(signature!==lastWork&&sprites.length){lastWork=signature;nativeWorkTick++;for(const sprite of sprites)sprite.onWorkTick({state},nativeWorkTick);}
 for(const sprite of sprites)startMeal(sprite);refreshBubbles();
}
function refreshBubbles(){
 if(!onefishState)return;const text=completionNotice||OneFishBubbles.work(onefishState.sources);
 for(const sprite of sprites){sprite.workOn=!!text;sprite.workText=text||null;sprite.renderBubble();}
}
function fitBubbleSpace(sprite){
 if(!sprite.margin||!sprite.el)return;
 const margin={t:Math.max(sprite.size/2,170),b:Math.max(sprite.size/2,170),l:Math.max(sprite.size/2,150),r:Math.max(sprite.size/2,150)};
 if(Object.keys(margin).some(k=>sprite.margin[k]!==margin[k])){sprite.margin=margin;placePetInWindow(sprite);sprite.sendBounds(sprite.pos.x,sprite.pos.y);}
}
function layoutBubble(sprite){
 if(!sprite.bubble||!sprite.bubble.classList.contains('is-on'))return;
 const a=S.resolveRect(AREAS,sprite.pos.x+sprite.halfW,sprite.pos.y+sprite.halfH);if(!a)return;
 sprite.bubble.classList.remove('is-below');sprite.bubble.style.left='50%';
 // Electron may update screenX/screenY one frame after the native bounds ack.
 // Derive the actual origin from requested bounds and the acknowledged offset.
 const origin={x:sprite.pos.x-sprite.margin.l-onefishNativeOffset.x,y:sprite.pos.y-sprite.margin.t-onefishNativeOffset.y};let rect=sprite.bubble.getBoundingClientRect();
 if(origin.y+rect.top<a.y+4)sprite.bubble.classList.add('is-below');
 rect=sprite.bubble.getBoundingClientRect();const left=origin.x+rect.left,right=origin.x+rect.right;
 const shift=left<a.x+4?a.x+4-left:right>a.x+a.width-4?a.x+a.width-4-right:0;
 if(shift)sprite.bubble.style.left='calc(50% + '+shift+'px)';
}
function queueBubbleLayout(sprite){
 if(sprite.onefishBubbleFrame||!window.requestAnimationFrame)return;
 sprite.onefishBubbleFrame=window.requestAnimationFrame(()=>{sprite.onefishBubbleFrame=null;layoutBubble(sprite);});
}
const originalBubble=PetSprite.prototype.renderBubble;
PetSprite.prototype.renderBubble=function(){fitBubbleSpace(this);originalBubble.call(this);layoutBubble(this);queueBubbleLayout(this);};
const originalBounds=PetSprite.prototype.sendBounds;
if(originalBounds)PetSprite.prototype.sendBounds=function(...args){const result=originalBounds.apply(this,args);queueBubbleLayout(this);reportPetHit(this);return result;};
// Play each automatic clip once so ended can select the next mixed action.
const originalStopMove=PetSprite.prototype.stopMove;
PetSprite.prototype.stopMove=function(){const moving=this.moveRef!==null||this.pendingMove;originalStopMove.call(this);if(moving)this.customPos={rx:(this.pos.x+this.halfW)/VIEW.w,ry:(this.pos.y+this.halfH)/VIEW.h};};
const originalOnce=PetSprite.prototype.playOnce,originalMove=PetSprite.prototype.tryMove;
PetSprite.prototype.playOnce=function(name){if(!this.onefishScheduling)this.onefishMode='interaction';return originalOnce.call(this,name);};
PetSprite.prototype.tryMove=function(name){
 if(!this.onefishScheduling)this.onefishMode='interaction';
 if(this.moveRef!==null||this.pendingMove||this.throwRef!==null)return true;
 if(this.pet.fixedEnabled||onefishMenuOpen)return false;
 const requested=this.animations.moves.actions.find(a=>a.name===name);if(!requested)return false;
 const params={...this.animations.moves.default,...requested.params};
 const plan=OneFishMovement.plan({cx:this.currentCenterX(),cy:this.currentCenterY(),width:this.size,height:this.height,bottomPad:this.bottomPad,areas:AREAS,minDist:params.minDist*this.size/S.PET_REF_WIDTH,maxDist:params.maxDist*this.size/S.PET_REF_WIDTH,preferred:this.onefishScheduling?null:requested.direction,allowed:requested.direction||this.onefishScheduling?undefined:['left','right'],lastDirection:this.onefishDirection});
 if(!plan)return false;
 const chosen=this.onefishScheduling?OneFishMovement.animationFor(this.animations,plan.direction)||name:name;
 this.onefishDirection=plan.direction;this.facing=OneFishMovement.directionOf(this.animations,chosen)?'left':plan.direction==='right'?'right':'left';
 this.pendingMove={...plan,onefish2d:true,leadSec:Math.min(.25,params.leadSec),tailSec:Math.min(.25,params.tailSec)};
 this.anim=chosen;this.once=true;this.switchTo(chosen,true);return chosen;
};
const originalMoveDrive=PetSprite.prototype.startMoveDrive;
PetSprite.prototype.startMoveDrive=function(el){
 const plan=this.pendingMove;if(!plan?.onefish2d)return originalMoveDrive.call(this,el);
 if(this.moveRef!==null)return;this.pendingMove=null;
 const duration=Number.isFinite(el.duration)&&el.duration>0?el.duration:2.4,travel=Math.max(.1,duration-plan.leadSec-plan.tailSec),token=++this.moveToken;
 const step=()=>{if(this.moveToken!==token)return;const t=el.currentTime||0,fraction=Math.max(0,Math.min(1,(t-plan.leadSec)/travel));
  this.sendBounds(plan.start.x+(plan.target.x-plan.start.x)*fraction-this.halfW,plan.start.y+(plan.target.y-plan.start.y)*fraction-this.halfH);
  if(fraction<1)this.moveRef=requestAnimationFrame(step);else{this.moveRef=null;this.customPos={rx:plan.target.x/VIEW.w,ry:plan.target.y/VIEW.h};}
 };this.moveRef=requestAnimationFrame(step);
};
PetSprite.prototype.playIdle=function(){playAmbient(this);};
PetSprite.prototype.handleEnded=function(){
 if(this.dragState.active)return;
 const restore=this.onefishMode==='meal'||this.onefishMode==='interaction';
 if(this.animations.turn.includes(this.anim))this.facing=this.facing==='left'?'right':'left';
 this.onefishMode='ambient';playAmbient(this,restore);
};
PetSprite.prototype.resumeWorkStatusAnim=function(){this.onefishMode='ambient';playAmbient(this,true);return true;};
PetSprite.prototype.onWorkTick=function(snapshot,tick){
 const previous=this.workState,state=snapshot?.state||null;
 this.prevWorkTick=tick;this.prevWorkState=state;this.workState=state;
 if(this.workTimer!==null)clearTimeout(this.workTimer);this.workTimer=null;
 if(this.onefishMode==='meal'||this.onefishMode==='interaction'||this.dragState.active||this.throwRef!==null)return;
 if(['waiting','error'].includes(state)||!previous&&state)playAmbient(this,true);
};
// Upstream looping calls switchTo directly; keep the animation marker in sync so
// idle recovery and later interactions can correctly identify the work animation.
const originalSwitch=PetSprite.prototype.switchTo;
PetSprite.prototype.switchTo=function(next,once){if(next){this.anim=next;this.once=once;if(OneFishMovement.directionOf(this.animations,next))this.facing='left';}return originalSwitch.call(this,next,once);};
PetSprite.prototype.onContextMenu=function(e){e.preventDefault();e.stopPropagation();this.stopMove();window.onefish.menu();};
const originalDown=PetSprite.prototype.onPointerDown;
PetSprite.prototype.onPointerDown=function(e){if(e.button!==0)return;originalDown.call(this,e);reportPetHit(this);};
const originalPointerMove=PetSprite.prototype.onPointerMove,originalPointerUp=PetSprite.prototype.onPointerUp;
if(originalPointerMove)PetSprite.prototype.onPointerMove=function(e){originalPointerMove.call(this,e);reportPetHit(this);};
if(originalPointerUp)PetSprite.prototype.onPointerUp=function(e){originalPointerUp.call(this,e);reportPetHit(this);};
PetSprite.prototype.onMouseMove=function(e){
 if(this.dragState.active||this.menuOpen||this.chatOpen){this.setInteractive(true);return;}
 if(!this.hit)return;
 const r=this.hit.getBoundingClientRect();
 const x=Number.isFinite(e.clientX)?e.clientX:toLocal(e.screenX)-(this.pos.x+VIEW.x-this.margin.l-onefishNativeOffset.x);
 const y=Number.isFinite(e.clientY)?e.clientY:toLocal(e.screenY)-(this.pos.y+VIEW.y-this.margin.t-onefishNativeOffset.y);
 this.setInteractive(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom);
};
window.onefish.onState(applyOnefishState);
window.onefish.onAction(action=>{
 if(typeof action.menuOpen==='boolean')onefishMenuOpen=action.menuOpen;
 if(action.nativeOffset){onefishNativeOffset=action.nativeOffset;for(const sprite of sprites){placePetInWindow(sprite);layoutBubble(sprite);queueBubbleLayout(sprite);}}
 for(const sprite of sprites){if(action.anim)sprite.onMenuAction({label:action.anim,anim:action.anim});if(action.center)placeInsideScreen(sprite,{x:action.center.x-VIEW.x,y:action.center.y-VIEW.y});if(action.reset){sprite.customPos=null;sprite.stopMove();sprite.stopThrow();sprite.position();}}
});
window.addEventListener('wheel',e=>{if(!onefishState||!e.ctrlKey&&!e.metaKey)return;e.preventDefault();const step=onefishState.limits.step;void window.onefish.resize(onefishState.settings.size+(e.deltaY<0?step:-step));},{passive:false});
window.onefish.initial().then(next=>{
 const ready=()=>{if(!sprites.length){setTimeout(ready,80);return;}
  if(next.settings.center)for(const sprite of sprites)placeInsideScreen(sprite,{x:next.settings.center.x-VIEW.x,y:next.settings.center.y-VIEW.y});
  applyOnefishState(onefishState||next);
 };ready();
});
window.onefishDebug={snapshot:()=>({bubbleText:sprites[0]?.workText,bubbleVisible:!!sprites[0]?.bubble?.classList.contains('is-on'),bubbleRect:sprites[0]?.bubble?(()=>{const r=sprites[0].bubble.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,windowWidth:innerWidth,windowHeight:innerHeight,screenX:window.screenX,screenY:window.screenY};})():null,configOk:window.__dshPetDebug.configOk,errors:window.__dshPetDebug.errors.slice(),size:sprites[0]?.size,movementDirection:sprites[0]?.onefishDirection,nativeOffset:onefishNativeOffset,interactive:sprites[0]?._interactive,inputBusy:sprites[0]?.inputBusy?.(),dragging:sprites[0]?.dragState.dragging,lastDrag:window.__dshPetDebug.lastDragRaw,hitClient:sprites[0]?.hit?(()=>{const r=sprites[0].hit.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})():null,videoWidth:sprites[0]?.videoA.videoWidth||sprites[0]?.videoB.videoWidth,animation:sprites[0]?.anim,mode:sprites[0]?.onefishMode,group:sprites[0]?.onefishGroup,mealQueue:pendingMeals,mealsStarted:sprites[0]?.onefishMealsStarted||0,completionSeq:lastCompletionSeq,workState:sprites[0]?.workState,workEnabled:sprites[0]?.pet.workStatusEnabled,workTick:sprites[0]?.prevWorkTick,signature:lastWork,center:sprites[0]?{x:sprites[0].pos.x+sprites[0].halfW,y:sprites[0].pos.y+sprites[0].halfH}:null,hitRect:sprites[0]?.hitRect,stage:sprites[0]?{x:sprites[0].pos.x,y:sprites[0].pos.y,width:sprites[0].size,height:sprites[0].winH}:null,areas:AREAS,playbackRate:sprites[0]?(sprites[0].front===0?sprites[0].videoA:sprites[0].videoB).playbackRate:1,frontTime:sprites[0]?(sprites[0].front===0?sprites[0].videoA:sprites[0].videoB).currentTime:0})};
