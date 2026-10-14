// Native status adapters. No model requests or credentials are used.
'use strict';
const STATES = { offline: '未打开', idle: '空闲', thinking: '思考中', working: '工作中', result: '整理中', waiting: '等你确认', success: '已完成', error: '出错了', unknown: '状态未更新' };
const PRIORITY = { waiting: 70, working: 60, thinking: 50, result: 40, error: 30, success: 20, idle: 10, unknown: 5, offline: 0 };
const ACTIVE = new Set(['working', 'thinking', 'result', 'waiting']);
function text(value, limit = 100) {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).slice(0, limit).join('');
}
function stamp(value, fallback = 0) { const n = typeof value === 'number' ? value : Date.parse(value); return Number.isFinite(n) ? n : fallback; }
function choose(sessions) {
  return [...sessions].sort((a, b) => (PRIORITY[b.state] ?? 0) - (PRIORITY[a.state] ?? 0) || b.updatedAt - a.updatedAt)[0];
}
function reduceCodex(records, initial = {}) {
  const out = { state: 'unknown', summary: '', updatedAt: 0, sessionId: '', ...initial, completions:[...(initial.completions||[])] };
  for (const rec of records) {
    const p = rec.payload || {};
    const time = stamp(rec.timestamp, out.updatedAt);
    if (rec.type === 'session_meta') { out.sessionId = p.id || p.session_id || ''; out.origin = p.originator; out.source = p.source; }
    if (p.type === 'user_message' && p.message && !p.message.startsWith('<') && !p.message.startsWith('# AGENTS')) out.summary = text(p.message);
    if (p.type === 'task_started') { out.state = 'thinking'; out.updatedAt = time; }
    if (p.type === 'task_complete') { out.state = 'success'; out.updatedAt = time; const key=String(p.turn_id||p.task_id||time);if(!out.completions.some(e=>e.key===key))out.completions.push({key,at:time});out.completions=out.completions.slice(-32); }
    if (['turn_aborted', 'task_aborted', 'turn_interrupted'].includes(p.type)) { out.state = 'idle'; out.updatedAt = time; }
    if (['error', 'task_failed'].includes(p.type)) { out.state = 'error'; out.updatedAt = time; }
    if (p.type === 'approval_requested') { out.state = 'waiting'; out.updatedAt = time; }
    const item = p.item || p;
    const kind = item.type || '';
    if (['function_call', 'custom_tool_call', 'mcp_tool_call', 'tool_call'].includes(kind)) {
      const name = item.name || item.tool || '';
      out.state = /request_user_input|ask_user_question/.test(name) ? 'waiting' : 'working';
      out.updatedAt = time;
      if (name === 'update_plan') {
        try { const arg = typeof item.arguments === 'string' ? JSON.parse(item.arguments) : item.arguments; const step = arg?.plan?.findLast(x => x.status === 'in_progress'); if (step) out.summary = text(step.step); } catch {}
      }
    }
    if (['function_call_output', 'custom_tool_call_output', 'mcp_tool_call_result'].includes(kind) && out.state !== 'waiting') { out.state = 'thinking'; out.updatedAt = time; }
    if (item.type === 'message' && item.role === 'assistant' && item.phase === 'final_answer') { out.state = 'success'; out.updatedAt = time; }
    if (p.type === 'user_message' && out.state === 'waiting') { out.state = 'thinking'; out.updatedAt = time; }
  }
  return out;
}
function claudeSession(raw, livePids, title = '') {
  if (!raw || !livePids.has(Number(raw.pid)) || raw.entrypoint !== 'claude-desktop') return null;
  const map = { busy: 'working', working: 'working', idle: 'idle', waiting: 'waiting', 'waiting-for-user': 'waiting', 'waiting_for_permission': 'waiting', error: 'error', stopped: 'idle' };
  return { sessionId: raw.sessionId, title: text(title || raw.name || 'Claude 会话'), summary: text(raw.name || title), state: map[raw.status] || 'unknown', updatedAt: stamp(raw.statusUpdatedAt, stamp(raw.updatedAt)), source: '本地实时会话' };
}
function dshSession(raw, updatedAt) {
  const rows = raw?.record?.rows;
  if (!rows) return null;
  const val = key => rows[key]?.val;
  const questions = val('userQuestions');
  const stats = val('sessionStats');
  const boundary = val('turnBoundary');
  const approvals = val('approvals');
  let state = 'idle';
  if (boundary?.openTurnStartSeq != null) state = stats?.openStep || Object.keys(stats?.pendingCalls || {}).length ? 'working' : 'thinking';
  if (questions?.questions?.active?.length || approvals?.pending?.length) state = 'waiting';
  const goal = val('goal');
  if (goal?.failure) state = 'error';
  const outline = val('turnOutline');
  const recent = outline?.turns?.at(-1);
  return { state, completionKey:recent?.response ? String(recent.turn)+':'+String(recent.seq) : null, title: text(val('title') || 'DSH 会话'), summary: text(goal?.current?.goal?.objective || recent?.prompt || ''), updatedAt, source: '本地会话缓存' };
}
function sourceView(id, name, sessions, running, now = Date.now(), freshnessMs = 20 * 60 * 1000) {
  const normalized = sessions.map(s => {
    const next = { ...s };
    if (ACTIVE.has(next.state) && now - next.updatedAt > freshnessMs) { next.state = 'unknown'; next.stale = true; }
    if (next.state === 'success' && now - next.updatedAt > 30_000) next.state = 'idle';
    return next;
  });
  const selected = choose(normalized);
  const view = { id, name, running, state: running ? selected?.state || 'idle' : 'offline', summary: selected?.summary || selected?.title || '', title: selected?.title || '', updatedAt: selected?.updatedAt || 0, sessionId: selected?.sessionId || '', source: selected?.source || '本地记录', count: normalized.length, activeCount: normalized.filter(s => ACTIVE.has(s.state)).length, sessions: normalized };
  view.label = STATES[view.state];
  if (!running) view.activeCount = 0;
  return view;
}
function sizeLimits(area) { const width = Math.max(320, Number(area.width) || 1440); return { basis: width, min: Math.round(width / 20), max: Math.round(width * .6), step: Math.max(1, Math.round(width / 100)) }; }
function clampSize(value, area) { const b = sizeLimits(area); const n = Number(value); return Math.round(Math.min(b.max, Math.max(b.min, Number.isFinite(n) ? n : area.width / 8))); }
function clampPanel(x, y, width, height, area) { return { x: Math.round(Math.min(area.x + area.width - width, Math.max(area.x, x))), y: Math.round(Math.min(area.y + area.height - height, Math.max(area.y, y))) }; }
function popupBounds(point,width,height,area) {
  const gap=8,w=Math.min(width,area.width-gap*2),h=Math.min(height,area.height-gap*2);
  const limits={x:area.x+gap,y:area.y+gap,width:area.width-gap*2,height:area.height-gap*2};
  const y=point.y+h>area.y+area.height-gap?point.y-h:point.y;
  return {...clampPanel(point.x,y,w,h,limits),width:w,height:h};
}
function aggregate(sources) { return choose(sources.filter(s => s.running && s.state !== 'unknown')); }
module.exports = { STATES, PRIORITY, ACTIVE, text, stamp, choose, reduceCodex, claudeSession, dshSession, sourceView, sizeLimits, clampSize, clampPanel, popupBounds, aggregate };
