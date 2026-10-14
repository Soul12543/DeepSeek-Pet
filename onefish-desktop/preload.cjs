const { contextBridge, ipcRenderer } = require('electron');
const subscribe=(channel,fn)=>{const listener=(_e,data)=>fn(data);ipcRenderer.on(channel,listener);return()=>ipcRenderer.removeListener(channel,listener);};
contextBridge.exposeInMainWorld('onefish',{
 initial:()=>ipcRenderer.invoke('onefish:initial'),
 onState:fn=>subscribe('onefish:state',fn),
 onAction:fn=>subscribe('onefish:action',fn),
 onExpand:fn=>subscribe('onefish:expand',fn),
 onPanelOpen:fn=>subscribe('onefish:panel-open',fn),
 panelActivity:action=>ipcRenderer.send('onefish:panel-activity',action),
 onMenuOpen:fn=>subscribe('onefish:menu-open',fn),
 closeMenu:()=>ipcRenderer.send('onefish:menu-close'),
 menuHeight:h=>ipcRenderer.send('onefish:menu-height',h),
 menuAction:action=>ipcRenderer.send('onefish:menu-action',action),
 resize:size=>ipcRenderer.invoke('onefish:resize',size),
 open:id=>ipcRenderer.send('onefish:open',id),
 togglePanel:()=>ipcRenderer.send('onefish:toggle-panel'),
 menu:()=>ipcRenderer.send('onefish:menu'),
 panelHeight:h=>ipcRenderer.send('onefish:panel-height',h)
});
contextBridge.exposeInMainWorld('petBridge',{
 setBounds:(x,y,width,height,boxX,boxY,size,bottomPad,vx,vy)=>ipcRenderer.send('pet:set-bounds',{x,y,width,height,boxX,boxY,size,bottomPad,vx,vy}),
 setHitRect:rect=>ipcRenderer.send('pet:hit-rect',rect),
 setInteractive:value=>ipcRenderer.send('pet:set-interactive',value),
 setInputBusy:value=>ipcRenderer.send('pet:input-busy',value),
 onDisplays:fn=>subscribe('pet:displays',fn),
 reportFlight:()=>{},reportCollide:()=>{},onFlightStates:()=>()=>{},onPetHit:()=>()=>{},
 openDshSite:()=>ipcRenderer.send('onefish:open','dsh')
});

contextBridge.exposeInMainWorld('onefishGames',{
 initial:()=>ipcRenderer.invoke('onefish:game-initial'),
 action:args=>ipcRenderer.invoke('onefish:game-action',args),
 copyReading:()=>ipcRenderer.invoke('onefish:copy-reading'),
 close:()=>ipcRenderer.send('onefish:close-games'),
 onState:fn=>subscribe('onefish:games-state',fn),
 onTab:fn=>subscribe('onefish:game-tab',fn)
});
