/**
 * dsh-deskfish —— 桌面浮层宿主 PoC（宿主半侧）。
 *
 * 要验证的命题只有一句：**能不能在 DSH 主窗口之外，把真实的牌桌状态渲染出来。**
 *
 * 架构（刻意选未知数最少的路线）：
 *   - 牌桌逻辑直接用 dsh-holdem 导出的 createTable()，在宿主进程里自建一张桌 ——
 *     完全绕开 DSH web server 的鉴权（那条路对非渲染进程是 403）。
 *   - 用一个常驻置顶的 Electron 窗当画布。Electron 二进制复用 dsh-pet 已经下载好的
 *     ~/.dsh/electron，不额外下载。
 *   - 数据通道：宿主 spawn 子进程 → 每 500ms 往子进程 stdin 写一行 JSON 快照 →
 *     子进程转给渲染页。这条通道不经过任何 HTTP，因此没有鉴权问题。
 *
 * 刻意做的一件事：传给 createTable 的 ctx 会把 'llm' / 'agentDefaultModel' 遮蔽成
 * undefined，让 AI 走 holdem 内置的启发式决策（state.agentModel === 'heuristic'），
 * 这样 PoC 能自己打起来但**不消耗任何 token**。
 *
 * PoC 范围：只读展示。动作回传（跟注/加注）留给下一步。
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'dsh-deskfish';

/** timer 提供 ctx.timeout，holdem 的 AI 回合靠它调度。 */
export const inject = ['timer'];

const PUSH_INTERVAL_MS = 500;
const START_DELAY_MS = 1500;

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh');
}

/** 复用 dsh-pet 下载好的 Electron；找不到就返回 null（不抛，免得拖垮宿主）。 */
function findElectron() {
  const base = join(dshHome(), 'electron');
  const candidates = [
    join(base, 'Electron.app', 'Contents', 'MacOS', 'Electron'),
    join(base, 'electron', 'electron'),
    join(base, 'electron'),
  ];
  for (const file of candidates) {
    if (existsSync(file)) return file;
  }
  return null;
}

export async function apply(ctx) {
  const here = dirname(fileURLToPath(import.meta.url));
  const appDir = join(here, '..', 'electron-app');

  const electron = findElectron();
  if (!electron) {
    console.error('[deskfish] 找不到 Electron 二进制（dsh-pet 会下载到 ~/.dsh/electron），PoC 跳过');
    return;
  }
  if (!existsSync(appDir)) {
    console.error('[deskfish] 缺少 electron-app 目录:', appDir);
    return;
  }

  let createTable;
  try {
    const mod = await import('dsh-holdem');
    createTable = mod.createTable;
  } catch (err) {
    console.error('[deskfish] 导入 dsh-holdem 失败:', err && err.message);
    return;
  }
  if (typeof createTable !== 'function') {
    console.error('[deskfish] dsh-holdem 没有导出 createTable，PoC 跳过');
    return;
  }

  // 遮蔽 LLM：让 AI 走启发式，PoC 自己会打但不花 token
  // Cordis setters forward to shared services; define an own method via extend().
  const tableCtx = ctx.extend({
    get: (key, ...args) => (
      key === 'llm' || key === 'agentDefaultModel' ? undefined : ctx.get(key, ...args)
    ),
  });

  let table;
  try {
    table = createTable(tableCtx, { registerEffect: false });
  } catch (err) {
    console.error('[deskfish] createTable 失败:', err && err.stack ? err.stack : err);
    return;
  }

  // The desktop host runs Electron as Node; the helper needs GUI mode.
  const childEnv = { ...process.env };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [appDir], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: childEnv,
  });

  child.on('error', (err) => {
    console.error('[deskfish] Electron 启动失败:', err && err.message);
  });
  child.on('exit', (code, signal) => {
    console.log(`[deskfish] 桌面窗口已退出 (code=${code} signal=${signal})`);
  });
  child.stderr.on('data', (buf) => {
    const text = String(buf).trim();
    if (text) console.error('[deskfish:electron]', text.slice(0, 300));
  });

  let lastPayload = '';
  const push = () => {
    if (child.killed || !child.stdin || !child.stdin.writable) return;
    let snapshot;
    try {
      snapshot = table.snapshot();
    } catch (err) {
      return;
    }
    const line = JSON.stringify({ kind: 'snapshot', state: snapshot });
    // Keep the helper alive even while the table state is unchanged.
    const payload = line === lastPayload ? JSON.stringify({ kind: 'heartbeat' }) : line;
    lastPayload = line;
    try {
      child.stdin.write(payload + '\n');
    } catch (err) {
      /* 窗口没了就算了 */
    }
  };

  const pushTimer = setInterval(push, PUSH_INTERVAL_MS);

  // PoC 演示：开局一手，让画面有内容（启发式 AI，零 token 消耗）
  const startTimer = setTimeout(() => {
    try {
      if (table.snapshot().status === 'idle') table.start();
    } catch (err) {
      console.error('[deskfish] start() 失败:', err && err.message);
    }
    push();
  }, START_DELAY_MS);

  console.log(`[deskfish] 桌面浮层已启动: ${electron} :: ${appDir}`);

  ctx.effect(() => () => {
    clearInterval(pushTimer);
    clearTimeout(startTimer);
    try { if (table.dispose) table.dispose(); } catch (err) { /* 忽略 */ }
    try { child.stdin.end(); child.kill(); } catch (err) { /* 忽略 */ }
    console.log('[deskfish] 已停止，窗口已关闭');
  });
}
