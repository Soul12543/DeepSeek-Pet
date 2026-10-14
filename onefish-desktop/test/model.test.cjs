const test=require('node:test');const assert=require('node:assert/strict');
const {reduceCodex,claudeSession,dshSession,sourceView,aggregate,clampSize,clampPanel,popupBounds,text}=require('../core/model.cjs');
const e=(type,time=1000,extra={})=>({timestamp:time,payload:{type,...extra}});
test('Codex finishes a tool-heavy task without keeping the working state',()=>{
 const s=reduceCodex([e('task_started'),e('function_call',1200,{name:'exec_command'}),e('function_call_output',1400),e('task_complete',1800)]);assert.equal(s.state,'success');assert.equal(s.updatedAt,1800);
});
test('a request for user input remains waiting until a reply',()=>{
 let s=reduceCodex([e('task_started'),e('function_call',2000,{name:'request_user_input_async'}),e('function_call_output',2500)]);assert.equal(s.state,'waiting');
 s=reduceCodex([e('user_message',3000,{message:'显示工作状态'})],s);assert.equal(s.state,'thinking');
});
test('interruptions clear working instead of freezing the pet',()=>assert.equal(reduceCodex([e('task_started'),e('turn_aborted')]).state,'idle'));
test('Claude uses live desktop PID and never displays dead sessions as active',()=>{
 const s={pid:7,sessionId:'a',entrypoint:'claude-desktop',status:'busy',name:'任务',statusUpdatedAt:100};assert.equal(claudeSession(s,new Set([7])).state,'working');assert.equal(claudeSession(s,new Set()),null);assert.equal(claudeSession({...s,entrypoint:'cli'},new Set([7])),null);
});
test('DSH pending questions override an active working turn',()=>{
 const val=v=>({val:v});const raw={record:{rows:{title:val('任务'),turnBoundary:val({openTurnStartSeq:1}),sessionStats:val({pendingCalls:{a:{}}}),userQuestions:val({questions:{active:[{}]}})}}};assert.equal(dshSession(raw,1000).state,'waiting');raw.record.rows.userQuestions=val({questions:{active:[]}});assert.equal(dshSession(raw,1000).state,'working');
});
test('offline apps never keep old working sessions active',()=>{
 const s=sourceView('dsh','DSH',[{state:'working',updatedAt:100}],false,200);assert.equal(s.state,'offline');assert.equal(s.activeCount,0);
});
test('old uncompleted logs become unknown rather than pretending work is still happening',()=>{
 const s=sourceView('codex','Codex',[{state:'working',updatedAt:0}],true,2000,1000);assert.equal(s.state,'unknown');assert.equal(s.activeCount,0);
});
test('all apps remain separate; a completion cannot override another active app',()=>{
 const sources=[{id:'codex',state:'success',running:true},{id:'claude',state:'working',running:true},{id:'dsh',state:'offline',running:false}];assert.equal(aggregate(sources).id,'claude');assert.equal(sources.length,3);
});
test('minimum is exactly screen width / 20 and invalid sizes are clamped',()=>{
 const a={width:1440};assert.equal(clampSize(1,a),72);assert.equal(clampSize(10000,a),864);assert.equal(clampSize(NaN,a),180);assert.equal(clampSize(211,a),211);
});
test('status card respects screens with negative coordinates',()=>assert.deepEqual(clampPanel(-2500,2000,326,234,{x:-1920,y:0,width:1920,height:1080}),{x:-1920,y:846}));
test('task summaries are plain text and truncate emoji by codepoint',()=>assert.equal(text('<b>🐟🐟🐟</b>',2),'🐟🐟'));

test('right-click menu uses the whole screen and flips above a bottom-edge click',()=>{
 const a={x:0,y:33,width:1470,height:923};const b=popupBounds({x:1458,y:944},294,360,a);assert.equal(b.height,360);assert.ok(b.x>=a.x&&b.y>=a.y);assert.ok(b.x+b.width<=a.x+a.width&&b.y+b.height<=a.y+a.height);
});
test('right-click menu fits a display with negative coordinates',()=>{
 const a={x:-1920,y:-1080,width:1920,height:1080};const b=popupBounds({x:-20,y:-20},294,360,a);assert.equal(b.height,360);assert.ok(b.x>=a.x&&b.y>=a.y);assert.ok(b.x+b.width<=0&&b.y+b.height<=0);
});
