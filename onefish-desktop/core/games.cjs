// Standalone adapters around the existing MIT Hold'em and Lumina domain engines.
'use strict';
const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');
const tarot=require('../vendor/lumina-tarot/domain.cjs');
const {AiProfiles,requestAction}=require('./ai-poker.cjs');
const {RULES,turnKey,timeoutActionFor}=require('./poker-rules.cjs');
class Games{
 static async create(root,{persist=true,pokerDelayMs=RULES.botDelayMs,humanTurnMs=RULES.singlePlayerTurnMs}={}){const [{createTable,BOTS},{createPokerView},{prepareFavoredDeck}]=await Promise.all([import(pathToFileURL(path.join(__dirname,'../vendor/holdem/engine.mjs'))),import(pathToFileURL(path.join(__dirname,'poker-analysis.mjs'))),import(pathToFileURL(path.join(__dirname,'practice-deal.mjs')))]);return new Games(createTable,root,persist,pokerDelayMs,createPokerView(),humanTurnMs,BOTS,prepareFavoredDeck);}
 constructor(createTable,root,persist,pokerDelayMs,pokerView,humanTurnMs,BOTS,prepareFavoredDeck){
  this.pokerView=pokerView;this.pokerDelayMs=pokerDelayMs;this.humanTurnMs=humanTurnMs;this.turnTimer=null;this.turnKey=null;this.turnDeadline=0;this.pokerNotice="";
  this.root=root;this.persist=persist;this.history=[];this.current=null;
  this.createTable=createTable;this.botSpecs=BOTS;this.prepareFavoredDeck=prepareFavoredDeck;this.practicePending=false;this.practiceApplied=false;this.aiProfiles=new AiProfiles(root,{persist});this.bots=BOTS.map(b=>({...b,kind:'ai'}));
  if(persist)try{const roster=JSON.parse(fs.readFileSync(path.join(root,'games/local-bots.json'),'utf8'));if(Array.isArray(roster)&&roster.length>=1&&roster.length<=11){const bots=roster.map(b=>{const spec=b.profileId?{...this.aiProfiles.get(b.profileId),apiBot:true,profileId:b.profileId,avatarId:'altman',company:'API AI'}:BOTS.find(s=>s.id===b.avatarId);if(!spec||typeof b.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(b.id))throw new Error('invalid roster');const {apiKey,baseUrl,model,format,timeoutMs,...safe}=spec;return{...safe,id:b.id,kind:'ai',avatarId:spec.avatarId||spec.id,name:Array.from(String(b.name||spec.name)).slice(0,20).join('')};});if(new Set(bots.map(b=>b.id)).size===bots.length)this.bots=bots;}}catch{}this.buildTable();
  if(persist)try{const saved=JSON.parse(fs.readFileSync(this.historyFile(),'utf8'));this.history=saved.filter(r=>r?.cards?.every(c=>tarot.getCardById(c.cardId))&&tarot.getSpreadById(r.spreadId)).slice(0,100);this.current=this.history[0]||null;}catch{}
 }
 buildTable(){
  this.table?.dispose();clearTimeout(this.turnTimer);this.turnKey=null;this.turnDeadline=0;this.practiceApplied=false;
  this.table=this.createTable({get:()=>undefined,timeout:(fn,ms)=>{const id=setTimeout(fn,ms);return()=>clearTimeout(id);}},{registerEffect:false,singleHumanPractice:true,players:[{id:'hero',name:'你',emoji:'♠',kind:'human'},...this.bots],actionDelayMs:this.pokerDelayMs,onChange:()=>this.armTurn(),avatarDir:path.join(this.root,'games/avatars'),aiAgent:(id,args)=>requestAction(this.aiProfiles.get(this.bots.find(b=>b.id===id)?.profileId),args),practiceDeck:(deck,seats)=>{this.practiceApplied=false;if(!this.practicePending)return null;this.practicePending=false;if(!seats.includes(0))return null;const next=this.prepareFavoredDeck(deck,seats,0);this.practiceApplied=true;return next;}});
 }
 configureBot(action,args){
  if(this.table.snapshot().status!=='idle')throw new Error('请先重新开桌，再调整机器人');
  if(action==='remove-bot'){const i=this.bots.findIndex(b=>b.id===args.botId);if(i<0)throw new Error('没有这个机器人');if(this.bots.length===1)throw new Error('本地练习至少保留一位对手');this.bots.splice(i,1);}
  else {if(this.bots.length>=11)throw new Error('最多 12 席');const spec=action==='add-api-bot'?{...this.aiProfiles.get(args.profileId),apiBot:true,profileId:args.profileId,avatarId:'altman',company:'API AI',kind:'ai'}:this.botSpecs.find(b=>b.id===args.botId);if(!spec)throw new Error('请选择机器人');const {apiKey,baseUrl,model,format,timeoutMs,...publicSpec}=spec;let n=1,id=spec.apiBot?'api-'+args.profileId:spec.id;const base=id;while(this.bots.some(b=>b.id===id)){n++;id=base+'-'+n;}this.bots.push({...publicSpec,id,kind:'ai',avatarId:spec.avatarId||spec.id,name:spec.name+(n>1?' · '+n:'')});}
  this.practicePending=false;this.buildTable();if(this.persist){const file=path.join(this.root,'games/local-bots.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(this.bots.map(b=>({id:b.id,avatarId:b.avatarId||b.id,name:b.name,profileId:b.profileId}))),{mode:0o600});fs.renameSync(file+'.tmp',file);}return this.snapshot();
 }
 historyFile(){return path.join(this.root,'games/tarot-history.json');}
 snapshot(){return {aiProfiles:this.aiProfiles.snapshot(),localBots:this.bots.map(b=>({id:b.id,name:b.name,apiBot:!!b.apiBot,profileId:b.profileId})),availableBots:this.botSpecs.map(b=>({id:b.id,name:b.name})),practice:{allowed:true,pending:this.practicePending,applied:this.practiceApplied},poker:{...this.pokerView(this.table.snapshot()),turnDeadline:this.turnDeadline,turnMs:this.humanTurnMs,botDelayMs:this.pokerDelayMs,timeoutAction:RULES.timeoutAction,notice:this.pokerNotice},tarot:{spreads:tarot.SPREADS,current:this.current,history:this.history.map(r=>({id:r.id,createdAt:r.createdAt,spreadName:r.spreadName,question:r.question||'',summary:r.cards.map(c=>c.name+(c.reversed?'（逆）':'')).join(' · ')}))}};}
 poker(action,args={}){
  if(action==='practice-next'){if(this.table.snapshot().gameOver)throw new Error('请先重新开桌');this.practicePending=!this.practicePending;return this.snapshot();}
  if(['add-bot','add-api-bot','remove-bot'].includes(action))return this.configureBot(action,args);
  if(action==='reset'){this.practicePending=false;this.practiceApplied=false;}
  if(['start','next','reset'].includes(action)){const result=this.table[action==='next'?'nextHand':action]();this.pokerNotice='';this.armTurn();return result;}
  if(action!=='act'||!['fold','check','call','raise','allin'].includes(args.type))throw new Error('不支持的牌桌操作');
  const state=this.table.snapshot();if(state.status==='playing'&&state.toAct===0&&this.turnDeadline&&Date.now()>=this.turnDeadline){this.expireTurn(this.turnKey);throw new Error('出牌时间已到，请查看最新牌桌');}if(state.status!=='playing'||state.toAct!==0)return state;
  const legal=state.legal;let type=args.type,amount=args.amount;
  if(type==='allin'){type=legal.raise?'raise':'call';amount=legal.maxRaiseTo;}
  if(!legal[type])throw new Error('当前不能执行这个操作');
  if(type==='raise'&&(!Number.isFinite(amount)||amount<legal.minRaiseTo||amount>legal.maxRaiseTo))throw new Error('加注金额超出当前允许范围');
  const result=this.table.act({type,amount:type==='raise'?Math.round(amount):undefined});this.pokerNotice='';this.armTurn();return result;
 }
 armTurn(){
  const table=this.table.snapshot(),key=turnKey(table);if(key===this.turnKey)return;
  clearTimeout(this.turnTimer);this.turnTimer=null;this.turnKey=key;this.turnDeadline=0;
  if(!key)return;
  if(table.players.find(p=>p.seat===table.toAct)?.kind==='ai'){this.turnDeadline=table.thinkEndsAt;return;}
  if(this.humanTurnMs<=0)return;
  this.turnDeadline=Date.now()+this.humanTurnMs;
  this.turnTimer=setTimeout(()=>this.expireTurn(key),this.humanTurnMs);this.turnTimer.unref?.();
 }
 expireTurn(key){
  if(this.humanTurnMs<=0||this.turnKey!==key)return false;const current=this.table.snapshot();if(current.status!=='playing'||current.toAct!==0)return false;
  const type=timeoutActionFor(current.legal);this.table.act({type});this.pokerNotice='出牌超时，已自动'+(type==='check'?'过牌':'弃牌');this.armTurn();return true;
 }
 draw(args={}){
  if(!tarot.getSpreadById(args.spread||'three-card'))throw new Error('没有这个牌阵');
  const reading=args.today?tarot.todayReading(args.reversals===false?0:.35):tarot.drawReading(args.spread||'three-card',args.reversals===false?0:.35);
  reading.question=typeof args.question==='string'?Array.from(args.question.trim()).slice(0,300).join(''):'';
  this.current=reading;this.history=[reading,...this.history].slice(0,100);
  if(this.persist){fs.mkdirSync(path.dirname(this.historyFile()),{recursive:true});const tmp=this.historyFile()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.history));fs.renameSync(tmp,this.historyFile());}
  return reading;
 }
 select(id){const reading=this.history.find(r=>r.id===id);if(!reading)throw new Error('找不到这次抽牌');this.current=reading;return reading;}
 prompt(){
  const r=this.current;if(!r)throw new Error('请先抽牌');
  return ['请解读下面已经实际抽出的塔罗牌。保持牌面、位置和正逆位不变，不要重新抽牌。',r.question?'我的问题：'+r.question:'牌阵：'+r.spreadName,...r.cards.map(c=>c.positionName+'：'+c.name+'（'+(c.reversed?'逆位':'正位')+'）\n牌义：'+c.meaning+'\n建议：'+c.advice)].join('\n\n');
 }
 dispose(){clearTimeout(this.turnTimer);this.turnTimer=null;this.turnKey=null;this.table.dispose();}
}
module.exports={Games};
