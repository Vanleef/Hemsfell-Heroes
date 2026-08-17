from pathlib import Path

def rep(path, old, new):
    p=Path(path); t=p.read_text(encoding='utf-8')
    if old not in t: raise SystemExit(f'pattern missing in {path}: {old[:140]!r}')
    p.write_text(t.replace(old,new,1),encoding='utf-8')

# Authoritative state-based defeat check for every rules command.
rep('app/rules-engine/engine-base.mjs',
'''  if (["playCard"].includes(command.type)) if (!command.skipPriority && state.pendingAction && command.hasPriority) state.pendingResponse = { responder: state.pendingAction.actor, actor: command.owner, action: actionLabel, passes: 0 }; else if (!command.skipPriority && !state.pendingAction) state.pendingResponse = command.hasPriority ? null : { responder: 1 - command.owner, actor: command.owner, action: actionLabel, passes: 0 };
  return { state, trace, steps };
}''',
'''  if (["playCard"].includes(command.type)) if (!command.skipPriority && state.pendingAction && command.hasPriority) state.pendingResponse = { responder: state.pendingAction.actor, actor: command.owner, action: actionLabel, passes: 0 }; else if (!command.skipPriority && !state.pendingAction) state.pendingResponse = command.hasPriority ? null : { responder: 1 - command.owner, actor: command.owner, action: actionLabel, passes: 0 };
  const defeatedOwners = state.players.map((entry, owner) => Number(entry.life || 0) <= 0 ? owner : -1).filter((owner) => owner >= 0);
  if (defeatedOwners.length) {
    if (defeatedOwners.length === 1) state.winner = 1 - defeatedOwners[0];
    else if (state.winner == null) state.winner = 1 - (state.active ?? 0);
    state.pendingDecision = null;
    state.pendingResponse = null;
    delete state.pendingAction;
    state.pendingReposition = null;
    state.combatAction = null;
  }
  return { state, trace, steps };
}''')

# Make local authoritative bridge defensive as well, including old room snapshots.
rep('app/page.tsx',
'''const next=executeCommand(current,{...command,owner},{priority:true}).state as Game;currentGameRef.current=next;setGame(next);setResponseWindow(next.pendingResponse??null);return true''',
'''const next=executeCommand(current,{...command,owner},{priority:true}).state as Game;if(next.winner==null){const defeated=next.players.findIndex(player=>player.life<=0);if(defeated>=0)next.winner=defeated===0?1:0}if(next.winner!==null){next.pendingDecision=null;next.pendingResponse=null;next.pendingAction=undefined;next.pendingReposition=null;next.combatAction=null}currentGameRef.current=next;setGame(next);setResponseWindow(next.pendingResponse??null);return true''')

old='''{game.winner!==null&&<div className="overlay"><div className="maintenance"><p>FIM DO TESTE</p><h2>{game.winner===0?"Vitória":"Derrota"}</h2><span>{deckById(game.players[game.winner].heroId).name} venceu após {game.round} turnos.</span><div><button className="gold" onClick={begin}>Revanche</button><button onClick={()=>setScreen("setup")}>Trocar decks</button></div></div></div>}'''
new='''{game.winner!==null&&<div className="overlay match-result-overlay"><section className="match-result" style={{"--winner-color":deckById(game.players[game.winner].heroId).color} as React.CSSProperties}><div className="match-result-art"><RemoteCardArt page={deckById(game.players[game.winner].heroId).heroPage} name={deckById(game.players[game.winner].heroId).name} priority/></div><div className="match-result-copy"><p>FIM DA PARTIDA</p><h2>{game.winner===0?"Vitória":"Derrota"}</h2><strong>{deckById(game.players[game.winner].heroId).name}</strong><span>venceu após {game.round} turnos.</span><div className="match-result-actions"><button className="gold" onClick={begin}>Revanche</button><button onClick={()=>setScreen("setup")}>Trocar decks</button><button onClick={()=>setScreen("menu")}>Menu</button></div></div></section></div>}'''
rep('app/page.tsx',old,new)

css='''/* Dedicated end-of-match presentation. */
.match-result-overlay{display:grid!important;place-items:center!important;padding:clamp(1rem,3vw,2.5rem)!important;background:radial-gradient(circle at 50% 35%,#081a22d9,#02070bea 68%)!important;z-index:900!important}
.match-result{--winner-color:#d7ae57;width:min(94vw,58rem);max-height:90dvh;display:grid;grid-template-columns:minmax(12rem,19rem) minmax(0,1fr);gap:clamp(1rem,3vw,2.8rem);align-items:center;padding:clamp(1rem,2.6vw,2rem);border:1px solid color-mix(in srgb,var(--winner-color) 70%,#e8d79b);border-radius:clamp(.7rem,1.4vw,1.2rem);background:linear-gradient(145deg,color-mix(in srgb,var(--winner-color) 13%,#0a1b22),#061017 60%);box-shadow:0 2rem 6rem #000d,0 0 3rem color-mix(in srgb,var(--winner-color) 22%,transparent);overflow:auto}
.match-result-art{display:grid;place-items:center;min-width:0}.match-result-art :is(img,canvas){display:block;width:min(100%,18rem)!important;height:auto!important;max-height:72dvh;object-fit:contain;border-radius:clamp(.5rem,1vw,.9rem);filter:drop-shadow(0 1.4rem 1.5rem #000c)}
.match-result-copy{min-width:0;display:flex;flex-direction:column;align-items:flex-start}.match-result-copy>p{margin:0 0 .5rem;color:#e7bd5c;font:800 clamp(.55rem,.8vw,.72rem) Arial;letter-spacing:.24em}.match-result-copy>h2{margin:0;font-size:clamp(2.8rem,7vw,6.4rem);line-height:.9;color:#fff;text-shadow:0 .3rem 1rem #000}.match-result-copy>strong{margin-top:clamp(.8rem,2vh,1.4rem);font-size:clamp(1.15rem,2.2vw,1.9rem);color:color-mix(in srgb,var(--winner-color) 80%,white)}.match-result-copy>span{margin-top:.3rem;color:#aebfc8;font-size:clamp(.85rem,1.2vw,1rem)}
.match-result-actions{display:flex;flex-wrap:wrap;gap:clamp(.45rem,.8vw,.75rem);margin-top:clamp(1.2rem,3vh,2rem)}.match-result-actions button{min-width:clamp(7rem,10vw,9rem);padding:clamp(.65rem,1vw,.9rem) clamp(.8rem,1.4vw,1.2rem);border:1px solid #ffffff24;background:#0d1b24;color:#eef5f5;text-transform:uppercase;font:800 clamp(.55rem,.72vw,.68rem) Arial;letter-spacing:.08em}
@media(max-width:680px){.match-result{grid-template-columns:1fr;text-align:center}.match-result-art :is(img,canvas){width:min(48vw,12rem)!important;max-height:38dvh}.match-result-copy{align-items:center}.match-result-copy>h2{font-size:clamp(2.6rem,15vw,4.8rem)}.match-result-actions{justify-content:center}}
'''
Path('app/match-result.css').write_text(css,encoding='utf-8')
lab=Path('app/lab.css'); text=lab.read_text(encoding='utf-8')
if '@import "./match-result.css";' not in text:
    text=text.replace('@import "./lab-interaction-responsive.css";\n','@import "./lab-interaction-responsive.css";\n@import "./match-result.css";\n')
lab.write_text(text,encoding='utf-8')
