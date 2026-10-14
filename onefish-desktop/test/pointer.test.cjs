const test=require('node:test');const assert=require('node:assert/strict');
const {capturesPointer}=require('../core/pointer.cjs');
test('body hit stays selectable when macOS pins the native window below the menu bar',()=>{
 const bounds={x:-123,y:33,width:688,height:554},hit={x:279.5,y:104,width:129,height:153};
 assert.equal(capturesPointer({x:221,y:191},bounds,hit,false),true);
 assert.equal(capturesPointer({x:221,y:80},bounds,hit,false),false);
 assert.equal(capturesPointer({x:450,y:191},bounds,hit,false),false);
});
test('a stationary pointer becomes interactive when a roaming body arrives beneath it',()=>{
 const point={x:200,y:200},hit={x:40,y:30,width:100,height:100};
 assert.equal(capturesPointer(point,{x:0,y:100,width:400,height:400},hit,false),false);
 assert.equal(capturesPointer(point,{x:100,y:100,width:400,height:400},hit,false),true);
 assert.equal(capturesPointer(point,{x:300,y:100,width:400,height:400},hit,false),false);
});
test('drag capture survives leaving the body and is released on pointerup',()=>{
 const bounds={x:0,y:33,width:400,height:400},hit={x:150,y:50,width:60,height:70},point={x:900,y:800};
 assert.equal(capturesPointer(point,bounds,hit,true),true);
 assert.equal(capturesPointer(point,bounds,hit,false),false);
 assert.equal(capturesPointer(point,bounds,hit,true,false),false);
});
test('negative monitor coordinates and native clipping do not turn transparent margins into buttons',()=>{
 const bounds={x:-1200,y:-300,width:400,height:400},hit={x:100,y:-30,width:100,height:150};
 assert.equal(capturesPointer({x:-1050,y:-280},bounds,hit,false),true);
 assert.equal(capturesPointer({x:-1050,y:-310},bounds,hit,false),false);
 assert.equal(capturesPointer({x:-1150,y:-280},bounds,hit,false),false);
 assert.equal(capturesPointer({x:NaN,y:0},bounds,hit,false),false);
});
