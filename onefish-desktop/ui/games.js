let state=null,tab='poker',pokerSignature='',tarotSignature='',renderedHand=null,renderedPokerStatus=null,onlineFormSignature='',actionBusy=false;
const $=id=>document.getElementById(id),bridge=window.onefishGames,controls=window.OneFishControls;
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
const fmt=n=>Number(n||0).toLocaleString('zh-CN');
function card(c,back=false){const n=el('div',c?({14:'A',13:'K',12:'Q',11:'J'}[c.r]||c.r)+({s:'♠',h:'♥',d:'♦',c:'♣'}[c.s]||''):'','card'+(back?' back':!c?' empty':''));if(c&&['h','d'].includes(c.s))n.classList.add('red');return n;}
async function action(value){if(actionBusy)return;actionBusy=true;if(state)render(state);try{$('error').hidden=true;render(await bridge.action(value));return true;}catch(e){$('error').textContent=e.message.replace(/^Error invoking remote method '[^']+': Error: /,'');$('error').hidden=false;}finally{actionBusy=false;if(state)render(state);}}
function showTab(value){tab=value;for(const id of ['poker','tarot']){$(id).hidden=id!==value;$(id+'-tab').setAttribute('aria-selected',String(id===value));}syncPokerControls();}
function syncPokerControls(){$('poker-controls').hidden=tab!=='poker'||!state||state.online?.mode==='online'&&(!state.online.room||state.online.room.admission==='pending');}
$('poker-tab').onclick=()=>showTab('poker');$('tarot-tab').onclick=()=>showTab('tarot');$('close').onclick=()=>bridge.close();
$('poker-reset').onclick=()=>action({game:'poker',action:'reset'});$('deal').onclick=()=>action({game:'poker',action:state?.online?.mode==='online'&&state.poker.gameOver?'reset':state?.poker.status==='idle'||state?.poker.gameOver?'start':'next'});
$('local-mode').onclick=()=>action({game:'online',action:'mode',mode:'local'});$('online-mode').onclick=()=>action({game:'online',action:'mode',mode:'online'});
const onlineInput=()=>({url:$('online-server').value,name:$('online-name').value,room:$('room-code').value});
$('create-room').onclick=()=>action({game:'online',action:'create',...onlineInput()});$('join-room').onclick=()=>action({game:'online',action:'join',...onlineInput()});
$('add-bot').onclick=()=>action({game:'online',action:'add-bot',botId:$('bot-choice').value});
$('copy-room').onclick=()=>action({game:'online',action:'copy'});$('leave-room').onclick=()=>action({game:'online',action:'leave'});$('forget-room').onclick=()=>action({game:'online',action:'forget'});
function renderOnline(o={mode:'local'}){
 const online=o.mode==='online';$('local-mode').setAttribute('aria-pressed',String(!online));$('online-mode').setAttribute('aria-pressed',String(online));
 $('online-lobby').hidden=!online;$('poker-table').hidden=online&&(!o.room||o.room.admission==='pending');$('online-entry').hidden=!!o.room;$('room-info').hidden=!o.room;
 const formKey=JSON.stringify([o.url,o.name]);if(formKey!==onlineFormSignature){onlineFormSignature=formKey;for(const[id,value]of [['online-server',o.url],['online-name',o.name]])if(document.activeElement!==$(id)&&value)$(id).value=value;}
 $('room-hint').textContent=!o.room?'单人不限时 · 多人真人 20 秒 · 规则人机 0.5 秒':o.room.turnMs===0?'单人不限时 · 规则人机 0.5 秒 · 最多 12 席':'多人真人 20 秒 · 规则人机 0.5 秒 · 超时可过就过，否则弃牌';
 $('poker-subtitle').textContent=online?'12 席朋友牌桌 · 虚拟筹码':'本地练习 · 不限时，规则人机 0.5 秒';
 const pending=actionBusy||o.phase==='connecting'||o.phase==='reconnecting';$('create-room').disabled=pending;$('create-room').title='创建房间，由你审核入桌申请';$('join-room').disabled=pending;
 $('room-label').textContent=o.room?'房间 '+o.room.code:'';$('room-connection').textContent=o.room?o.room.playerCount+' / '+o.room.maxPlayers+' 席 · '+(o.room.host?'你是房主':'房主：'+o.room.hostName):'';
 $('room-bots').hidden=!o.room||o.room.phase!=='lobby';$('bot-controls').hidden=!o.room?.host;
 const botOptions=o.room?.availableBots||[];controls.options($('bot-choice'),botOptions);
 $('add-bot').disabled=actionBusy||o.phase!=='connected'||!botOptions.length||o.room?.playerCount>=(o.room?.maxPlayers||12);
 controls.list($('bot-list'),[o.room?.bots||[],!!o.room?.host],()=>(o.room?.bots||[]).map(b=>{const item=el('span',b.name+' · 机器人','bot-chip');if(o.room.host){const remove=el('button','移除');remove.disabled=actionBusy||o.phase!=='connected';remove.onclick=()=>action({game:'online',action:'remove-bot',botId:b.id});item.append(remove);}return item;}));for(const b of $('bot-list').querySelectorAll('button'))b.disabled=actionBusy||o.phase!=='connected';
 $('online-lobby').classList.toggle('in-game',o.room?.phase==='playing');
 $('online-status').textContent=o.error||o.room?.notice||(o.room?.phase==='lobby'?'确认朋友入桌后，房主可以开局':o.room?'已连接，断线后会自动回到原座位':'创建房间，或输入朋友给你的房间码');
 const requests=o.room?.pendingRequests||[];$('guest-requests').hidden=!o.room?.host||!requests.length;
 controls.list($('guest-requests'),requests,()=>requests.map(p=>{const row=el('div',undefined,'guest-request');row.append(el('span',p.name+' · 申请入桌'));for(const[actionName,label]of [['approve','确认是朋友，允许入桌'],['reject','拒绝']]){const b=el('button',label);b.disabled=actionBusy||o.phase!=='connected'||o.room.phase!=='lobby';b.onclick=()=>action({game:'online',action:actionName,memberId:p.id});row.append(b);}return row;}));for(const b of $('guest-requests').querySelectorAll('button'))b.disabled=actionBusy||o.phase!=='connected'||o.room.phase!=='lobby';
 $('private-room-note').textContent=o.room?.admission==='pending'?'已发送申请，等待房主确认；确认前无法查看牌局或下注。':'私人免费练习 · 分数不可购买、交易、兑换或提现，请勿按输赢结算财物。';
 $('leave-room').disabled=o.phase!=='connected';$('forget-room').hidden=!(o.room&&o.phase!=='connected'||o.error&&o.phase!=='connected');
}
function updateTurnClock(){
 const o=state?.online,s=state?.poker;if(s?.status!=='playing')return;
 const online=o?.mode==='online',deadline=online?o.room?.turnDeadline:s.turnDeadline;const actor=s.players.find(p=>p.isToAct);if(actor?.apiBot&&actor.apiStatus==='thinking'){$('poker-message').textContent=actor.name+' · AI 正在思考…';return;}if(!deadline){$('poker-message').textContent=(s.toAct===(s.viewerSeat??0)?'轮到你了':(actor?.name||'玩家')+' 正在出牌')+' · 不限时';return;}
 const remaining=Math.max(0,deadline-Date.now()-(online?o.timeOffset||0:0));
 const seconds=actor?.kind==='ai'?(remaining/1000).toFixed(1):Math.ceil(remaining/1000);
 $('poker-message').textContent=(s.toAct===(s.viewerSeat??0)?'轮到你了':(actor?.name||'朋友')+' 正在出牌')+' · '+seconds+' 秒'+(actor?.kind==='human'?' · 超时自动过牌或弃牌':'');
}
setInterval(updateTurnClock,250);
$('fold').onclick=()=>action({game:'poker',action:'act',type:'fold'});$('check-call').onclick=()=>action({game:'poker',action:'act',type:state?.poker.legal.check?'check':'call'});
$('raise').onclick=()=>action({game:'poker',action:'act',type:'raise',amount:Number($('raise-amount').value)});$('allin').onclick=()=>action({game:'poker',action:'act',type:'allin'});
function draw(today=false){action({game:'tarot',action:'draw',spread:$('spread').value,question:$('question').value,reversals:$('reversals').checked,today});}
$('draw').onclick=()=>draw();$('today').onclick=()=>draw(true);$('art').onchange=()=>{tarotSignature='';if(state)renderTarot(state.tarot);};
$('copy').onclick=async()=>{try{await bridge.copyReading();$('copy').textContent='已复制，去对话里粘贴';setTimeout(()=>$('copy').textContent='复制给 AI 解读',2500);}catch(e){$('error').textContent=e.message;$('error').hidden=false;}};
function renderHandGuide(s){
 const a=s.analysis,current=a?.current;$('made-hand').textContent=current?current.detail+(current.complete?'':' · 底牌'):'等待发牌';
 $('best-five').replaceChildren(...(current?.bestCards||[]).map(c=>card(c)));
 const target=a?.target;$('draw-target').textContent=target?'最近升级：'+target.name+' · 差 '+target.missing+' 张':a?.message||'发牌后查看补牌方向';
 $('draw-cards').textContent=target?target.alternatives.map(t=>t.label+'：'+t.recipe).join('；'):'';
 $('draw-cards').hidden=!target;$('draw-context').textContent=current?[a.folded?'已弃牌':'',s.status==='playing'?'还剩 '+a.remaining+' 张公共牌':''].filter(Boolean).join(' · '):'';
 const results=s.results||[];$('poker-result').hidden=!results.length;
 $('poker-result').replaceChildren(...results.map(result=>{const row=el('div',undefined,'pot-result');
  const names=result.players.map(p=>p.name).join('、'),detail=result.players[0]?.detail||'';
  const heading=el('div',undefined,'result-heading');heading.append(el('strong',result.label+'：'+names+' · '+detail),el('span','获得 '+fmt(result.amount),'result-amount'));row.append(heading);
  for(const player of result.players){if(player.hand?.complete){const line=el('div',undefined,'winning-hand-row');if(result.players.length>1)line.append(el('span',player.name+'：'));const cards=el('div',undefined,'winning-five');cards.append(...player.hand.bestCards.map(c=>card(c)));line.append(cards);row.append(line);}}return row;
 }));
}
function renderPoker(s){
 const online=state?.online?.mode==='online',o=state?.online,viewer=s.viewerSeat??0;
 const key=JSON.stringify([s,online,o?.phase,o?.room?.host,actionBusy]);if(key===pokerSignature)return;pokerSignature=key;const newHand=s.handNo!==renderedHand,finishedNow=s.status==='hand-over'&&(newHand||renderedPokerStatus!=='hand-over');renderedHand=s.handNo;renderedPokerStatus=s.status;renderHandGuide(s);
 const streets={preflop:'翻牌前',flop:'翻牌',turn:'转牌',river:'河牌',showdown:'摊牌'};
 $('table-info').replaceChildren(el('span',s.handNo?'第 '+s.handNo+' 手 · '+(streets[s.street]||s.street):'等待开局'),el('span','底池 '+fmt(s.status==='hand-over'?s.lastPot:s.pot)),el('span','盲注 '+fmt(s.sb)+' / '+fmt(s.bb)));
 $('board').replaceChildren(...Array.from({length:5},(_,i)=>card(s.board[i])));
 $('players').classList.toggle('many',s.players.length>6);$('players').replaceChildren(...s.players.map(p=>{const box=el('div',undefined,'player'+(p.seat===viewer?' hero':'')+(p.isToAct?' turn':'')+(p.folded?' folded':'')+((s.results||[]).some(r=>r.players.some(w=>w.seat===p.seat))?' winner':''));box.dataset.seat=p.seat;const who=el('div',undefined,'who');if(p.kind==='human')who.append(el('span',p.seat===viewer?'你':Array.from(p.name)[0]||'友','hero-avatar'));else{const avatar=el('img');const portrait=p.avatarId||p.id;avatar.src='../vendor/holdem/avatars/'+portrait+(portrait==='liang'?'.webp':'.jpg');avatar.alt='';who.append(avatar);}const name=el('div');name.title=p.seat===viewer?'你 · '+p.name:p.name;name.append(el('strong',p.seat===viewer?'你'+(online?' · '+p.name:''):p.name),el('small',(online?(p.kind==='ai'?'机器人':p.connected?'在线':'断线')+(p.host?' · 房主':''):(p.apiBot?'API AI':p.company||'玩家'))+(p.isDealer?' · 庄家':'')));who.append(name,el('span',fmt(p.stack),'stack'));const hand=el('div',undefined,'hand');if(p.hasCards)for(let i=0;i<2;i++)hand.append(card(p.cards[i],!p.cards.length));hand.append(el('span',p.out?'已离桌':p.folded?'已弃牌':p.allIn?'已全下':p.apiBot&&p.apiStatus==='thinking'?'AI 思考中':p.isToAct?'正在出牌':p.lastAction||'等待','player-status'));box.append(who,hand,el('span',(p.apiStatus==='fallback'?'接口失败，规则人机代打 · ':'')+(p.talk||''),'talk'));return box;}));
 const heroTurn=s.status==='playing'&&s.toAct===viewer&&!actionBusy&&(!online||o.phase==='connected');const legal=s.legal;
 $('deal').hidden=s.status==='playing'||online&&!o.room?.host;$('deal').disabled=actionBusy||online&&(o.phase!=='connected'||s.status==='idle'&&(s.players.filter(p=>p.connected).length<2||o.room?.pendingRequests?.length));$('poker-reset').disabled=actionBusy||online&&(!o.room?.host||o.phase!=='connected');$('deal').textContent=s.status==='idle'?'开始对局':s.gameOver?'再开一桌':'下一手';
 $('fold').disabled=!heroTurn||!legal.fold;$('check-call').disabled=!heroTurn||!(legal.check||legal.call);$('check-call').textContent=legal.check?'过牌':'跟注 '+fmt(legal.callAmount);
 $('raise').disabled=!heroTurn||!legal.raise;$('raise-amount').disabled=!heroTurn||!legal.raise;$('allin').disabled=!heroTurn||!(legal.raise||legal.call);
 $('raise-amount').min=legal.minRaiseTo;$('raise-amount').max=legal.maxRaiseTo;if(document.activeElement!==$('raise-amount'))$('raise-amount').value=legal.minRaiseTo||0;
 const winners=s.winners.flatMap(w=>w.seats.map(seat=>seat===viewer?'你':s.players[seat]?.name));
 $('poker-message').hidden=s.status==='hand-over'&&!!s.results?.length;
 $('poker-message').textContent=s.gameOver?'本桌结束，可以再开一桌':s.status==='hand-over'?'本手获胜：'+[...new Set(winners)].join('、'):heroTurn?'轮到你了':s.status==='playing'?(s.players.find(p=>p.isToAct)?.name||'对手')+' 正在考虑…':online?'等朋友加入，房主点击开始对局':'点击开始，与 '+(s.players.length-1)+' 位对手同桌';updateTurnClock();
 $('poker-log').replaceChildren(...s.log.slice(-4).map(line=>el('div',line)));
 if(newHand&&tab==='poker')document.querySelector('main').scrollTop=0;
 if(finishedNow&&tab==='poker')requestAnimationFrame(()=>$('poker-result').scrollIntoView({block:'center'}));
}
function renderTarot(t){
 if(!$('spread').options.length){for(const spread of t.spreads){const option=el('option',spread.name+' · '+spread.count+' 张');option.value=spread.id;$('spread').append(option);}$('spread').value='three-card';}
 const key=JSON.stringify(t)+$('art').value;if(key===tarotSignature)return;tarotSignature=key;const r=t.current;
 $('copy').disabled=!r;$('reading-title').textContent=r?r.spreadName+' · '+new Date(r.createdAt).toLocaleString('zh-CN'):'选一个牌阵，开始抽牌';
 $('reading').replaceChildren(...(r?r.cards.map(c=>{const box=el('article',undefined,'tarot-card');box.append(el('div',c.positionName,'position'));const image=el('img',undefined,'tarot-image'+(c.reversed?' reversed':''));image.src='../vendor/lumina-tarot/decks/'+$('art').value+'/'+c.cardId+'.webp';image.alt=c.name;box.append(image,el('h2',c.name),el('span',c.reversed?'逆位':'正位','orientation'),el('p',c.meaning),el('p','建议：'+c.advice,'advice'));return box;}):[el('div','每张牌都由本地牌库实际抽取。','empty-reading')]));
 $('history-list').replaceChildren(...t.history.map(item=>{const b=el('button',new Date(item.createdAt).toLocaleString('zh-CN')+' · '+item.spreadName);b.append(el('small',item.summary));b.onclick=()=>action({game:'tarot',action:'history',id:item.id});return b;}));
}
function render(next){state=next;renderPracticeTools();syncPokerControls();renderOnline(next.online);renderPoker(next.poker);renderTarot(next.tarot);}
bridge.onState(render);bridge.onTab(showTab);bridge.initial().then(render).catch(e=>{$('error').textContent=e.message;$('error').hidden=false;});
window.onefishGamesDebug=()=>({tab,players:document.querySelectorAll('.player').length,tableStatus:state?.poker.status,toAct:state?.poker.toAct,foldDisabled:$('fold').disabled,legal:state?.poker.legal,madeHand:$('made-hand').textContent,drawTarget:$('draw-target').textContent,drawCards:$('draw-cards').textContent,bestFive:document.querySelectorAll('#best-five .card').length,resultText:$('poker-result').textContent,resultVisible:!$('poker-result').hidden,resultTitleInView:(()=>{const title=document.querySelector('.result-heading');if(!title||$('poker-result').hidden)return false;const r=title.getBoundingClientRect(),m=document.querySelector('main').getBoundingClientRect();return r.top>=m.top&&r.bottom<=m.bottom;})(),analysis:state?.poker.analysis,results:state?.poker.results,heroCards:state?.poker.players.find(p=>p.seat===(state.poker.viewerSeat??0))?.cards.length||0,online:state?.online,turnDeadline:state?.poker.turnDeadline,turnMs:state?.poker.turnMs,message:$('poker-message').textContent,controlsVisible:!$('poker-controls').hidden,controlsInView:(()=>{const r=$('poker-controls').getBoundingClientRect();return !$('poker-controls').hidden&&r.top>=0&&r.bottom<=innerHeight;})(),horizontalOverflow:document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth,readingCards:document.querySelectorAll('.tarot-card').length,loadedCards:[...document.querySelectorAll('.tarot-image')].filter(img=>img.complete&&img.naturalWidth>0).length,history:state?.tarot.history.length||0,spreads:$('spread').options.length,error:$('error').hidden?null:$('error').textContent});

$('practice-next').onclick=()=>action({game:'poker',action:'practice-next'});
$('local-add-bot').onclick=()=>action({game:'poker',action:'add-bot',botId:$('local-bot-choice').value});
function resetAiForm(){ $('ai-form').reset();$('ai-id').value='';$('ai-key').value='';$('ai-save').textContent='保存配置'; }
$('ai-new').onclick=resetAiForm;
$('ai-form').onsubmit=async e=>{e.preventDefault();const ok=await action({game:'ai',action:'save',config:{id:$('ai-id').value||undefined,name:$('ai-name').value,format:$('ai-format').value,baseUrl:$('ai-url').value,model:$('ai-model').value,apiKey:$('ai-key').value,timeoutMs:Number($('ai-timeout').value)*1000}});if(ok)resetAiForm();};
function renderPracticeTools(){
 const online=state.online?.mode==='online',room=state.online?.room,practice=online?room?.practice:state.practice,enabled=!actionBusy&&(!online||state.online?.phase==='connected');
 $('astra-menu').hidden=!practice?.allowed;
 $('practice-next').disabled=!enabled||state.poker.gameOver;$('practice-next').textContent=practice?.pending?'取消下一手优势牌型':'下一手优势牌型';
 $('practice-state').textContent=practice?.pending?'已安排 · 下一手生效一次':practice?.applied?'本手使用 astra 练习牌型':'';
 $('local-bot-settings').hidden=online;const lobby=online?room?.host&&room.phase==='lobby':state.poker.status==='idle';
 const options=state.availableBots||[];controls.options($('local-bot-choice'),options);
 $('local-add-bot').disabled=!enabled||!lobby||state.localBots.length>=11;
 controls.list($('local-bot-list'),state.localBots||[],()=>(state.localBots||[]).map(b=>{const chip=el('span',b.name+(b.apiBot?' · API AI':' · 规则'),'bot-chip'),remove=el('button','移除');remove.disabled=!enabled||state.poker.status!=='idle'||state.localBots.length<=1;remove.onclick=()=>action({game:'poker',action:'remove-bot',botId:b.id});chip.append(remove);return chip;}));for(const b of $('local-bot-list').querySelectorAll('button'))b.disabled=!enabled||state.poker.status!=='idle'||state.localBots.length<=1;
 $('ai-save').disabled=actionBusy;$('ai-summary').textContent=online?'联机 API 机器人由当前房主在开局前添加；接口超时或回复无效时自动回退到规则人机。':'重新开桌后可添加或移除机器人；接口耗时可能超过 0.5 秒，失败时自动回退。';
 controls.list($('ai-profile-list'),state.aiProfiles||[],()=>(state.aiProfiles||[]).map(p=>{const row=el('div',undefined,'ai-profile');row.append(el('span',p.name+' · '+(p.format==='anthropic'?'Anthropic':'OpenAI 兼容')+' · '+p.model));const add=el('button','添加到当前牌桌');add.dataset.action='add';add.disabled=!enabled||!lobby||(online?room?.playerCount>=12:state.localBots.length>=11);add.onclick=()=>action({game:'ai',action:'add',profileId:p.id});
 const edit=el('button','编辑');edit.dataset.action='edit';edit.disabled=actionBusy;edit.onclick=()=>{$('ai-id').value=p.id;$('ai-name').value=p.name;$('ai-format').value=p.format;$('ai-url').value=p.baseUrl;$('ai-model').value=p.model;$('ai-key').value='';$('ai-timeout').value=p.timeoutMs/1000;$('ai-save').textContent='保存修改';$('ai-name').focus();};
 const remove=el('button','删除');remove.dataset.action='remove';remove.dataset.profile=p.id;remove.disabled=actionBusy||state.localBots.some(b=>b.profileId===p.id);remove.onclick=()=>action({game:'ai',action:'remove',profileId:p.id});row.append(add,edit,remove);return row;}));
 for(const b of $('ai-profile-list').querySelectorAll('button'))b.disabled=b.dataset.action==='add'?!enabled||!lobby||(online?room?.playerCount>=12:state.localBots.length>=11):b.dataset.action==='remove'?actionBusy||state.localBots.some(p=>p.profileId===b.dataset.profile):actionBusy;
}
