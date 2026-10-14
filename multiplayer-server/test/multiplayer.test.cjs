const TEST_OWNER_KEY='private-owner-test-credential-only';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {io}=require('socket.io-client');const{createServer}=require(process.env.ONEFISH_BUNDLE_TEST?'../server.bundle.cjs':'../server.cjs');const{Rooms}=require('../rooms.cjs');
const {OnlinePoker,serverUrl}=require('../../onefish-desktop/core/online-poker.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<160;i++){if(fn())return;await delay(10);}throw new Error('waiting for network state');}
async function fixture(t,options={}){const app=await createServer({ownerKey:TEST_OWNER_KEY,requireApproval:false,...options}),address=await app.listen(0);const clients=[];t.after(async()=>{clients.forEach(s=>s.disconnect());await app.close();});const url='http://127.0.0.1:'+address.port;
 async function connect(){const socket=io(url,{path:'/onefish-poker/socket.io',transports:['websocket'],auth:{protocol:1},reconnection:false});clients.push(socket);socket.on('table',state=>socket.view=state);await new Promise((res,rej)=>{socket.once('connect',res);socket.once('connect_error',rej);});return socket;}
 async function request(socket,event,data){if(event==='create')data={...data,ownerKey:TEST_OWNER_KEY};return new Promise((resolve,reject)=>socket.timeout(1500).emit(event,data,(err,result)=>err?reject(err):resolve(result)));}
 async function command(socket,args){const r=await request(socket,'command',{id:randomUUID(),revision:socket.view.room.revision,...args});if(r.state)socket.view=r.state;return r;}
 return{app,url,connect,request,command};
}
test('twelve actual network clients share one table with private hole cards, legal turns and conserved chips',async t=>{
 const f=await fixture(t),players=[];for(let i=0;i<12;i++)players.push(await f.connect());
 const created=await f.request(players[0],'create',{name:'房主'});assert.equal(created.ok,true);
 for(let i=1;i<12;i++)assert.equal((await f.request(players[i],'join',{room:created.session.room,name:'朋友'+i})).ok,true);
 await until(()=>players.every(p=>p.view?.room.playerCount===12));
 assert.equal((await f.command(players[1],{action:'start'})).ok,false);
 assert.equal((await f.command(players[0],{action:'start'})).ok,true);
 await until(()=>players.every(p=>p.view?.poker.status==='playing'));
 const holeKeys=new Set();for(let seat=0;seat<12;seat++){
  const s=players[seat].view.poker;assert.equal(s.viewerSeat,seat);assert.equal(s.players[seat].cards.length,2);
  for(const c of s.players[seat].cards)holeKeys.add(c.r+c.s);
  assert.ok(s.players.filter(p=>p.seat!==seat).every(p=>p.cards.length===0&&!p.handName));
  assert.ok(!JSON.stringify(players[seat].view).includes(created.session.token));assert.ok(!('deck'in s));
  if(s.toAct!==seat)assert.equal(s.legal.fold,false);
 }
 assert.equal(holeKeys.size,24);
 const actor=players[0].view.poker.toAct,wrong=(actor+1)%12;
 assert.equal((await f.command(players[wrong],{action:'act',type:'fold',seat:actor})).ok,false);
 for(let n=0;n<70&&players[0].view.poker.status==='playing';n++){
  const seat=players[0].view.poker.toAct,current=players[seat];await until(()=>current.view.room.revision===players[0].view.room.revision);
  const result=await f.command(current,{action:'act',type:'allin'});assert.equal(result.ok,true,result.error);await until(()=>players.every(p=>p.view.room.revision===result.state.room.revision));
 }
 const end=players[0].view.poker;assert.equal(end.status,'hand-over');assert.equal(end.players.reduce((sum,p)=>sum+p.stack,0)+end.pot,24000000);assert.ok(end.results.length&&end.results[0].players[0].detail);
 assert.equal((await f.command(players[0],{action:'next'})).ok,true);await until(()=>players.every(p=>p.view.poker.handNo===2));
});
test('duplicate command identifiers and stale revisions never place a second bet',async t=>{
 const f=await fixture(t),a=await f.connect(),b=await f.connect(),created=await f.request(a,'create',{name:'A'});await f.request(b,'join',{room:created.session.room,name:'B'});await until(()=>a.view.room.playerCount===2);await f.command(a,{action:'start'});await until(()=>b.view.poker.status==='playing');
 const socket=[a,b][a.view.poker.toAct],input={id:randomUUID(),revision:socket.view.room.revision,action:'act',type:socket.view.poker.legal.check?'check':'call'};
 const one=await f.request(socket,'command',input);assert.equal(one.ok,true);const again=await f.request(socket,'command',input);assert.equal(again.ok,true);assert.equal(again.duplicate,true);assert.equal(again.state.room.revision,one.state.room.revision);assert.equal(again.state.poker.pot,one.state.poker.pot);
 assert.equal((await f.request(socket,'command',{...input,id:randomUUID()})).ok,false);
});
test('reconnecting uses the original secret seat, a fake secret fails, and another room cannot read the table',async t=>{
 const f=await fixture(t),a=await f.connect(),b=await f.connect(),created=await f.request(a,'create',{name:'A'}),joined=await f.request(b,'join',{room:created.session.room,name:'B'});await until(()=>a.view.room.playerCount===2);await f.command(a,{action:'start'});await until(()=>b.view.poker.status==='playing');
 const cards=JSON.stringify(b.view.poker.players[1].cards);b.disconnect();await until(()=>a.view.poker.players[1].connected===false);
 const fake=await f.connect();assert.equal((await f.request(fake,'resume',{room:created.session.room,token:'wrong'})).ok,false);assert.equal(fake.view,undefined);
 const restored=await f.connect(),result=await f.request(restored,'resume',joined.session);assert.equal(result.ok,true);assert.equal(result.state.poker.viewerSeat,1);assert.equal(JSON.stringify(result.state.poker.players[1].cards),cards);
 const other=await f.connect();await f.request(other,'create',{name:'隔壁'});assert.notEqual(other.view.room.code,a.view.room.code);assert.equal(other.view.poker.players.length,1);assert.equal((await f.request(other,'command',{id:randomUUID(),revision:other.view.room.revision,action:'act',type:'fold',room:created.session.room})).ok,false);
});
test('turn timeouts automatically check or fold and a room stays usable after its host leaves',async t=>{
 const f=await fixture(t,{turnMs:65}),a=await f.connect(),b=await f.connect(),c=await f.connect(),made=await f.request(a,'create',{name:'A'});await f.request(b,'join',{room:made.session.room,name:'B'});await f.request(c,'join',{room:made.session.room,name:'C'});await until(()=>a.view.room.playerCount===3);await f.command(a,{action:'start'});await until(()=>a.view.room.notice.includes('超时'));
 await until(()=>b.view.room.revision===a.view.room.revision);assert.equal((await f.command(a,{action:'leave'})).ok,true);await until(()=>b.view.room.host);assert.equal((await f.command(b,{action:'reset'})).ok,true);await until(()=>b.view.room.phase==='lobby');assert.equal(b.view.room.playerCount,2);
});
test('full rooms, late joins, invalid actions and plaintext public endpoints are rejected',async t=>{
 const f=await fixture(t),a=await f.connect(),made=await f.request(a,'create',{name:'房主'});const rest=[];for(let i=0;i<11;i++){const p=await f.connect();rest.push(p);await f.request(p,'join',{room:made.session.room,name:'友'});}
 const extra=await f.connect();assert.equal((await f.request(extra,'join',{room:made.session.room,name:'满桌'})).ok,false);await until(()=>a.view.room.playerCount===12);await f.command(a,{action:'start'});assert.equal((await f.request(extra,'join',{room:made.session.room,name:'迟到'})).ok,false);
 const all=[a,...rest],seat=a.view.poker.toAct;await until(()=>all[seat].view.poker.status==='playing');const p=all[seat],before=p.view.poker.pot;assert.equal((await f.command(p,{action:'act',type:'raise',amount:-1})).ok,false);assert.equal(p.view.poker.pot,before);
 assert.throws(()=>serverUrl('http://your-domain.invalid/onefish-poker'));assert.throws(()=>serverUrl('https://name:pass@example.com'));assert.throws(()=>serverUrl('https://example.com/?token=anything'));assert.equal(serverUrl('https://your-domain.invalid/onefish-poker/'),'https://your-domain.invalid/onefish-poker');
});
test('two bundled desktop clients can create, join, play and reconnect over the same wire protocol',async t=>{
 const f=await fixture(t),a=new OnlinePoker('/unused',{persist:false,ownerKey:TEST_OWNER_KEY,ownerServer:f.url+'/onefish-poker'}),b=new OnlinePoker('/unused',{persist:false,ownerKey:TEST_OWNER_KEY,ownerServer:f.url+'/onefish-poker'});t.after(()=>{a.dispose();b.dispose();});
 await a.create({url:f.url+'/onefish-poker',name:'Mac'});await b.join({url:f.url+'/onefish-poker',name:'Windows',room:a.latest.room.code});await until(()=>a.latest.room.playerCount===2);await a.act({action:'start'});await until(()=>b.latest.poker.status==='playing');
 const actor=[a,b][a.latest.poker.toAct];await actor.act({action:'act',type:'allin'});await until(()=>a.latest.room.revision===b.latest.room.revision);
 const saved=b.preferences.session,seat=b.latest.poker.viewerSeat;b.stop();await b.open();assert.equal(b.preferences.session.token,saved.token);assert.equal(b.latest.poker.viewerSeat,seat);assert.equal(b.phase,'connected');assert.ok(!JSON.stringify(b.snapshot()).includes(saved.token));
});
test('unoccupied rooms expire and resume cannot resurrect discarded state',async()=>{
 let now=0;const rooms=await Rooms.create({ownerKey:TEST_OWNER_KEY,requireApproval:false,now:()=>now,ttlMs:100});try{const made=rooms.create('one','A',TEST_OWNER_KEY);rooms.disconnect('one');now=101;rooms.sweep();assert.equal(rooms.rooms.size,0);assert.throws(()=>rooms.resume('two',made.session),/关闭|过期/);}finally{rooms.dispose();}
});

test('host can select and remove original bots before dealing, guests cannot, and twelve-seat limit includes repeated bots',async t=>{
 const f=await fixture(t,{botDelayMs:5}),host=await f.connect(),guest=await f.connect(),made=await f.request(host,'create',{name:'房主'});await f.request(guest,'join',{room:made.session.room,name:'朋友'});await until(()=>host.view.room.playerCount===2);
 assert.equal((await f.command(guest,{action:'add-bot',botId:'altman'})).ok,false);
 for(const id of ['altman','dario','liang','jensen','altman','altman','altman','altman','altman','altman'])assert.equal((await f.command(host,{action:'add-bot',botId:id})).ok,true);
 assert.equal(host.view.room.botCount,10);assert.equal(host.view.room.playerCount,12);assert.equal((await f.command(host,{action:'add-bot',botId:'musk'})).ok,false);
 assert.equal((await f.command(host,{action:'remove-bot',botId:'liang'})).ok,true);assert.equal(host.view.room.botCount,9);assert.equal((await f.command(host,{action:'add-bot',botId:'musk'})).ok,true);
 assert.equal((await f.command(host,{action:'start'})).ok,true);assert.equal((await f.command(host,{action:'remove-bot',botId:'altman'})).ok,false);
 await until(()=>host.view.poker.status==='hand-over'||host.view.poker.toAct<2);assert.ok(host.view.poker.players.filter(p=>p.kind==='ai').every(p=>p.cards.length===0));
 for(let n=0;n<80&&host.view.poker.status==='playing';n++){
  if(host.view.poker.toAct>=2){await delay(15);continue;}
  const player=[host,guest][host.view.poker.toAct];await until(()=>player.view.room.revision===host.view.room.revision);const r=await f.command(player,{action:'act',type:'allin'});assert.equal(r.ok,true,r.error);await until(()=>host.view.room.revision>=r.state.room.revision);
 }
 await until(()=>host.view.poker.status==='hand-over');assert.equal(host.view.poker.players.reduce((sum,p)=>sum+p.stack,0),24000000);
});
test('one human can play with a bot; delayed bot actions are published to the human without polling hidden cards',async t=>{
 const f=await fixture(t,{botDelayMs:25}),host=await f.connect();await f.request(host,'create',{name:'一个人'});assert.equal((await f.command(host,{action:'add-bot',botId:'altman'})).ok,true);assert.equal((await f.command(host,{action:'start'})).ok,true);
 for(let n=0;n<40&&host.view.poker.status==='playing';n++){
  if(host.view.poker.toAct!==0){await delay(30);continue;}
  const s=host.view.poker,bot=s.players[1];assert.equal(bot.cards.length,0);const type=s.legal.check?'check':'call';const r=await f.command(host,{action:'act',type});assert.equal(r.ok,true,r.error);
 }
 await until(()=>host.view.poker.status==='hand-over');assert.ok(host.view.poker.timeline.some(e=>e.playerId==='altman'&&e.kind==='action'));assert.equal(host.view.poker.players.reduce((n,p)=>n+p.stack,0),4000000);
});

test('default server rules advertise 12 seats, 500ms bots and 20s check-or-fold policy',async t=>{
 const f=await fixture(t),response=await fetch(f.url+'/onefish-poker/health'),health=await response.json();
 assert.deepEqual(health.rules,{maxPlayers:12,botDelayMs:500,turnMs:20000,singlePlayerTurnMs:0,timeoutAction:'check-or-fold'});
 const a=await f.connect(),b=await f.connect(),made=await f.request(a,'create',{name:'A'});await f.request(b,'join',{room:made.session.room,name:'B'});await until(()=>a.view.room.playerCount===2);await f.command(a,{action:'start'});
 assert.equal(a.view.room.turnMs,20000);assert.equal(a.view.room.botDelayMs,500);assert.equal(a.view.room.maxPlayers,12);assert.equal(a.view.room.timeoutAction,'check-or-fold');
 assert.ok(a.view.room.turnDeadline-Date.now()>19500&&a.view.room.turnDeadline-Date.now()<=20000);
});
test('a human facing a free check automatically checks and advances to the flop at timeout',async t=>{
 const f=await fixture(t,{turnMs:120}),a=await f.connect(),b=await f.connect(),made=await f.request(a,'create',{name:'A'});await f.request(b,'join',{room:made.session.room,name:'B'});await until(()=>a.view.room.playerCount===2);await f.command(a,{action:'start'});await until(()=>b.view.poker.status==='playing');
 const first=[a,b][a.view.poker.toAct];assert.equal(first.view.poker.legal.call,true);assert.equal((await f.command(first,{action:'act',type:'call'})).ok,true);
 await until(()=>a.view.room.revision===b.view.room.revision);const freeSeat=a.view.poker.toAct;assert.equal([a,b][freeSeat].view.poker.legal.check,true);
 await until(()=>a.view.poker.street==='flop');assert.equal(a.view.poker.players[freeSeat].folded,false);assert.ok(a.view.room.notice.includes('自动过牌'));
});
test('disconnect and resume do not extend the original human turn deadline',async t=>{
 const f=await fixture(t,{turnMs:200}),a=await f.connect(),b=await f.connect(),made=await f.request(a,'create',{name:'A'}),joined=await f.request(b,'join',{room:made.session.room,name:'B'});await until(()=>a.view.room.playerCount===2);await f.command(a,{action:'start'});await until(()=>b.view.poker.status==='playing');
 const seat=a.view.poker.toAct,actor=[a,b][seat],session=seat===0?made.session:joined.session,deadline=actor.view.room.turnDeadline;actor.disconnect();
 const resumed=await f.connect(),result=await f.request(resumed,'resume',session);assert.equal(result.ok,true);assert.equal(result.state.room.turnDeadline,deadline);
 await until(()=>resumed.view.poker.status==='hand-over');assert.equal(resumed.view.poker.players[seat].folded,true);
});
test('a default bot waits 500ms, publishes its action, and is not subject to the human clock',async t=>{
 const f=await fixture(t),host=await f.connect();await f.request(host,'create',{name:'A'});await f.command(host,{action:'add-bot',botId:'altman'});await f.command(host,{action:'start'});
 if(host.view.poker.toAct===0)await f.command(host,{action:'act',type:host.view.poker.legal.check?'check':'call'});
 assert.equal(host.view.poker.toAct,1);const started=Date.now(),deadline=host.view.room.turnDeadline;assert.ok(deadline-started>400&&deadline-started<=500);
 const actions=()=>host.view.poker.timeline.filter(e=>e.playerId==='altman'&&e.kind==='action'&&!/^[小大]盲 /.test(e.action));await delay(200);assert.equal(actions().length,0);
 await until(()=>actions().length>0);assert.ok(actions()[0].at-started>=450);assert.equal(host.view.room.turnMs,0);assert.equal(host.view.room.multiplayerTurnMs,20000);
});

test('a late action is resolved as timeout even before the timer callback can run',async()=>{
 let now=0;const rooms=await Rooms.create({ownerKey:TEST_OWNER_KEY,requireApproval:false,now:()=>now});try{
  const made=rooms.create('A','A',TEST_OWNER_KEY);rooms.join('B',made.session.room,'B');const room=rooms.rooms.get(made.session.room);
  const command=(socket,args)=>rooms.command(socket,{id:randomUUID(),revision:room.revision,...args});command('A',{action:'start'});
  const seat=room.table.snapshot(-1).toAct,socket=room.members.find(m=>m.seat===seat).socketId;assert.equal(room.table.snapshot(seat).legal.call,true);
  now=room.turnDeadline+1;assert.throws(()=>command(socket,{action:'act',type:'call'}),/时间已到/);assert.equal(room.table.snapshot(seat).players[seat].folded,true);assert.equal(room.table.snapshot(-1).status,'hand-over');
 }finally{rooms.dispose();}
});

test('one human with bots has no timer and can act after more than twenty seconds of server time',async()=>{
 let now=0;const rooms=await Rooms.create({ownerKey:TEST_OWNER_KEY,requireApproval:false,now:()=>now,botDelayMs:100000});const random=Math.random;try{
  const made=rooms.create('solo','单人',TEST_OWNER_KEY),room=rooms.rooms.get(made.session.room);
  const command=args=>rooms.command('solo',{id:randomUUID(),revision:room.revision,...args});command({action:'add-bot',botId:'altman'});
  Math.random=()=>.6;command({action:'start'});Math.random=random;
  const seat=room.members[0].seat;
  if(room.table.snapshot(-1).toAct!==seat)room.table.act({type:'call'},room.table.snapshot(-1).toAct);
  rooms._changed(room);assert.equal(room.table.snapshot(-1).toAct,seat);assert.equal(room.turnDeadline,0);assert.equal(room.turnTimer,null);assert.equal(rooms.view(room,room.members[0]).room.turnMs,0);
  now=45000;const view=room.table.snapshot(seat);command({action:'act',type:view.legal.check?'check':'call'});assert.equal(room.table.snapshot(seat).players[seat].folded,false);
 }finally{Math.random=random;rooms.dispose();}
});
test('last other human leaving cancels an existing timer; a stale timer cannot affect the solo player',async()=>{
 let now=0;const rooms=await Rooms.create({ownerKey:TEST_OWNER_KEY,requireApproval:false,now:()=>now,botDelayMs:100000}),random=Math.random;try{
  const made=rooms.create('host','房主',TEST_OWNER_KEY),room=rooms.rooms.get(made.session.room);rooms.join('guest',made.session.room,'朋友');
  const command=(id,args)=>rooms.command(id,{id:randomUUID(),revision:room.revision,...args});command('host',{action:'add-bot',botId:'altman'});Math.random=()=>.4;command('host',{action:'start'});Math.random=random;
  assert.equal(room.table.snapshot(-1).toAct,0);assert.equal(room.turnDeadline,20000);const oldKey=room.turnKey;
  command('guest',{action:'leave'});assert.equal(rooms.view(room,room.members[0]).room.turnMs,0);assert.equal(room.turnDeadline,0);assert.equal(room.turnTimer,null);
  now=30000;assert.equal(rooms.expireTurn(room,oldKey),false);assert.equal(room.table.snapshot(0).players[0].folded,false);command('host',{action:'act',type:'call'});
 }finally{Math.random=random;rooms.dispose();}
});
