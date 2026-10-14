// Bubble text is independent of the automatic animation playlist.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OneFishBubbles=api;})(globalThis,function(){
 const labels={waiting:'等你确认',working:'工作中',thinking:'思考中',result:'整理中',error:'出错了'};
 const priority={waiting:5,error:4,working:3,thinking:2,result:1};
 const short=(value,n)=>{const chars=Array.from(String(value||'').replace(/\s+/g,' ').trim());return chars.length>n?chars.slice(0,n-1).join('')+'…':chars.join('');};
 function work(sources){
  const active=sources.filter(s=>s.running&&labels[s.state]).sort((a,b)=>priority[b.state]-priority[a.state]).slice(0,3);
  return active.map(s=>{const head=(s.name||s.id)+' · '+labels[s.state]+(s.activeCount>1?'（'+s.activeCount+'项）':'');const detail=short(s.summary||s.title,active.length===1?42:15);return head+(detail?(active.length===1?'\n':' · ')+detail:'');}).join('\n');
 }
 function completed(next,count){const events=next.completionEvents||[];if(events.length===1){const e=events[0],s=next.sources.find(s=>s.id===e.source),session=s?.sessions?.find(s=>s.sessionId===e.sessionId);return (s?.name||e.source)+' · 已完成'+(session?.title?'\n'+short(session.title,38):'');}return count>1?'已完成 '+count+' 项任务':'任务已完成';}
 return {work,completed};
});
