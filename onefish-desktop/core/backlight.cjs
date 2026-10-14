'use strict';
const {execFile,spawn}=require('node:child_process');
const BUSY=new Set(['thinking','working','result']);
function isBusy(sources=[]){return sources.some(s=>s.running&&(s.sessions?.length?s.sessions.some(t=>BUSY.has(t.state)):BUSY.has(s.state)));}
class Backlight {
 constructor({binary,enabled=true,exec=execFile,launch=spawn,onChange=()=>{}}={}){
  Object.assign(this,{binary,enabled,exec,launch,onChange});this.supported=null;this.mode='checking';this.active=false;this.lastSeq=null;this.pauses=new Set();this.child=null;this.failed=false;this.disposed=false;
 }
 async start(){
  const probe=await new Promise(resolve=>this.exec(this.binary,['--probe'],{timeout:4000,maxBuffer:16384},(err,stdout)=>{try{resolve(JSON.parse(stdout.trim().split('\n').at(-1)));}catch{resolve({supported:false});}}));
  if(this.disposed)return;this.supported=probe.supported===true;this.mode=this.supported?'ready':'unsupported';this.notify();this.apply(0);
 }
 snapshot(){return{supported:this.supported,mode:this.mode,enabled:this.enabled};}
 notify(){this.onChange(this.snapshot());}
 observe(sample){
  this.active=isBusy(sample.sources);const seq=Math.max(0,Number(sample.completionSeq)||0);
  const delta=this.lastSeq===null?0:Math.max(0,seq-this.lastSeq);this.lastSeq=seq;
  this.apply(delta);
 }
 setEnabled(value){this.enabled=value===true;this.failed=false;this.apply(0);this.notify();}
 pause(reason){this.pauses.add(reason);this.stopChild();}
 resume(reason){this.pauses.delete(reason);this.apply(0);}
 apply(complete){
  if(this.disposed||!this.enabled||this.pauses.size){this.stopChild();return;}
  if(!this.supported||this.failed)return;
  if(!this.child&&(this.active||complete))this.createChild();
  if(this.child){try{this.child.stdin.write(JSON.stringify({active:this.active,complete})+'\n');}catch{this.stopChild();}}
 }
 createChild(){
  const child=this.launch(this.binary,['--serve'],{stdio:['pipe','pipe','ignore']});this.child=child;let text='';
  child.stdin.on('error',()=>{});
  child.stdout.on('data',chunk=>{
   text+=chunk;if(text.length>32768){this.stopChild();return;}let index;
   while((index=text.indexOf('\n'))>=0){const line=text.slice(0,index);text=text.slice(index+1);try{
    const message=JSON.parse(line);if(this.child!==child)continue;
    if(message.type==='mode')this.mode=message.mode;
    if(message.type==='restored')this.mode='ready';this.notify();
   }catch{}}
  });
  child.on('error',()=>{if(this.child===child){this.failed=true;this.mode='unavailable';this.child=null;this.notify();}});
  child.on('exit',code=>{
   if(this.child!==child)return;this.child=null;
   if(code!==0){this.failed=true;this.mode='unavailable';}else this.mode='ready';this.notify();
   // Restart only after another fresh monitor sample. A stalled monitor must
   // not defeat the native eight-second heartbeat timeout.
  });
 }
 stopChild(){
  const child=this.child;if(!child)return;this.child=null;
  // EOF is handled by the helper even if Electron crashes. No persistent agent.
  try{child.stdin.end(JSON.stringify({stop:true})+'\n');}catch{}
  const fallback=setTimeout(()=>child.kill('SIGTERM'),1500);fallback.unref?.();child.once('exit',()=>clearTimeout(fallback));
  this.mode=this.supported?'ready':'unsupported';this.notify();
 }
 dispose(){this.disposed=true;this.stopChild();}
}
module.exports={Backlight,isBusy};
