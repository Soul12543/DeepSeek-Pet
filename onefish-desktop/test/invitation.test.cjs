const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const{invitationUrl,OnlinePoker,invitedRoom,serverUrl}=require('../core/online-poker.cjs');
test('desktop shares a complete custom-server invitation with no private seat secret',()=>{
 assert.equal(invitationUrl('https://your-domain.invalid/onefish-poker','a012b345c6'),'https://your-domain.invalid/onefish-poker/?room=A012B345C6');assert.equal(invitationUrl('http://127.0.0.1:3087/custom/path/','1234567890'),'http://127.0.0.1:3087/custom/path/?room=1234567890');assert.throws(()=>invitationUrl('https://your-domain.invalid/onefish-poker',''));
 const p=new OnlinePoker('unused',{persist:false});p.configure({url:'https://your-domain.invalid/onefish-poker'});p.latest={room:{code:'A012B345C6'}};p.preferences.session={token:'seat-secret'};assert.ok(!p.invitationUrl().includes('secret'));p.dispose();
});
test('fresh installations have no server address or special device credentials; unsafe endpoints are rejected',async()=>{
 const p=new OnlinePoker('unused',{persist:false});assert.equal(p.snapshot().url,'');assert.equal(p.snapshot().canCreate,true);assert.equal(typeof p.ownerKeyFor,'undefined');await assert.rejects(p.create({name:'房主'}),/服务器地址/);assert.equal(p.socket,null);assert.equal(invitedRoom('https://your-domain.invalid/onefish-poker/?room=A012B345C6'),'A012B345C6');assert.throws(()=>invitedRoom('javascript:alert(1)'));for(const url of ['http://public.invalid','https://user:secret@example.invalid/path','https://example.invalid/path?secret=x'])assert.throws(()=>serverUrl(url));p.dispose();
});
test('updating preserves the server address the user has saved without packaging it',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'onefish-server-pref-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let first=new OnlinePoker(root);first.configure({url:'https://saved.example.invalid/poker',name:'自己的昵称'});first.dispose();const second=new OnlinePoker(root);assert.equal(second.snapshot().url,'https://saved.example.invalid/poker');assert.equal(second.snapshot().name,'自己的昵称');assert.equal(second.snapshot().canCreate,true);second.dispose();
});
