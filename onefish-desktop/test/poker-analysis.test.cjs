'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const cards=text=>text.split(' ').map(c=>({r:{A:14,K:13,Q:12,J:11,T:10}[c[0]]||Number(c.slice(0,-1)),s:c.at(-1)}));
const api=import('../core/poker-analysis.mjs');
const engine=import('../vendor/holdem/engine.mjs');
test('best hand uses exactly five cards including the board-only case and ace-low straights',async()=>{
 const {describeHand}=await api;
 const wheel=describeHand(cards('As 2d 3h 4c 5s Kh Qd'));assert.equal(wheel.cat,4);assert.equal(wheel.detail,'顺子（5 高）');assert.equal(wheel.bestCards.length,5);
 const royal=describeHand(cards('2c 7h Ts Js Qs Ks As'));assert.equal(royal.cat,9);assert.ok(royal.bestCards.every(c=>c.s==='s'));
 assert.equal(describeHand(cards('As Ad Kc Kd Kh 2h 7s')).detail,'葫芦（K 三条 + A 一对）');
});
test('royal flush draw reports the exact missing card, while a nearer flush beats a distant royal',async()=>{
 const {analyzeHero}=await api;
 const royal=analyzeHero(cards('As Ks'),cards('Qs Js 2d'));assert.equal(royal.target.name,'皇家同花顺');assert.equal(royal.target.missing,1);assert.equal(royal.target.alternatives[0].recipe,'10♠');
 const flush=analyzeHero(cards('Ks Qs'),cards('Js 8s 2d'));assert.equal(flush.target.name,'同花');assert.equal(flush.target.missing,1);
 assert.ok(flush.target.alternatives[0].groups[0].options.every(c=>c.s==='s'&&![13,12,11,8].includes(c.r)));
});
test('nearest upgrades show specific remaining suits and all equally near full-house alternatives',async()=>{
 const {analyzeHero}=await api;
 const trips=analyzeHero(cards('Kc 7d'),cards('3s 3h Jd 8c'));assert.equal(trips.current.name,'一对');assert.equal(trips.target.name,'三条');assert.deepEqual(trips.target.alternatives[0].groups[0].options,cards('3d 3c'));
 const full=analyzeHero(cards('Ah As'),cards('Kc Kd 2c 7h'));assert.equal(full.current.name,'两对');assert.equal(full.target.name,'葫芦');assert.equal(full.target.alternatives.length,2);
});
test('backdoor draws require both missing cards and never exceed remaining public cards',async()=>{
 const {analyzeHero}=await api;
 const a=analyzeHero(cards('4s 5s'),cards('6s 7h 8d'));assert.equal(a.current.name,'顺子');assert.equal(a.target.name,'同花顺');assert.equal(a.target.missing,2);
 assert.ok(a.target.alternatives.some(t=>t.recipe.includes('7♠')&&t.recipe.includes('8♠')));
 const b=analyzeHero(cards('As 2d'),cards('3h 4c 5s'));assert.equal(b.target,null);assert.match(b.message,/无法/);
 const river=analyzeHero(cards('As Ks'),cards('Qs Js 2d 8h 3c'));assert.equal(river.target,null);assert.match(river.message,/已发完/);
});
test('preflop indicates incomplete cards; ended hands do not suggest a future draw',async()=>{
 const {analyzeHero}=await api;
 const a=analyzeHero(cards('Qs Qh'),[]);assert.equal(a.current.name,'一对');assert.equal(a.current.complete,false);assert.equal(a.target.name,'四条');assert.equal(a.target.missing,3);assert.equal(a.target.alternatives[0].filler,1);
 assert.equal(analyzeHero(cards('As Ks'),cards('Qs Js 2d'),{ended:true}).target,null);
 assert.equal(analyzeHero([],[]).current,null);
});
test('every nearest turn draw agrees with exhaustive one-card evaluation across seeded deals',async()=>{
 const {analyzeHero}=await api,{evalBest}=await engine;const deck=['s','h','d','c'].flatMap(s=>Array.from({length:13},(_,i)=>({r:i+2,s})));let seed=713;
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 for(let i=0;i<36;i++){
  const shuffled=deck.slice();for(let j=51;j>0;j--){const k=Math.floor(rand()*(j+1));[shuffled[j],shuffled[k]]=[shuffled[k],shuffled[j]];}
  const known=shuffled.slice(0,6),a=analyzeHero(known.slice(0,2),known.slice(2)),current=evalBest(known);
  const strongest=Math.max(...shuffled.slice(6).map(c=>evalBest([...known,c]).cat));
  if(strongest>current.cat){assert.equal(a.target.cat,strongest);assert.equal(a.target.missing,1);}else assert.equal(a.target,null);
 }
});
test('winner summary preserves split/side pots and distinguishes fold wins from showdown hands',async()=>{
 const {winnerSummary}=await api;
 const table={board:cards('3s Jh 8c 3h 2c'),players:[{seat:0,kind:'human',cards:cards('Ks 7d')},{seat:1,name:'马斯克',cards:cards('3c 9s')}],winners:[{seats:[1],amount:100,handName:'三条'},{seats:[0],amount:20,handName:'一对'}]};
 const result=winnerSummary(table);assert.equal(result[0].label,'主池');assert.equal(result[0].players[0].detail,'三条（3）');assert.equal(result[1].label,'边池 1');assert.equal(result[1].players[0].name,'你');
 table.board=[];table.winners=[{seats:[1],amount:80,handName:'无人跟注'}];const fold=winnerSummary(table)[0];assert.equal(fold.foldWin,true);assert.equal(fold.players[0].detail,'弃牌获胜');assert.equal(fold.players[0].hand,null);
});
test('analysis never changes with hidden opponent cards or future deck cards',async()=>{
 const {createPokerView}=await api;const view=createPokerView();
 const table={status:'playing',board:cards('3s Jh 8c'),players:[{kind:'human',seat:0,cards:cards('Ks 7d')},{seat:1,cards:cards('As Ah')}],winners:[],deck:cards('Ac Ad')};
 const before=view(table).analysis;table.players[1].cards=cards('2s 2h');table.deck=cards('Ts Th');assert.deepEqual(view(table).analysis,before);
});
test('production table waits 0.5 seconds between local opponent actions, reset cancels the old actor',async()=>{
 const {createTable}=await engine;const timers=[];
 const table=createTable({get:()=>undefined,timeout:(fn,ms)=>{const t={fn,ms,cancelled:false};timers.push(t);return()=>t.cancelled=true;}},{registerEffect:false,avatarDir:'/tmp/onefish-test-avatars',actionDelayMs:500});
 try{const old=Math.random;try{Math.random=()=>.99;table.start();}finally{Math.random=old;}
  assert.equal(timers.at(-1).ms,500);const initial=table.snapshot();assert.equal(initial.timeline.filter(e=>e.kind==='action'&&!/^[小大]盲 /.test(e.action)).length,0);
  assert.ok(initial.thinkEndsAt-Date.now()>450);table.reset();assert.equal(timers.at(-1).cancelled,true);timers.at(-1).fn();await new Promise(r=>setTimeout(r,5));assert.equal(table.snapshot().status,'idle');
 }finally{table.dispose();}
});

test('nearest two-card upgrade on the flop agrees with exhaustive runouts',async()=>{
 const {analyzeHero}=await api,{evalBest}=await engine;
 for(const text of ['4s 5s 6s 7h 8d','As 2d 3h 4c 5s','As Ah Ad Ac 2c']){
  const known=cards(text),a=analyzeHero(known.slice(0,2),known.slice(2)),current=evalBest(known);
  const unseen=['s','h','d','c'].flatMap(s=>Array.from({length:13},(_,i)=>({r:i+2,s}))).filter(c=>!known.some(k=>k.r===c.r&&k.s===c.s));
  let highest=Math.max(...unseen.map(c=>evalBest([...known,c]).cat)),missing=1;
  if(highest<=current.cat){missing=2;for(let i=0;i<unseen.length;i++)for(let j=i+1;j<unseen.length;j++)highest=Math.max(highest,evalBest([...known,unseen[i],unseen[j]]).cat);}
  if(highest>current.cat){assert.equal(a.target.cat,highest);assert.equal(a.target.missing,missing);}else assert.equal(a.target,null);
 }
});
