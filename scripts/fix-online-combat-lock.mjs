import { readFile, writeFile } from "node:fs/promises";

const path = "app/page.tsx";
let source = await readFile(path, "utf8");
function replaceOnce(search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Patch point not found: ${label}`);
  source = source.replace(search, replacement);
}

replaceOnce(
`const roomAction=(action:string,extra:Record<string,unknown>={})=>{
 if(!roomId||!roomToken)return Promise.resolve(null);
 const execute=async(retry=true):Promise<any>=>{
  const payload={action,token:roomToken,...extra,...(action==="command"?{baseRevision:roomRevisionRef.current}:{})};
  const res=await fetch(\`/api/rooms/\${roomId}\`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  const data=await res.json();
  if(res.status===409&&data?.game){applyRoomSnapshot(data);if(retry&&action==="command")return execute(false)}
  if(!res.ok){setRoomError(data?.error||"A sala recusou a ação.");return null}
  setRoomError("");applyRoomSnapshot(data);return data;
 };
 const task=syncQueueRef.current.then(()=>execute()).catch(()=>{setRoomError("Conexão instável. A ação será reconciliada com a sala.");return null});
 syncQueueRef.current=task.then(()=>undefined,()=>undefined);
 return task;
};`,
`const roomAction=(action:string,extra:Record<string,unknown>={})=>{
 if(!roomId||!roomToken)return Promise.resolve(null);
 const execute=async(staleRetries=0):Promise<any>=>{
  const payload={action,token:roomToken,...extra,...(action==="command"?{baseRevision:roomRevisionRef.current}:{})};
  const res=await fetch(\`/api/rooms/\${roomId}\`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  const data=await res.json();
  const staleCommand=action==="command"&&res.status===409&&data?.error==="stale revision"&&data?.game;
  if(staleCommand){applyRoomSnapshot(data);if(staleRetries<3){await new Promise(resolve=>window.setTimeout(resolve,0));return execute(staleRetries+1)}}
  if(!res.ok){setRoomError(data?.error||"A sala recusou a ação.");return null}
  setRoomError("");applyRoomSnapshot(data);return data;
 };
 const task=syncQueueRef.current.then(()=>execute()).catch(()=>{setRoomError("Conexão instável. A ação será reconciliada com a sala.");return null});
 syncQueueRef.current=task.then(()=>undefined,()=>undefined);
 return task;
};`,
"stale command retry");

replaceOnce("fn(); pollRef.current = window.setInterval(fn,600);","fn(); pollRef.current = window.setInterval(fn,300);","poll interval");

replaceOnce(
` const beginAttack=(owner:0|1,attackerUid:string)=>{if(!game||game.phase!=="combate"||game.active!==owner||combatAction||responseWindow)return;const attacker=game.players[owner].board.find(x=>x.uid===attackerUid),attacksUsed=attacker?.attacksThisTurn??(attacker?.attackedThisTurn?1:0);if(!attacker||attacker.exhausted||attacksUsed>=(attacker.attackLimit||1)||attacker.summoning||attacker.stunned||attacker.immobilized)return;
  const player=game.players[owner],commander=player.board.find(unit=>unit.slot===2&&!unit.suffocated);
  if(player.heroId==="tessalia"&&attacker.slot!==2&&!commander){update(g=>log(g,"Tessália precisa de um Comandante no espaço central para atacar com outras criaturas.","danger"));return}
  if(player.heroId==="tessalia"&&attacker.slot===2)update(g=>{g.players[owner].heroXP++;log(g,"O Comandante de Tessália atacou: progresso de evolução +1.","effect")});
  setTargeting(null);setSharedCombat({attackerOwner:owner,attackerUid,attackerCard:baseCard(attacker),stage:"declared"})};`,
` const beginAttack=(owner:0|1,attackerUid:string)=>{const pending=mode==="online"?game?.pendingResponse:responseWindow;if(!game||game.phase!=="combate"||game.active!==owner||combatAction||pending)return;const attacker=game.players[owner].board.find(x=>x.uid===attackerUid),attacksUsed=attacker?.attacksThisTurn??(attacker?.attackedThisTurn?1:0);if(!attacker||attacker.exhausted||attacksUsed>=(attacker.attackLimit||1)||attacker.summoning||attacker.stunned||attacker.immobilized)return;
  const player=game.players[owner],commander=player.board.find(unit=>unit.slot===2&&!unit.suffocated);
  if(player.heroId==="tessalia"&&attacker.slot!==2&&!commander){if(mode!=="online")update(g=>log(g,"Tessália precisa de um Comandante no espaço central para atacar com outras criaturas.","danger"));return}
  setTargeting(null);
  if(mode==="online"){void runRulesCommand({type:"declareAttack",attackerId:attackerUid},owner);return}
  if(player.heroId==="tessalia"&&attacker.slot===2)update(g=>{g.players[owner].heroXP++;log(g,"O Comandante de Tessália atacou: progresso de evolução +1.","effect")});
  setSharedCombat({attackerOwner:owner,attackerUid,attackerCard:baseCard(attacker),stage:"declared"})};`,
"direct authoritative attack declaration");

replaceOnce(
`   if(action.stage==="declared"){if(mode==="online"){void runRulesCommand({type:"declareAttack",attackerId:action.attackerUid},action.attackerOwner);return}const priorityAction={...action,stage:"priority" as const};setSharedCombat(priorityAction);setSharedResponse({responder:defenderOwner,actor:action.attackerOwner,action:\`declaração de ataque de \${action.attackerCard.name}\`},priorityAction);return}`,
`   if(action.stage==="declared"){if(mode==="online")return;const priorityAction={...action,stage:"priority" as const};setSharedCombat(priorityAction);setSharedResponse({responder:defenderOwner,actor:action.attackerOwner,action:\`declaração de ataque de \${action.attackerCard.name}\`},priorityAction);return}`,
"remove delayed online declare driver");

replaceOnce(
` useEffect(()=>{if(!game||responseWindow?.responder!==0||priorityControl!=="assisted")return;if(hasUsablePriorityResponse(game,0))return;const t=setTimeout(()=>{void passPriorityWindow(0,true)},80);return()=>clearTimeout(t)},[game,responseWindow,mode,priorityControl]);`,
` useEffect(()=>{const pending=game?.pendingResponse;if(!game||pending?.responder!==0||priorityControl!=="assisted")return;if(hasUsablePriorityResponse(game,0))return;const key=\`\${pending.actor}:\${pending.responder}:\${pending.passes??0}:\${pending.action}:\${pending.deadline??0}\`;const t=setTimeout(()=>{const current=currentGameRef.current?.pendingResponse;if(!current||current.responder!==0)return;const currentKey=\`\${current.actor}:\${current.responder}:\${current.passes??0}:\${current.action}:\${current.deadline??0}\`;if(currentKey===key)void passPriorityWindow(0,true)},80);return()=>clearTimeout(t)},[game?.pendingResponse?.actor,game?.pendingResponse?.responder,game?.pendingResponse?.passes,game?.pendingResponse?.action,game?.pendingResponse?.deadline,priorityControl]);`,
"authoritative assisted pass");

await writeFile(path, source);
