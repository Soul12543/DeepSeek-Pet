// Invitations identify a room, never a seat. Keep private resume tokens out of links.
export function parseRoom(value){
 const text=String(value||'').trim();
 if(/^[a-f0-9]{10}$/i.test(text))return text.toUpperCase();
 const legacy=text.match(/房间码\s*[:：]\s*([a-f0-9]{10})(?![a-f0-9])/i);
 if(legacy)return legacy[1].toUpperCase();
 try{const url=new URL(text);if(!['https:','http:'].includes(url.protocol))return '';const code=url.searchParams.get('room');return /^[a-f0-9]{10}$/i.test(code||'')?code.toUpperCase():'';}catch{return '';}
}
export function roomLink(code,base){
 if(!/^[a-f0-9]{10}$/i.test(code))throw new Error('请输入有效的房间码或邀请内容');
 const url=new URL(base);url.search='';url.hash='';url.searchParams.set('room',code.toUpperCase());return url.href;
}
