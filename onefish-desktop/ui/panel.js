let current=null,expanded=false,resizeTimer=null,lastHeight=0;
const $=id=>document.getElementById(id);
function fitPanel(){const height=Math.ceil(document.querySelector('.card').getBoundingClientRect().height)+10;if(height!==lastHeight){lastHeight=height;window.onefish.panelHeight(height);}}
function expand(value){expanded=value;$('controls').hidden=!value;fitPanel();window.onefish.panelActivity('activity');}
$('settings').onclick=()=>expand(!expanded);$('hide').onclick=()=>window.onefish.togglePanel();window.onefish.onExpand(expand);
function resize(value){clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>window.onefish.resize(Number(value)),65);}
$('size').oninput=e=>resize(e.target.value);
function render(data){
 current=data;const frag=document.createDocumentFragment();
 for(const s of data.sources){
  const row=document.createElement('button');row.className='source';row.dataset.source=s.id;row.title=s.running?(s.title+'\n'+s.summary):'点击打开 '+s.name;row.onclick=()=>window.onefish.open(s.id);
  const icon=document.createElement('img');icon.className='avatar';icon.src='icons/'+s.id+'.png';icon.alt='';icon.width=29;icon.height=29;icon.draggable=false;
  const content=document.createElement('span');content.className='content';
  const line=document.createElement('span');line.className='line';
  const name=document.createElement('span');name.className='name';name.textContent=s.name;
  const badge=document.createElement('span');badge.className='badge '+s.state;badge.textContent=s.label+(s.activeCount>1?' · '+s.activeCount:'');
  line.append(name,badge);
  const summary=document.createElement('span');summary.className='summary';summary.textContent=s.state==='unknown'?(s.running?'本地状态暂未更新':'本地进程状态暂不可用'):!s.running?'未打开 · 点击启动':s.summary||s.title||'已打开，等待任务';
  content.append(line,summary);const arrow=document.createElement('span');arrow.className='arrow';arrow.textContent='›';row.append(icon,content,arrow);frag.append(row);
 }
 $('sources').replaceChildren(frag);
 $('size').min=data.limits.min;$('size').max=data.limits.max;
 if(document.activeElement!==$('size'))$('size').value=data.settings.size;
 document.querySelector('.count').textContent=data.animations.length+' 段表情';
 $('foot').textContent='本地状态 · 点击打开应用';$('error').hidden=!data.openError;if(data.openError)$('error').textContent=data.openError;fitPanel();
}
window.onefish.onState(render);window.onefish.initial().then(render);
window.onefishPanelDebug=()=>({icons:[...document.querySelectorAll('.source img')].map(img=>({source:img.closest('.source').dataset.source,loaded:img.complete&&img.naturalWidth>0,width:img.naturalWidth,kind:img.src.startsWith('data:')?'installed':'bundled'})),rows:[...document.querySelectorAll('.source')].map(el=>({source:el.dataset.source,label:el.querySelector('.badge').textContent})),size:Number($('size').value),expanded,contentFits:document.querySelector('.card').getBoundingClientRect().bottom<=innerHeight-3});

// Count deliberate interaction, rather than periodic status rendering, as activity.
window.onefish.onPanelOpen(()=>expand(false));
const card=document.querySelector('.card');
for(const event of ['pointerenter','pointerleave'])card.addEventListener(event,()=>window.onefish.panelActivity('activity'));
card.addEventListener('pointerdown',()=>window.onefish.panelActivity('pointer-down'));
for(const event of ['pointerup','pointercancel','blur'])window.addEventListener(event,()=>window.onefish.panelActivity('pointer-up'));
window.addEventListener('keydown',()=>window.onefish.panelActivity('activity'));
