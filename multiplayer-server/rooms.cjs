'use strict';
const {randomBytes,randomUUID,timingSafeEqual}=require('node:crypto');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const {normalizeConfig,requestAction}=require('../onefish-desktop/core/ai-poker.cjs');
const {RULES,turnKey,timeoutActionFor}=require('../onefish-desktop/core/poker-rules.cjs');
const cleanName=value=>Array.from(String(value||'').replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,20).join('')||'朋友';
const roomCode=value=>String(value||'').trim().toUpperCase();
const secret=()=>randomBytes(32).toString('base64url');
const tokenMatches=(a,b)=>typeof a==='string'&&typeof b==='string'&&/^[A-Za-z0-9_-]{43}$/.test(b)&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const emptyLegal=()=>({fold:false,check:false,call:false,callAmount:0,raise:false,minRaiseTo:0,maxRaiseTo:0,toCall:0});
class Rooms{
 static async create(options={}){
  const root=options.engineRoot||path.join(__dirname,'../onefish-desktop');
  const [{createTable,BOTS},{createPokerView},{prepareFavoredDeck}]=await Promise.all([import(pathToFileURL(path.join(root,'vendor/holdem/engine.mjs'))),import(pathToFileURL(path.join(root,'core/poker-analysis.mjs'))),import(pathToFileURL(path.join(root,'core/practice-deal.mjs')))]);
  return new Rooms({...options,createTable,createPokerView,prepareFavoredDeck,botSpecs:BOTS});
 }
 constructor({createTable,createPokerView,prepareFavoredDeck,aiRequest=requestAction,requireApproval=true,botSpecs=[],botDelayMs=RULES.botDelayMs,publish=()=>{},turnMs=RULES.turnMs,ttlMs=1800000,maxRooms=100,now=Date.now}={}){
  Object.assign(this,{createTable,createPokerView,prepareFavoredDeck,aiRequest,botSpecs,botDelayMs,publish,turnMs,ttlMs,maxRooms,now});this.requireApproval=requireApproval;this.rooms=new Map();this.bindings=new Map();
  this.gc=setInterval(()=>this.sweep(),30000);this.gc.unref();
 }
 _member(socketId){const b=this.bindings.get(socketId),room=b&&this.rooms.get(b.room),member=room?.members.find(m=>m.id===b.member);if(!room||!member||member.left||member.socketId!==socketId)throw new Error('请先创建或加入房间');return{room,member};}
 _newMember(socketId,name){return{id:randomUUID(),name:cleanName(name),token:secret(),socketId,left:false,approved:false,rejected:false,seat:null,seen:new Map(),view:this.createPokerView()};}
 _bind(room,member,socketId){const old=member.socketId;if(old&&old!==socketId)this.bindings.delete(old);member.socketId=socketId;this.bindings.set(socketId,{room:room.code,member:member.id});return old;}
 _requireFree(socketId){if(this.bindings.has(socketId))throw new Error('请先离开当前房间');}
 create(socketId,name){
  this._requireFree(socketId);this.sweep();if(this.rooms.size>=this.maxRooms)throw new Error('房间已满，请稍后重试');
  let code;do{code=randomBytes(5).toString('hex').toUpperCase();}while(this.rooms.has(code));
  const member=this._newMember(socketId,name),room={code,members:[member],bots:[],apiConfigs:new Map(),practicePending:null,practiceApplied:false,host:member.id,table:null,revision:0,updatedAt:this.now(),notice:'等朋友加入后，房主可以开局',turnTimer:null,turnKey:null,turnDeadline:0};
  member.approved=true;this.rooms.set(code,room);this._bind(room,member,socketId);this._changed(room);
  return{session:{room:code,token:member.token},state:this.view(room,member)};
 }
 join(socketId,code,name){
  this._requireFree(socketId);const room=this.rooms.get(roomCode(code));if(!room)throw new Error('房间不存在或已过期');
  if(room.table)throw new Error('这个房间已经开局，请让房主重新开桌后加入');
  if(room.members.filter(m=>!m.left&&m.approved).length+room.bots.length>=RULES.maxPlayers)throw new Error('房间已满，最多 12 席');
  if(room.members.filter(m=>!m.left&&!m.approved).length>=12)throw new Error('待确认申请过多，请稍后再试');
  const member=this._newMember(socketId,name);member.approved=!this.requireApproval;room.members.push(member);room.practicePending=null;this._bind(room,member,socketId);this._changed(room);
  return{session:{room:room.code,token:member.token},state:this.view(room,member)};
 }
 resume(socketId,session){
  this._requireFree(socketId);const room=this.rooms.get(roomCode(session?.room));if(!room)throw new Error('房间已经关闭或过期');
  const member=room.members.find(m=>!m.left&&tokenMatches(m.token,session?.token));if(!member)throw new Error('无法恢复这个座位，请重新加入');
  const previousSocket=this._bind(room,member,socketId);this._changed(room);
  return{session:{room:room.code,token:member.token},state:this.view(room,member),previousSocket};
 }
 disconnect(socketId){const binding=this.bindings.get(socketId);if(!binding)return;this.bindings.delete(socketId);const room=this.rooms.get(binding.room),member=room?.members.find(m=>m.id===binding.member);if(member?.socketId===socketId){member.socketId=null;this._changed(room);}}
 command(socketId,input){
  const{room,member}=this._member(socketId);if(!input||typeof input!=='object'||typeof input.id!=='string'||input.id.length>80||input.id.length<8)throw new Error('操作标识无效');
  if(!member.approved&&input.action!=='leave')throw new Error('请等待房主确认，尚未获得入桌权限');
  if(member.seen.has(input.id))return{state:this.view(room,member),duplicate:true};
  if(input.action==='act'&&room.table?.snapshot(-1).toAct===member.seat&&room.turnDeadline&&this.now()>=room.turnDeadline){this.expireTurn(room,room.turnKey);throw new Error('出牌时间已到，请查看最新牌桌');}
  if(input.revision!==room.revision)throw new Error('牌桌已更新，请根据当前牌桌再操作');
  if(input.action==='leave'){
   member.left=true;member.socketId=null;this.bindings.delete(socketId);if(member.approved&&member.seat!==null)room.table?.leaveSeat(member.seat);
   if(room.host===member.id)room.host=room.members.find(m=>!m.left&&m.approved&&m.socketId)?.id||room.members.find(m=>!m.left&&m.approved)?.id||null;
   if(!room.host){for(const pending of room.members)if(!pending.left&&pending.socketId){pending.rejected=true;this.publish(pending.socketId,this.view(room,pending));this.bindings.delete(pending.socketId);pending.socketId=null;pending.left=true;}room.table?.dispose();room.apiConfigs.clear();clearTimeout(room.turnTimer);this.rooms.delete(room.code);}else this._changed(room);return{left:true};
  }
  if(['start','next','reset','add-bot','add-api-bot','remove-bot','approve','reject','practice-next'].includes(input.action)){
   if(room.host!==member.id)throw new Error('只有房主可以开局或重新开桌');
   if(input.action==='practice-next'){
    if(!this.practiceAllowed(room))throw new Error('astra 仅限一位真人与机器人练习，含待确认或断线真人时不可使用');
    if(room.table?.snapshot(-1).gameOver)throw new Error('请先重新开桌');
    room.practicePending=room.practicePending?null:member.id;room.notice=room.practicePending?'astra 练习：下一手为你安排优势牌型，生效一次':'已取消 astra 练习设置';
   }else if(input.action==='approve'||input.action==='reject'){
    if(room.table)throw new Error('请在开局前处理入桌申请');
    const guest=room.members.find(m=>m.id===input.memberId&&!m.left&&!m.approved);if(!guest)throw new Error('这条申请已处理或已取消');
    if(input.action==='approve'){
     if(room.members.filter(m=>!m.left&&m.approved).length+room.bots.length>=RULES.maxPlayers)throw new Error('牌桌已满，请先移除机器人');
     guest.approved=true;room.notice='已确认 '+guest.name+' 入桌';
    }else{
     guest.rejected=true;guest.left=true;const id=guest.socketId;guest.socketId=null;if(id){this.bindings.delete(id);this.publish(id,this.view(room,guest));}room.notice='已拒绝入桌申请';
    }
   }else if(['add-bot','add-api-bot','remove-bot'].includes(input.action)){
    if(room.table)throw new Error('请在开局前调整机器人');
    if(input.action==='add-api-bot'){
     if(room.members.filter(m=>!m.left&&m.approved).length+room.bots.length>=RULES.maxPlayers)throw new Error('牌桌已经坐满');
     const config=normalizeConfig(input.config,{publicOnly:true}),id='api-'+randomUUID();
     room.apiConfigs.set(id,config);room.bots.push({id,name:config.name,kind:'ai',apiBot:true,avatarId:'altman',company:'API AI'});room.notice='已添加 API AI '+config.name;
    }else if(input.action==='add-bot'){
     if(room.members.filter(m=>!m.left&&m.approved).length+room.bots.length>=RULES.maxPlayers)throw new Error('牌桌已经坐满');
     const spec=this.botSpecs.find(b=>b.id===input.botId);if(!spec)throw new Error('请选择机器人');
     let copy=1,id=spec.id;while(room.bots.some(b=>b.id===id)){copy++;id=spec.id+'-'+copy;}
     const bot={...spec,id,avatarId:spec.id,kind:'ai',name:spec.name+(copy>1?' · '+copy:'')};room.bots.push(bot);room.notice='已添加机器人 '+bot.name;
    }else{
     const index=room.bots.findIndex(b=>b.id===input.botId);if(index<0)throw new Error('没有这个机器人');room.apiConfigs.delete(input.botId);room.bots.splice(index,1);room.notice='机器人已移除';
    }
   }else if(input.action==='reset'){
    room.table?.dispose();room.table=null;room.practicePending=null;room.practiceApplied=false;room.members=room.members.filter(m=>!m.left);for(const m of room.members){m.seat=null;m.view=this.createPokerView();}room.notice='牌桌已重新打开，可以邀请朋友加入';
   }else if(input.action==='start'){
    if(room.table)throw new Error('牌桌已经开局');const active=room.members.filter(m=>!m.left&&m.approved);
    if(room.members.some(m=>!m.left&&!m.approved&&m.socketId))throw new Error('请先确认或拒绝待处理的入桌申请');
    if(active.length+room.bots.length<2||active.some(m=>!m.socketId))throw new Error('至少两席，且真人都在线后才能开局');
    active.forEach((m,i)=>m.seat=i);
    room.table=this.createTable({get:()=>undefined,timeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return()=>clearTimeout(t);}},{registerEffect:false,actionDelayMs:this.botDelayMs,onChange:()=>{if(room.table){room.notice='';this._changed(room);}},players:(member.approved?active:[]).map(m=>({id:m.id,name:m.name,emoji:'♠',tag:'朋友',kind:'human'})).concat(room.bots),avatarDir:path.join(__dirname,'empty-avatars'),aiAgent:(id,args)=>this.aiRequest(room.apiConfigs.get(id),args,{publicOnly:true}),practiceDeck:(deck,seats)=>{
     room.practiceApplied=false;const targetId=room.practicePending;room.practicePending=null;
     if(!targetId||!this.practiceAllowed(room))return null;const target=room.members.find(m=>m.id===targetId&&!m.left&&m.approved);
     if(!target||!seats.includes(target.seat))return null;const next=this.prepareFavoredDeck(deck,seats,target.seat);room.practiceApplied=true;return next;
    }});
    room.table.start();room.notice='对局开始';
   }else{
    if(!room.table||room.table.snapshot().status!=='hand-over')throw new Error('当前不能发下一手');room.table.nextHand();room.notice='新的一手';
   }
  }else if(input.action==='act'){
   if(!room.table)throw new Error('请等待房主开局');const view=room.table.snapshot(member.seat);
   if(view.status!=='playing'||view.toAct!==member.seat)throw new Error('还没有轮到你');
   room.table.act({type:input.type,amount:input.amount},member.seat);room.notice='';
  }else throw new Error('不支持的房间操作');
  member.seen.set(input.id,true);if(member.seen.size>64)member.seen.delete(member.seen.keys().next().value);this._changed(room);
  return{state:this.view(room,member)};
 }
 practiceAllowed(room){return room.members.filter(m=>!m.left).length===1&&room.members.some(m=>!m.left&&m.approved)&&room.bots.length>0;}
 humanTurnMs(room){return room.members.filter(m=>!m.left&&m.approved).length<2?RULES.singlePlayerTurnMs:this.turnMs;}
 _arm(room){
  const table=room.table?.snapshot(-1),baseKey=turnKey(table),humanMs=this.humanTurnMs(room),key=baseKey?baseKey+':'+humanMs:null;
  if(key===room.turnKey)return;clearTimeout(room.turnTimer);room.turnTimer=null;room.turnKey=key;room.turnDeadline=0;
  if(!key)return;
  if(table.players.find(p=>p.seat===table.toAct)?.kind==='ai'){room.turnDeadline=table.thinkEndsAt;return;}
  if(humanMs<=0)return;room.turnDeadline=this.now()+humanMs;
  room.turnTimer=setTimeout(()=>this.expireTurn(room,key),humanMs);room.turnTimer.unref();
 }
 expireTurn(room,key){
  if(!this.rooms.has(room.code)||room.turnKey!==key||this.humanTurnMs(room)<=0)return false;
  const current=room.table?.snapshot(-1),actor=room.members.find(m=>m.seat===current?.toAct);
  if(current?.status!=='playing'||!actor)return false;
  const type=timeoutActionFor(room.table.snapshot(current.toAct).legal);room.table.act({type},current.toAct);
  room.notice=(actor.name||'玩家')+' 出牌超时，已自动'+(type==='check'?'过牌':'弃牌');this._changed(room);return true;
 }
 _changed(room){if(!this.practiceAllowed(room))room.practicePending=null;room.revision++;room.updatedAt=this.now();this._arm(room);for(const member of room.members)if(!member.left&&member.socketId)this.publish(member.socketId,this.view(room,member));}
 view(room,member){
  const active=room.members.filter(m=>!m.left&&m.approved),seat=member.approved?(room.table?member.seat:active.indexOf(member)):-1,hostMember=room.members.find(m=>m.id===room.host);
  let poker;if(room.table&&member.approved)poker=member.view(room.table.snapshot(seat));else poker={status:'idle',viewerSeat:seat,handNo:0,street:'preflop',dealer:null,sb:10000,bb:20000,pot:0,lastPot:0,board:[],toAct:null,currentBet:0,minRaise:20000,winners:[],revealed:false,gameOver:false,legal:emptyLegal(),log:[],analysis:{current:null,target:null,message:'开局后显示你的牌型和补牌方向'},results:[],players:(member.approved?active:[]).map(m=>({...m,kind:'human'})).concat(member.approved?room.bots:[]).map((m,i)=>({id:m.id,name:m.name,kind:m.kind,apiBot:!!m.apiBot,apiStatus:'',avatarId:m.avatarId||m.id,seat:i,stack:2000000,bet:0,committed:0,cards:[],hasCards:false,out:false,folded:false,isDealer:false,isToAct:false,talk:''}))};
  poker.players=poker.players.map(p=>{const m=room.members.find(m=>m.id===p.id);return{...p,connected:p.kind==='ai'||!!m?.socketId,host:m?.id===room.host};});
  return{room:{practice:{allowed:member.approved&&room.host===member.id&&this.practiceAllowed(room),pending:member.approved&&!!room.practicePending,applied:member.approved&&room.practiceApplied},code:room.code,revision:room.revision,host:member.approved&&room.host===member.id,admission:member.rejected?'rejected':member.approved?'approved':'pending',private:true,pendingRequests:member.approved&&room.host===member.id?room.members.filter(m=>!m.left&&!m.approved&&m.socketId).map(m=>({id:m.id,name:m.name})):[],hostName:hostMember?.name||'',phase:room.table?'playing':'lobby',playerCount:member.approved?active.length+room.bots.length:0,humanCount:member.approved?active.length:0,botCount:member.approved?room.bots.length:0,bots:(member.approved?room.bots:[]).map(b=>({id:b.id,name:b.name,apiBot:!!b.apiBot})),availableBots:(member.approved?this.botSpecs:[]).map(b=>({id:b.id,name:b.name})),maxPlayers:RULES.maxPlayers,turnMs:this.humanTurnMs(room),multiplayerTurnMs:this.turnMs,botDelayMs:this.botDelayMs,timeoutAction:RULES.timeoutAction,turnDeadline:member.approved?room.turnDeadline:0,notice:member.rejected?'入桌申请未通过，尚未获得游戏权限':!member.approved?'等待房主核对并确认入桌':room.notice,serverTime:this.now()},poker};
 }
 sweep(){const now=this.now();for(const[code,room]of this.rooms)if(room.members.every(m=>!m.socketId)&&now-room.updatedAt>this.ttlMs){room.table?.dispose();room.apiConfigs.clear();clearTimeout(room.turnTimer);this.rooms.delete(code);}}
 dispose(){clearInterval(this.gc);for(const room of this.rooms.values()){clearTimeout(room.turnTimer);room.table?.dispose();room.apiConfigs.clear();}this.rooms.clear();this.bindings.clear();}
}
module.exports={Rooms,cleanName};
