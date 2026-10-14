const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const {CompletionTracker}=require('../core/completions.cjs');const {reduceCodex}=require('../core/model.cjs');const policy=require('../ui/animation-policy.js');
const animations=require('../pet-config.json').animations;
const source=(id,sessions,running=true)=>({id,running,sessions});
const event=(key,at)=>({key,at});
test('completed tasks count even while another session or another harness is working',()=>{
 const tracker=new CompletionTracker();const a={sessionId:'a',state:'working',completions:[]};const b={sessionId:'b',state:'working',completions:[]};tracker.observe([source('codex',[a,b]),source('claude',[{sessionId:'c',state:'working'}])],100);
 const next=[source('codex',[{...a,state:'success',completions:[event('one',200)]},b]),source('claude',[{sessionId:'c',state:'working'}])];assert.equal(tracker.observe(next,200).completionSeq,1);assert.equal(tracker.observe(next,210).completionSeq,1);
});
test('startup and restarting an app never replay historical task completions',()=>{
 const tracker=new CompletionTracker();const s={sessionId:'a',state:'idle',completions:[event('old',50)]};assert.equal(tracker.observe([source('codex',[s])],100).completionSeq,0);assert.equal(tracker.observe([source('codex',[{...s,sessionId:'new'}])],200).completionSeq,0);
});
test('multiple tasks completed between polls are all retained, even if the next turn started',()=>{
 const tracker=new CompletionTracker();tracker.observe([source('codex',[{sessionId:'a',state:'working',completions:[]}])],100);
 const records=[{timestamp:200,payload:{type:'task_complete',turn_id:'a1'}},{timestamp:220,payload:{type:'task_complete',turn_id:'a2'}},{timestamp:230,payload:{type:'task_started'}}];const state=reduceCodex(records,{sessionId:'a'});assert.equal(state.state,'thinking');assert.equal(tracker.observe([source('codex',[state])],250).completionSeq,2);
});
test('Claude busy-to-idle is counted once, but closing the app is not a completion',()=>{
 const tracker=new CompletionTracker();const busy={sessionId:'c',state:'working',updatedAt:100},idle={...busy,state:'idle',updatedAt:200};tracker.observe([source('claude',[busy])],100);assert.equal(tracker.observe([source('claude',[idle])],200).completionSeq,1);assert.equal(tracker.observe([source('claude',[idle])],220).completionSeq,1);tracker.observe([source('claude',[busy])],230);assert.equal(tracker.observe([source('claude',[idle],false)],240).completionSeq,1);
});
test('DSH completion is deduplicated by completed turn, not cache modification time',()=>{
 const tracker=new CompletionTracker();const s={sessionId:'d',state:'working',completionKey:'1:10'};tracker.observe([source('dsh',[s])],100);assert.equal(tracker.observe([source('dsh',[{...s,state:'idle',completionKey:'2:20'}])],200).completionSeq,1);assert.equal(tracker.observe([source('dsh',[{...s,state:'idle',completionKey:'2:20',updatedAt:300}])],300).completionSeq,1);
});
test('mixed playback contains all seven requested categories and excludes seasonal actions',()=>{
 assert.deepEqual(policy.groups(animations).map(g=>g.id),['移动','小动作','玩耍','吃什么','文字','余额反馈','碎碎念']);
 const seen=new Set();for(let i=0;i<7;i++){const values=[.9,(i+.1)/7,0];seen.add(policy.choose(animations,'working','',{random:()=>values.shift()}).group);}assert.equal(seen.size,7);
});
test('fixed position still plays movement clips without actually moving',()=>{
 const values=[.9,0,0];assert.equal(policy.choose(animations,'working','',{fixed:true,random:()=>values.shift()}).move,false);const values2=[.9,0,0];assert.equal(policy.choose(animations,'working','',{fixed:false,random:()=>values2.shift()}).move,true);
});
test('waiting and errors remain clear status animations; food never repeats consecutively',()=>{
 assert.equal(policy.choose(animations,'waiting','',{random:()=>.99}).name,'工作状态-原地踱步张望');assert.equal(policy.choose(animations,'error','',{random:()=>.99}).name,'工作状态-垂头叹气冒汗');assert.notEqual(policy.meal(animations,'吃白饭',()=>0).name,'吃白饭');
});
async function renderer(){
 const handlers={},played=[];class PetSprite{
  constructor(){this.animations=animations;this.pet={size:184,fixedEnabled:true};this.size=184;this.dragState={active:false};this.throwRef=null;this.workTimer=null;this.workState=null;this.anim='待机呼吸休闲';this.facing='left';this.pos={x:0,y:0};this.halfW=92;this.halfH=51.75;}
  playOnce(name){this.anim=name;played.push(name);this.switchTo(name,true);}switchTo(){}tryMove(name){played.push(name);return name;}stopMove(){}stopThrow(){}stopDragFollow(){}renderBubble(){}onPointerDown(){}onMenuAction(leaf){this.playOnce(leaf.anim);}position(){}
 }
 const sprite=new PetSprite();const ctx={PetSprite,sprites:[sprite],AREAS:[{x:0,y:0,width:1440,height:900}],VIEW:{x:0,y:0,w:1440,h:900},S:{},setTimeout:(fn,ms)=>{const id=setTimeout(fn,ms);id.unref();return id;},clearTimeout,OneFishAnimation:policy,OneFishMovement:require('../ui/movement-policy.js'),OneFishBubbles:require('../ui/bubble-policy.js'),window:{addEventListener(){},onefish:{onState(fn){handlers.state=fn;},onAction(fn){handlers.action=fn;},initial:async()=>({sources:[],settings:{size:184,fixed:true},completionSeq:0})}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui/pet-adapter.js'),'utf8'),ctx);await new Promise(r=>setImmediate(r));return {sprite,handlers,played,ctx};
}
test('two completion events queue two meals, survive status changes, then return to the current work state',async()=>{
 const r=await renderer();const current={sources:[{id:'claude',running:true,state:'working'}],settings:{size:184,fixed:true},completionSeq:0};r.handlers.state(current);r.handlers.state({...current,completionSeq:2});assert.equal(r.sprite.onefishMode,'meal');assert.ok(animations.categories.find(c=>c.id==='吃什么').actions.includes(r.sprite.anim));const first=r.sprite.anim;r.handlers.state({...current,completionSeq:2,sources:[{id:'codex',running:true,state:'thinking'}]});assert.equal(r.sprite.anim,first);r.sprite.handleEnded();assert.equal(r.sprite.onefishMode,'meal');assert.notEqual(r.sprite.anim,first);r.sprite.handleEnded();assert.equal(r.sprite.onefishMode,'ambient');assert.equal(r.sprite.anim,'工作状态-思考冒泡');
});
test('completion waits for drag release and explicit manual playback remains usable',async()=>{
 const r=await renderer();const current={sources:[],settings:{size:184,fixed:true},completionSeq:1};r.sprite.dragState.active=true;r.handlers.state(current);assert.notEqual(r.sprite.onefishMode,'meal');r.sprite.dragState.active=false;r.sprite.handleEnded();assert.equal(r.sprite.onefishMode,'meal');r.sprite.handleEnded();r.handlers.action({anim:'舞狮头'});assert.equal(r.sprite.onefishMode,'interaction');assert.equal(r.sprite.anim,'舞狮头');r.sprite.handleEnded();assert.equal(r.sprite.onefishMode,'ambient');
});

test('a failed DSH turn does not trigger the food reward',()=>{
 const tracker=new CompletionTracker();const s={sessionId:'d',state:'working',completionKey:'1:10'};tracker.observe([source('dsh',[s])],100);assert.equal(tracker.observe([source('dsh',[{...s,state:'error',completionKey:'2:20'}])],200).completionSeq,0);
});

test('active task bubbles survive random/manual clips and refresh their text without restarting animation',async()=>{
 const r=await renderer();const current={sources:[{id:'codex',name:'Codex',running:true,state:'working',summary:'修复气泡'}],settings:{size:184,fixed:true},completionSeq:0};r.handlers.state(current);assert.equal(r.sprite.workOn,true);assert.ok(r.sprite.workText.includes('修复气泡'));r.handlers.action({anim:'舞狮头'});const count=r.played.length;r.handlers.state({...current,sources:[{...current.sources[0],summary:'验证气泡'}]});assert.equal(r.played.length,count);assert.equal(r.sprite.anim,'舞狮头');assert.ok(r.sprite.workText.includes('验证气泡'));r.handlers.state({...current,sources:[]});assert.equal(r.sprite.workOn,false);
});

test('hover follows the visible DOM body instead of stale top-edge margins',async()=>{
 const r=await renderer(),s=r.sprite;
 s.margin={l:172,t:172};s.hitRect={x:107.5,y:43,w:129,h:153};
 s.hit={getBoundingClientRect:()=>({left:279.5,right:408.5,top:104,bottom:257})};
 s.setInteractive=value=>s._interactive=value;
 s.onMouseMove({clientX:344,clientY:150});assert.equal(s._interactive,true);
 s.onMouseMove({clientX:344,clientY:70});assert.equal(s._interactive,false);
 s.dragState.active=true;s.onMouseMove({clientX:0,clientY:0});assert.equal(s._interactive,true);
});
