/**
 * dsh-deskfish 的桌面宿主窗（Electron 主进程）。
 *
 * 职责：
 *   1. 开一个透明、无边框、常驻置顶的小窗（DSH 主窗口之外）；
 *   2. 从 stdin 读宿主推来的 JSON 行（快照），转给渲染进程；
 *   3. 宿主消失/长时间无心跳时自行退出，避免留下孤儿窗口。
 *
 * 这条 stdin 通道就是 dsh-pet 桌面端用的那套思路：宿主 spawn 本进程 → 写 stdin →
 * 这里读出来。全程不经过 DSH 的 web server，因此不受「Browser access is disabled」限制。
 */
const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('node:path');

const HEARTBEAT_TIMEOUT_MS = 15000;

let win = null;
let lastBeat = Date.now();
let watchdog = null;

function createWindow() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const width = 400;
  const height = 560;

  win = new BrowserWindow({
    width,
    height,
    x: Math.max(0, area.width - width - 28),
    y: Math.max(0, area.height - height - 80),
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // floating 层级：压在普通窗口之上，但不抢全屏应用的焦点
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'index.html'));

  win.on('closed', () => { win = null; });
}

function send(msg) {
  if (win && !win.isDestroyed()) win.webContents.send('deskfish:state', msg);
}

app.whenReady().then(() => {
  createWindow();

  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      if (!line.trim()) continue;
      lastBeat = Date.now();
      try {
        send(JSON.parse(line));
      } catch (err) {
        // 坏行直接丢，不能让宿主把窗口搞崩
      }
    }
  });
  process.stdin.on('end', () => app.quit());
  process.stdin.resume();

  ipcMain.on('deskfish:close', () => app.quit());
  ipcMain.on('deskfish:ping', () => { lastBeat = Date.now(); });

  watchdog = setInterval(() => {
    if (Date.now() - lastBeat > HEARTBEAT_TIMEOUT_MS) app.quit();
  }, 3000);
});

app.on('window-all-closed', () => {
  if (watchdog) clearInterval(watchdog);
  app.quit();
});
