let current=null,expanded=false,resizeTimer=null,lastHeight=0;
const $=id=>document.getElementById(id);
function fit(){const height=Math.ceil($('menu').scrollHeight)+14;if(height!==lastHeight){lastHeight=height;window.onefish.menuHeight(height);}}
function list(){if(!current)return;const query=$('search').value.trim();$('animation-list').replaceChildren(...current.animations.filter(name=>name.includes(query)).map(name=>{const b=document.createElement('button');b.textContent=name;b.onclick=()=>window.onefish.menuAction({action:'animation',name});return b;}));fit();}
function setExpanded(value){expanded=value;$('animation-browser').hidden=!value;$('animations').setAttribute('aria-expanded',String(value));$('animation-arrow').textContent=value?'⌃':'⌄';if(value)list();fit();}
$('close').onclick=()=>window.onefish.closeMenu();$('toggle-panel').onclick=()=>window.onefish.menuAction({action:'toggle-panel'});
for(const b of document.querySelectorAll('[data-source]'))b.onclick=()=>window.onefish.menuAction({action:'open',source:b.dataset.source});
for(const button of document.querySelectorAll('[data-game]'))button.onclick=()=>window.onefish.menuAction({action:'game',game:button.dataset.game});
$('size').oninput=e=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>window.onefish.resize(Number(e.target.value)),45);};
$('backlight').onchange=e=>window.onefish.menuAction({action:'backlight',value:e.target.checked});
$('fixed').onchange=e=>window.onefish.menuAction({action:'fixed',value:e.target.checked});
$('reset').onclick=()=>window.onefish.menuAction({action:'reset'});$('quit').onclick=()=>window.onefish.menuAction({action:'quit'});
$('animations').onclick=()=>setExpanded(!expanded);$('search').oninput=list;
window.addEventListener('keydown',e=>{if(e.key==='Escape')window.onefish.closeMenu();});
function render(data){current=data;$('toggle-panel').textContent=data.settings.showPanel?'收起状态面板':'显示状态面板';$('size').min=data.limits.min;$('size').max=data.limits.max;if(document.activeElement!==$('size'))$('size').value=data.settings.size;$('fixed').checked=data.settings.fixed;$('backlight').checked=data.settings.keyboardLight;$('backlight').disabled=data.backlight?.supported===false;$('backlight-label').textContent=data.backlight?.supported===false?'键盘灯效 · 不可用':'键盘灯效';fit();}
window.onefish.onState(render);window.onefish.initial().then(render);
window.onefish.onMenuOpen(()=>{lastHeight=0;setExpanded(false);$('search').value='';if(current)render(current);});
window.onefishContextDebug=()=>({icons:[...document.querySelectorAll('[data-source] img')].map(img=>({source:img.closest('[data-source]').dataset.source,loaded:img.complete&&img.naturalWidth>0,width:img.naturalWidth,kind:img.src.startsWith('data:')?'installed':'bundled'})),size:Number($('size').value),expanded,contentFits:$('menu').getBoundingClientRect().bottom<=innerHeight-3&&!($('menu').scrollHeight>$('menu').clientHeight+1),visibleActions:[...document.querySelectorAll('.action')].filter(el=>el.getBoundingClientRect().height>0).map(el=>el.textContent.trim()),sizeText:document.querySelector('.size-control').textContent.trim(),numericInput:!!document.querySelector('input[type=number]')});
