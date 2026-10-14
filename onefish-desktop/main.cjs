const { app, BrowserWindow, ipcMain, screen, Tray, nativeImage, protocol, clipboard, powerMonitor, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {pathToFileURL}=require('node:url');
const { execFile } = require('node:child_process');
const { Monitor } = require('./core/monitor.cjs');
const { CompletionTracker } = require('./core/completions.cjs');
const { Games } = require('./core/games.cjs');
const { Backlight } = require('./core/backlight.cjs');
const { capturesPointer } = require('./core/pointer.cjs');
const { OnlinePoker } = require('./core/online-poker.cjs');
const { clampSize, sizeLimits, clampPanel, popupBounds } = require('./core/model.cjs');
app.setName('吃白饭的大肥鱼');
if(process.platform==='darwin')app.setPath('userData', path.join(os.homedir(), 'Library/Application Support/OneFish'));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
protocol.registerSchemesAsPrivileged([{ scheme: 'onefish', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const onlineSmoke=process.argv.includes('--online-smoke');
const controlsSmoke=process.argv.includes('--controls-smoke');
const aiSmoke=process.argv.includes('--ai-smoke');
const privateSmoke=process.argv.includes('--private-smoke');
const onlineTestServer=process.argv.find(a=>a.startsWith('--test-server='))?.slice(14);
const inputSmoke=process.argv.includes('--input-smoke');
const movementSmoke=process.argv.includes('--movement-smoke');
const gamesSmoke=process.argv.includes('--games-smoke');
const pokerSmoke=process.argv.includes('--poker-smoke');
const iconSmoke=process.argv.includes('--icon-smoke');
const panelSmoke=process.argv.includes('--panel-smoke');
const smoke = process.argv.includes('--smoke')||panelSmoke||iconSmoke||gamesSmoke||movementSmoke||pokerSmoke||inputSmoke||onlineSmoke||privateSmoke||aiSmoke||controlsSmoke;
if(smoke){const dir=path.join(os.tmpdir(),'onefish-smoke-'+process.pid);fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);}
const smokeOutput = process.argv.find(a=>a.startsWith('--smoke-output='))?.slice(15);
const PANEL_DISPLAY_MS=8000;
let gameWindow=null,gamesReady=null,gameTimer=null,quitting=false,onlinePoker=null,lastGamesSignature='';
let panelHideTimer=null,panelExpiresAt=0,panelPointerDown=false;
let nativeOffset=null,backlight=null,pointerTimer=null,pointerHit=null,mouseIgnored=true;
let pet, panel, context, contextPoint, contextHeight=360, tray, timer, saveTimer, settings, sample = { sources: [] }, geo, anchor, body, inputBusy = false, interactive = false;
const monitor = new Monitor(),completionTracker=new CompletionTracker();
const dataFile = ()=>path.join(app.getPath('userData'), 'settings.json');
const configTemplate = JSON.parse(fs.readFileSync(path.join(__dirname,'pet-config.json'),'utf8'));
const animationNames = new Set(fs.readdirSync(path.join(__dirname,'assets/webm')).map(n=>path.basename(n,'.webm')));
if (!app.requestSingleInstanceLock() && !smoke) app.quit();
app.on('second-instance',()=>setPanelVisible(true,true));
function geometry() {
  const all=screen.getAllDisplays(), primary=screen.getPrimaryDisplay();
  const areas=all.map(d=>d.workArea), panels=all.map(d=>d.bounds);
  const x=Math.min(...areas.map(a=>a.x)),y=Math.min(...areas.map(a=>a.y));
  return { hull:{x,y,width:Math.max(...areas.map(a=>a.x+a.width))-x,height:Math.max(...areas.map(a=>a.y+a.height))-y}, areas, panels, primaryIndex:all.findIndex(d=>d.id===primary.id) };
}
function area() { return screen.getDisplayNearestPoint(anchor || screen.getCursorScreenPoint()).workArea; }
function save() {
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    const tmp=dataFile()+'.tmp';
    try { fs.mkdirSync(path.dirname(tmp),{recursive:true});fs.writeFileSync(tmp,JSON.stringify(settings,null,2));fs.renameSync(tmp,dataFile()); } catch(e) { console.error('保存设置失败',e.message); }
  },300);
}
function state() { return { ...sample, settings, limits:sizeLimits(area()), animations:[...animationNames], backlight:backlight?.snapshot()||{supported:process.platform==='darwin'?null:false,mode:process.platform==='darwin'?'checking':'unsupported'}, version:'0.10.1' }; }
function sendState() { for(const win of [pet,panel,context]) if(win&&!win.isDestroyed())win.webContents.send('onefish:state',state()); }
function positionPanel() {
  if(!panel || panel.isDestroyed() || !body)return;
  const a=area(),w=326,h=panel.getBounds().height;
  let x=body.x+body.size/2-w/2,y=body.y-h+12;
  if(y<a.y)y=body.y+body.size*9/16+8;
  panel.setPosition(...Object.values(clampPanel(x,y,w,h,a)));
}
function resize(value) {
  settings.size=clampSize(value,area());save();sendState();positionPanel();return settings.size;
}
function safe(win,event) { return win && event.sender===win.webContents; }
function clearPanelHide(){clearTimeout(panelHideTimer);panelHideTimer=null;}
function armPanelHide(delay=PANEL_DISPLAY_MS){
 clearPanelHide();if(!panel||panel.isDestroyed()||!panel.isVisible())return;
 panelHideTimer=setTimeout(()=>{
  panelHideTimer=null;if(!panel||panel.isDestroyed()||!panel.isVisible())return;
  const p=screen.getCursorScreenPoint(),b=panel.getBounds();
  const hovering=p.x>=b.x&&p.x<b.x+b.width&&p.y>=b.y&&p.y<b.y+b.height;
  if(panelPointerDown||hovering){panelExpiresAt=Date.now()+PANEL_DISPLAY_MS;armPanelHide(500);}
  else if(Date.now()<panelExpiresAt)armPanelHide(panelExpiresAt-Date.now());
  else setPanelVisible(false);
 },delay);
}
function panelActivity(action){
 if(!panel?.isVisible())return;
 if(action==='pointer-down')panelPointerDown=true;
 if(action==='pointer-up')panelPointerDown=false;
 panelExpiresAt=Date.now()+PANEL_DISPLAY_MS;armPanelHide();
}
function setPanelVisible(value,focus=false){
 if(!panel||panel.isDestroyed())return;
 clearPanelHide();panelPointerDown=false;settings.showPanel=!!value;
 if(value){positionPanel();panel.webContents.send('onefish:panel-open');if(focus)panel.show();else panel.showInactive();panelActivity('activity');}
 else panel.hide();
 save();sendState();
}
function showPanel(){setPanelVisible(!panel.isVisible());}
function openSource(id) {
  const names={codex:'ChatGPT',claude:'Claude',dsh:'DSH NEXT'};
  if(!names[id])return;
  if(process.platform==='win32'){void shell.openExternal(({codex:'codex://',claude:'claude://',dsh:'dsh://'})[id]).catch(()=>{sample.openError='请先打开 '+names[id];sendState();});return;}
  if(id==='codex') {
    execFile('/usr/bin/open',['-a','ChatGPT','codex://'],{timeout:5000},err=>{if(err)execFile('/usr/bin/open',['-a','ChatGPT']);});
  } else execFile('/usr/bin/open',['-a',names[id]],{timeout:5000},err=>{if(err){sample.openError='无法打开 '+names[id];sendState();}});
}
function getGames(){if(!gamesReady)gamesReady=Games.create(app.getPath('userData'),{persist:!smoke});return gamesReady;}
async function gamesSnapshot(){const local=(await getGames()).snapshot();return{...local,poker:onlinePoker?.preferences.mode==='online'&&onlinePoker.latest?onlinePoker.latest.poker:local.poker,online:onlinePoker?.snapshot()||{mode:'local',phase:'offline',room:null}};}
function pushGamesState(){if(gameWindow&&!gameWindow.isDestroyed()&&gameWindow.isVisible())void gamesSnapshot().then(snapshot=>{if(gameWindow&&!gameWindow.isDestroyed()){const signature=JSON.stringify(snapshot);if(signature!==lastGamesSignature){lastGamesSignature=signature;gameWindow.webContents.send('onefish:games-state',snapshot);}}}).catch(console.error);}
async function openGames(game){
 if(!['poker','tarot'].includes(game))return;
 try{
  await getGames();
  if(!gameWindow||gameWindow.isDestroyed()){
   const a=area(),width=Math.min(860,a.width-40),height=Math.min(740,a.height-60);
   gameWindow=new BrowserWindow({...windowBase(),width,height,minWidth:Math.min(520,width),minHeight:Math.min(500,height),resizable:true,focusable:true,alwaysOnTop:false});
   gameWindow.setAlwaysOnTop(false);gameWindow.setVisibleOnAllWorkspaces(false);
   gameWindow.setPosition(Math.round(a.x+(a.width-width)/2),Math.round(a.y+(a.height-height)/2));
   gameWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));gameWindow.webContents.on('will-navigate',e=>e.preventDefault());
   gameWindow.on('close',e=>{if(!quitting){e.preventDefault();gameWindow.hide();}});
   // Keep the refresh timer through macOS hide/show events. A delayed hide
   // event can arrive after the window is visible again; only the tick skips
   // hidden windows, so native unhide and ordinary background windows recover.
   gameWindow.on('closed',()=>{clearInterval(gameTimer);gameTimer=null;gameWindow=null;});
   await gameWindow.loadFile(path.join(__dirname,'ui/games.html'));
  }
  gameWindow.webContents.send('onefish:game-tab',game);gameWindow.show();gameWindow.focus();gameWindow.webContents.send('onefish:games-state',await gamesSnapshot());
  lastGamesSignature='';clearInterval(gameTimer);gameTimer=setInterval(pushGamesState,250);
 }catch(e){sample.openError='小游戏打开失败：'+e.message;sendState();console.error(e);}
}
function positionContext() {
 if(!context||context.isDestroyed()||!contextPoint)return;
 const a=screen.getDisplayNearestPoint(contextPoint).workArea;
 context.setBounds(popupBounds(contextPoint,294,contextHeight,a),false);
}
function closeContext(){if(context&&!context.isDestroyed())context.hide();if(pet&&!pet.isDestroyed())pet.webContents.send('onefish:action',{menuOpen:false});}
function showContext(point=screen.getCursorScreenPoint()) {
 pet.webContents.send('onefish:action',{menuOpen:true});contextPoint=point;contextHeight=360;positionContext();context.webContents.send('onefish:menu-open');sendState();context.show();context.focus();
}
function contextAction(event,item){
 if(!safe(context,event)||!item)return;
 switch(item.action){
  case 'toggle-panel':showPanel();closeContext();break;
  case 'open':openSource(item.source);closeContext();break;
  case 'game':closeContext();void openGames(item.game);break;
  case 'fixed':settings.fixed=item.value===true;save();sendState();break;
  case 'backlight':settings.keyboardLight=item.value===true;backlight?.setEnabled(settings.keyboardLight);save();sendState();break;
  case 'reset':settings.center=null;pet.webContents.send('onefish:action',{reset:true});save();closeContext();break;
  case 'animation':if(animationNames.has(item.name)){pet.webContents.send('onefish:action',{anim:item.name});closeContext();}break;
  case 'quit':app.quit();break;
 }
}
async function asset(request) {
 const url=new URL(request.url);
 if(url.host!=='pet'||request.method!=='GET')return new Response('Not found',{status:404});
 const rest=decodeURIComponent(url.pathname.replace(/^\/dsh-pet-7340\//,''));
 if(rest==='config') {
  const main=structuredClone(configTemplate);
  main.pets=[{id:'main',name:'吃白饭的大肥鱼',size:settings.size,balanceEnabled:false,whisperEnabled:false,workStatusEnabled:true,fixedEnabled:settings.fixed,display:'desktop',position:{corner:'top-right',marginX:40,marginY:260}}];
  return Response.json({main});
 }
 if(rest==='state')return Response.json({sections:{},pets:{}});
 const parts=rest.split('/'),name=parts.at(-1);
 if(!name||name==='.'||name==='..'||name.includes('\\')||parts.some(p=>p==='..'))return new Response('Not found',{status:404});
 let folder,mime;
 if(parts[0]==='thumb'&&parts[1]==='main'&&parts.length===3&&name.endsWith('.webm')){folder='webm';mime='video/webm';}
 if(parts[0]==='font'&&parts.length===2){folder='fonts';mime='font/ttf';}
 if(parts[0]==='pic'&&parts.length===2){folder='pic';mime='image/png';}
 if(!folder)return new Response('Not found',{status:404});
 try { return new Response(await fsp.readFile(path.join(__dirname,'assets',folder,name)),{headers:{'content-type':mime,'access-control-allow-origin':'*'}}); } catch {return new Response('Not found',{status:404});}
}
function windowBase() { return {frame:false,transparent:true,hasShadow:false,resizable:false,skipTaskbar:true,alwaysOnTop:true,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}}; }
function syncPetInput(){
 if(!pet||pet.isDestroyed())return;
 const ignored=!capturesPointer(screen.getCursorScreenPoint(),pet.getBounds(),pointerHit,inputBusy,pet.isVisible());
 if(ignored===mouseIgnored)return;
 mouseIgnored=ignored;pet.setIgnoreMouseEvents(ignored,{forward:true});
}
function top(win) {win.setAlwaysOnTop(true,'screen-saver');win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});win.setWindowButtonVisibility?.(false);}
async function poll() {try {sample=await monitor.poll();Object.assign(sample,completionTracker.observe(sample.sources,sample.sampledAt));backlight?.observe(sample);sendState();tray?.setToolTip('吃白饭的大肥鱼 · '+sample.sources.map(s=>s.name+' '+s.label).join(' / '));}catch(e){console.error('状态更新失败',e.message);} }
app.whenReady().then(async()=>{
 if(onlineSmoke)console.log('online smoke: ready');
 geo=geometry();anchor=screen.getCursorScreenPoint();if(onlineSmoke)console.log('online smoke: geometry');
 let saved={};try {saved=JSON.parse(fs.readFileSync(dataFile(),'utf8'));}catch{}
 settings={size:clampSize(saved.size??screen.getPrimaryDisplay().workArea.width/8,screen.getPrimaryDisplay().workArea),fixed:saved.fixed!==false,showPanel:true,center:saved.center||null,keyboardLight:saved.keyboardLight!==false};
 if(!smoke&&process.platform==='darwin'){
  backlight=new Backlight({binary:path.join(__dirname,'native/keyboard-backlight'),enabled:settings.keyboardLight,onChange:sendState});void backlight.start();
  powerMonitor.on('suspend',()=>backlight.pause('sleep'));powerMonitor.on('resume',()=>backlight.resume('sleep'));
  powerMonitor.on('lock-screen',()=>backlight.pause('lock'));powerMonitor.on('unlock-screen',()=>backlight.resume('lock'));
 }
 if(onlineSmoke)console.log('online smoke: creating client');
 onlinePoker=new OnlinePoker(app.getPath('userData'),{persist:!smoke,onChange:pushGamesState});
 if(!smoke&&onlinePoker.preferences.mode==='online'&&onlinePoker.preferences.session)void onlinePoker.open().catch(()=>{});
 protocol.handle('onefish',asset);
 if(onlineSmoke)console.log('online smoke: creating windows');
 pet=new BrowserWindow({...windowBase(),width:500,height:440,focusable:false,acceptFirstMouse:true});top(pet);pet.setIgnoreMouseEvents(true,{forward:true});
 panel=new BrowserWindow({...windowBase(),width:326,height:260,focusable:true});top(panel);
 context=new BrowserWindow({...windowBase(),width:294,height:360,focusable:true});top(context);context.on('blur',closeContext);
 pet.webContents.on('console-message',details=>{if(['warning','error'].includes(details.level))console.error('宠物:',details.message);});
 for(const w of [pet,panel,context]){w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());}
 ipcMain.handle('onefish:initial',()=>state());
 ipcMain.handle('onefish:game-initial',async e=>{if(!safe(gameWindow,e))throw new Error('非法窗口');return await gamesSnapshot();});
 ipcMain.handle('onefish:game-action',async(e,args)=>{
  if(!safe(gameWindow,e)||!args||typeof args!=='object')throw new Error('非法窗口');const service=await getGames();
  if(args.game==='ai'){
   if(args.action==='save')service.aiProfiles.save(args.config);
   else if(args.action==='remove'){if(service.bots.some(b=>b.profileId===args.profileId))throw new Error('请先从本地牌桌移除此 AI 机器人');service.aiProfiles.remove(args.profileId);}
   else if(args.action==='add'){if(onlinePoker.preferences.mode==='online')await onlinePoker.act({action:'add-api-bot',config:service.aiProfiles.get(args.profileId)});else service.poker('add-api-bot',{profileId:args.profileId});}
   else throw new Error('不支持的 AI 设置操作');
  }else if(args.game==='online'){
   if(args.action==='mode')await onlinePoker.setMode(args.mode);
   else if(args.action==='create')await onlinePoker.create({url:args.url,name:args.name});
   else if(args.action==='join')await onlinePoker.join({url:args.url,name:args.name,room:args.room});
   else if(['add-bot','remove-bot','approve','reject'].includes(args.action))await onlinePoker.act({action:args.action,botId:args.botId,memberId:args.memberId});
   else if(args.action==='leave')await onlinePoker.leave();
   else if(args.action==='forget')onlinePoker.forget();
   else if(args.action==='copy'){if(!onlinePoker.latest?.room)throw new Error('请先创建房间');clipboard.writeText(onlinePoker.invitationUrl());}
   else throw new Error('不支持的联机操作');
  }else if(args.game==='poker'){if(onlinePoker.preferences.mode==='online')await onlinePoker.act({action:args.action,type:args.type,amount:args.amount});else service.poker(args.action,{type:args.type,amount:args.amount,botId:args.botId});}
  else if(args.game==='tarot'&&args.action==='draw')service.draw(args);
  else if(args.game==='tarot'&&args.action==='history')service.select(args.id);
  else throw new Error('不支持的小游戏操作');return await gamesSnapshot();
 });
 ipcMain.handle('onefish:copy-reading',async e=>{if(!safe(gameWindow,e))throw new Error('非法窗口');clipboard.writeText((await getGames()).prompt());return true;});
 ipcMain.on('onefish:close-games',e=>{if(safe(gameWindow,e))gameWindow.hide();});
 ipcMain.handle('onefish:resize',(e,value)=>safe(panel,e)||safe(pet,e)||safe(context,e)?resize(value):settings.size);
 ipcMain.on('onefish:open',(e,id)=>{if(safe(panel,e)||safe(pet,e))openSource(id);});
 ipcMain.on('onefish:toggle-panel',e=>{if(safe(panel,e)||safe(pet,e))showPanel();});
 ipcMain.on('onefish:panel-activity',(e,action)=>{if(safe(panel,e)&&['activity','pointer-down','pointer-up'].includes(action))panelActivity(action);});
 ipcMain.on('onefish:panel-height',(e,h)=>{if(!safe(panel,e))return;panel.setSize(326,Math.max(234,Math.min(440,Number(h)||234)));positionPanel();});
 ipcMain.on('onefish:menu',e=>{if(safe(pet,e))showContext();});
 ipcMain.on('onefish:menu-close',e=>{if(safe(context,e))closeContext();});
 ipcMain.on('onefish:menu-height',(e,h)=>{if(!safe(context,e))return;contextHeight=Math.max(200,Math.min(640,Number(h)||360));positionContext();});
 ipcMain.on('onefish:menu-action',contextAction);
 ipcMain.on('pet:input-busy',(e,busy)=>{if(!safe(pet,e))return;inputBusy=!!busy;syncPetInput();});
 ipcMain.on('pet:set-interactive',(e,value)=>{if(!safe(pet,e))return;interactive=!!value;syncPetInput();});
 ipcMain.on('pet:hit-rect',(e,rect)=>{
  if(!safe(pet,e)||!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0)return;
  pointerHit={x:rect.x,y:rect.y,width:rect.width,height:rect.height};syncPetInput();
 });
 ipcMain.on('pet:set-bounds',(e,b)=>{
  if(!safe(pet,e)||!b||![b.x,b.y,b.width,b.height,b.boxX,b.boxY,b.size].every(Number.isFinite))return;
  if(b.width<1||b.width>10000||b.height<1||b.height>10000)return;
  const next={x:Math.round(b.x),y:Math.round(b.y),width:Math.round(b.width),height:Math.round(b.height)};
  const old=pet.getBounds();if(Object.keys(next).some(k=>old[k]!==next[k]))pet.setBounds(next,false);
  // macOS pins native window tops below the menu bar. Offset the sprite inside
  // that window so its requested desktop position and visible stage still agree.
  const actual=pet.getBounds(),offset={x:next.x-actual.x,y:next.y-actual.y};
  if(!nativeOffset||offset.x!==nativeOffset.x||offset.y!==nativeOffset.y){nativeOffset=offset;pet.webContents.send('onefish:action',{nativeOffset:offset});}
  body={x:b.boxX+geo.hull.x,y:b.boxY+geo.hull.y,size:b.size};anchor={x:Math.round(body.x+b.size/2),y:Math.round(body.y+b.size*9/32)};
  settings.center=anchor;positionPanel();save();syncPetInput();
 });
 screen.on('display-metrics-changed',()=>{geo=geometry();pet.webContents.send('pet:displays',geo);positionPanel();});
 screen.on('display-added',()=>{geo=geometry();pet.webContents.send('pet:displays',geo);});
 screen.on('display-removed',()=>{geo=geometry();pet.webContents.send('pet:displays',geo);});
 if(process.platform==='darwin')app.dock?.setIcon(path.join(__dirname,'assets/logo.png'));
 const icon=nativeImage.createFromPath(path.join(__dirname,'assets/logo.png')).resize({width:18,height:18});
 tray=new Tray(icon);tray.setToolTip('吃白饭的大肥鱼');tray.on('click',showPanel);tray.on('right-click',()=>showContext());
 const query={configUrl:'onefish://pet/dsh-pet-7340/config',scale:'1',petIndex:'0',workAreaX:String(geo.hull.x),workAreaY:String(geo.hull.y),workAreaW:String(geo.hull.width),workAreaH:String(geo.hull.height),areas:JSON.stringify(geo.areas),panels:JSON.stringify(geo.panels),primaryIndex:String(geo.primaryIndex)};
 if(onlineSmoke)console.log('online smoke: loading renderers');
 await Promise.all([pet.loadFile(path.join(__dirname,'vendor/dsh-pet/index.html'),{query}),panel.loadFile(path.join(__dirname,'ui/panel.html')),context.loadFile(path.join(__dirname,'ui/context.html'))]);
 if(onlineSmoke)console.log('online smoke: loaded');
 pet.showInactive();pointerTimer=setInterval(syncPetInput,32);syncPetInput();if(!privateSmoke&&!aiSmoke&&!controlsSmoke)await poll();setPanelVisible(true);
 timer=setInterval(poll,2000);
 if(controlsSmoke){
  const report={checks:{}},pause=ms=>new Promise(r=>setTimeout(r,ms));const wait=async fn=>{for(let i=0;i<200;i++){if(await fn())return;await pause(25);}throw new Error('机器人设置界面无响应');};
  try{
   clearInterval(timer);setPanelVisible(false);await openGames('poker');await pause(200);
   await gameWindow.webContents.executeJavaScript(`document.getElementById('local-bot-settings').open=true;document.querySelector('main').scrollTop=0;void 0;`);report.observation=await gameWindow.webContents.executeJavaScript(`(async()=>{const select=document.getElementById('local-bot-choice'),option=select.options[0],profile=document.getElementById('ai-profile-list'),list=document.getElementById('local-bot-list');let selectChanges=0,listChanges=0,frames=0;const observer=new MutationObserver(records=>{for(const m of records){if(m.target===select)selectChanges++;if(m.target===list||m.target===profile)listChanges++;}});observer.observe(select,{childList:true});observer.observe(list,{childList:true});observer.observe(profile,{childList:true});select.focus();let running=true;const tick=()=>{frames++;if(running)requestAnimationFrame(tick);};requestAnimationFrame(tick);await new Promise(r=>setTimeout(r,1600));running=false;observer.disconnect();return{selectChanges,listChanges,sameOption:select.options[0]===option,frames,focused:document.activeElement===select};})()`);
   report.checks.dropdownOptionsRetained=report.observation.selectChanges===0&&report.observation.sameOption;report.checks.idleListsRetained=report.observation.listChanges===0;report.checks.rendererResponsive=report.observation.frames>10;
   const games=await getGames(),initial=games.bots.length;
   for(let i=0;i<3;i++){await gameWindow.webContents.executeJavaScript(`document.getElementById('local-add-bot').click();void 0;`);await wait(()=>games.bots.length===initial+i+1);await pause(150);}
   report.checks.repeatedAdditionWorks=games.bots.length===initial+3;report.checks.uniqueSeats=new Set(games.bots.map(b=>b.id)).size===games.bots.length;
   report.checks.actionsRecovered=await gameWindow.webContents.executeJavaScript(`!document.getElementById('local-add-bot').disabled&&!document.getElementById('deal').disabled&&document.getElementById('error').hidden`);
   await pause(300);if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});await fsp.writeFile(path.join(smokeOutput,'controls.png'),(await gameWindow.webContents.capturePage()).toPNG());}
   if(Object.values(report.checks).some(v=>!v))throw new Error('设置控件稳定性验收未通过');
  }catch(e){report.error=e.stack||String(e);}
  if(gamesReady)(await gamesReady).dispose();onlinePoker.dispose();clearInterval(timer);clearInterval(gameTimer);clearInterval(pointerTimer);clearPanelHide();clearTimeout(saveTimer);if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});fs.writeFileSync(path.join(smokeOutput,'smoke.json'),JSON.stringify(report,null,2));}console.log(JSON.stringify(report,null,2));app.exit(report.error?1:0);return;
 }
 if(aiSmoke){
  const report={checks:{}},pause=ms=>new Promise(r=>setTimeout(r,ms));let mock;const seen=[];
  const wait=async fn=>{for(let i=0;i<600;i++){if(await fn())return;await pause(25);}throw new Error('AI 窗口验收等待超时');};
  const shot=async name=>{if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});await fsp.writeFile(path.join(smokeOutput,name+'.png'),(await gameWindow.webContents.capturePage()).toPNG());}};
  try{
   clearInterval(timer);setPanelVisible(false);
   mock=require('node:http').createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{seen.push({path:req.url,body:JSON.parse(body)});res.setHeader('content-type','application/json');const raw='{"type":"call","talk":"先看看"}';res.end(JSON.stringify(req.url.endsWith('/messages')?{content:[{type:'text',text:raw}]}:{choices:[{message:{content:raw}}]}));});});await new Promise(r=>mock.listen(0,'127.0.0.1',r));await openGames('poker');const games=await getGames();await pause(200);
   for(const format of ['openai','anthropic']){
    await gameWindow.webContents.executeJavaScript(`document.getElementById('ai-settings').open=true;document.getElementById('ai-name').value=${JSON.stringify(format+' 牌友')};document.getElementById('ai-format').value=${JSON.stringify(format)};document.getElementById('ai-url').value=${JSON.stringify('http://127.0.0.1:'+mock.address().port+'/v1')};document.getElementById('ai-model').value='mock-model';document.getElementById('ai-key').value='mock-test-key-only';document.getElementById('ai-form').requestSubmit();void 0;`);
    await wait(()=>games.aiProfiles.snapshot().length===(format==='openai'?1:2));await pause(300);
    await gameWindow.webContents.executeJavaScript(`document.querySelectorAll('#ai-profile-list .ai-profile')[${format==='openai'?0:1}].querySelector('button').click();void 0;`);await wait(()=>games.bots.filter(b=>b.apiBot).length===(format==='openai'?1:2));await pause(300);
   }
   report.checks.bothFormatsSaved=games.aiProfiles.snapshot().map(p=>p.format).join(',')==='openai,anthropic';report.checks.keysExcludedFromState=!JSON.stringify(await gamesSnapshot()).includes('mock-test-key-only');await shot('api-settings');
   for(let i=0;i<5;i++){await gameWindow.webContents.executeJavaScript(`document.getElementById('local-bot-settings').open=true;document.querySelector('#local-bot-list button').click();void 0;`);await wait(()=>games.bots.length===6-i);await pause(100);}
   await gameWindow.webContents.executeJavaScript(`document.getElementById('ai-settings').open=false;document.getElementById('local-bot-settings').open=false;document.getElementById('astra-menu').open=true;document.getElementById('practice-next').click();void 0;`);await wait(()=>games.practicePending);report.checks.visiblePracticeMenu=await gameWindow.webContents.executeJavaScript(`!document.getElementById('astra-menu').hidden&&document.getElementById('practice-state').textContent.includes('下一手')`);await pause(350);await gameWindow.webContents.executeJavaScript(`document.querySelector('main').scrollTop=0;void 0;`);await pause(100);await shot('single-human-practice');
   await gameWindow.webContents.executeJavaScript(`document.getElementById('deal').click();void 0;`);await wait(()=>games.table.snapshot().status==='playing');report.checks.practiceConsumedOnce=games.practiceApplied&&!games.practicePending;
   await wait(()=>games.table.snapshot().toAct===0);await pause(250);await gameWindow.webContents.executeJavaScript(`document.getElementById('allin').click();void 0;`);await wait(()=>games.table.snapshot().status==='hand-over');await pause(300);
   report.checks.bothApiBotsPlayed=seen.some(s=>s.path.endsWith('/messages'))&&seen.some(s=>s.path.endsWith('/chat/completions'));
   report.checks.keysNotInPrompts=seen.every(s=>!JSON.stringify(s.body).includes('mock-test-key-only'));
   const snap=games.table.snapshot(),{evalBest}=await import(pathToFileURL(path.join(__dirname,'vendor/holdem/engine.mjs')));const scores=snap.players.map(p=>evalBest([...p.cards,...snap.board]).score);report.checks.practiceBestHand=scores[0]>Math.max(...scores.slice(1));report.checks.chipsConserved=snap.players.reduce((n,p)=>n+p.stack,0)===6000000;report.checks.ordinaryWindow=!gameWindow.isAlwaysOnTop();await shot('api-showdown');
   await gameWindow.webContents.executeJavaScript(`document.getElementById('poker-reset').click();void 0;`);await wait(()=>games.table.snapshot().status==='idle');report.checks.resetClearsPractice=!games.practiceApplied&&!games.practicePending;
   if(Object.values(report.checks).some(v=>!v))throw new Error('AI 窗口验收未通过');
  }catch(e){report.error=e.stack||String(e);}
  if(gamesReady)(await gamesReady).dispose();if(mock)await new Promise(r=>mock.close(r));onlinePoker.dispose();clearInterval(timer);clearInterval(gameTimer);clearInterval(pointerTimer);clearPanelHide();clearTimeout(saveTimer);
  if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});fs.writeFileSync(path.join(smokeOutput,'smoke.json'),JSON.stringify(report,null,2));}console.log(JSON.stringify(report.checks,null,2));if(report.error)console.error(report.error);app.exit(report.error?1:0);return;
 }
 if(privateSmoke){
  const report={checks:{}},pause=ms=>new Promise(r=>setTimeout(r,ms));let friend,outsider,copied='';const oldWrite=clipboard.writeText;
  const wait=async fn=>{for(let i=0;i<320;i++){if(await fn())return;await pause(25);}throw new Error('私人牌桌验收等待超时');};
  const shot=async name=>{if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});await fsp.writeFile(path.join(smokeOutput,name+'.png'),(await gameWindow.webContents.capturePage()).toPNG());}};
  try{
   if(!onlineTestServer)throw new Error('需要 --test-server');clearInterval(timer);setPanelVisible(false);onlinePoker.configure({url:onlineTestServer});await openGames('poker');await pause(200);
   report.checks.noCheatApi=await gameWindow.webContents.executeJavaScript('typeof window.onefishGames.armNextHand==="undefined"');
   await gameWindow.webContents.executeJavaScript('window.__testServer='+JSON.stringify(onlineTestServer)+';void 0;');report.entry=await gameWindow.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'ui/online-smoke.js'),'utf8'));await pause(200);
   clipboard.writeText=text=>{copied=text;};await gameWindow.webContents.executeJavaScript('document.getElementById("copy-room").click();void 0;');await wait(()=>copied);clipboard.writeText=oldWrite;report.invite=copied;
   report.checks.shareLink=new URL(copied).searchParams.get('room')===onlinePoker.latest.room.code;
   await gameWindow.webContents.executeJavaScript(`document.getElementById('ai-settings').open=true;document.getElementById('ai-name').value='联机 AI 验收';document.getElementById('ai-format').value='anthropic';document.getElementById('ai-url').value='https://api.example.com/v1';document.getElementById('ai-model').value='mock-unused-model';document.getElementById('ai-key').value='mock-unused-api-key';document.getElementById('ai-form').requestSubmit();void 0;`);await wait(async()=>(await getGames()).aiProfiles.snapshot().length===1);await pause(300);
   await gameWindow.webContents.executeJavaScript(`document.querySelector('#ai-profile-list button').click();void 0;`);await wait(()=>onlinePoker.latest.room.botCount===1);report.checks.nativeApiBotAdded=onlinePoker.latest.poker.players.some(p=>p.apiBot);report.checks.apiKeyNotBroadcast=!JSON.stringify(onlinePoker.latest).includes('mock-unused-api-key');await pause(300);
   await gameWindow.webContents.executeJavaScript(`document.getElementById('ai-settings').open=false;document.getElementById('astra-menu').open=true;document.getElementById('practice-next').click();void 0;`);await wait(()=>onlinePoker.latest.room.practice.pending);report.checks.soloPracticeAvailable=onlinePoker.latest.room.practice.allowed;await pause(300);await shot('solo-online-practice');
   outsider=new OnlinePoker('/unused',{persist:false});await outsider.create({url:onlineTestServer,name:'独立设备房主'});report.checks.independentDeviceCanCreate=outsider.latest.room.host;await outsider.leave();
   friend=new OnlinePoker('/unused',{persist:false});await friend.join({url:onlineTestServer,name:'入桌验收朋友',room:copied});await wait(()=>onlinePoker.latest.room.pendingRequests.length===1);await pause(300);
   report.checks.guestWaits=friend.latest.room.admission==='pending'&&friend.latest.poker.players.length===0&&friend.latest.poker.board.length===0;report.checks.joinCancelsPractice=!onlinePoker.latest.room.practice.pending&&!onlinePoker.latest.room.practice.allowed;
   await onlinePoker.act({action:'remove-bot',botId:onlinePoker.latest.room.bots[0].id});await pause(300);report.checks.oneSeatBeforeApproval=onlinePoker.latest.room.playerCount===1;await shot('awaiting-approval');
   await gameWindow.webContents.executeJavaScript('document.querySelector("#guest-requests button").click();void 0;');await wait(()=>friend.latest.room.admission==='approved'&&onlinePoker.latest.room.playerCount===2);report.checks.nativeApprovalWorks=true;
   await gameWindow.webContents.executeJavaScript('document.getElementById("deal").click();void 0;');await wait(()=>onlinePoker.latest.poker.status==='playing'&&friend.latest.poker.status==='playing');report.checks.privateCards=onlinePoker.latest.poker.players[1].cards.length===0&&friend.latest.poker.players[0].cards.length===0;
   let cheatDenied=false;try{await onlinePoker.act({action:'astra'});}catch{cheatDenied=true;}report.checks.oldCheatCommandDenied=cheatDenied;let practiceDenied=false;try{await onlinePoker.act({action:'practice-next'});}catch{practiceDenied=true;}report.checks.multiHumanPracticeDenied=practiceDenied;report.checks.multiHumanMenuHidden=await gameWindow.webContents.executeJavaScript(`document.getElementById('astra-menu').hidden`);
   for(let i=0;i<40&&onlinePoker.latest.poker.status==='playing';i++){const actor=onlinePoker.latest.poker.toAct===0?onlinePoker:friend;await wait(()=>actor.latest.room.revision===onlinePoker.latest.room.revision);await actor.act({action:'act',type:'allin'});await wait(()=>friend.latest.room.revision===onlinePoker.latest.room.revision);}
   report.checks.normalSettlement=onlinePoker.latest.poker.status==='hand-over'&&onlinePoker.latest.poker.players.reduce((n,p)=>n+p.stack,0)===4000000;
   await pause(250);await shot('normal-settlement');report.checks.ordinaryWindow=!gameWindow.isAlwaysOnTop();await onlinePoker.leave();await wait(()=>friend.latest.room.host);await friend.act({action:'reset'});await outsider.join({url:onlineTestServer,name:'新朋友',room:friend.latest.room.code});await wait(()=>friend.latest.room.pendingRequests.length===1);await friend.act({action:'approve',memberId:friend.latest.room.pendingRequests[0].id});await wait(()=>outsider.latest.room.admission==='approved');report.checks.newHostCanApprove=true;await outsider.leave();if(Object.values(report.checks).some(v=>!v))throw new Error('私人窗口验收未通过');
  }catch(e){report.error=e.stack||String(e);}
  clipboard.writeText=oldWrite;try{if(friend?.phase==='connected'&&friend.latest)await friend.leave();}catch{}friend?.dispose();outsider?.dispose();try{if(onlinePoker.phase==='connected'&&onlinePoker.latest)await onlinePoker.leave();}catch{}onlinePoker.dispose();
  clearInterval(timer);clearInterval(gameTimer);clearInterval(pointerTimer);clearPanelHide();clearTimeout(saveTimer);if(gamesReady)(await gamesReady).dispose();
  if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});fs.writeFileSync(path.join(smokeOutput,'smoke.json'),JSON.stringify(report,null,2));}console.log(JSON.stringify(report.checks,null,2));if(report.error)console.error(report.error);app.exit(report.error?1:0);return;
 }
 if(onlineSmoke){
  const report={},saved=structuredClone(settings),pause=ms=>new Promise(r=>setTimeout(r,ms));let friend;
  const wait=async fn=>{for(let i=0;i<160;i++){if(await fn())return;await pause(25);}throw new Error('联机验收等待超时');};
  const shot=async name=>{if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});await fsp.writeFile(path.join(smokeOutput,name+'.png'),(await gameWindow.webContents.capturePage()).toPNG());}};
  try{
   if(!onlineTestServer)throw new Error('需要 --test-server 指定验收地址');clearInterval(timer);setPanelVisible(false);await openGames('poker');
   await gameWindow.webContents.executeJavaScript('window.__testServer='+JSON.stringify(onlineTestServer)+';void 0;');
   report.entry=await gameWindow.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'ui/online-smoke.js'),'utf8'));
   await gameWindow.webContents.executeJavaScript('document.getElementById("bot-choice").value="altman";document.getElementById("add-bot").click();void 0;');await wait(()=>onlinePoker.latest.room.botCount===1);await pause(120);
   await gameWindow.webContents.executeJavaScript('document.getElementById("deal").click();void 0;');await wait(()=>onlinePoker.latest.poker.status!=='idle');
   for(let i=0;i<6;i++){if(onlinePoker.latest.poker.status==='hand-over'){await onlinePoker.act({action:'next'});}if(onlinePoker.latest.poker.status==='playing'&&onlinePoker.latest.poker.toAct===0)break;await pause(550);}
   await wait(()=>onlinePoker.latest.poker.status==='playing'&&onlinePoker.latest.poker.toAct===0);await pause(150);
   const soloBefore=onlinePoker.latest.poker;report.soloInitial=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');
   await pause(21000);report.solo=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');
   report.soloWaited=onlinePoker.latest.poker.status==='playing'&&onlinePoker.latest.poker.handNo===soloBefore.handNo&&onlinePoker.latest.poker.toAct===0&&!onlinePoker.latest.poker.players[0].folded;
   await onlinePoker.act({action:'act',type:onlinePoker.latest.poker.legal.check?'check':'call'});await onlinePoker.act({action:'reset'});await onlinePoker.act({action:'remove-bot',botId:'altman'});await pause(200);
   friend=new OnlinePoker('/unused',{persist:false});await friend.join({url:onlineTestServer,name:'验收 Windows 客户端',room:onlinePoker.latest.room.code});await wait(()=>onlinePoker.latest.room.pendingRequests.length===1);await onlinePoker.act({action:'approve',memberId:onlinePoker.latest.room.pendingRequests[0].id});
   await wait(()=>onlinePoker.latest.room.playerCount===2);await pause(300);
   for(let i=0;i<10;i++){const id=['altman','dario','musk','liang','jensen'][i%5];await gameWindow.webContents.executeJavaScript('document.getElementById("bot-choice").value='+JSON.stringify(id)+';document.getElementById("add-bot").click();void 0;');await wait(()=>onlinePoker.latest.room.botCount===i+1);await pause(80);}
   report.botsSelected=onlinePoker.latest.room.botCount===10;await shot('lobby');
   await gameWindow.webContents.executeJavaScript('document.getElementById("deal").click();void 0;');await wait(()=>onlinePoker.latest.poker.status==='playing');await wait(()=>friend.latest?.poker.status==='playing');await pause(300);
   report.table=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');await shot('table');
   gameWindow.setSize(540,680);await pause(250);report.narrow=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');await shot('narrow');gameWindow.setSize(860,740);await pause(150);
   report.privateCards=onlinePoker.latest.poker.players.filter(p=>p.seat!==onlinePoker.latest.poker.viewerSeat).every(p=>!p.cards.length);
   report.selfHighlight=await gameWindow.webContents.executeJavaScript('document.querySelectorAll(".player.hero").length===1');
   for(let i=0;i<200&&onlinePoker.latest.poker.status==='playing';i++){
    if(onlinePoker.latest.poker.players.find(p=>p.isToAct)?.kind==='ai'){await pause(100);continue;}
    const acting=onlinePoker.latest.poker.toAct===onlinePoker.latest.poker.viewerSeat?onlinePoker:friend;
    await wait(()=>acting.latest.room.revision===onlinePoker.latest.room.revision);await acting.act({action:'act',type:'allin'});await wait(()=>friend.latest.room.revision===onlinePoker.latest.room.revision);
   }
   await pause(350);report.settled=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');await shot('settled');
   friend.stop();await friend.open();report.reconnected=friend.phase==='connected'&&friend.latest.poker.viewerSeat===1;
   await gameWindow.webContents.executeJavaScript('document.getElementById("poker-reset").click();void 0;');await wait(()=>onlinePoker.latest.room.phase==='lobby');await pause(300);
   await gameWindow.webContents.executeJavaScript('document.getElementById("leave-room").click();void 0;');await wait(()=>!onlinePoker.latest);
   await gameWindow.webContents.executeJavaScript('document.getElementById("local-mode").click();void 0;');await wait(()=>onlinePoker.preferences.mode==='local');await pause(300);
   report.local=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');
   report.checks={entry:report.entry.online&&report.entry.lobbyVisible&&!report.entry.error,draftPreserved:report.entry.draftPreserved,humanAndBots:report.table.players===12&&report.botsSelected,privateCards:report.privateCards,controlsAlwaysVisible:report.table.controlsInView&&report.narrow.controlsInView,noHorizontalOverflow:!report.table.horizontalOverflow&&!report.narrow.horizontalOverflow,timing:report.table.online.room.turnMs===20000&&report.table.online.room.botDelayMs===500&&report.table.online.room.timeoutAction==='check-or-fold',oneSelfHighlight:report.selfHighlight,handSettled:report.settled.tableStatus==='hand-over'&&report.settled.resultVisible&&!!report.settled.resultText,reconnect:report.reconnected,localRecovered:report.local.players===6&&report.local.online.mode==='local',localNoLimit:report.local.turnMs===0,soloNoLimit:report.soloInitial.online.room.turnMs===0&&report.soloInitial.message.includes('不限时')&&report.solo.message.includes('不限时')&&report.soloWaited,ordinaryWindow:!gameWindow.isAlwaysOnTop(),normalSpeed:(await pet.webContents.executeJavaScript('window.onefishDebug.snapshot()')).playbackRate===1};
   if(Object.values(report.checks).some(v=>!v))throw new Error('联机窗口验证失败');
  }catch(e){report.error=e.stack||String(e);if(gameWindow&&!gameWindow.isDestroyed())report.failureUi=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()').catch(()=>null);}
  friend?.dispose();onlinePoker.dispose();clearInterval(gameTimer);clearInterval(pointerTimer);clearPanelHide();clearTimeout(saveTimer);if(gamesReady)(await gamesReady).dispose();fs.writeFileSync(dataFile(),JSON.stringify(saved,null,2));
  if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});fs.writeFileSync(path.join(smokeOutput,'smoke.json'),JSON.stringify(report,null,2));}console.log(JSON.stringify(report.checks||report,null,2));app.exit(report.error?1:0);return;
 }
 if(inputSmoke){
  const report={cases:[]},saved=structuredClone(settings),pause=ms=>new Promise(r=>setTimeout(r,ms));
  try{
   clearInterval(timer);setPanelVisible(false);settings.fixed=true;sendState();
   await pet.webContents.executeJavaScript('for(const sprite of sprites){sprite.stopMove();sprite.stopThrow();sprite.handleEnded=()=>sprite.stopMove();}void 0;');
   const a=area();
   for(const size of [sizeLimits(a).min,saved.size])for(const place of ['top-left','top-right','middle']){
    resize(size);const center={x:place==='top-left'?a.x+size/2:place==='top-right'?a.x+a.width-size/2:a.x+a.width/2,y:place==='middle'?a.y+a.height/2:a.y+size*9/32};
    pet.webContents.send('onefish:action',{center});await pause(240);
    const view=await pet.webContents.executeJavaScript(`(()=>{const sprite=sprites[0],r=sprite.hit.getBoundingClientRect();sprite.onMouseMove({clientX:r.x+r.width/2,clientY:r.y+r.height/2});const body=sprite._interactive;sprite.onMouseMove({clientX:8,clientY:8});const blank=!sprite._interactive;sprite.dragState.active=true;sprite.onMouseMove({clientX:-100,clientY:-100});const drag=sprite._interactive;sprite.dragState.active=false;return{...window.onefishDebug.snapshot(),hoverBody:body,blankPasses:blank,dragKeepsCapture:drag};})()`);
    const bounds=pet.getBounds(),r=view.hitClient,point={x:bounds.x+r.x+r.width/2,y:bounds.y+r.y+r.height/2};
    report.cases.push({size,place,bounds,view,capturesVisibleBody:capturesPointer(point,bounds,r,false),marginPasses:!capturesPointer({x:bounds.x+8,y:bounds.y+8},bounds,r,false),dragOutside:capturesPointer({x:bounds.x-200,y:bounds.y-200},bounds,r,true),releaseOutside:!capturesPointer({x:bounds.x-200,y:bounds.y-200},bounds,r,false)});
   }
   report.checks={visibleBody:report.cases.every(c=>c.capturesVisibleBody&&c.view.hoverBody),transparentMargins:report.cases.every(c=>c.marginPasses&&c.view.blankPasses),dragCapture:report.cases.every(c=>c.dragOutside&&c.view.dragKeepsCapture),release:report.cases.every(c=>c.releaseOutside),topOffset:report.cases.filter(c=>c.place.startsWith('top')).every(c=>c.view.nativeOffset.y<0),normalSpeed:report.cases.every(c=>c.view.playbackRate===1)};
   if(Object.values(report.checks).some(v=>!v))throw new Error('点击与拖动命中区域验证失败');
  }catch(e){report.error=e.stack||String(e);}
  clearInterval(pointerTimer);clearPanelHide();clearTimeout(saveTimer);fs.writeFileSync(dataFile(),JSON.stringify(saved,null,2));
  if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});fs.writeFileSync(path.join(smokeOutput,'smoke.json'),JSON.stringify(report,null,2));}
  console.log(JSON.stringify(report.checks||report,null,2));app.exit(report.error?1:0);return;
 }
 if(movementSmoke){
  const report={},saved=structuredClone(settings);
  try{
   clearInterval(timer);setPanelVisible(false);await new Promise(r=>setTimeout(r,1000));
   report.movement=await pet.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'ui/movement-smoke.js'),'utf8'));
   report.checks={fourDirections:report.movement.directions.length===4&&report.movement.directions.every(d=>d.correctDirection),posesNotMirrored:report.movement.directions.every(d=>!d.transform),alphaVideo:report.movement.directions.every(d=>d.transparent),visible:report.movement.directions.every(d=>d.fits),fixedStops:report.movement.fixed,turnsAtLeftEdge:report.movement.edgeTurns,topPosition:report.movement.topPosition};
   if(Object.values(report.checks).some(v=>!v))throw new Error('四方向移动实际窗口验证失败');
  }catch(e){report.error=e.stack||String(e);}
  clearPanelHide();clearTimeout(saveTimer);fs.writeFileSync(dataFile(),JSON.stringify(saved,null,2));
  if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});fs.writeFileSync(path.join(smokeOutput,'smoke.json'),JSON.stringify(report,null,2));}
  console.log(JSON.stringify(report,null,2));app.exit(report.error?1:0);return;
 }
 if(pokerSmoke){
  const report={},saved=structuredClone(settings),pause=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async fn=>{for(let i=0;i<350;i++){if(await fn())return;await pause(40);}throw new Error('德州牌型窗口验收超时');};
  const shot=async name=>{if(smokeOutput){await pause(250);fs.mkdirSync(smokeOutput,{recursive:true});await fsp.writeFile(path.join(smokeOutput,name+'.png'),(await gameWindow.webContents.capturePage()).toPNG());}};
  try{
   clearInterval(timer);setPanelVisible(false);await openGames('poker');const service=await getGames();
   const originalRandom=Math.random;let firstRandom=true;try{Math.random=()=>{if(firstRandom){firstRandom=false;return .6;}return .99;};service.poker('start');}finally{Math.random=originalRandom;}
   const start=service.table.snapshot(),startTime=Date.now();gameWindow.webContents.send('onefish:games-state',service.snapshot());await pause(250);
   const mid=service.table.snapshot();report.firstWait=mid.timeline.length===start.timeline.length;
   await wait(()=>service.table.snapshot().timeline.filter(e=>e.kind==='action'&&!/^[小大]盲 /.test(e.action)).length>=2);
   report.actions=service.table.snapshot().timeline.filter(e=>e.kind==='action'&&!/^[小大]盲 /.test(e.action)).slice(0,2).map(e=>e.at);report.delay=report.actions[1]-report.actions[0];report.firstDelay=report.actions[0]-startTime;
   await wait(()=>service.table.snapshot().toAct===0);await pause(350);report.preflop=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');await shot('preflop');
   service.poker('act',{type:'allin'});await wait(()=>service.table.snapshot().status!=='playing');gameWindow.webContents.send('onefish:games-state',service.snapshot());await pause(150);
   report.settled=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');await shot('settled');
   clearInterval(gameTimer);gameTimer=null;service.dispose();
   const {createPokerView}=await import(pathToFileURL(path.join(__dirname,'core/poker-analysis.mjs')));
   const cards=text=>text.split(' ').map(c=>({r:{A:14,K:13,Q:12,J:11,T:10}[c[0]]||Number(c.slice(0,-1)),s:c.at(-1)}));
   const demo=service.table.snapshot();for(const player of demo.players){player.cards=[];player.folded=player.kind!=='human';player.isToAct=false;player.allIn=false;player.talk='';}demo.log=[];demo.status='playing';demo.street='flop';demo.board=cards('Qs Js 2d');demo.winners=[];demo.players[0].cards=cards('As Ks');demo.players[0].folded=false;
   const render=async table=>{const snapshot={...service.snapshot(),poker:createPokerView()(table)};await gameWindow.webContents.executeJavaScript('render('+JSON.stringify(snapshot)+');document.querySelector("main").scrollTop=0');await pause(120);};
   await render(demo);report.draw=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');await shot('draw');
   demo.status='hand-over';demo.street='river';demo.board=cards('3s Jh 8c 3h 2c');demo.players[0].cards=cards('Ks 7d');demo.players[3].cards=cards('3c 9s');demo.players[3].folded=false;demo.winners=[{seats:[3],amount:3274548,handName:'三条'}];
   await render(demo);report.winner=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');await shot('winner');
   demo.winners=[{seats:[0,3],amount:200,handName:'三条'},{seats:[3],amount:100,handName:'三条'}];demo.players[0].cards=cards('3d 9h');await render(demo);report.split=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');
   demo.board=[];demo.winners=[{seats:[3],amount:100,handName:'无人跟注'}];await render(demo);report.fold=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');
   gameWindow.setSize(540,680);report.narrow=await gameWindow.webContents.executeJavaScript('({fits:document.querySelector("main").scrollWidth<=document.querySelector("main").clientWidth+1,guide:document.getElementById("hand-guide").getBoundingClientRect().width})');
   report.checks={firstWait:report.firstWait,slowActions:report.firstDelay>=450&&report.delay>=450,preflop:report.preflop.madeHand.includes('底牌'),actualSettlement:report.settled.resultVisible&&report.settled.results.length>0,realDraw:report.draw.drawTarget.includes('皇家同花顺')&&report.draw.drawCards.includes('10♠')&&report.draw.bestFive===5,winnerHand:report.winner.resultText.includes('三条（3）')&&report.winner.resultTitleInView,splitAndSidePots:report.split.resultText.includes('主池')&&report.split.resultText.includes('边池 1'),foldWin:report.fold.resultText.includes('弃牌获胜'),narrowFits:report.narrow.fits,noErrors:[report.preflop,report.settled,report.draw,report.winner].every(r=>!r.error)};
   report.checks.normalWindow=!gameWindow.isAlwaysOnTop()&&!gameWindow.isVisibleOnAllWorkspaces();
   if(Object.values(report.checks).some(v=>!v))throw new Error('德州牌型实际窗口验证失败');
  }catch(e){report.error=e.stack||String(e);}
  clearInterval(gameTimer);clearPanelHide();clearTimeout(saveTimer);if(gamesReady)(await gamesReady).dispose();fs.writeFileSync(dataFile(),JSON.stringify(saved,null,2));
  if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});fs.writeFileSync(path.join(smokeOutput,'smoke.json'),JSON.stringify(report,null,2));}console.log(JSON.stringify(report.checks||report,null,2));app.exit(report.error?1:0);return;
 }
 if(gamesSmoke){
  const report={},smokeSettings=structuredClone(settings),pause=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async fn=>{for(let i=0;i<400;i++){if(await fn())return;await pause(40);}throw new Error('小游戏窗口验收超时');};
  try{
   clearInterval(timer);setPanelVisible(false);await pause(1000);
   const fake={...state(),settings:{...settings,fixed:true},sources:[{id:'codex',name:'Codex',running:true,state:'working',summary:'恢复任务气泡',activeCount:1},{id:'claude',name:'Claude Code',running:true,state:'thinking',summary:'整理项目资料',activeCount:1}],completionSeq:sample.completionSeq};
   await pet.webContents.executeJavaScript('applyOnefishState('+JSON.stringify(fake)+')');await pause(150);report.bubble=await pet.webContents.executeJavaScript('window.onefishDebug.snapshot()');
   if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});await fsp.writeFile(path.join(smokeOutput,'bubble.png'),(await pet.webContents.capturePage()).toPNG());}
   const a=area(),min=sizeLimits(a).min;resize(min);pet.webContents.send('onefish:action',{center:{x:a.x+min/2,y:a.y+min*9/32}});await pause(160);report.smallBubble=await pet.webContents.executeJavaScript('window.onefishDebug.snapshot()');report.smallBounds=pet.getBounds();report.area=a;
   if(smokeOutput)await fsp.writeFile(path.join(smokeOutput,'small-bubble.png'),(await pet.webContents.capturePage()).toPNG());
   resize(smokeSettings.size);if(smokeSettings.center)pet.webContents.send('onefish:action',{center:smokeSettings.center});
   await openGames('poker');await pause(350);const service=await getGames();
   const previousRandom=Math.random;let first=true;try{Math.random=()=>{if(first){first=false;return .6;}return .99;};service.poker('start');}finally{Math.random=previousRandom;}gameWindow.webContents.send('onefish:games-state',service.snapshot());gameWindow.hide();await pause(350);gameWindow.showInactive();await wait(async()=>service.table.snapshot().status==='playing'&&service.table.snapshot().toAct===0&&await gameWindow.webContents.executeJavaScript("!document.getElementById('fold').disabled"));
   report.poker=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');report.pokerResumed=!!gameTimer&&gameWindow.isVisible()&&report.poker.toAct===0&&!report.poker.foldDisabled;
   if(smokeOutput)await fsp.writeFile(path.join(smokeOutput,'poker.png'),(await gameWindow.webContents.capturePage()).toPNG());
   await gameWindow.webContents.executeJavaScript("document.getElementById('fold').click()");await wait(()=>service.table.snapshot().players[0].folded);report.pokerAction=true;
   await openGames('tarot');await gameWindow.webContents.executeJavaScript("document.getElementById('question').value='验证独立塔罗';document.getElementById('spread').value='three-card';document.getElementById('draw').click()");
   await wait(async()=>{const d=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');return d.readingCards===3&&d.loadedCards===3;});report.tarot=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');
   if(smokeOutput)await fsp.writeFile(path.join(smokeOutput,'tarot.png'),(await gameWindow.webContents.capturePage()).toPNG());
   await gameWindow.webContents.executeJavaScript("const art=document.getElementById('art');art.value='aquatic';art.dispatchEvent(new Event('change'))");await wait(async()=>{const d=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');return d.loadedCards===3;});report.aquatic=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()');
   gameWindow.hide();showContext({x:a.x+a.width-12,y:a.y+a.height-12});await pause(180);report.context=await context.webContents.executeJavaScript('window.onefishContextDebug()');
   if(smokeOutput)await fsp.writeFile(path.join(smokeOutput,'context.png'),(await context.webContents.capturePage()).toPNG());
   const r=report.smallBubble.bubbleRect,b=report.smallBounds;
   report.checks={workBubble:report.bubble.bubbleVisible&&report.bubble.bubbleText.includes('Codex')&&report.bubble.bubbleText.includes('Claude Code'),smallBubble:report.smallBubble.bubbleVisible,smallFitsWindow:r.x>=-.5&&r.y>=-.5&&r.x+r.width<=r.windowWidth+.5&&r.y+r.height<=r.windowHeight+.5,smallFitsScreen:b.x+r.x>=a.x-1&&b.y+r.y>=a.y-1&&b.x+r.x+r.width<=a.x+a.width+1&&b.y+r.y+r.height<=a.y+a.height+1,poker:report.poker.players===6&&report.poker.heroCards===2&&!report.poker.error,pokerAction:report.pokerAction,windowResume:report.pokerResumed,tarot:report.tarot.readingCards===3&&report.tarot.loadedCards===3&&report.tarot.spreads===4&&report.tarot.history===1&&!report.tarot.error,aquatic:report.aquatic.loadedCards===3&&!report.aquatic.error,menuGames:report.context.visibleActions.some(x=>x.includes('德州扑克'))&&report.context.visibleActions.some(x=>x.includes('塔罗牌')),menuFits:report.context.contentFits};
   if(Object.values(report.checks).some(v=>!v))throw new Error('任务气泡与小游戏验证失败');
  }catch(e){report.error=e.stack||String(e);if(gamesReady)report.failureTable=(await gamesReady).snapshot().poker;if(gameWindow&&!gameWindow.isDestroyed())report.failureWindow={visible:gameWindow.isVisible(),focused:gameWindow.isFocused(),minimized:gameWindow.isMinimized(),timer:!!gameTimer};if(gameWindow&&!gameWindow.isDestroyed())report.failureUi=await gameWindow.webContents.executeJavaScript('window.onefishGamesDebug()').catch(err=>({error:err.message}));}
  clearPanelHide();clearTimeout(saveTimer);if(gamesReady)(await gamesReady).dispose();fs.writeFileSync(dataFile(),JSON.stringify(smokeSettings,null,2));
  if(smokeOutput)fs.writeFileSync(path.join(smokeOutput,'smoke.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));app.exit(report.error?1:0);return;
 }
 if(iconSmoke){
  const report={},smokeSettings=structuredClone(settings);
  try{
   await new Promise(r=>setTimeout(r,400));report.panel=await panel.webContents.executeJavaScript('window.onefishPanelDebug()');
   if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});await fsp.writeFile(path.join(smokeOutput,'panel.png'),(await panel.webContents.capturePage()).toPNG());}
   showContext({x:area().x+area().width-12,y:area().y+area().height-12});await new Promise(r=>setTimeout(r,250));
   report.context=await context.webContents.executeJavaScript('window.onefishContextDebug()');
   const valid=icons=>icons.length===3&&icons.every(i=>i.loaded&&i.width>0);
   report.checks={panelIcons:valid(report.panel.icons),contextIcons:valid(report.context.icons),sameIcons:report.panel.icons.every(p=>report.context.icons.some(c=>c.source===p.source&&c.kind===p.kind&&c.width===p.width)),bundledIcons:report.panel.icons.every(i=>i.kind==='bundled')&&report.context.icons.every(i=>i.kind==='bundled'),distinctIcons:new Set(['codex','claude','dsh'].map(id=>fs.readFileSync(path.join(__dirname,'ui/icons',id+'.png')).toString('base64'))).size===3,panelFits:report.panel.contentFits,contextFits:report.context.contentFits};
   if(smokeOutput)await fsp.writeFile(path.join(smokeOutput,'context.png'),(await context.webContents.capturePage()).toPNG());
   if(Object.values(report.checks).some(v=>!v))throw new Error('应用图标验证失败');
  }catch(e){report.error=e.stack||String(e);}
  clearPanelHide();clearTimeout(saveTimer);fs.writeFileSync(dataFile(),JSON.stringify(smokeSettings,null,2));
  if(smokeOutput)fs.writeFileSync(path.join(smokeOutput,'smoke.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));app.exit(report.error?1:0);return;
 }
 if(panelSmoke){
  const report={},smokeSettings=structuredClone(settings);const pause=ms=>new Promise(r=>setTimeout(r,ms));
  try{
   // Keep the real test window away from the pointer while live status updates continue.
   const a=area(),cursor=screen.getCursorScreenPoint();positionPanel=()=>{};
   panel.setPosition(cursor.x<a.x+a.width/2?a.x+a.width-336:a.x+10,a.y+20);
   await pause(150);panelActivity('activity');report.initialVisible=panel.isVisible();
   if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});await fsp.writeFile(path.join(smokeOutput,'panel.png'),(await panel.webContents.capturePage()).toPNG());}
   await pause(PANEL_DISPLAY_MS+300);report.autoHidden=!panel.isVisible();
   showPanel();await pause(120);report.reopened=panel.isVisible();
   await panel.webContents.executeJavaScript("window.onefish.panelActivity('pointer-down')");
   await pause(PANEL_DISPLAY_MS+300);report.dragKeepsOpen=panel.isVisible();
   await panel.webContents.executeJavaScript("window.onefish.panelActivity('pointer-up')");
   await pause(PANEL_DISPLAY_MS+300);report.hiddenAfterRelease=!panel.isVisible();report.petStillVisible=pet.isVisible();report.pollingContinues=sample.sources.length===3;
   if(Object.values(report).some(v=>v!==true))throw new Error('面板自动收起验证失败');
  }catch(e){report.error=e.stack||String(e);}
  clearPanelHide();clearTimeout(saveTimer);fs.writeFileSync(dataFile(),JSON.stringify(smokeSettings,null,2));
  if(smokeOutput)fs.writeFileSync(path.join(smokeOutput,'smoke.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));app.exit(report.error?1:0);return;
 }
 if(smoke) {
  const report={},smokeSettings=structuredClone(settings);
  try {
   await new Promise(r=>setTimeout(r,1800));
   report.before=await pet.webContents.executeJavaScript('window.onefishDebug.snapshot()');
   const initial=settings.size,initialCenter=settings.center&&{...settings.center};resize(sizeLimits(area()).min);await new Promise(r=>setTimeout(r,250));
   report.small=await pet.webContents.executeJavaScript('window.onefishDebug.snapshot()');
   resize(sizeLimits(area()).max);await new Promise(r=>setTimeout(r,250));
   report.large=await pet.webContents.executeJavaScript('window.onefishDebug.snapshot()');
   resize(initial);if(initialCenter)pet.webContents.send('onefish:action',{center:initialCenter});await new Promise(r=>setTimeout(r,500));
   report.panel=await panel.webContents.executeJavaScript('window.onefishPanelDebug()');
   report.sources=sample.sources.map(s=>({name:s.name,state:s.state,count:s.count,active:s.activeCount}));
   report.metrics=sample.metrics;
   report.independence={appPath:app.getAppPath(),executable:process.execPath,assets:animationNames.size,trayIcon:!icon.isEmpty()};
   await panel.webContents.executeJavaScript("document.getElementById('settings').click();const range=document.getElementById('size');range.value=range.min;range.dispatchEvent(new Event('input',{bubbles:true}));");
   await new Promise(r=>setTimeout(r,180));report.slider=await panel.webContents.executeJavaScript('window.onefishPanelDebug()');
   showContext({x:area().x+area().width-12,y:area().y+area().height-12});await new Promise(r=>setTimeout(r,220));
   report.context=await context.webContents.executeJavaScript('window.onefishContextDebug()');report.contextBounds=context.getBounds();
   if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});await fsp.writeFile(path.join(smokeOutput,'context.png'),(await context.webContents.capturePage()).toPNG());}
   await context.webContents.executeJavaScript("const range=document.getElementById('size');range.value=211;range.dispatchEvent(new Event('input',{bubbles:true}));");
   await new Promise(r=>setTimeout(r,180));report.contextSlider=await pet.webContents.executeJavaScript('window.onefishDebug.snapshot()');closeContext();
   resize(initial);if(initialCenter)pet.webContents.send('onefish:action',{center:initialCenter});
   await new Promise(r=>setTimeout(r,180));
   if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});await fsp.writeFile(path.join(smokeOutput,'controls.png'),(await panel.webContents.capturePage()).toPNG());}
   await panel.webContents.executeJavaScript("document.getElementById('settings').click()");
   const fits=report.large.areas.some(a=>report.large.stage.x>=a.x-.5&&report.large.stage.y>=a.y-.5&&report.large.stage.x+report.large.stage.width<=a.x+a.width+.5&&report.large.stage.y+report.large.stage.height<=a.y+a.height+.5);
   report.checks={animation:report.before.videoWidth>0,knownAnimation:animationNames.has(report.before.animation),noErrors:!report.before.errors.length&&!report.small.errors.length&&!report.large.errors.length,minimum:report.small.size===sizeLimits(area()).min,maximum:report.large.size===sizeLimits(area()).max,largeFitsScreen:fits,threeSources:report.panel.rows.length===3,panelFits:report.panel.contentFits,controlsFit:report.slider.contentFits,contextFits:report.context.contentFits,plainSlider:!report.context.numericInput&&!/\d|px/.test(report.context.sizeText),contextSlider:report.contextSlider.size===211,slider:report.slider.size===sizeLimits(area()).min};
   clearInterval(timer);
   report.behavior=await pet.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'ui/behavior-smoke.js'),'utf8'));
   Object.assign(report.checks,{mixedGroups:new Set(report.behavior.groups.map(g=>g.group)).size===7&&report.behavior.groups.every(g=>g.videoWidth===640&&!g.loop),randomMovement:report.behavior.move,twoMeals:report.behavior.mealsStarted===2,completionWhileWorking:report.behavior.otherTaskStillWorking,restoresWork:report.behavior.afterMeal.state==='working'&&report.behavior.afterMeal.mode==='ambient'});
   if(Object.values(report.checks).some(v=>!v))throw new Error('窗口验证失败');
   if(initialCenter)pet.webContents.send('onefish:action',{center:initialCenter});
   await new Promise(r=>setTimeout(r,100));
   fs.writeFileSync(dataFile(),JSON.stringify({...settings,size:initial,center:initialCenter},null,2));
   if(smokeOutput){fs.mkdirSync(smokeOutput,{recursive:true});await fsp.writeFile(path.join(smokeOutput,'pet.png'),(await pet.webContents.capturePage()).toPNG());await fsp.writeFile(path.join(smokeOutput,'panel.png'),(await panel.webContents.capturePage()).toPNG());}
  }catch(e){report.error=e.stack||String(e);}
  fs.writeFileSync(dataFile(),JSON.stringify(smokeSettings,null,2));
  if(smokeOutput)fs.writeFileSync(path.join(smokeOutput,'smoke.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));app.exit(report.error?1:0);
 }
});
app.on('before-quit',()=>{quitting=true;onlinePoker?.dispose();clearInterval(pointerTimer);backlight?.dispose();clearInterval(gameTimer);if(gamesReady)void gamesReady.then(g=>g.dispose());clearPanelHide();clearInterval(timer);clearTimeout(saveTimer);if(settings){try{fs.mkdirSync(path.dirname(dataFile()),{recursive:true});fs.writeFileSync(dataFile(),JSON.stringify(settings,null,2));}catch{}}});
app.on('window-all-closed',()=>app.quit());
