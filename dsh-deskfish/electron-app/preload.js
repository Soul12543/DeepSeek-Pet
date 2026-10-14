const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deskfish', {
  onState: (fn) => ipcRenderer.on('deskfish:state', (_event, msg) => fn(msg)),
  close: () => ipcRenderer.send('deskfish:close'),
});
