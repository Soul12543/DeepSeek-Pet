'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const DEFAULT_SERVER='';
function serverUrl(value){
 let url;try{url=new URL(String(value||'').trim());}catch{throw new Error('请填写正确的服务器地址');}
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))throw new Error('公网牌桌需要 HTTPS 地址');
 if(url.username||url.password||url.search||url.hash||!/^\/[A-Za-z0-9/_-]*$/.test(url.pathname))throw new Error('服务器地址不能包含账号、密码或额外参数');
 return url.origin+url.pathname.replace(/\/$/,'');
}
function invitedRoom(value){const text=String(value||'').trim();if(/^[a-f0-9]{10}$/i.test(text))return text.toUpperCase();try{const url=new URL(text);const room=url.searchParams.get('room');if(['http:','https:'].includes(url.protocol)&&/^[a-f0-9]{10}$/i.test(room||''))return room.toUpperCase();}catch{}throw new Error('请输入有效的邀请链接或房间码');}
function invitationUrl(server,code){
 if(!/^[a-f0-9]{10}$/i.test(String(code||'')))throw new Error('请先创建或加入房间');
 const url=new URL(serverUrl(server)+'/');url.searchParams.set('room',String(code).toUpperCase());return url.href;
}
function invitedServer(value){try{const u=new URL(String(value||'').trim());if(!/^[a-f0-9]{10}$/i.test(u.searchParams.get('room')||''))return '';u.search='';u.hash='';return serverUrl(u.href);}catch{return '';}}
class OnlinePoker{
 constructor(root,{onChange=()=>{},ioFactory=require('../vendor/socket.io-client/client.cjs').io,persist=true}={}){
  Object.assign(this,{root,onChange,ioFactory,persist});this.socket=null;this.opening=null;this.latest=null;this.phase='offline';this.error='';this.timeOffset=0;
  this.preferences={url:DEFAULT_SERVER,name:'朋友',mode:'local',session:null};if(persist)try{const old=JSON.parse(fs.readFileSync(this.file(),'utf8'));this.preferences={...this.preferences,...old,url:old.url?serverUrl(old.url):'',name:Array.from(String(old.name||'朋友')).slice(0,20).join(''),mode:old.mode==='online'?'online':'local'};}catch{}
 }
 file(){return path.join(this.root,'games/online-poker.json');}
 save(){if(!this.persist)return;fs.mkdirSync(path.dirname(this.file()),{recursive:true});const tmp=this.file()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.preferences,null,2),{mode:0o600});fs.renameSync(tmp,this.file());}
 snapshot(){return{canCreate:true,mode:this.preferences.mode,url:this.preferences.url,name:this.preferences.name,phase:this.phase,error:this.error,room:this.latest?.room||null,timeOffset:this.timeOffset};}
 notify(){this.onChange(this.snapshot());}
 configure({url,name}={}){const value=serverUrl(url||this.preferences.url);if(this.preferences.session&&value!==this.preferences.url)throw new Error('请先离开房间再更换服务器');if(value!==this.preferences.url){this.stop();this.preferences.url=value;}if(name!==undefined)this.preferences.name=Array.from(String(name).trim()).slice(0,20).join('')||'朋友';this.save();}
 async setMode(mode){if(!['local','online'].includes(mode))throw new Error('没有这个牌桌模式');if(mode==='local'&&this.preferences.session)throw new Error('请先离开朋友房间');this.preferences.mode=mode;this.save();this.notify();if(mode==='online'&&this.preferences.session)await this.open();}
 _state(value){if(!value?.room||!value?.poker)return;if(value.room.admission==='rejected'){this.preferences.session=null;this.latest=null;this.error=value.room.notice||'入桌申请未通过';this.save();this.notify();return;}this.latest=value;this.timeOffset=Number(value.room.serverTime)-Date.now();this.notify();}
 request(event,data){return new Promise((resolve,reject)=>{
  const socket=this.socket;if(!socket?.connected){reject(new Error('连接已断开，恢复后再出牌'));return;}
  socket.timeout(8000).emit(event,data,(err,result)=>{if(err){reject(new Error('服务器未确认这次操作，请查看最新牌桌后再操作'));return;}if(!result?.ok){reject(new Error(result?.error||'操作失败'));return;}resolve(result);});
 });}
 async open(){
  if(this.socket?.connected&&this.phase==='connected')return;
  if(this.opening)return this.opening;this.stop();this.phase='connecting';this.error='';this.notify();
  const url=new URL(this.preferences.url),socket=this.ioFactory(url.origin,{path:url.pathname.replace(/\/$/,'')+'/socket.io',transports:['websocket'],auth:{protocol:1},autoConnect:false,reconnection:true,reconnectionDelay:1000,reconnectionDelayMax:5000,timeout:8000});this.socket=socket;
  this.opening=new Promise((resolve,reject)=>{
   let settled=false;const timer=setTimeout(()=>{if(!settled){settled=true;this.opening=null;reject(new Error('暂时连接不上牌桌服务器，请检查地址或网络'));}},9000);timer.unref?.();
   socket.on('table',value=>{if(this.socket===socket)this._state(value);});
   socket.on('connect',async()=>{if(this.socket!==socket)return;try{
    if(this.preferences.session){const result=await this.request('resume',this.preferences.session);if(this.socket!==socket)return;this._state(result.state);}
    this.phase='connected';this.error='';this.notify();if(!settled){settled=true;clearTimeout(timer);this.opening=null;resolve();}
   }catch(e){if(this.socket!==socket)return;this.preferences.session=null;this.latest=null;this.phase='connected';this.error=e.message;this.save();this.notify();if(!settled){settled=true;clearTimeout(timer);this.opening=null;resolve();}}});
   socket.on('disconnect',reason=>{if(this.socket!==socket)return;this.phase='reconnecting';this.error=reason==='io server disconnect'?'这个座位已在另一处连接，请重新加入':'连接中断，正在恢复原座位';this.notify();});
   socket.on('connect_error',err=>{if(this.socket!==socket)return;this.phase='reconnecting';this.error='连接不上牌桌服务器：'+err.message;this.notify();});
   socket.connect();
  });return this.opening;
 }
 async create(input={}){this.configure(input);if(this.preferences.session)throw new Error('请先离开当前房间');this.preferences.mode='online';await this.open();const result=await this.request('create',{name:this.preferences.name,});this.preferences.session=result.session;this.save();this._state(result.state);return result.state;}
 async join(input={}){const invite=invitedServer(input.room);this.configure({...input,url:invite||input.url});if(this.preferences.session)throw new Error('请先离开当前房间');this.preferences.mode='online';await this.open();const result=await this.request('join',{room:invitedRoom(input.room),name:this.preferences.name});this.preferences.session=result.session;this.save();this._state(result.state);return result.state;}
 async act(input){
  if(this.phase!=='connected'||!this.latest?.room)throw new Error('请等待房间连接恢复');
  const result=await this.request('command',{id:randomUUID(),revision:this.latest.room.revision,action:input.action,type:input.type,amount:input.amount,botId:input.botId,memberId:input.memberId,config:input.action==='add-api-bot'?input.config:undefined});
  if(result.left){this.preferences.session=null;this.latest=null;this.save();this.notify();}else this._state(result.state);
 }
 invitationUrl(){return invitationUrl(this.preferences.url,this.latest?.room?.code);}
 async leave(){await this.act({action:'leave'});}
 forget(){if(this.phase==='connected'&&this.preferences.session)throw new Error('在线时请先离开房间');this.preferences.session=null;this.latest=null;this.stop();this.save();this.notify();}
 stop(){const socket=this.socket;this.socket=null;this.opening=null;socket?.disconnect();this.phase='offline';}
 dispose(){this.stop();}
}
module.exports={OnlinePoker,serverUrl,invitationUrl,invitedRoom,DEFAULT_SERVER};
