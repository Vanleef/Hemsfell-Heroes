from pathlib import Path
p=Path('app/page.tsx')
s=p.read_text(encoding='utf-8')
changes=[
('}});setResponseWindow({responder:1,actor:0,action:t.source});setTargeting(null)};','}});setSharedResponse({responder:1,actor:0,action:t.source});setTargeting(null)};'),
('});setResponseWindow({responder:1,actor:0,action:"evolução do herói"})};','});setSharedResponse({responder:1,actor:0,action:"evolução do herói"})};'),
('useEffect(()=>{if(responseWindow?.responder!==1||mode!=="bot")return;const pendingKey=`${responseWindow.actor}:${responseWindow.responder}:${responseWindow.passes??0}:${responseWindow.action}`;','useEffect(()=>{const authoritativePending=game?.pendingResponse;if(authoritativePending?.responder!==1||mode!=="bot")return;const pendingKey=`${authoritativePending.actor}:${authoritativePending.responder}:${authoritativePending.passes??0}:${authoritativePending.action}`;'),
('},[responseWindow?.actor,responseWindow?.responder,responseWindow?.passes,responseWindow?.action,mode,difficulty]);','},[game?.pendingResponse?.actor,game?.pendingResponse?.responder,game?.pendingResponse?.passes,game?.pendingResponse?.action,mode,difficulty]);'),
('const t=setTimeout(()=>{void passPriorityWindow(0,true);if(mode==="bot")update(g=>log(g,"Sem resposta utilizável — prioridade passada automaticamente.","response"))},80);','const t=setTimeout(()=>{void passPriorityWindow(0,true)},80);'),
('{responseWindow?.responder===1&&<div className="response-waiting"><i></i>{mode==="online"?<>Aguardando resposta do oponente <b>{responseRemaining}s</b></>:"A IA está avaliando uma resposta acelerada…"}</div>}','{game.pendingResponse?.responder===1&&<div className="response-waiting"><i></i>{mode==="online"?<>Aguardando resposta do oponente <b>{responseRemaining}s</b></>:"A IA está avaliando a prioridade…"}</div>}')]
for a,b in changes:
    if a not in s: raise SystemExit('anchor missing: '+a[:70])
    s=s.replace(a,b,1)
p.write_text(s,encoding='utf-8')
