'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {Server}=require('socket.io');const{Rooms}=require('./rooms.cjs');const{RULES}=require('../onefish-desktop/core/poker-rules.cjs');
const VERSION='0.10.1';
async function createServer({basePath='/onefish-poker',publicOrigin='',requireApproval=true,turnMs=RULES.turnMs,botDelayMs=RULES.botDelayMs,engineRoot,maxRooms=100}={}){
 if(!/^\/[a-z0-9/-]*$/i.test(basePath))throw new Error('无效服务路径');basePath=basePath.replace(/\/$/,'');
 let allowedOrigin='';
 if(publicOrigin){const origin=new URL(publicOrigin);if(!['http:','https:'].includes(origin.protocol)||origin.origin!==publicOrigin)throw new Error('PUBLIC_ORIGIN 必须是完整的 http(s) 来源，不含路径');allowedOrigin=origin.origin;}
 const webRoot=path.join(__dirname,'web'),assets=new Map();
 for(const[name,type]of [['index.html','text/html; charset=utf-8'],['poker.css','text/css; charset=utf-8'],['client.js','text/javascript; charset=utf-8'],['stable-controls.js','text/javascript; charset=utf-8'],['invite.js','text/javascript; charset=utf-8'],['socket.io.min.js','text/javascript; charset=utf-8'],['LICENSES.txt','text/plain; charset=utf-8'],...['altman.jpg','dario.jpg','musk.jpg','jensen.jpg','liang.webp'].map(n=>['avatars/'+n,n.endsWith('.webp')?'image/webp':'image/jpeg'])]){
  assets.set(name,{type,body:fs.readFileSync(path.join(webRoot,name))});
 }
 const server=http.createServer((req,res)=>{
  const headers={'x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','cache-control':'no-cache','x-robots-tag':'noindex, nofollow','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' "+(allowedOrigin?allowedOrigin.replace(/^http/,'ws'):'')+"; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
  const send=(status,body,type='text/plain; charset=utf-8')=>{res.writeHead(status,{...headers,'content-type':type});res.end(req.method==='HEAD'?undefined:body);};
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('allow','GET, HEAD');send(405,'Method not allowed');return;}
  let pathname;try{pathname=new URL(req.url,'http://localhost').pathname;}catch{send(400,'Bad request');return;}
  if(pathname===basePath+'/health'){headers['cache-control']='no-store';send(200,JSON.stringify({ok:true,service:'onefish-poker',version:VERSION,protocol:1,rules:RULES,web:true}),'application/json; charset=utf-8');return;}
  if(pathname===basePath){res.writeHead(302,{...headers,location:basePath+'/'+(req.url.includes('?')?'?'+req.url.split('?').slice(1).join('?'):'')});res.end();return;}
  const name=pathname===basePath+'/'?'index.html':pathname.startsWith(basePath+'/')?pathname.slice(basePath.length+1):'';
  const asset=assets.get(name);if(asset){send(200,asset.body,asset.type);return;}send(404,'Not found');
 });
 // WebSocket handshakes are not protected by browser CORS. Only our web origin
 // and native clients without an Origin header may connect.
 const io=new Server(server,{path:basePath+'/socket.io',serveClient:false,maxHttpBufferSize:8192,transports:['websocket'],allowRequest:(req,cb)=>cb(null,!req.headers.origin||req.headers.origin===allowedOrigin)});
 const rooms=await Rooms.create({engineRoot,requireApproval,turnMs,botDelayMs,maxRooms,publish:(id,state)=>io.sockets.sockets.get(id)?.emit('table',state)});
 const connections=new Map();
 io.use((socket,next)=>{if(socket.handshake.auth?.protocol!==1)return next(new Error('客户端连接版本不兼容'));const ip=socket.handshake.address;let set=connections.get(ip);if(!set){set=new Set();connections.set(ip,set);}if(set.size>=64)return next(new Error('连接过多，请稍后再试'));set.add(socket.id);socket.data.ip=ip;next();});
 io.on('connection',socket=>{
  let windowAt=Date.now(),count=0;
  const wrap=(name,fn)=>socket.on(name,(data,ack)=>{if(typeof ack!=='function')return;try{
   if(Date.now()-windowAt>10000){windowAt=Date.now();count=0;}if(++count>40)throw new Error('操作过于频繁，请稍后再试');
   const result=fn(data);if(result.previousSocket&&result.previousSocket!==socket.id)io.sockets.sockets.get(result.previousSocket)?.disconnect(true);
   delete result.previousSocket;ack({ok:true,...result});
  }catch(e){ack({ok:false,error:e.message||'操作失败'});}});
  wrap('create',data=>rooms.create(socket.id,data?.name));wrap('join',data=>rooms.join(socket.id,data?.room,data?.name));wrap('resume',data=>rooms.resume(socket.id,data));wrap('command',data=>rooms.command(socket.id,data));
  socket.on('disconnect',()=>{rooms.disconnect(socket.id);const set=connections.get(socket.data.ip);set?.delete(socket.id);if(!set?.size)connections.delete(socket.data.ip);});
 });
 const close=async()=>{rooms.dispose();await new Promise(r=>io.close(r));};
 return{server,io,rooms,close,listen:(port=3078,host='127.0.0.1')=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.removeListener('error',reject);const address=server.address();if(!publicOrigin)allowedOrigin='http://'+(host.includes(':')?'['+host+']':host)+':'+address.port;resolve(address);});})};
}
if(require.main===module)createServer({basePath:process.env.BASE_PATH||'/onefish-poker',publicOrigin:process.env.PUBLIC_ORIGIN||'',turnMs:Math.max(10000,Math.min(120000,Number(process.env.TURN_MS)||RULES.turnMs)),botDelayMs:Math.max(0,Math.min(10000,Number(process.env.BOT_DELAY_MS)||RULES.botDelayMs)),engineRoot:process.env.ENGINE_ROOT,maxRooms:Number(process.env.MAX_ROOMS)||100}).then(async app=>{
 const address=await app.listen(Number(process.env.PORT)||3078,process.env.HOST||'127.0.0.1');console.log('OneFish poker '+VERSION+' listening on '+address.address+':'+address.port);
 for(const event of ['SIGINT','SIGTERM'])process.once(event,()=>app.close().then(()=>process.exit(0)));
}).catch(e=>{console.error(e.message);process.exit(1);});
module.exports={createServer};
