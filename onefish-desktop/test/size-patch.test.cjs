const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const {execFileSync}=require('node:child_process');const path=require('node:path');
const patch=path.resolve(__dirname,'../../dsh-pet-size-patch/apply.py');
const methods=execFileSync('/usr/bin/python3',['-c',`import runpy,sys; print(runpy.run_path(sys.argv[1])['INSERT_METHODS'])`,patch],{encoding:'utf8'});
const tick=()=>new Promise(r=>setImmediate(r));
function sprite(cfg,putStatus=200){
 const requests=[],messages=[];
 const ctx={BASE:'onefish://test',PRIMARY_AREA:{width:1440},window:{screen:{width:1440}},console:{info(){},error(){}},fetch:async(url,opts={})=>{requests.push(opts);return opts.method==='PUT'?{ok:putStatus===200,status:putStatus}:{ok:true,json:async()=>cfg};}};
 const pet=vm.runInNewContext(`new (class { constructor(){this.pet={id:'main',size:462};} ${methods} })()`,ctx);
 pet.showWhisper=m=>messages.push(m);return {pet,requests,messages};
}
test('the old size patch reads main.pets and preserves sibling pets',async()=>{
 const {pet,requests,messages}=sprite({main:{pets:[{id:'main',size:462,name:'鱼'},{id:'second',size:200,name:'伙伴'}]}});pet.applyPetSize(1);await tick();
 const body=JSON.parse(requests.find(r=>r.method==='PUT').body);assert.equal(body.pets.length,2);assert.equal(body.pets[0].size,72);assert.equal(body.pets[1].size,200);assert.equal(messages.length,0);
});
test('missing pets never sends an empty overwrite',async()=>{const s=sprite({main:{pets:[]}});s.pet.applyPetSize(120);await tick();assert.equal(s.requests.length,1);assert.equal(s.messages.length,1);});
test('failed saving becomes a visible error',async()=>{const s=sprite({main:{pets:[{id:'main',size:462}]}},403);s.pet.applyPetSize(120);await tick();assert.equal(s.messages.length,1);});
