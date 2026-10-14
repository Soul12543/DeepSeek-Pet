// Preserve native select popups and button identity between state updates.
(function(root){
 const signatures=new WeakMap(),pending=new WeakMap();
 function applyOptions(select,items){const selected=select.value,doc=select.ownerDocument;select.replaceChildren(...items.map(item=>{const option=doc.createElement('option');option.value=item.id;option.textContent=item.name;return option;}));if(items.some(item=>item.id===selected))select.value=selected;signatures.set(select,JSON.stringify(items));}
 function options(select,items){const key=JSON.stringify(items);if(signatures.get(select)===key)return false;
  if(select.ownerDocument.activeElement===select&&select.options.length){if(!pending.has(select))select.addEventListener('blur',()=>{const next=pending.get(select);pending.delete(select);if(next)applyOptions(select,next);},{once:true});pending.set(select,items);return false;}
  applyOptions(select,items);return true;
 }
 function list(container,key,build){key=JSON.stringify(key);if(signatures.get(container)===key)return false;const nodes=build();container.replaceChildren(...nodes);signatures.set(container,key);return true;}
 const api={options,list};if(typeof module==='object'&&module.exports)module.exports=api;else root.OneFishControls=api;
})(typeof globalThis==='object'?globalThis:this);
