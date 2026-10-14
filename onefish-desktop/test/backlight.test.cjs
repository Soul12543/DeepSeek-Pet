'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {Backlight,isBusy}=require('../core/backlight.cjs');
function sample(seq=0,...states){return{completionSeq:seq,sources:[{running:true,state:states[0]||'idle',sessions:states.map(state=>({state}))}]};}
async function fixture(){
 const children=[];const service=new Backlight({binary:'test-helper',exec:(_b,_a,_o,done)=>done(null,'{"supported":true}'),launch:()=>{
  const child=new EventEmitter();child.stdin=new EventEmitter();child.stdout=new EventEmitter();child.commands=[];
  child.stdin.write=line=>child.commands.push(JSON.parse(line));child.stdin.end=line=>{child.commands.push(JSON.parse(line));child.ended=true;};child.kill=()=>{};children.push(child);return child;
 }});await service.start();return{service,children};
}
test('任何助手中的思考/工作会话呼吸，等待确认和离线不呼吸',()=>{
 assert.equal(isBusy(sample(0,'waiting','working').sources),true);
 for(const state of ['thinking','working','result'])assert.equal(isBusy(sample(0,state).sources),true);
 for(const state of ['waiting','idle','error','success','unknown','offline'])assert.equal(isBusy(sample(0,state).sources),false);
 assert.equal(isBusy([{running:false,state:'working'}]),false);
});
test('启动不重放历史完成；任意会话完成均发送一次双闪请求，保留其他工作的呼吸',async()=>{
 const {service,children}=await fixture();service.observe(sample(10,'working'));assert.deepEqual(children[0].commands[0],{active:true,complete:0});
 service.observe(sample(11,'waiting','thinking'));service.observe(sample(11,'thinking'));
 assert.deepEqual(children[0].commands.slice(1),[{active:true,complete:1},{active:true,complete:0}]);service.dispose();
});
test('空闲时任务完成会独立启动双闪；结束后不继续占用键盘',async()=>{
 const {service,children}=await fixture();service.observe(sample(0,'idle'));assert.equal(children.length,0);
 service.observe(sample(2,'success'));assert.deepEqual(children[0].commands[0],{active:false,complete:2});
 children[0].emit('exit',0);assert.equal(service.child,null);assert.equal(children.length,1);service.dispose();
});
test('关闭灯效、退出均关闭输入，让辅助程序恢复原亮度',async()=>{
 const {service,children}=await fixture();service.observe(sample(0,'working'));service.setEnabled(false);
 assert.equal(children[0].ended,true);assert.equal(service.child,null);
 service.observe(sample(1,'working'));assert.equal(children.length,1);
 service.setEnabled(true);assert.equal(children.length,2);assert.equal(children[1].commands[0].complete,0);
 service.dispose();assert.equal(children[1].ended,true);service.observe(sample(2,'working'));assert.equal(children.length,2);
 children.forEach(child=>child.emit('exit',0));
});
test('锁屏和休眠分别恢复，只在全部解除后重新呼吸；不重放睡眠中的完成',async()=>{
 const {service,children}=await fixture();service.observe(sample(0,'working'));service.pause('sleep');service.pause('lock');
 service.observe(sample(1,'working'));service.resume('sleep');assert.equal(children.length,1);service.resume('lock');
 assert.equal(children.length,2);assert.deepEqual(children[1].commands[0],{active:true,complete:0});service.dispose();children.forEach(child=>child.emit('exit',0));
});
test('接口或辅助程序出错不反复写入硬件；再次启用可以重试',async()=>{
 const {service,children}=await fixture();service.observe(sample(0,'working'));children[0].emit('exit',1);
 service.observe(sample(1,'working'));assert.equal(children.length,1);assert.equal(service.snapshot().mode,'unavailable');
 service.setEnabled(true);assert.equal(children.length,2);service.dispose();children.forEach(child=>child.emit('exit',0));
 const unsupported=new Backlight({binary:'missing',exec:(_b,_a,_o,done)=>done(new Error('missing'),''),launch:()=>assert.fail('unsupported hardware must not launch')});
 await unsupported.start();unsupported.observe(sample(2,'working'));assert.equal(unsupported.supported,false);unsupported.dispose();
});

test('辅助程序的心跳超时不凭旧状态自行重启，只有新状态采样才恢复',async()=>{
 const {service,children}=await fixture();service.observe(sample(0,'working'));children[0].emit('exit',0);assert.equal(children.length,1);
 service.observe(sample(0,'working'));assert.equal(children.length,2);service.dispose();children.forEach(child=>child.emit('exit',0));
});
