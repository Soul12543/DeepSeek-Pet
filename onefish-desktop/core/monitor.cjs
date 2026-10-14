// Bounded, read-only inspection of locally installed harnesses.
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { reduceCodex, claudeSession, dshSession, sourceView, text } = require('./model.cjs');
async function walk(root, suffix, depth = 5) {
  let entries; try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return []; }
  const children = await Promise.all(entries.map(async e => {
    const name = path.join(root, e.name);
    if (e.isDirectory() && depth > 0) return walk(name, suffix, depth - 1);
    if (!e.isFile() || !e.name.endsWith(suffix)) return [];
    try { const st = await fs.stat(name); return [{ path: name, mtime: st.mtimeMs, size: st.size }]; } catch { return []; }
  }));
  return children.flat();
}
async function json(file, maxBytes = 2 * 1024 * 1024) { try { if ((await fs.stat(file)).size > maxBytes) return null; return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; } }
async function lines(file, budget = 512 * 1024, head = false) {
  let f; try {
    f = await fs.open(file, 'r'); const st = await f.stat();
    const start = head ? 0 : Math.max(0, st.size - budget);
    const buf = Buffer.alloc(Math.min(budget, st.size)); const { bytesRead } = await f.read(buf, 0, buf.length, start);
    const rows = buf.subarray(0, bytesRead).toString('utf8').split('\n'); if (start > 0) rows.shift();
    return rows.flatMap(row => { try { return [JSON.parse(row)]; } catch { return []; } });
  } catch { return []; } finally { await f?.close(); }
}
function windowsProcesses(csv){return csv.split('\n').flatMap(line=>{const match=line.trim().match(/^"([^"]+)","([0-9]+)"/);return match?[match[2]+' '+match[1]]:[];}).join('\n');}
class Monitor {
  constructor({ home = os.homedir(), now = () => Date.now(), processes } = {}) {
    this.home = home; this.now = now; this.processes = processes || (async () => {
      const options={timeout:3000,maxBuffer:2*1024*1024,windowsHide:true};
      if(process.platform==='win32'){const result=await run('tasklist',['/FO','CSV','/NH'],options);return windowsProcesses(result.stdout);}
      return(await run('/bin/ps',['-axo','pid=,comm='],options)).stdout;
    });
    this.index = null; this.indexAt = 0; this.codexCache = new Map(); this.metrics = { scans: 0, polls: 0, lastPollMs: 0 }; this.inflight = null;
  }
  async refreshIndex() {
    const h = this.home;
    const [codex, claude, dsh, names] = await Promise.all([
      walk(path.join(h, '.codex/sessions'), '.jsonl', 4),
      walk(process.platform==='win32'?path.join(process.env.APPDATA||path.join(h,'AppData/Roaming'),'Claude/claude-code-sessions'):path.join(h,'Library/Application Support/Claude/claude-code-sessions'),'.json',3),
      walk(path.join(h, '.dsh/storages/session_projcache/sessions'), '.json', 1),
      lines(path.join(h, '.codex/session_index.jsonl'), 1024 * 1024),
    ]);
    this.index = { codex: codex.sort((a,b) => b.mtime-a.mtime).slice(0,24), claude, dsh: dsh.sort((a,b) => b.mtime-a.mtime).slice(0,16), names: new Map(names.map(n => [n.id, text(n.thread_name)])) };
    const retained = new Set(this.index.codex.map(f=>f.path)); for (const key of this.codexCache.keys()) if (!retained.has(key)) this.codexCache.delete(key);
    this.indexAt = this.now(); this.metrics.scans++;
  }
  async codex() {
    const out = await Promise.all(this.index.codex.map(async file => {
      let st; try { st = await fs.stat(file.path); } catch { return null; }
      const prev = this.codexCache.get(file.path); if (prev?.size === st.size && prev?.mtime === st.mtimeMs) return prev.session;
      const [head, tail] = await Promise.all([lines(file.path, 128 * 1024, true), lines(file.path)]);
      const meta = head.find(r=>r.type==='session_meta')?.payload;
      // Reviewers/subagents share the folder; the desktop pet summarizes human chats only.
      if (!meta || JSON.stringify(meta.source).includes('subagent') || /review|guardian/.test(String(meta.originator || ''))) return null;
      const state = reduceCodex(tail, reduceCodex(head.slice(0, 12)));
      const title = this.index.names.get(meta.id || meta.session_id) || path.basename(meta.cwd || '') || 'Codex 会话';
      const session = { ...state, title, summary: state.summary || title, source: '本地任务事件' };
      this.codexCache.set(file.path, { size: st.size, mtime: st.mtimeMs, session }); return session;
    })); return out.filter(Boolean);
  }
  async claude(pids) {
    const root = path.join(this.home, '.claude/sessions'); const files = await walk(root, '.json', 0);
    const raw = await Promise.all(files.map(f=>json(f.path, 64*1024)));
    const valid = raw.filter(v=>v && pids.has(Number(v.pid)) && v.entrypoint==='claude-desktop');
    const metadata = await Promise.all(this.index.claude.map(f=>json(f.path, 256*1024)));
    const titles = new Map(metadata.filter(v=>v&&!v.isArchived).map(v=>[v.cliSessionId||v.sessionId, v.title]));
    return valid.map(v=>claudeSession(v,pids,titles.get(v.sessionId))).filter(Boolean);
  }
  async dsh() { return (await Promise.all(this.index.dsh.map(async file=>{ try { const st = await fs.stat(file.path); const session=dshSession(await json(file.path),st.mtimeMs);return session?{...session,sessionId:path.basename(file.path,'.json')}:null; } catch { return null; } }))).filter(Boolean); }
  async poll() {
    if (this.inflight) return this.inflight;
    this.inflight = this.sample().finally(()=>{this.inflight=null;}); return this.inflight;
  }
  async sample() {
    const started = performance.now();
    if (!this.index || this.now()-this.indexAt >= 15_000) await this.refreshIndex();
    let processText = ''; let processError = false;
    try { processText = await this.processes(); } catch { processError = true; }
    const pids = new Set(processText.split('\n').map(line=>Number(line.trim().split(/\s+/)[0])).filter(Number.isFinite));
    const [codex,claude,dsh] = await Promise.all([this.codex(),this.claude(pids),this.dsh()]);
    const now = this.now();
    const sources = [
      sourceView('codex','Codex',codex,/\/Codex[^/]* (?:Framework|\(Renderer\))|\/codex-cli\/CodexCLI\.app\/|\/Codex\.app\/|\b(?:Codex|ChatGPT)\.exe\b/i.test(processText),now),
      sourceView('claude','Claude Code',claude,/\/Claude\.app\/Contents\/MacOS\/Claude|\bClaude\.exe\b/i.test(processText)||claude.length>0,now,Infinity),
      sourceView('dsh','DSH',dsh,/\/DSH NEXT\.app\/|\/DeepSeek[^/]*\.app\/|\/dsh(?:\.js)?(?:\s|$)|deepseek-harness|\b(?:dsh|DSH NEXT|deepseek-harness)\.exe\b/i.test(processText),now),
    ];
    if (processError) for (const s of sources) { s.state='unknown';s.label='无法读取进程';s.running=false;s.activeCount=0; }
    this.metrics.polls++; this.metrics.lastPollMs=Math.round(performance.now()-started);
    return { sources, sampledAt:now, metrics:{...this.metrics} };
  }
}
module.exports = { Monitor, walk, json, lines, windowsProcesses };
