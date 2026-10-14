// Cardinal movement over one visible work area; independent of animation facing.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OneFishMovement=api;})(typeof globalThis==='object'?globalThis:this,function(){
 const vectors={left:{x:-1,y:0},right:{x:1,y:0},up:{x:0,y:-1},down:{x:0,y:1}};
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 function plan({cx,cy,width,height,bottomPad=0,areas,minDist=40,maxDist=160,preferred=null,lastDirection=null,allowed=Object.keys(vectors),random=Math.random}){
  const rects=areas.filter(a=>a.width>=width&&a.height>=height+bottomPad).map(a=>({left:a.x+width/2,right:a.x+a.width-width/2,top:a.y+height/2,bottom:a.y+a.height-height/2-bottomPad}));
  if(!rects.length)return null;
  const r=rects.reduce((best,a)=>{const d=Math.hypot(cx-clamp(cx,a.left,a.right),cy-clamp(cy,a.top,a.bottom));return !best||d<best.d?{...a,d}:best;},null);
  const start={x:clamp(cx,r.left,r.right),y:clamp(cy,r.top,r.bottom)};
  const room={left:start.x-r.left,right:r.right-start.x,up:start.y-r.top,down:r.bottom-start.y};
  let candidates=allowed.filter(d=>vectors[d]&&room[d]>=2);
  if(!candidates.length)return null;
  let direction;
  if(preferred){if(!candidates.includes(preferred))return null;direction=preferred;}
  else{const others=candidates.filter(d=>d!==lastDirection);if(others.length)candidates=others;direction=candidates[Math.min(candidates.length-1,Math.floor(random()*candidates.length))];}
  const max=Math.min(room[direction],Math.max(2,maxDist)),min=Math.min(max,Math.max(2,minDist));
  const distance=min+(max-min)*random(),v=vectors[direction];
  return {direction,start,target:{x:start.x+v.x*distance,y:start.y+v.y*distance},distance};
 }
 function directionOf(animations,name){return animations.moves?.actions?.find(a=>a.name===name)?.direction||null;}
 function animationFor(animations,direction){return animations.moves?.actions?.find(a=>a.direction===direction)?.name||null;}
 return {vectors,plan,directionOf,animationFor};
});
