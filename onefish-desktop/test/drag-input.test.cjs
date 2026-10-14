const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const S=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../vendor/dsh-pet/shared-core.js'),'utf8')+';PetShared;');
const {capturesPointer}=require('../core/pointer.cjs');
const animations=require('../pet-config.json').animations;

function dragHarness(scale){
 const frames=new Map(),handlers={},native={busy:false,bounds:null,hit:null,updates:0};
 let time=0,nextFrame=0,sprite;
 const ctx={S,console:{log(){}},performance:{now:()=>time},toLocal:n=>n/scale,toScreen:n=>n*scale,
  VIEW:{x:0,y:0,w:1470,h:923},AREAS:[{x:0,y:33,width:1470,height:890}],sprites:[],
  requestAnimationFrame:fn=>{const id=++nextFrame;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
  setTimeout:()=>0,clearTimeout(){},OneFishAnimation:require('../ui/animation-policy.js'),
  OneFishMovement:require('../ui/movement-policy.js'),OneFishBubbles:require('../ui/bubble-policy.js'),
  window:{__dshPetDebug:{errors:[]},addEventListener(){},onefish:{onState(fn){handlers.state=fn;},onAction(fn){handlers.action=fn;},initial:()=>new Promise(()=>{})},petBridge:{
   setInputBusy:value=>{native.busy=value;},setInteractive(){},setHitRect:r=>{native.hit=r;},
   setBounds(x,y,width,height){native.updates++;native.bounds={x,y:Math.max(33,y),width,height};handlers.action({nativeOffset:{x:0,y:(y-native.bounds.y)/scale}});}
  }}
 };
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../vendor/dsh-pet/sprite.js'),'utf8')+';this.PetSprite=PetSprite;',ctx);
 // Video playback is irrelevant to input; keep the real drag, spring, position and bridge methods.
 ctx.PetSprite.prototype.playOnce=function(name){this.anim=name;};
 ctx.PetSprite.prototype.switchTo=function(){};
 sprite=Object.create(ctx.PetSprite.prototype);
 const style={left:'172px',top:'172px'};
 Object.assign(sprite,{pet:{id:'main',fixedEnabled:true},size:344,height:193.5,halfW:172,halfH:96.75,bottomPad:16.125,winH:209.625,
  margin:{l:172,r:172,t:172,b:172},pos:{x:200,y:0},animations:{...animations,drag:[]},anim:animations.idle[0],
  physics:S.DEFAULT_PHYSICS,dragState:{active:false,dragging:false},dragTrail:[],dragFollow:null,dragFollowToken:0,dragTarget:null,dragVel:{vx:0,vy:0},
  menuOpen:false,chatOpen:false,moveRef:null,moveToken:0,pendingMove:null,throwRef:null,throwToken:0,throwState:null,workState:null,
  el:{style},stage:{style:{}},hit:{classList:{add(){},remove(){}},setPointerCapture(id){native.pointerId=id;},
   getBoundingClientRect(){const x=parseFloat(style.left)+107.5,y=parseFloat(style.top)+43;return{x,y,left:x,top:y,right:x+129,bottom:y+153.1875,width:129,height:153.1875};}}
 });
 ctx.sprites.push(sprite);vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui/pet-adapter.js'),'utf8'),ctx);
 sprite.sendBounds(200,0);
 return{sprite,native,ctx,frame(){time+=1000/60;const work=[...frames.values()];frames.clear();work.forEach(fn=>fn(time));}};
}

for(const scale of [1,2])test(`real pointer chain moves the native window and releases capture at scale ${scale}`,()=>{
 const h=dragHarness(scale),s=h.sprite,n=h.native,before={...n.bounds};
 const hit=s.hit.getBoundingClientRect(),point={x:before.x+(hit.x+hit.width/2)*scale,y:before.y+(hit.y+hit.height/2)*scale};
 s.onMouseMove({clientX:hit.x+hit.width/2,clientY:hit.y+hit.height/2});assert.equal(s._interactive,true);
 const down={button:0,pointerId:7,screenX:point.x,screenY:point.y};s.onPointerDown(down);
 assert.equal(n.busy,true);assert.equal(n.pointerId,7);
 const move={...down,screenX:point.x-120*scale,screenY:point.y+360*scale};s.onPointerMove(move);
 assert.equal(s.dragState.dragging,true);
 for(let i=0;i<90;i++)h.frame();
 assert.ok(n.bounds.x<before.x-80*scale);assert.ok(n.bounds.y>before.y+30*scale);assert.ok(n.updates>50);
 assert.equal(capturesPointer({x:9000,y:9000},n.bounds,n.hit,n.busy),true);
 const placed={...s.pos};s.onPointerUp(move);
 assert.equal(n.busy,false);assert.equal(s.dragState.active,false);assert.deepEqual({...s.pos},placed);
 assert.equal(capturesPointer({x:9000,y:9000},n.bounds,n.hit,n.busy),false);
 const updates=n.updates;h.frame();assert.equal(n.updates,updates);
});
