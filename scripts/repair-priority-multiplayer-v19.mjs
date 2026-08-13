import { readFile, writeFile } from "node:fs/promises";

const read = async (path) => (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
const write = (path, value) => writeFile(path, value);
const replaceOnce = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Patch point not found: ${label}`);
  return source.replace(before, after);
};

{
  const path = "app/page.tsx";
  let source = await read(path);

  // Assisted priority is a local UX preference and must work identically in bot and
  // multiplayer games. In assisted mode, only interrupt the player when an Acelerado
  // card is actually payable from Reserve and all of its required targets exist.
  const oldAutoPass = ' useEffect(()=>{if(!game||mode!=="bot"||responseWindow?.responder!==0||priorityControl!=="assisted")return;const snapshot={...game,pendingResponse:responseWindow};if(!shouldAutoPass(snapshot,0,"assisted"))return;const t=setTimeout(()=>{void passPriorityWindow(0,true);update(g=>log(g,"Sem respostas legais — prioridade passada automaticamente.","response"))},120);return()=>clearTimeout(t)},[game,responseWindow,mode,priorityControl]);';
  const newAutoPass = ` const hasUsableAcceleratedResponse=(state:Game,owner:0|1=0)=>{const player=state.players[owner];return player.hand.some(card=>{if(!isFast(card)||effectiveCost(card,player)>player.reserve)return false;const policy=playTargetPolicy(card);return policy.selections<=0||canChooseAllTargets(card,policy.steps||[])})};\n useEffect(()=>{if(!game||responseWindow?.responder!==0||priorityControl!==\"assisted\")return;if(hasUsableAcceleratedResponse(game,0))return;const t=setTimeout(()=>{void passPriorityWindow(0,true);if(mode===\"bot\")update(g=>log(g,\"Sem Acelerado utilizável — prioridade passada automaticamente.\",\"response\"))},80);return()=>clearTimeout(t)},[game,responseWindow,mode,priorityControl]);`;
  source = replaceOnce(source, oldAutoPass, newAutoPass, "assisted multiplayer auto-pass");

  // The control is intentionally local to each client. No room-wide setting is needed:
  // one player may use Assistido while the other prefers Manual/Full Control.
  source = replaceOnce(
    source,
    '{mode==="bot"&&<button className="priority-control-toggle" title="Assistido passa automaticamente apenas quando não há resposta legal." onClick={()=>setPriorityControl(value=>value==="assisted"?"full-control":"assisted")}>{priorityControl==="assisted"?"Resposta: Assistido":"Resposta: Full Control"}</button>}',
    '<button className="priority-control-toggle" title={priorityControl==="assisted"?"Assistido: a janela só aparece quando houver uma carta Acelerado utilizável com Reserva suficiente.":"Manual: toda janela de prioridade é exibida para você decidir."} onClick={()=>setPriorityControl(value=>value==="assisted"?"full-control":"assisted")}>{priorityControl==="assisted"?"Resposta: Assistido":"Resposta: Manual"}</button>',
    "priority control visible in multiplayer"
  );

  // Manual always shows the priority window. Assisted only renders it when a payable
  // accelerated response exists; otherwise the effect above passes immediately.
  source = replaceOnce(
    source,
    '{responseWindow?.responder===0&&<ResponseModal action={responseWindow.action} player={me} seconds={responseRemaining} passes={responseWindow.passes??0} onPlay={chooseResponse} onPass={declineResponse}/>} {responseWindow?.responder===1&&<div className="response-waiting"><i></i>{mode==="online"?<>Aguardando resposta do oponente <b>{responseRemaining}s</b></>:"A IA está avaliando uma resposta acelerada…"}</div>}',
    '{responseWindow?.responder===0&&(priorityControl==="full-control"||hasUsableAcceleratedResponse(game,0))&&<ResponseModal action={responseWindow.action} player={me} seconds={responseRemaining} passes={responseWindow.passes??0} onPlay={chooseResponse} onPass={declineResponse}/>} {responseWindow?.responder===1&&<div className="response-waiting"><i></i>{mode==="online"?<>Aguardando resposta do oponente <b>{responseRemaining}s</b></>:"A IA está avaliando uma resposta acelerada…"}</div>}',
    "assisted modal eligibility"
  );

  await write(path, source);
}

console.log("v19 applied: assisted/manual priority control in multiplayer and assisted Acelerado gating.");
