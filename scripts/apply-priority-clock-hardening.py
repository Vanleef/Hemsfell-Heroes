from pathlib import Path


def must_replace(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"{label}: needle not found")
    return text.replace(old, new, 1)


# machine.ts: all Online priority expiration comes from the server clock.
p = Path("app/api/rooms/machine.ts")
text = p.read_text(encoding="utf-8")
text = must_replace(
    text,
    'import { reconcileOnlineClocks } from "./online-clock.mjs";',
    'import { ensureResponseClock, reconcileOnlineClocks } from "./online-clock.mjs";\nimport { serverNowMs } from "./time.mjs";',
    "machine clock imports",
)
text = must_replace(
    text,
    'export function deadline(seconds: number) {\n  return Date.now() + seconds * 1000;\n}',
    'export function deadline(seconds: number) {\n  return serverNowMs() + seconds * 1000;\n}',
    "machine deadline helper",
)
text = text.replace('export function reconnectPause(room: Room, now = Date.now())', 'export function reconnectPause(room: Room, now = serverNowMs())')
text = text.replace('const now = Date.now();', 'const now = serverNowMs();')

old_seed = '''  let seededDeadline = false;
  if (room.game.pendingResponse && !Number.isFinite(Number(room.game.pendingResponse.deadline))) {
    room.game.pendingResponse.deadline = now + room.settings.responseSeconds * 1000;
    if (room.game.priority) room.game.priority.deadline = room.game.pendingResponse.deadline;
    seededDeadline = true;
  }'''
new_seed = '''  let seededDeadline = false;
  let responseClock: ReturnType<typeof ensureResponseClock> | null = null;
  if (room.game.pendingResponse) {
    responseClock = ensureResponseClock(room.game, room.settings, now);
    seededDeadline = !!responseClock.changed;
    if (responseClock.changed && responseClock.driftLevel !== "ok") {
      logOnlineDiagnostic(room, "priority-clock-recovered", {
        role: room.game.pendingResponse.responder === 0 ? "host" : "guest",
        driftLevel: responseClock.driftLevel,
        timerMode: responseClock.timerMode,
      });
    }
  }'''
text = must_replace(text, old_seed, new_seed, "pending response clock recovery")
text = must_replace(
    text,
    'if (room.game.combatAction?.stage === "choosing" && !Number.isFinite(Number(room.game.combatAction.deadline))) {',
    'if (room.game.combatAction?.stage === "choosing" && (!Number.isFinite(Number(room.game.combatAction.deadline)) || Number(room.game.combatAction.deadline) <= 0)) {',
    "blocker zero deadline",
)
old_response = '''  if (room.game.pendingResponse) {
    if (room.game.pendingResponse.deadline > now) return seededDeadline;
    const before = room.game;'''
new_response = '''  if (room.game.pendingResponse) {
    if (responseClock?.timerMode === "action_only") {
      if (!responseClock.wallExpired) return seededDeadline;
      logOnlineDiagnostic(room, "priority_fallback_wall_timeout", {
        role: room.game.pendingResponse.responder === 0 ? "host" : "guest",
        commandType: "passPriority",
        auto: true,
      });
    } else if (!responseClock?.expired) return seededDeadline;
    const before = room.game;'''
text = must_replace(text, old_response, new_response, "authoritative response timeout")
marker = '''  /* Interactive target/effect decisions intentionally pause the action clock.
     They are never allowed to fall through to a phase timeout underneath the
     decision that owns input. */
  if (room.game.pendingDecision || room.game.pendingReposition) return seededDeadline;

'''
replacement = marker + '''  if (!Number.isFinite(Number(room.game.turnDeadline)) || Number(room.game.turnDeadline) <= 0) {
    room.game.turnDeadline = deadline(room.settings.turnSeconds);
    seededDeadline = true;
  }

'''
text = must_replace(text, marker, replacement, "turn deadline recovery")
p.write_text(text, encoding="utf-8")


# Store: server time is exposed only as a display reference in room snapshots.
p = Path("app/api/rooms/store.ts")
text = p.read_text(encoding="utf-8")
if 'import { serverNowMs } from "./time.mjs";' not in text:
    text = must_replace(
        text,
        'import { onlineCombatInteractionView } from "../../rules-engine/online-combat.mjs";',
        'import { onlineCombatInteractionView } from "../../rules-engine/online-combat.mjs";\nimport { serverNowMs } from "./time.mjs";',
        "store server clock import",
    )
text = must_replace(
    text,
    'createdAt: room.createdAt, revision: room.revision, ...(includeGame ?',
    'createdAt: room.createdAt, revision: room.revision, serverNowMs: serverNowMs(), ...(includeGame ?',
    "room view server time",
)
p.write_text(text, encoding="utf-8")


# Nested response resolution: after resolving the top Fast/Acelerado item,
# priority returns to the responder of the root action, not blindly to active.
p = Path("app/rules-engine/online-priority-engine.mjs")
text = p.read_text(encoding="utf-8")
old_nested = '''  const wasNestedStack = command.type === "passPriority" && Number(before.pendingResponse?.passes || 0) > 0 && (before.priorityStack?.length || 0) > 1;
  if (wasNestedStack && state.pendingResponse && !state.pendingDecision && !state.pendingReposition) state.pendingResponse = { ...state.pendingResponse, responder: state.active, passes: 0 };'''
new_nested = '''  const wasNestedStack = command.type === "passPriority" && Number(before.pendingResponse?.passes || 0) > 0 && (before.priorityStack?.length || 0) > 1;
  const rootActor = before.priorityStack?.[0]?.actor ?? before.priorityStack?.[0]?.command?.owner ?? before.pendingAction?.owner ?? before.pendingResponse?.actor;
  const rootResponder = Number.isInteger(rootActor) ? 1 - Number(rootActor) : state.active;
  if (wasNestedStack && state.pendingResponse && !state.pendingDecision && !state.pendingReposition) state.pendingResponse = { ...state.pendingResponse, responder: rootResponder, passes: 0 };'''
text = must_replace(text, old_nested, new_nested, "nested stack responder restoration")
p.write_text(text, encoding="utf-8")


# Client: render server truth, never turn a missing timestamp into 0:00, and
# lock response controls while one authoritative command is in flight.
p = Path("app/page.tsx")
text = p.read_text(encoding="utf-8")
text = must_replace(
    text,
    'type PendingResponse={responder:0|1;actor:0|1;action:string;deadline?:number;passes?:number};',
    'type PendingResponse={responder:0|1;actor:0|1;action:string;openedAt?:number|null;deadline?:number|null;wallDeadline?:number|null;timerMode?:"normal"|"action_only"|null;driftLevel?:string|null;passes?:number};',
    "pending response timer type",
)
text = must_replace(
    text,
    'const syncQueueRef=useRef<Promise<void>>(Promise.resolve());\nconst currentGameRef',
    'const syncQueueRef=useRef<Promise<void>>(Promise.resolve());\nconst commandPendingRef=useRef(false);\nconst [onlineCommandPending,setOnlineCommandPending]=useState(false);\nconst serverClockSkewRef=useRef(0);\nconst currentGameRef',
    "online command lock refs",
)
text = must_replace(
    text,
    'const applyRoomSnapshot=(data:any)=>{setRoomInfo(data);roomRevisionRef.current=data.revision??roomRevisionRef.current;if(data.game){',
    'const applyRoomSnapshot=(data:any)=>{if(Number.isFinite(Number(data?.serverNowMs))&&Number(data.serverNowMs)>0)serverClockSkewRef.current=Number(data.serverNowMs)-Date.now();setRoomInfo(data);roomRevisionRef.current=data.revision??roomRevisionRef.current;if(data.game){',
    "server display skew",
)
timeout_effect = 'useEffect(()=>{if(mode!=="online"||!roomId||!roomToken||!game)return;const deadline=game.pendingResponse?.deadline??game.turnDeadline;if(!deadline||deadline>clockNow)return;const key=`${game.round}-${game.pendingResponse?.action??"turn"}-${deadline}`;if(timeoutSentRef.current===key)return;timeoutSentRef.current=key;roomAction("timeout")},[clockNow,mode,roomId,roomToken,game?.pendingResponse?.deadline,game?.turnDeadline]);\n'
if timeout_effect not in text:
    raise SystemExit("client timeout dispatcher not found")
text = text.replace(timeout_effect, "", 1)
text = must_replace(
    text,
    'const timed=response?{...response,deadline:response.deadline??Date.now()+(roomInfo?.settings?.responseSeconds??30)*1000}:null;',
    'const timed=response?{...response,...(mode==="online"?{}:{deadline:response.deadline??Date.now()+(roomInfo?.settings?.responseSeconds??30)*1000})}:null;',
    "client shared response deadline",
)
text = must_replace(
    text,
    'g.pendingResponse=asResponse?null:{responder:owner===0?1:0,actor:owner,action:c.name,passes:0,deadline:Date.now()+(roomInfo?.settings?.responseSeconds??30)*1000};',
    'g.pendingResponse=asResponse?null:{responder:owner===0?1:0,actor:owner,action:c.name,passes:0};',
    "legacy online response deadline",
)
old_run = 'const runRulesCommand=async(command:Record<string,unknown>,owner:0|1=0):Promise<boolean>=>{try{if(mode==="online"){const commandId=crypto.randomUUID();const result=await roomAction("command",{command,commandId,baseRevision:roomRevisionRef.current});return !!result}const current=currentGameRef.current;if(!current)return false;const next=executeCommand(current,{...command,owner},{priority:true}).state as Game;syncDynamicFieldCounts(next);currentGameRef.current=next;setGame(next);setResponseWindow(next.pendingResponse??null);return true}catch(error){setRoomError(error instanceof Error?`A regra recusou a ação: ${error.message}`:"A regra recusou a ação.");return false}};'
new_run = 'const runRulesCommand=async(command:Record<string,unknown>,owner:0|1=0):Promise<boolean>=>{try{if(mode==="online"){if(commandPendingRef.current)return false;commandPendingRef.current=true;setOnlineCommandPending(true);try{const commandId=crypto.randomUUID();const result=await roomAction("command",{command,commandId,baseRevision:roomRevisionRef.current});return !!result}finally{commandPendingRef.current=false;setOnlineCommandPending(false)}}const current=currentGameRef.current;if(!current)return false;const next=executeCommand(current,{...command,owner},{priority:true}).state as Game;syncDynamicFieldCounts(next);currentGameRef.current=next;setGame(next);setResponseWindow(next.pendingResponse??null);return true}catch(error){setRoomError(error instanceof Error?`A regra recusou a ação: ${error.message}`:"A regra recusou a ação.");return false}};'
text = must_replace(text, old_run, new_run, "runRulesCommand in-flight lock")
old_clocks = ''' const priorityLocked=(mode==="online"&&game?.pendingResponse?.actor===0)||opponentReconnecting;
 const responseRemaining=Math.max(0,Math.ceil(((game?.pendingResponse?.deadline??clockNow)-clockNow)/1000));
 const turnRemaining=Math.max(0,Math.ceil(((game?.turnDeadline??clockNow)-clockNow)/1000));
 const formatClock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`;'''
new_clocks = ''' const serverDisplayNow=clockNow+serverClockSkewRef.current;
 const validDeadline=(value:unknown)=>Number.isFinite(Number(value))&&Number(value)>0;
 const localPriorityOwner=game?.pendingDecision?.owner??game?.pendingResponse?.responder??(game?.combatAction?.stage==="choosing"?(1-game.combatAction.attackerOwner) as 0|1:game?.active);
 const priorityLocked=(mode==="online"&&(localPriorityOwner!==0||onlineCommandPending))||opponentReconnecting;
 const responseTimerMode=game?.pendingResponse?.timerMode??((game as any)?.priority?.timerMode as string|undefined)??"normal";
 const responseRemaining:number|null=validDeadline(game?.pendingResponse?.deadline)?Math.max(0,Math.ceil((Number(game?.pendingResponse?.deadline)-serverDisplayNow)/1000)):null;
 const turnRemaining:number|null=validDeadline(game?.turnDeadline)?Math.max(0,Math.ceil((Number(game?.turnDeadline)-serverDisplayNow)/1000)):null;
 const formatClock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`;'''
text = must_replace(text, old_clocks, new_clocks, "safe online clock rendering")
text = must_replace(
    text,
    '{mode==="online"&&<div className={`match-clock ${turnRemaining<=15?"urgent":""}`}><span>TURNO</span><b>{formatClock(turnRemaining)}</b></div>}',
    '{mode==="online"&&<div className={`match-clock ${((game.pendingResponse?responseRemaining:turnRemaining)??999)>15?"":"urgent"}`}><span>{game.pendingResponse?"RESPOSTA":"TURNO"}</span><b>{game.pendingResponse?(responseTimerMode==="action_only"?"MANUAL":responseRemaining===null?"…":formatClock(responseRemaining)):turnRemaining===null?"…":formatClock(turnRemaining)}</b></div>}',
    "match clock display",
)
start = text.find("function ResponseModal(")
end = text.find("\nfunction MulliganModal(", start)
if start < 0 or end < 0:
    raise SystemExit("ResponseModal boundaries not found")
response_modal = '''function ResponseModal({action,available,heroAbilities,budget,offTurn,seconds,timerMode="normal",passes=0,busy=false,onPlay,onHeroAbility,onPass}:{action:string;available:Array<{card:CardDef;index:number;cost:number}>;heroAbilities:Array<{abilityId:string;label:string}>;budget:number;offTurn:boolean;seconds:number|null;timerMode?:string;passes?:number;busy?:boolean;onPlay:(idx:number)=>void;onHeroAbility:(abilityId:string)=>void;onPass:()=>void}){
 const hasResponses=available.length>0||heroAbilities.length>0;
 const clockLabel=timerMode==="action_only"?"⏱ MANUAL":seconds===null?"⏱ SINCRONIZANDO":`⏱ ${seconds}s`;
 return <div className="overlay response-overlay"><section className="response-dialog" role="dialog" aria-modal="true" aria-labelledby="response-title"><header><span>JANELA DE RESPOSTA</span><b className={seconds!==null&&seconds<=5?"urgent":""}>{clockLabel}</b><b>{offTurn?"Reserva":"Energia"} · {budget}</b></header><h2 id="response-title">Sua prioridade</h2><div className="priority-status"><b>{passes===0?"Primeiro passe":"Segundo passe"}</b><span>{passes===0?"A prioridade voltará ao jogador da ação.":"A ação será encerrada após este passe."}</span></div><p>O oponente realizou: <strong>{action}</strong>. Use um Feitiço Acelerado, uma habilidade ativa disponível do seu Herói ou passe.</p>{available.length?<div className="response-cards">{available.map(({card,index,cost})=><div key={`${card.id}-${index}`}><OriginalCard card={card} small inspectable={false} disabled={busy} activeEffect="RESPOSTA ACELERADA" onClick={()=>{if(!busy)onPlay(index)}}/><b>{card.name}</b><small>Responder · custo {cost}</small></div>)}</div>:null}{heroAbilities.length?<div className="response-hero-abilities">{heroAbilities.map(ability=><button key={ability.abilityId} disabled={busy} onClick={()=>{if(!busy)onHeroAbility(ability.abilityId)}}><i>⚡</i><span><b>{ability.label}</b><small>Habilidade ativa do Herói</small></span></button>)}</div>:null}{!hasResponses?<div className="no-response-card"><i>◇</i><b>Nenhuma resposta utilizável</b><span>Não há Feitiço Acelerado nem habilidade ativa de Herói legal neste momento. Passe para devolver a prioridade.</span></div>:null}<footer><button className="pass-response" disabled={busy} onClick={()=>{if(!busy)onPass()}}>{busy?"Enviando…":"Passar prioridade"}</button></footer></section></div>
}
'''
text = text[:start] + response_modal + text[end:]
text = must_replace(
    text,
    '<ResponseModal action={responseWindow.action} available={usableAcceleratedResponses(game,0)} heroAbilities={heroPriorityResponses(game,0)} budget={responseBudget(game,0)} offTurn={game.active!==0} seconds={responseRemaining} passes={responseWindow.passes??0} onPlay={chooseResponse} onHeroAbility={chooseHeroResponse} onPass={declineResponse}/>',
    '<ResponseModal action={responseWindow.action} available={usableAcceleratedResponses(game,0)} heroAbilities={heroPriorityResponses(game,0)} budget={responseBudget(game,0)} offTurn={game.active!==0} seconds={responseRemaining} timerMode={responseTimerMode} passes={responseWindow.passes??0} busy={onlineCommandPending} onPlay={chooseResponse} onHeroAbility={chooseHeroResponse} onPass={declineResponse}/>',
    "ResponseModal caller",
)
text = must_replace(
    text,
    '{game.pendingResponse?.responder===1&&<div className="response-waiting"><i></i>{mode==="online"?<>Aguardando resposta do oponente <b>{responseRemaining}s</b></>:"A IA está avaliando a prioridade…"}</div>}',
    '{game.pendingResponse?.responder===1&&<div className="response-waiting"><i></i>{mode==="online"?<>Aguardando resposta do oponente <b>{responseTimerMode==="action_only"?"manual":responseRemaining===null?"…":`${responseRemaining}s`}</b></>:"A IA está avaliando a prioridade…"}</div>}',
    "opponent response timer display",
)
p.write_text(text, encoding="utf-8")


Path("tests/online-priority-ui-static.test.mjs").write_text('''import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
const machine=await readFile(new URL("../app/api/rooms/machine.ts",import.meta.url),"utf8");
const store=await readFile(new URL("../app/api/rooms/store.ts",import.meta.url),"utf8");

test("online UI never turns a missing deadline into a fake zero clock",()=>{
 assert.doesNotMatch(page,/pendingResponse\\?\\.deadline\\?\\?clockNow/);
 assert.doesNotMatch(page,/turnDeadline\\?\\?clockNow/);
 assert.match(page,/responseRemaining:number\\|null/);
 assert.match(page,/turnRemaining:number\\|null/);
 assert.match(page,/SINCRONIZANDO/);
});

test("client wall clock never dispatches authoritative timeout",()=>{
 assert.doesNotMatch(page,/roomAction\\(["']timeout["']\\)/);
 assert.match(page,/serverClockSkewRef/);
});

test("online priority input is owned by responder and command is locked in flight",()=>{
 assert.match(page,/localPriorityOwner/);
 assert.match(page,/commandPendingRef/);
 assert.match(page,/onlineCommandPending/);
});

test("room machine owns time and room snapshots expose server time only for display",()=>{
 assert.match(machine,/serverNowMs/);
 assert.match(machine,/ensureResponseClock/);
 assert.match(machine,/priority_fallback_wall_timeout/);
 assert.match(store,/serverNowMs: serverNowMs\\(\\)/);
});
''', encoding="utf-8")
