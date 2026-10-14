'use strict';
const validRect=r=>r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0;
const contains=(r,p)=>p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height;
// The hit rectangle comes from the rendered DOM, relative to the actual native
// window. This also works when macOS clamps the window below the menu bar.
function capturesPointer(point,bounds,hit,busy,visible=true){
 if(!visible)return false;
 if(busy)return true; // Preserve capture until pointerup, even outside the body.
 if(!point||![point.x,point.y].every(Number.isFinite)||!validRect(bounds)||!validRect(hit))return false;
 return contains(bounds,point)&&contains({x:bounds.x+hit.x,y:bounds.y+hit.y,width:hit.width,height:hit.height},point);
}
module.exports={capturesPointer};
