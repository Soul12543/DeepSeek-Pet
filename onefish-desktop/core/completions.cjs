// Per-session completion signals remain independent of the selected/aggregate state.
'use strict';
const BUSY=new Set(['working','thinking','result']);
class CompletionTracker {
 constructor(){this.startedAt=null;this.seq=0;this.previous=new Map();}
 observe(sources,now=Date.now()){
  const baseline=this.startedAt===null;if(baseline)this.startedAt=now;
  const events=[];
  for(const source of sources)for(const session of source.sessions||[]){
   if(!session.sessionId)continue;
   const key=source.id+'/'+session.sessionId,prev=this.previous.get(key);
   const marks=new Set(prev?.marks||[]);let explicit=false;
   for(const event of session.completions||[]){
    const id=String(event.key);if(marks.has(id))continue;marks.add(id);
    if(!baseline&&source.running&&Number(event.at)>this.startedAt){events.push({source:source.id,sessionId:session.sessionId,key:id});explicit=true;}
   }
   if(session.completionKey){
    const id=String(session.completionKey);
    if(!marks.has(id)){marks.add(id);if(!baseline&&source.running&&session.state!=='error'&&prev&&prev.completionKey!==id){events.push({source:source.id,sessionId:session.sessionId,key:id});explicit=true;}}
   }
   // Claude's desktop heartbeat exposes busy/idle per live PID, without a turn-complete event.
   if(!baseline&&!explicit&&source.id==='claude'&&source.running&&prev?.running&&BUSY.has(prev.state)&&session.state==='idle')events.push({source:source.id,sessionId:session.sessionId,key:'idle:'+session.updatedAt});
   this.previous.set(key,{state:session.state,running:source.running,completionKey:session.completionKey,marks:new Set([...marks].slice(-64)),seenAt:now});
  }
  for(const [key,value]of this.previous)if(now-value.seenAt>3600000)this.previous.delete(key);
  this.seq+=events.length;return {completionSeq:this.seq,completionEvents:events};
 }
}
module.exports={CompletionTracker};
