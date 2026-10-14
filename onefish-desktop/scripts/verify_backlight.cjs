// Explicit, reversible hardware integration check; not part of routine tests.
'use strict';
const path=require('node:path'),fs=require('node:fs'),{spawn,execFileSync}=require('node:child_process');
const {Backlight}=require('../core/backlight.cjs');
const binary=path.resolve(__dirname,'../../dist/吃白饭的大肥鱼.app/Contents/Resources/app/native/keyboard-backlight');
const read=()=>JSON.parse(execFileSync(binary,['--probe'],{encoding:'utf8'}).trim());
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async predicate=>{for(let i=0;i<80;i++){if(predicate())return;await pause(40);}throw new Error('灯效状态切换超时');};
const report={events:[],checks:{},before:read()};
const service=new Backlight({binary,launch:(...args)=>{const child=spawn(...args);let buffer='';child.stdout.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);try{report.events.push(JSON.parse(line));}catch{}}});return child;}});
const sample=(seq,...states)=>({completionSeq:seq,sources:states.map((state,i)=>({id:['codex','claude','dsh'][i],running:true,state,sessions:[{state}]}))});
(async()=>{try{
 await service.start();service.observe(sample(0,'thinking','idle','idle'));await wait(()=>service.mode==='breathing');report.checks.taskBreathes=true;await pause(500);
 service.observe(sample(1,'success','working','idle'));await wait(()=>service.mode==='flashing');await wait(()=>service.mode==='breathing');report.checks.completionThenResumes=true;
 let child=service.child;let exited=new Promise(r=>child.once('exit',r));service.pause('lock');await exited;
 const first=report.events.find(e=>e.type==='restored');report.checks.twoFlashes=first?.flashes===2;report.checks.lockRestores=!!first?.ok;
 service.resume('lock');await wait(()=>service.mode==='breathing');await pause(350);child=service.child;exited=new Promise(r=>child.once('exit',r));service.setEnabled(false);await exited;
 report.after=read();report.checks.offRestores=Math.abs(report.after.brightness-report.before.brightness)<.015&&report.after.autoBrightness===report.before.autoBrightness;
 report.checks.noReplay=report.events.filter(e=>e.type==='restored')[1]?.flashes===0;
 if(Object.values(report.checks).some(v=>!v))throw new Error('实际任务灯效联动失败');
}catch(e){report.error=e.stack;process.exitCode=1;}finally{
 service.dispose();const out=path.resolve(__dirname,'../verification/keyboard-backlight/integration.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report.checks));if(report.error)console.error(report.error);
}})();
