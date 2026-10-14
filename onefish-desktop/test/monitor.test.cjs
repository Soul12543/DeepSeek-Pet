const test=require('node:test');const assert=require('node:assert/strict');
const {Monitor}=require('../core/monitor.cjs');
test('the software still works when DSH and all harness data folders are absent',async()=>{
 const monitor=new Monitor({home:'/onefish-test-missing-home',processes:async()=>''});
 const out=await monitor.poll();assert.equal(out.sources.length,3);assert.ok(out.sources.every(s=>s.state==='offline'));assert.equal(out.metrics.polls,1);
});
test('Codex and Claude can be opened without any DSH data or process',async()=>{
 const monitor=new Monitor({home:'/onefish-test-missing-home',processes:async()=>`123 /Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex
124 /Applications/Claude.app/Contents/MacOS/Claude`});
 const out=await monitor.poll();assert.deepEqual(out.sources.map(s=>[s.id,s.running]),[['codex',true],['claude',true],['dsh',false]]);
});
test('process inspection failures are reported as unknown',async()=>{
 const monitor=new Monitor({home:'/onefish-test-missing-home',processes:async()=>{throw new Error('unavailable')}});
 const out=await monitor.poll();assert.ok(out.sources.every(s=>s.state==='unknown'&&s.activeCount===0));
});
