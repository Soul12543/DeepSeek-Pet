(async()=>{
 const wait=async fn=>{for(let i=0;i<120;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw new Error('联机界面没有更新');};
 document.getElementById('online-mode').click();await wait(()=>state?.online?.mode==='online');
 document.getElementById('online-server').value=__testServer;
 document.getElementById('online-name').value='验收 Mac';
 await new Promise(r=>setTimeout(r,600));
 const draftPreserved=document.getElementById('online-name').value==='验收 Mac'&&document.getElementById('online-server').value===__testServer;
 document.getElementById('create-room').click();await wait(()=>state?.online?.room);
 return{draftPreserved,online:state.online.mode==='online',code:state.online.room.code,lobbyVisible:!document.getElementById('online-lobby').hidden,error:document.getElementById('error').hidden?null:document.getElementById('error').textContent};
})();
