'use strict';
const RULES=Object.freeze({maxPlayers:12,botDelayMs:500,turnMs:20000,singlePlayerTurnMs:0,timeoutAction:'check-or-fold'});
function turnKey(table){return table?.status==='playing'?table.handNo+':'+table.street+':'+table.toAct+':'+table.timeline.at(-1)?.id:null;}
const timeoutActionFor=legal=>legal?.check?'check':'fold';
module.exports={RULES,turnKey,timeoutActionFor};
