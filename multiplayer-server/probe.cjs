'use strict';
const fs=require('node:fs'),path=require('node:path');
const {OnlinePoker,DEFAULT_SERVER}=require('../onefish-desktop/core/online-poker.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let i=0;i<650;i++){if(check())return;await delay(50);}throw new Error('等待失败：'+label);}
async function group(url,count,all){
 const clients=Array.from({length:count},()=>new OnlinePoker('/unused',{persist:false}));all.push(...clients);const host=clients[0];
 await host.create({url,name:'十二席验收房主'});for(let i=1;i<count;i++)await clients[i].join({url,name:'验收朋友'+i,room:host.latest.room.code});
 const synced=()=>clients.every(c=>c.latest?.room.revision===host.latest?.room.revision);await until(synced,'加入同步');return{clients,host,synced};
}
async function closeGroup(clients){
 for(const client of [...clients].reverse()){
  try{if(client.phase==='connected'&&client.latest){const active=clients.filter(c=>c.phase==='connected'&&c.latest);await until(()=>active.every(c=>c.latest.room.revision===active[0].latest.room.revision),'离开同步');await client.leave();}}catch{}
  client.dispose();
 }
}
async function allIn(group){
 const{clients,host,synced}=group;
 for(let n=0;n<250&&host.latest.poker.status==='playing';n++){
  await until(synced,'出牌同步');const actor=host.latest.poker.players.find(p=>p.isToAct);
  if(actor?.kind==='ai'){await delay(100);continue;}
  const client=clients.find(c=>c.latest.poker.viewerSeat===actor?.seat);if(!client)throw new Error('真人座位错误');
  await client.act({action:'act',type:'allin'});await until(synced,'操作确认');
 }
 await until(()=>host.latest.poker.status==='hand-over','整手结算');
}
async function run(url=DEFAULT_SERVER){
 const all=[],report={server:url,version:'0.6.1',checks:{}};
 try{
  const solo=await group(url,1,all);await solo.host.act({action:'add-bot',botId:'altman'});await solo.host.act({action:'start'});
  for(let i=0;i<10;i++){if(solo.host.latest.poker.status==='hand-over')await solo.host.act({action:'next'});if(solo.host.latest.poker.status==='playing'&&solo.host.latest.poker.toAct===0)break;await delay(550);}
  await until(()=>solo.host.latest.poker.status==='playing'&&solo.host.latest.poker.toAct===0,'单人行动');const soloBefore=solo.host.latest.poker;
  report.checks.singleNoDeadline=solo.host.latest.room.turnMs===0&&solo.host.latest.room.turnDeadline===0;
  await delay(21000);report.checks.singleStaysAfterTwentySeconds=solo.host.latest.poker.status==='playing'&&solo.host.latest.poker.handNo===soloBefore.handNo&&solo.host.latest.poker.toAct===0&&!solo.host.latest.poker.players[0].folded;
  await solo.host.act({action:'act',type:solo.host.latest.poker.legal.check?'check':'call'});report.checks.singleLateActionAccepted=true;await closeGroup(solo.clients);
  const humans=await group(url,12,all),{host,clients}=humans;
  const extra=new OnlinePoker('/unused',{persist:false});all.push(extra);let refused=false;try{await extra.join({url,name:'第十三人',room:host.latest.room.code});}catch(e){refused=/12|满/.test(e.message);}extra.dispose();
  report.checks.rejectThirteenth=refused;await host.act({action:'start'});await until(humans.synced,'十二人发牌');
  report.checks.twelveHumans=host.latest.room.playerCount===12&&host.latest.room.maxPlayers===12;
  report.checks.privateCards=clients.every(c=>c.latest.poker.players.every(p=>p.cards.length===(p.seat===c.latest.poker.viewerSeat?2:0)));
  report.checks.noPublicTokens=clients.every(c=>!JSON.stringify(c.latest).includes(c.preferences.session.token));
  await allIn(humans);report.checks.humanChipsConserved=host.latest.poker.players.reduce((n,p)=>n+p.stack,0)+host.latest.poker.pot===24000000;await closeGroup(clients);
  const mixed=await group(url,2,all);
  for(let i=0;i<10;i++){await mixed.host.act({action:'add-bot',botId:['altman','dario','musk','liang','jensen'][i%5]});await until(mixed.synced,'机器人补位');}
  await mixed.host.act({action:'start'});await until(mixed.synced,'混合发牌');
  report.checks.twelveMixed=mixed.host.latest.room.playerCount===12&&mixed.host.latest.room.botCount===10;
  report.checks.halfSecondBots=mixed.host.latest.room.botDelayMs===500;
  await allIn(mixed);report.checks.mixedChipsConserved=mixed.host.latest.poker.players.reduce((n,p)=>n+p.stack,0)+mixed.host.latest.poker.pot===24000000;
  report.checks.winnerHands=mixed.host.latest.poker.results.length>0&&mixed.host.latest.poker.results.every(r=>r.players.every(p=>p.detail));
  await closeGroup(mixed.clients);
  const clock=await group(url,2,all);await clock.host.act({action:'start'});await until(clock.synced,'倒计时开始');
  const first=clock.clients[clock.host.latest.poker.toAct];await first.act({action:'act',type:'call'});await until(clock.synced,'大盲行动');
  const seat=clock.host.latest.poker.toAct,waiting=clock.clients[seat],room=waiting.latest.room;
  report.checks.humanTwentySeconds=room.turnMs===20000&&room.turnDeadline-room.serverTime>=19900&&room.turnDeadline-room.serverTime<=20000;
  report.checks.freeCheckBeforeTimeout=waiting.latest.poker.legal.check===true;
  await until(()=>clock.host.latest.poker.street==='flop','真实二十秒自动过牌');await until(clock.synced,'超时同步');
  report.checks.autoCheckWhenFree=!clock.host.latest.poker.players[seat].folded&&clock.host.latest.room.notice.includes('自动过牌');
  const raiser=clock.clients[clock.host.latest.poker.toAct];await raiser.act({action:'act',type:'raise',amount:raiser.latest.poker.legal.minRaiseTo});await until(clock.synced,'下注后同步');
  const foldingSeat=clock.host.latest.poker.toAct,folding=clock.clients[foldingSeat];report.checks.callRequiredBeforeTimeout=!folding.latest.poker.legal.check;await until(()=>clock.host.latest.poker.status==='hand-over','真实二十秒自动弃牌');await until(clock.synced,'弃牌后同步');report.checks.autoFoldWhenCallRequired=folding.latest.poker.players[foldingSeat].folded&&clock.host.latest.room.notice.includes('自动弃牌');
  let lateRefused=false;try{await folding.act({action:'act',type:'check'});}catch{lateRefused=true;}report.checks.lateActionRejected=lateRefused;
  waiting.stop();await waiting.open();await until(clock.synced,'恢复原座位');report.checks.seatRestored=waiting.latest.poker.viewerSeat===seat;await closeGroup(clock.clients);
  report.checks.https=url.startsWith('https:');if(Object.values(report.checks).some(v=>!v))throw new Error('公网十二席验收失败');
 }catch(e){report.error=e.message;}
 finally{all.forEach(c=>c.dispose());}
 const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9);if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report,null,2));if(report.error)process.exitCode=1;return report;
}
if(require.main===module)run(process.argv.find(a=>a.startsWith('https://')||a.startsWith('http://'))||DEFAULT_SERVER).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={run};
