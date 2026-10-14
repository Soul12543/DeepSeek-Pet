const TEST_OWNER_KEY='private-owner-test-credential-only';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const{io}=require('socket.io-client');const{createServer}=require(process.env.ONEFISH_BUNDLE_TEST?'../server.bundle.cjs':'../server.cjs');
const{OnlinePoker}=require('../../onefish-desktop/core/online-poker.cjs');
async function fixture(t,options={}){const app=await createServer({ownerKey:TEST_OWNER_KEY,requireApproval:false,...options}),address=await app.listen(0),sockets=[];t.after(async()=>{sockets.forEach(s=>s.disconnect());await app.close();});const origin='http://127.0.0.1:'+address.port;
 const connect=async header=>{const socket=io(origin,{path:'/onefish-poker/socket.io',transports:['websocket'],auth:{protocol:1},reconnection:false,...(header?{extraHeaders:{Origin:header}}:{})});sockets.push(socket);socket.on('table',s=>socket.view=s);await new Promise((r,j)=>{socket.once('connect',r);socket.once('connect_error',j);});return socket;};
 const request=(socket,event,input)=>new Promise((r,j)=>socket.timeout(1000).emit(event,event==='create'?{...input,ownerKey:TEST_OWNER_KEY}:input,(e,v)=>e?j(e):r(v)));
 const command=(socket,args)=>request(socket,'command',{id:randomUUID(),revision:socket.view.room.revision,...args});return{app,origin,connect,request,command};}
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('network state timeout');}
test('website and browser assets at existing proxy path do not expose source or directories',async t=>{
 const f=await fixture(t);const home=await fetch(f.origin+'/onefish-poker/?room=0123456789'),html=await home.text();assert.equal(home.status,200);assert.match(home.headers.get('content-type'),/text\/html/);assert.match(html,/id="join"/);assert.match(html,/type="module" src="client.js"/);assert.match(home.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(home.headers.get('referrer-policy'),'no-referrer');
 for(const file of ['poker.css','client.js','invite.js','socket.io.min.js','avatars/altman.jpg','avatars/liang.webp','LICENSES.txt'])assert.equal((await fetch(f.origin+'/onefish-poker/'+file)).status,200,file);
 for(const file of ['server.cjs','package.json','deploy/install-certificate.py','../server.cjs','%2e%2e/server.cjs','avatars/../../rooms.cjs'])assert.equal((await fetch(f.origin+'/onefish-poker/'+file)).status,404,file);
 const head=await fetch(f.origin+'/onefish-poker/client.js',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal((await fetch(f.origin+'/onefish-poker/',{method:'POST'})).status,405);
 const redirect=await fetch(f.origin+'/onefish-poker?room=0123456789',{redirect:'manual'});assert.equal(redirect.headers.get('location'),'/onefish-poker/?room=0123456789');
});
test('same-origin browser and unchanged native desktop clients play and resume together',async t=>{
 const f=await fixture(t),desktop=new OnlinePoker('unused',{persist:false,ownerKey:TEST_OWNER_KEY,ownerServer:f.origin+'/onefish-poker'});t.after(()=>desktop.dispose());const made=await desktop.create({url:f.origin+'/onefish-poker',name:'本体房主'}),browser=await f.connect(f.origin);
 const joined=await f.request(browser,'join',{room:made.room.code,name:'网页朋友'});assert.equal(joined.ok,true);await until(()=>desktop.latest.room.playerCount===2);await desktop.act({action:'start'});await until(()=>browser.view.poker.status==='playing');
 assert.equal(browser.view.poker.players[1].cards.length,2);assert.equal(browser.view.poker.players[0].cards.length,0);assert.equal(desktop.latest.poker.players[0].cards.length,2);assert.equal(desktop.latest.poker.players[1].cards.length,0);assert.ok(!JSON.stringify(browser.view).includes(joined.session.token));
 const before=browser.view.poker.players[1].cards,deadline=browser.view.room.turnDeadline;browser.disconnect();const reloaded=await f.connect(f.origin),result=await f.request(reloaded,'resume',joined.session);assert.equal(result.ok,true);assert.deepEqual(result.state.poker.players[1].cards,before);assert.equal(result.state.room.turnDeadline,deadline);assert.equal(result.state.room.playerCount,2);
 for(let n=0;n<20&&desktop.latest.poker.status==='playing';n++){await until(()=>reloaded.view.room.revision===desktop.latest.room.revision);if(desktop.latest.poker.toAct===0)await desktop.act({action:'act',type:'allin'});else assert.equal((await f.command(reloaded,{action:'act',type:'allin'})).ok,true);await until(()=>reloaded.view.room.revision===desktop.latest.room.revision);}
 assert.equal(desktop.latest.poker.status,'hand-over');assert.ok(reloaded.view.poker.results[0].players[0].detail);assert.equal(reloaded.view.poker.players.reduce((n,p)=>n+p.stack,0),4000000);
});
test('foreign and null origins rejected, configured HTTPS origin and native clients accepted',async t=>{
 const f=await fixture(t,{publicOrigin:'https://your-domain.invalid'});await f.connect('https://your-domain.invalid');await f.connect();
 for(const origin of ['https://unrelated.example','null','https://your-domain.invalid.evil.example','http://your-domain.invalid',f.origin])await assert.rejects(f.connect(origin));
});
test('invite generation accepts legacy desktop text and links, never includes seat secrets',async()=>{
 const{parseRoom,roomLink}=await import('../web/invite.js');const code='A012B345C6',base='https://your-domain.invalid/onefish-poker/?token=secret#hidden';
 assert.equal(parseRoom('大肥鱼朋友牌桌\n服务器：https://your-domain.invalid/onefish-poker\n房间码：'+code),code);assert.equal(parseRoom('a012b345c6'),code);assert.equal(parseRoom('https://your-domain.invalid/onefish-poker/?room='+code+'&token=secret'),code);
 assert.equal(roomLink(code,base),'https://your-domain.invalid/onefish-poker/?room='+code);for(const bad of ['',code+'0','javascript:alert(1)','<script>'+code+'</script>'])assert.equal(parseRoom(bad),'');assert.throws(()=>roomLink('wrong',base));
});
