// Visible, single-human practice only. Prepares a full, valid 52-card deck;
// the normal evaluator, betting, card visibility and settlement remain in use.
import {randomInt} from 'node:crypto';
import {evalBest} from '../vendor/holdem/engine.mjs';
const key=c=>c.r+':'+c.s;
const suits=['s','h','d','c'];
export const PRACTICE_RARE_PER_THOUSAND=1;
function shuffled(cards,rng){const out=cards.slice();for(let i=out.length-1;i>0;i--){const j=rng(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
export function readDeal(deck,seats){
 const draw=deck.slice().reverse(),n=seats.length;
 return{draw,hands:seats.map((seat,i)=>({seat,cards:[draw[i],draw[n+i]]})),board:[draw[2*n+1],draw[2*n+2],draw[2*n+3],draw[2*n+5],draw[2*n+7]]};
}
function replaceHero(deck,seats,seat,cards){
 const draw=deck.slice().reverse(),i=seats.indexOf(seat),positions=[i,seats.length+i];
 for(let n=0;n<2;n++){const from=draw.findIndex(c=>key(c)===key(cards[n]));[draw[positions[n]],draw[from]]=[draw[from],draw[positions[n]]];}
 return draw.reverse();
}
function closestWinner(deck,seats,seat){
 const deal=readDeal(deck,seats),opponents=deal.hands.filter(p=>p.seat!==seat);
 const strongest=Math.max(...opponents.map(p=>evalBest(p.cards.concat(deal.board)).score));
 const unavailable=new Set(opponents.flatMap(p=>p.cards).concat(deal.board).map(key));
 const pool=deck.filter(c=>!unavailable.has(key(c)));let best=null,bestScore=Infinity;
 // Avoid forcing large hands in the ordinary branch. Compare real tie-break
 // scores, so a higher kicker in the same category is preferred to a big jump.
 for(let i=0;i<pool.length-1;i++)for(let j=i+1;j<pool.length;j++){
  const cards=[pool[i],pool[j]],ev=evalBest(cards.concat(deal.board));
  if(ev.cat<=6&&ev.score>strongest&&ev.score<bestScore){best=cards;bestScore=ev.score;}
 }
 return best?replaceHero(deck,seats,seat,best):null;
}
function assemble(deck,seats,seat,hole,board,rng){
 const n=seats.length,i=seats.indexOf(seat),draw=Array(52),fixed=[i,n+i,2*n+1,2*n+2,2*n+3,2*n+5,2*n+7],used=hole.concat(board);
 fixed.forEach((pos,index)=>draw[pos]=used[index]);
 const occupied=new Set(used.map(key)),rest=shuffled(deck.filter(c=>!occupied.has(key(c))),rng);let cursor=0;
 for(let index=0;index<52;index++)if(!draw[index])draw[index]=rest[cursor++];return draw.reverse();
}
function largeWinner(deck,seats,seat,category,rng){
 const find=(r,s)=>deck.find(c=>c.r===r&&c.s===s);let hole,board;
 if(category===7){
  const r=2+rng(13),ss=shuffled(suits,rng);hole=[find(r,ss[0]),find(r,ss[1])];board=[find(r,ss[2]),find(r,ss[3])];
  const rs=new Set([r]),counts=new Map(board.map(c=>[c.s,1]));
  for(const c of shuffled(deck,rng)){if(board.length===5)break;if(rs.has(c.r)||(counts.get(c.s)||0)>=2)continue;board.push(c);rs.add(c.r);counts.set(c.s,(counts.get(c.s)||0)+1);}
 }else{
  const high=category===9?14:5+rng(9),s=suits[rng(4)],rs=high===5?[14,2,3,4,5]:[high-4,high-3,high-2,high-1,high];
  hole=rs.slice(3).map(r=>find(r,s));board=rs.slice(0,3).map(r=>find(r,s));
  const occupied=new Set(hole.concat(board).map(key));
  for(const c of shuffled(deck,rng)){if(board.length===5)break;if(c.s===s||occupied.has(key(c)))continue;board.push(c);occupied.add(key(c));}
 }
 return assemble(deck,seats,seat,hole,board,rng);
}
export function prepareFavoredDeck(deck,seats,seat,{rng=randomInt,rareCategory}={}){
 if(deck.length!==52||new Set(deck.map(key)).size!==52||seats.length<2||seats.length>12||!seats.includes(seat))throw new Error('无效的发牌计划');
 // The rare branch is decided exactly once per activation, never per retry.
 if(rareCategory===undefined&&rng(1000)<PRACTICE_RARE_PER_THOUSAND){const roll=rng(100);rareCategory=roll<90?7:roll<99?8:9;}
 if([7,8,9].includes(rareCategory))return largeWinner(deck,seats,seat,rareCategory,rng);
 let candidate=deck;
 for(let attempt=0;attempt<24;attempt++){const next=closestWinner(candidate,seats,seat);if(next)return next;candidate=shuffled(deck,rng);}
 // Deterministic low-profile fallback: an unsuited A-high straight, with two
 // private top ranks. No opponent can tie it or make a flush/full house.
 const ss=shuffled(suits,rng),find=(r,s)=>deck.find(c=>c.r===r&&c.s===s);
 const hole=[find(13,ss[0]),find(14,ss[1])];const board=[find(10,ss[2]),find(11,ss[3]),find(12,ss[0]),find(2,ss[1]),find(5,ss[2])];
 const draw=assemble(deck,seats,seat,hole,board,rng).reverse(),heroIndex=seats.indexOf(seat);
 const fixed=new Set(hole.concat(board).map(key));
 const low=shuffled(deck.filter(c=>c.r<10&&!fixed.has(key(c))),rng);let cursor=0;
 for(let round=0;round<2;round++)for(let i=0;i<seats.length;i++)if(i!==heroIndex){
  const chosen=low[cursor++],at=round*seats.length+i,from=draw.findIndex(c=>key(c)===key(chosen));[draw[at],draw[from]]=[draw[from],draw[at]];
 }
 return draw.reverse();
}
