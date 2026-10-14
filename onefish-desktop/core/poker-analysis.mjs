// Use the table's existing evaluator for made hands; tips only see the player's
// own hole cards and the public board. No opponent cards or undealt deck access.
import {evalBest,eval5,combos5,HAND_NAMES} from '../vendor/holdem/engine.mjs';
const SUITS=['s','h','d','c'],SYMBOLS={s:'♠',h:'♥',d:'♦',c:'♣'};
const rank=r=>({14:'A',13:'K',12:'Q',11:'J'}[r]||String(r));
const cardKey=c=>c.r+c.s;
export const cardText=c=>rank(c.r)+SYMBOLS[c.s];
const pack=cards=>cards.map(cardKey).sort().join(',');
const deck=SUITS.flatMap(s=>Array.from({length:13},(_,i)=>({r:i+2,s})));
export function describeHand(cards){
 if(!cards.length)return null;
 let bestCards=cards.slice(),ev;
 if(cards.length>=5){ev=evalBest(cards);bestCards=combos5(cards).find(set=>eval5(set).score===ev.score);}
 else{
  const counts=new Map();for(const c of cards)counts.set(c.r,(counts.get(c.r)||0)+1);
  const groups=[...counts.keys()].sort((a,b)=>counts.get(b)-counts.get(a)||b-a);
  const cat=counts.get(groups[0])===4?7:counts.get(groups[0])===3?3:counts.get(groups[0])===2?(counts.get(groups[1])===2?2:1):0;
  ev={cat,name:HAND_NAMES[cat],kick:cat?groups:[...counts.keys()].sort((a,b)=>b-a)};
 }
 let detail=ev.name;const k=ev.kick;
 if([0,1,3,7].includes(ev.cat))detail+='（'+rank(k[0])+([1,3,7].includes(ev.cat)?'':' 高')+'）';
 if(ev.cat===2)detail+='（'+rank(k[0])+' 和 '+rank(k[1])+'）';
 if(ev.cat===6)detail+='（'+rank(k[0])+' 三条 + '+rank(k[1])+' 一对）';
 if([4,8].includes(ev.cat))detail+='（'+rank(k[0])+' 高）';
 if(ev.cat===5)detail+='（'+SYMBOLS[bestCards[0].s]+' · '+rank(k[0])+' 高）';
 return{cat:ev.cat,name:ev.name,detail,bestCards,complete:cards.length>=5};
}
function templates(){
 const out=[];const ranks=Array.from({length:13},(_,i)=>i+2);
 const add=(cat,groups,label,strength)=>out.push({cat,groups,label,strength});
 for(const r of ranks){add(1,[{r,count:2}],`一对 ${rank(r)}`,r);add(3,[{r,count:3}],`三条 ${rank(r)}`,r);add(7,[{r,count:4}],`四条 ${rank(r)}`,r);
  for(const other of ranks)if(other!==r){add(6,[{r,count:3},{r:other,count:2}],`葫芦（${rank(r)} 三条 + ${rank(other)} 一对）`,r*16+other);
   if(other<r)add(2,[{r,count:2},{r:other,count:2}],`两对（${rank(r)} 和 ${rank(other)}）`,r*16+other);}
 }
 for(const s of SUITS)add(5,[{s,count:5}],`同花 ${SYMBOLS[s]}`,0);
 for(let high=5;high<=14;high++){
  const rs=high===5?[14,2,3,4,5]:Array.from({length:5},(_,i)=>high-4+i);
  add(4,rs.map(r=>({r,count:1})),`顺子（${rank(high)} 高）`,high);
  for(const s of SUITS)add(high===14?9:8,rs.map(r=>({r,s,count:1})),high===14?`皇家同花顺 ${SYMBOLS[s]}`:`同花顺（${SYMBOLS[s]} · ${rank(high)} 高）`,high);
 }
 return out;
}
const TEMPLATES=templates();
function distance(template,known){
 const groups=template.groups.map(g=>{
  const matches=c=>(g.r===undefined||c.r===g.r)&&(g.s===undefined||c.s===g.s);
  const count=Math.max(0,g.count-known.filter(matches).length);
  return{...g,count,options:deck.filter(c=>matches(c)&&!known.some(k=>cardKey(k)===cardKey(c)))};
 }).filter(g=>g.count);
 const required=groups.reduce((n,g)=>n+g.count,0),missing=Math.max(required,5-known.length);
 return{...template,groups,missing,filler:missing-required};
}
function groupText(g){
 // Show exact cards where there are few options; generic ranks/suits otherwise.
 if(g.count===1&&g.options.length<=4)return g.options.map(cardText).join(' / ');
 if(g.options.length===g.count)return g.options.map(cardText).join(' + ');
 return g.count+' 张'+(g.r===undefined?'':rank(g.r))+(g.s===undefined?'':' '+SYMBOLS[g.s]);
}
function recipeText(t){const parts=t.groups.map(groupText);if(t.filler)parts.push(t.filler+' 张其他牌');return parts.join(' + ');}
export function analyzeHero(hole,board,{ended=false,folded=false}={}){
 if(hole.length!==2)return{current:null,target:null,remaining:5-board.length,message:'发牌后显示你的牌型和补牌方向'};
 const known=hole.concat(board),current=describeHand(known),remaining=Math.max(0,5-board.length);
 const base={current,target:null,remaining,folded,message:''};
 if(ended)return{...base,message:'本手已结束'};
 if(!remaining)return{...base,message:'公共牌已发完，牌型已定'};
 if(current.cat===9)return{...base,message:'已经凑成最大的牌型'};
 const choices=TEMPLATES.filter(t=>t.cat>current.cat).map(t=>distance(t,known)).filter(t=>t.missing>0&&t.missing<=remaining&&t.groups.every(g=>g.options.length>=g.count));
 if(!choices.length)return{...base,message:'剩余公共牌无法再组成更高一级的牌型'};
 choices.sort((a,b)=>a.missing-b.missing||b.cat-a.cat||b.strength-a.strength);
 const best=choices[0],nearest=choices.filter(c=>c.missing===best.missing&&c.cat===best.cat);
 const unique=new Set();const alternatives=nearest.filter(t=>{const key=recipeText(t);if(unique.has(key))return false;unique.add(key);return true;});
 return{...base,target:{cat:best.cat,name:HAND_NAMES[best.cat],missing:best.missing,alternatives:alternatives.map(t=>({label:t.label,recipe:recipeText(t),groups:t.groups.map(({r,s,count,options})=>({r,s,count,options})),filler:t.filler}))}};
}
export function winnerSummary(table){
 return(table.winners||[]).map((pot,i)=>({label:table.winners.length===1?'本手获胜':i===0?'主池':'边池 '+i,amount:pot.amount,foldWin:pot.handName==='无人跟注',players:pot.seats.map(seat=>{
  const p=table.players.find(p=>p.seat===seat),hand=p?.cards.length===2&&table.board.length>=3?describeHand(p.cards.concat(table.board)):null;
  return{seat,name:p?.seat===(table.viewerSeat??0)?'你':p?.name||pot.names?.[0]||'玩家',hand,detail:pot.handName==='无人跟注'?'弃牌获胜'+(hand?' · '+hand.detail:''):hand?.detail||pot.handName};
 })}));
}
export function createPokerView(){
 let signature='',cached=null;
 return table=>{
  const hero=table.players.find(p=>p.seat===(table.viewerSeat??0));
  const next=JSON.stringify([pack(hero?.cards||[]),pack(table.board),table.status,hero?.folded]);
  if(next!==signature){signature=next;cached=analyzeHero(hero?.cards||[],table.board,{ended:['hand-over','game-over'].includes(table.status),folded:hero?.folded});}
  return{...table,analysis:cached,results:winnerSummary(table)};
 };
}
