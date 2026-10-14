import {parseRoom,roomLink} from './invite.js';
const controls=window.OneFishControls;
const $=id=>document.getElementById(id),fmt=n=>Number(n||0).toLocaleString('zh-CN');
const basePath=location.pathname.replace(/\/$/,''),baseUrl=location.origin+basePath+'/';
const initialRoomValue=new URL(location.href).searchParams.get('room');
let requestedRoom=parseRoom(initialRoomValue),inviteEntry=initialRoomValue!==null;
let state=null,session=null,ready=false,busy=false,timeOffset=0,toastTimer=null,renderedHand=null,renderedStatus=null;
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function card(c,back=false){const n=el('span',c?({14:'A',13:'K',12:'Q',11:'J'}[c.r]||c.r)+({s:'♠',h:'♥',d:'♦',c:'♣'}[c.s]||''):'','card'+(back?' back':!c?' empty':''));if(c&&['h','d'].includes(c.s))n.classList.add('red');return n;}
function stored(key){try{return sessionStorage.getItem(key);}catch{return null;}}
function forgetSession(){if(session)try{sessionStorage.removeItem('onefish-poker-session:'+session.room);}catch{}session=null;}
function remember(value){session=value;try{sessionStorage.setItem('onefish-poker-session:'+value.room,JSON.stringify(value));}catch{toast('浏览器未允许保存座位，刷新后可能无法恢复');}history.replaceState(null,'',roomLink(value.room,baseUrl));}
if(requestedRoom){$('room-code').value=requestedRoom;$('join-hint').textContent='房间 '+requestedRoom+' · 填写昵称后即可加入';try{const saved=JSON.parse(stored('onefish-poker-session:'+requestedRoom)||'null');if(saved?.room===requestedRoom&&/^[A-Za-z0-9_-]{43}$/.test(saved.token))session=saved;}catch{}}
try{$('nickname').value=localStorage.getItem('onefish-poker-name')||'';}catch{}
function configureEntry(message=''){
 $('manual-room-fields').hidden=inviteEntry;$('room-code').disabled=inviteEntry;
 $('invite-builder').hidden=inviteEntry;
 $('entry-title').textContent=inviteEntry&&!requestedRoom?'分享链接无效':inviteEntry?'加入朋友的牌桌':'创建或加入朋友的牌桌';
 $('join-hint').textContent=message||(inviteEntry?requestedRoom?'填写昵称申请入桌，房主确认后才能进入牌局。':'链接中的房间码无效，请让朋友重新复制分享链接。':'这是私人牌桌，请使用房主发来的邀请链接。');
 $('create').hidden=inviteEntry;$('entry-form').hidden=false;
}
configureEntry();
function showError(message){$('error').textContent=message;$('error').hidden=false;}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3000);}
const socket=window.io(location.origin,{path:basePath+'/socket.io',transports:['websocket'],auth:{protocol:1},autoConnect:false,reconnection:true,reconnectionDelay:1000,reconnectionDelayMax:5000,timeout:10000});
function request(event,data){if(!socket.connected)return Promise.reject(new Error('连接已断开，请等待重新连接后操作'));return new Promise((resolve,reject)=>socket.timeout(8000).emit(event,data,(err,result)=>{if(err)return reject(new Error('未收到服务器确认，请查看最新牌桌后再操作'));if(!result?.ok){const e=new Error(result?.error||'操作失败');e.definitive=true;return reject(e);}resolve(result);}));}
function accept(next){if(!next?.room||!next.poker)return;if(next.room.admission==='rejected'){forgetSession();state=null;showError(next.room.notice||'房主未批准本次入桌申请');render();return;}if(session&&next.room.code!==session.room)return;if(state?.room.code===next.room.code&&next.room.revision<state.room.revision)return;state=next;timeOffset=next.room.serverTime-Date.now();render();}
socket.on('table',accept);
socket.on('connect',async()=>{
 ready=false;render();
 if(session){try{const result=await request('resume',session);remember(result.session);accept(result.state);ready=socket.connected;$('error').hidden=true;}catch(e){showError(e.message);if(e.definitive){forgetSession();state=null;ready=socket.connected;}else ready=false;}}
 else{ready=true;$('error').hidden=true;}
 render();
});
socket.on('disconnect',reason=>{ready=false;render();if(reason==='io server disconnect')showError('这个座位已在另一个窗口恢复。要回到本窗口，请点击重新连接。');});
socket.on('connect_error',()=>{ready=false;render();showError('暂时连接不上牌桌服务，正在重试…');});
socket.io.on('reconnect_attempt',()=>{$('connection').textContent='正在重新连接…';});
async function run(fn){if(busy)return;busy=true;$('error').hidden=true;render();try{await fn();}catch(e){showError(e.message);}finally{busy=false;render();}}
function nickname(){if(!$('nickname').reportValidity())return null;const name=Array.from($('nickname').value.trim()).slice(0,20).join('');if(!name){showError('请先填写昵称');return null;}try{localStorage.setItem('onefish-poker-name',name);}catch{}return name;}
async function enter(event){const name=nickname();if(!name)return;const room=inviteEntry?requestedRoom:parseRoom($('room-code').value);if(event==='join'&&!room){showError(inviteEntry?'分享链接无效，请让朋友重新复制链接':'请输入有效的房间码、分享链接或完整邀请内容');return;}await run(async()=>{if(!ready){if(event!=='create')throw new Error('请等待服务器连接完成');await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.off('connect',done);reject(new Error('暂时无法连接服务器'));},10000),done=()=>{clearTimeout(timer);resolve();};socket.once('connect',done);socket.connect();});}const result=await request(event,{name,room});remember(result.session);accept(result.state);window.scrollTo({top:0});});}
$('create').onclick=()=>enter('create');
$('entry-form').addEventListener('submit',e=>{e.preventDefault();enter('join');});
function commandId(){if(typeof crypto.randomUUID==='function')return crypto.randomUUID();const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);bytes[6]=bytes[6]&15|64;bytes[8]=bytes[8]&63|128;const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');}
async function command(args){await run(async()=>{if(!ready||!state)throw new Error('请等待座位恢复后再操作');const result=await request('command',{id:commandId(),revision:state.room.revision,...args});if(result.left){forgetSession();state=null;renderedHand=null;renderedStatus=null;history.replaceState(null,'',baseUrl);$('room-code').value='';requestedRoom='';inviteEntry=false;configureEntry('已离开私人牌桌，可使用朋友的邀请链接重新申请');}else if(result.state)accept(result.state);});}
$('practice-next').onclick=()=>command({action:'practice-next'});
$('add-bot').onclick=()=>command({action:'add-bot',botId:$('bot-choice').value});
$('leave').onclick=()=>command({action:'leave'});
$('deal').onclick=()=>command({action:state?.poker.status==='idle'?'start':'next'});
$('reset').onclick=()=>command({action:'reset'});
$('fold').onclick=()=>command({action:'act',type:'fold'});
$('check-call').onclick=()=>command({action:'act',type:state?.poker.legal.check?'check':'call'});
$('allin').onclick=()=>command({action:'act',type:'allin'});
$('raise').onclick=()=>{const n=Number($('raise-amount').value),l=state?.poker.legal;if(!Number.isSafeInteger(n)||n<l.minRaiseTo||n>l.maxRaiseTo){showError('加注金额需在 '+fmt(l.minRaiseTo)+' 与 '+fmt(l.maxRaiseTo)+' 之间');return;}command({action:'act',type:'raise',amount:n});};
const reconnect=el('button','重新连接');reconnect.id='reconnect';reconnect.hidden=true;document.querySelector('.room-actions').append(reconnect);reconnect.onclick=()=>{if(socket.connected)socket.disconnect();socket.connect();};
async function copy(input){try{await navigator.clipboard.writeText(input.value);toast('链接已复制，发给朋友就能在网页加入');}catch{input.focus();input.select();toast('请复制已选中的分享链接');}}
$('copy-room').onclick=()=>{$('share-link').value=roomLink(state.room.code,baseUrl);$('share-field').hidden=false;copy($('share-link'));};
$('make-link').onclick=()=>{const code=parseRoom($('invite-text').value);if(!code){showError('没有找到有效房间码，请粘贴软件的完整邀请内容');return;}$('error').hidden=true;$('generated-link').value=roomLink(code,baseUrl);$('generated-share').hidden=false;};
$('copy-generated').onclick=()=>copy($('generated-link'));
function render(){
 $('connection').textContent=ready?'已连接':socket.connected?'正在恢复座位…':requestedRoom||session||parseRoom($('room-code').value)?'连接中…':'等待私人邀请';$('connection').classList.toggle('online',ready);
 $('entry').hidden=!!state;$('table').hidden=!state;$('join').disabled=busy||!ready||inviteEntry&&!requestedRoom;$('create').disabled=busy;
 if(!state)return;
 const{room:r,poker:s}=state,viewer=s.viewerSeat,enabled=ready&&!busy;
 $('room-label').textContent='房间 '+r.code;$('room-meta').textContent=r.admission==='pending'?'申请已发送 · 正在等待房主确认':r.playerCount+' / '+r.maxPlayers+' 席 · '+r.humanCount+' 位朋友 · '+r.botCount+' 位机器人 · '+(r.host?'你是房主':'房主：'+r.hostName);
 $('notice').textContent=ready?(r.notice||'已连接 · 刷新或断线后会自动回到原座位'):'连接中，出牌操作将在座位恢复后可用';
 $('leave').disabled=!enabled;$('reconnect').hidden=ready;
 $('astra-menu').hidden=!r.practice?.allowed;$('practice-next').disabled=!enabled||s.gameOver;$('practice-next').textContent=r.practice?.pending?'取消下一手优势牌型':'下一手优势牌型';$('practice-state').textContent=r.practice?.pending?'已安排 · 下一手生效一次':r.practice?.applied?'本手使用 astra 练习牌型':'';
 const waiting=r.admission==='pending';$('approval-waiting').hidden=!waiting;$('game-content').hidden=waiting;
 const requests=r.pendingRequests||[];$('guest-requests').hidden=!r.host||!requests.length;
 controls.list($('guest-requests'),requests,()=>requests.map(p=>{const row=el('div',undefined,'guest-request');row.append(el('span',p.name+' · 申请入桌'));for(const[action,label]of [['approve','确认是朋友，允许入桌'],['reject','拒绝']]){const b=el('button',label);b.disabled=!enabled||r.phase!=='lobby';b.onclick=()=>command({action,memberId:p.id});row.append(b);}return row;}));for(const b of $('guest-requests').querySelectorAll('button'))b.disabled=!enabled||r.phase!=='lobby';

 $('lobby').hidden=r.phase!=='lobby';$('bot-controls').hidden=!r.host;
 $('rule-hint').textContent=r.turnMs===0?'当前单人不限时 · 规则人机 0.5 秒':'真人 20 秒 · 超时自动过牌或弃牌';
 controls.options($('bot-choice'),r.availableBots);
 $('add-bot').disabled=!enabled||r.playerCount>=r.maxPlayers;
 controls.list($('bot-list'),[r.bots,r.host],()=>r.bots.map(b=>{const chip=el('span',b.name,'bot-chip');if(r.host){const remove=el('button','移除');remove.disabled=!enabled;remove.onclick=()=>command({action:'remove-bot',botId:b.id});chip.append(remove);}return chip;}));for(const b of $('bot-list').querySelectorAll('button'))b.disabled=!enabled;
 const streets={preflop:'翻牌前',flop:'翻牌',turn:'转牌',river:'河牌',showdown:'摊牌'};
 $('table-info').replaceChildren(el('span',s.handNo?'第 '+s.handNo+' 手 · '+(streets[s.street]||s.street):'等待开局'),el('strong','底池 '+fmt(s.status==='hand-over'?s.lastPot:s.pot)),el('span','盲注 '+fmt(s.sb)+' / '+fmt(s.bb)));
 $('board').replaceChildren(...Array.from({length:5},(_,i)=>card(s.board[i])));
 $('players').replaceChildren(...s.players.map(p=>{
  const winner=(s.results||[]).some(result=>result.players.some(w=>w.seat===p.seat));
  const box=el('article',undefined,'player'+(p.seat===viewer?' hero':'')+(p.isToAct?' turn':'')+(p.folded?' folded':'')+(winner?' winner':''));box.dataset.seat=p.seat;
  const who=el('div',undefined,'who');const portrait=p.avatarId||p.id;
  if(p.kind==='ai'&&['altman','dario','musk','jensen','liang'].includes(portrait)){const image=el('img');image.src='avatars/'+portrait+(portrait==='liang'?'.webp':'.jpg');image.alt='';who.append(image);}else who.append(el('span',p.seat===viewer?'你':Array.from(p.name)[0]||'友','avatar'));
  const name=el('div',undefined,'player-name');name.append(el('strong',p.seat===viewer?'你 · '+p.name:p.name),el('small',(p.kind==='ai'?(p.apiBot?'API AI':'规则机器人'):p.connected?'在线':'断线')+(p.host?' · 房主':'')+(p.isDealer?' · 庄家':'')));who.append(name,el('span',fmt(p.stack),'stack'));
  const hand=el('div',undefined,'hand');if(p.hasCards)for(let i=0;i<2;i++)hand.append(card(p.cards[i],!p.cards.length));hand.append(el('span',p.out?'已离桌':p.folded?'已弃牌':p.allIn?'已全下':p.apiBot&&p.apiStatus==='thinking'?'AI 思考中':p.isToAct?'正在出牌':p.lastAction||'等待开局','player-status'));
  box.append(who,hand,el('p',(p.apiStatus==='fallback'?'接口失败，规则人机代打 · ':'')+(p.talk||''),'talk'));return box;
 }));
 const a=s.analysis,current=a?.current,target=a?.target;$('guide').hidden=s.status==='idle';
 $('made-hand').textContent=current?current.detail+(current.complete?'':' · 底牌'):'等待发牌';$('best-five').replaceChildren(...(current?.bestCards||[]).map(c=>card(c)));
 $('draw-target').textContent=target?'最近升级：'+target.name+' · 差 '+target.missing+' 张':a?.message||'';$('draw-cards').textContent=target?target.alternatives.map(t=>t.label+'：'+t.recipe).join('；'):'';$('draw-context').textContent=current?[a.folded?'已弃牌':'',s.status==='playing'?'还剩 '+a.remaining+' 张公共牌':''].filter(Boolean).join(' · '):'';
 const results=s.results||[];$('poker-result').hidden=!results.length;
 $('poker-result').replaceChildren(...results.map(result=>{const box=el('div',undefined,'pot-result');const heading=el('div',undefined,'result-heading');heading.append(el('strong',result.label+'：'+result.players.map(p=>p.name).join('、')+' · '+(result.players[0]?.detail||'')),el('span','获得 '+fmt(result.amount)));box.append(heading);for(const p of result.players)if(p.hand?.complete){const line=el('div',undefined,'winning-five');if(result.players.length>1)line.append(el('span',p.name+'：'));line.append(...p.hand.bestCards.map(c=>card(c)));box.append(line);}return box;}));
 $('poker-log').replaceChildren(...s.log.slice(-20).map(line=>el('p',line)));
 const myTurn=enabled&&s.status==='playing'&&s.toAct===viewer,l=s.legal;
 $('fold').disabled=!myTurn||!l.fold;$('check-call').disabled=!myTurn||!(l.check||l.call);$('check-call').textContent=l.check?'过牌':'跟注 '+fmt(l.callAmount);
 $('raise').disabled=!myTurn||!l.raise;$('raise-amount').disabled=!myTurn||!l.raise;$('allin').disabled=!myTurn||!(l.raise||l.call);
 $('raise-amount').min=l.minRaiseTo;$('raise-amount').max=l.maxRaiseTo;if(document.activeElement!==$('raise-amount'))$('raise-amount').value=l.minRaiseTo||0;
 $('deal').hidden=!r.host||s.status==='playing'||s.gameOver;$('deal').textContent=s.status==='idle'?'开始对局':'下一手';$('deal').disabled=!enabled||s.status==='idle'&&(r.playerCount<2||r.pendingRequests?.length||s.players.some(p=>p.kind==='human'&&!p.connected));
 $('reset').hidden=!r.host;$('reset').disabled=!enabled||s.status==='idle';
 updateClock();
 const finished=s.status==='hand-over'&&renderedStatus!=='hand-over';if(s.handNo!==renderedHand&&s.status==='playing')window.scrollTo({top:$('table-info').offsetTop-100,behavior:'smooth'});renderedHand=s.handNo;renderedStatus=s.status;
 if(finished&&results.length)requestAnimationFrame(()=>$('poker-result').scrollIntoView({block:'center',behavior:'smooth'}));
}
function updateClock(){if(!state)return;const{room:r,poker:s}=state;const actor=s.players.find(p=>p.isToAct);let message;
 if(!ready)message='等待连接恢复…';else if(s.gameOver)message='本桌结束，房主可以重新开桌';else if(s.status==='hand-over')message='本手结束 · 查看获胜牌型，等待房主发下一手';else if(s.status!=='playing')message=r.host?'至少两席即可开局':'等待房主开始对局';
 else if(actor?.apiBot&&actor.apiStatus==='thinking')message=actor.name+' · AI 正在思考…';
 else{const who=s.toAct===s.viewerSeat?'轮到你了':(actor?.name||'朋友')+' 正在出牌';if(!r.turnDeadline)message=who+' · 不限时';else{const remaining=Math.max(0,r.turnDeadline-Date.now()-timeOffset),seconds=actor?.kind==='ai'?(remaining/1000).toFixed(1):Math.ceil(remaining/1000);message=who+' · '+seconds+' 秒'+(actor?.kind==='human'?' · 超时可过就过，否则弃牌':'');}}
 $('turn-message').textContent=message;$('turn-message').classList.toggle('your-turn',ready&&s.status==='playing'&&s.toAct===s.viewerSeat);
}
$('room-code').addEventListener('input',()=>{if(parseRoom($('room-code').value)&&!socket.connected)socket.connect();});
setInterval(updateClock,200);render();if(requestedRoom||session)socket.connect();
